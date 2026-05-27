"""
ML Models Package
Exposes all production-ready AI/ML models for the platform

Models:
- DiseaseDetectionModel: Crop disease detection from images
- PestIdentificationModel: Agricultural pest identification
- RegionalCropYieldModel: Yield prediction with regional calibration
- ModelOptimizer: Model optimization (quantization, pruning, compression)
- TrainingPipeline: Complete ML training pipeline
- ModelEvaluator: Comprehensive model evaluation and benchmarking
"""

from .disease_detection import (
    DiseaseDetectionModel,
    get_disease_model,
    DISEASE_CLASSES,
    TREATMENT_RECOMMENDATIONS
)

from .pest_identification import (
    PestIdentificationModel,
    get_pest_model,
    PEST_CLASSES,
    PEST_INFO
)

from .crop_yield_regional import (
    RegionalCropYieldModel,
    get_yield_model,
    REGIONAL_DATA,
    YIELD_FACTORS
)

from .model_optimization import (
    ModelOptimizer,
    get_optimizer
)

from .training_pipeline import (
    TrainingPipeline,
    get_training_pipeline
)

from .evaluation import (
    ModelEvaluator,
    get_evaluator,
    COMPETITOR_BENCHMARKS
)

__all__ = [
    # Disease Detection
    'DiseaseDetectionModel',
    'get_disease_model',
    'DISEASE_CLASSES',
    'TREATMENT_RECOMMENDATIONS',
    
    # Pest Identification
    'PestIdentificationModel',
    'get_pest_model',
    'PEST_CLASSES',
    'PEST_INFO',
    
    # Crop Yield Prediction
    'RegionalCropYieldModel',
    'get_yield_model',
    'REGIONAL_DATA',
    'YIELD_FACTORS',
    
    # Model Optimization
    'ModelOptimizer',
    'get_optimizer',
    
    # Training Pipeline
    'TrainingPipeline',
    'get_training_pipeline',
    
    # Evaluation
    'ModelEvaluator',
    'get_evaluator',
    'COMPETITOR_BENCHMARKS'
]

# Version info
__version__ = '1.0.0'
__author__ = 'Farmer Data Collection Platform'
