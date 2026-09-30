// lib/auth/the-director-list.ts
// ============================================================================
// Server-only check: is a profile on the Director list?
//
// "The Director" is ONE named list (platform_policies key
// 'platform.the_director_profile_ids', migration 20270520090000), not every
// super admin. In the database, fn_is_the_director() answers for the signed-in
// caller. Server code sometimes has to ask about SOMEONE ELSE — the "preview
// as" start route must refuse to mint a real session for anyone on the list,
// or any super admin could preview as the Director and add themselves.
//
// Mirrors fn_is_the_director(): the global, active row whose value is a JSON
// array containing the id. Missing row, switched-off row or not an array =>
// not listed. A read error => null ("could not tell"); callers must treat that
// as a refusal, never as "not listed".
//
// Needs a SERVICE-ROLE client: only super admins and listed people can read
// the row through RLS. Never import this from a 'use client' file.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export const THE_DIRECTOR_LIST_KEY = 'platform.the_director_profile_ids';

export async function isOnTheDirectorList(
  serviceClient: SupabaseClient,
  profileId: string,
): Promise<boolean | null> {
  const { data, error } = await serviceClient
    .from('platform_policies')
    .select('value, is_active')
    .eq('policy_key', THE_DIRECTOR_LIST_KEY)
    .eq('scope_type', 'global')
    .is('scope_id', null)
    .maybeSingle();

  if (error) return null;
  if (!data || data.is_active !== true || !Array.isArray(data.value)) return false;

  const id = profileId.toLowerCase();
  return data.value.some((v: unknown) => typeof v === 'string' && v.toLowerCase() === id);
}
