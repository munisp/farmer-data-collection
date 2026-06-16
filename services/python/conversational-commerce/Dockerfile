FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8121
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -f http://localhost:8121/health || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8121"]
