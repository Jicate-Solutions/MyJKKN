// ============================================================================
// MetaLoop charter drafts — the shared COLLECT pass (finished drafts → rows)
// ============================================================================
// Extracted 2026-08-26 from app/api/cron/metaloop-charter-drafts/route.ts so
// TWO clocks can run the same pass:
//   · metaloop-charter-drafts (Sundays 10:41 IST) — collect, then enqueue new
//     evidence bundles for up to 3 uncharted loops.
//   · metaloop-charter-collect (daily 12:41 IST) — collect ONLY, so a draft the
//     Max lane finishes on Sunday surfaces the same day instead of sitting
//     invisible until the NEXT Sunday. Receipt: the 3 drafts completed
//     2026-08-16 were not collected until 2026-08-23 — a week of invisibility
//     for work that took 35 seconds to produce.
//
// The other 2026-08-26 change is VISIBILITY of honest abstention: a draft
// self-reporting {insufficient:true} used to be console.warn'd and dropped —
// diagnostically rich text ("the measure gate is off", "11 flags, 0
// interventions") that died in a server log while /admin/loops/charters showed
// an empty queue and read as a broken factory. 5 of the first 6 drafts were
// such abstentions. They now land as loop_charter_proposals rows with
// status='insufficient' (display-only: nothing to approve; the partial
// one-proposed-per-loop index ignores them, so a later REAL draft is never
// blocked). Same rule-#27 shape as page-level access denials: an honest "no"
// must be explicit, never silent.
//
// Idempotency is unchanged and lives below this module: fn_ai_collect_claim's
// delivered_at stamp (exactly-once claim) + source_job_id UNIQUE (a 23505 on
// insert is a dedupe belt doing its job, never an error page).
// ============================================================================

import type { createServiceRoleClient } from '@/lib/supabase/server';
import { collectJobsLane } from '@/lib/services/platform/ai-jobs-lane';

type Admin = ReturnType<typeof createServiceRoleClient>;

export const CHARTER_JOB_TYPE = 'loops.charter_draft';
const COLLECT_BATCH = 25;

const CHARTER_LEGS = [
  'outcome_metric',
  'counter_metric',
  'intervention',
  'baseline_window',
  'remeasure_window',
] as const;

export type ParsedDraft =
  | { kind: 'charter'; proposed: Record<string, string>; rationale: string | null }
  | { kind: 'insufficient'; reason: string }
  | { kind: 'invalid'; why: string };

/** Parse the drain's strict-JSON charter draft, tolerating code fences and
 *  surrounding prose (first '{' to last '}'), then validate the contract. */
export function parseCharterDraft(text: string): ParsedDraft {
  let obj: Record<string, unknown> | null = null;
  const candidates = [text, text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')];
  const braced = text.indexOf('{') >= 0 ? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1) : '';
  if (braced) candidates.push(braced);
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        obj = parsed as Record<string, unknown>;
        break;
      }
    } catch {
      /* try the next shape */
    }
  }
  if (!obj) return { kind: 'invalid', why: 'no parseable JSON object in the model output' };

  if (obj.insufficient === true) {
    const reason = typeof obj.reason === 'string' && obj.reason.trim() ? obj.reason.trim() : '(no reason given)';
    return { kind: 'insufficient', reason };
  }

  const str = (k: string): string => (typeof obj![k] === 'string' ? (obj![k] as string).trim() : '');
  const required = [...CHARTER_LEGS, 'kill_rule'];
  const missing = required.filter((k) => str(k) === '');
  if (missing.length > 0) {
    return { kind: 'invalid', why: `missing/blank fields: ${missing.join(', ')}` };
  }
  // Vacuous-counter guard (deterministic mirror of the prompt's rule): a
  // counter metric restating the outcome guards nothing.
  if (str('counter_metric').toLowerCase() === str('outcome_metric').toLowerCase()) {
    return { kind: 'invalid', why: 'counter_metric restates outcome_metric (vacuous Goodhart pair)' };
  }

  const proposed: Record<string, string> = {};
  for (const k of required) proposed[k] = str(k);
  proposed.suggested_verdict_owner = str('suggested_verdict_owner');
  const rationale = str('rationale') || null;
  return { kind: 'charter', proposed, rationale };
}

export interface CollectSummary {
  collected: number;
  filed: number;
  insufficient: number;
  invalid: number;
  skipped: number;
  errors: number;
}

/**
 * Claim finished 'loops.charter_draft' ai_jobs (exactly-once) and file each as
 * ONE loop_charter_proposals row: a valid draft as status='proposed' (the
 * review queue), an honest {insufficient:true} abstention as
 * status='insufficient' (display-only). Contract-violating drafts stay
 * logged-and-dropped — a machine failure is the prompt championship's problem,
 * not a reviewable record.
 */
export async function collectCharterDrafts(admin: Admin): Promise<CollectSummary> {
  const summary: CollectSummary = { collected: 0, filed: 0, insufficient: 0, invalid: 0, skipped: 0, errors: 0 };
  try {
    const collected = await collectJobsLane(admin, [CHARTER_JOB_TYPE], COLLECT_BATCH);
    summary.collected = collected.length;
    for (const item of collected) {
      try {
        const loopKey = typeof item.context.loop_key === 'string' ? item.context.loop_key : null;
        // Same tolerant read the route's readMessageText used: only content[]
        // with a text block is load-bearing on the synthesized message.
        const content = (item.message as { content?: Array<{ type?: string; text?: string }> } | null)?.content;
        const raw = Array.isArray(content) ? content.find((c) => c?.type === 'text')?.text : undefined;
        const text = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
        if (!loopKey || !text) {
          summary.skipped++;
          continue;
        }
        const parsed = parseCharterDraft(text);
        if (parsed.kind === 'invalid') {
          summary.invalid++;
          console.warn(`[metaloop-charter] ${loopKey}: draft failed the contract — ${parsed.why}`);
          continue;
        }
        const insert =
          parsed.kind === 'insufficient'
            ? {
                loop_key: loopKey,
                proposed: { insufficient: true },
                rationale: parsed.reason,
                source_job_id: item.jobId,
                status: 'insufficient',
              }
            : {
                loop_key: loopKey,
                proposed: parsed.proposed,
                rationale: parsed.rationale,
                source_job_id: item.jobId,
                status: 'proposed',
              };
        const { error: insErr } = await admin.from('loop_charter_proposals').insert(insert);
        if (insErr) {
          if (insErr.code === '23505') {
            // source_job_id already filed OR an undecided proposal already
            // exists for this loop — dedupe belts doing their job.
            summary.skipped++;
          } else if (parsed.kind === 'insufficient' && insErr.code === '23514') {
            // DARK-SAFE: the status CHECK doesn't admit 'insufficient' yet
            // (migration 20260927030000 unapplied). Fall back to the old
            // log-only behaviour rather than erroring the sweep.
            summary.insufficient++;
            console.warn(
              `[metaloop-charter] ${loopKey}: insufficient (${parsed.reason}) — status migration unapplied, logged only`,
            );
          } else {
            summary.errors++;
            console.error('[metaloop-charter] proposal insert failed:', insErr.message);
          }
          continue;
        }
        if (parsed.kind === 'insufficient') summary.insufficient++;
        else summary.filed++;
      } catch (e) {
        summary.errors++;
        console.error('[metaloop-charter] collect item failed:', e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error('[metaloop-charter] collect phase failed:', e instanceof Error ? e.message : e);
  }
  return summary;
}
