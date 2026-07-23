# 🧘🥊 Stretch & Boxe Timer

A mobile-first, offline-friendly interval timer with **two modes** — calm stretching and shadow boxing — plus a drift-free countdown, a live session dashboard, and a gentle baked-in voice that needs no API key.

![status](https://img.shields.io/badge/platform-mobile%20%2F%20web-6d8bff)

> **Live:** https://sscarduzio.github.io/stretching-app/

## Features

- **Two modes** via a top-right switch:
  - **🧘 Stretch** — hold · recover · rest · alternate left/right sides, across *N stretches × M rounds*.
  - **🥊 Boxe** — classic round structure: *N rounds* of work with rest between, and a coach calling punch combinations on a timer.
- **Precise timing** — `performance.now()`-driven, so the 3-2-1 countdown lands exactly on the beat.
- **Baked-in voice** — cues are pre-generated static audio atoms (no runtime TTS, no API key, no selectors). Stretch uses a soft, slow yoga voice (Shimmer); Boxe uses an energetic coach (Onyx). Missing atoms fail silently; beeps still fire.
- **Live session dashboard** — wall clock + ETA, overall completion donut, elapsed/remaining/primary gauges, a rep/round grid, a time-split bar, and a "next up" card.
- **Countdown beeps** (Web Audio), **haptics**, **screen wake lock**, **background music** — a calm real track for Stretch (happy-summer) and a driving trap track for Boxe (shadow-boxing), each with a procedural pad fallback if playback is blocked.
- **Installable PWA** — add to Home Screen; works offline. Settings saved on-device.

## How it works

### Timing
A single `requestAnimationFrame` loop drives everything. Each phase has a `phaseStart` timestamp (`performance.now()`); the countdown is `duration − elapsed`. Pausing freezes `pauseAt` and resume shifts `phaseStart` by the pause duration, so there's zero drift. The 3-2-1 countdown fires in the last 3 seconds (beeps always; voice only on primary phases so recover/rest stay calm).

### Voice
Spoken phrases are finite, so they're generated **once at build time** and committed as tiny MP3s in `audio/voice/`. Cues are decomposed into reusable atoms and sequenced with small gaps (stretch: 140 ms yoga breath; boxe: 100 ms coach cadence). At Start, the app preloads the session's atoms and plays them instantly via Web Audio `AudioBufferSourceNode` on a single voice bus — starting a new cue cuts any in-flight one, so the 3-2-1 never overlaps itself or the next announcement.

All atoms are **loudness-normalized to -16 LUFS** (EBU R128, two-pass `ffmpeg loudnorm`, true peak capped at -1.5 dBTP) so cues are consistent and sit above the background music. At runtime the voice bus runs through a compressor + makeup-gain chain (broadcast voice style) that tames sibilant transients — letting high-crest clips like "slip" reach a uniform perceived level — and lifts voice ~2-3 dB above the music so the coach cuts through the beat. See `scripts/normalize-voice.sh`.

**Stretch atoms:** `round_1..20`, `left_stretch` / `right_stretch`, `relax_switch` / `relax_next`, `rest` / `rest_stretch_1..12`, `count_1..3`, `done`.
**Boxe atoms:** `box_round_1..12`, `box_work`, `box_rest`, `box_combo_*` (1-2, 1-2-3, 2-3-2, slip, roll, jab-to-body, double jab, hooks…), `box_count_1..3`, `box_done`.

### Architecture
React + TypeScript + Vite, with [zustand](https://github.com/pmndrs/zustand) for state (settings persisted to localStorage via its `persist` middleware).

- `src/engine.ts` — the drift-free timer loop, kept **outside React**. Mutable per-frame state lives in module locals; anything the UI renders is pushed into the store (ring progress at 60 fps, dashboard throttled to ~4 fps).
- `src/modes.tsx` — the `MODES` table holds all per-mode behavior (plan builder, config field schema, voice atom names, labels, theme, summary, done text). Adding a third workout mode is an entry here — no scattered mode conditionals.
- `src/audio.ts` — Web Audio: beeps, the voice-atom bus (compressor chain), background music + procedural pad fallback.
- `src/store.ts` — settings + session state; components subscribe with selectors.
- `src/components/` — `ConfigScreen` (fields rendered from the mode's schema), `RunScreen` (dashboard derived from `plan`/`idx`/`elapsed`), `DoneOverlay`.
- `src/style.css` — the original hand-rolled design system (CSS custom properties, `body[data-mode]`/`body[data-phase]` theming) carried over unchanged.

## Regenerating the voice

```bash
OPENAI_API_KEY=sk-... bash scripts/generate-voice.sh all      # both themes
OPENAI_API_KEY=sk-... bash scripts/generate-voice.sh stretch   # stretch only
OPENAI_API_KEY=sk-... bash scripts/generate-voice.sh box       # box only
```

The script is idempotent (skips existing files). Per-theme voice/speed/direction can be tweaked with env vars (`VOICE`, `BOX_VOICE`, `SPEED`, `BOX_SPEED`, etc.). The key is used only by the script at build time — never in the app, never in the repo, never requested at runtime.

## Quick start

```bash
cd stretching-app
npm install
npm run dev        # dev server (add --host to reach it from a phone on your LAN)
npm run build      # type-check + production build to dist/
```

Deploys to GitHub Pages automatically on push to `main` (`.github/workflows/deploy.yml`).

## Controls

| Action | Button |
|---|---|
| Begin session | **Start** |
| Pause / resume | **⏸ Pause** |
| Jump to next phase | **⏭ Skip** |
| Stop & return to setup | **⏹ Stop** |
| Switch workout | **🧘 / 🥊** top-right (disabled mid-session) |

## Config

One row of trainer-authored **presets** per mode (Stretch: Quick / Daily / Deep · Boxe: Beginner / Classic / HIIT), then only the knobs that matter:

**Stretch:** Hold (per side) · Stretches (exercises) · Sets (1 set = left + right). Defaults: 30 s × 1 stretch × 5 sets.
**Boxe:** Rounds · Round length · Rest. Defaults: 6 × 60 s / 20 s.

**Advanced** (collapsed): Side switch time · Rest between stretches (fires only when moving to the next exercise) · Combo pace · **Get ready** — a 10 s amber lead-in before the first phase so you can put the phone down and get into position.

Voice cues announce a phase like a coach — "Round 1, left side… stretch!" — and the phase clock starts when the sentence ends, not while she's talking.

Sound controls are a compact chip row: 🔊 Voice · ⏱ Beeps · 📳 Haptics · 🎵 Music (volume slider on both the setup and run screens).

## License

MIT — do whatever you like.
