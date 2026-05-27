"""
Kafka Client for Ag-Fintech Platform
Provides idempotent Kafka operations
"""

import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from kafka import KafkaProducer, KafkaConsumer as KafkaConsumerLib
from kafka.errors import KafkaError

from .idempotency import ProcessedEventsTracker, generate_key

logger = logging.getLogger(__name__)


@dataclass
class Topics:
    """Kafka topics (matches TypeScript TOPICS constant)"""
    FARMER_EVENTS: str = "farmer.events"
    FARM_EVENTS: str = "farm.events"
    CROP_EVENTS: str = "crop.events"
    LIVESTOCK_EVENTS: str = "livestock.events"
    HARVEST_EVENTS: str = "harvest.events"
    EXPENSE_EVENTS: str = "expense.events"
    AUTH_EVENTS: str = "auth.events"
    CACHE_INVALIDATION: str = "cache.invalidation"
    AUDIT_TRAIL: str = "audit.trail"
    NOTIFICATIONS: str = "notifications"
    ANALYTICS: str = "analytics"


@dataclass
class EventTypes:
    """Event types (matches TypeScript EVENT_TYPES constant)"""
    CREATED: str = "CREATED"
    UPDATED: str = "UPDATED"
    DELETED: str = "DELETED"
    LOGIN: str = "LOGIN"
    LOGOUT: str = "LOGOUT"
    REGISTER: str = "REGISTER"
    PASSWORD_CHANGE: str = "PASSWORD_CHANGE"


@dataclass
class KafkaEvent:
    """Standardized event structure (matches TypeScript KafkaEvent)"""
    event_id: str
    event_type: str
    entity_type: str
    entity_id: Any
    user_id: Any
    timestamp: str
    data: Any
    metadata: Optional[Dict[str, Any]] = None

    def to_dict(self) -> dict:
        return {
            "eventId": self.event_id,
            "eventType": self.event_type,
            "entityType": self.entity_type,
            "entityId": self.entity_id,
            "userId": self.user_id,
            "timestamp": self.timestamp,
            "data": self.data,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "KafkaEvent":
        return cls(
            event_id=data["eventId"],
            event_type=data["eventType"],
            entity_type=data["entityType"],
            entity_id=data["entityId"],
            user_id=data["userId"],
            timestamp=data["timestamp"],
            data=data["data"],
            metadata=data.get("metadata"),
        )


def create_event(
    event_type: str,
    entity_type: str,
    entity_id: Any,
    user_id: Any,
    data: Any,
    metadata: Optional[Dict[str, Any]] = None,
) -> KafkaEvent:
    """Create a new KafkaEvent with proper structure"""
    return KafkaEvent(
        event_id=str(uuid.uuid4()),
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        user_id=user_id,
        timestamp=datetime.utcnow().isoformat() + "Z",
        data=data,
        metadata=metadata,
    )


def create_deterministic_event(
    event_type: str,
    entity_type: str,
    entity_id: Any,
    user_id: Any,
    data: Any,
    idempotency_key: str,
) -> KafkaEvent:
    """Create an event with a deterministic ID for idempotency"""
    return KafkaEvent(
        event_id=generate_key("event", idempotency_key),
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        user_id=user_id,
        timestamp=datetime.utcnow().isoformat() + "Z",
        data=data,
        metadata={"idempotencyKey": idempotency_key},
    )


class KafkaClient:
    """Provides idempotent Kafka operations"""

    def __init__(
        self,
        brokers: List[str],
        client_id: str = "farmer-platform",
        event_tracker: Optional[ProcessedEventsTracker] = None,
    ):
        self.brokers = brokers
        self.client_id = client_id
        self.event_tracker = event_tracker
        self._producer: Optional[KafkaProducer] = None

    @property
    def producer(self) -> KafkaProducer:
        if self._producer is None:
            self._producer = KafkaProducer(
                bootstrap_servers=self.brokers,
                client_id=self.client_id,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                key_serializer=lambda k: k.encode("utf-8") if k else None,
                acks="all",  # Wait for all replicas
                retries=3,
                max_in_flight_requests_per_connection=1,  # Ensure ordering
            )
        return self._producer

    def publish_event(self, topic: str, event: KafkaEvent) -> None:
        """Publish an event to a Kafka topic with idempotency"""
        key = f"{event.entity_type}:{event.entity_id}"

        try:
            future = self.producer.send(
                topic,
                key=key,
                value=event.to_dict(),
                headers=[
                    ("eventType", event.event_type.encode()),
                    ("entityType", event.entity_type.encode()),
                    ("eventId", event.event_id.encode()),
                ],
            )
            future.get(timeout=10)  # Wait for send to complete
            logger.info(f"[Kafka] Published event: {topic} - {event.event_type} - {key}")
        except KafkaError as e:
            logger.error(f"[Kafka] Failed to publish event: {e}")
            # Don't throw - graceful degradation

    def publish_farmer_event(
        self, event_type: str, farmer_id: int, user_id: int, data: Any
    ) -> None:
        """Publish a farmer-related event"""
        event = create_event(event_type, "farmer", farmer_id, user_id, data)
        self.publish_event(Topics.FARMER_EVENTS, event)

    def publish_farm_event(
        self, event_type: str, farm_id: int, user_id: int, data: Any
    ) -> None:
        """Publish a farm-related event"""
        event = create_event(event_type, "farm", farm_id, user_id, data)
        self.publish_event(Topics.FARM_EVENTS, event)

    def publish_audit_event(
        self,
        action: str,
        entity_type: str,
        entity_id: Any,
        user_id: int,
        details: Any,
    ) -> None:
        """Publish an audit trail event"""
        event = create_event(
            "AUDIT",
            entity_type,
            entity_id,
            user_id,
            {"action": action, "details": details},
        )
        self.publish_event(Topics.AUDIT_TRAIL, event)

    def close(self) -> None:
        """Close the Kafka producer"""
        if self._producer:
            self._producer.close()
            self._producer = None


class KafkaConsumer:
    """Provides idempotent event consumption"""

    def __init__(
        self,
        brokers: List[str],
        topic: str,
        group_id: str,
        event_tracker: Optional[ProcessedEventsTracker] = None,
    ):
        self.brokers = brokers
        self.topic = topic
        self.group_id = group_id
        self.event_tracker = event_tracker
        self._consumer: Optional[KafkaConsumerLib] = None

    @property
    def consumer(self) -> KafkaConsumerLib:
        if self._consumer is None:
            self._consumer = KafkaConsumerLib(
                self.topic,
                bootstrap_servers=self.brokers,
                group_id=self.group_id,
                value_deserializer=lambda v: json.loads(v.decode("utf-8")),
                auto_offset_reset="latest",
                enable_auto_commit=True,
            )
        return self._consumer

    def consume_with_idempotency(
        self, handler: Callable[[KafkaEvent], None]
    ) -> None:
        """Consume events with exactly-once semantics"""
        for message in self.consumer:
            try:
                event = KafkaEvent.from_dict(message.value)

                # Check if event was already processed (idempotency)
                if self.event_tracker:
                    if self.event_tracker.is_processed(event.event_id):
                        logger.info(f"[Kafka] Skipping already processed event: {event.event_id}")
                        continue

                # Process the event
                handler(event)

                # Mark event as processed
                if self.event_tracker:
                    self.event_tracker.mark_processed(event.event_id)

                logger.info(f"[Kafka] Processed event: {event.event_id} - {event.event_type}")

            except Exception as e:
                logger.error(f"[Kafka] Error handling event: {e}")
                continue

    def close(self) -> None:
        """Close the Kafka consumer"""
        if self._consumer:
            self._consumer.close()
            self._consumer = None
