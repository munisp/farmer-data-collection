"""
Crop Yield Prediction Model

Architecture: Deep tabular network with embedding layers for categorical features
and a multi-layer regression head.

Input: Mixed categorical + numerical agricultural features
Output: Predicted yield in kg/ha

Handles: crop type, region, soil type, fertilizer, irrigation (embedded)
+ rainfall, temperature, elevation, soil chemistry, NDVI (numerical)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict, List, Tuple


class YieldPredictor(nn.Module):
    """
    Deep tabular network for crop yield prediction.
    
    Architecture:
        Categorical embeddings → concat with numerical → 
        FC(dim→256) → BN → ReLU → Dropout →
        FC(256→128) → BN → ReLU → Dropout →
        FC(128→64) → BN → ReLU →
        FC(64→1) → ReLU (yield must be positive)
    
    Embeddings:
        crop: 9 types → 8 dims
        region: 9 regions → 6 dims
        soil_type: 6 types → 4 dims
        fertilizer: 6 types → 4 dims
        irrigation: 5 types → 4 dims
    
    Numerical features (11):
        farm_size, rainfall, temperature, elevation, ph,
        nitrogen, phosphorus, potassium, organic_matter, ndvi, planting_month
    """

    CATEGORICAL_FEATURES = {
        "crop": (9, 8),
        "region": (9, 6),
        "soil_type": (6, 4),
        "fertilizer": (6, 4),
        "irrigation": (5, 4),
    }
    NUM_NUMERICAL = 11

    def __init__(self, dropout: float = 0.2):
        super().__init__()

        self.embeddings = nn.ModuleDict({
            name: nn.Embedding(num_cat, emb_dim)
            for name, (num_cat, emb_dim) in self.CATEGORICAL_FEATURES.items()
        })

        total_emb_dim = sum(d for _, d in self.CATEGORICAL_FEATURES.values())
        input_dim = total_emb_dim + self.NUM_NUMERICAL

        self.net = nn.Sequential(
            nn.Linear(input_dim, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(256, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(128, 64),
            nn.BatchNorm1d(64),
            nn.ReLU(),
            nn.Linear(64, 1),
        )

    def forward(
        self, categorical: Dict[str, torch.Tensor], numerical: torch.Tensor
    ) -> torch.Tensor:
        emb_list = []
        for name, emb_layer in self.embeddings.items():
            emb_list.append(emb_layer(categorical[name]))

        x = torch.cat(emb_list + [numerical], dim=1)
        output = self.net(x)
        return F.relu(output)  # yield must be non-negative

    def predict(
        self, categorical: Dict[str, torch.Tensor], numerical: torch.Tensor
    ) -> Dict:
        self.eval()
        with torch.no_grad():
            pred = self.forward(categorical, numerical)
        return {
            "predicted_yield_kg_per_ha": pred.squeeze().item(),
        }

    def get_num_params(self) -> int:
        return sum(p.numel() for p in self.parameters())
