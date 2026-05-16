export const childAppIntegrationMarkdown = `# Complete Child App Integration Guide

Step-by-step guide to integrate your application with the MyJKKN authentication system using the OAuth 2.0 flow.

## Prerequisites

Before starting, ensure you have:

- Your **App ID** from the MyJKKN admin panel
- Your **API Key** from the MyJKKN admin panel (required for all API calls)
- Your application registered in MyJKKN
- Redirect URIs configured in MyJKKN
- Next.js 14+ project with TypeScript

## Reference Implementation

A fully functional test application is published at https://github.com/JKKN-Institutions/child-app-auth-flow-integration. It contains all the code shown in this guide, ready to use as a template.

## Authentication Flow

1. **User clicks login** in your child app.
2. **Child app redirects** to \`https://jkkn.ai/auth/child-app/consent\` with OAuth 2.0 query params.
3. **User authenticates** with MyJKKN (or re-uses an existing parent session).
4. **MyJKKN redirects back** to your child app's \`redirect_uri\` with an authorization \`code\`.
5. **Child app exchanges** the code at \`POST /api/auth/child-app/token\` for access and refresh tokens.
6. **Child app stores** the tokens (cookies + localStorage) and starts the auth-context lifecycle.
7. **Child app refreshes** the access token automatically 5 minutes before expiry.

## OAuth 2.0 Endpoints

### Authorization Endpoint (Consent Page)

\`GET https://jkkn.ai/auth/child-app/consent\`

| Parameter | Required | Description |
|-----------|----------|-------------|
| \`response_type\` | Yes | Always \`code\` |
| \`client_id\` | Yes | Your App ID |
| \`app_id\` | Yes | Your App ID |
| \`redirect_uri\` | Yes | Your callback URL |
| \`scope\` | No | Space-separated scopes (\`read write profile\`) |
| \`state\` | Yes | Random string — required for CSRF protection |

### Token Exchange

\`POST https://jkkn.ai/api/auth/child-app/token\`

Headers:

- \`Content-Type: application/json\`
- \`X-API-Key: {your_api_key}\` _(required)_

Body:

\`\`\`json
{
  "grant_type": "authorization_code",
  "code": "{auth_code}",
  "child_app_id": "{your_app_id}",
  "redirect_uri": "{your_callback_url}"
}
\`\`\`

> **Note:** The body field is \`child_app_id\` (NOT \`app_id\`). Mismatch is the #1 integration bug.

### Token Refresh

\`POST https://jkkn.ai/api/auth/child-app/token\`

Headers identical to the exchange call. Body:

\`\`\`json
{
  "grant_type": "refresh_token",
  "refresh_token": "{refresh_token}",
  "child_app_id": "{your_app_id}"
}
\`\`\`

### Token Validation

\`POST https://jkkn.ai/api/auth/child-app/validate\`

\`\`\`json
{
  "token": "{access_token}",
  "child_app_id": "{your_app_id}"
}
\`\`\`

### Logout (Child App Session Only)

\`POST https://jkkn.ai/api/auth/child-app/logout\`

\`\`\`json
{
  "app_id": "{your_app_id}",
  "session_id": "{session_id}",
  "access_token": "{access_token}",
  "redirect_uri": "{your_logout_redirect_url}"
}
\`\`\`

This endpoint only clears the **child app** session. The parent app session remains active for seamless re-authentication.

## Package Dependencies

\`\`\`json
{
  "dependencies": {
    "js-cookie": "^3.0.5",
    "@types/js-cookie": "^3.0.6",
    "next": "^14.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "typescript": "^5.0.0"
  }
}
\`\`\`

## Implementation — Parent Auth Service

\`\`\`typescript
// lib/auth/parent-auth-service.ts
import Cookies from 'js-cookie';

interface AuthConfig {
  parentAppUrl: string;
  appId: string;
  redirectUri: string;
  scopes: string[];
}

interface UserSession {
  user: {
    id: string;
    email: string;
    full_name: string;
    role: string;
    institution_id?: string;
    permissions?: Record<string, boolean>;
  };
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export class ParentAuthService {
  private static instance: ParentAuthService;
  private config: AuthConfig;
  private refreshTimer?: NodeJS.Timeout;

  private constructor() {
    this.config = {
      parentAppUrl: process.env.NEXT_PUBLIC_PARENT_APP_URL || 'https://jkkn.ai',
      appId: process.env.NEXT_PUBLIC_APP_ID || '',
      redirectUri:
        process.env.NEXT_PUBLIC_REDIRECT_URI ||
        (typeof window !== 'undefined'
          ? window.location.origin + '/auth/callback'
          : '/auth/callback'),
      scopes: ['read', 'write', 'profile']
    };
  }

  static getInstance(): ParentAuthService {
    if (!ParentAuthService.instance) {
      ParentAuthService.instance = new ParentAuthService();
    }
    return ParentAuthService.instance;
  }

  async initiateLogin(state?: string): Promise<void> {
    const authUrl = new URL(\`\${this.config.parentAppUrl}/auth/child-app/consent\`);

    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', this.config.appId);
    authUrl.searchParams.append('app_id', this.config.appId);
    authUrl.searchParams.append('redirect_uri', this.config.redirectUri);
    authUrl.searchParams.append('scope', this.config.scopes.join(' '));
    authUrl.searchParams.append('state', state || this.generateState());

    if (!state) {
      sessionStorage.setItem('oauth_state', authUrl.searchParams.get('state')!);
    }

    window.location.href = authUrl.toString();
  }

  async handleCallback(code: string, state: string): Promise<UserSession> {
    const savedState = sessionStorage.getItem('oauth_state');
    if (state !== savedState) {
      throw new Error('Invalid state parameter — possible CSRF attack');
    }

    const response = await fetch(\`\${this.config.parentAppUrl}/api/auth/child-app/token\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || ''
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        child_app_id: this.config.appId,
        redirect_uri: this.config.redirectUri
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error_description || 'Authentication failed');
    }

    const session = await response.json();
    this.saveSession(session);
    this.scheduleTokenRefresh(session.expires_in);
    sessionStorage.removeItem('oauth_state');
    return session;
  }

  private saveSession(session: UserSession): void {
    const expiresAt = new Date(Date.now() + session.expires_in * 1000);
    const isProduction = window.location.protocol === 'https:';

    Cookies.set('access_token', session.access_token, {
      expires: expiresAt,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/'
    });

    Cookies.set('refresh_token', session.refresh_token, {
      expires: 30,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/'
    });

    try {
      localStorage.setItem('user_data', JSON.stringify(session.user));
      localStorage.setItem('auth_timestamp', Date.now().toString());
    } catch (e) {
      console.error('Failed to save user data to localStorage:', e);
    }
  }

  getSession(): UserSession | null {
    try {
      const accessToken = Cookies.get('access_token');
      const refreshToken = Cookies.get('refresh_token');
      const userData = localStorage.getItem('user_data');

      if (!accessToken || !refreshToken || !userData) return null;

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        user: JSON.parse(userData),
        expires_in: 3600
      };
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  async refreshToken(): Promise<UserSession | null> {
    const refreshToken = Cookies.get('refresh_token');
    if (!refreshToken) return null;

    try {
      const response = await fetch(\`\${this.config.parentAppUrl}/api/auth/child-app/token\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || ''
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          child_app_id: this.config.appId
        })
      });

      if (!response.ok) throw new Error('Token refresh failed');

      const session = await response.json();
      this.saveSession(session);
      this.scheduleTokenRefresh(session.expires_in);
      return session;
    } catch (error) {
      this.clearSession();
      return null;
    }
  }

  private scheduleTokenRefresh(expiresIn: number): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const refreshIn = (expiresIn - 300) * 1000;
    this.refreshTimer = setTimeout(() => this.refreshToken(), refreshIn);
  }

  async logout(redirectToParent: boolean = false): Promise<void> {
    try {
      const response = await fetch(\`\${this.config.parentAppUrl}/api/auth/child-app/logout\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: this.config.appId,
          session_id: this.getSession()?.session_id,
          access_token: this.getSession()?.access_token,
          redirect_uri: redirectToParent ? this.config.parentAppUrl : window.location.origin
        })
      });

      this.clearSession();

      if (redirectToParent && response.ok) {
        const data = await response.json();
        if (data.redirect_uri) window.location.href = data.redirect_uri;
      } else {
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Logout error:', error);
      this.clearSession();
      window.location.href = '/login';
    }
  }

  private clearSession(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    Cookies.remove('access_token');
    Cookies.remove('refresh_token');
    localStorage.removeItem('user_data');
    sessionStorage.clear();
  }

  isAuthenticated(): boolean {
    return !!this.getSession();
  }

  getUser(): any {
    return this.getSession()?.user || null;
  }

  getAuthHeaders(): Record<string, string> {
    const session = this.getSession();
    if (!session) return {};
    return {
      Authorization: \`Bearer \${session.access_token}\`,
      'X-App-ID': this.config.appId
    };
  }

  private generateState(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}

export default ParentAuthService.getInstance();
\`\`\`

## Implementation — React Auth Context

\`\`\`tsx
// lib/auth/auth-context.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import parentAuthService from './parent-auth-service';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  institution_id?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');
      const error = params.get('error');

      if (error) {
        console.error('OAuth error:', params.get('error_description'));
        setLoading(false);
        return;
      }

      if (code && state) {
        try {
          const session = await parentAuthService.handleCallback(code, state);
          setUser(session.user);
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error) {
          console.error('Auth callback failed:', error);
        }
      } else {
        const session = parentAuthService.getSession();
        if (session) setUser(session.user);
      }

      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async () => {
    await parentAuthService.initiateLogin();
  };

  const logout = async (redirectToParent: boolean = false) => {
    await parentAuthService.logout(redirectToParent);
    setUser(null);
  };

  const refreshSession = async () => {
    const session = await parentAuthService.refreshToken();
    if (session) setUser(session.user);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshSession
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
\`\`\`

## Implementation — Protected Dashboard Page

\`\`\`tsx
// app/dashboard/page.tsx
'use client';

import { useAuth } from '@/lib/auth/auth-context';
import ProtectedRoute from '@/components/protected-route';

export default function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <ProtectedRoute>
      <div className='min-h-screen p-8'>
        <div className='max-w-4xl mx-auto'>
          <h1 className='text-3xl font-bold mb-4'>Dashboard</h1>
          <div className='bg-white rounded-lg shadow p-6'>
            <h2 className='text-xl font-semibold mb-2'>Welcome, {user?.full_name}!</h2>
            <p className='text-gray-600 mb-4'>Email: {user?.email}</p>
            <p className='text-gray-600 mb-4'>Role: {user?.role}</p>
            <button
              onClick={logout}
              className='px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700'
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
\`\`\`

## Test Your Integration

### 1. Test the Authorization URL

Open this URL in your browser:

\`\`\`
https://jkkn.ai/auth/child-app/consent?response_type=code&app_id=YOUR_APP_ID&redirect_uri=http://localhost:3001/auth/callback&scope=read write profile&state=test123
\`\`\`

### 2. Test Token Exchange

\`\`\`bash
curl -X POST https://jkkn.ai/api/auth/child-app/token \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "grant_type": "authorization_code",
    "code": "TEST_AUTH_CODE",
    "child_app_id": "YOUR_APP_ID",
    "redirect_uri": "http://localhost:3001/auth/callback"
  }'
\`\`\`

### 3. Test Token Validation

\`\`\`bash
curl -X POST https://jkkn.ai/api/auth/child-app/validate \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "token": "YOUR_ACCESS_TOKEN",
    "child_app_id": "YOUR_APP_ID"
  }'
\`\`\`

### 4. Test Token Refresh

\`\`\`bash
curl -X POST https://jkkn.ai/api/auth/child-app/token \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "grant_type": "refresh_token",
    "refresh_token": "YOUR_REFRESH_TOKEN",
    "child_app_id": "YOUR_APP_ID"
  }'
\`\`\`

## Optimized Backend

The MyJKKN authentication system uses an optimized storage structure that reduces database usage by **99%**. Auth codes and sessions are automatically cleaned up, ensuring optimal performance even with thousands of users and multiple child apps.

## Common Pitfalls

- **Use \`child_app_id\`, not \`app_id\`, in token exchange/refresh body.** The query parameter is \`app_id\` but the JSON body field is \`child_app_id\`.
- **The \`state\` parameter is required.** Generate a random string and verify it on callback to prevent CSRF.
- **Cookies need \`secure: true\` only on HTTPS.** Detect via \`window.location.protocol === 'https:'\` in development.
- **Schedule refresh 5 minutes before expiry.** Don't wait for the token to actually expire — refresh proactively to avoid mid-request failures.
- **Logout only clears the child session by default.** Use \`logout(true)\` to also redirect to the parent for a full sign-out.
`;
