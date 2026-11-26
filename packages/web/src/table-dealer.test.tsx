import {
  applyGameAction,
  createGame,
  deal,
  dealerSeat,
  gameView,
  type GameAction as EngineAction,
  type GameState,
  type Seat,
} from "@pref/engine";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { GameSnapshotPanel } from "./GameTable.js";
import type { GameSnapshot } from "./table-types.js";

const settings = {
  raspasProgression: "111",
  raspasExit: "666",
  throwTalon: false,
  bulletTarget: 10,
} as const;
const names = ["Анна", "Борис", "Вера"];
const seats = [0, 1, 2] as const;

function view(state: GameState, viewer: Seat): GameSnapshot {
  return JSON.parse(JSON.stringify(gameView(state, viewer))) as GameSnapshot;
}

function render(
  snapshot: GameSnapshot,
  viewer: Seat,
  occupiedSeats: boolean[] | null = null,
): string {
  return renderToStaticMarkup(
    <GameSnapshotPanel
      snapshot={{ type: "snapshot", tableId: "test", version: 1, state: snapshot }}
      settings={settings}
      seat={viewer}
      playerNames={names}
      occupiedSeats={occupiedSeats}
      onAction={() => undefined}
    />,
  ).replaceAll("<!-- -->", "");
}

/** The corners of the trick triangle that carry the dealer mark. */
function dealerCorners(markup: string): string[] {
  const triangle = markup.slice(markup.indexOf('class="seat-triangle'));
  return [
    ...triangle.matchAll(
      /seat-corner seat-corner-(left|right|me)[^"]*">(?:(?!<\/p>).)*class="dealer-mark"/g,
    ),
  ].map((match) => match[1]);
}

function cornerOf(dealer: Seat, viewer: Seat): string {
  return dealer === viewer ? "me" : dealer === (viewer + 1) % 3 ? "left" : "right";
}

/** The seat that has to act and its actions; proposals and «без трёх» don't count. */
function actor(state: GameState): { seat: Seat; actions: EngineAction[] } {
  for (const seat of seats) {
    const actions = gameView(state, seat).allowedActions.filter(
      (action) =>
        action.type !== "propose" &&
        action.type !== "proposal" &&
        action.type !== "withoutThree",
    );
    if (actions.length > 0) {
      return { seat, actions: [...actions] };
    }
  }
  throw new Error(`nobody acts in ${state.phase}`);
}

/** Plays the deal out with each seat's first action until the next deal's торговля. */
function nextDeal(state: GameState): GameState {
  let current = state;
  for (let step = 0; step < 300 && current.dealNumber === state.dealNumber; step++) {
    const turn = actor(current);
    const result = applyGameAction(current, turn.seat, turn.actions[0] as EngineAction);
    expect(result.accepted).toBe(true);
    current = result.state;
  }
  expect(current.dealNumber).toBe(state.dealNumber + 1);
  expect(current.phase).toBe("auction");
  return current;
}

describe("the dealer", () => {
  const deals = [createGame(settings, deal(42))];
  for (let index = 1; index < 4; index++) {
    deals.push(nextDeal(deals[index - 1] as GameState));
  }

  test("moves to the next seat with each deal", () => {
    expect(deals.map((state) => dealerSeat(state.dealNumber))).toEqual([2, 0, 1, 2]);
  });

  test.each(
    deals.flatMap((state) => seats.map((viewer) => ({ deal: state.dealNumber + 1, state, viewer }))),
  )("in deal $deal seat $viewer sees exactly one dealer mark, at the dealer's corner", ({
    state,
    viewer,
  }) => {
    const dealer = dealerSeat(state.dealNumber);
    const markup = render(view(state, viewer), viewer);
    expect(dealerCorners(markup)).toEqual([cornerOf(dealer, viewer)]);
    expect(markup.match(/class="dealer-mark"/g)).toHaveLength(1);
    expect(markup).toContain(dealer === viewer ? ">сдавали</span>" : ">сдавал</span>");
    // An opponent who dealt is also marked next to the name above the cards.
    expect(markup.includes(`${names[dealer]} (сдавал)`)).toBe(dealer !== viewer);
  });

  test.each(seats)(
    "seat %i still sees the dealer without the opponents' hands or with an empty seat",
    (viewer) => {
      const state = deals[0] as GameState;
      const dealer = dealerSeat(state.dealNumber);
      const { handSizes: _handSizes, ...withoutHands } = view(state, viewer);
      expect(dealerCorners(render(withoutHands, viewer))).toEqual([cornerOf(dealer, viewer)]);
      const empty = seats.map((seat) => seat === viewer);
      expect(dealerCorners(render(view(state, viewer), viewer, empty))).toEqual([
        cornerOf(dealer, viewer),
      ]);
    },
  );

  test("the dealer keeps their mark beside their own заказ below the tip", () => {
    // Pass until the dealer wins the торговля, then play to the first взятка.
    let state = deals[0] as GameState;
    const dealer = dealerSeat(state.dealNumber);
    for (let step = 0; step < 100 && state.phase !== "play"; step++) {
      const turn = actor(state);
      const pick =
        state.phase === "auction"
          ? turn.actions.find((action) =>
              turn.seat === dealer
                ? action.type === "auction" && action.action.type === "bid"
                : action.type === "auction" && action.action.type === "pass",
            )
          : state.phase === "defense"
            ? (turn.actions.find(
                (action) => action.type === "defense" && action.action.type === "whist",
              ) ?? turn.actions[0])
            : turn.actions[0];
      const result = applyGameAction(state, turn.seat, pick as EngineAction);
      expect(result.accepted).toBe(true);
      state = result.state;
    }
    expect(state.phase).toBe("play");
    const markup = render(view(state, dealer), dealer);
    expect(markup).toContain('class="seat-triangle seat-triangle-own-contract"');
    expect(dealerCorners(markup)).toEqual(["me"]);
    expect(markup).toMatch(
      /<strong>\d+<\/strong> <span class="contract-badge"[^>]*>.*?<\/span><span class="dealer-mark"/,
    );
  });
});
