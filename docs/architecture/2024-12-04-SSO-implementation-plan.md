# SSO Implementation Plan: MyJKKN Cross-Subdomain Single Sign-On

> **Status**: Planned (Not Implemented)
> **Created**: 2024-12-04
> **Author**: Claude Code Planning Session

## Executive Summary

Implement automatic silent SSO across MyJKKN (parent app) and all internal applications on different subdomains and external domains, allowing users who log into MyJKKN once to seamlessly access all connected internal apps.

## Confirmed Configuration

| Setting | Value |
|---------|-------|
| **Production Domain** | `jkkn.ai` |
| **Cookie Domain** | `.jkkn.ai` (subdomains only) |
| **Internal Apps** | 10+ applications |
| **Database Location** | Same Supabase project (`hhprjbgknupaplivtoib`) |
| **Auth Method** | Hybrid OAuth 2.0 (see below) |

### Two-Tier Domain Support

| Domain Type | Example | SSO Method | User Experience |
|-------------|---------|------------|-----------------|
| **Tier 1: Subdomains** | `app1.jkkn.ai`, `app2.jkkn.ai` | Silent OAuth + Session Hint Cookie | Automatic (no click) |
| **Tier 2: External Domains** | `app.vercel.app`, `myapp.com` | Standard OAuth + Auto-Approve | One-click login |

**Why two tiers?**
- Cookies on `.jkkn.ai` are NOT visible to external domains (browser security)
- External domains cannot detect if user is logged into parent
- External apps must show a "Login with MyJKKN" button

---

## Current State Analysis

### Architecture
- **Parent App (MyJKKN)**: `jkkn.ai` - Supabase project `hhprjbgknupaplivtoib`
- **SSO Tables**: Same Supabase project (hhprjbgknupaplivtoib)
- **Internal Apps**: 10+ apps on subdomains (`app1.jkkn.ai`, `app2.jkkn.ai`, etc.) + external domains
- **Tech Stack**: All Next.js applications

### Existing Implementation
| Component | Status | Notes |
|-----------|--------|-------|
| Google OAuth | ✅ Working | PKCE flow via Supabase |
| User Profiles | ✅ Working | Multi-role, multi-institution |
| Auth Callback | ✅ Working | `app/auth/callback/route.ts` |
| Child App Tables | ❌ Not Created | Schema documented but not deployed |
| Silent Auth | ❌ Not Implemented | Needs to be built |
| Cross-Domain Cookies | ❌ Not Implemented | Needs `.jkkn.ai` domain cookies |

---

## Recommended Solution: Hybrid Silent OAuth 2.0

### Why This Approach
1. **Security**: Uses industry-standard OAuth 2.0 with PKCE
2. **Truly Silent**: Session hint cookie enables auto-detection
3. **Cross-Domain Safe**: Works across subdomains with proper cookie domain
4. **Future-Proof**: Not affected by third-party cookie deprecation (same parent domain)
5. **Backward Compatible**: Enhances existing auth without breaking changes

### Architecture Overview
```
┌──────────────────────────────────────────────────────────────────┐
│                     MyJKKN (Parent App)                          │
│                     Domain: jkkn.ai                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Supabase Auth (Google OAuth)                              │  │
│  │  Session Cookie: .jkkn.ai domain                           │  │
│  │  Session Hint Cookie: jkkn_session_hint (.jkkn.ai)         │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                    │
│  ┌───────────────────────────┼───────────────────────────────┐   │
│  │ /auth/silent              │ /api/auth/sso/token           │   │
│  │ Silent auth endpoint      │ Token exchange                │   │
│  │ /auth/authorize           │                               │   │
│  │ External domain auth      │                               │   │
│  └───────────────────────────┴───────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
    │ app1.jkkn.ai │    │ app2.jkkn.ai │    │ app.vercel  │
    │ (Subdomain)  │    │ (Subdomain)  │    │ (External)  │
    │ Silent Auth  │    │ Silent Auth  │    │ Button Auth │
    └─────────────┘    └─────────────┘    └─────────────┘
```

### Authentication Flow (Subdomain - Tier 1)
```
Child App Loads
       │
       ▼
┌──────────────────┐
│ Check local      │
│ session token    │
└────────┬─────────┘
         │
    Has valid token?
    ┌────┴────┐
   Yes       No
    │         │
    ▼         ▼
 [Done]  ┌──────────────────┐
         │ Check session    │
         │ hint cookie      │
         │ (jkkn_session_   │
         │  hint)           │
         └────────┬─────────┘
                  │
           Cookie exists?
           ┌──────┴──────┐
          Yes           No
           │             │
           ▼             ▼
    ┌──────────────┐  [Show Login
    │ Redirect to  │   Button]
    │ parent/auth/ │
    │ silent       │
    │ (prompt=none)│
    └──────┬───────┘
           │
    User logged in parent?
    ┌──────┴──────┐
   Yes           No
    │             │
    ▼             ▼
┌───────────┐ ┌────────────────┐
│ Auto-issue│ │ Return error=  │
│ auth code │ │ login_required │
│ → redirect│ │ → Show login   │
└─────┬─────┘ └────────────────┘
      │
      ▼
┌──────────────────┐
│ Exchange code    │
│ for tokens       │
│ (Server-side)    │
└────────┬─────────┘
         │
         ▼
   [User Authenticated]
```

### External Domain Flow (Tier 2 - Vercel, Custom Domains)

External domains cannot use silent auth (no cookie sharing). They use a **one-click OAuth flow**:

```
External App (app.vercel.app) Loads
              │
              ▼
┌─────────────────────────────┐
│ No session hint cookie      │
│ (cannot read .jkkn.ai)      │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ Show "Login with MyJKKN"    │
│ button (required for        │
│ external domains)           │
└─────────────┬───────────────┘
              │ User clicks button
              ▼
┌─────────────────────────────┐
│ Redirect to:                │
│ jkkn.ai/auth/authorize      │
│ ?app_id=XXX                 │
│ &redirect_uri=vercel.app/cb │
│ &auto_approve=true          │
└─────────────┬───────────────┘
              │
    User has active session in MyJKKN?
    ┌─────────┴─────────┐
   Yes                 No
    │                   │
    ▼                   ▼
┌───────────────┐  ┌──────────────────┐
│ Auto-issue    │  │ Show Google      │
│ auth code     │  │ OAuth login      │
│ (NO consent   │  │ then auto-approve│
│ screen shown) │  │ after login      │
└──────┬────────┘  └────────┬─────────┘
       │                    │
       └────────┬───────────┘
                ▼
┌─────────────────────────────┐
│ Redirect back to external   │
│ app with auth code          │
│ (e.g., app.vercel.app/cb    │
│  ?code=XXX&state=YYY)       │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ Exchange code for tokens    │
│ (same endpoint as Tier 1)   │
│ POST jkkn.ai/api/auth/sso/  │
│      token                  │
└─────────────────────────────┘
```

**Key Differences from Tier 1:**
| Aspect | Tier 1 (Subdomains) | Tier 2 (External) |
|--------|---------------------|-------------------|
| Session detection | Automatic via cookie | Not possible |
| User interaction | None (silent) | One button click |
| Login button | Hidden if logged in | Always visible |
| UX | Seamless | Near-seamless |

---

## Implementation Plan

### Phase 1: Database Schema (Day 1)

#### 1.1 Create SSO Tables
**File**: `supabase/migrations/YYYYMMDD_sso_tables.sql`

```sql
-- Registered internal applications (supports both subdomains and external domains)
CREATE TABLE IF NOT EXISTS internal_apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id VARCHAR(50) UNIQUE NOT NULL,
    app_name VARCHAR(100) NOT NULL,
    app_url VARCHAR(255) NOT NULL,
    allowed_redirect_uris TEXT[] NOT NULL,
    allowed_roles TEXT[] DEFAULT '{}',

    -- Domain type for SSO behavior
    domain_type VARCHAR(20) NOT NULL DEFAULT 'subdomain', -- 'subdomain' or 'external'
    -- subdomain: Uses silent auth (*.jkkn.ai)
    -- external: Uses button-click auth (vercel.app, custom domains)

    auto_approve_sso BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,

    -- CORS origins for external domains (API calls)
    cors_origins TEXT[] DEFAULT '{}',

    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_domain_type CHECK (domain_type IN ('subdomain', 'external'))
);

-- SSO sessions for tracking
CREATE TABLE IF NOT EXISTS sso_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    app_id VARCHAR(50) NOT NULL REFERENCES internal_apps(app_id),
    access_token_hash VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(255),
    expires_at TIMESTAMPTZ NOT NULL,
    refresh_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_id, app_id)
);

-- Authorization codes (short-lived)
CREATE TABLE IF NOT EXISTS sso_auth_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    app_id VARCHAR(50) NOT NULL,
    redirect_uri TEXT NOT NULL,
    code_challenge VARCHAR(255),
    code_challenge_method VARCHAR(10),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sso_sessions_user ON sso_sessions(user_id);
CREATE INDEX idx_sso_sessions_app ON sso_sessions(app_id);
CREATE INDEX idx_sso_auth_codes_code ON sso_auth_codes(code);
CREATE INDEX idx_sso_auth_codes_expires ON sso_auth_codes(expires_at);

-- Auto-cleanup function for expired codes
CREATE OR REPLACE FUNCTION cleanup_expired_sso_codes()
RETURNS void AS $$
BEGIN
    DELETE FROM sso_auth_codes WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
```

#### 1.2 RLS Policies
```sql
-- Enable RLS
ALTER TABLE internal_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE sso_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sso_auth_codes ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Apps viewable by authenticated users"
ON internal_apps FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "Sessions viewable by owner"
ON sso_sessions FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Service role full access sso_sessions"
ON sso_sessions FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access sso_auth_codes"
ON sso_auth_codes FOR ALL TO service_role USING (true);
```

---

### Phase 2: Parent App - Session Hint Cookie (Day 1)

#### 2.1 Modify Auth Callback
**File**: `D:\Projects\MyJKKN\app\auth\callback\route.ts`

Add session hint cookie after successful login:

```typescript
// After successful session exchange (around line 52)
// Set session hint cookie for SSO
const sessionHintValue = Buffer.from(JSON.stringify({
  uid: user.id.substring(0, 8), // Partial ID for hint
  ts: Date.now(),
  v: 1
})).toString('base64');

cookieStore.set('jkkn_session_hint', sessionHintValue, {
  domain: '.jkkn.ai', // Available to all subdomains
  path: '/',
  httpOnly: false, // Needs JS access for detection
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 // 7 days
});
```

#### 2.2 Modify Logout
**File**: `D:\Projects\MyJKKN\app\logout\page.tsx`

Clear session hint cookie and broadcast logout:

```typescript
// Clear SSO session hint cookie
document.cookie = 'jkkn_session_hint=; domain=.jkkn.ai; path=/; max-age=0';

// Broadcast logout to other tabs/apps
const channel = new BroadcastChannel('jkkn_sso');
channel.postMessage({ type: 'logout', timestamp: Date.now() });
channel.close();
```

---

### Phase 3: Parent App - Auth Endpoints (Day 2)

#### 3.0 Create Authorize Endpoint (For External Domains)
**New File**: `D:\Projects\MyJKKN\app\auth\authorize\route.ts`

This endpoint handles OAuth for **external domains** (Tier 2):

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const appId = searchParams.get('app_id');
  const redirectUri = searchParams.get('redirect_uri');
  const state = searchParams.get('state');
  const codeChallenge = searchParams.get('code_challenge');

  // Validate required params
  if (!appId || !redirectUri || !state) {
    return NextResponse.redirect(new URL(`/auth/login?error=invalid_request`, request.url));
  }

  // Verify app is registered
  const adminClient = createServiceRoleClient();
  const { data: app } = await adminClient
    .from('internal_apps')
    .select('*')
    .eq('app_id', appId)
    .eq('is_active', true)
    .single();

  if (!app || !app.allowed_redirect_uris.includes(redirectUri)) {
    return NextResponse.redirect(new URL(`/auth/login?error=invalid_client`, request.url));
  }

  // Check if user is already logged in
  const cookieStore = await cookies();
  const supabase = createServerClient(/* ... */);
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    // User is logged in - auto-approve and issue code
    const code = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await adminClient.from('sso_auth_codes').insert({
      code,
      user_id: user.id,
      app_id: appId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      expires_at: expiresAt.toISOString()
    });

    // Redirect back to app with code
    const successUrl = new URL(redirectUri);
    successUrl.searchParams.set('code', code);
    successUrl.searchParams.set('state', state);
    return NextResponse.redirect(successUrl);
  }

  // User not logged in - redirect to login with return params
  const loginUrl = new URL('/auth/login', request.url);
  loginUrl.searchParams.set('sso_app_id', appId);
  loginUrl.searchParams.set('sso_redirect_uri', redirectUri);
  loginUrl.searchParams.set('sso_state', state);
  if (codeChallenge) {
    loginUrl.searchParams.set('sso_code_challenge', codeChallenge);
  }

  return NextResponse.redirect(loginUrl);
}
```

#### 3.0.1 Modify Login Page to Handle SSO Return
**File**: `D:\Projects\MyJKKN\app\auth\login\page.tsx`

After successful Google OAuth, check for SSO params and redirect back:

```typescript
// In useEffect after auth check
const ssoAppId = params.get('sso_app_id');
if (ssoAppId && data.user) {
  // User just logged in and came from SSO flow
  // Redirect back to /auth/authorize to complete SSO
  const authorizeUrl = new URL('/auth/authorize', window.location.origin);
  authorizeUrl.searchParams.set('app_id', ssoAppId);
  authorizeUrl.searchParams.set('redirect_uri', params.get('sso_redirect_uri')!);
  authorizeUrl.searchParams.set('state', params.get('sso_state')!);
  const codeChallenge = params.get('sso_code_challenge');
  if (codeChallenge) {
    authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  }
  window.location.href = authorizeUrl.toString();
  return;
}
```

#### 3.1 Create Silent Auth Route (For Subdomains)
**New File**: `D:\Projects\MyJKKN\app\auth\silent\route.ts`

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const appId = searchParams.get('app_id');
  const redirectUri = searchParams.get('redirect_uri');
  const state = searchParams.get('state');
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method') || 'S256';

  // Validate required params
  if (!appId || !redirectUri || !state) {
    return redirectWithError(redirectUri, 'invalid_request', state);
  }

  // Verify app is registered
  const adminClient = createServiceRoleClient();
  const { data: app } = await adminClient
    .from('internal_apps')
    .select('*')
    .eq('app_id', appId)
    .eq('is_active', true)
    .single();

  if (!app) {
    return redirectWithError(redirectUri, 'invalid_client', state);
  }

  // Validate redirect URI
  if (!app.allowed_redirect_uris.includes(redirectUri)) {
    return redirectWithError(redirectUri, 'invalid_redirect_uri', state);
  }

  // Check user session
  const cookieStore = await cookies();
  const supabase = createServerClient(/* ... */);
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return redirectWithError(redirectUri, 'login_required', state);
  }

  // Check user has access (role-based)
  const { data: profile } = await adminClient
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single();

  if (!profile?.is_active) {
    return redirectWithError(redirectUri, 'access_denied', state);
  }

  if (app.allowed_roles.length > 0 && !app.allowed_roles.includes(profile.role)) {
    return redirectWithError(redirectUri, 'access_denied', state);
  }

  // Generate authorization code
  const code = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await adminClient.from('sso_auth_codes').insert({
    code,
    user_id: user.id,
    app_id: appId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    expires_at: expiresAt.toISOString()
  });

  // Redirect with code
  const successUrl = new URL(redirectUri);
  successUrl.searchParams.set('code', code);
  successUrl.searchParams.set('state', state);

  return NextResponse.redirect(successUrl);
}

function redirectWithError(uri: string | null, error: string, state: string | null) {
  const errorUrl = new URL(uri || '/');
  errorUrl.searchParams.set('error', error);
  if (state) errorUrl.searchParams.set('state', state);
  return NextResponse.redirect(errorUrl);
}
```

#### 3.2 Create Token Exchange Endpoint
**New File**: `D:\Projects\MyJKKN\app\api\auth\sso\token\route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { code, code_verifier, redirect_uri, app_id } = body;

  if (!code || !app_id) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const adminClient = createServiceRoleClient();

  // Verify code
  const { data: authCode } = await adminClient
    .from('sso_auth_codes')
    .select('*')
    .eq('code', code)
    .eq('app_id', app_id)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (!authCode) {
    return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
  }

  // Verify PKCE if provided
  if (authCode.code_challenge && code_verifier) {
    const hash = crypto.createHash('sha256').update(code_verifier).digest('base64url');
    if (hash !== authCode.code_challenge) {
      return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
    }
  }

  // Mark code as used
  await adminClient
    .from('sso_auth_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', authCode.id);

  // Get user profile
  const { data: profile } = await adminClient
    .from('profiles')
    .select('*')
    .eq('id', authCode.user_id)
    .single();

  // Generate tokens
  const accessToken = jwt.sign(
    {
      sub: authCode.user_id,
      email: profile.email,
      role: profile.role,
      app_id: app_id,
      type: 'access'
    },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );

  const refreshToken = jwt.sign(
    {
      sub: authCode.user_id,
      app_id: app_id,
      type: 'refresh'
    },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );

  // Store session
  const accessTokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
  const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  await adminClient.from('sso_sessions').upsert({
    user_id: authCode.user_id,
    app_id: app_id,
    access_token_hash: accessTokenHash,
    refresh_token_hash: refreshTokenHash,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    refresh_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  }, { onConflict: 'user_id,app_id' });

  return NextResponse.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: 3600,
    user: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
      avatar_url: profile.avatar_url
    }
  });
}
```

---

### Phase 4: Child App SDK (Day 3)

#### 4.1 SSO Service (Supports Both Domain Types)
**File**: Child apps should create `lib/sso/sso-service.ts`

```typescript
export class SSOService {
  private config = {
    parentUrl: process.env.NEXT_PUBLIC_PARENT_APP_URL!, // e.g., https://jkkn.ai
    appId: process.env.NEXT_PUBLIC_APP_ID!,
    redirectUri: process.env.NEXT_PUBLIC_SSO_REDIRECT_URI!,
    // Domain type determines auth flow
    domainType: process.env.NEXT_PUBLIC_DOMAIN_TYPE as 'subdomain' | 'external' // 'subdomain' or 'external'
  };

  // Check if user might be logged in (session hint cookie)
  // Only works for subdomains (*.jkkn.ai)
  hasSessionHint(): boolean {
    if (typeof document === 'undefined') return false;
    if (this.config.domainType === 'external') return false; // External domains can't read the cookie
    return document.cookie.includes('jkkn_session_hint=');
  }

  // Determine if silent auth is possible
  canTrySilentAuth(): boolean {
    return this.config.domainType === 'subdomain' && this.hasSessionHint();
  }

  // Generate PKCE challenge
  async generatePKCE() {
    const verifier = crypto.randomUUID() + crypto.randomUUID();
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return { verifier, challenge };
  }

  // Try silent authentication (subdomain only)
  async trySilentAuth(): Promise<boolean> {
    if (!this.canTrySilentAuth()) return false;

    const { verifier, challenge } = await this.generatePKCE();
    const state = crypto.randomUUID();

    // Store for callback
    sessionStorage.setItem('sso_state', state);
    sessionStorage.setItem('sso_verifier', verifier);

    // Redirect to silent auth endpoint (for subdomains)
    const silentUrl = new URL(`${this.config.parentUrl}/auth/silent`);
    silentUrl.searchParams.set('app_id', this.config.appId);
    silentUrl.searchParams.set('redirect_uri', this.config.redirectUri);
    silentUrl.searchParams.set('state', state);
    silentUrl.searchParams.set('code_challenge', challenge);
    silentUrl.searchParams.set('code_challenge_method', 'S256');

    window.location.href = silentUrl.toString();
    return true;
  }

  // Initiate login via button click (for external domains or fallback)
  async initiateLogin(): Promise<void> {
    const { verifier, challenge } = await this.generatePKCE();
    const state = crypto.randomUUID();

    // Store for callback
    sessionStorage.setItem('sso_state', state);
    sessionStorage.setItem('sso_verifier', verifier);

    // Redirect to authorize endpoint (works for all domains)
    const authorizeUrl = new URL(`${this.config.parentUrl}/auth/authorize`);
    authorizeUrl.searchParams.set('app_id', this.config.appId);
    authorizeUrl.searchParams.set('redirect_uri', this.config.redirectUri);
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('code_challenge', challenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');

    window.location.href = authorizeUrl.toString();
  }

  // Exchange code for tokens
  async exchangeCode(code: string): Promise<TokenResponse> {
    const verifier = sessionStorage.getItem('sso_verifier');
    sessionStorage.removeItem('sso_verifier');
    sessionStorage.removeItem('sso_state');

    const response = await fetch(`${this.config.parentUrl}/api/auth/sso/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
        app_id: this.config.appId,
        redirect_uri: this.config.redirectUri
      })
    });

    if (!response.ok) throw new Error('Token exchange failed');
    return response.json();
  }
}
```

#### 4.2 Auth Context Enhancement
```typescript
// In auth-context.tsx
useEffect(() => {
  const init = async () => {
    // 1. Check for existing local session
    const existingSession = parentAuthService.getSession();
    if (existingSession) {
      setUser(existingSession.user);
      setLoading(false);
      return;
    }

    // 2. Check for OAuth callback
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (code) {
      try {
        const tokens = await parentAuthService.exchangeCode(code);
        localStorage.setItem('sso_session', JSON.stringify({
          ...tokens,
          expires_at: new Date(Date.now() + tokens.expires_in * 1000)
        }));
        setUser(tokens.user);
        window.history.replaceState({}, '', window.location.pathname);
      } catch (e) {
        console.error('Token exchange failed', e);
      }
      setLoading(false);
      return;
    }

    if (error === 'login_required') {
      // User not logged in, show login button
      setLoading(false);
      return;
    }

    // 3. Try silent auth (subdomain only)
    if (ssoService.canTrySilentAuth()) {
      const attempted = await ssoService.trySilentAuth();
      if (attempted) {
        // Page will redirect, don't set loading false
        return;
      }
    }

    // 4. External domain or no session hint - show login button
    setLoading(false);
  };

  init();
}, []);
```

---

### Phase 5: Logout Synchronization (Day 4)

#### 5.1 Parent App Logout Enhancement
**File**: `D:\Projects\MyJKKN\app\logout\page.tsx`

```typescript
// Add API call to invalidate all SSO sessions
await fetch('/api/auth/sso/logout-all', { method: 'POST' });

// Broadcast logout
const channel = new BroadcastChannel('jkkn_sso');
channel.postMessage({ type: 'logout' });

// Clear hint cookie
document.cookie = 'jkkn_session_hint=; domain=.jkkn.ai; path=/; max-age=0';
```

#### 5.2 Logout All Sessions API
**New File**: `D:\Projects\MyJKKN\app\api\auth\sso\logout-all\route.ts`

```typescript
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createServiceRoleClient();
  await adminClient
    .from('sso_sessions')
    .update({ is_active: false })
    .eq('user_id', user.id);

  return NextResponse.json({ success: true });
}
```

#### 5.3 Child App Logout Listener
```typescript
// In child app's auth provider
useEffect(() => {
  const channel = new BroadcastChannel('jkkn_sso');
  channel.onmessage = (event) => {
    if (event.data.type === 'logout') {
      localStorage.removeItem('sso_session');
      setUser(null);
      window.location.href = '/';
    }
  };
  return () => channel.close();
}, []);
```

---

### Phase 6: App Registration UI (Day 5)

#### 6.1 Admin Interface
**Location**: `D:\Projects\MyJKKN\app\(routes)\system\internal-apps\`

Create admin interface to:
- Register new internal apps
- Manage allowed redirect URIs
- Configure role-based access
- Set domain type (subdomain/external)
- Configure CORS origins for external domains
- View active SSO sessions
- Revoke access

---

## Critical Files Summary

### Parent App (MyJKKN) - Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `app/auth/callback/route.ts` | MODIFY | Add session hint cookie (for subdomains) |
| `app/auth/authorize/route.ts` | CREATE | OAuth authorize endpoint (for external domains) |
| `app/auth/silent/route.ts` | CREATE | Silent auth endpoint (for subdomains) |
| `app/auth/login/page.tsx` | MODIFY | Handle SSO return flow after Google OAuth |
| `app/api/auth/sso/token/route.ts` | CREATE | Token exchange (both domain types) |
| `app/api/auth/sso/logout-all/route.ts` | CREATE | Global logout |
| `app/logout/page.tsx` | MODIFY | Clear cookies, broadcast logout |
| `supabase/migrations/YYYYMMDD_sso_tables.sql` | CREATE | Database schema with domain_type support |

### Child App Template - Files to Create

| File | Purpose |
|------|---------|
| `lib/sso/sso-service.ts` | SSO service class |
| `providers/sso-auth-provider.tsx` | React context provider |
| `app/auth/callback/page.tsx` | Handle SSO callback |
| `middleware.ts` | Protect routes |

---

## Environment Variables

### Parent App
```env
# Existing
NEXT_PUBLIC_SUPABASE_URL=...
JWT_SECRET=...

# New (if production domain different)
NEXT_PUBLIC_APP_DOMAIN=jkkn.ai
```

### Child Apps (Subdomain - e.g., app1.jkkn.ai)
```env
NEXT_PUBLIC_PARENT_APP_URL=https://jkkn.ai
NEXT_PUBLIC_APP_ID=internal_app_xxx
NEXT_PUBLIC_SSO_REDIRECT_URI=https://app1.jkkn.ai/auth/callback
NEXT_PUBLIC_DOMAIN_TYPE=subdomain  # Enables silent auth
```

### Child Apps (External Domain - e.g., Vercel)
```env
NEXT_PUBLIC_PARENT_APP_URL=https://jkkn.ai
NEXT_PUBLIC_APP_ID=internal_app_yyy
NEXT_PUBLIC_SSO_REDIRECT_URI=https://myapp.vercel.app/auth/callback
NEXT_PUBLIC_DOMAIN_TYPE=external  # Requires button click to login
```

---

## Security Considerations

1. **PKCE Required**: All auth flows use PKCE to prevent code interception
2. **Short-Lived Codes**: Authorization codes expire in 5 minutes
3. **Token Hashing**: Only hashes stored in database
4. **Redirect URI Validation**: Strict allow-list per app
5. **Role-Based Access**: Apps can restrict by user role
6. **Session Hint**: Contains no sensitive data (partial ID + timestamp)
7. **Same-Site Cookies**: Lax policy prevents CSRF

---

## Testing Checklist

- [ ] User logs into MyJKKN → session hint cookie set
- [ ] User visits subdomain child app → silent auth succeeds → user logged in
- [ ] User visits external domain app → shows login button → one-click login works
- [ ] User not logged in → visits child app → shows login button
- [ ] User logs out of MyJKKN → all child apps logout
- [ ] Token refresh works when access token expires
- [ ] Invalid redirect URI rejected
- [ ] Unauthorized role denied access to restricted app

---

## Scalability Considerations (10+ Apps)

### 1. App Registry Management
```sql
-- Categories for organizing 10+ apps
CREATE TABLE app_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    description TEXT,
    icon VARCHAR(50)
);

ALTER TABLE internal_apps ADD COLUMN category_id UUID REFERENCES app_categories(id);
```

### 2. Bulk Session Management
- Periodic cleanup of expired sessions (cron job)
- Session count limits per user (e.g., max 20 active sessions)
- Monitoring dashboard for SSO health

### 3. Rate Limiting
```typescript
// Redis-based rate limiting for token endpoint
// Limit: 100 requests per minute per IP
// Burst: 10 requests
```

### 4. Child App SDK Package
Consider creating an **npm package** for child apps:
```bash
npm install @jkkn/sso-client
```

This ensures:
- Consistent implementation across 10+ apps
- Easy updates when SSO flow changes
- Reduced development time for new apps

### 5. Centralized Error Monitoring
- Track failed silent auth attempts
- Alert on unusual patterns
- Dashboard showing SSO success rates per app

---

## Implementation Priority

Given 10+ apps, recommended rollout order:

1. **Phase 1** (Week 1-2): Core SSO infrastructure
   - Database tables
   - Silent auth endpoint
   - Authorize endpoint (for external domains)
   - Token exchange endpoint
   - Session hint cookie

2. **Phase 2** (Week 3): Admin Interface
   - App registration UI
   - Session management
   - Monitoring dashboard

3. **Phase 3** (Week 4): SDK & Documentation
   - Create reusable SDK package
   - Documentation for child app developers
   - Integration guide

4. **Phase 4** (Week 5+): Gradual Rollout
   - Pilot with 2-3 internal apps (mix of subdomain and external)
   - Gather feedback
   - Roll out to remaining apps

---

## Research Sources

- [Supabase SSR Documentation](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [GitHub Discussion: Cross-subdomain Auth](https://github.com/orgs/supabase/discussions/5742)
- [NextAuth.js Subdomain Cookies](https://next-auth.js.org/configuration/options)
- [Auth0 Silent Authentication](https://github.com/auth0/nextjs-auth0/issues/44)
