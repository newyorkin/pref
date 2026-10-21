import { describe, expect, test } from "vitest";

import {
  contractPrice,
  createBulletScore,
  isBulletComplete,
  requiredWhistTricks,
  scoreDeal,
  scoreOpenTalon,
  scoreTalonThrow,
  settleBullet,
  type BulletScore,
  type ScoredDeal,
} from "./scoring.js";

describe("bullet scoring", () => {
  test("an opened talon writes one bullet per ace and a throw writes only mountain", () => {
    const opened = scoreOpenTalon(
      createBulletScore(),
      2,
      [
        { rank: 14 },
        { rank: 13 },
      ],
      10,
    );
    expect(opened.bullet).toEqual([0, 0, 1]);
    expect(opened.mountain).toEqual([0, 0, 0]);

    const untouched = createBulletScore();
    expect(
      scoreOpenTalon(untouched, 2, [{ rank: 13 }, { rank: 12 }], 10),
    ).toBe(untouched);

    const thrown = scoreTalonThrow(opened, 2);
    expect(thrown.bullet).toEqual([0, 0, 1]);
    expect(thrown.mountain).toEqual([0, 0, 2]);

    const crowded = scoreOpenTalon(
      { ...createBulletScore(), bullet: [0, 0, 9] },
      2,
      [{ rank: 14 }, { rank: 14 }],
      10,
    );
    expect(crowded.bullet).toEqual([1, 0, 10]);
    expect(crowded.whists[2][0]).toBe(10);
    expect(crowded.mountain).toEqual([0, 0, 0]);
  });

  test("uses contract prices and whist requirements for levels 6 through 10", () => {
    const levels = [6, 7, 8, 9, 10] as const;

    expect(levels.map(contractPrice)).toEqual([2, 4, 6, 8, 10]);
    expect(levels.map(requiredWhistTricks)).toEqual([4, 2, 1, 1, 0]);
  });

  test("one whistler takes every defensive whist and two whistlers keep their own", () => {
    const alone = scoreDeal(createBulletScore(), {
      type: "contract",
      declarer: 0,
      level: 6,
      tricks: [6, 1, 3],
      whistlers: [1],
      passer: 2,
    });
    expect(alone.whists[1][0]).toBe(8);
    expect(alone.whists[2][0]).toBe(0);
    expect(alone.bullet).toEqual([2, 0, 0]);

    const both = scoreDeal(createBulletScore(), {
      type: "contract",
      declarer: 0,
      level: 6,
      tricks: [6, 1, 3],
      whistlers: [1, 2],
    });
    expect(both.whists[1][0]).toBe(2);
    expect(both.whists[2][0]).toBe(6);
    expect(both.bullet).toEqual([2, 0, 0]);
  });

  test("a declarer's undertricks add consolation on top of the whists", () => {
    const alone = scoreDeal(createBulletScore(), {
      type: "contract",
      declarer: 0,
      level: 6,
      tricks: [4, 2, 4],
      whistlers: [1],
      passer: 2,
    });
    expect(alone.bullet).toEqual([0, 0, 0]);
    expect(alone.mountain[0]).toBe(4);
    expect(alone.whists[1][0]).toBe(16);
    expect(alone.whists[2][0]).toBe(4);

    const both = scoreDeal(createBulletScore(), {
      type: "contract",
      declarer: 0,
      level: 7,
      tricks: [5, 3, 2],
      whistlers: [1, 2],
    });
    expect(both.bullet).toEqual([0, 0, 0]);
    expect(both.mountain[0]).toBe(8);
    expect(both.whists[1][0]).toBe(20);
    expect(both.whists[2][0]).toBe(16);
  });

  test("a six taken with two and two writes 2 bullet and 4 whists each", () => {
    const score = scoreDeal(createBulletScore(), {
      type: "contract",
      declarer: 0,
      level: 6,
      tricks: [6, 2, 2],
      whistlers: [1, 2],
    });

    expect(score.bullet).toEqual([2, 0, 0]);
    expect(score.whists[1][0]).toBe(4);
    expect(score.whists[2][0]).toBe(4);
    expect(score.mountain).toEqual([0, 0, 0]);
    expect(score.last.bullet).toEqual([2, 0, 0]);
  });

  test("a six down one writes the mountain, the whist and the passer's consolation", () => {
    const score = scoreDeal(createBulletScore(), {
      type: "contract",
      declarer: 0,
      level: 6,
      tricks: [5, 4, 1],
      whistlers: [1],
      passer: 2,
    });

    expect(score.mountain[0]).toBe(2);
    expect(score.whists[1][0]).toBe(12);
    expect(score.whists[2][0]).toBe(2);
    expect(score.mountain[1]).toBe(0);
    expect(score.bullet).toEqual([0, 0, 0]);
  });

  test("a whistler short of the quota writes mountain and no extra whists", () => {
    const six = scoreDeal(createBulletScore(), {
      type: "contract",
      declarer: 0,
      level: 6,
      tricks: [6, 2, 1],
      whistlers: [1],
      passer: 2,
    });
    expect(six.bullet).toEqual([2, 0, 0]);
    expect(six.whists[1][0]).toBe(6);
    expect(six.whists[2][0]).toBe(0);
    expect(six.mountain).toEqual([0, 2, 0]);

    const seven = scoreDeal(createBulletScore(), {
      type: "contract",
      declarer: 0,
      level: 7,
      tricks: [9, 0, 1],
      whistlers: [1],
      passer: 2,
    });
    expect(seven.bullet).toEqual([4, 0, 0]);
    expect(seven.whists[1][0]).toBe(4);
    expect(seven.whists[2][0]).toBe(0);
    expect(seven.mountain).toEqual([0, 4, 0]);

    const eight = scoreDeal(createBulletScore(), {
      type: "contract",
      declarer: 0,
      level: 8,
      tricks: [10, 0, 0],
      whistlers: [1],
      passer: 2,
    });
    expect(eight.bullet).toEqual([6, 0, 0]);
    expect(eight.whists[1][0]).toBe(0);
    expect(eight.mountain).toEqual([0, 6, 0]);

    const nine = scoreDeal(createBulletScore(), {
      type: "contract",
      declarer: 0,
      level: 9,
      tricks: [9, 0, 1],
      whistlers: [1],
      passer: 2,
    });
    expect(nine.bullet).toEqual([8, 0, 0]);
    expect(nine.whists[1][0]).toBe(8);
    expect(nine.whists[2][0]).toBe(0);
    expect(nine.mountain).toEqual([0, 0, 0]);

    const both = scoreDeal(createBulletScore(), {
      type: "contract",
      declarer: 0,
      level: 7,
      tricks: [7, 1, 0],
      whistlers: [1, 2],
    });
    expect(both.bullet).toEqual([4, 0, 0]);
    expect(both.whists[1][0]).toBe(4);
    expect(both.whists[2][0]).toBe(0);
    expect(both.mountain).toEqual([0, 0, 4]);
  });

  test("a taken six writes its price, and one whistler is scored for both defenders", () => {
    const ownTricks = scoreDeal(createBulletScore(), {
      type: "contract",
      declarer: 0,
      level: 6,
      tricks: [8, 2, 0],
      whistlers: [1],
      passer: 2,
    });
    expect(ownTricks.bullet).toEqual([2, 0, 0]);
    expect(ownTricks.whists[1][0]).toBe(4);
    expect(ownTricks.mountain).toEqual([0, 4, 0]);

    const partnerTricks = scoreDeal(createBulletScore(), {
      type: "contract",
      declarer: 0,
      level: 6,
      tricks: [8, 0, 2],
      whistlers: [1],
      passer: 2,
    });
    expect(partnerTricks.bullet).toEqual([2, 0, 0]);
    expect(partnerTricks.whists[1][0]).toBe(4);
    expect(partnerTricks.whists[2][0]).toBe(0);
    expect(partnerTricks.mountain).toEqual([0, 4, 0]);
  });

  test("every ordered contract is scored by its price, whether it was made or not", () => {
    const cases = [
      { level: 7 as const, price: 4, quota: 2 },
      { level: 8 as const, price: 6, quota: 1 },
      { level: 9 as const, price: 8, quota: 1 },
      { level: 10 as const, price: 10, quota: 0 },
    ];

    for (const { level, price, quota } of cases) {
      const made = scoreDeal(createBulletScore(), {
        type: "contract",
        declarer: 0,
        level,
        tricks: [level, 10 - level, 0],
        whistlers: [1],
        passer: 2,
      });
      expect(made.bullet).toEqual([price, 0, 0]);
      expect(made.mountain[0]).toBe(0);
      expect(made.whists[1][0]).toBe((10 - level) * price);
      expect(made.mountain[1]).toBe(
        Math.max(0, quota - (10 - level)) * price,
      );

      const surplus = scoreDeal(createBulletScore(), {
        type: "contract",
        declarer: 0,
        level,
        tricks: [10, 0, 0],
        whistlers: [1],
        passer: 2,
      });
      expect(surplus.bullet).toEqual([price, 0, 0]);
      expect(surplus.mountain[0]).toBe(0);
      expect(surplus.whists[1][0]).toBe(0);
      expect(surplus.mountain[1]).toBe(quota * price);

      const failed = scoreDeal(createBulletScore(), {
        type: "contract",
        declarer: 0,
        level,
        tricks: [level - 2, 1, 1],
        whistlers: [1],
        passer: 2,
      });
      expect(failed.bullet).toEqual([0, 0, 0]);
      expect(failed.mountain[0]).toBe(2 * price);
      expect(failed.whists[1][0]).toBe(2 * price + 2 * price);
      expect(failed.whists[2][0]).toBe(2 * price);
      expect(failed.mountain[1]).toBe(
        Math.max(0, quota - 2) * price,
      );
    }
  });

  test("on an eight or nine two whistlers share one trick", () => {
    for (const level of [8, 9] as const) {
      const price = contractPrice(level);
      const blank = scoreDeal(createBulletScore(), {
        type: "contract",
        declarer: 0,
        level,
        tricks: [10, 0, 0],
        whistlers: [1, 2],
      });
      expect(blank.bullet).toEqual([price, 0, 0]);
      expect(blank.mountain).toEqual([0, price, price]);
      expect(blank.whists[1][0]).toBe(0);
      expect(blank.whists[2][0]).toBe(0);
    }

    const nine = scoreDeal(createBulletScore(), {
      type: "contract",
      declarer: 0,
      level: 9,
      tricks: [9, 0, 1],
      whistlers: [1, 2],
    });
    expect(nine.bullet).toEqual([8, 0, 0]);
    expect(nine.mountain).toEqual([0, 0, 0]);
    expect(nine.whists[1][0]).toBe(0);
    expect(nine.whists[2][0]).toBe(8);
  });

  test("a made misere writes 10 and a missed misere writes 10 for each trick", () => {
    const made = scoreDeal(createBulletScore(), {
      type: "misere",
      declarer: 2,
      tricks: [6, 4, 0],
    });
    expect(made.bullet).toEqual([0, 0, 10]);
    expect(made.mountain).toEqual([0, 0, 0]);
    expect(made.whists).toEqual(createBulletScore().whists);

    const missed = scoreDeal(createBulletScore(), {
      type: "misere",
      declarer: 2,
      tricks: [3, 4, 3],
    });
    expect(missed.bullet).toEqual([0, 0, 0]);
    expect(missed.mountain).toEqual([0, 0, 30]);
    expect(missed.whists).toEqual(createBulletScore().whists);
  });

  test("surplus tricks stay out of the bullet and each whistler owes two on a six", () => {
    const score = scoreDeal(createBulletScore(), {
      type: "contract",
      declarer: 0,
      level: 6,
      tricks: [9, 1, 0],
      whistlers: [1, 2],
    });

    expect(score.bullet).toEqual([2, 0, 0]);
    expect(score.whists[1][0]).toBe(2);
    expect(score.mountain[1]).toBe(2);
    expect(score.whists[2][0]).toBe(0);
    expect(score.mountain[2]).toBe(4);
    expect(score.mountain[0]).toBe(0);
  });

  test("both passes take an eight without whists or mountain", () => {
    const score = scoreDeal(createBulletScore(), {
      type: "contract",
      declarer: 0,
      level: 8,
      tricks: [0, 0, 0],
      whistlers: [],
    });

    expect(score.bullet).toEqual([6, 0, 0]);
    expect(score.mountain).toEqual([0, 0, 0]);
    expect(score.whists).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });

  test("a taken misere writes 10 bullet and a two-trick misere writes 20 mountain", () => {
    const made = scoreDeal(createBulletScore(), {
      type: "misere",
      declarer: 1,
      tricks: [4, 0, 6],
    });
    expect(made.bullet).toEqual([0, 10, 0]);
    expect(made.whists).toEqual(createBulletScore().whists);

    const failed = scoreDeal(createBulletScore(), {
      type: "misere",
      declarer: 1,
      tricks: [3, 2, 5],
    });
    expect(failed.mountain).toEqual([0, 20, 0]);
    expect(failed.whists).toEqual(createBulletScore().whists);
    expect(failed.bullet).toEqual([0, 0, 0]);
  });

  test("raspas amnesty subtracts the smallest trick count before the multiplier", () => {
    const score = scoreDeal(createBulletScore(), {
      type: "raspas",
      tricks: [3, 5, 2],
      multiplier: 1,
    });

    expect(score.mountain).toEqual([1, 3, 0]);
    expect(score.bullet).toEqual([0, 0, 0]);
  });

  test("a player with no raspas tricks writes the multiplier into bullet", () => {
    const score = scoreDeal(createBulletScore(), {
      type: "raspas",
      tricks: [0, 4, 6],
      multiplier: 2,
    });

    expect(score.bullet).toEqual([2, 0, 0]);
    expect(score.mountain).toEqual([0, 8, 12]);
  });

  test("the deal that fills the bullet spills the rest onto the mountain", () => {
    const score = scoreDeal(
      { ...createBulletScore(), bullet: [8, 0, 0] },
      {
        type: "contract",
        declarer: 0,
        level: 9,
        tricks: [9, 1, 0],
        whistlers: [],
      },
      10,
    );

    expect(score.bullet).toEqual([10, 6, 0]);
    expect(score.whists[0][1]).toBe(60);
    expect(score.mountain).toEqual([0, 0, 0]);
  });

  test("the closing seven writes two bullet and takes the spare two off the mountain", () => {
    const score = scoreDeal(
      { ...createBulletScore(), bullet: [10, 10, 8] },
      {
        type: "contract",
        declarer: 2,
        level: 7,
        tricks: [2, 1, 7],
        whistlers: [],
      },
      10,
    );

    expect(score.bullet).toEqual([10, 10, 10]);
    expect(score.mountain).toEqual([2, 2, 0]);
    expect(score.whists).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });

  test("a full bullet is written to the other player with the larger bullet", () => {
    const score = scoreDeal(
      { ...createBulletScore(), bullet: [10, 4, 6] },
      {
        type: "contract",
        declarer: 0,
        level: 6,
        tricks: [6, 2, 2],
        whistlers: [],
      },
      10,
    );

    expect(score.bullet).toEqual([10, 4, 8]);
    expect(score.whists[0][2]).toBe(20);
    expect(score.whists[0][1]).toBe(0);
  });

  test("equal bullets send the price to the player on the declarer's left", () => {
    const score = scoreDeal(
      { ...createBulletScore(), bullet: [10, 5, 5] },
      {
        type: "contract",
        declarer: 0,
        level: 6,
        tricks: [6, 0, 0],
        whistlers: [],
      },
      10,
    );

    expect(score.bullet).toEqual([10, 7, 5]);
    expect(score.whists[0][1]).toBe(20);
  });

  test("help fills the larger bullet first and the rest goes to the other player", () => {
    const score = scoreDeal(
      { ...createBulletScore(), bullet: [10, 8, 2] },
      {
        type: "contract",
        declarer: 0,
        level: 7,
        tricks: [7, 2, 1],
        whistlers: [],
      },
      10,
    );

    expect(score.bullet).toEqual([10, 10, 4]);
    expect(score.whists[0][1]).toBe(20);
    expect(score.whists[0][2]).toBe(20);
    expect(score.mountain).toEqual([0, 0, 0]);
  });

  test("help that closes the last bullet writes the spare onto that mountain", () => {
    const score = scoreDeal(
      { ...createBulletScore(), bullet: [10, 10, 8] },
      {
        type: "contract",
        declarer: 0,
        level: 7,
        tricks: [7, 1, 2],
        whistlers: [],
      },
      10,
    );

    expect(score.bullet).toEqual([10, 10, 10]);
    expect(score.mountain).toEqual([0, 2, 2]);
    expect(score.whists[0][2]).toBe(20);
    expect(score.whists[0][1]).toBe(0);
  });

  test("two whist tricks on an eight write whists and no mountain", () => {
    const score = scoreDeal(createBulletScore(), {
      type: "contract",
      declarer: 0,
      level: 8,
      tricks: [8, 2, 0],
      whistlers: [1, 2],
    });

    expect(score.bullet).toEqual([6, 0, 0]);
    expect(score.mountain).toEqual([0, 0, 0]);
    expect(score.whists[1][0]).toBe(12);
    expect(score.whists[2][0]).toBe(0);
  });

  test("half-whist on a taken six or seven writes half the obligation", () => {
    const six = scoreDeal(createBulletScore(), {
      type: "contract",
      declarer: 0,
      level: 6,
      tricks: [6, 0, 4],
      whistlers: [2],
      halfWhist: 2,
    });
    expect(six.bullet).toEqual([2, 0, 0]);
    expect(six.whists[2][0]).toBe(4);
    expect(six.mountain).toEqual([0, 0, 0]);

    const seven = scoreDeal(createBulletScore(), {
      type: "contract",
      declarer: 1,
      level: 7,
      tricks: [0, 7, 3],
      whistlers: [2],
      halfWhist: 2,
    });
    expect(seven.bullet).toEqual([0, 4, 0]);
    expect(seven.whists[2][1]).toBe(4);
    expect(seven.mountain).toEqual([0, 0, 0]);

    const unplayed = scoreDeal(createBulletScore(), {
      type: "contract",
      declarer: 0,
      level: 6,
      tricks: [0, 0, 0],
      whistlers: [],
      halfWhist: 2,
    });
    expect(unplayed.bullet).toEqual([2, 0, 0]);
    expect(unplayed.whists[2][0]).toBe(4);
    expect(unplayed.mountain).toEqual([0, 0, 0]);
  });

  test("settles mountains 0, 3 and 6 as +30, 0 and -30", () => {
    const result = settleBullet({
      ...createBulletScore(),
      mountain: [0, 3, 6],
    });

    expect(result).toEqual([30, 0, -30]);
    expect(result[0] + result[1] + result[2]).toBe(0);
  });

  test("trims one mountain point when the sum is not divisible by 3", () => {
    const result = settleBullet({
      ...createBulletScore(),
      mountain: [1, 1, 2],
    });

    expect(result).toEqual([3, 3, -6]);
    expect(result[0] + result[1] + result[2]).toBe(0);

    const added = settleBullet({
      ...createBulletScore(),
      mountain: [0, 0, 2],
    });
    expect(added).toEqual([7, 7, -14]);
    expect(added[0] + added[1] + added[2]).toBe(0);
  });

  test("finishes only when every player reaches the target", () => {
    expect(
      isBulletComplete(
        {
          ...createBulletScore(),
          bullet: [10, 10, 9],
        },
        10,
      ),
    ).toBe(false);
    expect(
      isBulletComplete(
        {
          ...createBulletScore(),
          bullet: [10, 12, 10],
        },
        10,
      ),
    ).toBe(true);
  });

  test("produces the same final ledger for a fixed multi-deal game", () => {
    const game: readonly ScoredDeal[] = [
      {
        type: "contract",
        declarer: 0,
        level: 6,
        tricks: [6, 2, 2],
        whistlers: [1],
      },
      {
        type: "contract",
        declarer: 1,
        level: 7,
        tricks: [2, 6, 2],
        whistlers: [0, 2],
      },
      {
        type: "misere",
        declarer: 2,
        tricks: [4, 6, 0],
      },
      {
        type: "misere",
        declarer: 0,
        tricks: [2, 4, 4],
      },
      {
        type: "raspas",
        tricks: [3, 4, 3],
        multiplier: 2,
      },
    ];
    const playGame = (): BulletScore =>
      game.reduce(
        (score, deal) => scoreDeal(score, deal),
        createBulletScore(),
      );
    const ledgers = [playGame(), playGame(), playGame()];

    expect(ledgers[1]).toEqual(ledgers[0]);
    expect(ledgers[2]).toEqual(ledgers[0]);
    expect(ledgers[0]).toEqual({
      bullet: [2, 0, 10],
      mountain: [20, 6, 0],
      whists: [
        [0, 12, 0],
        [8, 0, 0],
        [0, 12, 0],
      ],
      last: {
        bullet: [0, 0, 0],
        mountain: [0, 2, 0],
        whists: [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ],
      },
    });
  });
});
