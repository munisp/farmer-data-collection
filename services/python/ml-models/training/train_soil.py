"""
Training script for SoilHealthModel — multi-modal soil analysis.

Trains CNN (photo) + MLP (lab readings) + MLP (location) jointly.
Multi-task loss: MSE (health score) + CrossEntropy (fertility) + BCE (recommendations).

Usage:
    python -m training.train_soil --epochs 20 --batch-size 64
    python -m training.train_soil --epochs 5 --quick    # Fast validation run
"""

import argparse
import os
import sys
import time
import json

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader, random_split

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models.soil_health_model import SoilHealthModel, FERTILITY_CLASSES, RECOMMENDATION_LABELS


class SoilMultimodalDataset(Dataset):
    """Dataset for multi-modal soil analysis training."""

    def __init__(self, data_path: str):
        data = np.load(data_path)
        self.photos = torch.from_numpy(data["photos"])
        self.lab_readings = torch.from_numpy(data["lab_readings"])
        self.locations = torch.from_numpy(data["locations"])
        self.health_scores = torch.from_numpy(data["health_scores"])
        self.fertility_classes = torch.from_numpy(data["fertility_classes"])
        self.recommendation_labels = torch.from_numpy(data["recommendation_labels"])

        # Normalize lab readings
        self.lab_mean = self.lab_readings.mean(dim=0)
        self.lab_std = self.lab_readings.std(dim=0).clamp(min=1e-6)
        self.lab_readings = (self.lab_readings - self.lab_mean) / self.lab_std

        # Normalize locations
        self.loc_mean = self.locations.mean(dim=0)
        self.loc_std = self.locations.std(dim=0).clamp(min=1e-6)
        self.locations = (self.locations - self.loc_mean) / self.loc_std

        # Normalize health scores to [0, 1] for MSE
        self.health_scores = self.health_scores / 100.0

    def __len__(self) -> int:
        return len(self.photos)

    def __getitem__(self, idx):
        return {
            "photo": self.photos[idx],
            "lab": self.lab_readings[idx],
            "location": self.locations[idx],
            "health_score": self.health_scores[idx],
            "fertility_class": self.fertility_classes[idx],
            "recommendations": self.recommendation_labels[idx],
        }


def train_epoch(model, loader, optimizer, device, loss_weights):
    model.train()
    total_loss = 0.0
    health_mse = 0.0
    fert_correct = 0
    n_samples = 0

    ce_loss = nn.CrossEntropyLoss()
    bce_loss = nn.BCEWithLogitsLoss()

    for batch in loader:
        photo = batch["photo"].to(device)
        lab = batch["lab"].to(device)
        location = batch["location"].to(device)
        health_target = batch["health_score"].to(device)
        fert_target = batch["fertility_class"].to(device)
        rec_target = batch["recommendations"].to(device)

        optimizer.zero_grad()
        out = model(photo=photo, lab=lab, location=location)

        # Multi-task loss
        health_pred = out["health_score"] / 100.0  # normalize to [0,1]
        l_health = nn.functional.mse_loss(health_pred, health_target) * loss_weights["health"]
        l_fert = ce_loss(out["fertility_logits"], fert_target) * loss_weights["fertility"]
        l_rec = bce_loss(out["recommendation_probs"], rec_target) * loss_weights["recommendations"]

        loss = l_health + l_fert + l_rec
        loss.backward()
        optimizer.step()

        bs = photo.size(0)
        total_loss += loss.item() * bs
        health_mse += nn.functional.mse_loss(health_pred, health_target, reduction="sum").item()
        fert_correct += (out["fertility_logits"].argmax(dim=1) == fert_target).sum().item()
        n_samples += bs

    return {
        "loss": total_loss / n_samples,
        "health_rmse": (health_mse / n_samples) ** 0.5 * 100,  # back to 0-100 scale
        "fertility_acc": fert_correct / n_samples,
    }


def validate(model, loader, device):
    model.eval()
    health_mse = 0.0
    fert_correct = 0
    rec_correct = 0
    rec_total = 0
    n_samples = 0

    with torch.no_grad():
        for batch in loader:
            photo = batch["photo"].to(device)
            lab = batch["lab"].to(device)
            location = batch["location"].to(device)
            health_target = batch["health_score"].to(device)
            fert_target = batch["fertility_class"].to(device)
            rec_target = batch["recommendations"].to(device)

            out = model(photo=photo, lab=lab, location=location)

            health_pred = out["health_score"] / 100.0
            health_mse += nn.functional.mse_loss(health_pred, health_target, reduction="sum").item()

            fert_correct += (out["fertility_logits"].argmax(dim=1) == fert_target).sum().item()

            rec_pred = (out["recommendation_probs"] > 0.5).float()
            rec_correct += (rec_pred == rec_target).sum().item()
            rec_total += rec_target.numel()

            n_samples += photo.size(0)

    return {
        "health_rmse": (health_mse / n_samples) ** 0.5 * 100,
        "fertility_acc": fert_correct / n_samples,
        "recommendation_acc": rec_correct / rec_total,
    }


def main():
    parser = argparse.ArgumentParser(description="Train SoilHealthModel")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--quick", action="store_true", help="Quick validation run (fewer samples)")
    parser.add_argument("--data-dir", type=str, default=None)
    parser.add_argument("--weights-dir", type=str, default=None)
    args = parser.parse_args()

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = args.data_dir or os.path.join(base_dir, "data", "generated")
    weights_dir = args.weights_dir or os.path.join(base_dir, "weights")
    os.makedirs(weights_dir, exist_ok=True)

    data_path = os.path.join(data_dir, "soil_multimodal.npz")
    if not os.path.exists(data_path):
        print(f"Data not found at {data_path}. Generating...")
        sys.path.insert(0, os.path.join(base_dir, "data"))
        from synthetic_generator import generate_soil_multimodal_data
        n_samples = 1000 if args.quick else 5000
        soil_data = generate_soil_multimodal_data(n_samples)
        os.makedirs(data_dir, exist_ok=True)
        np.savez_compressed(data_path,
                            photos=soil_data["photos"],
                            lab_readings=soil_data["lab_readings"],
                            locations=soil_data["locations"],
                            health_scores=soil_data["health_scores"],
                            fertility_classes=soil_data["fertility_classes"],
                            recommendation_labels=soil_data["recommendation_labels"])
        print(f"  Generated {n_samples} samples")

    print("Loading dataset...")
    dataset = SoilMultimodalDataset(data_path)
    print(f"  {len(dataset)} samples loaded")
    print(f"  Photo shape: {dataset.photos[0].shape}")
    print(f"  Lab features: {dataset.lab_readings.shape[1]}")
    print(f"  Location features: {dataset.locations.shape[1]}")

    # Train/val split (80/20)
    n_train = int(0.8 * len(dataset))
    n_val = len(dataset) - n_train
    train_ds, val_ds = random_split(dataset, [n_train, n_val])

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False, num_workers=0)

    device = torch.device("cpu")
    model = SoilHealthModel(photo_dim=128, lab_dim=32, loc_dim=16, dropout=0.2).to(device)
    print(f"  Model parameters: {model.get_num_params():,}")

    optimizer = optim.Adam(model.parameters(), lr=args.lr, weight_decay=1e-5)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="min", factor=0.5, patience=3)

    loss_weights = {"health": 5.0, "fertility": 1.0, "recommendations": 2.0}

    best_val_rmse = float("inf")
    best_epoch = 0
    history = []

    print(f"\nTraining for {args.epochs} epochs on {device}...")
    print("-" * 80)

    for epoch in range(1, args.epochs + 1):
        t0 = time.time()
        train_metrics = train_epoch(model, train_loader, optimizer, device, loss_weights)
        val_metrics = validate(model, val_loader, device)
        dt = time.time() - t0

        scheduler.step(val_metrics["health_rmse"])
        lr = optimizer.param_groups[0]["lr"]

        print(f"Epoch {epoch:3d}/{args.epochs} ({dt:.1f}s) | "
              f"Train Loss: {train_metrics['loss']:.4f} | "
              f"Health RMSE: {val_metrics['health_rmse']:.2f} | "
              f"Fertility Acc: {val_metrics['fertility_acc']:.3f} | "
              f"Rec Acc: {val_metrics['recommendation_acc']:.3f} | "
              f"LR: {lr:.1e}")

        history.append({
            "epoch": epoch,
            "train_loss": train_metrics["loss"],
            "train_health_rmse": train_metrics["health_rmse"],
            "train_fertility_acc": train_metrics["fertility_acc"],
            "val_health_rmse": val_metrics["health_rmse"],
            "val_fertility_acc": val_metrics["fertility_acc"],
            "val_recommendation_acc": val_metrics["recommendation_acc"],
            "lr": lr,
        })

        if val_metrics["health_rmse"] < best_val_rmse:
            best_val_rmse = val_metrics["health_rmse"]
            best_epoch = epoch
            checkpoint = {
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "epoch": epoch,
                "val_health_rmse": val_metrics["health_rmse"],
                "val_fertility_acc": val_metrics["fertility_acc"],
                "val_recommendation_acc": val_metrics["recommendation_acc"],
                "lab_mean": dataset.lab_mean.numpy().tolist(),
                "lab_std": dataset.lab_std.numpy().tolist(),
                "loc_mean": dataset.loc_mean.numpy().tolist(),
                "loc_std": dataset.loc_std.numpy().tolist(),
            }
            torch.save(checkpoint, os.path.join(weights_dir, "soil_health_model.pt"))
            print(f"  → Saved best model (RMSE: {best_val_rmse:.2f})")

    print("-" * 80)
    print(f"\nBest model at epoch {best_epoch} with health RMSE: {best_val_rmse:.2f}")

    # Save training history
    with open(os.path.join(weights_dir, "soil_training_history.json"), "w") as f:
        json.dump(history, f, indent=2)

    # Final validation summary
    checkpoint = torch.load(os.path.join(weights_dir, "soil_health_model.pt"), weights_only=True)
    model.load_state_dict(checkpoint["model_state_dict"])
    final_metrics = validate(model, val_loader, device)

    print(f"\n--- Final Validation ---")
    print(f"Health Score RMSE: {final_metrics['health_rmse']:.2f} (on 0-100 scale)")
    print(f"Fertility Classification Accuracy: {final_metrics['fertility_acc']:.3f}")
    print(f"Recommendation Accuracy: {final_metrics['recommendation_acc']:.3f}")
    print(f"Model saved to: {os.path.join(weights_dir, 'soil_health_model.pt')}")


if __name__ == "__main__":
    main()
