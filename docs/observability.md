# Observability

## Implemented

- LangSmith traces for LangGraph execution.
- Per-response metadata compatible with the observed BFF pattern:
  tokens, estimated cost, estimated CO2 and latency.
- Explicit trace nodes surfaced by the API for demo explainability.

## Roadmap

- OpenTelemetry spans across the Next.js BFF and LangGraph service.
- Dynatrace export for enterprise operations.
- Langfuse or LangSmith evaluation datasets for prompt and retrieval quality.
- MLflow tracking for offline RAG/model experiments.
- Dashboards for latency, source coverage, refusal rate and cost.

