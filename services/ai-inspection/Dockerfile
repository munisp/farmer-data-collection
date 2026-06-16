FROM python:3.11-slim

WORKDIR /app

# System dependencies for PaddleOCR, OpenCV, and image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libgomp1 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1
ENV AI_INSPECTION_PORT=8110
ENV OLLAMA_URL=http://host.docker.internal:11434
ENV OLLAMA_MODEL=qwen2.5:7b
ENV VLM_MODEL=qwen2-vl:7b
ENV YOLO_MODEL_PATH=models/yolov8_nigerian_produce.pt
ENV SAM2_MODEL_PATH=models/sam2_hiera_base_plus.pt
ENV DINOV2_CLASSIFIER_PATH=models/dinov2_grade_classifier.pt

EXPOSE 8110

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import httpx; r = httpx.get('http://localhost:8110/health'); exit(0 if r.status_code == 200 else 1)"

CMD ["python", "server.py"]
