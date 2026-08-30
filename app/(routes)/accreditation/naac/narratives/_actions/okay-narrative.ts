'use server';

// app/(routes)/accreditation/naac/narratives/_actions/okay-narrative.ts
// ============================================================================
// Owner "okay" transition WITH re-validation of the human edit — the fraud gate
// kept alive across manual edits.
//
// The AI draft was grounded before it was ever offered for okay. But the owning
// Senior Learner may EDIT the prose before okaying it, and a manual edit could
// (accidentally or otherwise) introduce a figure, date, or course code that is
// not traceable to the cited evidence. So before we advance the row we re-run
// the SAME deterministic grounding validator on the edited text. If the edit is
// ungrounded we refuse and hand the offending tokens back to the UI; only a
// grounded edit reaches the state-machine RPC.
//
// Client discipline:
//   * service-role client — used to READ the row + its evidence (the grounding
//     set). Its ONLY write is the measurement side-channel below (edit_distance
//     / edit_ratio / edit_measured_at), which runs strictly AFTER a successful
//     transition, is fail-open, and can never advance or block a narrative.
//   * session client (cookie-bound) — used to CALL the transition RPC, so
//     auth.uid() inside the SECURITY DEFINER function is the acting user and its
//     permission / institution-scope checks resolve against the real caller.
//     (Calling the RPC with the service-role client would make auth.uid() NULL
//     and the permission checks would misfire.)
//
// RETURN EDGE (measurement only): after the okay stands, we record how far the
// human moved the AI's draft — token-level Levenshtein between the ai_draft_md
// snapshot and the okayed text. This is the drafter's quality signal (0 =
// accepted verbatim, 1 = fully rewritten). If the measurement fails for any
// reason — including the migration adding those columns not being applied yet
// — the okay is unaffected and a console.warn records the skip.
// ============================================================================

import { createServiceRoleClient, createClient } from '@/lib/supabase/server';
import {
  getGroundingSet,
  stripCitationMarkers,
} from '@/lib/services/accreditation/accreditation-draft-service';
import { validateGrounding } from '@/lib/services/accreditation/grounding-validator';
import { computeNarrativeEditStats } from '@/lib/services/accreditation/narrative-edit-distance';

// Flat shape (not a discriminated union): the repo runs with
// strictNullChecks:false, under which boolean-discriminant narrowing does not
// work — so callers read `error` / `ungroundedTokens` off the same object,
// guarded by `ok`.
export interface OkayNarrativeResult {
  ok: boolean;
  error?: string;
  ungroundedTokens?: string[];
}

export async function okayNarrative(
  id: string,
  editedMd: string,
): Promise<OkayNarrativeResult> {
  if (!id || typeof editedMd !== 'string' || editedMd.trim().length === 0) {
    return { ok: false, error: 'A non-empty narrative is required to okay.' };
  }

  // ── 1) ACCESS GATE (session client, RLS): the caller must be able to SEE
  // this narrative before we read any evidence. Anyone who passes this already
  // sees its grounding verdict + ungrounded tokens on the detail page, so the
  // subsequent grounding computation leaks nothing extra; a caller who cannot
  // view the row (cross-tenant / no access) is refused here before any evidence
  // read. The state-machine RPC below still enforces the stricter owner/.edit
  // check for the actual transition.
  const session = await createClient();
  const { data: row, error: rowErr } = await (session as any)
    .from('accreditation_metric_narratives')
    .select('institution_id, metric_code, body_code, period_label')
    .eq('id', id)
    .maybeSingle();
  if (rowErr) return { ok: false, error: `Could not load narrative: ${rowErr.message}` };
  if (!row) return { ok: false, error: 'Narrative not found or you do not have access.' };

  // Institution name → the scope label the validator allows as context tokens.
  // Evidence + name are read service-role (RLS-independent), now gated behind
  // the access check above.
  const admin = createServiceRoleClient();
  const { data: inst } = await admin
    .from('institutions')
    .select('name')
    .eq('id', row.institution_id)
    .maybeSingle();

  // ── 2) Re-derive the grounding set + re-validate the EDITED text ───────────
  const set = await getGroundingSet(admin, {
    institutionId: row.institution_id,
    metricCode: row.metric_code,
    bodyCode: row.body_code,
  });

  const result = validateGrounding(stripCitationMarkers(editedMd), set.rows, {
    period: row.period_label,
    metricCode: row.metric_code,
    scopeLabel: inst?.name ?? undefined,
  });

  if (result.verdict === 'ungrounded') {
    // Refuse — the edit added tokens the evidence cannot account for.
    return { ok: false, ungroundedTokens: result.ungroundedTokens };
  }

  // ── 3) Grounded → advance via the state-machine RPC as the real caller ─────
  const { error: rpcErr } = await (session as any).rpc(
    'fn_accreditation_narrative_transition',
    { p_id: id, p_action: 'owner_okay', p_edited_md: editedMd },
  );
  if (rpcErr) return { ok: false, error: rpcErr.message };

  // ── 4) MEASUREMENT (fail-open, after the okay already stands) ──────────────
  // Record how far the human moved the AI draft. The transition never touches
  // ai_draft_md, so reading it after the RPC still yields the AI's snapshot.
  // Rows without a snapshot (advanced before the snapshot column existed, or
  // migration not applied yet) are skipped — measured coverage starts where the
  // snapshot starts. Any failure here warns and is swallowed: measurement must
  // never make an okay fail.
  try {
    const { data: snap, error: snapErr } = await (admin as any)
      .from('accreditation_metric_narratives')
      .select('ai_draft_md')
      .eq('id', id)
      .maybeSingle();
    if (snapErr) {
      console.warn('[accreditation] edit-distance skipped (snapshot read failed):', snapErr.message);
    } else if (typeof snap?.ai_draft_md === 'string' && snap.ai_draft_md.trim().length > 0) {
      const stats = computeNarrativeEditStats(snap.ai_draft_md, editedMd);
      const { error: updErr } = await (admin as any)
        .from('accreditation_metric_narratives')
        .update({
          edit_distance: stats.editDistance,
          edit_ratio: stats.editRatio,
          edit_measured_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (updErr) {
        console.warn('[accreditation] edit-distance skipped (metrics write failed):', updErr.message);
      }
    }
  } catch (e) {
    console.warn('[accreditation] edit-distance skipped:', e instanceof Error ? e.message : e);
  }

  return { ok: true };
}
