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

/* ---------- Background music (real track, procedural pad fallback) ---------- */
const tracks: Record<'stretch' | 'box', HTMLAudioElement> = {
  stretch: new Audio('audio/happy-summer-116584.mp3'),
  box: new Audio('audio/shadow-boxing-476827.mp3'),
};
Object.values(tracks).forEach((a) => { a.loop = true; a.preload = 'auto'; });

let musicOn = false;
interface Pad { master: GainNode; oscs: { o: OscillatorNode; lfo: OscillatorNode }[]; fLfo: OscillatorNode }
let pad: Pad | null = null;

export function startMusic(): void {
  if (musicOn || !cfg().music) return;
  musicOn = true;
  const a = tracks[cfg().mode];
  a.volume = cfg().volume;
  a.play().catch(() => startPadFallback());
}

export function stopMusic(): void {
  if (!musicOn) return;
  musicOn = false;
  Object.values(tracks).forEach((a) => { a.pause(); a.currentTime = 0; });
  stopPadFallback();
}

export function setMusicVolume(v: number): void {
  Object.values(tracks).forEach((a) => { if (!a.paused) a.volume = v; });
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
