import { type Seat, type Trump } from "./auction.js";
import { type Card } from "./deck.js";
import { firstLeader } from "./game-state.js";
import type { GameState } from "./game-types.js";

export function lightPartners(
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

export function playedHand(state: GameState, actor: Seat): Seat | null {
  if (state.phase !== "play" || state.play?.turn == null) {
    return null;
  }
  const partners = lightPartners(state);
  if (partners !== null && state.play.turn === partners.passer) {
    return actor === partners.whistler ? partners.passer : null;
  }
  return state.play.turn === actor ? actor : null;
}

export function openWhistHand(state: GameState): readonly Card[] {
  const partners = lightPartners(state);
  if (partners === null || state.play === null) {
    return [];
  }
  return state.play.hands[partners.passer];
}

export function shownWhistHands(
  state: GameState,
  viewer: Seat,
): readonly [readonly Card[] | null, readonly Card[] | null, readonly Card[] | null] {
  const hidden = [null, null, null] as [
    readonly Card[] | null,
    readonly Card[] | null,
    readonly Card[] | null,
  ];
  if (state.auctionResult?.type === "misere") {
    if (state.phase === "play" && state.play !== null) {
      const hands = [...hidden] as [
        readonly Card[] | null,
        readonly Card[] | null,
        readonly Card[] | null,
      ];
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

export function declarerOpens(state: GameState): boolean {
  return (
    state.auctionResult?.type === "contract" &&
    firstLeader(state.dealNumber) === state.auctionResult.declarer
  );
}

export function styleChoiceDue(state: GameState): boolean {
  return (
    state.phase === "play" &&
    state.defense?.phase === "style" &&
    (state.play?.currentTrick.length ?? 0) > 0
  );
}

export function gameTurn(state: GameState): Seat | null {
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

export function visibleTalon(state: GameState, viewer: Seat): readonly Card[] {
  const result = state.auctionResult;
  if (result?.type !== "contract" && result?.type !== "misere") {
    return [];
  }
  if (result.type === "misere" && result.declarer !== viewer) {
    return [];
  }
  const choosingWhist = state.phase === "defense" && state.defense?.phase === "whist";
  if (state.phase !== "discard" && state.phase !== "order" && !choosingWhist) {
    return [];
  }
  return state.dealtCards.talon;
}

export function contractTrump(state: GameState): Trump | null {
  if (state.auctionResult?.type !== "contract") {
    return null;
  }
  return state.auctionResult.trump === "noTrump" ? null : state.auctionResult.trump;
}
