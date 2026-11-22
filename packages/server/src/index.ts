import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { authenticatedUser, handleAuth, type AuthContext } from "./auth.js";
import { migrateDatabase } from "./db.js";
import { isApiPath, sendJson } from "./http.js";
import { handleLobby, tableDetails } from "./lobby.js";
import type {
  ClientCommand,
  GameServerOptions,
  JoinMessage,
  ServerMessage,
  Subscription,
  WatchMessage,
} from "./protocol.js";
import { serveStatic } from "./static.js";
import {
  isGameActionCommand,
  isGameState,
  isJoinMessage,
  isPlayCardCommand,
  isWatchMessage,
  projectState,
} from "./validation.js";
import { createSocketTransport } from "./ws.js";
export type {
  ClientCommand,
  GameActionCommand,
  GameServerOptions,
  JoinMessage,
  PlayCardCommand,
  RejectionMessage,
  ServerMessage,
  SnapshotMessage,
  Subscription,
  TableFormSettings,
  TableMessage,
  WatchMessage,
} from "./protocol.js";

import {
  applyGameAction,
  playCard,
  type Deal,
  type GameState,
  type Seat,
  type TrickPlayState,
} from "@pref/engine";
import WebSocket, { WebSocketServer } from "ws";
import { AuthRateLimiter, SESSION_TTL_MS } from "./auth.js";
import { secureDeal } from "./dealing.js";
import { cloneTable, loadTables, writeTable, type Table } from "./tables.js";

export class GameServer {
  private readonly database: DatabaseSync;
  private readonly httpServer: Server;
  private readonly socketServer: WebSocketServer;
  private readonly tables: Map<string, Table>;
  private readonly now: () => number;
  private readonly tableTtlMs: number;
  private readonly finishedTableTtlMs: number;
  private readonly cleanupTimer: ReturnType<typeof setInterval>;
  private readonly subscriptions = new Map<WebSocket, Subscription>();
  private readonly socketUsers = new Map<WebSocket, number>();
  private readonly staticDir: string | null;
  private readonly dealSource: () => Deal;
  private readonly heartbeatTimer: ReturnType<typeof setInterval>;
  private readonly sessionTtlMs: number;
  private readonly cookieSecure: boolean;
  private readonly authLimiter: AuthRateLimiter;

  public constructor(options: GameServerOptions = {}) {
    this.dealSource = options.dealSource ?? secureDeal;
    this.sessionTtlMs = options.sessionTtlMs ?? SESSION_TTL_MS;
    this.cookieSecure = options.cookieSecure ?? process.env.COOKIE_SECURE === "1";
    this.authLimiter = new AuthRateLimiter(options.authRateLimit);
    this.now = options.now ?? Date.now;
    this.tableTtlMs = options.tableTtlMs ?? 30 * 86_400_000;
    this.finishedTableTtlMs = options.finishedTableTtlMs ?? 7 * 86_400_000;
    this.staticDir =
      options.staticDir === undefined ? null : path.resolve(options.staticDir);
    this.database = new DatabaseSync(options.databasePath ?? ":memory:");
    migrateDatabase(this.database);
    this.tables = loadTables(this.database);
    this.pruneExpiredTables();
    this.cleanupTimer = setInterval(() => {
      this.pruneExpiredTables();
      this.database
        .prepare("DELETE FROM sessions WHERE expires_at <= ?")
        .run(this.now());
      this.authLimiter.prune(this.now());
    }, options.cleanupIntervalMs ?? 60_000);
    this.cleanupTimer.unref();

    this.httpServer = createServer((request, response) => {
      void this.handleHttp(request, response).catch(() => {
        if (!response.headersSent) sendJson(response, 500, { error: "internalError" });
        else response.destroy();
      });
    });
    const transport = createSocketTransport(this.httpServer, options, {
      now: this.now,
      cookieSecure: this.cookieSecure,
      authenticate: (cookie) => authenticatedUser(cookie, this.authContext),
      connected: (socket, userId) => {
        this.socketUsers.set(socket, userId);
      },
      message: (socket, data) => this.handleMessage(socket, data),
      closed: (socket) => {
        this.subscriptions.delete(socket);
        this.socketUsers.delete(socket);
      },
    });
    this.socketServer = transport.server;
    this.heartbeatTimer = transport.heartbeat;
  }

  public addTable(tableId: string, state: TrickPlayState | GameState): void {
    if (this.tables.has(tableId)) {
      throw new Error(`Table already exists: ${tableId}`);
    }
    this.persistTable(tableId, {
      state,
      version: 0,
      actionIds: new Set(),
      players: [null, null, null],
      hostUserId: null,
      settings: isGameState(state)
        ? state.settings
        : {
            raspasProgression: "111",
            raspasExit: "666",
            throwTalon: false,
            bulletTarget: 10,
          },
      settingsRevision: 0,
      dealt: true,
      confirmed: [false, false, false],
    });
  }

  public getTable(tableId: string):
    | Readonly<{
        state: TrickPlayState | GameState | null;
        version: number;
      }>
    | undefined {
    return this.tables.get(tableId);
  }

  public getTablePlayers(
    tableId: string,
  ): readonly [number | null, number | null, number | null] | undefined {
    return this.tables.get(tableId)?.players;
  }

  public commandCount(): number {
    const row = this.database
      .prepare("SELECT COUNT(*) AS count FROM command_log")
      .get() as { count: number };
    return row.count;
  }

  public async listen(port = 0, host = "127.0.0.1"): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        this.httpServer.off("listening", onListening);
        reject(error);
      };
      const onListening = (): void => {
        this.httpServer.off("error", onError);
        resolve();
      };
      this.httpServer.once("error", onError);
      this.httpServer.once("listening", onListening);
      this.httpServer.listen(port, host);
    });
  }

  public url(): string {
    const address = this.httpServer.address() as AddressInfo | null;
    if (address === null) {
      throw new Error("Server is not listening");
    }
    return `ws://${address.address}:${address.port}`;
  }

  public httpUrl(): string {
    return this.url().replace(/^ws:/, "http:");
  }

  public async close(): Promise<void> {
    clearInterval(this.cleanupTimer);
    clearInterval(this.heartbeatTimer);
    for (const socket of this.socketServer.clients) {
      socket.terminate();
    }
    await new Promise<void>((resolve) => {
      this.socketServer.close(() => resolve());
    });
    if (this.httpServer.listening) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer.close((error) => {
          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        });
      });
    }
    this.database.close();
  }

  private async handleHttp(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (await handleAuth(request, response, pathname, this.authContext)) return;
    const userId = authenticatedUser(
      request.headers.cookie,
      this.authContext,
      response,
      request,
    );
    if (userId === null) {
      if (!isApiPath(pathname)) {
        if (await serveStatic(this.staticDir, request, response, pathname)) return;
        if (
          this.staticDir !== null &&
          (request.method === "GET" || request.method === "HEAD")
        ) {
          sendJson(response, 404, { error: "notFound" });
          return;
        }
      }
      sendJson(response, 401, { error: "notAuthenticated" });
      return;
    }
    if (request.method === "GET" && pathname === "/me") {
      sendJson(
        response,
        200,
        this.database.prepare("SELECT id, name FROM users WHERE id = ?").get(userId),
      );
      return;
    }
    await handleLobby(request, response, pathname, userId, {
      database: this.database,
      tables: this.tables,
      dealSource: this.dealSource,
      persistTable: (id, table) => this.persistTable(id, table),
      notifyLobby: (id) => this.notifyLobby(id),
      serveStatic: (req, res, route) => serveStatic(this.staticDir, req, res, route),
    });
  }

  private get authContext(): AuthContext {
    return {
      database: this.database,
      now: this.now,
      sessionTtlMs: this.sessionTtlMs,
      cookieSecure: this.cookieSecure,
      authLimiter: this.authLimiter,
    };
  }

  private tableResponse(id: string, table: Table, userId: number) {
    return tableDetails(this.database, id, table, userId);
  }

  private handleMessage(socket: WebSocket, rawMessage: string): void {
    let message: unknown;
    try {
      message = JSON.parse(rawMessage);
    } catch {
      this.send(socket, { type: "rejected", reason: "invalidJson" });
      return;
    }

    if (isJoinMessage(message)) {
      this.join(socket, message);
      return;
    }
    if (isWatchMessage(message)) {
      this.watch(socket, message);
      return;
    }
    if (!isPlayCardCommand(message) && !isGameActionCommand(message)) {
      this.send(socket, { type: "rejected", reason: "invalidCommand" });
      return;
    }

    this.applyCommand(socket, message);
  }

  private watch(socket: WebSocket, message: WatchMessage): void {
    const table = this.tables.get(message.tableId);
    if (table === undefined) {
      this.send(socket, {
        type: "rejected",
        tableId: message.tableId,
        reason: "tableNotFound",
      });
      return;
    }
    const userId = this.socketUsers.get(socket);
    if (userId === undefined) {
      this.send(socket, {
        type: "rejected",
        tableId: message.tableId,
        reason: "notAuthenticated",
      });
      return;
    }
    const seat = table.players.indexOf(userId);
    if (seat === -1) {
      this.send(socket, {
        type: "rejected",
        tableId: message.tableId,
        reason: "notSeated",
      });
      return;
    }
    this.subscriptions.set(socket, {
      tableId: message.tableId,
      seat: seat as Seat,
    });
    this.send(socket, {
      type: "table",
      ...this.tableResponse(message.tableId, table, userId),
    });
  }

  private notifyLobby(tableId: string): void {
    const table = this.tables.get(tableId);
    if (table === undefined) {
      return;
    }
    for (const [socket, subscription] of this.subscriptions) {
      if (subscription.tableId !== tableId) {
        continue;
      }
      const userId = this.socketUsers.get(socket);
      if (userId === undefined) {
        continue;
      }
      this.send(socket, {
        type: "table",
        ...this.tableResponse(tableId, table, userId),
      });
    }
  }

  private join(socket: WebSocket, message: JoinMessage): void {
    const storedTable = this.tables.get(message.tableId);
    const table = storedTable === undefined ? undefined : cloneTable(storedTable);
    if (table === undefined) {
      this.send(socket, {
        type: "rejected",
        tableId: message.tableId,
        reason: "tableNotFound",
      });
      return;
    }
    if (table.state === null) {
      this.send(socket, {
        type: "rejected",
        tableId: message.tableId,
        reason: "dealNotStarted",
      });
      return;
    }

    const userId = this.socketUsers.get(socket);
    if (userId === undefined) {
      this.send(socket, {
        type: "rejected",
        tableId: message.tableId,
        reason: "notAuthenticated",
      });
      return;
    }

    const existingSeat = table.players.indexOf(userId);
    const seat = existingSeat === -1 ? message.seat : (existingSeat as Seat);
    if (existingSeat === -1 && table.players[seat] !== null) {
      this.send(socket, {
        type: "rejected",
        tableId: message.tableId,
        reason: "seatTaken",
      });
      return;
    }
    table.players[seat] = userId;
    this.persistTable(message.tableId, table);
    this.subscriptions.set(socket, {
      tableId: message.tableId,
      seat,
    });
    this.sendSnapshot(socket, message.tableId, seat, table);
  }

  private applyCommand(socket: WebSocket, command: ClientCommand): void {
    const table = this.tables.get(command.tableId);
    if (table === undefined) {
      this.send(socket, {
        type: "rejected",
        tableId: command.tableId,
        actionId: command.actionId,
        reason: "tableNotFound",
      });
      return;
    }

    const subscription = this.subscriptions.get(socket);
    const userId = this.socketUsers.get(socket);
    if (table.players[command.seat] !== userId) {
      this.rejectCommand(
        socket,
        table,
        command,
        "seatNotOwned",
        subscription?.tableId === command.tableId ? subscription.seat : undefined,
      );
      return;
    }
    if (
      subscription?.tableId !== command.tableId ||
      subscription.seat !== command.seat
    ) {
      this.rejectCommand(
        socket,
        table,
        command,
        "seatMismatch",
        subscription?.tableId === command.tableId ? subscription.seat : undefined,
      );
      return;
    }

    if (table.actionIds.has(command.actionId)) {
      this.sendSnapshot(socket, command.tableId, command.seat, table, true);
      return;
    }

    if (command.expectedVersion !== table.version) {
      this.rejectCommand(socket, table, command, "versionMismatch");
      return;
    }
    if (table.state === null) {
      this.rejectCommand(socket, table, command, "dealNotStarted");
      return;
    }

    const transition = isGameState(table.state)
      ? command.type === "gameAction"
        ? applyGameAction(
            table.state,
            command.seat,
            command.payload.action,
            this.dealSource,
          )
        : {
            accepted: false as const,
            reason: "invalidCommand",
            state: table.state,
          }
      : command.type === "playCard"
        ? playCard(table.state, command.seat, command.payload.card)
        : {
            accepted: false as const,
            reason: "invalidCommand",
            state: table.state,
          };
    if (!transition.accepted) {
      this.rejectCommand(socket, table, command, transition.reason);
      return;
    }

    const next = cloneTable(table);
    next.state = transition.state;
    next.version += 1;
    next.actionIds.add(command.actionId);
    this.persistTable(command.tableId, next, () =>
      this.logCommand(command, "accepted", next.version),
    );
    this.broadcast(command.tableId, next);
  }

  private rejectCommand(
    socket: WebSocket,
    table: Table,
    command: ClientCommand,
    reason: string,
    snapshotSeat: Seat | undefined = command.seat,
  ): void {
    const next = cloneTable(table);
    next.actionIds.add(command.actionId);
    this.persistTable(command.tableId, next, () =>
      this.logCommand(command, `rejected:${reason}`, next.version),
    );
    this.send(socket, {
      type: "rejected",
      tableId: command.tableId,
      actionId: command.actionId,
      version: next.version,
      reason,
      ...(snapshotSeat === undefined || next.state === null
        ? {}
        : { state: projectState(next.state, snapshotSeat) }),
    });
  }

  private persistTable(id: string, table: Table, log?: () => void): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      writeTable(this.database, id, table, this.now());
      log?.();
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    this.tables.set(id, table);
  }

  public pruneExpiredTables(): void {
    const now = this.now();
    const rows = this.database.prepare("SELECT id, updated_at FROM tables").all();
    const expired = rows.filter((row) => {
      const state = this.tables.get(String(row.id))?.state;
      const ttl =
        state && isGameState(state) && state.phase === "finished"
          ? this.finishedTableTtlMs
          : this.tableTtlMs;
      return Number(row.updated_at) <= now - ttl;
    });
    this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const row of expired) {
        this.database.prepare("DELETE FROM command_log WHERE table_id = ?").run(row.id);
        this.database.prepare("DELETE FROM tables WHERE id = ?").run(row.id);
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    for (const row of expired) {
      const id = String(row.id);
      this.tables.delete(id);
      for (const [socket, subscription] of this.subscriptions) {
        if (subscription.tableId === id) {
          this.send(socket, { type: "rejected", tableId: id, reason: "tableExpired" });
          this.subscriptions.delete(socket);
        }
      }
    }
  }

  private broadcast(tableId: string, table: Table): void {
    for (const [socket, subscription] of this.subscriptions) {
      if (subscription.tableId === tableId) {
        this.sendSnapshot(socket, tableId, subscription.seat, table);
      }
    }
  }

  private sendSnapshot(
    socket: WebSocket,
    tableId: string,
    seat: Seat,
    table: Table,
    repeatedAction = false,
  ): void {
    if (table.state === null) {
      this.send(socket, {
        type: "rejected",
        tableId,
        version: table.version,
        reason: "dealNotStarted",
      });
      return;
    }
    this.send(socket, {
      type: "snapshot",
      tableId,
      version: table.version,
      state: projectState(table.state, seat),
      ...(repeatedAction ? { repeatedAction: true as const } : {}),
    });
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  private logCommand(
    command: ClientCommand,
    status: string,
    resultingVersion: number,
  ): void {
    this.database
      .prepare(
        `
        INSERT OR IGNORE INTO command_log (
          table_id,
          action_id,
          seat,
          expected_version,
          command_type,
          payload_json,
          status,
          resulting_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        command.tableId,
        command.actionId,
        command.seat,
        command.expectedVersion,
        command.type,
        JSON.stringify(command.payload),
        status,
        resultingVersion,
      );
  }
}

export function createGameServer(options: GameServerOptions = {}): GameServer {
  return new GameServer(options);
}
