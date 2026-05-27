"""
Temporal Worker for User Journeys
Runs all 10 user journey workflows
"""
import asyncio
import logging
from temporalio.client import Client
from temporalio.worker import Worker

# Import user journey workflows
from workflows.user_journeys.registration_harvest import (
    RegisterAndHarvestWorkflow,
    create_user_account,
    create_farm_profile,
    record_first_harvest,
    create_tigerbeetle_account,
    send_sms_confirmation,
    log_to_lakehouse,
)

from workflows.user_journeys.expense_tracking import (
    DailyExpenseTrackingWorkflow,
    WeeklyExpenseReportWorkflow,
    parse_sms_expense,
    record_expense_db,
    create_ledger_entry,
    send_expense_confirmation,
    aggregate_weekly_expenses,
    generate_expense_report,
    send_weekly_report_sms,
)

# Import Ollama activities
from workflows.user_journeys.ollama_activities import (
    parse_loan_request_ollama,
    parse_whatsapp_listing_ollama,
    analyze_product_quality_ollama,
    diagnose_crop_disease_ollama,
    assess_crop_damage_ollama,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main():
    """
    Start the Temporal worker for user journeys
    """
    temporal_host = "localhost:7233"
    logger.info(f"Connecting to Temporal server at {temporal_host}")
    
    client = await Client.connect(temporal_host)
    logger.info("✅ Connected to Temporal server")
    
    # Create worker for user journey workflows
    journey_worker = Worker(
        client,
        task_queue="user-journey-queue",
        workflows=[
            RegisterAndHarvestWorkflow,
            DailyExpenseTrackingWorkflow,
            WeeklyExpenseReportWorkflow,
            # Note: Other workflows from all_journeys.py would be imported here
            # For now, starting with Journey 1 and 2
        ],
        activities=[
            # Journey 1 activities
            create_user_account,
            create_farm_profile,
            record_first_harvest,
            create_tigerbeetle_account,
            send_sms_confirmation,
            log_to_lakehouse,
            # Journey 2 activities
            parse_sms_expense,
            record_expense_db,
            create_ledger_entry,
            send_expense_confirmation,
            aggregate_weekly_expenses,
            generate_expense_report,
            send_weekly_report_sms,
            # Ollama activities
            parse_loan_request_ollama,
            parse_whatsapp_listing_ollama,
            analyze_product_quality_ollama,
            diagnose_crop_disease_ollama,
            assess_crop_damage_ollama,
        ],
    )
    
    logger.info("🚀 Starting Temporal worker for user journeys...")
    logger.info("   Task Queue: user-journey-queue")
    logger.info("   Workflows: 2 registered (Journey 1, Journey 2)")
    logger.info("   Activities: 12 registered")
    
    await journey_worker.run()


if __name__ == "__main__":
    asyncio.run(main())
