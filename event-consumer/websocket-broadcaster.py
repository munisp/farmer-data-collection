#!/usr/bin/env python3
"""
WebSocket Broadcaster for Kafka Events

Consumes events from Kafka and broadcasts them to WebSocket clients
via the Node.js WebSocket server HTTP API.
"""

import json
import logging
import os
import requests
from typing import Dict, Any
from kafka import KafkaConsumer

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# ============================================================================
# Configuration
# ============================================================================

KAFKA_BROKERS = os.getenv('KAFKA_BROKERS', 'localhost:9092').split(',')
KAFKA_GROUP_ID = 'websocket-broadcaster-group'
WEBSOCKET_API_URL = os.getenv('WEBSOCKET_API_URL', 'http://localhost:3000/api/websocket')

TOPICS = [
    'farmer-events',
    'farm-events',
    'crop-events',
    'livestock-events',
    'harvest-events',
    'expense-events',
]

# ============================================================================
# WebSocket API Client
# ============================================================================

class WebSocketAPIClient:
    """Client for sending events to WebSocket server via HTTP API"""
    
    def __init__(self, base_url: str = WEBSOCKET_API_URL):
        self.base_url = base_url
    
    def broadcast_event(self, event: Dict[str, Any]) -> bool:
        """Broadcast event to WebSocket clients"""
        try:
            response = requests.post(
                f"{self.base_url}/broadcast",
                json=event,
                timeout=5
            )
            
            if response.status_code == 200:
                logger.info(f"✅ Broadcasted {event.get('eventType')} via WebSocket")
                return True
            else:
                logger.warning(f"⚠️  WebSocket broadcast failed: {response.status_code}")
                return False
                
        except requests.exceptions.RequestException as e:
            logger.warning(f"⚠️  WebSocket API unavailable: {e}")
            return False
    
    def emit_to_user(self, user_id: int, event: Dict[str, Any]) -> bool:
        """Emit event to specific user"""
        try:
            response = requests.post(
                f"{self.base_url}/emit-to-user",
                json={"userId": user_id, "event": event},
                timeout=5
            )
            
            if response.status_code == 200:
                logger.info(f"✅ Emitted {event.get('eventType')} to user {user_id}")
                return True
            else:
                logger.warning(f"⚠️  User emit failed: {response.status_code}")
                return False
                
        except requests.exceptions.RequestException as e:
            logger.warning(f"⚠️  WebSocket API unavailable: {e}")
            return False

# ============================================================================
# Event Broadcaster
# ============================================================================

class EventBroadcaster:
    """Broadcasts Kafka events to WebSocket clients"""
    
    def __init__(self):
        self.ws_client = WebSocketAPIClient()
        self.consumer = None
        self.running = False
    
    def start(self):
        """Start consuming and broadcasting events"""
        logger.info("=" * 60)
        logger.info("WebSocket Event Broadcaster")
        logger.info("=" * 60)
        logger.info(f"Kafka Brokers: {KAFKA_BROKERS}")
        logger.info(f"Consumer Group: {KAFKA_GROUP_ID}")
        logger.info(f"Topics: {TOPICS}")
        logger.info(f"WebSocket API: {WEBSOCKET_API_URL}")
        logger.info("=" * 60)
        
        try:
            self.consumer = KafkaConsumer(
                *TOPICS,
                bootstrap_servers=KAFKA_BROKERS,
                group_id=KAFKA_GROUP_ID,
                value_deserializer=lambda m: json.loads(m.decode('utf-8')),
                auto_offset_reset='latest',  # Only new events
                enable_auto_commit=True,
            )
            
            logger.info("✅ Connected to Kafka, waiting for events...")
            self.running = True
            
            for message in self.consumer:
                if not self.running:
                    break
                
                try:
                    event = message.value
                    event_type = event.get('eventType')
                    user_id = event.get('userId')
                    
                    logger.info(f"📨 Received {event_type} from topic {message.topic}")
                    
                    # Broadcast to specific user if userId is present
                    if user_id:
                        self.ws_client.emit_to_user(user_id, event)
                    else:
                        self.ws_client.broadcast_event(event)
                    
                except Exception as e:
                    logger.error(f"Error processing message: {e}")
                    continue
            
        except Exception as e:
            logger.error(f"Fatal error: {e}")
            raise
        finally:
            self.stop()
    
    def stop(self):
        """Stop the broadcaster"""
        logger.info("Stopping WebSocket broadcaster...")
        self.running = False
        
        if self.consumer:
            self.consumer.close()
            logger.info("Kafka consumer closed")
        
        logger.info("WebSocket broadcaster stopped")

# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    import signal
    import sys
    
    broadcaster = None
    
    def signal_handler(signum, frame):
        logger.info(f"Received signal {signum}, shutting down...")
        if broadcaster:
            broadcaster.stop()
        sys.exit(0)
    
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    
    broadcaster = EventBroadcaster()
    
    try:
        broadcaster.start()
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    except Exception as e:
        logger.error(f"Service failed: {e}")
        sys.exit(1)
