"""
Order Processing Workflow
Handles the complete lifecycle of marketplace orders
"""
from datetime import timedelta
from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.order_activities import (
        validate_order,
        check_inventory,
        process_payment,
        notify_seller,
        notify_buyer,
        update_order_status,
        create_shipping_label,
        send_tracking_info,
    )


@workflow.defn
class OrderProcessingWorkflow:
    """
    Workflow for processing marketplace orders from creation to fulfillment
    """

    @workflow.run
    async def run(self, order_id: str) -> dict:
        """
        Execute the complete order processing workflow
        
        Args:
            order_id: Unique identifier for the order
            
        Returns:
            dict: Final order status and details
        """
        workflow.logger.info(f"Starting order processing for order_id={order_id}")

        retry_policy = RetryPolicy(
            initial_interval=timedelta(seconds=1),
            maximum_interval=timedelta(seconds=30),
            maximum_attempts=3,
        )

        try:
            # Step 1: Validate order
            workflow.logger.info("Step 1: Validating order")
            order_data = await workflow.execute_activity(
                validate_order,
                order_id,
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=retry_policy,
            )

            # Step 2: Check inventory
            workflow.logger.info("Step 2: Checking inventory")
            inventory_available = await workflow.execute_activity(
                check_inventory,
                order_data,
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=retry_policy,
            )

            if not inventory_available:
                workflow.logger.warning("Inventory not available")
                await workflow.execute_activity(
                    update_order_status,
                    {"order_id": order_id, "status": "cancelled", "reason": "out_of_stock"},
                    start_to_close_timeout=timedelta(seconds=10),
                )
                return {"status": "cancelled", "reason": "out_of_stock"}

            # Step 3: Process payment
            workflow.logger.info("Step 3: Processing payment")
            payment_result = await workflow.execute_activity(
                process_payment,
                order_data,
                start_to_close_timeout=timedelta(minutes=2),
                retry_policy=retry_policy,
            )

            if not payment_result.get("success"):
                workflow.logger.error("Payment failed")
                await workflow.execute_activity(
                    update_order_status,
                    {"order_id": order_id, "status": "payment_failed", "reason": payment_result.get("error")},
                    start_to_close_timeout=timedelta(seconds=10),
                )
                return {"status": "payment_failed", "error": payment_result.get("error")}

            # Step 4: Update order status to confirmed
            workflow.logger.info("Step 4: Confirming order")
            await workflow.execute_activity(
                update_order_status,
                {"order_id": order_id, "status": "confirmed", "payment_id": payment_result.get("payment_id")},
                start_to_close_timeout=timedelta(seconds=10),
            )

            # Step 5: Notify seller
            workflow.logger.info("Step 5: Notifying seller")
            await workflow.execute_activity(
                notify_seller,
                order_data,
                start_to_close_timeout=timedelta(seconds=30),
            )

            # Step 6: Notify buyer
            workflow.logger.info("Step 6: Notifying buyer")
            await workflow.execute_activity(
                notify_buyer,
                {"order_id": order_id, "status": "confirmed"},
                start_to_close_timeout=timedelta(seconds=30),
            )

            # Step 7: Wait for seller to prepare shipment (or timeout after 48 hours)
            workflow.logger.info("Step 7: Waiting for shipment preparation")
            shipment_ready = await workflow.wait_condition(
                lambda: self.shipment_prepared,
                timeout=timedelta(hours=48),
            )

            if not shipment_ready:
                workflow.logger.warning("Shipment preparation timeout")
                await workflow.execute_activity(
                    update_order_status,
                    {"order_id": order_id, "status": "delayed", "reason": "seller_timeout"},
                    start_to_close_timeout=timedelta(seconds=10),
                )
                return {"status": "delayed", "reason": "seller_timeout"}

            # Step 8: Create shipping label
            workflow.logger.info("Step 8: Creating shipping label")
            shipping_label = await workflow.execute_activity(
                create_shipping_label,
                order_data,
                start_to_close_timeout=timedelta(minutes=1),
                retry_policy=retry_policy,
            )

            # Step 9: Send tracking information
            workflow.logger.info("Step 9: Sending tracking information")
            await workflow.execute_activity(
                send_tracking_info,
                {"order_id": order_id, "tracking_number": shipping_label.get("tracking_number")},
                start_to_close_timeout=timedelta(seconds=30),
            )

            # Step 10: Update order status to shipped
            workflow.logger.info("Step 10: Marking order as shipped")
            await workflow.execute_activity(
                update_order_status,
                {
                    "order_id": order_id,
                    "status": "shipped",
                    "tracking_number": shipping_label.get("tracking_number"),
                },
                start_to_close_timeout=timedelta(seconds=10),
            )

            workflow.logger.info(f"Order processing completed for order_id={order_id}")
            return {
                "status": "shipped",
                "order_id": order_id,
                "tracking_number": shipping_label.get("tracking_number"),
                "payment_id": payment_result.get("payment_id"),
            }

        except Exception as e:
            workflow.logger.error(f"Order processing failed: {str(e)}")
            await workflow.execute_activity(
                update_order_status,
                {"order_id": order_id, "status": "error", "error": str(e)},
                start_to_close_timeout=timedelta(seconds=10),
            )
            raise

    @workflow.signal
    def mark_shipment_prepared(self):
        """Signal that seller has prepared the shipment"""
        self.shipment_prepared = True
        workflow.logger.info("Shipment marked as prepared")

    @workflow.query
    def get_status(self) -> str:
        """Query the current workflow status"""
        return "processing"
