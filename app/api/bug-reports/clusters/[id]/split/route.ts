export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { requireBugAdmin } from '../../_auth';

/**
 * POST /api/bug-reports/clusters/[id]/split
 *
 * ★ HUMAN ACTION ★ — the admin's click re-sorts a multi-cause group into
 * per-cause groups, following the fixability verdict's subgroups. This is the
 * designed exit for a "distinct root causes — separate fixes" diagnosis: each
 * new group gets its own full loop pipeline (fresh diagnosis onward).
 *
 * Director-locked decisions (2026-07-19, spec cluster-evidence-signals):
 * S1 works on confirmed groups (members re-filed under each cause's oldest
 * report) · S2 children born confirmed — this click IS the decision · S3
 * unsorted members stay together flagged needs-another-look · S4 a split is
 * final (the nightly scan never re-merges; parent is dismissed with an audit
 * trail). Refused when reporter questions already exist on the group.
 *
 * Nothing here resolves bugs or emails reporters.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id: clusterId } = await params;

  try {
    const { user, response } = await requireBugAdmin();
    if (response) return response;

    const adminSupabase = createAdminClient();
    const { data, error } = await (adminSupabase as any).rpc('fn_bug_cluster_split', {
      p_cluster_id: clusterId,
      p_actor: user!.id
    });

    if (error) throw error;
    if (!data?.success) {
      return NextResponse.json({ error: data?.error ?? 'split failed' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    logger.error('bug-reports/clusters', `Split failed for ${clusterId}`, error);
    return NextResponse.json({ error: 'Failed to split the group' }, { status: 500 });
  }
}
