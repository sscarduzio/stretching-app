// Timer engine — drift-free performance.now() loop, kept outside React.
// Mutable per-frame state lives in module locals; anything the UI renders is
// pushed into the zustand store (ring progress at 60fps, dashboard throttled).
import { beep, clapper, cutVoice, ensureAudio, haptic, loadAtom, pauseMusic, playAtom, playSequence, restartMusic, sequenceDuration, startMusic, stopMusic } from './audio';
import { COMBOS, MODES, PREPARE_FIELD } from './modes';
import { useApp, type Phase } from './store';

const COUNTDOWN_SECS = 3;      // spoken/beeped "3, 2, 1"
const COUNTDOWN_WINDOW = 3.05; // enter window slightly early for frame jitter
const DASH_THROTTLE_MS = 240;  // dashboard ~4fps; ring/countdown stay 60fps
const COMBO_FIRST_AT = 5;      // first combo this many seconds into a round
const COMBO_LAST_MARGIN = 6;   // no combo in the last N seconds (protect countdown)

const HAPTICS: Record<string, number | number[]> = {
  prepare: 80, hold: 220, work: 300, recover: [110, 60, 110], rest: [160, 80, 160],
};

let raf = 0;
let phaseStart = 0;
let pauseAt = 0;
let lastCount = -1;
let lastDash = 0;
let warned = false; // 10s clapper fired for the current phase
let comboPlan: { at: number; name: string }[] = [];
let comboPtr = 0;

const st = () => useApp.getState();
const mode = () => MODES[st().mode];

/* ---------- wake lock ---------- */
let wakeLock: WakeLockSentinel | null = null;
async function requestWakeLock() {
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch { /* denied */ }
}
function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  const s = st();
  if (s.running && !s.paused && document.visibilityState === 'visible') void requestWakeLock();
});

/* ---------- derived helpers ---------- */
function elapsedTotal(): number {
  const s = st();
  let done = 0;
  for (let k = 0; k < s.idx; k++) done += s.plan[k].duration;
  const p = s.plan[s.idx];
  if (p) {
    const now = s.paused ? pauseAt : performance.now();
    // clamp low: phaseStart can sit in the future during a voice lead-in
    done += Math.min(Math.max(0, (now - phaseStart) / 1000), p.duration);
  }
  return done;
}

/* ---------- phases ---------- */
function startPhase() {
  const s = st();
  const p = s.plan[s.idx];
  if (!p) return finish();
  const m = mode();
  phaseStart = performance.now();
  // skipping while paused: anchor the pause to the fresh phase, or resume()
  // would shift phaseStart by the whole pre-skip pause duration
  if (s.paused) pauseAt = phaseStart;
  lastCount = -1; warned = false;
  comboPlan = []; comboPtr = 0;

  if (s.voice) {
    if (p.type === m.primaryType) {
      // "Round 1, left side… stretch!" — the phase clock starts when the
      // cue ends, like a real coach. Shift phaseStart by the spoken length.
      const cue = m.startCue(p);
      void playSequence(cue, m.voiceGap);
      const lead = sequenceDuration(cue, m.voiceGap);
      if (lead) phaseStart += lead * 1000;
    } else if (p.type === 'recover') m.speakRecover(p);
    else if (p.type === 'rest') m.speakRest(p);
  }
  haptic(HAPTICS[p.type] ?? 0);

  // boxe: track restarts with each round, silence between rounds
  // (never start audio while paused — resume() picks it back up)
  if (m.musicFollowsRounds && s.music) {
    if (p.type === m.primaryType && !s.paused) restartMusic();
    else pauseMusic();
  }

  // schedule combo calls during a boxing work round
  if (p.type === 'work' && s.boxCombos > 0 && s.voice) {
    const lastAllowed = p.duration - COMBO_LAST_MARGIN;
    let t = COMBO_FIRST_AT, ci = Math.floor(Math.random() * COMBOS.length);
    while (t < lastAllowed) {
      comboPlan.push({ at: t, name: COMBOS[ci % COMBOS.length] });
      ci++; t += s.boxCombos;
    }
  }

  s.set({ display: p.duration, progress: 0, elapsed: elapsedTotal() });
  raf = requestAnimationFrame(tick);
}

function nextPhase() {
  cancelAnimationFrame(raf);
  const s = st();
  if (s.idx + 1 >= s.plan.length) {
    s.set({ idx: s.plan.length });
    return finish();
  }
  s.set({ idx: s.idx + 1 });
  startPhase();
}

function tick() {
  const s = st();
  if (!s.running || s.paused) return;
  const p = s.plan[s.idx];
  if (!p) return finish();
  const m = mode();
  // clamped at 0: during a voice lead-in the clock holds at full duration
  const elapsed = Math.max(0, (performance.now() - phaseStart) / 1000);
  const remaining = p.duration - elapsed;
  const display = Math.max(0, Math.ceil(remaining));

  const patch: Record<string, number> = { progress: Math.min(1, elapsed / p.duration) };
  if (display !== s.display) patch.display = display;
  const nowMs = performance.now();
  if (nowMs - lastDash > DASH_THROTTLE_MS) { lastDash = nowMs; patch.elapsed = elapsedTotal(); }
  s.set(patch);

  // combo calls during work (box mode)
  if (p.type === 'work' && comboPtr < comboPlan.length && elapsed >= comboPlan[comboPtr].at) {
    if (s.voice) void playAtom(comboPlan[comboPtr].name);
    comboPtr++;
  }

  // boxing-style 10-second warning on work rounds (clack-clack-clack)
  if (p.type === 'work' && !warned && p.duration > 15 && remaining <= 10.05) {
    warned = true;
    clapper();
    haptic([60, 60, 60]);
  }

  // 3-2-1 countdown (beeps always; voice only on primary phases)
  if (remaining > 0 && remaining <= COUNTDOWN_WINDOW) {
    const count = Math.ceil(remaining);
    if (count !== lastCount && count >= 1 && count <= COUNTDOWN_SECS) {
      lastCount = count;
      beep(count === 1 ? 1320 : 880, 0.16);
      if (p.type === m.primaryType && s.voice) m.speakCount(count);
      haptic(40);
    }
  }
  if (remaining <= 0) { nextPhase(); return; }
  raf = requestAnimationFrame(tick);
}

/* ---------- lifecycle ---------- */
function buildPlan(): Phase[] {
  return mode().buildPlan(st());
}

export function start() {
  const m = mode();
  // typed values may sit outside bounds until blur — clamp before planning
  st().set(Object.fromEntries([...m.fields, ...m.advanced, PREPARE_FIELD].map((f) => {
    const v = st()[f.key] as number;
    return [f.key, Math.min(f.max, Math.max(f.min, Number.isFinite(v) ? v : f.min))];
  })));
  const s = st();
  const plan = buildPlan();
  if (s.prepare > 0) plan.unshift({ type: 'prepare', duration: s.prepare });
  s.set({
    plan, idx: 0,
    running: true, paused: false, finished: false,
    totalTime: plan.reduce((sum, p) => sum + p.duration, 0),
    primaryTotal: m.primaryCount(s),
    elapsed: 0, progress: 0,
  });
  lastDash = 0;
  ensureAudio();
  m.preload(s);
  if (m.key === 'boxe') void loadAtom('box_clapper', 'audio/').catch(() => {});
  if (!m.musicFollowsRounds) startMusic(); // round-scoped music starts per phase
  void requestWakeLock();
  startPhase();
}

export function pause() {
  const s = st();
  if (!s.running || s.paused) return;
  pauseAt = performance.now();
  cancelAnimationFrame(raf);
  pauseMusic();
  s.set({ paused: true });
  releaseWakeLock();
}

export function resume() {
  const s = st();
  if (!s.paused) return;
  phaseStart += performance.now() - pauseAt;
  s.set({ paused: false });
  // music resumes from where it paused (round-scoped only during work)
  if (s.music) {
    const m = mode();
    const p = s.plan[s.idx];
    if (!m.musicFollowsRounds || p?.type === m.primaryType) startMusic();
  }
  void requestWakeLock();
  raf = requestAnimationFrame(tick);
}

// the Music chip works mid-session: stop/start the track live
useApp.subscribe((s, prev) => {
  if (s.music === prev.music || !s.running) return;
  if (!s.music) { pauseMusic(); return; }
  if (s.paused) return;
  const m = MODES[s.mode];
  if (!m.musicFollowsRounds || s.plan[s.idx]?.type === m.primaryType) startMusic();
});

export function skip() {
  if (st().running) nextPhase();
}

export function stop() {
  cancelAnimationFrame(raf);
  cutVoice();
  stopMusic();
  releaseWakeLock();
  st().set({ running: false, paused: false, finished: false });
}

function finish() {
  const s = st();
  cancelAnimationFrame(raf);
  if (s.voice) mode().speakDone();
  haptic([300, 80, 300, 80, 500]);
  stopMusic();
  releaseWakeLock();
  s.set({ running: false, paused: false, finished: true, elapsed: s.totalTime, progress: 1 });
}
