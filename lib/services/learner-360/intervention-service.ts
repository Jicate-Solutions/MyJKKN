// =====================================================================
// Learner 360 — intervention record service (the loop's ACT leg)
// =====================================================================
// Created: 2026-08-26 (Loop Program Wave 2, learner-360 return edge).
//
// One job: record that a human acted on a 360 standing verdict, through the
// SECDEF RPC fn_learner_360_record_intervention (20260930010000). The RPC
// derives learner_id + institution_id from the verdict row itself and gates
// in-body on learners.standing.intervene (or admin), so this module adds no
// authorization logic of its own — it must be called with the SESSION client
// (cookie-bound), never the service-role client, so auth.uid() inside the
// SECURITY DEFINER function resolves to the real acting user.
//
// The measurement half of the return edge (band delta at the learner's next
// verdict) is written by fn_learner_360_measure_reverdict_delta, fired by the
// nightly learner-360-verdict cron — nothing here touches it.
// =====================================================================

import type { createClient } from '@/lib/supabase/server';

/** Mirror of the RPC's own cap — refuse early with a friendlier message. */
export const MAX_ACTION_TAKEN_LENGTH = 2000;

// Flat shape (not a discriminated union): the repo runs with
// strictNullChecks:false, under which boolean-discriminant narrowing does not
// work — callers read `error` / `interventionId` off the same object,
// guarded by `ok`.
export interface RecordInterventionResult {
  ok: boolean;
  /** The new learner_360_interventions row id, when ok. */
  interventionId?: string;
  error?: string;
}

/**
 * Record an action taken on a 360 verdict.
 *
 * @param session the cookie-bound SESSION Supabase client (auth.uid() must be
 *                the acting user — a service-role client would make it NULL
 *                and the RPC correctly refuses).
 */
export async function recordLearner360Intervention(
  session: Awaited<ReturnType<typeof createClient>>,
  params: { verdictId: string; actionTaken: string },
): Promise<RecordInterventionResult> {
  const verdictId = (params.verdictId ?? '').trim();
  const actionTaken = (params.actionTaken ?? '').trim();

  if (!verdictId) {
    return { ok: false, error: 'A verdict id is required.' };
  }
  if (!actionTaken) {
    return { ok: false, error: 'Describe the action taken — it cannot be empty.' };
  }
  if (actionTaken.length > MAX_ACTION_TAKEN_LENGTH) {
    return {
      ok: false,
      error: `Action description is too long (max ${MAX_ACTION_TAKEN_LENGTH} characters).`,
    };
  }

  const { data, error } = await session.rpc('fn_learner_360_record_intervention', {
    p_verdict_id: verdictId,
    p_action_taken: actionTaken,
  });

  if (error) {
    // 42501 covers both "no such verdict" and "not permitted" by design (no
    // existence oracle) — surface the same neutral message the RPC raises.
    return { ok: false, error: error.message };
  }

  return { ok: true, interventionId: data as unknown as string };
}
