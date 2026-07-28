export const dynamic = 'force-dynamic';
// Long-poll window for the Max-lane drain. Mirrors the proven ai_jobs consumers
// (ai-triage, ai-reverify, app/api/ai-query).
export const maxDuration = 300;

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const POLL_MS = 2_500;
const UNCLAIMED_DEADLINE_MS = 120_000; // drain offline → give up early
const TOTAL_DEADLINE_MS = 285_000; // < maxDuration so we always respond first

/** Candidate shortlist size handed to the model. Bounded to keep the prompt small. */
const CANDIDATE_LIMIT = 15;
/** Deliberately BELOW fn_bug_cluster_scan's 0.45 attach floor — see the migration
 *  header. Trigram is a cheap pre-filter here, not the judge. */
const CANDIDATE_FLOOR = 0.15;
/** Per-candidate description clip: 15 × 600 keeps the prompt inside a sane budget. */
const CANDIDATE_DESC_CHARS = 600;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const VERDICTS = ['duplicate', 'related', 'distinct'] as const;
const CONFIDENCES = ['low', 'medium', 'high'] as const;

interface CandidateRow {
  bug_id: string;
  display_id: string | null;
  status: string | null;
  module_name: string | null;
  sub_module_name: string | null;
  description: string | null;
  similarity: number | null;
  in_cluster: boolean | null;
}

/**
 * POST /api/bug-reports/[id]/duplicate-check
 *
 * Asks the ₹0 Max lane whether this report describes the same defect as an
 * existing open report — judged by MEANING, which is the gap the grouping engine
 * leaves. fn_bug_cluster_scan is pure pg_trgm with a 0.45 floor, so two reports
 * of one defect written in different words (the live case: 0.332) never group.
 * Here trigram only builds a bounded shortlist; the model makes the call.
 *
 * ADVISORY ONLY. The verdict lands in bug_reports.metadata.ai_duplicate_check
 * and is rendered as a suggestion. This route NEVER sets duplicate_of, never
 * changes status, and never notifies a reporter — a human clicks
 * "Mark as Duplicate" if they agree.
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

    const { data: bug, error: bugError } = await (
      adminSupabase.from('bug_reports') as any
    )
      .select('id, display_id, description, module_name, sub_module_name, metadata')
      .eq('id', reportId)
      .maybeSingle();

    if (bugError || !bug) {
      return NextResponse.json({ error: 'Bug report not found' }, { status: 404 });
    }

    if (!bug.description || bug.description.trim().length === 0) {
      return NextResponse.json(
        {
          error:
            'This report has no written description, so there is nothing to compare. Duplicate checking needs text.'
        },
        { status: 422 }
      );
    }

    // Shortlist via the locked service_role RPC (trigram pre-filter only).
    const { data: candidateRows, error: candidateError } = await (
      adminSupabase as any
    ).rpc('fn_bug_duplicate_candidates', {
      p_bug_id: reportId,
      p_limit: CANDIDATE_LIMIT,
      p_min_similarity: CANDIDATE_FLOOR
    });

    if (candidateError) {
      logger.error('bug-reports/ai', 'duplicate candidate lookup failed', {
        reportId,
        message: candidateError.message
      });
      return NextResponse.json(
        { error: 'Could not build the comparison list. Try again shortly.' },
        { status: 502 }
      );
    }

    const candidates: CandidateRow[] = Array.isArray(candidateRows)
      ? candidateRows
      : [];

    // Nothing similar enough to be worth an AI call — answer honestly and cheaply
    // rather than asking the model to compare against an empty list.
    if (candidates.length === 0) {
      const stored = {
        verdict: 'distinct' as const,
        canonical_display_id: null,
        canonical_bug_id: null,
        confidence: 'medium' as const,
        reasoning:
          'No other open report came close enough in wording to be worth comparing, so this looks like its own issue.',
        also_consider: [],
        candidates_considered: 0,
        generated_at: new Date().toISOString(),
        job_id: null,
        lane: 'none'
      };
      await persist(adminSupabase, reportId, stored);
      return NextResponse.json({ ok: true, check: stored, skipped_ai: true });
    }

    // Fence each candidate on one line. Reporter text is untrusted data — the
    // prompt says so explicitly; newlines are flattened so a crafted description
    // cannot fake extra candidate rows or a fake end-of-data marker.
    const candidateBlock = candidates
      .map((c) => {
        const desc = (c.description ?? '')
          .replace(/\s+/g, ' ')
          .slice(0, CANDIDATE_DESC_CHARS);
        const mod = [c.module_name, c.sub_module_name].filter(Boolean).join('/');
        return `${c.display_id ?? c.bug_id} | ${mod || 'unknown'} | ${desc}`;
      })
      .join('\n');

    // Payload keys MUST match the bug.duplicate_check input_schema (registry contract).
    const payload = {
      display_id: bug.display_id ?? reportId,
      module_name:
        [bug.module_name, bug.sub_module_name].filter(Boolean).join('/') || '',
      description: (bug.description ?? '').slice(0, 4000),
      candidates: candidateBlock
    };

    const dedupe = `bug-dupcheck:${reportId}`;

    // Orphan-result recovery — same rationale as ai-triage: a prior request may
    // have 504'd after enqueue while the job later completed.
    const storedGeneratedAt: string | null =
      (bug.metadata as any)?.ai_duplicate_check?.generated_at ?? null;
    const { data: orphan } = await (adminSupabase.from('ai_jobs') as any)
      .select('id, result, completed_at')
      .eq('job_type', 'bug.duplicate_check')
      .eq('status', 'done')
      .filter('payload->>_dedupe', 'eq', dedupe)
      .gte('completed_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orphan && (!storedGeneratedAt || orphan.completed_at > storedGeneratedAt)) {
      const recovered = parseCheck(orphan.result, candidates);
      if (recovered) {
        const stored = {
          ...recovered,
          candidates_considered: candidates.length,
          generated_at: new Date().toISOString(),
          job_id: orphan.id,
          lane: 'max'
        };
        await persist(adminSupabase, reportId, stored);
        return NextResponse.json({ ok: true, check: stored, recovered: true });
      }
    }

    const { data: enqueue, error: enqueueError } = await (adminSupabase as any).rpc(
      'fn_ai_enqueue_system',
      {
        p_job_type: 'bug.duplicate_check',
        p_payload: payload,
        p_dedupe_key: dedupe
      }
    );

    if (enqueueError || !enqueue?.ok) {
      const reason = enqueue?.error ?? enqueueError?.message ?? 'enqueue failed';
      if (reason === 'in_flight') {
        return NextResponse.json(
          {
            error:
              'A duplicate check for this report is already running. Try again in a minute.'
          },
          { status: 409 }
        );
      }
      logger.error('bug-reports/ai', 'bug.duplicate_check enqueue failed', {
        reportId,
        reason
      });
      return NextResponse.json(
        { error: `Could not start the duplicate check: ${reason}` },
        { status: 502 }
      );
    }

    const jobId: string = enqueue.job_id;
    const startedAt = Date.now();

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
        const check = parseCheck(job.result, candidates);
        if (!check) {
          logger.error('bug-reports/ai', 'bug.duplicate_check unparseable', {
            reportId,
            jobId
          });
          return NextResponse.json(
            { error: 'The AI returned an unreadable answer. Try again.' },
            { status: 502 }
          );
        }

        const stored = {
          ...check,
          candidates_considered: candidates.length,
          generated_at: new Date().toISOString(),
          job_id: jobId,
          lane: 'max'
        };

        await persist(adminSupabase, reportId, stored);
        return NextResponse.json({ ok: true, check: stored });
      }

      if (job.status === 'error' || job.status === 'canceled') {
        logger.error('bug-reports/ai', 'bug.duplicate_check job failed', {
          reportId,
          jobId,
          jobError: job.error
        });
        return NextResponse.json(
          { error: 'The duplicate check job failed. Try again shortly.' },
          { status: 502 }
        );
      }

      if (!job.claimed_at && Date.now() - startedAt > UNCLAIMED_DEADLINE_MS) {
        return NextResponse.json(
          {
            error:
              'The AI lane has not picked the job up yet (runner may be offline). It will finish in the background — reopen this report in a few minutes.'
          },
          { status: 504 }
        );
      }
    }

    return NextResponse.json(
      {
        error:
          'Timed out waiting for the duplicate check. It may still complete in the background — reopen this report in a few minutes.'
      },
      { status: 504 }
    );
  } catch (error) {
    logger.error(
      'bug-reports/ai',
      `duplicate-check route error for ${reportId}`,
      error
    );
    return NextResponse.json(
      { error: 'Failed to run the duplicate check.' },
      { status: 500 }
    );
  }
}

/** Merge the verdict into metadata, re-reading first to shrink the clobber window. */
async function persist(
  adminSupabase: any,
  reportId: string,
  stored: Record<string, unknown>
) {
  const { data: fresh } = await (adminSupabase.from('bug_reports') as any)
    .select('metadata')
    .eq('id', reportId)
    .maybeSingle();

  const { error: saveError } = await (adminSupabase.from('bug_reports') as any)
    .update({
      metadata: { ...(fresh?.metadata ?? {}), ai_duplicate_check: stored }
    })
    .eq('id', reportId);

  if (saveError) {
    logger.error(
      'bug-reports/ai',
      'Failed to persist ai_duplicate_check',
      saveError
    );
  }
}

/** The runner returns { answer: "<text>" }; the text should be strict JSON but
 *  may arrive fenced or padded — parse defensively, like ai-triage does. */
function parseCheck(
  result: unknown,
  candidates: CandidateRow[]
): Record<string, unknown> | null {
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
    if (!text && typeof o.verdict === 'string') return sanitize(o, candidates);
  }
  if (!text) return null;

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    return sanitize(JSON.parse(text.slice(start, end + 1)), candidates);
  } catch {
    return null;
  }
}

/**
 * Trust nothing the model names. A hallucinated canonical would point an admin
 * at a report that was never in the comparison list, so the named canonical is
 * resolved back against the shortlist we actually sent and dropped if it is not
 * there — a "duplicate" verdict with no resolvable canonical degrades to
 * "related" rather than offering a bad link.
 */
function sanitize(
  raw: Record<string, unknown>,
  candidates: CandidateRow[]
): Record<string, unknown> | null {
  const verdict = VERDICTS.includes(raw.verdict as any)
    ? (raw.verdict as (typeof VERDICTS)[number])
    : null;
  if (!verdict) return null;

  const byDisplay = new Map(
    candidates.filter((c) => c.display_id).map((c) => [c.display_id as string, c])
  );
  const byId = new Map(candidates.map((c) => [c.bug_id, c]));

  const namedDisplay =
    typeof raw.canonical_display_id === 'string' ? raw.canonical_display_id.trim() : '';
  const namedId =
    typeof raw.canonical_bug_id === 'string' ? raw.canonical_bug_id.trim() : '';

  const matched = byDisplay.get(namedDisplay) ?? byId.get(namedId) ?? null;

  let finalVerdict = verdict;
  if (verdict === 'duplicate' && !matched) finalVerdict = 'related';

  const alsoConsider = Array.isArray(raw.also_consider)
    ? (raw.also_consider as any[])
        .map((a) => {
          const did = typeof a?.display_id === 'string' ? a.display_id.trim() : '';
          const hit = byDisplay.get(did);
          if (!hit) return null; // unknown ID → drop, never surface a dead link
          return {
            display_id: did,
            bug_id: hit.bug_id,
            relation: typeof a?.relation === 'string' ? a.relation.slice(0, 240) : ''
          };
        })
        .filter(Boolean)
        .slice(0, 5)
    : [];

  return {
    verdict: finalVerdict,
    canonical_display_id: matched?.display_id ?? null,
    canonical_bug_id: matched?.bug_id ?? null,
    canonical_in_cluster: matched?.in_cluster ?? null,
    canonical_similarity:
      typeof matched?.similarity === 'number' ? matched.similarity : null,
    confidence: CONFIDENCES.includes(raw.confidence as any)
      ? raw.confidence
      : 'low',
    reasoning: typeof raw.reasoning === 'string' ? raw.reasoning.slice(0, 800) : '',
    also_consider: alsoConsider,
    downgraded: verdict === 'duplicate' && !matched
  };
}
