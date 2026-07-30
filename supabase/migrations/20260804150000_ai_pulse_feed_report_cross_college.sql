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
-- That guard is WRONG for the feed. fn_ai_pulse_topic_peer_prompts matches the
-- same subject BY NAME ACROSS ALL JKKN COLLEGES (no institution scope), and every
-- learner additionally sees the shared 'global' All-JKKN shelf. So on most feed
-- items the new report button would raise 'cross_institution' — a decorative
-- control that fails exactly when it is needed.
--
-- CORRECTION (2026-07-30, from adversarial review of an earlier draft of this
-- migration): an earlier version of this header claimed the guard "is correct for
-- the graduated library, which is same-institution scoped". THAT WAS FALSE and it
-- was load-bearing, so it is called out rather than quietly edited.
-- fn_ai_pulse_topic_graduated_prompts has NO institution predicate at all — its own
-- body comment reads "Match the SAME subject by NAME across ALL colleges (no
-- institution scope)" (verified live with pg_get_functiondef). The library is just
-- as cross-college as the feed. Two consequences followed, and both are handled:
--   (a) the guard was already wrong for the library too — it refused reports on
--       prompts a learner legitimately saw; and
--   (b) far more importantly, removing it BLANKET-style reached a LIVE surface, so
--       the removal is now conditional on graduated_at (see the guard below).
--
-- Safeguarding needs the OPPOSITE of that guard. The platform serves school
-- learners (LKG upward). A school child who sees an inappropriate prompt written
-- by a college learner is precisely the person who must be able to report it.
--
-- => This migration removes the cross-institution refusal FOR NON-GRADUATED (feed)
--    BUILDS ONLY. For a graduated build the original rule stands, byte-for-byte.
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
-- Dropping the institution check for non-graduated builds means a learner could in
-- principle report a FEED-lane build id they never saw — the function no longer
-- proves the reporter had visibility of such a target. That residual risk is
-- accepted because:
--   1. build ids are UUIDs, so the target set is not enumerable in practice; and
--   2. on the FEED lane specifically, post-20260804120000 a report has no automatic
--      consequence: it does not hide the prompt, does not touch the author's score,
--      and does not notify the author. It only queues a decision for a human
--      champion. Worst case is champion-queue noise, not censorship.
--
-- ⚠️ THAT SECOND REASON IS TRUE ONLY FOR THE FEED LANE, WHICH IS WHY THE GUARD IS
-- CONDITIONAL. An earlier draft of this migration stated it unconditionally and was
-- WRONG: 20260804120000 removed auto-hide from the FEED read only. The graduated
-- LIBRARY read still hides any build with >= prompt_report_autohide_threshold
-- (live value 2) distinct uncleared reports, and the library is LIVE
-- (prompt_graduation_enabled = true) and NOT gated by the dark-feed flag. Under the
-- blanket removal, two learners from any colleges could silently un-publish another
-- college's graduated star by id — real censorship, no champion in the loop.
-- Adversarial review proved it against prod in a rolled-back txn
-- (visible_before = 1 -> visible_after = 0). The graduated_at condition on the guard
-- below is what closes it; the library keeps exactly the blast radius it has today.
--
-- NOTED FOLLOW-UPS, NOT BUILT NOW:
--   * Tighter still for the feed lane: require full FEED-ELIGIBILITY
--     (safety_status = 'passed', score in the 60-79 band, disqualified_at IS NULL)
--     to restore a visibility proxy. NOTE this must stay lane-conditional too — a
--     blanket non-graduated requirement would BREAK shared-library-card.tsx, which
--     reports graduated builds through this same rpc.
--   * The library's auto-hide is itself an "automatic consequence" that Director
--     decision #3 rejected for the feed. Whether the library should also move to
--     champion-decides is a Director call, deliberately NOT made here.
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
  v_build_graduated timestamptz;   -- NULL => a FEED candidate; NOT NULL => a LIBRARY star
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
  SELECT b.learner_id, b.institution_id, b.graduated_at
    INTO v_build_learner, v_build_inst, v_build_graduated
  FROM ai_pulse_prompt_builds b WHERE b.id = p_build_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'build_not_found';
  END IF;

  -- Refuse self-report: you cannot flag your own build.
  IF v_build_learner = v_learner THEN
    RAISE EXCEPTION 'cannot_report_own_build';
  END IF;

  -- Cross-institution reporting is allowed for FEED candidates ONLY (a build that
  -- has NOT graduated). For a GRADUATED build the original same-institution rule
  -- still applies, unchanged.
  --
  -- WHY THE ASYMMETRY (this is the whole point of this migration, do not "simplify"
  -- it away). This ONE rpc serves TWO surfaces:
  --   * the classmates FEED (fn_ai_pulse_topic_peer_prompts, non-graduated builds)
  --     — DARK, and after 20260804120000 a report there has NO automatic effect:
  --     it only queues a champion decision. Cross-college reporting is therefore
  --     safe, and it is REQUIRED, because the feed matches subjects BY NAME across
  --     ALL colleges and every learner also sees the shared 'global' shelf — so
  --     without this the new report control would raise 'cross_institution' on most
  --     items. Safeguarding needs the opposite: a school learner MUST be able to
  --     report a college learner's prompt.
  --   * the graduated LIBRARY (fn_ai_pulse_topic_graduated_prompts) — LIVE TODAY
  --     (prompt_graduation_enabled = true) and it STILL auto-hides any build with
  --     >= prompt_report_autohide_threshold (live value 2) distinct uncleared
  --     reports. No migration in this wave changes that.
  -- So dropping the institution check for GRADUATED builds would convert
  -- "2 reports from any two colleges" into a cross-college un-publish button on a
  -- live surface, with no champion in the loop and no kill switch containing it
  -- (the dark-feed flag does not gate the library). Proven, then closed by the
  -- clause below. Keeping the rule for graduated builds leaves the library's blast
  -- radius EXACTLY as it is in production today — this migration widens nothing.
  --
  -- Requiring full feed-eligibility instead (graduated_at IS NULL AND score 60-79)
  -- was rejected: shared-library-card.tsx reports graduated builds through this
  -- same rpc, so a blanket non-graduated requirement would BREAK the library's
  -- existing report control — a regression on a live surface.
  IF v_build_graduated IS NOT NULL AND v_build_inst IS DISTINCT FROM v_inst THEN
    RAISE EXCEPTION 'cross_institution';
  END IF;

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
