import {
  applyGameAction,
  createGame,
  gameView,
  type GameAction,
  type GameState,
  type Seat,
} from "@pref/engine";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { GameSnapshotPanel, nextClientState } from "./GameTable.js";
import { actingSeat, type TestTable } from "./LocalTestTable.js";
import type { GameSnapshot, SnapshotEnvelope } from "./table-types.js";

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
function begin(misere = true): GameState {
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
function snapshot(state: GameState, viewer: Seat): SnapshotEnvelope {
  return {
    type: "snapshot",
    tableId: "test",
    version: state.speech?.length ?? 0,
    state: JSON.parse(JSON.stringify(gameView(state, viewer))) as GameSnapshot,
  };
}
function render(message: SnapshotEnvelope, viewer: Seat) {
  return renderToStaticMarkup(
    <GameSnapshotPanel
      snapshot={message}
      settings={settings}
      seat={viewer}
      onAction={() => undefined}
    />,
  );
}
function noCardTurn(markup: string) {
  expect(markup).not.toContain("Ваш ход");
  expect(markup).not.toContain('class="opponent-turn"');
  expect(markup).not.toContain("seat-corner-turn");
}

test.each([0, 1, 2] as const)(
  "seat %i gets its real pending-proposal status and keeps it after reconnect",
  (viewer) => {
    const original = begin();
    const offered = act(original, 0, { type: "propose", tricks: 0 });
    const message = snapshot(offered, viewer);
    expect(message.state.turn).toBeNull();
    expect(
      message.state.allowedActions.some((action) => action.type === "playCard"),
    ).toBe(false);
    expect(message.state.proposal).toEqual({
      proposer: 0,
      tricks: 0,
      answers: [null, null, null],
    });
    const updated = nextClientState(
      message,
      snapshot(original, viewer),
      "test",
    ).snapshot!;
    const reconnected = nextClientState(message, null, "test").snapshot!;
    const markup = render(updated, viewer);
    expect(render(reconnected, viewer)).toBe(markup);
    noCardTurn(markup);
    expect(markup).toContain(
      `class="proposal-status" role="status">${viewer === 0 ? "Ждём ответов" : "Ваш ответ"}`,
    );
    expect(markup).toContain(viewer === 0 ? "Отменить предложение" : "Согласен");
  },
);

test.each([0, 1, 2] as const)(
  "seat %i sees the correct status after one answer",
  (viewer) => {
    let state = act(begin(), 0, { type: "propose", tricks: 0 });
    state = act(state, 1, { type: "proposal", answer: "agree" });
    const message = snapshot(state, viewer);
    expect(message.state.turn).toBeNull();
    expect(message.state.proposal?.answers).toEqual([null, "agree", null]);
    const markup = render(nextClientState(message, null, "test").snapshot!, viewer);
    noCardTurn(markup);
    const status = ["Ждём ответов", "Ответ принят", "Ваш ответ"][viewer];
    expect(markup).toContain(`class="proposal-status" role="status">${status}`);
    if (viewer === 1) expect(message.state.allowedActions).toEqual([]);
  },
);

test.each(["cancel", "decline"] as const)(
  "%s restores the underlying card turn for every viewer",
  (answer) => {
    const original = begin();
    let state = act(original, 0, { type: "propose", tricks: 0 });
    state =
      answer === "cancel"
        ? act(state, 0, { type: "cancelProposal" })
        : act(state, 2, { type: "proposal", answer: "decline" });
    for (const viewer of [0, 1, 2] as const) {
      const message = snapshot(state, viewer);
      expect(message.state.turn).toBe(gameView(original, viewer).turn);
      expect(message.state.proposal).toBeNull();
      const markup = render(message, viewer);
      expect(markup).not.toContain('class="proposal-status"');
      expect(markup).toContain(viewer === 0 ? "Ваш ход" : 'class="opponent-turn"');
    }
  },
);

test("acceptance removes proposal state for every viewer before the next deal", () => {
  let state = act(begin(), 0, { type: "propose", tricks: 0 });
  for (const seat of [1, 2] as const)
    state = act(state, seat, { type: "proposal", answer: "agree" });
  expect(state.dealNumber).toBe(1);
  for (const viewer of [0, 1, 2] as const) {
    const message = snapshot(state, viewer);
    expect(message.state.proposal).toBeNull();
    expect(render(message, viewer)).not.toContain('class="proposal-status"');
  }
});

test("local test auto-switch chooses responders, never the author's cancel action", () => {
  function table(state: GameState): TestTable {
    return {
      tableId: "test",
      settings,
      snapshots: [snapshot(state, 0), snapshot(state, 1), snapshot(state, 2)],
    };
  }
  let state = act(begin(), 0, { type: "propose", tricks: 0 });
  expect(actingSeat(table(state))).toBe(1);
  state = act(state, 1, { type: "proposal", answer: "agree" });
  expect(actingSeat(table(state))).toBe(2);
  state = act(state, 0, { type: "cancelProposal" });
  expect(actingSeat(table(state))).toBe(0);
});

test("a contract offer also suspends every card-turn indicator", () => {
  const state = act(begin(false), 0, { type: "propose", tricks: 6 });
  for (const viewer of [0, 1, 2] as const) {
    const message = snapshot(state, viewer);
    expect(message.state.turn).toBeNull();
    noCardTurn(render(message, viewer));
    expect(render(message, viewer)).toContain('class="proposal-status"');
  }
});
