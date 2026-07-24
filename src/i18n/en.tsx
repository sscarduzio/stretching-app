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
    plank: { title: 'Plank', subtitle: 'Core holds · exercises · sets' },
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
    plankHold: { label: 'Hold', sub: 'seconds' },
    plankExercises: { label: 'Planks', sub: 'exercises' },
    plankSets: { label: 'Sets', sub: 'per plank' },
    plankRecover: { label: 'Between sets', sub: 'seconds' },
    plankRest: { label: 'Between planks', sub: '0 = off' },
    prepare: { label: 'Get ready', sub: 'lead-in · 0 = off' },
  },

  presets: {
    quick: 'Quick', daily: 'Daily', deep: 'Deep',
    beginner: 'Beginner', classic: 'Classic', hiit: 'HIIT',
    starter: 'Starter', core: 'Classic', iron: 'Iron core',
  },

  config: {
    voice: 'Voice', beeps: 'Beeps', haptics: 'Haptics', music: 'Music',
    volume: 'Volume', advanced: 'Advanced', start: 'Start',
    hint: 'Screen stays awake · saved on this device',
    share: 'Share workout', copied: 'Link copied ✓',
    language: 'Language',
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
    plank: (ex: number, sets: number, hold: number, total: string): ReactNode => (
      <>
        <b>{ex}</b> plank{ex > 1 ? 's' : ''} × <b>{sets}</b> set{sets > 1 ? 's' : ''} ·{' '}
        <b>{hold}s</b> holds · about <b>{total}</b>
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
    plank: 'PLANK', plankChip: (n: number, total: number) => `Plank ${n} / ${total}`,
    holdsTitle: 'Holds', roundsTitle: 'Rounds',
    legendHold: 'Hold', legendWork: 'Work', legendRecover: 'Recover', legendRest: 'Rest',
    next: {
      holdSide: (side: 'left' | 'right') => `${side} side · stretch`,
      nextStretch: 'Next stretch', switchSides: 'Switch sides', rest: 'Rest',
      round: (n: number) => `Round ${n} · box`,
      nextPlank: 'Next plank', plank: (n: number) => `Plank ${n}`,
      getReady: 'Get ready', finish: 'Finish',
    },
  },

  about: {
    button: 'About this app',
    title: 'About',
    what: 'A free interval timer with three souls: calm stretching, shadow boxe, and core planks. It comes with a real coach voice, handy presets, and a live dashboard that keeps count so you don’t have to.',
    who: 'It’s for anyone who stretches or shadow-boxes at home or at the gym. Coaches, you’re covered too: share a whole workout just by sending the URL.',
    why: 'No ads, no accounts, no subscription. It works fully offline once loaded, installs right on your home screen, and the timer only starts counting when the coach finishes talking — like a real trainer would.',
    madeBy: 'Simone Scarduzio on X',
    production: 'Beshu Limited (UK) — beshu.tech',
    close: 'Close',
  },

  done: {
    title: 'All done!', back: 'Back to setup',
    stretch: (holds: number, stretches: number, mins: number) =>
      `${holds} holds across ${stretches} stretch${stretches > 1 ? 'es' : ''} · about ${mins} min`,
    boxe: (rounds: number, work: string, mins: number) =>
      `${rounds} rounds · ${work} work · about ${mins} min`,
    plank: (holds: number, ex: number, mins: number) =>
      `${holds} holds across ${ex} plank${ex > 1 ? 's' : ''} · about ${mins} min`,
  },
};

export type Messages = typeof en;
