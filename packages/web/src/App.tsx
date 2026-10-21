import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { GameTable } from "./GameTable.js";
import "./auth.css";

export interface TableSettings {
  raspasProgression: "111" | "122" | "123" | "123123";
  raspasExit: "666" | "677" | "788" | "678678";
  throwTalon: boolean;
  bulletTarget: number;
}

interface TableInfo {
  tableId: string;
  settings: TableSettings;
  settingsRevision?: number;
  dealt: boolean;
  seats: boolean[];
  names?: (string | null)[] | null;
  seat: number | null;
  isHost: boolean;
  confirmed?: [boolean, boolean, boolean];
  invitePath?: string;
}

const PROGRESSION_LABEL: Record<
  TableSettings["raspasProgression"],
  string
> = {
  "111": "1 1 1…",
  "122": "1 2 2…",
  "123": "1 2 3 3…",
  "123123": "1 2 3 1 2 3…",
};

const EXIT_LABEL: Record<TableSettings["raspasExit"], string> = {
  "666": "6, 6, 6",
  "677": "6, 7, 7",
  "788": "6, 7, 8, 8…",
  "678678": "6, 7, 8, 6, 7, 8…",
};

function copyWithField(url: string): boolean {
  const field = document.createElement("textarea");
  field.value = url;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.focus();
  field.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  field.remove();
  return copied;
}

function copyInvite(url: string): Promise<boolean> {
  if (!window.isSecureContext || navigator.clipboard?.writeText === undefined) {
    return Promise.resolve(copyWithField(url));
  }
  return navigator.clipboard.writeText(url).then(
    () => true,
    () => copyWithField(url),
  );
}

function InviteAddress({
  url,
  onCopy,
}: {
  url: string;
  onCopy: () => void;
}): React.JSX.Element {
  return (
    <button type="button" className="table-invite" onClick={onCopy}>
      {url.split("/").map((piece, index) => (
        <span key={`${piece}:${index}`}>
          {index > 0 ? (
            <>
              /<wbr />
            </>
          ) : null}
          {piece}
        </span>
      ))}
    </button>
  );
}

function bulletTargetAllowed(value: number): boolean {
  return Number.isInteger(value) && value >= 3 && value <= 10000;
}

function clampBulletTarget(value: number): number {
  if (!Number.isFinite(value)) {
    return 10;
  }
  return Math.min(10000, Math.max(3, Math.round(value)));
}

const DEFAULT_SETTINGS: TableSettings = {
  raspasProgression: "111",
  raspasExit: "666",
  throwTalon: false,
  bulletTarget: 10,
};

export function SettingsEditor({
  initialSettings = DEFAULT_SETTINGS,
  submitLabel,
  disabled = false,
  onSubmit,
  onChange,
}: {
  initialSettings?: TableSettings;
  submitLabel?: string;
  disabled?: boolean;
  onSubmit: (settings: TableSettings) => Promise<void> | void;
  onChange?: (settings: TableSettings) => void;
}): React.JSX.Element {
  const [settings, setSettings] = useState(initialSettings);

  function update(next: TableSettings): void {
    setSettings(next);
    if (bulletTargetAllowed(next.bulletTarget)) {
      onChange?.(next);
    }
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (disabled) {
      return;
    }
    void onSubmit(settings);
  }

  return (
    <form className="table-form" onSubmit={submit}>
      <div className="table-field">
        <label htmlFor="raspas-progression">Прогрессия распасов</label>
        <select
          id="raspas-progression"
          name="raspasProgression"
          value={settings.raspasProgression}
          onChange={(event) =>
            update({
              ...settings,
              raspasProgression: event.target
                .value as TableSettings["raspasProgression"],
            })
          }
        >
          <option value="111">{PROGRESSION_LABEL["111"]}</option>
          <option value="122">{PROGRESSION_LABEL["122"]}</option>
          <option value="123">{PROGRESSION_LABEL["123"]}</option>
          <option value="123123">{PROGRESSION_LABEL["123123"]}</option>
        </select>
      </div>

      <div className="table-field">
        <label htmlFor="raspas-exit">Выход</label>
        <select
          id="raspas-exit"
          name="raspasExit"
          value={settings.raspasExit}
          onChange={(event) =>
            update({
              ...settings,
              raspasExit: event.target.value as TableSettings["raspasExit"],
            })
          }
        >
          <option value="666">{EXIT_LABEL["666"]}</option>
          <option value="677">{EXIT_LABEL["677"]}</option>
          <option value="788">{EXIT_LABEL["788"]}</option>
          <option value="678678">{EXIT_LABEL["678678"]}</option>
        </select>
      </div>

      <div className="table-field">
        <label htmlFor="bullet-target">Длина пули</label>
        <input
          id="bullet-target"
          name="bulletTarget"
          type="number"
          min="3"
          max="10000"
          step="1"
          required
          value={settings.bulletTarget}
          onChange={(event) =>
            update({
              ...settings,
              bulletTarget: Number(event.target.value),
            })
          }
          onBlur={() =>
            update({
              ...settings,
              bulletTarget: clampBulletTarget(settings.bulletTarget),
            })
          }
        />
      </div>

      <div className="table-checks">
        <label className="table-check">
          <input checked disabled name="darkLead" type="checkbox" />
          <span>Первый ход в тёмную</span>
        </label>
        <label className="table-check">
          <input checked disabled name="greedyWhist" type="checkbox" />
          <span>Жлобский вист</span>
        </label>
        <label className="table-check">
          <input checked disabled name="checkedTen" type="checkbox" />
          <span>Десятерная игра проверяется</span>
        </label>
        <label className="table-check">
          <input disabled name="stalingrad" type="checkbox" />
          <span>Сталинград</span>
        </label>
        <label className="table-check">
          <input
            name="throwTalon"
            type="checkbox"
            checked={settings.throwTalon}
            onChange={(event) =>
              update({
                ...settings,
                throwTalon: event.target.checked,
              })
            }
          />
          <span>Бросить прикуп в лицо</span>
        </label>
      </div>

      {submitLabel === undefined ? null : (
        <button className="table-submit" type="submit" disabled={disabled}>
          {submitLabel}
        </button>
      )}
    </form>
  );
}

export function CreateTableForm({
  onCreated,
}: {
  onCreated: (table: TableInfo) => void;
}): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function create(settings: TableSettings): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const response = await api("/tables", {
        method: "POST",
        body: JSON.stringify(settings),
      });
      if (!response.ok) {
        setError("Не удалось создать стол");
        return;
      }
      onCreated((await response.json()) as TableInfo);
    } catch {
      setError("Нет связи с сервером");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth-screen">
      <div className="auth-card">
        <header className="auth-brand">
          <h1 className="auth-title">Новый стол</h1>
          <p className="auth-tagline">Настройки стола</p>
          <p className="auth-suits" aria-hidden="true">
            <span>♠</span>
            <span>♥</span>
            <span>♦</span>
            <span>♣</span>
          </p>
        </header>
        <SettingsEditor
          disabled={pending}
          submitLabel={pending ? "Создаём стол…" : "Создать стол"}
          onSubmit={create}
        />
        {error === null ? null : (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

function CreatedTable({ table }: { table: TableInfo }): React.JSX.Element {
  const inviteUrl = `${window.location.origin}${table.invitePath ?? ""}`;
  const [copied, setCopied] = useState(false);

  async function copyLink(): Promise<void> {
    setCopied(await copyInvite(inviteUrl));
  }

  return (
    <section className="auth-screen">
      <div className="auth-card">
        <header className="auth-brand">
          <h1 className="auth-title">Стол создан</h1>
          <p className="auth-tagline">Ссылка для партнёров</p>
          <p className="auth-suits" aria-hidden="true">
            <span>♠</span>
            <span>♥</span>
            <span>♦</span>
            <span>♣</span>
          </p>
        </header>
        <div className="table-actions">
          <InviteAddress url={inviteUrl} onCopy={() => void copyLink()} />
          <a className="table-submit" href={inviteUrl}>
            Сесть за стол
          </a>
          <button
            type="button"
            className="table-secondary"
            onClick={() => void copyLink()}
          >
            {copied ? "Скопировано" : "Скопировать ссылку"}
          </button>
        </div>
      </div>
    </section>
  );
}

type AuthMode = "login" | "register";

function AuthForm({
  onAuthenticated,
}: {
  onAuthenticated: (playerName: string) => void;
}): React.JSX.Element {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(next: AuthMode): void {
    setMode(next);
    setError(null);
  }

  async function authenticate(event: FormEvent): Promise<void> {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length === 0 || password.length === 0) {
      setError("Введите имя и пароль");
      return;
    }

    setPending(true);
    setError(null);
    const credentials = JSON.stringify({
      name: trimmedName,
      password,
    });
    try {
      if (mode === "register") {
        const registration = await api("/register", {
          method: "POST",
          body: credentials,
        });
        if (!registration.ok) {
          setError(
            registration.status === 409
              ? "Это имя уже занято"
              : "Не удалось зарегистрироваться",
          );
          return;
        }
      }
      const login = await api("/login", {
        method: "POST",
        body: credentials,
      });
      if (!login.ok) {
        setError("Неверное имя или пароль");
        return;
      }
      const user = (await login.json()) as { name?: unknown };
      onAuthenticated(
        typeof user.name === "string" && user.name.length > 0
          ? user.name
          : trimmedName,
      );
    } catch {
      setError("Нет связи с сервером");
    } finally {
      setPending(false);
    }
  }

  let submitLabel = "Войти";
  if (mode === "register") {
    submitLabel = "Зарегистрироваться";
  }
  if (pending) {
    submitLabel = mode === "register" ? "Регистрируем…" : "Входим…";
  }

  return (
    <section className="auth-screen">
      <div className="auth-card">
        <header className="auth-brand">
          <h1 className="auth-title">Преферанс</h1>
          <p className="auth-tagline">Стол на троих</p>
          <p className="auth-suits" aria-hidden="true">
            <span>♠</span>
            <span>♥</span>
            <span>♦</span>
            <span>♣</span>
          </p>
        </header>

        <div className="auth-switch">
          <button
            type="button"
            aria-pressed={mode === "login"}
            disabled={pending}
            onClick={() => choose("login")}
          >
            Вход
          </button>
          <button
            type="button"
            aria-pressed={mode === "register"}
            disabled={pending}
            onClick={() => choose("register")}
          >
            Регистрация
          </button>
        </div>

        <form className="auth-form" onSubmit={(event) => void authenticate(event)}>
          <div className="auth-field">
            <label htmlFor="auth-name">Имя</label>
            <input
              id="auth-name"
              name="name"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="auth-password">Пароль</label>
            <div className="auth-password">
              <input
                id="auth-password"
                name="password"
                type={passwordVisible ? "text" : "password"}
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="auth-reveal"
                aria-pressed={passwordVisible}
                disabled={pending}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                {passwordVisible ? "Скрыть" : "Показать"}
              </button>
            </div>
          </div>
          <button className="auth-submit" type="submit" disabled={pending}>
            {submitLabel}
          </button>
          {error === null ? null : (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}

function mergeTable(
  current: TableInfo | null,
  next: TableInfo,
): TableInfo {
  if (current?.dealt === true && next.dealt === false) {
    return current;
  }
  if (
    current !== null &&
    typeof current.settingsRevision === "number" &&
    typeof next.settingsRevision === "number" &&
    next.settingsRevision < current.settingsRevision
  ) {
    return {
      ...next,
      settings: current.settings,
      settingsRevision: current.settingsRevision,
    };
  }
  return next;
}

function isTableMessage(value: unknown): value is TableInfo & { type: "table" } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "table" &&
    "tableId" in value &&
    typeof value.tableId === "string" &&
    "settings" in value
  );
}

function seatName(table: TableInfo, seat: number): string {
  const name = table.names?.[seat];
  if (typeof name === "string" && name.length > 0) {
    return name;
  }
  if (table.seats[seat]) {
    return `Место ${seat + 1}`;
  }
  return "Свободно";
}

function SettingsSummary({
  settings,
}: {
  settings: TableSettings;
}): React.JSX.Element {
  return (
    <dl className="lobby-settings">
      <dt>Прогрессия</dt>
      <dd>{PROGRESSION_LABEL[settings.raspasProgression]}</dd>
      <dt>Выход</dt>
      <dd>{EXIT_LABEL[settings.raspasExit]}</dd>
      <dt>Первый ход</dt>
      <dd>В тёмную</dd>
      <dt>Жлобский вист</dt>
      <dd>Да</dd>
      <dt>Десятерная</dt>
      <dd>Проверяется</dd>
      <dt>Сталинград</dt>
      <dd>Нет</dd>
      <dt>Прикуп в лицо</dt>
      <dd>{settings.throwTalon ? "Можно" : "Нельзя"}</dd>
      <dt>Длина пули</dt>
      <dd>{settings.bulletTarget}</dd>
    </dl>
  );
}

function TableLobby({ tableId }: { tableId: string }): React.JSX.Element {
  const [table, setTable] = useState<TableInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dealing, setDealing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const current = await api(`/tables/${tableId}`);
      if (cancelled) {
        return;
      }
      if (!current.ok) {
        setError("Стол не найден");
        return;
      }
      let info = (await current.json()) as TableInfo;
      if (info.seat === null) {
        const joined = await api(`/tables/${tableId}/join`, {
          method: "POST",
        });
        if (cancelled) {
          return;
        }
        if (!joined.ok) {
          setError("В столе нет свободного места");
          return;
        }
        info = (await joined.json()) as TableInfo;
      }
      if (!cancelled) {
        setTable(info);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tableId]);

  const waitingForDeal = table !== null && !table.dealt;

  useEffect(() => {
    if (!waitingForDeal) {
      return;
    }
    let stopped = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;

    function connect(): void {
      if (stopped) {
        return;
      }
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const nextSocket = new WebSocket(
        `${protocol}//${window.location.host}/ws`,
      );
      socket = nextSocket;
      nextSocket.addEventListener("open", () => {
        if (socket !== nextSocket) {
          return;
        }
        nextSocket.send(JSON.stringify({ type: "watch", tableId }));
      });
      nextSocket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          return;
        }
        let message: unknown;
        try {
          message = JSON.parse(event.data) as unknown;
        } catch {
          return;
        }
        if (!isTableMessage(message) || message.tableId !== tableId) {
          return;
        }
        setTable((current) => mergeTable(current, message));
      });
      nextSocket.addEventListener("close", () => {
        if (stopped || socket !== nextSocket) {
          return;
        }
        reconnectTimer = window.setTimeout(connect, 250);
      });
    }

    const startTimer = window.setTimeout(connect, 0);
    return () => {
      stopped = true;
      window.clearTimeout(startTimer);
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [waitingForDeal, tableId]);

  useEffect(() => {
    if (!waitingForDeal) {
      return;
    }
    let cancelled = false;
    const timer = window.setInterval(() => {
      void api(`/tables/${tableId}`).then(async (response) => {
        if (!response.ok || cancelled) {
          return;
        }
        const next = (await response.json()) as TableInfo;
        setTable((current) => mergeTable(current, next));
      });
    }, 500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [waitingForDeal, tableId]);

  async function saveSettings(settings: TableSettings): Promise<void> {
    const response = await api(`/tables/${tableId}`, {
      method: "PATCH",
      body: JSON.stringify(settings),
    });
    if (!response.ok) {
      setError("После первой сдачи настройки менять нельзя");
      return;
    }
    const next = (await response.json()) as TableInfo;
    setTable((current) => mergeTable(current, next));
  }

  async function confirmConventions(): Promise<void> {
    const response = await api(`/tables/${tableId}/confirm`, {
      method: "POST",
    });
    if (!response.ok) {
      return;
    }
    const next = (await response.json()) as TableInfo;
    setTable((current) => mergeTable(current, next));
  }

  async function startDeal(): Promise<void> {
    setDealing(true);
    setError(null);
    try {
      const response = await api(`/tables/${tableId}/deal`, {
        method: "POST",
        body: JSON.stringify({ seed: Date.now() }),
      });
      if (!response.ok) {
        setError("Не удалось сдать");
        return;
      }
      setTable((await response.json()) as TableInfo);
    } catch {
      setError("Нет связи с сервером");
    } finally {
      setDealing(false);
    }
  }

  if (table === null) {
    return (
      <div className="auth-screen">
        <p
          className={error === null ? "auth-status" : "auth-error"}
          role={error === null ? undefined : "alert"}
        >
          {error ?? "Загрузка стола…"}
        </p>
      </div>
    );
  }
  if (table.dealt && table.seat !== null) {
    return (
      <GameTable
        tableId={table.tableId}
        seat={table.seat}
        settings={table.settings}
      />
    );
  }

  const inviteUrl = `${window.location.origin}/table/${table.tableId}`;
  const seated = table.seats.filter(Boolean).length;
  const confirmedCount = (table.confirmed ?? []).filter(Boolean).length;
  const youConfirmed =
    table.seat !== null && table.confirmed?.[table.seat] === true;
  const tagline =
    seated < 3
      ? `За столом ${seated} из 3`
      : table.isHost
        ? "Все на месте"
        : "Ждём сдачу";

  async function copyLink(): Promise<void> {
    setCopied(await copyInvite(inviteUrl));
  }

  return (
    <section className="auth-screen">
      <div className="auth-card">
        <header className="auth-brand">
          <h1 className="auth-title">Стол</h1>
          <p className="auth-tagline">{tagline}</p>
          <p className="auth-suits" aria-hidden="true">
            <span>♠</span>
            <span>♥</span>
            <span>♦</span>
            <span>♣</span>
          </p>
        </header>

        <div className="lobby-block">
          <h2 className="lobby-heading">Места</h2>
          <ol className="lobby-seats">
            {table.seats.map((occupied, seat) => {
              const yours = table.seat === seat;
              return (
                <li
                  key={seat}
                  className={
                    yours
                      ? "lobby-seat lobby-seat-you"
                      : occupied
                        ? "lobby-seat"
                        : "lobby-seat lobby-seat-empty"
                  }
                >
                  <span className="lobby-seat-index">Место {seat + 1}</span>
                  <span className="lobby-seat-name">
                    {seatName(table, seat)}
                  </span>
                  {yours ? <span className="lobby-you">Вы</span> : null}
                </li>
              );
            })}
          </ol>

          <h2 className="lobby-heading">Ссылка</h2>
          <div className="table-actions">
            <InviteAddress url={inviteUrl} onCopy={() => void copyLink()} />
            <button
              type="button"
              className="table-secondary"
              onClick={() => void copyLink()}
            >
              {copied ? "Скопировано" : "Скопировать ссылку"}
            </button>
          </div>

          <h2 className="lobby-heading">Настройки</h2>
          {table.isHost ? (
            <>
              <SettingsEditor
                initialSettings={table.settings}
                onChange={(settings) => {
                  void saveSettings(settings);
                }}
                onSubmit={saveSettings}
              />
              <button
                type="button"
                className="table-submit lobby-deal"
                disabled={dealing || confirmedCount < 2}
                onClick={() => void startDeal()}
              >
                {dealing ? "Сдаём…" : "Сдать"}
              </button>
            </>
          ) : (
            <>
              <SettingsSummary settings={table.settings} />
              {seated < 3 ? null : (
                <button
                  type="button"
                  className={
                    youConfirmed
                      ? "table-secondary table-confirm-on"
                      : "table-secondary"
                  }
                  aria-pressed={youConfirmed}
                  onClick={() => {
                    if (!youConfirmed) {
                      void confirmConventions();
                    }
                  }}
                >
                  Подтверждаю
                </button>
              )}
            </>
          )}
          {error === null ? null : (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export default function App(): React.JSX.Element {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [createdTable, setCreatedTable] = useState<TableInfo | null>(null);
  const tableId = window.location.pathname.match(
    /^\/table\/([a-f0-9]+)$/,
  )?.[1];

  useEffect(() => {
    void api("/me").then(async (response) => {
      if (!response.ok) {
        setPlayerName(null);
        setAuthenticated(false);
        return;
      }
      const user = (await response.json()) as { name?: unknown };
      setPlayerName(
        typeof user.name === "string" && user.name.length > 0
          ? user.name
          : null,
      );
      setAuthenticated(true);
    });
  }, []);

  let screen: React.JSX.Element;
  if (authenticated === null) {
    screen = (
      <div className="auth-screen">
        <p className="auth-status">Загрузка…</p>
      </div>
    );
  } else if (!authenticated) {
    screen = (
      <AuthForm
        onAuthenticated={(name) => {
          setPlayerName(name);
          setAuthenticated(true);
        }}
      />
    );
  } else if (tableId !== undefined) {
    screen = <TableLobby tableId={tableId} />;
  } else if (createdTable !== null) {
    screen = <CreatedTable table={createdTable} />;
  } else {
    screen = <CreateTableForm onCreated={setCreatedTable} />;
  }

  return (
    <>
      {authenticated === true ? (
        <LogoutButton
          playerName={playerName}
          onLogout={() => {
            setPlayerName(null);
            setAuthenticated(false);
          }}
        />
      ) : null}
      {screen}
    </>
  );
}

export function LogoutButton({
  playerName,
  onLogout,
}: {
  playerName: string | null;
  onLogout: () => void;
}): React.JSX.Element {
  const [pending, setPending] = useState(false);

  async function logout(): Promise<void> {
    setPending(true);
    try {
      const response = await api("/logout", { method: "POST" });
      if (response.ok) {
        onLogout();
      }
    } catch {
      // The session stays until the server clears it.
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      className="logout"
      disabled={pending}
      onClick={() => void logout()}
    >
      <span className="logout-label">Выйти</span>
      {playerName === null ? null : (
        <span className="logout-name">{playerName}</span>
      )}
    </button>
  );
}

function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}
