import { describe, expect, test } from "vitest";
import { applyGameAction, createGame, gameView } from "./game.js";
import type { GameAction, GameState } from "./game-types.js";
import type { Seat } from "./auction.js";

const settings = {
  raspasProgression: "111",
  raspasExit: "666",
  throwTalon: false,
  bulletTarget: 100,
} as const;
function act(state: GameState, seat: Seat, action: GameAction): GameState {
  const result = applyGameAction(state, seat, action);
  expect(result.accepted).toBe(true);
  return result.state;
}
function begin(misere: boolean): GameState {
  let state = createGame(settings, 1);
  state = act(state, 0, {
    type: "auction",
    action: {
      type: "bid",
      bid: misere ? { type: "misere" } : { type: "contract", level: 6, trump: "clubs" },
    },
  });
  for (const seat of [1, 2] as const)
    state = act(state, seat, { type: "auction", action: { type: "pass" } });
  state = act(
    state,
    0,
    gameView(state, 0).allowedActions.find((action) => action.type === "discard")!,
  );
  if (misere) {
    for (let i = 0; i < 2; i++)
      state = act(state, 0, { type: "order", bid: { type: "misere" } });
  } else {
    state = act(state, 0, {
      type: "order",
      bid: { type: "contract", level: 6, trump: "clubs" },
    });
    state = act(state, 1, { type: "defense", action: { type: "whist" } });
    state = act(state, 2, { type: "defense", action: { type: "pass" } });
  }
  return state;
}
function advance(state: GameState): GameState {
  const seat = gameView(state, 0).turn!;
  const actions = gameView(state, seat).allowedActions;
  return act(
    state,
    seat,
    actions.find((action) => action.type === "playCard") ??
      actions.find(
        (action) => action.type === "defense" && action.action.type === "light",
      )!,
  );
}
function afterTaken(misere: boolean): GameState {
  let state = begin(misere);
  for (let i = 0; i < 35; i++) {
    const won = state.play!.tricksWon;
    if (
      (misere ? won[0] > 0 : won[1] + won[2] > 0) &&
      state.play!.currentTrick.length === 0
    )
      return state;
    state = advance(state);
  }
  throw new Error("The fixture did not reach a taken trick");
}
function recorded(state: GameState, tricks: number): GameState {
  state = act(state, 0, { type: "propose", tricks });
  state = act(state, 1, { type: "proposal", answer: "agree" });
  return act(state, 2, { type: "proposal", answer: "agree" });
}

test("a taken trick on мизер cannot become a win through a zero offer", () => {
  const state = afterTaken(true);
  expect(state.play!.tricksWon).toEqual([1, 0, 4]);
  for (const seat of [0, 1, 2] as const) {
    expect(gameView(state, seat).allowedActions).not.toContainEqual({
      type: "propose",
      tricks: 0,
    });
    const rejected = applyGameAction(state, seat, { type: "propose", tricks: 0 });
    expect(rejected).toMatchObject({ accepted: false, reason: "invalidProposal" });
    expect(rejected.state).toBe(state);
  }
  const ended = recorded(state, 1);
  expect(ended.deals!.at(-1)!.tricks).toEqual([1, 5, 4]);
  expect(ended.score.bullet[0]).toBe(0);
  expect(ended.score.mountain[0]).toBe(10);
});

test("a defender's taken trick cannot be erased by a ten-trick offer", () => {
  const state = afterTaken(false);
  expect(state.play!.tricksWon).toEqual([0, 0, 1]);
  for (const seat of [0, 1] as const) {
    expect(gameView(state, seat).allowedActions).not.toContainEqual({
      type: "propose",
      tricks: 10,
    });
    expect(applyGameAction(state, seat, { type: "propose", tricks: 10 })).toMatchObject(
      { accepted: false, reason: "invalidProposal" },
    );
  }
  const ended = recorded(state, 9);
  expect(ended.deals!.at(-1)!.tricks).toEqual([9, 0, 1]);
  expect(ended.score.bullet[0]).toBe(2);
  expect(ended.score.mountain[1]).toBe(6);
  expect(ended.score.whists[1][0]).toBe(2);
});

describe.each([false, true])("offer bounds (мизер=%s)", (misere) => {
  test.each(["floor", "ceiling"] as const)(
    "accepts the %s and preserves every already taken trick",
    (bound) => {
      const state = afterTaken(misere);
      const before = state.play!.tricksWon;
      const floor = before[0];
      const ceiling = 10 - before[1] - before[2];
      const offers = gameView(state, 0)
        .allowedActions.filter((action) => action.type === "propose")
        .map((action) => action.tricks);
      expect(offers).toEqual(
        Array.from({ length: ceiling - floor + 1 }, (_, i) => floor + i),
      );
      const ended = recorded(state, bound === "floor" ? floor : ceiling);
      const result = ended.deals!.at(-1)!.tricks;
      expect(result.reduce((sum, value) => sum + value, 0)).toBe(10);
      for (const seat of [0, 1, 2] as const)
        expect(result[seat]).toBeGreaterThanOrEqual(before[seat]);
      expect(ended.lastLayout!.tricks).toEqual(result);
    },
  );

  test.each([1, 2])("counts a partial trick of %i cards as unresolved", (count) => {
    let state = afterTaken(misere);
    for (let i = 0; i < count; i++) state = advance(state);
    expect(state.play!.currentTrick).toHaveLength(count);
    const before = state.play!.tricksWon;
    const ceiling = 10 - before[1] - before[2];
    const offers = gameView(state, 0).allowedActions;
    expect(offers).toContainEqual({ type: "propose", tricks: ceiling });
    expect(offers).toContainEqual({ type: "propose", tricks: before[0] });
    const ended = recorded(state, ceiling);
    expect(ended.deals!.at(-1)!.tricks[0]).toBe(ceiling);
    expect(ended.deals!.at(-1)!.tricks[2]).toBeGreaterThanOrEqual(before[2]);
  });
});

test("an invalid saved offer can be cancelled or declined but cannot be agreed after restart", () => {
  const state: GameState = {
    ...afterTaken(true),
    proposal: { proposer: 0, tricks: 0, answers: [null, "agree", null] },
  };
  expect(
    applyGameAction(state, 2, { type: "proposal", answer: "agree" }),
  ).toMatchObject({ accepted: false, reason: "invalidProposal" });
  expect(applyGameAction(state, 0, { type: "cancelProposal" }).accepted).toBe(true);
  expect(
    applyGameAction(state, 2, { type: "proposal", answer: "decline" }).accepted,
  ).toBe(true);
});
