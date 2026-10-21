import { describe, expect, test } from "vitest";

import type { RaspasExit, RaspasProgression } from "./settings.js";
import {
  applyRaspasOutcome,
  createMiserePlay,
  isMisereTaken,
} from "./rounds.js";

describe("misere", () => {
  test("is played without trump and is taken with zero tricks", () => {
    const play = createMiserePlay([[], [], []], 0);

    expect(play.trump).toBeNull();
    expect(isMisereTaken([0, 4, 6], 0)).toBe(true);
    expect(isMisereTaken([1, 4, 5], 0)).toBe(false);
  });
});

describe("raspas progression", () => {
  function runSequence(
    progression: RaspasProgression,
    raspasExit: RaspasExit,
  ): { multipliers: number[]; indexAfterContract: number } {
    let index = 0;
    const multipliers: number[] = [];

    for (let count = 0; count < 2; count += 1) {
      const update = applyRaspasOutcome(
        index,
        progression,
        { type: "raspas" },
        raspasExit,
      );
      multipliers.push(update.multiplier!);
      index = update.index;
    }

    const contract = applyRaspasOutcome(
      index,
      progression,
      { type: "takenContract", level: 6 },
      raspasExit,
    );
    index = contract.index;
    const indexAfterContract = index;

    const lastRaspas = applyRaspasOutcome(
      index,
      progression,
      { type: "raspas" },
      raspasExit,
    );
    multipliers.push(lastRaspas.multiplier!);

    return { multipliers, indexAfterContract };
  }

  test("uses each configured progression for the same round sequence", () => {
    expect(runSequence("111", "677").multipliers).toEqual([1, 1, 1]);
    expect(runSequence("122", "677").multipliers).toEqual([1, 2, 2]);
    expect(runSequence("123", "677").multipliers).toEqual([1, 2, 3]);
  });

  test("a six resets the index only while the exit sequence still asks for six", () => {
    const exitsOnSix = runSequence("123", "666");
    const needsSeven = runSequence("123", "677");

    expect(exitsOnSix.indexAfterContract).toBe(0);
    expect(exitsOnSix.multipliers).toEqual([1, 2, 1]);
    expect(needsSeven.indexAfterContract).toBe(2);
    expect(needsSeven.multipliers).toEqual([1, 2, 3]);
  });

  test("a taken misere resets the progression", () => {
    expect(
      applyRaspasOutcome(
        3,
        "123",
        { type: "takenMisere" },
        "666",
      ).index,
    ).toBe(0);
  });
});
