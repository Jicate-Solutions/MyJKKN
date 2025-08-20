# Child App Authentication Fix - Google One Tap Issue

## Problem Summary

When users clicked the login button in a child app for the first time, they were redirected to the parent app login page but Google One Tap would automatically sign them in and redirect to the parent app's root page (`/`) instead of continuing with the child app authentication flow.

## Root Cause

The issue was caused by a race condition between:

1. The login page setting child app authentication parameters (from URL) into state and cookies
2. Google One Tap component initializing and automatically signing in the user

Google One Tap uses `signInWithIdToken` which doesn't support custom OAuth state parameters needed for child app authentication flow.

## Solution Implemented

### 1. Login Page Improvements (`app/auth/login/page.tsx`)

- **Immediate State Initialization**: Changed `childAppAuth` state to initialize immediately from URL parameters instead of waiting for `useEffect`
- **Added `getInitialChildAppAuth()` function**: This function checks URL parameters synchronously during component initialization
- This ensures `childAppAuth` is set before Google One Tap can render

### 2. Google One Tap Component Improvements (`components/auth/google-one-tap.tsx`)

- **Added `shouldRender` state**: Controls when Google One Tap should actually initialize
- **Double-check mechanism**: Checks for child app auth parameters both immediately and after a 100ms delay
- **Separated initialization logic**: Split the detection logic and actual Google initialization into separate effects
- **Early exit**: If child app parameters are detected at any point, Google One Tap won't initialize

## How It Works Now

1. User clicks login in child app → Redirected to parent login with parameters
2. Login page immediately detects child app parameters and sets state
3. Google One Tap component detects these parameters and skips initialization
4. User sees normal login page and can sign in manually
5. After sign in, user is redirected to child app consent page as expected

## Key Changes

### Before:

```javascript
// Login page - State initialized as null, set later in useEffect
const [childAppAuth, setChildAppAuth] = useState(null);

// Google One Tap - Would initialize immediately
useEffect(() => {
  // Check and initialize in same effect
}, []);
```

### After:

```javascript
// Login page - State initialized immediately from URL
const [childAppAuth, setChildAppAuth] = useState(getInitialChildAppAuth());

// Google One Tap - Waits and double-checks before initializing
useEffect(() => {
  // Detection only
}, []);

useEffect(() => {
  if (!shouldRender) return;
  // Initialize only after confirming no child app auth
}, [shouldRender]);
```

## Testing the Fix

1. Clear browser cookies and cache
2. Access child app and click login
3. Should see parent login page WITHOUT Google One Tap auto-signin
4. Sign in manually
5. Should be redirected to child app consent page
6. After authorizing, should return to child app

## Future Improvements

Consider implementing:

1. A more explicit flag in URL to disable Google One Tap (e.g., `?disable_one_tap=true`)
2. Server-side detection of child app auth to completely prevent Google One Tap script loading
3. Custom OAuth provider that properly handles state parameters
