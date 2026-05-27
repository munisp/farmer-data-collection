from temporalio import activity

@activity.defn
async def validate_order(order_id: str) -> dict:
    return {"order_id": order_id, "valid": True}

@activity.defn
async def check_inventory(order_data: dict) -> bool:
    return True

@activity.defn
async def process_payment(order_data: dict) -> dict:
    return {"success": True, "payment_id": "pay_123"}

@activity.defn
async def notify_seller(order_data: dict):
    pass

@activity.defn
async def notify_buyer(data: dict):
    pass

@activity.defn
async def update_order_status(data: dict):
    pass

@activity.defn
async def create_shipping_label(order_data: dict) -> dict:
    return {"tracking_number": "TRACK123"}

@activity.defn
async def send_tracking_info(data: dict):
    pass
