import { PlayingCard } from "./table-cards.js";
import { finishedTrick } from "./profile.js";
import type { GameSnapshot } from "./table-types.js";

export function finishedTrickDisplay(previous: GameSnapshot, next: GameSnapshot) {
  if (previous.dealNumber !== next.dealNumber) return null;
  const cards = finishedTrick(previous, next);
  return cards === null ? null : { cards, prikup: previous.prikup ?? [] };
}

export type TrickPlace = "me" | "left" | "right";

export function trickPlace(seat: number, viewer: number): TrickPlace {
  const relativeSeat = (seat - viewer + 3) % 3;
  return relativeSeat === 0 ? "me" : relativeSeat === 1 ? "left" : "right";
}

export function CurrentTrick({
  tableTrick,
  trump,
  viewer,
}: {
  tableTrick: GameSnapshot["currentTrick"];
  trump: string | null;
  viewer: number;
}) {
  return (
    <>
      {" "}
      {tableTrick.length === 0 ? null : (
        <section className="trick trick-play" aria-label="Текущая взятка">
          {tableTrick.map((played) => {
            const position = trickPlace(played.seat, viewer);
            return "faceDown" in played.card ? (
              <span
                key={played.seat}
                className={`card-back trick-back trick-at-${position}`}
                aria-label="Рубашка"
              />
            ) : (
              <PlayingCard
                key={played.seat}
                card={played.card}
                trump={trump === played.card.suit}
                placeClass={`trick-at-${position}`}
              />
            );
          })}
        </section>
      )}
    </>
  );
}

export function LastTrickCards({
  trick,
  trump,
  viewer,
}: {
  trick: GameSnapshot["trickHistory"][number];
  trump: string | null;
  viewer: number;
}) {
  return (
    <div className="trick trick-last">
      {trick.talonCard === undefined ? null : (
        <PlayingCard card={trick.talonCard} talon placeClass="trick-at-talon" />
      )}
      {trick.cards.map((played) => (
        <PlayingCard
          key={played.seat}
          card={played.card}
          trump={trump === played.card.suit}
          placeClass={`trick-at-${trickPlace(played.seat, viewer)}`}
        />
      ))}
    </div>
  );
}
