import React, { createContext, useContext, useEffect, useState } from 'react';
import { useKeycloak } from '@react-keycloak/web';

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  roles: string[];
}

interface KeycloakAuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
  hasRole: (role: string) => boolean;
  token: string | null;
}

const KeycloakAuthContext = createContext<KeycloakAuthContextType | undefined>(undefined);

export function KeycloakAuthProvider({ children }: { children: React.ReactNode }) {
  const { keycloak, initialized } = useKeycloak();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (initialized && keycloak.authenticated) {
      // Extract user info from token
      const tokenParsed = keycloak.tokenParsed;
      if (tokenParsed) {
        const roles = tokenParsed.realm_access?.roles || [];
        const primaryRole = roles.includes('admin') ? 'admin' : roles.includes('farmer') ? 'farmer' : 'viewer';
        
        setUser({
          id: tokenParsed.sub || '',
          email: tokenParsed.email || tokenParsed.preferred_username || '',
          firstName: tokenParsed.given_name,
          lastName: tokenParsed.family_name,
          role: primaryRole,
          roles: roles,
        });
      }
    } else if (initialized && !keycloak.authenticated) {
      setUser(null);
    }
  }, [initialized, keycloak.authenticated, keycloak.tokenParsed]);

  const login = () => {
    keycloak.login();
  };

  const logout = () => {
    setUser(null);
    keycloak.logout();
  };

  const hasRole = (role: string): boolean => {
    return keycloak.hasRealmRole(role);
  };

  const value: KeycloakAuthContextType = {
    user,
    isAuthenticated: keycloak.authenticated || false,
    isLoading: !initialized,
    login,
    logout,
    hasRole,
    token: keycloak.token || null,
  };

  return (
    <KeycloakAuthContext.Provider value={value}>
      {children}
    </KeycloakAuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(KeycloakAuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within a KeycloakAuthProvider');
  }
  return context;
}
