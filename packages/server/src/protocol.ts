import {
  type Card,
  type Deal,
  type GameAction,
  type GameSeatView,
  type Seat,
  type SeatView,
  type TableSettings,
} from "@pref/engine";

export interface PlayCardCommand {
  readonly tableId: string;
  readonly seat: Seat;
  readonly actionId: string;
  readonly expectedVersion: number;
  readonly type: "playCard";
  readonly payload: {
    readonly card: Card;
  };
}

export interface GameActionCommand {
  readonly tableId: string;
  readonly seat: Seat;
  readonly actionId: string;
  readonly expectedVersion: number;
  readonly type: "gameAction";
  readonly payload: {
    readonly action: GameAction;
  };
}

export type ClientCommand = PlayCardCommand | GameActionCommand;

export interface JoinMessage {
  readonly type: "join";
  readonly tableId: string;
  readonly seat: Seat;
}

export interface WatchMessage {
  readonly type: "watch";
  readonly tableId: string;
}

export interface SnapshotMessage {
  readonly type: "snapshot";
  readonly tableId: string;
  readonly version: number;
  readonly state: SeatView | GameSeatView;
  readonly repeatedAction?: true;
}

export interface RejectionMessage {
  readonly type: "rejected";
  readonly tableId?: string;
  readonly actionId?: string;
  readonly version?: number;
  readonly reason: string;
  readonly state?: SeatView | GameSeatView;
}

export interface TableMessage {
  readonly type: "table";
  readonly tableId: string;
  readonly settings: TableFormSettings;
  readonly settingsRevision: number;
  readonly dealt: boolean;
  readonly seats: readonly boolean[];
  readonly names: readonly (string | null)[];
  readonly seat: number | null;
  readonly isHost: boolean;
  readonly confirmed: readonly [boolean, boolean, boolean];
}

export type ServerMessage = SnapshotMessage | RejectionMessage | TableMessage;

export type TableFormSettings = TableSettings;

export interface Subscription {
  readonly tableId: string;
  readonly seat: Seat;
}

export interface GameServerOptions {
  readonly localTestMode?: boolean;
  readonly databasePath?: string;
  readonly staticDir?: string;
  readonly dealSource?: () => Deal;
  readonly now?: () => number;
  readonly tableTtlMs?: number;
  readonly finishedTableTtlMs?: number;
  readonly cleanupIntervalMs?: number;
  readonly sessionTtlMs?: number;
  readonly cookieSecure?: boolean;
  readonly publicOrigin?: string;
  readonly heartbeatIntervalMs?: number;
  readonly maxSocketPayload?: number;
  readonly socketMessageLimit?: number;
  readonly socketMessageWindowMs?: number;
  readonly authRateLimit?: { ip: number; name: number; windowMs: number };
}
