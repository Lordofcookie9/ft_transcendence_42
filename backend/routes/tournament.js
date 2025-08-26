
// backend/routes/tournament.js
// Online Tournament routes with round-by-round random pairings and at most one BYE per round.
// - Only the current round is scheduled; when a round fully finishes, the next round is created randomly.
// - If the number of advancing players is odd, one random player receives a BYE (recorded as a finished match).
// - Final round auto-finishes the lobby when one player remains.
// - Compatible with game_rooms/matches schema for resolving winners from played rooms.

module.exports = function registerTournamentRoutes(fastify) {
  // Ensure tables exist (idempotent)
  (async () => {
    try {
      await fastify.db.run(`
        CREATE TABLE IF NOT EXISTS tournament_lobbies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          host_id INTEGER NOT NULL,
          size INTEGER NOT NULL CHECK (size BETWEEN 3 AND 8),
          status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','started','cancelled','finished')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          started_at DATETIME,
          FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      await fastify.db.run(`
        CREATE TABLE IF NOT EXISTS tournament_participants (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          lobby_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          alias TEXT NOT NULL,
          joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (lobby_id, user_id),
          FOREIGN KEY (lobby_id) REFERENCES tournament_lobbies(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      await fastify.db.run(`
        CREATE TABLE IF NOT EXISTS tournament_matches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          lobby_id INTEGER NOT NULL,
          round INTEGER NOT NULL,
          match_index INTEGER NOT NULL,
          p1_user_id INTEGER,
          p1_alias TEXT,
          p2_user_id INTEGER,
          p2_alias TEXT,
          room_id INTEGER,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','finished')),
          winner_user_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (lobby_id) REFERENCES tournament_lobbies(id) ON DELETE CASCADE,
          FOREIGN KEY (p1_user_id) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (p2_user_id) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE SET NULL
        )
      `);
    } catch (e) {
      fastify.log.error({ e }, 'Failed to ensure tournament tables');
    }
  })();

  // Utility: Fisher–Yates shuffle (in-place)
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  async function getAliasFor(fastify, lobbyId, userId) {
    if (!userId) return null;
    const row = await fastify.db.get(
      `SELECT alias FROM tournament_participants WHERE lobby_id = ? AND user_id = ?`,
      [lobbyId, userId]
    );
    return row && row.alias ? row.alias : null;
  }

  async function getTournamentState(fastify, lobbyId) {
    const lobby = await fastify.db.get(
      `SELECT id, host_id, size, status, started_at FROM tournament_lobbies WHERE id = ?`,
      [lobbyId]
    );
    if (!lobby) return null;

    const participants = await fastify.db.all(
      `SELECT user_id, alias FROM tournament_participants WHERE lobby_id = ? ORDER BY joined_at ASC`,
      [lobbyId]
    );

    const matches = await fastify.db.all(
      `SELECT * FROM tournament_matches WHERE lobby_id = ? ORDER BY round ASC, match_index ASC, id ASC`,
      [lobbyId]
    );

    let maxRound = -1;
    for (const m of matches) { if (m.round > maxRound) maxRound = m.round; }
    const rounds = Array.from({ length: Math.max(0, maxRound + 1) }, () => []);
    for (const m of matches) {
      if (m.round >= 0 && m.round < rounds.length) rounds[m.round].push(m);
    }
    return { lobby, participants, rounds };
  }

  // Determine winner_user_id from DB if not given (uses latest record of matches table for the room)
  async function computeWinnerUserId(fastify, m) {
    // BYE cases
    if (m.p1_user_id && !m.p2_user_id) return m.p1_user_id;
    if (!m.p1_user_id && m.p2_user_id) return m.p2_user_id;

    if (!m.room_id) return null;
    const room = await fastify.db.get(
      `SELECT id, host_id, guest_id FROM game_rooms WHERE id = ?`,
      [m.room_id]
    );
    if (!room) return null;

    const rec = await fastify.db.get(
      `SELECT host_score, guest_score
         FROM matches
        WHERE room_id = ?
        ORDER BY finished_at DESC, id DESC
        LIMIT 1`,
      [m.room_id]
    );
    if (!rec) return null;
    const hostScore = Number(rec.host_score);
    const guestScore = Number(rec.guest_score);
    if (!Number.isFinite(hostScore) || !Number.isFinite(guestScore) || hostScore === guestScore) return null;
    return hostScore > guestScore ? room.host_id : room.guest_id;
  }

  async function winnerFromScores(fastify, m, hostScore, guestScore) {
    if (!m || !m.room_id) return null;
    if (!Number.isFinite(hostScore) || !Number.isFinite(guestScore) || hostScore === guestScore) return null;
    const room = await fastify.db.get(`SELECT id, host_id, guest_id FROM game_rooms WHERE id = ?`, [m.room_id]);
    if (!room) return null;
    return (hostScore > guestScore) ? room.host_id : room.guest_id;
  }

  async function winnerFromSide(fastify, m, side) {
    if (!m || !m.room_id) return null;
    const room = await fastify.db.get(`SELECT id, host_id, guest_id FROM game_rooms WHERE id = ?`, [m.room_id]);
    if (!room) return null;
    if (side === 'host') return room.host_id || null;
    if (side === 'guest') return room.guest_id || null;
    return null;
  }

  // Seed round 0 randomly (with at most one BYE if odd)
  async function seedRoundZero(fastify, lobbyId) {
    const parts = await fastify.db.all(
      `SELECT user_id, alias FROM tournament_participants WHERE lobby_id = ? ORDER BY joined_at ASC`,
      [lobbyId]
    );
    const players = parts.map(p => ({ user_id: p.user_id, alias: p.alias }));
    shuffle(players);

    let idx = 0;
    let matchIdx = 0;

    // Pair as many as possible
    while (idx + 1 < players.length) {
      const p1 = players[idx++];
      const p2 = players[idx++];
      await fastify.db.run(
        `INSERT INTO tournament_matches
          (lobby_id, round, match_index, p1_user_id, p1_alias, p2_user_id, p2_alias, status)
         VALUES (?, 0, ?, ?, ?, ?, ?, 'pending')`,
        [lobbyId, matchIdx++, p1.user_id, p1.alias, p2.user_id, p2.alias]
      );
    }

    // If one remains → BYE (as a finished match in round 0)
    if (idx < players.length) {
      const bye = players[idx];
      await fastify.db.run(
        `INSERT INTO tournament_matches
          (lobby_id, round, match_index, p1_user_id, p1_alias, p2_user_id, p2_alias, status, winner_user_id)
         VALUES (?, 0, ?, ?, ?, NULL, NULL, 'finished', ?)`,
        [lobbyId, matchIdx, bye.user_id, bye.alias, bye.user_id]
      );
    }
  }

  // When an entire round finishes (and the next round does not yet exist), create the next round randomly,
  // with at most one BYE.
  async function tryScheduleNextRound(fastify, lobbyId) {
    const allMatches = await fastify.db.all(
      `SELECT * FROM tournament_matches WHERE lobby_id = ? ORDER BY round ASC, match_index ASC`,
      [lobbyId]
    );
    if (allMatches.length === 0) return;

    let maxRound = -1;
    for (const m of allMatches) if (m.round > maxRound) maxRound = m.round;
    if (maxRound < 0) return;

    const inRound = allMatches.filter(m => m.round === maxRound);
    if (inRound.length === 0) return;

    // If any in the round are not finished, we cannot schedule next
    if (inRound.some(m => m.status !== 'finished' || !m.winner_user_id)) return;

    // If next round already exists, nothing to do
    const hasNext = allMatches.some(m => m.round === maxRound + 1);
    if (hasNext) return;

    // Collect winners of this round
    const adv = [];
    for (const m of inRound) {
      const wid = m.winner_user_id;
      if (!wid) continue;
      let alias = null;
      if (m.p1_user_id === wid) alias = m.p1_alias;
      else if (m.p2_user_id === wid) alias = m.p2_alias;
      if (!alias) alias = await getAliasFor(fastify, lobbyId, wid);
      adv.push({ user_id: wid, alias: alias || null });
    }

    // If only one remains -> finish tournament
    if (adv.length <= 1) {
      await fastify.db.run(`UPDATE tournament_lobbies SET status='finished' WHERE id = ?`, [lobbyId]);
      return;
    }

    // Randomize next round entrants
    shuffle(adv);

    let matchIndex = 0;

    // If odd number of entrants: pick one random BYE (already shuffled -> pop last is random)
    if (adv.length % 2 === 1) {
      const bye = adv.pop();
      if (bye) {
        await fastify.db.run(
          `INSERT INTO tournament_matches
            (lobby_id, round, match_index, p1_user_id, p1_alias, p2_user_id, p2_alias, status, winner_user_id)
           VALUES (?, ?, ?, ?, ?, NULL, NULL, 'finished', ?)`,
          [lobbyId, maxRound + 1, matchIndex++, bye.user_id, bye.alias, bye.user_id]
        );
      }
    }

    // Pair the rest
    for (let i = 0; i + 1 < adv.length; i += 2) {
      const a = adv[i], b = adv[i + 1];
      await fastify.db.run(
        `INSERT INTO tournament_matches
          (lobby_id, round, match_index, p1_user_id, p1_alias, p2_user_id, p2_alias, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [lobbyId, maxRound + 1, matchIndex++, a.user_id, a.alias, b.user_id, b.alias]
      );
    }
  }

  // --- Routes ---

  // List waiting lobbies (lightweight directory)
  fastify.get('/api/tournament', async (req, reply) => {
    try {
      const rows = await fastify.db.all(`
        SELECT l.id, l.host_id, l.size, l.status, l.created_at, u.display_name AS host_name,
               COUNT(tp.id) AS count
          FROM tournament_lobbies l
          JOIN users u ON u.id = l.host_id
          LEFT JOIN tournament_participants tp ON tp.lobby_id = l.id
         WHERE l.status = 'waiting'
         GROUP BY l.id
         ORDER BY l.created_at DESC
      `);
      const result = rows.map(r => ({
        id: r.id,
        host_id: r.host_id,
        host_name: r.host_name,
        size: r.size,
        status: r.status,
        created_at: r.created_at,
        count: r.count,
        spots_left: Math.max(0, r.size - r.count)
      }));
      const me = req && req.user ? req.user.id : null;
      const myWaitingLobby = me ? result.find(r => Number(r.host_id) === Number(me)) : null;
      return reply.send({ ok: true, lobbies: result, my_waiting_lobby_id: myWaitingLobby ? myWaitingLobby.id : null });
    } catch (err) {
      req.log && req.log.error && req.log.error({ err }, 'list_lobbies_failed');
      return reply.code(500).send({ error: 'list_failed' });
    }
  });

  // Create lobby and auto-join host
  fastify.post('/api/tournament', { preValidation: [fastify.authenticate] }, async (req, reply) => {
    try {
      const body = req.body || {};
      const size = Number(body.size);
      const aliasMode = body.alias_mode;
      const alias = body.alias;
      const me = req.user.id;
      if (!Number.isInteger(size) || size < 3 || size > 8) {
        return reply.code(400).send({ error: 'size_must_be_3_to_8' });
      }

      let myAlias = '';
      if (aliasMode === 'username') {
        const row = await fastify.db.get(`SELECT display_name FROM users WHERE id = ?`, [me]);
        myAlias = (row && row.display_name) ? row.display_name : 'Player';
      } else if (aliasMode === 'custom') {
        if (!alias || !String(alias).trim()) return reply.code(400).send({ error: 'alias_required' });
        myAlias = String(alias).trim().slice(0, 40);
      } else {
        return reply.code(400).send({ error: 'alias_mode_invalid' });
      }

      await fastify.db.run('BEGIN');
      const insLobby = await fastify.db.run(
        `INSERT INTO tournament_lobbies (host_id, size, status) VALUES (?, ?, 'waiting')`,
        [me, size]
      );
      const lobbyId = insLobby.lastID;
      await fastify.db.run(
        `INSERT INTO tournament_participants (lobby_id, user_id, alias) VALUES (?, ?, ?)`,
        [lobbyId, me, myAlias]
      );
      await fastify.db.run('COMMIT');
      return reply.send({ ok: true, lobby_id: lobbyId });
    } catch (err) {
      try { await fastify.db.run('ROLLBACK'); } catch {}
      req.log.error({ err }, 'create_tournament_failed');
      return reply.code(500).send({ error: 'create_failed' });
    }
  });

  // Lobby snapshot
  fastify.get('/api/tournament/:id', async (req, reply) => {
    try {
      const lobbyId = Number(req.params.id);
      if (!lobbyId) return reply.code(400).send({ error: 'invalid_lobby_id' });

      const lobby = await fastify.db.get(
        `SELECT id, host_id, size, status, created_at, started_at FROM tournament_lobbies WHERE id = ?`,
        [lobbyId]
      );
      if (!lobby) return reply.code(404).send({ error: 'lobby_not_found' });

      const parts = await fastify.db.all(
        `SELECT tp.user_id, tp.alias, u.display_name
           FROM tournament_participants tp
           JOIN users u ON u.id = tp.user_id
          WHERE tp.lobby_id = ?
          ORDER BY tp.joined_at ASC`,
        [lobbyId]
      );
      const count = parts.length;
      const me = req && req.user ? req.user.id : null;
      const is_host = me ? Number(lobby.host_id) === Number(me) : false;
      const can_start = lobby.status === 'waiting' && count === lobby.size && is_host;

      // Only build state if not waiting
      const state = lobby.status !== 'waiting' ? await getTournamentState(fastify, lobbyId) : null;

      return reply.send({
        ok: true,
        lobby: {
          id: lobby.id, host_id: lobby.host_id, size: lobby.size,
          status: lobby.status, created_at: lobby.created_at, started_at: lobby.started_at
        },
        participants: parts,
        count,
        spots_left: Math.max(0, lobby.size - count),
        is_host, can_start,
        state
      });
    } catch (err) {
      req.log && req.log.error && req.log.error({ err }, 'failed_to_fetch_lobby');
      return reply.code(500).send({ error: 'failed_to_fetch_lobby' });
    }
  });

  // Join lobby
  fastify.post('/api/tournament/:id/join', { preValidation: [fastify.authenticate] }, async (req, reply) => {
    try {
      const lobbyId = Number(req.params.id);
      const body = req.body || {};
      const aliasMode = body.alias_mode;
      const alias = body.alias;
      const me = req.user.id;

      const lobby = await fastify.db.get(
        `SELECT id, host_id, size, status FROM tournament_lobbies WHERE id = ?`,
        [lobbyId]
      );
      if (!lobby) return reply.code(404).send({ error: 'lobby_not_found' });
      if (lobby.status !== 'waiting') return reply.code(400).send({ error: 'lobby_not_joinable' });

      const currentRow = await fastify.db.get(
        `SELECT COUNT(*) AS c FROM tournament_participants WHERE lobby_id = ?`, [lobbyId]
      );
      const current = currentRow && currentRow.c ? currentRow.c : 0;
      if (current >= lobby.size) return reply.code(400).send({ error: 'lobby_full' });

      const exists = await fastify.db.get(
        `SELECT id FROM tournament_participants WHERE lobby_id = ? AND user_id = ?`,
        [lobbyId, me]
      );
      if (exists) return reply.send({ ok: true, already_in: true });

      let myAlias = '';
      if (aliasMode === 'username') {
        const row = await fastify.db.get(`SELECT display_name FROM users WHERE id = ?`, [me]);
        myAlias = (row && row.display_name) ? row.display_name : 'Player';
      } else if (aliasMode === 'custom') {
        if (!alias || !String(alias).trim()) return reply.code(400).send({ error: 'alias_required' });
        myAlias = String(alias).trim().slice(0, 40);
      } else return reply.code(400).send({ error: 'alias_mode_invalid' });

      await fastify.db.run(
        `INSERT INTO tournament_participants (lobby_id, user_id, alias) VALUES (?, ?, ?)`,
        [lobbyId, me, myAlias]
      );
      return reply.send({ ok: true });
    } catch (err) {
      // Gracefully handle race: two rapid join attempts causing UNIQUE constraint
      const msg = (err && err.message) ? String(err.message) : '';
      const code = err && err.code ? String(err.code) : '';
      if (code === 'SQLITE_CONSTRAINT' || /UNIQUE constraint/i.test(msg)) {
        return reply.send({ ok: true, already_in: true });
      }
      req.log && req.log.error && req.log.error({ err }, 'join_lobby_failed');
      return reply.code(500).send({ error: 'join_failed' });
    }
  });

  // Start tournament: create ONLY round 0 randomly, with at most one BYE
  fastify.post('/api/tournament/:id/start', { preValidation: [fastify.authenticate] }, async (req, reply) => {
    try {
      const lobbyId = Number(req.params.id);
      const me = req.user.id;
      const lobby = await fastify.db.get(
        `SELECT id, host_id, size, status FROM tournament_lobbies WHERE id = ?`,
        [lobbyId]
      );
      if (!lobby) return reply.code(404).send({ error: 'lobby_not_found' });
      if (Number(lobby.host_id) !== Number(me)) return reply.code(403).send({ error: 'not_host' });
      if (lobby.status !== 'waiting') return reply.code(400).send({ error: 'already_started' });

      const parts = await fastify.db.all(
        `SELECT tp.user_id, tp.alias, u.display_name
           FROM tournament_participants tp
           JOIN users u ON u.id = tp.user_id
          WHERE tp.lobby_id = ?
          ORDER BY tp.joined_at ASC`,
        [lobbyId]
      );
      if (parts.length !== lobby.size) return reply.code(400).send({ error: 'not_full' });

      await fastify.db.run('BEGIN');
      await fastify.db.run(
        `UPDATE tournament_lobbies SET status='started', started_at=CURRENT_TIMESTAMP WHERE id = ?`,
        [lobbyId]
      );
      await seedRoundZero(fastify, lobbyId);
      await fastify.db.run('COMMIT');

      const state = await getTournamentState(fastify, lobbyId);
      return reply.send({ ok: true, state });
    } catch (err) {
      try { await fastify.db.run('ROLLBACK'); } catch {}
      req.log && req.log.error && req.log.error({ err }, 'start_lobby_failed');
      return reply.code(500).send({ error: 'start_failed' });
    }
  });

  // Create/get room for a tournament match; P1 must be host (left), P2 guest (right)
  fastify.post('/api/tournament/:id/match/:mid/room', { preValidation: [fastify.authenticate] }, async (req, reply) => {
    try {
      const lobbyId = Number(req.params.id);
      const matchId = Number(req.params.mid);
      const me = req.user.id;

      // Load the match
      const m = await fastify.db.get(
        `SELECT id, lobby_id, p1_user_id, p2_user_id, p1_alias, p2_alias, room_id, status
          FROM tournament_matches
          WHERE id = ? AND lobby_id = ?`,
        [matchId, lobbyId]
      );
      if (!m) return reply.code(404).send({ error: 'match_not_found' });

      // Must be one of the two players
      if (Number(m.p1_user_id) !== Number(me) && Number(m.p2_user_id) !== Number(me)) {
        return reply.code(403).send({ error: 'not_in_match' });
      }
      if (!m.p1_user_id || !m.p2_user_id) return reply.code(400).send({ error: 'opponent_missing' });
      if (!m.room_id) {
        // Guard with a short transaction so simultaneous calls don't create two rooms
        await fastify.db.run('BEGIN');
        const again = await fastify.db.get(`SELECT room_id FROM tournament_matches WHERE id = ? AND lobby_id = ?`, [matchId, lobbyId]);
        if (!again.room_id) {
          const ins = await fastify.db.run(
            `INSERT INTO game_rooms (host_id, status, mode) VALUES (?, 'pending', 'private_1v1')`,
            [me]
          );
          const roomId = ins.lastID;
            await fastify.db.run(
              `UPDATE tournament_matches SET room_id = ?, status='active' WHERE id = ?`,
              [roomId, matchId]
            );
          await fastify.db.run('COMMIT');
          return reply.send({ ok: true, room_id: roomId });
        } else {
          await fastify.db.run('COMMIT');
          return reply.send({ ok: true, room_id: again.room_id });
        }
      }

      return reply.send({ ok: true, room_id: roomId });
    } catch (err) {
      req.log?.error({ err }, 'join_match_room_failed');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });


  // Mark match complete; compute winner; when the entire round finishes, build the next round randomly.
  fastify.post('/api/tournament/:id/match/:mid/complete', async (req, reply) => {
    try {
      const lobbyId = Number(req.params.id);
      const matchId = Number(req.params.mid);
      const m = await fastify.db.get(
        `SELECT * FROM tournament_matches WHERE id = ? AND lobby_id = ?`,
        [matchId, lobbyId]
      );
      if (!m) return reply.code(404).send({ error: 'match_not_found' });

      const lobby = await fastify.db.get(`SELECT id, size, status FROM tournament_lobbies WHERE id = ?`, [lobbyId]);
      if (!lobby) return reply.code(404).send({ error: 'lobby_not_found' });
      if (lobby.status !== 'started') {
        return reply.send({ ok: true, state: await getTournamentState(fastify, lobbyId) });
      }

      const reqBody = req.body || {};
      let winnerUserId = m.winner_user_id;

      // Winner slot (p1/p2) explicit
      if (!winnerUserId && (reqBody.winner_slot === 'p1' || reqBody.winner_slot === 'p2')) {
        if (reqBody.winner_slot === 'p1' && m.p1_user_id) winnerUserId = m.p1_user_id;
        if (reqBody.winner_slot === 'p2' && m.p2_user_id) winnerUserId = m.p2_user_id;
      }

      // Winner side (host/guest) mapping through game_rooms
      if (!winnerUserId && (reqBody.winner_side === 'host' || reqBody.winner_side === 'guest')) {
        const viaSide = await winnerFromSide(fastify, m, reqBody.winner_side);
        if (viaSide) winnerUserId = viaSide;
      }

      // Scores p1/p2
      if (!winnerUserId) {
        const p1s = Number(reqBody.p1_score);
        const p2s = Number(reqBody.p2_score);
        if (Number.isFinite(p1s) && Number.isFinite(p2s) && p1s !== p2s) {
          winnerUserId = p1s > p2s ? m.p1_user_id : m.p2_user_id;
        }
      }
      // Scores host/guest → map via room
      if (!winnerUserId) {
        const hs = Number(reqBody.host_score);
        const gs = Number(reqBody.guest_score);
        if (Number.isFinite(hs) && Number.isFinite(gs) && hs !== gs) {
          const viaScores = await winnerFromScores(fastify, m, hs, gs);
          if (viaScores) winnerUserId = viaScores;
        }
      }

      // Fallback to DB-computed winner
      if (!winnerUserId) {
        winnerUserId = await computeWinnerUserId(fastify, m);
      }

      await fastify.db.run('BEGIN');
      if (winnerUserId && !(m.status === 'finished' && m.winner_user_id)) {
        await fastify.db.run(
          `UPDATE tournament_matches SET status='finished', winner_user_id=? WHERE id = ?`,
          [winnerUserId, matchId]
        );
      }
      await fastify.db.run('COMMIT');

      // Record into global matches / stats if this was an actual played room (not BYE) and not already recorded
      if (m.room_id && m.p1_user_id && m.p2_user_id) {
        try {
          const already = await fastify.db.get(`SELECT id FROM matches WHERE room_id = ? LIMIT 1`, [m.room_id]);
          if (!already) {
            const roomRow = await fastify.db.get(`SELECT host_id, guest_id FROM game_rooms WHERE id = ?`, [m.room_id]);
            if (roomRow && roomRow.host_id && roomRow.guest_id) {
              const reqBody = req.body || {};
              let hostScore = null; let guestScore = null;
              // Prefer explicit host_score / guest_score
              if (Number.isFinite(+reqBody.host_score) && Number.isFinite(+reqBody.guest_score)) {
                hostScore = +reqBody.host_score; guestScore = +reqBody.guest_score;
              } else if (Number.isFinite(+reqBody.p1_score) && Number.isFinite(+reqBody.p2_score)) {
                // Map p1/p2 to host/guest
                if (m.p1_user_id === roomRow.host_id) {
                  hostScore = +reqBody.p1_score; guestScore = +reqBody.p2_score;
                } else if (m.p2_user_id === roomRow.host_id) {
                  hostScore = +reqBody.p2_score; guestScore = +reqBody.p1_score;
                }
              }
              // Determine winner/loser for stats (already have winnerUserId)
              if (winnerUserId && roomRow.host_id && roomRow.guest_id) {
                const winner_id = winnerUserId;
                const loser_id = (winnerUserId === roomRow.host_id) ? roomRow.guest_id : roomRow.host_id;
                await fastify.db.run('BEGIN');
                try {
                  await fastify.db.run(
                    `INSERT INTO matches (room_id, mode, host_id, guest_id, winner_id, loser_id, host_score, guest_score, finished_at)
                     VALUES (?, 'tournament', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                    [m.room_id, roomRow.host_id, roomRow.guest_id, winner_id, loser_id, hostScore, guestScore]
                  );
                  // Update PvP stats
                  await fastify.db.run(`UPDATE users SET pvp_wins = pvp_wins + 1 WHERE id = ?`, [winner_id]);
                  await fastify.db.run(`UPDATE users SET pvp_losses = pvp_losses + 1 WHERE id = ?`, [loser_id]);
                  await fastify.db.run('COMMIT');
                } catch (e) {
                  try { await fastify.db.run('ROLLBACK'); } catch {}
                  fastify.log.error({ e }, 'failed_to_insert_tournament_match_record');
                }
              }
            }
          }
        } catch (e) {
          fastify.log.error({ e }, 'tournament_match_record_check_failed');
        }
      }

      // If all matches in this round are done and next round isn't created, schedule it
      await tryScheduleNextRound(fastify, lobbyId);

      // If the last (and only) advancing player remains, lobby will be marked finished above
      return reply.send({ ok: true, state: await getTournamentState(fastify, lobbyId) });
    } catch (err) {
      try { await fastify.db.run('ROLLBACK'); } catch {}
      req.log && req.log.error && req.log.error({ err }, 'complete_match_failed');
      return reply.code(500).send({ error: 'complete_match_failed' });
    }
  });
};
