import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { verifyPassword } from '@/lib/auth/parent-password';
import { hasSuperAdminFlag } from '@/lib/auth/super-admin-flag';
import { PARENT_SEED_DEFAULT_PASSWORD } from '@/lib/auth/parent-seed-default';

export const runtime = 'nodejs';

/**
 * POST /api/academic/parent-portal/users/show-password { accountId }
 *
 * Director rulings, 2 Oct 2026:
 *  A. A parent's saved starting password may be seen by SUPER ADMINS ONLY
 *     (profiles.is_super_admin) — not admins, not principals. Checked here on
 *     the server; the button being hidden on the screen is not the check.
 *  B. Every view is recorded in pp_parent_password_views (who, which account,
 *     when). If that record cannot be written, no password is returned.
 *  C. Once the parent has changed their own password, only "Changed by parent"
 *     is returned, never a value. Decided by checking the stored hash against
 *     the saved starting password (reset_password, else the seed default) with
 *     the same checker the parent login uses (lib/auth/parent-password.ts).
 *
 * Responses: { password } or { changedByParent: true }. Never cached. The list
 * route (../route.ts) and the Excel export never carry a password.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' },
  });
}

export async function POST(req: NextRequest) {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return json({ error: 'Your login has ended. Please sign in again.' }, 401);

  const db = createServiceRoleClient();
  if (!(await hasSuperAdminFlag(db, user.id))) {
    return json({ error: "Only a super admin can see a parent's password." }, 403);
  }

  const body = (await req.json().catch(() => ({}))) as { accountId?: string };
  const accountId = (body.accountId || '').trim();
  if (!UUID_PATTERN.test(accountId)) return json({ error: 'accountId is required.' }, 400);

  const { data: account, error: readError } = await db
    .from('pp_parent_accounts')
    .select('id, password_hash, reset_password')
    .eq('id', accountId)
    .maybeSingle();
  if (readError) {
    console.error('[parent-portal/show-password] read failed:', readError);
    return json({ error: 'Could not read this account. Please try again in a minute.' }, 500);
  }
  if (!account) return json({ error: 'Account not found.' }, 404);

  const row = account as { password_hash: string | null; reset_password: string | null };
  const candidate = row.reset_password || PARENT_SEED_DEFAULT_PASSWORD;
  const stillTheSavedPassword = await verifyPassword(candidate, row.password_hash);
  const result = stillTheSavedPassword ? 'shown' : 'changed_by_parent';

  const { error: logError } = await db.from('pp_parent_password_views').insert({
    account_id: accountId,
    viewed_by: user.id,
    result,
  });
  if (logError) {
    console.error('[parent-portal/show-password] could not record the view:', logError);
    return json(
      { error: 'This view could not be recorded, so the password is not shown. Please try again in a minute.' },
      500
    );
  }

  return stillTheSavedPassword ? json({ password: candidate }) : json({ changedByParent: true });
}
