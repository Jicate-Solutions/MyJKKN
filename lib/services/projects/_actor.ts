/**
 * Actor helper — resolves the current authenticated user's profile id.
 *
 * auth.users.id == profiles.id (1:1), so supabase.auth.getUser().user.id
 * IS the profiles.id.  Actor columns that FK to profiles(id) can be set
 * directly to this value.
 *
 * Returns null when the client is unauthenticated or getUser() fails.
 * Callers should treat null as "leave the column null" — never throw.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function getCurrentActorId(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
