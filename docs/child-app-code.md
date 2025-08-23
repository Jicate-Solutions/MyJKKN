//app/api/auth/token/route.ts

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
      console.error('Token exchange failed:', error);
      return NextResponse.json(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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

//app/auth/callback/page.tsx:

'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { AlertTriangle } from 'lucide-react';

function CallbackContent() {
const searchParams = useSearchParams();
const router = useRouter();
const { handleAuthCallback } = useAuth();
const [error, setError] = useState<string | null>(null);
const [processing, setProcessing] = useState(true);
const [handled, setHandled] = useState(false);

useEffect(() => {
// Prevent duplicate handling
if (handled) return;

    const handleCallback = async () => {
      setHandled(true);
      try {
        const code = searchParams?.get('code');
        const state = searchParams?.get('state');

        // Debug logging as recommended in the guide
        console.log('[Child App Callback] Received code:', code);
        console.log('[Child App Callback] Received state:', state);
        const error = searchParams?.get('error');
        const errorDescription = searchParams?.get('error_description');

        if (error) {
          setError(errorDescription || error);
          setProcessing(false);
          return;
        }

        if (!code) {
          setError('Authorization code not found');
          setProcessing(false);
          return;
        }

        // Validate state for CSRF protection
        const savedState = sessionStorage.getItem('oauth_state');

        if (!savedState) {
          setError('No state found in session - please try logging in again');
          setProcessing(false);
          return;
        }

        if (!state) {
          setError('No state parameter received from authorization server');
          setProcessing(false);
          return;
        }

        // Enhanced state validation with Base64 decoding
        let stateValid = false;
        let stateData = null;

        try {
          // Try to decode the received state
          const paddedState = state + '='.repeat((4 - (state.length % 4)) % 4);
          stateData = JSON.parse(atob(paddedState));

          // Validate against saved state
          if (state === savedState && stateData?.isChildAppAuth) {
            stateValid = true;
            console.log('✅ Enhanced state validation passed:', stateData);
          }
        } catch (error) {
          console.error('State decoding failed:', error);
        }

        if (!stateValid) {
          console.error('State mismatch:', {
            received: state,
            expected: savedState,
            decodedData: stateData
          });
          setError('Invalid state parameter - possible CSRF attack detected');
          setProcessing(false);
          return;
        }

        // Clear the saved state after successful validation
        sessionStorage.removeItem('oauth_state');

        // Exchange authorization code for tokens
        const response = await fetch('/api/auth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            code,
            state
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Token exchange failed');
        }

        const tokenData = await response.json();

        // Handle the authentication callback
        const success = await handleAuthCallback(
          tokenData.access_token,
          tokenData.refresh_token
        );

        if (success) {
          // Clean URL parameters
          const url = new URL(window.location.href);
          url.searchParams.delete('code');
          url.searchParams.delete('state');
          window.history.replaceState({}, '', url.pathname);

          // Check for post-login redirect
          const redirectUrl = sessionStorage.getItem('post_login_redirect');
          if (redirectUrl) {
            sessionStorage.removeItem('post_login_redirect');
            router.push(redirectUrl);
          } else {
            router.push('/dashboard');
          }
        } else {
          setError('Authentication failed');
          setProcessing(false);
        }
      } catch (err) {
        console.error('Callback error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setProcessing(false);
      }
    };

    handleCallback();

}, [searchParams, router, handleAuthCallback, handled]);

if (processing) {
return (
<div className='flex flex-col items-center justify-center min-h-screen bg-background'>
<div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4'></div>
<p className='text-muted-foreground'>Processing authentication...</p>
<p className='text-sm text-muted-foreground mt-2'>
Please wait, you will be redirected shortly.
</p>
</div>
);
}

if (error) {
return (
<div className='flex flex-col items-center justify-center min-h-screen bg-background p-4'>
<div className='w-full max-w-md text-center'>
<AlertTriangle className='mx-auto h-12 w-12 text-destructive mb-4' />
<h1 className='text-2xl font-bold text-destructive mb-2'>
Authentication Error
</h1>
<p className='text-muted-foreground mb-6'>{error}</p>
<button
onClick={() => router.push('/login')}
className='px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90' >
Return to Login
</button>
</div>
</div>
);
}

return null;
}

export default function CallbackPage() {
return (
<Suspense
fallback={
<div className='flex items-center justify-center min-h-screen'>
<div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary'></div>
</div>
} >
<CallbackContent />
</Suspense>
);
}

//lib/auth/auth-context,tsx:

'use client';

import React, {
createContext,
useContext,
useState,
useEffect,
ReactNode
} from 'react';
import parentAuthService, {
ParentAppUser,
AuthSession
} from './parent-auth-service';

interface AuthContextType {
user: ParentAppUser | null;
session: AuthSession | null;
isLoading: boolean;
isAuthenticated: boolean;
error: string | null;
login: (redirectUrl?: string) => void;
logout: (redirectToParent?: boolean) => void;
refreshSession: () => Promise<boolean>;
validateSession: () => Promise<boolean>;
hasPermission: (permission: string) => boolean;
hasRole: (role: string) => boolean;
hasAnyRole: (roles: string[]) => boolean;
handleAuthCallback: (
token: string,
refreshToken?: string
) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
children: ReactNode;
autoValidate?: boolean;
autoRefresh?: boolean;
refreshInterval?: number;
onAuthChange?: (user: ParentAppUser | null) => void;
onSessionExpired?: () => void;
}

export function AuthProvider({
children,
autoValidate = true,
autoRefresh = true,
refreshInterval = 10 _ 60 _ 1000, // 10 minutes
onAuthChange,
onSessionExpired
}: AuthProviderProps) {
const [user, setUser] = useState<ParentAppUser | null>(null);
const [session, setSession] = useState<AuthSession | null>(null);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

// Initialize auth on mount
useEffect(() => {
const initAuth = async () => {
try {
setIsLoading(true);
setError(null);

        // Get stored user and session
        const storedUser = parentAuthService.getUser();
        const storedSession = parentAuthService.getSession();

        if (storedUser && storedSession) {
          setUser(storedUser);
          setSession(storedSession);

          // Validate session if auto-validate is enabled
          if (autoValidate) {
            const isValid = await parentAuthService.validateSession();
            if (!isValid) {
              setUser(null);
              setSession(null);
            } else {
              // Update with fresh data
              const freshUser = parentAuthService.getUser();
              const freshSession = parentAuthService.getSession();
              setUser(freshUser);
              setSession(freshSession);
            }
          }
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        setError('Failed to initialize authentication');
        setUser(null);
        setSession(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

}, [autoValidate]);

// Auto-refresh token
useEffect(() => {
if (!autoRefresh || !user || !session) return;

    const refreshTimer = setInterval(async () => {
      try {
        const refreshed = await parentAuthService.refreshToken();
        if (refreshed) {
          const freshUser = parentAuthService.getUser();
          const freshSession = parentAuthService.getSession();
          setUser(freshUser);
          setSession(freshSession);
        } else {
          // Refresh failed, session expired
          setUser(null);
          setSession(null);
          if (onSessionExpired) {
            onSessionExpired();
          }
        }
      } catch (err) {
        console.error('Auto-refresh error:', err);
      }
    }, refreshInterval);

    return () => clearInterval(refreshTimer);

}, [autoRefresh, user, session, refreshInterval, onSessionExpired]);

// Notify auth changes
useEffect(() => {
if (onAuthChange) {
onAuthChange(user);
}
}, [user, onAuthChange]);

// Check auth callback params on mount
useEffect(() => {
const checkAuthCallback = async () => {
const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const refreshToken = params.get('refresh_token');

      // Skip if we're on the callback page (it will handle itself)
      if (window.location.pathname === '/auth/callback') {
        return;
      }

      if (token) {
        try {
          setIsLoading(true);
          const authUser = await parentAuthService.handleCallback(
            token,
            refreshToken || undefined
          );

          if (authUser) {
            setUser(authUser);
            const newSession = parentAuthService.getSession();
            setSession(newSession);

            // Clean URL
            const url = new URL(window.location.href);
            url.searchParams.delete('token');
            url.searchParams.delete('refresh_token');
            window.history.replaceState({}, '', url.toString());

            // Handle post-login redirect
            const redirectUrl = sessionStorage.getItem('post_login_redirect');
            if (redirectUrl) {
              sessionStorage.removeItem('post_login_redirect');
              window.location.href = redirectUrl;
              return;
            }
          }
        } catch (err) {
          console.error('Auth callback error:', err);
          setError('Authentication failed');
        } finally {
          setIsLoading(false);
        }
      }
    };

    checkAuthCallback();

}, []);

const login = (redirectUrl?: string) => {
parentAuthService.login(redirectUrl);
};

const logout = async (redirectToParent: boolean = false) => {
console.log(
'🔍 Child app logout initiated, redirectToParent:',
redirectToParent
);

    try {
      // Call the child app logout endpoint to preserve parent session
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_PARENT_APP_URL}/api/auth/child-app/logout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            app_id: process.env.NEXT_PUBLIC_APP_ID,
            session_id: session?.id,
            access_token: parentAuthService.getAccessToken(),
            redirect_uri: redirectToParent
              ? process.env.NEXT_PUBLIC_PARENT_APP_URL
              : window.location.origin
          })
        }
      );

      console.log('🔍 Logout response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('🔍 Logout response data:', data);
      }
    } catch (error) {
      console.error('Logout API error:', error);
      // Continue with local cleanup even if API call fails
    }

    // Clear local state and storage
    setUser(null);
    setSession(null);
    setError(null);

    // Clear stored tokens using parentAuthService method
    parentAuthService.clearSession();

    console.log('🔍 Local session cleared');

    // Redirect appropriately
    if (redirectToParent) {
      window.location.href =
        process.env.NEXT_PUBLIC_PARENT_APP_URL || 'https://my.jkkn.ac.in';
    } else {
      window.location.href = '/login';
    }

};

const refreshSession = async (): Promise<boolean> => {
try {
const success = await parentAuthService.refreshToken();
if (success) {
const freshUser = parentAuthService.getUser();
const freshSession = parentAuthService.getSession();
setUser(freshUser);
setSession(freshSession);
} else {
setUser(null);
setSession(null);
}
return success;
} catch (err) {
console.error('Refresh session error:', err);
setUser(null);
setSession(null);
return false;
}
};

const validateSession = async (): Promise<boolean> => {
try {
const isValid = await parentAuthService.validateSession();
if (isValid) {
const freshUser = parentAuthService.getUser();
const freshSession = parentAuthService.getSession();
setUser(freshUser);
setSession(freshSession);
} else {
setUser(null);
setSession(null);
}
return isValid;
} catch (err) {
console.error('Validate session error:', err);
setUser(null);
setSession(null);
return false;
}
};

const handleAuthCallback = async (
token: string,
refreshToken?: string
): Promise<boolean> => {
try {
setIsLoading(true);
setError(null);

      const authUser = await parentAuthService.handleCallback(
        token,
        refreshToken
      );
      if (authUser) {
        setUser(authUser);
        const newSession = parentAuthService.getSession();
        setSession(newSession);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Handle auth callback error:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
      return false;
    } finally {
      setIsLoading(false);
    }

};

const hasPermission = (permission: string): boolean => {
return parentAuthService.hasPermission(permission);
};

const hasRole = (role: string): boolean => {
return parentAuthService.hasRole(role);
};

const hasAnyRole = (roles: string[]): boolean => {
return parentAuthService.hasAnyRole(roles);
};

return (
<AuthContext.Provider
value={{
        user,
        session,
        isLoading,
        isAuthenticated: !!user,
        error,
        login,
        logout,
        refreshSession,
        validateSession,
        hasPermission,
        hasRole,
        hasAnyRole,
        handleAuthCallback
      }} >
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

// Additional hooks for convenience
export function useIsAuthenticated(): boolean {
const { isAuthenticated } = useAuth();
return isAuthenticated;
}

export function useCurrentUser(): ParentAppUser | null {
const { user } = useAuth();
return user;
}

export function usePermission(permission: string): boolean {
const { hasPermission } = useAuth();
return hasPermission(permission);
}

export function useRole(role: string): boolean {
const { hasRole } = useAuth();
return hasRole(role);
}

export function useAnyRole(roles: string[]): boolean {
const { hasAnyRole } = useAuth();
return hasAnyRole(roles);
}

export function useAuthLoading(): boolean {
const { isLoading } = useAuth();
return isLoading;
}

export function useAuthError(): string | null {
const { error } = useAuth();
return error;
}

export function useSession() {
const { session, validateSession, refreshSession } = useAuth();
return { session, validateSession, refreshSession };
}

//lib/auth/parent-auth-service.ts:

import axios, { AxiosInstance } from 'axios';
import Cookies from 'js-cookie';

export interface ParentAppUser {
id: string;
email: string;
full_name: string;
phone_number?: string;
role: string;
institution_id?: string;
is_super_admin?: boolean;
permissions: Record<string, boolean>;
profile_completed?: boolean;
avatar_url?: string;
last_login?: string;
}

export interface AuthSession {
id: string;
expires_at: string;
created_at: string;
last_used_at?: string;
}

export interface TokenResponse {
access_token: string;
refresh_token: string;
token_type: string;
expires_in: number;
user: ParentAppUser;
}

export interface ValidationResponse {
valid: boolean;
user?: ParentAppUser;
session?: AuthSession;
error?: string;
}

class ParentAuthService {
private api: AxiosInstance;
private refreshPromise: Promise<boolean> | null = null;

constructor() {
this.api = axios.create({
baseURL: process.env.NEXT_PUBLIC_PARENT_APP_URL,
timeout: 10000,
headers: {
'Content-Type': 'application/json',
'x-api-key': process.env.NEXT_PUBLIC_API_KEY || '' // Changed to lowercase
}
});

    // Add request interceptor to include auth header
    this.api.interceptors.request.use((config) => {
      const token = this.getAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Add response interceptor for token refresh
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401 && !error.config._retry) {
          error.config._retry = true;

          const refreshed = await this.refreshToken();
          if (refreshed) {
            const token = this.getAccessToken();
            error.config.headers.Authorization = `Bearer ${token}`;
            return this.api.request(error.config);
          }
        }
        return Promise.reject(error);
      }
    );

}

/\*\*

- Initiate OAuth login flow
  \*/
  login(redirectUrl?: string): void {
  const state = this.generateState();
  sessionStorage.setItem('oauth_state', state);


    if (redirectUrl) {
      sessionStorage.setItem('post_login_redirect', redirectUrl);
    }

    // Use the child app authorization endpoint
    const authUrl = new URL(
      '/auth/child-app/consent',
      process.env.NEXT_PUBLIC_PARENT_APP_URL!
    );
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', process.env.NEXT_PUBLIC_APP_ID!);
    authUrl.searchParams.append('app_id', process.env.NEXT_PUBLIC_APP_ID!);
    authUrl.searchParams.append(
      'redirect_uri',
      process.env.NEXT_PUBLIC_REDIRECT_URI!
    );
    authUrl.searchParams.append('scope', 'read write profile');
    authUrl.searchParams.append('state', state);

    // ADD THIS DEBUG LOG
    console.log('🔍 ParentAuthService Login URL:', authUrl.toString());
    console.log('🔍 Environment Variables:', {
      PARENT_APP_URL: process.env.NEXT_PUBLIC_PARENT_APP_URL,
      APP_ID: process.env.NEXT_PUBLIC_APP_ID,
      REDIRECT_URI: process.env.NEXT_PUBLIC_REDIRECT_URI
    });

    window.location.href = authUrl.toString();

}

async handleCallback(
token: string,
refreshToken?: string
): Promise<ParentAppUser | null> {
try {
console.log('HandleCallback called with:', {
hasToken: !!token,
tokenStart: token ? token.substring(0, 20) + '...' : 'none',
hasRefreshToken: !!refreshToken
});

      if (refreshToken) {
        this.setRefreshToken(refreshToken);
      }

      // Validate the token with parent app
      const validation = await this.validateToken(token);
      console.log('Validation result:', validation);

      // Add more detailed logging
      console.log('Validation details:', {
        isValid: validation.valid,
        hasUser: !!validation.user,
        hasSession: !!validation.session,
        userId: validation.user?.id,
        userEmail: validation.user?.email
      });

      if (validation.valid && validation.user) {
        console.log('Setting auth data...');
        this.setAccessToken(token);
        this.setUser(validation.user);

        if (validation.session) {
          this.setSession(validation.session);
        }

        // Clear OAuth state
        sessionStorage.removeItem('oauth_state');

        console.log(
          'Auth callback successful, returning user:',
          validation.user.email
        );
        return validation.user;
      }

      throw new Error(validation.error || 'Token validation failed');
    } catch (error) {
      console.error('Auth callback error:', error);
      this.clearSession();
      throw error;
    }

}

/\*\*

- Validate access token
  \*/
  async validateToken(token: string): Promise<ValidationResponse> {
  try {
  // Parent app expects only token and child_app_id
  const requestData = {
  token,
  child_app_id: process.env.NEXT_PUBLIC_APP_ID
  };

      console.log('Validating token with parent app:', {
        url: '/api/auth/child-app/validate',
        child_app_id: requestData.child_app_id,
        full_api_key: process.env.NEXT_PUBLIC_API_KEY,
        headers: {
          'x-api-key': process.env.NEXT_PUBLIC_API_KEY ? 'Set' : 'Not set'
        }
      });

      const response = await this.api.post(
        '/api/auth/child-app/validate',
        requestData
      );

      return response.data;

  } catch (error) {
  if (axios.isAxiosError(error)) {
  console.error(
  'Token validation error:',
  error.response?.data || error.message
  );
  console.error('Full error response:', {
  status: error.response?.status,
  statusText: error.response?.statusText,
  data: error.response?.data,
  headers: error.response?.headers
  });
  return {
  valid: false,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  error: error.response?.data?.error || 'Validation failed'
  };
  }

      console.error('Token validation error:', error);
      return {
        valid: false,
        error: 'Validation failed'
      };

  }
  }

/\*\*

- Refresh access token
  \*/
  async refreshToken(): Promise<boolean> {
  if (this.refreshPromise) {
  return this.refreshPromise;
  }


    this.refreshPromise = this._doRefreshToken();
    const result = await this.refreshPromise;
    this.refreshPromise = null;
    return result;

}

private async \_doRefreshToken(): Promise<boolean> {
try {
const refreshToken = this.getRefreshToken();
if (!refreshToken) {
throw new Error('No refresh token available');
}

      const response = await this.api.post('/api/auth/child-app/token', {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        app_id: process.env.NEXT_PUBLIC_APP_ID
        // API key is sent in header, not body
      });

      const data: TokenResponse = response.data;

      this.setAccessToken(data.access_token);
      this.setUser(data.user);

      // Update refresh token if provided
      if (data.refresh_token) {
        this.setRefreshToken(data.refresh_token);
      }

      return true;
    } catch (error) {
      console.error('Token refresh error:', error);
      this.clearSession();
      return false;
    }

}

/\*\*

- Logout from parent app
- Enhanced to support seamless re-authentication
  \*/
  logout(redirectToParent: boolean = true): void {
  console.log('🔍 Logout initiated, redirectToParent:', redirectToParent);


    // Clear local session first
    this.clearSession();

    if (redirectToParent) {
      const logoutUrl = new URL(
        '/api/auth/child-app/logout',
        process.env.NEXT_PUBLIC_PARENT_APP_URL!
      );

      // Enhanced logout with seamless re-auth support
      // The parent app will only clear child app session, not parent session
      window.location.href =
        logoutUrl.toString() +
        `?app_id=${
          process.env.NEXT_PUBLIC_APP_ID
        }&redirect_uri=${encodeURIComponent(
          window.location.origin
        )}&seamless_reauth=true`;
    }

}

/\*\*

- Check if user is authenticated
  \*/
  isAuthenticated(): boolean {
  const token = this.getAccessToken();
  const user = this.getUser();
  return !!(token && user);
  }

/\*\*

- Validate current session
  \*/
  async validateSession(): Promise<boolean> {
  const token = this.getAccessToken();
  if (!token) {
  return false;
  }


    try {
      const validation = await this.validateToken(token);

      if (validation.valid && validation.user) {
        // Update user data in case it changed
        this.setUser(validation.user);

        if (validation.session) {
          this.setSession(validation.session);
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error('Session validation error:', error);
      return false;
    }

}

/\*\*

- Check if user has specific permission
  \*/
  hasPermission(permission: string): boolean {
  const user = this.getUser();
  return user?.permissions?.[permission] === true;
  }

/\*\*

- Check if user has specific role
  \*/
  hasRole(role: string): boolean {
  const user = this.getUser();
  return user?.role === role;
  }

/\*\*

- Check if user has any of the specified roles
  \*/
  hasAnyRole(roles: string[]): boolean {
  const user = this.getUser();
  return user ? roles.includes(user.role) : false;
  }

// Token management methods
getAccessToken(): string | null {
return Cookies.get('access_token') || null;
}

private setAccessToken(token: string): void {
const isProduction = window.location.protocol === 'https:';
Cookies.set('access_token', token, {
expires: 1, // 1 day
secure: isProduction,
sameSite: isProduction ? 'strict' : 'lax',
path: '/'
});
}

private getRefreshToken(): string | null {
return Cookies.get('refresh_token') || null;
}

private setRefreshToken(token: string): void {
const isProduction = window.location.protocol === 'https:';
Cookies.set('refresh_token', token, {
expires: 30, // 30 days
secure: isProduction,
sameSite: isProduction ? 'strict' : 'lax',
path: '/'
});
}

getUser(): ParentAppUser | null {
try {
const userData = localStorage.getItem('user_data');
// Handle case where localStorage might contain the string "undefined"
if (userData && userData !== 'undefined') {
return JSON.parse(userData) as ParentAppUser;
}
return null;
} catch (error) {
console.error('Error getting user data:', error);
return null;
}
}

private setUser(user: ParentAppUser): void {
try {
localStorage.setItem('user_data', JSON.stringify(user));
localStorage.setItem('auth_timestamp', Date.now().toString());
} catch (error) {
console.error('Error saving user data:', error);
}
}

getSession(): AuthSession | null {
try {
const sessionData = localStorage.getItem('session_data');
// Handle case where localStorage might contain the string "undefined"
if (sessionData && sessionData !== 'undefined') {
return JSON.parse(sessionData) as AuthSession;
}
return null;
} catch (error) {
console.error('Error getting session data:', error);
return null;
}
}

private setSession(session: AuthSession): void {
try {
localStorage.setItem('session_data', JSON.stringify(session));
} catch (error) {
console.error('Error saving session data:', error);
}
}

clearSession(): void {
Cookies.remove('access_token');
Cookies.remove('refresh_token');
localStorage.removeItem('user_data');
localStorage.removeItem('session_data');
localStorage.removeItem('auth_timestamp');
sessionStorage.clear();
}

getApiClient(): AxiosInstance {
return this.api;
}

private generateState(): string {
// Enhanced state generation with child app context
const stateData = {
random:
Math.random().toString(36).substring(2, 15) +
Math.random().toString(36).substring(2, 15),
isChildAppAuth: true,
timestamp: Date.now(),
appId: process.env.NEXT_PUBLIC_APP_ID
};

    // Base64 encode without padding (Google strips '=' characters)
    return btoa(JSON.stringify(stateData)).replace(/=/g, '');

}
}

export default new ParentAuthService();

//app/login/page.tsx:

'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
Card,
CardContent,
CardDescription,
CardHeader,
CardTitle
} from '@/components/ui/card';
import { LogIn } from 'lucide-react';

export default function LoginPage() {
const { login, isAuthenticated, isLoading } = useAuth();
const router = useRouter();

useEffect(() => {
if (isAuthenticated) {
router.push('/dashboard');
}
}, [isAuthenticated, router]);

const handleLogin = () => {
console.log('Login button clicked');
login();
};

if (isLoading) {
return (
<div className='flex items-center justify-center min-h-screen bg-background'>
<div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary'></div>
</div>
);
}

if (isAuthenticated) {
return null;
}

return (
<div className='flex flex-col items-center justify-center min-h-screen bg-background p-4'>
<div className='mb-8 text-center'>
<h1 className='text-4xl font-bold'>MyJKKN Child App</h1>
<p className='text-muted-foreground'>Authentication Flow Test</p>
</div>
<Card className='w-full max-w-sm'>
<CardHeader className='text-center'>
<CardTitle className='text-2xl'>Welcome Back</CardTitle>
<CardDescription>
Click the button below to sign in via MyJKKN.
</CardDescription>
</CardHeader>
<CardContent>
<Button onClick={handleLogin} className='w-full' size='lg'>
<LogIn className='mr-2 h-4 w-4' /> Sign in with MyJKKN
</Button>
</CardContent>
</Card>
<footer className='mt-8 text-center text-sm text-muted-foreground'>
<p>
This is a test application for the MyJKKN parent authentication
system.
</p>
</footer>
</div>
);
}

//app/dashboard.tsx:

'use client';

import { RequireAuth } from '@/components/protected-route';
import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';
import {
Card,
CardContent,
CardDescription,
CardHeader,
CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, ShieldCheck, Activity, LogOut } from 'lucide-react';

export default function DashboardPage() {
return (
<RequireAuth>
<DashboardContent />
</RequireAuth>
);
}

function DashboardContent() {
const { user, logout } = useAuth();

return (
<div className='min-h-screen bg-background'>
<header className='bg-card border-b'>
<div className='container mx-auto py-4 px-6 flex justify-between items-center'>
<div>
<h1 className='text-2xl font-bold'>MyJKKN Child App</h1>
<p className='text-muted-foreground'>Dashboard</p>
</div>
<Button variant='outline' onClick={() => logout()}>
<LogOut className='mr-2 h-4 w-4' />
Logout
</Button>
</div>
</header>

      <main className='container mx-auto py-8 px-6'>
        <div className='mb-8'>
          <h2 className='text-3xl font-bold'>Welcome, {user?.full_name}!</h2>
          <p className='text-muted-foreground'>
            Here&apos;s an overview of your authenticated session.
          </p>
        </div>

        <div className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
          <Card>
            <CardHeader>
              <div className='flex items-center gap-4'>
                <User className='h-8 w-8 text-primary' />
                <div>
                  <CardTitle>Profile Information</CardTitle>
                  <CardDescription>Your account details</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className='space-y-3'>
                <div>
                  <span className='font-medium text-sm text-muted-foreground'>
                    Name
                  </span>
                  <p>{user?.full_name}</p>
                </div>
                <div>
                  <span className='font-medium text-sm text-muted-foreground'>
                    Email
                  </span>
                  <p>{user?.email}</p>
                </div>
                <div>
                  <span className='font-medium text-sm text-muted-foreground'>
                    Role
                  </span>
                  <div>
                    <Badge variant='secondary'>{user?.role}</Badge>
                  </div>
                </div>
                {user?.institution_id && (
                  <div>
                    <span className='font-medium text-sm text-muted-foreground'>
                      Institution
                    </span>
                    <p>{user.institution_id}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className='flex items-center gap-4'>
                <ShieldCheck className='h-8 w-8 text-primary' />
                <div>
                  <CardTitle>Permissions</CardTitle>
                  <CardDescription>Your current permissions</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className='space-y-2'>
                {user?.permissions &&
                Object.keys(user.permissions).length > 0 ? (
                  Object.entries(user.permissions).map(
                    ([permission, hasAccess]) => (
                      <div
                        key={permission}
                        className='flex justify-between items-center'
                      >
                        <span className='capitalize'>
                          {permission.replace(/_/g, ' ')}
                        </span>
                        <Badge variant={hasAccess ? 'default' : 'destructive'}>
                          {hasAccess ? 'Granted' : 'Denied'}
                        </Badge>
                      </div>
                    )
                  )
                ) : (
                  <p className='text-muted-foreground text-sm'>
                    No permissions data available.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className='flex items-center gap-4'>
                <Activity className='h-8 w-8 text-primary' />
                <div>
                  <CardTitle>Account Status</CardTitle>
                  <CardDescription>Your account information</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className='space-y-3'>
                <div className='flex justify-between items-center'>
                  <span>Profile Complete</span>
                  <Badge
                    variant={
                      user?.profile_completed ? 'default' : 'destructive'
                    }
                  >
                    {user?.profile_completed ? 'Yes' : 'No'}
                  </Badge>
                </div>
                <div className='flex justify-between items-center'>
                  <span>Super Admin</span>
                  <Badge
                    variant={user?.is_super_admin ? 'default' : 'secondary'}
                  >
                    {user?.is_super_admin ? 'Yes' : 'No'}
                  </Badge>
                </div>
                {user?.last_login && (
                  <div>
                    <span className='font-medium text-sm text-muted-foreground'>
                      Last Login
                    </span>
                    <p>{new Date(user.last_login).toLocaleString()}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>

);
}

//compoents/protected-routes.ts:

'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';

interface ProtectedRouteProps {
children: ReactNode;
fallback?: ReactNode;
redirectTo?: string;
requiredPermissions?: string[];
requiredRoles?: string[];
requireAnyRole?: boolean;
onUnauthorized?: () => void;
loadingComponent?: ReactNode;
}

const DefaultLoading = () => (

  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
);

export function ProtectedRoute({
children,
fallback,
redirectTo,
requiredPermissions = [],
requiredRoles = [],
requireAnyRole = true,
onUnauthorized,
loadingComponent
}: ProtectedRouteProps) {
const { user, isLoading, isAuthenticated, hasPermission, hasRole, hasAnyRole } = useAuth();
const router = useRouter();

useEffect(() => {
if (isLoading) return;

    if (!isAuthenticated) {
      if (redirectTo) {
        router.push(redirectTo);
      } else if (onUnauthorized) {
        onUnauthorized();
      }
      return;
    }

    // Check authorization
    const isAuthorized = checkAuthorization();
    if (!isAuthorized) {
      if (onUnauthorized) {
        onUnauthorized();
      } else if (fallback) {
        // Will be rendered below
      } else {
        router.push('/unauthorized');
      }
    }

}, [isLoading, isAuthenticated, user, router, redirectTo, onUnauthorized]);

const checkAuthorization = (): boolean => {
if (!user) return false;

    // Check permissions
    if (requiredPermissions.length > 0) {
      const hasAllPermissions = requiredPermissions.every(permission =>
        hasPermission(permission)
      );
      if (!hasAllPermissions) return false;
    }

    // Check roles
    if (requiredRoles.length > 0) {
      if (requireAnyRole) {
        const hasAnyRequiredRole = hasAnyRole(requiredRoles);
        if (!hasAnyRequiredRole) return false;
      } else {
        const hasAllRoles = requiredRoles.every(role => hasRole(role));
        if (!hasAllRoles) return false;
      }
    }

    return true;

};

if (isLoading) {
return loadingComponent ? <>{loadingComponent}</> : <DefaultLoading />;
}

if (!isAuthenticated) {
return fallback ? <>{fallback}</> : null;
}

if (!checkAuthorization()) {
return fallback ? <>{fallback}</> : null;
}

return <>{children}</>;
}

// Higher-order component wrapper
export function withAuth<P extends object>(
Component: React.ComponentType<P>,
options?: Omit<ProtectedRouteProps, 'children'>
) {
return function AuthenticatedComponent(props: P) {
return (
<ProtectedRoute {...options}>
<Component {...props} />
</ProtectedRoute>
);
};
}

// Convenience components
export function RequireAuth({
children,
redirectTo
}: {
children: ReactNode;
redirectTo?: string;
}) {
return (
<ProtectedRoute redirectTo={redirectTo || '/login'}>
{children}
</ProtectedRoute>
);
}

export function RequirePermission({
children,
permission,
fallback
}: {
children: ReactNode;
permission: string | string[];
fallback?: ReactNode;
}) {
const permissions = Array.isArray(permission) ? permission : [permission];

return (
<ProtectedRoute
      requiredPermissions={permissions}
      fallback={fallback}
    >
{children}
</ProtectedRoute>
);
}

export function RequireRole({
children,
role,
requireAll = false,
fallback
}: {
children: ReactNode;
role: string | string[];
requireAll?: boolean;
fallback?: ReactNode;
}) {
const roles = Array.isArray(role) ? role : [role];

return (
<ProtectedRoute
      requiredRoles={roles}
      requireAnyRole={!requireAll}
      fallback={fallback}
    >
{children}
</ProtectedRoute>
);
}

export function GuestOnly({
children,
redirectTo = '/'
}: {
children: ReactNode;
redirectTo?: string;
}) {
const { isAuthenticated, isLoading } = useAuth();
const router = useRouter();

useEffect(() => {
if (!isLoading && isAuthenticated) {
router.push(redirectTo);
}
}, [isAuthenticated, isLoading, router, redirectTo]);

if (isLoading) {
return <DefaultLoading />;
}

if (isAuthenticated) {
return null;
}

return <>{children}</>;
}

export function ConditionalAuth({
authenticated,
unauthenticated,
loading
}: {
authenticated: ReactNode;
unauthenticated: ReactNode;
loading?: ReactNode;
}) {
const { isAuthenticated, isLoading } = useAuth();

if (isLoading) {
return loading ? <>{loading}</> : <DefaultLoading />;
}

return isAuthenticated ? <>{authenticated}</> : <>{unauthenticated}</>;
}

# MyJKKN Parent App Configuration

NEXT_PUBLIC_PARENT_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_ID=child_app_mel9u5y7
NEXT_PUBLIC_API_KEY=app_0d5ac6f5d907bdeb_e07471d89a650d88

# Development redirect URI (child app on port 3001)

NEXT_PUBLIC_REDIRECT_URI=http://localhost:3001/auth/callback

# Production redirect URI (uncomment for production):

# NEXT_PUBLIC_REDIRECT_URI=https://your-app.com/auth/callback

# JWT Secret for token verification

NEXT_PUBLIC_JWT_SECRET=UqQFhiCyE2kOQIy8np3S2C9XYqDAUbYXmC/2ojVif88=

# Optional: Enable debug logging

NEXT_PUBLIC_AUTH_DEBUG=true
