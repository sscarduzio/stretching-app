(() => {
  'use strict';

  /* ============================================================
     Stretch & Boxe Timer — glassy edition
     · drift-free performance.now() countdown
     · two modes via a MODES table (stretch / box)
     · voice = pre-generated static audio atoms (no runtime TTS)
     · live session dashboard · beeps · haptics · wake lock · music
     · settings persisted to localStorage
     ============================================================ */

  const STORAGE_KEY = 'stretchTimer.settings.v5';
  const VOICE_DIR = 'audio/voice/';

  // Countdown / loop tuning
  const RING_LEN = 100;          // pathLength-normalized ring circumference
  const COUNTDOWN_SECS = 3;      // spoken/beeped "3, 2, 1"
  const COUNTDOWN_WINDOW = 3.05; // enter window slightly early for frame jitter
  const DASH_THROTTLE_MS = 240;  // dashboard ~4fps; ring/countdown stay 60fps
  const COMBO_FIRST_AT = 5;      // first combo this many seconds into a round
  const COMBO_LAST_MARGIN = 6;   // no combo in the last N seconds (protect countdown)

  // Boxing combination atoms, cycled during work phases
  const COMBOS = [
    'box_combo_12', 'box_combo_123', 'box_combo_112', 'box_combo_232',
    'box_combo_32', 'box_combo_1232', 'box_combo_jabbody', 'box_combo_slip',
    'box_combo_roll', 'box_combo_djab', 'box_combo_hook', 'box_combo_12h',
  ];

  /* ---------- Config schema (single source of truth for min/max) ----------
     Each numeric field maps a cfg key to its input id + bounds. The HTML
     min/max attributes MUST match these. */
  const FIELDS = {
    hold:       { id: 'cfg-hold',       min: 5,  max: 300 },
    recover:    { id: 'cfg-recover',    min: 1,  max: 60  },
    rest:       { id: 'cfg-rest',       min: 0,  max: 120 },
    stretches:  { id: 'cfg-stretches',  min: 1,  max: 12  },
    reps:       { id: 'cfg-reps',       min: 1,  max: 20  },
    boxRounds:  { id: 'cfg-box-rounds', min: 1,  max: 12  },
    boxWork:    { id: 'cfg-box-work',   min: 10, max: 300 },
    boxRest:    { id: 'cfg-box-rest',   min: 0,  max: 120 },
    boxCombos:  { id: 'cfg-box-combos', min: 0,  max: 30  },
  };

  const DEFAULTS = {
    mode: 'stretch',
    hold: 30, recover: 5, rest: 0, stretches: 1, reps: 10,
    boxRounds: 6, boxWork: 60, boxRest: 20, boxCombos: 15,
    voice: true, beeps: true, vibrate: true, music: false, volume: 0.35,
  };
  const cfg = { ...DEFAULTS };

  // ---------- DOM ----------
  const $ = (s) => document.querySelector(s);
  const el = {
    cfgScreen: $('#config-screen'), runScreen: $('#run-screen'),
    doneOverlay: $('#done-overlay'), doneStats: $('#done-stats'), doneEmoji: $('#done-emoji'),
    startBtn: $('#start-btn'), pauseBtn: $('#pause-btn'),
    skipBtn: $('#skip-btn'), stopBtn: $('#stop-btn'), doneReset: $('#done-reset'),
    time: $('#time'), phaseLabel: $('#phase-label'), sideBadge: $('#side-badge'),
    ringFg: $('#ring-fg'),
    stretchLabel: $('#stretch-label'), roundLabel: $('#round-label'),
    summary: $('#summary'),
    volRow: $('#vol-row'), volSlider: $('#cfg-vol'), volVal: $('#vol-val'),
    runVol: $('#run-vol'), runVolSlider: $('#run-vol-slider'), runVolVal: $('#run-vol-val'),
    bgAudio: $('#bg-audio'),
    bgAudioBox: $('#bg-audio-box'),
    brandLogo: $('#brand-logo'), brandTitle: $('#brand-title'), brandSubtitle: $('#brand-subtitle'),
    stretchFields: $('#stretch-fields'), boxFields: $('#box-fields'),
    themeColor: $('#theme-color-meta'),
    wallClock: $('#wall-clock'), etaTime: $('#eta-time'), phaseStep: $('#phase-step'),
    nextIcon: $('#next-icon'), nextText: $('#next-text'), nextDur: $('#next-dur'),
    overallDonut: $('#overall-donut'), overallPct: $('#overall-pct'),
    statElapsed: $('#stat-elapsed'), statRemaining: $('#stat-remaining'),
    statHolds: $('#stat-holds'), statHoldsLabel: $('#stat-holds-label'),
    repGrid: $('#rep-grid'), repCount: $('#rep-count'), repTitle: $('#rep-title'),
    distHold: $('#dist-hold'), distRecover: $('#dist-recover'), distRest: $('#dist-rest'),
    lgHold: $('#lg-hold'), lgRecover: $('#lg-recover'), lgRest: $('#lg-rest'),
    lgHoldLabel: $('#lg-hold-label'),
  };

  el.ringFg.style.strokeDasharray = RING_LEN;
  el.ringFg.style.strokeDashoffset = 0;

  // ---------- State ----------
  const state = {
    running: false, paused: false,
    plan: [], idx: 0,
    phaseStart: 0, pauseAt: 0,
    raf: 0, lastCount: -1, lastDisplay: -1,
    totalTime: 0, totalPhases: 0, primaryTotal: 0,
    clockTimer: 0, lastDash: 0,
    comboPlan: [], comboPtr: 0,
  };

  // ---------- Utilities ----------
  function clampInt(v, min, max, fallback) {
    const n = parseInt(v, 10);
    return isNaN(n) ? fallback : Math.min(max, Math.max(min, n));
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const pad = (x) => x.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }
  function fmtClock(ms) {
    const d = new Date(ms);
    const pad = (x) => x.toString().padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function haptic(p) { if (cfg.vibrate) try { navigator.vibrate(p); } catch (e) {} }

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

  // ============================================================
  //  Voice — static audio atoms on a single bus (one cue at a time)
  // ============================================================
  const atomCache = new Map();
  const atomLoading = new Map();
  const activeSources = [];
  let voiceGain = null;

  function voiceBus() {
    if (!voiceGain) {
      voiceGain = ensureAudio().createGain();
      voiceGain.gain.value = 1.0;
      voiceGain.connect(ensureAudio().destination);
    }
    return voiceGain;
  }
  function cutVoice() {
    for (const s of activeSources) { try { s.stop(); } catch (e) {} }
    activeSources.length = 0;
  }
  async function loadAtom(name) {
    if (atomCache.has(name)) return atomCache.get(name);
    if (atomLoading.has(name)) return atomLoading.get(name);
    const p = (async () => {
      const res = await fetch(VOICE_DIR + name + '.mp3');
      if (!res.ok) throw new Error('no audio: ' + name);
      const ab = await ensureAudio().decodeAudioData(await res.arrayBuffer());
      atomCache.set(name, ab);
      return ab;
    })();
    atomLoading.set(name, p);
    return p;
  }
  async function scheduleAtom(name, startAt) {
    const ab = await loadAtom(name);
    const ctx = ensureAudio();
    const src = ctx.createBufferSource();
    src.buffer = ab;
    const g = ctx.createGain(); g.gain.value = 1.0;
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
  async function playSequence(names, gap = active.voiceGap) {
    if (!names.length) return;
    try {
      cutVoice();
      const ctx = ensureAudio();
      let t = ctx.currentTime + 0.02;
      for (const name of names) { t = await scheduleAtom(name, t); t += gap; }
    } catch (e) { /* missing clip — silent; beeps still fire */ }
  }
  function playAtom(name) { return playSequence([name], 0); }

  // ============================================================
  //  MODES — all per-mode behavior/data lives here.
  //  (Defined after voice helpers so it can reference them directly.)
  //  Adding a third mode = add an entry + its plan builder.
  // ============================================================ */
  function buildStretchPlan() {
    const plan = []; const totalHolds = cfg.stretches * cfg.reps; let holdIndex = 0;
    for (let s = 1; s <= cfg.stretches; s++) {
      for (let r = 1; r <= cfg.reps; r++) {
        holdIndex++;
        const side = (r % 2 === 1) ? 'left' : 'right';
        plan.push({ type: 'hold', stretch: s, round: r, side, duration: cfg.hold });
        if (holdIndex < totalHolds) {
          const nextStretch = (r === cfg.reps) ? s + 1 : s;
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
      if (r < cfg.boxRounds && cfg.boxRest > 0)
        plan.push({ type: 'rest', round: r, duration: cfg.boxRest, nextRound: r + 1 });
    }
    return plan;
  }

  const MODES = {
    stretch: {
      fieldsEl: el.stretchFields,
      brand: { logo: '🧘', title: 'Stretch', subtitle: 'Hold · recover · alternate sides' },
      themeColor: '#05060f',
      primaryType: 'hold',
      voiceGap: 0.14,
      repTitle: 'Repetitions',
      primaryLabel: 'holds',
      distPrimaryLabel: 'Hold',
      hasRecover: true,
      showStretchChip: true,
      buildPlan: buildStretchPlan,
      primaryCount: () => cfg.stretches * cfg.reps,
      preload() {
        const n = new Set(['done', 'relax_switch', 'relax_next', 'rest',
          'left_stretch', 'right_stretch', 'count_1', 'count_2', 'count_3']);
        for (let r = 1; r <= cfg.reps; r++) n.add('round_' + r);
        for (let s = 2; s <= cfg.stretches; s++) n.add('rest_stretch_' + s);
        n.forEach((x) => loadAtom(x).catch(() => {}));
      },
      speakStart: (p) => playSequence(['round_' + p.round, p.side + '_stretch']),
      speakRecover: (nextStretch) => playAtom(nextStretch ? 'relax_next' : 'relax_switch'),
      speakRest: (p) => playAtom(p.nextStretch > p.stretch ? 'rest_stretch_' + p.nextStretch : 'rest'),
      speakCount: (n) => playAtom('count_' + n),
      speakDone: () => playAtom('done'),
      sideBadge: (p) => p.type === 'hold' ? p.side.toUpperCase() : p.type === 'recover' ? 'SWITCH' : 'REST',
      phaseLabel: (p) => p.type === 'hold' ? 'STRETCH' : p.type === 'recover' ? 'SWITCH' : 'REST',
      positionChips: (p) => ({
        stretch: `Stretch ${p.stretch} / ${cfg.stretches}`,
        round: `Round ${p.round} / ${cfg.reps}`,
      }),
      nextCard(next) {
        if (next.type === 'hold') return { icon: '🤸', text: `${next.side} side · stretch` };
        if (next.type === 'recover') return { icon: '🔄', text: next.nextStretch > next.stretch ? 'Next stretch' : 'Switch sides' };
        return { icon: '💨', text: 'Rest' };
      },
      summary() {
        const holds = cfg.stretches * cfg.reps;
        const rec = Math.max(0, holds - 1);
        const restN = cfg.rest > 0 ? rec : 0;
        const total = holds * cfg.hold + rec * cfg.recover + restN * cfg.rest;
        return `<b>${holds}</b> holds · <b>${cfg.stretches}</b> stretch${cfg.stretches > 1 ? 'es' : ''} · <b>${cfg.reps}</b> round${cfg.reps > 1 ? 's' : ''} each · about <b>${fmtDur(total)}</b>`;
      },
      doneText() {
        const holds = cfg.stretches * cfg.reps;
        return `${holds} holds across ${cfg.stretches} stretch${cfg.stretches > 1 ? 'es' : ''} · about ${Math.round(state.totalTime / 60)} min`;
      },
    },

    box: {
      fieldsEl: el.boxFields,
      brand: { logo: '🥊', title: 'Boxe', subtitle: 'Shadow boxe · combos · rounds' },
      themeColor: '#100604',
      primaryType: 'work',
      voiceGap: 0.10,
      repTitle: 'Rounds',
      primaryLabel: 'rounds',
      distPrimaryLabel: 'Work',
      hasRecover: false,
      showStretchChip: false,
      buildPlan: buildBoxPlan,
      primaryCount: () => cfg.boxRounds,
      preload() {
        const n = new Set(['box_work', 'box_rest', 'box_done',
          'box_count_1', 'box_count_2', 'box_count_3']);
        for (let r = 1; r <= cfg.boxRounds; r++) n.add('box_round_' + r);
        if (cfg.boxCombos > 0) COMBOS.forEach((c) => n.add(c));
        n.forEach((x) => loadAtom(x).catch(() => {}));
      },
      speakStart: (p) => playSequence(['box_round_' + p.round, 'box_work']),
      speakRecover: () => {},
      speakRest: () => playAtom('box_rest'),
      speakCount: (n) => playAtom('box_count_' + n),
      speakDone: () => playAtom('box_done'),
      sideBadge: (p) => p.type === 'work' ? 'BOXE' : 'REST',
      phaseLabel: (p) => p.type === 'work' ? 'WORK' : 'REST',
      positionChips: (p) => ({ round: `Round ${p.round} / ${cfg.boxRounds}` }),
      nextCard(next) {
        if (next.type === 'work') return { icon: '🥊', text: `Round ${next.round} · box` };
        return { icon: '💧', text: 'Rest' };
      },
      summary() {
        const restN = cfg.boxRest > 0 ? Math.max(0, cfg.boxRounds - 1) : 0;
        const total = cfg.boxRounds * cfg.boxWork + restN * cfg.boxRest;
        const comboTxt = cfg.boxCombos > 0 ? ` · combos every ${cfg.boxCombos}s` : '';
        return `<b>${cfg.boxRounds}</b> rounds · <b>${cfg.boxWork}s</b> work · <b>${cfg.boxRest}s</b> rest${comboTxt} · about <b>${fmtDur(total)}</b>`;
      },
      doneText() {
        return `${cfg.boxRounds} rounds · ${cfg.boxWork}s work · about ${Math.round(state.totalTime / 60)} min`;
      },
    },
  };
  let active = MODES.stretch;        // reassigned by setMode() on init

  // ---------- Voice wrappers (guard cfg.voice, delegate to active mode) ----------
  function speakStart(p)   { if (cfg.voice) active.speakStart(p); }
  function speakRecover(n) { if (cfg.voice) active.speakRecover(n); }
  function speakRest(p)    { if (cfg.voice) active.speakRest(p); }
  function speakCount(n)   { if (cfg.voice) active.speakCount(n); }
  function speakCombo(n)   { if (cfg.voice) playAtom(n); }
  function speakDone()     { if (cfg.voice) active.speakDone(); }

  // ============================================================
  //  Background music (real track, procedural pad fallback)
  // ============================================================
  let musicOn = false, pad = null;
  // Pick the real-track <audio> element for the active mode.
  function musicEl() { return cfg.mode === 'box' ? el.bgAudioBox : el.bgAudio; }
  function startMusic() {
    if (musicOn || !cfg.music) return;
    musicOn = true;
    const a = musicEl();
    a.volume = cfg.volume;
    a.play().catch(() => startPadFallback());
  }
  function stopMusic() {
    if (!musicOn) return;
    musicOn = false;
    [el.bgAudio, el.bgAudioBox].forEach((a) => { a.pause(); a.currentTime = 0; });
    stopPadFallback();
  }
  function setMusicVolume(v) {
    [el.bgAudio, el.bgAudioBox].forEach((a) => { if (a && !a.paused) a.volume = v; });
    if (pad) pad.master.gain.value = v * 0.5;
  }
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
    if (!MODES[mode]) return;
    cfg.mode = mode;
    active = MODES[mode];
    document.body.dataset.mode = mode;
    el.stretchFields.hidden = (mode !== 'stretch');
    el.boxFields.hidden = (mode !== 'box');
    el.brandLogo.textContent = active.brand.logo;
    el.brandTitle.innerHTML = `${active.brand.title}<span>.</span>`;
    el.brandSubtitle.textContent = active.brand.subtitle;
    el.repTitle.textContent = active.repTitle;
    el.statHoldsLabel.textContent = active.primaryLabel;
    el.lgHoldLabel.textContent = active.distPrimaryLabel;
    if (el.themeColor) el.themeColor.setAttribute('content', active.themeColor);
    document.querySelectorAll('.mode-btn').forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on);
    });
    updateSummary();
  }

  // ---------- Plan / time ----------
  function buildPlan() { return active.buildPlan(); }
  function planDuration(plan) { return plan.reduce((s, p) => s + p.duration, 0); }
  function primaryBeforeIdx(i) {
    const t = active.primaryType;
    let n = 0;
    for (let k = 0; k < i; k++) if (state.plan[k].type === t) n++;
    return n;
  }
  // Elapsed seconds, frozen correctly while paused (uses pauseAt, not 0).
  function elapsedTotal() {
    let done = 0;
    for (let k = 0; k < state.idx; k++) done += state.plan[k].duration;
    const p = state.plan[state.idx];
    if (p) {
      const now = state.paused ? state.pauseAt : performance.now();
      done += Math.min((now - state.phaseStart) / 1000, p.duration);
    }
    return done;
  }

  // ---------- Dashboard ----------
  function renderRepGrid() {
    el.repGrid.innerHTML = '';
    const count = active.primaryCount();
    if (!active.showStretchChip || cfg.stretches === 1) {
      const row = document.createElement('div'); row.className = 'rep-dots';
      for (let i = 0; i < count; i++) {
        const dot = document.createElement('span'); dot.className = 'rep-dot'; dot.dataset.i = i; row.appendChild(dot);
      }
      const wrap = document.createElement('div'); wrap.className = 'rep-group'; wrap.appendChild(row);
      el.repGrid.appendChild(wrap);
      return;
    }
    let n = 0;
    for (let s = 1; s <= cfg.stretches; s++) {
      const group = document.createElement('div'); group.className = 'rep-group';
      const lbl = document.createElement('span'); lbl.className = 'rep-group-label'; lbl.textContent = 'S' + s;
      const dots = document.createElement('div'); dots.className = 'rep-dots';
      for (let r = 0; r < cfg.reps; r++) {
        const dot = document.createElement('span'); dot.className = 'rep-dot'; dot.dataset.i = n++; dots.appendChild(dot);
      }
      group.appendChild(lbl); group.appendChild(dots); el.repGrid.appendChild(group);
    }
  }
  function updateRepGrid() {
    const done = primaryBeforeIdx(state.idx);
    const currentN = state.plan[state.idx]?.type === active.primaryType ? done : -1;
    el.repGrid.querySelectorAll('.rep-dot').forEach((dot) => {
      const i = +dot.dataset.i;
      dot.classList.toggle('done', i < done);
      dot.classList.toggle('current', i === currentN);
    });
  }
  function renderDistBar() {
    const plan = state.plan.length ? state.plan : buildPlan();
    let prim = 0, rec = 0, rest = 0;
    for (const p of plan) {
      if (p.type === active.primaryType) prim += p.duration;
      else if (p.type === 'recover') rec += p.duration;
      else if (p.type === 'rest') rest += p.duration;
    }
    const total = prim + rec + rest || 1;
    el.distHold.style.width = (prim / total * 100) + '%';
    el.distRecover.style.width = (rec / total * 100) + '%';
    el.distRest.style.width = (rest / total * 100) + '%';
    el.lgHold.textContent = fmtDur(prim);
    el.lgRecover.textContent = fmtDur(rec);
    el.lgRest.textContent = fmtDur(rest);
  }
  function updateNextCard() {
    const next = state.plan[state.idx + 1];
    if (!next) { el.nextIcon.textContent = '🎉'; el.nextText.textContent = 'Finish'; el.nextDur.textContent = ''; return; }
    const c = active.nextCard(next);
    el.nextIcon.textContent = c.icon; el.nextText.textContent = c.text; el.nextDur.textContent = next.duration + 's';
  }
  function updateDashboard() {
    const elapsed = elapsedTotal();
    const pct = state.totalTime > 0 ? elapsed / state.totalTime : 0;
    el.overallPct.textContent = Math.round(pct * 100) + '%';
    el.overallDonut.style.strokeDashoffset = (100 * (1 - pct)).toFixed(2);
    el.statElapsed.textContent = fmtDur(elapsed);
    el.statRemaining.textContent = fmtDur(state.totalTime - elapsed);
    const done = primaryBeforeIdx(state.idx);
    el.statHolds.textContent = `${done} / ${state.primaryTotal}`;
    el.repCount.textContent = `${done} / ${state.primaryTotal}`;
    el.phaseStep.textContent = `Phase ${Math.min(state.idx + 1, state.totalPhases)} / ${state.totalPhases}`;
    updateRepGrid();
  }
  function updateWallClock() {
    el.wallClock.textContent = fmtClock(Date.now());
    el.etaTime.textContent = fmtClock(Date.now() + (state.totalTime - elapsedTotal()) * 1000);
  }

  // ---------- Phase ----------
  function setPhaseTheme(phase) { document.body.dataset.phase = phase; }
  function currentPhase() { return state.plan[state.idx]; }

  const HAPTICS = { hold: 220, work: 300, recover: [110, 60, 110], rest: [160, 80, 160] };

  function startPhase() {
    const p = currentPhase();
    if (!p) return finish();
    state.phaseStart = performance.now();
    state.lastCount = -1; state.lastDisplay = -1;
    state.comboPlan = []; state.comboPtr = 0;
    setPhaseTheme(p.type);

    speakStart(p);              // no-op unless this is a primary phase (mode filters)
    haptic(HAPTICS[p.type] || 0);
    el.sideBadge.textContent = active.sideBadge(p);
    el.sideBadge.style.color = p.type === 'rest' ? 'var(--rest)'
      : p.type === 'recover' ? 'var(--muted)' : 'var(--accent)';
    el.phaseLabel.textContent = active.phaseLabel(p);

    // schedule combo calls during a boxing work round
    if (p.type === 'work' && cfg.boxCombos > 0 && cfg.voice) {
      const lastAllowed = p.duration - COMBO_LAST_MARGIN;
      let t = COMBO_FIRST_AT, ci = Math.floor(Math.random() * COMBOS.length);
      while (t < lastAllowed) {
        state.comboPlan.push({ at: t, name: COMBOS[ci % COMBOS.length] });
        ci++; t += cfg.boxCombos;
      }
    }

    const chips = active.positionChips(p);
    if (chips.stretch) el.stretchLabel.textContent = chips.stretch;
    el.roundLabel.textContent = chips.round;
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
      el.time.textContent = display;
      el.time.classList.remove('tick'); void el.time.offsetWidth; el.time.classList.add('tick');
      state.lastDisplay = display;
    }
    el.ringFg.style.strokeDashoffset = RING_LEN * Math.min(1, elapsed / p.duration);

    const nowMs = performance.now();
    if (nowMs - state.lastDash > DASH_THROTTLE_MS) { state.lastDash = nowMs; updateDashboard(); }

    // combo calls during work (box mode)
    if (p.type === 'work' && state.comboPtr < state.comboPlan.length
        && elapsed >= state.comboPlan[state.comboPtr].at) {
      speakCombo(state.comboPlan[state.comboPtr].name);
      state.comboPtr++;
    }

    // 3-2-1 countdown (beeps always; voice only on primary phases)
    if (remaining > 0 && remaining <= COUNTDOWN_WINDOW) {
      const count = Math.ceil(remaining);
      if (count !== state.lastCount && count >= 1 && count <= COUNTDOWN_SECS) {
        state.lastCount = count;
        beep(count === 1 ? 1320 : 880, 0.16);
        if (p.type === active.primaryType) speakCount(count);
        haptic(40);
      }
    }
    if (remaining <= 0) { nextPhase(); return; }
    state.raf = requestAnimationFrame(tick);
  }

  // ---------- Lifecycle ----------
  function showScreen(screen) {
    [el.cfgScreen, el.runScreen].forEach((s) => s.classList.remove('is-active'));
    screen.classList.add('is-active');
  }

  function start() {
    readConfig(); saveSettings();
    state.plan = buildPlan(); state.idx = 0;
    state.running = true; state.paused = false;
    state.totalTime = planDuration(state.plan);
    state.totalPhases = state.plan.length;
    state.primaryTotal = active.primaryCount();
    state.lastDash = 0;
    renderRepGrid();
    renderDistBar();
    el.doneOverlay.classList.remove('is-active');
    showScreen(el.runScreen);
    ensureAudio();
    active.preload();
    if (cfg.music) startMusic();
    if (el.runVol) {
      el.runVol.hidden = !cfg.music;
      if (el.runVolSlider) el.runVolSlider.value = cfg.volume;
      if (el.runVolVal) el.runVolVal.textContent = Math.round(cfg.volume * 100) + '%';
    }
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
    el.pauseBtn.querySelector('span').textContent = '▶ Resume';
    releaseWakeLock();
  }
  function resume() {
    if (!state.paused) return;
    state.paused = false;
    state.phaseStart += performance.now() - state.pauseAt;
    el.pauseBtn.querySelector('span').textContent = '⏸ Pause';
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
    if (el.runVol) el.runVol.hidden = true;
    setPhaseTheme('idle');
    showScreen(el.cfgScreen);
    el.pauseBtn.querySelector('span').textContent = '⏸ Pause';
  }
  function finish() {
    state.running = false; state.paused = false;
    cancelAnimationFrame(state.raf);
    clearInterval(state.clockTimer);
    speakDone();
    haptic([300, 80, 300, 80, 500]);
    stopMusic(); releaseWakeLock();
    setPhaseTheme('done');
    state.idx = state.plan.length;
    updateDashboard();
    updateWallClock();
    el.doneEmoji.textContent = cfg.mode === 'box' ? '🥊' : '🎉';
    el.doneStats.textContent = active.doneText();
    el.doneOverlay.classList.add('is-active');
    el.pauseBtn.querySelector('span').textContent = '⏸ Pause';
  }

  // ---------- Config ----------
  function readConfig() {
    for (const [key, f] of Object.entries(FIELDS)) {
      cfg[key] = clampInt($('#' + f.id).value, f.min, f.max, DEFAULTS[key]);
    }
    cfg.voice   = $('#opt-voice').checked;
    cfg.beeps   = $('#opt-beeps').checked;
    cfg.vibrate = $('#opt-vibrate').checked;
    cfg.music   = $('#opt-music').checked;
    cfg.volume  = parseFloat(el.volSlider.value);
  }
  function applyConfigToInputs() {
    for (const [key, f] of Object.entries(FIELDS)) $('#' + f.id).value = cfg[key];
    $('#opt-voice').checked = cfg.voice;
    $('#opt-beeps').checked = cfg.beeps;
    $('#opt-vibrate').checked = cfg.vibrate;
    $('#opt-music').checked = cfg.music;
    el.volSlider.value = cfg.volume; updateVolLabel(); toggleVolRow();
  }
  function updateSummary() { el.summary.innerHTML = active.summary(); }
  function updateVolLabel() { el.volVal.textContent = Math.round(parseFloat(el.volSlider.value) * 100) + '%'; }
  function toggleVolRow() { el.volRow.hidden = !$('#opt-music').checked; }

  // Canonical volume setter: clamps, syncs both sliders + labels, applies, saves.
  function applyVolume(v) {
    v = Math.max(0, Math.min(1, v));
    cfg.volume = v;
    if (el.volSlider) el.volSlider.value = v;
    if (el.runVolSlider) el.runVolSlider.value = v;
    if (el.volVal) el.volVal.textContent = Math.round(v * 100) + '%';
    if (el.runVolVal) el.runVolVal.textContent = Math.round(v * 100) + '%';
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
      const input = document.getElementById(btn.dataset.target);
      const step = parseInt(btn.dataset.step, 10);
      const min = parseInt(input.min, 10), max = parseInt(input.max, 10);
      input.value = clampInt(parseInt(input.value, 10) + step, min, max, parseInt(input.value, 10));
      input.dispatchEvent(new Event('input'));
      beep(660, 0.05);
    });
  });

  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.running) return;            // no mode switch mid-session
      setMode(btn.dataset.mode);
      beep(660, 0.05);
    });
  });

  el.startBtn.addEventListener('click', start);
  el.pauseBtn.addEventListener('click', () => (state.paused ? resume() : pause()));
  el.skipBtn.addEventListener('click', skip);
  el.stopBtn.addEventListener('click', stop);
  el.doneReset.addEventListener('click', () => { el.doneOverlay.classList.remove('is-active'); stop(); });

  $('#opt-music').addEventListener('change', () => { toggleVolRow(); saveSettings(); });
  el.volSlider.addEventListener('input', () => applyVolume(parseFloat(el.volSlider.value)));
  if (el.runVolSlider) el.runVolSlider.addEventListener('input', () => applyVolume(parseFloat(el.runVolSlider.value)));
  Object.values(FIELDS).forEach((f) =>
    $('#' + f.id).addEventListener('input', () => { readConfig(); updateSummary(); saveSettings(); }));
  ['opt-voice', 'opt-beeps', 'opt-vibrate'].forEach((id) =>
    $('#' + id).addEventListener('change', saveSettings));

  // ---------- Init ----------
  loadSettings();
  applyConfigToInputs();
  setMode(cfg.mode);
  updateSummary();
})();
