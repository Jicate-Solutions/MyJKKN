# Child App Authentication Fix

## Issue Description

When a user clicks login in a child app for the first time, they are redirected to the parent app's login page with child app parameters. However, Google One Tap automatically signs them in and redirects to the parent app's root page instead of back to the child app.

## Root Cause

Google One Tap uses ID token authentication (`signInWithIdToken`) which bypasses the normal OAuth flow and doesn't support custom state parameters. This means child app authentication context cannot be passed through Google One Tap.

## Solution Implemented

### 1. Disable Google One Tap for Child App Authentication

Modified `components/auth/google-one-tap.tsx` to:

- Detect child app parameters from URL or cookies
- Skip Google One Tap initialization when child app auth is detected
- Add better logging for debugging

### 2. Preserve Child App Context

The login page (`app/auth/login/page.tsx`) already:

- Detects child app parameters from URL
- Stores them in a cookie for the callback
- Passes them through OAuth state parameter for manual login
- Shows appropriate UI when child app auth is detected

### 3. Remove Duplicate Component Rendering

Removed duplicate Google One Tap component rendering to prevent conflicts.

## How It Works Now

1. **First Login Attempt:**

   - User clicks login in child app
   - Redirected to parent login page with child app parameters
   - Google One Tap is disabled (doesn't initialize)
   - User must click "Continue with Google" button
   - OAuth flow preserves child app context via state parameter
   - After login, user is redirected to child app consent page
   - After consent, user is redirected back to child app

2. **Subsequent Login Attempts:**
   - If user is already authenticated, they go directly to consent page
   - No manual login required

## Key Code Changes

### Google One Tap Component

```typescript
// Skip One Tap if child app auth is present
if (hasChildAppAuth) {
  // Mark as initialized to prevent future attempts
  initialized.current = true;
  return;
}
```

### Login Page

```typescript
// Show different UI for child app auth
{childAppAuth ? 'Sign In Required' : 'Welcome Back'}

// Only show Google One Tap when NOT child app auth
{!isCheckingAuth && !childAppAuth && <GoogleOneTap />}
```

## Testing Instructions

1. Clear all cookies and local storage
2. Navigate to child app and click login
3. Verify Google One Tap doesn't appear on login page
4. Click "Continue with Google"
5. After OAuth login, verify redirect to consent page
6. Click "Authorize" and verify redirect back to child app

## Future Improvements

1. Consider implementing a custom One Tap solution that supports child app parameters
2. Add a loading indicator while checking for child app auth
3. Implement better error handling for edge cases
