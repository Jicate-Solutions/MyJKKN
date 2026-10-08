import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { PARENT_SESSION_COOKIE, verifyParentSession } from '@/lib/auth/parent-jwt';
import { signOutNoticeText, type SignOutNotice } from '@/lib/auth/sign-out-notices';

export const runtime = 'nodejs';

/**
 * "An admin signed you out of all devices on <date>." — for a PARENT.
 * Director ruling 2026-10-02.
 *
 * Parents carry a signed parent_session token, not a Supabase login, so the
 * rows are read with the service role, scoped ONLY to the verified token's own
 * account (`sub`) — never to a value from the request.
 *
 *   GET  → { notice: SignOutNotice | null } — the latest unseen notice from
 *          BEFORE this token was issued (i.e. shown after the next sign-in).
 *   POST { id } → marks it (and any older unseen one) seen.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const claims = await verifyParentSession(req.cookies.get(PARENT_SESSION_COOKIE)?.value);
  if (!claims) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (typeof claims.iat !== 'number') return NextResponse.json({ notice: null });

  const issuedAt = new Date(claims.iat * 1000).toISOString();
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('sign_out_notices')
    .select('id, signed_out_at')
    .eq('parent_account_id', claims.sub)
    .is('seen_at', null)
    .lt('signed_out_at', issuedAt)
    .order('signed_out_at', { ascending: false })
    .limit(1);

  if (error) return NextResponse.json({ notice: null }); // table missing until the migration is applied

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
  const claims = await verifyParentSession(req.cookies.get(PARENT_SESSION_COOKIE)?.value);
  if (!claims) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string };
  const id = (body.id || '').trim();
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  const db = createServiceRoleClient();
  const { data: target } = await db
    .from('sign_out_notices')
    .select('signed_out_at')
    .eq('id', id)
    .eq('parent_account_id', claims.sub)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: 'Notice not found.' }, { status: 404 });

  const { error } = await db
    .from('sign_out_notices')
    .update({ seen_at: new Date().toISOString() })
    .eq('parent_account_id', claims.sub)
    .is('seen_at', null)
    .lte('signed_out_at', (target as { signed_out_at: string }).signed_out_at);

  if (error) {
    console.error('[parent/sign-out-notice] could not mark the notice seen:', error);
    return NextResponse.json({ error: 'Could not mark the notice as seen.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
