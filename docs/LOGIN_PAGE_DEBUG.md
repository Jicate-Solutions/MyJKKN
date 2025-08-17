# Login Page Debugging Guide

## Common Errors and Solutions

### 1. Hydration Errors
**Symptom:** "Hydration failed because the initial UI does not match what was rendered on the server"

**Cause:** Using `window.location` directly in the initial render

**Solution:** Already implemented - we use `useEffect` for client-side operations

### 2. Missing Dependencies Warning
**Symptom:** React Hook useEffect has missing dependencies

**Fixed:** Added `childAppAuth` to dependency array

### 3. Router Push with Full URL
**Symptom:** Navigation not working properly with full URLs

**Fixed:** Changed from `router.push(authUrl.toString())` to `router.push('/api/auth/child-app/authorize?params')`

### 4. Cookie Setting Issues
**Symptom:** Cookie not being set properly for child app auth

**Current Implementation:**
```javascript
document.cookie = `child_app_auth=${JSON.stringify(data)}; path=/; max-age=300; SameSite=Lax`;
```

## Test URLs

### Normal Login
```
https://my.jkkn.ac.in/auth/login
```

### Child App Authentication
```
https://my.jkkn.ac.in/auth/login?app_id=YOUR_APP_ID&redirect_uri=https://yourapp.com/callback&response_type=code&scope=read,write,profile&state=random123
```

## Debugging Steps

1. **Check Browser Console**
   - Look for any JavaScript errors
   - Check network tab for failed requests

2. **Verify URL Parameters**
   - Use the test page at `/test-login` to verify parameters are being read correctly

3. **Check Cookies**
   - Open DevTools > Application > Cookies
   - Look for `child_app_auth` cookie
   - Verify it contains the correct JSON data

4. **Test Authentication Flow**
   ```javascript
   // In browser console on login page
   console.log('Search params:', new URLSearchParams(window.location.search).toString());
   console.log('Cookies:', document.cookie);
   ```

5. **Check Supabase Session**
   ```javascript
   // In browser console
   const { createClientSupabaseClient } = await import('/lib/supabase/client');
   const supabase = createClientSupabaseClient();
   const { data: { session } } = await supabase.auth.getSession();
   console.log('Session:', session);
   ```

## Error Scenarios

### Scenario 1: Child App Not Detected
- **Check:** Are the URL parameters present?
- **Check:** Is the `childAppAuth` state being set?
- **Debug:** Add console.log in the first useEffect

### Scenario 2: Redirect Not Working
- **Check:** Is the user authenticated?
- **Check:** Is the authorize endpoint URL correct?
- **Debug:** Log the redirect URL before calling router.push

### Scenario 3: Cookie Not Persisting
- **Check:** Cookie domain and path settings
- **Check:** SameSite policy
- **Solution:** May need to use httpOnly cookies via API route

## Quick Fixes to Try

1. **Clear Browser Cache**
   ```
   localStorage.clear();
   sessionStorage.clear();
   // Clear cookies for the domain
   ```

2. **Test in Incognito Mode**
   - Eliminates extension conflicts
   - Fresh cookie state

3. **Check Network Tab**
   - Look for the authorize endpoint call
   - Verify it's returning proper response

4. **Verify Application Registration**
   ```sql
   -- Run in Supabase SQL Editor
   SELECT app_id, uses_parent_auth, is_active, allowed_redirect_uris 
   FROM applications 
   WHERE app_id = 'YOUR_APP_ID';
   ```

## If Still Having Issues

1. Use the test page at `/test-login` to isolate the problem
2. Check the browser's network tab for any 404s or 500s
3. Verify the JWT_SECRET is set in the environment
4. Ensure the database migration for `child_app_auth_codes` was run successfully

## Recent Fixes Applied

1. ✅ Fixed async/await for createServerSupabaseClient
2. ✅ Fixed redirect path from `/login` to `/auth/login`
3. ✅ Installed missing `jose` dependency
4. ✅ Updated dependency arrays in useEffect
5. ✅ Fixed router.push with query parameters
6. ✅ Added proper error handling with toast notifications
7. ✅ Removed unnecessary console.log statements