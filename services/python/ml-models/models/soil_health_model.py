"""
Soil Health Assessment Model — Multi-Modal Architecture

Combines three input modalities:
1. Soil photo analysis (CNN) — color, texture, moisture appearance
2. Test kit readings (MLP) — pH, N/P/K, organic matter, CEC from portable meters
3. Location context (MLP) — GPS coordinates, elevation, rainfall, temperature, NDVI

Architecture:
    Photo branch:  Conv(3→32)→Conv(32→64)→Conv(64→128)→GAP → 128-dim
    Lab branch:    FC(7→64)→BN→ReLU→FC(64→32) → 32-dim
    Location branch: FC(6→32)→BN→ReLU→FC(32→16) → 16-dim
    
    Fusion: concat(128+32+16=176) → FC(176→128)→BN→ReLU → 
            FC(128→64)→BN→ReLU → Multi-head output:
                health_score: FC(64→1) → Sigmoid × 100  (0-100 score)
                fertility:    FC(64→5) → Softmax (very_low, low, medium, high, very_high)
                recommendations: FC(64→8) → Sigmoid (multi-label: add_lime, add_nitrogen, etc.)

Handles missing modalities: if no photo, zero-fills CNN branch.
If no lab readings, uses defaults. Graceful degradation.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict, List, Optional, Tuple


FERTILITY_CLASSES = ["very_low", "low", "medium", "high", "very_high"]

RECOMMENDATION_LABELS = [
    "add_lime",           # Raise pH (acidic soil)
    "add_sulfur",         # Lower pH (alkaline soil)
    "add_nitrogen",       # Low N
    "add_phosphorus",     # Low P
    "add_potassium",      # Low K
    "add_organic_matter", # Low OM
    "improve_drainage",   # Waterlogged / high CEC clay
    "add_mulch",          # Moisture retention / erosion
]


class SoilPhotoCNN(nn.Module):
    """Lightweight CNN for soil photo analysis."""

    def __init__(self, out_dim: int = 128, dropout: float = 0.2):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 32, 3, padding=1), nn.BatchNorm2d(32), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(32, 64, 3, padding=1), nn.BatchNorm2d(64), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(64, 128, 3, padding=1), nn.BatchNorm2d(128), nn.ReLU(), nn.MaxPool2d(2),
        )
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.proj = nn.Linear(128, out_dim)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.features(x)
        x = self.pool(x).view(x.size(0), -1)
        return self.dropout(F.relu(self.proj(x)))


class SoilLabMLP(nn.Module):
    """MLP for test kit readings: pH, N, P, K, organic_matter, CEC, moisture."""

    def __init__(self, in_dim: int = 7, out_dim: int = 32):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, 64), nn.BatchNorm1d(64), nn.ReLU(),
            nn.Linear(64, out_dim), nn.BatchNorm1d(out_dim), nn.ReLU(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class SoilLocationMLP(nn.Module):
    """MLP for location context: lat, lon, elevation, rainfall, temperature, ndvi."""

    def __init__(self, in_dim: int = 6, out_dim: int = 16):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, 32), nn.BatchNorm1d(32), nn.ReLU(),
            nn.Linear(32, out_dim), nn.BatchNorm1d(out_dim), nn.ReLU(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class SoilHealthModel(nn.Module):
    """
    Multi-modal soil health assessment model.
    
    Combines photo CNN + lab MLP + location MLP into a unified prediction:
    - health_score: 0-100 overall soil health
    - fertility_class: 5-class classification
    - recommendations: 8 binary labels for actionable advice
    
    Total parameters: ~180K
    CPU inference: <15ms (photo + lab), <5ms (lab only)
    """

    LAB_FEATURES = ["ph", "nitrogen_ppm", "phosphorus_ppm", "potassium_ppm",
                     "organic_matter_pct", "cec_meq_100g", "moisture_pct"]
    LOCATION_FEATURES = ["latitude", "longitude", "elevation_m",
                          "annual_rainfall_mm", "avg_temperature_c", "ndvi"]

    def __init__(self, photo_dim: int = 128, lab_dim: int = 32, loc_dim: int = 16,
                 dropout: float = 0.2):
        super().__init__()
        self.photo_cnn = SoilPhotoCNN(out_dim=photo_dim, dropout=dropout)
        self.lab_mlp = SoilLabMLP(in_dim=7, out_dim=lab_dim)
        self.location_mlp = SoilLocationMLP(in_dim=6, out_dim=loc_dim)

        fusion_dim = photo_dim + lab_dim + loc_dim  # 176

        self.fusion = nn.Sequential(
            nn.Linear(fusion_dim, 128), nn.BatchNorm1d(128), nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(128, 64), nn.BatchNorm1d(64), nn.ReLU(),
        )

        # Multi-head outputs
        self.health_head = nn.Linear(64, 1)      # Sigmoid → 0-100
        self.fertility_head = nn.Linear(64, 5)   # Softmax → 5 classes
        self.recommend_head = nn.Linear(64, 8)   # Sigmoid → multi-label

    def forward(
        self,
        photo: Optional[torch.Tensor] = None,
        lab: Optional[torch.Tensor] = None,
        location: Optional[torch.Tensor] = None,
    ) -> Dict[str, torch.Tensor]:
        batch_size = 1
        device = next(self.parameters()).device

        if photo is not None:
            batch_size = photo.size(0)
            photo_feat = self.photo_cnn(photo)
        else:
            if lab is not None:
                batch_size = lab.size(0)
            elif location is not None:
                batch_size = location.size(0)
            photo_feat = torch.zeros(batch_size, 128, device=device)

        if lab is not None:
            lab_feat = self.lab_mlp(lab)
        else:
            lab_feat = torch.zeros(batch_size, 32, device=device)

        if location is not None:
            loc_feat = self.location_mlp(location)
        else:
            loc_feat = torch.zeros(batch_size, 16, device=device)

        fused = torch.cat([photo_feat, lab_feat, loc_feat], dim=1)
        features = self.fusion(fused)

        health_raw = torch.sigmoid(self.health_head(features)) * 100
        fertility_logits = self.fertility_head(features)
        recommend_probs = torch.sigmoid(self.recommend_head(features))

        return {
            "health_score": health_raw.squeeze(-1),
            "fertility_logits": fertility_logits,
            "recommendation_probs": recommend_probs,
        }

    def predict(
        self,
        photo: Optional[torch.Tensor] = None,
        lab: Optional[torch.Tensor] = None,
        location: Optional[torch.Tensor] = None,
    ) -> Dict:
        """Run inference and return human-readable results."""
        self.eval()
        with torch.no_grad():
            out = self.forward(photo, lab, location)

        health_score = round(out["health_score"].item(), 1)
        fertility_probs = F.softmax(out["fertility_logits"], dim=1).squeeze()
        fertility_idx = fertility_probs.argmax().item()
        rec_probs = out["recommendation_probs"].squeeze()

        # Build recommendations list
        recommendations = []
        for i, label in enumerate(RECOMMENDATION_LABELS):
            if rec_probs[i].item() > 0.5:
                recommendations.append({
                    "action": label,
                    "confidence": round(rec_probs[i].item(), 3),
                    "description": _get_recommendation_description(label),
                })

        # Health category
        if health_score >= 80:
            category = "excellent"
        elif health_score >= 60:
            category = "good"
        elif health_score >= 40:
            category = "fair"
        elif health_score >= 20:
            category = "poor"
        else:
            category = "critical"

        return {
            "health_score": health_score,
            "health_category": category,
            "fertility_class": FERTILITY_CLASSES[fertility_idx],
            "fertility_confidence": round(fertility_probs[fertility_idx].item(), 3),
            "recommendations": recommendations,
            "modalities_used": {
                "photo": photo is not None,
                "lab_readings": lab is not None,
                "location": location is not None,
            },
        }

    def get_num_params(self) -> int:
        return sum(p.numel() for p in self.parameters())


def _get_recommendation_description(label: str) -> str:
    descriptions = {
        "add_lime": "Apply agricultural lime (2-4 tonnes/ha) to raise pH. Acidic soil limits nutrient uptake.",
        "add_sulfur": "Apply eleite sulfur (0.5-1 tonne/ha) to lower pH. Alkaline soil locks phosphorus.",
        "add_nitrogen": "Apply urea or CAN fertilizer (50-100 kg/ha). Nitrogen deficiency reduces leaf growth.",
        "add_phosphorus": "Apply DAP or TSP fertilizer (30-60 kg/ha). Phosphorus aids root development and flowering.",
        "add_potassium": "Apply MOP or SOP fertilizer (40-80 kg/ha). Potassium improves disease resistance and water regulation.",
        "add_organic_matter": "Add compost, manure, or crop residues (5-10 tonnes/ha). Organic matter improves water retention and soil structure.",
        "improve_drainage": "Install drainage channels or raised beds. Waterlogged soil causes root rot and limits oxygen.",
        "add_mulch": "Apply 5-10cm organic mulch around plants. Reduces evaporation, suppresses weeds, and prevents erosion.",
    }
    return descriptions.get(label, "")


# Optimal ranges for interpretation
SOIL_OPTIMAL_RANGES = {
    "ph": {"min": 6.0, "max": 7.0, "unit": "", "low_action": "add_lime", "high_action": "add_sulfur"},
    "nitrogen_ppm": {"min": 40, "max": 120, "unit": "ppm", "low_action": "add_nitrogen"},
    "phosphorus_ppm": {"min": 15, "max": 60, "unit": "ppm", "low_action": "add_phosphorus"},
    "potassium_ppm": {"min": 100, "max": 250, "unit": "ppm", "low_action": "add_potassium"},
    "organic_matter_pct": {"min": 2.0, "max": 6.0, "unit": "%", "low_action": "add_organic_matter"},
    "cec_meq_100g": {"min": 10, "max": 30, "unit": "meq/100g"},
    "moisture_pct": {"min": 20, "max": 60, "unit": "%", "high_action": "improve_drainage"},
}


def interpret_lab_readings(readings: Dict[str, float]) -> Dict:
    """Rule-based interpretation layer on top of ML predictions.
    Provides deterministic explanations for each reading."""
    interpretations = {}
    for param, value in readings.items():
        if param not in SOIL_OPTIMAL_RANGES:
            continue
        opt = SOIL_OPTIMAL_RANGES[param]
        if value < opt["min"]:
            status = "low"
            action = opt.get("low_action", "consult_agronomist")
        elif value > opt["max"]:
            status = "high"
            action = opt.get("high_action", "consult_agronomist")
        else:
            status = "optimal"
            action = "maintain_current_practice"

        interpretations[param] = {
            "value": value,
            "unit": opt["unit"],
            "status": status,
            "optimal_range": f"{opt['min']}-{opt['max']}",
            "action": action,
        }
    return interpretations
