# Prevention Coach Agent

Python LangGraph agent backing the web demo.

## Graph

`agent/graph.py` compiles a graph named `axa_prevention_coach`:

1. classify intent
2. retrieve context
3. score risk
4. generate answer
5. compliance check
6. format BFF response

## Development

```bash
uv sync --group dev
uv run langgraph dev --no-browser
```

## Quality

```bash
uv run ruff check .
uv run ruff format --check .
uv run pyright
uv run pytest
```

## Seed semantic store

With a local or cloud Agent Server running:

```bash
uv run python scripts/seed_store.py
```

By default the script targets `LANGGRAPH_API_URL` or `http://127.0.0.1:2024`
for local `langgraph dev`. It writes records into namespace
`("axa_prevention", "documents")`.

Inputs:

- curated seed records from `corpus/axa_prevention.jsonl`;
- optional raw files in `corpus/raw/`, parsed with LiteParse (`lit parse`);
- optional source metadata in `corpus/sources.json`.

LiteParse is used as the local parser, not as a native LangChain loader. The
script adapts LiteParse JSON into canonical chunks with page/source/hash
metadata, then upserts those chunks into the built-in LangSmith/LangGraph
Postgres + pgvector store.

Runtime graph retrieval is strict: the JSONL corpus is seed data only. If the
semantic store is empty or unavailable, the graph returns an explicit retrieval
warning instead of generating from a local lexical answer path.
