# SceneOS — Development setup

Two services have to be running for the app to work end-to-end.

```
  ┌────────────────────┐    HTTP     ┌──────────────────────┐    HTTPS   ┌─────────────────┐
  │  frontend (Vite)   │ ──────────► │   backend (FastAPI)  │ ─────────► │  Vertex AI      │
  │  http://:5173      │             │   http://:8787       │            │  Veo 3.1 Fast   │
  └────────────────────┘             └──────────────────────┘            │  Gemini         │
                                                │                        └─────────────────┘
                                                │ HTTPS
                                                ▼
                                       ┌─────────────────┐
                                       │  Cloudinary     │
                                       │  dghelx0al      │
                                       └─────────────────┘
```

## Ports — these are not negotiable

| service           | port  | URL                               |
|-------------------|-------|-----------------------------------|
| Frontend (Vite)   | 5173  | http://localhost:5173             |
| Backend (Uvicorn) | **8787** | http://127.0.0.1:8787          |

The frontend's `.env` has `VITE_API_BASE_URL=http://localhost:8787`. **If you start the backend on any other port, the frontend will silently fail to talk to it** — that's exactly the bug we hit. Always use `--port 8787`.

## Boot

### Backend

```bash
cd backend_py
MOCK_MODE=false python -m uvicorn sceneos_py.app:app --reload --port 8787
```

Or, if you want it backgrounded with no live-reload:

```bash
cd backend_py
python -m uvicorn sceneos_py.app:app --host 127.0.0.1 --port 8787 --log-level warning &
```

### Frontend

```bash
cd frontend
npm run dev
```

Vite picks 5173 by default. If 5173 is taken, Vite will hop to 5174 — but the backend doesn't care; it has CORS open.

## How to verify everything is wired

### 1. Backend health
```bash
curl http://127.0.0.1:8787/api/health
# → {"status":"ok","mockMode":false}
```
`mockMode:false` confirms we're hitting Vertex/Cloudinary for real, not the cached demo lane.

### 2. Gemini agent
```bash
curl -X POST http://127.0.0.1:8787/api/agent \
  -H "Content-Type: application/json" \
  -d '{
    "manifest":{
      "projectId":"p1","videoType":"trailer",
      "masterPrompt":"a monkey steals a banana",
      "createdAt":"2026-04-26T00:00:00Z",
      "beats":[{
        "beatId":"b1","template":"trailer.hook","beatName":"Hook",
        "status":"pending",
        "archetype":{"mood":"intimate-hook","intent":"establish","suggestedDuration":5,"directorNotes":""},
        "scenes":[{"sceneId":"s1","conversation":[],"approved":false}]
      }]
    },
    "beatId":"b1"
  }'
```
Expected: `{"kind":"question","question":"…","suggestedAnswers":["…","…","…"], …}`. The three `suggestedAnswers` are what feed the "or pick one" pills in the UI.

### 3. Veo 3.1 Fast dispatch
```bash
curl -X POST http://127.0.0.1:8787/api/generate \
  -H "Content-Type: application/json" \
  -d '{"projectId":"p1","beatId":"b1","sceneId":"s1","refinedPrompt":"a cinematic shot of a monkey","durationSeconds":4,"beatTemplate":"trailer.hook"}'
```
Expected: `{"jobId":"vertex::<uuid>","provider":"vertex","pollAfterMs":5000}`.
- `provider:"vertex"` = real Veo job dispatched.
- `provider:"cached"` = fell back to the demo lane (means Vertex auth failed; check `GOOGLE_APPLICATION_CREDENTIALS` in `backend_py/.env`).

### 4. Status with startedAt (the elapsed-time anchor)
```bash
curl "http://127.0.0.1:8787/api/status/vertex::<jobId>"
```
Expected fields: `status` (running/succeeded/failed), `startedAt` (ISO timestamp). `startedAt` is what keeps the GenerationPanel's bar honest across drawer close/reopen — its absence means the bar will reset to 0:00 on revisit.

### 5. Cloudinary stitch
```bash
curl -X POST http://127.0.0.1:8787/api/stitch/url \
  -H "Content-Type: application/json" \
  -d '{"manifest":{"projectId":"p1","videoType":"trailer","masterPrompt":"x","createdAt":"2026-04-26T00:00:00Z","beats":[{"beatId":"b1","template":"trailer.hook","beatName":"Hook","status":"approved","archetype":{"mood":"intimate-hook","intent":"establish","suggestedDuration":5,"directorNotes":""},"scenes":[{"sceneId":"s1","conversation":[],"approved":true,"clipPublicId":"dog","clipUrl":"https://res.cloudinary.com/demo/video/upload/dog.mp4"}]}]}}'
```
Expected: `finalUrl` containing `cloudinary.com/dghelx0al/video/upload/.../fl_layer_apply/dog.mp4`. If you see `res.cloudinary.com/demo/...`, the upload step fell through to the demo cloud — check `CLOUDINARY_CLOUD_NAME` in `backend_py/.env`.

## Required env vars (`backend_py/.env`)

| var                              | what it does                                                       |
|----------------------------------|--------------------------------------------------------------------|
| `GENERATION_PROVIDER=vertex`     | Routes /api/generate to Veo 3.1 Fast (skip → autodetect from creds)  |
| `GCP_PROJECT_ID`                 | Vertex project — used for predictLongRunning                       |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to your service-account JSON (the auth token source)          |
| `CLOUDINARY_CLOUD_NAME=dghelx0al`| Where Veo's base64 output gets uploaded                            |
| `CLOUDINARY_API_KEY`             | Server-side upload auth                                            |
| `CLOUDINARY_API_SECRET`          | Server-side upload auth                                            |

Anthropic is **not** required — the decompose continuity-bible falls back to a stub when `ANTHROPIC_API_KEY` is unset, and the per-beat prompts come back fully populated either way.

## How to spot a service problem

| symptom                                              | culprit                                                        |
|------------------------------------------------------|----------------------------------------------------------------|
| Frontend toasts "Couldn't reach the director"        | Backend isn't on 8787 (or isn't running at all)                |
| Generate dispatches but `provider:"cached"`          | Vertex auth failed → check service-account JSON path           |
| Clip generates but `clipUrl` points at demo cloud    | Cloudinary upload step fell through → check API key/secret     |
| GenerationPanel sticks on "Connecting" past ~3 min   | Network down OR Veo content-policy filtered the prompt         |
| Status returns no `startedAt`                        | Old backend build — restart uvicorn after pulling              |
| Bar resets to 0:00 every time drawer reopens         | `startedAt` not being passed through (same as above)           |
| "or pick one" pills missing in chat                  | Gemini returned no `suggestedAnswers` — usually a quota issue  |

## Voice in/out

- **In** (mic → text): browser-native `webkitSpeechRecognition`. No external service. See `frontend/src/lib/use-speech-recognition.ts`. Works in Chrome / Safari / Edge; the mic button auto-hides in Firefox via `speech.supported`.
- **Out** (agent reply spoken): browser-native `SpeechSynthesis`. See `frontend/src/lib/use-speech-synthesis.ts`. Only fires when the user submitted via voice (so typed flows stay silent).

## Quick visualizer commands

Watch a live Veo job through to completion:

```bash
JOB="vertex::$(uuidgen)"  # whatever jobId /api/generate returned
while true; do
  curl -s "http://127.0.0.1:8787/api/status/$JOB" | jq '.status, .startedAt, (.clipUrl // "—")'
  sleep 5
done
```

Tail backend logs on the `--reload` invocation to watch every request as it lands.
