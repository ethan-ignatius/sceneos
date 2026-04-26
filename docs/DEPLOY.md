# SceneOS · Deployment

Two services, one domain. The frontend hits the backend over HTTPS; the backend hits Vertex + Cloudinary + Higgsfield.

```
  sceneos.us       → frontend (Vite static build)        → Vercel / Netlify / Cloudflare Pages
  api.sceneos.us   → backend (FastAPI on Cloud Run)      → GCP Cloud Run (us-central1)
```

---

## Frontend — Vercel (recommended)

Vercel autodetects Vite. Three env vars + one build command + done.

```bash
cd frontend
npm ci
vercel --prod
```

Set in the Vercel project dashboard:
| Key | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://api.sceneos.us` |
| `VITE_CLOUDINARY_CLOUD_NAME` | your Cloudinary cloud name |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | `sceneos_unsigned` |

Build settings (already encoded in `frontend/vercel.json`):
- **Framework preset:** Vite
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Install command:** `npm ci`

Add `sceneos.us` as a custom domain. Vercel handles the cert.

---

## Backend — Cloud Run

Vertex Gemini + Veo + service-account auth all live in GCP, so Cloud Run is the path of least friction.

### One-time setup

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable APIs (if not already)
gcloud services enable run.googleapis.com aiplatform.googleapis.com
```

### Containerize

`backend_py/Dockerfile`:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e .
COPY sceneos_py ./sceneos_py
ENV PORT=8080
CMD ["uvicorn", "sceneos_py.app:app", "--host", "0.0.0.0", "--port", "8080"]
```

### Deploy

```bash
cd backend_py
gcloud run deploy sceneos-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 2 \
  --timeout 300 \
  --set-env-vars "ALLOWED_ORIGIN=https://sceneos.us" \
  --set-secrets "CLOUDINARY_URL=cloudinary-url:latest,HIGGSFIELD_API_KEY=higgsfield-key:latest,HIGGSFIELD_API_SECRET=higgsfield-secret:latest"
```

For Vertex creds, attach the runtime service account directly (no `GOOGLE_APPLICATION_CREDENTIALS` needed inside the container — Cloud Run's metadata server provides them):

```bash
gcloud run services update sceneos-backend \
  --region us-central1 \
  --service-account sceneos-backend@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

The service account needs:
- `roles/aiplatform.user` (Vertex Gemini + Veo)
- `roles/aiplatform.serviceAgent`

### Custom domain

```bash
gcloud beta run domain-mappings create \
  --service sceneos-backend \
  --domain api.sceneos.us \
  --region us-central1
```

Add the CNAME / A records that Cloud Run prints to your DNS. Cert provisioning takes ~10 minutes.

---

## CORS — the gotcha

The backend reads `ALLOWED_ORIGIN` and configures FastAPI's CORSMiddleware:

```python
# sceneos_py/app.py
_origins_raw = env("ALLOWED_ORIGIN", "*") or "*"
_allow_origins = [o.strip() for o in _origins_raw.split(",")] if _origins_raw != "*" else ["*"]
```

For prod, set `ALLOWED_ORIGIN=https://sceneos.us` (no trailing slash, no wildcard). For preview deploys, set a comma list: `ALLOWED_ORIGIN=https://sceneos.us,https://sceneos-staging.vercel.app`.

If the frontend gets `Access-Control-Allow-Origin` errors, check:
1. The backend was redeployed AFTER the env var change.
2. The frontend's actual origin matches exactly (https vs http, www vs apex).
3. The preflight `OPTIONS` request is reaching `api.sceneos.us` (Cloud Run + custom domain mapping can take 10 min to propagate).

---

## Smoke test

After deploy:

```bash
# 1. Backend liveness
curl https://api.sceneos.us/api/health

# 2. CORS preflight
curl -i -X OPTIONS https://api.sceneos.us/api/agent \
  -H "Origin: https://sceneos.us" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
# → 200 with Access-Control-Allow-Origin: https://sceneos.us

# 3. Frontend
open https://sceneos.us
# → type "j" in the prompt → expect the agent to ask for clarification
# → type a real prompt → expect 7-beat decompose + canvas
```

---

## Rollback

Cloud Run keeps every revision. Roll back instantly:

```bash
gcloud run services update-traffic sceneos-backend \
  --region us-central1 \
  --to-revisions=sceneos-backend-REVISION-PRIOR=100
```

Vercel: redeploy the previous deployment from the dashboard.

---

## Cost ceiling (rough)

| Service | Free tier | What we'd use during a 24h hackathon judging window |
|---|---|---|
| Vercel | 100 GB egress / mo | ~1 GB |
| Cloud Run | 2M requests / mo, 360k vCPU-s | well under |
| Vertex Gemini 2.5 | trial credits | ~$0.50 per 1k turns |
| Vertex Veo 3 | varies by region | ~$0.50 per 8s clip |
| Cloudinary | 25 credits / mo | media + transforms ~5 credits |

Hackathon judging volume is small. Set a billing alert at $25 just in case.
