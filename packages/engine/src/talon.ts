import type { AuctionResult, Seat } from "./auction.js";
import type { Card, Deal } from "./deck.js";

export interface TalonState {
  readonly hands: readonly [
    readonly Card[],
    readonly Card[],
    readonly Card[],
  ];
  readonly talon: readonly Card[];
  readonly declarer: Seat | null;
  readonly phase: "raspas" | "discard" | "ready";
  readonly discarded: readonly Card[];
  readonly faced: boolean;
}

export type DiscardRejection =
  | "notAwaitingDiscard"
  | "notDeclarer"
  | "cardNotInHand";

export type DiscardTransition =
  | { readonly accepted: true; readonly state: TalonState }
  | {
      readonly accepted: false;
      readonly reason: DiscardRejection;
      readonly state: TalonState;
    };

export function takeTalon(
  deal: Deal,
  auctionResult: AuctionResult,
): TalonState {
  if (auctionResult.type === "raspas") {
    return {
      hands: deal.hands,
      talon: deal.talon,
      declarer: null,
      phase: "raspas",
      discarded: [],
      faced: false,
    };
  }

  const hands: [readonly Card[], readonly Card[], readonly Card[]] = [
    deal.hands[0],
    deal.hands[1],
    deal.hands[2],
  ];
  hands[auctionResult.declarer] = [
    ...hands[auctionResult.declarer],
    ...deal.talon,
  ];

  return {
    hands,
    talon: [],
    declarer: auctionResult.declarer,
    phase: "discard",
    discarded: [],
    faced: false,
  };
}

export function discardCards(
  state: TalonState,
  seat: Seat,
  cards: readonly [Card, Card],
): DiscardTransition {
  if (state.phase !== "discard") {
    return reject(state, "notAwaitingDiscard");
  }
  if (state.declarer !== seat) {
    return reject(state, "notDeclarer");
  }

  const hand = [...state.hands[seat]];
  for (const card of cards) {
    const index = hand.findIndex((candidate) => cardsEqual(candidate, card));
    if (index === -1) {
      return reject(state, "cardNotInHand");
    }
    hand.splice(index, 1);
  }

  const hands: [readonly Card[], readonly Card[], readonly Card[]] = [
    state.hands[0],
    state.hands[1],
    state.hands[2],
  ];
  hands[seat] = hand;

  return {
    accepted: true,
    state: {
      ...state,
      hands,
      phase: "ready",
      discarded: cards,
    },
  };
}

function cardsEqual(left: Card, right: Card): boolean {
  return left.suit === right.suit && left.rank === right.rank;
}

function reject(
  state: TalonState,
  reason: DiscardRejection,
): DiscardTransition {
  return { accepted: false, reason, state };
}
