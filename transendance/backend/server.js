// backend/server.js
const Fastify = require('fastify');
const fs = require('fs');
const path = require('path');
const fastifyStatic = require('@fastify/static');
const db = require('./db');

const fastify = Fastify({
  logger: true,
  https: {
    key: fs.readFileSync(path.join(__dirname, '../cert/key.pem')),
    cert: fs.readFileSync(path.join(__dirname, '../cert/cert.pem'))
  }
});

// Serve frontend files
fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/',
});

// --- API Endpoints ---

fastify.get('/api/chat', async () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT alias, message, timestamp FROM messages ORDER BY id ASC', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
});

fastify.post('/api/chat', async (request, reply) => {
  const { alias, message } = request.body;
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO messages (alias, message) VALUES (?, ?)',
      [alias, message],
      function (err) {
        if (err) reject(err);
        else resolve({ success: true });
      }
    );
  });
});

fastify.get('/api/count', async (request, reply) => {
  const id = request.query.id;
  return new Promise((resolve, reject) => {
    db.get('SELECT count FROM counters WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve({ count: row ? row.count : 0 });
    });
  });
});

fastify.post('/api/increment', async (request, reply) => {
  const id = request.query.id;
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO counters (id, count)
       VALUES (?, 1)
       ON CONFLICT(id) DO UPDATE SET count = count + 1`,
      [id],
      function (err) {
        if (err) reject(err);
        else {
          db.get('SELECT count FROM counters WHERE id = ?', [id], (err, row) => {
            if (err) reject(err);
            else resolve({ count: row.count });
          });
        }
      }
    );
  });
});

// Fallback for SPA
fastify.setNotFoundHandler((req, reply) => {
  const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf-8');
  reply.type('text/html').send(html);
});

fastify.listen({ port: 443, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Server running at ${address}`);
});
