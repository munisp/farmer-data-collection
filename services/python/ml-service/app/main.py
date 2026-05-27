from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
import os
import logging

from app.models.crop_yield import CropYieldPredictor
from app.models.price_forecast import PriceForecaster

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Farmer Data Collection ML Service",
    description="Machine Learning service for crop yield prediction and price forecasting",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize ML models
crop_yield_predictor = CropYieldPredictor()
price_forecaster = PriceForecaster()

# ============================================================================
# Request/Response Models
# ============================================================================

class CropYieldPredictionRequest(BaseModel):
    crop: str = Field(..., description="Crop type (e.g., Maize, Rice, Cassava)")
    farmSize: float = Field(..., gt=0, description="Farm size in hectares")
    soilType: str = Field(..., description="Soil type (e.g., Loamy, Clay, Sandy)")
    rainfall: float = Field(..., ge=0, description="Annual rainfall in mm")
    temperature: float = Field(..., description="Average temperature in Celsius")
    fertilizer: str = Field(..., description="Fertilizer type (e.g., NPK, Organic, Urea)")
    season: str = Field(..., description="Growing season (e.g., Wet, Dry)")

class CropYieldPredictionResponse(BaseModel):
    success: bool
    predictedYield: float
    unit: str = "kg"
    confidence: float
    factors: Dict[str, str]
    recommendation: Optional[str] = None

class PriceForecastRequest(BaseModel):
    crop: str
    location: str
    forecastDays: int = Field(30, ge=1, le=90)
    historicalPrices: List[Dict[str, Any]]

class PriceForecastResponse(BaseModel):
    success: bool
    forecast: List[Dict[str, Any]]
    trend: str
    recommendation: str

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    models: Dict[str, str]

# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "ml-service",
        "version": "1.0.0",
        "models": {
            "crop_yield": "loaded" if crop_yield_predictor.is_loaded() else "not_loaded",
            "price_forecast": "loaded" if price_forecaster.is_loaded() else "not_loaded"
        }
    }

@app.post("/api/ml/predict-yield", response_model=CropYieldPredictionResponse)
async def predict_crop_yield(request: CropYieldPredictionRequest):
    """
    Predict crop yield based on farm conditions
    
    This endpoint uses a Random Forest model trained on historical harvest data
    to predict expected crop yield given various farm parameters.
    """
    try:
        logger.info(f"Predicting yield for {request.crop} on {request.farmSize} hectares")
        
        # Prepare input data
        input_data = {
            'crop': request.crop,
            'farm_size': request.farmSize,
            'soil_type': request.soilType,
            'rainfall': request.rainfall,
            'temperature': request.temperature,
            'fertilizer': request.fertilizer,
            'season': request.season
        }
        
        # Make prediction
        prediction = crop_yield_predictor.predict(input_data)
        
        # Analyze factors
        factors = crop_yield_predictor.analyze_factors(input_data)
        
        # Generate recommendation
        recommendation = crop_yield_predictor.generate_recommendation(
            input_data, 
            prediction['predicted_yield']
        )
        
        return {
            "success": True,
            "predictedYield": prediction['predicted_yield'],
            "unit": "kg",
            "confidence": prediction['confidence'],
            "factors": factors,
            "recommendation": recommendation
        }
        
    except Exception as e:
        logger.error(f"Yield prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

@app.post("/api/ml/forecast-price", response_model=PriceForecastResponse)
async def forecast_price(request: PriceForecastRequest):
    """
    Forecast crop prices for the next N days
    
    This endpoint uses time series analysis to predict future crop prices
    based on historical price data and market trends.
    """
    try:
        logger.info(f"Forecasting price for {request.crop} in {request.location}")
        
        # Prepare input data
        input_data = {
            'crop': request.crop,
            'location': request.location,
            'forecast_days': request.forecastDays,
            'historical_prices': request.historicalPrices
        }
        
        # Make forecast
        forecast_result = price_forecaster.forecast(input_data)
        
        return {
            "success": True,
            "forecast": forecast_result['forecast'],
            "trend": forecast_result['trend'],
            "recommendation": forecast_result['recommendation']
        }
        
    except Exception as e:
        logger.error(f"Price forecast error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Forecast failed: {str(e)}")

@app.get("/api/ml/models/status")
async def get_models_status():
    """Get status of all ML models"""
    return {
        "crop_yield_predictor": {
            "loaded": crop_yield_predictor.is_loaded(),
            "model_type": "RandomForestRegressor",
            "features": crop_yield_predictor.get_features()
        },
        "price_forecaster": {
            "loaded": price_forecaster.is_loaded(),
            "model_type": "ARIMA",
            "features": price_forecaster.get_features()
        }
    }

@app.post("/api/ml/models/retrain")
async def retrain_models():
    """Retrain ML models with latest data"""
    try:
        logger.info("Retraining ML models...")
        
        # Retrain crop yield model
        crop_yield_predictor.retrain()
        
        # Retrain price forecast model
        price_forecaster.retrain()
        
        return {
            "success": True,
            "message": "Models retrained successfully"
        }
    except Exception as e:
        logger.error(f"Model retraining error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Retraining failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
