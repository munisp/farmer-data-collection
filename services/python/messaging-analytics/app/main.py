"""
Messaging Analytics Service

Python service for USSD/SMS/WhatsApp analytics:
- Message delivery analytics and reporting
- Channel performance metrics aggregation
- Drop-off funnel analysis for USSD
- Provider health monitoring
- Real-time dashboards via WebSocket
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from enum import Enum
from collections import defaultdict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import redis.asyncio as redis
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
import httpx

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# Configuration
# ============================================================================

class Config:
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
    KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "localhost:9092").split(",")
    LAKEHOUSE_URL = os.getenv("LAKEHOUSE_URL", "http://localhost:8085")
    PORT = int(os.getenv("MESSAGING_ANALYTICS_PORT", "8092"))

config = Config()

# ============================================================================
# Types
# ============================================================================

class MessageChannel(str, Enum):
    SMS = "sms"
    WHATSAPP = "whatsapp"
    USSD = "ussd"

class MessageStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    READ = "read"

class MessageDirection(str, Enum):
    OUTBOUND = "outbound"
    INBOUND = "inbound"

# ============================================================================
# Pydantic Models
# ============================================================================

class MessageEvent(BaseModel):
    id: str
    channel: MessageChannel
    direction: MessageDirection
    phone_number: str
    user_id: Optional[int] = None
    provider: str
    status: MessageStatus
    content: Optional[str] = None
    template_id: Optional[str] = None
    external_id: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    timestamp: datetime
    checksum: Optional[str] = None

class USSDSessionEvent(BaseModel):
    session_id: str
    phone_number: str
    service_code: str
    step: str
    input: Optional[str] = None
    response: Optional[str] = None
    is_completed: bool = False
    action: Optional[str] = None
    duration_ms: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None
    timestamp: datetime

class ProviderHealthEvent(BaseModel):
    provider: str
    channel: str
    is_healthy: bool
    consecutive_failures: int
    last_success_at: Optional[datetime] = None
    last_failure_at: Optional[datetime] = None
    total_sent: int = 0
    total_failed: int = 0
    timestamp: datetime

class ChannelMetrics(BaseModel):
    channel: MessageChannel
    total_sent: int = 0
    total_delivered: int = 0
    total_failed: int = 0
    total_inbound: int = 0
    delivery_rate: float = 0.0
    avg_latency_ms: float = 0.0
    provider_breakdown: Dict[str, int] = {}
    hourly_volume: Dict[int, int] = {}
    timestamp: datetime

class USSDFunnelMetrics(BaseModel):
    total_sessions: int = 0
    completed_sessions: int = 0
    completion_rate: float = 0.0
    avg_duration_ms: float = 0.0
    step_counts: Dict[str, int] = {}
    drop_off_rates: Dict[str, float] = {}
    action_breakdown: Dict[str, int] = {}
    timestamp: datetime

class AnalyticsQuery(BaseModel):
    channel: Optional[MessageChannel] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    provider: Optional[str] = None
    group_by: Optional[str] = "hour"  # hour, day, week

# ============================================================================
# Analytics Engine
# ============================================================================

class MessagingAnalyticsEngine:
    def __init__(self):
        self.redis_client: Optional[redis.Redis] = None
        self.kafka_consumer: Optional[AIOKafkaConsumer] = None
        self.kafka_producer: Optional[AIOKafkaProducer] = None
        
        # In-memory metrics (also persisted to Redis)
        self.message_counts: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self.provider_counts: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self.ussd_steps: Dict[str, int] = defaultdict(int)
        self.ussd_completions: Dict[str, int] = defaultdict(int)
        self.latencies: List[float] = []
        self.provider_health: Dict[str, ProviderHealthEvent] = {}
        
        # WebSocket connections
        self.websocket_clients: List[WebSocket] = []

    async def start(self):
        """Initialize connections and start consumers"""
        # Connect to Redis
        self.redis_client = redis.from_url(config.REDIS_URL)
        logger.info("Connected to Redis")
        
        # Initialize Kafka consumer
        try:
            self.kafka_consumer = AIOKafkaConsumer(
                "sms-events", "whatsapp-events", "ussd-events", "provider-health",
                bootstrap_servers=config.KAFKA_BROKERS,
                group_id="messaging-analytics",
                value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            )
            await self.kafka_consumer.start()
            logger.info("Kafka consumer started")
            
            # Start consuming in background
            asyncio.create_task(self.consume_events())
        except Exception as e:
            logger.warning(f"Kafka not available: {e}")
        
        # Initialize Kafka producer
        try:
            self.kafka_producer = AIOKafkaProducer(
                bootstrap_servers=config.KAFKA_BROKERS,
                value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
            )
            await self.kafka_producer.start()
            logger.info("Kafka producer started")
        except Exception as e:
            logger.warning(f"Kafka producer not available: {e}")
        
        # Load cached metrics from Redis
        await self.load_cached_metrics()
        
        # Start periodic tasks
        asyncio.create_task(self.periodic_metrics_aggregation())
        asyncio.create_task(self.periodic_lakehouse_sync())

    async def stop(self):
        """Cleanup connections"""
        if self.kafka_consumer:
            await self.kafka_consumer.stop()
        if self.kafka_producer:
            await self.kafka_producer.stop()
        if self.redis_client:
            await self.redis_client.close()

    async def consume_events(self):
        """Consume events from Kafka topics"""
        try:
            async for msg in self.kafka_consumer:
                topic = msg.topic
                data = msg.value
                
                if topic == "sms-events":
                    await self.process_message_event(data, MessageChannel.SMS)
                elif topic == "whatsapp-events":
                    await self.process_message_event(data, MessageChannel.WHATSAPP)
                elif topic == "ussd-events":
                    await self.process_ussd_event(data)
                elif topic == "provider-health":
                    await self.process_provider_health(data)
                    
        except Exception as e:
            logger.error(f"Kafka consumer error: {e}")

    async def process_message_event(self, data: Dict, channel: MessageChannel):
        """Process SMS/WhatsApp message event"""
        try:
            status = data.get("status", "unknown")
            provider = data.get("provider", "unknown")
            direction = data.get("direction", "outbound")
            
            # Update counts
            self.message_counts[channel.value][status] += 1
            self.provider_counts[channel.value][provider] += 1
            
            # Cache in Redis
            await self.cache_message_event(data, channel)
            
            # Broadcast to WebSocket clients
            await self.broadcast_event({
                "type": f"{channel.value}_event",
                "data": data
            })
            
            logger.info(f"Processed {channel.value} event: {data.get('id')} -> {status}")
            
        except Exception as e:
            logger.error(f"Error processing message event: {e}")

    async def process_ussd_event(self, data: Dict):
        """Process USSD session event"""
        try:
            step = data.get("step", "unknown")
            is_completed = data.get("isCompleted", False)
            action = data.get("action", "unknown")
            duration = data.get("durationMs", 0)
            
            # Update step counts
            self.ussd_steps[step] += 1
            
            # Update completion counts
            if is_completed:
                self.ussd_completions[action] += 1
                if duration > 0:
                    self.latencies.append(duration)
            
            # Cache in Redis
            await self.cache_ussd_event(data)
            
            # Broadcast to WebSocket clients
            await self.broadcast_event({
                "type": "ussd_event",
                "data": data
            })
            
            logger.info(f"Processed USSD event: {data.get('sessionId')} step={step}")
            
        except Exception as e:
            logger.error(f"Error processing USSD event: {e}")

    async def process_provider_health(self, data: Dict):
        """Process provider health event"""
        try:
            provider = data.get("provider", "unknown")
            channel = data.get("channel", "unknown")
            key = f"{channel}:{provider}"
            
            self.provider_health[key] = ProviderHealthEvent(**data)
            
            # Cache in Redis
            await self.redis_client.set(
                f"analytics:provider_health:{key}",
                json.dumps(data, default=str),
                ex=3600
            )
            
            # Broadcast to WebSocket clients
            await self.broadcast_event({
                "type": "provider_health",
                "data": data
            })
            
            logger.info(f"Processed provider health: {key} healthy={data.get('isHealthy')}")
            
        except Exception as e:
            logger.error(f"Error processing provider health: {e}")

    # ========================================================================
    # Caching
    # ========================================================================

    async def cache_message_event(self, data: Dict, channel: MessageChannel):
        """Cache message event in Redis"""
        event_id = data.get("id", "unknown")
        key = f"analytics:message:{channel.value}:{event_id}"
        await self.redis_client.set(key, json.dumps(data, default=str), ex=86400)
        
        # Add to time-series sorted set
        timestamp = datetime.fromisoformat(data.get("timestamp", datetime.now().isoformat()).replace("Z", "+00:00"))
        await self.redis_client.zadd(
            f"analytics:messages:{channel.value}",
            {event_id: timestamp.timestamp()}
        )

    async def cache_ussd_event(self, data: Dict):
        """Cache USSD event in Redis"""
        session_id = data.get("sessionId", "unknown")
        key = f"analytics:ussd:{session_id}"
        await self.redis_client.set(key, json.dumps(data, default=str), ex=3600)

    async def load_cached_metrics(self):
        """Load cached metrics from Redis on startup"""
        try:
            # Load message counts
            for channel in ["sms", "whatsapp"]:
                data = await self.redis_client.get(f"analytics:counts:{channel}")
                if data:
                    self.message_counts[channel] = json.loads(data)
            
            # Load USSD metrics
            ussd_data = await self.redis_client.get("analytics:ussd_steps")
            if ussd_data:
                self.ussd_steps = json.loads(ussd_data)
                
            logger.info("Loaded cached metrics from Redis")
        except Exception as e:
            logger.warning(f"Could not load cached metrics: {e}")

    async def save_metrics_to_redis(self):
        """Persist current metrics to Redis"""
        try:
            for channel in ["sms", "whatsapp"]:
                await self.redis_client.set(
                    f"analytics:counts:{channel}",
                    json.dumps(dict(self.message_counts[channel])),
                    ex=86400
                )
            
            await self.redis_client.set(
                "analytics:ussd_steps",
                json.dumps(dict(self.ussd_steps)),
                ex=86400
            )
            
            await self.redis_client.set(
                "analytics:ussd_completions",
                json.dumps(dict(self.ussd_completions)),
                ex=86400
            )
        except Exception as e:
            logger.error(f"Error saving metrics to Redis: {e}")

    # ========================================================================
    # Analytics Queries
    # ========================================================================

    async def get_channel_metrics(self, channel: MessageChannel) -> ChannelMetrics:
        """Get metrics for a specific channel"""
        counts = self.message_counts.get(channel.value, {})
        providers = self.provider_counts.get(channel.value, {})
        
        total_sent = counts.get("sent", 0) + counts.get("delivered", 0) + counts.get("read", 0)
        total_delivered = counts.get("delivered", 0) + counts.get("read", 0)
        total_failed = counts.get("failed", 0)
        
        delivery_rate = (total_delivered / total_sent * 100) if total_sent > 0 else 0.0
        avg_latency = sum(self.latencies[-100:]) / len(self.latencies[-100:]) if self.latencies else 0.0
        
        return ChannelMetrics(
            channel=channel,
            total_sent=total_sent,
            total_delivered=total_delivered,
            total_failed=total_failed,
            total_inbound=counts.get("inbound", 0),
            delivery_rate=round(delivery_rate, 2),
            avg_latency_ms=round(avg_latency, 2),
            provider_breakdown=dict(providers),
            hourly_volume={},  # Would be populated from time-series data
            timestamp=datetime.now()
        )

    async def get_ussd_funnel_metrics(self) -> USSDFunnelMetrics:
        """Get USSD funnel analytics"""
        total_sessions = sum(self.ussd_steps.values())
        completed_sessions = sum(self.ussd_completions.values())
        
        completion_rate = (completed_sessions / total_sessions * 100) if total_sessions > 0 else 0.0
        avg_duration = sum(self.latencies[-100:]) / len(self.latencies[-100:]) if self.latencies else 0.0
        
        # Calculate drop-off rates
        steps_order = ["main_menu", "register_name", "register_location", "register_farm_size", "register_crops", "register_confirm"]
        drop_off_rates = {}
        
        for i, step in enumerate(steps_order[:-1]):
            current_count = self.ussd_steps.get(step, 0)
            next_count = self.ussd_steps.get(steps_order[i + 1], 0)
            if current_count > 0:
                drop_off_rates[step] = round((1 - next_count / current_count) * 100, 2)
        
        return USSDFunnelMetrics(
            total_sessions=total_sessions,
            completed_sessions=completed_sessions,
            completion_rate=round(completion_rate, 2),
            avg_duration_ms=round(avg_duration, 2),
            step_counts=dict(self.ussd_steps),
            drop_off_rates=drop_off_rates,
            action_breakdown=dict(self.ussd_completions),
            timestamp=datetime.now()
        )

    async def get_provider_health_summary(self) -> List[ProviderHealthEvent]:
        """Get health status for all providers"""
        return list(self.provider_health.values())

    async def get_delivery_report(
        self,
        channel: Optional[MessageChannel] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        provider: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate delivery report"""
        channels = [channel] if channel else [MessageChannel.SMS, MessageChannel.WHATSAPP]
        
        report = {
            "period": {
                "start": start_date.isoformat() if start_date else None,
                "end": end_date.isoformat() if end_date else None,
            },
            "channels": {},
            "summary": {
                "total_sent": 0,
                "total_delivered": 0,
                "total_failed": 0,
                "overall_delivery_rate": 0.0,
            },
            "generated_at": datetime.now().isoformat()
        }
        
        for ch in channels:
            metrics = await self.get_channel_metrics(ch)
            report["channels"][ch.value] = {
                "sent": metrics.total_sent,
                "delivered": metrics.total_delivered,
                "failed": metrics.total_failed,
                "delivery_rate": metrics.delivery_rate,
                "providers": metrics.provider_breakdown,
            }
            report["summary"]["total_sent"] += metrics.total_sent
            report["summary"]["total_delivered"] += metrics.total_delivered
            report["summary"]["total_failed"] += metrics.total_failed
        
        if report["summary"]["total_sent"] > 0:
            report["summary"]["overall_delivery_rate"] = round(
                report["summary"]["total_delivered"] / report["summary"]["total_sent"] * 100, 2
            )
        
        return report

    # ========================================================================
    # Periodic Tasks
    # ========================================================================

    async def periodic_metrics_aggregation(self):
        """Aggregate metrics every minute"""
        while True:
            await asyncio.sleep(60)
            try:
                await self.save_metrics_to_redis()
                logger.info("Metrics aggregated and saved to Redis")
            except Exception as e:
                logger.error(f"Metrics aggregation error: {e}")

    async def periodic_lakehouse_sync(self):
        """Sync analytics to Lakehouse every 5 minutes"""
        while True:
            await asyncio.sleep(300)
            try:
                await self.sync_to_lakehouse()
                logger.info("Analytics synced to Lakehouse")
            except Exception as e:
                logger.error(f"Lakehouse sync error: {e}")

    async def sync_to_lakehouse(self):
        """Send aggregated analytics to Lakehouse"""
        try:
            async with httpx.AsyncClient() as client:
                # Sync SMS metrics
                sms_metrics = await self.get_channel_metrics(MessageChannel.SMS)
                await client.post(
                    f"{config.LAKEHOUSE_URL}/api/analytics/messaging",
                    json={"channel": "sms", "metrics": sms_metrics.dict()}
                )
                
                # Sync WhatsApp metrics
                wa_metrics = await self.get_channel_metrics(MessageChannel.WHATSAPP)
                await client.post(
                    f"{config.LAKEHOUSE_URL}/api/analytics/messaging",
                    json={"channel": "whatsapp", "metrics": wa_metrics.dict()}
                )
                
                # Sync USSD funnel
                ussd_metrics = await self.get_ussd_funnel_metrics()
                await client.post(
                    f"{config.LAKEHOUSE_URL}/api/analytics/ussd",
                    json=ussd_metrics.dict()
                )
        except Exception as e:
            logger.warning(f"Could not sync to Lakehouse: {e}")

    # ========================================================================
    # WebSocket Broadcasting
    # ========================================================================

    async def broadcast_event(self, event: Dict):
        """Broadcast event to all connected WebSocket clients"""
        disconnected = []
        for ws in self.websocket_clients:
            try:
                await ws.send_json(event)
            except Exception:
                disconnected.append(ws)
        
        for ws in disconnected:
            self.websocket_clients.remove(ws)

    def register_websocket(self, ws: WebSocket):
        """Register a new WebSocket client"""
        self.websocket_clients.append(ws)

    def unregister_websocket(self, ws: WebSocket):
        """Unregister a WebSocket client"""
        if ws in self.websocket_clients:
            self.websocket_clients.remove(ws)


# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(
    title="Messaging Analytics Service",
    description="Analytics for USSD/SMS/WhatsApp messaging channels",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global analytics engine
analytics_engine: Optional[MessagingAnalyticsEngine] = None

@app.on_event("startup")
async def startup():
    global analytics_engine
    analytics_engine = MessagingAnalyticsEngine()
    await analytics_engine.start()
    logger.info("Messaging Analytics Service started")

@app.on_event("shutdown")
async def shutdown():
    if analytics_engine:
        await analytics_engine.stop()
    logger.info("Messaging Analytics Service stopped")

# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "messaging-analytics",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/analytics/sms")
async def get_sms_metrics():
    """Get SMS channel metrics"""
    return await analytics_engine.get_channel_metrics(MessageChannel.SMS)

@app.get("/api/analytics/whatsapp")
async def get_whatsapp_metrics():
    """Get WhatsApp channel metrics"""
    return await analytics_engine.get_channel_metrics(MessageChannel.WHATSAPP)

@app.get("/api/analytics/ussd")
async def get_ussd_metrics():
    """Get USSD funnel metrics"""
    return await analytics_engine.get_ussd_funnel_metrics()

@app.get("/api/analytics/providers")
async def get_provider_health():
    """Get provider health summary"""
    return await analytics_engine.get_provider_health_summary()

@app.get("/api/analytics/report")
async def get_delivery_report(
    channel: Optional[MessageChannel] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    provider: Optional[str] = Query(None)
):
    """Generate delivery report"""
    return await analytics_engine.get_delivery_report(
        channel=channel,
        start_date=start_date,
        end_date=end_date,
        provider=provider
    )

@app.post("/api/analytics/event/sms")
async def record_sms_event(event: MessageEvent):
    """Record SMS event (for direct API calls)"""
    await analytics_engine.process_message_event(event.dict(), MessageChannel.SMS)
    return {"success": True, "event_id": event.id}

@app.post("/api/analytics/event/whatsapp")
async def record_whatsapp_event(event: MessageEvent):
    """Record WhatsApp event (for direct API calls)"""
    await analytics_engine.process_message_event(event.dict(), MessageChannel.WHATSAPP)
    return {"success": True, "event_id": event.id}

@app.post("/api/analytics/event/ussd")
async def record_ussd_event(event: USSDSessionEvent):
    """Record USSD event (for direct API calls)"""
    await analytics_engine.process_ussd_event(event.dict())
    return {"success": True, "session_id": event.session_id}

@app.websocket("/ws/analytics")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for real-time analytics updates"""
    await websocket.accept()
    analytics_engine.register_websocket(websocket)
    
    try:
        # Send initial metrics
        await websocket.send_json({
            "type": "initial_metrics",
            "data": {
                "sms": (await analytics_engine.get_channel_metrics(MessageChannel.SMS)).dict(),
                "whatsapp": (await analytics_engine.get_channel_metrics(MessageChannel.WHATSAPP)).dict(),
                "ussd": (await analytics_engine.get_ussd_funnel_metrics()).dict(),
            }
        })
        
        # Keep connection alive
        while True:
            data = await websocket.receive_text()
            # Handle client messages if needed
            
    except WebSocketDisconnect:
        analytics_engine.unregister_websocket(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        analytics_engine.unregister_websocket(websocket)


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=config.PORT)
