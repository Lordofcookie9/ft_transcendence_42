import Fastify from 'fastify';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import staticPlugin from '@fastify/static';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// Path helpers
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fastify HTTPS instance
const fastify = Fastify({
  logger: true,
  https: {
    key: fs.readFileSync(path.join(__dirname, '../cert/key.pem')),
    cert: fs.readFileSync(path.join(__dirname, '../cert/cert.pem')),
  },
});

// SQLite init
const dbPromise = open({
  filename: path.join(__dirname, '../db/database.sqlite'),
  driver: sqlite3.Database,
});

// Serve frontend statically
fastify.register(staticPlugin, {
  root: path.join(__dirname, '../frontend'),
  prefix: '/',
});

// --- REST API ---

// Get counter by ID
fastify.get('/api/count', async (request, reply) => {
  const id = Number(request.query.id || 1);
  const db = await dbPromise;
  const row = await db.get('SELECT value FROM counter WHERE id = ?', id);
  reply.send({ count: row?.value || 0 });
});

// Increment counter by ID
fastify.post('/api/increment', async (request, reply) => {
  const id = Number(request.query.id || 1);
  const db = await dbPromise;
  await db.run('UPDATE counter SET value = value + 1 WHERE id = ?', id);
  const row = await db.get('SELECT value FROM counter WHERE id = ?', id);
  reply.send({ count: row.value });
});

// --- Chat logic ---

let messages = []; // In-memory store

// Get chat messages
fastify.get('/api/chat', async (req, reply) => {
  reply.send(messages);
});

// Post a chat message
fastify.post('/api/chat', async (req, reply) => {
  const { alias, message } = req.body;

  if (
    !alias ||
    !message ||
    typeof alias !== 'string' ||
    typeof message !== 'string' ||
    message.length > 2000
  ) {
    return reply.status(400).send({ error: 'Invalid message' });
  }

  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formatted = `(${time}) ${alias}: ${message}`;

  messages.push(formatted);
  if (messages.length > 100) messages.shift();

  reply.send({ success: true });
});

// --- SPA fallback (handle /home, /other refresh) ---
fastify.setNotFoundHandler((request, reply) => {
  reply.type('text/html').send(fs.readFileSync(path.join(__dirname, '../frontend/index.html')));
});


// --- Database setup ---
fastify.ready().then(async () => {
  const db = await dbPromise;
  await db.exec('CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY, value INTEGER)');

  const row1 = await db.get('SELECT * FROM counter WHERE id = 1');
  if (!row1) await db.run('INSERT INTO counter (id, value) VALUES (1, 0)');

  const row2 = await db.get('SELECT * FROM counter WHERE id = 2');
  if (!row2) await db.run('INSERT INTO counter (id, value) VALUES (2, 0)');

// SUM users table ===========================================

  await db.exec('PRAGMA foreign_keys = ON;');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT UNIQUE NOT NULL,
      avatar_url TEXT DEFAULT '/default-avatar.png',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_online TIMESTAMP,
      account_status TEXT DEFAULT 'offline' CHECK (account_status IN ('active', 'online', 'offline', 'banned'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_display_name ON users(display_name);
  `);
});


fastify.post('/api/register', async (req, reply) => {
  const { email, password, display_name } = req.body;

  if (!email || !password || !display_name) {
    return reply.code(400).send('Missing required fields');
  }

  const db = await dbPromise;
  const hash = await bcrypt.hash(password, 10);

  try {
    await db.run(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES (?, ?, ?)`,
      [email, hash, display_name]
    );

    reply.code(201).send({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return reply.code(409).send('Email or display name already exists');
    }

    console.error(err);
    reply.code(500).send('Internal server error');
  }
});

//=========================================== end

// --- Start server ---
fastify.listen({ port: 443, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Server running at ${address}`);
});

// --- Graceful shutdown ---
const closeGracefully = async (signal) => {
  fastify.log.info(`Received ${signal}. Closing Fastify...`);
  await fastify.close();
  process.exit(0);
};

process.on('SIGINT', closeGracefully);
process.on('SIGTERM', closeGracefully);
