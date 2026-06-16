import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";

interface User {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const fallbackAuthContext: AuthContextType = {
  user: null,
  token: null,
  isLoading: false,
  login: () => {
    console.warn("[AuthContext] login() called before provider was ready");
  },
  logout: () => {
    console.warn("[AuthContext] logout() called before provider was ready");
  },
  isAuthenticated: false,
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

function parseJwtPayload(token: string): Record<string, any> | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized);
    return JSON.parse(decoded);
  } catch (error) {
    console.warn("[AuthContext] Failed to parse JWT payload:", error);
    return null;
  }
}

function userFromToken(token: string | null): User | null {
  if (!token || typeof window === "undefined") return null;

  const payload = parseJwtPayload(token);
  if (!payload) return null;

  const expiresAt = typeof payload.exp === "number" ? payload.exp * 1000 : null;
  if (expiresAt && expiresAt <= Date.now()) {
    console.warn("[AuthContext] Stored JWT is expired");
    return null;
  }

  const userId = Number(payload.userId ?? payload.id);
  const email = payload.email;
  const role = payload.role;

  if (!Number.isFinite(userId) || !email || !role) {
    return null;
  }

  return {
    id: userId,
    email,
    firstName: payload.firstName ?? payload.given_name ?? "Demo",
    lastName: payload.lastName ?? payload.family_name ?? role,
    role,
  };
}

function shouldClearTokenFromError(message?: string) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden") ||
    normalized.includes("invalid token") ||
    normalized.includes("jwt") ||
    normalized.includes("token expired")
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const storedToken = localStorage.getItem("auth_token");
    console.warn("[AuthContext] Initial token from localStorage:", storedToken ? "exists" : "null");
    return storedToken;
  });

  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === "undefined") return null;
    return userFromToken(localStorage.getItem("auth_token"));
  });

  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window === "undefined") return true;
    return !!localStorage.getItem("auth_token");
  });

  const { data: userData, isLoading: isLoadingUser, error: userError, isSuccess } = trpc.auth.me.useQuery(
    undefined,
    {
      enabled: !!token,
      retry: 1,
      retryDelay: 500,
      staleTime: 60_000,
    }
  );

  useEffect(() => {
    console.warn("[AuthContext] Token/user effect:", {
      token: !!token,
      isLoadingUser,
      hasUserData: !!userData,
      isSuccess,
      error: userError?.message,
    });

    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    const fallbackUser = userFromToken(token);
    if (fallbackUser) {
      setUser((currentUser) => currentUser ?? fallbackUser);
    }

    if (isLoadingUser) {
      return;
    }

    if (isSuccess && userData) {
      console.warn("[AuthContext] User data loaded, setting user");
      setUser(userData);
      setIsLoading(false);
      return;
    }

    if (userError) {
      const shouldClear = shouldClearTokenFromError(userError.message);
      console.warn("[AuthContext] Query error while restoring session:", {
        message: userError.message,
        shouldClear,
        hasFallbackUser: !!fallbackUser,
      });

      if (shouldClear || !fallbackUser) {
        localStorage.removeItem("auth_token");
        setToken(null);
        setUser(null);
      } else {
        setUser(fallbackUser);
      }

      setIsLoading(false);
      return;
    }

    if (!userData && fallbackUser) {
      setUser(fallbackUser);
      setIsLoading(false);
      return;
    }

    if (!userData) {
      localStorage.removeItem("auth_token");
      setToken(null);
      setUser(null);
      setIsLoading(false);
      return;
    }
  }, [token, userData, isLoadingUser, isSuccess, userError]);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem("auth_token", newToken);
    setToken(newToken);
    setUser(newUser);
    setIsLoading(false);
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
    setToken(null);
    setUser(null);
    setIsLoading(false);
  };

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    console.warn("[AuthContext] useAuth() accessed before provider initialization; using unauthenticated fallback context");
    return fallbackAuthContext;
  }
  return context;
}
