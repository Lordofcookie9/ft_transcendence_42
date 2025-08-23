// backend/routes/tournament.js
// Online Tournament routes with robust BYE propagation and safe winner evaluation.
// NOTE: We do NOT assume a 'finished_at' column in the 'matches' table.
// We only order by 'id DESC' when reading scores.

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

  function buildBracket(participants) {
    const N = participants.length;
    const rounds = Math.ceil(Math.log2(N));
    const size = 1 << rounds;
    const seeds = participants.slice();
    while (seeds.length < size) seeds.push(null); // pad BYEs
    const round0 = [];
    for (let i = 0; i < size; i += 2) {
      round0.push({ p1: seeds[i], p2: seeds[i + 1] });
    }
    return { rounds, size, round0 };
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
    const totalRounds = Math.max(1, Math.ceil(Math.log2(lobby.size || (participants ? participants.length : 1) || 1)));
    const rounds = Array.from({ length: totalRounds }, () => []);
    for (const m of matches) {
      if (m.round < rounds.length) rounds[m.round].push(m);
    }
    return { lobby, participants, rounds };
  }

  // Winner computation from the 'matches' table (latest row wins) without 'finished_at'
  async function computeWinnerUserId(fastify, m) {
    // BYEs:
    if (m.p1_user_id && !m.p2_user_id) return m.p1_user_id;
    if (!m.p1_user_id && m.p2_user_id) return m.p2_user_id;

    if (!m.room_id) return null;
    const room = await fastify.db.get(
      `SELECT id, host_id, guest_id FROM game_rooms WHERE id = ?`,
      [m.room_id]
    );
    if (!room) return null;

    // Read the latest match row (we assume higher id = later)
    const rec = await fastify.db.get(
      `SELECT host_score, guest_score
         FROM matches
        WHERE room_id = ?
        ORDER BY id DESC
        LIMIT 1`,
      [m.room_id]
    );
    if (!rec) return null;
    const hostScore = Number(rec.host_score);
    const guestScore = Number(rec.guest_score);
    if (!Number.isFinite(hostScore) || !Number.isFinite(guestScore) || hostScore === guestScore) return null;
    return hostScore > guestScore ? room.host_id : room.guest_id;
  }

  // Map (host_score, guest_score) to winner_user_id using game_rooms
  async function winnerFromScores(fastify, m, hostScore, guestScore) {
    if (!m || !m.room_id) return null;
    if (!Number.isFinite(hostScore) || !Number.isFinite(guestScore) || hostScore === guestScore) return null;
    const room = await fastify.db.get(`SELECT id, host_id, guest_id FROM game_rooms WHERE id = ?`, [m.room_id]);
    if (!room) return null;
    return (hostScore > guestScore) ? room.host_id : room.guest_id;
  }

  // Map 'host' | 'guest' to a concrete user id using game_rooms
  async function winnerFromSide(fastify, m, side) {
    if (!m || !m.room_id) return null;
    const room = await fastify.db.get(`SELECT id, host_id, guest_id FROM game_rooms WHERE id = ?`, [m.room_id]);
    if (!room) return null;
    if (side === 'host') return room.host_id || null;
    if (side === 'guest') return room.guest_id || null;
    return null;
  }

  // Propagate all finished winners through subsequent BYEs until stable
  async function propagateAll(fastify, lobbyId) {
    const lobby = await fastify.db.get(`SELECT id, size FROM tournament_lobbies WHERE id = ?`, [lobbyId]);
    if (!lobby) return;
    const totalRounds = Math.max(1, Math.ceil(Math.log2(lobby.size || 1)));

    let changed = true;
    let guards = 0;
    while (changed && guards++ < 10) {
      changed = false;
      const matches = await fastify.db.all(
        `SELECT * FROM tournament_matches WHERE lobby_id = ? ORDER BY round ASC, match_index ASC, id ASC`,
        [lobbyId]
      );
      for (const m of matches) {
        let winner = m.winner_user_id;
        if (!winner) {
          if ((m.p1_user_id && !m.p2_user_id) || (!m.p1_user_id && m.p2_user_id)) {
            winner = m.p1_user_id || m.p2_user_id;
          }
        }
        if (!winner) continue;

        const isFinal = m.round >= (totalRounds - 1);
        if (isFinal) continue;

        const nextRound = m.round + 1;
        const nextIndex = Math.floor(m.match_index / 2);
        const fillLeft  = (m.match_index % 2) === 0;
        const winnerAlias = await getAliasFor(fastify, lobbyId, winner);

        // fetch fresh each loop
        const next = await fastify.db.get(
          `SELECT * FROM tournament_matches WHERE lobby_id = ? AND round = ? AND match_index = ? LIMIT 1`,
          [lobbyId, nextRound, nextIndex]
        );

        if (!next) {
          await fastify.db.run(
            `INSERT INTO tournament_matches (lobby_id, round, match_index, p1_user_id, p1_alias, p2_user_id, p2_alias, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [lobbyId, nextRound, nextIndex,
             fillLeft ? winner : null, fillLeft ? winnerAlias : null,
             fillLeft ? null   : winner, fillLeft ? null         : winnerAlias]
          );
          changed = true;
          continue;
        }

        if (fillLeft && !next.p1_user_id) {
          await fastify.db.run(
            `UPDATE tournament_matches SET p1_user_id=?, p1_alias=? WHERE id = ?`,
            [winner, winnerAlias, next.id]
          );
          changed = true;
        } else if (!fillLeft && !next.p2_user_id) {
          await fastify.db.run(
            `UPDATE tournament_matches SET p2_user_id=?, p2_alias=? WHERE id = ?`,
            [winner, winnerAlias, next.id]
          );
          changed = true;
        }
      }
    }
  }

  // Create lobby and auto-join host
  fastify.post('/api/tournament', { preValidation: [fastify.authenticate] }, async (req, reply) => {
    try {
      const body = req.body || {};
      const size = body.size;
      const alias_mode = body.alias_mode;
      const alias = body.alias;
      const me = req.user.id;
      const n = Number(size);
      if (!Number.isInteger(n) || n < 3 || n > 8) return reply.code(400).send({ error: 'size_must_be_3_to_8' });
      let myAlias = '';
      if (alias_mode === 'username') {
        const row = await fastify.db.get(`SELECT display_name FROM users WHERE id = ?`, [me]);
        myAlias = (row && row.display_name) ? row.display_name : 'Player';
      } else if (alias_mode === 'custom') {
        if (!alias || !String(alias).trim()) return reply.code(400).send({ error: 'alias_required' });
        myAlias = String(alias).trim().slice(0, 40);
      } else return reply.code(400).send({ error: 'alias_mode_invalid' });
      await fastify.db.run('BEGIN');
      const insLobby = await fastify.db.run(
        `INSERT INTO tournament_lobbies (host_id, size, status) VALUES (?, ?, 'waiting')`,
        [me, n]
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

  // Lobby snapshot (+ bracket when started)
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
      const state = lobby.status !== 'waiting' ? await getTournamentState(fastify, lobbyId) : null;
      return reply.send({
        ok: true,
        lobby: { id: lobby.id, host_id: lobby.host_id, size: lobby.size, status: lobby.status, created_at: lobby.created_at, started_at: lobby.started_at },
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
      const alias_mode = body.alias_mode;
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
      if (alias_mode === 'username') {
        const row = await fastify.db.get(`SELECT display_name FROM users WHERE id = ?`, [me]);
        myAlias = (row && row.display_name) ? row.display_name : 'Player';
      } else if (alias_mode === 'custom') {
        if (!alias || !String(alias).trim()) return reply.code(400).send({ error: 'alias_required' });
        myAlias = String(alias).trim().slice(0, 40);
      } else return reply.code(400).send({ error: 'alias_mode_invalid' });
      await fastify.db.run(
        `INSERT INTO tournament_participants (lobby_id, user_id, alias) VALUES (?, ?, ?)`,
        [lobbyId, me, myAlias]
      );
      return reply.send({ ok: true });
    } catch (err) {
      req.log && req.log.error && req.log.error({ err }, 'join_lobby_failed');
      return reply.code(500).send({ error: 'join_failed' });
    }
  });

  // Start tournament (seed round 0) and propagate BYEs forward immediately
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
          ORDER BY RANDOM()`,
        [lobbyId]
      );
      if (parts.length !== lobby.size) return reply.code(400).send({ error: 'not_full' });
      const { round0 } = buildBracket(parts);
      await fastify.db.run('BEGIN');
      await fastify.db.run(
        `UPDATE tournament_lobbies SET status='started', started_at=CURRENT_TIMESTAMP WHERE id = ?`,
        [lobbyId]
      );
      for (let i = 0; i < round0.length; i++) {
        const p1 = round0[i].p1, p2 = round0[i].p2;
        const p1_id = p1 ? p1.user_id : null, p1_alias = p1 ? p1.alias : null;
        const p2_id = p2 ? p2.user_id : null, p2_alias = p2 ? p2.alias : null;
        let status = 'pending', winner_user_id = null;
        if (p1 && !p2) { status = 'finished'; winner_user_id = p1_id; }
        if (!p1 && p2) { status = 'finished'; winner_user_id = p2_id; }
        await fastify.db.run(
          `INSERT INTO tournament_matches (lobby_id, round, match_index, p1_user_id, p1_alias, p2_user_id, p2_alias, status, winner_user_id)
           VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?)`,
          [lobbyId, i, p1_id, p1_alias, p2_id, p2_alias, status, winner_user_id]
        );
      }
      await fastify.db.run('COMMIT');

      // Immediately propagate BYE winners so the next match (final in 3-player) is ready
      await propagateAll(fastify, lobbyId);

      const state = await getTournamentState(fastify, lobbyId);
      return reply.send({ ok: true, state });
    } catch (err) {
      try { await fastify.db.run('ROLLBACK'); } catch {}
      req.log && req.log.error && req.log.error({ err }, 'start_lobby_failed');
      return reply.code(500).send({ error: 'start_failed' });
    }
  });

  // Create/get private room for a match; first caller becomes host
  fastify.post('/api/tournament/:id/match/:mid/room', { preValidation: [fastify.authenticate] }, async (req, reply) => {
    try {
      const lobbyId = Number(req.params.id);
      const matchId = Number(req.params.mid);
      const me = req.user.id;
      const m = await fastify.db.get(
        `SELECT * FROM tournament_matches WHERE id = ? AND lobby_id = ?`,
        [matchId, lobbyId]
      );
      if (!m) return reply.code(404).send({ error: 'match_not_found' });
      if (m.status === 'finished') return reply.code(400).send({ error: 'match_finished' });
      if (Number(m.p1_user_id) !== me && Number(m.p2_user_id) !== me) {
        return reply.code(403).send({ error: 'not_in_match' });
      }
      if (!m.p1_user_id || !m.p2_user_id) return reply.code(400).send({ error: 'opponent_missing' });
      if (!m.room_id) {
        const ins = await fastify.db.run(
          `INSERT INTO game_rooms (host_id, status, mode) VALUES (?, 'pending', 'private_1v1')`,
          [me]
        );
        const roomId = ins.lastID;
        await fastify.db.run(
          `UPDATE tournament_matches SET room_id = ?, status='active' WHERE id = ?`,
          [roomId, matchId]
        );
        return reply.send({ ok: true, room_id: roomId });
      }
      return reply.send({ ok: true, room_id: m.room_id });
    } catch (err) {
      req.log && req.log.error && req.log.error({ err }, 'join_match_room_failed');
      return reply.code(500).send({ error: 'join_match_room_failed' });
    }
  });

  // Mark match complete, propagate winner to next round, and finish lobby if final
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

      const body = req.body || {};
      let winnerUserId = m.winner_user_id || null;

      // 1) Winner slot (p1/p2) has top priority because it maps directly to the bracket
      if (!winnerUserId && (body.winner_slot === 'p1' || body.winner_slot === 'p2')) {
        if (body.winner_slot === 'p1' && m.p1_user_id) winnerUserId = m.p1_user_id;
        if (body.winner_slot === 'p2' && m.p2_user_id) winnerUserId = m.p2_user_id;
      }

      // 2) Winner side (host/guest) if provided
      if (!winnerUserId && (body.winner_side === 'host' || body.winner_side === 'guest')) {
        const viaSide = await winnerFromSide(fastify, m, body.winner_side);
        if (viaSide) winnerUserId = viaSide;
      }

      // 3) Scores from p1/p2 or host/guest
      if (!winnerUserId) {
        const p1s = Number(body.p1_score);
        const p2s = Number(body.p2_score);
        if (Number.isFinite(p1s) && Number.isFinite(p2s) && p1s !== p2s) {
          winnerUserId = p1s > p2s ? m.p1_user_id : m.p2_user_id;
        }
      }
      if (!winnerUserId) {
        const hs = Number(body.host_score);
        const gs = Number(body.guest_score);
        if (Number.isFinite(hs) && Number.isFinite(gs) && hs !== gs) {
          const viaScores = await winnerFromScores(fastify, m, hs, gs);
          if (viaScores) winnerUserId = viaScores;
        }
      }

      // 4) Fallback to DB-computed winner (latest 'matches' row by id)
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

      // Propagate winner (and any BYE cascades) forward
      await propagateAll(fastify, lobbyId);

      // If the last round now has a winner, mark the lobby finished
      const state = await getTournamentState(fastify, lobbyId);
      const totalRounds = state ? state.rounds.length : 1;
      const finals = state ? state.rounds[totalRounds - 1] : [];
      const final = finals && finals[0];
      if (final && final.status === 'finished' && final.winner_user_id) {
        await fastify.db.run(`UPDATE tournament_lobbies SET status='finished' WHERE id = ?`, [lobbyId]);
      }

      return reply.send({ ok: true, state: await getTournamentState(fastify, lobbyId) });
    } catch (err) {
      try { await fastify.db.run('ROLLBACK'); } catch {}
      req.log && req.log.error && req.log.error({ err }, 'complete_match_failed');
      return reply.code(500).send({ error: 'complete_match_failed' });
    }
  });
};
