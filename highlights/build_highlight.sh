#!/usr/bin/env bash
# NRSC Highlights builder. Usage: build_highlight.sh project.json [out.mp4]
# Downloads ONLY marked ranges (yt-dlp --download-sections), normalizes to 1080p30 AAC 48k,
# joins with short crossfades (join.crossfade_sec, default 0.5; 0 = hard cuts). No title cards.
# HOOK: title cards would be inserted per-clip in the normalize loop (join.title_cards, currently ignored).
set -euo pipefail
# YTDLP_EXTRA: override yt-dlp client/cookie args (default mweb works around box bot-check; may cap at 360p)
J=$1; OUT=${2:-$(basename "${J%.json}").mp4}; W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
XF=$(jq -r '.join.crossfade_sec // 0.5' "$J"); N=$(jq '.clips|length' "$J"); [ "$N" -gt 0 ] || { echo "no clips"; exit 1; }
VF="scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p,setsar=1"
for i in $(seq 0 $((N-1))); do
  read -r YT IN OUTT < <(jq -r ".clips[$i]|\"\(.yt) \(.in) \(.out)\"" "$J")
  echo "clip $((i+1))/$N  $YT  $IN-$OUTT"
  for try in 1 2 3 4; do yt-dlp -q --no-warnings ${YTDLP_EXTRA:---extractor-args youtube:player_client=mweb} -f "bv*[height<=1080]+ba/b" --download-sections "*$IN-$OUTT" --force-keyframes-at-cuts \
    --merge-output-format mkv -o "$W/raw$i.%(ext)s" "https://www.youtube.com/watch?v=$YT" && break; echo "retry $try (YouTube bot-check)"; sleep 15; done
  ls "$W"/raw$i.* >/dev/null
  ffmpeg -loglevel error -y -i "$W"/raw$i.* -vf "$VF" -af "aresample=48000,aformat=channel_layouts=stereo" \
    -c:v libx264 -preset veryfast -crf 20 -c:a aac -b:a 160k "$W/n$i.mp4"
done
if [ "$N" -eq 1 ] || awk "BEGIN{exit !($XF<=0)}"; then
  for i in $(seq 0 $((N-1))); do echo "file '$W/n$i.mp4'"; done > "$W/l.txt"
  ffmpeg -loglevel error -y -f concat -safe 0 -i "$W/l.txt" -c copy "$OUT"
else
  IN=""; F=""; off=0; pv="0:v"; pa="0:a"
  for i in $(seq 0 $((N-1))); do IN+=" -i $W/n$i.mp4"; done
  for i in $(seq 1 $((N-1))); do
    d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$W/n$((i-1)).mp4")
    off=$(awk "BEGIN{print $off+$d-$XF}")
    F+="[$pv][$i:v]xfade=transition=fade:duration=$XF:offset=$off[v$i];[$pa][$i:a]acrossfade=d=$XF[a$i];"
    pv="v$i"; pa="a$i"
  done
  ffmpeg -loglevel error -y $IN -filter_complex "${F%;}" -map "[$pv]" -map "[$pa]" \
    -c:v libx264 -preset veryfast -crf 20 -c:a aac -b:a 160k -movflags +faststart "$OUT"
fi
echo "done: $OUT ($(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")s)"
