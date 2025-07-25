// providers/auth-provider.tsx
'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback
} from 'react';
import { useRouter } from 'next/navigation';
import { Profile } from '@/types/auth';
import { AuthService } from '@/lib/auth/auth-service';
import { toast } from 'react-hot-toast';
import { createBrowserClient } from '@supabase/ssr';
import { useSessionSync } from '@/hooks/use-session-sync';
import { Database } from '@/types/supabase';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const refreshUser = useCallback(async () => {
    try {
      setLoading(true);
      const profile = await AuthService.getUserProfile();

      if (!profile) {
        // If no profile, check if we're actually logged in
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          setUser(null);
          return;
        }
      }

      // Check if user account is active
      if (profile && profile.is_active === false) {
        // Sign out inactive user and redirect to unauthorized page
        await supabase.auth.signOut();
        setUser(null);
        router.push('/unauthorized?reason=inactive');
        toast.error(
          'Your account has been deactivated. Please contact your administrator.'
        );
        return;
      }

      setUser(profile);
    } catch (error) {
      // On error, verify auth and redirect if needed
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data.user) {
        setUser(null);
        router.push('/auth/login');
      }
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  const signOut = async () => {
    try {
      await AuthService.signOut();
      setUser(null);

      // Disable Google One Tap auto-login
      if (window.google) {
        window.google.accounts.id.disableAutoSelect();
      }

      router.push('/auth/login');
      // Note: AuthService.signOut() already shows success toast, so we don't need to show it here
    } catch (error) {
      toast.error('Error signing out');
    }
  };

  // Initial auth check
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Use the session sync hook
  useSessionSync();

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
