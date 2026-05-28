"""
Dataset Manager for FarmConnect AI Inspection Training.

Manages training datasets:
- Combine synthetic + real images
- Apply augmentations using Albumentations
- Split into train/val/test
- Convert between annotation formats (COCO, YOLO, Pascal VOC)
- Dataset statistics and health checks

Usage:
    # Create full training pipeline
    python training/dataset_manager.py pipeline --synthetic data/synthetic --real data/real --output data/datasets

    # Augment existing dataset
    python training/dataset_manager.py augment --input data/datasets/train --output data/datasets/train_augmented --factor 5

    # Dataset statistics
    python training/dataset_manager.py stats --data data/datasets
"""

import argparse
import json
import os
import random
import shutil
from collections import Counter, defaultdict
from pathlib import Path
from typing import Optional

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

try:
    import albumentations as A
    from albumentations.pytorch import ToTensorV2
    import numpy as np
    ALBUMENTATIONS_AVAILABLE = True
except ImportError:
    ALBUMENTATIONS_AVAILABLE = False


# ── Augmentation Pipelines ───────────────────────────────────────────────

def get_train_augmentation(img_size: int = 640) -> "A.Compose":
    """Strong augmentation pipeline for training data."""
    if not ALBUMENTATIONS_AVAILABLE:
        raise ImportError("albumentations not installed: pip install albumentations")

    return A.Compose([
        A.RandomResizedCrop(height=img_size, width=img_size, scale=(0.5, 1.0), p=1.0),
        A.HorizontalFlip(p=0.5),
        A.VerticalFlip(p=0.1),
        A.RandomRotate90(p=0.3),
        A.OneOf([
            A.RandomBrightnessContrast(brightness_limit=0.3, contrast_limit=0.3, p=1),
            A.HueSaturationValue(hue_shift_limit=20, sat_shift_limit=30, val_shift_limit=20, p=1),
            A.CLAHE(clip_limit=4.0, p=1),
        ], p=0.7),
        A.OneOf([
            A.GaussNoise(var_limit=(10.0, 50.0), p=1),
            A.GaussianBlur(blur_limit=(3, 7), p=1),
            A.MotionBlur(blur_limit=(3, 7), p=1),
        ], p=0.3),
        A.OneOf([
            A.RandomShadow(num_shadows_lower=1, num_shadows_upper=3, p=1),
            A.RandomFog(fog_coef_lower=0.1, fog_coef_upper=0.3, p=1),
        ], p=0.2),
        A.CoarseDropout(max_holes=8, max_height=32, max_width=32, min_holes=1, p=0.2),
        A.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.1, p=0.3),
        A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ], bbox_params=A.BboxParams(format="yolo", label_fields=["class_labels"]))


def get_val_augmentation(img_size: int = 640) -> "A.Compose":
    """Minimal augmentation for validation data."""
    if not ALBUMENTATIONS_AVAILABLE:
        raise ImportError("albumentations not installed")

    return A.Compose([
        A.Resize(height=img_size, width=img_size),
        A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])


def get_nigerian_market_augmentation(img_size: int = 640) -> "A.Compose":
    """
    Augmentations specific to Nigerian market conditions:
    - Harsh sunlight / shadows (outdoor markets)
    - Dust and haze (harmattan season)
    - Low-quality phone cameras
    - Crowded backgrounds
    """
    if not ALBUMENTATIONS_AVAILABLE:
        raise ImportError("albumentations not installed")

    return A.Compose([
        A.RandomResizedCrop(height=img_size, width=img_size, scale=(0.4, 1.0), p=1.0),
        A.HorizontalFlip(p=0.5),
        # Harsh Nigerian sunlight
        A.RandomBrightnessContrast(brightness_limit=0.4, contrast_limit=0.4, p=0.6),
        A.RandomSunFlare(flare_roi=(0, 0, 1, 0.5), p=0.15),
        # Harmattan dust/haze
        A.RandomFog(fog_coef_lower=0.1, fog_coef_upper=0.3, p=0.15),
        # Phone camera quality
        A.OneOf([
            A.GaussNoise(var_limit=(10, 80), p=1),
            A.ISONoise(color_shift=(0.01, 0.05), p=1),
            A.ImageCompression(quality_lower=30, quality_upper=90, p=1),
        ], p=0.4),
        # Market shadows (tarps, umbrellas)
        A.RandomShadow(num_shadows_lower=1, num_shadows_upper=4, p=0.3),
        # Color shift (different lighting)
        A.HueSaturationValue(hue_shift_limit=25, sat_shift_limit=40, val_shift_limit=30, p=0.5),
        A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ], bbox_params=A.BboxParams(format="yolo", label_fields=["class_labels"]))


# ── Dataset Operations ───────────────────────────────────────────────────

def augment_dataset(
    input_dir: str,
    output_dir: str,
    augmentation_factor: int = 5,
    img_size: int = 640,
    use_market_augmentation: bool = True,
):
    """
    Augment a YOLO-format dataset.

    For each image, generates `augmentation_factor` augmented copies.
    """
    if not ALBUMENTATIONS_AVAILABLE or not PIL_AVAILABLE:
        print("Missing dependencies: pip install albumentations Pillow numpy")
        return

    import numpy as np

    inp = Path(input_dir)
    out = Path(output_dir)

    transform = (
        get_nigerian_market_augmentation(img_size) if use_market_augmentation
        else get_train_augmentation(img_size)
    )

    for split in ["train", "val", "test"]:
        img_dir = inp / "images" / split
        lbl_dir = inp / "labels" / split
        if not img_dir.exists():
            continue

        out_img_dir = out / "images" / split
        out_lbl_dir = out / "labels" / split
        out_img_dir.mkdir(parents=True, exist_ok=True)
        out_lbl_dir.mkdir(parents=True, exist_ok=True)

        images = list(img_dir.glob("*.png")) + list(img_dir.glob("*.jpg"))
        total = 0

        for img_path in images:
            lbl_path = lbl_dir / (img_path.stem + ".txt")

            img = np.array(Image.open(img_path).convert("RGB"))

            # Parse YOLO labels
            bboxes = []
            class_labels = []
            if lbl_path.exists():
                for line in lbl_path.read_text().strip().split("\n"):
                    if not line.strip():
                        continue
                    parts = line.strip().split()
                    cls = int(parts[0])
                    cx, cy, w, h = float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])
                    bboxes.append([cx, cy, w, h])
                    class_labels.append(cls)

            # Copy original
            shutil.copy2(img_path, out_img_dir / img_path.name)
            if lbl_path.exists():
                shutil.copy2(lbl_path, out_lbl_dir / lbl_path.name)
            total += 1

            # Generate augmented copies
            factor = augmentation_factor if split == "train" else 1
            for aug_idx in range(factor):
                try:
                    transformed = transform(
                        image=img,
                        bboxes=bboxes,
                        class_labels=class_labels,
                    )
                    aug_img = transformed["image"]
                    aug_bboxes = transformed["bboxes"]
                    aug_labels = transformed["class_labels"]

                    # Handle numpy array vs tensor
                    if hasattr(aug_img, 'numpy'):
                        aug_img = aug_img.numpy()
                    if aug_img.dtype != np.uint8:
                        # Denormalize if normalized
                        aug_img = ((aug_img * [0.229, 0.224, 0.225] + [0.485, 0.456, 0.406]) * 255).astype(np.uint8)
                    if len(aug_img.shape) == 3 and aug_img.shape[0] == 3:
                        aug_img = np.transpose(aug_img, (1, 2, 0))

                    aug_name = f"{img_path.stem}_aug{aug_idx}{img_path.suffix}"
                    Image.fromarray(aug_img).save(out_img_dir / aug_name)

                    # Save augmented labels
                    lbl_lines = []
                    for bbox, cls in zip(aug_bboxes, aug_labels):
                        lbl_lines.append(f"{cls} {bbox[0]:.6f} {bbox[1]:.6f} {bbox[2]:.6f} {bbox[3]:.6f}")
                    (out_lbl_dir / f"{img_path.stem}_aug{aug_idx}.txt").write_text("\n".join(lbl_lines))
                    total += 1
                except Exception as e:
                    logger_msg = f"Augmentation failed for {img_path.name}: {e}"
                    print(logger_msg)

        print(f"  {split}: {total} images (original + augmented)")


def compute_dataset_stats(data_dir: str) -> dict:
    """Compute comprehensive dataset statistics."""
    data = Path(data_dir)
    stats = {
        "splits": {},
        "total_images": 0,
        "total_annotations": 0,
        "class_distribution": {},
        "avg_annotations_per_image": 0,
    }

    all_classes = Counter()

    for split in ["train", "val", "test"]:
        img_dir = data / "images" / split
        lbl_dir = data / "labels" / split

        if not img_dir.exists():
            continue

        images = list(img_dir.glob("*.png")) + list(img_dir.glob("*.jpg"))
        num_images = len(images)
        num_annotations = 0
        split_classes = Counter()

        for lbl_file in lbl_dir.glob("*.txt"):
            for line in lbl_file.read_text().strip().split("\n"):
                if line.strip():
                    cls = int(line.strip().split()[0])
                    split_classes[cls] += 1
                    all_classes[cls] += 1
                    num_annotations += 1

        stats["splits"][split] = {
            "images": num_images,
            "annotations": num_annotations,
            "avg_annotations_per_image": round(num_annotations / max(num_images, 1), 2),
            "class_distribution": dict(split_classes),
        }
        stats["total_images"] += num_images
        stats["total_annotations"] += num_annotations

    stats["class_distribution"] = dict(all_classes)
    stats["avg_annotations_per_image"] = round(
        stats["total_annotations"] / max(stats["total_images"], 1), 2
    )

    return stats


def run_full_pipeline(
    synthetic_dir: str,
    real_dir: Optional[str],
    output_dir: str,
    augmentation_factor: int = 5,
    img_size: int = 640,
):
    """
    Full dataset preparation pipeline:
    1. Convert synthetic images to YOLO format
    2. Merge with real images if available
    3. Apply Nigerian market augmentations
    4. Generate dataset statistics
    5. Create YAML configs for YOLOv8 training
    """
    from training.train_yolov8 import prepare_dataset_structure, create_detection_yaml, PRODUCE_CLASSES

    output = Path(output_dir)
    print("=" * 60)
    print("FarmConnect Dataset Pipeline")
    print("=" * 60)

    # Step 1: Convert synthetic to YOLO format
    print("\n[1/5] Converting synthetic dataset to YOLO format...")
    yolo_dir = output / "produce_detect"
    prepare_dataset_structure(synthetic_dir, str(yolo_dir))

    # Step 2: Merge real images
    if real_dir and Path(real_dir).exists():
        print(f"\n[2/5] Merging real images from {real_dir}...")
        real = Path(real_dir)
        for split in ["train", "val"]:
            for img in (real / "images" / split).glob("*.*"):
                shutil.copy2(img, yolo_dir / "images" / split / img.name)
            for lbl in (real / "labels" / split).glob("*.txt"):
                shutil.copy2(lbl, yolo_dir / "labels" / split / lbl.name)
        print("  Real images merged.")
    else:
        print("\n[2/5] No real images directory found — using synthetic only.")

    # Step 3: Augment
    print(f"\n[3/5] Augmenting dataset (factor={augmentation_factor})...")
    aug_dir = output / "produce_detect_augmented"
    augment_dataset(
        str(yolo_dir), str(aug_dir),
        augmentation_factor=augmentation_factor,
        img_size=img_size,
        use_market_augmentation=True,
    )

    # Step 4: Statistics
    print("\n[4/5] Computing dataset statistics...")
    stats = compute_dataset_stats(str(aug_dir))
    stats_path = aug_dir / "dataset_stats.json"
    stats_path.write_text(json.dumps(stats, indent=2))
    print(f"  Total images: {stats['total_images']}")
    print(f"  Total annotations: {stats['total_annotations']}")
    print(f"  Splits: {', '.join(f'{k}={v[\"images\"]}' for k, v in stats['splits'].items())}")
    print(f"  Stats saved: {stats_path}")

    # Step 5: Create training configs
    print("\n[5/5] Creating training configurations...")
    create_detection_yaml(str(aug_dir / "dataset.yaml"), str(aug_dir), PRODUCE_CLASSES, "produce")

    # Classification dataset
    cls_dir = output / "grade_classify"
    from training.train_yolov8 import prepare_classification_dataset
    prepare_classification_dataset(synthetic_dir, str(cls_dir))

    print(f"\n{'='*60}")
    print("Pipeline complete!")
    print(f"  Detection dataset: {aug_dir}")
    print(f"  Classification dataset: {cls_dir}")
    print(f"\nNext steps:")
    print(f"  1. Train detector:   python training/train_yolov8.py train --task detect --data {aug_dir}/dataset.yaml --epochs 100")
    print(f"  2. Train classifier: python training/train_dinov2.py train --data {cls_dir} --epochs 30")
    print(f"  3. Export models:    python training/train_yolov8.py export --model runs/detect/best.pt")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Dataset Manager")
    subparsers = parser.add_subparsers(dest="command")

    p = subparsers.add_parser("pipeline", help="Run full dataset pipeline")
    p.add_argument("--synthetic", type=str, default="data/synthetic")
    p.add_argument("--real", type=str, default=None)
    p.add_argument("--output", type=str, default="data/datasets")
    p.add_argument("--augmentation-factor", type=int, default=5)
    p.add_argument("--img-size", type=int, default=640)

    a = subparsers.add_parser("augment", help="Augment dataset")
    a.add_argument("--input", type=str, required=True)
    a.add_argument("--output", type=str, required=True)
    a.add_argument("--factor", type=int, default=5)
    a.add_argument("--img-size", type=int, default=640)

    s = subparsers.add_parser("stats", help="Dataset statistics")
    s.add_argument("--data", type=str, required=True)

    args = parser.parse_args()

    if args.command == "pipeline":
        run_full_pipeline(args.synthetic, args.real, args.output, args.augmentation_factor, args.img_size)
    elif args.command == "augment":
        augment_dataset(args.input, args.output, args.factor, args.img_size)
    elif args.command == "stats":
        stats = compute_dataset_stats(args.data)
        print(json.dumps(stats, indent=2))
    else:
        parser.print_help()
