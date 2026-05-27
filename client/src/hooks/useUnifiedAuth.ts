import { useAuth } from "@/contexts/AuthContext";
import { useKeycloak } from "@/contexts/KeycloakContext";

/**
 * Unified authentication hook
 * Supports both Keycloak and legacy JWT authentication
 */
export function useUnifiedAuth() {
  const KEYCLOAK_ENABLED = import.meta.env.VITE_KEYCLOAK_ENABLED === "true";

  // Get both auth contexts
  const legacyAuth = useAuth();
  const keycloakAuth = useKeycloak();

  // If Keycloak is enabled and initialized, use Keycloak
  if (KEYCLOAK_ENABLED && keycloakAuth.initialized) {
    return {
      isAuthenticated: keycloakAuth.authenticated,
      user: keycloakAuth.user
        ? {
            id: keycloakAuth.user.id,
            email: keycloakAuth.user.email,
            firstName: keycloakAuth.user.firstName,
            lastName: keycloakAuth.user.lastName,
            role: keycloakAuth.user.roles.includes("admin")
              ? "admin"
              : keycloakAuth.user.roles.includes("analyst")
              ? "analyst"
              : "farmer",
          }
        : null,
      token: keycloakAuth.token,
      login: keycloakAuth.login,
      logout: keycloakAuth.logout,
      register: keycloakAuth.register,
      isLoading: !keycloakAuth.initialized,
      source: "keycloak" as const,
    };
  }

  // Fallback to legacy JWT authentication
  return {
    isAuthenticated: !!legacyAuth.user,
    user: legacyAuth.user,
    token: legacyAuth.token,
    login: legacyAuth.login,
    logout: legacyAuth.logout,
    isLoading: legacyAuth.isLoading,
    source: "jwt" as const,
  };
}
