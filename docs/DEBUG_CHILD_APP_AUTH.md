# Debugging Child App Authentication

## How to Enable Debugging

### Method 1: URL Parameter

Add `?debug_auth` to any URL in the parent app:

```
https://my.jkkn.ac.in/auth/login?debug_auth&app_id=your_app&redirect_uri=...
```

### Method 2: Browser Console

Open browser console and run:

```javascript
localStorage.setItem('DEBUG_CHILD_APP_AUTH', 'true');
location.reload();
```

### Method 3: From Child App

When initiating login from your child app, add the debug parameter:

```javascript
const loginUrl = `https://my.jkkn.ac.in/auth/login?debug_auth&app_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
```

## Debug Panel

When debugging is enabled, you'll see a debug panel in the bottom-right corner showing:

- All authentication events
- URL parameters
- Cookie states
- Redirect flows

## Export Debug Logs

Click "Export Logs" in the debug panel or run in console:

```javascript
childAppDebug.exportLogs()
```

## Alternative Authentication Flow

If the standard flow isn't working, use the alternative flow from your child app:

### Step 1: Install Dependencies

```bash
npm install axios js-cookie
```

### Step 2: Initialize Authentication

```javascript
import { AlternativeAuthFlow } from '@/lib/auth/child-app/alternative-auth-flow';

// In your login handler
const handleLogin = () => {
  const loginUrl = AlternativeAuthFlow.initiateFlow({
    app_id: 'your_app_id',
    redirect_uri: 'https://your-app.com/auth/callback',
    scope: 'read,write,profile',
    state: 'optional-state-param',
    parent_app_url: 'https://my.jkkn.ac.in'
  });

  // This URL will have better state handling
  window.location.href = loginUrl;
};
```

### Step 3: Handle Callback in Child App

```javascript
// In your callback handler
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
const state = urlParams.get('state');

if (code) {
  // Exchange code for token with parent app
  const response = await fetch('https://my.jkkn.ac.in/api/auth/child-app/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'your_api_key'
    },
    body: JSON.stringify({
      code,
      app_id: 'your_app_id',
      redirect_uri: 'https://your-app.com/auth/callback'
    })
  });

  const data = await response.json();
  // Store tokens and user data
}
```

## Common Issues and Solutions

### 1. Google One Tap Interference

**Symptom**: First login redirects to parent app root instead of child app

**Debug Check**:

```javascript
// Check if One Tap is being disabled
console.log(document.querySelector('[data-google-one-tap]'));
// Should be null when child app params are present
```

**Solution**: The fix should now prevent One Tap from loading when child app parameters are detected.

### 2. Lost Child App Parameters

**Symptom**: Parameters missing after OAuth redirect

**Debug Check**:

- Check the OAuth redirect URL in Network tab
- Look for `state` parameter in the callback URL

**Solution**: Use the alternative flow which encodes parameters more reliably.

### 3. Cookie Issues

**Symptom**: Cookie not being set or read

**Debug Check**:

```javascript
// Check all cookies
console.log(document.cookie);

// Check specific cookie
console.log(document.cookie.split('; ').find(c => c.startsWith('child_app_auth=')));
```

**Solution**:

- Ensure HTTPS is used (cookies have Secure flag)
- Check SameSite policy
- Use alternative flow which doesn't rely on cookies

### 4. Profile Completion Redirect

**Symptom**: Users redirected to complete profile instead of child app

**Solution**: The callback now preserves child app state through profile completion.

## Testing Checklist

1. **Clear all data before testing**:

   ```javascript
   // Run in console
   localStorage.clear();
   sessionStorage.clear();
   document.cookie.split(";").forEach(c => {
     document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
   });
   ```

2. **Test with debug enabled**:

   - Start from child app
   - Click login
   - Check debug panel shows child app parameters
   - Complete Google sign in
   - Verify redirect to consent page
   - Authorize and return to child app

3. **Check each step**:
   - Child app → Parent login (parameters preserved?)
   - Parent login → Google OAuth (state parameter included?)
   - OAuth callback → Consent page (child app detected?)
   - Consent → Child app callback (code included?)

## Log Analysis

When analyzing logs, look for:

1. **Successful flow**:

   ```
   login-page - Initialize auth - hasChildAppAuth: true
   login-page - Google login initiated - hasAlternativeAuth: true
   oauth-flow - OAuth initiated - redirectTo includes state
   callback - Child app auth detected
   consent-page - Loaded with correct app_id
   ```

2. **Failed flow indicators**:
   ```
   One Tap - Initializing (should not appear with child app)
   callback - No child app auth found
   redirect to / instead of /auth/child-app/login
   ```

## Support

If issues persist after following this guide:

1. Export full debug logs
2. Check browser console for errors
3. Test with alternative flow
4. Verify child app is registered in database with correct redirect URIs
