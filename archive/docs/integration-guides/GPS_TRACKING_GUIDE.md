# GPS Tracking Testing Guide

This guide walks you through testing the GPS tracking features in the Farmer Data Collection platform.

---

## Overview

The GPS tracking system provides:
- **Device registration** - Register GPS-enabled devices (smartphones, trackers)
- **Real-time tracking** - Record and visualize GPS coordinates
- **Geofencing** - Define boundaries and receive alerts
- **Track history** - View historical movement patterns
- **Analytics** - Distance traveled, speed, time analysis

---

## Prerequisites

Before testing GPS tracking:

1. **Database configured** - PostgreSQL with PostGIS extension
2. **User account** - Registered and logged in
3. **Farm created** - At least one farm with coordinates

---

## Step 1: Access GPS Tracking Page

### 1.1 Navigate to GPS Tracking

1. Log in to the platform
2. Click **GPS Tracking** in the sidebar navigation
3. You should see the GPS Tracking dashboard

### 1.2 GPS Tracking Dashboard

The dashboard displays:
- **Device list** - All registered GPS devices
- **Map view** - Real-time device locations
- **Statistics** - Active devices, total tracks, alerts

---

## Step 2: Register a GPS Device

### 2.1 Add New Device

1. Click **Register Device** button
2. Fill in device details:
   - **Device ID:** Unique identifier (e.g., `PHONE-001`, `TRACKER-123`)
   - **Device Name:** Friendly name (e.g., "John's Phone", "Tractor GPS")
   - **Farm:** Select associated farm (optional)
   - **Device Type:** smartphone, gps_tracker, vehicle_tracker, drone
3. Click **Register**

### 2.2 Verify Device Registration

- Device should appear in the device list
- Status should be "Active"
- Last seen should be "Never" (no tracks yet)

---

## Step 3: Simulate GPS Tracking

### 3.1 Using Browser Developer Tools

Since we're testing without physical GPS devices, we'll simulate GPS data:

**Open Browser Console:**
```javascript
// Simulate GPS track for a device
const deviceId = 1; // Your device ID from registration

// Lagos, Nigeria coordinates
const startLat = 6.5244;
const startLon = 3.3792;

// Simulate movement (10 points)
for (let i = 0; i < 10; i++) {
  const lat = startLat + (Math.random() - 0.5) * 0.01;
  const lon = startLon + (Math.random() - 0.5) * 0.01;
  const speed = Math.random() * 50; // km/h
  
  fetch('/api/trpc/gpsTracking.recordTrack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId,
      latitude: lat,
      longitude: lon,
      altitude: 100,
      speed,
      heading: Math.random() * 360,
      accuracy: 10
    })
  });
  
  // Wait 1 second between points
  await new Promise(r => setTimeout(r, 1000));
}
```

### 3.2 Using API Client

**Using curl:**
```bash
curl -X POST https://your-domain.com/api/trpc/gpsTracking.recordTrack \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "deviceId": 1,
    "latitude": 6.5244,
    "longitude": 3.3792,
    "altitude": 100,
    "speed": 25.5,
    "heading": 180,
    "accuracy": 10
  }'
```

### 3.3 Using Mobile App (Future)

When mobile app is available:
1. Install app on smartphone
2. Enable GPS permissions
3. Start tracking
4. Move around farm area
5. View real-time updates on web dashboard

---

## Step 4: View GPS Tracks

### 4.1 View on Map

1. Navigate to GPS Tracking page
2. Select device from list
3. Map should display:
   - **Device location** - Current position (blue marker)
   - **Track path** - Line showing movement (blue line)
   - **Start/End points** - Green (start) and red (end) markers

### 4.2 View Track History

1. Click on device in list
2. View track details:
   - **Date/Time** - When track was recorded
   - **Coordinates** - Latitude, longitude
   - **Speed** - km/h
   - **Distance** - Total distance traveled
   - **Duration** - Time elapsed

### 4.3 Filter Tracks

Filter tracks by:
- **Date range** - Last 24 hours, last week, custom range
- **Device** - Specific device or all devices
- **Farm** - Tracks within farm boundaries

---

## Step 5: Set Up Geofencing

### 5.1 Create Geofence

1. Click **Create Geofence** button
2. Draw boundary on map:
   - Click to add points
   - Double-click to complete polygon
3. Set geofence properties:
   - **Name:** "Farm Boundary", "Work Area"
   - **Type:** entry, exit, both
   - **Alert:** Enable/disable notifications
4. Click **Save Geofence**

### 5.2 Test Geofence Alerts

1. Simulate GPS tracks crossing geofence boundary
2. Check alerts:
   - Navigate to **Alerts** tab
   - View geofence violations
   - See entry/exit timestamps

### 5.3 Example Geofence Coordinates

**Farm Boundary (Lagos):**
```javascript
const geofence = {
  name: "Farm Boundary",
  type: "both",
  coordinates: [
    [3.3792, 6.5244],  // Northwest corner
    [3.3850, 6.5244],  // Northeast corner
    [3.3850, 6.5200],  // Southeast corner
    [3.3792, 6.5200],  // Southwest corner
    [3.3792, 6.5244]   // Close polygon
  ]
};
```

---

## Step 6: Analyze GPS Data

### 6.1 Device Statistics

View device statistics:
- **Total tracks** - Number of GPS points recorded
- **Total distance** - Cumulative distance traveled
- **Average speed** - Mean speed across all tracks
- **Active time** - Total time device was moving
- **Last seen** - Most recent GPS update

### 6.2 Track Analytics

Analyze individual tracks:
- **Distance calculation** - Haversine formula for accuracy
- **Speed analysis** - Min, max, average speeds
- **Time analysis** - Duration, stops, movement time
- **Route visualization** - Path on map with color coding

### 6.3 Heatmap Visualization

View heatmap of GPS activity:
1. Navigate to **Heatmap** tab
2. Select date range
3. View density of GPS tracks
4. Identify frequently visited areas

---

## Step 7: Advanced Features

### 7.1 Multi-Device Tracking

Track multiple devices simultaneously:
1. Register multiple devices
2. View all devices on map
3. Color-coded markers for each device
4. Toggle device visibility

### 7.2 Real-Time Updates

Enable real-time tracking:
1. Device sends GPS updates every 5-30 seconds
2. Dashboard updates automatically
3. No page refresh needed
4. WebSocket connection for low latency

### 7.3 Offline Tracking

Track GPS when offline:
1. Mobile app stores GPS points locally
2. Syncs to server when connection restored
3. Conflict resolution for overlapping tracks
4. Queue management for pending uploads

---

## Step 8: Integration with Other Features

### 8.1 Link GPS to Farms

Associate GPS devices with farms:
1. Edit device settings
2. Select farm from dropdown
3. GPS tracks automatically linked to farm
4. View farm-specific tracking data

### 8.2 GPS-Based Attendance

Track worker attendance using GPS:
1. Workers clock in/out via GPS
2. Verify location matches farm coordinates
3. Calculate work hours based on GPS tracks
4. Generate attendance reports

### 8.3 Equipment Tracking

Track farm equipment:
1. Install GPS trackers on tractors, vehicles
2. Monitor equipment location
3. Track usage hours
4. Maintenance scheduling based on GPS data

---

## Step 9: Troubleshooting

### Common Issues

**1. Device not appearing on map**
- **Cause:** No GPS tracks recorded yet
- **Solution:** Record at least one GPS track

**2. GPS coordinates inaccurate**
- **Cause:** Low GPS accuracy, poor signal
- **Solution:** Ensure device has clear view of sky, wait for GPS lock

**3. Geofence alerts not triggering**
- **Cause:** Geofence not saved or alerts disabled
- **Solution:** Verify geofence is active, check alert settings

**4. Tracks not syncing**
- **Cause:** Network connection lost, server error
- **Solution:** Check internet connection, verify server status

**5. Map not loading**
- **Cause:** Google Maps API key not configured
- **Solution:** Add `GOOGLE_MAPS_API_KEY` to environment variables

---

## Step 10: Best Practices

### 10.1 GPS Accuracy

Improve GPS accuracy:
- **Wait for GPS lock** - Allow 30-60 seconds for initial lock
- **Clear view of sky** - Avoid buildings, trees, tunnels
- **Use external GPS** - Dedicated GPS trackers more accurate than phones
- **Calibrate sensors** - Regularly calibrate compass and accelerometer

### 10.2 Battery Optimization

Optimize battery life:
- **Adjust update frequency** - 30-60 seconds for normal tracking
- **Use geofencing** - Only track when entering/exiting areas
- **Background tracking** - Minimize app usage while tracking
- **Power-saving mode** - Reduce GPS accuracy for longer battery life

### 10.3 Data Management

Manage GPS data efficiently:
- **Archive old tracks** - Move tracks older than 90 days to archive
- **Compress data** - Store tracks in compressed format
- **Limit track points** - Reduce frequency for long-duration tracking
- **Delete unnecessary tracks** - Remove test data, duplicates

---

## Testing Checklist

Complete these tests:

- [ ] Register GPS device successfully
- [ ] Record GPS track with valid coordinates
- [ ] View device on map
- [ ] View track history
- [ ] Create geofence boundary
- [ ] Test geofence entry alert
- [ ] Test geofence exit alert
- [ ] View device statistics
- [ ] Filter tracks by date range
- [ ] View multiple devices simultaneously
- [ ] Test real-time updates (if available)
- [ ] Link GPS device to farm
- [ ] Generate GPS analytics report

---

## Sample Test Data

### Nigerian Farm Coordinates

**Lagos (Urban):**
- Latitude: 6.5244
- Longitude: 3.3792

**Ibadan (Rural):**
- Latitude: 7.3775
- Longitude: 3.9470

**Kano (Northern):**
- Latitude: 12.0022
- Longitude: 8.5919

**Port Harcourt (Southern):**
- Latitude: 4.8156
- Longitude: 7.0498

### Test Scenarios

**Scenario 1: Farm Patrol**
```javascript
// Simulate farmer walking around farm perimeter
const patrol = [
  { lat: 6.5244, lon: 3.3792 },  // Start: Northwest corner
  { lat: 6.5244, lon: 3.3850 },  // Northeast corner
  { lat: 6.5200, lon: 3.3850 },  // Southeast corner
  { lat: 6.5200, lon: 3.3792 },  // Southwest corner
  { lat: 6.5244, lon: 3.3792 }   // Return to start
];
```

**Scenario 2: Equipment Movement**
```javascript
// Simulate tractor moving across field
const fieldWork = [
  { lat: 6.5240, lon: 3.3795, speed: 15 },  // Start
  { lat: 6.5235, lon: 3.3800, speed: 18 },  // Moving
  { lat: 6.5230, lon: 3.3805, speed: 20 },  // Working
  { lat: 6.5225, lon: 3.3810, speed: 22 },  // Continue
  { lat: 6.5220, lon: 3.3815, speed: 0 }    // Stop
];
```

---

## Next Steps

After testing GPS tracking:

1. **Deploy mobile app** - Build React Native app for field workers
2. **Set up real-time sync** - Configure WebSocket for live updates
3. **Integrate with payroll** - Link GPS attendance to payroll system
4. **Add analytics** - Build custom reports and dashboards

---

## Resources

- GPS Tracking Router: `server/routers/gps-tracking-router.ts`
- GPS Tracking Page: `client/src/pages/GPSTracking.tsx`
- Database Schema: `drizzle/schema.ts` (gps_devices, gps_tracks, gps_geofences)
- [PostGIS Documentation](https://postgis.net/documentation/)
- [Google Maps API](https://developers.google.com/maps)

---

**Questions or Issues?**

Check the troubleshooting section or review server logs for detailed error messages.
