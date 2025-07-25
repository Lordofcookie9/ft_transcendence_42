import Fastify from 'fastify';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import staticPlugin from '@fastify/static';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({
  logger: true,
  https: {
    key: fs.readFileSync(path.join(__dirname, '../cert/key.pem')),
    cert: fs.readFileSync(path.join(__dirname, '../cert/cert.pem')),
  },
});

const dbPromise = open({
  filename: path.join(__dirname, '../db/database.sqlite'),
  driver: sqlite3.Database,
});

fastify.register(staticPlugin, {
  root: path.join(__dirname, '../frontend'),
  prefix: '/',
});

// API to get counter by id
fastify.get('/api/count', async (request, reply) => {
  const id = Number(request.query.id || 1);
  const db = await dbPromise;
  const row = await db.get('SELECT value FROM counter WHERE id = ?', id);
  reply.send({ count: row?.value || 0 });
});

// API to increment counter by id
fastify.post('/api/increment', async (request, reply) => {
  const id = Number(request.query.id || 1);
  const db = await dbPromise;
  await db.run('UPDATE counter SET value = value + 1 WHERE id = ?', id);
  const row = await db.get('SELECT value FROM counter WHERE id = ?', id);
  reply.send({ count: row.value });
});


// DB Setup
fastify.ready().then(async () => {
  const db = await dbPromise;
  await db.exec('CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY, value INTEGER)');
  
  const row1 = await db.get('SELECT * FROM counter WHERE id = 1');
  if (!row1) await db.run('INSERT INTO counter (id, value) VALUES (1, 0)');

  const row2 = await db.get('SELECT * FROM counter WHERE id = 2');
  if (!row2) await db.run('INSERT INTO counter (id, value) VALUES (2, 0)');
});

// Start Server
fastify.listen({ port: 443, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Server running at ${address}`);
});

// Graceful shutdown
const closeGracefully = async (signal) => {
  fastify.log.info(`Received ${signal}. Closing Fastify...`);
  await fastify.close();
  process.exit(0);
};
process.on('SIGINT', closeGracefully);
process.on('SIGTERM', closeGracefully);
