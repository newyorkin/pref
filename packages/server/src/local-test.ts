import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  applyGameAction,
  createGame,
  gameView,
  type Deal,
  type GameState,
  type Seat,
} from "@pref/engine";
import { allowedOrigin } from "./auth.js";
import { readRequestBody, sendJson } from "./http.js";
import { isGameAction, isRecord, isTableFormSettings } from "./validation.js";

export const isLoopback = (host: string) =>
  ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"].includes(host);

// Separate from real tables, users, sessions and command logs. Lost on restart.
export class LocalTestTables {
  private readonly tables = new Map<
    string,
    { state: GameState; version: number; updatedAt: number }
  >();
  constructor(
    private readonly dealSource: () => Deal,
    private readonly now = Date.now,
  ) {}

  async handle(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): Promise<void> {
    response.setHeader("Cache-Control", "no-store");
    let localHost = false;
    try {
      localHost = isLoopback(
        new URL(`http://${request.headers.host}`).hostname.replace(/^\[|\]$/g, ""),
      );
    } catch {
      /* Reject malformed Host. */
    }
    if (
      !localHost ||
      !isLoopback(request.socket.remoteAddress ?? "") ||
      !allowedOrigin(request)
    ) {
      sendJson(response, 403, { error: "localOnly" });
      return;
    }
    for (const [id, table] of this.tables) {
      if (this.now() - table.updatedAt > 24 * 60 * 60 * 1000) this.tables.delete(id);
    }
    if (pathname === "/local-test/status" && request.method === "GET") {
      sendJson(response, 200, { enabled: true });
      return;
    }
    const match = pathname.match(/^\/local-test\/tables\/([a-f0-9]{32})(\/actions)?$/);
    if (match && request.method === "DELETE" && !match[2]) {
      this.tables.delete(match[1]);
      sendJson(response, 200, { deleted: true });
      return;
    }
    if (match && request.method === "GET" && !match[2]) {
      const table = this.tables.get(match[1]);
      if (!table) {
        sendJson(response, 404, { error: "tableNotFound" });
        return;
      }
      table.updatedAt = this.now();
      sendJson(response, 200, this.view(match[1], table));
      return;
    }
    if (
      request.method !== "POST" ||
      !(pathname === "/local-test/tables" || match?.[2])
    ) {
      sendJson(response, 404, { error: "notFound" });
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(await readRequestBody(request));
    } catch {
      sendJson(response, 400, { error: "invalidJson" });
      return;
    }
    if (pathname === "/local-test/tables") {
      if (!isTableFormSettings(body)) {
        sendJson(response, 400, { error: "invalidSettings" });
        return;
      }
      if (this.tables.size >= 20) {
        sendJson(response, 429, { error: "tooManyTestTables" });
        return;
      }
      const id = randomBytes(16).toString("hex");
      const table = {
        state: createGame(body, this.dealSource()),
        version: 0,
        updatedAt: this.now(),
      };
      this.tables.set(id, table);
      sendJson(response, 201, this.view(id, table));
      return;
    }
    const table = this.tables.get(match![1]);
    if (!table) {
      sendJson(response, 404, { error: "tableNotFound" });
      return;
    }
    if (
      !isRecord(body) ||
      ![0, 1, 2].includes(body.seat as number) ||
      !isGameAction(body.action)
    ) {
      sendJson(response, 400, { error: "invalidCommand" });
      return;
    }
    if (body.expectedVersion !== table.version) {
      sendJson(response, 409, { error: "versionMismatch" });
      return;
    }
    const transition = applyGameAction(
      table.state,
      body.seat as Seat,
      body.action,
      this.dealSource,
    );
    if (!transition.accepted) {
      sendJson(response, 400, { error: transition.reason });
      return;
    }
    table.state = transition.state;
    table.version++;
    table.updatedAt = this.now();
    sendJson(response, 200, this.view(match![1], table));
  }

  private view(id: string, table: { state: GameState; version: number }) {
    return {
      tableId: id,
      settings: table.state.settings,
      snapshots: ([0, 1, 2] as const).map((seat) => ({
        type: "snapshot",
        tableId: id,
        version: table.version,
        state: gameView(table.state, seat),
      })),
    };
  }
}
