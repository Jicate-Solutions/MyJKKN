# Child App OAuth Setup Guide

## 🔧 Configuration Requirements

### 1. Supabase Dashboard Settings

In your Supabase project dashboard:

1. Go to **Authentication** → **URL Configuration**
2. Add these to **Redirect URLs**:
   ```
   https://my.jkkn.ac.in/auth/callback
   http://localhost:3001/auth/callback
   ```

### 2. Google Cloud Console OAuth Setup

In Google Cloud Console for your OAuth app:

1. Go to **Credentials** → Your OAuth 2.0 Client ID
2. Add to **Authorized redirect URIs**:
   ```
   https://YOUR_SUPABASE_PROJECT.supabase.co/auth/v1/callback
   ```
   (This is your Supabase project's callback URL)

### 3. No Need for Child App URLs in Google/Supabase

**Important**: You do NOT need to add child app URLs (like `https://jkkn-auth-flow.lovable.app`) to Google OAuth or Supabase redirect URLs. The parent app (MyJKKN) handles all OAuth redirects and then redirects to child apps with authorization codes.

## 🔄 Complete Authentication Flow

### Step 1: Child App Initiates Login
```
https://my.jkkn.ac.in/auth/login?app_id=testing_meglmppk&redirect_uri=https://jkkn-auth-flow.lovable.app/auth/callback&scope=read,write,profile
```

### Step 2: User Clicks Google Login
- Parameters are saved in a cookie (`child_app_auth`)
- User redirected to Google OAuth

### Step 3: Google OAuth Callback
- Returns to: `https://my.jkkn.ac.in/auth/callback?code=GOOGLE_AUTH_CODE`
- Callback route:
  1. Exchanges Google code for Supabase session
  2. Checks for `child_app_auth` cookie
  3. If exists, redirects to consent page

### Step 4: Consent Page
- URL: `https://my.jkkn.ac.in/auth/child-app/login?app_id=xxx&redirect_uri=xxx`
- User sees app permissions
- Clicks "Authorize"

### Step 5: Authorization Code Generated
- POST to `/api/auth/child-app/authorize`
- Generates authorization code
- Stores in `child_app_auth_codes` table

### Step 6: Redirect to Child App
- Redirects to: `https://jkkn-auth-flow.lovable.app/auth/callback?code=AUTH_CODE&state=xxx`
- Child app exchanges code for tokens

## 📝 Testing Checklist

### ✅ Prerequisites
- [ ] User account exists in MyJKKN
- [ ] Profile is completed
- [ ] Child app registered in `applications` table
- [ ] `uses_parent_auth` = true
- [ ] `allowed_redirect_uris` includes child app callback

### ✅ Test Flow
1. Open child app login URL
2. Should redirect to MyJKKN login
3. Sign in with Google
4. Should see consent page (not dashboard!)
5. Click Authorize
6. Should redirect back to child app with code

## 🐛 Common Issues & Solutions

### Issue: Redirects to Dashboard Instead of Child App

**Cause**: Child app parameters not preserved through OAuth flow

**Solution**: The fixes applied ensure:
1. Login page stores child app params in cookie
2. Callback route checks cookie and redirects to consent page
3. Consent page generates auth code and redirects to child app

### Issue: "Invalid redirect URI"

**Solution**: Update the applications table:
```sql
UPDATE applications 
SET allowed_redirect_uris = array_append(
  allowed_redirect_uris, 
  'YOUR_CHILD_APP_CALLBACK_URL'
)
WHERE app_id = 'testing_meglmppk';
```

### Issue: Cookie Not Set

**Solution**: Check browser settings:
- Cookies must be enabled
- SameSite policy allows cookies
- Check browser console for cookie warnings

## 🔐 Security Notes

1. **JWT_SECRET**: Must be set in environment variables
2. **API Keys**: Store hashed versions in database
3. **Redirect URIs**: Always validate against allowlist
4. **Authorization Codes**: Expire in 5 minutes
5. **Tokens**: Access tokens expire in 1 hour

## 📊 Monitoring

Check the flow status:

```sql
-- Recent authorization attempts
SELECT * FROM child_app_auth_codes 
WHERE app_id = 'testing_meglmppk' 
ORDER BY created_at DESC 
LIMIT 10;

-- Active sessions
SELECT * FROM child_app_sessions 
WHERE child_app_id = 'testing_meglmppk' 
AND is_active = true;

-- Access logs
SELECT * FROM child_app_access_logs 
WHERE child_app_id = 'testing_meglmppk' 
ORDER BY created_at DESC 
LIMIT 20;
```

## 🚀 Quick Test

With the server running on `http://localhost:3001`, test the flow:

```bash
# Open in browser
http://localhost:3001/auth/login?app_id=testing_meglmppk&redirect_uri=https://jkkn-auth-flow.lovable.app/auth/callback&scope=read,write,profile
```

This should:
1. Show Google login if not authenticated
2. After login, show consent page
3. After consent, redirect to child app with authorization code