"""IoT Sensor Integration Service - MQTT"""
import paho.mqtt.client as mqtt
import json
import psycopg2
from datetime import datetime

MQTT_BROKER = "localhost"
MQTT_PORT = 1883
DB_URL = "postgresql://localhost:5432/farmer_db"

def on_connect(client, userdata, flags, rc):
    print(f"Connected to MQTT broker: {rc}")
    client.subscribe("farm/+/sensors/#")

def on_message(client, userdata, msg):
    topic = msg.topic
    payload = json.loads(msg.payload)
    
    # Parse topic: farm/{farm_id}/sensors/{sensor_type}
    parts = topic.split("/")
    farm_id = int(parts[1])
    sensor_type = parts[3]
    
    # Store sensor data
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO sensor_readings (farm_id, sensor_type, value, unit, timestamp)
        VALUES (%s, %s, %s, %s, %s)
    """, (farm_id, sensor_type, payload['value'], payload['unit'], datetime.now()))
    conn.commit()
    conn.close()
    
    print(f"Stored {sensor_type} reading for farm {farm_id}: {payload['value']} {payload['unit']}")

client = mqtt.Client()
client.on_connect = on_connect
client.on_message = on_message
client.connect(MQTT_BROKER, MQTT_PORT, 60)
client.loop_forever()
