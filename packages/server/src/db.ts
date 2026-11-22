import type { DatabaseSync } from "node:sqlite";
import { createTableSchema } from "./tables.js";

export interface Migration {
  version: number;
  up: (db: DatabaseSync) => void;
}
export const migrations: readonly Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS command_log (
        table_id TEXT NOT NULL,
        action_id TEXT NOT NULL,
        seat INTEGER NOT NULL,
        expected_version INTEGER NOT NULL,
        command_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL,
        resulting_version INTEGER NOT NULL,
        PRIMARY KEY (table_id, action_id)
      )
    `);
    },
  },
  { version: 2, up: createTableSchema },
  { version: 3, up: addSessionExpiry },
];

export function migrateDatabase(db: DatabaseSync, steps = migrations): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const current = Number(
    db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_version").get()!
      .version,
  );
  if (current > steps[steps.length - 1].version)
    throw new Error("Database schema is newer than this server");
  for (const step of steps) {
    if (step.version <= current) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      step.up(db);
      db.prepare("INSERT INTO schema_version (version, applied_at) VALUES (?, ?)").run(
        step.version,
        Date.now(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

function addSessionExpiry(db: DatabaseSync): void {
  const columns = new Set(
    db
      .prepare("PRAGMA table_info(sessions)")
      .all()
      .map((row) => row.name),
  );
  if (!columns.has("created_at"))
    db.exec("ALTER TABLE sessions ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0");
  if (!columns.has("expires_at"))
    db.exec("ALTER TABLE sessions ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0");
  db.exec("CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at)");
}
