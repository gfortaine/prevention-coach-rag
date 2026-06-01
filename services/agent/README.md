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

The script writes documents from `corpus/axa_prevention.jsonl` into namespace
`("axa_prevention", "documents")`.

