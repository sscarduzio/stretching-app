// Web Audio: beeps, pre-generated voice atoms on a single bus, music + pad fallback.
// Straight port of the vanilla engine; guards (voice/beeps/vibrate flags) live here
// so callers never have to remember them.
import { useApp } from './store';

const VOICE_DIR = 'audio/voice/';

const cfg = () => useApp.getState();

let actx: AudioContext | null = null;
export function ensureAudio(): AudioContext {
  if (!actx) actx = new AudioContext();
  if (actx.state === 'suspended') void actx.resume();
  return actx;
}

export function beep(freq = 880, dur = 0.14): void {
  if (!cfg().beeps) return;
  const ctx = ensureAudio(); const t = ctx.currentTime;
  const osc = ctx.createOscillator(); const g = ctx.createGain();
  osc.type = 'sine'; osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t); osc.stop(t + dur + 0.03);
}

// boxing 10-second warning — a real recorded triple clack (box_clapper atom,
// built from CC0 claves), played hot through the voice bus so it cuts above
// the music WITHOUT interrupting an in-flight combo call. Beeps fall back
// if the atom hasn't loaded (e.g. first cold run).
export function clapper(): void {
  if (!cfg().beeps) return;
  loadAtom('box_clapper')
    .then((ab) => {
      const ctx = ensureAudio();
      const src = ctx.createBufferSource();
      src.buffer = ab;
      const g = ctx.createGain(); g.gain.value = 1.6;
      src.connect(g).connect(voiceBus());
      src.start();
    })
    .catch(() => { [0, 160, 320].forEach((ms) => setTimeout(() => beep(1046, 0.09), ms)); });
}

export function haptic(p: number | number[]): void {
  if (cfg().vibrate) try { navigator.vibrate(p); } catch { /* unsupported */ }
}

/* ---------- Voice: static atoms, one cue at a time ---------- */
const atomCache = new Map<string, AudioBuffer>();
const atomLoading = new Map<string, Promise<AudioBuffer>>();
const activeSources: AudioBufferSourceNode[] = [];
let voiceGain: GainNode | null = null;

// Broadcast chain: gain → compressor → makeup → destination. Compressor tames
// sibilant transients; makeup lifts voice above the music. Files pre-normalized
// to -16 LUFS / -1.5 dBTP (scripts/normalize-voice.sh).
function voiceBus(): GainNode {
  if (!voiceGain) {
    const ctx = ensureAudio();
    voiceGain = ctx.createGain(); voiceGain.gain.value = 1.0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 25;
    comp.ratio.value = 2.5; comp.attack.value = 0.003; comp.release.value = 0.25;
    const makeup = ctx.createGain(); makeup.gain.value = 1.3;
    voiceGain.connect(comp).connect(makeup).connect(ctx.destination);
  }
  return voiceGain;
}

export function cutVoice(): void {
  for (const s of activeSources) { try { s.stop(); } catch { /* already stopped */ } }
  activeSources.length = 0;
}

export function loadAtom(name: string): Promise<AudioBuffer> {
  const cached = atomCache.get(name);
  if (cached) return Promise.resolve(cached);
  const loading = atomLoading.get(name);
  if (loading) return loading;
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

async function scheduleAtom(name: string, startAt: number): Promise<number> {
  const ab = await loadAtom(name);
  const ctx = ensureAudio();
  const src = ctx.createBufferSource();
  src.buffer = ab;
  src.connect(voiceBus());
  const when = Math.max(startAt, ctx.currentTime + 0.005);
  src.start(when);
  activeSources.push(src);
  src.onended = () => {
    const i = activeSources.indexOf(src);
    if (i > -1) activeSources.splice(i, 1);
  };
  return when + ab.duration;
}

export async function playSequence(names: string[], gap: number): Promise<void> {
  if (!cfg().voice || !names.length) return;
  try {
    cutVoice();
    const ctx = ensureAudio();
    let t = ctx.currentTime + 0.02;
    for (const name of names) { t = await scheduleAtom(name, t); t += gap; }
  } catch { /* missing clip — silent; beeps still fire */ }
}

export const playAtom = (name: string) => playSequence([name], 0);

// Total spoken length of a cue, from decoded buffers. Null if any atom isn't
// cached yet (first seconds of a cold start) — callers then skip the shift.
export function sequenceDuration(names: string[], gap: number): number | null {
  let d = 0.02;
  for (const n of names) {
    const b = atomCache.get(n);
    if (!b) return null;
    d += b.duration + gap;
  }
  return d - gap;
}

/* ---------- Background music (real track, procedural pad fallback) ---------- */
const tracks: Record<'stretch' | 'boxe', HTMLAudioElement> = {
  stretch: new Audio('audio/happy-summer-116584.mp3'),
  boxe: new Audio('audio/shadow-boxing-476827.mp3'),
};
Object.values(tracks).forEach((a) => { a.loop = true; a.preload = 'auto'; });

let musicOn = false;
interface Pad { master: GainNode; oscs: { o: OscillatorNode; lfo: OscillatorNode }[]; fLfo: OscillatorNode }
let pad: Pad | null = null;

// iOS ignores assignments to HTMLMediaElement.volume (hardware-buttons only),
// so music is routed element → MediaElementSource → gain → destination and
// the slider drives the gain node instead.
let musicGain: GainNode | null = null;
const trackSources = new WeakSet<HTMLAudioElement>();

function musicBus(): GainNode {
  if (!musicGain) {
    const ctx = ensureAudio();
    musicGain = ctx.createGain();
    musicGain.gain.value = cfg().volume;
    musicGain.connect(ctx.destination);
  }
  return musicGain;
}

function routeTrack(a: HTMLAudioElement): void {
  if (trackSources.has(a)) return;
  ensureAudio().createMediaElementSource(a).connect(musicBus());
  trackSources.add(a);
}

export function startMusic(): void {
  if (musicOn || !cfg().music) return;
  musicOn = true;
  const a = tracks[cfg().mode];
  routeTrack(a);
  musicBus().gain.value = cfg().volume;
  a.play().catch(() => startPadFallback());
}

// round-scoped music (boxe): from the top at each round…
export function restartMusic(): void {
  if (!cfg().music) return;
  stopPadFallback();
  const a = tracks[cfg().mode];
  routeTrack(a);
  a.currentTime = 0;
  musicBus().gain.value = cfg().volume;
  musicOn = true;
  a.play().catch(() => startPadFallback());
}

// …and silence during rest
export function pauseMusic(): void {
  if (!musicOn) return;
  Object.values(tracks).forEach((a) => a.pause());
  stopPadFallback();
  musicOn = false;
}

export function stopMusic(): void {
  if (!musicOn) return;
  musicOn = false;
  Object.values(tracks).forEach((a) => { a.pause(); a.currentTime = 0; });
  stopPadFallback();
}

export function setMusicVolume(v: number): void {
  if (musicGain) musicGain.gain.value = v;
  if (pad) pad.master.gain.value = v * 0.5;
}

function startPadFallback(): void {
  if (pad) return;
  try {
    const ctx = ensureAudio();
    const master = ctx.createGain(); master.gain.value = cfg().volume * 0.5; master.connect(ctx.destination);
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
    pad = { master, oscs, fLfo };
  } catch { pad = null; }
}

function stopPadFallback(): void {
  if (!pad) return;
  try {
    pad.oscs.forEach(({ o, lfo }) => { try { o.stop(); lfo.stop(); } catch { /* already stopped */ } });
    pad.fLfo.stop();
  } catch { /* already stopped */ }
  pad = null;
}
