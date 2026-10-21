export type RaspasProgression = "111" | "122" | "123" | "123123";

export type RaspasExit = "666" | "677" | "788" | "678678";

export interface TableSettings {
  readonly raspasProgression: RaspasProgression;
  readonly raspasExit: RaspasExit;
  readonly throwTalon: boolean;
  readonly bulletTarget: number;
}

export type ContractLevel = 6 | 7 | 8 | 9 | 10;

export type DealOutcome =
  | { readonly type: "raspas" }
  | { readonly type: "takenContract"; readonly level: ContractLevel }
  | { readonly type: "takenMisere" };

const RASPAS_MULTIPLIERS = {
  "111": [1, 1, 1],
  "122": [1, 2, 2],
  "123": [1, 2, 3],
  "123123": [1, 2, 3],
} as const satisfies Record<RaspasProgression, readonly number[]>;

const RASPAS_EXIT_LEVELS = {
  "666": [6, 6, 6],
  "677": [6, 7, 7],
  "788": [6, 7, 8],
  "678678": [6, 7, 8],
} as const satisfies Record<RaspasExit, readonly (6 | 7 | 8)[]>;

export function raspasMultiplier(
  progression: RaspasProgression,
  index: number,
): number {
  assertIndex(index);

  const multipliers = RASPAS_MULTIPLIERS[progression];
  const position =
    progression === "123123"
      ? index % multipliers.length
      : Math.min(index, multipliers.length - 1);
  return multipliers[position];
}

export function nextRaspasIndex(
  index: number,
  outcome: DealOutcome,
  raspasExit: RaspasExit,
): number {
  assertIndex(index);

  if (outcome.type === "raspas") {
    return index + 1;
  }

  if (outcome.type === "takenMisere") {
    return 0;
  }

  return outcome.level >= exitLevel(raspasExit, index) ? 0 : index;
}

function exitLevel(raspasExit: RaspasExit, index: number): 6 | 7 | 8 {
  const levels = RASPAS_EXIT_LEVELS[raspasExit];
  const position =
    raspasExit === "678678"
      ? index % levels.length
      : Math.min(index, levels.length - 1);
  return levels[position];
}

function assertIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError("Raspas index must be a non-negative integer");
  }
}
