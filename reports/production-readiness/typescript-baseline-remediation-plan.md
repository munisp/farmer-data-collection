# TypeScript Baseline Failure Analysis and Remediation Plan

The repository’s current TypeScript failure set is dominated by a relatively small number of recurring root-cause families rather than a uniform spread of unrelated defects. The most important conclusion is that the baseline is **systemic, not random**: the compiler errors cluster around a few integration seams where implementation code has drifted away from the typed contracts for Google Maps, tRPC routers, backend platform adapters, and a handful of schema and package interfaces.

## Baseline profile

The latest baseline compiler run shows the following overall pattern.

| Metric | Observation |
| --- | --- |
| Most common error code | **TS2304** (`Cannot find name`) |
| Other dominant error codes | **TS2339** (`Property does not exist on type`), **TS2345** (`Argument not assignable`), **TS2503** (`Cannot find namespace`), **TS2554** (`Expected N arguments, got M`) |
| Highest-error files | `server/routers/farmer-features-router.ts`, `client/src/components/FarmBoundaryDrawer.tsx`, `client/src/components/FarmBoundaryViewer.tsx`, `server/services/lakehouse/feature-store.ts`, `server/services/tigerbeetle-postgres-reconciliation.ts`, `client/src/components/FarmBoundaryEditor.tsx`, `client/src/pages/LandSuitabilityAssessment.tsx`, `server/services/crop-insurance-service.ts` |
| Architectural pattern | Most failures come from **typed integration boundaries** rather than from simple syntax issues |

## Root-cause groups

### 1. Google Maps typing and browser global assumptions in geospatial UI

The largest client-side cluster comes from the farm-boundary and geospatial pages. The dominant signatures are `Cannot find name 'google'`, `Cannot find namespace 'google'`, implicit `any` callback parameters, and option objects that do not match the installed map library typings. These are concentrated in the following files.

| Files | Failure pattern | Likely root cause |
| --- | --- | --- |
| `client/src/components/FarmBoundaryDrawer.tsx` | `google` global missing, `google.maps` namespace missing, implicit callback types | Direct browser-global usage without typed loader or ambient type setup |
| `client/src/components/FarmBoundaryViewer.tsx` | Same family | Same root cause |
| `client/src/components/FarmBoundaryEditor.tsx` | Same family | Same root cause |
| `client/src/components/Map.tsx` | Invalid map/geolocate option properties and type mismatches | Mismatch between code assumptions and actual package typings |
| `client/src/pages/LandSuitabilityAssessment.tsx` / `FarmGeotagging.tsx` / `SatelliteImagery.tsx` | Downstream property and route mismatches on map-driven features | UI built on unstable geospatial contract layer |

This cluster should be treated as one remediation program, not as isolated file fixes.

### 2. tRPC route drift between pages and router composition

A second major cluster comes from client pages calling router members or procedure names that are no longer exposed under the current typed router contract. The clearest signature is `Property '...' does not exist on type 'DecorateRouterRecord<...>'`. This appears most visibly in farm and feature pages, but it likely affects other stale surfaces as well.

| Files | Failure pattern | Likely root cause |
| --- | --- | --- |
| `client/src/pages/FarmGeotagging.tsx` | Missing procedure names on typed router | Client page was written against an earlier or assumed router surface |
| `server/routers/farmer-features-router.ts` | Secondary argument-count mismatches and contract drift | Router and consuming pages no longer share a stable signature |
| Additional pages with route-member lookup failures | Stale procedure names or incorrect nesting | Router merges changed without updating all consumers |

This group indicates that the project needs a **router-contract reconciliation pass** rather than one-off page patches.

### 3. Platform adapter mismatch in backend service layer

Several backend domain services depend on shared infrastructure adapters whose APIs no longer match the service implementations. These errors repeat across multiple high-level services, which is strong evidence of contract drift in foundational abstractions.

| Adapter surface | Example failures | Affected services |
| --- | --- | --- |
| Kafka/event publishing | `Cannot find name 'kafkaProducer'` | `carbon-credit-service.ts`, `harvest-forecasting-service.ts`, `knowledge-sharing-service.ts`, `pest-disease-warning-service.ts`, `post-harvest-service.ts` |
| TigerBeetle ledger API | `recordTransaction does not exist on type 'TigerBeetleLedger'` | `crop-insurance-service.ts`, `input-financing-service.ts`, `labor-management-service.ts` |
| Temporal workflow API | `startWorkflow does not exist on type 'TemporalWorkflowService'` | `crop-insurance-service.ts` |
| WeatherData model | Missing `temp`, `tempMin`, `tempMax`, `precipitation` | `crop-insurance-service.ts`, `pest-disease-warning-service.ts` |
| Lakehouse feature store | `Expected 1 arguments, but got 2` repeated | `server/services/lakehouse/feature-store.ts` |

This is the highest-leverage backend cluster because fixing the shared adapters or aligning the service contracts will clear multiple files at once.

### 4. Schema and database model drift

Another cluster is caused by inserts, selects, and imports that no longer match the current database schema or module paths.

| Files | Failure pattern | Likely root cause |
| --- | --- | --- |
| `server/seed-data.ts` | Insert object keys do not exist in inferred schema type | Seed fixtures lag behind schema evolution |
| `server/services/tigerbeetle-postgres-reconciliation.ts` | Missing `../../shared/schema`, invalid Kafka event shape, nullable DB handling | Old integration file was not updated after schema/module refactor |
| `client/src/pages/QuickFarmerRegistration.tsx` | Type mismatch in payload/state structure | Frontend form model no longer matches backend entity shape |
| `client/src/pages/MarketplaceListing.tsx` | `SetStateAction` payload mismatch | Form state model drifted from current listing type |

These issues are localized, but they are important because they distort the typed contract between persistence, seeding, and UI form state.

### 5. Missing external package typings and small library-contract mismatches

A smaller but still relevant cluster comes from external dependency typing gaps and narrow library mismatches.

| Files | Failure pattern | Likely root cause |
| --- | --- | --- |
| `client/src/db/sqliteWasmDb.ts` | Missing declaration file for `sql.js` | Missing `@types` or local ambient declaration |
| `client/src/services/error-tracking.ts` | Likely SDK signature mismatch | Version drift in telemetry package APIs |
| `client/src/lib/syncManager.ts` | Type mismatch with current sync abstraction | Contract drift in helper utilities |
| `server/services/redis-rate-limiter.ts` | Unsafe cast from `ReplyUnion` to `number` | Redis client return type assumptions need explicit narrowing |

These are not the main blocker family, but they should be cleaned up after the larger structural issues are stabilized.

## Recommended remediation sequence

The most effective remediation path is to fix the failure set in **contract layers**, not in raw error-count order. The following sequence is designed to maximize error reduction while minimizing rework.

| Priority | Workstream | Why it should go first | Expected impact |
| --- | --- | --- | --- |
| 1 | Geospatial typing foundation | One shared fix can unblock multiple map-related components and pages | High client-side error reduction |
| 2 | Backend platform adapter reconciliation | Shared adapter drift is causing repeated failures across many services | High backend error reduction |
| 3 | tRPC router-contract reconciliation | Prevents repeated page-level breakage and restores typed client trust | High full-stack stability |
| 4 | Schema and seed alignment | Cleans database-facing breakages and removes false assumptions in fixtures/forms | Medium impact |
| 5 | Package typings and narrow library fixes | Low coordination cost after major contracts are stable | Low-to-medium impact |

## Concrete remediation plan

### Phase A. Stabilize the geospatial typing layer

Create a single geospatial integration pattern and migrate all map-boundary components to it. The code should stop referencing the browser-global `google` namespace directly unless the repository intentionally defines a shared ambient type file and a loader contract. Instead, the project should either standardize on the official loader pattern or centralize access behind a typed wrapper component and hook.

| Task | Scope |
| --- | --- |
| Add or verify Google Maps typings and loader strategy | Shared client infrastructure |
| Replace ad hoc `google` global access with typed loader-resolved access | `FarmBoundaryDrawer`, `FarmBoundaryViewer`, `FarmBoundaryEditor` |
| Explicitly type map callback parameters and overlays | Same files plus `LandSuitabilityAssessment` / `FarmGeotagging` |
| Reconcile map option objects with actual package types | `Map.tsx` and dependent pages |

### Phase B. Reconcile platform service adapters

Audit the actual exported contracts for Kafka, TigerBeetle, Temporal, WeatherData, and the lakehouse feature store, then update either the services or the adapter types so they agree. This should be handled as an infrastructure-contract refactor, not as repeated local suppression.

| Task | Scope |
| --- | --- |
| Replace undeclared `kafkaProducer` references with the current messaging abstraction or inject the dependency explicitly | Multiple backend services |
| Decide whether `TigerBeetleLedger.recordTransaction` should be restored, renamed, or replaced by a currently supported method | Finance and insurance services |
| Replace outdated `startWorkflow` calls with the active workflow entrypoint | Temporal-backed services |
| Unify `WeatherData` field names across producers and consumers | Forecasting and warning services |
| Update `feature-store.ts` call sites to the current one-argument API | Lakehouse feature store |

### Phase C. Reconcile the typed tRPC surface

Generate or inspect the effective router composition and compare it against all client references in farm- and feature-related pages. Each missing procedure call should be resolved by one of three deliberate actions: restore the procedure, rename the client call, or delete the dead UI path.

| Task | Scope |
| --- | --- |
| Enumerate client `trpc.*` usage against actual router composition | Full client app |
| Restore or rename stale farm-related procedures | Farm pages and `farmer-features-router` |
| Add focused smoke checks for typed route availability | Client/router integration |

### Phase D. Align schema, seed, and form models

Once the major service contracts are stable, fix the schema-facing files that still assume outdated entity shapes.

| Task | Scope |
| --- | --- |
| Update `seed-data.ts` payload keys to the live schema | Seed pipeline |
| Fix `tigerbeetle-postgres-reconciliation.ts` import paths, null handling, and event payload shape | Finance reconciliation integration |
| Align `QuickFarmerRegistration.tsx` and `MarketplaceListing.tsx` form state types with the active backend contracts | User-facing forms |

### Phase E. Resolve residual library typing issues

Finish by tightening the narrow, local issues that are unlikely to affect architecture decisions.

| Task | Scope |
| --- | --- |
| Add a declaration for `sql.js` or install the correct type support | `sqliteWasmDb.ts` |
| Narrow Redis reply types before numeric conversion | `redis-rate-limiter.ts` |
| Update telemetry and sync utility types to current SDK contracts | `error-tracking.ts`, `syncManager.ts` |

## Execution strategy

A practical implementation strategy would use short validation loops after each workstream rather than waiting for a full repository pass at the end.

| Step | Validation |
| --- | --- |
| Complete Phase A | Run focused TypeScript check on geospatial components/pages |
| Complete Phase B | Run focused TypeScript check on backend services |
| Complete Phase C | Run focused TypeScript check on affected client pages plus router files |
| Complete Phase D | Run repository-wide TypeScript check and compare delta |
| Complete Phase E | Run final repository-wide TypeScript check |

## Recommended ownership model

If this remediation is split across contributors, the repository should be divided by **contract boundary** rather than by file count.

| Owner lane | Suggested scope |
| --- | --- |
| Frontend mapping lane | Geospatial components and dependent farm pages |
| Platform/backend lane | Kafka, TigerBeetle, Temporal, weather, lakehouse adapters |
| Full-stack API lane | tRPC route reconciliation and stale client callers |
| Data-model lane | Seeds, reconciliation, form-state/schema alignment |

## Bottom line

The baseline TypeScript failures are best understood as **four main drift problems**: geospatial browser globals, backend platform-adapter contract drift, tRPC surface drift, and schema/model drift. If those are addressed in that order, the repository should see a much larger reduction in compiler failures than it would from fixing files one by one in isolation.
