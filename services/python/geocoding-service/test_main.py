"""Smoke tests for Geocoding Service."""
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("healthy", "ok")


def test_geocode_address():
    response = client.post("/api/geocode", json={
        "address": "Lagos, Nigeria"
    })
    assert response.status_code in (200, 503)
    if response.status_code == 200:
        data = response.json()
        assert "latitude" in data or "lat" in data


def test_reverse_geocode():
    response = client.post("/api/reverse-geocode", json={
        "latitude": 6.5244,
        "longitude": 3.3792
    })
    assert response.status_code in (200, 503)


def test_batch_geocode():
    response = client.post("/api/geocode/batch", json={
        "addresses": ["Lagos, Nigeria", "Ibadan, Nigeria"]
    })
    assert response.status_code in (200, 503)
