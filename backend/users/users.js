module.exports = async function registerUsers(fastify)
{
	const fs = require('fs');
	const path = require('path');
	const bcrypt = require('bcrypt');
	const fastifyCookie = require('@fastify/cookie');
	const fastifyMulter = require('fastify-multer');
	const crypto = require('crypto');
	const fastifyCors = require('@fastify/cors');
	const rateLimit = require('@fastify/rate-limit');
	const fastifyHelmet = require('@fastify/helmet');
	const fastifyCSRF = require('@fastify/csrf-protection');
  const sanitizer = require('./utility');
  const db = fastify.db;

	/** Security plugins */

	fastify.register(fastifyCookie);
	fastify.register(fastifyMulter.contentParser);

	fastify.register(fastifyCors, {
		origin: 'https://localhost:3000',
		credentials: true
	});

	fastify.register(fastifyHelmet, {
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'"],
				styleSrc: ["'self'", "https:"],
				imgSrc: ["'self'", "data:"],
				connectSrc: ["'self'"],
				fontSrc: ["'self'"],
				objectSrc: ["'none'"],
				frameAncestors: ["'none'"]
			}
		}
	});
    
	fastify.register(fastifyCSRF);
	  
  /** Download helper plugin */

	const multer = fastifyMulter({ dest: path.join(__dirname, '..', 'uploads/') });

	const upload = multer.single('avatar');
    
	/** Router - register and log */

	fastify.post('/api/register', { preHandler: upload }, async (req, reply) => {
		let { email, password, display_name, enable_2fa, twofa_method, twofa_verified } = req.body;
		email = sanitizer.sanitizeEmail(email);
		display_name = sanitizer.sanitizeDisplayName(display_name);

		if (!sanitizer.validEmail(email))
			return (reply.code(400).send('Invalid email'));

		if (!sanitizer.validDisplayName(display_name))
			return (reply.code(400).send('Invalid display name'));
		if (password.length < 8)
			return (reply.code(400).send('Password too short'));

		const avatar = req.file;
    
		if (!email || !password || !display_name)
			return reply.code(400).send('Missing required fields');

		if (avatar)
		{
        	const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
			if (!allowedTypes.includes(avatar.mimetype))
				return reply.code(400).send('Invalid avatar format');
			if (avatar.size > 2 * 1024 * 1024)
				return reply.code(400).send('File too large (max 2MB)');
		}

		if (enable_2fa !== 'true')
		{
			twofa_method = null;
			twofa_verified = 0;
		}

		const avatarUrl = avatar ? `/uploads/${avatar.filename}` : '/default-avatar.png';
		const hash = await bcrypt.hash(password, 10);

		try {
			await db.run(
				`INSERT INTO users (email, password_hash, display_name, avatar_url, twofa_enabled, twofa_method, twofa_verified)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[email, hash, display_name, avatarUrl, enable_2fa === 'true' ? 1 : 0, twofa_method, twofa_verified ]
        	);

			const user = await db.get(
				`SELECT id, display_name FROM users WHERE email = ?`,
				[email]
			);
			const token = fastify.jwt.sign({ id: user.id, display_name: user.display_name });
			reply.setCookie('token', token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60*60*24*7 });
			reply.code(201).send(user);
		} catch (err) {
			if (err.message.includes('UNIQUE'))
				return reply.code(409).send('Email or display name already exists');
			console.error(err);
			reply.code(500).send('Internal server error');
		}
	});

  fastify.post('/api/login', {
    config: {
      rateLimit: {
        max: 5,            
        timeWindow: '5 minutes', 
        ban: 10
      }
    }
  }, async (req, reply) => {
    const { email, password } = req.body;
    if (!email || !password) return reply.code(400).send('Email and password required');

    const user = await db.get(`SELECT * FROM users WHERE email = ?`, [email]);
    
    if (!user) return reply.code(401).send('Invalid credentials');

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return reply.code(401).send('Wrong credentials');

    if (user.twofa_enabled === 1) {
      return reply.send({ requires2FA: true, method: user.twofa_method, email: user.email });
    }

    const token = fastify.jwt.sign({ id: user.id, display_name: user.display_name });
    await db.run(`UPDATE users SET account_status='online', last_online=CURRENT_TIMESTAMP WHERE id=?`, [user.id]);

    reply.setCookie('token', token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60*60*24*7 });
    return reply.send({ display_name: user.display_name, user_id: user.id });
  });

  fastify.post('/api/final-login', async (req, reply) => {
    const { email, password } = req.body;
    if (!email || !password) return reply.code(400).send('Email and password required');

    const user = await db.get(`SELECT * FROM users WHERE email = ?`, [email]);
    if (!user) return reply.code(401).send('Invalid credentials');

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return reply.code(401).send('Wrong credentials');

    const token = fastify.jwt.sign({ id: user.id, display_name: user.display_name });
    await db.run(`UPDATE users SET account_status='online', last_online=CURRENT_TIMESTAMP WHERE id=?`, [user.id]);

    reply.setCookie('token', token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60*60*24*7 });
    return reply.send({ display_name: user.display_name, user_id: user.id });
  });

  fastify.post('/api/logout', async (req, reply) => {
    try {
      let userId = null;
      try {
        const authorized = await req.jwtVerify();
        userId = authorized.id;
      } catch (err_) {}
      
      if (userId) {
  
        await db.run(
          `UPDATE users 
          SET account_status = 'offline', 
              last_online = CURRENT_TIMESTAMP 
          WHERE id = ?`,
          [userId]
        );
      }

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

  /** Router - user management */

  fastify.get('/api/user/:id', async (req, reply) => {
    try {
      let currentUserId = null;
      try {
        const authorized = await req.jwtVerify();
        currentUserId = authorized.id;
      } catch (_) {}

      const userId = parseInt(req.params.id, 10);

      const user = await db.get(
        `
        SELECT 
          u.id,
          u.display_name,
          u.avatar_url,
          CASE
            WHEN (strftime('%s','now') - strftime('%s', u.last_online)) < 75 THEN 'online'
            ELSE 'offline'
          END AS account_status,
          u.created_at,
          u.last_online,
          u.pvp_wins   AS wins,
          u.pvp_losses AS losses
        FROM users u WHERE u.id = ?
        `,
        [userId]
      );
      if (!user) return reply.code(404).send('User not found');

      const history = await db.all(
        `
        SELECT
          m.id,
          strftime('%Y-%m-%dT%H:%M:%SZ', m.finished_at) AS date,
          -- Opponent relative to requested user
          CASE WHEN ? = m.host_id THEN u2.display_name ELSE u1.display_name END AS opponent_name,
          CASE WHEN ? = m.host_id THEN m.guest_id     ELSE m.host_id     END AS opponent_id,
          -- Scores (your side first)
          CASE WHEN ? = m.host_id THEN m.host_score   ELSE m.guest_score END AS your_score,
          CASE WHEN ? = m.host_id THEN m.guest_score  ELSE m.host_score  END AS opponent_score
        FROM matches m
        JOIN users u1 ON u1.id = m.host_id
        JOIN users u2 ON u2.id = m.guest_id
        WHERE ? IN (m.host_id, m.guest_id)
          AND m.mode = 'private_1v1'
        ORDER BY m.finished_at DESC
        LIMIT 50
        `,
        [userId, userId, userId, userId, userId]
      );

      if (currentUserId) {
        const friendRow = await db.get(
          `
          SELECT status
          FROM friends
          WHERE user_id = ? AND friend_id = ?
          `,
          [user.id, currentUserId]
        );
        user.friend_status = friendRow?.status || null;
      }
      // Return history (no legacy stats)
      reply.send({ user, history });
    } catch (err) {
      console.error('Failed to get user profile:', err);
      reply.status(500).send({ error: 'Failed to load user profile' });
    }
  });

  fastify.get('/api/users', async (req, reply) => {
    try {
      let currentUserId = null;
      try {
        const authorized = await req.jwtVerify();
        currentUserId = authorized.id;
      } catch (_) {}

      const users = await db.all(`
        SELECT 
          u.id,
          u.display_name,
          u.avatar_url,
          -- Derive presence from last_online (online if seen in last 75s)
          CASE
            WHEN (strftime('%s','now') - strftime('%s', u.last_online)) < 75 THEN 'online'
            ELSE 'offline'
          END AS account_status,
          u.created_at,
          u.last_online,
          u.pvp_wins   AS wins,
          u.pvp_losses AS losses,

          -- Latest private 1v1 opponent id
          (
            SELECT CASE
                    WHEN m.host_id = u.id THEN m.guest_id
                    ELSE m.host_id
                  END
            FROM matches m
            WHERE (m.host_id = u.id OR m.guest_id = u.id) AND m.mode = 'private_1v1'
            ORDER BY m.finished_at DESC
            LIMIT 1
          ) AS last_match_opponent_id,

          -- Latest private 1v1 opponent display name
          (
            SELECT CASE
                    WHEN m.host_id = u.id THEN (SELECT display_name FROM users WHERE id = m.guest_id)
                    ELSE (SELECT display_name FROM users WHERE id = m.host_id)
                  END
            FROM matches m
            WHERE (m.host_id = u.id OR m.guest_id = u.id) AND m.mode = 'private_1v1'
            ORDER BY m.finished_at DESC
            LIMIT 1
          ) AS last_match_opponent,

          -- Latest private 1v1 score (your side)
          (
            SELECT CASE
                    WHEN m.host_id = u.id THEN m.host_score
                    ELSE m.guest_score
                  END
            FROM matches m
            WHERE (m.host_id = u.id OR m.guest_id = u.id) AND m.mode = 'private_1v1'
            ORDER BY m.finished_at DESC
            LIMIT 1
          ) AS last_match_your_score,

          -- Latest private 1v1 score (opponent side)
          (
            SELECT CASE
                    WHEN m.host_id = u.id THEN m.guest_score
                    ELSE m.host_score
                  END
            FROM matches m
            WHERE (m.host_id = u.id OR m.guest_id = u.id) AND m.mode = 'private_1v1'
            ORDER BY m.finished_at DESC
            LIMIT 1
          ) AS last_match_opponent_score,

          -- Latest private 1v1 finished time (ISO UTC)
          (
            SELECT strftime('%Y-%m-%dT%H:%M:%SZ', m.finished_at)
            FROM matches m
            WHERE (m.host_id = u.id OR m.guest_id = u.id) AND m.mode = 'private_1v1'
            ORDER BY m.finished_at DESC
            LIMIT 1
          ) AS last_match_date

        FROM users u
        ORDER BY 
          CASE WHEN (strftime('%s','now') - strftime('%s', u.last_online)) < 75 THEN 0 ELSE 1 END,
          u.last_online DESC
      `);

      if (currentUserId) {
        const friends = await db.all(
          `SELECT user_id AS friend_id, status
            FROM friends
            WHERE friend_id = ?`,
          [currentUserId]
        );
        const friendMap = Object.fromEntries(friends.map(f => [f.friend_id, f.status]));
        users.forEach(u => { u.friend_status = friendMap[u.id] || null; });
      }

      reply.send(users);
    } catch (err) {
      console.error("DB error in /api/users:", err);
      reply.status(500).send({ error: 'Failed to load users list' });
    }
  });

  /** Router - friendship management */

  fastify.post('/api/friends/:id/add', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const friendId = req.params.id;
    const userId = req.user.id;
    try {

      await db.run('BEGIN TRANSACTION');
      await db.run(`
        INSERT OR IGNORE INTO friends (user_id, friend_id, status)
        VALUES (?, ?, 'adding')
      `, [userId, friendId]);

      await db.run(
        `INSERT INTO friends (user_id, friend_id, status)
        VALUES (?, ?, 'pending')`,
        [friendId, userId]
      );
      
      await db.run(
        `INSERT INTO private_messages (sender_id, recipient_id, message)
         VALUES (?, ?, ?)`,
        [userId, friendId, 'sent an invitation. Check sender profile to add them back.']
      );
      await db.run('COMMIT');
      reply.send({ success: true });
    } catch (err) {
      reply.status(500).send({ error: 'Failed to send friend request' });
    }
  });

  fastify.post('/api/friends/:id/cancelAction', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const friendId = req.params.id;
    const userId = req.user.id;
    try {
      await db.run(
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
 
      await db.run('BEGIN TRANSACTION');
  
      const result = await db.run(
        `UPDATE friends SET status = 'added' 
         WHERE user_id = ? AND friend_id = ? AND status = 'adding'`,
        [friendId, userId]
      );
  
      if (result.changes === 0) {
        await db.run('ROLLBACK');
        return reply.code(404).send({ error: 'No pending friend request found' });
      }
  
      await db.run(
        `UPDATE friends SET status = 'accepted' 
         WHERE user_id = ? AND friend_id = ? AND status = 'pending'`,
        [userId, friendId]
      );

      await db.run('COMMIT');
      reply.send({ success: true });
    } catch (err) {
      await db.run('ROLLBACK').catch(() => {});
      fastify.log.error(err);
      reply.code(500).send({ error: 'Failed to accept friend request' });
    }
  });

  fastify.post('/api/friends/:id/block', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const friendId = req.params.id;
    const userId = req.user.id;
    try {

      await db.run('BEGIN TRANSACTION');
      await db.run(
        `DELETE FROM friends 
         WHERE (user_id = ? AND friend_id = ?)
         OR (user_id = ? AND friend_id = ?)`,
        [userId, friendId, friendId, userId]
      );

    // TO DO check if there's msg etc.to delete

    await db.run(
      `INSERT INTO friends (user_id, friend_id, status)
       VALUES (?, ?, 'blocking')`,
      [userId, friendId]
    );

    await db.run(
      `INSERT INTO friends (user_id, friend_id, status)
       VALUES (?, ?, 'blocked')`,
      [friendId, userId]
    );

    await db.run('COMMIT');
    reply.send({ success: true });
  } catch (err) {
    await db.run('ROLLBACK');
    reply.code(500).send({ error: 'Failed to block user' });
  }
  });

  /** Router - Profile management */

  fastify.get('/api/profile', { preValidation: [fastify.authenticate] }, async (req, reply) => {

  const user = await db.get(
    `SELECT id, password_hash, email, display_name, avatar_url, twofa_method, twofa_enabled, twofa_verified, created_at, last_online, oauth_provider, pvp_losses AS losses, pvp_wins AS wins, account_status 
     FROM users WHERE id = ?`,
    [req.user.id]
  );

  if (!user) {
    reply.clearCookie('token', { 
      httpOnly: true, 
      secure: true, 
      sameSite: 'lax', 
      path: '/' 
    });
    return reply.code(401).send({ error: 'Invalid session' });
  }
    return user;
  });
  
	fastify.patch('/api/avatar', {
		preValidation: [fastify.authenticate],
		preHandler: upload,
	  }, async (req, reply) => {
		try {
			const userRow = await db.get(
				`SELECT avatar_url FROM users WHERE id = ?`,
				[req.user.id]
			);
			if (!userRow)
				return (reply.code(404).send({ error: 'User not found' }));

			const oldAvatarUrl = userRow.avatar_url;
			const file = req.file;

			if (!file)
				return (reply.code(400).send({ error: 'Upload required (remote URLs disabled)' }));

			const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
			if (!allowedTypes.includes(file.mimetype))
				return (reply.code(400).send({ error: 'Invalid avatar format' }));
			if (file.size > 2 * 1024 * 1024)
				return (reply.code(400).send({ error: 'File too large (max 2MB)' }));

			const finalAvatar = sanitizer.sanitizeAvatar(`/uploads/${file.filename}`);

			await db.run(
				`UPDATE users SET avatar_url = ? WHERE id = ?`,
				[finalAvatar, req.user.id]
			);
			if (oldAvatarUrl && oldAvatarUrl !== finalAvatar && oldAvatarUrl.startsWith('/uploads/'))
			{
				const oldFilePath = path.join(__dirname, 'uploads', path.basename(oldAvatarUrl));
				fs.unlink(oldFilePath, err => {
					if (err)
						fastify.log.warn('Old avatar delete failed: ' + err.message);
				});
			}
			const updated = await db.get(
				`SELECT id, email, display_name,avatar_url, created_at, last_online, account_status
				FROM users WHERE id = ?`,
				[req.user.id]
			);
			return ({ message: 'Avatar updated', user: updated });
		} catch (e) {
			req.log.error(e);
			return (reply.code(500).send({ error: 'Avatar update failed'}));}
	});
  
	fastify.patch('/api/name', { preValidation: [fastify.authenticate], preHandler: upload }, async (req, reply) => {
		let { display_name } = req.body || {};
		const oldName = await db.get(
			`SELECT display_name, avatar_url FROM users WHERE id = ?`,
			[req.user.id]
		);
		if (!oldName)
			return reply.code(404).send({ error: 'User not found' });

		const cleaned = sanitizer.sanitizeDisplayName(display_name || '');
		if (!cleaned)
			return (reply.code(400).send({ error: 'Display name required' }));
		if (!sanitizer.validDisplayName(cleaned))
			return (reply.code(400).send({ error: 'Invalid display name' }));
		if (cleaned === oldName.display_name)
			return (reply.code(400).send({ error: 'No changes made' }));
		try {
			await db.run(
				`UPDATE users SET display_name = ? WHERE id = ?`,
				[cleaned, req.user.id]
			);
		} catch (e) {
			if (/UNIQUE/i.test(e.message))
				return (reply.code(409).send({ error: 'Display name already exists' }));
			req.log.error(e);
			return (reply.code(500).send({ error: 'Update failed' }));
		}

		const updatedUser = await db.get(
			`SELECT id, email, display_name, avatar_url, created_at, last_online, account_status FROM users WHERE id = ?`,
			[req.user.id]
		);
		return { message: 'Profile updated', user: updatedUser };
	});

  fastify.patch('/api/password', {preValidation: [fastify.authenticate]}, async (req, reply) => {
    const { password } = req.body;
  
    if (!password || password.length < 8) {
      return reply.code(400).send('Password must be at least 8 characters');
    }
  
    try {
      const hash = await bcrypt.hash(password, 10);
  
      await db.run(
        `UPDATE users SET password_hash = ? WHERE id = ?`,
        [hash, req.user.id]
      );
  
      const updatedUser = await db.get(
        `SELECT id, email, display_name, avatar_url, created_at, account_status, twofa_enabled, twofa_method FROM users WHERE id = ?`,
        [req.user.id]
      );
  
      return { message: 'Password updated', user: updatedUser };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send('Internal server error');
    }
  });
  
  fastify.delete('/api/delete-account', { preValidation: [fastify.authenticate] }, async (req, reply) => {
    const userId = req.user.id;
    const user = await db.get('SELECT email FROM users WHERE id = ?', [userId]);

    const emailHash = crypto.createHash('sha256').update(user.email).digest('hex');

    await db.run(
    `INSERT INTO deleted_users (email_hash) VALUES (?)`,
    [emailHash]
    );
  
    await db.run('DELETE FROM users WHERE id = ?', [userId]);
    await db.run(`DELETE FROM twofa_codes WHERE contact = ?`, [user.email.toLowerCase()]);
    await db.run(`DELETE FROM app_codes WHERE contact = ?`, [user.email.toLowerCase()]);
  
    reply.clearCookie('token', {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax'
    });
    return { message: 'Your account has been permanently deleted' };
  });

	fastify.post('/api/account/anonymize', {
    preValidation: [fastify.authenticate]
  }, async (req, reply) => {
    if (!req.user || !req.user.id)
      return reply.code(401).send({ error: 'Not authenticated' });

    const userId = req.user.id;
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) return reply.code(404).send({ error: 'Not found' });
    if (user.anonymized) return reply.code(400).send({ error: 'Already anonymized' });

    await db.run('BEGIN');
    try {
      const randomPwd = crypto.randomBytes(48).toString('hex');
      const randomHash = await bcrypt.hash(randomPwd, 10);

      // Use random (non‑derivable) email so it cannot be reversed
      const placeholderEmail = crypto.randomBytes(16).toString('hex') + '@anon.local';
      const newDisplay = `anon_${user.id}`;

      // Update public messages alias (ignore if table absent)
      try {
        await db.run('UPDATE messages SET alias = ? WHERE alias = ?', [newDisplay, user.display_name]);
      } catch (e) {
        fastify.log.warn('Skipping messages alias update:', e.message);
      }

      await db.run(`
        UPDATE users
        SET email = ?, display_name = ?, avatar_url = '/default-avatar.png',
            password_hash = ?, twofa_enabled = 0, twofa_method = NULL,
            twofa_verified = 0, anonymized = 1,
            oauth_provider = NULL, oauth_id = NULL,
            account_status = 'offline', last_online = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [placeholderEmail, newDisplay, randomHash, userId]
      );

      // twofa_codes / app_codes tables use contact (email), NOT user_id
      try {
        await db.run('DELETE FROM twofa_codes WHERE contact = ?', [user.email.toLowerCase()]);
      } catch (e) {
        fastify.log.warn('Delete twofa_codes failed:', e.message);
      }
      try {
        await db.run('DELETE FROM app_codes WHERE contact = ?', [user.email.toLowerCase()]);
      } catch (e) {
        fastify.log.warn('Delete app_codes failed:', e.message);
      }

      await db.run('COMMIT');
      reply.clearCookie('token', { path: '/' });
      return reply.send({ status: 'ok' });
    } catch (e) {
      await db.run('ROLLBACK').catch(()=>{});
      fastify.log.error('Anonymize error:', e);
      // Expose minimal message for debugging (adjust/remove in prod)
      return reply.code(500).send({ error: 'Anonymize failed', detail: e.message });
    }
  });

  fastify.get('/api/account/export', { preValidation: [fastify.authenticate] }, async (req, reply) => {
    const userId = req.user.id;
    try {
      const user = await db.get(`SELECT id, email, display_name, created_at, last_online, anonymized, account_status, pvp_wins, pvp_losses FROM users WHERE id = ?`, [userId]);
      if (!user) return reply.code(404).send({ error: 'User not found' });
      const matches = await db.all(`SELECT id, mode, host_id, guest_id, host_score, guest_score, strftime('%Y-%m-%dT%H:%M:%SZ', finished_at) as finished_at FROM matches WHERE host_id = ? OR guest_id = ? ORDER BY finished_at DESC`, [userId, userId]);
      let messages = [];
      try {
        // Public messages authored by current (by alias). Table columns: alias, message, timestamp
        messages = await db.all(`SELECT id, alias, message, strftime('%Y-%m-%dT%H:%M:%SZ', timestamp) as timestamp FROM messages WHERE alias = ? ORDER BY id DESC`, [user.display_name]);
      } catch {}
      let privateMessages = [];
      try {
        const rows = await db.all(`SELECT id, sender_id, recipient_id, message, strftime('%Y-%m-%dT%H:%M:%SZ', timestamp) as timestamp FROM private_messages WHERE sender_id = ? OR recipient_id = ? ORDER BY id DESC`, [userId, userId]);
        privateMessages = rows.map(r => ({ ...r, direction: r.sender_id === userId ? 'sent' : 'received' }));
      } catch {}
      const friends = await db.all(`SELECT user_id, friend_id, status FROM friends WHERE user_id = ? OR friend_id = ?`, [userId, userId]);
      const exportBlob = { generated_at: new Date().toISOString(), user, matches, public_messages: messages, private_messages: privateMessages, friends };
      reply.header('Content-Type', 'application/json');
      reply.send(exportBlob);
    } catch (e) {
      fastify.log.error(e);
      reply.code(500).send({ error: 'Export failed' });
    }
  });

	fastify.patch('/api/account/update', { preValidation: [fastify.authenticate] }, async (req, reply) => {
		const userId = req.user.id;
		let { display_name, email } = req.body || {};
		const sets = [];
		const params = [];

		if (display_name !== undefined)
		{
			display_name = sanitizer.sanitizeDisplayName(display_name);
			if (!sanitizer.validDisplayName(display_name))
				return (reply.code(400).send({ error: 'Invalid display name' }));
			sets.push('display_name = ?');
			params.push(display_name);
		}
		if (email !== undefined)
		{
			email = sanitizer.sanitizeEmail(email);
			if (!sanitizer.validEmail(email))
				return (reply.code(400).send({ error: 'Invalid email' }));
			sets.push('email = ?');
			params.push(email);
		}

		if (!sets.length)
			return (reply.code(400).send({ error: 'Nothing to update' }));

		try {
			params.push(userId);
			await db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
			return ({ ok: true });
		} catch (e) {
			if (/UNIQUE/i.test(e.message))
				return (reply.code(409).send({ error: 'Email or display name already exists' }));
			fastify.log.error(e);
			return reply.code(500).send({ error: 'Update failed' });
		}
	});
};
