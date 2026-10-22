import { useEffect, useRef, useState, type CSSProperties } from "react";
import { settleBullet, type BulletScore } from "@pref/engine";

import type { TableSettings } from "./App.js";
import {
  CardFaceLayers,
  cardArtSrc,
  cardScaleStyle,
  rankLetter,
  suitSequence,
  finishedTrick,
  pauseMilliseconds,
  useDisplayProfile,
} from "./profile.js";
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
  tricks?: number;
  answer?: "agree" | "decline";
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

interface TableSpeech {
  seat: number | null;
  word: string;
  step: number;
}

interface SpeechDeal {
  deal: number;
  lines: TableSpeech[];
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
    const reason =
      typeof message.reason === "string" ? message.reason : "rejected";
    if (
      reason === "versionMismatch" &&
      current !== null &&
      message.version === current.version
    ) {
      return { snapshot: current, error: null };
    }
    const error = auctionError(reason);
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
      "Стол уже изменился. Этот ход не засчитан, на экране актуальное положение.",
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
  const inflightRef = useRef(false);
  const connectRef = useRef<(() => void) | null>(null);
  const [occupiedSeats, setOccupiedSeats] = useState<boolean[] | null>(null);
  const [playerNames, setPlayerNames] = useState<(string | null)[] | null>(
    null,
  );

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
            inflightRef.current = false;
            if (next.snapshot !== null) {
              snapshotRef.current = next.snapshot;
              setSnapshot(next.snapshot);
            }
            setError(next.error);
          })
          .catch(() => {
            inflightRef.current = false;
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
    if (inflightRef.current) {
      return;
    }
    if (
      current === null ||
      currentSocket === null ||
      currentSocket.readyState !== WebSocket.OPEN
    ) {
      setError("Нет связи со столом. Переподключаемся…");
      connectRef.current?.();
      return;
    }
    inflightRef.current = true;
    window.setTimeout(() => {
      inflightRef.current = false;
    }, 4000);
    setError(null);
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
  const profile = useDisplayProfile();
  const [selected, setSelected] = useState<Card[]>([]);
  const [bulletOpen, setBulletOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [seenSnapshot, setSeenSnapshot] = useState(snapshot);
  const [heldTrick, setHeldTrick] = useState<GameSnapshot["currentTrick"] | null>(
    null,
  );
  const [leadCard, setLeadCard] = useState<Card | null>(null);
  if (snapshot !== seenSnapshot) {
    const cards = finishedTrick(seenSnapshot.state, snapshot.state);
    setSeenSnapshot(snapshot);
    setLeadCard(null);
    if (profile.trickPause === 0) {
      setHeldTrick(null);
    } else if (cards !== null) {
      setHeldTrick(cards);
    }
  } else if (profile.trickPause === 0 && heldTrick !== null) {
    setHeldTrick(null);
  } else if (error !== null && leadCard !== null) {
    setLeadCard(null);
  }
  function playNow(action: GameAction): void {
    if (
      action.type === "playCard" &&
      action.card !== undefined &&
      heldTrick !== null
    ) {
      setHeldTrick(null);
      setLeadCard(action.card);
    }
    onAction(action);
  }
  useEffect(() => {
    if (heldTrick === null || profile.trickPause === 0) {
      return;
    }
    const timer = window.setTimeout(
      () => setHeldTrick(null),
      pauseMilliseconds(profile.trickPause),
    );
    return () => window.clearTimeout(timer);
  }, [heldTrick, profile.trickPause]);
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
  const proposeActions = state.allowedActions.filter(
    (action) => action.type === "propose" && action.tricks !== undefined,
  );
  const proposalReplies = state.allowedActions.filter(
    (action) => action.type === "proposal",
  );
  const otherActions = state.allowedActions.filter(
    (action) =>
      action.type !== "auction" &&
      action.type !== "order" &&
      action.type !== "withoutThree" &&
      action.type !== "openTalon" &&
      action.type !== "playCard" &&
      action.type !== "discard" &&
      action.type !== "throwTalon" &&
      action.type !== "propose" &&
      action.type !== "proposal",
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
  const hand = sortHand(state.hand, profile.handOrder, profile.suitOrder);
  const tableTrick =
    heldTrick !== null
      ? heldTrick
      : leadCard !== null && state.currentTrick.length === 0
        ? [{ seat, card: leadCard }]
        : state.currentTrick;
  const dealer = (state.dealNumber + 2) % 3;
  const gap = emptySeatMessage(occupiedSeats, state.auction.turn);
  const spoken = wordsOnStep(state.speech, state.speechStep);

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
      data-card-face={profile.cardFace}
      style={cardScaleStyle(profile.cardScale)}
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

      <DealLog
        log={speechEntries(state)}
        viewer={seat}
        names={playerNames}
      />

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
            onAction={playNow}
            word={shownBubble(spoken.get(leftSeat), state.phase)}
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
            onAction={playNow}
            word={shownBubble(spoken.get(rightSeat), state.phase)}
          />
        </section>
      )}

      {showAuction ? (
        <AuctionBoard
          auction={state.auction}
          actions={auctionActions}
          onAction={onAction}
        />
      ) : null}

      {showOrder ? (
        <OrderBoard
          auction={state.auction}
          actions={orderActions}
          onAction={onAction}
        />
      ) : null}

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

      {tableTrick.length === 0 ? null : (
        <section
          className="trick trick-play"
          aria-label="Текущая взятка"
          data-third={
            tableTrick.length < 3 ? undefined : thirdCardSide(tableTrick[2])
          }
        >
          {tableTrick.map((played, index) =>
            "faceDown" in played.card ? (
              <span
                key={played.seat}
                className={`card-back trick-back trick-at-${index}`}
                aria-label="Рубашка"
              />
            ) : (
              <PlayingCard
                key={played.seat}
                card={played.card}
                trump={trump === played.card.suit}
                placeClass={`trick-at-${index}`}
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
            <div
              className={
                lastTrick.talonCard === undefined
                  ? "trick"
                  : "trick trick-with-talon"
              }
            >
              {lastTrick.talonCard === undefined ? null : (
                <PlayingCard card={lastTrick.talonCard} talon />
              )}
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

      <div className="hand-seat">
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

        {proposeActions.length === 0 ? null : (
          <section className="game-actions proposal">
            <details>
              <summary>Моих</summary>
              <div className="proposal-choices">
                {proposeActions.map((action) => (
                  <button
                    type="button"
                    key={action.tricks}
                    onClick={() => onAction(action)}
                  >
                    {`моих ${action.tricks}`}
                  </button>
                ))}
              </div>
            </details>
          </section>
        )}

        {proposalReplies.length === 0 ? null : (
          <section className="game-actions">
            {proposalReplies.map((action) => (
              <button
                type="button"
                key={action.answer}
                onClick={() => onAction(action)}
              >
                {action.answer === "agree" ? "Согласен" : "Не согласен"}
              </button>
            ))}
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

        {shownBubble(spoken.get(seat), state.phase) === undefined ? null : (
          <p className="speech-bubble">
            <SpeechWord word={shownBubble(spoken.get(seat), state.phase) ?? ""} />
          </p>
        )}
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
                    : () => playNow(play)
              }
            />
          );
        })}
        </section>
      </div>
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
              deals={state.deals ?? []}
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
  word,
}: {
  place: number;
  name: string | null;
  empty: boolean;
  cards: number;
  openCards: readonly Card[];
  playActions: GameAction[];
  trump: string | null;
  onAction: (action: GameAction) => void;
  word: string | undefined;
}): React.JSX.Element {
  const profile = useDisplayProfile();
  const visible = sortHand(openCards, "asc", profile.suitOrder);
  const bySuit = profile.openLayout === "suits";
  const rows = bySuit ? suitRows(visible) : [visible];
  function openCard(card: Card, index: number): React.JSX.Element {
    const play = playActions.find((action) => sameCard(action.card, card));
    return (
      <PlayingCard
        key={`${card.suit}:${card.rank}:${index}`}
        card={card}
        trump={trump === card.suit}
        onClick={play === undefined ? undefined : () => onAction(play)}
      />
    );
  }
  return (
    <div className="opponent">
      <div className="opponent-word">
        {word === undefined ? null : (
          <p className="speech-bubble">
            <SpeechWord word={word} />
          </p>
        )}
      </div>
      {visible.length > 0 ? (
        <div
          className={
            bySuit ? "opponent-cards opponent-cards-suits" : "opponent-cards"
          }
          aria-label="Карты всветлую"
          style={
            bySuit
              ? undefined
              : ({ "--open-count": String(visible.length) } as CSSProperties)
          }
        >
          {bySuit
            ? rows.map((row) => (
                <div key={row[0]?.suit ?? "suit"} className="opponent-suit-row">
                  {row.map((card, index) => openCard(card, index))}
                </div>
              ))
            : visible.map((card, index) => openCard(card, index))}
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
      <p className="opponent-meta">{cardsLabel(cards)}</p>
    </div>
  );
}

function AuctionBoard({
  auction,
  actions,
  onAction,
}: {
  auction: AuctionSnapshot;
  actions: GameAction[];
  onAction: (action: GameAction) => void;
}): React.JSX.Element | null {
  if (actions.length === 0) {
    return null;
  }
  const pass = actions.find(isAuctionPass);

  return (
    <section className="auction" aria-label="Торги">
      <div className="bid-grid">
        {BID_ROWS.map((row) =>
          row === "misere" ? (
            <MisereCell
              key="misere"
              action={actions.find(isMisereBid)}
              current={auction.highestBid?.type === "misere"}
              paired={pass !== undefined}
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
        {pass === undefined ? null : (
          <button
            type="button"
            className="bid-cell bid-pass-wide"
            onClick={() => onAction(pass)}
          >
            Пас
          </button>
        )}
      </div>
    </section>
  );
}

function OrderBoard({
  auction,
  actions,
  onAction,
}: {
  auction: AuctionSnapshot;
  actions: GameAction[];
  onAction: (action: GameAction) => void;
}): React.JSX.Element {
  const yourTurn = actions.length > 0;
  const floor = resultBid(auction.result);
  const floorText = bidCaption(floor) ?? "мизер";

  return (
    <section className="auction" aria-label="Заказ">
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
      ) : null}
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
  const profile = useDisplayProfile();
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
            {sortHand(layout.hands[place] ?? [], "asc", profile.suitOrder).map((card, index) => (
              <PlayingCard
                key={`${card.suit}:${card.rank}:${index}`}
                card={card}
                hideCornerSuit
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
                hideCornerSuit
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
                hideCornerSuit
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function thirdCardSide(
  played: GameSnapshot["currentTrick"][number] | undefined,
): "above" | "below" {
  if (played === undefined || "faceDown" in played.card) {
    return played !== undefined && played.seat % 2 === 0 ? "above" : "below";
  }
  const salt = [...played.card.suit].reduce(
    (sum, char) => sum + char.charCodeAt(0),
    played.card.rank * 13 + played.seat,
  );
  return salt % 2 === 0 ? "above" : "below";
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
        const label = (
          <span className="bid-face">
            <span className="bid-count">{level}</span>
            <span className="bid-suit">{symbol}</span>
          </span>
        );
        if (action === undefined) {
          return (
            <span
              key={trump}
              className={currentBid ? "bid-slot bid-current" : "bid-slot"}
            >
              {label}
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
            {label}
          </button>
        );
      })}
    </>
  );
}

function MisereCell({
  action,
  current,
  paired = false,
  onAction,
}: {
  action: GameAction | undefined;
  current: boolean;
  paired?: boolean;
  onAction: (action: GameAction) => void;
}): React.JSX.Element {
  if (action === undefined) {
    const quiet = paired ? "bid-misere bid-span-2" : "bid-misere";
    return (
      <span className={current ? `${quiet} bid-current` : quiet}>Мизер</span>
    );
  }
  return (
    <button
      type="button"
      className={
        paired
          ? "bid-cell bid-misere-btn bid-span-2"
          : "bid-cell bid-misere-btn"
      }
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
  hideCornerSuit = false,
  placeClass,
  onClick,
}: {
  card: Card;
  suitBreak?: boolean;
  trump?: boolean;
  talon?: boolean;
  selected?: boolean;
  hideCornerSuit?: boolean;
  placeClass?: string;
  onClick?: () => void;
}): React.JSX.Element {
  const className = [
    "pc",
    isRedSuit(card.suit) ? "pc-red" : "",
    suitBreak ? "pc-break" : "",
    trump ? "pc-trump" : "",
    talon ? "pc-talon" : "",
    selected ? "pc-selected" : "",
    placeClass ?? "",
  ]
    .filter((item) => item.length > 0)
    .join(" ");
  const label = `${rankLabel(card.rank)} ${suitSymbol(card.suit)}${talon ? ", прикуп" : ""}`;
  const profile = useDisplayProfile();
  const art = cardArtSrc(profile.cardFace, card.suit, card.rank);
  const court = card.rank >= 11 && card.rank <= 13 ? "true" : undefined;
  const ace = card.rank === 14 ? "true" : undefined;
  const body =
    art === null ? (
      <CardFaceLayers
        rank={card.rank}
        rankText={rankLetter(card.rank, profile.cardLang)}
        suitText={suitSymbol(card.suit)}
        hideCornerSuit={hideCornerSuit}
      />
    ) : (
      <img className="pc-art" alt="" draggable={false} src={art} />
    );
  if (onClick === undefined) {
    return (
      <div
        className={className}
        aria-label={label}
        data-court={court}
        data-ace={ace}
      >
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
      data-court={court}
      data-ace={ace}
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

function shownBubble(
  word: string | undefined,
  phase: string,
): string | undefined {
  if (phase === "play" && word === "вист") {
    return undefined;
  }
  return word;
}

function sortHand(
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

function suitRows(cards: readonly Card[]): Card[][] {
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
  deals = [],
}: {
  score: GameSnapshot["score"];
  settlement: [number, number, number] | null;
  viewer: number;
  names: readonly (string | null)[] | null;
  bulletTarget: number;
  deals?: readonly PlayedDeal[];
}): React.JSX.Element {
  const played = toBulletScore(score);
  const earlier = scoreBeforeLast(played, score.last);
  const now = settleBullet(played);
  const then = settleBullet(earlier);

  const left = (viewer + 1) % 3;
  const right = (viewer + 2) % 3;
  const leftName = playerName(left, viewer, names);
  const rightName = playerName(right, viewer, names);
  const viewerName = playerName(viewer, viewer, names);
  const mountain = (seat: number) =>
    chainText(
      deals,
      (delta) => delta.mountain[seat] ?? 0,
      score.mountain[seat] ?? 0,
      false,
    );
  const bullet = (seat: number) =>
    chainText(
      deals,
      (delta) => delta.bullet[seat] ?? 0,
      score.bullet[seat] ?? 0,
      (score.bullet[seat] ?? 0) >= bulletTarget,
    );
  const whist = (from: number, to: number) =>
    chainText(
      deals,
      (delta) => delta.whists[from]?.[to] ?? 0,
      score.whists[from]?.[to] ?? 0,
      false,
    );
  const standing = (seat: number) =>
    standingParts(now[seat] ?? 0, (now[seat] ?? 0) - (then[seat] ?? 0));

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
  const circleR = 38;
  const circleY = 232;
  const apexY = circleY;
  const rise = bottomEdge - apexY;
  const run = mid - leftEdge;
  const along = (x: number) => apexY + ((mid - x) * rise) / run;
  const diagonalX = (y: number) => mid - ((y - apexY) * run) / rise;
  const mountainBase = along(westPool);
  const poolBase = along(westWhist);
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
  const verticalRoom = (center: number, top: number, bottom: number): number => {
    const half = Math.min(center - top, bottom - center) - 10;
    return Math.max(36, half * 2);
  };
  const horizontalRoom = (y: number): number =>
    Math.max(36, (mid - diagonalX(y)) * 2 - 28);
  const sideBulletRoom = verticalRoom(210, topEdge, mountainBase);
  const sideMountainRoom = verticalRoom(118, topEdge, circleY - 16);
  const sideWhistUpperRoom = verticalRoom(
    (topEdge + whistSplit) / 2,
    topEdge,
    whistSplit,
  );
  const sideWhistLowerRoom = verticalRoom(
    (whistSplit + bottomEdge) / 2,
    whistSplit,
    bottomEdge,
  );
  const viewerMountainRoom = horizontalRoom(368);
  const viewerBulletRoom = horizontalRoom((mountainBase + poolBase) / 2);
  const viewerWhistRoom = Math.max(36, horizontalRoom(viewerWhistY) * 0.42);

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
          main={mountain(left)}
          fit={sideMountainRoom}
        />
        <PulkaEntry
          x={westBulletX}
          y={210}
          turn="left"
          kind="figure"
          main={bullet(left)}
          fit={sideBulletRoom}
        />
        <PulkaEntry
          x={westWhistX}
          y={(topEdge + whistSplit) / 2}
          turn="left"
          kind="figure"
          main={whist(left, right)}
          fit={sideWhistUpperRoom}
        />
        <PulkaEntry
          x={westWhistX}
          y={(whistSplit + bottomEdge) / 2}
          turn="left"
          kind="figure"
          main={whist(left, viewer)}
          fit={sideWhistLowerRoom}
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
          main={mountain(right)}
          fit={sideMountainRoom}
        />
        <PulkaEntry
          x={eastBulletX}
          y={210}
          turn="right"
          kind="figure"
          main={bullet(right)}
          fit={sideBulletRoom}
        />
        <PulkaEntry
          x={eastWhistX}
          y={(topEdge + whistSplit) / 2}
          turn="right"
          kind="figure"
          main={whist(right, left)}
          fit={sideWhistUpperRoom}
        />
        <PulkaEntry
          x={eastWhistX}
          y={(whistSplit + bottomEdge) / 2}
          turn="right"
          kind="figure"
          main={whist(right, viewer)}
          fit={sideWhistLowerRoom}
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
          main={mountain(viewer)}
          fit={viewerMountainRoom}
        />
        <PulkaEntry
          x={mid}
          y={(mountainBase + poolBase) / 2}
          turn="none"
          kind="figure"
          main={bullet(viewer)}
          fit={viewerBulletRoom}
        />
        <PulkaEntry
          x={viewerWhistWest}
          y={viewerWhistY}
          turn="none"
          kind="figure"
          main={whist(viewer, left)}
          fit={viewerWhistRoom}
        />
        <PulkaEntry
          x={viewerWhistEast}
          y={viewerWhistY}
          turn="none"
          kind="figure"
          main={whist(viewer, right)}
          fit={viewerWhistRoom}
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
  note = null,
  tone = null,
  fit,
}: {
  x: number;
  y: number;
  turn: "left" | "right" | "none";
  kind: "name" | "figure";
  main: string;
  note?: string | null;
  tone?: number | null;
  fit?: number;
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
  const fontSize =
    kind === "figure" && fit !== undefined ? fitChain(main, fit) : undefined;
  return (
    <text
      x={x}
      y={y}
      className={
        kind === "name" ? "pulka-name pulka-center" : "pulka-figure pulka-center"
      }
      fontSize={fontSize}
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

function toBulletScore(score: GameSnapshot["score"]): BulletScore {
  const whists = score.whists ?? [];
  return {
    bullet: triple(score.bullet),
    mountain: triple(score.mountain),
    whists: [triple(whists[0]), triple(whists[1]), triple(whists[2])],
    last: {
      bullet: [0, 0, 0],
      mountain: [0, 0, 0],
      whists: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
    },
  };
}

function scoreBeforeLast(
  score: BulletScore,
  last: GameSnapshot["score"]["last"],
): BulletScore {
  return {
    ...score,
    bullet: minusTriple(score.bullet, last?.bullet),
    mountain: minusTriple(score.mountain, last?.mountain),
    whists: [
      minusTriple(score.whists[0], last?.whists?.[0]),
      minusTriple(score.whists[1], last?.whists?.[1]),
      minusTriple(score.whists[2], last?.whists?.[2]),
    ],
  };
}

function triple(values: readonly number[] | undefined): [number, number, number] {
  return [values?.[0] ?? 0, values?.[1] ?? 0, values?.[2] ?? 0];
}

function minusTriple(
  value: readonly [number, number, number],
  delta: readonly number[] | undefined,
): [number, number, number] {
  return [
    value[0] - (delta?.[0] ?? 0),
    value[1] - (delta?.[1] ?? 0),
    value[2] - (delta?.[2] ?? 0),
  ];
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

function fieldChain(
  deals: readonly PlayedDeal[],
  read: (delta: PlayedDeal["delta"]) => number,
  current: number,
): number[] {
  const totals: number[] = [];
  let value = 0;
  for (const deal of deals) {
    const next = value + read(deal.delta);
    if (next !== value) {
      totals.push(next);
      value = next;
    }
  }
  if (current !== value) {
    totals.push(current);
  }
  return totals;
}

function chainText(
  deals: readonly PlayedDeal[],
  read: (delta: PlayedDeal["delta"]) => number,
  current: number,
  closed: boolean,
): string {
  const totals = fieldChain(deals, read, current);
  if (totals.length === 0) {
    return "";
  }
  const numbers = totals.map(plain);
  if (!closed) {
    return numbers.join(".");
  }
  return `${numbers.join(". ")} >>`;
}

function fitChain(text: string, room: number): number {
  const base = 16;
  const factor = 0.72;
  if (text.length === 0 || text.length * factor * base <= room) {
    return base;
  }
  return Math.round((room / (text.length * factor)) * 10) / 10;
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
        <p className="game-declarer">
          {typeof result.declarer === "number" && result.declarer === viewer
            ? "Разыгрываете вы"
            : `Разыгрывает ${declarer}`}
        </p>
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

function wordsOnStep(
  speech: readonly TableSpeech[] | undefined,
  speechStep: number | undefined,
): ReadonlyMap<number, string> {
  const step = speechStep ?? 0;
  const words = new Map<number, string>();
  for (const item of speech ?? []) {
    if (item.step === step && item.seat !== null) {
      words.set(item.seat, item.word);
    }
  }
  return words;
}

const LOG_BOX_KEY = "pref.logBox";
const LOG_BOX_DEFAULT = { width: 240, height: 148 };

function readLogBox(): { width: number; height: number } {
  if (typeof localStorage === "undefined") {
    return LOG_BOX_DEFAULT;
  }
  const raw = localStorage.getItem(LOG_BOX_KEY);
  if (raw === null) {
    return LOG_BOX_DEFAULT;
  }
  try {
    const value = JSON.parse(raw) as { width?: unknown; height?: unknown };
    if (typeof value.width !== "number" || typeof value.height !== "number") {
      return LOG_BOX_DEFAULT;
    }
    return {
      width: clampBox(value.width, 160, 640),
      height: clampBox(value.height, 72, 520),
    };
  } catch {
    return LOG_BOX_DEFAULT;
  }
}

function clampBox(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function DealLog({
  log,
  viewer,
  names,
}: {
  log: readonly SpeechDeal[];
  viewer: number;
  names: readonly (string | null)[] | null;
}): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(readLogBox);
  const lineCount = log.reduce((sum, deal) => sum + deal.lines.length, 0);
  useEffect(() => {
    const node = scroller.current;
    if (node !== null) {
      node.scrollTop = node.scrollHeight;
    }
  }, [lineCount]);
  useEffect(() => {
    if (typeof localStorage === "undefined") {
      return;
    }
    localStorage.setItem(LOG_BOX_KEY, JSON.stringify(box));
  }, [box]);
  function startResize(
    event: React.PointerEvent<HTMLDivElement>,
    mode: "x" | "y" | "xy",
  ): void {
    event.preventDefault();
    const handle = event.currentTarget;
    const origin = {
      x: event.clientX,
      y: event.clientY,
      width: box.width,
      height: box.height,
    };
    handle.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent): void => {
      const maxWidth = Math.min(640, window.innerWidth - 24);
      const maxHeight = Math.min(520, window.innerHeight - 96);
      setBox({
        width:
          mode === "y"
            ? origin.width
            : clampBox(origin.width + ev.clientX - origin.x, 160, maxWidth),
        height:
          mode === "x"
            ? origin.height
            : clampBox(origin.height + origin.y - ev.clientY, 72, maxHeight),
      });
    };
    const end = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }
  return (
    <aside
      className="deal-log"
      aria-label="Лог"
      style={{ width: box.width, height: box.height }}
    >
      <div
        className="deal-log-resize deal-log-resize-y"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Высота лога"
        onPointerDown={(event) => startResize(event, "y")}
      />
      <div
        className="deal-log-resize deal-log-resize-x"
        role="separator"
        aria-orientation="vertical"
        aria-label="Ширина лога"
        onPointerDown={(event) => startResize(event, "x")}
      />
      <div
        className="deal-log-resize deal-log-resize-xy"
        role="separator"
        aria-label="Размер лога"
        onPointerDown={(event) => startResize(event, "xy")}
      />
      <h2>Лог</h2>
      <div className="deal-log-scroll" ref={scroller}>
        {log.map((deal) => (
          <section key={deal.deal}>
            <h3>Раздача {deal.deal}</h3>
            <ol>
              {deal.lines.map((item, index) => {
                const who =
                  item.seat === null
                    ? null
                    : playerName(item.seat, viewer, names);
                return (
                  <li key={`${deal.deal}:${item.step}:${index}`}>
                    {who === null ? null : `${who}: `}
                    <SpeechWord word={item.word} />
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </aside>
  );
}

const SUIT_WORDS = [
  ["без козыря", "noTrump"],
  ["пик", "spades"],
  ["треф", "clubs"],
  ["бубен", "diamonds"],
  ["червей", "hearts"],
] as const;

function SpeechWord({ word }: { word: string }): React.JSX.Element {
  const suit = SUIT_WORDS.find(([name]) => word.includes(name));
  if (suit === undefined) {
    return <>{word}</>;
  }
  return (
    <>
      {word}
      <span
        className={
          isRedSuit(suit[1]) ? "speech-suit speech-suit-red" : "speech-suit"
        }
      >
        {suitSymbol(suit[1])}
      </span>
    </>
  );
}

function speechEntries(state: GameSnapshot): SpeechDeal[] {
  if (state.speechLog !== undefined) {
    return state.speechLog;
  }
  const lines = state.speech ?? [];
  if (lines.length === 0) {
    return [];
  }
  return [{ deal: state.dealNumber + 1, lines }];
}

function facedTalonCaption(): string {
  return "Прикуп в лицо сдающему · 2 в гору";
}

function actionLabel(action: GameAction): string {
  if (action.type === "propose" && action.tricks !== undefined) {
    return `моих ${action.tricks}`;
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
