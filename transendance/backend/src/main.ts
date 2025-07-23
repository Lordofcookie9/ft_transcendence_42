import Fastify from 'fastify';
import cors from '@fastify/cors';
import sqlite3 from 'sqlite3';

const fastify = Fastify();

async function start() {
  // ✅ Register CORS to allow browser access (including from host.docker.internal)
  await fastify.register(cors, {
    origin: '*', // 👈 Allow all origins (for development)
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  const db = new sqlite3.Database('./counter.db');

  // Create table if not exists
  db.run(`
    CREATE TABLE IF NOT EXISTS counter (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      value INTEGER NOT NULL
    )
  `, (err) => {
    if (err) throw err;

    // Initialize with value 0 if not already present
    db.get('SELECT * FROM counter WHERE id = 1', (err, row) => {
      if (!row) {
        db.run('INSERT INTO counter (id, value) VALUES (1, 0)');
      }
    });
  });

  // GET /counter → returns current value
  fastify.get('/counter', (req, reply) => {
    db.get('SELECT value FROM counter WHERE id = 1', (err, row) => {
      if (err) return reply.status(500).send({ error: err.message });
      reply.send({ value: (row as any)?.value ?? 0 });
    });
  });

  // POST /counter → increments and returns new value
  fastify.post('/counter', (req, reply) => {
    db.run('UPDATE counter SET value = value + 1 WHERE id = 1', function (err) {
      if (err) return reply.status(500).send({ error: err.message });

      db.get('SELECT value FROM counter WHERE id = 1', (err, row) => {
        if (err) return reply.status(500).send({ error: err.message });
        const value = (row as { value: number })?.value ?? 0;
        reply.send({ value });
      });
    });
  });


  fastify.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
    if (err) throw err;
    console.log('Backend running on http://localhost:3000');
  });
}

start();
