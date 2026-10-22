import {
  applyAuctionAction,
  bidRank,
  createAuction,
  type AuctionAction,
  type AuctionResult,
  type AuctionState,
  type Bid,
  type Seat,
  type Trump,
} from "./auction.js";
import { deal, type Card, type Deal } from "./deck.js";
import {
  applyDefenseAction,
  createDefenseState,
  type DefenseAction,
  type DefenseState,
} from "./defense.js";
import {
  createBulletScore,
  isBulletComplete,
  scoreDeal,
  scoreOpenTalon,
  scoreSince,
  scoreTalonThrow,
  settleBullet,
  type BulletScore,
  type ScoredDeal,
} from "./scoring.js";
import { discardCards, takeTalon, type TalonState } from "./talon.js";
import {
  createTrickPlay,
  playCard,
  type TrickPlayState,
} from "./tricks.js";
import {
  nextRaspasIndex,
  raspasMultiplier,
  type TableSettings,
} from "./settings.js";
import { view as trickView, type VisiblePlayedCard } from "./view.js";

export type GameSettings = TableSettings;

export type GamePhase =
  | "auction"
  | "discard"
  | "order"
  | "defense"
  | "raspas"
  | "play"
  | "finished";

export type GameAction =
  | { readonly type: "auction"; readonly action: AuctionAction }
  | {
      readonly type: "discard";
      readonly cards: readonly [Card, Card];
    }
  | { readonly type: "throwTalon" }
  | { readonly type: "order"; readonly bid: Bid }
  | { readonly type: "withoutThree" }
  | { readonly type: "openTalon"; readonly index: 0 | 1 }
  | { readonly type: "defense"; readonly action: DefenseAction }
  | { readonly type: "playCard"; readonly card: Card }
  | { readonly type: "propose"; readonly tricks: number }
  | { readonly type: "proposal"; readonly answer: "agree" | "decline" }
  | { readonly type: "rematch"; readonly seed: number };

export interface Proposal {
  readonly tricks: number;
  readonly answers: readonly [
    "agree" | "decline" | null,
    "agree" | "decline" | null,
    "agree" | "decline" | null,
  ];
}

export interface PlayedDeal {
  readonly number: number;
  readonly declarer: Seat | null;
  readonly contract: string;
  readonly tricks: readonly [number, number, number];
  readonly delta: BulletScore["last"];
}

export interface DealLayout {
  readonly hands: readonly [
    readonly Card[],
    readonly Card[],
    readonly Card[],
  ];
  readonly talon: readonly Card[];
  readonly discarded: readonly Card[];
  readonly tricks: readonly [number, number, number];
}

export interface TableSpeech {
  readonly seat: Seat | null;
  readonly word: string;
  readonly step: number;
}

export interface SpeechDeal {
  readonly deal: number;
  readonly lines: readonly TableSpeech[];
}

export interface GameState {
  readonly settings: GameSettings;
  readonly phase: GamePhase;
  readonly seed: number;
  readonly dealNumber: number;
  readonly raspasIndex: number;
  readonly score: BulletScore;
  readonly scoreAtDealStart?: BulletScore;
  readonly dealtCards: Deal;
  readonly auction: AuctionState;
  readonly auctionResult: AuctionResult | null;
  readonly talon: TalonState | null;
  readonly defense: DefenseState | null;
  readonly play: TrickPlayState | null;
  readonly proposal?: Proposal | null;
  readonly lastLayout?: DealLayout | null;
  readonly deals?: readonly PlayedDeal[];
  readonly layoutHands?: DealLayout["hands"] | null;
  readonly raspasOrder?: readonly [Card, Card] | null;
  readonly prikupShown?: number;
  readonly misereCalls?: number;
  readonly speech?: readonly TableSpeech[];
  readonly speechStep?: number;
  readonly speechLog?: readonly SpeechDeal[];
}

export type GameTransition =
  | { readonly accepted: true; readonly state: GameState }
  | {
      readonly accepted: false;
      readonly reason: string;
      readonly state: GameState;
    };

export interface GameSeatView {
  readonly phase: GamePhase;
  readonly hand: readonly Card[];
  readonly handSizes: readonly [number, number, number];
  readonly auction: AuctionState;
  readonly defense: DefenseState | null;
  readonly currentTrick: readonly VisiblePlayedCard[];
  readonly trickHistory: TrickPlayState["trickHistory"];
  readonly tricksWon: TrickPlayState["tricksWon"];
  readonly score: BulletScore;
  readonly raspasIndex: number;
  readonly raspasMultiplier: number;
  readonly dealNumber: number;
  readonly trump: Trump | null;
  readonly talonCards: readonly Card[];
  readonly discarded: readonly Card[];
  readonly facedTalon: boolean;
  readonly openHand: readonly Card[];
  readonly openSeat: Seat | null;
  readonly shownHands: readonly [
    readonly Card[] | null,
    readonly Card[] | null,
    readonly Card[] | null,
  ];
  readonly turn: Seat | null;
  readonly allowedActions: readonly GameAction[];
  readonly settlement: readonly [number, number, number] | null;
  readonly prikup: readonly (Card | { readonly faceDown: true })[];
  readonly lastLayout: DealLayout | null;
  readonly deals: readonly PlayedDeal[];
  readonly speech: readonly TableSpeech[];
  readonly speechStep: number;
  readonly speechLog: readonly SpeechDeal[];
}

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
  seed: number,
  score: BulletScore = createBulletScore(),
  raspasIndex = 0,
): GameState {
  return startDeal(settings, seed, 0, score, raspasIndex);
}

export function applyGameAction(
  state: GameState,
  seat: Seat,
  action: GameAction,
): GameTransition {
  if (action.type === "rematch") {
    if (state.phase !== "finished") {
      return reject(state, "invalidPhase");
    }
    if (!Number.isSafeInteger(action.seed)) {
      return reject(state, "invalidSeed");
    }
    return accept(createGame(state.settings, action.seed));
  }
  if (state.phase === "finished") {
    return reject(state, "finished");
  }

  if (state.phase === "auction") {
    if (action.type !== "auction") {
      return reject(state, "invalidPhase");
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
        ...withSpeech(voiced, null, "распасы", false),
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
    const ace = talonAceWord(bulletGain(voiced.score, score));
    const noted =
      ace === null
        ? quiet
        : { ...quiet, ...withSpeech(quiet, null, ace, true) };
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
      return throwTalonInFace(state, seat);
    }
    if (action.type !== "discard") {
      return reject(state, "invalidPhase");
    }
    const transition = discardCards(state.talon, seat, action.cards);
    if (!transition.accepted) {
      return reject(state, transition.reason);
    }
    return accept(
      continueAfterDiscard(state, transition.state, state.score),
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
        finishWithoutThree({
          ...state,
          ...withSpeech(state, seat, "без трёх", true),
        }),
      );
    }
    if (action.type !== "order") {
      return reject(state, "invalidPhase");
    }
    if (seat !== state.auctionResult.declarer) {
      return reject(state, "notYourTurn");
    }
    if (!isLegalOrder(state.auctionResult, action.bid)) {
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
    const voiced = {
      ...state,
      ...withSpeech(state, seat, bidWord(action.bid), true),
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
    if (
      action.type !== "defense" ||
      state.defense === null ||
      state.talon === null
    ) {
      return reject(state, "invalidPhase");
    }
    const transition = applyDefenseAction(
      state.defense,
      seat,
      action.action,
    );
    if (!transition.accepted) {
      return reject(state, transition.reason);
    }
    const voiced = {
      ...state,
      ...speechForDefense(state, seat, action.action),
    };
    if (transition.state.phase !== "play") {
      if (
        transition.state.phase === "style" &&
        declarerOpens(voiced)
      ) {
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
          ? finishPassedContract(closed)
          : finishHalfWhist(closed),
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
    if (action.type !== "proposal") {
      return reject(state, "invalidPhase");
    }
    return answerProposal(state, seat, action.answer);
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
    return accept(continueRaspas(state, transition.state));
  }
  if (transition.state.result === null) {
    return accept({ ...state, play: transition.state });
  }
  return accept(finishDeal({ ...state, play: transition.state }));
}

export function gameView(state: GameState, seat: Seat): GameSeatView {
  const hand = currentHands(state)[seat];
  const playView =
    state.play === null ? null : trickView(state.play, seat);

  return {
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
    talonCards: visibleTalon(state),
    discarded:
      state.talon === null
        ? []
        : state.talon.faced ||
            state.talon.declarer === seat ||
            misereCardsOpen(state)
          ? state.talon.discarded
          : [],
    facedTalon: state.talon?.faced === true,
    openHand: openWhistHand(state),
    openSeat: lightPartners(state)?.passer ?? null,
    shownHands: proposedHands(shownWhistHands(state, seat), state, seat),
    turn: gameTurn(state),
    allowedActions: allowedGameActions(state, seat),
    settlement:
      state.phase === "finished" ? settleBullet(state.score) : null,
    prikup: prikupCards(state),
    lastLayout: state.lastLayout ?? null,
    deals: state.deals ?? [],
    speech: state.speech ?? [],
    speechStep: state.speechStep ?? 0,
    speechLog: visibleSpeechLog(state),
  };
}

function visibleSpeechLog(state: GameState): readonly SpeechDeal[] {
  const prior = state.speechLog ?? [];
  const lines = state.speech ?? [];
  if (lines.length === 0) {
    return prior;
  }
  return [...prior, { deal: state.dealNumber + 1, lines }];
}

function lightPartners(
  state: GameState,
): { readonly passer: Seat; readonly whistler: Seat } | null {
  if (state.defense?.whistStyle !== "light" || state.phase !== "play") {
    return null;
  }
  const whistler = state.defense.whistlers[0];
  const passer = state.defense.defenders.find(
    (defender) => state.defense?.decisions[defender] === "pass",
  );
  if (whistler === undefined || passer === undefined) {
    return null;
  }
  return { passer, whistler };
}

function playedHand(state: GameState, actor: Seat): Seat | null {
  if (state.phase !== "play" || state.play?.turn == null) {
    return null;
  }
  const partners = lightPartners(state);
  if (partners !== null && state.play.turn === partners.passer) {
    return actor === partners.whistler ? partners.passer : null;
  }
  return state.play.turn === actor ? actor : null;
}

function openWhistHand(state: GameState): readonly Card[] {
  const partners = lightPartners(state);
  if (partners === null || state.play === null) {
    return [];
  }
  return state.play.hands[partners.passer];
}

function misereCardsOpen(state: GameState): boolean {
  return (
    state.auctionResult?.type === "misere" &&
    (state.phase === "discard" || state.phase === "order")
  );
}

function shownWhistHands(
  state: GameState,
  viewer: Seat,
): readonly [readonly Card[] | null, readonly Card[] | null, readonly Card[] | null] {
  const hidden = [null, null, null] as [
    readonly Card[] | null,
    readonly Card[] | null,
    readonly Card[] | null,
  ];
  if (state.auctionResult?.type === "misere") {
    const hands = [...hidden] as [
      readonly Card[] | null,
      readonly Card[] | null,
      readonly Card[] | null,
    ];
    if (misereCardsOpen(state)) {
      const declarer = state.auctionResult.declarer;
      if (declarer !== viewer) {
        hands[declarer] = currentHands(state)[declarer];
      }
      return hands;
    }
    if (state.phase === "play" && state.play !== null) {
      const declarer = state.auctionResult.declarer;
      for (const seat of [0, 1, 2] as const) {
        if (seat !== declarer && seat !== viewer) {
          hands[seat] = state.play.hands[seat];
        }
      }
      return hands;
    }
    return hidden;
  }
  const partners = lightPartners(state);
  if (partners === null || state.play === null) {
    return hidden;
  }
  const hands = [...hidden] as [
    readonly Card[] | null,
    readonly Card[] | null,
    readonly Card[] | null,
  ];
  hands[partners.passer] = state.play.hands[partners.passer];
  hands[partners.whistler] = state.play.hands[partners.whistler];
  hands[viewer] = null;
  return hands;
}

function declarerOpens(state: GameState): boolean {
  return (
    state.auctionResult?.type === "contract" &&
    firstLeader(state.dealNumber) === state.auctionResult.declarer
  );
}

function styleChoiceDue(state: GameState): boolean {
  return (
    state.phase === "play" &&
    state.defense?.phase === "style" &&
    (state.play?.currentTrick.length ?? 0) > 0
  );
}

function gameTurn(state: GameState): Seat | null {
  if (state.phase === "auction") {
    return state.auction.turn;
  }
  if (state.phase === "discard" || state.phase === "order") {
    return state.auctionResult?.type === "raspas"
      ? null
      : (state.auctionResult?.declarer ?? state.talon?.declarer ?? null);
  }
  if (state.phase === "defense") {
    return state.defense?.turn ?? null;
  }
  if (state.phase === "play") {
    if (styleChoiceDue(state)) {
      return state.defense?.whistlers[0] ?? null;
    }
    const partners = lightPartners(state);
    if (partners !== null && state.play?.turn === partners.passer) {
      return partners.whistler;
    }
    return state.play?.turn ?? null;
  }
  return null;
}

function visibleTalon(state: GameState): readonly Card[] {
  const result = state.auctionResult;
  if (result?.type !== "contract" && result?.type !== "misere") {
    return [];
  }
  const choosingWhist =
    state.phase === "defense" && state.defense?.phase === "whist";
  if (
    state.phase !== "discard" &&
    state.phase !== "order" &&
    !choosingWhist
  ) {
    return [];
  }
  return state.dealtCards.talon;
}

function contractTrump(state: GameState): Trump | null {
  if (state.auctionResult?.type !== "contract") {
    return null;
  }
  return state.auctionResult.trump === "noTrump"
    ? null
    : state.auctionResult.trump;
}

export function gameRaspasMultiplier(
  progression: GameSettings["raspasProgression"],
  index: number,
): number {
  return raspasMultiplier(progression, index);
}

function allowedGameActions(
  state: GameState,
  seat: Seat,
): readonly GameAction[] {
  if (state.phase === "auction" && state.auction.turn === seat) {
    if (
      state.auction.misereBidder === seat &&
      state.auction.highestBid?.type === "contract"
    ) {
      return [{ type: "auction", action: { type: "pass" } }];
    }
    const currentRank =
      state.auction.highestBid === null
        ? -2
        : bidRank(state.auction.highestBid);
    return [
      { type: "auction", action: { type: "pass" } },
      ...BID_LADDER.filter((bid) => {
        if (bid.type === "misere" && state.auction.contractBidders[seat]) {
          return false;
        }
        return bidRank(bid) > currentRank;
      }).map(
        (bid) => ({
          type: "auction" as const,
          action: { type: "bid" as const, bid },
        }),
      ),
    ];
  }
  if (
    state.phase === "order" &&
    state.auctionResult !== null &&
    state.auctionResult.type !== "raspas" &&
    state.auctionResult.declarer === seat
  ) {
    const result = state.auctionResult;
    const orders = BID_LADDER.filter((bid) => isLegalOrder(result, bid)).map(
      (bid) => ({ type: "order" as const, bid }),
    );
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
  if (
    state.phase === "discard" &&
    state.talon?.declarer === seat
  ) {
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
  if (
    state.phase === "defense" &&
    state.defense?.turn === seat
  ) {
    const candidates: DefenseAction[] = [
      { type: "pass" },
      { type: "whist" },
      { type: "halfWhist" },
      { type: "light" },
      { type: "dark" },
    ];
    return candidates
      .filter(
        (action) =>
          applyDefenseAction(state.defense!, seat, action).accepted,
      )
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

function proposalAvailable(state: GameState): boolean {
  return (
    state.phase === "play" &&
    state.play !== null &&
    state.proposal == null &&
    state.auctionResult?.type === "contract" &&
    state.defense?.whistlers.length === 1 &&
    !styleChoiceDue(state)
  );
}

function proposalOffers(state: GameState, seat: Seat): readonly GameAction[] {
  if (!proposalAvailable(state) || state.auctionResult?.type !== "contract") {
    return [];
  }
  if (seat !== state.auctionResult.declarer || state.play === null) {
    return [];
  }
  const floor = Math.max(1, state.play.tricksWon[seat]);
  const offers: GameAction[] = [];
  for (let tricks = floor; tricks <= 10; tricks += 1) {
    offers.push({ type: "propose", tricks });
  }
  return offers;
}

function proposalReplies(state: GameState, seat: Seat): readonly GameAction[] {
  const proposal = state.proposal;
  if (
    proposal == null ||
    state.auctionResult?.type !== "contract" ||
    seat === state.auctionResult.declarer ||
    proposal.answers[seat] !== null
  ) {
    return [];
  }
  return [
    { type: "proposal", answer: "agree" },
    { type: "proposal", answer: "decline" },
  ];
}

function offerProposal(
  state: GameState,
  seat: Seat,
  tricks: number,
): GameTransition {
  if (!proposalAvailable(state) || state.auctionResult?.type !== "contract") {
    return reject(state, "invalidPhase");
  }
  if (seat !== state.auctionResult.declarer) {
    return reject(state, "notYourTurn");
  }
  const floor = Math.max(1, state.play?.tricksWon[seat] ?? 0);
  if (!Number.isInteger(tricks) || tricks < floor || tricks > 10) {
    return reject(state, "invalidProposal");
  }
  return accept({
    ...state,
    ...withSpeech(state, seat, `${tricks} запишем?`, true),
    proposal: { tricks, answers: [null, null, null] },
  });
}

function answerProposal(
  state: GameState,
  seat: Seat,
  answer: "agree" | "decline",
): GameTransition {
  const proposal = state.proposal;
  if (
    proposal == null ||
    state.auctionResult?.type !== "contract" ||
    seat === state.auctionResult.declarer ||
    proposal.answers[seat] !== null
  ) {
    return reject(state, "notYourTurn");
  }
  if (answer === "decline") {
    return accept({
      ...state,
      ...withSpeech(state, seat, "не согласен", true),
      proposal: null,
    });
  }
  const answers: Proposal["answers"] = [
    seat === 0 ? "agree" : proposal.answers[0],
    seat === 1 ? "agree" : proposal.answers[1],
    seat === 2 ? "agree" : proposal.answers[2],
  ];
  const voiced: GameState = {
    ...state,
    ...withSpeech(state, seat, "согласен", false),
    proposal: { tricks: proposal.tricks, answers },
  };
  const declarer = state.auctionResult.declarer;
  const both = ([0, 1, 2] as const).every(
    (place) => place === declarer || answers[place] === "agree",
  );
  return accept(both ? finishProposal(voiced) : voiced);
}

function finishProposal(state: GameState): GameState {
  const auctionResult = state.auctionResult;
  const proposal = state.proposal;
  const whistler = state.defense?.whistlers[0];
  if (
    auctionResult?.type !== "contract" ||
    proposal == null ||
    whistler === undefined ||
    state.play === null
  ) {
    throw new Error("Cannot record a proposal");
  }
  const tricks = [0, 0, 0] as [number, number, number];
  tricks[auctionResult.declarer] = proposal.tricks;
  tricks[whistler] = 10 - proposal.tricks;
  const passer = state.defense?.defenders.find(
    (defender) => state.defense?.decisions[defender] === "pass",
  );
  return closeScoredDeal(
    {
      ...state,
      proposal: null,
      play: { ...state.play, result: tricks },
    },
    {
      type: "contract",
      declarer: auctionResult.declarer,
      level: auctionResult.level,
      tricks,
      whistlers: [whistler],
      ...(passer === undefined ? {} : { passer }),
    },
    proposal.tricks >= auctionResult.level,
  );
}

function proposedHands(
  hands: GameSeatView["shownHands"],
  state: GameState,
  viewer: Seat,
): GameSeatView["shownHands"] {
  if (
    state.proposal == null ||
    state.play === null ||
    state.auctionResult?.type !== "contract" ||
    viewer === state.auctionResult.declarer
  ) {
    return hands;
  }
  const declarer = state.auctionResult.declarer;
  const hand = state.play.hands[declarer];
  return [
    declarer === 0 ? hand : hands[0],
    declarer === 1 ? hand : hands[1],
    declarer === 2 ? hand : hands[2],
  ];
}

function finishDeal(state: GameState): GameState {
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
      multiplier: gameRaspasMultiplier(
        state.settings.raspasProgression,
        state.raspasIndex,
      ),
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
      whistlers.length === 0 ||
      result[auctionResult.declarer] >= auctionResult.level;
    const passer = state.defense?.defenders.find(
      (defender) => state.defense?.decisions[defender] === "pass",
    );
    scoredDeal = {
      type: "contract",
      declarer: auctionResult.declarer,
      level: auctionResult.level,
      tricks: result,
      whistlers,
      ...(whistlers.length === 1 && passer !== undefined
        ? { passer }
        : {}),
    };
  }

  return closeScoredDeal(state, scoredDeal, takenGame);
}

function finishWithoutThree(state: GameState): GameState {
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
  );
}

function finishHalfWhist(state: GameState): GameState {
  const auctionResult = state.auctionResult;
  const halfWhist = state.defense?.halfWhist;
  if (auctionResult?.type !== "contract" || halfWhist === null || halfWhist === undefined) {
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
  );
}

function finishPassedContract(state: GameState): GameState {
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
  );
}

function closeScoredDeal(
  state: GameState,
  scoredDeal: ScoredDeal,
  takenGame: boolean,
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
  const raspasIndex = raspasIndexAfterDeal(
    state,
    auctionResult,
    takenGame,
  );
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
  );
}

function archiveSpeech(state: GameState): readonly SpeechDeal[] {
  const prior = state.speechLog ?? [];
  const lines = state.speech ?? [];
  if (lines.length === 0) {
    return prior;
  }
  return [...prior, { deal: state.dealNumber + 1, lines }];
}

function raspasIndexAfterDeal(
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

function throwTalonInFace(state: GameState, seat: Seat): GameTransition {
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
    ),
  );
}

function bulletGain(before: BulletScore, after: BulletScore): number {
  const sum = (score: BulletScore) =>
    score.bullet[0] + score.bullet[1] + score.bullet[2];
  return sum(after) - sum(before);
}

function talonAceWord(written: number): string | null {
  if (written === 1) {
    return "туз в пулю";
  }
  if (written >= 2) {
    return "два туза в пулю";
  }
  return null;
}

function openedTalonScore(
  state: GameState,
  result: AuctionResult,
): BulletScore {
  if (!state.settings.throwTalon || result.type !== "contract") {
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
): GameState {
  if (
    state.auctionResult === null ||
    state.auctionResult.type === "raspas"
  ) {
    throw new Error("Cannot leave the discard without a contract");
  }
  return {
    ...state,
    phase: "order",
    score,
    talon,
  };
}

function orderFloor(result: Exclude<AuctionResult, { type: "raspas" }>): Bid {
  if (result.type === "misere") {
    return { type: "misere" };
  }
  return {
    type: "contract",
    level: result.level,
    trump: result.trump,
  };
}

function isLegalOrder(
  result: Exclude<AuctionResult, { type: "raspas" }>,
  bid: Bid,
): boolean {
  if (result.type === "misere") {
    return bid.type === "misere";
  }
  if (bid.type === "misere") {
    return false;
  }
  return bidRank(bid) >= bidRank(orderFloor(result));
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

function continueRaspas(state: GameState, play: TrickPlayState): GameState {
  if (play.result !== null) {
    return finishDeal({ ...state, play });
  }
  if (
    play.currentTrick.length > 0 ||
    state.raspasOrder === undefined ||
    state.raspasOrder === null
  ) {
    return { ...state, play };
  }
  if (play.completedTricks === 1) {
    return {
      ...state,
      prikupShown: 2,
      play: { ...play, forcedSuit: state.raspasOrder[1].suit },
    };
  }
  if (play.completedTricks === 2) {
    return {
      ...state,
      play: {
        ...play,
        turn: firstLeader(state.dealNumber),
        forcedSuit: null,
      },
    };
  }
  return { ...state, play };
}

function raspasTrickHistory(
  state: GameState,
): TrickPlayState["trickHistory"] {
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

function rememberLayout(state: GameState): DealLayout {
  return {
    hands:
      state.layoutHands ??
      state.talon?.hands ??
      state.dealtCards.hands,
    talon: state.dealtCards.talon,
    discarded: state.talon?.discarded ?? [],
    tricks: state.play?.result ?? [0, 0, 0],
  };
}

function startDeal(
  settings: GameSettings,
  seed: number,
  dealNumber: number,
  score: BulletScore,
  raspasIndex: number,
  lastLayout: DealLayout | null = null,
  deals: readonly PlayedDeal[] = [],
  speechLog: readonly SpeechDeal[] = [],
): GameState {
  const dealtCards = deal(seed + dealNumber);
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

const TRUMP_NAME = {
  spades: "пик",
  clubs: "треф",
  diamonds: "бубен",
  hearts: "червей",
  noTrump: "без козыря",
} as const;

function withSpeech(
  state: GameState,
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

function advanceSpeech(
  state: GameState,
): { speech: readonly TableSpeech[]; speechStep: number } {
  return {
    speech: state.speech ?? [],
    speechStep: (state.speechStep ?? 0) + 1,
  };
}

function bidWord(bid: Bid): string {
  if (bid.type === "misere") {
    return "мизер";
  }
  return `${bid.level} ${TRUMP_NAME[bid.trump]}`;
}

function speechForAuction(
  state: GameState,
  seat: Seat,
  action: AuctionAction,
): { speech: readonly TableSpeech[]; speechStep: number } {
  if (action.type === "pass") {
    return withSpeech(state, seat, "пас", false);
  }
  return withSpeech(state, seat, bidWord(action.bid), true);
}

function defenseWord(action: DefenseAction): string {
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

function speechForDefense(
  state: GameState,
  seat: Seat,
  action: DefenseAction,
): { speech: readonly TableSpeech[]; speechStep: number } {
  const fresh = action.type === "light" || action.type === "dark";
  return withSpeech(state, seat, defenseWord(action), fresh);
}

function playedDeal(
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
  return {
    number: state.dealNumber + 1,
    declarer,
    contract,
    tricks: scoredDeal.tricks,
    delta: score.last,
  };
}

function currentHands(
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

function firstLeader(dealNumber: number): Seat {
  return (dealNumber % 3) as Seat;
}

function dealerSeat(dealNumber: number): Seat {
  return ((dealNumber + 2) % 3) as Seat;
}

function contractBids(level: 6 | 7 | 8 | 9 | 10): readonly Bid[] {
  const trumps: readonly Trump[] = [
    "spades",
    "clubs",
    "diamonds",
    "hearts",
    "noTrump",
  ];
  return trumps.map((trump) => ({ type: "contract", level, trump }));
}

function accept(state: GameState): GameTransition {
  return { accepted: true, state };
}

function reject(state: GameState, reason: string): GameTransition {
  return { accepted: false, reason, state };
}
