import { suitSequence } from "./profile.js";

import type {
  AuctionBid,
  AuctionSnapshot,
  Card,
  GameAction,
  GameSnapshot,
} from "./table-types.js";

export function trickCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${count} взятка`;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} взятки`;
  }
  return `${count} взяток`;
}

export function suitSymbol(suit: string): string {
  if (suit === "spades") return "♠";
  if (suit === "clubs") return "♣";
  if (suit === "diamonds") return "♦";
  if (suit === "hearts") return "♥";
  if (suit === "noTrump") return "БК";
  return suit;
}

export function isRedSuit(suit: string): boolean {
  return suit === "hearts" || suit === "diamonds";
}

export function rankLabel(rank: number): string {
  if (rank === 11) return "В";
  if (rank === 12) return "Д";
  if (rank === 13) return "К";
  if (rank === 14) return "Т";
  return String(rank);
}

export function shownBubble(
  word: string | undefined,
  phase: string,
): string | undefined {
  if (
    (phase === "play" || phase === "raspas") &&
    word !== undefined &&
    (["пас", "мизер", "вист", "полвиста", "всветлую", "втёмную"].includes(word) ||
      /^(6|7|8|9|10) (пик|треф|бубен|червей|без козыря)$/.test(word))
  ) {
    return undefined;
  }
  return word;
}

export function sortHand(
  hand: readonly Card[],
  order: "asc" | "desc" = "asc",
  suits: "sdch" | "scdh" = "sdch",
): Card[] {
  const sequence = suitSequence(suits);
  const rankDirection = order === "desc" ? -1 : 1;
  return [...hand].sort((left, right) => {
    const suit = sequence.indexOf(left.suit) - sequence.indexOf(right.suit);
    if (suit !== 0) {
      return suit;
    }
    return (left.rank - right.rank) * rankDirection;
  });
}

export function suitRows(cards: readonly Card[]): Card[][] {
  const rows: Card[][] = [];
  for (const card of cards) {
    const last = rows[rows.length - 1];
    if (last === undefined || last[0]?.suit !== card.suit) {
      rows.push([card]);
    } else {
      last.push(card);
    }
  }
  return rows;
}

/**
 * Whether the server's playCard actions are for these cards. The server offers them only for
 * the hand that moves now: the viewer's own hand, or the open hand they control in светлую.
 */
export function playsFromCards(
  cards: readonly Card[],
  playActions: readonly GameAction[],
): boolean {
  return playActions.some(
    (action) =>
      action.type === "playCard" && cards.some((card) => sameCard(action.card, card)),
  );
}

export function sameCard(left: Card | undefined, right: Card | undefined): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    left.suit === right.suit &&
    left.rank === right.rank
  );
}

export function toggleSelected(
  card: Card,
  selected: readonly Card[],
  setSelected: (cards: Card[]) => void,
): void {
  const exists = selected.some((item) => sameCard(item, card));
  if (exists) {
    setSelected(selected.filter((item) => !sameCard(item, card)));
    return;
  }
  if (selected.length === 2) {
    return;
  }
  setSelected([...selected, card]);
}

export function cardsLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${count} карта`;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} карты`;
  }
  return `${count} карт`;
}

export function isAuctionPass(action: GameAction): boolean {
  return action.type === "auction" && action.action?.type === "pass";
}

export function actionBid(action: GameAction): AuctionBid | undefined {
  if (action.type === "order") {
    return action.bid;
  }
  if (action.type === "auction" && action.action?.type === "bid") {
    return action.action.bid;
  }
  return undefined;
}

export function isMisereBid(action: GameAction): boolean {
  return actionBid(action)?.type === "misere";
}

export function contractOf(
  action: GameAction,
): { level: number; trump: string } | null {
  const bid = actionBid(action);
  if (bid?.type !== "contract" || bid.level === undefined || bid.trump === undefined) {
    return null;
  }
  return { level: bid.level, trump: bid.trump };
}

export function gameTitle(
  result: AuctionSnapshot["result"],
  names: readonly (string | null)[] | null,
  viewer: number,
  phase?: string,
): React.JSX.Element | null {
  if (result == null) {
    return null;
  }
  const caption =
    result.type === "misere"
      ? "Мизер"
      : result.type === "raspas"
        ? "Распасы"
        : result.type === "contract" &&
            result.level !== undefined &&
            result.trump !== undefined
          ? { level: result.level, trump: result.trump }
          : null;
  if (caption === null) {
    return null;
  }
  // Until the заказ, the result is only the торговля's winning bid: the declarer may still order higher.
  const ordering = phase === "discard" || phase === "order";
  const declarer =
    typeof result.declarer === "number"
      ? playerName(result.declarer, viewer, names)
      : null;
  const shown =
    typeof caption === "string" ? (
      caption
    ) : (
      <ContractFace level={caption.level} trump={caption.trump} />
    );
  return (
    <header className="game-top">
      {ordering ? (
        <p className="game-bid">Торговля: {shown}</p>
      ) : (
        <h1 className="game-title">{shown}</h1>
      )}
      {declarer === null ? null : (
        <p className="game-declarer">
          {typeof result.declarer === "number" && result.declarer === viewer
            ? ordering
              ? "Заказываете вы"
              : "Разыгрываете вы"
            : ordering
              ? `Заказывает ${declarer}`
              : `Разыгрывает ${declarer}`}
        </p>
      )}
    </header>
  );
}

export function resultBid(result: AuctionSnapshot["result"]): AuctionBid | null {
  if (result?.type === "misere") {
    return { type: "misere" };
  }
  if (
    result?.type === "contract" &&
    result.level !== undefined &&
    result.trump !== undefined
  ) {
    return { type: "contract", level: result.level, trump: result.trump };
  }
  return null;
}

/**
 * The declarer's final заказ, once it is made. During снос and заказ the auction result is
 * still the торговля's winning bid, so there is none yet.
 */
export function finalContract(
  state: Pick<GameSnapshot, "phase" | "auction">,
): { declarer: number; bid: AuctionBid } | null {
  if (state.phase !== "defense" && state.phase !== "play") {
    return null;
  }
  const declarer = state.auction.result?.declarer;
  const bid = resultBid(state.auction.result);
  return typeof declarer === "number" && bid !== null ? { declarer, bid } : null;
}

/** A contract's level and suit, with ♦ and ♥ in red. */
export function ContractFace({
  level,
  trump,
}: {
  level: number;
  trump: string;
}): React.JSX.Element {
  return (
    <>
      {level}{" "}
      <span className={isRedSuit(trump) ? "bid-red" : undefined}>{suitSymbol(trump)}</span>
    </>
  );
}

export function ContractBadge({ bid }: { bid: AuctionBid }): React.JSX.Element | null {
  const caption = bidCaption(bid);
  if (caption === null) {
    return null;
  }
  return (
    <span className="contract-badge" title={`Заказ: ${caption}`}>
      {bid.type === "contract" && bid.level !== undefined && bid.trump !== undefined ? (
        <ContractFace level={bid.level} trump={bid.trump} />
      ) : (
        caption
      )}
    </span>
  );
}

export function bidCaption(bid: AuctionBid | null | undefined): string | null {
  if (bid == null) {
    return null;
  }
  if (bid.type === "misere") {
    return "Мизер";
  }
  if (bid.type === "contract" && bid.level !== undefined && bid.trump !== undefined) {
    return `${bid.level} ${suitSymbol(bid.trump)}`;
  }
  return null;
}

export function emptySeatMessage(
  occupied: boolean[] | null | undefined,
  turn: number | null | undefined,
): string | null {
  if (occupied === null || occupied === undefined || occupied.length < 3) {
    return null;
  }
  const empty = occupied.flatMap((taken, index) => (taken ? [] : [index + 1]));
  if (empty.length === 0) {
    return null;
  }
  const names = empty.map((place) => `место ${place}`).join(" и ");
  if (typeof turn === "number" && occupied[turn] === false) {
    return `Ход места ${turn + 1}, но оно свободно.`;
  }
  return `Свободно: ${names}.`;
}

export function personName(
  names: readonly (string | null)[] | null | undefined,
  place: number,
): string | null {
  const name = names?.[place];
  return name == null || name.length === 0 ? null : name;
}

export function playerName(
  place: number,
  viewer: number,
  names: readonly (string | null)[] | null | undefined,
): string {
  if (place === viewer) {
    return "вы";
  }
  return personName(names, place) ?? `место ${place + 1}`;
}

export function nameAtSeat(
  place: number,
  viewer: number,
  names: readonly (string | null)[] | null | undefined,
): string {
  const name = playerName(place, viewer, names);
  const mailbox = name.indexOf("@");
  return mailbox > 0 ? name.slice(0, mailbox) : name;
}

export function seatLabel(
  place: number,
  viewer: number,
  names: readonly (string | null)[] | null | undefined,
  dealer: number,
): string {
  const who = playerName(place, viewer, names);
  return place === dealer ? `${who} (сдавал)` : who;
}

export function clampBox(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function facedTalonCaption(): string {
  return "Прикуп в лицо сдающему · 2 в гору";
}

export function actionLabel(action: GameAction): string {
  if (action.type === "propose" && action.tricks !== undefined) {
    return `${action.tricks}`;
  }
  if (action.type === "proposal") {
    return action.answer === "agree" ? "Согласен" : "Не согласен";
  }
  if (action.type === "throwTalon") {
    return "Бросить прикуп в лицо";
  }
  if (action.type === "playCard" && action.card !== undefined) {
    return `Ход ${action.card.suit} ${action.card.rank}`;
  }
  if (action.type === "discard" && action.cards !== undefined) {
    return `Снести ${action.cards
      .map((card) => `${card.suit} ${card.rank}`)
      .join(", ")}`;
  }
  const decision = action.action?.type;
  if (
    decision === "pass" ||
    decision === "whist" ||
    decision === "halfWhist" ||
    decision === "light" ||
    decision === "dark"
  ) {
    return {
      pass: "Пас",
      whist: "Вист",
      halfWhist: "Полвиста",
      light: "Всветлую",
      dark: "Втёмную",
    }[decision];
  }
  if (action.action?.type === "bid") {
    const bid = action.action.bid;
    if (bid?.type === "misere") {
      return "Мизер";
    }
    if (bid?.level !== undefined && bid.trump !== undefined) {
      return `${bid.level} ${suitSymbol(bid.trump)}`;
    }
  }
  return action.action?.type ?? action.type;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
