import { describe, expect, test } from "vitest";

import { deal } from "./deck.js";
import { discardCards, takeTalon } from "./talon.js";

describe("talon and discard", () => {
  test("declarer takes the talon and successfully discards two cards", () => {
    const dealt = deal(42);
    const withTalon = takeTalon(dealt, {
      type: "contract",
      declarer: 1,
      level: 6,
      trump: "hearts",
    });

    expect(withTalon.hands[1]).toHaveLength(12);
    expect(withTalon.talon).toHaveLength(0);

    const cards = [withTalon.hands[1][0], withTalon.hands[1][11]] as const;
    const transition = discardCards(withTalon, 1, cards);

    expect(transition.accepted).toBe(true);
    expect(transition.state.hands[1]).toHaveLength(10);
    expect(transition.state.discarded).toEqual(cards);
    expect(transition.state.phase).toBe("ready");
  });

  test("rejects a card from another hand without changing state", () => {
    const dealt = deal(42);
    const withTalon = takeTalon(dealt, {
      type: "misere",
      declarer: 0,
    });
    const ownCard = withTalon.hands[0][0];
    const foreignCard = withTalon.hands[1][0];

    const transition = discardCards(withTalon, 0, [
      ownCard,
      foreignCard,
    ]);

    expect(transition).toMatchObject({
      accepted: false,
      reason: "cardNotInHand",
    });
    expect(transition.state).toBe(withTalon);
    expect(transition.state.hands[0]).toHaveLength(12);
  });

  test("does not take the talon on raspas", () => {
    const dealt = deal(42);
    const state = takeTalon(dealt, { type: "raspas" });

    state.hands.forEach((hand) => expect(hand).toHaveLength(10));
    expect(state.talon).toEqual(dealt.talon);
    expect(state.phase).toBe("raspas");
  });
});
