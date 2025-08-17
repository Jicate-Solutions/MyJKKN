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
  Sparkles
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
  apiKey: string;
  redirectUri: string;
}

interface UserSession {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    institution_id?: string;
  };
  token: string;
  refreshToken: string;
  expiresAt: string;
}

export class ParentAuthService {
  private static instance: ParentAuthService;
  private config: AuthConfig;
  private refreshTimer?: NodeJS.Timeout;

  private constructor() {
    this.config = {
      parentAppUrl: process.env.NEXT_PUBLIC_PARENT_APP_URL || 'https://my.jkkn.ac.in',
      appId: process.env.NEXT_PUBLIC_APP_ID || '',
      apiKey: process.env.NEXT_PUBLIC_API_KEY || '',
      redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || ''
    };
  }

  static getInstance(): ParentAuthService {
    if (!ParentAuthService.instance) {
      ParentAuthService.instance = new ParentAuthService();
    }
    return ParentAuthService.instance;
  }

  // Initialize authentication flow
  async initiateLogin(): Promise<void> {
    const authUrl = new URL(\`\${this.config.parentAppUrl}/auth/login\`);
    authUrl.searchParams.append('app_id', this.config.appId);
    authUrl.searchParams.append('redirect_uri', this.config.redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'read write profile');
    authUrl.searchParams.append('state', this.generateState());
    
    window.location.href = authUrl.toString();
  }

  // Handle callback from parent app
  async handleCallback(code: string): Promise<UserSession> {
    const response = await fetch('/api/auth/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        app_id: this.config.appId,
        api_key: this.config.apiKey,
        redirect_uri: this.config.redirectUri
      })
    });

    if (!response.ok) {
      throw new Error('Authentication failed');
    }

    const session = await response.json();
    this.saveSession(session);
    this.scheduleTokenRefresh(session);
    return session;
  }

  // Save session to cookies
  private saveSession(session: UserSession): void {
    Cookies.set('auth_token', session.token, { 
      expires: new Date(session.expiresAt),
      secure: true,
      sameSite: 'strict'
    });
    Cookies.set('refresh_token', session.refreshToken, { 
      expires: 30,
      secure: true,
      sameSite: 'strict'
    });
    localStorage.setItem('user', JSON.stringify(session.user));
  }

  // Get current session
  getSession(): UserSession | null {
    const token = Cookies.get('auth_token');
    const refreshToken = Cookies.get('refresh_token');
    const userStr = localStorage.getItem('user');

    if (!token || !refreshToken || !userStr) {
      return null;
    }

    return {
      token,
      refreshToken,
      user: JSON.parse(userStr),
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    };
  }

  // Refresh access token
  async refreshToken(): Promise<UserSession | null> {
    const refreshToken = Cookies.get('refresh_token');
    if (!refreshToken) return null;

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refresh_token: refreshToken,
          app_id: this.config.appId,
          api_key: this.config.apiKey
        })
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const session = await response.json();
      this.saveSession(session);
      this.scheduleTokenRefresh(session);
      return session;
    } catch (error) {
      this.logout();
      return null;
    }
  }

  // Schedule automatic token refresh
  private scheduleTokenRefresh(session: UserSession): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    const expiresAt = new Date(session.expiresAt).getTime();
    const now = Date.now();
    const refreshIn = Math.max(0, expiresAt - now - 300000); // 5 min before expiry

    this.refreshTimer = setTimeout(() => {
      this.refreshToken();
    }, refreshIn);
  }

  // Logout
  logout(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    Cookies.remove('auth_token');
    Cookies.remove('refresh_token');
    localStorage.removeItem('user');
    window.location.href = \`\${this.config.parentAppUrl}/logout?app_id=\${this.config.appId}\`;
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.getSession();
  }

  // Get auth headers for API calls
  getAuthHeaders(): Record<string, string> {
    const session = this.getSession();
    if (!session) return {};

    return {
      'Authorization': \`Bearer \${session.token}\`,
      'X-App-ID': this.config.appId
    };
  }
}

export default ParentAuthService;`;

  // Auth Context code
  const authContextCode = `// lib/auth/auth-context.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ParentAuthService } from './parent-auth-service';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  institution_id?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const authService = ParentAuthService.getInstance();

  useEffect(() => {
    // Check for existing session
    const session = authService.getSession();
    if (session) {
      setUser(session.user);
    }
    setLoading(false);

    // Handle auth callback
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      handleAuthCallback(code);
    }
  }, []);

  const handleAuthCallback = async (code: string) => {
    try {
      setLoading(true);
      const session = await authService.handleCallback(code);
      setUser(session.user);
      
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
      console.error('Auth callback failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    await authService.initiateLogin();
  };

  const logout = () => {
    setUser(null);
    authService.logout();
  };

  const refreshSession = async () => {
    const session = await authService.refreshToken();
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
  const protectedRouteCode = `// lib/auth/protected-route.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth-context';

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

  // API route handlers
  const apiCallbackRoute = `// app/api/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { code, app_id, api_key, redirect_uri } = await request.json();

  try {
    // Exchange code for tokens with parent app
    const response = await fetch(\`\${process.env.PARENT_APP_URL}/api/auth/child-app/token\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': api_key
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        app_id,
        redirect_uri
      })
    });

    if (!response.ok) {
      throw new Error('Token exchange failed');
    }

    const data = await response.json();
    
    return NextResponse.json({
      user: data.user,
      token: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 }
    );
  }
}`;

  const apiRefreshRoute = `// app/api/auth/refresh/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { refresh_token, app_id, api_key } = await request.json();

  try {
    const response = await fetch(\`\${process.env.PARENT_APP_URL}/api/auth/child-app/refresh\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': api_key
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token,
        app_id
      })
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    
    return NextResponse.json({
      user: data.user,
      token: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Token refresh failed' },
      { status: 401 }
    );
  }
}`;

  // Environment variables
  const envExample = `# .env.local
NEXT_PUBLIC_PARENT_APP_URL=https://my.jkkn.ac.in
NEXT_PUBLIC_APP_ID=your_app_id_from_myjkkn
NEXT_PUBLIC_API_KEY=your_api_key_from_myjkkn
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/auth/callback
PARENT_APP_URL=https://my.jkkn.ac.in`;

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
import { ProtectedRoute } from '@/lib/auth/protected-route';

export default function HomePage() {
  const { user, isAuthenticated, login, logout } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-2xl font-bold mb-4">Welcome to Child App</h1>
        <button 
          onClick={login}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
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
            <h2 className="text-xl font-semibold mb-2">Welcome, {user?.name}!</h2>
            <p className="text-gray-600 mb-4">Role: {user?.role}</p>
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

  // AI Implementation Prompt
  const aiPrompt = `I need to implement MyJKKN parent authentication in my Next.js child application.

CONTEXT:
- Parent App URL: https://my.jkkn.ac.in
- My App ID: [YOUR_APP_ID]
- My API Key: [YOUR_API_KEY]
- My Redirect URI: [YOUR_REDIRECT_URI]

REQUIREMENTS:
1. Users should authenticate through MyJKKN instead of separate login
2. Handle OAuth2 flow with authorization code grant
3. Implement automatic token refresh
4. Protect routes based on authentication status
5. Support role-based access control

Please create a complete authentication system with:
1. Authentication service class for handling OAuth flow
2. React context for managing auth state
3. Protected route component
4. API routes for token exchange and refresh
5. Integration with Next.js app router
6. Proper error handling and loading states
7. Secure cookie management for tokens
8. Automatic token refresh before expiry

The implementation should:
- Use TypeScript
- Follow Next.js 14 app router patterns
- Store tokens securely in httpOnly cookies
- Handle authentication errors gracefully
- Provide hooks for accessing auth state
- Support role-based route protection
- Clean up URLs after OAuth callback
- Implement proper logout flow

Include all necessary files with complete code, not just snippets.`;

  return (
    <div className='space-y-8'>
      {/* Header */}
      <div className='space-y-4'>
        <div className='flex items-center gap-3'>
          <GitBranch className='h-8 w-8 text-primary' />
          <h1 className='text-3xl font-bold'>Child App Integration Guide</h1>
        </div>
        <p className='text-muted-foreground'>
          Complete implementation guide for integrating child applications with
          MyJKKN authentication
        </p>
      </div>

      {/* AI Tool Alert */}
      <Alert className='border-purple-200 bg-purple-50 dark:bg-purple-950/20'>
        <Bot className='h-4 w-4 text-purple-600' />
        <AlertDescription>
          <strong>Using AI Tools?</strong> Copy our AI-optimized prompt below
          for instant implementation with tools like Claude, ChatGPT, or
          Lovable.
        </AlertDescription>
      </Alert>

      {/* Implementation Tabs */}
      <Tabs defaultValue='quickstart' className='space-y-4'>
        <TabsList className='grid w-full grid-cols-4'>
          <TabsTrigger value='quickstart'>Quick Start</TabsTrigger>
          <TabsTrigger value='manual'>Manual Setup</TabsTrigger>
          <TabsTrigger value='ai-prompt'>AI Prompt</TabsTrigger>
          <TabsTrigger value='testing'>Testing</TabsTrigger>
        </TabsList>

        {/* Quick Start Tab */}
        <TabsContent value='quickstart' className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Zap className='h-5 w-5' />
                Quick Start (5 Minutes)
              </CardTitle>
              <CardDescription>
                Get up and running quickly with our complete authentication
                package
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-6'>
              {/* Step 1: Install Dependencies */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold flex items-center gap-2'>
                  <Badge>Step 1</Badge>
                  Install Dependencies
                </h3>
                <CodeBlock
                  code='npm install js-cookie @types/js-cookie'
                  language='bash'
                  id='install-deps'
                />
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
              </div>

              {/* Step 3: Copy Authentication Files */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold flex items-center gap-2'>
                  <Badge>Step 3</Badge>
                  Create Authentication Files
                </h3>
                <Alert className='mb-4'>
                  <Info className='h-4 w-4' />
                  <AlertDescription>
                    Create these files in your child application. All code is
                    provided below.
                  </AlertDescription>
                </Alert>
                <div className='space-y-2 bg-muted p-4 rounded-lg'>
                  <div className='font-mono text-sm'>
                    <div>📁 lib/auth/</div>
                    <div className='ml-4'>📄 parent-auth-service.ts</div>
                    <div className='ml-4'>📄 auth-context.tsx</div>
                    <div className='ml-4'>📄 protected-route.tsx</div>
                  </div>
                  <div className='font-mono text-sm mt-4'>
                    <div>📁 app/api/auth/</div>
                    <div className='ml-4'>📁 callback/</div>
                    <div className='ml-8'>📄 route.ts</div>
                    <div className='ml-4'>📁 refresh/</div>
                    <div className='ml-8'>📄 route.ts</div>
                  </div>
                </div>
              </div>

              {/* Step 4: Integration */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold flex items-center gap-2'>
                  <Badge>Step 4</Badge>
                  Integrate with Your App
                </h3>
                <CodeBlock
                  code={layoutCode}
                  language='typescript'
                  title='app/layout.tsx'
                  id='layout-integration'
                />
              </div>

              {/* Success Message */}
              <Alert className='border-green-200 bg-green-50 dark:bg-green-950/20'>
                <CheckCircle className='h-4 w-4 text-green-600' />
                <AlertDescription>
                  <strong>That&apos;s it!</strong> Your child app now uses
                  MyJKKN authentication.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Manual Setup Tab */}
        <TabsContent value='manual' className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle>Complete Implementation Files</CardTitle>
              <CardDescription>
                Copy these complete files to your child application
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-6'>
              {/* Authentication Service */}
              <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <h3 className='text-lg font-semibold'>Parent Auth Service</h3>
                  <Badge variant='outline'>Core Service</Badge>
                </div>
                <Alert>
                  <FileCode className='h-4 w-4' />
                  <AlertDescription>
                    <strong>File Location:</strong>{' '}
                    lib/auth/parent-auth-service.ts
                  </AlertDescription>
                </Alert>
                <CodeBlock
                  code={parentAuthServiceCode}
                  language='typescript'
                  title='parent-auth-service.ts'
                  id='auth-service'
                />
              </div>

              {/* Auth Context */}
              <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <h3 className='text-lg font-semibold'>
                    Auth Context Provider
                  </h3>
                  <Badge variant='outline'>React Context</Badge>
                </div>
                <Alert>
                  <FileCode className='h-4 w-4' />
                  <AlertDescription>
                    <strong>File Location:</strong> lib/auth/auth-context.tsx
                  </AlertDescription>
                </Alert>
                <CodeBlock
                  code={authContextCode}
                  language='typescript'
                  title='auth-context.tsx'
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
                    <strong>File Location:</strong> lib/auth/protected-route.tsx
                  </AlertDescription>
                </Alert>
                <CodeBlock
                  code={protectedRouteCode}
                  language='typescript'
                  title='protected-route.tsx'
                  id='protected-route'
                />
              </div>

              {/* API Routes */}
              <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <h3 className='text-lg font-semibold'>
                    API Route - Callback Handler
                  </h3>
                  <Badge variant='outline'>API Route</Badge>
                </div>
                <Alert>
                  <FileCode className='h-4 w-4' />
                  <AlertDescription>
                    <strong>File Location:</strong>{' '}
                    app/api/auth/callback/route.ts
                  </AlertDescription>
                </Alert>
                <CodeBlock
                  code={apiCallbackRoute}
                  language='typescript'
                  title='callback/route.ts'
                  id='api-callback'
                />
              </div>

              <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <h3 className='text-lg font-semibold'>
                    API Route - Token Refresh
                  </h3>
                  <Badge variant='outline'>API Route</Badge>
                </div>
                <Alert>
                  <FileCode className='h-4 w-4' />
                  <AlertDescription>
                    <strong>File Location:</strong>{' '}
                    app/api/auth/refresh/route.ts
                  </AlertDescription>
                </Alert>
                <CodeBlock
                  code={apiRefreshRoute}
                  language='typescript'
                  title='refresh/route.ts'
                  id='api-refresh'
                />
              </div>

              {/* Usage Example */}
              <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <h3 className='text-lg font-semibold'>Usage Example</h3>
                  <Badge variant='outline'>Implementation</Badge>
                </div>
                <Alert>
                  <FileCode className='h-4 w-4' />
                  <AlertDescription>
                    <strong>File Location:</strong> app/page.tsx (or any page)
                  </AlertDescription>
                </Alert>
                <CodeBlock
                  code={pageImplementation}
                  language='typescript'
                  title='page.tsx'
                  id='page-example'
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Prompt Tab */}
        <TabsContent value='ai-prompt' className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Sparkles className='h-5 w-5 text-purple-600' />
                AI Implementation Prompt
              </CardTitle>
              <CardDescription>
                Copy this prompt for AI tools like Claude, ChatGPT, or Lovable
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-6'>
              <Alert className='border-purple-200 bg-purple-50 dark:bg-purple-950/20'>
                <Bot className='h-4 w-4 text-purple-600' />
                <AlertDescription>
                  <strong>How to use:</strong>
                  <ol className='mt-2 space-y-1 text-sm'>
                    <li>1. Copy the prompt below</li>
                    <li>
                      2. Replace [YOUR_APP_ID], [YOUR_API_KEY], and
                      [YOUR_REDIRECT_URI] with your actual values
                    </li>
                    <li>
                      3. Paste into your AI tool (Claude, ChatGPT, Lovable,
                      etc.)
                    </li>
                    <li>
                      4. The AI will generate complete implementation files
                    </li>
                  </ol>
                </AlertDescription>
              </Alert>

              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>Complete AI Prompt</h3>
                <CodeBlock
                  code={aiPrompt}
                  language='markdown'
                  title='AI Implementation Prompt'
                  id='ai-prompt'
                />
              </div>

              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  What the AI Will Generate
                </h3>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div className='flex items-start gap-3'>
                    <CheckCircle className='h-5 w-5 text-green-600 mt-0.5' />
                    <div>
                      <div className='font-medium'>Authentication Service</div>
                      <div className='text-sm text-muted-foreground'>
                        Complete OAuth2 flow implementation
                      </div>
                    </div>
                  </div>
                  <div className='flex items-start gap-3'>
                    <CheckCircle className='h-5 w-5 text-green-600 mt-0.5' />
                    <div>
                      <div className='font-medium'>React Context</div>
                      <div className='text-sm text-muted-foreground'>
                        State management for auth
                      </div>
                    </div>
                  </div>
                  <div className='flex items-start gap-3'>
                    <CheckCircle className='h-5 w-5 text-green-600 mt-0.5' />
                    <div>
                      <div className='font-medium'>Protected Routes</div>
                      <div className='text-sm text-muted-foreground'>
                        Role-based access control
                      </div>
                    </div>
                  </div>
                  <div className='flex items-start gap-3'>
                    <CheckCircle className='h-5 w-5 text-green-600 mt-0.5' />
                    <div>
                      <div className='font-medium'>API Routes</div>
                      <div className='text-sm text-muted-foreground'>
                        Token exchange and refresh
                      </div>
                    </div>
                  </div>
                  <div className='flex items-start gap-3'>
                    <CheckCircle className='h-5 w-5 text-green-600 mt-0.5' />
                    <div>
                      <div className='font-medium'>Error Handling</div>
                      <div className='text-sm text-muted-foreground'>
                        Graceful error management
                      </div>
                    </div>
                  </div>
                  <div className='flex items-start gap-3'>
                    <CheckCircle className='h-5 w-5 text-green-600 mt-0.5' />
                    <div>
                      <div className='font-medium'>Auto Refresh</div>
                      <div className='text-sm text-muted-foreground'>
                        Automatic token renewal
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Alert>
                <Info className='h-4 w-4' />
                <AlertDescription>
                  <strong>Pro Tip:</strong> After the AI generates the code,
                  also ask it to:
                  <ul className='mt-2 space-y-1 text-sm'>
                    <li>• Add loading skeletons for better UX</li>
                    <li>• Implement retry logic for failed requests</li>
                    <li>• Add TypeScript interfaces for API responses</li>
                    <li>• Create a custom useAuth hook with TypeScript</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Testing Tab */}
        <TabsContent value='testing' className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle>Testing Your Integration</CardTitle>
              <CardDescription>
                Verify your authentication setup is working correctly
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-6'>
              {/* Test Checklist */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>Integration Checklist</h3>
                <div className='space-y-3'>
                  {[
                    {
                      step: 'Environment variables configured',
                      check: 'Verify .env.local has all required values'
                    },
                    {
                      step: 'Dependencies installed',
                      check: 'Run: npm list js-cookie'
                    },
                    {
                      step: 'Auth service created',
                      check: 'File exists: lib/auth/parent-auth-service.ts'
                    },
                    {
                      step: 'Context provider added',
                      check: 'AuthProvider wraps app in layout.tsx'
                    },
                    {
                      step: 'API routes created',
                      check:
                        'Routes exist: /api/auth/callback and /api/auth/refresh'
                    },
                    {
                      step: 'Login flow works',
                      check: 'Click login redirects to MyJKKN'
                    },
                    {
                      step: 'Callback handling',
                      check: 'Returns to app after MyJKKN login'
                    },
                    {
                      step: 'User data available',
                      check: 'useAuth() returns user object'
                    },
                    {
                      step: 'Protected routes work',
                      check: 'Unauthorized users redirected'
                    },
                    {
                      step: 'Token refresh works',
                      check: 'Tokens auto-refresh before expiry'
                    }
                  ].map((item, index) => (
                    <div key={index} className='flex items-start gap-3'>
                      <div className='mt-1'>
                        <div className='h-5 w-5 rounded border-2 border-gray-300' />
                      </div>
                      <div className='flex-1'>
                        <div className='font-medium'>{item.step}</div>
                        <div className='text-sm text-muted-foreground'>
                          {item.check}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Test Commands */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>Test Commands</h3>
                <CodeBlock
                  code={`# Check environment variables
cat .env.local

# Test API endpoint
curl -X POST http://localhost:3000/api/auth/callback \\
  -H "Content-Type: application/json" \\
  -d '{"code":"test","app_id":"test","api_key":"test","redirect_uri":"test"}'

# Check if auth service loads
npm run dev
# Open browser console and run:
# > window.localStorage.getItem('user')`}
                  language='bash'
                  title='Terminal Commands'
                  id='test-commands'
                />
              </div>

              {/* Common Issues */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold'>
                  Common Issues & Solutions
                </h3>
                <div className='space-y-3'>
                  <Alert>
                    <AlertCircle className='h-4 w-4' />
                    <AlertDescription>
                      <strong>CORS Error:</strong> Ensure redirect_uri matches
                      exactly with MyJKKN configuration
                    </AlertDescription>
                  </Alert>
                  <Alert>
                    <AlertCircle className='h-4 w-4' />
                    <AlertDescription>
                      <strong>401 Unauthorized:</strong> Check API key is
                      correct and app is active in MyJKKN
                    </AlertDescription>
                  </Alert>
                  <Alert>
                    <AlertCircle className='h-4 w-4' />
                    <AlertDescription>
                      <strong>Redirect Loop:</strong> Verify redirect_uri in
                      .env matches your callback route
                    </AlertDescription>
                  </Alert>
                  <Alert>
                    <AlertCircle className='h-4 w-4' />
                    <AlertDescription>
                      <strong>Token Expired:</strong> Ensure refresh token logic
                      is implemented correctly
                    </AlertDescription>
                  </Alert>
                </div>
              </div>

              {/* Success Verification */}
              <Alert className='border-green-200 bg-green-50 dark:bg-green-950/20'>
                <CheckCircle className='h-4 w-4 text-green-600' />
                <AlertDescription>
                  <strong>Success Indicators:</strong>
                  <ul className='mt-2 space-y-1 text-sm'>
                    <li>✓ Login button redirects to MyJKKN login page</li>
                    <li>✓ After login, returns to your app with user data</li>
                    <li>✓ User name and role displayed correctly</li>
                    <li>✓ Logout clears session and redirects to MyJKKN</li>
                    <li>
                      ✓ Protected routes only accessible when authenticated
                    </li>
                  </ul>
                </AlertDescription>
              </Alert>
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
              href='https://www.typescriptlang.org/docs/'
              target='_blank'
              rel='noopener noreferrer'
              className='flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors'
            >
              <ExternalLink className='h-5 w-5 text-muted-foreground' />
              <div>
                <div className='font-medium'>TypeScript Docs</div>
                <div className='text-sm text-muted-foreground'>
                  TypeScript language reference
                </div>
              </div>
            </a>
            <a
              href='#'
              className='flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors'
            >
              <BookOpen className='h-5 w-5 text-muted-foreground' />
              <div>
                <div className='font-medium'>OAuth 2.0 Guide</div>
                <div className='text-sm text-muted-foreground'>
                  Understanding OAuth flow
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
                  Secure token management
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
          <div className='flex flex-col sm:flex-row gap-4'>
            <Button variant='outline' className='flex-1'>
              <Terminal className='mr-2 h-4 w-4' />
              View API Logs
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
