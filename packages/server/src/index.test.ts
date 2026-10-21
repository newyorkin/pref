import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  applyGameAction,
  createAuction,
  createBulletScore,
  createGame,
  createTrickPlay,
  gameView,
  type Card,
  type GameAction,
  type GameSeatView,
  type GameState,
  type Trump,
} from "@pref/engine";
import { describe, expect, test } from "vitest";
import WebSocket from "ws";

import {
  createGameServer,
  type GameActionCommand,
  type PlayCardCommand,
  type ServerMessage,
  type SnapshotMessage,
} from "./index.js";

class MessageInbox {
  private readonly queued: ServerMessage[] = [];
  private readonly waiting: Array<(message: ServerMessage) => void> = [];

  public constructor(socket: WebSocket) {
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      const resolve = this.waiting.shift();
      if (resolve === undefined) {
        this.queued.push(message);
      } else {
        resolve(message);
      }
    });
  }

  public get pending(): number {
    return this.queued.length;
  }

  public next(): Promise<ServerMessage> {
    const message = this.queued.shift();
    if (message !== undefined) {
      return Promise.resolve(message);
    }
    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }
}

const cards = {
  seat0: { suit: "spades", rank: 7 },
  seat1: { suit: "hearts", rank: 8 },
  seat2: { suit: "diamonds", rank: 9 },
} as const satisfies Record<string, Card>;

async function registerAndLogin(
  serverUrl: string,
  name: string,
): Promise<{ cookie: string; userId: number }> {
  const credentials = { name, password: "secret" };
  const registration = await fetch(`${serverUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  expect(registration.status).toBe(201);

  const login = await fetch(`${serverUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  expect(login.status).toBe(200);
  const user = (await login.json()) as { id: number };
  return {
    cookie: login.headers.get("set-cookie")!.split(";")[0],
    userId: user.id,
  };
}

async function login(
  serverUrl: string,
  name: string,
): Promise<{ cookie: string; userId: number }> {
  const response = await fetch(`${serverUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password: "secret" }),
  });
  expect(response.status).toBe(200);
  const user = (await response.json()) as { id: number };
  return {
    cookie: response.headers.get("set-cookie")!.split(";")[0],
    userId: user.id,
  };
}

async function connect(
  serverUrl: string,
  cookie: string,
): Promise<{ socket: WebSocket; inbox: MessageInbox }> {
  const socket = new WebSocket(serverUrl, {
    headers: { Cookie: cookie },
  });
  const inbox = new MessageInbox(socket);
  await once(socket, "open");
  return { socket, inbox };
}

const shortGameSettings = {
  raspasProgression: "123",
  raspasExit: "666",
  throwTalon: false,
  bulletTarget: 2,
} as const;

function apply(
  state: GameState,
  seat: 0 | 1 | 2,
  action: GameAction,
): GameState | null {
  const transition = applyGameAction(state, seat, action);
  return transition.accepted ? transition.state : null;
}

function findWinningSetup(): {
  seed: number;
  trump: Trump;
  discard: GameAction;
} {
  const initialScore = {
    ...createBulletScore(),
    bullet: [0, 2, 2] as const,
  };
  for (let seed = 0; seed < 100; seed += 1) {
    for (const trump of [
      "spades",
      "clubs",
      "diamonds",
      "hearts",
      "noTrump",
    ] as const satisfies readonly Trump[]) {
      let state = createGame(
        shortGameSettings,
        seed,
        initialScore,
        2,
      );
      state = apply(state, 0, {
        type: "auction",
        action: {
          type: "bid",
          bid: { type: "contract", level: 6, trump },
        },
      })!;
      state = apply(state, 1, {
        type: "auction",
        action: { type: "pass" },
      })!;
      state = apply(state, 2, {
        type: "auction",
        action: { type: "pass" },
      })!;

      for (const discard of gameView(state, 0).allowedActions) {
        let candidate = apply(state, 0, discard)!;
        candidate = apply(candidate, 0, {
          type: "order",
          bid: { type: "contract", level: 6, trump },
        })!;
        candidate = apply(candidate, 1, {
          type: "defense",
          action: { type: "whist" },
        })!;
        candidate = apply(candidate, 2, {
          type: "defense",
          action: { type: "whist" },
        })!;
        while (candidate.phase === "play") {
          const turn = candidate.play!.turn!;
          candidate = apply(
            candidate,
            turn,
            gameView(candidate, turn).allowedActions[0],
          )!;
        }
        if (candidate.phase === "finished") {
          return { seed, trump, discard };
        }
      }
    }
  }
  throw new Error("No deterministic short-game setup found");
}

function asGameSnapshot(
  message: ServerMessage,
): SnapshotMessage & { state: GameSeatView } {
  if (
    message.type !== "snapshot" ||
    !("phase" in message.state)
  ) {
    throw new Error("Expected a full-game snapshot");
  }
  return message as SnapshotMessage & { state: GameSeatView };
}

describe("game server", () => {
  test("logout removes the session cookie and the stored session", async () => {
    const server = createGameServer();
    await server.listen();
    try {
      const session = await registerAndLogin(
        server.httpUrl(),
        "logout-user",
      );
      const before = await fetch(`${server.httpUrl()}/me`, {
        headers: { Cookie: session.cookie },
      });
      expect(before.status).toBe(200);

      const logout = await fetch(`${server.httpUrl()}/logout`, {
        method: "POST",
        headers: { Cookie: session.cookie },
      });
      expect(logout.status).toBe(200);
      expect(logout.headers.get("set-cookie")).toMatch(/Max-Age=0/);

      const after = await fetch(`${server.httpUrl()}/me`, {
        headers: { Cookie: session.cookie },
      });
      expect(after.status).toBe(401);
    } finally {
      await server.close();
    }
  });

  test("keeps versions stable on rejection and broadcasts a legal move", async () => {
    const server = createGameServer();
    server.addTable(
      "table-1",
      createTrickPlay(
        [[cards.seat0], [cards.seat1], [cards.seat2]],
        0,
        "noTrump",
      ),
    );
    await server.listen();

    const [session0, session1] = await Promise.all([
      registerAndLogin(server.httpUrl(), "player-0"),
      registerAndLogin(server.httpUrl(), "player-1"),
    ]);
    const seat0 = new WebSocket(server.url(), {
      headers: { Cookie: session0.cookie },
    });
    const seat1 = new WebSocket(server.url(), {
      headers: { Cookie: session1.cookie },
    });
    const seat0Inbox = new MessageInbox(seat0);
    const seat1Inbox = new MessageInbox(seat1);

    try {
      await Promise.all([once(seat0, "open"), once(seat1, "open")]);

      seat0.send(
        JSON.stringify({ type: "join", tableId: "table-1", seat: 0 }),
      );
      seat1.send(
        JSON.stringify({ type: "join", tableId: "table-1", seat: 1 }),
      );
      const [initial0, initial1] = await Promise.all([
        seat0Inbox.next(),
        seat1Inbox.next(),
      ]);
      expect(initial0).toMatchObject({ type: "snapshot", version: 0 });
      expect(initial1).toMatchObject({ type: "snapshot", version: 0 });

      const outOfTurn: PlayCardCommand = {
        tableId: "table-1",
        seat: 1,
        actionId: "wrong-turn",
        expectedVersion: 0,
        type: "playCard",
        payload: { card: cards.seat1 },
      };
      seat1.send(JSON.stringify(outOfTurn));
      const rejection = await seat1Inbox.next();

      expect(rejection).toMatchObject({
        type: "rejected",
        actionId: "wrong-turn",
        version: 0,
        reason: "notYourTurn",
      });
      expect(server.getTable("table-1")?.version).toBe(0);
      expect(seat0Inbox.pending).toBe(0);

      const legal: PlayCardCommand = {
        tableId: "table-1",
        seat: 0,
        actionId: "legal-lead",
        expectedVersion: 0,
        type: "playCard",
        payload: { card: cards.seat0 },
      };
      seat0.send(JSON.stringify(legal));
      const [updated0, updated1] = await Promise.all([
        seat0Inbox.next(),
        seat1Inbox.next(),
      ]);

      expect(updated0).toMatchObject({ type: "snapshot", version: 1 });
      expect(updated1).toMatchObject({ type: "snapshot", version: 1 });
      expect(
        updated0.type === "snapshot" ? updated0.state.hand : null,
      ).toEqual([]);
      expect(
        updated1.type === "snapshot" ? updated1.state.hand : null,
      ).toEqual([cards.seat1]);
      expect(server.getTable("table-1")?.version).toBe(1);

      seat0.send(JSON.stringify(legal));
      const repeated = await seat0Inbox.next();
      expect(repeated).toMatchObject({
        type: "snapshot",
        version: 1,
        repeatedAction: true,
      });
      expect(server.getTable("table-1")?.version).toBe(1);
      expect(server.commandCount()).toBe(2);
      expect(seat1Inbox.pending).toBe(0);
    } finally {
      seat0.terminate();
      seat1.terminate();
      await server.close();
    }
  });

  test("binds authenticated users to three seats across sessions", async () => {
    const server = createGameServer();
    server.addTable(
      "table-auth",
      createTrickPlay(
        [[cards.seat0], [cards.seat1], [cards.seat2]],
        0,
        "noTrump",
      ),
    );
    await server.listen();

    const alice = await registerAndLogin(server.httpUrl(), "alice");
    const bob = await registerAndLogin(server.httpUrl(), "bob");
    const charlie = await registerAndLogin(server.httpUrl(), "charlie");
    const dana = await registerAndLogin(server.httpUrl(), "dana");
    const aliceAgain = await login(server.httpUrl(), "alice");
    const aliceThird = await login(server.httpUrl(), "alice");
    const clients: WebSocket[] = [];

    try {
      const aliceFirstClient = await connect(
        server.url(),
        alice.cookie,
      );
      clients.push(aliceFirstClient.socket);
      aliceFirstClient.socket.send(
        JSON.stringify({
          type: "join",
          tableId: "table-auth",
          seat: 0,
        }),
      );
      expect(await aliceFirstClient.inbox.next()).toMatchObject({
        type: "snapshot",
        state: { hand: [cards.seat0] },
      });

      for (const [session, requestedSeat] of [
        [aliceAgain, 1],
        [aliceThird, 2],
      ] as const) {
        const repeatedClient = await connect(
          server.url(),
          session.cookie,
        );
        clients.push(repeatedClient.socket);
        repeatedClient.socket.send(
          JSON.stringify({
            type: "join",
            tableId: "table-auth",
            seat: requestedSeat,
          }),
        );
        expect(await repeatedClient.inbox.next()).toMatchObject({
          type: "snapshot",
          state: { hand: [cards.seat0] },
        });
      }
      expect(server.getTablePlayers("table-auth")).toEqual([
        alice.userId,
        null,
        null,
      ]);

      const bobClient = await connect(server.url(), bob.cookie);
      const charlieClient = await connect(server.url(), charlie.cookie);
      clients.push(bobClient.socket, charlieClient.socket);
      bobClient.socket.send(
        JSON.stringify({
          type: "join",
          tableId: "table-auth",
          seat: 1,
        }),
      );
      charlieClient.socket.send(
        JSON.stringify({
          type: "join",
          tableId: "table-auth",
          seat: 2,
        }),
      );
      await Promise.all([
        bobClient.inbox.next(),
        charlieClient.inbox.next(),
      ]);
      expect(server.getTablePlayers("table-auth")).toEqual([
        alice.userId,
        bob.userId,
        charlie.userId,
      ]);

      const foreignCommand: PlayCardCommand = {
        tableId: "table-auth",
        seat: 0,
        actionId: "foreign-seat",
        expectedVersion: 0,
        type: "playCard",
        payload: { card: cards.seat0 },
      };
      bobClient.socket.send(JSON.stringify(foreignCommand));
      expect(await bobClient.inbox.next()).toMatchObject({
        type: "rejected",
        reason: "seatNotOwned",
        version: 0,
        state: { hand: [cards.seat1] },
      });
      expect(server.getTable("table-auth")?.version).toBe(0);

      const danaClient = await connect(server.url(), dana.cookie);
      clients.push(danaClient.socket);
      danaClient.socket.send(
        JSON.stringify({
          type: "join",
          tableId: "table-auth",
          seat: 0,
        }),
      );
      expect(await danaClient.inbox.next()).toMatchObject({
        type: "rejected",
        reason: "seatTaken",
      });
      expect(
        server
          .getTablePlayers("table-auth")
          ?.filter((userId) => userId !== null),
      ).toHaveLength(3);
    } finally {
      for (const client of clients) {
        client.terminate();
      }
      await server.close();
    }
  });

  test("creates an invite table, fills free seats and locks settings after deal", async () => {
    const server = createGameServer();
    await server.listen();
    const host = await registerAndLogin(server.httpUrl(), "table-host");
    const guest1 = await registerAndLogin(server.httpUrl(), "guest-1");
    const guest2 = await registerAndLogin(server.httpUrl(), "guest-2");
    const settings = {
      raspasProgression: "122",
      raspasExit: "677",
      throwTalon: true,
      bulletTarget: 20,
    } as const;

    try {
      const tooSmall = await fetch(`${server.httpUrl()}/tables`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: host.cookie,
        },
        body: JSON.stringify({ ...settings, bulletTarget: 2 }),
      });
      expect(tooSmall.status).toBe(400);
      const tooBig = await fetch(`${server.httpUrl()}/tables`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: host.cookie,
        },
        body: JSON.stringify({ ...settings, bulletTarget: 10001 }),
      });
      expect(tooBig.status).toBe(400);

      const creation = await fetch(`${server.httpUrl()}/tables`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: host.cookie,
        },
        body: JSON.stringify(settings),
      });
      expect(creation.status).toBe(201);
      const created = (await creation.json()) as {
        tableId: string;
        invitePath: string;
        seat: number;
        settings: typeof settings;
      };
      expect(created).toMatchObject({
        seat: 0,
        settings,
        invitePath: `/table/${created.tableId}`,
      });

      const beforeJoin = await fetch(
        `${server.httpUrl()}/tables/${created.tableId}`,
        { headers: { Cookie: guest1.cookie } },
      );
      expect(await beforeJoin.json()).toMatchObject({ settings });

      for (const [guest, expectedSeat] of [
        [guest1, 1],
        [guest2, 2],
      ] as const) {
        const joined = await fetch(
          `${server.httpUrl()}/tables/${created.tableId}/join`,
          {
            method: "POST",
            headers: { Cookie: guest.cookie },
          },
        );
        expect(joined.status).toBe(200);
        expect(await joined.json()).toMatchObject({
          seat: expectedSeat,
          seats: [true, true, expectedSeat === 2],
          names: [
            "table-host",
            "guest-1",
            expectedSeat === 2 ? "guest-2" : null,
          ],
          settings,
        });
      }

      const guestWatch = await connect(server.url(), guest1.cookie);
      guestWatch.socket.send(
        JSON.stringify({ type: "watch", tableId: created.tableId }),
      );
      const watched = await guestWatch.inbox.next();
      expect(watched).toMatchObject({
        type: "table",
        settings,
        seat: 1,
        isHost: false,
      });

      const changedSettings = { ...settings, bulletTarget: 30 };
      const changed = await fetch(
        `${server.httpUrl()}/tables/${created.tableId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: host.cookie,
          },
          body: JSON.stringify(changedSettings),
        },
      );
      expect(changed.status).toBe(200);
      expect(await changed.json()).toMatchObject({
        settings: changedSettings,
      });
      expect(await guestWatch.inbox.next()).toMatchObject({
        type: "table",
        settings: changedSettings,
        seat: 1,
      });
      guestWatch.socket.close();

      const earlyDeal = await fetch(
        `${server.httpUrl()}/tables/${created.tableId}/deal`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: host.cookie,
          },
          body: JSON.stringify({ seed: 42 }),
        },
      );
      expect(earlyDeal.status).toBe(409);
      expect(await earlyDeal.json()).toEqual({
        error: "confirmationsNeeded",
      });

      const hostConfirm = await fetch(
        `${server.httpUrl()}/tables/${created.tableId}/confirm`,
        { method: "POST", headers: { Cookie: host.cookie } },
      );
      expect(hostConfirm.status).toBe(403);

      const firstConfirm = await fetch(
        `${server.httpUrl()}/tables/${created.tableId}/confirm`,
        { method: "POST", headers: { Cookie: guest1.cookie } },
      );
      expect(firstConfirm.status).toBe(200);
      expect(await firstConfirm.json()).toMatchObject({
        confirmed: [false, true, false],
      });

      const stillEarly = await fetch(
        `${server.httpUrl()}/tables/${created.tableId}/deal`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: host.cookie,
          },
          body: JSON.stringify({ seed: 42 }),
        },
      );
      expect(stillEarly.status).toBe(409);

      const secondConfirm = await fetch(
        `${server.httpUrl()}/tables/${created.tableId}/confirm`,
        { method: "POST", headers: { Cookie: guest2.cookie } },
      );
      expect(secondConfirm.status).toBe(200);
      expect(await secondConfirm.json()).toMatchObject({
        confirmed: [false, true, true],
      });

      const reset = await fetch(
        `${server.httpUrl()}/tables/${created.tableId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: host.cookie,
          },
          body: JSON.stringify(changedSettings),
        },
      );
      expect(reset.status).toBe(200);
      expect(await reset.json()).toMatchObject({
        confirmed: [false, false, false],
      });
      await fetch(`${server.httpUrl()}/tables/${created.tableId}/confirm`, {
        method: "POST",
        headers: { Cookie: guest1.cookie },
      });
      await fetch(`${server.httpUrl()}/tables/${created.tableId}/confirm`, {
        method: "POST",
        headers: { Cookie: guest2.cookie },
      });

      const firstDeal = await fetch(
        `${server.httpUrl()}/tables/${created.tableId}/deal`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: host.cookie,
          },
          body: JSON.stringify({ seed: 42 }),
        },
      );
      expect(firstDeal.status).toBe(200);
      expect(await firstDeal.json()).toMatchObject({ dealt: true });

      const lockedChange = await fetch(
        `${server.httpUrl()}/tables/${created.tableId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Cookie: host.cookie,
          },
          body: JSON.stringify(settings),
        },
      );
      expect(lockedChange.status).toBe(409);
      expect(await lockedChange.json()).toEqual({
        error: "settingsLocked",
      });
    } finally {
      await server.close();
    }
  });

  test("three sessions finish a short game and reconnect to the same visible lead", async () => {
    const setup = findWinningSetup();
    const initialScore = {
      ...createBulletScore(),
      bullet: [0, 2, 2] as const,
    };
    const server = createGameServer();
    server.addTable(
      "short-game",
      createGame(
        shortGameSettings,
        setup.seed,
        initialScore,
        2,
      ),
    );
    await server.listen();
    const sessions = await Promise.all([
      registerAndLogin(server.httpUrl(), "short-0"),
      registerAndLogin(server.httpUrl(), "short-1"),
      registerAndLogin(server.httpUrl(), "short-2"),
    ]);
    const clients: Array<{
      socket: WebSocket;
      inbox: MessageInbox;
      snapshot: SnapshotMessage & { state: GameSeatView };
    }> = [];
    let actionNumber = 0;

    try {
      for (const [seat, session] of sessions.entries()) {
        const client = await connect(server.url(), session.cookie);
        client.socket.send(
          JSON.stringify({
            type: "join",
            tableId: "short-game",
            seat,
          }),
        );
        clients.push({
          ...client,
          snapshot: asGameSnapshot(await client.inbox.next()),
        });
      }

      async function sendAction(
        seat: 0 | 1 | 2,
        action: GameAction,
      ): Promise<void> {
        const command: GameActionCommand = {
          tableId: "short-game",
          seat,
          actionId: `game-${actionNumber++}`,
          expectedVersion: clients[seat].snapshot.version,
          type: "gameAction",
          payload: { action },
        };
        clients[seat].socket.send(JSON.stringify(command));
        const snapshots = await Promise.all(
          clients.map((client) => client.inbox.next()),
        );
        snapshots.forEach((snapshot, index) => {
          clients[index].snapshot = asGameSnapshot(snapshot);
        });
      }

      await sendAction(0, {
        type: "auction",
        action: {
          type: "bid",
          bid: {
            type: "contract",
            level: 6,
            trump: setup.trump,
          },
        },
      });
      await sendAction(1, {
        type: "auction",
        action: { type: "pass" },
      });
      await sendAction(2, {
        type: "auction",
        action: { type: "pass" },
      });
      await sendAction(0, setup.discard);
      await sendAction(0, {
        type: "order",
        bid: { type: "contract", level: 6, trump: setup.trump },
      });
      await sendAction(1, {
        type: "defense",
        action: { type: "whist" },
      });
      await sendAction(2, {
        type: "defense",
        action: { type: "whist" },
      });

      const firstPlay =
        clients[0].snapshot.state.allowedActions[0];
      await sendAction(0, firstPlay);
      const beforeReconnect = clients[1].snapshot;
      expect(beforeReconnect.state.currentTrick[0]).toEqual(
        clients[0].snapshot.state.currentTrick[0],
      );
      expect(beforeReconnect.state.currentTrick[0]?.card).not.toEqual({
        faceDown: true,
      });
      expect(beforeReconnect.state.raspasIndex).toBe(2);

      clients[1].socket.terminate();
      const reconnected = await connect(
        server.url(),
        sessions[1].cookie,
      );
      reconnected.socket.send(
        JSON.stringify({
          type: "join",
          tableId: "short-game",
          seat: 1,
        }),
      );
      const reconnectSnapshot = asGameSnapshot(
        await reconnected.inbox.next(),
      );
      expect(reconnectSnapshot.version).toBe(beforeReconnect.version);
      expect(reconnectSnapshot.state.raspasIndex).toBe(2);
      expect(reconnectSnapshot.state.currentTrick[0]).toEqual(
        beforeReconnect.state.currentTrick[0],
      );
      clients[1] = {
        ...reconnected,
        snapshot: reconnectSnapshot,
      };

      while (clients[0].snapshot.state.phase === "play") {
        const seat = clients.findIndex(
          (client) =>
            client.snapshot.state.allowedActions.length > 0,
        ) as 0 | 1 | 2;
        await sendAction(
          seat,
          clients[seat].snapshot.state.allowedActions[0],
        );
      }

      for (const client of clients) {
        expect(client.snapshot.state.phase).toBe("finished");
        expect(client.snapshot.state.score.bullet).toEqual([2, 2, 2]);
        expect(client.snapshot.state.raspasIndex).toBe(0);
        expect(client.snapshot.state.allowedActions).toEqual([]);
      }
      expect(new Set(clients.map(({ snapshot }) => snapshot.version))).toEqual(
        new Set([clients[0].snapshot.version]),
      );
    } finally {
      for (const client of clients) {
        client.socket.terminate();
      }
      await server.close();
    }
  });

  test("half-whist is accepted only from the second defender and keeps the version on a refusal", async () => {
    const server = createGameServer();
    server.addTable("half-six", defenseTable(6));
    server.addTable("half-eight", defenseTable(8));
    await server.listen();
    const sessions = await Promise.all([
      registerAndLogin(server.httpUrl(), "half-0"),
      registerAndLogin(server.httpUrl(), "half-1"),
      registerAndLogin(server.httpUrl(), "half-2"),
    ]);
    const clients: Array<{
      socket: WebSocket;
      inbox: MessageInbox;
      snapshot: SnapshotMessage & { state: GameSeatView };
    }> = [];
    let actionNumber = 0;

    try {
      for (const [seat, session] of sessions.entries()) {
        const client = await connect(server.url(), session.cookie);
        client.socket.send(
          JSON.stringify({
            type: "join",
            tableId: "half-six",
            seat,
          }),
        );
        clients.push({
          ...client,
          snapshot: asGameSnapshot(await client.inbox.next()),
        });
      }

      const halfWhist: GameAction = {
        type: "defense",
        action: { type: "halfWhist" },
      };

      async function reject(
        tableId: string,
        seat: 0 | 1 | 2,
        action: GameAction,
      ): Promise<void> {
        const version = server.getTable(tableId)?.version;
        const command: GameActionCommand = {
          tableId,
          seat,
          actionId: `half-reject-${actionNumber++}`,
          expectedVersion: version ?? -1,
          type: "gameAction",
          payload: { action },
        };
        clients[seat].socket.send(JSON.stringify(command));
        const message = await clients[seat].inbox.next();
        expect(message).toMatchObject({
          type: "rejected",
          version,
        });
        expect(server.getTable(tableId)?.version).toBe(version);
        for (const [index, client] of clients.entries()) {
          if (index !== seat) {
            expect(client.inbox.pending).toBe(0);
          }
        }
      }

      async function send(
        tableId: string,
        seat: 0 | 1 | 2,
        action: GameAction,
      ): Promise<void> {
        const command: GameActionCommand = {
          tableId,
          seat,
          actionId: `half-${actionNumber++}`,
          expectedVersion: clients[seat].snapshot.version,
          type: "gameAction",
          payload: { action },
        };
        clients[seat].socket.send(JSON.stringify(command));
        const snapshots = await Promise.all(
          clients.map((client) => client.inbox.next()),
        );
        snapshots.forEach((snapshot, index) => {
          clients[index].snapshot = asGameSnapshot(snapshot);
        });
      }

      await reject("half-six", 2, halfWhist);
      await reject("half-six", 1, halfWhist);
      await reject("half-six", 0, halfWhist);

      for (const [seat] of sessions.entries()) {
        clients[seat].socket.send(
          JSON.stringify({
            type: "join",
            tableId: "half-eight",
            seat,
          }),
        );
        clients[seat].snapshot = asGameSnapshot(
          await clients[seat].inbox.next(),
        );
      }
      await reject("half-eight", 2, halfWhist);
      await send("half-eight", 1, {
        type: "defense",
        action: { type: "pass" },
      });
      await reject("half-eight", 2, halfWhist);
      expect(
        clients[2].snapshot.state.allowedActions.some(
          (action) => action.action?.type === "halfWhist",
        ),
      ).toBe(false);

      for (const [seat] of sessions.entries()) {
        clients[seat].socket.send(
          JSON.stringify({
            type: "join",
            tableId: "half-six",
            seat,
          }),
        );
        clients[seat].snapshot = asGameSnapshot(
          await clients[seat].inbox.next(),
        );
      }
      await send("half-six", 1, {
        type: "defense",
        action: { type: "pass" },
      });
      await send("half-six", 2, halfWhist);
      await send("half-six", 1, {
        type: "defense",
        action: { type: "pass" },
      });
      expect(clients[0].snapshot.state.score.bullet).toEqual([2, 0, 0]);
      expect(clients[0].snapshot.state.score.whists[2][0]).toBe(4);
      expect(clients[0].snapshot.state.score.mountain).toEqual([0, 0, 0]);
      expect(clients[0].snapshot.state.deals?.[0]?.contract).toBe("6 пик");
      expect(clients[0].snapshot.state.raspasIndex).toBe(0);
      expect(server.getTable("half-six")?.version).toBe(3);
    } finally {
      for (const client of clients) {
        client.socket.terminate();
      }
      await server.close();
    }
  });

  test("a returned whist plays as one whistler and drops the half-whist", async () => {
    const server = createGameServer();
    server.addTable("half-return", defenseTable(6));
    await server.listen();
    const sessions = await Promise.all([
      registerAndLogin(server.httpUrl(), "return-0"),
      registerAndLogin(server.httpUrl(), "return-1"),
      registerAndLogin(server.httpUrl(), "return-2"),
    ]);
    const clients: Array<{
      socket: WebSocket;
      inbox: MessageInbox;
      snapshot: SnapshotMessage & { state: GameSeatView };
    }> = [];
    let actionNumber = 0;

    try {
      for (const [seat, session] of sessions.entries()) {
        const client = await connect(server.url(), session.cookie);
        client.socket.send(
          JSON.stringify({
            type: "join",
            tableId: "half-return",
            seat,
          }),
        );
        clients.push({
          ...client,
          snapshot: asGameSnapshot(await client.inbox.next()),
        });
      }

      async function send(seat: 0 | 1 | 2, action: GameAction): Promise<void> {
        const command: GameActionCommand = {
          tableId: "half-return",
          seat,
          actionId: `return-${actionNumber++}`,
          expectedVersion: clients[seat].snapshot.version,
          type: "gameAction",
          payload: { action },
        };
        clients[seat].socket.send(JSON.stringify(command));
        const snapshots = await Promise.all(
          clients.map((client) => client.inbox.next()),
        );
        snapshots.forEach((snapshot, index) => {
          clients[index].snapshot = asGameSnapshot(snapshot);
        });
      }

      await send(1, { type: "defense", action: { type: "pass" } });
      await send(2, { type: "defense", action: { type: "halfWhist" } });
      await send(1, { type: "defense", action: { type: "whist" } });
      expect(clients[2].snapshot.state.allowedActions).toEqual([]);
      expect(clients[1].snapshot.state.phase).toBe("play");

      await send(0, {
        type: "playCard",
        card: { suit: "spades", rank: 14 },
      });
      expect(clients[1].snapshot.state.allowedActions).toEqual([
        { type: "defense", action: { type: "light" } },
        { type: "defense", action: { type: "dark" } },
      ]);
      await send(1, { type: "defense", action: { type: "light" } });
      expect(clients[1].snapshot.state.shownHands?.[2]).toEqual([
        { suit: "spades", rank: 13 },
        { suit: "clubs", rank: 10 },
      ]);
      expect(clients[0].snapshot.state.deals ?? []).toEqual([]);
      await send(1, {
        type: "playCard",
        card: { suit: "hearts", rank: 7 },
      });
      expect(clients[0].snapshot.state.currentTrick[1]).toEqual({
        seat: 1,
        card: { suit: "hearts", rank: 7 },
      });
      expect(server.getTable("half-return")?.version).toBe(6);
    } finally {
      for (const client of clients) {
        client.socket.terminate();
      }
      await server.close();
    }
  });

  test("serves the client build and the table page from the same port", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pref-static-"));
    await writeFile(
      path.join(root, "index.html"),
      "<!doctype html><title>pref</title>",
    );
    await mkdir(path.join(root, "assets"));
    await writeFile(path.join(root, "assets", "app.js"), "console.log(1)");
    const server = createGameServer({ staticDir: root });
    await server.listen();
    try {
      const page = await fetch(`${server.httpUrl()}/`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("<title>pref</title>");

      const table = await fetch(`${server.httpUrl()}/table/abc`);
      expect(table.status).toBe(200);
      expect(await table.text()).toContain("<title>pref</title>");

      const asset = await fetch(`${server.httpUrl()}/assets/app.js`);
      expect(asset.headers.get("content-type")).toContain("javascript");
      expect(await asset.text()).toBe("console.log(1)");

      const missing = await fetch(`${server.httpUrl()}/assets/missing.js`);
      expect(missing.status).toBe(404);
    } finally {
      await server.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

function defenseTable(level: 6 | 8): GameState {
  const card = (
    suit: Card["suit"],
    rank: Card["rank"],
  ): Card => ({ suit, rank });
  let state = apply(
    {
      settings: {
        raspasProgression: "123",
        raspasExit: "666",
        throwTalon: false,
        bulletTarget: 10,
      },
      phase: "auction",
      seed: 1,
      dealNumber: 0,
      raspasIndex: 1,
      score: createBulletScore(),
      dealtCards: {
        hands: [
          [card("spades", 14), card("clubs", 9)],
          [card("hearts", 7), card("diamonds", 9)],
          [card("spades", 13), card("clubs", 10)],
        ],
        talon: [card("clubs", 8), card("clubs", 7)],
      },
      auction: createAuction(0),
      auctionResult: null,
      talon: null,
      defense: null,
      play: null,
    },
    0,
    {
      type: "auction",
      action: {
        type: "bid",
        bid: { type: "contract", level, trump: "spades" },
      },
    },
  );
  state = apply(state!, 1, {
    type: "auction",
    action: { type: "pass" },
  });
  state = apply(state!, 2, {
    type: "auction",
    action: { type: "pass" },
  });
  const discard = gameView(state!, 0).allowedActions.find(
    (action) =>
      action.type === "discard" &&
      action.cards?.[0]?.suit === "clubs" &&
      action.cards[0].rank === 8 &&
      action.cards[1]?.suit === "clubs" &&
      action.cards[1].rank === 7,
  );
  state = apply(state!, 0, discard!);
  return apply(state!, 0, {
    type: "order",
    bid: { type: "contract", level, trump: "spades" },
  })!;
}
