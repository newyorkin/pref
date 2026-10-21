import { useEffect, useRef, useState } from "react";

import type { TableSettings } from "./App.js";
import "./table.css";

interface Card {
  suit: string;
  rank: number;
}

interface GameAction {
  type: string;
  card?: Card;
  cards?: [Card, Card];
  index?: 0 | 1;
  seed?: number;
  bid?: AuctionBid;
  action?: {
    type: string;
    bid?: AuctionBid;
  };
}

interface AuctionBid {
  type: string;
  level?: number;
  trump?: string;
}

interface AuctionSnapshot {
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
  lastLayout?: {
    hands: [Card[], Card[], Card[]];
    talon: Card[];
    discarded: Card[];
    tricks?: [number, number, number];
  } | null;
  deals?: PlayedDeal[];
}

interface PlayedDeal {
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
}

export interface SnapshotEnvelope {
  type: "snapshot";
  tableId: string;
  version: number;
  state: GameSnapshot;
}

export function nextClientState(
  message: unknown,
  current: SnapshotEnvelope | null,
  tableId: string,
): { snapshot: SnapshotEnvelope | null; error: string | null } {
  if (!isRecord(message) || typeof message.type !== "string") {
    return {
      snapshot: current,
      error: "Не удалось прочитать ответ стола",
    };
  }
  if (
    typeof message.version === "number" &&
    current !== null &&
    message.version < current.version
  ) {
    return { snapshot: current, error: null };
  }
  if (
    message.type === "snapshot" &&
    typeof message.version === "number" &&
    isRecord(message.state)
  ) {
    return {
      snapshot: envelope(message, tableId, current),
      error: null,
    };
  }
  if (message.type === "rejected") {
    const error = auctionError(
      typeof message.reason === "string" ? message.reason : "rejected",
    );
    if (typeof message.version === "number" && isRecord(message.state)) {
      return {
        snapshot: envelope(message, tableId, current),
        error,
      };
    }
    return { snapshot: current, error };
  }
  return { snapshot: current, error: null };
}

function envelope(
  message: Record<string, unknown>,
  tableId: string,
  current: SnapshotEnvelope | null,
): SnapshotEnvelope {
  return {
    type: "snapshot",
    tableId:
      typeof message.tableId === "string"
        ? message.tableId
        : (current?.tableId ?? tableId),
    version: message.version as number,
    state: message.state as GameSnapshot,
  };
}

function auctionError(reason: string): string {
  const text: Record<string, string> = {
    versionMismatch:
      "Стол уже изменился. Заявка не прошла, на экране актуальный торг.",
    notYourTurn: "Сейчас заявка другого места.",
    bidNotHigher: "Нужна заявка выше текущей.",
    onlyPass: "После мизера можно только пасовать.",
    inactiveSeat: "Вы уже сказали пас и вышли из торга.",
    finished: "Торг уже закончился.",
    seatNotOwned: "Это не ваше место.",
    seatMismatch: "Это не ваше место.",
    tableNotFound: "Этого стола уже нет. Откройте ссылку заново.",
    invalidCommand: "Ход не принят.",
    dealNotStarted: "Сдача ещё не началась.",
    notAuthenticated: "Нужно войти снова.",
    mustFollowSuit: "Нужно положить масть хода.",
    mustPlayTrump: "Нужно положить козырь.",
    invalidCard: "Этой карты нет в прикупе.",
  };
  return text[reason] ?? reason;
}

export function createActionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readSocketPayload(data: unknown): Promise<unknown> {
  if (typeof data === "string") {
    return JSON.parse(data) as unknown;
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return JSON.parse(await data.text()) as unknown;
  }
  throw new Error("unsupported socket payload");
}

export function GameTable({
  tableId,
  seat,
  settings,
}: {
  tableId: string;
  seat: number;
  settings: TableSettings;
}): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<SnapshotEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const snapshotRef = useRef<SnapshotEnvelope | null>(null);
  const connectRef = useRef<(() => void) | null>(null);
  const [occupiedSeats, setOccupiedSeats] = useState<boolean[] | null>(null);
  const [playerNames, setPlayerNames] = useState<(string | null)[] | null>(
    null,
  );
  snapshotRef.current = snapshot;

  useEffect(() => {
    let stopped = false;
    let reconnectTimer: number | undefined;

    function connect(): void {
      if (stopped) {
        return;
      }
      const currentSocket = socket.current;
      if (
        currentSocket !== null &&
        (currentSocket.readyState === WebSocket.OPEN ||
          currentSocket.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const nextSocket = new WebSocket(
        `${protocol}//${window.location.host}/ws`,
      );
      socket.current = nextSocket;
      nextSocket.addEventListener("open", () => {
        if (socket.current !== nextSocket) {
          return;
        }
        nextSocket.send(
          JSON.stringify({ type: "join", tableId, seat }),
        );
      });
      nextSocket.addEventListener("message", (event) => {
        if (socket.current !== nextSocket) {
          return;
        }
        void readSocketPayload(event.data)
          .then((message) => {
            const next = nextClientState(
              message,
              snapshotRef.current,
              tableId,
            );
            if (next.snapshot !== null) {
              snapshotRef.current = next.snapshot;
              setSnapshot(next.snapshot);
            }
            setError(next.error);
          })
          .catch(() => {
            setError("Не удалось прочитать ответ стола");
          });
      });
      nextSocket.addEventListener("close", () => {
        if (stopped || socket.current !== nextSocket) {
          return;
        }
        reconnectTimer = window.setTimeout(connect, 250);
      });
    }

    connectRef.current = connect;
    const startTimer = window.setTimeout(connect, 0);
    return () => {
      stopped = true;
      connectRef.current = null;
      window.clearTimeout(startTimer);
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
      }
      socket.current?.close();
      socket.current = null;
    };
  }, [seat, tableId]);

  useEffect(() => {
    let stopped = false;

    async function loadSeats(): Promise<void> {
      try {
        const response = await fetch(`/tables/${tableId}`, {
          credentials: "include",
        });
        if (!response.ok || stopped) {
          return;
        }
        const info = (await response.json()) as {
          seats?: boolean[];
          names?: (string | null)[];
        };
        if (Array.isArray(info.seats)) {
          setOccupiedSeats(info.seats);
        }
        if (Array.isArray(info.names)) {
          setPlayerNames(info.names);
        }
      } catch {
        // The seat list is a hint; the game snapshot stays the source of play.
      }
    }

    void loadSeats();
    const timer = window.setInterval(() => void loadSeats(), 2000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [tableId]);

  function sendAction(action: GameAction): void {
    const current = snapshotRef.current;
    const currentSocket = socket.current;
    if (
      current === null ||
      currentSocket === null ||
      currentSocket.readyState !== WebSocket.OPEN
    ) {
      setError("Нет связи со столом. Переподключаемся…");
      connectRef.current?.();
      return;
    }
    currentSocket.send(
      JSON.stringify({
        tableId,
        seat,
        actionId: createActionId(),
        expectedVersion: current.version,
        type: "gameAction",
        payload: { action },
      }),
    );
  }

  if (snapshot === null) {
    return (
      <main className="game-screen">
        <p className="game-status" role={error === null ? undefined : "alert"}>
          {error ?? "Подключение к столу…"}
        </p>
      </main>
    );
  }
  return (
    <GameSnapshotPanel
      snapshot={snapshot}
      settings={settings}
      seat={seat}
      onAction={sendAction}
      error={error}
      occupiedSeats={occupiedSeats}
      playerNames={playerNames}
    />
  );
}

export function GameSnapshotPanel({
  snapshot,
  settings,
  onAction,
  seat = 0,
  error = null,
  occupiedSeats = null,
  playerNames = null,
}: {
  snapshot: SnapshotEnvelope;
  settings: TableSettings;
  onAction: (action: GameAction) => void;
  seat?: number;
  error?: string | null;
  occupiedSeats?: boolean[] | null;
  playerNames?: (string | null)[] | null;
}): React.JSX.Element {
  const state = snapshot.state;
  const [selected, setSelected] = useState<Card[]>([]);
  const [bulletOpen, setBulletOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const layoutLocked =
    state.phase === "play" && state.trickHistory.length > 0;
  useEffect(() => {
    setSelected([]);
  }, [snapshot.version]);
  useEffect(() => {
    if (layoutLocked) {
      setLayoutOpen(false);
    }
  }, [layoutLocked]);
  const auctionActions = state.allowedActions.filter(
    (action) => action.type === "auction",
  );
  const orderActions = state.allowedActions.filter(
    (action) => action.type === "order" || action.type === "withoutThree",
  );
  const playActions = state.allowedActions.filter(
    (action) => action.type === "playCard",
  );
  const discardActions = state.allowedActions.filter(
    (action) => action.type === "discard",
  );
  const throwAction = state.allowedActions.find(
    (action) => action.type === "throwTalon",
  );
  const otherActions = state.allowedActions.filter(
    (action) =>
      action.type !== "auction" &&
      action.type !== "order" &&
      action.type !== "withoutThree" &&
      action.type !== "openTalon" &&
      action.type !== "playCard" &&
      action.type !== "discard" &&
      action.type !== "throwTalon",
  );
  const trump = state.trump ?? null;
  const sharedTalon =
    (state.talonCards ?? []).length > 0 &&
    state.auction.result?.declarer !== seat;
  const lastTrick = state.trickHistory.at(-1);
  const showAuction =
    state.phase === "auction" || auctionActions.length > 0;
  const showOrder = state.phase === "order";
  const leftSeat = (seat + 1) % 3;
  const rightSeat = (seat + 2) % 3;
  const hand = sortHand(state.hand);
  const dealer = (state.dealNumber + 2) % 3;
  const gap = emptySeatMessage(occupiedSeats, state.auction.turn);

  return (
    <main
      className={[
        showAuction || showOrder
          ? "game-screen game-screen-auction"
          : "game-screen",
        (state.discarded ?? []).length > 0 ? "game-has-discard" : "",
      ]
        .filter((name) => name !== "")
        .join(" ")}
    >
      {error === null ? null : (
        <p className="game-error" role="alert">
          {error}
        </p>
      )}
      {gap === null ? null : (
        <p className="game-error" role="alert">
          {gap}
        </p>
      )}

      {state.phase === "finished" ? (
        <section className="finish-banner" role="status">
          <p>Игра завершена, спасибо за игру</p>
          <div className="finish-actions">
            <button
              type="button"
              onClick={() =>
                onAction({ type: "rematch", seed: Date.now() })
              }
            >
              Сыграть ещё раз
            </button>
            <button
              type="button"
              onClick={() =>
                downloadResults(
                  resultsText(
                    [0, 1, 2].map(
                      (place) =>
                        personName(playerNames, place) ?? `место ${place + 1}`,
                    ),
                    state.settlement ?? [0, 0, 0],
                    state.deals ?? [],
                  ),
                )
              }
            >
              Выгрузить результаты
            </button>
          </div>
        </section>
      ) : null}

      {gameTitle(state.auction.result, playerNames, seat)}

      {state.handSizes === undefined ? null : (
        <section className="opponents">
          <Opponent
            place={leftSeat}
            name={
              occupiedSeats?.[leftSeat] === false
                ? null
                : seatLabel(leftSeat, seat, playerNames, dealer)
            }
            empty={occupiedSeats?.[leftSeat] === false}
            cards={state.handSizes[leftSeat] ?? 0}
            openCards={visibleOpponent(state, leftSeat)}
            playActions={playActions}
            trump={trump}
            onAction={onAction}
            passed={state.auction.active?.[leftSeat] === false}
            side="left"
          />
          <Opponent
            place={rightSeat}
            name={
              occupiedSeats?.[rightSeat] === false
                ? null
                : seatLabel(rightSeat, seat, playerNames, dealer)
            }
            empty={occupiedSeats?.[rightSeat] === false}
            cards={state.handSizes[rightSeat] ?? 0}
            openCards={visibleOpponent(state, rightSeat)}
            playActions={playActions}
            trump={trump}
            onAction={onAction}
            passed={state.auction.active?.[rightSeat] === false}
            side="right"
          />
        </section>
      )}

      {showAuction ? (
        <AuctionBoard
          auction={state.auction}
          actions={auctionActions}
          seat={seat}
          names={playerNames}
          dealer={dealer}
          viewer={seat}
          onAction={onAction}
        />
      ) : null}

      {showOrder ? (
        <OrderBoard
          auction={state.auction}
          actions={orderActions}
          names={playerNames}
          viewer={seat}
          onAction={onAction}
        />
      ) : null}

      {showOrder ||
      state.auction.result == null ||
      typeof state.turn !== "number" ? null : (
        <p className="contract-banner">
          {turnLabel(state.turn, playerNames, seat)}
        </p>
      )}

      {state.phase === "raspas" ? (
        <p className="contract-banner">Откройте прикуп</p>
      ) : null}

      {(state.prikup ?? []).length === 0 ? null : (
        <section className="prikup" aria-label="Прикуп">
          <div className="prikup-row">
            {(state.prikup ?? []).map((card, index) =>
              "faceDown" in card ? (
                state.phase === "raspas" ? (
                  <button
                    key={index}
                    type="button"
                    className="card-back prikup-back"
                    aria-label="Рубашка прикупа"
                    onClick={() =>
                      onAction({ type: "openTalon", index: index === 0 ? 0 : 1 })
                    }
                  />
                ) : (
                  <span
                    key={index}
                    className="card-back prikup-back"
                    aria-label="Рубашка прикупа"
                  />
                )
              ) : (
                <PlayingCard key={`${card.suit}:${card.rank}`} card={card} />
              ),
            )}
          </div>
          <p className="trick-count">Задаёт масть</p>
        </section>
      )}

      {sharedTalon ? (
        <section className="prikup" aria-label="Прикуп">
          <div className="prikup-row">
            {(state.talonCards ?? []).map((card, index) => (
              <PlayingCard
                key={`${card.suit}:${card.rank}:${index}`}
                card={card}
              />
            ))}
          </div>
          <p className="trick-count">Прикуп</p>
        </section>
      ) : null}

      {state.currentTrick.length === 0 ? null : (
        <section className="trick" aria-label="Текущая взятка">
          {state.currentTrick.map((played) =>
            "faceDown" in played.card ? (
              <span
                key={played.seat}
                className="card-back trick-back"
                aria-label="Рубашка"
              />
            ) : (
              <PlayingCard
                key={played.seat}
                card={played.card}
                trump={trump === played.card.suit}
              />
            ),
          )}
        </section>
      )}

      <aside className="trick-dock" aria-label="Взятки">
        <SeatTriangle
          viewer={seat}
          left={leftSeat}
          right={rightSeat}
          names={playerNames}
          tricks={state.tricksWon}
          turn={
            typeof state.turn === "number"
              ? state.turn
              : state.phase === "auction" &&
                  typeof state.auction.turn === "number"
                ? state.auction.turn
                : null
          }
        />
        {lastTrick === undefined ? null : (
          <details className="last-trick">
            <summary>Последняя взятка</summary>
            <div className="trick">
              {lastTrick.cards.map((played) => (
                <PlayingCard
                  key={played.seat}
                  card={played.card}
                  trump={trump === played.card.suit}
                />
              ))}
            </div>
            <p className="trick-count">
              {lastTrick.winner === seat
                ? "Взятку взяли вы"
                : `Взятку взял ${playerName(lastTrick.winner, seat, playerNames)}`}
            </p>
          </details>
        )}
      </aside>

      <section className="game-hand" aria-label="Ваши карты">
        {hand.map((card, index) => {
          const play = playActions.find((action) =>
            sameCard(action.card, card),
          );
          const fromTalon =
            state.phase === "discard" &&
            (state.talonCards ?? []).some((item) => sameCard(item, card));
          return (
            <PlayingCard
              key={`${card.suit}:${card.rank}:${index}`}
              card={card}
              suitBreak={
                index > 0 && hand[index - 1]?.suit !== card.suit
              }
              trump={trump === card.suit}
              talon={fromTalon}
              selected={selected.some((item) => sameCard(item, card))}
              onClick={
                discardActions.length > 0
                  ? () => toggleSelected(card, selected, setSelected)
                  : play === undefined
                    ? undefined
                    : () => onAction(play)
              }
            />
          );
        })}
      </section>
      {(state.discarded ?? []).length === 0 ? null : (
        <section
          className="discard-pile"
          aria-label={state.facedTalon ? "Прикуп в лицо" : "Ваш снос"}
        >
          <p className="trick-count">
            {state.facedTalon ? facedTalonCaption() : "Ваш снос"}
          </p>
          <div className="trick">
            {state.discarded?.map((card, index) => (
              <PlayingCard
                key={`${card.suit}:${card.rank}:${index}`}
                card={card}
              />
            ))}
          </div>
        </section>
      )}

      {discardActions.length === 0 && throwAction === undefined ? null : (
        <section className="game-actions">
          {discardActions.length === 0 ? null : (
            <button
              type="button"
              disabled={selected.length !== 2}
              onClick={() => {
                const action = discardActions.find((candidate) =>
                  candidate.cards?.every((card) =>
                    selected.some((item) => sameCard(item, card)),
                  ),
                );
                if (action !== undefined) {
                  onAction(action);
                }
              }}
            >
              Снести две карты
            </button>
          )}
          {throwAction === undefined ? null : (
            <button type="button" onClick={() => onAction(throwAction)}>
              {actionLabel(throwAction)}
            </button>
          )}
        </section>
      )}

      {otherActions.length === 0 ? null : (
        <section className="game-actions">
          {otherActions.map((action, index) => (
            <button
              type="button"
              key={`${actionLabel(action)}:${index}`}
              onClick={() => onAction(action)}
            >
              {actionLabel(action)}
            </button>
          ))}
        </section>
      )}

      <div className="corner-tools">
        <button
          type="button"
          className="bullet-open"
          onClick={() => setBulletOpen(true)}
        >
          Открыть пулю
        </button>
        {state.lastLayout == null ? null : (
          <button
            type="button"
            className="bullet-open"
            disabled={layoutLocked}
            onClick={() => setLayoutOpen(true)}
          >
            Расклад
          </button>
        )}
      </div>
      {bulletOpen ? (
        <div
          className="bullet-backdrop"
          onClick={() => setBulletOpen(false)}
        >
          <div
            className="bullet-dialog"
            role="dialog"
            aria-label="Пуля"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="bullet-close"
              onClick={() => setBulletOpen(false)}
            >
              Закрыть
            </button>
            <BulletSheet
              score={state.score}
              settlement={state.settlement ?? null}
              viewer={seat}
              names={playerNames}
              bulletTarget={settings.bulletTarget}
            />
          </div>
        </div>
      ) : null}
      {layoutOpen && !layoutLocked && state.lastLayout != null ? (
        <div
          className="bullet-backdrop"
          onClick={() => setLayoutOpen(false)}
        >
          <div
            className="layout-dialog"
            role="dialog"
            aria-label="Расклад"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="bullet-close"
              onClick={() => setLayoutOpen(false)}
            >
              Закрыть
            </button>
            <LayoutSheet
              layout={state.lastLayout}
              viewer={seat}
              names={playerNames}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}

function visibleOpponent(state: GameSnapshot, place: number): readonly Card[] {
  if (state.shownHands != null) {
    return state.shownHands[place] ?? [];
  }
  return state.openSeat === place ? (state.openHand ?? []) : [];
}

function Opponent({
  place,
  name,
  empty,
  cards,
  openCards,
  playActions,
  trump,
  onAction,
  passed,
  side,
}: {
  place: number;
  name: string | null;
  empty: boolean;
  cards: number;
  openCards: readonly Card[];
  playActions: GameAction[];
  trump: string | null;
  onAction: (action: GameAction) => void;
  passed: boolean;
  side: "left" | "right";
}): React.JSX.Element {
  const visible = sortHand(openCards);
  const openClass =
    visible.length === 0
      ? "opponent"
      : side === "right"
        ? "opponent opponent-open opponent-open-right"
        : "opponent opponent-open";
  return (
    <div className={openClass}>
      {visible.length > 0 ? (
        <div className="opponent-cards" aria-label="Карты всветлую">
          {suitGroups(visible).map((group) => (
            <div className="open-suit" key={group[0]?.suit}>
              <span
                className={
                  isRedSuit(group[0]?.suit ?? "")
                    ? "open-suit-mark bid-red"
                    : "open-suit-mark"
                }
              >
                {suitSymbol(group[0]?.suit ?? "")}
              </span>
              {group.map((card, index) => {
                const play = playActions.find((action) =>
                  sameCard(action.card, card),
                );
                return (
                  <PlayingCard
                    key={`${card.suit}:${card.rank}:${index}`}
                    card={card}
                    trump={trump === card.suit}
                    onClick={
                      play === undefined ? undefined : () => onAction(play)
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="backs" aria-hidden="true">
          {Array.from({ length: cards }, (_, index) => (
            <span key={index} className="card-back" />
          ))}
        </div>
      )}
      <p className="opponent-name">
        {name ?? (empty ? "свободно" : `Место ${place + 1}`)}
      </p>
      <p className="opponent-meta">
        {cardsLabel(cards)}
        {passed ? " · пас" : ""}
      </p>
    </div>
  );
}

function AuctionBoard({
  auction,
  actions,
  seat,
  names,
  dealer,
  viewer,
  onAction,
}: {
  auction: AuctionSnapshot;
  actions: GameAction[];
  seat: number;
  names: (string | null)[] | null;
  dealer: number;
  viewer: number;
  onAction: (action: GameAction) => void;
}): React.JSX.Element {
  const pass = actions.find(isAuctionPass);
  const yourTurn = actions.length > 0;
  const call = bidCaption(auction.highestBid);
  const bidder =
    auction.highestBidder === undefined || auction.highestBidder === null
      ? null
      : seatLabel(auction.highestBidder, viewer, names, dealer);
  const turn = typeof auction.turn === "number" ? auction.turn : null;
  const turnText = turnLabel(yourTurn ? seat : turn, names, viewer);

  return (
    <section className="auction" aria-label="Торги">
      <p className={yourTurn ? "bid-turn bid-turn-you" : "bid-turn"}>
        {turnText}
      </p>
      <p className="bid-call">
        {call === null ? "Торг открыт" : call}
        {call !== null && bidder !== null ? <span> · {bidder}</span> : null}
      </p>
      {auction.active === undefined ? null : (
        <p className="bid-round">
          В торге: {traders(auction.active, Number(seat), names, dealer)}
        </p>
      )}
      {yourTurn ? null : (
        <p className="bid-wait">
          Торг продолжается. {turnLabel(turn, names, viewer)}.
        </p>
      )}
      {yourTurn ? (
      <div className="bid-grid">
        <span />
        {TRUMPS.map((trump) => (
          <span
            key={trump}
            className={
              isRedSuit(trump) ? "bid-head bid-red" : "bid-head"
            }
          >
            {suitSymbol(trump)}
          </span>
        ))}
        {BID_ROWS.map((row) =>
          row === "misere" ? (
            <MisereCell
              key="misere"
              action={actions.find(isMisereBid)}
              current={auction.highestBid?.type === "misere"}
              onAction={onAction}
            />
          ) : (
            <LevelRow
              key={row}
              level={row}
              actions={actions}
              current={auction.highestBid}
              onAction={onAction}
            />
          ),
        )}
      </div>
      ) : null}
      {pass === undefined ? null : (
        <button
          type="button"
          className="bid-pass"
          onClick={() => onAction(pass)}
        >
          Пас
        </button>
      )}
    </section>
  );
}

function OrderBoard({
  auction,
  actions,
  names,
  viewer,
  onAction,
}: {
  auction: AuctionSnapshot;
  actions: GameAction[];
  names: (string | null)[] | null;
  viewer: number;
  onAction: (action: GameAction) => void;
}): React.JSX.Element {
  const yourTurn = actions.length > 0;
  const floor = resultBid(auction.result);
  const floorText = bidCaption(floor) ?? "мизер";
  const turn =
    typeof auction.result?.declarer === "number"
      ? auction.result.declarer
      : null;

  return (
    <section className="auction" aria-label="Заказ">
      <p className={yourTurn ? "bid-turn bid-turn-you" : "bid-turn"}>
        {yourTurn ? "Ваш заказ" : turnLabel(turn, names, viewer)}
      </p>
      <p className="bid-call">
        {floor?.type === "misere"
          ? "Закажите мизер."
          : `Можно заказать ${floorText} или старше.`}
      </p>
      {yourTurn && floor?.type === "misere" ? (
        <button
          type="button"
          className="bid-pass"
          onClick={() => {
            const misere = actions.find(isMisereBid);
            if (misere !== undefined) {
              onAction(misere);
            }
          }}
        >
          Играть мизер
        </button>
      ) : yourTurn ? (
        <div className="bid-grid">
          <span />
          {TRUMPS.map((trump) => (
            <span
              key={trump}
              className={isRedSuit(trump) ? "bid-head bid-red" : "bid-head"}
            >
              {suitSymbol(trump)}
            </span>
          ))}
          {BID_ROWS.map((row) =>
            row === "misere" ? (
              actions.some((action) => action.type === "withoutThree") ? (
                <button
                  key="without-three"
                  type="button"
                  className="bid-cell bid-misere-btn"
                  onClick={() => onAction({ type: "withoutThree" })}
                >
                  Без трёх
                </button>
              ) : (
                <MisereCell
                  key="misere"
                  action={actions.find(isMisereBid)}
                  current={floor?.type === "misere"}
                  onAction={onAction}
                />
              )
            ) : (
              <LevelRow
                key={row}
                level={row}
                actions={actions}
                current={floor}
                onAction={onAction}
              />
            ),
          )}
        </div>
      ) : (
        <p className="bid-wait">Ждём заказ разыгрывающего.</p>
      )}
    </section>
  );
}

export function LayoutSheet({
  layout,
  viewer,
  names,
}: {
  layout: NonNullable<GameSnapshot["lastLayout"]>;
  viewer: number;
  names: readonly (string | null)[] | null;
}): React.JSX.Element {
  return (
    <div className="layout-board">
      {[0, 1, 2].map((place) => (
        <section key={place}>
          <h2>
            {playerName(place, viewer, names)}
            {layout.tricks === undefined
              ? ""
              : ` · ${trickCount(layout.tricks[place] ?? 0)}`}
          </h2>
          <div className="layout-hand">
            {sortHand(layout.hands[place] ?? []).map((card, index) => (
              <PlayingCard
                key={`${card.suit}:${card.rank}:${index}`}
                card={card}
              />
            ))}
          </div>
        </section>
      ))}
      {layout.talon.length === 0 ? null : (
        <section>
          <h2>Прикуп</h2>
          <div className="layout-hand">
            {layout.talon.map((card, index) => (
              <PlayingCard
                key={`${card.suit}:${card.rank}:${index}`}
                card={card}
              />
            ))}
          </div>
        </section>
      )}
      {layout.discarded.length === 0 ? null : (
        <section>
          <h2>Снос</h2>
          <div className="layout-hand">
            {layout.discarded.map((card, index) => (
              <PlayingCard
                key={`${card.suit}:${card.rank}:${index}`}
                card={card}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function trickCount(count: number): string {
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

function resultBid(
  result: AuctionSnapshot["result"],
): AuctionBid | null {
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

function LevelRow({
  level,
  actions,
  current,
  onAction,
}: {
  level: number;
  actions: GameAction[];
  current: AuctionBid | null | undefined;
  onAction: (action: GameAction) => void;
}): React.JSX.Element {
  return (
    <>
      <span className="bid-level">{level}</span>
      {TRUMPS.map((trump) => {
        const action = actions.find((candidate) => {
          const bid = contractOf(candidate);
          return bid?.level === level && bid.trump === trump;
        });
        const symbol = suitSymbol(trump);
        const currentBid =
          current?.type === "contract" &&
          current.level === level &&
          current.trump === trump;
        if (action === undefined) {
          return (
            <span
              key={trump}
              className={currentBid ? "bid-slot bid-current" : "bid-slot"}
            >
              {currentBid ? symbol : ""}
            </span>
          );
        }
        return (
          <button
            key={trump}
            type="button"
            className={isRedSuit(trump) ? "bid-cell bid-red" : "bid-cell"}
            aria-label={`${level} ${symbol}`}
            onClick={() => onAction(action)}
          >
            {symbol}
          </button>
        );
      })}
    </>
  );
}

function MisereCell({
  action,
  current,
  onAction,
}: {
  action: GameAction | undefined;
  current: boolean;
  onAction: (action: GameAction) => void;
}): React.JSX.Element {
  if (action === undefined) {
    return (
      <span className={current ? "bid-misere bid-current" : "bid-misere"}>
        Мизер
      </span>
    );
  }
  return (
    <button
      type="button"
      className="bid-cell bid-misere-btn"
      onClick={() => onAction(action)}
    >
      Мизер
    </button>
  );
}

function PlayingCard({
  card,
  suitBreak = false,
  trump = false,
  talon = false,
  selected = false,
  onClick,
}: {
  card: Card;
  suitBreak?: boolean;
  trump?: boolean;
  talon?: boolean;
  selected?: boolean;
  onClick?: () => void;
}): React.JSX.Element {
  const className = [
    "pc",
    isRedSuit(card.suit) ? "pc-red" : "",
    suitBreak ? "pc-break" : "",
    trump ? "pc-trump" : "",
    talon ? "pc-talon" : "",
    selected ? "pc-selected" : "",
  ]
    .filter((item) => item.length > 0)
    .join(" ");
  const label = `${rankLabel(card.rank)} ${suitSymbol(card.suit)}${talon ? ", прикуп" : ""}`;
  const body = (
    <>
      <span className="pc-corner">
        <span>{rankLabel(card.rank)}</span>
        <span>{suitSymbol(card.suit)}</span>
      </span>
      <span className="pc-suit" aria-hidden="true">
        {suitSymbol(card.suit)}
      </span>
    </>
  );
  if (onClick === undefined) {
    return (
      <div className={className} aria-label={label}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
    >
      {body}
    </button>
  );
}

const TRUMPS = [
  "spades",
  "clubs",
  "diamonds",
  "hearts",
  "noTrump",
] as const;

const BID_ROWS = [6, 7, 8, 9, 10, "misere"] as const;

const SUIT_ORDER = ["spades", "diamonds", "clubs", "hearts"];

function suitSymbol(suit: string): string {
  if (suit === "spades") return "♠";
  if (suit === "clubs") return "♣";
  if (suit === "diamonds") return "♦";
  if (suit === "hearts") return "♥";
  if (suit === "noTrump") return "БК";
  return suit;
}

function isRedSuit(suit: string): boolean {
  return suit === "hearts" || suit === "diamonds";
}

function rankLabel(rank: number): string {
  if (rank === 11) return "В";
  if (rank === 12) return "Д";
  if (rank === 13) return "К";
  if (rank === 14) return "Т";
  return String(rank);
}

function suitGroups(hand: readonly Card[]): Card[][] {
  return SUIT_ORDER.flatMap((suit) => {
    const group = hand.filter((card) => card.suit === suit);
    return group.length === 0 ? [] : [group];
  });
}

function sortHand(hand: readonly Card[]): Card[] {
  return [...hand].sort((left, right) => {
    const suit = SUIT_ORDER.indexOf(left.suit) - SUIT_ORDER.indexOf(right.suit);
    if (suit !== 0) {
      return suit;
    }
    return left.rank - right.rank;
  });
}

function sameCard(left: Card | undefined, right: Card | undefined): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    left.suit === right.suit &&
    left.rank === right.rank
  );
}

function toggleSelected(
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

function cardsLabel(count: number): string {
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

function isAuctionPass(action: GameAction): boolean {
  return action.type === "auction" && action.action?.type === "pass";
}

function actionBid(action: GameAction): AuctionBid | undefined {
  if (action.type === "order") {
    return action.bid;
  }
  if (action.type === "auction" && action.action?.type === "bid") {
    return action.action.bid;
  }
  return undefined;
}

function isMisereBid(action: GameAction): boolean {
  return actionBid(action)?.type === "misere";
}

function contractOf(
  action: GameAction,
): { level: number; trump: string } | null {
  const bid = actionBid(action);
  if (
    bid?.type !== "contract" ||
    bid.level === undefined ||
    bid.trump === undefined
  ) {
    return null;
  }
  return { level: bid.level, trump: bid.trump };
}

function SeatTriangle({
  viewer,
  left,
  right,
  names,
  tricks,
  turn,
}: {
  viewer: number;
  left: number;
  right: number;
  names: readonly (string | null)[] | null;
  tricks: readonly number[];
  turn: number | null;
}): React.JSX.Element {
  const corners = [
    { seat: left, place: "left" },
    { seat: right, place: "right" },
    { seat: viewer, place: "me" },
  ] as const;
  const target =
    turn === left ? "left" : turn === right ? "right" : turn === viewer ? "me" : null;
  const tip = {
    left: { x: 54, y: 34 },
    right: { x: 266, y: 34 },
    me: { x: 160, y: 156 },
  } as const;
  const center = { x: 160, y: 92 };
  const arrow = target === null ? null : arrowTo(center, tip[target]);

  return (
    <div className="seat-triangle">
      <svg viewBox="0 0 320 188" aria-hidden={arrow === null}>
        <polygon
          points="160,176 22,40 298,40"
          className="seat-triangle-shape"
        />
        {arrow === null ? null : (
          <g className="seat-arrow" aria-label="Ход">
            <line
              x1={arrow.start.x}
              y1={arrow.start.y}
              x2={arrow.lineEnd.x}
              y2={arrow.lineEnd.y}
            />
            <polygon points={arrow.head} />
          </g>
        )}
      </svg>
      {corners.map((corner) => (
        <p
          key={corner.place}
          className={
            turn === corner.seat
              ? `seat-corner seat-corner-${corner.place} seat-corner-turn`
              : `seat-corner seat-corner-${corner.place}`
          }
        >
          <span>{playerName(corner.seat, viewer, names)}</span>
          <strong>{tricks[corner.seat] ?? 0}</strong>
        </p>
      ))}
    </div>
  );
}

function arrowTo(
  center: { x: number; y: number },
  target: { x: number; y: number },
): {
  start: { x: number; y: number };
  lineEnd: { x: number; y: number };
  head: string;
} {
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const start = {
    x: center.x + ux * 10,
    y: center.y + uy * 10,
  };
  const tip = {
    x: target.x - ux * 26,
    y: target.y - uy * 18,
  };
  const base = {
    x: tip.x - ux * 14,
    y: tip.y - uy * 14,
  };
  const left = {
    x: base.x + -uy * 7,
    y: base.y + ux * 7,
  };
  const right = {
    x: base.x - -uy * 7,
    y: base.y - ux * 7,
  };
  return {
    start,
    lineEnd: base,
    head: `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`,
  };
}

export function BulletSheet({
  score,
  settlement,
  viewer,
  names,
  bulletTarget,
}: {
  score: GameSnapshot["score"];
  settlement: [number, number, number] | null;
  viewer: number;
  names: readonly (string | null)[] | null;
  bulletTarget: number;
}): React.JSX.Element {
  const zeros: [number, number, number] = [0, 0, 0];
  const lastBullet = score.last?.bullet ?? zeros;
  const lastMountain = score.last?.mountain ?? zeros;
  const lastWhists = score.last?.whists ?? [zeros, zeros, zeros];

  const left = (viewer + 1) % 3;
  const right = (viewer + 2) % 3;
  const leftName = playerName(left, viewer, names);
  const rightName = playerName(right, viewer, names);
  const viewerName = playerName(viewer, viewer, names);
  const mountain = (seat: number) =>
    ruled(score.mountain[seat] ?? 0, lastMountain[seat] ?? 0);
  const bullet = (seat: number) =>
    ruled(score.bullet[seat] ?? 0, lastBullet[seat] ?? 0);
  const whist = (from: number, to: number) =>
    ruled(score.whists[from]?.[to] ?? 0, lastWhists[from]?.[to] ?? 0);
  const standing = (seat: number) =>
    standingParts(
      playerStanding(score.bullet, score.mountain, score.whists, seat),
      playerStanding(lastBullet, lastMountain, lastWhists, seat),
    );

  const leftEdge = 28;
  const rightEdge = 612;
  const topEdge = 28;
  const bottomEdge = 612;
  const mid = 320;
  const whistW = 112;
  const poolW = 68;
  const westWhist = leftEdge + whistW;
  const westPool = westWhist + poolW;
  const eastWhist = rightEdge - whistW;
  const eastPool = eastWhist - poolW;
  const apexY = 270;
  const rise = bottomEdge - apexY;
  const run = mid - leftEdge;
  const along = (x: number) => apexY + ((mid - x) * rise) / run;
  const diagonalX = (y: number) => mid - ((y - apexY) * run) / rise;
  const mountainBase = along(westPool);
  const poolBase = along(westWhist);
  const circleR = 38;
  const circleY = apexY - circleR;
  const whistSplit = (topEdge + bottomEdge) / 2;
  const westMountainX = (westPool + (mid - circleR)) / 2;
  const eastMountainX = mid * 2 - westMountainX;
  const westBulletX = (westWhist + westPool) / 2;
  const eastBulletX = mid * 2 - westBulletX;
  const westWhistX = (leftEdge + westWhist) / 2;
  const eastWhistX = mid * 2 - westWhistX;
  const viewerWhistY = (poolBase + bottomEdge) / 2 + 18;
  const viewerWhistWest = (diagonalX(viewerWhistY) + mid) / 2;
  const viewerWhistEast = mid * 2 - viewerWhistWest;

  return (
    <article className="bullet-paper">
      <svg className="pulka" viewBox="0 0 640 640" role="img" aria-label="Пуля">
        <defs>
          <pattern
            id="pulka-cell"
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
            x={leftEdge}
            y={topEdge}
          >
            <path d="M 16 0 H 0 V 16" className="pulka-cell" />
          </pattern>
          <pattern
            id="pulka-block"
            width="80"
            height="80"
            patternUnits="userSpaceOnUse"
            x={leftEdge}
            y={topEdge}
          >
            <path d="M 80 0 H 0 V 80" className="pulka-block" />
          </pattern>
        </defs>
        <rect
          x={leftEdge}
          y={topEdge}
          width={rightEdge - leftEdge}
          height={bottomEdge - topEdge}
          className="pulka-paper"
        />
        <rect
          x={leftEdge}
          y={topEdge}
          width={rightEdge - leftEdge}
          height={bottomEdge - topEdge}
          fill="url(#pulka-cell)"
        />
        <rect
          x={leftEdge}
          y={topEdge}
          width={rightEdge - leftEdge}
          height={bottomEdge - topEdge}
          fill="url(#pulka-block)"
        />
        <g className="pulka-ink">
          <rect
            x={leftEdge}
            y={topEdge}
            width={rightEdge - leftEdge}
            height={bottomEdge - topEdge}
          />
          <line x1={westWhist} y1={topEdge} x2={westWhist} y2={poolBase} />
          <line x1={westPool} y1={topEdge} x2={westPool} y2={mountainBase} />
          <line x1={eastPool} y1={topEdge} x2={eastPool} y2={mountainBase} />
          <line x1={eastWhist} y1={topEdge} x2={eastWhist} y2={poolBase} />
          <line x1={mid} y1={topEdge} x2={mid} y2={circleY - circleR} />
          <line x1={mid} y1={poolBase} x2={mid} y2={bottomEdge} />
          <line x1={leftEdge} y1={whistSplit} x2={westWhist} y2={whistSplit} />
          <line x1={eastWhist} y1={whistSplit} x2={rightEdge} y2={whistSplit} />
          <line x1={westPool} y1={mountainBase} x2={eastPool} y2={mountainBase} />
          <line x1={westWhist} y1={poolBase} x2={eastWhist} y2={poolBase} />
          <line x1={mid} y1={apexY} x2={leftEdge} y2={bottomEdge} />
          <line x1={mid} y1={apexY} x2={rightEdge} y2={bottomEdge} />
        </g>
        <circle
          cx={mid}
          cy={circleY}
          r={circleR}
          className="pulka-seal"
        />
        <text x={mid} y={circleY} className="pulka-pact pulka-center">
          до {bulletTarget}
        </text>
        <PulkaEntry
          x={westMountainX}
          y={circleY}
          turn="left"
          kind="name"
          main={leftName}
          {...standing(left)}
        />
        <PulkaEntry
          x={westMountainX}
          y={118}
          turn="left"
          kind="figure"
          {...mountain(left)}
        />
        <PulkaEntry
          x={westBulletX}
          y={210}
          turn="left"
          kind="figure"
          {...bullet(left)}
        />
        <PulkaEntry
          x={westWhistX}
          y={(topEdge + whistSplit) / 2}
          turn="left"
          kind="figure"
          {...whist(left, right)}
        />
        <PulkaEntry
          x={westWhistX}
          y={(whistSplit + bottomEdge) / 2}
          turn="left"
          kind="figure"
          {...whist(left, viewer)}
        />
        <PulkaEntry
          x={eastMountainX}
          y={circleY}
          turn="right"
          kind="name"
          main={rightName}
          {...standing(right)}
        />
        <PulkaEntry
          x={eastMountainX}
          y={118}
          turn="right"
          kind="figure"
          {...mountain(right)}
        />
        <PulkaEntry
          x={eastBulletX}
          y={210}
          turn="right"
          kind="figure"
          {...bullet(right)}
        />
        <PulkaEntry
          x={eastWhistX}
          y={(topEdge + whistSplit) / 2}
          turn="right"
          kind="figure"
          {...whist(right, left)}
        />
        <PulkaEntry
          x={eastWhistX}
          y={(whistSplit + bottomEdge) / 2}
          turn="right"
          kind="figure"
          {...whist(right, viewer)}
        />
        <PulkaEntry
          x={mid}
          y={334}
          turn="none"
          kind="name"
          main={viewerName}
          {...standing(viewer)}
        />
        <PulkaEntry
          x={mid}
          y={368}
          turn="none"
          kind="figure"
          {...mountain(viewer)}
        />
        <PulkaEntry
          x={mid}
          y={(mountainBase + poolBase) / 2}
          turn="none"
          kind="figure"
          {...bullet(viewer)}
        />
        <PulkaEntry
          x={viewerWhistWest}
          y={viewerWhistY}
          turn="none"
          kind="figure"
          {...whist(viewer, left)}
        />
        <PulkaEntry
          x={viewerWhistEast}
          y={viewerWhistY}
          turn="none"
          kind="figure"
          {...whist(viewer, right)}
        />
      </svg>
      {settlement === null ? null : (
        <p className="bullet-result">
          Итог:{" "}
          {[0, 1, 2]
            .map(
              (place) =>
                `${playerName(place, viewer, names)} ${signed(settlement[place] ?? 0)}`,
            )
            .join(", ")}
        </p>
      )}
    </article>
  );
}

function PulkaEntry({
  x,
  y,
  turn,
  kind,
  main,
  note,
  tone = null,
}: {
  x: number;
  y: number;
  turn: "left" | "right" | "none";
  kind: "name" | "figure";
  main: string;
  note: string | null;
  tone?: number | null;
}): React.JSX.Element | null {
  if (main === "" && tone === null && note === null) {
    return null;
  }
  const transform =
    turn === "left"
      ? `rotate(90 ${x} ${y})`
      : turn === "right"
        ? `rotate(-90 ${x} ${y})`
        : undefined;
  const quiet =
    note === null ? null : (
      <tspan className="pulka-quiet">
        {main === "" && tone === null ? note : ` ${note}`}
      </tspan>
    );
  return (
    <text
      x={x}
      y={y}
      className={
        kind === "name" ? "pulka-name pulka-center" : "pulka-figure pulka-center"
      }
      transform={transform}
    >
      {main}
      {tone === null ? null : (
        <tspan className={tone > 0 ? "pulka-plus" : "pulka-minus"}>
          {` ${signed(tone)}`}
        </tspan>
      )}
      {quiet}
    </text>
  );
}

function netWhist(
  rows: readonly (readonly number[] | undefined)[],
  seat: number,
): number {
  let total = 0;
  for (const other of [0, 1, 2]) {
    if (other === seat) {
      continue;
    }
    total += (rows[seat]?.[other] ?? 0) - (rows[other]?.[seat] ?? 0);
  }
  return total;
}

function poolEdge(values: readonly number[], seat: number): number {
  let total = 0;
  for (const other of [0, 1, 2]) {
    if (other === seat) {
      continue;
    }
    total += (values[seat] ?? 0) - (values[other] ?? 0);
  }
  return total;
}

function playerStanding(
  bullet: readonly number[],
  mountain: readonly number[],
  whists: readonly (readonly number[])[],
  seat: number,
): number {
  return netWhist(whists, seat) + poolEdge(bullet, seat) - poolEdge(mountain, seat);
}

function standingParts(
  total: number,
  delta: number,
): { tone: number | null; note: string | null } {
  return {
    tone: total === 0 ? null : total,
    note: delta === 0 ? null : `(${signed(delta)})`,
  };
}

function ruled(
  value: number,
  delta: number,
): { main: string; note: string | null } {
  if (value === 0 && delta === 0) {
    return { main: "", note: null };
  }
  return {
    main: value === 0 ? "" : `${plain(value)}.`,
    note: delta === 0 ? null : `(${signed(delta)})`,
  };
}

function plain(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : String(value);
}

export function resultsText(
  names: readonly string[],
  settlement: readonly [number, number, number],
  deals: readonly PlayedDeal[],
): string {
  const totals = names
    .map((name, seat) => `${name} ${signed(settlement[seat] ?? 0)}`)
    .join("\n");
  const lines = deals.map((deal) => dealLine(deal, names));
  return `Итог\n${totals}\n\nРаздачи\n${lines.join("\n")}\n`;
}

function dealLine(deal: PlayedDeal, names: readonly string[]): string {
  const declarer =
    deal.declarer === null ? null : (names[deal.declarer] ?? null);
  const title =
    declarer === null
      ? `${deal.number}. ${deal.contract}`
      : `${deal.number}. ${declarer} — ${deal.contract}`;
  const points = names
    .map(
      (name, seat) =>
        `${name} ${signed(
          playerStanding(
            deal.delta.bullet,
            deal.delta.mountain,
            deal.delta.whists,
            seat,
          ),
        )}`,
    )
    .join(", ");
  const played = deal.tricks[0] + deal.tricks[1] + deal.tricks[2] > 0;
  if (!played) {
    return `${title}. ${points}`;
  }
  const tricks = names
    .map((name, seat) => `${name} ${deal.tricks[seat] ?? 0}`)
    .join(", ");
  return `${title}. Взяток: ${tricks}. ${points}`;
}

function downloadResults(text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "результаты.txt";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function signed(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  if (value < 0) {
    return `−${Math.abs(value)}`;
  }
  return "0";
}

function gameTitle(
  result: AuctionSnapshot["result"],
  names: readonly (string | null)[] | null,
  viewer: number,
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
  const declarer =
    typeof result.declarer === "number"
      ? playerName(result.declarer, viewer, names)
      : null;
  return (
    <header className="game-top">
      <h1 className="game-title">
        {typeof caption === "string" ? (
          caption
        ) : (
          <>
            {caption.level}{" "}
            <span className={isRedSuit(caption.trump) ? "bid-red" : undefined}>
              {suitSymbol(caption.trump)}
            </span>
          </>
        )}
      </h1>
      {declarer === null ? null : (
        <p className="game-declarer">Разыгрывает {declarer}</p>
      )}
    </header>
  );
}

function bidCaption(bid: AuctionBid | null | undefined): string | null {
  if (bid == null) {
    return null;
  }
  if (bid.type === "misere") {
    return "Мизер";
  }
  if (
    bid.type === "contract" &&
    bid.level !== undefined &&
    bid.trump !== undefined
  ) {
    return `${bid.level} ${suitSymbol(bid.trump)}`;
  }
  return null;
}

function emptySeatMessage(
  occupied: boolean[] | null | undefined,
  turn: number | null | undefined,
): string | null {
  if (occupied === null || occupied === undefined || occupied.length < 3) {
    return null;
  }
  const empty = occupied.flatMap((taken, index) =>
    taken ? [] : [index + 1],
  );
  if (empty.length === 0) {
    return null;
  }
  const names = empty.map((place) => `место ${place}`).join(" и ");
  if (typeof turn === "number" && occupied[turn] === false) {
    return `Ход места ${turn + 1}, но оно свободно.`;
  }
  return `Свободно: ${names}.`;
}

function personName(
  names: readonly (string | null)[] | null | undefined,
  place: number,
): string | null {
  const name = names?.[place];
  return name == null || name.length === 0 ? null : name;
}

function playerName(
  place: number,
  viewer: number,
  names: readonly (string | null)[] | null | undefined,
): string {
  if (place === viewer) {
    return "вы";
  }
  return personName(names, place) ?? `место ${place + 1}`;
}

function seatLabel(
  place: number,
  viewer: number,
  names: readonly (string | null)[] | null | undefined,
  dealer: number,
): string {
  const who = playerName(place, viewer, names);
  return place === dealer ? `${who} (сдавал)` : who;
}

function traders(
  active: readonly boolean[],
  seat: number,
  names: readonly (string | null)[] | null,
  dealer: number,
): string {
  const playing = active.flatMap((stillIn, index) => {
    if (!stillIn) {
      return [];
    }
    return [seatLabel(index, seat, names, dealer)];
  });
  return playing.length === 0 ? "никто" : playing.join(", ");
}

function turnLabel(
  turn: number | null | undefined,
  names: readonly (string | null)[] | null | undefined,
  viewer: number,
): string {
  if (turn === undefined || turn === null) {
    return "Ожидание";
  }
  if (turn === viewer) {
    return "Ваш ход";
  }
  const who = playerName(turn, viewer, names);
  if (who.startsWith("место ")) {
    return `Ход места ${who.slice("место ".length)}`;
  }
  return `Ход ${who}`;
}

function facedTalonCaption(): string {
  return "Прикуп в лицо сдающему · 2 в гору";
}

function actionLabel(action: GameAction): string {
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
