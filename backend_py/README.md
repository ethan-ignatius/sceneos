# SceneOS Python Backend

Python/LangGraph implementation of the SceneOS backend contract.

Run:

```bash
cd backend_py
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp ../backend/.env .env
uvicorn sceneos_py.app:app --reload --port 8787
```

Useful checks:

```bash
pytest
```

The frontend can point at this service with:

```bash
VITE_API_BASE_URL=http://localhost:8787 npm run dev
```

The agent is implemented as a LangGraph state graph. It always scores beat
sufficiency before allowing `markSufficient`, so generation only receives
prompts after the active beat has enough subject/action/setting/framing/mood
coverage.
