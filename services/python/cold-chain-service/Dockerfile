FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt* ./
RUN [ -f requirements.txt ] && pip install --no-cache-dir -r requirements.txt || true

COPY . .

EXPOSE 8061

HEALTHCHECK --interval=30s --timeout=10s --retries=3   CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8061/health')" || exit 1

CMD ["python", "main.py"]
