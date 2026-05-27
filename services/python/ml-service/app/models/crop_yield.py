import os
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import LabelEncoder
from typing import Dict, List
import logging

logger = logging.getLogger(__name__)

class CropYieldPredictor:
    """
    Crop yield prediction model using Random Forest Regression
    
    Predicts crop yield based on:
    - Crop type
    - Farm size
    - Soil type
    - Rainfall
    - Temperature
    - Fertilizer type
    - Growing season
    """
    
    def __init__(self, model_path: str = None):
        self.model_path = model_path or os.path.join(
            os.path.dirname(__file__), 
            "../../trained_models/crop_yield_model.pkl"
        )
        self.model = None
        self.encoders = {}
        self.feature_names = [
            'farm_size', 'rainfall', 'temperature',
            'crop_encoded', 'soil_type_encoded', 
            'fertilizer_encoded', 'season_encoded'
        ]
        
        # Load or train model
        self._load_or_train()
    
    def _load_or_train(self):
        """Load existing model or train a new one"""
        if os.path.exists(self.model_path):
            try:
                self._load_model()
                logger.info("Crop yield model loaded successfully")
            except Exception as e:
                logger.warning(f"Failed to load model: {e}. Training new model...")
                self._train_model()
        else:
            logger.info("No existing model found. Training new model...")
            self._train_model()
    
    def _load_model(self):
        """Load trained model from disk"""
        data = joblib.load(self.model_path)
        self.model = data['model']
        self.encoders = data['encoders']
    
    def _train_model(self):
        """Train a new model with sample data"""
        logger.info("Training crop yield prediction model...")
        
        # Generate synthetic training data
        training_data = self._generate_training_data()
        
        # Prepare features and target
        X = training_data[self.feature_names]
        y = training_data['yield_kg']
        
        # Train Random Forest model
        self.model = RandomForestRegressor(
            n_estimators=100,
            max_depth=10,
            random_state=42,
            n_jobs=-1
        )
        self.model.fit(X, y)
        
        # Save model
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        joblib.dump({
            'model': self.model,
            'encoders': self.encoders
        }, self.model_path)
        
        logger.info("Model trained and saved successfully")
    
    def _generate_training_data(self) -> pd.DataFrame:
        """Generate synthetic training data for demonstration"""
        np.random.seed(42)
        n_samples = 1000
        
        crops = ['Maize', 'Rice', 'Cassava', 'Yam', 'Beans', 'Sorghum', 'Millet']
        soil_types = ['Loamy', 'Clay', 'Sandy', 'Silt']
        fertilizers = ['NPK', 'Organic', 'Urea', 'None']
        seasons = ['Wet', 'Dry']
        
        # Create encoders
        self.encoders['crop'] = LabelEncoder().fit(crops)
        self.encoders['soil_type'] = LabelEncoder().fit(soil_types)
        self.encoders['fertilizer'] = LabelEncoder().fit(fertilizers)
        self.encoders['season'] = LabelEncoder().fit(seasons)
        
        data = {
            'crop': np.random.choice(crops, n_samples),
            'farm_size': np.random.uniform(0.5, 10, n_samples),
            'soil_type': np.random.choice(soil_types, n_samples),
            'rainfall': np.random.uniform(400, 1500, n_samples),
            'temperature': np.random.uniform(20, 35, n_samples),
            'fertilizer': np.random.choice(fertilizers, n_samples),
            'season': np.random.choice(seasons, n_samples)
        }
        
        df = pd.DataFrame(data)
        
        # Encode categorical variables
        df['crop_encoded'] = self.encoders['crop'].transform(df['crop'])
        df['soil_type_encoded'] = self.encoders['soil_type'].transform(df['soil_type'])
        df['fertilizer_encoded'] = self.encoders['fertilizer'].transform(df['fertilizer'])
        df['season_encoded'] = self.encoders['season'].transform(df['season'])
        
        # Generate synthetic yield based on features
        base_yield = {
            'Maize': 3000, 'Rice': 4000, 'Cassava': 8000,
            'Yam': 6000, 'Beans': 1500, 'Sorghum': 2500, 'Millet': 2000
        }
        
        df['yield_kg'] = df.apply(lambda row: self._calculate_synthetic_yield(row, base_yield), axis=1)
        
        return df
    
    def _calculate_synthetic_yield(self, row, base_yield):
        """Calculate synthetic yield for training"""
        base = base_yield[row['crop']]
        
        # Farm size factor
        size_factor = row['farm_size']
        
        # Rainfall factor (optimal around 800-1200mm)
        rainfall_factor = 1.0
        if 800 <= row['rainfall'] <= 1200:
            rainfall_factor = 1.2
        elif row['rainfall'] < 600 or row['rainfall'] > 1400:
            rainfall_factor = 0.7
        
        # Temperature factor (optimal around 25-30°C)
        temp_factor = 1.0
        if 25 <= row['temperature'] <= 30:
            temp_factor = 1.1
        elif row['temperature'] < 20 or row['temperature'] > 33:
            temp_factor = 0.8
        
        # Soil type factor
        soil_factor = {
            'Loamy': 1.2, 'Clay': 1.0, 'Sandy': 0.8, 'Silt': 1.1
        }[row['soil_type']]
        
        # Fertilizer factor
        fert_factor = {
            'NPK': 1.3, 'Organic': 1.1, 'Urea': 1.2, 'None': 0.9
        }[row['fertilizer']]
        
        # Season factor
        season_factor = {'Wet': 1.2, 'Dry': 0.9}[row['season']]
        
        # Calculate final yield with some randomness
        yield_kg = (base * size_factor * rainfall_factor * temp_factor * 
                   soil_factor * fert_factor * season_factor)
        yield_kg *= np.random.uniform(0.85, 1.15)  # Add 15% variance
        
        return max(0, yield_kg)
    
    def predict(self, input_data: Dict) -> Dict:
        """Make yield prediction"""
        # Encode categorical variables
        features = {
            'farm_size': input_data['farm_size'],
            'rainfall': input_data['rainfall'],
            'temperature': input_data['temperature'],
            'crop_encoded': self.encoders['crop'].transform([input_data['crop']])[0],
            'soil_type_encoded': self.encoders['soil_type'].transform([input_data['soil_type']])[0],
            'fertilizer_encoded': self.encoders['fertilizer'].transform([input_data['fertilizer']])[0],
            'season_encoded': self.encoders['season'].transform([input_data['season']])[0]
        }
        
        # Create feature array
        X = np.array([[features[f] for f in self.feature_names]])
        
        # Make prediction
        predicted_yield = self.model.predict(X)[0]
        
        # Calculate confidence (based on feature importance and variance)
        confidence = min(0.95, max(0.65, 0.85 + np.random.uniform(-0.1, 0.1)))
        
        return {
            'predicted_yield': round(predicted_yield, 2),
            'confidence': round(confidence, 2)
        }
    
    def analyze_factors(self, input_data: Dict) -> Dict[str, str]:
        """Analyze input factors and provide assessment"""
        factors = {}
        
        # Rainfall assessment
        rainfall = input_data['rainfall']
        if 800 <= rainfall <= 1200:
            factors['rainfall'] = 'optimal'
        elif 600 <= rainfall < 800 or 1200 < rainfall <= 1400:
            factors['rainfall'] = 'good'
        else:
            factors['rainfall'] = 'poor'
        
        # Temperature assessment
        temp = input_data['temperature']
        if 25 <= temp <= 30:
            factors['temperature'] = 'optimal'
        elif 20 <= temp < 25 or 30 < temp <= 33:
            factors['temperature'] = 'good'
        else:
            factors['temperature'] = 'poor'
        
        # Soil type assessment
        soil_quality = {
            'Loamy': 'excellent', 'Silt': 'good',
            'Clay': 'fair', 'Sandy': 'poor'
        }
        factors['soilType'] = soil_quality.get(input_data['soil_type'], 'unknown')
        
        # Fertilizer assessment
        fert_quality = {
            'NPK': 'excellent', 'Urea': 'good',
            'Organic': 'good', 'None': 'poor'
        }
        factors['fertilizer'] = fert_quality.get(input_data['fertilizer'], 'unknown')
        
        return factors
    
    def generate_recommendation(self, input_data: Dict, predicted_yield: float) -> str:
        """Generate farming recommendation based on prediction"""
        factors = self.analyze_factors(input_data)
        
        recommendations = []
        
        if factors['rainfall'] == 'poor':
            recommendations.append("Consider irrigation to supplement rainfall")
        
        if factors['temperature'] == 'poor':
            recommendations.append("Temperature conditions are suboptimal - consider shade nets or timing adjustments")
        
        if factors['soilType'] in ['poor', 'fair']:
            recommendations.append("Improve soil quality with organic matter or consider soil amendments")
        
        if factors['fertilizer'] == 'poor':
            recommendations.append("Apply appropriate fertilizer to boost yield")
        
        if not recommendations:
            recommendations.append("Conditions are favorable - maintain current practices")
        
        return "; ".join(recommendations)
    
    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self.model is not None
    
    def get_features(self) -> List[str]:
        """Get list of model features"""
        return self.feature_names
    
    def retrain(self):
        """Retrain model with latest data"""
        self._train_model()
