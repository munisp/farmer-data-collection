"""
Fluvio Client for Ag-Fintech Platform
Provides Fluvio streaming operations
"""

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

import requests

from .idempotency import ProcessedEventsTracker
from .kafka_client import KafkaEvent

logger = logging.getLogger(__name__)


@dataclass
class FluvioRecord:
    """Represents a record in Fluvio"""
    key: Optional[str] = None
    value: Any = None
    timestamp: int = 0
    headers: Dict[str, str] = field(default_factory=dict)


@dataclass
class FluvioTopic:
    """Represents a Fluvio topic"""
    name: str = ""
    partitions: int = 1
    replicas: int = 1


class FluvioClient:
    """
    Provides Fluvio streaming operations.
    This is an HTTP-based client - replace with native Fluvio client in production.
    """

    def __init__(
        self,
        endpoint: str = "http://localhost:9003",
        event_tracker: Optional[ProcessedEventsTracker] = None,
    ):
        self.endpoint = endpoint
        self.event_tracker = event_tracker
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

    def create_topic(self, topic: FluvioTopic) -> bool:
        """Create a new topic (idempotent)"""
        try:
            url = f"{self.endpoint}/topics"
            response = self.session.post(
                url,
                json={
                    "name": topic.name,
                    "partitions": topic.partitions,
                    "replicas": topic.replicas,
                },
                timeout=30,
            )

            # Treat "already exists" as success (idempotent)
            if response.status_code not in (200, 201, 409):
                logger.error(f"[Fluvio] Create topic failed: {response.status_code}")
                return False

            logger.info(f"[Fluvio] Created topic: {topic.name}")
            return True

        except Exception as e:
            logger.error(f"[Fluvio] Failed to create topic: {e}")
            # Graceful degradation
            return False

    def delete_topic(self, topic_name: str) -> bool:
        """Delete a topic"""
        try:
            url = f"{self.endpoint}/topics/{topic_name}"
            response = self.session.delete(url, timeout=30)

            if response.status_code not in (200, 204):
                logger.error(f"[Fluvio] Delete topic failed: {response.status_code}")
                return False

            logger.info(f"[Fluvio] Deleted topic: {topic_name}")
            return True

        except Exception as e:
            logger.error(f"[Fluvio] Failed to delete topic: {e}")
            return False

    def produce(self, topic: str, record: FluvioRecord) -> bool:
        """Send a record to a topic"""
        try:
            url = f"{self.endpoint}/topics/{topic}/produce"

            if record.timestamp == 0:
                record.timestamp = int(time.time() * 1000)

            response = self.session.post(
                url,
                json={
                    "key": record.key,
                    "value": record.value,
                    "timestamp": record.timestamp,
                    "headers": record.headers,
                },
                timeout=30,
            )

            if response.status_code not in (200, 201):
                logger.error(f"[Fluvio] Produce failed: {response.status_code}")
                return False

            logger.info(f"[Fluvio] Produced record to topic: {topic}")
            return True

        except Exception as e:
            logger.error(f"[Fluvio] Failed to produce record: {e}")
            # Graceful degradation
            return False

    def produce_event(self, topic: str, event: KafkaEvent) -> bool:
        """Produce a KafkaEvent to Fluvio (compatible with Kafka event format)"""
        record = FluvioRecord(
            key=f"{event.entity_type}:{event.entity_id}",
            value=event.to_dict(),
            timestamp=int(time.time() * 1000),
            headers={
                "eventType": event.event_type,
                "entityType": event.entity_type,
                "eventId": event.event_id,
            },
        )
        return self.produce(topic, record)

    def produce_batch(self, topic: str, records: List[FluvioRecord]) -> bool:
        """Send multiple records to a topic"""
        try:
            url = f"{self.endpoint}/topics/{topic}/produce/batch"

            batch = []
            for record in records:
                if record.timestamp == 0:
                    record.timestamp = int(time.time() * 1000)
                batch.append({
                    "key": record.key,
                    "value": record.value,
                    "timestamp": record.timestamp,
                    "headers": record.headers,
                })

            response = self.session.post(url, json=batch, timeout=30)

            if response.status_code not in (200, 201):
                logger.error(f"[Fluvio] Produce batch failed: {response.status_code}")
                return False

            logger.info(f"[Fluvio] Produced {len(records)} records to topic: {topic}")
            return True

        except Exception as e:
            logger.error(f"[Fluvio] Failed to produce batch: {e}")
            # Graceful degradation
            return False

    def consume(
        self,
        topic: str,
        partition: int = 0,
        offset: int = 0,
        limit: int = 100,
    ) -> List[FluvioRecord]:
        """Retrieve records from a topic"""
        try:
            url = f"{self.endpoint}/topics/{topic}/consume"
            params = {
                "partition": partition,
                "offset": offset,
                "limit": limit,
            }

            response = self.session.get(url, params=params, timeout=30)

            if response.status_code != 200:
                logger.error(f"[Fluvio] Consume failed: {response.status_code}")
                return []

            records = []
            for item in response.json():
                records.append(FluvioRecord(
                    key=item.get("key"),
                    value=item.get("value"),
                    timestamp=item.get("timestamp", 0),
                    headers=item.get("headers", {}),
                ))

            logger.info(f"[Fluvio] Consumed {len(records)} records from topic: {topic}")
            return records

        except Exception as e:
            logger.error(f"[Fluvio] Failed to consume records: {e}")
            return []

    def consume_with_idempotency(
        self,
        topic: str,
        partition: int,
        handler: Callable[[FluvioRecord], None],
    ) -> None:
        """Consume records with exactly-once semantics"""
        offset = 0
        batch_size = 100

        while True:
            records = self.consume(topic, partition, offset, batch_size)

            if not records:
                time.sleep(0.1)
                continue

            for record in records:
                # Extract event ID from value if it's a KafkaEvent
                event_id = None
                if isinstance(record.value, dict):
                    event_id = record.value.get("eventId")

                # Check if event was already processed (idempotency)
                if event_id and self.event_tracker:
                    if self.event_tracker.is_processed(event_id):
                        logger.info(f"[Fluvio] Skipping already processed event: {event_id}")
                        offset += 1
                        continue

                try:
                    # Process the record
                    handler(record)

                    # Mark event as processed
                    if event_id and self.event_tracker:
                        self.event_tracker.mark_processed(event_id)

                except Exception as e:
                    logger.error(f"[Fluvio] Error handling record: {e}")

                offset += 1

    def get_topic_info(self, topic_name: str) -> Optional[FluvioTopic]:
        """Retrieve information about a topic"""
        try:
            url = f"{self.endpoint}/topics/{topic_name}"
            response = self.session.get(url, timeout=30)

            if response.status_code == 404:
                return None

            if response.status_code != 200:
                logger.error(f"[Fluvio] Get topic info failed: {response.status_code}")
                return None

            data = response.json()
            return FluvioTopic(
                name=data.get("name", ""),
                partitions=data.get("partitions", 1),
                replicas=data.get("replicas", 1),
            )

        except Exception as e:
            logger.error(f"[Fluvio] Failed to get topic info: {e}")
            return None

    def list_topics(self) -> List[FluvioTopic]:
        """List all topics"""
        try:
            url = f"{self.endpoint}/topics"
            response = self.session.get(url, timeout=30)

            if response.status_code != 200:
                logger.error(f"[Fluvio] List topics failed: {response.status_code}")
                return []

            topics = []
            for item in response.json():
                topics.append(FluvioTopic(
                    name=item.get("name", ""),
                    partitions=item.get("partitions", 1),
                    replicas=item.get("replicas", 1),
                ))

            return topics

        except Exception as e:
            logger.error(f"[Fluvio] Failed to list topics: {e}")
            return []

    def check_health(self) -> bool:
        """Check if Fluvio is healthy"""
        try:
            url = f"{self.endpoint}/health"
            response = self.session.get(url, timeout=5)
            return response.status_code == 200
        except Exception:
            return False

    def setup_default_topics(self) -> bool:
        """Create the default topics for the platform"""
        topics = [
            FluvioTopic(name="farmer.events", partitions=3, replicas=1),
            FluvioTopic(name="farm.events", partitions=3, replicas=1),
            FluvioTopic(name="crop.events", partitions=3, replicas=1),
            FluvioTopic(name="livestock.events", partitions=3, replicas=1),
            FluvioTopic(name="harvest.events", partitions=3, replicas=1),
            FluvioTopic(name="expense.events", partitions=3, replicas=1),
            FluvioTopic(name="auth.events", partitions=1, replicas=1),
            FluvioTopic(name="cache.invalidation", partitions=1, replicas=1),
            FluvioTopic(name="audit.trail", partitions=3, replicas=1),
            FluvioTopic(name="notifications", partitions=3, replicas=1),
            FluvioTopic(name="analytics", partitions=3, replicas=1),
        ]

        for topic in topics:
            if not self.create_topic(topic):
                logger.warning(f"[Fluvio] Failed to create topic: {topic.name}")

        logger.info("[Fluvio] Set up default topics")
        return True
