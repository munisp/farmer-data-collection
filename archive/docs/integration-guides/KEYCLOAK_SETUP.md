# Keycloak Authentication Setup Guide

This guide explains how to set up and configure Keycloak authentication for the Farmer Data Collection Platform.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Keycloak Installation](#keycloak-installation)
4. [Realm Configuration](#realm-configuration)
5. [Client Configuration](#client-configuration)
6. [Role Configuration](#role-configuration)
7. [Environment Variables](#environment-variables)
8. [User Migration](#user-migration)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)

## Overview

The platform supports **two authentication modes**:

1. **Legacy JWT Authentication** (default) - Simple email/password authentication with JWT tokens
2. **Keycloak Authentication** - Enterprise-grade SSO with OAuth2/OIDC

Both modes can coexist, allowing gradual migration from JWT to Keycloak.

## Prerequisites

- Docker and Docker Compose installed
- PostgreSQL database running
- Node.js 18+ and pnpm installed

## Keycloak Installation

### Option 1: Using Docker Compose (Recommended)

The project includes a complete Docker Compose configuration with Keycloak:

```bash
# Start all enterprise services including Keycloak
docker-compose -f docker-compose.enterprise.yml up -d keycloak postgres-keycloak

# Check Keycloak status
docker-compose -f docker-compose.enterprise.yml ps keycloak
```

Keycloak will be available at: **http://localhost:8080**

Default admin credentials:
- Username: `admin`
- Password: `admin_pass`

### Option 2: Standalone Installation

Download and run Keycloak standalone:

```bash
# Download Keycloak
wget https://github.com/keycloak/keycloak/releases/download/23.0.0/keycloak-23.0.0.tar.gz
tar -xzf keycloak-23.0.0.tar.gz
cd keycloak-23.0.0

# Start Keycloak in development mode
bin/kc.sh start-dev
```

## Realm Configuration

### Step 1: Create Realm

1. Log in to Keycloak Admin Console: http://localhost:8080
2. Click **"Create Realm"** button
3. Set realm name: `farmer-data-collection`
4. Click **"Create"**

### Step 2: Configure Realm Settings

1. Go to **Realm Settings** → **General**
2. Set **Display name**: `Farmer Data Collection`
3. Enable **User registration**: ON
4. Enable **Email as username**: ON
5. Enable **Login with email**: ON

### Step 3: Configure Tokens

1. Go to **Realm Settings** → **Tokens**
2. Set **Access Token Lifespan**: `15 minutes`
3. Set **SSO Session Idle**: `30 minutes`
4. Set **SSO Session Max**: `10 hours`
5. Click **"Save"**

## Client Configuration

### Step 1: Create Client

1. Go to **Clients** → **Create client**
2. Set **Client ID**: `farmer-web-app`
3. Set **Client type**: `OpenID Connect`
4. Click **"Next"**

### Step 2: Configure Client Settings

1. Enable **Client authentication**: OFF (public client)
2. Enable **Authorization**: OFF
3. Enable **Standard flow**: ON
4. Enable **Direct access grants**: ON
5. Enable **Implicit flow**: OFF
6. Click **"Next"**

### Step 3: Configure Valid Redirect URIs

Add the following redirect URIs:

```
http://localhost:3000/*
http://localhost:5173/*
https://your-production-domain.com/*
```

### Step 4: Configure Web Origins

Add the following web origins:

```
http://localhost:3000
http://localhost:5173
https://your-production-domain.com
```

Click **"Save"**

## Role Configuration

### Step 1: Create Realm Roles

1. Go to **Realm roles** → **Create role**
2. Create the following roles:

   - **farmer** (default role for regular users)
     - Name: `farmer`
     - Description: `Regular farmer user with access to own data`

   - **analyst** (data analyst role)
     - Name: `analyst`
     - Description: `Data analyst with read access to aggregated data`

   - **admin** (administrator role)
     - Name: `admin`
     - Description: `System administrator with full access`

### Step 2: Set Default Role

1. Go to **Realm roles** → **Default roles**
2. Add `farmer` to default roles
3. Click **"Save"**

## Environment Variables

### Backend Configuration

Add the following to your `.env` file:

```bash
# Keycloak Configuration
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=farmer-data-collection
KEYCLOAK_CLIENT_ID=farmer-web-app
KEYCLOAK_CLIENT_SECRET=
KEYCLOAK_PUBLIC_KEY=

# Enable Keycloak authentication (set to 'true' to enable)
KEYCLOAK_ENABLED=false

# Keycloak Admin (for user migration)
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=admin_pass
```

### Frontend Configuration

Add the following to your `.env.local` file:

```bash
# Keycloak Frontend Configuration
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=farmer-data-collection
VITE_KEYCLOAK_CLIENT_ID=farmer-web-app
VITE_KEYCLOAK_ENABLED=false
```

### Enable Keycloak

To switch from JWT to Keycloak authentication:

1. Set `KEYCLOAK_ENABLED=true` in backend `.env`
2. Set `VITE_KEYCLOAK_ENABLED=true` in frontend `.env.local`
3. Restart the application

## User Migration

### Automatic Migration Script

The platform includes a migration script to transfer existing users from JWT to Keycloak:

```bash
# Run migration script
pnpm tsx scripts/migrate-users-to-keycloak.ts
```

The script will:
1. Connect to your database
2. Fetch all existing users
3. Create corresponding users in Keycloak
4. Assign appropriate roles
5. Clear local passwords (mark as migrated)

### Manual User Creation

To manually create a user in Keycloak:

1. Go to **Users** → **Add user**
2. Fill in user details:
   - Username: user email
   - Email: user email
   - First name: user first name
   - Last name: user last name
   - Email verified: ON
3. Click **"Create"**
4. Go to **Credentials** tab
5. Set password (temporary or permanent)
6. Go to **Role mappings** tab
7. Assign appropriate realm role (farmer, analyst, or admin)

## Testing

### Test Keycloak Authentication

1. **Start Keycloak**:
   ```bash
   docker-compose -f docker-compose.enterprise.yml up -d keycloak
   ```

2. **Enable Keycloak in environment**:
   ```bash
   # Backend
   echo "KEYCLOAK_ENABLED=true" >> .env
   
   # Frontend
   echo "VITE_KEYCLOAK_ENABLED=true" >> .env.local
   ```

3. **Restart application**:
   ```bash
   pnpm dev
   ```

4. **Test login flow**:
   - Navigate to http://localhost:3000
   - Click "Login" button
   - You should be redirected to Keycloak login page
   - Enter credentials
   - You should be redirected back to the application

### Test JWT Fallback

1. **Disable Keycloak**:
   ```bash
   echo "KEYCLOAK_ENABLED=false" >> .env
   echo "VITE_KEYCLOAK_ENABLED=false" >> .env.local
   ```

2. **Restart application**

3. **Test legacy login**:
   - Navigate to http://localhost:3000/login
   - Enter email and password
   - You should be logged in with JWT token

## Troubleshooting

### Issue: "Failed to initialize Keycloak"

**Solution**:
- Check if Keycloak is running: `docker-compose ps keycloak`
- Verify Keycloak URL is correct in environment variables
- Check browser console for detailed error messages

### Issue: "Invalid token" errors

**Solution**:
- Verify realm name matches in both Keycloak and environment variables
- Check if client ID is correct
- Ensure token hasn't expired (check token lifespan settings)

### Issue: "User not found" after Keycloak login

**Solution**:
- Run the user migration script
- Or manually create the user in Keycloak
- Ensure email addresses match between database and Keycloak

### Issue: CORS errors

**Solution**:
- Add your frontend URL to Keycloak client's "Web Origins"
- Ensure "Valid Redirect URIs" includes your frontend URL
- Check if Keycloak is accessible from your frontend

### Issue: Token refresh not working

**Solution**:
- Check token lifespan settings in Keycloak
- Verify refresh token is enabled for the client
- Check browser console for token refresh errors

## Security Best Practices

1. **Change default admin password** in production
2. **Enable HTTPS** for Keycloak in production
3. **Use strong passwords** for Keycloak admin account
4. **Enable email verification** for new users
5. **Configure session timeouts** appropriately
6. **Enable brute force detection** in Keycloak
7. **Regularly update** Keycloak to latest version
8. **Use separate database** for Keycloak in production
9. **Enable audit logging** for security events
10. **Implement rate limiting** on authentication endpoints

## Production Deployment

### Keycloak Production Configuration

1. **Use PostgreSQL backend** (already configured in docker-compose)
2. **Enable HTTPS**:
   ```yaml
   environment:
     KC_HTTPS_CERTIFICATE_FILE: /path/to/cert.pem
     KC_HTTPS_CERTIFICATE_KEY_FILE: /path/to/key.pem
   ```

3. **Set hostname**:
   ```yaml
   environment:
     KC_HOSTNAME: keycloak.yourdomain.com
     KC_HOSTNAME_STRICT: true
   ```

4. **Disable dev mode**:
   ```yaml
   command: start
   ```

5. **Configure database**:
   ```yaml
   environment:
     KC_DB: postgres
     KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
     KC_DB_USERNAME: keycloak
     KC_DB_PASSWORD: <strong-password>
   ```

### Update Environment Variables

Update production environment variables:

```bash
KEYCLOAK_URL=https://keycloak.yourdomain.com
KEYCLOAK_REALM=farmer-data-collection
KEYCLOAK_CLIENT_ID=farmer-web-app
KEYCLOAK_ENABLED=true

VITE_KEYCLOAK_URL=https://keycloak.yourdomain.com
VITE_KEYCLOAK_REALM=farmer-data-collection
VITE_KEYCLOAK_CLIENT_ID=farmer-web-app
VITE_KEYCLOAK_ENABLED=true
```

## Additional Resources

- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [Keycloak Admin REST API](https://www.keycloak.org/docs-api/latest/rest-api/)
- [OAuth 2.0 and OpenID Connect](https://oauth.net/2/)
- [Keycloak Security Best Practices](https://www.keycloak.org/docs/latest/server_admin/#_security_best_practices)

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Keycloak logs: `docker-compose logs keycloak`
3. Check application logs for authentication errors
4. Consult Keycloak documentation
5. Open an issue in the project repository
