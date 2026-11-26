import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { GameSnapshotPanel, type GameSnapshot } from "./GameTable.js";
import { RulesDialog } from "./table-rules.js";

const settings = {
  raspasProgression: "123" as const,
  raspasExit: "788" as const,
  throwTalon: true,
  bulletTarget: 25,
};

const state: GameSnapshot = {
  phase: "auction",
  hand: [],
  auction: { turn: 1 },
  defense: null,
  currentTrick: [],
  trickHistory: [],
  tricksWon: [0, 0, 0],
  score: {
    bullet: [0, 0, 0],
    mountain: [0, 0, 0],
    whists: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
  },
  raspasIndex: 0,
  raspasMultiplier: 1,
  dealNumber: 0,
  allowedActions: [],
};

describe("table conventions during play", () => {
  test("every seat gets a button for the table conventions", () => {
    for (const seat of [0, 1, 2]) {
      const markup = renderToStaticMarkup(
        <GameSnapshotPanel
          seat={seat}
          settings={settings}
          onAction={() => undefined}
          snapshot={{ type: "snapshot", tableId: "table", version: 1, state }}
        />,
      );
      expect(markup).toMatch(/<button[^>]*>Договорённости<\/button>/);
      expect(markup).not.toMatch(/disabled=""[^>]*>Договорённости/);
      // The dialog opens only on request.
      expect(markup).not.toContain('aria-label="Договорённости"');
    }
  });

  test("shows the длина пули, распасы, прикуп and fixed rules without controls", () => {
    const markup = renderToStaticMarkup(
      <RulesDialog settings={settings} onClose={() => undefined} />,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-label="Договорённости"');
    expect(markup).toContain("<dt>Длина пули</dt><dd>25</dd>");
    expect(markup).toContain("<dt>Прогрессия</dt><dd>1 2 3 3…</dd>");
    expect(markup).toContain("<dt>Выход</dt><dd>Семерной, а потом восьмерной</dd>");
    expect(markup).toContain("<dt>Прикуп в лицо</dt><dd>Можно</dd>");
    expect(markup).toContain("<dt>Первый ход</dt><dd>В тёмную</dd>");
    expect(markup).toContain("<dt>Жлобский вист</dt><dd>Да</dd>");
    expect(markup).toContain("<dt>Десятерная</dt><dd>Проверяется</dd>");
    expect(markup).toContain("<dt>Сталинград</dt><dd>Нет</dd>");
    expect(markup).toContain("После первой сдачи договорённости не меняются.");
    expect(markup).toContain(">Закрыть</button>");
    expect(markup).not.toMatch(/<(input|select|form)\b/);

    const plain = renderToStaticMarkup(
      <RulesDialog
        settings={{ ...settings, throwTalon: false, raspasProgression: "111", raspasExit: "666" }}
        onClose={() => undefined}
      />,
    );
    expect(plain).toContain("<dt>Прикуп в лицо</dt><dd>Нельзя</dd>");
    expect(plain).toContain("<dt>Прогрессия</dt><dd>1 1 1…</dd>");
    expect(plain).toContain("<dt>Выход</dt><dd>Шестерной</dd>");
  });
});
