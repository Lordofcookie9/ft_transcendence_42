// Extracted WebSocket & liveRooms logic from server.js
const WebSocket = require('ws');

module.exports = function registerSockets(fastify) {
  // roomId -> { host: WebSocket|null, guest: WebSocket|null, hostAlias?: string, guestAlias?: string }
  const liveRooms = new Map();

  // helpers copied from the original file
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

  // --- WS: raw 'ws' server (noServer) ---------------------------------------
  const wss = new WebSocket.Server({ noServer: true });

  // Echo the FIRST subprotocol the client offered so ws.protocol is set
  wss.on('headers', (headers, req) => {
    const offered = (req.headers['sec-websocket-protocol'] || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    if (offered.length) {
      req._selectedProto = offered[0];
      headers.push('Sec-WebSocket-Protocol: ' + req._selectedProto);
    }
  });

  function attachSocket(ws, request) {
    const hdrs = request.headers || {};
    const urlish = request.url || '';

    // 1) From path (/ws/game/:id)
    let roomId = '';
    let role = '';
    const pathMatch = /^\/ws\/game\/(\d+)(?:[/?#]|$)/.exec(String(urlish));
    if (pathMatch) roomId = pathMatch[1];

    // 2) From query (?id=&role=)
    if (!roomId || !role) {
      try {
        const u = new URL(String(urlish), 'http://localhost');
        const id = (u.searchParams.get('id') || '').trim();
        const r  = (u.searchParams.get('role') || '').trim();
        if (!roomId && id) roomId = id;
        if (!role && r) role = r;
      } catch {}
    }

    // 3) From proxy-forwarded original URI headers (if present)
    if (!roomId || !role) {
      for (const key of ['x-original-url','x-forwarded-uri','x-request-uri']) {
        const v = hdrs[key];
        if (!v) continue;
        try {
          const u = new URL(String(v), 'http://localhost');
          const id = (u.searchParams.get('id') || '').trim();
          const r  = (u.searchParams.get('role') || '').trim();
          if (!roomId && id) roomId = id;
          if (!role && r) role = r;
        } catch {}
        if (roomId && role) break;
      }
    }

    // 4) From the selected WS subprotocol (survives proxies)
    const offered = String((request.headers || {})['sec-websocket-protocol'] || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    const selectedProto = ws.protocol || request._selectedProto || offered[0] || '';
    if ((!roomId || !role) && selectedProto) {
      const pres = parseFromSubprotocolToken(selectedProto);
      if (!roomId && pres.roomId) roomId = pres.roomId;
      if (!role && pres.role) role = pres.role;
    }

    role = normalizeRole(role || 'host');

    fastify.log.info({
      url: urlish,
      roomId,
      role,
      selectedProto: ws.protocol || '',
      protoHdr: hdrs['sec-websocket-protocol'] || '',
      hdrsKeys: Object.keys(hdrs || {}),
    }, 'WS upgrade (raw ws)');

    if (!roomId) {
      try { ws.close(1008, 'missing room'); } catch {}
      return;
    }

    if (!liveRooms.has(roomId)) liveRooms.set(roomId, { host: null, guest: null });
    const entry = liveRooms.get(roomId);

    // Replace same-role socket on reconnect
    try {
      if (role === 'host'  && entry.host)  entry.host.close();
      if (role === 'guest' && entry.guest) entry.guest.close();
    } catch {}

    if (role === 'host') entry.host = ws;
    else entry.guest = ws;

    const safeSend = (sock, obj) => {
      try { if (sock && sock.readyState === 1) sock.send(JSON.stringify(obj)); } catch {}
    };

    ws.on('message', (data) => {
      let msg; try { msg = JSON.parse(String(data)); } catch { return; }

      // gameplay streams
      if (msg.type === 'input' && role === 'guest') {
        safeSend(entry.host, msg); return;
      }
      if (msg.type === 'state' && role === 'host') {
        safeSend(entry.guest, msg); return;
      }

      // presence
      if (msg.type === 'hello' && msg.alias) {
        if (role === 'host') entry.hostAlias = msg.alias;
        else entry.guestAlias = msg.alias;
        const target = (role === 'host') ? entry.guest : entry.host;
        safeSend(target, { type: 'hello', alias: msg.alias, role });
        return;
      }

      // end-of-game broadcast from host
      if (msg.type === 'gameover' && role === 'host') {
        safeSend(entry.guest, msg); return;
      }
    });

    ws.on('close', () => {
      const cur = liveRooms.get(roomId);
      if (!cur) return;
      if (cur.host  === ws) cur.host  = null;
      if (cur.guest === ws) cur.guest = null;
      if (!cur.host && !cur.guest) liveRooms.delete(roomId);
      fastify.log.info({ roomId, role }, 'WS closed');
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
