# Deployment

## Web on Vercel

`apps/web` is deployable as a standard Next.js application.

Required production variables depend on the desired runtime:

```bash
LANGGRAPH_API_URL=
LANGGRAPH_ASSISTANT_ID=axa_prevention_coach
LANGGRAPH_AUTH_TOKEN=
LANGSMITH_TENANT_ID=
LANGSMITH_API_KEY=
MISTRAL_API_KEY=
```

`LANGGRAPH_AUTH_TOKEN` is sent only from the Next.js BFF to LangGraph Cloud.
The browser never receives LangGraph credentials. If the graph is unavailable or
misconfigured, the BFF returns an explicit error instead of generating a local
answer.

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

`scripts/seed_store.py` can ingest curated JSONL records and raw files from
`corpus/raw/` parsed by LiteParse. The runtime graph uses the Agent Server
semantic store only and returns an explicit warning if the store is empty or
unavailable.

Cloud deployment should use workspace-scoped secrets only; never commit keys.

## GitHub Actions vs Vercel Git Integration

The repository includes:

- `ci.yml` for mandatory quality gates.
- `deploy-web.yml` as an optional Vercel deployment workflow.

For interview speed, Vercel Git Integration can be simpler for previews.
For controlled enterprise CI/CD, GitHub Actions or Azure DevOps can own the
deployment step with environment approvals.
