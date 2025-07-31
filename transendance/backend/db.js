// backend/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Point to shared /app/db location (bind-mounted to ./db on host)
const dbPath = path.join(__dirname, 'db/database.sqlite');
console.log("Using SQLite DB at", dbPath);
const db = new sqlite3.Database(dbPath);

// Create tables if not exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alias TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS counters (
      id TEXT PRIMARY KEY,
      count INTEGER DEFAULT 0
    );
  `);
});

module.exports = db;