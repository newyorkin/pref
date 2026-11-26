import { settleBullet, type BulletScore } from "@pref/engine";

import type { GameSnapshot, PlayedDeal } from "./table-types.js";
import { playerName } from "./table-utils.js";

export function SeatTriangle({
  viewer,
  left,
  right,
  names,
  tricks,
  turn,
}: {
  viewer: number;
  left: number;
  right: number;
  names: readonly (string | null)[] | null;
  tricks: readonly number[];
  turn: number | null;
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

  return (
    <div className="seat-triangle">
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
          <span>{playerName(corner.seat, viewer, names)}</span>
          <strong>{tricks[corner.seat] ?? 0}</strong>
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
  const leftName = playerName(left, viewer, names);
  const rightName = playerName(right, viewer, names);
  const viewerName = playerName(viewer, viewer, names);
  const mountain = (seat: number) =>
    chainText(
      deals,
      (delta) => delta.mountain[seat] ?? 0,
      score.mountain[seat] ?? 0,
      false,
    );
  const bullet = (seat: number) =>
    chainText(
      deals,
      (delta) => delta.bullet[seat] ?? 0,
      score.bullet[seat] ?? 0,
      (score.bullet[seat] ?? 0) >= bulletTarget,
    );
  const whist = (from: number, to: number) =>
    chainText(
      deals,
      (delta) => delta.whists[from]?.[to] ?? 0,
      score.whists[from]?.[to] ?? 0,
      false,
    );
  const standing = (seat: number) =>
    standingParts(now[seat] ?? 0, (now[seat] ?? 0) - (then[seat] ?? 0));

  const leftEdge = 28;
  const rightEdge = 612;
  const topEdge = 28;
  const bottomEdge = 612;
  const mid = 320;
  const whistW = 112;
  const poolW = 68;
  const westWhist = leftEdge + whistW;
  const westPool = westWhist + poolW;
  const eastWhist = rightEdge - whistW;
  const eastPool = eastWhist - poolW;
  const circleR = 38;
  const circleY = 232;
  const apexY = circleY;
  const rise = bottomEdge - apexY;
  const run = mid - leftEdge;
  const along = (x: number) => apexY + ((mid - x) * rise) / run;
  const diagonalX = (y: number) => mid - ((y - apexY) * run) / rise;
  const mountainBase = along(westPool);
  const poolBase = along(westWhist);
  const whistSplit = (topEdge + bottomEdge) / 2;
  const westMountainX = (westPool + (mid - circleR)) / 2;
  const eastMountainX = mid * 2 - westMountainX;
  const westBulletX = (westWhist + westPool) / 2;
  const eastBulletX = mid * 2 - westBulletX;
  const westWhistX = (leftEdge + westWhist) / 2;
  const eastWhistX = mid * 2 - westWhistX;
  const viewerWhistY = (poolBase + bottomEdge) / 2 + 18;
  const viewerWhistWest = (diagonalX(viewerWhistY) + mid) / 2;
  const viewerWhistEast = mid * 2 - viewerWhistWest;
  const verticalRoom = (center: number, top: number, bottom: number): number => {
    const half = Math.min(center - top, bottom - center) - 10;
    return Math.max(36, half * 2);
  };
  const horizontalRoom = (y: number): number =>
    Math.max(36, (mid - diagonalX(y)) * 2 - 28);
  const sideBulletRoom = verticalRoom(210, topEdge, mountainBase);
  const sideMountainRoom = verticalRoom(118, topEdge, circleY - 16);
  const sideWhistUpperRoom = verticalRoom(
    (topEdge + whistSplit) / 2,
    topEdge,
    whistSplit,
  );
  const sideWhistLowerRoom = verticalRoom(
    (whistSplit + bottomEdge) / 2,
    whistSplit,
    bottomEdge,
  );
  const viewerMountainRoom = horizontalRoom(368);
  const viewerBulletRoom = horizontalRoom((mountainBase + poolBase) / 2);
  const viewerWhistRoom = Math.max(36, horizontalRoom(viewerWhistY) * 0.42);

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
          <rect
            x={leftEdge}
            y={topEdge}
            width={rightEdge - leftEdge}
            height={bottomEdge - topEdge}
          />
          <line x1={westWhist} y1={topEdge} x2={westWhist} y2={poolBase} />
          <line x1={westPool} y1={topEdge} x2={westPool} y2={mountainBase} />
          <line x1={eastPool} y1={topEdge} x2={eastPool} y2={mountainBase} />
          <line x1={eastWhist} y1={topEdge} x2={eastWhist} y2={poolBase} />
          <line x1={mid} y1={topEdge} x2={mid} y2={circleY - circleR} />
          <line x1={mid} y1={poolBase} x2={mid} y2={bottomEdge} />
          <line x1={leftEdge} y1={whistSplit} x2={westWhist} y2={whistSplit} />
          <line x1={eastWhist} y1={whistSplit} x2={rightEdge} y2={whistSplit} />
          <line x1={westPool} y1={mountainBase} x2={eastPool} y2={mountainBase} />
          <line x1={westWhist} y1={poolBase} x2={eastWhist} y2={poolBase} />
          <line x1={mid} y1={apexY} x2={leftEdge} y2={bottomEdge} />
          <line x1={mid} y1={apexY} x2={rightEdge} y2={bottomEdge} />
        </g>
        <circle cx={mid} cy={circleY} r={circleR} className="pulka-seal" />
        <text x={mid} y={circleY} className="pulka-pact pulka-center">
          до {bulletTarget}
        </text>
        <PulkaEntry
          x={westMountainX}
          y={circleY}
          turn="left"
          kind="name"
          main={leftName}
          {...standing(left)}
        />
        <PulkaEntry
          x={westMountainX}
          y={118}
          turn="left"
          kind="figure"
          main={mountain(left)}
          fit={sideMountainRoom}
        />
        <PulkaEntry
          x={westBulletX}
          y={210}
          turn="left"
          kind="figure"
          main={bullet(left)}
          fit={sideBulletRoom}
        />
        <PulkaEntry
          x={westWhistX}
          y={(topEdge + whistSplit) / 2}
          turn="left"
          kind="figure"
          main={whist(left, right)}
          fit={sideWhistUpperRoom}
        />
        <PulkaEntry
          x={westWhistX}
          y={(whistSplit + bottomEdge) / 2}
          turn="left"
          kind="figure"
          main={whist(left, viewer)}
          fit={sideWhistLowerRoom}
        />
        <PulkaEntry
          x={eastMountainX}
          y={circleY}
          turn="right"
          kind="name"
          main={rightName}
          {...standing(right)}
        />
        <PulkaEntry
          x={eastMountainX}
          y={118}
          turn="right"
          kind="figure"
          main={mountain(right)}
          fit={sideMountainRoom}
        />
        <PulkaEntry
          x={eastBulletX}
          y={210}
          turn="right"
          kind="figure"
          main={bullet(right)}
          fit={sideBulletRoom}
        />
        <PulkaEntry
          x={eastWhistX}
          y={(topEdge + whistSplit) / 2}
          turn="right"
          kind="figure"
          main={whist(right, left)}
          fit={sideWhistUpperRoom}
        />
        <PulkaEntry
          x={eastWhistX}
          y={(whistSplit + bottomEdge) / 2}
          turn="right"
          kind="figure"
          main={whist(right, viewer)}
          fit={sideWhistLowerRoom}
        />
        <PulkaEntry
          x={mid}
          y={334}
          turn="none"
          kind="name"
          main={viewerName}
          {...standing(viewer)}
        />
        <PulkaEntry
          x={mid}
          y={368}
          turn="none"
          kind="figure"
          main={mountain(viewer)}
          fit={viewerMountainRoom}
        />
        <PulkaEntry
          x={mid}
          y={(mountainBase + poolBase) / 2}
          turn="none"
          kind="figure"
          main={bullet(viewer)}
          fit={viewerBulletRoom}
        />
        <PulkaEntry
          x={viewerWhistWest}
          y={viewerWhistY}
          turn="none"
          kind="figure"
          main={whist(viewer, left)}
          fit={viewerWhistRoom}
        />
        <PulkaEntry
          x={viewerWhistEast}
          y={viewerWhistY}
          turn="none"
          kind="figure"
          main={whist(viewer, right)}
          fit={viewerWhistRoom}
        />
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

export function PulkaEntry({
  x,
  y,
  turn,
  kind,
  main,
  note = null,
  tone = null,
  fit,
}: {
  x: number;
  y: number;
  turn: "left" | "right" | "none";
  kind: "name" | "figure";
  main: string;
  note?: string | null;
  tone?: number | null;
  fit?: number;
}): React.JSX.Element | null {
  if (main === "" && tone === null && note === null) {
    return null;
  }
  const transform =
    turn === "left"
      ? `rotate(90 ${x} ${y})`
      : turn === "right"
        ? `rotate(-90 ${x} ${y})`
        : undefined;
  const quiet =
    note === null ? null : (
      <tspan className="pulka-quiet">
        {main === "" && tone === null ? note : ` ${note}`}
      </tspan>
    );
  const fontSize =
    kind === "figure" && fit !== undefined ? fitChain(main, fit) : undefined;
  return (
    <text
      x={x}
      y={y}
      className={
        kind === "name" ? "pulka-name pulka-center" : "pulka-figure pulka-center"
      }
      fontSize={fontSize}
      transform={transform}
    >
      {main}
      {tone === null ? null : (
        <tspan className={tone > 0 ? "pulka-plus" : "pulka-minus"}>
          {` ${signed(tone)}`}
        </tspan>
      )}
      {quiet}
    </text>
  );
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

export function fitChain(text: string, room: number): number {
  const base = 16;
  const factor = 0.72;
  if (text.length === 0 || text.length * factor * base <= room) {
    return base;
  }
  return Math.round((room / (text.length * factor)) * 10) / 10;
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
  return declarer === null
    ? `Сдача ${deal.number}: ${deal.contract}`
    : `Сдача ${deal.number}: ${declarer} — ${deal.contract}`;
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
                <td>{whists.length === 0 ? "—" : whists.join(", ")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
