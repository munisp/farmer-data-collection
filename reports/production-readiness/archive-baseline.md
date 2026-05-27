# Archive and Workspace Baseline

## Workspace Scope

The relevant platform workspace identified from `/home/ubuntu` is:

| Path | Notes |
| --- | --- |
| `/home/ubuntu/work_audit/farmer-data-collection` | Primary application workspace containing web, mobile, backend, services, infrastructure, scripts, and prior reports |

No Git metadata is present in the workspace, so later change-manifest work will need to rely on filesystem and archive comparisons rather than commit history.

## Existing Archive Baseline

| Archive path | Size |
| --- | --- |
| `/home/ubuntu/upload/pasted_file_axQypO_farmer-data-collection-COMPLETE-AUDIT-20251231-200747.tar.gz` | 55M |
| `/home/ubuntu/work_audit/farmer-data-collection-FINAL-COMPREHENSIVE-20260414.tar.gz` | 219M |
| `/home/ubuntu/work_audit/farmer-data-collection/middleware-implementations.tar.gz` | 48K |

## Current Workspace Size

| Path | Size |
| --- | --- |
| `/home/ubuntu/work_audit/farmer-data-collection` | 286M |

## Largest Top-Level Areas in Current Workspace

| Path | Relative size |
| --- | --- |
| `node_modules/` | Dominant footprint in live workspace |
| `services/` | Large service implementation surface |
| `server/` | Core backend surface |
| `client/` | Primary PWA/frontend surface |
| `mobile/` | Mobile implementation surface |
| `archive/` | Historical documentation and archived materials |
| `reports/` | Existing analysis outputs |
| `scripts/` | Operational and verification automation |

## Implications for Final Archive Work

The prior comprehensive archive is materially smaller than the live workspace, which means the final archive comparison should explicitly account for whether dependency directories and generated outputs are intended to be included. Because the attached request explicitly asks not to leave anything out, the final archive step should compare both file inventory and size against the prior 219M archive to ensure the new output is not unexpectedly incomplete.
