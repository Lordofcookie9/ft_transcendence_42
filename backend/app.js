// Composed application server split from server.js
const dotenv = require('dotenv');
dotenv.config();
const Fastify = require('fastify');
const path = require('path');
const fs = require('fs');
const fastifyStatic = require('@fastify/static');
const initDb = require('./db');
const registerUsers = require('./users');
const registerSockets = require('./server/socket');
const registerChatRoutes = require('./routes/chat');
const registerGameRoutes = require('./routes/game');
const registerMetricsRoutes = require('./routes/metrics');
const registerPresenceRoutes = require('./routes/presence');
const registerTournamentRoutes = require('./routes/tournament');

async function start() {
  const fastify = Fastify({
    logger: true,
    ajv: { customOptions: { allowUnionTypes: true, coerceTypes: true } },
  });

  // DB & users
  const db = await initDb();
  fastify.decorate('db', db);
  await registerUsers(fastify); // sets up JWT/auth & /api/users*

  // Sockets
  const { wss, liveRooms } = registerSockets(fastify);
  fastify.decorate('wss', wss);
  fastify.decorate('liveRooms', liveRooms);

  // Routes
  registerChatRoutes(fastify);
  registerGameRoutes(fastify);
  registerMetricsRoutes(fastify);
  registerPresenceRoutes(fastify);
  registerTournamentRoutes(fastify);

  // Static & uploads
  fastify.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/',
  });
  fastify.register(fastifyStatic, {
    root: path.join(__dirname, 'uploads'),
    prefix: '/uploads/',
    decorateReply: false,
  });

  // SPA fallback
  fastify.setNotFoundHandler((req, reply) => {
    const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf-8');
    reply.type('text/html').send(html);
  });

  // Graceful shutdown
  const closeGracefully = async (signal) => {
    try { fastify.log.info(`Received ${signal}. Closing server...`); } catch{}
    try { fastify?.wss?.clients?.forEach((c) => { try { c.close(); } catch {} }); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', closeGracefully);
  process.on('SIGTERM', closeGracefully);

  // Listen
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    fastify.log.info('Server running at http://0.0.0.0:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

module.exports = { start };
