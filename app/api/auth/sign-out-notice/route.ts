import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { signOutNoticeText, type SignOutNotice } from '@/lib/auth/sign-out-notices';

export const runtime = 'nodejs';

/**
 * "An admin signed you out of all devices on <date>." — for a team member or
 * learner (Supabase login). Director ruling 2026-10-02.
 *
 * Runs through the caller's OWN session, so row security limits every read and
 * write to the caller's own sign_out_notices rows (migration 20271002150000),
 * and the only column a signed-in user may change is seen_at.
 *
 *   GET  → { notice: SignOutNotice | null } — the latest unseen notice from
 *          BEFORE the caller's latest sign-in (a page still open from before
 *          the sign-out does not show it; the next sign-in does).
 *   POST { id } → marks that notice seen. The banner calls it as soon as it
 *          shows the notice, so the notice appears once.
 *
 * Until the migration is applied the table is missing: GET answers
 * { notice: null } and the banner renders nothing.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const lastSignIn = (user as { last_sign_in_at?: string | null }).last_sign_in_at;
  if (!lastSignIn) return NextResponse.json({ notice: null });

  const { data, error } = await supabase
    .from('sign_out_notices')
    .select('id, signed_out_at')
    .eq('user_id', user.id)
    .is('seen_at', null)
    .lt('signed_out_at', lastSignIn)
    .order('signed_out_at', { ascending: false })
    .limit(1);

  if (error) {
    // Missing table (migration not applied) or a passing database fault: show
    // nothing rather than break every page.
    return NextResponse.json({ notice: null });
  }

  const row = (data as Array<{ id: string; signed_out_at: string }> | null)?.[0];
  if (!row) return NextResponse.json({ notice: null });

  const notice: SignOutNotice = {
    id: row.id,
    signedOutAt: row.signed_out_at,
    message: signOutNoticeText(row.signed_out_at),
  };
  return NextResponse.json({ notice });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string };
  const id = (body.id || '').trim();
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  // Mark every unseen notice up to and including this one, so an older second
  // notice does not appear on the next page load.
  const { data: target } = await supabase
    .from('sign_out_notices')
    .select('signed_out_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: 'Notice not found.' }, { status: 404 });

  const { error } = await supabase
    .from('sign_out_notices')
    .update({ seen_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('seen_at', null)
    .lte('signed_out_at', (target as { signed_out_at: string }).signed_out_at);

  if (error) {
    console.error('[auth/sign-out-notice] could not mark the notice seen:', error);
    return NextResponse.json({ error: 'Could not mark the notice as seen.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
