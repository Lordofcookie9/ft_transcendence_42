// Extracted WebSocket & liveRooms logic from server.js
const WebSocket = require('ws');

module.exports = function registerSockets(fastify) {
  // roomId -> { host: WebSocket|null, guest: WebSocket|null, hostAlias?: string, guestAlias?: string, gameOver?: boolean }
  const liveRooms = new Map();
  // lobbyId -> Set<WebSocket> (sockets in lobby or in any match from this tournament)
  const lobbyIndex = new Map(); // lobbyId -> Set<ws>
  const userIndex  = new Map(); // userId  -> Set<ws>

  function idxAdd(map, key, ws) {
    key = String(key);
    let set = map.get(key);
    if (!set) { set = new Set(); map.set(key, set); }
    set.add(ws);
  }
  function idxRemove(map, key, ws) {
    key = String(key);
    const set = map.get(key);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) map.delete(key);
  }

  const WS_OPEN = 1;

  // ---------------- helpers ----------------
  function safeSend(sock, obj) {
    try { if (sock && sock.readyState === WS_OPEN) sock.send(JSON.stringify(obj)); } catch {}
  }
  function normalizeRole(role) {
    const r = String(role || '').toLowerCase();
    if (r === 'left' || r === 'host') return 'host';
    if (r === 'right' || r === 'guest') return 'guest';
    return 'host';
  }

  // Accept a token like: room.38.role.left / room-38-role-left / r38.left
  function parseFromSubprotocolToken(proto) {
    const s = String(proto || '').trim();
    let m;
    if ((m = s.match(/^room[._-]?(\d+)[._-]role[._-]?(left|right)$/i))) {
      return { roomId: m[1], role: m[2].toLowerCase() };
    }
    if ((m = s.match(/^r(\d+)[._-](left|right)$/i))) {
      return { roomId: m[1], role: m[2].toLowerCase() };
    }
    return { roomId: '', role: '' };
  }

  // Query params ?roomId=&role=&lobbyId=&userId= (client uses ?role=left|right)
  function parseFromQuery(urlish) {
    try {
      const u = new URL(urlish, 'http://x');
      const qs = u.searchParams;
      const roomId  = qs.get('roomId')  || qs.get('room_id')  || qs.get('room') || '';
      const role    = qs.get('role')    || qs.get('side')     || '';
      const lobbyId = qs.get('lobbyId') || qs.get('lobby_id') || '';
      const userId  = qs.get('userId')  || qs.get('user_id')  || '';
      return { roomId, role, lobbyId, userId };
    } catch { return { roomId: '', role: '', lobbyId: '', userId: '' }; }

  }

  // Parse path — supports both /ws/game/<id> and /ws/room/<id>, optional /left|right
  function parseFromPath(urlish) {
    const s = String(urlish || '');
    const m = s.match(/\/ws\/(?:game|room)\/(\d+)(?:\/(left|right|host|guest))?/i);
    if (m) return { roomId: m[1], role: m[2] || '' };
    return { roomId: '', role: '' };
  }

  // Lobby index management
  function addToLobbyIndex(lobbyId, ws) {
    if (!lobbyId) return;
    const lid = String(lobbyId);
    if (!lobbyIndex.has(lid)) lobbyIndex.set(lid, new Set());
    lobbyIndex.get(lid).add(ws);
    ws.__lobbyId = lid;
  }
  function removeFromLobbyIndex(ws) {
    const lid = ws && ws.__lobbyId;
    if (!lid) return;
    const set = lobbyIndex.get(lid);
    if (set) {
      set.delete(ws);
      if (set.size === 0) lobbyIndex.delete(lid);
    }
    ws.__lobbyId = undefined;
  }

  // Broadcast tournament abort to everyone in a lobby + all user sockets (also closes lobby/match sockets)
  async function destroyTournamentLobby(lobbyId) {
    try {
      await fastify.db.run('BEGIN');
      await fastify.db.run(`DELETE FROM tournament_matches WHERE lobby_id = ?`, [lobbyId]);
      await fastify.db.run(`DELETE FROM tournament_participants WHERE lobby_id = ?`, [lobbyId]);
      await fastify.db.run(`DELETE FROM tournament_lobbies WHERE id = ?`, [lobbyId]);
      await fastify.db.run('COMMIT');
      try { fastify.log.info({ lobbyId }, 'tournament_lobby_destroyed'); } catch {}
    } catch (e) {
      try { await fastify.db.run('ROLLBACK'); } catch {}
      fastify.log.error({ e, lobbyId }, 'failed_to_destroy_tournament_lobby');
    }
  }

  async function broadcastTournamentAbort(lobbyId, reason = 'player_disconnected') {
    // 1) Mark tournament cancelled
    try {
      await fastify.db.run(
        `UPDATE tournament_lobbies
           SET status = 'cancelled'
         WHERE id = ?
           AND status IN ('waiting','started')`,
        [lobbyId]
      );
    } catch (e) {
      fastify.log.error({ e, lobbyId }, 'failed_to_mark_tournament_cancelled');
    }

    const msgText = (reason === 'inactive_timeout')
      ? 'the tounament has been inactive for 10 minutes. you will be brought back home'
      : 'a host left mid game, the tournament is canceled. You will be brought home';
    const payload = {
      type: 'tournament:aborted',
      reason,
      lobbyId: String(lobbyId),
      message: msgText
    };

    const sentSockets = new Set();
    let sent = 0;

    // 2) Notify anyone connected under this lobby (lobby + match pages)
    const lobbySet = lobbyIndex.get(String(lobbyId));
    if (lobbySet && lobbySet.size) {
      for (const ws of lobbySet) { safeSend(ws, payload); sent++; sentSockets.add(ws); }
      for (const ws of lobbySet) { try { if (ws.readyState === WS_OPEN) ws.close(1000); } catch {} }
    }

    // 3) Also notify all participants by userId (covers the leaver if they already switched pages)
    try {
      const rows = await fastify.db.all(
        `SELECT user_id FROM tournament_participants WHERE lobby_id = ?`,
        [lobbyId]
      );
      for (const r of rows) {
        const set = userIndex.get(String(r.user_id));
        if (!set) continue;
        for (const ws of set) {
          if (sentSockets.has(ws)) continue;
          safeSend(ws, payload);
          sent++;
        }
      }
    } catch (e) {
      fastify.log.error({ e, lobbyId }, 'failed_to_notify_participants_by_user');
    }

    try { fastify.log.warn({ lobbyId, sent }, 'broadcasted tournament abort'); } catch {}
    return sent;
  }

  fastify.decorate('broadcastTournamentAbort', broadcastTournamentAbort);
  fastify.decorate('destroyTournamentLobby', destroyTournamentLobby);

  // Notify both sides that the opponent is present (used right after a connect)
  function maybeNotifyBothPresent(roomId) {
    const entry = liveRooms.get(roomId);
    if (!entry || !entry.host || !entry.guest) return;

    // host sees guest
    safeSend(entry.host, {
      type: 'opponent:joined',
      role: 'guest',
      alias: entry.guestAlias || null
    });

    // guest sees host
    safeSend(entry.guest, {
      type: 'opponent:joined',
      role: 'host',
      alias: entry.hostAlias || null
    });

    try { fastify.log.info({ roomId }, 'both players connected'); } catch {}
  }

  function notifyLeft(sock, whoLeftRole, entry) {
    if (!sock) return;
    if (whoLeftRole === 'host') {
      if (entry && entry._sentHostLeft) return; if (entry) entry._sentHostLeft = true;
    } else if (whoLeftRole === 'guest') {
      if (entry && entry._sentGuestLeft) return; if (entry) entry._sentGuestLeft = true;
    }
    safeSend(sock, { type: 'opponent:left', role: whoLeftRole });
  }

  // ---------------- ws server ----------------
  const wss = new WebSocket.Server({ noServer: true });

  async function attachSocket(ws, request) {
    const hdrs = request.headers || {};
    const urlish = String(request.url || '');
    const protocols = (hdrs['sec-websocket-protocol'] || '').split(',').map(s => s.trim()).filter(Boolean);
    const selectedProto = protocols[0] || '';

    let roomId = '';
    let role = '';
    let lobbyId = '';
    let userId = '';

    // 1) Parse from path (/ws/game/<id> OR /ws/room/<id>)
    {
      const p = parseFromPath(urlish);
      roomId = p.roomId;
      role = p.role;
    }

    // 2) Query string (also allows ?lobbyId= for lobby-only sockets)
    {
      const q = parseFromQuery(urlish);
      if (!roomId) roomId = q.roomId;
      if (!role) role = q.role;
      if (!lobbyId) lobbyId = q.lobbyId;
      if (!userId) userId = q.userId;
    }

    // 3) Subprotocol fallback
    if ((!roomId || !role) && selectedProto) {
      const pres = parseFromSubprotocolToken(selectedProto);
      if (!roomId && pres.roomId) roomId = pres.roomId;
      if (!role && pres.role) role = pres.role;
    }

    role = normalizeRole(role || 'host');

    // Index by user if provided
    if (userId) {
      ws.__userId = String(userId);
      idxAdd(userIndex, ws.__userId, ws);
    }

    // If this is a user-only socket (global listener), keep it alive
    if (!roomId && !lobbyId && userId) {
      fastify.log.info({ url: urlish, userId }, 'WS user-only connected');
      ws.on('close', () => { if (ws.__userId) idxRemove(userIndex, ws.__userId, ws); });
      return;
    }

    // If we know lobbyId already (lobby-only socket), index it now
    if (!roomId && lobbyId) {
      addToLobbyIndex(lobbyId, ws);
      fastify.log.info({ url: urlish, lobbyId, userId: ws.__userId || null }, 'WS lobby-only connected');
      ws.on('close', () => {
        if (ws.__userId) idxRemove(userIndex, ws.__userId, ws);
        removeFromLobbyIndex(ws);
      });
      return;
    }

    fastify.log.info({ url: urlish, roomId, role, userId: ws.__userId || null }, 'WS upgrade (raw ws)');

    if (!roomId) {
      try { ws.close(1008, 'missing room'); } catch {}
      if (ws.__userId) idxRemove(userIndex, ws.__userId, ws);
      return;
    }

    if (!liveRooms.has(roomId)) liveRooms.set(roomId, { host: null, guest: null, gameOver: false, _sentHostLeft: false, _sentGuestLeft: false });
    const entry = liveRooms.get(roomId);

    // If this is a tournament match room, derive lobbyId and index this socket under that lobby
    if (!lobbyId) {
      try {
        const row = await fastify.db.get(
          `SELECT lobby_id FROM tournament_matches WHERE room_id = ? LIMIT 1`,
          [roomId]
        );
        if (row && row.lobby_id) {
          lobbyId = String(row.lobby_id);
          addToLobbyIndex(lobbyId, ws);
          fastify.log.info({ roomId, lobbyId }, 'indexed room socket under tournament lobby');
        }
      } catch (e) {
        fastify.log.error({ e, roomId }, 'failed_to_lookup_lobby_for_room');
      }
    } else {
      addToLobbyIndex(lobbyId, ws);
    }

    // Replace same-role socket on reconnect (don’t leave zombies)
    try {
      if (role === 'host'  && entry.host)  entry.host.close();
      if (role === 'guest' && entry.guest) entry.guest.close();
    } catch {}

    if (role === 'host') entry.host = ws;
    else entry.guest = ws;

    // If both sides present now, immediately inform each side so UI can start
    maybeNotifyBothPresent(roomId);

    // -------- message relay (kept minimal like your current code) --------
    ws.on('message', (data) => {
      let msg; try { msg = JSON.parse(String(data)); } catch { return; }

      // relay input/state/chat to the opposite side
      if (msg.type === 'input' || msg.type === 'state' || msg.type === 'chat') {
        const target = (role === 'host') ? entry.guest : entry.host;
        safeSend(target, msg);
        return;
      }

      // presence hello (alias)
      if (msg.type === 'hello' && msg.alias) {
        if (role === 'host') entry.hostAlias = msg.alias;
        else entry.guestAlias = msg.alias;

        // Forward hello to the opponent as before
        const target = (role === 'host') ? entry.guest : entry.host;
        safeSend(target, { type: 'hello', alias: msg.alias, role });

        // If the other side is already present, also (re)send opponent:joined with alias
        maybeNotifyBothPresent(roomId);
        return;
      }

      // host broadcasting gameover
      if (msg.type === 'gameover' && role === 'host') {
        entry.gameOver = true; // <-- mark finished so host leaving now won't cancel the tournament
        safeSend(entry.guest, msg);
        return;
      }
    });

    // -------- CLOSE HANDLER (private1v1 + tournament abort) --------
    ws.on('close', async () => {
      const cur = liveRooms.get(roomId);
      if (!cur) {
        if (ws.__userId) idxRemove(userIndex, ws.__userId, ws);
        removeFromLobbyIndex(ws);
        return;
      }

      const wasHost  = (cur.host  === ws);
      const wasGuest = (cur.guest === ws);

      if (wasHost)  cur.host  = null;
      if (wasGuest) cur.guest = null;

      try {
        // Decide paths first; only notify the remaining peer when we know we won't hard-cancel.
        if (wasHost) {
          // Is this a tournament room?
          let tournamentRow = null;
          try {
            tournamentRow = await fastify.db.get(
              `SELECT lobby_id, status, winner_user_id
                 FROM tournament_matches
                WHERE room_id = ?
                LIMIT 1`,
              [roomId]
            );
          } catch (e) {
            fastify.log.error({ e, roomId }, 'tournament lookup on host close failed');
          }
          if (tournamentRow && tournamentRow.lobby_id) {
            // If DB still shows "active" with no winner and we haven't seen gameOver yet,
            // wait a short grace to allow 'gameover' or the /complete call to land.
            let row2 = tournamentRow;
            const likelyActive = String(tournamentRow.status) === 'active'
              && (tournamentRow.winner_user_id == null)
              && !cur.gameOver;

            if (likelyActive) {
              await new Promise(r => setTimeout(r, 300));
              try {
                const re = await fastify.db.get(
                  `SELECT status, winner_user_id
                     FROM tournament_matches
                    WHERE room_id = ?
                    LIMIT 1`,
                  [roomId]
                );
                if (re) row2 = { ...row2, ...re };
              } catch (e) {
                fastify.log.error({ e, roomId }, 'recheck tournament match after grace failed');
              }
            }
            // Cancel ONLY if match is in-progress (active & no winner) AND we haven't seen gameOver yet
            const inProgress =
              String(row2?.status) === 'active' &&
              (row2?.winner_user_id == null) &&
              !cur.gameOver;

            if (inProgress) {
              const lid = String(tournamentRow.lobby_id);
              await broadcastTournamentAbort(lid, 'host_left_match');
              fastify.log.info({ roomId, lobbyId: lid }, 'tournament aborted due to host leaving in-progress match');
            } else {
              // Match is over (or just finished) — DO NOT cancel.
              if (cur.guest) notifyLeft(cur.guest, 'host', cur);
              fastify.log.info(
                { roomId, matchStatus: tournamentRow?.status, winner: tournamentRow?.winner_user_id, gameOverFlag: cur.gameOver },
                'host left but match is not in-progress — no tournament cancel'
              );
            }
          } else {
            // ---- Private 1v1: notify guest and kick home ----
            if (cur.guest && cur.guest.readyState === WS_OPEN) {
              safeSend(cur.guest, { type: 'info', message: 'host left. Going back home' });
              try { cur.guest.close(1000); } catch {}
            }
            try {
              await fastify.db.run(
                `UPDATE game_rooms SET status = 'finished' WHERE id = ? AND status != 'finished'`,
                [roomId]
              );
            } catch (e) {
              fastify.log.error({ e, roomId }, 'failed_to_mark_private1v1_finished');
            }
            try { fastify.log.info({ roomId }, 'p1v1_host_left_notify_sent'); } catch {}
          }
        }
      } finally {
        if (ws.__userId) idxRemove(userIndex, ws.__userId, ws);
        removeFromLobbyIndex(ws);
        if (!cur.host && !cur.guest) liveRooms.delete(roomId);
        fastify.log.info({ roomId, role, wasHost, wasGuest }, 'WS closed');
      }
    });
  }

  // Intercept HTTP Upgrade and hand it to ws only for /ws/*
  fastify.server.on('upgrade', (request, socket, head) => {
    if (!request.url || !request.url.startsWith('/ws/')) return;
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', attachSocket);

  return { wss, liveRooms, lobbyIndex };
};
