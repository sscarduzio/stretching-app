// MODES table — all per-mode behavior/data. Adding a third workout mode is an
// entry here (plan builder, voice atoms, labels, config fields) — no scattered
// mode conditionals anywhere else.
import type { ReactNode } from 'react';
import { loadAtom, playAtom } from './audio';
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

// shared "get ready" lead-in, rendered in each mode's Advanced section
export const PREPARE_FIELD: FieldDef = {
  key: 'prepare', label: 'Get ready', sub: 'lead-in · 0 = off', min: 0, max: 60, step: 5,
};

export interface Preset {
  name: string;
  sub: string;
  values: Partial<Settings>;
}

export interface Mode {
  key: ModeKey;
  brand: { logo: string; title: string; subtitle: string };
  themeColor: string;
  primaryType: PhaseType;
  voiceGap: number;
  repTitle: string;
  distPrimaryLabel: string;
  showStretchChip: boolean;
  fields: FieldDef[];
  advanced: FieldDef[];
  presets: Preset[];
  buildPlan(cfg: Settings): Phase[];
  primaryCount(cfg: Settings): number;
  preload(cfg: Settings): void;
  /** voice atoms announcing a primary phase; the phase clock starts when the cue ends */
  startCue(p: Phase): string[];
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

export const planDuration = (plan: Phase[]) => plan.reduce((s, p) => s + p.duration, 0);

// 1 set = hold left → switch → hold right; switch between sets;
// rest (or a switch, if rest is off) only when moving to the next stretch.
function buildStretchPlan(cfg: Settings): Phase[] {
  const plan: Phase[] = [];
  for (let s = 1; s <= cfg.stretches; s++) {
    for (let set = 1; set <= cfg.sets; set++) {
      plan.push({ type: 'hold', stretch: s, round: set, side: 'left', duration: cfg.hold });
      plan.push({ type: 'recover', stretch: s, round: set, duration: cfg.recover, nextStretch: s });
      plan.push({ type: 'hold', stretch: s, round: set, side: 'right', duration: cfg.hold });
      if (set < cfg.sets)
        plan.push({ type: 'recover', stretch: s, round: set, duration: cfg.recover, nextStretch: s });
    }
    if (s < cfg.stretches) {
      if (cfg.rest > 0) plan.push({ type: 'rest', stretch: s, round: cfg.sets, duration: cfg.rest, nextStretch: s + 1 });
      else plan.push({ type: 'recover', stretch: s, round: cfg.sets, duration: cfg.recover, nextStretch: s + 1 });
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
    repTitle: 'Holds',
    distPrimaryLabel: 'Hold',
    showStretchChip: true,
    fields: [
      { key: 'hold', label: 'Hold', sub: 'seconds per side', min: 5, max: 300, step: 5 },
      { key: 'stretches', label: 'Stretches', sub: 'exercises', min: 1, max: 12, step: 1 },
      { key: 'sets', label: 'Sets', sub: 'left + right each', min: 1, max: 10, step: 1 },
    ],
    advanced: [
      { key: 'recover', label: 'Side switch', sub: 'seconds', min: 1, max: 60, step: 1 },
      { key: 'rest', label: 'Rest between stretches', sub: '0 = off', min: 0, max: 120, step: 5 },
    ],
    presets: [
      { name: 'Quick', sub: '20s · 2×2', values: { hold: 20, stretches: 2, sets: 2 } },
      { name: 'Daily', sub: '30s · 4×2', values: { hold: 30, stretches: 4, sets: 2 } },
      { name: 'Deep', sub: '45s · 6×3', values: { hold: 45, stretches: 6, sets: 3 } },
    ],
    buildPlan: buildStretchPlan,
    primaryCount: (cfg) => cfg.stretches * cfg.sets * 2,
    preload(cfg) {
      const n = new Set(['done', 'relax_switch', 'relax_next', 'rest',
        'left_stretch', 'right_stretch', 'count_1', 'count_2', 'count_3']);
      for (let r = 1; r <= cfg.sets; r++) n.add('round_' + r);
      for (let s = 2; s <= cfg.stretches; s++) n.add('rest_stretch_' + s);
      n.forEach((x) => loadAtom(x).catch(() => {}));
    },
    startCue: (p) => ['round_' + p.round, p.side + '_stretch'],
    speakRecover: (p) => playAtom(p.nextStretch! > p.stretch! ? 'relax_next' : 'relax_switch'),
    speakRest: (p) => playAtom(p.nextStretch! > p.stretch! ? 'rest_stretch_' + p.nextStretch : 'rest'),
    speakCount: (n) => playAtom('count_' + n),
    speakDone: () => playAtom('done'),
    sideBadge: (p) => (p.type === 'hold' ? p.side!.toUpperCase() : p.type === 'recover' ? 'SWITCH' : 'REST'),
    phaseLabel: (p) => (p.type === 'hold' ? 'HOLD' : p.type === 'recover' ? 'SWITCH' : 'REST'),
    positionChips: (p, cfg) => ({
      stretch: `Stretch ${p.stretch} / ${cfg.stretches}`,
      round: `Set ${p.round} / ${cfg.sets}`,
    }),
    nextCard(next) {
      if (next.type === 'hold') return { icon: '🤸', text: `${next.side} side · stretch` };
      if (next.type === 'recover') return { icon: '🔄', text: next.nextStretch! > next.stretch! ? 'Next stretch' : 'Switch sides' };
      return { icon: '💨', text: 'Rest' };
    },
    summary(cfg) {
      const total = planDuration(buildStretchPlan(cfg)) + cfg.prepare;
      return (
        <>
          <b>{cfg.stretches}</b> stretch{cfg.stretches > 1 ? 'es' : ''} × <b>{cfg.sets}</b> set{cfg.sets > 1 ? 's' : ''} ·{' '}
          <b>{cfg.hold}s</b> per side · about <b>{fmtDur(total)}</b>
        </>
      );
    },
    doneText(cfg, totalTime) {
      return `${cfg.stretches * cfg.sets * 2} holds across ${cfg.stretches} stretch${cfg.stretches > 1 ? 'es' : ''} · about ${Math.round(totalTime / 60)} min`;
    },
  },

  boxe: {
    key: 'boxe',
    brand: { logo: '🥊', title: 'Boxe', subtitle: 'Shadow boxe · combos · rounds' },
    themeColor: '#100604',
    primaryType: 'work',
    voiceGap: 0.10,
    repTitle: 'Rounds',
    distPrimaryLabel: 'Work',
    showStretchChip: false,
    fields: [
      { key: 'boxRounds', label: 'Rounds', sub: 'boxing', min: 1, max: 12, step: 1 },
      { key: 'boxWork', label: 'Round length', sub: 'seconds', min: 10, max: 300, step: 5 },
      { key: 'boxRest', label: 'Rest', sub: 'between rounds · 0 = off', min: 0, max: 120, step: 5 },
    ],
    advanced: [
      { key: 'boxCombos', label: 'Combo pace', sub: 'seconds apart · 0 = off', min: 0, max: 30, step: 1 },
    ],
    presets: [
      { name: 'Beginner', sub: '4 × 1:00 / 0:30', values: { boxRounds: 4, boxWork: 60, boxRest: 30, boxCombos: 15 } },
      { name: 'Classic', sub: '6 × 3:00 / 1:00', values: { boxRounds: 6, boxWork: 180, boxRest: 60, boxCombos: 10 } },
      { name: 'HIIT', sub: '10 × 0:30 / 0:15', values: { boxRounds: 10, boxWork: 30, boxRest: 15, boxCombos: 7 } },
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
    startCue: (p) => ['box_round_' + p.round, 'box_work'],
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
      const total = planDuration(buildBoxPlan(cfg)) + cfg.prepare;
      return (
        <>
          <b>{cfg.boxRounds}</b> rounds · <b>{fmtDur(cfg.boxWork)}</b> work · <b>{fmtDur(cfg.boxRest)}</b> rest
          {cfg.boxCombos > 0 ? ` · combos every ${cfg.boxCombos}s` : ''} · about <b>{fmtDur(total)}</b>
        </>
      );
    },
    doneText(cfg, totalTime) {
      return `${cfg.boxRounds} rounds · ${fmtDur(cfg.boxWork)} work · about ${Math.round(totalTime / 60)} min`;
    },
  },
};
