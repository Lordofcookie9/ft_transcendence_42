// Chat routes extracted from server.js
module.exports = function registerChatRoutes(fastify) {
  // --- Add sanitization helpers ---
  const ALLOWED_TOKEN_REGEX = /<\(\s*(invite|tournament)\s*\)\s*:\s*\d+\s*>/gi;
  const ESC_MAP = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;', '`':'&#96;' };

  function sanitizeMessage(input = '') {
    let s = String(input).slice(0, 1000);
    // Extract allowed special tokens first
    const tokens = [];
    s = s.replace(ALLOWED_TOKEN_REGEX, (m) => {
      tokens.push(m);
      return `__TOK${tokens.length - 1}__`;
    });
    // Escape everything else
    s = s.replace(/[&<>"'`]/g, c => ESC_MAP[c]);
    // Restore tokens (left unescaped so client can detect them)
    tokens.forEach((tok, i) => {
      s = s.replace(`__TOK${i}__`, tok);
    });
    return s;
  }

  fastify.get('/api/chat', async (request, reply) => {
    try {
      let currentUserId = null;
      try {
        const authorized = await request.jwtVerify();
        currentUserId = authorized.id;
      } catch {}

      // Use SQLite's UTC now; we'll format all returned timestamps as ISO UTC (…T…Z)
      const twoHoursAgoExpr = `datetime('now','-2 hours')`;

      // Unauthenticated: public chat only, ISO timestamps
      if (!currentUserId) {
        const publicMessages = await fastify.db.all(`
          SELECT 
            m.alias,
            m.message,
            strftime('%Y-%m-%dT%H:%M:%SZ', m.timestamp) AS timestamp,
            u.id AS user_id
          FROM messages m
          LEFT JOIN users u ON u.display_name = m.alias
          WHERE m.timestamp >= ${twoHoursAgoExpr}
          ORDER BY m.id ASC
        `);
        return publicMessages;
      }

      // Authenticated: public + private (from/to me), all with ISO UTC timestamps
      const rows = await fastify.db.all(
        `
        SELECT alias, message, timestamp, user_id
        FROM (
          -- Public messages
          SELECT 
            m.alias AS alias,
            m.message AS message,
            strftime('%Y-%m-%dT%H:%M:%SZ', m.timestamp) AS timestamp,
            u.id AS user_id
          FROM messages m
          LEFT JOIN users u ON u.display_name = m.alias
          WHERE m.timestamp >= ${twoHoursAgoExpr}

          UNION ALL

          -- Private messages (prefixed so the UI can style them)
          SELECT
            su.display_name AS alias,
            ('<from "' || su.display_name || '" to "' || ru.display_name || '"> ' || pm.message) AS message,
            strftime('%Y-%m-%dT%H:%M:%SZ', pm.timestamp) AS timestamp,
            su.id AS user_id
          FROM private_messages pm
          JOIN users su ON su.id = pm.sender_id
          JOIN users ru ON ru.id = pm.recipient_id
          WHERE (pm.sender_id = ? OR pm.recipient_id = ?)
            AND pm.timestamp >= ${twoHoursAgoExpr}
        ) AS feed
        WHERE NOT EXISTS (
          SELECT 1 FROM friends f
          WHERE f.user_id = ? AND f.friend_id = feed.user_id
            AND f.status IN ('blocking','blocked')
        )
        AND NOT EXISTS (
          SELECT 1
          FROM friends f2
          JOIN users u2 ON u2.id = f2.friend_id
          WHERE f2.user_id = ?
            AND f2.status IN ('blocking','blocked')
            AND u2.display_name = feed.alias
        )
        -- ISO 'YYYY-MM-DDTHH:MM:SSZ' sorts correctly lexicographically
        ORDER BY feed.timestamp ASC
        `,
        [currentUserId, currentUserId, currentUserId, currentUserId]
      );

      return rows;
    } catch (err) {
      request.log.error(err);
      reply.code(500).send({ error: 'Failed to fetch messages' });
    }
  });

  fastify.post('/api/chat', { preValidation: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { message } = request.body || {};
      if (!message || !String(message).trim()) {
        return reply.code(400).send({ error: 'Missing message' });
      }

      const row = await fastify.db.get(
        'SELECT display_name FROM users WHERE id = ?',
        [request.user.id]
      );
      const alias = row?.display_name;
      if (!alias) return reply.code(400).send({ error: 'Invalid user' });

      const clean = sanitizeMessage(message);

      await fastify.db.run(
        'INSERT INTO messages (alias, message) VALUES (?, ?)',
        [alias, clean]
      );

      return { success: true };
    } catch (err) {
      request.log.error({ err }, 'Failed to save chat message');
      reply.code(500).send({ error: 'Failed to save message' });
    }
  });

  fastify.post('/api/chat/private', { preValidation: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { recipient_id, message } = request.body || {};
      if (!recipient_id || !message || !String(message).trim()) {
        return reply.code(400).send({ error: 'recipient_id and message are required' });
      }
      const senderId = request.user.id;
      if (Number(recipient_id) === Number(senderId)) {
        return reply.code(400).send({ error: 'Cannot send a private message to yourself' });
      }

      const rec = await fastify.db.get('SELECT id FROM users WHERE id = ?', [recipient_id]);
      if (!rec) return reply.code(404).send({ error: 'Recipient not found' });

      const clean = sanitizeMessage(message);

      await fastify.db.run(
        'INSERT INTO private_messages (sender_id, recipient_id, message) VALUES (?, ?, ?)',
        [senderId, recipient_id, clean]
      );

      return { success: true };
    } catch (err) {
      request.log.error({ err }, 'Failed to send private chat message');
      reply.code(500).send({ error: 'Failed to send private message' });
    }
  });
}
