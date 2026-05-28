"""Smoke tests for Keycloak Mock Service."""
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200


def test_token_endpoint():
    response = client.post("/realms/farmconnect/protocol/openid-connect/token", data={
        "grant_type": "password",
        "client_id": "farmconnect-app",
        "username": "test@example.com",
        "password": "test123"
    })
    assert response.status_code in (200, 401)
    if response.status_code == 200:
        data = response.json()
        assert "access_token" in data


def test_userinfo():
    response = client.get("/realms/farmconnect/protocol/openid-connect/userinfo",
                         headers={"Authorization": "Bearer test-token"})
    assert response.status_code in (200, 401)


def test_jwks():
    response = client.get("/realms/farmconnect/protocol/openid-connect/certs")
    assert response.status_code == 200
    data = response.json()
    assert "keys" in data
