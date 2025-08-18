# Child App Integration Guide for MyJKKN OAuth

## 🎯 Quick Fix for Your Issue

Your child app is redirecting to `/auth/authorize` which now works! I've created this route to redirect to `/auth/login`.

## 📋 Supported OAuth Endpoints

MyJKKN supports multiple OAuth-style endpoints for flexibility:

### Option 1: Standard OAuth Authorize Endpoint (Recommended)
```
https://my.jkkn.ac.in/auth/authorize?
  app_id=testing_meglmppk&
  redirect_uri=https://jkkn-auth-flow.lovable.app/auth/callback&
  response_type=code&
  scope=read+write+profile&
  state=RANDOM_STATE
```

### Option 2: Direct Login Endpoint
```
https://my.jkkn.ac.in/auth/login?
  app_id=testing_meglmppk&
  redirect_uri=https://jkkn-auth-flow.lovable.app/auth/callback&
  scope=read,write,profile&
  state=RANDOM_STATE
```

Both endpoints work identically - `/auth/authorize` redirects to `/auth/login`.

## 🔧 Child App Implementation

### 1. Install Dependencies (if using React)
```bash
npm install axios react-router-dom
```

### 2. Create OAuth Service
```typescript
// services/parentAuth.ts
class ParentAuthService {
  private readonly parentAppUrl = 'https://my.jkkn.ac.in';
  private readonly appId = 'testing_meglmppk';
  private readonly redirectUri = 'https://jkkn-auth-flow.lovable.app/auth/callback';
  
  // Initiate OAuth flow
  login(scope = 'read,write,profile') {
    const state = this.generateState();
    sessionStorage.setItem('oauth_state', state);
    
    const params = new URLSearchParams({
      app_id: this.appId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: scope,
      state: state
    });
    
    window.location.href = `${this.parentAppUrl}/auth/authorize?${params}`;
  }
  
  // Handle OAuth callback
  async handleCallback(code: string, state: string) {
    // Verify state
    const savedState = sessionStorage.getItem('oauth_state');
    if (state !== savedState) {
      throw new Error('Invalid state parameter');
    }
    
    // Exchange code for tokens
    const response = await fetch(`${this.parentAppUrl}/api/auth/child-app/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code,
        app_id: this.appId,
        redirect_uri: this.redirectUri
      })
    });
    
    if (!response.ok) {
      throw new Error('Token exchange failed');
    }
    
    const data = await response.json();
    
    // Store tokens
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    
    return data;
  }
  
  private generateState() {
    return Math.random().toString(36).substring(2, 15);
  }
}

export default new ParentAuthService();
```

### 3. Create Login Component
```tsx
// components/Login.tsx
import { Button } from '@/components/ui/button';
import parentAuth from '@/services/parentAuth';

export function Login() {
  const handleLogin = () => {
    parentAuth.login('read,write,profile');
  };
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Welcome to JKKN Auth Flow</h1>
      <p className="text-gray-600 mb-8">Login with your MyJKKN account</p>
      <Button onClick={handleLogin} size="lg">
        Login with MyJKKN
      </Button>
    </div>
  );
}
```

### 4. Create Callback Handler
```tsx
// app/auth/callback/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import parentAuth from '@/services/parentAuth';

export default function CallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      
      if (error) {
        setError(searchParams.get('error_description') || 'Authentication failed');
        return;
      }
      
      if (!code) {
        setError('Authorization code missing');
        return;
      }
      
      try {
        const tokens = await parentAuth.handleCallback(code, state || '');
        console.log('Login successful:', tokens.user);
        router.push('/dashboard');
      } catch (err) {
        setError(err.message);
      }
    };
    
    handleCallback();
  }, [searchParams, router]);
  
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Authentication Error</h1>
        <p className="text-gray-600">{error}</p>
        <button 
          onClick={() => router.push('/login')}
          className="mt-4 text-blue-600 underline"
        >
          Try Again
        </button>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      <p className="mt-4 text-gray-600">Completing authentication...</p>
    </div>
  );
}
```

## 🔄 Complete Flow Diagram

```
1. User clicks "Login with MyJKKN" in child app
   ↓
2. Redirects to: my.jkkn.ac.in/auth/authorize?app_id=xxx&redirect_uri=xxx
   ↓
3. MyJKKN redirects to /auth/login (preserves parameters)
   ↓
4. User logs in with Google OAuth
   ↓
5. After successful login, shows consent page
   ↓
6. User authorizes the child app
   ↓
7. Redirects back to child app with authorization code
   ↓
8. Child app exchanges code for access/refresh tokens
   ↓
9. Child app can now make authenticated API calls
```

## 🔐 Security Best Practices

1. **Always validate state parameter** to prevent CSRF attacks
2. **Store tokens securely** (use httpOnly cookies if possible)
3. **Implement token refresh** before access token expires
4. **Handle errors gracefully** with user-friendly messages
5. **Use HTTPS** in production

## 📝 Testing Your Integration

### Test URLs:

1. **Local Development:**
```
http://localhost:3001/auth/authorize?app_id=testing_meglmppk&redirect_uri=https://jkkn-auth-flow.lovable.app/auth/callback&response_type=code&scope=read+write+profile
```

2. **Production:**
```
https://my.jkkn.ac.in/auth/authorize?app_id=testing_meglmppk&redirect_uri=https://jkkn-auth-flow.lovable.app/auth/callback&response_type=code&scope=read+write+profile
```

## 🐛 Troubleshooting

### "404 Not Found" on /auth/authorize
**Solution**: Route has been created. Deploy the latest changes.

### "Invalid redirect URI"
**Solution**: Ensure your redirect URI exactly matches what's in the database:
```sql
SELECT allowed_redirect_uris 
FROM applications 
WHERE app_id = 'testing_meglmppk';
```

### "Invalid or inactive application"
**Solution**: Check that your app is active:
```sql
SELECT is_active, uses_parent_auth 
FROM applications 
WHERE app_id = 'testing_meglmppk';
```

### Token Exchange Fails
**Solution**: Check that you're sending the exact same redirect_uri used in the authorize request.

## 📊 Monitor Authentication Flow

```sql
-- Check recent auth attempts
SELECT * FROM child_app_auth_codes 
WHERE app_id = 'testing_meglmppk' 
ORDER BY created_at DESC 
LIMIT 5;

-- Check active sessions
SELECT * FROM child_app_sessions 
WHERE child_app_id = 'testing_meglmppk' 
AND is_active = true;
```

## ✅ Next Steps

1. Test the flow with the URLs above
2. Implement token refresh logic
3. Add logout functionality
4. Implement user profile fetching
5. Add error handling and retry logic