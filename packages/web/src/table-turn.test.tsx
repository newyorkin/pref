import {
  applyGameAction,
  createGame,
  deal,
  gameView,
  type GameState,
  type Seat,
} from "@pref/engine";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { GameSnapshotPanel, nextClientState } from "./GameTable.js";
import { shownBubble } from "./table-utils.js";
import type { GameSnapshot, SnapshotEnvelope } from "./table-types.js";

const settings = {
  raspasProgression: "111",
  raspasExit: "666",
  throwTalon: false,
  bulletTarget: 10,
} as const;
const names = ["Анна", "Борис", "Вера"];

function render(state: GameSnapshot, viewer: Seat) {
  return renderToStaticMarkup(
    <GameSnapshotPanel
      snapshot={{ type: "snapshot", tableId: "test", version: 1, state }}
      settings={settings}
      seat={viewer}
      playerNames={names}
      onAction={() => undefined}
    />,
  );
}
function view(state: GameState, viewer: Seat): GameSnapshot {
  return JSON.parse(JSON.stringify(gameView(state, viewer))) as GameSnapshot;
}
function passedGame() {
  let state = createGame(settings, deal(42));
  for (const seat of [0, 1, 2] as const) {
    const result = applyGameAction(state, seat, {
      type: "auction",
      action: { type: "pass" },
    });
    expect(result.accepted).toBe(true);
    state = result.state;
  }
  return state;
}
function openedGame() {
  const result = applyGameAction(passedGame(), 0, { type: "openTalon", index: 0 });
  expect(result.accepted).toBe(true);
  return result.state;
}

test.each([0, 1, 2] as const)(
  "seat %i sees one correct turn throughout two raspas tricks and after reconnect",
  (viewer) => {
    let state = openedGame();
    let current: SnapshotEnvelope | null = null;
    for (let move = 0; move <= 6; move++) {
      const personal = view(state, viewer);
      const message = {
        type: "snapshot",
        tableId: "test",
        version: move,
        state: personal,
      };
      const updated: SnapshotEnvelope = nextClientState(
        message,
        current,
        "test",
      ).snapshot!;
      const reconnected = nextClientState(message, null, "test").snapshot!;
      const markup = render(updated.state, viewer);
      expect(render(reconnected.state, viewer)).toBe(markup);
      current = updated;
      expect(markup.match(/class="(?:turn-indicator|opponent-turn)"/g)).toHaveLength(1);
      if (personal.turn === viewer) {
        expect(markup).toContain('class="turn-indicator" role="status">Ваш ход');
      } else {
        expect(markup).not.toContain("Ваш ход");
        const owner = markup.match(
          /class="opponent-name">([^<]*)<span class="opponent-turn"/,
        );
        expect(owner?.[1]).toContain(names[personal.turn!]);
      }
      expect(markup).not.toContain('class="speech-bubble">пас');
      expect(markup).toContain("пас"); // The historical log is retained.
      if (move < 6) {
        const actor = gameView(state, 0).turn!;
        const action = gameView(state, actor).allowedActions.find(
          (action) => action.type === "playCard",
        )!;
        const next = applyGameAction(state, actor, action);
        expect(next.accepted).toBe(true);
        state = next.state;
      }
    }
    expect(state.play?.completedTricks).toBe(2);
  },
);

test("three passes disappear before opening the raspas talon but stay in history", () => {
  const state = passedGame();
  for (const seat of [0, 1, 2] as const) {
    const markup = render(view(state, seat), seat);
    expect(markup).not.toContain('class="speech-bubble">пас');
    expect(markup).toContain("Откройте прикуп");
    expect(markup).toContain("пас");
    expect(markup).not.toContain('class="turn-indicator"');
    expect(markup).not.toContain('class="opponent-turn"');
  }
});

test.each([
  "пас",
  "мизер",
  "6 пик",
  "10 без козыря",
  "вист",
  "полвиста",
  "всветлую",
  "втёмную",
])("keeps %s in its phase and hides it during play", (word) => {
  expect(shownBubble(word, "auction")).toBe(word);
  expect(shownBubble(word, "defense")).toBe(word);
  expect(shownBubble(word, "play")).toBeUndefined();
  expect(shownBubble(word, "raspas")).toBeUndefined();
});

test("proposal speech is still visible during play, and a missing turn has no indicator", () => {
  const state = view(openedGame(), 0);
  state.turn = null;
  state.speechStep = 7;
  state.speech = [
    { seat: 0, word: "6 запишем?", step: 7 },
    { seat: 1, word: "согласен", step: 7 },
  ];
  const markup = render(state, 0);
  expect(markup).toContain('class="speech-bubble">6 запишем?');
  expect(markup).toContain('class="speech-bubble">согласен');
  expect(markup).not.toContain('class="turn-indicator"');
  expect(markup).not.toContain('class="opponent-turn"');
});

test("a finished game never announces a card turn even if an old turn remains", () => {
  const state = { ...view(openedGame(), 0), phase: "finished", turn: 0 };
  const markup = render(state, 0);
  expect(markup).not.toContain("Ваш ход");
  expect(markup).not.toContain('class="opponent-turn"');
});
