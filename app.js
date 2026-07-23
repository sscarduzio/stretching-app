(() => {
  'use strict';

  /* ============================================================
     Stretch Timer — precise performance.now() clock,
     Web Audio beeps, Speech Synthesis cues, haptics, wake lock,
     and a procedural ambient pad for background music.
     ============================================================ */

  const DEFAULTS = { hold: 30, recover: 5, reps: 10, voice: true, beeps: true, vibrate: true, music: false };
  const cfg = { ...DEFAULTS };

  // ---------- State ----------
  const state = {
    running: false,
    paused: false,
    round: 0,
    phase: 'idle',     // 'hold' | 'recover' | 'idle' | 'done'
    side: 'left',
    phaseStart: 0,
    phaseDuration: 0,
    pauseAt: 0,
    raf: 0,
    lastCount: -1,
  };

  // ---------- DOM ----------
  const $ = (s) => document.querySelector(s);
  const cfgScreen = $('#config-screen');
  const runScreen = $('#run-screen');
  const doneOverlay = $('#done-overlay');
  const startBtn = $('#start-btn');
  const pauseBtn = $('#pause-btn');
  const skipBtn = $('#skip-btn');
  const stopBtn = $('#stop-btn');
  const doneReset = $('#done-reset');
  const roundLabel = $('#round-label');
  const timeEl = $('#time');
  const phaseEl = $('#phase-label');
  const sideEl = $('#side-badge');
  const ringFg = $('#ring-fg');

  let CIRC = 0;
  function computeCircumference() {
    const r = parseFloat(ringFg.getAttribute('r'));
    CIRC = 2 * Math.PI * r;
    ringFg.style.strokeDasharray = CIRC;
    ringFg.style.strokeDashoffset = 0;
  }

  // ---------- Audio context (lazy) ----------
  let actx = null;
  function ensureAudio() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  function beep(freq = 880, dur = 0.14) {
    if (!cfg.beeps) return;
    const ctx = ensureAudio();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  function speak(text) {
    if (!cfg.voice || !text) return;
    try {
      if (!speechSynthesis) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.12;
      u.pitch = 1.0;
      speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }

  function haptic(pattern) {
    if (!cfg.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) {}
  }

  // ---------- Procedural ambient music ----------
  let music = null;
  function startMusic() {
    if (music || !cfg.music) return;
    const ctx = ensureAudio();
    const master = ctx.createGain();
    master.gain.value = 0.07;
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.Q.value = 0.8;
    filter.connect(master);

    // Soft A-minor pad: A2, C3, E3, A3
    const freqs = [110, 130.81, 164.81, 220];
    const oscs = freqs.map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'triangle' : 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.22 / freqs.length;
      // gentle detune shimmer
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.027;
      const lg = ctx.createGain();
      lg.gain.value = 3.5;
      lfo.connect(lg).connect(o.detune);
      lfo.start();
      o.connect(g).connect(filter);
      o.start();
      return { o, lfo };
    });

    // slow filter sweep for movement
    const fLfo = ctx.createOscillator();
    fLfo.frequency.value = 0.035;
    const fLfoG = ctx.createGain();
    fLfoG.gain.value = 220;
    fLfo.connect(fLfoG).connect(filter.frequency);
    fLfo.start();

    music = { master, filter, oscs, fLfo };
  }

  function stopMusic() {
    if (!music) return;
    try {
      music.oscs.forEach(({ o, lfo }) => { try { o.stop(); lfo.stop(); } catch (e) {} });
      music.fLfo.stop();
    } catch (e) {}
    music = null;
  }

  // ---------- Wake lock ----------
  let wakeLock = null;
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {}
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (state.running && !state.paused && document.visibilityState === 'visible') requestWakeLock();
  });

  // ---------- Phase management ----------
  function setPhaseBodyClass(phase) {
    document.body.classList.remove('phase-hold', 'phase-recover');
    document.body.classList.add(`phase-${phase}`);
  }

  function startPhase(phase) {
    state.phase = phase;
    state.phaseStart = performance.now();
    state.phaseDuration = phase === 'hold' ? cfg.hold : cfg.recover;
    state.lastCount = -1;
    setPhaseBodyClass(phase);

    if (phase === 'hold') {
      state.side = (state.round % 2 === 1) ? 'left' : 'right';
      const sideWord = state.side === 'left' ? 'left' : 'right';
      speak(`Round ${state.round}. ${sideWord} side. Stretch.`);
      haptic(220);
      sideEl.textContent = state.side.toUpperCase();
      sideEl.style.color = 'var(--accent)';
    } else {
      speak('Relax. Switch.');
      haptic([110, 60, 110]);
      sideEl.textContent = 'SWITCH';
      sideEl.style.color = 'var(--muted)';
    }
    phaseEl.textContent = phase === 'hold' ? 'STRETCH' : 'RELAX';
    roundLabel.textContent = `Round ${state.round} / ${cfg.reps}`;
  }

  function nextPhase() {
    if (state.phase === 'hold') {
      startPhase('recover');
      state.raf = requestAnimationFrame(tick);
    } else {
      state.round++;
      if (state.round > cfg.reps) {
        finish();
      } else {
        startPhase('hold');
        state.raf = requestAnimationFrame(tick);
      }
    }
  }

  // ---------- Main loop ----------
  function tick() {
    if (!state.running || state.paused) return;
    const elapsed = (performance.now() - state.phaseStart) / 1000;
    const remaining = state.phaseDuration - elapsed;

    const display = Math.max(0, Math.ceil(remaining));
    timeEl.textContent = display;

    const progress = Math.min(1, elapsed / state.phaseDuration);
    ringFg.style.strokeDashoffset = CIRC * progress; // deplete

    // Countdown cues in the final 3 seconds — fires exactly on the beat
    if (remaining > 0 && remaining <= 3.05) {
      const count = Math.ceil(remaining);
      if (count !== state.lastCount && count >= 1 && count <= 3) {
        state.lastCount = count;
        const freq = count === 1 ? 1320 : 880; // higher tone on "1"
        beep(freq, 0.16);
        // Voice count only during hold (keeps short recover phase uncluttered)
        if (state.phase === 'hold') speak(String(count));
        haptic(40);
      }
    }

    if (remaining <= 0) {
      nextPhase();
      return;
    }
    state.raf = requestAnimationFrame(tick);
  }

  // ---------- Lifecycle ----------
  function start() {
    readConfig();
    ensureAudio();
    computeCircumference();
    state.running = true;
    state.paused = false;
    state.round = 1;
    cfgScreen.hidden = true;
    runScreen.hidden = false;
    doneOverlay.hidden = true;
    if (cfg.music) startMusic();
    requestWakeLock();
    startPhase('hold');
    state.raf = requestAnimationFrame(tick);
  }

  function pause() {
    if (!state.running || state.paused) return;
    state.paused = true;
    state.pauseAt = performance.now();
    cancelAnimationFrame(state.raf);
    pauseBtn.textContent = '▶ Resume';
    releaseWakeLock();
  }

  function resume() {
    if (!state.paused) return;
    state.paused = false;
    // shift phaseStart forward by the paused duration so the clock continues correctly
    state.phaseStart += performance.now() - state.pauseAt;
    pauseBtn.textContent = '⏸ Pause';
    requestWakeLock();
    state.raf = requestAnimationFrame(tick);
  }

  function skip() {
    if (!state.running) return;
    cancelAnimationFrame(state.raf);
    nextPhase();
  }

  function stop() {
    state.running = false;
    state.paused = false;
    cancelAnimationFrame(state.raf);
    stopMusic();
    releaseWakeLock();
    document.body.classList.remove('phase-hold', 'phase-recover');
    runScreen.hidden = true;
    cfgScreen.hidden = false;
    pauseBtn.textContent = '⏸ Pause';
  }

  function finish() {
    state.running = false;
    state.phase = 'done';
    cancelAnimationFrame(state.raf);
    speak('All done. Great job.');
    haptic([300, 80, 300, 80, 500]);
    stopMusic();
    releaseWakeLock();
    document.body.classList.remove('phase-hold', 'phase-recover');
    doneOverlay.hidden = false;
  }

  // ---------- Config read/write ----------
  function readConfig() {
    cfg.hold = clampInt($('#cfg-hold').value, 5, 300, DEFAULTS.hold);
    cfg.recover = clampInt($('#cfg-recover').value, 1, 60, DEFAULTS.recover);
    cfg.reps = clampInt($('#cfg-reps').value, 1, 50, DEFAULTS.reps);
    cfg.voice = $('#opt-voice').checked;
    cfg.beeps = $('#opt-beeps').checked;
    cfg.vibrate = $('#opt-vibrate').checked;
    cfg.music = $('#opt-music').checked;
  }

  function clampInt(v, min, max, fallback) {
    const n = parseInt(v, 10);
    if (isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  // ---------- Steppers ----------
  document.querySelectorAll('.stepper button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.target;
      const step = parseInt(btn.dataset.step, 10);
      const input = document.getElementById(id);
      const min = parseInt(input.min, 10);
      const max = parseInt(input.max, 10);
      const val = clampInt(parseInt(input.value, 10) + step, min, max, parseInt(input.value, 10));
      input.value = val;
      beep(660, 0.05);
    });
  });

  // ---------- Wire up ----------
  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', () => (state.paused ? resume() : pause()));
  skipBtn.addEventListener('click', skip);
  stopBtn.addEventListener('click', stop);
  doneReset.addEventListener('click', () => { doneOverlay.hidden = true; stop(); });

  // Persist nothing — keep it stateless & private. Init ring.
  computeCircumference();
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
})();
