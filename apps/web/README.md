# Web app

Next.js 16 / React 19 application for the Prevention Coach RAG demo.

## Commands

```bash
pnpm install
pnpm web:dev
pnpm web:lint
pnpm web:typecheck
pnpm web:build
```

## Routes

- `/` - assistant UI
- `/api/chat` - web BFF contract backed by LangGraph Cloud
- `/coach_bot` - AXA-like BFF compatibility route with `data.output`, `data.metadata` and `data.sources`
- `/api/tts/stream` - Mistral Voxtral TTS streaming
- `/guide/[domain]` - guide/PDF source viewer

## Design system

The app imports AXA France Canopée `prospect` tokens and components. Chat
surfaces are custom to preserve the public assistant interaction model.
