import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDisplayProfile } from "./profile.js";
import { isRecord } from "./table-utils.js";

import { PlayingCard } from "./table-cards.js";
import { BulletSheet } from "./table-score.js";
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

export const BULLET_BOX_KEY = "pref.bulletDialogBox.v1";

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
  viewer,
  names,
  onClose,
}: {
  layout: NonNullable<GameSnapshot["lastLayout"]>;
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
    const saved = readDialogSize(LAYOUT_BOX_KEY);
    const width = Math.min(
      saved?.width ?? rect.width,
      window.innerWidth - LAYOUT_SCREEN_GAP * 2,
    );
    const height = Math.min(
      saved?.height ?? rect.height,
      window.innerHeight - LAYOUT_SCREEN_GAP * 2,
    );
    setBox({
      width,
      height,
      left: Math.max(LAYOUT_SCREEN_GAP, (window.innerWidth - width) / 2),
      bottom: Math.max(LAYOUT_SCREEN_GAP, (window.innerHeight - height) / 2),
    });
  }, [box]);

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
        aria-label="Расклад"
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
          aria-label="Размер расклада"
          onPointerDown={startResize}
        />
        <button type="button" className="bullet-close" onClick={onClose}>
          Закрыть
        </button>
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
  const [box, setBox] = useState<{
    width: number;
    height: number;
    left: number;
    bottom: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (box !== null || dialogRef.current === null) {
      return;
    }
    const rect = dialogRef.current.getBoundingClientRect();
    const saved = readDialogSize(BULLET_BOX_KEY);
    const width = Math.min(saved?.width ?? rect.width, window.innerWidth - 24);
    const height = Math.min(saved?.height ?? rect.height, window.innerHeight - 24);
    setBox({
      width,
      height,
      left: (window.innerWidth - width) / 2,
      bottom: (window.innerHeight - height) / 2,
    });
  }, [box]);

  useEffect(() => {
    if (box === null || typeof localStorage === "undefined") {
      return;
    }
    localStorage.setItem(BULLET_BOX_KEY, JSON.stringify(box));
  }, [box]);

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
          minWidth: 320,
          minHeight: 260,
          maxWidth: Math.max(320, window.innerWidth - origin.left - 12),
          maxHeight: Math.max(260, window.innerHeight - origin.bottom - 12),
        },
      );
      setBox({ ...size, left: origin.left, bottom: origin.bottom });
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
          aria-label="Размер пули"
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
