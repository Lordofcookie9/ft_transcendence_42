// server.js - Fastify + Node.js backend (HTTPS, no TypeScript)

const fs = require('fs');
const path = require('path');
const Fastify = require('fastify');
const fastifyStatic = require('@fastify/static');

// ✅ HTTPS configuration
const fastify = Fastify({
  logger: true,
  https: {
    key: fs.readFileSync(path.join(__dirname, './cert/key.pem')),
    cert: fs.readFileSync(path.join(__dirname, './cert/cert.pem')),

  },
});

// ✅ Serve static files from ./public
fastify.register(fastifyStatic, {
  root: path.join(__dirname, './public'),
  prefix: '/',
});

// --- Example APIs ---
let countStore = {};
const messages = [];

fastify.get('/api/count', async (request, reply) => {
  const id = request.query.id;
  const count = countStore[id] || 0;
  return { count };
});

fastify.post('/api/increment', async (request, reply) => {
  const id = request.query.id;
  countStore[id] = (countStore[id] || 0) + 1;
  return { count: countStore[id] };
});

fastify.get('/api/chat', async () => {
  return messages;
});

fastify.post('/api/chat', async (request, reply) => {
  const { alias, message } = request.body;
  messages.push({ alias, message });
  return { success: true };
});

// ✅ Catch-all route for SPA routing
fastify.setNotFoundHandler((req, reply) => {
  const indexPath = path.join(__dirname, './public/index.html');
  const html = fs.readFileSync(indexPath, 'utf-8');
  reply.type('text/html').send(html);
});

// ✅ Start server on HTTPS (port 443)
fastify.listen({ port: 443, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Server listening at ${address}`);
});
