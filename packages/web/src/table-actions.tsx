import type { Card, GameAction, GameSnapshot } from "./table-types.js";
import { actionLabel, sameCard } from "./table-utils.js";

export function ActionPanel({
  state,
  seat,
  discardActions,
  throwAction,
  selected,
  onAction,
  proposeActions,
  proposalReplies,
  otherActions,
}: {
  state: GameSnapshot;
  seat: number;
  discardActions: GameAction[];
  throwAction: GameAction | undefined;
  selected: Card[];
  onAction: (action: GameAction) => void;
  proposeActions: GameAction[];
  proposalReplies: GameAction[];
  otherActions: GameAction[];
}) {
  return (
    <>
      {" "}
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
            <summary>
              {state.auction.result?.declarer === seat ? "Моих" : "Отдаём"}
            </summary>
            <div className="proposal-choices">
              {proposeActions.map((action) => (
                <button
                  type="button"
                  key={action.tricks}
                  onClick={() => onAction(action)}
                >
                  {action.tricks}
                </button>
              ))}
            </div>
          </details>
        </section>
      )}
      {proposalReplies.length === 0 ? null : (
        <section className="game-actions">
          {proposalReplies.map((action) => (
            <button type="button" key={action.answer} onClick={() => onAction(action)}>
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
    </>
  );
}
