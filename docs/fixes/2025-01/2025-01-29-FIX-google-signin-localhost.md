# Fix: Google Sign-In Origin Error on Localhost

## Problem
Error message: `[GSI_LOGGER]: The given origin is not allowed for the given client ID`

This error occurs when trying to use Google One Tap sign-in on localhost because the Google OAuth Client ID is configured for production domain only.

## Root Cause
The Google OAuth Client ID (`994268945457-t46f4rr2878quia33g392qm1c098plut.apps.googleusercontent.com`) is configured for production use with `https://my.jkkn.ac.in` but not for `http://localhost:3000`.

## Solutions

### Solution 1: Update Google Cloud Console (Recommended)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** > **Credentials**
4. Click on your OAuth 2.0 Client ID
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:3000`
   - `http://localhost:3001` (if using different port)
   - `http://127.0.0.1:3000`
6. Under **Authorized redirect URIs**, add:
   - `http://localhost:3000/auth/callback`
   - `http://127.0.0.1:3000/auth/callback`
7. Save the changes

### Solution 2: Create Separate Development Client ID
1. In Google Cloud Console, create a new OAuth 2.0 Client ID specifically for development
2. Configure it with localhost origins
3. Create `.env.local` file:
```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID_DEV=your_dev_client_id_here
```
4. The code will automatically use this ID when on localhost

### Solution 3: Temporary Workaround
If you can't update Google Console immediately:
1. Use the regular Google Sign-In button (not One Tap)
2. The OAuth flow handles origins differently and may work

## Code Changes Made
1. **Updated Google One Tap component** to:
   - Detect development environment
   - Use separate dev client ID if available
   - Provide better error messages
   - Add console warnings with instructions

2. **Created `.env.local.example`** as template for local development

## Testing
After applying the fix:
1. Clear browser cache and cookies
2. Restart the development server
3. Check console for debug information
4. The error should be resolved if origins are properly configured

## Prevention
- Always configure both production and development origins in Google Cloud Console
- Maintain separate OAuth clients for different environments
- Document the required origins in project README