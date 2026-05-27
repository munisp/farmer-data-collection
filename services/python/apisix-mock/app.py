"""
Mock APISIX API Gateway
Routes requests to backend services with rate limiting and authentication
"""
from fastapi import FastAPI, HTTPException, Request, Header
from typing import Optional, Dict, Any
import httpx
import time
from collections import defaultdict
import uvicorn
import os

app = FastAPI(title="Mock APISIX Gateway")

# Service registry
SERVICES = {
    "orchestrator": "http://localhost:8086",
    "tigerbeetle": "http://localhost:8084",
    "lakehouse": "http://localhost:8085",
    "ollama": "http://localhost:8087",
    "kafka": "http://localhost:9092",
}

# Rate limiting (requests per minute per IP)
rate_limits: Dict[str, list] = defaultdict(list)
RATE_LIMIT = 100  # requests per minute


def check_rate_limit(client_ip: str) -> bool:
    """Check if client has exceeded rate limit"""
    now = time.time()
    minute_ago = now - 60
    
    # Remove old requests
    rate_limits[client_ip] = [t for t in rate_limits[client_ip] if t > minute_ago]
    
    # Check limit
    if len(rate_limits[client_ip]) >= RATE_LIMIT:
        return False
    
    # Add current request
    rate_limits[client_ip].append(now)
    return True


@app.get("/health")
async def health():
    """Gateway health check"""
    return {
        "status": "healthy",
        "service": "apisix-gateway",
        "routes": len(SERVICES),
        "services": list(SERVICES.keys()),
    }


@app.api_route("/{service}/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_request(
    service: str,
    path: str,
    request: Request,
    x_api_key: Optional[str] = Header(None),
):
    """Proxy requests to backend services"""
    
    # Check rate limit
    client_ip = request.client.host
    if not check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    
    # Validate service
    if service not in SERVICES:
        raise HTTPException(status_code=404, detail=f"Service '{service}' not found")
    
    # Build target URL
    base_url = SERVICES[service]
    target_url = f"{base_url}/{path}"
    
    # Get request body if POST/PUT
    body = None
    if request.method in ["POST", "PUT"]:
        body = await request.body()
    
    # Forward request
    async with httpx.AsyncClient() as client:
        try:
            response = await client.request(
                method=request.method,
                url=target_url,
                params=request.query_params,
                headers=dict(request.headers),
                content=body,
                timeout=30.0,
            )
            
            return response.json()
        
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Gateway timeout")
        
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Bad gateway: {str(e)}")


@app.get("/routes")
async def list_routes():
    """List all available routes"""
    return {
        "routes": [
            {
                "service": service,
                "base_url": url,
                "pattern": f"/{service}/*",
            }
            for service, url in SERVICES.items()
        ],
        "count": len(SERVICES),
    }


@app.get("/rate-limits")
async def get_rate_limits():
    """Get current rate limit status"""
    now = time.time()
    minute_ago = now - 60
    
    return {
        "rate_limit": RATE_LIMIT,
        "window": "60 seconds",
        "clients": [
            {
                "ip": ip,
                "requests_last_minute": len([t for t in times if t > minute_ago]),
                "remaining": RATE_LIMIT - len([t for t in times if t > minute_ago]),
            }
            for ip, times in rate_limits.items()
        ],
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", 9080))
    uvicorn.run(app, host="0.0.0.0", port=port)
