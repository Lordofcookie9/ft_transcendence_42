// BACKEND NODE JS FASTIFY SQLITE
const dotenv = require('dotenv');
dotenv.config();

const Fastify = require('fastify');
const fs = require('fs');
const WebSocket = require('ws');
const path = require('path');
const initDb = require('./db');
const registerUsers = require('./users');
const fastifyStatic = require('@fastify/static'); // serve / and /uploads

const fastify = Fastify({
  logger: true,
  ajv: { customOptions: { allowUnionTypes: true, coerceTypes: true } },
});

const start = async () => {
  const db = await initDb();
  fastify.decorate('db', db);

  // Capture the original URL/params BEFORE any quirks
  fastify.addHook('onRequest', (req, _reply, done) => {
    try {
      const original = req.raw?.url || req.url || '';
      req._originalUrl = original;
      if (req.raw) req.raw._originalUrl = original;
      if (req.params) req._originalParams = { ...req.params };
    } catch {}
    done();
  });

  // In-memory sockets: roomId -> { host, guest }
  const liveRooms = new Map();

  // --- helpers ---------------------------------------------------------------
  function normalizeRole(role) {
    const r = String(role || '').toLowerCase();
    return (r === 'right' || r === 'guest') ? 'guest' : 'host';
  }

  // Accept a single token like: room.38.role.left / room-38-role-left / r38.left
  function parseFromSubprotocolToken(proto) {
    const s = String(proto || '').trim();
    let m;
    if ((m = s.match(/^room[._-]?(\d+)[._-]role[._-]?(left|right)$/i))) {
      return { roomId: m[1], role: m[2].toLowerCase() };
    }
    if ((m = s.match(/^r(\d+)[._-](left|right)$/i))) {
      return { roomId: m[1], role: m[2].toLowerCase() };
    }
    // (legacy key=value won't realistically appear in a subprotocol token)
    return { roomId: '', role: '' };
  }

  // --- WS: raw 'ws' server (noServer) ---------------------------------------
  const wss = new WebSocket.Server({
    noServer: true,
  });

  // Echo the FIRST subprotocol the client offered so ws.protocol is set
  wss.on('headers', (headers, req) => {
    const offered = (req.headers['sec-websocket-protocol'] || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
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

    // guest -> host: input ; host -> guest: state
    ws.on('message', (data) => {
      let msg; try { msg = JSON.parse(String(data)); } catch { return; }

      // --- gameplay streams ---
      if (msg.type === 'input' && role === 'guest') {
        safeSend(entry.host, msg);
        return;
      }
      if (msg.type === 'state' && role === 'host') {
        safeSend(entry.guest, msg);
        return;
      }

      // --- presence: who am I? ---
      if (msg.type === 'hello' && msg.alias) {
        if (role === 'host') entry.hostAlias = msg.alias;
        else entry.guestAlias = msg.alias;

        // echo to the opposite side so they can update the nameplate
        const target = (role === 'host') ? entry.guest : entry.host;
        safeSend(target, { type: 'hello', alias: msg.alias, role });
        return;
      }

      // --- end-of-game broadcast from host ---
      if (msg.type === 'gameover' && role === 'host') {
        safeSend(entry.guest, msg);
        return;
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
    console.log('[upgrade] url=', request.url, 'protoHdr=', request.headers['sec-websocket-protocol'] || '');
    if (!request.url || !request.url.startsWith('/ws/')) return;
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', attachSocket);

  // users.js sets up JWT + authenticate, routes, etc.
  await registerUsers(fastify);

  // ---- CHAT ----
  fastify.get('/api/chat', async (request, reply) => {
    try {
      let currentUserId = null;
      try {
        const authorized = await request.jwtVerify();
        currentUserId = authorized.id;
      } catch {}

      const twoHoursAgo = `datetime('now','-2 hours')`;

      if (!currentUserId) {
        const publicMessages = await fastify.db.all(`
          SELECT 
            m.alias,
            m.message,
            m.timestamp,
            u.id AS user_id
          FROM messages m
          LEFT JOIN users u ON u.display_name = m.alias
          WHERE m.timestamp >= ${twoHoursAgo}
          ORDER BY m.id ASC
        `);
        return publicMessages;
      }

      const rows = await fastify.db.all(`
        SELECT alias, message, timestamp, user_id FROM (
          SELECT 
            m.alias AS alias,
            m.message AS message,
            m.timestamp AS timestamp,
            u.id AS user_id
          FROM messages m
          LEFT JOIN users u ON u.display_name = m.alias
          WHERE m.timestamp >= ${twoHoursAgo}

          UNION ALL

          SELECT
            su.display_name AS alias,
            ('<(private): ' || pm.message || '>') AS message,
            pm.timestamp AS timestamp,
            su.id AS user_id
          FROM private_messages pm
          JOIN users su ON su.id = pm.sender_id
          WHERE (pm.sender_id = ? OR pm.recipient_id = ?)
            AND pm.timestamp >= ${twoHoursAgo}
        )
        WHERE NOT EXISTS (
          SELECT 1 FROM friends f
          WHERE f.user_id = ? AND f.friend_id = user_id
            AND f.status IN ('blocking','blocked')
        )
        AND NOT EXISTS (
          SELECT 1
          FROM friends f2
          JOIN users u2 ON u2.id = f2.friend_id
          WHERE f2.user_id = ?
            AND f2.status IN ('blocking','blocked')
            AND u2.display_name = alias
        )
        ORDER BY datetime(timestamp) ASC
      `, [currentUserId, currentUserId, currentUserId, currentUserId]);

      return rows;
    } catch (err) {
      request.log.error(err);
      reply.code(500).send({ error: 'Failed to fetch messages' });
    }
  });

  fastify.post('/api/chat', { preValidation: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { message } = request.body || {};
      if (!message || !message.trim()) {
        return reply.code(400).send({ error: 'Missing alias or message' });
      }

      const normalized = message.trim();
      if (normalized.length > 1000) {
        return reply.code(403).send({ error: 'Message must be under 1000 characters long' });
      }

      const row = await fastify.db.get(
        'SELECT display_name FROM users WHERE id = ?',
        [request.user.id]
      );
      const alias = row?.display_name;

      if (!alias) {
        return reply.code(400).send({ error: 'Invalid user' });
      }

      await fastify.db.run(
        'INSERT INTO messages (alias, message) VALUES (?, ?)',
        [alias, normalized]
      );

      return { success: true };
    } catch (err) {
      request.log.error({ err }, 'Failed to save chat message');
      reply.code(500).send({ error: 'Failed to save message' });
    }
  });

  fastify.post('/api/chat/private', { preValidation: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { recipient_id, message } = request.body || {};
      if (!recipient_id || !message || !String(message).trim()) {
        return reply.code(400).send({ error: 'recipient_id and message are required' });
      }
      const senderId = request.user.id;

      if (Number(recipient_id) === Number(senderId)) {
        return reply.code(400).send({ error: 'Cannot send a private message to yourself' });
      }

      const rec = await fastify.db.get('SELECT id FROM users WHERE id = ?', [recipient_id]);
      if (!rec) {
        return reply.code(404).send({ error: 'Recipient not found' });
      }

      await fastify.db.run(
        'INSERT INTO private_messages (sender_id, recipient_id, message) VALUES (?, ?, ?)',
        [senderId, recipient_id, String(message).trim()]
      );

      return { success: true };
    } catch (err) {
      request.log.error({ err }, 'Failed to save private chat message');
      reply.code(500).send({ error: 'Failed to send private message' });
    }
  });

  fastify.post('/api/game/invite', { preValidation: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { recipient_id } = request.body || {};
      if (!recipient_id) return reply.code(400).send({ error: 'recipient_id is required' });
      if (recipient_id === request.user.id) return reply.code(400).send({ error: 'Cannot invite yourself' });

      const rec = await fastify.db.get(`SELECT id FROM users WHERE id = ?`, [recipient_id]);
      if (!rec) return reply.code(404).send({ error: 'Recipient not found' });

      const ins = await fastify.db.run(
        `INSERT INTO game_rooms (host_id, status) VALUES (?, 'pending')`,
        [request.user.id]
      );
      const roomId = ins.lastID;

      await fastify.db.run(
        `INSERT INTO private_messages (sender_id, recipient_id, message)
         VALUES (?, ?, ?)`,
        [request.user.id, recipient_id, `<(invite):${roomId}>`]
      );

      return reply.send({ room_id: roomId });
    } catch (err) {
      request.log.error({ err }, 'Failed to create game invite');
      return reply.code(500).send({ error: 'Failed to create invite' });
    }
  });

  fastify.post('/api/game/room/:id/join', { preValidation: [fastify.authenticate] }, async (request, reply) => {
    try {
      const roomId = Number(request.params.id);
      const me = request.user.id;

      const room = await fastify.db.get(`
        SELECT gr.*, hu.display_name AS host_alias, gu.display_name AS guest_alias
        FROM game_rooms gr
        JOIN users hu ON hu.id = gr.host_id
        LEFT JOIN users gu ON gu.id = gr.guest_id
        WHERE gr.id = ?
      `, [roomId]);

      if (!room) return reply.code(404).send({ error: 'Room not found' });

      if (room.host_id === me) {
        if (room.status === 'pending') {
          await fastify.db.run(`UPDATE game_rooms SET status = 'active' WHERE id = ?`, [roomId]);
        }
        return reply.send({
          ok: true, role: 'left', room_id: roomId,
          host_alias: room.host_alias, guest_alias: room.guest_alias || null
        });
      }

      if (room.guest_id && room.guest_id !== me) {
        return reply.code(409).send({ error: 'Room already has a guest' });
      }

      if (!room.guest_id) {
        await fastify.db.run(`UPDATE game_rooms SET guest_id = ?, status = 'active' WHERE id = ?`, [me, roomId]);
      }

      const meAliasRow = await fastify.db.get(`SELECT display_name FROM users WHERE id = ?`, [me]);
      return reply.send({
        ok: true, role: 'right', room_id: roomId,
        host_alias: room.host_alias,
        guest_alias: meAliasRow?.display_name || room.guest_alias || null
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to join room');
      return reply.code(500).send({ error: 'Failed to join match' });
    }
  });

  // ---- COUNTER ----
  fastify.get('/api/count', async (request, reply) => {
    const id = request.query.id;
    try {
      const row = await fastify.db.get('SELECT count FROM counters WHERE id = ?', [id]);
      return { count: row ? row.count : 0 };
    } catch (err) {
      request.log.error(err);
      reply.code(500).send({ error: 'Failed to get count' });
    }
  });

  fastify.post('/api/increment', async (request, reply) => {
    const id = request.query.id;
    try {
      await fastify.db.run(
        `
        INSERT INTO counters (id, count)
        VALUES (?, 1)
        ON CONFLICT(id) DO UPDATE SET count = count + 1
        `,
        [id]
      );

      const row = await fastify.db.get('SELECT count FROM counters WHERE id = ?', [id]);
      return { count: row.count };
    } catch (err) {
      request.log.error(err);
      reply.code(500).send({ error: 'Failed to increment counter' });
    }
  });

  // --- STATIC (after routes & WS) ---
  fastify.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/',
  });

  fastify.register(fastifyStatic, {
    root: path.join(__dirname, 'uploads'),
    prefix: '/uploads/',
    decorateReply: false,
  });

  // SPA fallback LAST
  fastify.setNotFoundHandler((req, reply) => {
    const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf-8');
    reply.type('text/html').send(html);
  });

  // Graceful shutdown
  const closeGracefully = async (signal) => {
    console.log(`Received ${signal}. Closing server...`);
    try { wss.clients.forEach((c) => { try { c.close(); } catch {} }); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', closeGracefully);
  process.on('SIGTERM', closeGracefully);

  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    fastify.log.info('Server running at http://0.0.0.0:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start().catch(err => {
  fastify.log.error(err);
  process.exit(1);
});
