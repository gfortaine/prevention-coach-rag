# Prevention Coach RAG

[![CI](https://github.com/gfortaine/prevention-coach-rag/actions/workflows/ci.yml/badge.svg)](https://github.com/gfortaine/prevention-coach-rag/actions/workflows/ci.yml)

Independent interview prototype for an agentic prevention assistant: a
Next.js BFF and AXA-like UI connected to a Python LangGraph agent, semantic
RAG, LangSmith observability and Mistral Voxtral text-to-speech.

Live demo: <https://axa-prevention-coach.vercel.app>

> This repository is not affiliated with or endorsed by AXA. See [NOTICE](NOTICE).

## What is implemented

```mermaid
flowchart LR
  U[User] --> WEB[Next.js web app<br/>AXA Canopée UI]
  WEB --> BFF[Next.js API / BFF<br/>/api/chat + /coach_bot]
  BFF --> LG[LangGraph Agent Server<br/>axa_prevention_coach]
  LG --> RISK[Risk + compliance nodes]
  LG --> STORE[(LangGraph semantic store<br/>Postgres + pgvector)]
  PDF[PDF prevention sources<br/>road safety, climate, natural events] --> INGEST[LiteParse ingestion adapter]
  INGEST --> STORE
  LG --> LLM[OpenAI chat model]
  LG --> LS[LangSmith traces<br/>tokens, cost, latency, CO2]
  LG --> BFF
  BFF --> TTS[Mistral Voxtral TTS]
  BFF --> WEB
  GH[GitHub Actions] --> VERCEL[Vercel deployment]
  VERCEL --> WEB
```

- **Agentic orchestration:** LangGraph graph with intent, retrieval, risk,
  generation, compliance and BFF formatting nodes.
- **RAG:** LangSmith/LangGraph built-in Postgres + pgvector semantic store, fed from prevention PDF sources through LiteParse-normalized chunks.
- **BFF compatibility:** `/api/chat` and `/coach_bot` contracts for a web UI
  and reverse-engineered AXA-style surface.
- **Voice:** server-side Mistral Voxtral TTS streaming via `/api/tts/stream`.
- **Design system:** AXA France Canopée `prospect` tokens/components, with
  custom chat surfaces for fidelity to the public assistant behavior.
- **Observability:** LangSmith traces and lightweight FinOps/RSE metadata.
- **Interview support:** the current presentation deck is served by the web app at [`/AXA-Prevention-Coach-support.pptx`](apps/web/public/AXA-Prevention-Coach-support.pptx).

## Repository layout

```text
apps/web/          Next.js 16 / React 19 / TypeScript / AXA Canopée UI
services/agent/    Python LangGraph agent, corpus and seed script
docs/              Architecture, deployment, security, observability and ADRs
.github/workflows/ CI and optional Vercel deployment workflow
```

## AXA Lead Tech IA alignment

| Requirement area | Status | Evidence |
| --- | --- | --- |
| Python expertise | Implemented | `services/agent`, type hints, Ruff/Pyright/pytest gates |
| LangGraph / agentic systems | Implemented | Graph nodes in `services/agent/agent/graph.py` |
| RAG / vector store | Implemented | LangSmith/LangGraph built-in semantic store, LiteParse ingestion adapter |
| Microservice / REST BFF | Implemented | Next.js server routes, `/api/chat`, `/coach_bot`, TTS routes |
| CI/CD / clean code | Implemented | GitHub Actions, lint, typecheck, build, tests |
| Observability | Partial/demo | LangSmith traces + metadata; OTEL/Dynatrace documented roadmap |
| Guardrails | Partial/demo | source grounding and compliance node; policy engine is roadmap |
| Azure / Azure DevOps / OpenShift | Roadmap | target architecture documented, not claimed as deployed |
| Langfuse / MLflow / MCP / A2A | Roadmap | documented integration path, not part of current runtime |
| Squad leadership / platform strategy | Documentation | architecture docs, ADRs, roadmap and operating model |

## Quick start

### Web

```bash
cp apps/web/.env.example apps/web/.env.local
pnpm install
pnpm web:dev
```

Open <http://localhost:3000>.

The root `.env.example` is a single inventory of the shared variables; each
runtime still loads its component-local `.env` file.

### Agent

```bash
cd services/agent
cp .env.example .env
uv sync --group dev
uv run langgraph dev --no-browser
```

Seed a running Agent Server:

```bash
uv run python scripts/seed_store.py
```

For local development, keep `LANGGRAPH_API_URL=http://127.0.0.1:2024` and seed
the `langgraph dev` store before starting the web app. Runtime retrieval is
strict: if the semantic store is empty or unavailable, the graph returns an
explicit retrieval warning instead of using a local lexical answer path.

## Quality gates

```bash
pnpm run lint && pnpm run typecheck && pnpm run build
cd services/agent && uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest
```

## Documentation

- [Architecture](docs/architecture.md)
- [Deployment](docs/deployment.md)
- [Security](docs/security.md)
- [Observability](docs/observability.md)
- [Design system](docs/design-system.md)
- [Roadmap](docs/roadmap.md)
- [ADRs](docs/adr/)
