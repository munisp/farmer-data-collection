"""
Temporal Worker
Runs workflow and activity workers
"""
import asyncio
import logging
from temporalio.client import Client
from temporalio.worker import Worker

# Import workflows
from workflows.order_processing import OrderProcessingWorkflow
from workflows.data_export import DataExportWorkflow
from workflows.report_generation import ReportGenerationWorkflow, ScheduledReportWorkflow

# Import activities (placeholder imports - actual implementations would be in activities/)
from activities import order_activities, export_activities, report_activities

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main():
    """
    Start the Temporal worker
    """
    # Connect to Temporal server
    temporal_host = "localhost:7233"  # Default Temporal server address
    logger.info(f"Connecting to Temporal server at {temporal_host}")
    
    client = await Client.connect(temporal_host)
    logger.info("Connected to Temporal server")

    # Create worker for order processing
    order_worker = Worker(
        client,
        task_queue="order-processing-queue",
        workflows=[OrderProcessingWorkflow],
        activities=[
            order_activities.validate_order,
            order_activities.check_inventory,
            order_activities.process_payment,
            order_activities.notify_seller,
            order_activities.notify_buyer,
            order_activities.update_order_status,
            order_activities.create_shipping_label,
            order_activities.send_tracking_info,
        ],
    )

    # Create worker for data export
    export_worker = Worker(
        client,
        task_queue="data-export-queue",
        workflows=[DataExportWorkflow],
        activities=[
            export_activities.validate_export_request,
            export_activities.fetch_data_batch,
            export_activities.transform_data,
            export_activities.write_to_file,
            export_activities.upload_to_storage,
            export_activities.send_download_link,
            export_activities.cleanup_temp_files,
        ],
    )

    # Create worker for report generation
    report_worker = Worker(
        client,
        task_queue="report-generation-queue",
        workflows=[ReportGenerationWorkflow, ScheduledReportWorkflow],
        activities=[
            report_activities.gather_report_data,
            report_activities.calculate_metrics,
            report_activities.generate_charts,
            report_activities.create_pdf_report,
            report_activities.create_html_report,
            report_activities.upload_report,
            report_activities.distribute_report,
            report_activities.archive_report,
        ],
    )

    # Run all workers
    logger.info("Starting Temporal workers...")
    await asyncio.gather(
        order_worker.run(),
        export_worker.run(),
        report_worker.run(),
    )


if __name__ == "__main__":
    asyncio.run(main())
