"""Enhanced Credit Scoring Service — Python ML
Uses farm boundary data (acreage), harvest history, repayment records,
geospatial features, and cooperative membership for credit assessment.
"""
import json
import math
import os
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Any

PORT = int(os.environ.get("CREDIT_SCORING_PORT", "8108"))


class CreditModel:
    """Multi-factor credit scoring model for Nigerian smallholder farmers."""

    # Factor weights (sum to 1.0)
    WEIGHTS = {
        "farm_size": 0.12,
        "farm_boundary_verified": 0.08,
        "crop_diversity": 0.08,
        "harvest_history": 0.15,
        "repayment_history": 0.25,
        "cooperative_membership": 0.07,
        "time_farming": 0.05,
        "market_access": 0.05,
        "technology_adoption": 0.05,
        "soil_quality": 0.05,
        "weather_resilience": 0.05,
    }

    GRADE_THRESHOLDS = {
        "A+": 90, "A": 80, "B+": 70, "B": 60,
        "C+": 50, "C": 40, "D": 30, "F": 0,
    }

    def score(self, data: dict[str, Any]) -> dict[str, Any]:
        factors = {}

        # Farm size score (0-100) — larger = more collateral
        farm_hectares = data.get("farm_hectares", 0)
        factors["farm_size"] = min(100, farm_hectares * 10) if farm_hectares > 0 else 0

        # Verified boundary (PostGIS polygon exists)
        factors["farm_boundary_verified"] = 100 if data.get("has_boundary") else 0

        # Crop diversity (more crops = less risk)
        crop_count = data.get("crop_count", 1)
        factors["crop_diversity"] = min(100, crop_count * 25)

        # Harvest history (consistent yields over years)
        harvests = data.get("harvest_count", 0)
        avg_yield_ratio = data.get("avg_yield_ratio", 0.5)  # actual/expected
        factors["harvest_history"] = min(100, harvests * 10) * avg_yield_ratio

        # Repayment history (most important factor)
        total_loans = data.get("total_loans", 0)
        repaid_ontime = data.get("repaid_ontime", 0)
        defaults = data.get("defaults", 0)
        if total_loans > 0:
            repay_rate = repaid_ontime / total_loans
            default_penalty = defaults * 20
            factors["repayment_history"] = max(0, min(100, repay_rate * 100 - default_penalty))
        else:
            factors["repayment_history"] = 50  # No history = neutral

        # Cooperative membership
        factors["cooperative_membership"] = 100 if data.get("in_cooperative") else 30

        # Years farming
        years = data.get("years_farming", 0)
        factors["time_farming"] = min(100, years * 10)

        # Market access (distance to nearest market, has marketplace listings)
        has_listings = data.get("has_marketplace_listings", False)
        market_distance_km = data.get("market_distance_km", 50)
        market_score = 100 if has_listings else max(0, 100 - market_distance_km * 2)
        factors["market_access"] = market_score

        # Technology adoption (uses app, GPS, IoT)
        tech_features = sum([
            data.get("uses_mobile_app", False),
            data.get("uses_gps_tracking", False),
            data.get("uses_iot_sensors", False),
            data.get("uses_weather_alerts", False),
            data.get("has_satellite_imagery", False),
        ])
        factors["technology_adoption"] = min(100, tech_features * 20)

        # Soil quality
        soil_score = data.get("soil_quality_score", 50)
        factors["soil_quality"] = min(100, max(0, soil_score))

        # Weather resilience (irrigation, drainage, crop insurance)
        resilience = sum([
            data.get("has_irrigation", False),
            data.get("has_drainage", False),
            data.get("has_crop_insurance", False),
            data.get("uses_drought_resistant", False),
        ])
        factors["weather_resilience"] = min(100, resilience * 25)

        # Calculate weighted score
        total_score = sum(
            factors[k] * self.WEIGHTS[k]
            for k in self.WEIGHTS
            if k in factors
        )

        # Determine grade
        grade = "F"
        for g, threshold in sorted(self.GRADE_THRESHOLDS.items(), key=lambda x: -x[1]):
            if total_score >= threshold:
                grade = g
                break

        # Calculate loan recommendation
        max_loan_ngn = self._calculate_max_loan(total_score, farm_hectares, data)

        return {
            "score": round(total_score, 2),
            "grade": grade,
            "factors": {k: round(v, 2) for k, v in factors.items()},
            "weights": self.WEIGHTS,
            "max_loan_amount": max_loan_ngn,
            "currency": "NGN",
            "risk_level": self._risk_level(total_score),
            "recommendations": self._recommendations(factors),
            "calculated_at": datetime.now(timezone.utc).isoformat(),
        }

    def _calculate_max_loan(self, score: float, hectares: float, data: dict) -> float:
        """Calculate maximum recommended loan amount in NGN."""
        # Base: ₦100,000 per hectare
        base = hectares * 100_000
        # Score multiplier: 0.5x to 2.5x
        multiplier = 0.5 + (score / 100) * 2.0
        # Cooperative bonus: +20%
        if data.get("in_cooperative"):
            multiplier *= 1.2
        # Verified boundary bonus: +15%
        if data.get("has_boundary"):
            multiplier *= 1.15
        return round(base * multiplier, -3)  # Round to nearest thousand

    def _risk_level(self, score: float) -> str:
        if score >= 75:
            return "low"
        if score >= 50:
            return "medium"
        if score >= 30:
            return "high"
        return "very_high"

    def _recommendations(self, factors: dict[str, float]) -> list[str]:
        recs = []
        if factors.get("farm_boundary_verified", 0) < 50:
            recs.append("Verify farm boundaries using GPS geotagging to improve score by up to 8%")
        if factors.get("cooperative_membership", 0) < 50:
            recs.append("Join a registered cooperative to improve creditworthiness by 7%")
        if factors.get("crop_diversity", 0) < 50:
            recs.append("Diversify crops to reduce risk — plant at least 3 different crops")
        if factors.get("technology_adoption", 0) < 40:
            recs.append("Use FarmConnect GPS tracking and weather alerts to boost tech adoption score")
        if factors.get("repayment_history", 0) < 60:
            recs.append("Maintain consistent loan repayments — this is the highest-weighted factor (25%)")
        if factors.get("weather_resilience", 0) < 50:
            recs.append("Consider irrigation or drought-resistant crop varieties to improve resilience")
        return recs


model = CreditModel()
scoring_history: list[dict[str, Any]] = []


class CreditHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self._json_response({
                "status": "ok",
                "service": "credit-scoring",
                "model_version": "2.0",
                "factors": len(CreditModel.WEIGHTS),
                "scores_calculated": len(scoring_history),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        elif self.path == "/model/factors":
            self._json_response({
                "weights": CreditModel.WEIGHTS,
                "grades": CreditModel.GRADE_THRESHOLDS,
                "crop_list": list(CROP_RISK_FACTORS.keys()) if hasattr(globals(), 'CROP_RISK_FACTORS') else [],
            })
        elif self.path == "/scores/history":
            self._json_response(scoring_history[-50:])
        else:
            self._json_response({"error": "Not found"}, 404)

    def do_POST(self):
        body = self._read_body()

        if self.path == "/score":
            result = model.score(body)
            scoring_history.append({
                "farmer_id": body.get("farmer_id", "unknown"),
                "score": result["score"],
                "grade": result["grade"],
                "timestamp": result["calculated_at"],
            })
            self._json_response(result)

        elif self.path == "/score/batch":
            farmers = body.get("farmers", [])
            results = []
            for farmer in farmers:
                result = model.score(farmer)
                results.append({
                    "farmer_id": farmer.get("farmer_id", "unknown"),
                    **result,
                })
            self._json_response({"results": results, "count": len(results)})

        else:
            self._json_response({"error": "Not found"}, 404)

    def _json_response(self, data: Any, status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, default=str).encode())

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length))

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    print(f"Credit Scoring service starting on :{PORT}")
    server = HTTPServer(("0.0.0.0", PORT), CreditHandler)
    server.serve_forever()
