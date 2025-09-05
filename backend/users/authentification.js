module.exports = async function registerAuth(fastify)
{	
	const bcrypt = require('bcrypt');
	const nodemailer = require('nodemailer');
	const speakeasy = require('speakeasy');
	const QRCode = require('qrcode');
	const axios = require('axios');
  const MAIL_APP = process.env.MAIL_APP;
	const MAIL_APPPW = process.env.MAIL_APPPW;
  const sanitizer = require('./utility');
	
	const db = fastify.db;
  if (!MAIL_APP || !MAIL_APPPW)
		fastify.log.warn('MAIL_APP or MAIL_APPPW not set — email 2FA will fail until configured');

  /** OAuth 2.0 - remote authentication */

	fastify.get('/api/auth/42', async (req, reply) => {
		const clientId = process.env.ECOLE_CLIENT_ID;      
		const redirectUri = process.env.ECOLE_REDIRECT_URI;
		const authUrl = `https://api.intra.42.fr/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=public`;
		reply.redirect(authUrl);
	});

  fastify.get('/api/auth/42/callback', async (req, reply) => {
		const { code } = req.query;
		if (!code)
			return reply.code(400).send('Missing code');

		try {
			const tokenRes = await axios.post(
				'https://api.intra.42.fr/oauth/token',
				new URLSearchParams({
					grant_type: 'authorization_code',
					client_id: process.env.ECOLE_CLIENT_ID,
					client_secret: process.env.ECOLE_CLIENT_SECRET,
					code,
					redirect_uri: process.env.ECOLE_REDIRECT_URI
				}),
				{ headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
			);

      const accessToken = tokenRes.data.access_token;

			const userRes = await axios.get('https://api.intra.42.fr/v2/me', {
				headers: { Authorization: `Bearer ${accessToken}`}
			});

			const oauth_id = userRes.data.id;
			let email = sanitizer.sanitizeEmail(userRes.data.email);
			let display_name = sanitizer.sanitizeDisplayName(userRes.data.login);
			let avatar_url = sanitizer.sanitizeAvatar(userRes.data.image?.link || '/default-avatar.png', true);
			if (!sanitizer.validEmail(email) || !sanitizer.validDisplayName(display_name))
				return (reply.code(400).send('Invalid OAuth profile data'));

      let user = await db.get('SELECT id, display_name FROM users WHERE oauth_provider = ? AND oauth_id = ?', ['42', oauth_id]);
    
			if (!user)
			{
				await db.run(
					`INSERT INTO users (email, display_name, avatar_url, oauth_provider, oauth_id, account_status)
                    VALUES (?, ?, ?, ?, ?, ?)`,
					[email, display_name, avatar_url || '/default-avatar.png', '42', oauth_id,'online']
          		);
				user = await db.get('SELECT id, display_name FROM users WHERE oauth_provider = ? AND oauth_id = ?', ['42', oauth_id]);
			}
  
			const token = fastify.jwt.sign({ id: user.id, display_name: user.display_name });
			reply.setCookie('token', token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60*60*24*7 });
			return reply.redirect('/profile');
		} catch (err) {
			console.error(err);
			reply.code(500).send('42 OAuth error');
		}
  });


  /** Two-Factor Authentication */

	const transporter = nodemailer.createTransport({
		host: 'smtp.gmail.com',
		port: 587,
		secure: false,
		auth: { user: MAIL_APP, pass: MAIL_APPPW}
	});

	fastify.patch('/api/email', { preValidation: [fastify.authenticate] }, async (req, reply) => {
		if (!req.user)
			return reply.code(401).send('Not authenticated');

		let { email } = req.body;
		email = sanitizer.sanitizeEmail(email);
		if (!sanitizer.validEmail(email))
			return (reply.code(400).send('Invalid email'));
		if (!email)
			return reply.code(400).send('Email is required');

		const currData = await db.get(
			`SELECT email, twofa_method FROM users
            WHERE id = ? `,
			[req.user.id]
		);

		if (!currData)
			return reply.code(404).send('User not found');

		try {
			if (currData.twofa_method === 'app')
			{ 
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
        return reply.code(500).send({ error: 'Email sending failed' });}
      
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
  return reply.code(500).send({ error: 'Internal server error' });}
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

    if (!row || !(await bcrypt.compare(code, row.code_hash))) {
      return reply.code(400).send('Invalid or expired code');
    }
    await db.run(`UPDATE twofa_codes SET verified = 1 WHERE id = ?`, [row.id]);
  }
  else if (twofaMethod === 'app') {

    const row = await db.get(
      `SELECT * FROM app_codes 
       WHERE contact = ?
       AND (expires_at = 0 OR expires_at > ?)
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
    await db.run(`UPDATE app_codes SET verified = 1, expires_at = 0 WHERE id = ?`, [row.id]);
  }    
    
  return reply.send({ success: true });
  });

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
}