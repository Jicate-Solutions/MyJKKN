// =====================================================================
// Accreditation — AI NAAC narrative drafter (₹0 Max lane, DARK)
// =====================================================================
// Nightly cron that (1) COLLECTS finished draft jobs, validates each against
// the deterministic grounding gate, and records the verdict; then (2) ENQUEUES
// a grounded draft job for every evidence-backed (institution, NAAC metric)
// pair that has no draft for the current period.
//
// Spec: specs/accreditation-narrative-drafter-plan-2026-07-25.md
// Mirrors app/api/cron/scf-note-judge/route.ts (collect-then-enqueue, polling).
//
// DARK: the ai_job_types row 'accreditation.naac_narrative_draft' is
// enabled=false, so fn_ai_enqueue_system refuses every enqueue → nothing runs.
// This route is therefore a safe no-op until the Director flips enabled=true
// (no deploy). It never changes a submission or approves anything: the model
// output only lands as an 'ai_drafted' row that a human must okay.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> ONLY (constant-time).
// Does not call Claude directly — the external Max-lane drain runs the model.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { collectJobsLane, enqueueJobsLane } from '@/lib/services/platform/ai-jobs-lane';
import {
  getGroundingSet,
  buildGroundingPrompt,
  parseModelDraft,
  stripCitationMarkers,
  currentAcademicYearLabel,
} from '@/lib/services/accreditation/accreditation-draft-service';
import { validateGrounding } from '@/lib/services/accreditation/grounding-validator';

const JOB_TYPE = 'accreditation.naac_narrative_draft';
const BODY_CODE = 'NAAC';
const COLLECT_BATCH = 25;
const ENQUEUE_BATCH = 25;

function bearerMatches(authHeader: string | null, secret: string): boolean {
  const presented = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Read the text from a synthesized Max-lane message (content[].type==='text'). */
function readMessageText(msg: unknown): string | null {
  const content = (msg as { content?: Array<{ type?: string; text?: string }> } | null)?.content;
  if (!Array.isArray(content)) return null;
  const t = content.find((c) => c?.type === 'text')?.text;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || !bearerMatches(authHeader, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const period = currentAcademicYearLabel();
  const summary = { collected: 0, recorded: 0, grounded: 0, ungrounded: 0, enqueued: 0, skipped: 0, errors: 0 };

  // ── 1) COLLECT: validate + record any finished drafts ──────────────────────
  try {
    const collected = await collectJobsLane(admin, [JOB_TYPE], COLLECT_BATCH);
    summary.collected = collected.length;
    for (const item of collected) {
      try {
        const ctx = item.context as {
          institution_id?: string; institution_name?: string;
          metric_code?: string; body_code?: string; period_label?: string;
        };
        const text = readMessageText(item.message);
        if (!ctx.institution_id || !ctx.metric_code || !text) {
          summary.skipped++;
          continue;
        }
        const bodyCode = ctx.body_code ?? BODY_CODE;
        const periodLabel = ctx.period_label ?? period;

        // Re-fetch the evidence the draft was grounded on (stable) and validate.
        const { rows } = await getGroundingSet(admin, {
          institutionId: ctx.institution_id,
          metricCode: ctx.metric_code,
          bodyCode,
        });
        const draft = parseModelDraft(text);
        const clean = stripCitationMarkers(draft.narrative_md);
        const gv = validateGrounding(clean, rows, {
          period: periodLabel,
          metricCode: ctx.metric_code,
          scopeLabel: ctx.institution_name,
        });

        const { error: recErr } = await admin.rpc('fn_accreditation_record_narrative_draft', {
          p_institution_id: ctx.institution_id,
          p_body_code: bodyCode,
          p_metric_code: ctx.metric_code,
          p_period_label: periodLabel,
          p_narrative_md: draft.narrative_md,
          p_citations: draft.citations,
          p_grounding_verdict: gv.verdict,
          p_ungrounded_tokens: gv.ungroundedTokens,
          p_evidence_row_count: rows.length,
          p_model: 'max-lane',
          p_ai_job_id: item.jobId,
        });
        if (recErr) {
          summary.errors++;
          console.error('[accred-drafter] record failed:', recErr.message);
          continue;
        }
        summary.recorded++;
        gv.verdict === 'grounded' ? summary.grounded++ : summary.ungrounded++;
      } catch (e) {
        summary.errors++;
        console.error('[accred-drafter] collect item failed:', e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error('[accred-drafter] collect phase failed:', e instanceof Error ? e.message : e);
  }

  // ── 2) ENQUEUE: one draft job per evidence-backed (institution, metric) ─────
  // While DARK (enabled=false) fn_ai_enqueue_system returns unknown/disabled →
  // enqueueJobsLane reports ok:false and nothing is queued. That is expected.
  try {
    const { data: awaiting, error: awErr } = await admin.rpc('fn_accreditation_narrative_awaiting', {
      p_body_code: BODY_CODE,
      p_period_label: period,
      p_limit: ENQUEUE_BATCH,
    });
    if (awErr) throw new Error(awErr.message);

    const pairs = (awaiting ?? []) as Array<{ institution_id: string; metric_code: string }>;
    // Resolve institution names once for the prompt's scope line (prose quality).
    const instIds = [...new Set(pairs.map((p) => p.institution_id))];
    const nameById = new Map<string, string>();
    if (instIds.length) {
      const { data: insts } = await admin.from('institutions').select('id, name').in('id', instIds);
      for (const i of (insts ?? []) as Array<{ id: string; name: string }>) nameById.set(i.id, i.name);
    }

    for (const pair of pairs) {
      try {
        const gs = await getGroundingSet(admin, {
          institutionId: pair.institution_id,
          metricCode: pair.metric_code,
          bodyCode: BODY_CODE,
        });
        if (gs.rows.length === 0) {
          summary.skipped++;
          continue;
        }
        const prompt = buildGroundingPrompt({
          metric: gs.metric,
          rows: gs.rows,
          period,
          scopeLabel: nameById.get(pair.institution_id) ?? pair.institution_id,
        });
        const res = await enqueueJobsLane(admin, {
          jobType: JOB_TYPE,
          prompt,
          context: {
            institution_id: pair.institution_id,
            institution_name: nameById.get(pair.institution_id) ?? '',
            metric_code: pair.metric_code,
            body_code: BODY_CODE,
            period_label: period,
          },
          dedupeKey: `${pair.institution_id}:${pair.metric_code}:${period}`,
        });
        if (res.ok) summary.enqueued++;
        else summary.skipped++; // dark (unknown_type) or in_flight → expected
      } catch (e) {
        summary.errors++;
        console.error('[accred-drafter] enqueue item failed:', e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error('[accred-drafter] enqueue phase failed:', e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true, period, ...summary });
}
