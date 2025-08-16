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

    // await db.exec(`DROP TABLE IF EXISTS users;`); // to delete
    // await db.exec(`DROP TABLE IF EXISTS twofa_codes;`); 
    // await db.exec(`DROP TABLE IF EXISTS app_codes;`); 
    // await db.exec(`DROP TABLE IF EXISTS friends;`); 

    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT UNIQUE NOT NULL,
        avatar_url TEXT DEFAULT './uploads/default-avatar.png',

        twofa_method TEXT DEFAULT NULL CHECK (twofa_method IN ('app', 'email') OR twofa_method IS NULL),
        twofa_secret TEXT,
        twofa_verified INTEGER DEFAULT 0 CHECK (twofa_verified IN (0, 1)),
        twofa_enabled INTEGER DEFAULT 0 CHECK (twofa_enabled IN (0, 1)),

        pvp_wins   INTEGER NOT NULL DEFAULT 0 CHECK (pvp_wins   >= 0),
        pvp_losses INTEGER NOT NULL DEFAULT 0 CHECK (pvp_losses >= 0),

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_online TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        account_status TEXT DEFAULT 'offline' CHECK (account_status IN ('active', 'online', 'offline', 'banned'))
      )
    `);

    await db.exec('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_users_display_name ON users(display_name)');

    db.exec(`
      CREATE TABLE IF NOT EXISTS twofa_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact TEXT NOT NULL,
        method TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT (strftime('%s','now')),
        expires_at INTEGER,
        verified INTEGER NOT NULL DEFAULT 0
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS app_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact TEXT NOT NULL,
        secret_base32 TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        expires_at INTEGER NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0
      )
    `);

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

    await db.exec(`
      CREATE TABLE IF NOT EXISTS private_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL,
        recipient_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS game_rooms (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        host_id   INTEGER NOT NULL,
        guest_id  INTEGER,
        status    TEXT NOT NULL DEFAULT 'pending', -- pending | active | finished | cancelled
        mode      TEXT NOT NULL DEFAULT 'public',   -- public | private_1v1
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (guest_id) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON game_rooms(status);
    `);
await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }

  return db;
}

module.exports = initDb;