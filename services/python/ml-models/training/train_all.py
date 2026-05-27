"""
Master Training Script — Train All FarmConnect ML Models

Usage:
    python -m training.train_all                    # Train all models
    python -m training.train_all --model disease     # Train single model
    python -m training.train_all --model yield price credit fraud gnn  # Train subset
    python -m training.train_all --epochs 50         # Override epochs

All models train on CPU by default. Set CUDA_VISIBLE_DEVICES for GPU.
Trained weights saved to weights/ directory.
"""

import argparse
import os
import sys
import time
import json
import logging
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset, random_split

# Ensure project root is in path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from data.synthetic_generator import (
    generate_crop_disease_data,
    generate_yield_data,
    generate_price_timeseries,
    generate_credit_data,
    generate_fraud_data,
    generate_graph_data,
)
from models.crop_disease_cnn import CropDiseaseCNN
from models.yield_predictor import YieldPredictor
from models.price_lstm import PriceLSTM
from models.credit_scorer import CreditScorer
from models.fraud_detector import FraudDetector, FocalLoss
from models.farmer_gnn import FarmerGraphNet

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
logger = logging.getLogger("train_all")

WEIGHTS_DIR = PROJECT_ROOT / "weights"
WEIGHTS_DIR.mkdir(exist_ok=True)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ============================================================================
# TRAINING FUNCTIONS
# ============================================================================

def train_disease_classifier(epochs: int = 30, batch_size: int = 64, lr: float = 1e-3):
    logger.info("=" * 60)
    logger.info("Training Crop Disease CNN Classifier")
    logger.info("=" * 60)

    images, labels, class_names = generate_crop_disease_data(n_samples_per_class=200)
    num_classes = len(class_names)
    logger.info(f"Dataset: {len(images)} images, {num_classes} classes")

    X = torch.tensor(images, dtype=torch.float32)
    y = torch.tensor(labels, dtype=torch.long)

    dataset = TensorDataset(X, y)
    train_size = int(0.8 * len(dataset))
    val_size = len(dataset) - train_size
    train_ds, val_ds = random_split(dataset, [train_size, val_size])

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size)

    model = CropDiseaseCNN(num_classes=num_classes).to(DEVICE)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = torch.nn.CrossEntropyLoss()

    logger.info(f"Model params: {model.get_num_params():,}")
    best_val_acc = 0

    for epoch in range(epochs):
        model.train()
        total_loss, correct, total = 0, 0, 0
        for xb, yb in train_loader:
            xb, yb = xb.to(DEVICE), yb.to(DEVICE)
            optimizer.zero_grad()
            logits = model(xb)
            loss = criterion(logits, yb)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total_loss += loss.item() * xb.size(0)
            correct += (logits.argmax(1) == yb).sum().item()
            total += xb.size(0)
        scheduler.step()

        # Validation
        model.eval()
        val_correct, val_total = 0, 0
        with torch.no_grad():
            for xb, yb in val_loader:
                xb, yb = xb.to(DEVICE), yb.to(DEVICE)
                logits = model(xb)
                val_correct += (logits.argmax(1) == yb).sum().item()
                val_total += xb.size(0)

        train_acc = correct / total
        val_acc = val_correct / val_total
        if (epoch + 1) % 5 == 0 or epoch == 0:
            logger.info(f"  Epoch {epoch+1}/{epochs} | Loss: {total_loss/total:.4f} | "
                       f"Train Acc: {train_acc:.3f} | Val Acc: {val_acc:.3f}")

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save({
                "model_state_dict": model.state_dict(),
                "num_classes": num_classes,
                "class_names": class_names,
                "val_accuracy": val_acc,
                "epoch": epoch + 1,
            }, WEIGHTS_DIR / "crop_disease_cnn.pt")

    logger.info(f"  Best validation accuracy: {best_val_acc:.3f}")
    logger.info(f"  Saved: {WEIGHTS_DIR / 'crop_disease_cnn.pt'}")
    return best_val_acc


def train_yield_predictor(epochs: int = 40, batch_size: int = 128, lr: float = 1e-3):
    logger.info("=" * 60)
    logger.info("Training Yield Predictor (Deep Tabular)")
    logger.info("=" * 60)

    df = generate_yield_data(10000)
    logger.info(f"Dataset: {len(df)} records, {len(df.columns)} features")

    # Encode categoricals
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

    # Normalize numerical
    num_stats = {}
    for col in num_cols:
        mean, std = df[col].mean(), df[col].std()
        num_stats[col] = {"mean": float(mean), "std": float(std)}
        df[col + "_norm"] = (df[col] - mean) / (std + 1e-8)

    target = df["yield_kg_per_ha"].values
    target_mean, target_std = target.mean(), target.std()
    target_norm = (target - target_mean) / (target_std + 1e-8)

    cat_tensors = {
        col: torch.tensor(df[col + "_enc"].values, dtype=torch.long)
        for col in cat_cols
    }
    num_tensor = torch.tensor(
        df[[c + "_norm" for c in num_cols]].values, dtype=torch.float32
    )
    target_tensor = torch.tensor(target_norm, dtype=torch.float32).unsqueeze(1)

    n = len(df)
    indices = torch.randperm(n)
    split = int(0.8 * n)
    train_idx, val_idx = indices[:split], indices[split:]

    model = YieldPredictor().to(DEVICE)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.StepLR(optimizer, step_size=15, gamma=0.5)
    criterion = nn.MSELoss()

    logger.info(f"Model params: {model.get_num_params():,}")
    best_val_rmse = float("inf")

    for epoch in range(epochs):
        model.train()
        perm = train_idx[torch.randperm(len(train_idx))]
        total_loss = 0
        n_batches = 0

        for i in range(0, len(perm), batch_size):
            idx = perm[i:i + batch_size]
            cat_batch = {k: v[idx].to(DEVICE) for k, v in cat_tensors.items()}
            num_batch = num_tensor[idx].to(DEVICE)
            y_batch = target_tensor[idx].to(DEVICE)

            optimizer.zero_grad()
            pred = model(cat_batch, num_batch)
            loss = criterion(pred, y_batch)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total_loss += loss.item()
            n_batches += 1
        scheduler.step()

        # Validation
        model.eval()
        with torch.no_grad():
            cat_val = {k: v[val_idx].to(DEVICE) for k, v in cat_tensors.items()}
            num_val = num_tensor[val_idx].to(DEVICE)
            y_val = target_tensor[val_idx].to(DEVICE)
            pred_val = model(cat_val, num_val)
            val_mse = criterion(pred_val, y_val).item()
            val_rmse = (val_mse ** 0.5) * target_std

        if (epoch + 1) % 5 == 0 or epoch == 0:
            logger.info(f"  Epoch {epoch+1}/{epochs} | Train Loss: {total_loss/n_batches:.4f} | "
                       f"Val RMSE: {val_rmse:.1f} kg/ha")

        if val_rmse < best_val_rmse:
            best_val_rmse = val_rmse
            torch.save({
                "model_state_dict": model.state_dict(),
                "cat_maps": cat_maps,
                "num_stats": num_stats,
                "target_mean": float(target_mean),
                "target_std": float(target_std),
                "val_rmse": float(val_rmse),
                "epoch": epoch + 1,
            }, WEIGHTS_DIR / "yield_predictor.pt")

    logger.info(f"  Best validation RMSE: {best_val_rmse:.1f} kg/ha")
    logger.info(f"  Saved: {WEIGHTS_DIR / 'yield_predictor.pt'}")
    return best_val_rmse


def train_price_forecaster(epochs: int = 50, batch_size: int = 64, lr: float = 5e-4):
    logger.info("=" * 60)
    logger.info("Training Price LSTM Forecaster")
    logger.info("=" * 60)

    df = generate_price_timeseries(crops=["maize", "rice", "beans", "tomatoes"], n_days=730)
    logger.info(f"Dataset: {len(df)} daily records")

    lookback = 60
    forecast_horizon = 30
    all_X, all_y = [], []

    for crop in df["crop"].unique():
        crop_df = df[df["crop"] == crop].sort_values("date")
        prices = crop_df["price_per_kg"].values
        volumes = np.log1p(crop_df["volume_kg"].values)

        price_mean, price_std = prices.mean(), prices.std()
        prices_norm = (prices - price_mean) / (price_std + 1e-8)
        vol_mean, vol_std = volumes.mean(), volumes.std()
        volumes_norm = (volumes - vol_mean) / (vol_std + 1e-8)

        days = np.arange(len(prices))
        dow_sin = np.sin(2 * np.pi * (days % 7) / 7)
        dow_cos = np.cos(2 * np.pi * (days % 7) / 7)
        month_sin = np.sin(2 * np.pi * (days % 365) / 365)

        features = np.stack([prices_norm, volumes_norm, dow_sin, dow_cos, month_sin], axis=1)

        for i in range(lookback, len(features) - forecast_horizon):
            all_X.append(features[i - lookback:i])
            all_y.append(prices_norm[i:i + forecast_horizon])

    X = torch.tensor(np.array(all_X), dtype=torch.float32)
    y = torch.tensor(np.array(all_y), dtype=torch.float32)

    dataset = TensorDataset(X, y)
    train_size = int(0.8 * len(dataset))
    val_size = len(dataset) - train_size
    train_ds, val_ds = random_split(dataset, [train_size, val_size])

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size)

    model = PriceLSTM(forecast_horizon=forecast_horizon).to(DEVICE)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = nn.MSELoss()

    logger.info(f"Model params: {model.get_num_params():,}")
    best_val_loss = float("inf")

    for epoch in range(epochs):
        model.train()
        total_loss, n_batches = 0, 0
        for xb, yb in train_loader:
            xb, yb = xb.to(DEVICE), yb.to(DEVICE)
            optimizer.zero_grad()
            pred = model(xb)
            loss = criterion(pred, yb)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total_loss += loss.item()
            n_batches += 1
        scheduler.step()

        model.eval()
        val_loss, val_n = 0, 0
        with torch.no_grad():
            for xb, yb in val_loader:
                xb, yb = xb.to(DEVICE), yb.to(DEVICE)
                val_loss += criterion(model(xb), yb).item()
                val_n += 1

        avg_val = val_loss / max(val_n, 1)
        if (epoch + 1) % 10 == 0 or epoch == 0:
            logger.info(f"  Epoch {epoch+1}/{epochs} | Train Loss: {total_loss/n_batches:.4f} | "
                       f"Val Loss: {avg_val:.4f}")

        if avg_val < best_val_loss:
            best_val_loss = avg_val
            torch.save({
                "model_state_dict": model.state_dict(),
                "forecast_horizon": forecast_horizon,
                "lookback": lookback,
                "val_loss": float(avg_val),
                "epoch": epoch + 1,
            }, WEIGHTS_DIR / "price_lstm.pt")

    logger.info(f"  Best validation loss: {best_val_loss:.4f}")
    logger.info(f"  Saved: {WEIGHTS_DIR / 'price_lstm.pt'}")
    return best_val_loss


def train_credit_scorer(epochs: int = 30, batch_size: int = 128, lr: float = 1e-3):
    logger.info("=" * 60)
    logger.info("Training Credit Scorer")
    logger.info("=" * 60)

    df = generate_credit_data(5000)
    logger.info(f"Dataset: {len(df)} records, repay rate: {df['will_repay'].mean():.1%}")

    feature_cols = [c for c in df.columns if c != "will_repay"]
    X = df[feature_cols].values.astype(np.float32)
    y = df["will_repay"].values.astype(np.float32)

    # Normalize features
    feat_mean, feat_std = X.mean(axis=0), X.std(axis=0) + 1e-8
    X_norm = (X - feat_mean) / feat_std

    X_t = torch.tensor(X_norm, dtype=torch.float32)
    y_t = torch.tensor(y, dtype=torch.float32).unsqueeze(1)

    dataset = TensorDataset(X_t, y_t)
    train_size = int(0.8 * len(dataset))
    val_size = len(dataset) - train_size
    train_ds, val_ds = random_split(dataset, [train_size, val_size])

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size)

    model = CreditScorer().to(DEVICE)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    criterion = nn.BCELoss()

    logger.info(f"Model params: {model.get_num_params():,}")
    best_val_auc = 0

    for epoch in range(epochs):
        model.train()
        total_loss, n_batches = 0, 0
        for xb, yb in train_loader:
            xb, yb = xb.to(DEVICE), yb.to(DEVICE)
            optimizer.zero_grad()
            pred = model(xb)
            loss = criterion(pred, yb)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            n_batches += 1

        model.eval()
        all_preds, all_labels = [], []
        with torch.no_grad():
            for xb, yb in val_loader:
                xb = xb.to(DEVICE)
                pred = model(xb).cpu()
                all_preds.extend(pred.squeeze().tolist())
                all_labels.extend(yb.squeeze().tolist())

        val_preds = np.array(all_preds)
        val_labels = np.array(all_labels)
        val_acc = ((val_preds >= 0.5) == val_labels).mean()

        # Simple AUC approximation
        pos = val_preds[val_labels == 1]
        neg = val_preds[val_labels == 0]
        if len(pos) > 0 and len(neg) > 0:
            auc = sum(p > n for p in pos for n in neg) / (len(pos) * len(neg))
        else:
            auc = 0.5

        if (epoch + 1) % 5 == 0 or epoch == 0:
            logger.info(f"  Epoch {epoch+1}/{epochs} | Loss: {total_loss/n_batches:.4f} | "
                       f"Val Acc: {val_acc:.3f} | Val AUC: {auc:.3f}")

        if auc > best_val_auc:
            best_val_auc = auc
            torch.save({
                "model_state_dict": model.state_dict(),
                "feature_cols": feature_cols,
                "feat_mean": feat_mean.tolist(),
                "feat_std": feat_std.tolist(),
                "val_auc": float(auc),
                "epoch": epoch + 1,
            }, WEIGHTS_DIR / "credit_scorer.pt")

    logger.info(f"  Best validation AUC: {best_val_auc:.3f}")
    logger.info(f"  Saved: {WEIGHTS_DIR / 'credit_scorer.pt'}")
    return best_val_auc


def train_fraud_detector(epochs: int = 40, batch_size: int = 128, lr: float = 1e-3):
    logger.info("=" * 60)
    logger.info("Training Fraud Detector")
    logger.info("=" * 60)

    df = generate_fraud_data(10000)
    logger.info(f"Dataset: {len(df)} records, fraud rate: {df['is_fraud'].mean():.1%}")

    # Encode payment_method
    payment_map = {"mpesa": 0, "bank": 1, "cash": 2, "mtn_momo": 3}
    df["payment_method_enc"] = df["payment_method"].map(payment_map).fillna(0)

    feature_cols = [c for c in df.columns if c not in ("is_fraud", "payment_method")]
    X = df[feature_cols].values.astype(np.float32)
    y = df["is_fraud"].values.astype(np.float32)

    feat_mean, feat_std = X.mean(axis=0), X.std(axis=0) + 1e-8
    X_norm = (X - feat_mean) / feat_std

    X_t = torch.tensor(X_norm, dtype=torch.float32)
    y_t = torch.tensor(y, dtype=torch.float32).unsqueeze(1)

    dataset = TensorDataset(X_t, y_t)
    train_size = int(0.8 * len(dataset))
    val_size = len(dataset) - train_size
    train_ds, val_ds = random_split(dataset, [train_size, val_size])

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size)

    model = FraudDetector().to(DEVICE)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-3)
    criterion = FocalLoss(alpha=0.75, gamma=2.0)

    logger.info(f"Model params: {model.get_num_params():,}")
    best_val_f1 = 0

    for epoch in range(epochs):
        model.train()
        total_loss, n_batches = 0, 0
        for xb, yb in train_loader:
            xb, yb = xb.to(DEVICE), yb.to(DEVICE)
            optimizer.zero_grad()
            pred = model(xb)
            loss = criterion(pred, yb)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            n_batches += 1

        model.eval()
        all_preds, all_labels = [], []
        with torch.no_grad():
            for xb, yb in val_loader:
                xb = xb.to(DEVICE)
                pred = model(xb).cpu()
                all_preds.extend((pred.squeeze() >= 0.5).long().tolist())
                all_labels.extend(yb.squeeze().long().tolist())

        all_preds = np.array(all_preds)
        all_labels = np.array(all_labels)
        tp = ((all_preds == 1) & (all_labels == 1)).sum()
        fp = ((all_preds == 1) & (all_labels == 0)).sum()
        fn = ((all_preds == 0) & (all_labels == 1)).sum()
        precision = tp / (tp + fp + 1e-8)
        recall = tp / (tp + fn + 1e-8)
        f1 = 2 * precision * recall / (precision + recall + 1e-8)

        if (epoch + 1) % 5 == 0 or epoch == 0:
            logger.info(f"  Epoch {epoch+1}/{epochs} | Loss: {total_loss/n_batches:.4f} | "
                       f"Precision: {precision:.3f} | Recall: {recall:.3f} | F1: {f1:.3f}")

        if f1 > best_val_f1:
            best_val_f1 = f1
            torch.save({
                "model_state_dict": model.state_dict(),
                "feature_cols": feature_cols,
                "feat_mean": feat_mean.tolist(),
                "feat_std": feat_std.tolist(),
                "val_f1": float(f1),
                "epoch": epoch + 1,
            }, WEIGHTS_DIR / "fraud_detector.pt")

    logger.info(f"  Best validation F1: {best_val_f1:.3f}")
    logger.info(f"  Saved: {WEIGHTS_DIR / 'fraud_detector.pt'}")
    return best_val_f1


def train_gnn(epochs: int = 50, lr: float = 1e-3):
    logger.info("=" * 60)
    logger.info("Training Farmer Graph Neural Network")
    logger.info("=" * 60)

    graph = generate_graph_data(n_farmers=500, n_cooperatives=20, n_markets=10)
    nodes = graph["nodes"]
    edges = graph["edges"]
    logger.info(f"Graph: {len(nodes)} nodes, {len(edges)} edges")

    # Build node feature matrices
    farmer_nodes = [n for n in nodes if n["type"] == "farmer"]
    coop_nodes = [n for n in nodes if n["type"] == "cooperative"]
    market_nodes = [n for n in nodes if n["type"] == "market"]

    node_id_to_idx = {}
    for i, n in enumerate(farmer_nodes):
        node_id_to_idx[n["id"]] = i
    offset_coop = len(farmer_nodes)
    for i, n in enumerate(coop_nodes):
        node_id_to_idx[n["id"]] = offset_coop + i
    offset_market = offset_coop + len(coop_nodes)
    for i, n in enumerate(market_nodes):
        node_id_to_idx[n["id"]] = offset_market + i

    farmer_feats = torch.tensor(
        [[n["features"][k] for k in sorted(n["features"].keys())] for n in farmer_nodes],
        dtype=torch.float32,
    )
    coop_feats = torch.tensor(
        [[n["features"][k] for k in sorted(n["features"].keys())] for n in coop_nodes],
        dtype=torch.float32,
    )
    market_feats = torch.tensor(
        [[n["features"][k] for k in sorted(n["features"].keys())] for n in market_nodes],
        dtype=torch.float32,
    )

    # Build edge index
    src_list, dst_list = [], []
    for e in edges:
        if e["source"] in node_id_to_idx and e["target"] in node_id_to_idx:
            src_list.append(node_id_to_idx[e["source"]])
            dst_list.append(node_id_to_idx[e["target"]])
            # Bidirectional
            src_list.append(node_id_to_idx[e["target"]])
            dst_list.append(node_id_to_idx[e["source"]])

    edge_index = torch.tensor([src_list, dst_list], dtype=torch.long)

    # Generate pseudo credit labels for farmer nodes
    credit_labels = torch.tensor(
        [min(1.0, max(0.0, n["features"]["credit_score"] / 800)) for n in farmer_nodes],
        dtype=torch.float32,
    )

    node_type_offsets = {
        "farmer": len(farmer_nodes),
        "cooperative": len(coop_nodes),
        "market": len(market_nodes),
    }

    model = FarmerGraphNet().to(DEVICE)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    criterion = nn.MSELoss()

    logger.info(f"Model params: {model.get_num_params():,}")
    best_val_loss = float("inf")

    farmer_feats = farmer_feats.to(DEVICE)
    coop_feats = coop_feats.to(DEVICE)
    market_feats = market_feats.to(DEVICE)
    edge_index = edge_index.to(DEVICE)
    credit_labels = credit_labels.to(DEVICE)

    for epoch in range(epochs):
        model.train()
        optimizer.zero_grad()
        out = model(farmer_feats, coop_feats, market_feats, edge_index, node_type_offsets)
        loss = criterion(out["credit_scores"], credit_labels)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

        if (epoch + 1) % 10 == 0 or epoch == 0:
            logger.info(f"  Epoch {epoch+1}/{epochs} | Credit Loss: {loss.item():.4f}")

        if loss.item() < best_val_loss:
            best_val_loss = loss.item()
            torch.save({
                "model_state_dict": model.state_dict(),
                "node_type_offsets": node_type_offsets,
                "loss": float(loss.item()),
                "epoch": epoch + 1,
            }, WEIGHTS_DIR / "farmer_gnn.pt")

    logger.info(f"  Best loss: {best_val_loss:.4f}")
    logger.info(f"  Saved: {WEIGHTS_DIR / 'farmer_gnn.pt'}")
    return best_val_loss


# ============================================================================
# MAIN
# ============================================================================

MODEL_TRAINERS = {
    "disease": train_disease_classifier,
    "yield": train_yield_predictor,
    "price": train_price_forecaster,
    "credit": train_credit_scorer,
    "fraud": train_fraud_detector,
    "gnn": train_gnn,
}

def main():
    parser = argparse.ArgumentParser(description="Train FarmConnect ML models")
    parser.add_argument("--model", nargs="+", default=list(MODEL_TRAINERS.keys()),
                       choices=list(MODEL_TRAINERS.keys()),
                       help="Which models to train")
    parser.add_argument("--epochs", type=int, default=None, help="Override default epochs")
    args = parser.parse_args()

    logger.info(f"Device: {DEVICE}")
    logger.info(f"Training models: {args.model}")
    logger.info(f"Weights dir: {WEIGHTS_DIR}")

    results = {}
    start = time.time()

    for model_name in args.model:
        t0 = time.time()
        kwargs = {}
        if args.epochs:
            kwargs["epochs"] = args.epochs
        metric = MODEL_TRAINERS[model_name](**kwargs)
        elapsed = time.time() - t0
        results[model_name] = {"metric": float(metric), "time_seconds": round(elapsed, 1)}
        logger.info(f"  Completed {model_name} in {elapsed:.1f}s")

    total_time = time.time() - start
    logger.info("=" * 60)
    logger.info(f"All training complete in {total_time:.0f}s")
    for name, res in results.items():
        logger.info(f"  {name}: metric={res['metric']:.4f}, time={res['time_seconds']}s")

    # Save training report
    report = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC"),
        "device": str(DEVICE),
        "total_time_seconds": round(total_time, 1),
        "models": results,
        "weights_dir": str(WEIGHTS_DIR),
    }
    with open(WEIGHTS_DIR / "training_report.json", "w") as f:
        json.dump(report, f, indent=2)

    logger.info(f"Report saved to {WEIGHTS_DIR / 'training_report.json'}")


if __name__ == "__main__":
    main()
