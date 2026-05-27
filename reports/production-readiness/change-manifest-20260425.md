# Repository Change Manifest — 2026-04-25

## Code and Runtime-Facing Changes

| Path | Change type | Purpose |
| --- | --- | --- |
| `mobile/src/services/api/client.ts` | Modified | Replaced broken REST-style mobile auth calls with the actual tRPC-aligned backend authentication flow and normalized backend responses for mobile use |
| `mobile/src/stores/authStore.ts` | Modified | Updated mobile auth state management to consume normalized `{ user, tokens }` responses instead of nonexistent REST payload fields |
| `mobile/src/services/auth/index.ts` | Modified | Hardened token persistence to support the repaired single-token backend flow without assuming a distinct refresh token is always present |
| `server/routers/field-overview-router.ts` | Added | Introduced authenticated live field, vegetation, crop-health, scouting-task, and activity-log procedures to remove the FieldOverview page’s reliance on direct unauthenticated service fetches and silent mock fallbacks |
| `server/trpc.ts` | Modified | Composed the new `fieldOverview` router into the main typed backend contract |
| `client/src/pages/FieldOverview.tsx` | Rewritten | Replaced hardcoded fields, weather, disease risks, scouting tasks, activity log entries, and lakehouse mock fallback behavior with live authenticated tRPC queries and explicit empty states |
| `client/src/pages/BorrowerDashboard.tsx` | Rewritten | Replaced the mocked borrower loan, repayment schedule, and notification settings with live microfinance loan data, live repayment schedules, and persisted SMS notification preferences |
| `client/src/pages/SatelliteImagery.tsx` | Rewritten | Replaced sample field geometry and placeholder satellite rendering with authenticated live boundary selection, live satellite analytics, persisted imagery metadata, and truthful empty states |

## Audit and Analysis Helpers Added

| Path | Change type | Purpose |
| --- | --- | --- |
| `scripts/service_wiring_inventory.py` | Added | Generates a structured inventory of service wiring across compose files and source references |
| `scripts/ui_parity_inventory.py` | Added | Inventories PWA and mobile surface coverage, API usage, and CRUD signals |
| `scripts/summarize_ui_parity.py` | Added | Summarizes UI parity gaps from the generated inventory |

## Reports and Findings Added or Refreshed

| Path | Change type | Purpose |
| --- | --- | --- |
| `reports/production-readiness/archive-baseline.md` | Added | Captures workspace and archive baseline for comparison |
| `reports/production-readiness/platform-wiring-findings.md` | Added | Summarizes platform wiring observations and weakly connected services |
| `reports/production-readiness/service-wiring-inventory.json` | Added | Machine-readable service wiring inventory |
| `reports/production-readiness/ui-parity-findings.md` | Added | Summarizes frontend and mobile parity concerns |
| `reports/production-readiness/ui-parity-inventory.json` | Added | Machine-readable UI parity inventory |
| `reports/production-readiness/ui-parity-summary.txt` | Added | Text summary of UI parity gaps |
| `reports/production-readiness/security-findings.md` | Added | Captures the security posture and dependency-vulnerability findings |
| `reports/production-readiness/domain-research-notes.md` | Added | Records external domain and business-rule research used in the gap analysis |
| `reports/production-readiness/post-fix-validation.md` | Added | Summarizes validation after the mobile auth remediation |
| `reports/production-readiness/archive-comparison.md` | Added | Compares the newly generated comprehensive archive to the prior archive baseline |
| `reports/production-readiness/production-readiness-report.json` | Refreshed | Latest strict readiness audit output after the FieldOverview, BorrowerDashboard, and SatelliteImagery scaffold-remediation pass |
| `reports/production-readiness/production-readiness-report.md` | Refreshed | Latest human-readable readiness audit output after the live-data rewrites |
| `reports/production-readiness/pnpm-audit.json` | Added | Latest pnpm vulnerability audit output |

## Archive Artifact Added

| Path | Change type | Purpose |
| --- | --- | --- |
| `/home/ubuntu/work_audit/farmer-data-collection-FINAL-COMPREHENSIVE-20260425.tar.gz` | Added | Comprehensive final archive of the full workspace after audit and remediation |

## Validation Evidence Used

| Path | Role |
| --- | --- |
| `/home/ubuntu/terminal_full_output/2026-04-25_04-30-05_172847_47397.txt` | Full repository TypeScript validation output showing broader pre-existing errors outside the newly patched mobile auth files |
| `/tmp/latest_scaffold_rewrites_tsc.log` | Clean TypeScript validation log after the FieldOverview, BorrowerDashboard, and SatelliteImagery live-data rewrites |
| `/tmp/production_readiness_refresh.log` | Refreshed production-readiness audit result showing an overall score of 85.14 and zero hardcoded-secret hits |
