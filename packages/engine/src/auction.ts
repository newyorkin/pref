import type { Suit } from "./deck.js";
import type { ContractLevel } from "./settings.js";

export type Seat = 0 | 1 | 2;
export type Trump = Suit | "noTrump";

export type Bid =
  | {
      readonly type: "contract";
      readonly level: ContractLevel;
      readonly trump: Trump;
    }
  | { readonly type: "misere" };

export type AuctionAction =
  | { readonly type: "pass" }
  | { readonly type: "bid"; readonly bid: Bid };

export type AuctionResult =
  | { readonly type: "raspas" }
  | {
      readonly type: "contract";
      readonly declarer: Seat;
      readonly level: ContractLevel;
      readonly trump: Trump;
    }
  | { readonly type: "misere"; readonly declarer: Seat };

export interface AuctionState {
  readonly turn: Seat | null;
  readonly active: readonly [boolean, boolean, boolean];
  readonly highestBid: Bid | null;
  readonly highestBidder: Seat | null;
  readonly misereBidder: Seat | null;
  readonly contractBidders: readonly [boolean, boolean, boolean];
  readonly passesWithoutBid: number;
  readonly result: AuctionResult | null;
}

export type AuctionRejection =
  | "finished"
  | "notYourTurn"
  | "inactiveSeat"
  | "bidNotHigher"
  | "onlyPass";

export type AuctionTransition =
  | { readonly accepted: true; readonly state: AuctionState }
  | {
      readonly accepted: false;
      readonly reason: AuctionRejection;
      readonly state: AuctionState;
    };

const TRUMPS: readonly Trump[] = [
  "spades",
  "clubs",
  "diamonds",
  "hearts",
  "noTrump",
];

export function createAuction(firstSeat: Seat = 0): AuctionState {
  return {
    turn: firstSeat,
    active: [true, true, true],
    highestBid: null,
    highestBidder: null,
    misereBidder: null,
    contractBidders: [false, false, false],
    passesWithoutBid: 0,
    result: null,
  };
}

export function applyAuctionAction(
  state: AuctionState,
  seat: Seat,
  action: AuctionAction,
): AuctionTransition {
  if (state.result !== null) {
    return reject(state, "finished");
  }
  if (state.turn !== seat) {
    return reject(state, "notYourTurn");
  }
  if (!state.active[seat]) {
    return reject(state, "inactiveSeat");
  }
  if (
    action.type === "bid" &&
    state.misereBidder === seat &&
    state.highestBid?.type === "contract"
  ) {
    return reject(state, "onlyPass");
  }
  if (
    action.type === "bid" &&
    action.bid.type === "misere" &&
    state.contractBidders[seat]
  ) {
    return reject(state, "bidNotHigher");
  }
  if (
    action.type === "bid" &&
    state.highestBid !== null &&
    bidRank(action.bid) <= bidRank(state.highestBid)
  ) {
    return reject(state, "bidNotHigher");
  }

  const active: [boolean, boolean, boolean] = [...state.active];
  let highestBid = state.highestBid;
  let highestBidder = state.highestBidder;
  let misereBidder = state.misereBidder;
  const contractBidders: [boolean, boolean, boolean] = [
    ...state.contractBidders,
  ];
  let passesWithoutBid = state.passesWithoutBid;

  if (action.type === "pass") {
    active[seat] = false;
    passesWithoutBid += 1;
  } else {
    highestBid = action.bid;
    highestBidder = seat;
    if (action.bid.type === "misere") {
      misereBidder = seat;
    } else {
      contractBidders[seat] = true;
    }
    passesWithoutBid = 0;
  }

  const result = resolveAuction(
    active,
    highestBid,
    highestBidder,
    passesWithoutBid,
  );
  const nextState: AuctionState = {
    turn: result === null ? nextActiveSeat(seat, active) : null,
    active,
    highestBid,
    highestBidder,
    misereBidder,
    contractBidders,
    passesWithoutBid,
    result,
  };

  return { accepted: true, state: nextState };
}

export function bidRank(bid: Bid): number {
  if (bid.type === "misere") {
    return 15;
  }

  const trumpRank = TRUMPS.indexOf(bid.trump);
  if (bid.level <= 8) {
    return (bid.level - 6) * TRUMPS.length + trumpRank;
  }
  return 16 + (bid.level - 9) * TRUMPS.length + trumpRank;
}

function resolveAuction(
  active: readonly boolean[],
  highestBid: Bid | null,
  highestBidder: Seat | null,
  passesWithoutBid: number,
): AuctionResult | null {
  if (highestBid === null) {
    return passesWithoutBid >= 3 ? { type: "raspas" } : null;
  }

  const activeCount = active.filter(Boolean).length;
  if (activeCount > 1 || highestBidder === null) {
    return null;
  }
  if (highestBid.type === "misere") {
    return { type: "misere", declarer: highestBidder };
  }
  return {
    type: "contract",
    declarer: highestBidder,
    level: highestBid.level,
    trump: highestBid.trump,
  };
}

function nextActiveSeat(
  currentSeat: Seat,
  active: readonly boolean[],
): Seat {
  for (let offset = 1; offset <= 3; offset += 1) {
    const candidate = ((currentSeat + offset) % 3) as Seat;
    if (active[candidate]) {
      return candidate;
    }
  }
  throw new Error("Auction has no active seat");
}

function reject(
  state: AuctionState,
  reason: AuctionRejection,
): AuctionTransition {
  return { accepted: false, reason, state };
}
