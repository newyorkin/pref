import { PlayingCard } from "./table-cards.js";
import type { Card, GameAction, GameSnapshot } from "./table-types.js";
import { playsFromCards, sameCard, toggleSelected } from "./table-utils.js";
export function Hand({
  state,
  hand,
  playActions,
  discardActions,
  selected,
  setSelected,
  playNow,
  trump,
}: {
  state: GameSnapshot;
  hand: Card[];
  playActions: GameAction[];
  discardActions: GameAction[];
  selected: Card[];
  setSelected: (cards: Card[]) => void;
  playNow: (action: GameAction) => void;
  trump: string | null;
}) {
  const playing = playsFromCards(hand, playActions);
  return (
    <section className="game-hand" aria-label="Ваши карты">
      {hand.map((card, index) => {
        const play = playActions.find((action) => sameCard(action.card, card));
        const fromTalon =
          state.phase === "discard" &&
          (state.talonCards ?? []).some((item) => sameCard(item, card));
        return (
          <PlayingCard
            key={`${card.suit}:${card.rank}:${index}`}
            card={card}
            suitBreak={index > 0 && hand[index - 1]?.suit !== card.suit}
            trump={trump === card.suit}
            talon={fromTalon}
            selected={selected.some((item) => sameCard(item, card))}
            unplayable={playing && play === undefined}
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
  );
}
