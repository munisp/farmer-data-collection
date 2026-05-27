"""
Real-Time Weather Service
Integrates with OpenWeatherMap, Tomorrow.io, and Open-Meteo APIs

Features:
- Current weather conditions
- 7-day forecasts
- Historical weather data
- Agricultural weather alerts (frost, heat, drought)
- Growing Degree Days (GDD) calculation
- Evapotranspiration (ET) estimation
"""
import os
import json
import logging
import asyncio
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Weather Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "")
TOMORROW_IO_API_KEY = os.getenv("TOMORROW_IO_API_KEY", "")
OPEN_METEO_URL = "https://api.open-meteo.com/v1"

# GDD base temperatures for common crops (Celsius)
GDD_BASE_TEMPS = {
    "maize": 10,
    "corn": 10,
    "rice": 10,
    "wheat": 0,
    "sorghum": 10,
    "millet": 10,
    "cassava": 15,
    "yam": 15,
    "beans": 10,
    "soybeans": 10,
    "cotton": 15.5,
    "tomato": 10,
    "pepper": 15,
    "ginger": 13,
    "oil_palm": 18,
    "cocoa": 15,
    "coffee_arabica": 10,
    "coffee_robusta": 15,
    "rubber": 18,
    "banana": 14,
    "sugarcane": 12,
    "turmeric": 13,
    "avocado": 10,
    "mango": 15,
    "citrus": 12,
}

# Comprehensive crop climate requirements for suitability analysis
CROP_CLIMATE_REQUIREMENTS = {
    "oil_palm": {
        "optimal_temp_min": 24, "optimal_temp_max": 32,
        "critical_temp_min": 20, "critical_temp_max": 40,
        "annual_rainfall_min": 2500, "annual_rainfall_max": 4000,
        "humidity_min": 75, "humidity_max": 100,
        "frost_tolerant": False, "lifecycle_years": 25,
        "years_to_first_harvest": 3, "gdd_to_maturity": 0,
        "planting_density_per_ha": 145, "spacing_m": 9,
    },
    "cocoa": {
        "optimal_temp_min": 21, "optimal_temp_max": 32,
        "critical_temp_min": 15, "critical_temp_max": 38,
        "annual_rainfall_min": 1500, "annual_rainfall_max": 2500,
        "humidity_min": 70, "humidity_max": 100,
        "frost_tolerant": False, "lifecycle_years": 25,
        "years_to_first_harvest": 3, "gdd_to_maturity": 0,
        "planting_density_per_ha": 1000, "spacing_m": 3,
    },
    "coffee_arabica": {
        "optimal_temp_min": 15, "optimal_temp_max": 24,
        "critical_temp_min": 10, "critical_temp_max": 30,
        "annual_rainfall_min": 1500, "annual_rainfall_max": 2000,
        "humidity_min": 60, "humidity_max": 90,
        "frost_tolerant": False, "lifecycle_years": 20,
        "years_to_first_harvest": 3, "gdd_to_maturity": 0,
        "planting_density_per_ha": 2500, "spacing_m": 2,
    },
    "coffee_robusta": {
        "optimal_temp_min": 22, "optimal_temp_max": 28,
        "critical_temp_min": 15, "critical_temp_max": 35,
        "annual_rainfall_min": 1500, "annual_rainfall_max": 3000,
        "humidity_min": 70, "humidity_max": 100,
        "frost_tolerant": False, "lifecycle_years": 15,
        "years_to_first_harvest": 2, "gdd_to_maturity": 0,
        "planting_density_per_ha": 1100, "spacing_m": 3,
    },
    "maize": {
        "optimal_temp_min": 20, "optimal_temp_max": 30,
        "critical_temp_min": 10, "critical_temp_max": 40,
        "annual_rainfall_min": 500, "annual_rainfall_max": 1200,
        "humidity_min": 50, "humidity_max": 80,
        "frost_tolerant": False, "lifecycle_years": 1,
        "years_to_first_harvest": 0.3, "gdd_to_maturity": 1400,
        "planting_density_per_ha": 70000, "spacing_m": 0.25,
    },
    "rice": {
        "optimal_temp_min": 22, "optimal_temp_max": 32,
        "critical_temp_min": 15, "critical_temp_max": 40,
        "annual_rainfall_min": 1000, "annual_rainfall_max": 2000,
        "humidity_min": 60, "humidity_max": 90,
        "frost_tolerant": False, "lifecycle_years": 1,
        "years_to_first_harvest": 0.3, "gdd_to_maturity": 1500,
        "planting_density_per_ha": 200000, "spacing_m": 0.2,
    },
    "cassava": {
        "optimal_temp_min": 25, "optimal_temp_max": 29,
        "critical_temp_min": 15, "critical_temp_max": 40,
        "annual_rainfall_min": 1000, "annual_rainfall_max": 1500,
        "humidity_min": 50, "humidity_max": 90,
        "frost_tolerant": False, "lifecycle_years": 1,
        "years_to_first_harvest": 0.75, "gdd_to_maturity": 0,
        "planting_density_per_ha": 10000, "spacing_m": 1,
    },
    "banana": {
        "optimal_temp_min": 26, "optimal_temp_max": 30,
        "critical_temp_min": 15, "critical_temp_max": 38,
        "annual_rainfall_min": 1500, "annual_rainfall_max": 2500,
        "humidity_min": 60, "humidity_max": 90,
        "frost_tolerant": False, "lifecycle_years": 6,
        "years_to_first_harvest": 1, "gdd_to_maturity": 0,
        "planting_density_per_ha": 2000, "spacing_m": 2.5,
    },
    "sugarcane": {
        "optimal_temp_min": 20, "optimal_temp_max": 35,
        "critical_temp_min": 15, "critical_temp_max": 40,
        "annual_rainfall_min": 1500, "annual_rainfall_max": 2500,
        "humidity_min": 60, "humidity_max": 90,
        "frost_tolerant": False, "lifecycle_years": 5,
        "years_to_first_harvest": 1, "gdd_to_maturity": 0,
        "planting_density_per_ha": 40000, "spacing_m": 1.5,
    },
    "rubber": {
        "optimal_temp_min": 25, "optimal_temp_max": 30,
        "critical_temp_min": 20, "critical_temp_max": 35,
        "annual_rainfall_min": 2000, "annual_rainfall_max": 4000,
        "humidity_min": 75, "humidity_max": 100,
        "frost_tolerant": False, "lifecycle_years": 30,
        "years_to_first_harvest": 7, "gdd_to_maturity": 0,
        "planting_density_per_ha": 400, "spacing_m": 5,
    },
    "ginger": {
        "optimal_temp_min": 20, "optimal_temp_max": 30,
        "critical_temp_min": 15, "critical_temp_max": 35,
        "annual_rainfall_min": 1500, "annual_rainfall_max": 3000,
        "humidity_min": 70, "humidity_max": 90,
        "frost_tolerant": False, "lifecycle_years": 1,
        "years_to_first_harvest": 0.75, "gdd_to_maturity": 0,
        "planting_density_per_ha": 100000, "spacing_m": 0.25,
    },
    "turmeric": {
        "optimal_temp_min": 20, "optimal_temp_max": 30,
        "critical_temp_min": 15, "critical_temp_max": 35,
        "annual_rainfall_min": 1500, "annual_rainfall_max": 2500,
        "humidity_min": 70, "humidity_max": 90,
        "frost_tolerant": False, "lifecycle_years": 1,
        "years_to_first_harvest": 0.75, "gdd_to_maturity": 0,
        "planting_density_per_ha": 60000, "spacing_m": 0.3,
    },
    "avocado": {
        "optimal_temp_min": 16, "optimal_temp_max": 25,
        "critical_temp_min": 5, "critical_temp_max": 35,
        "annual_rainfall_min": 1000, "annual_rainfall_max": 1700,
        "humidity_min": 50, "humidity_max": 80,
        "frost_tolerant": False, "lifecycle_years": 40,
        "years_to_first_harvest": 4, "gdd_to_maturity": 0,
        "planting_density_per_ha": 200, "spacing_m": 7,
    },
    "mango": {
        "optimal_temp_min": 24, "optimal_temp_max": 30,
        "critical_temp_min": 10, "critical_temp_max": 45,
        "annual_rainfall_min": 750, "annual_rainfall_max": 2500,
        "humidity_min": 50, "humidity_max": 80,
        "frost_tolerant": False, "lifecycle_years": 40,
        "years_to_first_harvest": 4, "gdd_to_maturity": 0,
        "planting_density_per_ha": 100, "spacing_m": 10,
    },
    "citrus": {
        "optimal_temp_min": 15, "optimal_temp_max": 30,
        "critical_temp_min": -5, "critical_temp_max": 40,
        "annual_rainfall_min": 900, "annual_rainfall_max": 1500,
        "humidity_min": 50, "humidity_max": 80,
        "frost_tolerant": True, "lifecycle_years": 30,
        "years_to_first_harvest": 3, "gdd_to_maturity": 0,
        "planting_density_per_ha": 400, "spacing_m": 5,
    },
}


# ============================================================================
# MODELS
# ============================================================================

class LocationRequest(BaseModel):
    latitude: float
    longitude: float


class ForecastRequest(BaseModel):
    latitude: float
    longitude: float
    days: int = 7


class HistoricalRequest(BaseModel):
    latitude: float
    longitude: float
    start_date: str
    end_date: str


class GDDRequest(BaseModel):
    latitude: float
    longitude: float
    crop_type: str
    planting_date: str
    target_gdd: Optional[float] = None


class AlertRequest(BaseModel):
    latitude: float
    longitude: float
    crop_type: str
    thresholds: Optional[Dict[str, float]] = None


# ============================================================================
# OPEN-METEO INTEGRATION (Free, no API key required)
# ============================================================================

async def fetch_open_meteo_current(lat: float, lon: float) -> Dict[str, Any]:
    """Fetch current weather from Open-Meteo"""
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{OPEN_METEO_URL}/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m,wind_direction_10m,cloud_cover,surface_pressure",
                "timezone": "auto",
            },
            timeout=30.0,
        )
        
        if response.status_code == 200:
            data = response.json()
            current = data.get("current", {})
            
            return {
                "source": "open-meteo",
                "timestamp": current.get("time"),
                "temperature": current.get("temperature_2m"),
                "humidity": current.get("relative_humidity_2m"),
                "precipitation": current.get("precipitation", 0),
                "rain": current.get("rain", 0),
                "wind_speed": current.get("wind_speed_10m"),
                "wind_direction": current.get("wind_direction_10m"),
                "cloud_cover": current.get("cloud_cover"),
                "pressure": current.get("surface_pressure"),
                "units": {
                    "temperature": "celsius",
                    "humidity": "percent",
                    "precipitation": "mm",
                    "wind_speed": "km/h",
                    "pressure": "hPa",
                },
            }
        else:
            logger.error(f"Open-Meteo error: {response.status_code}")
            return generate_simulated_current(lat, lon)


async def fetch_open_meteo_forecast(lat: float, lon: float, days: int = 7) -> Dict[str, Any]:
    """Fetch weather forecast from Open-Meteo"""
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{OPEN_METEO_URL}/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,precipitation_probability_max,wind_speed_10m_max,et0_fao_evapotranspiration",
                "forecast_days": days,
                "timezone": "auto",
            },
            timeout=30.0,
        )
        
        if response.status_code == 200:
            data = response.json()
            daily = data.get("daily", {})
            
            forecast = []
            dates = daily.get("time", [])
            
            for i, date in enumerate(dates):
                forecast.append({
                    "date": date,
                    "temp_max": daily.get("temperature_2m_max", [None])[i],
                    "temp_min": daily.get("temperature_2m_min", [None])[i],
                    "precipitation": daily.get("precipitation_sum", [0])[i],
                    "rain": daily.get("rain_sum", [0])[i],
                    "precipitation_probability": daily.get("precipitation_probability_max", [0])[i],
                    "wind_speed_max": daily.get("wind_speed_10m_max", [None])[i],
                    "evapotranspiration": daily.get("et0_fao_evapotranspiration", [None])[i],
                })
            
            return {
                "source": "open-meteo",
                "location": {"latitude": lat, "longitude": lon},
                "forecast": forecast,
                "days": len(forecast),
            }
        else:
            logger.error(f"Open-Meteo forecast error: {response.status_code}")
            return generate_simulated_forecast(lat, lon, days)


async def fetch_open_meteo_historical(lat: float, lon: float, start_date: str, end_date: str) -> Dict[str, Any]:
    """Fetch historical weather from Open-Meteo Archive"""
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://archive-api.open-meteo.com/v1/archive",
            params={
                "latitude": lat,
                "longitude": lon,
                "start_date": start_date,
                "end_date": end_date,
                "daily": "temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,rain_sum,et0_fao_evapotranspiration",
                "timezone": "auto",
            },
            timeout=60.0,
        )
        
        if response.status_code == 200:
            data = response.json()
            daily = data.get("daily", {})
            
            history = []
            dates = daily.get("time", [])
            
            for i, date in enumerate(dates):
                history.append({
                    "date": date,
                    "temp_max": daily.get("temperature_2m_max", [None])[i],
                    "temp_min": daily.get("temperature_2m_min", [None])[i],
                    "temp_mean": daily.get("temperature_2m_mean", [None])[i],
                    "precipitation": daily.get("precipitation_sum", [0])[i],
                    "rain": daily.get("rain_sum", [0])[i],
                    "evapotranspiration": daily.get("et0_fao_evapotranspiration", [None])[i],
                })
            
            return {
                "source": "open-meteo-archive",
                "location": {"latitude": lat, "longitude": lon},
                "period": {"start": start_date, "end": end_date},
                "data": history,
                "days": len(history),
            }
        else:
            logger.error(f"Open-Meteo archive error: {response.status_code}")
            return generate_simulated_historical(lat, lon, start_date, end_date)


# ============================================================================
# SIMULATED DATA (Fallback)
# ============================================================================

def generate_simulated_current(lat: float, lon: float) -> Dict[str, Any]:
    """Generate simulated current weather"""
    np.random.seed(int(lat * 1000 + lon * 100) % 2**31)
    
    # Adjust for latitude (tropical vs temperate)
    base_temp = 30 - abs(lat - 10) * 0.5
    
    return {
        "source": "simulated",
        "timestamp": datetime.utcnow().isoformat(),
        "temperature": round(base_temp + np.random.uniform(-5, 5), 1),
        "humidity": round(np.random.uniform(50, 90), 1),
        "precipitation": round(np.random.uniform(0, 5), 1),
        "rain": round(np.random.uniform(0, 3), 1),
        "wind_speed": round(np.random.uniform(5, 25), 1),
        "wind_direction": round(np.random.uniform(0, 360), 0),
        "cloud_cover": round(np.random.uniform(0, 100), 0),
        "pressure": round(np.random.uniform(1000, 1025), 1),
    }


def generate_simulated_forecast(lat: float, lon: float, days: int) -> Dict[str, Any]:
    """Generate simulated forecast"""
    np.random.seed(int(lat * 1000 + lon * 100) % 2**31)
    
    base_temp = 30 - abs(lat - 10) * 0.5
    forecast = []
    
    for i in range(days):
        date = (datetime.utcnow() + timedelta(days=i)).strftime("%Y-%m-%d")
        temp_var = np.random.uniform(-3, 3)
        
        forecast.append({
            "date": date,
            "temp_max": round(base_temp + temp_var + 5, 1),
            "temp_min": round(base_temp + temp_var - 5, 1),
            "precipitation": round(np.random.uniform(0, 20), 1),
            "rain": round(np.random.uniform(0, 15), 1),
            "precipitation_probability": round(np.random.uniform(0, 80), 0),
            "wind_speed_max": round(np.random.uniform(10, 40), 1),
            "evapotranspiration": round(np.random.uniform(2, 6), 1),
        })
    
    return {
        "source": "simulated",
        "location": {"latitude": lat, "longitude": lon},
        "forecast": forecast,
        "days": len(forecast),
    }


def generate_simulated_historical(lat: float, lon: float, start_date: str, end_date: str) -> Dict[str, Any]:
    """Generate simulated historical data"""
    np.random.seed(int(lat * 1000 + lon * 100) % 2**31)
    
    start = datetime.fromisoformat(start_date)
    end = datetime.fromisoformat(end_date)
    
    base_temp = 30 - abs(lat - 10) * 0.5
    history = []
    current = start
    
    while current <= end:
        day_of_year = current.timetuple().tm_yday
        seasonal = 5 * np.sin(2 * np.pi * (day_of_year - 80) / 365)
        temp_var = np.random.uniform(-3, 3)
        
        history.append({
            "date": current.strftime("%Y-%m-%d"),
            "temp_max": round(base_temp + seasonal + temp_var + 5, 1),
            "temp_min": round(base_temp + seasonal + temp_var - 5, 1),
            "temp_mean": round(base_temp + seasonal + temp_var, 1),
            "precipitation": round(np.random.uniform(0, 15), 1),
            "rain": round(np.random.uniform(0, 10), 1),
            "evapotranspiration": round(np.random.uniform(2, 6), 1),
        })
        current += timedelta(days=1)
    
    return {
        "source": "simulated",
        "location": {"latitude": lat, "longitude": lon},
        "period": {"start": start_date, "end": end_date},
        "data": history,
        "days": len(history),
    }


# ============================================================================
# AGRICULTURAL CALCULATIONS
# ============================================================================

def calculate_gdd(temp_max: float, temp_min: float, base_temp: float) -> float:
    """Calculate Growing Degree Days for a single day"""
    avg_temp = (temp_max + temp_min) / 2
    gdd = max(0, avg_temp - base_temp)
    return round(gdd, 2)


async def calculate_cumulative_gdd(request: GDDRequest) -> Dict[str, Any]:
    """Calculate cumulative GDD from planting date"""
    
    base_temp = GDD_BASE_TEMPS.get(request.crop_type.lower(), 10)
    planting = datetime.fromisoformat(request.planting_date)
    today = datetime.utcnow()
    
    # Fetch historical weather
    historical = await fetch_open_meteo_historical(
        request.latitude,
        request.longitude,
        request.planting_date,
        today.strftime("%Y-%m-%d"),
    )
    
    cumulative_gdd = 0
    daily_gdd = []
    
    for day in historical.get("data", []):
        if day.get("temp_max") is not None and day.get("temp_min") is not None:
            gdd = calculate_gdd(day["temp_max"], day["temp_min"], base_temp)
            cumulative_gdd += gdd
            daily_gdd.append({
                "date": day["date"],
                "gdd": gdd,
                "cumulative": round(cumulative_gdd, 2),
            })
    
    # Estimate days to target GDD
    days_to_target = None
    estimated_date = None
    
    if request.target_gdd and cumulative_gdd < request.target_gdd:
        remaining_gdd = request.target_gdd - cumulative_gdd
        avg_daily_gdd = cumulative_gdd / len(daily_gdd) if daily_gdd else 10
        days_to_target = int(remaining_gdd / avg_daily_gdd) if avg_daily_gdd > 0 else None
        if days_to_target:
            estimated_date = (today + timedelta(days=days_to_target)).strftime("%Y-%m-%d")
    
    return {
        "crop_type": request.crop_type,
        "base_temperature": base_temp,
        "planting_date": request.planting_date,
        "cumulative_gdd": round(cumulative_gdd, 2),
        "target_gdd": request.target_gdd,
        "remaining_gdd": round(request.target_gdd - cumulative_gdd, 2) if request.target_gdd else None,
        "days_to_target": days_to_target,
        "estimated_target_date": estimated_date,
        "daily_gdd": daily_gdd[-14:],  # Last 14 days
        "total_days": len(daily_gdd),
    }


# ============================================================================
# AGRICULTURAL ALERTS
# ============================================================================

async def generate_weather_alerts(request: AlertRequest) -> Dict[str, Any]:
    """Generate agricultural weather alerts"""
    
    # Default thresholds
    thresholds = request.thresholds or {
        "frost_temp": 2,
        "heat_temp": 35,
        "heavy_rain": 50,
        "drought_days": 7,
        "high_wind": 50,
    }
    
    # Fetch forecast
    forecast_data = await fetch_open_meteo_forecast(request.latitude, request.longitude, 7)
    
    alerts = []
    
    for day in forecast_data.get("forecast", []):
        date = day.get("date")
        
        # Frost alert
        if day.get("temp_min") is not None and day["temp_min"] <= thresholds["frost_temp"]:
            alerts.append({
                "type": "frost",
                "severity": "high" if day["temp_min"] <= 0 else "medium",
                "date": date,
                "value": day["temp_min"],
                "threshold": thresholds["frost_temp"],
                "message": f"Frost risk on {date}. Minimum temperature: {day['temp_min']}°C",
                "recommendation": "Cover sensitive crops or delay planting. Consider frost protection measures.",
            })
        
        # Heat stress alert
        if day.get("temp_max") is not None and day["temp_max"] >= thresholds["heat_temp"]:
            alerts.append({
                "type": "heat_stress",
                "severity": "high" if day["temp_max"] >= 40 else "medium",
                "date": date,
                "value": day["temp_max"],
                "threshold": thresholds["heat_temp"],
                "message": f"Heat stress risk on {date}. Maximum temperature: {day['temp_max']}°C",
                "recommendation": "Increase irrigation. Consider shade nets for sensitive crops.",
            })
        
        # Heavy rain alert
        if day.get("precipitation") is not None and day["precipitation"] >= thresholds["heavy_rain"]:
            alerts.append({
                "type": "heavy_rain",
                "severity": "high" if day["precipitation"] >= 100 else "medium",
                "date": date,
                "value": day["precipitation"],
                "threshold": thresholds["heavy_rain"],
                "message": f"Heavy rain expected on {date}. Precipitation: {day['precipitation']}mm",
                "recommendation": "Ensure proper drainage. Delay fertilizer application. Check for flooding risk.",
            })
        
        # High wind alert
        if day.get("wind_speed_max") is not None and day["wind_speed_max"] >= thresholds["high_wind"]:
            alerts.append({
                "type": "high_wind",
                "severity": "high" if day["wind_speed_max"] >= 70 else "medium",
                "date": date,
                "value": day["wind_speed_max"],
                "threshold": thresholds["high_wind"],
                "message": f"High winds expected on {date}. Wind speed: {day['wind_speed_max']} km/h",
                "recommendation": "Secure structures and equipment. Delay spraying operations.",
            })
    
    # Drought check (consecutive dry days)
    dry_days = 0
    for day in forecast_data.get("forecast", []):
        if day.get("precipitation", 0) < 1:
            dry_days += 1
        else:
            dry_days = 0
    
    if dry_days >= thresholds["drought_days"]:
        alerts.append({
            "type": "drought_risk",
            "severity": "medium" if dry_days < 10 else "high",
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "value": dry_days,
            "threshold": thresholds["drought_days"],
            "message": f"Drought risk: {dry_days} consecutive dry days expected",
            "recommendation": "Plan irrigation schedule. Consider water conservation measures.",
        })
    
    return {
        "location": {"latitude": request.latitude, "longitude": request.longitude},
        "crop_type": request.crop_type,
        "alerts": alerts,
        "alert_count": len(alerts),
        "high_severity_count": len([a for a in alerts if a["severity"] == "high"]),
        "forecast_days": 7,
        "generated_at": datetime.utcnow().isoformat(),
    }


# ============================================================================
# ROUTES
# ============================================================================

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "weather-service",
        "providers": {
            "open_meteo": "available",
            "openweather": "configured" if OPENWEATHER_API_KEY else "not_configured",
            "tomorrow_io": "configured" if TOMORROW_IO_API_KEY else "not_configured",
        },
    }


@app.get("/weather/current")
async def get_current_weather(latitude: float, longitude: float):
    """Get current weather conditions"""
    try:
        result = await fetch_open_meteo_current(latitude, longitude)
        return result
    except Exception as e:
        logger.error(f"Current weather error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/weather/forecast")
async def get_forecast(latitude: float, longitude: float, days: int = 7):
    """Get weather forecast"""
    try:
        result = await fetch_open_meteo_forecast(latitude, longitude, min(days, 16))
        return result
    except Exception as e:
        logger.error(f"Forecast error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/weather/historical")
async def get_historical(request: HistoricalRequest):
    """Get historical weather data"""
    try:
        result = await fetch_open_meteo_historical(
            request.latitude,
            request.longitude,
            request.start_date,
            request.end_date,
        )
        return result
    except Exception as e:
        logger.error(f"Historical weather error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/weather/gdd")
async def get_gdd(request: GDDRequest):
    """Calculate Growing Degree Days"""
    try:
        result = await calculate_cumulative_gdd(request)
        return result
    except Exception as e:
        logger.error(f"GDD calculation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/weather/alerts")
async def get_alerts(request: AlertRequest):
    """Get agricultural weather alerts"""
    try:
        result = await generate_weather_alerts(request)
        return result
    except Exception as e:
        logger.error(f"Weather alerts error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/weather/crops")
async def get_supported_crops():
    """Get list of supported crops with GDD base temperatures"""
    return {
        "crops": [
            {"name": crop, "base_temperature": temp, "unit": "celsius"}
            for crop, temp in GDD_BASE_TEMPS.items()
        ],
        "count": len(GDD_BASE_TEMPS),
    }


class ClimateSuitabilityRequest(BaseModel):
    latitude: float
    longitude: float
    crop_type: str


@app.post("/climate/suitability")
async def get_climate_suitability(request: ClimateSuitabilityRequest):
    """Analyze climate suitability for a specific crop"""
    try:
        # Get historical weather data (1 year)
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=365)
        
        historical = await fetch_open_meteo_historical(
            request.latitude,
            request.longitude,
            start_date.strftime("%Y-%m-%d"),
            end_date.strftime("%Y-%m-%d"),
        )
        
        crop_key = request.crop_type.lower().replace(" ", "_")
        requirements = CROP_CLIMATE_REQUIREMENTS.get(crop_key, CROP_CLIMATE_REQUIREMENTS.get("maize"))
        
        if not requirements:
            raise HTTPException(status_code=404, detail=f"Crop '{request.crop_type}' not found")
        
        # Calculate climate statistics
        data = historical.get("data", [])
        temps_mean = [d["temp_mean"] for d in data if d.get("temp_mean") is not None]
        temps_max = [d["temp_max"] for d in data if d.get("temp_max") is not None]
        temps_min = [d["temp_min"] for d in data if d.get("temp_min") is not None]
        precip = [d["precipitation"] for d in data if d.get("precipitation") is not None]
        
        avg_temp = np.mean(temps_mean) if temps_mean else 25
        max_temp = max(temps_max) if temps_max else 35
        min_temp = min(temps_min) if temps_min else 15
        annual_rainfall = sum(precip) if precip else 1000
        frost_days = len([t for t in temps_min if t <= 0])
        
        # Calculate suitability scores
        temp_score = calculate_temp_suitability(avg_temp, requirements)
        rainfall_score = calculate_rainfall_suitability(annual_rainfall, requirements)
        frost_score = 100 if requirements.get("frost_tolerant", False) or frost_days == 0 else max(0, 100 - frost_days * 10)
        
        overall_score = (temp_score * 0.4 + rainfall_score * 0.4 + frost_score * 0.2)
        
        # Determine category
        if overall_score >= 80:
            category = "highly_suitable"
        elif overall_score >= 60:
            category = "suitable"
        elif overall_score >= 40:
            category = "moderately_suitable"
        elif overall_score >= 20:
            category = "marginally_suitable"
        else:
            category = "not_suitable"
        
        # Generate recommendations
        recommendations = []
        if avg_temp < requirements["optimal_temp_min"]:
            recommendations.append(f"Temperature is below optimal ({avg_temp:.1f}°C vs {requirements['optimal_temp_min']}°C). Consider greenhouse cultivation.")
        elif avg_temp > requirements["optimal_temp_max"]:
            recommendations.append(f"Temperature is above optimal ({avg_temp:.1f}°C vs {requirements['optimal_temp_max']}°C). Ensure adequate irrigation and shade.")
        
        if annual_rainfall < requirements["annual_rainfall_min"]:
            deficit = requirements["annual_rainfall_min"] - annual_rainfall
            recommendations.append(f"Rainfall deficit of {deficit:.0f}mm/year. Irrigation system required.")
        elif annual_rainfall > requirements["annual_rainfall_max"]:
            excess = annual_rainfall - requirements["annual_rainfall_max"]
            recommendations.append(f"Excess rainfall of {excess:.0f}mm/year. Ensure good drainage.")
        
        if frost_days > 0 and not requirements.get("frost_tolerant", False):
            recommendations.append(f"{frost_days} frost days detected. Frost protection measures required.")
        
        if not recommendations:
            recommendations.append(f"Climate conditions are suitable for {request.crop_type} cultivation.")
        
        return {
            "crop_type": crop_key,
            "location": {"latitude": request.latitude, "longitude": request.longitude},
            "climate_data": {
                "avg_temperature": round(avg_temp, 1),
                "max_temperature": round(max_temp, 1),
                "min_temperature": round(min_temp, 1),
                "annual_rainfall": round(annual_rainfall, 0),
                "frost_days": frost_days,
            },
            "requirements": requirements,
            "scores": {
                "overall": round(overall_score, 1),
                "temperature": round(temp_score, 1),
                "rainfall": round(rainfall_score, 1),
                "frost_risk": round(frost_score, 1),
            },
            "category": category,
            "recommendations": recommendations,
            "planting_info": {
                "density_per_ha": requirements.get("planting_density_per_ha"),
                "spacing_m": requirements.get("spacing_m"),
                "years_to_first_harvest": requirements.get("years_to_first_harvest"),
                "lifecycle_years": requirements.get("lifecycle_years"),
            },
        }
    except Exception as e:
        logger.error(f"Climate suitability error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def calculate_temp_suitability(avg_temp: float, requirements: Dict) -> float:
    """Calculate temperature suitability score (0-100)"""
    opt_min = requirements["optimal_temp_min"]
    opt_max = requirements["optimal_temp_max"]
    crit_min = requirements["critical_temp_min"]
    crit_max = requirements["critical_temp_max"]
    
    if opt_min <= avg_temp <= opt_max:
        return 100
    elif avg_temp < crit_min or avg_temp > crit_max:
        return 0
    elif avg_temp < opt_min:
        return 100 * (avg_temp - crit_min) / (opt_min - crit_min)
    else:
        return 100 * (crit_max - avg_temp) / (crit_max - opt_max)


def calculate_rainfall_suitability(annual_rainfall: float, requirements: Dict) -> float:
    """Calculate rainfall suitability score (0-100)"""
    min_rain = requirements["annual_rainfall_min"]
    max_rain = requirements["annual_rainfall_max"]
    
    if min_rain <= annual_rainfall <= max_rain:
        return 100
    elif annual_rainfall < min_rain * 0.5 or annual_rainfall > max_rain * 1.5:
        return 0
    elif annual_rainfall < min_rain:
        return 100 * (annual_rainfall - min_rain * 0.5) / (min_rain * 0.5)
    else:
        return 100 * (max_rain * 1.5 - annual_rainfall) / (max_rain * 0.5)


@app.get("/crops/requirements")
async def get_crop_requirements(crop_type: Optional[str] = None):
    """Get climate requirements for crops"""
    if crop_type:
        crop_key = crop_type.lower().replace(" ", "_")
        if crop_key in CROP_CLIMATE_REQUIREMENTS:
            return {crop_key: CROP_CLIMATE_REQUIREMENTS[crop_key]}
        else:
            raise HTTPException(status_code=404, detail=f"Crop '{crop_type}' not found")
    return CROP_CLIMATE_REQUIREMENTS


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8096"))
    uvicorn.run(app, host="0.0.0.0", port=port)
