# SceneOS — Frontend

Vite + React 19 + TypeScript app. The whole UX layer of SceneOS lives here.

## Quick start

```bash
cp .env.example .env       # fill in Cloudinary cloud_name + preset (optional in dev)
npm install
npm run dev                # http://localhost:5173
```

**Always run a backend alongside.** The frontend never mocks itself; it always talks to a real FastAPI server. For frontend-only dev, run the mock backend in a second terminal:

```bash
cd ../backend_py
MOCK_MODE=true uvicorn sceneos_py.app:app --reload --port 8787
# http://localhost:8787 — loads .env.mock (no keys needed)
```

See [`../docs/MOCK_BACKEND.md`](../docs/MOCK_BACKEND.md) for the contract and [`../docs/FRONTEND_BUILDOUT.md`](../docs/FRONTEND_BUILDOUT.md) for the screen-by-screen build guide.

## Structure

See `../docs/FRONTEND_PHILOSOPHY.md` for the full design language.

```
src/
├── main.tsx              # entry
├── App.tsx               # router + providers
├── index.css             # Tailwind v4 + design tokens
├── routes/               # one file per top-level route
├── components/           # feature folders
│   ├── canvas/           # R3F beat-map
│   ├── node/             # node-detail drawer
│   ├── agent/            # questionnaire bubbles
│   ├── stitch/           # stitch tray
│   └── ui/               # shared primitives
├── stores/               # Zustand
├── lib/                  # Cloudinary, api, motion presets, beat templates
└── types/                # API contract mirrored manually with backend_py
```

## Stack

- **Vite 7 + React 19 + TS 5.7**
- **Tailwind v4** via `@tailwindcss/vite`
- **Motion** for UI animation
- **GSAP** for the page-crumple showpiece
- **React Three Fiber + drei + postprocessing** for the canvas
- **@cloudinary/react + @cloudinary/url-gen**
- **Zustand** + **TanStack Query**
- **Radix primitives** + **Lucide** + **Sonner**

## Tasks

- `npm run dev` — dev server with HMR
- `npm run build` — typecheck + production bundle
- `npm run preview` — preview the production bundle
- `npm run lint` — ESLint (config minimal for hackathon)
