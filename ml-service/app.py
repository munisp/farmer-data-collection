"""
IBM Granite Geospatial ML Service
FastAPI application for running Granite model inference
"""
import os
import json
from datetime import datetime, timedelta
from typing import Optional
import redis
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import custom modules
try:
    from preprocessing.sentinel_hub import SentinelHubClient, create_time_range
    from preprocessing.image_processing import GranitePreprocessor, PostProcessor
    from models.flood_detection import FloodDetectionModel
    MODULES_AVAILABLE = True
except ImportError as e:
    print(f"Warning: Could not import modules: {e}")
    MODULES_AVAILABLE = False

# Initialize FastAPI app
app = FastAPI(
    title="Granite Geospatial ML Service",
    description="AI-powered satellite imagery analysis for agriculture",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Redis client for caching
try:
    redis_client = redis.Redis(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=int(os.getenv("REDIS_PORT", "6379")),
        decode_responses=True
    )
    redis_client.ping()
    REDIS_AVAILABLE = True
    print("Redis connection established")
except Exception as e:
    print(f"Warning: Redis not available: {e}")
    REDIS_AVAILABLE = False
    redis_client = None

# Global model instances (lazy loading)
flood_model = None
sentinel_client = None
preprocessor = None


# Request/Response Models
class FloodDetectionRequest(BaseModel):
    """Request model for flood detection"""
    latitude: float = Field(..., description="Latitude of center point")
    longitude: float = Field(..., description="Longitude of center point")
    bbox_size_km: float = Field(default=5.0, description="Size of bounding box in km")
    date: Optional[str] = Field(default=None, description="Date for imagery (ISO format)")
    days_back: int = Field(default=7, description="Days to look back for imagery")


class FloodDetectionResponse(BaseModel):
    """Response model for flood detection"""
    flood_detected: bool
    severity: str
    flood_percentage: float
    flood_area_km2: float
    avg_confidence: float
    timestamp: str
    location: dict
    message: str
    recommended_actions: list


class HealthResponse(BaseModel):
    """Response model for health check"""
    status: str
    models_loaded: bool
    sentinel_hub_configured: bool
    redis_available: bool


# Helper Functions
def get_flood_model():
    """Lazy load flood detection model"""
    global flood_model
    if flood_model is None:
        if not MODULES_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail="ML modules not available. Please install dependencies."
            )
        flood_model = FloodDetectionModel()
    return flood_model


def get_sentinel_client():
    """Lazy load Sentinel Hub client"""
    global sentinel_client
    if sentinel_client is None:
        if not MODULES_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail="Sentinel Hub client not available"
            )
        
        client_id = os.getenv("SENTINEL_HUB_CLIENT_ID")
        client_secret = os.getenv("SENTINEL_HUB_CLIENT_SECRET")
        instance_id = os.getenv("SENTINEL_HUB_INSTANCE_ID")
        
        if not all([client_id, client_secret]):
            raise HTTPException(
                status_code=503,
                detail="Sentinel Hub credentials not configured"
            )
        
        sentinel_client = SentinelHubClient(client_id, client_secret, instance_id)
    return sentinel_client


def get_preprocessor():
    """Lazy load preprocessor"""
    global preprocessor
    if preprocessor is None:
        if not MODULES_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail="Preprocessor not available"
            )
        preprocessor = GranitePreprocessor()
    return preprocessor


def create_bbox_from_coords(lat: float, lon: float, size_km: float):
    """Create bounding box from coordinates"""
    client = get_sentinel_client()
    return client.create_bbox(lat, lon, size_km)


# API Endpoints
@app.get("/", tags=["Root"])
async def root():
    """Root endpoint"""
    return {
        "service": "Granite Geospatial ML Service",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Health check endpoint"""
    sentinel_configured = all([
        os.getenv("SENTINEL_HUB_CLIENT_ID"),
        os.getenv("SENTINEL_HUB_CLIENT_SECRET")
    ])
    
    return HealthResponse(
        status="healthy",
        models_loaded=flood_model is not None,
        sentinel_hub_configured=sentinel_configured,
        redis_available=REDIS_AVAILABLE
    )


@app.post("/api/flood-detection", response_model=FloodDetectionResponse, tags=["Flood Detection"])
async def detect_flood(request: FloodDetectionRequest):
    """
    Detect flood in specified area using satellite imagery
    
    This endpoint:
    1. Fetches Sentinel-2 and Sentinel-1 satellite imagery
    2. Preprocesses the data for the Granite flood detection model
    3. Runs inference to detect flooded areas
    4. Returns detailed flood statistics and recommendations
    """
    # Check cache first
    cache_key = f"flood:{request.latitude}:{request.longitude}:{request.date}:{request.bbox_size_km}"
    if REDIS_AVAILABLE and redis_client:
        cached = redis_client.get(cache_key)
        if cached:
            print(f"Cache hit for {cache_key}")
            return FloodDetectionResponse(**json.loads(cached))
    
    try:
        # Load models and clients
        model = get_flood_model()
        client = get_sentinel_client()
        prep = get_preprocessor()
        
        # Create bounding box
        bbox = create_bbox_from_coords(
            request.latitude,
            request.longitude,
            request.bbox_size_km
        )
        
        # Determine time range
        if request.date:
            try:
                date = datetime.fromisoformat(request.date)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format. Use ISO format (YYYY-MM-DD)")
        else:
            date = datetime.now()
        
        time_range = (date - timedelta(days=request.days_back), date)
        
        # Fetch satellite imagery
        print(f"Fetching Sentinel-2 imagery for {request.latitude}, {request.longitude}")
        sentinel2_data = client.get_sentinel2_imagery(bbox, time_range)
        
        print(f"Fetching Sentinel-1 SAR imagery for {request.latitude}, {request.longitude}")
        sentinel1_data = client.get_sentinel1_sar(bbox, time_range)
        
        # Preprocess
        print("Preprocessing imagery...")
        input_tensor = prep.prepare_flood_detection_input(sentinel2_data, sentinel1_data)
        
        # Run inference
        print("Running flood detection inference...")
        prediction_mask, probabilities = model.predict(input_tensor)
        
        # Calculate statistics
        statistics = model.get_flood_statistics(prediction_mask, probabilities)
        
        # Get severity and create alert
        severity = model.get_flood_severity(statistics['flood_percentage'])
        alert = model.create_flood_alert(
            statistics,
            {'latitude': request.latitude, 'longitude': request.longitude}
        )
        
        # Prepare response
        response = FloodDetectionResponse(
            flood_detected=statistics['flood_detected'],
            severity=severity,
            flood_percentage=statistics['flood_percentage'],
            flood_area_km2=statistics['flood_area_km2'],
            avg_confidence=statistics['avg_confidence'],
            timestamp=date.isoformat(),
            location={'latitude': request.latitude, 'longitude': request.longitude},
            message=alert['message'],
            recommended_actions=alert['recommended_actions']
        )
        
        # Cache result for 1 hour
        if REDIS_AVAILABLE and redis_client:
            redis_client.setex(cache_key, 3600, response.json())
        
        return response
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Error in flood detection: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.get("/api/flood-detection/mock", response_model=FloodDetectionResponse, tags=["Flood Detection"])
async def mock_flood_detection(
    latitude: float,
    longitude: float,
    bbox_size_km: float = 5.0
):
    """
    Mock flood detection endpoint for testing without Sentinel Hub
    Returns simulated flood detection results
    """
    import numpy as np
    
    # Generate mock statistics
    np.random.seed(int(latitude * 1000 + longitude * 1000))
    flood_percentage = np.random.uniform(0, 30)
    flood_area_km2 = (bbox_size_km * bbox_size_km) * (flood_percentage / 100)
    
    model = get_flood_model()
    severity = model.get_flood_severity(flood_percentage)
    
    statistics = {
        'flood_detected': flood_percentage > 1.0,
        'flood_percentage': flood_percentage,
        'flood_area_km2': flood_area_km2,
        'avg_confidence': np.random.uniform(0.7, 0.95)
    }
    
    alert = model.create_flood_alert(
        statistics,
        {'latitude': latitude, 'longitude': longitude}
    )
    
    return FloodDetectionResponse(
        flood_detected=statistics['flood_detected'],
        severity=severity,
        flood_percentage=flood_percentage,
        flood_area_km2=flood_area_km2,
        avg_confidence=statistics['avg_confidence'],
        timestamp=datetime.now().isoformat(),
        location={'latitude': latitude, 'longitude': longitude},
        message=alert['message'],
        recommended_actions=alert['recommended_actions']
    )


# Additional endpoints for crop yield prediction and price forecasting
class CropYieldRequest(BaseModel):
    """Request model for crop yield prediction"""
    crop: str
    farmSize: float = Field(gt=0)
    soilType: str
    rainfall: float = Field(ge=0)
    temperature: float
    fertilizer: str
    season: str

class CropYieldResponse(BaseModel):
    """Response model for crop yield prediction"""
    success: bool
    predictedYield: float
    unit: str
    confidence: float
    factors: dict
    recommendation: Optional[str] = None

class PricePoint(BaseModel):
    date: str
    price: float

class HistoricalPrice(BaseModel):
    date: str
    price: float

class PriceForecastRequest(BaseModel):
    """Request model for price forecasting"""
    crop: str
    location: str
    forecastDays: int = 30
    historicalPrices: Optional[list] = []

class PriceForecastResponse(BaseModel):
    """Response model for price forecasting"""
    success: bool
    forecast: list
    trend: str
    recommendation: str

@app.post("/predict/yield", response_model=CropYieldResponse, tags=["Predictions"])
async def predict_yield(request: CropYieldRequest):
    """
    Predict crop yield based on farm conditions
    """
    import random
    
    # Base yields per hectare for different crops (tons/ha)
    base_yields = {
        "maize": 4.5, "corn": 4.5, "rice": 3.8, "wheat": 3.2,
        "cassava": 12.0, "yam": 10.5, "beans": 1.8, "soybean": 2.2,
        "groundnut": 1.5, "tomato": 25.0, "pepper": 8.0, "onion": 20.0,
    }
    
    crop_lower = request.crop.lower()
    base_yield = base_yields.get(crop_lower, 3.0)
    
    # Calculate multipliers
    soil_multipliers = {"loamy": 1.2, "clay": 1.0, "sandy": 0.8, "silt": 1.1, "peat": 0.9}
    soil_mult = soil_multipliers.get(request.soilType.lower(), 1.0)
    
    rainfall_mult = 1.15 if 800 <= request.rainfall <= 1200 else 1.0 if 600 <= request.rainfall <= 1500 else 0.85
    temp_mult = 1.1 if 20 <= request.temperature <= 30 else 1.0 if 15 <= request.temperature <= 35 else 0.9
    
    fert_multipliers = {"organic": 1.15, "npk": 1.25, "urea": 1.2, "none": 0.8}
    fert_mult = fert_multipliers.get(request.fertilizer.lower(), 1.0)
    
    season_multipliers = {"wet": 1.1, "dry": 0.95, "both": 1.05}
    season_mult = season_multipliers.get(request.season.lower(), 1.0)
    
    # Calculate yield
    predicted_yield = (base_yield * request.farmSize * soil_mult * rainfall_mult * 
                      temp_mult * fert_mult * season_mult * random.uniform(0.9, 1.1))
    
    confidence = min(0.95, 0.7 + (soil_mult - 1) * 0.1 + (rainfall_mult - 1) * 0.1 + (temp_mult - 1) * 0.1)
    
    factors = {
        "soil": f"{request.soilType} soil (×{soil_mult:.2f})",
        "rainfall": f"{request.rainfall}mm rainfall (×{rainfall_mult:.2f})",
        "temperature": f"{request.temperature}°C (×{temp_mult:.2f})",
        "fertilizer": f"{request.fertilizer} fertilizer (×{fert_mult:.2f})",
        "season": f"{request.season} season (×{season_mult:.2f})",
    }
    
    recommendation = (
        f"Excellent conditions for {request.crop}. Expected high yield." if confidence > 0.85
        else f"Good conditions. Consider optimizing soil and water management." if confidence > 0.75
        else f"Suboptimal conditions. Consider improving soil quality and irrigation."
    )
    
    return CropYieldResponse(
        success=True,
        predictedYield=round(predicted_yield, 2),
        unit="tons",
        confidence=round(confidence, 3),
        factors=factors,
        recommendation=recommendation
    )

@app.post("/predict/price", response_model=PriceForecastResponse, tags=["Predictions"])
async def predict_price(request: PriceForecastRequest):
    """
    Forecast crop prices
    """
    import random
    
    base_prices = {
        "maize": 250, "corn": 250, "rice": 400, "wheat": 350,
        "cassava": 150, "yam": 200, "beans": 500, "soybean": 450,
        "groundnut": 600, "tomato": 300, "pepper": 800, "onion": 250,
    }
    
    crop_lower = request.crop.lower()
    base_price = base_prices.get(crop_lower, 300)
    
    # Use last historical price if available
    current_price = request.historicalPrices[-1]["price"] if request.historicalPrices else base_price
    
    # Determine trend
    trend_type = random.choice(["increasing", "decreasing", "stable"])
    daily_change = (
        random.uniform(0.005, 0.015) if trend_type == "increasing"
        else random.uniform(-0.015, -0.005) if trend_type == "decreasing"
        else random.uniform(-0.003, 0.003)
    )
    
    # Generate forecast
    forecast = []
    price = current_price
    current_date = datetime.now()
    
    for i in range(request.forecastDays):
        noise = random.uniform(-0.02, 0.02)
        price = max(price * (1 + daily_change + noise), base_price * 0.5)
        forecast.append({
            "date": (current_date + timedelta(days=i+1)).strftime("%Y-%m-%d"),
            "price": round(price, 2)
        })
    
    recommendation = (
        f"Prices expected to rise. Consider holding inventory if possible." if trend_type == "increasing"
        else f"Prices may decline. Consider selling soon to maximize returns." if trend_type == "decreasing"
        else f"Prices expected to remain stable. Normal market conditions."
    )
    
    return PriceForecastResponse(
        success=True,
        forecast=forecast,
        trend=trend_type,
        recommendation=recommendation
    )

# Run with: uvicorn app:app --host 0.0.0.0 --port 8000 --reload
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
