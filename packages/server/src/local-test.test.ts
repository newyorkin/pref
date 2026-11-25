import { deal, type GameAction, type GameSeatView } from "@pref/engine";
import { request as httpRequest } from "node:http";
import { afterEach, expect, test } from "vitest";
import { createGameServer, type GameServer } from "./index.js";
import { request, settings } from "./test-helpers.js";

const servers: GameServer[] = [];
async function start(enabled = true, now = Date.now) {
  const server = createGameServer({
    localTestMode: enabled,
    dealSource: () => deal(37),
    now,
  });
  servers.push(server);
  await server.listen();
  return server;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});
interface Table {
  tableId: string;
  snapshots: { version: number; state: GameSeatView }[];
}
async function create(server: GameServer): Promise<Table> {
  const response = await request(
    server,
    "/local-test/tables",
    "POST",
    undefined,
    settings,
  );
  expect(response.status).toBe(201);
  return response.json() as Promise<Table>;
}
async function act(server: GameServer, table: Table, seat: number, action: GameAction) {
  return request(
    server,
    `/local-test/tables/${table.tableId}/actions`,
    "POST",
    undefined,
    { seat, action, expectedVersion: table.snapshots[seat].version },
  );
}

test("local test routes are absent by default and cannot bypass ordinary authentication", async () => {
  const server = await start(false);
  expect((await request(server, "/local-test/status")).status).toBe(404);
  expect(
    (await request(server, "/local-test/tables", "POST", undefined, settings)).status,
  ).toBe(404);
  const enabled = await start();
  await create(enabled);
  expect((await request(enabled, "/me")).status).toBe(401);
  expect((await request(enabled, "/tables")).status).toBe(401);
  expect(enabled.commandCount()).toBe(0);
});

test("local mode refuses public listeners and cross-origin requests", async () => {
  const server = createGameServer({ localTestMode: true });
  servers.push(server);
  await expect(server.listen(0, "0.0.0.0")).rejects.toThrow("loopback");
  const enabled = await start();
  const response = await fetch(enabled.httpUrl() + "/local-test/tables", {
    method: "POST",
    headers: { Origin: "https://other.example", "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  expect(response.status).toBe(403);
  const forwarded = await new Promise<number | undefined>((resolve, reject) => {
    httpRequest(
      enabled.httpUrl() + "/local-test/status",
      { headers: { Host: "public.example" } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    )
      .on("error", reject)
      .end();
  });
  expect(forwarded).toBe(403);
});

test("three seat views expose the right hands without seeds and keep test tables isolated", async () => {
  const server = await start();
  const first = await create(server);
  const second = await create(server);
  expect(first.tableId).not.toBe(second.tableId);
  first.snapshots.forEach((snapshot, seat) => {
    expect(snapshot.state.hand).toEqual(deal(37).hands[seat]);
    expect(snapshot.state).not.toHaveProperty("seed");
    expect(snapshot.state).not.toHaveProperty("hands");
  });
  const seat = first.snapshots.findIndex(
    (snapshot) => snapshot.state.allowedActions.length,
  );
  expect(
    (await act(server, first, seat, { type: "auction", action: { type: "pass" } }))
      .status,
  ).toBe(200);
  const restored = (await (
    await request(server, `/local-test/tables/${second.tableId}`)
  ).json()) as Table;
  expect(restored.snapshots[0].version).toBe(0);
  expect(server.commandCount()).toBe(0);
});

test("one controller can pass, open the talon and play all ten raspas tricks", async () => {
  const server = await start();
  let table = await create(server);
  let cards = 0;
  let opened = 0;
  let passes = 0;
  for (
    let count = 0;
    count < 40 && table.snapshots[0].state.dealNumber === 0;
    count++
  ) {
    const seat = table.snapshots.findIndex(
      (snapshot) => snapshot.state.allowedActions.length,
    );
    expect(seat).toBeGreaterThanOrEqual(0);
    const action = table.snapshots[seat].state.allowedActions[0];
    if (action.type === "playCard") cards++;
    if (action.type === "openTalon") opened++;
    if (action.type === "auction") passes++;
    const response = await act(server, table, seat, action);
    expect(response.status).toBe(200);
    table = (await response.json()) as Table;
  }
  expect(passes).toBe(3);
  expect(opened).toBe(1);
  expect(cards).toBe(30);
  expect(table.snapshots[0].state.dealNumber).toBe(1);
});

test("invalid, stale and wrong-seat actions do not change state", async () => {
  const server = await start();
  const table = await create(server);
  const seat = table.snapshots.findIndex(
    (snapshot) => snapshot.state.allowedActions.length,
  );
  const pass = { type: "auction", action: { type: "pass" } } as const;
  expect((await act(server, table, (seat + 1) % 3, pass)).status).toBe(400);
  expect(
    (await act(server, table, seat, { type: "rematch", seed: 1 } as GameAction)).status,
  ).toBe(400);
  expect((await act(server, table, seat, pass)).status).toBe(200);
  expect((await act(server, table, seat, pass)).status).toBe(409);
  const restored = (await (
    await request(server, `/local-test/tables/${table.tableId}`)
  ).json()) as Table;
  expect(restored.snapshots[0].version).toBe(1);
  expect(
    (await request(server, "/local-test/tables", "POST", undefined, {})).status,
  ).toBe(400);
});

test("test games can be removed and expire after a day", async () => {
  let now = 0;
  const server = await start(true, () => now);
  const table = await create(server);
  expect(
    (await request(server, `/local-test/tables/${table.tableId}`, "DELETE")).status,
  ).toBe(200);
  expect((await request(server, `/local-test/tables/${table.tableId}`)).status).toBe(
    404,
  );
  const other = await create(server);
  now += 86_400_001;
  expect((await request(server, `/local-test/tables/${other.tableId}`)).status).toBe(
    404,
  );
});
