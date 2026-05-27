"""
Training script for Predictive Maintenance Model + Digital Twin
Generates synthetic equipment telemetry and trains the maintenance predictor.
Also trains the Digital Twin farm simulator.
"""

import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from models.maintenance_predictor import MaintenancePredictor, DigitalTwinSimulator


def generate_maintenance_data(n_samples=5000, seq_len=30, n_features=8):
    """
    Generate synthetic equipment telemetry data.
    Features: engine_hours, rpm_avg, fuel_rate, vibration, oil_temp, load_pct, ambient_temp, operating_hours_today
    Labels: failure_prob per component, days_to_failure, wear_pct
    """
    np.random.seed(42)

    X = np.zeros((n_samples, seq_len, n_features))
    failure_labels = np.zeros((n_samples, 6))  # 6 components
    days_labels = np.zeros((n_samples, 6))
    wear_labels = np.zeros((n_samples, 6))

    for i in range(n_samples):
        # Base engine hours (0-10000)
        base_hours = np.random.uniform(0, 10000)

        # Component intervals and current wear
        intervals = [250, 500, 1000, 2000, 150, 3000]  # oil, air, hydraulic, tires, fuel_filter, bearings
        for c in range(6):
            hours_since = base_hours % intervals[c]
            wear = hours_since / intervals[c]
            wear_labels[i, c] = wear * 100

            # Failure probability increases with wear
            failure_labels[i, c] = min(1.0, wear ** 2 + np.random.normal(0, 0.05))
            failure_labels[i, c] = max(0, failure_labels[i, c])

            remaining = intervals[c] - hours_since
            days_labels[i, c] = max(0, remaining / 8)  # ~8 hours/day operation

        # Generate telemetry time series
        for t in range(seq_len):
            daily_hours = base_hours + t * 8
            rpm_base = np.random.choice([800, 1200, 1500, 1800, 2100])  # Typical RPM ranges
            load = np.random.uniform(0.2, 1.0)

            X[i, t, 0] = daily_hours  # engine_hours
            X[i, t, 1] = rpm_base + np.random.normal(0, 100)  # rpm
            X[i, t, 2] = 5 + load * 15 + np.random.normal(0, 1)  # fuel_rate L/h
            X[i, t, 3] = 0.1 + max(wear_labels[i].max()/100, 0) * 0.5 + np.random.normal(0, 0.05)  # vibration (g)
            X[i, t, 4] = 80 + load * 30 + np.random.normal(0, 5)  # oil_temp °C
            X[i, t, 5] = load * 100  # load_pct
            X[i, t, 6] = np.random.uniform(15, 40)  # ambient_temp
            X[i, t, 7] = np.random.uniform(2, 12)  # hours_today

    return (
        torch.FloatTensor(X),
        torch.FloatTensor(failure_labels),
        torch.FloatTensor(days_labels),
        torch.FloatTensor(wear_labels),
    )


def generate_digital_twin_data(n_samples=3000, state_dim=20, action_dim=8):
    """
    Generate synthetic farm state transition data for digital twin training.
    State: soil_moisture, soil_temp, soil_N, soil_P, soil_K, soil_pH, crop_height,
           leaf_area_index, chlorophyll, ndvi, gdd, rainfall_7d, temp_avg, humidity,
           radiation, wind, water_stress, nutrient_stress, disease_pressure, growth_stage
    Action: irrigation_mm, fertilizer_N, fertilizer_P, fertilizer_K, pesticide,
            tillage, harvest, cover_crop
    """
    np.random.seed(43)

    states = np.random.uniform(0, 1, (n_samples, state_dim))
    actions = np.zeros((n_samples, action_dim))

    # Generate realistic actions
    for i in range(n_samples):
        # Irrigate when soil moisture is low
        if states[i, 0] < 0.3:
            actions[i, 0] = np.random.uniform(10, 50)  # mm
        # Fertilize when nutrients are low
        if states[i, 2] < 0.3:
            actions[i, 1] = np.random.uniform(10, 50)  # N kg/ha
        if states[i, 3] < 0.3:
            actions[i, 2] = np.random.uniform(5, 25)  # P
        if states[i, 4] < 0.3:
            actions[i, 3] = np.random.uniform(10, 30)  # K

    # Simulate next states (simplified physics)
    next_states = states.copy()
    for i in range(n_samples):
        # Irrigation increases soil moisture
        next_states[i, 0] = min(1, states[i, 0] + actions[i, 0] / 100)
        # Fertilizer increases nutrients
        next_states[i, 2] = min(1, states[i, 2] + actions[i, 1] / 200)
        next_states[i, 3] = min(1, states[i, 3] + actions[i, 2] / 100)
        next_states[i, 4] = min(1, states[i, 4] + actions[i, 3] / 150)
        # Crop growth (if not stressed)
        stress = (states[i, 16] + states[i, 17]) / 2
        next_states[i, 6] = min(1, states[i, 6] + 0.02 * (1 - stress))
        next_states[i, 7] = min(1, states[i, 7] + 0.015 * (1 - stress))

    # Yield (correlates with low stress, adequate nutrients, good growth)
    yields = (
        next_states[:, 6] * 0.3 +  # crop height
        next_states[:, 7] * 0.2 +  # leaf area
        next_states[:, 9] * 0.2 +  # NDVI
        (1 - next_states[:, 16]) * 0.15 +  # water stress (inverted)
        (1 - next_states[:, 17]) * 0.15  # nutrient stress (inverted)
    ) * 8000  # kg/ha scale

    return (
        torch.FloatTensor(states),
        torch.FloatTensor(actions),
        torch.FloatTensor(next_states),
        torch.FloatTensor(yields).unsqueeze(1),
    )


def train_maintenance_model(epochs=10, batch_size=64, lr=0.001):
    print("=" * 60)
    print("TRAINING: Predictive Maintenance Model")
    print("=" * 60)

    X, failure_labels, days_labels, wear_labels = generate_maintenance_data()
    print(f"Data: {X.shape[0]} samples, {X.shape[1]} timesteps, {X.shape[2]} features")

    # Normalize
    X_mean = X.reshape(-1, X.shape[2]).mean(0)
    X_std = X.reshape(-1, X.shape[2]).std(0) + 1e-8
    X = (X - X_mean) / X_std

    # Split
    n_train = int(len(X) * 0.8)
    X_train, X_val = X[:n_train], X[n_train:]
    f_train, f_val = failure_labels[:n_train], failure_labels[n_train:]
    d_train, d_val = days_labels[:n_train], days_labels[n_train:]
    w_train, w_val = wear_labels[:n_train], wear_labels[n_train:]

    model = MaintenancePredictor(n_features=8, seq_len=30, n_components=6)
    optimizer = optim.Adam(model.parameters(), lr=lr)
    failure_loss_fn = nn.BCELoss()
    regression_loss_fn = nn.MSELoss()

    history = {"epochs": [], "train_loss": [], "val_failure_auc": []}

    for epoch in range(epochs):
        model.train()
        total_loss = 0
        n_batches = 0

        for start in range(0, len(X_train), batch_size):
            end = min(start + batch_size, len(X_train))
            batch_x = X_train[start:end]
            batch_f = f_train[start:end]
            batch_d = d_train[start:end]
            batch_w = w_train[start:end]

            pred_f, pred_d, pred_w = model(batch_x)

            loss = (
                failure_loss_fn(pred_f, batch_f) * 2.0 +
                regression_loss_fn(pred_d, batch_d) * 0.001 +
                regression_loss_fn(pred_w, batch_w) * 0.01
            )

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            total_loss += loss.item()
            n_batches += 1

        # Validation
        model.eval()
        with torch.no_grad():
            vf, vd, vw = model(X_val)
            val_f_loss = failure_loss_fn(vf, f_val).item()

        avg_loss = total_loss / n_batches
        print(f"Epoch {epoch+1}/{epochs} — loss: {avg_loss:.4f} — val_failure_bce: {val_f_loss:.4f}")
        history["epochs"].append(epoch + 1)
        history["train_loss"].append(avg_loss)
        history["val_failure_auc"].append(1 - val_f_loss)

    # Save
    weights_dir = os.path.join(os.path.dirname(__file__), "..", "weights")
    os.makedirs(weights_dir, exist_ok=True)

    checkpoint = {
        "model_state_dict": model.state_dict(),
        "input_mean": X_mean,
        "input_std": X_std,
        "n_features": 8,
        "seq_len": 30,
        "n_components": 6,
        "component_names": ["engine_oil", "air_filter", "hydraulic_fluid", "tires_tracks", "fuel_filter", "bearings"],
    }
    torch.save(checkpoint, os.path.join(weights_dir, "maintenance_predictor.pt"))

    with open(os.path.join(weights_dir, "maintenance_training_history.json"), "w") as f:
        json.dump(history, f, indent=2)

    total_params = sum(p.numel() for p in model.parameters())
    print(f"\nSaved: maintenance_predictor.pt ({total_params:,} params)")
    return model


def train_digital_twin(epochs=10, batch_size=64, lr=0.001):
    print("\n" + "=" * 60)
    print("TRAINING: Digital Twin Farm Simulator")
    print("=" * 60)

    states, actions, next_states, yields = generate_digital_twin_data()
    print(f"Data: {states.shape[0]} samples, state_dim={states.shape[1]}, action_dim={actions.shape[1]}")

    n_train = int(len(states) * 0.8)
    s_train, s_val = states[:n_train], states[n_train:]
    a_train, a_val = actions[:n_train], actions[n_train:]
    ns_train, ns_val = next_states[:n_train], next_states[n_train:]
    y_train, y_val = yields[:n_train], yields[n_train:]

    model = DigitalTwinSimulator(state_dim=20, action_dim=8, hidden_dim=128)
    optimizer = optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.MSELoss()

    for epoch in range(epochs):
        model.train()
        total_loss = 0
        n_batches = 0

        for start in range(0, len(s_train), batch_size):
            end = min(start + batch_size, len(s_train))
            pred_ns, pred_y = model(s_train[start:end], a_train[start:end])

            loss = loss_fn(pred_ns, ns_train[start:end]) + loss_fn(pred_y, y_train[start:end]) * 0.0001

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            total_loss += loss.item()
            n_batches += 1

        model.eval()
        with torch.no_grad():
            val_ns, val_y = model(s_val, a_val)
            val_loss = loss_fn(val_ns, ns_val).item()
            yield_rmse = torch.sqrt(loss_fn(val_y, y_val)).item()

        print(f"Epoch {epoch+1}/{epochs} — loss: {total_loss/n_batches:.4f} — val_state_mse: {val_loss:.4f} — yield_rmse: {yield_rmse:.1f}")

    weights_dir = os.path.join(os.path.dirname(__file__), "..", "weights")
    checkpoint = {
        "model_state_dict": model.state_dict(),
        "state_dim": 20,
        "action_dim": 8,
    }
    torch.save(checkpoint, os.path.join(weights_dir, "digital_twin.pt"))

    total_params = sum(p.numel() for p in model.parameters())
    print(f"\nSaved: digital_twin.pt ({total_params:,} params)")
    return model


if __name__ == "__main__":
    train_maintenance_model(epochs=10)
    train_digital_twin(epochs=10)
    print("\n✓ All models trained successfully")
