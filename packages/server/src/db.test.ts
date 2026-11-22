import { DatabaseSync } from "node:sqlite";
import { test, expect } from "vitest";
import { migrateDatabase, migrations } from "./db.js";

test("migrates the original schema without losing users and can run repeatedly", () => {
  const db = new DatabaseSync(":memory:");
  try {
    migrations[0].up(db);
    db.prepare("INSERT INTO users VALUES (1, 'existing', 'salt', 'hash')").run();
    db.prepare("INSERT INTO sessions VALUES ('old-token', 1)").run();
    migrateDatabase(db); migrateDatabase(db);
    expect(db.prepare("SELECT name FROM users WHERE id = 1").get()?.name).toBe("existing");
    expect(db.prepare("SELECT expires_at FROM sessions").get()?.expires_at).toBe(0);
    expect(db.prepare("SELECT version FROM schema_version ORDER BY version").all().map(row => row.version)).toEqual([1, 2, 3]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM tables").get()?.count).toBe(0);
  } finally { db.close(); }
});

test("rolls back a failed migration, including its schema and version marker", () => {
  const db = new DatabaseSync(":memory:");
  try {
    migrateDatabase(db);
    expect(() => migrateDatabase(db, [...migrations, { version: 4, up: db => {
      db.exec("CREATE TABLE incomplete (id INTEGER)"); throw new Error("failed");
    } }])).toThrow("failed");
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'incomplete'").get()).toBeUndefined();
    expect(db.prepare("SELECT MAX(version) AS version FROM schema_version").get()?.version).toBe(3);
  } finally { db.close(); }
});
