#!/bin/bash
# test-agent.sh — terminal conversation loop for POST /api/agent.
#
# Builds a minimal Trailer Hook manifest from the given master prompt,
# then drives a conversation against the running backend until the agent
# calls markSufficient(). Prints the final refinedPrompt.
#
# Usage:
#   ./scripts/test-agent.sh "a blind musician who discovers she can see color through sound"
#
# Env:
#   PORT       backend port (default 8787)
#   BEAT       beat template (default "trailer.hook")
#
# Requires the backend running. With ANTHROPIC_API_KEY (or OPENAI_API_KEY)
# set in backend/.env you'll get the real LLM. Otherwise the route falls
# back to the mock agent and the loop still works for plumbing checks.

set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required (install with: brew install jq)" >&2
  exit 1
fi

PORT="${PORT:-8787}"
BASE="http://localhost:${PORT}"
MASTER_PROMPT="${1:-}"
BEAT_TEMPLATE="${BEAT:-trailer.hook}"

if [ -z "$MASTER_PROMPT" ]; then
  cat >&2 <<'EOF'
usage: ./scripts/test-agent.sh "<master idea>"
example: ./scripts/test-agent.sh "a blind musician who discovers she can see color through sound"
EOF
  exit 2
fi

PROJECT_ID="agent-test-$(date +%s)"
SCENE_ID="scene-001"
NOW="$(date -u +%FT%TZ)"

# Trailer Hook archetype mirrors backend/src/lib/beat-templates.ts.
HOOK_INTENT="First close-up of the protagonist. Make us care in three seconds."
HOOK_MOOD="intimate-hook"
HOOK_DURATION=12
HOOK_NOTES="FRAME: Intimate close-up of the protagonist. The 'connect' moment.
LENS: 35mm or 50mm at f/1.8–2.0. Shallow depth of field; everything but the eyes falls away.
MOVEMENT: Slight handheld breath — NOT static. Empathy comes from a living camera.
LIGHT: Soft key on the eyes; let the rest of the frame go dark. Catch-light is non-negotiable.
BLOCKING: Subject slightly off-center, looking toward action we don't yet see.
BEHAVIOR: One specific micro-action — a hand reaching, a glance, a swallow, hesitation. Specificity > generality.
PACE: Hold the shot. Let the audience read the face. No rapid cut."

MANIFEST=$(jq -n \
  --arg projectId "$PROJECT_ID" \
  --arg masterPrompt "$MASTER_PROMPT" \
  --arg createdAt "$NOW" \
  --arg sceneId "$SCENE_ID" \
  --arg template "$BEAT_TEMPLATE" \
  --arg intent "$HOOK_INTENT" \
  --arg mood "$HOOK_MOOD" \
  --argjson duration "$HOOK_DURATION" \
  --arg notes "$HOOK_NOTES" \
  '{
    projectId: $projectId,
    videoType: "trailer",
    masterPrompt: $masterPrompt,
    createdAt: $createdAt,
    beats: [{
      beatId: "hook",
      beatName: "Hook",
      template: $template,
      status: "questioning",
      archetype: {
        intent: $intent,
        mood: $mood,
        suggestedDuration: $duration,
        directorNotes: $notes
      },
      scenes: [{
        sceneId: $sceneId,
        conversation: [],
        approved: false
      }]
    }]
  }')

echo "─── SceneOS Director, working on: ${BEAT_TEMPLATE} ───"
echo "Master idea: \"$MASTER_PROMPT\""
echo
echo "(Type your answer after each question. Ctrl-C to abort.)"
echo

USER_MESSAGE=""
TURN=0
MAX_TURNS=8

while [ "$TURN" -lt "$MAX_TURNS" ]; do
  TURN=$((TURN + 1))

  if [ -z "$USER_MESSAGE" ]; then
    REQUEST_BODY=$(jq -n --argjson manifest "$MANIFEST" \
      '{manifest: $manifest, beatId: "hook"}')
  else
    REQUEST_BODY=$(jq -n --argjson manifest "$MANIFEST" \
      --arg userMessage "$USER_MESSAGE" \
      '{manifest: $manifest, beatId: "hook", userMessage: $userMessage}')
  fi

  RESPONSE=$(curl -sS -X POST "$BASE/api/agent" \
    -H "Content-Type: application/json" \
    -d "$REQUEST_BODY")

  if ! echo "$RESPONSE" | jq -e . >/dev/null 2>&1; then
    echo "✗ non-JSON response from /api/agent:" >&2
    echo "$RESPONSE" >&2
    exit 1
  fi

  KIND=$(echo "$RESPONSE" | jq -r '.kind // empty')

  case "$KIND" in
    question)
      QUESTION=$(echo "$RESPONSE" | jq -r '.question')
      REASONING=$(echo "$RESPONSE" | jq -r '.reasoning // ""')
      REMAINING=$(echo "$RESPONSE" | jq -r '.estimatedRemaining // 0')
      echo "DIRECTOR (~${REMAINING} more): $QUESTION"
      [ -n "$REASONING" ] && echo "  (note: $REASONING)"
      printf "YOU: "
      IFS= read -r REPLY

      # Commit prior user message + this new agent question to conversation.
      TS=$(date -u +%FT%TZ)
      MANIFEST=$(echo "$MANIFEST" | jq \
        --arg q "$QUESTION" \
        --arg userMsg "$USER_MESSAGE" \
        --arg ts "$TS" \
        '
        .beats[0].scenes[0].conversation +=
          (if $userMsg == "" then [] else [{role:"user", content:$userMsg, timestamp:$ts}] end)
          + [{role:"agent", content:$q, timestamp:$ts}]
        ')
      USER_MESSAGE="$REPLY"
      echo
      ;;
    sufficient)
      REFINED=$(echo "$RESPONSE" | jq -r '.refinedPrompt')
      SUMMARY=$(echo "$RESPONSE" | jq -r '.sceneSummary')
      DURATION=$(echo "$RESPONSE" | jq -r '.suggestedDuration')
      echo "──────────────────────────────────────────────────────────"
      echo "✓ Director has enough."
      echo "Scene summary:     $SUMMARY"
      echo "Suggested duration: ${DURATION}s"
      echo
      echo "Refined AI video prompt:"
      echo "──────────────────────────────────────────────────────────"
      echo "$REFINED"
      echo "──────────────────────────────────────────────────────────"
      exit 0
      ;;
    "")
      echo "✗ unexpected response from /api/agent:" >&2
      echo "$RESPONSE" | jq . >&2
      exit 1
      ;;
    *)
      echo "✗ unexpected response kind=$KIND" >&2
      echo "$RESPONSE" | jq . >&2
      exit 1
      ;;
  esac
done

echo "✗ stopped after $MAX_TURNS turns without sufficiency" >&2
exit 1
