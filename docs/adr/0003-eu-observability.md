# ADR 0003: EU LangGraph/LangSmith path

## Status

Accepted for MVP.

## Decision

Target a Python LangGraph/LangSmith EU deployment with Mistral Document Library
for managed PDF RAG. The web BFF fails closed if the graph or Mistral
document-library path is unavailable; no local web fallback answer is generated.

## Consequences

- Demonstrates cloud agent runtime and traces.
- Makes cloud availability explicit during demos and avoids silently presenting
  a degraded answer as production behavior.
- Production AXA alignment would require enterprise identity, retention and
  observability policies.
