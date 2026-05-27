"""
User Journey 2: Daily Expense Tracking via SMS
Channel: SMS
Persona: Chidi, 42, maize farmer in Enugu
"""
from datetime import timedelta, datetime
from temporalio import workflow
from temporalio.common import RetryPolicy
from dataclasses import dataclass
from typing import List

@dataclass
class ExpenseInput:
    user_id: int
    category: str
    amount: float
    description: str
    channel: str = "sms"

@dataclass
class ExpenseTrackingResult:
    expense_id: int
    ledger_entry_id: str
    daily_total: float
    weekly_total: float
    success: bool
    message: str


@workflow.defn
class DailyExpenseTrackingWorkflow:
    """
    Orchestrates daily expense tracking with scheduled weekly reports
    
    Steps:
    1. Parse SMS command
    2. Validate expense
    3. Record expense in database
    4. Create TigerBeetle ledger entry
    5. Send confirmation SMS
    6. Update daily summary
    7. Schedule weekly report (cron)
    8. Log to Kafka
    """
    
    @workflow.run
    async def run(self, expense: ExpenseInput) -> ExpenseTrackingResult:
        """Execute expense tracking workflow"""
        
        retry_policy = RetryPolicy(
            maximum_attempts=3,
            initial_interval=timedelta(seconds=1),
        )
        
        # Step 1: Parse SMS command (already done by messaging router)
        # Step 2: Validate expense
        validation_result = await workflow.execute_activity(
            "validate_expense",
            args=[expense],
            start_to_close_timeout=timedelta(seconds=10),
            retry_policy=retry_policy,
        )
        
        if not validation_result["valid"]:
            return ExpenseTrackingResult(
                expense_id=0,
                ledger_entry_id="",
                daily_total=0,
                weekly_total=0,
                success=False,
                message=f"Invalid expense: {validation_result['error']}"
            )
        
        # Step 3: Record expense in database
        expense_result = await workflow.execute_activity(
            "record_expense",
            args=[expense],
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=retry_policy,
        )
        
        expense_id = expense_result["expense_id"]
        
        # Step 4: Create TigerBeetle ledger entry (double-entry bookkeeping)
        ledger_result = await workflow.execute_activity(
            "create_ledger_entry",
            args=[{
                "user_id": expense.user_id,
                "transaction_type": "expense",
                "amount": -expense.amount,  # Negative for expense
                "currency": "NGN",
                "category": expense.category,
                "reference": f"expense_{expense_id}",
            }],
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=retry_policy,
        )
        
        ledger_entry_id = ledger_result["entry_id"]
        
        # Step 5: Send confirmation SMS
        confirmation = f"Expense recorded: ₦{expense.amount:,.0f} for {expense.category}. ID: {expense_id}"
        
        await workflow.execute_activity(
            "send_sms",
            args=[expense.user_id, confirmation],
            start_to_close_timeout=timedelta(seconds=10),
        )
        
        # Step 6: Update daily summary
        summary_result = await workflow.execute_activity(
            "get_daily_expense_summary",
            args=[expense.user_id, datetime.now().date()],
            start_to_close_timeout=timedelta(seconds=20),
        )
        
        daily_total = summary_result["total"]
        
        # Step 7: Get weekly total for context
        weekly_result = await workflow.execute_activity(
            "get_weekly_expense_summary",
            args=[expense.user_id],
            start_to_close_timeout=timedelta(seconds=20),
        )
        
        weekly_total = weekly_result["total"]
        
        # Step 8: Log to Kafka for event streaming
        await workflow.execute_activity(
            "publish_kafka_event",
            args=["expense.recorded", {
                "user_id": expense.user_id,
                "expense_id": expense_id,
                "amount": expense.amount,
                "category": expense.category,
                "channel": expense.channel,
                "timestamp": workflow.now(),
            }],
            start_to_close_timeout=timedelta(seconds=5),
        )
        
        # Log to Lakehouse
        await workflow.execute_activity(
            "log_to_lakehouse",
            args=[{
                "event_type": "expense_tracked",
                "user_id": expense.user_id,
                "expense_id": expense_id,
                "amount": expense.amount,
                "category": expense.category,
                "daily_total": daily_total,
                "channel": "sms",
            }],
            start_to_close_timeout=timedelta(seconds=10),
        )
        
        return ExpenseTrackingResult(
            expense_id=expense_id,
            ledger_entry_id=ledger_entry_id,
            daily_total=daily_total,
            weekly_total=weekly_total,
            success=True,
            message=f"Expense tracked. Daily total: ₦{daily_total:,.0f}"
        )


@workflow.defn
class WeeklyExpenseReportWorkflow:
    """
    Scheduled workflow for weekly expense reports
    Triggered every Sunday at 6 PM
    """
    
    @workflow.run
    async def run(self, user_id: int) -> dict:
        """Generate and send weekly expense report"""
        
        # Aggregate weekly expenses from Lakehouse
        report_data = await workflow.execute_activity(
            "aggregate_weekly_expenses",
            args=[user_id],
            start_to_close_timeout=timedelta(minutes=2),
        )
        
        # Format report message
        report_message = (
            f"Weekly Expense Report:\n"
            f"Total: ₦{report_data['total']:,.0f}\n"
            f"Fertilizer: ₦{report_data['fertilizer']:,.0f}\n"
            f"Labor: ₦{report_data['labor']:,.0f}\n"
            f"Seeds: ₦{report_data['seeds']:,.0f}\n"
            f"Other: ₦{report_data['other']:,.0f}"
        )
        
        # Send SMS report
        await workflow.execute_activity(
            "send_sms",
            args=[user_id, report_message],
            start_to_close_timeout=timedelta(seconds=10),
        )
        
        return {"success": True, "user_id": user_id}
