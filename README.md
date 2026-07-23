# 🧘 Stretch Timer

A mobile-first, offline-friendly interval timer for stretching. Hold &middot; recover &middot; alternate sides — with precise countdown cues.

![status](https://img.shields.io/badge/platform-mobile%20%2F%20web-6d8bff)

## Features

- **Precise timing** — driven by `performance.now()`, so the 3-2-1 countdown lands exactly on the beat (no drift, unlike a shell `say` loop).
- **Voice cues** — spoken round + side announcements via the Web Speech API ("Round 3. Right side. Stretch.").
- **Countdown beeps** — Web Audio tones for the last 3 seconds (higher pitch on "1").
- **Left / right alternation** — odd rounds = left, even rounds = right.
- **Haptics** — vibration on phase transitions (Android / supported devices).
- **Screen wake lock** — display stays awake during the session.
- **Ambient music** — a gentle procedural A-minor pad generated with the Web Audio API (no audio files needed).
- **Configurable** — hold time, recovery time, rounds, and per-feature toggles.
- **Installable PWA** — add to Home Screen for a full-screen, app-like experience. Works offline.

## Quick start

It's static — just open `index.html`. Or serve it for proper PWA / wake-lock support:

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

## Defaults

| Setting | Value |
|---|---|
| Hold | 30 s |
| Recovery | 5 s |
| Rounds | 10 |

All adjustable on the setup screen.

## How the timing works

A single `requestAnimationFrame` loop computes elapsed time from `performance.now()`. The countdown beep fires the moment `remaining` crosses an integer threshold (3 → 2 → 1), so it is accurate to within one animation frame (~16 ms) regardless of how long a spoken cue takes. Spoken counts are layered on top during the hold phase only, keeping the short recovery phase clean.

## Browser support

| Feature | iOS Safari | Android Chrome | Desktop |
|---|---|---|---|
| Timer + beeps | ✅ | ✅ | ✅ |
| Voice cues | ✅ (unlocked by first tap) | ✅ | ✅ |
| Wake lock | ✅ 16.4+ | ✅ | ✅ |
| Vibration | — | ✅ | — |
| Ambient music | ✅ | ✅ | ✅ |

## License

MIT — do whatever you like.
