"""
Permify Client for Ag-Fintech Platform
Provides fine-grained authorization using Zanzibar-style relationships
"""

import logging
from dataclasses import dataclass
from typing import Any, Optional

import requests

from .redis_client import CacheService

logger = logging.getLogger(__name__)


@dataclass
class Entity:
    """Represents a resource entity"""
    type: str
    id: str


@dataclass
class Subject:
    """Represents a subject (user or entity)"""
    type: str
    id: str
    relation: Optional[str] = None


@dataclass
class Tuple:
    """Represents a relationship tuple"""
    entity: Entity
    relation: str
    subject: Subject


class PermifyClient:
    """Provides fine-grained authorization using Permify (Zanzibar-style)"""

    def __init__(
        self,
        url: str = "http://localhost:3476",
        tenant_id: str = "default",
        cache: Optional[CacheService] = None,
    ):
        self.url = url
        self.tenant_id = tenant_id
        self.cache = cache
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

    def check_permission(
        self,
        user_id: Any,
        resource: str,
        resource_id: Any,
        action: str,
    ) -> bool:
        """Check if a subject has permission on an entity"""
        # Try cache first
        cache_key = f"permify:check:{user_id}:{resource}:{resource_id}:{action}"
        if self.cache:
            cached = self.cache.get(cache_key)
            if cached is not None:
                logger.info(f"[Permify] Cache HIT: {cache_key}")
                return cached

        # Build request
        request_body = {
            "tenant_id": self.tenant_id,
            "metadata": {
                "schema_version": "",
                "snap_token": "",
                "depth": 20,
            },
            "entity": {
                "type": resource,
                "id": str(resource_id),
            },
            "permission": action,
            "subject": {
                "type": "user",
                "id": str(user_id),
            },
        }

        try:
            url = f"{self.url}/v1/tenants/{self.tenant_id}/permissions/check"
            response = self.session.post(url, json=request_body, timeout=5)

            if response.status_code != 200:
                logger.warning(f"[Permify] Permission check returned status: {response.status_code}")
                return False

            result = response.json()
            allowed = result.get("can") == "CHECK_RESULT_ALLOWED"

            # Cache the result
            if self.cache:
                from datetime import timedelta
                self.cache.set(cache_key, allowed, timedelta(minutes=5))

            logger.info(
                f"[Permify] Permission check: user={user_id} resource={resource}:{resource_id} "
                f"action={action} allowed={allowed}"
            )
            return allowed

        except Exception as e:
            logger.error(f"[Permify] Permission check failed: {e}")
            # Fail closed - deny access on error
            return False

    def create_relationship(
        self,
        entity: Entity,
        relation: str,
        subject: Subject,
    ) -> bool:
        """Create a relationship tuple (idempotent)"""
        request_body = {
            "tenant_id": self.tenant_id,
            "metadata": {
                "schema_version": "",
            },
            "tuples": [
                {
                    "entity": {"type": entity.type, "id": entity.id},
                    "relation": relation,
                    "subject": {
                        "type": subject.type,
                        "id": subject.id,
                        "relation": subject.relation or "",
                    },
                }
            ],
        }

        try:
            url = f"{self.url}/v1/tenants/{self.tenant_id}/relationships/write"
            response = self.session.post(url, json=request_body, timeout=5)

            # Treat "already exists" as success (idempotent)
            if response.status_code not in (200, 409):
                logger.error(f"[Permify] Create relationship failed: {response.status_code}")
                return False

            # Invalidate cache
            if self.cache:
                pattern = f"permify:check:*:{entity.type}:{entity.id}:*"
                self.cache.delete_pattern(pattern)

            logger.info(
                f"[Permify] Created relationship: {entity.type}:{entity.id} -> "
                f"{relation} -> {subject.type}:{subject.id}"
            )
            return True

        except Exception as e:
            logger.error(f"[Permify] Create relationship failed: {e}")
            return False

    def delete_relationship(
        self,
        entity: Entity,
        relation: str,
        subject: Subject,
    ) -> bool:
        """Delete a relationship tuple"""
        request_body = {
            "tenant_id": self.tenant_id,
            "filter": {
                "entity": {
                    "type": entity.type,
                    "ids": [entity.id],
                },
                "relation": relation,
                "subject": {
                    "type": subject.type,
                    "ids": [subject.id],
                    "relation": subject.relation or "",
                },
            },
        }

        try:
            url = f"{self.url}/v1/tenants/{self.tenant_id}/relationships/delete"
            response = self.session.post(url, json=request_body, timeout=5)

            if response.status_code != 200:
                logger.error(f"[Permify] Delete relationship failed: {response.status_code}")
                return False

            # Invalidate cache
            if self.cache:
                pattern = f"permify:check:*:{entity.type}:{entity.id}:*"
                self.cache.delete_pattern(pattern)

            logger.info(
                f"[Permify] Deleted relationship: {entity.type}:{entity.id} -> "
                f"{relation} -> {subject.type}:{subject.id}"
            )
            return True

        except Exception as e:
            logger.error(f"[Permify] Delete relationship failed: {e}")
            return False

    # Helper functions for common permission patterns

    def grant_farmer_access(self, user_id: int, farmer_id: int, role: str) -> bool:
        """Grant a user access to a farmer record"""
        return self.create_relationship(
            Entity(type="farmer", id=str(farmer_id)),
            role,
            Subject(type="user", id=str(user_id)),
        )

    def revoke_farmer_access(self, user_id: int, farmer_id: int, role: str) -> bool:
        """Revoke a user's access to a farmer record"""
        return self.delete_relationship(
            Entity(type="farmer", id=str(farmer_id)),
            role,
            Subject(type="user", id=str(user_id)),
        )

    def can_view_farmer(self, user_id: int, farmer_id: int) -> bool:
        """Check if a user can view a farmer record"""
        return self.check_permission(user_id, "farmer", farmer_id, "view")

    def can_edit_farmer(self, user_id: int, farmer_id: int) -> bool:
        """Check if a user can edit a farmer record"""
        return self.check_permission(user_id, "farmer", farmer_id, "edit")

    def can_delete_farmer(self, user_id: int, farmer_id: int) -> bool:
        """Check if a user can delete a farmer record"""
        return self.check_permission(user_id, "farmer", farmer_id, "delete")

    def grant_loan_access(self, user_id: int, loan_id: int, role: str) -> bool:
        """Grant a user access to a loan record"""
        return self.create_relationship(
            Entity(type="loan", id=str(loan_id)),
            role,
            Subject(type="user", id=str(user_id)),
        )

    def can_approve_loan(self, user_id: int, loan_id: int) -> bool:
        """Check if a user can approve a loan"""
        return self.check_permission(user_id, "loan", loan_id, "approve")

    def can_disburse_loan(self, user_id: int, loan_id: int) -> bool:
        """Check if a user can disburse a loan"""
        return self.check_permission(user_id, "loan", loan_id, "disburse")
