-- =====================================================================
-- AIU evidence trail — capture what the in-app AI produced BEFORE the
-- learner changed it
-- Migration: 2026-08-21 (applies as 20260922041500)
-- =====================================================================
-- ⚠️ FILE ONLY — NOT APPLIED. Director-gated, like every migration in
-- this repo. Until it is applied the table does not exist; the logging
-- seam in lib/services/aiu/prompt-trail-service.ts is best-effort by
-- design (every write is wrapped, failures are logged and swallowed), so
-- merging the code before applying this file degrades to a no-op — the
-- PDE coach keeps working exactly as today.
--
-- WHY
-- ---
-- The AIU element (Accountable AI Use) of JKKN Advanced Bloom's Taxonomy
-- has rubric bands — AIU-a Supervised / AIU-b Accountable / AIU-c
-- Discerning — that are UNMARKABLE today because nothing records what the
-- in-app AI produced before the learner changed anything. Verified on the
-- chosen surface (the PDE clinical-reasoning Socratic coach): the coach
-- route's clinical branch persists NOTHING about the exchange — the
-- direct-provider path writes only an ai_model_usage cost row (no text),
-- and the Max-lane path relies on the drain's own logs. The learner's
-- final answers land in pde_submissions.answers, but the AI feedback that
-- shaped them, and the answer the learner held when the AI saw it, are
-- gone the moment the HTTP response is sent.
--
-- WHAT THIS ADDS
-- --------------
--   1. Table aiu_prompt_trails — one row per AI output delivered to a
--      learner: the prompt sent, the AI output AS PRODUCED (immutable),
--      the learner's version at delivery time, and — closed later — the
--      learner's final version plus a changed-or-accepted flag.
--   2. A BEFORE UPDATE trigger that makes the capture columns immutable
--      and learner_final/changed write-once. Evidence a client can edit
--      after the fact is not evidence.
--   3. RLS: a learner inserts/updates/reads ONLY their own rows;
--      admin/super-admin read for marking. No DELETE policy and no
--      DELETE grant — a trail row is never deleted by a client.
--
-- WHAT THIS DOES NOT ADD
-- ----------------------
-- No SECURITY DEFINER RPCs — all access is plain table access under RLS
-- (session client) or service-role (server routes, the same trust
-- boundary the OSCE score write already uses). No UI. No backfill:
-- exchanges before the seam went live cannot be reconstructed, and a
-- manufactured row is not evidence.
--
-- ID SEMANTICS (stated because this repo has been burned by it):
-- learner_id here is profiles.id (auth.users.id) — the SAME id space the
-- whole PDE clinical loop uses (pde_submissions.learner_id = auth.uid()
-- in its RLS policies; pde_coach_conversations.learner_id REFERENCES
-- profiles(id)). It is NOT learners_profiles.id.
--
-- No BEGIN/COMMIT in this file on purpose, so a reviewer's
-- BEGIN .. ROLLBACK rehearsal against production actually rolls back.
-- =====================================================================

-- ── 1. table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.aiu_prompt_trails (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- profiles.id (auth.users.id) of the acting learner — NOT learners_profiles.id.
  learner_id     uuid NOT NULL REFERENCES public.profiles(id),
  institution_id uuid,
  -- Which in-app AI surface produced the output, e.g.
  -- 'pde.clinical_reasoning.coach'. Mirrors ai_model_usage.feature_key naming.
  surface        text NOT NULL,
  -- The exact prompt sent to the model. May embed ground_truth (the answer
  -- key) — RLS lets the learner read their own rows, but the SEAM must never
  -- echo this back into an HTTP response (the coach route strips it).
  prompt_sent    text NOT NULL,
  -- The AI output exactly as produced. Immutable (trigger-enforced).
  ai_output      text NOT NULL,
  -- The learner's version of their work at the moment the AI saw it
  -- (for the PDE coach: the answer sent for feedback). Immutable.
  learner_input  text,
  -- The learner's final/corrected version, closed at submission time.
  -- Write-once (trigger-enforced).
  learner_final  text,
  -- changed-or-accepted: true = the learner revised their work after the AI
  -- engagement; false = kept it unchanged; NULL = final not yet recorded.
  changed        boolean,
  -- Context refs — for the PDE coach: assessment_id, question_id, and (once
  -- closed) submission_id. Kept jsonb so other surfaces can carry their own
  -- refs (course/lesson/cycle) without DDL.
  context        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aiu_prompt_trails_surface_chk CHECK (length(trim(surface)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_aiu_trails_learner_created
  ON public.aiu_prompt_trails (learner_id, created_at DESC);

-- The finalize seam's lookup: this learner's still-open trails on a surface.
CREATE INDEX IF NOT EXISTS idx_aiu_trails_open
  ON public.aiu_prompt_trails (learner_id, surface)
  WHERE learner_final IS NULL;

-- ── 2. immutability guard (plain trigger fn — NOT SECURITY DEFINER) ─────────
-- Runs as the invoker and touches only NEW/OLD, so it needs no elevated
-- rights. The capture columns are frozen at insert; learner_final/changed are
-- write-once so a closed trail cannot be re-written into a nicer story.

CREATE OR REPLACE FUNCTION public.tg_aiu_prompt_trails_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.prompt_sent   IS DISTINCT FROM OLD.prompt_sent
     OR NEW.ai_output     IS DISTINCT FROM OLD.ai_output
     OR NEW.learner_input IS DISTINCT FROM OLD.learner_input
     OR NEW.learner_id    IS DISTINCT FROM OLD.learner_id
     OR NEW.surface       IS DISTINCT FROM OLD.surface
     OR NEW.created_at    IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'aiu_prompt_trails: capture columns are immutable (prompt_sent, ai_output, learner_input, learner_id, surface, created_at)'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.learner_final IS NOT NULL
     AND NEW.learner_final IS DISTINCT FROM OLD.learner_final THEN
    RAISE EXCEPTION 'aiu_prompt_trails: learner_final is write-once'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.changed IS NOT NULL
     AND NEW.changed IS DISTINCT FROM OLD.changed THEN
    RAISE EXCEPTION 'aiu_prompt_trails: changed is write-once'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Not SECURITY DEFINER, and RETURNS trigger cannot be called directly — the
-- revoke is defence in depth per CLAUDE.md, matching
-- 20260818020000_admission_lead_source_audit.sql.
REVOKE EXECUTE ON FUNCTION public.tg_aiu_prompt_trails_guard() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_aiu_prompt_trails_guard ON public.aiu_prompt_trails;
CREATE TRIGGER trg_aiu_prompt_trails_guard
  BEFORE UPDATE ON public.aiu_prompt_trails
  FOR EACH ROW EXECUTE FUNCTION public.tg_aiu_prompt_trails_guard();

-- ── 3. RLS + grants ──────────────────────────────────────────────────────────
-- Grants first, and REVOKE from anon AND PUBLIC AND authenticated before the
-- explicit re-grant: anon is a member of PUBLIC (revoking anon alone leaves
-- PUBLIC granting it — measured on this project, 2026-08-18), and Supabase's
-- default grant gives authenticated DELETE, which an evidence table must not
-- carry. service_role is untouched (server routes go through it).

REVOKE ALL ON TABLE public.aiu_prompt_trails FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.aiu_prompt_trails TO authenticated;

ALTER TABLE public.aiu_prompt_trails ENABLE ROW LEVEL SECURITY;

-- Learner reads their own trail; admin/super-admin read for AIU marking.
DROP POLICY IF EXISTS aiu_trails_select ON public.aiu_prompt_trails;
CREATE POLICY aiu_trails_select ON public.aiu_prompt_trails
  FOR SELECT TO authenticated
  USING (
    learner_id = (SELECT auth.uid())
    OR is_super_admin()
    OR is_admin()
  );

-- INSERT is scoped to the acting user's own row — a learner cannot write a
-- trail in someone else's name.
DROP POLICY IF EXISTS aiu_trails_insert_own ON public.aiu_prompt_trails;
CREATE POLICY aiu_trails_insert_own ON public.aiu_prompt_trails
  FOR INSERT TO authenticated
  WITH CHECK (learner_id = (SELECT auth.uid()));

-- UPDATE own rows only; the trigger above is what keeps the capture columns
-- honest — the learner may only ever close learner_final/changed once.
DROP POLICY IF EXISTS aiu_trails_update_own ON public.aiu_prompt_trails;
CREATE POLICY aiu_trails_update_own ON public.aiu_prompt_trails
  FOR UPDATE TO authenticated
  USING (learner_id = (SELECT auth.uid()))
  WITH CHECK (learner_id = (SELECT auth.uid()));

-- Deliberately NO DELETE policy and NO DELETE grant.
