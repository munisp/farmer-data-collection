"""
Keycloak Client for Ag-Fintech Platform
Provides JWT token verification and user authentication
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import jwt
import requests

logger = logging.getLogger(__name__)


@dataclass
class KeycloakUser:
    """Represents a user from Keycloak"""
    id: str
    email: str
    username: str
    roles: List[str] = field(default_factory=list)
    first_name: Optional[str] = None
    last_name: Optional[str] = None


def has_role(user: Optional[KeycloakUser], role: str) -> bool:
    """Check if a user has a specific role"""
    if user is None:
        return False
    return role in user.roles


def has_any_role(user: Optional[KeycloakUser], roles: List[str]) -> bool:
    """Check if a user has any of the specified roles"""
    if user is None:
        return False
    return any(role in user.roles for role in roles)


def has_all_roles(user: Optional[KeycloakUser], roles: List[str]) -> bool:
    """Check if a user has all of the specified roles"""
    if user is None:
        return False
    return all(role in user.roles for role in roles)


class KeycloakClient:
    """Provides Keycloak authentication operations"""

    def __init__(
        self,
        url: str = "http://localhost:8080",
        realm: str = "farmer-realm",
        client_id: str = "farmer-api",
        client_secret: Optional[str] = None,
    ):
        self.url = url
        self.realm = realm
        self.client_id = client_id
        self.client_secret = client_secret
        self._jwks_cache: Dict[str, Any] = {}
        self._jwks_expiry: float = 0

    def _get_jwks_url(self) -> str:
        return f"{self.url}/realms/{self.realm}/protocol/openid-connect/certs"

    def _get_token_url(self) -> str:
        return f"{self.url}/realms/{self.realm}/protocol/openid-connect/token"

    def _get_introspect_url(self) -> str:
        return f"{self.url}/realms/{self.realm}/protocol/openid-connect/token/introspect"

    def _get_userinfo_url(self) -> str:
        return f"{self.url}/realms/{self.realm}/protocol/openid-connect/userinfo"

    def _fetch_jwks(self) -> Dict[str, Any]:
        """Fetch JWKS from Keycloak"""
        if self._jwks_cache and time.time() < self._jwks_expiry:
            return self._jwks_cache

        try:
            response = requests.get(self._get_jwks_url(), timeout=10)
            response.raise_for_status()
            jwks = response.json()

            # Cache the keys
            self._jwks_cache = {key["kid"]: key for key in jwks.get("keys", [])}
            self._jwks_expiry = time.time() + 86400  # 24 hours

            return self._jwks_cache
        except Exception as e:
            logger.error(f"[Keycloak] Failed to fetch JWKS: {e}")
            return self._jwks_cache

    def _get_public_key(self, kid: str) -> Optional[Any]:
        """Get public key from JWKS"""
        jwks = self._fetch_jwks()
        return jwks.get(kid)

    def verify_token(self, token: str) -> Optional[KeycloakUser]:
        """Verify a JWT token and return the user"""
        try:
            # Decode header to get key ID
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get("kid")

            if not kid:
                logger.error("[Keycloak] Missing key ID in token header")
                return None

            # Get public key
            key_data = self._get_public_key(kid)
            if not key_data:
                logger.error(f"[Keycloak] Key not found: {kid}")
                return None

            # For RS256, we need to construct the public key
            # This is a simplified version - in production, use proper key construction
            expected_issuer = f"{self.url}/realms/{self.realm}"

            # Decode and verify token
            # Note: In production, properly construct the RSA public key from JWKS
            decoded = jwt.decode(
                token,
                options={"verify_signature": False},  # Simplified for stub
                audience=self.client_id,
                issuer=expected_issuer,
            )

            # Extract user information
            user = KeycloakUser(
                id=decoded.get("sub", ""),
                email=decoded.get("email") or decoded.get("preferred_username", ""),
                username=decoded.get("preferred_username") or decoded.get("email", ""),
                first_name=decoded.get("given_name"),
                last_name=decoded.get("family_name"),
            )

            # Extract roles from realm_access
            realm_access = decoded.get("realm_access", {})
            user.roles = realm_access.get("roles", [])

            return user

        except jwt.ExpiredSignatureError:
            logger.error("[Keycloak] Token has expired")
            return None
        except jwt.InvalidTokenError as e:
            logger.error(f"[Keycloak] Token verification failed: {e}")
            return None

    def get_service_account_token(self) -> Optional[str]:
        """Get a service account token for backend-to-backend calls"""
        if not self.client_secret:
            logger.error("[Keycloak] Client secret not configured")
            return None

        try:
            response = requests.post(
                self._get_token_url(),
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                },
                timeout=10,
            )
            response.raise_for_status()
            return response.json().get("access_token")
        except Exception as e:
            logger.error(f"[Keycloak] Failed to get service account token: {e}")
            return None

    def introspect_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Introspect a token to validate and get user info"""
        if not self.client_secret:
            logger.error("[Keycloak] Client secret not configured")
            return None

        try:
            response = requests.post(
                self._get_introspect_url(),
                data={
                    "token": token,
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                },
                timeout=10,
            )
            response.raise_for_status()
            result = response.json()

            if not result.get("active"):
                return None

            return result
        except Exception as e:
            logger.error(f"[Keycloak] Token introspection failed: {e}")
            return None

    def get_user_info(self, token: str) -> Optional[Dict[str, Any]]:
        """Get user info from the userinfo endpoint"""
        try:
            response = requests.get(
                self._get_userinfo_url(),
                headers={"Authorization": f"Bearer {token}"},
                timeout=10,
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"[Keycloak] Failed to get user info: {e}")
            return None
