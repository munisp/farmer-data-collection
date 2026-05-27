"""
Lakehouse Analytics Service
Data warehouse for analytics, reporting, and ML training

Features:
- Event ingestion from Kafka
- Time-series data storage
- Aggregation queries
- Market price analytics
- User journey tracking
- ML feature extraction
- EOS Vegetation Indices (NDVI, NDMI, NDRE, RECI, MSAVI, NDWI, CHL)
- PostGIS integration for farm boundaries
- Sedona spatial analytics results
"""
import os
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Lakehouse Analytics Service")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage (replace with actual data warehouse in production)
events_store = []
market_prices_store = []
user_journey_store = []

# EOS Vegetation Indices Storage
vegetation_indices_store = []  # Time-series vegetation data per field
field_health_summary_store = []  # Aggregated health summaries
sedona_analytics_store = []  # Spatial analytics results from Sedona


# ============================================================================
# MODELS
# ============================================================================

class Event(BaseModel):
    event_type: str
    user_id: int
    data: Dict[str, Any]
    channel: Optional[str] = None
    timestamp: Optional[datetime] = None


class MarketPrice(BaseModel):
    product: str
    price: float
    unit: str
    location: str
    source: str
    timestamp: datetime


class UserJourneyEvent(BaseModel):
    journey_id: str
    user_id: int
    journey_type: str  # registration_harvest, expense_tracking, etc.
    step: str
    status: str  # started, in_progress, completed, failed
    data: Dict[str, Any]
    timestamp: datetime


class AggregationRequest(BaseModel):
    metric: str
    user_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    group_by: Optional[str] = None


# EOS Vegetation Indices Models
class VegetationIndicesRecord(BaseModel):
    """EOS-style vegetation indices for a field at a point in time"""
    field_id: int
    farm_id: int
    user_id: int
    crop_type: str
    date: datetime
    # 7 EOS vegetation indices
    ndvi: float  # Normalized Difference Vegetation Index (crop health)
    ndmi: float  # Normalized Difference Moisture Index (water stress)
    ndre: float  # Normalized Difference Red Edge (nitrogen status)
    reci: float  # Red-Edge Chlorophyll Index (chlorophyll content)
    msavi: float  # Modified Soil Adjusted Vegetation Index (sparse vegetation)
    ndwi: float  # Normalized Difference Water Index (water content)
    chl: float  # Chlorophyll Index (leaf chlorophyll)
    # Metadata
    cloud_cover: Optional[float] = None
    source: str = "sentinel-2"
    quality: str = "good"


class FieldHealthSummary(BaseModel):
    """Aggregated health summary for a field"""
    field_id: int
    farm_id: int
    user_id: int
    crop_type: str
    period_start: datetime
    period_end: datetime
    # Aggregated indices
    avg_ndvi: float
    avg_ndmi: float
    avg_ndre: float
    ndvi_trend: str  # increasing, decreasing, stable
    ndmi_trend: str
    # Health assessment
    health_status: str  # excellent, good, moderate, poor
    stress_level: str  # none, low, moderate, high
    disease_risk: float  # 0-100%
    recommendations: List[str]
    # Anomalies detected
    anomaly_count: int
    anomaly_areas: List[Dict[str, Any]]


class SedonaSpatialResult(BaseModel):
    """Spatial analytics result from Apache Sedona"""
    job_id: str
    job_type: str  # vegetation_heatmap, stress_zones, regional_comparison
    field_id: Optional[int] = None
    region: Optional[str] = None
    timestamp: datetime
    # Spatial metrics
    total_area_ha: float
    stressed_area_ha: float
    healthy_area_ha: float
    stress_percentage: float
    # GeoJSON results
    geometry: Optional[Dict[str, Any]] = None
    heatmap_data: Optional[List[Dict[str, Any]]] = None
    # Regional comparison
    regional_avg_ndvi: Optional[float] = None
    field_vs_regional: Optional[float] = None  # deviation from regional average


class FieldOverviewRequest(BaseModel):
    """Request for integrated field overview data"""
    field_id: int
    include_boundary: bool = True
    include_weather: bool = True
    include_disease_risk: bool = True
    days_history: int = 30


# ============================================================================
# ROUTES
# ============================================================================

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "lakehouse-analytics",
        "events_count": len(events_store),
        "market_prices_count": len(market_prices_store),
        "journeys_count": len(user_journey_store),
        "timestamp": datetime.now(),
    }


@app.post("/events/ingest")
async def ingest_event(event: Event):
    """Ingest event from Kafka or direct API call"""
    if event.timestamp is None:
        event.timestamp = datetime.now()
    
    events_store.append(event.dict())
    logger.info(f"Ingested event: {event.event_type} for user {event.user_id}")
    
    return {"success": True, "event_id": len(events_store)}


@app.post("/events/batch")
async def ingest_events_batch(events: List[Event]):
    """Batch event ingestion"""
    for event in events:
        if event.timestamp is None:
            event.timestamp = datetime.now()
        events_store.append(event.dict())
    
    logger.info(f"Ingested {len(events)} events")
    return {"success": True, "count": len(events)}


@app.get("/events/{user_id}")
async def get_user_events(user_id: int, limit: int = 100):
    """Get events for a specific user"""
    user_events = [e for e in events_store if e["user_id"] == user_id]
    user_events.sort(key=lambda x: x["timestamp"], reverse=True)
    return {"user_id": user_id, "events": user_events[:limit], "count": len(user_events)}


@app.post("/market-prices/ingest")
async def ingest_market_price(price: MarketPrice):
    """Ingest market price data"""
    market_prices_store.append(price.dict())
    logger.info(f"Ingested price: {price.product} @ ₦{price.price}/{price.unit}")
    return {"success": True, "price_id": len(market_prices_store)}


@app.get("/market-prices/{product}")
async def get_market_prices(product: str, days: int = 7):
    """Get market prices for a product"""
    cutoff = datetime.now() - timedelta(days=days)
    prices = [
        p for p in market_prices_store
        if p["product"].lower() == product.lower() and p["timestamp"] >= cutoff
    ]
    
    if not prices:
        # Return mock data for demo
        return {
            "product": product,
            "avg": 250.0,
            "high": 300.0,
            "low": 200.0,
            "median": 250.0,
            "count": 0,
            "period_days": days,
        }
    
    price_values = [p["price"] for p in prices]
    return {
        "product": product,
        "avg": sum(price_values) / len(price_values),
        "high": max(price_values),
        "low": min(price_values),
        "median": sorted(price_values)[len(price_values) // 2],
        "count": len(prices),
        "period_days": days,
        "prices": prices,
    }


@app.post("/user-journey/track")
async def track_user_journey(journey: UserJourneyEvent):
    """Track user journey progress"""
    user_journey_store.append(journey.dict())
    logger.info(f"Tracked journey: {journey.journey_type} - {journey.step} for user {journey.user_id}")
    return {"success": True, "journey_id": journey.journey_id}


@app.get("/user-journey/{user_id}")
async def get_user_journeys(user_id: int):
    """Get all journeys for a user"""
    journeys = [j for j in user_journey_store if j["user_id"] == user_id]
    journeys.sort(key=lambda x: x["timestamp"], reverse=True)
    return {"user_id": user_id, "journeys": journeys, "count": len(journeys)}


@app.post("/analytics/aggregate")
async def aggregate_data(request: AggregationRequest):
    """Aggregate data for analytics"""
    
    # Filter events
    filtered_events = events_store
    
    if request.user_id:
        filtered_events = [e for e in filtered_events if e["user_id"] == request.user_id]
    
    if request.start_date:
        filtered_events = [e for e in filtered_events if e["timestamp"] >= request.start_date]
    
    if request.end_date:
        filtered_events = [e for e in filtered_events if e["timestamp"] <= request.end_date]
    
    # Aggregate based on metric
    if request.metric == "expense_summary":
        return aggregate_expenses(filtered_events, request.group_by)
    elif request.metric == "harvest_summary":
        return aggregate_harvests(filtered_events, request.group_by)
    elif request.metric == "marketplace_summary":
        return aggregate_marketplace(filtered_events, request.group_by)
    elif request.metric == "journey_completion":
        return aggregate_journey_completion(filtered_events)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown metric: {request.metric}")


@app.get("/analytics/annual-report/{user_id}/{year}")
async def get_annual_report_data(user_id: int, year: int):
    """Get aggregated data for annual report"""
    
    start_date = datetime(year, 1, 1)
    end_date = datetime(year, 12, 31, 23, 59, 59)
    
    user_events = [
        e for e in events_store
        if e["user_id"] == user_id and start_date <= e["timestamp"] <= end_date
    ]
    
    # Aggregate harvests
    harvest_events = [e for e in user_events if e["event_type"] == "harvest_recorded"]
    total_revenue = sum(e["data"].get("harvest_value", 0) for e in harvest_events)
    
    # Aggregate expenses
    expense_events = [e for e in user_events if e["event_type"] == "expense_tracked"]
    total_expenses = sum(e["data"].get("amount", 0) for e in expense_events)
    
    # Calculate metrics
    net_profit = total_revenue - total_expenses
    roi = (net_profit / total_expenses * 100) if total_expenses > 0 else 0
    
    # Top crop
    crop_revenue = {}
    for e in harvest_events:
        crop = e["data"].get("crop_type", "Unknown")
        crop_revenue[crop] = crop_revenue.get(crop, 0) + e["data"].get("harvest_value", 0)
    
    top_crop = max(crop_revenue.items(), key=lambda x: x[1])[0] if crop_revenue else "None"
    
    return {
        "user_id": user_id,
        "year": year,
        "total_revenue": total_revenue,
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "roi": round(roi, 2),
        "top_crop": top_crop,
        "harvest_count": len(harvest_events),
        "expense_count": len(expense_events),
        "crop_breakdown": crop_revenue,
    }


@app.get("/analytics/weekly-expenses/{user_id}")
async def get_weekly_expenses(user_id: int):
    """Get weekly expense summary"""
    
    end_date = datetime.now()
    start_date = end_date - timedelta(days=7)
    
    expense_events = [
        e for e in events_store
        if e["user_id"] == user_id
        and e["event_type"] == "expense_tracked"
        and start_date <= e["timestamp"] <= end_date
    ]
    
    # Aggregate by category
    categories = {}
    total = 0
    
    for e in expense_events:
        category = e["data"].get("category", "Other")
        amount = e["data"].get("amount", 0)
        categories[category] = categories.get(category, 0) + amount
        total += amount
    
    return {
        "user_id": user_id,
        "period": "weekly",
        "start_date": start_date,
        "end_date": end_date,
        "total": total,
        "fertilizer": categories.get("Fertilizer", 0),
        "labor": categories.get("Labor", 0),
        "seeds": categories.get("Seeds", 0),
        "other": categories.get("Other", 0),
        "breakdown": categories,
    }


@app.get("/ml/features/{user_id}")
async def get_ml_features(user_id: int):
    """Extract ML features for credit scoring, yield prediction, etc."""
    
    user_events = [e for e in events_store if e["user_id"] == user_id]
    
    # Calculate features
    harvest_count = len([e for e in user_events if e["event_type"] == "harvest_recorded"])
    expense_count = len([e for e in user_events if e["event_type"] == "expense_tracked"])
    
    harvest_events = [e for e in user_events if e["event_type"] == "harvest_recorded"]
    total_revenue = sum(e["data"].get("harvest_value", 0) for e in harvest_events)
    
    expense_events = [e for e in user_events if e["event_type"] == "expense_tracked"]
    total_expenses = sum(e["data"].get("amount", 0) for e in expense_events)
    
    # Account age
    if user_events:
        first_event = min(user_events, key=lambda x: x["timestamp"])
        account_age_days = (datetime.now() - first_event["timestamp"]).days
    else:
        account_age_days = 0
    
    return {
        "user_id": user_id,
        "features": {
            "harvest_count": harvest_count,
            "expense_count": expense_count,
            "total_revenue": total_revenue,
            "total_expenses": total_expenses,
            "net_profit": total_revenue - total_expenses,
            "account_age_days": account_age_days,
            "avg_harvest_value": total_revenue / harvest_count if harvest_count > 0 else 0,
            "expense_to_revenue_ratio": total_expenses / total_revenue if total_revenue > 0 else 0,
        }
    }


# ============================================================================
# EOS VEGETATION INDICES ENDPOINTS
# ============================================================================

@app.post("/vegetation/ingest")
async def ingest_vegetation_indices(record: VegetationIndicesRecord):
    """Ingest vegetation indices from satellite service"""
    vegetation_indices_store.append(record.dict())
    logger.info(f"Ingested vegetation indices for field {record.field_id}: NDVI={record.ndvi}")
    
    # Auto-generate health summary if we have enough data
    field_records = [r for r in vegetation_indices_store if r["field_id"] == record.field_id]
    if len(field_records) >= 3:
        await update_field_health_summary(record.field_id)
    
    return {"success": True, "record_id": len(vegetation_indices_store)}


@app.post("/vegetation/batch")
async def ingest_vegetation_batch(records: List[VegetationIndicesRecord]):
    """Batch ingest vegetation indices"""
    for record in records:
        vegetation_indices_store.append(record.dict())
    
    logger.info(f"Batch ingested {len(records)} vegetation records")
    return {"success": True, "count": len(records)}


@app.get("/vegetation/field/{field_id}")
async def get_field_vegetation(field_id: int, days: int = 30):
    """Get vegetation indices time-series for a field"""
    cutoff = datetime.now() - timedelta(days=days)
    
    records = [
        r for r in vegetation_indices_store
        if r["field_id"] == field_id and r["date"] >= cutoff
    ]
    records.sort(key=lambda x: x["date"], reverse=True)
    
    if not records:
        # Return mock data for demo
        return generate_mock_vegetation_data(field_id, days)
    
    # Calculate trends
    if len(records) >= 2:
        ndvi_trend = "increasing" if records[0]["ndvi"] > records[-1]["ndvi"] else "decreasing" if records[0]["ndvi"] < records[-1]["ndvi"] else "stable"
        ndmi_trend = "increasing" if records[0]["ndmi"] > records[-1]["ndmi"] else "decreasing" if records[0]["ndmi"] < records[-1]["ndmi"] else "stable"
    else:
        ndvi_trend = "stable"
        ndmi_trend = "stable"
    
    return {
        "field_id": field_id,
        "records": records,
        "count": len(records),
        "latest": records[0] if records else None,
        "trends": {
            "ndvi": ndvi_trend,
            "ndmi": ndmi_trend,
        },
        "statistics": {
            "avg_ndvi": sum(r["ndvi"] for r in records) / len(records),
            "avg_ndmi": sum(r["ndmi"] for r in records) / len(records),
            "avg_ndre": sum(r["ndre"] for r in records) / len(records),
        }
    }


@app.get("/vegetation/health/{field_id}")
async def get_field_health(field_id: int):
    """Get health summary for a field"""
    summaries = [s for s in field_health_summary_store if s["field_id"] == field_id]
    
    if summaries:
        return summaries[-1]  # Return latest summary
    
    # Generate mock summary
    return generate_mock_health_summary(field_id)


@app.post("/sedona/results")
async def store_sedona_results(result: SedonaSpatialResult):
    """Store spatial analytics results from Apache Sedona"""
    sedona_analytics_store.append(result.dict())
    logger.info(f"Stored Sedona result: {result.job_type} for field {result.field_id}")
    return {"success": True, "job_id": result.job_id}


@app.get("/sedona/field/{field_id}")
async def get_sedona_analytics(field_id: int):
    """Get Sedona spatial analytics for a field"""
    results = [r for r in sedona_analytics_store if r["field_id"] == field_id]
    
    if not results:
        # Return mock Sedona results
        return generate_mock_sedona_results(field_id)
    
    return {
        "field_id": field_id,
        "results": results,
        "latest": results[-1] if results else None,
    }


@app.get("/field-overview/{field_id}")
async def get_integrated_field_overview(field_id: int, days: int = 30):
    """
    Integrated Field Overview endpoint that combines:
    - Lakehouse vegetation indices time-series
    - PostGIS farm boundary (via field_id lookup)
    - Sedona spatial analytics
    - Health assessment and recommendations
    """
    # Get vegetation data from Lakehouse
    vegetation_data = await get_field_vegetation(field_id, days)
    
    # Get health summary
    health_data = await get_field_health(field_id)
    
    # Get Sedona spatial analytics
    sedona_data = await get_sedona_analytics(field_id)
    
    # Combine into integrated response
    return {
        "field_id": field_id,
        "timestamp": datetime.now(),
        "source": "lakehouse-postgis-sedona-integrated",
        
        # Vegetation indices from Lakehouse
        "vegetation": {
            "latest": vegetation_data.get("latest"),
            "trends": vegetation_data.get("trends"),
            "statistics": vegetation_data.get("statistics"),
            "history_count": vegetation_data.get("count", 0),
        },
        
        # Health assessment
        "health": {
            "status": health_data.get("health_status", "good"),
            "stress_level": health_data.get("stress_level", "low"),
            "disease_risk": health_data.get("disease_risk", 25.0),
            "recommendations": health_data.get("recommendations", []),
        },
        
        # Sedona spatial analytics
        "spatial": {
            "total_area_ha": sedona_data.get("latest", {}).get("total_area_ha", 45.2),
            "stressed_area_ha": sedona_data.get("latest", {}).get("stressed_area_ha", 5.1),
            "healthy_area_ha": sedona_data.get("latest", {}).get("healthy_area_ha", 40.1),
            "stress_percentage": sedona_data.get("latest", {}).get("stress_percentage", 11.3),
            "regional_comparison": sedona_data.get("latest", {}).get("field_vs_regional", 0.05),
        },
        
        # PostGIS boundary placeholder (would be fetched from PostGIS in production)
        "boundary": {
            "type": "Polygon",
            "coordinates": [[[3.3792, 6.5244], [3.3892, 6.5244], [3.3892, 6.5344], [3.3792, 6.5344], [3.3792, 6.5244]]],
            "source": "postgis",
        },
    }


# ============================================================================
# EOS HELPER FUNCTIONS
# ============================================================================

def generate_mock_vegetation_data(field_id: int, days: int) -> Dict[str, Any]:
    """Generate mock vegetation data for demo"""
    import random
    random.seed(field_id)
    
    records = []
    base_ndvi = random.uniform(0.6, 0.8)
    base_ndmi = random.uniform(0.25, 0.45)
    
    for i in range(min(days // 5, 10)):
        date = datetime.now() - timedelta(days=i * 5)
        records.append({
            "field_id": field_id,
            "date": date,
            "ndvi": round(base_ndvi + random.uniform(-0.1, 0.1), 4),
            "ndmi": round(base_ndmi + random.uniform(-0.1, 0.1), 4),
            "ndre": round(random.uniform(0.4, 0.6), 4),
            "reci": round(random.uniform(2.0, 3.5), 4),
            "msavi": round(random.uniform(0.5, 0.7), 4),
            "ndwi": round(random.uniform(-0.1, 0.2), 4),
            "chl": round(random.uniform(1.5, 2.5), 4),
            "source": "mock",
        })
    
    return {
        "field_id": field_id,
        "records": records,
        "count": len(records),
        "latest": records[0] if records else None,
        "trends": {"ndvi": "stable", "ndmi": "stable"},
        "statistics": {
            "avg_ndvi": round(sum(r["ndvi"] for r in records) / len(records), 4) if records else 0,
            "avg_ndmi": round(sum(r["ndmi"] for r in records) / len(records), 4) if records else 0,
            "avg_ndre": round(sum(r["ndre"] for r in records) / len(records), 4) if records else 0,
        }
    }


def generate_mock_health_summary(field_id: int) -> Dict[str, Any]:
    """Generate mock health summary for demo"""
    import random
    random.seed(field_id)
    
    ndvi = random.uniform(0.6, 0.8)
    
    if ndvi >= 0.7:
        health_status = "excellent"
        stress_level = "none"
        disease_risk = random.uniform(5, 20)
    elif ndvi >= 0.5:
        health_status = "good"
        stress_level = "low"
        disease_risk = random.uniform(20, 40)
    else:
        health_status = "moderate"
        stress_level = "moderate"
        disease_risk = random.uniform(40, 60)
    
    return {
        "field_id": field_id,
        "health_status": health_status,
        "stress_level": stress_level,
        "disease_risk": round(disease_risk, 1),
        "avg_ndvi": round(ndvi, 4),
        "avg_ndmi": round(random.uniform(0.25, 0.45), 4),
        "avg_ndre": round(random.uniform(0.4, 0.6), 4),
        "ndvi_trend": "stable",
        "ndmi_trend": "stable",
        "recommendations": [
            "Continue regular monitoring",
            "Check irrigation levels in NW corner",
            "Schedule pest inspection next week",
        ],
        "anomaly_count": random.randint(0, 3),
        "anomaly_areas": [],
    }


def generate_mock_sedona_results(field_id: int) -> Dict[str, Any]:
    """Generate mock Sedona spatial analytics results"""
    import random
    random.seed(field_id)
    
    total_area = random.uniform(30, 60)
    stress_pct = random.uniform(5, 20)
    stressed_area = total_area * stress_pct / 100
    
    return {
        "field_id": field_id,
        "results": [],
        "latest": {
            "job_id": f"sedona-{field_id}-{datetime.now().strftime('%Y%m%d')}",
            "job_type": "vegetation_analysis",
            "total_area_ha": round(total_area, 2),
            "stressed_area_ha": round(stressed_area, 2),
            "healthy_area_ha": round(total_area - stressed_area, 2),
            "stress_percentage": round(stress_pct, 1),
            "regional_avg_ndvi": round(random.uniform(0.55, 0.7), 4),
            "field_vs_regional": round(random.uniform(-0.1, 0.15), 4),
        }
    }


async def update_field_health_summary(field_id: int):
    """Update health summary based on recent vegetation data"""
    records = [r for r in vegetation_indices_store if r["field_id"] == field_id]
    if not records:
        return
    
    recent = records[-10:]  # Last 10 records
    avg_ndvi = sum(r["ndvi"] for r in recent) / len(recent)
    avg_ndmi = sum(r["ndmi"] for r in recent) / len(recent)
    avg_ndre = sum(r["ndre"] for r in recent) / len(recent)
    
    # Determine health status
    if avg_ndvi >= 0.7:
        health_status = "excellent"
        stress_level = "none"
    elif avg_ndvi >= 0.5:
        health_status = "good"
        stress_level = "low"
    elif avg_ndvi >= 0.3:
        health_status = "moderate"
        stress_level = "moderate"
    else:
        health_status = "poor"
        stress_level = "high"
    
    # Calculate disease risk based on moisture stress
    disease_risk = max(0, min(100, (0.5 - avg_ndmi) * 200))
    
    summary = {
        "field_id": field_id,
        "farm_id": records[-1].get("farm_id", 1),
        "user_id": records[-1].get("user_id", 1),
        "crop_type": records[-1].get("crop_type", "unknown"),
        "period_start": records[0]["date"],
        "period_end": records[-1]["date"],
        "avg_ndvi": round(avg_ndvi, 4),
        "avg_ndmi": round(avg_ndmi, 4),
        "avg_ndre": round(avg_ndre, 4),
        "ndvi_trend": "stable",
        "ndmi_trend": "stable",
        "health_status": health_status,
        "stress_level": stress_level,
        "disease_risk": round(disease_risk, 1),
        "recommendations": generate_recommendations(health_status, stress_level, avg_ndmi),
        "anomaly_count": 0,
        "anomaly_areas": [],
    }
    
    field_health_summary_store.append(summary)
    logger.info(f"Updated health summary for field {field_id}: {health_status}")


def generate_recommendations(health_status: str, stress_level: str, ndmi: float) -> List[str]:
    """Generate recommendations based on health assessment"""
    recommendations = []
    
    if health_status == "excellent":
        recommendations.append("Crop health is excellent. Maintain current practices.")
    elif health_status == "good":
        recommendations.append("Crop health is good. Continue monitoring.")
    elif health_status == "moderate":
        recommendations.append("Some stress detected. Investigate potential causes.")
        recommendations.append("Consider soil testing for nutrient deficiencies.")
    else:
        recommendations.append("Significant stress detected. Immediate action recommended.")
        recommendations.append("Check for pest or disease presence.")
    
    if ndmi < 0.2:
        recommendations.append("Low moisture detected. Increase irrigation.")
    elif ndmi > 0.5:
        recommendations.append("High moisture levels. Monitor for waterlogging.")
    
    return recommendations


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def aggregate_expenses(events: List[Dict], group_by: Optional[str] = None):
    """Aggregate expense events"""
    expense_events = [e for e in events if e["event_type"] == "expense_tracked"]
    
    total = sum(e["data"].get("amount", 0) for e in expense_events)
    
    if group_by == "category":
        categories = {}
        for e in expense_events:
            cat = e["data"].get("category", "Other")
            categories[cat] = categories.get(cat, 0) + e["data"].get("amount", 0)
        return {"total": total, "by_category": categories, "count": len(expense_events)}
    
    return {"total": total, "count": len(expense_events)}


def aggregate_harvests(events: List[Dict], group_by: Optional[str] = None):
    """Aggregate harvest events"""
    harvest_events = [e for e in events if e["event_type"] == "harvest_recorded"]
    
    total_value = sum(e["data"].get("harvest_value", 0) for e in harvest_events)
    
    if group_by == "crop":
        crops = {}
        for e in harvest_events:
            crop = e["data"].get("crop_type", "Unknown")
            crops[crop] = crops.get(crop, 0) + e["data"].get("harvest_value", 0)
        return {"total_value": total_value, "by_crop": crops, "count": len(harvest_events)}
    
    return {"total_value": total_value, "count": len(harvest_events)}


def aggregate_marketplace(events: List[Dict], group_by: Optional[str] = None):
    """Aggregate marketplace events"""
    listing_events = [e for e in events if e["event_type"] == "marketplace_sale"]
    order_events = [e for e in events if e["event_type"] == "order_created"]
    
    return {
        "listings_created": len(listing_events),
        "orders_created": len(order_events),
    }


def aggregate_journey_completion(events: List[Dict]):
    """Calculate journey completion rates"""
    journey_events = [e for e in events if "journey" in e["event_type"]]
    
    journeys = {}
    for e in journey_events:
        journey_type = e.get("data", {}).get("journey_type", "unknown")
        if journey_type not in journeys:
            journeys[journey_type] = {"started": 0, "completed": 0}
        
        if "started" in e["event_type"]:
            journeys[journey_type]["started"] += 1
        elif "completed" in e["event_type"]:
            journeys[journey_type]["completed"] += 1
    
    # Calculate completion rates
    for journey_type in journeys:
        started = journeys[journey_type]["started"]
        completed = journeys[journey_type]["completed"]
        journeys[journey_type]["completion_rate"] = (completed / started * 100) if started > 0 else 0
    
    return {"journeys": journeys}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8085"))
    uvicorn.run(app, host="0.0.0.0", port=port)
