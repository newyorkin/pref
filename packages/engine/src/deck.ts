export const SUITS = ["spades", "clubs", "diamonds", "hearts"] as const;
export const RANKS = [7, 8, 9, 10, 11, 12, 13, 14] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];

export interface Card {
  readonly suit: Suit;
  readonly rank: Rank;
}

export interface Deal {
  readonly hands: readonly [
    readonly Card[],
    readonly Card[],
    readonly Card[],
  ];
  readonly talon: readonly Card[];
}

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));
}

export function deal(seed: number): Deal {
  if (!Number.isFinite(seed)) {
    throw new RangeError("Seed must be a finite number");
  }

  const random = mulberry32(Math.trunc(seed) >>> 0);
  const deck = createDeck();

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }

  return {
    hands: [
      deck.slice(0, 10),
      deck.slice(10, 20),
      deck.slice(20, 30),
    ],
    talon: deck.slice(30),
  };
}

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
