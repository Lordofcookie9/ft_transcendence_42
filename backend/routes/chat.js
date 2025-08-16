// Chat routes extracted from server.js
module.exports = function registerChatRoutes(fastify) {
    fastify.get('/api/chat', async (request, reply) => {
      try {
        let currentUserId = null;
        try {
          const authorized = await request.jwtVerify();
          currentUserId = authorized.id;
        } catch {}

        const twoHoursAgo = `datetime('now','-2 hours')`;

        if (!currentUserId) {
          const publicMessages = await fastify.db.all(`
            SELECT 
              m.alias,
              m.message,
              m.timestamp,
              u.id AS user_id
            FROM messages m
            LEFT JOIN users u ON u.display_name = m.alias
            WHERE m.timestamp >= ${twoHoursAgo}
            ORDER BY m.id ASC
          `);
          return publicMessages;
        }

        const rows = await fastify.db.all(`
          SELECT alias, message, timestamp, user_id FROM (
            SELECT 
              m.alias AS alias,
              m.message AS message,
              m.timestamp AS timestamp,
              u.id AS user_id
            FROM messages m
            LEFT JOIN users u ON u.display_name = m.alias
            WHERE m.timestamp >= ${twoHoursAgo}

            UNION ALL

            SELECT
              su.display_name AS alias,
              ('<(private): ' || pm.message || '>') AS message,
              pm.timestamp AS timestamp,
              su.id AS user_id
            FROM private_messages pm
            JOIN users su ON su.id = pm.sender_id
            WHERE (pm.sender_id = ? OR pm.recipient_id = ?)
              AND pm.timestamp >= ${twoHoursAgo}
          )
          WHERE NOT EXISTS (
            SELECT 1 FROM friends f
            WHERE f.user_id = ? AND f.friend_id = user_id
              AND f.status IN ('blocking','blocked')
          )
          AND NOT EXISTS (
            SELECT 1
            FROM friends f2
            JOIN users u2 ON u2.id = f2.friend_id
            WHERE f2.user_id = ?
              AND f2.status IN ('blocking','blocked')
              AND u2.display_name = alias
          )
          ORDER BY datetime(timestamp) ASC
        `, [currentUserId, currentUserId, currentUserId, currentUserId]);

        return rows;
      } catch (err) {
        request.log.error(err);
        reply.code(500).send({ error: 'Failed to fetch messages' });
      }
    });

    fastify.post('/api/chat', { preValidation: [fastify.authenticate] }, async (request, reply) => {
      try {
        const { message } = request.body || {};
        if (!message || !message.trim()) {
          return reply.code(400).send({ error: 'Missing alias or message' });
        }

        const normalized = message.trim();
        if (normalized.length > 1000) {
          return reply.code(403).send({ error: 'Message must be under 1000 characters long' });
        }

        const row = await fastify.db.get(
          'SELECT display_name FROM users WHERE id = ?',
          [request.user.id]
        );
        const alias = row?.display_name;

        if (!alias) {
          return reply.code(400).send({ error: 'Invalid user' });
        }

        await fastify.db.run(
          'INSERT INTO messages (alias, message) VALUES (?, ?)',
          [alias, normalized]
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
        if (!rec) {
          return reply.code(404).send({ error: 'Recipient not found' });
        }

        await fastify.db.run(
          'INSERT INTO private_messages (sender_id, recipient_id, message) VALUES (?, ?, ?)',
          [senderId, recipient_id, String(message).trim()]
        );

        return { success: true };
      } catch (err) {
        request.log.error({ err }, 'Failed to save private chat message');
        reply.code(500).send({ error: 'Failed to send private message' });
      }
    });
}
