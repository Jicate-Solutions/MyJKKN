-- =============================================================================
-- AI Pulse — classmates feed moderation, PR5: LET A LEARNER REPORT A FEED PROMPT
--                                                FROM ANY COLLEGE
-- Created: 2026-07-30
-- Director decision (verbatim, 2026-07-30): "Yes — add a report button to the feed."
-- =============================================================================
-- WHY THIS MIGRATION EXISTS
-- -----------------------------------------------------------------------------
-- Director decision #3 (PR2, 20260804120000) routes a REPORTED feed prompt to a
-- human champion and — deliberately — removed the automatic hide. That decision
-- had no entry point: fn_ai_pulse_report_prompt_build is surfaced from exactly
-- ONE place in the product, the GRADUATED library card
-- (app/(routes)/ai-pulse/my-pulse/_components/shared-library-card.tsx). The
-- classmates FEED card had zero report/flag controls. So post-PR2 the feed would
-- have launched with no learner-side moderation response at all: no auto-hide and
-- no way to ask for a human one.
--
-- The companion UI change in this PR adds the report control to the feed card.
-- This migration removes the one server-side guard that would have made that
-- button throw on most feed items.
--
-- THE BLOCKER: THE CROSS-INSTITUTION REFUSAL
-- -----------------------------------------------------------------------------
-- The live function refuses any report whose target build belongs to a different
-- institution than the reporter:
--
--     IF v_build_inst IS DISTINCT FROM v_inst THEN
--       RAISE EXCEPTION 'cross_institution';
--     END IF;
--
-- That guard is correct for the graduated library, which is same-institution
-- scoped. It is WRONG for the feed. fn_ai_pulse_topic_peer_prompts matches the
-- same subject BY NAME ACROSS ALL JKKN COLLEGES (no institution scope), and every
-- learner additionally sees the shared 'global' All-JKKN shelf. So on most feed
-- items the new report button would raise 'cross_institution' — a decorative
-- control that fails exactly when it is needed.
--
-- Safeguarding needs the OPPOSITE of that guard. The platform serves school
-- learners (LKG upward). A school child who sees an inappropriate prompt written
-- by a college learner is precisely the person who must be able to report it.
--
-- => This migration removes ONLY the cross-institution refusal.
--
-- WHAT IS DELIBERATELY UNCHANGED (every other guard is carried over byte-for-byte)
-- -----------------------------------------------------------------------------
--   * authenticated only            — auth.uid() IS NULL -> RAISE (ERRCODE 42501);
--   * caller must be a LEARNER      — profiles.learner_id IS NULL -> 'not_a_learner';
--   * target build must EXIST       — 'build_not_found';
--   * self-report still REFUSED     — 'cannot_report_own_build';
--   * dedup, one report per learner per build — ON CONFLICT DO NOTHING;
--   * SECURITY DEFINER + SET search_path = public;
--   * REVOKE EXECUTE FROM anon, PUBLIC + GRANT TO authenticated (re-asserted below).
--
-- THE TRADEOFF, STATED NOT HIDDEN
-- -----------------------------------------------------------------------------
-- Dropping the institution check means a learner could in principle report a
-- build id they never saw — the function no longer proves the reporter had
-- visibility of the target. That is accepted here because:
--   1. build ids are UUIDs, so the target set is not enumerable in practice; and
--   2. post-PR2 (20260804120000) a report has NO AUTOMATIC CONSEQUENCE. It does
--      not hide the prompt, does not touch the author's score, and does not
--      notify the author. It only queues a decision for a human champion. The
--      worst case is champion-queue noise, not censorship or harm to an author.
--
-- NOTED FOLLOW-UP, NOT BUILT NOW: if the Director later wants this tighter, the
-- next step is to require the target be FEED-ELIGIBLE (safety_status = 'passed',
-- score in the 60-79 band, graduated_at IS NULL, disqualified_at IS NULL) rather
-- than to reinstate the institution check — eligibility preserves cross-college
-- safeguarding while restoring a visibility proxy. Explicitly out of scope here.
--
-- BASE = the LIVE PRODUCTION body, pulled with pg_get_functiondef(p.oid) on
-- 2026-07-30 from project kvizhngldtiuufknvehv. It is NOT rebuilt from the
-- original 20260726034212_ai_pulse_prompt_build_reports.sql — a CREATE OR REPLACE
-- assembled from a stale file has silently reverted live behaviour in this repo
-- before. The ONLY difference between the body below and the live body is the
-- removal of the cross-institution IF block (and the comment that replaces it).
--
-- WHY CREATE OR REPLACE IS SAFE HERE (unlike PR3): the signature and the RETURNS
-- type are unchanged (uuid, text -> void), so no DROP is needed and no grant is
-- discarded. The REVOKE/GRANT pair is still re-asserted because Supabase's
-- default privileges re-grant anon EXECUTE and the CI secdef gate treats a
-- CREATE OR REPLACE as a new function.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_ai_pulse_report_prompt_build(p_build_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- NO cross-institution refusal (removed 2026-07-30, Director: "add a report
  -- button to the feed"). The classmates feed matches subjects BY NAME across ALL
  -- colleges and every learner also sees the shared 'global' shelf, so the old
  -- `IF v_build_inst IS DISTINCT FROM v_inst THEN RAISE 'cross_institution'` made
  -- the feed's report control throw on most items. Safeguarding requires the
  -- opposite: a school learner MUST be able to report a college learner's prompt.
  -- v_inst / v_build_inst are still resolved above (left untouched, so this diff
  -- is exactly the guard removal) and remain available should a future decision
  -- reintroduce an institution-aware rule.

  -- Record the flag; dedup one per learner per build.
  INSERT INTO ai_pulse_prompt_build_reports (build_id, reporter_profile_id, reason)
  VALUES (p_build_id, v_uid, left(nullif(btrim(coalesce(p_reason,'')), ''), 500))
  ON CONFLICT (build_id, reporter_profile_id) DO NOTHING;
END;
$function$;

-- Re-lock. Supabase's ALTER DEFAULT PRIVILEGES re-grants anon EXECUTE on every
-- newly created/replaced function, and the anon key ships in the browser bundle.
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_report_prompt_build(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_report_prompt_build(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.fn_ai_pulse_report_prompt_build(uuid, text) IS
  'AI Pulse: a learner flags a peer prompt-build for human review. Guards: authenticated, caller must be a learner, build must exist, self-report refused, one report per learner per build. 2026-07-30 (Director: "add a report button to the feed") the cross-institution refusal was REMOVED so the cross-college classmates feed and the global shelf can be reported — safeguarding a school learner who sees a college learner''s prompt. Post-20260804120000 a report has no automatic effect; it only queues a champion decision.';
