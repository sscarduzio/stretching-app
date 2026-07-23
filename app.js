(() => {
  'use strict';

  /* ============================================================
     Stretch Timer  ·  glassy edition + premium OpenAI TTS
     - performance.now()-driven, drift-free countdown
     - plan engine: hold / recover / rest  (stretches × rounds)
     - Voice engines:
         · system  → speechSynthesis (embedded OS voices)
         · premium → OpenAI gpt-4o-mini-tts neural voices
            - prefetch all session phrases at Start
            - IndexedDB cache (generate once, instant forever)
            - calm "yoga instructor" voice direction
            - graceful fallback to system voice on any failure
     - Web Audio beeps, haptics, wake lock, real background track
     - settings persisted to localStorage (API key stays on device)
     ============================================================ */

  const STORAGE_KEY = 'stretchTimer.settings.v3';
  const IDB_NAME = 'stretchTimer.tts';
  const IDB_STORE = 'clips';
  const OPENAI_ENDPOINT = 'https://api.openai.com/v1/audio/speech';

  const DEFAULTS = {
    hold: 30, recover: 5, rest: 0, stretches: 1, reps: 10,
    voice: true, voiceURI: null,
    engine: 'system',          // 'system' | 'premium'
    ttsVoice: 'nova',
    ttsModel: 'gpt-4o-mini-tts',
    ttsSpeed: 0.8,             // speech speed multiplier (0.7 calm – 1.0 normal)
    apiKey: '',
    beeps: true, vibrate: true, music: false, volume: 0.35,
  };
  const cfg = { ...DEFAULTS };

  const VOICE_PREFERENCE = [
    'Ava', 'Evan', 'Aaron', 'Nora', 'Luke', 'Oliver', 'Serena', 'Zoe',
    'Samantha', 'Allison', 'Susan', 'Daniel', 'Karen', 'Tessa', 'Moira',
    'Google US English', 'Google UK English Female', 'Microsoft Aria',
    'Microsoft Jenny', 'Siri',
  ];

  // Voice direction for gpt-4o-mini-tts / gpt-4o-tts (ignored by tts-1*).
  // Explicit, vivid steering: the model responds to concrete descriptions
  // of pace, breath, pauses and mood — not just the word "calm".
  const TTS_INSTRUCTIONS =
    'You are a calm, soothing yoga and meditation instructor. ' +
    'Speak very slowly and gently, with a warm, relaxed, unhurried tone. ' +
    'Breathe softly between phrases and let each word linger. ' +
    'Pause briefly after every sentence. Never rush. ' +
    'Keep a peaceful, comforting, spa-like pace throughout, ' +
    'as if gently guiding someone through a slow stretch.';

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
  const doneStats = $('#done-stats');
  const bgAudio = $('#bg-audio');
  const voiceSelect = $('#cfg-voice');
  const voiceRow = $('#voice-row');
  const premiumPanel = $('#premium-panel');
  const ttsVoiceSelect = $('#cfg-tts-voice');
  const ttsModelSelect = $('#cfg-tts-model');
  const ttsSpeedSelect = $('#cfg-tts-speed');
  const apiKeyInput = $('#cfg-api-key');
  const testVoiceBtn = $('#test-voice-btn');
  const ttsStatus = $('#tts-status');

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
  //  Premium TTS engine (OpenAI) + IndexedDB cache
  // ============================================================
  const tts = {
    mem: new Map(),        // key -> ArrayBuffer
    inflight: new Map(),   // key -> Promise<ArrayBuffer>
    decoded: new Map(),    // key -> AudioBuffer
  };

  // Compact hash so the cache key reflects instructions + speed —
  // changing either invalidates the cache and regenerates with the new voice.
  function strHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

  function ttsKey(text) {
    const instr = cfg.ttsModel.startsWith('gpt-4o') ? strHash(TTS_INSTRUCTIONS) : 'none';
    return `${cfg.ttsModel}|${cfg.ttsVoice}|${cfg.ttsSpeed}|${instr}|${text}`;
  }

  // --- IndexedDB helpers (promise-wrapped) ---
  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  let _idb = null;
  async function idb() { if (!_idb) _idb = await idbOpen(); return _idb; }
  function idbGet(key) {
    return new Promise(async (resolve) => {
      try {
        const db = await idb();
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }
  function idbPut(key, buf) {
    return new Promise(async (resolve) => {
      try {
        const db = await idb();
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(buf, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) { resolve(); }
    });
  }

  function premiumReady() {
    return cfg.engine === 'premium' && cfg.apiKey && cfg.apiKey.trim().length > 10;
  }

  async function openaiSpeech(text) {
    const body = {
      model: cfg.ttsModel,
      voice: cfg.ttsVoice,
      input: text,
      response_format: 'mp3',
      speed: cfg.ttsSpeed,            // slows delivery (0.8 = noticeably calmer)
    };
    if (cfg.ttsModel.startsWith('gpt-4o')) body.instructions = TTS_INSTRUCTIONS;
    const res = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); msg = j.error?.message || msg; } catch (e) {}
      throw new Error(msg);
    }
    return await res.arrayBuffer();
  }

  // Fetch a phrase (cache-backed: memory → IndexedDB → network)
  async function ttsFetch(text) {
    const key = ttsKey(text);
    if (tts.mem.has(key)) return tts.mem.get(key);
    if (tts.inflight.has(key)) return tts.inflight.get(key);
    const p = (async () => {
      let buf = await idbGet(key);
      if (!buf) {
        buf = await openaiSpeech(text);
        idbPut(key, buf);
      }
      tts.mem.set(key, buf);
      return buf;
    })();
    tts.inflight.set(key, p);
    try { return await p; } finally { tts.inflight.delete(key); }
  }

  async function ttsDecode(key, buf) {
    if (tts.decoded.has(key)) return tts.decoded.get(key);
    const ab = await ensureAudio().decodeAudioData(buf.slice(0));
    tts.decoded.set(key, ab);
    return ab;
  }

  // Play a cached premium clip via Web Audio (low latency)
  async function playPremium(text) {
    const key = ttsKey(text);
    const buf = await ttsFetch(text);
    const audioBuf = await ttsDecode(key, buf);
    const src = ensureAudio().createBufferSource();
    src.buffer = audioBuf;
    const g = ensureAudio().createGain();
    g.gain.value = 1.0;
    src.connect(g).connect(ensureAudio().destination);
    src.start();
  }

  // Prefetch a list of phrases with bounded concurrency.
  // Returns {ok, failed} counts.
  async function prefetchPhrases(phrases, onProgress) {
    const unique = [...new Set(phrases)];
    let ok = 0, failed = 0;
    const CONCURRENCY = 4;
    let i = 0;
    async function worker() {
      while (i < unique.length) {
        const idx = i++;
        try { await ttsFetch(unique[idx]); ok++; }
        catch (e) { failed++; }
        onProgress && onProgress(ok + failed, unique.length);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker));
    return { ok, failed };
  }

  // ============================================================
  //  System voice (speechSynthesis) — fallback / system engine
  // ============================================================
  let voices = [];
  let chosenVoice = null;
  function loadVoices() {
    if (!('speechSynthesis' in window)) { voiceRow.hidden = true; return; }
    voices = speechSynthesis.getVoices();
    if (!voices.length) return;
    const en = voices.filter(v => /en(-|_)/i.test(v.lang));
    const others = voices.filter(v => !/en(-|_)/i.test(v.lang));
    voiceSelect.innerHTML = '';
    [...en, ...others].forEach((v) => {
      const o = document.createElement('option');
      o.value = v.voiceURI; o.textContent = `${v.name} · ${v.lang}`;
      voiceSelect.appendChild(o);
    });
    pickVoice();
  }
  function pickVoice() {
    if (!voices.length) return;
    if (cfg.voiceURI) {
      const f = voices.find(v => v.voiceURI === cfg.voiceURI);
      if (f) { chosenVoice = f; voiceSelect.value = f.voiceURI; return; }
    }
    for (const name of VOICE_PREFERENCE) {
      const f = voices.find(v => v.name === name || v.name.includes(name));
      if (f) { chosenVoice = f; voiceSelect.value = f.voiceURI; cfg.voiceURI = f.voiceURI; return; }
    }
    const en = voices.find(v => /en(-|_)/i.test(v.lang));
    if (en) { chosenVoice = en; voiceSelect.value = en.voiceURI; cfg.voiceURI = en.voiceURI; return; }
    chosenVoice = voices[0]; voiceSelect.value = chosenVoice.voiceURI; cfg.voiceURI = chosenVoice.voiceURI;
  }
  function speakSystem(text) {
    if (!cfg.voice || !text || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (chosenVoice) u.voice = chosenVoice;
      u.rate = 0.98; u.pitch = 1.0; u.volume = 1.0;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  else { voiceRow.hidden = true; }

  // ============================================================
  //  Unified speak() — routes to premium or system with fallback
  // ============================================================
  function speak(text) {
    if (!cfg.voice || !text) return;
    if (premiumReady()) {
      playPremium(text).catch((e) => {
        // any failure (network/quota/decode) → system voice so timing stays tight
        console.warn('Premium TTS failed, falling back:', e.message);
        speakSystem(text);
      });
    } else {
      speakSystem(text);
    }
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

  // Collect every spoken phrase in the plan (for prefetch)
  function planPhrases() {
    const plan = buildPlan();
    const totalHolds = cfg.stretches * cfg.reps;
    let holdIndex = 0;
    const out = [];
    for (const p of plan) {
      if (p.type === 'hold') {
        out.push(`Round ${p.round}. ${p.side} side. Stretch.`);
      } else if (p.type === 'recover') {
        out.push(p.nextStretch > p.stretch ? 'Relax. Next stretch.' : 'Relax. Switch.');
      } else if (p.type === 'rest') {
        out.push(p.nextStretch > p.stretch ? `Rest. Stretch ${p.nextStretch}.` : 'Rest.');
      }
    }
    out.push('1', '2', '3', 'All done. Great job.');
    return [...new Set(out)];
  }

  // ---------- Dashboard helpers ----------
  function fmtClock(ms) {
    const d = new Date(ms);
    const h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
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
    if (cfg.music) startMusic();
    requestWakeLock();
    updateWallClock();
    clearInterval(state.clockTimer);
    state.clockTimer = setInterval(updateWallClock, 1000);
    startPhase();
    // Pre-warm premium voice cache for the whole session (async, non-blocking)
    if (premiumReady()) prefetchPhrases(planPhrases()).catch(() => {});
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
    stopMusic(); releaseWakeLock();
    setPhaseTheme('idle');
    showScreen(cfgScreen);
    pauseBtn.querySelector('span').textContent = '⏸ Pause';
  }
  function finish() {
    state.running = false;
    cancelAnimationFrame(state.raf);
    clearInterval(state.clockTimer);
    speak('All done. Great job.');
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
    cfg.voiceURI  = voiceSelect.value || cfg.voiceURI;
    cfg.engine    = document.querySelector('.seg.is-active')?.dataset.engine || 'system';
    cfg.ttsVoice  = ttsVoiceSelect.value;
    cfg.ttsModel  = ttsModelSelect.value;
    cfg.ttsSpeed  = parseFloat(ttsSpeedSelect.value) || 1;
    cfg.apiKey    = apiKeyInput.value;
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
    // voice engine
    document.querySelectorAll('.seg').forEach(b => b.classList.toggle('is-active', b.dataset.engine === cfg.engine));
    ttsVoiceSelect.value = cfg.ttsVoice;
    ttsModelSelect.value = cfg.ttsModel;
    ttsSpeedSelect.value = cfg.ttsSpeed;
    apiKeyInput.value = cfg.apiKey;
    toggleEnginePanels();
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
  function toggleEnginePanels() {
    const engine = document.querySelector('.seg.is-active')?.dataset.engine || 'system';
    premiumPanel.hidden = (engine !== 'premium');
    voiceRow.hidden = (engine !== 'system') || !('speechSynthesis' in window);
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

  // Voice engine segmented control
  document.querySelectorAll('.seg').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.seg').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      toggleEnginePanels();
      saveSettings();
      beep(660, 0.05);
    });
  });

  voiceSelect.addEventListener('change', () => {
    const f = voices.find(v => v.voiceURI === voiceSelect.value);
    if (f) { chosenVoice = f; cfg.voiceURI = f.voiceURI; }
    saveSettings();
  });
  [ttsVoiceSelect, ttsModelSelect, ttsSpeedSelect, apiKeyInput].forEach((el) =>
    el.addEventListener('change', () => { readConfig(); saveSettings(); }));
  apiKeyInput.addEventListener('input', () => { cfg.apiKey = apiKeyInput.value; saveSettings(); });

  // Test voice button
  testVoiceBtn.addEventListener('click', async () => {
    readConfig(); saveSettings();
    ttsStatus.textContent = ''; ttsStatus.className = 'tts-status';
    if (!premiumReady()) {
      ttsStatus.textContent = 'Enter an API key first.'; ttsStatus.className = 'tts-status err'; return;
    }
    testVoiceBtn.disabled = true;
    ttsStatus.textContent = 'Generating…';
    try {
      ensureAudio();
      await playPremium('Round one. Left side. Stretch.');
      ttsStatus.textContent = '✓ Sounds great'; ttsStatus.className = 'tts-status ok';
    } catch (e) {
      ttsStatus.textContent = `✗ ${e.message}`; ttsStatus.className = 'tts-status err';
    } finally {
      testVoiceBtn.disabled = false;
    }
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
