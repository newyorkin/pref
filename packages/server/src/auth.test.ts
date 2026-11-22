import { once } from "node:events";
import { test, expect } from "vitest";
import WebSocket from "ws";
import { hashPassword, passwordMatches, AuthRateLimiter } from "./auth.js";
import { createGameServer } from "./index.js";
import { request, session, socket } from "./test-helpers.js";

test("password derivation is asynchronous and compares the derived key", async () => {
  let eventLoopRan = false;
  setImmediate(() => { eventLoopRan = true; });
  const hash = await hashPassword("Secret123!", "salt");
  expect(eventLoopRan).toBe(true);
  expect(await passwordMatches("Secret123!", "salt", hash)).toBe(true);
  expect(await passwordMatches("Wrong123!", "salt", hash)).toBe(false);
});

test("expires sessions, slides their lifetime and sets secure persistent cookies", async () => {
  let now = 10_000;
  const server = createGameServer({ now: () => now, sessionTtlMs: 2_000, cookieSecure: true });
  await server.listen();
  try {
    const credentials = { name: "expiry", password: "Secret123!" };
    expect((await request(server, "/register", "POST", undefined, credentials)).status).toBe(201);
    const response = await request(server, "/login", "POST", undefined, credentials);
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Strict; Path=\/; Max-Age=2; Secure/);
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    now += 1_500;
    const refreshed = await request(server, "/me", "GET", cookie);
    expect(refreshed.status).toBe(200);
    expect(refreshed.headers.get("set-cookie")).toContain("Max-Age=2");
    now += 1_500;
    expect((await request(server, "/me", "GET", cookie)).status).toBe(200);
    now += 2_001;
    expect((await request(server, "/me", "GET", cookie)).status).toBe(401);
  } finally { await server.close(); }
});

test("limits login and registration attempts and recovers after the rate window", async () => {
  let now = 1_000;
  const server = createGameServer({ now: () => now, authRateLimit: { ip: 20, name: 3, windowMs: 100 } });
  await server.listen();
  try {
    const credentials = { name: "guess", password: "wrong!" };
    for (let i = 0; i < 3; i++) expect((await request(server, "/login", "POST", undefined, credentials)).status).toBe(401);
    const limited = await request(server, "/login", "POST", undefined, credentials);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeDefined();
    expect((await request(server, "/register", "POST", undefined, credentials)).status).toBe(429);
    now += 101;
    expect((await request(server, "/login", "POST", undefined, credentials)).status).toBe(401);
  } finally { await server.close(); }
  const limiter = new AuthRateLimiter({ ip: 2, name: 2, windowMs: 100 });
  expect(limiter.allow("a", "one", 0)).toBe(true);
  expect(limiter.allow("a", "two", 0)).toBe(true);
  expect(limiter.allow("a", "three", 0)).toBe(false);
  expect(limiter.allow("b", "one", 0)).toBe(true);
  expect(limiter.allow("c", "ONE", 0)).toBe(false);
  expect(limiter.allow("a", "one", 101)).toBe(true);
});

test("rejects cross-origin websocket upgrades while accepting the server origin", async () => {
  const server = createGameServer(); await server.listen();
  try {
    const cookie = await session(server, "origin");
    const rejected = new WebSocket(server.url(), { origin: "https://evil.example", headers: { Cookie: cookie } });
    rejected.on("error", () => undefined);
    const status = await new Promise<number | undefined>(resolve => rejected.on("unexpected-response", (_request, response) => {
      resolve(response.statusCode); response.resume(); rejected.terminate();
    }));
    expect(status).toBe(403);
    const accepted = new WebSocket(server.url(), { origin: server.httpUrl(), headers: { Cookie: cookie } });
    await once(accepted, "open");
    accepted.close(); await once(accepted, "close");
  } finally { await server.close(); }
});

test("logout invalidates an already connected websocket and dev cookies remain usable over HTTP", async () => {
  const server = createGameServer(); await server.listen();
  try {
    const cookie = await session(server, "logout-ws");
    const client = await socket(server, cookie);
    expect((await request(server, "/logout", "POST", cookie)).headers.get("set-cookie")).not.toContain("Secure");
    const closed = once(client.ws, "close");
    client.ws.send(JSON.stringify({ type: "watch", tableId: "missing" }));
    expect((await closed)[0]).toBe(1008);
  } finally { await server.close(); }
});
