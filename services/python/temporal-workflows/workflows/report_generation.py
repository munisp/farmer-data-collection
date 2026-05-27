"""
Report Generation Workflow
Handles automated report generation and distribution
"""
from datetime import timedelta
from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.report_activities import (
        gather_report_data,
        calculate_metrics,
        generate_charts,
        create_pdf_report,
        create_html_report,
        upload_report,
        distribute_report,
        archive_report,
    )


@workflow.defn
class ReportGenerationWorkflow:
    """
    Workflow for generating and distributing automated reports
    """

    @workflow.run
    async def run(self, report_config: dict) -> dict:
        """
        Execute the report generation workflow
        
        Args:
            report_config: Report configuration including:
                - report_type: Type of report (weekly, monthly, custom)
                - recipients: List of user IDs to receive the report
                - date_range: Date range for the report
                - sections: List of sections to include
                - format: Output format (pdf, html, both)
                
        Returns:
            dict: Report generation result with URLs
        """
        report_type = report_config.get("report_type")
        workflow.logger.info(f"Starting report generation: type={report_type}")

        retry_policy = RetryPolicy(
            initial_interval=timedelta(seconds=2),
            maximum_interval=timedelta(seconds=60),
            maximum_attempts=3,
        )

        try:
            # Step 1: Gather report data
            workflow.logger.info("Step 1: Gathering report data")
            report_data = await workflow.execute_activity(
                gather_report_data,
                report_config,
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=retry_policy,
            )

            # Step 2: Calculate metrics
            workflow.logger.info("Step 2: Calculating metrics")
            metrics = await workflow.execute_activity(
                calculate_metrics,
                report_data,
                start_to_close_timeout=timedelta(minutes=3),
                retry_policy=retry_policy,
            )

            # Step 3: Generate charts
            workflow.logger.info("Step 3: Generating charts")
            charts = await workflow.execute_activity(
                generate_charts,
                {
                    "data": report_data,
                    "metrics": metrics,
                    "chart_types": report_config.get("chart_types", []),
                },
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=retry_policy,
            )

            # Step 4: Create reports in requested formats
            report_urls = {}
            output_format = report_config.get("format", "pdf")

            if output_format in ["pdf", "both"]:
                workflow.logger.info("Step 4a: Creating PDF report")
                pdf_path = await workflow.execute_activity(
                    create_pdf_report,
                    {
                        "data": report_data,
                        "metrics": metrics,
                        "charts": charts,
                        "config": report_config,
                    },
                    start_to_close_timeout=timedelta(minutes=5),
                    retry_policy=retry_policy,
                )

                # Upload PDF
                pdf_url = await workflow.execute_activity(
                    upload_report,
                    {"file_path": pdf_path, "format": "pdf"},
                    start_to_close_timeout=timedelta(minutes=2),
                    retry_policy=retry_policy,
                )
                report_urls["pdf"] = pdf_url

            if output_format in ["html", "both"]:
                workflow.logger.info("Step 4b: Creating HTML report")
                html_path = await workflow.execute_activity(
                    create_html_report,
                    {
                        "data": report_data,
                        "metrics": metrics,
                        "charts": charts,
                        "config": report_config,
                    },
                    start_to_close_timeout=timedelta(minutes=3),
                    retry_policy=retry_policy,
                )

                # Upload HTML
                html_url = await workflow.execute_activity(
                    upload_report,
                    {"file_path": html_path, "format": "html"},
                    start_to_close_timeout=timedelta(minutes=2),
                    retry_policy=retry_policy,
                )
                report_urls["html"] = html_url

            # Step 5: Distribute report to recipients
            workflow.logger.info("Step 5: Distributing report")
            distribution_result = await workflow.execute_activity(
                distribute_report,
                {
                    "recipients": report_config.get("recipients", []),
                    "report_urls": report_urls,
                    "report_type": report_type,
                    "metrics_summary": metrics.get("summary", {}),
                },
                start_to_close_timeout=timedelta(minutes=2),
                retry_policy=retry_policy,
            )

            # Step 6: Archive report
            workflow.logger.info("Step 6: Archiving report")
            await workflow.execute_activity(
                archive_report,
                {
                    "report_urls": report_urls,
                    "report_config": report_config,
                    "metrics": metrics,
                },
                start_to_close_timeout=timedelta(seconds=30),
            )

            workflow.logger.info(f"Report generation completed: type={report_type}")
            return {
                "status": "completed",
                "report_urls": report_urls,
                "recipients_notified": distribution_result.get("count", 0),
                "metrics_summary": metrics.get("summary", {}),
            }

        except Exception as e:
            workflow.logger.error(f"Report generation failed: {str(e)}")
            raise


@workflow.defn
class ScheduledReportWorkflow:
    """
    Workflow for scheduled recurring reports
    """

    @workflow.run
    async def run(self, schedule_config: dict) -> dict:
        """
        Execute scheduled report generation
        
        Args:
            schedule_config: Schedule configuration including:
                - frequency: daily, weekly, monthly
                - report_config: Base report configuration
                - start_date: When to start generating reports
                - end_date: Optional end date for the schedule
                
        Returns:
            dict: Schedule execution result
        """
        frequency = schedule_config.get("frequency")
        workflow.logger.info(f"Starting scheduled report workflow: frequency={frequency}")

        report_config = schedule_config.get("report_config", {})
        
        # Determine interval based on frequency
        if frequency == "daily":
            interval = timedelta(days=1)
        elif frequency == "weekly":
            interval = timedelta(weeks=1)
        elif frequency == "monthly":
            interval = timedelta(days=30)
        else:
            raise ValueError(f"Invalid frequency: {frequency}")

        reports_generated = 0
        
        while True:
            # Generate report
            workflow.logger.info(f"Generating scheduled report #{reports_generated + 1}")
            
            try:
                await workflow.execute_child_workflow(
                    ReportGenerationWorkflow.run,
                    report_config,
                    id=f"report-{frequency}-{workflow.now().isoformat()}",
                )
                reports_generated += 1
            except Exception as e:
                workflow.logger.error(f"Scheduled report generation failed: {str(e)}")

            # Wait for next interval
            await workflow.sleep(interval)

            # Check if we should stop (via signal or end_date)
            if hasattr(self, "should_stop") and self.should_stop:
                break

        workflow.logger.info(f"Scheduled report workflow completed: {reports_generated} reports generated")
        return {
            "status": "completed",
            "reports_generated": reports_generated,
        }

    @workflow.signal
    def stop_schedule(self):
        """Signal to stop the scheduled report generation"""
        self.should_stop = True
        workflow.logger.info("Scheduled report workflow stopping")
