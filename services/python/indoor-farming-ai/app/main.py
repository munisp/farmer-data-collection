"""
Indoor Farming AI Service — Controlled Environment Agriculture (CEA)

AI/ML service for urban vertical farming:
  - Grow recipe optimization (nutrients, pH, EC, lighting schedules)
  - Indoor crop health assessment via image analysis
  - CEA yield prediction (correlating environment to output)
  - Optimal planting schedule for indoor crops
  - Resource usage forecasting (water, energy, nutrients)
  - Growth stage classification for leafy greens, herbs, microgreens

Port: 8112
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
import os
import math
import logging
import hashlib
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Indoor Farming AI Service",
    description="AI/ML for urban vertical farming and controlled environment agriculture",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Crop Knowledge Base — Indoor/CEA-specific profiles
# ============================================================================

INDOOR_CROP_PROFILES: Dict[str, Dict[str, Any]] = {
    "lettuce": {
        "category": "leafy_green",
        "grow_days": 35,
        "stages": ["germination", "seedling", "vegetative", "heading", "harvest"],
        "temp_range": {"min": 15, "max": 24, "optimal": 20},
        "humidity_range": {"min": 50, "max": 70, "optimal": 60},
        "ph_range": {"min": 5.5, "max": 6.5, "optimal": 6.0},
        "ec_range": {"min": 0.8, "max": 1.2, "optimal": 1.0},
        "dli_range": {"min": 12, "max": 17, "optimal": 14},
        "photoperiod_hours": 16,
        "co2_ppm": 1000,
        "water_usage_l_per_kg": 20,
        "yield_per_sqm_kg": 3.5,
        "nutrient_profile": {"N": 150, "P": 50, "K": 200, "Ca": 150, "Mg": 50, "Fe": 5},
        "grow_media": ["rockwool", "coco_coir", "nft", "dwc"],
    },
    "kale": {
        "category": "leafy_green",
        "grow_days": 55,
        "stages": ["germination", "seedling", "vegetative", "mature", "harvest"],
        "temp_range": {"min": 15, "max": 25, "optimal": 18},
        "humidity_range": {"min": 45, "max": 65, "optimal": 55},
        "ph_range": {"min": 5.5, "max": 6.5, "optimal": 6.0},
        "ec_range": {"min": 1.0, "max": 1.8, "optimal": 1.4},
        "dli_range": {"min": 14, "max": 20, "optimal": 17},
        "photoperiod_hours": 16,
        "co2_ppm": 1000,
        "water_usage_l_per_kg": 25,
        "yield_per_sqm_kg": 2.8,
        "nutrient_profile": {"N": 180, "P": 60, "K": 220, "Ca": 180, "Mg": 60, "Fe": 6},
        "grow_media": ["rockwool", "coco_coir", "nft"],
    },
    "basil": {
        "category": "herb",
        "grow_days": 28,
        "stages": ["germination", "seedling", "vegetative", "mature", "harvest"],
        "temp_range": {"min": 20, "max": 30, "optimal": 25},
        "humidity_range": {"min": 40, "max": 60, "optimal": 50},
        "ph_range": {"min": 5.5, "max": 6.5, "optimal": 6.0},
        "ec_range": {"min": 1.0, "max": 1.6, "optimal": 1.2},
        "dli_range": {"min": 14, "max": 22, "optimal": 18},
        "photoperiod_hours": 16,
        "co2_ppm": 1200,
        "water_usage_l_per_kg": 15,
        "yield_per_sqm_kg": 2.5,
        "nutrient_profile": {"N": 160, "P": 45, "K": 190, "Ca": 120, "Mg": 40, "Fe": 4},
        "grow_media": ["rockwool", "nft", "dwc"],
    },
    "spinach": {
        "category": "leafy_green",
        "grow_days": 40,
        "stages": ["germination", "seedling", "vegetative", "mature", "harvest"],
        "temp_range": {"min": 12, "max": 22, "optimal": 17},
        "humidity_range": {"min": 45, "max": 65, "optimal": 55},
        "ph_range": {"min": 6.0, "max": 7.0, "optimal": 6.5},
        "ec_range": {"min": 1.2, "max": 2.0, "optimal": 1.6},
        "dli_range": {"min": 10, "max": 16, "optimal": 13},
        "photoperiod_hours": 14,
        "co2_ppm": 800,
        "water_usage_l_per_kg": 22,
        "yield_per_sqm_kg": 3.0,
        "nutrient_profile": {"N": 170, "P": 55, "K": 210, "Ca": 160, "Mg": 55, "Fe": 7},
        "grow_media": ["rockwool", "coco_coir", "nft", "dwc"],
    },
    "microgreens": {
        "category": "microgreen",
        "grow_days": 12,
        "stages": ["soak", "germination", "blackout", "greening", "harvest"],
        "temp_range": {"min": 18, "max": 24, "optimal": 21},
        "humidity_range": {"min": 50, "max": 80, "optimal": 65},
        "ph_range": {"min": 5.5, "max": 6.5, "optimal": 6.0},
        "ec_range": {"min": 0.5, "max": 1.0, "optimal": 0.8},
        "dli_range": {"min": 10, "max": 14, "optimal": 12},
        "photoperiod_hours": 14,
        "co2_ppm": 800,
        "water_usage_l_per_kg": 8,
        "yield_per_sqm_kg": 1.5,
        "nutrient_profile": {"N": 100, "P": 30, "K": 120, "Ca": 80, "Mg": 30, "Fe": 3},
        "grow_media": ["hemp_mat", "coco_coir", "soil"],
    },
    "strawberry": {
        "category": "fruit",
        "grow_days": 90,
        "stages": ["transplant", "vegetative", "flowering", "fruiting", "harvest"],
        "temp_range": {"min": 15, "max": 26, "optimal": 22},
        "humidity_range": {"min": 60, "max": 75, "optimal": 65},
        "ph_range": {"min": 5.5, "max": 6.5, "optimal": 5.8},
        "ec_range": {"min": 1.0, "max": 2.0, "optimal": 1.5},
        "dli_range": {"min": 16, "max": 24, "optimal": 20},
        "photoperiod_hours": 16,
        "co2_ppm": 1000,
        "water_usage_l_per_kg": 35,
        "yield_per_sqm_kg": 4.0,
        "nutrient_profile": {"N": 120, "P": 80, "K": 250, "Ca": 160, "Mg": 50, "Fe": 5},
        "grow_media": ["coco_coir", "perlite"],
    },
    "mint": {
        "category": "herb",
        "grow_days": 30,
        "stages": ["cutting", "rooting", "vegetative", "mature", "harvest"],
        "temp_range": {"min": 18, "max": 26, "optimal": 22},
        "humidity_range": {"min": 50, "max": 70, "optimal": 60},
        "ph_range": {"min": 5.5, "max": 6.5, "optimal": 6.0},
        "ec_range": {"min": 1.0, "max": 1.6, "optimal": 1.3},
        "dli_range": {"min": 12, "max": 18, "optimal": 15},
        "photoperiod_hours": 16,
        "co2_ppm": 1000,
        "water_usage_l_per_kg": 18,
        "yield_per_sqm_kg": 2.0,
        "nutrient_profile": {"N": 140, "P": 40, "K": 180, "Ca": 110, "Mg": 45, "Fe": 4},
        "grow_media": ["rockwool", "nft", "dwc"],
    },
    "cherry_tomato": {
        "category": "fruit",
        "grow_days": 75,
        "stages": ["seedling", "vegetative", "flowering", "fruiting", "harvest"],
        "temp_range": {"min": 18, "max": 28, "optimal": 24},
        "humidity_range": {"min": 55, "max": 75, "optimal": 65},
        "ph_range": {"min": 5.5, "max": 6.5, "optimal": 6.0},
        "ec_range": {"min": 1.5, "max": 3.0, "optimal": 2.2},
        "dli_range": {"min": 20, "max": 30, "optimal": 25},
        "photoperiod_hours": 18,
        "co2_ppm": 1200,
        "water_usage_l_per_kg": 30,
        "yield_per_sqm_kg": 5.0,
        "nutrient_profile": {"N": 200, "P": 80, "K": 300, "Ca": 200, "Mg": 60, "Fe": 6},
        "grow_media": ["rockwool", "coco_coir", "dutch_bucket"],
    },
}

# ============================================================================
# Request / Response Models
# ============================================================================

class GrowRecipeRequest(BaseModel):
    crop: str = Field(..., description="Crop name (e.g., lettuce, basil, kale)")
    grow_media: str = Field(default="nft", description="Growing medium (nft, dwc, rockwool, coco_coir)")
    space_sqm: float = Field(default=10.0, gt=0, description="Growing area in square meters")
    target_yield_kg: Optional[float] = Field(None, description="Target yield in kg (optional)")
    growth_stage: Optional[str] = Field(None, description="Current growth stage")
    current_temp: Optional[float] = Field(None, description="Current temperature (°C)")
    current_humidity: Optional[float] = Field(None, description="Current humidity (%)")
    current_ph: Optional[float] = Field(None, description="Current pH level")
    current_ec: Optional[float] = Field(None, description="Current EC (mS/cm)")

class GrowRecipeResponse(BaseModel):
    success: bool
    crop: str
    recipe: Dict[str, Any]
    adjustments: List[Dict[str, Any]]
    estimated_yield_kg: float
    estimated_days: int
    resource_forecast: Dict[str, Any]

class CropHealthRequest(BaseModel):
    crop: str
    temperature: float
    humidity: float
    ph: float
    ec: float
    light_dli: float
    co2_ppm: Optional[float] = None
    leaf_color: Optional[str] = None
    growth_rate_mm_per_day: Optional[float] = None
    days_since_planting: int = 0

class CropHealthResponse(BaseModel):
    success: bool
    overall_score: float
    status: str
    issues: List[Dict[str, Any]]
    recommendations: List[str]

class YieldPredictionRequest(BaseModel):
    crop: str
    space_sqm: float
    temperature: float
    humidity: float
    ph: float
    ec: float
    light_dli: float
    co2_ppm: float = 800
    grow_media: str = "nft"
    days_growing: int = 0

class YieldPredictionResponse(BaseModel):
    success: bool
    predicted_yield_kg: float
    confidence: float
    yield_per_sqm: float
    days_to_harvest: int
    optimal_vs_actual: Dict[str, Any]
    improvement_potential_pct: float

class PlantingScheduleRequest(BaseModel):
    crops: List[str]
    total_space_sqm: float
    target_weekly_harvest_kg: float
    max_concurrent_crops: int = 4

class PlantingScheduleResponse(BaseModel):
    success: bool
    schedule: List[Dict[str, Any]]
    weekly_yield_projection: List[Dict[str, Any]]
    space_utilization_pct: float
    crops_in_rotation: int

class ResourceForecastRequest(BaseModel):
    crop: str
    space_sqm: float
    grow_days: int
    grow_media: str = "nft"

class ResourceForecastResponse(BaseModel):
    success: bool
    water_liters: float
    energy_kwh: float
    nutrients: Dict[str, float]
    co2_kg: float
    cost_estimate: Dict[str, float]

class GrowthStageRequest(BaseModel):
    crop: str
    days_since_planting: int
    height_cm: Optional[float] = None
    leaf_count: Optional[int] = None
    root_length_cm: Optional[float] = None

class GrowthStageResponse(BaseModel):
    success: bool
    predicted_stage: str
    stage_index: int
    total_stages: int
    days_in_current_stage: int
    days_to_next_stage: int
    stage_specific_advice: List[str]


# ============================================================================
# AI/ML Logic
# ============================================================================

def calculate_environment_score(
    crop_profile: Dict, temp: float, humidity: float, ph: float, ec: float, dli: float
) -> float:
    """Score 0-100 based on how close conditions are to optimal."""
    scores = []

    def range_score(value: float, rng: Dict) -> float:
        optimal = rng["optimal"]
        low = rng["min"]
        high = rng["max"]
        if value < low or value > high:
            deviation = min(abs(value - low), abs(value - high))
            span = (high - low) / 2
            return max(0, 100 - (deviation / span) * 100)
        deviation = abs(value - optimal)
        span = max(optimal - low, high - optimal)
        return 100 - (deviation / span) * 50 if span > 0 else 100

    scores.append(range_score(temp, crop_profile["temp_range"]))
    scores.append(range_score(humidity, crop_profile["humidity_range"]))
    scores.append(range_score(ph, crop_profile["ph_range"]))
    scores.append(range_score(ec, crop_profile["ec_range"]))
    scores.append(range_score(dli, crop_profile["dli_range"]))

    weights = [0.25, 0.15, 0.2, 0.2, 0.2]
    return sum(s * w for s, w in zip(scores, weights))


def generate_adjustments(
    crop_profile: Dict, temp: float, humidity: float, ph: float, ec: float
) -> List[Dict[str, Any]]:
    """Generate actionable adjustments."""
    adjustments = []

    if temp < crop_profile["temp_range"]["min"]:
        adjustments.append({
            "parameter": "temperature",
            "action": "increase",
            "current": temp,
            "target": crop_profile["temp_range"]["optimal"],
            "priority": "high",
            "method": "Increase HVAC set-point or add grow lights for radiant heat",
        })
    elif temp > crop_profile["temp_range"]["max"]:
        adjustments.append({
            "parameter": "temperature",
            "action": "decrease",
            "current": temp,
            "target": crop_profile["temp_range"]["optimal"],
            "priority": "high",
            "method": "Increase ventilation, reduce light intensity, or activate cooling",
        })

    if humidity < crop_profile["humidity_range"]["min"]:
        adjustments.append({
            "parameter": "humidity",
            "action": "increase",
            "current": humidity,
            "target": crop_profile["humidity_range"]["optimal"],
            "priority": "medium",
            "method": "Enable humidifier or misting system",
        })
    elif humidity > crop_profile["humidity_range"]["max"]:
        adjustments.append({
            "parameter": "humidity",
            "action": "decrease",
            "current": humidity,
            "target": crop_profile["humidity_range"]["optimal"],
            "priority": "medium",
            "method": "Increase air circulation and dehumidifier output",
        })

    if ph < crop_profile["ph_range"]["min"]:
        adjustments.append({
            "parameter": "ph",
            "action": "increase",
            "current": ph,
            "target": crop_profile["ph_range"]["optimal"],
            "priority": "high",
            "method": "Add pH Up (potassium hydroxide) to nutrient solution",
        })
    elif ph > crop_profile["ph_range"]["max"]:
        adjustments.append({
            "parameter": "ph",
            "action": "decrease",
            "current": ph,
            "target": crop_profile["ph_range"]["optimal"],
            "priority": "high",
            "method": "Add pH Down (phosphoric acid) to nutrient solution",
        })

    if ec < crop_profile["ec_range"]["min"]:
        adjustments.append({
            "parameter": "ec",
            "action": "increase",
            "current": ec,
            "target": crop_profile["ec_range"]["optimal"],
            "priority": "medium",
            "method": "Add concentrated nutrient stock solution",
        })
    elif ec > crop_profile["ec_range"]["max"]:
        adjustments.append({
            "parameter": "ec",
            "action": "decrease",
            "current": ec,
            "target": crop_profile["ec_range"]["optimal"],
            "priority": "medium",
            "method": "Dilute with fresh water or flush and replace solution",
        })

    return adjustments


def predict_yield(
    crop_profile: Dict,
    space_sqm: float,
    env_score: float,
    grow_media: str,
) -> float:
    """Predict yield based on environment optimality."""
    base_yield = crop_profile["yield_per_sqm_kg"] * space_sqm
    env_factor = env_score / 100.0

    media_factors = {
        "nft": 1.0, "dwc": 1.05, "rockwool": 0.95,
        "coco_coir": 0.90, "soil": 0.75, "perlite": 0.88,
        "hemp_mat": 0.85, "dutch_bucket": 1.0,
    }
    media_factor = media_factors.get(grow_media, 0.9)

    return round(base_yield * env_factor * media_factor, 2)


def classify_growth_stage(crop_profile: Dict, days: int) -> tuple:
    """Classify growth stage based on days since planting."""
    stages = crop_profile["stages"]
    total_days = crop_profile["grow_days"]
    days_per_stage = total_days / len(stages)

    stage_idx = min(int(days / days_per_stage), len(stages) - 1)
    stage = stages[stage_idx]
    days_in_stage = int(days - stage_idx * days_per_stage)
    days_to_next = int(days_per_stage - days_in_stage) if stage_idx < len(stages) - 1 else 0

    return stage, stage_idx, days_in_stage, days_to_next


# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "indoor-farming-ai",
        "port": 8112,
        "supported_crops": list(INDOOR_CROP_PROFILES.keys()),
        "model_version": "1.0.0",
    }

@app.get("/api/crops")
def list_crops():
    """List all supported indoor crops with basic profiles."""
    return {
        "crops": [
            {
                "name": name,
                "category": p["category"],
                "grow_days": p["grow_days"],
                "yield_per_sqm_kg": p["yield_per_sqm_kg"],
                "stages": p["stages"],
                "grow_media": p["grow_media"],
            }
            for name, p in INDOOR_CROP_PROFILES.items()
        ]
    }

@app.get("/api/crops/{crop_name}")
def get_crop_profile(crop_name: str):
    """Get detailed profile for a specific crop."""
    profile = INDOOR_CROP_PROFILES.get(crop_name.lower())
    if not profile:
        raise HTTPException(404, f"Crop '{crop_name}' not found. Available: {list(INDOOR_CROP_PROFILES.keys())}")
    return {"crop": crop_name.lower(), "profile": profile}


@app.post("/api/grow-recipe", response_model=GrowRecipeResponse)
def generate_grow_recipe(req: GrowRecipeRequest):
    """Generate an optimized grow recipe for a specific crop and setup."""
    profile = INDOOR_CROP_PROFILES.get(req.crop.lower())
    if not profile:
        raise HTTPException(404, f"Crop '{req.crop}' not supported")

    adjustments = []
    if req.current_temp is not None and req.current_ph is not None and req.current_ec is not None:
        adjustments = generate_adjustments(
            profile,
            req.current_temp,
            req.current_humidity or profile["humidity_range"]["optimal"],
            req.current_ph,
            req.current_ec,
        )

    env_score = 100.0
    if req.current_temp is not None:
        env_score = calculate_environment_score(
            profile,
            req.current_temp,
            req.current_humidity or profile["humidity_range"]["optimal"],
            req.current_ph or profile["ph_range"]["optimal"],
            req.current_ec or profile["ec_range"]["optimal"],
            profile["dli_range"]["optimal"],
        )

    estimated_yield = predict_yield(profile, req.space_sqm, env_score, req.grow_media)
    water_total = profile["water_usage_l_per_kg"] * estimated_yield
    energy_kwh = req.space_sqm * profile["photoperiod_hours"] * profile["grow_days"] * 0.04

    return GrowRecipeResponse(
        success=True,
        crop=req.crop.lower(),
        recipe={
            "environment": {
                "temperature_c": profile["temp_range"],
                "humidity_pct": profile["humidity_range"],
                "co2_ppm": profile["co2_ppm"],
            },
            "nutrient_solution": {
                "ph": profile["ph_range"],
                "ec_ms_cm": profile["ec_range"],
                "nutrients_ppm": profile["nutrient_profile"],
            },
            "lighting": {
                "dli_mol_m2_day": profile["dli_range"],
                "photoperiod_hours": profile["photoperiod_hours"],
                "spectrum": "full_spectrum_led",
                "recommended_ppfd": int(profile["dli_range"]["optimal"] * 1000000 / (profile["photoperiod_hours"] * 3600)),
            },
            "grow_media": req.grow_media,
            "grow_stages": profile["stages"],
            "total_days": profile["grow_days"],
        },
        adjustments=adjustments,
        estimated_yield_kg=estimated_yield,
        estimated_days=profile["grow_days"],
        resource_forecast={
            "water_liters": round(water_total, 1),
            "energy_kwh": round(energy_kwh, 1),
            "nutrient_solution_liters": round(water_total * 1.1, 1),
        },
    )


@app.post("/api/crop-health", response_model=CropHealthResponse)
def assess_crop_health(req: CropHealthRequest):
    """Assess crop health based on environmental sensor data."""
    profile = INDOOR_CROP_PROFILES.get(req.crop.lower())
    if not profile:
        raise HTTPException(404, f"Crop '{req.crop}' not supported")

    score = calculate_environment_score(
        profile, req.temperature, req.humidity, req.ph, req.ec, req.light_dli
    )

    issues = []
    recommendations = []

    adjustments = generate_adjustments(profile, req.temperature, req.humidity, req.ph, req.ec)
    for adj in adjustments:
        issues.append({
            "parameter": adj["parameter"],
            "severity": adj["priority"],
            "current": adj["current"],
            "target": adj["target"],
            "description": adj["method"],
        })
        recommendations.append(adj["method"])

    # CO2 check
    if req.co2_ppm is not None and req.co2_ppm < profile["co2_ppm"] * 0.7:
        issues.append({
            "parameter": "co2",
            "severity": "medium",
            "current": req.co2_ppm,
            "target": profile["co2_ppm"],
            "description": "CO2 levels below optimal for photosynthesis",
        })
        recommendations.append(f"Increase CO2 enrichment to {profile['co2_ppm']} ppm")

    # Leaf color check
    if req.leaf_color and req.leaf_color.lower() in ["yellow", "brown", "pale"]:
        issues.append({
            "parameter": "leaf_color",
            "severity": "high",
            "current": req.leaf_color,
            "target": "dark_green",
            "description": f"Abnormal leaf color ({req.leaf_color}) may indicate nutrient deficiency",
        })
        recommendations.append("Check nitrogen and iron levels in nutrient solution")

    status = "healthy" if score >= 80 else "attention_needed" if score >= 60 else "critical"

    return CropHealthResponse(
        success=True,
        overall_score=round(score, 1),
        status=status,
        issues=issues,
        recommendations=recommendations if recommendations else ["All parameters within optimal range"],
    )


@app.post("/api/yield-prediction", response_model=YieldPredictionResponse)
def predict_yield_endpoint(req: YieldPredictionRequest):
    """Predict expected yield based on current growing conditions."""
    profile = INDOOR_CROP_PROFILES.get(req.crop.lower())
    if not profile:
        raise HTTPException(404, f"Crop '{req.crop}' not supported")

    env_score = calculate_environment_score(
        profile, req.temperature, req.humidity, req.ph, req.ec, req.light_dli
    )

    predicted = predict_yield(profile, req.space_sqm, env_score, req.grow_media)
    optimal = predict_yield(profile, req.space_sqm, 100.0, req.grow_media)
    improvement = round((optimal - predicted) / optimal * 100, 1) if optimal > 0 else 0

    days_remaining = max(0, profile["grow_days"] - req.days_growing)

    return YieldPredictionResponse(
        success=True,
        predicted_yield_kg=predicted,
        confidence=round(min(95, 60 + env_score * 0.35), 1),
        yield_per_sqm=round(predicted / req.space_sqm, 2) if req.space_sqm > 0 else 0,
        days_to_harvest=days_remaining,
        optimal_vs_actual={
            "optimal_yield_kg": optimal,
            "actual_yield_kg": predicted,
            "environment_score": round(env_score, 1),
            "gap_pct": improvement,
        },
        improvement_potential_pct=improvement,
    )


@app.post("/api/planting-schedule", response_model=PlantingScheduleResponse)
def generate_planting_schedule(req: PlantingScheduleRequest):
    """Generate a staggered planting schedule for continuous harvesting."""
    schedule = []
    weekly_projections = []
    total_space_used = 0

    valid_crops = [c for c in req.crops if c.lower() in INDOOR_CROP_PROFILES]
    if not valid_crops:
        raise HTTPException(400, "No valid crops provided")

    space_per_crop = req.total_space_sqm / min(len(valid_crops), req.max_concurrent_crops)
    week = 0

    for crop_name in valid_crops[:req.max_concurrent_crops]:
        profile = INDOOR_CROP_PROFILES[crop_name.lower()]
        harvest_interval = max(7, profile["grow_days"] // 4)
        batches_needed = max(1, math.ceil(profile["grow_days"] / harvest_interval))
        batch_space = space_per_crop / batches_needed

        for batch in range(batches_needed):
            plant_week = week + batch * (harvest_interval // 7)
            harvest_week = plant_week + math.ceil(profile["grow_days"] / 7)

            schedule.append({
                "crop": crop_name.lower(),
                "batch": batch + 1,
                "plant_week": plant_week,
                "harvest_week": harvest_week,
                "space_sqm": round(batch_space, 1),
                "expected_yield_kg": round(profile["yield_per_sqm_kg"] * batch_space, 1),
                "grow_days": profile["grow_days"],
            })
            total_space_used += batch_space

    # Weekly yield projection (12 weeks)
    for w in range(12):
        weekly_yield = 0
        for entry in schedule:
            if entry["harvest_week"] == w:
                weekly_yield += entry["expected_yield_kg"]
        weekly_projections.append({
            "week": w,
            "projected_yield_kg": round(weekly_yield, 1),
            "target_met": weekly_yield >= req.target_weekly_harvest_kg,
        })

    return PlantingScheduleResponse(
        success=True,
        schedule=schedule,
        weekly_yield_projection=weekly_projections,
        space_utilization_pct=round(min(100, total_space_used / req.total_space_sqm * 100), 1),
        crops_in_rotation=len(valid_crops[:req.max_concurrent_crops]),
    )


@app.post("/api/resource-forecast", response_model=ResourceForecastResponse)
def forecast_resources(req: ResourceForecastRequest):
    """Forecast resource consumption for a grow cycle."""
    profile = INDOOR_CROP_PROFILES.get(req.crop.lower())
    if not profile:
        raise HTTPException(404, f"Crop '{req.crop}' not supported")

    estimated_yield = profile["yield_per_sqm_kg"] * req.space_sqm
    water = profile["water_usage_l_per_kg"] * estimated_yield
    energy = req.space_sqm * profile["photoperiod_hours"] * req.grow_days * 0.04
    co2 = req.space_sqm * (profile["co2_ppm"] / 1000) * req.grow_days * 0.001

    nutrients = {}
    for nutrient, ppm in profile["nutrient_profile"].items():
        nutrients[nutrient] = round(ppm * water / 1000, 2)

    water_cost_per_l = 0.05
    energy_cost_per_kwh = 15.0
    nutrient_cost = sum(nutrients.values()) * 0.5

    return ResourceForecastResponse(
        success=True,
        water_liters=round(water, 1),
        energy_kwh=round(energy, 1),
        nutrients=nutrients,
        co2_kg=round(co2, 2),
        cost_estimate={
            "water_kes": round(water * water_cost_per_l, 0),
            "energy_kes": round(energy * energy_cost_per_kwh, 0),
            "nutrients_kes": round(nutrient_cost, 0),
            "total_kes": round(water * water_cost_per_l + energy * energy_cost_per_kwh + nutrient_cost, 0),
            "cost_per_kg_kes": round(
                (water * water_cost_per_l + energy * energy_cost_per_kwh + nutrient_cost) / max(estimated_yield, 0.1), 0
            ),
            "currency": "KES",
        },
    )


@app.post("/api/growth-stage", response_model=GrowthStageResponse)
def classify_growth(req: GrowthStageRequest):
    """Classify the current growth stage and provide stage-specific advice."""
    profile = INDOOR_CROP_PROFILES.get(req.crop.lower())
    if not profile:
        raise HTTPException(404, f"Crop '{req.crop}' not supported")

    stage, stage_idx, days_in_stage, days_to_next = classify_growth_stage(
        profile, req.days_since_planting
    )

    advice_map = {
        "germination": [
            "Keep growing medium consistently moist but not waterlogged",
            "Maintain darkness or very low light until sprouts emerge",
            "Temperature is critical — keep within 2°C of optimal",
        ],
        "seedling": [
            "Gradually increase light intensity over 3-5 days",
            "Start with half-strength nutrient solution",
            "Monitor for damping-off disease — ensure good air circulation",
        ],
        "vegetative": [
            "Full nutrient strength — focus on nitrogen for leaf growth",
            "Increase photoperiod to maximum for this crop",
            "Prune lower leaves to improve airflow",
        ],
        "mature": [
            "Maintain consistent conditions — avoid stress",
            "Reduce nitrogen slightly, increase potassium",
            "Monitor for pest pressure as plant density increases",
        ],
        "harvest": [
            "Harvest in early morning when leaves are most turgid",
            "Use clean, sharp tools to minimize damage",
            "Cool immediately to 2-5°C for maximum shelf life",
        ],
        "flowering": [
            "Switch to bloom nutrient formula (higher P and K)",
            "Consider light spectrum shift to include more red",
            "Ensure pollination — use manual pollination or fans",
        ],
        "fruiting": [
            "Support heavy branches — use trellising or clips",
            "Increase potassium for fruit development",
            "Monitor EC closely — fruiting crops need higher EC",
        ],
        "soak": ["Soak seeds for 8-12 hours in clean water", "Use filtered water at room temperature"],
        "blackout": ["Cover trays to block all light", "Mist 2-3 times daily"],
        "greening": ["Expose to light for 4-6 hours per day", "Begin light nutrient solution"],
        "heading": ["Reduce temperature by 2°C to encourage heading", "Monitor for tipburn (calcium deficiency)"],
        "transplant": ["Handle roots gently during transplant", "Water immediately after transplanting"],
        "cutting": ["Take cuttings from healthy parent plants", "Use rooting hormone for faster establishment"],
        "rooting": ["Keep humidity high (80%+) until roots establish", "Minimal nutrient solution during rooting"],
    }

    return GrowthStageResponse(
        success=True,
        predicted_stage=stage,
        stage_index=stage_idx,
        total_stages=len(profile["stages"]),
        days_in_current_stage=days_in_stage,
        days_to_next_stage=days_to_next,
        stage_specific_advice=advice_map.get(stage, ["Monitor conditions and maintain optimal parameters"]),
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8112"))
    uvicorn.run(app, host="0.0.0.0", port=port)
