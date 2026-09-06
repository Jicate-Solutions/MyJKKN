-- Migration: 20260726034212_ai_pulse_prompt_build_reports.sql
-- Created: 2026-07-26 — AI Pulse: learner "report this prompt" for graduated peer builds (DARK substrate).
--
-- Context / why this exists
-- -------------------------
-- The AI Pulse leaderboard (20260724120000) shipped the CHAMPION half of build
-- moderation: fn_ai_pulse_disqualify_prompt_build (permission-gated to
-- is_super_admin() OR aiPulse:lab.score). Its own header NOTE says the missing
-- LEARNER half — a "report this build" button — should reuse the domain-starter
-- report pattern (fn_ai_pulse_domain_starter_report), NOT call disqualify: a
-- learner FLAGS, a champion ENFORCES. This migration adds that learner flag.
--
-- Design mirrors ai_pulse_domain_starter_events + fn_ai_pulse_domain_starter_report:
--   * base table is LOCKED (RLS enabled, no policies => deny-all-direct);
--   * the only write path is the SECURITY DEFINER RPC below, self-scoped from
--     auth.uid(); anon-locked per the standing REVOKE-from-anon rule.
--
-- DARK: this ships inert. The learner surface that lists graduated peer builds
-- reads fn_ai_pulse_topic_graduated_prompts, which returns zero rows until
-- prompt graduation is switched on — so no report can be filed today and the
-- my-pulse UI is byte-identical to now.

-- ── 1) reports table (locked; one report per learner per build) ─────────────
CREATE TABLE IF NOT EXISTS public.ai_pulse_prompt_build_reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id            uuid NOT NULL REFERENCES public.ai_pulse_prompt_builds(id) ON DELETE CASCADE,
  reporter_profile_id uuid NOT NULL,                 -- profiles.id == auth.uid()
  reason              text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (build_id, reporter_profile_id)             -- dedup: one report per learner per build
);

ALTER TABLE public.ai_pulse_prompt_build_reports ENABLE ROW LEVEL SECURITY;
-- Deny-all direct: NO policies. Writes go through fn_ai_pulse_report_prompt_build
-- (DEFINER, self-scoped); champion/admin review reads the base table directly
-- as super admin (is_super_admin bypasses RLS via their own privileges) or via a
-- future review RPC. Mirrors the ai_pulse_domain_starter_events lock exactly.

CREATE INDEX IF NOT EXISTS idx_ai_pulse_prompt_build_reports_build
  ON public.ai_pulse_prompt_build_reports (build_id);

-- ── 2) learner report RPC (safety valve) ────────────────────────────────────
-- Near-exact clone of fn_ai_pulse_domain_starter_report, plus the two guards the
-- build entity needs that a domain-starter (institution-scoped, authorless) did
-- not: refuse reporting your OWN build, and refuse cross-institution reports
-- (multi-tenant safety — the read RPC is already same-institution scoped, this
-- is defence-in-depth).
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_report_prompt_build(
    p_build_id uuid,
    p_reason   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid           uuid := auth.uid();
  v_learner       uuid;
  v_inst          uuid;
  v_build_learner uuid;
  v_build_inst    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Caller identity: must be a learner (has a learner_id).
  SELECT p.learner_id, p.institution_id INTO v_learner, v_inst
  FROM profiles p WHERE p.id = v_uid;
  IF v_learner IS NULL THEN
    RAISE EXCEPTION 'not_a_learner';
  END IF;

  -- Target build: must exist.
  SELECT b.learner_id, b.institution_id INTO v_build_learner, v_build_inst
  FROM ai_pulse_prompt_builds b WHERE b.id = p_build_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'build_not_found';
  END IF;

  -- Refuse self-report: you cannot flag your own build.
  IF v_build_learner = v_learner THEN
    RAISE EXCEPTION 'cannot_report_own_build';
  END IF;

  -- Refuse cross-institution: only report builds from your own institution.
  IF v_build_inst IS DISTINCT FROM v_inst THEN
    RAISE EXCEPTION 'cross_institution';
  END IF;

  -- Record the flag; dedup one per learner per build.
  INSERT INTO ai_pulse_prompt_build_reports (build_id, reporter_profile_id, reason)
  VALUES (p_build_id, v_uid, left(nullif(btrim(coalesce(p_reason,'')), ''), 500))
  ON CONFLICT (build_id, reporter_profile_id) DO NOTHING;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_report_prompt_build(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_report_prompt_build(uuid, text) TO authenticated;
