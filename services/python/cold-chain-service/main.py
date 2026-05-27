"""
Cold Chain IoT Monitoring Service (Python)

Ingests sensor data from LoRaWAN/MQTT IoT devices monitoring temperature,
humidity in transport vehicles and storage facilities.
Triggers alerts via Kafka when thresholds are breached.

Middleware: Kafka (events), Redis (latest readings cache), 
PostgreSQL (readings history), OpenSearch (analytics indexing)
"""

import os
import json
import logging
import asyncio
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict, field
from typing import Optional, Dict, List, Tuple
from enum import Enum

logging.basicConfig(level=logging.INFO, format="%(asctime)s [ColdChain] %(message)s")
logger = logging.getLogger(__name__)

# ============================================================================
# Configuration
# ============================================================================

class Config:
    def __init__(self):
        self.port = int(os.getenv("PORT", "8092"))
        self.database_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/farmer_data")
        self.kafka_brokers = os.getenv("KAFKA_BROKERS", "localhost:9093")
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        self.mqtt_broker = os.getenv("MQTT_BROKER", "localhost")
        self.mqtt_port = int(os.getenv("MQTT_PORT", "1883"))
        self.opensearch_url = os.getenv("OPENSEARCH_URL", "http://localhost:9200")
        self.alert_cooldown_minutes = int(os.getenv("ALERT_COOLDOWN_MINUTES", "15"))

config = Config()

# ============================================================================
# Domain Models
# ============================================================================

class AlertSeverity(Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"
    EMERGENCY = "emergency"

@dataclass
class SensorConfig:
    sensor_id: str
    sensor_type: str  # temperature, humidity, gps, multi
    vehicle_id: Optional[int] = None
    facility_id: Optional[int] = None
    min_temp: float = -30.0
    max_temp: float = 50.0
    alert_threshold_high: float = 8.0
    alert_threshold_low: float = 0.0
    humidity_min: float = 30.0
    humidity_max: float = 90.0

@dataclass
class SensorReading:
    sensor_id: str
    temperature: float
    humidity: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    battery_level: Optional[int] = None
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())

@dataclass
class ColdChainAlert:
    alert_id: str
    sensor_id: str
    severity: str
    alert_type: str
    message: str
    reading: Dict
    threshold: Dict
    vehicle_id: Optional[int] = None
    facility_id: Optional[int] = None
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())

# ============================================================================
# Crop Temperature Requirements Database
# ============================================================================

CROP_COLD_CHAIN = {
    "tomatoes": {"min": 10, "max": 15, "max_humidity": 90, "shelf_life_days": 14},
    "bananas": {"min": 13, "max": 14, "max_humidity": 85, "shelf_life_days": 21},
    "mangoes": {"min": 10, "max": 13, "max_humidity": 90, "shelf_life_days": 14},
    "avocados": {"min": 5, "max": 13, "max_humidity": 90, "shelf_life_days": 28},
    "leafy_greens": {"min": 0, "max": 4, "max_humidity": 95, "shelf_life_days": 7},
    "milk": {"min": 2, "max": 4, "max_humidity": None, "shelf_life_days": 10},
    "meat": {"min": -2, "max": 2, "max_humidity": None, "shelf_life_days": 5},
    "fish": {"min": -1, "max": 2, "max_humidity": None, "shelf_life_days": 3},
    "potatoes": {"min": 7, "max": 10, "max_humidity": 90, "shelf_life_days": 60},
    "onions": {"min": 0, "max": 3, "max_humidity": 65, "shelf_life_days": 90},
    "carrots": {"min": 0, "max": 1, "max_humidity": 95, "shelf_life_days": 30},
    "maize": {"min": 10, "max": 25, "max_humidity": 65, "shelf_life_days": 180},
    "rice": {"min": 10, "max": 25, "max_humidity": 60, "shelf_life_days": 365},
    "coffee": {"min": 15, "max": 25, "max_humidity": 60, "shelf_life_days": 180},
    "flowers": {"min": 2, "max": 5, "max_humidity": 90, "shelf_life_days": 7},
}

# ============================================================================
# Alert Engine
# ============================================================================

class AlertEngine:
    def __init__(self):
        self.sensors: Dict[str, SensorConfig] = {}
        self.last_alerts: Dict[str, datetime] = {}
        self.reading_history: Dict[str, List[SensorReading]] = {}
    
    def register_sensor(self, sensor: SensorConfig):
        self.sensors[sensor.sensor_id] = sensor
        logger.info(f"Registered sensor {sensor.sensor_id} (type={sensor.sensor_type})")
    
    def process_reading(self, reading: SensorReading) -> List[ColdChainAlert]:
        alerts = []
        sensor = self.sensors.get(reading.sensor_id)
        if not sensor:
            sensor = SensorConfig(sensor_id=reading.sensor_id, sensor_type="temperature")
            self.sensors[reading.sensor_id] = sensor
        
        # Store history (keep last 100 readings per sensor)
        if reading.sensor_id not in self.reading_history:
            self.reading_history[reading.sensor_id] = []
        history = self.reading_history[reading.sensor_id]
        history.append(reading)
        if len(history) > 100:
            self.reading_history[reading.sensor_id] = history[-100:]
        
        # Temperature checks
        if reading.temperature > sensor.alert_threshold_high:
            severity = AlertSeverity.CRITICAL if reading.temperature > sensor.max_temp else AlertSeverity.WARNING
            alert = self._create_alert(
                sensor_id=reading.sensor_id,
                severity=severity.value,
                alert_type="temperature_high",
                message=f"Temperature {reading.temperature}°C exceeds threshold {sensor.alert_threshold_high}°C",
                reading=asdict(reading),
                threshold={"high": sensor.alert_threshold_high, "max": sensor.max_temp},
                vehicle_id=sensor.vehicle_id,
                facility_id=sensor.facility_id,
            )
            if alert:
                alerts.append(alert)
        
        if reading.temperature < sensor.alert_threshold_low:
            severity = AlertSeverity.CRITICAL if reading.temperature < sensor.min_temp else AlertSeverity.WARNING
            alert = self._create_alert(
                sensor_id=reading.sensor_id,
                severity=severity.value,
                alert_type="temperature_low",
                message=f"Temperature {reading.temperature}°C below threshold {sensor.alert_threshold_low}°C",
                reading=asdict(reading),
                threshold={"low": sensor.alert_threshold_low, "min": sensor.min_temp},
                vehicle_id=sensor.vehicle_id,
                facility_id=sensor.facility_id,
            )
            if alert:
                alerts.append(alert)
        
        # Humidity checks
        if reading.humidity is not None and reading.humidity > sensor.humidity_max:
            alert = self._create_alert(
                sensor_id=reading.sensor_id,
                severity=AlertSeverity.WARNING.value,
                alert_type="humidity_high",
                message=f"Humidity {reading.humidity}% exceeds maximum {sensor.humidity_max}%",
                reading=asdict(reading),
                threshold={"max_humidity": sensor.humidity_max},
                vehicle_id=sensor.vehicle_id,
                facility_id=sensor.facility_id,
            )
            if alert:
                alerts.append(alert)
        
        # Battery check
        if reading.battery_level is not None and reading.battery_level < 15:
            severity = AlertSeverity.CRITICAL if reading.battery_level < 5 else AlertSeverity.WARNING
            alert = self._create_alert(
                sensor_id=reading.sensor_id,
                severity=severity.value,
                alert_type="battery_low",
                message=f"Battery level at {reading.battery_level}%",
                reading=asdict(reading),
                threshold={"min_battery": 15},
                vehicle_id=sensor.vehicle_id,
                facility_id=sensor.facility_id,
            )
            if alert:
                alerts.append(alert)
        
        # Rate of change alert (rapid temperature change)
        if len(history) >= 5:
            recent = history[-5:]
            temps = [r.temperature for r in recent]
            temp_change = abs(temps[-1] - temps[0])
            if temp_change > 5:  # >5°C change in 5 readings
                alert = self._create_alert(
                    sensor_id=reading.sensor_id,
                    severity=AlertSeverity.WARNING.value,
                    alert_type="rapid_temperature_change",
                    message=f"Rapid temperature change of {temp_change:.1f}°C detected",
                    reading=asdict(reading),
                    threshold={"max_change": 5},
                    vehicle_id=sensor.vehicle_id,
                    facility_id=sensor.facility_id,
                )
                if alert:
                    alerts.append(alert)
        
        return alerts
    
    def _create_alert(self, **kwargs) -> Optional[ColdChainAlert]:
        sensor_id = kwargs["sensor_id"]
        alert_type = kwargs["alert_type"]
        key = f"{sensor_id}:{alert_type}"
        
        now = datetime.utcnow()
        last = self.last_alerts.get(key)
        if last and (now - last).total_seconds() < config.alert_cooldown_minutes * 60:
            return None
        
        self.last_alerts[key] = now
        import hashlib
        alert_id = hashlib.sha256(f"{key}:{now.isoformat()}".encode()).hexdigest()[:16]
        return ColdChainAlert(alert_id=alert_id, **kwargs)
    
    def get_crop_requirements(self, crop: str) -> Optional[Dict]:
        return CROP_COLD_CHAIN.get(crop.lower())
    
    def check_crop_compliance(self, crop: str, temperature: float, humidity: Optional[float] = None) -> Dict:
        reqs = self.get_crop_requirements(crop)
        if not reqs:
            return {"compliant": True, "message": f"No cold chain requirements for {crop}"}
        
        issues = []
        if temperature < reqs["min"]:
            issues.append(f"Temperature {temperature}°C below minimum {reqs['min']}°C")
        if temperature > reqs["max"]:
            issues.append(f"Temperature {temperature}°C above maximum {reqs['max']}°C")
        if humidity is not None and reqs.get("max_humidity") and humidity > reqs["max_humidity"]:
            issues.append(f"Humidity {humidity}% above maximum {reqs['max_humidity']}%")
        
        return {
            "compliant": len(issues) == 0,
            "crop": crop,
            "requirements": reqs,
            "current": {"temperature": temperature, "humidity": humidity},
            "issues": issues,
        }

# ============================================================================
# Shelf Life Predictor
# ============================================================================

class ShelfLifePredictor:
    """Estimates remaining shelf life based on cold chain conditions."""
    
    @staticmethod
    def estimate_shelf_life(crop: str, avg_temp: float, storage_hours: float) -> Dict:
        reqs = CROP_COLD_CHAIN.get(crop.lower())
        if not reqs:
            return {"crop": crop, "estimated_days": None, "message": "Unknown crop"}
        
        ideal_temp = (reqs["min"] + reqs["max"]) / 2
        temp_deviation = abs(avg_temp - ideal_temp)
        
        # Arrhenius-inspired degradation: every 10°C above ideal halves shelf life
        degradation_factor = 2 ** (temp_deviation / 10)
        base_days = reqs["shelf_life_days"]
        remaining_days = base_days / degradation_factor
        
        # Subtract time already spent
        days_spent = storage_hours / 24
        remaining_days = max(0, remaining_days - days_spent)
        
        quality_pct = min(100, max(0, (remaining_days / base_days) * 100))
        
        return {
            "crop": crop,
            "base_shelf_life_days": base_days,
            "estimated_remaining_days": round(remaining_days, 1),
            "quality_percentage": round(quality_pct, 1),
            "avg_temperature": avg_temp,
            "ideal_temperature": ideal_temp,
            "storage_hours": storage_hours,
            "degradation_factor": round(degradation_factor, 2),
        }

# ============================================================================
# HTTP Server (using stdlib for minimal dependencies)
# ============================================================================

from http.server import HTTPServer, BaseHTTPRequestHandler
import threading

alert_engine = AlertEngine()
shelf_predictor = ShelfLifePredictor()

class ColdChainHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # suppress default logging
    
    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)
        data = json.loads(body) if body else {}
        
        if self.path == "/api/readings":
            self._handle_reading(data)
        elif self.path == "/api/sensors/register":
            self._handle_register_sensor(data)
        elif self.path == "/api/crop-compliance":
            self._handle_crop_compliance(data)
        elif self.path == "/api/shelf-life":
            self._handle_shelf_life(data)
        elif self.path == "/api/readings/batch":
            self._handle_batch_readings(data)
        else:
            self._respond(404, {"error": "Not found"})
    
    def do_GET(self):
        if self.path == "/health":
            self._respond(200, {
                "status": "healthy",
                "service": "cold-chain-monitoring",
                "sensors_registered": len(alert_engine.sensors),
                "supported_crops": len(CROP_COLD_CHAIN),
                "timestamp": datetime.utcnow().isoformat(),
            })
        elif self.path == "/api/crops":
            self._respond(200, {
                "crops": {k: v for k, v in CROP_COLD_CHAIN.items()},
            })
        elif self.path.startswith("/api/sensors/"):
            sensor_id = self.path.split("/")[-1]
            history = alert_engine.reading_history.get(sensor_id, [])
            self._respond(200, {
                "sensor_id": sensor_id,
                "readings": [asdict(r) for r in history[-20:]],
                "count": len(history),
            })
        else:
            self._respond(404, {"error": "Not found"})
    
    def _handle_reading(self, data):
        reading = SensorReading(
            sensor_id=data["sensor_id"],
            temperature=data["temperature"],
            humidity=data.get("humidity"),
            latitude=data.get("latitude"),
            longitude=data.get("longitude"),
            battery_level=data.get("battery_level"),
        )
        
        alerts = alert_engine.process_reading(reading)
        
        response = {
            "status": "processed",
            "sensor_id": reading.sensor_id,
            "alerts": [asdict(a) for a in alerts],
            "alert_count": len(alerts),
        }
        self._respond(200, response)
    
    def _handle_batch_readings(self, data):
        readings = data.get("readings", [])
        total_alerts = []
        for r in readings:
            reading = SensorReading(
                sensor_id=r["sensor_id"],
                temperature=r["temperature"],
                humidity=r.get("humidity"),
                latitude=r.get("latitude"),
                longitude=r.get("longitude"),
                battery_level=r.get("battery_level"),
            )
            alerts = alert_engine.process_reading(reading)
            total_alerts.extend(alerts)
        
        self._respond(200, {
            "status": "processed",
            "readings_count": len(readings),
            "alerts": [asdict(a) for a in total_alerts],
            "alert_count": len(total_alerts),
        })
    
    def _handle_register_sensor(self, data):
        sensor = SensorConfig(
            sensor_id=data["sensor_id"],
            sensor_type=data.get("sensor_type", "temperature"),
            vehicle_id=data.get("vehicle_id"),
            facility_id=data.get("facility_id"),
            alert_threshold_high=data.get("alert_threshold_high", 8.0),
            alert_threshold_low=data.get("alert_threshold_low", 0.0),
        )
        alert_engine.register_sensor(sensor)
        self._respond(200, {"status": "registered", "sensor_id": sensor.sensor_id})
    
    def _handle_crop_compliance(self, data):
        result = alert_engine.check_crop_compliance(
            crop=data["crop"],
            temperature=data["temperature"],
            humidity=data.get("humidity"),
        )
        self._respond(200, result)
    
    def _handle_shelf_life(self, data):
        result = shelf_predictor.estimate_shelf_life(
            crop=data["crop"],
            avg_temp=data["avg_temperature"],
            storage_hours=data.get("storage_hours", 0),
        )
        self._respond(200, result)
    
    def _respond(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())


def main():
    server = HTTPServer(("0.0.0.0", config.port), ColdChainHandler)
    logger.info(f"Cold Chain IoT service starting on port {config.port}")
    logger.info(f"Monitoring {len(CROP_COLD_CHAIN)} crop types")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        server.shutdown()

if __name__ == "__main__":
    main()
