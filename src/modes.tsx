// MODES table — all per-mode behavior/data. Adding a third workout mode is an
// entry here (plan builder, voice atoms, labels, config fields) — no scattered
// mode conditionals anywhere else.
import type { ReactNode } from 'react';
import { loadAtom, playAtom, playSequence } from './audio';
import { fmtDur, type ModeKey, type Phase, type PhaseType, type Settings } from './store';

export const COMBOS = [
  'box_combo_12', 'box_combo_123', 'box_combo_112', 'box_combo_232',
  'box_combo_32', 'box_combo_1232', 'box_combo_jabbody', 'box_combo_slip',
  'box_combo_roll', 'box_combo_djab', 'box_combo_hook', 'box_combo_12h',
];

export interface FieldDef {
  key: keyof Settings;
  label: string;
  sub: string;
  min: number;
  max: number;
  step: number;
}

export interface Mode {
  key: ModeKey;
  brand: { logo: string; title: string; subtitle: string };
  themeColor: string;
  primaryType: PhaseType;
  voiceGap: number;
  repTitle: string;
  primaryLabel: string;
  distPrimaryLabel: string;
  showStretchChip: boolean;
  fields: FieldDef[];
  buildPlan(cfg: Settings): Phase[];
  primaryCount(cfg: Settings): number;
  preload(cfg: Settings): void;
  speakStart(p: Phase): void;
  speakRecover(p: Phase): void;
  speakRest(p: Phase): void;
  speakCount(n: number): void;
  speakDone(): void;
  sideBadge(p: Phase): string;
  phaseLabel(p: Phase): string;
  positionChips(p: Phase, cfg: Settings): { stretch?: string; round: string };
  nextCard(next: Phase): { icon: string; text: string };
  summary(cfg: Settings): ReactNode;
  doneText(cfg: Settings, totalTime: number): string;
}

function buildStretchPlan(cfg: Settings): Phase[] {
  const plan: Phase[] = [];
  const totalHolds = cfg.stretches * cfg.reps;
  let holdIndex = 0;
  for (let s = 1; s <= cfg.stretches; s++) {
    for (let r = 1; r <= cfg.reps; r++) {
      holdIndex++;
      const side = r % 2 === 1 ? 'left' : 'right';
      plan.push({ type: 'hold', stretch: s, round: r, side, duration: cfg.hold });
      if (holdIndex < totalHolds) {
        const nextStretch = r === cfg.reps ? s + 1 : s;
        plan.push({ type: 'recover', stretch: s, round: r, duration: cfg.recover, nextStretch });
        if (cfg.rest > 0) plan.push({ type: 'rest', stretch: s, round: r, duration: cfg.rest, nextStretch });
      }
    }
  }
  return plan;
}

function buildBoxPlan(cfg: Settings): Phase[] {
  const plan: Phase[] = [];
  for (let r = 1; r <= cfg.boxRounds; r++) {
    plan.push({ type: 'work', round: r, duration: cfg.boxWork });
    if (r < cfg.boxRounds && cfg.boxRest > 0)
      plan.push({ type: 'rest', round: r, duration: cfg.boxRest, nextRound: r + 1 });
  }
  return plan;
}

export const MODES: Record<ModeKey, Mode> = {
  stretch: {
    key: 'stretch',
    brand: { logo: '🧘', title: 'Stretch', subtitle: 'Hold · recover · alternate sides' },
    themeColor: '#05060f',
    primaryType: 'hold',
    voiceGap: 0.14,
    repTitle: 'Repetitions',
    primaryLabel: 'holds',
    distPrimaryLabel: 'Hold',
    showStretchChip: true,
    fields: [
      { key: 'hold', label: 'Hold', sub: 'seconds', min: 5, max: 300, step: 5 },
      { key: 'recover', label: 'Recovery', sub: 'switch sides', min: 1, max: 60, step: 1 },
      { key: 'rest', label: 'Rest between sides', sub: '0 = off', min: 0, max: 120, step: 5 },
      { key: 'stretches', label: 'Stretches', sub: 'exercises', min: 1, max: 12, step: 1 },
      { key: 'reps', label: 'Rounds', sub: 'per stretch', min: 1, max: 20, step: 1 },
    ],
    buildPlan: buildStretchPlan,
    primaryCount: (cfg) => cfg.stretches * cfg.reps,
    preload(cfg) {
      const n = new Set(['done', 'relax_switch', 'relax_next', 'rest',
        'left_stretch', 'right_stretch', 'count_1', 'count_2', 'count_3']);
      for (let r = 1; r <= cfg.reps; r++) n.add('round_' + r);
      for (let s = 2; s <= cfg.stretches; s++) n.add('rest_stretch_' + s);
      n.forEach((x) => loadAtom(x).catch(() => {}));
    },
    speakStart: (p) => playSequence(['round_' + p.round, p.side + '_stretch'], 0.14),
    speakRecover: (p) => playAtom(p.nextStretch! > p.stretch! ? 'relax_next' : 'relax_switch'),
    speakRest: (p) => playAtom(p.nextStretch! > p.stretch! ? 'rest_stretch_' + p.nextStretch : 'rest'),
    speakCount: (n) => playAtom('count_' + n),
    speakDone: () => playAtom('done'),
    sideBadge: (p) => (p.type === 'hold' ? p.side!.toUpperCase() : p.type === 'recover' ? 'SWITCH' : 'REST'),
    phaseLabel: (p) => (p.type === 'hold' ? 'STRETCH' : p.type === 'recover' ? 'SWITCH' : 'REST'),
    positionChips: (p, cfg) => ({
      stretch: `Stretch ${p.stretch} / ${cfg.stretches}`,
      round: `Round ${p.round} / ${cfg.reps}`,
    }),
    nextCard(next) {
      if (next.type === 'hold') return { icon: '🤸', text: `${next.side} side · stretch` };
      if (next.type === 'recover') return { icon: '🔄', text: next.nextStretch! > next.stretch! ? 'Next stretch' : 'Switch sides' };
      return { icon: '💨', text: 'Rest' };
    },
    summary(cfg) {
      const holds = cfg.stretches * cfg.reps;
      const rec = Math.max(0, holds - 1);
      const restN = cfg.rest > 0 ? rec : 0;
      const total = holds * cfg.hold + rec * cfg.recover + restN * cfg.rest;
      return (
        <>
          <b>{holds}</b> holds · <b>{cfg.stretches}</b> stretch{cfg.stretches > 1 ? 'es' : ''} ·{' '}
          <b>{cfg.reps}</b> round{cfg.reps > 1 ? 's' : ''} each · about <b>{fmtDur(total)}</b>
        </>
      );
    },
    doneText(cfg, totalTime) {
      const holds = cfg.stretches * cfg.reps;
      return `${holds} holds across ${cfg.stretches} stretch${cfg.stretches > 1 ? 'es' : ''} · about ${Math.round(totalTime / 60)} min`;
    },
  },

  box: {
    key: 'box',
    brand: { logo: '🥊', title: 'Boxe', subtitle: 'Shadow boxe · combos · rounds' },
    themeColor: '#100604',
    primaryType: 'work',
    voiceGap: 0.10,
    repTitle: 'Rounds',
    primaryLabel: 'rounds',
    distPrimaryLabel: 'Work',
    showStretchChip: false,
    fields: [
      { key: 'boxRounds', label: 'Rounds', sub: 'boxing', min: 1, max: 12, step: 1 },
      { key: 'boxWork', label: 'Work', sub: 'seconds / round', min: 10, max: 300, step: 5 },
      { key: 'boxRest', label: 'Rest', sub: 'between rounds · 0 = off', min: 0, max: 120, step: 5 },
      { key: 'boxCombos', label: 'Combos', sub: 'seconds apart · 0 = off', min: 0, max: 30, step: 1 },
    ],
    buildPlan: buildBoxPlan,
    primaryCount: (cfg) => cfg.boxRounds,
    preload(cfg) {
      const n = new Set(['box_work', 'box_rest', 'box_done',
        'box_count_1', 'box_count_2', 'box_count_3']);
      for (let r = 1; r <= cfg.boxRounds; r++) n.add('box_round_' + r);
      if (cfg.boxCombos > 0) COMBOS.forEach((c) => n.add(c));
      n.forEach((x) => loadAtom(x).catch(() => {}));
    },
    speakStart: (p) => playSequence(['box_round_' + p.round, 'box_work'], 0.10),
    speakRecover: () => {},
    speakRest: () => playAtom('box_rest'),
    speakCount: (n) => playAtom('box_count_' + n),
    speakDone: () => playAtom('box_done'),
    sideBadge: (p) => (p.type === 'work' ? 'BOXE' : 'REST'),
    phaseLabel: (p) => (p.type === 'work' ? 'WORK' : 'REST'),
    positionChips: (p, cfg) => ({ round: `Round ${p.round} / ${cfg.boxRounds}` }),
    nextCard(next) {
      if (next.type === 'work') return { icon: '🥊', text: `Round ${next.round} · box` };
      return { icon: '💧', text: 'Rest' };
    },
    summary(cfg) {
      const restN = cfg.boxRest > 0 ? Math.max(0, cfg.boxRounds - 1) : 0;
      const total = cfg.boxRounds * cfg.boxWork + restN * cfg.boxRest;
      return (
        <>
          <b>{cfg.boxRounds}</b> rounds · <b>{cfg.boxWork}s</b> work · <b>{cfg.boxRest}s</b> rest
          {cfg.boxCombos > 0 ? ` · combos every ${cfg.boxCombos}s` : ''} · about <b>{fmtDur(total)}</b>
        </>
      );
    },
    doneText(cfg, totalTime) {
      return `${cfg.boxRounds} rounds · ${cfg.boxWork}s work · about ${Math.round(totalTime / 60)} min`;
    },
  },
};
