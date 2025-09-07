// routes/presence.js
// Check heartbeat for presence/online status
module.exports = function registerPresenceRoutes(fastify) {
  fastify.post(
    '/api/presence/heartbeat',
    { preValidation: [fastify.authenticate] },
    async (req, reply) => {
      try {
        await fastify.db.run(
          `UPDATE users
             SET last_online = CURRENT_TIMESTAMP,
                 account_status = 'online'
           WHERE id = ?`,
          [req.user.id]
        );
        const now = await fastify.db.get(
          `SELECT strftime('%Y-%m-%dT%H:%M:%SZ','now') AS now`
        );
        reply.send({ ok: true, server_time: now?.now });
      } catch (err) {
        req.log.error({ err }, 'presence_heartbeat_failed');
        reply.code(500).send({ ok: false });
      }
    }
  );

  fastify.post(
    '/api/presence/offline',
    { preValidation: [fastify.authenticate] },
    async (req, reply) => {
      try {
        await fastify.db.run(
          `UPDATE users
            SET account_status = 'offline'
          WHERE id = ?`,
          [req.user.id]
        );
        reply.send({ ok: true });
      } catch (err) {
        req.log.error({ err }, 'presence_offline_failed');
        reply.code(500).send({ ok: false });
      }
    }
  );

  // Mark users offline if no heartbeat in 60s
  const OFFLINE_AFTER_SECONDS = 60;
  const SWEEP_INTERVAL_MS = 15_000;
  const sweep = async () => {
    try {
      await fastify.db.run(
        `UPDATE users
            SET account_status = 'offline'
          WHERE account_status != 'offline'
            AND last_online < datetime('now', ?)`,
        [`-${OFFLINE_AFTER_SECONDS} seconds`]
      );
    } catch (err) {
      fastify.log.error({ err }, 'presence_sweep_failed');
    }
  };
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
  fastify.addHook('onClose', async () => clearInterval(timer));
};
