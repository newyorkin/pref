import { describe, expect, test } from "vitest";

import type { Card, Rank, Suit } from "./deck.js";
import {
  createTrickPlay,
  playCard,
  type TrickPlayState,
} from "./tricks.js";

function card(suit: Suit, rank: Rank): Card {
  return { suit, rank };
}

const fixedHands = [
  [
    card("spades", 7),
    card("spades", 8),
    card("spades", 9),
    card("spades", 10),
    card("spades", 11),
    card("spades", 12),
    card("spades", 13),
    card("spades", 14),
    card("clubs", 7),
    card("clubs", 8),
  ],
  [
    card("clubs", 9),
    card("clubs", 10),
    card("clubs", 11),
    card("clubs", 12),
    card("clubs", 13),
    card("clubs", 14),
    card("diamonds", 7),
    card("diamonds", 8),
    card("diamonds", 9),
    card("diamonds", 10),
  ],
  [
    card("diamonds", 11),
    card("diamonds", 12),
    card("diamonds", 13),
    card("diamonds", 14),
    card("hearts", 7),
    card("hearts", 8),
    card("hearts", 9),
    card("hearts", 10),
    card("hearts", 11),
    card("hearts", 12),
  ],
] as const;

function chooseLegalCard(state: TrickPlayState): Card {
  const hand = state.hands[state.turn!];
  const leadSuit = state.currentTrick[0]?.card.suit;
  if (leadSuit !== undefined) {
    const following = hand.find(({ suit }) => suit === leadSuit);
    if (following !== undefined) {
      return following;
    }
    const trump = hand.find(({ suit }) => suit === state.trump);
    if (trump !== undefined) {
      return trump;
    }
  }
  return hand[0];
}

describe("trick play", () => {
  test("plays fixed hands through the tenth trick", () => {
    let state = createTrickPlay(fixedHands, 0, "hearts");

    for (let play = 0; play < 30; play += 1) {
      const transition = playCard(
        state,
        state.turn!,
        chooseLegalCard(state),
      );
      expect(transition.accepted).toBe(true);
      state = transition.state;
    }

    expect(state.completedTricks).toBe(10);
    expect(state.result).not.toBeNull();
    expect(state.result!.reduce((total, tricks) => total + tricks, 0)).toBe(
      10,
    );
    expect(state.hands.every((hand) => hand.length === 0)).toBe(true);

    const extraCard = playCard(state, 0, fixedHands[0][0]);
    expect(extraCard).toMatchObject({
      accepted: false,
      reason: "finished",
    });
    expect(extraCard.state).toBe(state);
  });

  test("requires following suit", () => {
    let state = createTrickPlay(
      [
        [card("spades", 7)],
        [card("spades", 8), card("hearts", 14)],
        [card("clubs", 7)],
      ],
      0,
      "hearts",
    );
    state = playCard(state, 0, card("spades", 7)).state;

    const transition = playCard(state, 1, card("hearts", 14));

    expect(transition).toMatchObject({
      accepted: false,
      reason: "mustFollowSuit",
    });
    expect(transition.state).toBe(state);
  });

  test("a heart lead with hearts in hand accepts only hearts", () => {
    let state = createTrickPlay(
      [
        [card("hearts", 9)],
        [card("hearts", 8), card("spades", 14), card("diamonds", 9)],
        [card("clubs", 7)],
      ],
      0,
      "spades",
    );
    state = playCard(state, 0, card("hearts", 9)).state;

    const trump = playCard(state, 1, card("spades", 14));
    const diamond = playCard(state, 1, card("diamonds", 9));
    const heart = playCard(state, 1, card("hearts", 8));

    expect(trump).toMatchObject({ accepted: false, reason: "mustFollowSuit" });
    expect(trump.state).toBe(state);
    expect(diamond).toMatchObject({
      accepted: false,
      reason: "mustFollowSuit",
    });
    expect(diamond.state).toBe(state);
    expect(heart.accepted).toBe(true);
    expect(heart.state.currentTrick.map(({ card: played }) => played)).toEqual([
      card("hearts", 9),
      card("hearts", 8),
    ]);
  });

  test("without the led suit any trump is legal, including a lower trump", () => {
    let state = createTrickPlay(
      [
        [card("hearts", 9)],
        [card("spades", 14)],
        [card("spades", 7), card("diamonds", 8)],
      ],
      0,
      "spades",
    );
    state = playCard(state, 0, card("hearts", 9)).state;
    state = playCard(state, 1, card("spades", 14)).state;

    const diamond = playCard(state, 2, card("diamonds", 8));
    const seven = playCard(state, 2, card("spades", 7));

    expect(diamond).toMatchObject({
      accepted: false,
      reason: "mustPlayTrump",
    });
    expect(diamond.state).toBe(state);
    expect(diamond.state.currentTrick).toHaveLength(2);
    expect(seven.accepted).toBe(true);
    expect(seven.state.tricksWon).toEqual([0, 1, 0]);
    expect(seven.state.turn).toBe(1);
  });

  test("without the led suit and without trump every remaining card is legal", () => {
    let state = createTrickPlay(
      [
        [card("hearts", 9)],
        [card("diamonds", 8), card("clubs", 10)],
        [card("clubs", 7)],
      ],
      0,
      "spades",
    );
    state = playCard(state, 0, card("hearts", 9)).state;

    const diamond = playCard(state, 1, card("diamonds", 8));
    const club = playCard(state, 1, card("clubs", 10));

    expect(diamond.accepted).toBe(true);
    expect(club.accepted).toBe(true);
  });

  test("a side suit does not win a trick that has no trump", () => {
    let state = createTrickPlay(
      [
        [card("hearts", 8)],
        [card("diamonds", 14)],
        [card("hearts", 7)],
      ],
      0,
      "spades",
    );
    state = playCard(state, 0, card("hearts", 8)).state;
    state = playCard(state, 1, card("diamonds", 14)).state;
    state = playCard(state, 2, card("hearts", 7)).state;

    expect(state.tricksWon).toEqual([1, 0, 0]);
    expect(state.trickHistory[0]?.winner).toBe(0);
  });

  test("a trump lead with trump in hand rejects a side suit and accepts a lower trump", () => {
    let state = createTrickPlay(
      [
        [card("spades", 14)],
        [card("spades", 7), card("hearts", 13)],
        [card("hearts", 8)],
      ],
      0,
      "spades",
    );
    state = playCard(state, 0, card("spades", 14)).state;

    const heart = playCard(state, 1, card("hearts", 13));
    const seven = playCard(state, 1, card("spades", 7));

    expect(heart).toMatchObject({ accepted: false, reason: "mustFollowSuit" });
    expect(heart.state).toBe(state);
    expect(seven.accepted).toBe(true);
  });

  test("no-trump play accepts any card when the lead suit is missing", () => {
    let state = createTrickPlay(
      [
        [card("hearts", 9)],
        [card("diamonds", 8), card("clubs", 10)],
        [card("clubs", 7)],
      ],
      0,
      "noTrump",
    );
    expect(state.trump).toBeNull();
    state = playCard(state, 0, card("hearts", 9)).state;

    const diamond = playCard(state, 1, card("diamonds", 8));
    const club = playCard(state, 1, card("clubs", 10));

    expect(diamond.accepted).toBe(true);
    expect(club.accepted).toBe(true);
    expect(diamond).not.toMatchObject({ reason: "mustPlayTrump" });
    expect(club).not.toMatchObject({ reason: "mustPlayTrump" });
  });

  test("the first card of a trick may be any card from the hand", () => {
    const state = createTrickPlay(
      [
        [card("spades", 7), card("hearts", 14), card("diamonds", 8)],
        [card("clubs", 7)],
        [card("clubs", 8)],
      ],
      0,
      "spades",
    );

    for (const candidate of state.hands[0]) {
      const played = playCard(state, 0, candidate);
      expect(played.accepted).toBe(true);
      expect(played.state.currentTrick).toEqual([
        { seat: 0, card: candidate },
      ]);
    }
  });

  test("a trump beats a plain-suit card", () => {
    let state = createTrickPlay(
      [
        [card("spades", 14)],
        [card("hearts", 7)],
        [card("spades", 13)],
      ],
      0,
      "hearts",
    );
    state = playCard(state, 0, card("spades", 14)).state;
    state = playCard(state, 1, card("hearts", 7)).state;
    state = playCard(state, 2, card("spades", 13)).state;

    expect(state.tricksWon).toEqual([0, 1, 0]);
    expect(state.turn).toBe(1);
  });

  test("rejects another player's card and an out-of-turn play", () => {
    const state = createTrickPlay(fixedHands, 0, "noTrump");

    const foreignCard = playCard(state, 0, fixedHands[1][0]);
    expect(foreignCard).toMatchObject({
      accepted: false,
      reason: "cardNotInHand",
    });
    expect(foreignCard.state).toBe(state);

    const outOfTurn = playCard(state, 1, fixedHands[1][0]);
    expect(outOfTurn).toMatchObject({
      accepted: false,
      reason: "notYourTurn",
    });
    expect(outOfTurn.state).toBe(state);
  });
});
