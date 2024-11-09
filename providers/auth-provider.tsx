// providers/auth-provider.tsx
'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode
} from 'react';
import { useRouter } from 'next/navigation';
import { Profile } from '@/types/auth';
import { AuthService } from '@/lib/auth/auth-service';
import { toast } from 'react-hot-toast';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { AuthChangeEvent } from '@supabase/supabase-js';

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

  const refreshUser = async () => {
    try {
      const profile = await AuthService.getUserProfile();
      setUser(profile);
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  const signOut = async () => {
    try {
      await AuthService.signOut();
      setUser(null);
      router.push('/auth/login');
      toast.success('Signed out successfully');
    } catch (error) {
      toast.error('Error signing out');
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        await refreshUser();
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setLoading(false);
      }
    };

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent) => {
      if (event === 'SIGNED_IN') {
        await refreshUser();
        router.refresh();
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        router.push('/auth/login');
      }
    });

    initAuth();

    return () => {
      subscription.unsubscribe();
    };
  }, [router, supabase.auth]);

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
