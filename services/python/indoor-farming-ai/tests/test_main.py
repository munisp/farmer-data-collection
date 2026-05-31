"""Tests for Indoor Farming AI Service"""
import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import (
    INDOOR_CROP_PROFILES,
    calculate_environment_score,
    generate_adjustments,
    predict_yield,
    classify_growth_stage,
)


class TestCropProfiles:
    def test_all_crops_have_required_fields(self):
        required = ["category", "grow_days", "stages", "temp_range", "humidity_range",
                     "ph_range", "ec_range", "dli_range", "photoperiod_hours", "co2_ppm",
                     "water_usage_l_per_kg", "yield_per_sqm_kg", "nutrient_profile", "grow_media"]
        for crop, profile in INDOOR_CROP_PROFILES.items():
            for field in required:
                assert field in profile, f"{crop} missing {field}"

    def test_crop_count(self):
        assert len(INDOOR_CROP_PROFILES) == 8

    def test_range_fields_have_min_max_optimal(self):
        range_fields = ["temp_range", "humidity_range", "ph_range", "ec_range", "dli_range"]
        for crop, profile in INDOOR_CROP_PROFILES.items():
            for field in range_fields:
                rng = profile[field]
                assert "min" in rng and "max" in rng and "optimal" in rng, f"{crop}.{field} missing keys"
                assert rng["min"] <= rng["optimal"] <= rng["max"], f"{crop}.{field} ordering invalid"


class TestEnvironmentScore:
    def test_optimal_conditions(self):
        profile = INDOOR_CROP_PROFILES["lettuce"]
        score = calculate_environment_score(profile, 20, 60, 6.0, 1.0, 14)
        assert score >= 95

    def test_poor_conditions(self):
        profile = INDOOR_CROP_PROFILES["lettuce"]
        score = calculate_environment_score(profile, 35, 90, 4.0, 3.0, 5)
        assert score < 50

    def test_score_range(self):
        profile = INDOOR_CROP_PROFILES["basil"]
        score = calculate_environment_score(profile, 25, 50, 6.0, 1.2, 18)
        assert 0 <= score <= 100


class TestAdjustments:
    def test_no_adjustments_optimal(self):
        profile = INDOOR_CROP_PROFILES["lettuce"]
        adj = generate_adjustments(profile, 20, 60, 6.0, 1.0)
        assert len(adj) == 0

    def test_temperature_too_high(self):
        profile = INDOOR_CROP_PROFILES["lettuce"]
        adj = generate_adjustments(profile, 30, 60, 6.0, 1.0)
        assert any(a["parameter"] == "temperature" and a["action"] == "decrease" for a in adj)

    def test_ph_too_low(self):
        profile = INDOOR_CROP_PROFILES["basil"]
        adj = generate_adjustments(profile, 25, 50, 4.0, 1.2)
        assert any(a["parameter"] == "ph" and a["action"] == "increase" for a in adj)

    def test_ec_too_high(self):
        profile = INDOOR_CROP_PROFILES["spinach"]
        adj = generate_adjustments(profile, 17, 55, 6.5, 3.0)
        assert any(a["parameter"] == "ec" and a["action"] == "decrease" for a in adj)


class TestYieldPrediction:
    def test_optimal_yield(self):
        profile = INDOOR_CROP_PROFILES["lettuce"]
        y = predict_yield(profile, 10, 100, "nft")
        assert y == pytest.approx(35.0, abs=1.0)

    def test_reduced_yield_poor_env(self):
        profile = INDOOR_CROP_PROFILES["lettuce"]
        y_good = predict_yield(profile, 10, 100, "nft")
        y_bad = predict_yield(profile, 10, 50, "nft")
        assert y_bad < y_good

    def test_media_factor(self):
        profile = INDOOR_CROP_PROFILES["basil"]
        y_nft = predict_yield(profile, 10, 100, "nft")
        y_soil = predict_yield(profile, 10, 100, "soil")
        assert y_soil < y_nft


class TestGrowthStage:
    def test_early_germination(self):
        profile = INDOOR_CROP_PROFILES["lettuce"]
        stage, idx, _, _ = classify_growth_stage(profile, 2)
        assert stage == "germination"
        assert idx == 0

    def test_harvest_stage(self):
        profile = INDOOR_CROP_PROFILES["lettuce"]
        stage, idx, _, _ = classify_growth_stage(profile, 34)
        assert stage == "harvest"
        assert idx == len(profile["stages"]) - 1

    def test_microgreen_stages(self):
        profile = INDOOR_CROP_PROFILES["microgreens"]
        stage, idx, _, _ = classify_growth_stage(profile, 1)
        assert stage == "soak"

        stage, _, _, _ = classify_growth_stage(profile, 11)
        assert stage == "harvest"
