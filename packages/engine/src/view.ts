import type { Seat } from "./auction.js";
import type { Card } from "./deck.js";
import type {
  CompletedTrick,
  TrickPlayState,
} from "./tricks.js";

export interface FaceDownCard {
  readonly faceDown: true;
}

export interface VisiblePlayedCard {
  readonly seat: Seat;
  readonly card: Card | FaceDownCard;
}

export interface SeatView {
  readonly hand: readonly Card[];
  readonly handSizes: readonly [number, number, number];
  readonly trump: TrickPlayState["trump"];
  readonly turn: TrickPlayState["turn"];
  readonly currentTrick: readonly VisiblePlayedCard[];
  readonly trickHistory: readonly CompletedTrick[];
  readonly tricksWon: TrickPlayState["tricksWon"];
  readonly result: TrickPlayState["result"];
}

export function view(state: TrickPlayState, seat: Seat): SeatView {
  return {
    hand: state.hands[seat],
    handSizes: [
      state.hands[0].length,
      state.hands[1].length,
      state.hands[2].length,
    ],
    trump: state.trump,
    turn: state.turn,
    currentTrick: state.currentTrick,
    trickHistory: state.trickHistory,
    tricksWon: state.tricksWon,
    result: state.result,
  };
}
