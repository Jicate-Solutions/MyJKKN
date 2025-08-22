'use client';

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Copy,
  Check,
  Info,
  Code2,
  Shield,
  Key,
  Server,
  GitBranch,
  FileCode,
  Zap,
  Lock,
  ArrowRight,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  BookOpen,
  Terminal,
  Bot,
  Sparkles,
  Database,
  Globe,
  Settings,
  LogOut
} from 'lucide-react';

export default function ChildAppIntegrationDocs() {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const CodeBlock = ({
    code,
    language = 'typescript',
    title,
    id
  }: {
    code: string;
    language?: string;
    title?: string;
    id: string;
  }) => (
    <div className='relative group'>
      {title && (
        <div className='flex items-center justify-between bg-muted px-4 py-2 rounded-t-lg'>
          <span className='text-sm font-medium'>{title}</span>
          <Badge variant='outline'>{language}</Badge>
        </div>
      )}
      <div
        className={`bg-slate-950 ${
          title ? 'rounded-b-lg' : 'rounded-lg'
        } p-4 overflow-x-auto`}
      >
        <pre className='text-sm text-slate-50'>
          <code>{code}</code>
        </pre>
        <Button
          variant='ghost'
          size='sm'
          className='absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity'
          onClick={() => copyToClipboard(code, id)}
        >
          {copiedCode === id ? (
            <Check className='h-4 w-4 text-green-500' />
          ) : (
            <Copy className='h-4 w-4' />
          )}
        </Button>
      </div>
    </div>
  );

  // Complete authentication service code
  const parentAuthServiceCode = `// lib/auth/parent-auth-service.ts
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
      parentAppUrl: process.env.NEXT_PUBLIC_PARENT_APP_URL || 'https://my.jkkn.ac.in',
      appId: process.env.NEXT_PUBLIC_APP_ID || '',
      redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || (typeof window !== 'undefined' ? window.location.origin + '/auth/callback' : '/auth/callback'),
      scopes: ['read', 'write', 'profile']
    };
  }

  static getInstance(): ParentAuthService {
    if (!ParentAuthService.instance) {
      ParentAuthService.instance = new ParentAuthService();
    }
    return ParentAuthService.instance;
  }

  // Initialize OAuth2 authentication flow - Redirects to consent page
  async initiateLogin(state?: string): Promise<void> {
    // Use the consent page endpoint for child app authentication
    const authUrl = new URL(\`\${this.config.parentAppUrl}/auth/child-app/consent\`);
    
    // OAuth2 standard parameters
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', this.config.appId);
    authUrl.searchParams.append('app_id', this.config.appId);
    authUrl.searchParams.append('redirect_uri', this.config.redirectUri);
    authUrl.searchParams.append('scope', this.config.scopes.join(' '));
    authUrl.searchParams.append('state', state || this.generateState());
    
    // Store state for CSRF protection
    if (!state) {
      sessionStorage.setItem('oauth_state', authUrl.searchParams.get('state')!);
    }
    
    console.log('[ParentAuth] Initiating login to:', authUrl.toString());
    window.location.href = authUrl.toString();
  }

  // Handle OAuth callback with authorization code
  async handleCallback(code: string, state: string): Promise<UserSession> {
    // Verify state for CSRF protection
    const savedState = sessionStorage.getItem('oauth_state');
    if (state !== savedState) {
      throw new Error('Invalid state parameter - possible CSRF attack');
    }
    
    // Exchange authorization code for tokens
    const response = await fetch(\`\${this.config.parentAppUrl}/api/auth/child-app/token\`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code,
        app_id: this.config.appId,
        redirect_uri: this.config.redirectUri
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error_description || 'Authentication failed');
    }

    const session = await response.json();
    
    // Save session data
    this.saveSession(session);
    
    // Schedule automatic token refresh
    this.scheduleTokenRefresh(session.expires_in);
    
    // Clear state
    sessionStorage.removeItem('oauth_state');
    
    return session;
  }

  // Save session tokens securely
  private saveSession(session: UserSession): void {
    // Store access token with expiry
    const expiresAt = new Date(Date.now() + session.expires_in * 1000);
    
    // Use appropriate cookie settings based on environment
    const isProduction = window.location.protocol === 'https:';
    
    Cookies.set('access_token', session.access_token, { 
      expires: expiresAt,
      secure: isProduction, // Only use secure in production
      sameSite: isProduction ? 'strict' : 'lax', // Use lax for development
      path: '/' // Ensure cookie is available site-wide
    });
    
    // Store refresh token for 30 days
    Cookies.set('refresh_token', session.refresh_token, { 
      expires: 30,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/'
    });
    
    // Store user data in localStorage with error handling
    try {
      localStorage.setItem('user_data', JSON.stringify(session.user));
      localStorage.setItem('auth_timestamp', Date.now().toString());
    } catch (e) {
      console.error('Failed to save user data to localStorage:', e);
    }
  }

  // Get current session
  getSession(): UserSession | null {
    try {
      const accessToken = Cookies.get('access_token');
      const refreshToken = Cookies.get('refresh_token');
      const userData = localStorage.getItem('user_data');

      // Debug logging for troubleshooting
      if (!accessToken) console.debug('No access token found');
      if (!refreshToken) console.debug('No refresh token found');
      if (!userData) console.debug('No user data found');

      if (!accessToken || !refreshToken || !userData) {
        return null;
      }

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

  // Refresh access token
  async refreshToken(): Promise<UserSession | null> {
    const refreshToken = Cookies.get('refresh_token');
    if (!refreshToken) return null;

    try {
      const response = await fetch(\`\${this.config.parentAppUrl}/api/auth/child-app/token\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          app_id: this.config.appId
        })
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const session = await response.json();
      this.saveSession(session);
      this.scheduleTokenRefresh(session.expires_in);
      
      return session;
    } catch (error) {
      // If refresh fails, clear session and redirect to login
      this.clearSession();
      return null;
    }
  }

  // Schedule automatic token refresh
  private scheduleTokenRefresh(expiresIn: number): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    // Refresh 5 minutes before expiry
    const refreshIn = (expiresIn - 300) * 1000;
    
    this.refreshTimer = setTimeout(() => {
      this.refreshToken();
    }, refreshIn);
  }

  // Logout user - IMPORTANT: Only clears child app session, NOT parent session
  async logout(redirectToParent: boolean = false): Promise<void> {
    try {
      // Call child app logout endpoint (preserves parent session)
      const response = await fetch(\`\${this.config.parentAppUrl}/api/auth/child-app/logout\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          app_id: this.config.appId,
          session_id: this.getSession()?.session_id,
          access_token: this.getSession()?.access_token,
          redirect_uri: redirectToParent ? this.config.parentAppUrl : window.location.origin
        })
      });

      // Clear local session data
      this.clearSession();

      if (redirectToParent && response.ok) {
        const data = await response.json();
        if (data.redirect_uri) {
          window.location.href = data.redirect_uri;
        }
      } else {
        // Redirect to child app login page
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Even if logout fails, clear local state
      this.clearSession();
      window.location.href = '/login';
    }
  }

  // Clear session data
  private clearSession(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    
    Cookies.remove('access_token');
    Cookies.remove('refresh_token');
    localStorage.removeItem('user_data');
    sessionStorage.clear();
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.getSession();
  }

  // Get current user
  getUser(): any {
    const session = this.getSession();
    return session?.user || null;
  }

  // Get auth headers for API calls
  getAuthHeaders(): Record<string, string> {
    const session = this.getSession();
    if (!session) return {};

    return {
      'Authorization': \`Bearer \${session.access_token}\`,
      'X-App-ID': this.config.appId
    };
  }

  // Generate random state for CSRF protection
  private generateState(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}

export default ParentAuthService.getInstance();`;

  // Auth Context code
  const authContextCode = `// lib/auth/auth-context.tsx
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
    console.log('AuthContext: Initializing auth...');
    
    const initAuth = async () => {
      // First check for OAuth callback parameters
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');
      const error = params.get('error');
      
      console.log('Checking for callback code:', !!code);
      
      if (error) {
        console.error('OAuth error:', params.get('error_description'));
        setLoading(false);
        return;
      }
      
      if (code && state) {
        // Handle OAuth callback
        try {
          console.log('Processing OAuth callback...');
          const session = await parentAuthService.handleCallback(code, state);
          console.log('OAuth callback successful, user:', session.user.email);
          setUser(session.user);
          
          // Clean URL after successful authentication
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error) {
          console.error('Auth callback failed:', error);
        }
      } else {
        // Check for existing session
        const session = parentAuthService.getSession();
        if (session) {
          console.log('Found existing session for user:', session.user.email);
          setUser(session.user);
        } else {
          console.log('No stored auth data found');
        }
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
    if (session) {
      setUser(session.user);
    }
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
}`;

  // Protected Route component
  const protectedRouteCode = `// components/protected-route.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: string[];
  fallbackUrl?: string;
}

export function ProtectedRoute({ 
  children, 
  requiredRoles = [],
  fallbackUrl = '/login'
}: ProtectedRouteProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push(fallbackUrl);
    }

    if (!loading && isAuthenticated && requiredRoles.length > 0) {
      if (!requiredRoles.includes(user?.role || '')) {
        router.push('/unauthorized');
      }
    }
  }, [loading, isAuthenticated, user, requiredRoles, fallbackUrl, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (requiredRoles.length > 0 && !requiredRoles.includes(user?.role || '')) {
    return null;
  }

  return <>{children}</>;
}`;

  // Environment variables
  const envExample = `# .env.local
# MyJKKN Parent App Configuration
NEXT_PUBLIC_PARENT_APP_URL=https://my.jkkn.ac.in
NEXT_PUBLIC_APP_ID=your_app_id_here

# Development redirect URI
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/auth/callback

# Production redirect URI (uncomment for production):
# NEXT_PUBLIC_REDIRECT_URI=https://your-app.com/auth/callback

# Optional: Google OAuth client ID for One Tap (if using)
# NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id

# Optional: Enable debug logging
# NEXT_PUBLIC_AUTH_DEBUG=true`;

  // Layout integration
  const layoutCode = `// app/layout.tsx
import { AuthProvider } from '@/lib/auth/auth-context';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}`;

  // Page implementation example
  const pageImplementation = `// app/page.tsx
'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { ProtectedRoute } from '@/components/protected-route';

export default function HomePage() {
  const { user, isAuthenticated, login, logout } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-2xl font-bold mb-4">Welcome to Our Application</h1>
        <p className="text-gray-600 mb-8">Please login to continue</p>
        <button 
          onClick={login}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Login with MyJKKN
        </button>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">Dashboard</h1>
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-2">
              Welcome, {user?.full_name}!
            </h2>
            <p className="text-gray-600 mb-4">
              Email: {user?.email}
            </p>
            <p className="text-gray-600 mb-4">
              Role: {user?.role}
            </p>
            <button 
              onClick={logout}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}`;

  // Package.json dependencies
  const packageJsonDeps = `{
  "dependencies": {
    "js-cookie": "^3.0.5",
    "@types/js-cookie": "^3.0.6",
    "next": "^14.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "typescript": "^5.0.0"
  }
}`;

  // OAuth flow endpoints
  const oauthEndpoints = `# OAuth 2.0 Endpoints

## Authorization Endpoint (Consent Page)
GET https://my.jkkn.ac.in/auth/child-app/consent
Parameters:
- response_type=code (required)
- client_id={your_app_id} (required)
- app_id={your_app_id} (required)
- redirect_uri={your_callback_url} (required)
- scope=read write profile (optional)
- state={random_string} (recommended for CSRF protection)

## Token Exchange Endpoint
POST https://my.jkkn.ac.in/api/auth/child-app/token
Headers:
- Content-Type: application/json
Body:
{
  "grant_type": "authorization_code",
  "code": "{auth_code}",
  "app_id": "{your_app_id}",
  "redirect_uri": "{your_callback_url}"
}

## Token Refresh Endpoint
POST https://my.jkkn.ac.in/api/auth/child-app/token
Headers:
- Content-Type: application/json
Body:
{
  "grant_type": "refresh_token",
  "refresh_token": "{refresh_token}",
  "app_id": "{your_app_id}"
}

## Logout Endpoint (Child App Session Only)
POST https://my.jkkn.ac.in/api/auth/child-app/logout
Headers:
- Content-Type: application/json
Body:
{
  "app_id": "{your_app_id}",
  "session_id": "{session_id}", (optional)
  "access_token": "{access_token}", (optional)
  "redirect_uri": "{your_logout_redirect_url}" (optional)
}

Note: This endpoint only clears the child app session. 
The parent app session remains active for seamless re-authentication.`;

  // Test endpoints
  const testEndpoints = `# Test Your Integration

## 1. Test Authorization URL
Open this in your browser:
https://my.jkkn.ac.in/auth/child-app/consent?response_type=code&app_id=YOUR_APP_ID&redirect_uri=http://localhost:3000/auth/callback&scope=read write profile&state=test123

## 2. Test Token Exchange
curl -X POST https://my.jkkn.ac.in/api/auth/child-app/token \\
  -H "Content-Type: application/json" \\
  -d '{
    "grant_type": "authorization_code",
    "code": "TEST_AUTH_CODE",
    "app_id": "YOUR_APP_ID",
    "redirect_uri": "http://localhost:3000/auth/callback"
  }'

## 3. Test Token Refresh
curl -X POST https://my.jkkn.ac.in/api/auth/child-app/token \\
  -H "Content-Type: application/json" \\
  -d '{
    "grant_type": "refresh_token",
    "refresh_token": "YOUR_REFRESH_TOKEN",
    "app_id": "YOUR_APP_ID"
  }'`;

  return (
    <div className='space-y-8'>
      {/* Header */}
      <div className='space-y-4'>
        <div className='flex items-center gap-3'>
          <GitBranch className='h-8 w-8 text-primary' />
          <h1 className='text-3xl font-bold'>
            Complete Child App Integration Guide
          </h1>
        </div>
        <p className='text-muted-foreground'>
          Step-by-step guide to integrate your application with MyJKKN
          authentication system using OAuth 2.0 flow
        </p>
      </div>

      {/* Important Prerequisites */}
      <Alert className='border-blue-200 bg-blue-50 dark:bg-blue-950/20'>
        <Info className='h-4 w-4 text-blue-600' />
        <AlertDescription>
          <strong>Prerequisites:</strong> Before starting, ensure you have:
          <ul className='mt-2 space-y-1 text-sm'>
            <li>• Your App ID from MyJKKN admin panel</li>
            <li>• Your application registered in MyJKKN</li>
            <li>• Redirect URIs configured in MyJKKN</li>
            <li>• Next.js 14+ project with TypeScript</li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* Implementation Tabs */}
      <Tabs defaultValue='overview' className='space-y-4'>
        <TabsList className='grid w-full grid-cols-9'>
          <TabsTrigger value='overview'>Overview</TabsTrigger>
          <TabsTrigger value='quickstart'>Quick Start</TabsTrigger>
          <TabsTrigger value='implementation'>Code</TabsTrigger>
          <TabsTrigger value='permissions'>Permissions</TabsTrigger>
          <TabsTrigger value='supabase'>Supabase</TabsTrigger>
          <TabsTrigger value='endpoints'>Endpoints</TabsTrigger>
          <TabsTrigger value='testing'>Testing</TabsTrigger>
          <TabsTrigger value='troubleshoot'>Debug</TabsTrigger>
          <TabsTrigger value='reference'>Reference</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value='overview' className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Globe className='h-5 w-5' />
                How MyJKKN OAuth Integration Works
              </CardTitle>
              <CardDescription>
                Understanding the authentication flow
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-6'>
              {/* OAuth Flow Diagram */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>Authentication Flow</h3>
                <div className='bg-muted p-6 rounded-lg space-y-4'>
                  <div className='flex items-center gap-4'>
                    <Badge className='w-8'>1</Badge>
                    <div className='flex-1'>
                      <p className='font-medium'>
                        User clicks &quot;Login with MyJKKN&quot;
                      </p>
                      <p className='text-sm text-muted-foreground'>
                        Your app redirects to MyJKKN authorization endpoint
                      </p>
                    </div>
                  </div>
                  <ArrowRight className='h-4 w-4 mx-auto text-muted-foreground' />
                  <div className='flex items-center gap-4'>
                    <Badge className='w-8'>2</Badge>
                    <div className='flex-1'>
                      <p className='font-medium'>
                        User authenticates on MyJKKN
                      </p>
                      <p className='text-sm text-muted-foreground'>
                        User logs in with Google OAuth via MyJKKN
                      </p>
                    </div>
                  </div>
                  <ArrowRight className='h-4 w-4 mx-auto text-muted-foreground' />
                  <div className='flex items-center gap-4'>
                    <Badge className='w-8'>3</Badge>
                    <div className='flex-1'>
                      <p className='font-medium'>User grants permission</p>
                      <p className='text-sm text-muted-foreground'>
                        MyJKKN shows consent screen for your app
                      </p>
                    </div>
                  </div>
                  <ArrowRight className='h-4 w-4 mx-auto text-muted-foreground' />
                  <div className='flex items-center gap-4'>
                    <Badge className='w-8'>4</Badge>
                    <div className='flex-1'>
                      <p className='font-medium'>
                        Redirect with authorization code
                      </p>
                      <p className='text-sm text-muted-foreground'>
                        MyJKKN redirects back to your app with code
                      </p>
                    </div>
                  </div>
                  <ArrowRight className='h-4 w-4 mx-auto text-muted-foreground' />
                  <div className='flex items-center gap-4'>
                    <Badge className='w-8'>5</Badge>
                    <div className='flex-1'>
                      <p className='font-medium'>Exchange code for tokens</p>
                      <p className='text-sm text-muted-foreground'>
                        Your app exchanges code for access/refresh tokens
                      </p>
                    </div>
                  </div>
                  <ArrowRight className='h-4 w-4 mx-auto text-muted-foreground' />
                  <div className='flex items-center gap-4'>
                    <Badge className='w-8'>6</Badge>
                    <div className='flex-1'>
                      <p className='font-medium'>User is authenticated</p>
                      <p className='text-sm text-muted-foreground'>
                        Your app can now access user data and make API calls
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Key Features */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>Key Features</h3>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div className='flex items-start gap-3'>
                    <Shield className='h-5 w-5 text-green-600 mt-0.5' />
                    <div>
                      <div className='font-medium'>Secure OAuth 2.0</div>
                      <div className='text-sm text-muted-foreground'>
                        Industry-standard authorization flow
                      </div>
                    </div>
                  </div>
                  <div className='flex items-start gap-3'>
                    <Key className='h-5 w-5 text-green-600 mt-0.5' />
                    <div>
                      <div className='font-medium'>JWT Tokens</div>
                      <div className='text-sm text-muted-foreground'>
                        Secure token-based authentication
                      </div>
                    </div>
                  </div>
                  <div className='flex items-start gap-3'>
                    <Database className='h-5 w-5 text-green-600 mt-0.5' />
                    <div>
                      <div className='font-medium'>Centralized Users</div>
                      <div className='text-sm text-muted-foreground'>
                        All user data managed in MyJKKN
                      </div>
                    </div>
                  </div>
                  <div className='flex items-start gap-3'>
                    <Settings className='h-5 w-5 text-green-600 mt-0.5' />
                    <div>
                      <div className='font-medium'>Role-Based Access</div>
                      <div className='text-sm text-muted-foreground'>
                        Support for different user roles
                      </div>
                    </div>
                  </div>
                  <div className='flex items-start gap-3'>
                    <Sparkles className='h-5 w-5 text-green-600 mt-0.5' />
                    <div>
                      <div className='font-medium'>Seamless Re-authentication</div>
                      <div className='text-sm text-muted-foreground'>
                        Parent session preserved after logout
                      </div>
                    </div>
                  </div>
                  <div className='flex items-start gap-3'>
                    <CheckCircle className='h-5 w-5 text-green-600 mt-0.5' />
                    <div>
                      <div className='font-medium'>Auto-Consent</div>
                      <div className='text-sm text-muted-foreground'>
                        Skip consent for recently authorized apps (30 days)
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Important Implementation Notes */}
              <Alert className='border-orange-200 bg-orange-50 dark:bg-orange-950/20'>
                <AlertCircle className='h-4 w-4 text-orange-600' />
                <AlertDescription>
                  <strong>Critical Implementation Note:</strong> The logout function must ONLY clear 
                  the child app session, NOT the parent app session. This prevents the double 
                  authentication issue and enables seamless re-authentication.
                </AlertDescription>
              </Alert>

              {/* Security Notes */}
              <Alert>
                <Lock className='h-4 w-4' />
                <AlertDescription>
                  <strong>Security:</strong> All tokens are encrypted, have
                  expiration times, and can be revoked. Always use HTTPS in
                  production and implement CSRF protection with state parameter.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quick Start Tab */}
        <TabsContent value='quickstart' className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Zap className='h-5 w-5' />
                Quick Start Guide
              </CardTitle>
              <CardDescription>
                Get up and running in 10 minutes
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-6'>
              {/* Step 1: Install Dependencies */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold flex items-center gap-2'>
                  <Badge>Step 1</Badge>
                  Install Required Dependencies
                </h3>
                <CodeBlock
                  code='npm install js-cookie @types/js-cookie'
                  language='bash'
                  id='install-deps'
                />
                <Alert>
                  <Info className='h-4 w-4' />
                  <AlertDescription>
                    These packages handle secure cookie management for tokens
                  </AlertDescription>
                </Alert>
              </div>

              {/* Step 2: Environment Variables */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold flex items-center gap-2'>
                  <Badge>Step 2</Badge>
                  Configure Environment Variables
                </h3>
                <CodeBlock
                  code={envExample}
                  language='bash'
                  title='.env.local'
                  id='env-vars'
                />
                <Alert className='border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20'>
                  <AlertCircle className='h-4 w-4 text-yellow-600' />
                  <AlertDescription>
                    <strong>Important:</strong> Get your APP_ID from MyJKKN
                    admin panel. The redirect URI must match exactly with
                    what&apos;s configured in MyJKKN.
                  </AlertDescription>
                </Alert>
              </div>

              {/* Step 3: Create File Structure */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold flex items-center gap-2'>
                  <Badge>Step 3</Badge>
                  Create Required Files
                </h3>
                <div className='bg-muted p-4 rounded-lg'>
                  <p className='text-sm font-medium mb-3'>
                    Create these files in your project:
                  </p>
                  <div className='font-mono text-sm space-y-2'>
                    <div className='flex items-center gap-2'>
                      <FileCode className='h-4 w-4' />
                      <span>lib/auth/parent-auth-service.ts</span>
                    </div>
                    <div className='flex items-center gap-2'>
                      <FileCode className='h-4 w-4' />
                      <span>lib/auth/auth-context.tsx</span>
                    </div>
                    <div className='flex items-center gap-2'>
                      <FileCode className='h-4 w-4' />
                      <span>components/protected-route.tsx</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 4: Add AuthProvider */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold flex items-center gap-2'>
                  <Badge>Step 4</Badge>
                  Wrap Your App with AuthProvider
                </h3>
                <CodeBlock
                  code={layoutCode}
                  language='typescript'
                  title='app/layout.tsx'
                  id='layout-integration'
                />
              </div>

              {/* Step 5: Implement Login */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold flex items-center gap-2'>
                  <Badge>Step 5</Badge>
                  Implement Login Page
                </h3>
                <CodeBlock
                  code={pageImplementation}
                  language='typescript'
                  title='app/page.tsx'
                  id='page-implementation'
                />
              </div>

              {/* Success Message */}
              <Alert className='border-green-200 bg-green-50 dark:bg-green-950/20'>
                <CheckCircle className='h-4 w-4 text-green-600' />
                <AlertDescription>
                  <strong>Setup Complete!</strong> Your app now uses MyJKKN
                  authentication. Users will login through MyJKKN and be
                  redirected back to your app.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Implementation Tab */}
        <TabsContent value='implementation' className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle>Complete Implementation Code</CardTitle>
              <CardDescription>
                Copy these files to your project for full integration
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-6'>
              {/* Authentication Service */}
              <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <h3 className='text-lg font-semibold'>
                    Authentication Service
                  </h3>
                  <Badge variant='outline'>Core Service</Badge>
                </div>
                <Alert>
                  <FileCode className='h-4 w-4' />
                  <AlertDescription>
                    This service handles OAuth flow, token management, and
                    session persistence
                  </AlertDescription>
                </Alert>
                <CodeBlock
                  code={parentAuthServiceCode}
                  language='typescript'
                  title='lib/auth/parent-auth-service.ts'
                  id='auth-service'
                />
              </div>

              {/* Auth Context */}
              <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <h3 className='text-lg font-semibold'>React Auth Context</h3>
                  <Badge variant='outline'>State Management</Badge>
                </div>
                <Alert>
                  <FileCode className='h-4 w-4' />
                  <AlertDescription>
                    Provides authentication state and methods throughout your
                    app
                  </AlertDescription>
                </Alert>
                <CodeBlock
                  code={authContextCode}
                  language='typescript'
                  title='lib/auth/auth-context.tsx'
                  id='auth-context'
                />
              </div>

              {/* Protected Route */}
              <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <h3 className='text-lg font-semibold'>
                    Protected Route Component
                  </h3>
                  <Badge variant='outline'>Route Guard</Badge>
                </div>
                <Alert>
                  <FileCode className='h-4 w-4' />
                  <AlertDescription>
                    Protects pages that require authentication
                  </AlertDescription>
                </Alert>
                <CodeBlock
                  code={protectedRouteCode}
                  language='typescript'
                  title='components/protected-route.tsx'
                  id='protected-route'
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Permissions Tab */}
        <TabsContent value='permissions' className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Shield className='h-5 w-5' />
                Role-Based Permissions Implementation
              </CardTitle>
              <CardDescription>
                How to implement role-based access control using parent app user
                roles
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-6'>
              {/* Understanding User Roles */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  Understanding User Roles from Parent App
                </h3>
                <Alert>
                  <Info className='h-4 w-4' />
                  <AlertDescription>
                    The parent app (MyJKKN) provides user roles through the
                    profiles table. Child apps receive these roles in the JWT
                    token and can use them for access control.
                  </AlertDescription>
                </Alert>
                <CodeBlock
                  code={`// User object received from parent app authentication
{
  "id": "uuid",
  "email": "user@example.com",
  "full_name": "John Doe",
  "role": "student", // Role from profiles table
  "institution_id": "uuid",
  "is_super_admin": false,
  "permissions": {
    // Custom permissions for this child app
    "can_view_reports": true,
    "can_edit_content": false,
    "can_manage_users": false
  }
}`}
                  language='json'
                  title='User Data Structure'
                  id='user-data-structure'
                />
              </div>

              {/* Available Roles */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  Available Roles from Parent App
                </h3>
                <div className='grid gap-3'>
                  <div className='p-3 border rounded-lg'>
                    <div className='font-semibold mb-2'>Standard Roles:</div>
                    <ul className='text-sm space-y-1 list-disc list-inside'>
                      <li>
                        <code>super_admin</code> - Full system access
                      </li>
                      <li>
                        <code>admin</code> - Institution-level admin
                      </li>
                      <li>
                        <code>faculty</code> - Teaching staff
                      </li>
                      <li>
                        <code>student</code> - Student users
                      </li>
                      <li>
                        <code>parent</code> - Parent/guardian access
                      </li>
                      <li>
                        <code>staff</code> - Non-teaching staff
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Permission Service Implementation */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  Permission Service Implementation
                </h3>
                <CodeBlock
                  code={`// lib/auth/permission-service.ts
export type UserRole = 'super_admin' | 'admin' | 'faculty' | 'student' | 'parent' | 'staff';

export interface Permission {
  resource: string;
  action: string;
}

export class PermissionService {
  private static instance: PermissionService;
  
  // Define role-based permissions for your child app
  private rolePermissions: Record<UserRole, Permission[]> = {
    super_admin: [
      { resource: '*', action: '*' } // Full access
    ],
    admin: [
      { resource: 'users', action: 'read' },
      { resource: 'users', action: 'write' },
      { resource: 'reports', action: 'read' },
      { resource: 'reports', action: 'write' },
      { resource: 'settings', action: 'read' },
      { resource: 'settings', action: 'write' },
      { resource: 'content', action: '*' }
    ],
    faculty: [
      { resource: 'students', action: 'read' },
      { resource: 'grades', action: 'write' },
      { resource: 'attendance', action: 'write' },
      { resource: 'reports', action: 'read' },
      { resource: 'content', action: 'read' },
      { resource: 'content', action: 'write' }
    ],
    student: [
      { resource: 'profile', action: 'read' },
      { resource: 'profile', action: 'write' },
      { resource: 'grades', action: 'read' },
      { resource: 'attendance', action: 'read' },
      { resource: 'content', action: 'read' }
    ],
    parent: [
      { resource: 'student_profile', action: 'read' },
      { resource: 'grades', action: 'read' },
      { resource: 'attendance', action: 'read' },
      { resource: 'fees', action: 'read' }
    ],
    staff: [
      { resource: 'reports', action: 'read' },
      { resource: 'content', action: 'read' }
    ]
  };

  static getInstance(): PermissionService {
    if (!PermissionService.instance) {
      PermissionService.instance = new PermissionService();
    }
    return PermissionService.instance;
  }

  // Check if user has permission for a specific action on a resource
  hasPermission(
    userRole: UserRole | undefined,
    resource: string,
    action: string
  ): boolean {
    if (!userRole) return false;
    
    const permissions = this.rolePermissions[userRole] || [];
    
    return permissions.some(perm => {
      const resourceMatch = perm.resource === '*' || perm.resource === resource;
      const actionMatch = perm.action === '*' || perm.action === action;
      return resourceMatch && actionMatch;
    });
  }

  // Check if user has any of the required roles
  hasRole(userRole: UserRole | undefined, requiredRoles: UserRole[]): boolean {
    if (!userRole) return false;
    return requiredRoles.includes(userRole);
  }

  // Get all permissions for a role
  getRolePermissions(role: UserRole): Permission[] {
    return this.rolePermissions[role] || [];
  }

  // Check multiple permissions at once
  hasAllPermissions(
    userRole: UserRole | undefined,
    permissions: Permission[]
  ): boolean {
    return permissions.every(p => 
      this.hasPermission(userRole, p.resource, p.action)
    );
  }

  // Check if user has at least one of the permissions
  hasAnyPermission(
    userRole: UserRole | undefined,
    permissions: Permission[]
  ): boolean {
    return permissions.some(p => 
      this.hasPermission(userRole, p.resource, p.action)
    );
  }
}

export default PermissionService.getInstance();`}
                  language='typescript'
                  title='lib/auth/permission-service.ts'
                  id='permission-service'
                />
              </div>

              {/* Permission Hook */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  React Hook for Permissions
                </h3>
                <CodeBlock
                  code={`// hooks/use-permissions.ts
import { useAuth } from '@/lib/auth/auth-context';
import permissionService, { UserRole, Permission } from '@/lib/auth/permission-service';

export function usePermissions() {
  const { user } = useAuth();
  const userRole = user?.role as UserRole | undefined;

  return {
    // Check single permission
    can: (resource: string, action: string) => 
      permissionService.hasPermission(userRole, resource, action),
    
    // Check if user has role
    hasRole: (roles: UserRole | UserRole[]) => {
      const roleArray = Array.isArray(roles) ? roles : [roles];
      return permissionService.hasRole(userRole, roleArray);
    },
    
    // Check multiple permissions
    canAll: (permissions: Permission[]) =>
      permissionService.hasAllPermissions(userRole, permissions),
    
    // Check any permission
    canAny: (permissions: Permission[]) =>
      permissionService.hasAnyPermission(userRole, permissions),
    
    // Get user role
    role: userRole,
    
    // Check if super admin
    isSuperAdmin: user?.is_super_admin || userRole === 'super_admin',
    
    // Get all permissions for current user
    permissions: userRole ? permissionService.getRolePermissions(userRole) : []
  };
}`}
                  language='typescript'
                  title='hooks/use-permissions.ts'
                  id='use-permissions-hook'
                />
              </div>

              {/* Permission Guard Component */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  Permission Guard Component
                </h3>
                <CodeBlock
                  code={`// components/permission-guard.tsx
'use client';

import { ReactNode } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import { UserRole } from '@/lib/auth/permission-service';

interface PermissionGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
  resource?: string;
  action?: string;
  roles?: UserRole[];
  requireAll?: boolean;
}

export function PermissionGuard({
  children,
  fallback = null,
  resource,
  action,
  roles,
  requireAll = false
}: PermissionGuardProps) {
  const { can, hasRole } = usePermissions();

  // Check role-based access
  if (roles && roles.length > 0) {
    if (!hasRole(roles)) {
      return <>{fallback}</>;
    }
  }

  // Check resource-action based access
  if (resource && action) {
    if (!can(resource, action)) {
      return <>{fallback}</>;
    }
  }

  return <>{children}</>;
}

// Convenience component for showing/hiding UI elements
export function Can({
  children,
  resource,
  action,
  fallback = null
}: {
  children: ReactNode;
  resource: string;
  action: string;
  fallback?: ReactNode;
}) {
  const { can } = usePermissions();
  
  if (!can(resource, action)) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
}`}
                  language='typescript'
                  title='components/permission-guard.tsx'
                  id='permission-guard'
                />
              </div>

              {/* Usage Examples */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  Usage Examples in Components
                </h3>
                <CodeBlock
                  code={`// Example: Dashboard with role-based features
'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { usePermissions } from '@/hooks/use-permissions';
import { PermissionGuard, Can } from '@/components/permission-guard';

export default function Dashboard() {
  const { user } = useAuth();
  const { can, hasRole, isSuperAdmin } = usePermissions();

  return (
    <div className="p-8">
      <h1>Welcome, {user?.full_name}</h1>
      
      {/* Show admin panel only for admins */}
      <PermissionGuard roles={['admin', 'super_admin']}>
        <AdminPanel />
      </PermissionGuard>

      {/* Show edit button only if user can edit content */}
      <Can resource="content" action="write">
        <button className="btn-primary">Edit Content</button>
      </Can>

      {/* Conditional rendering based on permissions */}
      {can('reports', 'read') && (
        <ReportsSection />
      )}

      {/* Different UI for different roles */}
      {hasRole('student') && <StudentDashboard />}
      {hasRole('faculty') && <FacultyDashboard />}
      {hasRole('admin') && <AdminDashboard />}

      {/* Super admin special features */}
      {isSuperAdmin && (
        <SuperAdminTools />
      )}

      {/* Permission guard with fallback */}
      <PermissionGuard 
        resource="settings" 
        action="write"
        fallback={<p>You don't have permission to access settings.</p>}
      >
        <SettingsPanel />
      </PermissionGuard>
    </div>
  );
}`}
                  language='typescript'
                  title='Dashboard Component Example'
                  id='dashboard-example'
                />
              </div>

              {/* API Route Protection */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>Protecting API Routes</h3>
                <CodeBlock
                  code={`// app/api/admin/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import parentAuthService from '@/lib/auth/parent-auth-service';
import permissionService from '@/lib/auth/permission-service';

export async function GET(request: NextRequest) {
  // Get token from Authorization header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const token = authHeader.substring(7);
  
  // Validate token with parent app
  const response = await fetch('https://my.jkkn.ac.in/api/auth/child-app/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.CHILD_APP_API_KEY!
    },
    body: JSON.stringify({
      token,
      child_app_id: process.env.NEXT_PUBLIC_APP_ID
    })
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: 'Invalid token' },
      { status: 401 }
    );
  }

  const { valid, user } = await response.json();
  
  if (!valid) {
    return NextResponse.json(
      { error: 'Token validation failed' },
      { status: 401 }
    );
  }

  // Check permissions
  if (!permissionService.hasPermission(user.role, 'users', 'read')) {
    return NextResponse.json(
      { error: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  // User has permission, proceed with the request
  const users = await fetchUsers(); // Your logic here
  
  return NextResponse.json({ users });
}`}
                  language='typescript'
                  title='API Route with Permission Check'
                  id='api-route-protection'
                />
              </div>

              {/* Middleware for Route Protection */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  Middleware for Global Protection
                </h3>
                <CodeBlock
                  code={`// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Define protected routes and their required roles
const protectedRoutes = {
  '/admin': ['admin', 'super_admin'],
  '/faculty': ['faculty', 'admin', 'super_admin'],
  '/reports': ['faculty', 'admin', 'super_admin', 'staff'],
  '/settings': ['admin', 'super_admin']
};

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // Check if route needs protection
  const routeConfig = Object.entries(protectedRoutes).find(([path]) =>
    pathname.startsWith(path)
  );
  
  if (!routeConfig) {
    return NextResponse.next();
  }
  
  const [, requiredRoles] = routeConfig;
  
  // Get user data from cookie or token
  const token = request.cookies.get('access_token')?.value;
  
  if (!token) {
    // Redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  // Validate token and get user role
  // In production, you might want to cache this validation
  const user = await validateTokenAndGetUser(token);
  
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  // Check if user has required role
  if (!requiredRoles.includes(user.role)) {
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/faculty/:path*', '/reports/:path*', '/settings/:path*']
};`}
                  language='typescript'
                  title='middleware.ts'
                  id='middleware-protection'
                />
              </div>

              {/* Custom Permissions */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  Handling Custom App-Specific Permissions
                </h3>
                <Alert>
                  <Info className='h-4 w-4' />
                  <AlertDescription>
                    While roles come from the parent app, child apps can define
                    additional permissions stored in their own database.
                  </AlertDescription>
                </Alert>
                <CodeBlock
                  code={`// Extended permission service with custom permissions
class ExtendedPermissionService extends PermissionService {
  private customPermissions: Map<string, Set<string>> = new Map();
  
  // Load custom permissions from your database
  async loadCustomPermissions(userId: string) {
    // Fetch from your child app's database
    const response = await fetch(\`/api/permissions/\${userId}\`);
    const permissions = await response.json();
    
    // Store custom permissions
    this.customPermissions.set(userId, new Set(permissions));
  }
  
  // Check custom permission
  hasCustomPermission(userId: string, permission: string): boolean {
    const userPermissions = this.customPermissions.get(userId);
    return userPermissions?.has(permission) || false;
  }
  
  // Override hasPermission to include custom permissions
  hasPermission(
    userRole: UserRole | undefined,
    resource: string,
    action: string,
    userId?: string
  ): boolean {
    // First check role-based permissions
    if (super.hasPermission(userRole, resource, action)) {
      return true;
    }
    
    // Then check custom permissions if userId provided
    if (userId) {
      const customPermKey = \`\${resource}:\${action}\`;
      return this.hasCustomPermission(userId, customPermKey);
    }
    
    return false;
  }
}`}
                  language='typescript'
                  title='Extended Permission Service'
                  id='extended-permissions'
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Supabase Tab */}
        <TabsContent value='supabase' className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Database className='h-5 w-5' />
                Supabase Integration for Child Apps
              </CardTitle>
              <CardDescription>
                How to set up Supabase in your child app to work with parent app
                authentication
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-6'>
              {/* Overview */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  Understanding the Architecture
                </h3>
                <Alert>
                  <Info className='h-4 w-4' />
                  <AlertDescription>
                    Your child app can have its own Supabase project for
                    app-specific data while using parent app authentication.
                    Users are authenticated via MyJKKN, and your Supabase RLS
                    policies use the parent app user IDs.
                  </AlertDescription>
                </Alert>
                <div className='bg-muted p-4 rounded-lg'>
                  <p className='text-sm font-medium mb-3'>
                    Architecture Overview:
                  </p>
                  <ul className='text-sm space-y-2'>
                    <li>
                      • <strong>Authentication:</strong> Handled by MyJKKN
                      parent app
                    </li>
                    <li>
                      • <strong>User Management:</strong> Users exist in parent
                      app&apos;s profiles table
                    </li>
                    <li>
                      • <strong>Child App Data:</strong> Stored in child
                      app&apos;s own Supabase project
                    </li>
                    <li>
                      • <strong>User Linking:</strong> Use parent app user IDs
                      as foreign keys
                    </li>
                    <li>
                      • <strong>RLS Policies:</strong> Based on parent app user
                      IDs from JWT
                    </li>
                  </ul>
                </div>
              </div>

              {/* Supabase Setup */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  Setting Up Supabase for Child App
                </h3>
                <CodeBlock
                  code={`# 1. Install Supabase client
npm install @supabase/supabase-js

# 2. Create your Supabase project at https://supabase.com

# 3. Add environment variables
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key # Server-side only`}
                  language='bash'
                  title='Installation'
                  id='supabase-install'
                />
              </div>

              {/* Supabase Client Setup */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  Supabase Client with Custom Auth
                </h3>
                <CodeBlock
                  code={`// lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js';
import parentAuthService from '@/lib/auth/parent-auth-service';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Create Supabase client with custom auth
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Disable Supabase's built-in auth
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  },
  global: {
    // Add parent app's JWT to all requests
    headers: {
      get Authorization() {
        const session = parentAuthService.getSession();
        return session ? \`Bearer \${session.access_token}\` : '';
      }
    }
  }
});

// Helper to get authenticated client
export function getAuthenticatedClient() {
  const session = parentAuthService.getSession();
  
  if (!session) {
    throw new Error('User not authenticated');
  }
  
  // Create client with user's token
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: \`Bearer \${session.access_token}\`,
        'X-User-ID': session.user.id,
        'X-User-Role': session.user.role
      }
    }
  });
}`}
                  language='typescript'
                  title='lib/supabase/client.ts'
                  id='supabase-client'
                />
              </div>

              {/* Database Schema */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  Database Schema for Child App
                </h3>
                <CodeBlock
                  code={`-- Create tables that reference parent app users
CREATE TABLE app_user_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL, -- Parent app user ID
  theme TEXT DEFAULT 'light',
  notifications_enabled BOOLEAN DEFAULT true,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Example: App-specific content table
CREATE TABLE app_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  author_id UUID NOT NULL, -- Parent app user ID
  institution_id UUID, -- From parent app
  visibility TEXT DEFAULT 'private',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Example: Activity logs
CREATE TABLE app_activity_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL, -- Parent app user ID
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_app_user_settings_user_id ON app_user_settings(user_id);
CREATE INDEX idx_app_content_author_id ON app_content(author_id);
CREATE INDEX idx_app_content_institution_id ON app_content(institution_id);
CREATE INDEX idx_app_activity_logs_user_id ON app_activity_logs(user_id);`}
                  language='sql'
                  title='Database Schema'
                  id='database-schema'
                />
              </div>

              {/* RLS Policies */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  Row Level Security (RLS) Policies
                </h3>
                <CodeBlock
                  code={`-- Enable RLS on all tables
ALTER TABLE app_user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_activity_logs ENABLE ROW LEVEL SECURITY;

-- Function to extract user ID from JWT (from parent app)
CREATE OR REPLACE FUNCTION auth.user_id() 
RETURNS UUID AS $$
BEGIN
  -- Extract user ID from JWT payload
  -- The JWT from parent app contains 'sub' field with user ID
  RETURN COALESCE(
    current_setting('request.jwt.claims', true)::json->>'sub',
    current_setting('request.headers', true)::json->>'x-user-id'
  )::UUID;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user role from JWT
CREATE OR REPLACE FUNCTION auth.user_role() 
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(
    current_setting('request.jwt.claims', true)::json->>'role',
    current_setting('request.headers', true)::json->>'x-user-role',
    'guest'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for app_user_settings
CREATE POLICY "Users can view own settings"
  ON app_user_settings FOR SELECT
  USING (user_id = auth.user_id());

CREATE POLICY "Users can update own settings"
  ON app_user_settings FOR UPDATE
  USING (user_id = auth.user_id());

CREATE POLICY "Users can insert own settings"
  ON app_user_settings FOR INSERT
  WITH CHECK (user_id = auth.user_id());

-- RLS Policies for app_content (role-based)
CREATE POLICY "Anyone can view public content"
  ON app_content FOR SELECT
  USING (visibility = 'public');

CREATE POLICY "Users can view own content"
  ON app_content FOR SELECT
  USING (author_id = auth.user_id());

CREATE POLICY "Users can view institution content"
  ON app_content FOR SELECT
  USING (
    visibility = 'institution' 
    AND institution_id = (
      SELECT institution_id 
      FROM app_user_settings 
      WHERE user_id = auth.user_id()
    )
  );

CREATE POLICY "Users can create content"
  ON app_content FOR INSERT
  WITH CHECK (author_id = auth.user_id());

CREATE POLICY "Users can update own content"
  ON app_content FOR UPDATE
  USING (author_id = auth.user_id());

CREATE POLICY "Admins can manage all content"
  ON app_content FOR ALL
  USING (auth.user_role() IN ('admin', 'super_admin'));

-- RLS Policies for activity logs
CREATE POLICY "Users can view own logs"
  ON app_activity_logs FOR SELECT
  USING (user_id = auth.user_id());

CREATE POLICY "System can insert logs"
  ON app_activity_logs FOR INSERT
  WITH CHECK (true); -- Allow through API with proper validation`}
                  language='sql'
                  title='RLS Policies'
                  id='rls-policies'
                />
              </div>

              {/* Data Service */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  Data Service Implementation
                </h3>
                <CodeBlock
                  code={`// lib/services/app-data-service.ts
import { getAuthenticatedClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';

export class AppDataService {
  // Get or create user settings
  async getUserSettings(userId: string) {
    const supabase = getAuthenticatedClient();
    
    // Try to get existing settings
    let { data, error } = await supabase
      .from('app_user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    // If no settings exist, create default ones
    if (error?.code === 'PGRST116') {
      const { data: newSettings, error: insertError } = await supabase
        .from('app_user_settings')
        .insert({
          user_id: userId,
          preferences: {}
        })
        .select()
        .single();
      
      if (insertError) throw insertError;
      return newSettings;
    }
    
    if (error) throw error;
    return data;
  }
  
  // Update user settings
  async updateUserSettings(userId: string, settings: any) {
    const supabase = getAuthenticatedClient();
    
    const { data, error } = await supabase
      .from('app_user_settings')
      .update({
        ...settings,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  // Create content with proper user association
  async createContent(content: {
    title: string;
    content: string;
    visibility: 'private' | 'institution' | 'public';
  }, userId: string, institutionId?: string) {
    const supabase = getAuthenticatedClient();
    
    const { data, error } = await supabase
      .from('app_content')
      .insert({
        ...content,
        author_id: userId,
        institution_id: institutionId
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  // Get content based on user permissions
  async getUserContent(userId: string, userRole: string) {
    const supabase = getAuthenticatedClient();
    
    // Build query based on role
    let query = supabase
      .from('app_content')
      .select('*');
    
    // Admins see everything
    if (userRole === 'admin' || userRole === 'super_admin') {
      // No additional filters needed
    } else {
      // Regular users see their own + public + institution content
      query = query.or(\`author_id.eq.\${userId},visibility.eq.public\`);
    }
    
    const { data, error } = await query
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  }
  
  // Log user activity
  async logActivity(
    userId: string,
    action: string,
    resourceType?: string,
    resourceId?: string,
    metadata?: any
  ) {
    const supabase = getAuthenticatedClient();
    
    const { error } = await supabase
      .from('app_activity_logs')
      .insert({
        user_id: userId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        metadata
      });
    
    if (error) console.error('Failed to log activity:', error);
  }
}

export default new AppDataService();`}
                  language='typescript'
                  title='lib/services/app-data-service.ts'
                  id='data-service'
                />
              </div>

              {/* React Query Integration */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  React Query Hooks for Data Fetching
                </h3>
                <CodeBlock
                  code={`// hooks/use-app-data.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/auth-context';
import appDataService from '@/lib/services/app-data-service';

// Hook to get user settings
export function useUserSettings() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['userSettings', user?.id],
    queryFn: () => appDataService.getUserSettings(user!.id),
    enabled: !!user?.id
  });
}

// Hook to update user settings
export function useUpdateSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (settings: any) => 
      appDataService.updateUserSettings(user!.id, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSettings', user?.id] });
    }
  });
}

// Hook to get user content
export function useUserContent() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['userContent', user?.id, user?.role],
    queryFn: () => appDataService.getUserContent(user!.id, user!.role),
    enabled: !!user?.id
  });
}

// Hook to create content
export function useCreateContent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (content: any) => 
      appDataService.createContent(
        content,
        user!.id,
        user!.institution_id
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userContent'] });
      
      // Log activity
      appDataService.logActivity(
        user!.id,
        'create_content',
        'content',
        undefined,
        { title: content.title }
      );
    }
  });
}`}
                  language='typescript'
                  title='hooks/use-app-data.ts'
                  id='react-query-hooks'
                />
              </div>

              {/* Realtime Subscriptions */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  Realtime Subscriptions
                </h3>
                <CodeBlock
                  code={`// hooks/use-realtime.ts
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { supabase } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

export function useRealtimeContent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  useEffect(() => {
    if (!user) return;
    
    // Subscribe to content changes
    const channel = supabase
      .channel('content-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_content',
          filter: \`author_id=eq.\${user.id}\`
        },
        (payload) => {
          console.log('Content changed:', payload);
          
          // Invalidate and refetch content
          queryClient.invalidateQueries({ 
            queryKey: ['userContent', user.id] 
          });
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);
}

// Subscribe to user settings changes
export function useRealtimeSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  useEffect(() => {
    if (!user) return;
    
    const channel = supabase
      .channel('settings-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'app_user_settings',
          filter: \`user_id=eq.\${user.id}\`
        },
        (payload) => {
          // Update local cache immediately
          queryClient.setQueryData(
            ['userSettings', user.id],
            payload.new
          );
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);
}`}
                  language='typescript'
                  title='hooks/use-realtime.ts'
                  id='realtime-subscriptions'
                />
              </div>

              {/* Complete Component Example */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  Complete Component Example
                </h3>
                <CodeBlock
                  code={`// app/dashboard/page.tsx
'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { usePermissions } from '@/hooks/use-permissions';
import { 
  useUserSettings, 
  useUpdateSettings,
  useUserContent,
  useCreateContent 
} from '@/hooks/use-app-data';
import { useRealtimeContent } from '@/hooks/use-realtime';
import { PermissionGuard } from '@/components/permission-guard';

export default function Dashboard() {
  const { user } = useAuth();
  const { can, hasRole } = usePermissions();
  
  // Fetch user settings
  const { data: settings, isLoading: settingsLoading } = useUserSettings();
  const updateSettings = useUpdateSettings();
  
  // Fetch user content
  const { data: content, isLoading: contentLoading } = useUserContent();
  const createContent = useCreateContent();
  
  // Enable realtime updates
  useRealtimeContent();
  
  if (settingsLoading || contentLoading) {
    return <div>Loading...</div>;
  }
  
  return (
    <div className="p-8">
      <h1>Welcome, {user?.full_name}</h1>
      <p>Role: {user?.role}</p>
      
      {/* User Settings Section */}
      <div className="mt-8">
        <h2>Settings</h2>
        <div>
          <label>
            Theme:
            <select 
              value={settings?.theme || 'light'}
              onChange={(e) => updateSettings.mutate({ theme: e.target.value })}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
      </div>
      
      {/* Content Section */}
      <div className="mt-8">
        <h2>Your Content</h2>
        
        {/* Only show create button if user has permission */}
        <PermissionGuard resource="content" action="write">
          <button
            onClick={() => {
              createContent.mutate({
                title: 'New Content',
                content: 'Content body',
                visibility: 'private'
              });
            }}
          >
            Create Content
          </button>
        </PermissionGuard>
        
        {/* Display content */}
        <div className="grid gap-4 mt-4">
          {content?.map((item) => (
            <div key={item.id} className="border p-4 rounded">
              <h3>{item.title}</h3>
              <p>{item.content}</p>
              <span className="text-sm text-gray-500">
                Visibility: {item.visibility}
              </span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Admin Section */}
      <PermissionGuard roles={['admin', 'super_admin']}>
        <div className="mt-8">
          <h2>Admin Tools</h2>
          <p>Only visible to admins</p>
        </div>
      </PermissionGuard>
    </div>
  );
}`}
                  language='typescript'
                  title='Complete Dashboard Example'
                  id='complete-dashboard'
                />
              </div>

              {/* Migration Guide */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  Migrating Existing Supabase Auth to Parent App Auth
                </h3>
                <Alert className='border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20'>
                  <AlertCircle className='h-4 w-4 text-yellow-600' />
                  <AlertDescription>
                    If you have an existing Supabase project with its own auth,
                    follow this migration guide to switch to parent app
                    authentication.
                  </AlertDescription>
                </Alert>
                <CodeBlock
                  code={`-- Migration SQL Script
-- 1. Add parent_user_id column to existing tables
ALTER TABLE your_existing_table 
ADD COLUMN parent_user_id UUID;

-- 2. Create mapping table for existing users
CREATE TABLE user_migration_map (
  old_user_id UUID REFERENCES auth.users(id),
  parent_user_id UUID NOT NULL,
  migrated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (old_user_id)
);

-- 3. Update RLS policies to use parent_user_id
-- Example: Update existing policy
DROP POLICY IF EXISTS "Users can view own data" ON your_table;
CREATE POLICY "Users can view own data" ON your_table
  FOR SELECT
  USING (
    parent_user_id = auth.user_id() 
    OR user_id = auth.uid() -- Keep backward compatibility during migration
  );

-- 4. After migration, remove old user_id columns
-- ALTER TABLE your_table DROP COLUMN user_id;`}
                  language='sql'
                  title='Migration Script'
                  id='migration-script'
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Endpoints Tab */}
        <TabsContent value='endpoints' className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Server className='h-5 w-5' />
                API Endpoints Reference
              </CardTitle>
              <CardDescription>
                All MyJKKN OAuth endpoints and their usage
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-6'>
              <CodeBlock
                code={oauthEndpoints}
                language='markdown'
                title='OAuth 2.0 Endpoints'
                id='oauth-endpoints'
              />

              {/* Response Formats */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>Response Formats</h3>

                {/* Success Response */}
                <div className='space-y-2'>
                  <p className='text-sm font-medium'>Token Exchange Success:</p>
                  <CodeBlock
                    code={`{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "read write profile",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "John Doe",
    "role": "student",
    "institution_id": "uuid"
  }
}`}
                    language='json'
                    id='success-response'
                  />
                </div>

                {/* Error Response */}
                <div className='space-y-2'>
                  <p className='text-sm font-medium'>Error Response:</p>
                  <CodeBlock
                    code={`{
  "error": "invalid_grant",
  "error_description": "Authorization code expired or invalid"
}`}
                    language='json'
                    id='error-response'
                  />
                </div>
              </div>

              {/* Logout Implementation */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold flex items-center gap-2'>
                  <LogOut className='h-5 w-5' />
                  Logout Implementation
                </h3>
                <CodeBlock
                  code={`// Simple logout redirect
window.location.href = 'https://my.jkkn.ac.in/logout?app_id=YOUR_APP_ID&redirect_uri=https://your-app.com';

// Or using the service
await parentAuthService.logout('https://your-app.com');`}
                  language='typescript'
                  id='logout-implementation'
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Testing Tab */}
        <TabsContent value='testing' className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Terminal className='h-5 w-5' />
                Testing Your Integration
              </CardTitle>
              <CardDescription>
                Verify everything is working correctly
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-6'>
              <CodeBlock
                code={testEndpoints}
                language='bash'
                title='Test Commands'
                id='test-endpoints'
              />

              {/* Testing Checklist */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  Comprehensive Testing Checklist
                </h3>
                <div className='space-y-4'>
                  <div>
                    <h4 className='font-medium mb-3'>🔧 Configuration</h4>
                    <div className='space-y-2'>
                      {[
                        'Environment variables are set correctly',
                        'App ID matches MyJKKN configuration',
                        'Redirect URI matches exactly (including protocol)',
                        'Google Client ID is set (if using Google One Tap)'
                      ].map((item, index) => (
                        <div key={index} className='flex items-center gap-3'>
                          <div className='h-4 w-4 rounded border border-gray-300' />
                          <span className='text-sm'>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className='font-medium mb-3'>🔐 Authentication Flow</h4>
                    <div className='space-y-2'>
                      {[
                        'Login button redirects to MyJKKN',
                        'After login, user returns to your app',
                        'User data is displayed correctly',
                        'Access token is stored in cookies/localStorage',
                        'Refresh token works before expiry',
                        'Logout clears all session data',
                        'Protected routes redirect when not authenticated'
                      ].map((item, index) => (
                        <div key={index} className='flex items-center gap-3'>
                          <div className='h-4 w-4 rounded border border-gray-300' />
                          <span className='text-sm'>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className='font-medium mb-3'>
                      👶 Child App Authentication
                    </h4>
                    <div className='space-y-2'>
                      {[
                        'Child app parameters are detected from URL',
                        'Child app auth cookie is set correctly',
                        'Google One Tap is disabled for child app auth',
                        'First login redirects to child app consent page',
                        'After authorization, user returns to child app',
                        'Child app receives authorization code',
                        'Token exchange works correctly',
                        'Child app can access user data'
                      ].map((item, index) => (
                        <div key={index} className='flex items-center gap-3'>
                          <div className='h-4 w-4 rounded border border-gray-300' />
                          <span className='text-sm'>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className='font-medium mb-3'>
                      🛡️ Security & Edge Cases
                    </h4>
                    <div className='space-y-2'>
                      {[
                        'State parameter is validated for CSRF protection',
                        'Invalid authorization codes are handled',
                        'Expired tokens trigger refresh flow',
                        'Network errors are handled gracefully',
                        'Concurrent login attempts work correctly',
                        'Browser back/forward navigation works',
                        'Session persists across browser tabs',
                        'Cookies work in development and production'
                      ].map((item, index) => (
                        <div key={index} className='flex items-center gap-3'>
                          <div className='h-4 w-4 rounded border border-gray-300' />
                          <span className='text-sm'>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Browser Console Tests */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>Browser Console Tests</h3>
                <CodeBlock
                  code={`// Check if user is authenticated
localStorage.getItem('user_data')

// Check all cookies
document.cookie

// Check specific child app auth cookie
document.cookie.split('; ').find(row => row.startsWith('child_app_auth='))

// Test auth service
const auth = await import('./lib/auth/parent-auth-service');
auth.default.isAuthenticated()
auth.default.getUser()

// Check current URL parameters
const params = new URLSearchParams(window.location.search);
console.log('App ID:', params.get('app_id'));
console.log('Redirect URI:', params.get('redirect_uri'));
console.log('Scope:', params.get('scope'));
console.log('State:', params.get('state'));

// Test child app parameter detection
const getChildAppAuth = () => {
  const params = new URLSearchParams(window.location.search);
  const appId = params.get('app_id');
  const redirectUri = params.get('redirect_uri');
  return appId && redirectUri ? { app_id: appId, redirect_uri: redirectUri } : null;
};
console.log('Child App Auth:', getChildAppAuth());`}
                  language='javascript'
                  title='Console Commands'
                  id='console-tests'
                />
              </div>

              {/* Real-time Debugging */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>Real-time Debugging</h3>
                <Alert>
                  <Info className='h-4 w-4' />
                  <AlertDescription>
                    <strong>Enable Debug Logging:</strong> Add console logging
                    to track the authentication flow:
                  </AlertDescription>
                </Alert>
                <CodeBlock
                  code={`// Add to your components for debugging
useEffect(() => {
  console.log('[Debug] Component mounted');
  console.log('[Debug] Child App Auth:', childAppAuth);
  console.log('[Debug] Current URL:', window.location.href);
  console.log('[Debug] Cookies:', document.cookie);
  
  // Track parameter changes
  const params = new URLSearchParams(window.location.search);
  console.log('[Debug] URL Parameters:', Object.fromEntries(params));
  
  return () => {
    console.log('[Debug] Component unmounting');
  };
}, [childAppAuth]);`}
                  language='typescript'
                  title='Debug Logging'
                  id='debug-logging'
                />
              </div>

              {/* Common Debug Scenarios */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  Common Debug Scenarios
                </h3>
                <div className='grid gap-3'>
                  <Alert className='border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20'>
                    <AlertCircle className='h-4 w-4 text-yellow-600' />
                    <AlertDescription>
                      <strong>Child App Auth Not Detected:</strong> Check
                      browser console for &quot;[Login Page] Setting child app
                      auth cookie&quot; message. If missing, URL parameters may
                      not be parsed correctly.
                    </AlertDescription>
                  </Alert>
                  <Alert className='border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20'>
                    <AlertCircle className='h-4 w-4 text-yellow-600' />
                    <AlertDescription>
                      <strong>Google One Tap Still Appears:</strong> Look for
                      &quot;[One Tap] Child app auth detected, skipping One Tap
                      initialization&quot; message. If missing, the component
                      may not be detecting parameters correctly.
                    </AlertDescription>
                  </Alert>
                  <Alert className='border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20'>
                    <AlertCircle className='h-4 w-4 text-yellow-600' />
                    <AlertDescription>
                      <strong>OAuth Callback Issues:</strong> Check for
                      &quot;[Auth Callback] Child app auth from state&quot; or
                      &quot;[Auth Callback] Parsed child app auth from
                      cookie&quot; messages in the callback page.
                    </AlertDescription>
                  </Alert>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Troubleshooting Tab */}
        <TabsContent value='troubleshoot' className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <AlertCircle className='h-5 w-5' />
                Troubleshooting Guide
              </CardTitle>
              <CardDescription>
                Common issues and their solutions
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              {/* Common Issues */}
              <div className='space-y-4'>
                {[
                  {
                    issue: 'Double Google Authentication After Logout',
                    cause: 'Logout clears parent app session',
                    solution:
                      'Use /api/auth/child-app/logout endpoint that only clears child app session, NOT parent session. Never call parent app main logout.'
                  },
                  {
                    issue: 'CORS Error on Consent Page',
                    cause: 'Using fetch() for cross-origin authorization',
                    solution:
                      'Use window.location.href for navigation instead of fetch() API calls to authorization endpoints'
                  },
                  {
                    issue: 'Lost Child App Context After Google OAuth',
                    cause: 'Google OAuth overwrites state parameter',
                    solution:
                      'Base64 encode state without padding and use URL-encoded cookies as fallback. Check both state and cookies in callback.'
                  },
                  {
                    issue: 'Redirect to Parent App Root Instead of Child App',
                    cause: 'Wrong authorization endpoint',
                    solution:
                      'Use /auth/child-app/consent endpoint, not /auth/authorize. Ensure middleware allows child app paths.'
                  },
                  {
                    issue: 'Invalid redirect URI',
                    cause: 'Redirect URI mismatch',
                    solution:
                      "The redirect_uri must exactly match what's configured in MyJKKN admin panel"
                  },
                  {
                    issue: 'Token expired',
                    cause: 'Access token has expired',
                    solution:
                      'Implement automatic token refresh using the refresh token before expiry'
                  },
                  {
                    issue: 'Google One Tap Interferes with Child App Flow',
                    cause: 'One Tap auto-login bypasses child app context',
                    solution:
                      'Disable Google One Tap when child_app_auth=true parameter is detected in login page'
                  },
                  {
                    issue: 'State parameter mismatch',
                    cause: 'CSRF protection validation failed',
                    solution:
                      'Ensure the state parameter is stored in sessionStorage and validated on callback'
                  },
                  {
                    issue: 'No user data after login',
                    cause: 'Token exchange failed',
                    solution:
                      'Check network tab for token exchange request and verify app_id is correct'
                  },
                  {
                    issue: 'Redirect loop',
                    cause: 'Authentication check failing',
                    solution:
                      'Check that cookies are being set correctly with secure and sameSite flags'
                  },
                  {
                    issue: 'Immediate logout after successful login',
                    cause: 'Cookies not persisting or being blocked',
                    solution:
                      'For localhost: use secure:false and sameSite:lax. For production: ensure HTTPS. Check browser console for cookie warnings. Verify localStorage is not disabled.'
                  },
                  {
                    issue:
                      'Child app login redirects to parent app instead of child app after first login',
                    cause:
                      'Google One Tap interfering with child app authentication flow',
                    solution:
                      'Ensure Google One Tap is disabled when child app parameters are present. Check that childAppAuth state is set immediately on page load, and GoogleOneTap component properly detects these parameters.'
                  },
                  {
                    issue:
                      'Google One Tap auto-signs user but loses child app context',
                    cause:
                      'Race condition between Google One Tap and child app parameter detection',
                    solution:
                      'Update login page to initialize child app auth state immediately from URL parameters instead of in useEffect. Ensure Google One Tap component checks for child app parameters before initializing.'
                  },
                  {
                    issue:
                      'Child app parameters not preserved through OAuth flow',
                    cause: 'Parameters lost during Google OAuth redirect',
                    solution:
                      'Store child app parameters in cookies AND OAuth state parameter. Use both methods as fallback for better reliability.'
                  }
                ].map((item, index) => (
                  <Alert key={index}>
                    <AlertCircle className='h-4 w-4' />
                    <AlertDescription>
                      <strong className='block mb-1'>{item.issue}</strong>
                      <span className='text-sm'>
                        <strong>Cause:</strong> {item.cause}
                        <br />
                        <strong>Solution:</strong> {item.solution}
                      </span>
                    </AlertDescription>
                  </Alert>
                ))}
              </div>

              {/* Debug Mode */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>Enable Debug Mode</h3>
                <CodeBlock
                  code={`// Add to your auth service for debugging
class ParentAuthService {
  private debug = true; // Enable debug mode
  
  private log(message: string, data?: any) {
    if (this.debug) {
      console.log('[Auth]', message, data);
    }
  }
  
  async handleCallback(code: string, state: string) {
    this.log('Handling callback', { code, state });
    // ... rest of the code
  }
}`}
                  language='typescript'
                  title='Debug Mode'
                  id='debug-mode'
                />
              </div>

              {/* Network Debugging */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>Network Debugging</h3>
                <Alert>
                  <Info className='h-4 w-4' />
                  <AlertDescription>
                    Open Browser DevTools → Network Tab → Filter by
                    &quot;Fetch/XHR&quot; to see all API calls. Check for:
                    <ul className='mt-2 space-y-1 text-sm'>
                      <li>• Status codes (should be 200/201)</li>
                      <li>• Request headers (Content-Type, Authorization)</li>
                      <li>• Response body (error messages)</li>
                      <li>• CORS headers in response</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reference Tab */}
        <TabsContent value='reference' className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <BookOpen className='h-5 w-5' />
                Quick Reference Guide
              </CardTitle>
              <CardDescription>
                Essential URLs, configurations, and commands for developers
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-6'>
              {/* Essential URLs */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>🌐 Essential URLs</h3>
                <div className='grid gap-3'>
                  <div className='p-3 bg-muted rounded-lg'>
                    <div className='font-mono text-sm'>
                      <div className='font-semibold mb-2'>Production:</div>
                      <div className='space-y-1'>
                        <div>
                          Base URL:{' '}
                          <code className='bg-background px-1 rounded'>
                            https://my.jkkn.ac.in
                          </code>
                        </div>
                        <div>
                          Auth URL:{' '}
                          <code className='bg-background px-1 rounded'>
                            https://my.jkkn.ac.in/auth/authorize
                          </code>
                        </div>
                        <div>
                          Token URL:{' '}
                          <code className='bg-background px-1 rounded'>
                            https://my.jkkn.ac.in/api/auth/child-app/token
                          </code>
                        </div>
                        <div>
                          Logout URL:{' '}
                          <code className='bg-background px-1 rounded'>
                            https://my.jkkn.ac.in/logout
                          </code>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Environment Template */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  ⚙️ Environment Template
                </h3>
                <CodeBlock
                  code={`# Required Configuration
NEXT_PUBLIC_PARENT_APP_URL=https://my.jkkn.ac.in
NEXT_PUBLIC_APP_ID=your_app_id_from_admin_panel

# Callback URLs (choose one based on environment)
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/auth/callback  # Development
# NEXT_PUBLIC_REDIRECT_URI=https://your-domain.com/auth/callback  # Production

# Optional: Google One Tap (get from Google Cloud Console)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id

# Optional: Enable debugging
NEXT_PUBLIC_AUTH_DEBUG=true`}
                  language='bash'
                  title='.env.local Template'
                  id='env-template'
                />
              </div>

              {/* OAuth Parameters */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>🔑 OAuth Parameters</h3>
                <div className='grid gap-3'>
                  <Alert>
                    <Key className='h-4 w-4' />
                    <AlertDescription>
                      <strong>Required Parameters:</strong>
                      <ul className='mt-2 space-y-1 text-sm list-disc list-inside'>
                        <li>
                          <code>response_type</code>: Always &quot;code&quot;
                        </li>
                        <li>
                          <code>client_id</code>: Your app ID from MyJKKN admin
                        </li>
                        <li>
                          <code>app_id</code>: Same as client_id (for
                          compatibility)
                        </li>
                        <li>
                          <code>redirect_uri</code>: Must match registered URI
                          exactly
                        </li>
                        <li>
                          <code>scope</code>: Space-separated (e.g., &quot;read
                          write profile&quot;)
                        </li>
                        <li>
                          <code>state</code>: Random string for CSRF protection
                        </li>
                      </ul>
                    </AlertDescription>
                  </Alert>
                </div>
              </div>

              {/* Quick Debug Commands */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  🐛 Quick Debug Commands
                </h3>
                <CodeBlock
                  code={`// Browser Console Quick Checks
// 1. Check authentication status
localStorage.getItem('user_data') ? 'Authenticated' : 'Not authenticated'

// 2. Check child app parameters
new URLSearchParams(location.search).get('app_id') || 'No app_id'

// 3. Check cookies
document.cookie.includes('child_app_auth') ? 'Child app cookie found' : 'No child app cookie'

// 4. Check current page
location.pathname

// 5. Test OAuth URL construction
const buildOAuthUrl = (appId, redirectUri) => {
  const url = new URL('https://my.jkkn.ac.in/auth/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('app_id', appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'read write profile');
  url.searchParams.set('state', Math.random().toString(36).slice(2));
  return url.toString();
};

// Usage: buildOAuthUrl('your_app_id', 'http://localhost:3000/auth/callback')`}
                  language='javascript'
                  title='Browser Console Commands'
                  id='quick-debug'
                />
              </div>

              {/* Common Configurations */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  📋 Common Configurations
                </h3>
                <div className='grid gap-3'>
                  <div className='p-3 border rounded-lg'>
                    <div className='font-semibold mb-2'>Development Setup:</div>
                    <ul className='text-sm space-y-1 list-disc list-inside'>
                      <li>
                        Use <code>http://localhost:3000</code>
                      </li>
                      <li>
                        Set <code>secure: false</code> for cookies
                      </li>
                      <li>
                        Set <code>sameSite: &apos;lax&apos;</code> for cookies
                      </li>
                      <li>Enable debug logging</li>
                    </ul>
                  </div>
                  <div className='p-3 border rounded-lg'>
                    <div className='font-semibold mb-2'>Production Setup:</div>
                    <ul className='text-sm space-y-1 list-disc list-inside'>
                      <li>
                        Use <code>https://</code> URLs only
                      </li>
                      <li>
                        Set <code>secure: true</code> for cookies
                      </li>
                      <li>
                        Set <code>sameSite: &apos;strict&apos;</code> for
                        cookies
                      </li>
                      <li>Disable debug logging</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Status Codes */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>🚦 HTTP Status Codes</h3>
                <div className='grid gap-2 text-sm'>
                  <div className='flex justify-between p-2 bg-green-50 dark:bg-green-950/20 rounded'>
                    <span>200 OK</span>
                    <span>Token exchange successful</span>
                  </div>
                  <div className='flex justify-between p-2 bg-red-50 dark:bg-red-950/20 rounded'>
                    <span>400 Bad Request</span>
                    <span>Invalid parameters</span>
                  </div>
                  <div className='flex justify-between p-2 bg-red-50 dark:bg-red-950/20 rounded'>
                    <span>401 Unauthorized</span>
                    <span>Invalid app_id or expired code</span>
                  </div>
                  <div className='flex justify-between p-2 bg-red-50 dark:bg-red-950/20 rounded'>
                    <span>403 Forbidden</span>
                    <span>App not authorized or inactive</span>
                  </div>
                  <div className='flex justify-between p-2 bg-yellow-50 dark:bg-yellow-950/20 rounded'>
                    <span>429 Too Many Requests</span>
                    <span>Rate limit exceeded</span>
                  </div>
                </div>
              </div>

              {/* File Structure */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  📁 Recommended File Structure
                </h3>
                <CodeBlock
                  code={`your-app/
├── .env.local                          # Environment variables
├── app/
│   ├── layout.tsx                      # Root layout with AuthProvider
│   ├── page.tsx                        # Home page with auth logic
│   └── auth/
│       └── callback/
│           └── route.ts                # OAuth callback handler
├── lib/
│   └── auth/
│       ├── parent-auth-service.ts      # Main auth service
│       ├── auth-context.tsx            # React context
│       └── types.ts                    # TypeScript interfaces
├── components/
│   ├── protected-route.tsx             # Route protection
│   └── auth/
│       └── google-one-tap.tsx          # Google One Tap (optional)
└── hooks/
    └── use-auth.ts                     # Custom auth hook`}
                  language='text'
                  title='Project Structure'
                  id='file-structure'
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Best Practices Section */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Sparkles className='h-5 w-5' />
            Best Practices & Tips
          </CardTitle>
          <CardDescription>
            Implementation recommendations based on common issues
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-4'>
            <h3 className='text-lg font-semibold'>Child App Authentication</h3>
            <div className='space-y-3'>
              {[
                {
                  title: 'Initialize State Immediately',
                  description:
                    'Set childAppAuth state from URL parameters during component initialization, not in useEffect',
                  code: `const [childAppAuth, setChildAppAuth] = useState(getInitialChildAppAuth());`
                },
                {
                  title: 'Disable Google One Tap for Child Apps',
                  description:
                    'Always check for child app parameters before initializing Google One Tap',
                  code: `{!isCheckingAuth && !childAppAuth && <GoogleOneTap />}`
                },
                {
                  title: 'Use Multiple Fallbacks',
                  description:
                    'Store child app parameters in both cookies and OAuth state parameter',
                  code: `document.cookie = \`child_app_auth=\${JSON.stringify(childAppAuth)}\`; oauthOptions.queryParams.state = btoa(JSON.stringify(stateData));`
                },
                {
                  title: 'Handle SSR Safely',
                  description:
                    'Always check for window object when accessing browser APIs',
                  code: `if (typeof window === 'undefined') return null;`
                }
              ].map((tip, index) => (
                <Alert key={index}>
                  <CheckCircle className='h-4 w-4 text-green-600' />
                  <AlertDescription>
                    <strong className='block mb-1'>{tip.title}</strong>
                    <p className='text-sm mb-2'>{tip.description}</p>
                    <CodeBlock
                      code={tip.code}
                      language='typescript'
                      id={`tip-${index}`}
                    />
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </div>

          <div className='space-y-4'>
            <h3 className='text-lg font-semibold'>Security Considerations</h3>
            <div className='grid gap-3'>
              <Alert className='border-blue-200 bg-blue-50 dark:bg-blue-950/20'>
                <Shield className='h-4 w-4 text-blue-600' />
                <AlertDescription>
                  <strong>HTTPS in Production:</strong> Always use HTTPS in
                  production for secure cookie transmission and OAuth redirects.
                </AlertDescription>
              </Alert>
              <Alert className='border-blue-200 bg-blue-50 dark:bg-blue-950/20'>
                <Shield className='h-4 w-4 text-blue-600' />
                <AlertDescription>
                  <strong>State Parameter:</strong> Always use and validate the
                  OAuth state parameter to prevent CSRF attacks.
                </AlertDescription>
              </Alert>
              <Alert className='border-blue-200 bg-blue-50 dark:bg-blue-950/20'>
                <Shield className='h-4 w-4 text-blue-600' />
                <AlertDescription>
                  <strong>Token Storage:</strong> Store tokens in httpOnly
                  cookies when possible, or use secure localStorage with proper
                  cleanup.
                </AlertDescription>
              </Alert>
            </div>
          </div>

          <div className='space-y-4'>
            <h3 className='text-lg font-semibold'>Performance Tips</h3>
            <div className='grid gap-3'>
              <div className='flex items-start gap-3 p-3 bg-muted rounded-lg'>
                <Zap className='h-5 w-5 text-orange-600 mt-0.5' />
                <div>
                  <div className='font-medium'>Memoize Supabase Client</div>
                  <div className='text-sm text-muted-foreground'>
                    Use useMemo to prevent recreating the client on each render
                  </div>
                </div>
              </div>
              <div className='flex items-start gap-3 p-3 bg-muted rounded-lg'>
                <Zap className='h-5 w-5 text-orange-600 mt-0.5' />
                <div>
                  <div className='font-medium'>Cleanup Timers</div>
                  <div className='text-sm text-muted-foreground'>
                    Always cleanup setTimeout and setInterval in useEffect
                    cleanup
                  </div>
                </div>
              </div>
              <div className='flex items-start gap-3 p-3 bg-muted rounded-lg'>
                <Zap className='h-5 w-5 text-orange-600 mt-0.5' />
                <div>
                  <div className='font-medium'>Loading States</div>
                  <div className='text-sm text-muted-foreground'>
                    Provide clear loading indicators during authentication flows
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Resources */}
      <Card>
        <CardHeader>
          <CardTitle>Additional Resources</CardTitle>
          <CardDescription>Helpful links and documentation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <a
              href='https://oauth.net/2/'
              target='_blank'
              rel='noopener noreferrer'
              className='flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors'
            >
              <ExternalLink className='h-5 w-5 text-muted-foreground' />
              <div>
                <div className='font-medium'>OAuth 2.0 Documentation</div>
                <div className='text-sm text-muted-foreground'>
                  Learn about OAuth 2.0 flow
                </div>
              </div>
            </a>
            <a
              href='https://jwt.io/'
              target='_blank'
              rel='noopener noreferrer'
              className='flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors'
            >
              <ExternalLink className='h-5 w-5 text-muted-foreground' />
              <div>
                <div className='font-medium'>JWT.io</div>
                <div className='text-sm text-muted-foreground'>
                  Debug and verify JWT tokens
                </div>
              </div>
            </a>
            <a
              href='https://nextjs.org/docs'
              target='_blank'
              rel='noopener noreferrer'
              className='flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors'
            >
              <ExternalLink className='h-5 w-5 text-muted-foreground' />
              <div>
                <div className='font-medium'>Next.js Documentation</div>
                <div className='text-sm text-muted-foreground'>
                  Learn about Next.js app router
                </div>
              </div>
            </a>
            <a
              href='#'
              className='flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors'
            >
              <Shield className='h-5 w-5 text-muted-foreground' />
              <div>
                <div className='font-medium'>Security Best Practices</div>
                <div className='text-sm text-muted-foreground'>
                  Secure token management guide
                </div>
              </div>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Support Section */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Bot className='h-5 w-5' />
            Getting Help & Support
          </CardTitle>
          <CardDescription>
            Self-help resources and support options for integration issues
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          {/* Self-Help Checklist */}
          <div>
            <h3 className='font-semibold mb-3'>📋 Pre-Support Checklist</h3>
            <Alert className='border-blue-200 bg-blue-50 dark:bg-blue-950/20'>
              <Info className='h-4 w-4 text-blue-600' />
              <AlertDescription>
                <strong>Before contacting support, please verify:</strong>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-2 mt-2'>
                  <div className='space-y-1 text-sm'>
                    <div>✅ App ID is correct and active</div>
                    <div>✅ Redirect URIs match exactly</div>
                    <div>✅ Environment variables are set</div>
                    <div>✅ HTTPS is used in production</div>
                  </div>
                  <div className='space-y-1 text-sm'>
                    <div>✅ Browser console shows no errors</div>
                    <div>✅ Network tab shows successful requests</div>
                    <div>✅ Cookies are being set correctly</div>
                    <div>✅ OAuth flow reaches callback page</div>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          </div>

          {/* Common Issues Quick Fix */}
          <div>
            <h3 className='font-semibold mb-3'>
              ⚡ Quick Fixes for Common Issues
            </h3>
            <div className='grid gap-3'>
              <Alert className='border-green-200 bg-green-50 dark:bg-green-950/20'>
                <CheckCircle className='h-4 w-4 text-green-600' />
                <AlertDescription>
                  <strong>Child App Auth Not Working:</strong> Clear browser
                  cache, check for child app auth cookie, ensure Google One Tap
                  is disabled for child app flows.
                </AlertDescription>
              </Alert>
              <Alert className='border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20'>
                <AlertCircle className='h-4 w-4 text-yellow-600' />
                <AlertDescription>
                  <strong>Redirect URI Mismatch:</strong> Ensure redirect URI in
                  code exactly matches the one registered in MyJKKN admin panel
                  (including protocol and trailing slashes).
                </AlertDescription>
              </Alert>
              <Alert className='border-red-200 bg-red-50 dark:bg-red-950/20'>
                <AlertCircle className='h-4 w-4 text-red-600' />
                <AlertDescription>
                  <strong>Token Exchange Fails:</strong> Verify app_id in
                  request body, check that authorization code hasn&apos;t
                  expired (5 minutes), ensure proper Content-Type header.
                </AlertDescription>
              </Alert>
            </div>
          </div>

          {/* Debug Information to Collect */}
          <div>
            <h3 className='font-semibold mb-3'>
              🔍 Information to Collect for Support
            </h3>
            <CodeBlock
              code={`// Run this in browser console and copy results for support
const debugInfo = {
  // Environment
  currentUrl: window.location.href,
  userAgent: navigator.userAgent,
  
  // Authentication State
  isAuthenticated: !!localStorage.getItem('user_data'),
  hasChildAppCookie: document.cookie.includes('child_app_auth'),
  
  // URL Parameters
  urlParams: Object.fromEntries(new URLSearchParams(location.search)),
  
  // Cookies
  allCookies: document.cookie.split('; ').reduce((acc, cookie) => {
    const [name, value] = cookie.split('=');
    acc[name] = value ? value.substring(0, 20) + '...' : '';
    return acc;
  }, {}),
  
  // Local Storage
  localStorage: {
    userData: !!localStorage.getItem('user_data'),
    authTimestamp: localStorage.getItem('auth_timestamp')
  },
  
  // Environment Variables (visible ones)
  env: {
    parentAppUrl: process.env.NEXT_PUBLIC_PARENT_APP_URL,
    hasAppId: !!process.env.NEXT_PUBLIC_APP_ID,
    hasRedirectUri: !!process.env.NEXT_PUBLIC_REDIRECT_URI
  }
};

console.log('Debug Info for Support:', JSON.stringify(debugInfo, null, 2));`}
              language='javascript'
              title='Debug Information Collection Script'
              id='debug-info-script'
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
