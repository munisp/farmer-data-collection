#!/usr/bin/env python3
"""
Notification Service - SMS, Voice, Email, and Push notifications
"""

import os
import json
import logging
from datetime import datetime
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager
from enum import Enum

from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, EmailStr, Field
from pydantic_settings import BaseSettings
import psycopg2
from psycopg2.extras import RealDictCursor
import redis
from kafka import KafkaConsumer, KafkaProducer
import africastalking
from prometheus_client import Counter, generate_latest, CONTENT_TYPE_LATEST
from fastapi.responses import Response
import requests

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Prometheus metrics
NOTIFICATION_COUNT = Counter('notifications_sent_total', 'Total notifications sent', ['channel', 'status'])

# Configuration
class Settings(BaseSettings):
    port: int = 8083
    database_url: str = "postgresql://postgres:postgres@localhost:5432/farmer_db"
    redis_url: str = "redis://localhost:6379"
    kafka_brokers: str = "localhost:9092"
    
    # Africa's Talking
    at_username: str = "sandbox"
    at_api_key: str = ""
    at_sender_id: str = "FARMER"
    
    # Email (SMTP)
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@farmerplatform.com"
    
    class Config:
        env_file = ".env"

settings = Settings()

# Enums
class NotificationChannel(str, Enum):
    SMS = "sms"
    VOICE = "voice"
    EMAIL = "email"
    PUSH = "push"

class NotificationStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    DELIVERED = "delivered"

# Models
class NotificationRequest(BaseModel):
    recipient: str  # phone number or email
    channel: NotificationChannel
    subject: Optional[str] = None
    message: str
    metadata: Optional[Dict[str, Any]] = None

class NotificationResponse(BaseModel):
    id: str
    status: NotificationStatus
    channel: NotificationChannel
    recipient: str
    message: str
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None

class BulkNotificationRequest(BaseModel):
    recipients: List[str]
    channel: NotificationChannel
    subject: Optional[str] = None
    message: str
    metadata: Optional[Dict[str, Any]] = None

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
            CREATE TABLE IF NOT EXISTS notifications (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                recipient VARCHAR(255) NOT NULL,
                channel VARCHAR(50) NOT NULL,
                subject VARCHAR(500),
                message TEXT NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                metadata JSONB,
                sent_at TIMESTAMP,
                delivered_at TIMESTAMP,
                error_message TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            
            CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient);
            CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
            CREATE INDEX IF NOT EXISTS idx_notifications_channel ON notifications(channel);
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

# Africa's Talking client
class AfricasTalkingClient:
    def __init__(self):
        if settings.at_api_key:
            africastalking.initialize(settings.at_username, settings.at_api_key)
            self.sms = africastalking.SMS
            self.voice = africastalking.Voice
            self.enabled = True
            logger.info("Africa's Talking initialized")
        else:
            self.enabled = False
            logger.warning("Africa's Talking not configured")
    
    def send_sms(self, recipient: str, message: str) -> Dict:
        if not self.enabled:
            logger.warning("SMS sending disabled - no API key")
            return {"status": "failed", "error": "Not configured"}
        
        try:
            response = self.sms.send(message, [recipient], settings.at_sender_id)
            logger.info(f"SMS sent to {recipient}: {response}")
            return {"status": "sent", "response": response}
        except Exception as e:
            logger.error(f"SMS error: {e}")
            return {"status": "failed", "error": str(e)}
    
    def make_call(self, recipient: str, message: str) -> Dict:
        if not self.enabled:
            logger.warning("Voice calling disabled - no API key")
            return {"status": "failed", "error": "Not configured"}
        
        try:
            # In production, this would use a TTS service or pre-recorded message
            response = self.voice.call(settings.at_sender_id, [recipient])
            logger.info(f"Call initiated to {recipient}: {response}")
            return {"status": "sent", "response": response}
        except Exception as e:
            logger.error(f"Voice call error: {e}")
            return {"status": "failed", "error": str(e)}

# Email client
class EmailClient:
    def __init__(self):
        self.enabled = bool(settings.smtp_user and settings.smtp_password)
        if not self.enabled:
            logger.warning("Email not configured")
    
    def send_email(self, recipient: str, subject: str, message: str) -> Dict:
        if not self.enabled:
            logger.warning("Email sending disabled - no SMTP credentials")
            return {"status": "failed", "error": "Not configured"}
        
        try:
            # In production, use proper SMTP library
            import smtplib
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart
            
            msg = MIMEMultipart()
            msg['From'] = settings.smtp_from
            msg['To'] = recipient
            msg['Subject'] = subject
            msg.attach(MIMEText(message, 'plain'))
            
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
                server.starttls()
                server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
            
            logger.info(f"Email sent to {recipient}")
            return {"status": "sent"}
        except Exception as e:
            logger.error(f"Email error: {e}")
            return {"status": "failed", "error": str(e)}

# Kafka consumer for event-driven notifications
class NotificationConsumer:
    def __init__(self, db: Database, at_client: AfricasTalkingClient, email_client: EmailClient):
        self.db = db
        self.at_client = at_client
        self.email_client = email_client
        
        try:
            self.consumer = KafkaConsumer(
                'farmer.events',
                'auth.events',
                bootstrap_servers=settings.kafka_brokers.split(','),
                value_deserializer=lambda m: json.loads(m.decode('utf-8')),
                group_id='notification-service'
            )
            logger.info("Kafka consumer initialized")
        except Exception as e:
            logger.warning(f"Failed to initialize Kafka consumer: {e}")
            self.consumer = None
    
    def start(self):
        if not self.consumer:
            return
        
        logger.info("Starting notification consumer")
        for message in self.consumer:
            try:
                event = message.value
                self.process_event(event)
            except Exception as e:
                logger.error(f"Event processing error: {e}")
    
    def process_event(self, event: Dict):
        """Process events and send appropriate notifications"""
        event_type = event.get('type')
        
        # Example: Send welcome SMS when user registers
        if event_type == 'user.registered':
            # Get user phone from database
            cursor = self.db.get_cursor()
            cursor.execute("SELECT phone FROM farmers WHERE user_id = %s", (event.get('user_id'),))
            result = cursor.fetchone()
            cursor.close()
            
            if result and result['phone']:
                message = f"Welcome to Farmer Platform! Your account has been created successfully."
                self.at_client.send_sms(result['phone'], message)
        
        # Example: Send harvest reminder
        elif event_type == 'crop.planted':
            # Calculate expected harvest date and schedule reminder
            pass

# Global instances
db = Database()
at_client = AfricasTalkingClient()
email_client = EmailClient()

# Lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting notification service")
    yield
    logger.info("Shutting down notification service")
    db.close()

# FastAPI app
app = FastAPI(
    title="Notification Service",
    description="Multi-channel notification service (SMS, Voice, Email, Push)",
    version="1.0.0",
    lifespan=lifespan
)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "notification"}

@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.post("/api/v1/notifications/send", response_model=NotificationResponse)
async def send_notification(request: NotificationRequest, background_tasks: BackgroundTasks):
    """Send a single notification"""
    
    try:
        # Save to database
        cursor = db.get_cursor()
        cursor.execute("""
            INSERT INTO notifications (recipient, channel, subject, message, metadata, status)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, created_at
        """, (request.recipient, request.channel.value, request.subject, request.message,
              json.dumps(request.metadata) if request.metadata else None, NotificationStatus.PENDING.value))
        
        result = cursor.fetchone()
        notification_id = result['id']
        created_at = result['created_at']
        
        db.conn.commit()
        cursor.close()
        
        # Send notification in background
        background_tasks.add_task(
            _send_notification,
            notification_id,
            request.channel,
            request.recipient,
            request.subject,
            request.message
        )
        
        return NotificationResponse(
            id=notification_id,
            status=NotificationStatus.PENDING,
            channel=request.channel,
            recipient=request.recipient,
            message=request.message,
            sent_at=None,
            delivered_at=None
        )
        
    except Exception as e:
        logger.error(f"Notification creation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/notifications/bulk")
async def send_bulk_notifications(request: BulkNotificationRequest, background_tasks: BackgroundTasks):
    """Send notifications to multiple recipients"""
    
    notification_ids = []
    
    try:
        for recipient in request.recipients:
            cursor = db.get_cursor()
            cursor.execute("""
                INSERT INTO notifications (recipient, channel, subject, message, metadata, status)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (recipient, request.channel.value, request.subject, request.message,
                  json.dumps(request.metadata) if request.metadata else None, NotificationStatus.PENDING.value))
            
            result = cursor.fetchone()
            notification_ids.append(result['id'])
            
            db.conn.commit()
            cursor.close()
            
            # Send in background
            background_tasks.add_task(
                _send_notification,
                result['id'],
                request.channel,
                recipient,
                request.subject,
                request.message
            )
        
        return {
            "message": f"Queued {len(notification_ids)} notifications",
            "notification_ids": notification_ids
        }
        
    except Exception as e:
        logger.error(f"Bulk notification error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/notifications/{notification_id}", response_model=NotificationResponse)
async def get_notification(notification_id: str):
    """Get notification status"""
    
    try:
        cursor = db.get_cursor()
        cursor.execute("""
            SELECT id, recipient, channel, subject, message, status, sent_at, delivered_at
            FROM notifications
            WHERE id = %s
        """, (notification_id,))
        
        result = cursor.fetchone()
        cursor.close()
        
        if not result:
            raise HTTPException(status_code=404, detail="Notification not found")
        
        return NotificationResponse(
            id=result['id'],
            status=NotificationStatus(result['status']),
            channel=NotificationChannel(result['channel']),
            recipient=result['recipient'],
            message=result['message'],
            sent_at=result['sent_at'],
            delivered_at=result['delivered_at']
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get notification error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/notifications")
async def list_notifications(
    recipient: Optional[str] = None,
    channel: Optional[NotificationChannel] = None,
    status: Optional[NotificationStatus] = None,
    limit: int = 100
):
    """List notifications with filters"""
    
    try:
        query = "SELECT * FROM notifications WHERE 1=1"
        params = []
        
        if recipient:
            query += " AND recipient = %s"
            params.append(recipient)
        
        if channel:
            query += " AND channel = %s"
            params.append(channel.value)
        
        if status:
            query += " AND status = %s"
            params.append(status.value)
        
        query += " ORDER BY created_at DESC LIMIT %s"
        params.append(limit)
        
        cursor = db.get_cursor()
        cursor.execute(query, params)
        results = cursor.fetchall()
        cursor.close()
        
        return [dict(row) for row in results]
        
    except Exception as e:
        logger.error(f"List notifications error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Background task to actually send notifications
def _send_notification(notification_id: str, channel: NotificationChannel, recipient: str, subject: Optional[str], message: str):
    """Send notification via appropriate channel"""
    
    try:
        result = None
        
        if channel == NotificationChannel.SMS:
            result = at_client.send_sms(recipient, message)
        elif channel == NotificationChannel.VOICE:
            result = at_client.make_call(recipient, message)
        elif channel == NotificationChannel.EMAIL:
            result = email_client.send_email(recipient, subject or "Notification", message)
        elif channel == NotificationChannel.PUSH:
            # Implement push notification logic
            result = {"status": "sent"}
        
        # Update database
        cursor = db.get_cursor()
        if result and result.get('status') == 'sent':
            cursor.execute("""
                UPDATE notifications
                SET status = %s, sent_at = NOW(), updated_at = NOW()
                WHERE id = %s
            """, (NotificationStatus.SENT.value, notification_id))
            NOTIFICATION_COUNT.labels(channel=channel.value, status='sent').inc()
        else:
            error_msg = result.get('error', 'Unknown error') if result else 'Unknown error'
            cursor.execute("""
                UPDATE notifications
                SET status = %s, error_message = %s, updated_at = NOW()
                WHERE id = %s
            """, (NotificationStatus.FAILED.value, error_msg, notification_id))
            NOTIFICATION_COUNT.labels(channel=channel.value, status='failed').inc()
        
        db.conn.commit()
        cursor.close()
        
    except Exception as e:
        logger.error(f"Send notification error: {e}")
        NOTIFICATION_COUNT.labels(channel=channel.value, status='failed').inc()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.port)
