import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { haptic } from '../audio';
import { pause, resume, skip, stop } from '../engine';
import { t } from '../i18n';
import { MODES, type Mode } from '../modes';
import { fmtClock, fmtDur, useApp, useSettings, type Phase } from '../store';
import { SOUND_CHIPS, SoundChip, VolumeSlider } from './ConfigScreen';

// prepare is mode-agnostic, so its labels live outside the MODES table
const ringLabels = (mode: Mode, phase: Phase) =>
  phase.type === 'prepare'
    ? { badge: t.run.ready, label: t.run.getReady }
    : { badge: mode.sideBadge(phase), label: mode.phaseLabel(phase) };

function Topbar() {
  const [now, setNow] = useState(() => Date.now());
  const remaining = useApp((s) => s.totalTime - s.elapsed);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="topbar">
      <div className="topbar-item">
        <span className="topbar-val">{fmtClock(now)}</span>
        <span className="topbar-label">{t.run.now}</span>
      </div>
      <div className="topbar-live"><span className="dot" />{t.run.live}</div>
      <div className="topbar-item right">
        <span className="topbar-val">{fmtClock(now + remaining * 1000)}</span>
        <span className="topbar-label">{t.run.endsAbout}</span>
      </div>
    </div>
  );
}

// tap anywhere on the ring = pause/resume — a boxer with wrapped hands
// can't hit a small button; the Pause control stays for keyboard/AT users
function toggleTapPause() {
  const s = useApp.getState();
  if (!s.running) return;
  if (s.paused) resume(); else pause();
  haptic(30);
}

function Ring() {
  const progress = useApp((s) => s.progress);
  const display = useApp((s) => s.display);
  const phase = useApp((s) => s.plan[Math.min(s.idx, s.plan.length - 1)]);
  const mode = useApp((s) => MODES[s.mode]);
  if (!phase) return null;
  const { badge, label } = ringLabels(mode, phase);
  const badgeColor = phase.type === 'rest' ? 'var(--rest)'
    : phase.type === 'recover' ? 'var(--muted)' : 'var(--accent)';
  return (
    <div className="ring-wrap" onClick={toggleTapPause}>
      <svg viewBox="0 0 320 320" className="ring" aria-hidden="true">
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff7a7a" />
            <stop offset="100%" stopColor="#ff3d6e" />
          </linearGradient>
        </defs>
        <circle className="ring-bg" cx="160" cy="160" r="140" />
        <circle
          className="ring-fg" cx="160" cy="160" r="140" pathLength={100}
          style={{ strokeDasharray: 100, strokeDashoffset: 100 * progress }}
        />
        {/* glow tracks the fg dash — a full-circle glow left a muddy residue
            arc over the drained part of the ring */}
        <circle
          className="ring-glow" cx="160" cy="160" r="140" pathLength={100}
          style={{ strokeDasharray: 100, strokeDashoffset: 100 * progress }}
        />
      </svg>
      <div className="ring-center">
        <span className="side-badge" style={{ color: badgeColor }}>{badge}</span>
        {/* key remounts the digit so the tick-pop animation replays every second */}
        <span key={display} className="time tick">{display}</span>
        <span className="phase-label">{label}</span>
      </div>
    </div>
  );
}

// screen readers hear phase transitions, not the ticking countdown
function PhaseAnnouncer() {
  const announced = useApp((s) => {
    const phase = s.plan[Math.min(s.idx, s.plan.length - 1)];
    if (!s.running || !phase) return '';
    const { badge, label } = ringLabels(MODES[s.mode], phase);
    return badge === label ? label : `${label} — ${badge}`;
  });
  return <div className="sr-only" role="status" aria-live="polite">{announced}</div>;
}

function NextCard() {
  const next = useApp((s) => s.plan[s.idx + 1]);
  const mode = useApp((s) => MODES[s.mode]);
  const c = !next ? { icon: '🎉', text: t.run.next.finish }
    : next.type === 'prepare' ? { icon: '🚦', text: t.run.next.getReady }
    : mode.nextCard(next);
  return (
    <div className="next-card glass">
      <span className="next-kicker">{t.run.upNext}</span>
      <span className="next-body">
        <span className="next-icon" aria-hidden="true">{c.icon}</span>
        <span className="next-text">{c.text}</span>
      </span>
      <span className="next-dur">{next ? `${next.duration}s` : ''}</span>
    </div>
  );
}

function RepGrid({ done, current }: { done: number; current: number }) {
  const primaryTotal = useApp((s) => s.primaryTotal);
  const settings = useSettings(); // grid() returns a fresh object — don't select it
  const layout = MODES[settings.mode].grid(settings);

  const dot = (i: number) => (
    <span key={i} className={`rep-dot${i < done ? ' done' : ''}${i === current ? ' current' : ''}`} />
  );

  return (
    <div className="rep-grid">
      {layout
        ? Array.from({ length: layout.groups }, (_, g) => (
            <div key={g} className="rep-group">
              <span className="rep-group-label">{g + 1}</span>
              <div className="rep-dots">
                {Array.from({ length: layout.perGroup }, (_, r) => dot(g * layout.perGroup + r))}
              </div>
            </div>
          ))
        : (
          <div className="rep-group">
            <div className="rep-dots">{Array.from({ length: primaryTotal }, (_, i) => dot(i))}</div>
          </div>
        )}
    </div>
  );
}

function DistBar() {
  const plan = useApp((s) => s.plan);
  const mode = useApp((s) => MODES[s.mode]);
  let prim = 0, rec = 0, rest = 0;
  for (const p of plan) {
    if (p.type === mode.primaryType) prim += p.duration;
    else if (p.type === 'recover') rec += p.duration;
    else if (p.type === 'rest' || p.type === 'prepare') rest += p.duration;
  }
  const total = prim + rec + rest || 1;
  return (
    <section className="glass dash-card dist-card">
      <div className="card-head"><span className="card-title">{t.run.timeSplit}</span></div>
      <div className="dist-bar">
        <span className="dist-seg hold" style={{ width: `${(prim / total) * 100}%` }} />
        <span className="dist-seg recover" style={{ width: `${(rec / total) * 100}%` }} />
        <span className="dist-seg rest" style={{ width: `${(rest / total) * 100}%` }} />
      </div>
      <div className="dist-legend">
        <span className="lg hold"><i />{mode.distPrimaryLabel} <b>{fmtDur(prim)}</b></span>
        {/* id kept: CSS hides this legend in boxe mode */}
        <span className="lg recover" id="lg-recover-wrap"><i />{t.run.legendRecover} <b>{fmtDur(rec)}</b></span>
        <span className="lg rest"><i />{t.run.legendRest} <b>{fmtDur(rest)}</b></span>
      </div>
    </section>
  );
}

// spacebar toggles pause/resume when not on a control (desktop usability)
function useSpacePause() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const s = useApp.getState();
      if (!s.running) return;
      if ((e.target as HTMLElement | null)?.closest('button, input, a, summary')) return;
      e.preventDefault();
      if (s.paused) resume(); else pause();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function RunScreen({ active }: { active: boolean }) {
  const s = useApp(useShallow((st) => ({
    mode: st.mode, plan: st.plan, idx: st.idx, elapsed: st.elapsed,
    totalTime: st.totalTime, primaryTotal: st.primaryTotal,
    paused: st.paused, music: st.music,
  })));
  const settings = useSettings();
  useSpacePause();
  const mode = MODES[s.mode];
  if (!active || !s.plan.length) return <main id="run-screen" className="screen" aria-hidden="true" />;

  const phase = s.plan[Math.min(s.idx, s.plan.length - 1)];
  const doneCount = s.plan.slice(0, s.idx).filter((p) => p.type === mode.primaryType).length;
  const current = s.plan[s.idx]?.type === mode.primaryType ? doneCount : -1;
  const pct = s.totalTime > 0 ? s.elapsed / s.totalTime : 0;
  const chips = phase.type === 'prepare' ? null : mode.positionChips(phase, settings);

  return (
    <main id="run-screen" className="screen is-active">
      <Topbar />

      {/* position only — the internal "Phase x/y" counter meant nothing to a human */}
      <div className="run-header">
        {chips?.stretch && <span id="stretch-label" className="chip">{chips.stretch}</span>}
        {chips && <span className="chip">{chips.round}</span>}
      </div>

      <Ring />
      <PhaseAnnouncer />
      <NextCard />

      <section className="dash-row">
        <div className="glass dash-card overall-card">
          <span className="card-title">{t.run.session}</span>
          <div className="overall-body">
            <svg viewBox="0 0 120 120" className="mini-donut" aria-hidden="true">
              <circle className="md-bg" cx="60" cy="60" r="52" pathLength={100} />
              <circle
                className="md-fg" cx="60" cy="60" r="52" pathLength={100}
                style={{ strokeDashoffset: (100 * (1 - pct)).toFixed(2) }}
              />
            </svg>
            <div className="overall-center">
              <span className="overall-pct">{Math.round(pct * 100)}%</span>
              <span className="overall-sub">{t.run.complete}</span>
            </div>
          </div>
        </div>

        <div className="glass dash-card stat-stack">
          <div className="stat">
            <span className="stat-val">{fmtDur(s.elapsed)}</span>
            <span className="stat-label">{t.run.elapsed}</span>
          </div>
          <div className="stat">
            <span className="stat-val">{fmtDur(s.totalTime - s.elapsed)}</span>
            <span className="stat-label">{t.run.remaining}</span>
          </div>
          {/* the primary count lives in one place: the progress-dots card below */}
        </div>
      </section>

      <section className="glass dash-card reps-card">
        <div className="card-head">
          <span className="card-title">{mode.repTitle}</span>
          <span className="card-meta">{doneCount} / {s.primaryTotal}</span>
        </div>
        <RepGrid done={doneCount} current={current} />
      </section>

      <DistBar />

      {/* the audio layers stay adjustable mid-workout — no trip to setup */}
      <div className="run-vol glass run-audio">
        <div className="sound-chips">
          {SOUND_CHIPS.map((c) => <SoundChip key={c.k} {...c} />)}
        </div>
        {s.music && (
          <div className="vol-row">
            <span className="run-vol-icon" aria-hidden="true">🔊</span>
            <VolumeSlider id="run-vol-slider" />
          </div>
        )}
      </div>

      <div className="controls">
        <button className="ctrl" onClick={() => (s.paused ? resume() : pause())}>
          <span>{s.paused ? t.run.resume : t.run.pause}</span>
        </button>
        <button className="ctrl" onClick={skip}><span>{t.run.skip}</span></button>
        <button className="ctrl danger" onClick={stop}><span>{t.run.stop}</span></button>
        <button
          className={`ctrl ctrl-icon${settings.focus ? ' is-on' : ''}`}
          aria-pressed={settings.focus} aria-label={t.run.focus}
          onClick={() => useApp.getState().set({ focus: !settings.focus })}
        ><span aria-hidden="true">⛶</span></button>
      </div>
    </main>
  );
}
