// app/api/public/interview-booking/book/active-staff.ts
//
// Is the person on the other end of this request a member of staff booking
// FOR a candidate (#1)? Shared by the page and all three interview-booking
// routes so they can never disagree about who counts.
//
// "Staff" means an ACTIVE staff row tied to the signed-in profile — not merely
// a signed-in MyJKKN account. A learner or a parent is signed in too, and they
// are booking for themselves; only staff book on someone else's behalf.
//
// The session is read with the viewer's cookie; the staff row with the
// SERVICE-ROLE client the caller already holds, because the page and routes
// are public and must not depend on what RLS lets a given role read about
// itself. Any failure means "not staff" — the visitor then goes through the
// ordinary guest path with its rate limit, which is the safe direction.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

export interface ActiveStaffBooker {
  profileId: string;
  name: string;
}

/** The signed-in user's id, or null for an anonymous visitor. Never throws. */
export async function getSignedInUserId(): Promise<string | null> {
  try {
    const ssr = await createServerClient();
    const {
      data: { user },
    } = await ssr.auth.getUser();
    return user?.id ?? null;
  } catch {
    // No or invalid cookie is normal on a public page.
    return null;
  }
}

export async function loadActiveStaffBooker(
  serviceDb: SupabaseClient,
  userId?: string | null,
): Promise<ActiveStaffBooker | null> {
  const id = userId === undefined ? await getSignedInUserId() : userId;
  if (!id) return null;
  try {
    // limit(1), not maybeSingle(): a person can carry more than one staff row
    // (a transfer leaves the old one behind), and maybeSingle errors on two.
    const { data: staffRows, error } = await serviceDb
      .from('staff')
      .select('id')
      .eq('profile_id', id)
      .eq('is_active', true)
      .limit(1);
    if (error || !staffRows || staffRows.length === 0) return null;

    const { data: profile } = await serviceDb
      .from('profiles')
      .select('full_name, email')
      .eq('id', id)
      .maybeSingle();
    const name =
      ((profile?.full_name as string | undefined) ?? '').trim() ||
      ((profile?.email as string | undefined) ?? '').trim() ||
      'JKKN team member';
    return { profileId: id, name };
  } catch (err) {
    console.error('[interview-booking] team-member check failed', err);
    return null;
  }
}
