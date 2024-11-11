// hooks/use-session-sync.ts
import { useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';

export function useSessionSync() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const { refreshUser } = useAuth();

  useEffect(() => {
    // Listen for auth state changes
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN') {
        await refreshUser();
        router.refresh();
      } else if (event === 'SIGNED_OUT') {
        router.push('/auth/login');
      } else if (event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
        // Handle role updates and token refresh
        await refreshUser();
        router.refresh();
      }
    });

    // Set up realtime subscription for profile changes
    const profileSubscription = supabase
      .channel('profile-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${supabase.auth
            .getUser()
            .then(({ data }) => data.user?.id)}`
        },
        async () => {
          await refreshUser();
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
      profileSubscription.unsubscribe();
    };
  }, [supabase, router, refreshUser]);
}
