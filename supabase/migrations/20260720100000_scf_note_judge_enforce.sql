-- Migration: 20260720100000_scf_note_judge_enforce.sql
-- Purpose: Turn the (now grounded) SCF note-safety judge from SHADOW into an
--   ENFORCING auto-publisher, so learner notes no longer need manual approval.
--   Director decision 2026-07-20: the self-improving loop is the quality mechanism,
--   NOT a manual gate (mirrors the AI-Pulse auto-publish decision). Chosen posture:
--   "auto-publish + spot-check safety net".
--
-- Behavior (applied ONCE per note, at verdict time, and ONLY when the kill-switch
-- policy 'scf.note_judge.enforce' = "on"):
--   • auto_safe            -> publish (draft -> approved), mark judgement.auto_approved
--   • needs_human/likely_unsafe -> HOLD: ensure not live (approved -> draft), back to
--                            the human review queue. NEVER auto-reject/delete
--                            (suppressing help from a struggling learner is forbidden).
--   • crisis flag          -> ALWAYS human: never publish; pull back if live.
-- A human's later approve of a held note is final — the judge acts once per note
-- (the awaiting RPC excludes judged notes), so there is no pull/approve fight loop.
--
-- SHIP-SAFE: the policy is seeded OFF. Nothing changes until (1) the enforcing cron
-- code deploys AND (2) the flag is flipped on + verified. Fully reversible: flip the
-- flag off and the judge is shadow-only again.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Kill-switch policy (global scope), seeded OFF.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.platform_policies (policy_key, value, scope_type, scope_id, data_type, is_active)
VALUES ('scf.note_judge.enforce', '"off"'::jsonb, 'global', NULL, 'string', true)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Enforce RPC — applies a verdict to note status. service_role-ONLY (called by
--    the cron; mutates private learner-facing status, so authenticated = leak).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_scf_note_apply_verdict(
  p_note_id uuid,
  p_verdict text,
  p_has_crisis boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enforce boolean;
  v_status  text;
BEGIN
  -- Kill-switch: no status writes unless enforcement is explicitly on.
  v_enforce := COALESCE(fn_get_policy('scf.note_judge.enforce', NULL) = '"on"'::jsonb, false);
  IF NOT v_enforce THEN RETURN 'shadow'; END IF;

  SELECT status INTO v_status FROM public.scf_learner_notes WHERE id = p_note_id;
  IF v_status IS NULL THEN RETURN 'not_found'; END IF;

  -- CRISIS: never live, always human. Pull back if it was published. Never auto-publish.
  IF p_has_crisis THEN
    IF v_status = 'approved' THEN
      UPDATE public.scf_learner_notes
        SET status='draft', approved_at=NULL, approved_by=NULL, updated_at=now()
        WHERE id = p_note_id;
    END IF;
    RETURN 'held_crisis';
  END IF;

  IF p_verdict = 'auto_safe' THEN
    IF v_status = 'draft' THEN
      UPDATE public.scf_learner_notes
        SET status='approved', approved_at=now(), updated_at=now()
        WHERE id = p_note_id;                       -- approved_by stays NULL = loop-published
      UPDATE public.scf_note_judgements SET auto_approved=true WHERE note_id = p_note_id;
      RETURN 'published';
    END IF;
    RETURN 'already_live';
  ELSIF p_verdict IN ('needs_human','likely_unsafe') THEN
    -- NEVER auto-reject/delete. Only ensure it is not live -> human queue (draft).
    IF v_status = 'approved' THEN
      UPDATE public.scf_learner_notes
        SET status='draft', approved_at=NULL, approved_by=NULL, updated_at=now()
        WHERE id = p_note_id;
      RETURN 'pulled';
    END IF;
    RETURN 'held';
  END IF;

  RETURN 'noop';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_note_apply_verdict(uuid, text, boolean) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_note_apply_verdict(uuid, text, boolean) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Spot-check RPC — a random sample of loop-auto-published notes, for the human
--    safety net (glance, not a gate). Admin-facing: is_super_admin()-gated.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_scf_auto_published_spotcheck(p_limit int DEFAULT 10)
RETURNS TABLE(note_id uuid, note text, course_code text, course_name text, confidence numeric, published_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
    SELECT n.id, n.note, n.course_code, n.course_name, j.confidence, n.approved_at
    FROM public.scf_learner_notes n
    JOIN public.scf_note_judgements j ON j.note_id = n.id
    WHERE n.status = 'approved' AND j.auto_approved = true
    ORDER BY random()
    LIMIT GREATEST(1, LEAST(50, p_limit));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_auto_published_spotcheck(int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_auto_published_spotcheck(int) TO authenticated;  -- is_super_admin() gate inside
