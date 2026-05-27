"""
Redis Client for Ag-Fintech Platform
Provides caching, rate limiting, and session management
"""

import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, Optional, TypeVar

import redis

from .idempotency import generate_key

logger = logging.getLogger(__name__)

T = TypeVar("T")


class CacheService:
    """Provides Redis caching with idempotency support"""

    def __init__(self, redis_url: str, default_ttl: timedelta = timedelta(minutes=5)):
        self.redis = redis.from_url(redis_url)
        self.default_ttl = default_ttl

    def get(self, key: str) -> Optional[Any]:
        """Retrieve a value from cache"""
        try:
            val = self.redis.get(key)
            if val is None:
                return None
            return json.loads(val)
        except Exception as e:
            logger.error(f"[Cache] Error getting key {key}: {e}")
            return None

    def set(self, key: str, value: Any, ttl: Optional[timedelta] = None) -> None:
        """Store a value in cache with TTL"""
        try:
            data = json.dumps(value)
            expiry = ttl or self.default_ttl
            self.redis.setex(key, int(expiry.total_seconds()), data)
        except Exception as e:
            logger.error(f"[Cache] Error setting key {key}: {e}")

    def delete(self, key: str) -> None:
        """Remove a key from cache"""
        try:
            self.redis.delete(key)
        except Exception as e:
            logger.error(f"[Cache] Error deleting key {key}: {e}")

    def delete_pattern(self, pattern: str) -> int:
        """Remove all keys matching a pattern"""
        try:
            keys = self.redis.keys(pattern)
            if keys:
                deleted = self.redis.delete(*keys)
                logger.info(f"[Cache] Deleted {deleted} keys matching pattern: {pattern}")
                return deleted
            return 0
        except Exception as e:
            logger.error(f"[Cache] Error deleting pattern {pattern}: {e}")
            return 0

    def exists(self, key: str) -> bool:
        """Check if a key exists"""
        try:
            return self.redis.exists(key) > 0
        except Exception as e:
            logger.error(f"[Cache] Error checking key {key}: {e}")
            return False

    def get_or_set(
        self,
        key: str,
        fetcher: Callable[[], T],
        ttl: Optional[timedelta] = None,
    ) -> T:
        """Retrieve from cache or compute and cache the value"""
        # Try to get from cache
        cached = self.get(key)
        if cached is not None:
            logger.info(f"[Cache] HIT: {key}")
            return cached

        # Cache miss - fetch data
        logger.info(f"[Cache] MISS: {key}")
        data = fetcher()

        # Store in cache
        self.set(key, data, ttl)

        return data

    def incr(self, key: str) -> int:
        """Increment a counter"""
        try:
            return self.redis.incr(key)
        except Exception as e:
            logger.error(f"[Cache] Error incrementing key {key}: {e}")
            return 0

    def decr(self, key: str) -> int:
        """Decrement a counter"""
        try:
            return self.redis.decr(key)
        except Exception as e:
            logger.error(f"[Cache] Error decrementing key {key}: {e}")
            return 0

    def expire(self, key: str, ttl: timedelta) -> None:
        """Set expiration on a key"""
        try:
            self.redis.expire(key, int(ttl.total_seconds()))
        except Exception as e:
            logger.error(f"[Cache] Error setting expiration on key {key}: {e}")

    def get_stats(self) -> Dict[str, Any]:
        """Return cache statistics"""
        try:
            info = self.redis.info("stats")
            dbsize = self.redis.dbsize()
            return {
                "keys": dbsize,
                "hits": info.get("keyspace_hits", 0),
                "misses": info.get("keyspace_misses", 0),
            }
        except Exception as e:
            logger.error(f"[Cache] Error getting stats: {e}")
            return {"keys": 0, "hits": 0, "misses": 0}

    def get_client(self) -> redis.Redis:
        """Return the underlying Redis client"""
        return self.redis

    def close(self) -> None:
        """Close the Redis connection"""
        self.redis.close()


class RateLimiter:
    """Provides rate limiting using Redis"""

    def __init__(
        self,
        cache: CacheService,
        max_requests: int,
        window: timedelta,
    ):
        self.cache = cache
        self.max_requests = max_requests
        self.window = window

    def allow(self, identifier: str) -> tuple[bool, int]:
        """
        Check if a request is allowed under rate limiting.
        Returns (allowed, remaining_requests)
        """
        key = f"ratelimit:{identifier}"

        # Increment counter
        count = self.cache.incr(key)

        # Set expiry on first request
        if count == 1:
            self.cache.expire(key, self.window)

        remaining = max(0, self.max_requests - count)
        return count <= self.max_requests, remaining

    def reset(self, identifier: str) -> None:
        """Reset the rate limit for an identifier"""
        key = f"ratelimit:{identifier}"
        self.cache.delete(key)


@dataclass
class Session:
    """Represents a user session"""
    id: str
    user_id: int
    data: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    expires_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "data": self.data,
            "created_at": self.created_at.isoformat(),
            "expires_at": self.expires_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Session":
        return cls(
            id=data["id"],
            user_id=data["user_id"],
            data=data.get("data", {}),
            created_at=datetime.fromisoformat(data["created_at"]),
            expires_at=datetime.fromisoformat(data["expires_at"]),
        )


class SessionStore:
    """Provides session management using Redis"""

    def __init__(self, cache: CacheService, ttl: timedelta = timedelta(hours=24)):
        self.cache = cache
        self.ttl = ttl

    def create(self, user_id: int, data: Optional[Dict[str, Any]] = None) -> Session:
        """Create a new session"""
        session_id = generate_key("session", user_id, time.time_ns())

        session = Session(
            id=session_id,
            user_id=user_id,
            data=data or {},
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + self.ttl,
        )

        key = f"session:{session_id}"
        self.cache.set(key, session.to_dict(), self.ttl)

        return session

    def get(self, session_id: str) -> Optional[Session]:
        """Retrieve a session"""
        key = f"session:{session_id}"
        data = self.cache.get(key)
        if data is None:
            return None
        return Session.from_dict(data)

    def update(self, session_id: str, data: Dict[str, Any]) -> bool:
        """Update session data"""
        session = self.get(session_id)
        if session is None:
            return False

        session.data.update(data)

        key = f"session:{session_id}"
        self.cache.set(key, session.to_dict(), self.ttl)
        return True

    def delete(self, session_id: str) -> None:
        """Delete a session"""
        key = f"session:{session_id}"
        self.cache.delete(key)

    def refresh(self, session_id: str) -> bool:
        """Extend session expiration"""
        session = self.get(session_id)
        if session is None:
            return False

        session.expires_at = datetime.utcnow() + self.ttl

        key = f"session:{session_id}"
        self.cache.set(key, session.to_dict(), self.ttl)
        return True
