(() => {
  'use strict';

  /* ============================================================
     Stretch Timer  ·  glassy edition
     - performance.now()-driven, drift-free countdown
     - plan engine: hold / recover / rest  (stretches × rounds)
     - Voice: pre-generated static audio atoms (no API key, no
       runtime TTS). Cues are decomposed into reusable clips and
       sequenced with small gaps that read as natural yoga-teacher
       pauses. Missing atoms fail silently; beeps still fire.
     - Active-session dashboard: wall clock, ETA, overall donut,
       stat gauges, rep grid, time-split bar, next-up card
     - Web Audio beeps, haptics, wake lock, real background track
     - settings persisted to localStorage
     ============================================================ */

  const STORAGE_KEY = 'stretchTimer.settings.v4';
  const VOICE_DIR = 'audio/voice/';

  const DEFAULTS = {
    hold: 30, recover: 5, rest: 0, stretches: 1, reps: 10,
    voice: true, beeps: true, vibrate: true, music: false, volume: 0.35,
  };
  const cfg = { ...DEFAULTS };

  // ---------- State ----------
  const state = {
    running: false, paused: false,
    plan: [], idx: 0,
    phaseStart: 0, pauseAt: 0,
    raf: 0, lastCount: -1, lastDisplay: -1,
    startedAt: 0, totalTime: 0, totalPhases: 0, holdsTotal: 0,
    clockTimer: 0, lastDash: 0,
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
  const ATOM_GAP = 0.14;          // seconds between atoms (yoga-teacher pause)

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

  // Schedule one atom at an absolute time; returns its end time.
  // Single voice bus: only one voice cue plays at a time. Starting a
  // new cue cuts any currently-playing/scheduled voice so cues never
  // overlap. (The 3-2-1 count clips are ~1.1s each but fire every 1.0s,
  // and the final count bleeds into the next phase's announcement —
  // cutting on new cue fixes all of that cleanly.)
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

  // Play a chain of atoms back-to-back with a small gap between.
  async function playSequence(names, gap = ATOM_GAP) {
    if (!names.length) return;
    try {
      cutVoice();                       // new cue replaces any in-flight voice
      const ctx = ensureAudio();
      let t = ctx.currentTime + 0.02;
      for (const name of names) {
        t = await scheduleAtom(name, t);
        t += gap;
      }
    } catch (e) { /* missing clip — silent; beeps still fire */ }
  }
  function playAtom(name) { return playSequence([name], 0); }

  function preloadVoice() {
    const names = new Set(['done', 'relax_switch', 'relax_next', 'rest',
      'left_stretch', 'right_stretch', 'count_1', 'count_2', 'count_3']);
    for (let r = 1; r <= cfg.reps; r++) names.add('round_' + r);
    for (let s = 2; s <= cfg.stretches; s++) names.add('rest_stretch_' + s);
    names.forEach((n) => loadAtom(n).catch(() => {}));
  }

  function speakHold(round, side) {
    if (!cfg.voice) return;
    playSequence(['round_' + round, side + '_stretch']);
  }
  function speakRecover(nextStretch) {
    if (!cfg.voice) return;
    playAtom(nextStretch ? 'relax_next' : 'relax_switch');
  }
  function speakRest(hasNext, n) {
    if (!cfg.voice) return;
    playAtom(hasNext ? 'rest_stretch_' + n : 'rest');
  }
  function speakCount(n) {
    if (!cfg.voice) return;
    playAtom('count_' + n);
  }
  function speakDone() {
    if (!cfg.voice) return;
    playAtom('done');
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

  // ---------- Plan ----------
  function buildPlan() {
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
  function totalDuration() { return buildPlan().reduce((s, p) => s + p.duration, 0); }

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
  function holdsBeforeIdx(i) {
    let n = 0;
    for (let k = 0; k < i; k++) if (state.plan[k].type === 'hold') n++;
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
    const doneCount = holdsBeforeIdx(state.idx);
    const curIsHold = state.plan[state.idx]?.type === 'hold';
    const currentN = curIsHold ? doneCount : -1;
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
      if (p.type === 'hold') h += p.duration;
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
    if (next.type === 'hold') {
      nextIcon.textContent = '🤸'; nextText.textContent = `${next.side} side · stretch`;
    } else if (next.type === 'recover') {
      nextIcon.textContent = '🔄'; nextText.textContent = next.nextStretch > next.stretch ? 'Next stretch' : 'Switch sides';
    } else if (next.type === 'rest') {
      nextIcon.textContent = '💨'; nextText.textContent = 'Rest';
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
    const doneHolds = holdsBeforeIdx(state.idx);
    statHolds.textContent = `${doneHolds} / ${state.holdsTotal}`;
    repCount.textContent = `${doneHolds} / ${state.holdsTotal}`;
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
    setPhaseTheme(p.type);

    if (p.type === 'hold') {
      speakHold(p.round, p.side);
      haptic(220);
      sideEl.textContent = p.side.toUpperCase(); sideEl.style.color = 'var(--accent)';
      phaseEl.textContent = 'STRETCH';
    } else if (p.type === 'recover') {
      speakRecover(p.nextStretch > p.stretch);
      haptic([110, 60, 110]);
      sideEl.textContent = 'SWITCH'; sideEl.style.color = 'var(--muted)';
      phaseEl.textContent = 'SWITCH';
    } else if (p.type === 'rest') {
      speakRest(p.nextStretch > p.stretch, p.nextStretch);
      haptic([160, 80, 160]);
      sideEl.textContent = 'REST'; sideEl.style.color = 'var(--rest)';
      phaseEl.textContent = 'REST';
    }
    stretchLabel.textContent = `Stretch ${p.stretch} / ${cfg.stretches}`;
    roundLabel.textContent = `Round ${p.round} / ${cfg.reps}`;
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

    // dashboard updates throttled to ~4fps (ring + countdown stay at 60fps)
    const nowMs = performance.now();
    if (nowMs - state.lastDash > 240) { state.lastDash = nowMs; updateDashboard(); }

    if (remaining > 0 && remaining <= 3.05) {
      const count = Math.ceil(remaining);
      if (count !== state.lastCount && count >= 1 && count <= 3) {
        state.lastCount = count;
        beep(count === 1 ? 1320 : 880, 0.16);
        if (p.type === 'hold') speakCount(count);
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
    state.holdsTotal = cfg.stretches * cfg.reps;
    state.lastDash = 0;
    renderRepGrid();
    renderDistBar();
    doneOverlay.classList.remove('is-active');
    showScreen(runScreen);
    ensureAudio();
    preloadVoice();
    if (cfg.music) startMusic();
    // show live volume control on run screen when music is on
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
    const holds = cfg.stretches * cfg.reps;
    const mins = Math.round(totalDuration() / 60);
    doneStats.textContent = `${holds} holds across ${cfg.stretches} stretch${cfg.stretches > 1 ? 'es' : ''} · about ${mins} min`;
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
    $('#opt-voice').checked = cfg.voice; $('#opt-beeps').checked = cfg.beeps;
    $('#opt-vibrate').checked = cfg.vibrate; $('#opt-music').checked = cfg.music;
    volSlider.value = cfg.volume; updateVolLabel(); toggleVolRow();
  }
  function updateSummary() {
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
  function updateVolLabel() { volVal.textContent = Math.round(parseFloat(volSlider.value) * 100) + '%'; }
  function toggleVolRow() { volRow.hidden = !$('#opt-music').checked; }

  // Keep config + run-screen volume sliders in sync; apply live to music.
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

  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', () => (state.paused ? resume() : pause()));
  skipBtn.addEventListener('click', skip);
  stopBtn.addEventListener('click', stop);
  doneReset.addEventListener('click', () => { doneOverlay.classList.remove('is-active'); stop(); });

  $('#opt-music').addEventListener('change', () => { toggleVolRow(); saveSettings(); });
  volSlider.addEventListener('input', () => applyVolume(parseFloat(volSlider.value)));
  if (runVolSlider) runVolSlider.addEventListener('input', () => applyVolume(parseFloat(runVolSlider.value)));
  ['cfg-hold', 'cfg-recover', 'cfg-rest', 'cfg-stretches', 'cfg-reps'].forEach((id) =>
    document.getElementById(id).addEventListener('input', () => { updateSummary(); saveSettings(); }));
  ['opt-voice', 'opt-beeps', 'opt-vibrate'].forEach((id) =>
    document.getElementById(id).addEventListener('change', saveSettings));

  // ---------- Init ----------
  loadSettings();
  applyConfigToInputs();
  updateSummary();
})();
