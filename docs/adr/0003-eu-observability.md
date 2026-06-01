# ADR 0003: EU LangGraph/LangSmith path

## Status

Accepted for MVP.

## Decision

Target LangGraph/LangSmith EU deployment and semantic store. The web BFF fails
closed if the graph is unavailable; no local web fallback answer is generated.

## Consequences

- Demonstrates cloud agent runtime and traces.
- Makes cloud availability explicit during demos and avoids silently presenting
  a degraded answer as production behavior.
- Production AXA alignment would require enterprise identity, retention and
  observability policies.
