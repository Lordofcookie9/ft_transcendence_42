module.exports = async function registerUsers(fastify) {
	const fs = require('fs');
	const path = require('path');
const bcrypt = require('bcrypt');
const fastifyJwt = require('@fastify/jwt');
const fastifyCookie = require('@fastify/cookie');
const fastifyMulter = require('fastify-multer');
const crypto = require('crypto');
const fastifyCors = require('@fastify/cors');
const nodemailer = require('nodemailer');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const fastifyWebsocket = require('@fastify/websocket');


const db = fastify.db;
const MAIL_APP = process.env.MAIL_APP;
const MAIL_APPPW = process.env.MAIL_APPPW;
if (!MAIL_APP || !MAIL_APPPW) {
  fastify.log.warn('MAIL_APP or MAIL_APPPW not set — email 2FA will fail until configured');
}

	// --- Plugins ---
	fastify.register(fastifyCookie);
	fastify.register(fastifyMulter.contentParser);
  	fastify.register(fastifyCors, {
	origin: 'http://localhost:3000',
	credentials: true
 	 });
  
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

  // 2fa helpers
    
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: MAIL_APP, pass: MAIL_APPPW}
    });

    fastify.patch('/api/email', { preValidation: [fastify.authenticate] }, async (req, reply) => {
      if (!req.user) return reply.code(401).send('Not authenticated');
    
      const { email } = req.body;
      if (!email) return reply.code(400).send('Email is required');

      const currData = await db.get(
        `SELECT email, twofa_method FROM users
         WHERE id = ? `,
        [req.user.id]
      );

      if (!currData) return reply.code(404).send('User not found');

      try {
      if (currData.twofa_method === 'app') { 
        await db.run(
          `UPDATE app_codes SET contact = ?
           WHERE contact = ?`,
          [email, currData.email]
        );
      }
      await db.run('BEGIN');
      await db.run(`UPDATE users SET email = ? WHERE id = ?`, [email, req.user.id]);
      await db.run(`DELETE FROM twofa_codes WHERE contact = ?`, [currData.email]);
      await db.run('COMMIT');
      reply.send({ success: true });
    } catch (err) {
      await db.run('ROLLBACK');
      reply.code(500).send({ error: 'Database update failed', details: err.message });
    }
    });
    
//router

    fastify.post('/api/register', { preHandler: upload }, async (req, reply) => {
      
      let { email, password, display_name, enable_2fa, twofa_method, twofa_verified } = req.body;
      const avatar = req.file;
  
      if (!email || !password || !display_name) {
        return reply.code(400).send('Missing required fields');
      }

      if (enable_2fa !== 'true'){
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
        if (err.message.includes('UNIQUE')) {
          return reply.code(409).send('Email or display name already exists');
        }
        console.error(err);
        reply.code(500).send('Internal server error');
      }
    });


fastify.post('/api/2fa/send-code', async (req, reply) => {

  try {
  const { twofaMethod: method, email } = req.body;

  if (!['app', 'email'].includes(method)) {
    return reply.code(400).send('Invalid method');
  }

  if (method === 'email') {
    const contact = email;
    if (!contact) {
      return reply.code(400).send('Missing contact');
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = Math.floor(Date.now() / 1000) + 5 * 60;


    try {
      await transporter.sendMail({
      from: `"Transcendance" <${process.env.MAIL_APP}>`,
      to: contact,
      subject: 'Your 2FA verification code',
      text: `Your verification code is ${code}`,
      });
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: 'Email sending failed' });
    }
    
    await db.run(
        `INSERT INTO twofa_codes (contact, method, code_hash, expires_at) VALUES (?, ?, ?, ?)`,
        [contact, method, codeHash, expiresAt]);

    return reply.send({ success: true });
  }

  if (method === 'app') {
    let secret;
    let otpauthUrl;
    const now = Math.floor(Date.now() / 1000);
  
    const existing = await db.get(
      `SELECT secret_base32 FROM app_codes
       WHERE contact = ? AND verified = 0
       AND expires_at > ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [email, now]
    );
  
    if (existing) {
      secret = existing.secret_base32;
      otpauthUrl = speakeasy.otpauthURL({
        secret,
        label: `Transcendance:${email}`,
        issuer: 'Transcendance',
        encoding: 'base32'
      });
    } else {
      const secretObj = speakeasy.generateSecret({
        name: `Transcendance:${email}`,
        issuer: 'Transcendance'
      });
      secret = secretObj.base32;
      otpauthUrl = secretObj.otpauth_url;
  
      await db.run(
        `INSERT INTO app_codes (contact, secret_base32, expires_at, verified)
         VALUES (?, ?, ?, 0)`,
        [email, secret, now + 600] // 10 min
      );
    }
  
    const qrCodeDataURL = await QRCode.toDataURL(otpauthUrl);
    reply.send({ qrCodeDataURL });
  }  

  } catch (err) {
  req.log.error(err);
  return reply.code(500).send({ error: 'Internal server error' });
}
});


fastify.post('/api/2fa/verify-code', async (req, reply) => {
  const { twofaMethod, email, code } = req.body;

  if (!['app', 'email'].includes(twofaMethod)) {
    return reply.code(400).send('Invalid method');
  }

  if (!code) {
    return reply.code(400).send('Missing code');
  }

  if (twofaMethod === 'email') {

    console.log({ twofaMethod, email, code });

    const row = await db.get(
      `SELECT * FROM twofa_codes
       WHERE method = ? 
         AND contact = ? 
         AND expires_at > ? 
         AND verified = 0
       ORDER BY expires_at DESC
       LIMIT 1`,
      [twofaMethod, email, Math.floor(Date.now() / 1000)]
    );    

    console.log('DB row:', row);
    console.log(code, row.code_hash);

    if (!row || !(await bcrypt.compare(code, row.code_hash))) {
      return reply.code(400).send('Invalid or expired code');
    }
    await db.run(`UPDATE twofa_codes SET verified = 1 WHERE id = ?`, [row.id]);
  }
  else if (twofaMethod === 'app') {

    const row = await db.get(
      `SELECT * FROM app_codes 
       WHERE contact = ?
        AND expires_at > ? 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [email, Math.floor(Date.now() / 1000)]
    );

    if (!row) {
      return reply.code(400).send('No pending TOTP setup found');
    }

    const verified = speakeasy.totp.verify({
      secret: row.secret_base32,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (!verified) {
      return reply.code(400).send('Invalid authenticator code');
    }
  }    
  
  // await db.run(`
  //     UPDATE users
  //     SET twofa_method = ?, twofa_verified = 1, twofa_enabled = 1
  //     WHERE email = ?
  //   `, [twofaMethod, email]);
    
    return reply.send({ success: true });
});


// fastify.post('/api/2fa/send-code', async (req, reply) => {
//   try {
//     const { twofaMethod: method, email } = req.body;

//     if (!['app', 'email'].includes(method)) {
//       return reply.code(400).send({ error: 'Invalid method' });
//     }

//     if (method === 'email') {
//       const contact = email;
//       if (!contact) {
//         return reply.code(400).send({ error: 'Missing contact' });
//       }

//       const code = String(Math.floor(100000 + Math.random() * 900000));
//       const expiresAt = Math.floor(Date.now() / 1000) + 5 * 60;

//       try {
//         await transporter.sendMail({
//           from: `"Transcendance" <${process.env.MAIL_APP}>`,
//           to: contact,
//           subject: 'Your 2FA verification code',
//           text: `Your verification code is ${code}`,
//         });
//       } catch (err) {
//         req.log.error(err);
//         return reply.code(500).send({ error: 'Email sending failed' });
//       }

//       const codeHash = await bcrypt.hash(code, 10);
//       await db.run(
//         `INSERT INTO twofa_codes (contact, method, code_hash, expires_at, verified)
//          VALUES (?, ?, ?, ?, 0)`,
//         [contact, method, codeHash, expiresAt]
//       );

//       return reply.send({ success: true });
//     }

//     if (method === 'app') {
//       const now = Math.floor(Date.now() / 1000);

//       const existing = await db.get(
//         `SELECT secret_base32 FROM app_codes
//          WHERE contact = ? AND verified = 0 AND expires_at > ?
//          ORDER BY created_at DESC
//          LIMIT 1`,
//         [email, now]
//       );

//       let secret, otpauthUrl;
//       if (existing) {
//         secret = existing.secret_base32;
//         otpauthUrl = speakeasy.otpauthURL({
//           secret,
//           label: `Transcendance:${email}`,
//           issuer: 'Transcendance',
//           encoding: 'base32'
//         });
//       } else {
//         const secretObj = speakeasy.generateSecret({
//           name: `Transcendance:${email}`,
//           issuer: 'Transcendance'
//         });
//         secret = secretObj.base32;
//         otpauthUrl = secretObj.otpauth_url;

//         await db.run(
//           `INSERT INTO app_codes (contact, secret_base32, expires_at, verified)
//            VALUES (?, ?, ?, 0)`,
//           [email, secret, now + 600]
//         );
//       }

//       const qrCodeDataURL = await QRCode.toDataURL(otpauthUrl);
//       return reply.send({ qrCodeDataURL });
//     }

//   } catch (err) {
//     req.log.error(err);
//     return reply.code(500).send({ error: 'Internal server error' });
//   }
// });


// fastify.post('/api/2fa/verify-code', async (req, reply) => {
//   const { twofaMethod, email, code } = req.body;

//   if (!['app', 'email'].includes(twofaMethod)) {
//     return reply.code(400).send({ error: 'Invalid method' });
//   }
//   if (!code) {
//     return reply.code(400).send({ error: 'Missing code' });
//   }

//   const now = Math.floor(Date.now() / 1000);

//   if (twofaMethod === 'email') {
//     const row = await db.get(
//       `SELECT * FROM twofa_codes
//        WHERE method = ? 
//          AND contact = ? 
//          AND expires_at > ? 
//          AND verified = 0
//        ORDER BY expires_at DESC
//        LIMIT 1`,
//       [twofaMethod, email, now]
//     );    

//     if (!row || !(await bcrypt.compare(code, row.code_hash))) {
//       return reply.code(400).send({ error: 'Invalid or expired code' });
//     }

//     await db.run(`UPDATE twofa_codes SET verified = 1 WHERE id = ?`, [row.id]);
//     return reply.send({ success: true });
//   }

//   const row = await db.get(
//     `SELECT * FROM app_codes 
//      WHERE contact = ?
//      AND expires_at > ?
//      ORDER BY created_at DESC 
//      LIMIT 1`,
//     [email, now]
//   );
//   if (!row) {
//     return reply.code(400).send({ error: 'No pending TOTP setup found' });
//   }

//   const verified = speakeasy.totp.verify({
//     secret: row.secret_base32,
//     encoding: 'base32',
//     token: code,
//     window: 1
//   });

//   if (!verified) {
//     return reply.code(400).send({ error: 'Invalid authenticator code' });
//   }

//   // await db.run(`UPDATE app_codes SET verified = 1 WHERE id = ?`, [row.id]);
//   return reply.send({ success: true });
// });


fastify.patch('/api/2fa/change', { preValidation: [fastify.authenticate] }, async (req, reply) => {
  try {
  
  const userId = req.user.id;
  const { twofaMethod, email} = req.body;
  const user = await db.get(`SELECT * FROM users WHERE id = ?`, [userId]);

  if (twofaMethod === 'email'){
    await db.run(`
      UPDATE users
      SET twofa_enabled = 1, twofa_verified = 1, twofa_method = ?
      WHERE id = ?
    `, [twofaMethod, userId]);
    await db.run(`DELETE FROM app_codes WHERE contact = ?`, [user.email]);
    }
  else if (twofaMethod === 'app'){
    await db.run(`
      UPDATE users
      SET twofa_enabled = 1, twofa_verified = 1, twofa_method = ?
      WHERE id = ?
    `, [twofaMethod, userId]);
    await db.run(`DELETE FROM twofa_codes WHERE contact = ?`, [user.email]);
    }
  else if (twofaMethod === null){ 

    await db.run(`
      UPDATE users
      SET twofa_enabled = 0, twofa_verified = 0, twofa_method = ?
      WHERE id = ?
    `,[twofaMethod, userId]);
    await db.run(`DELETE FROM twofa_codes WHERE contact = ?`, [user.email]);
    await db.run(`DELETE FROM app_codes WHERE contact = ?`, [user.email]);
    } 
  reply.send({ success: true });
} catch (err) {
  req.log.error(err);
  return reply.code(500).send({ error: 'Internal server error' });
}
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

fastify.post('/api/login', async (req, reply) => {
  const { email, password } = req.body;
  if (!email || !password) return reply.code(400).send('Email and password required');

  const user = await db.get(`SELECT * FROM users WHERE email = ?`, [email]);
  if (!user) return reply.code(401).send('Invalid credentials');

  console.log('user in login:', user);

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

    // NEW: match history (last 50 private 1v1)
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
  
      await db.run(
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
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7
      });
  
      reply.send({ message: 'Logged out successfully' });
    } catch (err) {
      console.error('Logout error:', err);
      reply.code(500).send({ error: 'Logout failed' });
    }
  });

 fastify.get('/api/profile', { preValidation: [fastify.authenticate] }, async (req, reply) => {
    const user = await db.get(
      `SELECT id, email, display_name, avatar_url, twofa_method, twofa_enabled, twofa_verified, created_at, last_online, pvp_losses AS losses, pvp_wins AS wins, account_status FROM users WHERE id = ?`,
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
    await db.run(
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
  

      await db.run(
        `UPDATE users SET display_name = ? WHERE id = ?`,
        [trimmedName, req.user.id]
      );

    const updatedUser = await db.get(
      `SELECT id, email, display_name, avatar_url, created_at, last_online, account_status FROM users WHERE id = ?`,
      [req.user.id]
    );
    return { message: 'Profile updated', user: updatedUser };
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
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7
    });
    return { message: 'Your account has been permanently deleted' };
  });

};