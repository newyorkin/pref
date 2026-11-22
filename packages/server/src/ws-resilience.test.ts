import { once } from "node:events";
import WebSocket from "ws";
import { test, expect } from "vitest";
import { createGameServer } from "./index.js";
import { session, socket } from "./test-helpers.js";

test("heartbeat terminates peers which do not respond and keeps responsive peers", async () => {
  const server = createGameServer({ heartbeatIntervalMs: 25 }); await server.listen();
  try {
    const cookie = await session(server, "heartbeat");
    const healthy = await socket(server, cookie);
    const silent = new WebSocket(server.url(), { headers: { Cookie: cookie }, autoPong: false });
    const silentClosed = once(silent, "close");
    await once(silent, "open");
    await silentClosed;
    expect(healthy.ws.readyState).toBe(WebSocket.OPEN);
    healthy.ws.send(JSON.stringify({ type: "watch", tableId: "missing" }));
    expect(await healthy.next()).toMatchObject({ type: "rejected", reason: "tableNotFound" });
  } finally { await server.close(); }
});

test("closes oversized payloads without crashing the server", async () => {
  const server = createGameServer({ maxSocketPayload: 128 }); await server.listen();
  try {
    const cookie = await session(server, "payload");
    const client = await socket(server, cookie);
    const closed = once(client.ws, "close"); client.ws.send("x".repeat(1024));
    expect((await closed)[0]).toBe(1009);
    const healthy = await socket(server, cookie);
    healthy.ws.send(JSON.stringify({ type: "watch", tableId: "missing" }));
    expect(await healthy.next()).toMatchObject({ type: "rejected" });
  } finally { await server.close(); }
});

test("limits messages per socket independently", async () => {
  const server = createGameServer({ socketMessageLimit: 3 }); await server.listen();
  try {
    const cookie = await session(server, "flood");
    const client = await socket(server, cookie); const healthy = await socket(server, cookie);
    const closed = once(client.ws, "close");
    for (let i = 0; i < 4; i++) client.ws.send(JSON.stringify({ type: "watch", tableId: "missing" }));
    expect((await closed)[0]).toBe(1008);
    healthy.ws.send(JSON.stringify({ type: "watch", tableId: "missing" }));
    expect(await healthy.next()).toMatchObject({ type: "rejected" });
  } finally { await server.close(); }
});
