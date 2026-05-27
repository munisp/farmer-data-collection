"""
Temporal Client for Ag-Fintech Platform
Provides idempotent workflow orchestration
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from .idempotency import generate_key

logger = logging.getLogger(__name__)


class WorkflowStatus(Enum):
    """Workflow execution status"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class TaskQueues:
    """Available task queues"""
    LOAN_PROCESSING: str = "loan-processing-queue"
    PAYMENT_COLLECTION: str = "payment-collection-queue"
    DATA_SYNC: str = "data-sync-queue"
    NOTIFICATIONS: str = "notifications-queue"
    ANALYTICS: str = "analytics-queue"
    ORDER_PROCESSING: str = "order-processing-queue"
    DATA_EXPORT: str = "data-export-queue"
    REPORT_GENERATION: str = "report-generation-queue"


@dataclass
class WorkflowExecution:
    """Represents a workflow execution"""
    workflow_id: str
    run_id: str
    status: WorkflowStatus
    input: Any
    output: Optional[Any] = None
    error: Optional[str] = None
    started_at: datetime = field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class LoanApplicationInput:
    """Input for loan application workflow"""
    application_id: int
    farmer_id: int
    amount: float
    purpose: str
    term_months: int


@dataclass
class DisbursementInput:
    """Input for disbursement workflow"""
    application_id: int
    farmer_id: int
    amount: float
    account_number: str


@dataclass
class PaymentCollectionInput:
    """Input for payment collection workflow"""
    loan_id: int
    farmer_id: int
    installment_number: int
    amount: float
    due_date: datetime


@dataclass
class DataSyncInput:
    """Input for data sync workflow"""
    farmer_id: int
    sync_type: str  # "full" or "incremental"
    last_sync_at: datetime


@dataclass
class NotificationInput:
    """Input for notification workflow"""
    recipient_id: int
    notification_type: str  # "sms", "email", "push"
    template: str
    variables: Dict[str, Any]
    idempotency_id: str


@dataclass
class OrderProcessingInput:
    """Input for order processing workflow"""
    order_id: int
    buyer_id: int
    seller_id: int
    amount: float


@dataclass
class ReportGenerationInput:
    """Input for report generation workflow"""
    report_type: str
    farmer_id: Optional[int]
    start_date: datetime
    end_date: datetime
    parameters: Dict[str, Any] = field(default_factory=dict)


def generate_workflow_id(workflow_type: str, *identifiers) -> str:
    """Generate a deterministic workflow ID for idempotency"""
    return generate_key(workflow_type, *identifiers)


class TemporalClient:
    """
    Provides idempotent Temporal workflow operations.
    This is a stub implementation - replace with actual Temporal client in production.
    """

    def __init__(
        self,
        address: str = "localhost:7233",
        namespace: str = "default",
    ):
        self.address = address
        self.namespace = namespace
        self.executions: Dict[str, WorkflowExecution] = {}

    def start_workflow(
        self,
        workflow_id: str,
        task_queue: str,
        input_data: Any,
    ) -> WorkflowExecution:
        """Start a workflow with idempotency (returns existing if already running)"""
        # Check if workflow already exists (idempotent)
        if workflow_id in self.executions:
            existing = self.executions[workflow_id]
            logger.info(f"[Temporal] Workflow {workflow_id} already exists with status {existing.status.value}")
            return existing

        # Create new workflow execution
        execution = WorkflowExecution(
            workflow_id=workflow_id,
            run_id=generate_key("run", workflow_id, datetime.utcnow().timestamp()),
            status=WorkflowStatus.RUNNING,
            input=input_data,
            started_at=datetime.utcnow(),
            metadata={"task_queue": task_queue},
        )

        self.executions[workflow_id] = execution
        logger.info(f"[Temporal] Started workflow: {workflow_id} (queue: {task_queue})")

        return execution

    def get_workflow_status(self, workflow_id: str) -> Optional[WorkflowExecution]:
        """Get the status of a workflow"""
        return self.executions.get(workflow_id)

    def complete_workflow(self, workflow_id: str, output: Any) -> None:
        """Mark a workflow as completed"""
        if workflow_id not in self.executions:
            raise ValueError(f"Workflow not found: {workflow_id}")

        execution = self.executions[workflow_id]
        execution.status = WorkflowStatus.COMPLETED
        execution.output = output
        execution.ended_at = datetime.utcnow()

        logger.info(f"[Temporal] Completed workflow: {workflow_id}")

    def fail_workflow(self, workflow_id: str, error_msg: str) -> None:
        """Mark a workflow as failed"""
        if workflow_id not in self.executions:
            raise ValueError(f"Workflow not found: {workflow_id}")

        execution = self.executions[workflow_id]
        execution.status = WorkflowStatus.FAILED
        execution.error = error_msg
        execution.ended_at = datetime.utcnow()

        logger.info(f"[Temporal] Failed workflow: {workflow_id} - {error_msg}")

    def cancel_workflow(self, workflow_id: str) -> None:
        """Cancel a running workflow"""
        if workflow_id not in self.executions:
            raise ValueError(f"Workflow not found: {workflow_id}")

        execution = self.executions[workflow_id]
        if execution.status != WorkflowStatus.RUNNING:
            raise ValueError(f"Workflow {workflow_id} is not running (status: {execution.status.value})")

        execution.status = WorkflowStatus.CANCELLED
        execution.ended_at = datetime.utcnow()

        logger.info(f"[Temporal] Cancelled workflow: {workflow_id}")

    # Loan Processing Workflows

    def start_loan_application_workflow(
        self, input_data: LoanApplicationInput
    ) -> WorkflowExecution:
        """Start a loan application workflow with idempotency"""
        workflow_id = generate_workflow_id("loan-application", input_data.application_id)
        return self.start_workflow(workflow_id, TaskQueues.LOAN_PROCESSING, input_data)

    def start_disbursement_workflow(
        self, input_data: DisbursementInput
    ) -> WorkflowExecution:
        """Start a disbursement workflow with idempotency"""
        workflow_id = generate_workflow_id("disbursement", input_data.application_id)
        return self.start_workflow(workflow_id, TaskQueues.LOAN_PROCESSING, input_data)

    def start_payment_collection_workflow(
        self, input_data: PaymentCollectionInput
    ) -> WorkflowExecution:
        """Start a payment collection workflow with idempotency"""
        workflow_id = generate_workflow_id(
            "payment-collection", input_data.loan_id, input_data.installment_number
        )
        return self.start_workflow(workflow_id, TaskQueues.PAYMENT_COLLECTION, input_data)

    # Data Sync Workflows

    def start_data_sync_workflow(
        self, input_data: DataSyncInput
    ) -> WorkflowExecution:
        """Start a data sync workflow with idempotency"""
        workflow_id = generate_workflow_id("data-sync", input_data.farmer_id, input_data.sync_type)
        return self.start_workflow(workflow_id, TaskQueues.DATA_SYNC, input_data)

    # Notification Workflows

    def start_notification_workflow(
        self, input_data: NotificationInput
    ) -> WorkflowExecution:
        """Start a notification workflow with idempotency"""
        workflow_id = generate_workflow_id("notification", input_data.idempotency_id)
        return self.start_workflow(workflow_id, TaskQueues.NOTIFICATIONS, input_data)

    # Order Processing Workflows

    def start_order_processing_workflow(
        self, input_data: OrderProcessingInput
    ) -> WorkflowExecution:
        """Start an order processing workflow with idempotency"""
        workflow_id = generate_workflow_id("order-processing", input_data.order_id)
        return self.start_workflow(workflow_id, TaskQueues.ORDER_PROCESSING, input_data)

    # Report Generation Workflows

    def start_report_generation_workflow(
        self, input_data: ReportGenerationInput
    ) -> WorkflowExecution:
        """Start a report generation workflow with idempotency"""
        workflow_id = generate_workflow_id(
            "report",
            input_data.report_type,
            input_data.farmer_id,
            input_data.start_date.timestamp(),
            input_data.end_date.timestamp(),
        )
        return self.start_workflow(workflow_id, TaskQueues.REPORT_GENERATION, input_data)

    def list_workflows(
        self, status: Optional[WorkflowStatus] = None
    ) -> List[WorkflowExecution]:
        """List all workflow executions"""
        results = []
        for execution in self.executions.values():
            if status is None or execution.status == status:
                results.append(execution)
        return results

    def close(self) -> None:
        """Close the Temporal client"""
        logger.info("[Temporal] Client closed")
