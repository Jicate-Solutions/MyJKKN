export const dynamic = 'force-dynamic';
// Long-poll window for the Max-lane drain (mirrors ai-triage).
export const maxDuration = 300;

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { gatherEvidence, classifyReproducibility, type ReverifyBug } from '@/lib/bug-reports/reverify/evidence';

const POLL_MS = 2_500;
const UNCLAIMED_DEADLINE_MS = 120_000;
const TOTAL_DEADLINE_MS = 285_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const VERDICTS = ['likely_fixed', 'still_broken', 'inconclusive'] as const;
const CONFIDENCES = ['low', 'medium', 'high'] as const;
const REPRO = ['read', 'write', 'unknown'] as const;

/**
 * POST /api/bug-reports/[id]/ai-reverify
 *
 * Tier 2 read re-check: gather evidence AS THE REPORTER (read-only) that the
 * reported symptom is or isn't still present, then have the `bug.reverify`
 * recipe judge likely_fixed | still_broken | inconclusive. Recommendation only —
 * NEVER resolves the bug or emails anyone.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id: reportId } = await params;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!profile || !['super_admin', 'administrator', 'ceo'].includes((profile as any).role)) {
      return NextResponse.json({ error: 'Admin permissions required' }, { status: 403 });
    }

    const adminSupabase = createAdminClient();

    const { data: bug, error: bugError } = await (adminSupabase.from('bug_reports') as any)
      .select(
        'id, display_id, description, page_url, module_name, sub_module_name, category, console_logs, reporter_user_id, institution_id, created_at, metadata'
      )
      .eq('id', reportId)
      .maybeSingle();
    if (bugError || !bug) {
      return NextResponse.json({ error: 'Bug report not found' }, { status: 404 });
    }

    // Gather evidence as the reporter (read-only). Never throws the request —
    // any failure degrades to a note the judge treats as thin evidence.
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
      evidence = await gatherEvidence(reverifyBug, adminSupabase);
    } catch (e) {
      logger.error('bug-reports/ai', 'reverify evidence gathering failed', e);
      evidence = {
        reporter_reachable: 'unknown',
        reporter_scope_note: 'Evidence gathering errored; judged on the report text alone.',
        probe_result: 'unavailable',
        error_recurrence: 'unavailable',
        symptom_recurrence: 'unavailable',
      };
    }

    const consoleExcerpt = compactConsole(bug.console_logs);
    const daysSince = Math.floor(
      (Date.now() - new Date(bug.created_at).getTime()) / 86_400_000
    );

    const payload = {
      display_id: bug.display_id ?? reportId,
      reported_at: bug.created_at,
      days_since: String(daysSince),
      module_name: bug.module_name ?? '',
      sub_module_name: bug.sub_module_name ?? '',
      description: (bug.description ?? '').slice(0, 4000),
      console_excerpt: consoleExcerpt,
      reporter_reachable: evidence.reporter_reachable,
      reporter_scope_note: evidence.reporter_scope_note,
      probe_result: evidence.probe_result,
      error_recurrence: evidence.error_recurrence,
      symptom_recurrence: evidence.symptom_recurrence,
    };

    const dedupe = `bug-reverify:${reportId}`;

    // Orphan-result recovery (same rationale as ai-triage): reuse a recently
    // completed job if a prior request timed out after enqueue.
    const storedGeneratedAt: string | null =
      (bug.metadata as any)?.ai_reverify?.generated_at ?? null;
    const { data: orphan } = await (adminSupabase.from('ai_jobs') as any)
      .select('id, result, completed_at')
      .eq('job_type', 'bug.reverify')
      .eq('status', 'done')
      .filter('payload->>_dedupe', 'eq', dedupe)
      .gte('completed_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (orphan && (!storedGeneratedAt || orphan.completed_at > storedGeneratedAt)) {
      const recovered = parseVerdict(orphan.result, reverifyBug);
      if (recovered) {
        const stored = { ...recovered, generated_at: new Date().toISOString(), job_id: orphan.id };
        await (adminSupabase.from('bug_reports') as any)
          .update({ metadata: { ...(bug.metadata ?? {}), ai_reverify: stored } })
          .eq('id', reportId);
        return NextResponse.json({ ok: true, verdict: stored, recovered: true });
      }
    }

    const { data: enqueue, error: enqueueError } = await (adminSupabase as any).rpc(
      'fn_ai_enqueue_system',
      { p_job_type: 'bug.reverify', p_payload: payload, p_dedupe_key: dedupe }
    );
    if (enqueueError || !enqueue?.ok) {
      const reason = enqueue?.error ?? enqueueError?.message ?? 'enqueue failed';
      if (reason === 'in_flight') {
        return NextResponse.json(
          { error: 'A re-verification for this bug is already running. Try again in a minute.' },
          { status: 409 }
        );
      }
      logger.error('bug-reports/ai', 'bug.reverify enqueue failed', { reportId, reason });
      return NextResponse.json({ error: `Could not start re-verification: ${reason}` }, { status: 502 });
    }

    const jobId: string = enqueue.job_id;
    const startedAt = Date.now();
    while (Date.now() - startedAt < TOTAL_DEADLINE_MS) {
      await sleep(POLL_MS);
      const { data: job } = await (adminSupabase.from('ai_jobs') as any)
        .select('status, result, error, claimed_at')
        .eq('id', jobId)
        .maybeSingle();
      if (!job) continue;

      if (job.status === 'done') {
        const verdict = parseVerdict(job.result, reverifyBug);
        if (!verdict) {
          return NextResponse.json(
            { error: 'The AI returned an unreadable verdict. Try again.' },
            { status: 502 }
          );
        }
        const stored = { ...verdict, generated_at: new Date().toISOString(), job_id: jobId };
        const { data: fresh } = await (adminSupabase.from('bug_reports') as any)
          .select('metadata')
          .eq('id', reportId)
          .maybeSingle();
        const { error: saveError } = await (adminSupabase.from('bug_reports') as any)
          .update({ metadata: { ...(fresh?.metadata ?? {}), ai_reverify: stored } })
          .eq('id', reportId);
        if (saveError) logger.error('bug-reports/ai', 'Failed to persist ai_reverify', saveError);
        return NextResponse.json({ ok: true, verdict: stored });
      }

      if (job.status === 'error' || job.status === 'canceled') {
        logger.error('bug-reports/ai', 'bug.reverify job failed', { reportId, jobId, jobError: job.error });
        return NextResponse.json({ error: 'The re-verification job failed. Try again shortly.' }, { status: 502 });
      }
      if (!job.claimed_at && Date.now() - startedAt > UNCLAIMED_DEADLINE_MS) {
        return NextResponse.json(
          { error: 'The AI lane has not picked the job up yet (runner may be busy). It will finish in the background — reopen this bug in a few minutes.' },
          { status: 504 }
        );
      }
    }
    return NextResponse.json(
      { error: 'Timed out waiting for the verdict. It may still complete in the background — reopen this bug shortly.' },
      { status: 504 }
    );
  } catch (error) {
    logger.error('bug-reports/ai', `ai-reverify route error for ${reportId}`, error);
    return NextResponse.json({ error: 'Failed to re-verify the bug.' }, { status: 500 });
  }
}

function compactConsole(consoleLogs: unknown): string {
  if (!Array.isArray(consoleLogs) || consoleLogs.length === 0) return '';
  const errorish = consoleLogs.filter((l: any) => l && (l.type === 'error' || l.level === 'error'));
  const picked = (errorish.length > 0 ? errorish : consoleLogs).slice(0, 3);
  return JSON.stringify(picked).slice(0, 1500);
}

/** Parse the strict-JSON verdict. Forces reproducible to 'write' when the
 *  description is clearly a write symptom, so a WRITE bug can never be reported
 *  as read-verified "fixed" even if the model slips. */
function parseVerdict(result: unknown, bug: ReverifyBug): Record<string, unknown> | null {
  let text: string | null = null;
  if (typeof result === 'string') text = result;
  else if (result && typeof result === 'object') {
    const o = result as Record<string, unknown>;
    for (const k of ['answer', 'text', 'result']) {
      if (typeof o[k] === 'string') { text = o[k] as string; break; }
    }
    if (!text && typeof o.verdict === 'string') return sanitize(o, bug);
  }
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return sanitize(JSON.parse(text.slice(start, end + 1)), bug);
  } catch {
    return null;
  }
}

function sanitize(raw: Record<string, unknown>, bug: ReverifyBug): Record<string, unknown> | null {
  if (typeof raw.reasoning !== 'string' || raw.reasoning.trim().length === 0) return null;
  const heuristicRepro = classifyReproducibility(bug.description ?? '');
  let verdict = VERDICTS.includes(raw.verdict as any) ? (raw.verdict as string) : 'inconclusive';
  let reproducible = REPRO.includes(raw.reproducible as any) ? (raw.reproducible as string) : 'unknown';
  // Safety clamp: a write symptom cannot be read-verified as fixed.
  if (heuristicRepro === 'write') {
    reproducible = 'write';
    if (verdict === 'likely_fixed') verdict = 'inconclusive';
  }
  return {
    verdict,
    confidence: CONFIDENCES.includes(raw.confidence as any) ? raw.confidence : 'low',
    reasoning: raw.reasoning,
    what_would_confirm: typeof raw.what_would_confirm === 'string' ? raw.what_would_confirm : '',
    reproducible,
  };
}
