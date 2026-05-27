# Agricultural Intelligence System Guide

## Overview

The Agricultural Intelligence System provides data-driven insights for Nigerian farmers through three integrated modules:

1. **Soil Moisture Monitoring** - Real-time satellite data and irrigation recommendations
2. **GDD (Growing Degree Days) Tracking** - Crop development monitoring and harvest predictions
3. **Pest & Disease Risk Assessment** - Weather-based risk analysis and IPM guidance

## Features

### 1. Soil Moisture Monitoring

**Data Sources:**
- NASA SMAP (Soil Moisture Active Passive) satellite
- Copernicus Sentinel-1 satellite
- Ground-based sensors (when available)

**Capabilities:**
- Real-time soil moisture levels (0-100%)
- Crop-specific irrigation recommendations
- Urgency levels: immediate, soon, monitor, none
- Water amount calculations (mm)
- Moisture status tracking: optimal, adequate, critical, stress

**API Endpoints:**
- `getSoilMoisture(farmId)` - Fetch current moisture levels
- `getIrrigationRecommendation(farmId, cropType, soilType, growthStage)` - Get irrigation guidance
- `recordSoilMoisture(cropId, moisture, source, depth, quality)` - Log manual readings
- `recordIrrigationAction(cropId, waterAmount, method)` - Track irrigation events

### 2. GDD (Growing Degree Days) Tracking

**Supported Crops (8 Nigerian varieties):**
- Maize (2,000-2,500 GDD, base 10°C)
- Rice (2,500-3,000 GDD, base 10°C)
- Cassava (4,000-5,000 GDD, base 12°C)
- Yam (3,500-4,500 GDD, base 12°C)
- Sorghum (2,200-2,800 GDD, base 10°C)
- Millet (1,800-2,200 GDD, base 10°C)
- Cowpea (1,200-1,500 GDD, base 10°C)
- Groundnut (1,800-2,200 GDD, base 10°C)

**Growth Stages Tracked:**
1. Emergence (0-10% complete)
2. Vegetative (10-40% complete)
3. Flowering (40-70% complete)
4. Grain Fill/Maturity (70-100% complete)

**Capabilities:**
- Daily GDD accumulation tracking
- Growth stage progression monitoring
- Harvest date prediction (±7 days accuracy)
- Optimal planting date calculation
- On-track status alerts

**API Endpoints:**
- `getCropGrowthStatus(cropId)` - Get current GDD status
- `predictHarvestDate(cropType, plantingDate, location)` - Estimate harvest timing
- `calculateOptimalPlantingDate(cropType, desiredHarvestDate, location)` - Plan planting
- `updateCropCalendar(cropId, cumulativeGDD, currentStage)` - Manual updates

### 3. Pest & Disease Risk Assessment

**Monitored Threats (20+ pests and diseases):**

**Pests:**
- Fall Armyworm (critical for maize, sorghum, millet)
- Stem Borers (high risk for maize, rice)
- Aphids (medium risk for cowpea, groundnut)
- Whiteflies (medium risk for cassava)
- Grasshoppers (low risk for all crops)

**Diseases:**
- Cassava Mosaic Disease (critical for cassava)
- Maize Streak Virus (high risk for maize)
- Rice Blast (high risk for rice)
- Yam Anthracnose (medium risk for yam)
- Groundnut Rosette (high risk for groundnut)

**Risk Factors:**
- Temperature (favorable/neutral/unfavorable)
- Humidity (favorable/neutral/unfavorable)
- Rainfall (favorable/neutral/unfavorable)

**Risk Levels:**
- **Critical** (80-100 score) - Immediate action required
- **High** (60-79 score) - Action needed soon
- **Medium** (40-59 score) - Monitor closely
- **Low** (0-39 score) - Routine monitoring

**IPM (Integrated Pest Management) Recommendations:**
1. Preventive measures (crop rotation, resistant varieties)
2. Monitoring schedule (weekly field scouting)
3. Cultural practices (proper spacing, sanitation)
4. Biological controls (natural predators, biopesticides)
5. Chemical controls (last resort, specific products)

**API Endpoints:**
- `getCropRisks(cropId, weather)` - Assess current risks
- `getIPMRecommendations(cropId, weather, growthStage)` - Get management strategies
- `getHighPriorityAlerts(weather)` - Critical risk notifications

## Automated Monitoring System

### Cron Jobs Schedule

**Daily Soil Moisture Check (6:00 AM)**
- Fetches satellite data for all active crops
- Calculates irrigation needs
- Sends urgent alerts for critical moisture levels

**Daily GDD Update (7:00 AM)**
- Accumulates GDD from previous day's weather
- Updates growth stages
- Sends harvest approach notifications (14 days before)

**Daily Pest/Disease Assessment (8:00 AM)**
- Analyzes weather conditions
- Calculates risk scores
- Stores high-risk alerts in database
- Sends critical risk notifications

**Weekly Summary Report (Monday 9:00 AM)**
- Compiles weekly agricultural intelligence summary
- Includes all alerts and recommendations
- Sent via email/SMS to farmers

### Notification System

**Alert Types:**
1. **Urgent Irrigation** - Critical soil moisture, immediate action needed
2. **Harvest Approaching** - 14 days before estimated harvest
3. **Critical Pest/Disease Risk** - Risk level 80+ detected
4. **Growth Stage Change** - Crop entered new development stage

## Database Schema

### crop_calendar
```sql
id                      SERIAL PRIMARY KEY
crop_id                 INTEGER NOT NULL
planting_date           TIMESTAMP
estimated_harvest_date  TIMESTAMP
actual_harvest_date     TIMESTAMP
cumulative_gdd          INTEGER DEFAULT 0
current_stage           VARCHAR(100)
gdd_to_maturity         INTEGER
percent_complete        DECIMAL(5, 2)
is_on_track             BOOLEAN DEFAULT TRUE
recommendations         JSONB
created_at              TIMESTAMP DEFAULT NOW()
updated_at              TIMESTAMP DEFAULT NOW()
```

### pest_disease_risks
```sql
id                 SERIAL PRIMARY KEY
crop_id            INTEGER NOT NULL
pest_or_disease    VARCHAR(200) NOT NULL
type               VARCHAR(20) NOT NULL  -- 'pest' or 'disease'
risk_level         VARCHAR(20) NOT NULL  -- 'low', 'medium', 'high', 'critical'
risk_score         INTEGER NOT NULL      -- 0-100
temperature        DECIMAL(5, 2)
humidity           DECIMAL(5, 2)
rainfall           DECIMAL(7, 2)
recommendation     TEXT
assessment_date    TIMESTAMP NOT NULL
created_at         TIMESTAMP DEFAULT NOW()
```

### soil_moisture_readings
```sql
id             SERIAL PRIMARY KEY
crop_id        INTEGER NOT NULL
moisture       DECIMAL(5, 3) NOT NULL  -- 0.000-1.000 (0-100%)
source         VARCHAR(50) NOT NULL     -- 'smap', 'copernicus', 'manual'
depth          INTEGER NOT NULL         -- cm
quality        VARCHAR(20) NOT NULL     -- 'good', 'fair', 'poor'
reading_date   TIMESTAMP NOT NULL
created_at     TIMESTAMP DEFAULT NOW()
```

### irrigation_recommendations
```sql
id                    SERIAL PRIMARY KEY
crop_id               INTEGER NOT NULL
should_irrigate       BOOLEAN NOT NULL
urgency               VARCHAR(20) NOT NULL  -- 'immediate', 'soon', 'monitor', 'none'
water_amount          INTEGER NOT NULL      -- mm
moisture_status       VARCHAR(20) NOT NULL  -- 'optimal', 'adequate', 'critical', 'stress'
reason                TEXT NOT NULL
next_check_date       TIMESTAMP
recommendation_date   TIMESTAMP NOT NULL
was_followed          BOOLEAN
created_at            TIMESTAMP DEFAULT NOW()
```

## User Interface

### Agricultural Intelligence Dashboard

**Location:** `/agricultural-intelligence`

**Components:**

1. **Crop Selection Card**
   - Dropdown to select active crop
   - Shows planting date
   - Filters all data for selected crop

2. **Crop Calendar (Left Column)**
   - Visual GDD progress bar
   - Growth stage timeline
   - Harvest countdown
   - Development recommendations

3. **Soil Moisture Monitor (Left Column)**
   - Current moisture percentage
   - Status indicator (optimal/adequate/critical/stress)
   - Irrigation recommendation card
   - Water amount guidance
   - Refresh button

4. **Pest & Disease Risk Panel (Right Column)**
   - Risk Alerts Tab:
     - High-priority alerts (critical/high)
     - Risk score and severity
     - Symptoms to watch
     - Immediate actions
     - Other risks list
   - IPM Guide Tab:
     - Monitoring schedule
     - Preventive measures
     - Cultural practices
     - Biological controls
     - Chemical controls (last resort)

5. **Weather Conditions Card**
   - Current temperature, humidity, rainfall
   - Used for risk calculations

**Responsive Design:**
- **Mobile:** Tabbed interface (GDD / Moisture / Risks)
- **Desktop:** Two-column grid layout

## Testing Guide

### Prerequisites
1. User account with active crops
2. Farm with valid GPS coordinates (latitude/longitude)
3. Crops with planting dates set

### Test Scenarios

#### 1. Soil Moisture Monitoring Test
```
1. Navigate to /agricultural-intelligence
2. Select a crop from dropdown
3. Verify soil moisture card displays:
   - Moisture percentage
   - Source (SMAP/Copernicus)
   - Quality indicator
   - Timestamp
4. Check irrigation recommendation:
   - Should/shouldn't irrigate
   - Urgency level
   - Water amount (if needed)
   - Reason explanation
5. Click "Refresh Data" button
6. Verify data updates
```

#### 2. GDD Tracking Test
```
1. Select crop with planting date
2. Verify Crop Calendar displays:
   - Days after planting
   - Cumulative GDD
   - Current growth stage
   - Progress percentage
   - Estimated harvest date
   - Days to harvest
3. Check growth stage timeline:
   - Completed stages (green)
   - Current stage (highlighted)
   - Upcoming stages (gray)
4. Review recommendations list
```

#### 3. Pest/Disease Risk Test
```
1. Check Risk Alerts tab:
   - High-priority alerts displayed
   - Risk level badges (critical/high/medium/low)
   - Risk scores shown
   - Weather factors indicated
   - Symptoms listed
   - Control measures provided
2. Switch to IPM Guide tab:
   - Monitoring schedule shown
   - Preventive measures listed
   - Cultural practices detailed
   - Biological controls explained
   - Chemical controls (last resort) listed
3. Click "Refresh" button
4. Verify risk assessment updates
```

#### 4. Cron Jobs Verification
```
1. Check server logs for cron job initialization:
   [Cron] Soil moisture monitoring scheduled (daily at 6:00 AM)
   [Cron] GDD tracking scheduled (daily at 7:00 AM)
   [Cron] Pest/disease monitoring scheduled (daily at 8:00 AM)
   [Cron] Weekly summary scheduled (Mondays at 9:00 AM)

2. Verify cron jobs are running:
   - Check database for new soil_moisture_readings entries
   - Check crop_calendar updates (cumulative_gdd changes)
   - Check pest_disease_risks for new assessments

3. Test manual trigger (optional):
   - Import cron functions in server console
   - Call individual monitoring functions
   - Verify database updates
```

## API Integration Examples

### Example 1: Fetch Soil Moisture
```typescript
const soilMoisture = await trpc.agriculturalIntelligence.getSoilMoisture.useQuery({
  farmId: 1
});

// Response:
{
  moisture: 0.45,  // 45%
  timestamp: "2024-11-26T06:00:00Z",
  source: "smap",
  quality: "good"
}
```

### Example 2: Get Irrigation Recommendation
```typescript
const recommendation = await trpc.agriculturalIntelligence.getIrrigationRecommendation.useQuery({
  farmId: 1,
  cropType: "maize",
  soilType: "loamy",
  growthStage: "vegetative"
});

// Response:
{
  shouldIrrigate: true,
  urgency: "soon",
  waterAmount: 25,  // mm
  moistureStatus: "adequate",
  reason: "Soil moisture at 45% is adequate but approaching stress threshold...",
  nextCheckDate: "2024-11-28T06:00:00Z"
}
```

### Example 3: Track Crop Growth
```typescript
const growthStatus = await trpc.agriculturalIntelligence.getCropGrowthStatus.useQuery({
  cropId: 1
});

// Response:
{
  cropType: "maize",
  plantingDate: "2024-10-01T00:00:00Z",
  daysAfterPlanting: 56,
  cumulativeGDD: 1200,
  gddToMaturity: 2250,
  percentComplete: 53,
  currentStage: "flowering",
  nextStage: "grain fill",
  gddToNextStage: 350,
  estimatedHarvestDate: "2025-01-15T00:00:00Z",
  daysToHarvest: 50,
  isOnTrack: true,
  recommendations: [
    "Apply nitrogen fertilizer for grain development",
    "Monitor for fall armyworm during flowering stage"
  ]
}
```

### Example 4: Assess Pest Risks
```typescript
const risks = await trpc.agriculturalIntelligence.getCropRisks.useQuery({
  cropId: 1,
  weather: {
    temperature: 28,
    humidity: 75,
    rainfall: 85
  }
});

// Response:
[
  {
    pestOrDisease: "Fall Armyworm",
    type: "pest",
    riskLevel: "high",
    riskScore: 75,
    affectedCrops: ["maize", "sorghum", "millet"],
    severity: "high",
    symptoms: [
      "Irregular holes in leaves",
      "Sawdust-like frass near whorl",
      "Damaged tassels and ears"
    ],
    controlMeasures: [
      "Scout fields every 2-3 days",
      "Apply Bt biopesticides",
      "Use pheromone traps"
    ],
    weatherFactors: {
      temperature: "favorable",
      humidity: "favorable",
      rainfall: "favorable"
    },
    recommendation: "High risk conditions detected. Increase field scouting frequency..."
  }
]
```

## Troubleshooting

### Common Issues

**1. No soil moisture data available**
- **Cause:** Farm missing GPS coordinates
- **Solution:** Add latitude/longitude to farm profile

**2. GDD not calculating**
- **Cause:** Missing planting date or weather data
- **Solution:** Set planting date in crop record, verify weather API access

**3. Pest/disease risks not showing**
- **Cause:** Weather data not provided
- **Solution:** Ensure weather conditions are fetched from weather API

**4. Cron jobs not running**
- **Cause:** Server not initialized properly
- **Solution:** Check server logs for cron initialization messages

**5. Database connection errors**
- **Cause:** PostgreSQL not running or wrong credentials
- **Solution:** Verify DATABASE_URL in .env.local

## Best Practices

### For Farmers

1. **Keep farm coordinates accurate** - Soil moisture relies on precise location
2. **Set planting dates immediately** - GDD tracking starts from planting
3. **Check dashboard daily** - Review alerts and recommendations
4. **Log irrigation actions** - Track what you've done for better recommendations
5. **Follow IPM guidelines** - Use chemical controls only as last resort

### For Developers

1. **Cache satellite data** - SMAP/Copernicus have rate limits
2. **Validate weather data** - Ensure temperature/humidity/rainfall are reasonable
3. **Handle API failures gracefully** - Provide fallback data sources
4. **Log cron job executions** - Monitor for failures or delays
5. **Test with real coordinates** - Mock data won't match satellite coverage

## Future Enhancements

1. **SMS Alerts** - Send critical notifications via Africa's Talking
2. **Historical Analysis** - Compare current season with past years
3. **Yield Correlation** - Link GDD tracking to actual harvest outcomes
4. **Community Data** - Share pest/disease reports among nearby farmers
5. **Weather Forecasts** - Predict risks 7 days ahead
6. **Drone Integration** - Incorporate aerial imagery for pest detection
7. **Soil Testing Integration** - Combine satellite data with lab results
8. **Market Price Integration** - Optimize harvest timing for best prices

## Support

For issues or questions:
- Check server logs: `tail -f /var/log/agricultural-intelligence.log`
- Review database: `psql -d farmer_data -c "SELECT * FROM crop_calendar;"`
- Test API endpoints: Use Postman or tRPC playground
- Contact: [Your support email/phone]

---

**Version:** 1.0.0  
**Last Updated:** November 26, 2024  
**Author:** Agricultural Intelligence Team
