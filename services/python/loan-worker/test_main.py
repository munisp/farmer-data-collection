"""Smoke tests for Loan Worker Service."""
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200


def test_process_loan():
    response = client.post("/api/loans/process", json={
        "loan_id": "LOAN-001",
        "farmer_id": 1,
        "amount": 50000,
        "currency": "NGN",
        "term_months": 6
    })
    assert response.status_code in (200, 202, 503)


def test_calculate_repayment():
    response = client.post("/api/loans/calculate-repayment", json={
        "principal": 50000,
        "annual_rate": 15.0,
        "term_months": 12
    })
    assert response.status_code in (200, 503)
    if response.status_code == 200:
        data = response.json()
        assert "monthly_payment" in data or "repayment" in data
