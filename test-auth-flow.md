# Testing Child App Authentication Flow

## Your Test App Details
- **App Name**: testing
- **App ID**: testing_meglmppk  
- **Allowed Redirect**: https://jkkn-auth-flow.lovable.app/auth/callback

## Test URL for Authorization

Open this URL in your browser while logged into MyJKKN:

```
http://localhost:3001/auth/child-app/login?app_id=testing_meglmppk&redirect_uri=https://jkkn-auth-flow.lovable.app/auth/callback&scope=read,write,profile&response_type=code
```

## Expected Flow

1. **Login Page Loads**: You'll see the consent screen showing the "testing" app requesting permissions
2. **Click Authorize**: This will generate an authorization code
3. **Redirect**: You'll be redirected to `https://jkkn-auth-flow.lovable.app/auth/callback?code=XXXXX`
4. **Token Exchange**: The child app should exchange this code for tokens

## Common Issues & Solutions

### Issue 1: "Invalid or inactive application"
**Solution**: Check that app_id matches exactly: `testing_meglmppk`

### Issue 2: "Invalid redirect URI"  
**Solution**: The redirect URI must exactly match what's in the database. Current allowed URI:
- `https://jkkn-auth-flow.lovable.app/auth/callback`

To add localhost for testing:
```sql
UPDATE applications 
SET allowed_redirect_uris = array_append(allowed_redirect_uris, 'http://localhost:3000/callback')
WHERE app_id = 'testing_meglmppk';
```

### Issue 3: "Missing JWT_SECRET"
**Solution**: Add to `.env.local`:
```
JWT_SECRET=your-secure-secret-key-here
```

### Issue 4: No API Key
If your test app needs an API key, generate one:
```javascript
// Generate API key
const apiKey = crypto.randomBytes(32).toString('hex');
console.log('API Key:', apiKey);

// Hash it for storage
const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
console.log('Hash for DB:', hash);
```

Then update the database:
```sql
UPDATE applications 
SET api_key_hash = 'YOUR_HASH_HERE'
WHERE app_id = 'testing_meglmppk';
```

## Testing Token Exchange

After getting the authorization code, test token exchange:

```bash
curl -X POST http://localhost:3001/api/auth/child-app/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "YOUR_AUTH_CODE",
    "app_id": "testing_meglmppk",
    "redirect_uri": "https://jkkn-auth-flow.lovable.app/auth/callback"
  }'
```

## Monitor the Flow

Check the database to see what's happening:

```sql
-- Check authorization codes
SELECT * FROM child_app_auth_codes 
WHERE app_id = 'testing_meglmppk' 
ORDER BY created_at DESC;

-- Check sessions
SELECT * FROM child_app_sessions 
WHERE child_app_id = 'testing_meglmppk';

-- Check access logs
SELECT * FROM child_app_access_logs 
WHERE child_app_id = 'testing_meglmppk' 
ORDER BY created_at DESC;
```