#!/usr/bin/env bash
# One-shot dev launcher. Starts backend on 8787 + frontend on 5173 in the
# foreground; kills both cleanly on Ctrl+C.
#
#   ./dev.sh          # start both
#   ./dev.sh check    # just verify what's currently running
#
# Why not docker-compose: both services have live-reload that's nicer to
# read in a terminal pane than docker logs.

set -euo pipefail

cd "$(dirname "$0")"

if [[ "${1:-}" == "check" ]]; then
  echo "── service status ────────────────────────────────────────────────"
  printf "  backend  (8787) : "
  if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8787/api/health; then
    echo "✓ live"
    curl -s http://127.0.0.1:8787/api/health | sed 's/^/                  /'
  else
    echo "✗ DOWN — run ./dev.sh"
  fi
  printf "  frontend (5173) : "
  if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:5173; then
    echo "✓ live"
  else
    echo "✗ DOWN — run ./dev.sh"
  fi
  exit 0
fi

echo "── booting backend on :8787 ────────────────────────────────────────"
(cd backend_py && MOCK_MODE=false python -m uvicorn sceneos_py.app:app --reload --port 8787) &
BACKEND_PID=$!

echo "── booting frontend on :5173 ───────────────────────────────────────"
(cd frontend && npm run dev) &
FRONTEND_PID=$!

cleanup() {
  echo
  echo "── stopping services ────────────────────────────────────────────"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait
