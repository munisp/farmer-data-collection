"""
OpenSearch Integration Service

Provides full-text search and audit-log indexing for the farming platform:
  - Farmer, farm, crop, and marketplace full-text search
  - Audit event indexing and querying
  - Bulk indexing for batch operations
  - Health checks and index management

Runs on port 8091 by default (configurable via OPENSEARCH_SERVICE_PORT).
"""

import logging
import os
import signal
import sys
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

load_dotenv()

logger = logging.getLogger("opensearch-service")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

OPENSEARCH_URL = os.getenv("OPENSEARCH_URL", "http://localhost:9200")
OPENSEARCH_USER = os.getenv("OPENSEARCH_USER")
OPENSEARCH_PASSWORD = os.getenv("OPENSEARCH_PASSWORD")
SERVICE_PORT = int(os.getenv("OPENSEARCH_SERVICE_PORT", "8091"))

# Circuit breaker state
_failure_count = 0
_failure_threshold = 5
_last_failure_time = 0.0
_reset_timeout = 30.0
_circuit_state = "CLOSED"

INDICES = {
    "farmers": {
        "settings": {"number_of_shards": 1, "number_of_replicas": 0},
        "mappings": {
            "properties": {
                "name": {"type": "text", "analyzer": "standard"},
                "location": {"type": "text"},
                "phone": {"type": "keyword"},
                "region": {"type": "keyword"},
                "crops": {"type": "text"},
                "created_at": {"type": "date"},
                "updated_at": {"type": "date"},
            }
        },
    },
    "farms": {
        "settings": {"number_of_shards": 1, "number_of_replicas": 0},
        "mappings": {
            "properties": {
                "name": {"type": "text"},
                "farmer_id": {"type": "integer"},
                "location": {"type": "text"},
                "size_hectares": {"type": "float"},
                "soil_type": {"type": "keyword"},
                "created_at": {"type": "date"},
            }
        },
    },
    "crops": {
        "settings": {"number_of_shards": 1, "number_of_replicas": 0},
        "mappings": {
            "properties": {
                "name": {"type": "text"},
                "farm_id": {"type": "integer"},
                "variety": {"type": "text"},
                "status": {"type": "keyword"},
                "planted_date": {"type": "date"},
                "expected_harvest": {"type": "date"},
            }
        },
    },
    "audit-events": {
        "settings": {"number_of_shards": 2, "number_of_replicas": 0},
        "mappings": {
            "properties": {
                "event_type": {"type": "keyword"},
                "entity_type": {"type": "keyword"},
                "entity_id": {"type": "keyword"},
                "user_id": {"type": "keyword"},
                "action": {"type": "keyword"},
                "details": {"type": "text"},
                "timestamp": {"type": "date"},
            }
        },
    },
    "marketplace-listings": {
        "settings": {"number_of_shards": 1, "number_of_replicas": 0},
        "mappings": {
            "properties": {
                "title": {"type": "text", "analyzer": "standard"},
                "description": {"type": "text"},
                "category": {"type": "keyword"},
                "price": {"type": "float"},
                "currency": {"type": "keyword"},
                "seller_id": {"type": "integer"},
                "location": {"type": "text"},
                "status": {"type": "keyword"},
                "created_at": {"type": "date"},
            }
        },
    },
}

# OpenSearch client (lazy init)
_os_client: Any = None


def _circuit_allow() -> bool:
    global _circuit_state
    if _circuit_state == "CLOSED":
        return True
    if _circuit_state == "OPEN" and (time.time() - _last_failure_time) > _reset_timeout:
        _circuit_state = "HALF_OPEN"
        return True
    return _circuit_state == "HALF_OPEN"


def _circuit_success() -> None:
    global _failure_count, _circuit_state
    _failure_count = 0
    _circuit_state = "CLOSED"


def _circuit_failure() -> None:
    global _failure_count, _last_failure_time, _circuit_state
    _failure_count += 1
    _last_failure_time = time.time()
    if _failure_count >= _failure_threshold:
        _circuit_state = "OPEN"
        logger.warning("Circuit breaker OPEN after %d failures", _failure_count)


def get_client():
    global _os_client
    if _os_client is not None:
        return _os_client
    if not _circuit_allow():
        return None
    try:
        from opensearchpy import OpenSearch

        auth = None
        if OPENSEARCH_USER and OPENSEARCH_PASSWORD:
            auth = (OPENSEARCH_USER, OPENSEARCH_PASSWORD)
        _os_client = OpenSearch(
            hosts=[OPENSEARCH_URL],
            http_auth=auth,
            use_ssl=OPENSEARCH_URL.startswith("https"),
            verify_certs=False,
            timeout=10,
        )
        _os_client.info()
        _circuit_success()
        logger.info("Connected to OpenSearch at %s", OPENSEARCH_URL)
        return _os_client
    except Exception as e:
        _circuit_failure()
        logger.warning("OpenSearch unavailable: %s", e)
        _os_client = None
        return None


async def ensure_indices():
    client = get_client()
    if not client:
        return
    for name, config in INDICES.items():
        try:
            if not client.indices.exists(index=name):
                client.indices.create(index=name, body=config)
                logger.info("Created index: %s", name)
        except Exception as e:
            logger.warning("Failed to create index %s: %s", name, e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_indices()
    yield
    if _os_client:
        _os_client.close()
        logger.info("OpenSearch connection closed")


app = FastAPI(
    title="OpenSearch Integration Service",
    version="1.0.0",
    lifespan=lifespan,
)


class IndexRequest(BaseModel):
    index: str
    id: str
    document: dict


class SearchRequest(BaseModel):
    index: str
    query: str
    size: int = 20


class BulkIndexRequest(BaseModel):
    index: str
    documents: list[dict]


class AuditEventRequest(BaseModel):
    event_type: str
    entity_type: str
    entity_id: str
    user_id: str
    action: str
    details: str | None = None


@app.get("/health")
async def health():
    client = get_client()
    status = "connected" if client else "disconnected"
    return {
        "status": "healthy",
        "opensearch": status,
        "circuit_breaker": _circuit_state,
        "timestamp": datetime.utcnow().isoformat(),
        "indices": list(INDICES.keys()),
    }


@app.post("/index")
async def index_document(req: IndexRequest):
    client = get_client()
    if not client:
        raise HTTPException(status_code=503, detail="OpenSearch unavailable")
    try:
        client.index(index=req.index, id=req.id, body=req.document)
        return {"status": "indexed", "index": req.index, "id": req.id}
    except Exception as e:
        _circuit_failure()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search")
async def search_documents(req: SearchRequest):
    client = get_client()
    if not client:
        return {"results": [], "total": 0, "opensearch_available": False}
    try:
        body = {
            "size": req.size,
            "query": {"multi_match": {"query": req.query, "fields": ["*"], "fuzziness": "AUTO"}},
        }
        response = client.search(index=req.index, body=body)
        hits = response.get("hits", {}).get("hits", [])
        return {
            "results": [
                {"id": h["_id"], "score": h["_score"], "source": h["_source"]}
                for h in hits
            ],
            "total": response.get("hits", {}).get("total", {}).get("value", 0),
        }
    except Exception as e:
        _circuit_failure()
        logger.warning("Search failed: %s", e)
        return {"results": [], "total": 0, "error": str(e)}


@app.post("/bulk-index")
async def bulk_index(req: BulkIndexRequest):
    client = get_client()
    if not client:
        raise HTTPException(status_code=503, detail="OpenSearch unavailable")
    try:
        from opensearchpy.helpers import bulk

        actions = []
        for doc in req.documents:
            doc_id = doc.pop("id", None) or doc.pop("_id", None)
            action = {"_index": req.index, "_source": doc}
            if doc_id:
                action["_id"] = str(doc_id)
            actions.append(action)
        success, errors = bulk(client, actions, raise_on_error=False)
        return {"indexed": success, "errors": len(errors) if errors else 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/audit")
async def index_audit_event(req: AuditEventRequest):
    client = get_client()
    if not client:
        logger.warning("Audit event not indexed — OpenSearch unavailable")
        return {"status": "skipped", "reason": "opensearch_unavailable"}
    try:
        doc = {
            "event_type": req.event_type,
            "entity_type": req.entity_type,
            "entity_id": req.entity_id,
            "user_id": req.user_id,
            "action": req.action,
            "details": req.details,
            "timestamp": datetime.utcnow().isoformat(),
        }
        client.index(index="audit-events", body=doc)
        return {"status": "indexed"}
    except Exception as e:
        _circuit_failure()
        return {"status": "error", "detail": str(e)}


@app.delete("/index/{index_name}/{doc_id}")
async def delete_document(index_name: str, doc_id: str):
    client = get_client()
    if not client:
        raise HTTPException(status_code=503, detail="OpenSearch unavailable")
    try:
        client.delete(index=index_name, id=doc_id, ignore=[404])
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def main():
    import uvicorn

    def handle_signal(signum, _frame):
        logger.info("Received signal %d, shutting down...", signum)
        sys.exit(0)

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    uvicorn.run(app, host="0.0.0.0", port=SERVICE_PORT, log_level="info")


if __name__ == "__main__":
    main()
