import { createGame, type Deal } from "@pref/engine";
import { randomBytes } from "node:crypto";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readRequestBody, sendJson } from "./http.js";
import type { TableFormSettings } from "./protocol.js";
import { cloneTable, type Table } from "./tables.js";
import { isTableFormSettings } from "./validation.js";

export interface LobbyContext {
  database: DatabaseSync;
  tables: Map<string, Table>;
  dealSource: () => Deal;
  persistTable: (id: string, table: Table) => void;
  notifyLobby: (id: string) => void;
  serveStatic: (
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ) => Promise<boolean>;
}
export async function handleLobby(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  userId: number,
  ctx: LobbyContext,
): Promise<void> {
  const tableResponse = (id: string, table: Table, user: number) =>
    tableDetails(ctx.database, id, table, user);
  if (request.method === "POST" && pathname === "/tables") {
    const settings = await readSettings(request, response);
    if (settings === null) {
      return;
    }
    const tableId = randomBytes(8).toString("hex");
    ctx.persistTable(tableId, {
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
    sendJson(response, 201, {
      ...tableResponse(tableId, ctx.tables.get(tableId)!, userId),
      invitePath: `/table/${tableId}`,
    });
    return;
  }

  const tableRoute = pathname.match(
    /^\/tables\/([a-f0-9]+)(?:\/(join|deal|confirm))?$/,
  );
  if (tableRoute === null) {
    if (await ctx.serveStatic(request, response, pathname)) {
      return;
    }
    sendJson(response, 404, { error: "notFound" });
    return;
  }
  const [, tableId, action] = tableRoute;
  const storedTable = ctx.tables.get(tableId);
  let table = storedTable === undefined ? undefined : cloneTable(storedTable);
  if (table === undefined) {
    sendJson(response, 404, { error: "tableNotFound" });
    return;
  }

  if (request.method === "GET" && action === undefined) {
    sendJson(response, 200, tableResponse(tableId, table, userId));
    return;
  }

  if (request.method === "POST" && action === "join") {
    let seat = table.players.indexOf(userId);
    if (seat === -1) {
      seat = table.players.indexOf(null);
      if (seat === -1) {
        sendJson(response, 409, { error: "tableFull" });
        return;
      }
      table.players[seat] = userId;
    }
    ctx.persistTable(tableId, table);
    sendJson(response, 200, {
      ...tableResponse(tableId, table, userId),
      seat,
    });
    ctx.notifyLobby(tableId);
    return;
  }

  if (request.method === "PATCH" && action === undefined) {
    if (table.hostUserId !== userId) {
      sendJson(response, 403, { error: "hostOnly" });
      return;
    }
    if (table.dealt) {
      sendJson(response, 409, { error: "settingsLocked" });
      return;
    }
    const settings = await readSettings(request, response);
    if (settings === null) {
      return;
    }
    // Other lobby requests can complete while the request body is being read.
    const latest = ctx.tables.get(tableId);
    if (!latest || latest.dealt) {
      sendJson(response, latest ? 409 : 404, { error: latest ? "settingsLocked" : "tableNotFound" });
      return;
    }
    table = cloneTable(latest);
    table.settings = settings;
    table.settingsRevision += 1;
    table.confirmed = [false, false, false];
    ctx.persistTable(tableId, table);
    sendJson(response, 200, tableResponse(tableId, table, userId));
    ctx.notifyLobby(tableId);
    return;
  }

  if (request.method === "POST" && action === "confirm") {
    const seat = table.players.indexOf(userId);
    if (seat === -1) {
      sendJson(response, 403, { error: "notSeated" });
      return;
    }
    if (table.hostUserId === userId) {
      sendJson(response, 403, { error: "hostOnly" });
      return;
    }
    if (table.dealt) {
      sendJson(response, 409, { error: "alreadyDealt" });
      return;
    }
    const confirmed = [...table.confirmed] as [boolean, boolean, boolean];
    confirmed[seat] = true;
    table.confirmed = confirmed;
    ctx.persistTable(tableId, table);
    sendJson(response, 200, tableResponse(tableId, table, userId));
    ctx.notifyLobby(tableId);
    return;
  }

  if (request.method === "POST" && action === "deal") {
    if (table.hostUserId !== userId) {
      sendJson(response, 403, { error: "hostOnly" });
      return;
    }
    if (table.dealt) {
      sendJson(response, 409, { error: "alreadyDealt" });
      return;
    }
    if (table.confirmed.filter(Boolean).length < 2) {
      sendJson(response, 409, { error: "confirmationsNeeded" });
      return;
    }
    const revision = table.settingsRevision;
    // Legacy client seeds never influence a server deal.
    const rawBody = await readRequestBody(request);
    if (rawBody.length > 0) {
      try {
        JSON.parse(rawBody);
      } catch {
        sendJson(response, 400, { error: "invalidJson" });
        return;
      }
    }
    const latest = ctx.tables.get(tableId);
    if (!latest || latest.dealt || latest.settingsRevision !== revision || latest.confirmed.filter(Boolean).length < 2) {
      sendJson(response, latest ? 409 : 404, { error: latest?.dealt ? "alreadyDealt" : latest ? "confirmationsNeeded" : "tableNotFound" });
      return;
    }
    table = cloneTable(latest);
    table.state = createGame(table.settings, ctx.dealSource());
    table.dealt = true;
    ctx.persistTable(tableId, table);
    sendJson(response, 200, tableResponse(tableId, table, userId));
    ctx.notifyLobby(tableId);
    return;
  }

  sendJson(response, 404, { error: "notFound" });
}
export async function readSettings(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<TableFormSettings | null> {
  try {
    const value = JSON.parse(await readRequestBody(request)) as unknown;
    if (!isTableFormSettings(value)) {
      sendJson(response, 400, { error: "invalidSettings" });
      return null;
    }
    return value;
  } catch {
    sendJson(response, 400, { error: "invalidJson" });
    return null;
  }
}
export function tableDetails(
  database: DatabaseSync,
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
    names: playerNames(database, table.players),
    seat: seat === -1 ? null : seat,
    isHost: table.hostUserId === userId,
    confirmed: table.confirmed,
  };
}
export function playerNames(
  database: DatabaseSync,
  players: readonly (number | null)[],
): (string | null)[] {
  return players.map((userId) => {
    if (userId === null) {
      return null;
    }
    const user = database.prepare("SELECT name FROM users WHERE id = ?").get(userId) as
      | { name: string }
      | undefined;
    return user?.name ?? null;
  });
}
