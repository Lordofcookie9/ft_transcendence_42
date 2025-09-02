
module.exports = function registerInactivityMonitor(fastify) {
  const INACTIVE_MINUTES = Number(process.env.TOURNAMENT_INACTIVE_MINUTES || 5);
  const SWEEP_INTERVAL_MS = Number(process.env.INACTIVITY_SWEEP_INTERVAL_MS || 30000);

  async function sweepOnce() {
    try {
      // Find lobbies that are waiting or started, have no ACTIVE matches,
      // and whose last_activity_at is older than the threshold.
      const rows = await fastify.db.all(
        `SELECT tl.id AS lobby_id
           FROM tournament_lobbies tl
          WHERE tl.status IN ('waiting','started')
            AND COALESCE(strftime('%s', 'now') - strftime('%s', tl.last_activity_at), 999999) >= (? * 60)
            AND NOT EXISTS (
              SELECT 1 FROM tournament_matches tm
               WHERE tm.lobby_id = tl.id AND tm.status = 'active'
            )`
        , [INACTIVE_MINUTES]
      );
      if (!rows || !rows.length) return;

      for (const r of rows) {
        try {
          await fastify.broadcastTournamentAbort(String(r.lobby_id), 'inactive_timeout');
        } catch (e) {
          fastify.log && fastify.log.error && fastify.log.error({ e, lobbyId: r.lobby_id }, 'inactive_abort_failed');
        }
      }
    } catch (err) {
      fastify.log && fastify.log.error && fastify.log.error({ err }, 'inactivity_monitor_sweep_failed');
    }
  }

  const t = setInterval(() => { sweepOnce(); }, SWEEP_INTERVAL_MS);
  t.unref?.();

  fastify.addHook('onClose', async () => { clearInterval(t); });

  // Manual trigger endpoint for debugging
  fastify.get('/internal/inactivity-monitor/sweep', async () => {
    await sweepOnce();
    return { ok: true };
  });
};
