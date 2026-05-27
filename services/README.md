# AI/ML Services Deployment Guide

This directory contains the microservices for the AI/ML system:
- **Python ML Service** (Port 8086): Model inference, training, and optimization
- **Go Model Serving** (Port 8087): High-performance edge optimization

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose installed
- PostgreSQL database running (for TypeScript backend)
- At least 4GB RAM available

### Start All Services

```bash
# Create Docker network (if not exists)
docker network create farmer-network 2>/dev/null || true

# Start ML services
cd services
docker-compose -f docker-compose-ml.yml up -d

# Check service health
docker-compose -f docker-compose-ml.yml ps
docker-compose -f docker-compose-ml.yml logs -f
```

### Stop Services

```bash
cd services
docker-compose -f docker-compose-ml.yml down
```

## 📦 Service Details

### Python ML Service (Port 8086)

**Responsibilities:**
- Model inference (disease detection, pest ID, yield prediction)
- Model training and fine-tuning
- Model optimization (quantization, pruning, compression)
- Accuracy benchmarking
- Image preprocessing

**Endpoints:**
- `GET /health` - Health check
- `POST /inference` - Run model inference
- `POST /inference/batch` - Batch inference
- `POST /train` - Train/fine-tune model
- `POST /optimize` - Optimize model for edge devices
- `POST /benchmark` - Benchmark model accuracy
- `GET /models` - List available models
- `GET /model-packs` - Get pre-defined model packs

**Environment Variables:**
```bash
ML_SERVICE_PORT=8086
MODEL_DIR=/app/models
CACHE_DIR=/app/cache
DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/farmer_data
```

**Tech Stack:**
- FastAPI
- TensorFlow 2.18
- PyTorch 2.5
- ONNX Runtime 1.20
- OpenCV 4.10
- NumPy, Pandas, scikit-learn

### Go Model Serving (Port 8087)

**Responsibilities:**
- Fast model serving (< 100ms inference)
- Model caching (LRU eviction)
- Batch inference optimization
- Device capability detection
- Model quantization (INT8, FP16)
- Prometheus metrics

**Endpoints:**
- `GET /health` - Health check
- `GET /models` - List loaded models
- `POST /models/load` - Load model into cache
- `POST /inference` - Fast inference
- `POST /inference/batch` - Batch inference
- `GET /device/capability` - Detect device capabilities
- `POST /optimize` - Optimize model for edge
- `GET /metrics` - Prometheus metrics

**Environment Variables:**
```bash
MODEL_SERVING_PORT=8087
MODEL_CACHE_SIZE=5
MAX_BATCH_SIZE=32
```

**Tech Stack:**
- Go 1.21
- Gorilla Mux (HTTP router)
- Prometheus client

## 🔧 Development

### Python ML Service

```bash
cd services/ml-service

# Install dependencies
pip install -r requirements.txt

# Run locally
python main.py

# Run tests
pytest tests/
```

### Go Model Serving

```bash
cd services/model-serving

# Install dependencies
go mod download

# Run locally
go run main.go

# Build binary
go build -o model-serving

# Run tests
go test ./...
```

## 📊 Monitoring

### Health Checks

```bash
# Python ML Service
curl http://localhost:8086/health

# Go Model Serving
curl http://localhost:8087/health
```

### Prometheus Metrics

```bash
# Go Model Serving metrics
curl http://localhost:8087/metrics
```

### Logs

```bash
# View all logs
docker-compose -f docker-compose-ml.yml logs -f

# View specific service
docker-compose -f docker-compose-ml.yml logs -f ml-service
docker-compose -f docker-compose-ml.yml logs -f model-serving
```

## 🐛 Troubleshooting

### Service Won't Start

1. Check if ports are available:
```bash
lsof -i :8086  # Python ML Service
lsof -i :8087  # Go Model Serving
```

2. Check Docker logs:
```bash
docker-compose -f docker-compose-ml.yml logs ml-service
docker-compose -f docker-compose-ml.yml logs model-serving
```

3. Verify network exists:
```bash
docker network ls | grep farmer-network
docker network create farmer-network  # If missing
```

### Database Connection Issues

1. Ensure PostgreSQL is running and accessible
2. Check DATABASE_URL in docker-compose-ml.yml
3. Use `host.docker.internal` to access host machine from Docker

### Model Loading Errors

1. Check if models directory exists:
```bash
mkdir -p services/ml-service/models
mkdir -p services/ml-service/cache
```

2. Verify model files are present and have correct permissions
3. Check available disk space

### Performance Issues

1. Check available RAM:
```bash
docker stats
```

2. Reduce MODEL_CACHE_SIZE if memory is limited
3. Use quantized models instead of full models
4. Reduce MAX_BATCH_SIZE for batch inference

## 🔐 Security

### Production Deployment

1. **Change default secrets:**
```bash
# Generate secure DATABASE_URL
export DATABASE_URL="postgresql://user:password@host:5432/dbname"
```

2. **Enable HTTPS:**
- Use reverse proxy (nginx, Caddy)
- Configure SSL certificates
- Update CORS settings

3. **Restrict network access:**
- Use Docker networks
- Configure firewall rules
- Implement API authentication

4. **Resource limits:**
```yaml
services:
  ml-service:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G
```

## 📈 Scaling

### Horizontal Scaling

```yaml
services:
  ml-service:
    deploy:
      replicas: 3
    ports:
      - "8086-8088:8086"
```

### Load Balancing

Use nginx or HAProxy to distribute requests:

```nginx
upstream ml_service {
    server localhost:8086;
    server localhost:8087;
    server localhost:8088;
}

server {
    listen 80;
    location /ml/ {
        proxy_pass http://ml_service/;
    }
}
```

## 🧪 Testing

### Integration Tests

```bash
# Test Python ML Service
curl -X POST http://localhost:8086/inference \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "maize_disease_v1",
    "image_data": "base64_encoded_image",
    "crop_type": "maize"
  }'

# Test Go Model Serving
curl -X POST http://localhost:8087/inference \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "maize_disease_v1",
    "image_data": "base64_encoded_image"
  }'
```

### Load Testing

```bash
# Install Apache Bench
sudo apt-get install apache2-utils

# Run load test
ab -n 1000 -c 10 http://localhost:8086/health
```

## 📚 Additional Resources

- [AI/ML System Documentation](../docs/AI_ML_SYSTEM.md)
- [Python ML Service API Docs](http://localhost:8086/docs) (when running)
- [Model Packs Guide](../docs/MODEL_PACKS.md)
- [Benchmarking Guide](../docs/BENCHMARKING.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - See LICENSE file for details
