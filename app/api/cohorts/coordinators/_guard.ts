// app/api/cohorts/coordinators/_guard.ts
// The API-route layer of the super-admin-only gate on cohort coordinator
// appointments (Director decision, 2026-08-02).
//
// This is layer 2 of 4. Layer 1 is the page guard in
// app/(routes)/cohorts/coordinators/page.tsx, layer 3 is RLS on
// public.cohort_coordinators, layer 4 is the COALESCE(is_super_admin(), false)
// check inside each SECURITY DEFINER RPC. A gate on only one layer produces a
// screen that opens and returns empty, which reads as "no data" rather than
// "no access" — so all four say the same thing, and this one says it out loud
// with a message naming who to contact (CLAUDE.md rule 27).
//
// Deliberately narrower than the repo's usual is_super_admin() OR is_admin():
// is_admin() is true for role 'administrator' too, which two non-super-admins
// hold, and including them would silently widen appointment authority past the
// Director's decision.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export const SUPER_ADMIN_ONLY_MESSAGE =
  'Only super administrators can appoint or remove cohort coordinators. ' +
  'If you need a change here, ask a super administrator (Role Management → Users) to make it, ' +
  'or to grant you super administrator access.';

export interface SuperAdminCaller {
  supabase: SupabaseClient;
  userId: string;
}

/**
 * Resolves the caller and confirms they are a super administrator.
 * Reads profiles.is_super_admin with an explicit `=== true` so a NULL never
 * falls through as permitted.
 *
 * Returns a NextResponse when the caller is refused, so every route body reads
 * `if (guard instanceof NextResponse) return guard;` — one line, and the refusal
 * always carries its message.
 */
export async function requireSuperAdmin(): Promise<SuperAdminCaller | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'You are not signed in.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  if (profile?.is_super_admin !== true) {
    return NextResponse.json({ error: SUPER_ADMIN_ONLY_MESSAGE }, { status: 403 });
  }

  return { supabase, userId: user.id };
}
