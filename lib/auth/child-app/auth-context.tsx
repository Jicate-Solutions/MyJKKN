'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode
} from 'react';
import { parentAuth, ParentAppUser, AuthSession } from './parent-auth-service';

// Auth context types
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

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider props
interface AuthProviderProps {
  children: ReactNode;
  autoValidate?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
  onAuthChange?: (user: ParentAppUser | null) => void;
  onSessionExpired?: () => void;
}

/**
 * Auth Provider Component
 */
export function AuthProvider({
  children,
  autoValidate = true,
  autoRefresh = true,
  refreshInterval = 10 * 60 * 1000, // 10 minutes
  onAuthChange,
  onSessionExpired
}: AuthProviderProps) {
  const [user, setUser] = useState<ParentAppUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize auth state from cookies
  useEffect(() => {
    const initAuth = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Get stored user and session
        const storedUser = parentAuth.getUser();
        const storedSession = parentAuth.getSession();

        if (storedUser) {
          setUser(storedUser);
          setSession(storedSession);

          // Validate session if enabled
          if (autoValidate) {
            const isValid = await parentAuth.validateSession();
            if (isValid) {
              // Update with fresh data from validation
              const freshUser = parentAuth.getUser();
              const freshSession = parentAuth.getSession();
              setUser(freshUser);
              setSession(freshSession);
            } else {
              // Session invalid, clear state
              setUser(null);
              setSession(null);
              if (onSessionExpired) {
                onSessionExpired();
              }
            }
          }
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        setError('Failed to initialize authentication');
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [autoValidate, onSessionExpired]);

  // Set up auto-refresh
  useEffect(() => {
    if (!autoRefresh || !user || !session) {
      return;
    }

    const refreshTimer = setInterval(async () => {
      try {
        const refreshed = await parentAuth.refreshToken();
        if (refreshed) {
          const freshUser = parentAuth.getUser();
          const freshSession = parentAuth.getSession();
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
      const state = params.get('state');

      if (token) {
        try {
          setIsLoading(true);
          const authUser = await parentAuth.handleCallback(
            token,
            refreshToken || undefined,
            state || undefined
          );

          if (authUser) {
            setUser(authUser);
            setSession(parentAuth.getSession());

            // Clean up URL
            const url = new URL(window.location.href);
            url.searchParams.delete('token');
            url.searchParams.delete('refresh_token');
            url.searchParams.delete('expires_in');
            url.searchParams.delete('state');
            window.history.replaceState({}, '', url.toString());
          }
        } catch (err) {
          console.error('Auth callback error:', err);
          setError('Failed to process authentication');
        } finally {
          setIsLoading(false);
        }
      }
    };

    checkAuthCallback();
  }, []);

  // Auth methods
  const login = useCallback((redirectUrl?: string) => {
    parentAuth.login(redirectUrl);
  }, []);

  const logout = useCallback((redirectToParent: boolean = true) => {
    parentAuth.logout(redirectToParent);
    setUser(null);
    setSession(null);
  }, []);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      setError(null);
      const refreshed = await parentAuth.refreshToken();

      if (refreshed) {
        const freshUser = parentAuth.getUser();
        const freshSession = parentAuth.getSession();
        setUser(freshUser);
        setSession(freshSession);
        return true;
      }

      return false;
    } catch (err) {
      console.error('Session refresh error:', err);
      setError('Failed to refresh session');
      return false;
    }
  }, []);

  const validateSession = useCallback(async (): Promise<boolean> => {
    try {
      setError(null);
      const isValid = await parentAuth.validateSession();

      if (isValid) {
        const freshUser = parentAuth.getUser();
        const freshSession = parentAuth.getSession();
        setUser(freshUser);
        setSession(freshSession);
        return true;
      }

      setUser(null);
      setSession(null);
      return false;
    } catch (err) {
      console.error('Session validation error:', err);
      setError('Failed to validate session');
      return false;
    }
  }, []);

  const hasPermission = useCallback((permission: string): boolean => {
    return parentAuth.hasPermission(permission);
  }, []);

  const hasRole = useCallback((role: string): boolean => {
    return parentAuth.hasRole(role);
  }, []);

  const hasAnyRole = useCallback((roles: string[]): boolean => {
    return parentAuth.hasAnyRole(roles);
  }, []);

  const handleAuthCallback = useCallback(
    async (token: string, refreshToken?: string): Promise<boolean> => {
      try {
        setIsLoading(true);
        setError(null);

        const authUser = await parentAuth.handleCallback(token, refreshToken);

        if (authUser) {
          setUser(authUser);
          setSession(parentAuth.getSession());
          return true;
        }

        return false;
      } catch (err) {
        console.error('Auth callback error:', err);
        setError('Failed to process authentication');
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const contextValue: AuthContextType = {
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
  };

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

/**
 * Hook to use auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

/**
 * Hook to check if user is authenticated
 */
export function useIsAuthenticated(): boolean {
  const { isAuthenticated } = useAuth();
  return isAuthenticated;
}

/**
 * Hook to get current user
 */
export function useCurrentUser(): ParentAppUser | null {
  const { user } = useAuth();
  return user;
}

/**
 * Hook to check permissions
 */
export function usePermission(permission: string): boolean {
  const { hasPermission } = useAuth();
  return hasPermission(permission);
}

/**
 * Hook to check role
 */
export function useRole(role: string): boolean {
  const { hasRole } = useAuth();
  return hasRole(role);
}

/**
 * Hook to check multiple roles
 */
export function useAnyRole(roles: string[]): boolean {
  const { hasAnyRole } = useAuth();
  return hasAnyRole(roles);
}

/**
 * Hook for auth loading state
 */
export function useAuthLoading(): boolean {
  const { isLoading } = useAuth();
  return isLoading;
}

/**
 * Hook for auth error state
 */
export function useAuthError(): string | null {
  const { error } = useAuth();
  return error;
}

/**
 * Hook for session management
 */
export function useSession() {
  const { session, refreshSession, validateSession } = useAuth();

  return {
    session,
    refresh: refreshSession,
    validate: validateSession,
    isExpired: session ? new Date(session.expires_at) < new Date() : true
  };
}

// Export everything
export { AuthContext, type AuthContextType, type AuthProviderProps };
