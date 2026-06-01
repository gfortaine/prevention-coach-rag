# Deployment

## Web on Vercel

`apps/web` is deployable as a standard Next.js application.

Required production variables depend on the desired runtime:

```bash
LANGGRAPH_API_URL=
LANGGRAPH_ASSISTANT_ID=axa_prevention_coach
LANGSMITH_TENANT_ID=
LANGSMITH_API_KEY=
OPENAI_API_KEY=
MISTRAL_API_KEY=
```

Optional retrieval fallback variables:

```bash
VERTEX_AI_SEARCH_ENDPOINT=
VERTEX_AI_SEARCH_ACCESS_TOKEN=
PINECONE_API_KEY=
PINECONE_HOST=
ELASTICSEARCH_URL=
ELASTICSEARCH_API_KEY=
ELASTICSEARCH_INDEX=axa-prevention
```

## LangGraph agent

`services/agent/langgraph.json` exposes the `axa_prevention_coach` graph and
configures the Agent Server semantic store.

Local development:

```bash
cd services/agent
uv sync --group dev
uv run langgraph dev --no-browser
```

Cloud deployment should use workspace-scoped secrets only; never commit keys.

## GitHub Actions vs Vercel Git Integration

The repository includes:

- `ci.yml` for mandatory quality gates.
- `deploy-web.yml` as an optional Vercel deployment workflow.

For interview speed, Vercel Git Integration can be simpler for previews.
For controlled enterprise CI/CD, GitHub Actions or Azure DevOps can own the
deployment step with environment approvals.

