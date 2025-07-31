// backend/server.js
const dotenv = require('dotenv');
const Fastify = require('fastify');
const fs = require('fs');
const path = require('path');
const fastifyStatic = require('@fastify/static');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcrypt');
const fastifyJwt = require('@fastify/jwt');
const fastifyCookie = require('@fastify/cookie');
const fastifyMulter = require('fastify-multer');
const db = require('./db');

//dotenv.config();
require('dotenv').config();

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);


const fastify = Fastify({
  logger: true,
  https: {
    key: fs.readFileSync(path.join(__dirname, 'cert/key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'cert/cert.pem')),
  },
});

fastify.register(fastifyCookie);
fastify.register(fastifyMulter.contentParser);

fastify.register(fastifyJwt, {
  secret: process.env.JWT_SECRET,
  cookie: {
    cookieName: 'token',
    signed: false,
  },
});

fastify.decorate('authenticate', async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.send(err);
  }
});

const multer = fastifyMulter({ dest: path.join(__dirname, 'uploads/') });
const upload = multer.single('avatar');

const dbPromise = open({
  filename: path.join(__dirname, 'db/database.sqlite'),
  driver: sqlite3.Database,
});

fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/',
});

fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'uploads'),
  prefix: '/uploads/',
  decorateReply: false
});

fastify.setNotFoundHandler((req, reply) => {
  const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf-8');
  reply.type('text/html').send(html);
});

// Initialize database and create table
fastify.ready().then(async () => {
  const db = await dbPromise;
  await db.exec('PRAGMA foreign_keys = ON;');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT UNIQUE NOT NULL,
      avatar_url TEXT DEFAULT './uploads/default-avatar.png',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_online TIMESTAMP,
      account_status TEXT DEFAULT 'offline' CHECK (account_status IN ('active', 'online', 'offline', 'banned'))
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_display_name ON users(display_name);
  `);
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


// Register route
fastify.post('/api/register', { preHandler: upload }, async (req, reply) => {
  const { email, password, display_name } = req.body;
  const avatar = req.file;

  if (!email || !password || !display_name) {
    return reply.code(400).send('Missing required fields');
  }

  const avatarUrl = avatar ? `/uploads/${avatar.filename}` : '/default-avatar.png';
  const db = await dbPromise;
  const hash = await bcrypt.hash(password, 10);

  try {
    await db.run(
      `INSERT INTO users (email, password_hash, display_name, avatar_url, last_online, account_status)
       VALUES (?, ?, ?, ?, 0, 'online')`,
      [email, hash, display_name, avatarUrl]
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

// Profile get
fastify.get('/api/profile', { preValidation: [fastify.authenticate] }, async (req, reply) => {
  try {
    const db = await dbPromise;
    const userId = req.user.id;
    const user = await db.get(
      `SELECT id, email, display_name, avatar_url, created_at, last_online, account_status
       FROM users WHERE id = ?`,
      [userId]
    );
    if (!user) return reply.code(404).send({ error: 'User not found' });
    return user;
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Internal Server Error' });
  }
});

// Profile update
fastify.put('/api/profile', {
  preValidation: [fastify.authenticate],
  preHandler: upload
}, async (req, reply) => {
  const db = await dbPromise;
  const userId = req.user.id;
  const avatar = req.file;
  const { display_name } = req.body;

  let avatar_url = req.body.avatar_url;
  if (avatar) {
    avatar_url = `/uploads/${avatar.filename}`;
  }

  try {
    const result = await db.run(
      `UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?`,
      [display_name.trim(), avatar_url?.trim(), userId]
    );

    const updatedUser = await db.get(
      `SELECT id, email, display_name, avatar_url, created_at, last_online, account_status FROM users WHERE id = ?`,
      [userId]
    );
    if (result.changes === 0) return reply.code(404).send({ error: 'No changes made' });
    return { message: 'Profile updated', user: updatedUser };
  } catch (err) {
    return reply.code(400).send({ error: err.message });
  }
});

// Login
fastify.post('/api/login', async (req, reply) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return reply.code(400).send('Email and password are required');
  }

  const db = await dbPromise;
  const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

  if (!user) {
    return reply.code(401).send('Invalid email or password');
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    return reply.code(401).send('Invalid email or password');
  }

  const token = fastify.jwt.sign({ id: user.id });
  await db.run(`UPDATE users SET account_status = 'online' WHERE id = ?`, [user.id]);

  reply.setCookie('token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/'
  });

  reply.send({ token });
});

// Logout
fastify.post('/api/logout', { preValidation: [fastify.authenticate] }, async (req, reply) => {
  const db = await dbPromise;
  const userId = req.user.id;

  await db.run(`UPDATE users SET account_status = 'offline', last_online = CURRENT_TIMESTAMP WHERE id = ?`, [userId]);

  reply.clearCookie('token');
  return { message: 'Logged out' };
});

// Start server
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
