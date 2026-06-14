FROM python:3.11-slim-bookworm

WORKDIR /app

# Install PostGIS client libraries
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libpq-dev gcc curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# For full Sedona support, install PySpark + Sedona (optional, large image)
# RUN pip install pyspark==3.5.0 apache-sedona==1.5.1

EXPOSE 8098
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8098/health || exit 1

CMD ["python", "main.py"]
