export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { requireBugAdmin } from '../_auth';

const actionSchema = z.object({
  action: z.enum(['confirm', 'dismiss'])
});

/**
 * POST /api/bug-reports/clusters/[id]  { action: 'confirm' | 'dismiss' }
 *
 * confirm — park every still-open member under the cluster's seed (canonical)
 *           bug: status='duplicate' + duplicate_of=seed. From then on the
 *           PR-1 machinery owns the group (resolving the canonical cascades +
 *           emails every reporter; reopening any copy reopens the canonical).
 * dismiss — mark the proposal dismissed; the scan will not re-propose a group
 *           seeded by the same bug.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id: clusterId } = await params;

  try {
    const gate = await requireBugAdmin();
    if (gate.response) return gate.response;
    const adminUserId = gate.user.id;

    const { action } = actionSchema.parse(await request.json());
    const adminSupabase = createAdminClient();

    const { data: cluster, error: clusterError } = await (
      adminSupabase.from('bug_clusters') as any
    )
      .select('id, seed_bug_id, member_ids, member_count, status')
      .eq('id', clusterId)
      .maybeSingle();

    if (clusterError || !cluster) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    if (cluster.status !== 'proposed') {
      return NextResponse.json(
        { error: `Group already ${cluster.status}` },
        { status: 409 }
      );
    }

    if (action === 'dismiss') {
      const { error: dismissError } = await (
        adminSupabase.from('bug_clusters') as any
      )
        .update({
          status: 'dismissed',
          decided_by: adminUserId,
          decided_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', clusterId)
        .eq('status', 'proposed');
      if (dismissError) throw dismissError;
      return NextResponse.json({ ok: true, action: 'dismissed' });
    }

    // ---- confirm ----------------------------------------------------------
    // The canonical must still be an open bug; otherwise duplicates would be
    // parked under a closed report and never cascade. Rescan re-seeds.
    const { data: seed, error: seedError } = await (
      adminSupabase.from('bug_reports') as any
    )
      .select('id, display_id, status, duplicate_of')
      .eq('id', cluster.seed_bug_id)
      .maybeSingle();

    if (seedError || !seed) {
      return NextResponse.json({ error: 'Canonical bug not found' }, { status: 404 });
    }
    if (!['new', 'seen', 'in_progress'].includes(seed.status) || seed.duplicate_of) {
      return NextResponse.json(
        { error: `Canonical ${seed.display_id} is no longer open — run Scan now to refresh groups.` },
        { status: 409 }
      );
    }

    // Park every still-open member (guard rails inside the WHERE: only open,
    // non-duplicate rows are touched; the canonical itself is excluded).
    const { data: parked, error: parkError } = await (
      adminSupabase.from('bug_reports') as any
    )
      .update({ status: 'duplicate', duplicate_of: cluster.seed_bug_id, resolved_at: null })
      .in('id', (cluster.member_ids as string[]).filter((m) => m !== cluster.seed_bug_id))
      .in('status', ['new', 'seen', 'in_progress'])
      .is('duplicate_of', null)
      .select('id, display_id');

    if (parkError) throw parkError;
    const parkedRows: { id: string; display_id: string }[] = parked ?? [];

    // Chat trail (best-effort): one message per parked member + one on the canonical.
    if (parkedRows.length > 0) {
      const messages = [
        ...parkedRows.map((r) => ({
          bug_report_id: r.id,
          sender_user_id: adminUserId,
          message_text: `This report was grouped as a duplicate of ${seed.display_id}. You'll be notified when the original is resolved.`,
          is_internal: false
        })),
        {
          bug_report_id: cluster.seed_bug_id,
          sender_user_id: adminUserId,
          message_text: `${parkedRows.length} report(s) grouped under this bug as duplicates: ${parkedRows
            .map((r) => r.display_id)
            .join(', ')}.`,
          is_internal: false
        }
      ];
      const { error: msgError } = await (adminSupabase as any)
        .from('bug_report_messages')
        .insert(messages);
      if (msgError) {
        logger.warn('bug-reports/clusters', 'Failed to post group chat messages', msgError);
      }
    }

    const { error: confirmError } = await (
      adminSupabase.from('bug_clusters') as any
    )
      .update({
        status: 'confirmed',
        decided_by: adminUserId,
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', clusterId)
      .eq('status', 'proposed');
    if (confirmError) throw confirmError;

    logger.info('bug-reports/clusters', 'Group confirmed', {
      clusterId,
      canonical: seed.display_id,
      parked: parkedRows.length
    });

    return NextResponse.json({
      ok: true,
      action: 'confirmed',
      canonical: seed.display_id,
      parkedCount: parkedRows.length,
      parked: parkedRows.map((r) => r.display_id)
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    logger.error('bug-reports/clusters', `Cluster action failed for ${clusterId}`, error);
    return NextResponse.json({ error: 'Group action failed' }, { status: 500 });
  }
}
