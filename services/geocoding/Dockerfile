FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY . .
RUN pip install --no-cache-dir flask geopy requests || true
EXPOSE 8100
CMD ["python", "main.py"]
