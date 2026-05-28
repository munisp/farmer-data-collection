"""Smoke tests for Kafka Mock Service."""
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200


def test_produce_message():
    response = client.post("/api/produce", json={
        "topic": "farmer-events",
        "key": "farmer-1",
        "value": {"event": "farmer_created", "farmer_id": 1}
    })
    assert response.status_code in (200, 201, 202)


def test_list_topics():
    response = client.get("/api/topics")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, (list, dict))
