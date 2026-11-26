import { readFileSync } from "node:fs";
import {
  applyGameAction,
  createGame,
  deal,
  gameView,
  type GameAction,
  type GameState,
  type Seat,
} from "@pref/engine";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { dealJustFinished } from "./GameTable.js";
import { LayoutDialog } from "./table-layout.js";
import { DealSummary, dealHeading, unplayedNote, whistNotes } from "./table-score.js";
import type { GameSnapshot, PlayedDeal } from "./table-types.js";

const settings = {
  raspasProgression: "111",
  raspasExit: "666",
  throwTalon: false,
  bulletTarget: 10,
} as const;
const names = ["Анна", "Борис", "Вера"];
const zeros = (): [number, number, number] => [0, 0, 0];

function view(state: GameState, viewer: Seat): GameSnapshot {
  return JSON.parse(JSON.stringify(gameView(state, viewer))) as GameSnapshot;
}

function playOneDeal(): { before: GameState; after: GameState } {
  let state = createGame(settings, deal(42));
  for (let step = 0; step < 200; step++) {
    const seat = ([0, 1, 2] as const).find(
      (place) => gameView(state, place).allowedActions.length > 0,
    );
    if (seat === undefined) {
      throw new Error("no seat can act");
    }
    const action = gameView(state, seat).allowedActions[0] as GameAction;
    const result = applyGameAction(state, seat, action);
    expect(result.accepted).toBe(true);
    if (result.state.dealNumber !== state.dealNumber) {
      return { before: state, after: result.state };
    }
    state = result.state;
  }
  throw new Error("deal did not finish");
}

function played(patch: Partial<PlayedDeal>): PlayedDeal {
  return {
    number: 4,
    declarer: 1,
    contract: "6 пик",
    tricks: [2, 6, 2],
    delta: {
      bullet: zeros(),
      mountain: zeros(),
      whists: [zeros(), zeros(), zeros()],
    },
    ...patch,
  };
}

describe("end-of-deal result", () => {
  test("opens only on the first snapshot after a deal is scored", () => {
    const { before, after } = playOneDeal();
    for (const seat of [0, 1, 2] as const) {
      expect(dealJustFinished(view(before, seat), view(after, seat))).toBe(true);
      expect(dealJustFinished(view(after, seat), view(after, seat))).toBe(false);
    }
    const midDeal = playOneDeal().before;
    expect(dealJustFinished(view(midDeal, 0), view(midDeal, 0))).toBe(false);
    expect(
      dealJustFinished(view(after, 0), {
        ...view(after, 0),
        deals: [],
        lastLayout: null,
      }),
    ).toBe(false);
  });

  test("shows a played contract with tricks, bullet, mountain and whists per player", () => {
    const contract = played({
      delta: {
        bullet: [0, 2, 0],
        mountain: zeros(),
        whists: [[0, 4, 0], zeros(), [0, 4, 0]],
      },
    });
    expect(dealHeading(contract, 0, names)).toBe("Сдача 4: Борис — 6 пик");
    expect(dealHeading(contract, 1, names)).toBe("Сдача 4: вы — 6 пик");
    expect(whistNotes(contract, 0, 0, names)).toEqual(["+4 на Борис"]);
    expect(whistNotes(contract, 0, 1, names)).toEqual(["+4 на вас"]);

    const markup = renderToStaticMarkup(
      <DealSummary deal={contract} viewer={0} names={names} />,
    );
    expect(markup).toContain("Сдача 4: Борис — 6 пик");
    expect(markup).toContain(">Взятки</th>");
    expect(markup).toContain(">Пуля</th>");
    expect(markup).toContain(">Гора</th>");
    expect(markup).toContain(">Висты</th>");
    expect(markup).toContain(
      '<th scope="row">Борис</th><td>6</td><td>+2</td><td>—</td><td class="deal-summary-whists">—</td>',
    );
    expect(markup).toContain(
      '<th scope="row">вы</th><td>2</td><td>—</td><td>—</td><td class="deal-summary-whists"><span class="deal-summary-whist">+4 на Борис</span></td>',
    );
  });

  test("shows a failed misere and raspas from the engine's records", () => {
    const misere = played({
      declarer: 2,
      contract: "Мизер",
      tricks: [5, 3, 2],
      delta: { bullet: zeros(), mountain: [0, 0, 20], whists: [zeros(), zeros(), zeros()] },
    });
    const misereMarkup = renderToStaticMarkup(
      <DealSummary deal={misere} viewer={0} names={names} />,
    );
    expect(misereMarkup).toContain("Сдача 4: Вера — Мизер");
    expect(misereMarkup).toContain(
      '<th scope="row">Вера</th><td>2</td><td>—</td><td>+20</td><td class="deal-summary-whists">—</td>',
    );

    const { after } = playOneDeal();
    const raspas = view(after, 0).deals?.at(-1);
    expect(raspas?.contract).toBe("Распасы");
    const raspasMarkup = renderToStaticMarkup(
      <DealSummary deal={raspas!} viewer={0} names={names} />,
    );
    expect(raspasMarkup).toContain("Сдача 1: Распасы");
    expect(raspasMarkup).toContain(">Взятки</th>");
  });

  test("leaves out the tricks column when the deal ended without play", () => {
    const withoutThree = played({
      contract: "6 пик, без трёх",
      tricks: zeros(),
      delta: { bullet: zeros(), mountain: [0, 6, 0], whists: [zeros(), zeros(), zeros()] },
    });
    const markup = renderToStaticMarkup(
      <DealSummary deal={withoutThree} viewer={0} names={names} />,
    );
    expect(markup).toContain("Сдача 4: Борис — 6 пик, без трёх");
    expect(markup).not.toContain("Взятки");
    expect(markup).toContain('<th scope="row">Борис</th><td>—</td><td>+6</td><td class="deal-summary-whists">—</td>');
  });

  test("says why a contract ended without play", () => {
    const passed = played({
      tricks: zeros(),
      delta: { bullet: [0, 2, 0], mountain: zeros(), whists: [zeros(), zeros(), zeros()] },
    });
    expect(unplayedNote(passed)).toBe("без виста");
    expect(dealHeading(passed, 0, names)).toBe("Сдача 4: Борис — 6 пик, без виста");

    const halfWhist = played({
      tricks: zeros(),
      delta: { bullet: [0, 2, 0], mountain: zeros(), whists: [[0, 2, 0], zeros(), zeros()] },
    });
    expect(unplayedNote(halfWhist)).toBe("полвиста");
    expect(
      renderToStaticMarkup(<DealSummary deal={halfWhist} viewer={0} names={names} />),
    ).toContain("Сдача 4: Борис — 6 пик, полвиста");

    // Overflow help: the declarer writes висты on another player, which isn't a half-whist.
    const passedWithHelp = played({
      tricks: zeros(),
      delta: { bullet: [1, 1, 0], mountain: zeros(), whists: [zeros(), [10, 0, 0], zeros()] },
    });
    expect(unplayedNote(passedWithHelp)).toBe("без виста");

    expect(unplayedNote(played({ tricks: zeros(), contract: "6 пик, без трёх" }))).toBeNull();
    expect(unplayedNote(played({}))).toBeNull();
    expect(unplayedNote(played({ declarer: null, contract: "Распасы" }))).toBeNull();
    expect(unplayedNote(played({ contract: "Мизер", tricks: [0, 5, 5] }))).toBeNull();
  });

  test("lets the висты entries wrap so the table fits a narrow window", () => {
    const css = readFileSync(new URL("./table.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.deal-summary td\.deal-summary-whists \{\s*white-space: normal;/);
    const markup = renderToStaticMarkup(
      <DealSummary
        deal={played({ delta: { bullet: zeros(), mountain: zeros(), whists: [[0, 4, 0], zeros(), zeros()] } })}
        viewer={0}
        names={names}
      />,
    );
    expect(css).toMatch(/\.deal-summary-whist \{\s*display: inline-block;\s*white-space: nowrap;/);
    expect(markup).toContain(
      '<td class="deal-summary-whists"><span class="deal-summary-whist">+4 на Борис</span></td>',
    );
    const two = renderToStaticMarkup(
      <DealSummary
        deal={played({ delta: { bullet: zeros(), mountain: zeros(), whists: [[0, 4, 2], zeros(), zeros()] } })}
        viewer={1}
        names={names}
      />,
    );
    // Lines break between entries, never inside «+4 на вас».
    expect(two).toContain(
      '<span class="deal-summary-whist">+4 на вас</span><span class="deal-summary-whist">, +2 на Вера</span>',
    );
  });

  test("the result dialog shows the deal record above the layout", () => {
    const { after } = playOneDeal();
    const state = view(after, 1);
    const markup = renderToStaticMarkup(
      <LayoutDialog
        layout={state.lastLayout!}
        deal={state.deals!.at(-1)!}
        viewer={1}
        names={names}
        onClose={() => undefined}
      />,
    );
    expect(markup).toContain('aria-label="Итог сдачи"');
    expect(markup).toContain('aria-label="Запись за сдачу"');
    expect(markup).toContain("Сдача 1: Распасы");
    expect(markup.indexOf("deal-summary")).toBeLessThan(markup.indexOf("layout-board"));
    expect(markup).toContain("Прикуп");
  });
});
