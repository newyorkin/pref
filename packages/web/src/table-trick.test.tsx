import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { CurrentTrick } from "./table-trick.js";
import { Talon } from "./table-talon.js";
import type { GameSnapshot } from "./table-types.js";

const cards = [
  { seat: 0, card: { suit: "spades", rank: 7 } },
  { seat: 1, card: { suit: "hearts", rank: 8 } },
  { seat: 2, card: { suit: "diamonds", rank: 9 } },
];
const labels = ["7 ♠", "8 ♥", "9 ♦"];

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
