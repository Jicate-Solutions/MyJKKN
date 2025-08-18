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
      redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || window.location.origin + '/auth/callback',
      scopes: ['read', 'write', 'profile']
    };
  }

  static getInstance(): ParentAuthService {
    if (!ParentAuthService.instance) {
      ParentAuthService.instance = new ParentAuthService();
    }
    return ParentAuthService.instance;
  }

  // Initialize OAuth2 authentication flow
  async initiateLogin(state?: string): Promise<void> {
    const authUrl = new URL(\`\${this.config.parentAppUrl}/auth/authorize\`);
    
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
    
    Cookies.set('access_token', session.access_token, { 
      expires: expiresAt,
      secure: true,
      sameSite: 'strict'
    });
    
    // Store refresh token for 30 days
    Cookies.set('refresh_token', session.refresh_token, { 
      expires: 30,
      secure: true,
      sameSite: 'strict'
    });
    
    // Store user data in localStorage
    localStorage.setItem('user_data', JSON.stringify(session.user));
  }

  // Get current session
  getSession(): UserSession | null {
    const accessToken = Cookies.get('access_token');
    const refreshToken = Cookies.get('refresh_token');
    const userData = localStorage.getItem('user_data');

    if (!accessToken || !refreshToken || !userData) {
      return null;
    }

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: JSON.parse(userData),
      expires_in: 3600
    };
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

  // Logout user
  async logout(redirectUri?: string): Promise<void> {
    // Clear local session
    this.clearSession();
    
    // Redirect to parent app logout
    const logoutUrl = new URL(\`\${this.config.parentAppUrl}/logout\`);
    logoutUrl.searchParams.append('app_id', this.config.appId);
    
    if (redirectUri) {
      logoutUrl.searchParams.append('redirect_uri', redirectUri);
    }
    
    window.location.href = logoutUrl.toString();
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
    // Check for existing session on mount
    const session = parentAuthService.getSession();
    if (session) {
      setUser(session.user);
    }
    
    // Handle OAuth callback
    const handleCallback = async () => {
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
          
          // Clean URL after successful authentication
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error) {
          console.error('Auth callback failed:', error);
        }
      }
    };
    
    handleCallback();
    setLoading(false);
  }, []);

  const login = async () => {
    await parentAuthService.initiateLogin();
  };

  const logout = async () => {
    await parentAuthService.logout(window.location.origin);
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
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/auth/callback

# For production, update redirect URI:
# NEXT_PUBLIC_REDIRECT_URI=https://your-app.com/auth/callback`;

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

## Authorization Endpoint
GET https://my.jkkn.ac.in/auth/authorize
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

## Logout Endpoint
GET https://my.jkkn.ac.in/logout
Parameters:
- app_id={your_app_id} (required)
- redirect_uri={your_logout_redirect_url} (optional)`;

  // Test endpoints
  const testEndpoints = `# Test Your Integration

## 1. Test Authorization URL
Open this in your browser:
https://my.jkkn.ac.in/auth/authorize?response_type=code&app_id=YOUR_APP_ID&redirect_uri=http://localhost:3000/auth/callback&scope=read write profile&state=test123

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
        <TabsList className='grid w-full grid-cols-6'>
          <TabsTrigger value='overview'>Overview</TabsTrigger>
          <TabsTrigger value='quickstart'>Quick Start</TabsTrigger>
          <TabsTrigger value='implementation'>Code</TabsTrigger>
          <TabsTrigger value='endpoints'>Endpoints</TabsTrigger>
          <TabsTrigger value='testing'>Testing</TabsTrigger>
          <TabsTrigger value='troubleshoot'>Debug</TabsTrigger>
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
                </div>
              </div>

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
                <h3 className='text-lg font-semibold'>Testing Checklist</h3>
                <div className='space-y-3'>
                  {[
                    'Environment variables are set correctly',
                    'App ID matches MyJKKN configuration',
                    'Redirect URI matches exactly (including protocol)',
                    'Login button redirects to MyJKKN',
                    'After login, user returns to your app',
                    'User data is displayed correctly',
                    'Access token is stored in cookies',
                    'Refresh token works before expiry',
                    'Logout clears all session data',
                    'Protected routes redirect when not authenticated'
                  ].map((item, index) => (
                    <div key={index} className='flex items-center gap-3'>
                      <div className='h-5 w-5 rounded border-2 border-gray-300' />
                      <span className='text-sm'>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Browser Console Tests */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>Browser Console Tests</h3>
                <CodeBlock
                  code={`// Check if user is authenticated
localStorage.getItem('user_data')

// Check cookies (install EditThisCookie extension)
document.cookie

// Test auth service
const auth = await import('./lib/auth/parent-auth-service');
auth.default.isAuthenticated()
auth.default.getUser()`}
                  language='javascript'
                  title='Console Commands'
                  id='console-tests'
                />
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
                    issue: 'CORS Error',
                    cause: 'Cross-origin request blocked',
                    solution:
                      'Ensure your redirect_uri is exactly as configured in MyJKKN, including protocol (http/https)'
                  },
                  {
                    issue: '404 Not Found on /auth/authorize',
                    cause: 'Wrong endpoint URL',
                    solution:
                      'Use https://my.jkkn.ac.in/auth/authorize (not /api/auth/authorize)'
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
                    issue: 'User stays logged in after logout',
                    cause: 'Session not cleared properly',
                    solution:
                      'Ensure cookies, localStorage, and sessionStorage are all cleared on logout'
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
      </Tabs>

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
          <CardTitle>Need Help?</CardTitle>
          <CardDescription>
            Contact support for assistance with integration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className='mb-4'>
            <Info className='h-4 w-4' />
            <AlertDescription>
              <strong>Before contacting support:</strong>
              <ul className='mt-2 space-y-1 text-sm'>
                <li>• Check that your App ID is correct</li>
                <li>• Verify redirect URIs match exactly</li>
                <li>• Review the troubleshooting guide above</li>
                <li>• Check browser console for errors</li>
                <li>• Verify environment variables are set</li>
              </ul>
            </AlertDescription>
          </Alert>
          <div className='flex flex-col sm:flex-row gap-4'>
            <Button variant='outline' className='flex-1'>
              <Terminal className='mr-2 h-4 w-4' />
              View Integration Logs
            </Button>
            <Button variant='outline' className='flex-1'>
              <BookOpen className='mr-2 h-4 w-4' />
              API Documentation
            </Button>
            <Button className='flex-1'>Contact Support</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
