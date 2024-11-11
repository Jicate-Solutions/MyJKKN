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

  const signOut = useCallback(async () => {
    try {
      setLoading(true);
      await AuthService.signOut();
      setUser(null);
      router.push('/auth/login');
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error('Failed to sign out');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await AuthService.getUserProfile();
      if (profile) {
        setUser(profile);
      } else {
        // If no profile is found, sign out
        await signOut();
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
      toast.error('Failed to refresh user profile');
    }
  }, [signOut]);

  // Set up realtime subscription
  useEffect(() => {
    if (!user?.id) return;

    // Subscribe to profile changes
    const channel = supabase
      .channel('profile-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}` // Only listen to current user's profile
        },
        async (payload: RealtimePostgresChangesPayload<Profile>) => {
          console.log('Profile changed:', payload);

          if (payload.eventType === 'DELETE') {
            // Profile deleted - sign out
            await signOut();
            return;
          }

          if (payload.eventType === 'UPDATE') {
            const newProfile = payload.new as Profile;

            // Check if role changed
            if (newProfile.role !== user.role) {
              toast.success('Your user role has been updated');

              // Check if new role has access
              if (
                ![
                  'student',
                  'faculty',
                  'staff',
                  'administrator',
                  'super_admin'
                ].includes(newProfile.role)
              ) {
                toast.error('Your access has been revoked');
                await signOut();
                return;
              }
            }

            // Update local user state
            setUser(newProfile);
          }
        }
      )
      .subscribe();

    // Cleanup subscription
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, supabase]);

  // Handle auth state changes
  useEffect(() => {
    const initAuth = async () => {
      try {
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (session) {
          await refreshUser();
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setLoading(false);
      }
    };

    // Set up auth state change listener
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
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
  }, [refreshUser, router, supabase.auth]);

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
