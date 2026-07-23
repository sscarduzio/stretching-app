import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

export type ModeKey = 'stretch' | 'box';
export type PhaseType = 'hold' | 'recover' | 'rest' | 'work';

export interface Phase {
  type: PhaseType;
  duration: number;
  stretch?: number;
  round?: number;
  side?: 'left' | 'right';
  nextStretch?: number;
  nextRound?: number;
}

export interface Settings {
  mode: ModeKey;
  hold: number; recover: number; rest: number; stretches: number; reps: number;
  boxRounds: number; boxWork: number; boxRest: number; boxCombos: number;
  voice: boolean; beeps: boolean; vibrate: boolean; music: boolean; volume: number;
}

export const DEFAULTS: Settings = {
  mode: 'stretch',
  hold: 30, recover: 5, rest: 0, stretches: 1, reps: 10,
  boxRounds: 6, boxWork: 60, boxRest: 20, boxCombos: 15,
  voice: true, beeps: true, vibrate: true, music: false, volume: 0.35,
};

const SETTINGS_KEYS = Object.keys(DEFAULTS) as (keyof Settings)[];

// one-shot migration from the pre-React localStorage format
function legacySettings(): Partial<Settings> {
  try {
    const raw = localStorage.getItem('stretchTimer.settings.v5');
    return raw ? (JSON.parse(raw) as Partial<Settings>) : {};
  } catch {
    return {};
  }
}

interface Session {
  running: boolean;
  paused: boolean;
  finished: boolean;
  plan: Phase[];
  idx: number;
  totalTime: number;
  primaryTotal: number;
  display: number;   // big countdown digit
  progress: number;  // 0..1 within current phase (ring)
  elapsed: number;   // total elapsed seconds, dashboard-throttled
}

export type AppState = Settings & Session & {
  set: (p: Partial<Settings & Session>) => void;
};

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      ...legacySettings(),
      running: false, paused: false, finished: false,
      plan: [], idx: 0, totalTime: 0, primaryTotal: 0,
      display: 0, progress: 0, elapsed: 0,
      set,
    }),
    {
      name: 'stretchTimer.settings.v6',
      partialize: (s) => Object.fromEntries(SETTINGS_KEYS.map((k) => [k, s[k]])),
    },
  ),
);

// settings-only subscription, so config UI doesn't re-render at ring fps
export const useSettings = (): Settings =>
  useApp(useShallow((s) => Object.fromEntries(SETTINGS_KEYS.map((k) => [k, s[k]])) as unknown as Settings));

export function fmtDur(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = (x: number) => x.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function fmtClock(ms: number): string {
  const d = new Date(ms);
  const pad = (x: number) => x.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
