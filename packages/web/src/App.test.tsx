import { readFileSync } from "node:fs";
import { settleBullet } from "@pref/engine";
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
import {
  DEFAULT_PROFILE,
  DisplayProfileProvider,
  ProfileMenu,
  finishedTrick,
  heldTrick,
  loadProfile,
  pauseMilliseconds,
  saveProfile,
  type DisplayProfile,
} from "./profile.js";

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
    expect(markup).toContain('title="иван сбегает"');
    expect(markup).not.toContain("logout-name");
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
    expect(markup).not.toContain("Ваш ход");
    expect(markup).not.toContain("В торге:");
    expect(markup).not.toContain("Торг продолжается");
    expect(markup).toContain("seat-corner-me seat-corner-turn");
    expect(markup).toContain('aria-label="6 ♦"');
    expect(markup).not.toContain(">Мизер</button>");
    expect(markup).toContain(">Мизер</span>");
    expect(markup.lastIndexOf('class="bid-count">10')).toBeLessThan(
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
    expect(markup).toContain("Ход места 3, но оно свободно.");
    expect(markup).not.toContain("Торг продолжается");
    expect(markup).not.toContain("В торге:");
    expect(markup).toContain("оно свободно");
    expect(markup).not.toContain("другом браузере");
    expect(markup).toContain("Открыть пулю");
    expect(markup).not.toContain("Пуля: вы");
    expect(markup).not.toContain("Версия:");
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

    const duplicate = nextClientState(
      {
        type: "rejected",
        reason: "versionMismatch",
        version: 2,
        tableId: "table",
        state: { phase: "play", allowedActions: [] },
      },
      refreshed.snapshot,
      "table",
    );
    expect(duplicate.snapshot?.version).toBe(2);
    expect(duplicate.error).toBeNull();
    expect(duplicate.snapshot?.state.phase).toBe("auction");

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
    expect(play).not.toContain("Ваш ход");
    expect(play).toContain("seat-corner-me seat-corner-turn");
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
    expect(lastTrickLabels(markup)).toEqual(["7 ♥", "8 ♥", "9 ♠"]);
  });

  test("shows the raspas talon card beside the first two previous tricks", () => {
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
    const base = {
      phase: "play",
      hand: [{ suit: "diamonds", rank: 10 }],
      auction: { result: { type: "raspas" } },
      defense: null,
      currentTrick: [],
      tricksWon: [0, 1, 1] as [number, number, number],
      score,
      raspasIndex: 0,
      raspasMultiplier: 1,
      dealNumber: 0,
      trump: null,
      allowedActions: [],
    };
    const firstTrick = {
      winner: 2,
      talonCard: { suit: "hearts", rank: 7 },
      cards: [
        { seat: 0, card: { suit: "clubs", rank: 8 } },
        { seat: 1, card: { suit: "hearts", rank: 8 } },
        { seat: 2, card: { suit: "hearts", rank: 14 } },
      ],
    };
    const secondTrick = {
      winner: 1,
      talonCard: { suit: "spades", rank: 7 },
      cards: [
        { seat: 2, card: { suit: "spades", rank: 9 } },
        { seat: 0, card: { suit: "spades", rank: 8 } },
        { seat: 1, card: { suit: "spades", rank: 14 } },
      ],
    };
    const thirdTrick = {
      winner: 2,
      cards: [
        { seat: 0, card: { suit: "diamonds", rank: 8 } },
        { seat: 1, card: { suit: "clubs", rank: 9 } },
        { seat: 2, card: { suit: "diamonds", rank: 9 } },
      ],
    };
    const renderTrick = (trickHistory: GameSnapshot["trickHistory"]) =>
      renderToStaticMarkup(
        <GameSnapshotPanel
          settings={settings}
          onAction={() => undefined}
          playerNames={["вы", "бета", "гамма"]}
          snapshot={{
            type: "snapshot",
            tableId: "table",
            version: 4,
            state: { ...base, trickHistory },
          }}
        />,
      );

    expect(lastTrickLabels(renderTrick([firstTrick]))).toEqual([
      "7 ♥, прикуп",
      "8 ♣",
      "8 ♥",
      "Т ♥",
    ]);
    expect(lastTrickLabels(renderTrick([firstTrick, secondTrick]))).toEqual([
      "7 ♠, прикуп",
      "9 ♠",
      "8 ♠",
      "Т ♠",
    ]);
    expect(
      lastTrickLabels(renderTrick([firstTrick, secondTrick, thirdTrick])),
    ).toEqual(["8 ♦", "9 ♣", "9 ♦"]);
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
    expect(open).not.toContain("open-suit");
    expect(open.match(/class="opponent-cards"/g)).toHaveLength(1);
    expect(open).toContain('<button type="button" class="pc pc-red pc-trump" aria-label="7 ♥"');
    expect(open).toContain('<div class="pc pc-red" aria-label="9 ♦"');
    expect(open.match(/Карты всветлую/g)).toHaveLength(1);
  });

  test("shows every misere and light-whist hand as one open row", () => {
    const settings = {
      raspasProgression: "111" as const,
      raspasExit: "666" as const,
      throwTalon: false,
      bulletTarget: 10,
    };
    const zeros = [0, 0, 0] as [number, number, number];
    const score = {
      bullet: zeros,
      mountain: zeros,
      whists: [zeros, zeros, zeros] as GameSnapshot["score"]["whists"],
    };
    const panel = (state: GameSnapshot, seat = 0): string =>
      renderToStaticMarkup(
        <GameSnapshotPanel
          seat={seat}
          settings={settings}
          onAction={() => undefined}
          snapshot={{ type: "snapshot", tableId: "table", version: 6, state }}
        />,
      );
    const base: GameSnapshot = {
      phase: "play",
      hand: [{ suit: "clubs", rank: 9 }],
      handSizes: [1, 4, 4],
      auction: { result: { type: "misere", declarer: 0 } },
      defense: null,
      currentTrick: [],
      trickHistory: [],
      tricksWon: zeros,
      score,
      raspasIndex: 0,
      raspasMultiplier: 1,
      dealNumber: 0,
      allowedActions: [],
    };
    const misere = panel({
      ...base,
      shownHands: [
        null,
        [
          { suit: "spades", rank: 14 },
          { suit: "spades", rank: 13 },
          { suit: "hearts", rank: 7 },
          { suit: "diamonds", rank: 9 },
        ],
        [
          { suit: "clubs", rank: 10 },
          { suit: "clubs", rank: 9 },
          { suit: "diamonds", rank: 8 },
          { suit: "hearts", rank: 8 },
        ],
      ],
    });
    expect(misere.match(/class="opponent-cards"/g)).toHaveLength(2);
    expect(misere.match(/--open-count:4/g)).toHaveLength(2);
    for (const label of ["Т ♠", "К ♠", "7 ♥", "9 ♦", "10 ♣", "9 ♣", "8 ♦", "8 ♥"]) {
      expect(misere).toContain(`aria-label="${label}"`);
    }
    const ownHand = misere.slice(
      misere.indexOf('aria-label="Ваши карты"'),
      misere.indexOf("</section>", misere.indexOf('aria-label="Ваши карты"')),
    );
    expect(ownHand).toContain('aria-label="9 ♣"');
    expect(ownHand).not.toContain('aria-label="Т ♠"');

    const defender = panel(
      {
        ...base,
        hand: [{ suit: "spades", rank: 14 }],
        shownHands: [
          null,
          null,
          [
            { suit: "clubs", rank: 10 },
            { suit: "diamonds", rank: 8 },
          ],
        ],
      },
      1,
    );
    expect(defender.match(/class="opponent-cards"/g)).toHaveLength(1);
    expect(defender).toContain("--open-count:2");
    expect(defender).toContain('aria-label="10 ♣"');
    expect(defender).not.toContain('aria-label="9 ♣"');

    const light = panel({
      ...base,
      auction: { result: { type: "contract", level: 6, trump: "hearts" } },
      trump: "hearts",
      shownHands: [
        null,
        [
          { suit: "hearts", rank: 7 },
          { suit: "diamonds", rank: 9 },
        ],
        [
          { suit: "spades", rank: 13 },
          { suit: "clubs", rank: 10 },
        ],
      ],
      allowedActions: [{ type: "playCard", card: { suit: "hearts", rank: 7 } }],
    });
    expect(light.match(/class="opponent-cards"/g)).toHaveLength(2);
    expect(light).toContain(
      '<button type="button" class="pc pc-red pc-trump" aria-label="7 ♥"',
    );
    expect(light).toContain('<div class="pc pc-red" aria-label="9 ♦"');
    expect(light).toContain('aria-label="К ♠"');
    expect(light).toContain('aria-label="10 ♣"');
    expect(light).not.toContain("opponent-suit-row");

    const storage = new MemoryStorage();
    saveProfile(storage, 4, {
      ...DEFAULT_PROFILE,
      openLayout: "suits",
    });
    const suited = renderToStaticMarkup(
      <DisplayProfileProvider playerId={4} storage={storage}>
        <GameSnapshotPanel
          settings={settings}
          onAction={() => undefined}
          snapshot={{
            type: "snapshot",
            tableId: "table",
            version: 7,
            state: {
              ...base,
              shownHands: [
                null,
                [
                  { suit: "spades", rank: 14 },
                  { suit: "spades", rank: 10 },
                  { suit: "hearts", rank: 9 },
                  { suit: "hearts", rank: 7 },
                ],
                null,
              ],
            },
          }}
        />
      </DisplayProfileProvider>,
    );
    expect(suited.match(/class="opponent-suit-row"/g)).toHaveLength(2);
    const openRows = suited.slice(
      suited.indexOf('aria-label="Карты всветлую"'),
      suited.indexOf('class="opponent-name"'),
    );
    expect(openRows.indexOf('aria-label="10 ♠"')).toBeGreaterThan(-1);
    expect(openRows.indexOf('aria-label="10 ♠"')).toBeLessThan(
      openRows.indexOf('aria-label="Т ♠"'),
    );
    expect(openRows.indexOf('aria-label="Т ♠"')).toBeLessThan(
      openRows.indexOf('aria-label="7 ♥"'),
    );
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
    expect(first).toContain("10 &gt;&gt;");
    expect(first).toContain(">8<");
    expect(first).not.toContain("(+2)");
    expect(first).not.toContain("(−6)");
    expect(first).toContain("−4");
    expect(first).toContain("−16");
    expect(first).toContain("+20");
    expect(first).toContain("(−20)");
    expect(first).toContain("(+20)");
    expect(first).toContain("−6");
    expect(first).not.toContain("+18");
    expect(first).not.toContain("(−4)");
    expect(first).toContain('class="pulka-plus"');
    expect(first).toContain('class="pulka-minus"');
    expect(first).toContain('class="pulka-quiet"');
    expect(first).not.toContain(">0.<");
    expect(first).toContain('id="pulka-cell"');
    expect(second).toContain(">вы<");
    expect(second).toContain(">4<");
    expect(second).toContain(">8<");
    expect(second).not.toContain("(+2)");
    expect(first).toContain(">20<");
    expect(second).toContain(">20<");
    expect(second).toContain("−16");
    expect(second).toContain("(−20)");
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
    expect(sheet).toContain(">1<");
    expect(sheet).toContain(">2<");
    expect(sheet).toContain("+7");
    expect(sheet).toContain("(+7)");
    expect(sheet).toContain("−14");
    expect(sheet).toContain("(−14)");
    expect(sheet).not.toContain("(+1)");
    expect(sheet).not.toContain("(+2)");
    expect(sheet).not.toContain("(−2)");
    expect(sheet).toContain('class="pulka-minus"');
    expect(sheet).toContain('class="pulka-plus"');
    expect(sheet).toContain('class="pulka-quiet"');
    expect(sheet).not.toContain(">0.<");
    expect(sheet).not.toContain(">0<");

    const zeros = [0, 0, 0] as [number, number, number];
    const continued = renderToStaticMarkup(
      <BulletSheet
        score={{
          bullet: zeros,
          mountain: [0, 0, 6],
          whists: [zeros, zeros, zeros],
          last: {
            bullet: zeros,
            mountain: [0, 0, 2],
            whists: [zeros, zeros, zeros],
          },
        }}
        settlement={null}
        viewer={0}
        names={["Анна", "Борис", "Вера"]}
        bulletTarget={10}
        deals={[
          {
            number: 1,
            declarer: 0,
            contract: "6 пик",
            tricks: zeros,
            delta: {
              bullet: zeros,
              mountain: [0, 0, 4],
              whists: [zeros, zeros, zeros],
            },
          },
        ]}
      />,
    );
    expect(continued).toContain(">4.6<");
  });

  test("the score during a game is the final settlement of the current pools", () => {
    const zeros = [0, 0, 0] as [number, number, number];
    const quiet = [zeros, zeros, zeros] as [
      [number, number, number],
      [number, number, number],
      [number, number, number],
    ];
    const score = {
      bullet: [10, 10, 10] as [number, number, number],
      mountain: [0, 3, 6] as [number, number, number],
      whists: quiet,
      last: {
        bullet: zeros,
        mountain: zeros,
        whists: quiet,
      },
    };
    const result = settleBullet(score);
    const sheet = renderToStaticMarkup(
      <BulletSheet
        score={score}
        settlement={[30, 0, -30]}
        viewer={0}
        names={["Анна", "Борис", "Вера"]}
        bulletTarget={10}
      />,
    );

    expect(result).toEqual([30, 0, -30]);
    expect(sheet).toContain("+30");
    expect(sheet).toContain("−30");
    expect(sheet).toContain("Итог: вы +30, Борис 0, Вера −30");
  });

  test("writes a running chain in bullet, mountain and whists", () => {
    const zeros = [0, 0, 0] as [number, number, number];
    const quiet = [zeros, zeros, zeros] as [
      [number, number, number],
      [number, number, number],
      [number, number, number],
    ];
    const deal = (
      bullet: [number, number, number],
      mountain: [number, number, number] = zeros,
      whists: [
        [number, number, number],
        [number, number, number],
        [number, number, number],
      ] = quiet,
    ) => ({
      number: 1,
      declarer: 0 as number | null,
      contract: "6 пик",
      tricks: zeros,
      delta: { bullet, mountain, whists },
    });
    const long = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30].map(
      (value, index, values) => value - (values[index - 1] ?? 0),
    );
    const longChain = "2.4.6.8.10.12.14.16.18.20.22.24.26.28.30";
    const sheet = renderToStaticMarkup(
      <BulletSheet
        score={{
          bullet: [10, 4, 0],
          mountain: [0, 4, 30],
          whists: [
            [0, 8, 0],
            [0, 0, 0],
            [0, 0, 0],
          ],
          last: {
            bullet: zeros,
            mountain: zeros,
            whists: quiet,
          },
        }}
        settlement={[12, -6, -6]}
        viewer={0}
        names={["Анна", "Борис", "Вера"]}
        bulletTarget={10}
        deals={[
          deal([2, 2, 0], [0, 2, long[0] ?? 0], [
            [0, 4, 0],
            zeros,
            zeros,
          ]),
          deal([4, 0, 0], [0, 2, long[1] ?? 0], [
            [0, 4, 0],
            zeros,
            zeros,
          ]),
          deal([4, 2, 0]),
          ...long.slice(2).map((delta) => deal(zeros, [0, 0, delta])),
        ]}
      />,
    );
    const fontSize = (chain: string): number => {
      const at = sheet.indexOf(`>${chain}<`);
      const element = sheet.slice(sheet.lastIndexOf("<text", at), at);
      return Number(element.match(/font-size="([0-9.]+)"/)?.[1]);
    };

    expect(sheet).toContain("2. 6. 10 &gt;&gt;");
    expect(sheet).not.toContain("2.6.10");
    expect(sheet).toContain(">2.4<");
    expect(sheet).not.toContain(">2.2<");
    expect(sheet).toContain(">4.8<");
    expect(sheet).toContain(`>${longChain}<`);
    expect(sheet).not.toContain("(+");
    expect(sheet).not.toContain("(−");
    expect(sheet).toContain("Итог: вы +12, Борис −6, Вера −6");
    expect(fontSize("2.4")).toBe(16);
    expect(fontSize(longChain)).toBeLessThan(16);
    expect(sheet).not.toContain("overflow");
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

  test("shows the current bid in a bubble and keeps earlier calls in the log", () => {
    const markup = renderToStaticMarkup(
      <GameSnapshotPanel
        seat={2}
        playerNames={["Анна", "Борис", "Вера"]}
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
          version: 4,
          state: {
            phase: "auction",
            hand: [{ suit: "hearts", rank: 14 }],
            handSizes: [10, 10, 10],
            auction: {
              turn: 0,
              active: [true, true, true],
              highestBid: {
                type: "contract",
                level: 7,
                trump: "diamonds",
              },
              highestBidder: 2,
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
            speechStep: 2,
            speech: [
              { seat: 0, word: "6 пик", step: 1 },
              { seat: 2, word: "7 бубен", step: 2 },
            ],
            allowedActions: [],
          },
        }}
      />,
    );

    expect(markup).toContain('class="speech-bubble">7 бубен');
    expect(markup).not.toContain('class="speech-bubble">6 пик');
    expect(markup).toContain("Анна: 6 пик");
    expect(markup).toContain("вы: 7 бубен");
    expect(markup).not.toContain("Торг продолжается");
    expect(markup).not.toContain("В торге:");
    expect(markup).not.toContain("Торг открыт");
    expect(markup).toContain('aria-label="Лог"');
  });

  test("whist bubbles say whist or pass and the auction bid stays in the log", () => {
    const markup = renderToStaticMarkup(
      <GameSnapshotPanel
        seat={0}
        playerNames={["Анна", "Борис", "Вера"]}
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
          version: 8,
          state: {
            phase: "defense",
            hand: [{ suit: "spades", rank: 14 }],
            handSizes: [10, 10, 10],
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
            speechStep: 4,
            speech: [
              { seat: 0, word: "6 пик", step: 1 },
              { seat: 0, word: "6 пик", step: 2 },
              { seat: 1, word: "вист", step: 4 },
              { seat: 2, word: "пас", step: 4 },
            ],
            allowedActions: [],
          },
        }}
      />,
    );

    expect(markup).toContain('class="speech-bubble">вист');
    expect(markup).toContain('class="speech-bubble">пас');
    expect(markup).not.toContain('class="speech-bubble">6 пик');
    expect(markup).toContain("Борис: вист");
    expect(markup).toContain("Вера: пас");
    expect(markup).toContain("вы: 6 пик");
    expect(markup).toContain("Разыгрываете вы");
    expect(markup).not.toContain("Разыгрывает вы");
    expect(markup).not.toContain("Торг продолжается");
    expect(markup).not.toContain("В торге:");
    expect(markup).not.toContain("Ваш ход");
  });

  test("hides the whist word in the bubble once the cards are being played", () => {
    const markup = renderToStaticMarkup(
      <GameSnapshotPanel
        seat={0}
        playerNames={["Анна", "Борис", "Вера"]}
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
          version: 9,
          state: {
            phase: "play",
            hand: [{ suit: "spades", rank: 14 }],
            handSizes: [10, 10, 10],
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
            speechStep: 4,
            speech: [
              { seat: 0, word: "6 пик", step: 1 },
              { seat: 1, word: "вист", step: 4 },
              { seat: 2, word: "пас", step: 4 },
            ],
            allowedActions: [],
          },
        }}
      />,
    );

    expect(markup).not.toContain('class="speech-bubble">вист');
    expect(markup).toContain('class="speech-bubble">пас');
    expect(markup).toContain("Борис: вист");
  });
});

function lastTrickLabels(markup: string): string[] {
  const start = markup.indexOf('class="last-trick"');
  const end = markup.indexOf("</details>", start);
  const section = markup.slice(start, end);
  return [...section.matchAll(/aria-label="([^"]*)"/g)].map(
    (match) => match[1] ?? "",
  );
}

describe("display profile", () => {
  test("keeps size, order, pause and card face for this player", () => {
    const storage = new MemoryStorage();
    const chosen: DisplayProfile = {
      cardScale: 2,
      handOrder: "desc",
      trickPause: 3,
      cardFace: "russ",
      cardLang: "en",
      suitOrder: "scdh",
      openLayout: "suits",
    };
    saveProfile(storage, 4, chosen);
    expect(loadProfile(storage, 4)).toEqual(chosen);
    expect(loadProfile(storage, 9)).toEqual(DEFAULT_PROFILE);

    storage.setItem("pref.profile.4", "{");
    expect(loadProfile(storage, 4)).toEqual(DEFAULT_PROFILE);
    saveProfile(storage, 4, chosen);
    expect(loadProfile(new MemoryStorage(), 4)).toEqual(DEFAULT_PROFILE);
    expect(loadProfile(storage, 4)).toEqual(chosen);
  });

  test("shows the four display settings and restores the saved choice", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "pref.profile.4",
      JSON.stringify({
        cardScale: 3,
        handOrder: "desc",
        trickPause: 0,
        cardFace: "collection",
      }),
    );
    const markup = renderToStaticMarkup(
      <DisplayProfileProvider playerId={4} storage={storage}>
        <ProfileMenu startOpen />
      </DisplayProfileProvider>,
    );

    expect(markup).toContain('aria-label="Настройки"');
    expect(markup).not.toContain("Профиль");
    expect(markup).toContain("Размер карт");
    expect(markup).toContain("Язык карт");
    expect(markup).toContain(">EN<");
    expect(markup).toContain(">RU<");
    expect(markup).toContain(">FR<");
    expect(markup).toContain("Расположение мастей");
    expect(markup).toContain("Открытые карты");
    expect(markup).toContain(">В линию</button>");
    expect(markup).toContain(">По мастям</button>");
    expect(pressedLabel(markup, "В линию")).toBe(true);
    expect(markup).toContain("♠");
    expect(markup).toContain('aria-pressed="true" aria-label="пики, бубны, трефы, черви"');
    expect(markup).toContain("Порядок карт");
    expect(markup).toContain("Пауза после взятки");
    expect(markup).toContain("Рисунок карт");
    expect(markup).toContain(">1<");
    expect(markup).toContain(">1.25<");
    expect(markup).toContain(">1.5<");
    expect(markup).toContain(">1.75<");
    expect(markup).toContain(">2<");
    expect(markup).not.toContain(">3<");
    expect(markup).toContain("По возрастанию");
    expect(markup).toContain("По убыванию");
    expect(markup).toContain("1 секунда");
    expect(markup).toContain("3 секунды");
    expect(markup).toContain("Выключено");
    expect(markup).toContain("Базовые");
    expect(markup).toContain("Вензель");
    expect(markup).toContain("Классика");
    expect(markup).toContain("Атласные");
    expect(markup).toContain("Русские");
    expect(markup).not.toContain("Салон");
    expect(markup).not.toContain("Коллекция");
    expect(markup).toContain('data-card-face="plain"');
    expect(markup).toContain('data-card-face="magnific"');
    expect(markup).toContain('data-card-face="classic"');
    expect(markup).toContain('data-card-face="atlas"');
    expect(markup).toContain('data-card-face="russ"');
    expect(pressedLabel(markup, "2")).toBe(true);
    expect(pressedLabel(markup, "По убыванию")).toBe(true);
    expect(pressedLabel(markup, "Выключено")).toBe(true);
    expect(pressedLabel(markup, "Классика")).toBe(true);
    expect(pressedLabel(markup, "1 секунда")).toBe(false);
  });

  test("reorders only the owned hand and keeps the chosen face and desktop scale", () => {
    const storage = new MemoryStorage();
    saveProfile(storage, 4, {
      cardScale: 2,
      handOrder: "desc",
      trickPause: 1,
      cardFace: "atlas",
      cardLang: "ru",
      suitOrder: "sdch",
      openLayout: "line",
    });
    const markup = renderToStaticMarkup(
      <DisplayProfileProvider playerId={4} storage={storage}>
        <GameSnapshotPanel
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
            version: 1,
            state: {
              phase: "play",
              hand: [
                { suit: "spades", rank: 7 },
                { suit: "hearts", rank: 14 },
                { suit: "spades", rank: 14 },
                { suit: "hearts", rank: 8 },
              ],
              auction: { result: null },
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
        />
      </DisplayProfileProvider>,
    );

    expect(handLabels(markup)).toEqual(["Т ♠", "7 ♠", "Т ♥", "8 ♥"]);
    expect(markup).toContain('data-card-face="atlas"');
    expect(markup).toContain('src="/skins/atlas/spades-14.png"');
    expect(markup).toContain('src="/skins/atlas/hearts-8.png"');
    expect(markup).toContain("--card-scale:2");
  });

  test("holds a completed trick for the selected pause and skips the pause when it is off", () => {
    const previous = {
      currentTrick: [{ seat: 0 }, { seat: 1 }],
      trickHistory: [],
    };
    const cards = [
      { seat: 0, card: { suit: "hearts", rank: 7 } },
      { seat: 1, card: { suit: "hearts", rank: 8 } },
      { seat: 2, card: { suit: "hearts", rank: 14 } },
    ];
    const completed = {
      currentTrick: [],
      trickHistory: [{ cards }],
    };
    const leading = {
      currentTrick: [{ seat: 0 }],
      trickHistory: [],
    };

    expect(finishedTrick(previous, completed)).toEqual(cards);
    expect(heldTrick(previous, completed, 1)).toEqual(cards);
    expect(heldTrick(previous, completed, 3)).toEqual(cards);
    expect(heldTrick(previous, completed, 0)).toBeNull();
    expect(finishedTrick(leading, completed)).toBeNull();
    expect(pauseMilliseconds(1)).toBe(1000);
    expect(pauseMilliseconds(3)).toBe(3000);
    expect(pauseMilliseconds(0)).toBe(0);
  });

  test("offers a trick proposal during the play and records the answers", () => {
    const settings = {
      raspasProgression: "111" as const,
      raspasExit: "666" as const,
      throwTalon: false,
      bulletTarget: 10,
    };
    const zeros = [0, 0, 0] as [number, number, number];
    const score = {
      bullet: zeros,
      mountain: zeros,
      whists: [zeros, zeros, zeros] as GameSnapshot["score"]["whists"],
    };
    const panel = (seat: number, state: GameSnapshot): string =>
      renderToStaticMarkup(
        <GameSnapshotPanel
          seat={seat}
          playerNames={["Анна", "Борис", "Вера"]}
          settings={settings}
          onAction={() => undefined}
          snapshot={{ type: "snapshot", tableId: "table", version: 3, state }}
        />,
      );
    const base: GameSnapshot = {
      phase: "play",
      hand: [{ suit: "spades", rank: 14 }],
      handSizes: [2, 2, 2],
      auction: {
        result: { type: "contract", declarer: 0, level: 6, trump: "spades" },
      },
      defense: null,
      currentTrick: [],
      trickHistory: [],
      tricksWon: [3, 1, 0],
      score,
      raspasIndex: 0,
      raspasMultiplier: 1,
      dealNumber: 0,
      allowedActions: [
        { type: "propose", tricks: 3 },
        { type: "propose", tricks: 10 },
      ],
    };
    const offer = panel(0, base);
    expect(offer).toContain(">Моих</summary>");
    expect(offer).toContain(">моих 3</button>");
    expect(offer).toContain(">моих 10</button>");
    expect(offer).not.toContain(">моих 2</button>");
    expect(offer).not.toContain(">Согласен</button>");

    const reply = panel(2, {
      ...base,
      hand: [],
      shownHands: [[{ suit: "hearts", rank: 13 }], null, null],
      speechStep: 5,
      speech: [
        { seat: 0, word: "6 запишем?", step: 5 },
        { seat: 1, word: "согласен", step: 5 },
      ],
      allowedActions: [
        { type: "proposal", answer: "agree" },
        { type: "proposal", answer: "decline" },
      ],
    });
    expect(reply).toContain(">Согласен</button>");
    expect(reply).toContain(">Не согласен</button>");
    expect(reply).not.toContain(">Моих</summary>");
    expect(reply).toContain('class="speech-bubble">6 запишем?');
    expect(reply).toContain('class="speech-bubble">согласен');
    expect(reply).toContain("Анна: 6 запишем?");
    expect(reply).toContain("Борис: согласен");
    expect(reply).toContain('aria-label="К ♥"');
  });

  test("leaves the mobile card size untouched", () => {
    const css = readFileSync(new URL("./table.css", import.meta.url), "utf8");
    const start = css.indexOf("@media (max-width: 640px)");
    const mobileBlock = css.slice(start, css.indexOf("@media", start + 10));
    expect(mobileBlock).toContain("width: 3.35rem");
    expect(mobileBlock).toContain("height: 4.85rem");
    expect(mobileBlock).not.toContain("card-scale");
    expect(css).toContain("@media (min-width: 641px)");
    const hand = css.slice(css.indexOf(".hand-seat {"), css.indexOf("}", css.indexOf(".hand-seat {")));
    expect(hand).toContain("position: fixed");
    expect(hand).toContain("bottom: 0");
    expect(hand).toContain("z-index: 7");
    expect(css).toContain("opacity: 0.92");
  });
});

class MemoryStorage implements Pick<Storage, "getItem" | "setItem"> {
  private readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

function handLabels(markup: string): string[] {
  const start = markup.indexOf('aria-label="Ваши карты"');
  const end = markup.indexOf("</section>", start);
  const section = markup.slice(start, end);
  return [...section.matchAll(/aria-label="([^"]*)"/g)]
    .map((match) => match[1] ?? "")
    .filter((label) => label !== "Ваши карты");
}

function pressedLabel(markup: string, label: string): boolean {
  const at = markup.indexOf(`>${label}<`);
  const buttonAt = markup.lastIndexOf("<button", at);
  const tag = markup.slice(buttonAt, markup.indexOf(">", buttonAt) + 1);
  return tag.includes('aria-pressed="true"');
}
