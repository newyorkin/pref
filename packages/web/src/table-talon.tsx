import { PlayingCard } from "./table-cards.js";
import type { GameAction, GameSnapshot } from "./table-types.js";

export function Talon({
  state,
  sharedTalon,
  onAction,
}: {
  state: GameSnapshot;
  sharedTalon: boolean;
  onAction: (action: GameAction) => void;
}) {
  return (
    <>
      {" "}
      {(state.prikup ?? []).length === 0 ? null : (
        <section
          className={state.phase === "raspas" ? "prikup raspas-prikup" : "prikup"}
          aria-label="Прикуп"
        >
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
              <PlayingCard key={`${card.suit}:${card.rank}:${index}`} card={card} />
            ))}
          </div>
          <p className="trick-count">Прикуп</p>
        </section>
      ) : null}
    </>
  );
}
