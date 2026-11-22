import type { DatabaseSync } from "node:sqlite";
import type { GameState, TableSettings, TrickPlayState } from "@pref/engine";

export interface Table {
  state: TrickPlayState | GameState | null;
  version: number;
  readonly actionIds: Set<string>;
  readonly players: [number | null, number | null, number | null];
  readonly hostUserId: number | null;
  settings: TableSettings;
  settingsRevision: number;
  dealt: boolean;
  confirmed: [boolean, boolean, boolean];
}

export function createTableSchema(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS tables (
    id TEXT PRIMARY KEY, host_user_id INTEGER, players_json TEXT NOT NULL,
    settings_json TEXT NOT NULL, settings_revision INTEGER NOT NULL,
    confirmed_json TEXT NOT NULL, dealt INTEGER NOT NULL, version INTEGER NOT NULL,
    state_json TEXT, action_ids_json TEXT NOT NULL, updated_at INTEGER NOT NULL
  )`);
}

export function loadTables(db: DatabaseSync): Map<string, Table> {
  const rows = db.prepare("SELECT * FROM tables").all();
  return new Map(rows.map(row => [String(row.id), {
    hostUserId: row.host_user_id as number | null,
    players: JSON.parse(String(row.players_json)), settings: JSON.parse(String(row.settings_json)),
    settingsRevision: Number(row.settings_revision), confirmed: JSON.parse(String(row.confirmed_json)),
    dealt: Boolean(row.dealt), version: Number(row.version),
    state: row.state_json === null ? null : JSON.parse(String(row.state_json)),
    actionIds: new Set<string>(JSON.parse(String(row.action_ids_json))),
  }]));
}

export function writeTable(db: DatabaseSync, id: string, table: Table, now: number): void {
  db.prepare(`INSERT INTO tables VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET host_user_id=excluded.host_user_id,
    players_json=excluded.players_json, settings_json=excluded.settings_json,
    settings_revision=excluded.settings_revision, confirmed_json=excluded.confirmed_json,
    dealt=excluded.dealt, version=excluded.version, state_json=excluded.state_json,
    action_ids_json=excluded.action_ids_json, updated_at=excluded.updated_at`).run(
    id, table.hostUserId, JSON.stringify(table.players), JSON.stringify(table.settings),
    table.settingsRevision, JSON.stringify(table.confirmed), Number(table.dealt), table.version,
    table.state === null ? null : JSON.stringify(table.state), JSON.stringify([...table.actionIds]), now,
  );
}

export function cloneTable(table: Table): Table {
  return { ...table, players: [...table.players], confirmed: [...table.confirmed], actionIds: new Set(table.actionIds) };
}
