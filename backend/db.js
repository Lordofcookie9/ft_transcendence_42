const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

const dbPath = path.join(__dirname, 'db/database.sqlite');

async function initDb() {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  await db.exec('PRAGMA foreign_keys = ON;');

  try {
    await db.exec('BEGIN TRANSACTION');

    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT UNIQUE NOT NULL,
        avatar_url TEXT DEFAULT './uploads/default-avatar.png',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_online TIMESTAMP,
        account_status TEXT DEFAULT 'offline' CHECK (account_status IN ('active', 'online', 'offline', 'banned'))
      )
    `);

    await db.exec('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_users_display_name ON users(display_name)');

    await db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alias TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS counters (
        id TEXT PRIMARY KEY,
        count INTEGER DEFAULT 0
      )
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS deleted_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_hash TEXT, 
        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deletion_reason TEXT DEFAULT 'user request'
      )
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS friends (
        user_id INTEGER,
        friend_id INTEGER,
        status TEXT CHECK (status IN ('pending', 'adding', 'added', 'accepted', 'blocked', 'blocking')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        opponent_id INTEGER,
        winner_id INTEGER,
        result TEXT CHECK (result IN ('win', 'lose', 'draw')),
        score INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (opponent_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }

  return db;
}

module.exports = initDb;