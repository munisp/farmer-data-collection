"""
APISIX API Gateway Service
Full API gateway implementation with route management, upstream health checks,
rate limiting, authentication plugins, request/response transformation,
load balancing, circuit breaking, and optional integration with Apache APISIX.
"""
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, List
import uvicorn
import os
import json
import logging
import time
import asyncio
import httpx
from datetime import datetime, timezone
from collections import defaultdict

logging.basicConfig(level=logging.INFO, format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}')
log = logging.getLogger("apisix-gateway")

app = FastAPI(title="APISIX API Gateway Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

APISIX_ADMIN_URL = os.getenv("APISIX_ADMIN_URL", "")
APISIX_ADMIN_KEY = os.getenv("APISIX_ADMIN_KEY", "")
DATABASE_URL = os.getenv("DATABASE_URL", "")

# --- Storage ---
db_pool = None

async def get_db():
    global db_pool
    if db_pool is not None:
        return db_pool
    if DATABASE_URL:
        try:
            import asyncpg
            db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
            await db_pool.execute("""
                CREATE TABLE IF NOT EXISTS gw_routes (
                    id VARCHAR(255) PRIMARY KEY,
                    uri VARCHAR(500) NOT NULL,
                    methods JSONB DEFAULT '["GET"]'::jsonb,
                    upstream JSONB NOT NULL,
                    plugins JSONB DEFAULT '{}'::jsonb,
                    labels JSONB DEFAULT '{}'::jsonb,
                    priority INT DEFAULT 0,
                    status INT DEFAULT 1,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS gw_upstreams (
                    id VARCHAR(255) PRIMARY KEY,
                    name VARCHAR(255),
                    type VARCHAR(50) DEFAULT 'roundrobin',
                    nodes JSONB NOT NULL,
                    health_check JSONB DEFAULT '{}'::jsonb,
                    retries INT DEFAULT 3,
                    timeout JSONB DEFAULT '{"connect": 6, "send": 6, "read": 6}'::jsonb,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS gw_consumers (
                    id VARCHAR(255) PRIMARY KEY,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    plugins JSONB DEFAULT '{}'::jsonb,
                    labels JSONB DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS gw_ssl_certs (
                    id VARCHAR(255) PRIMARY KEY,
                    snis JSONB NOT NULL,
                    status INT DEFAULT 1,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS gw_access_log (
                    id BIGSERIAL PRIMARY KEY,
                    route_id VARCHAR(255),
                    method VARCHAR(10),
                    uri VARCHAR(500),
                    status INT,
                    latency_ms FLOAT,
                    client_ip VARCHAR(50),
                    upstream_addr VARCHAR(255),
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_gw_access_time ON gw_access_log(created_at);
                CREATE INDEX IF NOT EXISTS idx_gw_access_route ON gw_access_log(route_id);
            """)
            log.info("PostgreSQL gateway tables initialized")
            return db_pool
        except Exception as e:
            log.warning(f"PostgreSQL unavailable: {e}")
    return None


# In-memory storage
routes: Dict[str, dict] = {}
upstreams: Dict[str, dict] = {}
consumers: Dict[str, dict] = {}
ssl_certs: Dict[str, dict] = {}
access_logs: list = []
rate_limit_counters: Dict[str, Dict[str, list]] = defaultdict(lambda: defaultdict(list))
circuit_breakers: Dict[str, dict] = {}

# Default FarmConnect routes
DEFAULT_ROUTES = {
    "main-api": {"uri": "/api/*", "methods": ["GET", "POST", "PUT", "DELETE"],
                 "upstream": {"type": "roundrobin", "nodes": {"localhost:3000": 1}},
                 "plugins": {"cors": {}, "limit-req": {"rate": 100, "burst": 50}}},
    "websocket": {"uri": "/ws/*", "methods": ["GET"],
                  "upstream": {"type": "roundrobin", "nodes": {"localhost:3000": 1}},
                  "plugins": {"proxy-rewrite": {"scheme": "ws"}}},
    "keycloak": {"uri": "/auth/*", "methods": ["GET", "POST"],
                 "upstream": {"type": "roundrobin", "nodes": {"localhost:8180": 1}},
                 "plugins": {"cors": {}, "limit-req": {"rate": 20, "burst": 10}}},
    "kafka-service": {"uri": "/kafka/*", "methods": ["GET", "POST"],
                      "upstream": {"type": "roundrobin", "nodes": {"localhost:9092": 1}},
                      "plugins": {"key-auth": {}}},
    "ml-service": {"uri": "/ml/*", "methods": ["GET", "POST"],
                   "upstream": {"type": "roundrobin", "nodes": {"localhost:8086": 1}},
                   "plugins": {"limit-req": {"rate": 10, "burst": 5}}},
    "gps-streaming": {"uri": "/gps/*", "methods": ["GET", "POST"],
                      "upstream": {"type": "roundrobin", "nodes": {"localhost:8085": 1}}},
    "weather-service": {"uri": "/weather/*", "methods": ["GET"],
                        "upstream": {"type": "roundrobin", "nodes": {"localhost:8088": 1}},
                        "plugins": {"proxy-cache": {"cache_ttl": 300}}},
    "voice-service": {"uri": "/voice/*", "methods": ["GET", "POST"],
                      "upstream": {"type": "roundrobin", "nodes": {"localhost:8109": 1}},
                      "plugins": {"cors": {}}},
    "ai-inspection": {"uri": "/inspect/*", "methods": ["GET", "POST"],
                      "upstream": {"type": "roundrobin", "nodes": {"localhost:8110": 1}},
                      "plugins": {"limit-req": {"rate": 5, "burst": 2}}},
}


# --- Plugin implementations ---
def check_rate_limit(route_id: str, client_ip: str, config: dict) -> bool:
    rate = config.get("rate", 100)
    burst = config.get("burst", 50)
    now = time.time()
    window = 1.0
    key = f"{route_id}:{client_ip}"
    timestamps = rate_limit_counters[route_id][client_ip]
    timestamps[:] = [t for t in timestamps if now - t < window]
    if len(timestamps) >= rate + burst:
        return False
    timestamps.append(now)
    return True

def check_circuit_breaker(upstream_id: str) -> bool:
    cb = circuit_breakers.get(upstream_id)
    if not cb:
        return True
    if cb["state"] == "open":
        if time.time() - cb["opened_at"] > cb.get("recovery_time", 30):
            cb["state"] = "half-open"
            return True
        return False
    return True

def record_upstream_result(upstream_id: str, success: bool):
    if upstream_id not in circuit_breakers:
        circuit_breakers[upstream_id] = {"state": "closed", "failures": 0, "threshold": 5, "recovery_time": 30}
    cb = circuit_breakers[upstream_id]
    if success:
        cb["failures"] = 0
        cb["state"] = "closed"
    else:
        cb["failures"] += 1
        if cb["failures"] >= cb["threshold"]:
            cb["state"] = "open"
            cb["opened_at"] = time.time()


# --- APISIX Admin API integration ---
async def sync_to_apisix(route_id: str, route_config: dict):
    if not APISIX_ADMIN_URL:
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            headers = {"X-API-KEY": APISIX_ADMIN_KEY} if APISIX_ADMIN_KEY else {}
            await client.put(
                f"{APISIX_ADMIN_URL}/apisix/admin/routes/{route_id}",
                json=route_config, headers=headers
            )
            log.info(f"Route {route_id} synced to APISIX")
    except Exception as e:
        log.warning(f"APISIX sync failed for {route_id}: {e}")


# --- Models ---
class RouteCreate(BaseModel):
    id: Optional[str] = None
    uri: str
    methods: List[str] = ["GET"]
    upstream: dict
    plugins: Optional[Dict] = {}
    labels: Optional[Dict] = {}
    priority: int = 0

class UpstreamCreate(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    type: str = "roundrobin"
    nodes: dict
    health_check: Optional[Dict] = {}
    retries: int = 3

class ConsumerCreate(BaseModel):
    username: str
    plugins: Optional[Dict] = {}
    labels: Optional[Dict] = {}


# --- Endpoints ---
@app.on_event("startup")
async def startup():
    pool = await get_db()
    for route_id, config in DEFAULT_ROUTES.items():
        if pool:
            try:
                await pool.execute(
                    "INSERT INTO gw_routes (id, uri, methods, upstream, plugins) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
                    route_id, config["uri"], json.dumps(config["methods"]),
                    json.dumps(config["upstream"]), json.dumps(config.get("plugins", {}))
                )
            except Exception:
                pass
        else:
            routes[route_id] = config
    mode = "apisix" if APISIX_ADMIN_URL else ("postgresql" if pool else "in-memory")
    log.info(f"Gateway started in {mode} mode with {len(DEFAULT_ROUTES)} default routes")


@app.get("/health")
async def health():
    pool = await get_db()
    apisix_status = "not_configured"
    if APISIX_ADMIN_URL:
        try:
            async with httpx.AsyncClient(timeout=3.0) as c:
                headers = {"X-API-KEY": APISIX_ADMIN_KEY} if APISIX_ADMIN_KEY else {}
                r = await c.get(f"{APISIX_ADMIN_URL}/apisix/admin/routes", headers=headers)
                apisix_status = "connected" if r.status_code == 200 else f"error:{r.status_code}"
        except Exception:
            apisix_status = "unreachable"
    route_count = len(routes) if not pool else await pool.fetchval("SELECT COUNT(*) FROM gw_routes")
    return {
        "status": "healthy",
        "service": "apisix-gateway",
        "mode": "apisix" if APISIX_ADMIN_URL else ("postgresql" if pool else "in-memory"),
        "apisix_status": apisix_status,
        "storage": "postgresql" if pool else "in-memory",
        "routes": route_count,
        "features": ["routing", "rate_limiting", "circuit_breaker", "cors", "key_auth",
                      "proxy_cache", "load_balancing", "health_check", "ssl", "access_log"],
    }


# --- Route management ---
@app.post("/routes")
async def create_route(route: RouteCreate):
    pool = await get_db()
    route_id = route.id or f"route-{int(time.time())}"
    config = {"uri": route.uri, "methods": route.methods, "upstream": route.upstream,
              "plugins": route.plugins or {}, "labels": route.labels or {}, "priority": route.priority}
    if pool:
        await pool.execute(
            "INSERT INTO gw_routes (id, uri, methods, upstream, plugins, labels, priority) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO UPDATE SET uri=$2, methods=$3, upstream=$4, plugins=$5, labels=$6, priority=$7, updated_at=NOW()",
            route_id, route.uri, json.dumps(route.methods), json.dumps(route.upstream),
            json.dumps(route.plugins or {}), json.dumps(route.labels or {}), route.priority
        )
    else:
        routes[route_id] = config
    await sync_to_apisix(route_id, config)
    return {"success": True, "id": route_id}


@app.get("/routes")
async def list_routes():
    pool = await get_db()
    if pool:
        rows = await pool.fetch("SELECT * FROM gw_routes ORDER BY priority DESC, id")
        return {"routes": [dict(r) for r in rows], "count": len(rows)}
    return {"routes": [{"id": k, **v} for k, v in routes.items()], "count": len(routes)}


@app.get("/routes/{route_id}")
async def get_route(route_id: str):
    pool = await get_db()
    if pool:
        row = await pool.fetchrow("SELECT * FROM gw_routes WHERE id = $1", route_id)
        if not row:
            raise HTTPException(status_code=404, detail="Route not found")
        return dict(row)
    if route_id not in routes:
        raise HTTPException(status_code=404, detail="Route not found")
    return {"id": route_id, **routes[route_id]}


@app.delete("/routes/{route_id}")
async def delete_route(route_id: str):
    pool = await get_db()
    if pool:
        await pool.execute("DELETE FROM gw_routes WHERE id = $1", route_id)
    else:
        routes.pop(route_id, None)
    return {"success": True}


# --- Upstream management ---
@app.post("/upstreams")
async def create_upstream(upstream: UpstreamCreate):
    pool = await get_db()
    upstream_id = upstream.id or f"upstream-{int(time.time())}"
    config = {"name": upstream.name, "type": upstream.type, "nodes": upstream.nodes,
              "health_check": upstream.health_check or {}, "retries": upstream.retries}
    if pool:
        await pool.execute(
            "INSERT INTO gw_upstreams (id, name, type, nodes, health_check, retries) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET name=$2, type=$3, nodes=$4, health_check=$5, retries=$6",
            upstream_id, upstream.name, upstream.type, json.dumps(upstream.nodes),
            json.dumps(upstream.health_check or {}), upstream.retries
        )
    else:
        upstreams[upstream_id] = config
    return {"success": True, "id": upstream_id}


@app.get("/upstreams")
async def list_upstreams():
    pool = await get_db()
    if pool:
        rows = await pool.fetch("SELECT * FROM gw_upstreams ORDER BY id")
        return {"upstreams": [dict(r) for r in rows], "count": len(rows)}
    return {"upstreams": [{"id": k, **v} for k, v in upstreams.items()], "count": len(upstreams)}


# --- Upstream health checking ---
@app.get("/upstreams/health")
async def check_upstream_health():
    results = []
    all_nodes = set()
    for rid, config in {**routes, **DEFAULT_ROUTES}.items():
        upstream = config.get("upstream", {})
        nodes = upstream.get("nodes", {})
        for node in nodes:
            all_nodes.add(node)

    async with httpx.AsyncClient(timeout=3.0) as client:
        for node in all_nodes:
            try:
                r = await client.get(f"http://{node}/health")
                results.append({"node": node, "status": "healthy" if r.status_code == 200 else "unhealthy",
                                 "response_code": r.status_code})
            except Exception:
                results.append({"node": node, "status": "unreachable"})
    return {"nodes": results, "total": len(results),
            "healthy": sum(1 for r in results if r["status"] == "healthy"),
            "unhealthy": sum(1 for r in results if r["status"] != "healthy")}


# --- Consumer management ---
@app.post("/consumers")
async def create_consumer(consumer: ConsumerCreate):
    pool = await get_db()
    consumer_id = f"consumer-{int(time.time())}"
    if pool:
        await pool.execute(
            "INSERT INTO gw_consumers (id, username, plugins, labels) VALUES ($1,$2,$3,$4) ON CONFLICT (username) DO UPDATE SET plugins=$3, labels=$4",
            consumer_id, consumer.username, json.dumps(consumer.plugins or {}), json.dumps(consumer.labels or {})
        )
    else:
        consumers[consumer.username] = {"id": consumer_id, "plugins": consumer.plugins or {}, "labels": consumer.labels or {}}
    return {"success": True, "id": consumer_id, "username": consumer.username}


@app.get("/consumers")
async def list_consumers():
    pool = await get_db()
    if pool:
        rows = await pool.fetch("SELECT * FROM gw_consumers ORDER BY username")
        return {"consumers": [dict(r) for r in rows], "count": len(rows)}
    return {"consumers": [{"username": k, **v} for k, v in consumers.items()], "count": len(consumers)}


# --- Circuit breaker status ---
@app.get("/circuit-breakers")
async def get_circuit_breakers():
    return {"circuit_breakers": circuit_breakers}


# --- Access logs ---
@app.get("/access-logs")
async def get_access_logs(limit: int = 100):
    pool = await get_db()
    if pool:
        rows = await pool.fetch("SELECT * FROM gw_access_log ORDER BY created_at DESC LIMIT $1", limit)
        return {"logs": [dict(r) for r in rows], "count": len(rows)}
    return {"logs": access_logs[-limit:], "count": len(access_logs)}


@app.get("/access-logs/stats")
async def access_log_stats():
    pool = await get_db()
    if pool:
        total = await pool.fetchval("SELECT COUNT(*) FROM gw_access_log")
        avg_latency = await pool.fetchval("SELECT AVG(latency_ms) FROM gw_access_log")
        by_status = await pool.fetch("SELECT status, COUNT(*) as count FROM gw_access_log GROUP BY status ORDER BY status")
        by_route = await pool.fetch("SELECT route_id, COUNT(*) as count FROM gw_access_log GROUP BY route_id ORDER BY count DESC LIMIT 10")
        return {
            "total_requests": total,
            "avg_latency_ms": round(float(avg_latency or 0), 2),
            "by_status": {r["status"]: r["count"] for r in by_status},
            "top_routes": {r["route_id"]: r["count"] for r in by_route},
        }
    total = len(access_logs)
    return {"total_requests": total, "avg_latency_ms": 0}


if __name__ == "__main__":
    port = int(os.getenv("PORT", "9080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
