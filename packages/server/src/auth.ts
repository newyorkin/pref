import { createHash, scrypt, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";

const deriveKey = promisify(scrypt);
export const SESSION_TTL_MS = 30 * 86_400_000;

export async function hashPassword(password: string, salt: string): Promise<string> {
  return ((await deriveKey(password, salt, 64)) as Buffer).toString("hex");
}

export async function passwordMatches(
  password: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const actual = Buffer.from(await hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function parseCookie(header: string | undefined, name: string): string | null {
  for (const entry of header?.split(";") ?? []) {
    const [key, ...parts] = entry.trim().split("=");
    if (key === name) return parts.join("=") || null;
  }
  return null;
}

export function sessionCookie(token: string, secure: boolean, maxAge: number): string {
  return `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function encryptedRequest(request: IncomingMessage): boolean {
  return "encrypted" in request.socket && request.socket.encrypted === true;
}

export function allowedOrigin(
  request: IncomingMessage,
  publicOrigin?: string,
  secure = false,
): boolean {
  // Native/non-browser clients do not send Origin; cookies still authenticate them.
  if (request.headers.origin === undefined) return true;
  try {
    const expected =
      publicOrigin ??
      `${secure || encryptedRequest(request) ? "https" : "http"}://${request.headers.host}`;
    return (
      new URL(request.headers.origin).origin === new URL(expected).origin &&
      request.headers.origin !== "null"
    );
  } catch {
    return false;
  }
}

export class AuthRateLimiter {
  private readonly counters = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly limits = { ip: 30, name: 10, windowMs: 60_000 }) {}
  allow(ip: string, name: string, now: number): boolean {
    this.prune(now);
    const keys = [
      [`ip:${ip}`, this.limits.ip],
      [`name:${name.toLowerCase()}`, this.limits.name],
    ] as const;
    if (keys.some(([key, limit]) => (this.counters.get(key)?.count ?? 0) >= limit))
      return false;
    for (const [key] of keys) {
      const counter = this.counters.get(key) ?? {
        count: 0,
        resetAt: now + this.limits.windowMs,
      };
      counter.count++;
      this.counters.set(key, counter);
    }
    return true;
  }
  prune(now: number): void {
    for (const [key, value] of this.counters)
      if (value.resetAt <= now) this.counters.delete(key);
  }
}

import { randomBytes } from "node:crypto";
import type { ServerResponse } from "node:http";
import { readRequestBody, sendJson } from "./http.js";
import { isRecord } from "./validation.js";
export interface AuthContext {
  database: DatabaseSync;
  now: () => number;
  sessionTtlMs: number;
  cookieSecure: boolean;
  authLimiter: AuthRateLimiter;
}
export async function handleAuth(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  ctx: AuthContext,
): Promise<boolean> {
  if (
    request.method === "POST" &&
    (pathname === "/register" || pathname === "/login")
  ) {
    let body: unknown;
    try {
      body = JSON.parse(await readRequestBody(request));
    } catch {
      sendJson(response, 400, { error: "invalidJson" });
      return true;
    }
    if (
      !isRecord(body) ||
      typeof body.name !== "string" ||
      body.name.trim().length === 0 ||
      typeof body.password !== "string" ||
      body.password.length === 0
    ) {
      sendJson(response, 400, { error: "invalidCredentials" });
      return true;
    }

    const name = body.name.trim();
    if (
      !ctx.authLimiter.allow(request.socket.remoteAddress ?? "unknown", name, ctx.now())
    ) {
      response.setHeader("Retry-After", "60");
      sendJson(response, 429, { error: "rateLimited" });
      return true;
    }
    if (pathname === "/register") {
      if (
        body.password.length < 8 ||
        !/\d/.test(body.password) ||
        !/[^\p{L}\p{N}]/u.test(body.password)
      ) {
        sendJson(response, 400, { error: "weakPassword" });
        return true;
      }
      const existing = ctx.database
        .prepare("SELECT id FROM users WHERE name = ?")
        .get(name);
      if (existing !== undefined) {
        sendJson(response, 409, { error: "nameTaken" });
        return true;
      }

      const salt = randomBytes(16).toString("hex");
      const result = ctx.database
        .prepare(
          `
            INSERT OR IGNORE INTO users (name, password_salt, password_hash)
            VALUES (?, ?, ?)
          `,
        )
        .run(name, salt, await hashPassword(body.password, salt));
      if (result.changes === 0) {
        sendJson(response, 409, { error: "nameTaken" });
        return true;
      }
      sendJson(response, 201, {
        id: Number(result.lastInsertRowid),
        name,
      });
      return true;
    }

    const user = ctx.database
      .prepare(
        `
          SELECT id, name, password_salt, password_hash
          FROM users
          WHERE name = ?
        `,
      )
      .get(name) as
      | {
          id: number;
          name: string;
          password_salt: string;
          password_hash: string;
        }
      | undefined;
    if (
      user === undefined ||
      !(await passwordMatches(body.password, user.password_salt, user.password_hash))
    ) {
      sendJson(response, 401, { error: "invalidCredentials" });
      return true;
    }

    const token = randomBytes(32).toString("hex");
    ctx.database
      .prepare(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
      )
      .run(hashToken(token), user.id, ctx.now(), ctx.now() + ctx.sessionTtlMs);
    response.setHeader(
      "Set-Cookie",
      sessionCookie(
        token,
        ctx.cookieSecure || encryptedRequest(request),
        Math.floor(ctx.sessionTtlMs / 1000),
      ),
    );
    sendJson(response, 200, { id: user.id, name: user.name });
    return true;
  }

  if (request.method === "POST" && pathname === "/logout") {
    const token = parseCookie(request.headers.cookie, "session");
    if (token !== null) {
      ctx.database
        .prepare("DELETE FROM sessions WHERE token_hash = ?")
        .run(hashToken(token));
    }
    response.setHeader(
      "Set-Cookie",
      sessionCookie("", ctx.cookieSecure || encryptedRequest(request), 0),
    );
    sendJson(response, 200, { ok: true });
    return true;
  }

  return false;
}
export function authenticatedUser(
  cookieHeader: string | undefined,
  ctx: AuthContext,
  response?: ServerResponse,
  request?: IncomingMessage,
): number | null {
  const token = parseCookie(cookieHeader, "session");
  if (token === null) return null;
  const tokenHash = hashToken(token);
  const session = ctx.database
    .prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?")
    .get(tokenHash) as { user_id: number; expires_at: number } | undefined;
  if (!session || session.expires_at <= ctx.now()) {
    ctx.database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    return null;
  }
  ctx.database
    .prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?")
    .run(ctx.now() + ctx.sessionTtlMs, tokenHash);
  if (response && request)
    response.setHeader(
      "Set-Cookie",
      sessionCookie(
        token,
        ctx.cookieSecure || encryptedRequest(request),
        Math.floor(ctx.sessionTtlMs / 1000),
      ),
    );
  return session.user_id;
}
