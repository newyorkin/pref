import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { CreateTableForm, LogoutButton, SettingsEditor } from "./App.js";
import {
  BulletSheet,
  createActionId,
  GameSnapshotPanel,
  LayoutSheet,
  nextClientState,
  resultsText,
  type GameSnapshot,
  type SnapshotEnvelope,
} from "./GameTable.js";

describe("table form", () => {
  test("creates an action id outside a secure context", () => {
    const randomUUID = crypto.randomUUID;
    crypto.randomUUID = undefined as unknown as typeof crypto.randomUUID;
    try {
      expect(createActionId()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      crypto.randomUUID = randomUUID;
    }
  });

  test("shows the player name on the logout button", () => {
    const markup = renderToStaticMarkup(
      <LogoutButton playerName="иван" onLogout={() => undefined} />,
    );

    expect(markup).toContain("Выйти");
    expect(markup).toContain("logout-name");
    expect(markup).toContain("иван");
  });

  test("contains only the requested table settings", () => {
    const markup = renderToStaticMarkup(
      <CreateTableForm onCreated={() => undefined} />,
    );

    expect(markup).toContain('name="raspasProgression"');
    expect(markup).toContain('<option value="111"');
    expect(markup).toContain('<option value="122"');
    expect(markup).toContain('<option value="123"');
    expect(markup).toContain('<option value="123123"');
    expect(markup).toContain(">1 1 1…</option>");
    expect(markup).toContain(">1 2 2…</option>");
    expect(markup).toContain(">1 2 3 3…</option>");
    expect(markup).toContain(">1 2 3 1 2 3…</option>");
    expect(markup).toContain('name="raspasExit"');
    expect(markup).toContain('<option value="666"');
    expect(markup).toContain('<option value="677"');
    expect(markup).toContain('<option value="788"');
    expect(markup).toContain('<option value="678678"');
    expect(markup).toContain(">6, 6, 6</option>");
    expect(markup).toContain(">6, 7, 7</option>");
    expect(markup).toContain(">6, 7, 8, 8…</option>");
    expect(markup).toContain(">6, 7, 8, 6, 7, 8…</option>");
    expect(markup).not.toContain("выключен");
    expect(markup).not.toContain('name="firstLead"');
    expect(markup).toContain("Первый ход в тёмную");
    expect(markup).toContain("Жлобский вист");
    expect(markup).toContain("Десятерная игра проверяется");
    expect(markup).toContain(">Сталинград</span>");
    expect(markup).toContain('name="throwTalon"');
    expect(markup).toContain('name="bulletTarget"');
    expect(markup).toContain('min="3"');
    expect(markup).toContain('max="10000"');
    expect(markup).toMatch(
      /<input[^>]*disabled=""[^>]*name="stalingrad"/,
    );

    expect(markup).not.toMatch(/Сочи|Питер|Ростов|name="city"/);
  });

  test("saves table settings as they change and does not offer a save button", () => {
    const markup = renderToStaticMarkup(
      <SettingsEditor onSubmit={() => undefined} />,
    );

    expect(markup).not.toContain("Сохранить настройки");
    expect(markup).not.toContain('type="submit"');
  });

  test("renders action buttons only from the server snapshot", () => {
    const markup = renderToStaticMarkup(
      <GameSnapshotPanel
        settings={{
          raspasProgression: "123",
          raspasExit: "666",
          throwTalon: false,
          bulletTarget: 2,
        }}
        onAction={() => undefined}
        snapshot={{
          type: "snapshot",
          tableId: "table",
          version: 7,
          state: {
            phase: "auction",
            hand: [{ suit: "spades", rank: 7 }],
            auction: {},
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
            raspasIndex: 2,
            raspasMultiplier: 3,
            dealNumber: 0,
            allowedActions: [
              { type: "auction", action: { type: "pass" } },
              {
                type: "auction",
                action: {
                  type: "bid",
                  bid: {
                    type: "contract",
                    level: 6,
                    trump: "spades",
                  },
                },
              },
            ],
          },
        }}
      />,
    );

    expect(markup).not.toContain("Версия:");
    expect(markup).not.toContain("Распасы:");
    expect(markup).toContain("Открыть пулю");
    expect(markup).not.toContain("Пуля: вы");
    expect(markup).not.toContain("(+");
    expect(markup).not.toContain("Сдача");
    expect(markup).toContain(">Пас</button>");
    expect(markup).toContain('aria-label="6 ♠"');
    expect(markup.match(/<button/g)).toHaveLength(3);
    expect(markup.match(/Взятки/g)).toHaveLength(1);
    expect(markup).not.toContain("пока не скажете пас");
    expect(markup).not.toContain("Кнопки заявок");
  });

  test("keeps offering higher bids on the next round", () => {
    const markup = renderToStaticMarkup(
      <GameSnapshotPanel
        seat={2}
        playerNames={["игрок1", "игрок2", "игрок3"]}
        settings={{
          raspasProgression: "111",
          raspasExit: "666",
          throwTalon: false,
          bulletTarget: 10,
        }}
        onAction={() => undefined}
        snapshot={{
          type: "snapshot",
          tableId: "table",
          version: 2,
          state: {
            phase: "auction",
            hand: [{ suit: "hearts", rank: 14 }],
            auction: {
              turn: 2,
              active: [true, true, true],
              highestBid: {
                type: "contract",
                level: 6,
                trump: "clubs",
              },
              highestBidder: 1,
              result: null,
            },
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
            allowedActions: [
              { type: "auction", action: { type: "pass" } },
              {
                type: "auction",
                action: {
                  type: "bid",
                  bid: {
                    type: "contract",
                    level: 6,
                    trump: "diamonds",
                  },
                },
              },
            ],
          },
        }}
      />,
    );

    expect(markup).toContain("game-screen-auction");
    expect(markup).not.toContain("game-title");
    expect(markup).not.toContain("игрок3");
    expect(markup).toContain("Ваш ход");
    expect(markup).not.toContain("Ваш ход (сдавал)");
    expect(markup).toContain("В торге: игрок1, игрок2, вы (сдавал)");
    expect(markup).toContain("seat-corner-me seat-corner-turn");
    expect(markup).toContain('aria-label="6 ♦"');
    expect(markup).not.toContain(">Мизер</button>");
    expect(markup).toContain(">Мизер</span>");
    expect(markup.lastIndexOf('class="bid-level">10')).toBeLessThan(
      markup.lastIndexOf(">Мизер</span>"),
    );
    expect(markup).toContain(">Пас</button>");
    expect(markup).not.toContain('aria-label="6 ♣"');
    expect(markup.match(/<button/g)).toHaveLength(3);
  });

  test("shows whose bid is due instead of a dead auction sheet", () => {
    const markup = renderToStaticMarkup(
      <GameSnapshotPanel
        seat={0}
        settings={{
          raspasProgression: "111",
          raspasExit: "666",
          throwTalon: false,
          bulletTarget: 10,
        }}
        onAction={() => undefined}
        occupiedSeats={[true, true, false]}
        playerNames={["игрок1", "игрок2", null]}
        snapshot={{
          type: "snapshot",
          tableId: "table",
          version: 2,
          state: {
            phase: "auction",
            hand: [{ suit: "spades", rank: 7 }],
            auction: {
              turn: 2,
              active: [true, true, true],
              highestBid: {
                type: "contract",
                level: 6,
                trump: "clubs",
              },
              highestBidder: 1,
              result: null,
            },
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
          },
        }}
      />,
    );

    expect(markup).not.toContain("game-title");
    expect(markup).not.toContain("игрок1");
    expect(markup).toContain("Ход места 3");
    expect(markup).not.toContain("Ход места 3 (сдавал)");
    expect(markup).toContain("Торг продолжается");
    expect(markup).toContain("оно свободно");
    expect(markup).not.toContain("другом браузере");
    expect(markup).toContain("Открыть пулю");
    expect(markup).not.toContain("Пуля: вы");
    expect(markup).not.toContain("Версия:");
    expect(markup).toContain("В торге: вы, игрок2, место 3 (сдавал)");
    expect(markup).toContain("seat-corner-right seat-corner-turn");
    expect(markup).not.toContain('aria-label="6 ♦"');
    expect(markup).not.toContain(">Пас</button>");
  });

  test("a rejected bid refreshes the board and an older one does not roll it back", () => {
    const current = {
      type: "snapshot",
      tableId: "table",
      version: 1,
      state: { phase: "auction" },
    } as SnapshotEnvelope;
    const refreshed = nextClientState(
      {
        type: "rejected",
        reason: "versionMismatch",
        version: 2,
        tableId: "table",
        state: { phase: "auction", allowedActions: [] },
      },
      current,
      "table",
    );
    expect(refreshed.snapshot?.version).toBe(2);
    expect(refreshed.error).toContain("Стол уже изменился");

    const ignored = nextClientState(
      {
        type: "rejected",
        reason: "notYourTurn",
        version: 1,
        state: { phase: "auction" },
      },
      refreshed.snapshot,
      "table",
    );
    expect(ignored.snapshot?.version).toBe(2);
    expect(ignored.error).toBeNull();
  });

  test("plays a trump by clicking the card and discards exactly two selected cards", () => {
    const play = renderToStaticMarkup(
      <GameSnapshotPanel
        settings={{
          raspasProgression: "123",
          raspasExit: "666",
          throwTalon: false,
          bulletTarget: 2,
        }}
        onAction={() => undefined}
        snapshot={{
          type: "snapshot",
          tableId: "table",
          version: 8,
          state: {
            phase: "play",
            hand: [
              { suit: "hearts", rank: 7 },
              { suit: "spades", rank: 14 },
            ],
            auction: {
              result: {
                type: "contract",
                declarer: 1,
                level: 6,
                trump: "hearts",
              },
            },
            defense: null,
            currentTrick: [
              { seat: 0, card: { suit: "spades", rank: 13 } },
            ],
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
            turn: 0,
            trump: "hearts",
            allowedActions: [
              {
                type: "playCard",
                card: { suit: "hearts", rank: 7 },
              },
            ],
          },
        }}
      />,
    );
    expect(play).not.toContain("game-screen-auction");
    expect(play).toContain("Ваш ход");
    expect(play).toContain(
      'class="game-title">6 <span class="bid-red">♥</span>',
    );
    expect(play).toContain("Разыгрывает место 2");
    expect(play).not.toContain("Преферанс");
    expect(play).not.toContain("козырь ♥");
    expect(play).toContain('aria-label="7 ♥"');
    expect(play).toContain("<button");
    expect(play).toContain('aria-label="Т ♠"');
    expect(play.match(/aria-label="Т ♠"/)?.[0]).toBeDefined();
    expect(play).not.toContain(">Ход hearts 7</button>");

    const discard = renderToStaticMarkup(
      <GameSnapshotPanel
        settings={{
          raspasProgression: "123",
          raspasExit: "666",
          throwTalon: false,
          bulletTarget: 2,
        }}
        onAction={() => undefined}
        snapshot={{
          type: "snapshot",
          tableId: "table",
          version: 4,
          state: {
            phase: "discard",
            hand: [
              { suit: "spades", rank: 14 },
              { suit: "clubs", rank: 8 },
              { suit: "clubs", rank: 7 },
            ],
            talonCards: [
              { suit: "clubs", rank: 8 },
              { suit: "clubs", rank: 7 },
            ],
            auction: {
              result: {
                type: "contract",
                declarer: 0,
                level: 6,
                trump: "hearts",
              },
            },
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
            trump: "hearts",
            allowedActions: [
              { type: "throwTalon" },
              {
                type: "discard",
                cards: [
                  { suit: "spades", rank: 14 },
                  { suit: "clubs", rank: 8 },
                ],
              },
              {
                type: "discard",
                cards: [
                  { suit: "spades", rank: 14 },
                  { suit: "clubs", rank: 7 },
                ],
              },
              {
                type: "discard",
                cards: [
                  { suit: "clubs", rank: 8 },
                  { suit: "clubs", rank: 7 },
                ],
              },
            ],
          },
        }}
      />,
    );
    expect(discard).not.toContain("Прикуп уже в руке");
    expect(discard).not.toContain("Выберите две карты");
    expect(discard).toContain(">Снести две карты</button>");
    expect(discard.match(/Снести две карты/g)).toHaveLength(1);
    expect(discard).toContain(">Бросить прикуп в лицо</button>");
    expect(discard.match(/Бросить прикуп в лицо/g)).toHaveLength(1);
    expect(discard).toContain(", прикуп");
  });

  test("keeps only the last trick in the bottom-right pile", () => {
    const markup = renderToStaticMarkup(
      <GameSnapshotPanel
        settings={{
          raspasProgression: "111",
          raspasExit: "666",
          throwTalon: false,
          bulletTarget: 10,
        }}
        onAction={() => undefined}
        playerNames={["вы", "бета", "гамма"]}
        snapshot={{
          type: "snapshot",
          tableId: "table",
          version: 3,
          state: {
            phase: "play",
            hand: [{ suit: "clubs", rank: 7 }],
            auction: { result: null },
            defense: null,
            currentTrick: [],
            trickHistory: [
              {
                winner: 1,
                cards: [
                  { seat: 0, card: { suit: "clubs", rank: 13 } },
                  { seat: 1, card: { suit: "clubs", rank: 14 } },
                  { seat: 2, card: { suit: "diamonds", rank: 9 } },
                ],
              },
              {
                winner: 0,
                cards: [
                  { seat: 0, card: { suit: "hearts", rank: 7 } },
                  { seat: 1, card: { suit: "hearts", rank: 8 } },
                  { seat: 2, card: { suit: "spades", rank: 9 } },
                ],
              },
            ],
            tricksWon: [1, 1, 0],
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
            trump: "spades",
            allowedActions: [],
          },
        }}
      />,
    );

    expect(markup).toContain('class="trick-dock"');
    expect(markup).toContain("Последняя взятка");
    expect(markup).toContain('aria-label="7 ♥"');
    expect(markup).toContain("Взятку взяли вы");
    expect(markup).not.toContain('aria-label="К ♣"');
    expect(markup).not.toContain('aria-label="Т ♣"');
  });

  test("draws one back per remaining card and the open whist hand on that seat", () => {
    const settings = {
      raspasProgression: "111",
      raspasExit: "666",
      throwTalon: false,
      bulletTarget: 10,
    } as const;
    const score = {
      bullet: [0, 0, 0] as [number, number, number],
      mountain: [0, 0, 0] as [number, number, number],
      whists: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ] as [
        [number, number, number],
        [number, number, number],
        [number, number, number],
      ],
    };
    const hidden = renderToStaticMarkup(
      <GameSnapshotPanel
        settings={settings}
        onAction={() => undefined}
        snapshot={{
          type: "snapshot",
          tableId: "table",
          version: 4,
          state: {
            phase: "play",
            hand: [{ suit: "clubs", rank: 7 }],
            handSizes: [9, 10, 10],
            auction: { result: { type: "contract", level: 6, trump: "hearts" } },
            defense: null,
            currentTrick: [],
            trickHistory: [],
            tricksWon: [0, 0, 0],
            score,
            raspasIndex: 0,
            raspasMultiplier: 1,
            dealNumber: 0,
            trump: "hearts",
            turn: 1,
            allowedActions: [],
          },
        }}
      />,
    );
    expect(hidden.match(/class="card-back"/g)).toHaveLength(20);

    const open = renderToStaticMarkup(
      <GameSnapshotPanel
        settings={settings}
        onAction={() => undefined}
        snapshot={{
          type: "snapshot",
          tableId: "table",
          version: 5,
          state: {
            phase: "play",
            hand: [{ suit: "clubs", rank: 7 }],
            handSizes: [10, 2, 9],
            openSeat: 1,
            openHand: [
              { suit: "hearts", rank: 7 },
              { suit: "diamonds", rank: 9 },
            ],
            auction: { result: { type: "contract", level: 6, trump: "hearts" } },
            defense: null,
            currentTrick: [],
            trickHistory: [],
            tricksWon: [0, 0, 0],
            score,
            raspasIndex: 0,
            raspasMultiplier: 1,
            dealNumber: 0,
            trump: "hearts",
            turn: 0,
            allowedActions: [
              { type: "playCard", card: { suit: "hearts", rank: 7 } },
            ],
          },
        }}
      />,
    );
    expect(open.match(/class="card-back"/g)).toHaveLength(9);
    expect(open).toContain('aria-label="Карты всветлую"');
    expect(open.match(/class="open-suit"/g)).toHaveLength(2);
    expect(open).toContain('<button type="button" class="pc pc-red pc-trump" aria-label="7 ♥"');
    expect(open).toContain('<div class="pc pc-red" aria-label="9 ♦"');
    expect(open.match(/Карты всветлую/g)).toHaveLength(1);
  });

  test("shows one bullet to every seat and the last deal in parentheses", () => {
    const settings = {
      raspasProgression: "111",
      raspasExit: "666",
      throwTalon: false,
      bulletTarget: 10,
    } as const;
    const state = {
      phase: "finished",
      hand: [],
      auction: { result: { type: "contract", level: 6, trump: "spades" } },
      defense: null,
      currentTrick: [],
      trickHistory: [],
      tricksWon: [6, 2, 2] as [number, number, number],
      score: {
        bullet: [10, 4, 8] as [number, number, number],
        mountain: [0, 0, -6] as [number, number, number],
        whists: [
          [0, 0, 20],
          [4, 0, 0],
          [0, 0, 0],
        ] as [
          [number, number, number],
          [number, number, number],
          [number, number, number],
        ],
        last: {
          bullet: [0, 0, 2] as [number, number, number],
          mountain: [0, 0, -6] as [number, number, number],
          whists: [
            [0, 0, 20],
            [0, 0, 0],
            [0, 0, 0],
          ] as [
            [number, number, number],
            [number, number, number],
            [number, number, number],
          ],
        },
      },
      settlement: [30, 0, -30] as [number, number, number],
      raspasIndex: 0,
      raspasMultiplier: 1,
      dealNumber: 3,
      allowedActions: [],
    };
    const names = ["Анна", "Борис", "Вера"];
    const sheet = (seat: number): string =>
      renderToStaticMarkup(
        <BulletSheet
          score={state.score}
          settlement={state.settlement}
          viewer={seat}
          names={names}
          bulletTarget={settings.bulletTarget}
        />,
      );
    const first = sheet(0);
    const second = sheet(1);
    const closed = renderToStaticMarkup(
      <GameSnapshotPanel
        seat={0}
        playerNames={names}
        settings={settings}
        onAction={() => undefined}
        snapshot={{
          type: "snapshot",
          tableId: "table",
          version: 8,
          state,
        }}
      />,
    );

    expect(closed).toContain("Открыть пулю");
    expect(closed).toContain("Игра завершена, спасибо за игру");
    expect(closed).toContain("Сыграть ещё раз");
    expect(closed).toContain("Выгрузить результаты");
    expect(closed).not.toContain("до 10");
    expect(first).toContain("до 10");
    expect(first).toContain(">вы<");
    expect(first).toContain("10.");
    expect(first).toContain("8.");
    expect(first).toContain("(+2)");
    expect(first).toContain("−6.");
    expect(first).toContain("(−6)");
    expect(first).toContain("+18");
    expect(first).toContain("(+12)");
    expect(first).toContain("−12");
    expect(first).toContain("(−8)");
    expect(first).toContain("−6");
    expect(first).toContain("(−4)");
    expect(first).toContain('class="pulka-plus"');
    expect(first).toContain('class="pulka-minus"');
    expect(first).toContain('class="pulka-quiet"');
    expect(first).not.toContain(">0.<");
    expect(first).toContain('id="pulka-cell"');
    expect(second).toContain(">вы<");
    expect(second).toContain("4.");
    expect(second).toContain("8.");
    expect(second).toContain("(+2)");
    expect(first).toContain("20.");
    expect(first).toContain("(+20)");
    expect(second).toContain("20.");
    expect(second).toContain("(+20)");
    expect(second).toContain("−12");
    expect(second).toContain("(−8)");
    expect(first).toContain("Итог: вы +30, Борис 0, Вера −30");
    expect(second).toContain("Итог: Анна +30, вы 0, Вера −30");
  });

  test("folds a thrown talon into the colored standing and skips zero cells", () => {
    const sheet = renderToStaticMarkup(
      <BulletSheet
        score={{
          bullet: [0, 0, 1],
          mountain: [0, 0, 2],
          whists: [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
          ],
          last: {
            bullet: [0, 0, 1],
            mountain: [0, 0, 2],
            whists: [
              [0, 0, 0],
              [0, 0, 0],
              [0, 0, 0],
            ],
          },
        }}
        settlement={null}
        viewer={2}
        names={["Анна", "Борис", "Вера"]}
        bulletTarget={10}
      />,
    );

    expect(sheet).toContain(">вы<");
    expect(sheet).toContain("1.");
    expect(sheet).toContain("2.");
    expect(sheet).toContain("(+1)");
    expect(sheet).toContain("(+2)");
    expect(sheet).toContain("−2");
    expect(sheet).toContain("(−2)");
    expect(sheet).toContain("+1");
    expect(sheet).toContain('class="pulka-minus"');
    expect(sheet).toContain('class="pulka-plus"');
    expect(sheet).toContain('class="pulka-quiet"');
    expect(sheet).not.toContain(">0.<");
    expect(sheet).not.toContain(">0<");
  });

  test("writes the match result and every deal into the results file", () => {
    const zeros = [0, 0, 0] as [number, number, number];
    const quiet = [zeros, zeros, zeros] as [
      [number, number, number],
      [number, number, number],
      [number, number, number],
    ];
    const text = resultsText(
      ["Анна", "Борис", "Вера"],
      [30, 0, -30],
      [
        {
          number: 1,
          declarer: 0,
          contract: "6 пик",
          tricks: zeros,
          delta: {
            bullet: [2, 0, 0],
            mountain: zeros,
            whists: quiet,
          },
        },
        {
          number: 2,
          declarer: null,
          contract: "Распасы",
          tricks: [0, 4, 6],
          delta: {
            bullet: zeros,
            mountain: [0, 4, 6],
            whists: quiet,
          },
        },
      ],
    );

    expect(text).toBe(
      [
        "Итог",
        "Анна +30",
        "Борис 0",
        "Вера −30",
        "",
        "Раздачи",
        "1. Анна — 6 пик. Анна +4, Борис −2, Вера −2",
        "2. Распасы. Взяток: Анна 0, Борис 4, Вера 6. Анна +10, Борис −2, Вера −8",
        "",
      ].join("\n"),
    );
  });

  test("offers light or dark as two buttons and keeps the layout until the next trick", () => {
    const settings = {
      raspasProgression: "111" as const,
      raspasExit: "666" as const,
      throwTalon: false,
      bulletTarget: 10,
    };
    const score = {
      bullet: [0, 0, 0] as [number, number, number],
      mountain: [0, 0, 0] as [number, number, number],
      whists: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ] as GameSnapshot["score"]["whists"],
    };
    const base: GameSnapshot = {
      phase: "play",
      hand: [],
      auction: { result: { type: "contract", level: 6, trump: "spades" } },
      defense: null,
      currentTrick: [],
      trickHistory: [],
      tricksWon: [0, 0, 0],
      score,
      raspasIndex: 0,
      raspasMultiplier: 1,
      dealNumber: 1,
      allowedActions: [
        { type: "defense", action: { type: "light" } },
        { type: "defense", action: { type: "dark" } },
      ],
      lastLayout: {
        hands: [[], [], []],
        talon: [],
        discarded: [],
        tricks: [6, 3, 1],
      },
    };
    const panel = (state: GameSnapshot): string =>
      renderToStaticMarkup(
        <GameSnapshotPanel
          settings={settings}
          onAction={() => undefined}
          snapshot={{ type: "snapshot", tableId: "table", version: 1, state }}
        />,
      );
    const choice = panel(base);
    expect(choice).not.toContain("Лечь или играть");
    expect(choice).toContain(">Всветлую</button>");
    expect(choice).toContain(">Втёмную</button>");
    expect(choice).toContain(">Расклад</button>");
    expect(choice).not.toMatch(/disabled=""[^>]*>Расклад/);

    const playing = panel({
      ...base,
      trickHistory: [
        {
          winner: 0,
          cards: [
            { seat: 0, card: { suit: "spades", rank: 14 } },
            { seat: 1, card: { suit: "spades", rank: 13 } },
            { seat: 2, card: { suit: "spades", rank: 12 } },
          ],
        },
      ],
    });
    expect(playing).toMatch(/<button[^>]*disabled=""[^>]*>Расклад<\/button>/);

    const finished = panel({
      ...base,
      phase: "finished",
      trickHistory: [
        {
          winner: 1,
          cards: [
            { seat: 0, card: { suit: "clubs", rank: 10 } },
            { seat: 1, card: { suit: "clubs", rank: 14 } },
            { seat: 2, card: { suit: "clubs", rank: 9 } },
          ],
        },
      ],
    });
    expect(finished).not.toMatch(/disabled=""[^>]*>Расклад/);

    const sheet = renderToStaticMarkup(
      <LayoutSheet
        viewer={0}
        names={["Анна", "Борис", "Вера"]}
        layout={{
          hands: [[{ suit: "hearts", rank: 14 }], [], []],
          talon: [],
          discarded: [],
          tricks: [6, 3, 1],
        }}
      />,
    );
    expect(sheet).toContain("вы · 6 взяток");
    expect(sheet).toContain("Борис · 3 взятки");
    expect(sheet).toContain("Вера · 1 взятка");

    const misere = panel({
      ...base,
      phase: "order",
      trickHistory: [],
      lastLayout: null,
      auction: { result: { type: "misere", declarer: 0 } },
      allowedActions: [{ type: "order", bid: { type: "misere" } }],
    });
    expect(misere).toContain(">Играть мизер</button>");
  });

  test("shows half-whist only when it is allowed and the talon to the other seats", () => {
    const settings = {
      raspasProgression: "111" as const,
      raspasExit: "666" as const,
      throwTalon: false,
      bulletTarget: 10,
    };
    const zeros = [0, 0, 0] as [number, number, number];
    const state: GameSnapshot = {
      phase: "defense",
      hand: [{ suit: "hearts", rank: 7 }],
      auction: {
        result: {
          type: "contract",
          declarer: 0,
          level: 6,
          trump: "spades",
        },
      },
      defense: null,
      currentTrick: [],
      trickHistory: [],
      tricksWon: zeros,
      score: {
        bullet: zeros,
        mountain: zeros,
        whists: [zeros, zeros, zeros],
      },
      raspasIndex: 0,
      raspasMultiplier: 1,
      dealNumber: 0,
      talonCards: [
        { suit: "clubs", rank: 8 },
        { suit: "clubs", rank: 7 },
      ],
      allowedActions: [
        { type: "defense", action: { type: "pass" } },
        { type: "defense", action: { type: "whist" } },
        { type: "defense", action: { type: "halfWhist" } },
      ],
    };
    const markup = (seat: number): string =>
      renderToStaticMarkup(
        <GameSnapshotPanel
          seat={seat}
          settings={settings}
          onAction={() => undefined}
          snapshot={{
            type: "snapshot",
            tableId: "table",
            version: 1,
            state,
          }}
        />,
      );

    const second = markup(2);
    expect(second).toContain(">Полвиста</button>");
    expect(second).toContain(">Прикуп</p>");
    expect(second).toContain('aria-label="8 ♣"');
    expect(second).toContain('aria-label="7 ♣"');

    const declarer = markup(0);
    expect(declarer).toContain(">Полвиста</button>");
    expect(declarer).not.toContain(">Прикуп</p>");

    const hidden = renderToStaticMarkup(
      <GameSnapshotPanel
        seat={1}
        settings={settings}
        onAction={() => undefined}
        snapshot={{
          type: "snapshot",
          tableId: "table",
          version: 1,
          state: {
            ...state,
            allowedActions: [
              { type: "defense", action: { type: "pass" } },
              { type: "defense", action: { type: "whist" } },
            ],
          },
        }}
      />,
    );
    expect(hidden).not.toContain("Полвиста");
    expect(hidden).toContain(">Прикуп</p>");

    const ordered = renderToStaticMarkup(
      <GameSnapshotPanel
        seat={0}
        settings={settings}
        onAction={() => undefined}
        snapshot={{
          type: "snapshot",
          tableId: "table",
          version: 2,
          state: {
            ...state,
            phase: "order",
            hand: [
              { suit: "clubs", rank: 8 },
              { suit: "hearts", rank: 7 },
            ],
            allowedActions: [],
          },
        }}
      />,
    );
    expect(ordered).not.toContain(", прикуп");

    const playing = renderToStaticMarkup(
      <GameSnapshotPanel
        seat={1}
        settings={settings}
        onAction={() => undefined}
        snapshot={{
          type: "snapshot",
          tableId: "table",
          version: 3,
          state: {
            ...state,
            phase: "play",
            talonCards: [],
            allowedActions: [],
          },
        }}
      />,
    );
    expect(playing).not.toContain(">Прикуп</p>");
  });
});
