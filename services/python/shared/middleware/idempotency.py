"""
Idempotency Service for Ag-Fintech Platform
Provides idempotent operation handling using Redis
"""

import hashlib
import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Optional
import redis


@dataclass
class IdempotencyResult:
    """Result of an idempotent operation"""
    key: str
    status: str  # "new", "processing", "completed", "failed"
    result: Optional[Any] = None
    error: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "status": self.status,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "IdempotencyResult":
        return cls(
            key=data["key"],
            status=data["status"],
            result=data.get("result"),
            error=data.get("error"),
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=datetime.fromisoformat(data["updated_at"]),
        )


def generate_key(prefix: str, *identifiers) -> str:
    """Generate a deterministic idempotency key from business identifiers"""
    data = f"{prefix}:" + ":".join(str(id) for id in identifiers)
    hash_bytes = hashlib.sha256(data.encode()).digest()
    return hash_bytes[:16].hex()  # Use first 16 bytes for shorter key


def generate_transfer_id(farmer_id: int, entity_type: str, entity_id: int, sequence: int) -> int:
    """Generate a deterministic transfer ID for TigerBeetle"""
    key = f"transfer:{farmer_id}:{entity_type}:{entity_id}:{sequence}"
    hash_bytes = hashlib.sha256(key.encode()).digest()
    # Use first 8 bytes as uint64
    return int.from_bytes(hash_bytes[:8], byteorder='big')


def generate_account_id(farmer_id: int, account_type: int) -> int:
    """Generate a deterministic account ID for TigerBeetle"""
    return farmer_id * 10000 + account_type


class IdempotencyService:
    """Provides idempotent operation handling"""

    def __init__(self, redis_client: redis.Redis, ttl: timedelta = timedelta(hours=24)):
        self.redis = redis_client
        self.ttl = ttl

    def _get_key(self, key: str) -> str:
        return f"idempotency:{key}"

    def try_acquire(self, key: str) -> tuple[bool, Optional[IdempotencyResult]]:
        """
        Attempt to acquire an idempotency lock.
        Returns (is_new, existing_result)
        """
        idemp_key = self._get_key(key)

        # Try to get existing result
        existing = self.redis.get(idemp_key)
        if existing:
            result = IdempotencyResult.from_dict(json.loads(existing))
            return False, result

        # Key doesn't exist - try to acquire lock with SETNX
        now = datetime.utcnow()
        new_result = IdempotencyResult(
            key=key,
            status="processing",
            created_at=now,
            updated_at=now,
        )
        data = json.dumps(new_result.to_dict())

        # Use SETNX to atomically set if not exists
        success = self.redis.setnx(idemp_key, data)
        if success:
            self.redis.expire(idemp_key, int(self.ttl.total_seconds()))
            return True, None

        # Another process acquired the lock - get their result
        existing = self.redis.get(idemp_key)
        if existing:
            result = IdempotencyResult.from_dict(json.loads(existing))
            return False, result

        return False, None

    def complete(self, key: str, result: Any) -> None:
        """Mark an idempotent operation as completed with result"""
        idemp_key = self._get_key(key)

        completed_result = IdempotencyResult(
            key=key,
            status="completed",
            result=result,
            updated_at=datetime.utcnow(),
        )
        data = json.dumps(completed_result.to_dict())
        self.redis.setex(idemp_key, int(self.ttl.total_seconds()), data)

    def fail(self, key: str, error_msg: str) -> None:
        """Mark an idempotent operation as failed"""
        idemp_key = self._get_key(key)

        failed_result = IdempotencyResult(
            key=key,
            status="failed",
            error=error_msg,
            updated_at=datetime.utcnow(),
        )
        data = json.dumps(failed_result.to_dict())
        self.redis.setex(idemp_key, int(self.ttl.total_seconds()), data)

    def release(self, key: str) -> None:
        """Release an idempotency lock (for cleanup on error before completion)"""
        idemp_key = self._get_key(key)
        self.redis.delete(idemp_key)


class ProcessedEventsTracker:
    """Tracks processed Kafka/Fluvio events for exactly-once semantics"""

    def __init__(self, redis_client: redis.Redis, ttl: timedelta = timedelta(days=7)):
        self.redis = redis_client
        self.ttl = ttl

    def _get_key(self, event_id: str) -> str:
        return f"processed_event:{event_id}"

    def is_processed(self, event_id: str) -> bool:
        """Check if an event has already been processed"""
        key = self._get_key(event_id)
        return self.redis.exists(key) > 0

    def mark_processed(self, event_id: str) -> None:
        """Mark an event as processed"""
        key = self._get_key(event_id)
        self.redis.setex(key, int(self.ttl.total_seconds()), int(time.time()))


class DistributedLock:
    """Provides distributed locking for non-atomic operations"""

    def __init__(self, redis_client: redis.Redis, resource: str, ttl: timedelta):
        self.redis = redis_client
        self.key = f"lock:{resource}"
        self.value = f"{time.time_ns()}-{time.time_ns() % 1000000}"
        self.ttl = ttl

    def acquire(self) -> bool:
        """Attempt to acquire the lock"""
        return bool(self.redis.set(
            self.key,
            self.value,
            nx=True,
            px=int(self.ttl.total_seconds() * 1000)
        ))

    def release(self) -> bool:
        """Release the lock (only if we own it)"""
        script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
        """
        return bool(self.redis.eval(script, 1, self.key, self.value))

    def extend(self, ttl: timedelta) -> bool:
        """Extend the lock TTL (for long-running operations)"""
        script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("pexpire", KEYS[1], ARGV[2])
        else
            return 0
        end
        """
        return bool(self.redis.eval(script, 1, self.key, self.value, int(ttl.total_seconds() * 1000)))

    def __enter__(self):
        if not self.acquire():
            raise RuntimeError(f"Failed to acquire lock: {self.key}")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()
        return False
