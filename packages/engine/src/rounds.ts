import type { Seat } from "./auction.js";
import {
  nextRaspasIndex,
  raspasMultiplier,
  type DealOutcome,
  type RaspasProgression,
  type TableSettings,
} from "./settings.js";
import {
  createTrickPlay,
  type TrickPlayState,
} from "./tricks.js";

export interface RaspasUpdate {
  readonly index: number;
  readonly multiplier: number | null;
}

export function createMiserePlay(
  hands: TrickPlayState["hands"],
  firstLeader: Seat,
): TrickPlayState {
  return createTrickPlay(hands, firstLeader, "noTrump");
}

export function isMisereTaken(
  tricksWon: readonly [number, number, number],
  declarer: Seat,
): boolean {
  return tricksWon[declarer] === 0;
}

export function applyRaspasOutcome(
  index: number,
  progression: RaspasProgression,
  outcome: DealOutcome,
  raspasExit: TableSettings["raspasExit"],
): RaspasUpdate {
  return {
    multiplier:
      outcome.type === "raspas"
        ? raspasMultiplier(progression, index)
        : null,
    index: nextRaspasIndex(index, outcome, raspasExit),
  };
}
