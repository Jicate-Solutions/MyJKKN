export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * GET /api/bug-reports/[id]/cluster
 *
 * Reverse lookup: which AI-detected group (bug_clusters) does THIS report
 * belong to? Every other read of bug_clusters.member_ids in the app runs the
 * other way — cluster → member bugs — so before this route the detail page had
 * no way to know its report was already one of 32 reports of one defect, and an
 * admin could re-triage work the group had already diagnosed or even fixed.
 *
 * Returns the group's status, size, and (when present) the headline facts an
 * admin actually needs here: the fixability verdict's root cause and any fix PR.
 * member_ids is uuid[], so the containment filter does the work — no new RPC.
 *
 * Admin-only, same gate as the duplicates + status routes.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id: reportId } = await params;

  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !profile ||
      (!(profile as any).is_super_admin &&
        !['super_admin', 'administrator', 'ceo'].includes(profile.role))
    ) {
      return NextResponse.json(
        { error: 'Admin permissions required' },
        { status: 403 }
      );
    }

    const adminSupabase = createAdminClient();

    const { data: clusters, error: clusterError } = await (
      adminSupabase.from('bug_clusters') as any
    )
      .select(
        'id, status, member_count, seed_bug_id, module_names, metadata, first_seen_at, last_scan_at'
      )
      .contains('member_ids', [reportId])
      // DISMISSED groups are excluded deliberately. A dismissed cluster is a
      // grouping a human looked at and REJECTED — "these are not the same bug".
      // Surfacing it as "part of a group of N similar reports" would assert the
      // opposite of the decision that was made. Observed live: BUG-004551 sits in
      // both a dismissed 35-member cluster and the confirmed 32-member one, and
      // ordering by size alone headlined the rejected grouping.
      .in('status', ['proposed', 'confirmed'])
      .order('member_count', { ascending: false })
      .limit(5);

    if (clusterError) throw clusterError;

    // Not in any group is the normal case (83% of reports at time of writing) —
    // a 200 with data:null, not a 404, so the UI can render "not grouped".
    if (!clusters || clusters.length === 0) {
      return NextResponse.json({ data: null });
    }

    // A confirmed group outranks a merely proposed one regardless of size — it
    // carries a human decision, which is the more useful headline.
    const ranked = [...clusters].sort((a: any, b: any) => {
      if (a.status !== b.status) return a.status === 'confirmed' ? -1 : 1;
      return (b.member_count ?? 0) - (a.member_count ?? 0);
    });

    const shaped = ranked.map((c: any) => {
      const fixability = c.metadata?.fixability ?? null;
      const verdict = fixability?.verdict ?? null;
      const fix = fixability?.fix ?? null;
      const verify = c.metadata?.verify ?? null;
      // This report's OWN verify verdict, if the group was verified per-bug.
      const myVerify = verify?.per_bug?.[reportId] ?? null;

      return {
        id: c.id,
        status: c.status,
        member_count: c.member_count,
        seed_bug_id: c.seed_bug_id,
        is_seed: c.seed_bug_id === reportId,
        module_names: c.module_names ?? [],
        first_seen_at: c.first_seen_at,
        last_scan_at: c.last_scan_at,
        // Headline facts only — the group tab owns the full detail.
        diagnosis_status: fixability?.status ?? null,
        root_cause: typeof verdict?.root_cause === 'string' ? verdict.root_cause : null,
        single_fix_feasible:
          typeof verdict?.single_fix_feasible === 'boolean'
            ? verdict.single_fix_feasible
            : null,
        confidence: typeof verdict?.confidence === 'string' ? verdict.confidence : null,
        fix_status: fix?.status ?? null,
        fix_pr_url: typeof fix?.pr_url === 'string' ? fix.pr_url : null,
        fix_pr_number:
          typeof fix?.pr_number === 'number' ? fix.pr_number : null,
        // Did the group's fix actually hold? The tally is group-wide;
        // my_verify_verdict is this report's own line from that pass.
        verify_status: verify?.status ?? null,
        verify_tally: verify?.tally ?? null,
        my_verify_verdict:
          typeof myVerify?.verdict === 'string' ? myVerify.verdict : null
      };
    });

    return NextResponse.json({ data: shaped });
  } catch (error) {
    logger.error(
      'bug-reports/api',
      `Error in cluster lookup for ${reportId}`,
      error
    );
    return NextResponse.json(
      { error: 'Failed to look up the report group' },
      { status: 500 }
    );
  }
}
