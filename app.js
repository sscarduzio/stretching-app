(() => {
  'use strict';

  /* ============================================================
     Stretch Timer  ·  glassy edition
     - performance.now()-driven, drift-free countdown
     - plan engine: hold / recover / rest  (stretches × rounds)
     - Web Audio beeps, Speech cues, haptics, wake lock
     - real background track + procedural pad fallback
     - realistic voice picker (prefers neural/premium voices)
     - settings persisted to localStorage
     ============================================================ */

  const STORAGE_KEY = 'stretchTimer.settings.v2';

  const DEFAULTS = {
    hold: 30, recover: 5, rest: 0, stretches: 1, reps: 10,
    voice: true, voiceURI: null, beeps: true, vibrate: true,
    music: false, volume: 0.35,
  };
  const cfg = { ...DEFAULTS };

  // Curated preference order of natural-sounding English voices.
  // Names match across Apple's speechSynthesis voice list & Chrome's.
  const VOICE_PREFERENCE = [
    'Ava', 'Evan', 'Aaron', 'Nora', 'Luke', 'Oliver', 'Serena', 'Zoe',
    'Samantha', 'Allison', 'Susan', 'Daniel', 'Karen', 'Tessa', 'Moira',
    'Google US English', 'Google UK English Female', 'Microsoft Aria',
    'Microsoft Jenny', 'Siri',
  ];

  // ---------- State ----------
  const state = {
    running: false, paused: false,
    plan: [], idx: 0,
    phaseStart: 0, pauseAt: 0,
    raf: 0, lastCount: -1, lastDisplay: -1,
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
  const doneStats = $('#done-stats');
  const bgAudio = $('#bg-audio');
  const voiceSelect = $('#cfg-voice');
  const voiceRow = $('#voice-row');

  const RING_LEN = 100; // pathLength normalization
  ringFg.style.strokeDasharray = RING_LEN;
  ringFg.style.strokeDashoffset = 0;

  // ---------- Audio (beeps) ----------
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

  // ---------- Speech (realistic voice) ----------
  let voices = [];
  let chosenVoice = null;

  function loadVoices() {
    if (!('speechSynthesis' in window)) { voiceRow.hidden = true; return; }
    voices = speechSynthesis.getVoices();
    if (!voices.length) return;
    populateVoiceSelect();
    pickVoice();
  }

  function populateVoiceSelect() {
    // Prefer English voices, keep others as fallback at the end.
    const en = voices.filter(v => /en(-|_)/i.test(v.lang));
    const others = voices.filter(v => !/en(-|_)/i.test(v.lang));
    const sorted = [...en, ...others];

    voiceSelect.innerHTML = '';
    for (const v of sorted) {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} · ${v.lang}`;
      voiceSelect.appendChild(opt);
    }
  }

  function pickVoice() {
    if (!voices.length) return;
    // 1. honor saved choice if it still exists
    if (cfg.voiceURI) {
      const found = voices.find(v => v.voiceURI === cfg.voiceURI);
      if (found) { chosenVoice = found; voiceSelect.value = found.voiceURI; return; }
    }
    // 2. preference order
    for (const name of VOICE_PREFERENCE) {
      const found = voices.find(v => v.name === name || v.name.includes(name));
      if (found) { chosenVoice = found; voiceSelect.value = found.voiceURI; cfg.voiceURI = found.voiceURI; return; }
    }
    // 3. first English voice
    const en = voices.find(v => /en(-|_)/i.test(v.lang));
    if (en) { chosenVoice = en; voiceSelect.value = en.voiceURI; cfg.voiceURI = en.voiceURI; return; }
    // 4. any
    chosenVoice = voices[0]; voiceSelect.value = chosenVoice.voiceURI; cfg.voiceURI = chosenVoice.voiceURI;
  }

  function speak(text) {
    if (!cfg.voice || !text || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (chosenVoice) u.voice = chosenVoice;
      u.rate = 0.98;   // calmer, more natural than the rushed default
      u.pitch = 1.0;
      u.volume = 1.0;
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  // voices load asynchronously in most browsers
  if ('speechSynthesis' in window) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  } else {
    voiceRow.hidden = true;
  }

  function haptic(p) { if (cfg.vibrate) try { navigator.vibrate(p); } catch (e) {} }

  // ---------- Background music ----------
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
      speak(`Round ${p.round}. ${p.side} side. Stretch.`);
      haptic(220);
      sideEl.textContent = p.side.toUpperCase(); sideEl.style.color = 'var(--accent)';
      phaseEl.textContent = 'STRETCH';
    } else if (p.type === 'recover') {
      speak(p.nextStretch > p.stretch ? 'Relax. Next stretch.' : 'Relax. Switch.');
      haptic([110, 60, 110]);
      sideEl.textContent = 'SWITCH'; sideEl.style.color = 'var(--muted)';
      phaseEl.textContent = 'SWITCH';
    } else if (p.type === 'rest') {
      speak(p.nextStretch > p.stretch ? `Rest. Stretch ${p.nextStretch}.` : 'Rest.');
      haptic([160, 80, 160]);
      sideEl.textContent = 'REST'; sideEl.style.color = 'var(--rest)';
      phaseEl.textContent = 'REST';
    }
    stretchLabel.textContent = `Stretch ${p.stretch} / ${cfg.stretches}`;
    roundLabel.textContent = `Round ${p.round} / ${cfg.reps}`;
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

    if (remaining > 0 && remaining <= 3.05) {
      const count = Math.ceil(remaining);
      if (count !== state.lastCount && count >= 1 && count <= 3) {
        state.lastCount = count;
        beep(count === 1 ? 1320 : 880, 0.16);
        if (p.type === 'hold') speak(String(count));
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
    doneOverlay.classList.remove('is-active');
    showScreen(runScreen);
    ensureAudio();
    if (cfg.music) startMusic();
    requestWakeLock();
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
    stopMusic(); releaseWakeLock();
    setPhaseTheme('idle');
    showScreen(cfgScreen);
    pauseBtn.querySelector('span').textContent = '⏸ Pause';
  }
  function finish() {
    state.running = false;
    cancelAnimationFrame(state.raf);
    speak('All done. Great job.');
    haptic([300, 80, 300, 80, 500]);
    stopMusic(); releaseWakeLock();
    setPhaseTheme('done');
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
    cfg.voiceURI  = voiceSelect.value || cfg.voiceURI;
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

  voiceSelect.addEventListener('change', () => {
    const found = voices.find(v => v.voiceURI === voiceSelect.value);
    if (found) { chosenVoice = found; cfg.voiceURI = found.voiceURI; }
    saveSettings();
  });
  $('#opt-music').addEventListener('change', () => { toggleVolRow(); saveSettings(); });
  volSlider.addEventListener('input', () => { updateVolLabel(); setMusicVolume(parseFloat(volSlider.value)); saveSettings(); });
  ['cfg-hold', 'cfg-recover', 'cfg-rest', 'cfg-stretches', 'cfg-reps'].forEach((id) =>
    document.getElementById(id).addEventListener('input', () => { updateSummary(); saveSettings(); }));
  ['opt-voice', 'opt-beeps', 'opt-vibrate'].forEach((id) =>
    document.getElementById(id).addEventListener('change', saveSettings));

  // ---------- Init ----------
  loadSettings();
  applyConfigToInputs();
  updateSummary();
})();
