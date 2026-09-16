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
    const gate = await requireBugAdmin();
    if (gate.response) return gate.response;

    const adminSupabase = createAdminClient();
    // p_actor_user_id: this click is a PERSON acting from the app, so the RPC
    // applies the low-risk gate (Director ruling 2026-09-15). The bugs desk
    // calls the same RPC as the service role with no actor and is not gated.
    const { data, error } = await (adminSupabase as any).rpc('fn_bug_cluster_fix_request', {
      p_cluster_id: clusterId,
      p_actor_user_id: gate.user.id
    });

    if (error) throw error;
    if (!data?.success) {
      // 423 Locked for a held group — the UI shows "held — bugs desk / Director".
      const status = data?.risk === 'held' ? 423 : 400;
      return NextResponse.json(
        { error: data?.error ?? 'fix request failed', risk: data?.risk, held_path: data?.held_path },
        { status }
      );
    }
    return NextResponse.json({ ok: true, status: data.status ?? 'requested', note: data.note });
  } catch (error) {
    logger.error('bug-reports/clusters', `Fix request failed for ${clusterId}`, error);
    return NextResponse.json({ error: 'Failed to queue the fix' }, { status: 500 });
  }
}
