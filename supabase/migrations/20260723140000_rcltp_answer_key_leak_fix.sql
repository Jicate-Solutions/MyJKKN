-- ============================================================================
-- RCLTP Part-B — close the answer-key leak (P0 security)
-- 2026-07-23
-- ----------------------------------------------------------------------------
-- LEAK: the learner "take the assessment" flow reads rcltp_part_b_questions with
-- the browser (session-scoped) client via `select('*')`, and the old
-- `rcltp_pbq_read` RLS policy let ANY authenticated learner in the same
-- institution (or on a global institution_id IS NULL row) read the row. RLS is
-- ROW-level, not column-level, so a readable row exposed `correct_answer` (the
-- answer key) AND `ai_meta` on the wire — visible in the learner's network tab
-- even though the UI hides it. Same class as the PDE case answer-key leak.
--
-- FIX (PDE pattern — lock the base table, re-serve safe columns via a SECDEF RPC):
--   1. Tighten `rcltp_pbq_read` so ONLY authoring/reviewing staff (or admins) can
--      read the base table directly — a learner who holds only 'rcltp.assessment.take'
--      no longer satisfies it, so the base-table key can't be read even by a
--      hand-crafted query.
--   2. Add `fn_rcltp_questions_for_take(passage_id)` — SECURITY DEFINER — that
--      returns ONLY the columns a learner needs to answer (id, passage_id,
--      question_text, question_type, options, max_score, order_index) and OMITS
--      correct_answer + ai_meta. Gated on 'rcltp.assessment.take' + institution
--      access. The take flow calls this instead of a base-table select.
--
-- INVARIANT: `options` must never carry a correctness flag — the key lives only in
-- `correct_answer`. AI generation writes `options` as a plain choice-text array, so
-- returning it as-is is safe. If structured options are ever added, sanitize here.
-- ============================================================================

BEGIN;

-- 1. Lock the base-table read to authoring/reviewing staff + admins only.
DROP POLICY IF EXISTS rcltp_pbq_read ON public.rcltp_part_b_questions;
CREATE POLICY rcltp_pbq_read ON public.rcltp_part_b_questions
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (
      (
        user_has_permission('rcltp.config.manage')
        OR user_has_permission('rcltp.question.approve')
        OR user_has_permission('rcltp.assessment.manage')
      )
      AND (institution_id IS NULL OR role_has_institution_access(institution_id))
    )
  );

-- 2. Learner-safe read RPC — approved, active questions WITHOUT the answer key.
CREATE OR REPLACE FUNCTION public.fn_rcltp_questions_for_take(p_passage_id uuid)
RETURNS TABLE (
  id uuid,
  passage_id uuid,
  question_text text,
  question_type text,
  options jsonb,
  max_score numeric,
  order_index integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.passage_id, q.question_text, q.question_type,
         q.options, q.max_score, q.order_index
  FROM public.rcltp_part_b_questions q
  WHERE q.passage_id = p_passage_id
    AND q.status = 'approved'
    AND q.is_active = true
    AND public.user_has_permission('rcltp.assessment.take')
    AND (q.institution_id IS NULL OR public.role_has_institution_access(q.institution_id))
  ORDER BY q.order_index ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_rcltp_questions_for_take(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_rcltp_questions_for_take(uuid) TO authenticated;

COMMIT;
