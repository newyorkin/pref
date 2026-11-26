import type { TableSettings } from "./App.js";

export const PROGRESSION_LABEL: Record<
  TableSettings["raspasProgression"],
  string
> = {
  "111": "1 1 1…",
  "122": "1 2 2…",
  "123": "1 2 3 3…",
  "123123": "1 2 3 1 2 3…",
};

export const EXIT_LABEL: Record<TableSettings["raspasExit"], string> = {
  "666": "Шестерной",
  "677": "Семерной",
  "788": "Семерной, а потом восьмерной",
  "678678": "7 → 8 → 6 -> 7 ...",
};

export function SettingsSummary({
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

/** Read-only table conventions during play; they are locked after the first deal. */
export function RulesDialog({
  settings,
  onClose,
}: {
  settings: TableSettings;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <div className="bullet-backdrop" onClick={onClose}>
      <div
        className="rules-dialog"
        role="dialog"
        aria-label="Договорённости"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="bullet-close" onClick={onClose}>
          Закрыть
        </button>
        <h2 className="rules-title">Договорённости</h2>
        <SettingsSummary settings={settings} />
        <p className="rules-note">После первой сдачи договорённости не меняются.</p>
      </div>
    </div>
  );
}
