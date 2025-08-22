# Complete Child App Authentication Fix

## The Problem
When child app redirects to parent app for login, after Google OAuth authentication, it redirects to parent app root (`http://localhost:3000/`) instead of back to the child app.

## Root Cause
The child app parameters are getting lost during the Google OAuth flow because the callback isn't properly detecting and handling the child app context.

## Complete Solution

### 1. Update Your Child App Login Flow

In your child app's `parent-auth-service.ts`, make sure the login method uses the correct URL:

```typescript
// Line 86-111 in your parent-auth-service.ts
login(redirectUrl?: string): void {
  const state = this.generateState();
  sessionStorage.setItem('oauth_state', state);

  if (redirectUrl) {
    sessionStorage.setItem('post_login_redirect', redirectUrl);
  }

  // This is CORRECT - use consent page
  const authUrl = new URL(
    '/auth/child-app/consent',
    process.env.NEXT_PUBLIC_PARENT_APP_URL!
  );
  
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('client_id', process.env.NEXT_PUBLIC_APP_ID!);
  authUrl.searchParams.append('app_id', process.env.NEXT_PUBLIC_APP_ID!);
  authUrl.searchParams.append('redirect_uri', process.env.NEXT_PUBLIC_REDIRECT_URI!);
  authUrl.searchParams.append('scope', 'read write profile');
  authUrl.searchParams.append('state', state);

  window.location.href = authUrl.toString();
}
```

### 2. Create Token Exchange Endpoint in Child App

Create `app/api/auth/token/route.ts` in your child app:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, state } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'Missing authorization code' },
        { status: 400 }
      );
    }

    // Exchange code with parent app
    const tokenResponse = await fetch(
      `${process.env.NEXT_PUBLIC_PARENT_APP_URL}/api/auth/child-app/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || ''
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          app_id: process.env.NEXT_PUBLIC_APP_ID,
          redirect_uri: process.env.NEXT_PUBLIC_REDIRECT_URI
        })
      }
    );

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json();
      console.error('Token exchange failed:', error);
      return NextResponse.json(
        { error: error.error || 'Token exchange failed' },
        { status: tokenResponse.status }
      );
    }

    const tokenData = await tokenResponse.json();

    // Return tokens to frontend
    return NextResponse.json({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: tokenData.expires_in || 3600,
      user: tokenData.user
    });
  } catch (error) {
    console.error('Token exchange error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 3. Test the Complete Flow

The correct flow should be:

1. **Child App Login Button** → Redirects to:
   ```
   http://localhost:3000/auth/child-app/consent?app_id=...&redirect_uri=...&state=...
   ```

2. **Consent Page** (if not logged in) → Redirects to:
   ```
   http://localhost:3000/auth/login?child_app_auth=true&app_id=...&return_to=...
   ```

3. **Login Page** → Google OAuth → Callback:
   ```
   http://localhost:3000/auth/callback?code=...
   ```

4. **Callback** → Detects child app auth → Redirects to:
   ```
   http://localhost:3000/auth/child-app/consent?app_id=...
   ```

5. **Consent Page** (now logged in) → Shows consent → User clicks Authorize

6. **Authorize Endpoint** → Generates code → Redirects to:
   ```
   http://localhost:3001/auth/callback?code=...&state=...
   ```

7. **Child App Callback** → Exchanges code for token → Success!

### 4. Debug the Flow

Add these console logs to debug:

#### In Parent App `/auth/callback/route.ts`:
```typescript
console.log('[Auth Callback] Checking for child app auth...');
console.log('[Auth Callback] Cookies:', cookieStore.getAll());
console.log('[Auth Callback] Child app auth found:', childAppAuth);
```

#### In Child App callback page:
```typescript
console.log('[Child App Callback] Received code:', code);
console.log('[Child App Callback] Received state:', state);
```

### 5. Common Issues and Solutions

#### Issue: Redirects to parent app root after login
**Solution**: The `/auth/callback` route now properly checks for child app auth cookie and redirects to consent page.

#### Issue: "Invalid state parameter" error
**Solution**: Make sure the state is properly stored in sessionStorage and matches.

#### Issue: "Redirect URI not allowed" 
**Solution**: Add your redirect URI to the database:
```sql
UPDATE applications 
SET allowed_redirect_uris = ARRAY[
  'http://localhost:3001/auth/callback',
  'https://your-production-url.com/auth/callback'
]
WHERE app_id = 'child_app_mel9u5y7';
```

### 6. Environment Variables

#### For Development:
```bash
NEXT_PUBLIC_PARENT_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_ID=child_app_mel9u5y7
NEXT_PUBLIC_API_KEY=app_0d5ac6f5d907bdeb_e07471d89a650d88
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3001/auth/callback
NEXT_PUBLIC_JWT_SECRET=UqQFhiCyE2kOQIy8np3S2C9XYqDAUbYXmC/2ojVif88=
```

#### For Production:
```bash
NEXT_PUBLIC_PARENT_APP_URL=https://my.jkkn.ac.in
NEXT_PUBLIC_APP_ID=child_app_mel9u5y7
NEXT_PUBLIC_API_KEY=app_0d5ac6f5d907bdeb_e07471d89a650d88
NEXT_PUBLIC_REDIRECT_URI=https://child-app-auth-flow-integration.vercel.app/auth/callback
NEXT_PUBLIC_JWT_SECRET=UqQFhiCyE2kOQIy8np3S2C9XYqDAUbYXmC/2ojVif88=
```

## Summary

The key fixes are:
1. ✅ Parent app `/auth/callback` route properly detects child app auth and redirects to consent page
2. ✅ Authorize endpoint redirects to consent page when not authenticated
3. ✅ Consent page handles the complete flow
4. ❌ **You need to create** the token exchange endpoint in your child app

Once you add the token exchange endpoint to your child app, the authentication flow should work completely.