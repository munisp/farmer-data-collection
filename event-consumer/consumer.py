#!/usr/bin/env python3
"""
Kafka Event Consumer Service

Consumes domain events from Kafka topics and processes them for:
- Analytics and reporting
- Notifications
- Data aggregation
- Audit logging
"""

import json
import logging
import os
import signal
import sys
from datetime import datetime
from typing import Dict, Any, Callable
from kafka import KafkaConsumer
import psycopg2
from psycopg2.extras import RealDictCursor

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
KAFKA_GROUP_ID = os.getenv('KAFKA_GROUP_ID', 'farmer-data-consumer-group')
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/farmer_data')

# Topics to subscribe to
TOPICS = [
    'farmer-events',
    'farm-events',
    'crop-events',
    'livestock-events',
    'harvest-events',
    'expense-events',
]

# ============================================================================
# Database Connection
# ============================================================================

def get_db_connection():
    """Get PostgreSQL database connection"""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        return None

# ============================================================================
# Event Handlers
# ============================================================================

class EventHandlers:
    """Collection of event handlers for different event types"""
    
    def __init__(self):
        self.db_conn = get_db_connection()
        self.handlers: Dict[str, Callable] = {
            'FarmerCreated': self.handle_farmer_created,
            'FarmerUpdated': self.handle_farmer_updated,
            'FarmCreated': self.handle_farm_created,
            'FarmUpdated': self.handle_farm_updated,
            'CropPlanted': self.handle_crop_planted,
            'LivestockAdded': self.handle_livestock_added,
            'HarvestRecorded': self.handle_harvest_recorded,
            'ExpenseLogged': self.handle_expense_logged,
        }
    
    def handle_event(self, event: Dict[str, Any]) -> None:
        """Route event to appropriate handler"""
        event_type = event.get('eventType')
        
        if not event_type:
            logger.warning("Event missing eventType field")
            return
        
        handler = self.handlers.get(event_type)
        
        if handler:
            try:
                handler(event)
                logger.info(f"Successfully processed {event_type}")
            except Exception as e:
                logger.error(f"Error processing {event_type}: {e}")
        else:
            logger.warning(f"No handler registered for event type: {event_type}")
    
    # ------------------------------------------------------------------------
    # Farmer Events
    # ------------------------------------------------------------------------
    
    def handle_farmer_created(self, event: Dict[str, Any]) -> None:
        """Handle FarmerCreated event"""
        data = event.get('data', {})
        farmer_id = data.get('id')
        farmer_name = data.get('name')
        user_id = event.get('userId')
        
        logger.info(f"📝 New farmer created: {farmer_name} (ID: {farmer_id}) by user {user_id}")
        
        # Log to analytics table
        self._log_analytics_event(
            event_type='farmer_created',
            entity_id=farmer_id,
            user_id=user_id,
            metadata=data
        )
        
        # Could trigger welcome SMS/email here
        # self._send_welcome_notification(farmer_id, farmer_name)
    
    def handle_farmer_updated(self, event: Dict[str, Any]) -> None:
        """Handle FarmerUpdated event"""
        data = event.get('data', {})
        farmer_id = data.get('id')
        
        logger.info(f"✏️  Farmer updated: ID {farmer_id}")
        
        self._log_analytics_event(
            event_type='farmer_updated',
            entity_id=farmer_id,
            user_id=event.get('userId'),
            metadata=data
        )
    
    # ------------------------------------------------------------------------
    # Farm Events
    # ------------------------------------------------------------------------
    
    def handle_farm_created(self, event: Dict[str, Any]) -> None:
        """Handle FarmCreated event"""
        data = event.get('data', {})
        farm_id = data.get('id')
        farm_name = data.get('name')
        size = data.get('size')
        
        logger.info(f"🏞️  New farm created: {farm_name} ({size} ha) - ID: {farm_id}")
        
        self._log_analytics_event(
            event_type='farm_created',
            entity_id=farm_id,
            user_id=event.get('userId'),
            metadata=data
        )
    
    def handle_farm_updated(self, event: Dict[str, Any]) -> None:
        """Handle FarmUpdated event"""
        data = event.get('data', {})
        farm_id = data.get('id')
        
        logger.info(f"✏️  Farm updated: ID {farm_id}")
        
        self._log_analytics_event(
            event_type='farm_updated',
            entity_id=farm_id,
            user_id=event.get('userId'),
            metadata=data
        )
    
    # ------------------------------------------------------------------------
    # Crop Events
    # ------------------------------------------------------------------------
    
    def handle_crop_planted(self, event: Dict[str, Any]) -> None:
        """Handle CropPlanted event"""
        data = event.get('data', {})
        crop_id = data.get('id')
        crop_type = data.get('cropType')
        area = data.get('areaPlanted')
        
        logger.info(f"🌱 Crop planted: {crop_type} ({area} ha) - ID: {crop_id}")
        
        self._log_analytics_event(
            event_type='crop_planted',
            entity_id=crop_id,
            user_id=event.get('userId'),
            metadata=data
        )
        
        # Could trigger ML yield prediction here
        # self._trigger_yield_prediction(crop_id, data)
    
    # ------------------------------------------------------------------------
    # Livestock Events
    # ------------------------------------------------------------------------
    
    def handle_livestock_added(self, event: Dict[str, Any]) -> None:
        """Handle LivestockAdded event"""
        data = event.get('data', {})
        livestock_id = data.get('id')
        animal_type = data.get('animalType')
        count = data.get('count')
        
        logger.info(f"🐄 Livestock added: {count} {animal_type}(s) - ID: {livestock_id}")
        
        self._log_analytics_event(
            event_type='livestock_added',
            entity_id=livestock_id,
            user_id=event.get('userId'),
            metadata=data
        )
    
    # ------------------------------------------------------------------------
    # Harvest Events
    # ------------------------------------------------------------------------
    
    def handle_harvest_recorded(self, event: Dict[str, Any]) -> None:
        """Handle HarvestRecorded event"""
        data = event.get('data', {})
        harvest_id = data.get('id')
        crop_type = data.get('cropType')
        quantity = data.get('quantity')
        
        logger.info(f"🌾 Harvest recorded: {quantity} kg of {crop_type} - ID: {harvest_id}")
        
        self._log_analytics_event(
            event_type='harvest_recorded',
            entity_id=harvest_id,
            user_id=event.get('userId'),
            metadata=data
        )
        
        # Update aggregate statistics
        self._update_harvest_statistics(event.get('userId'), crop_type, quantity)
    
    # ------------------------------------------------------------------------
    # Expense Events
    # ------------------------------------------------------------------------
    
    def handle_expense_logged(self, event: Dict[str, Any]) -> None:
        """Handle ExpenseLogged event"""
        data = event.get('data', {})
        expense_id = data.get('id')
        category = data.get('category')
        amount = data.get('amount')
        
        logger.info(f"💰 Expense logged: {category} - ${amount} - ID: {expense_id}")
        
        self._log_analytics_event(
            event_type='expense_logged',
            entity_id=expense_id,
            user_id=event.get('userId'),
            metadata=data
        )
        
        # Update financial statistics
        self._update_expense_statistics(event.get('userId'), category, amount)
    
    # ------------------------------------------------------------------------
    # Helper Methods
    # ------------------------------------------------------------------------
    
    def _log_analytics_event(self, event_type: str, entity_id: int, 
                            user_id: int, metadata: Dict[str, Any]) -> None:
        """Log event to analytics table for reporting"""
        if not self.db_conn:
            logger.warning("No database connection, skipping analytics logging")
            return
        
        try:
            cursor = self.db_conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS event_analytics (
                    id SERIAL PRIMARY KEY,
                    event_type VARCHAR(100) NOT NULL,
                    entity_id INTEGER,
                    user_id INTEGER,
                    metadata JSONB,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """)
            
            cursor.execute("""
                INSERT INTO event_analytics (event_type, entity_id, user_id, metadata)
                VALUES (%s, %s, %s, %s)
            """, (event_type, entity_id, user_id, json.dumps(metadata)))
            
            self.db_conn.commit()
            cursor.close()
        except Exception as e:
            logger.error(f"Error logging analytics event: {e}")
            self.db_conn.rollback()
    
    def _update_harvest_statistics(self, user_id: int, crop_type: str, quantity: float) -> None:
        """Update aggregate harvest statistics"""
        if not self.db_conn:
            return
        
        try:
            cursor = self.db_conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS harvest_statistics (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    crop_type VARCHAR(100) NOT NULL,
                    total_quantity DECIMAL(10, 2) DEFAULT 0,
                    harvest_count INTEGER DEFAULT 0,
                    last_harvest_date TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(user_id, crop_type)
                )
            """)
            
            cursor.execute("""
                INSERT INTO harvest_statistics (user_id, crop_type, total_quantity, harvest_count, last_harvest_date)
                VALUES (%s, %s, %s, 1, NOW())
                ON CONFLICT (user_id, crop_type)
                DO UPDATE SET
                    total_quantity = harvest_statistics.total_quantity + EXCLUDED.total_quantity,
                    harvest_count = harvest_statistics.harvest_count + 1,
                    last_harvest_date = NOW(),
                    updated_at = NOW()
            """, (user_id, crop_type, quantity))
            
            self.db_conn.commit()
            cursor.close()
            logger.info(f"Updated harvest statistics for user {user_id}, crop {crop_type}")
        except Exception as e:
            logger.error(f"Error updating harvest statistics: {e}")
            self.db_conn.rollback()
    
    def _update_expense_statistics(self, user_id: int, category: str, amount: float) -> None:
        """Update aggregate expense statistics"""
        if not self.db_conn:
            return
        
        try:
            cursor = self.db_conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS expense_statistics (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    category VARCHAR(100) NOT NULL,
                    total_amount DECIMAL(10, 2) DEFAULT 0,
                    expense_count INTEGER DEFAULT 0,
                    last_expense_date TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(user_id, category)
                )
            """)
            
            cursor.execute("""
                INSERT INTO expense_statistics (user_id, category, total_amount, expense_count, last_expense_date)
                VALUES (%s, %s, %s, 1, NOW())
                ON CONFLICT (user_id, category)
                DO UPDATE SET
                    total_amount = expense_statistics.total_amount + EXCLUDED.total_amount,
                    expense_count = expense_statistics.expense_count + 1,
                    last_expense_date = NOW(),
                    updated_at = NOW()
            """, (user_id, category, amount))
            
            self.db_conn.commit()
            cursor.close()
            logger.info(f"Updated expense statistics for user {user_id}, category {category}")
        except Exception as e:
            logger.error(f"Error updating expense statistics: {e}")
            self.db_conn.rollback()
    
    def close(self):
        """Close database connection"""
        if self.db_conn:
            self.db_conn.close()
            logger.info("Database connection closed")

# ============================================================================
# Consumer Service
# ============================================================================

class EventConsumerService:
    """Main event consumer service"""
    
    def __init__(self):
        self.consumer = None
        self.handlers = EventHandlers()
        self.running = False
    
    def start(self):
        """Start consuming events from Kafka"""
        logger.info("Starting Kafka Event Consumer Service...")
        logger.info(f"Kafka Brokers: {KAFKA_BROKERS}")
        logger.info(f"Consumer Group: {KAFKA_GROUP_ID}")
        logger.info(f"Topics: {TOPICS}")
        
        try:
            self.consumer = KafkaConsumer(
                *TOPICS,
                bootstrap_servers=KAFKA_BROKERS,
                group_id=KAFKA_GROUP_ID,
                value_deserializer=lambda m: json.loads(m.decode('utf-8')),
                auto_offset_reset='earliest',
                enable_auto_commit=True,
                max_poll_records=10,
            )
            
            logger.info("✅ Kafka consumer connected successfully")
            self.running = True
            
            # Start consuming messages
            for message in self.consumer:
                if not self.running:
                    break
                
                try:
                    event = message.value
                    logger.info(f"📨 Received event from topic {message.topic}: {event.get('eventType')}")
                    self.handlers.handle_event(event)
                except Exception as e:
                    logger.error(f"Error processing message: {e}")
                    # Continue processing other messages
            
        except Exception as e:
            logger.error(f"Fatal error in consumer: {e}")
            raise
        finally:
            self.stop()
    
    def stop(self):
        """Stop the consumer service"""
        logger.info("Stopping Kafka Event Consumer Service...")
        self.running = False
        
        if self.consumer:
            self.consumer.close()
            logger.info("Kafka consumer closed")
        
        self.handlers.close()
        logger.info("Event Consumer Service stopped")

# ============================================================================
# Signal Handlers
# ============================================================================

service = None

def signal_handler(signum, frame):
    """Handle shutdown signals"""
    logger.info(f"Received signal {signum}, shutting down...")
    if service:
        service.stop()
    sys.exit(0)

signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("Farmer Data Collection - Event Consumer Service")
    logger.info("=" * 60)
    
    service = EventConsumerService()
    
    try:
        service.start()
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    except Exception as e:
        logger.error(f"Service failed: {e}")
        sys.exit(1)
