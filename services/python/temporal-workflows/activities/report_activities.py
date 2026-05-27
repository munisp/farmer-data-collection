from temporalio import activity

@activity.defn
async def gather_report_data(config: dict) -> dict:
    return {}

@activity.defn
async def calculate_metrics(data: dict) -> dict:
    return {"summary": {}}

@activity.defn
async def generate_charts(params: dict) -> list:
    return []

@activity.defn
async def create_pdf_report(params: dict) -> str:
    return "/tmp/report.pdf"

@activity.defn
async def create_html_report(params: dict) -> str:
    return "/tmp/report.html"

@activity.defn
async def upload_report(params: dict) -> str:
    return "https://example.com/report.pdf"

@activity.defn
async def distribute_report(params: dict) -> dict:
    return {"count": 1}

@activity.defn
async def archive_report(params: dict):
    pass
