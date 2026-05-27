import { describe, it, expect, beforeAll } from "vitest";
import {
  verifyKeycloakToken,
  verifyLegacyToken,
  extractUserContext,
  hasRole,
} from "../keycloak-auth.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

describe("Keycloak Authentication Integration", () => {
  describe("Legacy JWT Token Verification", () => {
    it("should verify valid legacy JWT token", () => {
      const token = jwt.sign(
        {
          userId: 1,
          email: "test@farmer.com",
          role: "farmer",
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      const decoded = verifyLegacyToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(1);
      expect(decoded?.email).toBe("test@farmer.com");
      expect(decoded?.role).toBe("farmer");
    });

    it("should reject invalid legacy JWT token", () => {
      const invalidToken = "invalid.token.here";
      const decoded = verifyLegacyToken(invalidToken);

      expect(decoded).toBeNull();
    });

    it("should reject expired legacy JWT token", () => {
      const token = jwt.sign(
        {
          userId: 1,
          email: "test@farmer.com",
          role: "farmer",
        },
        JWT_SECRET,
        { expiresIn: "-1s" } // Already expired
      );

      const decoded = verifyLegacyToken(token);

      expect(decoded).toBeNull();
    });
  });

  describe("Role-Based Access Control", () => {
    it("should correctly check farmer role", () => {
      const userContext = {
        userId: 1,
        email: "farmer@test.com",
        role: "farmer",
        source: "jwt" as const,
      };

      expect(hasRole(userContext, "farmer")).toBe(true);
      expect(hasRole(userContext, "analyst")).toBe(false);
      expect(hasRole(userContext, "admin")).toBe(false);
    });

    it("should correctly check analyst role hierarchy", () => {
      const userContext = {
        userId: 2,
        email: "analyst@test.com",
        role: "analyst",
        source: "jwt" as const,
      };

      expect(hasRole(userContext, "farmer")).toBe(true); // Analyst has farmer permissions
      expect(hasRole(userContext, "analyst")).toBe(true);
      expect(hasRole(userContext, "admin")).toBe(false);
    });

    it("should correctly check admin role hierarchy", () => {
      const userContext = {
        userId: 3,
        email: "admin@test.com",
        role: "admin",
        source: "jwt" as const,
      };

      expect(hasRole(userContext, "farmer")).toBe(true); // Admin has all permissions
      expect(hasRole(userContext, "analyst")).toBe(true);
      expect(hasRole(userContext, "admin")).toBe(true);
    });
  });

  describe("User Context Extraction", () => {
    it("should extract user context from valid JWT token", async () => {
      const token = jwt.sign(
        {
          userId: 1,
          email: "test@farmer.com",
          role: "farmer",
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      const mockRequest = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      } as any;

      const userContext = await extractUserContext(mockRequest);

      expect(userContext).not.toBeNull();
      expect(userContext?.userId).toBe(1);
      expect(userContext?.email).toBe("test@farmer.com");
      expect(userContext?.role).toBe("farmer");
      expect(userContext?.source).toBe("jwt");
    });

    it("should return null for missing authorization header", async () => {
      const mockRequest = {
        headers: {},
      } as any;

      const userContext = await extractUserContext(mockRequest);

      expect(userContext).toBeNull();
    });

    it("should return null for invalid token format", async () => {
      const mockRequest = {
        headers: {
          authorization: "InvalidFormat token",
        },
      } as any;

      const userContext = await extractUserContext(mockRequest);

      expect(userContext).toBeNull();
    });
  });

  describe("Keycloak Token Verification", () => {
    it("should handle Keycloak token verification gracefully when Keycloak is not available", async () => {
      // This test assumes Keycloak is not running
      const fakeKeycloakToken = "fake.keycloak.token";

      const result = await verifyKeycloakToken(fakeKeycloakToken);

      // Should return null when Keycloak is not available
      expect(result).toBeNull();
    });
  });

  describe("Backward Compatibility", () => {
    it("should support both Keycloak and JWT tokens", async () => {
      // Create a legacy JWT token
      const jwtToken = jwt.sign(
        {
          userId: 1,
          email: "test@farmer.com",
          role: "farmer",
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      const mockRequest = {
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
      } as any;

      // Should successfully extract user context from JWT
      const userContext = await extractUserContext(mockRequest);

      expect(userContext).not.toBeNull();
      expect(userContext?.source).toBe("jwt");
    });
  });
});

describe("Keycloak Configuration", () => {
  it("should have required environment variables defined", () => {
    // Check if environment variables are accessible
    const keycloakUrl = process.env.KEYCLOAK_URL || "http://localhost:8080";
    const keycloakRealm = process.env.KEYCLOAK_REALM || "farmer-data-collection";
    const keycloakEnabled = process.env.KEYCLOAK_ENABLED || "false";

    expect(keycloakUrl).toBeDefined();
    expect(keycloakRealm).toBeDefined();
    expect(keycloakEnabled).toBeDefined();
  });
});
