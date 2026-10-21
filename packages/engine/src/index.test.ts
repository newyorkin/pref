import { describe, expect, test } from "vitest";

import { RANKS, SUITS, createDeck, deal } from "./index.js";

describe("deck", () => {
  test("contains 32 unique cards from 7 through ace in four suits", () => {
    const deck = createDeck();
    const cardKeys = deck.map(({ suit, rank }) => `${suit}:${rank}`);

    expect(deck).toHaveLength(32);
    expect(new Set(cardKeys)).toHaveLength(32);
    expect(new Set(deck.map(({ suit }) => suit))).toEqual(new Set(SUITS));
    expect(new Set(deck.map(({ rank }) => rank))).toEqual(new Set(RANKS));
  });
});

describe("deal", () => {
  test("deals three hands of ten cards and a two-card talon", () => {
    const result = deal(42);

    expect(result.hands).toHaveLength(3);
    result.hands.forEach((hand) => expect(hand).toHaveLength(10));
    expect(result.talon).toHaveLength(2);
  });

  test("deals all 32 cards without duplicates", () => {
    const result = deal(42);
    const cards = [...result.hands.flat(), ...result.talon];
    const cardKeys = cards.map(({ suit, rank }) => `${suit}:${rank}`);

    expect(cards).toHaveLength(32);
    expect(new Set(cardKeys)).toHaveLength(32);
    expect(new Set(cardKeys)).toEqual(
      new Set(createDeck().map(({ suit, rank }) => `${suit}:${rank}`)),
    );
  });

  test("is deterministic for the same seed", () => {
    expect(deal(12_345)).toEqual(deal(12_345));
  });
});
