import React, { createContext, useContext, useEffect, useState } from "react";
import Keycloak from "keycloak-js";

/**
 * Keycloak configuration
 */
const KEYCLOAK_CONFIG = {
  url: import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:8080",
  realm: import.meta.env.VITE_KEYCLOAK_REALM || "farmer-data-collection",
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "farmer-web-app",
};

/**
 * Keycloak context interface
 */
interface KeycloakContextType {
  keycloak: Keycloak | null;
  initialized: boolean;
  authenticated: boolean;
  token: string | null;
  login: () => void;
  logout: () => void;
  register: () => void;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: string[];
  } | null;
}

const KeycloakContext = createContext<KeycloakContextType | null>(null);

/**
 * Keycloak provider component
 */
export function KeycloakProvider({ children }: { children: React.ReactNode }) {
  const [keycloak, setKeycloak] = useState<Keycloak | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<KeycloakContextType["user"]>(null);

  useEffect(() => {
    // Initialize Keycloak
    const keycloakInstance = new Keycloak(KEYCLOAK_CONFIG);

    keycloakInstance
      .init({
        onLoad: "check-sso",
        silentCheckSsoRedirectUri:
          window.location.origin + "/silent-check-sso.html",
        pkceMethod: "S256",
      })
      .then((authenticated) => {
        setKeycloak(keycloakInstance);
        setAuthenticated(authenticated);
        setInitialized(true);

        if (authenticated && keycloakInstance.token) {
          setToken(keycloakInstance.token);

          // Extract user information from token
          const tokenParsed = keycloakInstance.tokenParsed as any;
          if (tokenParsed) {
            setUser({
              id: tokenParsed.sub,
              email: tokenParsed.email || "",
              firstName: tokenParsed.given_name || "",
              lastName: tokenParsed.family_name || "",
              roles: tokenParsed.realm_access?.roles || [],
            });
          }
        }

        // Set up token refresh
        if (authenticated) {
          setInterval(() => {
            keycloakInstance
              .updateToken(70)
              .then((refreshed) => {
                if (refreshed && keycloakInstance.token) {
                  setToken(keycloakInstance.token);
                  console.warn("[Keycloak] Token refreshed");
                }
              })
              .catch(() => {
                console.error("[Keycloak] Failed to refresh token");
              });
          }, 60000); // Check every minute
        }
      })
      .catch((error) => {
        console.error("[Keycloak] Failed to initialize:", error);
        setInitialized(true);
      });
  }, []);

  const login = () => {
    if (keycloak) {
      keycloak.login();
    }
  };

  const logout = () => {
    if (keycloak) {
      keycloak.logout();
    }
  };

  const register = () => {
    if (keycloak) {
      keycloak.register();
    }
  };

  return (
    <KeycloakContext.Provider
      value={{
        keycloak,
        initialized,
        authenticated,
        token,
        login,
        logout,
        register,
        user,
      }}
    >
      {children}
    </KeycloakContext.Provider>
  );
}

/**
 * Hook to use Keycloak context
 */
export function useKeycloak() {
  const context = useContext(KeycloakContext);
  if (!context) {
    throw new Error("useKeycloak must be used within KeycloakProvider");
  }
  return context;
}
