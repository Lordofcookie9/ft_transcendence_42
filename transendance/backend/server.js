import Fastify from 'fastify';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import staticPlugin from '@fastify/static';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// Handle __dirname with ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Fastify instance with HTTPS config
const fastify = Fastify({
  logger: true,
  https: {
    key: fs.readFileSync(path.join(__dirname, '../cert/key.pem')),
    cert: fs.readFileSync(path.join(__dirname, '../cert/cert.pem')),
  },
});

// SQLite setup
const dbPromise = open({
  filename: path.join(__dirname, '../db/database.sqlite'),
  driver: sqlite3.Database,
});

// Serve static frontend (index.html, tailwind.css, etc.)
fastify.register(staticPlugin, {
  root: path.join(__dirname, '../frontend'),
  prefix: '/',
});

// API route: Get current count
fastify.get('/api/count', async (request, reply) => {
  const db = await dbPromise;
  const row = await db.get('SELECT value FROM counter WHERE id = 1');
  reply.send({ count: row?.value || 0 });
});

// API route: Increment count
fastify.post('/api/increment', async (request, reply) => {
  const db = await dbPromise;
  await db.run('UPDATE counter SET value = value + 1 WHERE id = 1');
  const row = await db.get('SELECT value FROM counter WHERE id = 1');
  reply.send({ count: row.value });
});

// Ensure DB is initialized
fastify.ready().then(async () => {
  const db = await dbPromise;
  await db.exec('CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY, value INTEGER)');
  const row = await db.get('SELECT * FROM counter WHERE id = 1');
  if (!row) await db.run('INSERT INTO counter (id, value) VALUES (1, 0)');
});

// Start server
fastify.listen({ port: 443, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Server running at ${address}`);
});

// Graceful shutdown support
const closeGracefully = async (signal) => {
  fastify.log.info(`Received ${signal}. Closing Fastify...`);
  await fastify.close();
  process.exit(0);
};

process.on('SIGINT', closeGracefully);  // Ctrl+C
process.on('SIGTERM', closeGracefully); // docker stop
