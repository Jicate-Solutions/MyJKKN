export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { requireBugAdmin } from '../../_auth';

/**
 * POST /api/bug-reports/clusters/[id]/fix
 *
 * "Fix this group" — only allowed when the cluster has a completed fixability
 * verdict that says single_fix_feasible=true (the RPC enforces this). Flags the
 * cluster for the Mac-side WRITE runner, which applies the minimal fix in a
 * worktree off main and opens a DRAFT PR.
 *
 * HUMAN GATES: the AI only opens a reviewable PR — a human merges + deploys it,
 * and later a human clicks Resolve (which cascades + emails N reporters). This
 * route never merges, never resolves, never emails.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id: clusterId } = await params;

  try {
    const { response } = await requireBugAdmin();
    if (response) return response;

    const adminSupabase = createAdminClient();
    const { data, error } = await (adminSupabase as any).rpc('fn_bug_cluster_fix_request', {
      p_cluster_id: clusterId
    });

    if (error) throw error;
    if (!data?.success) {
      return NextResponse.json({ error: data?.error ?? 'fix request failed' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, status: data.status ?? 'requested', note: data.note });
  } catch (error) {
    logger.error('bug-reports/clusters', `Fix request failed for ${clusterId}`, error);
    return NextResponse.json({ error: 'Failed to queue the fix' }, { status: 500 });
  }
}
