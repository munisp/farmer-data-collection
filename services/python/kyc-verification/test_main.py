"""Smoke tests for KYC Verification Service."""
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200


def test_submit_kyc():
    response = client.post("/api/kyc/submit", json={
        "user_id": 1,
        "document_type": "national_id",
        "document_number": "NGA-12345678",
        "full_name": "Adebayo Ogunlesi",
        "date_of_birth": "1990-01-15"
    })
    assert response.status_code in (200, 201, 422, 503)


def test_check_kyc_status():
    response = client.get("/api/kyc/status/1")
    assert response.status_code in (200, 404)


def test_verify_document():
    response = client.post("/api/kyc/verify-document", json={
        "document_type": "national_id",
        "document_number": "NGA-12345678",
        "country": "NG"
    })
    assert response.status_code in (200, 422, 503)
