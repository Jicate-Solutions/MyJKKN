# Child App Code Fixes

## 1. Create Token Exchange Endpoint in Child App

Create this file in your child app: `app/api/auth/token/route.ts`

```typescript
// app/api/auth/token/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, state } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'Missing authorization code' },
        { status: 400 }
      );
    }

    // Exchange code with parent app
    const tokenResponse = await fetch(
      `${process.env.NEXT_PUBLIC_PARENT_APP_URL}/api/auth/child-app/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || ''
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          app_id: process.env.NEXT_PUBLIC_APP_ID,
          redirect_uri: process.env.NEXT_PUBLIC_REDIRECT_URI
        })
      }
    );

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json();
      return NextResponse.json(
        { error: error.error || 'Token exchange failed' },
        { status: tokenResponse.status }
      );
    }

    const tokenData = await tokenResponse.json();

    // Return tokens to frontend
    return NextResponse.json({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: tokenData.expires_in || 3600,
      user: tokenData.user
    });
  } catch (error) {
    console.error('Token exchange error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## 2. Update ParentAuthService (Optional Improvements)

Your `parent-auth-service.ts` is mostly correct, but here are some improvements:

### Add error handling for network failures:
```typescript
// In validateToken method (line 174)
async validateToken(token: string): Promise<ValidationResponse> {
  try {
    // Add timeout and retry logic
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await this.api.post(
      '/api/auth/child-app/validate',
      { token, child_app_id: process.env.NEXT_PUBLIC_APP_ID },
      { signal: controller.signal }
    );
    
    clearTimeout(timeoutId);
    return response.data;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Token validation timeout');
      return { valid: false, error: 'Validation timeout' };
    }
    // ... existing error handling
  }
}
```

## 3. Update Callback Page

Your callback page needs a small fix to handle the response correctly:

```typescript
// Line 886-892 - After getting tokenData
const tokenData = await response.json();

// Add user data to the response if not included
if (!tokenData.user && tokenData.access_token) {
  // Validate token to get user data
  const validationResponse = await fetch('/api/auth/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      token: tokenData.access_token
    })
  });
  
  if (validationResponse.ok) {
    const validation = await validationResponse.json();
    tokenData.user = validation.user;
  }
}
```

## 4. Environment Variables for Production

Update your `.env.production`:

```bash
# Production configuration
NEXT_PUBLIC_PARENT_APP_URL=https://my.jkkn.ac.in
NEXT_PUBLIC_APP_ID=child_app_mel9u5y7
NEXT_PUBLIC_API_KEY=app_0d5ac6f5d907bdeb_e07471d89a650d88

# Your production callback URL
NEXT_PUBLIC_REDIRECT_URI=https://child-app-auth-flow-integration.vercel.app/auth/callback

# Use the same JWT secret as parent app
NEXT_PUBLIC_JWT_SECRET=UqQFhiCyE2kOQIy8np3S2C9XYqDAUbYXmC/2ojVif88=

# Disable debug in production
NEXT_PUBLIC_AUTH_DEBUG=false
```

## 5. CORS Configuration (if needed)

If you still get CORS errors, add this to your child app's `next.config.js`:

```javascript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: process.env.NEXT_PUBLIC_PARENT_APP_URL },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
};
```

## Summary of Required Changes:

1. ✅ Your auth service URL is correct (`/auth/child-app/consent`)
2. ❌ **Missing**: Token exchange endpoint in child app (`/api/auth/token`)
3. ❌ **Missing**: Validation endpoint in child app (optional)
4. ✅ Environment variables are correct for development
5. ⚠️ Update environment variables for production

## Testing Checklist:

- [ ] Create `/api/auth/token/route.ts` in your child app
- [ ] Update environment variables for production
- [ ] Test login flow from child app
- [ ] Verify token exchange works
- [ ] Check user data is properly stored
- [ ] Test logout flow
- [ ] Test token refresh