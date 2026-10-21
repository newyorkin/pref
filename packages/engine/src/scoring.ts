import type { ContractLevel } from "./settings.js";
import type { Seat } from "./auction.js";

type ScoreTriple = readonly [number, number, number];
type WhistRow = readonly [number, number, number];

export interface ScoreDelta {
  readonly bullet: ScoreTriple;
  readonly mountain: ScoreTriple;
  readonly whists: readonly [WhistRow, WhistRow, WhistRow];
}

export interface BulletScore {
  readonly bullet: ScoreTriple;
  readonly mountain: ScoreTriple;
  readonly whists: readonly [WhistRow, WhistRow, WhistRow];
  readonly last: ScoreDelta;
}

export type ScoredDeal =
  | {
      readonly type: "contract";
      readonly declarer: Seat;
      readonly level: ContractLevel;
      readonly tricks: ScoreTriple;
      readonly whistlers: readonly Seat[];
      readonly passer?: Seat;
      readonly halfWhist?: Seat;
      readonly withoutThree?: boolean;
    }
  | {
      readonly type: "misere";
      readonly declarer: Seat;
      readonly tricks: ScoreTriple;
    }
  | {
      readonly type: "raspas";
      readonly tricks: ScoreTriple;
      readonly multiplier: number;
    };

const SEATS = [0, 1, 2] as const;

const CONTRACT_PRICES = {
  6: 2,
  7: 4,
  8: 6,
  9: 8,
  10: 10,
} as const satisfies Record<ContractLevel, number>;

const REQUIRED_WHIST_TRICKS = {
  6: 4,
  7: 2,
  8: 1,
  9: 1,
  10: 0,
} as const satisfies Record<ContractLevel, number>;

type MutableScore = {
  bullet: [number, number, number];
  mountain: [number, number, number];
  whists: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
};

export function createBulletScore(): BulletScore {
  return {
    bullet: [0, 0, 0],
    mountain: [0, 0, 0],
    whists: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
    last: emptyDelta(),
  };
}

export function scoreDeal(
  score: BulletScore,
  deal: ScoredDeal,
  bulletTarget = Number.POSITIVE_INFINITY,
): BulletScore {
  const next = mutableScore(score);

  if (deal.type === "raspas") {
    const least = Math.min(...deal.tricks);
    for (const seat of SEATS) {
      next.mountain[seat] += (deal.tricks[seat] - least) * deal.multiplier;
      if (deal.tricks[seat] === 0) {
        awardBullet(next, seat, deal.multiplier, bulletTarget);
      }
    }
    return withLast(score, next);
  }

  if (deal.type === "misere") {
    const tricks = deal.tricks[deal.declarer];
    if (tricks === 0) {
      awardBullet(next, deal.declarer, 10, bulletTarget);
    } else {
      next.mountain[deal.declarer] += tricks * 10;
    }
    return withLast(score, next);
  }

  const price = contractPrice(deal.level);
  if (deal.withoutThree === true) {
    next.mountain[deal.declarer] += 3 * price;
    return withLast(score, next);
  }
  const declarerTricks = deal.tricks[deal.declarer];
  const taken =
    deal.whistlers.length === 0 || declarerTricks >= deal.level;

  if (
    deal.halfWhist !== undefined &&
    (deal.level === 6 || deal.level === 7)
  ) {
    awardBullet(next, deal.declarer, price, bulletTarget);
    const halfShare = requiredWhistTricks(deal.level) / 2;
    next.whists[deal.halfWhist][deal.declarer] += price * halfShare;
    return withLast(score, next);
  }

  if (deal.whistlers.length === 0) {
    awardBullet(next, deal.declarer, price, bulletTarget);
    return withLast(score, next);
  }

  if (taken) {
    awardBullet(next, deal.declarer, price, bulletTarget);
  } else {
    next.mountain[deal.declarer] +=
      (deal.level - declarerTricks) * price;
  }

  if (deal.whistlers.length === 1) {
    const whistler = deal.whistlers[0];
    if (whistler !== undefined) {
      const defenseTricks = SEATS.reduce(
        (sum, seat) =>
          seat === deal.declarer ? sum : sum + deal.tricks[seat],
        0,
      );
      next.whists[whistler][deal.declarer] += defenseTricks * price;
      const short = Math.max(
        0,
        requiredWhistTricks(deal.level) - defenseTricks,
      );
      if (short > 0) {
        next.mountain[whistler] += short * price;
      }
    }
  } else {
    const pooledBlank =
      (deal.level === 8 || deal.level === 9) &&
      deal.whistlers.reduce((sum, seat) => sum + deal.tricks[seat], 0) ===
        0;
    for (const whistler of deal.whistlers) {
      next.whists[whistler][deal.declarer] += deal.tricks[whistler] * price;
      const short = pooledBlank
        ? 1
        : Math.max(
            0,
            whistShare(deal.level, whistler, deal.whistlers) -
              deal.tricks[whistler],
          );
      if (short > 0) {
        next.mountain[whistler] += short * price;
      }
    }
  }

  if (!taken) {
    const undertricks = deal.level - declarerTricks;
    for (const defender of SEATS) {
      if (defender === deal.declarer) {
        continue;
      }
      next.whists[defender][deal.declarer] += undertricks * price;
    }
  }

  return withLast(score, next);
}

export function scoreOpenTalon(
  score: BulletScore,
  dealer: Seat,
  talon: readonly { readonly rank: number }[],
  bulletTarget = Number.POSITIVE_INFINITY,
): BulletScore {
  const aces = talon.filter((card) => card.rank === 14).length;
  if (aces === 0) {
    return score;
  }
  const next = mutableScore(score);
  awardBullet(next, dealer, aces, bulletTarget);
  return withLast(score, next);
}

export function scoreTalonThrow(score: BulletScore, dealer: Seat): BulletScore {
  const next = mutableScore(score);
  next.mountain[dealer] += 2;
  return withLast(score, next);
}

export function scoreSince(
  baseline: BulletScore,
  score: BulletScore,
): BulletScore {
  return {
    bullet: score.bullet,
    mountain: score.mountain,
    whists: score.whists,
    last: {
      bullet: diffTriple(score.bullet, baseline.bullet),
      mountain: diffTriple(score.mountain, baseline.mountain),
      whists: [
        diffTriple(score.whists[0], baseline.whists[0]),
        diffTriple(score.whists[1], baseline.whists[1]),
        diffTriple(score.whists[2], baseline.whists[2]),
      ],
    },
  };
}

export function contractPrice(level: ContractLevel): number {
  return CONTRACT_PRICES[level];
}

export function requiredWhistTricks(level: ContractLevel): number {
  return REQUIRED_WHIST_TRICKS[level];
}

export function isBulletComplete(
  score: BulletScore,
  bulletTarget: number,
): boolean {
  return score.bullet.every((entry) => entry >= bulletTarget);
}

export function settleBullet(
  score: BulletScore,
): [number, number, number] {
  const mountain: [number, number, number] = [...score.mountain];
  const whists: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ] = [
    [...score.whists[0]],
    [...score.whists[1]],
    [...score.whists[2]],
  ];
  let sum = mountain[0] + mountain[1] + mountain[2];
  const remainder = ((sum % 3) + 3) % 3;
  if (remainder !== 0) {
    const trimmed = seatToTrim(mountain);
    const delta = remainder === 1 ? -1 : 1;
    mountain[trimmed] += delta;
    const whistDelta = remainder === 1 ? 3 : -3;
    for (const other of SEATS) {
      if (other !== trimmed) {
        whists[other][trimmed] += whistDelta;
      }
    }
    sum += delta;
  }
  const average = sum / 3;
  const result: [number, number, number] = [0, 0, 0];
  for (const seat of SEATS) {
    result[seat] += (average - mountain[seat]) * 10;
    for (const other of SEATS) {
      if (other === seat) {
        continue;
      }
      result[seat] += whists[seat][other] - whists[other][seat];
    }
  }
  return result;
}

function whistShare(
  level: ContractLevel,
  _whistler: Seat,
  whistlers: readonly Seat[],
): number {
  const total = requiredWhistTricks(level);
  if (whistlers.length <= 1) {
    return total;
  }
  if (level === 6) {
    return 2;
  }
  if (level === 7) {
    return 1;
  }
  return 0;
}

function awardBullet(
  next: MutableScore,
  earner: Seat,
  points: number,
  bulletTarget: number,
): void {
  if (points <= 0) {
    return;
  }
  const ownRoom = Math.max(0, bulletTarget - next.bullet[earner]);
  const own = Math.min(points, ownRoom);
  next.bullet[earner] += own;
  let remaining = points - own;
  for (const seat of helperOrder(next.bullet, earner)) {
    if (remaining <= 0) {
      break;
    }
    const room = Math.max(0, bulletTarget - next.bullet[seat]);
    const taken = Math.min(remaining, room);
    if (taken <= 0) {
      continue;
    }
    next.bullet[seat] += taken;
    next.whists[earner][seat] += taken * 10;
    remaining -= taken;
  }
  if (remaining <= 0) {
    return;
  }
  if (next.mountain[earner] >= remaining) {
    next.mountain[earner] -= remaining;
    return;
  }
  next.mountain[earner] = 0;
  for (const seat of SEATS) {
    if (seat !== earner) {
      next.mountain[seat] += remaining;
    }
  }
}

function helperOrder(
  bullet: readonly [number, number, number],
  earner: Seat,
): readonly [Seat, Seat] {
  const left = ((earner + 1) % 3) as Seat;
  const right = ((earner + 2) % 3) as Seat;
  if (bullet[left] >= bullet[right]) {
    return [left, right];
  }
  return [right, left];
}

function seatToTrim(mountain: readonly [number, number, number]): Seat {
  let chosen: Seat = 0;
  for (const seat of SEATS) {
    if (mountain[seat] > mountain[chosen]) {
      chosen = seat;
    }
  }
  return chosen;
}

function withLast(before: BulletScore, next: MutableScore): BulletScore {
  return {
    bullet: next.bullet,
    mountain: next.mountain,
    whists: next.whists,
    last: {
      bullet: diffTriple(next.bullet, before.bullet),
      mountain: diffTriple(next.mountain, before.mountain),
      whists: [
        diffTriple(next.whists[0], before.whists[0]),
        diffTriple(next.whists[1], before.whists[1]),
        diffTriple(next.whists[2], before.whists[2]),
      ],
    },
  };
}

function diffTriple(
  after: readonly [number, number, number],
  before: ScoreTriple,
): [number, number, number] {
  return [after[0] - before[0], after[1] - before[1], after[2] - before[2]];
}

function emptyDelta(): ScoreDelta {
  return {
    bullet: [0, 0, 0],
    mountain: [0, 0, 0],
    whists: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
  };
}

function mutableScore(score: BulletScore): MutableScore {
  return {
    bullet: [...score.bullet],
    mountain: [...score.mountain],
    whists: [
      [...score.whists[0]],
      [...score.whists[1]],
      [...score.whists[2]],
    ],
  };
}
