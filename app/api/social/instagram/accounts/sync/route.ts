export const dynamic = 'force-dynamic';

/**
 * POST /api/social/instagram/accounts/sync
 *
 * Syncs discovered Instagram Professional accounts into the ig_accounts table.
 * Upserts on ig_user_id — safe to call repeatedly (idempotent).
 *
 * Body:
 *   institution_id?: string  — fallback institution to associate accounts with.
 *                              Optional for super_admin (per-account resolution
 *                              via fb_pages covers mapped accounts); required
 *                              for institution_admin.
 *   ig_user_ids?: string[]   — optional: only sync these specific account IDs
 *                              (omit to sync all accounts linked to our Pages)
 *
 * Auth: super_admin OR institution_admin scoped to institution_id in body OR a
 * role granted social.instagram.manage.
 *
 * The discovery + classification core lives in lib/instagram/sync-accounts.ts
 * (runIgAccountsSync) so the daily auto-detection cron
 * (GET /api/cron/ig-accounts-sync) runs the exact same logic. This route only
 * owns the user-session auth gate and maps the core's outcome to HTTP status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { runIgAccountsSync } from '@/lib/instagram/sync-accounts';

export async function POST(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({})) as {
      institution_id?: string;
      ig_user_ids?: string[];
    };

    const institutionId = body.institution_id?.trim() || null;

    // Auth gate. super_admin may omit institution_id — per-account
    // institution resolution happens via the fb_pages join in the core, so a
    // group-level sync (the /admin/social/instagram Discover button) needs
    // no explicit institution. institution_admin must name their own.
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();

    const isSuperAdmin = profile?.role === 'super_admin';
    const isInstitutionAdmin =
      profile?.role === 'institution_admin' &&
      !!institutionId &&
      profile?.institution_id === institutionId;

    // 2026-06-11 granular-permission retrofit: roles granted
    // social.instagram.manage via Role Management pass too — like
    // institution_admin they must name their own institution.
    let hasManagePerm = false;
    if (
      !isSuperAdmin &&
      !isInstitutionAdmin &&
      !!institutionId &&
      profile?.institution_id === institutionId
    ) {
      const { data: perm } = await supabase.rpc('user_has_permission', {
        permission_name: 'social.instagram.manage',
      });
      hasManagePerm = !!perm;
    }

    if (!isSuperAdmin && !isInstitutionAdmin && !hasManagePerm) {
      if (profile?.role === 'institution_admin' && !institutionId) {
        return NextResponse.json(
          { success: false, error: 'institution_id is required' },
          { status: 400 }
        );
      }
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const outcome = await runIgAccountsSync(createServiceRoleClient(), {
      institutionId,
      igUserIds: body.ig_user_ids,
    });

    if (!outcome.ok) {
      if (outcome.code === 'no_token') {
        return NextResponse.json({ success: false, error: outcome.error }, { status: 503 });
      }
      // enumeration_failed: /me/accounts failed AND nothing else to sync.
      return NextResponse.json(
        { success: false, error: `Account enumeration failed: ${outcome.error}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, data: outcome.data });
  } catch (error) {
    console.error('[ig-sync] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
