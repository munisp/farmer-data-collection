"""Weather Alerts Service — Python + Kafka
Monitors OpenWeatherMap for severe weather in farm GPS zones,
sends proactive SMS/WhatsApp alerts to farmers.
"""
import json
import os
import time
import hashlib
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.request import urlopen, Request
from urllib.error import URLError
from typing import Any

PORT = int(os.environ.get("WEATHER_SERVICE_PORT", "8107"))
OPENWEATHER_API_KEY = os.environ.get("OPENWEATHER_API_KEY", "")
KAFKA_BROKERS = os.environ.get("KAFKA_BROKERS", "localhost:9093")
WHATSAPP_SERVICE_URL = os.environ.get("WHATSAPP_SERVICE_URL", "http://localhost:8102")

# Nigerian states with default coordinates
NIGERIAN_REGIONS = {
    "Oyo": {"lat": 7.85, "lon": 3.93},
    "Lagos": {"lat": 6.52, "lon": 3.38},
    "Kano": {"lat": 12.00, "lon": 8.52},
    "Enugu": {"lat": 6.44, "lon": 7.50},
    "Anambra": {"lat": 6.21, "lon": 7.07},
    "Ondo": {"lat": 7.10, "lon": 4.84},
    "Benue": {"lat": 7.73, "lon": 8.52},
    "Kaduna": {"lat": 10.52, "lon": 7.43},
    "Kebbi": {"lat": 12.45, "lon": 4.20},
    "Sokoto": {"lat": 13.06, "lon": 5.24},
    "Imo": {"lat": 5.49, "lon": 7.03},
    "Kwara": {"lat": 8.49, "lon": 4.55},
    "Niger": {"lat": 9.60, "lon": 5.65},
    "Plateau": {"lat": 9.22, "lon": 9.52},
    "Osun": {"lat": 7.56, "lon": 4.52},
}

# Crop-specific weather thresholds
CROP_THRESHOLDS = {
    "cassava": {"min_temp": 18, "max_temp": 35, "max_wind": 50, "drought_days": 14},
    "rice": {"min_temp": 20, "max_temp": 38, "max_wind": 40, "drought_days": 7},
    "yam": {"min_temp": 20, "max_temp": 35, "max_wind": 45, "drought_days": 10},
    "cocoa": {"min_temp": 18, "max_temp": 32, "max_wind": 35, "drought_days": 7},
    "maize": {"min_temp": 15, "max_temp": 35, "max_wind": 45, "drought_days": 10},
    "groundnut": {"min_temp": 20, "max_temp": 38, "max_wind": 50, "drought_days": 14},
    "oil_palm": {"min_temp": 22, "max_temp": 33, "max_wind": 40, "drought_days": 7},
    "plantain": {"min_temp": 20, "max_temp": 35, "max_wind": 30, "drought_days": 7},
    "tomato": {"min_temp": 15, "max_temp": 35, "max_wind": 35, "drought_days": 5},
    "pepper": {"min_temp": 18, "max_temp": 35, "max_wind": 35, "drought_days": 5},
}

alert_history: list[dict[str, Any]] = []
subscriptions: list[dict[str, Any]] = []


def fetch_weather(lat: float, lon: float) -> dict[str, Any] | None:
    """Fetch current weather from OpenWeatherMap API."""
    if not OPENWEATHER_API_KEY:
        # Return simulated weather for demo
        return {
            "main": {"temp": 28.5, "humidity": 72, "pressure": 1013},
            "wind": {"speed": 12.3, "deg": 180},
            "weather": [{"main": "Clouds", "description": "scattered clouds"}],
            "rain": {},
            "name": "Simulated",
            "coord": {"lat": lat, "lon": lon},
        }

    try:
        url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}&units=metric"
        req = Request(url, headers={"User-Agent": "FarmConnect/1.0"})
        with urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except (URLError, json.JSONDecodeError) as e:
        print(f"Weather API error: {e}")
        return None


def fetch_forecast(lat: float, lon: float) -> dict[str, Any] | None:
    """Fetch 5-day forecast."""
    if not OPENWEATHER_API_KEY:
        return {"list": [], "simulated": True}
    try:
        url = f"https://api.openweathermap.org/data/2.5/forecast?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}&units=metric"
        req = Request(url, headers={"User-Agent": "FarmConnect/1.0"})
        with urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except (URLError, json.JSONDecodeError):
        return None


def analyze_weather_risks(weather: dict, crop: str = "cassava") -> list[dict[str, Any]]:
    """Analyze weather data against crop thresholds and return alerts."""
    alerts = []
    thresholds = CROP_THRESHOLDS.get(crop, CROP_THRESHOLDS["cassava"])

    temp = weather.get("main", {}).get("temp", 25)
    wind_speed = weather.get("wind", {}).get("speed", 0) * 3.6  # m/s to km/h
    humidity = weather.get("main", {}).get("humidity", 50)
    rain = weather.get("rain", {}).get("1h", 0) or weather.get("rain", {}).get("3h", 0)

    conditions = weather.get("weather", [{}])
    main_condition = conditions[0].get("main", "") if conditions else ""

    if temp > thresholds["max_temp"]:
        alerts.append({
            "type": "heat_stress",
            "severity": "high" if temp > thresholds["max_temp"] + 5 else "medium",
            "message": f"Temperature {temp:.1f}°C exceeds {crop} maximum ({thresholds['max_temp']}°C). Consider irrigation and shade.",
            "value": temp,
            "threshold": thresholds["max_temp"],
        })

    if temp < thresholds["min_temp"]:
        alerts.append({
            "type": "cold_stress",
            "severity": "high" if temp < thresholds["min_temp"] - 5 else "medium",
            "message": f"Temperature {temp:.1f}°C below {crop} minimum ({thresholds['min_temp']}°C). Protect crops from frost.",
            "value": temp,
            "threshold": thresholds["min_temp"],
        })

    if wind_speed > thresholds["max_wind"]:
        alerts.append({
            "type": "wind_damage",
            "severity": "critical" if wind_speed > thresholds["max_wind"] * 1.5 else "high",
            "message": f"Wind speed {wind_speed:.0f} km/h exceeds safe limit ({thresholds['max_wind']} km/h) for {crop}. Secure structures.",
            "value": wind_speed,
            "threshold": thresholds["max_wind"],
        })

    if rain > 50:
        alerts.append({
            "type": "flooding_risk",
            "severity": "critical" if rain > 100 else "high",
            "message": f"Heavy rainfall ({rain:.0f}mm). Risk of flooding and waterlogging for {crop}.",
            "value": rain,
        })

    if humidity > 90 and temp > 25:
        alerts.append({
            "type": "disease_risk",
            "severity": "medium",
            "message": f"High humidity ({humidity}%) + warm temperatures increase fungal disease risk for {crop}.",
            "value": humidity,
        })

    if main_condition in ("Thunderstorm",):
        alerts.append({
            "type": "thunderstorm",
            "severity": "high",
            "message": f"Thunderstorm detected. Seek shelter and secure livestock.",
        })

    return alerts


class WeatherHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self._json_response({
                "status": "ok",
                "service": "weather-alerts",
                "api_configured": bool(OPENWEATHER_API_KEY),
                "subscriptions": len(subscriptions),
                "alerts_sent": len(alert_history),
                "regions": len(NIGERIAN_REGIONS),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        elif self.path.startswith("/weather/current"):
            params = self._parse_query()
            lat = float(params.get("lat", "7.85"))
            lon = float(params.get("lon", "3.93"))
            weather = fetch_weather(lat, lon)
            if weather:
                self._json_response(weather)
            else:
                self._json_response({"error": "Failed to fetch weather"}, 500)

        elif self.path.startswith("/weather/forecast"):
            params = self._parse_query()
            lat = float(params.get("lat", "7.85"))
            lon = float(params.get("lon", "3.93"))
            forecast = fetch_forecast(lat, lon)
            if forecast:
                self._json_response(forecast)
            else:
                self._json_response({"error": "Failed to fetch forecast"}, 500)

        elif self.path.startswith("/weather/alerts"):
            params = self._parse_query()
            region = params.get("region", "Oyo")
            crop = params.get("crop", "cassava")
            coords = NIGERIAN_REGIONS.get(region, {"lat": 7.85, "lon": 3.93})
            weather = fetch_weather(coords["lat"], coords["lon"])
            if weather:
                alerts = analyze_weather_risks(weather, crop)
                self._json_response({
                    "region": region,
                    "crop": crop,
                    "weather": weather,
                    "alerts": alerts,
                    "alert_count": len(alerts),
                })
            else:
                self._json_response({"error": "Weather fetch failed"}, 500)

        elif self.path == "/weather/regions":
            self._json_response(NIGERIAN_REGIONS)

        elif self.path == "/weather/thresholds":
            self._json_response(CROP_THRESHOLDS)

        elif self.path == "/weather/history":
            self._json_response(alert_history[-100:])

        else:
            self._json_response({"error": "Not found"}, 404)

    def do_POST(self):
        body = self._read_body()

        if self.path == "/weather/subscribe":
            subscriptions.append({
                **body,
                "id": hashlib.md5(json.dumps(body).encode()).hexdigest()[:12],
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            self._json_response({"status": "subscribed", "id": subscriptions[-1]["id"]})

        elif self.path == "/weather/scan":
            # Scan all regions and generate alerts
            all_alerts = []
            for region, coords in NIGERIAN_REGIONS.items():
                weather = fetch_weather(coords["lat"], coords["lon"])
                if weather:
                    crop = body.get("crop", "cassava")
                    alerts = analyze_weather_risks(weather, crop)
                    if alerts:
                        record = {
                            "region": region,
                            "crop": crop,
                            "alerts": alerts,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }
                        all_alerts.append(record)
                        alert_history.append(record)

            self._json_response({
                "regions_scanned": len(NIGERIAN_REGIONS),
                "alerts_generated": len(all_alerts),
                "alerts": all_alerts,
            })

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

    def _parse_query(self) -> dict[str, str]:
        if "?" not in self.path:
            return {}
        query = self.path.split("?", 1)[1]
        params = {}
        for pair in query.split("&"):
            if "=" in pair:
                k, v = pair.split("=", 1)
                params[k] = v
        return params

    def log_message(self, format, *args):
        pass  # Suppress default logging


if __name__ == "__main__":
    print(f"Weather Alerts service starting on :{PORT} (API configured: {bool(OPENWEATHER_API_KEY)})")
    server = HTTPServer(("0.0.0.0", PORT), WeatherHandler)
    server.serve_forever()
