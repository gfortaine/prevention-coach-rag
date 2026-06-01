# Legacy split web MVP modules

These files were recovered from the local-only split `axa-prevention-coach`
folder that existed before the public repository converged on the
LangGraph-first architecture.

They are kept as reference material only:

- `provider.ts` generated answers directly in the Next.js layer.
- `retrieval.ts` implemented an older web-side retrieval abstraction.
- `risk.ts` contained useful risk scoring signals; those signals have been
  selectively ported to `services/agent/agent/graph.py`.

Do not import these files from the runtime. The active runtime path is:

1. `apps/web` Next.js BFF receives the user request.
2. The BFF calls the LangGraph Agent Server.
3. `services/agent` owns retrieval, risk assessment, generation and source
   formatting.
