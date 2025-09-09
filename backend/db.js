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
        password_hash TEXT DEFAULT NULL,
        display_name TEXT UNIQUE NOT NULL,
        avatar_url TEXT DEFAULT './uploads/default-avatar.png',
        anonymized INTEGER DEFAULT 0,

        twofa_method TEXT DEFAULT NULL CHECK (twofa_method IN ('app', 'email') OR twofa_method IS NULL),
        twofa_secret TEXT,
        twofa_verified INTEGER DEFAULT 0 CHECK (twofa_verified IN (0, 1)),
        twofa_enabled INTEGER DEFAULT 0 CHECK (twofa_enabled IN (0, 1)),

        oauth_provider TEXT DEFAULT NULL, 
        oauth_id TEXT DEFAULT NULL,

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
        expires_at INTEGER DEFAULT 1,
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
      CREATE TABLE IF NOT EXISTS matches (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          room_id      INTEGER,
          mode         TEXT NOT NULL,            -- 'private_1v1' | 'public' | etc
          host_id      INTEGER NOT NULL,
          guest_id     INTEGER NOT NULL,
          winner_id    INTEGER NOT NULL,
          loser_id     INTEGER NOT NULL,
          host_score   INTEGER,
          guest_score  INTEGER,
          finished_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_matches_user_time ON matches(finished_at);
        CREATE INDEX IF NOT EXISTS idx_matches_host ON matches(host_id);
        CREATE INDEX IF NOT EXISTS idx_matches_guest ON matches(guest_id);
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
    // --- Online tournament lobbies ---
    await db.exec(`
      CREATE TABLE IF NOT EXISTS tournament_lobbies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        host_id INTEGER NOT NULL,
        size INTEGER NOT NULL CHECK (size BETWEEN 3 AND 8),
        status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'started', 'cancelled', 'finished')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS tournament_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lobby_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        alias TEXT NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (lobby_id, user_id),
        FOREIGN KEY (lobby_id) REFERENCES tournament_lobbies(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    // --- Online tournament bracket & matches ---
    await db.exec(`
      CREATE TABLE IF NOT EXISTS tournament_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lobby_id INTEGER NOT NULL,
        round INTEGER NOT NULL,             -- 0-based
        match_index INTEGER NOT NULL,       -- 0-based within the round
        p1_user_id INTEGER,
        p1_alias TEXT,
        p2_user_id INTEGER,
        p2_alias TEXT,
        room_id INTEGER,                    -- links to game_rooms.id once created
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','finished')),
        winner_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (lobby_id) REFERENCES tournament_lobbies(id) ON DELETE CASCADE,
        FOREIGN KEY (p1_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (p2_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE SET NULL
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