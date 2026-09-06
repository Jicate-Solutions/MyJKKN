/**
 * Actor helper — resolves the current authenticated user's profile id.
 *
 * auth.users.id == profiles.id (1:1), so the session user's id IS the
 * profiles.id. Actor columns that FK to profiles(id) can be set directly.
 *
 * Uses getSession() — reads the locally-cached session (instant, no network
 * round-trip) — NOT getUser(), which revalidates the token against the auth
 * server on every call and can stall any mutation that awaits it (observed:
 * change-request create hung on "Creating…" indefinitely). For "who is logged
 * in right now" attribution, the cached session is the correct source.
 *
 * Never throws: an unauthenticated client or a failed lookup returns null, so
 * a missing actor degrades to a null column instead of blocking the write.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function getCurrentActorId(
  supabase: SupabaseClient
): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}
