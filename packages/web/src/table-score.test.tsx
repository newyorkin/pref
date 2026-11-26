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
  forgetDialogSize,
  LayoutDialog,
  movedPastDeadZone,
} from "./table-layout.js";
import {
  BulletSheet,
  DealSummary,
  chainParts,
  dealHeading,
  unplayedNote,
  whistNotes,
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
 * right player and for the viewer. The highlighted part is in brackets.
 */
function entries(markup: string): string[] {
  return [...markup.matchAll(/<text[^>]*class="pulka-figure[^"]*"[^>]*>(.*?)<\/text>/g)].map(
    (match) =>
      (match[1] ?? "")
        .replace('<tspan class="pulka-fresh">', "[")
        .replace("</tspan>", "]")
        .replaceAll("&gt;", ">"),
  );
}

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
    // The chain still shrinks to fit its field, counting the highlighted number.
    const at = markup.indexOf(`${chain}.<tspan`);
    const element = markup.slice(markup.lastIndexOf("<text", at), at);
    expect(Number(element.match(/font-size="([0-9.]+)"/)?.[1])).toBeLessThan(16);
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
      setItem: () => undefined,
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

  test("a double-click on the resize corner goes back to the size by the screen", () => {
    const stored = { [BULLET_BOX_KEY]: JSON.stringify({ width: 500, height: 540 }) };
    expect(renderWithStorage(stored)).toContain('title="Двойной щелчок — размер по экрану"');
    // The corner's double-click forgets the saved size, so the next open is automatic.
    forgetDialogSize(BULLET_BOX_KEY);
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

  test("doesn't count a tap or a jitter on the resize corner as a resize", () => {
    const origin = { x: 700, y: 100 };
    expect(movedPastDeadZone(origin, { x: 700, y: 100 })).toBe(false);
    expect(movedPastDeadZone(origin, { x: 702, y: 98 })).toBe(false);
    expect(movedPastDeadZone(origin, { x: 704, y: 100 })).toBe(true);
    expect(movedPastDeadZone(origin, { x: 697, y: 104 })).toBe(true);
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
