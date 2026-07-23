#!/usr/bin/env bash
# ============================================================
#  Normalize the baked-in voice atoms to a consistent loudness.
#
#  Two-pass EBU R128 loudnorm (ffmpeg):
#    pass 1 — measure integrated loudness, true peak, LRA, threshold
#    pass 2 — apply linear normalization with measured values (exact)
#
#  Target:  -16 LUFS integrated (podcast / streaming speech standard)
#           -1.5 dBTP true peak (no clipping)
#           LRA 11 (allow natural speech dynamics)
#
#  This fixes two problems:
#    1. Atoms were inconsistent (up to 10 dB spread between clips).
#    2. Voice sat ~5-7 dB below the music, even at 35% music volume,
#       so cues were masked — especially boxe combos under the beat.
#
#  Safe to re-run: files already at target are barely touched.
#
#  Usage:
#    bash scripts/normalize-voice.sh            # all atoms
#    bash scripts/normalize-voice.sh round_1    # specific atom(s)
#    LOUDNESS=-14 bash scripts/normalize-voice.sh   # custom target
# ============================================================
set -euo pipefail

VOICE_DIR="audio/voice"
TARGET_I="${LOUDNESS:--16}"      # target integrated loudness (LUFS)
TARGET_TP="-1.5"                 # target true peak (dBTP)
TARGET_LRA="11"                  # max loudness range
BITRATE="128k"                   # match OpenAI source quality

if [ ! -d "$VOICE_DIR" ]; then
  echo "ERROR: $VOICE_DIR not found (run from repo root)" >&2
  exit 1
fi

# Collect targets: explicit args, or all *.mp3 in the voice dir.
if [ $# -gt 0 ]; then
  files=()
  for a in "$@"; do files+=("$VOICE_DIR/${a%.mp3}.mp3"); done
else
  files=("$VOICE_DIR"/*.mp3)
fi

# Parse the loudnorm JSON (printed to stderr by pass 1) and emit
# the measured_* / offset args for pass 2 as a single shell string.
# We capture ffmpeg stderr into a var (a heredoc would steal stdin),
# then pass it to python as argv. Python 3.12+ allows same-quote
# nesting inside f-strings, so dict keys can reuse double quotes.
measure() {
  local f="$1" json_out
  json_out="$(ffmpeg -hide_banner -i "$f" \
    -af "loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:print_format=json" \
    -f null - 2>&1 >/dev/null)"
  python3 -c '
import json, sys
raw = sys.argv[1]
start = raw.find("{"); end = raw.rfind("}") + 1
d = json.loads(raw[start:end])
print(f"measured_I={d["input_i"]}"
      f":measured_TP={d["input_tp"]}"
      f":measured_LRA={d["input_lra"]}"
      f":measured_thresh={d["input_thresh"]}"
      f":offset={d["target_offset"]}")
' "$json_out"
}

normalize_one() {
  local f="$1" name tmp
  name="$(basename "$f")"
  tmp="${f%.mp3}.norm.mp3"

  local meas
  meas="$(measure "$f")"

  ffmpeg -hide_banner -loglevel error -y -i "$f" \
    -af "loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:${meas}:linear=true" \
    -c:a libmp3lame -b:a "$BITRATE" \
    "$tmp"

  # report before -> after
  local before after
  before="$(ffmpeg -hide_banner -i "$f" -af loudnorm=print_format=summary -f null - 2>&1 >/dev/null | grep "Input Integrated" | awk '{print $3}')"
  after="$(ffmpeg -hide_banner -i "$tmp" -af loudnorm=print_format=summary -f null - 2>&1 >/dev/null | grep "Input Integrated" | awk '{print $3}')"
  printf '  %-22s %s -> %s LUFS\n' "$name" "$before" "$after"

  mv "$tmp" "$f"
}

echo "▶ Normalizing ${#files[@]} atom(s) → ${TARGET_I} LUFS / ${TARGET_TP} dBTP"
for f in "${files[@]}"; do
  [ -f "$f" ] || { echo "  skip (missing): $f"; continue; }
  normalize_one "$f"
done
echo "Done."
