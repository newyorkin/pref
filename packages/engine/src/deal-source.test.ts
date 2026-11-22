import { test, expect, vi } from "vitest";
import { createGame, applyGameAction, gameView } from "./game.js";
import { deal } from "./deck.js";
import type { Seat } from "./auction.js";

test("requests a new supplied deal only when a deal ends, retaining pure seeded tests", () => {
  const settings = { raspasProgression: "111", raspasExit: "666", throwTalon: false, bulletTarget: 100 } as const;
  const source = vi.fn(() => deal(999));
  let state = createGame(settings, deal(123));
  const actions = [
    [0, { type: "auction", action: { type: "bid", bid: { type: "contract", level: 6, trump: "spades" } } }],
    [1, { type: "auction", action: { type: "pass" } }],
    [2, { type: "auction", action: { type: "pass" } }],
  ] as const;
  for (const [seat, action] of actions) {
    const result = applyGameAction(state, seat, action, source);
    expect(result.accepted).toBe(true); state = result.state;
  }
  expect(source).not.toHaveBeenCalled();
  for (let i = 0; i < 5 && state.dealNumber === 0; i++) {
    const seat = ([0, 1, 2] as Seat[]).find(s => gameView(state, s).allowedActions.length)!;
    const result = applyGameAction(state, seat, gameView(state, seat).allowedActions[0], source);
    expect(result.accepted).toBe(true); state = result.state;
  }
  expect(state.dealNumber).toBe(1);
  expect(source).toHaveBeenCalledTimes(1);
  expect(state.dealtCards).toEqual(deal(999));
});
