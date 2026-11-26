import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, expect } from "vitest";
import { createGame, gameView, type GameState } from "@pref/engine";
import { createGameServer } from "./index.js";
import { lobby, request, socket, settings, session } from "./test-helpers.js";

test("restores the lobby, hands, version and idempotency, then continues play after restart", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pref-restore-"));
  const databasePath = path.join(dir, "pref.sqlite");
  let server = createGameServer({ databasePath });
  await server.listen();
  try {
    const table = await lobby(server, "restore");
    const beforeLobby = await (await request(server, `/tables/${table.tableId}`, "GET", table.cookies[0])).json();
    // Even an undealt lobby and confirmations must survive a restart.
    await server.close(); server = createGameServer({ databasePath }); await server.listen();
    expect(await (await request(server, `/tables/${table.tableId}`, "GET", table.cookies[0])).json()).toEqual(beforeLobby);
    expect((await request(server, `/tables/${table.tableId}/deal`, "POST", table.cookies[0])).ok).toBe(true);
    const clients = await Promise.all(table.cookies.map(cookie => socket(server, cookie)));
    for (const [seat, client] of clients.entries()) {
      client.ws.send(JSON.stringify({ type: "join", tableId: table.tableId, seat })); await client.next();
    }
    const command = (seat: number) => ({ type: "gameAction", tableId: table.tableId, seat, actionId: `pass-${seat}`, expectedVersion: seat, payload: { action: { type: "auction", action: { type: "pass" } } } });
    for (const seat of [0, 1, 2]) {
      clients[seat].ws.send(JSON.stringify(command(seat)));
      for (const client of clients) expect(await client.next()).toMatchObject({ type: "snapshot", version: seat + 1 });
    }
    const beforeState = structuredClone(server.getTable(table.tableId));
    const beforePlayers = [...server.getTablePlayers(table.tableId)!];
    await server.close(); server = createGameServer({ databasePath }); await server.listen();
    expect(server.getTable(table.tableId)).toEqual(beforeState);
    expect(server.getTablePlayers(table.tableId)).toEqual(beforePlayers);
    const client = await socket(server, table.cookies[2]);
    client.ws.send(JSON.stringify({ type: "join", tableId: table.tableId, seat: 2 }));
    expect(await client.next()).toMatchObject({ type: "snapshot", version: 3 });
    client.ws.send(JSON.stringify(command(2)));
    expect(await client.next()).toMatchObject({ type: "snapshot", version: 3, repeatedAction: true });
    expect(server.commandCount()).toBe(3);
    const state = server.getTable(table.tableId)!.state as GameState;
    const seat = ([0, 1, 2] as const).find(seat => gameView(state, seat).allowedActions.length)!;
    const actor = await socket(server, table.cookies[seat]);
    actor.ws.send(JSON.stringify({ type: "join", tableId: table.tableId, seat })); await actor.next();
    actor.ws.send(JSON.stringify({ type: "gameAction", tableId: table.tableId, seat, actionId: "continued", expectedVersion: 3, payload: { action: gameView(state, seat).allowedActions[0] } }));
    expect(await actor.next()).toMatchObject({ type: "snapshot", version: 4 });
  } finally { await server.close(); await rm(dir, { recursive: true, force: true }); }
});

test("rolls back the snapshot and in-memory state when command logging fails", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pref-atomic-"));
  const databasePath = path.join(dir, "pref.sqlite");
  const server = createGameServer({ databasePath });
  server.addTable("aabb", createGame(settings, 1));
  await server.listen();
  const db = new DatabaseSync(databasePath);
  try {
    const cookie = await session(server, "atomic");
    const client = await socket(server, cookie);
    client.ws.send(JSON.stringify({ type: "join", tableId: "aabb", seat: 0 })); await client.next();
    const before = structuredClone(server.getTable("aabb"));
    db.exec("CREATE TRIGGER fail_command BEFORE INSERT ON command_log BEGIN SELECT RAISE(ABORT, 'forced'); END");
    client.ws.send(JSON.stringify({ type: "gameAction", tableId: "aabb", seat: 0, actionId: "rollback", expectedVersion: 0, payload: { action: { type: "auction", action: { type: "pass" } } } }));
    expect(await client.next()).toMatchObject({ type: "rejected", reason: "internalError" });
    expect(server.getTable("aabb")).toEqual(before);
    expect(db.prepare("SELECT version FROM tables WHERE id = 'aabb'").get()?.version).toBe(0);
    expect(server.commandCount()).toBe(0);
  } finally { db.close(); await server.close(); await rm(dir, { recursive: true, force: true }); }
});

test("expires finished and abandoned tables by their separate TTLs", async () => {
  let now = 1_000;
  const server = createGameServer({ now: () => now, tableTtlMs: 200, finishedTableTtlMs: 100 });
  try {
    server.addTable("active", createGame(settings, 1));
    server.addTable("finished", { ...createGame(settings, 2), phase: "finished" });
    now += 101; server.pruneExpiredTables();
    expect(server.getTable("finished")).toBeUndefined();
    expect(server.getTable("active")).toBeDefined();
    now += 100; server.pruneExpiredTables();
    expect(server.getTable("active")).toBeUndefined();
  } finally { await server.close(); }
});

test("every seat still reads the locked table conventions after the deal and after a restart", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pref-conventions-"));
  const databasePath = path.join(dir, "pref.sqlite");
  let server = createGameServer({ databasePath });
  await server.listen();
  try {
    const table = await lobby(server, "conventions");
    const agreed = { raspasProgression: "123", raspasExit: "788", throwTalon: true, bulletTarget: 25 };
    expect((await request(server, `/tables/${table.tableId}`, "PATCH", table.cookies[0], agreed)).ok).toBe(true);
    for (const cookie of table.cookies.slice(1)) {
      expect((await request(server, `/tables/${table.tableId}/confirm`, "POST", cookie)).ok).toBe(true);
    }
    expect((await request(server, `/tables/${table.tableId}/deal`, "POST", table.cookies[0])).ok).toBe(true);
    const readAll = async () => {
      for (const [seat, cookie] of table.cookies.entries()) {
        expect(await (await request(server, `/tables/${table.tableId}`, "GET", cookie)).json()).toMatchObject({ seat, dealt: true, settings: agreed });
      }
    };
    await readAll();
    const locked = await request(server, `/tables/${table.tableId}`, "PATCH", table.cookies[0], settings);
    expect(locked.status).toBe(409);
    expect(await locked.json()).toEqual({ error: "settingsLocked" });
    await server.close(); server = createGameServer({ databasePath }); await server.listen();
    await readAll();
    expect((await request(server, `/tables/${table.tableId}`, "PATCH", table.cookies[0], settings)).status).toBe(409);
    await readAll();
  } finally { await server.close(); await rm(dir, { recursive: true, force: true }); }
});
