import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireParentUserDataAdmin } from '@/lib/utils/parent-admin-auth';
import { hashPassword } from '@/lib/auth/parent-password';

export const runtime = 'nodejs';

/**
 * POST /api/academic/parent-portal/users/reset-password
 * Body: { accountId, password }
 *
 * Re-hashes the parent account password AND stores the plaintext in
 * reset_password so the credential export can show it. Gated to super_admin +
 * principal; a principal may only reset accounts in their own institution.
 */
export async function POST(req: NextRequest) {
  const user = await requireParentUserDataAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { accountId?: string; password?: string };
  const accountId = (body.accountId || '').trim();
  const password = (body.password || '').trim();
  if (!accountId) return NextResponse.json({ error: 'accountId is required.' }, { status: 400 });
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  const db = createServiceRoleClient();

  // Resolve the account's learner + institution for principal scoping.
  const { data: account } = await db
    .from('pp_parent_accounts')
    .select('id, learner_profile_id')
    .eq('id', accountId)
    .maybeSingle();
  if (!account) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

  if (!user.isSuperAdmin) {
    const [{ data: profile }, { data: learner }] = await Promise.all([
      db.from('profiles').select('institution_id').eq('id', user.id).maybeSingle(),
      db.from('learners_profiles').select('institution_id').eq('id', account.learner_profile_id).maybeSingle(),
    ]);
    const ownId = (profile as { institution_id: string | null } | null)?.institution_id;
    const lrnInst = (learner as { institution_id: string | null } | null)?.institution_id;
    if (!ownId || ownId !== lrnInst) {
      return NextResponse.json({ error: 'You can only reset accounts in your institution.' }, { status: 403 });
    }
  }

  const password_hash = await hashPassword(password);
  const nowIso = new Date().toISOString();
  // Try storing the plaintext (for export); if the column doesn't exist yet,
  // still change the password — just don't persist the plaintext.
  let upd = await db
    .from('pp_parent_accounts')
    .update({ password_hash, reset_password: password, updated_at: nowIso })
    .eq('id', accountId);
  if (upd.error) {
    upd = await db
      .from('pp_parent_accounts')
      .update({ password_hash, updated_at: nowIso })
      .eq('id', accountId);
    if (upd.error) return NextResponse.json({ error: 'Failed to reset password.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
