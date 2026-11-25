import { expect, test } from "vitest";
import { actingSeat, type TestTable } from "./LocalTestTable.js";

function table(turn: number | null, actions: number[]): TestTable {
  return {
    snapshots: [0, 1, 2].map((seat) => ({
      state: {
        turn,
        allowedActions: actions.includes(seat)
          ? [{ type: "proposal", answer: "agree" }]
          : [],
      },
    })),
  } as unknown as TestTable;
}

test("who acts follows the game turn rather than the selected viewpoint", () => {
  expect(actingSeat(table(2, [0, 2]))).toBe(2);
  expect(actingSeat(table(1, [1]))).toBe(1);
  expect(actingSeat(table(0, [0]))).toBe(0);
});

test("who acts handles auction, talon and proposal replies without a turn", () => {
  expect(actingSeat(table(null, [2]))).toBe(2);
  expect(actingSeat(table(null, [1, 2]))).toBe(1);
  expect(actingSeat(table(0, [2]))).toBe(2);
});

test("who acts is unavailable when no player has an action", () => {
  expect(actingSeat(table(null, []))).toBeNull();
});
