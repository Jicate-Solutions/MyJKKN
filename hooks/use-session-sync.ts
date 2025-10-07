// hooks/use-session-sync.ts
import { useEffect, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { Database } from '@/types/supabase';

export function useSessionSync() {
  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const router = useRouter();
  const { refreshUser } = useAuth();

  // Use ref to store the latest refreshUser without triggering re-renders
  const refreshUserRef = useRef(refreshUser);
  refreshUserRef.current = refreshUser;

  useEffect(() => {
    // Listen for auth state changes
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Add a small delay to prevent race conditions with permission loading
      await new Promise(resolve => setTimeout(resolve, 100));

      if (event === 'SIGNED_IN') {
        await refreshUserRef.current();
        router.refresh();
      } else if (event === 'SIGNED_OUT') {
        router.push('/auth/login');
      } else if (event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
        // Handle role updates and token refresh
        await refreshUserRef.current();
        router.refresh();
      }
    });

    // Set up realtime subscription for profile changes
    const setupProfileSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      return supabase
        .channel('profile-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}`
          },
          async () => {
            await refreshUserRef.current();
            router.refresh();
          }
        )
        .subscribe();
    };

    let profileSubscription: any = null;
    setupProfileSubscription().then((sub) => {
      profileSubscription = sub;
    });

    return () => {
      subscription.unsubscribe();
      if (profileSubscription) {
        profileSubscription.unsubscribe();
      }
    };
    // Only depend on stable references, not functions
  }, [supabase, router]);
}
