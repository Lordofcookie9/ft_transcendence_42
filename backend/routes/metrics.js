// Small metrics routes extracted from server.js
module.exports = function registerMetricsRoutes(fastify) {
  fastify.get('/api/count', async (request, reply) => {
    const id = request.query.id;
    try {
      const row = await fastify.db.get('SELECT count FROM counters WHERE id = ?', [id]);
      return { count: row ? row.count : 0 };
    } catch (err) {
      request.log.error(err);
      reply.code(500).send({ error: 'Failed to get count' });
    }
  });

  fastify.post('/api/increment', async (request, reply) => {
    const id = request.query.id;
    try {
      await fastify.db.run(
        `
        INSERT INTO counters (id, count)
        VALUES (?, 1)
        ON CONFLICT(id) DO UPDATE SET count = count + 1
        `,
        [id]
      );

      const row = await fastify.db.get('SELECT count FROM counters WHERE id = ?', [id]);
      return { count: row.count };
    } catch (err) {
      request.log.error(err);
      reply.code(500).send({ error: 'Failed to increment counter' });
    }
  });
};
