import type { Seat, Trump } from "./auction.js";
import type { Card, Suit } from "./deck.js";

export interface PlayedCard {
  readonly seat: Seat;
  readonly card: Card;
}

export interface CompletedTrick {
  readonly cards: readonly PlayedCard[];
  readonly winner: Seat;
  readonly talonCard?: Card;
}

export interface TrickPlayState {
  readonly hands: readonly [
    readonly Card[],
    readonly Card[],
    readonly Card[],
  ];
  readonly trump: Suit | null;
  readonly firstLead: "closed";
  readonly turn: Seat | null;
  readonly currentTrick: readonly PlayedCard[];
  readonly trickHistory: readonly CompletedTrick[];
  readonly completedTricks: number;
  readonly tricksWon: readonly [number, number, number];
  readonly result: readonly [number, number, number] | null;
  readonly forcedSuit?: Suit | null;
}

export type CardPlayRejection =
  | "finished"
  | "notYourTurn"
  | "cardNotInHand"
  | "mustFollowSuit"
  | "mustPlayTrump";

export type CardPlayTransition =
  | { readonly accepted: true; readonly state: TrickPlayState }
  | {
      readonly accepted: false;
      readonly reason: CardPlayRejection;
      readonly state: TrickPlayState;
    };

export function createTrickPlay(
  hands: TrickPlayState["hands"],
  firstLeader: Seat,
  trump: Trump,
): TrickPlayState {
  return {
    hands,
    trump: trump === "noTrump" ? null : trump,
    firstLead: "closed",
    turn: firstLeader,
    currentTrick: [],
    trickHistory: [],
    completedTricks: 0,
    tricksWon: [0, 0, 0],
    result: null,
  };
}

export function playCard(
  state: TrickPlayState,
  seat: Seat,
  card: Card,
): CardPlayTransition {
  if (state.result !== null) {
    return reject(state, "finished");
  }
  if (state.turn !== seat) {
    return reject(state, "notYourTurn");
  }

  const hand = state.hands[seat];
  const cardIndex = hand.findIndex((candidate) => cardsEqual(candidate, card));
  if (cardIndex === -1) {
    return reject(state, "cardNotInHand");
  }

  const leadSuit = state.forcedSuit ?? state.currentTrick[0]?.card.suit;
  if (leadSuit !== undefined) {
    const reason = followRejection(hand, state.trump, leadSuit, card);
    if (reason !== null) {
      return reject(state, reason);
    }
  }

  const hands: [readonly Card[], readonly Card[], readonly Card[]] = [
    state.hands[0],
    state.hands[1],
    state.hands[2],
  ];
  hands[seat] = hand.filter((_, index) => index !== cardIndex);

  const currentTrick = [...state.currentTrick, { seat, card }];
  if (currentTrick.length < 3) {
    return accept({
      ...state,
      hands,
      currentTrick,
      turn: ((seat + 1) % 3) as Seat,
    });
  }

  const winner = trickWinner(currentTrick, state.trump, state.forcedSuit ?? null);
  const tricksWon: [number, number, number] = [...state.tricksWon];
  tricksWon[winner] += 1;
  const completedTricks = state.completedTricks + 1;
  const result = completedTricks === 10 ? tricksWon : null;

  return accept({
    ...state,
    hands,
    currentTrick: [],
    trickHistory: [
      ...state.trickHistory,
      { cards: currentTrick, winner },
    ],
    completedTricks,
    tricksWon,
    result,
    forcedSuit: null,
    turn: result === null ? winner : null,
  });
}

export function trickWinner(
  trick: readonly PlayedCard[],
  trump: Suit | null,
  forcedSuit: Suit | null = null,
): Seat {
  if (trick.length === 0) {
    throw new RangeError("Cannot determine the winner of an empty trick");
  }

  const leadSuit = forcedSuit ?? trick[0].card.suit;
  const winningSuit =
    trump !== null && trick.some(({ card }) => card.suit === trump)
      ? trump
      : leadSuit;
  const eligible = trick.filter(({ card }) => card.suit === winningSuit);
  if (eligible.length === 0) {
    return trick[0].seat;
  }

  return eligible.reduce((winner, played) =>
    played.card.rank > winner.card.rank ? played : winner,
  ).seat;
}

function followRejection(
  hand: readonly Card[],
  trump: Suit | null,
  leadSuit: Suit,
  card: Card,
): CardPlayRejection | null {
  if (hand.some((candidate) => candidate.suit === leadSuit)) {
    return card.suit === leadSuit ? null : "mustFollowSuit";
  }
  if (
    trump !== null &&
    hand.some((candidate) => candidate.suit === trump)
  ) {
    return card.suit === trump ? null : "mustPlayTrump";
  }
  return null;
}

function cardsEqual(left: Card, right: Card): boolean {
  return left.suit === right.suit && left.rank === right.rank;
}

function accept(state: TrickPlayState): CardPlayTransition {
  return { accepted: true, state };
}

function reject(
  state: TrickPlayState,
  reason: CardPlayRejection,
): CardPlayTransition {
  return { accepted: false, reason, state };
}
