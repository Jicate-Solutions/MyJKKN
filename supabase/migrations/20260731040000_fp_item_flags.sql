-- Migration: Foundation Programme — "report a problem with this question" control
-- Date: 2026-07-31
-- ADDITIVE. One new table (fp_item_flags) + one CREATE OR REPLACE of an existing RPC.
--
-- WHY THIS EXISTS
--   116 AI-authored practice questions go live having been sampled, not fully read:
--   a Senior Learner reads a random 15 before go-live, because reading all 116 is
--   ~2 hours of an adult's day and the standing policy moves that desk work off
--   them. A sample cannot catch a bad question among the ~101 nobody read. This is
--   the safety net for that gap, and for every batch after it: anyone who meets a
--   bad question raises a flag in one tap, and a flagged question stops counting
--   toward mastery from that moment on.
--
-- Reversible:
--   DROP TABLE public.fp_item_flags;
--   -- then re-apply 20260706071000_fp_rpcs.sql section 2 to restore the prior
--   -- fn_fp_recompute_weakness body (it is CREATE OR REPLACE and idempotent).
--
-- Reuses existing helpers (do NOT recreate):
--   public._touch_updated_at(), public.is_super_admin(),
--   public.user_has_permission(text), public.fn_fp_can_view_student(uuid).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. fp_item_flags — one row per raised concern about one question
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fp_item_flags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES public.fp_items(id) ON DELETE CASCADE,
  flagged_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason      text,
  status      text NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'dismissed', 'fixed')),
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fp_item_flags IS
  'Raised concerns about Foundation question-bank items. status=open suppresses the item from mastery scoring (see fn_fp_recompute_weakness); dismissed/fixed restore it. Added 2026-07-31.';
COMMENT ON COLUMN public.fp_item_flags.status IS
  'open = suppressing the item from mastery. dismissed = reviewed, question is fine. fixed = question was corrected. Only open suppresses.';

CREATE INDEX IF NOT EXISTS idx_fp_item_flags_item   ON public.fp_item_flags (item_id);
CREATE INDEX IF NOT EXISTS idx_fp_item_flags_status ON public.fp_item_flags (status);

-- One open flag per person per question. A one-tap control with no dedupe turns
-- the review queue into a duplicate pile, which is the failure mode this control
-- exists to prevent. Re-raising after a dismissal is still allowed (the partial
-- predicate only covers 'open').
CREATE UNIQUE INDEX IF NOT EXISTS uq_fp_item_flags_open_per_reporter
  ON public.fp_item_flags (item_id, flagged_by)
  WHERE status = 'open' AND flagged_by IS NOT NULL;

DROP TRIGGER IF EXISTS trg_fp_item_flags_touch ON public.fp_item_flags;
CREATE TRIGGER trg_fp_item_flags_touch
  BEFORE UPDATE ON public.fp_item_flags
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. RLS — anyone signed in may raise a flag; only question managers resolve
-- ---------------------------------------------------------------------------
-- Supabase's default privileges GRANT ALL on every new public table to anon,
-- which ships inside every page bundle. Revoke before anything else.
REVOKE ALL ON TABLE public.fp_item_flags FROM anon, PUBLIC;
-- DELETE is granted at the table so the super-admin-only DELETE policy below can
-- actually fire. Without it that policy is unreachable and "only a super admin
-- may delete" would quietly mean "nobody may, ever" — a rule that reads as a
-- capability but is really a dead statement.
GRANT  SELECT, INSERT, UPDATE, DELETE ON TABLE public.fp_item_flags TO authenticated;

ALTER TABLE public.fp_item_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fp_item_flags_read    ON public.fp_item_flags;
DROP POLICY IF EXISTS fp_item_flags_raise   ON public.fp_item_flags;
DROP POLICY IF EXISTS fp_item_flags_resolve ON public.fp_item_flags;
DROP POLICY IF EXISTS fp_item_flags_delete  ON public.fp_item_flags;

-- READ: reviewers see every flag; everyone else sees only the ones they raised.
CREATE POLICY fp_item_flags_read ON public.fp_item_flags
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_has_permission('foundation.items.view')
    OR public.user_has_permission('foundation.items.manage')
    OR flagged_by = auth.uid()
  );

-- RAISE: any signed-in person, but only ever in their own name, and only 'open'.
-- Binding flagged_by to auth.uid() is what stops a flag being attributed to
-- someone else; pinning status stops a self-inserted pre-resolved row.
CREATE POLICY fp_item_flags_raise ON public.fp_item_flags
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND flagged_by = auth.uid()
    AND status = 'open'
    AND resolved_by IS NULL
    AND resolved_at IS NULL
  );

-- RESOLVE: dismiss or mark fixed. Deliberately NOT available to the person who
-- raised it — a flag anyone can close is not a review. Gated on a permission
-- key, never a role name.
CREATE POLICY fp_item_flags_resolve ON public.fp_item_flags
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_has_permission('foundation.items.manage')
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.user_has_permission('foundation.items.manage')
  );

-- DELETE: super admin only, as an escape hatch for junk rows. Closing a report
-- is a status change, never an erasure — the row is the record that somebody
-- looked at the question.
CREATE POLICY fp_item_flags_delete ON public.fp_item_flags
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 3. fn_fp_recompute_weakness — flagged questions stop counting
-- ---------------------------------------------------------------------------
-- Reproduces the body applied by 20260706071000_fp_rpcs.sql verbatim, with ONE
-- addition: the NOT EXISTS predicate below. Signature, NULL guard, the
-- fn_fp_can_view_student authorization check, SECURITY DEFINER and
-- SET search_path are unchanged — dropping any of them here would be a silent
-- security regression, not a refactor.
CREATE OR REPLACE FUNCTION public.fn_fp_recompute_weakness(
  p_student_id        uuid,
  p_exam_definition_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_student_id IS NULL OR p_exam_definition_id IS NULL THEN
    RAISE EXCEPTION 'fn_fp_recompute_weakness: student_id and exam_definition_id are required';
  END IF;

  -- Authorization: caller must at least be able to view this learner's data.
  IF NOT fn_fp_can_view_student(p_student_id) THEN
    RAISE EXCEPTION 'fn_fp_recompute_weakness: not authorized for student %', p_student_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO fp_student_weakness AS w
        (student_id, exam_definition_id, topic_id, mastery_score, attempts_count)
  SELECT p_student_id,
         p_exam_definition_id,
         i.topic_id,
         avg((r.is_correct IS TRUE)::int)::numeric AS mastery_score,
         count(*)                                  AS attempts_count
    FROM fp_responses r
    JOIN fp_attempts  a ON a.id = r.attempt_id
    JOIN fp_items     i ON i.id = r.item_id
   WHERE a.student_id         = p_student_id
     AND i.exam_definition_id = p_exam_definition_id
     AND i.topic_id IS NOT NULL
     -- A question with an open flag is under review and must not shape anyone's
     -- mastery while it is. Resolving the flag (dismissed/fixed) restores it on
     -- the next recompute; no data is deleted either way.
     AND NOT EXISTS (
       SELECT 1 FROM fp_item_flags f
        WHERE f.item_id = i.id
          AND f.status  = 'open'
     )
   GROUP BY i.topic_id
  ON CONFLICT (student_id, exam_definition_id, topic_id)
  DO UPDATE SET mastery_score  = EXCLUDED.mastery_score,
                attempts_count = EXCLUDED.attempts_count,
                updated_at     = now();

  -- A topic whose every response is now suppressed produces NO row above, so
  -- ON CONFLICT never fires and any previously cached score survives intact and
  -- stale. The learner would keep being ranked on the strength of questions the
  -- institution has already admitted may be wrong. Remove those rows instead —
  -- absence means "no evidence", which is the truth.
  --
  -- Deletion, not a NULL row: fn_fp_generate_revision_plan orders by
  -- `mastery_score NULLS FIRST`, so leaving a NULL behind would rank the topic
  -- as the learner's WEAKEST — the exact opposite of what suppression means.
  DELETE FROM fp_student_weakness w
   WHERE w.student_id         = p_student_id
     AND w.exam_definition_id = p_exam_definition_id
     AND NOT EXISTS (
       SELECT 1
         FROM fp_responses r
         JOIN fp_attempts  a ON a.id = r.attempt_id
         JOIN fp_items     i ON i.id = r.item_id
        WHERE a.student_id         = p_student_id
          AND i.exam_definition_id = p_exam_definition_id
          AND i.topic_id           = w.topic_id
          AND NOT EXISTS (
            SELECT 1 FROM fp_item_flags f
             WHERE f.item_id = i.id
               AND f.status  = 'open'
          )
     );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_fp_recompute_weakness(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_fp_recompute_weakness(uuid, uuid) TO authenticated;

COMMIT;
