import {
  applyGameAction,
  createGame,
  gameView,
  type Card as EngineCard,
  type GameAction as EngineAction,
  type GameState,
  type Seat,
} from "@pref/engine";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { GameSnapshotPanel } from "./GameTable.js";
import { Hand } from "./table-hand.js";
import type { Card, GameSnapshot } from "./table-types.js";
import { rankLabel, suitSymbol } from "./table-utils.js";

const settings = {
  raspasProgression: "111",
  raspasExit: "666",
  throwTalon: false,
  bulletTarget: 10,
} as const;

const card = (suit: EngineCard["suit"], rank: EngineCard["rank"]): EngineCard => ({
  suit,
  rank,
});
const label = (item: Card): string => `${rankLabel(item.rank)} ${suitSymbol(item.suit)}`;

function act(state: GameState, seat: Seat, action: EngineAction): GameState {
  const result = applyGameAction(state, seat, action);
  expect(result.accepted).toBe(true);
  return result.state;
}

function view(state: GameState, viewer: Seat): GameSnapshot {
  return JSON.parse(JSON.stringify(gameView(state, viewer))) as GameSnapshot;
}

function render(state: GameSnapshot, viewer: Seat): string {
  return renderToStaticMarkup(
    <GameSnapshotPanel
      snapshot={{ type: "snapshot", tableId: "test", version: 1, state }}
      settings={settings}
      seat={viewer}
      onAction={() => undefined}
    />,
  );
}

interface ShownCard {
  label: string;
  button: boolean;
  unplayable: boolean;
}

function cardsIn(markup: string, start: string, end: string): ShownCard[] {
  const from = markup.indexOf(start);
  if (from < 0) {
    return [];
  }
  const region = markup.slice(from, markup.indexOf(end, from));
  return [...region.matchAll(/<(button|div) [^>]*?class="(pc(?: [^"]*)?)" aria-label="([^"]+)"/g)].map(
    (match) => ({
      label: match[3]!,
      button: match[1] === "button",
      unplayable: match[2]!.split(" ").includes("pc-unplayable"),
    }),
  );
}

function ownHand(markup: string): ShownCard[] {
  return cardsIn(markup, 'aria-label="Ваши карты"', "</section>");
}

function openHand(markup: string): ShownCard[] {
  return cardsIn(markup, 'aria-label="Карты всветлую"', 'class="opponent-name"');
}

/** The shown state of every card agrees with the playCard actions the server sent. */
function expectMatchesActions(state: GameSnapshot, viewer: Seat): string {
  const markup = render(state, viewer);
  const playable = state.allowedActions
    .filter((action) => action.type === "playCard")
    .map((action) => label(action.card!));
  for (const cards of [ownHand(markup), openHand(markup)]) {
    const moving = cards.some((item) => playable.includes(item.label));
    for (const item of cards) {
      const allowed = playable.includes(item.label);
      expect(item.button, item.label).toBe(allowed);
      expect(item.unplayable, item.label).toBe(moving && !allowed);
    }
  }
  return markup;
}

function dimmed(cards: ShownCard[]): string[] {
  return cards.filter((item) => item.unplayable).map((item) => item.label);
}

function bright(cards: ShownCard[]): string[] {
  return cards.filter((item) => !item.unplayable).map((item) => item.label);
}

// Seat 0 plays 6 червей, seat 1 passes, seat 2 вистует в светлую and plays seat 1's open hand.
function lightWhistGame(): GameState {
  let state = createGame(settings, {
    hands: [
      [card("spades", 14), card("clubs", 14), card("diamonds", 8)],
      [card("hearts", 7), card("diamonds", 9), card("clubs", 7)],
      [card("spades", 13), card("clubs", 10), card("clubs", 8)],
    ],
    talon: [card("diamonds", 10), card("diamonds", 11)],
  });
  state = act(state, 0, {
    type: "auction",
    action: { type: "bid", bid: { type: "contract", level: 6, trump: "hearts" } },
  });
  state = act(state, 1, { type: "auction", action: { type: "pass" } });
  state = act(state, 2, { type: "auction", action: { type: "pass" } });
  state = act(state, 0, {
    type: "discard",
    cards: [card("diamonds", 10), card("diamonds", 11)],
  });
  state = act(state, 0, {
    type: "order",
    bid: { type: "contract", level: 6, trump: "hearts" },
  });
  state = act(state, 1, { type: "defense", action: { type: "pass" } });
  state = act(state, 2, { type: "defense", action: { type: "whist" } });
  return state;
}

describe("unplayable cards", () => {
  test("every card is bright when the player leads", () => {
    const state = lightWhistGame();
    const markup = expectMatchesActions(view(state, 0), 0);
    expect(dimmed(ownHand(markup))).toEqual([]);
    expect(ownHand(markup).filter((item) => item.button)).toHaveLength(3);
  });

  test("nothing is dimmed while the вистующий chooses светлую or тёмную", () => {
    const state = act(lightWhistGame(), 0, { type: "playCard", card: card("spades", 14) });
    for (const viewer of [0, 1, 2] as const) {
      const markup = expectMatchesActions(view(state, viewer), viewer);
      expect(markup).not.toContain("pc-unplayable");
    }
  });

  test("the open hand must trump, and only its controller sees it dimmed", () => {
    let state = act(lightWhistGame(), 0, { type: "playCard", card: card("spades", 14) });
    state = act(state, 2, { type: "defense", action: { type: "light" } });

    const controller = expectMatchesActions(view(state, 2), 2);
    expect(bright(openHand(controller))).toEqual(["7 ♥"]);
    expect(dimmed(openHand(controller)).sort()).toEqual(["7 ♣", "9 ♦"]);
    // The controller's own hand isn't the one to move.
    expect(dimmed(ownHand(controller))).toEqual([]);
    expect(ownHand(controller).some((item) => item.button)).toBe(false);

    for (const viewer of [0, 1] as const) {
      const markup = expectMatchesActions(view(state, viewer), viewer);
      expect(markup).not.toContain("pc-unplayable");
    }
  });

  test("a player with the led suit must follow it; others see no dimming", () => {
    let state = act(lightWhistGame(), 0, { type: "playCard", card: card("spades", 14) });
    state = act(state, 2, { type: "defense", action: { type: "light" } });
    state = act(state, 2, { type: "playCard", card: card("hearts", 7) });

    const whistler = expectMatchesActions(view(state, 2), 2);
    expect(bright(ownHand(whistler))).toEqual(["К ♠"]);
    expect(dimmed(ownHand(whistler)).sort()).toEqual(["10 ♣", "8 ♣"]);
    expect(dimmed(openHand(whistler))).toEqual([]);

    for (const viewer of [0, 1] as const) {
      const markup = expectMatchesActions(view(state, viewer), viewer);
      expect(markup).not.toContain("pc-unplayable");
    }
  });

  test("without the led suit and without trumps every card can be played", () => {
    let state = act(lightWhistGame(), 0, { type: "playCard", card: card("spades", 14) });
    state = act(state, 2, { type: "defense", action: { type: "light" } });
    state = act(state, 2, { type: "playCard", card: card("hearts", 7) });
    state = act(state, 2, { type: "playCard", card: card("spades", 13) });

    // The open hand took the trick with a trump and leads: all of its cards are bright.
    const leading = expectMatchesActions(view(state, 2), 2);
    expect(dimmed(openHand(leading))).toEqual([]);
    expect(openHand(leading).filter((item) => item.button)).toHaveLength(2);

    state = act(state, 2, { type: "playCard", card: card("diamonds", 9) });
    const free = expectMatchesActions(view(state, 2), 2);
    expect(dimmed(ownHand(free))).toEqual([]);
    expect(ownHand(free).filter((item) => item.button)).toHaveLength(2);
  });

  test("no card is dimmed while the declarer chooses the снос", () => {
    const hand = [
      { suit: "spades", rank: 7 },
      { suit: "hearts", rank: 8 },
    ];
    const markup = renderToStaticMarkup(
      <Hand
        state={{ phase: "discard" } as GameSnapshot}
        hand={hand}
        playActions={[]}
        discardActions={[{ type: "discard", cards: [hand[0]!, hand[1]!] }]}
        selected={[]}
        setSelected={() => undefined}
        playNow={() => undefined}
        trump={null}
      />,
    );
    expect(markup).not.toContain("pc-unplayable");
    expect(markup.match(/<button/g)).toHaveLength(2);
  });
});
