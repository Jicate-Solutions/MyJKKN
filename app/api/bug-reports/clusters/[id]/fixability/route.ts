export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { requireBugAdmin } from '../../_auth';

/**
 * POST /api/bug-reports/clusters/[id]/fixability
 *
 * Flags a cluster for AI fixability analysis. A Mac-side READ-ONLY runner
 * (worktree off jicate/main + `claude -p` with Read/Glob/Grep only) then reads
 * the actual code paths the member bugs describe and writes a structured
 * verdict back to bug_clusters.metadata.fixability — one-fix-fixes-all vs N
 * distinct-root-cause subgroups.
 *
 * This only enqueues the analysis; the verdict appears (via the Groups list
 * poll) once the runner completes, usually a few minutes later.
 *
 * RECOMMENDATION ONLY — the verdict never resolves the cluster and never emails
 * reporters. A human still decides; the resolve-cascade + reporter emails stay
 * owned by the duplicate machinery, triggered by a human clicking Resolve.
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
    const { data, error } = await (adminSupabase as any).rpc('fn_bug_cluster_fixability_request', {
      p_cluster_id: clusterId
    });

    if (error) throw error;
    if (!data?.success) {
      return NextResponse.json({ error: data?.error ?? 'request failed' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, status: data.status ?? 'requested', note: data.note });
  } catch (error) {
    logger.error('bug-reports/clusters', `Fixability request failed for ${clusterId}`, error);
    return NextResponse.json({ error: 'Failed to queue fixability analysis' }, { status: 500 });
  }
}
