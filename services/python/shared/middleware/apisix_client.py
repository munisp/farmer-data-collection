"""
APISIX Client for Ag-Fintech Platform
Provides API gateway management operations
"""

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger(__name__)


@dataclass
class Upstream:
    """Represents an APISIX upstream"""
    id: Optional[str] = None
    name: Optional[str] = None
    type: str = "roundrobin"  # roundrobin, chash, ewma, least_conn
    nodes: Dict[str, int] = field(default_factory=dict)
    timeout: Optional[Dict[str, int]] = None
    retries: int = 3
    checks: Optional[Dict[str, Any]] = None


@dataclass
class Route:
    """Represents an APISIX route"""
    id: Optional[str] = None
    name: str = ""
    uri: str = ""
    methods: List[str] = field(default_factory=list)
    upstream: Optional[Upstream] = None
    upstream_id: Optional[str] = None
    plugins: Dict[str, Any] = field(default_factory=dict)
    priority: int = 0
    status: int = 1
    labels: Dict[str, str] = field(default_factory=dict)


@dataclass
class Consumer:
    """Represents an APISIX consumer"""
    username: str = ""
    plugins: Dict[str, Any] = field(default_factory=dict)
    labels: Dict[str, str] = field(default_factory=dict)


class APISIXClient:
    """Provides APISIX API gateway operations"""

    def __init__(
        self,
        admin_url: str = "http://localhost:9180",
        api_key: Optional[str] = None,
    ):
        self.admin_url = admin_url
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        if api_key:
            self.session.headers.update({"X-API-KEY": api_key})

    def _do_request(
        self,
        method: str,
        path: str,
        body: Optional[Any] = None,
    ) -> Optional[Dict[str, Any]]:
        """Execute an APISIX admin API request"""
        url = f"{self.admin_url}/apisix/admin{path}"

        try:
            if method == "GET":
                response = self.session.get(url, timeout=10)
            elif method == "PUT":
                response = self.session.put(url, json=body, timeout=10)
            elif method == "POST":
                response = self.session.post(url, json=body, timeout=10)
            elif method == "DELETE":
                response = self.session.delete(url, timeout=10)
            else:
                raise ValueError(f"Unsupported method: {method}")

            if response.status_code >= 400:
                logger.error(f"[APISIX] Request failed: {response.status_code} - {response.text}")
                return None

            return response.json()

        except Exception as e:
            logger.error(f"[APISIX] Request failed: {e}")
            return None

    def create_route(self, route_id: str, route: Route) -> bool:
        """Create or update a route (idempotent via PUT)"""
        route_dict = {
            "name": route.name,
            "uri": route.uri,
            "methods": route.methods,
            "plugins": route.plugins,
            "priority": route.priority,
            "status": route.status,
            "labels": route.labels,
        }

        if route.upstream_id:
            route_dict["upstream_id"] = route.upstream_id
        elif route.upstream:
            route_dict["upstream"] = {
                "type": route.upstream.type,
                "nodes": route.upstream.nodes,
            }
            if route.upstream.timeout:
                route_dict["upstream"]["timeout"] = route.upstream.timeout
            if route.upstream.retries:
                route_dict["upstream"]["retries"] = route.upstream.retries

        result = self._do_request("PUT", f"/routes/{route_id}", route_dict)
        if result:
            logger.info(f"[APISIX] Created/updated route: {route_id}")
            return True
        return False

    def get_route(self, route_id: str) -> Optional[Route]:
        """Retrieve a route"""
        result = self._do_request("GET", f"/routes/{route_id}")
        if not result:
            return None

        value = result.get("value", {})
        return Route(
            id=value.get("id"),
            name=value.get("name", ""),
            uri=value.get("uri", ""),
            methods=value.get("methods", []),
            upstream_id=value.get("upstream_id"),
            plugins=value.get("plugins", {}),
            priority=value.get("priority", 0),
            status=value.get("status", 1),
            labels=value.get("labels", {}),
        )

    def delete_route(self, route_id: str) -> bool:
        """Delete a route"""
        result = self._do_request("DELETE", f"/routes/{route_id}")
        if result is not None:
            logger.info(f"[APISIX] Deleted route: {route_id}")
            return True
        return False

    def create_upstream(self, upstream_id: str, upstream: Upstream) -> bool:
        """Create or update an upstream (idempotent via PUT)"""
        upstream_dict = {
            "name": upstream.name,
            "type": upstream.type,
            "nodes": upstream.nodes,
            "retries": upstream.retries,
        }

        if upstream.timeout:
            upstream_dict["timeout"] = upstream.timeout
        if upstream.checks:
            upstream_dict["checks"] = upstream.checks

        result = self._do_request("PUT", f"/upstreams/{upstream_id}", upstream_dict)
        if result:
            logger.info(f"[APISIX] Created/updated upstream: {upstream_id}")
            return True
        return False

    def get_upstream(self, upstream_id: str) -> Optional[Upstream]:
        """Retrieve an upstream"""
        result = self._do_request("GET", f"/upstreams/{upstream_id}")
        if not result:
            return None

        value = result.get("value", {})
        return Upstream(
            id=value.get("id"),
            name=value.get("name"),
            type=value.get("type", "roundrobin"),
            nodes=value.get("nodes", {}),
            timeout=value.get("timeout"),
            retries=value.get("retries", 3),
            checks=value.get("checks"),
        )

    def delete_upstream(self, upstream_id: str) -> bool:
        """Delete an upstream"""
        result = self._do_request("DELETE", f"/upstreams/{upstream_id}")
        if result is not None:
            logger.info(f"[APISIX] Deleted upstream: {upstream_id}")
            return True
        return False

    def create_consumer(self, consumer: Consumer) -> bool:
        """Create or update a consumer (idempotent via PUT)"""
        consumer_dict = {
            "username": consumer.username,
            "plugins": consumer.plugins,
            "labels": consumer.labels,
        }

        result = self._do_request("PUT", f"/consumers/{consumer.username}", consumer_dict)
        if result:
            logger.info(f"[APISIX] Created/updated consumer: {consumer.username}")
            return True
        return False

    def get_consumer(self, username: str) -> Optional[Consumer]:
        """Retrieve a consumer"""
        result = self._do_request("GET", f"/consumers/{username}")
        if not result:
            return None

        value = result.get("value", {})
        return Consumer(
            username=value.get("username", ""),
            plugins=value.get("plugins", {}),
            labels=value.get("labels", {}),
        )

    def delete_consumer(self, username: str) -> bool:
        """Delete a consumer"""
        result = self._do_request("DELETE", f"/consumers/{username}")
        if result is not None:
            logger.info(f"[APISIX] Deleted consumer: {username}")
            return True
        return False

    # Common plugin configurations

    @staticmethod
    def rate_limit_plugin(rate: int, burst: int, key: str = "remote_addr") -> Dict[str, Any]:
        """Return a rate limiting plugin configuration"""
        return {
            "limit-req": {
                "rate": rate,
                "burst": burst,
                "key": key,  # "remote_addr", "consumer_name", "service_id"
            }
        }

    @staticmethod
    def jwt_auth_plugin(key: str, secret: str) -> Dict[str, Any]:
        """Return a JWT authentication plugin configuration"""
        return {
            "jwt-auth": {
                "key": key,
                "secret": secret,
            }
        }

    @staticmethod
    def key_auth_plugin(key: str) -> Dict[str, Any]:
        """Return a key authentication plugin configuration"""
        return {
            "key-auth": {
                "key": key,
            }
        }

    @staticmethod
    def cors_plugin(origins: List[str], methods: List[str]) -> Dict[str, Any]:
        """Return a CORS plugin configuration"""
        return {
            "cors": {
                "allow_origins": origins,
                "allow_methods": methods,
                "allow_headers": "*",
                "max_age": 3600,
            }
        }

    @staticmethod
    def proxy_rewrite_plugin(regex_uri: List[str]) -> Dict[str, Any]:
        """Return a proxy rewrite plugin configuration"""
        return {
            "proxy-rewrite": {
                "regex_uri": regex_uri,
            }
        }

    def setup_farmer_api_routes(
        self,
        backend_host: str,
        backend_port: int,
    ) -> bool:
        """Set up routes for the farmer API"""
        # Create upstream
        upstream = Upstream(
            name="farmer-api-upstream",
            type="roundrobin",
            nodes={f"{backend_host}:{backend_port}": 1},
            timeout={"connect": 6, "send": 6, "read": 6},
            retries=3,
        )

        if not self.create_upstream("farmer-api", upstream):
            return False

        # Create routes
        routes = [
            (
                "farmer-api-trpc",
                Route(
                    name="Farmer API tRPC",
                    uri="/trpc/*",
                    methods=["GET", "POST"],
                    upstream_id="farmer-api",
                    plugins=self.rate_limit_plugin(100, 50),
                ),
            ),
            (
                "farmer-api-health",
                Route(
                    name="Farmer API Health",
                    uri="/health",
                    methods=["GET"],
                    upstream_id="farmer-api",
                ),
            ),
        ]

        for route_id, route in routes:
            if not self.create_route(route_id, route):
                return False

        logger.info("[APISIX] Set up farmer API routes")
        return True

    def check_health(self) -> bool:
        """Check if APISIX is healthy"""
        try:
            url = f"{self.admin_url}/apisix/status"
            response = self.session.get(url, timeout=5)
            return response.status_code == 200
        except Exception:
            return False
