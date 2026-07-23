// English — the reference dictionary. `Messages` is derived from this object,
// so every other locale is type-checked against it: adding a language is
// copying this file and translating the values.
// Interpolated/plural messages are plain functions — each locale owns its own
// grammar, no i18n library needed at this string count.
import type { ReactNode } from 'react';

export const en = {
  appTitle: 'Stretch & Boxe Timer',

  modes: {
    stretch: { title: 'Stretch', subtitle: 'Hold · recover · alternate sides' },
    boxe: { title: 'Boxe', subtitle: 'Shadow boxe · combos · rounds' },
  },

  // keyed by the Settings field name
  fields: {
    hold: { label: 'Hold', sub: 'seconds per side' },
    stretches: { label: 'Stretches', sub: 'exercises' },
    sets: { label: 'Sets', sub: 'left + right each' },
    recover: { label: 'Side switch', sub: 'seconds' },
    rest: { label: 'Rest between stretches', sub: '0 = off' },
    boxRounds: { label: 'Rounds', sub: 'boxing' },
    boxWork: { label: 'Round length', sub: 'seconds' },
    boxRest: { label: 'Rest', sub: 'between rounds · 0 = off' },
    boxCombos: { label: 'Combo pace', sub: 'seconds apart · 0 = off' },
    prepare: { label: 'Get ready', sub: 'lead-in · 0 = off' },
  },

  presets: {
    quick: 'Quick', daily: 'Daily', deep: 'Deep',
    beginner: 'Beginner', classic: 'Classic', hiit: 'HIIT',
  },

  config: {
    voice: 'Voice', beeps: 'Beeps', haptics: 'Haptics', music: 'Music',
    volume: 'Volume', advanced: 'Advanced', start: 'Start',
    hint: 'Screen stays awake · saved on this device',
    share: 'Share workout', copied: 'Link copied ✓',
    presetsAria: 'Presets', workoutModeAria: 'Workout mode',
    increase: (label: string) => `increase ${label}`,
    decrease: (label: string) => `decrease ${label}`,
  },

  summary: {
    stretch: (stretches: number, sets: number, hold: number, total: string): ReactNode => (
      <>
        <b>{stretches}</b> stretch{stretches > 1 ? 'es' : ''} × <b>{sets}</b> set{sets > 1 ? 's' : ''} ·{' '}
        <b>{hold}s</b> per side · about <b>{total}</b>
      </>
    ),
    boxe: (rounds: number, work: string, rest: string, combos: number, total: string): ReactNode => (
      <>
        <b>{rounds}</b> rounds · <b>{work}</b> work · <b>{rest}</b> rest
        {combos > 0 ? ` · combos every ${combos}s` : ''} · about <b>{total}</b>
      </>
    ),
  },

  run: {
    now: 'now', endsAbout: 'ends ~', live: 'LIVE', upNext: 'UP NEXT',
    session: 'Session', complete: 'complete', elapsed: 'elapsed', remaining: 'remaining',
    timeSplit: 'Time split',
    focus: 'Focus mode',
    pause: '⏸ Pause', resume: '▶ Resume', skip: '⏭ Skip', stop: '⏹ Stop',
    stretchChip: (n: number, total: number) => `Stretch ${n} / ${total}`,
    setChip: (n: number, total: number) => `Set ${n} / ${total}`,
    roundChip: (n: number, total: number) => `Round ${n} / ${total}`,
    // ring labels
    hold: 'HOLD', switch: 'SWITCH', rest: 'REST', work: 'WORK', boxe: 'BOXE',
    left: 'LEFT', right: 'RIGHT', ready: 'READY', getReady: 'GET READY',
    holdsTitle: 'Holds', roundsTitle: 'Rounds',
    legendHold: 'Hold', legendWork: 'Work', legendRecover: 'Recover', legendRest: 'Rest',
    next: {
      holdSide: (side: 'left' | 'right') => `${side} side · stretch`,
      nextStretch: 'Next stretch', switchSides: 'Switch sides', rest: 'Rest',
      round: (n: number) => `Round ${n} · box`,
      getReady: 'Get ready', finish: 'Finish',
    },
  },

  done: {
    title: 'All done!', back: 'Back to setup',
    stretch: (holds: number, stretches: number, mins: number) =>
      `${holds} holds across ${stretches} stretch${stretches > 1 ? 'es' : ''} · about ${mins} min`,
    boxe: (rounds: number, work: string, mins: number) =>
      `${rounds} rounds · ${work} work · about ${mins} min`,
  },
};

export type Messages = typeof en;
