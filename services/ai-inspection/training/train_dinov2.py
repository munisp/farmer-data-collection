"""
DINOv2 Feature Extraction & Grade Classifier Training for Nigerian Produce.

Uses DINOv2 (Meta) as a frozen feature backbone, then trains a lightweight
classification head for produce grade prediction (A/B/C/D/reject).

DINOv2 advantages for agriculture:
- Self-supervised — no labels needed for feature learning
- Excellent zero-shot transfer to domain-specific tasks
- Captures fine-grained visual features (texture, color, defects)

Usage:
    # Train grade classifier on DINOv2 features
    python training/train_dinov2.py train --data data/datasets/produce_classify --epochs 30

    # Extract features for a dataset (for downstream use)
    python training/train_dinov2.py extract --data data/datasets/produce_classify --output features/

    # Evaluate trained classifier
    python training/train_dinov2.py evaluate --model models/dinov2_grade_classifier.pt --data data/datasets/produce_classify
"""

import argparse
import json
import os
from pathlib import Path
from typing import Optional

try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.utils.data import DataLoader, Dataset
    from torchvision import transforms
    from PIL import Image
    import numpy as np
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    print("PyTorch not installed. Install with: pip install torch torchvision")


# ── DINOv2 Feature Extractor ─────────────────────────────────────────────

class DINOv2FeatureExtractor:
    """Extract visual features using DINOv2 backbone."""

    MODELS = {
        "small": "dinov2_vits14",    # 22M params, 384-dim features
        "base": "dinov2_vitb14",     # 86M params, 768-dim features
        "large": "dinov2_vitl14",    # 307M params, 1024-dim features
        "giant": "dinov2_vitg14",    # 1.1B params, 1536-dim features
    }

    def __init__(self, model_size: str = "base", device: str = ""):
        if not TORCH_AVAILABLE:
            raise RuntimeError("PyTorch required for DINOv2")

        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        model_name = self.MODELS.get(model_size, self.MODELS["base"])
        self.feature_dim = {"small": 384, "base": 768, "large": 1024, "giant": 1536}[model_size]

        print(f"Loading DINOv2 {model_size} ({model_name})...")
        self.model = torch.hub.load("facebookresearch/dinov2", model_name)
        self.model = self.model.to(self.device)
        self.model.eval()

        self.transform = transforms.Compose([
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])

        print(f"DINOv2 loaded: {self.feature_dim}-dim features on {self.device}")

    @torch.no_grad()
    def extract(self, image: Image.Image) -> np.ndarray:
        """Extract feature vector from a single image."""
        tensor = self.transform(image).unsqueeze(0).to(self.device)
        features = self.model(tensor)
        return features.cpu().numpy().flatten()

    @torch.no_grad()
    def extract_batch(self, images: list[Image.Image]) -> np.ndarray:
        """Extract features from a batch of images."""
        tensors = torch.stack([self.transform(img) for img in images]).to(self.device)
        features = self.model(tensors)
        return features.cpu().numpy()


# ── Grade Classification Head ────────────────────────────────────────────

class GradeClassifier(nn.Module):
    """Lightweight MLP classifier on top of DINOv2 features."""

    def __init__(self, feature_dim: int = 768, num_classes: int = 5, dropout: float = 0.3):
        super().__init__()
        self.classifier = nn.Sequential(
            nn.LayerNorm(feature_dim),
            nn.Linear(feature_dim, 512),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(512, 256),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(256, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.classifier(x)


# ── Dataset ──────────────────────────────────────────────────────────────

class ProduceDataset(Dataset):
    """Dataset for produce grade classification."""

    def __init__(self, root_dir: str, split: str = "train", transform=None):
        self.root = Path(root_dir) / split
        self.transform = transform
        self.classes = sorted([d.name for d in self.root.iterdir() if d.is_dir()])
        self.class_to_idx = {c: i for i, c in enumerate(self.classes)}

        self.samples = []
        for cls_dir in self.root.iterdir():
            if not cls_dir.is_dir():
                continue
            cls_idx = self.class_to_idx[cls_dir.name]
            for img_path in cls_dir.glob("*.png"):
                self.samples.append((str(img_path), cls_idx))
            for img_path in cls_dir.glob("*.jpg"):
                self.samples.append((str(img_path), cls_idx))

        print(f"  {split}: {len(self.samples)} images, {len(self.classes)} classes")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        image = Image.open(path).convert("RGB")
        if self.transform:
            image = self.transform(image)
        return image, label


# ── Training Pipeline ────────────────────────────────────────────────────

def train_grade_classifier(
    data_dir: str,
    model_size: str = "base",
    epochs: int = 30,
    batch_size: int = 32,
    learning_rate: float = 1e-3,
    output_dir: str = "models",
    device: str = "",
):
    """
    Train a DINOv2-based grade classifier.

    1. Loads DINOv2 backbone (frozen)
    2. Extracts features from all images
    3. Trains a lightweight MLP head
    """
    if not TORCH_AVAILABLE:
        print("PyTorch not installed. Cannot train.")
        print("Install: pip install torch torchvision")
        _generate_training_config(data_dir, model_size, epochs, batch_size, output_dir)
        return

    device_str = device or ("cuda" if torch.cuda.is_available() else "cpu")

    # Initialize DINOv2
    extractor = DINOv2FeatureExtractor(model_size=model_size, device=device_str)

    # Load datasets
    print(f"\nLoading dataset from {data_dir}...")
    train_dataset = ProduceDataset(data_dir, "train", transform=extractor.transform)
    val_dataset = ProduceDataset(data_dir, "val", transform=extractor.transform)

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, num_workers=4)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False, num_workers=4)

    num_classes = len(train_dataset.classes)
    print(f"Classes: {train_dataset.classes}")

    # Initialize classifier head
    classifier = GradeClassifier(
        feature_dim=extractor.feature_dim,
        num_classes=num_classes,
    ).to(device_str)

    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
    optimizer = optim.AdamW(classifier.parameters(), lr=learning_rate, weight_decay=0.01)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    best_val_acc = 0
    training_log = []

    print(f"\nTraining DINOv2 Grade Classifier")
    print(f"  Feature dim: {extractor.feature_dim}")
    print(f"  Classes: {num_classes}")
    print(f"  Epochs: {epochs}")
    print(f"  Device: {device_str}")
    print(f"{'='*60}")

    for epoch in range(epochs):
        # Train
        classifier.train()
        train_loss = 0
        train_correct = 0
        train_total = 0

        for images, labels in train_loader:
            images = images.to(device_str)
            labels = labels.to(device_str)

            # Extract DINOv2 features (frozen backbone)
            with torch.no_grad():
                features = extractor.model(images)

            # Classify
            logits = classifier(features)
            loss = criterion(logits, labels)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            train_loss += loss.item()
            preds = logits.argmax(dim=1)
            train_correct += (preds == labels).sum().item()
            train_total += labels.size(0)

        scheduler.step()
        train_acc = train_correct / max(train_total, 1)

        # Validate
        classifier.eval()
        val_loss = 0
        val_correct = 0
        val_total = 0

        with torch.no_grad():
            for images, labels in val_loader:
                images = images.to(device_str)
                labels = labels.to(device_str)

                features = extractor.model(images)
                logits = classifier(features)
                loss = criterion(logits, labels)

                val_loss += loss.item()
                preds = logits.argmax(dim=1)
                val_correct += (preds == labels).sum().item()
                val_total += labels.size(0)

        val_acc = val_correct / max(val_total, 1)
        avg_train_loss = train_loss / max(len(train_loader), 1)
        avg_val_loss = val_loss / max(len(val_loader), 1)

        log_entry = {
            "epoch": epoch + 1,
            "train_loss": round(avg_train_loss, 4),
            "train_acc": round(train_acc, 4),
            "val_loss": round(avg_val_loss, 4),
            "val_acc": round(val_acc, 4),
            "lr": round(scheduler.get_last_lr()[0], 6),
        }
        training_log.append(log_entry)

        print(f"Epoch {epoch+1:3d}/{epochs}  "
              f"train_loss={avg_train_loss:.4f}  train_acc={train_acc:.4f}  "
              f"val_loss={avg_val_loss:.4f}  val_acc={val_acc:.4f}")

        # Save best model
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            out = Path(output_dir)
            out.mkdir(parents=True, exist_ok=True)
            save_path = out / "dinov2_grade_classifier.pt"
            torch.save({
                "model_state_dict": classifier.state_dict(),
                "classes": train_dataset.classes,
                "feature_dim": extractor.feature_dim,
                "num_classes": num_classes,
                "model_size": model_size,
                "best_val_acc": best_val_acc,
                "epoch": epoch + 1,
            }, save_path)
            print(f"  -> Best model saved: {save_path} (val_acc={val_acc:.4f})")

    # Save training log
    log_path = Path(output_dir) / "training_log.json"
    log_path.write_text(json.dumps(training_log, indent=2))
    print(f"\nTraining complete. Best val accuracy: {best_val_acc:.4f}")
    print(f"Model saved: {output_dir}/dinov2_grade_classifier.pt")


def extract_features(
    data_dir: str,
    output_dir: str,
    model_size: str = "base",
    batch_size: int = 32,
    device: str = "",
):
    """Extract DINOv2 features for all images and save as .npz files."""
    if not TORCH_AVAILABLE:
        print("PyTorch not installed.")
        return

    extractor = DINOv2FeatureExtractor(model_size=model_size, device=device)
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)

    for split in ["train", "val", "test"]:
        split_dir = Path(data_dir) / split
        if not split_dir.exists():
            continue

        all_features = []
        all_labels = []
        all_paths = []

        dataset = ProduceDataset(data_dir, split, transform=extractor.transform)
        loader = DataLoader(dataset, batch_size=batch_size, shuffle=False, num_workers=4)

        for images, labels in loader:
            images = images.to(extractor.device)
            with torch.no_grad():
                features = extractor.model(images)
            all_features.append(features.cpu().numpy())
            all_labels.extend(labels.numpy())

        if all_features:
            features_array = np.concatenate(all_features, axis=0)
            labels_array = np.array(all_labels)
            save_path = output / f"{split}_features.npz"
            np.savez(save_path, features=features_array, labels=labels_array)
            print(f"Saved {split}: {features_array.shape} features -> {save_path}")


def _generate_training_config(data_dir, model_size, epochs, batch_size, output_dir):
    """Generate training config when PyTorch is not available."""
    config = {
        "task": "dinov2_grade_classification",
        "backbone": f"dinov2_vit{model_size[0]}14",
        "data_dir": data_dir,
        "epochs": epochs,
        "batch_size": batch_size,
        "output_dir": output_dir,
        "learning_rate": 1e-3,
        "classifier": {
            "type": "MLP",
            "layers": [768, 512, 256, 5],
            "activation": "GELU",
            "dropout": 0.3,
            "label_smoothing": 0.1,
        },
        "optimizer": "AdamW",
        "scheduler": "CosineAnnealing",
        "instructions": [
            "pip install torch torchvision",
            f"python training/train_dinov2.py train --data {data_dir} --epochs {epochs}",
        ],
    }
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    config_path = out_path / "training_config.json"
    config_path.write_text(json.dumps(config, indent=2))
    print(f"Training config saved to {config_path}")
    print("Install PyTorch to run training: pip install torch torchvision")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DINOv2 Grade Classifier Training")
    subparsers = parser.add_subparsers(dest="command")

    t = subparsers.add_parser("train", help="Train grade classifier")
    t.add_argument("--data", type=str, required=True)
    t.add_argument("--model-size", type=str, default="base", choices=["small", "base", "large", "giant"])
    t.add_argument("--epochs", type=int, default=30)
    t.add_argument("--batch", type=int, default=32)
    t.add_argument("--lr", type=float, default=1e-3)
    t.add_argument("--output", type=str, default="models")
    t.add_argument("--device", type=str, default="")

    e = subparsers.add_parser("extract", help="Extract DINOv2 features")
    e.add_argument("--data", type=str, required=True)
    e.add_argument("--output", type=str, default="features")
    e.add_argument("--model-size", type=str, default="base")
    e.add_argument("--device", type=str, default="")

    args = parser.parse_args()

    if args.command == "train":
        train_grade_classifier(args.data, args.model_size, args.epochs, args.batch, args.lr, args.output, args.device)
    elif args.command == "extract":
        extract_features(args.data, args.output, args.model_size, device=args.device)
    else:
        parser.print_help()
