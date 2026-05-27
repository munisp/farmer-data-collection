#!/usr/bin/env node

/**
 * User Migration Script: PostgreSQL → Keycloak
 * 
 * This script migrates existing users from PostgreSQL to Keycloak
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';
import pg from 'pg';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local', override: true });

const { Client } = pg;

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const ADMIN_USERNAME = process.env.KEYCLOAK_ADMIN || 'admin';
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin_pass';
const REALM_NAME = 'farmer-realm';

const DATABASE_URL = process.env.DATABASE_URL;

async function migrateUsers() {
  console.log('[User Migration] Starting migration from PostgreSQL to Keycloak...\n');

  // Connect to PostgreSQL
  console.log('[1/4] Connecting to PostgreSQL...');
  const pgClient = new Client({ connectionString: DATABASE_URL });
  await pgClient.connect();
  console.log('✅ Connected to PostgreSQL\n');

  // Connect to Keycloak
  console.log('[2/4] Connecting to Keycloak...');
  const kcAdminClient = new KcAdminClient({
    baseUrl: KEYCLOAK_URL,
    realmName: 'master',
  });

  await kcAdminClient.auth({
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
    grantType: 'password',
    clientId: 'admin-cli',
  });

  kcAdminClient.setConfig({ realmName: REALM_NAME });
  console.log('✅ Connected to Keycloak\n');

  // Fetch users from PostgreSQL
  console.log('[3/4] Fetching users from PostgreSQL...');
  const result = await pgClient.query(`
    SELECT id, email, first_name, last_name, role, is_active
    FROM users
    WHERE is_active = true
    ORDER BY id
  `);

  const users = result.rows;
  console.log(`✅ Found ${users.length} users to migrate\n`);

  // Migrate each user
  console.log('[4/4] Migrating users to Keycloak...');
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const user of users) {
    try {
      console.log(`  Processing: ${user.email}...`);

      // Check if user already exists
      const existingUsers = await kcAdminClient.users.find({
        email: user.email,
        exact: true,
      });

      if (existingUsers.length > 0) {
        console.log(`    ⚠️  User already exists in Keycloak, skipping`);
        skipCount++;
        continue;
      }

      // Create user in Keycloak
      const newUser = await kcAdminClient.users.create({
        username: user.email,
        email: user.email,
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        enabled: user.is_active,
        emailVerified: true,
        attributes: {
          postgresId: [user.id.toString()],
          migratedAt: [new Date().toISOString()],
        },
      });

      // Set temporary password (users will be prompted to change)
      await kcAdminClient.users.resetPassword({
        id: newUser.id,
        credential: {
          temporary: true,
          type: 'password',
          value: 'ChangeMe123!',
        },
      });

      // Assign role
      const roleName = user.role || 'farmer';
      const role = await kcAdminClient.roles.findOneByName({ name: roleName });
      
      if (role) {
        await kcAdminClient.users.addRealmRoleMappings({
          id: newUser.id,
          roles: [
            {
              id: role.id,
              name: role.name,
            },
          ],
        });
      }

      console.log(`    ✅ Migrated successfully (role: ${roleName})`);
      successCount++;
    } catch (error) {
      console.error(`    ❌ Error migrating user:`, error.message);
      errorCount++;
    }
  }

  // Close connections
  await pgClient.end();

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✅ User migration completed!');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log('📊 Migration Summary:');
  console.log(`   Total users: ${users.length}`);
  console.log(`   ✅ Successfully migrated: ${successCount}`);
  console.log(`   ⚠️  Skipped (already exist): ${skipCount}`);
  console.log(`   ❌ Failed: ${errorCount}\n`);
  
  if (successCount > 0) {
    console.log('🔑 Important:');
    console.log('   All migrated users have temporary password: ChangeMe123!');
    console.log('   Users will be prompted to change password on first login\n');
  }
  
  console.log('📝 Next Steps:');
  console.log('   1. Notify users about the migration');
  console.log('   2. Send password reset instructions');
  console.log('   3. Test login with migrated users');
  console.log('   4. Monitor Keycloak logs for issues\n');
}

// Run migration
migrateUsers().catch((error) => {
  console.error('\n❌ Migration failed:');
  console.error(error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
