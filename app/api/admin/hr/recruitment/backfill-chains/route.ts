export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/admin/hr/recruitment/backfill-chains
// Director-pressable backfill for hr_recruitment_candidates rows that ended
// up with empty approval_chain (legacy submissions from before the chain
// builder was fully configured). Server delegates the data work to
// SECURITY DEFINER fn_backfill_empty_recruitment_chains (see migration
// 20260516130000_fn_backfill_empty_recruitment_chains.sql).
//
// Body: { hr_organization_id: string (uuid), dry_run?: boolean = true }
// Auth: super_admin only — defense-in-depth atop the fn's own grant.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient, getAuthSession } from '@/lib/supabase/server';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  await connection();

  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();

    const superAdminRes = await (supabase as any).rpc('is_super_admin');
    if (superAdminRes.data !== true) {
      return NextResponse.json(
        { error: 'Only super-admins can run this maintenance action.' },
        { status: 403 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const hrOrgId: unknown = body?.hr_organization_id;
    if (typeof hrOrgId !== 'string' || !UUID_RE.test(hrOrgId)) {
      return NextResponse.json(
        { error: 'hr_organization_id must be a UUID string' },
        { status: 400 }
      );
    }

    // Default to dry-run when the caller omits it. Explicit false is required
    // to actually write.
    const dryRun: boolean =
      body?.dry_run === false ? false : true;

    const { data, error } = await (supabase as any).rpc(
      'fn_backfill_empty_recruitment_chains',
      { p_hr_org_id: hrOrgId, p_dry_run: dryRun }
    );

    if (error) {
      console.error('[backfill-chains] RPC error:', error);
      return NextResponse.json(
        { error: 'Backfill failed', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error('[backfill-chains] unexpected error:', err);
    return NextResponse.json(
      { error: 'Backfill failed' },
      { status: 500 }
    );
  }
}
