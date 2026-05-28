"""
Kafka Event Streaming Service
Full message broker implementation with topic management, consumer groups,
offset tracking, dead letter queues, and optional integration with a real
Apache Kafka cluster via confluent-kafka or aiokafka.
"""
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, List
import uvicorn
import os
import json
import logging
import asyncio
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from threading import Lock

logging.basicConfig(level=logging.INFO, format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}')
log = logging.getLogger("kafka-service")

app = FastAPI(title="Kafka Event Streaming Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "")
DATABASE_URL = os.getenv("DATABASE_URL", "")
MAX_MESSAGES_PER_TOPIC = int(os.getenv("MAX_MESSAGES_PER_TOPIC", "100000"))
DLQ_MAX_RETRIES = int(os.getenv("DLQ_MAX_RETRIES", "3"))

# --- Storage ---
db_pool = None

async def get_db():
    global db_pool
    if db_pool is not None:
        return db_pool
    if DATABASE_URL:
        try:
            import asyncpg
            db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
            await db_pool.execute("""
                CREATE TABLE IF NOT EXISTS kafka_topics (
                    name VARCHAR(255) PRIMARY KEY,
                    partitions INT DEFAULT 1,
                    replication_factor INT DEFAULT 1,
                    retention_ms BIGINT DEFAULT 604800000,
                    config JSONB DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS kafka_messages (
                    id BIGSERIAL PRIMARY KEY,
                    topic VARCHAR(255) NOT NULL,
                    partition_id INT DEFAULT 0,
                    key VARCHAR(255),
                    value JSONB NOT NULL,
                    headers JSONB DEFAULT '{}'::jsonb,
                    timestamp_ms BIGINT NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS kafka_consumer_offsets (
                    group_id VARCHAR(255) NOT NULL,
                    topic VARCHAR(255) NOT NULL,
                    partition_id INT DEFAULT 0,
                    committed_offset BIGINT DEFAULT 0,
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    PRIMARY KEY (group_id, topic, partition_id)
                );
                CREATE TABLE IF NOT EXISTS kafka_dlq (
                    id BIGSERIAL PRIMARY KEY,
                    original_topic VARCHAR(255) NOT NULL,
                    key VARCHAR(255),
                    value JSONB NOT NULL,
                    error_message TEXT,
                    retry_count INT DEFAULT 0,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_kafka_msg_topic ON kafka_messages(topic, id);
                CREATE INDEX IF NOT EXISTS idx_kafka_msg_key ON kafka_messages(topic, key);
            """)
            log.info("PostgreSQL Kafka tables initialized")
            return db_pool
        except Exception as e:
            log.warning(f"PostgreSQL unavailable: {e}")
    return None

# In-memory storage
topics: Dict[str, dict] = {}
messages: Dict[str, list] = defaultdict(list)
consumer_offsets: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
dlq: list = []
msg_lock = Lock()
stats = {"total_produced": 0, "total_consumed": 0, "total_dlq": 0}

# Default topics for FarmConnect
DEFAULT_TOPICS = [
    "farmer-events", "farm-events", "marketplace-events", "order-events",
    "payment-events", "delivery-events", "notification-events", "weather-alerts",
    "moderation-events", "kyc-events", "loan-events", "insurance-events",
    "cooperative-events", "exchange-events", "aggregation-events",
    "cold-chain-events", "traceability-events", "sms-events",
    "audit-events", "analytics-events",
]

# --- Kafka cluster integration ---
kafka_producer = None
kafka_admin = None

async def init_kafka_client():
    global kafka_producer, kafka_admin
    if not KAFKA_BOOTSTRAP_SERVERS:
        return False
    try:
        from aiokafka import AIOKafkaProducer
        from aiokafka.admin import AIOKafkaAdminClient, NewTopic
        kafka_producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode('utf-8'),
            key_serializer=lambda k: k.encode('utf-8') if k else None,
            acks='all',
            retries=3,
            linger_ms=10,
            compression_type='gzip',
        )
        await kafka_producer.start()
        log.info(f"Connected to Kafka cluster: {KAFKA_BOOTSTRAP_SERVERS}")
        return True
    except Exception as e:
        log.warning(f"Kafka cluster unavailable: {e}")
        kafka_producer = None
        return False


# --- Models ---
class ProduceRequest(BaseModel):
    topic: str
    key: Optional[str] = None
    value: dict
    headers: Optional[Dict[str, str]] = {}
    partition: Optional[int] = None

class ProduceBatchRequest(BaseModel):
    messages: List[ProduceRequest]

class ConsumeRequest(BaseModel):
    topic: str
    group_id: str
    max_messages: int = 10
    timeout_ms: int = 5000

class TopicCreate(BaseModel):
    name: str
    partitions: int = 1
    replication_factor: int = 1
    retention_ms: int = 604800000
    config: Optional[Dict] = {}

class CommitOffsetRequest(BaseModel):
    group_id: str
    topic: str
    partition: int = 0
    offset: int


# --- Endpoints ---
@app.on_event("startup")
async def startup():
    pool = await get_db()
    kafka_connected = await init_kafka_client()
    # Create default topics
    for topic_name in DEFAULT_TOPICS:
        if pool:
            try:
                await pool.execute(
                    "INSERT INTO kafka_topics (name) VALUES ($1) ON CONFLICT DO NOTHING", topic_name
                )
            except Exception:
                pass
        else:
            if topic_name not in topics:
                topics[topic_name] = {"partitions": 3, "replication_factor": 1, "retention_ms": 604800000, "config": {}}
    mode = "kafka-cluster" if kafka_connected else ("postgresql" if pool else "in-memory")
    log.info(f"Kafka service started in {mode} mode with {len(DEFAULT_TOPICS)} default topics")


@app.get("/health")
async def health():
    pool = await get_db()
    kafka_status = "not_configured"
    if KAFKA_BOOTSTRAP_SERVERS:
        kafka_status = "connected" if kafka_producer else "disconnected"
    topic_count = len(topics)
    if pool:
        topic_count = await pool.fetchval("SELECT COUNT(*) FROM kafka_topics")
    return {
        "status": "healthy",
        "service": "kafka-streaming",
        "mode": "kafka-cluster" if kafka_producer else ("postgresql" if pool else "in-memory"),
        "kafka_cluster": kafka_status,
        "storage": "postgresql" if pool else "in-memory",
        "topics": topic_count,
        "stats": stats,
        "features": ["produce", "consume", "consumer_groups", "offset_tracking", "dlq", "batch_produce", "topic_management"],
    }


@app.post("/topics")
async def create_topic(request: TopicCreate):
    pool = await get_db()
    if pool:
        await pool.execute(
            "INSERT INTO kafka_topics (name, partitions, replication_factor, retention_ms, config) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (name) DO UPDATE SET partitions=$2, config=$5",
            request.name, request.partitions, request.replication_factor, request.retention_ms, json.dumps(request.config or {})
        )
    else:
        topics[request.name] = {
            "partitions": request.partitions, "replication_factor": request.replication_factor,
            "retention_ms": request.retention_ms, "config": request.config or {}
        }
    log.info(f"Topic created: {request.name}")
    return {"success": True, "topic": request.name}


@app.get("/topics")
async def list_topics():
    pool = await get_db()
    if pool:
        rows = await pool.fetch("SELECT * FROM kafka_topics ORDER BY name")
        return {"topics": [dict(r) for r in rows], "count": len(rows)}
    return {
        "topics": [{"name": name, **config} for name, config in topics.items()],
        "count": len(topics),
    }


@app.get("/topics/{topic}")
async def get_topic(topic: str):
    pool = await get_db()
    if pool:
        row = await pool.fetchrow("SELECT * FROM kafka_topics WHERE name = $1", topic)
        if not row:
            raise HTTPException(status_code=404, detail="Topic not found")
        msg_count = await pool.fetchval("SELECT COUNT(*) FROM kafka_messages WHERE topic = $1", topic)
        return {**dict(row), "message_count": msg_count}
    if topic not in topics:
        raise HTTPException(status_code=404, detail="Topic not found")
    return {"name": topic, **topics[topic], "message_count": len(messages.get(topic, []))}


@app.delete("/topics/{topic}")
async def delete_topic(topic: str):
    pool = await get_db()
    if pool:
        await pool.execute("DELETE FROM kafka_messages WHERE topic = $1", topic)
        await pool.execute("DELETE FROM kafka_consumer_offsets WHERE topic = $1", topic)
        await pool.execute("DELETE FROM kafka_topics WHERE name = $1", topic)
    else:
        topics.pop(topic, None)
        messages.pop(topic, None)
    return {"success": True, "topic": topic}


@app.post("/produce")
async def produce(request: ProduceRequest):
    pool = await get_db()
    ts = int(time.time() * 1000)

    # Try real Kafka first
    if kafka_producer:
        try:
            result = await kafka_producer.send_and_wait(
                request.topic,
                value=request.value,
                key=request.key,
                partition=request.partition,
                headers=[(k, v.encode()) for k, v in (request.headers or {}).items()],
            )
            stats["total_produced"] += 1
            return {"success": True, "source": "kafka", "topic": request.topic,
                    "partition": result.partition, "offset": result.offset}
        except Exception as e:
            log.warning(f"Kafka produce failed, falling back: {e}")

    msg_id = str(uuid.uuid4())
    if pool:
        row = await pool.fetchrow(
            "INSERT INTO kafka_messages (topic, partition_id, key, value, headers, timestamp_ms) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
            request.topic, request.partition or 0, request.key, json.dumps(request.value),
            json.dumps(request.headers or {}), ts
        )
        offset = row["id"]
    else:
        with msg_lock:
            msg = {"id": msg_id, "topic": request.topic, "key": request.key, "value": request.value,
                   "headers": request.headers or {}, "timestamp": ts, "partition": request.partition or 0}
            messages[request.topic].append(msg)
            offset = len(messages[request.topic]) - 1
            if len(messages[request.topic]) > MAX_MESSAGES_PER_TOPIC:
                messages[request.topic] = messages[request.topic][-MAX_MESSAGES_PER_TOPIC:]

    stats["total_produced"] += 1
    return {"success": True, "source": "local", "topic": request.topic, "offset": offset, "timestamp": ts}


@app.post("/produce-batch")
async def produce_batch(request: ProduceBatchRequest):
    results = []
    for msg in request.messages:
        try:
            result = await produce(msg)
            results.append({"topic": msg.topic, "key": msg.key, "success": True, "offset": result.get("offset")})
        except Exception as e:
            results.append({"topic": msg.topic, "key": msg.key, "success": False, "error": str(e)})
    return {"results": results, "total": len(results), "success": sum(1 for r in results if r["success"])}


@app.post("/consume")
async def consume(request: ConsumeRequest):
    pool = await get_db()
    current_offset = 0

    if pool:
        row = await pool.fetchrow(
            "SELECT committed_offset FROM kafka_consumer_offsets WHERE group_id=$1 AND topic=$2 AND partition_id=0",
            request.group_id, request.topic
        )
        current_offset = row["committed_offset"] if row else 0
        rows = await pool.fetch(
            "SELECT * FROM kafka_messages WHERE topic=$1 AND id > $2 ORDER BY id LIMIT $3",
            request.topic, current_offset, request.max_messages
        )
        consumed = []
        for r in rows:
            consumed.append({
                "offset": r["id"], "key": r["key"], "value": json.loads(r["value"]) if isinstance(r["value"], str) else r["value"],
                "headers": json.loads(r["headers"]) if isinstance(r["headers"], str) else r["headers"],
                "timestamp": r["timestamp_ms"], "partition": r["partition_id"],
            })
        new_offset = consumed[-1]["offset"] if consumed else current_offset
        # Auto-commit
        await pool.execute(
            "INSERT INTO kafka_consumer_offsets (group_id, topic, partition_id, committed_offset) VALUES ($1,$2,0,$3) ON CONFLICT (group_id, topic, partition_id) DO UPDATE SET committed_offset=$3, updated_at=NOW()",
            request.group_id, request.topic, new_offset
        )
    else:
        offset_key = f"{request.group_id}:{request.topic}"
        current_offset = consumer_offsets[request.group_id][request.topic]
        topic_msgs = messages.get(request.topic, [])
        consumed = []
        for i in range(current_offset, min(current_offset + request.max_messages, len(topic_msgs))):
            msg = topic_msgs[i]
            consumed.append({"offset": i, **msg})
        new_offset = current_offset + len(consumed)
        consumer_offsets[request.group_id][request.topic] = new_offset

    stats["total_consumed"] += len(consumed)
    return {"messages": consumed, "count": len(consumed), "group_id": request.group_id, "topic": request.topic, "next_offset": new_offset}


@app.post("/commit-offset")
async def commit_offset(request: CommitOffsetRequest):
    pool = await get_db()
    if pool:
        await pool.execute(
            "INSERT INTO kafka_consumer_offsets (group_id, topic, partition_id, committed_offset) VALUES ($1,$2,$3,$4) ON CONFLICT (group_id, topic, partition_id) DO UPDATE SET committed_offset=$4, updated_at=NOW()",
            request.group_id, request.topic, request.partition, request.offset
        )
    else:
        consumer_offsets[request.group_id][request.topic] = request.offset
    return {"success": True}


@app.get("/consumer-groups")
async def list_consumer_groups():
    pool = await get_db()
    if pool:
        rows = await pool.fetch("SELECT DISTINCT group_id FROM kafka_consumer_offsets ORDER BY group_id")
        groups = []
        for r in rows:
            offsets = await pool.fetch("SELECT * FROM kafka_consumer_offsets WHERE group_id = $1", r["group_id"])
            groups.append({"group_id": r["group_id"], "offsets": [dict(o) for o in offsets]})
        return {"groups": groups, "count": len(groups)}
    groups = []
    for gid, topic_offsets in consumer_offsets.items():
        groups.append({"group_id": gid, "offsets": dict(topic_offsets)})
    return {"groups": groups, "count": len(groups)}


# --- Dead Letter Queue ---
@app.post("/dlq")
async def send_to_dlq(topic: str, key: Optional[str] = None, value: dict = {}, error: str = ""):
    pool = await get_db()
    if pool:
        await pool.execute(
            "INSERT INTO kafka_dlq (original_topic, key, value, error_message) VALUES ($1,$2,$3,$4)",
            topic, key, json.dumps(value), error
        )
    else:
        dlq.append({"topic": topic, "key": key, "value": value, "error": error,
                     "retry_count": 0, "ts": datetime.now(timezone.utc).isoformat()})
    stats["total_dlq"] += 1
    return {"success": True}


@app.get("/dlq")
async def get_dlq(limit: int = 50):
    pool = await get_db()
    if pool:
        rows = await pool.fetch("SELECT * FROM kafka_dlq ORDER BY created_at DESC LIMIT $1", limit)
        return {"messages": [dict(r) for r in rows], "count": len(rows)}
    return {"messages": dlq[-limit:], "count": len(dlq)}


@app.post("/dlq/{msg_id}/retry")
async def retry_dlq(msg_id: int):
    pool = await get_db()
    if pool:
        row = await pool.fetchrow("SELECT * FROM kafka_dlq WHERE id = $1", msg_id)
        if not row:
            raise HTTPException(status_code=404, detail="DLQ message not found")
        if row["retry_count"] >= DLQ_MAX_RETRIES:
            raise HTTPException(status_code=400, detail="Max retries exceeded")
        await pool.execute(
            "INSERT INTO kafka_messages (topic, key, value, headers, timestamp_ms) VALUES ($1,$2,$3,'{}',$4)",
            row["original_topic"], row["key"], row["value"], int(time.time() * 1000)
        )
        await pool.execute("UPDATE kafka_dlq SET retry_count = retry_count + 1 WHERE id = $1", msg_id)
        return {"success": True, "retry_count": row["retry_count"] + 1}
    raise HTTPException(status_code=400, detail="DLQ retry requires PostgreSQL storage")


@app.get("/stats")
async def get_stats():
    pool = await get_db()
    if pool:
        total_msgs = await pool.fetchval("SELECT COUNT(*) FROM kafka_messages")
        total_topics = await pool.fetchval("SELECT COUNT(*) FROM kafka_topics")
        total_groups = await pool.fetchval("SELECT COUNT(DISTINCT group_id) FROM kafka_consumer_offsets")
        total_dlq = await pool.fetchval("SELECT COUNT(*) FROM kafka_dlq")
        return {
            "total_messages": total_msgs, "total_topics": total_topics,
            "consumer_groups": total_groups, "dlq_messages": total_dlq,
            "stats": stats,
        }
    return {
        "total_messages": sum(len(m) for m in messages.values()),
        "total_topics": len(topics),
        "consumer_groups": len(consumer_offsets),
        "dlq_messages": len(dlq),
        "stats": stats,
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", "9092"))
    uvicorn.run(app, host="0.0.0.0", port=port)
