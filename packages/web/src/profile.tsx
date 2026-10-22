import {
  createContext,
  useContext,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export const CARD_SCALES = [1, 1.25, 1.5, 1.75, 2] as const;
export const TRICK_PAUSES = [1, 3, 0] as const;
export const CARD_FACES = ["plain", "magnific", "classic", "atlas", "russ"] as const;
export const CARD_LANGS = ["en", "ru", "fr"] as const;
export const SUIT_ORDERS = ["sdch", "scdh"] as const;

export type CardScale = (typeof CARD_SCALES)[number];
export type HandOrder = "asc" | "desc";
export type TrickPause = (typeof TRICK_PAUSES)[number];
export type CardFace = (typeof CARD_FACES)[number];
export type CardLang = (typeof CARD_LANGS)[number];
export type SuitOrder = (typeof SUIT_ORDERS)[number];
export type OpenLayout = "line" | "suits";

export interface DisplayProfile {
  readonly cardScale: CardScale;
  readonly handOrder: HandOrder;
  readonly trickPause: TrickPause;
  readonly cardFace: CardFace;
  readonly cardLang: CardLang;
  readonly suitOrder: SuitOrder;
  readonly openLayout: OpenLayout;
}

export const DEFAULT_PROFILE: DisplayProfile = {
  cardScale: 1,
  handOrder: "asc",
  trickPause: 1,
  cardFace: "magnific",
  cardLang: "ru",
  suitOrder: "sdch",
  openLayout: "line",
};

const SUIT_SEQUENCE: Record<SuitOrder, readonly string[]> = {
  sdch: ["spades", "diamonds", "clubs", "hearts"],
  scdh: ["spades", "clubs", "diamonds", "hearts"],
};

export function suitSequence(order: SuitOrder): readonly string[] {
  return SUIT_SEQUENCE[order];
}

export function rankLetter(rank: number, lang: CardLang): string {
  if (rank === 11) {
    if (lang === "en") return "J";
    if (lang === "fr") return "V";
    return "В";
  }
  if (rank === 12) {
    if (lang === "en") return "Q";
    if (lang === "fr") return "D";
    return "Д";
  }
  if (rank === 13) {
    if (lang === "en") return "K";
    if (lang === "fr") return "R";
    return "К";
  }
  if (rank === 14) {
    return lang === "ru" ? "Т" : "A";
  }
  return String(rank);
}

export const CARD_FACE_LABEL: Record<CardFace, string> = {
  plain: "Базовые",
  magnific: "Вензель",
  classic: "Классика",
  atlas: "Атласные",
  russ: "Русские",
};

export function cardArtSrc(
  face: CardFace,
  suit: string,
  rank: number,
): string | null {
  if (face === "magnific" || face === "plain" || rank < 7 || rank > 14) {
    return null;
  }
  if (face === "russ" && rank < 11) {
    return null;
  }
  return `/skins/${face}/${suit}-${rank}.png`;
}

const PROFILE_KEY = "pref.profile.";

export function profileKey(playerId: number): string {
  return `${PROFILE_KEY}${playerId}`;
}

export function parseProfile(raw: string): DisplayProfile | null {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }
  const cardScale = readCardScale(value.cardScale);
  const cardFace = readCardFace(value.cardFace);
  if (
    cardScale === null ||
    (value.handOrder !== "asc" && value.handOrder !== "desc") ||
    !isTrickPause(value.trickPause) ||
    cardFace === null
  ) {
    return null;
  }
  return {
    cardScale,
    handOrder: value.handOrder,
    trickPause: value.trickPause,
    cardFace,
    cardLang: readCardLang(value.cardLang),
    suitOrder: readSuitOrder(value.suitOrder),
    openLayout: readOpenLayout(value.openLayout),
  };
}

export function loadProfile(
  storage: Pick<Storage, "getItem">,
  playerId: number,
): DisplayProfile {
  const raw = storage.getItem(profileKey(playerId));
  if (raw === null) {
    return DEFAULT_PROFILE;
  }
  return parseProfile(raw) ?? DEFAULT_PROFILE;
}

export function saveProfile(
  storage: Pick<Storage, "setItem">,
  playerId: number,
  profile: DisplayProfile,
): void {
  storage.setItem(profileKey(playerId), JSON.stringify(profile));
}

export function pauseMilliseconds(pause: TrickPause): number {
  return pause * 1000;
}

export function finishedTrick<T>(
  previous: {
    readonly currentTrick: readonly unknown[];
    readonly trickHistory: readonly unknown[];
  },
  next: {
    readonly currentTrick: readonly unknown[];
    readonly trickHistory: readonly { readonly cards: T }[];
  },
): T | null {
  if (next.trickHistory.length !== previous.trickHistory.length + 1) {
    return null;
  }
  if (previous.currentTrick.length !== 2 || next.currentTrick.length !== 0) {
    return null;
  }
  return next.trickHistory[next.trickHistory.length - 1]?.cards ?? null;
}

export function heldTrick<T>(
  previous: {
    readonly currentTrick: readonly unknown[];
    readonly trickHistory: readonly unknown[];
  } | null,
  next: {
    readonly currentTrick: readonly unknown[];
    readonly trickHistory: readonly { readonly cards: T }[];
  },
  pause: TrickPause,
): T | null {
  if (previous === null || pause === 0) {
    return null;
  }
  return finishedTrick(previous, next);
}

export function cardScaleStyle(scale: CardScale): CSSProperties {
  return { "--card-scale": String(scale) } as CSSProperties;
}

const PIP_LAYOUT: Record<
  number,
  readonly { readonly x: number; readonly y: number; readonly flip: boolean }[]
> = {
  7: [
    { x: 50, y: 24, flip: false },
    { x: 32, y: 36, flip: false },
    { x: 68, y: 36, flip: false },
    { x: 50, y: 50, flip: false },
    { x: 32, y: 64, flip: true },
    { x: 68, y: 64, flip: true },
    { x: 50, y: 76, flip: true },
  ],
  8: [
    { x: 32, y: 24, flip: false },
    { x: 68, y: 24, flip: false },
    { x: 32, y: 40, flip: false },
    { x: 68, y: 40, flip: false },
    { x: 32, y: 60, flip: true },
    { x: 68, y: 60, flip: true },
    { x: 32, y: 76, flip: true },
    { x: 68, y: 76, flip: true },
  ],
  9: [
    { x: 32, y: 24, flip: false },
    { x: 68, y: 24, flip: false },
    { x: 32, y: 38, flip: false },
    { x: 68, y: 38, flip: false },
    { x: 50, y: 50, flip: false },
    { x: 32, y: 62, flip: true },
    { x: 68, y: 62, flip: true },
    { x: 32, y: 76, flip: true },
    { x: 68, y: 76, flip: true },
  ],
  10: [
    { x: 32, y: 22, flip: false },
    { x: 68, y: 22, flip: false },
    { x: 50, y: 33, flip: false },
    { x: 32, y: 40, flip: false },
    { x: 68, y: 40, flip: false },
    { x: 32, y: 60, flip: true },
    { x: 68, y: 60, flip: true },
    { x: 50, y: 67, flip: true },
    { x: 32, y: 78, flip: true },
    { x: 68, y: 78, flip: true },
  ],
  14: [{ x: 50, y: 52, flip: false }],
};

export function CardFaceLayers({
  rank,
  rankText,
  suitText,
  hideCornerSuit = false,
}: {
  rank: number;
  rankText: string;
  suitText: string;
  hideCornerSuit?: boolean;
}): React.JSX.Element {
  const pips = PIP_LAYOUT[rank] ?? [];
  return (
    <>
      <span className="pc-frame" aria-hidden="true" />
      <span className="pc-corner">
        <span>{rankText}</span>
        {hideCornerSuit ? null : <span>{suitText}</span>}
      </span>
      <span className="pc-corner pc-corner-br" aria-hidden="true">
        <span>{rankText}</span>
        {hideCornerSuit ? null : <span>{suitText}</span>}
      </span>
      <span className="pc-suit" aria-hidden="true">
        {suitText}
      </span>
      <span className="pc-court" aria-hidden="true">
        <span className="pc-court-half">{rankText}</span>
        <span className="pc-court-half pc-court-flip">{rankText}</span>
      </span>
      <span className="pc-pips" aria-hidden="true">
        {pips.map((pip, index) => (
          <span
            key={index}
            className={pip.flip ? "pc-pip pc-pip-flip" : "pc-pip"}
            style={{ left: `${pip.x}%`, top: `${pip.y}%` }}
          >
            {suitText}
          </span>
        ))}
      </span>
    </>
  );
}

interface ProfileController {
  readonly profile: DisplayProfile;
  readonly setProfile: (profile: DisplayProfile) => void;
}

const ProfileContext = createContext<ProfileController>({
  profile: DEFAULT_PROFILE,
  setProfile: () => undefined,
});

export function DisplayProfileProvider({
  playerId,
  storage,
  children,
}: {
  playerId: number | null;
  storage?: Pick<Storage, "getItem" | "setItem">;
  children: ReactNode;
}): React.JSX.Element {
  const [profile, setProfileState] = useState<DisplayProfile>(() =>
    readStored(playerId, storage),
  );

  useEffect(() => {
    setProfileState(readStored(playerId, storage));
  }, [playerId, storage]);

  function setProfile(next: DisplayProfile): void {
    setProfileState(next);
    if (playerId === null) {
      return;
    }
    saveProfile(activeStorage(storage), playerId, next);
  }

  return (
    <ProfileContext.Provider value={{ profile, setProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useDisplayProfile(): DisplayProfile {
  return useContext(ProfileContext).profile;
}

export function ProfileMenu({
  startOpen = false,
}: {
  startOpen?: boolean;
}): React.JSX.Element {
  const { profile, setProfile } = useContext(ProfileContext);
  const [open, setOpen] = useState(startOpen);

  return (
    <div className="profile">
      <button
        type="button"
        className="profile-button"
        aria-expanded={open}
        aria-controls="profile-panel"
        aria-label="Настройки"
        onClick={() => setOpen((current) => !current)}
      >
        <GearIcon />
      </button>
      {open ? (
        <div
          className="profile-panel"
          id="profile-panel"
          role="dialog"
          aria-label="Настройки"
        >
          <div className="profile-group" role="group" aria-label="Размер карт">
            <p>Размер карт</p>
            <div className="profile-options">
              {CARD_SCALES.map((scale) => (
                <button
                  key={scale}
                  type="button"
                  aria-pressed={profile.cardScale === scale}
                  onClick={() => setProfile({ ...profile, cardScale: scale })}
                >
                  {scale}
                </button>
              ))}
            </div>
          </div>
          <div className="profile-group" role="group" aria-label="Порядок карт">
            <p>Порядок карт</p>
            <div className="profile-options">
              <button
                type="button"
                aria-pressed={profile.handOrder === "asc"}
                onClick={() => setProfile({ ...profile, handOrder: "asc" })}
              >
                По возрастанию
              </button>
              <button
                type="button"
                aria-pressed={profile.handOrder === "desc"}
                onClick={() => setProfile({ ...profile, handOrder: "desc" })}
              >
                По убыванию
              </button>
            </div>
          </div>
          <div className="profile-group" role="group" aria-label="Пауза взятки">
            <p>Пауза после взятки</p>
            <div className="profile-options">
              <button
                type="button"
                aria-pressed={profile.trickPause === 1}
                onClick={() => setProfile({ ...profile, trickPause: 1 })}
              >
                1 секунда
              </button>
              <button
                type="button"
                aria-pressed={profile.trickPause === 3}
                onClick={() => setProfile({ ...profile, trickPause: 3 })}
              >
                3 секунды
              </button>
              <button
                type="button"
                aria-pressed={profile.trickPause === 0}
                onClick={() => setProfile({ ...profile, trickPause: 0 })}
              >
                Выключено
              </button>
            </div>
          </div>
          <div className="profile-group" role="group" aria-label="Язык карт">
            <p>Язык карт</p>
            <div className="profile-options">
              {CARD_LANGS.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  aria-pressed={profile.cardLang === lang}
                  onClick={() => setProfile({ ...profile, cardLang: lang })}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="profile-group" role="group" aria-label="Расположение мастей">
            <p>Расположение мастей</p>
            <div className="profile-options">
              {SUIT_ORDERS.map((order) => (
                <button
                  key={order}
                  type="button"
                  aria-pressed={profile.suitOrder === order}
                  aria-label={suitOrderWords(order)}
                  onClick={() => setProfile({ ...profile, suitOrder: order })}
                >
                  <SuitOrderMark order={order} />
                </button>
              ))}
            </div>
          </div>
          <div className="profile-group" role="group" aria-label="Открытые карты">
            <p>Открытые карты</p>
            <div className="profile-options">
              <button
                type="button"
                aria-pressed={profile.openLayout === "line"}
                onClick={() => setProfile({ ...profile, openLayout: "line" })}
              >
                В линию
              </button>
              <button
                type="button"
                aria-pressed={profile.openLayout === "suits"}
                onClick={() => setProfile({ ...profile, openLayout: "suits" })}
              >
                По мастям
              </button>
            </div>
          </div>
          <div className="profile-group" role="group" aria-label="Рисунок карт">
            <p>Рисунок карт</p>
            <div className="profile-faces">
              {CARD_FACES.map((face) => (
                <button
                  key={face}
                  type="button"
                  aria-pressed={profile.cardFace === face}
                  onClick={() => setProfile({ ...profile, cardFace: face })}
                >
                  <span className="profile-sample" data-card-face={face}>
                    <span
                      className={
                        face === "classic" || face === "atlas" || face === "russ"
                          ? "pc"
                          : "pc pc-red"
                      }
                      data-court={face === "magnific" ? "true" : undefined}
                      aria-hidden="true"
                    >
                      {face === "classic" || face === "atlas" || face === "russ" ? (
                        <img
                          className="pc-art"
                          alt=""
                          src={cardArtSrc(face, "hearts", 13) ?? ""}
                        />
                      ) : (
                        <CardFaceLayers
                          rank={13}
                          rankText={rankLetter(13, profile.cardLang)}
                          suitText="♥"
                        />
                      )}
                    </span>
                  </span>
                  {CARD_FACE_LABEL[face]}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function readStored(
  playerId: number | null,
  storage: Pick<Storage, "getItem" | "setItem"> | undefined,
): DisplayProfile {
  if (playerId === null) {
    return DEFAULT_PROFILE;
  }
  return loadProfile(activeStorage(storage), playerId);
}

function activeStorage(
  storage: Pick<Storage, "getItem" | "setItem"> | undefined,
): Pick<Storage, "getItem" | "setItem"> {
  if (storage !== undefined) {
    return storage;
  }
  return window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCardScale(value: unknown): value is CardScale {
  return CARD_SCALES.some((scale) => scale === value);
}

function readCardScale(value: unknown): CardScale | null {
  if (value === 3) {
    return 2;
  }
  return isCardScale(value) ? value : null;
}

function readCardFace(value: unknown): CardFace | null {
  if (value === "collection" || value === "standard") {
    return "classic";
  }
  if (value === "gambler") {
    return "atlas";
  }
  return isCardFace(value) ? value : null;
}

function isTrickPause(value: unknown): value is TrickPause {
  return TRICK_PAUSES.some((pause) => pause === value);
}

function isCardFace(value: unknown): value is CardFace {
  return CARD_FACES.some((face) => face === value);
}

function readCardLang(value: unknown): CardLang {
  if (value === "en" || value === "fr" || value === "ru") {
    return value;
  }
  return "ru";
}

function readOpenLayout(value: unknown): OpenLayout {
  return value === "suits" ? "suits" : "line";
}

function readSuitOrder(value: unknown): SuitOrder {
  if (value === "sdch" || value === "scdh") {
    return value;
  }
  return "sdch";
}

function suitOrderWords(order: SuitOrder): string {
  return order === "scdh"
    ? "пики, трефы, бубны, червы"
    : "пики, бубны, трефы, черви";
}

function SuitOrderMark({ order }: { order: SuitOrder }): React.JSX.Element {
  const marks: readonly (readonly [string, boolean])[] =
    order === "scdh"
      ? [
          ["♠", false],
          ["♣", false],
          ["♦", true],
          ["♥", true],
        ]
      : [
          ["♠", false],
          ["♦", true],
          ["♣", false],
          ["♥", true],
        ];
  return (
    <span className="suit-order">
      {marks.map(([symbol, red]) => (
        <span key={symbol} className={red ? "suit-order-red" : undefined}>
          {symbol}
        </span>
      ))}
    </span>
  );
}

function GearIcon(): React.JSX.Element {
  return (
    <svg className="gear-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.4 13.5a7.6 7.6 0 0 0 .1-1.5 7.6 7.6 0 0 0-.1-1.5l2-1.5a.5.5 0 0 0 .1-.6l-1.9-3.3a.5.5 0 0 0-.6-.2l-2.3 1a7.3 7.3 0 0 0-2.6-1.5l-.4-2.5a.5.5 0 0 0-.5-.4h-3.8a.5.5 0 0 0-.5.4L8.5 4.4A7.3 7.3 0 0 0 5.9 5.9l-2.3-1a.5.5 0 0 0-.6.2L1.1 8.4a.5.5 0 0 0 .1.6l2 1.5a7.6 7.6 0 0 0-.1 1.5 7.6 7.6 0 0 0 .1 1.5l-2 1.5a.5.5 0 0 0-.1.6l1.9 3.3a.5.5 0 0 0 .6.2l2.3-1a7.3 7.3 0 0 0 2.6 1.5l.4 2.5a.5.5 0 0 0 .5.4h3.8a.5.5 0 0 0 .5-.4l.4-2.5a7.3 7.3 0 0 0 2.6-1.5l2.3 1a.5.5 0 0 0 .6-.2l1.9-3.3a.5.5 0 0 0-.1-.6l-2-1.5ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
      />
    </svg>
  );
}
