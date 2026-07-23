# 🧘 Stretch Timer

A mobile-first, offline-friendly interval timer for stretching. Hold &middot; recover &middot; rest &middot; alternate sides — with precise countdown cues and real background music.

![status](https://img.shields.io/badge/platform-mobile%20%2F%20web-6d8bff)

## Features

- **Precise timing** — driven by `performance.now()`, so the 3-2-1 countdown lands exactly on the beat (no drift, unlike a shell `say` loop).
- **Voice cues** — spoken round + side announcements via the Web Speech API ("Round 3. Right side. Stretch.").
- **Countdown beeps** — Web Audio tones for the last 3 seconds (higher pitch on "1").
- **Left / right alternation** — odd rounds = left, even rounds = right, per stretch.
- **Stretches × rounds structure** — e.g. 3 stretches × 10 rounds. Each stretch is announced; a breather is inserted between stretches.
- **Rest between sides** — optional longer rest phase (distinct purple ring) inserted between holds. Set to `0` to disable.
- **Haptics** — vibration on phase transitions (Android / supported devices).
- **Screen wake lock** — display stays awake during the session.
- **Background music** — loops a real track (`audio/happy-summer-116584.mp3`) with an adjustable volume slider. Falls back to a procedural ambient pad if the file is missing.
- **Saved settings** — config persisted to `localStorage`; your last setup is restored on reload.
- **Installable PWA** — add to Home Screen for a full-screen, app-like experience. Works offline.

## Quick start

It's static — just open `index.html`. Or serve it for proper PWA / wake-lock / audio support:

```bash
cd ~/me/tmp/stretching-app
python3 -m http.server 8080
# then visit http://localhost:8080 on your phone (same Wi-Fi)
```

For remote access from your phone, serve over your LAN IP and open that address.

## Controls

| Action | Button |
|---|---|
| Begin session | **Start** |
| Pause / resume | **⏸ Pause** |
| Jump to next phase | **⏭ Skip** |
| Stop & return to setup | **⏹ Stop** |

## Config

| Setting | Default | Notes |
|---|---|---|
| Hold | 30 s | per stretch hold |
| Recovery | 5 s | quick "switch sides" between every hold |
| Rest between sides | 0 s (off) | longer rest phase; `0` disables |
| Stretches | 1 | number of distinct exercises |
| Rounds | 10 | holds per stretch (alternates L/R) |
| Voice / Beeps / Vibration / Music | on / on / on / off | toggles |
| Volume | 35% | music volume |

## How the timing works

A single `requestAnimationFrame` loop computes elapsed time from `performance.now()`. The countdown beep fires the moment `remaining` crosses an integer threshold (3 → 2 → 1), so it is accurate to within one animation frame (~16 ms) regardless of how long a spoken cue takes. Spoken counts are layered on top during the hold phase only, keeping the short recovery phase clean.

The session is compiled into a **plan** (an array of `hold` / `recover` / `rest` phases) before starting, so skip/pause/stop simply advance an index or freeze the clock — no scheduling drift.

## Browser support

| Feature | iOS Safari | Android Chrome | Desktop |
|---|---|---|---|
| Timer + beeps | ✅ | ✅ | ✅ |
| Voice cues | ✅ (unlocked by first tap) | ✅ | ✅ |
| Wake lock | ✅ 16.4+ | ✅ | ✅ |
| Vibration | — | ✅ | — |
| Background music | ✅ | ✅ | ✅ |

## License

MIT — do whatever you like.
