import {
  applyAuctionAction,
  bidRank,
  type AuctionResult,
  type Bid,
  type Seat,
  type Trump,
} from "./auction.js";
import {
  finishDeal,
  finishHalfWhist,
  finishPassedContract,
  finishWithoutThree,
} from "./deal-result.js";
import { type Card, type Deal } from "./deck.js";
import {
  applyDefenseAction,
  createDefenseState,
  type DefenseAction,
} from "./defense.js";
import {
  accept,
  currentHands,
  dealerSeat,
  firstLeader,
  reject,
  startDeal,
} from "./game-state.js";
import type {
  DealLayout,
  GameAction,
  GameSeatView,
  GameSettings,
  GameState,
  GameTransition,
} from "./game-types.js";
import {
  contractTrump,
  declarerOpens,
  gameTurn,
  lightPartners,
  openWhistHand,
  playedHand,
  shownWhistHands,
  styleChoiceDue,
  visibleTalon,
} from "./hand-view.js";
import {
  answerProposal,
  cancelProposal,
  clearClosedOffer,
  offerProposal,
  proposalOffers,
  proposalReplies,
  proposedHands,
} from "./proposals.js";
import {
  createBulletScore,
  scoreOpenTalon,
  scoreSince,
  scoreTalonThrow,
  settleBullet,
  type BulletScore,
} from "./scoring.js";
import {
  raspasMinimumOrderLevel,
  raspasMultiplier,
  type ContractLevel,
} from "./settings.js";
import {
  advanceSpeech,
  bidWord,
  raspasCallWord,
  speechForAuction,
  speechForDefense,
  speechForSixDiamondsOrder,
  talonAceRequest,
  talonAceWord,
  visibleSpeechLog,
  withSpeech,
} from "./speech.js";
import { discardCards, takeTalon } from "./talon.js";
import { createTrickPlay, playCard, type TrickPlayState } from "./tricks.js";
import { view as trickView } from "./view.js";
export type {
  DealDefense,
  DealDefenseRole,
  DealLayout,
  GameAction,
  GamePhase,
  GameSeatView,
  GameSettings,
  GameState,
  GameTransition,
  PlayedDeal,
  Proposal,
  SpeechDeal,
  TableSpeech,
} from "./game-types.js";

const BID_LADDER: readonly Bid[] = [
  ...contractBids(6),
  ...contractBids(7),
  ...contractBids(8),
  { type: "misere" },
  ...contractBids(9),
  ...contractBids(10),
];

export function createGame(
  settings: GameSettings,
  source: number | Deal,
  score: BulletScore = createBulletScore(),
  raspasIndex = 0,
): GameState {
  return startDeal(
    settings,
    typeof source === "number" ? source : 0,
    0,
    score,
    raspasIndex,
    null,
    [],
    [],
    typeof source === "number" ? undefined : source,
  );
}

export function applyGameAction(
  state: GameState,
  seat: Seat,
  action: GameAction,
  dealSource?: () => Deal,
): GameTransition {
  if (action.type === "rematch") {
    if (state.phase !== "finished") {
      return reject(state, "invalidPhase");
    }
    return accept(createGame(state.settings, dealSource?.() ?? state.seed));
  }
  if (state.phase === "finished") {
    return reject(state, "finished");
  }

  if (state.phase === "auction") {
    if (action.type !== "auction") {
      return reject(state, "invalidPhase");
    }
    if (
      action.action.type === "bid" &&
      !meetsRaspasFloor(state, action.action.bid)
    ) {
      return reject(state, "bidTooLow");
    }
    const transition = applyAuctionAction(state.auction, seat, action.action);
    if (!transition.accepted) {
      return reject(state, transition.reason);
    }
    const voiced = {
      ...state,
      ...speechForAuction(state, seat, action.action),
    };
    if (transition.state.result === null) {
      return accept({ ...voiced, auction: transition.state });
    }

    const auctionResult = transition.state.result;
    const talon = takeTalon(voiced.dealtCards, auctionResult);
    if (auctionResult.type === "raspas") {
      return accept({
        ...voiced,
        ...withSpeech(voiced, null, raspasCallWord(voiced), false),
        phase: "raspas",
        auction: transition.state,
        auctionResult,
        talon,
        play: null,
        raspasOrder: null,
        prikupShown: 0,
      });
    }
    const score = openedTalonScore(voiced, auctionResult);
    const quiet = {
      ...voiced,
      ...advanceSpeech(voiced),
    };
    const dealer = dealerSeat(state.dealNumber);
    const aceCount =
      voiced.settings.throwTalon &&
      auctionResult.type === "contract" &&
      auctionResult.declarer !== dealer
        ? voiced.dealtCards.talon.filter((card) => card.rank === 14).length
        : 0;
    const ace = talonAceWord(aceCount);
    const noted =
      ace === null
        ? quiet
        : {
            ...quiet,
            ...withSpeech(
              withSpeech(quiet, null, ace, true),
              dealerSeat(state.dealNumber),
              talonAceRequest(aceCount),
              false,
            ),
          };
    return accept({
      ...noted,
      phase: "discard",
      auction: transition.state,
      auctionResult,
      talon,
      score,
    });
  }

  if (state.phase === "discard") {
    if (state.talon === null || state.auctionResult === null) {
      return reject(state, "invalidPhase");
    }
    if (action.type === "throwTalon") {
      return throwTalonInFace(state, seat, dealSource);
    }
    if (action.type !== "discard") {
      return reject(state, "invalidPhase");
    }
    const transition = discardCards(state.talon, seat, action.cards);
    if (!transition.accepted) {
      return reject(state, transition.reason);
    }
    return accept(
      continueAfterDiscard(state, transition.state, state.score, dealSource),
    );
  }

  if (state.phase === "order") {
    if (
      state.auctionResult === null ||
      state.talon === null ||
      state.auctionResult.type === "raspas"
    ) {
      return reject(state, "invalidPhase");
    }
    if (action.type === "withoutThree") {
      if (state.auctionResult.type !== "contract") {
        return reject(state, "invalidPhase");
      }
      if (seat !== state.auctionResult.declarer) {
        return reject(state, "notYourTurn");
      }
      return accept(
        finishWithoutThree(
          {
            ...state,
            ...withSpeech(state, seat, "без трёх", true),
          },
          dealSource,
        ),
      );
    }
    if (action.type !== "order") {
      return reject(state, "invalidPhase");
    }
    if (seat !== state.auctionResult.declarer) {
      return reject(state, "notYourTurn");
    }
    if (!isLegalOrder(state, action.bid)) {
      return reject(state, "bidNotHigher");
    }
    const auctionResult =
      action.bid.type === "misere"
        ? { type: "misere" as const, declarer: seat }
        : {
            type: "contract" as const,
            declarer: seat,
            level: action.bid.level,
            trump: action.bid.trump,
          };
    const auction = { ...state.auction, result: auctionResult };
    const bidSpeech =
      action.bid.type === "contract" &&
      action.bid.level === 6 &&
      action.bid.trump === "diamonds"
        ? speechForSixDiamondsOrder(state, seat, action.bid)
        : withSpeech(state, seat, bidWord(action.bid), true);
    const voiced = {
      ...state,
      ...bidSpeech,
    };
    if (auctionResult.type === "misere") {
      if ((state.misereCalls ?? 0) < 1) {
        return accept({ ...voiced, misereCalls: 1 });
      }
      return accept({
        ...voiced,
        ...advanceSpeech(voiced),
        phase: "play",
        auction,
        auctionResult,
        ...withPlay(state, state.talon.hands, "noTrump"),
      });
    }
    return accept({
      ...voiced,
      ...advanceSpeech(voiced),
      phase: "defense",
      auction,
      auctionResult,
      defense: createDefenseState(auctionResult),
    });
  }

  if (state.phase === "defense") {
    if (action.type !== "defense" || state.defense === null || state.talon === null) {
      return reject(state, "invalidPhase");
    }
    const transition = applyDefenseAction(state.defense, seat, action.action);
    if (!transition.accepted) {
      return reject(state, transition.reason);
    }
    const voiced = {
      ...state,
      ...speechForDefense(state, seat, action.action),
    };
    if (transition.state.phase !== "play") {
      if (transition.state.phase === "style" && declarerOpens(voiced)) {
        return accept({
          ...voiced,
          phase: "play",
          defense: transition.state,
          ...withPlay(
            state,
            state.talon.hands,
            state.auctionResult?.type === "contract"
              ? state.auctionResult.trump
              : "noTrump",
          ),
        });
      }
      return accept({ ...voiced, defense: transition.state });
    }
    if (transition.state.whistlers.length === 0) {
      const closed = { ...voiced, defense: transition.state };
      return accept(
        transition.state.halfWhist === null
          ? finishPassedContract(closed, dealSource)
          : finishHalfWhist(closed, dealSource),
      );
    }
    return accept({
      ...voiced,
      phase: "play",
      defense: transition.state,
      ...withPlay(
        state,
        state.talon.hands,
        state.auctionResult?.type === "contract"
          ? state.auctionResult.trump
          : "noTrump",
      ),
    });
  }

  if (state.phase === "raspas") {
    if (action.type !== "openTalon" || state.talon === null) {
      return reject(state, "invalidPhase");
    }
    const talon = state.dealtCards.talon;
    const chosen = talon[action.index];
    if (chosen === undefined) {
      return reject(state, "invalidCard");
    }
    const other = talon[action.index === 0 ? 1 : 0];
    if (other === undefined) {
      return reject(state, "invalidCard");
    }
    const leader = firstLeader(state.dealNumber);
    return accept({
      ...state,
      phase: "play",
      raspasOrder: [chosen, other],
      prikupShown: 1,
      ...withPlay(state, state.talon.hands, "noTrump", {
        forcedSuit: chosen.suit,
        turn: leader,
      }),
    });
  }

  if (state.phase === "play" && state.proposal != null) {
    if (action.type === "cancelProposal") {
      return cancelProposal(state, seat);
    }
    if (action.type !== "proposal") {
      return reject(state, "invalidPhase");
    }
    return answerProposal(state, seat, action.answer, dealSource);
  }

  if (state.phase === "play" && action.type === "propose") {
    return offerProposal(state, seat, action.tricks);
  }

  if (styleChoiceDue(state)) {
    if (
      action.type !== "defense" ||
      state.defense === null ||
      (action.action.type !== "light" && action.action.type !== "dark") ||
      seat !== state.defense.whistlers[0]
    ) {
      return reject(state, "notYourTurn");
    }
    const choice = applyDefenseAction(state.defense, seat, action.action);
    if (!choice.accepted) {
      return reject(state, choice.reason);
    }
    return accept({
      ...state,
      ...speechForDefense(state, seat, action.action),
      defense: choice.state,
    });
  }

  if (action.type !== "playCard" || state.play === null) {
    return reject(state, "invalidPhase");
  }
  const handSeat = playedHand(state, seat);
  if (handSeat === null) {
    return reject(state, "notYourTurn");
  }
  const transition = playCard(state.play, handSeat, action.card);
  if (!transition.accepted) {
    return reject(state, transition.reason);
  }
  if (state.auctionResult?.type === "raspas") {
    return accept(continueRaspas(state, transition.state, dealSource));
  }
  const resumed = clearClosedOffer(state);
  if (transition.state.result === null) {
    return accept({ ...resumed, play: transition.state });
  }
  return accept(finishDeal({ ...resumed, play: transition.state }, dealSource));
}

export function gameView(state: GameState, seat: Seat): GameSeatView {
  const hand = currentHands(state)[seat];
  const playView = state.play === null ? null : trickView(state.play, seat);

  return {
    proposal: state.proposal ?? null,
    phase: state.phase,
    hand,
    handSizes: currentHands(state).map((cards) => cards.length) as [
      number,
      number,
      number,
    ],
    auction: state.auction,
    defense: state.defense,
    currentTrick: playView?.currentTrick ?? [],
    trickHistory: raspasTrickHistory(state),
    tricksWon: playView?.tricksWon ?? [0, 0, 0],
    score: state.score,
    raspasIndex: state.raspasIndex,
    raspasMultiplier: gameRaspasMultiplier(
      state.settings.raspasProgression,
      state.raspasIndex,
    ),
    dealNumber: state.dealNumber,
    trump: contractTrump(state),
    talonCards: visibleTalon(state, seat),
    discarded:
      state.talon === null
        ? []
        : state.talon.faced || state.talon.declarer === seat
          ? state.talon.discarded
          : [],
    facedTalon: state.talon?.faced === true,
    openHand: openWhistHand(state),
    openSeat: lightPartners(state)?.passer ?? null,
    shownHands: proposedHands(shownWhistHands(state, seat), state, seat),
    turn: gameTurn(state),
    allowedActions: allowedGameActions(state, seat),
    settlement: state.phase === "finished" ? settleBullet(state.score) : null,
    prikup: prikupCards(state),
    lastLayout: state.lastLayout ?? null,
    deals: state.deals ?? [],
    speech: state.speech ?? [],
    speechStep: state.speechStep ?? 0,
    speechLog: visibleSpeechLog(state),
  };
}

export function gameRaspasMultiplier(
  progression: GameSettings["raspasProgression"],
  index: number,
): number {
  return raspasMultiplier(progression, index);
}

function allowedGameActions(state: GameState, seat: Seat): readonly GameAction[] {
  if (state.phase === "auction" && state.auction.turn === seat) {
    if (
      state.auction.misereBidder === seat &&
      state.auction.highestBid?.type === "contract"
    ) {
      return [{ type: "auction", action: { type: "pass" } }];
    }
    const currentRank =
      state.auction.highestBid === null ? -2 : bidRank(state.auction.highestBid);
    return [
      { type: "auction", action: { type: "pass" } },
      ...BID_LADDER.filter((bid) => {
        if (bid.type === "misere" && state.auction.contractBidders[seat]) {
          return false;
        }
        return bidRank(bid) > currentRank && meetsRaspasFloor(state, bid);
      }).map((bid) => ({
        type: "auction" as const,
        action: { type: "bid" as const, bid },
      })),
    ];
  }
  if (
    state.phase === "order" &&
    state.auctionResult !== null &&
    state.auctionResult.type !== "raspas" &&
    state.auctionResult.declarer === seat
  ) {
    const result = state.auctionResult;
    const orders = BID_LADDER.filter((bid) => isLegalOrder(state, bid)).map((bid) => ({
      type: "order" as const,
      bid,
    }));
    return result.type === "contract"
      ? [...orders, { type: "withoutThree" as const }]
      : orders;
  }
  if (state.phase === "raspas") {
    return [
      { type: "openTalon", index: 0 },
      { type: "openTalon", index: 1 },
    ];
  }
  if (state.phase === "discard" && state.talon?.declarer === seat) {
    const hand = state.talon.hands[seat];
    const actions: GameAction[] = canThrowTalon(state, seat)
      ? [{ type: "throwTalon" }]
      : [];
    for (let first = 0; first < hand.length - 1; first += 1) {
      for (let second = first + 1; second < hand.length; second += 1) {
        actions.push({
          type: "discard",
          cards: [hand[first], hand[second]],
        });
      }
    }
    return actions;
  }
  if (state.phase === "defense" && state.defense?.turn === seat) {
    const candidates: DefenseAction[] = [
      { type: "pass" },
      { type: "whist" },
      { type: "halfWhist" },
      { type: "light" },
      { type: "dark" },
    ];
    return candidates
      .filter((action) => applyDefenseAction(state.defense!, seat, action).accepted)
      .map((action) => ({ type: "defense", action }));
  }
  if (state.phase === "play" && styleChoiceDue(state)) {
    return seat === state.defense?.whistlers[0]
      ? [
          { type: "defense", action: { type: "light" } },
          { type: "defense", action: { type: "dark" } },
        ]
      : [];
  }
  if (state.phase === "play" && state.play !== null) {
    if (state.proposal != null) {
      return proposalReplies(state, seat);
    }
    const offers = proposalOffers(state, seat);
    const handSeat = playedHand(state, seat);
    if (handSeat === null) {
      return offers;
    }
    return [
      ...offers,
      ...state.play.hands[handSeat]
        .filter((card) => playCard(state.play!, handSeat, card).accepted)
        .map((card) => ({ type: "playCard" as const, card })),
    ];
  }
  return [];
}

function throwTalonInFace(
  state: GameState,
  seat: Seat,
  dealSource?: () => Deal,
): GameTransition {
  if (
    state.phase !== "discard" ||
    state.talon === null ||
    state.auctionResult === null ||
    !canThrowTalon(state, seat)
  ) {
    return reject(state, "invalidThrow");
  }
  const [first, second] = state.dealtCards.talon;
  if (first === undefined || second === undefined) {
    return reject(state, "invalidThrow");
  }
  const transition = discardCards(state.talon, seat, [first, second]);
  if (!transition.accepted) {
    return reject(state, transition.reason);
  }
  const voiced = {
    ...state,
    ...withSpeech(state, seat, "прикуп в лицо", true),
  };
  return accept(
    continueAfterDiscard(
      voiced,
      { ...transition.state, faced: true },
      scoreSince(
        state.scoreAtDealStart ?? state.score,
        scoreTalonThrow(state.score, dealerSeat(state.dealNumber)),
      ),
      dealSource,
    ),
  );
}

function openedTalonScore(state: GameState, result: AuctionResult): BulletScore {
  if (
    !state.settings.throwTalon ||
    result.type !== "contract" ||
    result.declarer === dealerSeat(state.dealNumber)
  ) {
    return state.score;
  }
  const scored = scoreOpenTalon(
    state.score,
    dealerSeat(state.dealNumber),
    state.dealtCards.talon,
    state.settings.bulletTarget,
  );
  if (scored === state.score) {
    return state.score;
  }
  return scoreSince(state.scoreAtDealStart ?? state.score, scored);
}

function canThrowTalon(state: GameState, seat: Seat): boolean {
  return (
    state.settings.throwTalon &&
    state.talon?.declarer === seat &&
    seat !== dealerSeat(state.dealNumber)
  );
}

function continueAfterDiscard(
  state: GameState,
  talon: NonNullable<GameState["talon"]>,
  score: BulletScore,
  dealSource?: () => Deal,
): GameState {
  if (state.auctionResult === null || state.auctionResult.type === "raspas") {
    throw new Error("Cannot leave the discard without a contract");
  }
  return {
    ...state,
    phase: "order",
    score,
    talon,
  };
}

function meetsRaspasFloor(state: GameState, bid: Bid): boolean {
  return (
    bid.type !== "contract" ||
    bid.level >=
      raspasMinimumOrderLevel(state.settings.raspasExit, state.raspasIndex)
  );
}

function orderFloor(state: GameState): Bid | null {
  const result = state.auctionResult;
  if (result === null || result.type === "raspas") {
    return null;
  }
  if (result.type === "misere") {
    return { type: "misere" };
  }
  const raspasFloor = raspasMinimumOrderLevel(
    state.settings.raspasExit,
    state.raspasIndex,
  );
  const configuredFloor: Bid = {
    type: "contract",
    level: Math.max(result.level, raspasFloor) as ContractLevel,
    trump: raspasFloor > result.level ? "spades" : result.trump,
  };
  return configuredFloor;
}

function isLegalOrder(state: GameState, bid: Bid): boolean {
  const result = state.auctionResult;
  if (result === null || result.type === "raspas") {
    return false;
  }
  if (result.type === "misere") {
    return bid.type === "misere";
  }
  if (bid.type === "misere") {
    return false;
  }
  const floor = orderFloor(state);
  return floor !== null && bidRank(bid) >= bidRank(floor);
}

function withPlay(
  state: GameState,
  hands: DealLayout["hands"],
  trump: Trump,
  patch: Partial<TrickPlayState> = {},
): { play: TrickPlayState; layoutHands: DealLayout["hands"] } {
  return {
    layoutHands: hands,
    play: {
      ...createTrickPlay(hands, firstLeader(state.dealNumber), trump),
      ...patch,
    },
  };
}

function continueRaspas(
  state: GameState,
  play: TrickPlayState,
  dealSource?: () => Deal,
): GameState {
  if (play.result !== null) {
    return finishDeal({ ...state, play }, dealSource);
  }
  if (
    play.currentTrick.length > 0 ||
    state.raspasOrder === undefined ||
    state.raspasOrder === null
  ) {
    return { ...state, play };
  }
  // The player on the first word leads the first three tricks, whoever took them.
  if (play.completedTricks < 3) {
    const leader = firstLeader(state.dealNumber);
    if (play.completedTricks === 1) {
      return {
        ...state,
        prikupShown: 2,
        play: {
          ...play,
          forcedSuit: state.raspasOrder[1].suit,
          turn: leader,
        },
      };
    }
    return {
      ...state,
      play: { ...play, turn: leader, forcedSuit: null },
    };
  }
  return { ...state, play };
}

function raspasTrickHistory(state: GameState): TrickPlayState["trickHistory"] {
  const history = state.play?.trickHistory ?? [];
  if (
    state.auctionResult?.type !== "raspas" ||
    state.raspasOrder === undefined ||
    state.raspasOrder === null
  ) {
    return history;
  }
  const order = state.raspasOrder;
  return history.map((trick, index) => {
    if (index === 0) {
      return { ...trick, talonCard: order[0] };
    }
    if (index === 1) {
      return { ...trick, talonCard: order[1] };
    }
    return trick;
  });
}

function prikupCards(
  state: GameState,
): readonly (Card | { readonly faceDown: true })[] {
  if (state.auctionResult?.type !== "raspas") {
    return [];
  }
  if (state.phase === "raspas") {
    return [{ faceDown: true }, { faceDown: true }];
  }
  if (
    state.phase !== "play" ||
    state.play === null ||
    state.raspasOrder === undefined ||
    state.raspasOrder === null ||
    state.play.completedTricks >= 2
  ) {
    return [];
  }
  const shown = state.prikupShown ?? 0;
  const cards = state.raspasOrder.map((card, index) =>
    index < shown ? card : { faceDown: true as const },
  );
  return state.play.completedTricks >= 1 ? cards.slice(1) : cards;
}

function contractBids(level: 6 | 7 | 8 | 9 | 10): readonly Bid[] {
  const trumps: readonly Trump[] = ["spades", "clubs", "diamonds", "hearts", "noTrump"];
  return trumps.map((trump) => ({ type: "contract", level, trump }));
}
