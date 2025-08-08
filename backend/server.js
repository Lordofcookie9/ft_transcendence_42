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

  await registerUsers(fastify);

  fastify.get('/api/chat', async (request, reply) => {
    try {
      const messages = await fastify.db.all('SELECT alias, message, timestamp FROM messages ORDER BY id ASC');
      return messages;
    } catch (err) {
      reply.code(500).send({ error: 'Failed to fetch messages' });
    }
  });

  fastify.post('/api/chat', async (request, reply) => {
  try {
    let alias = request.body.alias;
    const message = request.body.message;

    try {
      const user = await request.jwtVerify();
      alias = user.display_name;
    } catch (_) {}

    console.log("Chat message received:", { alias, message });

    if (!alias || !message) {
      return reply.code(400).send({ error: 'Missing alias or message' });
    }

    await fastify.db.run(
      'INSERT INTO messages (alias, message) VALUES (?, ?)',
      [alias, message]
    );

    return { success: true };
  } catch (err) {
    console.error("Failed to save chat message:", err);
    reply.code(500).send({ error: 'Failed to save message' });
  }
});

  fastify.get('/api/count', async (request, reply) => {
    const id = request.query.id;
    try {
      const row = await fastify.db.get('SELECT count FROM counters WHERE id = ?', [id]);
      return { count: row ? row.count : 0 };
    } catch (err) {
      reply.code(500).send({ error: 'Failed to get count' });
    }
  });

  fastify.post('/api/increment', async (request, reply) => {
    const id = request.query.id;
    try {
      await fastify.db.run(`
        INSERT INTO counters (id, count)
        VALUES (?, 1)
        ON CONFLICT(id) DO UPDATE SET count = count + 1
      `, [id]);

      const row = await fastify.db.get('SELECT count FROM counters WHERE id = ?', [id]);
      return { count: row.count };
    } catch (err) {
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
