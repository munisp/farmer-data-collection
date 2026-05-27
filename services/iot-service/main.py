#!/usr/bin/env python3
"""
IoT Service - Sensor data ingestion, processing, and real-time monitoring
"""

import os
import json
import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager
from enum import Enum

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings
import psycopg2
from psycopg2.extras import RealDictCursor
import redis
from kafka import KafkaProducer
from prometheus_client import Counter, Gauge, generate_latest, CONTENT_TYPE_LATEST
from fastapi.responses import Response
import paho.mqtt.client as mqtt

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Prometheus metrics
SENSOR_READINGS = Counter('iot_sensor_readings_total', 'Total sensor readings', ['device_id', 'sensor_type'])
ACTIVE_DEVICES = Gauge('iot_active_devices', 'Number of active IoT devices')
ALERT_COUNT = Counter('iot_alerts_total', 'Total IoT alerts', ['alert_type'])

# Configuration
class Settings(BaseSettings):
    port: int = 8085
    database_url: str = "postgresql://postgres:postgres@localhost:5432/farmer_db"
    redis_url: str = "redis://localhost:6379"
    kafka_brokers: str = "localhost:9092"
    mqtt_broker: str = "localhost"
    mqtt_port: int = 1883
    
    class Config:
        env_file = ".env"

settings = Settings()

# Enums
class SensorType(str, Enum):
    SOIL_MOISTURE = "soil_moisture"
    SOIL_TEMPERATURE = "soil_temperature"
    SOIL_PH = "soil_ph"
    SOIL_NPK = "soil_npk"
    AIR_TEMPERATURE = "air_temperature"
    AIR_HUMIDITY = "air_humidity"
    RAINFALL = "rainfall"
    LIGHT_INTENSITY = "light_intensity"
    WATER_LEVEL = "water_level"
    GPS = "gps"

class DeviceStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    MAINTENANCE = "maintenance"
    ERROR = "error"

# Models
class IoTDevice(BaseModel):
    id: str
    farm_id: str
    name: str
    device_type: str
    model: str
    firmware_version: str
    status: DeviceStatus
    last_seen: Optional[datetime] = None
    battery_level: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class SensorReading(BaseModel):
    device_id: str
    sensor_type: SensorType
    value: float
    unit: str
    timestamp: datetime
    metadata: Optional[Dict[str, Any]] = None

class SensorAlert(BaseModel):
    id: str
    device_id: str
    sensor_type: SensorType
    alert_type: str  # threshold_exceeded, device_offline, battery_low, etc.
    severity: str  # low, medium, high, critical
    message: str
    value: Optional[float] = None
    threshold: Optional[float] = None
    timestamp: datetime

class DeviceCommand(BaseModel):
    device_id: str
    command: str  # reboot, calibrate, update_config, etc.
    parameters: Optional[Dict[str, Any]] = None

# Database
class Database:
    def __init__(self):
        self.conn = None
        self.connect()
    
    def connect(self):
        try:
            self.conn = psycopg2.connect(settings.database_url)
            logger.info("Connected to PostgreSQL")
            self._init_schema()
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            raise
    
    def _init_schema(self):
        cursor = self.conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS iot_devices (
                id VARCHAR(255) PRIMARY KEY,
                farm_id UUID NOT NULL,
                name VARCHAR(255) NOT NULL,
                device_type VARCHAR(100) NOT NULL,
                model VARCHAR(100),
                firmware_version VARCHAR(50),
                status VARCHAR(50) NOT NULL DEFAULT 'active',
                last_seen TIMESTAMP,
                battery_level INTEGER,
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                metadata JSONB,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            
            CREATE TABLE IF NOT EXISTS sensor_readings (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                device_id VARCHAR(255) NOT NULL REFERENCES iot_devices(id),
                sensor_type VARCHAR(50) NOT NULL,
                value DOUBLE PRECISION NOT NULL,
                unit VARCHAR(20) NOT NULL,
                timestamp TIMESTAMP NOT NULL,
                metadata JSONB,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            
            CREATE TABLE IF NOT EXISTS sensor_alerts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                device_id VARCHAR(255) NOT NULL REFERENCES iot_devices(id),
                sensor_type VARCHAR(50) NOT NULL,
                alert_type VARCHAR(100) NOT NULL,
                severity VARCHAR(50) NOT NULL,
                message TEXT NOT NULL,
                value DOUBLE PRECISION,
                threshold DOUBLE PRECISION,
                timestamp TIMESTAMP NOT NULL,
                acknowledged BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            
            CREATE INDEX IF NOT EXISTS idx_sensor_readings_device ON sensor_readings(device_id);
            CREATE INDEX IF NOT EXISTS idx_sensor_readings_timestamp ON sensor_readings(timestamp);
            CREATE INDEX IF NOT EXISTS idx_sensor_alerts_device ON sensor_alerts(device_id);
            CREATE INDEX IF NOT EXISTS idx_sensor_alerts_acknowledged ON sensor_alerts(acknowledged);
        """)
        self.conn.commit()
        cursor.close()
    
    def get_cursor(self):
        if not self.conn or self.conn.closed:
            self.connect()
        return self.conn.cursor(cursor_factory=RealDictCursor)
    
    def close(self):
        if self.conn:
            self.conn.close()

# Redis cache
class RedisCache:
    def __init__(self):
        try:
            self.client = redis.from_url(settings.redis_url, decode_responses=True)
            self.client.ping()
            logger.info("Connected to Redis")
        except Exception as e:
            logger.warning(f"Failed to connect to Redis: {e}")
            self.client = None
    
    def get(self, key: str) -> Optional[str]:
        if self.client:
            try:
                return self.client.get(key)
            except Exception as e:
                logger.error(f"Redis GET error: {e}")
        return None
    
    def set(self, key: str, value: str, ttl: int = 300):
        if self.client:
            try:
                self.client.setex(key, ttl, value)
            except Exception as e:
                logger.error(f"Redis SET error: {e}")
    
    def publish(self, channel: str, message: str):
        if self.client:
            try:
                self.client.publish(channel, message)
            except Exception as e:
                logger.error(f"Redis PUBLISH error: {e}")

# Kafka producer
class EventPublisher:
    def __init__(self):
        try:
            self.producer = KafkaProducer(
                bootstrap_servers=settings.kafka_brokers.split(','),
                value_serializer=lambda v: json.dumps(v).encode('utf-8')
            )
            logger.info("Connected to Kafka")
        except Exception as e:
            logger.warning(f"Failed to connect to Kafka: {e}")
            self.producer = None
    
    def publish(self, topic: str, event: Dict):
        if self.producer:
            try:
                self.producer.send(topic, event)
                self.producer.flush()
            except Exception as e:
                logger.error(f"Failed to publish event: {e}")

# MQTT client for device communication
class MQTTClient:
    def __init__(self, db: Database, events: EventPublisher):
        self.db = db
        self.events = events
        self.client = mqtt.Client()
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        
        try:
            self.client.connect(settings.mqtt_broker, settings.mqtt_port, 60)
            self.client.loop_start()
            logger.info("MQTT client connected")
        except Exception as e:
            logger.warning(f"Failed to connect to MQTT broker: {e}")
    
    def on_connect(self, client, userdata, flags, rc):
        logger.info(f"MQTT connected with result code {rc}")
        # Subscribe to all device topics
        client.subscribe("devices/+/readings")
        client.subscribe("devices/+/status")
    
    def on_message(self, client, userdata, msg):
        try:
            topic_parts = msg.topic.split('/')
            device_id = topic_parts[1]
            message_type = topic_parts[2]
            
            payload = json.loads(msg.payload.decode())
            
            if message_type == 'readings':
                self.handle_sensor_reading(device_id, payload)
            elif message_type == 'status':
                self.handle_device_status(device_id, payload)
                
        except Exception as e:
            logger.error(f"MQTT message processing error: {e}")
    
    def handle_sensor_reading(self, device_id: str, payload: Dict):
        """Process incoming sensor reading"""
        try:
            cursor = self.db.get_cursor()
            
            # Store reading
            cursor.execute("""
                INSERT INTO sensor_readings (device_id, sensor_type, value, unit, timestamp, metadata)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (device_id, payload['sensor_type'], payload['value'], payload['unit'],
                  payload.get('timestamp', datetime.utcnow()), json.dumps(payload.get('metadata'))))
            
            self.db.conn.commit()
            cursor.close()
            
            # Update metrics
            SENSOR_READINGS.labels(device_id=device_id, sensor_type=payload['sensor_type']).inc()
            
            # Publish event
            self.events.publish('iot.events', {
                'type': 'sensor.reading',
                'device_id': device_id,
                'sensor_type': payload['sensor_type'],
                'value': payload['value'],
                'timestamp': datetime.utcnow().isoformat()
            })
            
            # Check thresholds and create alerts if needed
            self.check_thresholds(device_id, payload)
            
        except Exception as e:
            logger.error(f"Sensor reading processing error: {e}")
    
    def handle_device_status(self, device_id: str, payload: Dict):
        """Process device status update"""
        try:
            cursor = self.db.get_cursor()
            
            cursor.execute("""
                UPDATE iot_devices
                SET status = %s, last_seen = NOW(), battery_level = %s, updated_at = NOW()
                WHERE id = %s
            """, (payload.get('status', 'active'), payload.get('battery_level'), device_id))
            
            self.db.conn.commit()
            cursor.close()
            
            # Check battery level
            if payload.get('battery_level', 100) < 20:
                self.create_alert(device_id, 'battery_low', 'medium',
                                f"Battery level low: {payload['battery_level']}%")
            
        except Exception as e:
            logger.error(f"Device status processing error: {e}")
    
    def check_thresholds(self, device_id: str, reading: Dict):
        """Check if reading exceeds thresholds"""
        sensor_type = reading['sensor_type']
        value = reading['value']
        
        # Define thresholds (in production, these would come from configuration)
        thresholds = {
            'soil_moisture': {'min': 20, 'max': 80},
            'soil_temperature': {'min': 10, 'max': 35},
            'air_temperature': {'min': 5, 'max': 40},
            'soil_ph': {'min': 5.5, 'max': 7.5}
        }
        
        if sensor_type in thresholds:
            threshold = thresholds[sensor_type]
            
            if value < threshold['min']:
                self.create_alert(device_id, 'threshold_low', 'high',
                                f"{sensor_type} below minimum: {value} < {threshold['min']}")
            elif value > threshold['max']:
                self.create_alert(device_id, 'threshold_high', 'high',
                                f"{sensor_type} above maximum: {value} > {threshold['max']}")
    
    def create_alert(self, device_id: str, alert_type: str, severity: str, message: str):
        """Create sensor alert"""
        try:
            cursor = self.db.get_cursor()
            
            cursor.execute("""
                INSERT INTO sensor_alerts (device_id, sensor_type, alert_type, severity, message, timestamp)
                VALUES (%s, %s, %s, %s, %s, NOW())
            """, (device_id, 'system', alert_type, severity, message))
            
            self.db.conn.commit()
            cursor.close()
            
            # Update metrics
            ALERT_COUNT.labels(alert_type=alert_type).inc()
            
            # Publish alert event
            self.events.publish('iot.events', {
                'type': 'sensor.alert',
                'device_id': device_id,
                'alert_type': alert_type,
                'severity': severity,
                'message': message,
                'timestamp': datetime.utcnow().isoformat()
            })
            
        except Exception as e:
            logger.error(f"Alert creation error: {e}")
    
    def send_command(self, device_id: str, command: str, parameters: Dict = None):
        """Send command to device"""
        topic = f"devices/{device_id}/commands"
        payload = {
            'command': command,
            'parameters': parameters or {},
            'timestamp': datetime.utcnow().isoformat()
        }
        self.client.publish(topic, json.dumps(payload))

# Global instances
db = Database()
cache = RedisCache()
events = EventPublisher()
mqtt_client = MQTTClient(db, events)

# WebSocket connections for real-time updates
active_connections: List[WebSocket] = []

# Lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting IoT service")
    yield
    logger.info("Shutting down IoT service")
    db.close()

# FastAPI app
app = FastAPI(
    title="IoT Service",
    description="IoT device management and sensor data processing",
    version="1.0.0",
    lifespan=lifespan
)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "iot"}

@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

# Device management
@app.post("/api/v1/devices", response_model=IoTDevice)
async def register_device(device: IoTDevice):
    """Register a new IoT device"""
    try:
        cursor = db.get_cursor()
        
        cursor.execute("""
            INSERT INTO iot_devices (id, farm_id, name, device_type, model, firmware_version, status, latitude, longitude)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        """, (device.id, device.farm_id, device.name, device.device_type, device.model,
              device.firmware_version, device.status.value, device.latitude, device.longitude))
        
        result = cursor.fetchone()
        db.conn.commit()
        cursor.close()
        
        ACTIVE_DEVICES.inc()
        
        events.publish('iot.events', {
            'type': 'device.registered',
            'device_id': device.id,
            'timestamp': datetime.utcnow().isoformat()
        })
        
        return IoTDevice(**result)
        
    except Exception as e:
        logger.error(f"Device registration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/devices", response_model=List[IoTDevice])
async def list_devices(farm_id: Optional[str] = None, status: Optional[DeviceStatus] = None):
    """List IoT devices"""
    try:
        cursor = db.get_cursor()
        
        query = "SELECT * FROM iot_devices WHERE 1=1"
        params = []
        
        if farm_id:
            query += " AND farm_id = %s"
            params.append(farm_id)
        
        if status:
            query += " AND status = %s"
            params.append(status.value)
        
        query += " ORDER BY created_at DESC"
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        cursor.close()
        
        return [IoTDevice(**row) for row in results]
        
    except Exception as e:
        logger.error(f"List devices error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/devices/{device_id}", response_model=IoTDevice)
async def get_device(device_id: str):
    """Get device details"""
    try:
        cursor = db.get_cursor()
        cursor.execute("SELECT * FROM iot_devices WHERE id = %s", (device_id,))
        result = cursor.fetchone()
        cursor.close()
        
        if not result:
            raise HTTPException(status_code=404, detail="Device not found")
        
        return IoTDevice(**result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get device error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Sensor readings
@app.post("/api/v1/readings")
async def submit_reading(reading: SensorReading):
    """Submit sensor reading"""
    mqtt_client.handle_sensor_reading(reading.device_id, reading.dict())
    return {"status": "success"}

@app.get("/api/v1/readings")
async def get_readings(
    device_id: Optional[str] = None,
    sensor_type: Optional[SensorType] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    limit: int = 1000
):
    """Get sensor readings"""
    try:
        cursor = db.get_cursor()
        
        query = "SELECT * FROM sensor_readings WHERE 1=1"
        params = []
        
        if device_id:
            query += " AND device_id = %s"
            params.append(device_id)
        
        if sensor_type:
            query += " AND sensor_type = %s"
            params.append(sensor_type.value)
        
        if start_time:
            query += " AND timestamp >= %s"
            params.append(start_time)
        
        if end_time:
            query += " AND timestamp <= %s"
            params.append(end_time)
        
        query += " ORDER BY timestamp DESC LIMIT %s"
        params.append(limit)
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        cursor.close()
        
        return [dict(row) for row in results]
        
    except Exception as e:
        logger.error(f"Get readings error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Alerts
@app.get("/api/v1/alerts", response_model=List[SensorAlert])
async def get_alerts(
    device_id: Optional[str] = None,
    acknowledged: bool = False,
    severity: Optional[str] = None
):
    """Get sensor alerts"""
    try:
        cursor = db.get_cursor()
        
        query = "SELECT * FROM sensor_alerts WHERE acknowledged = %s"
        params = [acknowledged]
        
        if device_id:
            query += " AND device_id = %s"
            params.append(device_id)
        
        if severity:
            query += " AND severity = %s"
            params.append(severity)
        
        query += " ORDER BY timestamp DESC LIMIT 100"
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        cursor.close()
        
        return [SensorAlert(**row) for row in results]
        
    except Exception as e:
        logger.error(f"Get alerts error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str):
    """Acknowledge an alert"""
    try:
        cursor = db.get_cursor()
        cursor.execute("UPDATE sensor_alerts SET acknowledged = TRUE WHERE id = %s", (alert_id,))
        db.conn.commit()
        cursor.close()
        
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"Acknowledge alert error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Device commands
@app.post("/api/v1/devices/{device_id}/command")
async def send_device_command(device_id: str, command: DeviceCommand):
    """Send command to device"""
    mqtt_client.send_command(device_id, command.command, command.parameters)
    return {"status": "command_sent"}

# WebSocket for real-time updates
@app.websocket("/ws/readings/{device_id}")
async def websocket_readings(websocket: WebSocket, device_id: str):
    await websocket.accept()
    active_connections.append(websocket)
    
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        active_connections.remove(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.port)
