import { describe, expect, test } from "vitest";

import {
  nextRaspasIndex,
  raspasMinimumOrderLevel,
  raspasMultiplier,
} from "./settings.js";

describe("raspasMultiplier", () => {
  test("111 stays at one", () => {
    expect(raspasMultiplier("111", 0)).toBe(1);
    expect(raspasMultiplier("111", 5)).toBe(1);
  });

  test("122 is one, then two", () => {
    expect(raspasMultiplier("122", 0)).toBe(1);
    expect(raspasMultiplier("122", 1)).toBe(2);
    expect(raspasMultiplier("122", 4)).toBe(2);
  });

  test("123 is one, two, then three", () => {
    expect(raspasMultiplier("123", 0)).toBe(1);
    expect(raspasMultiplier("123", 1)).toBe(2);
    expect(raspasMultiplier("123", 2)).toBe(3);
    expect(raspasMultiplier("123", 5)).toBe(3);
  });

  test("123123 repeats one, two, three", () => {
    expect(
      [0, 1, 2, 3, 4, 5].map((index) => raspasMultiplier("123123", index)),
    ).toEqual([1, 2, 3, 1, 2, 3]);
  });
});

describe("nextRaspasIndex", () => {
  test("increments after a raspas", () => {
    expect(nextRaspasIndex(2, { type: "raspas" }, "666")).toBe(3);
  });

  test("666 exits on every six", () => {
    expect(
      nextRaspasIndex(2, { type: "takenContract", level: 6 }, "666"),
    ).toBe(0);
  });

  test("677 requires a seven after the first raspas round", () => {
    expect(
      nextRaspasIndex(0, { type: "takenContract", level: 6 }, "677"),
    ).toBe(0);
    expect(
      nextRaspasIndex(1, { type: "takenContract", level: 6 }, "677"),
    ).toBe(1);
    expect(
      nextRaspasIndex(1, { type: "takenContract", level: 7 }, "677"),
    ).toBe(0);
    expect(
      nextRaspasIndex(4, { type: "takenContract", level: 7 }, "677"),
    ).toBe(0);
  });

  test("788 rises to eight and stays there", () => {
    expect(
      nextRaspasIndex(0, { type: "takenContract", level: 6 }, "788"),
    ).toBe(0);
    expect(
      nextRaspasIndex(1, { type: "takenContract", level: 6 }, "788"),
    ).toBe(1);
    expect(
      nextRaspasIndex(1, { type: "takenContract", level: 7 }, "788"),
    ).toBe(0);
    expect(
      nextRaspasIndex(2, { type: "takenContract", level: 7 }, "788"),
    ).toBe(2);
    expect(
      nextRaspasIndex(2, { type: "takenContract", level: 8 }, "788"),
    ).toBe(0);
    expect(
      nextRaspasIndex(5, { type: "takenContract", level: 7 }, "788"),
    ).toBe(5);
    expect(
      nextRaspasIndex(5, { type: "takenContract", level: 8 }, "788"),
    ).toBe(0);
  });

  test("678678 repeats six, seven and eight", () => {
    expect(
      nextRaspasIndex(1, { type: "takenContract", level: 7 }, "678678"),
    ).toBe(0);
    expect(
      nextRaspasIndex(2, { type: "takenContract", level: 7 }, "678678"),
    ).toBe(2);
    expect(
      nextRaspasIndex(2, { type: "takenContract", level: 8 }, "678678"),
    ).toBe(0);
    expect(
      nextRaspasIndex(3, { type: "takenContract", level: 6 }, "678678"),
    ).toBe(0);
    expect(
      nextRaspasIndex(4, { type: "takenContract", level: 6 }, "678678"),
    ).toBe(4);
    expect(
      nextRaspasIndex(4, { type: "takenContract", level: 7 }, "678678"),
    ).toBe(0);
    expect(
      nextRaspasIndex(5, { type: "takenContract", level: 8 }, "678678"),
    ).toBe(0);
  });

  test("a taken misere resets the index", () => {
    expect(nextRaspasIndex(3, { type: "takenMisere" }, "788")).toBe(0);
  });
});

describe("raspas minimum order level", () => {
  test("666 has no raised minimum", () => {
    expect([0, 1, 5].map((index) => raspasMinimumOrderLevel("666", index))).toEqual([
      6, 6, 6,
    ]);
  });

  test("677 requires seven after the first raspas round", () => {
    expect([0, 1, 2, 5].map((index) => raspasMinimumOrderLevel("677", index))).toEqual([
      6, 7, 7, 7,
    ]);
  });

  test("788 means seven after the first, then eight", () => {
    expect([0, 1, 2, 5].map((index) => raspasMinimumOrderLevel("788", index))).toEqual([
      6, 7, 8, 8,
    ]);
  });

  test("678678 repeats six, seven and eight as the minimum sequence", () => {
    expect(
      [0, 1, 2, 3, 4, 5].map((index) =>
        raspasMinimumOrderLevel("678678", index),
      ),
    ).toEqual([6, 7, 8, 6, 7, 8]);
  });
});
