import { type AuctionAction, type Bid, type Seat } from "./auction.js";
import { type DefenseAction } from "./defense.js";
import type { GameState, SpeechDeal, TableSpeech } from "./game-types.js";
import { raspasMultiplier } from "./settings.js";

export function visibleSpeechLog(state: GameState): readonly SpeechDeal[] {
  const prior = state.speechLog ?? [];
  const lines = state.speech ?? [];
  if (lines.length === 0) {
    return prior;
  }
  return [...prior, { deal: state.dealNumber + 1, lines }];
}

export function archiveSpeech(state: GameState): readonly SpeechDeal[] {
  const prior = state.speechLog ?? [];
  const lines = state.speech ?? [];
  if (lines.length === 0) {
    return prior;
  }
  return [...prior, { deal: state.dealNumber + 1, lines }];
}

export function talonAceWord(written: number): string | null {
  if (written === 1) {
    return "туз в пулю";
  }
  if (written >= 2) {
    return "два туза в пулю";
  }
  return null;
}

export function talonAceRequest(aces: number): string {
  return aces === 1
    ? "за туза, попрошу записать 1 в пульку"
    : "за тузов, попрошу записать 2 в пульку";
}

export function raspasCallWord(state: GameState): string {
  if (state.raspasIndex === 0) {
    return "распасы";
  }
  const ordinal =
    state.raspasIndex === 1
      ? "вторые"
      : state.raspasIndex === 2
        ? "третьи"
        : `${state.raspasIndex + 1}-е`;
  const multiplier = raspasMultiplier(
    state.settings.raspasProgression,
    state.raspasIndex,
  );
  return `${ordinal} распасы (множитель ${multiplier})`;
}

export const TRUMP_NAME = {
  spades: "пик",
  clubs: "треф",
  diamonds: "бубен",
  hearts: "червей",
  noTrump: "без козыря",
} as const;

export function withSpeech(
  state: Pick<GameState, "speech" | "speechStep">,
  seat: Seat | null,
  word: string,
  fresh: boolean,
): { speech: readonly TableSpeech[]; speechStep: number } {
  const speech = state.speech ?? [];
  const current = state.speechStep ?? 0;
  const step = fresh ? current + 1 : Math.max(current, 1);
  return {
    speechStep: step,
    speech: [...speech, { seat, word, step }],
  };
}

export function advanceSpeech(state: GameState): {
  speech: readonly TableSpeech[];
  speechStep: number;
} {
  return {
    speech: state.speech ?? [],
    speechStep: (state.speechStep ?? 0) + 1,
  };
}

export function bidWord(bid: Bid): string {
  if (bid.type === "misere") {
    return "мизер";
  }
  return `${bid.level} ${TRUMP_NAME[bid.trump]}`;
}

export function speechForAuction(
  state: GameState,
  seat: Seat,
  action: AuctionAction,
): { speech: readonly TableSpeech[]; speechStep: number } {
  if (action.type === "pass") {
    return withSpeech(state, seat, "пас", false);
  }
  return withSpeech(state, seat, bidWord(action.bid), true);
}

export function speechForSixDiamondsOrder(
  state: GameState,
  seat: Seat,
  bid: Bid,
): { speech: readonly TableSpeech[]; speechStep: number } {
  const voiced = withSpeech(state, seat, bidWord(bid), true);
  return {
    ...voiced,
    speech: [
      ...voiced.speech,
      {
        seat: null,
        word: "кто играет шесть бубён - тот бывает наебён",
        step: voiced.speechStep,
      },
    ],
  };
}

export function defenseWord(action: DefenseAction): string {
  if (action.type === "pass") {
    return "пас";
  }
  if (action.type === "whist") {
    return "вист";
  }
  if (action.type === "halfWhist") {
    return "полвиста";
  }
  if (action.type === "light") {
    return "всветлую";
  }
  return "втёмную";
}

export function speechForDefense(
  state: GameState,
  seat: Seat,
  action: DefenseAction,
): { speech: readonly TableSpeech[]; speechStep: number } {
  const fresh = action.type === "light" || action.type === "dark";
  return withSpeech(state, seat, defenseWord(action), fresh);
}
