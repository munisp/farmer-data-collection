# Scaffolded and Disconnected Feature Priorities

## Highest-Priority End-to-End Remediation Targets

| Priority | Feature surface | Current gap | Why it is high impact | Planned remediation |
| --- | --- | --- | --- | --- |
| 1 | PWA KYC verification (`client/src/pages/KycVerification.tsx`) | User-facing flow is driven by local mock state and simulated delays instead of real verification procedures | KYC gates loans, disbursements, exchange, and compliance-sensitive workflows across the platform | Replace simulated state transitions with live profile queries and verification mutations against the KYC backend |
| 2 | PWA KYC admin dashboard (`client/src/pages/KycAdminDashboard.tsx`) | Review queue and audit log are hard-coded mock arrays despite existing admin procedures in the server KYC router | Admin KYC review is operationally critical and currently presents false system state | Replace mock reviews and actions with live pending-review, approval, rejection, suspension, and history data |
| 3 | Agricultural intelligence dashboard crop selection (`client/src/pages/AgriculturalIntelligenceDashboard.tsx`) | Core crop-selection list is mock data even though the intelligence analytics queries are live | The dashboard mixes real agronomic analytics with fake upstream selection data, undermining trust and usability | Add and wire a real backend crop-list procedure for the authenticated user and connect the page to it |
| 4 | Mobile marketplace browse and detail flow (`mobile/src/screens/marketplace/MarketplaceBrowseScreen.tsx`, `MarketplaceDetailScreen.tsx`) | Screens use mock listings and product details instead of marketplace router procedures | Mobile commerce parity is important, and these screens are currently disconnected from inventory, availability, and pricing | Add mobile marketplace API methods and wire browse/detail screens to real marketplace search and product endpoints |

## Deprioritized for This Pass

| Feature surface | Reason not selected first |
| --- | --- |
| Mobile checkout and orders | Best implemented after real browse/detail data flow is in place |
| Offline conflict resolution | Important, but less user-visible and more specialized than KYC and marketplace flows |
| Generic analytics dashboards with demo charts | Lower operational impact than KYC, agricultural intelligence selection, and mobile commerce parity |

## Implementation Scope for Next Phase

The next implementation phase should focus on the four targets above because they combine the clearest scaffold signals with the best available backend support. They also span both web and mobile surfaces, which makes them the strongest candidates for meaningful end-to-end production-readiness improvements across the platform.

## Additional Priority Candidate

| Feature surface | Current gap | Why it matters | Likely remediation path |
| --- | --- | --- | --- |
| Field overview (`client/src/pages/FieldOverview.tsx`, `services/python/lakehouse-service/app/main.py`) | The page performs a direct service fetch and silently falls back to mock in-page data; the lakehouse endpoint still returns a placeholder polygon boundary and mock-generated analytics when source data is missing | This is an exposed operational agronomy surface, so silent demo fallback undermines trust and production correctness | Route the page through an authenticated backend contract, source boundary geometry from persisted farm data, and replace silent mock substitution with explicit degraded-state handling |
