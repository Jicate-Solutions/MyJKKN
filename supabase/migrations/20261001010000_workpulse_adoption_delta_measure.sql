-- =============================================================================
-- 20261001010000_workpulse_adoption_delta_measure.sql
-- Work-pulse return edge: suggestion → adoption mark → next week's signals delta.
--
-- NOT APPLIED AT PR TIME — prod apply is Director-gated (FILE ONLY).
--
-- Loop Program master spec (2026-08-13), Wave 2 row "Work-pulse": the weekly
-- suggestion loop (worksignals.weekly_suggestion, ~16 drafts in the last 7
-- days) writes a suggestion and takes a human verdict, but nothing ever
-- MEASURES whether an adopted suggestion changed the next week — the loop is
-- verdict-in, nothing-out. This file adds the missing measurement leg.
--
-- SURVEY FINDING (build-only-what's-missing): the "adoption mark" ALREADY
-- exists on production — work_signal_suggestions.human_verdict
-- ('tried_helped' | 'tried_no_change' | 'not_tried', 20260725140000), written
-- only by the subject via fn_work_signal_suggestion_verdict and surfaced as
-- buttons on components/work-signals/weekly-suggestion-card.tsx. This file
-- does NOT invent a parallel adoption mechanism: "adopted" is DEFINED as
-- human_verdict IN ('tried_helped','tried_no_change') — the subject tried it.
--
-- WHAT THIS FILE ADDS (house pattern = the SCF mould,
-- fn_scf_measure_suggestion_outcomes 20260630170000: outcome columns ON the
-- suggestion row + a service_role-only SECDEF measurer + a partial index on
-- the unmeasured backlog):
--   1. outcome columns on work_signal_suggestions (signals re-read at measure
--      time, per-signal delta vs the suggestion week's own snapshot, stamp).
--   2. fn_work_signal_suggestion_measure_deltas — recomputes the SAME three
--      od_* signals the enqueue cron snapshotted (identical definitions,
--      mirrored from app/api/cron/work-signal-suggestions/route.ts) and
--      records next-minus-snapshot per key. Runs as a weekly ride-along on
--      the same cron (same clock as the fn_clarification_term_close
--      precedent), so in the normal path the re-read lands exactly one week
--      after the snapshot.
--   3. loop_registry seed row 'work-pulse' (was missing — verified: no seed
--      migration inserts it). Charter legs deliberately NULL — MetaLoop
--      drafts charters, humans sign; this file never writes legs.
--
-- DOCTRINE (unchanged from fn_work_signals_for / 20260725140000): the delta is
-- the person's own week vs their own prior week — never a score, never ranked,
-- never compared to peers, never auto-acted-on. RLS on the table is untouched:
-- the subject (and super_admin) can read their own outcome columns; only
-- service_role writes them.
-- =============================================================================

-- ── 1. Outcome columns + candidate index ─────────────────────────────────────

ALTER TABLE public.work_signal_suggestions
  ADD COLUMN IF NOT EXISTS outcome_signals     jsonb,
  ADD COLUMN IF NOT EXISTS outcome_delta       jsonb,
  ADD COLUMN IF NOT EXISTS outcome_measured_at timestamptz;

COMMENT ON COLUMN public.work_signal_suggestions.outcome_signals IS
  'The same od_* signals as signals_snapshot, re-read at measure time (normally the following Monday''s cron). NULL = not measured yet.';
COMMENT ON COLUMN public.work_signal_suggestions.outcome_delta IS
  'Per-signal next-minus-snapshot delta for ADOPTED suggestions (human_verdict tried_helped/tried_no_change). The subject''s own week vs their own prior week — never a peer comparison.';
COMMENT ON COLUMN public.work_signal_suggestions.outcome_measured_at IS
  'When fn_work_signal_suggestion_measure_deltas recorded the delta. NULL = unmeasured (not yet adopted, or not yet a week old).';

-- Candidate scan: unmeasured, verdicted rows only (mirrors the SCF partial
-- index idiom on scf_ai_suggestions WHERE outcome_lift IS NULL).
CREATE INDEX IF NOT EXISTS idx_work_signal_suggestions_unmeasured
  ON public.work_signal_suggestions (week_start)
  WHERE outcome_measured_at IS NULL AND human_verdict IS NOT NULL;

-- ── 2. The measurer — service_role only (cron ride-along + regress runner) ──
-- p_subject_profile_id lets the loops-regress sim scope to its sentinel
-- subject; the cron calls it unscoped (NULL = all candidates).

CREATE OR REPLACE FUNCTION public.fn_work_signal_suggestion_measure_deltas(
  p_min_age_days integer DEFAULT 7,
  p_subject_profile_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_measured  int;
  v_today_ist date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  WITH candidates AS (
    SELECT s.id, s.subject_profile_id, s.signals_snapshot
    FROM public.work_signal_suggestions s
    WHERE s.outcome_measured_at IS NULL
      -- Adopted only (spec scope): the subject marked it tried. not_tried and
      -- unverdicted rows stay NULL = honestly unmeasured, never a fabricated 0.
      AND s.human_verdict IN ('tried_helped','tried_no_change')
      -- "Next week's signals": measure only once at least a week has passed
      -- since the suggestion week started (the weekly cadence makes the
      -- normal-path re-read land exactly one week after the snapshot).
      AND s.week_start <= v_today_ist - GREATEST(p_min_age_days, 0)
      AND (p_subject_profile_id IS NULL OR s.subject_profile_id = p_subject_profile_id)
  ),
  next_signals AS (
    SELECT c.id, c.signals_snapshot,
           sig.od_pending, sig.od_oldest_days, sig.od_decided_30d
    FROM candidates c
    CROSS JOIN LATERAL (
      -- EXACT mirror of the enqueue cron's signal definitions
      -- (app/api/cron/work-signal-suggestions/route.ts): rows fetched with
      -- (pending OR decided-in-30d); pending → count + oldest whole days;
      -- decided → non-pending with action_taken_at inside 30 days.
      SELECT
        count(*) FILTER (WHERE a.status = 'pending')::int AS od_pending,
        COALESCE(max(floor(extract(epoch FROM (now() - a.created_at)) / 86400))
                 FILTER (WHERE a.status = 'pending'), 0)::int AS od_oldest_days,
        count(*) FILTER (WHERE a.status <> 'pending'
                           AND a.action_taken_at >= now() - interval '30 days')::int AS od_decided_30d
      FROM public.leave_onduty_approvals a
      WHERE a.approver_id = c.subject_profile_id
        AND (a.status = 'pending' OR a.action_taken_at >= now() - interval '30 days')
    ) sig
  )
  UPDATE public.work_signal_suggestions s
  SET outcome_signals = jsonb_build_object(
        'od_pending',     n.od_pending,
        'od_oldest_days', n.od_oldest_days,
        'od_decided_30d', n.od_decided_30d),
      -- Delta only where the snapshot actually holds the key (the ->> of a
      -- missing key is NULL, the NULL delta is stripped): an empty snapshot
      -- never fabricates a delta against an invented 0 baseline.
      outcome_delta = jsonb_strip_nulls(jsonb_build_object(
        'od_pending',     n.od_pending     - (n.signals_snapshot ->> 'od_pending')::numeric,
        'od_oldest_days', n.od_oldest_days - (n.signals_snapshot ->> 'od_oldest_days')::numeric,
        'od_decided_30d', n.od_decided_30d - (n.signals_snapshot ->> 'od_decided_30d')::numeric)),
      outcome_measured_at = now(),
      updated_at = now()
  FROM next_signals n
  WHERE s.id = n.id;

  GET DIAGNOSTICS v_measured = ROW_COUNT;
  RETURN v_measured;
END;
$$;

-- Cron-only writer: NOT callable by any browser client. Re-asserting the full
-- lock on this CREATE OR REPLACE (anon + PUBLIC + authenticated — anon is a
-- member of PUBLIC, revoke both; authenticated has no business measuring).
REVOKE EXECUTE ON FUNCTION public.fn_work_signal_suggestion_measure_deltas(integer, uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_work_signal_suggestion_measure_deltas(integer, uuid) TO service_role;

-- ── 3. loop_registry seed — 'work-pulse' (missing until now) ────────────────
-- Identity-keyed ON CONFLICT DO NOTHING (the registry seed idiom, immune to
-- seed-resurrection). Constitution compliance (20260726012000):
--   * owner_email supplied (NOT NULL + nonempty CHECK) — Director, matching
--     every registered-not-yet-chartered row's owner.
--   * ALL FIVE charter legs (outcome_metric, baseline_window, intervention,
--     verdict_owner, remeasure_window) deliberately LEFT NULL — the RECEIPTS
--     RULE: this migration ships the measurer but it has not yet run in prod
--     data. MetaLoop drafts the charter, the owner approves, the Director
--     countersigns. This file NEVER writes legs.
--   * m gate 'off' (no counter_metric named+measured); g/a receipted by the
--     live weekly cron + verdict channel; f receipted by the cron feeding the
--     prior verdict into next week's prompt (priorVerdictLine).
-- routine_id: real dispatcher id, receipted in lib/ai-routines/platform-ops.ts
-- ("work-signal-suggestions", triggerPath /api/cron/work-signal-suggestions).

INSERT INTO public.loop_registry
  (loop_key, name, stack_tier, loop_class, domain, description, gates, routine_id, owner_email, is_active)
VALUES
  ('work-pulse', 'Work-Pulse Weekly Suggestion Loop', 3, 'cadence', 'staff',
   'Weekly AI suggestion per team member from their own od_* work-signals (worksignals.weekly_suggestion, Max lane); the subject alone marks it tried_helped / tried_no_change / not_tried (the adoption mark, 20260725140000); the verdict feeds next week''s prompt; fn_work_signal_suggestion_measure_deltas records next week''s signals minus the suggestion week''s snapshot for adopted suggestions. Never a score, never ranked, never auto-applied.',
   '{"g":"on","a":"on","m":"off","f":"on"}'::jsonb,
   'work-signal-suggestions', 'aieee@jkkn.ac.in', true)
ON CONFLICT (loop_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
