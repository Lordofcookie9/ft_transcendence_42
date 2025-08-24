module.exports = function registerHostMonitor(fastify) {
  const HOST_SWEEP_INTERVAL_MS = Number(process.env.HOST_SWEEP_INTERVAL_MS || 5000);
  const HOST_GRACE_SECONDS = Number(process.env.HOST_GRACE_SECONDS || 90);

  const lastHandoverAt = new Map(); // lobby_id -> ms timestamp (debounce)

  async function sweepOnce() {
    try {
      const lobbies = await fastify.db.all(
        `SELECT id, host_id
           FROM tournament_lobbies
          WHERE status IN ('waiting','started')`
      );
      if (!lobbies || lobbies.length === 0) return;

      for (const lobby of lobbies) {
        const lobbyId = lobby.id;
        const hostId = lobby.host_id;

        // Debounce: don't attempt more than once every 30s per lobby
        const last = lastHandoverAt.get(lobbyId) || 0;
        if (Date.now() - last < 30_000) continue;

        const host = await fastify.db.get(
          `SELECT id, account_status, last_online FROM users WHERE id = ?`,
          [hostId]
        );
        if (!host) continue;

        // Consider offline if explicitly offline and last_online is older than grace window
        const lastOnlineMs = host.last_online ? Date.parse(host.last_online) : 0;
        const ageSeconds = lastOnlineMs ? Math.floor((Date.now() - lastOnlineMs) / 1000) : Number.MAX_SAFE_INTEGER;
        const offlineLongEnough = host.account_status === 'offline' && ageSeconds > HOST_GRACE_SECONDS;
        if (!offlineLongEnough) continue;

        // Find earliest-joined online participant (excluding current host)
        const replacement = await fastify.db.get(
          `SELECT tp.user_id AS user_id
             FROM tournament_participants tp
             JOIN users u ON u.id = tp.user_id
            WHERE tp.lobby_id = ?
              AND tp.user_id != ?
              AND u.account_status = 'online'
            ORDER BY tp.joined_at ASC, tp.user_id ASC
            LIMIT 1`,
          [lobbyId, hostId]
        );
        if (!replacement || !replacement.user_id) continue;

        try {
          await fastify.db.run(
            `UPDATE tournament_lobbies SET host_id = ? WHERE id = ?`,
            [replacement.user_id, lobbyId]
          );
          lastHandoverAt.set(lobbyId, Date.now());

          // Optional broadcast (frontend is already polling, so this is just a hint)
          try {
            const payload = JSON.stringify({
              type: 'tournament:host_handover',
              payload: {
                lobby_id: lobbyId,
                old_host_id: hostId,
                new_host_id: replacement.user_id,
                reason: 'timeout',
                at: Date.now()
              }
            });
            const clients = fastify?.wss?.clients;
            if (clients && typeof clients.forEach === 'function') {
              clients.forEach((ws) => {
                try { ws.send(payload); } catch {}
              });
            }
          } catch (_) {}

          fastify.log.info({ lobbyId, old_host_id: hostId, new_host_id: replacement.user_id },
                           'tournament host handover (timeout)');
        } catch (e) {
          fastify.log.error(e, 'failed to update host_id');
        }
      }
    } catch (err) {
      fastify.log.error({ err }, 'host-monitor sweep failed');
    }
  }

  const timer = setInterval(() => { sweepOnce(); }, HOST_SWEEP_INTERVAL_MS);
  timer.unref?.();

  fastify.addHook('onClose', async () => { clearInterval(timer); lastHandoverAt.clear(); });
  fastify.get('/internal/host-monitor/sweep', async () => {
    await sweepOnce();
    return { ok: true };
  });
};