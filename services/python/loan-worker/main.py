"""
Loan Worker for Ag-Fintech Platform
Demonstrates idempotent loan processing using all middleware services
"""

import json
import logging
import os
import signal
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

import redis
from flask import Flask, jsonify, request

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from shared.middleware import (
    # Idempotency
    IdempotencyService,
    ProcessedEventsTracker,
    generate_key,
    
    # Kafka
    KafkaClient,
    KafkaConsumer,
    KafkaEvent,
    Topics,
    EventTypes,
    create_deterministic_event,
    
    # Redis
    CacheService,
    RateLimiter,
    
    # TigerBeetle
    TigerBeetleClient,
    AccountTypes,
    get_account_id,
    get_transfer_id,
    
    # Temporal
    TemporalClient,
    LoanApplicationInput,
    DisbursementInput,
    PaymentCollectionInput,
    
    # Keycloak
    KeycloakClient,
    KeycloakUser,
    has_role,
    
    # Permify
    PermifyClient,
    Entity,
    Subject,
    
    # Dapr
    DaprClient,
    DaprTopics,
    
    # Fluvio
    FluvioClient,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class LoanApplication:
    """Represents a loan application"""
    id: int
    farmer_id: int
    amount: float
    purpose: str
    term_months: int
    status: str = "pending"
    created_at: datetime = field(default_factory=datetime.utcnow)
    approved_at: Optional[datetime] = None
    disbursed_at: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "farmer_id": self.farmer_id,
            "amount": self.amount,
            "purpose": self.purpose,
            "term_months": self.term_months,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "approved_at": self.approved_at.isoformat() if self.approved_at else None,
            "disbursed_at": self.disbursed_at.isoformat() if self.disbursed_at else None,
        }


class LoanWorker:
    """Loan worker that processes loan applications with idempotency"""

    def __init__(self):
        self.applications: Dict[int, LoanApplication] = {}
        self._init_middleware()

    def _get_env(self, key: str, default: str) -> str:
        return os.environ.get(key, default)

    def _init_middleware(self):
        """Initialize all middleware services"""
        # Initialize Redis
        redis_url = self._get_env("REDIS_URL", "redis://localhost:6379")
        try:
            self.redis_client = redis.from_url(redis_url)
            self.redis_client.ping()
            self.cache = CacheService(redis_url)
            self.idempotency = IdempotencyService(self.redis_client, timedelta(hours=24))
            self.event_tracker = ProcessedEventsTracker(self.redis_client, timedelta(days=7))
            self.rate_limiter = RateLimiter(self.cache, max_requests=100, window=timedelta(minutes=1))
            logger.info("[LoanWorker] Redis connected")
        except Exception as e:
            logger.warning(f"[LoanWorker] Redis not available: {e}")
            self.redis_client = None
            self.cache = None
            self.idempotency = None
            self.event_tracker = None
            self.rate_limiter = None

        # Initialize Kafka
        kafka_brokers = self._get_env("KAFKA_BROKERS", "localhost:9093").split(",")
        self.kafka = KafkaClient(
            brokers=kafka_brokers,
            client_id="loan-worker",
            event_tracker=self.event_tracker,
        )

        # Initialize TigerBeetle
        self.tigerbeetle = TigerBeetleClient(
            cluster_id=self._get_env("TIGERBEETLE_CLUSTER_ID", "0"),
            replica_addresses=[self._get_env("TIGERBEETLE_ADDRESS", "127.0.0.1:3000")],
            idempotency=self.idempotency,
        )

        # Initialize Temporal
        self.temporal = TemporalClient(
            address=self._get_env("TEMPORAL_ADDRESS", "localhost:7233"),
            namespace=self._get_env("TEMPORAL_NAMESPACE", "default"),
        )

        # Initialize Keycloak
        self.keycloak = KeycloakClient(
            url=self._get_env("KEYCLOAK_URL", "http://localhost:8080"),
            realm=self._get_env("KEYCLOAK_REALM", "farmer-realm"),
            client_id=self._get_env("KEYCLOAK_CLIENT_ID", "farmer-api"),
        )

        # Initialize Permify
        self.permify = PermifyClient(
            url=self._get_env("PERMIFY_URL", "http://localhost:3476"),
            tenant_id=self._get_env("PERMIFY_TENANT_ID", "default"),
            cache=self.cache,
        )

        # Initialize Dapr
        self.dapr = DaprClient(
            host=self._get_env("DAPR_HOST", "127.0.0.1"),
            http_port=self._get_env("DAPR_HTTP_PORT", "3500"),
            event_tracker=self.event_tracker,
        )

        # Initialize Fluvio
        self.fluvio = FluvioClient(
            endpoint=self._get_env("FLUVIO_ENDPOINT", "http://localhost:9003"),
            event_tracker=self.event_tracker,
        )

        logger.info("[LoanWorker] All middleware services initialized")

    def apply_for_loan(
        self,
        farmer_id: int,
        amount: float,
        purpose: str,
        term_months: int,
    ) -> LoanApplication:
        """Apply for a loan with idempotency"""
        # Generate idempotency key based on business identifiers
        idempotency_key = generate_key("loan-application", farmer_id, amount, purpose, term_months)

        # Try to acquire idempotency lock
        if self.idempotency:
            is_new, existing_result = self.idempotency.try_acquire(idempotency_key)

            if not is_new and existing_result:
                if existing_result.status == "completed":
                    logger.info("[LoanWorker] Returning cached loan application result")
                    return LoanApplication(**existing_result.result)
                if existing_result.status == "failed":
                    raise Exception(f"Previous attempt failed: {existing_result.error}")
                raise Exception("Loan application is still being processed")

        # Create loan application
        application_id = len(self.applications) + 1
        app = LoanApplication(
            id=application_id,
            farmer_id=farmer_id,
            amount=amount,
            purpose=purpose,
            term_months=term_months,
        )

        self.applications[application_id] = app

        # Initialize farmer accounts in TigerBeetle (idempotent)
        try:
            self.tigerbeetle.initialize_farmer_accounts(farmer_id)
        except Exception as e:
            logger.warning(f"[LoanWorker] Failed to initialize farmer accounts: {e}")

        # Start loan application workflow in Temporal (idempotent)
        try:
            self.temporal.start_loan_application_workflow(
                LoanApplicationInput(
                    application_id=application_id,
                    farmer_id=farmer_id,
                    amount=amount,
                    purpose=purpose,
                    term_months=term_months,
                )
            )
        except Exception as e:
            logger.warning(f"[LoanWorker] Failed to start workflow: {e}")

        # Publish loan application event to Kafka
        try:
            event = create_deterministic_event(
                EventTypes.CREATED,
                "loan_application",
                application_id,
                farmer_id,
                app.to_dict(),
                idempotency_key,
            )
            self.kafka.publish_event(Topics.AUDIT_TRAIL, event)
        except Exception as e:
            logger.warning(f"[LoanWorker] Failed to publish event: {e}")

        # Grant farmer access to their loan application in Permify
        try:
            self.permify.grant_loan_access(farmer_id, application_id, "owner")
        except Exception as e:
            logger.warning(f"[LoanWorker] Failed to grant loan access: {e}")

        # Cache the result
        if self.cache:
            cache_key = f"loan:application:{application_id}"
            self.cache.set(cache_key, app.to_dict(), timedelta(hours=1))

        # Mark idempotency as completed
        if self.idempotency:
            self.idempotency.complete(idempotency_key, app.to_dict())

        logger.info(f"[LoanWorker] Created loan application {application_id} for farmer {farmer_id}")
        return app

    def approve_loan(self, application_id: int, approver_id: int) -> LoanApplication:
        """Approve a loan with idempotency"""
        # Check permission
        try:
            can_approve = self.permify.can_approve_loan(approver_id, application_id)
            if not can_approve:
                raise Exception(f"User {approver_id} is not authorized to approve loan {application_id}")
        except Exception as e:
            logger.warning(f"[LoanWorker] Permission check failed: {e}")

        # Generate idempotency key
        idempotency_key = generate_key("loan-approval", application_id, approver_id)

        # Try to acquire idempotency lock
        if self.idempotency:
            is_new, existing_result = self.idempotency.try_acquire(idempotency_key)

            if not is_new and existing_result and existing_result.status == "completed":
                logger.info("[LoanWorker] Returning cached loan approval result")
                return LoanApplication(**existing_result.result)

        # Get application
        app = self.applications.get(application_id)
        if not app:
            raise Exception(f"Loan application {application_id} not found")

        if app.status != "pending":
            raise Exception(f"Loan application {application_id} is not pending (status: {app.status})")

        # Update status
        app.status = "approved"
        app.approved_at = datetime.utcnow()

        # Publish approval event
        try:
            event = create_deterministic_event(
                EventTypes.UPDATED,
                "loan_application",
                application_id,
                approver_id,
                {"status": "approved", "approved_at": app.approved_at.isoformat()},
                idempotency_key,
            )
            self.kafka.publish_event(Topics.AUDIT_TRAIL, event)
        except Exception as e:
            logger.warning(f"[LoanWorker] Failed to publish event: {e}")

        # Invalidate cache
        if self.cache:
            cache_key = f"loan:application:{application_id}"
            self.cache.delete(cache_key)

        # Mark idempotency as completed
        if self.idempotency:
            self.idempotency.complete(idempotency_key, app.to_dict())

        logger.info(f"[LoanWorker] Approved loan application {application_id}")
        return app

    def disburse_loan(self, application_id: int, disburser_id: int) -> LoanApplication:
        """Disburse a loan with idempotency"""
        # Check permission
        try:
            can_disburse = self.permify.can_disburse_loan(disburser_id, application_id)
            if not can_disburse:
                raise Exception(f"User {disburser_id} is not authorized to disburse loan {application_id}")
        except Exception as e:
            logger.warning(f"[LoanWorker] Permission check failed: {e}")

        # Generate idempotency key
        idempotency_key = generate_key("loan-disbursement", application_id, disburser_id)

        # Try to acquire idempotency lock
        if self.idempotency:
            is_new, existing_result = self.idempotency.try_acquire(idempotency_key)

            if not is_new and existing_result and existing_result.status == "completed":
                logger.info("[LoanWorker] Returning cached loan disbursement result")
                return LoanApplication(**existing_result.result)

        # Get application
        app = self.applications.get(application_id)
        if not app:
            raise Exception(f"Loan application {application_id} not found")

        if app.status != "approved":
            raise Exception(f"Loan application {application_id} is not approved (status: {app.status})")

        # Record disbursement in TigerBeetle (idempotent)
        try:
            amount_cents = int(app.amount * 100)
            self.tigerbeetle.record_loan_disbursement(application_id, app.farmer_id, amount_cents)
        except Exception as e:
            logger.warning(f"[LoanWorker] Failed to record disbursement: {e}")

        # Start disbursement workflow in Temporal (idempotent)
        try:
            self.temporal.start_disbursement_workflow(
                DisbursementInput(
                    application_id=application_id,
                    farmer_id=app.farmer_id,
                    amount=app.amount,
                    account_number=f"FARMER-{app.farmer_id}",
                )
            )
        except Exception as e:
            logger.warning(f"[LoanWorker] Failed to start disbursement workflow: {e}")

        # Update status
        app.status = "disbursed"
        app.disbursed_at = datetime.utcnow()

        # Publish disbursement event
        try:
            event = create_deterministic_event(
                EventTypes.UPDATED,
                "loan_application",
                application_id,
                disburser_id,
                {"status": "disbursed", "disbursed_at": app.disbursed_at.isoformat(), "amount": app.amount},
                idempotency_key,
            )
            self.kafka.publish_event(Topics.AUDIT_TRAIL, event)
        except Exception as e:
            logger.warning(f"[LoanWorker] Failed to publish event: {e}")

        # Publish via Dapr as well
        try:
            self.dapr.publish_event(DaprTopics.NOTIFICATIONS, {
                "type": "loan_disbursed",
                "farmer_id": app.farmer_id,
                "loan_id": application_id,
                "amount": app.amount,
                "message": f"Your loan of {app.amount:.2f} has been disbursed",
            })
        except Exception as e:
            logger.warning(f"[LoanWorker] Failed to publish Dapr event: {e}")

        # Publish to Fluvio as well
        try:
            self.fluvio.produce_event("notifications", event)
        except Exception as e:
            logger.warning(f"[LoanWorker] Failed to publish Fluvio event: {e}")

        # Invalidate cache
        if self.cache:
            cache_key = f"loan:application:{application_id}"
            self.cache.delete(cache_key)

        # Mark idempotency as completed
        if self.idempotency:
            self.idempotency.complete(idempotency_key, app.to_dict())

        logger.info(f"[LoanWorker] Disbursed loan application {application_id}")
        return app

    def get_loan_application(self, application_id: int) -> Optional[LoanApplication]:
        """Get a loan application (with caching)"""
        # Try cache first
        if self.cache:
            cache_key = f"loan:application:{application_id}"
            cached = self.cache.get(cache_key)
            if cached:
                logger.info(f"[LoanWorker] Cache HIT for loan {application_id}")
                return LoanApplication(**cached)

        # Get from memory
        app = self.applications.get(application_id)
        if app and self.cache:
            cache_key = f"loan:application:{application_id}"
            self.cache.set(cache_key, app.to_dict(), timedelta(hours=1))

        return app

    def close(self):
        """Close all middleware connections"""
        try:
            self.kafka.close()
        except Exception:
            pass

        try:
            if self.cache:
                self.cache.close()
        except Exception:
            pass

        logger.info("[LoanWorker] Closed all connections")


# Flask application
app = Flask(__name__)
worker = LoanWorker()


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "redis": worker.cache is not None,
            "kafka": worker.kafka is not None,
            "tigerbeetle": worker.tigerbeetle is not None,
            "temporal": worker.temporal is not None,
            "keycloak": worker.keycloak is not None,
            "permify": worker.permify is not None,
            "dapr": worker.dapr is not None,
            "fluvio": worker.fluvio is not None,
        },
    })


@app.route("/loans/apply", methods=["POST"])
def apply_for_loan():
    data = request.get_json()
    try:
        app_result = worker.apply_for_loan(
            farmer_id=data["farmer_id"],
            amount=data["amount"],
            purpose=data["purpose"],
            term_months=data["term_months"],
        )
        return jsonify(app_result.to_dict())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/loans/approve", methods=["POST"])
def approve_loan():
    data = request.get_json()
    try:
        app_result = worker.approve_loan(
            application_id=data["application_id"],
            approver_id=data["approver_id"],
        )
        return jsonify(app_result.to_dict())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/loans/disburse", methods=["POST"])
def disburse_loan():
    data = request.get_json()
    try:
        app_result = worker.disburse_loan(
            application_id=data["application_id"],
            disburser_id=data["disburser_id"],
        )
        return jsonify(app_result.to_dict())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/loans/<int:application_id>", methods=["GET"])
def get_loan(application_id: int):
    app_result = worker.get_loan_application(application_id)
    if app_result:
        return jsonify(app_result.to_dict())
    return jsonify({"error": "Loan application not found"}), 404


def signal_handler(signum, frame):
    logger.info("[LoanWorker] Received shutdown signal")
    worker.close()
    sys.exit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    port = int(os.environ.get("PORT", "8091"))
    logger.info(f"[LoanWorker] Starting on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
