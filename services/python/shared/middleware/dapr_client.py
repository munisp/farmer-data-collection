"""
Dapr Client for Ag-Fintech Platform
Provides Dapr service mesh operations
"""

import json
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import requests

from .idempotency import ProcessedEventsTracker

logger = logging.getLogger(__name__)


@dataclass
class DaprComponents:
    """Available Dapr components"""
    PUBSUB: str = "kafka-pubsub"
    STATE_STORE: str = "redis-state"
    SECRET_STORE: str = "local-secret-store"


@dataclass
class DaprTopics:
    """Available Dapr topics (matching Kafka topics)"""
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


class DaprClient:
    """Provides Dapr service mesh operations"""

    def __init__(
        self,
        host: str = "127.0.0.1",
        http_port: str = "3500",
        event_tracker: Optional[ProcessedEventsTracker] = None,
    ):
        self.host = host
        self.http_port = http_port
        self.event_tracker = event_tracker
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.http_port}"

    def publish_event(self, topic: str, data: Any) -> bool:
        """Publish an event via Dapr pub/sub"""
        try:
            url = f"{self.base_url}/v1.0/publish/{DaprComponents.PUBSUB}/{topic}"
            response = self.session.post(url, json=data, timeout=30)

            if response.status_code not in (200, 204):
                logger.error(f"[Dapr] Publish failed with status: {response.status_code}")
                return False

            logger.info(f"[Dapr] Published event to topic: {topic}")
            return True

        except Exception as e:
            logger.error(f"[Dapr] Failed to publish event: {e}")
            # Graceful degradation - don't throw
            return False

    def save_state(
        self,
        key: str,
        value: Any,
        metadata: Optional[Dict[str, str]] = None,
    ) -> bool:
        """Save state via Dapr state management"""
        try:
            url = f"{self.base_url}/v1.0/state/{DaprComponents.STATE_STORE}"
            state_item = [{"key": key, "value": value}]
            if metadata:
                state_item[0]["metadata"] = metadata

            response = self.session.post(url, json=state_item, timeout=30)

            if response.status_code not in (200, 204):
                logger.error(f"[Dapr] Save state failed with status: {response.status_code}")
                return False

            logger.info(f"[Dapr] Saved state: {key}")
            return True

        except Exception as e:
            logger.error(f"[Dapr] Failed to save state: {e}")
            return False

    def save_state_with_etag(
        self,
        key: str,
        value: Any,
        etag: str,
    ) -> bool:
        """Save state with optimistic concurrency (idempotent updates)"""
        try:
            url = f"{self.base_url}/v1.0/state/{DaprComponents.STATE_STORE}"
            state_item = [
                {
                    "key": key,
                    "value": value,
                    "etag": etag,
                    "options": {"concurrency": "first-write"},
                }
            ]

            response = self.session.post(url, json=state_item, timeout=30)

            if response.status_code == 409:
                logger.warning(f"[Dapr] ETag mismatch - state was modified by another process")
                return False

            if response.status_code not in (200, 204):
                logger.error(f"[Dapr] Save state failed with status: {response.status_code}")
                return False

            logger.info(f"[Dapr] Saved state with ETag: {key}")
            return True

        except Exception as e:
            logger.error(f"[Dapr] Failed to save state: {e}")
            return False

    def get_state(self, key: str) -> tuple[Optional[Any], Optional[str]]:
        """Retrieve state via Dapr state management. Returns (value, etag)"""
        try:
            url = f"{self.base_url}/v1.0/state/{DaprComponents.STATE_STORE}/{key}"
            response = self.session.get(url, timeout=30)

            if response.status_code == 404:
                return None, None

            if response.status_code != 200:
                logger.error(f"[Dapr] Get state failed with status: {response.status_code}")
                return None, None

            etag = response.headers.get("ETag")

            try:
                value = response.json()
            except json.JSONDecodeError:
                value = response.text

            logger.info(f"[Dapr] Retrieved state: {key}")
            return value, etag

        except Exception as e:
            logger.error(f"[Dapr] Failed to get state: {e}")
            return None, None

    def delete_state(self, key: str) -> bool:
        """Delete state via Dapr state management"""
        try:
            url = f"{self.base_url}/v1.0/state/{DaprComponents.STATE_STORE}/{key}"
            response = self.session.delete(url, timeout=30)

            if response.status_code not in (200, 204):
                logger.error(f"[Dapr] Delete state failed with status: {response.status_code}")
                return False

            logger.info(f"[Dapr] Deleted state: {key}")
            return True

        except Exception as e:
            logger.error(f"[Dapr] Failed to delete state: {e}")
            return False

    def bulk_get_state(self, keys: List[str]) -> Dict[str, Any]:
        """Retrieve multiple state values"""
        try:
            url = f"{self.base_url}/v1.0/state/{DaprComponents.STATE_STORE}/bulk"
            response = self.session.post(url, json={"keys": keys}, timeout=30)

            if response.status_code != 200:
                logger.error(f"[Dapr] Bulk get state failed with status: {response.status_code}")
                return {}

            results = response.json()
            result_map = {item["key"]: item.get("data") for item in results}

            logger.info(f"[Dapr] Retrieved bulk state: {len(keys)} keys")
            return result_map

        except Exception as e:
            logger.error(f"[Dapr] Failed to bulk get state: {e}")
            return {}

    def invoke_service(
        self,
        service_id: str,
        method_name: str,
        data: Optional[Any] = None,
    ) -> Optional[Any]:
        """Invoke another service via Dapr service invocation"""
        try:
            url = f"{self.base_url}/v1.0/invoke/{service_id}/method/{method_name}"

            if data is not None:
                response = self.session.post(url, json=data, timeout=30)
            else:
                response = self.session.post(url, timeout=30)

            if response.status_code != 200:
                logger.error(f"[Dapr] Service invocation failed with status: {response.status_code}")
                return None

            try:
                result = response.json()
            except json.JSONDecodeError:
                result = response.text

            logger.info(f"[Dapr] Invoked service: {service_id}.{method_name}")
            return result

        except Exception as e:
            logger.error(f"[Dapr] Failed to invoke service: {e}")
            return None

    def get_secret(self, secret_name: str) -> Optional[Dict[str, str]]:
        """Retrieve a secret from Dapr secret store"""
        try:
            url = f"{self.base_url}/v1.0/secrets/{DaprComponents.SECRET_STORE}/{secret_name}"
            response = self.session.get(url, timeout=30)

            if response.status_code != 200:
                logger.error(f"[Dapr] Get secret failed with status: {response.status_code}")
                return None

            logger.info(f"[Dapr] Retrieved secret: {secret_name}")
            return response.json()

        except Exception as e:
            logger.error(f"[Dapr] Failed to get secret: {e}")
            return None

    def check_health(self) -> bool:
        """Check if Dapr sidecar is healthy"""
        try:
            url = f"{self.base_url}/v1.0/healthz"
            response = self.session.get(url, timeout=5)
            return response.status_code in (200, 204)
        except Exception:
            return False
