// lib/services/meetings/handle-redirect.ts
//
// Turns a dead /meet/<handle> into a forward, when that handle is one an admin
// retired rather than one that never existed.
//
// WHY IT IS A SEPARATE MODULE
//   Two public routes need identical behaviour — /meet/<handle> and
//   /meet/<handle>/<type>. Two copies of "look it up, then redirect" is two
//   places to forget the lookup, and the failure mode is silent: the page 404s
//   exactly as it did before, so nobody notices the forward stopped working.
//
// SERVICE ROLE ON PURPOSE
//   The visitor is anonymous. meeting_host_page_handles is deliberately closed
//   to anon (see 20260810110000) so a stranger cannot enumerate hosts by
//   guessing addresses, which means the lookup has to run server-side with the
//   service role — the same client the /meet page already uses to resolve a
//   host. anon gains no read access from this.

import { createClient } from '@supabase/supabase-js';

/**
 * The host's CURRENT handle if `handle` is a retired address, otherwise null.
 *
 * null covers both "never existed" and "exists but is not bookable" — the
 * caller must keep rendering its usual 404 for those, so this can never be used
 * to tell a real-but-private handle apart from a fictional one.
 */
export async function resolveRetiredHandle(handle: string): Promise<string | null> {
  const wanted = handle.toLowerCase().trim();
  if (!wanted) return null;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: retired } = await supabase
      .from('meeting_host_page_handles')
      .select('host_profile_id')
      .eq('handle', wanted)
      .maybeSingle();

    if (!retired?.host_profile_id) return null;

    const { data: current } = await supabase
      .from('meeting_host_pages')
      .select('handle, is_public, auto_hidden')
      .eq('host_profile_id', retired.host_profile_id)
      .maybeSingle();

    // Only forward to somewhere a stranger is allowed to land. If the page has
    // since been unpublished or auto-hidden, the old link must 404 like any
    // other private page — forwarding to it would leak that the host exists.
    if (!current?.handle || !current.is_public || current.auto_hidden) return null;
    if (current.handle.toLowerCase() === wanted) return null; // nothing to do

    return current.handle;
  } catch {
    // A forward is a courtesy, never a dependency. If the lookup fails the
    // caller 404s, which is what would have happened without this module at all.
    return null;
  }
}
