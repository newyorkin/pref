import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDisplayProfile } from "./profile.js";
import { isRecord } from "./table-utils.js";

import { PlayingCard } from "./table-cards.js";
import { BulletSheet, DealSummary } from "./table-score.js";
import type { GameSnapshot, PlayedDeal } from "./table-types.js";
import { clampBox, playerName, sortHand, trickCount } from "./table-utils.js";

export function LayoutSheet({
  layout,
  viewer,
  names,
}: {
  layout: NonNullable<GameSnapshot["lastLayout"]>;
  viewer: number;
  names: readonly (string | null)[] | null;
}): React.JSX.Element {
  const profile = useDisplayProfile();
  return (
    <div className="layout-board">
      {[0, 1, 2].map((place) => (
        <section key={place}>
          <h2>
            {playerName(place, viewer, names)}
            {layout.tricks === undefined
              ? ""
              : ` · ${trickCount(layout.tricks[place] ?? 0)}`}
          </h2>
          <div className="layout-hand">
            {sortHand(layout.hands[place] ?? [], "asc", profile.suitOrder).map(
              (card, index) => (
                <PlayingCard
                  key={`${card.suit}:${card.rank}:${index}`}
                  card={card}
                  hideCornerSuit
                />
              ),
            )}
          </div>
        </section>
      ))}
      {layout.talon.length === 0 ? null : (
        <section>
          <h2>Прикуп</h2>
          <div className="layout-hand">
            {layout.talon.map((card, index) => (
              <PlayingCard
                key={`${card.suit}:${card.rank}:${index}`}
                card={card}
                hideCornerSuit
              />
            ))}
          </div>
        </section>
      )}
      {layout.discarded.length === 0 ? null : (
        <section>
          <h2>Снос</h2>
          <div className="layout-hand">
            {layout.discarded.map((card, index) => (
              <PlayingCard
                key={`${card.suit}:${card.rank}:${index}`}
                card={card}
                hideCornerSuit
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export const LAYOUT_MIN_WIDTH = 280;

export const LAYOUT_MIN_HEIGHT = 200;

export const LAYOUT_SCREEN_GAP = 12;

export const LAYOUT_BOX_KEY = "pref.layoutDialogBox.v1";

// v1 saved the default size on every open, not only the size the player chose, so it is not read.
export const BULLET_BOX_KEY = "pref.bulletDialogBox.v2";

export const BULLET_MIN_WIDTH = 320;

export const BULLET_MIN_HEIGHT = 260;

export function cornerBoxSize(
  origin: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number },
  limits: {
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
  },
): { width: number; height: number } {
  return {
    width: clampBox(
      origin.width + point.x - origin.x,
      limits.minWidth,
      limits.maxWidth,
    ),
    height: clampBox(
      origin.height + origin.y - point.y,
      limits.minHeight,
      limits.maxHeight,
    ),
  };
}

export function fitLayoutScale(
  natural: { width: number; height: number },
  available: { width: number; height: number },
): number {
  if (natural.width <= 0 || natural.height <= 0) {
    return 1;
  }
  return Math.min(
    1,
    Math.max(0, available.width) / natural.width,
    Math.max(0, available.height) / natural.height,
  );
}

export function LayoutDialog({
  layout,
  deal = null,
  viewer,
  names,
  onClose,
}: {
  layout: NonNullable<GameSnapshot["lastLayout"]>;
  deal?: PlayedDeal | null;
  viewer: number;
  names: readonly (string | null)[] | null;
  onClose: () => void;
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{
    width: number;
    height: number;
    left: number;
    bottom: number;
  } | null>(null);
  const [fit, setFit] = useState<{
    width: number;
    height: number;
    scale: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (box !== null) {
      return;
    }
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    const rect = dialog.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      // A hidden table (another seat on the test table) can't be measured yet.
      return;
    }
    const saved = readDialogSize(LAYOUT_BOX_KEY);
    const width = Math.min(
      Math.max(LAYOUT_MIN_WIDTH, saved?.width ?? rect.width),
      window.innerWidth - LAYOUT_SCREEN_GAP * 2,
    );
    const height = Math.min(
      Math.max(LAYOUT_MIN_HEIGHT, saved?.height ?? rect.height),
      window.innerHeight - LAYOUT_SCREEN_GAP * 2,
    );
    setBox({
      width,
      height,
      left: Math.max(LAYOUT_SCREEN_GAP, (window.innerWidth - width) / 2),
      bottom: Math.max(LAYOUT_SCREEN_GAP, (window.innerHeight - height) / 2),
    });
  });

  useEffect(() => {
    if (box === null || typeof localStorage === "undefined") {
      return;
    }
    localStorage.setItem(LAYOUT_BOX_KEY, JSON.stringify(box));
  }, [box]);

  useLayoutEffect(() => {
    const view = viewRef.current;
    const board = boardRef.current;
    if (view === null || board === null) {
      return;
    }
    const width = board.offsetWidth;
    const height = board.offsetHeight;
    const scale = fitLayoutScale(
      { width, height },
      { width: view.clientWidth, height: view.clientHeight },
    );
    setFit((current) =>
      current !== null &&
      current.width === width &&
      current.height === height &&
      Math.abs(current.scale - scale) < 0.005
        ? current
        : { width, height, scale },
    );
  });

  function startResize(event: React.PointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.stopPropagation();
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    const rect = dialog.getBoundingClientRect();
    const origin = {
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      height: rect.height,
      left: rect.left,
      bottom: window.innerHeight - rect.bottom,
    };
    const handle = event.currentTarget;
    const move = (ev: PointerEvent): void => {
      const size = cornerBoxSize(
        origin,
        { x: ev.clientX, y: ev.clientY },
        {
          minWidth: LAYOUT_MIN_WIDTH,
          minHeight: LAYOUT_MIN_HEIGHT,
          maxWidth: Math.max(
            LAYOUT_MIN_WIDTH,
            window.innerWidth - origin.left - LAYOUT_SCREEN_GAP,
          ),
          maxHeight: Math.max(
            LAYOUT_MIN_HEIGHT,
            window.innerHeight - origin.bottom - LAYOUT_SCREEN_GAP,
          ),
        },
      );
      setBox({
        width: size.width,
        height: size.height,
        left: origin.left,
        bottom: origin.bottom,
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
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Listeners already follow the pointer when capture is unavailable.
    }
  }

  return (
    <div className="bullet-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="layout-dialog"
        role="dialog"
        aria-label="Итог сдачи"
        style={
          box === null
            ? undefined
            : {
                position: "fixed",
                left: box.left,
                bottom: box.bottom,
                width: box.width,
                height: box.height,
                maxWidth: "none",
                maxHeight: "none",
                margin: 0,
              }
        }
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="deal-log-resize deal-log-resize-xy"
          role="separator"
          aria-label="Размер итога сдачи"
          onPointerDown={startResize}
        />
        <button type="button" className="bullet-close" onClick={onClose}>
          Закрыть
        </button>
        {deal === null ? null : (
          <DealSummary deal={deal} viewer={viewer} names={names} />
        )}
        <div className="layout-view" ref={viewRef}>
          <div
            className="layout-scale"
            style={
              fit === null
                ? undefined
                : {
                    width: fit.width * fit.scale,
                    height: fit.height * fit.scale,
                  }
            }
          >
            <div
              ref={boardRef}
              className="layout-fit"
              style={{ transform: `scale(${fit?.scale ?? 1})` }}
            >
              <LayoutSheet layout={layout} viewer={viewer} names={names} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BulletDialog({
  score,
  settlement,
  viewer,
  names,
  bulletTarget,
  deals,
  onClose,
}: {
  score: GameSnapshot["score"];
  settlement: [number, number, number] | null;
  viewer: number;
  names: readonly (string | null)[] | null;
  bulletTarget: number;
  deals: readonly PlayedDeal[];
  onClose: () => void;
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Without a size the player chose, the CSS fits the dialog to the screen. A chosen size is
  // only a wish: the CSS still caps it at the screen, so a smaller window never cuts the пуля.
  const [size, setSize] = useState<{ width: number; height: number } | null>(() =>
    readDialogSize(BULLET_BOX_KEY),
  );
  // The last press on the resize corner that didn't resize, for a double press.
  const lastPress = useRef<CornerPress | null>(null);

  function startResize(event: React.PointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.stopPropagation();
    const press = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    if (isDoublePress(lastPress.current, press)) {
      // The second press only resets: it neither resizes nor saves a size.
      lastPress.current = null;
      setSize(resetDialogSize(BULLET_BOX_KEY));
      return;
    }
    lastPress.current = press;
    const dialog = dialogRef.current;
    const area = dialog?.parentElement;
    if (dialog == null || area == null) {
      return;
    }
    const rect = dialog.getBoundingClientRect();
    const style = getComputedStyle(area);
    const room = {
      width:
        area.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight),
      height:
        area.clientHeight -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom),
    };
    const origin = {
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      height: rect.height,
    };
    const limits = {
      minWidth: Math.min(BULLET_MIN_WIDTH, room.width),
      minHeight: Math.min(BULLET_MIN_HEIGHT, room.height),
      maxWidth: room.width,
      maxHeight: room.height,
    };
    const handle = event.currentTarget;
    let chosen: { width: number; height: number } | null = null;
    const move = (ev: PointerEvent): void => {
      const next = resizeStep(origin, { x: ev.clientX, y: ev.clientY }, limits, chosen);
      if (next !== chosen) {
        chosen = next;
        setSize(next);
      }
    };
    const end = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      finishResize(BULLET_BOX_KEY, chosen);
      if (chosen !== null) {
        // A drag isn't the first half of a double press.
        lastPress.current = null;
      }
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Pointer listeners keep working without capture.
    }
  }

  return (
    <div className="bullet-dialog-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="bullet-dialog"
        role="dialog"
        aria-label="Пуля"
        style={size === null ? undefined : { width: size.width, height: size.height }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="deal-log-resize deal-log-resize-xy"
          role="separator"
          aria-label="Размер пули"
          title="Двойное нажатие — размер по экрану"
          onPointerDown={startResize}
        />
        <button type="button" className="bullet-close" onClick={onClose}>
          Закрыть
        </button>
        <div className="bullet-view">
          <BulletSheet
            score={score}
            settlement={settlement}
            viewer={viewer}
            names={names}
            bulletTarget={bulletTarget}
            deals={deals}
          />
        </div>
      </div>
    </div>
  );
}

/** A press on the resize corner: where, and when (the event's timeStamp, in ms). */
export type CornerPress = { x: number; y: number; time: number };

/** The longest time, in ms, between the two presses of a double press. */
export const DOUBLE_PRESS_TIME = 300;

/** The farthest apart, in pixels, the two presses of a double press can be. */
export const DOUBLE_PRESS_DISTANCE = 10;

/**
 * Whether `press` is the second half of a double press on the resize corner. Pointer events
 * work the same for a mouse, a finger and a pen, unlike dblclick, which phones may not send.
 */
export function isDoublePress(previous: CornerPress | null, press: CornerPress): boolean {
  if (previous === null) {
    return false;
  }
  const elapsed = press.time - previous.time;
  return (
    elapsed >= 0 &&
    elapsed <= DOUBLE_PRESS_TIME &&
    Math.hypot(press.x - previous.x, press.y - previous.y) <= DOUBLE_PRESS_DISTANCE
  );
}

/** How far, in pixels, the pointer must move on the resize corner before it counts as a resize. */
export const RESIZE_DEAD_ZONE = 4;

export function movedPastDeadZone(
  origin: { x: number; y: number },
  point: { x: number; y: number },
): boolean {
  return Math.hypot(point.x - origin.x, point.y - origin.y) >= RESIZE_DEAD_ZONE;
}

/**
 * The size of a centered box whose top right corner follows the pointer. The box grows
 * on both sides, so it grows by twice the pointer's move.
 */
export function centeredCornerSize(
  origin: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number },
  limits: {
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
  },
): { width: number; height: number } {
  return cornerBoxSize(
    origin,
    {
      x: origin.x + 2 * (point.x - origin.x),
      y: origin.y + 2 * (point.y - origin.y),
    },
    limits,
  );
}

/**
 * One pointer move on the resize corner: the dialog's new size, or `chosen` unchanged while
 * the pointer hasn't left the dead zone yet. A tap or a shaky click on the corner isn't a
 * resize, so it doesn't pin the size. `chosen` is null until the drag resizes the dialog.
 */
export function resizeStep(
  origin: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number },
  limits: {
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
  },
  chosen: { width: number; height: number } | null,
): { width: number; height: number } | null {
  if (chosen === null && !movedPastDeadZone(origin, point)) {
    return chosen;
  }
  return centeredCornerSize(origin, point, limits);
}

/** The end of a drag on the resize corner: saves the size only if the drag resized the dialog. */
export function finishResize(
  key: string,
  chosen: { width: number; height: number } | null,
): void {
  if (chosen === null || typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(key, JSON.stringify(chosen));
}

/**
 * A double press on the resize corner: drops the saved size and returns the dialog's new size,
 * null, so it goes back to the automatic size now and on the next open.
 */
export function resetDialogSize(key: string): null {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(key);
  }
  return null;
}

export function readDialogSize(key: string): { width: number; height: number } | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      isRecord(parsed) &&
      typeof parsed.width === "number" &&
      typeof parsed.height === "number"
    ) {
      return { width: parsed.width, height: parsed.height };
    }
  } catch {
    return null;
  }
  return null;
}
