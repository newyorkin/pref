import { type CSSProperties } from "react";
import {
  CardFaceLayers,
  cardArtSrc,
  rankLetter,
  useDisplayProfile,
} from "./profile.js";

import { SpeechWord } from "./table-speech.js";
import type { AuctionBid, Card, GameAction, GameSnapshot } from "./table-types.js";
import {
  ContractBadge,
  cardsLabel,
  isRedSuit,
  playsFromCards,
  rankLabel,
  sameCard,
  sortHand,
  suitRows,
  suitSymbol,
} from "./table-utils.js";

export function visibleOpponent(state: GameSnapshot, place: number): readonly Card[] {
  if (state.shownHands != null) {
    return state.shownHands[place] ?? [];
  }
  return state.openSeat === place ? (state.openHand ?? []) : [];
}

export function Opponent({
  place,
  name,
  empty,
  cards,
  openCards,
  playActions,
  trump,
  onAction,
  word,
  isTurn = false,
  contract = null,
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
  isTurn?: boolean;
  contract?: AuctionBid | null;
}): React.JSX.Element {
  const profile = useDisplayProfile();
  const visible = sortHand(openCards, "asc", profile.suitOrder);
  const bySuit = profile.openLayout === "suits";
  const rows = bySuit ? suitRows(visible) : [visible];
  const playing = playsFromCards(visible, playActions);
  function openCard(card: Card, index: number): React.JSX.Element {
    const play = playActions.find((action) => sameCard(action.card, card));
    return (
      <PlayingCard
        key={`${card.suit}:${card.rank}:${index}`}
        card={card}
        trump={trump === card.suit}
        unplayable={playing && play === undefined}
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
          className={bySuit ? "opponent-cards opponent-cards-suits" : "opponent-cards"}
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
        {contract === null ? null : (
          <>
            {" "}
            <ContractBadge bid={contract} />
          </>
        )}
        {isTurn ? (
          <span className="opponent-turn" role="status">
            Ходит
          </span>
        ) : null}
      </p>
      <p className="opponent-meta">{cardsLabel(cards)}</p>
    </div>
  );
}

export function PlayingCard({
  card,
  suitBreak = false,
  trump = false,
  talon = false,
  selected = false,
  unplayable = false,
  hideCornerSuit = false,
  placeClass,
  onClick,
}: {
  card: Card;
  suitBreak?: boolean;
  trump?: boolean;
  talon?: boolean;
  selected?: boolean;
  unplayable?: boolean;
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
    unplayable ? "pc-unplayable" : "",
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
      <div className={className} aria-label={label} data-court={court} data-ace={ace}>
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
