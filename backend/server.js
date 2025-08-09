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
  // Return messages with resolved user_id (by display_name)
  fastify.get('/api/chat', async (request, reply) => {
    try {
      const messages = await fastify.db.all(`
        SELECT 
          m.alias,
          m.message,
          m.timestamp,
          u.id AS user_id
        FROM messages m
        LEFT JOIN users u ON u.display_name = m.alias
        ORDER BY m.id ASC
      `);
      return messages;
    } catch (err) {
      request.log.error(err);
      reply.code(500).send({ error: 'Failed to fetch messages' });
    }
  });

  // Only logged-in users may post; alias comes from JWT user
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
