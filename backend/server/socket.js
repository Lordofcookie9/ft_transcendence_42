// Extracted WebSocket & liveRooms logic from server.js
const WebSocket = require('ws');

module.exports = function registerSockets(fastify) {
  // roomId -> { host: WebSocket|null, guest: WebSocket|null, hostAlias?: string, guestAlias?: string }
  const liveRooms = new Map();
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

  // Query params ?roomId=&role= (your client uses ?role=left|right)
  function parseFromQuery(urlish) {
    try {
      const u = new URL(urlish, 'http://x');
      const qs = u.searchParams;
      const roomId = qs.get('roomId') || qs.get('room_id') || qs.get('room') || '';
      const role = qs.get('role') || qs.get('side') || '';
      return { roomId, role };
    } catch { return { roomId: '', role: '' }; }
  }

  // Parse path — supports both /ws/game/<id> and /ws/room/<id>
  function parseFromPath(urlish) {
    const s = String(urlish || '');
    const m = s.match(/\/ws\/(?:game|room)\/(\d+)(?:\/(left|right|host|guest))?/i);
    if (m) return { roomId: m[1], role: m[2] || '' };
    return { roomId: '', role: '' };
  }

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

    // 1) Parse from path (/ws/game/<id> OR /ws/room/<id>)
    {
      const p = parseFromPath(urlish);
      roomId = p.roomId;
      role = p.role;
    }

    // 2) Fall back to query string
    if (!roomId || !role) {
      const q = parseFromQuery(urlish);
      if (!roomId) roomId = q.roomId;
      if (!role) role = q.role;
    }

    // 3) Fall back to subprotocol token
    if ((!roomId || !role) && selectedProto) {
      const pres = parseFromSubprotocolToken(selectedProto);
      if (!roomId && pres.roomId) roomId = pres.roomId;
      if (!role && pres.role) role = pres.role;
    }

    role = normalizeRole(role || 'host');

    fastify.log.info({ url: urlish, roomId, role }, 'WS upgrade (raw ws)');

    if (!roomId) {
      try { ws.close(1008, 'missing room'); } catch {}
      return;
    }

    if (!liveRooms.has(roomId)) liveRooms.set(roomId, { host: null, guest: null });
    const entry = liveRooms.get(roomId);

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

    // -------- CLOSE HANDLER with private1v1 behavior + leave notice --------
    ws.on('close', async () => {
      const cur = liveRooms.get(roomId);
      if (!cur) return;

      const wasHost  = (cur.host  === ws);
      const wasGuest = (cur.guest === ws);

      if (wasHost)  cur.host  = null;
      if (wasGuest) cur.guest = null;

      try {
        // Always tell the remaining peer someone left (helps UI state)
        if (wasHost && cur.guest) notifyLeft(cur.guest, 'host');
        if (wasGuest && cur.host) notifyLeft(cur.host, 'guest');

        // If the HOST left, decide if this room is a private1v1
        if (wasHost) {
          let isTournamentRoom = false;
          try {
            // If there is a tournament_match for this room_id, it's NOT a private1v1
            const tm = await fastify.db.get(
              `SELECT 1 AS x FROM tournament_matches WHERE room_id = ? LIMIT 1`,
              [roomId]
            );
            isTournamentRoom = !!tm;
          } catch (e) {
            fastify.log.error({ e, roomId }, 'private1v1 check failed (tournament lookup)');
            // If in doubt, we’ll still try to notify guest below.
          }

          const isPrivate1v1 = !isTournamentRoom;

          if (isPrivate1v1) {
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
          } else {
            try { fastify.log.info({ roomId }, 'host left tournament room — no p1v1 action'); } catch {}
          }
        }
      } finally {
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

  return { wss, liveRooms };
};
