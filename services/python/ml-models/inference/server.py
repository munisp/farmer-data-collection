"""
ML Inference Server (FastAPI)

Loads all trained PyTorch models and serves predictions via REST API.
All inference runs on CPU — no GPU required.

Endpoints:
    POST /predict/disease       — Crop disease classification from image
    POST /predict/yield         — Yield prediction from farm features
    POST /predict/price         — Price forecast from historical data
    POST /predict/credit        — Credit scoring for loan application
    POST /predict/fraud         — Transaction fraud detection
    POST /predict/graph/credit  — GNN-based credit scoring
    GET  /models                — List loaded models and metadata
    GET  /health                — Service health check

Port: 8096 (configurable via PORT env var)
"""

import os
import sys
import json
import time
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any

import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from models.crop_disease_cnn import CropDiseaseCNN
from models.yield_predictor import YieldPredictor
from models.price_lstm import PriceLSTM
from models.credit_scorer import CreditScorer
from models.fraud_detector import FraudDetector
from models.farmer_gnn import FarmerGraphNet

logging.basicConfig(level=logging.INFO, format="%(asctime)s [inference] %(message)s")
logger = logging.getLogger("inference")

WEIGHTS_DIR = PROJECT_ROOT / "weights"
DEVICE = torch.device("cpu")  # Always CPU for inference

app = FastAPI(
    title="FarmConnect ML Inference API",
    description="Real-time ML predictions for crop disease, yield, price, credit, fraud",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)


# ============================================================================
# MODEL REGISTRY
# ============================================================================

_models: Dict[str, Any] = {}
_model_metadata: Dict[str, Dict] = {}


def load_models():
    """Load all trained model weights from disk."""
    # Disease CNN
    disease_path = WEIGHTS_DIR / "crop_disease_cnn.pt"
    if disease_path.exists():
        ckpt = torch.load(disease_path, map_location=DEVICE, weights_only=False)
        model = CropDiseaseCNN(num_classes=ckpt["num_classes"])
        model.load_state_dict(ckpt["model_state_dict"])
        model.eval()
        _models["disease"] = model
        _model_metadata["disease"] = {
            "class_names": ckpt["class_names"],
            "val_accuracy": ckpt["val_accuracy"],
            "params": model.get_num_params(),
        }
        logger.info(f"Loaded disease CNN ({model.get_num_params():,} params, acc={ckpt['val_accuracy']:.3f})")

    # Yield predictor
    yield_path = WEIGHTS_DIR / "yield_predictor.pt"
    if yield_path.exists():
        ckpt = torch.load(yield_path, map_location=DEVICE, weights_only=False)
        model = YieldPredictor()
        model.load_state_dict(ckpt["model_state_dict"])
        model.eval()
        _models["yield"] = model
        _model_metadata["yield"] = {
            "cat_maps": ckpt["cat_maps"],
            "num_stats": ckpt["num_stats"],
            "target_mean": ckpt["target_mean"],
            "target_std": ckpt["target_std"],
            "val_rmse": ckpt["val_rmse"],
            "params": model.get_num_params(),
        }
        logger.info(f"Loaded yield predictor ({model.get_num_params():,} params, RMSE={ckpt['val_rmse']:.1f})")

    # Price LSTM
    price_path = WEIGHTS_DIR / "price_lstm.pt"
    if price_path.exists():
        ckpt = torch.load(price_path, map_location=DEVICE, weights_only=False)
        model = PriceLSTM(forecast_horizon=ckpt["forecast_horizon"])
        model.load_state_dict(ckpt["model_state_dict"])
        model.eval()
        _models["price"] = model
        _model_metadata["price"] = {
            "forecast_horizon": ckpt["forecast_horizon"],
            "lookback": ckpt["lookback"],
            "val_loss": ckpt["val_loss"],
            "params": model.get_num_params(),
        }
        logger.info(f"Loaded price LSTM ({model.get_num_params():,} params)")

    # Credit scorer
    credit_path = WEIGHTS_DIR / "credit_scorer.pt"
    if credit_path.exists():
        ckpt = torch.load(credit_path, map_location=DEVICE, weights_only=False)
        model = CreditScorer()
        model.load_state_dict(ckpt["model_state_dict"])
        model.eval()
        _models["credit"] = model
        _model_metadata["credit"] = {
            "feature_cols": ckpt["feature_cols"],
            "feat_mean": ckpt["feat_mean"],
            "feat_std": ckpt["feat_std"],
            "val_auc": ckpt["val_auc"],
            "params": model.get_num_params(),
        }
        logger.info(f"Loaded credit scorer ({model.get_num_params():,} params, AUC={ckpt['val_auc']:.3f})")

    # Fraud detector
    fraud_path = WEIGHTS_DIR / "fraud_detector.pt"
    if fraud_path.exists():
        ckpt = torch.load(fraud_path, map_location=DEVICE, weights_only=False)
        model = FraudDetector()
        model.load_state_dict(ckpt["model_state_dict"])
        model.eval()
        _models["fraud"] = model
        _model_metadata["fraud"] = {
            "feature_cols": ckpt["feature_cols"],
            "feat_mean": ckpt["feat_mean"],
            "feat_std": ckpt["feat_std"],
            "val_f1": ckpt["val_f1"],
            "params": model.get_num_params(),
        }
        logger.info(f"Loaded fraud detector ({model.get_num_params():,} params, F1={ckpt['val_f1']:.3f})")

    # GNN
    gnn_path = WEIGHTS_DIR / "farmer_gnn.pt"
    if gnn_path.exists():
        ckpt = torch.load(gnn_path, map_location=DEVICE, weights_only=False)
        model = FarmerGraphNet()
        model.load_state_dict(ckpt["model_state_dict"])
        model.eval()
        _models["gnn"] = model
        _model_metadata["gnn"] = {
            "loss": ckpt["loss"],
            "params": model.get_num_params(),
        }
        logger.info(f"Loaded GNN ({model.get_num_params():,} params)")

    logger.info(f"Total models loaded: {len(_models)}")


# ============================================================================
# REQUEST / RESPONSE MODELS
# ============================================================================

class DiseaseRequest(BaseModel):
    image: List[List[List[float]]] = Field(..., description="3×H×W normalized image tensor")

class YieldRequest(BaseModel):
    crop: str
    region: str
    soil_type: str
    fertilizer: str
    irrigation: str
    farm_size_ha: float
    rainfall_mm: float
    temperature_c: float
    elevation_m: float
    soil_ph: float
    nitrogen_ppm: float
    phosphorus_ppm: float
    potassium_ppm: float
    organic_matter_pct: float
    ndvi: float
    planting_month: int

class PriceRequest(BaseModel):
    prices: List[float] = Field(..., description="At least 60 historical daily prices")
    volumes: List[float] = Field(..., description="Corresponding daily volumes")

class CreditRequest(BaseModel):
    features: List[float] = Field(..., description="15 credit features in order")

class FraudRequest(BaseModel):
    features: List[float] = Field(..., description="15 transaction features")
    threshold: float = Field(0.5, description="Classification threshold")


# ============================================================================
# ENDPOINTS
# ============================================================================

@app.on_event("startup")
async def startup():
    load_models()


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "models_loaded": list(_models.keys()),
        "device": str(DEVICE),
    }


@app.get("/models")
async def list_models():
    return {
        name: {
            "loaded": True,
            "params": meta.get("params", 0),
            **{k: v for k, v in meta.items() if k != "params" and k not in ("feat_mean", "feat_std", "cat_maps", "num_stats")},
        }
        for name, meta in _model_metadata.items()
    }


@app.post("/predict/disease")
async def predict_disease(req: DiseaseRequest):
    if "disease" not in _models:
        raise HTTPException(503, "Disease model not loaded. Run training first.")
    t0 = time.time()
    img = torch.tensor([req.image], dtype=torch.float32)
    result = _models["disease"].predict(img)
    class_names = _model_metadata["disease"]["class_names"]
    result["disease_name"] = class_names[result["predicted_class"]]
    result["inference_ms"] = round((time.time() - t0) * 1000, 1)
    return result


@app.post("/predict/yield")
async def predict_yield(req: YieldRequest):
    if "yield" not in _models:
        raise HTTPException(503, "Yield model not loaded. Run training first.")
    t0 = time.time()
    meta = _model_metadata["yield"]

    cat_tensors = {}
    for col in ["crop", "region", "soil_type", "fertilizer", "irrigation"]:
        val = getattr(req, col)
        mapping = meta["cat_maps"][col]
        if val not in mapping:
            raise HTTPException(400, f"Unknown {col}: {val}. Valid: {list(mapping.keys())}")
        cat_tensors[col] = torch.tensor([mapping[val]], dtype=torch.long)

    num_cols = [
        "farm_size_ha", "rainfall_mm", "temperature_c", "elevation_m",
        "soil_ph", "nitrogen_ppm", "phosphorus_ppm", "potassium_ppm",
        "organic_matter_pct", "ndvi", "planting_month",
    ]
    num_vals = []
    for col in num_cols:
        val = getattr(req, col)
        stats = meta["num_stats"][col]
        num_vals.append((val - stats["mean"]) / (stats["std"] + 1e-8))
    num_tensor = torch.tensor([num_vals], dtype=torch.float32)

    model = _models["yield"]
    model.eval()
    with torch.no_grad():
        pred_norm = model(cat_tensors, num_tensor).item()
    pred = pred_norm * meta["target_std"] + meta["target_mean"]
    pred = max(0, pred)

    return {
        "predicted_yield_kg_per_ha": round(pred, 1),
        "total_yield_kg": round(pred * req.farm_size_ha, 1),
        "inference_ms": round((time.time() - t0) * 1000, 1),
    }


@app.post("/predict/price")
async def predict_price(req: PriceRequest):
    if "price" not in _models:
        raise HTTPException(503, "Price model not loaded. Run training first.")
    t0 = time.time()
    meta = _model_metadata["price"]
    lookback = meta["lookback"]

    if len(req.prices) < lookback:
        raise HTTPException(400, f"Need at least {lookback} historical prices, got {len(req.prices)}")

    prices = np.array(req.prices[-lookback:], dtype=np.float32)
    volumes = np.log1p(np.array(req.volumes[-lookback:], dtype=np.float32))

    price_mean, price_std = prices.mean(), prices.std() + 1e-8
    prices_norm = (prices - price_mean) / price_std
    vol_mean, vol_std = volumes.mean(), volumes.std() + 1e-8
    volumes_norm = (volumes - vol_mean) / vol_std

    days = np.arange(lookback)
    features = np.stack([
        prices_norm, volumes_norm,
        np.sin(2 * np.pi * (days % 7) / 7),
        np.cos(2 * np.pi * (days % 7) / 7),
        np.sin(2 * np.pi * (days % 365) / 365),
    ], axis=1)

    x = torch.tensor(features, dtype=torch.float32).unsqueeze(0)
    result = _models["price"].predict(x, float(price_mean), float(price_std))
    result["inference_ms"] = round((time.time() - t0) * 1000, 1)
    return result


@app.post("/predict/credit")
async def predict_credit(req: CreditRequest):
    if "credit" not in _models:
        raise HTTPException(503, "Credit model not loaded. Run training first.")
    t0 = time.time()
    meta = _model_metadata["credit"]

    features = np.array(req.features, dtype=np.float32)
    feat_mean = np.array(meta["feat_mean"])
    feat_std = np.array(meta["feat_std"])
    features_norm = (features - feat_mean) / feat_std

    x = torch.tensor(features_norm, dtype=torch.float32).unsqueeze(0)
    result = _models["credit"].predict(x)
    result["inference_ms"] = round((time.time() - t0) * 1000, 1)
    return result


@app.post("/predict/fraud")
async def predict_fraud(req: FraudRequest):
    if "fraud" not in _models:
        raise HTTPException(503, "Fraud model not loaded. Run training first.")
    t0 = time.time()
    meta = _model_metadata["fraud"]

    features = np.array(req.features, dtype=np.float32)
    feat_mean = np.array(meta["feat_mean"])
    feat_std = np.array(meta["feat_std"])
    features_norm = (features - feat_mean) / feat_std

    x = torch.tensor(features_norm, dtype=torch.float32).unsqueeze(0)
    result = _models["fraud"].predict(x, threshold=req.threshold)
    result["inference_ms"] = round((time.time() - t0) * 1000, 1)
    return result


# ============================================================================
# ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8096"))
    uvicorn.run(app, host="0.0.0.0", port=port)
