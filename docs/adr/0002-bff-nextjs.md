# ADR 0002: Next.js BFF

## Status

Accepted for MVP.

## Decision

Keep provider calls behind Next.js server routes. The browser never receives
LangSmith/LangGraph or Mistral credentials.

## Consequences

- Good fit for Vercel.
- Compatible with public reverse-engineered BFF behavior.
- Future enterprise deployments can replace the BFF with APIM/gateway patterns.
