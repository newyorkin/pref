import { randomInt } from "node:crypto";
import { createDeck, type Deal } from "@pref/engine";

// Every call uses independent cryptographic randomness; no bullet-wide seed exists.
export function secureDeal(): Deal {
  const cards = createDeck();
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return { hands: [cards.slice(0, 10), cards.slice(10, 20), cards.slice(20, 30)], talon: cards.slice(30) };
}
