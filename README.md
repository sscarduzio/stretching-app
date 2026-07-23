# 🧘 Stretch Timer

A mobile-first, offline-friendly interval timer for stretching. Hold · recover · rest · alternate sides — with a drift-free countdown, a live session dashboard, and a gentle baked-in voice.

![status](https://img.shields.io/badge/platform-mobile%20%2F%20web-6d8bff)

> **Live:** https://sscarduzio.github.io/stretching-app/

## Features

- **Precise timing** — `performance.now()`-driven, so the 3-2-1 countdown lands exactly on the beat (no drift, unlike a shell `say` loop).
- **Gentle baked-in voice** — cues are pre-generated with OpenAI's softest female voice (Shimmer), spoken slowly with a calm yoga-instructor direction, and shipped as static audio atoms. **No API key, no selectors, no runtime TTS calls.** Cues are decomposed into reusable clips and sequenced with small gaps that read as natural pauses.
- **Active-session dashboard** — wall clock + ETA, overall completion donut, elapsed/remaining/holds gauges, a rep grid (done/current/upcoming), a hold/recover/rest time-split bar, and a "next up" card.
- **Countdown beeps** — Web Audio tones for the last 3 seconds (higher pitch on "1").
- **Left / right alternation** — odd rounds = left, even rounds = right, per stretch.
- **Stretches × rounds structure** — e.g. 3 stretches × 10 rounds.
- **Rest between sides** — optional longer rest phase (purple ring); `0` disables.
- **Haptics**, **screen wake lock**, **background music** (loops a real track, with a procedural pad fallback).
- **Installable PWA** — add to Home Screen; works offline. Settings saved on-device.

## Voice — how it works

The spoken phrases are finite, so they're generated **once at build time** and committed as ~41 tiny MP3s in `audio/voice/`:

| Atoms | Example text |
|---|---|
| `round_1` … `round_20` | "Round 1." … "Round 20." |
| `left_stretch` / `right_stretch` | "Left side. Stretch." / "Right side. Stretch." |
| `relax_switch` / `relax_next` | "Relax. Switch." / "Relax. Next stretch." |
| `rest` / `rest_stretch_1` … `rest_stretch_12` | "Rest." / "Rest. Stretch 2." |
| `count_1` / `count_2` / `count_3` | "1" / "2" / "3" |
| `done` | "All done. Great job." |

A hold announcement = `round_N` + `side_stretch` played in sequence with a ~140 ms gap — the gap becomes a natural yoga-teacher breath. At Start, the app preloads the atoms the session will use; playback is instant via Web Audio `AudioBufferSourceNode`. If any atom is missing, that cue is silent and the beeps still fire (graceful degradation).

### Regenerating the voice

```bash
OPENAI_API_KEY=sk-... bash scripts/generate-voice.sh
```

The script is idempotent (skips existing files). Tweak the voice/speed/direction with env vars:

```bash
VOICE=sage MODEL=gpt-4o-mini-tts SPEED=0.75 \
  OPENAI_API_KEY=sk-... bash scripts/generate-voice.sh
```

The key is used only by the script (build time); it is never in the app, never in the repo, and never requested at runtime.

## Quick start

```bash
cd ~/me/tmp/stretching-app
python3 -m http.server 8080
# visit http://localhost:8080 (or your LAN IP from a phone)
```

## Controls

| Action | Button |
|---|---|
| Begin session | **Start** |
| Pause / resume | **⏸ Pause** |
| Jump to next phase | **⏭ Skip** |
| Stop & return to setup | **⏹ Stop** |

## Config

Hold · Recovery · Rest between sides · Stretches · Rounds · Voice / Beeps / Vibration / Music (with volume). Defaults: 30 s hold, 5 s recovery, 10 rounds.

## License

MIT — do whatever you like.
