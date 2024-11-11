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
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import {
  AuthChangeEvent,
  RealtimePostgresChangesPayload
} from '@supabase/supabase-js';
import { useSessionSync } from '@/hooks/use-session-sync';

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
  const supabase = createClientComponentClient();

  const refreshUser = useCallback(async () => {
    try {
      setLoading(true);
      const profile = await AuthService.getUserProfile();
      
      if (!profile) {
        // If no profile, check if we're actually logged in
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setUser(null);
          return;
        }
      }
      
      setUser(profile);
    } catch (error) {
      console.error('Error refreshing user:', error);
      // On error, verify session and redirect if needed
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
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
      router.push('/auth/login');
      toast.success('Signed out successfully');
    } catch (error) {
      console.error('Sign out error:', error);
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
