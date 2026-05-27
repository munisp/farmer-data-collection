"""
Mock Permify Authorization Service
Provides role-based access control (RBAC) and attribute-based access control (ABAC)
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uvicorn
import os

app = FastAPI(title="Mock Permify Service")

# Permission schema
PERMISSIONS = {
    "admin": [
        "journey:*:*",
        "user:*:*",
        "farm:*:*",
        "marketplace:*:*",
        "loan:*:*",
        "insurance:*:*",
        "analytics:*:*",
    ],
    "farmer": [
        "journey:registration:create",
        "journey:expense:create",
        "journey:marketplace:create",
        "journey:loan:create",
        "journey:disease:create",
        "journey:insurance:create",
        "farm:own:read",
        "farm:own:update",
        "marketplace:own:*",
        "loan:own:read",
        "insurance:own:*",
    ],
    "buyer": [
        "marketplace:*:read",
        "marketplace:purchase:create",
        "journey:negotiation:create",
    ],
    "agent": [
        "insurance:*:read",
        "insurance:claim:approve",
        "loan:*:read",
        "loan:application:approve",
    ],
    "user": [
        "journey:*:read",
        "farm:own:read",
    ],
}


class CheckRequest(BaseModel):
    user_id: int
    roles: List[str]
    resource: str
    action: str
    context: Optional[Dict[str, Any]] = {}


class BulkCheckRequest(BaseModel):
    user_id: int
    roles: List[str]
    checks: List[Dict[str, str]]  # [{"resource": "farm", "action": "read"}, ...]


def check_permission(roles: List[str], resource: str, action: str, context: Dict = {}) -> bool:
    """Check if roles have permission for resource:action"""
    
    # Build permission string
    permission = f"{resource}:{action}"
    
    # Check each role
    for role in roles:
        if role not in PERMISSIONS:
            continue
        
        role_permissions = PERMISSIONS[role]
        
        # Check exact match
        if permission in role_permissions:
            return True
        
        # Check wildcard matches
        for perm in role_permissions:
            parts = perm.split(":")
            req_parts = permission.split(":")
            
            # resource:*:*
            if len(parts) >= 2 and parts[0] == req_parts[0] and parts[1] == "*":
                return True
            
            # resource:action:*
            if len(parts) >= 3 and parts[0] == req_parts[0] and parts[1] == req_parts[1]:
                return True
    
    return False


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "permify-mock",
        "roles_count": len(PERMISSIONS),
    }


@app.post("/check")
async def check(request: CheckRequest):
    """Check if user has permission"""
    
    allowed = check_permission(
        roles=request.roles,
        resource=request.resource,
        action=request.action,
        context=request.context,
    )
    
    return {
        "allowed": allowed,
        "user_id": request.user_id,
        "roles": request.roles,
        "resource": request.resource,
        "action": request.action,
    }


@app.post("/check-bulk")
async def check_bulk(request: BulkCheckRequest):
    """Check multiple permissions at once"""
    
    results = []
    
    for check_item in request.checks:
        resource = check_item.get("resource", "")
        action = check_item.get("action", "")
        
        allowed = check_permission(
            roles=request.roles,
            resource=resource,
            action=action,
        )
        
        results.append({
            "resource": resource,
            "action": action,
            "allowed": allowed,
        })
    
    return {
        "user_id": request.user_id,
        "roles": request.roles,
        "checks": results,
        "all_allowed": all(r["allowed"] for r in results),
    }


@app.get("/roles")
async def list_roles():
    """List all roles and their permissions"""
    return {
        "roles": [
            {
                "name": role,
                "permissions": perms,
                "count": len(perms),
            }
            for role, perms in PERMISSIONS.items()
        ],
        "count": len(PERMISSIONS),
    }


@app.get("/roles/{role}")
async def get_role(role: str):
    """Get permissions for a specific role"""
    if role not in PERMISSIONS:
        raise HTTPException(status_code=404, detail="Role not found")
    
    return {
        "role": role,
        "permissions": PERMISSIONS[role],
        "count": len(PERMISSIONS[role]),
    }


@app.post("/roles/{role}/add-permission")
async def add_permission(role: str, permission: str):
    """Add permission to a role"""
    if role not in PERMISSIONS:
        PERMISSIONS[role] = []
    
    if permission not in PERMISSIONS[role]:
        PERMISSIONS[role].append(permission)
    
    return {
        "success": True,
        "role": role,
        "permission": permission,
        "total_permissions": len(PERMISSIONS[role]),
    }


@app.delete("/roles/{role}/remove-permission")
async def remove_permission(role: str, permission: str):
    """Remove permission from a role"""
    if role not in PERMISSIONS:
        raise HTTPException(status_code=404, detail="Role not found")
    
    if permission in PERMISSIONS[role]:
        PERMISSIONS[role].remove(permission)
    
    return {
        "success": True,
        "role": role,
        "permission": permission,
        "total_permissions": len(PERMISSIONS[role]),
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", 3476))
    uvicorn.run(app, host="0.0.0.0", port=port)
