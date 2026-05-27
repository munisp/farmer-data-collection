# UI Parity and Feature Coverage Findings

## Surface Summary

| Surface | Count | Zero API references | Weak CRUD signals | No search signal |
| --- | ---: | ---: | ---: | ---: |
| PWA client pages | 119 | Multiple pages with no direct backend usage | Several dashboard and reporting pages are read-heavy | Many pages do not expose search/filter behavior |
| Mobile screens | 37 | 37 | 15 | 29 |

## Key Findings

The PWA surface is broad and many pages are connected to backend procedures, especially in accounting, banking, microfinance, inventory, ERPNext, analytics, SMS, marketplace, and agent-productivity workflows. However, a non-trivial subset of pages appears to be presentation-heavy or locally wired without clear API usage, which should be reviewed for end-to-end completeness.

The strongest parity concern is the mobile application. The current mobile inventory shows **all 37 discovered screens with zero direct API references**, which strongly suggests one of two issues: either the mobile app relies on an abstraction layer that is not yet covered by the inventory, or the mobile user experience is substantially under-integrated relative to the PWA. In either case, the audit should treat mobile parity as a high-priority production-readiness gap.

## Priority PWA Review Targets

| Page | Initial concern |
| --- | --- |
| `pages/AIDiagnostics.tsx` | No visible backend integration |
| `pages/Achievements.tsx` | No visible backend integration |
| `pages/AdminDashboard.tsx` | No visible backend integration |
| `pages/AdvancedAnalytics.tsx` | No visible backend integration |
| `pages/BorrowerDashboard.tsx` | No visible backend integration |
| `pages/BulkExport.tsx` | No visible backend integration |

## Priority Mobile Review Targets

| Screen | Initial concern |
| --- | --- |
| `screens/auth/LoginScreen.tsx` | No direct API usage detected |
| `screens/auth/RegisterScreen.tsx` | No direct API usage detected |
| `screens/marketplace/MarketplaceBrowseScreen.tsx` | No direct API usage detected |
| `screens/marketplace/CheckoutScreen.tsx` | No direct API usage detected |
| `screens/farmers/FarmerRegistrationScreen.tsx` | No direct API usage detected |
| `screens/expenses/ExpenseListScreen.tsx` | No direct API usage detected |
| `screens/harvests/HarvestListScreen.tsx` | No direct API usage detected |
| `screens/loans/LoanApplicationScreen.tsx` | No direct API usage detected |

## Implication for Remediation

The likely highest-value implementation work is not adding more UI screens, but tightening the connection between existing screens and real backend data flows, especially on mobile. The next steps should inspect the mobile app’s data abstraction layer, then patch the most business-critical flows where parity or end-to-end CRUD is missing.
