"""
Synthetic Data Generators for FarmConnect ML Models

Generates realistic training data for:
1. Crop Disease Classification (image-like feature tensors)
2. Yield Prediction (tabular)
3. Price Forecasting (time-series)
4. Credit Scoring (tabular)
5. Fraud Detection (tabular)
6. Soil Health Assessment (tabular)
7. GNN: Farmer-Cooperative-Market graph

Data distributions are modeled on East African agricultural statistics
(FAO, Kenya National Bureau of Statistics, World Bank).
"""

import numpy as np
import pandas as pd
from typing import Tuple, Dict, List
from datetime import datetime, timedelta
import json
import os

np.random.seed(42)

# ============================================================================
# CROP DISEASE CLASSIFICATION DATA
# ============================================================================

DISEASES = {
    "maize": [
        ("healthy", 0), ("maize_streak_virus", 1), ("gray_leaf_spot", 2),
        ("northern_leaf_blight", 3), ("common_rust", 4), ("stalk_rot", 5),
    ],
    "tomato": [
        ("healthy", 0), ("early_blight", 1), ("late_blight", 2),
        ("leaf_mold", 3), ("septoria_leaf_spot", 4), ("bacterial_spot", 5),
        ("target_spot", 6), ("mosaic_virus", 7),
    ],
    "beans": [
        ("healthy", 0), ("angular_leaf_spot", 1), ("bean_rust", 2),
        ("anthracnose", 3),
    ],
    "potato": [
        ("healthy", 0), ("early_blight", 1), ("late_blight", 2),
    ],
    "cassava": [
        ("healthy", 0), ("mosaic_disease", 1), ("bacterial_blight", 2),
        ("brown_streak", 3), ("green_mite", 4),
    ],
    "rice": [
        ("healthy", 0), ("blast", 1), ("brown_spot", 2),
        ("leaf_scald", 3), ("bacterial_blight", 4),
    ],
}


def generate_crop_disease_data(
    n_samples_per_class: int = 500,
    image_size: int = 64,
    channels: int = 3,
) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    """
    Generate synthetic crop disease image features.
    
    Each "image" is a 3×64×64 tensor with disease-specific patterns:
    - Healthy leaves: uniform green channel, low red/blue
    - Diseased: specific color/texture patterns per disease
    
    Returns (images, labels, class_names)
    """
    all_images = []
    all_labels = []
    class_names = []
    label_idx = 0

    for crop, diseases in DISEASES.items():
        for disease_name, _ in diseases:
            class_names.append(f"{crop}_{disease_name}")
            for _ in range(n_samples_per_class):
                img = _generate_leaf_image(crop, disease_name, image_size, channels)
                all_images.append(img)
                all_labels.append(label_idx)
            label_idx += 1

    images = np.array(all_images, dtype=np.float32)
    labels = np.array(all_labels, dtype=np.int64)

    perm = np.random.permutation(len(images))
    return images[perm], labels[perm], class_names


def _generate_leaf_image(
    crop: str, disease: str, size: int, channels: int
) -> np.ndarray:
    """Generate a synthetic leaf image tensor (C, H, W) with disease-specific patterns."""
    img = np.zeros((channels, size, size), dtype=np.float32)
    
    # Base green leaf
    img[1] = np.random.uniform(0.4, 0.8, (size, size))  # green channel
    img[0] = np.random.uniform(0.05, 0.15, (size, size))  # red
    img[2] = np.random.uniform(0.05, 0.15, (size, size))  # blue
    
    if disease == "healthy":
        img[1] += np.random.uniform(0.0, 0.1, (size, size))
    else:
        n_lesions = np.random.randint(3, 15)
        for _ in range(n_lesions):
            cx, cy = np.random.randint(5, size - 5, 2)
            radius = np.random.randint(2, min(8, size // 6))
            y, x = np.ogrid[-cx:size - cx, -cy:size - cy]
            mask = x * x + y * y <= radius * radius

            if "blight" in disease or "spot" in disease:
                img[0][mask] = np.random.uniform(0.4, 0.7)  # brown/red spots
                img[1][mask] = np.random.uniform(0.15, 0.3)
                img[2][mask] = np.random.uniform(0.05, 0.15)
            elif "rust" in disease:
                img[0][mask] = np.random.uniform(0.6, 0.9)  # orange/rust
                img[1][mask] = np.random.uniform(0.3, 0.5)
                img[2][mask] = np.random.uniform(0.0, 0.1)
            elif "virus" in disease or "mosaic" in disease:
                img[1][mask] = np.random.uniform(0.6, 0.9)  # yellow-green mosaic
                img[0][mask] = np.random.uniform(0.4, 0.7)
            elif "mold" in disease or "mite" in disease:
                img[0][mask] = np.random.uniform(0.2, 0.4)
                img[1][mask] = np.random.uniform(0.2, 0.4)
                img[2][mask] = np.random.uniform(0.2, 0.4)
            else:
                img[0][mask] = np.random.uniform(0.3, 0.6)
                img[1][mask] *= 0.5

        noise = np.random.normal(0, 0.02, img.shape).astype(np.float32)
        img = np.clip(img + noise, 0, 1)

    return img


# ============================================================================
# YIELD PREDICTION DATA
# ============================================================================

REGIONS = ["central_kenya", "western_kenya", "rift_valley", "nyanza", "coast",
           "northern_uganda", "southern_uganda", "northern_nigeria", "southern_nigeria"]

SOIL_TYPES = ["loamy", "clay", "sandy", "silt", "volcanic", "laterite"]
FERTILIZERS = ["npk", "organic_compost", "urea", "dap", "can", "none"]
IRRIGATION = ["rainfed", "drip", "sprinkler", "flood", "none"]

CROP_YIELD_PARAMS = {
    "maize": {"base_yield": 3200, "max_yield": 8000, "optimal_rain": 900, "optimal_temp": 25},
    "rice": {"base_yield": 4500, "max_yield": 9000, "optimal_rain": 1200, "optimal_temp": 28},
    "beans": {"base_yield": 1200, "max_yield": 3000, "optimal_rain": 700, "optimal_temp": 22},
    "cassava": {"base_yield": 10000, "max_yield": 25000, "optimal_rain": 1000, "optimal_temp": 27},
    "wheat": {"base_yield": 2500, "max_yield": 6000, "optimal_rain": 600, "optimal_temp": 20},
    "sorghum": {"base_yield": 2000, "max_yield": 5000, "optimal_rain": 500, "optimal_temp": 28},
    "potatoes": {"base_yield": 15000, "max_yield": 35000, "optimal_rain": 800, "optimal_temp": 18},
    "coffee": {"base_yield": 800, "max_yield": 2500, "optimal_rain": 1500, "optimal_temp": 22},
    "tea": {"base_yield": 2000, "max_yield": 5000, "optimal_rain": 1800, "optimal_temp": 20},
}


def generate_yield_data(n_samples: int = 10000) -> pd.DataFrame:
    """Generate realistic crop yield training data."""
    records = []
    crops = list(CROP_YIELD_PARAMS.keys())

    for _ in range(n_samples):
        crop = np.random.choice(crops)
        params = CROP_YIELD_PARAMS[crop]
        region = np.random.choice(REGIONS)
        soil = np.random.choice(SOIL_TYPES)
        fert = np.random.choice(FERTILIZERS)
        irrig = np.random.choice(IRRIGATION)

        farm_size = np.random.lognormal(mean=0.5, sigma=0.8)  # hectares (skewed small)
        farm_size = np.clip(farm_size, 0.1, 50)

        rainfall = np.random.normal(params["optimal_rain"], 250)
        rainfall = np.clip(rainfall, 100, 2500)

        temperature = np.random.normal(params["optimal_temp"], 4)
        temperature = np.clip(temperature, 10, 40)

        elevation = np.random.uniform(0, 2500)
        ph = np.random.normal(6.5, 0.8)
        ph = np.clip(ph, 4.0, 9.0)

        nitrogen = np.random.uniform(10, 150)
        phosphorus = np.random.uniform(5, 80)
        potassium = np.random.uniform(50, 300)
        organic_matter = np.random.uniform(0.5, 6.0)

        ndvi = np.random.uniform(0.3, 0.85)
        planting_month = np.random.randint(1, 13)

        # Calculate yield with realistic interactions
        rain_factor = 1 - abs(rainfall - params["optimal_rain"]) / params["optimal_rain"]
        rain_factor = max(0.2, min(1.0, rain_factor))

        temp_factor = 1 - abs(temperature - params["optimal_temp"]) / 15
        temp_factor = max(0.3, min(1.0, temp_factor))

        soil_factors = {"loamy": 1.0, "volcanic": 1.05, "silt": 0.95, "clay": 0.85, "sandy": 0.7, "laterite": 0.75}
        soil_factor = soil_factors.get(soil, 0.8)

        fert_factors = {"npk": 1.15, "dap": 1.1, "can": 1.08, "urea": 1.05, "organic_compost": 1.0, "none": 0.7}
        fert_factor = fert_factors.get(fert, 0.8)

        irrig_factors = {"drip": 1.2, "sprinkler": 1.15, "flood": 1.05, "rainfed": 0.85, "none": 0.7}
        irrig_factor = irrig_factors.get(irrig, 0.8)

        ndvi_factor = 0.5 + ndvi * 0.6
        nutrient_factor = min(1.2, (nitrogen / 100 + phosphorus / 60 + potassium / 200) / 3 + 0.5)

        yield_kg_per_ha = (
            params["base_yield"]
            * rain_factor * temp_factor * soil_factor * fert_factor
            * irrig_factor * ndvi_factor * nutrient_factor
        )
        yield_kg_per_ha *= np.random.uniform(0.85, 1.15)
        yield_kg_per_ha = np.clip(yield_kg_per_ha, 100, params["max_yield"])

        records.append({
            "crop": crop, "region": region, "soil_type": soil,
            "fertilizer": fert, "irrigation": irrig,
            "farm_size_ha": round(farm_size, 2),
            "rainfall_mm": round(rainfall, 1),
            "temperature_c": round(temperature, 1),
            "elevation_m": round(elevation, 0),
            "soil_ph": round(ph, 1),
            "nitrogen_ppm": round(nitrogen, 1),
            "phosphorus_ppm": round(phosphorus, 1),
            "potassium_ppm": round(potassium, 1),
            "organic_matter_pct": round(organic_matter, 2),
            "ndvi": round(ndvi, 3),
            "planting_month": planting_month,
            "yield_kg_per_ha": round(yield_kg_per_ha, 1),
        })

    return pd.DataFrame(records)


# ============================================================================
# PRICE FORECASTING DATA (TIME-SERIES)
# ============================================================================

def generate_price_timeseries(
    crops: List[str] = None,
    n_days: int = 730,
    start_date: str = "2024-01-01",
) -> pd.DataFrame:
    """Generate 2 years of daily crop price data with realistic seasonality, trends, and shocks."""
    if crops is None:
        crops = ["maize", "rice", "beans", "tomatoes", "potatoes", "coffee"]

    base_prices = {
        "maize": 45, "rice": 120, "beans": 90, "tomatoes": 60,
        "potatoes": 35, "coffee": 350, "tea": 200, "wheat": 55,
    }
    records = []
    start = datetime.strptime(start_date, "%Y-%m-%d")

    for crop in crops:
        base = base_prices.get(crop, 50)
        price = base
        trend = np.random.uniform(-0.01, 0.02)

        for day in range(n_days):
            date = start + timedelta(days=day)
            month = date.month
            dow = date.weekday()

            # Seasonal pattern
            seasonal = np.sin(2 * np.pi * (month - 3) / 12) * base * 0.15

            # Weekly pattern (lower on weekends)
            weekly = -base * 0.02 if dow >= 5 else 0

            # Trend
            price += trend

            # Random shocks (drought, flood, etc.) ~2% chance per day
            shock = 0
            if np.random.random() < 0.02:
                shock = np.random.choice([-1, 1]) * base * np.random.uniform(0.05, 0.15)

            # Market noise
            noise = np.random.normal(0, base * 0.02)

            daily_price = base + seasonal + weekly + shock + noise + trend * day * 0.01
            daily_price = max(base * 0.4, daily_price)

            volume = int(np.random.lognormal(mean=6, sigma=1))

            records.append({
                "date": date.strftime("%Y-%m-%d"),
                "crop": crop,
                "price_per_kg": round(daily_price, 2),
                "volume_kg": volume,
                "market": np.random.choice(["nairobi", "mombasa", "kisumu", "nakuru", "eldoret"]),
            })

    return pd.DataFrame(records)


# ============================================================================
# CREDIT SCORING DATA
# ============================================================================

def generate_credit_data(n_samples: int = 5000) -> pd.DataFrame:
    """Generate realistic farmer credit scoring data."""
    records = []
    for _ in range(n_samples):
        # Farmer characteristics
        age = np.random.randint(18, 75)
        years_farming = np.random.randint(0, min(age - 16, 50))
        farm_size = np.random.lognormal(0.3, 0.7)
        farm_size = np.clip(farm_size, 0.1, 30)
        num_crops = np.random.randint(1, 6)
        has_irrigation = int(np.random.random() < 0.3)
        cooperative_member = int(np.random.random() < 0.5)
        has_insurance = int(np.random.random() < 0.15)
        mobile_money_active = int(np.random.random() < 0.7)

        # Financial history
        annual_revenue = farm_size * np.random.uniform(50000, 200000)
        annual_revenue *= (1 + years_farming * 0.01)
        savings_balance = annual_revenue * np.random.uniform(0.01, 0.3)
        previous_loans = np.random.randint(0, 8)
        loans_repaid_on_time = min(previous_loans, np.random.binomial(previous_loans, 0.75))
        outstanding_debt = max(0, annual_revenue * np.random.uniform(0, 0.5))
        marketplace_transactions = np.random.randint(0, 100)
        avg_transaction_value = np.random.uniform(500, 50000)

        # Risk scoring target (0 = default, 1 = repay)
        score = (
            0.15 * (loans_repaid_on_time / max(previous_loans, 1))
            + 0.1 * min(years_farming / 20, 1)
            + 0.1 * min(farm_size / 5, 1)
            + 0.1 * cooperative_member
            + 0.1 * has_insurance
            + 0.1 * mobile_money_active
            + 0.1 * min(savings_balance / annual_revenue, 1) if annual_revenue > 0 else 0
            + 0.1 * (1 - min(outstanding_debt / annual_revenue, 1) if annual_revenue > 0 else 0)
            + 0.05 * min(marketplace_transactions / 50, 1)
            + 0.1 * np.random.uniform(0, 1)
        )
        will_repay = int(score > 0.45)

        records.append({
            "age": age, "years_farming": years_farming,
            "farm_size_ha": round(farm_size, 2), "num_crops": num_crops,
            "has_irrigation": has_irrigation, "cooperative_member": cooperative_member,
            "has_insurance": has_insurance, "mobile_money_active": mobile_money_active,
            "annual_revenue": round(annual_revenue, 0),
            "savings_balance": round(savings_balance, 0),
            "previous_loans": previous_loans,
            "loans_repaid_on_time": loans_repaid_on_time,
            "outstanding_debt": round(outstanding_debt, 0),
            "marketplace_transactions": marketplace_transactions,
            "avg_transaction_value": round(avg_transaction_value, 0),
            "will_repay": will_repay,
        })

    return pd.DataFrame(records)


# ============================================================================
# FRAUD DETECTION DATA
# ============================================================================

def generate_fraud_data(n_samples: int = 10000, fraud_ratio: float = 0.05) -> pd.DataFrame:
    """Generate marketplace transaction data with fraudulent patterns."""
    records = []
    n_fraud = int(n_samples * fraud_ratio)
    n_legit = n_samples - n_fraud

    for _ in range(n_legit):
        records.append(_generate_legit_transaction())
    for _ in range(n_fraud):
        records.append(_generate_fraud_transaction())

    df = pd.DataFrame(records)
    return df.sample(frac=1, random_state=42).reset_index(drop=True)


def _generate_legit_transaction() -> Dict:
    return {
        "amount": round(np.random.lognormal(7, 1.2), 0),
        "hour_of_day": np.random.choice(range(6, 22)),
        "day_of_week": np.random.randint(0, 7),
        "seller_account_age_days": np.random.randint(30, 1000),
        "buyer_account_age_days": np.random.randint(30, 1000),
        "seller_total_sales": np.random.randint(5, 500),
        "seller_avg_rating": round(np.random.uniform(3.5, 5.0), 1),
        "buyer_total_purchases": np.random.randint(1, 200),
        "distance_km": round(np.random.uniform(1, 200), 1),
        "price_vs_market_avg": round(np.random.uniform(0.7, 1.3), 2),
        "quantity_vs_avg": round(np.random.uniform(0.5, 2.0), 2),
        "same_device_transactions_24h": np.random.randint(1, 5),
        "payment_method": np.random.choice(["mpesa", "bank", "cash", "mtn_momo"]),
        "has_photo": int(np.random.random() < 0.7),
        "description_length": np.random.randint(20, 500),
        "is_fraud": 0,
    }


def _generate_fraud_transaction() -> Dict:
    fraud_type = np.random.choice(["price_manipulation", "fake_listing", "account_takeover", "wash_trading"])
    t = _generate_legit_transaction()
    t["is_fraud"] = 1

    if fraud_type == "price_manipulation":
        t["price_vs_market_avg"] = round(np.random.uniform(0.1, 0.4), 2)
        t["amount"] = round(t["amount"] * 0.3, 0)
    elif fraud_type == "fake_listing":
        t["seller_account_age_days"] = np.random.randint(1, 7)
        t["seller_total_sales"] = 0
        t["has_photo"] = 0
        t["description_length"] = np.random.randint(3, 15)
    elif fraud_type == "account_takeover":
        t["hour_of_day"] = np.random.choice([0, 1, 2, 3, 4, 5])
        t["same_device_transactions_24h"] = np.random.randint(10, 50)
    elif fraud_type == "wash_trading":
        t["distance_km"] = round(np.random.uniform(0, 0.5), 2)
        t["amount"] = round(np.random.uniform(100, 500), 0)
        t["quantity_vs_avg"] = round(np.random.uniform(0.01, 0.1), 2)

    return t


# ============================================================================
# GNN GRAPH DATA
# ============================================================================

def generate_graph_data(
    n_farmers: int = 500, n_cooperatives: int = 20, n_markets: int = 10,
) -> Dict:
    """Generate a farmer-cooperative-market knowledge graph for GNN training."""
    nodes = []
    edges = []

    # Farmers
    for i in range(n_farmers):
        nodes.append({
            "id": f"farmer_{i}", "type": "farmer",
            "features": {
                "farm_size": round(np.random.lognormal(0.5, 0.8), 2),
                "years_experience": np.random.randint(1, 40),
                "num_crops": np.random.randint(1, 5),
                "credit_score": round(np.random.uniform(200, 800), 0),
                "annual_revenue": round(np.random.lognormal(10, 1.5), 0),
                "region_encoded": np.random.randint(0, len(REGIONS)),
            },
        })

    # Cooperatives
    for i in range(n_cooperatives):
        nodes.append({
            "id": f"coop_{i}", "type": "cooperative",
            "features": {
                "member_count": np.random.randint(10, 200),
                "total_land_ha": round(np.random.uniform(50, 2000), 0),
                "avg_credit_score": round(np.random.uniform(400, 700), 0),
                "collective_revenue": round(np.random.lognormal(13, 1), 0),
                "years_active": np.random.randint(1, 20),
                "loan_default_rate": round(np.random.uniform(0, 0.2), 3),
            },
        })

    # Markets
    for i in range(n_markets):
        nodes.append({
            "id": f"market_{i}", "type": "market",
            "features": {
                "daily_volume_kg": round(np.random.lognormal(9, 1), 0),
                "avg_price_index": round(np.random.uniform(0.8, 1.3), 2),
                "num_active_sellers": np.random.randint(20, 500),
                "num_active_buyers": np.random.randint(50, 2000),
                "region_encoded": np.random.randint(0, len(REGIONS)),
                "infrastructure_score": round(np.random.uniform(0.3, 1.0), 2),
            },
        })

    # Edges: farmer → cooperative (MEMBER_OF)
    for i in range(n_farmers):
        n_memberships = np.random.choice([0, 1, 1, 1, 2], p=[0.3, 0.4, 0.15, 0.1, 0.05])
        coop_ids = np.random.choice(n_cooperatives, size=min(n_memberships, n_cooperatives), replace=False)
        for cid in coop_ids:
            edges.append({
                "source": f"farmer_{i}", "target": f"coop_{cid}",
                "type": "MEMBER_OF",
                "weight": round(np.random.uniform(0.5, 1.0), 2),
            })

    # Edges: farmer → market (SELLS_AT)
    for i in range(n_farmers):
        n_markets_used = np.random.randint(1, min(4, n_markets + 1))
        market_ids = np.random.choice(n_markets, size=n_markets_used, replace=False)
        for mid in market_ids:
            edges.append({
                "source": f"farmer_{i}", "target": f"market_{mid}",
                "type": "SELLS_AT",
                "weight": round(np.random.uniform(0.1, 1.0), 2),
            })

    # Edges: farmer → farmer (TRADES_WITH)
    for i in range(n_farmers):
        n_trades = np.random.randint(0, 5)
        trade_partners = np.random.choice(n_farmers, size=n_trades, replace=False)
        for tp in trade_partners:
            if tp != i:
                edges.append({
                    "source": f"farmer_{i}", "target": f"farmer_{tp}",
                    "type": "TRADES_WITH",
                    "weight": round(np.random.uniform(0.1, 0.8), 2),
                })

    # Edges: cooperative → market (SUPPLIES)
    for i in range(n_cooperatives):
        n_supplied = np.random.randint(1, min(4, n_markets + 1))
        market_ids = np.random.choice(n_markets, size=n_supplied, replace=False)
        for mid in market_ids:
            edges.append({
                "source": f"coop_{i}", "target": f"market_{mid}",
                "type": "SUPPLIES",
                "weight": round(np.random.uniform(0.3, 1.0), 2),
            })

    return {"nodes": nodes, "edges": edges}


# ============================================================================
# SOIL HEALTH DATA (tabular - legacy)
# ============================================================================

def generate_soil_health_data(n_samples: int = 3000) -> pd.DataFrame:
    """Generate soil test data for soil health scoring model."""
    records = []
    for _ in range(n_samples):
        ph = np.random.normal(6.5, 1.0)
        ph = np.clip(ph, 3.5, 9.5)
        nitrogen = np.random.lognormal(3.5, 0.6)
        phosphorus = np.random.lognormal(2.5, 0.8)
        potassium = np.random.lognormal(4.5, 0.5)
        organic_matter = np.random.lognormal(0.5, 0.5)
        organic_matter = np.clip(organic_matter, 0.1, 10)
        moisture = np.random.uniform(5, 45)
        texture_sand = np.random.uniform(10, 80)
        texture_clay = np.random.uniform(5, 60)
        texture_silt = 100 - texture_sand - texture_clay
        texture_silt = max(0, texture_silt)
        cec = np.random.uniform(5, 50)
        electrical_conductivity = np.random.lognormal(-0.5, 0.8)

        # Health score (0-100) based on agronomic guidelines
        score = 0
        score += max(0, 20 - abs(ph - 6.5) * 8)  # pH ideal 6-7
        score += min(20, nitrogen / 5)  # nitrogen
        score += min(15, phosphorus / 3)  # phosphorus
        score += min(15, potassium / 20)  # potassium
        score += min(15, organic_matter * 3)  # organic matter
        score += min(15, cec / 4)  # CEC
        score = np.clip(score + np.random.normal(0, 5), 0, 100)

        records.append({
            "soil_ph": round(ph, 2), "nitrogen_ppm": round(nitrogen, 1),
            "phosphorus_ppm": round(phosphorus, 1), "potassium_ppm": round(potassium, 1),
            "organic_matter_pct": round(organic_matter, 2),
            "moisture_pct": round(moisture, 1),
            "sand_pct": round(texture_sand, 1), "clay_pct": round(texture_clay, 1),
            "silt_pct": round(texture_silt, 1),
            "cec": round(cec, 1), "ec_ds_m": round(electrical_conductivity, 3),
            "health_score": round(score, 1),
        })

    return pd.DataFrame(records)


# ============================================================================
# SOIL ANALYSIS MULTI-MODAL DATA (photo + lab + location)
# ============================================================================

SOIL_TYPE_PROPERTIES = {
    "loamy": {
        "color_rgb": (0.35, 0.25, 0.18), "color_var": 0.06,
        "ph_mean": 6.5, "ph_std": 0.5, "cec_mean": 20, "cec_std": 5,
        "om_mean": 3.5, "om_std": 1.0, "n_mean": 60, "p_mean": 25, "k_mean": 150,
        "moisture_mean": 30, "health_base": 75,
    },
    "clay": {
        "color_rgb": (0.55, 0.30, 0.15), "color_var": 0.04,
        "ph_mean": 7.0, "ph_std": 0.6, "cec_mean": 35, "cec_std": 8,
        "om_mean": 2.5, "om_std": 0.8, "n_mean": 45, "p_mean": 15, "k_mean": 200,
        "moisture_mean": 40, "health_base": 55,
    },
    "sandy": {
        "color_rgb": (0.65, 0.55, 0.40), "color_var": 0.08,
        "ph_mean": 6.0, "ph_std": 0.7, "cec_mean": 8, "cec_std": 3,
        "om_mean": 1.2, "om_std": 0.5, "n_mean": 25, "p_mean": 10, "k_mean": 80,
        "moisture_mean": 15, "health_base": 40,
    },
    "silt": {
        "color_rgb": (0.45, 0.38, 0.28), "color_var": 0.05,
        "ph_mean": 6.8, "ph_std": 0.4, "cec_mean": 18, "cec_std": 4,
        "om_mean": 3.0, "om_std": 0.9, "n_mean": 55, "p_mean": 22, "k_mean": 140,
        "moisture_mean": 35, "health_base": 65,
    },
    "volcanic": {
        "color_rgb": (0.20, 0.15, 0.12), "color_var": 0.03,
        "ph_mean": 5.5, "ph_std": 0.6, "cec_mean": 28, "cec_std": 6,
        "om_mean": 5.0, "om_std": 1.5, "n_mean": 80, "p_mean": 35, "k_mean": 180,
        "moisture_mean": 28, "health_base": 80,
    },
    "laterite": {
        "color_rgb": (0.60, 0.22, 0.10), "color_var": 0.04,
        "ph_mean": 5.0, "ph_std": 0.5, "cec_mean": 12, "cec_std": 4,
        "om_mean": 1.8, "om_std": 0.6, "n_mean": 30, "p_mean": 8, "k_mean": 100,
        "moisture_mean": 22, "health_base": 35,
    },
}

AFRICAN_FARM_LOCATIONS = [
    {"lat": -1.29, "lon": 36.82, "elev": 1795, "rain": 869, "temp": 17.6, "ndvi": 0.45},  # Nairobi, KE
    {"lat": 0.35, "lon": 32.58, "elev": 1189, "rain": 1230, "temp": 21.3, "ndvi": 0.55},  # Kampala, UG
    {"lat": -6.17, "lon": 35.74, "elev": 1119, "rain": 572, "temp": 22.8, "ndvi": 0.38},  # Dodoma, TZ
    {"lat": 9.05, "lon": 7.49, "elev": 476, "rain": 1180, "temp": 25.5, "ndvi": 0.50},   # Abuja, NG
    {"lat": 6.52, "lon": 3.37, "elev": 41, "rain": 1425, "temp": 26.8, "ndvi": 0.42},    # Lagos, NG
    {"lat": 9.02, "lon": 38.75, "elev": 2355, "rain": 1089, "temp": 15.9, "ndvi": 0.48},  # Addis, ET
    {"lat": -1.95, "lon": 30.06, "elev": 1567, "rain": 1028, "temp": 19.8, "ndvi": 0.52},  # Kigali, RW
    {"lat": -15.39, "lon": 28.32, "elev": 1279, "rain": 836, "temp": 20.5, "ndvi": 0.35},  # Lusaka, ZM
    {"lat": -13.97, "lon": 33.79, "elev": 1050, "rain": 892, "temp": 22.1, "ndvi": 0.40},  # Lilongwe, MW
    {"lat": -25.75, "lon": 28.19, "elev": 1339, "rain": 674, "temp": 18.7, "ndvi": 0.32},  # Pretoria, ZA
]


def _generate_soil_photo(soil_type: dict, img_size: int = 64) -> np.ndarray:
    """Generate a synthetic soil photo tensor (3, H, W) with realistic color and texture."""
    r_base, g_base, b_base = soil_type["color_rgb"]
    var = soil_type["color_var"]

    img = np.zeros((3, img_size, img_size), dtype=np.float32)

    # Base color with spatial noise (soil grain texture)
    for c, base in enumerate([r_base, g_base, b_base]):
        channel = np.random.normal(base, var, (img_size, img_size)).astype(np.float32)
        # Add low-frequency variation (clumps, moisture patches)
        freq = np.random.randint(2, 6)
        x = np.linspace(0, freq * np.pi, img_size)
        y = np.linspace(0, freq * np.pi, img_size)
        xx, yy = np.meshgrid(x, y)
        pattern = np.sin(xx + np.random.uniform(0, 2*np.pi)) * np.cos(yy + np.random.uniform(0, 2*np.pi))
        channel += (pattern * var * 0.5).astype(np.float32)
        # Add high-frequency grain noise
        grain = np.random.normal(0, var * 0.3, (img_size, img_size)).astype(np.float32)
        channel += grain
        img[c] = np.clip(channel, 0.0, 1.0)

    # Moisture darkening effect
    moisture_factor = soil_type["moisture_mean"] / 100.0
    if np.random.random() < 0.4:
        # Simulate wet patches
        cx, cy = np.random.randint(10, img_size-10, 2)
        radius = np.random.randint(8, 20)
        yy_grid, xx_grid = np.ogrid[:img_size, :img_size]
        mask = ((xx_grid - cx)**2 + (yy_grid - cy)**2) < radius**2
        img[:, mask] *= (1 - moisture_factor * 0.3)

    return img


def _compute_soil_labels(ph, n, p, k, om, cec, moisture, health_base):
    """Compute multi-output labels for soil health model."""
    # Health score (0-100)
    score = health_base
    score += max(-15, min(10, -(abs(ph - 6.5) * 6)))  # pH penalty/bonus
    score += min(8, n / 15)                              # N contribution
    score += min(6, p / 8)                               # P contribution
    score += min(6, k / 40)                              # K contribution
    score += min(8, om * 2)                               # OM contribution
    score += min(5, cec / 8)                              # CEC contribution
    score -= max(0, abs(moisture - 30) * 0.3)             # moisture penalty
    score = np.clip(score + np.random.normal(0, 3), 0, 100)

    # Fertility class (0-4): very_low, low, medium, high, very_high
    if score >= 80:
        fertility = 4
    elif score >= 60:
        fertility = 3
    elif score >= 40:
        fertility = 2
    elif score >= 20:
        fertility = 1
    else:
        fertility = 0

    # Recommendation labels (8 binary)
    recs = np.zeros(8, dtype=np.float32)
    if ph < 5.5:   recs[0] = 1.0   # add_lime
    if ph > 7.5:   recs[1] = 1.0   # add_sulfur
    if n < 40:     recs[2] = 1.0   # add_nitrogen
    if p < 15:     recs[3] = 1.0   # add_phosphorus
    if k < 100:    recs[4] = 1.0   # add_potassium
    if om < 2.0:   recs[5] = 1.0   # add_organic_matter
    if moisture > 50 or (cec > 35 and moisture > 35):
        recs[6] = 1.0               # improve_drainage
    if moisture < 15 or om < 1.5:
        recs[7] = 1.0               # add_mulch

    return round(float(score), 1), fertility, recs


def generate_soil_multimodal_data(
    n_samples: int = 5000, img_size: int = 64,
) -> Dict:
    """Generate multi-modal soil analysis training data.

    Returns dict with:
        photos: (N, 3, H, W) float32 photo tensors
        lab_readings: (N, 7) float32 [pH, N, P, K, OM, CEC, moisture]
        locations: (N, 6) float32 [lat, lon, elev, rain, temp, ndvi]
        health_scores: (N,) float32
        fertility_classes: (N,) int64 (0-4)
        recommendation_labels: (N, 8) float32
        soil_type_names: list of str
    """
    soil_type_names_list = list(SOIL_TYPE_PROPERTIES.keys())
    n_types = len(soil_type_names_list)

    photos = np.zeros((n_samples, 3, img_size, img_size), dtype=np.float32)
    lab_readings = np.zeros((n_samples, 7), dtype=np.float32)
    locations = np.zeros((n_samples, 6), dtype=np.float32)
    health_scores = np.zeros(n_samples, dtype=np.float32)
    fertility_classes = np.zeros(n_samples, dtype=np.int64)
    rec_labels = np.zeros((n_samples, 8), dtype=np.float32)
    type_names = []

    for i in range(n_samples):
        # Pick soil type
        st_name = soil_type_names_list[i % n_types]
        st = SOIL_TYPE_PROPERTIES[st_name]
        type_names.append(st_name)

        # Generate photo
        photos[i] = _generate_soil_photo(st, img_size)

        # Generate lab readings
        ph = np.clip(np.random.normal(st["ph_mean"], st["ph_std"]), 3.5, 9.5)
        n_val = max(5, np.random.normal(st["n_mean"], st["n_mean"] * 0.3))
        p_val = max(2, np.random.normal(st["p_mean"], st["p_mean"] * 0.3))
        k_val = max(20, np.random.normal(st["k_mean"], st["k_mean"] * 0.25))
        om = np.clip(np.random.normal(st["om_mean"], st["om_std"]), 0.1, 10)
        cec = max(2, np.random.normal(st["cec_mean"], st["cec_std"]))
        moisture = np.clip(np.random.normal(st["moisture_mean"], 8), 2, 65)

        lab_readings[i] = [ph, n_val, p_val, k_val, om, cec, moisture]

        # Pick location
        loc = AFRICAN_FARM_LOCATIONS[i % len(AFRICAN_FARM_LOCATIONS)]
        # Add jitter (±0.5 degrees, ±50m elev, ±100mm rain, ±2°C temp, ±0.1 NDVI)
        locations[i] = [
            loc["lat"] + np.random.normal(0, 0.2),
            loc["lon"] + np.random.normal(0, 0.2),
            loc["elev"] + np.random.normal(0, 50),
            max(100, loc["rain"] + np.random.normal(0, 100)),
            loc["temp"] + np.random.normal(0, 2),
            np.clip(loc["ndvi"] + np.random.normal(0, 0.1), 0, 1),
        ]

        # Compute labels
        score, fert, recs = _compute_soil_labels(
            ph, n_val, p_val, k_val, om, cec, moisture, st["health_base"]
        )
        health_scores[i] = score
        fertility_classes[i] = fert
        rec_labels[i] = recs

    return {
        "photos": photos,
        "lab_readings": lab_readings,
        "locations": locations,
        "health_scores": health_scores,
        "fertility_classes": fertility_classes,
        "recommendation_labels": rec_labels,
        "soil_type_names": type_names,
    }


# ============================================================================
# CLI: Generate all datasets
# ============================================================================

if __name__ == "__main__":
    output_dir = os.path.join(os.path.dirname(__file__), "generated")
    os.makedirs(output_dir, exist_ok=True)

    print("Generating crop disease data...")
    images, labels, class_names = generate_crop_disease_data(n_samples_per_class=200)
    np.savez_compressed(os.path.join(output_dir, "crop_disease.npz"),
                        images=images, labels=labels)
    with open(os.path.join(output_dir, "crop_disease_classes.json"), "w") as f:
        json.dump(class_names, f)
    print(f"  → {len(images)} images, {len(class_names)} classes")

    print("Generating yield prediction data...")
    yield_df = generate_yield_data(10000)
    yield_df.to_parquet(os.path.join(output_dir, "yield_data.parquet"), index=False)
    print(f"  → {len(yield_df)} records")

    print("Generating price timeseries data...")
    price_df = generate_price_timeseries()
    price_df.to_parquet(os.path.join(output_dir, "price_timeseries.parquet"), index=False)
    print(f"  → {len(price_df)} records")

    print("Generating credit scoring data...")
    credit_df = generate_credit_data(5000)
    credit_df.to_parquet(os.path.join(output_dir, "credit_scoring.parquet"), index=False)
    print(f"  → {len(credit_df)} records")

    print("Generating fraud detection data...")
    fraud_df = generate_fraud_data(10000)
    fraud_df.to_parquet(os.path.join(output_dir, "fraud_detection.parquet"), index=False)
    print(f"  → {len(fraud_df)} records, fraud rate: {fraud_df['is_fraud'].mean():.1%}")

    print("Generating graph data...")
    graph = generate_graph_data()
    with open(os.path.join(output_dir, "graph_data.json"), "w") as f:
        json.dump(graph, f)
    print(f"  → {len(graph['nodes'])} nodes, {len(graph['edges'])} edges")

    print("Generating soil health data (tabular)...")
    soil_df = generate_soil_health_data(3000)
    soil_df.to_parquet(os.path.join(output_dir, "soil_health.parquet"), index=False)
    print(f"  → {len(soil_df)} records")

    print("Generating soil multi-modal data (photo + lab + location)...")
    soil_mm = generate_soil_multimodal_data(5000, img_size=64)
    np.savez_compressed(
        os.path.join(output_dir, "soil_multimodal.npz"),
        photos=soil_mm["photos"],
        lab_readings=soil_mm["lab_readings"],
        locations=soil_mm["locations"],
        health_scores=soil_mm["health_scores"],
        fertility_classes=soil_mm["fertility_classes"],
        recommendation_labels=soil_mm["recommendation_labels"],
    )
    with open(os.path.join(output_dir, "soil_type_names.json"), "w") as f:
        json.dump(soil_mm["soil_type_names"], f)
    print(f"  → {len(soil_mm['photos'])} multi-modal samples, {len(set(soil_mm['soil_type_names']))} soil types")

    print("\nAll synthetic datasets generated successfully!")
