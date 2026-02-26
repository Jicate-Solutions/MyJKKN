# Google OAuth Setup Guide for MyJKKN IMS

## Current Status

✅ **Supabase Project**: `zwiasdpodeirxnybwvuw`
✅ **Environment Variables**: Correctly configured in `.env.local`
✅ **Auth Code**: Properly implemented
❌ **Google OAuth Provider**: Not enabled in Supabase (needs configuration)

## Error Being Fixed

```json
{
  "code": 400,
  "error_code": "validation_failed",
  "msg": "Unsupported provider: provider is not enabled"
}
```

---

## Implementation Steps

### Step 1: Google Cloud Console Setup

1. **Navigate to**: https://console.cloud.google.com/

2. **Create/Select Project**:
   - Project name: `MyJKKN IMS` (or your choice)
   - Note the Project ID for reference

3. **Enable APIs**:
   - Go to: **APIs & Services** → **Library**
   - Search for and enable: **Google+ API** (if not already enabled)

4. **Configure OAuth Consent Screen** (if not done):
   - Go to: **APIs & Services** → **OAuth consent screen**
   - User Type: **External** (or Internal if G Workspace)
   - App name: **MyJKKN IMS**
   - User support email: Your email
   - Developer contact: Your email
   - Scopes: Add `email` and `profile`
   - Save and continue

5. **Create OAuth 2.0 Credentials**:
   - Go to: **APIs & Services** → **Credentials**
   - Click **+ CREATE CREDENTIALS** → **OAuth client ID**
   - Application type: **Web application**
   - Name: **MyJKKN IMS - Web Client**

6. **Configure Authorized Origins**:
   ```
   http://localhost:3000
   https://zwiasdpodeirxnybwvuw.supabase.co
   ```

7. **Configure Redirect URIs**:
   ```
   http://localhost:3000/auth/callback
   https://zwiasdpodeirxnybwvuw.supabase.co/auth/v1/callback
   ```

8. **Save and Copy Credentials**:
   - ✅ Copy **Client ID** (starts with `xxx.apps.googleusercontent.com`)
   - ✅ Copy **Client Secret**
   - Store these securely - you'll need them in the next steps

---

### Step 2: Supabase Dashboard Configuration

1. **Navigate to Supabase Dashboard**:
   ```
   https://supabase.com/dashboard/project/zwiasdpodeirxnybwvuw/auth/providers
   ```

2. **Enable Google Provider**:
   - Scroll to find **Google** in the providers list
   - Click to expand/configure

3. **Configure Google OAuth**:
   - ✅ Toggle **"Enable Sign in with Google"** → **ON**
   - **Client ID (for OAuth)**: Paste your Google Client ID
   - **Client Secret (for OAuth)**: Paste your Google Client Secret
   - **Authorized Client IDs** (for One Tap): Paste the same Client ID
   - **Skip nonce check**: Leave unchecked (default)
   - Click **Save**

4. **Verify Provider Status**:
   - Google provider should show **Enabled** ✓ status

5. **Configure URL Configuration**:
   - Navigate to: **Authentication** → **URL Configuration**
   - **Site URL**: `http://localhost:3000`
   - **Redirect URLs** - Add these to the allow list:
     ```
     http://localhost:3000/**
     http://localhost:3000/auth/callback
     ```
   - Click **Save**

---

### Step 3: Update .env.local

Add these lines to your `.env.local` file:

```bash
# Google OAuth Configuration
NEXT_PUBLIC_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID_HERE
```

**Replace** `YOUR_GOOGLE_CLIENT_ID_HERE` with your actual Google Client ID from Step 1.

---

### Step 4: Clear Build Cache & Restart

```bash
# Navigate to project directory
cd /c/Users/Admin/Documents/GitHub/MyJKKN/IMS

# Clear Next.js cache
rm -rf .next

# Clear node modules cache (optional but recommended)
npm cache clean --force

# Restart dev server
npm run dev
```

---

### Step 5: Test Authentication

1. **Open Browser** (preferably Incognito/Private mode):
   ```
   http://localhost:3000/auth/login
   ```

2. **Click** "Continue with Google" button

3. **Expected Flow**:
   ```
   Login Page
   → Google OAuth Consent Screen
   → Select Google Account
   → Grant Permissions
   → Redirect to /auth/callback
   → Profile Creation/Loading
   → Dashboard (based on role)
   ```

4. **Success Indicators**:
   - ✅ No "Unsupported provider" error
   - ✅ Google consent screen appears
   - ✅ Successfully authenticated
   - ✅ Redirected to dashboard
   - ✅ User profile created in database

---

## Verification Queries

Run these in Supabase SQL Editor to verify:

```sql
-- Check if your profile was created
SELECT
  id,
  email,
  role,
  profile_completed,
  created_at
FROM profiles
WHERE email = 'your-test-email@gmail.com';

-- Check auth users table
SELECT
  id,
  email,
  provider,
  created_at,
  last_sign_in_at
FROM auth.users
WHERE email = 'your-test-email@gmail.com';
```

---

## Troubleshooting

### Issue: "Redirect URI mismatch"

**Solution**: Ensure these exact URLs are in Google Cloud Console:
- `http://localhost:3000/auth/callback`
- `https://zwiasdpodeirxnybwvuw.supabase.co/auth/v1/callback`

### Issue: "Access blocked: This app hasn't been verified"

**Solution**:
- For development: Add your Google account as a test user in OAuth consent screen
- For production: Submit app for verification (when ready)

### Issue: "Invalid client ID"

**Solution**: Double-check:
- Client ID copied correctly (no extra spaces)
- .env.local has correct variable name: `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- Dev server was restarted after adding the variable

### Issue: Still getting "provider is not enabled"

**Solution**: Verify in Supabase dashboard:
- Authentication → Providers → Google shows "Enabled" ✓
- Client ID and Secret are saved
- Clear browser cache and cookies
- Restart dev server

---

## Security Notes

⚠️ **Important**:
- Never commit Google Client Secret to Git
- Client Secret should only be in Supabase dashboard (never in .env.local)
- Only Client ID is safe to expose publicly (NEXT_PUBLIC_* variables)
- Use test users in OAuth consent screen during development
- Add test accounts in Google Cloud Console: OAuth consent screen → Test users

---

## Production Deployment Checklist

When deploying to production:

- [ ] Update Google Cloud Console redirect URIs with production domain
- [ ] Update Supabase URL Configuration with production domain
- [ ] Set production environment variables in deployment platform
- [ ] Submit OAuth consent screen for verification (if needed)
- [ ] Test authentication flow on production domain
- [ ] Verify RLS policies work correctly

---

## References

- **Google Cloud Console**: https://console.cloud.google.com/
- **Supabase Dashboard**: https://supabase.com/dashboard/project/zwiasdpodeirxnybwvuw
- **Supabase Auth Docs**: https://supabase.com/docs/guides/auth/social-login/auth-google
- **Google OAuth Setup**: https://support.google.com/cloud/answer/6158849

---

**Last Updated**: 2026-02-14
**Supabase Project**: zwiasdpodeirxnybwvuw
**Issue**: Fix Google OAuth "provider is not enabled" error
