"""
Crop Disease CNN Classifier

Architecture: Lightweight CNN designed for CPU inference on edge/mobile devices.
- 4 convolutional blocks with batch norm
- Global average pooling (no FC explosion)
- Multi-class classification across 30+ crop diseases
- Runs on CPU in <50ms per image at 64×64

Input: (batch, 3, 64, 64) normalized RGB
Output: (batch, num_classes) logits
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict


class ConvBlock(nn.Module):
    def __init__(self, in_channels: int, out_channels: int, kernel_size: int = 3):
        super().__init__()
        self.conv = nn.Conv2d(in_channels, out_channels, kernel_size, padding=kernel_size // 2)
        self.bn = nn.BatchNorm2d(out_channels)
        self.pool = nn.MaxPool2d(2, 2)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.pool(F.relu(self.bn(self.conv(x))))


class CropDiseaseCNN(nn.Module):
    """
    Lightweight CNN for crop leaf disease classification.
    
    Architecture:
        Conv(3→32) → BN → ReLU → Pool
        Conv(32→64) → BN → ReLU → Pool
        Conv(64→128) → BN → ReLU → Pool
        Conv(128→256) → BN → ReLU → Pool
        GlobalAvgPool → Dropout → FC(256→num_classes)
    
    Parameters: ~400K (vs 25M+ for ResNet-18)
    Inference: <50ms on CPU for 64×64 input
    """

    def __init__(self, num_classes: int = 30, dropout: float = 0.3):
        super().__init__()
        self.features = nn.Sequential(
            ConvBlock(3, 32),
            ConvBlock(32, 64),
            ConvBlock(64, 128),
            ConvBlock(128, 256),
        )
        self.global_pool = nn.AdaptiveAvgPool2d(1)
        self.dropout = nn.Dropout(dropout)
        self.classifier = nn.Linear(256, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.features(x)
        x = self.global_pool(x)
        x = x.view(x.size(0), -1)
        x = self.dropout(x)
        return self.classifier(x)

    def predict(self, x: torch.Tensor) -> Dict:
        """Run inference and return predicted class + probabilities."""
        self.eval()
        with torch.no_grad():
            logits = self.forward(x)
            probs = F.softmax(logits, dim=1)
            confidence, predicted = probs.max(dim=1)
        return {
            "predicted_class": predicted.item(),
            "confidence": confidence.item(),
            "all_probabilities": probs.squeeze().tolist(),
        }

    def get_num_params(self) -> int:
        return sum(p.numel() for p in self.parameters())
