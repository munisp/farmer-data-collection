"""Shared PostgreSQL connection pool for Python microservices."""
import os
import logging
from contextlib import asynccontextmanager
from typing import Optional

logger = logging.getLogger(__name__)

_pool = None


def get_dsn() -> str:
    """Build PostgreSQL DSN from environment variables."""
    dsn = os.getenv("DATABASE_URL")
    if dsn:
        return dsn
    return "postgresql://{user}:{password}@{host}:{port}/{dbname}".format(
        user=os.getenv("DB_USER", "farmconnect"),
        password=os.getenv("DB_PASSWORD", "farmconnect"),
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME", "farmconnect"),
    )


async def get_pool():
    """Get or create asyncpg connection pool."""
    global _pool
    if _pool is not None:
        return _pool
    try:
        import asyncpg
        _pool = await asyncpg.create_pool(
            dsn=get_dsn(),
            min_size=2,
            max_size=10,
            command_timeout=30,
        )
        logger.info("[DB] asyncpg pool created")
        return _pool
    except ImportError:
        logger.warning("[DB] asyncpg not installed, using psycopg2 fallback")
        return None
    except Exception as e:
        logger.warning(f"[DB] Pool creation failed: {e}")
        return None


async def execute(query: str, *args) -> Optional[list]:
    """Execute a query and return results."""
    pool = await get_pool()
    if pool is None:
        return None
    try:
        async with pool.acquire() as conn:
            return await conn.fetch(query, *args)
    except Exception as e:
        logger.error(f"[DB] Query error: {e}")
        return None


async def execute_one(query: str, *args):
    """Execute a query and return one row."""
    pool = await get_pool()
    if pool is None:
        return None
    try:
        async with pool.acquire() as conn:
            return await conn.fetchrow(query, *args)
    except Exception as e:
        logger.error(f"[DB] Query error: {e}")
        return None


async def execute_command(query: str, *args) -> bool:
    """Execute a command (INSERT/UPDATE/DELETE)."""
    pool = await get_pool()
    if pool is None:
        return False
    try:
        async with pool.acquire() as conn:
            await conn.execute(query, *args)
            return True
    except Exception as e:
        logger.error(f"[DB] Command error: {e}")
        return False


async def close_pool():
    """Close the connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
