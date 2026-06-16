"""
YOLOv8 + SAM2 + DINOv2 Produce Detection, Segmentation & Grading Module.

Integrates three CV models for comprehensive produce inspection:
1. YOLOv8 — detect and classify produce items in inspection images
2. SAM2 — segment individual items for precise defect area measurement
3. DINOv2 — extract visual features for grade classification

Falls back to heuristic analysis when models are not loaded.
"""

import io
import json
import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger("ai-inspection.produce_detector")

try:
    import numpy as np
    from PIL import Image
    IMAGING_AVAILABLE = True
except ImportError:
    IMAGING_AVAILABLE = False

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

# ── YOLOv8 Detector ─────────────────────────────────────────────────────

class YOLOv8Detector:
    """YOLOv8-based produce detection and defect localization."""

    def __init__(self, model_path: Optional[str] = None):
        self._model = None
        self._loaded = False
        self.model_path = model_path or os.environ.get(
            "YOLO_MODEL_PATH",
            "models/yolov8_nigerian_produce.pt",
        )

        try:
            from ultralytics import YOLO
            if Path(self.model_path).exists():
                self._model = YOLO(self.model_path)
                self._loaded = True
                logger.info(f"YOLOv8 loaded from {self.model_path}")
            else:
                # Use pretrained COCO model as fallback
                self._model = YOLO("yolov8m.pt")
                self._loaded = True
                logger.info("YOLOv8 loaded with pretrained COCO weights (not fine-tuned for produce)")
        except ImportError:
            logger.warning("ultralytics not installed — YOLOv8 unavailable")
        except Exception as e:
            logger.error(f"YOLOv8 load failed: {e}")

    def get_status(self) -> str:
        if self._loaded:
            return "loaded"
        return "unavailable"

    def detect(self, image_bytes: bytes, conf_threshold: float = 0.25) -> dict:
        """
        Detect produce items and defects in an image.

        Returns:
            {
                "detections": [
                    {
                        "class": str,
                        "confidence": float,
                        "bbox": [x1, y1, x2, y2],
                        "bbox_normalized": [cx, cy, w, h],
                    }
                ],
                "count": int,
                "model": str,
            }
        """
        if not self._loaded or not self._model or not IMAGING_AVAILABLE:
            return self._fallback_detect(image_bytes)

        try:
            img = Image.open(io.BytesIO(image_bytes))
            results = self._model(img, conf=conf_threshold, verbose=False)

            detections = []
            for r in results:
                boxes = r.boxes
                if boxes is None:
                    continue
                for box in boxes:
                    cls_id = int(box.cls[0])
                    cls_name = r.names[cls_id]
                    conf = float(box.conf[0])
                    xyxy = box.xyxy[0].tolist()
                    xywhn = box.xywhn[0].tolist() if hasattr(box, 'xywhn') else [0, 0, 0, 0]

                    detections.append({
                        "class": cls_name,
                        "confidence": round(conf, 3),
                        "bbox": [round(v, 1) for v in xyxy],
                        "bbox_normalized": [round(v, 4) for v in xywhn],
                    })

            return {
                "detections": detections,
                "count": len(detections),
                "model": "YOLOv8",
            }
        except Exception as e:
            logger.error(f"YOLOv8 detection error: {e}")
            return self._fallback_detect(image_bytes)

    def _fallback_detect(self, image_bytes: bytes) -> dict:
        """Heuristic detection when YOLOv8 is unavailable."""
        size_kb = len(image_bytes) / 1024
        has_produce = size_kb > 10

        if not has_produce:
            return {"detections": [], "count": 0, "model": "fallback"}

        return {
            "detections": [
                {
                    "class": "produce",
                    "confidence": 0.75,
                    "bbox": [50, 50, 900, 900],
                    "bbox_normalized": [0.5, 0.5, 0.85, 0.85],
                }
            ],
            "count": 1,
            "model": "fallback",
        }


# ── SAM2 Segmentor ──────────────────────────────────────────────────────

class SAM2Segmentor:
    """Segment Anything Model 2 for produce item segmentation."""

    def __init__(self, model_path: Optional[str] = None):
        self._model = None
        self._predictor = None
        self._loaded = False
        self.model_path = model_path or os.environ.get(
            "SAM2_MODEL_PATH",
            "models/sam2_hiera_base_plus.pt",
        )

        if TORCH_AVAILABLE:
            try:
                from sam2.build_sam import build_sam2
                from sam2.sam2_image_predictor import SAM2ImagePredictor

                if Path(self.model_path).exists():
                    model_cfg = "sam2_hiera_b+.yaml"
                    sam2_model = build_sam2(model_cfg, self.model_path)
                    self._predictor = SAM2ImagePredictor(sam2_model)
                    self._loaded = True
                    logger.info(f"SAM2 loaded from {self.model_path}")
            except ImportError:
                logger.warning("sam2 not installed — segmentation unavailable")
                logger.info("Install with: pip install segment-anything-2")
            except Exception as e:
                logger.warning(f"SAM2 load failed: {e}")

    def get_status(self) -> str:
        if self._loaded:
            return "loaded"
        return "unavailable"

    def segment(self, image_bytes: bytes, bboxes: list[list[float]]) -> dict:
        """
        Segment produce items using bounding boxes from YOLOv8.

        Args:
            image_bytes: Input image
            bboxes: List of [x1, y1, x2, y2] bounding boxes

        Returns:
            {
                "segments": [
                    {
                        "bbox": [x1, y1, x2, y2],
                        "mask_area_pixels": int,
                        "mask_percentage": float,
                        "contour_points": int,
                    }
                ],
                "total_mask_area": float,
                "model": str,
            }
        """
        if not self._loaded or not self._predictor or not IMAGING_AVAILABLE:
            return self._fallback_segment(image_bytes, bboxes)

        try:
            img = Image.open(io.BytesIO(image_bytes))
            img_array = np.array(img)

            self._predictor.set_image(img_array)

            segments = []
            total_mask_area = 0
            img_area = img_array.shape[0] * img_array.shape[1]

            for bbox in bboxes:
                input_box = np.array(bbox)
                masks, scores, _ = self._predictor.predict(
                    box=input_box,
                    multimask_output=False,
                )
                mask = masks[0]
                mask_area = int(mask.sum())
                mask_pct = round(mask_area / img_area * 100, 2)

                segments.append({
                    "bbox": bbox,
                    "mask_area_pixels": mask_area,
                    "mask_percentage": mask_pct,
                    "contour_points": 0,
                    "score": round(float(scores[0]), 3),
                })
                total_mask_area += mask_pct

            return {
                "segments": segments,
                "total_mask_area": round(total_mask_area, 2),
                "model": "SAM2",
            }
        except Exception as e:
            logger.error(f"SAM2 segmentation error: {e}")
            return self._fallback_segment(image_bytes, bboxes)

    def _fallback_segment(self, image_bytes: bytes, bboxes: list[list[float]]) -> dict:
        """Heuristic segmentation when SAM2 is unavailable."""
        segments = []
        for bbox in bboxes:
            w = bbox[2] - bbox[0]
            h = bbox[3] - bbox[1]
            area_pct = round(w * h / (1024 * 1024) * 100, 2)
            segments.append({
                "bbox": bbox,
                "mask_area_pixels": int(w * h * 0.75),
                "mask_percentage": area_pct,
                "contour_points": 0,
                "score": 0.7,
            })

        return {
            "segments": segments,
            "total_mask_area": sum(s["mask_percentage"] for s in segments),
            "model": "fallback",
        }


# ── DINOv2 Grade Classifier ─────────────────────────────────────────────

class DINOv2GradeClassifier:
    """DINOv2-based produce grade classification."""

    GRADE_NAMES = ["grade_A", "grade_B", "grade_C", "grade_D", "reject"]

    def __init__(self, classifier_path: Optional[str] = None, model_size: str = "base"):
        self._backbone = None
        self._classifier = None
        self._loaded = False
        self._transform = None
        self.classifier_path = classifier_path or os.environ.get(
            "DINOV2_CLASSIFIER_PATH",
            "models/dinov2_grade_classifier.pt",
        )
        self.model_size = model_size

        if TORCH_AVAILABLE:
            try:
                self._load_models()
            except Exception as e:
                logger.warning(f"DINOv2 load failed: {e}")

    def _load_models(self):
        """Load DINOv2 backbone and classifier head."""
        from torchvision import transforms

        model_names = {
            "small": "dinov2_vits14",
            "base": "dinov2_vitb14",
            "large": "dinov2_vitl14",
        }
        feature_dims = {"small": 384, "base": 768, "large": 1024}

        model_name = model_names.get(self.model_size, "dinov2_vitb14")
        feature_dim = feature_dims.get(self.model_size, 768)

        device = "cuda" if torch.cuda.is_available() else "cpu"

        # Load backbone
        self._backbone = torch.hub.load("facebookresearch/dinov2", model_name)
        self._backbone = self._backbone.to(device)
        self._backbone.eval()

        self._transform = transforms.Compose([
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])

        # Load classifier head if available
        if Path(self.classifier_path).exists():
            checkpoint = torch.load(self.classifier_path, map_location=device, weights_only=True)
            import torch.nn as nn
            self._classifier = nn.Sequential(
                nn.LayerNorm(feature_dim),
                nn.Linear(feature_dim, 512),
                nn.GELU(),
                nn.Dropout(0.3),
                nn.Linear(512, 256),
                nn.GELU(),
                nn.Dropout(0.3),
                nn.Linear(256, checkpoint.get("num_classes", 5)),
            ).to(device)
            self._classifier.load_state_dict(checkpoint["model_state_dict"])
            self._classifier.eval()
            self.GRADE_NAMES = checkpoint.get("classes", self.GRADE_NAMES)
            logger.info(f"DINOv2 classifier loaded from {self.classifier_path}")
        else:
            logger.info("DINOv2 backbone loaded (no classifier head — using feature similarity)")

        self._loaded = True
        self._device = device
        logger.info(f"DINOv2 {self.model_size} loaded on {device}")

    def get_status(self) -> str:
        if self._loaded:
            return "loaded" if self._classifier else "backbone_only"
        return "unavailable"

    def classify_grade(self, image_bytes: bytes) -> dict:
        """
        Classify produce grade from an image.

        Returns:
            {
                "predicted_grade": str,
                "confidence": float,
                "grade_probabilities": {grade: float},
                "feature_vector_dim": int,
                "model": str,
            }
        """
        if not self._loaded or not IMAGING_AVAILABLE:
            return self._fallback_classify(image_bytes)

        try:
            img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            tensor = self._transform(img).unsqueeze(0).to(self._device)

            with torch.no_grad():
                features = self._backbone(tensor)

                if self._classifier:
                    logits = self._classifier(features)
                    probs = torch.softmax(logits, dim=1)[0]
                    pred_idx = probs.argmax().item()
                    pred_grade = self.GRADE_NAMES[pred_idx]
                    confidence = float(probs[pred_idx])

                    grade_probs = {
                        name: round(float(probs[i]), 4)
                        for i, name in enumerate(self.GRADE_NAMES)
                    }
                else:
                    # Without classifier, use feature magnitude heuristic
                    feat_norm = float(features.norm(dim=1)[0])
                    pred_grade = "grade_B"
                    confidence = 0.6
                    grade_probs = {g: 0.2 for g in self.GRADE_NAMES}

            return {
                "predicted_grade": pred_grade.replace("grade_", ""),
                "confidence": round(confidence, 4),
                "grade_probabilities": grade_probs,
                "feature_vector_dim": features.shape[1],
                "model": "DINOv2" + (" + classifier" if self._classifier else " (backbone only)"),
            }

        except Exception as e:
            logger.error(f"DINOv2 classification error: {e}")
            return self._fallback_classify(image_bytes)

    def _fallback_classify(self, image_bytes: bytes) -> dict:
        """Heuristic grade classification when DINOv2 is unavailable."""
        size_kb = len(image_bytes) / 1024
        # Simple heuristic: larger/higher-quality images tend to be better produce
        if size_kb > 200:
            grade = "B"
            confidence = 0.65
        elif size_kb > 50:
            grade = "B"
            confidence = 0.55
        else:
            grade = "C"
            confidence = 0.45

        return {
            "predicted_grade": grade,
            "confidence": confidence,
            "grade_probabilities": {
                "A": 0.15, "B": 0.35, "C": 0.25, "D": 0.15, "reject": 0.10,
            },
            "feature_vector_dim": 0,
            "model": "fallback",
        }


# ── Combined Pipeline ────────────────────────────────────────────────────

class ProduceInspectionPipeline:
    """
    Combined YOLOv8 + SAM2 + DINOv2 inspection pipeline.

    Flow:
    1. YOLOv8 detects produce items and defects
    2. SAM2 segments each detection for precise area measurement
    3. DINOv2 classifies the overall grade
    """

    def __init__(self):
        self.detector = YOLOv8Detector()
        self.segmentor = SAM2Segmentor()
        self.classifier = DINOv2GradeClassifier()

    def get_status(self) -> dict:
        return {
            "yolov8": self.detector.get_status(),
            "sam2": self.segmentor.get_status(),
            "dinov2": self.classifier.get_status(),
        }

    def inspect(self, image_bytes: bytes, crop_type: str = "unknown") -> dict:
        """
        Run full CV inspection pipeline on a produce image.

        Returns combined results from all three models.
        """
        # 1. Detect produce and defects
        detection_result = self.detector.detect(image_bytes)

        # 2. Segment detections
        bboxes = [d["bbox"] for d in detection_result["detections"]]
        segmentation_result = self.segmentor.segment(image_bytes, bboxes) if bboxes else {
            "segments": [], "total_mask_area": 0, "model": "skipped",
        }

        # 3. Classify grade
        grade_result = self.classifier.classify_grade(image_bytes)

        # Compute defect coverage from segmentation
        defect_detections = [
            d for d in detection_result["detections"]
            if any(defect_word in d["class"].lower() for defect_word in
                   ["rot", "mold", "damage", "broken", "defect", "pest", "insect"])
        ]
        defect_area_pct = 0.0
        if defect_detections and segmentation_result["segments"]:
            defect_indices = [
                detection_result["detections"].index(d)
                for d in defect_detections
                if d in detection_result["detections"]
            ]
            defect_area_pct = sum(
                segmentation_result["segments"][i]["mask_percentage"]
                for i in defect_indices
                if i < len(segmentation_result["segments"])
            )

        return {
            "detection": detection_result,
            "segmentation": segmentation_result,
            "grade_classification": grade_result,
            "summary": {
                "items_detected": detection_result["count"],
                "defects_found": len(defect_detections),
                "defect_area_percentage": round(defect_area_pct, 2),
                "predicted_grade": grade_result["predicted_grade"],
                "grade_confidence": grade_result["confidence"],
                "models_used": [
                    detection_result["model"],
                    segmentation_result["model"],
                    grade_result["model"],
                ],
            },
        }
