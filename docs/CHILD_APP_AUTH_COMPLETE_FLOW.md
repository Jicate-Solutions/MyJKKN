# Complete Child App Authentication Flow - Implementation Guide

## Fixed Issues
1. ✅ Redirect to parent app root page after login - **FIXED**
2. ✅ CORS errors when authorizing - **FIXED**
3. ✅ Google One Tap interference - **FIXED**
4. ✅ Lost child app context during authentication - **FIXED**
5. ✅ Double Google authentication after logout - **FIXED**

## The Complete Flow

### 1. Child App Initiates Authentication

Child app redirects user to parent app consent page:
```javascript
// In child app
const authUrl = 'https://my.jkkn.ac.in/auth/child-app/consent';
const params = new URLSearchParams({
  response_type: 'code',
  client_id: 'child_app_mel9u5y7',
  app_id: 'child_app_mel9u5y7',
  redirect_uri: 'https://your-app.com/auth/callback',
  scope: 'read write profile',
  state: 'random_state_string'
});
window.location.href = `${authUrl}?${params}`;
```

### 2. Parent App Consent Page (`/auth/child-app/consent`)

The consent page checks if user is authenticated:

**If NOT authenticated:**
- Redirects to login page with `child_app_auth=true` flag
- Preserves all OAuth parameters
- Sets `return_to` parameter to come back to consent page

**If authenticated:**
- Shows consent screen with app details
- If previously authorized, auto-approves

### 3. Login Page (`/auth/login`)

When user is redirected to login:
- Detects `child_app_auth=true` flag
- Stores child app parameters in cookie
- Disables Google One Tap
- After successful login, redirects based on parameters

### 4. OAuth Callback (`/auth/callback`)

After Google OAuth login:
- Exchanges code for session
- Checks for child app auth cookie
- **Key Fix:** Redirects to `/auth/child-app/consent` instead of parent app root

### 5. Back to Consent Page

After successful login:
- User is now authenticated
- Shows consent screen
- User clicks "Authorize"

### 6. Authorization Endpoint (`/api/auth/child-app/authorize`)

- Generates authorization code
- Stores in database
- Redirects to child app callback with code

### 7. Child App Receives Code

Child app callback receives:
```
https://your-app.com/auth/callback?code=AUTH_CODE&state=STATE
```

## Key Files and Their Roles

| File | Purpose | Key Fix |
|------|---------|---------|
| `/app/auth/child-app/consent/page.tsx` | Shows consent screen | Uses direct navigation instead of fetch |
| `/app/auth/login/page.tsx` | Login page | Handles `return_to` parameter properly |
| `/app/auth/callback/route.ts` | OAuth callback | Redirects to consent page for child apps |
| `/api/auth/child-app/authorize/route.ts` | Generates auth code | Returns redirect response |

## Environment Variables

### Parent App (MyJKKN)
```env
# No special config needed for child app support
```

### Child App
```env
NEXT_PUBLIC_PARENT_APP_URL=https://my.jkkn.ac.in
NEXT_PUBLIC_APP_ID=child_app_mel9u5y7
NEXT_PUBLIC_REDIRECT_URI=https://your-app.com/auth/callback
```

## Database Configuration

Ensure your app is registered in parent app's database:
```sql
-- Check your app registration
SELECT * FROM applications WHERE app_id = 'child_app_mel9u5y7';

-- Update allowed redirect URIs
UPDATE applications 
SET allowed_redirect_uris = ARRAY[
  'https://your-production-url.com/auth/callback',
  'http://localhost:3001/auth/callback'
]
WHERE app_id = 'child_app_mel9u5y7';
```

## Testing Checklist

- [ ] Child app redirects to `/auth/child-app/consent`
- [ ] If not logged in, redirects to login page
- [ ] Login page shows "Continue to [App Name]"
- [ ] After login, returns to consent page (NOT parent app root)
- [ ] Consent page shows app details
- [ ] Authorize button redirects back to child app
- [ ] Child app receives authorization code
- [ ] Token exchange works correctly

## Common Issues and Solutions

### Issue: Redirects to parent app root after login
**Solution:** The `/auth/callback` route now checks for child app auth cookie and redirects to consent page

### Issue: CORS errors
**Solution:** Use direct navigation (`window.location.href`) instead of `fetch()`

### Issue: Google One Tap auto-login
**Solution:** Login page detects `child_app_auth=true` and disables One Tap

### Issue: "Redirect URI not allowed"
**Solution:** Add your redirect URI to the database `allowed_redirect_uris` array

## Flow Diagram

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│  Child App  │────▶│ Consent Page │────▶│ Login Page  │────▶│ Google OAuth │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────────┘
                            │                                          │
                            │ (if authenticated)                       │
                            ▼                                          ▼
                    ┌──────────────┐                         ┌──────────────┐
                    │ Show Consent │                         │   Callback   │
                    └──────────────┘                         └──────────────┘
                            │                                          │
                            ▼                                          ▼
                    ┌──────────────┐                         ┌──────────────┐
                    │  Authorize   │◀─────────────────────────│ Consent Page │
                    └──────────────┘                         └──────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │  Child App   │
                    │   Callback   │
                    └──────────────┘
```

## Logout Flow (Important Update)

### The Problem
After logout from child app, users were required to authenticate with Google twice. This happened because:
1. Logout was signing out from parent app entirely
2. Parent session was cleared
3. Re-login required full Google authentication again

### The Solution
The logout endpoint (`/api/auth/child-app/logout`) now:
```typescript
// DO NOT sign out from parent app - only clear child app session
// This allows seamless re-authentication without Google login
```

**Key Changes:**
1. Parent session remains active after child app logout
2. Only child app session data is cleared
3. Re-authentication is now seamless (single click, no Google prompt)

### Auto-Consent Feature
The consent page now checks for recent authorizations:
- If user authorized the app within last 30 days, auto-approves
- Provides seamless experience for returning users
- No consent screen shown for trusted apps

```typescript
// Check for recent authorization (auto-consent)
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const { data: recentSessions } = await supabase
  .from('child_app_user_sessions')
  .select('id, last_activity_at')
  .eq('user_id', currentUser.id)
  .eq('app_id', appId)
  .gte('last_activity_at', thirtyDaysAgo.toISOString())
  .limit(1);

if (recentSessions && recentSessions.length > 0) {
  // Skip consent, auto-authorize
  handleAuthorize(true);
}
```

## State Parameter and Cookie Management

### State Parameter Encoding
To preserve child app context through Google OAuth:

```typescript
// Login page: Create state with child app data
const stateData = {
  childAppAuth: childAppData,
  returnTo: returnUrl,
  isChildAppAuth: true
};

// Base64 encode without padding (Google strips '=' characters)
const stateString = btoa(JSON.stringify(stateData)).replace(/=/g, '');
```

### Cookie Encoding (URL Encoding for Safety)
```typescript
// Store child app data in cookie with URL encoding
const encodedData = encodeURIComponent(JSON.stringify(childAppAuthData));
const cookieString = `child_app_auth=${encodedData}; path=/; max-age=600; SameSite=Lax${isSecure ? '; Secure' : ''}`;
```

### Callback Route: Multiple Fallback Methods
```typescript
// 1. Try state parameter first (most reliable)
if (state) {
  const paddedState = state + '='.repeat((4 - state.length % 4) % 4);
  const stateData = JSON.parse(atob(paddedState));
}

// 2. Fallback to cookie if state fails
const childAppAuthCookie = cookieStore.get('child_app_auth');
if (childAppAuthCookie) {
  const decodedValue = decodeURIComponent(childAppAuthCookie.value);
  childAppAuth = JSON.parse(decodedValue);
}

// 3. Check return_to cookie for simple redirects
const returnCookie = cookieStore.get('child_app_return');
```

## Middleware Configuration

Add child app paths to PUBLIC_PATHS in `middleware.ts`:
```typescript
const PUBLIC_PATHS = [
  '/auth/login',
  '/auth/callback',
  '/auth/complete-profile',
  '/auth/child-app/consent',  // Child app consent page
  '/auth/child-app/authorize', // Child app authorize endpoint
  '/unauthorized',
  '/students/onboarding'
];
```

## CORS Configuration

For API routes, middleware handles CORS:
```typescript
if (request.nextUrl.pathname.startsWith('/api/auth/child-app/')) {
  const origin = request.headers.get('origin');
  
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
}
```

## Summary

The authentication flow now properly handles child app authentication by:
1. Using a dedicated consent page with auto-approval for recent authorizations
2. Preserving child app context through the entire OAuth flow
3. Properly redirecting after login to consent page (not parent app root)
4. Using direct navigation to avoid CORS issues
5. Disabling Google One Tap for child app flows
6. **Keeping parent session active after child app logout for seamless re-authentication**
7. **Using multiple fallback methods for state preservation (state parameter + cookies)**
8. **Proper URL encoding for cookie values to handle special characters**