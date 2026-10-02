import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireParentUserDataAdmin } from '@/lib/utils/parent-admin-auth';
import { logActivity } from '@/lib/utils/activity-logger';

export const runtime = 'nodejs';

/**
 * "Sign out of all devices" for a PARENT account (Director ruling 2026-10-01:
 * logins last for ever on the installed app; the safety net for a lost or
 * shared phone is a sign-out-everywhere button).
 *
 * Parents do not use Supabase Auth — they carry a signed parent_session JWT.
 * The kill switch is pp_parent_accounts.sessions_revoked_at (draft PR #4168):
 * every token issued at or before that moment is rejected on its next request.
 * Until that column exists the action is not switched on, so:
 *
 *   GET  → { available } — false while the column is missing; the panel hides
 *          the button.
 *   POST { accountId } → sets sessions_revoked_at = now. Same gate and the same
 *          own-institution scoping for a principal as reset-password (whoever may
 *          reset a parent's password may also sign the parent out).
 *
 * Every refusal is a JSON error the panel shows; nothing redirects (rule #27).
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOT_SWITCHED_ON =
  'Signing a parent out of every device is not switched on yet — the database update for it has not been applied. Please contact the MyJKKN team.';

/** 42703 = Postgres "column does not exist"; PGRST204 = PostgREST "column not in schema cache". */
function isMissingColumn(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204';
}

export async function GET() {
  const user = await requireParentUserDataAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = createServiceRoleClient();
  const { error } = await db.from('pp_parent_accounts').select('sessions_revoked_at').limit(1);
  if (error && !isMissingColumn(error)) {
    console.error('[parent-portal/sign-out-everywhere] availability probe failed:', error);
  }
  return NextResponse.json({ available: !error });
}

export async function POST(req: NextRequest) {
  const user = await requireParentUserDataAdmin();
  if (!user) {
    return NextResponse.json(
      { error: "You don't have access to sign parents out. Ask a super admin or your principal." },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { accountId?: string };
  const accountId = (body.accountId || '').trim();
  if (!accountId || !UUID_PATTERN.test(accountId)) {
    return NextResponse.json({ error: 'accountId is required.' }, { status: 400 });
  }

  const db = createServiceRoleClient();

  const { data: account } = await db
    .from('pp_parent_accounts')
    .select('id, learner_profile_id')
    .eq('id', accountId)
    .maybeSingle();
  if (!account) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

  const { data: learner } = await db
    .from('learners_profiles')
    .select('institution_id, first_name, last_name')
    .eq('id', account.learner_profile_id)
    .maybeSingle();
  const learnerRow = learner as
    | { institution_id: string | null; first_name: string | null; last_name: string | null }
    | null;

  if (!user.isSuperAdmin) {
    const { data: profile } = await db
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .maybeSingle();
    const ownId = (profile as { institution_id: string | null } | null)?.institution_id;
    if (!ownId || ownId !== learnerRow?.institution_id) {
      return NextResponse.json(
        { error: 'You can only sign out parent accounts in your institution.' },
        { status: 403 }
      );
    }
  }

  const revokedAt = new Date().toISOString();
  const { error: updError } = await db
    .from('pp_parent_accounts')
    .update({ sessions_revoked_at: revokedAt })
    .eq('id', accountId);

  if (updError) {
    if (isMissingColumn(updError)) {
      return NextResponse.json({ error: NOT_SWITCHED_ON }, { status: 409 });
    }
    console.error('[parent-portal/sign-out-everywhere] update failed:', updError);
    return NextResponse.json(
      { error: 'Signing this parent out failed. Please try again in a minute.' },
      { status: 500 }
    );
  }

  const learnerName =
    [learnerRow?.first_name, learnerRow?.last_name].filter(Boolean).join(' ').trim() || null;
  const parentLabel = learnerName ? `the parent of ${learnerName}` : 'a parent account';

  await logActivity({
    userId: user.id,
    actionType: 'revoke',
    resourceType: 'parent_account',
    resourceId: accountId,
    resourceName: parentLabel,
    description: `Signed ${parentLabel} out of all devices`,
    request: req,
    metadata: {
      target_parent_account_id: accountId,
      learner_profile_id: account.learner_profile_id ?? null,
      sessions_revoked_at: revokedAt,
      scope: 'global',
      requested_by: 'admin',
    },
    institutionId: learnerRow?.institution_id ?? undefined,
    statusCode: 200,
  });

  return NextResponse.json({ ok: true, sessionsRevokedAt: revokedAt });
}
