# Centralized Auth Server - Implementation Plan

**Part 2 of MyJKKN Auth Server PRD**  
**Date**: September 30, 2025  
**Parent Document**: Centralized_Auth_Server_System_Updated_PRD.md

---

# 9. API Specifications

## 9.1 Auth Server APIs (Migrated from MyJKKN)

### 9.1.1 Authorize Endpoint

**Endpoint**: `GET /api/auth/authorize`  
**Source**: `MyJKKN/app/api/auth/child-app/authorize/route.ts`  
**Authentication**: None (initiates flow)

**Query Parameters**:

```typescript
{
  client_id: string;        // app_id from applications table
  redirect_uri: string;     // Must match allowed_redirect_uris
  response_type: 'code';    // OAuth 2.0 authorization code
  scope?: string;           // Space-separated scopes
  state?: string;           // CSRF protection
}
```

**Response**: Redirect to login page or auth code

```
Success: {redirect_uri}?code={auth_code}&state={state}
Error: {redirect_uri}?error=access_denied&state={state}
```

**Implementation**:

```typescript
// auth-server/app/api/auth/authorize/route.ts
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const client_id = searchParams.get('client_id');
  const redirect_uri = searchParams.get('redirect_uri');
  const scope = searchParams.get('scope') || 'read write profile';
  const state = searchParams.get('state');

  // 1. Validate application
  const app = await validateApplication(client_id, redirect_uri);

  // 2. Check if user is authenticated
  const user = await getCurrentUser();

  // 3. Generate auth code
  const code = await generateAuthCode(user.id, client_id, scope);

  // 4. Redirect with code
  return NextResponse.redirect(
    `${redirect_uri}?code=${code}&state=${state}`
  );
}
```

---

### 9.1.2 Token Endpoint

**Endpoint**: `POST /api/auth/token`  
**Source**: `MyJKKN/app/api/auth/child-app/token/route.ts`  
**Authentication**: API Key (in request body)

**Request Body (Authorization Code Grant)**:

```json
{
  "grant_type": "authorization_code",
  "code": "AUTH_CODE_HERE",
  "app_id": "student_portal_v1",
  "api_key": "API_KEY_HERE",
  "redirect_uri": "https://student-portal.com/callback"
}
```

**Request Body (Refresh Token Grant)**:

```json
{
  "grant_type": "refresh_token",
  "refresh_token": "REFRESH_TOKEN_HERE",
  "app_id": "student_portal_v1",
  "api_key": "API_KEY_HERE"
}
```

**Response (200 OK)**:

```json
{
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "read write profile",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "full_name": "John Doe",
    "role": "student",
    "institution_id": "inst-uuid"
  }
}
```

**Implementation** (Migrated from MyJKKN):

```typescript
// auth-server/app/api/auth/token/route.ts
import { SignJWT } from 'jose';
import { validateApiKey, validateAuthCode } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { grant_type, code, app_id, api_key, refresh_token } = body;

  // Validate API key
  const app = await validateApiKey(app_id, api_key);

  if (grant_type === 'authorization_code') {
    // Validate auth code
    const authCode = await validateAuthCode(code, app_id);

    // Get user
    const user = await getUserById(authCode.user_id);

    // Generate tokens
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

    const accessToken = await new SignJWT({
      sub: user.id,
      email: user.email,
      role: user.role,
      app_id: app_id,
      scope: authCode.scope,
      institution_id: user.institution_id
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secret);

    const refreshToken = await new SignJWT({
      sub: user.id,
      app_id: app_id,
      type: 'refresh'
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret);

    // Create session
    await createSession(user.id, app_id, accessToken, refreshToken);

    return NextResponse.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 3600,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        institution_id: user.institution_id
      }
    });
  }

  if (grant_type === 'refresh_token') {
    // Handle refresh token flow
    // (Similar implementation)
  }
}
```

---

### 9.1.3 Validate Endpoint

**Endpoint**: `POST /api/auth/validate`  
**Source**: `MyJKKN/app/api/auth/child-app/validate/route.ts`  
**Authentication**: Bearer Token

**Request Body**:

```json
{
  "access_token": "eyJhbGc...",
  "child_app_id": "student_portal_v1"
}
```

**Response (200 OK)**:

```json
{
  "valid": true,
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "full_name": "John Doe",
    "role": "student",
    "app_permissions": {
      "student_portal_v1": ["read", "write", "profile"]
    }
  },
  "token_info": {
    "issued_at": "2025-09-30T10:00:00Z",
    "expires_at": "2025-09-30T11:00:00Z",
    "scope": "read write profile"
  }
}
```

**Response (401 Unauthorized)**:

```json
{
  "valid": false,
  "error": "Invalid or expired token"
}
```

---

### 9.1.4 Sync User Endpoint (New)

**Endpoint**: `POST /api/auth/sync-user`  
**Authentication**: API Key (from MyJKKN)  
**Purpose**: Webhook from MyJKKN to sync user changes

**Request Headers**:

```http
Content-Type: application/json
x-api-key: <MYJKKN_API_KEY>
x-webhook-signature: <HMAC_SIGNATURE>
```

**Request Body**:

```json
{
  "parent_user_id": "uuid-from-myjkkn",
  "email": "user@example.com",
  "full_name": "John Doe",
  "role": "student",
  "institution_id": "institution-uuid",
  "metadata": {
    "phone": "+1234567890"
  }
}
```

**Response (201 Created)**:

```json
{
  "success": true,
  "message": "User synced successfully",
  "data": {
    "user_id": "uuid-in-auth-server",
    "parent_user_id": "uuid-from-myjkkn",
    "synced_at": "2025-09-30T10:00:00Z"
  }
}
```

**Implementation**:

```typescript
// auth-server/app/api/auth/sync-user/route.ts
export async function POST(request: NextRequest) {
  // Verify webhook signature
  const signature = request.headers.get('x-webhook-signature');
  await verifyWebhookSignature(request, signature);

  const data = await request.json();

  // Upsert user
  const { data: user, error } = await supabase
    .from('users')
    .upsert({
      parent_user_id: data.parent_user_id,
      email: data.email,
      full_name: data.full_name,
      role: data.role,
      institution_id: data.institution_id,
      metadata: data.metadata,
      last_synced_at: new Date().toISOString()
    }, {
      onConflict: 'parent_user_id'
    })
    .select()
    .single();

  return NextResponse.json({
    success: true,
    message: 'User synced successfully',
    data: user
  }, { status: 201 });
}
```

---

### 9.1.5 Grant Access Endpoint

**Endpoint**: `POST /api/auth/grant-access`  
**Authentication**: API Key (from MyJKKN admin)  
**Purpose**: Grant child app access to user

**Request Body**:

```json
{
  "parent_user_id": "uuid-from-myjkkn",
  "app_id": "student_portal_v1",
  "scopes": ["read", "write", "profile"]
}
```

**Response (200 OK)**:

```json
{
  "success": true,
  "message": "Access granted successfully",
  "data": {
    "user_id": "uuid",
    "app_id": "student_portal_v1",
    "scopes": ["read", "write", "profile"],
    "granted_at": "2025-09-30T10:00:00Z"
  }
}
```

---

### 9.1.6 Revoke Access Endpoint

**Endpoint**: `POST /api/auth/revoke-access`  
**Authentication**: API Key (from MyJKKN admin)  
**Purpose**: Revoke child app access from user

**Request Body**:

```json
{
  "parent_user_id": "uuid-from-myjkkn",
  "app_id": "student_portal_v1"
}
```

**Response (200 OK)**:

```json
{
  "success": true,
  "message": "Access revoked successfully",
  "data": {
    "user_id": "uuid",
    "app_id": "student_portal_v1",
    "revoked_at": "2025-09-30T10:00:00Z",
    "sessions_terminated": 3
  }
}
```

---

## 9.2 JWT Token Structure (Same as MyJKKN)

### Access Token

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "student",
  "app_id": "student_portal_v1",
  "scope": "read write profile",
  "institution_id": "institution-uuid",
  "iat": 1696075200,
  "exp": 1696078800,
  "iss": "auth.jkkn.ai",
  "aud": "child-apps"
}
```

### Refresh Token

```json
{
  "sub": "user-uuid",
  "app_id": "student_portal_v1",
  "type": "refresh",
  "iat": 1696075200,
  "exp": 1698667200,
  "iss": "auth.jkkn.ai"
}
```

---

# 10. Implementation Plan

## 10.1 Week-by-Week Breakdown

### Week 1: Infrastructure Setup

**Day 1-2: Supabase Setup**

```bash
✅ Supabase project exists: nhiniwzkarxqyvgglmiy
- [ ] Create database schema (Section 8.1)
- [ ] Set up RLS policies
- [ ] Configure storage buckets (if needed)
- [ ] Set up database backups
```

**Day 3-4: Next.js Application**

```bash
- [ ] Initialize Next.js 15 project
- [ ] Configure TypeScript
- [ ] Set up Supabase client (from MyJKKN template)
- [ ] Configure environment variables
- [ ] Set up ESLint, Prettier
```

**Day 5: Deployment**

```bash
- [ ] Deploy to Vercel (staging)
- [ ] Configure custom domain: auth.jkkn.ai
- [ ] Set up SSL certificate
- [ ] Configure environment variables in Vercel
```

**Deliverables**:

- [ ] Working Next.js app deployed
- [ ] Database schema created
- [ ] Health check endpoint: `GET /api/health`

---

### Week 2: Code Migration

**Day 1-2: Services Migration**

```typescript
// Copy and adapt from MyJKKN

1. Session Service
   From: MyJKKN/lib/services/child-app-auth-optimized-session-manager.ts
   To: auth-server/lib/services/session-service.ts

2. Auth Codes Service
   From: MyJKKN/lib/services/child-app-auth-optimized-codes.ts
   To: auth-server/lib/services/auth-codes-service.ts

3. Analytics Service
   From: MyJKKN/lib/services/child-app-analytics-optimized.ts
   To: auth-server/lib/services/analytics-service.ts
```

**Day 3-4: API Routes Migration**

```typescript
// Copy and adapt routes

1. Authorize Route
   From: MyJKKN/app/api/auth/child-app/authorize/route.ts
   To: auth-server/app/api/auth/authorize/route.ts

2. Token Route
   From: MyJKKN/app/api/auth/child-app/token/route.ts
   To: auth-server/app/api/auth/token/route.ts

3. Validate Route
   From: MyJKKN/app/api/auth/child-app/validate/route.ts
   To: auth-server/app/api/auth/validate/route.ts
```

**Day 5: New Endpoints**

```typescript
- [ ] Create sync-user endpoint
- [ ] Create grant-access endpoint
- [ ] Create revoke-access endpoint
- [ ] Create admin dashboard APIs
```

**Deliverables**:

- [ ] All services migrated and tested
- [ ] All API routes working
- [ ] Unit tests passing (80%+ coverage)

---

### Week 3: Data Migration

**Day 1: Backup Creation**

```sql
-- Backup MyJKKN tables
pg_dump -h MyJKKN_HOST -U postgres \
  -t applications \
  -t child_app_unified_sessions \
  -t child_app_auth_codes_bucket \
  -t child_app_analytics \
  > myjkkn_auth_backup.sql
```

**Day 2-3: Data Migration Script**

```typescript
// scripts/migrate-data.ts

import { createClient } from '@supabase/supabase-js';

const myJKKN = createClient(
  process.env.MYJKKN_URL!,
  process.env.MYJKKN_SERVICE_KEY!
);

const authServer = createClient(
  process.env.AUTH_SERVER_URL!,
  process.env.AUTH_SERVER_SERVICE_KEY!
);

async function migrateApplications() {
  console.log('Migrating applications...');

  const { data: apps, error } = await myJKKN
    .from('applications')
    .select('*')
    .eq('uses_parent_auth', true);

  if (error) throw error;

  const { error: insertError } = await authServer
    .from('applications')
    .insert(apps);

  if (insertError) throw insertError;

  console.log(`✅ Migrated ${apps.length} applications`);
}

async function migrateUsers() {
  console.log('Migrating users...');

  const { data: profiles, error } = await myJKKN
    .from('profiles')
    .select('*');

  if (error) throw error;

  const users = profiles.map(p => ({
    parent_user_id: p.id,
    email: p.email,
    full_name: p.full_name,
    role: p.role,
    institution_id: p.institution_id,
    metadata: {},
    is_active: p.is_active,
    email_verified: true
  }));

  const { error: insertError } = await authServer
    .from('users')
    .insert(users);

  if (insertError) throw insertError;

  console.log(`✅ Migrated ${users.length} users`);
}

async function migrateSessions() {
  console.log('Migrating sessions...');

  const { data: sessions, error } = await myJKKN
    .from('child_app_unified_sessions')
    .select('*');

  if (error) throw error;

  // Map to new schema
  const authSessions = sessions.map(s => ({
    user_id: s.user_id,  // Will need to map to new user ID
    app_sessions: s.app_sessions,
    global_metadata: s.global_metadata,
    total_apps_connected: s.total_apps_connected
  }));

  // TODO: Map user_id from parent_user_id

  const { error: insertError } = await authServer
    .from('auth_sessions')
    .insert(authSessions);

  if (insertError) throw insertError;

  console.log(`✅ Migrated ${authSessions.length} sessions`);
}

async function migrateAnalytics() {
  console.log('Migrating analytics...');

  const { data: analytics, error } = await myJKKN
    .from('child_app_analytics')
    .select('*');

  if (error) throw error;

  const { error: insertError } = await authServer
    .from('analytics')
    .insert(analytics);

  if (insertError) throw insertError;

  console.log(`✅ Migrated ${analytics.length} analytics records`);
}

async function main() {
  try {
    await migrateApplications();
    await migrateUsers();
    await migrateSessions();
    await migrateAnalytics();
    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main();
```

**Day 4-5: Verification**

```bash
- [ ] Verify all data migrated
- [ ] Check data integrity
- [ ] Test API with migrated data
- [ ] Performance testing
```

**Deliverables**:

- [ ] All data migrated
- [ ] Data verification complete
- [ ] Migration script documented

---

### Week 4: Sync Mechanism

**Day 1-2: Webhook Setup in MyJKKN**

```sql
-- MyJKKN Database: Create webhook trigger

CREATE OR REPLACE FUNCTION notify_user_sync()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url TEXT := 'https://auth.jkkn.ai/api/auth/sync-user';
  api_key TEXT := current_setting('app.auth_server_api_key');
BEGIN
  PERFORM net.http_post(
    url := webhook_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-api-key', api_key
    ),
    body := jsonb_build_object(
      'parent_user_id', NEW.id,
      'email', NEW.email,
      'full_name', NEW.full_name,
      'role', NEW.role,
      'institution_id', NEW.institution_id
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER user_sync_trigger
AFTER INSERT OR UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION notify_user_sync();
```

**Day 3: Fallback Sync Job**

```typescript
// auth-server/app/api/cron/sync-users/route.ts

export async function GET(request: NextRequest) {
  // Runs every hour to catch any missed syncs

  const myJKKN = createClient(
    process.env.MYJKKN_URL!,
    process.env.MYJKKN_SERVICE_KEY!
  );

  const authServer = createClient(
    process.env.AUTH_SERVER_URL!,
    process.env.AUTH_SERVER_SERVICE_KEY!
  );

  // Get users updated in last hour from MyJKKN
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

  const { data: profiles } = await myJKKN
    .from('profiles')
    .select('*')
    .gte('updated_at', oneHourAgo);

  // Sync to auth server
  for (const profile of profiles) {
    await authServer
      .from('users')
      .upsert({
        parent_user_id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        role: profile.role,
        institution_id: profile.institution_id,
        last_synced_at: new Date().toISOString()
      }, {
        onConflict: 'parent_user_id'
      });
  }

  return NextResponse.json({
    success: true,
    synced: profiles.length
  });
}
```

**Day 4-5: Testing**

```bash
- [ ] Test webhook sync
- [ ] Test fallback sync
- [ ] Test sync failures and retries
- [ ] Load testing (100 users/second)
```

**Deliverables**:

- [ ] Webhook working
- [ ] Fallback sync working
- [ ] Monitoring dashboard

---

### Week 5: Pilot Testing

**Day 1: Setup Pilot Child App**

```typescript
// Choose 1 low-traffic child app for testing

// Update child app config
const AUTH_URL = process.env.USE_NEW_AUTH
  ? 'https://auth.jkkn.ai'
  : 'https://myjkkn.example.com/api/auth/child-app';

// Enable feature flag
const USE_NEW_AUTH = process.env.USE_NEW_AUTH === 'true';
```

**Day 2-3: Monitor and Test**

```bash
# Metrics to monitor:
- [ ] Success rate: > 99%
- [ ] Response time: < 150ms (p95)
- [ ] Error rate: < 1%
- [ ] User complaints: 0

# Test scenarios:
- [ ] New user login
- [ ] Existing user login
- [ ] Token refresh
- [ ] Permission changes
- [ ] User logout
```

**Day 4-5: Fix Issues**

```bash
- [ ] Address any bugs found
- [ ] Optimize slow queries
- [ ] Update documentation
- [ ] Prepare for gradual rollout
```

**Deliverables**:

- [ ] 1 child app fully working
- [ ] Zero critical issues
- [ ] Performance acceptable

---

### Week 6: Gradual Rollout

**Rollout Schedule**:

```
Monday (10%):    5 child apps
Tuesday (25%):   12 child apps
Wednesday (50%): 25 child apps
Thursday (75%):  37 child apps
Friday (100%):   All 50 child apps
```

**Rollout Script**:

```typescript
// scripts/rollout.ts

const ROLLOUT_PHASES = [
  { percentage: 10, apps: 5 },
  { percentage: 25, apps: 13 },
  { percentage: 50, apps: 25 },
  { percentage: 75, apps: 38 },
  { percentage: 100, apps: 50 }
];

async function rollout(phase: number) {
  const { apps } = ROLLOUT_PHASES[phase];

  // Update child app configs to use new auth server
  for (let i = 0; i < apps; i++) {
    await updateChildAppConfig(i, {
      AUTH_URL: 'https://auth.jkkn.ai',
      USE_NEW_AUTH: true
    });
  }

  // Monitor for 4 hours
  await monitorForHours(4);

  // Check error rate
  const errorRate = await getErrorRate();
  if (errorRate > 1%) {
    // Rollback
    await rollback();
    throw new Error('Error rate too high, rolled back');
  }

  console.log(`✅ Phase ${phase + 1} successful`);
}
```

**Monitoring**:

```bash
# Real-time dashboard showing:
- Active users per app
- Request success rate
- Average response time
- Error logs
- Performance metrics
```

**Rollback Plan**:

```bash
# If issues detected:
1. Revert child app configs
2. Switch back to MyJKKN auth
3. Investigate issues
4. Fix and retry
```

**Deliverables**:

- [ ] All child apps migrated
- [ ] Error rate < 0.5%
- [ ] No user complaints
- [ ] Performance improved

---

### Week 7: Cleanup

**Day 1-2: Remove Auth Code from MyJKKN**

```bash
# Delete files:
rm -rf app/api/auth/child-app/
rm lib/services/*child-app*.ts
rm app/auth/child-app/

# Update database:
DROP TABLE child_app_unified_sessions;
DROP TABLE child_app_auth_codes_bucket;
DROP TABLE child_app_analytics;

# Keep applications table but remove auth columns
ALTER TABLE applications
  DROP COLUMN api_key_hash,
  DROP COLUMN last_auth_activity,
  ADD COLUMN auth_server_app_id VARCHAR REFERENCES auth_server.applications(app_id);
```

**Day 3: Update Documentation**

```bash
- [ ] Update API documentation
- [ ] Update architecture diagrams
- [ ] Create migration guide
- [ ] Update child app integration guide
```

**Day 4-5: Final Testing**

```bash
- [ ] End-to-end testing
- [ ] Load testing (1000 req/sec)
- [ ] Security audit
- [ ] Performance benchmarks
```

**Deliverables**:

- [ ] MyJKKN cleanup complete
- [ ] Documentation updated
- [ ] All tests passing
- [ ] Security audit passed

---

## 10.2 Project Timeline Summary

```
Week 1: Infrastructure Setup       ██████
Week 2: Code Migration             ██████
Week 3: Data Migration             ██████
Week 4: Sync Mechanism             ██████
Week 5: Pilot Testing              ██████
Week 6: Gradual Rollout            ██████
Week 7: Cleanup                    ██████
─────────────────────────────────────────
Total: 7 weeks                      100%
```

---

# 11. Testing Strategy

## 11.1 Test Pyramid

```
              /\
             /E2E\      End-to-End (10%)
            /____\
           /      \
          /Integra-\ Integration (30%)
         /__________\
        /            \
       /  Unit Tests  \ Unit Tests (60%)
      /________________\
```

## 11.2 Unit Tests (60%)

**Services to Test**:

```typescript
// session-service.test.ts
describe('SessionService', () => {
  it('should create user session', async () => {
    const result = await SessionService.createUserSession({
      userId: 'user-123',
      appId: 'app-123',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresIn: 3600
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('session_id');
  });

  it('should validate session', async () => {
    const result = await SessionService.validateSession(
      'user-123',
      'app-123',
      'access-token'
    );

    expect(result.valid).toBe(true);
  });
});

// auth-codes-service.test.ts
describe('AuthCodesService', () => {
  it('should create auth code', async () => {
    const code = await AuthCodesService.createAuthCode({
      userId: 'user-123',
      appId: 'app-123',
      scope: 'read write',
      redirectUri: 'https://example.com/callback'
    });

    expect(code).toMatch(/^[A-Za-z0-9]{32}$/);
  });

  it('should validate auth code', async () => {
    const code = 'valid-code-123';
    const result = await AuthCodesService.validateAuthCode(
      code,
      'app-123'
    );

    expect(result).toHaveProperty('user_id');
    expect(result.scope).toBe('read write');
  });
});
```

## 11.3 Integration Tests (30%)

```typescript
// auth-flow.test.ts
describe('Complete Auth Flow', () => {
  it('should complete authorization code flow', async () => {
    // 1. Request authorization
    const authResponse = await fetch('/api/auth/authorize', {
      method: 'GET',
      headers: {
        'Cookie': `session=${userSession}`
      }
    });

    expect(authResponse.status).toBe(302);
    const location = authResponse.headers.get('Location');
    const code = new URL(location!).searchParams.get('code');

    // 2. Exchange code for tokens
    const tokenResponse = await fetch('/api/auth/token', {
      method: 'POST',
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        app_id: 'test-app',
        api_key: 'test-key'
      })
    });

    expect(tokenResponse.status).toBe(200);
    const { access_token, refresh_token } = await tokenResponse.json();

    // 3. Validate token
    const validateResponse = await fetch('/api/auth/validate', {
      method: 'POST',
      body: JSON.stringify({
        access_token,
        child_app_id: 'test-app'
      })
    });

    expect(validateResponse.status).toBe(200);
    const { valid, user } = await validateResponse.json();

    expect(valid).toBe(true);
    expect(user).toHaveProperty('email');
  });
});
```

## 11.4 End-to-End Tests (10%)

```typescript
// e2e/child-app-login.test.ts
import { test, expect } from '@playwright/test';

test('Child app login flow', async ({ page }) => {
  // 1. Navigate to child app
  await page.goto('https://child-app.example.com');

  // 2. Click login button
  await page.click('button:text("Login with MyJKKN")');

  // 3. Redirected to auth server
  await expect(page).toHaveURL(/auth\.myjkkn\.app/);

  // 4. Enter credentials (if needed)
  // User should already be logged in from MyJKKN

  // 5. Approve permissions
  await page.click('button:text("Approve")');

  // 6. Redirected back to child app
  await expect(page).toHaveURL(/child-app\.example\.com/);

  // 7. Verify logged in
  await expect(page.locator('text=Welcome')).toBeVisible();
});
```

## 11.5 Load Testing

```javascript
// k6-load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 500 },  // Ramp up to 500 users
    { duration: '5m', target: 500 },  // Stay at 500 users
    { duration: '2m', target: 1000 }, // Ramp up to 1000 users
    { duration: '5m', target: 1000 }, // Stay at 1000 users
    { duration: '2m', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<150'], // 95% of requests < 150ms
    http_req_failed: ['rate<0.01'],   // Error rate < 1%
  },
};

export default function () {
  // Test token validation endpoint
  const res = http.post('https://auth.jkkn.ai/api/auth/validate', {
    access_token: __ENV.TEST_TOKEN,
    child_app_id: 'test-app',
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 150ms': (r) => r.timings.duration < 150,
  });

  sleep(1);
}
```

---

# 12. Risk Assessment

## 12.1 Technical Risks

| Risk                        | Likelihood | Impact   | Mitigation                                                                                   |
| --------------------------- | ---------- | -------- | -------------------------------------------------------------------------------------------- |
| **Sync Failures**           | High       | Medium   | - Retry mechanism<br>- Fallback cron job<br>- Manual sync tool<br>- Monitoring alerts        |
| **Data Migration Issues**   | Medium     | High     | - Comprehensive backups<br>- Dry run migrations<br>- Rollback scripts<br>- Data verification |
| **Performance Degradation** | Low        | High     | - Load testing before rollout<br>- Performance monitoring<br>- Auto-scaling configured       |
| **Token Security**          | Low        | Critical | - RS256 algorithm (future)<br>- Short-lived tokens<br>- Token rotation<br>- Security audit   |
| **Child App Compatibility** | Low        | Medium   | - Gradual rollout<br>- Backward compatibility<br>- Extensive testing                         |

## 12.2 Business Risks

| Risk                       | Likelihood | Impact   | Mitigation                                                               |
| -------------------------- | ---------- | -------- | ------------------------------------------------------------------------ |
| **User Experience Issues** | Medium     | High     | - Pilot testing<br>- Gradual rollout<br>- Rollback plan                  |
| **Extended Downtime**      | Low        | Critical | - Blue-green deployment<br>- Zero-downtime migration<br>- Failover ready |
| **Timeline Delays**        | Medium     | Medium   | - Buffer time (1 week)<br>- Clear milestones<br>- Daily standups         |

## 12.3 Mitigation Strategies

### Sync Failure Mitigation

```typescript
// Implement retry with exponential backoff
async function syncWithRetry(user: User, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await syncToAuthServer(user);
      return { success: true };
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(Math.pow(2, i) * 1000); // Exponential backoff
    }
  }
}

// Fallback: Queue for manual review
async function queueFailedSync(user: User, error: Error) {
  await supabase.from('sync_failures').insert({
    user_id: user.id,
    error_message: error.message,
    retry_count: 0,
    status: 'pending'
  });

  // Alert admin
  await sendAlert('Sync failure', `User ${user.email} failed to sync`);
}
```

---

## 12.4 Success Metrics

| Metric             | Current (MyJKKN) | Target (Auth Server) | How to Measure    |
| ------------------ | ---------------- | -------------------- | ----------------- |
| Auth Response Time | ~200ms (p95)     | <150ms (p95)         | APM monitoring    |
| Error Rate         | ~0.5%            | <0.5%                | Error tracking    |
| Uptime             | 99.5%            | 99.9%                | Uptime monitoring |
| Token Validation   | ~100ms           | <50ms                | Performance logs  |
| Database Queries   | 5-10 per auth    | 3-5 per auth         | Query monitoring  |

---

## 12.5 Rollback Plan

```bash
# Emergency Rollback Procedure

1. Immediate Actions (< 5 minutes):
   - Switch DNS back to MyJKKN
   - Revert child app configs
   - Disable auth server

2. Communication (< 10 minutes):
   - Notify team
   - Update status page
   - Alert stakeholders

3. Investigation (< 1 hour):
   - Analyze logs
   - Identify root cause
   - Document findings

4. Fix and Retry (< 1 day):
   - Implement fix
   - Test thoroughly
   - Gradual re-rollout
```

---

## Appendix A: Environment Variables

### MyJKKN (Parent App)

```env
# Auth Server Integration
AUTH_SERVER_URL=https://auth.jkkn.ai
AUTH_SERVER_API_KEY=your-api-key-here
AUTH_SERVER_WEBHOOK_SECRET=your-webhook-secret

# Sync Configuration
ENABLE_AUTH_SYNC=true
SYNC_RETRY_ATTEMPTS=3
SYNC_RETRY_DELAY_MS=1000
```

### Auth Server

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://nhiniwzkarxqyvgglmiy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# JWT
JWT_SECRET=your-jwt-secret-key-min-32-chars
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRY=1h
REFRESH_TOKEN_EXPIRY=30d

# MyJKKN Integration
MYJKKN_URL=https://myjkkn.example.com
MYJKKN_API_KEY=your-myjkkn-api-key
MYJKKN_WEBHOOK_SECRET=your-webhook-secret

# Rate Limiting
UPSTASH_REDIS_URL=your-upstash-url
UPSTASH_REDIS_TOKEN=your-upstash-token

# Monitoring
SENTRY_DSN=your-sentry-dsn
DATADOG_API_KEY=your-datadog-key
```

---

## Appendix B: Migration Checklist

### Pre-Migration

- [ ] Auth Server deployed and tested
- [ ] Database schema created
- [ ] All services migrated
- [ ] All APIs tested
- [ ] Data migration script ready
- [ ] Sync mechanism tested
- [ ] Monitoring dashboards ready
- [ ] Rollback plan documented
- [ ] Team trained

### During Migration

- [ ] Data backup created
- [ ] Data migrated successfully
- [ ] Data integrity verified
- [ ] Sync mechanism active
- [ ] Pilot child app testing (Week 5)
- [ ] Gradual rollout (Week 6)
- [ ] Real-time monitoring
- [ ] Error rate < 1%

### Post-Migration

- [ ] All child apps migrated
- [ ] MyJKKN cleanup complete
- [ ] Performance improved
- [ ] Security audit passed
- [ ] Documentation updated
- [ ] Lessons learned documented

---

**End of Implementation Plan**  
**Total Pages**: 2 documents  
**Total Estimated Time**: 7 weeks  
**Risk Level**: Medium (mitigated)  
**Success Probability**: High (95%+)

**Next Steps**:

1. Review and approve this PRD
2. Allocate team resources
3. Begin Week 1 implementation
4. Daily standups for progress tracking
