// lib/services/schools-network/profile-names.ts
// ============================================================================
// Batch profile-name lookup for schools-network reads.
//
// Why this exists: school_sessions.conducted_by_user_id and
// school_jkkn_owners.jkkn_user_id are FKs to auth.users(id) — NOT to
// public.profiles — so a PostgREST embedded join like
// `profiles:conducted_by_user_id(full_name)` cannot resolve ("Could not find
// a relationship … in the schema cache") and 500s the whole list. profiles.id
// is 1:1 with auth.users.id (platform identity chain), so we fetch the names
// in a second RLS-scoped query and merge in JS instead.
//
// Names are cosmetic: a lookup failure (or RLS hiding a profile from the
// caller) degrades to a missing name, never a failed list.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export async function fetchProfileNames(
  supabase: SupabaseClient,
  userIds: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', unique);
  if (error || !data) return new Map();

  return new Map(
    data.map((r: { id: string; full_name: string | null }) => [
      r.id,
      r.full_name ?? '',
    ])
  );
}
