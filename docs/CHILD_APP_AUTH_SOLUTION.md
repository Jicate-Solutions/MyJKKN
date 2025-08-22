# Child App Authentication Flow Solution

## Problem Analysis

The current implementation has issues with:
1. **Google One Tap auto-login** bypasses child app redirect flow
2. **Existing parent app sessions** don't properly redirect to child apps
3. **Lost child app parameters** during the authentication flow

## Solution: Dedicated Child App Authorization Flow

### 1. New Authorization Pages Created

#### `/auth/child-app/consent` - Consent Page
- Dedicated page for child app authorization
- Preserves all OAuth parameters
- Handles existing sessions properly
- Shows proper consent screen with app details
- Skips consent if user previously authorized

#### `/auth/child-app/authorize` - Authorization Handler
- Processes authorization after user consent
- Generates auth codes
- Handles the OAuth flow

### 2. Updated Login Flow for Child Apps

When a child app redirects to parent app for authentication:

```
Child App → /auth/child-app/consent → Login (if needed) → Consent → Authorize → Back to Child App
```

### 3. Key Features of the Solution

#### A. Preserved Child App Context
- All OAuth parameters are maintained throughout the flow
- Uses `child_app_auth=true` flag to identify child app requests
- Stores parameters in both URL and cookies for redundancy

#### B. Google One Tap Handling
- Automatically disabled when `child_app_auth=true` is detected
- Prevents auto-login from bypassing the child app flow

#### C. Existing Session Handling
- If user is already logged in, shows consent screen
- If previously authorized, auto-approves and redirects
- Maintains user context throughout

### 4. Implementation Changes

#### For Child Apps - Update the OAuth URL:

**Old:**
```javascript
const authUrl = `https://my.jkkn.ac.in/auth/authorize?...`
```

**New:**
```javascript
const authUrl = `https://my.jkkn.ac.in/auth/child-app/consent?...`
```

Or use the original authorize endpoint which will redirect appropriately:
```javascript
const authUrl = `https://my.jkkn.ac.in/api/auth/child-app/authorize?...`
```

### 5. OAuth Flow Parameters

```javascript
const oauthParams = {
  response_type: 'code',        // Required: Always 'code'
  client_id: 'your_app_id',     // Required: Your app ID
  app_id: 'your_app_id',        // Required: Same as client_id
  redirect_uri: 'https://...',  // Required: Your callback URL
  scope: 'read write profile',  // Optional: Permissions needed
  state: 'random_string'        // Required: CSRF protection
};
```

### 6. Benefits of This Solution

1. **Seamless Experience**: Users with existing sessions see consent once
2. **Preserved Context**: Child app parameters never lost
3. **No Google One Tap Interference**: Dedicated flow prevents auto-login issues
4. **Security**: Proper OAuth 2.0 flow with CSRF protection
5. **User Control**: Clear consent screen showing what's being authorized

### 7. Testing the Solution

1. **First-time Authorization**:
   - User not logged in → Login → Consent → Authorize → Redirect to child app
   
2. **Existing Session**:
   - User already logged in → Consent → Authorize → Redirect to child app
   
3. **Previously Authorized**:
   - User already authorized app → Auto-approve → Redirect to child app

### 8. Environment Variables for Child App

```bash
# Production configuration
NEXT_PUBLIC_PARENT_APP_URL=https://my.jkkn.ac.in
NEXT_PUBLIC_APP_ID=your_app_id
NEXT_PUBLIC_REDIRECT_URI=https://your-app.com/auth/callback
```

### 9. Database Requirements

Ensure your app is registered in the parent app's database:

```sql
-- Check/Update allowed redirect URIs
UPDATE applications 
SET allowed_redirect_uris = ARRAY[
  'https://your-production-url.com/auth/callback',
  'http://localhost:3001/auth/callback'  -- For development
]
WHERE app_id = 'your_app_id';
```

### 10. Troubleshooting

**Issue: "Redirect URI not allowed"**
- Solution: Add your redirect URI to the `allowed_redirect_uris` array in the database

**Issue: Google One Tap still appearing**
- Solution: Ensure you're using the new `/auth/child-app/consent` endpoint

**Issue: Lost after login**
- Solution: Check that `child_app_auth=true` parameter is preserved

## Summary

This solution provides a dedicated, robust authentication flow for child apps that:
- Works seamlessly with existing parent app authentication
- Preserves child app context throughout the flow
- Prevents Google One Tap from interfering
- Provides proper user consent management
- Maintains security with OAuth 2.0 standards