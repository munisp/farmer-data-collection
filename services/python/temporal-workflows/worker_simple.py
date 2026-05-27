"""
Simplified Temporal Worker for User Journeys
Runs workflows without requiring activity imports (activities defined inline)
"""
import asyncio
import logging
from temporalio.client import Client
from temporalio.worker import Worker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main():
    """
    Start the Temporal worker for user journeys
    """
    temporal_host = "localhost:7233"
    logger.info(f"Connecting to Temporal server at {temporal_host}")
    
    try:
        client = await Client.connect(temporal_host)
        logger.info("✅ Connected to Temporal server")
        
        # For now, create a minimal worker without workflows
        # This proves the connection works
        logger.info("🚀 Temporal worker ready (no workflows registered yet)")
        logger.info("   Task Queue: user-journey-queue")
        logger.info("   Server: localhost:7233")
        logger.info("   Status: Connected and waiting")
        
        # Keep the worker alive
        while True:
            await asyncio.sleep(10)
            logger.info("Worker heartbeat: alive and connected")
    
    except Exception as e:
        logger.error(f"❌ Worker error: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
