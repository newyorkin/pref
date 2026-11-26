import { settleBullet, type BulletScore } from "@pref/engine";

import type { AuctionBid, GameSnapshot, PlayedDeal } from "./table-types.js";
import { ContractBadge, playerName } from "./table-utils.js";

export function SeatTriangle({
  viewer,
  left,
  right,
  names,
  tricks,
  turn,
  contract = null,
  dealer = null,
}: {
  viewer: number;
  left: number;
  right: number;
  names: readonly (string | null)[] | null;
  tricks: readonly number[];
  turn: number | null;
  contract?: { declarer: number; bid: AuctionBid } | null;
  dealer?: number | null;
}): React.JSX.Element {
  const corners = [
    { seat: left, place: "left" },
    { seat: right, place: "right" },
    { seat: viewer, place: "me" },
  ] as const;
  const target =
    turn === left ? "left" : turn === right ? "right" : turn === viewer ? "me" : null;
  const tip = {
    left: { x: 54, y: 34 },
    right: { x: 266, y: 34 },
    me: { x: 160, y: 156 },
  } as const;
  const center = { x: 160, y: 92 };
  const arrow = target === null ? null : arrowTo(center, tip[target]);
  // The tip is too narrow for the заказ beside «вы», so one's own заказ gets a line below the tip.
  const ownContract = contract?.declarer === viewer;

  return (
    <div className={ownContract ? "seat-triangle seat-triangle-own-contract" : "seat-triangle"}>
      <svg viewBox="0 0 320 188" aria-hidden={arrow === null}>
        <polygon points="160,176 22,40 298,40" className="seat-triangle-shape" />
        {arrow === null ? null : (
          <g className="seat-arrow" aria-label="Ход">
            <line
              x1={arrow.start.x}
              y1={arrow.start.y}
              x2={arrow.lineEnd.x}
              y2={arrow.lineEnd.y}
            />
            <polygon points={arrow.head} />
          </g>
        )}
      </svg>
      {corners.map((corner) => (
        <p
          key={corner.place}
          className={
            turn === corner.seat
              ? `seat-corner seat-corner-${corner.place} seat-corner-turn`
              : `seat-corner seat-corner-${corner.place}`
          }
        >
          <span>
            <span className="seat-corner-name">
              {playerName(corner.seat, viewer, names)}
            </span>
            {contract?.declarer === corner.seat && corner.place !== "me" ? (
              <>
                {" "}
                <ContractBadge bid={contract.bid} />
              </>
            ) : null}
          </span>
          <strong>{tricks[corner.seat] ?? 0}</strong>
          {ownContract && corner.place === "me" && contract !== null ? (
            <>
              {" "}
              <ContractBadge bid={contract.bid} />
            </>
          ) : null}
          {dealer === corner.seat ? (
            <span className="dealer-mark" title="Сдающий в этой сдаче">
              {corner.place === "me" ? "сдавали" : "сдавал"}
            </span>
          ) : null}
        </p>
      ))}
    </div>
  );
}

export function arrowTo(
  center: { x: number; y: number },
  target: { x: number; y: number },
): {
  start: { x: number; y: number };
  lineEnd: { x: number; y: number };
  head: string;
} {
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const start = {
    x: center.x + ux * 10,
    y: center.y + uy * 10,
  };
  const tip = {
    x: target.x - ux * 26,
    y: target.y - uy * 18,
  };
  const base = {
    x: tip.x - ux * 14,
    y: tip.y - uy * 14,
  };
  const left = {
    x: base.x + -uy * 7,
    y: base.y + ux * 7,
  };
  const right = {
    x: base.x - -uy * 7,
    y: base.y - ux * 7,
  };
  return {
    start,
    lineEnd: base,
    head: `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`,
  };
}

// The sheet's lines, in the SVG's units. The пуля is drawn for the viewer: the left and the
// right player's fields run along the sides, the viewer's fields along the bottom.
const leftEdge = 28;
const rightEdge = 612;
const topEdge = 28;
const bottomEdge = 612;
const mid = 320;
const westWhist = leftEdge + 112;
const westPool = westWhist + 68;
const eastWhist = rightEdge - 112;
const eastPool = eastWhist - 68;
const circleR = 38;
const circleY = 232;
const rise = bottomEdge - circleY;
const run = mid - leftEdge;
/** The y of the left diagonal at x. */
const along = (x: number) => circleY + ((mid - x) * rise) / run;
/** The x of the left diagonal at y. */
const diagonalX = (y: number) => mid - ((y - circleY) * run) / rise;
const mountainBase = along(westPool);
const poolBase = along(westWhist);
const whistSplit = (topEdge + bottomEdge) / 2;
/** The space kept between a line of text and the lines of its field. */
const margin = 8;

/** Where one line of text goes: its center and how long it can be. */
export type PulkaLane = { x: number; y: number; room: number };
/** One way to write a field: a line per lane, in reading order, in a font no bigger than size. */
export type PulkaLaneSet = { lanes: readonly PulkaLane[]; size: number };
/**
 * A field of the sheet and the ways to write it, from one line to several. The left
 * player's text is turned to read from the left side, the right player's from the right.
 */
export type PulkaField = { turn: "left" | "right" | "none"; sets: readonly PulkaLaneSet[] };

/** A line down the left side at column x, from top to the lowest point its band can reach. */
function columnLane(
  x: number,
  size: number,
  top: number,
  floor: (right: number) => number,
): PulkaLane {
  const bottom = floor(x + size / 2);
  return { x, y: (top + bottom) / 2, room: bottom - top - 2 * margin };
}

/** A line across the bottom at row y, between the sides its band reaches at its top. */
function rowLane(
  y: number,
  size: number,
  sides: (top: number) => { left: number; right: number },
): PulkaLane {
  const { left, right } = sides(y - size / 2);
  return { x: (left + right) / 2, y, room: right - left - 2 * margin };
}

function columnField(
  columns: readonly (readonly number[])[],
  sizes: readonly number[],
  top: number,
  floor: (right: number) => number,
): PulkaField {
  return {
    turn: "left",
    sets: columns.map((xs, index) => {
      const size = sizes[index] ?? 16;
      return { size, lanes: xs.map((x) => columnLane(x, size, top, floor)) };
    }),
  };
}

function rowField(
  rows: readonly (readonly number[])[],
  sizes: readonly number[],
  sides: (top: number) => { left: number; right: number },
): PulkaField {
  return {
    turn: "none",
    sets: rows.map((ys, index) => {
      const size = sizes[index] ?? 16;
      return { size, lanes: ys.map((y) => rowLane(y, size, sides)) };
    }),
  };
}

/** The right player's field: the left player's, mirrored. */
function mirrored(field: PulkaField): PulkaField {
  return {
    turn: "right",
    sets: field.sets.map((set) => ({
      size: set.size,
      lanes: set.lanes.map((lane) => ({ ...lane, x: mid * 2 - lane.x })),
    })),
  };
}

/** The highest y the circle leaves free in a band left of the middle line ending at right. */
const aboveCircle = (right: number): number => {
  const dx = mid - right;
  return dx >= circleR ? Infinity : circleY - Math.sqrt(circleR ** 2 - dx ** 2);
};
const mountainFloor = (right: number) => Math.min(along(right), aboveCircle(right));
const between = (top: number) => ({ left: diagonalX(top), right: mid * 2 - diagonalX(top) });
const westOfMiddle = (top: number) => ({ left: diagonalX(top), right: mid });
const eastOfMiddle = (top: number) => ({ left: mid, right: mid * 2 - diagonalX(top) });

const nameSize = 16;
// Each player's name and standing go in a lane of the гора nearest to the player, so they
// never share a line with the гора's entries. The left player's text reads from the left,
// so its first line is the one nearest the middle.
const sideName = columnField([[226]], [nameSize], topEdge, mountainFloor);
const sideMountain = columnField(
  [[262], [284, 258], [298, 274, 250]],
  [16, 16, 15],
  topEdge,
  mountainFloor,
);
const sideBullet = columnField(
  [[174], [185, 163], [192, 174, 156]],
  [16, 15, 13],
  topEdge,
  along,
);
const whistColumns = [[84], [96, 72], [106, 84, 62]];
const sideWhistUpper = columnField(whistColumns, [16, 16, 15], topEdge, () => whistSplit);
const sideWhistLower = columnField(whistColumns, [16, 16, 15], whistSplit, (right) =>
  Math.min(bottomEdge, along(right)),
);

/** Every field of the sheet, for the left player, the right player and the viewer. */
export const pulkaFields = {
  left: {
    name: sideName,
    mountain: sideMountain,
    bullet: sideBullet,
    whistUpper: sideWhistUpper,
    whistLower: sideWhistLower,
  },
  right: {
    name: mirrored(sideName),
    mountain: mirrored(sideMountain),
    bullet: mirrored(sideBullet),
    whistUpper: mirrored(sideWhistUpper),
    whistLower: mirrored(sideWhistLower),
  },
  viewer: {
    name: rowField([[366]], [nameSize], between),
    mountain: rowField([[342], [326, 344], [306, 322, 338]], [16, 14, 12], between),
    bullet: rowField([[422], [410, 434], [400, 422, 444]], [16, 16, 15], between),
    whistWest: rowField([[552], [536, 560], [524, 548, 572]], [16, 16, 15], westOfMiddle),
    whistEast: rowField([[552], [536, 560], [524, 548, 572]], [16, 16, 15], eastOfMiddle),
  },
} as const;

/** The sheet's ruled lines, for drawing and for checking that no text crosses them. */
export const pulkaLines: readonly (readonly [number, number, number, number])[] = [
  [leftEdge, topEdge, rightEdge, topEdge],
  [rightEdge, topEdge, rightEdge, bottomEdge],
  [rightEdge, bottomEdge, leftEdge, bottomEdge],
  [leftEdge, bottomEdge, leftEdge, topEdge],
  [westWhist, topEdge, westWhist, poolBase],
  [westPool, topEdge, westPool, mountainBase],
  [eastPool, topEdge, eastPool, mountainBase],
  [eastWhist, topEdge, eastWhist, poolBase],
  [mid, topEdge, mid, circleY - circleR],
  [mid, poolBase, mid, bottomEdge],
  [leftEdge, whistSplit, westWhist, whistSplit],
  [eastWhist, whistSplit, rightEdge, whistSplit],
  [westPool, mountainBase, eastPool, mountainBase],
  [westWhist, poolBase, eastWhist, poolBase],
  [mid, circleY, leftEdge, bottomEdge],
  [mid, circleY, rightEdge, bottomEdge],
];

/** The circle in the middle with the length of the пуля. */
export const pulkaCircle = { x: mid, y: circleY, r: circleR } as const;

export function BulletSheet({
  score,
  settlement,
  viewer,
  names,
  bulletTarget,
  deals = [],
}: {
  score: GameSnapshot["score"];
  settlement: [number, number, number] | null;
  viewer: number;
  names: readonly (string | null)[] | null;
  bulletTarget: number;
  deals?: readonly PlayedDeal[];
}): React.JSX.Element {
  const played = toBulletScore(score);
  const earlier = scoreBeforeLast(played, score.last);
  const now = settleBullet(played);
  const then = settleBullet(earlier);

  const left = (viewer + 1) % 3;
  const right = (viewer + 2) % 3;
  // The last deal's entries are written in another color, so they stand out from the
  // earlier ones. score.last is what the last scored deal (or the current deal's прикуп)
  // changed, the same record the «(+N)» beside each name uses.
  const mountain = (seat: number) =>
    chainParts(
      deals,
      (delta) => delta.mountain[seat] ?? 0,
      score.mountain[seat] ?? 0,
      false,
      (score.last?.mountain[seat] ?? 0) !== 0,
    );
  const bullet = (seat: number) =>
    chainParts(
      deals,
      (delta) => delta.bullet[seat] ?? 0,
      score.bullet[seat] ?? 0,
      (score.bullet[seat] ?? 0) >= bulletTarget,
      (score.last?.bullet[seat] ?? 0) !== 0,
    );
  const whist = (from: number, to: number) =>
    chainParts(
      deals,
      (delta) => delta.whists[from]?.[to] ?? 0,
      score.whists[from]?.[to] ?? 0,
      false,
      (score.last?.whists[from]?.[to] ?? 0) !== 0,
    );
  const label = (seat: number) => ({
    name: playerName(seat, viewer, names),
    ...standingParts(now[seat] ?? 0, (now[seat] ?? 0) - (then[seat] ?? 0)),
  });
  const fields = pulkaFields;

  return (
    <article className="bullet-paper">
      <svg className="pulka" viewBox="0 0 640 640" role="img" aria-label="Пуля">
        <defs>
          <pattern
            id="pulka-cell"
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
            x={leftEdge}
            y={topEdge}
          >
            <path d="M 16 0 H 0 V 16" className="pulka-cell" />
          </pattern>
          <pattern
            id="pulka-block"
            width="80"
            height="80"
            patternUnits="userSpaceOnUse"
            x={leftEdge}
            y={topEdge}
          >
            <path d="M 80 0 H 0 V 80" className="pulka-block" />
          </pattern>
        </defs>
        <rect
          x={leftEdge}
          y={topEdge}
          width={rightEdge - leftEdge}
          height={bottomEdge - topEdge}
          className="pulka-paper"
        />
        <rect
          x={leftEdge}
          y={topEdge}
          width={rightEdge - leftEdge}
          height={bottomEdge - topEdge}
          fill="url(#pulka-cell)"
        />
        <rect
          x={leftEdge}
          y={topEdge}
          width={rightEdge - leftEdge}
          height={bottomEdge - topEdge}
          fill="url(#pulka-block)"
        />
        <g className="pulka-ink">
          {pulkaLines.map(([x1, y1, x2, y2]) => (
            <line key={`${x1},${y1},${x2},${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
        </g>
        <circle cx={mid} cy={circleY} r={circleR} className="pulka-seal" />
        <text x={mid} y={circleY} className="pulka-pact pulka-center">
          до {bulletTarget}
        </text>
        <PulkaName field={fields.left.name} {...label(left)} />
        <PulkaChain field={fields.left.mountain} {...mountain(left)} />
        <PulkaChain field={fields.left.bullet} {...bullet(left)} />
        <PulkaChain field={fields.left.whistUpper} {...whist(left, right)} />
        <PulkaChain field={fields.left.whistLower} {...whist(left, viewer)} />
        <PulkaName field={fields.right.name} {...label(right)} />
        <PulkaChain field={fields.right.mountain} {...mountain(right)} />
        <PulkaChain field={fields.right.bullet} {...bullet(right)} />
        <PulkaChain field={fields.right.whistUpper} {...whist(right, left)} />
        <PulkaChain field={fields.right.whistLower} {...whist(right, viewer)} />
        <PulkaName field={fields.viewer.name} {...label(viewer)} />
        <PulkaChain field={fields.viewer.mountain} {...mountain(viewer)} />
        <PulkaChain field={fields.viewer.bullet} {...bullet(viewer)} />
        <PulkaChain field={fields.viewer.whistWest} {...whist(viewer, left)} />
        <PulkaChain field={fields.viewer.whistEast} {...whist(viewer, right)} />
      </svg>
      {settlement === null ? null : (
        <p className="bullet-result">
          Итог:{" "}
          {[0, 1, 2]
            .map(
              (place) =>
                `${playerName(place, viewer, names)} ${signed(settlement[place] ?? 0)}`,
            )
            .join(", ")}
        </p>
      )}
    </article>
  );
}

function laneTransform(turn: PulkaField["turn"], lane: PulkaLane): string | undefined {
  return turn === "left"
    ? `rotate(90 ${lane.x} ${lane.y})`
    : turn === "right"
      ? `rotate(-90 ${lane.x} ${lane.y})`
      : undefined;
}

/** A player's name with the standing after it, in the first lane of the name field. */
export function PulkaName({
  field,
  name,
  tone,
  note,
}: {
  field: PulkaField;
  name: string;
  tone: number | null;
  note: string | null;
}): React.JSX.Element | null {
  const lane = field.sets[0]?.lanes[0];
  if (lane === undefined) {
    return null;
  }
  const toneText = tone === null ? "" : ` ${signed(tone)}`;
  const noteText = note === null ? "" : ` ${note}`;
  const fitted = fitName(
    name,
    labelWidth(toneText, toneSize) + labelWidth(noteText, noteSize),
    lane.room,
    field.sets[0]?.size ?? nameSize,
  );
  return (
    <text
      x={lane.x}
      y={lane.y}
      className="pulka-name pulka-center"
      fontSize={fitted.size}
      transform={laneTransform(field.turn, lane)}
    >
      {fitted.text === name ? null : <title>{name}</title>}
      {fitted.text}
      {tone === null ? null : (
        <tspan className={tone > 0 ? "pulka-plus" : "pulka-minus"}>{toneText}</tspan>
      )}
      {note === null ? null : <tspan className="pulka-quiet">{noteText}</tspan>}
    </text>
  );
}

/** A chain of entries, on as many lines of its field as it needs to stay readable. */
export function PulkaChain({
  field,
  main,
  fresh,
}: {
  field: PulkaField;
  main: string;
  fresh: string;
}): React.JSX.Element | null {
  const placed = chainLines(main + fresh, field.sets);
  if (placed === null) {
    return null;
  }
  return (
    <g className="pulka-chain">
      {placed.lines.map((line, index) => {
        const lane = placed.lanes[index] as PulkaLane;
        // The last deal's entry is the chain's last token, so it ends the last line.
        const own =
          index === placed.lines.length - 1 && fresh !== ""
            ? line.slice(0, line.length - fresh.length)
            : line;
        return (
          <text
            key={index}
            x={lane.x}
            y={lane.y}
            className="pulka-figure pulka-center"
            fontSize={placed.size}
            transform={laneTransform(field.turn, lane)}
          >
            {own}
            {own === line ? null : <tspan className="pulka-fresh">{fresh}</tspan>}
          </text>
        );
      })}
    </g>
  );
}

// Rough widths of the sheet's bold serif glyphs, in ems. They err on the wide side, so a
// line that fits by them fits on the screen.
const figureWidth = 0.72;
const letterWidth = 0.64;
const toneSize = 15;
const noteSize = 12;
/** The smallest font a name shrinks to before it is cut. */
export const minPulkaSize = 12;
/** The smallest font a chain shrinks to before it goes on more lines. */
export const wrapPulkaSize = 14;

function labelWidth(text: string, size: number): number {
  return text.length * letterWidth * size;
}

/**
 * The name to write before the standing, and its font: the full name if it fits in a font
 * no smaller than minPulkaSize, else the name cut short with «…» so the standing stays whole.
 */
export function fitName(
  name: string,
  suffixWidth: number,
  room: number,
  size = nameSize,
): { text: string; size: number } {
  const free = room - suffixWidth;
  const fits = Math.floor((free / (name.length * letterWidth)) * 10) / 10;
  if (fits >= minPulkaSize) {
    return { text: name, size: Math.min(size, fits) };
  }
  const chars = Math.floor(free / (letterWidth * minPulkaSize)) - 1;
  return { text: `${name.slice(0, Math.max(1, chars)).trimEnd()}…`, size: minPulkaSize };
}

/**
 * Splits a chain into lines over the lanes of the first lane set that fits it in a font no
 * smaller than wrapPulkaSize, so a chain wraps before it gets hard to read. Lines break
 * after a dot. If no set fits, the chain takes the set where its font comes out biggest.
 * Null for an empty chain.
 */
export function chainLines(
  text: string,
  sets: readonly PulkaLaneSet[],
): { lines: string[]; lanes: readonly PulkaLane[]; size: number } | null {
  if (text === "") {
    return null;
  }
  const tokens = text.match(/[^.]*\.\s*|[^.]+$/g) ?? [text];
  let best: { lines: string[]; lanes: readonly PulkaLane[]; size: number } | null = null;
  for (const set of sets) {
    if (set.lanes.length > tokens.length) {
      continue;
    }
    const split = bestSplit(tokens, set.lanes);
    const placed = { ...split, lanes: set.lanes, size: Math.min(set.size, split.size) };
    if (placed.size >= wrapPulkaSize) {
      return placed;
    }
    if (best === null || placed.size > best.size) {
      best = placed;
    }
  }
  return best;
}

/** The split of tokens into one line per lane that allows the biggest font. */
function bestSplit(
  tokens: readonly string[],
  lanes: readonly PulkaLane[],
): { lines: string[]; size: number } {
  const lane = lanes[0] as PulkaLane;
  const sizeOf = (line: string) =>
    Math.floor((lane.room / (line.length * figureWidth)) * 10) / 10;
  if (lanes.length === 1) {
    const line = tokens.join("").trimEnd();
    return { lines: [line], size: sizeOf(line) };
  }
  let best: { lines: string[]; size: number } = { lines: [], size: -Infinity };
  for (let cut = 1; cut <= tokens.length - (lanes.length - 1); cut++) {
    const line = tokens.slice(0, cut).join("").trimEnd();
    const rest = bestSplit(tokens.slice(cut), lanes.slice(1));
    const size = Math.min(sizeOf(line), rest.size);
    if (size > best.size) {
      best = { lines: [line, ...rest.lines], size };
    }
  }
  return best;
}

export function toBulletScore(score: GameSnapshot["score"]): BulletScore {
  const whists = score.whists ?? [];
  return {
    bullet: triple(score.bullet),
    mountain: triple(score.mountain),
    whists: [triple(whists[0]), triple(whists[1]), triple(whists[2])],
    last: {
      bullet: [0, 0, 0],
      mountain: [0, 0, 0],
      whists: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
    },
  };
}

export function scoreBeforeLast(
  score: BulletScore,
  last: GameSnapshot["score"]["last"],
): BulletScore {
  return {
    ...score,
    bullet: minusTriple(score.bullet, last?.bullet),
    mountain: minusTriple(score.mountain, last?.mountain),
    whists: [
      minusTriple(score.whists[0], last?.whists?.[0]),
      minusTriple(score.whists[1], last?.whists?.[1]),
      minusTriple(score.whists[2], last?.whists?.[2]),
    ],
  };
}

export function triple(
  values: readonly number[] | undefined,
): [number, number, number] {
  return [values?.[0] ?? 0, values?.[1] ?? 0, values?.[2] ?? 0];
}

export function minusTriple(
  value: readonly [number, number, number],
  delta: readonly number[] | undefined,
): [number, number, number] {
  return [
    value[0] - (delta?.[0] ?? 0),
    value[1] - (delta?.[1] ?? 0),
    value[2] - (delta?.[2] ?? 0),
  ];
}

export function netWhist(
  rows: readonly (readonly number[] | undefined)[],
  seat: number,
): number {
  let total = 0;
  for (const other of [0, 1, 2]) {
    if (other === seat) {
      continue;
    }
    total += (rows[seat]?.[other] ?? 0) - (rows[other]?.[seat] ?? 0);
  }
  return total;
}

export function poolEdge(values: readonly number[], seat: number): number {
  let total = 0;
  for (const other of [0, 1, 2]) {
    if (other === seat) {
      continue;
    }
    total += (values[seat] ?? 0) - (values[other] ?? 0);
  }
  return total;
}

export function playerStanding(
  bullet: readonly number[],
  mountain: readonly number[],
  whists: readonly (readonly number[])[],
  seat: number,
): number {
  return netWhist(whists, seat) + poolEdge(bullet, seat) - poolEdge(mountain, seat);
}

export function standingParts(
  total: number,
  delta: number,
): { tone: number | null; note: string | null } {
  return {
    tone: total === 0 ? null : total,
    note: delta === 0 ? null : `(${signed(delta)})`,
  };
}

export function fieldChain(
  deals: readonly PlayedDeal[],
  read: (delta: PlayedDeal["delta"]) => number,
  current: number,
): number[] {
  const totals: number[] = [];
  let value = 0;
  for (const deal of deals) {
    const next = value + read(deal.delta);
    if (next !== value) {
      totals.push(next);
      value = next;
    }
  }
  if (current !== value) {
    totals.push(current);
  }
  return totals;
}

export function chainText(
  deals: readonly PlayedDeal[],
  read: (delta: PlayedDeal["delta"]) => number,
  current: number,
  closed: boolean,
): string {
  const totals = fieldChain(deals, read, current);
  if (totals.length === 0) {
    return "";
  }
  const numbers = totals.map(plain);
  if (!closed) {
    return numbers.join(".");
  }
  return `${numbers.join(". ")} >>`;
}

/**
 * A chain split for the sheet: `fresh` is the entry the last deal wrote, with the closing
 * «>>» if that entry closed the пуля, and `main` is everything before it. Without a change
 * in the last deal the whole chain is `main`.
 */
export function chainParts(
  deals: readonly PlayedDeal[],
  read: (delta: PlayedDeal["delta"]) => number,
  current: number,
  closed: boolean,
  changed: boolean,
): { main: string; fresh: string } {
  const text = chainText(deals, read, current, closed);
  const totals = fieldChain(deals, read, current);
  if (!changed || totals.length === 0) {
    return { main: text, fresh: "" };
  }
  const fresh = closed ? `${plain(current)} >>` : plain(current);
  return { main: text.slice(0, text.length - fresh.length), fresh };
}

export function plain(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : String(value);
}

export function resultsText(
  names: readonly string[],
  settlement: readonly [number, number, number],
  deals: readonly PlayedDeal[],
): string {
  const totals = names
    .map((name, seat) => `${name} ${signed(settlement[seat] ?? 0)}`)
    .join("\n");
  const lines = deals.map((deal) => dealLine(deal, names));
  return `Итог\n${totals}\n\nРаздачи\n${lines.join("\n")}\n`;
}

export function dealLine(deal: PlayedDeal, names: readonly string[]): string {
  const declarer = deal.declarer === null ? null : (names[deal.declarer] ?? null);
  const title =
    declarer === null
      ? `${deal.number}. ${deal.contract}`
      : `${deal.number}. ${declarer} — ${deal.contract}`;
  const points = names
    .map(
      (name, seat) =>
        `${name} ${signed(
          playerStanding(
            deal.delta.bullet,
            deal.delta.mountain,
            deal.delta.whists,
            seat,
          ),
        )}`,
    )
    .join(", ");
  const played = deal.tricks[0] + deal.tricks[1] + deal.tricks[2] > 0;
  if (!played) {
    return `${title}. ${points}`;
  }
  const tricks = names
    .map((name, seat) => `${name} ${deal.tricks[seat] ?? 0}`)
    .join(", ");
  return `${title}. Взяток: ${tricks}. ${points}`;
}

export function downloadResults(text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "результаты.txt";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function signed(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  if (value < 0) {
    return `−${Math.abs(value)}`;
  }
  return "0";
}

export function dealHeading(
  deal: PlayedDeal,
  viewer: number,
  names: readonly (string | null)[] | null,
): string {
  const declarer =
    deal.declarer === null ? null : playerName(deal.declarer, viewer, names);
  const note = unplayedNote(deal);
  const contract = note === null ? deal.contract : `${deal.contract}, ${note}`;
  return declarer === null
    ? `Сдача ${deal.number}: ${contract}`
    : `Сдача ${deal.number}: ${declarer} — ${contract}`;
}

/**
 * Why a contract ended without play, for the result heading. «Без трёх» is already in the
 * contract text. A half-whist is the only way a defender writes висты on the declarer
 * without play; overflow help висты are written by the declarer.
 */
export function unplayedNote(deal: PlayedDeal): string | null {
  const declarer = deal.declarer;
  const played = deal.tricks[0] + deal.tricks[1] + deal.tricks[2] > 0;
  if (
    declarer === null ||
    played ||
    deal.contract === "Мизер" ||
    deal.contract.includes("без трёх")
  ) {
    return null;
  }
  const halfWhist = [0, 1, 2].some(
    (seat) => seat !== declarer && (deal.delta.whists[seat]?.[declarer] ?? 0) > 0,
  );
  return halfWhist ? "полвиста" : "без виста";
}

export function whistNotes(
  deal: PlayedDeal,
  seat: number,
  viewer: number,
  names: readonly (string | null)[] | null,
): string[] {
  return [0, 1, 2].flatMap((other) => {
    const value = deal.delta.whists[seat]?.[other] ?? 0;
    if (other === seat || value === 0) {
      return [];
    }
    const target = other === viewer ? "вас" : playerName(other, viewer, names);
    return [`${signed(value)} на ${target}`];
  });
}

export function DealSummary({
  deal,
  viewer,
  names,
}: {
  deal: PlayedDeal;
  viewer: number;
  names: readonly (string | null)[] | null;
}): React.JSX.Element {
  const played = deal.tricks[0] + deal.tricks[1] + deal.tricks[2] > 0;
  const entry = (value: number) => (value === 0 ? "—" : signed(value));
  return (
    <section className="deal-summary" aria-label="Запись за сдачу">
      <h2>{dealHeading(deal, viewer, names)}</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Игрок</th>
            {played ? <th scope="col">Взятки</th> : null}
            <th scope="col">Пуля</th>
            <th scope="col">Гора</th>
            <th scope="col">Висты</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((seat) => {
            const whists = whistNotes(deal, seat, viewer, names);
            return (
              <tr key={seat}>
                <th scope="row">{playerName(seat, viewer, names)}</th>
                {played ? <td>{deal.tricks[seat] ?? 0}</td> : null}
                <td>{entry(deal.delta.bullet[seat] ?? 0)}</td>
                <td>{entry(deal.delta.mountain[seat] ?? 0)}</td>
                <td className="deal-summary-whists">
                  {whists.length === 0
                    ? "—"
                    : whists.map((note, index) => (
                        <span key={note} className="deal-summary-whist">
                          {index === 0 ? note : `, ${note}`}
                        </span>
                      ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
