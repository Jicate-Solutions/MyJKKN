// providers/auth-provider.tsx
'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useRef,
  useMemo
} from 'react';
import { useRouter } from 'next/navigation';
import { Profile } from '@/types/auth';
import { AuthService } from '@/lib/auth/auth-service';
import { toast } from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface AuthContextType {
  user: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
  refreshUser: async () => {}
});

// Cache configuration
const PROFILE_CACHE_TIME = 5 * 60 * 1000; // 5 minutes
const DEBOUNCE_TIME = 2000; // 2 seconds

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Memoize Supabase client to ensure stable reference across re-renders
  // This prevents creating new auth subscriptions on every render
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  // Cache management
  const lastFetchTime = useRef<number>(0);
  const lastRefreshTimestamp = useRef<number>(0);
  const profileCache = useRef<Profile | null>(null);
  const isFetchingRef = useRef(false);

  const refreshUser = useCallback(async () => {
    const now = Date.now();

    // Debounce: Prevent rapid successive calls
    if (now - lastRefreshTimestamp.current < DEBOUNCE_TIME) {
      console.log('[AuthProvider] Debounced refresh call');
      return;
    }

    // Prevent concurrent fetches
    if (isFetchingRef.current) {
      console.log('[AuthProvider] Already fetching, skipping');
      return;
    }

    // Check cache validity
    if (
      profileCache.current &&
      now - lastFetchTime.current < PROFILE_CACHE_TIME
    ) {
      console.log('[AuthProvider] Using cached profile');

      // CRITICAL: Even with cached data, ALWAYS verify is_active status
      // This prevents deactivated users from accessing the system during cache window
      if (profileCache.current.is_active === false) {
        console.warn('[AuthProvider] Cached user is inactive, signing out');
        try {
          await supabase.auth.signOut();
          setUser(null);
          profileCache.current = null;
          router.push('/unauthorized?reason=inactive');
          toast.error(
            'Your account has been deactivated. Please contact your administrator.'
          );
        } catch (error) {
          console.error('[AuthProvider] Error signing out inactive user:', error);
        } finally {
          setLoading(false);
        }
        return;
      }

      setUser(profileCache.current);
      setLoading(false);
      return;
    }

    try {
      isFetchingRef.current = true;
      lastRefreshTimestamp.current = now;
      setLoading(true);

      const profile = await AuthService.getUserProfile();

      if (!profile) {
        // If no profile, check if we're actually logged in
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          setUser(null);
          profileCache.current = null;
          return;
        }
      }

      // Check if user account is active
      if (profile && profile.is_active === false) {
        // Sign out inactive user and redirect to unauthorized page
        try {
          await supabase.auth.signOut();
        } catch (signOutError) {
          console.error('[AuthProvider] Error signing out inactive user:', signOutError);
          // Continue with cleanup even if sign out fails
        }

        setUser(null);
        profileCache.current = null;

        try {
          router.push('/unauthorized?reason=inactive');
        } catch (routerError) {
          console.error('[AuthProvider] Error routing to unauthorized:', routerError);
          // Fallback to direct navigation if router fails
          if (typeof window !== 'undefined') {
            window.location.href = '/unauthorized?reason=inactive';
          }
        }

        toast.error(
          'Your account has been deactivated. Please contact your administrator.'
        );
        return;
      }

      // Update cache and state
      profileCache.current = profile;
      lastFetchTime.current = now;
      setUser(profile);
    } catch (error) {
      console.error('[AuthProvider] Error fetching profile:', error);

      // On error, verify auth and redirect if needed
      // Wrap in try-catch to prevent error handler from crashing
      try {
        const { data, error: userError } = await supabase.auth.getUser();
        if (userError || !data.user) {
          setUser(null);
          profileCache.current = null;

          try {
            router.push('/auth/login');
          } catch (routerError) {
            console.error('[AuthProvider] Error routing to login:', routerError);
            // Fallback to direct navigation if router fails
            if (typeof window !== 'undefined') {
              window.location.href = '/auth/login';
            }
          }
        }
      } catch (authCheckError) {
        console.error('[AuthProvider] Error checking auth in error handler:', authCheckError);
        // Last resort: clear state and force page reload to login
        setUser(null);
        profileCache.current = null;
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [supabase, router]);

  const signOut = async () => {
    try {
      await AuthService.signOut();
      setUser(null);
      profileCache.current = null;
      lastFetchTime.current = 0;

      // Disable Google One Tap auto-login
      if (window.google) {
        window.google.accounts.id.disableAutoSelect();
      }

      try {
        router.push('/auth/login');
      } catch (routerError) {
        console.error('[AuthProvider] Error routing after sign out:', routerError);
        // Fallback to direct navigation if router fails
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
      }
    } catch (error) {
      console.error('[AuthProvider] Sign out error:', error);
      toast.error('Error signing out');
    }
  };

  // Initial auth check on mount
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Optimized session sync - only listen to critical auth events
  useEffect(() => {
    const handleAuthChange = async (event: string) => {
      const now = Date.now();

      // Debounce auth change handler
      if (now - lastRefreshTimestamp.current < DEBOUNCE_TIME) {
        return;
      }

      // Add a small delay to prevent race conditions
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (event === 'SIGNED_IN') {
        await refreshUser();
        router.refresh();
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        profileCache.current = null;
        router.push('/auth/login');
      } else if (event === 'USER_UPDATED') {
        // Force refresh on user update
        profileCache.current = null;
        await refreshUser();
      } else if (event === 'TOKEN_REFRESHED') {
        // Token refresh doesn't need profile refresh
        // Profile data hasn't changed, just the token
        console.log('[AuthProvider] Token refreshed, no profile fetch needed');
      }
    };

    // Listen for auth state changes
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      await handleAuthChange(event);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, router, refreshUser]);

  // REMOVED: Realtime subscription to profile changes
  // This was causing excessive queries whenever any profile field changed
  // If you need to detect external profile changes, implement a manual refresh button instead

  return (
    <AuthContext.Provider value={{ user, loading, signOut, refreshUser }}>
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
