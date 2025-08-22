# Complete Child App Authentication Flow

## Fixed Issues
1. ✅ Redirect to parent app root page after login - **FIXED**
2. ✅ CORS errors when authorizing - **FIXED**
3. ✅ Google One Tap interference - **FIXED**
4. ✅ Lost child app context during authentication - **FIXED**

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

## Summary

The authentication flow now properly handles child app authentication by:
1. Using a dedicated consent page
2. Preserving child app context through the entire flow
3. Properly redirecting after login to consent page (not parent app root)
4. Using direct navigation to avoid CORS issues
5. Disabling Google One Tap for child app flows