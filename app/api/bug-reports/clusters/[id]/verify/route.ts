export const dynamic = 'force-dynamic';
// Evidence gathering for up to ~40 members (bounded concurrency) must fit.
export const maxDuration = 300;

import { NextRequest, NextResponse, connection } from 'next/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { requireBugAdmin } from '../../_auth';
import { gatherEvidence, type ReverifyBug } from '@/lib/bug-reports/reverify/evidence';
import { compactConsole, parseVerdict } from '@/lib/bug-reports/reverify/verdict';

/**
 * Verify group — increment #1 of the bug-cluster self-improving loop
 * (docs/features/2026-07-18-FEATURE-cluster-selfimproving-loop.md).
 *
 * After a fix for a cluster deploys, fan the LIVE `bug.reverify` recipe out
 * across the cluster's members: each member's symptom is re-checked AS ITS
 * REPORTER (read-only, RLS-scoped) and judged likely_fixed | still_broken |
 * inconclusive. The tally tells a human how the fix landed BEFORE they resolve
 * the group (which emails every reporter).
 *
 * MOAT HONESTY: this is the AI re-checking its own fix — a WEAK signal, always
 * labeled "AI re-check (not reporter-confirmed)". It earns no loop gate. The
 * measurement is increment #2 (reporter 👍/👎). RECOMMENDATION ONLY — never
 * resolves anything, never emails anyone.
 *
 * Because a member's agentic judge run takes minutes on the batch lane, the
 * trigger is async + poll (mirrors fixability), NOT a long-poll of N jobs:
 *   POST  — gather evidence per member (as the reporter), enqueue one
 *           `bug.reverify` job per member, mark metadata.verify running.
 *   GET   — the poll tick: collect finished job verdicts, persist each to the
 *           member bug's metadata.ai_reverify (same shape as the per-bug
 *           re-verify card), update the cluster tally, finalize when done.
 */

const EVIDENCE_CONCURRENCY = 4;
// A run still pending after this long is finalized with the remaining members
// marked not-completed (the batch lane can queue behind bulk work; re-run later).
const RUN_TIMEOUT_MS = 30 * 60_000;

interface PerBugEntry {
  display_id: string | null;
  job_id?: string;
  verdict?: string;
  confidence?: string;
  reproducible?: string;
  failed?: boolean;
  error?: string;
}

interface VerifyState {
  status: 'running' | 'done' | 'error';
  requested_at: string;
  requested_by?: string;
  completed_at?: string;
  total: number;
  jobs: Record<string, string>; // bug_id -> ai_jobs.id
  per_bug: Record<string, PerBugEntry>;
  tally: {
    likely_fixed: number;
    still_broken: number;
    inconclusive: number;
    failed: number;
    pending: number;
  };
  error?: string;
}

function emptyTally(pending: number): VerifyState['tally'] {
  return { likely_fixed: 0, still_broken: 0, inconclusive: 0, failed: 0, pending };
}

function recomputeTally(state: VerifyState): VerifyState['tally'] {
  const t = emptyTally(0);
  for (const bugId of Object.keys(state.jobs)) {
    const e = state.per_bug[bugId];
    if (!e || (!e.verdict && !e.failed)) t.pending += 1;
    else if (e.failed) t.failed += 1;
    else if (e.verdict === 'likely_fixed') t.likely_fixed += 1;
    else if (e.verdict === 'still_broken') t.still_broken += 1;
    else t.inconclusive += 1;
  }
  return t;
}

/** Merge-write metadata.verify against a fresh read of the cluster row so we
 *  never clobber sibling keys (metadata.fixability etc.). Poll ticks may race;
 *  ticks recompute from ai_jobs ground truth, so a lost update self-heals. */
async function saveVerify(admin: any, clusterId: string, verify: VerifyState) {
  const { data: fresh } = await admin
    .from('bug_clusters')
    .select('metadata')
    .eq('id', clusterId)
    .maybeSingle();
  const { error } = await admin
    .from('bug_clusters')
    .update({ metadata: { ...(fresh?.metadata ?? {}), verify } })
    .eq('id', clusterId);
  if (error) logger.error('bug-reports/clusters', 'Failed to persist verify state', error);
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id: clusterId } = await params;

  try {
    const { user, response } = await requireBugAdmin();
    if (response) return response;

    const admin = createAdminClient() as any;

    const { data: cluster, error: clusterError } = await admin
      .from('bug_clusters')
      .select('id, member_ids, member_count, metadata, status')
      .eq('id', clusterId)
      .maybeSingle();
    if (clusterError || !cluster) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const existing: VerifyState | null = (cluster.metadata as any)?.verify ?? null;
    if (
      existing?.status === 'running' &&
      Date.now() - new Date(existing.requested_at).getTime() < RUN_TIMEOUT_MS
    ) {
      return NextResponse.json(
        { error: 'A group re-check is already running. The tally updates as members finish.' },
        { status: 409 }
      );
    }

    const { data: members, error: membersError } = await admin
      .from('bug_reports')
      .select(
        'id, display_id, description, page_url, module_name, sub_module_name, category, console_logs, reporter_user_id, institution_id, created_at'
      )
      .in('id', (cluster.member_ids as string[]) ?? []);
    if (membersError || !members || members.length === 0) {
      return NextResponse.json({ error: 'Group members could not be loaded' }, { status: 502 });
    }

    // Mark running FIRST so the Groups tab flips to the progress state while
    // evidence gathering (the slow part of this request) is still underway.
    const verify: VerifyState = {
      status: 'running',
      requested_at: new Date().toISOString(),
      requested_by: user!.id,
      total: members.length,
      jobs: {},
      per_bug: {},
      tally: emptyTally(members.length),
    };
    await saveVerify(admin, clusterId, verify);

    // Gather evidence AS EACH REPORTER + enqueue, a few members at a time.
    let enqueued = 0;
    let failed = 0;
    for (let i = 0; i < members.length; i += EVIDENCE_CONCURRENCY) {
      const chunk = members.slice(i, i + EVIDENCE_CONCURRENCY);
      await Promise.all(
        chunk.map(async (bug: any) => {
          const reverifyBug: ReverifyBug = {
            id: bug.id,
            display_id: bug.display_id,
            description: bug.description,
            page_url: bug.page_url,
            module_name: bug.module_name,
            sub_module_name: bug.sub_module_name,
            category: bug.category,
            console_logs: bug.console_logs,
            reporter_user_id: bug.reporter_user_id,
            institution_id: bug.institution_id,
            created_at: bug.created_at,
          };

          let evidence;
          try {
            // verify.requested_at is post-deploy (the human clicks Verify only
            // after merge + deploy), so it is the fix boundary: recurrence counts
            // reports arriving AFTER the fix, not the pre-fix wave the fix targets.
            evidence = await gatherEvidence(reverifyBug, admin, verify.requested_at);
          } catch {
            evidence = {
              reporter_reachable: 'unknown',
              reporter_scope_note: 'Evidence gathering errored; judged on the report text alone.',
              probe_result: 'unavailable',
              error_recurrence: 'unavailable',
              symptom_recurrence: 'unavailable',
            };
          }

          const payload = {
            display_id: bug.display_id ?? bug.id,
            reported_at: bug.created_at,
            days_since: String(
              Math.floor((Date.now() - new Date(bug.created_at).getTime()) / 86_400_000)
            ),
            module_name: bug.module_name ?? '',
            sub_module_name: bug.sub_module_name ?? '',
            description: (bug.description ?? '').slice(0, 4000),
            console_excerpt: compactConsole(bug.console_logs),
            reporter_reachable: evidence.reporter_reachable,
            reporter_scope_note: evidence.reporter_scope_note,
            probe_result: evidence.probe_result,
            error_recurrence: evidence.error_recurrence,
            symptom_recurrence: evidence.symptom_recurrence,
          };

          const dedupe = `bug-reverify:${bug.id}`;
          const { data: enq, error: enqError } = await admin.rpc('fn_ai_enqueue_system', {
            p_job_type: 'bug.reverify',
            p_payload: payload,
            p_dedupe_key: dedupe,
          });

          if (enq?.ok && enq.job_id) {
            verify.jobs[bug.id] = enq.job_id;
            verify.per_bug[bug.id] = { display_id: bug.display_id, job_id: enq.job_id };
            enqueued += 1;
            return;
          }

          const reason = enq?.error ?? enqError?.message ?? 'enqueue failed';
          if (reason === 'in_flight') {
            // A re-check for this member is already queued/running (e.g. a
            // per-bug click) — adopt that job instead of failing the member.
            const { data: inflight } = await admin
              .from('ai_jobs')
              .select('id')
              .eq('job_type', 'bug.reverify')
              .filter('payload->>_dedupe', 'eq', dedupe)
              .not('status', 'in', '(done,error,canceled)')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (inflight?.id) {
              verify.jobs[bug.id] = inflight.id;
              verify.per_bug[bug.id] = { display_id: bug.display_id, job_id: inflight.id };
              enqueued += 1;
              return;
            }
          }
          verify.per_bug[bug.id] = { display_id: bug.display_id, failed: true, error: reason };
          // Count immediate failures in the jobs map domain via per_bug only.
          verify.jobs[bug.id] = '';
          failed += 1;
        })
      );
    }

    verify.tally = recomputeTally(verify);
    if (enqueued === 0) {
      verify.status = 'error';
      verify.error = 'No member re-check could be queued.';
    }
    await saveVerify(admin, clusterId, verify);

    return NextResponse.json({ ok: enqueued > 0, enqueued, failed, total: members.length, verify });
  } catch (error) {
    logger.error('bug-reports/clusters', `Verify-group request failed for ${clusterId}`, error);
    return NextResponse.json({ error: 'Failed to start the group re-check' }, { status: 500 });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id: clusterId } = await params;

  try {
    const { response } = await requireBugAdmin();
    if (response) return response;

    const admin = createAdminClient() as any;

    const { data: cluster, error: clusterError } = await admin
      .from('bug_clusters')
      .select('id, metadata')
      .eq('id', clusterId)
      .maybeSingle();
    if (clusterError || !cluster) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const verify: VerifyState | null = (cluster.metadata as any)?.verify ?? null;
    if (!verify) return NextResponse.json({ verify: null });
    if (verify.status !== 'running') return NextResponse.json({ verify });

    // Advance the aggregation: check jobs that haven't landed a verdict yet.
    const pendingBugIds = Object.keys(verify.jobs).filter((bugId) => {
      const e = verify.per_bug[bugId];
      return verify.jobs[bugId] && (!e || (!e.verdict && !e.failed));
    });

    if (pendingBugIds.length > 0) {
      const jobIds = pendingBugIds.map((b) => verify.jobs[b]);
      const [{ data: jobs }, { data: bugs }] = await Promise.all([
        admin
          .from('ai_jobs')
          .select('id, status, result, error')
          .in('id', jobIds),
        admin
          .from('bug_reports')
          .select('id, display_id, description, metadata')
          .in('id', pendingBugIds),
      ]);
      const jobById = new Map<string, any>((jobs ?? []).map((j: any) => [j.id, j]));
      const bugById = new Map<string, any>((bugs ?? []).map((b: any) => [b.id, b]));

      for (const bugId of pendingBugIds) {
        const job = jobById.get(verify.jobs[bugId]);
        const bug = bugById.get(bugId);
        if (!job || !bug) continue;

        if (job.status === 'done') {
          const parsed = parseVerdict(job.result, {
            id: bug.id,
            display_id: bug.display_id,
            description: bug.description,
          } as ReverifyBug);
          if (!parsed) {
            verify.per_bug[bugId] = {
              display_id: bug.display_id,
              job_id: job.id,
              failed: true,
              error: 'unreadable verdict',
            };
            continue;
          }
          // Persist to the member bug so its own re-verify card shows the same
          // verdict (identical shape to the per-bug route's stored object).
          const stored = { ...parsed, generated_at: new Date().toISOString(), job_id: job.id };
          await admin
            .from('bug_reports')
            .update({ metadata: { ...(bug.metadata ?? {}), ai_reverify: stored } })
            .eq('id', bugId);
          verify.per_bug[bugId] = {
            display_id: bug.display_id,
            job_id: job.id,
            verdict: parsed.verdict,
            confidence: parsed.confidence,
            reproducible: parsed.reproducible,
          };
        } else if (job.status === 'error' || job.status === 'canceled') {
          verify.per_bug[bugId] = {
            display_id: bug.display_id,
            job_id: job.id,
            failed: true,
            error: String(job.error ?? job.status).slice(0, 120),
          };
        }
        // Any other status: still pending — leave for the next tick.
      }
    }

    verify.tally = recomputeTally(verify);

    const timedOut =
      Date.now() - new Date(verify.requested_at).getTime() > RUN_TIMEOUT_MS;
    if (verify.tally.pending === 0 || timedOut) {
      if (timedOut && verify.tally.pending > 0) {
        for (const bugId of Object.keys(verify.jobs)) {
          const e = verify.per_bug[bugId];
          if (!e || (!e.verdict && !e.failed)) {
            verify.per_bug[bugId] = {
              display_id: e?.display_id ?? null,
              job_id: verify.jobs[bugId] || undefined,
              failed: true,
              error: 'not completed in time — re-run to retry',
            };
          }
        }
        verify.tally = recomputeTally(verify);
      }
      verify.status = 'done';
      verify.completed_at = new Date().toISOString();
    }

    await saveVerify(admin, clusterId, verify);
    return NextResponse.json({ verify });
  } catch (error) {
    logger.error('bug-reports/clusters', `Verify-group poll failed for ${clusterId}`, error);
    return NextResponse.json({ error: 'Failed to read the group re-check' }, { status: 500 });
  }
}
