import { describe, expect, test } from "vitest";

import { createTrickPlay, playCard } from "./tricks.js";
import { view } from "./view.js";

const hands = [
  [{ suit: "spades", rank: 7 }],
  [{ suit: "hearts", rank: 8 }],
  [{ suit: "diamonds", rank: 9 }],
] as const;

describe("seat view", () => {
  test("contains only the requesting seat's hand", () => {
    const snapshot = view(createTrickPlay(hands, 0, "noTrump"), 1);

    expect(snapshot.hand).toEqual(hands[1]);
    expect(snapshot).not.toHaveProperty("hands");
  });

  test("shows a card to every seat as soon as it is played", () => {
    let state = createTrickPlay(hands, 0, "noTrump");
    state = playCard(state, 0, hands[0][0]).state;

    const played = {
      seat: 0 as const,
      card: hands[0][0],
    };
    expect(view(state, 0).currentTrick[0]).toEqual(played);
    expect(view(state, 1).currentTrick[0]).toEqual(played);
    expect(view(state, 2).currentTrick[0]).toEqual(played);
    expect(JSON.stringify(view(state, 1))).toContain("spades");

    state = playCard(state, 1, hands[1][0]).state;
    expect(view(state, 2).currentTrick).toEqual([
      played,
      { seat: 1, card: hands[1][0] },
    ]);
  });
});
