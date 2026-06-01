# ADR 0006: LangGraph Cloud custom auth behind Next.js BFF

## Status

Accepted.

## Decision

Deploy the Next.js app on Vercel and call LangGraph Cloud only from server-side
BFF routes. Protect the LangGraph deployment with custom authentication via
`langgraph_sdk.Auth` and `@auth.authenticate`.

## Rationale

Generic LangGraph passthrough packages are no longer the recommended auth
pattern for new deployments. Custom auth in the graph gives tighter control over
server-to-server tokens and future user-level authorization while keeping
LangGraph credentials out of the browser.

## Consequences

- `/api/chat` and `/coach_bot` call LangGraph Cloud server-side.
- The browser never receives `LANGGRAPH_API_URL`, `LANGGRAPH_AUTH_TOKEN`,
  `LANGGRAPH_API_KEY` or LangSmith credentials.
- If LangGraph Cloud is unavailable, the BFF returns an explicit error instead
  of fabricating a local answer.
