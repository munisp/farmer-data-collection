from temporalio import activity

@activity.defn
async def validate_export_request(request: dict) -> dict:
    return {"total_records": 1000, "batch_size": 100}

@activity.defn
async def fetch_data_batch(params: dict) -> list:
    return []

@activity.defn
async def transform_data(params: dict) -> list:
    return []

@activity.defn
async def write_to_file(params: dict) -> str:
    return "/tmp/export.csv"

@activity.defn
async def upload_to_storage(params: dict) -> dict:
    return {"download_url": "https://example.com/export.csv", "file_size": 1024}

@activity.defn
async def send_download_link(params: dict):
    pass

@activity.defn
async def cleanup_temp_files(file_path: str):
    pass
