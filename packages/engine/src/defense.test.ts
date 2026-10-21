import { describe, expect, test } from "vitest";

import {
  applyDefenseAction,
  createDefenseState,
  type DefenseAction,
  type DefenseState,
} from "./defense.js";

const sixSpades = {
  type: "contract",
  declarer: 0,
  level: 6,
  trump: "spades",
} as const;

function act(
  state: DefenseState,
  seat: 0 | 1 | 2,
  action: DefenseAction,
): DefenseState {
  const transition = applyDefenseAction(state, seat, action);
  expect(transition.accepted).toBe(true);
  return transition.state;
}

describe("whist declarations", () => {
  test("allows both defenders to pass a six-spade contract", () => {
    let state = createDefenseState(sixSpades);

    const earlyPass = applyDefenseAction(state, 2, { type: "pass" });
    expect(earlyPass.accepted).toBe(false);
    expect(earlyPass.state).toBe(state);
    expect(earlyPass.state.whistlers).toHaveLength(0);
    expect(earlyPass.state.phase).toBe("whist");

    state = act(state, 1, { type: "pass" });

    const outOfTurnWhist = applyDefenseAction(state, 1, {
      type: "whist",
    });
    expect(outOfTurnWhist.accepted).toBe(false);
    expect(outOfTurnWhist.state).toBe(state);
    expect(outOfTurnWhist.state.whistlers).toHaveLength(0);
    expect(outOfTurnWhist.state.phase).toBe("whist");

    state = act(state, 2, { type: "pass" });

    expect(state.decisions[1]).toBe("pass");
    expect(state.decisions[2]).toBe("pass");
    expect(state.whistlers).toHaveLength(0);
    expect(state.defenderObligations).toHaveLength(0);
    expect(state.phase).toBe("play");
  });

  test("records the defender who whists", () => {
    let state = createDefenseState(sixSpades);
    state = act(state, 1, { type: "pass" });
    state = act(state, 2, { type: "whist" });

    expect(state.whistlers).toEqual([2]);
    expect(state.defenderObligations).toEqual([2]);
    expect(state.phase).toBe("style");
    expect(state.turn).toBe(2);
  });

  test("a single whistler chooses light or dark and the declarer does not", () => {
    let state = createDefenseState(sixSpades);
    state = act(state, 1, { type: "pass" });
    state = act(state, 2, { type: "whist" });

    const declarerChoice = applyDefenseAction(state, 0, { type: "dark" });
    expect(declarerChoice.accepted).toBe(false);
    expect(declarerChoice.state).toBe(state);

    state = act(state, 2, { type: "light" });
    expect(state.whistStyle).toBe("light");
    expect(state.phase).toBe("play");
    expect(state.turn).toBeNull();
  });

  test("both whistlers play in the dark without a further choice", () => {
    let state = createDefenseState(sixSpades);
    state = act(state, 1, { type: "whist" });
    state = act(state, 2, { type: "whist" });

    expect(state.whistlers).toEqual([1, 2]);
    expect(state.whistStyle).toBe("dark");
    expect(state.phase).toBe("play");
    expect(state.turn).toBeNull();
  });

  test("lets the second defender offer half-whist on a six after a pass", () => {
    let state = createDefenseState(sixSpades);
    const early = applyDefenseAction(state, 2, { type: "halfWhist" });
    expect(early.accepted).toBe(false);
    expect(early.state).toBe(state);

    const first = applyDefenseAction(state, 1, { type: "halfWhist" });
    expect(first.accepted).toBe(false);
    expect(first.state).toBe(state);

    state = act(state, 1, { type: "pass" });
    state = act(state, 2, { type: "halfWhist" });
    expect(state.halfWhist).toBe(2);
    expect(state.phase).toBe("whist");
    expect(state.turn).toBe(1);
    expect(state.whistlers).toEqual([]);
  });

  test("refuses half-whist on an eight", () => {
    let state = createDefenseState({
      type: "contract",
      declarer: 0,
      level: 8,
      trump: "spades",
    });
    state = act(state, 1, { type: "pass" });
    const half = applyDefenseAction(state, 2, { type: "halfWhist" });
    expect(half.accepted).toBe(false);
    expect(half.reason).toBe("invalidDeclaration");
    expect(half.state).toBe(state);
  });
});
