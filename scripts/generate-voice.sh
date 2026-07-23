#!/usr/bin/env bash
# ============================================================
#  Generate the baked-in voice atoms for Stretch Timer.
#
#  Produces ~41 tiny MP3s in audio/voice/ using OpenAI TTS:
#  the softest, most gentle female voice (Shimmer), spoken slowly
#  with a calm yoga-instructor direction. The web app plays these
#  as static assets — no API key, no selectors, no runtime calls.
#
#  Prerequisites:
#    - an OpenAI API key in the OPENAI_API_KEY env var
#    - curl + python3 (JSON building) + ffmpeg (optional, for info)
#
#  Usage:
#    OPENAI_API_KEY=sk-... bash scripts/generate-voice.sh
#
#  Re-run safely: existing files are skipped (idempotent).
#  Tweak voice/speed/instructions via the vars below.
# ============================================================
set -euo pipefail

# --- Voice direction (tweak to taste) ---
VOICE="${VOICE:-shimmer}"                 # softest, most gentle female
MODEL="${MODEL:-gpt-4o-mini-tts}"
SPEED="${SPEED:-0.8}"                      # calm, slow delivery
INSTR="${INSTR:-You are a calm, soothing yoga and meditation instructor. Speak very slowly and gently, with a warm, relaxed, unhurried tone. Breathe softly between phrases and let each word linger. Pause briefly after every sentence. Never rush. Keep a peaceful, comforting, spa-like pace throughout, as if gently guiding someone through a slow stretch.}"

OUT="audio/voice"
mkdir -p "$OUT"

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "ERROR: set OPENAI_API_KEY first, e.g." >&2
  echo "  OPENAI_API_KEY=sk-... bash scripts/generate-voice.sh" >&2
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
  printf 'gen   %-18s %s\n' "$name" "$text"
  curl -s --fail https://api.openai.com/v1/audio/speech \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(make_body "$name" "$text")" \
    -o "$f"
  sleep 0.15   # gentle rate limit
}

echo "Voice: $VOICE · Model: $MODEL · Speed: $SPEED"
echo "Output: $OUT/"
echo

# 1) Round numbers 1..20  -> "Round N."
for n in $(seq 1 20); do gen "round_$n" "Round $n."; done

# 2) Side + stretch phrases
gen "left_stretch"  "Left side. Stretch."
gen "right_stretch" "Right side. Stretch."

# 3) Recovery cues
gen "relax_switch" "Relax. Switch."
gen "relax_next"   "Relax. Next stretch."

# 4) Rest cues
gen "rest" "Rest."
for n in $(seq 1 12); do gen "rest_stretch_$n" "Rest. Stretch $n."; done

# 5) Countdown (spoken numbers)
gen "count_1" "1"
gen "count_2" "2"
gen "count_3" "3"

# 6) Completion
gen "done" "All done. Great job."

echo
echo "Done. $(ls -1 "$OUT" | wc -l | tr -d ' ') files in $OUT/"
echo "Total size: $(du -sh "$OUT" | cut -f1)"
