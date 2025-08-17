# Child Application Implementation Guide

## Quick Start Guide for Child App Developers

This guide helps you integrate your child application with MyJKKN's parent authentication system.

## Prerequisites

- Child app API key (request from MyJKKN admin)
- Child app ID (provided during registration)
- Access to parent app URL (https://my.jkkn.ac.in)

## Step-by-Step Implementation

### Step 1: Environment Setup

Create `.env.local` file in your child app:

```env
# Parent App Configuration
NEXT_PUBLIC_PARENT_APP_URL=https://my.jkkn.ac.in
NEXT_PUBLIC_CHILD_APP_ID=your_app_id_here
CHILD_APP_API_KEY=your_api_key_here

# Your Child App Supabase (for data only, not auth)
NEXT_PUBLIC_SUPABASE_URL=your_child_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_child_supabase_anon_key
```

### Step 2: Install Dependencies

```bash
npm install axios jsonwebtoken js-cookie
npm install --save-dev @types/jsonwebtoken
```

### Step 3: Create Authentication Service

Create `lib/auth/parent-auth.ts`:

```typescript
import axios from 'axios';
import Cookies from 'js-cookie';

const PARENT_APP_URL = process.env.NEXT_PUBLIC_PARENT_APP_URL!;
const CHILD_APP_ID = process.env.NEXT_PUBLIC_CHILD_APP_ID!;

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  institution_id: string;
  permissions: Record<string, boolean>;
}

export class ParentAuth {
  private static TOKEN_COOKIE = 'parent_auth_token';
  private static USER_COOKIE = 'parent_auth_user';

  static login() {
    const currentUrl = window.location.href;
    window.location.href = `${PARENT_APP_URL}/auth/child-app/login?app_id=${CHILD_APP_ID}&redirect_uri=${encodeURIComponent(currentUrl)}`;
  }

  static async handleCallback(token: string): Promise<User | null> {
    try {
      const user = await this.validateToken(token);
      if (user) {
        Cookies.set(this.TOKEN_COOKIE, token, { expires: 1 });
        Cookies.set(this.USER_COOKIE, JSON.stringify(user), { expires: 1 });
        return user;
      }
      return null;
    } catch (error) {
      console.error('Auth callback failed:', error);
      return null;
    }
  }

  static async validateToken(token: string): Promise<User | null> {
    try {
      const response = await axios.post(
        `${PARENT_APP_URL}/api/auth/child-app/validate`,
        { token, child_app_id: CHILD_APP_ID },
        { headers: { 'X-API-Key': process.env.CHILD_APP_API_KEY! } }
      );

      if (response.data.valid) {
        return response.data.user;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  static getToken(): string | null {
    return Cookies.get(this.TOKEN_COOKIE) || null;
  }

  static getUser(): User | null {
    const userStr = Cookies.get(this.USER_COOKIE);
    return userStr ? JSON.parse(userStr) : null;
  }

  static logout() {
    Cookies.remove(this.TOKEN_COOKIE);
    Cookies.remove(this.USER_COOKIE);
    window.location.href = `${PARENT_APP_URL}/auth/logout?redirect_uri=${encodeURIComponent(window.location.origin)}`;
  }

  static isAuthenticated(): boolean {
    return !!this.getToken();
  }
}
```

### Step 4: Create Auth Context Provider

Create `contexts/auth-context.tsx`:

```typescript
'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { ParentAuth, User } from '@/lib/auth/parent-auth';
import { useRouter, useSearchParams } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: () => {},
  logout: () => {},
  isAuthenticated: false
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    initAuth();
  }, []);

  const initAuth = async () => {
    // Check for token in URL (callback from parent)
    const token = searchParams.get('token');

    if (token) {
      const user = await ParentAuth.handleCallback(token);
      if (user) {
        setUser(user);
        // Clean URL
        router.replace(window.location.pathname);
      }
    } else {
      // Check existing session
      const existingUser = ParentAuth.getUser();
      const existingToken = ParentAuth.getToken();

      if (existingUser && existingToken) {
        // Validate token is still valid
        const validUser = await ParentAuth.validateToken(existingToken);
        if (validUser) {
          setUser(validUser);
        } else {
          // Token invalid, clear session
          ParentAuth.logout();
        }
      }
    }

    setLoading(false);
  };

  const login = () => {
    ParentAuth.login();
  };

  const logout = () => {
    ParentAuth.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAuthenticated: !!user
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
```

### Step 5: Create Protected Route Component

Create `components/auth/protected-route.tsx`:

```typescript
'use client';

import { useAuth } from '@/contexts/auth-context';
import { useEffect } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
  requiredPermissions?: string[];
  fallback?: React.ReactNode;
}

export function ProtectedRoute({
  children,
  requiredRole,
  requiredPermissions,
  fallback
}: ProtectedRouteProps) {
  const { user, loading, login, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      login();
    }
  }, [loading, isAuthenticated]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect to login
  }

  // Check role
  if (requiredRole && user?.role !== requiredRole) {
    return fallback || (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600">Access Denied</h2>
          <p className="mt-2">You need {requiredRole} role to access this page.</p>
        </div>
      </div>
    );
  }

  // Check permissions
  if (requiredPermissions && requiredPermissions.length > 0) {
    const hasAllPermissions = requiredPermissions.every(
      permission => user?.permissions?.[permission] === true
    );

    if (!hasAllPermissions) {
      return fallback || (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600">Access Denied</h2>
            <p className="mt-2">You don't have required permissions.</p>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}
```

### Step 6: Update Your App Layout

Update `app/layout.tsx`:

```typescript
import { AuthProvider } from '@/contexts/auth-context';

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
}
```

### Step 7: Protect Your Pages

Example protected page `app/dashboard/page.tsx`:

```typescript
'use client';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuth } from '@/contexts/auth-context';

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="p-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p>Welcome, {user?.full_name}!</p>
        <p>Your role: {user?.role}</p>
        <p>Institution ID: {user?.institution_id}</p>
      </div>
    </ProtectedRoute>
  );
}
```

### Step 8: Make Authenticated API Calls

Create `lib/api/client.ts`:

```typescript
import axios from 'axios';
import { ParentAuth } from '@/lib/auth/parent-auth';

// Create axios instance with auth interceptor
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api',
});

// Add auth token to requests
apiClient.interceptors.request.use(
  (config) => {
    const token = ParentAuth.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle auth errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      ParentAuth.logout();
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

### Step 9: Access Child App's Own Supabase Data

Create `lib/supabase/client.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import { ParentAuth } from '@/lib/auth/parent-auth';

// Create Supabase client for data access (not auth)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Helper to get data with user context
export async function getDataForUser(table: string, filters?: any) {
  const user = ParentAuth.getUser();
  if (!user) throw new Error('User not authenticated');

  // Add institution filter automatically
  const query = supabase
    .from(table)
    .select('*')
    .eq('institution_id', user.institution_id);

  // Add additional filters
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      query.eq(key, value);
    });
  }

  return query;
}

export { supabase };
```

## Complete Example Application

### Example: Student Portal Child App

```typescript
// app/page.tsx
'use client';

import { useAuth } from '@/contexts/auth-context';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useEffect, useState } from 'react';
import { getDataForUser } from '@/lib/supabase/client';

interface Course {
  id: string;
  course_name: string;
  course_code: string;
  credits: number;
}

export default function HomePage() {
  const { user, logout } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadCourses();
    }
  }, [user]);

  const loadCourses = async () => {
    try {
      const { data, error } = await getDataForUser('courses', {
        student_id: user?.id
      });

      if (error) throw error;
      setCourses(data || []);
    } catch (error) {
      console.error('Failed to load courses:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute requiredRole="student">
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center">
              <h1 className="text-3xl font-bold text-gray-900">
                Student Portal
              </h1>
              <button
                onClick={logout}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">
                  Welcome, {user?.full_name}!
                </h2>

                <div className="mt-6">
                  <h3 className="text-md font-medium text-gray-900 mb-3">
                    Your Courses
                  </h3>
                  {loading ? (
                    <p>Loading courses...</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {courses.map((course) => (
                        <div
                          key={course.id}
                          className="border rounded-lg p-4"
                        >
                          <h4 className="font-semibold">{course.course_name}</h4>
                          <p className="text-sm text-gray-600">
                            Code: {course.course_code}
                          </p>
                          <p className="text-sm text-gray-600">
                            Credits: {course.credits}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
```

## Testing Your Implementation

### 1. Test Authentication Flow

```typescript
// __tests__/auth.test.ts
import { ParentAuth } from '@/lib/auth/parent-auth';

describe('Parent Authentication', () => {
  it('should redirect to parent app for login', () => {
    const mockLocation = { href: '' };
    Object.defineProperty(window, 'location', {
      value: mockLocation,
      writable: true
    });

    ParentAuth.login();

    expect(mockLocation.href).toContain('my.jkkn.ac.in/auth/child-app/login');
  });

  it('should validate token successfully', async () => {
    const mockToken = 'valid_token';
    const user = await ParentAuth.validateToken(mockToken);

    expect(user).toBeDefined();
    expect(user?.email).toBeDefined();
  });
});
```

### 2. Test Protected Routes

```typescript
// __tests__/protected-route.test.tsx
import { render, screen } from '@testing-library/react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { AuthProvider } from '@/contexts/auth-context';

describe('ProtectedRoute', () => {
  it('should show loading state initially', () => {
    render(
      <AuthProvider>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </AuthProvider>
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('should redirect unauthenticated users', () => {
    // Mock unauthenticated state
    // Test redirect behavior
  });
});
```

## Common Issues and Solutions

### Issue 1: CORS Errors

**Problem**: Getting CORS errors when calling parent app API

**Solution**: Ensure your child app domain is whitelisted in parent app:

```typescript
// Parent app CORS configuration
const allowedOrigins = [
  'https://childapp.example.com',
  'http://localhost:3001' // For development
];
```

### Issue 2: Token Expiration

**Problem**: Users getting logged out frequently

**Solution**: Implement token refresh:

```typescript
// Add to ParentAuth class
static async refreshToken(): Promise<boolean> {
  const currentToken = this.getToken();
  if (!currentToken) return false;

  try {
    const response = await axios.post(
      `${PARENT_APP_URL}/api/auth/child-app/refresh`,
      {
        token: currentToken,
        child_app_id: CHILD_APP_ID
      }
    );

    if (response.data.access_token) {
      Cookies.set(this.TOKEN_COOKIE, response.data.access_token);
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}
```

### Issue 3: Session Sync Issues

**Problem**: User logged out in parent but still logged in child app

**Solution**: Implement session validation:

```typescript
// Add periodic session check
useEffect(() => {
  const interval = setInterval(async () => {
    const isValid = await ParentAuth.validateToken(ParentAuth.getToken()!);
    if (!isValid) {
      logout();
    }
  }, 60000); // Check every minute

  return () => clearInterval(interval);
}, []);
```

## Production Deployment Checklist

- [ ] Configure production environment variables
- [ ] Set up HTTPS for all endpoints
- [ ] Configure proper CORS headers
- [ ] Implement rate limiting
- [ ] Set up error logging and monitoring
- [ ] Configure session timeout
- [ ] Test authentication flow end-to-end
- [ ] Implement proper error handling
- [ ] Set up backup authentication method
- [ ] Document emergency procedures

## Support

For issues or questions:

1. Check the [troubleshooting guide](#common-issues-and-solutions)
2. Contact MyJKKN admin team
3. Submit issue to support portal

## API Reference

### Available Methods

```typescript
// Authentication
ParentAuth.login(): void
ParentAuth.logout(): void
ParentAuth.handleCallback(token: string): Promise<User | null>
ParentAuth.validateToken(token: string): Promise<User | null>
ParentAuth.getToken(): string | null
ParentAuth.getUser(): User | null
ParentAuth.isAuthenticated(): boolean

// React Hooks
useAuth(): {
  user: User | null;
  loading: boolean;
  login: () => void;
  logout: () => void;
  isAuthenticated: boolean;
}
```

### User Object Structure

```typescript
interface User {
  id: string;              // User UUID
  email: string;           // User email
  full_name: string;       // Full name
  role: string;            // User role (student, staff, admin, etc.)
  institution_id: string;  // Institution UUID
  permissions: {           // Custom permissions
    [key: string]: boolean;
  };
}
```

This completes the child application implementation guide. Follow these steps to integrate your application with MyJKKN's authentication system.
