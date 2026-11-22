import type { IncomingMessage, ServerResponse } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { test, expect } from "vitest";
import { deal } from "@pref/engine";
import { migrateDatabase } from "./db.js";
import { handleLobby, type LobbyContext } from "./lobby.js";
import type { Table } from "./tables.js";
import { settings } from "./test-helpers.js";

function response() {
  const result = { status: 0, body: "" };
  const res = { writeHead: (status: number) => { result.status = status; }, end: (body: string) => { result.body = body; } } as unknown as ServerResponse;
  return { result, res };
}
function body(method: string, value: unknown, ready = Promise.resolve()) {
  return { method, async *[Symbol.asyncIterator]() { await ready; yield Buffer.from(JSON.stringify(value)); } } as IncomingMessage;
}
function fixture() {
  const database = new DatabaseSync(":memory:"); migrateDatabase(database);
  for (const id of [1, 2, 3]) database.prepare("INSERT INTO users VALUES (?, ?, 'salt', 'hash')").run(id, `user-${id}`);
  const table: Table = { state: null, version: 0, actionIds: new Set(), players: [1, null, null], hostUserId: 1, settings, settingsRevision: 0, dealt: false, confirmed: [false, false, false] };
  const tables = new Map([["aabb", table]]);
  const ctx: LobbyContext = { database, tables, dealSource: () => deal(1), persistTable: (id, next) => { tables.set(id, next); }, notifyLobby: () => undefined, serveStatic: async () => false };
  return { ctx, table, database };
}

test("a settings request cannot overwrite players who joined while its body was arriving", async () => {
  const { ctx, database } = fixture();
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const pending = handleLobby(body("PATCH", { ...settings, bulletTarget: 20 }, gate), response().res, "/tables/aabb", 1, ctx);
    await handleLobby(body("POST", {}), response().res, "/tables/aabb/join", 2, ctx);
    release(); await pending;
    expect(ctx.tables.get("aabb")!.players).toEqual([1, 2, null]);
    expect(ctx.tables.get("aabb")!.settings.bulletTarget).toBe(20);
  } finally { release(); database.close(); }
});

test("a slow deal request cannot bypass a concurrent reset of the confirmed conventions", async () => {
  const { ctx, table, database } = fixture();
  table.players[1] = 2; table.players[2] = 3; table.confirmed = [false, true, true];
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const result = response();
  try {
    const pending = handleLobby(body("POST", {}, gate), result.res, "/tables/aabb/deal", 1, ctx);
    await handleLobby(body("PATCH", { ...settings, bulletTarget: 20 }), response().res, "/tables/aabb", 1, ctx);
    release(); await pending;
    expect(result.result.status).toBe(409);
    expect(ctx.tables.get("aabb")!.state).toBeNull();
  } finally { release(); database.close(); }
});
