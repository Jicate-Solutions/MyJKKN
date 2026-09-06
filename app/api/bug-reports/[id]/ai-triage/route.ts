export const dynamic = 'force-dynamic';
// Long-poll window for the Max-lane drain (claims ~every minute). Mirrors the
// proven ai_jobs consumers (app/api/ai-query, app/api/work-pulse/translate).
export const maxDuration = 300;

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const POLL_MS = 2_500;
const UNCLAIMED_DEADLINE_MS = 120_000; // drain offline → give up early
const TOTAL_DEADLINE_MS = 285_000; // < maxDuration so we always respond first

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
const CONFIDENCES = ['low', 'medium', 'high'] as const;

/**
 * POST /api/bug-reports/[id]/ai-triage
 *
 * Generates the AI briefing for one bug on the ₹0 Max lane:
 * admin gate → enqueue `bug.triage` via fn_ai_enqueue_system (service role,
 * deduped per bug) → long-poll the job → parse the strict-JSON briefing →
 * persist to bug_reports.metadata.ai_triage → return it.
 *
 * The job is text-only (tool_set='none') and the report content is fenced as
 * untrusted data in the prompt, so reporter-controlled text cannot steer tools.
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
      error: authError
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !profile ||
      (!(profile as any).is_super_admin && !['super_admin', 'administrator', 'ceo'].includes(profile.role))
    ) {
      return NextResponse.json({ error: 'Admin permissions required' }, { status: 403 });
    }

    const adminSupabase = createAdminClient();

    const { data: bug, error: bugError } = await (
      adminSupabase.from('bug_reports') as any
    )
      .select(
        'id, display_id, description, page_url, module_name, sub_module_name, category, console_logs, metadata'
      )
      .eq('id', reportId)
      .maybeSingle();

    if (bugError || !bug) {
      return NextResponse.json({ error: 'Bug report not found' }, { status: 404 });
    }

    // Compact console excerpt: first few error-ish entries, clipped hard so the
    // prompt stays small even for log-heavy reports.
    let consoleExcerpt = '';
    if (Array.isArray(bug.console_logs) && bug.console_logs.length > 0) {
      const errorish = bug.console_logs.filter(
        (l: any) => l && (l.type === 'error' || l.level === 'error')
      );
      const picked = (errorish.length > 0 ? errorish : bug.console_logs).slice(0, 3);
      consoleExcerpt = JSON.stringify(picked).slice(0, 1500);
    }

    // Payload keys MUST match the bug.triage input_schema (registry contract).
    const payload = {
      display_id: bug.display_id ?? reportId,
      page_url: bug.page_url ?? '',
      module_name: bug.module_name ?? '',
      sub_module_name: bug.sub_module_name ?? '',
      category: bug.category ?? '',
      description: (bug.description ?? '').slice(0, 4000),
      console_excerpt: consoleExcerpt
    };

    // Orphan-result recovery: if a prior request timed out AFTER its job was
    // enqueued (route 504s while the drain is slow/offline) and the job later
    // completed, the briefing exists on the job row but was never copied to
    // the bug. Reuse it instead of paying for a duplicate run. A normal
    // "Regenerate" is unaffected: after a successful run the stored briefing's
    // generated_at is later than that job's completed_at, so this misses and a
    // fresh job is enqueued.
    const storedGeneratedAt: string | null =
      (bug.metadata as any)?.ai_triage?.generated_at ?? null;
    const { data: orphan } = await (adminSupabase.from('ai_jobs') as any)
      .select('id, result, completed_at')
      .eq('job_type', 'bug.triage')
      .eq('status', 'done')
      .filter('payload->>_dedupe', 'eq', `bug-triage:${reportId}`)
      .gte('completed_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orphan && (!storedGeneratedAt || orphan.completed_at > storedGeneratedAt)) {
      const recovered = parseBriefing(orphan.result);
      if (recovered) {
        const stored = {
          ...recovered,
          generated_at: new Date().toISOString(),
          job_id: orphan.id,
          lane: 'max'
        };
        const { error: saveError } = await (
          adminSupabase.from('bug_reports') as any
        )
          .update({ metadata: { ...(bug.metadata ?? {}), ai_triage: stored } })
          .eq('id', reportId);
        if (saveError) {
          logger.error('bug-reports/ai', 'Failed to persist recovered ai_triage', saveError);
        }
        return NextResponse.json({ ok: true, briefing: stored, recovered: true });
      }
    }

    const { data: enqueue, error: enqueueError } = await (adminSupabase as any).rpc(
      'fn_ai_enqueue_system',
      {
        p_job_type: 'bug.triage',
        p_payload: payload,
        p_dedupe_key: `bug-triage:${reportId}`
      }
    );

    if (enqueueError || !enqueue?.ok) {
      const reason = enqueue?.error ?? enqueueError?.message ?? 'enqueue failed';
      if (reason === 'in_flight') {
        return NextResponse.json(
          { error: 'A briefing for this bug is already being generated. Try again in a minute.' },
          { status: 409 }
        );
      }
      logger.error('bug-reports/ai', 'bug.triage enqueue failed', { reportId, reason });
      return NextResponse.json(
        { error: `Could not start the AI briefing: ${reason}` },
        { status: 502 }
      );
    }

    const jobId: string = enqueue.job_id;
    const startedAt = Date.now();

    // Poll the queue directly with the service-role client (jobs enqueued by
    // fn_ai_enqueue_system belong to the seat owner, so the session-scoped
    // fn_ai_job_status cannot see them from this admin's session).
    while (Date.now() - startedAt < TOTAL_DEADLINE_MS) {
      await sleep(POLL_MS);

      const { data: job, error: jobError } = await (
        adminSupabase.from('ai_jobs') as any
      )
        .select('status, result, error, claimed_at')
        .eq('id', jobId)
        .maybeSingle();

      if (jobError || !job) continue; // transient read hiccup — keep polling

      if (job.status === 'done') {
        const briefing = parseBriefing(job.result);
        if (!briefing) {
          logger.error('bug-reports/ai', 'bug.triage result unparseable', { reportId, jobId });
          return NextResponse.json(
            { error: 'The AI returned an unreadable briefing. Try regenerating.' },
            { status: 502 }
          );
        }

        const stored = {
          ...briefing,
          generated_at: new Date().toISOString(),
          job_id: jobId,
          lane: 'max'
        };

        // Re-read metadata just before merging to shrink the clobber window.
        const { data: fresh } = await (adminSupabase.from('bug_reports') as any)
          .select('metadata')
          .eq('id', reportId)
          .maybeSingle();

        const { error: saveError } = await (
          adminSupabase.from('bug_reports') as any
        )
          .update({ metadata: { ...(fresh?.metadata ?? {}), ai_triage: stored } })
          .eq('id', reportId);

        if (saveError) {
          logger.error('bug-reports/ai', 'Failed to persist ai_triage', saveError);
          // Still return the briefing — the admin sees it even if persistence failed.
        }

        return NextResponse.json({ ok: true, briefing: stored });
      }

      if (job.status === 'error' || job.status === 'canceled') {
        logger.error('bug-reports/ai', 'bug.triage job failed', {
          reportId,
          jobId,
          jobError: job.error
        });
        return NextResponse.json(
          { error: 'The AI briefing job failed. Try again shortly.' },
          { status: 502 }
        );
      }

      if (
        !job.claimed_at &&
        Date.now() - startedAt > UNCLAIMED_DEADLINE_MS
      ) {
        return NextResponse.json(
          {
            error:
              'The AI lane has not picked the job up yet (runner may be offline). The briefing will finish in the background — reopen this bug in a few minutes.'
          },
          { status: 504 }
        );
      }
    }

    return NextResponse.json(
      {
        error:
          'Timed out waiting for the briefing. It may still complete in the background — reopen this bug in a few minutes.'
      },
      { status: 504 }
    );
  } catch (error) {
    logger.error('bug-reports/ai', `ai-triage route error for ${reportId}`, error);
    return NextResponse.json(
      { error: 'Failed to generate the AI briefing.' },
      { status: 500 }
    );
  }
}

/** The runner returns { answer: "<text>" } (ai-query contract). The text should
 *  be strict JSON but may arrive fenced or padded — parse defensively. */
function parseBriefing(result: unknown): Record<string, unknown> | null {
  let text: string | null = null;
  if (typeof result === 'string') text = result;
  else if (result && typeof result === 'object') {
    const o = result as Record<string, unknown>;
    for (const key of ['answer', 'text', 'result']) {
      if (typeof o[key] === 'string') {
        text = o[key] as string;
        break;
      }
    }
    // Some runners may already return the parsed object.
    if (!text && typeof o.summary === 'string') return sanitizeBriefing(o);
  }
  if (!text) return null;

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return sanitizeBriefing(parsed);
  } catch {
    return null;
  }
}

function sanitizeBriefing(raw: Record<string, unknown>): Record<string, unknown> | null {
  if (typeof raw.summary !== 'string' || raw.summary.trim().length === 0) return null;
  return {
    summary: raw.summary,
    severity: SEVERITIES.includes(raw.severity as any) ? raw.severity : 'medium',
    category_verdict:
      typeof raw.category_verdict === 'string' ? raw.category_verdict : 'other',
    module_guess: typeof raw.module_guess === 'string' ? raw.module_guess : '',
    root_cause: typeof raw.root_cause === 'string' ? raw.root_cause : '',
    fix_steps: Array.isArray(raw.fix_steps)
      ? raw.fix_steps.filter((s) => typeof s === 'string').slice(0, 8)
      : [],
    confidence: CONFIDENCES.includes(raw.confidence as any) ? raw.confidence : 'low'
  };
}
