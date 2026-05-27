#!/usr/bin/env python3
"""
ML Service Integration Tests

Tests for crop yield prediction and price forecasting endpoints
"""

import unittest
import requests
import json
from datetime import datetime

ML_SERVICE_URL = "http://localhost:8000"

class TestMLService(unittest.TestCase):
    """Test cases for ML service"""

    def setUp(self):
        """Set up test fixtures"""
        self.base_url = ML_SERVICE_URL

    def test_health_check(self):
        """Test ML service health endpoint"""
        response = requests.get(f"{self.base_url}/health")
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertTrue("models" in data)

    def test_crop_yield_prediction_maize(self):
        """Test crop yield prediction for maize"""
        payload = {
            "crop": "maize",
            "farmSize": 2.5,
            "soilType": "loamy",
            "rainfall": 1000,
            "temperature": 25,
            "fertilizer": "npk",
            "season": "wet"
        }
        
        response = requests.post(
            f"{self.base_url}/predict/yield",
            json=payload
        )
        
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertTrue(data["success"])
        self.assertGreater(data["predictedYield"], 0)
        self.assertEqual(data["unit"], "tons")
        self.assertGreaterEqual(data["confidence"], 0)
        self.assertLessEqual(data["confidence"], 1)
        self.assertTrue("factors" in data)
        self.assertTrue("recommendation" in data)

    def test_crop_yield_prediction_rice(self):
        """Test crop yield prediction for rice"""
        payload = {
            "crop": "rice",
            "farmSize": 3.0,
            "soilType": "clay",
            "rainfall": 1200,
            "temperature": 28,
            "fertilizer": "organic",
            "season": "wet"
        }
        
        response = requests.post(
            f"{self.base_url}/predict/yield",
            json=payload
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertGreater(data["predictedYield"], 0)

    def test_crop_yield_prediction_invalid_data(self):
        """Test crop yield prediction with invalid data"""
        payload = {
            "crop": "maize",
            "farmSize": -1,  # Invalid: negative farm size
            "soilType": "loamy",
            "rainfall": 1000,
            "temperature": 25,
            "fertilizer": "npk",
            "season": "wet"
        }
        
        response = requests.post(
            f"{self.base_url}/predict/yield",
            json=payload
        )
        
        # Should return 422 for validation error
        self.assertEqual(response.status_code, 422)

    def test_price_forecast_maize(self):
        """Test price forecasting for maize"""
        payload = {
            "crop": "maize",
            "location": "Lagos",
            "forecastDays": 7
        }
        
        response = requests.post(
            f"{self.base_url}/predict/price",
            json=payload
        )
        
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertTrue(data["success"])
        self.assertTrue("forecast" in data)
        self.assertEqual(len(data["forecast"]), 7)
        self.assertTrue("trend" in data)
        self.assertIn(data["trend"], ["increasing", "decreasing", "stable"])
        self.assertTrue("recommendation" in data)
        
        # Check forecast structure
        for point in data["forecast"]:
            self.assertTrue("date" in point)
            self.assertTrue("price" in point)
            self.assertGreater(point["price"], 0)

    def test_price_forecast_with_historical_data(self):
        """Test price forecasting with historical prices"""
        payload = {
            "crop": "tomato",
            "location": "Abuja",
            "forecastDays": 14,
            "historicalPrices": [
                {"date": "2025-11-20", "price": 280},
                {"date": "2025-11-21", "price": 285},
                {"date": "2025-11-22", "price": 290},
            ]
        }
        
        response = requests.post(
            f"{self.base_url}/predict/price",
            json=payload
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(len(data["forecast"]), 14)

    def test_price_forecast_long_term(self):
        """Test long-term price forecasting (30 days)"""
        payload = {
            "crop": "rice",
            "location": "Kano",
            "forecastDays": 30
        }
        
        response = requests.post(
            f"{self.base_url}/predict/price",
            json=payload
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(len(data["forecast"]), 30)

    def test_multiple_crops_yield(self):
        """Test yield prediction for multiple crops"""
        crops = ["maize", "rice", "wheat", "cassava", "beans"]
        
        for crop in crops:
            payload = {
                "crop": crop,
                "farmSize": 2.0,
                "soilType": "loamy",
                "rainfall": 1000,
                "temperature": 25,
                "fertilizer": "npk",
                "season": "wet"
            }
            
            response = requests.post(
                f"{self.base_url}/predict/yield",
                json=payload
            )
            
            self.assertEqual(response.status_code, 200, f"Failed for crop: {crop}")
            data = response.json()
            self.assertTrue(data["success"], f"Failed for crop: {crop}")
            self.assertGreater(data["predictedYield"], 0, f"Invalid yield for crop: {crop}")

    def test_soil_type_impact(self):
        """Test impact of different soil types on yield"""
        soil_types = ["loamy", "clay", "sandy", "silt"]
        yields = []
        
        for soil in soil_types:
            payload = {
                "crop": "maize",
                "farmSize": 2.0,
                "soilType": soil,
                "rainfall": 1000,
                "temperature": 25,
                "fertilizer": "npk",
                "season": "wet"
            }
            
            response = requests.post(
                f"{self.base_url}/predict/yield",
                json=payload
            )
            
            data = response.json()
            yields.append((soil, data["predictedYield"]))
        
        # Loamy soil should generally give better yields
        loamy_yield = next(y for s, y in yields if s == "loamy")
        sandy_yield = next(y for s, y in yields if s == "sandy")
        self.assertGreater(loamy_yield, sandy_yield, 
                          "Loamy soil should yield more than sandy soil")

    def test_fertilizer_impact(self):
        """Test impact of different fertilizers on yield"""
        fertilizers = ["npk", "organic", "urea", "none"]
        yields = []
        
        for fert in fertilizers:
            payload = {
                "crop": "maize",
                "farmSize": 2.0,
                "soilType": "loamy",
                "rainfall": 1000,
                "temperature": 25,
                "fertilizer": fert,
                "season": "wet"
            }
            
            response = requests.post(
                f"{self.base_url}/predict/yield",
                json=payload
            )
            
            data = response.json()
            yields.append((fert, data["predictedYield"]))
        
        # NPK should give better yields than no fertilizer
        npk_yield = next(y for f, y in yields if f == "npk")
        no_fert_yield = next(y for f, y in yields if f == "none")
        self.assertGreater(npk_yield, no_fert_yield,
                          "NPK fertilizer should yield more than no fertilizer")

    def test_concurrent_requests(self):
        """Test handling of concurrent requests"""
        import concurrent.futures
        
        def make_request():
            payload = {
                "crop": "maize",
                "farmSize": 2.0,
                "soilType": "loamy",
                "rainfall": 1000,
                "temperature": 25,
                "fertilizer": "npk",
                "season": "wet"
            }
            response = requests.post(f"{self.base_url}/predict/yield", json=payload)
            return response.status_code == 200
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(make_request) for _ in range(10)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]
        
        # All requests should succeed
        self.assertTrue(all(results), "Some concurrent requests failed")

def run_tests():
    """Run all tests"""
    print("=" * 60)
    print("ML Service Integration Tests")
    print("=" * 60)
    print()
    
    # Check if ML service is available
    try:
        response = requests.get(f"{ML_SERVICE_URL}/health", timeout=5)
        if response.status_code != 200:
            print("❌ ML service is not available")
            print(f"   Please ensure the service is running on {ML_SERVICE_URL}")
            return False
    except requests.exceptions.RequestException as e:
        print("❌ Cannot connect to ML service")
        print(f"   Error: {e}")
        print(f"   Please ensure the service is running on {ML_SERVICE_URL}")
        return False
    
    print(f"✅ ML service is available at {ML_SERVICE_URL}")
    print()
    
    # Run tests
    suite = unittest.TestLoader().loadTestsFromTestCase(TestMLService)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print()
    print("=" * 60)
    print("Test Summary")
    print("=" * 60)
    print(f"Tests run: {result.testsRun}")
    print(f"Successes: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print()
    
    return result.wasSuccessful()

if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)
