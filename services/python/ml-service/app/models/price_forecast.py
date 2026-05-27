import os
import joblib
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List
import logging

logger = logging.getLogger(__name__)

class PriceForecaster:
    """
    Price forecasting model using simple moving average and trend analysis
    
    Forecasts crop prices based on historical price data
    """
    
    def __init__(self, model_path: str = None):
        self.model_path = model_path or os.path.join(
            os.path.dirname(__file__), 
            "../../trained_models/price_forecast_model.pkl"
        )
        self.model_loaded = True  # Simple model, always available
    
    def forecast(self, input_data: Dict) -> Dict:
        """
        Forecast crop prices for the next N days
        
        Uses simple moving average and trend analysis
        """
        historical_prices = input_data['historical_prices']
        forecast_days = input_data['forecast_days']
        
        if not historical_prices or len(historical_prices) < 3:
            raise ValueError("Need at least 3 historical price points")
        
        # Convert to DataFrame
        df = pd.DataFrame(historical_prices)
        df['date'] = pd.to_datetime(df['date'])
        df = df.sort_values('date')
        
        # Calculate moving average and trend
        prices = df['price'].values
        
        # Simple moving average (7-day window)
        window = min(7, len(prices))
        moving_avg = np.convolve(prices, np.ones(window)/window, mode='valid')
        last_ma = moving_avg[-1] if len(moving_avg) > 0 else prices[-1]
        
        # Calculate trend (linear regression slope)
        x = np.arange(len(prices))
        coeffs = np.polyfit(x, prices, 1)
        trend_slope = coeffs[0]
        
        # Determine trend direction
        if trend_slope > 1:
            trend = "increasing"
        elif trend_slope < -1:
            trend = "decreasing"
        else:
            trend = "stable"
        
        # Generate forecast
        forecast = []
        last_date = df['date'].iloc[-1]
        last_price = prices[-1]
        
        for i in range(1, forecast_days + 1):
            # Forecast date
            forecast_date = last_date + timedelta(days=i)
            
            # Simple forecast: moving average + trend + some randomness
            base_forecast = last_ma + (trend_slope * i)
            
            # Add seasonal variation (±5%)
            seasonal_factor = 1 + np.sin(i / 7) * 0.05
            
            # Add random noise (±3%)
            noise_factor = 1 + np.random.uniform(-0.03, 0.03)
            
            predicted_price = base_forecast * seasonal_factor * noise_factor
            
            # Ensure price doesn't go negative
            predicted_price = max(0, predicted_price)
            
            # Confidence decreases with forecast horizon
            confidence = max(0.5, 0.9 - (i / forecast_days) * 0.3)
            
            forecast.append({
                "date": forecast_date.strftime("%Y-%m-%d"),
                "predictedPrice": round(predicted_price, 2),
                "confidence": round(confidence, 2)
            })
        
        # Generate recommendation
        recommendation = self._generate_recommendation(
            trend, 
            last_price, 
            forecast[0]['predictedPrice'] if forecast else last_price
        )
        
        return {
            'forecast': forecast,
            'trend': trend,
            'recommendation': recommendation
        }
    
    def _generate_recommendation(self, trend: str, current_price: float, next_price: float) -> str:
        """Generate trading recommendation based on forecast"""
        price_change_pct = ((next_price - current_price) / current_price) * 100
        
        if trend == "increasing":
            if price_change_pct > 5:
                return "Strong upward trend - consider holding for better prices"
            else:
                return "Moderate upward trend - good time to sell"
        elif trend == "decreasing":
            if price_change_pct < -5:
                return "Prices declining - sell soon to avoid losses"
            else:
                return "Slight downward trend - monitor closely"
        else:
            return "Stable prices - sell when convenient"
    
    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self.model_loaded
    
    def get_features(self) -> List[str]:
        """Get list of model features"""
        return ['historical_prices', 'forecast_days', 'crop', 'location']
    
    def retrain(self):
        """Retrain model (placeholder for simple model)"""
        logger.info("Price forecast model doesn't require retraining (rule-based)")
        pass
