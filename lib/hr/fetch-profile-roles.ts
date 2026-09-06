import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Resolve profile ids -> profiles.role, in chunks.
 *
 * PostgREST puts `.in()` lists in the QUERY STRING, so a single call with every
 * staff profile id builds a ~32 KB URL (863 ids x 37 chars) and the server
 * rejects it with a bare `{ message: 'Bad Request' }` — no hint that length is
 * the cause. That is exactly how the biometric import template died on
 * 2026-08-06.
 *
 * 150 ids per request is ~5.5 KB of query string, comfortably inside every
 * proxy default, and 863 staff costs 6 round trips.
 *
 * Errors are thrown, never swallowed: a partial role map silently reclassifies
 * faculty as "role skipped", which would look like a data problem rather than a
 * failed request.
 */
const CHUNK = 150;

export async function fetchProfileRoles(
  supabase: SupabaseClient,
  profileIds: string[],
): Promise<Map<string, string | null>> {
  const roleByProfile = new Map<string, string | null>();
  const unique = [...new Set(profileIds.filter(Boolean))];
  if (unique.length === 0) return roleByProfile;

  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const { data, error } = await supabase.from('profiles').select('id, role').in('id', slice);
    if (error) throw error;
    for (const p of (data ?? []) as Array<{ id: string; role: string | null }>) {
      roleByProfile.set(p.id, p.role);
    }
  }

  return roleByProfile;
}
