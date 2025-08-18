# Environment Variables Setup for Child App OAuth

## Critical Environment Variables

### 1. SUPABASE_SERVICE_ROLE_KEY (Required)

This is essential for the OAuth flow to work. Without it, you'll get 500 errors when trying to store authorization codes.

**Where to find it:**
1. Go to your Supabase Dashboard
2. Navigate to Settings → API
3. Find "Service role key" under Project API keys
4. Copy the entire key (starts with `eyJ...`)

**Add to .env.local:**
```env
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...your-full-key-here
```

### 2. JWT_SECRET (Required)

Used for signing JWT tokens for child apps.

**Generate a secure key:**
```bash
# Option 1: Using OpenSSL
openssl rand -base64 32

# Option 2: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Add to .env.local:**
```env
JWT_SECRET=your-generated-secret-here
```

### 3. Standard Supabase Variables

These should already be set:
```env
NEXT_PUBLIC_SUPABASE_URL=https://kvizhngldtiuufknvehv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Complete .env.local Example

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://kvizhngldtiuufknvehv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# JWT Secret for child app authentication
JWT_SECRET=your-secure-random-string-here

# Google OAuth (if using)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
```

## Verifying Your Setup

### 1. Check Environment Variables Are Loaded
```bash
# Add this temporary test endpoint
# app/api/test-env/route.ts
```

### 2. Test the Authorization Flow
```bash
# Visit this URL in your browser
http://localhost:3001/auth/authorize?app_id=testing_meglmppk&redirect_uri=https://jkkn-auth-flow.lovable.app/auth/callback&response_type=code&scope=read+write+profile
```

### 3. Check Database Permissions
```sql
-- Run in Supabase SQL Editor
SELECT * FROM child_app_auth_codes;
-- Should work without RLS errors
```

## Common Issues

### Issue: "Missing Supabase service role credentials"
**Solution**: Ensure SUPABASE_SERVICE_ROLE_KEY is set in .env.local

### Issue: "permission denied for table child_app_auth_codes"
**Solution**: The service role key is missing or incorrect

### Issue: "Invalid JWT secret"
**Solution**: Set JWT_SECRET environment variable

## Security Notes

⚠️ **NEVER commit .env.local to git**
- Ensure `.env.local` is in `.gitignore`
- Service role key has full database access - keep it secure
- JWT secret should be random and at least 32 characters

## Deployment

For production deployment:

### Vercel
```bash
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add JWT_SECRET
```

### Other Platforms
Add these as environment variables in your platform's dashboard:
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- All `NEXT_PUBLIC_*` variables