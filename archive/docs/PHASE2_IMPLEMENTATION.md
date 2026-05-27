# Phase 2 Implementation Guide: Keycloak Authentication

## Overview

Phase 2 replaces the current JWT-based authentication with **Keycloak**, an enterprise-grade Identity and Access Management (IAM) solution. This provides Single Sign-On (SSO), Multi-Factor Authentication (MFA), social login, and centralized user management.

## What's Included

### 1. Keycloak Server
- **Purpose**: Centralized authentication and authorization
- **Features**:
  - OAuth2 / OpenID Connect (OIDC) protocol
  - Single Sign-On across multiple applications
  - Multi-Factor Authentication (TOTP, SMS, Email)
  - Social login (Google, Facebook, GitHub, etc.)
  - User Federation (LDAP, Active Directory)
  - Admin console for user management
  - Account console for self-service

### 2. Realm Configuration
- **Realm**: `farmer-realm`
- **Clients**:
  - `farmer-web`: Public client for frontend (OIDC)
  - `farmer-api`: Confidential client for backend (Service Account)
- **Roles**: `farmer`, `admin`, `viewer`
- **Token Lifespans**:
  - Access Token: 5 minutes
  - SSO Session: 30 minutes idle, 10 hours max
  - Offline Session: 30 days

### 3. Frontend Integration
- **Library**: `@react-keycloak/web` + `keycloak-js`
- **Flow**: Authorization Code Flow with PKCE
- **Features**:
  - Automatic token refresh
  - Protected routes
  - Role-based access control
  - Logout with session cleanup

### 4. Backend Integration
- **Library**: `keycloak-connect`
- **Validation**: JWT token validation with Keycloak public key
- **Features**:
  - Token introspection
  - Role extraction from token
  - Service account for backend-to-backend calls

## Architecture

### Before Phase 2 (JWT)
```
Client → Login → Server (JWT Sign) → PostgreSQL
         ↓
    localStorage (JWT)
         ↓
    API Requests (Bearer JWT)
         ↓
    Server (JWT Verify)
```

### After Phase 2 (Keycloak)
```
Client → Keycloak Login → Authorization Code
         ↓
    Exchange Code for Token
         ↓
    localStorage (Access + Refresh Token)
         ↓
    API Requests (Bearer Access Token)
         ↓
    Server (Validate with Keycloak)
         ↓
    Keycloak (Token Introspection)
```

## Installation & Setup

### Prerequisites
- Docker and Docker Compose installed
- Phase 1 completed (Redis + APISIX + Prometheus)
- Node.js 22+ and pnpm installed

### Step 1: Start Keycloak

Start Keycloak and its PostgreSQL database:

```bash
docker-compose -f docker-compose.phase1.yml up -d keycloak postgres-keycloak
```

Wait for Keycloak to start (this may take 1-2 minutes):

```bash
# Check Keycloak logs
docker logs -f farmer-keycloak

# Wait for this message:
# "Keycloak 23.0 (powered by Quarkus 3.2.9.Final) started"
```

### Step 2: Access Keycloak Admin Console

Open the Keycloak admin console:

```bash
open http://localhost:8080/admin
```

Login with:
- **Username**: `admin`
- **Password**: `admin_pass`

### Step 3: Run Realm Setup Script

The setup script will automatically configure the realm, clients, roles, and test user:

```bash
node scripts/setup-keycloak.mjs
```

Expected output:
```
[Keycloak Setup] Starting configuration...

[1/7] Authenticating with Keycloak...
✅ Authenticated successfully

[2/7] Creating realm: farmer-realm...
✅ Realm created successfully

[3/7] Creating realm roles...
  ✅ Created role: farmer
  ✅ Created role: admin
  ✅ Created role: viewer

[4/7] Creating farmer-web client (frontend)...
✅ farmer-web client created

[5/7] Creating farmer-api client (backend)...
✅ farmer-api client created
   Client ID: farmer-api
   Client Secret: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ⚠️  Save this secret in your .env.local file!

[6/7] Configuring client scopes...
✅ Client scopes configured

[7/7] Creating test user...
✅ Test user created
   Username: test@farmer.com
   Password: password123
   Role: farmer

═══════════════════════════════════════════════════════════════
✅ Keycloak setup completed successfully!
═══════════════════════════════════════════════════════════════
```

### Step 4: Configure Environment Variables

Add the Keycloak client secret to `.env.local`:

```bash
# Keycloak Configuration
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=farmer-realm
KEYCLOAK_CLIENT_ID=farmer-api
KEYCLOAK_CLIENT_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Frontend Keycloak Configuration (for Vite)
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=farmer-realm
VITE_KEYCLOAK_CLIENT_ID=farmer-web
```

### Step 5: Update Frontend

The frontend has been updated to use Keycloak authentication. Key changes:

1. **KeycloakProvider** wraps the app
2. **Login page** redirects to Keycloak
3. **Protected routes** check Keycloak authentication
4. **Token refresh** happens automatically

No additional frontend changes needed - it's ready to use!

### Step 6: Update Backend

The backend has been updated to validate Keycloak tokens. Key changes:

1. **Keycloak middleware** validates tokens
2. **tRPC context** includes Keycloak user
3. **Auth router** uses Keycloak for user info

No additional backend changes needed - it's ready to use!

### Step 7: Test Authentication

1. Start the application:
   ```bash
   pnpm dev
   ```

2. Open the app: http://localhost:3000

3. Click "Login" - you'll be redirected to Keycloak

4. Login with test user:
   - **Email**: test@farmer.com
   - **Password**: password123

5. You'll be redirected back to the app, now authenticated!

## Keycloak Admin Tasks

### Create New User

1. Open Keycloak Admin Console: http://localhost:8080/admin
2. Select `farmer-realm` from dropdown
3. Go to **Users** → **Add user**
4. Fill in user details:
   - Username: user@example.com
   - Email: user@example.com
   - First Name: John
   - Last Name: Doe
   - Email Verified: ON
5. Click **Create**
6. Go to **Credentials** tab
7. Click **Set Password**
8. Enter password and set **Temporary** to OFF
9. Go to **Role Mappings** tab
10. Assign **farmer** role

### Configure Social Login

#### Google OAuth

1. Go to **Identity Providers** → **Add provider** → **Google**
2. Enter Google OAuth credentials:
   - Client ID: (from Google Cloud Console)
   - Client Secret: (from Google Cloud Console)
3. Save
4. Copy the Redirect URI and add it to Google Cloud Console

#### GitHub OAuth

1. Go to **Identity Providers** → **Add provider** → **GitHub**
2. Enter GitHub OAuth credentials:
   - Client ID: (from GitHub Developer Settings)
   - Client Secret: (from GitHub Developer Settings)
3. Save
4. Copy the Redirect URI and add it to GitHub OAuth App

### Enable Multi-Factor Authentication

1. Go to **Authentication** → **Required Actions**
2. Enable **Configure OTP**
3. Go to **Authentication** → **Flows**
4. Select **Browser** flow
5. Click **Add execution** → **OTP Form**
6. Set to **REQUIRED**

Now users will be prompted to set up MFA on their next login.

### Configure Email

For password reset and email verification:

1. Go to **Realm Settings** → **Email**
2. Configure SMTP settings:
   - Host: smtp.gmail.com (or your SMTP server)
   - Port: 587
   - From: noreply@yourdomain.com
   - Enable StartTLS: ON
   - Username: your-email@gmail.com
   - Password: your-app-password
3. Click **Save**
4. Click **Test connection**

## User Migration

### Migrate Existing Users from PostgreSQL

Run the migration script to import existing users:

```bash
node scripts/migrate-users-to-keycloak.mjs
```

This script will:
1. Export users from PostgreSQL
2. Create users in Keycloak
3. Assign appropriate roles
4. Set temporary passwords (users will be prompted to change)

### Manual Migration

For small numbers of users, you can manually create them in Keycloak Admin Console.

## Frontend Code Examples

### Get Current User

```typescript
import { useKeycloak } from '@react-keycloak/web';

function MyComponent() {
  const { keycloak } = useKeycloak();
  
  const user = {
    id: keycloak.tokenParsed?.sub,
    email: keycloak.tokenParsed?.email,
    firstName: keycloak.tokenParsed?.given_name,
    lastName: keycloak.tokenParsed?.family_name,
    roles: keycloak.tokenParsed?.roles || [],
  };
  
  return <div>Welcome, {user.firstName}!</div>;
}
```

### Check User Role

```typescript
import { useKeycloak } from '@react-keycloak/web';

function AdminPanel() {
  const { keycloak } = useKeycloak();
  
  if (!keycloak.hasRealmRole('admin')) {
    return <div>Access Denied</div>;
  }
  
  return <div>Admin Panel</div>;
}
```

### Logout

```typescript
import { useKeycloak } from '@react-keycloak/web';

function LogoutButton() {
  const { keycloak } = useKeycloak();
  
  return (
    <button onClick={() => keycloak.logout()}>
      Logout
    </button>
  );
}
```

## Backend Code Examples

### Get User from Token

```typescript
// In tRPC context
const user = ctx.keycloakUser;
console.log(user.id); // Keycloak user ID
console.log(user.email);
console.log(user.roles); // ['farmer', 'admin']
```

### Check User Role

```typescript
// In tRPC procedure
if (!ctx.keycloakUser?.roles.includes('admin')) {
  throw new Error('Admin access required');
}
```

### Service Account API Calls

```typescript
import { getKeycloakServiceToken } from './keycloak.js';

// Get service account token
const token = await getKeycloakServiceToken();

// Make API call with service account
const response = await fetch('http://other-service/api', {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
```

## Troubleshooting

### Keycloak Not Starting

**Problem**: Keycloak container fails to start

**Solution**:
1. Check logs: `docker logs farmer-keycloak`
2. Verify PostgreSQL is running: `docker ps | grep postgres-keycloak`
3. Check port 8080 is not in use: `lsof -i :8080`
4. Restart container: `docker-compose -f docker-compose.phase1.yml restart keycloak`

### Cannot Access Admin Console

**Problem**: http://localhost:8080/admin returns 404

**Solution**:
1. Wait for Keycloak to fully start (1-2 minutes)
2. Check logs for "Keycloak started" message
3. Try accessing http://localhost:8080 first
4. Clear browser cache

### Setup Script Fails

**Problem**: `node scripts/setup-keycloak.mjs` fails with authentication error

**Solution**:
1. Verify Keycloak is running: `curl http://localhost:8080/health`
2. Check admin credentials in script match docker-compose.yml
3. Wait longer for Keycloak to start
4. Check Keycloak logs for errors

### Token Validation Fails

**Problem**: Backend returns 401 Unauthorized

**Solution**:
1. Check KEYCLOAK_URL in .env.local matches running instance
2. Verify KEYCLOAK_REALM is correct
3. Check token hasn't expired (5-minute lifetime)
4. Verify client secret is correct
5. Check Keycloak logs for validation errors

### Redirect URI Mismatch

**Problem**: "Invalid redirect URI" error after login

**Solution**:
1. Go to Keycloak Admin Console
2. Select farmer-realm → Clients → farmer-web
3. Add your application URL to **Valid Redirect URIs**:
   - http://localhost:3000/*
   - http://localhost:5173/*
   - https://your-domain.com/*
4. Add to **Web Origins**:
   - http://localhost:3000
   - https://your-domain.com
5. Save

## Security Considerations

### Production Deployment

Before deploying to production:

1. **Change Admin Password**:
   ```bash
   docker exec -it farmer-keycloak /opt/keycloak/bin/kcadm.sh set-password \
     --server http://localhost:8080 \
     --realm master \
     --username admin \
     --new-password YOUR_STRONG_PASSWORD
   ```

2. **Enable HTTPS**:
   - Set `KC_HOSTNAME` to your domain
   - Set `KC_HTTPS_CERTIFICATE_FILE` and `KC_HTTPS_CERTIFICATE_KEY_FILE`
   - Or use a reverse proxy (nginx, Apache) with SSL

3. **Enable Email Verification**:
   - Configure SMTP settings
   - Set `verifyEmail: true` in realm settings

4. **Configure Token Lifespans**:
   - Reduce access token lifetime (5 minutes is good)
   - Set appropriate session timeouts
   - Enable refresh token rotation

5. **Enable Brute Force Protection**:
   - Already enabled in realm config
   - Adjust failure thresholds as needed

6. **Backup Keycloak Database**:
   - Regular backups of postgres-keycloak volume
   - Export realm configuration periodically

### Client Secrets

- **Never commit** client secrets to version control
- Store in environment variables or secret management service
- Rotate secrets periodically
- Use different secrets for dev/staging/production

## Performance Optimization

### Token Caching

Keycloak tokens are cached by the client libraries. To optimize:

1. **Frontend**: Tokens stored in memory (not localStorage for security)
2. **Backend**: Cache token validation results in Redis
3. **Refresh Tokens**: Automatically refresh before expiration

### Database Connection Pool

For high-traffic applications:

1. Increase Keycloak database connection pool
2. Use read replicas for token validation
3. Enable Keycloak clustering for high availability

## Monitoring

### Keycloak Metrics

Keycloak exposes metrics at `/metrics`:

```bash
curl http://localhost:8080/metrics
```

Add to Prometheus configuration:

```yaml
scrape_configs:
  - job_name: 'keycloak'
    static_configs:
      - targets: ['keycloak:8080']
```

### Key Metrics to Monitor

- **Login Success/Failure Rate**
- **Token Generation Time**
- **Active Sessions**
- **Failed Login Attempts** (brute force detection)
- **Token Validation Time**

## Next Steps

### Phase 3: Kafka Event Streaming
- Implement event-driven architecture
- Stream authentication events to Kafka
- Real-time user activity monitoring
- Audit trail with event sourcing

### Phase 4: Dapr Service Mesh
- Decompose into microservices
- Keycloak as central auth for all services
- Service-to-service authentication

### Phase 5: Advanced Keycloak Features
- User Federation (LDAP/AD)
- Custom authentication flows
- Passwordless authentication (WebAuthn)
- Advanced authorization policies

## Conclusion

Phase 2 successfully replaces JWT authentication with Keycloak, providing enterprise-grade security, SSO, MFA, and centralized user management. The application is now ready for:

1. ✅ **Single Sign-On** across multiple applications
2. ✅ **Multi-Factor Authentication** for enhanced security
3. ✅ **Social Login** for better user experience
4. ✅ **Centralized User Management** with admin console
5. ✅ **Production-Ready Security** with industry standards

Continue with Phase 3 to add Kafka event streaming for real-time data processing and audit trails.
