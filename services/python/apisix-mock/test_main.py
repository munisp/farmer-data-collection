"""Smoke tests for APISIX Mock Service."""
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200


def test_list_routes():
    response = client.get("/apisix/admin/routes")
    assert response.status_code == 200


def test_create_route():
    response = client.put("/apisix/admin/routes/test-route", json={
        "uri": "/api/test",
        "upstream": {
            "type": "roundrobin",
            "nodes": {"localhost:3001": 1}
        }
    })
    assert response.status_code in (200, 201)
