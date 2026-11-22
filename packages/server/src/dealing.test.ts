import { describe, test, expect, vi } from "vitest";
import { createGame, deal, type GameState } from "@pref/engine";
import { createGameServer } from "./index.js";
import { secureDeal } from "./dealing.js";
import { lobby, request, session, socket, settings } from "./test-helpers.js";

describe("server-owned deals", () => {
  test("creates complete independent decks even at the same millisecond", async () => {
    const server = createGameServer();
    await server.listen();
    try {
      const a = await lobby(server, "deck-a");
      const b = await lobby(server, "deck-b");
      const clock = vi.spyOn(Date, "now").mockReturnValue(123456);
      try {
        for (const table of [a, b]) expect((await request(server, `/tables/${table.tableId}/deal`, "POST", table.cookies[0], { seed: 42 })).ok).toBe(true);
      } finally { clock.mockRestore(); }
      const first = (server.getTable(a.tableId)!.state as GameState).dealtCards;
      const second = (server.getTable(b.tableId)!.state as GameState).dealtCards;
      expect(first).not.toEqual(second);
      const cards = [...first.hands.flat(), ...first.talon];
      expect(cards).toHaveLength(32);
      expect(new Set(cards.map(c => `${c.suit}:${c.rank}`)).size).toBe(32);
    } finally { await server.close(); }
  });

  test("HTTP seed is ignored; lobby and snapshots expose only the seat view", async () => {
    const supplied = deal(789);
    const server = createGameServer({ dealSource: () => supplied });
    await server.listen();
    try {
      const table = await lobby(server, "injected");
      const response = await request(server, `/tables/${table.tableId}/deal`, "POST", table.cookies[0], { seed: 42 });
      expect(response.ok).toBe(true);
      const publicTable = await response.json();
      expect(JSON.stringify(publicTable)).not.toMatch(/seed|dealtCards|hands|talon/);
      expect((server.getTable(table.tableId)!.state as GameState).dealtCards).toEqual(supplied);
      for (const seat of [0, 1, 2] as const) {
        const client = await socket(server, table.cookies[seat]);
        client.ws.send(JSON.stringify({ type: "watch", tableId: table.tableId }));
        expect(JSON.stringify(await client.next())).not.toMatch(/seed|dealtCards|hands|talon/);
        client.ws.send(JSON.stringify({ type: "join", tableId: table.tableId, seat }));
        const message = await client.next();
        expect(message.type).toBe("snapshot");
        if (message.type !== "snapshot") throw new Error("Expected snapshot");
        expect(message.state.hand).toEqual(supplied.hands[seat]);
        expect(message.state).not.toHaveProperty("seed");
        expect(message.state).not.toHaveProperty("dealtCards");
        expect(message.state).toMatchObject({ shownHands: [null, null, null], talonCards: [], discarded: [] });
      }
    } finally { await server.close(); }
  });

  test("rejects seeded rematches and uses independent server randomness for a valid rematch", async () => {
    const supplied = secureDeal();
    const server = createGameServer({ dealSource: () => supplied });
    server.addTable("aabb", { ...createGame(settings, 10), phase: "finished" });
    await server.listen();
    try {
      const cookie = await session(server, "rematch");
      const client = await socket(server, cookie);
      client.ws.send(JSON.stringify({ type: "join", tableId: "aabb", seat: 0 }));
      await client.next();
      const command = { type: "gameAction", tableId: "aabb", seat: 0, actionId: "seeded", expectedVersion: 0, payload: { action: { type: "rematch", seed: 42 } } };
      client.ws.send(JSON.stringify(command));
      expect(await client.next()).toMatchObject({ type: "rejected", reason: "invalidCommand" });
      expect(server.getTable("aabb")!.version).toBe(0);
      client.ws.send(JSON.stringify({ ...command, actionId: "clean", payload: { action: { type: "rematch" } } }));
      expect(await client.next()).toMatchObject({ type: "snapshot", version: 1 });
      expect((server.getTable("aabb")!.state as GameState).dealtCards).toEqual(supplied);
    } finally { await server.close(); }
  });
});
