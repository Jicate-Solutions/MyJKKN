# Google OAuth Setup Checklist

**Quick reference for implementing Google OAuth authentication**

---

## Pre-Setup ✅

- [x] Code files updated (app/layout.tsx, next.config.ts, proxy.ts)
- [x] Documentation updated (CLAUDE.md, START_SESSION.md)
- [x] Setup guides created
- [x] Verification scripts prepared

---

## Configuration Tasks 🎯

### Google Cloud Console

- [ ] Navigate to https://console.cloud.google.com/
- [ ] Create/select project: "MyJKKN IMS"
- [ ] Configure OAuth consent screen (if needed)
  - [ ] App name: MyJKKN IMS
  - [ ] User support email
  - [ ] Developer contact email
  - [ ] Scopes: email, profile
- [ ] Create OAuth 2.0 Client ID
  - [ ] Type: Web application
  - [ ] Name: MyJKKN IMS - Web Client
- [ ] Add Authorized JavaScript origins:
  - [ ] `http://localhost:3000`
  - [ ] `https://zwiasdpodeirxnybwvuw.supabase.co`
- [ ] Add Authorized redirect URIs:
  - [ ] `http://localhost:3000/auth/callback`
  - [ ] `https://zwiasdpodeirxnybwvuw.supabase.co/auth/v1/callback`
- [ ] Copy Client ID (save to notes)
- [ ] Copy Client Secret (save to notes)

### Supabase Dashboard

- [ ] Navigate to https://supabase.com/dashboard/project/zwiasdpodeirxnybwvuw/auth/providers
- [ ] Find Google provider
- [ ] Toggle "Enable Sign in with Google" → ON
- [ ] Paste Client ID (for OAuth)
- [ ] Paste Client Secret (for OAuth)
- [ ] Paste Client ID again (Authorized Client IDs)
- [ ] Click Save
- [ ] Go to Authentication → URL Configuration
- [ ] Set Site URL: `http://localhost:3000`
- [ ] Add redirect URLs:
  - [ ] `http://localhost:3000/**`
  - [ ] `http://localhost:3000/auth/callback`
- [ ] Click Save
- [ ] Verify Google shows as "Enabled" ✓

### Local Environment

- [ ] Open `.env.local` file
- [ ] Add line: `NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id_here`
- [ ] Replace with actual Client ID
- [ ] Save file
- [ ] Stop dev server (Ctrl+C)
- [ ] Clear cache: `rm -rf .next`
- [ ] Restart: `npm run dev`

---

## Testing 🧪

- [ ] Open browser in Incognito mode
- [ ] Navigate to `http://localhost:3000/auth/login`
- [ ] Click "Continue with Google"
- [ ] Observe Google consent screen appears
- [ ] Select Google account
- [ ] Grant permissions
- [ ] Verify redirect to dashboard
- [ ] Check no errors in console
- [ ] Test logout
- [ ] Test login again

---

## Verification 📊

### Database Checks

- [ ] Open Supabase SQL Editor
- [ ] Run query from `verify-google-oauth.sql`
- [ ] Verify profile created in `profiles` table
- [ ] Verify user created in `auth.users` table
- [ ] Check provider is 'google'
- [ ] Verify institution_id assigned (if applicable)

### Browser Checks

- [ ] No "provider is not enabled" error
- [ ] No "redirect URI mismatch" error
- [ ] OAuth flow completes successfully
- [ ] Session persists after refresh
- [ ] Can access authenticated routes

---

## Troubleshooting (If Issues) 🔧

- [ ] Verify Google provider shows "Enabled" in Supabase
- [ ] Check redirect URIs match exactly in Google Cloud Console
- [ ] Confirm .env.local has correct variable name
- [ ] Restart dev server
- [ ] Clear browser cache/use Incognito
- [ ] Check browser console for errors
- [ ] Check Network tab for failed requests
- [ ] Verify Client ID has no extra spaces
- [ ] Confirm Client Secret saved in Supabase (not .env.local)

---

## Common Errors & Solutions

### "Redirect URI mismatch"
**Fix**: Check exact URLs in Google Cloud Console match callback URLs

### "provider is not enabled"
**Fix**: Toggle Google provider in Supabase dashboard

### "Access blocked: App not verified"
**Fix**: Add test users in OAuth consent screen for development

### Environment variable not loading
**Fix**: Restart dev server, check variable name, verify .env.local location

---

## Success Criteria ✅

You've successfully implemented Google OAuth when:

1. ✅ Can click "Continue with Google" without errors
2. ✅ Google consent screen appears
3. ✅ Successfully redirected to dashboard after login
4. ✅ Profile created in database
5. ✅ Can log out and log back in
6. ✅ Session persists across page refreshes
7. ✅ No console errors

---

## Files Reference

- **Setup Guide**: `GOOGLE_OAUTH_SETUP_GUIDE.md`
- **Summary**: `GOOGLE_OAUTH_IMPLEMENTATION_SUMMARY.md`
- **SQL Verification**: `verify-google-oauth.sql`
- **Cleanup Script**: `cleanup-and-restart.sh` or `cleanup-and-restart.ps1`
- **Env Template**: `.env.local.template`

---

**Estimated Time**: 15-20 minutes total

**Last Updated**: 2026-02-14
