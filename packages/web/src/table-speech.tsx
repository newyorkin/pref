import { useEffect, useRef, useState } from "react";

import type { GameSnapshot, SpeechDeal, TableSpeech } from "./table-types.js";
import { clampBox, isRedSuit, playerName, suitSymbol } from "./table-utils.js";

export function wordsOnStep(
  speech: readonly TableSpeech[] | undefined,
  speechStep: number | undefined,
): ReadonlyMap<number, string> {
  const step = speechStep ?? 0;
  const words = new Map<number, string>();
  for (const item of speech ?? []) {
    if (item.step === step && item.seat !== null) {
      words.set(item.seat, item.word);
    }
  }
  return words;
}

export const LOG_BOX_KEY = "pref.logBox";

export const LOG_BOX_DEFAULT = { width: 240, height: 148 };

export function readLogBox(): { width: number; height: number } {
  if (typeof localStorage === "undefined") {
    return LOG_BOX_DEFAULT;
  }
  const raw = localStorage.getItem(LOG_BOX_KEY);
  if (raw === null) {
    return LOG_BOX_DEFAULT;
  }
  try {
    const value = JSON.parse(raw) as { width?: unknown; height?: unknown };
    if (typeof value.width !== "number" || typeof value.height !== "number") {
      return LOG_BOX_DEFAULT;
    }
    return {
      width: clampBox(value.width, 160, 640),
      height: clampBox(value.height, 72, 520),
    };
  } catch {
    return LOG_BOX_DEFAULT;
  }
}

export function DealLog({
  log,
  viewer,
  names,
}: {
  log: readonly SpeechDeal[];
  viewer: number;
  names: readonly (string | null)[] | null;
}): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(readLogBox);
  const lineCount = log.reduce((sum, deal) => sum + deal.lines.length, 0);
  useEffect(() => {
    const node = scroller.current;
    if (node !== null) {
      node.scrollTop = node.scrollHeight;
    }
  }, [lineCount]);
  useEffect(() => {
    if (typeof localStorage === "undefined") {
      return;
    }
    localStorage.setItem(LOG_BOX_KEY, JSON.stringify(box));
  }, [box]);
  function startResize(
    event: React.PointerEvent<HTMLDivElement>,
    mode: "x" | "y" | "xy",
  ): void {
    event.preventDefault();
    const handle = event.currentTarget;
    const origin = {
      x: event.clientX,
      y: event.clientY,
      width: box.width,
      height: box.height,
    };
    handle.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent): void => {
      const maxWidth = Math.min(640, window.innerWidth - 24);
      const maxHeight = Math.min(520, window.innerHeight - 96);
      setBox({
        width:
          mode === "y"
            ? origin.width
            : clampBox(origin.width + ev.clientX - origin.x, 160, maxWidth),
        height:
          mode === "x"
            ? origin.height
            : clampBox(origin.height + origin.y - ev.clientY, 72, maxHeight),
      });
    };
    const end = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }
  return (
    <aside
      className="deal-log"
      aria-label="Лог"
      style={{ width: box.width, height: box.height }}
    >
      <div
        className="deal-log-resize deal-log-resize-y"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Высота лога"
        onPointerDown={(event) => startResize(event, "y")}
      />
      <div
        className="deal-log-resize deal-log-resize-x"
        role="separator"
        aria-orientation="vertical"
        aria-label="Ширина лога"
        onPointerDown={(event) => startResize(event, "x")}
      />
      <div
        className="deal-log-resize deal-log-resize-xy"
        role="separator"
        aria-label="Размер лога"
        onPointerDown={(event) => startResize(event, "xy")}
      />
      <h2>Лог</h2>
      <div className="deal-log-scroll" ref={scroller}>
        {log.map((deal) => (
          <section key={deal.deal}>
            <h3>Раздача {deal.deal}</h3>
            <ol>
              {deal.lines.map((item, index) => {
                const who =
                  item.seat === null
                    ? item.word === "кто играет шесть бубён - тот бывает наебён"
                      ? "Система"
                      : null
                    : playerName(item.seat, viewer, names);
                return (
                  <li key={`${deal.deal}:${item.step}:${index}`}>
                    {who === null ? null : `${who}: `}
                    <SpeechWord word={item.word} />
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </aside>
  );
}

export const SUIT_WORDS = [
  ["без козыря", "noTrump"],
  ["пик", "spades"],
  ["треф", "clubs"],
  ["бубен", "diamonds"],
  ["червей", "hearts"],
] as const;

export function SpeechWord({ word }: { word: string }): React.JSX.Element {
  const suit = SUIT_WORDS.find(([name]) => word.includes(name));
  if (suit === undefined) {
    return <>{word}</>;
  }
  return (
    <>
      {word}
      <span
        className={isRedSuit(suit[1]) ? "speech-suit speech-suit-red" : "speech-suit"}
      >
        {suitSymbol(suit[1])}
      </span>
    </>
  );
}

export function speechEntries(state: GameSnapshot): SpeechDeal[] {
  if (state.speechLog !== undefined) {
    return state.speechLog;
  }
  const lines = state.speech ?? [];
  if (lines.length === 0) {
    return [];
  }
  return [{ deal: state.dealNumber + 1, lines }];
}
