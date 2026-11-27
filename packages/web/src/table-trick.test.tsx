import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { CurrentTrick, finishedTrickDisplay, LastTrickCards } from "./table-trick.js";
import { Talon } from "./table-talon.js";
import type { GameSnapshot } from "./table-types.js";

const cards = [
  { seat: 0, card: { suit: "spades", rank: 7 } },
  { seat: 1, card: { suit: "hearts", rank: 8 } },
  { seat: 2, card: { suit: "diamonds", rank: 9 } },
];
const labels = ["7 ♠", "8 ♥", "9 ♦"];

describe("raspas trick pause", () => {
  const first = { suit: "clubs", rank: 14 };
  const second = { suit: "hearts", rank: 12 };

  test.each([0, 1, 2])("retains the talon of completed trick %i", (index) => {
    const history = Array.from({ length: index }, () => ({ winner: 0, cards }));
    const previous = {
      phase: "play",
      dealNumber: 0,
      currentTrick: cards.slice(0, 2),
      trickHistory: history,
      prikup: index === 0 ? [first, { faceDown: true }] : index === 1 ? [second] : [],
    } as GameSnapshot;
    const next = {
      ...previous,
      currentTrick: [],
      trickHistory: [...history, { winner: 0, cards }],
      prikup: index === 0 ? [second] : [],
    } as GameSnapshot;
    const held = finishedTrickDisplay(previous, next);
    expect(held?.cards).toEqual(cards);
    expect(held?.prikup).toEqual(previous.prikup);
    const duringPause = renderToStaticMarkup(
      <>
        <Talon
          state={{ ...next, prikup: held!.prikup }}
          sharedTalon={false}
          onAction={() => undefined}
        />
        <CurrentTrick viewer={0} tableTrick={held!.cards} trump={null} />
      </>,
    );
    expect(duringPause.match(/trick-at-/g)).toHaveLength(3);
    if (index === 0) {
      expect(duringPause).toContain('aria-label="Т ♣"');
      expect(duringPause).toContain('aria-label="Рубашка прикупа"');
      expect(duringPause).not.toContain('aria-label="Д ♥"');
    } else if (index === 1) {
      expect(duringPause).toContain('aria-label="Д ♥"');
      expect(duringPause).not.toContain('aria-label="Т ♣"');
    } else {
      expect(duringPause).not.toContain('aria-label="Прикуп"');
    }
    // Releasing or skipping the pause renders the current server state.
    const afterPause = renderToStaticMarkup(
      <Talon state={next} sharedTalon={false} onAction={() => undefined} />,
    );
    expect(afterPause).not.toContain('aria-label="Т ♣"');
    if (index > 0) expect(afterPause).not.toContain('aria-label="Прикуп"');
    expect(next.trickHistory.at(-1)?.cards).toHaveLength(3);
  });

  test("does not retain a talon without a completed trick or across deals", () => {
    const previous = {
      dealNumber: 0,
      currentTrick: cards.slice(0, 2),
      trickHistory: [],
      prikup: [first],
    } as unknown as GameSnapshot;
    expect(finishedTrickDisplay(previous, previous)).toBeNull();
    expect(
      finishedTrickDisplay(previous, {
        ...previous,
        dealNumber: 1,
        currentTrick: [],
        trickHistory: [{ winner: 0, cards }],
      }),
    ).toBeNull();
  });
});

describe.each([0, 1, 2])("trick seen from seat %i", (viewer) => {
  test.each([0, 1, 2])(
    "keeps each card beside its owner when seat %i leads",
    (leader) => {
      const order = [...cards.slice(leader), ...cards.slice(0, leader)];
      const expected = new Map([
        [viewer, "me"],
        [(viewer + 1) % 3, "left"],
        [(viewer + 2) % 3, "right"],
      ]);
      for (const length of [1, 2, 3]) {
        const markup = renderToStaticMarkup(
          <CurrentTrick
            tableTrick={order.slice(0, length)}
            trump="hearts"
            viewer={viewer}
          />,
        );
        const rendered = [
          ...markup.matchAll(/class="([^"]*trick-at-[^"]*)" aria-label="([^"]+)"/g),
        ];
        expect(rendered).toHaveLength(length);
        for (const [, classes, label] of rendered) {
          const owner = labels.indexOf(label);
          expect(owner).not.toBe(-1);
          expect(classes.split(" ")).toContain(`trick-at-${expected.get(owner)}`);
        }
      }
    },
  );

  test("positions a face-down lead by its owner without revealing the card", () => {
    for (const owner of [0, 1, 2]) {
      const markup = renderToStaticMarkup(
        <CurrentTrick
          viewer={viewer}
          trump={null}
          tableTrick={[{ seat: owner, card: { faceDown: true } }]}
        />,
      );
      const position =
        owner === viewer ? "me" : owner === (viewer + 1) % 3 ? "left" : "right";
      expect(markup).toContain(`trick-back trick-at-${position}`);
      expect(markup).toContain('aria-label="Рубашка"');
      expect(markup).not.toContain('class="pc');
    }
  });
});

test("the raspas talon stays separate from the three played cards", () => {
  const state = {
    phase: "play",
    prikup: [{ suit: "spades", rank: 8 }, { faceDown: true }],
  } as GameSnapshot;
  const markup = renderToStaticMarkup(
    <>
      <Talon state={state} sharedTalon={false} onAction={() => undefined} />
      <CurrentTrick viewer={0} tableTrick={cards} trump={null} />
    </>,
  );
  expect(markup).toContain('class="prikup raspas-prikup-play"');
  const trick = markup.slice(markup.indexOf('class="trick trick-play"'));
  expect([...trick.matchAll(/trick-at-/g)]).toHaveLength(3);
  expect(trick).not.toContain("Рубашка прикупа");
  expect(trick).not.toContain("Задаёт масть");
});

test("opening the talon retains its existing buttons and an empty trick draws no cards", () => {
  const state = {
    phase: "raspas",
    prikup: [{ faceDown: true }, { faceDown: true }],
  } as GameSnapshot;
  const markup = renderToStaticMarkup(
    <Talon state={state} sharedTalon={false} onAction={() => undefined} />,
  );
  expect(markup).toContain('class="prikup raspas-prikup"');
  expect(markup.match(/<button/g)).toHaveLength(2);
  expect(
    renderToStaticMarkup(<CurrentTrick viewer={0} tableTrick={[]} trump={null} />),
  ).not.toContain("Текущая взятка");
});

describe("last trick by seat", () => {
  // The card each seat played, keyed by the place it takes for the viewer.
  const places = (markup: string) =>
    Object.fromEntries(
      [...markup.matchAll(/class="pc[^"]* trick-at-(\w+)"[^>]*aria-label="([^"]*)"/g)].map(
        (match) => [match[1], match[2]],
      ),
    );

  test.each([
    [0, { me: "7 ♠", left: "8 ♥", right: "9 ♦" }],
    [1, { me: "8 ♥", left: "9 ♦", right: "7 ♠" }],
    [2, { me: "9 ♦", left: "7 ♠", right: "8 ♥" }],
  ])("puts the own card at the bottom and the neighbours at the sides for seat %i", (viewer, expected) => {
    // Led by seat 2, so the order of play differs from the seat order.
    const trick = { winner: 0, cards: [cards[2]!, cards[0]!, cards[1]!] };
    const markup = renderToStaticMarkup(
      <LastTrickCards trick={trick} trump={null} viewer={viewer} />,
    );
    expect(places(markup)).toEqual(expected);
    expect(markup).not.toContain("trick-at-talon");
  });

  test.each([0, 1, 2])("puts the raspas talon card on top for seat %i", (viewer) => {
    const trick = { winner: 0, talonCard: { suit: "clubs", rank: 14 }, cards };
    const markup = renderToStaticMarkup(
      <LastTrickCards trick={trick} trump={null} viewer={viewer} />,
    );
    const placed = places(markup);
    expect(placed.talon).toBe("Т ♣, прикуп");
    expect(placed.me).toBe(labels[viewer]);
    expect(placed.left).toBe(labels[(viewer + 1) % 3]);
    expect(placed.right).toBe(labels[(viewer + 2) % 3]);
  });
});
