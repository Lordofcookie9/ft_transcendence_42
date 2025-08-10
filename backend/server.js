//BAKCEND NODE JS FASTIFY SQLITE
const dotenv = require('dotenv');
dotenv.config();

const Fastify = require('fastify');
const fs = require('fs');
const path = require('path');

const initDb = require('./db');
const registerUsers = require('./users');

const fastifyStatic = require('@fastify/static');

const fastify = Fastify({
  logger: true,
});

const start = async () => {
  const db = await initDb();

  fastify.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/',
  });

  fastify.register(fastifyStatic, {
    root: path.join(__dirname, 'uploads'),
    prefix: '/uploads/',
    decorateReply: false,
  });

  fastify.setNotFoundHandler((req, reply) => {
    const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf-8');
    reply.type('text/html').send(html);
  });

  fastify.decorate('db', db);

  // users.js sets up JWT + authenticate, routes, etc.
  await registerUsers(fastify);

  
  
  
  // ---- CHAT ----
  // Return public messages; if authenticated, include private messages sent by/to the current user.
  // Filter out messages from users you block OR who block you. We filter by resolved user_id and also by alias fallback.
  fastify.get('/api/chat', async (request, reply) => {
    try {
      let currentUserId = null;
      try {
        const authorized = await request.jwtVerify();
        currentUserId = authorized.id;
      } catch (err) {
        // Not authenticated; only show public messages (no blocking context available)
      }

      if (!currentUserId) {
        const publicMessages = await fastify.db.all(`
          SELECT 
            m.alias,
            m.message,
            m.timestamp,
            u.id AS user_id
          FROM messages m
          LEFT JOIN users u ON u.display_name = m.alias
          ORDER BY m.id ASC
        `);
        return publicMessages;
      }

      // Authenticated: include private messages involving the current user and tag them,
      // and exclude any messages from users in a blocking relationship with you.
      const rows = await fastify.db.all(`
        SELECT alias, message, timestamp, user_id FROM (
          -- Public chat
          SELECT 
            m.alias AS alias,
            m.message AS message,
            m.timestamp AS timestamp,
            u.id AS user_id
          FROM messages m
          LEFT JOIN users u ON u.display_name = m.alias

          UNION ALL

          -- Private chat visible only to the two participants
          SELECT
            su.display_name AS alias,
            ('<(private): ' || pm.message || '>') AS message,
            pm.timestamp AS timestamp,
            su.id AS user_id
          FROM private_messages pm
          JOIN users su ON su.id = pm.sender_id
          WHERE pm.sender_id = ? OR pm.recipient_id = ?
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

      // Get display_name from DB using authenticated user id
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
        [alias, message.trim()]
      );

      return { success: true };
    } catch (err) {
      request.log.error({ err }, 'Failed to save chat message');
      reply.code(500).send({ error: 'Failed to save message' });
    }
  });

  // Private chat: only sender and recipient will receive these via GET /api/chat
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

      // Validate recipient exists
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

  // Graceful shutdown
  const closeGracefully = async (signal) => {
    console.log(`Received ${signal}. Closing server...`);
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

start().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
