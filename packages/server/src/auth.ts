import { createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { IncomingMessage } from "node:http";
import type { DatabaseSync } from "node:sqlite";

const deriveKey = promisify(scrypt);
export const SESSION_TTL_MS = 30 * 86_400_000;

export async function hashPassword(password: string, salt: string): Promise<string> {
  return (await deriveKey(password, salt, 64) as Buffer).toString("hex");
}

export async function passwordMatches(password: string, salt: string, expectedHash: string): Promise<boolean> {
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

export function allowedOrigin(request: IncomingMessage, publicOrigin?: string, secure = false): boolean {
  // Native/non-browser clients do not send Origin; cookies still authenticate them.
  if (request.headers.origin === undefined) return true;
  try {
    const expected = publicOrigin ?? `${secure || encryptedRequest(request) ? "https" : "http"}://${request.headers.host}`;
    return new URL(request.headers.origin).origin === new URL(expected).origin && request.headers.origin !== "null";
  } catch { return false; }
}

export function addSessionExpiry(db: DatabaseSync): void {
  const columns = new Set(db.prepare("PRAGMA table_info(sessions)").all().map(row => row.name));
  if (!columns.has("created_at")) db.exec("ALTER TABLE sessions ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0");
  if (!columns.has("expires_at")) db.exec("ALTER TABLE sessions ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0");
  db.exec("CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at)");
}

export class AuthRateLimiter {
  private readonly counters = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly limits = { ip: 30, name: 10, windowMs: 60_000 }) {}
  allow(ip: string, name: string, now: number): boolean {
    this.prune(now);
    const keys = [[`ip:${ip}`, this.limits.ip], [`name:${name.toLowerCase()}`, this.limits.name]] as const;
    if (keys.some(([key, limit]) => (this.counters.get(key)?.count ?? 0) >= limit)) return false;
    for (const [key] of keys) {
      const counter = this.counters.get(key) ?? { count: 0, resetAt: now + this.limits.windowMs };
      counter.count++; this.counters.set(key, counter);
    }
    return true;
  }
  prune(now: number): void {
    for (const [key, value] of this.counters) if (value.resetAt <= now) this.counters.delete(key);
  }
}
