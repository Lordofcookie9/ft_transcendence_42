const dotenv = require('dotenv');
dotenv.config();

const Fastify = require('fastify');
const fs = require('fs');
const path = require('path');
const fastifyStatic = require('@fastify/static');
const bcrypt = require('bcrypt');
const fastifyJwt = require('@fastify/jwt');
const fastifyCookie = require('@fastify/cookie');
const fastifyMulter = require('fastify-multer');
const initDb = require('./db');

const start = async () => {
  const db = await initDb();

  const fastify = Fastify({
    logger: true,
  });

  // --- Plugins ---
  fastify.register(fastifyCookie);
  fastify.register(fastifyMulter.contentParser);

  fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET,
    cookie: { cookieName: 'token', signed: false },
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

  // --- API Endpoints ---

  fastify.get('/api/users', async (req, reply) => {
    try {
      let currentUserId = null;
      try {
        const decoded = await req.jwtVerify();
        currentUserId = decoded.id;
      } catch (_) {}

      const users = await fastify.db.all(`
        SELECT 
          u.id,
          u.display_name,
          u.avatar_url,
          u.account_status,
          u.created_at,
          u.last_online,
          (SELECT COUNT(*) FROM stats s WHERE s.winner_id = u.id) AS wins,
          (SELECT COUNT(*) FROM stats s WHERE s.user_id = u.id AND s.winner_id != u.id) AS losses
        FROM users u
        ORDER BY u.last_online DESC
      `);

      if (currentUserId) {
        const friends = await fastify.db.all(`
          SELECT friend_id, status FROM friends WHERE user_id = ?
          UNION
          SELECT user_id as friend_id, status FROM friends WHERE friend_id = ?
        `, [currentUserId, currentUserId]);

        const friendMap = Object.fromEntries(friends.map(f => [f.friend_id, f.status]));
        users.forEach(user => {
          user.friend_status = friendMap[user.id] || null;
        });
      }

      reply.send(users);
    } catch (err) {
      console.error("DB error in /api/users:", err);
      reply.status(500).send({ error: 'Failed to load users list' });
    }
  });

  fastify.get('/api/user/:id', async (req, reply) => {
    const userId = req.params.id;
    try {
      const user = await fastify.db.get(`
        SELECT 
          u.id,
          u.display_name,
          u.avatar_url,
          u.account_status,
          u.created_at,
          u.last_online,
          (SELECT COUNT(*) FROM stats s WHERE s.winner_id = u.id) AS wins,
          (SELECT COUNT(*) FROM stats s WHERE s.user_id = u.id AND s.winner_id != u.id) AS losses
        FROM users u WHERE u.id = ?
      `, [userId]);

      const stats = await fastify.db.all(`
        SELECT * FROM stats WHERE user_id = ? ORDER BY created_at DESC LIMIT 10
      `, [userId]);

      reply.send({ user, stats });
    } catch (err) {
      console.error("Failed to get user profile:", err);
      reply.status(500).send({ error: 'Failed to load user profile' });
    }
  });

  fastify.post('/api/friends/:id/add', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const targetId = req.params.id;
    const userId = req.user.id;
    try {
      await fastify.db.run(`
        INSERT OR IGNORE INTO friends (user_id, friend_id, status)
        VALUES (?, ?, 'pending')
      `, [userId, targetId]);
      reply.send({ success: true });
    } catch (err) {
      reply.status(500).send({ error: 'Failed to send friend request' });
    }
  });

  fastify.post('/api/friends/:id/accept', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const targetId = req.params.id;
    const userId = req.user.id;
    try {
      await fastify.db.run(`
        UPDATE friends SET status = 'accepted'
        WHERE user_id = ? AND friend_id = ?
      `, [targetId, userId]);
      reply.send({ success: true });
    } catch (err) {
      reply.status(500).send({ error: 'Failed to accept friend request' });
    }
  });

  fastify.post('/api/friends/:id/block', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const targetId = req.params.id;
    const userId = req.user.id;
    try {
      await fastify.db.run(`
        INSERT OR REPLACE INTO friends (user_id, friend_id, status)
        VALUES (?, ?, 'blocked')
      `, [userId, targetId]);
      reply.send({ success: true });
    } catch (err) {
      reply.status(500).send({ error: 'Failed to block user' });
    }
  });

  fastify.post('/api/register', { preHandler: upload }, async (req, reply) => {
    const { email, password, display_name } = req.body;
    const avatar = req.file;

    if (!email || !password || !display_name) {
      return reply.code(400).send('Missing required fields');
    }

    const avatarUrl = avatar ? `/uploads/${avatar.filename}` : '/default-avatar.png';
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

  fastify.post('/api/login', async (req, reply) => {
    const { email, password } = req.body;
    if (!email || !password) return reply.code(400).send('Email and password are required');

    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return reply.code(401).send('Invalid email or password');

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return reply.code(401).send('Invalid email or password');

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

  fastify.post('/api/logout', { preValidation: [fastify.authenticate] }, async (req, reply) => {
    const userId = req.user.id;
    await db.run(`UPDATE users SET account_status = 'offline', last_online = CURRENT_TIMESTAMP WHERE id = ?`, [userId]);
    reply.clearCookie('token');
    return { message: 'Logged out' };
  });

  fastify.get('/api/profile', { preValidation: [fastify.authenticate] }, async (req, reply) => {
    const user = await db.get(
      `SELECT id, email, display_name, avatar_url, created_at, last_online, account_status FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (!user) return reply.code(404).send({ error: 'User not found' });
    return user;
  });

  fastify.put('/api/profile', {
    preValidation: [fastify.authenticate],
    preHandler: upload,
  }, async (req, reply) => {
    const avatar = req.file;
    const { display_name } = req.body;
    const avatar_url = avatar ? `/uploads/${avatar.filename}` : req.body.avatar_url;

    const result = await db.run(
      `UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?`,
      [display_name.trim(), avatar_url?.trim(), req.user.id]
    );

    if (result.changes === 0) return reply.code(404).send({ error: 'No changes made' });

    const updatedUser = await db.get(
      `SELECT id, email, display_name, avatar_url, created_at, last_online, account_status FROM users WHERE id = ?`,
      [req.user.id]
    );

    return { message: 'Profile updated', user: updatedUser };
  });

  fastify.get('/api/chat', async (request, reply) => {
    try {
      const messages = await fastify.db.all('SELECT alias, message, timestamp FROM messages ORDER BY id ASC');
      return messages;
    } catch (err) {
      reply.code(500).send({ error: 'Failed to fetch messages' });
    }
  });

  fastify.post('/api/chat', async (request, reply) => {
    const { alias, message } = request.body;
    try {
      await fastify.db.run('INSERT INTO messages (alias, message) VALUES (?, ?)', [alias, message]);
      return { success: true };
    } catch (err) {
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
