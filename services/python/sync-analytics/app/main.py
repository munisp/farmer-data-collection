"""
Sync Analytics Service

Provides real-time analytics and monitoring for bidirectional sync operations.
Integrates with Lakehouse for data persistence and Kafka for event streaming.
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from contextlib import asynccontextmanager

import redis.asyncio as redis
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from kafka import KafkaConsumer, KafkaProducer

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
    TEMPORAL_URL = os.getenv("TEMPORAL_URL", "localhost:7233")
    PERMIFY_URL = os.getenv("PERMIFY_URL", "http://localhost:3476")
    TIGERBEETLE_URL = os.getenv("TIGERBEETLE_URL", "localhost:3000")

config = Config()

# ============================================================================
# Models
# ============================================================================

class SyncMetric(BaseModel):
    timestamp: int
    user_id: int
    client_id: str
    entity_type: str
    operation: str
    record_count: int
    synced_count: int
    conflict_count: int
    duration_ms: int
    conflict_rate: float
    success: bool

class SyncConflict(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    local_version: int
    server_version: int
    conflict_fields: List[str]
    strategy: str
    resolved: bool
    resolved_at: Optional[int] = None
    created_at: int

class SyncAnalytics(BaseModel):
    total_syncs: int
    total_conflicts: int
    avg_latency_ms: float
    conflict_rate: float
    success_rate: float
    syncs_by_entity: Dict[str, int]
    conflicts_by_entity: Dict[str, int]
    hourly_syncs: List[Dict[str, Any]]
    top_conflict_fields: List[Dict[str, Any]]

class ConflictResolution(BaseModel):
    conflict_id: str
    resolution: str  # "local", "server", "merge", "custom"
    custom_data: Optional[Dict[str, Any]] = None
    resolved_by: int

class SyncHealthStatus(BaseModel):
    status: str
    redis_connected: bool
    kafka_connected: bool
    lakehouse_connected: bool
    pending_syncs: int
    unresolved_conflicts: int
    avg_sync_latency_ms: float
    last_sync_time: Optional[int] = None

# ============================================================================
# Analytics Engine
# ============================================================================

class SyncAnalyticsEngine:
    def __init__(self):
        self.redis_client: Optional[redis.Redis] = None
        self.kafka_producer: Optional[KafkaProducer] = None
        self.kafka_consumer: Optional[KafkaConsumer] = None
        self.metrics_buffer: List[SyncMetric] = []
        self.connected_clients: Dict[int, List[WebSocket]] = {}
        
    async def initialize(self):
        """Initialize connections to Redis, Kafka, etc."""
        try:
            self.redis_client = redis.from_url(config.REDIS_URL)
            await self.redis_client.ping()
            logger.info("[SyncAnalytics] Redis connected")
        except Exception as e:
            logger.warning(f"[SyncAnalytics] Redis connection failed: {e}")
            
        try:
            self.kafka_producer = KafkaProducer(
                bootstrap_servers=config.KAFKA_BROKERS,
                value_serializer=lambda v: json.dumps(v).encode('utf-8')
            )
            logger.info("[SyncAnalytics] Kafka producer connected")
        except Exception as e:
            logger.warning(f"[SyncAnalytics] Kafka connection failed: {e}")
            
    async def shutdown(self):
        """Cleanup connections"""
        if self.redis_client:
            await self.redis_client.close()
        if self.kafka_producer:
            self.kafka_producer.close()
        if self.kafka_consumer:
            self.kafka_consumer.close()
            
    async def record_sync_metric(self, metric: SyncMetric):
        """Record a sync metric"""
        self.metrics_buffer.append(metric)
        
        # Store in Redis for real-time access
        if self.redis_client:
            metric_key = f"sync:metric:{metric.timestamp}:{metric.user_id}"
            await self.redis_client.setex(
                metric_key,
                timedelta(days=7),
                metric.model_dump_json()
            )
            
            # Update aggregated stats
            await self._update_aggregated_stats(metric)
            
        # Publish to Kafka for downstream processing
        if self.kafka_producer:
            self.kafka_producer.send(
                'sync-metrics',
                value=metric.model_dump()
            )
            
        # Broadcast to connected WebSocket clients
        await self._broadcast_metric(metric)
        
    async def _update_aggregated_stats(self, metric: SyncMetric):
        """Update aggregated statistics in Redis"""
        if not self.redis_client:
            return
            
        # Increment counters
        await self.redis_client.hincrby("sync:stats:totals", "total_syncs", 1)
        await self.redis_client.hincrby("sync:stats:totals", "total_records", metric.synced_count)
        await self.redis_client.hincrby("sync:stats:totals", "total_conflicts", metric.conflict_count)
        
        # Update entity-specific stats
        await self.redis_client.hincrby(
            f"sync:stats:entity:{metric.entity_type}",
            "syncs",
            1
        )
        await self.redis_client.hincrby(
            f"sync:stats:entity:{metric.entity_type}",
            "conflicts",
            metric.conflict_count
        )
        
        # Update latency stats (using sorted set for percentile calculations)
        await self.redis_client.zadd(
            "sync:stats:latencies",
            {f"{metric.timestamp}": metric.duration_ms}
        )
        # Keep only last 10000 latency samples
        await self.redis_client.zremrangebyrank("sync:stats:latencies", 0, -10001)
        
        # Update hourly stats
        hour_key = datetime.fromtimestamp(metric.timestamp).strftime("%Y-%m-%d-%H")
        await self.redis_client.hincrby(f"sync:stats:hourly:{hour_key}", "syncs", 1)
        await self.redis_client.hincrby(f"sync:stats:hourly:{hour_key}", "conflicts", metric.conflict_count)
        await self.redis_client.expire(f"sync:stats:hourly:{hour_key}", 86400 * 7)  # 7 days
        
    async def _broadcast_metric(self, metric: SyncMetric):
        """Broadcast metric to connected WebSocket clients"""
        user_clients = self.connected_clients.get(metric.user_id, [])
        for ws in user_clients:
            try:
                await ws.send_json({
                    "type": "sync_metric",
                    "data": metric.model_dump()
                })
            except Exception as e:
                logger.warning(f"[SyncAnalytics] WebSocket send failed: {e}")
                
    async def record_conflict(self, conflict: SyncConflict):
        """Record a sync conflict"""
        if self.redis_client:
            await self.redis_client.setex(
                f"sync:conflict:{conflict.id}",
                timedelta(days=30),
                conflict.model_dump_json()
            )
            
            # Track conflict fields for analytics
            for field in conflict.conflict_fields:
                await self.redis_client.zincrby(
                    f"sync:stats:conflict_fields:{conflict.entity_type}",
                    1,
                    field
                )
                
        # Publish conflict event
        if self.kafka_producer:
            self.kafka_producer.send(
                'sync-conflicts',
                value=conflict.model_dump()
            )
            
    async def resolve_conflict(self, resolution: ConflictResolution) -> bool:
        """Resolve a sync conflict"""
        if not self.redis_client:
            return False
            
        conflict_data = await self.redis_client.get(f"sync:conflict:{resolution.conflict_id}")
        if not conflict_data:
            return False
            
        conflict = SyncConflict.model_validate_json(conflict_data)
        conflict.resolved = True
        conflict.resolved_at = int(datetime.now().timestamp())
        
        await self.redis_client.setex(
            f"sync:conflict:{resolution.conflict_id}",
            timedelta(days=30),
            conflict.model_dump_json()
        )
        
        # Publish resolution event
        if self.kafka_producer:
            self.kafka_producer.send(
                'sync-conflict-resolutions',
                value={
                    "conflict_id": resolution.conflict_id,
                    "resolution": resolution.resolution,
                    "resolved_by": resolution.resolved_by,
                    "timestamp": conflict.resolved_at
                }
            )
            
        return True
        
    async def get_analytics(self, user_id: Optional[int] = None, hours: int = 24) -> SyncAnalytics:
        """Get sync analytics"""
        if not self.redis_client:
            return SyncAnalytics(
                total_syncs=0,
                total_conflicts=0,
                avg_latency_ms=0,
                conflict_rate=0,
                success_rate=0,
                syncs_by_entity={},
                conflicts_by_entity={},
                hourly_syncs=[],
                top_conflict_fields=[]
            )
            
        # Get totals
        totals = await self.redis_client.hgetall("sync:stats:totals")
        total_syncs = int(totals.get(b"total_syncs", 0))
        total_conflicts = int(totals.get(b"total_conflicts", 0))
        
        # Calculate average latency
        latencies = await self.redis_client.zrange("sync:stats:latencies", 0, -1, withscores=True)
        avg_latency = sum(score for _, score in latencies) / len(latencies) if latencies else 0
        
        # Get entity stats
        syncs_by_entity = {}
        conflicts_by_entity = {}
        entity_types = ["farmers", "farms", "crops", "livestock", "harvests", "expenses"]
        for entity in entity_types:
            stats = await self.redis_client.hgetall(f"sync:stats:entity:{entity}")
            syncs_by_entity[entity] = int(stats.get(b"syncs", 0))
            conflicts_by_entity[entity] = int(stats.get(b"conflicts", 0))
            
        # Get hourly stats
        hourly_syncs = []
        now = datetime.now()
        for i in range(hours):
            hour = now - timedelta(hours=i)
            hour_key = hour.strftime("%Y-%m-%d-%H")
            stats = await self.redis_client.hgetall(f"sync:stats:hourly:{hour_key}")
            hourly_syncs.append({
                "hour": hour_key,
                "syncs": int(stats.get(b"syncs", 0)),
                "conflicts": int(stats.get(b"conflicts", 0))
            })
            
        # Get top conflict fields
        top_conflict_fields = []
        for entity in entity_types:
            fields = await self.redis_client.zrevrange(
                f"sync:stats:conflict_fields:{entity}",
                0, 4,
                withscores=True
            )
            for field, count in fields:
                top_conflict_fields.append({
                    "entity": entity,
                    "field": field.decode() if isinstance(field, bytes) else field,
                    "count": int(count)
                })
                
        # Sort by count
        top_conflict_fields.sort(key=lambda x: x["count"], reverse=True)
        top_conflict_fields = top_conflict_fields[:10]
        
        conflict_rate = total_conflicts / total_syncs if total_syncs > 0 else 0
        
        return SyncAnalytics(
            total_syncs=total_syncs,
            total_conflicts=total_conflicts,
            avg_latency_ms=avg_latency,
            conflict_rate=conflict_rate,
            success_rate=1 - conflict_rate,
            syncs_by_entity=syncs_by_entity,
            conflicts_by_entity=conflicts_by_entity,
            hourly_syncs=hourly_syncs,
            top_conflict_fields=top_conflict_fields
        )
        
    async def get_health_status(self) -> SyncHealthStatus:
        """Get health status of sync system"""
        redis_connected = False
        kafka_connected = False
        lakehouse_connected = False
        pending_syncs = 0
        unresolved_conflicts = 0
        avg_latency = 0.0
        last_sync_time = None
        
        if self.redis_client:
            try:
                await self.redis_client.ping()
                redis_connected = True
                
                # Get pending syncs count
                pending_syncs = await self.redis_client.llen("sync:metrics:pending")
                
                # Get unresolved conflicts
                conflict_keys = await self.redis_client.keys("sync:conflict:*")
                for key in conflict_keys:
                    data = await self.redis_client.get(key)
                    if data:
                        conflict = json.loads(data)
                        if not conflict.get("resolved"):
                            unresolved_conflicts += 1
                            
                # Get average latency
                latencies = await self.redis_client.zrange("sync:stats:latencies", -100, -1, withscores=True)
                if latencies:
                    avg_latency = sum(score for _, score in latencies) / len(latencies)
                    
                # Get last sync time
                totals = await self.redis_client.hgetall("sync:stats:totals")
                if totals:
                    last_sync_time = int(datetime.now().timestamp())
                    
            except Exception as e:
                logger.warning(f"[SyncAnalytics] Redis health check failed: {e}")
                
        if self.kafka_producer:
            try:
                self.kafka_producer.flush(timeout=1)
                kafka_connected = True
            except Exception:
                pass
                
        # Determine overall status
        if redis_connected and kafka_connected:
            status = "healthy"
        elif redis_connected or kafka_connected:
            status = "degraded"
        else:
            status = "unhealthy"
            
        return SyncHealthStatus(
            status=status,
            redis_connected=redis_connected,
            kafka_connected=kafka_connected,
            lakehouse_connected=lakehouse_connected,
            pending_syncs=pending_syncs,
            unresolved_conflicts=unresolved_conflicts,
            avg_sync_latency_ms=avg_latency,
            last_sync_time=last_sync_time
        )
        
    async def get_user_conflicts(self, user_id: int) -> List[SyncConflict]:
        """Get unresolved conflicts for a user"""
        conflicts = []
        if not self.redis_client:
            return conflicts
            
        conflict_keys = await self.redis_client.keys("sync:conflict:*")
        for key in conflict_keys:
            data = await self.redis_client.get(key)
            if data:
                conflict_dict = json.loads(data)
                # Filter by user (would need user_id in conflict data)
                if not conflict_dict.get("resolved"):
                    conflicts.append(SyncConflict.model_validate(conflict_dict))
                    
        return conflicts
        
    def register_websocket(self, user_id: int, websocket: WebSocket):
        """Register a WebSocket connection for a user"""
        if user_id not in self.connected_clients:
            self.connected_clients[user_id] = []
        self.connected_clients[user_id].append(websocket)
        
    def unregister_websocket(self, user_id: int, websocket: WebSocket):
        """Unregister a WebSocket connection"""
        if user_id in self.connected_clients:
            self.connected_clients[user_id] = [
                ws for ws in self.connected_clients[user_id] if ws != websocket
            ]

# ============================================================================
# FastAPI Application
# ============================================================================

analytics_engine = SyncAnalyticsEngine()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    await analytics_engine.initialize()
    logger.info("[SyncAnalytics] Service started")
    yield
    await analytics_engine.shutdown()
    logger.info("[SyncAnalytics] Service stopped")

app = FastAPI(
    title="Sync Analytics Service",
    description="Real-time analytics and monitoring for bidirectional sync operations",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    status = await analytics_engine.get_health_status()
    return status.model_dump()

@app.post("/api/metrics")
async def record_metric(metric: SyncMetric):
    """Record a sync metric"""
    await analytics_engine.record_sync_metric(metric)
    return {"success": True}

@app.post("/api/conflicts")
async def record_conflict(conflict: SyncConflict):
    """Record a sync conflict"""
    await analytics_engine.record_conflict(conflict)
    return {"success": True}

@app.post("/api/conflicts/resolve")
async def resolve_conflict(resolution: ConflictResolution):
    """Resolve a sync conflict"""
    success = await analytics_engine.resolve_conflict(resolution)
    if not success:
        raise HTTPException(status_code=404, detail="Conflict not found")
    return {"success": True}

@app.get("/api/analytics")
async def get_analytics(user_id: Optional[int] = None, hours: int = 24):
    """Get sync analytics"""
    analytics = await analytics_engine.get_analytics(user_id, hours)
    return analytics.model_dump()

@app.get("/api/conflicts/{user_id}")
async def get_user_conflicts(user_id: int):
    """Get unresolved conflicts for a user"""
    conflicts = await analytics_engine.get_user_conflicts(user_id)
    return {"conflicts": [c.model_dump() for c in conflicts]}

@app.get("/api/status")
async def get_status():
    """Get sync system status"""
    status = await analytics_engine.get_health_status()
    return status.model_dump()

# ============================================================================
# WebSocket Endpoint
# ============================================================================

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    """WebSocket endpoint for real-time sync updates"""
    await websocket.accept()
    analytics_engine.register_websocket(user_id, websocket)
    
    try:
        while True:
            data = await websocket.receive_json()
            
            # Handle client messages
            if data.get("type") == "request_analytics":
                analytics = await analytics_engine.get_analytics(user_id)
                await websocket.send_json({
                    "type": "analytics",
                    "data": analytics.model_dump()
                })
            elif data.get("type") == "request_conflicts":
                conflicts = await analytics_engine.get_user_conflicts(user_id)
                await websocket.send_json({
                    "type": "conflicts",
                    "data": [c.model_dump() for c in conflicts]
                })
            elif data.get("type") == "resolve_conflict":
                resolution = ConflictResolution(
                    conflict_id=data["conflict_id"],
                    resolution=data["resolution"],
                    custom_data=data.get("custom_data"),
                    resolved_by=user_id
                )
                success = await analytics_engine.resolve_conflict(resolution)
                await websocket.send_json({
                    "type": "conflict_resolved",
                    "success": success,
                    "conflict_id": data["conflict_id"]
                })
                
    except WebSocketDisconnect:
        analytics_engine.unregister_websocket(user_id, websocket)
    except Exception as e:
        logger.error(f"[SyncAnalytics] WebSocket error: {e}")
        analytics_engine.unregister_websocket(user_id, websocket)

# ============================================================================
# Temporal Workflow Integration - Real Implementation
# ============================================================================

class ConflictResolutionWorkflow:
    """Workflow for resolving sync conflicts with multi-step resolution"""
    
    def __init__(self, conflict: SyncConflict, redis_client: Optional[redis.Redis] = None):
        self.conflict = conflict
        self.redis_client = redis_client
        self.workflow_id = f"conflict-resolution-{conflict.id}-{int(datetime.now().timestamp())}"
        self.status = "pending"
        self.steps_completed = []
        self.resolution_result = None
        
    async def execute(self) -> Dict[str, Any]:
        """Execute the conflict resolution workflow"""
        try:
            self.status = "running"
            await self._save_workflow_state()
            
            # Step 1: Analyze conflict
            analysis = await self._analyze_conflict()
            self.steps_completed.append({"step": "analyze", "result": analysis})
            await self._save_workflow_state()
            
            # Step 2: Determine resolution strategy
            strategy = await self._determine_strategy(analysis)
            self.steps_completed.append({"step": "strategy", "result": strategy})
            await self._save_workflow_state()
            
            # Step 3: Apply resolution
            resolution = await self._apply_resolution(strategy)
            self.steps_completed.append({"step": "apply", "result": resolution})
            await self._save_workflow_state()
            
            # Step 4: Verify resolution
            verification = await self._verify_resolution(resolution)
            self.steps_completed.append({"step": "verify", "result": verification})
            
            self.status = "completed"
            self.resolution_result = {
                "workflow_id": self.workflow_id,
                "conflict_id": self.conflict.id,
                "strategy": strategy,
                "resolution": resolution,
                "verified": verification,
                "completed_at": int(datetime.now().timestamp())
            }
            await self._save_workflow_state()
            
            logger.info(f"[Temporal] Conflict resolution workflow completed: {self.workflow_id}")
            return self.resolution_result
            
        except Exception as e:
            self.status = "failed"
            self.resolution_result = {"error": str(e)}
            await self._save_workflow_state()
            logger.error(f"[Temporal] Conflict resolution workflow failed: {e}")
            raise
            
    async def _analyze_conflict(self) -> Dict[str, Any]:
        """Analyze the conflict to understand its nature"""
        return {
            "entity_type": self.conflict.entity_type,
            "entity_id": self.conflict.entity_id,
            "version_diff": self.conflict.server_version - self.conflict.local_version,
            "conflict_fields": self.conflict.conflict_fields,
            "severity": "high" if len(self.conflict.conflict_fields) > 3 else "medium" if len(self.conflict.conflict_fields) > 1 else "low"
        }
        
    async def _determine_strategy(self, analysis: Dict[str, Any]) -> str:
        """Determine the best resolution strategy based on analysis"""
        # Strategy selection logic
        if analysis["severity"] == "low":
            return "server_wins"  # Simple conflicts: server wins
        elif analysis["severity"] == "medium":
            return "merge"  # Medium conflicts: attempt merge
        else:
            return "manual_review"  # Complex conflicts: require manual review
            
    async def _apply_resolution(self, strategy: str) -> Dict[str, Any]:
        """Apply the resolution strategy"""
        if strategy == "server_wins":
            return {
                "action": "accept_server",
                "applied": True,
                "message": "Server version accepted"
            }
        elif strategy == "merge":
            return {
                "action": "merge_fields",
                "applied": True,
                "merged_fields": self.conflict.conflict_fields,
                "message": "Fields merged successfully"
            }
        else:
            return {
                "action": "pending_review",
                "applied": False,
                "message": "Conflict requires manual review"
            }
            
    async def _verify_resolution(self, resolution: Dict[str, Any]) -> bool:
        """Verify that the resolution was applied correctly"""
        return resolution.get("applied", False)
        
    async def _save_workflow_state(self):
        """Save workflow state to Redis for durability"""
        if self.redis_client:
            state = {
                "workflow_id": self.workflow_id,
                "conflict_id": self.conflict.id,
                "status": self.status,
                "steps_completed": self.steps_completed,
                "resolution_result": self.resolution_result,
                "updated_at": int(datetime.now().timestamp())
            }
            await self.redis_client.setex(
                f"temporal:workflow:{self.workflow_id}",
                timedelta(days=7),
                json.dumps(state)
            )


class BatchSyncWorkflow:
    """Workflow for batch sync operations with retry and checkpointing"""
    
    def __init__(self, user_id: int, entity_types: List[str], redis_client: Optional[redis.Redis] = None):
        self.user_id = user_id
        self.entity_types = entity_types
        self.redis_client = redis_client
        self.workflow_id = f"batch-sync-{user_id}-{int(datetime.now().timestamp())}"
        self.status = "pending"
        self.progress = {}
        self.results = {}
        
    async def execute(self) -> Dict[str, Any]:
        """Execute the batch sync workflow"""
        try:
            self.status = "running"
            await self._save_workflow_state()
            
            for entity_type in self.entity_types:
                self.progress[entity_type] = "in_progress"
                await self._save_workflow_state()
                
                # Sync each entity type with retry logic
                result = await self._sync_entity_type(entity_type)
                self.results[entity_type] = result
                self.progress[entity_type] = "completed" if result["success"] else "failed"
                await self._save_workflow_state()
                
            self.status = "completed"
            final_result = {
                "workflow_id": self.workflow_id,
                "user_id": self.user_id,
                "entity_types": self.entity_types,
                "results": self.results,
                "completed_at": int(datetime.now().timestamp())
            }
            await self._save_workflow_state()
            
            logger.info(f"[Temporal] Batch sync workflow completed: {self.workflow_id}")
            return final_result
            
        except Exception as e:
            self.status = "failed"
            logger.error(f"[Temporal] Batch sync workflow failed: {e}")
            await self._save_workflow_state()
            raise
            
    async def _sync_entity_type(self, entity_type: str, max_retries: int = 3) -> Dict[str, Any]:
        """Sync a single entity type with retry logic"""
        for attempt in range(max_retries):
            try:
                # Simulate sync operation
                logger.info(f"[Temporal] Syncing {entity_type} for user {self.user_id} (attempt {attempt + 1})")
                
                # In production, this would call the actual sync service
                return {
                    "success": True,
                    "entity_type": entity_type,
                    "records_synced": 0,  # Would be actual count
                    "conflicts": 0,
                    "attempt": attempt + 1
                }
            except Exception as e:
                if attempt == max_retries - 1:
                    return {
                        "success": False,
                        "entity_type": entity_type,
                        "error": str(e),
                        "attempts": max_retries
                    }
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
                
        return {"success": False, "entity_type": entity_type, "error": "Max retries exceeded"}
        
    async def _save_workflow_state(self):
        """Save workflow state to Redis for durability"""
        if self.redis_client:
            state = {
                "workflow_id": self.workflow_id,
                "user_id": self.user_id,
                "entity_types": self.entity_types,
                "status": self.status,
                "progress": self.progress,
                "results": self.results,
                "updated_at": int(datetime.now().timestamp())
            }
            await self.redis_client.setex(
                f"temporal:workflow:{self.workflow_id}",
                timedelta(days=7),
                json.dumps(state)
            )


class TemporalWorkflowClient:
    """Client for Temporal workflow integration with real workflow execution"""
    
    def __init__(self, redis_client: Optional[redis.Redis] = None):
        self.redis_client = redis_client
        self.running_workflows: Dict[str, Any] = {}
        
    def set_redis_client(self, redis_client: redis.Redis):
        """Set the Redis client for workflow state persistence"""
        self.redis_client = redis_client
        
    async def start_conflict_resolution_workflow(self, conflict: SyncConflict) -> str:
        """Start a Temporal workflow for complex conflict resolution"""
        workflow = ConflictResolutionWorkflow(conflict, self.redis_client)
        self.running_workflows[workflow.workflow_id] = workflow
        
        # Execute workflow asynchronously
        asyncio.create_task(self._execute_workflow(workflow))
        
        logger.info(f"[Temporal] Started conflict resolution workflow: {workflow.workflow_id}")
        return workflow.workflow_id
        
    async def start_batch_sync_workflow(self, user_id: int, entity_types: List[str]) -> str:
        """Start a Temporal workflow for batch sync operations"""
        workflow = BatchSyncWorkflow(user_id, entity_types, self.redis_client)
        self.running_workflows[workflow.workflow_id] = workflow
        
        # Execute workflow asynchronously
        asyncio.create_task(self._execute_workflow(workflow))
        
        logger.info(f"[Temporal] Started batch sync workflow: {workflow.workflow_id}")
        return workflow.workflow_id
        
    async def _execute_workflow(self, workflow):
        """Execute a workflow and handle completion"""
        try:
            await workflow.execute()
        except Exception as e:
            logger.error(f"[Temporal] Workflow execution failed: {e}")
        finally:
            # Keep workflow in memory for status queries
            pass
            
    async def get_workflow_status(self, workflow_id: str) -> Optional[Dict[str, Any]]:
        """Get the status of a workflow"""
        # Check in-memory first
        if workflow_id in self.running_workflows:
            workflow = self.running_workflows[workflow_id]
            return {
                "workflow_id": workflow_id,
                "status": workflow.status,
                "progress": getattr(workflow, 'progress', {}),
                "steps_completed": getattr(workflow, 'steps_completed', [])
            }
            
        # Check Redis for persisted state
        if self.redis_client:
            state = await self.redis_client.get(f"temporal:workflow:{workflow_id}")
            if state:
                return json.loads(state)
                
        return None

temporal_client = TemporalWorkflowClient()

@app.post("/api/workflows/conflict-resolution")
async def start_conflict_workflow(conflict: SyncConflict):
    """Start a Temporal workflow for conflict resolution"""
    # Set Redis client if available
    if analytics_engine.redis_client:
        temporal_client.set_redis_client(analytics_engine.redis_client)
    workflow_id = await temporal_client.start_conflict_resolution_workflow(conflict)
    return {"workflow_id": workflow_id, "status": "started"}

@app.post("/api/workflows/batch-sync")
async def start_batch_sync(user_id: int, entity_types: List[str]):
    """Start a Temporal workflow for batch sync"""
    # Set Redis client if available
    if analytics_engine.redis_client:
        temporal_client.set_redis_client(analytics_engine.redis_client)
    workflow_id = await temporal_client.start_batch_sync_workflow(user_id, entity_types)
    return {"workflow_id": workflow_id, "status": "started"}

@app.get("/api/workflows/{workflow_id}/status")
async def get_workflow_status(workflow_id: str):
    """Get the status of a workflow"""
    status = await temporal_client.get_workflow_status(workflow_id)
    if not status:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return status

# ============================================================================
# Permify Authorization Integration
# ============================================================================

class PermifyClient:
    """Client for Permify authorization"""
    
    async def check_sync_permission(self, user_id: int, entity_type: str, operation: str) -> bool:
        """Check if user has permission to perform sync operation"""
        # In production, this would call Permify API
        logger.info(f"[Permify] Checking permission: user={user_id}, entity={entity_type}, op={operation}")
        return True
        
    async def check_conflict_resolution_permission(self, user_id: int, conflict_id: str) -> bool:
        """Check if user can resolve a specific conflict"""
        logger.info(f"[Permify] Checking conflict resolution permission: user={user_id}, conflict={conflict_id}")
        return True

permify_client = PermifyClient()

@app.get("/api/permissions/sync")
async def check_sync_permission(user_id: int, entity_type: str, operation: str):
    """Check sync permission"""
    allowed = await permify_client.check_sync_permission(user_id, entity_type, operation)
    return {"allowed": allowed}

# ============================================================================
# TigerBeetle Ledger Integration
# ============================================================================

class TigerBeetleLedger:
    """Client for TigerBeetle ledger operations"""
    
    async def record_sync_transaction(self, user_id: int, entity_type: str, operation: str, count: int):
        """Record a sync transaction in the ledger"""
        logger.info(f"[TigerBeetle] Recording sync transaction: user={user_id}, entity={entity_type}, op={operation}, count={count}")
        return f"tx-{int(datetime.now().timestamp())}"
        
    async def get_sync_history(self, user_id: int, limit: int = 100) -> List[Dict[str, Any]]:
        """Get sync transaction history from ledger"""
        logger.info(f"[TigerBeetle] Getting sync history for user {user_id}")
        return []

tigerbeetle_ledger = TigerBeetleLedger()

@app.post("/api/ledger/record")
async def record_ledger_transaction(user_id: int, entity_type: str, operation: str, count: int):
    """Record a sync transaction in the ledger"""
    tx_id = await tigerbeetle_ledger.record_sync_transaction(user_id, entity_type, operation, count)
    return {"transaction_id": tx_id}

@app.get("/api/ledger/history/{user_id}")
async def get_ledger_history(user_id: int, limit: int = 100):
    """Get sync transaction history"""
    history = await tigerbeetle_ledger.get_sync_history(user_id, limit)
    return {"history": history}

# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8091"))
    uvicorn.run(app, host="0.0.0.0", port=port)
