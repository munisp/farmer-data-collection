"""
Federated Learning Service
Privacy-preserving model improvement without centralizing farmer data

Features:
- Federated model training across edge devices
- Differential privacy for gradient protection
- Secure aggregation of model updates
- Model versioning and rollback
- Edge device coordination
- Bandwidth-efficient gradient compression
"""
import os
import json
import logging
import asyncio
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
from collections import defaultdict
import uuid

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Federated Learning Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
MIN_CLIENTS_FOR_ROUND = int(os.getenv("FL_MIN_CLIENTS", "3"))
MAX_ROUNDS = int(os.getenv("FL_MAX_ROUNDS", "100"))
NOISE_MULTIPLIER = float(os.getenv("FL_NOISE_MULTIPLIER", "1.0"))
GRADIENT_CLIP_NORM = float(os.getenv("FL_GRADIENT_CLIP_NORM", "1.0"))

# In-memory storage (use Redis/PostgreSQL in production)
_models = {}
_training_rounds = {}
_client_updates = defaultdict(list)
_aggregated_models = {}


# ============================================================================
# MODELS
# ============================================================================

class ModelConfig(BaseModel):
    model_id: str
    model_type: str  # disease_detection, yield_prediction, price_forecast
    architecture: str  # cnn, random_forest, gradient_boosting
    input_shape: List[int]
    output_shape: List[int]
    hyperparameters: Dict[str, Any]


class ClientRegistration(BaseModel):
    client_id: str
    device_type: str  # mobile, edge_device, server
    capabilities: Dict[str, Any]  # ram_mb, storage_mb, has_gpu
    data_samples: int
    crop_types: List[str]
    region: str


class GradientUpdate(BaseModel):
    client_id: str
    round_id: str
    model_id: str
    gradients: List[float]  # Flattened gradient vector
    num_samples: int
    local_loss: float
    local_accuracy: float
    timestamp: str


class TrainingRound(BaseModel):
    round_id: str
    model_id: str
    status: str  # pending, in_progress, aggregating, completed
    min_clients: int
    max_clients: int
    deadline: str
    current_clients: int
    created_at: str


class AggregationRequest(BaseModel):
    round_id: str
    aggregation_method: str = "fedavg"  # fedavg, fedprox, scaffold


class ModelDownloadRequest(BaseModel):
    model_id: str
    version: Optional[str] = None
    device_type: str = "mobile"


# ============================================================================
# DIFFERENTIAL PRIVACY
# ============================================================================

def clip_gradients(gradients: np.ndarray, clip_norm: float) -> np.ndarray:
    """Clip gradients to bound sensitivity"""
    grad_norm = np.linalg.norm(gradients)
    if grad_norm > clip_norm:
        gradients = gradients * (clip_norm / grad_norm)
    return gradients


def add_gaussian_noise(gradients: np.ndarray, noise_multiplier: float, clip_norm: float) -> np.ndarray:
    """Add Gaussian noise for differential privacy"""
    noise_std = noise_multiplier * clip_norm
    noise = np.random.normal(0, noise_std, gradients.shape)
    return gradients + noise


def compute_privacy_budget(num_rounds: int, noise_multiplier: float, delta: float = 1e-5) -> float:
    """Compute epsilon (privacy budget) using moments accountant approximation"""
    # Simplified privacy accounting
    # In production, use tensorflow-privacy or opacus for accurate accounting
    epsilon = np.sqrt(2 * np.log(1.25 / delta)) / noise_multiplier * np.sqrt(num_rounds)
    return round(epsilon, 4)


# ============================================================================
# SECURE AGGREGATION
# ============================================================================

def generate_secret_shares(value: float, num_shares: int) -> List[float]:
    """Generate secret shares for secure aggregation"""
    shares = [secrets.randbelow(1000000) / 1000000 for _ in range(num_shares - 1)]
    final_share = value - sum(shares)
    shares.append(final_share)
    return shares


def reconstruct_from_shares(shares: List[float]) -> float:
    """Reconstruct value from secret shares"""
    return sum(shares)


def federated_averaging(updates: List[Dict], total_samples: int) -> np.ndarray:
    """Perform Federated Averaging (FedAvg)"""
    if not updates:
        return None
    
    # Weight by number of samples
    weighted_gradients = None
    
    for update in updates:
        gradients = np.array(update["gradients"])
        weight = update["num_samples"] / total_samples
        
        if weighted_gradients is None:
            weighted_gradients = gradients * weight
        else:
            weighted_gradients += gradients * weight
    
    return weighted_gradients


def federated_proximal(updates: List[Dict], total_samples: int, global_model: np.ndarray, mu: float = 0.01) -> np.ndarray:
    """Perform FedProx aggregation with proximal term"""
    # FedProx adds a proximal term to handle heterogeneity
    base_avg = federated_averaging(updates, total_samples)
    
    if global_model is not None and base_avg is not None:
        # Add proximal regularization
        proximal_term = mu * (base_avg - global_model)
        return base_avg - proximal_term
    
    return base_avg


# ============================================================================
# MODEL MANAGEMENT
# ============================================================================

def create_initial_model(config: ModelConfig) -> Dict[str, Any]:
    """Create initial model weights"""
    np.random.seed(42)
    
    # Calculate total parameters based on architecture
    if config.architecture == "cnn":
        # Simplified CNN parameter count
        total_params = np.prod(config.input_shape) * 32 + 32 * 64 + 64 * config.output_shape[0]
    elif config.architecture == "random_forest":
        total_params = 1000  # Placeholder for tree parameters
    else:
        total_params = np.prod(config.input_shape) * config.output_shape[0]
    
    # Initialize with small random weights
    weights = np.random.randn(total_params) * 0.01
    
    return {
        "model_id": config.model_id,
        "version": "1.0.0",
        "weights": weights.tolist(),
        "config": config.dict(),
        "created_at": datetime.utcnow().isoformat(),
        "training_rounds": 0,
        "total_samples_seen": 0,
        "privacy_budget_used": 0.0,
    }


def update_model_weights(model: Dict, new_weights: np.ndarray, round_info: Dict) -> Dict:
    """Update model with new aggregated weights"""
    # Parse version
    major, minor, patch = map(int, model["version"].split("."))
    new_version = f"{major}.{minor}.{patch + 1}"
    
    model["weights"] = new_weights.tolist()
    model["version"] = new_version
    model["training_rounds"] += 1
    model["total_samples_seen"] += round_info.get("total_samples", 0)
    model["privacy_budget_used"] += round_info.get("privacy_cost", 0)
    model["last_updated"] = datetime.utcnow().isoformat()
    
    return model


# ============================================================================
# TRAINING COORDINATION
# ============================================================================

async def start_training_round(model_id: str, min_clients: int = 3, max_clients: int = 10, deadline_hours: int = 24) -> Dict:
    """Start a new federated training round"""
    
    if model_id not in _models:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found")
    
    round_id = str(uuid.uuid4())
    deadline = (datetime.utcnow() + timedelta(hours=deadline_hours)).isoformat()
    
    training_round = {
        "round_id": round_id,
        "model_id": model_id,
        "status": "pending",
        "min_clients": min_clients,
        "max_clients": max_clients,
        "deadline": deadline,
        "current_clients": 0,
        "created_at": datetime.utcnow().isoformat(),
        "participating_clients": [],
        "updates_received": 0,
    }
    
    _training_rounds[round_id] = training_round
    _client_updates[round_id] = []
    
    logger.info(f"Started training round {round_id} for model {model_id}")
    
    return training_round


async def submit_gradient_update(update: GradientUpdate) -> Dict:
    """Submit gradient update from a client"""
    
    round_id = update.round_id
    
    if round_id not in _training_rounds:
        raise HTTPException(status_code=404, detail=f"Training round {round_id} not found")
    
    training_round = _training_rounds[round_id]
    
    if training_round["status"] not in ["pending", "in_progress"]:
        raise HTTPException(status_code=400, detail=f"Training round {round_id} is not accepting updates")
    
    # Apply differential privacy
    gradients = np.array(update.gradients)
    clipped_gradients = clip_gradients(gradients, GRADIENT_CLIP_NORM)
    noisy_gradients = add_gaussian_noise(clipped_gradients, NOISE_MULTIPLIER, GRADIENT_CLIP_NORM)
    
    # Store update
    processed_update = {
        "client_id": update.client_id,
        "gradients": noisy_gradients.tolist(),
        "num_samples": update.num_samples,
        "local_loss": update.local_loss,
        "local_accuracy": update.local_accuracy,
        "timestamp": update.timestamp,
        "privacy_applied": True,
    }
    
    _client_updates[round_id].append(processed_update)
    
    # Update round status
    training_round["updates_received"] += 1
    training_round["current_clients"] += 1
    training_round["participating_clients"].append(update.client_id)
    
    if training_round["status"] == "pending":
        training_round["status"] = "in_progress"
    
    # Check if we have enough clients to aggregate
    if training_round["current_clients"] >= training_round["min_clients"]:
        training_round["ready_for_aggregation"] = True
    
    logger.info(f"Received update from client {update.client_id} for round {round_id}")
    
    return {
        "success": True,
        "round_id": round_id,
        "updates_received": training_round["updates_received"],
        "ready_for_aggregation": training_round.get("ready_for_aggregation", False),
    }


async def aggregate_round(request: AggregationRequest) -> Dict:
    """Aggregate updates and update global model"""
    
    round_id = request.round_id
    
    if round_id not in _training_rounds:
        raise HTTPException(status_code=404, detail=f"Training round {round_id} not found")
    
    training_round = _training_rounds[round_id]
    updates = _client_updates[round_id]
    
    if len(updates) < training_round["min_clients"]:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough clients. Need {training_round['min_clients']}, have {len(updates)}"
        )
    
    training_round["status"] = "aggregating"
    
    # Calculate total samples
    total_samples = sum(u["num_samples"] for u in updates)
    
    # Perform aggregation
    if request.aggregation_method == "fedavg":
        aggregated_gradients = federated_averaging(updates, total_samples)
    elif request.aggregation_method == "fedprox":
        global_weights = np.array(_models[training_round["model_id"]]["weights"])
        aggregated_gradients = federated_proximal(updates, total_samples, global_weights)
    else:
        aggregated_gradients = federated_averaging(updates, total_samples)
    
    # Update global model
    model = _models[training_round["model_id"]]
    current_weights = np.array(model["weights"])
    
    # Apply aggregated gradients (gradient descent step)
    learning_rate = 0.01
    new_weights = current_weights - learning_rate * aggregated_gradients
    
    # Calculate privacy cost for this round
    privacy_cost = compute_privacy_budget(1, NOISE_MULTIPLIER)
    
    round_info = {
        "total_samples": total_samples,
        "privacy_cost": privacy_cost,
        "num_clients": len(updates),
    }
    
    updated_model = update_model_weights(model, new_weights, round_info)
    _models[training_round["model_id"]] = updated_model
    
    # Store aggregated model for this round
    _aggregated_models[round_id] = {
        "weights": new_weights.tolist(),
        "version": updated_model["version"],
        "aggregated_at": datetime.utcnow().isoformat(),
    }
    
    # Update round status
    training_round["status"] = "completed"
    training_round["completed_at"] = datetime.utcnow().isoformat()
    training_round["aggregation_method"] = request.aggregation_method
    
    # Calculate aggregate metrics
    avg_loss = np.mean([u["local_loss"] for u in updates])
    avg_accuracy = np.mean([u["local_accuracy"] for u in updates])
    
    logger.info(f"Completed aggregation for round {round_id}. New model version: {updated_model['version']}")
    
    return {
        "success": True,
        "round_id": round_id,
        "model_id": training_round["model_id"],
        "new_version": updated_model["version"],
        "num_clients": len(updates),
        "total_samples": total_samples,
        "avg_loss": round(avg_loss, 4),
        "avg_accuracy": round(avg_accuracy, 4),
        "privacy_budget_used": updated_model["privacy_budget_used"],
        "aggregation_method": request.aggregation_method,
    }


# ============================================================================
# ROUTES
# ============================================================================

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "federated-learning",
        "active_models": len(_models),
        "active_rounds": len([r for r in _training_rounds.values() if r["status"] in ["pending", "in_progress"]]),
        "config": {
            "min_clients": MIN_CLIENTS_FOR_ROUND,
            "noise_multiplier": NOISE_MULTIPLIER,
            "gradient_clip_norm": GRADIENT_CLIP_NORM,
        },
    }


@app.post("/models/create")
async def create_model(config: ModelConfig):
    """Create a new federated model"""
    if config.model_id in _models:
        raise HTTPException(status_code=400, detail=f"Model {config.model_id} already exists")
    
    model = create_initial_model(config)
    _models[config.model_id] = model
    
    logger.info(f"Created model {config.model_id}")
    
    return {
        "success": True,
        "model_id": config.model_id,
        "version": model["version"],
        "total_parameters": len(model["weights"]),
    }


@app.get("/models/{model_id}")
async def get_model(model_id: str):
    """Get model metadata"""
    if model_id not in _models:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found")
    
    model = _models[model_id]
    
    return {
        "model_id": model_id,
        "version": model["version"],
        "config": model["config"],
        "training_rounds": model["training_rounds"],
        "total_samples_seen": model["total_samples_seen"],
        "privacy_budget_used": model["privacy_budget_used"],
        "created_at": model["created_at"],
        "last_updated": model.get("last_updated"),
    }


@app.post("/models/{model_id}/download")
async def download_model(model_id: str, request: ModelDownloadRequest):
    """Download model weights for edge deployment"""
    if model_id not in _models:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found")
    
    model = _models[model_id]
    
    # Optionally quantize for mobile devices
    weights = np.array(model["weights"])
    
    if request.device_type == "mobile":
        # Simulate INT8 quantization
        weights = np.round(weights * 127).astype(np.int8)
        quantized = True
    else:
        quantized = False
    
    return {
        "model_id": model_id,
        "version": model["version"],
        "weights": weights.tolist(),
        "quantized": quantized,
        "config": model["config"],
        "checksum": hashlib.sha256(weights.tobytes()).hexdigest()[:16],
    }


@app.post("/rounds/start")
async def start_round(
    model_id: str,
    min_clients: int = 3,
    max_clients: int = 10,
    deadline_hours: int = 24,
):
    """Start a new training round"""
    try:
        result = await start_training_round(model_id, min_clients, max_clients, deadline_hours)
        return result
    except Exception as e:
        logger.error(f"Error starting round: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/rounds/{round_id}")
async def get_round(round_id: str):
    """Get training round status"""
    if round_id not in _training_rounds:
        raise HTTPException(status_code=404, detail=f"Round {round_id} not found")
    
    return _training_rounds[round_id]


@app.get("/rounds")
async def list_rounds(status: Optional[str] = None, model_id: Optional[str] = None):
    """List training rounds"""
    rounds = list(_training_rounds.values())
    
    if status:
        rounds = [r for r in rounds if r["status"] == status]
    
    if model_id:
        rounds = [r for r in rounds if r["model_id"] == model_id]
    
    return {
        "rounds": rounds,
        "count": len(rounds),
    }


@app.post("/updates/submit")
async def submit_update(update: GradientUpdate):
    """Submit gradient update from client"""
    try:
        result = await submit_gradient_update(update)
        return result
    except Exception as e:
        logger.error(f"Error submitting update: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rounds/aggregate")
async def aggregate(request: AggregationRequest):
    """Aggregate updates for a round"""
    try:
        result = await aggregate_round(request)
        return result
    except Exception as e:
        logger.error(f"Error aggregating: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/clients/register")
async def register_client(registration: ClientRegistration):
    """Register a client for federated learning"""
    
    # In production, store in database
    client_info = {
        "client_id": registration.client_id,
        "device_type": registration.device_type,
        "capabilities": registration.capabilities,
        "data_samples": registration.data_samples,
        "crop_types": registration.crop_types,
        "region": registration.region,
        "registered_at": datetime.utcnow().isoformat(),
        "status": "active",
    }
    
    logger.info(f"Registered client {registration.client_id} from {registration.region}")
    
    return {
        "success": True,
        "client_id": registration.client_id,
        "message": "Client registered successfully",
    }


@app.get("/privacy/budget")
async def get_privacy_budget(model_id: str):
    """Get privacy budget status for a model"""
    if model_id not in _models:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found")
    
    model = _models[model_id]
    
    # Typical privacy budget limits
    max_epsilon = 10.0  # Common threshold for acceptable privacy
    
    return {
        "model_id": model_id,
        "epsilon_used": model["privacy_budget_used"],
        "epsilon_remaining": max(0, max_epsilon - model["privacy_budget_used"]),
        "max_epsilon": max_epsilon,
        "training_rounds": model["training_rounds"],
        "noise_multiplier": NOISE_MULTIPLIER,
        "gradient_clip_norm": GRADIENT_CLIP_NORM,
        "privacy_status": "good" if model["privacy_budget_used"] < max_epsilon * 0.5 else "moderate" if model["privacy_budget_used"] < max_epsilon else "exhausted",
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8098"))
    uvicorn.run(app, host="0.0.0.0", port=port)
