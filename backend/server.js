//BAKCEND NODE JS FASTIFY SQLITE
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
const crypto = require('crypto');

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
    return reply.code(401).send({ error: 'Invalid or expired token' });
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
        const authorized = await req.jwtVerify();
        currentUserId = authorized.id;
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
        ORDER BY 
        CASE WHEN u.account_status = 'online' THEN 0 ELSE 1 END,
        u.last_online DESC
      `);

      if (currentUserId) {
        const friends = await fastify.db.all(`
          SELECT user_id AS friend_id, status
          FROM friends
          WHERE friend_id = ?
        `, [currentUserId]);
      
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
    try {
      let currentUserId = null;
      try {
        const authorized = await req.jwtVerify();
        currentUserId = authorized.id;
      } catch (err) {}

      const userId = req.params.id;
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
      if (!user) return reply.code(404).send('User not found');

      const stats = await fastify.db.all(`
        SELECT * FROM stats WHERE user_id = ? ORDER BY created_at DESC LIMIT 10
      `, [userId]);

      if (currentUserId) {
        const friendRow = await fastify.db.get(`
          SELECT status
          FROM friends
          WHERE user_id = ? AND friend_id = ?
        `, [user.id, currentUserId]);
      
        user.friend_status = friendRow?.status || null;
      }
      
      reply.send({ user, stats });
    } catch (err) {
      console.error("Failed to get user profile:", err);
      reply.status(500).send({ error: 'Failed to load user profile' });
    }
  });

  fastify.post('/api/friends/:id/add', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const friendId = req.params.id;
    const userId = req.user.id;
    try {

      await fastify.db.run('BEGIN TRANSACTION');
      await fastify.db.run(`
        INSERT OR IGNORE INTO friends (user_id, friend_id, status)
        VALUES (?, ?, 'adding')
      `, [userId, friendId]);

      await fastify.db.run(
        `INSERT INTO friends (user_id, friend_id, status)
        VALUES (?, ?, 'pending')`,
        [friendId, userId]
      );
      await fastify.db.run('COMMIT');
      reply.send({ success: true });
    } catch (err) {
      reply.status(500).send({ error: 'Failed to send friend request' });
    }
  });

  fastify.post('/api/friends/:id/cancelAction', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const friendId = req.params.id;
    const userId = req.user.id;
    try {
      await fastify.db.run(
        `DELETE FROM friends 
         WHERE (user_id = ? AND friend_id = ?)
         OR (user_id = ? AND friend_id = ?)`,
        [userId, friendId, friendId, userId]
      );
      reply.send({ success: true });
    } catch (err) {
      reply.status(500).send({ error: 'Failed to unblock user' });
    }
  });


  fastify.post('/api/friends/:id/accept', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const friendId = req.params.id;
    const userId = req.user.id;
  
    try {
 
      await fastify.db.run('BEGIN TRANSACTION');
  
      const result = await fastify.db.run(
        `UPDATE friends SET status = 'added' 
         WHERE user_id = ? AND friend_id = ? AND status = 'adding'`,
        [friendId, userId]
      );
  
      if (result.changes === 0) {
        await fastify.db.run('ROLLBACK');
        return reply.code(404).send({ error: 'No pending friend request found' });
      }
  
      await fastify.db.run(
        `UPDATE friends SET status = 'accepted' 
         WHERE user_id = ? AND friend_id = ? AND status = 'pending'`,
        [userId, friendId]
      );

      await fastify.db.run('COMMIT');
      reply.send({ success: true });
    } catch (err) {
      await fastify.db.run('ROLLBACK').catch(() => {});
      fastify.log.error(err);
      reply.code(500).send({ error: 'Failed to accept friend request' });
    }
  });

  fastify.post('/api/friends/:id/block', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const friendId = req.params.id;
    const userId = req.user.id;
    try {

      await fastify.db.run('BEGIN TRANSACTION');
      await fastify.db.run(
        `DELETE FROM friends 
         WHERE (user_id = ? AND friend_id = ?)
         OR (user_id = ? AND friend_id = ?)`,
        [userId, friendId, friendId, userId]
      );

    // TO DO check if there's msg etc.to delete

    await fastify.db.run(
      `INSERT INTO friends (user_id, friend_id, status)
       VALUES (?, ?, 'blocking')`,
      [userId, friendId]
    );

    await fastify.db.run(
      `INSERT INTO friends (user_id, friend_id, status)
       VALUES (?, ?, 'blocked')`,
      [friendId, userId]
    );

    await fastify.db.run('COMMIT');
    reply.send({ success: true });
  } catch (err) {
    await fastify.db.run('ROLLBACK');
    reply.code(500).send({ error: 'Failed to block user' });
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
      await fastify.db.run(
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
    await fastify.db.run(`UPDATE users SET account_status = 'online' WHERE id = ?`, [user.id]);

    reply.setCookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/'
    });

    reply.send({
      token,
      display_name: user.display_name,
      user_id: user.id});
  });

  fastify.post('/api/logout', async (req, reply) => {
    try {
      let userId = null;
      try {
        const authorized = await req.jwtVerify();
        userId = authorized.id;
      } catch (err_) {
        console.error('Unauthorized:', err);
      }
      
      if (!userId) {
        return reply.code(401).send({ error: 'Unauthorized: Invalid or missing token' });
      }
  
      await fastify.db.run(
        `UPDATE users 
         SET account_status = 'offline', 
             last_online = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [userId]
      );

      reply.clearCookie('token', {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax'
      });
  
      reply.send({ message: 'Logged out successfully' });
    } catch (err) {
      console.error('Logout error:', err);
      reply.code(500).send({ error: 'Logout failed' });
    }
  });

 fastify.get('/api/profile', { preValidation: [fastify.authenticate] }, async (req, reply) => {
    const user = await db.get(
      `SELECT id, email, display_name, avatar_url, created_at, last_online, account_status FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (!user) return reply.code(404).send({ error: 'User not found' });
    return user;
  });

  fastify.patch('/api/avatar', {
    preValidation: [fastify.authenticate],
    preHandler: upload,
  }, async (req, reply) => {

    const avatar = req.file;
    if (avatar && !avatar.mimetype.startsWith('image/')) {
      return reply.code(400).send({ error: 'Invalid file type' });
    }

    const result = await db.get(
      `SELECT avatar_url FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (!result) return reply.code(404).send({ error: 'User not found' });
    const oldAvatarUrl = result?.avatar_url;
  
    if (avatar && oldAvatarUrl && oldAvatarUrl.startsWith('/uploads/')) {
      const oldFilePath = path.join(__dirname, 'uploads', path.basename(oldAvatarUrl));
      fs.unlink(oldFilePath, (err) => {
        if (err) {
          console.error('Failed to delete old avatar:', err.message);
        } else {
          console.log('Old avatar deleted:', oldFilePath);
        }
      });
    }

    const newAvatarUrl = avatar ? `/uploads/${avatar.filename}` : req.body.avatar_url?.trim();
    if (newAvatarUrl){
    await fastify.db.run(
      `UPDATE users SET avatar_url = ? WHERE id = ?`,
      [newAvatarUrl, req.user.id]
    );}

    const updatedUser = await db.get(
      `SELECT id, email, display_name, avatar_url, created_at, last_online, account_status FROM users WHERE id = ?`,
      [req.user.id]
    );
  
    return { message: 'Profile updated', user: updatedUser };
  });
  

  fastify.patch('/api/name', {
    preValidation: [fastify.authenticate],
    preHandler: upload,
  }, async (req, reply) => {

    const { display_name } = req.body;
    const trimmedName = display_name?.trim();

    const oldName = await db.get(
      `SELECT display_name, avatar_url FROM users WHERE id = ?`,
      [req.user.id]
    );
  
    if (!oldName) return reply.code(404).send({ error: 'User not found' });
  
    if (trimmedName === oldName) {
      return reply.code(400).send({ error: 'No changes made' });
    }
  

      await fastify.db.run(
        `UPDATE users SET display_name = ? WHERE id = ?`,
        [trimmedName, req.user.id]
      );

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

  fastify.delete('/api/delete-account', { preValidation: [fastify.authenticate] }, async (req, reply) => {
    const userId = req.user.id;
    const user = await db.get('SELECT email FROM users WHERE id = ?', [userId]);

    const emailHash = crypto.createHash('sha256').update(user.email).digest('hex');

    await fastify.db.run(
    `INSERT INTO deleted_users (email_hash) VALUES (?)`,
    [emailHash]
    );
  
    await fastify.db.run('DELETE FROM users WHERE id = ?', [userId]);
  
    reply.clearCookie('token', {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax'
    });
    return { message: 'Your account has been permanently deleted' };
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
