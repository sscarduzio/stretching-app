#!/usr/bin/env bash
# ============================================================
#  Generate the baked-in voice atoms for Stretch / Box Timer.
#
#  Usage:
#    OPENAI_API_KEY=sk-... bash scripts/generate-voice.sh          # stretch only
#    OPENAI_API_KEY=sk-... bash scripts/generate-voice.sh stretch   # stretch only
#    OPENAI_API_KEY=sk-... bash scripts/generate-voice.sh box       # boxing only
#    OPENAI_API_KEY=sk-... bash scripts/generate-voice.sh all       # both
#
#  Re-run safely: existing files are skipped (idempotent).
#  Tweak per-theme voice/speed/instructions via env vars (advanced).
# ============================================================
set -euo pipefail

THEME="${1:-stretch}"
OUT="audio/voice"
mkdir -p "$OUT"

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "ERROR: set OPENAI_API_KEY first, e.g." >&2
  echo "  OPENAI_API_KEY=sk-... bash scripts/generate-voice.sh all" >&2
  exit 1
fi

# Build the JSON body with python3 (avoids a jq dependency).
make_body() {
  python3 -c '
import json, sys
print(json.dumps({
  "model": sys.argv[1],
  "voice": sys.argv[2],
  "input": sys.argv[3],
  "speed": float(sys.argv[4]),
  "instructions": sys.argv[5],
  "response_format": "mp3",
}))
' "$MODEL" "$VOICE" "$2" "$SPEED" "$INSTR"
}

gen() {
  local name="$1" text="$2" f="$OUT/$1.mp3"
  if [ -s "$f" ]; then echo "skip  $name (exists)"; return; fi
  printf 'gen   %-20s %s\n' "$name" "$text"
  curl -s --fail https://api.openai.com/v1/audio/speech \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(make_body "$name" "$text")" \
    -o "$f"
  sleep 0.15   # gentle rate limit
}

# ============================================================
#  STRETCH theme — calm yoga instructor (Shimmer, slow)
# ============================================================
gen_stretch() {
  VOICE="${VOICE:-shimmer}"
  MODEL="${MODEL:-gpt-4o-mini-tts}"
  SPEED="${SPEED:-0.8}"
  INSTR="${INSTR:-You are a calm, soothing yoga and meditation instructor. Speak very slowly and gently, with a warm, relaxed, unhurried tone. Breathe softly between phrases and let each word linger. Pause briefly after every sentence. Never rush. Keep a peaceful, comforting, spa-like pace throughout, as if gently guiding someone through a slow stretch.}"

  echo "▶ STRETCH  voice=$VOICE · model=$MODEL · speed=$SPEED"
  echo "  Output: $OUT/  (no prefix)"

  for n in $(seq 1 20); do gen "round_$n" "Round $n."; done
  gen "left_stretch"  "Left side. Stretch."
  gen "right_stretch" "Right side. Stretch."
  gen "relax_switch" "Relax. Switch."
  gen "relax_next"   "Relax. Next stretch."
  gen "rest" "Rest."
  for n in $(seq 1 12); do gen "rest_stretch_$n" "Rest. Stretch $n."; done
  gen "count_1" "1"
  gen "count_2" "2"
  gen "count_3" "3"
  gen "done" "All done. Great job."
  echo
}

# ============================================================
#  BOX theme — energetic boxing coach (Onyx, punchy)
# ============================================================
gen_box() {
  local VOICE="${BOX_VOICE:-onyx}"
  local MODEL="${BOX_MODEL:-gpt-4o-mini-tts}"
  local SPEED="${BOX_SPEED:-1.05}"
  local INSTR="${BOX_INSTR:-You are an energetic, motivating boxing coach. Call out combinations and commands with sharp, crisp rhythm and confident authority. Be punchy, direct, and uplifting. Keep a steady, driving pace. Make each number and command land with impact, like you are standing ringside calling the action.}"

  # Temporarily override for gen()
  export VOICE MODEL SPEED INSTR

  echo "▶ BOX     voice=$VOICE · model=$MODEL · speed=$SPEED"
  echo "  Output: $OUT/  (box_ prefix)"

  # Round announcements
  for n in $(seq 1 12); do gen "box_round_$n" "Round $n."; done

  # Work / rest commands
  gen "box_work" "Hands up. Box."
  gen "box_rest" "Time. Rest."

  # Punch combinations (1=jab 2=cross 3=lead hook 4=rear hook 5=uppercut)
  gen "box_combo_12"     "One, two."
  gen "box_combo_123"    "One, two, three."
  gen "box_combo_112"    "One, one, two."
  gen "box_combo_232"    "Two, three, two."
  gen "box_combo_32"     "Three, two."
  gen "box_combo_1232"   "One, two, three, two."
  gen "box_combo_jabbody" "Jab to the body, two."
  gen "box_combo_slip"   "Slip, slip, back."
  gen "box_combo_roll"   "Roll, roll."
  gen "box_combo_djab"   "Double jab."
  gen "box_combo_hook"   "Hook, hook."
  gen "box_combo_12h"    "One, two, hook."

  # Countdown (coach style)
  gen "box_count_3" "Three"
  gen "box_count_2" "Two"
  gen "box_count_1" "One"

  # Done
  gen "box_done" "Time. Workout complete. Great work."

  echo
}

case "$THEME" in
  stretch) gen_stretch ;;
  box)     gen_box ;;
  all)     gen_stretch; gen_box ;;
  *) echo "Usage: $0 [stretch|box|all]" >&2; exit 1 ;;
esac

# Post-process: normalize all atoms to a consistent loudness (-16 LUFS)
# so cues are uniform and sit above the background music.
if command -v ffmpeg >/dev/null 2>&1; then
  echo
  bash "$(dirname "$0")/normalize-voice.sh"
else
  echo "⚠ ffmpeg not found — skipping loudness normalization" >&2
fi

echo "Done. $(ls -1 "$OUT" | wc -l | tr -d ' ') files in $OUT/ · $(du -sh "$OUT" | cut -f1)"
