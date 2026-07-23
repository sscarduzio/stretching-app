(() => {
  'use strict';

  /* ============================================================
     Stretch & Box Timer  ·  glassy edition
     - performance.now()-driven, drift-free countdown
     - Two modes:
       · STRETCH: hold / recover / rest  (stretches × rounds, L/R)
       · BOX: work / rest  (N rounds, coach calls punch combos)
     - Voice: pre-generated static audio atoms (no API key, no
       runtime TTS). Stretch = Shimmer (calm yoga); Box = Onyx
       (energetic coach). Missing atoms fail silently.
     - Active-session dashboard: wall clock, ETA, overall donut,
       stat gauges, rep/round grid, time-split bar, next-up card
     - Web Audio beeps, haptics, wake lock, background track
     - settings persisted to localStorage
     ============================================================ */

  const STORAGE_KEY = 'stretchTimer.settings.v5';
  const VOICE_DIR = 'audio/voice/';

  const DEFAULTS = {
    mode: 'stretch',
    hold: 30, recover: 5, rest: 0, stretches: 1, reps: 10,
    boxRounds: 6, boxWork: 60, boxRest: 20, boxCombos: 15,
    voice: true, beeps: true, vibrate: true, music: false, volume: 0.35,
  };
  const cfg = { ...DEFAULTS };

  // Boxing combination atoms (cycled during work phases)
  const COMBOS = [
    'box_combo_12', 'box_combo_123', 'box_combo_112', 'box_combo_232',
    'box_combo_32', 'box_combo_1232', 'box_combo_jabbody', 'box_combo_slip',
    'box_combo_roll', 'box_combo_djab', 'box_combo_hook', 'box_combo_12h',
  ];

  // ---------- State ----------
  const state = {
    running: false, paused: false,
    plan: [], idx: 0,
    phaseStart: 0, pauseAt: 0,
    raf: 0, lastCount: -1, lastDisplay: -1,
    startedAt: 0, totalTime: 0, totalPhases: 0, primaryTotal: 0,
    clockTimer: 0, lastDash: 0,
    comboPlan: [], comboPtr: 0,
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
  const stretchLabel = $('#stretch-label');
  const roundLabel = $('#round-label');
  const timeEl = $('#time');
  const phaseEl = $('#phase-label');
  const sideEl = $('#side-badge');
  const ringFg = $('#ring-fg');
  const summaryEl = $('#summary');
  const volRow = $('#vol-row');
  const volSlider = $('#cfg-vol');
  const volVal = $('#vol-val');
  const runVol = $('#run-vol');
  const runVolSlider = $('#run-vol-slider');
  const runVolVal = $('#run-vol-val');
  const doneStats = $('#done-stats');
  const bgAudio = $('#bg-audio');
  const brandLogo = $('#brand-logo');
  const brandTitle = $('#brand-title');
  const brandSubtitle = $('#brand-subtitle');
  const gradStart = $('#grad-start');
  const gradEnd = $('#grad-end');
  const stretchFields = $('#stretch-fields');
  const boxFields = $('#box-fields');
  const repTitle = $('#rep-title');
  const statHoldsLabel = $('#stat-holds-label');
  const lgHoldWrap = $('#lg-hold-wrap');
  const lgHoldLabel = $('#lg-hold-label');
  const lgRecoverWrap = $('#lg-recover-wrap');

  // Dashboard refs
  const wallClock = $('#wall-clock');
  const etaTime = $('#eta-time');
  const phaseStep = $('#phase-step');
  const nextIcon = $('#next-icon');
  const nextText = $('#next-text');
  const nextDur = $('#next-dur');
  const overallDonut = $('#overall-donut');
  const overallPct = $('#overall-pct');
  const statElapsed = $('#stat-elapsed');
  const statRemaining = $('#stat-remaining');
  const statHolds = $('#stat-holds');
  const repGrid = $('#rep-grid');
  const repCount = $('#rep-count');
  const distHold = $('#dist-hold');
  const distRecover = $('#dist-recover');
  const distRest = $('#dist-rest');
  const lgHold = $('#lg-hold');
  const lgRecover = $('#lg-recover');
  const lgRest = $('#lg-rest');

  const RING_LEN = 100;
  ringFg.style.strokeDasharray = RING_LEN;
  ringFg.style.strokeDashoffset = 0;

  const isBox = () => cfg.mode === 'box';
  const primaryType = () => (isBox() ? 'work' : 'hold');

  // ---------- Audio context ----------
  let actx = null;
  function ensureAudio() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function beep(freq = 880, dur = 0.14) {
    if (!cfg.beeps) return;
    const ctx = ensureAudio(); const t = ctx.currentTime;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.03);
  }

  function haptic(p) { if (cfg.vibrate) try { navigator.vibrate(p); } catch (e) {} }

  // ============================================================
  //  Voice — static audio atoms, sequenced with natural gaps
  // ============================================================
  const atomCache = new Map();    // name -> AudioBuffer
  const atomLoading = new Map();  // name -> Promise<AudioBuffer>
  const ATOM_GAP = isBox() ? 0.10 : 0.14;  // tighter gap for coach

  async function loadAtom(name) {
    if (atomCache.has(name)) return atomCache.get(name);
    if (atomLoading.has(name)) return atomLoading.get(name);
    const p = (async () => {
      const res = await fetch(VOICE_DIR + name + '.mp3');
      if (!res.ok) throw new Error('no audio: ' + name);
      const buf = await res.arrayBuffer();
      const ab = await ensureAudio().decodeAudioData(buf);
      atomCache.set(name, ab);
      return ab;
    })();
    atomLoading.set(name, p);
    return p;
  }

  // Single voice bus: only one voice cue plays at a time.
  let voiceGain = null;
  const activeSources = [];
  function voiceBus() {
    if (!voiceGain) {
      const ctx = ensureAudio();
      voiceGain = ctx.createGain();
      voiceGain.gain.value = 1.0;
      voiceGain.connect(ctx.destination);
    }
    return voiceGain;
  }
  function cutVoice() {
    for (const s of activeSources) { try { s.stop(); } catch (e) {} }
    activeSources.length = 0;
  }

  async function scheduleAtom(name, startAt) {
    const ab = await loadAtom(name);
    const ctx = ensureAudio();
    const src = ctx.createBufferSource();
    src.buffer = ab;
    const g = ctx.createGain();
    g.gain.value = 1.0;
    src.connect(g).connect(voiceBus());
    const when = Math.max(startAt, ctx.currentTime + 0.005);
    src.start(when);
    activeSources.push(src);
    src.onended = () => {
      const i = activeSources.indexOf(src);
      if (i > -1) activeSources.splice(i, 1);
    };
    return when + ab.duration;
  }

  async function playSequence(names, gap = ATOM_GAP) {
    if (!names.length) return;
    try {
      cutVoice();
      const ctx = ensureAudio();
      let t = ctx.currentTime + 0.02;
      for (const name of names) {
        t = await scheduleAtom(name, t);
        t += gap;
      }
    } catch (e) { /* missing clip — silent; beeps still fire */ }
  }
  function playAtom(name) { return playSequence([name], 0); }

  // ---------- Mode-aware voice ----------
  function preloadVoice() {
    const names = new Set();
    if (isBox()) {
      names.add('box_work'); names.add('box_rest'); names.add('box_done');
      names.add('box_count_1'); names.add('box_count_2'); names.add('box_count_3');
      for (let r = 1; r <= cfg.boxRounds; r++) names.add('box_round_' + r);
      if (cfg.boxCombos > 0) COMBOS.forEach((c) => names.add(c));
    } else {
      names.add('done'); names.add('relax_switch'); names.add('relax_next'); names.add('rest');
      names.add('left_stretch'); names.add('right_stretch');
      names.add('count_1'); names.add('count_2'); names.add('count_3');
      for (let r = 1; r <= cfg.reps; r++) names.add('round_' + r);
      for (let s = 2; s <= cfg.stretches; s++) names.add('rest_stretch_' + s);
    }
    names.forEach((n) => loadAtom(n).catch(() => {}));
  }

  function speakStart(p) {
    if (!cfg.voice) return;
    if (isBox()) playSequence(['box_round_' + p.round, 'box_work']);
    else playSequence(['round_' + p.round, p.side + '_stretch']);
  }
  function speakRecover(nextStretch) {
    if (!cfg.voice || isBox()) return;
    playAtom(nextStretch ? 'relax_next' : 'relax_switch');
  }
  function speakRest(p) {
    if (!cfg.voice) return;
    if (isBox()) playAtom('box_rest');
    else playAtom(p.nextStretch > p.stretch ? 'rest_stretch_' + p.nextStretch : 'rest');
  }
  function speakCount(n) {
    if (!cfg.voice) return;
    playAtom((isBox() ? 'box_count_' : 'count_') + n);
  }
  function speakCombo(name) {
    if (!cfg.voice) return;
    playAtom(name);
  }
  function speakDone() {
    if (!cfg.voice) return;
    playAtom(isBox() ? 'box_done' : 'done');
  }

  // ============================================================
  //  Background music
  // ============================================================
  let musicOn = false;
  function startMusic() {
    if (musicOn || !cfg.music) return;
    musicOn = true;
    bgAudio.volume = cfg.volume;
    bgAudio.play().catch(() => startPadFallback());
  }
  function stopMusic() {
    if (!musicOn) return;
    musicOn = false;
    bgAudio.pause(); bgAudio.currentTime = 0;
    stopPadFallback();
  }
  function setMusicVolume(v) {
    cfg.volume = v;
    if (bgAudio && !bgAudio.paused) bgAudio.volume = v;
    if (pad) pad.master.gain.value = v * 0.5;
  }
  let pad = null;
  function startPadFallback() {
    if (pad) return;
    try {
      const ctx = ensureAudio();
      const master = ctx.createGain(); master.gain.value = cfg.volume * 0.5; master.connect(ctx.destination);
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 700; filter.Q.value = 0.8; filter.connect(master);
      const freqs = [110, 130.81, 164.81, 220];
      const oscs = freqs.map((f, i) => {
        const o = ctx.createOscillator(); o.type = i === 0 ? 'triangle' : 'sine'; o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = 0.22 / freqs.length;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05 + i * 0.027;
        const lg = ctx.createGain(); lg.gain.value = 3.5; lfo.connect(lg).connect(o.detune); lfo.start();
        o.connect(g).connect(filter); o.start(); return { o, lfo };
      });
      const fLfo = ctx.createOscillator(); fLfo.frequency.value = 0.035;
      const fLfoG = ctx.createGain(); fLfoG.gain.value = 220; fLfo.connect(fLfoG).connect(filter.frequency); fLfo.start();
      pad = { master, filter, oscs, fLfo };
    } catch (e) { pad = null; }
  }
  function stopPadFallback() {
    if (!pad) return;
    try { pad.oscs.forEach(({ o, lfo }) => { try { o.stop(); lfo.stop(); } catch (e) {} }); pad.fLfo.stop(); } catch (e) {}
    pad = null;
  }

  // ---------- Wake lock ----------
  let wakeLock = null;
  async function requestWakeLock() { try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {} }
  function releaseWakeLock() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }
  document.addEventListener('visibilitychange', () => {
    if (state.running && !state.paused && document.visibilityState === 'visible') requestWakeLock();
  });

  // ---------- Mode ----------
  function setMode(mode) {
    cfg.mode = mode;
    document.body.dataset.mode = mode;
    stretchFields.hidden = (mode !== 'stretch');
    boxFields.hidden = (mode !== 'box');
    stretchLabel.style.display = (mode === 'stretch') ? '' : 'none';

    if (mode === 'box') {
      brandLogo.textContent = '🥊';
      brandTitle.innerHTML = 'Box<span>.</span>';
      brandSubtitle.textContent = 'Shadow box · combos · rounds';
      if (gradStart) gradStart.setAttribute('stop-color', '#ffb84d');
      if (gradEnd) gradEnd.setAttribute('stop-color', '#ff4d3d');
      repTitle.textContent = 'Rounds';
      statHoldsLabel.textContent = 'rounds';
      lgHoldLabel.textContent = 'Work';
      if (lgRecoverWrap) lgRecoverWrap.style.display = 'none';
    } else {
      brandLogo.textContent = '🧘';
      brandTitle.innerHTML = 'Stretch<span>.</span>';
      brandSubtitle.textContent = 'Hold · recover · alternate sides';
      if (gradStart) gradStart.setAttribute('stop-color', '#ff7a7a');
      if (gradEnd) gradEnd.setAttribute('stop-color', '#ff3d6e');
      repTitle.textContent = 'Repetitions';
      statHoldsLabel.textContent = 'holds';
      lgHoldLabel.textContent = 'Hold';
      if (lgRecoverWrap) lgRecoverWrap.style.display = '';
    }

    document.querySelectorAll('.mode-btn').forEach((b) => {
      const active = b.dataset.mode === mode;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', active);
    });
    updateSummary();
    saveSettings();
  }

  // ---------- Plan ----------
  function buildPlan() {
    if (isBox()) return buildBoxPlan();
    return buildStretchPlan();
  }
  function buildStretchPlan() {
    const plan = []; const totalHolds = cfg.stretches * cfg.reps; let holdIndex = 0;
    for (let s = 1; s <= cfg.stretches; s++) {
      for (let r = 1; r <= cfg.reps; r++) {
        holdIndex++;
        const side = (r % 2 === 1) ? 'left' : 'right';
        plan.push({ type: 'hold', stretch: s, round: r, side, duration: cfg.hold });
        if (holdIndex < totalHolds) {
          const isLastOfStretch = (r === cfg.reps);
          const nextStretch = isLastOfStretch ? s + 1 : s;
          plan.push({ type: 'recover', stretch: s, round: r, duration: cfg.recover, nextStretch });
          if (cfg.rest > 0) plan.push({ type: 'rest', stretch: s, round: r, duration: cfg.rest, nextStretch });
        }
      }
    }
    return plan;
  }
  function buildBoxPlan() {
    const plan = [];
    for (let r = 1; r <= cfg.boxRounds; r++) {
      plan.push({ type: 'work', round: r, duration: cfg.boxWork });
      if (r < cfg.boxRounds && cfg.boxRest > 0) {
        plan.push({ type: 'rest', round: r, duration: cfg.boxRest, nextRound: r + 1 });
      }
    }
    return plan;
  }
  function totalDuration() { return buildPlan().reduce((s, p) => s + p.duration, 0); }
  function primaryCount() { return isBox() ? cfg.boxRounds : cfg.stretches * cfg.reps; }

  // ---------- Dashboard helpers ----------
  function fmtClock(ms) {
    const d = new Date(ms);
    return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    return `${m}:${s.toString().padStart(2,'0')}`;
  }
  function primaryBeforeIdx(i) {
    const t = primaryType();
    let n = 0;
    for (let k = 0; k < i; k++) if (state.plan[k].type === t) n++;
    return n;
  }
  function elapsedTotal() {
    let done = 0;
    for (let k = 0; k < state.idx; k++) done += state.plan[k].duration;
    const cur = state.paused ? 0 : (performance.now() - state.phaseStart) / 1000;
    const p = state.plan[state.idx];
    done += p ? Math.min(cur, p.duration) : 0;
    return done;
  }

  function renderRepGrid() {
    repGrid.innerHTML = '';
    if (isBox()) {
      const row = document.createElement('div'); row.className = 'rep-dots';
      for (let i = 0; i < cfg.boxRounds; i++) {
        const dot = document.createElement('span'); dot.className = 'rep-dot'; dot.dataset.i = i; row.appendChild(dot);
      }
      const wrap = document.createElement('div'); wrap.className = 'rep-group'; wrap.appendChild(row);
      repGrid.appendChild(wrap);
      return;
    }
    if (cfg.stretches === 1) {
      const row = document.createElement('div'); row.className = 'rep-dots';
      for (let i = 0; i < cfg.reps; i++) {
        const dot = document.createElement('span'); dot.className = 'rep-dot'; dot.dataset.i = i; row.appendChild(dot);
      }
      const wrap = document.createElement('div'); wrap.className = 'rep-group'; wrap.appendChild(row);
      repGrid.appendChild(wrap);
    } else {
      let n = 0;
      for (let s = 1; s <= cfg.stretches; s++) {
        const group = document.createElement('div'); group.className = 'rep-group';
        const lbl = document.createElement('span'); lbl.className = 'rep-group-label'; lbl.textContent = 'S' + s;
        const dots = document.createElement('div'); dots.className = 'rep-dots';
        for (let r = 0; r < cfg.reps; r++) {
          const dot = document.createElement('span'); dot.className = 'rep-dot'; dot.dataset.i = n++; dots.appendChild(dot);
        }
        group.appendChild(lbl); group.appendChild(dots); repGrid.appendChild(group);
      }
    }
  }
  function updateRepGrid() {
    const doneCount = primaryBeforeIdx(state.idx);
    const curIsPrimary = state.plan[state.idx]?.type === primaryType();
    const currentN = curIsPrimary ? doneCount : -1;
    repGrid.querySelectorAll('.rep-dot').forEach((dot) => {
      const i = +dot.dataset.i;
      dot.classList.toggle('done', i < doneCount);
      dot.classList.toggle('current', i === currentN);
    });
  }

  function renderDistBar() {
    const plan = state.plan.length ? state.plan : buildPlan();
    let h = 0, rec = 0, rest = 0;
    for (const p of plan) {
      if (p.type === 'hold' || p.type === 'work') h += p.duration;
      else if (p.type === 'recover') rec += p.duration;
      else if (p.type === 'rest') rest += p.duration;
    }
    const total = h + rec + rest || 1;
    distHold.style.width = (h / total * 100) + '%';
    distRecover.style.width = (rec / total * 100) + '%';
    distRest.style.width = (rest / total * 100) + '%';
    lgHold.textContent = fmtDur(h);
    lgRecover.textContent = fmtDur(rec);
    lgRest.textContent = fmtDur(rest);
  }

  function updateNextCard() {
    const next = state.plan[state.idx + 1];
    if (!next) {
      nextIcon.textContent = '🎉'; nextText.textContent = 'Finish'; nextDur.textContent = '';
      return;
    }
    if (isBox()) {
      if (next.type === 'work') {
        nextIcon.textContent = '🥊'; nextText.textContent = `Round ${next.round} · box`;
      } else if (next.type === 'rest') {
        nextIcon.textContent = '💧'; nextText.textContent = 'Rest';
      }
    } else {
      if (next.type === 'hold') {
        nextIcon.textContent = '🤸'; nextText.textContent = `${next.side} side · stretch`;
      } else if (next.type === 'recover') {
        nextIcon.textContent = '🔄'; nextText.textContent = next.nextStretch > next.stretch ? 'Next stretch' : 'Switch sides';
      } else if (next.type === 'rest') {
        nextIcon.textContent = '💨'; nextText.textContent = 'Rest';
      }
    }
    nextDur.textContent = next.duration + 's';
  }

  function updateDashboard() {
    const elapsed = elapsedTotal();
    const remaining = state.totalTime - elapsed;
    const pct = state.totalTime > 0 ? elapsed / state.totalTime : 0;
    overallPct.textContent = Math.round(pct * 100) + '%';
    overallDonut.style.strokeDashoffset = (100 * (1 - pct)).toFixed(2);
    statElapsed.textContent = fmtDur(elapsed);
    statRemaining.textContent = fmtDur(remaining);
    const donePrimary = primaryBeforeIdx(state.idx);
    statHolds.textContent = `${donePrimary} / ${state.primaryTotal}`;
    repCount.textContent = `${donePrimary} / ${state.primaryTotal}`;
    phaseStep.textContent = `Phase ${Math.min(state.idx + 1, state.totalPhases)} / ${state.totalPhases}`;
    updateRepGrid();
  }

  function updateWallClock() {
    wallClock.textContent = fmtClock(Date.now());
    const remaining = state.totalTime - elapsedTotal();
    etaTime.textContent = fmtClock(Date.now() + remaining * 1000);
  }

  // ---------- Phase ----------
  function setPhaseTheme(phase) { document.body.dataset.phase = phase; }
  function currentPhase() { return state.plan[state.idx]; }

  function startPhase() {
    const p = currentPhase();
    if (!p) return finish();
    state.phaseStart = performance.now();
    state.lastCount = -1; state.lastDisplay = -1;
    state.comboPlan = []; state.comboPtr = 0;
    setPhaseTheme(p.type);

    if (p.type === 'hold') {
      speakStart(p);
      haptic(220);
      sideEl.textContent = p.side.toUpperCase(); sideEl.style.color = 'var(--accent)';
      phaseEl.textContent = 'STRETCH';
    } else if (p.type === 'work') {
      speakStart(p);
      haptic(300);
      sideEl.textContent = 'BOX'; sideEl.style.color = 'var(--accent)';
      phaseEl.textContent = 'WORK';
      // schedule combo calls during the round
      if (cfg.boxCombos > 0 && cfg.voice) {
        const interval = cfg.boxCombos;
        const firstAt = 5;
        const lastAllowed = p.duration - 6;
        let t = firstAt, ci = Math.floor(Math.random() * COMBOS.length);
        while (t < lastAllowed) {
          state.comboPlan.push({ at: t, name: COMBOS[ci % COMBOS.length] });
          ci++; t += interval;
        }
      }
    } else if (p.type === 'recover') {
      speakRecover(p.nextStretch > p.stretch);
      haptic([110, 60, 110]);
      sideEl.textContent = 'SWITCH'; sideEl.style.color = 'var(--muted)';
      phaseEl.textContent = 'SWITCH';
    } else if (p.type === 'rest') {
      speakRest(p);
      haptic([160, 80, 160]);
      sideEl.textContent = 'REST'; sideEl.style.color = 'var(--rest)';
      phaseEl.textContent = 'REST';
    }

    if (isBox()) {
      roundLabel.textContent = `Round ${p.round} / ${cfg.boxRounds}`;
    } else {
      stretchLabel.textContent = `Stretch ${p.stretch} / ${cfg.stretches}`;
      roundLabel.textContent = `Round ${p.round} / ${cfg.reps}`;
    }
    updateNextCard();
    updateDashboard();
    state.raf = requestAnimationFrame(tick);
  }

  function nextPhase() {
    cancelAnimationFrame(state.raf);
    state.idx++;
    if (state.idx >= state.plan.length) return finish();
    startPhase();
  }

  // ---------- Loop ----------
  function tick() {
    if (!state.running || state.paused) return;
    const p = currentPhase(); if (!p) return finish();
    const elapsed = (performance.now() - state.phaseStart) / 1000;
    const remaining = p.duration - elapsed;
    const display = Math.max(0, Math.ceil(remaining));

    if (display !== state.lastDisplay) {
      timeEl.textContent = display;
      timeEl.classList.remove('tick'); void timeEl.offsetWidth; timeEl.classList.add('tick');
      state.lastDisplay = display;
    }
    const progress = Math.min(1, elapsed / p.duration);
    ringFg.style.strokeDashoffset = RING_LEN * progress;

    // dashboard updates throttled to ~4fps
    const nowMs = performance.now();
    if (nowMs - state.lastDash > 240) { state.lastDash = nowMs; updateDashboard(); }

    // combo calls during work (box mode)
    if (p.type === 'work' && state.comboPtr < state.comboPlan.length) {
      if (elapsed >= state.comboPlan[state.comboPtr].at) {
        speakCombo(state.comboPlan[state.comboPtr].name);
        state.comboPtr++;
      }
    }

    if (remaining > 0 && remaining <= 3.05) {
      const count = Math.ceil(remaining);
      if (count !== state.lastCount && count >= 1 && count <= 3) {
        state.lastCount = count;
        beep(count === 1 ? 1320 : 880, 0.16);
        if (p.type === 'hold' || p.type === 'work') speakCount(count);
        haptic(40);
      }
    }
    if (remaining <= 0) { nextPhase(); return; }
    state.raf = requestAnimationFrame(tick);
  }

  // ---------- Lifecycle ----------
  function showScreen(el) {
    [cfgScreen, runScreen].forEach(s => s.classList.remove('is-active'));
    el.classList.add('is-active');
  }

  function start() {
    readConfig(); saveSettings();
    state.plan = buildPlan(); state.idx = 0;
    state.running = true; state.paused = false;
    state.startedAt = Date.now();
    state.totalTime = totalDuration();
    state.totalPhases = state.plan.length;
    state.primaryTotal = primaryCount();
    state.lastDash = 0;
    renderRepGrid();
    renderDistBar();
    doneOverlay.classList.remove('is-active');
    showScreen(runScreen);
    ensureAudio();
    preloadVoice();
    if (cfg.music) startMusic();
    if (runVol) { runVol.hidden = !cfg.music; if (runVolSlider) runVolSlider.value = cfg.volume; if (runVolVal) runVolVal.textContent = Math.round(cfg.volume * 100) + '%'; }
    requestWakeLock();
    updateWallClock();
    clearInterval(state.clockTimer);
    state.clockTimer = setInterval(updateWallClock, 1000);
    startPhase();
  }
  function pause() {
    if (!state.running || state.paused) return;
    state.paused = true; state.pauseAt = performance.now();
    cancelAnimationFrame(state.raf);
    pauseBtn.querySelector('span').textContent = '▶ Resume';
    releaseWakeLock();
  }
  function resume() {
    if (!state.paused) return;
    state.paused = false;
    state.phaseStart += performance.now() - state.pauseAt;
    pauseBtn.querySelector('span').textContent = '⏸ Pause';
    requestWakeLock();
    state.raf = requestAnimationFrame(tick);
  }
  function skip() { if (state.running) nextPhase(); }
  function stop() {
    state.running = false; state.paused = false;
    cancelAnimationFrame(state.raf);
    clearInterval(state.clockTimer);
    cutVoice();
    stopMusic(); releaseWakeLock();
    if (runVol) runVol.hidden = true;
    setPhaseTheme('idle');
    showScreen(cfgScreen);
    pauseBtn.querySelector('span').textContent = '⏸ Pause';
  }
  function finish() {
    state.running = false;
    cancelAnimationFrame(state.raf);
    clearInterval(state.clockTimer);
    speakDone();
    haptic([300, 80, 300, 80, 500]);
    stopMusic(); releaseWakeLock();
    setPhaseTheme('done');
    state.idx = state.plan.length;
    updateDashboard();
    updateWallClock();
    const mins = Math.round(totalDuration() / 60);
    if (isBox()) {
      doneStats.textContent = `${cfg.boxRounds} rounds · ${cfg.boxWork}s work · about ${mins} min`;
    } else {
      const holds = cfg.stretches * cfg.reps;
      doneStats.textContent = `${holds} holds across ${cfg.stretches} stretch${cfg.stretches > 1 ? 'es' : ''} · about ${mins} min`;
    }
    doneOverlay.classList.add('is-active');
  }

  // ---------- Config ----------
  function clampInt(v, min, max, fallback) {
    const n = parseInt(v, 10);
    if (isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }
  function readConfig() {
    cfg.hold      = clampInt($('#cfg-hold').value,      5, 300, DEFAULTS.hold);
    cfg.recover   = clampInt($('#cfg-recover').value,   1,  60, DEFAULTS.recover);
    cfg.rest      = clampInt($('#cfg-rest').value,      0, 120, DEFAULTS.rest);
    cfg.stretches = clampInt($('#cfg-stretches').value, 1,  12, DEFAULTS.stretches);
    cfg.reps      = clampInt($('#cfg-reps').value,      1,  20, DEFAULTS.reps);
    cfg.boxRounds = clampInt($('#cfg-box-rounds').value, 1,  12, DEFAULTS.boxRounds);
    cfg.boxWork   = clampInt($('#cfg-box-work').value,  10, 300, DEFAULTS.boxWork);
    cfg.boxRest   = clampInt($('#cfg-box-rest').value,   0, 120, DEFAULTS.boxRest);
    cfg.boxCombos = clampInt($('#cfg-box-combos').value, 0,  30, DEFAULTS.boxCombos);
    cfg.voice     = $('#opt-voice').checked;
    cfg.beeps     = $('#opt-beeps').checked;
    cfg.vibrate   = $('#opt-vibrate').checked;
    cfg.music     = $('#opt-music').checked;
    cfg.volume    = parseFloat(volSlider.value);
  }
  function applyConfigToInputs() {
    $('#cfg-hold').value = cfg.hold; $('#cfg-recover').value = cfg.recover;
    $('#cfg-rest').value = cfg.rest; $('#cfg-stretches').value = cfg.stretches;
    $('#cfg-reps').value = cfg.reps;
    $('#cfg-box-rounds').value = cfg.boxRounds; $('#cfg-box-work').value = cfg.boxWork;
    $('#cfg-box-rest').value = cfg.boxRest; $('#cfg-box-combos').value = cfg.boxCombos;
    $('#opt-voice').checked = cfg.voice; $('#opt-beeps').checked = cfg.beeps;
    $('#opt-vibrate').checked = cfg.vibrate; $('#opt-music').checked = cfg.music;
    volSlider.value = cfg.volume; updateVolLabel(); toggleVolRow();
  }
  function updateSummary() {
    if (isBox()) {
      const rounds = clampInt($('#cfg-box-rounds').value, 1, 12, DEFAULTS.boxRounds);
      const work = clampInt($('#cfg-box-work').value, 10, 300, DEFAULTS.boxWork);
      const rest = clampInt($('#cfg-box-rest').value, 0, 120, DEFAULTS.boxRest);
      const restCount = rest > 0 ? Math.max(0, rounds - 1) : 0;
      const total = rounds * work + restCount * rest;
      const mins = Math.floor(total / 60), secs = total % 60;
      const dur = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      const combos = clampInt($('#cfg-box-combos').value, 0, 30, DEFAULTS.boxCombos);
      const comboTxt = combos > 0 ? ` · combos every ${combos}s` : '';
      summaryEl.innerHTML = `<b>${rounds}</b> rounds · <b>${work}s</b> work · <b>${rest}s</b> rest${comboTxt} · about <b>${dur}</b>`;
    } else {
      const hold = clampInt($('#cfg-hold').value, 5, 300, DEFAULTS.hold);
      const recover = clampInt($('#cfg-recover').value, 1, 60, DEFAULTS.recover);
      const rest = clampInt($('#cfg-rest').value, 0, 120, DEFAULTS.rest);
      const stretches = clampInt($('#cfg-stretches').value, 1, 12, DEFAULTS.stretches);
      const reps = clampInt($('#cfg-reps').value, 1, 20, DEFAULTS.reps);
      const holds = stretches * reps;
      const recCount = Math.max(0, holds - 1);
      const restCount = rest > 0 ? recCount : 0;
      const total = holds * hold + recCount * recover + restCount * rest;
      const mins = Math.floor(total / 60), secs = total % 60;
      const dur = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      summaryEl.innerHTML = `<b>${holds}</b> holds · <b>${stretches}</b> stretch${stretches > 1 ? 'es' : ''} · <b>${reps}</b> round${reps > 1 ? 's' : ''} each · about <b>${dur}</b>`;
    }
  }
  function updateVolLabel() { volVal.textContent = Math.round(parseFloat(volSlider.value) * 100) + '%'; }
  function toggleVolRow() { volRow.hidden = !$('#opt-music').checked; }

  function applyVolume(v) {
    v = Math.max(0, Math.min(1, v));
    cfg.volume = v;
    if (volSlider) volSlider.value = v;
    if (runVolSlider) runVolSlider.value = v;
    if (volVal) volVal.textContent = Math.round(v * 100) + '%';
    if (runVolVal) runVolVal.textContent = Math.round(v * 100) + '%';
    setMusicVolume(v);
    saveSettings();
  }

  // ---------- Persistence ----------
  function saveSettings() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch (e) {} }
  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return;
      Object.assign(cfg, DEFAULTS, JSON.parse(raw));
    } catch (e) {}
  }

  // ---------- Wire up ----------
  document.querySelectorAll('.stepper button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.target, step = parseInt(btn.dataset.step, 10);
      const input = document.getElementById(id);
      const min = parseInt(input.min, 10), max = parseInt(input.max, 10);
      input.value = clampInt(parseInt(input.value, 10) + step, min, max, parseInt(input.value, 10));
      input.dispatchEvent(new Event('input'));
      beep(660, 0.05);
    });
  });

  // mode switch
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.running) return;  // no mode switch mid-session
      setMode(btn.dataset.mode);
      beep(660, 0.05);
    });
  });

  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', () => (state.paused ? resume() : pause()));
  skipBtn.addEventListener('click', skip);
  stopBtn.addEventListener('click', stop);
  doneReset.addEventListener('click', () => { doneOverlay.classList.remove('is-active'); stop(); });

  $('#opt-music').addEventListener('change', () => { toggleVolRow(); saveSettings(); });
  volSlider.addEventListener('input', () => applyVolume(parseFloat(volSlider.value)));
  if (runVolSlider) runVolSlider.addEventListener('input', () => applyVolume(parseFloat(runVolSlider.value)));
  ['cfg-hold', 'cfg-recover', 'cfg-rest', 'cfg-stretches', 'cfg-reps',
   'cfg-box-rounds', 'cfg-box-work', 'cfg-box-rest', 'cfg-box-combos'].forEach((id) =>
    document.getElementById(id).addEventListener('input', () => { updateSummary(); saveSettings(); }));
  ['opt-voice', 'opt-beeps', 'opt-vibrate'].forEach((id) =>
    document.getElementById(id).addEventListener('change', saveSettings));

  // ---------- Init ----------
  loadSettings();
  applyConfigToInputs();
  setMode(cfg.mode);
  updateSummary();
})();
