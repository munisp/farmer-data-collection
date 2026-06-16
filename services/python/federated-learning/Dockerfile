FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8065

HEALTHCHECK --interval=30s --timeout=10s --retries=3   CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8065/health')" || exit 1

CMD ["python", "app/main.py"]
