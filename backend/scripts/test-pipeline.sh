#!/bin/bash
# test-pipeline.sh — end-to-end validator for the generation → Cloudinary pipeline.
#
# Usage:
#   ./scripts/test-pipeline.sh
#   ./scripts/test-pipeline.sh "A lone astronaut at a porthole, Earth in visor, golden hour"
#   PORT=8787 ./scripts/test-pipeline.sh
#
# Requires the backend running (`npm run dev`) and Cloudinary creds in .env.
# Provider auto-selects: mock by default, Higgsfield when HIGGSFIELD_API_KEY is set.

set -euo pipefail

PORT="${PORT:-8787}"
BASE="http://localhost:${PORT}"
PROMPT="${1:-A lone astronaut stands at a porthole, Earth reflected in her visor, golden hour light, cinematic, IMAX, shallow depth of field}"
DURATION="${DURATION:-8}"
PROJECT_ID="${PROJECT_ID:-test-$(date +%s)}"
BEAT_ID="${BEAT_ID:-hook}"
SCENE_ID="${SCENE_ID:-scene-001}"
MAX_POLLS="${MAX_POLLS:-60}"  # 60 × 5s = 5 min ceiling

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required (install with: brew install jq)" >&2
  exit 1
fi

echo "→ POST $BASE/api/generate"
echo "  projectId=$PROJECT_ID beat=$BEAT_ID scene=$SCENE_ID duration=${DURATION}s"
echo "  prompt: $PROMPT"
echo

GEN_RESPONSE=$(curl -sS -X POST "$BASE/api/generate" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg projectId "$PROJECT_ID" \
    --arg beatId "$BEAT_ID" \
    --arg sceneId "$SCENE_ID" \
    --arg refinedPrompt "$PROMPT" \
    --argjson durationSeconds "$DURATION" \
    '{projectId:$projectId, beatId:$beatId, sceneId:$sceneId, refinedPrompt:$refinedPrompt, durationSeconds:$durationSeconds}')")

echo "  ← $(echo "$GEN_RESPONSE" | jq -c .)"

JOB_ID=$(echo "$GEN_RESPONSE" | jq -r '.jobId // empty')
PROVIDER=$(echo "$GEN_RESPONSE" | jq -r '.provider // "?"')
POLL_MS=$(echo "$GEN_RESPONSE" | jq -r '.pollAfterMs // 5000')

if [ -z "$JOB_ID" ]; then
  echo "✗ generate did not return a jobId" >&2
  exit 1
fi

echo
echo "→ jobId=$JOB_ID provider=$PROVIDER"
echo "→ first poll in $((POLL_MS / 1000))s, then every 5s"
sleep $((POLL_MS / 1000))

for i in $(seq 1 "$MAX_POLLS"); do
  STATUS_RESPONSE=$(curl -sS "$BASE/api/status/$JOB_ID")
  STATE=$(echo "$STATUS_RESPONSE" | jq -r '.status // "?"')
  printf "  [%02d] status=%s\n" "$i" "$STATE"

  case "$STATE" in
    succeeded)
      URL=$(echo "$STATUS_RESPONSE" | jq -r '.clipUrl')
      PID=$(echo "$STATUS_RESPONSE" | jq -r '.clipPublicId')
      echo
      echo "✓ done"
      echo "  publicId: $PID"
      echo "  clipUrl:  $URL"
      if command -v open >/dev/null 2>&1; then
        open "$URL"
      fi
      exit 0
      ;;
    failed)
      ERR=$(echo "$STATUS_RESPONSE" | jq -r '.error // "(no error message)"')
      echo
      echo "✗ failed: $ERR" >&2
      exit 1
      ;;
  esac

  sleep 5
done

echo "✗ timed out after $MAX_POLLS polls" >&2
exit 1
