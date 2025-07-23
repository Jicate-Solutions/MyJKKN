# Google One Tap Setup Guide

## Error: "The given origin is not allowed for the given client ID"

This error occurs when your development or production URL is not added to the authorized origins in your Google OAuth client configuration.

## Important: Supabase + Google One Tap Configuration

When using Google One Tap with Supabase, you need TWO different OAuth clients:

1. **Standard OAuth Client** - For the regular "Sign in with Google" button (configured in Supabase Dashboard)
2. **Web Application OAuth Client** - For Google One Tap (configured separately)

## Steps to Fix

### 1. Create a New OAuth Client for Google One Tap

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to "APIs & Services" → "Credentials"
3. Click "CREATE CREDENTIALS" → "OAuth client ID"
4. Choose "Web application" as the application type
5. Name it something like "MyJKKN One Tap Client"

### 2. Configure Authorized JavaScript Origins

In the "Authorized JavaScript origins" section, add ALL of these:

**For Development:**

- `http://localhost:3000`
- `http://localhost:3001`
- `http://127.0.0.1:3000`
- `http://localhost`

**For Production:**

- `https://yourdomain.com`
- `https://www.yourdomain.com`

**Note:** Do NOT add trailing slashes to these URLs.

### 3. Configure Authorized Redirect URIs

In the "Authorized redirect URIs" section, add:

**For Development:**

- `http://localhost:3000/auth/callback`
- `http://127.0.0.1:3000/auth/callback`

**For Production:**

- `https://yourdomain.com/auth/callback`
- `https://www.yourdomain.com/auth/callback`

### 4. Save and Get Client ID

1. Click "CREATE" or "SAVE"
2. Copy the new Client ID (it should end with `.apps.googleusercontent.com`)
3. This is the client ID you'll use for Google One Tap (NOT the one in Supabase Dashboard)

### 5. Update Your Environment Variables

In your `.env.local` file, make sure you have:

```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-one-tap-client-id.apps.googleusercontent.com
```

This should be the NEW client ID you just created, not the one from Supabase Dashboard.

### 6. Important: Keep Both OAuth Clients

- The OAuth client configured in Supabase Dashboard is still needed for the regular "Sign in with Google" button
- The new OAuth client is specifically for Google One Tap
- They serve different purposes and both are required

### 7. Wait for Propagation

Google can take 5-10 minutes to propagate changes. After saving:

1. Clear your browser cache and cookies
2. Restart your development server
3. Try logging in again

## Common Issues

### Still getting the error?

1. **Verify you're using the correct client ID**: The One Tap client ID should be different from the one in Supabase Dashboard
2. **Check exact URL match**: The origin must match exactly (protocol, domain, and port)
3. **Try incognito mode**: Sometimes browser cache causes issues
4. **Check browser console**: Look for the exact origin being used in the error message

### Error: "has_opted_out_fedcm=true"

This appears in the console logs and indicates that FedCM (Federated Credential Management) is causing issues. We've already disabled it in the code with `use_fedcm_for_prompt: false`.

## Testing

After configuration:

1. Open your browser's developer console
2. Navigate to your login page
3. Look for "Google One Tap Debug Info:" in the console
4. Verify the origin and client ID are correct
5. The One Tap prompt should appear without errors

## Additional Notes for Supabase Users

- Google One Tap uses `signInWithIdToken` which is different from the standard OAuth flow
- The ID token from Google One Tap is exchanged directly for a Supabase session
- No redirect to Google is required, making it much faster
- The regular "Sign in with Google" button remains as a fallback option
