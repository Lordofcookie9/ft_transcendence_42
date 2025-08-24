// Extracted WebSocket & liveRooms logic from server.js
const WebSocket = require('ws');

module.exports = function registerSockets(fastify) {
  // roomId -> { host: WebSocket|null, guest: WebSocket|null, hostAlias?: string, guestAlias?: string }
  const liveRooms = new Map();
  // lobbyId -> Set<WebSocket> (sockets in lobby or in any match from this tournament)
  const lobbyIndex = new Map();

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

  // Query params ?roomId=&role=&lobbyId= (your client uses ?role=left|right)
  function parseFromQuery(urlish) {
    try {
      const u = new URL(urlish, 'http://x');
      const qs = u.searchParams;
      const roomId = qs.get('roomId') || qs.get('room_id') || qs.get('room') || '';
      const role = qs.get('role') || qs.get('side') || '';
      const lobbyId = qs.get('lobbyId') || qs.get('lobby_id') || '';
      return { roomId, role, lobbyId };
    } catch { return { roomId: '', role: '', lobbyId: '' }; }
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

  // Broadcast tournament abort to everyone in a lobby (also closes sockets)
  function broadcastTournamentAbort(lobbyId, reason = 'player_disconnected') {
    const set = lobbyIndex.get(String(lobbyId));
    if (!set || set.size === 0) return 0;
    const payload = {
      type: 'tournament:aborted',
      reason,
      message: 'A player has left the tournament, you will be brought home.'
    };
    let sent = 0;
    for (const ws of set) { safeSend(ws, payload); sent++; }
    // Close to force navigation even if the client ignores the message
    for (const ws of set) { try { if (ws.readyState === WS_OPEN) ws.close(1000); } catch {} }
    try { fastify.log.warn({ lobbyId, sent }, 'broadcasted tournament abort'); } catch {}
    return sent;
  }

  // Expose for any internal use later (not required to call directly elsewhere)
  fastify.decorate('broadcastTournamentAbort', broadcastTournamentAbort);

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

  function notifyLeft(sock, whoLeftRole) {
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
    }

    // 3) Subprotocol fallback
    if ((!roomId || !role) && selectedProto) {
      const pres = parseFromSubprotocolToken(selectedProto);
      if (!roomId && pres.roomId) roomId = pres.roomId;
      if (!role && pres.role) role = pres.role;
    }

    role = normalizeRole(role || 'host');

    // If we know lobbyId already (lobby-only socket), index it now
    if (!roomId && lobbyId) {
      addToLobbyIndex(lobbyId, ws);
      fastify.log.info({ url: urlish, lobbyId }, 'WS lobby-only connected');
      ws.on('close', () => { removeFromLobbyIndex(ws); });
      return;
    }

    fastify.log.info({ url: urlish, roomId, role }, 'WS upgrade (raw ws)');

    if (!roomId) {
      try { ws.close(1008, 'missing room'); } catch {}
      return;
    }

    if (!liveRooms.has(roomId)) liveRooms.set(roomId, { host: null, guest: null });
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
        safeSend(entry.guest, msg);
        return;
      }
    });

    // -------- CLOSE HANDLER (private1v1 + tournament abort) --------
    ws.on('close', async () => {
      const cur = liveRooms.get(roomId);
      if (!cur) { removeFromLobbyIndex(ws); return; }

      const wasHost  = (cur.host  === ws);
      const wasGuest = (cur.guest === ws);

      if (wasHost)  cur.host  = null;
      if (wasGuest) cur.guest = null;

      try {
        // Always tell the remaining peer someone left (helps UI state)
        if (wasHost && cur.guest) notifyLeft(cur.guest, 'host');
        if (wasGuest && cur.host) notifyLeft(cur.host, 'guest');

        if (wasHost) {
          // Decide if this is a tournament room or a private 1v1
          let tournamentRow = null;
          try {
            tournamentRow = await fastify.db.get(
              `SELECT lobby_id FROM tournament_matches WHERE room_id = ? LIMIT 1`,
              [roomId]
            );
          } catch (e) {
            fastify.log.error({ e, roomId }, 'tournament lookup on host close failed');
          }

          if (tournamentRow && tournamentRow.lobby_id) {
            // ---- Tournament: abort and broadcast to EVERY participant (in lobby or in rooms) ----
            const lid = String(tournamentRow.lobby_id);
            broadcastTournamentAbort(lid, 'player_disconnected');
            fastify.log.info({ roomId, lobbyId: lid }, 'tournament aborted due to host leaving match');
          } else {
            // ---- Private 1v1: notify guest and kick home (as you already shipped) ----
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
