import type { AuctionBid, AuctionSnapshot, GameAction } from "./table-types.js";
import {
  contractOf,
  isAuctionPass,
  isMisereBid,
  isRedSuit,
  resultBid,
  suitSymbol,
} from "./table-utils.js";

export function AuctionBoard({
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

export function OrderBoard({
  auction,
  actions,
  onAction,
  waitingName,
}: {
  auction: AuctionSnapshot;
  actions: GameAction[];
  onAction: (action: GameAction) => void;
  waitingName: string | null;
}): React.JSX.Element {
  const yourTurn = actions.length > 0;
  const floor = resultBid(auction.result);

  if (waitingName !== null) {
    return (
      <section className="auction" aria-label="Заказ">
        <p className="bid-call">{`Ждём что скажет ${waitingName}`}</p>
      </section>
    );
  }

  return (
    <section className="auction" aria-label="Заказ">
      <p className="bid-call">Ваш заказ</p>
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

export function LevelRow({
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

export function MisereCell({
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
    return <span className={current ? `${quiet} bid-current` : quiet}>Мизер</span>;
  }
  return (
    <button
      type="button"
      className={
        paired ? "bid-cell bid-misere-btn bid-span-2" : "bid-cell bid-misere-btn"
      }
      onClick={() => onAction(action)}
    >
      Мизер
    </button>
  );
}

export const TRUMPS = ["spades", "clubs", "diamonds", "hearts", "noTrump"] as const;

export const BID_ROWS = [6, 7, 8, 9, 10, "misere"] as const;
