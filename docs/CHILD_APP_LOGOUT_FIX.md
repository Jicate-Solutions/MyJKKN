# Child App Logout Fix - Preventing Double Authentication

## The Problem with Your Current Logout Function

Your current implementation:
```javascript
const logout = (redirectToParent: boolean = true) => {
    parentAuthService.logout(redirectToParent);  // ❌ This is the problem
    setUser(null);
    setSession(null);
    setError(null);
};
```

**Issue**: `parentAuthService.logout()` is likely signing out from the parent app entirely, which clears the parent session. This causes the double Google authentication issue when trying to log back in.

## The Correct Implementation

```javascript
const logout = async (redirectToParent: boolean = false) => {
    try {
        // Only clear child app session, NOT parent app session
        const response = await fetch('https://my.jkkn.ac.in/api/auth/child-app/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                app_id: 'child_app_mel9u5y7',
                session_id: session?.id,  // Current session ID if available
                access_token: session?.access_token,  // Current access token
                redirect_uri: redirectToParent ? 'https://my.jkkn.ac.in' : window.location.origin
            })
        });

        // Clear local state
        setUser(null);
        setSession(null);
        setError(null);
        
        // Clear any stored tokens
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        sessionStorage.clear();

        if (redirectToParent && response.ok) {
            const data = await response.json();
            if (data.redirect_uri) {
                window.location.href = data.redirect_uri;
            }
        } else {
            // Redirect to child app login page
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('Logout error:', error);
        // Even if logout fails, clear local state
        setUser(null);
        setSession(null);
        setError(null);
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = '/login';
    }
};
```

## Key Differences

| Aspect | Wrong Approach | Correct Approach |
|--------|---------------|------------------|
| Parent Session | Cleared ❌ | Preserved ✅ |
| Endpoint Called | Parent's main logout | Child-app specific logout |
| Re-login Experience | Requires Google auth | Single click, no Google |
| API Call | `parentAuthService.logout()` | `POST /api/auth/child-app/logout` |

## What the Correct Logout Does

1. **Calls Child App Logout Endpoint**: `/api/auth/child-app/logout`
2. **Preserves Parent Session**: Parent app stays logged in
3. **Clears Child App Data Only**:
   - Database: Child app session marked inactive
   - Local: Clears localStorage and sessionStorage
   - State: Resets React state
4. **Enables Seamless Re-login**: No Google authentication needed

## Quick Fix for Your Code

Replace your current logout function with:

```javascript
const logout = async (redirectToParent: boolean = false) => {
    // Don't call parentAuthService.logout()!
    
    try {
        // Call the child app logout endpoint
        await fetch('https://my.jkkn.ac.in/api/auth/child-app/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                app_id: 'child_app_mel9u5y7',
                session_id: session?.id,
                access_token: session?.access_token
            })
        });
    } catch (error) {
        console.error('Logout error:', error);
    }
    
    // Clear local state
    setUser(null);
    setSession(null);
    setError(null);
    localStorage.clear();
    sessionStorage.clear();
    
    // Redirect to login
    window.location.href = redirectToParent ? 'https://my.jkkn.ac.in' : '/login';
};
```

## Why This Fixes Double Authentication

**Before Fix**:
1. Logout → Parent session cleared
2. Re-login → No parent session → Redirect to Google
3. Google auth → Create parent session
4. Return to consent → Need to verify again

**After Fix**:
1. Logout → Parent session preserved
2. Re-login → Parent session exists → Skip Google
3. Direct to consent → Auto-approve or single click
4. Return to child app → Done!

## Testing After Fix

1. Login to child app
2. Logout from child app
3. Login again - should NOT ask for Google auth
4. Should see consent page immediately (or auto-approve)
5. One click to return to child app

This fix ensures the parent session survives child app logout, enabling seamless re-authentication.