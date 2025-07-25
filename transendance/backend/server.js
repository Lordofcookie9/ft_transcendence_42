import Fastify from 'fastify';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import staticPlugin from '@fastify/static';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPromise = open({
  filename: './db/database.sqlite',
  driver: sqlite3.Database,
});

const fastify = Fastify({
  logger: true,
  https: {
    key: fs.readFileSync('./cert/key.pem'),
    cert: fs.readFileSync('./cert/cert.pem'),
  }
});

await fastify.register(staticPlugin, {
  root: path.join(__dirname, '../frontend'),
  prefix: '/',
});

fastify.get('/api/count', async (req, reply) => {
  const db = await dbPromise;
  const row = await db.get('SELECT value FROM counter WHERE id = 1');
  reply.send({ count: row?.value || 0 });
});

fastify.post('/api/increment', async (req, reply) => {
  const db = await dbPromise;
  await db.run('UPDATE counter SET value = value + 1 WHERE id = 1');
  const row = await db.get('SELECT value FROM counter WHERE id = 1');
  reply.send({ count: row.value });
});

// Init DB table
fastify.ready().then(async () => {
  const db = await dbPromise;
  await db.exec('CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY, value INTEGER)');
  const row = await db.get('SELECT * FROM counter WHERE id = 1');
  if (!row) await db.run('INSERT INTO counter (id, value) VALUES (1, 0)');
});

fastify.listen({ port: 443, host: '0.0.0.0' });
