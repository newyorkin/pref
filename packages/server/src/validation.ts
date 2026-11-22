import {
  gameView,
  view,
  type Card,
  type GameAction,
  type GameSeatView,
  type GameState,
  type Seat,
  type SeatView,
  type TrickPlayState,
} from "@pref/engine";
import type {
  GameActionCommand,
  JoinMessage,
  PlayCardCommand,
  TableFormSettings,
  WatchMessage,
} from "./protocol.js";

export function isWatchMessage(value: unknown): value is WatchMessage {
  return isRecord(value) && value.type === "watch" && typeof value.tableId === "string";
}

export function isJoinMessage(value: unknown): value is JoinMessage {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.type === "join" && typeof value.tableId === "string" && isSeat(value.seat)
  );
}

export function isPlayCardCommand(value: unknown): value is PlayCardCommand {
  if (!isRecord(value) || !isRecord(value.payload)) {
    return false;
  }
  return (
    typeof value.tableId === "string" &&
    isSeat(value.seat) &&
    typeof value.actionId === "string" &&
    Number.isInteger(value.expectedVersion) &&
    value.type === "playCard" &&
    isCard(value.payload.card)
  );
}

export function isGameActionCommand(value: unknown): value is GameActionCommand {
  if (!isRecord(value) || !isRecord(value.payload)) {
    return false;
  }
  return (
    typeof value.tableId === "string" &&
    isSeat(value.seat) &&
    typeof value.actionId === "string" &&
    Number.isInteger(value.expectedVersion) &&
    value.type === "gameAction" &&
    isGameAction(value.payload.action)
  );
}

export function isGameAction(value: unknown): value is GameAction {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  if (value.type === "playCard") {
    return isCard(value.card);
  }
  if (value.type === "throwTalon" || value.type === "withoutThree") {
    return true;
  }
  if (value.type === "propose") {
    return (
      Number.isInteger(value.tricks) &&
      (value.tricks as number) >= 0 &&
      (value.tricks as number) <= 10
    );
  }
  if (value.type === "proposal") {
    return value.answer === "agree" || value.answer === "decline";
  }
  if (value.type === "rematch") {
    return !("seed" in value);
  }
  if (value.type === "openTalon") {
    return value.index === 0 || value.index === 1;
  }
  if (value.type === "discard") {
    return (
      Array.isArray(value.cards) &&
      value.cards.length === 2 &&
      value.cards.every(isCard)
    );
  }
  if (value.type === "order" && isRecord(value.bid)) {
    if (value.bid.type === "misere") {
      return true;
    }
    return (
      value.bid.type === "contract" &&
      [6, 7, 8, 9, 10].includes(value.bid.level as number) &&
      ["spades", "clubs", "diamonds", "hearts", "noTrump"].includes(
        value.bid.trump as string,
      )
    );
  }
  if (value.type === "defense") {
    return (
      isRecord(value.action) &&
      ["pass", "whist", "halfWhist", "light", "dark"].includes(
        value.action.type as string,
      )
    );
  }
  if (value.type === "auction" && isRecord(value.action)) {
    if (value.action.type === "pass") {
      return true;
    }
    if (value.action.type !== "bid" || !isRecord(value.action.bid)) {
      return false;
    }
    if (value.action.bid.type === "misere") {
      return true;
    }
    return (
      value.action.bid.type === "contract" &&
      [6, 7, 8, 9, 10].includes(value.action.bid.level as number) &&
      ["spades", "clubs", "diamonds", "hearts", "noTrump"].includes(
        value.action.bid.trump as string,
      )
    );
  }
  return false;
}

export function isCard(value: unknown): value is Card {
  if (!isRecord(value)) {
    return false;
  }
  return (
    ["spades", "clubs", "diamonds", "hearts"].includes(value.suit as string) &&
    Number.isInteger(value.rank) &&
    (value.rank as number) >= 7 &&
    (value.rank as number) <= 14
  );
}

export function isSeat(value: unknown): value is Seat {
  return value === 0 || value === 1 || value === 2;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isGameState(state: TrickPlayState | GameState): state is GameState {
  return "settings" in state && "auction" in state;
}

export function projectState(
  state: TrickPlayState | GameState,
  seat: Seat,
): SeatView | GameSeatView {
  return isGameState(state) ? gameView(state, seat) : view(state, seat);
}

export function isTableFormSettings(value: unknown): value is TableFormSettings {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.raspasProgression === "111" ||
      value.raspasProgression === "122" ||
      value.raspasProgression === "123" ||
      value.raspasProgression === "123123") &&
    (value.raspasExit === "666" ||
      value.raspasExit === "677" ||
      value.raspasExit === "788" ||
      value.raspasExit === "678678") &&
    typeof value.throwTalon === "boolean" &&
    typeof value.bulletTarget === "number" &&
    Number.isInteger(value.bulletTarget) &&
    value.bulletTarget >= 3 &&
    value.bulletTarget <= 10000
  );
}
