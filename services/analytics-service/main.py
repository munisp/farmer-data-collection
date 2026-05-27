#!/usr/bin/env python3
"""
Analytics Service - Geospatial analytics and data processing
"""

import os
import json
import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager

import pandas as pd
import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings
import psycopg2
from psycopg2.extras import RealDictCursor
import redis
from kafka import KafkaProducer
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from fastapi.responses import Response
import geopandas as gpd
from shapely.geometry import Point, Polygon
from shapely import wkt

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Prometheus metrics
REQUEST_COUNT = Counter('analytics_requests_total', 'Total analytics requests', ['endpoint'])
REQUEST_DURATION = Histogram('analytics_request_duration_seconds', 'Request duration')

# Configuration
class Settings(BaseSettings):
    port: int = 8082
    database_url: str = "postgresql://postgres:postgres@localhost:5432/farmer_db"
    redis_url: str = "redis://localhost:6379"
    kafka_brokers: str = "localhost:9092"
    
    class Config:
        env_file = ".env"

settings = Settings()

# Models
class GeoPoint(BaseModel):
    latitude: float
    longitude: float

class Farm(BaseModel):
    id: str
    farmer_id: str
    name: str
    size: float
    location: str
    coordinates: Optional[GeoPoint] = None
    soil_type: Optional[str] = None

class YieldAnalysis(BaseModel):
    farm_id: str
    crop_name: str
    total_area: float
    total_yield: float
    average_yield_per_hectare: float
    season: str

class SpatialCluster(BaseModel):
    cluster_id: int
    farm_count: int
    total_area: float
    center_latitude: float
    center_longitude: float
    farms: List[str]

class ProximityResult(BaseModel):
    farm_id: str
    distance_km: float
    farm_name: str

# Database connection
class Database:
    def __init__(self):
        self.conn = None
        self.connect()
    
    def connect(self):
        try:
            self.conn = psycopg2.connect(settings.database_url)
            logger.info("Connected to PostgreSQL")
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            raise
    
    def get_cursor(self):
        if not self.conn or self.conn.closed:
            self.connect()
        return self.conn.cursor(cursor_factory=RealDictCursor)
    
    def close(self):
        if self.conn:
            self.conn.close()

# Redis connection
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
    
    def set(self, key: str, value: str, ttl: int = 300):
        if self.client:
            try:
                self.client.setex(key, ttl, value)
            except Exception as e:
                logger.error(f"Redis SET error: {e}")

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
    
    def publish(self, topic: str, event: Dict[str, Any]):
        if self.producer:
            try:
                self.producer.send(topic, event)
                self.producer.flush()
            except Exception as e:
                logger.error(f"Failed to publish event: {e}")

# Global instances
db = Database()
cache = RedisCache()
events = EventPublisher()

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting analytics service")
    yield
    # Shutdown
    logger.info("Shutting down analytics service")
    db.close()

# FastAPI app
app = FastAPI(
    title="Analytics Service",
    description="Geospatial analytics and data processing for farmer platform",
    version="1.0.0",
    lifespan=lifespan
)

# Health check
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "analytics"}

# Metrics endpoint
@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

# Analytics endpoints

@app.get("/api/v1/analytics/yield", response_model=List[YieldAnalysis])
async def analyze_yield(
    farmer_id: Optional[str] = Query(None),
    season: Optional[str] = Query(None)
):
    """Analyze crop yields by farm and season"""
    REQUEST_COUNT.labels(endpoint='yield').inc()
    
    try:
        cursor = db.get_cursor()
        
        query = """
        SELECT 
            c.farm_id,
            c.name as crop_name,
            SUM(c.area) as total_area,
            COUNT(*) as crop_count,
            EXTRACT(YEAR FROM c.planting_date) as year,
            CASE 
                WHEN EXTRACT(MONTH FROM c.planting_date) BETWEEN 3 AND 5 THEN 'Spring'
                WHEN EXTRACT(MONTH FROM c.planting_date) BETWEEN 6 AND 8 THEN 'Summer'
                WHEN EXTRACT(MONTH FROM c.planting_date) BETWEEN 9 AND 11 THEN 'Fall'
                ELSE 'Winter'
            END as season
        FROM crops c
        JOIN farms f ON c.farm_id = f.id
        WHERE c.status = 'harvested'
        """
        
        params = []
        if farmer_id:
            query += " AND f.farmer_id = %s"
            params.append(farmer_id)
        
        query += " GROUP BY c.farm_id, c.name, year, season ORDER BY year DESC, season"
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        analyses = []
        for row in results:
            # Simulate yield calculation (in production, this would come from harvest records)
            avg_yield = row['total_area'] * np.random.uniform(2.5, 4.5)  # tons per hectare
            
            analyses.append(YieldAnalysis(
                farm_id=row['farm_id'],
                crop_name=row['crop_name'],
                total_area=float(row['total_area']),
                total_yield=avg_yield,
                average_yield_per_hectare=avg_yield / float(row['total_area']),
                season=f"{row['season']} {int(row['year'])}"
            ))
        
        cursor.close()
        
        # Publish analytics event
        events.publish('analytics.events', {
            'type': 'yield.analyzed',
            'timestamp': datetime.utcnow().isoformat(),
            'farmer_id': farmer_id,
            'result_count': len(analyses)
        })
        
        return analyses
        
    except Exception as e:
        logger.error(f"Yield analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/analytics/spatial/clusters", response_model=List[SpatialCluster])
async def spatial_clustering(
    max_distance_km: float = Query(10.0, description="Maximum distance for clustering in kilometers")
):
    """Cluster farms by geographic proximity"""
    REQUEST_COUNT.labels(endpoint='spatial_clusters').inc()
    
    try:
        cursor = db.get_cursor()
        
        # Get all farms with coordinates
        cursor.execute("""
            SELECT id, name, size, latitude, longitude
            FROM farms
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        """)
        
        farms = cursor.fetchall()
        cursor.close()
        
        if not farms:
            return []
        
        # Convert to GeoDataFrame
        df = pd.DataFrame(farms)
        geometry = [Point(xy) for xy in zip(df['longitude'], df['latitude'])]
        gdf = gpd.GeoDataFrame(df, geometry=geometry, crs='EPSG:4326')
        
        # Simple clustering based on distance
        # In production, use DBSCAN or similar algorithm
        clusters = []
        processed = set()
        cluster_id = 0
        
        for idx, farm in gdf.iterrows():
            if idx in processed:
                continue
            
            # Find nearby farms
            nearby = []
            for idx2, other_farm in gdf.iterrows():
                if idx2 not in processed:
                    distance = farm.geometry.distance(other_farm.geometry) * 111  # rough km conversion
                    if distance <= max_distance_km:
                        nearby.append(idx2)
                        processed.add(idx2)
            
            if nearby:
                cluster_farms = gdf.iloc[nearby]
                clusters.append(SpatialCluster(
                    cluster_id=cluster_id,
                    farm_count=len(nearby),
                    total_area=float(cluster_farms['size'].sum()),
                    center_latitude=float(cluster_farms['latitude'].mean()),
                    center_longitude=float(cluster_farms['longitude'].mean()),
                    farms=[str(fid) for fid in cluster_farms['id'].tolist()]
                ))
                cluster_id += 1
        
        # Publish event
        events.publish('analytics.events', {
            'type': 'spatial.clustered',
            'timestamp': datetime.utcnow().isoformat(),
            'cluster_count': len(clusters),
            'max_distance_km': max_distance_km
        })
        
        return clusters
        
    except Exception as e:
        logger.error(f"Spatial clustering error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/analytics/spatial/proximity", response_model=List[ProximityResult])
async def find_nearby_farms(
    latitude: float = Query(..., description="Reference latitude"),
    longitude: float = Query(..., description="Reference longitude"),
    radius_km: float = Query(50.0, description="Search radius in kilometers")
):
    """Find farms within a specified radius of a location"""
    REQUEST_COUNT.labels(endpoint='proximity').inc()
    
    try:
        cursor = db.get_cursor()
        
        # Use PostGIS if available, otherwise calculate in Python
        cursor.execute("""
            SELECT id, name, latitude, longitude,
                   (6371 * acos(
                       cos(radians(%s)) * cos(radians(latitude)) *
                       cos(radians(longitude) - radians(%s)) +
                       sin(radians(%s)) * sin(radians(latitude))
                   )) AS distance_km
            FROM farms
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
            HAVING distance_km <= %s
            ORDER BY distance_km
        """, (latitude, longitude, latitude, radius_km))
        
        results = cursor.fetchall()
        cursor.close()
        
        proximity_results = [
            ProximityResult(
                farm_id=row['id'],
                distance_km=float(row['distance_km']),
                farm_name=row['name']
            )
            for row in results
        ]
        
        # Cache results
        cache_key = f"proximity:{latitude}:{longitude}:{radius_km}"
        cache.set(cache_key, json.dumps([r.dict() for r in proximity_results]), ttl=600)
        
        return proximity_results
        
    except Exception as e:
        logger.error(f"Proximity search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/analytics/statistics/summary")
async def get_statistics_summary(farmer_id: Optional[str] = Query(None)):
    """Get comprehensive statistics summary"""
    REQUEST_COUNT.labels(endpoint='statistics').inc()
    
    try:
        cursor = db.get_cursor()
        
        # Farm statistics
        farm_query = """
            SELECT 
                COUNT(*) as total_farms,
                COALESCE(SUM(size), 0) as total_area,
                COALESCE(AVG(size), 0) as avg_farm_size
            FROM farms f
        """
        params = []
        if farmer_id:
            farm_query += " WHERE f.farmer_id = %s"
            params.append(farmer_id)
        
        cursor.execute(farm_query, params)
        farm_stats = cursor.fetchone()
        
        # Crop statistics
        crop_query = """
            SELECT 
                COUNT(*) as total_crops,
                COUNT(DISTINCT name) as unique_crop_types,
                COALESCE(SUM(area), 0) as total_crop_area
            FROM crops c
            JOIN farms f ON c.farm_id = f.id
        """
        if farmer_id:
            crop_query += " WHERE f.farmer_id = %s"
        
        cursor.execute(crop_query, params)
        crop_stats = cursor.fetchone()
        
        # Livestock statistics
        livestock_query = """
            SELECT 
                COUNT(*) as total_livestock_records,
                COALESCE(SUM(count), 0) as total_animals,
                COUNT(DISTINCT type) as livestock_types
            FROM livestock l
            JOIN farms f ON l.farm_id = f.id
        """
        if farmer_id:
            livestock_query += " WHERE f.farmer_id = %s"
        
        cursor.execute(livestock_query, params)
        livestock_stats = cursor.fetchone()
        
        cursor.close()
        
        summary = {
            "farms": {
                "total": int(farm_stats['total_farms']),
                "total_area_hectares": float(farm_stats['total_area']),
                "average_size_hectares": float(farm_stats['avg_farm_size'])
            },
            "crops": {
                "total_plantings": int(crop_stats['total_crops']),
                "unique_types": int(crop_stats['unique_crop_types']),
                "total_area_hectares": float(crop_stats['total_crop_area'])
            },
            "livestock": {
                "total_records": int(livestock_stats['total_livestock_records']),
                "total_animals": int(livestock_stats['total_animals']),
                "types": int(livestock_stats['livestock_types'])
            },
            "generated_at": datetime.utcnow().isoformat()
        }
        
        # Publish event
        events.publish('analytics.events', {
            'type': 'statistics.generated',
            'timestamp': datetime.utcnow().isoformat(),
            'farmer_id': farmer_id,
            'summary': summary
        })
        
        return summary
        
    except Exception as e:
        logger.error(f"Statistics summary error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/analytics/trends/crop-adoption")
async def crop_adoption_trends(
    months: int = Query(12, description="Number of months to analyze")
):
    """Analyze crop adoption trends over time"""
    REQUEST_COUNT.labels(endpoint='crop_trends').inc()
    
    try:
        cursor = db.get_cursor()
        
        start_date = datetime.utcnow() - timedelta(days=months * 30)
        
        cursor.execute("""
            SELECT 
                name as crop_name,
                DATE_TRUNC('month', planting_date) as month,
                COUNT(*) as planting_count,
                SUM(area) as total_area
            FROM crops
            WHERE planting_date >= %s
            GROUP BY name, month
            ORDER BY month DESC, planting_count DESC
        """, (start_date,))
        
        results = cursor.fetchall()
        cursor.close()
        
        # Group by crop
        trends = {}
        for row in results:
            crop = row['crop_name']
            if crop not in trends:
                trends[crop] = []
            
            trends[crop].append({
                'month': row['month'].isoformat(),
                'planting_count': int(row['planting_count']),
                'total_area': float(row['total_area'])
            })
        
        return {
            'period_months': months,
            'trends': trends,
            'generated_at': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Crop trends error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.port)
