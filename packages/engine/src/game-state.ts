import { createAuction, type Seat } from "./auction.js";
import { deal, type Card, type Deal } from "./deck.js";
import type {
  DealLayout,
  GameSettings,
  GameState,
  GameTransition,
  PlayedDeal,
  SpeechDeal,
} from "./game-types.js";
import { type BulletScore } from "./scoring.js";

export function rememberLayout(state: GameState): DealLayout {
  return {
    hands: state.layoutHands ?? state.talon?.hands ?? state.dealtCards.hands,
    talon: state.dealtCards.talon,
    discarded: state.talon?.discarded ?? [],
    tricks: state.play?.result ?? [0, 0, 0],
  };
}

export function startDeal(
  settings: GameSettings,
  seed: number,
  dealNumber: number,
  score: BulletScore,
  raspasIndex: number,
  lastLayout: DealLayout | null = null,
  deals: readonly PlayedDeal[] = [],
  speechLog: readonly SpeechDeal[] = [],
  suppliedDeal?: Deal,
): GameState {
  const dealtCards = suppliedDeal ?? deal(seed + dealNumber);
  return {
    settings,
    phase: "auction",
    seed,
    dealNumber,
    raspasIndex,
    score,
    scoreAtDealStart: score,
    dealtCards,
    auction: createAuction(firstLeader(dealNumber)),
    auctionResult: null,
    talon: null,
    defense: null,
    play: null,
    lastLayout,
    layoutHands: null,
    raspasOrder: null,
    prikupShown: 0,
    deals,
    speechLog,
  };
}

export function currentHands(
  state: GameState,
): readonly [readonly Card[], readonly Card[], readonly Card[]] {
  if (state.play !== null) {
    return state.play.hands;
  }
  if (state.talon !== null) {
    return state.talon.hands;
  }
  return state.dealtCards.hands;
}

export function firstLeader(dealNumber: number): Seat {
  return (dealNumber % 3) as Seat;
}

export function dealerSeat(dealNumber: number): Seat {
  return ((dealNumber + 2) % 3) as Seat;
}

export function accept(state: GameState): GameTransition {
  return { accepted: true, state };
}

export function reject(state: GameState, reason: string): GameTransition {
  return { accepted: false, reason, state };
}
