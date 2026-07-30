-- Migration: 20260731050000_fp_item_flag_threshold
-- Date: 2026-07-31
--
-- WHAT: a single report no longer suppresses a question. Suppression now needs
-- N DISTINCT people to have an open report on the same item, where N is a
-- config row (default 2), not a hard-coded constant.
--
-- WHY (Director, 2026-07-31): asked whether one tap should hide a question from
-- every learner in every institution instantly, the answer was "need two
-- different people to report it". One careless or mistaken tap should not remove
-- a good question from everyone.
--
-- WHY A CONFIG ROW RATHER THAN THE LITERAL 2 — this repo's standing rule is
-- "every policy decision = a config row" (docs/architecture/config-table-pattern.md),
-- and this one has a live tension that makes the rule pay for itself:
--   The roles that can currently reach the report control are super_admin(13),
--   system_admin(7), administrator(2), school_faculty(1) — mirroring the
--   Director's own RCLTP grant, which deliberately EXCLUDED the 483-user
--   `faculty` role. Exactly ONE of those is a school facilitator, and there is
--   as yet no learner-facing surface on which a learner could report anything.
--   So a threshold of 2 may be unreachable in practice until the answering
--   screen exists. Shipping it as config means that is a one-row UPDATE to
--   discover and correct, not a migration and a deploy.
--
-- Threshold semantics: count(DISTINCT flagged_by) >= N over OPEN reports only.
-- NULL flagged_by does not count toward "distinct people" (count ignores NULLs),
-- which is correct — an unattributed report is not a second witness. The API
-- always sets flagged_by server-side from the session, and the table's UNIQUE
-- (item_id, flagged_by) partial index on open rows already stops one person
-- reporting the same item twice, so DISTINCT is doing real work here.
--
-- Replaces the body shipped in 20260731040000. Every security property of that
-- version is preserved verbatim: SECURITY DEFINER, SET search_path, the NULL
-- guard, the fn_fp_can_view_student check with its 42501, the ON CONFLICT
-- upsert, and the DELETE companion that clears a topic emptied by suppression.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The policy row
-- ---------------------------------------------------------------------------
INSERT INTO platform_policies
      (policy_key, value, data_type, scope_type, description,
       is_system, is_active, classification, publication_state)
SELECT 'foundation.item_flag.suppress_threshold',
       '2'::jsonb,
       'number',
       'global',
       'How many DISTINCT people must have an open report on the same Foundation practice question before it stops counting toward mastery scores. 1 = a single report suppresses it. Director decision 2026-07-31: 2.',
       false,
       true,
       'major',
       'published'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_policies
   WHERE policy_key = 'foundation.item_flag.suppress_threshold'
);

-- ---------------------------------------------------------------------------
-- 2. The recompute, threshold-aware
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_fp_recompute_weakness(
  p_student_id         uuid,
  p_exam_definition_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold int;
BEGIN
  IF p_student_id IS NULL OR p_exam_definition_id IS NULL THEN
    RAISE EXCEPTION 'fn_fp_recompute_weakness: student_id and exam_definition_id are required';
  END IF;

  -- Authorization: caller must at least be able to view this learner's data.
  IF NOT fn_fp_can_view_student(p_student_id) THEN
    RAISE EXCEPTION 'fn_fp_recompute_weakness: not authorized for student %', p_student_id
      USING ERRCODE = '42501';
  END IF;

  -- Read once, not per row. Floor at 1: a threshold of 0 would suppress every
  -- question that has ever been looked at, which is never what anyone means.
  v_threshold := greatest(
    1,
    coalesce(fn_get_policy_int('foundation.item_flag.suppress_threshold', 2, NULL), 2)
  );

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
     -- A question reported by ENOUGH DISTINCT people is under review and must
     -- not shape anyone's mastery while it is. Resolving the reports
     -- (dismissed/fixed) drops the open count and restores it on the next
     -- recompute; no response data is ever deleted.
     AND NOT EXISTS (
       SELECT 1 FROM fp_item_flags f
        WHERE f.item_id = i.id
          AND f.status  = 'open'
       HAVING count(DISTINCT f.flagged_by) >= v_threshold
     )
   GROUP BY i.topic_id
  ON CONFLICT (student_id, exam_definition_id, topic_id)
  DO UPDATE SET mastery_score  = EXCLUDED.mastery_score,
                attempts_count = EXCLUDED.attempts_count,
                updated_at     = now();

  -- A topic whose every response is now suppressed produces NO row above — the
  -- aggregate carries GROUP BY, and GROUP BY over an empty set yields zero rows,
  -- not one NULL row. So ON CONFLICT never fires and a cached score would
  -- survive intact and stale. Remove those rows: absence means "no evidence".
  --
  -- Deletion rather than a NULL row is deliberate: fn_fp_generate_revision_plan
  -- orders by `mastery_score NULLS FIRST`, so a NULL would rank the topic as the
  -- learner's WEAKEST — the opposite of what suppression means.
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
            HAVING count(DISTINCT f.flagged_by) >= v_threshold
          )
     );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_fp_recompute_weakness(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_fp_recompute_weakness(uuid, uuid) TO authenticated;

COMMIT;
