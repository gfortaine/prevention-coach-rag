# ADR 0004: Mistral Voxtral TTS

## Status

Accepted for MVP.

## Decision

Use server-side Mistral Voxtral TTS for voice playback. Do not call the public
AXA BFF audio endpoints as a runtime dependency.

## Consequences

- A real cloud TTS path avoids browser speech-synthesis quality issues.
- Secrets stay server-side.
- The route can later be swapped for an enterprise-approved speech provider.

