import { describe, expect, test } from "vitest";

import {
  applyAuctionAction,
  bidRank,
  createAuction,
  type AuctionState,
  type Bid,
  type Seat,
} from "./auction.js";

const sixSpades: Bid = {
  type: "contract",
  level: 6,
  trump: "spades",
};
const sixClubs: Bid = {
  type: "contract",
  level: 6,
  trump: "clubs",
};

function act(
  state: AuctionState,
  seat: Seat,
  action: Parameters<typeof applyAuctionAction>[2],
): AuctionState {
  const transition = applyAuctionAction(state, seat, action);
  expect(transition.accepted).toBe(true);
  return transition.state;
}

describe("auction", () => {
  test("moves clockwise and skips seats that passed after a bid", () => {
    let state = createAuction(0);
    state = act(state, 0, { type: "bid", bid: sixSpades });
    state = act(state, 1, { type: "pass" });
    expect(state.turn).toBe(2);
    expect(state.active).toEqual([true, false, true]);

    state = act(state, 2, { type: "bid", bid: sixClubs });
    expect(state.turn).toBe(0);
    expect(state.result).toBeNull();
  });

  test("a single pass leaves the rest of the auction", () => {
    let state = createAuction(0);
    state = act(state, 0, { type: "pass" });
    expect(state.active).toEqual([false, true, true]);
    expect(state.turn).toBe(1);
    expect(state.result).toBeNull();

    state = act(state, 1, { type: "bid", bid: sixSpades });
    expect(state.turn).toBe(2);
    const rejoined = applyAuctionAction(state, 0, {
      type: "bid",
      bid: sixClubs,
    });
    expect(rejoined).toMatchObject({
      accepted: false,
      reason: "notYourTurn",
    });
    expect(rejoined.state).toBe(state);

    state = act(state, 2, { type: "pass" });
    expect(state.result).toEqual({
      type: "contract",
      declarer: 1,
      level: 6,
      trump: "spades",
    });
    expect(state.active).toEqual([false, true, false]);
  });

  test("keeps trading for as many raises as players want until they pass", () => {
    let state = createAuction(0);
    state = act(state, 0, { type: "bid", bid: sixSpades });
    state = act(state, 1, { type: "bid", bid: sixClubs });
    state = act(state, 2, {
      type: "bid",
      bid: { type: "contract", level: 6, trump: "diamonds" },
    });
    state = act(state, 0, {
      type: "bid",
      bid: { type: "contract", level: 7, trump: "hearts" },
    });
    state = act(state, 1, {
      type: "bid",
      bid: { type: "contract", level: 7, trump: "noTrump" },
    });
    state = act(state, 2, { type: "pass" });
    state = act(state, 0, {
      type: "bid",
      bid: { type: "contract", level: 8, trump: "spades" },
    });
    expect(state.result).toBeNull();
    expect(state.turn).toBe(1);

    state = act(state, 1, { type: "pass" });
    expect(state.result).toEqual({
      type: "contract",
      declarer: 0,
      level: 8,
      trump: "spades",
    });
  });

  test("rejects a bid that is not strictly higher without changing state", () => {
    let state = createAuction(0);
    state = act(state, 0, { type: "bid", bid: sixClubs });

    const transition = applyAuctionAction(state, 1, {
      type: "bid",
      bid: sixClubs,
    });

    expect(transition).toMatchObject({
      accepted: false,
      reason: "bidNotHigher",
    });
    expect(transition.state).toBe(state);
  });

  test("ends in raspas when everyone passes before a bid", () => {
    let state = createAuction(0);
    state = act(state, 0, { type: "pass" });
    state = act(state, 1, { type: "pass" });
    state = act(state, 2, { type: "pass" });

    expect(state.result).toEqual({ type: "raspas" });
    expect(state.turn).toBeNull();
  });

  test("only a nine or higher overtakes misere", () => {
    expect(bidRank({ type: "misere" })).toBeGreaterThan(
      bidRank({ type: "contract", level: 8, trump: "noTrump" }),
    );
    expect(bidRank({ type: "misere" })).toBeLessThan(
      bidRank({ type: "contract", level: 9, trump: "spades" }),
    );

    const state = act(createAuction(0), 0, {
      type: "bid",
      bid: { type: "misere" },
    });
    for (const level of [6, 7, 8] as const) {
      const low = applyAuctionAction(state, 1, {
        type: "bid",
        bid: { type: "contract", level, trump: "spades" },
      });
      expect(low).toMatchObject({
        accepted: false,
        reason: "bidNotHigher",
      });
      expect(low.state).toBe(state);
    }

    const nine = applyAuctionAction(state, 1, {
      type: "bid",
      bid: { type: "contract", level: 9, trump: "hearts" },
    });
    expect(nine.accepted).toBe(true);
    if (nine.accepted) {
      expect(nine.state.highestBid).toEqual({
        type: "contract",
        level: 9,
        trump: "hearts",
      });
    }
  });

  test("another player can call misere over a six, seven or eight", () => {
    for (const level of [6, 7, 8] as const) {
      const state = act(createAuction(0), 0, {
        type: "bid",
        bid: { type: "contract", level, trump: "hearts" },
      });
      const misere = applyAuctionAction(state, 1, {
        type: "bid",
        bid: { type: "misere" },
      });
      expect(misere.accepted).toBe(true);
      if (misere.accepted) {
        expect(misere.state.highestBid).toEqual({ type: "misere" });
        expect(misere.state.misereBidder).toBe(1);
      }
    }
  });

  test("misere does not overcall a nine or a ten", () => {
    for (const level of [9, 10] as const) {
      const state = act(createAuction(0), 0, {
        type: "bid",
        bid: { type: "contract", level, trump: "spades" },
      });
      const misere = applyAuctionAction(state, 1, {
        type: "bid",
        bid: { type: "misere" },
      });
      expect(misere).toMatchObject({
        accepted: false,
        reason: "bidNotHigher",
      });
      expect(misere.state).toBe(state);
    }
  });

  test("a player who already bid a contract cannot call misere", () => {
    let state = act(createAuction(0), 0, {
      type: "bid",
      bid: sixSpades,
    });
    state = act(state, 1, {
      type: "bid",
      bid: { type: "contract", level: 7, trump: "spades" },
    });
    state = act(state, 2, { type: "pass" });

    const ownMisere = applyAuctionAction(state, 0, {
      type: "bid",
      bid: { type: "misere" },
    });
    expect(ownMisere).toMatchObject({
      accepted: false,
      reason: "bidNotHigher",
    });
    expect(ownMisere.state).toBe(state);

    state = act(state, 0, {
      type: "bid",
      bid: { type: "contract", level: 8, trump: "spades" },
    });
    expect(state.highestBid).toEqual({
      type: "contract",
      level: 8,
      trump: "spades",
    });
    expect(state.turn).toBe(1);
  });

  test("finishes with the contract, trump and declarer", () => {
    let state = createAuction(0);
    state = act(state, 0, { type: "bid", bid: sixSpades });
    state = act(state, 1, { type: "pass" });
    state = act(state, 2, { type: "pass" });

    expect(state.result).toEqual({
      type: "contract",
      declarer: 0,
      level: 6,
      trump: "spades",
    });
  });

  test("the misere bidder can only pass after a nine overtakes it", () => {
    let state = act(createAuction(0), 0, {
      type: "bid",
      bid: { type: "misere" },
    });
    state = act(state, 1, {
      type: "bid",
      bid: { type: "contract", level: 9, trump: "spades" },
    });
    state = act(state, 2, { type: "pass" });

    const raised = applyAuctionAction(state, 0, {
      type: "bid",
      bid: { type: "contract", level: 10, trump: "hearts" },
    });
    expect(raised).toMatchObject({
      accepted: false,
      reason: "onlyPass",
    });
    expect(raised.state).toBe(state);

    state = act(state, 0, { type: "pass" });
    expect(state.active).toEqual([false, true, false]);
    expect(state.result).toEqual({
      type: "contract",
      declarer: 1,
      level: 9,
      trump: "spades",
    });
  });

  test("finishes with misere and its declarer", () => {
    let state = createAuction(1);
    state = act(state, 1, { type: "bid", bid: { type: "misere" } });
    state = act(state, 2, { type: "pass" });
    state = act(state, 0, { type: "pass" });

    expect(state.result).toEqual({ type: "misere", declarer: 1 });
  });
});
