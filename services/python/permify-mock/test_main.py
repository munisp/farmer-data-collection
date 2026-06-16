"""Smoke tests for Permify Mock Service."""
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200


def test_check_permission():
    response = client.post("/v1/tenants/farmconnect/permissions/check", json={
        "entity": {"type": "farmer", "id": "1"},
        "permission": "view",
        "subject": {"type": "user", "id": "1"}
    })
    assert response.status_code in (200, 403)


def test_write_relationship():
    response = client.post("/v1/tenants/farmconnect/relationships/write", json={
        "tuples": [{
            "entity": {"type": "farmer", "id": "1"},
            "relation": "owner",
            "subject": {"type": "user", "id": "1"}
        }]
    })
    assert response.status_code in (200, 201)
