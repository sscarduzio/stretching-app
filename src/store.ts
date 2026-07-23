import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

export type ModeKey = 'stretch' | 'boxe';
export type PhaseType = 'prepare' | 'hold' | 'recover' | 'rest' | 'work';

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
  // stretch: 1 set = left + right; rest fires only between stretches (exercises)
  hold: number; recover: number; rest: number; stretches: number; sets: number;
  boxRounds: number; boxWork: number; boxRest: number; boxCombos: number;
  prepare: number; // "get ready" lead-in before the first phase, 0 = off
  voice: boolean; beeps: boolean; vibrate: boolean; music: boolean; volume: number;
}

export const DEFAULTS: Settings = {
  mode: 'stretch',
  hold: 30, recover: 5, rest: 15, stretches: 1, sets: 5,
  boxRounds: 6, boxWork: 60, boxRest: 20, boxCombos: 15,
  prepare: 10,
  voice: true, beeps: true, vibrate: true, music: false, volume: 0.35,
};

const SETTINGS_KEYS = Object.keys(DEFAULTS) as (keyof Settings)[];

// one-shot migration from earlier localStorage formats (v6 = React port,
// v5 = pre-React). Old "reps" counted single sides → sets = ceil(reps/2).
// Old "rest" meant rest-between-sides (different semantics) → dropped.
function legacySettings(): Partial<Settings> {
  const read = (k: string): Record<string, unknown> | null => {
    try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : null; } catch { return null; }
  };
  const v6 = read('stretchTimer.settings.v6') as { state?: Record<string, unknown> } | null;
  const old = v6?.state ?? read('stretchTimer.settings.v5');
  if (!old) return {};
  const out: Record<string, unknown> = {};
  for (const k of SETTINGS_KEYS) if (k in old) out[k] = old[k];
  delete out.rest;
  if (out.mode === 'box') out.mode = 'boxe'; // pre-rename spelling
  if (typeof old.reps === 'number') out.sets = Math.min(10, Math.max(1, Math.ceil(old.reps / 2)));
  return out as Partial<Settings>;
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
      name: 'stretchTimer.settings.v7',
      partialize: (s) => Object.fromEntries(SETTINGS_KEYS.map((k) => [k, s[k]])),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        if (p.mode === 'box') p.mode = 'boxe'; // early v7 payloads used the typo
        return { ...current, ...(p as Partial<Settings>) };
      },
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

// wall-clock in the user's own time format (12h/24h per locale)
const clockFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
export const fmtClock = (ms: number): string => clockFmt.format(ms);
