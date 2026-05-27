"""
Data Export Workflow
Handles bulk data exports with progress tracking
"""
from datetime import timedelta
from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.export_activities import (
        validate_export_request,
        fetch_data_batch,
        transform_data,
        write_to_file,
        upload_to_storage,
        send_download_link,
        cleanup_temp_files,
    )


@workflow.defn
class DataExportWorkflow:
    """
    Workflow for exporting large datasets with progress tracking
    """

    def __init__(self):
        self.progress = 0
        self.total_records = 0
        self.exported_records = 0
        self.status = "initializing"

    @workflow.run
    async def run(self, export_request: dict) -> dict:
        """
        Execute the data export workflow
        
        Args:
            export_request: Export configuration including:
                - user_id: User requesting the export
                - export_type: Type of data to export (farmers, crops, sales, etc.)
                - format: Output format (csv, json, xlsx)
                - filters: Optional filters for data selection
                - date_range: Optional date range
                
        Returns:
            dict: Export result with download URL
        """
        user_id = export_request.get("user_id")
        export_type = export_request.get("export_type")
        
        workflow.logger.info(f"Starting data export: user_id={user_id}, type={export_type}")

        retry_policy = RetryPolicy(
            initial_interval=timedelta(seconds=2),
            maximum_interval=timedelta(seconds=60),
            maximum_attempts=5,
        )

        try:
            # Step 1: Validate export request
            self.status = "validating"
            workflow.logger.info("Step 1: Validating export request")
            validation_result = await workflow.execute_activity(
                validate_export_request,
                export_request,
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=retry_policy,
            )

            self.total_records = validation_result.get("total_records", 0)
            batch_size = validation_result.get("batch_size", 1000)
            total_batches = (self.total_records + batch_size - 1) // batch_size

            workflow.logger.info(f"Total records: {self.total_records}, batches: {total_batches}")

            # Step 2: Process data in batches
            self.status = "exporting"
            temp_file_path = None
            
            for batch_num in range(total_batches):
                workflow.logger.info(f"Processing batch {batch_num + 1}/{total_batches}")
                
                # Fetch batch
                batch_data = await workflow.execute_activity(
                    fetch_data_batch,
                    {
                        "export_request": export_request,
                        "batch_num": batch_num,
                        "batch_size": batch_size,
                    },
                    start_to_close_timeout=timedelta(minutes=5),
                    retry_policy=retry_policy,
                )

                # Transform data
                transformed_data = await workflow.execute_activity(
                    transform_data,
                    {
                        "data": batch_data,
                        "format": export_request.get("format"),
                    },
                    start_to_close_timeout=timedelta(minutes=2),
                    retry_policy=retry_policy,
                )

                # Write to file
                temp_file_path = await workflow.execute_activity(
                    write_to_file,
                    {
                        "data": transformed_data,
                        "file_path": temp_file_path,
                        "is_first_batch": batch_num == 0,
                        "format": export_request.get("format"),
                    },
                    start_to_close_timeout=timedelta(minutes=3),
                    retry_policy=retry_policy,
                )

                # Update progress
                self.exported_records += len(batch_data)
                self.progress = int((self.exported_records / self.total_records) * 100)
                workflow.logger.info(f"Progress: {self.progress}%")

                # Add small delay between batches to avoid overwhelming the system
                if batch_num < total_batches - 1:
                    await workflow.sleep(timedelta(seconds=1))

            # Step 3: Upload to storage
            self.status = "uploading"
            workflow.logger.info("Step 3: Uploading to storage")
            upload_result = await workflow.execute_activity(
                upload_to_storage,
                {
                    "file_path": temp_file_path,
                    "user_id": user_id,
                    "export_type": export_type,
                },
                start_to_close_timeout=timedelta(minutes=10),
                retry_policy=retry_policy,
            )

            download_url = upload_result.get("download_url")
            file_size = upload_result.get("file_size")

            # Step 4: Send download link to user
            self.status = "notifying"
            workflow.logger.info("Step 4: Sending download link")
            await workflow.execute_activity(
                send_download_link,
                {
                    "user_id": user_id,
                    "download_url": download_url,
                    "export_type": export_type,
                    "file_size": file_size,
                    "record_count": self.total_records,
                },
                start_to_close_timeout=timedelta(seconds=30),
            )

            # Step 5: Cleanup temporary files
            workflow.logger.info("Step 5: Cleaning up temporary files")
            await workflow.execute_activity(
                cleanup_temp_files,
                temp_file_path,
                start_to_close_timeout=timedelta(seconds=30),
            )

            self.status = "completed"
            self.progress = 100

            workflow.logger.info(f"Data export completed: {self.total_records} records")
            return {
                "status": "completed",
                "download_url": download_url,
                "total_records": self.total_records,
                "file_size": file_size,
            }

        except Exception as e:
            self.status = "failed"
            workflow.logger.error(f"Data export failed: {str(e)}")
            raise

    @workflow.query
    def get_progress(self) -> dict:
        """Query the current export progress"""
        return {
            "status": self.status,
            "progress": self.progress,
            "total_records": self.total_records,
            "exported_records": self.exported_records,
        }
