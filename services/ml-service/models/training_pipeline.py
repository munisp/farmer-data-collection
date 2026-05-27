"""
Training Pipeline Module
Complete ML training pipeline with:
1. Data generation and augmentation
2. Model training with hyperparameter tuning
3. Cross-validation and evaluation
4. Model versioning and tracking
5. Automated retraining schedules
"""

import os
import json
import logging
import numpy as np
import joblib
from typing import Dict, List, Tuple, Optional, Any, Callable
from pathlib import Path
from datetime import datetime
import hashlib

from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.model_selection import (
    train_test_split, cross_val_score, GridSearchCV, 
    StratifiedKFold, learning_curve
)
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, classification_report, roc_auc_score
)

logger = logging.getLogger(__name__)


class TrainingPipeline:
    """
    Production-ready ML training pipeline
    
    Features:
    - Automated data generation for African agricultural datasets
    - Hyperparameter tuning with cross-validation
    - Model versioning and experiment tracking
    - Learning curve analysis
    - Automated model selection
    """
    
    def __init__(self, output_dir: str = None):
        self.output_dir = Path(output_dir or os.path.dirname(__file__)) / "trained"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        self.experiments_dir = self.output_dir / "experiments"
        self.experiments_dir.mkdir(parents=True, exist_ok=True)
        
        self.training_history: List[Dict] = []
        self.best_models: Dict[str, Dict] = {}
    
    def generate_african_agricultural_dataset(
        self,
        task: str,
        n_samples: int = 5000,
        regions: List[str] = None,
        crops: List[str] = None
    ) -> Tuple[np.ndarray, np.ndarray, Dict]:
        """
        Generate synthetic dataset based on African agricultural patterns
        
        Args:
            task: 'disease_detection', 'pest_identification', 'yield_prediction'
            n_samples: Number of samples to generate
            regions: List of regions to include
            crops: List of crops to include
        
        Returns:
            Tuple of (features, labels, metadata)
        """
        np.random.seed(42)
        
        if regions is None:
            regions = ['west_africa', 'east_africa', 'southern_africa', 'central_africa']
        
        if crops is None:
            crops = ['maize', 'cassava', 'rice', 'sorghum', 'beans', 'millet', 'yam']
        
        logger.info(f"Generating {task} dataset with {n_samples} samples...")
        
        if task == 'disease_detection':
            return self._generate_disease_dataset(n_samples, regions, crops)
        elif task == 'pest_identification':
            return self._generate_pest_dataset(n_samples, regions, crops)
        elif task == 'yield_prediction':
            return self._generate_yield_dataset(n_samples, regions, crops)
        else:
            raise ValueError(f"Unknown task: {task}")
    
    def _generate_disease_dataset(
        self,
        n_samples: int,
        regions: List[str],
        crops: List[str]
    ) -> Tuple[np.ndarray, np.ndarray, Dict]:
        """Generate disease detection dataset"""
        # Disease classes per crop
        disease_classes = {
            'maize': ['healthy', 'northern_leaf_blight', 'common_rust', 'gray_leaf_spot', 
                     'maize_streak_virus', 'fall_armyworm_damage'],
            'cassava': ['healthy', 'cassava_mosaic_disease', 'cassava_bacterial_blight',
                       'cassava_brown_streak', 'anthracnose'],
            'rice': ['healthy', 'rice_blast', 'bacterial_leaf_blight', 'brown_spot',
                    'sheath_blight'],
            'sorghum': ['healthy', 'anthracnose', 'leaf_blight', 'grain_mold'],
            'beans': ['healthy', 'angular_leaf_spot', 'bean_rust', 'common_bacterial_blight']
        }
        
        # Feature dimensions
        n_color_features = 96  # 32 bins * 3 channels
        n_texture_features = 14
        n_shape_features = 9
        n_features = n_color_features + n_texture_features + n_shape_features + 12  # + color stats
        
        X = []
        y = []
        metadata = {
            'task': 'disease_detection',
            'n_samples': n_samples,
            'n_features': n_features,
            'regions': regions,
            'crops': crops,
            'classes': [],
            'class_distribution': {}
        }
        
        # Generate samples for each crop
        samples_per_crop = n_samples // len(crops)
        
        for crop in crops:
            if crop not in disease_classes:
                continue
                
            diseases = disease_classes[crop]
            samples_per_disease = samples_per_crop // len(diseases)
            
            for disease_idx, disease in enumerate(diseases):
                for _ in range(samples_per_disease):
                    # Generate features based on disease characteristics
                    features = self._generate_disease_features(disease, crop, n_features)
                    
                    # Add regional variation
                    region = np.random.choice(regions)
                    features = self._add_regional_variation(features, region)
                    
                    X.append(features)
                    y.append(f"{crop}_{disease}")
                    
                    # Track class distribution
                    class_name = f"{crop}_{disease}"
                    metadata['class_distribution'][class_name] = \
                        metadata['class_distribution'].get(class_name, 0) + 1
        
        metadata['classes'] = list(set(y))
        metadata['n_classes'] = len(metadata['classes'])
        
        return np.array(X), np.array(y), metadata
    
    def _generate_disease_features(self, disease: str, crop: str, n_features: int) -> np.ndarray:
        """Generate realistic disease features"""
        features = np.random.randn(n_features) * 0.1
        
        # Base healthy plant signature
        if disease == 'healthy':
            features[32:64] += 0.5  # High green channel
            features[-9] = np.random.uniform(0.0, 0.05)  # Low affected area
        
        # Disease-specific patterns
        elif 'blight' in disease or 'spot' in disease:
            features[:32] += 0.3  # Brown/yellow (red channel)
            features[-9] = np.random.uniform(0.15, 0.4)
            
        elif 'rust' in disease:
            features[:32] += 0.4  # Orange/rust
            features[32:64] += 0.2
            features[-9] = np.random.uniform(0.2, 0.5)
            
        elif 'mosaic' in disease or 'virus' in disease:
            features[96:108] += np.random.randn(12) * 0.3  # Texture variation
            features[-9] = np.random.uniform(0.3, 0.6)
            
        elif 'armyworm' in disease or 'damage' in disease:
            features[-9] = np.random.uniform(0.1, 0.35)
            features[-8:-5] = np.random.uniform(0.2, 0.8, 3)
        
        # Add noise
        features += np.random.randn(n_features) * 0.05
        
        return features
    
    def _generate_pest_dataset(
        self,
        n_samples: int,
        regions: List[str],
        crops: List[str]
    ) -> Tuple[np.ndarray, np.ndarray, Dict]:
        """Generate pest identification dataset"""
        pest_classes = [
            'no_pest', 'fall_armyworm', 'desert_locust', 'aphids',
            'maize_stem_borer', 'whitefly', 'mealybug', 'spider_mite',
            'thrips', 'bean_fly', 'grasshopper', 'cutworm'
        ]
        
        n_features = 150
        
        X = []
        y = []
        
        samples_per_class = n_samples // len(pest_classes)
        
        for pest_idx, pest in enumerate(pest_classes):
            for _ in range(samples_per_class):
                features = self._generate_pest_features(pest, n_features)
                region = np.random.choice(regions)
                features = self._add_regional_variation(features, region)
                
                X.append(features)
                y.append(pest)
        
        metadata = {
            'task': 'pest_identification',
            'n_samples': len(X),
            'n_features': n_features,
            'regions': regions,
            'classes': pest_classes,
            'n_classes': len(pest_classes)
        }
        
        return np.array(X), np.array(y), metadata
    
    def _generate_pest_features(self, pest: str, n_features: int) -> np.ndarray:
        """Generate realistic pest features"""
        features = np.random.randn(n_features) * 0.1
        
        if pest == 'no_pest':
            features[32:64] += 0.4  # Healthy green
        elif pest == 'fall_armyworm':
            features[:32] += 0.2
            features[-10] = np.random.uniform(0.15, 0.35)
        elif 'locust' in pest:
            features[:96] -= 0.1  # Defoliation
            features[-10] = np.random.uniform(0.3, 0.6)
        elif pest == 'aphids':
            features[64:96] += 0.1  # Honeydew shine
        elif pest == 'whitefly':
            features[:96] += 0.15  # White bodies
        
        features += np.random.randn(n_features) * 0.05
        return features
    
    def _generate_yield_dataset(
        self,
        n_samples: int,
        regions: List[str],
        crops: List[str]
    ) -> Tuple[np.ndarray, np.ndarray, Dict]:
        """Generate yield prediction dataset with regional calibration"""
        # Regional yield factors (kg/hectare base yields)
        regional_yields = {
            'west_africa': {'maize': 2500, 'cassava': 12000, 'rice': 2800, 'sorghum': 1200},
            'east_africa': {'maize': 2200, 'cassava': 10000, 'rice': 3500, 'sorghum': 1500},
            'southern_africa': {'maize': 3000, 'cassava': 8000, 'rice': 2500, 'sorghum': 1800},
            'central_africa': {'maize': 2000, 'cassava': 15000, 'rice': 2200, 'sorghum': 1000}
        }
        
        # Features: farm_size, rainfall, temperature, soil_quality, fertilizer_use,
        #           irrigation, pest_pressure, disease_pressure, planting_date_optimal,
        #           crop_variety_improved
        n_features = 15
        
        X = []
        y = []
        
        for _ in range(n_samples):
            region = np.random.choice(regions)
            crop = np.random.choice(crops)
            
            # Generate agronomic features
            features = [
                np.random.uniform(0.5, 10),  # farm_size (hectares)
                np.random.uniform(400, 1500),  # rainfall (mm)
                np.random.uniform(20, 35),  # temperature (C)
                np.random.uniform(0.3, 1.0),  # soil_quality (0-1)
                np.random.uniform(0, 200),  # fertilizer_use (kg/ha)
                np.random.choice([0, 1], p=[0.7, 0.3]),  # irrigation (binary)
                np.random.uniform(0, 1),  # pest_pressure (0-1)
                np.random.uniform(0, 1),  # disease_pressure (0-1)
                np.random.choice([0, 1], p=[0.4, 0.6]),  # planting_date_optimal
                np.random.choice([0, 1], p=[0.5, 0.5]),  # improved_variety
                # Encoded features
                regions.index(region),  # region_encoded
                crops.index(crop) if crop in crops else 0,  # crop_encoded
                np.random.uniform(0, 1),  # labor_availability
                np.random.uniform(0, 1),  # market_access
                np.random.uniform(0, 1),  # extension_services
            ]
            
            # Calculate yield based on features
            base_yield = regional_yields.get(region, {}).get(crop, 2000)
            
            # Apply factors
            yield_kg = base_yield * features[0]  # Scale by farm size
            
            # Rainfall factor
            if 800 <= features[1] <= 1200:
                yield_kg *= 1.2
            elif features[1] < 600 or features[1] > 1400:
                yield_kg *= 0.7
            
            # Temperature factor
            if 25 <= features[2] <= 30:
                yield_kg *= 1.1
            elif features[2] < 20 or features[2] > 33:
                yield_kg *= 0.8
            
            # Other factors
            yield_kg *= features[3]  # Soil quality
            yield_kg *= (1 + features[4] / 500)  # Fertilizer effect
            yield_kg *= (1.3 if features[5] else 1.0)  # Irrigation
            yield_kg *= (1 - features[6] * 0.3)  # Pest pressure
            yield_kg *= (1 - features[7] * 0.25)  # Disease pressure
            yield_kg *= (1.15 if features[8] else 0.9)  # Planting date
            yield_kg *= (1.2 if features[9] else 1.0)  # Improved variety
            
            # Add noise
            yield_kg *= np.random.uniform(0.85, 1.15)
            
            X.append(features)
            y.append(max(0, yield_kg))
        
        metadata = {
            'task': 'yield_prediction',
            'n_samples': n_samples,
            'n_features': n_features,
            'regions': regions,
            'crops': crops,
            'feature_names': [
                'farm_size', 'rainfall', 'temperature', 'soil_quality',
                'fertilizer_use', 'irrigation', 'pest_pressure', 'disease_pressure',
                'planting_date_optimal', 'improved_variety', 'region_encoded',
                'crop_encoded', 'labor_availability', 'market_access', 'extension_services'
            ],
            'regional_base_yields': regional_yields
        }
        
        return np.array(X), np.array(y), metadata
    
    def _add_regional_variation(self, features: np.ndarray, region: str) -> np.ndarray:
        """Add regional variation to features"""
        regional_factors = {
            'west_africa': 0.02,
            'east_africa': -0.01,
            'southern_africa': 0.01,
            'central_africa': -0.02
        }
        
        factor = regional_factors.get(region, 0)
        features = features + np.random.randn(len(features)) * abs(factor)
        
        return features
    
    def train_model(
        self,
        X: np.ndarray,
        y: np.ndarray,
        task: str,
        model_name: str,
        hyperparameter_tuning: bool = True,
        cv_folds: int = 5
    ) -> Dict:
        """
        Train a model with optional hyperparameter tuning
        
        Args:
            X: Feature matrix
            y: Labels
            task: 'classification' or 'regression'
            model_name: Name for the trained model
            hyperparameter_tuning: Whether to perform grid search
            cv_folds: Number of cross-validation folds
        
        Returns:
            Dictionary with training results and model info
        """
        start_time = datetime.now()
        experiment_id = hashlib.md5(f"{model_name}_{start_time}".encode()).hexdigest()[:12]
        
        logger.info(f"Training {model_name} (experiment: {experiment_id})...")
        
        # Encode labels if classification
        label_encoder = None
        if task == 'classification':
            label_encoder = LabelEncoder()
            y_encoded = label_encoder.fit_transform(y)
        else:
            y_encoded = y
        
        # Scale features
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X_scaled, y_encoded, test_size=0.2, random_state=42,
            stratify=y_encoded if task == 'classification' else None
        )
        
        # Define model and parameters
        if task == 'classification':
            base_model = RandomForestClassifier(random_state=42, n_jobs=-1)
            param_grid = {
                'n_estimators': [100, 200],
                'max_depth': [10, 20, None],
                'min_samples_split': [2, 5],
                'min_samples_leaf': [1, 2]
            }
        else:
            from sklearn.ensemble import RandomForestRegressor
            base_model = RandomForestRegressor(random_state=42, n_jobs=-1)
            param_grid = {
                'n_estimators': [100, 200],
                'max_depth': [10, 20, None],
                'min_samples_split': [2, 5]
            }
        
        # Train with or without hyperparameter tuning
        if hyperparameter_tuning:
            logger.info("Performing hyperparameter tuning...")
            
            cv = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=42) \
                if task == 'classification' else cv_folds
            
            grid_search = GridSearchCV(
                base_model, param_grid, cv=cv,
                scoring='f1_weighted' if task == 'classification' else 'r2',
                n_jobs=-1, verbose=0
            )
            grid_search.fit(X_train, y_train)
            
            model = grid_search.best_estimator_
            best_params = grid_search.best_params_
            cv_score = grid_search.best_score_
        else:
            model = base_model
            model.fit(X_train, y_train)
            best_params = {}
            cv_scores = cross_val_score(model, X_train, y_train, cv=cv_folds)
            cv_score = cv_scores.mean()
        
        # Evaluate on test set
        y_pred = model.predict(X_test)
        
        if task == 'classification':
            metrics = {
                'accuracy': accuracy_score(y_test, y_pred),
                'precision': precision_score(y_test, y_pred, average='weighted'),
                'recall': recall_score(y_test, y_pred, average='weighted'),
                'f1_score': f1_score(y_test, y_pred, average='weighted'),
                'cv_score': cv_score
            }
            
            # ROC AUC for binary or multiclass
            if hasattr(model, 'predict_proba'):
                y_proba = model.predict_proba(X_test)
                if len(np.unique(y_test)) == 2:
                    metrics['roc_auc'] = roc_auc_score(y_test, y_proba[:, 1])
                else:
                    metrics['roc_auc'] = roc_auc_score(
                        y_test, y_proba, multi_class='ovr', average='weighted'
                    )
        else:
            from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
            metrics = {
                'mse': mean_squared_error(y_test, y_pred),
                'rmse': np.sqrt(mean_squared_error(y_test, y_pred)),
                'mae': mean_absolute_error(y_test, y_pred),
                'r2': r2_score(y_test, y_pred),
                'cv_score': cv_score
            }
        
        training_time = (datetime.now() - start_time).total_seconds()
        
        # Save model
        model_path = self.output_dir / f"{model_name}_v{experiment_id}.pkl"
        joblib.dump({
            'model': model,
            'scaler': scaler,
            'label_encoder': label_encoder,
            'metrics': metrics,
            'best_params': best_params,
            'experiment_id': experiment_id,
            'trained_at': datetime.utcnow().isoformat()
        }, model_path)
        
        # Save experiment metadata
        experiment_data = {
            'experiment_id': experiment_id,
            'model_name': model_name,
            'task': task,
            'n_samples': len(X),
            'n_features': X.shape[1],
            'metrics': metrics,
            'best_params': best_params,
            'training_time_seconds': training_time,
            'model_path': str(model_path),
            'trained_at': datetime.utcnow().isoformat()
        }
        
        experiment_path = self.experiments_dir / f"{experiment_id}.json"
        with open(experiment_path, 'w') as f:
            json.dump(experiment_data, f, indent=2)
        
        self.training_history.append(experiment_data)
        
        # Track best model
        metric_key = 'f1_score' if task == 'classification' else 'r2'
        if model_name not in self.best_models or \
           metrics[metric_key] > self.best_models[model_name].get('metrics', {}).get(metric_key, 0):
            self.best_models[model_name] = experiment_data
        
        logger.info(f"Training complete - {metric_key}: {metrics[metric_key]:.4f}")
        
        return experiment_data
    
    def analyze_learning_curve(
        self,
        model: Any,
        X: np.ndarray,
        y: np.ndarray,
        cv: int = 5
    ) -> Dict:
        """
        Analyze learning curve to detect overfitting/underfitting
        
        Returns:
            Dictionary with learning curve data and analysis
        """
        train_sizes, train_scores, test_scores = learning_curve(
            model, X, y, cv=cv,
            train_sizes=np.linspace(0.1, 1.0, 10),
            scoring='f1_weighted' if hasattr(model, 'predict_proba') else 'r2',
            n_jobs=-1
        )
        
        train_mean = train_scores.mean(axis=1)
        train_std = train_scores.std(axis=1)
        test_mean = test_scores.mean(axis=1)
        test_std = test_scores.std(axis=1)
        
        # Analyze curve
        gap = train_mean[-1] - test_mean[-1]
        
        if gap > 0.1:
            diagnosis = "overfitting"
            recommendation = "Increase regularization, reduce model complexity, or get more data"
        elif test_mean[-1] < 0.7:
            diagnosis = "underfitting"
            recommendation = "Increase model complexity, add more features, or reduce regularization"
        else:
            diagnosis = "good_fit"
            recommendation = "Model is well-fitted"
        
        return {
            'train_sizes': train_sizes.tolist(),
            'train_scores_mean': train_mean.tolist(),
            'train_scores_std': train_std.tolist(),
            'test_scores_mean': test_mean.tolist(),
            'test_scores_std': test_std.tolist(),
            'final_train_score': float(train_mean[-1]),
            'final_test_score': float(test_mean[-1]),
            'generalization_gap': float(gap),
            'diagnosis': diagnosis,
            'recommendation': recommendation
        }
    
    def get_training_history(self) -> List[Dict]:
        """Get all training experiments"""
        return self.training_history
    
    def get_best_model(self, model_name: str) -> Optional[Dict]:
        """Get the best performing model for a given name"""
        return self.best_models.get(model_name)
    
    def compare_experiments(self, experiment_ids: List[str]) -> Dict:
        """Compare multiple experiments"""
        experiments = []
        
        for exp_id in experiment_ids:
            exp_path = self.experiments_dir / f"{exp_id}.json"
            if exp_path.exists():
                with open(exp_path) as f:
                    experiments.append(json.load(f))
        
        if not experiments:
            return {'error': 'No experiments found'}
        
        # Compare metrics
        comparison = {
            'experiments': experiments,
            'best_by_metric': {}
        }
        
        metrics = experiments[0].get('metrics', {}).keys()
        for metric in metrics:
            best_exp = max(experiments, key=lambda x: x.get('metrics', {}).get(metric, 0))
            comparison['best_by_metric'][metric] = {
                'experiment_id': best_exp['experiment_id'],
                'value': best_exp['metrics'][metric]
            }
        
        return comparison


# Singleton instance
_pipeline: Optional[TrainingPipeline] = None

def get_training_pipeline() -> TrainingPipeline:
    """Get or create the training pipeline singleton"""
    global _pipeline
    if _pipeline is None:
        model_dir = os.path.join(os.path.dirname(__file__), "trained")
        os.makedirs(model_dir, exist_ok=True)
        _pipeline = TrainingPipeline(model_dir)
    return _pipeline


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    pipeline = get_training_pipeline()
    
    # Test disease detection training
    print("\n=== Training Disease Detection Model ===")
    X, y, metadata = pipeline.generate_african_agricultural_dataset(
        'disease_detection', n_samples=2000
    )
    print(f"Generated {len(X)} samples with {metadata['n_classes']} classes")
    
    result = pipeline.train_model(
        X, y, 'classification', 'disease_detector',
        hyperparameter_tuning=False  # Fast training for test
    )
    print(f"Accuracy: {result['metrics']['accuracy']:.4f}")
    print(f"F1 Score: {result['metrics']['f1_score']:.4f}")
    
    # Test yield prediction training
    print("\n=== Training Yield Prediction Model ===")
    X, y, metadata = pipeline.generate_african_agricultural_dataset(
        'yield_prediction', n_samples=2000
    )
    print(f"Generated {len(X)} samples")
    
    result = pipeline.train_model(
        X, y, 'regression', 'yield_predictor',
        hyperparameter_tuning=False
    )
    print(f"R2 Score: {result['metrics']['r2']:.4f}")
    print(f"RMSE: {result['metrics']['rmse']:.2f}")
