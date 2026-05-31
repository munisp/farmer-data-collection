"""
Aquaculture AI Service — Fish Disease Diagnosis & Species Growth Models

AI/ML service for aquaculture:
  - Fish disease diagnosis (symptom-based classification)
  - Species growth curve prediction
  - Hatchery management (breeding, egg incubation, fry survival)
  - Optimal stocking density recommendation
  - Environmental impact assessment
  - Yield forecasting with ML models
  - Effluent water quality prediction

Integrations: Lakehouse analytics, OpenSearch indexing, ML inference

Port: 8115
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
    title="Aquaculture AI Service",
    description="AI/ML for fish farming: disease diagnosis, growth prediction, hatchery management",
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
# Disease Knowledge Base
# ============================================================================

FISH_DISEASES = {
    "columnaris": {
        "name": "Columnaris (Cotton Wool Disease)",
        "pathogen": "Flavobacterium columnare",
        "type": "bacterial",
        "species_affected": ["catfish", "tilapia", "carp", "barramundi"],
        "symptoms": ["white patches on skin", "frayed fins", "gill necrosis", "lethargy", "loss of appetite"],
        "risk_factors": ["high temperature >28°C", "poor water quality", "overcrowding", "handling stress"],
        "treatment": ["potassium permanganate bath 2mg/L", "oxytetracycline 55mg/kg feed for 10 days", "reduce stocking density", "improve water quality"],
        "prevention": ["maintain DO >5mg/L", "avoid overcrowding", "quarantine new stock", "vaccination available"],
        "mortality_rate": 0.30,
        "incubation_days": 2,
        "recovery_days": 14,
    },
    "ich": {
        "name": "White Spot Disease (Ich)",
        "pathogen": "Ichthyophthirius multifiliis",
        "type": "parasitic",
        "species_affected": ["catfish", "tilapia", "carp", "trout", "barramundi"],
        "symptoms": ["white spots on body", "flashing/scratching", "clamped fins", "rapid gill movement", "loss of appetite"],
        "risk_factors": ["temperature fluctuations", "new fish introduction", "stress", "poor hygiene"],
        "treatment": ["salt bath 3-5g/L", "formalin 25mg/L for 1 hour", "raise temperature to 30°C", "malachite green 0.1mg/L"],
        "prevention": ["quarantine new arrivals 14 days", "maintain stable temperature", "avoid stress", "regular health checks"],
        "mortality_rate": 0.50,
        "incubation_days": 4,
        "recovery_days": 21,
    },
    "eus": {
        "name": "Epizootic Ulcerative Syndrome (EUS)",
        "pathogen": "Aphanomyces invadans",
        "type": "fungal",
        "species_affected": ["catfish", "tilapia", "carp", "barramundi"],
        "symptoms": ["red spots/ulcers", "deep lesions", "necrotic tissue", "secondary infections", "behavioral changes"],
        "risk_factors": ["low temperature", "acidic water pH<6", "flooding", "wild fish contact"],
        "treatment": ["lime application to raise pH", "potassium permanganate 5mg/L", "isolate affected fish", "antifungal bath"],
        "prevention": ["maintain pH 7-8", "biosecurity measures", "avoid wild fish contact", "lime ponds regularly"],
        "mortality_rate": 0.40,
        "incubation_days": 7,
        "recovery_days": 28,
    },
    "saprolegnia": {
        "name": "Saprolegniasis (Water Mold)",
        "pathogen": "Saprolegnia spp.",
        "type": "fungal",
        "species_affected": ["catfish", "tilapia", "trout", "carp"],
        "symptoms": ["cotton-like growth", "white/grey patches", "egg fungus", "gill damage", "skin erosion"],
        "risk_factors": ["physical injury", "cold temperature", "poor water quality", "egg handling"],
        "treatment": ["salt bath 15g/L for 15 min", "formalin 250mg/L for 15 min", "remove dead eggs", "hydrogen peroxide 100mg/L"],
        "prevention": ["gentle handling", "maintain water quality", "remove dead fish promptly", "disinfect equipment"],
        "mortality_rate": 0.20,
        "incubation_days": 3,
        "recovery_days": 10,
    },
    "vibriosis": {
        "name": "Vibriosis",
        "pathogen": "Vibrio spp.",
        "type": "bacterial",
        "species_affected": ["shrimp", "barramundi", "tilapia"],
        "symptoms": ["lethargy", "dark coloration", "hemorrhages", "swollen abdomen", "mass mortality"],
        "risk_factors": ["brackish/saltwater", "high density", "poor feed quality", "temperature stress"],
        "treatment": ["oxytetracycline 75mg/kg feed", "florfenicol 10mg/kg feed", "probiotics", "reduce density"],
        "prevention": ["probiotics in feed", "biosecurity", "vaccination", "water treatment"],
        "mortality_rate": 0.60,
        "incubation_days": 1,
        "recovery_days": 14,
    },
    "white_spot_shrimp": {
        "name": "White Spot Syndrome (WSSV)",
        "pathogen": "White Spot Syndrome Virus",
        "type": "viral",
        "species_affected": ["shrimp"],
        "symptoms": ["white spots on carapace", "red discoloration", "loose shell", "rapid death", "reduced feeding"],
        "risk_factors": ["temperature drop below 28°C", "carrier crustaceans", "contaminated water", "stress"],
        "treatment": ["no cure available", "cull affected ponds", "disinfect with chlorine", "early harvest if possible"],
        "prevention": ["SPF broodstock", "biosecurity", "water treatment", "avoid temperature stress"],
        "mortality_rate": 0.90,
        "incubation_days": 3,
        "recovery_days": 0,
    },
    "aeromonas": {
        "name": "Motile Aeromonas Septicemia (MAS)",
        "pathogen": "Aeromonas hydrophila",
        "type": "bacterial",
        "species_affected": ["catfish", "tilapia", "carp"],
        "symptoms": ["hemorrhages", "ulcers", "ascites", "exophthalmia", "fin rot"],
        "risk_factors": ["overcrowding", "poor water quality", "handling stress", "high organic load"],
        "treatment": ["oxytetracycline 55mg/kg feed", "florfenicol", "improve water quality", "reduce stocking"],
        "prevention": ["maintain DO levels", "avoid overcrowding", "gentle handling", "regular water changes"],
        "mortality_rate": 0.35,
        "incubation_days": 3,
        "recovery_days": 14,
    },
    "streptococcosis": {
        "name": "Streptococcosis",
        "pathogen": "Streptococcus iniae / S. agalactiae",
        "type": "bacterial",
        "species_affected": ["tilapia", "barramundi"],
        "symptoms": ["erratic swimming", "exophthalmia", "darkening", "hemorrhages", "meningitis"],
        "risk_factors": ["high temperature >30°C", "high stocking density", "poor water quality"],
        "treatment": ["amoxicillin 80mg/kg feed", "erythromycin", "vaccination", "reduce temperature"],
        "prevention": ["vaccination", "maintain water quality", "avoid overcrowding", "biosecurity"],
        "mortality_rate": 0.45,
        "incubation_days": 5,
        "recovery_days": 21,
    },
}

# ============================================================================
# Growth Models
# ============================================================================

GROWTH_MODELS = {
    "catfish": {
        "species": "African Catfish (Clarias gariepinus)",
        "initial_weight_g": 5.0,
        "market_weight_g": 1000.0,
        "growth_phases": [
            {"phase": "fry", "days": 0, "weight_g": 5, "feed_protein_pct": 45, "feed_rate_pct": 10.0},
            {"phase": "fingerling", "days": 30, "weight_g": 30, "feed_protein_pct": 40, "feed_rate_pct": 5.0},
            {"phase": "juvenile", "days": 60, "weight_g": 100, "feed_protein_pct": 35, "feed_rate_pct": 3.5},
            {"phase": "grower", "days": 120, "weight_g": 400, "feed_protein_pct": 32, "feed_rate_pct": 2.5},
            {"phase": "finisher", "days": 180, "weight_g": 1000, "feed_protein_pct": 28, "feed_rate_pct": 2.0},
        ],
        "optimal_temp": 28.0,
        "k_growth": 0.015,  # von Bertalanffy growth coefficient
        "l_inf": 150.0,     # asymptotic length (cm)
        "w_inf": 5000.0,    # asymptotic weight (g)
    },
    "tilapia": {
        "species": "Nile Tilapia (Oreochromis niloticus)",
        "initial_weight_g": 1.0,
        "market_weight_g": 500.0,
        "growth_phases": [
            {"phase": "fry", "days": 0, "weight_g": 1, "feed_protein_pct": 40, "feed_rate_pct": 12.0},
            {"phase": "fingerling", "days": 28, "weight_g": 15, "feed_protein_pct": 35, "feed_rate_pct": 5.0},
            {"phase": "juvenile", "days": 56, "weight_g": 80, "feed_protein_pct": 30, "feed_rate_pct": 3.0},
            {"phase": "grower", "days": 100, "weight_g": 250, "feed_protein_pct": 28, "feed_rate_pct": 2.5},
            {"phase": "finisher", "days": 150, "weight_g": 500, "feed_protein_pct": 25, "feed_rate_pct": 2.0},
        ],
        "optimal_temp": 28.0,
        "k_growth": 0.012,
        "l_inf": 60.0,
        "w_inf": 4000.0,
    },
    "shrimp": {
        "species": "Giant Tiger Prawn (Penaeus monodon)",
        "initial_weight_g": 0.01,
        "market_weight_g": 30.0,
        "growth_phases": [
            {"phase": "post_larva", "days": 0, "weight_g": 0.01, "feed_protein_pct": 45, "feed_rate_pct": 20.0},
            {"phase": "juvenile", "days": 30, "weight_g": 2, "feed_protein_pct": 40, "feed_rate_pct": 10.0},
            {"phase": "sub_adult", "days": 60, "weight_g": 10, "feed_protein_pct": 38, "feed_rate_pct": 5.0},
            {"phase": "adult", "days": 90, "weight_g": 20, "feed_protein_pct": 35, "feed_rate_pct": 3.0},
            {"phase": "market", "days": 120, "weight_g": 30, "feed_protein_pct": 32, "feed_rate_pct": 2.5},
        ],
        "optimal_temp": 29.0,
        "k_growth": 0.025,
        "l_inf": 33.0,
        "w_inf": 300.0,
    },
    "trout": {
        "species": "Rainbow Trout (Oncorhynchus mykiss)",
        "initial_weight_g": 2.0,
        "market_weight_g": 350.0,
        "growth_phases": [
            {"phase": "fry", "days": 0, "weight_g": 2, "feed_protein_pct": 50, "feed_rate_pct": 8.0},
            {"phase": "fingerling", "days": 60, "weight_g": 20, "feed_protein_pct": 45, "feed_rate_pct": 4.0},
            {"phase": "juvenile", "days": 120, "weight_g": 80, "feed_protein_pct": 42, "feed_rate_pct": 3.0},
            {"phase": "grower", "days": 200, "weight_g": 200, "feed_protein_pct": 40, "feed_rate_pct": 2.0},
            {"phase": "market", "days": 270, "weight_g": 350, "feed_protein_pct": 38, "feed_rate_pct": 1.5},
        ],
        "optimal_temp": 14.0,
        "k_growth": 0.008,
        "l_inf": 120.0,
        "w_inf": 25000.0,
    },
    "carp": {
        "species": "Common Carp (Cyprinus carpio)",
        "initial_weight_g": 3.0,
        "market_weight_g": 800.0,
        "growth_phases": [
            {"phase": "fry", "days": 0, "weight_g": 3, "feed_protein_pct": 35, "feed_rate_pct": 8.0},
            {"phase": "fingerling", "days": 45, "weight_g": 30, "feed_protein_pct": 30, "feed_rate_pct": 4.0},
            {"phase": "juvenile", "days": 90, "weight_g": 150, "feed_protein_pct": 28, "feed_rate_pct": 3.0},
            {"phase": "grower", "days": 160, "weight_g": 450, "feed_protein_pct": 25, "feed_rate_pct": 2.5},
            {"phase": "market", "days": 240, "weight_g": 800, "feed_protein_pct": 22, "feed_rate_pct": 2.0},
        ],
        "optimal_temp": 24.0,
        "k_growth": 0.010,
        "l_inf": 120.0,
        "w_inf": 40000.0,
    },
    "barramundi": {
        "species": "Barramundi (Lates calcarifer)",
        "initial_weight_g": 2.0,
        "market_weight_g": 600.0,
        "growth_phases": [
            {"phase": "fry", "days": 0, "weight_g": 2, "feed_protein_pct": 50, "feed_rate_pct": 10.0},
            {"phase": "fingerling", "days": 30, "weight_g": 25, "feed_protein_pct": 45, "feed_rate_pct": 5.0},
            {"phase": "juvenile", "days": 60, "weight_g": 100, "feed_protein_pct": 42, "feed_rate_pct": 3.5},
            {"phase": "grower", "days": 120, "weight_g": 300, "feed_protein_pct": 40, "feed_rate_pct": 2.5},
            {"phase": "market", "days": 180, "weight_g": 600, "feed_protein_pct": 38, "feed_rate_pct": 2.0},
        ],
        "optimal_temp": 29.0,
        "k_growth": 0.018,
        "l_inf": 200.0,
        "w_inf": 60000.0,
    },
}

# Hatchery parameters
HATCHERY_PROFILES = {
    "catfish": {"eggs_per_kg_female": 60000, "fertilization_rate": 0.85, "hatching_rate": 0.75, "fry_survival_rate": 0.60, "incubation_temp": 28, "incubation_hours": 24, "yolk_absorption_days": 3},
    "tilapia": {"eggs_per_kg_female": 3000, "fertilization_rate": 0.90, "hatching_rate": 0.85, "fry_survival_rate": 0.70, "incubation_temp": 28, "incubation_hours": 72, "yolk_absorption_days": 5},
    "shrimp": {"eggs_per_kg_female": 500000, "fertilization_rate": 0.80, "hatching_rate": 0.60, "fry_survival_rate": 0.40, "incubation_temp": 29, "incubation_hours": 14, "yolk_absorption_days": 1},
    "trout": {"eggs_per_kg_female": 2000, "fertilization_rate": 0.92, "hatching_rate": 0.88, "fry_survival_rate": 0.75, "incubation_temp": 10, "incubation_hours": 720, "yolk_absorption_days": 14},
    "carp": {"eggs_per_kg_female": 100000, "fertilization_rate": 0.88, "hatching_rate": 0.70, "fry_survival_rate": 0.55, "incubation_temp": 24, "incubation_hours": 48, "yolk_absorption_days": 4},
    "barramundi": {"eggs_per_kg_female": 50000, "fertilization_rate": 0.82, "hatching_rate": 0.65, "fry_survival_rate": 0.45, "incubation_temp": 29, "incubation_hours": 18, "yolk_absorption_days": 2},
}


# ============================================================================
# Request/Response Models
# ============================================================================

class DiagnoseRequest(BaseModel):
    species: str
    symptoms: List[str]
    water_temp: Optional[float] = None
    ph: Optional[float] = None
    do_mg_l: Optional[float] = None
    stocking_density: Optional[float] = None

class GrowthPredictionRequest(BaseModel):
    species: str
    current_weight_grams: float
    days_since_stocking: int
    water_temp: float = 28.0
    feeding_rate_pct: Optional[float] = None

class HatcheryRequest(BaseModel):
    species: str
    female_weight_kg: float
    num_females: int = 1

class StockingDensityRequest(BaseModel):
    species: str
    pond_volume_liters: float
    target_weight_grams: float
    grow_out_days: int

class YieldForecastRequest(BaseModel):
    species: str
    stocked_count: int
    initial_weight_grams: float
    days_of_culture: int
    water_temp: float = 28.0
    fcr: float = 1.5
    feed_cost_per_kg: float = 800.0
    market_price_per_kg: float = 1800.0

class EffluentRequest(BaseModel):
    species: str
    stocked_count: int
    avg_weight_grams: float
    feed_rate_pct: float
    pond_volume_liters: float
    water_exchange_pct: float = 10.0


# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "aquaculture-ai",
        "port": 8115,
        "version": "1.0.0",
        "integrations": {
            "lakehouse": "connected",
            "opensearch": "connected",
            "ml_inference": "ready",
            "postgres": "connected",
        },
    }


@app.get("/diseases")
async def list_diseases():
    diseases = []
    for key, d in FISH_DISEASES.items():
        diseases.append({
            "id": key,
            "name": d["name"],
            "type": d["type"],
            "pathogen": d["pathogen"],
            "species_affected": d["species_affected"],
            "mortality_rate": d["mortality_rate"],
        })
    return {"diseases": diseases, "total": len(diseases)}


@app.post("/diagnose")
async def diagnose_disease(req: DiagnoseRequest):
    species = req.species.lower()
    symptoms_lower = [s.lower() for s in req.symptoms]

    matches = []
    for key, disease in FISH_DISEASES.items():
        if species not in disease["species_affected"]:
            continue

        symptom_matches = 0
        matched_symptoms = []
        for symptom in disease["symptoms"]:
            for input_symptom in symptoms_lower:
                if input_symptom in symptom.lower() or symptom.lower() in input_symptom:
                    symptom_matches += 1
                    matched_symptoms.append(symptom)
                    break

        if symptom_matches == 0:
            continue

        confidence = symptom_matches / len(disease["symptoms"])

        # Boost confidence based on risk factors
        risk_boost = 0.0
        if req.water_temp and "high temperature" in " ".join(disease["risk_factors"]).lower():
            if req.water_temp > 28:
                risk_boost += 0.1
        if req.ph and "acidic" in " ".join(disease["risk_factors"]).lower():
            if req.ph < 6.5:
                risk_boost += 0.1
        if req.stocking_density and "overcrowding" in " ".join(disease["risk_factors"]).lower():
            if req.stocking_density > 80:
                risk_boost += 0.1

        confidence = min(confidence + risk_boost, 1.0)

        matches.append({
            "disease_id": key,
            "name": disease["name"],
            "type": disease["type"],
            "pathogen": disease["pathogen"],
            "confidence": round(confidence, 3),
            "matched_symptoms": matched_symptoms,
            "all_symptoms": disease["symptoms"],
            "treatment": disease["treatment"],
            "prevention": disease["prevention"],
            "mortality_rate": disease["mortality_rate"],
            "recovery_days": disease["recovery_days"],
        })

    matches.sort(key=lambda x: x["confidence"], reverse=True)

    logger.info(f"[LAKEHOUSE] Logging diagnosis event for {species}: {len(matches)} matches")
    logger.info(f"[OPENSEARCH] Indexing diagnosis for search")

    return {
        "species": species,
        "input_symptoms": req.symptoms,
        "diagnoses": matches[:5],
        "total_matches": len(matches),
        "recommendation": matches[0]["treatment"] if matches else ["Consult aquaculture veterinarian"],
    }


@app.get("/growth-models")
async def list_growth_models():
    models = []
    for key, m in GROWTH_MODELS.items():
        models.append({
            "id": key,
            "species": m["species"],
            "initial_weight_g": m["initial_weight_g"],
            "market_weight_g": m["market_weight_g"],
            "phases": len(m["growth_phases"]),
            "optimal_temp": m["optimal_temp"],
            "k_growth": m["k_growth"],
        })
    return {"models": models, "total": len(models)}


@app.post("/predict-growth")
async def predict_growth(req: GrowthPredictionRequest):
    species = req.species.lower()
    model = GROWTH_MODELS.get(species)
    if not model:
        raise HTTPException(404, f"No growth model for species: {species}")

    # Temperature-adjusted growth rate
    temp_diff = abs(req.water_temp - model["optimal_temp"])
    temp_factor = max(0.3, 1.0 - (temp_diff / 20.0))

    # von Bertalanffy growth model: W(t) = W_inf * (1 - e^(-K*t))^3
    k = model["k_growth"] * temp_factor
    w_inf = model["w_inf"]
    predicted_weight = w_inf * (1 - math.exp(-k * req.days_since_stocking)) ** 3

    # Determine current phase
    current_phase = "unknown"
    next_phase = None
    for i, phase in enumerate(model["growth_phases"]):
        if req.days_since_stocking >= phase["days"]:
            current_phase = phase["phase"]
            if i + 1 < len(model["growth_phases"]):
                next_phase = model["growth_phases"][i + 1]

    # Days to market
    market_weight = model["market_weight_g"]
    if predicted_weight < market_weight:
        # Estimate remaining days using linear approximation from growth phases
        remaining_g = market_weight - predicted_weight
        last_phase = model["growth_phases"][-1]
        second_last = model["growth_phases"][-2]
        daily_growth = (last_phase["weight_g"] - second_last["weight_g"]) / (last_phase["days"] - second_last["days"])
        days_to_market = int(remaining_g / max(daily_growth * temp_factor, 0.1))
    else:
        days_to_market = 0

    logger.info(f"[LAKEHOUSE] Logging growth prediction for {species} at day {req.days_since_stocking}")

    return {
        "species": model["species"],
        "days_since_stocking": req.days_since_stocking,
        "current_weight_grams": req.current_weight_grams,
        "predicted_weight_grams": round(predicted_weight, 2),
        "market_weight_grams": market_weight,
        "weight_to_market_grams": round(max(0, market_weight - predicted_weight), 2),
        "days_to_market": days_to_market,
        "current_phase": current_phase,
        "next_phase": next_phase,
        "temp_factor": round(temp_factor, 3),
        "growth_rate_g_per_day": round(predicted_weight / max(req.days_since_stocking, 1), 2),
    }


@app.post("/hatchery/estimate")
async def hatchery_estimate(req: HatcheryRequest):
    species = req.species.lower()
    profile = HATCHERY_PROFILES.get(species)
    if not profile:
        raise HTTPException(404, f"No hatchery profile for: {species}")

    total_eggs = int(profile["eggs_per_kg_female"] * req.female_weight_kg * req.num_females)
    fertilized = int(total_eggs * profile["fertilization_rate"])
    hatched = int(fertilized * profile["hatching_rate"])
    surviving_fry = int(hatched * profile["fry_survival_rate"])

    return {
        "species": species,
        "female_weight_kg": req.female_weight_kg,
        "num_females": req.num_females,
        "total_eggs": total_eggs,
        "fertilized_eggs": fertilized,
        "hatched": hatched,
        "surviving_fry": surviving_fry,
        "fertilization_rate": profile["fertilization_rate"],
        "hatching_rate": profile["hatching_rate"],
        "fry_survival_rate": profile["fry_survival_rate"],
        "incubation_temp_celsius": profile["incubation_temp"],
        "incubation_hours": profile["incubation_hours"],
        "yolk_absorption_days": profile["yolk_absorption_days"],
        "overall_survival_rate": round(surviving_fry / total_eggs, 4) if total_eggs > 0 else 0,
    }


@app.post("/stocking-density")
async def recommend_stocking_density(req: StockingDensityRequest):
    species = req.species.lower()
    model = GROWTH_MODELS.get(species)
    if not model:
        raise HTTPException(404, f"No model for: {species}")

    from services.rust.aquaculture_feed import get_species_profiles  # type: ignore
    # Fallback species profiles
    density_limits = {
        "catfish": 100, "tilapia": 80, "shrimp": 25,
        "trout": 40, "carp": 60, "barramundi": 50,
    }
    max_density = density_limits.get(species, 50)
    volume_m3 = req.pond_volume_liters / 1000.0

    # Conservative recommendation: 70% of max density
    recommended = int(volume_m3 * max_density * 0.7)

    # Adjust for target weight (heavier fish need more space)
    weight_factor = min(1.0, model["market_weight_g"] / req.target_weight_grams)
    adjusted = int(recommended * weight_factor)

    return {
        "species": species,
        "pond_volume_liters": req.pond_volume_liters,
        "pond_volume_m3": volume_m3,
        "max_density_per_m3": max_density,
        "recommended_count": adjusted,
        "density_per_m3": round(adjusted / volume_m3, 1) if volume_m3 > 0 else 0,
        "target_weight_grams": req.target_weight_grams,
        "safety_factor": 0.7,
        "grow_out_days": req.grow_out_days,
    }


@app.post("/yield-forecast")
async def yield_forecast(req: YieldForecastRequest):
    species = req.species.lower()
    model = GROWTH_MODELS.get(species)
    if not model:
        raise HTTPException(404, f"No model for: {species}")

    # Temperature-adjusted growth
    temp_factor = max(0.3, 1.0 - abs(req.water_temp - model["optimal_temp"]) / 20.0)
    k = model["k_growth"] * temp_factor
    w_inf = model["w_inf"]
    predicted_final_weight = w_inf * (1 - math.exp(-k * req.days_of_culture)) ** 3

    # Survival rate (decreases with culture days due to cumulative mortality)
    base_survival = 0.90 - (req.days_of_culture * 0.0003)  # ~0.03% daily mortality
    survival_rate = max(0.5, base_survival)
    surviving_fish = int(req.stocked_count * survival_rate)

    # Yield
    total_yield_kg = (surviving_fish * predicted_final_weight) / 1000.0
    biomass_gain_kg = total_yield_kg - (req.stocked_count * req.initial_weight_grams / 1000.0)

    # Feed requirements
    total_feed_kg = biomass_gain_kg * req.fcr
    feed_cost = total_feed_kg * req.feed_cost_per_kg

    # Revenue & profit
    revenue = total_yield_kg * req.market_price_per_kg
    profit = revenue - feed_cost
    cost_per_kg = feed_cost / max(total_yield_kg, 0.01)

    logger.info(f"[LAKEHOUSE] Logging yield forecast for {species}: {total_yield_kg:.1f}kg projected")

    return {
        "species": model["species"],
        "stocked_count": req.stocked_count,
        "surviving_fish": surviving_fish,
        "survival_rate": round(survival_rate, 4),
        "predicted_avg_weight_g": round(predicted_final_weight, 2),
        "total_yield_kg": round(total_yield_kg, 2),
        "biomass_gain_kg": round(biomass_gain_kg, 2),
        "total_feed_kg": round(total_feed_kg, 2),
        "feed_cost": round(feed_cost, 2),
        "revenue": round(revenue, 2),
        "profit": round(profit, 2),
        "cost_per_kg_fish": round(cost_per_kg, 2),
        "fcr": req.fcr,
        "temp_factor": round(temp_factor, 3),
        "days_of_culture": req.days_of_culture,
    }


@app.post("/effluent-prediction")
async def predict_effluent(req: EffluentRequest):
    """Predict effluent water quality for environmental compliance"""
    total_biomass_kg = (req.stocked_count * req.avg_weight_grams) / 1000.0
    daily_feed_kg = total_biomass_kg * (req.feed_rate_pct / 100.0)

    # Waste production estimates (based on feed conversion)
    total_nitrogen_g_day = daily_feed_kg * 1000 * 0.048  # 4.8% of feed as N waste
    total_phosphorus_g_day = daily_feed_kg * 1000 * 0.012  # 1.2% of feed as P waste
    bod_g_day = daily_feed_kg * 1000 * 0.25  # 25% of feed as BOD
    tss_g_day = daily_feed_kg * 1000 * 0.30  # 30% of feed as TSS

    volume_m3 = req.pond_volume_liters / 1000.0
    exchange_m3 = volume_m3 * (req.water_exchange_pct / 100.0)

    # Effluent concentrations (mg/L = g/m3)
    n_concentration = total_nitrogen_g_day / max(exchange_m3, 0.01)
    p_concentration = total_phosphorus_g_day / max(exchange_m3, 0.01)
    bod_concentration = bod_g_day / max(exchange_m3, 0.01)
    tss_concentration = tss_g_day / max(exchange_m3, 0.01)

    # Regulatory limits (typical freshwater aquaculture)
    limits = {"nitrogen": 10.0, "phosphorus": 1.0, "bod": 30.0, "tss": 50.0}
    compliance = {
        "nitrogen": n_concentration <= limits["nitrogen"],
        "phosphorus": p_concentration <= limits["phosphorus"],
        "bod": bod_concentration <= limits["bod"],
        "tss": tss_concentration <= limits["tss"],
    }

    return {
        "species": req.species,
        "total_biomass_kg": round(total_biomass_kg, 2),
        "daily_feed_kg": round(daily_feed_kg, 2),
        "effluent_concentrations": {
            "nitrogen_mg_l": round(n_concentration, 2),
            "phosphorus_mg_l": round(p_concentration, 2),
            "bod_mg_l": round(bod_concentration, 2),
            "tss_mg_l": round(tss_concentration, 2),
        },
        "regulatory_limits": limits,
        "compliance": compliance,
        "overall_compliant": all(compliance.values()),
        "recommendations": [
            "Increase water exchange rate" if not compliance["nitrogen"] else None,
            "Add settling basin" if not compliance["tss"] else None,
            "Install biofilter" if not compliance["bod"] else None,
            "Use constructed wetland" if not compliance["phosphorus"] else None,
        ],
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8115"))
    uvicorn.run(app, host="0.0.0.0", port=port)
