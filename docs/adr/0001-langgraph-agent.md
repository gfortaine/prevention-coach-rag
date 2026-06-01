# ADR 0001: LangGraph for orchestration

## Status

Accepted for MVP.

## Context

The target role emphasizes agentic platforms, Python and maintainable
architecture. The assistant needs explicit stages: intent, retrieval, risk,
generation and compliance.

## Decision

Use a Python LangGraph graph with small named nodes and a BFF formatter.

## Consequences

- Easy to explain and trace in interview.
- Deployable to LangGraph Agent Server.
- More explicit than a monolithic prompt route.

