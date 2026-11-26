import { readFileSync } from "node:fs";
import {
  applyGameAction,
  createBulletScore,
  createGame,
  deal,
  gameView,
  scoreDeal,
  scoreOpenTalon,
  scoreSince,
  scoreTalonThrow,
  settleBullet,
  type BulletScore,
  type GameAction,
  type GameState,
  type ScoredDeal,
  type Seat,
} from "@pref/engine";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { dealJustFinished } from "./GameTable.js";
import {
  BULLET_BOX_KEY,
  BulletDialog,
  centeredCornerSize,
  cornerPressAfterDrag,
  cornerPressDown,
  finishResize,
  isDoublePress,
  LayoutDialog,
  movedPastDeadZone,
  resetDialogSize,
  resizeStep,
} from "./table-layout.js";
import {
  BulletSheet,
  DealSummary,
  chainLines,
  chainParts,
  dealHeading,
  fitName,
  minPulkaSize,
  playerStanding,
  pulkaCircle,
  pulkaFields,
  pulkaLines,
  resultsText,
  standingText,
  unplayedNote,
  whistNotes,
  type PulkaField,
} from "./table-score.js";
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

/** Scores the deals one by one with the engine, as the server does. */
function scoreDeals(
  scored: readonly ScoredDeal[],
  bulletTarget = 10,
): { score: BulletScore; deals: PlayedDeal[] } {
  let score = createBulletScore();
  const deals: PlayedDeal[] = [];
  for (const [index, next] of scored.entries()) {
    score = scoreDeal(score, next, bulletTarget);
    deals.push(
      played({
        number: index + 1,
        declarer: next.type === "raspas" ? null : next.declarer,
        tricks: [...next.tricks],
        delta: JSON.parse(JSON.stringify(score.last)) as PlayedDeal["delta"],
      }),
    );
  }
  return { score, deals };
}

function sheet(
  score: BulletScore,
  deals: readonly PlayedDeal[],
  viewer = 0,
  bulletTarget = 10,
): string {
  return renderToStaticMarkup(
    <BulletSheet
      score={JSON.parse(JSON.stringify(score)) as GameSnapshot["score"]}
      settlement={null}
      viewer={viewer}
      names={names}
      bulletTarget={bulletTarget}
      deals={deals}
    />,
  );
}

/**
 * Every bullet, mountain and whist entry of the sheet in drawing order: the left player's
 * mountain, bullet, whists on the right player and on the viewer, then the same for the
 * right player and for the viewer. The highlighted part is in brackets. A chain written on
 * several lines is joined back into one string.
 */
function entries(markup: string): string[] {
  return chainLinesOf(markup).map((lines) =>
    lines
      .map((line) => line.text)
      .join("")
      .replace('<tspan class="pulka-fresh">', "[")
      .replace("</tspan>", "]")
      .replaceAll("&gt;", ">"),
  );
}

/** The lines of each chain on the sheet, with their font sizes. */
function chainLinesOf(markup: string): { text: string; size: number }[][] {
  return [...markup.matchAll(/<g class="pulka-chain">(.*?)<\/g>/g)].map((chain) =>
    [...(chain[1] ?? "").matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((line) => ({
      text: line[1] ?? "",
      size: Number(line[0].match(/font-size="([0-9.]+)"/)?.[1]),
    })),
  );
}

describe("deal points in the results file", () => {
  const quiet = [zeros(), zeros(), zeros()] as [
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];

  test("prices one mountain point at 10/3 and leaves the bullet out", () => {
    const mountain = [0, 3, 6];
    const points = [0, 1, 2].map((seat) => playerStanding(mountain, quiet, seat));
    expect(points).toEqual([90, 0, -90]);
    expect(points.map(standingText)).toEqual(["+30", "0", "−30"]);
    expect(points.map((thirds) => thirds / 3)).toEqual(
      settleBullet({ ...createBulletScore(), mountain: [0, 3, 6] }),
    );

    const rough = [0, 4, 6];
    expect([0, 1, 2].map((seat) => standingText(playerStanding(rough, quiet, seat)))).toEqual([
      "+33⅓",
      "−6⅔",
      "−26⅔",
    ]);

    const whists = [
      [0, 0, 0],
      [2, 0, 0],
      [2, 0, 0],
    ];
    expect([0, 1, 2].map((seat) => standingText(playerStanding([2, 0, 0], whists, seat)))).toEqual([
      "−17⅓",
      "+8⅔",
      "+8⅔",
    ]);

    const text = resultsText(names, [0, 0, 0], [
      {
        number: 1,
        declarer: 0,
        contract: "6 пик",
        tricks: [6, 2, 2],
        delta: { bullet: [2, 0, 0], mountain: zeros(), whists: quiet },
      },
    ]);
    expect(text).toContain("Анна 0, Борис 0, Вера 0");
  });
});

describe("results file", () => {
  test("names the whistlers and passers of each contract by place", () => {
    const deals = [
      played({
        number: 1,
        declarer: 2,
        tricks: [3, 1, 6],
        defense: { roles: ["whist", "pass", null], whistStyle: "light" },
      }),
      played({
        number: 2,
        declarer: 0,
        tricks: [6, 2, 2],
        defense: { roles: [null, "whist", "whist"], whistStyle: null },
      }),
      played({
        number: 3,
        tricks: zeros(),
        defense: { roles: ["pass", null, "pass"], whistStyle: null },
      }),
      played({
        number: 4,
        declarer: 0,
        tricks: zeros(),
        defense: { roles: [null, "pass", "halfWhist"], whistStyle: null },
      }),
      played({
        number: 5,
        declarer: 0,
        tricks: [6, 4, 0],
        defense: { roles: [null, "whistBack", "halfWhist"], whistStyle: "dark" },
      }),
      played({ number: 6, contract: "Мизер", tricks: [0, 5, 5] }),
    ];
    const lines = resultsText(names, [0, 0, 0], deals)
      .split("\n")
      .filter((line) => /^\d+\./.test(line));

    expect(lines).toEqual([
      "1. Вера — 6 пик. Анна — вист в светлую, Борис — пас. Взяток: Анна 3, Борис 1, Вера 6. Анна 0, Борис 0, Вера 0",
      "2. Анна — 6 пик. Борис — вист, Вера — вист. Взяток: Анна 6, Борис 2, Вера 2. Анна 0, Борис 0, Вера 0",
      "3. Борис — 6 пик. Вера — пас, Анна — пас. Анна 0, Борис 0, Вера 0",
      "4. Анна — 6 пик. Борис — пас, Вера — полвиста. Анна 0, Борис 0, Вера 0",
      "5. Анна — 6 пик. Борис — возврат виста в тёмную, Вера — полвиста. Взяток: Анна 6, Борис 4, Вера 0. Анна 0, Борис 0, Вера 0",
      "6. Борис — Мизер. Взяток: Анна 0, Борис 5, Вера 5. Анна 0, Борис 0, Вера 0",
    ]);
  });

  test("writes the same file whichever player downloads it", () => {
    let after = createGame(settings, deal(42));
    const wanted = (seat: Seat, action: GameAction): boolean =>
      action.type === "auction"
        ? action.action.type === (seat === 0 ? "bid" : "pass")
        : action.type === "defense"
          ? action.action.type === (seat === 1 ? "whist" : "pass") ||
            action.action.type === "light"
          : ["discard", "order", "playCard"].includes(action.type);
    for (let step = 0; step < 200 && (after.deals ?? []).length === 0; step++) {
      const move = ([0, 1, 2] as const).flatMap((seat) =>
        (gameView(after, seat).allowedActions as GameAction[])
          .filter((action) => wanted(seat, action))
          .map((action) => ({ seat, action })),
      )[0];
      if (move === undefined) {
        throw new Error("no seat can act");
      }
      const result = applyGameAction(after, move.seat, move.action);
      expect(result.accepted).toBe(true);
      after = result.state;
    }
    const files = ([0, 1, 2] as const).map((seat) => {
      const snapshot = view(after, seat);
      return resultsText(names, [0, 0, 0], snapshot.deals ?? []);
    });
    expect(after.deals?.[0]?.defense?.roles).toEqual([null, "whist", "pass"]);
    expect(files[0]).toContain("Борис — вист в светлую, Вера — пас");
    expect(files[1]).toBe(files[0]);
    expect(files[2]).toBe(files[0]);
  });
});

describe("last deal's entries on the bullet sheet", () => {
  test("highlights nothing before the first deal or when the last record is empty", () => {
    expect(sheet(createBulletScore(), [])).not.toContain("pulka-fresh");
    const { score, deals } = scoreDeals([
      { type: "contract", declarer: 1, level: 6, tricks: [2, 6, 2], whistlers: [] },
    ]);
    const quiet = { ...score, last: createBulletScore().last };
    expect(entries(sheet(quiet, deals))).toEqual(["2"]);
  });

  test("moves the highlight to each new deal's entries for every player it touched", () => {
    const steps: ScoredDeal[] = [
      // Подсад: the declarer goes into the гора, both defenders write висты.
      { type: "contract", declarer: 0, level: 6, tricks: [4, 5, 1], whistlers: [1] },
      // The lone whistler's ответственность: he is short of his 2 tricks on a семерная.
      { type: "contract", declarer: 1, level: 7, tricks: [0, 9, 1], whistlers: [2], passer: 0 },
      // Полвиста on a шестерная.
      { type: "contract", declarer: 2, level: 6, tricks: [0, 0, 0], whistlers: [], halfWhist: 1 },
      // Распасы: two players go into the гора, the one without tricks writes into the пуля.
      { type: "raspas", tricks: [0, 4, 6], multiplier: 1 },
      // A десятерная closes the viewer's пуля; the overflow helps the left player.
      { type: "contract", declarer: 0, level: 10, tricks: [10, 0, 0], whistlers: [] },
    ];
    const expected = [
      ["[16]", "[4]", "[4]"],
      ["[4]", "16", "[4]", "[4]", "4", "4"],
      ["4", "[4]", "16", "4", "[2]", "4", "4", "4"],
      ["[4]", "4", "4", "16", "4.[10]", "2", "4", "4", "4", "[1]"],
      ["4", "4.[5]", "4", "16", "4.10", "2", "4", "4", "4", "1. [10 >>]", "[10]"],
    ];
    for (const [index, wanted] of expected.entries()) {
      const { score, deals } = scoreDeals(steps.slice(0, index + 1));
      expect(entries(sheet(score, deals))).toEqual(wanted);
    }
  });

  test("highlights help written off the гора when the other пули are full", () => {
    const noWhist = (declarer: Seat, level: 6 | 10 = 6): ScoredDeal => ({
      type: "contract",
      declarer,
      level,
      tricks: [0, 0, 0],
      whistlers: [],
    });
    const steps: ScoredDeal[] = [
      { type: "misere", declarer: 0, tricks: [1, 4, 5] },
      noWhist(1),
      noWhist(1),
      noWhist(2),
      noWhist(2),
      noWhist(0),
      noWhist(0),
      // All three пули are full: the viewer's own гора goes down.
      noWhist(0),
      // More than the гора holds: it goes to 0 and the others get the overflow in their гора, as the engine scores it.
      noWhist(0, 10),
    ];
    const at = (count: number) => {
      const { score, deals } = scoreDeals(steps.slice(0, count), 4);
      return entries(sheet(score, deals, 0, 4));
    };
    expect(at(8)).toEqual(["2. 4 >>", "2. 4 >>", "10.[8]", "2. 4 >>"]);
    expect(at(9)).toEqual(["[10]", "2. 4 >>", "[10]", "2. 4 >>", "10.8.[0]", "2. 4 >>"]);
  });

  test("highlights the прикуп's entries as soon as the next deal writes them", () => {
    const { score, deals } = scoreDeals([
      { type: "contract", declarer: 1, level: 6, tricks: [0, 0, 0], whistlers: [] },
    ]);
    expect(entries(sheet(score, deals))).toEqual(["[2]"]);
    // Aces in the прикуп of the next deal go into the dealer's пуля right away.
    const aces = scoreSince(score, scoreOpenTalon(score, 2, [{ rank: 14 }, { rank: 7 }], 10));
    expect(entries(sheet(aces, deals))).toEqual(["2", "[1]"]);
    // «Прикуп в лицо» writes two into the dealer's гора.
    const thrown = scoreSince(score, scoreTalonThrow(score, 2));
    expect(entries(sheet(thrown, deals))).toEqual(["2", "[2]"]);
  });

  test("highlights the same entries from every seat's view", () => {
    const { score, deals } = scoreDeals([
      { type: "contract", declarer: 0, level: 6, tricks: [4, 5, 1], whistlers: [1] },
    ]);
    // Seat 1 sees seat 2 on the left and seat 0 on the right.
    expect(entries(sheet(score, deals, 1))).toEqual(["[4]", "[4]", "[16]"]);
    expect(entries(sheet(score, deals, 2))).toEqual(["[4]", "[16]", "[4]"]);
  });

  test("highlights only the newest number at the end of a long chain", () => {
    const steps: ScoredDeal[] = Array.from({ length: 15 }, () => ({
      type: "raspas",
      tricks: [0, 4, 6],
      multiplier: 1,
    }));
    const { score, deals } = scoreDeals(steps, 100);
    const markup = sheet(score, deals, 0, 100);
    const chain = Array.from({ length: 14 }, (_, index) => (index + 1) * 6).join(".");
    expect(entries(markup)).toContain(`${chain}.[90]`);
    // The chain goes on several lines rather than shrinking past reading, and the
    // highlighted number ends the last line.
    const lines = chainLinesOf(markup).find((chain) =>
      chain.some((line) => line.text.includes("90")),
    );
    expect(lines?.length).toBeGreaterThan(1);
    expect(lines?.every((line) => line.size >= minPulkaSize)).toBe(true);
    expect(lines?.at(-1)?.text).toMatch(/<tspan class="pulka-fresh">90<\/tspan>$/);
  });

  test("splits a chain into the earlier entries and the last deal's entry", () => {
    const steps = [{ mountain: 2 }, { mountain: 0 }, { mountain: 4 }];
    const deals = steps.map(({ mountain }) =>
      played({ delta: { bullet: zeros(), mountain: [mountain, 0, 0], whists: [zeros(), zeros(), zeros()] } }),
    );
    const read = (delta: PlayedDeal["delta"]) => delta.mountain[0];
    expect(chainParts(deals, read, 6, false, true)).toEqual({ main: "2.", fresh: "6" });
    expect(chainParts(deals, read, 6, false, false)).toEqual({ main: "2.6", fresh: "" });
    expect(chainParts([], read, 0, false, false)).toEqual({ main: "", fresh: "" });
    expect(chainParts(deals.slice(0, 1), read, 2, true, true)).toEqual({
      main: "",
      fresh: "2 >>",
    });
  });

  test("writes the highlighted entries in their own color", () => {
    const css = readFileSync(new URL("./table.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.pulka-fresh \{\s*fill: #1f5fbf;/);
  });
});

describe("bullet dialog size", () => {
  const css = readFileSync(new URL("./table.css", import.meta.url), "utf8");
  const score: GameSnapshot["score"] = {
    bullet: [0, 0, 0],
    mountain: [0, 0, 0],
    whists: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
  };

  test("fits the dialog to the room on the screen, not to a fixed size", () => {
    expect(css).toMatch(/\.bullet-dialog-backdrop \{\s*container-type: size;/);
    expect(css).toMatch(
      /\.bullet-dialog \{[^}]*width: min\(100cqw, calc\(100cqh - var\(--bullet-chrome\)\)\);/,
    );
    expect(css).toMatch(
      /\.bullet-dialog \{[^}]*height: min\(100cqh, calc\(100cqw \+ var\(--bullet-chrome\)\)\);/,
    );
    // A size the player chose never makes the dialog bigger than the screen.
    expect(css).toMatch(/\.bullet-dialog \{[^}]*max-width: 100cqw;\s*max-height: 100cqh;/);
    const dialog = css.match(/\.bullet-dialog \{[^}]*\}/)?.[0] ?? "";
    expect(dialog).not.toMatch(/40rem|44rem|dvh/);
  });

  test("lets the пуля take the room left in the dialog", () => {
    expect(css).toMatch(/\.bullet-dialog \.pulka \{\s*flex: 1 1 0;\s*width: 100%;/);
    expect(css).toMatch(/\.bullet-dialog \.bullet-result \{\s*flex: 0 0 auto;/);
  });

  test("keeps the close button and the resize corner, with no fixed size by default", () => {
    const markup = renderToStaticMarkup(
      <BulletDialog
        score={score}
        settlement={null}
        viewer={0}
        names={["Анна", "Борис", "Вера"]}
        bulletTarget={10}
        deals={[]}
        onClose={() => undefined}
      />,
    );
    expect(markup).toContain('<div class="bullet-dialog" role="dialog" aria-label="Пуля">');
    expect(markup).toContain('aria-label="Размер пули"');
    expect(markup).toContain(">Закрыть</button>");
    expect(markup).toContain('viewBox="0 0 640 640"');
  });

  function renderWithStorage(stored: Record<string, string>): string {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored[key] ?? null,
      setItem: (key: string, value: string) => {
        stored[key] = value;
      },
      removeItem: (key: string) => {
        delete stored[key];
      },
    });
    return renderToStaticMarkup(
      <BulletDialog
        score={score}
        settlement={null}
        viewer={0}
        names={["Анна", "Борис", "Вера"]}
        bulletTarget={10}
        deals={[]}
        onClose={() => undefined}
      />,
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("opens at the size the player chose last time", () => {
    expect(BULLET_BOX_KEY).toBe("pref.bulletDialogBox.v2");
    const markup = renderWithStorage({
      [BULLET_BOX_KEY]: JSON.stringify({ width: 500, height: 540 }),
    });
    expect(markup).toContain(
      '<div class="bullet-dialog" role="dialog" aria-label="Пуля" style="width:500px;height:540px">',
    );
  });

  test("ignores the size saved under the old key", () => {
    const markup = renderWithStorage({
      "pref.bulletDialogBox.v1": JSON.stringify({ width: 640, height: 704 }),
    });
    expect(markup).toContain('<div class="bullet-dialog" role="dialog" aria-label="Пуля">');
  });

  test("a double press on the resize corner goes back to the size by the screen", () => {
    const stored = { [BULLET_BOX_KEY]: JSON.stringify({ width: 500, height: 540 }) };
    expect(renderWithStorage(stored)).toContain('title="Двойное нажатие — размер по экрану"');
    // On a double press, the corner's handler sets the dialog's size to what this returns.
    expect(resetDialogSize(BULLET_BOX_KEY)).toBeNull();
    expect(stored).toEqual({});
    expect(renderWithStorage(stored)).toContain(
      '<div class="bullet-dialog" role="dialog" aria-label="Пуля">',
    );
  });

  test("puts «Закрыть» beside the пуля on a short landscape screen", () => {
    const landscape =
      css.match(/@container \(orientation: landscape\) and \(max-height: 32rem\) \{[\s\S]*?\n\}/)?.[0] ??
      "";
    expect(landscape).toMatch(/\.bullet-dialog \{[^}]*flex-direction: row-reverse;/);
    expect(landscape).toMatch(
      /\.bullet-dialog \{[^}]*height: min\(100cqh, calc\(100cqw - var\(--bullet-chrome\)\)\);/,
    );
    expect(landscape).toMatch(/\.bullet-dialog \.bullet-close \{\s*align-self: flex-start;/);
  });

  test("counts two presses within 300 ms as a double press, for a mouse or a finger", () => {
    const first = { time: 1000 };
    expect(isDoublePress(null, first)).toBe(false);
    expect(isDoublePress(first, { time: 1000 })).toBe(true);
    expect(isDoublePress(first, { time: 1200 })).toBe(true);
    expect(isDoublePress(first, { time: 1300 })).toBe(true);
    // Too slow.
    expect(isDoublePress(first, { time: 1301 })).toBe(false);
    // Out of order.
    expect(isDoublePress(first, { time: 900 })).toBe(false);
  });

  test("the second quick press only resets, and a third starts over", () => {
    const first = { time: 1000 };
    const one = cornerPressDown(null, first);
    expect(one).toEqual({ reset: false, last: first });
    const two = cornerPressDown(one.last, { time: 1150 });
    expect(two).toEqual({ reset: true, last: null });
    const third = { time: 1250 };
    expect(cornerPressDown(two.last, third)).toEqual({ reset: false, last: third });
  });

  test("a press that resized isn't the first half of a double press, a tap or a jitter is", () => {
    const limits = { minWidth: 320, maxWidth: 1000, minHeight: 260, maxHeight: 900 };
    const origin = { x: 700, y: 100, width: 600, height: 640 };
    const first = { time: 1000 };
    const next = { time: 1200 };

    // A drag that resized: the next quick press is a first press.
    const dragged = resizeStep(origin, { x: 750, y: 70 }, limits, null);
    const afterDrag = cornerPressAfterDrag(cornerPressDown(null, first).last, dragged);
    expect(afterDrag).toBeNull();
    expect(cornerPressDown(afterDrag, next).reset).toBe(false);

    // A jitter inside the dead zone: the next quick press is a second press.
    const jitter = resizeStep(origin, { x: 702, y: 99 }, limits, null);
    const afterJitter = cornerPressAfterDrag(cornerPressDown(null, first).last, jitter);
    expect(afterJitter).toEqual(first);
    expect(cornerPressDown(afterJitter, next).reset).toBe(true);
  });

  test("doesn't count a tap or a jitter on the resize corner as a resize", () => {
    const origin = { x: 700, y: 100 };
    expect(movedPastDeadZone(origin, { x: 700, y: 100 })).toBe(false);
    expect(movedPastDeadZone(origin, { x: 702, y: 98 })).toBe(false);
    expect(movedPastDeadZone(origin, { x: 704, y: 100 })).toBe(true);
    expect(movedPastDeadZone(origin, { x: 697, y: 104 })).toBe(true);
  });

  test("resizes only once the pointer leaves the dead zone, then follows it", () => {
    const limits = { minWidth: 320, maxWidth: 1000, minHeight: 260, maxHeight: 900 };
    const origin = { x: 700, y: 100, width: 600, height: 640 };
    // A jitter: no size yet.
    expect(resizeStep(origin, { x: 702, y: 99 }, limits, null)).toBeNull();
    // Out of the dead zone: the size follows the pointer.
    const first = resizeStep(origin, { x: 750, y: 70 }, limits, null);
    expect(first).toEqual({ width: 700, height: 700 });
    // Once resizing, coming back near the start still resizes.
    expect(resizeStep(origin, { x: 701, y: 100 }, limits, first)).toEqual({
      width: 602,
      height: 640,
    });
  });

  test("saves the size only when a drag on the corner resized the dialog", () => {
    const stored: Record<string, string> = {};
    renderWithStorage(stored);
    // Opening the dialog saves nothing.
    expect(stored).toEqual({});
    // A tap or a jitter ends without a size.
    finishResize(BULLET_BOX_KEY, null);
    expect(stored).toEqual({});
    finishResize(BULLET_BOX_KEY, { width: 500, height: 540 });
    expect(JSON.parse(stored[BULLET_BOX_KEY] ?? "null")).toEqual({ width: 500, height: 540 });
  });

  test("grows the centered dialog by twice the pointer's move", () => {
    const limits = { minWidth: 320, maxWidth: 1000, minHeight: 260, maxHeight: 900 };
    const origin = { x: 700, y: 100, width: 600, height: 640 };
    expect(centeredCornerSize(origin, { x: 750, y: 70 }, limits)).toEqual({
      width: 700,
      height: 700,
    });
    expect(centeredCornerSize(origin, { x: 400, y: 600 }, limits)).toEqual({
      width: 320,
      height: 260,
    });
    expect(centeredCornerSize(origin, { x: 1200, y: -500 }, limits)).toEqual({
      width: 1000,
      height: 900,
    });
  });
});

describe("names and entries on the bullet sheet", () => {
  type Box = { left: number; right: number; top: number; bottom: number };
  const box = (left: number, right: number, top: number, bottom: number): Box => ({
    left,
    right,
    top,
    bottom,
  });
  const fields = (["left", "right", "viewer"] as const).flatMap((place) =>
    Object.entries(pulkaFields[place]).map(([name, field]) => ({
      name: `${place} ${name}`,
      field: field as PulkaField,
    })),
  );
  /** The box each lane of a field can fill, in every way the field can be written. */
  const boxes = (field: PulkaField): Box[][] =>
    field.sets.map((set) =>
      set.lanes.map((lane) => {
        const along = lane.room / 2;
        const across = set.size / 2;
        return field.turn === "none"
          ? box(lane.x - along, lane.x + along, lane.y - across, lane.y + across)
          : box(lane.x - across, lane.x + across, lane.y - along, lane.y + along);
      }),
    );
  const overlap = (a: Box, b: Box) =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const crosses = (box: Box, [x1, y1, x2, y2]: readonly number[]) =>
    Array.from({ length: 2001 }, (_, step) => step / 2000).some((t) => {
      const x = (x1 ?? 0) + ((x2 ?? 0) - (x1 ?? 0)) * t;
      const y = (y1 ?? 0) + ((y2 ?? 0) - (y1 ?? 0)) * t;
      return x > box.left && x < box.right && y > box.top && y < box.bottom;
    });
  const inCircle = (box: Box) => {
    const x = Math.max(box.left, Math.min(pulkaCircle.x, box.right));
    const y = Math.max(box.top, Math.min(pulkaCircle.y, box.bottom));
    return Math.hypot(x - pulkaCircle.x, y - pulkaCircle.y) < pulkaCircle.r;
  };

  test("keeps every line of every field off the ruled lines and the circle", () => {
    for (const { name, field } of fields) {
      for (const box of boxes(field).flat()) {
        expect(box.right - box.left > 0 && box.bottom - box.top > 0, name).toBe(true);
        expect(pulkaLines.some((line) => crosses(box, line)), name).toBe(false);
        expect(inCircle(box), name).toBe(false);
      }
    }
  });

  test("gives each name, гора, пуля and вист field its own room", () => {
    for (const [index, { name, field }] of fields.entries()) {
      for (const set of boxes(field)) {
        for (const [at, box] of set.entries()) {
          expect(set.slice(at + 1).some((other) => overlap(box, other)), name).toBe(false);
        }
      }
      for (const { name: otherName, field: other } of fields.slice(index + 1)) {
        const clash = boxes(field)
          .flat()
          .some((box) => boxes(other).flat().some((otherBox) => overlap(box, otherBox)));
        expect(clash, `${name} / ${otherName}`).toBe(false);
      }
    }
  });

  test("wraps a long chain after a dot and keeps the last deal's entry at its end", () => {
    const field = pulkaFields.left.mountain;
    expect(chainLines("", field.sets)).toBeNull();
    expect(chainLines("2.4", field.sets)).toMatchObject({ lines: ["2.4"], size: 16 });
    const chain = Array.from({ length: 20 }, (_, index) => (index + 1) * 12).join(".");
    const placed = chainLines(chain, field.sets);
    expect(placed?.lines.length).toBeGreaterThan(1);
    expect(placed?.lines.join("")).toBe(chain);
    expect(placed?.lines.slice(0, -1).every((line) => line.endsWith("."))).toBe(true);
    expect(placed?.lines.at(-1)?.endsWith("240")).toBe(true);
    expect(placed?.size).toBeGreaterThanOrEqual(minPulkaSize);
    // A closed пуля keeps «>>» with its last number.
    const closed = chainLines(
      "2. 4. 6. 8. 10. 12. 14. 16. 18. 20. 22. 24 >>",
      pulkaFields.viewer.mountain.sets,
    );
    expect(closed?.lines.at(-1)?.endsWith("24 >>")).toBe(true);
    expect(closed?.lines.every((line) => line === line.trim())).toBe(true);
  });

  test("shrinks a chain past the smallest font only when no lane set holds it", () => {
    const chain = Array.from({ length: 60 }, (_, index) => (index + 1) * 100).join(".");
    const placed = chainLines(chain, pulkaFields.viewer.mountain.sets);
    expect(placed?.lines.length).toBe(4);
    expect(placed?.size).toBeLessThan(minPulkaSize);
    expect(placed?.lines.join("")).toBe(chain);
  });

  test("gives the viewer's гора a fourth line for a chain of about 60 characters", () => {
    // A гора chain of whole entries (10.17.24…), as long as it can be without passing length.
    const chain = (length: number) => {
      const entries: string[] = [];
      for (let index = 0; ; index++) {
        const next = [...entries, String(10 + index * 7)];
        if (next.join(".").length > length) {
          return entries.join(".");
        }
        entries.push(String(10 + index * 7));
      }
    };
    const sets = pulkaFields.viewer.mountain.sets;
    expect(chain(40)).toHaveLength(38);
    expect(chainLines(chain(40), sets)?.size).toBeGreaterThanOrEqual(minPulkaSize);
    // Three lines no longer hold it at a readable size, so it takes four.
    const near = chainLines(chain(55), sets);
    expect(chain(55)).toHaveLength(54);
    expect(near?.lines).toHaveLength(4);
    expect(near?.size).toBeGreaterThanOrEqual(minPulkaSize);
    // Near 60 characters the font is just under 12, not the 7.4 it was on three lines.
    expect(chain(60)).toHaveLength(58);
    const long = chainLines(chain(60), sets);
    expect(long?.lines).toHaveLength(4);
    expect(long?.lines.join("")).toBe(chain(60));
    expect(long?.size).toBeGreaterThanOrEqual(11.5);
  });

  test("shrinks a long name, then cuts it so the standing stays whole", () => {
    expect(fitName("Анна", 40, 300)).toEqual({ text: "Анна", size: 16 });
    const shrunk = fitName("Александра Константиновна", 60, 300);
    expect(shrunk.text).toBe("Александра Константиновна");
    expect(shrunk.size).toBeLessThan(16);
    expect(shrunk.size).toBeGreaterThanOrEqual(minPulkaSize);
    const cut = fitName("Евгения Мирославовна-Длинноимённая", 100, 300);
    expect(cut.size).toBe(minPulkaSize);
    expect(cut.text).toMatch(/^Евгения Миросл.*…$/);
    expect(cut.text.length * 0.64 * minPulkaSize + 100).toBeLessThanOrEqual(300);
  });

  // The case from the screenshots: long names next to long гора chains, from every seat.
  test("writes long names and long chains apart from every seat", () => {
    const longNames = [
      "Александра Константиновна",
      "Владислав Святославович",
      "Евгения Мирославовна-Длинноимённая",
    ];
    const steps: ScoredDeal[] = Array.from({ length: 14 }, (_, index) =>
      index % 3 === 2
        ? { type: "raspas", tricks: [index % 2 === 0 ? 0 : 3, 3, 4], multiplier: 3 }
        : {
            type: "contract",
            declarer: (index % 3) as Seat,
            level: 6,
            tricks: [3, 4, 3],
            whistlers: [((index + 1) % 3) as Seat, ((index + 2) % 3) as Seat],
          },
    );
    const { score, deals } = scoreDeals(steps, 60);
    for (const viewer of [0, 1, 2]) {
      const markup = renderToStaticMarkup(
        <BulletSheet
          score={JSON.parse(JSON.stringify(score)) as GameSnapshot["score"]}
          settlement={null}
          viewer={viewer}
          names={longNames}
          bulletTarget={60}
          deals={deals}
        />,
      );
      for (const chain of chainLinesOf(markup)) {
        expect(chain.every((line) => line.size >= minPulkaSize)).toBe(true);
      }
      const labels = [
        ...markup.matchAll(/<text[^>]*class="pulka-name[^"]*"[^>]*>(.*?)<\/text>/g),
      ];
      expect(labels).toHaveLength(3);
      for (const label of labels) {
        const size = Number(label[0].match(/font-size="([0-9.]+)"/)?.[1]);
        expect(size).toBeGreaterThanOrEqual(minPulkaSize);
      }
      // The longest name is cut, with the whole name in its tooltip, and its standing stays.
      const cut = labels.find((label) =>
        label[1]?.includes("<title>Евгения Мирославовна-Длинноимённая</title>"),
      );
      if (viewer !== 2) {
        expect(cut?.[1]).toMatch(/…<tspan class="pulka-(plus|minus)">/);
      }
      expect(labels.some((label) => label[1]?.startsWith("вы"))).toBe(true);
    }
  });
});
