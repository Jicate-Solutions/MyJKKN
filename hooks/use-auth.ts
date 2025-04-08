'use client';

import { useEffect, useState } from 'react';
import { createAdminClient } from '@/lib/supabase/client';
import type { Profile } from '@/types/supabase';

export function useAuth() {
  const [user, setUser] = useState<(Profile & { id: string }) | null>(null);
  const supabase = createAdminClient();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (user) {
        // Get user role from your profiles table
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (profile) {
          setUser({ ...profile, id: user.id });
        }
      }
    };

    getUser();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          setUser({ ...profile, id: session.user.id });
        }
      } else {
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { user };
}
