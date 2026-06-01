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

## Mistral Document Library RAG

The managed PDF RAG path is Mistral-only. Mistral Document Library is treated as
the managed vector store: it owns parsing, chunking, embeddings, vector search
and raw references. LangGraph owns routing, graph state, citation normalization
and the public response contract.

```bash
export MISTRAL_API_KEY=...
uv run python scripts/mistral_library_admin.py --upload-corpus-documents --poll
uv run python scripts/mistral_library_admin.py --doctor
```

The script prints the values to set on the Agent Server:

```bash
MISTRAL_LIBRARY_ID=...
MISTRAL_AGENT_ID=...
MISTRAL_DOCUMENT_METADATA_PATH=corpus/mistral_documents.json
```

When `MISTRAL_API_KEY` and `MISTRAL_AGENT_ID` are configured, `agent/graph.py`
uses the Mistral Agent `document_library` tool for the answer and citations,
then normalizes Mistral references to the web app `SourceCitation` format.
No OpenAI, Qdrant, Ragie, Pinecone, semantic-store or lexical fallback is used
for documentary answers. If Mistral is unavailable, the graph fails closed with
an explicit unavailable state.

The admin script is idempotent: it reuses a configured or same-named Library,
skips already uploaded documents by file name, retries upload rate limits, polls
processing when requested and writes `corpus/mistral_documents.json` atomically.
