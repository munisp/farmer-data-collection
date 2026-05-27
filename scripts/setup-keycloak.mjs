#!/usr/bin/env node

/**
 * Keycloak Realm Setup Script
 * 
 * This script automatically configures Keycloak with:
 * - farmer-realm
 * - farmer-web client (frontend OIDC)
 * - farmer-api client (backend service account)
 * - User roles and permissions
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const ADMIN_USERNAME = process.env.KEYCLOAK_ADMIN || 'admin';
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin_pass';
const REALM_NAME = 'farmer-realm';

async function setupKeycloak() {
  console.log('[Keycloak Setup] Starting configuration...\n');

  // Initialize Keycloak Admin Client
  const kcAdminClient = new KcAdminClient({
    baseUrl: KEYCLOAK_URL,
    realmName: 'master',
  });

  try {
    // Authenticate with admin credentials
    console.log('[1/7] Authenticating with Keycloak...');
    await kcAdminClient.auth({
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
      grantType: 'password',
      clientId: 'admin-cli',
    });
    console.log('✅ Authenticated successfully\n');

    // Create realm
    console.log(`[2/7] Creating realm: ${REALM_NAME}...`);
    try {
      await kcAdminClient.realms.create({
        realm: REALM_NAME,
        enabled: true,
        displayName: 'Farmer Data Collection Platform',
        displayNameHtml: '<b>Farmer Data Collection</b> Platform',
        
        // Token settings
        accessTokenLifespan: 300, // 5 minutes
        ssoSessionIdleTimeout: 1800, // 30 minutes
        ssoSessionMaxLifespan: 36000, // 10 hours
        offlineSessionIdleTimeout: 2592000, // 30 days
        
        // Login settings
        registrationAllowed: true,
        registrationEmailAsUsername: true,
        loginWithEmailAllowed: true,
        duplicateEmailsAllowed: false,
        verifyEmail: false, // Set to true in production
        resetPasswordAllowed: true,
        rememberMe: true,
        
        // Security settings
        bruteForceProtected: true,
        permanentLockout: false,
        maxFailureWaitSeconds: 900,
        minimumQuickLoginWaitSeconds: 60,
        waitIncrementSeconds: 60,
        quickLoginCheckMilliSeconds: 1000,
        maxDeltaTimeSeconds: 43200,
        failureFactor: 5,
        
        // Themes
        loginTheme: 'keycloak',
        accountTheme: 'keycloak',
        adminTheme: 'keycloak',
        emailTheme: 'keycloak',
      });
      console.log('✅ Realm created successfully\n');
    } catch (error) {
      if (error.response?.status === 409) {
        console.log('⚠️  Realm already exists, continuing...\n');
      } else {
        throw error;
      }
    }

    // Switch to the new realm
    kcAdminClient.setConfig({ realmName: REALM_NAME });

    // Create realm roles
    console.log('[3/7] Creating realm roles...');
    const roles = ['farmer', 'admin', 'viewer'];
    for (const roleName of roles) {
      try {
        await kcAdminClient.roles.create({
          name: roleName,
          description: `${roleName.charAt(0).toUpperCase() + roleName.slice(1)} role`,
        });
        console.log(`  ✅ Created role: ${roleName}`);
      } catch (error) {
        if (error.response?.status === 409) {
          console.log(`  ⚠️  Role ${roleName} already exists`);
        } else {
          throw error;
        }
      }
    }
    console.log('');

    // Create farmer-web client (frontend)
    console.log('[4/7] Creating farmer-web client (frontend)...');
    try {
      await kcAdminClient.clients.create({
        clientId: 'farmer-web',
        name: 'Farmer Data Collection Web App',
        description: 'Frontend web application for farmer data collection',
        enabled: true,
        publicClient: true, // Public client (no secret needed)
        protocol: 'openid-connect',
        
        // Redirect URIs (adjust for production)
        redirectUris: [
          'http://localhost:3000/*',
          'http://localhost:5173/*', // Vite dev server
          'https://*.manusvm.computer/*', // Manus sandbox
          'https://*.manus.space/*', // Production
        ],
        webOrigins: [
          'http://localhost:3000',
          'http://localhost:5173',
          'https://*.manusvm.computer',
          'https://*.manus.space',
        ],
        
        // OIDC settings
        standardFlowEnabled: true, // Authorization Code Flow
        implicitFlowEnabled: false,
        directAccessGrantsEnabled: true, // Direct Grant (username/password)
        serviceAccountsEnabled: false,
        
        // Token settings
        frontchannelLogout: true,
        attributes: {
          'pkce.code.challenge.method': 'S256',
          'post.logout.redirect.uris': '+',
        },
      });
      console.log('✅ farmer-web client created\n');
    } catch (error) {
      if (error.response?.status === 409) {
        console.log('⚠️  farmer-web client already exists\n');
      } else {
        throw error;
      }
    }

    // Create farmer-api client (backend service account)
    console.log('[5/7] Creating farmer-api client (backend)...');
    try {
      const apiClient = await kcAdminClient.clients.create({
        clientId: 'farmer-api',
        name: 'Farmer Data Collection API',
        description: 'Backend API service for farmer data collection',
        enabled: true,
        publicClient: false, // Confidential client (has secret)
        protocol: 'openid-connect',
        
        // Service account settings
        standardFlowEnabled: false,
        implicitFlowEnabled: false,
        directAccessGrantsEnabled: false,
        serviceAccountsEnabled: true, // Enable service account
        authorizationServicesEnabled: true,
        
        // Bearer-only for API
        bearerOnly: false,
        
        attributes: {
          'use.refresh.tokens': 'true',
        },
      });
      
      // Get the client secret
      const clients = await kcAdminClient.clients.find({ clientId: 'farmer-api' });
      if (clients.length > 0) {
        const clientSecret = await kcAdminClient.clients.getClientSecret({
          id: clients[0].id,
        });
        console.log('✅ farmer-api client created');
        console.log(`   Client ID: farmer-api`);
        console.log(`   Client Secret: ${clientSecret.value}`);
        console.log(`   ⚠️  Save this secret in your .env.local file!\n`);
      }
    } catch (error) {
      if (error.response?.status === 409) {
        console.log('⚠️  farmer-api client already exists\n');
        // Try to get the secret
        try {
          const clients = await kcAdminClient.clients.find({ clientId: 'farmer-api' });
          if (clients.length > 0) {
            const clientSecret = await kcAdminClient.clients.getClientSecret({
              id: clients[0].id,
            });
            console.log(`   Client Secret: ${clientSecret.value}\n`);
          }
        } catch (e) {
          console.log('   Could not retrieve client secret\n');
        }
      } else {
        throw error;
      }
    }

    // Configure default client scopes
    console.log('[6/7] Configuring client scopes...');
    try {
      // Add roles to token
      const clients = await kcAdminClient.clients.find({ clientId: 'farmer-web' });
      if (clients.length > 0) {
        const clientId = clients[0].id;
        
        // Add realm roles mapper
        await kcAdminClient.clients.addProtocolMapper({ id: clientId }, {
          name: 'realm-roles',
          protocol: 'openid-connect',
          protocolMapper: 'oidc-usermodel-realm-role-mapper',
          consentRequired: false,
          config: {
            'multivalued': 'true',
            'userinfo.token.claim': 'true',
            'id.token.claim': 'true',
            'access.token.claim': 'true',
            'claim.name': 'roles',
            'jsonType.label': 'String',
          },
        });
        console.log('✅ Client scopes configured\n');
      }
    } catch (error) {
      if (error.response?.status === 409) {
        console.log('⚠️  Client scopes already configured\n');
      } else {
        console.log('⚠️  Could not configure client scopes:', error.message, '\n');
      }
    }

    // Create test user
    console.log('[7/7] Creating test user...');
    try {
      const user = await kcAdminClient.users.create({
        username: 'test@farmer.com',
        email: 'test@farmer.com',
        firstName: 'Test',
        lastName: 'Farmer',
        enabled: true,
        emailVerified: true,
      });
      
      // Set password
      await kcAdminClient.users.resetPassword({
        id: user.id,
        credential: {
          temporary: false,
          type: 'password',
          value: 'password123',
        },
      });
      
      // Assign farmer role
      const farmerRole = await kcAdminClient.roles.findOneByName({ name: 'farmer' });
      if (farmerRole) {
        await kcAdminClient.users.addRealmRoleMappings({
          id: user.id,
          roles: [
            {
              id: farmerRole.id,
              name: farmerRole.name,
            },
          ],
        });
      }
      
      console.log('✅ Test user created');
      console.log('   Username: test@farmer.com');
      console.log('   Password: password123');
      console.log('   Role: farmer\n');
    } catch (error) {
      if (error.response?.status === 409) {
        console.log('⚠️  Test user already exists\n');
      } else {
        throw error;
      }
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ Keycloak setup completed successfully!');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log('📋 Configuration Summary:');
    console.log(`   Keycloak URL: ${KEYCLOAK_URL}`);
    console.log(`   Realm: ${REALM_NAME}`);
    console.log(`   Admin Console: ${KEYCLOAK_URL}/admin`);
    console.log(`   Account Console: ${KEYCLOAK_URL}/realms/${REALM_NAME}/account\n`);
    
    console.log('🔑 Clients:');
    console.log('   - farmer-web (Public Client for Frontend)');
    console.log('   - farmer-api (Confidential Client for Backend)\n');
    
    console.log('👤 Test User:');
    console.log('   - Email: test@farmer.com');
    console.log('   - Password: password123\n');
    
    console.log('📝 Next Steps:');
    console.log('   1. Add KEYCLOAK_CLIENT_SECRET to .env.local');
    console.log('   2. Update frontend to use Keycloak authentication');
    console.log('   3. Update backend to validate Keycloak tokens');
    console.log('   4. Migrate existing users to Keycloak\n');

  } catch (error) {
    console.error('\n❌ Error setting up Keycloak:');
    console.error(error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run the setup
setupKeycloak();
