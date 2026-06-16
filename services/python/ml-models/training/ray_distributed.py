"""
Ray Distributed Training for FarmConnect ML Models

Enables distributed training across multiple workers for:
- Hyperparameter tuning (Ray Tune)
- Distributed data-parallel training (Ray Train)
- Model serving autoscaling (Ray Serve)

Falls back to single-node training if Ray is not available.

Usage:
    python -m training.ray_distributed --model disease --num-workers 4
    python -m training.ray_distributed --model yield --tune
"""

import os
import sys
import logging
import argparse
import time
from pathlib import Path
from typing import Dict, Optional

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset, random_split

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from data.synthetic_generator import generate_crop_disease_data, generate_yield_data
from models.crop_disease_cnn import CropDiseaseCNN
from models.yield_predictor import YieldPredictor

logging.basicConfig(level=logging.INFO, format="%(asctime)s [ray_train] %(message)s")
logger = logging.getLogger("ray_train")

WEIGHTS_DIR = PROJECT_ROOT / "weights"
WEIGHTS_DIR.mkdir(exist_ok=True)

# Try to import Ray
try:
    import ray
    from ray import train as ray_train
    from ray.train.torch import TorchTrainer
    from ray.train import ScalingConfig, RunConfig, CheckpointConfig
    RAY_AVAILABLE = True
except ImportError:
    RAY_AVAILABLE = False
    logger.warning("Ray not installed. Falling back to single-node training.")


# ============================================================================
# RAY TRAINING FUNCTIONS
# ============================================================================

def _disease_train_func(config: Dict):
    """Per-worker training function for Ray distributed training."""
    epochs = config.get("epochs", 30)
    lr = config.get("lr", 1e-3)
    batch_size = config.get("batch_size", 64)

    images, labels, class_names = generate_crop_disease_data(n_samples_per_class=200)
    X = torch.tensor(images, dtype=torch.float32)
    y = torch.tensor(labels, dtype=torch.long)

    dataset = TensorDataset(X, y)
    train_size = int(0.8 * len(dataset))
    val_size = len(dataset) - train_size
    train_ds, val_ds = random_split(dataset, [train_size, val_size],
                                     generator=torch.Generator().manual_seed(42))

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size)

    if RAY_AVAILABLE:
        train_loader = ray_train.torch.prepare_data_loader(train_loader)
        val_loader = ray_train.torch.prepare_data_loader(val_loader)

    model = CropDiseaseCNN(num_classes=len(class_names))
    if RAY_AVAILABLE:
        model = ray_train.torch.prepare_model(model)

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = nn.CrossEntropyLoss()

    for epoch in range(epochs):
        model.train()
        total_loss, correct, total = 0.0, 0, 0
        for xb, yb in train_loader:
            optimizer.zero_grad()
            logits = model(xb)
            loss = criterion(logits, yb)
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * xb.size(0)
            correct += (logits.argmax(1) == yb).sum().item()
            total += xb.size(0)
        scheduler.step()

        model.eval()
        val_correct, val_total = 0, 0
        with torch.no_grad():
            for xb, yb in val_loader:
                logits = model(xb)
                val_correct += (logits.argmax(1) == yb).sum().item()
                val_total += xb.size(0)

        metrics = {
            "epoch": epoch,
            "train_loss": total_loss / max(total, 1),
            "train_accuracy": correct / max(total, 1),
            "val_accuracy": val_correct / max(val_total, 1),
        }

        if RAY_AVAILABLE:
            ray_train.report(metrics)
        elif (epoch + 1) % 5 == 0:
            logger.info(f"  Epoch {epoch+1}/{epochs} | {metrics}")


def _yield_train_func(config: Dict):
    """Per-worker training function for yield predictor."""
    epochs = config.get("epochs", 40)
    lr = config.get("lr", 1e-3)
    batch_size = config.get("batch_size", 128)

    df = generate_yield_data(10000)

    cat_cols = ["crop", "region", "soil_type", "fertilizer", "irrigation"]
    cat_maps = {}
    for col in cat_cols:
        unique_vals = sorted(df[col].unique())
        cat_maps[col] = {v: i for i, v in enumerate(unique_vals)}
        df[col + "_enc"] = df[col].map(cat_maps[col])

    num_cols = [
        "farm_size_ha", "rainfall_mm", "temperature_c", "elevation_m",
        "soil_ph", "nitrogen_ppm", "phosphorus_ppm", "potassium_ppm",
        "organic_matter_pct", "ndvi", "planting_month",
    ]
    for col in num_cols:
        mean, std = df[col].mean(), df[col].std() + 1e-8
        df[col + "_norm"] = (df[col] - mean) / std

    target = df["yield_kg_per_ha"].values
    target_mean, target_std = target.mean(), target.std() + 1e-8
    target_norm = (target - target_mean) / target_std

    cat_tensors = {
        col: torch.tensor(df[col + "_enc"].values, dtype=torch.long)
        for col in cat_cols
    }
    num_tensor = torch.tensor(
        df[[c + "_norm" for c in num_cols]].values, dtype=torch.float32
    )
    target_tensor = torch.tensor(target_norm, dtype=torch.float32).unsqueeze(1)

    n = len(df)
    indices = torch.randperm(n, generator=torch.Generator().manual_seed(42))
    split = int(0.8 * n)
    train_idx, val_idx = indices[:split], indices[split:]

    model = YieldPredictor()
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    criterion = nn.MSELoss()

    for epoch in range(epochs):
        model.train()
        perm = train_idx[torch.randperm(len(train_idx))]
        total_loss, n_batches = 0.0, 0

        for i in range(0, len(perm), batch_size):
            idx = perm[i:i + batch_size]
            cat_batch = {k: v[idx] for k, v in cat_tensors.items()}
            num_batch = num_tensor[idx]
            y_batch = target_tensor[idx]

            optimizer.zero_grad()
            pred = model(cat_batch, num_batch)
            loss = criterion(pred, y_batch)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            n_batches += 1

        model.eval()
        with torch.no_grad():
            cat_val = {k: v[val_idx] for k, v in cat_tensors.items()}
            pred_val = model(cat_val, num_tensor[val_idx])
            val_mse = criterion(pred_val, target_tensor[val_idx]).item()
            val_rmse = (val_mse ** 0.5) * target_std

        metrics = {
            "epoch": epoch,
            "train_loss": total_loss / max(n_batches, 1),
            "val_rmse_kg_ha": float(val_rmse),
        }
        if RAY_AVAILABLE:
            ray_train.report(metrics)
        elif (epoch + 1) % 5 == 0:
            logger.info(f"  Epoch {epoch+1}/{epochs} | {metrics}")


# ============================================================================
# DISTRIBUTED LAUNCHER
# ============================================================================

def run_distributed_training(
    model_name: str,
    num_workers: int = 2,
    epochs: int = 30,
    use_gpu: bool = False,
):
    """Launch distributed training via Ray or fallback to local."""
    train_funcs = {
        "disease": _disease_train_func,
        "yield": _yield_train_func,
    }

    if model_name not in train_funcs:
        raise ValueError(f"Unknown model: {model_name}. Available: {list(train_funcs.keys())}")

    config = {"epochs": epochs, "lr": 1e-3, "batch_size": 64}

    if RAY_AVAILABLE:
        ray.init(ignore_reinit_error=True)
        logger.info(f"Ray initialized. Workers: {num_workers}, GPU: {use_gpu}")

        trainer = TorchTrainer(
            train_loop_per_worker=train_funcs[model_name],
            train_loop_config=config,
            scaling_config=ScalingConfig(
                num_workers=num_workers,
                use_gpu=use_gpu,
            ),
            run_config=RunConfig(
                name=f"farmconnect_{model_name}",
                checkpoint_config=CheckpointConfig(num_to_keep=2),
            ),
        )

        result = trainer.fit()
        logger.info(f"Training complete. Best result: {result.metrics}")
        return result.metrics
    else:
        logger.info("Running single-node (Ray not available)")
        train_funcs[model_name](config)
        return {"status": "completed_single_node"}


# ============================================================================
# HYPERPARAMETER TUNING
# ============================================================================

def run_hyperparameter_tuning(model_name: str, num_samples: int = 10):
    """Run hyperparameter search via Ray Tune."""
    if not RAY_AVAILABLE:
        logger.warning("Ray not available. Cannot run hyperparameter tuning.")
        return None

    try:
        from ray import tune
        from ray.tune.schedulers import ASHAScheduler
    except ImportError:
        logger.warning("ray[tune] not installed.")
        return None

    ray.init(ignore_reinit_error=True)

    search_space = {
        "epochs": 20,
        "lr": tune.loguniform(1e-4, 1e-2),
        "batch_size": tune.choice([32, 64, 128]),
    }

    train_funcs = {
        "disease": _disease_train_func,
        "yield": _yield_train_func,
    }

    scheduler = ASHAScheduler(
        metric="val_accuracy" if model_name == "disease" else "val_rmse_kg_ha",
        mode="max" if model_name == "disease" else "min",
        max_t=20, grace_period=5, reduction_factor=2,
    )

    tuner = tune.Tuner(
        train_funcs[model_name],
        param_space=search_space,
        tune_config=tune.TuneConfig(
            num_samples=num_samples,
            scheduler=scheduler,
        ),
    )

    results = tuner.fit()
    best = results.get_best_result()
    logger.info(f"Best config: {best.config}")
    logger.info(f"Best metrics: {best.metrics}")
    return best


# ============================================================================
# CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="Ray distributed ML training")
    parser.add_argument("--model", required=True, choices=["disease", "yield"],
                       help="Model to train")
    parser.add_argument("--num-workers", type=int, default=2, help="Ray workers")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--tune", action="store_true", help="Run hyperparameter tuning")
    parser.add_argument("--gpu", action="store_true", help="Use GPU")
    args = parser.parse_args()

    if args.tune:
        run_hyperparameter_tuning(args.model)
    else:
        run_distributed_training(args.model, args.num_workers, args.epochs, args.gpu)


if __name__ == "__main__":
    main()
