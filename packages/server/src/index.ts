import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  applyGameAction,
  createGame,
  gameView,
  playCard,
  view,
  type Card,
  type GameAction,
  type GameSeatView,
  type GameState,
  type Seat,
  type SeatView,
  type TableSettings,
  type TrickPlayState,
} from "@pref/engine";
import WebSocket, { WebSocketServer } from "ws";

export interface PlayCardCommand {
  readonly tableId: string;
  readonly seat: Seat;
  readonly actionId: string;
  readonly expectedVersion: number;
  readonly type: "playCard";
  readonly payload: {
    readonly card: Card;
  };
}

export interface GameActionCommand {
  readonly tableId: string;
  readonly seat: Seat;
  readonly actionId: string;
  readonly expectedVersion: number;
  readonly type: "gameAction";
  readonly payload: {
    readonly action: GameAction;
  };
}

export type ClientCommand = PlayCardCommand | GameActionCommand;

export interface JoinMessage {
  readonly type: "join";
  readonly tableId: string;
  readonly seat: Seat;
}

export interface WatchMessage {
  readonly type: "watch";
  readonly tableId: string;
}

export interface SnapshotMessage {
  readonly type: "snapshot";
  readonly tableId: string;
  readonly version: number;
  readonly state: SeatView | GameSeatView;
  readonly repeatedAction?: true;
}

export interface RejectionMessage {
  readonly type: "rejected";
  readonly tableId?: string;
  readonly actionId?: string;
  readonly version?: number;
  readonly reason: string;
  readonly state?: SeatView | GameSeatView;
}

export interface TableMessage {
  readonly type: "table";
  readonly tableId: string;
  readonly settings: TableFormSettings;
  readonly settingsRevision: number;
  readonly dealt: boolean;
  readonly seats: readonly boolean[];
  readonly names: readonly (string | null)[];
  readonly seat: number | null;
  readonly isHost: boolean;
  readonly confirmed: readonly [boolean, boolean, boolean];
}

export type ServerMessage = SnapshotMessage | RejectionMessage | TableMessage;

export type TableFormSettings = TableSettings;

interface Table {
  state: TrickPlayState | GameState | null;
  version: number;
  readonly actionIds: Set<string>;
  readonly players: [number | null, number | null, number | null];
  readonly hostUserId: number | null;
  settings: TableFormSettings;
  settingsRevision: number;
  dealt: boolean;
  confirmed: [boolean, boolean, boolean];
}

interface Subscription {
  readonly tableId: string;
  readonly seat: Seat;
}

export interface GameServerOptions {
  readonly databasePath?: string;
  readonly staticDir?: string;
}

export class GameServer {
  private readonly database: DatabaseSync;
  private readonly httpServer: Server;
  private readonly socketServer: WebSocketServer;
  private readonly tables = new Map<string, Table>();
  private readonly subscriptions = new Map<WebSocket, Subscription>();
  private readonly socketUsers = new Map<WebSocket, number>();
  private readonly staticDir: string | null;

  public constructor(options: GameServerOptions = {}) {
    this.staticDir =
      options.staticDir === undefined ? null : path.resolve(options.staticDir);
    this.database = new DatabaseSync(options.databasePath ?? ":memory:");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS command_log (
        table_id TEXT NOT NULL,
        action_id TEXT NOT NULL,
        seat INTEGER NOT NULL,
        expected_version INTEGER NOT NULL,
        command_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL,
        resulting_version INTEGER NOT NULL,
        PRIMARY KEY (table_id, action_id)
      )
    `);

    this.httpServer = createServer((request, response) => {
      void this.handleHttp(request, response);
    });
    this.socketServer = new WebSocketServer({ server: this.httpServer });
    this.socketServer.on("connection", (socket, request) => {
      const userId = this.authenticatedUser(request.headers.cookie);
      if (userId === null) {
        socket.close(1008, "Authentication required");
        return;
      }
      this.socketUsers.set(socket, userId);
      socket.on("message", (data) => {
        this.handleMessage(socket, data.toString());
      });
      socket.on("close", () => {
        this.subscriptions.delete(socket);
        this.socketUsers.delete(socket);
      });
    });
  }

  public addTable(
    tableId: string,
    state: TrickPlayState | GameState,
  ): void {
    if (this.tables.has(tableId)) {
      throw new Error(`Table already exists: ${tableId}`);
    }
    this.tables.set(tableId, {
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

  public getTable(
    tableId: string,
  ):
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
    const pathname = new URL(
      request.url ?? "/",
      "http://localhost",
    ).pathname;

    if (
      request.method === "POST" &&
      (pathname === "/register" || pathname === "/login")
    ) {
      let body: unknown;
      try {
        body = JSON.parse(await readRequestBody(request));
      } catch {
        this.sendJson(response, 400, { error: "invalidJson" });
        return;
      }
      if (
        !isRecord(body) ||
        typeof body.name !== "string" ||
        body.name.trim().length === 0 ||
        typeof body.password !== "string" ||
        body.password.length === 0
      ) {
        this.sendJson(response, 400, { error: "invalidCredentials" });
        return;
      }

      const name = body.name.trim();
      if (pathname === "/register") {
        const existing = this.database
          .prepare("SELECT id FROM users WHERE name = ?")
          .get(name);
        if (existing !== undefined) {
          this.sendJson(response, 409, { error: "nameTaken" });
          return;
        }

        const salt = randomBytes(16).toString("hex");
        const result = this.database
          .prepare(`
            INSERT INTO users (name, password_salt, password_hash)
            VALUES (?, ?, ?)
          `)
          .run(name, salt, hashPassword(body.password, salt));
        this.sendJson(response, 201, {
          id: Number(result.lastInsertRowid),
          name,
        });
        return;
      }

      const user = this.database
        .prepare(`
          SELECT id, name, password_salt, password_hash
          FROM users
          WHERE name = ?
        `)
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
        !passwordMatches(
          body.password,
          user.password_salt,
          user.password_hash,
        )
      ) {
        this.sendJson(response, 401, { error: "invalidCredentials" });
        return;
      }

      const token = randomBytes(32).toString("hex");
      this.database
        .prepare(
          "INSERT INTO sessions (token_hash, user_id) VALUES (?, ?)",
        )
        .run(hashToken(token), user.id);
      response.setHeader(
        "Set-Cookie",
        `session=${token}; HttpOnly; SameSite=Strict; Path=/`,
      );
      this.sendJson(response, 200, { id: user.id, name: user.name });
      return;
    }

    if (request.method === "POST" && pathname === "/logout") {
      const token = parseCookie(request.headers.cookie, "session");
      if (token !== null) {
        this.database
          .prepare("DELETE FROM sessions WHERE token_hash = ?")
          .run(hashToken(token));
      }
      response.setHeader(
        "Set-Cookie",
        "session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      );
      this.sendJson(response, 200, { ok: true });
      return;
    }

    const userId = this.authenticatedUser(request.headers.cookie);
    if (userId === null) {
      if (!isApiPath(pathname)) {
        if (await this.serveStatic(request, response, pathname)) {
          return;
        }
        if (
          this.staticDir !== null &&
          (request.method === "GET" || request.method === "HEAD")
        ) {
          this.sendJson(response, 404, { error: "notFound" });
          return;
        }
      }
      this.sendJson(response, 401, { error: "notAuthenticated" });
      return;
    }

    if (request.method === "GET" && pathname === "/me") {
      const user = this.database
        .prepare("SELECT id, name FROM users WHERE id = ?")
        .get(userId);
      this.sendJson(response, 200, user);
      return;
    }

    if (request.method === "POST" && pathname === "/tables") {
      const settings = await this.readSettings(request, response);
      if (settings === null) {
        return;
      }
      const tableId = randomBytes(8).toString("hex");
      this.tables.set(tableId, {
        state: null,
        version: 0,
        actionIds: new Set(),
        players: [userId, null, null],
        hostUserId: userId,
        settings,
        settingsRevision: 0,
        dealt: false,
        confirmed: [false, false, false],
      });
      this.sendJson(response, 201, {
        ...this.tableResponse(tableId, this.tables.get(tableId)!, userId),
        invitePath: `/table/${tableId}`,
      });
      return;
    }

    const tableRoute = pathname.match(
      /^\/tables\/([a-f0-9]+)(?:\/(join|deal|confirm))?$/,
    );
    if (tableRoute === null) {
      if (await this.serveStatic(request, response, pathname)) {
        return;
      }
      this.sendJson(response, 404, { error: "notFound" });
      return;
    }
    const [, tableId, action] = tableRoute;
    const table = this.tables.get(tableId);
    if (table === undefined) {
      this.sendJson(response, 404, { error: "tableNotFound" });
      return;
    }

    if (request.method === "GET" && action === undefined) {
      this.sendJson(
        response,
        200,
        this.tableResponse(tableId, table, userId),
      );
      return;
    }

    if (request.method === "POST" && action === "join") {
      let seat = table.players.indexOf(userId);
      if (seat === -1) {
        seat = table.players.indexOf(null);
        if (seat === -1) {
          this.sendJson(response, 409, { error: "tableFull" });
          return;
        }
        table.players[seat] = userId;
      }
      this.sendJson(response, 200, {
        ...this.tableResponse(tableId, table, userId),
        seat,
      });
      this.notifyLobby(tableId);
      return;
    }

    if (
      request.method === "PATCH" &&
      action === undefined
    ) {
      if (table.hostUserId !== userId) {
        this.sendJson(response, 403, { error: "hostOnly" });
        return;
      }
      if (table.dealt) {
        this.sendJson(response, 409, { error: "settingsLocked" });
        return;
      }
      const settings = await this.readSettings(request, response);
      if (settings === null) {
        return;
      }
      table.settings = settings;
      table.settingsRevision += 1;
      table.confirmed = [false, false, false];
      this.sendJson(
        response,
        200,
        this.tableResponse(tableId, table, userId),
      );
      this.notifyLobby(tableId);
      return;
    }

    if (request.method === "POST" && action === "confirm") {
      const seat = table.players.indexOf(userId);
      if (seat === -1) {
        this.sendJson(response, 403, { error: "notSeated" });
        return;
      }
      if (table.hostUserId === userId) {
        this.sendJson(response, 403, { error: "hostOnly" });
        return;
      }
      if (table.dealt) {
        this.sendJson(response, 409, { error: "alreadyDealt" });
        return;
      }
      const confirmed = [...table.confirmed] as [
        boolean,
        boolean,
        boolean,
      ];
      confirmed[seat] = true;
      table.confirmed = confirmed;
      this.sendJson(response, 200, this.tableResponse(tableId, table, userId));
      this.notifyLobby(tableId);
      return;
    }

    if (request.method === "POST" && action === "deal") {
      if (table.hostUserId !== userId) {
        this.sendJson(response, 403, { error: "hostOnly" });
        return;
      }
      if (table.dealt) {
        this.sendJson(response, 409, { error: "alreadyDealt" });
        return;
      }
      if (table.confirmed.filter(Boolean).length < 2) {
        this.sendJson(response, 409, { error: "confirmationsNeeded" });
        return;
      }
      let seed = Date.now();
      const rawBody = await readRequestBody(request);
      if (rawBody.length > 0) {
        try {
          const body = JSON.parse(rawBody) as unknown;
          if (isRecord(body) && typeof body.seed === "number") {
            seed = body.seed;
          }
        } catch {
          this.sendJson(response, 400, { error: "invalidJson" });
          return;
        }
      }
      table.state = createGame(table.settings, seed);
      table.dealt = true;
      this.sendJson(
        response,
        200,
        this.tableResponse(tableId, table, userId),
      );
      this.notifyLobby(tableId);
      return;
    }

    this.sendJson(response, 404, { error: "notFound" });
  }

  private async serveStatic(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): Promise<boolean> {
    if (
      this.staticDir === null ||
      (request.method !== "GET" && request.method !== "HEAD")
    ) {
      return false;
    }
    const root = this.staticDir;
    let decoded = pathname;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return false;
    }
    const relative = path
      .normalize(decoded)
      .replace(/^(\.\.(\/|\\|$))+/, "")
      .replace(/^[/\\]+/, "");
    const direct = path.resolve(root, relative);
    if (direct !== root && !direct.startsWith(`${root}${path.sep}`)) {
      return false;
    }
    const file = await existingFile(direct);
    const target =
      file ??
      (path.extname(relative) === ""
        ? await existingFile(path.join(root, "index.html"))
        : null);
    if (target === null) {
      return false;
    }
    response.writeHead(200, {
      "Content-Type": staticType(path.extname(target)),
      "Cache-Control":
        path.extname(target) === ".html"
          ? "no-cache"
          : "public, max-age=31536000, immutable",
    });
    if (request.method === "HEAD") {
      response.end();
      return true;
    }
    createReadStream(target).pipe(response);
    return true;
  }

  private async readSettings(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<TableFormSettings | null> {
    try {
      const value = JSON.parse(await readRequestBody(request)) as unknown;
      if (!isTableFormSettings(value)) {
        this.sendJson(response, 400, { error: "invalidSettings" });
        return null;
      }
      return value;
    } catch {
      this.sendJson(response, 400, { error: "invalidJson" });
      return null;
    }
  }

  private tableResponse(
    tableId: string,
    table: Table,
    userId: number,
  ): {
    tableId: string;
    settings: TableFormSettings;
    settingsRevision: number;
    dealt: boolean;
    seats: readonly boolean[];
    names: readonly (string | null)[];
    seat: number | null;
    isHost: boolean;
    confirmed: readonly [boolean, boolean, boolean];
  } {
    const seat = table.players.indexOf(userId);
    return {
      tableId,
      settings: table.settings,
      settingsRevision: table.settingsRevision,
      dealt: table.dealt,
      seats: table.players.map((player) => player !== null),
      names: this.playerNames(table.players),
      seat: seat === -1 ? null : seat,
      isHost: table.hostUserId === userId,
      confirmed: table.confirmed,
    };
  }

  private playerNames(
    players: readonly (number | null)[],
  ): (string | null)[] {
    return players.map((userId) => {
      if (userId === null) {
        return null;
      }
      const user = this.database
        .prepare("SELECT name FROM users WHERE id = ?")
        .get(userId) as { name: string } | undefined;
      return user?.name ?? null;
    });
  }

  private authenticatedUser(cookieHeader: string | undefined): number | null {
    const token = parseCookie(cookieHeader, "session");
    if (token === null) {
      return null;
    }
    const session = this.database
      .prepare("SELECT user_id FROM sessions WHERE token_hash = ?")
      .get(hashToken(token)) as { user_id: number } | undefined;
    return session?.user_id ?? null;
  }

  private sendJson(
    response: ServerResponse,
    status: number,
    value: unknown,
  ): void {
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify(value));
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
    const table = this.tables.get(message.tableId);
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
    const seat =
      existingSeat === -1 ? message.seat : (existingSeat as Seat);
    if (
      existingSeat === -1 &&
      table.players[seat] !== null
    ) {
      this.send(socket, {
        type: "rejected",
        tableId: message.tableId,
        reason: "seatTaken",
      });
      return;
    }
    table.players[seat] = userId;
    this.subscriptions.set(socket, {
      tableId: message.tableId,
      seat,
    });
    this.sendSnapshot(socket, message.tableId, seat, table);
  }

  private applyCommand(
    socket: WebSocket,
    command: ClientCommand,
  ): void {
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
        subscription?.tableId === command.tableId
          ? subscription.seat
          : undefined,
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
        subscription?.tableId === command.tableId
          ? subscription.seat
          : undefined,
      );
      return;
    }

    if (table.actionIds.has(command.actionId)) {
      this.sendSnapshot(
        socket,
        command.tableId,
        command.seat,
        table,
        true,
      );
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
          )
        : {
            accepted: false as const,
            reason: "invalidCommand",
            state: table.state,
          }
      : command.type === "playCard"
        ? playCard(
            table.state,
            command.seat,
            command.payload.card,
          )
        : {
            accepted: false as const,
            reason: "invalidCommand",
            state: table.state,
          };
    if (!transition.accepted) {
      this.rejectCommand(socket, table, command, transition.reason);
      return;
    }

    table.state = transition.state;
    table.version += 1;
    table.actionIds.add(command.actionId);
    this.logCommand(command, "accepted", table.version);
    this.broadcast(command.tableId, table);
  }

  private rejectCommand(
    socket: WebSocket,
    table: Table,
    command: ClientCommand,
    reason: string,
    snapshotSeat: Seat | undefined = command.seat,
  ): void {
    table.actionIds.add(command.actionId);
    this.logCommand(command, `rejected:${reason}`, table.version);
    this.send(socket, {
      type: "rejected",
      tableId: command.tableId,
      actionId: command.actionId,
      version: table.version,
      reason,
      ...(snapshotSeat === undefined || table.state === null
        ? {}
        : { state: projectState(table.state, snapshotSeat) }),
    });
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
      .prepare(`
        INSERT INTO command_log (
          table_id,
          action_id,
          seat,
          expected_version,
          command_type,
          payload_json,
          status,
          resulting_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
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

export function createGameServer(
  options: GameServerOptions = {},
): GameServer {
  return new GameServer(options);
}

function isApiPath(pathname: string): boolean {
  return (
    pathname === "/me" ||
    pathname === "/register" ||
    pathname === "/login" ||
    pathname === "/logout" ||
    pathname === "/ws" ||
    pathname === "/tables" ||
    pathname.startsWith("/tables/")
  );
}

async function existingFile(candidate: string): Promise<string | null> {
  try {
    const info = await stat(candidate);
    return info.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

function staticType(extension: string): string {
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".webmanifest": "application/manifest+json",
    ".txt": "text/plain; charset=utf-8",
    ".map": "application/json; charset=utf-8",
  };
  return types[extension] ?? "application/octet-stream";
}

function isWatchMessage(value: unknown): value is WatchMessage {
  return (
    isRecord(value) &&
    value.type === "watch" &&
    typeof value.tableId === "string"
  );
}

function isJoinMessage(value: unknown): value is JoinMessage {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.type === "join" &&
    typeof value.tableId === "string" &&
    isSeat(value.seat)
  );
}

function isPlayCardCommand(value: unknown): value is PlayCardCommand {
  if (!isRecord(value) || !isRecord(value.payload)) {
    return false;
  }
  return (
    typeof value.tableId === "string" &&
    isSeat(value.seat) &&
    typeof value.actionId === "string" &&
    Number.isInteger(value.expectedVersion) &&
    value.type === "playCard" &&
    isCard(value.payload.card)
  );
}

function isGameActionCommand(value: unknown): value is GameActionCommand {
  if (!isRecord(value) || !isRecord(value.payload)) {
    return false;
  }
  return (
    typeof value.tableId === "string" &&
    isSeat(value.seat) &&
    typeof value.actionId === "string" &&
    Number.isInteger(value.expectedVersion) &&
    value.type === "gameAction" &&
    isGameAction(value.payload.action)
  );
}

function isGameAction(value: unknown): value is GameAction {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  if (value.type === "playCard") {
    return isCard(value.card);
  }
  if (value.type === "throwTalon" || value.type === "withoutThree") {
    return true;
  }
  if (value.type === "rematch") {
    return Number.isSafeInteger(value.seed);
  }
  if (value.type === "openTalon") {
    return value.index === 0 || value.index === 1;
  }
  if (value.type === "discard") {
    return (
      Array.isArray(value.cards) &&
      value.cards.length === 2 &&
      value.cards.every(isCard)
    );
  }
  if (value.type === "order" && isRecord(value.bid)) {
    if (value.bid.type === "misere") {
      return true;
    }
    return (
      value.bid.type === "contract" &&
      [6, 7, 8, 9, 10].includes(value.bid.level as number) &&
      ["spades", "clubs", "diamonds", "hearts", "noTrump"].includes(
        value.bid.trump as string,
      )
    );
  }
  if (value.type === "defense") {
    return (
      isRecord(value.action) &&
      ["pass", "whist", "halfWhist", "light", "dark"].includes(
        value.action.type as string,
      )
    );
  }
  if (value.type === "auction" && isRecord(value.action)) {
    if (value.action.type === "pass") {
      return true;
    }
    if (value.action.type !== "bid" || !isRecord(value.action.bid)) {
      return false;
    }
    if (value.action.bid.type === "misere") {
      return true;
    }
    return (
      value.action.bid.type === "contract" &&
      [6, 7, 8, 9, 10].includes(value.action.bid.level as number) &&
      ["spades", "clubs", "diamonds", "hearts", "noTrump"].includes(
        value.action.bid.trump as string,
      )
    );
  }
  return false;
}

function isCard(value: unknown): value is Card {
  if (!isRecord(value)) {
    return false;
  }
  return (
    ["spades", "clubs", "diamonds", "hearts"].includes(
      value.suit as string,
    ) &&
    Number.isInteger(value.rank) &&
    (value.rank as number) >= 7 &&
    (value.rank as number) <= 14
  );
}

function isSeat(value: unknown): value is Seat {
  return value === 0 || value === 1 || value === 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isGameState(
  state: TrickPlayState | GameState,
): state is GameState {
  return "settings" in state && "auction" in state;
}

function projectState(
  state: TrickPlayState | GameState,
  seat: Seat,
): SeatView | GameSeatView {
  return isGameState(state) ? gameView(state, seat) : view(state, seat);
}

function isTableFormSettings(value: unknown): value is TableFormSettings {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.raspasProgression === "111" ||
      value.raspasProgression === "122" ||
      value.raspasProgression === "123" ||
      value.raspasProgression === "123123") &&
    (value.raspasExit === "666" ||
      value.raspasExit === "677" ||
      value.raspasExit === "788" ||
      value.raspasExit === "678678") &&
    typeof value.throwTalon === "boolean" &&
    typeof value.bulletTarget === "number" &&
    Number.isInteger(value.bulletTarget) &&
    value.bulletTarget >= 3 &&
    value.bulletTarget <= 10000
  );
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 16_384) {
      throw new RangeError("Request body is too large");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

function passwordMatches(
  password: string,
  salt: string,
  expectedHash: string,
): boolean {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return (
    actual.length === expected.length &&
    timingSafeEqual(actual, expected)
  );
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookie(
  cookieHeader: string | undefined,
  name: string,
): string | null {
  if (cookieHeader === undefined) {
    return null;
  }
  for (const entry of cookieHeader.split(";")) {
    const [key, ...valueParts] = entry.trim().split("=");
    if (key === name) {
      return valueParts.join("=") || null;
    }
  }
  return null;
}
