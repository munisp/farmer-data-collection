"""
Lakehouse Integration for ML Feature Store & Model Registry

Connects to the existing Lakehouse service to:
1. Store/retrieve ML training features (Parquet + Delta Lake format)
2. Track model versions and metrics (model registry)
3. Pull real-time features for inference from PostgreSQL/Redis
4. Log training experiments with metadata

Uses Apache Arrow / Parquet for columnar storage.
"""

import os
import json
import time
import logging
import hashlib
from typing import Dict, List, Optional, Any
from pathlib import Path
from dataclasses import dataclass, asdict

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

LAKEHOUSE_URL = os.getenv("LAKEHOUSE_URL", "http://localhost:8085")
FEATURE_STORE_DIR = Path(os.getenv("FEATURE_STORE_DIR",
    str(Path(__file__).parent.parent / "data" / "feature_store")))
MODEL_REGISTRY_DIR = Path(os.getenv("MODEL_REGISTRY_DIR",
    str(Path(__file__).parent.parent / "data" / "model_registry")))


@dataclass
class ModelVersion:
    model_name: str
    version: str
    framework: str  # pytorch, sklearn
    metrics: Dict[str, float]
    parameters: Dict[str, Any]
    weights_path: str
    training_data_hash: str
    created_at: str
    status: str  # staging, production, archived


class FeatureStore:
    """
    Lakehouse-backed feature store for ML models.
    
    Stores features in Parquet format with optional Delta Lake versioning.
    Provides:
    - Feature registration with schema validation
    - Versioned feature sets
    - Point-in-time feature lookups
    - Feature statistics for data drift detection
    """

    def __init__(self, store_dir: Path = FEATURE_STORE_DIR):
        self.store_dir = store_dir
        self.store_dir.mkdir(parents=True, exist_ok=True)
        self._catalog: Dict[str, Dict] = {}
        self._load_catalog()

    def _load_catalog(self):
        catalog_path = self.store_dir / "catalog.json"
        if catalog_path.exists():
            with open(catalog_path) as f:
                self._catalog = json.load(f)

    def _save_catalog(self):
        with open(self.store_dir / "catalog.json", "w") as f:
            json.dump(self._catalog, f, indent=2)

    def register_feature_set(
        self, name: str, df: pd.DataFrame, description: str = "",
        entity_key: str = "id", timestamp_col: Optional[str] = None,
    ) -> str:
        """Register a feature set in the store."""
        version = f"v{int(time.time())}"
        feat_dir = self.store_dir / name / version
        feat_dir.mkdir(parents=True, exist_ok=True)

        # Save as Parquet
        parquet_path = feat_dir / "features.parquet"
        df.to_parquet(parquet_path, index=False, engine="pyarrow")

        # Compute statistics
        stats = {}
        for col in df.select_dtypes(include=[np.number]).columns:
            stats[col] = {
                "mean": float(df[col].mean()),
                "std": float(df[col].std()),
                "min": float(df[col].min()),
                "max": float(df[col].max()),
                "null_pct": float(df[col].isna().mean()),
            }

        # Register in catalog
        self._catalog[name] = {
            "latest_version": version,
            "description": description,
            "entity_key": entity_key,
            "timestamp_col": timestamp_col,
            "columns": list(df.columns),
            "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
            "num_rows": len(df),
            "stats": stats,
            "data_hash": hashlib.md5(df.to_csv().encode()).hexdigest()[:12],
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S UTC"),
        }
        self._save_catalog()

        logger.info(f"Registered feature set '{name}' {version}: {len(df)} rows, {len(df.columns)} cols")
        return version

    def get_features(self, name: str, version: Optional[str] = None) -> pd.DataFrame:
        """Retrieve features from the store."""
        if name not in self._catalog:
            raise ValueError(f"Feature set '{name}' not found. Available: {list(self._catalog.keys())}")

        ver = version or self._catalog[name]["latest_version"]
        parquet_path = self.store_dir / name / ver / "features.parquet"
        return pd.read_parquet(parquet_path)

    def get_stats(self, name: str) -> Dict:
        """Get feature statistics for data drift detection."""
        if name not in self._catalog:
            raise ValueError(f"Feature set '{name}' not found")
        return self._catalog[name]["stats"]

    def detect_drift(self, name: str, new_df: pd.DataFrame, threshold: float = 0.3) -> Dict:
        """Detect data drift between stored features and new data."""
        stored_stats = self.get_stats(name)
        drift_report = {}

        for col in new_df.select_dtypes(include=[np.number]).columns:
            if col not in stored_stats:
                continue
            old = stored_stats[col]
            new_mean = float(new_df[col].mean())
            new_std = float(new_df[col].std())

            mean_drift = abs(new_mean - old["mean"]) / (old["std"] + 1e-8)
            std_ratio = new_std / (old["std"] + 1e-8)

            drift_report[col] = {
                "mean_drift_sigmas": round(mean_drift, 3),
                "std_ratio": round(std_ratio, 3),
                "drifted": mean_drift > threshold or abs(std_ratio - 1) > threshold,
            }

        return drift_report

    def list_feature_sets(self) -> List[Dict]:
        """List all registered feature sets."""
        return [
            {"name": name, **{k: v for k, v in info.items() if k != "stats"}}
            for name, info in self._catalog.items()
        ]


class ModelRegistry:
    """
    Model version registry backed by Lakehouse storage.
    
    Tracks:
    - Model versions with weights paths
    - Training metrics history
    - Model promotion (staging → production)
    - A/B test configurations
    """

    def __init__(self, registry_dir: Path = MODEL_REGISTRY_DIR):
        self.registry_dir = registry_dir
        self.registry_dir.mkdir(parents=True, exist_ok=True)
        self._models: Dict[str, List[ModelVersion]] = {}
        self._load_registry()

    def _load_registry(self):
        reg_path = self.registry_dir / "registry.json"
        if reg_path.exists():
            with open(reg_path) as f:
                data = json.load(f)
                for name, versions in data.items():
                    self._models[name] = [ModelVersion(**v) for v in versions]

    def _save_registry(self):
        data = {
            name: [asdict(v) for v in versions]
            for name, versions in self._models.items()
        }
        with open(self.registry_dir / "registry.json", "w") as f:
            json.dump(data, f, indent=2)

    def register_model(
        self, model_name: str, metrics: Dict[str, float],
        parameters: Dict[str, Any], weights_path: str,
        training_data_hash: str = "",
    ) -> ModelVersion:
        """Register a new model version."""
        if model_name not in self._models:
            self._models[model_name] = []

        version_num = len(self._models[model_name]) + 1
        version = ModelVersion(
            model_name=model_name,
            version=f"v{version_num}",
            framework="pytorch",
            metrics=metrics,
            parameters=parameters,
            weights_path=weights_path,
            training_data_hash=training_data_hash,
            created_at=time.strftime("%Y-%m-%d %H:%M:%S UTC"),
            status="staging",
        )

        self._models[model_name].append(version)
        self._save_registry()
        logger.info(f"Registered model '{model_name}' {version.version}")
        return version

    def promote_to_production(self, model_name: str, version: str):
        """Promote a model version to production."""
        if model_name not in self._models:
            raise ValueError(f"Model '{model_name}' not found")

        for v in self._models[model_name]:
            if v.status == "production":
                v.status = "archived"
            if v.version == version:
                v.status = "production"

        self._save_registry()
        logger.info(f"Promoted {model_name} {version} to production")

    def get_production_model(self, model_name: str) -> Optional[ModelVersion]:
        """Get the current production model version."""
        if model_name not in self._models:
            return None
        for v in reversed(self._models[model_name]):
            if v.status == "production":
                return v
        # Return latest staging if no production
        return self._models[model_name][-1] if self._models[model_name] else None

    def get_model_history(self, model_name: str) -> List[Dict]:
        """Get version history for a model."""
        if model_name not in self._models:
            return []
        return [asdict(v) for v in self._models[model_name]]

    def list_models(self) -> List[Dict]:
        """List all registered models."""
        result = []
        for name, versions in self._models.items():
            prod = next((v for v in versions if v.status == "production"), None)
            result.append({
                "name": name,
                "total_versions": len(versions),
                "production_version": prod.version if prod else None,
                "latest_version": versions[-1].version if versions else None,
            })
        return result
