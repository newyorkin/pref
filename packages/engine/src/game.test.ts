import { describe, expect, test } from "vitest";

import { createAuction, type Seat, type Trump } from "./auction.js";
import type { Card, Suit } from "./deck.js";
import {
  applyGameAction,
  createGame,
  gameView,
  type GameAction,
  type GameState,
} from "./game.js";
import { createBulletScore } from "./scoring.js";
import { createTrickPlay } from "./tricks.js";

const settings = {
  raspasProgression: "123",
  raspasExit: "666",
  throwTalon: false,
  bulletTarget: 2,
} as const;

function act(
  state: GameState,
  seat: Seat,
  action: GameAction,
): GameState {
  const transition = applyGameAction(state, seat, action);
  expect(transition.accepted).toBe(true);
  return transition.state;
}

function boughtDeal(patch: Partial<GameState> = {}): GameState {
  const score = patch.score ?? createBulletScore();
  return {
    settings: { ...settings, throwTalon: true, bulletTarget: 10 },
    phase: "auction",
    seed: 1,
    dealNumber: 0,
    raspasIndex: 0,
    score,
    scoreAtDealStart: score,
    dealtCards: {
      hands: [[], [], []],
      talon: [],
    },
    auction: {
      turn: 2,
      active: [true, false, true],
      highestBid: { type: "contract", level: 6, trump: "spades" },
      highestBidder: 0,
      misereBidder: null,
      contractBidders: [true, false, false],
      passesWithoutBid: 1,
      result: null,
    },
    auctionResult: null,
    talon: null,
    defense: null,
    play: null,
    ...patch,
  };
}

function confirmOrder(state: GameState): GameState {
  const result = state.auctionResult;
  if (result?.type === "misere") {
    const announced = act(state, result.declarer, {
      type: "order",
      bid: { type: "misere" },
    });
    return act(announced, result.declarer, {
      type: "order",
      bid: { type: "misere" },
    });
  }
  if (result?.type === "contract") {
    return act(state, result.declarer, {
      type: "order",
      bid: { type: "contract", level: result.level, trump: result.trump },
    });
  }
  throw new Error("no contract to order");
}

function orderedContract(level: 6 | 7 | 8, raspasIndex = 0): GameState {
  const card = (suit: Suit, rank: Card["rank"]): Card => ({ suit, rank });
  let state: GameState = {
    settings: { ...settings, bulletTarget: 10 },
    phase: "auction",
    seed: 1,
    dealNumber: 0,
    raspasIndex,
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
  };
  state = act(state, 0, {
    type: "auction",
    action: {
      type: "bid",
      bid: { type: "contract", level, trump: "spades" },
    },
  });
  state = act(state, 1, { type: "auction", action: { type: "pass" } });
  state = act(state, 2, { type: "auction", action: { type: "pass" } });
  return confirmOrder(
    act(state, 0, {
      type: "discard",
      cards: [card("clubs", 8), card("clubs", 7)],
    }),
  );
}

describe("complete game state", () => {
  test("shows the lead card to every seat and keeps the seat view repeatable", () => {
    let state = createGame(settings, 42);
    state = act(state, 0, {
      type: "auction",
      action: { type: "pass" },
    });
    state = act(state, 1, {
      type: "auction",
      action: { type: "pass" },
    });
    state = act(state, 2, {
      type: "auction",
      action: { type: "pass" },
    });
    expect(state.phase).toBe("raspas");
    expect(gameView(state, 1).prikup).toEqual([
      { faceDown: true },
      { faceDown: true },
    ]);
    state = act(state, 1, { type: "openTalon", index: 0 });
    expect(state.play?.turn).toBe(0);
    const lead = gameView(state, 0).allowedActions[0];
    state = act(state, 0, lead);

    const firstView = gameView(state, 1);
    const reconnectView = gameView(state, 1);
    expect(firstView).toEqual(reconnectView);
    expect(firstView.currentTrick[0]).toEqual(
      gameView(state, 0).currentTrick[0],
    );
    expect(firstView.currentTrick[0]?.card).not.toHaveProperty("faceDown");
    expect(firstView.raspasIndex).toBe(0);
  });

  test("finishes a short bullet and resets the raspas index", () => {
    const initialScore = {
      ...createBulletScore(),
      bullet: [0, 2, 2] as const,
    };
    let winningState: GameState | null = null;

    for (let seed = 0; seed < 100 && winningState === null; seed += 1) {
      for (const trump of [
        "spades",
        "clubs",
        "diamonds",
        "hearts",
        "noTrump",
      ] as const satisfies readonly Trump[]) {
        let discarded = createGame(settings, seed, initialScore, 2);
        discarded = act(discarded, 0, {
          type: "auction",
          action: {
            type: "bid",
            bid: { type: "contract", level: 6, trump },
          },
        });
        discarded = act(discarded, 1, {
          type: "auction",
          action: { type: "pass" },
        });
        discarded = act(discarded, 2, {
          type: "auction",
          action: { type: "pass" },
        });

        const discards = gameView(discarded, 0).allowedActions;
        for (const discard of discards) {
          let candidate = confirmOrder(act(discarded, 0, discard));
          candidate = act(candidate, 1, {
            type: "defense",
            action: { type: "pass" },
          });
          candidate = act(candidate, 2, {
            type: "defense",
            action: { type: "pass" },
          });

          while (candidate.phase === "play") {
            const turn = candidate.play!.turn!;
            candidate = act(
              candidate,
              turn,
              gameView(candidate, turn).allowedActions[0],
            );
          }
          if (candidate.phase === "finished") {
            winningState = candidate;
            break;
          }
        }
      }
    }

    expect(winningState).not.toBeNull();
    expect(winningState!.score.bullet).toEqual([2, 2, 2]);
    expect(winningState!.raspasIndex).toBe(0);
    expect(winningState!.phase).toBe("finished");
    expect(winningState!.deals).toHaveLength(1);
    expect(winningState!.deals?.[0]?.declarer).toBe(0);
    expect(winningState!.deals?.[0]?.contract).toMatch(/^6 /);
    expect(gameView(winningState!, 1).deals).toEqual(winningState!.deals);
    const again = applyGameAction(winningState!, 2, {
      type: "rematch",
      seed: 5,
    });
    expect(again.accepted).toBe(true);
    if (again.accepted) {
      expect(again.state.phase).toBe("auction");
      expect(again.state.dealNumber).toBe(0);
      expect(again.state.raspasIndex).toBe(0);
      expect(again.state.score.bullet).toEqual([0, 0, 0]);
      expect(again.state.deals).toEqual([]);
    }
    const views = [0, 1, 2].map((seat) => gameView(winningState!, seat));
    expect(views[1].score).toEqual(views[0].score);
    expect(views[2].score).toEqual(views[0].score);
    expect(views[1].settlement).toEqual(views[0].settlement);
    expect(views[0].settlement).not.toBeNull();
    const settlement = views[0].settlement!;
    expect(settlement[0] + settlement[1] + settlement[2]).toBe(0);
  });

  test("a low trump beats a side-suit ace after the declarer discards two cards", () => {
    const card = (suit: Suit, rank: Card["rank"]): Card => ({ suit, rank });
    let state: GameState = {
      settings: {
        raspasProgression: "123",
        raspasExit: "666",
        throwTalon: false,
        bulletTarget: 10,
      },
      phase: "auction",
      seed: 1,
      dealNumber: 0,
      raspasIndex: 0,
      score: createBulletScore(),
      dealtCards: {
        hands: [
          [card("spades", 14), card("clubs", 9)],
          [card("hearts", 7)],
          [card("spades", 13)],
        ],
        talon: [card("clubs", 8), card("clubs", 7)],
      },
      auction: createAuction(0),
      auctionResult: null,
      talon: null,
      defense: null,
      play: null,
    };

    state = act(state, 0, {
      type: "auction",
      action: {
        type: "bid",
        bid: { type: "contract", level: 6, trump: "hearts" },
      },
    });
    state = act(state, 1, { type: "auction", action: { type: "pass" } });
    state = act(state, 2, { type: "auction", action: { type: "pass" } });

    const declarer = gameView(state, 0);
    const defender = gameView(state, 1);
    expect(declarer.hand).toHaveLength(4);
    expect(declarer.talonCards).toEqual([
      card("clubs", 8),
      card("clubs", 7),
    ]);
    expect(defender.talonCards).toEqual([
      card("clubs", 8),
      card("clubs", 7),
    ]);
    expect(gameView(state, 2).talonCards).toEqual(defender.talonCards);

    state = act(state, 0, {
      type: "discard",
      cards: [card("clubs", 8), card("clubs", 7)],
    });
    expect(gameView(state, 0).hand).toEqual([
      card("spades", 14),
      card("clubs", 9),
    ]);
    expect(gameView(state, 0).discarded).toEqual([
      card("clubs", 8),
      card("clubs", 7),
    ]);
    expect(gameView(state, 1).discarded).toEqual([]);
    expect(gameView(state, 1).talonCards).toEqual([
      card("clubs", 8),
      card("clubs", 7),
    ]);

    state = confirmOrder(state);
    state = act(state, 1, { type: "defense", action: { type: "whist" } });
    expect(gameView(state, 1).talonCards).toEqual([
      card("clubs", 8),
      card("clubs", 7),
    ]);
    state = act(state, 2, { type: "defense", action: { type: "whist" } });
    expect(state.play?.trump).toBe("hearts");
    expect(gameView(state, 1).talonCards).toEqual([]);
    expect(gameView(state, 0).talonCards).toEqual([]);

    state = act(state, 0, { type: "playCard", card: card("spades", 14) });
    const withoutTrump = gameView(state, 1).allowedActions;
    expect(withoutTrump).toEqual([
      { type: "playCard", card: card("hearts", 7) },
    ]);
    state = act(state, 1, withoutTrump[0]);
    state = act(state, 2, { type: "playCard", card: card("spades", 13) });

    expect(state.play?.tricksWon).toEqual([0, 1, 0]);
    expect(state.play?.trickHistory[0]?.winner).toBe(1);
    expect(gameView(state, 0).trump).toBe("hearts");
  });

  test("misere, raspas and no-trump accept any card when hearts are absent", () => {
    const card = (suit: Suit, rank: Card["rank"]): Card => ({ suit, rank });
    const hands = [
      [card("hearts", 9), card("clubs", 9)],
      [card("diamonds", 8), card("clubs", 10)],
      [card("clubs", 7), card("diamonds", 7)],
    ] as const;
    const talon = [card("spades", 7), card("spades", 8)] as const;
    const base: GameState = {
      settings: { ...settings, bulletTarget: 10 },
      phase: "auction",
      seed: 1,
      dealNumber: 0,
      raspasIndex: 0,
      score: createBulletScore(),
      dealtCards: { hands, talon },
      auction: createAuction(0),
      auctionResult: null,
      talon: null,
      defense: null,
      play: null,
    };

    let raspas = act(base, 0, {
      type: "auction",
      action: { type: "pass" },
    });
    raspas = act(raspas, 1, {
      type: "auction",
      action: { type: "pass" },
    });
    raspas = act(raspas, 2, {
      type: "auction",
      action: { type: "pass" },
    });
    expect(JSON.stringify(gameView(raspas, 0))).not.toContain("spades");
    raspas = act(raspas, 2, { type: "openTalon", index: 0 });
    expect(raspas.play?.currentTrick).toEqual([]);
    expect(raspas.play?.turn).toBe(0);
    const misere = act(
      act(
        act(base, 0, {
          type: "auction",
          action: { type: "bid", bid: { type: "misere" } },
        }),
        1,
        { type: "auction", action: { type: "pass" } },
      ),
      2,
      { type: "auction", action: { type: "pass" } },
    );
    expect(gameView(misere, 1).talonCards).toEqual([...talon]);
    expect(gameView(misere, 0).talonCards).toEqual([...talon]);
    expect(gameView(misere, 1).discarded).toEqual([]);
    const discardedMisere = confirmOrder(
      act(misere, 0, {
        type: "discard",
        cards: [card("spades", 7), card("spades", 8)],
      }),
    );
    let noTrump = act(base, 0, {
      type: "auction",
      action: {
        type: "bid",
        bid: { type: "contract", level: 6, trump: "noTrump" },
      },
    });
    noTrump = act(noTrump, 1, {
      type: "auction",
      action: { type: "pass" },
    });
    noTrump = act(noTrump, 2, {
      type: "auction",
      action: { type: "pass" },
    });
    noTrump = confirmOrder(
      act(noTrump, 0, {
        type: "discard",
        cards: [card("spades", 7), card("spades", 8)],
      }),
    );
    noTrump = act(noTrump, 1, {
      type: "defense",
      action: { type: "whist" },
    });
    noTrump = act(noTrump, 2, {
      type: "defense",
      action: { type: "whist" },
    });

    for (const state of [raspas, discardedMisere, noTrump]) {
      expect(state.phase).toBe("play");
      expect(state.play?.trump).toBeNull();
      const led = act(state, 0, {
        type: "playCard",
        card: card("hearts", 9),
      });
      const diamond = applyGameAction(led, 1, {
        type: "playCard",
        card: card("diamonds", 8),
      });
      const club = applyGameAction(led, 1, {
        type: "playCard",
        card: card("clubs", 10),
      });
      const untouched = applyGameAction(led, 1, {
        type: "playCard",
        card: card("spades", 14),
      });

      expect(diamond.accepted).toBe(true);
      expect(club.accepted).toBe(true);
      expect(diamond).not.toMatchObject({ reason: "mustPlayTrump" });
      expect(club).not.toMatchObject({ reason: "mustPlayTrump" });
      expect(untouched.accepted).toBe(false);
      expect(untouched.state).toBe(led);
      expect(untouched.state.play?.currentTrick).toEqual(
        led.play?.currentTrick,
      );
    }
  });

  test("writes each talon ace to the dealer when a contract opens the talon", () => {
    const card = (suit: Suit, rank: Card["rank"]): Card => ({ suit, rank });
    const original = [card("clubs", 10), card("diamonds", 9)];
    const talon = [card("spades", 14), card("hearts", 13)] as const;
    let state = act(
      boughtDeal({
        dealtCards: {
          hands: [original, [card("hearts", 7)], [card("clubs", 7)]],
          talon: [...talon],
        },
      }),
      2,
      { type: "auction", action: { type: "pass" } },
    );

    expect(state.phase).toBe("discard");
    expect(state.score.bullet).toEqual([0, 0, 1]);
    expect(gameView(state, 0).speech.map((line) => line.word)).toContain(
      "туз в пулю",
    );
    expect(state.score.mountain).toEqual([0, 0, 0]);
    expect(state.score.last.bullet).toEqual([0, 0, 1]);
    expect(state.talon?.hands[0]).toEqual([...original, ...talon]);
    expect(gameView(state, 0).allowedActions[0]).toEqual({
      type: "throwTalon",
    });

    state = act(state, 0, {
      type: "discard",
      cards: [card("hearts", 13), card("diamonds", 9)],
    });
    expect(state.score.bullet).toEqual([0, 0, 1]);
    expect(state.score.mountain).toEqual([0, 0, 0]);
    expect(state.talon?.hands[0]).toEqual([
      card("clubs", 10),
      card("spades", 14),
    ]);
  });

  test("throwing the talon leaves the hand untouched and writes 2 mountain", () => {
    const card = (suit: Suit, rank: Card["rank"]): Card => ({ suit, rank });
    const original = [card("clubs", 10), card("diamonds", 9)];
    const talon = [card("spades", 14), card("hearts", 14)] as const;
    let state = act(
      boughtDeal({
        dealtCards: {
          hands: [original, [card("hearts", 7)], [card("clubs", 7)]],
          talon: [...talon],
        },
      }),
      2,
      { type: "auction", action: { type: "pass" } },
    );
    expect(state.score.bullet).toEqual([0, 0, 2]);
    expect(gameView(state, 0).speech.map((line) => line.word)).toContain(
      "два туза в пулю",
    );

    state = act(state, 0, { type: "throwTalon" });

    expect(state.phase).toBe("order");
    expect(state.score.bullet).toEqual([0, 0, 2]);
    expect(state.score.mountain).toEqual([0, 0, 2]);
    expect(state.score.last.bullet).toEqual([0, 0, 2]);
    expect(state.score.last.mountain).toEqual([0, 0, 2]);
    expect(state.talon?.hands[0]).toEqual(original);
    expect(state.talon?.discarded).toEqual([...talon]);
    expect(state.talon?.faced).toBe(true);
    expect(gameView(state, 1).discarded).toEqual([...talon]);
    expect(gameView(state, 1).facedTalon).toBe(true);
    expect(gameView(state, 0).speech.at(-1)?.word).toBe("прикуп в лицо");
    const thrown = state;

    state = act(state, 0, { type: "withoutThree" });
    expect(state.score.bullet).toEqual([0, 0, 2]);
    expect(state.score.mountain).toEqual([6, 0, 2]);
    expect(state.score.last.bullet).toEqual([0, 0, 2]);
    expect(state.score.last.mountain).toEqual([6, 0, 2]);

    const ownDeal: GameState = {
      ...thrown,
      phase: "discard",
      dealNumber: 1,
      auctionResult: {
        type: "contract",
        declarer: 0,
        level: 6,
        trump: "spades",
      },
      score: createBulletScore(),
      talon: {
        ...thrown.talon!,
        phase: "discard",
        faced: false,
        discarded: [],
        hands: [[...original, ...talon], [card("hearts", 7)], [card("clubs", 7)]],
      },
    };
    const refused = applyGameAction(ownDeal, 0, { type: "throwTalon" });
    expect(refused.accepted).toBe(false);
    expect(refused.state).toBe(ownDeal);
    expect(gameView(ownDeal, 0).allowedActions[0]).not.toEqual({
      type: "throwTalon",
    });
  });

  test("a miser, raspas, or a table without the convention writes no talon aces", () => {
    const card = (suit: Suit, rank: Card["rank"]): Card => ({ suit, rank });
    const dealtCards = {
      hands: [
        [card("clubs", 10)],
        [card("hearts", 7)],
        [card("clubs", 7)],
      ] as [Card[], Card[], Card[]],
      talon: [card("spades", 14), card("hearts", 14)] as Card[],
    };
    const miser = act(
      boughtDeal({
        dealtCards,
        auction: {
          turn: 2,
          active: [true, false, true],
          highestBid: { type: "misere" },
          highestBidder: 0,
          misereBidder: 0,
          contractBidders: [false, false, false],
          passesWithoutBid: 1,
          result: null,
        },
      }),
      2,
      { type: "auction", action: { type: "pass" } },
    );
    expect(miser.phase).toBe("discard");
    expect(miser.score).toEqual(createBulletScore());
    expect(gameView(miser, 0).speech.map((line) => line.word)).not.toContain(
      "туз в пулю",
    );
    expect(gameView(miser, 0).allowedActions[0]).toEqual({
      type: "throwTalon",
    });

    let raspas = boughtDeal({
      dealtCards,
      auction: createAuction(0),
    });
    raspas = act(raspas, 0, { type: "auction", action: { type: "pass" } });
    raspas = act(raspas, 1, { type: "auction", action: { type: "pass" } });
    raspas = act(raspas, 2, { type: "auction", action: { type: "pass" } });
    expect(raspas.phase).toBe("raspas");
    expect(raspas.score).toEqual(createBulletScore());

    const plain = act(
      boughtDeal({
        dealtCards,
        settings,
      }),
      2,
      { type: "auction", action: { type: "pass" } },
    );
    expect(plain.score).toEqual(createBulletScore());
    expect(
      gameView(plain, 0).allowedActions.some(
        (action) => action.type === "throwTalon",
      ),
    ).toBe(false);
  });

  test("talon aces and the contract share the bullet room left at the start of the deal", () => {
    const card = (suit: Suit, rank: Card["rank"]): Card => ({ suit, rank });
    const score = {
      ...createBulletScore(),
      bullet: [9, 0, 0] as [number, number, number],
    };
    let state = act(
      boughtDeal({
        dealNumber: 1,
        score,
        scoreAtDealStart: score,
        dealtCards: {
          hands: [
            [card("clubs", 10)],
            [card("hearts", 7)],
            [card("clubs", 7)],
          ],
          talon: [card("spades", 14), card("hearts", 14)],
        },
      }),
      2,
      { type: "auction", action: { type: "pass" } },
    );
    expect(state.score.bullet).toEqual([10, 1, 0]);
    expect(state.score.whists[0][1]).toBe(10);
    expect(state.score.mountain).toEqual([0, 0, 0]);
    expect(
      gameView(state, 0).allowedActions.some(
        (action) => action.type === "throwTalon",
      ),
    ).toBe(false);

    const ace = card("diamonds", 14);
    state = {
      ...state,
      phase: "play",
      play: {
        hands: [[ace], [card("hearts", 8)], [card("clubs", 8)]],
        trump: "spades",
        firstLead: "closed",
        turn: 0,
        currentTrick: [],
        trickHistory: [],
        completedTricks: 9,
        tricksWon: [5, 2, 2],
        result: null,
      },
    };
    state = act(state, 0, { type: "playCard", card: ace });
    state = act(state, 1, { type: "playCard", card: card("hearts", 8) });
    state = act(state, 2, { type: "playCard", card: card("clubs", 8) });

    expect(state.score.bullet).toEqual([10, 3, 0]);
    expect(state.score.whists[0][1]).toBe(30);
    expect(state.score.mountain).toEqual([0, 0, 0]);
    expect(state.score.last.bullet).toEqual([1, 3, 0]);
    expect(state.score.last.mountain).toEqual([0, 0, 0]);
    expect(state.lastLayout?.tricks).toEqual([6, 2, 2]);
  });

  test("the single whistler plays the passer's cards, which stay visible", () => {
    const card = (suit: Suit, rank: Card["rank"]): Card => ({ suit, rank });
    let state: GameState = {
      settings: { ...settings, bulletTarget: 10 },
      phase: "auction",
      seed: 1,
      dealNumber: 0,
      raspasIndex: 0,
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
    };

    state = act(state, 0, {
      type: "auction",
      action: {
        type: "bid",
        bid: { type: "contract", level: 6, trump: "hearts" },
      },
    });
    state = act(state, 1, { type: "auction", action: { type: "pass" } });
    state = act(state, 2, { type: "auction", action: { type: "pass" } });
    state = confirmOrder(
      act(state, 0, {
        type: "discard",
        cards: [card("clubs", 8), card("clubs", 7)],
      }),
    );
    state = act(state, 1, { type: "defense", action: { type: "pass" } });
    state = act(state, 2, { type: "defense", action: { type: "whist" } });
    expect(state.phase).toBe("play");
    expect(state.defense?.phase).toBe("style");
    const beforeLead = applyGameAction(state, 2, {
      type: "defense",
      action: { type: "light" },
    });
    expect(beforeLead.accepted).toBe(false);
    expect(beforeLead.state).toBe(state);
    state = act(state, 0, { type: "playCard", card: card("spades", 14) });
    expect(gameView(state, 2).allowedActions).toEqual([
      { type: "defense", action: { type: "light" } },
      { type: "defense", action: { type: "dark" } },
    ]);
    expect(gameView(state, 0).allowedActions).toEqual([]);
    state = act(state, 2, { type: "defense", action: { type: "light" } });

    expect(state.play?.turn).toBe(1);
    expect(gameView(state, 2).turn).toBe(2);
    expect(gameView(state, 1).allowedActions).toEqual([]);
    expect(gameView(state, 2).allowedActions).toEqual([
      { type: "playCard", card: card("hearts", 7) },
    ]);

    const waiting = state;
    const passerPlays = applyGameAction(waiting, 1, {
      type: "playCard",
      card: card("hearts", 7),
    });
    expect(passerPlays.accepted).toBe(false);
    expect(passerPlays.reason).toBe("notYourTurn");
    expect(passerPlays.state).toBe(waiting);

    const sideSuit = applyGameAction(waiting, 2, {
      type: "playCard",
      card: card("diamonds", 9),
    });
    expect(sideSuit.accepted).toBe(false);
    expect(sideSuit.state).toBe(waiting);

    state = act(waiting, 2, {
      type: "playCard",
      card: card("hearts", 7),
    });
    expect(state.play?.currentTrick).toEqual([
      { seat: 0, card: card("spades", 14) },
      { seat: 1, card: card("hearts", 7) },
    ]);
    expect(state.play?.hands[1]).toEqual([card("diamonds", 9)]);
    expect(state.play?.hands[2]).toEqual([
      card("spades", 13),
      card("clubs", 10),
    ]);
    for (const seat of [0, 1, 2] as const) {
      const view = gameView(state, seat);
      expect(view.openSeat).toBe(1);
      expect(view.openHand).toEqual([card("diamonds", 9)]);
      expect(view.handSizes).toEqual([1, 1, 2]);
    }
    expect(gameView(state, 0).shownHands[1]).toEqual([card("diamonds", 9)]);
    expect(gameView(state, 0).shownHands[2]).toEqual([
      card("spades", 13),
      card("clubs", 10),
    ]);
    expect(gameView(state, 2).shownHands[2]).toBeNull();
    expect(gameView(state, 1).shownHands[1]).toBeNull();
    expect(gameView(state, 1).shownHands[2]).toEqual([
      card("spades", 13),
      card("clubs", 10),
    ]);
    expect(gameView(state, 2).shownHands[1]).toEqual([card("diamonds", 9)]);

    const borrowed = applyGameAction(state, 2, {
      type: "playCard",
      card: card("diamonds", 9),
    });
    expect(borrowed.accepted).toBe(false);
    expect(borrowed.state).toBe(state);
    state = act(state, 2, { type: "playCard", card: card("spades", 13) });
    expect(state.play?.trickHistory[0]?.cards[1]).toEqual({
      seat: 1,
      card: card("hearts", 7),
    });
    expect(state.play?.trickHistory[0]?.cards[2]?.seat).toBe(2);
    expect(gameView(state, 0).trickHistory[0]).not.toHaveProperty("talonCard");
    expect(state.play?.hands[1]).toEqual([card("diamonds", 9)]);
    expect(state.play?.hands[2]).toEqual([card("clubs", 10)]);
  });

  test("dark whist and two whistlers keep every hand hidden and self-played", () => {
    const card = (suit: Suit, rank: Card["rank"]): Card => ({ suit, rank });
    const dealt = (): GameState => ({
      settings: { ...settings, bulletTarget: 10 },
      phase: "auction",
      seed: 1,
      dealNumber: 0,
      raspasIndex: 0,
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
    });

    let dark = dealt();
    dark = act(dark, 0, {
      type: "auction",
      action: {
        type: "bid",
        bid: { type: "contract", level: 6, trump: "hearts" },
      },
    });
    dark = act(dark, 1, { type: "auction", action: { type: "pass" } });
    dark = act(dark, 2, { type: "auction", action: { type: "pass" } });
    dark = confirmOrder(
      act(dark, 0, {
        type: "discard",
        cards: [card("clubs", 8), card("clubs", 7)],
      }),
    );
    dark = act(dark, 1, { type: "defense", action: { type: "pass" } });
    dark = act(dark, 2, { type: "defense", action: { type: "whist" } });
    dark = act(dark, 0, { type: "playCard", card: card("spades", 14) });
    dark = act(dark, 2, { type: "defense", action: { type: "dark" } });

    expect(gameView(dark, 0).openHand).toEqual([]);
    expect(gameView(dark, 1).openSeat).toBeNull();
    const hidden = applyGameAction(dark, 2, {
      type: "playCard",
      card: card("hearts", 7),
    });
    expect(hidden.accepted).toBe(false);
    expect(hidden.state).toBe(dark);
    dark = act(dark, 1, { type: "playCard", card: card("hearts", 7) });
    expect(dark.play?.currentTrick[1]).toEqual({
      seat: 1,
      card: card("hearts", 7),
    });
    expect(dark.play?.hands[1]).toEqual([card("diamonds", 9)]);

    let both = dealt();
    both = act(both, 0, {
      type: "auction",
      action: {
        type: "bid",
        bid: { type: "contract", level: 6, trump: "hearts" },
      },
    });
    both = act(both, 1, { type: "auction", action: { type: "pass" } });
    both = act(both, 2, { type: "auction", action: { type: "pass" } });
    both = confirmOrder(
      act(both, 0, {
        type: "discard",
        cards: [card("clubs", 8), card("clubs", 7)],
      }),
    );
    both = act(both, 1, { type: "defense", action: { type: "whist" } });
    both = act(both, 2, { type: "defense", action: { type: "whist" } });
    expect(both.defense?.whistStyle).toBe("dark");
    both = act(both, 0, { type: "playCard", card: card("spades", 14) });
    expect(gameView(both, 2).openHand).toEqual([]);
    expect(gameView(both, 1).allowedActions).toEqual([
      { type: "playCard", card: card("hearts", 7) },
    ]);
    expect(gameView(both, 2).allowedActions).toEqual([]);
  });

  test("the whistler on lead chooses light before the first card", () => {
    const card = (suit: Suit, rank: Card["rank"]): Card => ({ suit, rank });
    let state: GameState = {
      settings: { ...settings, bulletTarget: 10 },
      phase: "auction",
      seed: 1,
      dealNumber: 2,
      raspasIndex: 0,
      score: createBulletScore(),
      dealtCards: {
        hands: [
          [card("spades", 14), card("clubs", 9)],
          [card("hearts", 7), card("diamonds", 9)],
          [card("spades", 13), card("clubs", 10)],
        ],
        talon: [card("clubs", 8), card("clubs", 7)],
      },
      auction: createAuction(2),
      auctionResult: null,
      talon: null,
      defense: null,
      play: null,
    };
    state = act(state, 2, { type: "auction", action: { type: "pass" } });
    state = act(state, 0, {
      type: "auction",
      action: {
        type: "bid",
        bid: { type: "contract", level: 6, trump: "hearts" },
      },
    });
    state = act(state, 1, { type: "auction", action: { type: "pass" } });
    state = confirmOrder(
      act(state, 0, {
        type: "discard",
        cards: [card("clubs", 8), card("clubs", 7)],
      }),
    );
    state = act(state, 1, { type: "defense", action: { type: "pass" } });
    state = act(state, 2, { type: "defense", action: { type: "whist" } });

    expect(state.phase).toBe("defense");
    expect(state.defense?.phase).toBe("style");
    const earlyCard = applyGameAction(state, 2, {
      type: "playCard",
      card: card("spades", 13),
    });
    expect(earlyCard.accepted).toBe(false);
    expect(earlyCard.state).toBe(state);

    state = act(state, 2, { type: "defense", action: { type: "light" } });
    expect(state.phase).toBe("play");
    expect(state.play?.turn).toBe(2);
    expect(state.play?.currentTrick).toEqual([]);
    expect(gameView(state, 0).shownHands[1]).toEqual([
      card("hearts", 7),
      card("diamonds", 9),
    ]);
    expect(gameView(state, 0).shownHands[2]).toEqual([
      card("spades", 13),
      card("clubs", 10),
    ]);
    expect(gameView(state, 1).shownHands[1]).toBeNull();
    expect(gameView(state, 1).shownHands[2]).toEqual([
      card("spades", 13),
      card("clubs", 10),
    ]);
    expect(gameView(state, 2).shownHands[2]).toBeNull();
    expect(gameView(state, 2).shownHands[1]).toEqual([
      card("hearts", 7),
      card("diamonds", 9),
    ]);
  });

  test("a contract returns the third lead to the winner of the second trick", () => {
    const card = (suit: Suit, rank: Card["rank"]): Card => ({ suit, rank });
    const hands = [
      [card("spades", 7), card("hearts", 8), card("diamonds", 7)],
      [card("spades", 8), card("hearts", 9), card("diamonds", 8)],
      [card("spades", 9), card("hearts", 7), card("diamonds", 9)],
    ] as const;
    let state: GameState = {
      settings: { ...settings, bulletTarget: 10 },
      phase: "play",
      seed: 1,
      dealNumber: 0,
      raspasIndex: 0,
      score: createBulletScore(),
      dealtCards: {
        hands: [[], [], []],
        talon: [card("clubs", 8), card("clubs", 7)],
      },
      auction: createAuction(0),
      auctionResult: {
        type: "contract",
        declarer: 0,
        level: 6,
        trump: "clubs",
      },
      talon: null,
      defense: null,
      play: createTrickPlay(hands, 0, "clubs"),
    };

    state = act(state, 0, { type: "playCard", card: card("spades", 7) });
    state = act(state, 1, { type: "playCard", card: card("spades", 8) });
    state = act(state, 2, { type: "playCard", card: card("spades", 9) });
    expect(state.play?.turn).toBe(2);
    state = act(state, 2, { type: "playCard", card: card("hearts", 7) });
    state = act(state, 0, { type: "playCard", card: card("hearts", 8) });
    state = act(state, 1, { type: "playCard", card: card("hearts", 9) });
    expect(state.play?.completedTricks).toBe(2);
    expect(state.play?.turn).toBe(1);
  });

  test("misere stays available over another player's six", () => {
    let state = createGame({ ...settings, bulletTarget: 10 }, 4);
    state = act(state, 0, {
      type: "auction",
      action: {
        type: "bid",
        bid: { type: "contract", level: 6, trump: "spades" },
      },
    });

    expect(gameView(state, 1).allowedActions).toContainEqual({
      type: "auction",
      action: { type: "bid", bid: { type: "misere" } },
    });
    state = act(state, 1, {
      type: "auction",
      action: { type: "bid", bid: { type: "misere" } },
    });
    expect(state.auction.highestBid).toEqual({ type: "misere" });

    state = act(state, 2, {
      type: "auction",
      action: {
        type: "bid",
        bid: { type: "contract", level: 9, trump: "spades" },
      },
    });
    expect(gameView(state, 0).allowedActions).not.toContainEqual({
      type: "auction",
      action: { type: "bid", bid: { type: "misere" } },
    });
    const ownMisere = applyGameAction(state, 0, {
      type: "auction",
      action: { type: "bid", bid: { type: "misere" } },
    });
    expect(ownMisere.accepted).toBe(false);
    expect(ownMisere.reason).toBe("bidNotHigher");
    expect(ownMisere.state).toBe(state);
  });

  test("a six cannot overcall misere and a nine can", () => {
    let state = createGame({ ...settings, bulletTarget: 10 }, 4);
    state = act(state, 0, {
      type: "auction",
      action: { type: "bid", bid: { type: "misere" } },
    });

    const offered = gameView(state, 1).allowedActions.flatMap((action) =>
      action.type === "auction" && action.action.type === "bid"
        ? [action.action.bid]
        : [],
    );
    expect(offered).not.toContainEqual({ type: "misere" });
    expect(
      offered.some(
        (bid) => bid.type === "contract" && bid.level < 9,
      ),
    ).toBe(false);
    expect(offered).toContainEqual({
      type: "contract",
      level: 9,
      trump: "spades",
    });

    const six = applyGameAction(state, 1, {
      type: "auction",
      action: {
        type: "bid",
        bid: { type: "contract", level: 6, trump: "spades" },
      },
    });
    expect(six.accepted).toBe(false);
    expect(six.reason).toBe("bidNotHigher");
    expect(six.state).toBe(state);

    state = act(state, 1, {
      type: "auction",
      action: {
        type: "bid",
        bid: { type: "contract", level: 9, trump: "hearts" },
      },
    });
    expect(state.auction.highestBid).toEqual({
      type: "contract",
      level: 9,
      trump: "hearts",
    });

    expect(gameView(state, 2).allowedActions).toContainEqual({
      type: "auction",
      action: {
        type: "bid",
        bid: { type: "contract", level: 10, trump: "spades" },
      },
    });
    state = act(state, 2, { type: "auction", action: { type: "pass" } });
    expect(gameView(state, 0).allowedActions).toEqual([
      { type: "auction", action: { type: "pass" } },
    ]);
    const anotherBid = applyGameAction(state, 0, {
      type: "auction",
      action: {
        type: "bid",
        bid: { type: "contract", level: 10, trump: "clubs" },
      },
    });
    expect(anotherBid.accepted).toBe(false);
    expect(anotherBid.reason).toBe("onlyPass");
    expect(anotherBid.state).toBe(state);
    state = act(state, 0, { type: "auction", action: { type: "pass" } });
    expect(state.auction.active).toEqual([false, true, false]);
    expect(state.auction.result).toEqual({
      type: "contract",
      declarer: 1,
      level: 9,
      trump: "hearts",
    });
  });

  test("a player who passed once leaves the auction and can still whist", () => {
    let state = createGame({ ...settings, bulletTarget: 10 }, 3);
    state = act(state, 0, {
      type: "auction",
      action: { type: "pass" },
    });
    expect(state.auction.active).toEqual([false, true, true]);
    expect(gameView(state, 0).allowedActions).toEqual([]);

    state = act(state, 1, {
      type: "auction",
      action: {
        type: "bid",
        bid: { type: "contract", level: 6, trump: "hearts" },
      },
    });
    state = act(state, 2, {
      type: "auction",
      action: { type: "pass" },
    });
    expect(state.auction.result).toEqual({
      type: "contract",
      declarer: 1,
      level: 6,
      trump: "hearts",
    });
    expect(state.phase).toBe("discard");

    const discard = gameView(state, 1).allowedActions.find(
      (action) => action.type === "discard",
    );
    expect(discard).toBeDefined();
    state = act(state, 1, discard!);
    expect(state.phase).toBe("order");
    expect(gameView(state, 2).allowedActions).toEqual([]);
    state = confirmOrder(state);
    expect(state.phase).toBe("defense");
    expect(state.defense?.turn).toBe(2);
    expect(gameView(state, 2).allowedActions).toEqual([
      { type: "defense", action: { type: "pass" } },
      { type: "defense", action: { type: "whist" } },
    ]);

    state = act(state, 2, {
      type: "defense",
      action: { type: "pass" },
    });
    expect(gameView(state, 0).allowedActions).toContainEqual({
      type: "defense",
      action: { type: "whist" },
    });
  });

  test("after the discard the declarer may order any game at least as high", () => {
    let state = createGame({ ...settings, bulletTarget: 10 }, 7);
    state = act(state, 0, {
      type: "auction",
      action: {
        type: "bid",
        bid: { type: "contract", level: 6, trump: "hearts" },
      },
    });
    state = act(state, 1, { type: "auction", action: { type: "pass" } });
    state = act(state, 2, { type: "auction", action: { type: "pass" } });
    const discard = gameView(state, 0).allowedActions.find(
      (action) => action.type === "discard",
    );
    state = act(state, 0, discard!);
    expect(state.phase).toBe("order");
    expect(gameView(state, 1).allowedActions).toEqual([]);

    const tooLow = applyGameAction(state, 0, {
      type: "order",
      bid: { type: "contract", level: 6, trump: "spades" },
    });
    expect(tooLow.accepted).toBe(false);
    expect(tooLow.reason).toBe("bidNotHigher");
    expect(tooLow.state).toBe(state);
    const misere = applyGameAction(state, 0, {
      type: "order",
      bid: { type: "misere" },
    });
    expect(misere.accepted).toBe(false);
    expect(misere.state).toBe(state);
    const stranger = applyGameAction(state, 1, {
      type: "order",
      bid: { type: "contract", level: 7, trump: "clubs" },
    });
    expect(stranger.accepted).toBe(false);
    expect(stranger.reason).toBe("notYourTurn");

    state = act(state, 0, {
      type: "order",
      bid: { type: "contract", level: 7, trump: "clubs" },
    });
    expect(state.phase).toBe("defense");
    expect(state.auctionResult).toEqual({
      type: "contract",
      declarer: 0,
      level: 7,
      trump: "clubs",
    });
    expect(state.defense?.turn).toBe(1);

    let misereDeal = createGame({ ...settings, bulletTarget: 10 }, 4);
    misereDeal = act(misereDeal, 0, {
      type: "auction",
      action: { type: "bid", bid: { type: "misere" } },
    });
    misereDeal = act(misereDeal, 1, {
      type: "auction",
      action: { type: "pass" },
    });
    misereDeal = act(misereDeal, 2, {
      type: "auction",
      action: { type: "pass" },
    });
    const misereDiscard = gameView(misereDeal, 0).allowedActions.find(
      (action) => action.type === "discard",
    );
    misereDeal = act(misereDeal, 0, misereDiscard!);
    const six = applyGameAction(misereDeal, 0, {
      type: "order",
      bid: { type: "contract", level: 6, trump: "spades" },
    });
    expect(six.accepted).toBe(false);
    expect(six.state).toBe(misereDeal);
    expect(gameView(misereDeal, 0).allowedActions).toEqual([
      { type: "order", bid: { type: "misere" } },
    ]);
    const nine = applyGameAction(misereDeal, 0, {
      type: "order",
      bid: { type: "contract", level: 9, trump: "diamonds" },
    });
    expect(nine.accepted).toBe(false);
    expect(nine.state).toBe(misereDeal);
    const announced = act(misereDeal, 0, {
      type: "order",
      bid: { type: "misere" },
    });
    expect(announced.phase).toBe("order");
    expect(announced.play).toBeNull();
    const stayed = act(announced, 0, {
      type: "order",
      bid: { type: "misere" },
    });
    expect(stayed.phase).toBe("play");
    expect(stayed.play?.trump).toBeNull();
  });

  test("misere shows the declarer until the second call, then the defenders play their own cards", () => {
    const card = (suit: Suit, rank: Card["rank"]): Card => ({ suit, rank });
    const talon = [card("spades", 7), card("spades", 8)] as const;
    const declarer = [card("hearts", 9), card("clubs", 9)] as const;
    const left = [card("diamonds", 8), card("clubs", 10)] as const;
    const right = [card("clubs", 7), card("diamonds", 7)] as const;
    let state: GameState = {
      settings: { ...settings, bulletTarget: 10 },
      phase: "auction",
      seed: 1,
      dealNumber: 0,
      raspasIndex: 0,
      score: createBulletScore(),
      dealtCards: { hands: [declarer, left, right], talon },
      auction: createAuction(0),
      auctionResult: null,
      talon: null,
      defense: null,
      play: null,
    };
    state = act(state, 0, {
      type: "auction",
      action: { type: "bid", bid: { type: "misere" } },
    });
    state = act(state, 1, { type: "auction", action: { type: "pass" } });
    state = act(state, 2, { type: "auction", action: { type: "pass" } });

    const opened = [...declarer, ...talon];
    expect(state.phase).toBe("discard");
    expect(gameView(state, 1).shownHands[0]).toEqual(opened);
    expect(gameView(state, 1).shownHands[1]).toBeNull();
    expect(gameView(state, 1).shownHands[2]).toBeNull();
    expect(gameView(state, 0).shownHands).toEqual([null, null, null]);
    expect(JSON.stringify(gameView(state, 1).hand)).not.toContain("hearts");
    expect(JSON.stringify(gameView(state, 1).shownHands[2])).toBe("null");

    state = act(state, 0, { type: "discard", cards: [...talon] });
    expect(gameView(state, 2).shownHands[0]).toEqual([...declarer]);
    expect(gameView(state, 2).discarded).toEqual([...talon]);
    expect(gameView(state, 0).shownHands[1]).toBeNull();

    state = act(state, 0, { type: "order", bid: { type: "misere" } });
    expect(state.phase).toBe("order");
    expect(gameView(state, 1).shownHands[0]).toEqual([...declarer]);
    const early = applyGameAction(state, 1, {
      type: "order",
      bid: { type: "misere" },
    });
    expect(early.accepted).toBe(false);
    expect(early.state).toBe(state);

    state = act(state, 0, { type: "order", bid: { type: "misere" } });
    expect(state.phase).toBe("play");
    expect(gameView(state, 1).shownHands[0]).toBeNull();
    expect(JSON.stringify(gameView(state, 1))).not.toContain("hearts");
    expect(gameView(state, 0).shownHands[1]).toEqual([...left]);
    expect(gameView(state, 0).shownHands[2]).toEqual([...right]);
    expect(gameView(state, 1).shownHands[2]).toEqual([...right]);
    expect(gameView(state, 1).shownHands[1]).toBeNull();
    expect(gameView(state, 2).shownHands[1]).toEqual([...left]);

    state = act(state, 0, { type: "playCard", card: card("hearts", 9) });
    const borrowed = applyGameAction(state, 1, {
      type: "playCard",
      card: card("clubs", 7),
    });
    expect(borrowed.accepted).toBe(false);
    expect(borrowed.state).toBe(state);
    state = act(state, 1, { type: "playCard", card: card("diamonds", 8) });
    expect(state.play?.currentTrick).toEqual([
      { seat: 0, card: card("hearts", 9) },
      { seat: 1, card: card("diamonds", 8) },
    ]);
    expect(gameView(state, 2).allowedActions).toEqual([
      { type: "playCard", card: card("clubs", 7) },
      { type: "playCard", card: card("diamonds", 7) },
    ]);
  });

  test("two passes record the ordered game and do not play", () => {
    let state = createGame(
      { ...settings, bulletTarget: 10 },
      7,
      createBulletScore(),
      2,
    );
    state = act(state, 0, {
      type: "auction",
      action: {
        type: "bid",
        bid: { type: "contract", level: 6, trump: "hearts" },
      },
    });
    state = act(state, 1, { type: "auction", action: { type: "pass" } });
    state = act(state, 2, { type: "auction", action: { type: "pass" } });
    const discard = gameView(state, 0).allowedActions.find(
      (action) => action.type === "discard",
    );
    state = act(state, 0, discard!);
    state = act(state, 0, {
      type: "order",
      bid: { type: "contract", level: 7, trump: "clubs" },
    });
    state = act(state, 1, { type: "defense", action: { type: "pass" } });
    state = act(state, 2, { type: "defense", action: { type: "pass" } });

    expect(state.phase).toBe("auction");
    expect(state.play).toBeNull();
    expect(state.dealNumber).toBe(1);
    expect(gameView(state, 0).speech).toEqual([]);
    expect(
      gameView(state, 0).speechLog.map((entry) => ({
        deal: entry.deal,
        words: entry.lines.map((line) => line.word),
      })),
    ).toEqual([
      {
        deal: 1,
        words: ["6 червей", "пас", "пас", "7 треф", "пас", "пас"],
      },
    ]);
    expect(state.score.bullet).toEqual([4, 0, 0]);
    expect(state.score.mountain).toEqual([0, 0, 0]);
    expect(state.score.whists).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(state.raspasIndex).toBe(0);
  });

  test("leaving without three writes three undertricks and no whists", () => {
    let state = createGame({ ...settings, bulletTarget: 10 }, 7, createBulletScore(), 2);
    state = act(state, 0, {
      type: "auction",
      action: {
        type: "bid",
        bid: { type: "contract", level: 6, trump: "hearts" },
      },
    });
    state = act(state, 1, { type: "auction", action: { type: "pass" } });
    state = act(state, 2, { type: "auction", action: { type: "pass" } });
    const discard = gameView(state, 0).allowedActions.find(
      (action) => action.type === "discard",
    );
    state = act(state, 0, discard!);
    expect(gameView(state, 0).allowedActions).toContainEqual({
      type: "withoutThree",
    });
    state = act(state, 0, { type: "withoutThree" });

    expect(state.phase).toBe("auction");
    expect(state.play).toBeNull();
    expect(state.score.bullet).toEqual([0, 0, 0]);
    expect(state.score.mountain).toEqual([6, 0, 0]);
    expect(state.score.whists).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(state.raspasIndex).toBe(2);
    expect(state.lastLayout?.hands[0]).toHaveLength(10);
    expect(state.lastLayout?.tricks).toEqual([0, 0, 0]);
    expect(state.lastLayout?.discarded).toHaveLength(2);
    expect(gameView(state, 1).lastLayout?.hands[0]).toHaveLength(10);
  });

  test("raspas talon only sets the suit and the third lead returns", () => {
    const card = (suit: Suit, rank: Card["rank"]): Card => ({ suit, rank });
    const state: GameState = {
      settings: { ...settings, bulletTarget: 10 },
      phase: "auction",
      seed: 1,
      dealNumber: 0,
      raspasIndex: 0,
      score: createBulletScore(),
      dealtCards: {
        hands: [
          [card("spades", 8), card("clubs", 8), card("diamonds", 8)],
          [card("spades", 14), card("hearts", 8), card("clubs", 9)],
          [card("spades", 9), card("hearts", 14), card("diamonds", 9)],
        ],
        talon: [card("spades", 7), card("hearts", 7)],
      },
      auction: createAuction(0),
      auctionResult: null,
      talon: null,
      defense: null,
      play: null,
    };
    let raspas = act(state, 0, {
      type: "auction",
      action: { type: "pass" },
    });
    raspas = act(raspas, 1, { type: "auction", action: { type: "pass" } });
    raspas = act(raspas, 2, { type: "auction", action: { type: "pass" } });
    expect(gameView(raspas, 0).prikup).toEqual([
      { faceDown: true },
      { faceDown: true },
    ]);
    raspas = act(raspas, 2, { type: "openTalon", index: 1 });
    expect(raspas.play?.turn).toBe(0);
    expect(raspas.play?.forcedSuit).toBe("hearts");
    expect(gameView(raspas, 1).currentTrick).toEqual([]);
    expect(gameView(raspas, 1).prikup[0]).toEqual(card("hearts", 7));
    expect(gameView(raspas, 1).prikup[1]).toEqual({ faceDown: true });

    raspas = act(raspas, 0, { type: "playCard", card: card("clubs", 8) });
    const offSuit = applyGameAction(raspas, 1, {
      type: "playCard",
      card: card("spades", 14),
    });
    expect(offSuit.accepted).toBe(false);
    expect(offSuit.reason).toBe("mustFollowSuit");
    raspas = act(raspas, 1, { type: "playCard", card: card("hearts", 8) });
    raspas = act(raspas, 2, { type: "playCard", card: card("hearts", 14) });
    expect(raspas.play?.tricksWon).toEqual([0, 0, 1]);
    expect(raspas.play?.currentTrick).toEqual([]);
    expect(raspas.play?.turn).toBe(2);
    expect(raspas.play?.forcedSuit).toBe("spades");
    expect(gameView(raspas, 0).prikup).toEqual([card("spades", 7)]);
    expect(gameView(raspas, 1).prikup).toEqual([card("spades", 7)]);
    expect(raspas.play?.trickHistory[0]).not.toHaveProperty("talonCard");
    expect(gameView(raspas, 0).trickHistory).toEqual([
      {
        winner: 2,
        talonCard: card("hearts", 7),
        cards: [
          { seat: 0, card: card("clubs", 8) },
          { seat: 1, card: card("hearts", 8) },
          { seat: 2, card: card("hearts", 14) },
        ],
      },
    ]);

    raspas = act(raspas, 2, { type: "playCard", card: card("spades", 9) });
    raspas = act(raspas, 0, { type: "playCard", card: card("spades", 8) });
    raspas = act(raspas, 1, { type: "playCard", card: card("spades", 14) });
    expect(raspas.play?.tricksWon).toEqual([0, 1, 1]);
    expect(raspas.play?.turn).toBe(0);
    expect(raspas.play?.forcedSuit ?? null).toBeNull();
    expect(gameView(raspas, 0).prikup).toEqual([]);
    expect(gameView(raspas, 2).prikup).toEqual([]);
    expect(gameView(raspas, 1).trickHistory[1]).toEqual({
      winner: 1,
      talonCard: card("spades", 7),
      cards: [
        { seat: 2, card: card("spades", 9) },
        { seat: 0, card: card("spades", 8) },
        { seat: 1, card: card("spades", 14) },
      ],
    });

    raspas = act(raspas, 0, { type: "playCard", card: card("diamonds", 8) });
    raspas = act(raspas, 1, { type: "playCard", card: card("clubs", 9) });
    raspas = act(raspas, 2, { type: "playCard", card: card("diamonds", 9) });
    expect(gameView(raspas, 2).trickHistory[2]).toEqual({
      winner: 2,
      cards: [
        { seat: 0, card: card("diamonds", 8) },
        { seat: 1, card: card("clubs", 9) },
        { seat: 2, card: card("diamonds", 9) },
      ],
    });
    expect(gameView(raspas, 0).trickHistory[0]?.talonCard).toEqual(
      card("hearts", 7),
    );
    expect(gameView(raspas, 0).trickHistory[1]?.talonCard).toEqual(
      card("spades", 7),
    );
  });

  test("pass, half-whist and pass scores the contract without a play", () => {
    let state = orderedContract(6, 1);
    expect(gameView(state, 1).allowedActions).toEqual([
      { type: "defense", action: { type: "pass" } },
      { type: "defense", action: { type: "whist" } },
    ]);
    const firstHalf = applyGameAction(state, 1, {
      type: "defense",
      action: { type: "halfWhist" },
    });
    expect(firstHalf.accepted).toBe(false);
    expect(firstHalf.state).toBe(state);

    state = act(state, 1, { type: "defense", action: { type: "pass" } });
    expect(gameView(state, 2).allowedActions).toContainEqual({
      type: "defense",
      action: { type: "halfWhist" },
    });
    const stranger = applyGameAction(state, 0, {
      type: "defense",
      action: { type: "halfWhist" },
    });
    expect(stranger.accepted).toBe(false);
    expect(stranger.state).toBe(state);

    state = act(state, 2, {
      type: "defense",
      action: { type: "halfWhist" },
    });
    expect(state.phase).toBe("defense");
    expect(gameView(state, 1).allowedActions).toEqual([
      { type: "defense", action: { type: "pass" } },
      { type: "defense", action: { type: "whist" } },
    ]);
    expect(gameView(state, 2).allowedActions).toEqual([]);

    state = act(state, 1, { type: "defense", action: { type: "pass" } });
    expect(state.phase).toBe("auction");
    expect(state.raspasIndex).toBe(0);
    expect(state.score.bullet).toEqual([2, 0, 0]);
    expect(state.score.whists[2][0]).toBe(4);
    expect(state.score.mountain).toEqual([0, 0, 0]);
    expect(state.deals?.[0]?.contract).toBe("6 пик");
    expect(state.deals?.[0]?.tricks).toEqual([0, 0, 0]);

    let seven = orderedContract(7);
    seven = act(seven, 1, { type: "defense", action: { type: "pass" } });
    seven = act(seven, 2, {
      type: "defense",
      action: { type: "halfWhist" },
    });
    seven = act(seven, 1, { type: "defense", action: { type: "pass" } });
    expect(seven.score.bullet).toEqual([4, 0, 0]);
    expect(seven.score.whists[2][0]).toBe(4);
    expect(seven.score.mountain).toEqual([0, 0, 0]);
  });

  test("pass, half-whist and whist returns a normal single whist", () => {
    const card = (suit: Suit, rank: Card["rank"]): Card => ({ suit, rank });
    let state = orderedContract(6);
    state = act(state, 1, { type: "defense", action: { type: "pass" } });
    state = act(state, 2, {
      type: "defense",
      action: { type: "halfWhist" },
    });
    state = act(state, 1, { type: "defense", action: { type: "whist" } });

    expect(state.defense?.halfWhist).toBeNull();
    expect(state.defense?.whistlers).toEqual([1]);
    expect(state.defense?.decisions[2]).toBe("pass");
    expect(state.phase).toBe("play");
    expect(state.defense?.phase).toBe("style");
    expect(gameView(state, 2).allowedActions).toEqual([]);

    state = act(state, 0, {
      type: "playCard",
      card: card("spades", 14),
    });
    expect(gameView(state, 1).allowedActions).toEqual([
      { type: "defense", action: { type: "light" } },
      { type: "defense", action: { type: "dark" } },
    ]);
    state = act(state, 1, {
      type: "defense",
      action: { type: "light" },
    });
    expect(gameView(state, 1).shownHands[2]).toEqual([
      card("spades", 13),
      card("clubs", 10),
    ]);
    const passer = applyGameAction(state, 2, {
      type: "playCard",
      card: card("spades", 13),
    });
    expect(passer.accepted).toBe(false);
    expect(passer.state).toBe(state);
    state = act(state, 1, {
      type: "playCard",
      card: card("hearts", 7),
    });
    expect(state.play?.currentTrick[1]).toEqual({
      seat: 1,
      card: card("hearts", 7),
    });
  });

  test("an eight offers no half-whist", () => {
    let state = orderedContract(8);
    state = act(state, 1, { type: "defense", action: { type: "pass" } });
    expect(gameView(state, 2).allowedActions).toEqual([
      { type: "defense", action: { type: "pass" } },
      { type: "defense", action: { type: "whist" } },
    ]);
    const half = applyGameAction(state, 2, {
      type: "defense",
      action: { type: "halfWhist" },
    });
    expect(half.accepted).toBe(false);
    expect(half.reason).toBe("invalidDeclaration");
    expect(half.state).toBe(state);
  });

  test("speech keeps the current step in bubbles and earlier calls in order", () => {
    const room = { ...settings, bulletTarget: 10 };
    let state = createGame(room, 1);
    expect(gameView(state, 0).speech).toEqual([]);
    expect(currentWords(state)).toEqual({});

    state = act(state, 0, {
      type: "auction",
      action: {
        type: "bid",
        bid: { type: "contract", level: 6, trump: "spades" },
      },
    });
    expect(currentWords(state)).toEqual({ 0: "6 пик" });

    state = act(state, 1, { type: "auction", action: { type: "pass" } });
    expect(currentWords(state)).toEqual({ 0: "6 пик", 1: "пас" });

    state = act(state, 2, {
      type: "auction",
      action: {
        type: "bid",
        bid: { type: "contract", level: 6, trump: "clubs" },
      },
    });
    expect(currentWords(state)).toEqual({ 2: "6 треф" });
    expect(currentWords(state)).not.toHaveProperty("0");

    state = act(state, 0, { type: "auction", action: { type: "pass" } });
    expect(state.phase).toBe("discard");
    expect(currentWords(state)).toEqual({});
    const declarer = state.auctionResult?.type === "contract"
      ? state.auctionResult.declarer
      : null;
    expect(declarer).toBe(2);
    const discard = gameView(state, 2).allowedActions.find(
      (action) => action.type === "discard",
    );
    expect(discard?.type).toBe("discard");
    if (discard?.type !== "discard") {
      return;
    }
    state = act(state, 2, discard);
    state = act(state, 2, {
      type: "order",
      bid: { type: "contract", level: 6, trump: "clubs" },
    });
    expect(state.phase).toBe("defense");
    expect(currentWords(state)).toEqual({});
    expect(gameView(state, 0).speech.map((item) => item.word)).toEqual([
      "6 пик",
      "пас",
      "6 треф",
      "пас",
      "6 треф",
    ]);

    state = act(state, 0, { type: "defense", action: { type: "whist" } });
    state = act(state, 1, { type: "defense", action: { type: "pass" } });
    expect(currentWords(state)).toEqual({ 0: "вист", 1: "пас" });
    expect(Object.values(currentWords(state))).not.toContain("6 пик");
    expect(Object.values(currentWords(state))).not.toContain("6 треф");
    expect(state.score.bullet).toEqual([0, 0, 0]);
    expect(state.score.mountain).toEqual([0, 0, 0]);
  });

  test("a single whistler can accept the declarer's proposal and write the deal", () => {
    const card = (suit: Suit, rank: Card["rank"]): Card => ({ suit, rank });
    let state = orderedContract(6);
    state = act(state, 1, { type: "defense", action: { type: "pass" } });
    state = act(state, 2, { type: "defense", action: { type: "whist" } });
    expect(state.phase).toBe("play");
    expect(gameView(state, 0).allowedActions).toEqual([
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((tricks) => ({
        type: "propose" as const,
        tricks,
      })),
      { type: "playCard", card: card("spades", 14) },
      { type: "playCard", card: card("clubs", 9) },
    ]);
    expect(
      gameView(state, 1).allowedActions.some(
        (action) => action.type === "propose",
      ),
    ).toBe(false);

    const low = applyGameAction(state, 0, { type: "propose", tricks: 0 });
    expect(low.accepted).toBe(false);
    expect(low.reason).toBe("invalidProposal");
    const stranger = applyGameAction(state, 2, { type: "propose", tricks: 6 });
    expect(stranger.accepted).toBe(false);
    expect(stranger.reason).toBe("notYourTurn");

    state = act(state, 0, { type: "propose", tricks: 6 });
    expect(currentWords(state)).toEqual({ 0: "6 запишем?" });
    expect(gameView(state, 1).shownHands[0]).toEqual([
      card("spades", 14),
      card("clubs", 9),
    ]);
    expect(gameView(state, 2).shownHands[0]).toEqual([
      card("spades", 14),
      card("clubs", 9),
    ]);
    expect(gameView(state, 0).shownHands[0]).toBeNull();
    expect(gameView(state, 1).allowedActions).toEqual([
      { type: "proposal", answer: "agree" },
      { type: "proposal", answer: "decline" },
    ]);
    expect(gameView(state, 0).allowedActions).toEqual([]);
    const during = applyGameAction(state, 0, {
      type: "playCard",
      card: card("spades", 14),
    });
    expect(during.accepted).toBe(false);
    expect(during.reason).toBe("invalidPhase");

    state = act(state, 1, { type: "proposal", answer: "agree" });
    expect(currentWords(state)).toEqual({ 0: "6 запишем?", 1: "согласен" });
    expect(gameView(state, 1).allowedActions).toEqual([]);
    expect(state.phase).toBe("play");

    const repeat = applyGameAction(state, 1, {
      type: "proposal",
      answer: "decline",
    });
    expect(repeat.accepted).toBe(false);

    state = act(state, 2, { type: "proposal", answer: "agree" });
    expect(state.phase).toBe("auction");
    expect(state.deals?.[0]?.tricks).toEqual([6, 0, 4]);
    expect(state.deals?.[0]?.contract).toBe("6 пик");
    expect(state.score.bullet).toEqual([2, 0, 0]);
    expect(state.score.whists[2][0]).toBe(8);
    expect(state.score.whists[1][0]).toBe(0);
    expect(state.score.mountain).toEqual([0, 0, 0]);
    expect(state.speechLog?.[0]?.lines.map((line) => line.word)).toEqual(
      expect.arrayContaining(["6 запишем?", "согласен", "согласен"]),
    );
  });

  test("a refused proposal returns to the play and a short bid writes mountain and whists", () => {
    const card = (suit: Suit, rank: Card["rank"]): Card => ({ suit, rank });
    let state = orderedContract(6);
    state = act(state, 1, { type: "defense", action: { type: "whist" } });
    state = act(state, 2, { type: "defense", action: { type: "whist" } });
    const both = applyGameAction(state, 0, { type: "propose", tricks: 6 });
    expect(both.accepted).toBe(false);
    expect(both.reason).toBe("invalidPhase");
    expect(
      gameView(state, 0).allowedActions.some(
        (action) => action.type === "propose",
      ),
    ).toBe(false);

    state = orderedContract(6);
    state = act(state, 1, { type: "defense", action: { type: "pass" } });
    state = act(state, 2, { type: "defense", action: { type: "whist" } });
    state = {
      ...state,
      play:
        state.play === null
          ? null
          : { ...state.play, tricksWon: [3, 0, 1] },
    };
    expect(
      gameView(state, 0).allowedActions.flatMap((action) =>
        action.type === "propose" ? [action.tricks] : [],
      ),
    ).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    const early = applyGameAction(state, 0, { type: "propose", tricks: 2 });
    expect(early.accepted).toBe(false);
    expect(early.reason).toBe("invalidProposal");

    state = act(state, 0, { type: "propose", tricks: 4 });
    expect(currentWords(state)).toEqual({ 0: "4 запишем?" });
    state = act(state, 2, { type: "proposal", answer: "decline" });
    expect(state.phase).toBe("play");
    expect(state.proposal ?? null).toBeNull();
    expect(currentWords(state)).toEqual({ 2: "не согласен" });
    expect(gameView(state, 1).shownHands[0]).toBeNull();
    expect(gameView(state, 0).speech.map((line) => line.word)).toContain(
      "4 запишем?",
    );
    expect(
      gameView(state, 0).allowedActions.some(
        (action) => action.type === "playCard",
      ),
    ).toBe(true);

    state = act(state, 0, { type: "propose", tricks: 4 });
    state = act(state, 1, { type: "proposal", answer: "agree" });
    state = act(state, 2, { type: "proposal", answer: "agree" });
    expect(state.deals?.[0]?.tricks).toEqual([4, 0, 6]);
    expect(state.score.bullet).toEqual([0, 0, 0]);
    expect(state.score.mountain[0]).toBe(4);
    expect(state.score.whists[2][0]).toBe(16);
    expect(state.score.whists[1][0]).toBe(4);
    expect(state.score.mountain[2]).toBe(0);
  });

  test("three passes stay on one step and the log ends with raspas", () => {
    let state = createGame({ ...settings, bulletTarget: 10 }, 4);
    for (const seat of [0, 1, 2] as const) {
      state = act(state, seat, { type: "auction", action: { type: "pass" } });
    }
    expect(state.phase).toBe("raspas");
    const view = gameView(state, 1);
    expect(view.speech).toEqual([
      { seat: 0, word: "пас", step: 1 },
      { seat: 1, word: "пас", step: 1 },
      { seat: 2, word: "пас", step: 1 },
      { seat: null, word: "распасы", step: 1 },
    ]);
    expect(currentWords(state)).toEqual({ 0: "пас", 1: "пас", 2: "пас" });
  });
});

function currentWords(state: GameState): Record<number, string> {
  const view = gameView(state, 0);
  const words: Record<number, string> = {};
  for (const item of view.speech) {
    if (item.step === view.speechStep && item.seat !== null) {
      words[item.seat] = item.word;
    }
  }
  return words;
}
