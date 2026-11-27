import { dealerSeat } from "@pref/engine";
import { useEffect, useRef, useState } from "react";
import type { TableSettings } from "./App.js";
import {
  cardScaleStyle,
  pauseMilliseconds,
  useDisplayProfile,
} from "./profile.js";
import { ActionPanel } from "./table-actions.js";
import { AuctionBoard, OrderBoard } from "./table-auction.js";
import { Opponent, PlayingCard, visibleOpponent } from "./table-cards.js";
import { Hand } from "./table-hand.js";
import { BulletDialog, LayoutDialog } from "./table-layout.js";
import { RulesDialog } from "./table-rules.js";
import { SeatTriangle, downloadResults, resultsText } from "./table-score.js";
import { DealLog, SpeechWord, speechEntries, wordsOnStep } from "./table-speech.js";
import { Talon } from "./table-talon.js";
import {
  CurrentTrick,
  emptyTableClick,
  finishedTrickDisplay,
  LastTrickCards,
  shownTrick,
} from "./table-trick.js";
import type {
  Card,
  GameAction,
  GameSnapshot,
  SnapshotEnvelope,
} from "./table-types.js";
import {
  emptySeatMessage,
  facedTalonCaption,
  finalContract,
  gameTitle,
  isRecord,
  nameAtSeat,
  personName,
  playerName,
  seatLabel,
  shownBubble,
  sortHand,
} from "./table-utils.js";
import "./table.css";
import { useReconnectingSocket } from "./useReconnectingSocket.js";
export {
  LayoutDialog,
  LayoutSheet,
  cornerBoxSize,
  fitLayoutScale,
} from "./table-layout.js";
export { BulletSheet, resultsText } from "./table-score.js";
export type { GameSnapshot, SnapshotEnvelope } from "./table-types.js";

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
    const reason = typeof message.reason === "string" ? message.reason : "rejected";
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
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
  const snapshotRef = useRef<SnapshotEnvelope | null>(null);
  const inflightRef = useRef(false);
  const [occupiedSeats, setOccupiedSeats] = useState<boolean[] | null>(null);
  const [playerNames, setPlayerNames] = useState<(string | null)[] | null>(null);

  const { socket, reconnect } = useReconnectingSocket(`game:${tableId}:${seat}`, true, {
    onOpen: (ws) => ws.send(JSON.stringify({ type: "join", tableId, seat })),
    onMessage: (event) => {
      void readSocketPayload(event.data)
        .then((message) => {
          const next = nextClientState(message, snapshotRef.current, tableId);
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
    },
  });

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
      reconnect();
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

/** Whether this snapshot is the first one after a deal was scored. */
export function dealJustFinished(previous: GameSnapshot, next: GameSnapshot): boolean {
  return (
    next.lastLayout != null && (next.deals?.length ?? 0) > (previous.deals?.length ?? 0)
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
  const [rulesOpen, setRulesOpen] = useState(false);
  const [seenSnapshot, setSeenSnapshot] = useState(snapshot);
  const [heldTrick, setHeldTrick] = useState<ReturnType<typeof finishedTrickDisplay>>(null);
  const [leadCard, setLeadCard] = useState<Card | null>(null);
  if (snapshot !== seenSnapshot) {
    const completed = finishedTrickDisplay(seenSnapshot.state, snapshot.state);
    setSeenSnapshot(snapshot);
    setLeadCard(null);
    if (dealJustFinished(seenSnapshot.state, state)) {
      setLayoutOpen(true);
    }
    if (profile.trickPause === 0 || seenSnapshot.state.dealNumber !== state.dealNumber) {
      setHeldTrick(null);
    } else if (completed !== null) {
      setHeldTrick(completed);
    }
  } else if (profile.trickPause === 0 && heldTrick !== null) {
    setHeldTrick(null);
  } else if (error !== null && leadCard !== null) {
    setLeadCard(null);
  }
  function playNow(action: GameAction): void {
    if (action.type === "playCard" && action.card !== undefined && heldTrick !== null) {
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
  const layoutLocked = state.phase === "play" && state.trickHistory.length > 0;
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
    (action) => action.type === "proposal" || action.type === "cancelProposal",
  );
  const halfWhistOpen = state.allowedActions.some(
    (action) => action.type === "defense" && action.action?.type === "halfWhist",
  );
  const otherActions = state.allowedActions.filter((action) => {
    if (halfWhistOpen && action.type === "defense" && action.action?.type === "pass") {
      return false;
    }
    return (
      action.type !== "auction" &&
      action.type !== "order" &&
      action.type !== "withoutThree" &&
      action.type !== "openTalon" &&
      action.type !== "playCard" &&
      action.type !== "discard" &&
      action.type !== "throwTalon" &&
      action.type !== "propose" &&
      action.type !== "proposal" &&
      action.type !== "cancelProposal"
    );
  });
  const trump = state.trump ?? null;
  const sharedTalon =
    (state.talonCards ?? []).length > 0 && state.auction.result?.declarer !== seat;
  const lastTrick = state.trickHistory.at(-1);
  const showAuction = state.phase === "auction" || auctionActions.length > 0;
  const showOrder = state.phase === "order";
  const leftSeat = (seat + 1) % 3;
  const rightSeat = (seat + 2) % 3;
  const hand = sortHand(state.hand, profile.handOrder, profile.suitOrder);
  const tableTrick = shownTrick(heldTrick?.cards ?? null, leadCard, state.currentTrick, seat);
  const dealer = dealerSeat(state.dealNumber);
  const gap = emptySeatMessage(occupiedSeats, state.auction.turn);
  const spoken = wordsOnStep(state.speech, state.speechStep);
  const playTurn = state.phase === "play" ? state.turn : null;
  const proposalMessage = state.proposal == null ? null
    : state.proposal.proposer === seat ? "Ждём ответов"
      : state.proposal.answers[seat] === null ? "Ваш ответ" : "Ответ принят";
  const contract = finalContract(state);

  return (
    <main
      className={[
        showAuction || showOrder ? "game-screen game-screen-auction" : "game-screen",
        (state.discarded ?? []).length > 0 ? "game-has-discard" : "",
        contract?.declarer === seat ? "game-own-contract" : "",
      ]
        .filter((name) => name !== "")
        .join(" ")}
      data-card-face={profile.cardFace}
      style={cardScaleStyle(profile.cardScale)}
      onClick={(event) => {
        if (emptyTableClick(event.target as Element, heldTrick !== null)) {
          setHeldTrick(null);
        }
      }}
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
            <button type="button" onClick={() => onAction({ type: "rematch" })}>
              Сыграть ещё раз
            </button>
            <button
              type="button"
              onClick={() =>
                downloadResults(
                  resultsText(
                    [0, 1, 2].map(
                      (place) => personName(playerNames, place) ?? `место ${place + 1}`,
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

      <DealLog log={speechEntries(state)} viewer={seat} names={playerNames} />

      {gameTitle(state.auction.result, playerNames, seat, state.phase)}

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
            isTurn={playTurn === leftSeat}
            contract={contract?.declarer === leftSeat ? contract.bid : null}
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
            isTurn={playTurn === rightSeat}
            contract={contract?.declarer === rightSeat ? contract.bid : null}
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
          waitingName={
            state.auction.result?.declarer === seat ||
            typeof state.auction.result?.declarer !== "number"
              ? null
              : nameAtSeat(state.auction.result.declarer, seat, playerNames)
          }
        />
      ) : null}

      {state.phase === "raspas" ? (
        <p className="contract-banner">Откройте прикуп</p>
      ) : null}

      <div className={state.phase === "play" ? "table-play" : undefined}>
        <Talon
          state={heldTrick === null ? state : { ...state, prikup: heldTrick.prikup }}
          sharedTalon={sharedTalon}
          onAction={onAction}
        />
        <CurrentTrick tableTrick={tableTrick} trump={trump} viewer={seat} />
      </div>
      <aside className="trick-dock" aria-label="Взятки">
        <SeatTriangle
          viewer={seat}
          left={leftSeat}
          right={rightSeat}
          names={playerNames}
          tricks={state.tricksWon}
          contract={contract}
          dealer={dealer}
          turn={
            typeof state.turn === "number"
              ? state.turn
              : state.phase === "auction" && typeof state.auction.turn === "number"
                ? state.auction.turn
                : null
          }
        />
        {lastTrick === undefined ? null : (
          <details className="last-trick">
            <summary>Последняя взятка</summary>
            <LastTrickCards trick={lastTrick} trump={trump} viewer={seat} />
            <p className="trick-count">
              {lastTrick.winner === seat
                ? "Взятку взяли вы"
                : `Взятку взял ${playerName(lastTrick.winner, seat, playerNames)}`}
            </p>
          </details>
        )}
      </aside>

      {playTurn === seat ? <p className="turn-indicator" role="status">Ваш ход</p> : null}
      {proposalMessage === null ? null : <p className="proposal-status" role="status">{proposalMessage}</p>}
      <div className="hand-seat">
        <ActionPanel
          state={state}
          seat={seat}
          discardActions={discardActions}
          throwAction={throwAction}
          selected={selected}
          onAction={onAction}
          proposeActions={proposeActions}
          proposalReplies={proposalReplies}
          otherActions={otherActions}
        />
        {shownBubble(spoken.get(seat), state.phase) === undefined ? null : (
          <p className="speech-bubble">
            <SpeechWord word={shownBubble(spoken.get(seat), state.phase) ?? ""} />
          </p>
        )}
        <Hand
          state={state}
          hand={hand}
          playActions={playActions}
          discardActions={discardActions}
          selected={selected}
          setSelected={setSelected}
          playNow={playNow}
          trump={trump}
        />
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
              <PlayingCard key={`${card.suit}:${card.rank}:${index}`} card={card} />
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
        <button
          type="button"
          className="bullet-open"
          onClick={() => setRulesOpen(true)}
        >
          Договорённости
        </button>
        {state.lastLayout == null ? null : (
          <button
            type="button"
            className="bullet-open"
            disabled={layoutLocked}
            onClick={() => setLayoutOpen(true)}
          >
            Итог сдачи
          </button>
        )}
      </div>
      {bulletOpen ? (
        <div className="bullet-backdrop" onClick={() => setBulletOpen(false)}>
          <BulletDialog
            score={state.score}
            settlement={state.settlement ?? null}
            viewer={seat}
            names={playerNames}
            bulletTarget={settings.bulletTarget}
            deals={state.deals ?? []}
            onClose={() => setBulletOpen(false)}
          />
        </div>
      ) : null}
      {rulesOpen ? (
        <RulesDialog settings={settings} onClose={() => setRulesOpen(false)} />
      ) : null}
      {layoutOpen && !layoutLocked && state.lastLayout != null ? (
        <LayoutDialog
          layout={state.lastLayout}
          deal={state.deals?.at(-1) ?? null}
          viewer={seat}
          names={playerNames}
          onClose={() => setLayoutOpen(false)}
        />
      ) : null}
    </main>
  );
}
