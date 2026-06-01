# Deployment

## Web on Vercel

`apps/web` is deployable as a standard Next.js application.

For Vercel Git Integration, the repository uses Vercel Services through the
root [`vercel.json`](../vercel.json):

```text
Framework Preset: Services
Production Branch: main
```

The `frontend` service points to `apps/web`, is mounted at `/`, and uses the
Next.js framework. This follows Vercel's `next-fastapi-monorepo` and
`nextjs-flask` examples while keeping the Python agent separate until it has a
dedicated FastAPI/ASGI service wrapper.

If you are not using Vercel Services, configure the project as a standard
monorepo frontend instead:

```text
Framework Preset: Next.js
Root Directory: apps/web
Install Command: pnpm install --frozen-lockfile
Build Command: pnpm run build
Output Directory: .next
Production Branch: main
```

Do not add `next` to the root `package.json` to satisfy framework detection.
The monorepo root only contains Turbo workspace scripts; `next` intentionally
lives in `apps/web/package.json`.

Required production variables depend on the desired runtime:

```bash
LANGGRAPH_API_URL=
LANGGRAPH_ASSISTANT_ID=axa_prevention_coach
LANGGRAPH_AUTH_TOKEN=
LANGGRAPH_API_KEY=
LANGSMITH_API_KEY=
LANGSMITH_TENANT_ID=
MISTRAL_API_KEY=
MISTRAL_TTS_BASE_URL=https://api.mistral.ai/v1
MISTRAL_TTS_MODEL=voxtral-mini-tts-2603
MISTRAL_TTS_VOICE_ID=fr_marie_neutral
MISTRAL_TTS_RESPONSE_FORMAT=mp3
MISTRAL_TTS_CHUNK_MAX_CHARS=1800
```

`LANGGRAPH_AUTH_TOKEN`, `LANGGRAPH_API_KEY` and `LANGSMITH_API_KEY` are sent
only from the Next.js BFF to LangGraph Cloud or Agent Server. The browser never
receives LangGraph credentials. If the graph is unavailable or misconfigured,
the BFF returns an explicit error instead of generating a local answer.

## LangGraph agent

`services/agent/langgraph.json` exposes the `axa_prevention_coach` graph and
configures the Agent Server semantic store and custom authentication handler.

Local development:

```bash
cd services/agent
uv sync --group dev
uv run langgraph dev --no-browser
```

In another shell, seed the local Agent Server store:

```bash
cd services/agent
LANGGRAPH_API_URL=http://127.0.0.1:2024 uv run python scripts/seed_store.py
```

`scripts/seed_store.py` targets `LANGGRAPH_API_URL` and seeds the Agent Server
semantic store. The runtime graph uses that semantic store only and returns an
explicit warning if the store is empty or unavailable.

Cloud deployment should use workspace-scoped secrets only; never commit keys.

## GitHub Actions vs Vercel Git Integration

The repository includes:

- `ci.yml` for mandatory quality gates.
- `deploy-web.yml` as an optional manual Vercel deployment workflow.

For interview speed, Vercel Git Integration is the production deployment source
of truth. The GitHub deploy workflow is manual-only to avoid conflicting or
misleading deployment signals.
For controlled enterprise CI/CD, GitHub Actions or Azure DevOps can own the
deployment step with environment approvals.
