const client = require('prom-client');

client.collectDefaultMetrics();

const httpRequests = new client.Counter({
  name: "http_requests_total",
  help: "Number of HTTP requests processed",
  labelNames: ["method", "route", "status"],
});

const userCountGauge = new client.Gauge({
  name: 'app_users_total',
  help: 'Total number of users in SQLite'
});

const matchCountGauge = new client.Gauge({
  name: 'app_matches_total',
  help: 'Total number of matches in SQLite'
});

async function updateUserCount(db) {
  const result = await db.get('SELECT COUNT(*) as cnt FROM users');
  userCountGauge.set(result.cnt);
}

async function updateMatchCount(db) {
  const result = await db.get('SELECT COUNT(*) as cnt FROM matches');
  matchCountGauge.set(result.cnt);
}

function registerMetrics(fastify) {
 
  fastify.get('/metrics', async (req, reply) => {
    reply.header('Content-Type', client.register.contentType);
    return client.register.metrics();
  });
 
  setInterval(async () => {
    try {
      await updateUserCount(fastify.db);
      await updateMatchCount(fastify.db);
    } catch (err) {
      console.error("DB metrics update failed", err);
    }
  }, 10000);
 }

module.exports = {
  registerMetrics,
  httpRequests,
  userCountGauge,
  matchCountGauge
};
