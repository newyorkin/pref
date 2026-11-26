import {
  type AuctionAction,
  type AuctionResult,
  type AuctionState,
  type Bid,
  type Seat,
  type Trump,
} from "./auction.js";
import { type Card, type Deal } from "./deck.js";
import { type DefenseAction, type DefenseState } from "./defense.js";
import { type BulletScore } from "./scoring.js";
import { type TableSettings } from "./settings.js";
import { type TalonState } from "./talon.js";
import { type TrickPlayState } from "./tricks.js";
import { type VisiblePlayedCard } from "./view.js";

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
  | { readonly type: "cancelProposal" }
  | { readonly type: "rematch" };

export interface Proposal {
  readonly tricks: number;
  readonly proposer: Seat;
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
  readonly hands: readonly [readonly Card[], readonly Card[], readonly Card[]];
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
  readonly declarerShown?: boolean;
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
  | { readonly accepted: true; readonly reason?: never; readonly state: GameState }
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
