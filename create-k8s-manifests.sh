#!/bin/bash

# Create Orchestrator Deployment
cat > k8s/orchestrator-deployment.yaml << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orchestrator
  labels:
    app: orchestrator
spec:
  replicas: 3
  selector:
    matchLabels:
      app: orchestrator
  template:
    metadata:
      labels:
        app: orchestrator
    spec:
      containers:
      - name: orchestrator
        image: farmer-data-collection/orchestrator:latest
        ports:
        - containerPort: 8089
        env:
        - name: TEMPORAL_HOST
          value: "temporal:7233"
        - name: KAFKA_BROKERS
          value: "kafka:9092"
        - name: REDIS_HOST
          value: "redis:6379"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8089
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8089
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: orchestrator
spec:
  selector:
    app: orchestrator
  ports:
  - protocol: TCP
    port: 8089
    targetPort: 8089
  type: ClusterIP
EOF

# Create Feature Services Deployment
cat > k8s/feature-services-deployment.yaml << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: iot-service
spec:
  replicas: 2
  selector:
    matchLabels:
      app: iot-service
  template:
    metadata:
      labels:
        app: iot-service
    spec:
      containers:
      - name: iot-service
        image: farmer-data-collection/iot-service:latest
        ports:
        - containerPort: 8090
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: satellite-service
spec:
  replicas: 2
  selector:
    matchLabels:
      app: satellite-service
  template:
    metadata:
      labels:
        app: satellite-service
    spec:
      containers:
      - name: satellite-service
        image: farmer-data-collection/satellite-service:latest
        ports:
        - containerPort: 8091
EOF

# Create ConfigMap
cat > k8s/configmap.yaml << 'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: orchestrator-config
data:
  TEMPORAL_HOST: "temporal:7233"
  KAFKA_BROKERS: "kafka:9092"
  REDIS_HOST: "redis:6379"
  POSTGRES_HOST: "postgresql:5432"
  POSTGRES_DB: "farmer_data"
EOF

echo "Kubernetes manifests created successfully!"
