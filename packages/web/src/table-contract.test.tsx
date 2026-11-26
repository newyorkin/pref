import {
  applyGameAction,
  createGame,
  deal,
  gameView,
  type GameAction as EngineAction,
  type GameState,
  type Seat,
} from "@pref/engine";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { GameSnapshotPanel } from "./GameTable.js";
import type { AuctionBid, GameSnapshot } from "./table-types.js";
import { finalContract } from "./table-utils.js";

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

function render(state: GameState, viewer: Seat): string {
  return renderToStaticMarkup(
    <GameSnapshotPanel
      snapshot={{ type: "snapshot", tableId: "test", version: 1, state: view(state, viewer) }}
      settings={settings}
      seat={viewer}
      playerNames={names}
      onAction={() => undefined}
    />,
  );
}

/** The seat that has to act and its actions; proposals are offered out of turn, so they don't count. */
function actor(state: GameState): { seat: Seat; actions: EngineAction[] } {
  for (const seat of seats) {
    const actions = gameView(state, seat).allowedActions.filter(
      (action) => action.type !== "propose" && action.type !== "proposal",
    );
    if (actions.length > 0) {
      return { seat, actions: [...actions] };
    }
  }
  throw new Error(`nobody acts in ${state.phase}`);
}

function sameBid(left: AuctionBid, right: AuctionBid): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** The first bidder takes the торговля with `bid`, then orders `order`. */
function choose(bid: AuctionBid, order: AuctionBid) {
  return (state: GameState, actions: EngineAction[]): EngineAction => {
    const picked =
      state.phase === "auction"
        ? state.auction.highestBid === null
          ? actions.find(
              (action) =>
                action.type === "auction" &&
                action.action.type === "bid" &&
                sameBid(action.action.bid, bid),
            )
          : actions.find(
              (action) => action.type === "auction" && action.action.type === "pass",
            )
        : state.phase === "order"
          ? actions.find((action) => action.type === "order" && sameBid(action.bid, order))
          : state.phase === "defense"
            ? (actions.find(
                (action) => action.type === "defense" && action.action.type === "whist",
              ) ?? actions[0])
            : actions.find((action) => action.type !== "withoutThree");
    if (picked === undefined) {
      throw new Error(`no action in ${state.phase}`);
    }
    return picked;
  };
}

function playUntil(
  state: GameState,
  done: (state: GameState) => boolean,
  pick: ReturnType<typeof choose>,
): GameState {
  let current = state;
  for (let step = 0; step < 200 && !done(current); step++) {
    const { seat, actions } = actor(current);
    const result = applyGameAction(current, seat, pick(current, actions));
    expect(result.accepted).toBe(true);
    current = result.state;
  }
  expect(done(current)).toBe(true);
  return current;
}

function badges(markup: string): string[] {
  return [...markup.matchAll(/class="contract-badge" title="Заказ: ([^"]*)"/g)].map(
    (match) => match[1],
  );
}

describe.each([
  {
    name: "7 ♥ over 6 ♠",
    bid: { type: "contract", level: 6, trump: "spades" },
    order: { type: "contract", level: 7, trump: "hearts" },
    badge: "7 ♥",
    red: true,
  },
  {
    name: "6 БК over 6 ♠",
    bid: { type: "contract", level: 6, trump: "spades" },
    order: { type: "contract", level: 6, trump: "noTrump" },
    badge: "6 БК",
    red: false,
  },
  {
    name: "мизер",
    bid: { type: "misere" },
    order: { type: "misere" },
    badge: "Мизер",
    red: false,
  },
] as const)("the заказ $name", ({ bid, order, badge, red }) => {
  const pick = choose(bid, order);
  const ordering = playUntil(
    createGame(settings, deal(42)),
    (s) => s.phase === "order",
    pick,
  );
  const result = ordering.auctionResult;
  const declarer = result === null || result.type === "raspas" ? null : result.declarer;
  if (declarer === null) {
    throw new Error("no declarer");
  }
  const played = playUntil(
    ordering,
    (s) => s.phase === "play" && s.play !== null && s.play.trickHistory.length === 1,
    pick,
  );

  test.each(seats)("seat %i sees the торговля bid as торговля, not as the заказ", (viewer) => {
    const markup = render(ordering, viewer);
    expect(badges(markup)).toEqual([]);
    expect(markup).not.toContain('class="game-title"');
    expect(markup).toContain('class="game-bid">Торговля: ');
    expect(markup).toContain(
      viewer === declarer ? "Заказываете вы" : `Заказывает ${names[declarer]}`,
    );
  });

  test.each(seats)("seat %i sees the заказ next to the declarer's name", (viewer) => {
    const markup = render(played, viewer);
    // The opponent's name and the trick triangle for an opponent; only the triangle for oneself.
    expect(badges(markup)).toEqual(viewer === declarer ? [badge] : [badge, badge]);
    const name = viewer === declarer ? "вы" : names[declarer];
    expect(markup).toContain(`${name}<span class="contract-badge" title="Заказ: ${badge}">`);
    expect(markup).not.toContain("Торговля:");
    // A red suit in the badge is coloured like the bids.
    expect(markup.includes('<span class="bid-red">♥</span></span>')).toBe(red);
    for (const other of seats.filter((seat) => seat !== declarer && seat !== viewer)) {
      expect(markup).not.toContain(`${names[other]}<span class="contract-badge"`);
    }
  });

  test("the первоначальная заявка stays in the лог", () => {
    const markup = render(played, 0);
    const log = markup.slice(markup.indexOf('aria-label="Лог"'));
    expect(log).toContain(bid.type === "misere" ? "мизер" : "6 пик");
  });

  test.each(seats)("seat %i sees no заказ once the next deal starts", (viewer) => {
    const next = playUntil(
      played,
      (s) => s.dealNumber === played.dealNumber + 1 && s.phase === "auction",
      pick,
    );
    expect(badges(render(next, viewer))).toEqual([]);
  });
});

test("finalContract is set only after the заказ and only for a contract or мизер", () => {
  const contract = { type: "contract", declarer: 1, level: 7, trump: "hearts" };
  const auction = (result: unknown) =>
    ({ result }) as GameSnapshot["auction"];
  expect(finalContract({ phase: "discard", auction: auction(contract) })).toBeNull();
  expect(finalContract({ phase: "order", auction: auction(contract) })).toBeNull();
  expect(finalContract({ phase: "defense", auction: auction(contract) })).toEqual({
    declarer: 1,
    bid: { type: "contract", level: 7, trump: "hearts" },
  });
  expect(
    finalContract({ phase: "play", auction: auction({ type: "misere", declarer: 2 }) }),
  ).toEqual({ declarer: 2, bid: { type: "misere" } });
  expect(finalContract({ phase: "play", auction: auction({ type: "raspas" }) })).toBeNull();
  expect(finalContract({ phase: "auction", auction: auction(null) })).toBeNull();
});
