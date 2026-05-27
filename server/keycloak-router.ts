import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc-base.js";
import { getDb } from "./db.js";
import { users } from "../drizzle/schema.js";
import { eq } from "drizzle-orm";
import { verifyKeycloakToken, KeycloakToken } from "./keycloak-auth.js";

/**
 * Keycloak authentication router
 * Handles Keycloak token validation and user synchronization
 */
export const keycloakRouter = router({
  /**
   * Verify Keycloak token and sync user to local database
   */
  verifyToken: publicProcedure
    .input(
      z.object({
        token: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      // Verify Keycloak token
      const keycloakToken = await verifyKeycloakToken(input.token);
      if (!keycloakToken) {
        throw new Error("Invalid Keycloak token");
      }

      // Extract user information from Keycloak token
      const email = keycloakToken.email;
      const firstName = keycloakToken.given_name || "";
      const lastName = keycloakToken.family_name || "";
      const keycloakId = keycloakToken.sub;

      // Extract role from Keycloak token
      const roles = keycloakToken.realm_access?.roles || [];
      const role = roles.includes("admin") ? "admin" : 
                   roles.includes("analyst") ? "analyst" : "farmer";

      // Check if user exists in local database by email
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      let user;

      if (existingUser) {
        // Update existing user with Keycloak information
        const [updatedUser] = await db
          .update(users)
          .set({
            firstName,
            lastName,
            role,
            // Note: We don't update password for Keycloak users
          })
          .where(eq(users.id, existingUser.id))
          .returning();

        user = updatedUser;
      } else {
        // Create new user from Keycloak information
        const [newUser] = await db
          .insert(users)
          .values({
            email,
            password: "", // No password for Keycloak users
            firstName,
            lastName,
            role,
            isActive: true,
          })
          .returning();

        user = newUser;
      }

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        keycloakId,
      };
    }),

  /**
   * Get current user from Keycloak token
   */
  me: publicProcedure
    .input(
      z.object({
        token: z.string(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return null;
      }

      // Verify Keycloak token
      const keycloakToken = await verifyKeycloakToken(input.token);
      if (!keycloakToken) {
        return null;
      }

      // Find user by email
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, keycloakToken.email))
        .limit(1);

      if (!user || !user.isActive) {
        return null;
      }

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      };
    }),

  /**
   * Logout (client-side only, Keycloak handles server-side logout)
   */
  logout: publicProcedure.mutation(async () => {
    // Keycloak logout is handled client-side
    // This endpoint is for compatibility and logging purposes
    return {
      success: true,
      message: "Logout successful",
    };
  }),
});
