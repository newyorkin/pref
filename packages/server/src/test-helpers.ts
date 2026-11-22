import { once } from "node:events";
import { expect } from "vitest";
import WebSocket from "ws";
import type { GameServer, ServerMessage } from "./index.js";

export const settings = { raspasProgression: "111", raspasExit: "666", throwTalon: false, bulletTarget: 10 } as const;

export async function request(server: GameServer, route: string, method = "GET", cookie?: string, body?: unknown) {
  return fetch(server.httpUrl() + route, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

export async function session(server: GameServer, name: string) {
  const credentials = { name, password: "Secret123!" };
  expect((await request(server, "/register", "POST", undefined, credentials)).status).toBe(201);
  const response = await request(server, "/login", "POST", undefined, credentials);
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";")[0];
}

export async function lobby(server: GameServer, prefix: string) {
  const cookies = await Promise.all([0, 1, 2].map(i => session(server, `${prefix}-${i}`)));
  const response = await request(server, "/tables", "POST", cookies[0], settings);
  expect(response.status).toBe(201);
  const table = await response.json() as { tableId: string };
  for (const cookie of cookies.slice(1)) {
    expect((await request(server, `/tables/${table.tableId}/join`, "POST", cookie)).ok).toBe(true);
    expect((await request(server, `/tables/${table.tableId}/confirm`, "POST", cookie)).ok).toBe(true);
  }
  return { ...table, cookies };
}

export async function socket(server: GameServer, cookie: string) {
  const ws = new WebSocket(server.url() + "/ws", { headers: { Cookie: cookie } });
  const queue: ServerMessage[] = [];
  const waiters: Array<(message: ServerMessage) => void> = [];
  ws.on("message", data => {
    const message = JSON.parse(data.toString()) as ServerMessage;
    const waiter = waiters.shift();
    if (waiter) waiter(message); else queue.push(message);
  });
  await once(ws, "open");
  return { ws, next: () => queue.length ? Promise.resolve(queue.shift()!) : new Promise<ServerMessage>(resolve => waiters.push(resolve)) };
}
