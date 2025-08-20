# MyJKKN Child App Test Application - Complete Implementation Guide for Lovable AI

## 📋 Project Overview

Build a React TypeScript test application using Vite that integrates with MyJKKN's child app authentication system. This app will demonstrate the complete OAuth2 flow and serve as a testing platform for child app authentication.

## 🎯 Project Requirements

### Technology Stack

- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: React Context API
- **HTTP Client**: Fetch API (built-in)
- **Cookie Management**: js-cookie library
- **Icons**: Lucide React
- **Deployment**: Vercel/Netlify compatible

### Core Functionality

1. **Authentication Flow**: Complete OAuth2 implementation with MyJKKN
2. **User Dashboard**: Display authenticated user information
3. **Protected Routes**: Route-based access control
4. **Error Handling**: Comprehensive error management
5. **Debug Tools**: Built-in debugging capabilities
6. **Responsive Design**: Mobile-first approach

## 🏗️ Project Structure

```
myjkkn-child-app-test/
├── public/
│   ├── vite.svg
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── ui/              # UI Components
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Alert.tsx
│   │   │   └── LoadingSpinner.tsx
│   │   ├── auth/            # Authentication Components
│   │   │   ├── LoginButton.tsx
│   │   │   ├── UserProfile.tsx
│   │   │   └── ProtectedRoute.tsx
│   │   └── layout/          # Layout Components
│   │       ├── Header.tsx
│   │       ├── Footer.tsx
│   │       └── Layout.tsx
│   ├── context/             # React Context
│   │   └── AuthContext.tsx
│   ├── hooks/               # Custom Hooks
│   │   ├── useAuth.ts
│   │   └── useDebug.ts
│   ├── lib/                 # Utilities & Services
│   │   ├── auth-service.ts
│   │   ├── api-client.ts
│   │   └── utils.ts
│   ├── pages/               # Page Components
│   │   ├── Home.tsx
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Profile.tsx
│   │   ├── Callback.tsx
│   │   └── NotFound.tsx
│   ├── types/               # TypeScript Types
│   │   ├── auth.ts
│   │   └── api.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── .env.example
├── .env.local
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── vite.config.ts
└── README.md
```

## 📦 Dependencies

### Package.json Configuration

```json
{
  "name": "myjkkn-child-app-test",
  "version": "1.0.0",
  "description": "Test application for MyJKKN child app authentication",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "js-cookie": "^3.0.5",
    "lucide-react": "^0.294.0",
    "clsx": "^2.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.37",
    "@types/react-dom": "^18.2.15",
    "@types/js-cookie": "^3.0.6",
    "@typescript-eslint/eslint-plugin": "^6.10.0",
    "@typescript-eslint/parser": "^6.10.0",
    "@vitejs/plugin-react": "^4.1.1",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.53.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.4",
    "postcss": "^8.4.31",
    "tailwindcss": "^3.3.5",
    "typescript": "^5.2.2",
    "vite": "^5.0.0"
  }
}
```

## ⚙️ Configuration Files

### Environment Variables (.env.example)

```bash
# MyJKKN Child App Configuration
VITE_PARENT_APP_URL=https://my.jkkn.ac.in
VITE_APP_ID=your_app_id_here

# Application Configuration
VITE_APP_NAME=MyJKKN Test App
VITE_APP_DESCRIPTION=Test application for MyJKKN child app authentication

# Development Configuration
VITE_REDIRECT_URI=http://localhost:5173/auth/callback

# Production Configuration (uncomment for production)
# VITE_REDIRECT_URI=https://your-domain.com/auth/callback

# Debug Configuration
VITE_DEBUG_MODE=true
VITE_LOG_LEVEL=debug

# API Configuration
VITE_API_TIMEOUT=10000
```

### Vite Configuration (vite.config.ts)

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
  },
})
```

### Tailwind Configuration (tailwind.config.js)

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0fdf4',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
        secondary: {
          50: '#f8fafc',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

## 🔐 Core Implementation

### 1. Authentication Types (src/types/auth.ts)

```typescript
export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  institution_id?: string;
  permissions?: Record<string, boolean>;
  avatar_url?: string;
  last_login?: string;
}

export interface AuthSession {
  user: User;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

export interface AuthConfig {
  parentAppUrl: string;
  appId: string;
  redirectUri: string;
  scopes: string[];
  debug: boolean;
}

export interface AuthState {
  user: User | null;
  session: AuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

export interface OAuthCallbackParams {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}
```

### 2. Authentication Service (src/lib/auth-service.ts)

```typescript
import Cookies from 'js-cookie';
import type { User, AuthSession, AuthConfig, OAuthCallbackParams } from '@/types/auth';

class AuthService {
  private config: AuthConfig;
  private refreshTimer?: NodeJS.Timeout;

  constructor() {
    this.config = {
      parentAppUrl: import.meta.env.VITE_PARENT_APP_URL || 'https://my.jkkn.ac.in',
      appId: import.meta.env.VITE_APP_ID || '',
      redirectUri: import.meta.env.VITE_REDIRECT_URI || `${window.location.origin}/auth/callback`,
      scopes: ['read', 'write', 'profile'],
      debug: import.meta.env.VITE_DEBUG_MODE === 'true'
    };
  }

  private log(message: string, data?: any) {
    if (this.config.debug) {
      console.log(`[AuthService] ${message}`, data);
    }
  }

  // Initialize OAuth2 authentication flow
  async initiateLogin(returnUrl?: string): Promise<void> {
    this.log('Initiating login', { returnUrl });

    const authUrl = new URL(`${this.config.parentAppUrl}/auth/authorize`);
    const state = this.generateState();

    // OAuth2 standard parameters
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', this.config.appId);
    authUrl.searchParams.append('app_id', this.config.appId);
    authUrl.searchParams.append('redirect_uri', this.config.redirectUri);
    authUrl.searchParams.append('scope', this.config.scopes.join(' '));
    authUrl.searchParams.append('state', state);

    // Store state and return URL for CSRF protection
    sessionStorage.setItem('oauth_state', state);
    if (returnUrl) {
      sessionStorage.setItem('return_url', returnUrl);
    }

    this.log('Redirecting to OAuth provider', { url: authUrl.toString() });
    window.location.href = authUrl.toString();
  }

  // Handle OAuth callback with authorization code
  async handleCallback(params: OAuthCallbackParams): Promise<AuthSession> {
    this.log('Handling OAuth callback', params);

    if (params.error) {
      throw new Error(params.error_description || params.error);
    }

    if (!params.code || !params.state) {
      throw new Error('Missing authorization code or state parameter');
    }

    // Verify state for CSRF protection
    const savedState = sessionStorage.getItem('oauth_state');
    if (params.state !== savedState) {
      throw new Error('Invalid state parameter - possible CSRF attack');
    }

    // Exchange authorization code for tokens
    const response = await fetch(`${this.config.parentAppUrl}/api/auth/child-app/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: params.code,
        app_id: this.config.appId,
        redirect_uri: this.config.redirectUri
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error_description || 'Token exchange failed');
    }

    const session = await response.json();

    // Save session data
    this.saveSession(session);

    // Schedule automatic token refresh
    this.scheduleTokenRefresh(session.expires_in);

    // Clear OAuth state
    sessionStorage.removeItem('oauth_state');

    this.log('Authentication successful', { user: session.user });
    return session;
  }

  // Save session tokens securely
  private saveSession(session: AuthSession): void {
    const isProduction = window.location.protocol === 'https:';

    // Store access token with expiry
    const expiresAt = new Date(Date.now() + session.expires_in * 1000);

    Cookies.set('access_token', session.access_token, {
      expires: expiresAt,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/'
    });

    // Store refresh token for 30 days
    Cookies.set('refresh_token', session.refresh_token, {
      expires: 30,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/'
    });

    // Store user data in localStorage
    try {
      localStorage.setItem('user_data', JSON.stringify(session.user));
      localStorage.setItem('auth_timestamp', Date.now().toString());
    } catch (e) {
      console.error('Failed to save user data to localStorage:', e);
    }
  }

  // Get current session
  getSession(): AuthSession | null {
    try {
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
        expires_in: 3600,
        scope: this.config.scopes.join(' ')
      };
    } catch (error) {
      this.log('Error getting session', error);
      return null;
    }
  }

  // Refresh access token
  async refreshToken(): Promise<AuthSession | null> {
    const refreshToken = Cookies.get('refresh_token');
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${this.config.parentAppUrl}/api/auth/child-app/token`, {
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
      this.log('Token refresh failed', error);
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
    const refreshIn = Math.max((expiresIn - 300) * 1000, 60000); // At least 1 minute

    this.refreshTimer = setTimeout(() => {
      this.refreshToken();
    }, refreshIn);
  }

  // Logout user
  async logout(redirectUri?: string): Promise<void> {
    this.log('Logging out user');

    // Clear local session
    this.clearSession();

    // Redirect to parent app logout
    const logoutUrl = new URL(`${this.config.parentAppUrl}/logout`);
    logoutUrl.searchParams.append('app_id', this.config.appId);

    if (redirectUri) {
      logoutUrl.searchParams.append('redirect_uri', redirectUri);
    }

    window.location.href = logoutUrl.toString();
  }

  // Clear session data
  clearSession(): void {
    this.log('Clearing session data');

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    Cookies.remove('access_token');
    Cookies.remove('refresh_token');
    localStorage.removeItem('user_data');
    localStorage.removeItem('auth_timestamp');
    sessionStorage.clear();
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.getSession();
  }

  // Get current user
  getUser(): User | null {
    const session = this.getSession();
    return session?.user || null;
  }

  // Get auth headers for API calls
  getAuthHeaders(): Record<string, string> {
    const session = this.getSession();
    if (!session) return {};

    return {
      'Authorization': `Bearer ${session.access_token}`,
      'X-App-ID': this.config.appId,
      'Content-Type': 'application/json'
    };
  }

  // Generate random state for CSRF protection
  private generateState(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  // Get return URL after login
  getReturnUrl(): string {
    const returnUrl = sessionStorage.getItem('return_url');
    sessionStorage.removeItem('return_url');
    return returnUrl || '/dashboard';
  }

  // Validate session
  async validateSession(): Promise<boolean> {
    const session = this.getSession();
    if (!session) return false;

    try {
      const response = await fetch(`${this.config.parentAppUrl}/api/auth/child-app/validate`, {
        headers: this.getAuthHeaders()
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}

export const authService = new AuthService();
```

### 3. Auth Context (src/context/AuthContext.tsx)

```typescript
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authService } from '@/lib/auth-service';
import type { User, AuthSession, AuthState } from '@/types/auth';

interface AuthContextType extends AuthState {
  login: (returnUrl?: string) => Promise<void>;
  logout: (redirectUri?: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
    error: null
  });

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      // Check for existing session
      const session = authService.getSession();
      if (session) {
        // Validate session
        const isValid = await authService.validateSession();
        if (isValid) {
          setState({
            user: session.user,
            session,
            isLoading: false,
            isAuthenticated: true,
            error: null
          });
          return;
        } else {
          // Session invalid, clear it
          authService.clearSession();
        }
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        isAuthenticated: false
      }));
    } catch (error) {
      console.error('Auth initialization error:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Authentication failed'
      }));
    }
  };

  const login = async (returnUrl?: string) => {
    try {
      setState(prev => ({ ...prev, error: null }));
      await authService.initiateLogin(returnUrl);
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Login failed'
      }));
    }
  };

  const logout = async (redirectUri?: string) => {
    try {
      setState(prev => ({ ...prev, error: null }));
      await authService.logout(redirectUri);
      setState({
        user: null,
        session: null,
        isLoading: false,
        isAuthenticated: false,
        error: null
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Logout failed'
      }));
    }
  };

  const refreshSession = async () => {
    try {
      const session = await authService.refreshToken();
      if (session) {
        setState(prev => ({
          ...prev,
          user: session.user,
          session,
          isAuthenticated: true,
          error: null
        }));
      } else {
        setState({
          user: null,
          session: null,
          isLoading: false,
          isAuthenticated: false,
          error: 'Session refresh failed'
        });
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Session refresh failed'
      }));
    }
  };

  const clearError = () => {
    setState(prev => ({ ...prev, error: null }));
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        refreshSession,
        clearError
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
```

### 4. Main App Component (src/App.tsx)

```typescript
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import Layout from '@/components/layout/Layout';
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Profile from '@/pages/Profile';
import Callback from '@/pages/Callback';
import NotFound from '@/pages/NotFound';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<Callback />} />

            {/* Protected Routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </Router>
    </AuthProvider>
  );
}

export default App;
```

### 5. OAuth Callback Page (src/pages/Callback.tsx)

```typescript
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '@/lib/auth-service';
import { useAuth } from '@/context/AuthContext';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Alert from '@/components/ui/Alert';

export default function Callback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshSession } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const params = {
          code: searchParams.get('code') || undefined,
          state: searchParams.get('state') || undefined,
          error: searchParams.get('error') || undefined,
          error_description: searchParams.get('error_description') || undefined,
        };

        console.log('[Callback] Processing OAuth callback', params);

        await authService.handleCallback(params);
        await refreshSession();

        const returnUrl = authService.getReturnUrl();
        console.log('[Callback] Authentication successful, redirecting to:', returnUrl);

        navigate(returnUrl, { replace: true });
      } catch (err) {
        console.error('[Callback] Authentication failed:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setIsProcessing(false);
      }
    };

    handleCallback();
  }, [searchParams, navigate, refreshSession]);

  if (isProcessing && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900">
            Completing authentication...
          </h2>
          <p className="mt-2 text-gray-600">
            Please wait while we sign you in.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <Alert variant="destructive" className="mb-4">
            <h3 className="font-semibold">Authentication Failed</h3>
            <p>{error}</p>
          </Alert>
          <div className="text-center">
            <button
              onClick={() => navigate('/login', { replace: true })}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
```

### 6. Dashboard Page (src/pages/Dashboard.tsx)

```typescript
import React from 'react';
import { useAuth } from '@/context/AuthContext';
import Card from '@/components/ui/Card';
import { User, Shield, Clock, Settings } from 'lucide-react';

export default function Dashboard() {
  const { user, session } = useAuth();

  if (!user || !session) {
    return null; // This should not happen in a protected route
  }

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Welcome back, {user.full_name}!</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* User Info Card */}
        <Card className="p-6">
          <div className="flex items-center mb-4">
            <User className="h-6 w-6 text-primary-600 mr-2" />
            <h3 className="text-lg font-semibold">Profile Information</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Email:</span> {user.email}
            </div>
            <div>
              <span className="font-medium">Role:</span> {user.role}
            </div>
            {user.institution_id && (
              <div>
                <span className="font-medium">Institution:</span> {user.institution_id}
              </div>
            )}
          </div>
        </Card>

        {/* Session Info Card */}
        <Card className="p-6">
          <div className="flex items-center mb-4">
            <Shield className="h-6 w-6 text-green-600 mr-2" />
            <h3 className="text-lg font-semibold">Session Details</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Scope:</span> {session.scope}
            </div>
            <div>
              <span className="font-medium">Token Type:</span> Bearer
            </div>
            <div>
              <span className="font-medium">Expires:</span> {session.expires_in}s
            </div>
          </div>
        </Card>

        {/* Last Login Card */}
        <Card className="p-6">
          <div className="flex items-center mb-4">
            <Clock className="h-6 w-6 text-blue-600 mr-2" />
            <h3 className="text-lg font-semibold">Activity</h3>
          </div>
          <div className="space-y-2 text-sm">
            {user.last_login && (
              <div>
                <span className="font-medium">Last Login:</span>{' '}
                {formatDate(user.last_login)}
              </div>
            )}
            <div>
              <span className="font-medium">Current Session:</span>{' '}
              {formatDate(localStorage.getItem('auth_timestamp') || Date.now().toString())}
            </div>
          </div>
        </Card>
      </div>

      {/* Permissions Card */}
      {user.permissions && Object.keys(user.permissions).length > 0 && (
        <Card className="p-6">
          <div className="flex items-center mb-4">
            <Settings className="h-6 w-6 text-purple-600 mr-2" />
            <h3 className="text-lg font-semibold">Permissions</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.entries(user.permissions).map(([permission, granted]) => (
              <div
                key={permission}
                className={`p-2 rounded text-sm ${
                  granted
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {permission}: {granted ? '✓' : '✗'}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Debug Information */}
      {import.meta.env.VITE_DEBUG_MODE === 'true' && (
        <Card className="p-6 bg-gray-50">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">Debug Information</h3>
          <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-64">
            {JSON.stringify({ user, session }, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}
```

## 🧪 Testing Instructions

### 1. Manual Testing Steps

```markdown
## Pre-Testing Setup
1. Ensure MyJKKN parent app is configured with your child app
2. Verify all environment variables are set correctly
3. Check that redirect URIs match exactly

## Authentication Flow Test
1. **Initial Load**: Visit http://localhost:5173
   - Should show home page with login button
   - User should not be authenticated

2. **Login Process**: Click "Login with MyJKKN"
   - Should redirect to https://my.jkkn.ac.in/auth/authorize
   - Should include all required OAuth parameters
   - Should NOT show Google One Tap (child app context)

3. **Parent App Authentication**:
   - User should see MyJKKN login page
   - After login, should see child app consent page
   - Should show app name, permissions, and authorize button

4. **Callback Processing**: Click "Authorize"
   - Should redirect to http://localhost:5173/auth/callback
   - Should show "Completing authentication..." message
   - Should automatically redirect to dashboard

5. **Dashboard Access**:
   - Should display user information correctly
   - Should show session details and permissions
   - Should have working logout functionality

## Error Scenarios Test
1. **Invalid App ID**: Test with wrong VITE_APP_ID
2. **Expired Code**: Wait 5+ minutes before using authorization code
3. **CSRF Attack**: Manually modify state parameter
4. **Network Issues**: Test with offline/slow network

## Browser Compatibility Test
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
```

### 2. Automated Testing Script

```javascript
// Add to package.json scripts
{
  "test:auth": "node scripts/test-auth-flow.js"
}

// scripts/test-auth-flow.js
const { chromium } = require('playwright');

async function testAuthFlow() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Test steps...
  console.log('Testing authentication flow...');

  await browser.close();
}

testAuthFlow().catch(console.error);
```

## 🚀 Deployment Instructions

### Vercel Deployment

```json
{
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "dist"
      }
    }
  ],
  "routes": [
    {
      "handle": "filesystem"
    },
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ]
}
```

### Environment Variables for Production

```bash
VITE_PARENT_APP_URL=https://my.jkkn.ac.in
VITE_APP_ID=your_production_app_id
VITE_REDIRECT_URI=https://your-domain.com/auth/callback
VITE_DEBUG_MODE=false
```

## 📋 Implementation Checklist

### Phase 1: Basic Setup ✅

- [ ] Create Vite React TypeScript project
- [ ] Install required dependencies
- [ ] Set up Tailwind CSS
- [ ] Configure environment variables
- [ ] Create basic project structure

### Phase 2: Authentication Core ✅

- [ ] Implement AuthService class
- [ ] Create AuthContext and provider
- [ ] Build OAuth callback handler
- [ ] Add protected route component
- [ ] Implement session management

### Phase 3: UI Components ✅

- [ ] Create reusable UI components (Button, Card, Alert, etc.)
- [ ] Build authentication forms
- [ ] Design dashboard layout
- [ ] Add loading and error states
- [ ] Implement responsive design

### Phase 4: Pages ✅

- [ ] Home page with login
- [ ] Login page
- [ ] OAuth callback page
- [ ] Dashboard with user info
- [ ] Profile management
- [ ] Error pages

### Phase 5: Testing & Debug ✅

- [ ] Add debug logging
- [ ] Create test scenarios
- [ ] Browser compatibility testing
- [ ] Error handling testing
- [ ] Performance optimization

### Phase 6: Deployment ✅

- [ ] Configure build settings
- [ ] Set up deployment pipeline
- [ ] Configure production environment
- [ ] SSL/HTTPS setup
- [ ] Domain configuration

## 🎯 Success Criteria

The application will be considered successful when:

1. **Authentication Flow**: Complete OAuth2 flow works seamlessly
2. **User Experience**: Smooth, intuitive interface with proper feedback
3. **Security**: Proper token handling and CSRF protection
4. **Error Handling**: Graceful error states with helpful messages
5. **Performance**: Fast loading and responsive design
6. **Compatibility**: Works across major browsers and devices
7. **Debug Tools**: Comprehensive debugging and logging capabilities
8. **Documentation**: Clear setup and usage instructions

## 🔍 Troubleshooting Guide

### Common Issues and Solutions

1. **Redirect URI Mismatch**

   - Ensure exact match with MyJKKN configuration
   - Include protocol (http/https) and port if applicable

2. **CORS Errors**

   - Verify parent app allows your domain
   - Check network requests in browser dev tools

3. **Token Exchange Failures**

   - Validate app_id in environment variables
   - Check authorization code hasn't expired (5 min limit)

4. **Session Not Persisting**

   - Verify cookie settings (secure, sameSite)
   - Check localStorage is not disabled

5. **Environment Variables Not Loading**
   - Ensure VITE\_ prefix for all variables
   - Restart dev server after changes

This comprehensive guide provides everything needed to build a complete MyJKKN child app test application using Lovable AI. Each section includes detailed implementation instructions, code examples, and testing procedures to ensure a successful integration.
