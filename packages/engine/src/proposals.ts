import { type Seat } from "./auction.js";
import { closeScoredDeal } from "./deal-result.js";
import { type Card, type Deal } from "./deck.js";
import { accept, reject } from "./game-state.js";
import type {
  GameAction,
  GameSeatView,
  GameState,
  GameTransition,
  Proposal,
} from "./game-types.js";
import { styleChoiceDue } from "./hand-view.js";
import { type ScoredDeal } from "./scoring.js";
import { advanceSpeech, withSpeech } from "./speech.js";

export const DECLINE_WORD = "не согласен";
export const CANCEL_WORD = "отменяю";

export function proposalAvailable(state: GameState): boolean {
  const misere = state.auctionResult?.type === "misere";
  return (
    state.phase === "play" &&
    state.play !== null &&
    state.proposal == null &&
    (state.auctionResult?.type === "contract" ||
      state.auctionResult?.type === "misere") &&
    (misere || state.defense?.whistlers.length === 1) &&
    (misere || state.defense?.whistStyle !== "dark") &&
    !styleChoiceDue(state)
  );
}

export function proposalSeat(state: GameState, seat: Seat): boolean {
  if (state.auctionResult?.type === "misere") {
    return true;
  }
  return (
    state.auctionResult?.type === "contract" &&
    (seat === state.auctionResult.declarer ||
      state.defense?.whistlers.includes(seat) === true)
  );
}

function proposalBounds(state: GameState): { floor: number; ceiling: number } | null {
  const result = state.auctionResult;
  if (state.play === null || result == null || result.type === "raspas") return null;
  const floor = state.play.tricksWon[result.declarer];
  const takenByOthers = state.play.tricksWon.reduce(
    (sum, tricks, seat) => sum + (seat === result.declarer ? 0 : tricks),
    0,
  );
  // A partial current trick is still one of the unresolved tricks, not a taken one.
  return { floor, ceiling: 10 - takenByOthers };
}

function validProposal(state: GameState, tricks: number): boolean {
  const bounds = proposalBounds(state);
  return (
    bounds !== null &&
    Number.isInteger(tricks) &&
    tricks >= bounds.floor &&
    tricks <= bounds.ceiling
  );
}

export function proposalOffers(state: GameState, seat: Seat): readonly GameAction[] {
  if (
    !proposalAvailable(state) ||
    state.auctionResult == null ||
    state.auctionResult.type === "raspas"
  ) {
    return [];
  }
  if (!proposalSeat(state, seat) || state.play === null) {
    return [];
  }
  const bounds = proposalBounds(state);
  if (bounds === null) return [];
  const offers: GameAction[] = [];
  for (let tricks = bounds.floor; tricks <= bounds.ceiling; tricks += 1) {
    offers.push({ type: "propose", tricks });
  }
  return offers;
}

export function proposalReplies(state: GameState, seat: Seat): readonly GameAction[] {
  const proposal = state.proposal;
  if (proposal != null && seat === proposal.proposer) {
    return [{ type: "cancelProposal" }];
  }
  if (
    proposal == null ||
    state.auctionResult === null ||
    proposal.answers[seat] !== null
  ) {
    return [];
  }
  return [
    { type: "proposal", answer: "agree" },
    { type: "proposal", answer: "decline" },
  ];
}

export function offerProposal(
  state: GameState,
  seat: Seat,
  tricks: number,
): GameTransition {
  if (
    !proposalAvailable(state) ||
    state.auctionResult == null ||
    state.auctionResult.type === "raspas"
  ) {
    return reject(state, "invalidPhase");
  }
  if (!proposalSeat(state, seat)) {
    return reject(state, "notYourTurn");
  }
  if (!validProposal(state, tricks)) {
    return reject(state, "invalidProposal");
  }
  const byDeclarer = state.auctionResult.declarer === seat;
  return accept({
    ...state,
    ...withSpeech(
      state,
      seat,
      byDeclarer ? `${tricks} запишем?` : `отдаём ${tricks}?`,
      true,
    ),
    proposal: { tricks, proposer: seat, answers: [null, null, null] },
    ...(byDeclarer ? { declarerShown: true } : {}),
  });
}

/** The proposer takes his offer back before both answers are in; answers given so far are dropped. */
export function cancelProposal(state: GameState, seat: Seat): GameTransition {
  const proposal = state.proposal;
  if (proposal == null) {
    return reject(state, "invalidPhase");
  }
  if (seat !== proposal.proposer) {
    return reject(state, "notYourTurn");
  }
  return accept({
    ...state,
    ...withSpeech(state, seat, CANCEL_WORD, true),
    proposal: null,
  });
}

export function answerProposal(
  state: GameState,
  seat: Seat,
  answer: "agree" | "decline",
  dealSource?: () => Deal,
): GameTransition {
  const proposal = state.proposal;
  if (
    proposal == null ||
    state.auctionResult === null ||
    seat === proposal?.proposer ||
    proposal.answers[seat] !== null
  ) {
    return reject(state, "notYourTurn");
  }
  if (answer === "decline") {
    return accept({
      ...state,
      ...withSpeech(state, seat, DECLINE_WORD, true),
      proposal: null,
    });
  }
  // A saved offer from an older server must not rewrite already taken tricks either.
  if (!validProposal(state, proposal.tricks)) return reject(state, "invalidProposal");
  const answers: Proposal["answers"] = [
    seat === 0 ? "agree" : proposal.answers[0],
    seat === 1 ? "agree" : proposal.answers[1],
    seat === 2 ? "agree" : proposal.answers[2],
  ];
  const voiced: GameState = {
    ...state,
    ...withSpeech(state, seat, "согласен", false),
    proposal: { tricks: proposal.tricks, proposer: proposal.proposer, answers },
  };
  const both = ([0, 1, 2] as const).every(
    (place) => place === proposal.proposer || answers[place] === "agree",
  );
  return accept(both ? finishProposal(voiced, dealSource) : voiced);
}

/**
 * The first card after a refused or cancelled offer takes the «не согласен» or «отменяю» bubble
 * off the table; the log keeps the line.
 */
export function clearClosedOffer(state: GameState): GameState {
  const step = state.speechStep ?? 0;
  const closed = (state.speech ?? []).some(
    (line) =>
      line.step === step && (line.word === DECLINE_WORD || line.word === CANCEL_WORD),
  );
  return closed ? { ...state, ...advanceSpeech(state) } : state;
}

export function finishProposal(state: GameState, dealSource?: () => Deal): GameState {
  const auctionResult = state.auctionResult;
  const proposal = state.proposal;
  const whistler = state.defense?.whistlers[0];
  if (
    auctionResult == null ||
    auctionResult.type === "raspas" ||
    proposal == null ||
    (auctionResult.type === "contract" && whistler === undefined) ||
    state.play === null
  ) {
    throw new Error("Cannot record a proposal");
  }
  const tricks = [...state.play.tricksWon] as [number, number, number];
  const declarer = auctionResult.declarer;
  tricks[declarer] = proposal.tricks;
  const remainingTricks = 10 - tricks.reduce((sum, taken) => sum + taken, 0);
  const recipient = whistler ?? (((declarer + 1) % 3) as Seat);
  tricks[recipient] += remainingTricks;
  const passer = state.defense?.defenders.find(
    (defender) => state.defense?.decisions[defender] === "pass",
  );
  const scoreResult: ScoredDeal =
    auctionResult.type === "misere"
      ? { type: "misere", declarer, tricks }
      : {
          type: "contract",
          declarer,
          level: auctionResult.level,
          tricks,
          whistlers: [whistler!],
          ...(passer === undefined ? {} : { passer }),
        };
  return closeScoredDeal(
    {
      ...state,
      proposal: null,
      play: { ...state.play, result: tricks },
    },
    scoreResult,
    auctionResult.type === "misere"
      ? proposal.tricks === 0
      : proposal.tricks >= auctionResult.level,
    dealSource,
  );
}

export function proposedHands(
  hands: GameSeatView["shownHands"],
  state: GameState,
  viewer: Seat,
): GameSeatView["shownHands"] {
  const result = state.auctionResult;
  if (
    state.declarerShown !== true ||
    state.phase !== "play" ||
    state.play === null ||
    (result?.type !== "contract" && result?.type !== "misere") ||
    result.declarer === viewer
  ) {
    return hands;
  }
  const shown = [...hands] as [
    readonly Card[] | null,
    readonly Card[] | null,
    readonly Card[] | null,
  ];
  shown[result.declarer] = state.play.hands[result.declarer];
  return shown;
}
