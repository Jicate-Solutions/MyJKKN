import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/** Shared admin gate for the clusters API (module convention:
 *  same hardcoded role set the rest of /admin/bug-reports uses). */
export async function requireBugAdmin(): Promise<
  { user: { id: string }; response: null } | { user: null; response: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return {
      user: null,
      response: NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    };
  }
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (
    profileError ||
    !profile ||
    (!(profile as any).is_super_admin && !['super_admin', 'administrator', 'ceo'].includes(profile.role))
  ) {
    return {
      user: null,
      response: NextResponse.json({ error: 'Admin permissions required' }, { status: 403 })
    };
  }
  return { user: { id: user.id }, response: null };
}
