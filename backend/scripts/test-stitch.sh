#!/bin/bash
# test-stitch.sh — end-to-end validator for POST /api/stitch/url.
#
# Usage:
#   ./scripts/test-stitch.sh                       # plain splice
#   ./scripts/test-stitch.sh --color-grade         # per-beat mood grading
#   ./scripts/test-stitch.sh --audio samples/song  # audio overlay
#   ./scripts/test-stitch.sh --color-grade --audio samples/song
#
# Builds a 2-beat manifest (Establishing + Hook), POSTs it, opens the resulting
# Cloudinary URL in your browser. Uses Cloudinary's public `demo` cloud and
# verified-existing sample clips, so this works without any Cloudinary creds.

set -euo pipefail

PORT="${PORT:-8787}"
BASE="http://localhost:${PORT}"

COLOR_GRADE="false"
AUDIO_PUBLIC_ID=""

while [ $# -gt 0 ]; do
  case "$1" in
    --color-grade) COLOR_GRADE="true"; shift ;;
    --audio) AUDIO_PUBLIC_ID="$2"; shift 2 ;;
    -h|--help) sed -n '2,11p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required (install with: brew install jq)" >&2
  exit 1
fi

PAYLOAD=$(jq -n \
  --argjson colorGrade "$COLOR_GRADE" \
  --arg audioPublicId "$AUDIO_PUBLIC_ID" \
  '{
    colorGrade: $colorGrade,
    audioPublicId: (if $audioPublicId == "" then null else $audioPublicId end),
    manifest: {
      projectId: "test-stitch",
      videoType: "trailer",
      masterPrompt: "test",
      createdAt: "2026-04-25T00:00:00Z",
      beats: [
        {
          beatId: "establishing",
          beatName: "Establishing",
          template: "trailer.establishing",
          status: "approved",
          archetype: { intent: "Place the viewer", mood: "wide-establish", suggestedDuration: 8 },
          scenes: [{
            sceneId: "s1",
            conversation: [],
            approved: true,
            clipPublicId: "samples/sea-turtle",
            durationSeconds: 8
          }]
        },
        {
          beatId: "hook",
          beatName: "Hook",
          template: "trailer.hook",
          status: "approved",
          archetype: { intent: "Introduce the protagonist", mood: "intimate-hook", suggestedDuration: 12 },
          scenes: [{
            sceneId: "s2",
            conversation: [],
            approved: true,
            clipPublicId: "samples/dance-2",
            durationSeconds: 12
          }]
        }
      ]
    }
  }
  | with_entries(select(.value != null))')

echo "→ POST $BASE/api/stitch/url"
[ "$COLOR_GRADE" = "true" ] && echo "  colorGrade: true"
[ -n "$AUDIO_PUBLIC_ID" ] && echo "  audioPublicId: $AUDIO_PUBLIC_ID"
echo

RESPONSE=$(curl -sS -X POST "$BASE/api/stitch/url" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

ERROR=$(echo "$RESPONSE" | jq -r '.error // empty')
if [ -n "$ERROR" ]; then
  echo "✗ $ERROR" >&2
  echo "$RESPONSE" | jq . >&2
  exit 1
fi

URL=$(echo "$RESPONSE" | jq -r '.finalUrl')
THUMB=$(echo "$RESPONSE" | jq -r '.thumbnailUrl')
DUR=$(echo "$RESPONSE" | jq -r '.durationSeconds')

echo "  finalUrl:      $URL"
echo "  thumbnailUrl:  $THUMB"
echo "  durationSeconds: $DUR"
echo

CODE=$(curl -sI -o /dev/null -w "%{http_code}" "$URL")
if [ "$CODE" != "200" ]; then
  echo "✗ Cloudinary returned $CODE for finalUrl" >&2
  curl -sI "$URL" | head -5 >&2
  exit 1
fi
echo "✓ Cloudinary returned 200 for finalUrl"

if command -v open >/dev/null 2>&1; then
  open "$URL"
fi
