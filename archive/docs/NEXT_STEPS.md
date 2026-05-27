# Next Steps: Getting Started with Full Features

This document guides you through activating all features of the Farmer Data Collection platform.

---

## Quick Start Checklist

Follow these steps in order to unlock all platform features:

- [ ] **Step 1:** Set up PostgreSQL database (30 minutes)
- [ ] **Step 2:** Add OpenWeatherMap API key (5 minutes)
- [ ] **Step 3:** Test weather features (10 minutes)
- [ ] **Step 4:** Test GPS tracking (15 minutes)
- [ ] **Step 5:** (Optional) Set up Redis for caching (15 minutes)
- [ ] **Step 6:** (Optional) Configure SMS integration (20 minutes)

**Total Time:** ~1-2 hours for full setup

---

## Step 1: Set Up PostgreSQL Database

**Why:** Enables server-side data storage, GPS tracking, microfinance, SMS scheduling, and more.

**Quick Setup (Recommended):**

### Option A: Supabase (Free, Easiest)

1. Visit [supabase.com](https://supabase.com)
2. Create free account
3. Create new project
4. Wait 2-3 minutes for provisioning
5. Go to Settings → Database
6. Copy "Connection pooling" string
7. Add to Management UI:
   - Open Settings → Secrets
   - Add `DATABASE_URL`
   - Paste connection string

### Option B: Neon (Free, Serverless)

1. Visit [neon.tech](https://neon.tech)
2. Create free account
3. Create new project
4. Copy connection string
5. Add to Management UI (Settings → Secrets)

### Option C: Local PostgreSQL

Follow detailed guide: `docs/POSTGRESQL_SETUP.md`

**After Database Setup:**

```bash
# Run migrations to create tables
cd /home/ubuntu/farmer-data-collection
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

**Verify:**
- Restart dev server
- Check console for "Database connected" message
- No more "Database not available" errors

---

## Step 2: Add OpenWeatherMap API Key

**Why:** Enables weather widgets, forecasts, and agricultural indices on farm pages.

**Setup (5 minutes):**

1. Visit [openweathermap.org/api](https://openweathermap.org/api)
2. Click "Sign Up" (free)
3. Verify email
4. Go to API Keys section
5. Copy default API key
6. Add to Management UI:
   - Open Settings → Secrets
   - Add `OPENWEATHER_API_KEY`
   - Paste your API key
7. Restart dev server

**Note:** New API keys may take up to 2 hours to activate.

**Detailed Guide:** `docs/OPENWEATHERMAP_SETUP.md`

---

## Step 3: Test Weather Features

**After adding API key:**

1. Navigate to **Farms** page
2. Click on any farm
3. Scroll to weather widget
4. You should see:
   - Current temperature
   - Weather conditions
   - Humidity, wind speed
   - 5-day forecast
   - Agricultural indices

**If weather doesn't load:**
- Check browser console for errors
- Verify API key is correct
- Wait 2 hours if key was just created
- Check farm has valid coordinates

---

## Step 4: Test GPS Tracking

**After database setup:**

1. Navigate to **GPS Tracking** page
2. Click **Register Device**
3. Fill in:
   - Device ID: `TEST-001`
   - Name: `Test Device`
   - Farm: Select any farm
4. Click **Register**
5. Device should appear in list

**Simulate GPS Tracks:**

Open browser console and run:

```javascript
// Simulate GPS movement in Lagos
const deviceId = 1; // Your device ID
const startLat = 6.5244;
const startLon = 3.3792;

for (let i = 0; i < 10; i++) {
  const lat = startLat + (Math.random() - 0.5) * 0.01;
  const lon = startLon + (Math.random() - 0.5) * 0.01;
  
  await fetch('/api/trpc/gpsTracking.recordTrack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId,
      latitude: lat,
      longitude: lon,
      speed: Math.random() * 50
    })
  });
  
  await new Promise(r => setTimeout(r, 1000));
}
```

**Verify:**
- Device appears on map
- Track path is visible
- Statistics update

**Detailed Guide:** `docs/GPS_TRACKING_GUIDE.md`

---

## Step 5: (Optional) Set Up Redis

**Why:** Enables caching, job queue, SMS scheduling, and improves performance.

**Quick Setup:**

### Cloud Redis (Recommended)

**Upstash (Free Tier):**
1. Visit [upstash.com](https://upstash.com)
2. Create free account
3. Create Redis database
4. Copy connection string
5. Add `REDIS_URL` to Management UI

**Redis Labs:**
1. Visit [redis.com/try-free](https://redis.com/try-free)
2. Create free account
3. Create database
4. Copy connection string
5. Add to Management UI

### Local Redis

```bash
# macOS
brew install redis
brew services start redis

# Ubuntu
sudo apt install redis-server
sudo systemctl start redis

# Connection string
REDIS_URL=redis://localhost:6379
```

**Verify:**
- No more Redis connection errors in console
- SMS scheduling works
- Caching improves performance

---

## Step 6: (Optional) Configure SMS Integration

**Why:** Enables SMS notifications, USSD menus, and WhatsApp messaging.

**Setup:**

1. Visit [africastalking.com](https://africastalking.com)
2. Create account (free sandbox available)
3. Get API credentials
4. Add to Management UI:
   - `AFRICASTALKING_USERNAME`
   - `AFRICASTALKING_API_KEY`
   - `AFRICASTALKING_SENDER_ID` (optional)

**Test SMS:**

1. Navigate to **SMS Management**
2. Create SMS template
3. Schedule test message
4. Check delivery status

---

## Feature Matrix

| Feature | Requires | Status |
|---------|----------|--------|
| User Management | JWT (built-in) | ✅ Ready |
| Farmers & Farms | Database | ⏳ Needs PostgreSQL |
| Crops & Livestock | Database | ⏳ Needs PostgreSQL |
| Harvests & Expenses | Database | ⏳ Needs PostgreSQL |
| Weather Widgets | OpenWeatherMap API | ⏳ Needs API key |
| GPS Tracking | Database + PostGIS | ⏳ Needs PostgreSQL |
| Marketplace | Database | ⏳ Needs PostgreSQL |
| Microfinance | Database | ⏳ Needs PostgreSQL |
| SMS Notifications | Africa's Talking | ⏳ Optional |
| USSD Menus | Africa's Talking | ⏳ Optional |
| WhatsApp | Africa's Talking | ⏳ Optional |
| Payments (Stripe) | Stripe (built-in) | ✅ Ready |
| Payments (Mobile Money) | Mojaloop | ⏳ Optional |
| ML Models | Python/Go services | ⏳ Optional |
| ERP Integration | ERPNext | ⏳ Optional |

---

## Common Issues & Solutions

### "Database not available"
- **Solution:** Set up PostgreSQL and add `DATABASE_URL`
- **Guide:** `docs/POSTGRESQL_SETUP.md`

### "OpenWeather API key not configured"
- **Solution:** Add `OPENWEATHER_API_KEY` to Management UI
- **Guide:** `docs/OPENWEATHERMAP_SETUP.md`

### "Redis connection failed"
- **Solution:** This is expected without Redis. Core features still work.
- **Optional:** Set up Redis for caching and SMS scheduling

### "SMS Scheduler Error"
- **Solution:** This is expected without database connection
- **Fix:** Set up PostgreSQL

### Weather widget shows "Loading..." forever
- **Solution:** Check API key is correct and activated (wait 2 hours)
- **Verify:** Test API key with curl (see OpenWeatherMap guide)

---

## Priority Setup Recommendations

### For Development & Testing
1. **PostgreSQL** (Supabase free tier)
2. **OpenWeatherMap** (free tier)
3. Skip Redis, SMS, payments for now

### For Production Deployment
1. **PostgreSQL** (Managed service with backups)
2. **OpenWeatherMap** (paid tier for alerts)
3. **Redis** (for caching and performance)
4. **SMS Integration** (Africa's Talking)
5. **Payment Integration** (Stripe + Mojaloop)

### For Full Feature Testing
1. **PostgreSQL** (required)
2. **OpenWeatherMap** (required)
3. **Redis** (recommended)
4. **Africa's Talking** (optional)
5. **ML Services** (optional)

---

## Documentation Index

| Guide | Purpose | Time |
|-------|---------|------|
| [OPENWEATHERMAP_SETUP.md](./docs/OPENWEATHERMAP_SETUP.md) | Weather API integration | 5 min |
| [POSTGRESQL_SETUP.md](./docs/POSTGRESQL_SETUP.md) | Database setup with PostGIS | 30 min |
| [GPS_TRACKING_GUIDE.md](./docs/GPS_TRACKING_GUIDE.md) | GPS tracking testing | 15 min |
| [ENVIRONMENT_SETUP.md](./docs/ENVIRONMENT_SETUP.md) | All environment variables | Reference |
| [IMPROVEMENTS_PHASE28.md](./IMPROVEMENTS_PHASE28.md) | Recent improvements | Reference |

---

## Getting Help

### Documentation
- All guides in `docs/` folder
- Check `IMPROVEMENTS_PHASE28.md` for recent changes
- Review `todo.md` for planned features

### Troubleshooting
- Check browser console for errors
- Review server logs in terminal
- Verify environment variables are set
- Restart dev server after changes

### Testing
- 29 test files in `server/__tests__/`
- Run tests: `pnpm test` (requires database)
- Check TypeScript: `pnpm tsc --noEmit`

---

## Next Actions

**Immediate (Required for Core Features):**
1. Set up PostgreSQL database
2. Add OpenWeatherMap API key
3. Test basic features

**Soon (Recommended for Full Experience):**
4. Set up Redis for caching
5. Configure SMS integration
6. Test GPS tracking

**Later (Advanced Features):**
7. Set up ML services
8. Configure ERP integration
9. Add mobile money payments

---

## Success Metrics

You'll know setup is complete when:

- ✅ No "Database not available" errors
- ✅ Weather widgets display on farm pages
- ✅ GPS tracking shows devices on map
- ✅ All pages load without errors
- ✅ Data persists across sessions
- ✅ TypeScript shows 0 errors

---

**Ready to start?** Begin with Step 1: PostgreSQL setup using Supabase (easiest option).

**Questions?** Review the detailed guides in the `docs/` folder.
