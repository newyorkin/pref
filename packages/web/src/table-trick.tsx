import { PlayingCard } from "./table-cards.js";
import type { GameSnapshot } from "./table-types.js";
import { thirdCardSide } from "./table-utils.js";

export function CurrentTrick({
  tableTrick,
  trump,
}: {
  tableTrick: GameSnapshot["currentTrick"];
  trump: string | null;
}) {
  return (
    <>
      {" "}
      {tableTrick.length === 0 ? null : (
        <section
          className="trick trick-play"
          aria-label="Текущая взятка"
          data-third={tableTrick.length < 3 ? undefined : thirdCardSide(tableTrick[2])}
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
    </>
  );
}
