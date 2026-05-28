"""Smoke tests for OpenSearch Service."""
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200


def test_search():
    response = client.post("/api/search", json={
        "query": "cassava",
        "index": "produce",
        "limit": 10
    })
    assert response.status_code in (200, 503)


def test_index_document():
    response = client.post("/api/index", json={
        "index": "produce",
        "document": {
            "name": "Cassava",
            "category": "tubers",
            "price": 15000
        }
    })
    assert response.status_code in (200, 201, 503)
