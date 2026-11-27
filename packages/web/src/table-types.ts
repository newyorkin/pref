export interface Card {
  suit: string;
  rank: number;
}

export interface GameAction {
  type: string;
  card?: Card;
  cards?: [Card, Card];
  index?: 0 | 1;
  tricks?: number;
  answer?: "agree" | "decline";
  bid?: AuctionBid;
  action?: {
    type: string;
    bid?: AuctionBid;
  };
}

export interface AuctionBid {
  type: string;
  level?: number;
  trump?: string;
}

export interface AuctionSnapshot {
  turn?: number | null;
  active?: [boolean, boolean, boolean];
  highestBid?: AuctionBid | null;
  highestBidder?: number | null;
  result?: {
    type: string;
    declarer?: number;
    level?: number;
    trump?: string;
  } | null;
}

export interface GameSnapshot {
  proposal?: {
    tricks: number;
    proposer: number;
    answers: [
      "agree" | "decline" | null,
      "agree" | "decline" | null,
      "agree" | "decline" | null,
    ];
  } | null;
  phase: string;
  hand: Card[];
  handSizes?: [number, number, number];
  auction: AuctionSnapshot;
  defense: unknown;
  currentTrick: Array<{
    seat: number;
    card: Card | { faceDown: true };
  }>;
  trickHistory: Array<{
    winner: number;
    cards: Array<{ seat: number; card: Card }>;
    talonCard?: Card;
  }>;
  tricksWon: [number, number, number];
  score: {
    bullet: [number, number, number];
    mountain: [number, number, number];
    whists: [
      [number, number, number],
      [number, number, number],
      [number, number, number],
    ];
    last?: {
      bullet: [number, number, number];
      mountain: [number, number, number];
      whists: [
        [number, number, number],
        [number, number, number],
        [number, number, number],
      ];
    };
  };
  settlement?: [number, number, number] | null;
  raspasIndex: number;
  raspasMultiplier: number;
  dealNumber: number;
  trump?: string | null;
  talonCards?: Card[];
  discarded?: Card[];
  facedTalon?: boolean;
  openHand?: Card[];
  openSeat?: number | null;
  shownHands?: Array<Card[] | null> | null;
  turn?: number | null;
  allowedActions: GameAction[];
  prikup?: Array<Card | { faceDown: true }>;
  speech?: TableSpeech[];
  speechStep?: number;
  speechLog?: SpeechDeal[];
  lastLayout?: {
    hands: [Card[], Card[], Card[]];
    talon: Card[];
    discarded: Card[];
    tricks?: [number, number, number];
  } | null;
  deals?: PlayedDeal[];
}

export interface TableSpeech {
  seat: number | null;
  word: string;
  step: number;
}

export interface SpeechDeal {
  deal: number;
  lines: TableSpeech[];
}

export interface PlayedDeal {
  number: number;
  declarer: number | null;
  contract: string;
  tricks: [number, number, number];
  delta: {
    bullet: [number, number, number];
    mountain: [number, number, number];
    whists: [
      [number, number, number],
      [number, number, number],
      [number, number, number],
    ];
  };
  defense?: DealDefense;
}

export type DealDefenseRole = "whist" | "pass" | "halfWhist" | "whistBack";

export interface DealDefense {
  roles: [DealDefenseRole | null, DealDefenseRole | null, DealDefenseRole | null];
  whistStyle: "light" | "dark" | null;
}

export interface SnapshotEnvelope {
  type: "snapshot";
  tableId: string;
  version: number;
  state: GameSnapshot;
}
