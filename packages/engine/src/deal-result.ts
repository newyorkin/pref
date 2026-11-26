import { type AuctionResult, type Seat } from "./auction.js";
import { type Deal } from "./deck.js";
import { rememberLayout, startDeal } from "./game-state.js";
import type {
  DealDefense,
  DealDefenseRole,
  GameState,
  PlayedDeal,
} from "./game-types.js";
import {
  isBulletComplete,
  scoreDeal,
  scoreSince,
  type BulletScore,
  type ScoredDeal,
} from "./scoring.js";
import { nextRaspasIndex, raspasMultiplier } from "./settings.js";
import { archiveSpeech, TRUMP_NAME } from "./speech.js";

export function finishDeal(state: GameState, dealSource?: () => Deal): GameState {
  const result = state.play?.result;
  const auctionResult = state.auctionResult;
  if (result === null || result === undefined || auctionResult === null) {
    throw new Error("Cannot finish an incomplete deal");
  }

  let scoredDeal: ScoredDeal;
  let takenGame = false;
  if (auctionResult.type === "raspas") {
    scoredDeal = {
      type: "raspas",
      tricks: result,
      multiplier: raspasMultiplier(state.settings.raspasProgression, state.raspasIndex),
    };
  } else if (auctionResult.type === "misere") {
    takenGame = result[auctionResult.declarer] === 0;
    scoredDeal = {
      type: "misere",
      declarer: auctionResult.declarer,
      tricks: result,
    };
  } else {
    const whistlers = state.defense?.whistlers ?? [];
    takenGame =
      whistlers.length === 0 || result[auctionResult.declarer] >= auctionResult.level;
    const passer = state.defense?.defenders.find(
      (defender) => state.defense?.decisions[defender] === "pass",
    );
    scoredDeal = {
      type: "contract",
      declarer: auctionResult.declarer,
      level: auctionResult.level,
      tricks: result,
      whistlers,
      ...(whistlers.length === 1 && passer !== undefined ? { passer } : {}),
    };
  }

  return closeScoredDeal(state, scoredDeal, takenGame, dealSource);
}

export function finishWithoutThree(
  state: GameState,
  dealSource?: () => Deal,
): GameState {
  const auctionResult = state.auctionResult;
  if (auctionResult?.type !== "contract") {
    throw new Error("Cannot leave without three");
  }
  return closeScoredDeal(
    state,
    {
      type: "contract",
      declarer: auctionResult.declarer,
      level: auctionResult.level,
      tricks: [0, 0, 0] as const,
      whistlers: [],
      withoutThree: true,
    },
    false,
    dealSource,
  );
}

export function finishHalfWhist(state: GameState, dealSource?: () => Deal): GameState {
  const auctionResult = state.auctionResult;
  const halfWhist = state.defense?.halfWhist;
  if (
    auctionResult?.type !== "contract" ||
    halfWhist === null ||
    halfWhist === undefined
  ) {
    throw new Error("Cannot close a half-whist");
  }
  return closeScoredDeal(
    state,
    {
      type: "contract",
      declarer: auctionResult.declarer,
      level: auctionResult.level,
      tricks: [0, 0, 0] as const,
      whistlers: [],
      halfWhist,
    },
    true,
    dealSource,
  );
}

export function finishPassedContract(
  state: GameState,
  dealSource?: () => Deal,
): GameState {
  const auctionResult = state.auctionResult;
  if (auctionResult?.type !== "contract") {
    throw new Error("Cannot close a passed contract");
  }
  return closeScoredDeal(
    state,
    {
      type: "contract",
      declarer: auctionResult.declarer,
      level: auctionResult.level,
      tricks: [0, 0, 0] as const,
      whistlers: [],
    },
    true,
    dealSource,
  );
}

export function closeScoredDeal(
  state: GameState,
  scoredDeal: ScoredDeal,
  takenGame: boolean,
  dealSource?: () => Deal,
): GameState {
  const auctionResult = state.auctionResult;
  if (auctionResult === null) {
    throw new Error("Cannot finish a deal without a result");
  }
  const baseline = state.scoreAtDealStart ?? state.score;
  const score = scoreSince(
    baseline,
    scoreDeal(state.score, scoredDeal, state.settings.bulletTarget),
  );
  const raspasIndex = raspasIndexAfterDeal(state, auctionResult, takenGame);
  const lastLayout = rememberLayout(state);
  const deals = [...(state.deals ?? []), playedDeal(state, scoredDeal, score)];
  const speechLog = archiveSpeech(state);
  if (isBulletComplete(score, state.settings.bulletTarget)) {
    return {
      ...state,
      phase: "finished",
      score,
      raspasIndex,
      lastLayout,
      deals,
    };
  }
  return startDeal(
    state.settings,
    state.seed,
    state.dealNumber + 1,
    score,
    raspasIndex,
    lastLayout,
    deals,
    speechLog,
    dealSource?.(),
  );
}

export function raspasIndexAfterDeal(
  state: GameState,
  auctionResult: AuctionResult,
  takenGame: boolean,
): number {
  if (auctionResult.type === "raspas") {
    return nextRaspasIndex(
      state.raspasIndex,
      { type: "raspas" },
      state.settings.raspasExit,
    );
  }
  if (!takenGame) {
    return state.raspasIndex;
  }
  if (auctionResult.type === "misere") {
    return nextRaspasIndex(
      state.raspasIndex,
      { type: "takenMisere" },
      state.settings.raspasExit,
    );
  }
  return nextRaspasIndex(
    state.raspasIndex,
    { type: "takenContract", level: auctionResult.level },
    state.settings.raspasExit,
  );
}

export function bulletGain(before: BulletScore, after: BulletScore): number {
  const sum = (score: BulletScore) =>
    score.bullet[0] + score.bullet[1] + score.bullet[2];
  return sum(after) - sum(before);
}

export function playedDeal(
  state: GameState,
  scoredDeal: ScoredDeal,
  score: BulletScore,
): PlayedDeal {
  const auction = state.auctionResult;
  let declarer: Seat | null = null;
  let contract = "Распасы";
  if (auction?.type === "misere") {
    declarer = auction.declarer;
    contract = "Мизер";
  } else if (auction?.type === "contract") {
    declarer = auction.declarer;
    const notes = [
      scoredDeal.type === "contract" && scoredDeal.withoutThree === true
        ? "без трёх"
        : null,
      state.talon?.faced === true ? "прикуп в лицо" : null,
    ].filter((note) => note !== null);
    contract = `${auction.level} ${TRUMP_NAME[auction.trump]}`;
    if (notes.length > 0) {
      contract = `${contract}, ${notes.join(", ")}`;
    }
  }
  const defense =
    scoredDeal.type === "contract" && scoredDeal.withoutThree !== true
      ? dealDefense(state)
      : null;
  return {
    number: state.dealNumber + 1,
    declarer,
    contract,
    tricks: scoredDeal.tricks,
    delta: score.last,
    ...(defense === null ? {} : { defense }),
  };
}

/** Each defender's role by seat, so the record reads the same whoever looks at it. */
export function dealDefense(state: GameState): DealDefense | null {
  const defense = state.defense;
  if (defense === null) {
    return null;
  }
  const roles: [
    DealDefenseRole | null,
    DealDefenseRole | null,
    DealDefenseRole | null,
  ] = [null, null, null];
  for (const seat of defense.defenders) {
    const decision = defense.decisions[seat];
    if (decision === null) {
      return null;
    }
    roles[seat] =
      seat === defense.halfWhistReturned
        ? "halfWhist"
        : decision === "whist" && defense.halfWhistReturned !== undefined
          ? "whistBack"
          : decision;
  }
  return {
    roles,
    whistStyle: defense.whistlers.length === 1 ? defense.whistStyle : null,
  };
}
