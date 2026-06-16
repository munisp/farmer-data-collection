---
name: testing-ml-stack
description: Test the FarmConnect AI/ML/DL/GNN stack end-to-end. Use when verifying PyTorch model training, inference server, synthetic data generators, or ML API endpoints.
---

# Testing the FarmConnect ML Stack

## Overview
The ML stack lives at `services/python/ml-models/` and consists of:
- 7 PyTorch models (disease CNN, yield predictor, price LSTM, credit scorer, fraud detector, farmer GNN, **soil health model**)
- Synthetic data generators (`data/synthetic_generator.py`)
- Training scripts (`training/train_all.py`, `training/train_soil.py`)
- FastAPI inference server (`inference/server.py` on port 8096)
- Neo4j integration (`training/neo4j_graph.py`)
- Ray distributed training (`training/ray_distributed.py`)
- Lakehouse feature store (`training/lakehouse_features.py`)

## Prerequisites
```bash
cd services/python/ml-models
pip install -r requirements.txt
# Key deps: torch, numpy, pandas, scikit-learn, fastapi, uvicorn, pyarrow
```

## Testing Procedure

### 1. Generate Synthetic Data
```bash
python data/synthetic_generator.py
```
**Expected outputs in `data/generated/`:**
- `crop_disease.npz` — images (N,3,64,64) + labels + class names
- `yield_data.parquet` — 10K rows, 17 columns
- `price_timeseries.parquet` — ~4K daily price records
- `credit_scoring.parquet` — 5K farmer profiles
- `fraud_detection.parquet` — 10K transactions (~5% fraud)
- `graph_data.json` — 530+ nodes, 2400+ edges
- `soil_health.parquet` — 3K soil test records
- `soil_multimodal.npz` — 5K multi-modal samples (photos, lab readings, locations, labels)

### 2. Train Models
```bash
python -m training.train_all --epochs 5    # Quick test (5 epochs)
python -m training.train_all --epochs 20   # Better accuracy
python -m training.train_all --model yield credit  # Train subset
python -m training.train_soil --epochs 5   # Train soil model separately
python -m training.train_soil --quick       # Quick soil training
```
**Expected outputs in `weights/`:** 7 `.pt` files + `training_report.json` + `soil_training_history.json`

### 3. Start Inference Server
```bash
PORT=8096 python inference/server.py
```
**Verify:** `curl http://localhost:8096/health` should return all 7 models loaded (disease, yield, price, credit, fraud, gnn, soil).

### 4. Test Endpoints
```bash
# Yield prediction
curl -X POST http://localhost:8096/predict/yield \
  -H 'Content-Type: application/json' \
  -d '{"crop":"maize","region":"central_kenya","soil_type":"loamy","fertilizer":"npk","irrigation":"drip","farm_size_ha":2,"rainfall_mm":900,"temperature_c":25,"elevation_m":1500,"soil_ph":6.5,"nitrogen_ppm":50,"phosphorus_ppm":30,"potassium_ppm":150,"organic_matter_pct":3,"ndvi":0.7,"planting_month":3}'

# Credit scoring
curl -X POST http://localhost:8096/predict/credit \
  -H 'Content-Type: application/json' \
  -d '{"features":[45,10,3,3,1,1,1,1,50000,15000,2,2,0,12,1500]}'

# Fraud detection
curl -X POST http://localhost:8096/predict/fraud \
  -H 'Content-Type: application/json' \
  -d '{"features":[500,14,3,365,365,50,4.5,30,5,1,1,1,1,1,50],"threshold":0.5}'

# Soil analysis — good soil (lab only, no photo)
curl -X POST http://localhost:8096/predict/soil \
  -H 'Content-Type: application/json' \
  -d '{"ph":6.5,"nitrogen_ppm":60,"phosphorus_ppm":25,"potassium_ppm":150,"organic_matter_pct":3.5,"cec_meq_100g":20,"moisture_pct":35}'

# Soil analysis — poor soil (should get recommendations)
curl -X POST http://localhost:8096/predict/soil \
  -H 'Content-Type: application/json' \
  -d '{"ph":4.5,"nitrogen_ppm":8,"phosphorus_ppm":4,"potassium_ppm":30,"organic_matter_pct":0.7,"cec_meq_100g":4,"moisture_pct":80}'
```

### 5. Validate Error Handling
```bash
# Invalid crop → expect HTTP 400
curl -X POST http://localhost:8096/predict/yield \
  -H 'Content-Type: application/json' \
  -d '{"crop":"banana","region":"central_kenya","soil_type":"loamy","fertilizer":"npk","irrigation":"drip","farm_size_ha":2,"rainfall_mm":900,"temperature_c":25,"elevation_m":1500,"soil_ph":6.5,"nitrogen_ppm":50,"phosphorus_ppm":30,"potassium_ppm":150,"organic_matter_pct":3,"ndvi":0.7,"planting_month":3}'

# Too few prices → expect HTTP 400
curl -X POST http://localhost:8096/predict/price \
  -H 'Content-Type: application/json' \
  -d '{"prices":[50,51,52],"volumes":[100,200,300]}'

# Invalid soil pH (out of range) → expect HTTP 422
curl -X POST http://localhost:8096/predict/soil \
  -H 'Content-Type: application/json' \
  -d '{"ph":-1,"nitrogen_ppm":50,"phosphorus_ppm":25,"potassium_ppm":150,"organic_matter_pct":3,"cec_meq_100g":15,"moisture_pct":35}'

curl -X POST http://localhost:8096/predict/soil \
  -H 'Content-Type: application/json' \
  -d '{"ph":15,"nitrogen_ppm":50,"phosphorus_ppm":25,"potassium_ppm":150,"organic_matter_pct":3,"cec_meq_100g":15,"moisture_pct":35}'
```

## Valid Categorical Values (for yield prediction)
- **crops:** maize, rice, beans, cassava, wheat, sorghum, potatoes, coffee, tea
- **regions:** central_kenya, western_kenya, rift_valley, nyanza, coast, northern_uganda, southern_uganda, northern_nigeria, southern_nigeria
- **soil_types:** loamy, clay, sandy, silt, volcanic, laterite
- **fertilizers:** npk, organic_compost, urea, dap, can, none
- **irrigation:** rainfed, drip, sprinkler, flood, none

## Key Assertions
- All inference responses must include `inference_ms` field
- Yield predictions must be positive (ReLU output)
- Credit `repayment_probability` must be in [0, 1]
- Fraud `risk_level` must be one of: low, medium, high, critical
- Disease endpoint needs a 3×64×64 image tensor (use `numpy.random.rand(3,64,64).tolist()`)
- Price endpoint needs at least 60 daily prices
- Soil `health_score` must be in [0, 100]
- Soil `health_category` must be one of: excellent, good, fair, poor, critical
- Soil `fertility_class` must be one of: very_low, low, medium, high, very_high
- Soil `lab_interpretation` must have entries for all 7 parameters with status (low/optimal/high)
- Soil `crop_suitability` must be non-empty (at least cover_crops as fallback)
- Soil pH validation: ge=0, le=14 (values outside this range return HTTP 422)
- Soil with photo tensor: `modalities_used.photo` must be true
- Soil with lat/lon: `modalities_used.location` must be true

## Soil-Specific Test Data

**Good soil (expect score >70, few/no recommendations):**
```json
{"ph":6.5,"nitrogen_ppm":60,"phosphorus_ppm":25,"potassium_ppm":150,"organic_matter_pct":3.5,"cec_meq_100g":20,"moisture_pct":35}
```

**Poor soil (expect score <45, 3+ recommendations):**
```json
{"ph":4.5,"nitrogen_ppm":8,"phosphorus_ppm":4,"potassium_ppm":30,"organic_matter_pct":0.7,"cec_meq_100g":4,"moisture_pct":80}
```

**Full multimodal (add photo + location to lab readings):**
- Photo: `numpy.random.rand(3,64,64).tolist()` as `"photo"` field
- Location: `"latitude":-1.2864, "longitude":36.8172, "elevation_m":1661, "annual_rainfall_mm":1050, "avg_temperature_c":18, "ndvi":0.65`

**Optimal ranges for lab interpretation:**
| Parameter | Min | Max | Unit | Low Action | High Action |
|---|---|---|---|---|---|
| pH | 6.0 | 7.0 | | add_lime | add_sulfur |
| Nitrogen | 40 | 120 | ppm | add_nitrogen | — |
| Phosphorus | 15 | 60 | ppm | add_phosphorus | — |
| Potassium | 100 | 250 | ppm | add_potassium | — |
| Organic Matter | 2.0 | 6.0 | % | add_organic_matter | — |
| CEC | 10 | 30 | meq/100g | consult_agronomist | — |
| Moisture | 20 | 60 | % | — | improve_drainage |

## Known Behaviors
- Fraud detector may give unexpected scores when features don't match training distribution — normalization uses stored mean/std from training data
- Disease CNN accuracy is low (~18-21%) on synthetic data — expected since synthetic images use color patterns not real leaf textures
- All models are CPU-only — no CUDA required
- The inference server uses `weights_only=False` when loading checkpoints
- **Soil model with random photo:** When a random photo tensor is sent alongside optimal lab readings, the health score may drop significantly (e.g., 85→48) because the CNN pathway processes noise as out-of-distribution input. This is expected — real soil photos would provide useful signal
- **Soil recommendation threshold:** The model uses >0.5 probability threshold for recommendations. Poor soil may not trigger all expected recommendations via ML — the `lab_interpretation` layer provides deterministic coverage for all parameters
- **Soil training:** Use `--quick` flag for fast validation. Full training uses `--epochs 20` and produces ~5K samples. The soil model trains separately from the other 6 models (use `train_soil.py`, not `train_all.py`)

## Devin Secrets Needed
None — all testing is local, no external services required.
