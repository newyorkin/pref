import { useEffect, useRef, useState } from "react";
import { SettingsEditor, type TableSettings } from "./App.js";
import { GameSnapshotPanel } from "./GameTable.js";
import { DisplayProfileProvider, ProfileMenu } from "./profile.js";
import type { GameAction, SnapshotEnvelope } from "./table-types.js";
import "./local-test.css";

export interface TestTable {
  tableId: string;
  settings: TableSettings;
  snapshots: [SnapshotEnvelope, SnapshotEnvelope, SnapshotEnvelope];
}

// Seats that must act; the proposer can only take his offer back while the others answer.
function mustAct(snapshot: SnapshotEnvelope | undefined): boolean {
  return (
    snapshot?.state.allowedActions.some(
      (action) => action.type !== "cancelProposal",
    ) === true
  );
}

// Prefer the actual turn; proposal replies and other phases may offer several seats.
export function actingSeat(table: TestTable): number | null {
  const turn = table.snapshots[0].state.turn;
  if (turn !== null && turn !== undefined && mustAct(table.snapshots[turn]))
    return turn;
  const seat = table.snapshots.findIndex(mustAct);
  return seat < 0 ? null : seat;
}

const STORAGE_KEY = "pref.local-test.table";
const names = ["Игрок 1", "Игрок 2", "Игрок 3"];

async function api(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<TestTable> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok)
    throw new Error(
      response.status === 409
        ? "Состояние изменилось. Обновите страницу."
        : "Не удалось выполнить действие. Попробуйте ещё раз.",
    );
  return response.json() as Promise<TestTable>;
}

export default function LocalTestTable() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [table, setTable] = useState<TestTable | null>(null);
  const [seat, setSeat] = useState(0);
  const [auto, setAuto] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (auto && table !== null) setSeat(actingSeat(table) ?? 0);
  }, [auto, table]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/local-test/status");
        if (!active) return;
        setEnabled(response.ok);
        const id = sessionStorage.getItem(STORAGE_KEY);
        if (response.ok && id && /^[a-f0-9]{32}$/.test(id)) {
          try {
            const restored = await api(`/local-test/tables/${id}`);
            if (active) setTable(restored);
          } catch {
            if (active) sessionStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch {
        if (active) setEnabled(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function run(action: () => Promise<TestTable>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const next = await action();
      sessionStorage.setItem(STORAGE_KEY, next.tableId);
      setTable(next);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  function sendAction(player: number, action: GameAction) {
    if (!table) return;
    void run(() =>
      api(`/local-test/tables/${table.tableId}/actions`, {
        seat: player,
        action,
        expectedVersion: table.snapshots[player].version,
      }),
    );
  }

  if (enabled === null) return <p className="auth-screen">Загрузка тестового стола…</p>;
  if (!enabled)
    return (
      <main className="auth-screen">
        <h1>Тестовый режим выключен</h1>
        <p>Для локального запуска включите LOCAL_TEST_MODE=1.</p>
        <a href="/">Вернуться к игре</a>
      </main>
    );
  if (table === null)
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <h1>Тест втроём</h1>
          <p>
            Одна вкладка, три игрока. Играйте вручную за каждого без регистрации.
            Тестовые партии хранятся до перезапуска сервера.
          </p>
          <SettingsEditor
            submitLabel="Начать тест втроём"
            disabled={pending}
            onSubmit={(settings) => run(() => api("/local-test/tables", settings))}
          />
          {error && <p role="alert">{error}</p>}
          <a href="/">Обычная игра</a>
        </section>
      </main>
    );
  const turn = actingSeat(table);
  return (
    <DisplayProfileProvider playerId={-100}>
      <div className="local-test-shell">
        <nav className="local-test-bar" aria-label="Управление тестом">
          <strong>Тест втроём</strong>
          <div role="group" aria-label="Смотреть глазами игрока">
            {names.map((name, player) => (
              <button
                key={name}
                type="button"
                aria-pressed={seat === player}
                onClick={() => {
                  setSeat(player);
                  setAuto(false);
                }}
              >
                {name}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={turn === null}
            onClick={() => turn !== null && setSeat(turn)}
          >
            Кто ходит{turn === null ? "" : `: ${names[turn]}`}
          </button>
          <label>
            <input
              type="checkbox"
              checked={auto}
              onChange={(event) => {
                setAuto(event.target.checked);
                if (event.target.checked && turn !== null) setSeat(turn);
              }}
            />
            Автопереход
          </label>
          <ProfileMenu />
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              if (busy.current) return;
              busy.current = true;
              setPending(true);
              try {
                await api(`/local-test/tables/${table.tableId}`, undefined, "DELETE");
                sessionStorage.removeItem(STORAGE_KEY);
                setTable(null);
                setError(null);
              } catch (cause) {
                setError((cause as Error).message);
              } finally {
                busy.current = false;
                setPending(false);
              }
            }}
          >
            Новая партия
          </button>
          <a href="/">Выйти</a>
          {pending && <span role="status">Отправляем…</span>}
          {error && <span role="alert">{error}</span>}
        </nav>
        <div className="local-test-stage" aria-busy={pending}>
          {table.snapshots.map((snapshot, player) => (
            <div key={`${table.tableId}:${player}`} hidden={seat !== player}>
              <GameSnapshotPanel
                snapshot={snapshot}
                settings={table.settings}
                seat={player}
                error={error}
                playerNames={names}
                occupiedSeats={[true, true, true]}
                onAction={(action) => sendAction(player, action)}
              />
            </div>
          ))}
        </div>
      </div>
    </DisplayProfileProvider>
  );
}
