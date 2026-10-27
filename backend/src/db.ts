import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS centers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  phone       TEXT,
  address     TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  center_id     INTEGER REFERENCES centers(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('super_admin','admin','teacher','support_teacher','student','parent')),
  full_name     TEXT NOT NULL,
  phone         TEXT,
  login         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  birth_date    TEXT,
  address       TEXT,
  notes         TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_center_role ON users(center_id, role);

CREATE TABLE IF NOT EXISTS parent_students (
  parent_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_id, student_id)
);

CREATE TABLE IF NOT EXISTS groups (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  center_id          INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  subject            TEXT,
  teacher_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  support_teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  monthly_price      INTEGER NOT NULL DEFAULT 0,
  start_date         TEXT,
  active             INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_groups_center ON groups(center_id);

CREATE TABLE IF NOT EXISTS group_students (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at  TEXT NOT NULL DEFAULT (date('now')),
  left_at    TEXT,
  UNIQUE (group_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_gs_student ON group_students(student_id);

CREATE TABLE IF NOT EXISTS schedule_slots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  weekday    INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time TEXT NOT NULL,
  end_time   TEXT NOT NULL,
  room       TEXT
);
CREATE INDEX IF NOT EXISTS idx_slots_group ON schedule_slots(group_id);

CREATE TABLE IF NOT EXISTS attendance (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('present','absent','late','excused')),
  note       TEXT,
  marked_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (group_id, student_id, date)
);
CREATE INDEX IF NOT EXISTS idx_att_student_date ON attendance(student_id, date);

CREATE TABLE IF NOT EXISTS payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  center_id    INTEGER NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  student_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id     INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  amount       INTEGER NOT NULL CHECK (amount > 0),
  method       TEXT NOT NULL CHECK (method IN ('cash','card','transfer')),
  period_month TEXT NOT NULL,
  paid_at      TEXT NOT NULL,
  note         TEXT,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pay_student ON payments(student_id, period_month);
CREATE INDEX IF NOT EXISTS idx_pay_center ON payments(center_id, period_month);
`;

export function openDb(file: string): DB {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
