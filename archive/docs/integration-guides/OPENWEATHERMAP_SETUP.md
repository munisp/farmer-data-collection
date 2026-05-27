# OpenWeatherMap API Setup Guide

This guide walks you through setting up the OpenWeatherMap API integration for weather features in the Farmer Data Collection platform.

---

## Overview

The platform integrates with OpenWeatherMap to provide:
- **Current weather conditions** for farm locations
- **5-day weather forecasts** with daily aggregation
- **Agricultural indices** (heat stress, evapotranspiration, growing degree days, frost risk)
- **Irrigation recommendations** based on weather conditions
- **Optimal spray conditions** for pesticide application
- **Weather alerts** (requires One Call API subscription)

---

## Step 1: Register for OpenWeatherMap API

### 1.1 Create an Account

1. Visit [OpenWeatherMap](https://openweathermap.org/api)
2. Click **Sign Up** in the top right corner
3. Fill in your details:
   - Email address
   - Username
   - Password
4. Verify your email address

### 1.2 Get Your API Key

1. Log in to your OpenWeatherMap account
2. Navigate to **API Keys** section (https://home.openweathermap.org/api_keys)
3. You'll see a default API key already created
4. Copy the API key (it looks like: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`)

**Note:** New API keys may take up to 2 hours to activate. If you get authentication errors, wait and try again.

---

## Step 2: Choose Your API Plan

### Free Tier (Recommended for Development)
- **Cost:** $0/month
- **Limits:**
  - 60 calls/minute
  - 1,000,000 calls/month
  - Current weather data
  - 5-day / 3-hour forecast
  - Historical data (limited)
- **Best for:** Development, testing, small-scale deployments

### Professional Tier (For Production)
- **Cost:** Starting at $40/month
- **Features:**
  - All free tier features
  - Weather alerts (One Call API)
  - 16-day forecast
  - Historical data (40+ years)
  - Higher rate limits
- **Best for:** Production deployments, enterprise use

For this guide, we'll use the **Free Tier**.

---

## Step 3: Add API Key to Environment Variables

### 3.1 Development Environment

Add the API key to your `.env` file:

```bash
# OpenWeatherMap API Configuration
OPENWEATHER_API_KEY=your_api_key_here
```

**Example:**
```bash
OPENWEATHER_API_KEY=your_openweather_api_key_here
```

### 3.2 Production Environment

For production deployments, add the environment variable through your hosting platform:

**Vercel:**
```bash
vercel env add OPENWEATHER_API_KEY
```

**Heroku:**
```bash
heroku config:set OPENWEATHER_API_KEY=your_api_key_here
```

**Docker:**
```bash
docker run -e OPENWEATHER_API_KEY=your_api_key_here ...
```

**Railway/Render:**
- Go to your project settings
- Add environment variable: `OPENWEATHER_API_KEY`
- Set value to your API key

---

## Step 4: Verify API Key Works

### 4.1 Test API Key Manually

Use curl to test your API key:

```bash
curl "https://api.openweathermap.org/data/2.5/weather?q=Lagos,NG&appid=YOUR_API_KEY&units=metric"
```

**Expected Response:**
```json
{
  "coord": {"lon": 3.3958, "lat": 6.4550},
  "weather": [{"id": 800, "main": "Clear", "description": "clear sky"}],
  "main": {
    "temp": 28.5,
    "feels_like": 32.1,
    "humidity": 75
  },
  ...
}
```

### 4.2 Test in Application

1. Restart your development server:
   ```bash
   pnpm dev
   ```

2. Navigate to any farm detail page
3. The weather widget should display current conditions
4. Check browser console for any errors

---

## Step 5: Configure Weather Features

### 5.1 Weather Router Configuration

The weather router is already configured in `server/routers/weather-router.ts`. It automatically reads the `OPENWEATHER_API_KEY` from environment variables.

**Available Endpoints:**
- `weather.getCurrentWeather` - Current weather for coordinates
- `weather.getForecast` - 5-day forecast
- `weather.getAgricultureIndices` - Agricultural indices
- `weather.getNearestWeatherStations` - Find nearby stations
- `weather.getWeatherAlerts` - Weather alerts (requires paid plan)

### 5.2 Weather Widget Usage

The weather widget is already integrated into farm pages. To use it in other pages:

```tsx
import { WeatherWidget } from "@/components/WeatherWidget";

<WeatherWidget
  latitude={farm.latitude}
  longitude={farm.longitude}
  farmName={farm.farmName}
/>
```

---

## Step 6: Understanding API Rate Limits

### Free Tier Limits
- **60 calls/minute** - Approximately 1 call per second
- **1,000,000 calls/month** - About 1,370 calls per hour average

### Best Practices
1. **Cache weather data** - Store results for 10-15 minutes
2. **Batch requests** - Combine multiple farm locations when possible
3. **Use webhooks** - For weather alerts (paid plan)
4. **Monitor usage** - Check your dashboard regularly

### Rate Limit Handling

The weather service automatically handles rate limits:
- Returns cached data when available
- Implements exponential backoff on errors
- Logs rate limit warnings

---

## Step 7: Troubleshooting

### Common Issues

**1. "API key not configured" Error**
- **Cause:** Environment variable not set
- **Solution:** Add `OPENWEATHER_API_KEY` to `.env` file and restart server

**2. "401 Unauthorized" Error**
- **Cause:** Invalid API key or key not activated yet
- **Solution:** Wait 2 hours after creating key, or verify key is correct

**3. "429 Too Many Requests" Error**
- **Cause:** Exceeded rate limit (60 calls/minute)
- **Solution:** Implement caching, reduce request frequency

**4. Weather widget shows "Loading..." forever**
- **Cause:** API key not working or network issue
- **Solution:** Check browser console for errors, verify API key

**5. No weather data for location**
- **Cause:** Invalid coordinates or location not supported
- **Solution:** Verify latitude/longitude are correct (e.g., 6.5244, 3.3792 for Lagos)

---

## Step 8: Advanced Features

### 8.1 Historical Weather Data

For historical weather analysis (requires paid plan):

```typescript
const historical = await trpc.weather.getHistoricalWeather.query({
  latitude: 6.5244,
  longitude: 3.3792,
  days: 30
});
```

### 8.2 Weather Alerts

For severe weather alerts (requires One Call API):

```typescript
const alerts = await trpc.weather.getWeatherAlerts.query({
  latitude: 6.5244,
  longitude: 3.3792
});
```

### 8.3 Agricultural Indices

Already available in free tier:

```typescript
const indices = await trpc.weather.getAgricultureIndices.query({
  latitude: 6.5244,
  longitude: 3.3792
});

// Returns:
// - heat_stress_index
// - evapotranspiration_mm
// - growing_degree_days
// - frost_risk
// - irrigation_recommendation
// - optimal_spray_conditions
```

---

## Step 9: Monitoring and Optimization

### 9.1 Monitor API Usage

1. Log in to OpenWeatherMap dashboard
2. Navigate to **Statistics** section
3. View:
   - API calls per day
   - Response times
   - Error rates

### 9.2 Optimize Performance

**Implement Caching:**
```typescript
// Cache weather data for 15 minutes
const cacheKey = `weather:${latitude}:${longitude}`;
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const weather = await fetchWeather(latitude, longitude);
await redis.setex(cacheKey, 900, JSON.stringify(weather)); // 15 minutes
return weather;
```

**Batch Requests:**
```typescript
// Request weather for multiple farms at once
const weatherData = await Promise.all(
  farms.map(farm => 
    trpc.weather.getCurrentWeather.query({
      latitude: farm.latitude,
      longitude: farm.longitude
    })
  )
);
```

---

## Step 10: Production Checklist

Before deploying to production:

- [ ] API key added to production environment variables
- [ ] Rate limiting implemented (if needed)
- [ ] Caching strategy in place
- [ ] Error handling tested
- [ ] Monitoring set up
- [ ] Backup weather data source (optional)
- [ ] Weather alerts configured (if using paid plan)
- [ ] Documentation updated for team

---

## Resources

### Official Documentation
- [OpenWeatherMap API Docs](https://openweathermap.org/api)
- [Current Weather API](https://openweathermap.org/current)
- [5 Day Forecast API](https://openweathermap.org/forecast5)
- [One Call API](https://openweathermap.org/api/one-call-3)

### Support
- [OpenWeatherMap FAQ](https://openweathermap.org/faq)
- [API Status Page](https://openweathermap.statuspage.io/)
- [Support Email](mailto:info@openweathermap.org)

### Platform Documentation
- Weather Router: `server/routers/weather-router.ts`
- Weather Service: `server/services/weather-service.ts`
- Weather Widget: `client/src/components/WeatherWidget.tsx`

---

## Next Steps

After setting up OpenWeatherMap:

1. **Test weather features** - Navigate to farm pages and verify weather display
2. **Set up PostgreSQL** - Follow `docs/POSTGRESQL_SETUP.md` for database configuration
3. **Test GPS tracking** - Follow `docs/GPS_TRACKING_GUIDE.md` for GPS features

---

**Questions or Issues?**

If you encounter any problems, check the troubleshooting section or review the server logs for detailed error messages.
