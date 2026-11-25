import { PlayingCard } from "./table-cards.js";
import type { GameSnapshot } from "./table-types.js";

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
            const relativeSeat = (played.seat - viewer + 3) % 3;
            const position =
              relativeSeat === 0 ? "me" : relativeSeat === 1 ? "left" : "right";
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
