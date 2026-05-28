"""
Permify Authorization Service
Full RBAC/ABAC authorization engine with PostgreSQL-backed policy storage,
relationship-based access control (ReBAC), policy versioning, audit logging,
and optional integration with a real Permify server.
"""
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
import uvicorn
import os
import json
import logging
import secrets
from datetime import datetime, timezone
import httpx

logging.basicConfig(level=logging.INFO, format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}')
log = logging.getLogger("permify-service")

app = FastAPI(title="Permify Authorization Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PERMIFY_SERVER_URL = os.getenv("PERMIFY_SERVER_URL", "")
PERMIFY_API_KEY = os.getenv("PERMIFY_API_KEY", "")
DATABASE_URL = os.getenv("DATABASE_URL", "")

# --- Permission Schema (Google Zanzibar-inspired) ---
ROLE_PERMISSIONS: Dict[str, List[str]] = {
    "admin": [
        "journey:*:*", "user:*:*", "farm:*:*", "marketplace:*:*",
        "loan:*:*", "insurance:*:*", "analytics:*:*", "cooperative:*:*",
        "exchange:*:*", "kyc:*:*", "moderation:*:*", "delivery:*:*",
        "cold_chain:*:*", "subsidy:*:*", "weather:*:*", "sms:*:*",
        "aggregation:*:*", "erpnext:*:*", "report:*:*",
    ],
    "farmer": [
        "journey:registration:create", "journey:expense:create",
        "journey:marketplace:create", "journey:loan:create",
        "journey:disease:create", "journey:insurance:create",
        "farm:own:read", "farm:own:update", "farm:own:create",
        "marketplace:own:*", "loan:own:read", "loan:own:create",
        "insurance:own:*", "cooperative:own:read", "cooperative:own:join",
        "exchange:own:trade", "weather:own:read", "aggregation:own:deliver",
        "report:own:read",
    ],
    "field_agent": [
        "farmer:assigned:read", "farmer:assigned:update",
        "farm:assigned:read", "farm:assigned:verify",
        "kyc:assigned:read", "kyc:assigned:verify",
        "insurance:claim:review", "loan:application:review",
        "aggregation:hub:inspect", "aggregation:hub:grade",
    ],
    "buyer": [
        "marketplace:*:read", "marketplace:purchase:create",
        "journey:negotiation:create", "delivery:own:read",
        "exchange:own:trade",
    ],
    "cooperative_admin": [
        "cooperative:own:*", "farmer:cooperative:read",
        "farm:cooperative:read", "loan:cooperative:read",
        "report:cooperative:*", "aggregation:cooperative:manage",
    ],
    "agent": [
        "insurance:*:read", "insurance:claim:approve",
        "loan:*:read", "loan:application:approve",
    ],
    "hub_operator": [
        "aggregation:hub:*", "cold_chain:hub:read",
        "delivery:hub:read", "exchange:hub:list",
    ],
    "user": [
        "journey:*:read", "farm:own:read", "weather:*:read",
    ],
}

# --- Relationship tuples (ReBAC) ---
relationships: Dict[str, Dict[str, set]] = {}
# Structure: relationships[entity_type][entity_id] = {(relation, subject_type, subject_id), ...}

# --- Policy versions ---
policy_versions: List[dict] = []
current_policy_version = "v1.0"

# --- Audit log ---
authz_audit: list = []

# --- PostgreSQL storage ---
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
                CREATE TABLE IF NOT EXISTS authz_relationships (
                    id SERIAL PRIMARY KEY,
                    entity_type VARCHAR(100) NOT NULL,
                    entity_id VARCHAR(255) NOT NULL,
                    relation VARCHAR(100) NOT NULL,
                    subject_type VARCHAR(100) NOT NULL,
                    subject_id VARCHAR(255) NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(entity_type, entity_id, relation, subject_type, subject_id)
                );
                CREATE TABLE IF NOT EXISTS authz_policies (
                    id SERIAL PRIMARY KEY,
                    version VARCHAR(50) NOT NULL,
                    role VARCHAR(100) NOT NULL,
                    permissions JSONB NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS authz_audit_log (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(255),
                    action VARCHAR(50) NOT NULL,
                    resource VARCHAR(255),
                    decision VARCHAR(20) NOT NULL,
                    roles JSONB,
                    context JSONB,
                    latency_ms FLOAT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_authz_rel_entity ON authz_relationships(entity_type, entity_id);
                CREATE INDEX IF NOT EXISTS idx_authz_rel_subject ON authz_relationships(subject_type, subject_id);
                CREATE INDEX IF NOT EXISTS idx_authz_audit_user ON authz_audit_log(user_id, created_at);
            """)
            log.info("PostgreSQL authorization tables initialized")
            return db_pool
        except Exception as e:
            log.warning(f"PostgreSQL unavailable: {e}")
    return None


# --- Permify server integration ---
async def try_permify_check(user_id: str, resource: str, action: str, context: dict) -> Optional[bool]:
    if not PERMIFY_SERVER_URL:
        return None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            headers = {"Authorization": f"Bearer {PERMIFY_API_KEY}"} if PERMIFY_API_KEY else {}
            resp = await client.post(f"{PERMIFY_SERVER_URL}/v1/tenants/t1/permissions/check", json={
                "metadata": {"schema_version": "", "snap_token": "", "depth": 20},
                "entity": {"type": resource.split(":")[0] if ":" in resource else resource, "id": context.get("resource_id", "1")},
                "permission": action,
                "subject": {"type": "user", "id": str(user_id)},
            }, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("can") == "CHECK_RESULT_ALLOWED"
    except Exception as e:
        log.warning(f"Permify server error: {e}")
    return None


# --- Permission checking ---
def check_permission(roles: List[str], resource: str, action: str, context: dict = None) -> bool:
    context = context or {}
    permission = f"{resource}:{action}"

    for role in roles:
        if role not in ROLE_PERMISSIONS:
            continue
        role_perms = ROLE_PERMISSIONS[role]
        if permission in role_perms:
            return True
        for perm in role_perms:
            parts = perm.split(":")
            req_parts = permission.split(":")
            if len(parts) >= 2 and parts[0] == req_parts[0] and parts[1] == "*":
                return True
            if len(parts) >= 3 and len(req_parts) >= 2 and parts[0] == req_parts[0] and parts[1] == req_parts[1] and parts[2] == "*":
                return True
            if len(parts) >= 3 and all(p == "*" for p in parts[1:]):
                if parts[0] == req_parts[0]:
                    return True
    # Check ownership context
    if context.get("owner_id") and context.get("user_id"):
        if str(context["owner_id"]) == str(context["user_id"]):
            own_perm = f"{resource.split(':')[0]}:own:{action}"
            for role in roles:
                if role in ROLE_PERMISSIONS and own_perm in ROLE_PERMISSIONS[role]:
                    return True
    return False


async def audit_decision(user_id: str, action: str, resource: str, decision: str, roles: list, context: dict, latency_ms: float):
    entry = {
        "user_id": user_id, "action": action, "resource": resource,
        "decision": decision, "roles": roles, "context": context,
        "latency_ms": latency_ms, "ts": datetime.now(timezone.utc).isoformat()
    }
    pool = await get_db()
    if pool:
        try:
            await pool.execute(
                "INSERT INTO authz_audit_log (user_id, action, resource, decision, roles, context, latency_ms) VALUES ($1,$2,$3,$4,$5,$6,$7)",
                str(user_id), action, resource, decision, json.dumps(roles), json.dumps(context), latency_ms
            )
        except Exception:
            pass
    authz_audit.append(entry)
    if len(authz_audit) > 10000:
        authz_audit.pop(0)


# --- Models ---
class CheckRequest(BaseModel):
    user_id: int
    roles: List[str]
    resource: str
    action: str
    context: Optional[Dict] = {}

class BulkCheckRequest(BaseModel):
    user_id: int
    roles: List[str]
    checks: List[Dict[str, str]]

class RelationshipWrite(BaseModel):
    entity_type: str
    entity_id: str
    relation: str
    subject_type: str
    subject_id: str

class PolicyUpdate(BaseModel):
    role: str
    permissions: List[str]


# --- Endpoints ---
@app.on_event("startup")
async def startup():
    await get_db()
    if PERMIFY_SERVER_URL:
        log.info(f"Permify server configured: {PERMIFY_SERVER_URL}")
    else:
        log.info("Running in standalone authorization mode")

@app.get("/health")
async def health():
    pool = await get_db()
    permify_status = "not_configured"
    if PERMIFY_SERVER_URL:
        try:
            async with httpx.AsyncClient(timeout=3.0) as c:
                r = await c.get(f"{PERMIFY_SERVER_URL}/healthz")
                permify_status = "connected" if r.status_code == 200 else f"error:{r.status_code}"
        except Exception:
            permify_status = "unreachable"
    return {
        "status": "healthy",
        "service": "permify-authz",
        "mode": "permify" if PERMIFY_SERVER_URL else "standalone",
        "permify_status": permify_status,
        "storage": "postgresql" if pool else "in-memory",
        "roles_count": len(ROLE_PERMISSIONS),
        "total_permissions": sum(len(p) for p in ROLE_PERMISSIONS.values()),
        "features": ["rbac", "abac", "rebac", "policy_versioning", "audit_log", "bulk_check"],
    }


@app.post("/check")
async def check(request: CheckRequest):
    import time
    start = time.monotonic()

    # Try real Permify first
    permify_result = await try_permify_check(str(request.user_id), request.resource, request.action, request.context or {})
    if permify_result is not None:
        latency = (time.monotonic() - start) * 1000
        await audit_decision(str(request.user_id), request.action, request.resource,
                             "allowed" if permify_result else "denied", request.roles, request.context or {}, latency)
        return {"allowed": permify_result, "source": "permify", "user_id": request.user_id,
                "resource": request.resource, "action": request.action, "latency_ms": round(latency, 2)}

    allowed = check_permission(request.roles, request.resource, request.action, request.context or {})
    latency = (time.monotonic() - start) * 1000
    await audit_decision(str(request.user_id), request.action, request.resource,
                         "allowed" if allowed else "denied", request.roles, request.context or {}, latency)
    return {
        "allowed": allowed, "source": "local", "user_id": request.user_id,
        "roles": request.roles, "resource": request.resource, "action": request.action,
        "latency_ms": round(latency, 2),
    }


@app.post("/check-bulk")
async def check_bulk(request: BulkCheckRequest):
    import time
    start = time.monotonic()
    results = []
    for check_item in request.checks:
        resource = check_item.get("resource", "")
        action = check_item.get("action", "")
        allowed = check_permission(request.roles, resource, action)
        results.append({"resource": resource, "action": action, "allowed": allowed})
    latency = (time.monotonic() - start) * 1000
    return {
        "user_id": request.user_id, "roles": request.roles, "checks": results,
        "all_allowed": all(r["allowed"] for r in results),
        "latency_ms": round(latency, 2),
    }


# --- Relationship management (ReBAC) ---
@app.post("/relationships")
async def write_relationship(rel: RelationshipWrite):
    pool = await get_db()
    if pool:
        try:
            await pool.execute(
                "INSERT INTO authz_relationships (entity_type, entity_id, relation, subject_type, subject_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
                rel.entity_type, rel.entity_id, rel.relation, rel.subject_type, rel.subject_id
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    else:
        key = rel.entity_type
        if key not in relationships:
            relationships[key] = {}
        if rel.entity_id not in relationships[key]:
            relationships[key][rel.entity_id] = set()
        relationships[key][rel.entity_id].add((rel.relation, rel.subject_type, rel.subject_id))
    return {"success": True}


@app.get("/relationships/{entity_type}/{entity_id}")
async def get_relationships(entity_type: str, entity_id: str):
    pool = await get_db()
    if pool:
        rows = await pool.fetch(
            "SELECT * FROM authz_relationships WHERE entity_type = $1 AND entity_id = $2",
            entity_type, entity_id
        )
        return {"relationships": [dict(r) for r in rows]}
    rels = relationships.get(entity_type, {}).get(entity_id, set())
    return {"relationships": [{"relation": r[0], "subject_type": r[1], "subject_id": r[2]} for r in rels]}


@app.delete("/relationships/{entity_type}/{entity_id}/{relation}/{subject_type}/{subject_id}")
async def delete_relationship(entity_type: str, entity_id: str, relation: str, subject_type: str, subject_id: str):
    pool = await get_db()
    if pool:
        await pool.execute(
            "DELETE FROM authz_relationships WHERE entity_type=$1 AND entity_id=$2 AND relation=$3 AND subject_type=$4 AND subject_id=$5",
            entity_type, entity_id, relation, subject_type, subject_id
        )
    else:
        rels = relationships.get(entity_type, {}).get(entity_id, set())
        rels.discard((relation, subject_type, subject_id))
    return {"success": True}


# --- Policy management ---
@app.get("/roles")
async def list_roles():
    return {
        "roles": [{"name": role, "permissions": perms, "count": len(perms)} for role, perms in ROLE_PERMISSIONS.items()],
        "count": len(ROLE_PERMISSIONS),
        "policy_version": current_policy_version,
    }

@app.get("/roles/{role}")
async def get_role(role: str):
    if role not in ROLE_PERMISSIONS:
        raise HTTPException(status_code=404, detail="Role not found")
    return {"role": role, "permissions": ROLE_PERMISSIONS[role], "count": len(ROLE_PERMISSIONS[role])}

@app.post("/roles/{role}/permissions")
async def update_role_permissions(role: str, update: PolicyUpdate):
    global current_policy_version
    old_perms = ROLE_PERMISSIONS.get(role, [])
    ROLE_PERMISSIONS[role] = update.permissions
    current_policy_version = f"v{len(policy_versions) + 1}.0"
    policy_versions.append({
        "version": current_policy_version, "role": role,
        "old_permissions": old_perms, "new_permissions": update.permissions,
        "ts": datetime.now(timezone.utc).isoformat()
    })
    pool = await get_db()
    if pool:
        await pool.execute(
            "INSERT INTO authz_policies (version, role, permissions) VALUES ($1,$2,$3)",
            current_policy_version, role, json.dumps(update.permissions)
        )
    return {"success": True, "role": role, "permissions": update.permissions, "version": current_policy_version}

@app.post("/roles/{role}/add-permission")
async def add_permission(role: str, permission: str):
    if role not in ROLE_PERMISSIONS:
        ROLE_PERMISSIONS[role] = []
    if permission not in ROLE_PERMISSIONS[role]:
        ROLE_PERMISSIONS[role].append(permission)
    return {"success": True, "role": role, "permissions": ROLE_PERMISSIONS[role]}


# --- Audit ---
@app.get("/audit")
async def get_audit(limit: int = 100, user_id: Optional[str] = None):
    pool = await get_db()
    if pool:
        if user_id:
            rows = await pool.fetch("SELECT * FROM authz_audit_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2", user_id, limit)
        else:
            rows = await pool.fetch("SELECT * FROM authz_audit_log ORDER BY created_at DESC LIMIT $1", limit)
        return {"audit_log": [dict(r) for r in rows], "count": len(rows)}
    filtered = [e for e in authz_audit if not user_id or e["user_id"] == user_id]
    return {"audit_log": filtered[-limit:], "count": len(filtered)}

@app.get("/audit/stats")
async def audit_stats():
    pool = await get_db()
    if pool:
        total = await pool.fetchval("SELECT COUNT(*) FROM authz_audit_log")
        allowed = await pool.fetchval("SELECT COUNT(*) FROM authz_audit_log WHERE decision = 'allowed'")
        denied = await pool.fetchval("SELECT COUNT(*) FROM authz_audit_log WHERE decision = 'denied'")
        avg_latency = await pool.fetchval("SELECT AVG(latency_ms) FROM authz_audit_log")
        return {"total_checks": total, "allowed": allowed, "denied": denied,
                "deny_rate": round(denied / max(total, 1) * 100, 2),
                "avg_latency_ms": round(float(avg_latency or 0), 2)}
    total = len(authz_audit)
    allowed = sum(1 for e in authz_audit if e["decision"] == "allowed")
    denied = total - allowed
    return {"total_checks": total, "allowed": allowed, "denied": denied,
            "deny_rate": round(denied / max(total, 1) * 100, 2)}


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8181"))
    uvicorn.run(app, host="0.0.0.0", port=port)
