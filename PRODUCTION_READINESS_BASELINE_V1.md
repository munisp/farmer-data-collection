# Production Readiness Baseline (PRB) v1

## Purpose

This document defines the minimum requirements for the farmer-data-collection platform to be considered production-ready. Each item has objective pass/fail criteria verified by automated checks.

## Scope

**In Scope:**
- All TypeScript/Node.js code in `server/`, `client/src/`
- Infrastructure YAMLs in `k8s/`, `config/`, `docker-compose*.yml`, `.github/workflows/`
- All Dockerfiles in the repository
- Database configuration files

**Out of Scope (PRB v2):**
- Load testing and performance benchmarks
- Security penetration testing
- Full test coverage requirements
- Infrastructure services (Keycloak, Temporal, TigerBeetle) - these are optional integrations

## Environment Assumptions

- Node.js 22.x
- pnpm package manager
- Docker available for Dockerfile builds
- PostgreSQL reachable at `$DATABASE_URL` (required env var)
- Optional: Redis, Keycloak, Temporal, TigerBeetle

## Verification

Run all checks with a single command:

```bash
make verify
```

The command exits with code 0 if ALL checks pass, non-zero otherwise.

---

## Verification Matrix

| ID | Name | Description | Target Paths | Verification Command | Pass Criteria |
|----|------|-------------|--------------|---------------------|---------------|
| PRB-001 | No hardcoded credentials | No plaintext passwords, secrets, or API keys in infrastructure YAMLs | `k8s/`, `config/`, `docker-compose*.yml`, `.github/workflows/` | `scripts/prb/check-secrets.sh` | Exit 0, no violations printed |
| PRB-002 | No mock functions in production | No `generateMock*` functions in production code paths | `server/`, `client/src/` (excluding `__tests__`, `*.test.*`, `*.spec.*`) | `scripts/prb/check-mocks.sh` | Exit 0, no violations printed |
| PRB-003 | No TODO/FIXME placeholders | No `TODO implement` or `FIXME` comments in production code | `server/`, `client/src/` (excluding `__tests__`, `*.test.*`) | `scripts/prb/check-todos.sh` | Exit 0, no violations printed |
| PRB-004 | TypeScript compiles | All TypeScript code compiles without errors | `server/`, `client/src/` | `npx tsc --noEmit` | Exit 0 |
| PRB-005 | Dockerfiles build | All Dockerfiles build successfully | All `Dockerfile*` files | `scripts/prb/check-docker.sh` | Exit 0, all images build |
| PRB-006 | No in-memory DB defaults | Production code requires `DATABASE_URL` env var, no fallbacks | `server/db.ts`, `drizzle.config.ts` | `scripts/prb/check-db-persistence.sh` | Exit 0, no fallbacks found |

---

## CI Integration

The CI pipeline (`.github/workflows/ci-cd.yml`) should run `make verify` on every PR and main branch push. PRs must pass all PRB checks before merge.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2024-12-19 | Initial PRB with 6 core checks |
