#!/usr/bin/env python3
"""
Weather Service - Weather data, forecasts, and agricultural indices
"""

import os
import json
import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings
import psycopg2
from psycopg2.extras import RealDictCursor
import redis
from kafka import KafkaProducer
from prometheus_client import Counter, generate_latest, CONTENT_TYPE_LATEST
from fastapi.responses import Response
import httpx

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Prometheus metrics
WEATHER_REQUESTS = Counter('weather_requests_total', 'Total weather requests', ['type'])

# Configuration
class Settings(BaseSettings):
    port: int = 8084
    database_url: str = "postgresql://postgres:postgres@localhost:5432/farmer_db"
    redis_url: str = "redis://localhost:6379"
    kafka_brokers: str = "localhost:9092"
    openweather_api_key: str = ""
    
    class Config:
        env_file = ".env"

settings = Settings()

# Models
class WeatherCurrent(BaseModel):
    temperature: float
    feels_like: float
    humidity: int
    pressure: int
    wind_speed: float
    wind_direction: int
    clouds: int
    description: str
    icon: str
    timestamp: datetime

class WeatherForecast(BaseModel):
    date: datetime
    temperature_min: float
    temperature_max: float
    temperature_avg: float
    humidity: int
    precipitation_probability: float
    precipitation_mm: float
    wind_speed: float
    description: str
    icon: str

class AgriculturalIndices(BaseModel):
    gdd: float  # Growing Degree Days
    eto: float  # Evapotranspiration
    water_requirement: float  # mm
    frost_risk: bool
    heat_stress_risk: bool

class WeatherAlert(BaseModel):
    id: str
    type: str  # rain, frost, heat, wind, etc.
    severity: str  # low, medium, high, extreme
    title: str
    description: str
    start_time: datetime
    end_time: datetime
    affected_area: Optional[str] = None

# Database
class Database:
    def __init__(self):
        self.conn = None
        self.connect()
    
    def connect(self):
        try:
            self.conn = psycopg2.connect(settings.database_url)
            logger.info("Connected to PostgreSQL")
            self._init_schema()
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            raise
    
    def _init_schema(self):
        cursor = self.conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS weather_data (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                latitude DOUBLE PRECISION NOT NULL,
                longitude DOUBLE PRECISION NOT NULL,
                temperature DOUBLE PRECISION,
                humidity INTEGER,
                pressure INTEGER,
                wind_speed DOUBLE PRECISION,
                precipitation DOUBLE PRECISION,
                description VARCHAR(255),
                data JSONB,
                timestamp TIMESTAMP NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            
            CREATE TABLE IF NOT EXISTS weather_alerts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                type VARCHAR(50) NOT NULL,
                severity VARCHAR(50) NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                start_time TIMESTAMP NOT NULL,
                end_time TIMESTAMP NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            
            CREATE INDEX IF NOT EXISTS idx_weather_data_timestamp ON weather_data(timestamp);
            CREATE INDEX IF NOT EXISTS idx_weather_data_location ON weather_data(latitude, longitude);
            CREATE INDEX IF NOT EXISTS idx_weather_alerts_time ON weather_alerts(start_time, end_time);
        """)
        self.conn.commit()
        cursor.close()
    
    def get_cursor(self):
        if not self.conn or self.conn.closed:
            self.connect()
        return self.conn.cursor(cursor_factory=RealDictCursor)
    
    def close(self):
        if self.conn:
            self.conn.close()

# Redis cache
class RedisCache:
    def __init__(self):
        try:
            self.client = redis.from_url(settings.redis_url, decode_responses=True)
            self.client.ping()
            logger.info("Connected to Redis")
        except Exception as e:
            logger.warning(f"Failed to connect to Redis: {e}")
            self.client = None
    
    def get(self, key: str) -> Optional[str]:
        if self.client:
            try:
                return self.client.get(key)
            except Exception as e:
                logger.error(f"Redis GET error: {e}")
        return None
    
    def set(self, key: str, value: str, ttl: int = 1800):  # 30 min default
        if self.client:
            try:
                self.client.setex(key, ttl, value)
            except Exception as e:
                logger.error(f"Redis SET error: {e}")

# OpenWeatherMap client
class WeatherAPIClient:
    def __init__(self):
        self.api_key = settings.openweather_api_key
        self.base_url = "https://api.openweathermap.org/data/2.5"
        self.enabled = bool(self.api_key)
        
        if not self.enabled:
            logger.warning("OpenWeatherMap API key not configured")
    
    async def get_current_weather(self, lat: float, lon: float) -> Optional[Dict]:
        if not self.enabled:
            return self._mock_current_weather(lat, lon)
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/weather",
                    params={
                        "lat": lat,
                        "lon": lon,
                        "appid": self.api_key,
                        "units": "metric"
                    }
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Weather API error: {e}")
            return self._mock_current_weather(lat, lon)
    
    async def get_forecast(self, lat: float, lon: float, days: int = 7) -> Optional[Dict]:
        if not self.enabled:
            return self._mock_forecast(lat, lon, days)
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/forecast",
                    params={
                        "lat": lat,
                        "lon": lon,
                        "appid": self.api_key,
                        "units": "metric",
                        "cnt": days * 8  # 3-hour intervals
                    }
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Forecast API error: {e}")
            return self._mock_forecast(lat, lon, days)
    
    def _mock_current_weather(self, lat: float, lon: float) -> Dict:
        """Mock weather data for testing"""
        return {
            "main": {
                "temp": 25.0,
                "feels_like": 26.0,
                "humidity": 65,
                "pressure": 1013
            },
            "wind": {
                "speed": 3.5,
                "deg": 180
            },
            "clouds": {
                "all": 40
            },
            "weather": [{
                "description": "partly cloudy",
                "icon": "02d"
            }],
            "dt": int(datetime.utcnow().timestamp())
        }
    
    def _mock_forecast(self, lat: float, lon: float, days: int) -> Dict:
        """Mock forecast data for testing"""
        forecasts = []
        for i in range(days):
            date = datetime.utcnow() + timedelta(days=i)
            forecasts.append({
                "dt": int(date.timestamp()),
                "main": {
                    "temp_min": 18.0 + i,
                    "temp_max": 28.0 + i,
                    "temp": 23.0 + i,
                    "humidity": 60 + i * 2
                },
                "pop": 0.2,  # probability of precipitation
                "rain": {"3h": 0.5} if i % 3 == 0 else {},
                "wind": {"speed": 3.0 + i * 0.5},
                "weather": [{
                    "description": "clear sky" if i % 2 == 0 else "light rain",
                    "icon": "01d" if i % 2 == 0 else "10d"
                }]
            })
        return {"list": forecasts}

# Kafka producer
class EventPublisher:
    def __init__(self):
        try:
            self.producer = KafkaProducer(
                bootstrap_servers=settings.kafka_brokers.split(','),
                value_serializer=lambda v: json.dumps(v).encode('utf-8')
            )
            logger.info("Connected to Kafka")
        except Exception as e:
            logger.warning(f"Failed to connect to Kafka: {e}")
            self.producer = None
    
    def publish(self, topic: str, event: Dict):
        if self.producer:
            try:
                self.producer.send(topic, event)
                self.producer.flush()
            except Exception as e:
                logger.error(f"Failed to publish event: {e}")

# Global instances
db = Database()
cache = RedisCache()
weather_api = WeatherAPIClient()
events = EventPublisher()

# Lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting weather service")
    yield
    logger.info("Shutting down weather service")
    db.close()

# FastAPI app
app = FastAPI(
    title="Weather Service",
    description="Weather data, forecasts, and agricultural indices",
    version="1.0.0",
    lifespan=lifespan
)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "weather"}

@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.get("/api/v1/weather/current", response_model=WeatherCurrent)
async def get_current_weather(
    latitude: float = Query(..., description="Latitude"),
    longitude: float = Query(..., description="Longitude")
):
    """Get current weather for a location"""
    WEATHER_REQUESTS.labels(type='current').inc()
    
    # Check cache
    cache_key = f"weather:current:{latitude}:{longitude}"
    cached = cache.get(cache_key)
    if cached:
        return WeatherCurrent(**json.loads(cached))
    
    try:
        data = await weather_api.get_current_weather(latitude, longitude)
        if not data:
            raise HTTPException(status_code=503, detail="Weather service unavailable")
        
        weather = WeatherCurrent(
            temperature=data['main']['temp'],
            feels_like=data['main']['feels_like'],
            humidity=data['main']['humidity'],
            pressure=data['main']['pressure'],
            wind_speed=data['wind']['speed'],
            wind_direction=data['wind']['deg'],
            clouds=data['clouds']['all'],
            description=data['weather'][0]['description'],
            icon=data['weather'][0]['icon'],
            timestamp=datetime.fromtimestamp(data['dt'])
        )
        
        # Cache result
        cache.set(cache_key, weather.model_dump_json(), ttl=1800)
        
        # Store in database
        cursor = db.get_cursor()
        cursor.execute("""
            INSERT INTO weather_data (latitude, longitude, temperature, humidity, pressure, wind_speed, description, data, timestamp)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (latitude, longitude, weather.temperature, weather.humidity, weather.pressure,
              weather.wind_speed, weather.description, json.dumps(data), weather.timestamp))
        db.conn.commit()
        cursor.close()
        
        # Publish event
        events.publish('weather.events', {
            'type': 'weather.updated',
            'timestamp': datetime.utcnow().isoformat(),
            'latitude': latitude,
            'longitude': longitude,
            'temperature': weather.temperature
        })
        
        return weather
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Current weather error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/weather/forecast", response_model=List[WeatherForecast])
async def get_weather_forecast(
    latitude: float = Query(..., description="Latitude"),
    longitude: float = Query(..., description="Longitude"),
    days: int = Query(7, ge=1, le=16, description="Number of days")
):
    """Get weather forecast for a location"""
    WEATHER_REQUESTS.labels(type='forecast').inc()
    
    # Check cache
    cache_key = f"weather:forecast:{latitude}:{longitude}:{days}"
    cached = cache.get(cache_key)
    if cached:
        return [WeatherForecast(**f) for f in json.loads(cached)]
    
    try:
        data = await weather_api.get_forecast(latitude, longitude, days)
        if not data:
            raise HTTPException(status_code=503, detail="Weather service unavailable")
        
        forecasts = []
        for item in data['list'][:days]:
            forecast = WeatherForecast(
                date=datetime.fromtimestamp(item['dt']),
                temperature_min=item['main'].get('temp_min', item['main']['temp']),
                temperature_max=item['main'].get('temp_max', item['main']['temp']),
                temperature_avg=item['main']['temp'],
                humidity=item['main']['humidity'],
                precipitation_probability=item.get('pop', 0.0),
                precipitation_mm=item.get('rain', {}).get('3h', 0.0),
                wind_speed=item['wind']['speed'],
                description=item['weather'][0]['description'],
                icon=item['weather'][0]['icon']
            )
            forecasts.append(forecast)
        
        # Cache result
        cache.set(cache_key, json.dumps([f.model_dump(mode='json') for f in forecasts]), ttl=3600)
        
        return forecasts
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Forecast error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/weather/agricultural-indices", response_model=AgriculturalIndices)
async def get_agricultural_indices(
    latitude: float = Query(...),
    longitude: float = Query(...),
    crop_base_temp: float = Query(10.0, description="Base temperature for GDD calculation")
):
    """Calculate agricultural indices"""
    WEATHER_REQUESTS.labels(type='indices').inc()
    
    try:
        # Get current weather
        current = await weather_api.get_current_weather(latitude, longitude)
        if not current:
            raise HTTPException(status_code=503, detail="Weather service unavailable")
        
        temp = current['main']['temp']
        humidity = current['main']['humidity']
        wind_speed = current['wind']['speed']
        
        # Calculate Growing Degree Days (GDD)
        gdd = max(0, temp - crop_base_temp)
        
        # Calculate Evapotranspiration (simplified Penman-Monteith)
        # In production, use full equation with solar radiation, etc.
        eto = 0.0023 * (temp + 17.8) * (temp - temp * 0.5) ** 0.5
        
        # Water requirement (mm/day)
        water_req = eto * 1.2  # Crop coefficient assumed 1.2
        
        # Risk assessments
        frost_risk = temp < 2.0
        heat_stress = temp > 35.0
        
        indices = AgriculturalIndices(
            gdd=gdd,
            eto=eto,
            water_requirement=water_req,
            frost_risk=frost_risk,
            heat_stress_risk=heat_stress
        )
        
        # Publish event if risks detected
        if frost_risk or heat_stress:
            events.publish('weather.events', {
                'type': 'weather.alert',
                'timestamp': datetime.utcnow().isoformat(),
                'latitude': latitude,
                'longitude': longitude,
                'frost_risk': frost_risk,
                'heat_stress_risk': heat_stress
            })
        
        return indices
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Agricultural indices error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/weather/alerts", response_model=List[WeatherAlert])
async def get_weather_alerts(
    latitude: Optional[float] = Query(None),
    longitude: Optional[float] = Query(None),
    radius_km: float = Query(50.0)
):
    """Get active weather alerts"""
    WEATHER_REQUESTS.labels(type='alerts').inc()
    
    try:
        cursor = db.get_cursor()
        
        query = """
            SELECT * FROM weather_alerts
            WHERE end_time > NOW()
        """
        params = []
        
        if latitude and longitude:
            # Find alerts within radius
            query += """
                AND (6371 * acos(
                    cos(radians(%s)) * cos(radians(latitude)) *
                    cos(radians(longitude) - radians(%s)) +
                    sin(radians(%s)) * sin(radians(latitude))
                )) <= %s
            """
            params.extend([latitude, longitude, latitude, radius_km])
        
        query += " ORDER BY severity DESC, start_time ASC"
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        cursor.close()
        
        alerts = [
            WeatherAlert(
                id=row['id'],
                type=row['type'],
                severity=row['severity'],
                title=row['title'],
                description=row['description'],
                start_time=row['start_time'],
                end_time=row['end_time']
            )
            for row in results
        ]
        
        return alerts
        
    except Exception as e:
        logger.error(f"Weather alerts error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/weather/historical")
async def get_historical_weather(
    latitude: float = Query(...),
    longitude: float = Query(...),
    start_date: datetime = Query(...),
    end_date: datetime = Query(...)
):
    """Get historical weather data"""
    WEATHER_REQUESTS.labels(type='historical').inc()
    
    try:
        cursor = db.get_cursor()
        
        cursor.execute("""
            SELECT temperature, humidity, pressure, wind_speed, precipitation, description, timestamp
            FROM weather_data
            WHERE latitude = %s AND longitude = %s
              AND timestamp BETWEEN %s AND %s
            ORDER BY timestamp ASC
        """, (latitude, longitude, start_date, end_date))
        
        results = cursor.fetchall()
        cursor.close()
        
        return [dict(row) for row in results]
        
    except Exception as e:
        logger.error(f"Historical weather error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.port)
