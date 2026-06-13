// db.js — SQLite connection + schema.
// The schema is created on every start (and by seed.js), so the app runs with
// no manual migration step. All money columns are INTEGER fils — never floats.

const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS groups (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    simplify_debts INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER NOT NULL REFERENCES groups(id),
    user_id  INTEGER NOT NULL REFERENCES users(id),
    PRIMARY KEY (group_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id       INTEGER NOT NULL REFERENCES groups(id),
    description    TEXT NOT NULL,
    amount_fils    INTEGER NOT NULL,
    date           TEXT NOT NULL,
    category       TEXT NOT NULL DEFAULT 'general',
    payer_id       INTEGER NOT NULL REFERENCES users(id),
    split_method   TEXT NOT NULL CHECK (split_method IN ('equal', 'exact')),
    created_by     INTEGER NOT NULL REFERENCES users(id),
    created_at     TEXT NOT NULL,
    last_edited_by INTEGER REFERENCES users(id),
    last_edited_at TEXT
  );

  CREATE TABLE IF NOT EXISTS expense_splits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id  INTEGER NOT NULL REFERENCES expenses(id),
    user_id     INTEGER NOT NULL REFERENCES users(id),
    amount_fils INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settlements (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id    INTEGER NOT NULL REFERENCES groups(id),
    payer_id    INTEGER NOT NULL REFERENCES users(id),
    payee_id    INTEGER NOT NULL REFERENCES users(id),
    amount_fils INTEGER NOT NULL,
    date        TEXT NOT NULL,
    created_by  INTEGER NOT NULL REFERENCES users(id),
    created_at  TEXT NOT NULL
  );
`);

// v1.1 migration: expenses gained a category column. A data.db created before
// v1.1 lacks it (CREATE TABLE IF NOT EXISTS won't touch an existing table),
// so add it in place. Idempotent: skipped whenever the column already exists.
const hasCategory = db
  .prepare('PRAGMA table_info(expenses)')
  .all()
  .some((col) => col.name === 'category');
if (!hasCategory) {
  db.exec("ALTER TABLE expenses ADD COLUMN category TEXT NOT NULL DEFAULT 'general'");
}

module.exports = db;
