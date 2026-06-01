# Security

## Current controls

- Server-side BFF routes protect provider credentials from the browser.
- Environment variables are documented through examples, not committed values.
- RAG sources are treated as data, not instructions.
- The answer generator is instructed to cite only relevant sources and avoid
  medical, legal or emergency operational advice.
- Public deployment can operate with deterministic/local fallback when cloud
  providers are unavailable.

## Known prototype limitations

- No production identity provider is implemented.
- Guardrails are prompt/code-level, not yet a dedicated policy service.
- CI does not call live model providers.
- The demo corpus is small and public/synthetic.

## Target controls

- OAuth2/OIDC with enterprise identity.
- Key Vault / managed identity for secrets.
- Prompt-injection guardrails and retrieval allowlists.
- OTEL traces with PII redaction.
- Automated RAG evaluation and regression gates.
- Rate limiting and abuse protection at gateway level.

