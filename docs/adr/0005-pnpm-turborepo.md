# ADR 0005: pnpm and Turborepo for the web workspace

## Status

Accepted.

## Decision

Use `pnpm` workspaces and Turborepo at the repository root for JavaScript tasks.
The Python LangGraph service remains managed by `uv` in `services/agent`.

## Rationale

The repository is a mixed monorepo: Next.js needs workspace-level orchestration,
while the agent should keep Python-native dependency management and CI. Turborepo
provides a familiar public monorepo structure without forcing Python into the
JavaScript toolchain.

## Consequences

- Web quality gates run from the root through `pnpm run lint`, `typecheck` and
  `build`.
- GitHub Actions cache `pnpm-lock.yaml`.
- Python checks stay separate and continue to use `uv`.
