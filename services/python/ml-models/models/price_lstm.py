"""
Crop Price Forecasting Model

Architecture: LSTM encoder with attention + linear decoder
Predicts next N days of crop prices from a lookback window.

Input: (batch, lookback, features) — daily price, volume, day-of-week, month
Output: (batch, forecast_horizon) — predicted prices
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict


class PriceAttention(nn.Module):
    """Temporal attention over LSTM hidden states."""

    def __init__(self, hidden_size: int):
        super().__init__()
        self.attn = nn.Linear(hidden_size, 1)

    def forward(self, lstm_output: torch.Tensor) -> torch.Tensor:
        weights = F.softmax(self.attn(lstm_output), dim=1)
        context = (weights * lstm_output).sum(dim=1)
        return context


class PriceLSTM(nn.Module):
    """
    LSTM with attention for commodity price forecasting.
    
    Architecture:
        Input projection → LSTM(2 layers) → Temporal Attention →
        FC(hidden→64) → ReLU → FC(64→forecast_horizon)
    
    Features per timestep (5):
        price, volume (log), day_of_week (sin/cos encoded), month (sin/cos encoded)
    
    Lookback window: 60 days
    Forecast horizon: 30 days (configurable)
    """

    def __init__(
        self,
        input_size: int = 5,
        hidden_size: int = 128,
        num_layers: int = 2,
        forecast_horizon: int = 30,
        dropout: float = 0.2,
    ):
        super().__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.forecast_horizon = forecast_horizon

        self.input_proj = nn.Linear(input_size, hidden_size)
        self.lstm = nn.LSTM(
            hidden_size, hidden_size, num_layers,
            batch_first=True, dropout=dropout if num_layers > 1 else 0,
        )
        self.attention = PriceAttention(hidden_size)
        self.decoder = nn.Sequential(
            nn.Linear(hidden_size, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, forecast_horizon),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = F.relu(self.input_proj(x))
        lstm_out, _ = self.lstm(x)
        context = self.attention(lstm_out)
        return self.decoder(context)

    def predict(self, x: torch.Tensor, price_mean: float, price_std: float) -> Dict:
        """Run inference and denormalize predictions."""
        self.eval()
        with torch.no_grad():
            normalized_pred = self.forward(x).squeeze()
            predictions = normalized_pred * price_std + price_mean
        return {
            "forecast": predictions.tolist(),
            "horizon_days": self.forecast_horizon,
        }

    def get_num_params(self) -> int:
        return sum(p.numel() for p in self.parameters())
