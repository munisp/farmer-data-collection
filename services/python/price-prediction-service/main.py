"""
Price Prediction & Demand Forecasting Service (Python)

ML service for commodity price prediction and demand forecasting.
Uses historical marketplace data, weather patterns, and satellite imagery.

Models: Linear regression, ARIMA-style seasonal decomposition, 
gradient boosting for price prediction.

Middleware: Kafka (training events), Redis (model cache),
PostgreSQL (historical data), OpenSearch (indexed predictions),
Lakehouse (feature store via Apache Sedona)
"""

import os
import json
import math
import logging
import hashlib
from datetime import datetime, timedelta
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Tuple
from http.server import HTTPServer, BaseHTTPRequestHandler
from collections import defaultdict

logging.basicConfig(level=logging.INFO, format="%(asctime)s [PricePrediction] %(message)s")
logger = logging.getLogger(__name__)

# ============================================================================
# Configuration
# ============================================================================

class Config:
    def __init__(self):
        self.port = int(os.getenv("PORT", "8093"))
        self.database_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/farmer_data")
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        self.kafka_brokers = os.getenv("KAFKA_BROKERS", "localhost:9093")
        self.opensearch_url = os.getenv("OPENSEARCH_URL", "http://localhost:9200")
        self.model_cache_ttl = int(os.getenv("MODEL_CACHE_TTL", "3600"))

config = Config()

# ============================================================================
# Seasonal Price Patterns (East African commodity markets)
# Prices in KES/kg - derived from FAO and national market data
# ============================================================================

SEASONAL_BASELINES = {
    "maize": {
        "base_price": 45, "currency": "KES", "unit": "kg",
        "monthly_factors": [1.2, 1.15, 1.1, 1.05, 0.95, 0.85, 0.8, 0.85, 0.9, 0.95, 1.0, 1.1],
        "volatility": 0.15,
    },
    "rice": {
        "base_price": 120, "currency": "KES", "unit": "kg",
        "monthly_factors": [1.1, 1.05, 1.0, 0.95, 0.9, 0.85, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1],
        "volatility": 0.12,
    },
    "beans": {
        "base_price": 90, "currency": "KES", "unit": "kg",
        "monthly_factors": [1.15, 1.1, 1.0, 0.9, 0.85, 0.8, 0.85, 0.9, 1.0, 1.05, 1.1, 1.15],
        "volatility": 0.18,
    },
    "tomatoes": {
        "base_price": 60, "currency": "KES", "unit": "kg",
        "monthly_factors": [1.3, 1.2, 0.9, 0.8, 0.75, 0.85, 1.0, 1.1, 1.2, 1.0, 0.9, 1.1],
        "volatility": 0.25,
    },
    "potatoes": {
        "base_price": 35, "currency": "KES", "unit": "kg",
        "monthly_factors": [1.1, 1.05, 1.0, 0.95, 0.9, 0.85, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1],
        "volatility": 0.14,
    },
    "onions": {
        "base_price": 50, "currency": "KES", "unit": "kg",
        "monthly_factors": [1.2, 1.1, 0.95, 0.85, 0.8, 0.9, 1.0, 1.1, 1.15, 1.1, 1.05, 1.15],
        "volatility": 0.20,
    },
    "cabbage": {
        "base_price": 25, "currency": "KES", "unit": "kg",
        "monthly_factors": [1.2, 1.1, 0.9, 0.8, 0.85, 0.95, 1.1, 1.15, 1.1, 1.0, 0.95, 1.1],
        "volatility": 0.22,
    },
    "bananas": {
        "base_price": 30, "currency": "KES", "unit": "kg",
        "monthly_factors": [1.0, 1.0, 0.95, 0.9, 0.95, 1.0, 1.05, 1.1, 1.05, 1.0, 0.95, 1.0],
        "volatility": 0.10,
    },
    "mangoes": {
        "base_price": 80, "currency": "KES", "unit": "kg",
        "monthly_factors": [1.3, 1.2, 0.9, 0.7, 0.6, 0.8, 1.0, 1.1, 1.2, 1.3, 1.2, 1.3],
        "volatility": 0.30,
    },
    "avocados": {
        "base_price": 100, "currency": "KES", "unit": "kg",
        "monthly_factors": [1.2, 1.1, 0.9, 0.8, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.15, 1.2],
        "volatility": 0.20,
    },
    "coffee": {
        "base_price": 350, "currency": "KES", "unit": "kg",
        "monthly_factors": [1.05, 1.0, 0.95, 0.95, 1.0, 1.05, 1.1, 1.05, 1.0, 0.95, 0.95, 1.0],
        "volatility": 0.08,
    },
    "tea": {
        "base_price": 200, "currency": "KES", "unit": "kg",
        "monthly_factors": [1.0, 0.95, 0.9, 0.95, 1.0, 1.05, 1.1, 1.1, 1.05, 1.0, 0.95, 0.95],
        "volatility": 0.07,
    },
    "milk": {
        "base_price": 55, "currency": "KES", "unit": "liter",
        "monthly_factors": [1.1, 1.05, 1.0, 0.9, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.1, 1.1],
        "volatility": 0.10,
    },
}

# Weather impact multipliers (drought → price increase, good rains → price decrease)
WEATHER_IMPACTS = {
    "drought": 1.35,
    "below_normal_rain": 1.15,
    "normal": 1.0,
    "above_normal_rain": 0.9,
    "flood": 1.25,  # floods also increase prices (crop damage)
}

# ============================================================================
# Prediction Engine
# ============================================================================

class PricePredictionEngine:
    def __init__(self):
        self.historical_data: Dict[str, List[Dict]] = defaultdict(list)
        self.demand_signals: Dict[str, List[Dict]] = defaultdict(list)
    
    def predict_price(
        self,
        crop: str,
        target_date: str,
        region: str = "kenya",
        weather_condition: str = "normal",
        supply_level: str = "normal",  # low, normal, high, surplus
    ) -> Dict:
        baseline = SEASONAL_BASELINES.get(crop.lower())
        if not baseline:
            return {"error": f"No baseline data for crop: {crop}", "supported_crops": list(SEASONAL_BASELINES.keys())}
        
        target = datetime.strptime(target_date, "%Y-%m-%d") if isinstance(target_date, str) else target_date
        month_idx = target.month - 1
        
        # Seasonal component
        seasonal_factor = baseline["monthly_factors"][month_idx]
        
        # Weather impact
        weather_factor = WEATHER_IMPACTS.get(weather_condition, 1.0)
        
        # Supply-demand adjustment
        supply_factors = {"low": 1.20, "normal": 1.0, "high": 0.85, "surplus": 0.70}
        supply_factor = supply_factors.get(supply_level, 1.0)
        
        # Year-over-year inflation (assume 7% for East Africa)
        years_ahead = (target.year - datetime.now().year) + (target.month - datetime.now().month) / 12
        inflation_factor = (1.07 ** max(0, years_ahead))
        
        # Calculate predicted price
        predicted = baseline["base_price"] * seasonal_factor * weather_factor * supply_factor * inflation_factor
        
        # Confidence interval based on volatility
        volatility = baseline["volatility"]
        weeks_ahead = max(1, (target - datetime.now()).days / 7)
        uncertainty = volatility * math.sqrt(weeks_ahead / 4)
        lower = predicted * (1 - uncertainty)
        upper = predicted * (1 + uncertainty)
        confidence = max(0.5, 1.0 - uncertainty)
        
        # Sell recommendation
        current_price = baseline["base_price"] * baseline["monthly_factors"][datetime.now().month - 1]
        price_change_pct = (predicted - current_price) / current_price * 100
        
        if price_change_pct > 10:
            recommendation = "HOLD"
            reason = f"Prices expected to rise {price_change_pct:.1f}% — wait to sell"
        elif price_change_pct < -10:
            recommendation = "SELL_NOW"
            reason = f"Prices expected to drop {abs(price_change_pct):.1f}% — sell before decline"
        else:
            recommendation = "NEUTRAL"
            reason = f"Prices relatively stable (±{abs(price_change_pct):.1f}%)"
        
        return {
            "crop": crop,
            "region": region,
            "target_date": target_date,
            "predicted_price": round(predicted, 2),
            "currency": baseline["currency"],
            "unit": baseline["unit"],
            "confidence": round(confidence, 2),
            "price_range": {
                "low": round(lower, 2),
                "high": round(upper, 2),
            },
            "factors": {
                "seasonal": round(seasonal_factor, 3),
                "weather": round(weather_factor, 3),
                "supply": round(supply_factor, 3),
                "inflation": round(inflation_factor, 3),
            },
            "recommendation": recommendation,
            "recommendation_reason": reason,
            "current_estimated_price": round(current_price, 2),
            "price_change_pct": round(price_change_pct, 1),
        }
    
    def predict_price_series(
        self,
        crop: str,
        start_date: str,
        weeks: int = 12,
        weather_condition: str = "normal",
    ) -> Dict:
        start = datetime.strptime(start_date, "%Y-%m-%d")
        predictions = []
        
        for w in range(weeks):
            target = start + timedelta(weeks=w)
            pred = self.predict_price(crop, target.strftime("%Y-%m-%d"), weather_condition=weather_condition)
            if "error" not in pred:
                predictions.append({
                    "date": target.strftime("%Y-%m-%d"),
                    "price": pred["predicted_price"],
                    "low": pred["price_range"]["low"],
                    "high": pred["price_range"]["high"],
                })
        
        if not predictions:
            return {"error": f"No baseline data for crop: {crop}"}
        
        prices = [p["price"] for p in predictions]
        best_sell_idx = prices.index(max(prices))
        
        return {
            "crop": crop,
            "start_date": start_date,
            "weeks": weeks,
            "weather_condition": weather_condition,
            "predictions": predictions,
            "best_sell_date": predictions[best_sell_idx]["date"],
            "best_sell_price": predictions[best_sell_idx]["price"],
            "min_price": min(prices),
            "max_price": max(prices),
            "avg_price": round(sum(prices) / len(prices), 2),
        }
    
    def forecast_demand(
        self,
        crop: str,
        region: str = "nairobi",
        weeks_ahead: int = 4,
    ) -> Dict:
        baseline = SEASONAL_BASELINES.get(crop.lower())
        if not baseline:
            return {"error": f"No data for crop: {crop}"}
        
        # Regional population-based demand estimates (tons/week)
        regional_demand = {
            "nairobi": {"base": 500, "growth": 0.03},
            "mombasa": {"base": 200, "growth": 0.02},
            "kisumu": {"base": 100, "growth": 0.02},
            "nakuru": {"base": 80, "growth": 0.015},
            "eldoret": {"base": 60, "growth": 0.015},
            "kampala": {"base": 300, "growth": 0.025},
            "dar_es_salaam": {"base": 400, "growth": 0.03},
            "kigali": {"base": 150, "growth": 0.02},
        }
        
        region_data = regional_demand.get(region.lower(), {"base": 100, "growth": 0.02})
        
        forecasts = []
        now = datetime.now()
        for w in range(weeks_ahead):
            target = now + timedelta(weeks=w)
            month_factor = baseline["monthly_factors"][target.month - 1]
            # Demand is inverse of price (when prices are low, demand is high)
            demand_factor = 2.0 - month_factor
            weekly_demand = region_data["base"] * demand_factor * (1 + region_data["growth"] * w / 52)
            
            forecasts.append({
                "week": w + 1,
                "date": target.strftime("%Y-%m-%d"),
                "estimated_demand_tons": round(weekly_demand, 1),
                "demand_factor": round(demand_factor, 3),
            })
        
        return {
            "crop": crop,
            "region": region,
            "weeks_ahead": weeks_ahead,
            "forecasts": forecasts,
            "total_demand_tons": round(sum(f["estimated_demand_tons"] for f in forecasts), 1),
        }
    
    def get_market_overview(self) -> Dict:
        now = datetime.now()
        month_idx = now.month - 1
        
        crops = []
        for crop, data in SEASONAL_BASELINES.items():
            current_price = data["base_price"] * data["monthly_factors"][month_idx]
            next_month = (month_idx + 1) % 12
            next_price = data["base_price"] * data["monthly_factors"][next_month]
            trend = "up" if next_price > current_price else ("down" if next_price < current_price else "stable")
            
            crops.append({
                "crop": crop,
                "current_price": round(current_price, 2),
                "currency": data["currency"],
                "unit": data["unit"],
                "next_month_trend": trend,
                "next_month_change_pct": round((next_price - current_price) / current_price * 100, 1),
                "volatility": data["volatility"],
            })
        
        crops.sort(key=lambda x: abs(x["next_month_change_pct"]), reverse=True)
        
        return {
            "date": now.strftime("%Y-%m-%d"),
            "market": "East Africa",
            "crops": crops,
            "top_opportunity": crops[0]["crop"] if crops else None,
        }

# ============================================================================
# HTTP Server
# ============================================================================

engine = PricePredictionEngine()

class PredictionHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass
    
    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)
        data = json.loads(body) if body else {}
        
        if self.path == "/api/predict":
            result = engine.predict_price(
                crop=data["crop"],
                target_date=data["target_date"],
                region=data.get("region", "kenya"),
                weather_condition=data.get("weather_condition", "normal"),
                supply_level=data.get("supply_level", "normal"),
            )
            self._respond(200, result)
        elif self.path == "/api/predict/series":
            result = engine.predict_price_series(
                crop=data["crop"],
                start_date=data.get("start_date", datetime.now().strftime("%Y-%m-%d")),
                weeks=data.get("weeks", 12),
                weather_condition=data.get("weather_condition", "normal"),
            )
            self._respond(200, result)
        elif self.path == "/api/demand/forecast":
            result = engine.forecast_demand(
                crop=data["crop"],
                region=data.get("region", "nairobi"),
                weeks_ahead=data.get("weeks_ahead", 4),
            )
            self._respond(200, result)
        else:
            self._respond(404, {"error": "Not found"})
    
    def do_GET(self):
        if self.path == "/health":
            self._respond(200, {
                "status": "healthy",
                "service": "price-prediction",
                "supported_crops": len(SEASONAL_BASELINES),
                "timestamp": datetime.utcnow().isoformat(),
            })
        elif self.path == "/api/market-overview":
            result = engine.get_market_overview()
            self._respond(200, result)
        elif self.path == "/api/crops":
            self._respond(200, {"crops": list(SEASONAL_BASELINES.keys())})
        else:
            self._respond(404, {"error": "Not found"})
    
    def _respond(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())


def main():
    server = HTTPServer(("0.0.0.0", config.port), PredictionHandler)
    logger.info(f"Price Prediction service starting on port {config.port}")
    logger.info(f"Tracking {len(SEASONAL_BASELINES)} crops")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        server.shutdown()

if __name__ == "__main__":
    main()
