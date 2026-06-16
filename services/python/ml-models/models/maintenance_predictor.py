"""
Predictive Maintenance Model — PyTorch Time-Series DNN
Predicts equipment component failure from telemetry time series
Input: 30-day telemetry window (engine_hours, rpm, fuel_rate, vibration, temp, load)
Output: Failure probability per component, days until predicted failure
"""

import torch
import torch.nn as nn
import math


class MaintenancePredictor(nn.Module):
    """
    Temporal Convolutional Network for predictive maintenance.
    Processes time-series telemetry (30 timesteps x 8 features)
    and predicts failure probabilities for 6 equipment components.
    """
    def __init__(self, n_features=8, seq_len=30, n_components=6):
        super().__init__()
        self.n_features = n_features
        self.seq_len = seq_len
        self.n_components = n_components

        # Temporal convolution layers
        self.conv1 = nn.Conv1d(n_features, 32, kernel_size=3, padding=1)
        self.conv2 = nn.Conv1d(32, 64, kernel_size=3, padding=1)
        self.conv3 = nn.Conv1d(64, 64, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm1d(32)
        self.bn2 = nn.BatchNorm1d(64)
        self.bn3 = nn.BatchNorm1d(64)

        # Attention over time
        self.attention = nn.MultiheadAttention(64, num_heads=4, batch_first=True)

        # Classification heads
        self.fc1 = nn.Linear(64, 128)
        self.fc2 = nn.Linear(128, 64)
        # Per-component failure probability
        self.failure_head = nn.Linear(64, n_components)
        # Per-component days until failure
        self.days_head = nn.Linear(64, n_components)
        # Per-component wear percentage
        self.wear_head = nn.Linear(64, n_components)

        self.dropout = nn.Dropout(0.3)
        self.relu = nn.ReLU()

    def forward(self, x):
        """
        Args:
            x: (batch, seq_len, n_features) — telemetry time series
        Returns:
            failure_probs: (batch, n_components) — probability of failure
            days_to_failure: (batch, n_components) — predicted days until failure
            wear_pct: (batch, n_components) — current wear percentage
        """
        # x: (B, T, F) -> (B, F, T) for Conv1d
        x = x.permute(0, 2, 1)

        x = self.relu(self.bn1(self.conv1(x)))
        x = self.relu(self.bn2(self.conv2(x)))
        x = self.relu(self.bn3(self.conv3(x)))

        # (B, C, T) -> (B, T, C) for attention
        x = x.permute(0, 2, 1)
        attn_out, _ = self.attention(x, x, x)

        # Global average pooling over time
        x = attn_out.mean(dim=1)  # (B, 64)

        x = self.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.relu(self.fc2(x))

        failure_probs = torch.sigmoid(self.failure_head(x))
        days_to_failure = torch.relu(self.days_head(x)) * 365  # Scale to 0-365 days
        wear_pct = torch.sigmoid(self.wear_head(x)) * 100  # 0-100%

        return failure_probs, days_to_failure, wear_pct

    def predict(self, telemetry_tensor):
        """Predict maintenance needs from a single telemetry window."""
        self.eval()
        with torch.no_grad():
            if telemetry_tensor.dim() == 2:
                telemetry_tensor = telemetry_tensor.unsqueeze(0)
            failure_probs, days, wear = self(telemetry_tensor)

        component_names = ["engine_oil", "air_filter", "hydraulic_fluid", "tires_tracks", "fuel_filter", "bearings"]
        priority_map = {(0, 0.3): "low", (0.3, 0.6): "medium", (0.6, 0.85): "high", (0.85, 1.01): "critical"}

        predictions = []
        for i, comp in enumerate(component_names):
            prob = failure_probs[0][i].item()
            priority = "low"
            for (lo, hi), p in priority_map.items():
                if lo <= prob < hi:
                    priority = p
            predictions.append({
                "component": comp,
                "failure_probability": round(prob, 3),
                "days_to_failure": round(days[0][i].item(), 0),
                "wear_pct": round(wear[0][i].item(), 1),
                "priority": priority,
            })

        return sorted(predictions, key=lambda x: x["failure_probability"], reverse=True)


class DigitalTwinSimulator(nn.Module):
    """
    Farm Digital Twin — Physics-informed Neural Network
    Simulates crop growth, soil dynamics, and resource usage
    Input: current state (soil, weather, crop stage, management actions)
    Output: predicted state at next timestep
    """
    def __init__(self, state_dim=20, action_dim=8, hidden_dim=128):
        super().__init__()
        self.state_dim = state_dim
        self.action_dim = action_dim

        self.encoder = nn.Sequential(
            nn.Linear(state_dim + action_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
        )

        # Physics-informed residual connection
        self.dynamics = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
        )

        self.decoder = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, state_dim),
        )

        # Yield prediction head
        self.yield_head = nn.Sequential(
            nn.Linear(hidden_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 1),
            nn.ReLU(),
        )

    def forward(self, state, action):
        """
        Args:
            state: (batch, state_dim) — current farm state
            action: (batch, action_dim) — management action (irrigation, fertilizer, etc.)
        Returns:
            next_state: (batch, state_dim) — predicted next state
            predicted_yield: (batch, 1) — predicted final yield
        """
        x = torch.cat([state, action], dim=-1)
        encoded = self.encoder(x)
        dynamics = self.dynamics(encoded)
        residual = encoded + dynamics
        next_state = self.decoder(residual)
        predicted_yield = self.yield_head(residual)
        return next_state, predicted_yield

    def simulate_season(self, initial_state, actions_sequence):
        """
        Simulate an entire growing season.
        Args:
            initial_state: (state_dim,)
            actions_sequence: list of (action_dim,) tensors, one per timestep
        Returns:
            states: list of predicted states
            final_yield: predicted yield at end of season
        """
        self.eval()
        states = [initial_state]
        current_state = initial_state.unsqueeze(0) if initial_state.dim() == 1 else initial_state

        with torch.no_grad():
            for action in actions_sequence:
                action_tensor = action.unsqueeze(0) if action.dim() == 1 else action
                next_state, yield_pred = self(current_state, action_tensor)
                states.append(next_state.squeeze(0))
                current_state = next_state

        return states, yield_pred.item()


class FederatedAggregator:
    """
    Federated Learning Aggregator
    Aggregates model updates from multiple farms without sharing raw data.
    Implements Federated Averaging (FedAvg) algorithm.
    """
    def __init__(self, global_model):
        self.global_model = global_model
        self.round_number = 0
        self.participating_farms = []

    def get_global_weights(self):
        """Return current global model weights."""
        return {k: v.clone() for k, v in self.global_model.state_dict().items()}

    def aggregate_updates(self, farm_updates, farm_sizes):
        """
        FedAvg: weighted average of farm model updates.
        Args:
            farm_updates: list of state_dict from each farm
            farm_sizes: list of training set sizes per farm
        """
        total_size = sum(farm_sizes)
        global_state = self.global_model.state_dict()

        for key in global_state:
            weighted_sum = torch.zeros_like(global_state[key], dtype=torch.float32)
            for update, size in zip(farm_updates, farm_sizes):
                if key in update:
                    weighted_sum += update[key].float() * (size / total_size)
            global_state[key] = weighted_sum

        self.global_model.load_state_dict(global_state)
        self.round_number += 1
        self.participating_farms = [f"farm_{i}" for i in range(len(farm_updates))]

        return {
            "round": self.round_number,
            "participating_farms": len(farm_updates),
            "total_samples": total_size,
        }

    def differential_privacy_clip(self, gradients, max_norm=1.0, noise_scale=0.1):
        """Apply differential privacy to gradient updates."""
        clipped = []
        for grad in gradients:
            norm = torch.norm(grad)
            clip_factor = min(1.0, max_norm / (norm + 1e-8))
            clipped_grad = grad * clip_factor
            noise = torch.randn_like(clipped_grad) * noise_scale * max_norm
            clipped.append(clipped_grad + noise)
        return clipped
