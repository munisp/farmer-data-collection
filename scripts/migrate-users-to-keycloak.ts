/**
 * User Migration Script: JWT to Keycloak
 * 
 * This script migrates existing users from JWT-based authentication to Keycloak.
 * It creates corresponding users in Keycloak and maintains the mapping in the database.
 * 
 * Usage:
 *   pnpm tsx scripts/migrate-users-to-keycloak.ts
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import pg from "pg";
import { users } from "../drizzle/schema.js";

const { Pool } = pg;

// Keycloak Admin API configuration
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "http://localhost:8080";
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || "farmer-data-collection";
const KEYCLOAK_ADMIN_USERNAME = process.env.KEYCLOAK_ADMIN_USERNAME || "admin";
const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || "admin_pass";

// Database configuration
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://farmer_user:farmer_pass@localhost:5432/farmer_data?sslmode=disable";

interface KeycloakUser {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  emailVerified: boolean;
  credentials?: Array<{
    type: string;
    value: string;
    temporary: boolean;
  }>;
}

/**
 * Get Keycloak admin access token
 */
async function getKeycloakAdminToken(): Promise<string> {
  const response = await fetch(
    `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: KEYCLOAK_ADMIN_USERNAME,
        password: KEYCLOAK_ADMIN_PASSWORD,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get admin token: ${response.statusText}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Create user in Keycloak
 */
async function createKeycloakUser(
  token: string,
  user: KeycloakUser
): Promise<string> {
  const response = await fetch(
    `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(user),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create user: ${error}`);
  }

  // Get user ID from Location header
  const location = response.headers.get("Location");
  if (!location) {
    throw new Error("No Location header in response");
  }

  const userId = location.split("/").pop();
  if (!userId) {
    throw new Error("Could not extract user ID from Location header");
  }

  return userId;
}

/**
 * Assign role to user in Keycloak
 */
async function assignRoleToUser(
  token: string,
  userId: string,
  role: string
): Promise<void> {
  // Get realm roles
  const rolesResponse = await fetch(
    `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/roles`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!rolesResponse.ok) {
    throw new Error("Failed to get realm roles");
  }

  const roles = await rolesResponse.json();
  const roleObj = roles.find((r: any) => r.name === role);

  if (!roleObj) {
    console.warn(`Role ${role} not found in Keycloak, skipping role assignment`);
    return;
  }

  // Assign role to user
  const assignResponse = await fetch(
    `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${userId}/role-mappings/realm`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify([roleObj]),
    }
  );

  if (!assignResponse.ok) {
    throw new Error(`Failed to assign role: ${await assignResponse.text()}`);
  }
}

/**
 * Main migration function
 */
async function migrateUsers() {
  console.log("Starting user migration to Keycloak...");

  // Connect to database
  const pool = new Pool({
    connectionString: DATABASE_URL,
  });

  const db = drizzle(pool);

  try {
    // Get Keycloak admin token
    console.log("Getting Keycloak admin token...");
    const adminToken = await getKeycloakAdminToken();
    console.log("✓ Admin token obtained");

    // Get all users from database
    console.log("Fetching users from database...");
    const allUsers = await db.select().from(users);
    console.log(`✓ Found ${allUsers.length} users to migrate`);

    let successCount = 0;
    let errorCount = 0;

    // Migrate each user
    for (const user of allUsers) {
      try {
        console.log(`\nMigrating user: ${user.email}`);

        // Skip if user has no password (already migrated or Keycloak user)
        if (!user.password || user.password === "") {
          console.log(`  ⊘ Skipping (no password, likely already migrated)`);
          continue;
        }

        // Create user in Keycloak
        const keycloakUser: KeycloakUser = {
          username: user.email,
          email: user.email,
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          enabled: user.isActive,
          emailVerified: true,
          // Note: We don't migrate passwords, users will need to reset
          // Alternatively, you can set a temporary password here
        };

        const keycloakUserId = await createKeycloakUser(adminToken, keycloakUser);
        console.log(`  ✓ Created in Keycloak (ID: ${keycloakUserId})`);

        // Assign role
        await assignRoleToUser(adminToken, keycloakUserId, user.role);
        console.log(`  ✓ Assigned role: ${user.role}`);

        // Clear password in database (mark as migrated)
        await db
          .update(users)
          .set({ password: "" })
          .where(eq(users.id, user.id));
        console.log(`  ✓ Cleared local password`);

        successCount++;
      } catch (error) {
        console.error(`  ✗ Error migrating user ${user.email}:`, error);
        errorCount++;
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log("Migration completed!");
    console.log(`✓ Successfully migrated: ${successCount} users`);
    console.log(`✗ Failed: ${errorCount} users`);
    console.log("=".repeat(50));
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
migrateUsers().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
