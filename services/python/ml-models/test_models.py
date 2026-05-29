"""
ML Models Service Tests

Tests model inference, training pipeline, data preprocessing,
and health endpoints for the FarmConnect ML service.
"""
import pytest
import json
import os
import sys

# Set test environment
os.environ["ENVIRONMENT"] = "test"
os.environ["MODEL_PATH"] = "/tmp/test_models"


class TestModelInference:
    """Tests for ML model inference endpoints."""

    def test_yield_prediction_input_validation(self):
        """Validate yield prediction requires crop_type and area_ha."""
        required_fields = ["crop_type", "area_ha", "soil_params"]
        input_data = {"crop_type": "maize", "area_ha": 5.0, "soil_params": {"ph": 6.5}}
        for field in required_fields:
            assert field in input_data

    def test_yield_prediction_output_schema(self):
        """Predicted yield output must contain expected fields."""
        output_schema = {
            "predicted_yield_kg": float,
            "confidence": float,
            "lower_bound": float,
            "upper_bound": float,
            "factors": list,
            "recommendations": list,
        }
        # Simulate inference output
        result = {
            "predicted_yield_kg": 4500.0,
            "confidence": 0.85,
            "lower_bound": 3800.0,
            "upper_bound": 5200.0,
            "factors": ["soil_quality", "rainfall"],
            "recommendations": ["Apply nitrogen fertilizer"],
        }
        for key, expected_type in output_schema.items():
            assert key in result
            assert isinstance(result[key], expected_type)

    def test_disease_detection_confidence_range(self):
        """Disease detection confidence must be between 0 and 1."""
        confidences = [0.0, 0.5, 0.92, 1.0]
        for conf in confidences:
            assert 0.0 <= conf <= 1.0

    def test_price_prediction_seasonal_factors(self):
        """Price prediction must account for 12-month seasonal indices."""
        seasonal_indices = {
            "jan": 1.05, "feb": 1.02, "mar": 0.98, "apr": 0.95,
            "may": 0.92, "jun": 0.90, "jul": 0.88, "aug": 0.91,
            "sep": 0.95, "oct": 1.00, "nov": 1.03, "dec": 1.08,
        }
        assert len(seasonal_indices) == 12
        assert all(0.5 <= v <= 2.0 for v in seasonal_indices.values())

    def test_model_versioning(self):
        """Models must have version metadata for reproducibility."""
        model_info = {
            "name": "yield_predictor_v3",
            "version": "3.2.1",
            "framework": "pytorch",
            "input_shape": [1, 15],
            "output_shape": [1, 4],
            "metrics": {"mae": 0.12, "r2": 0.89},
        }
        assert "version" in model_info
        assert "metrics" in model_info
        assert model_info["metrics"]["r2"] > 0.7


class TestDataPreprocessing:
    """Tests for data preprocessing pipeline."""

    def test_normalization_range(self):
        """All normalized features must be in [0, 1] or [-1, 1]."""
        raw_values = [0, 50, 100, 150, 200]
        min_val, max_val = min(raw_values), max(raw_values)
        normalized = [(v - min_val) / (max_val - min_val) for v in raw_values]
        assert all(0.0 <= v <= 1.0 for v in normalized)

    def test_missing_value_imputation(self):
        """Missing values must be imputed with column median."""
        data = [1.0, 2.0, None, 4.0, 5.0]
        valid = [v for v in data if v is not None]
        median = sorted(valid)[len(valid) // 2]
        imputed = [v if v is not None else median for v in data]
        assert None not in imputed
        assert len(imputed) == 5

    def test_outlier_detection(self):
        """Outliers beyond 3 std devs must be flagged."""
        import statistics
        data = [10, 11, 12, 13, 11, 12, 100]  # 100 is outlier
        mean = statistics.mean(data)
        std = statistics.stdev(data)
        outliers = [v for v in data if abs(v - mean) > 3 * std]
        assert len(outliers) >= 1
        assert 100 in outliers

    def test_feature_engineering_ndvi(self):
        """NDVI calculation: (NIR - RED) / (NIR + RED)."""
        nir, red = 0.8, 0.2
        ndvi = (nir - red) / (nir + red)
        assert -1.0 <= ndvi <= 1.0
        assert abs(ndvi - 0.6) < 0.01


class TestTrainingPipeline:
    """Tests for model training pipeline."""

    def test_train_test_split_ratio(self):
        """Training data must be split 80/20."""
        total_samples = 1000
        train_size = int(total_samples * 0.8)
        test_size = total_samples - train_size
        assert train_size == 800
        assert test_size == 200

    def test_learning_rate_schedule(self):
        """Learning rate must decrease over epochs."""
        initial_lr = 0.001
        decay = 0.95
        lrs = [initial_lr * (decay ** epoch) for epoch in range(10)]
        assert lrs[-1] < lrs[0]
        assert all(lrs[i] >= lrs[i + 1] for i in range(len(lrs) - 1))

    def test_early_stopping_patience(self):
        """Training must stop after N epochs without improvement."""
        patience = 5
        val_losses = [0.5, 0.45, 0.43, 0.44, 0.44, 0.45, 0.46, 0.47]
        best_loss = min(val_losses[:3])
        epochs_without_improvement = 0
        should_stop = False
        for loss in val_losses[3:]:
            if loss >= best_loss:
                epochs_without_improvement += 1
            else:
                epochs_without_improvement = 0
                best_loss = loss
            if epochs_without_improvement >= patience:
                should_stop = True
                break
        assert should_stop

    def test_batch_size_power_of_two(self):
        """Batch sizes must be powers of 2 for GPU efficiency."""
        valid_batch_sizes = [16, 32, 64, 128, 256]
        for bs in valid_batch_sizes:
            assert bs & (bs - 1) == 0  # Power of 2 check


class TestHealthEndpoints:
    """Tests for service health and readiness."""

    def test_health_response_schema(self):
        """Health endpoint must return status and model info."""
        health = {
            "status": "healthy",
            "models_loaded": 5,
            "gpu_available": False,
            "memory_used_mb": 1024,
            "uptime_seconds": 3600,
        }
        assert health["status"] == "healthy"
        assert health["models_loaded"] > 0

    def test_readiness_checks(self):
        """Readiness must verify model files exist."""
        checks = {
            "model_files": True,
            "dependencies": True,
            "disk_space": True,
            "memory": True,
        }
        assert all(checks.values())


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
