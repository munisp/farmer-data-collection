---
name: testing-ui-ux
description: Test the FarmConnect PWA UI/UX end-to-end. Use when verifying mobile navigation, category hubs, offline mode, low-bandwidth adaptation, camera calibration, or PWA features.
---

# Testing the FarmConnect UI/UX (PWA + Mobile)

## Overview
The UI/UX layer lives at `client/src/` and consists of:
- `components/BottomNavBar.tsx` — 5-tab mobile navigation (Home, Farm, Market, Finance, More)
- `components/CategoryHub.tsx` — Card grid layout organized by category (replaces endless scrolling)
- `components/DashboardLayout.tsx` — Collapsible sidebar + bottom nav + category hub integration
- `components/LowBandwidthProvider.tsx` — Bandwidth detection + adaptive UI for 2G/slow connections
- `components/CameraCalibration.tsx` — Camera calibration with mode presets + real-time analysis
- `lib/offlineDataManager.ts` — IndexedDB offline data persistence with queue/retry
- `public/service-worker.js` — Enhanced offline caching + POST queue
- `public/manifest.json` — PWA manifest (standalone, 10 icons, theme #166534)
- `index.css` — safe-area-bottom + reduce-motion CSS

## Prerequisites
```bash
cd /home/ubuntu/repos/farmer-data-collection
npm install   # If not already done
```

## Testing Procedure

### 1. Start Dev Server (Client-Only)
```bash
cd client
npx vite --host --port 5173 &
# Wait for "ready in XXms" message
```
No backend/PostgreSQL needed for UI testing — tRPC queries will fail gracefully.

### 2. Auth Bypass
Open browser to `http://localhost:5173`. You'll be redirected to the login page.
Inject a fake JWT via browser console:
```javascript
const header = btoa(JSON.stringify({alg:"HS256",typ:"JWT"}));
const payload = btoa(JSON.stringify({userId:1,email:"test@farmer.com",role:"admin",firstName:"Test",lastName:"Farmer",exp:Math.floor(Date.now()/1000)+86400}));
const token = header + "." + payload + ".fakesig";
localStorage.setItem("auth_token", token);
location.reload();
```
After reload, you should see the dashboard with "Logged in as TestFarmer".

### 3. Dismiss Tutorial Overlay
On first load, a tutorial overlay may appear. Click "Skip Tutorial" or press Escape to dismiss it.

### 4. Desktop Tests

**Sidebar Collapsible Sections:**
- Verify sidebar shows sections: Core, Inventory & Supply, Marketplace, Commodity Exchange, Financial & Microfinance, Spatial & Weather, etc.
- Click a section header (e.g., "Core") — items should collapse/hide
- Click again — items should expand/show
- Verify chevron rotation on collapse/expand

**Sidebar Navigation:**
- Click any nav item (e.g., "Farms") — should navigate to that route
- URL should update accordingly

### 5. Mobile Tests

**Switch to Mobile Viewport:**
- Use browser's `set_mobile` action or Chrome DevTools mobile emulation (390x844 iPhone)
- Sidebar should disappear (md:hidden class)
- Bottom navigation bar should appear with 5 tabs

**Bottom Navigation:**
- Verify 5 tabs visible: Home, Farm, Market, Finance, More
- Active tab should have a top indicator bar and scaled icon
- Tap each tab and verify the corresponding category hub appears

**Category Hub Verification:**
| Tab | Title | Features | Sections |
|-----|-------|----------|----------|
| Farm | Farm & Agriculture | 20 | Farm Management, Equipment & IoT, AI & Intelligence, Spatial & Weather |
| Market | Marketplace & Supply Chain | 16 | Marketplace, Supply Chain, Commodity Exchange, Communication |
| Finance | Finance & Payments | 14 | Loans & Credit, Payments & Banking, Group Finance, Reports |
| More | Analytics & More | 18 | Analytics & Reports, AI Models, People & Teams, Admin |

- NEW badges should appear on: Drone Flights, Fleet, IoT Sensors, AI Advisor, Soil Analysis, Delivery, Cold Chain, Subscriptions, Price Alerts, Mobile Money, Chama/VSLA

**Card Navigation:**
- Tap any card (e.g., "My Farms") — should navigate to the corresponding route
- Category hub should disappear, page content should show
- Bottom nav active tab should stay on the correct category

**Home Tab Behavior:**
- Tap "Home" tab — should navigate to `/` and show dashboard content
- Should NOT show a category hub for Home (showCategoryHub = false)

### 6. Offline Mode Tests

**ConnectionBanner — Offline:**
```javascript
// In browser console:
window.dispatchEvent(new Event('offline'));
```
- ConnectionBanner should appear: "You're offline - changes will sync when you reconnect"
- Sync status should change to "Offline"
- "Sync Now" button should be disabled
- App should NOT crash — existing content should remain visible

**ConnectionBanner — Online Recovery:**
```javascript
window.dispatchEvent(new Event('online'));
```
- Banner should disappear
- Sync should restore to "Synced just now"
- Console should log: "[App] Back online", "[OfflineSync] Back online..."

### 7. PWA Verification

**Manifest Check (via console):**
```javascript
var x = new XMLHttpRequest();
x.open("GET", "/manifest.json", false);
x.send();
var m = JSON.parse(x.responseText);
console.log("name:" + m.name);           // AgriFinance - Farmer Data Collection Platform
console.log("short:" + m.short_name);     // AgriFinance
console.log("theme:" + m.theme_color);    // #166534
console.log("display:" + m.display);      // standalone
console.log("icons:" + m.icons.length);   // 10
```

**Meta Tags Check:**
```javascript
console.log(document.querySelector('meta[name="theme-color"]').content);           // #166534
console.log(document.querySelector('meta[name="mobile-web-app-capable"]').content); // yes
console.log(document.querySelector('meta[name="apple-mobile-web-app-capable"]').content); // yes
```

**Service Worker:** Only registers in production build (`vite build` + serve), NOT in Vite dev mode. This is expected behavior.

### 8. Camera Calibration (Limited)

Camera calibration cannot be fully tested without camera hardware. Verify:
- `CameraCalibration.tsx` exists (475 lines)
- 4 mode presets: soil (2560x1920), crop_disease (1920x1440), inventory (1280x960), general (1600x1200)
- `analyzeLighting()` function uses brightness scoring
- `analyzeFocus()` uses Laplacian edge detection
- GPS metadata capture via `navigator.geolocation`

## Key Breakpoints
- Mobile: `md:hidden` = screens < 768px → bottom nav appears, sidebar hides
- Desktop: >= 768px → sidebar visible, no bottom nav

## Known Behaviors
- Dashboard may show "Loading dashboard..." spinner when no backend is running — tRPC queries timeout
- Service worker does NOT register in Vite dev mode — only in production builds
- Camera `getUserMedia` will fail on VMs without camera hardware
- `navigator.connection` API may not be available in all browsers — LowBandwidthProvider defaults to "4g" quality
- Offline events dispatched via `window.dispatchEvent(new Event('offline'))` work for ConnectionBanner but `navigator.onLine` remains `true` (browser limitation)
- On first page load after auth bypass, a tutorial overlay may appear — dismiss it before testing

### 9. Dashboard Nav Link Cards

The main dashboard (`/`) has ModernCard sections with nested link cards. To verify:
```javascript
// Check all nav card sections exist
const titles = ['Marketplace & Commerce', 'Delivery & Supply Chain', 'Financial Services', 'Retail, B2B & Cooperatives', 'Voice & Accessibility'];
titles.forEach(t => console.log(t + ': ' + (document.body.innerText.includes(t) ? 'FOUND' : 'MISSING')));
```
- Each card section has a title, description, and 3-5 link items with icons
- Links should navigate to their target pages (no 404s)
- Cards use gradient backgrounds matching their category theme

### 10. Aggregation Hub Workflow (`/aggregation-hub`)

Full produce intake → grading → receipt → exchange workflow:

1. Navigate to `/aggregation-hub` — verify header "Aggregation Hub — Oyo State Hub"
2. Check summary cards: Total Batches, Pending Grading, Receipts Issued counts
3. **Grading flow:** On "Produce Intake" tab, click "Grade" on a pending batch → switch to "Inspection & Grading" tab → the grading form appears there (NOT inline on intake tab) → fill moisture/foreign matter, select grade, submit
4. **Receipt flow:** Back on intake tab, the batch shows "graded" status → click "Issue Receipt" → status changes to "receipted"
5. **Exchange listing:** On "Warehouse Receipts" tab, click "List on Exchange" → alert dialog shows commodity listing with symbol and T+2 settlement

**Important:** The grading form renders on the "Inspection & Grading" tab, not inline on the intake tab. After clicking "Grade" on a batch, you must switch tabs to see and fill the form.

**ARIA verification:**
```javascript
console.log('main:', document.querySelector('[role="main"][aria-label="Aggregation Hub"]') ? 'OK' : 'MISSING');
console.log('tablist:', document.querySelector('[role="tablist"][aria-label="Hub sections"]') ? 'OK' : 'MISSING');
console.log('tabs:', document.querySelectorAll('[role="tab"]').length); // should be 4
console.log('table:', document.querySelector('table[aria-label="Produce intake batches"]') ? 'OK' : 'MISSING');
```

### 11. ML Insights Widget

The dashboard has an "AI Insights" card. Its status depends on `PYTHON_ML_SERVICE_URL` env var:
- If NOT set: defaults to `http://localhost:3000` (wrong — that's Vite), shows "ML service is currently unavailable"
- If set to `http://localhost:8086`: connects to the fallback ML service, shows predictions

The fallback service (`services/ml-service/fallback_server.py`) runs on port 8086 and does NOT require PyTorch/TensorFlow.

### 12. Sidebar Navigation Verification

```javascript
// Check specific sidebar links exist
const links = ['/aggregation-hub', '/delivery', '/cold-chain', '/freshness', '/traceability'];
links.forEach(href => {
  const el = document.querySelector(`nav a[href="${href}"]`);
  console.log(href + ': ' + (el ? 'FOUND' : 'MISSING'));
});
```

## Known Behaviors
- Dashboard may show "Loading dashboard..." spinner when no backend is running — tRPC queries timeout
- Service worker does NOT register in Vite dev mode — only in production builds
- Camera `getUserMedia` will fail on VMs without camera hardware
- `navigator.connection` API may not be available in all browsers — LowBandwidthProvider defaults to "4g" quality
- Offline events dispatched via `window.dispatchEvent(new Event('offline'))` work for ConnectionBanner but `navigator.onLine` remains `true` (browser limitation)
- On first page load after auth bypass, a tutorial overlay may appear — dismiss it before testing
- The grading form on Aggregation Hub renders on the "Inspection & Grading" tab, NOT inline on the intake tab — you must switch tabs after clicking "Grade"
- `alert()` dialogs (e.g., "List on Exchange") may be auto-dismissed by browser automation — use `window.alert` override to capture the message content for verification
- The `sql.js` WASM module may throw `RuntimeError: Aborted(both async and sync fetching of the wasm failed)` in the console — this is a non-blocking error from the offline SQLite WASM module and does not affect UI functionality
- Currency selector defaults to NGN but might show USD if previously changed — the currency is user-selectable from 8 options in the sidebar

## Testing Tips
- Use JavaScript console queries to verify DOM elements exist rather than relying solely on visual inspection — pages can be long and elements may be offscreen
- For `alert()` verification, override `window.alert` before clicking the button: `window.alert = (msg) => console.log('ALERT: ' + msg);`
- When testing tab-based UIs, check `aria-selected` attribute to confirm which tab is active
- Dev server runs on port 3000 (not 5173) when started via `npm run dev` from the project root
- The full dev stack (client + API server) starts with `npm run dev` from root — client on :3000, API on :3001

## Devin Secrets Needed
None — all testing is local, no external services required.
