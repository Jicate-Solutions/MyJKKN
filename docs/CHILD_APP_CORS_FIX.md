# Child App CORS Issue Fix

## Problem
The consent page was using `fetch()` to call the authorize endpoint, which caused CORS errors when the endpoint redirected to the child app's callback URL.

## Solution
Changed from using `fetch()` to direct navigation (`window.location.href`).

## Changes Made

### 1. `/app/auth/child-app/consent/page.tsx`
```javascript
// OLD - Causes CORS error
const response = await fetch(authUrl.toString(), {
  method: 'GET',
  credentials: 'include'
});

// NEW - Direct navigation (no CORS issues)
window.location.href = authUrl.toString();
```

### 2. `/app/auth/child-app/authorize/page.tsx`
```javascript
// OLD - Causes CORS error
const response = await fetch(`/api/auth/child-app/authorize?${searchParams}`, {
  method: 'GET',
  credentials: 'include'
});

// NEW - Direct navigation
window.location.href = authUrl.toString();
```

## How the Flow Works Now

1. **Child App** initiates OAuth flow:
   ```javascript
   window.location.href = 'https://my.jkkn.ac.in/auth/child-app/consent?...'
   ```

2. **Consent Page** shows authorization prompt and on approve:
   ```javascript
   window.location.href = '/api/auth/child-app/authorize?...'
   ```

3. **Authorize Endpoint** generates code and redirects:
   ```javascript
   return NextResponse.redirect(callbackUrl); // Redirects to child app
   ```

4. **Child App** receives the authorization code at callback URL

## Why This Works

- **No CORS Issues**: Direct navigation doesn't trigger CORS checks
- **Proper Redirects**: Server-side redirects work seamlessly
- **Session Preserved**: Cookies and session are maintained through navigation
- **OAuth Compliant**: Follows standard OAuth 2.0 authorization code flow

## Testing

1. Clear browser cache and cookies
2. Navigate to child app
3. Click login/authorize
4. Should redirect to parent app consent page
5. Click authorize
6. Should redirect back to child app with authorization code

## Important Notes

- Never use `fetch()` for OAuth authorization endpoints that redirect
- Always use direct navigation (`window.location.href`) for OAuth flows
- Server-side redirects (`NextResponse.redirect()`) work perfectly with direct navigation