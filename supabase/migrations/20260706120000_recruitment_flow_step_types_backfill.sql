-- =====================================================================================
-- Dynamic recruitment approval flows (2026-07-06), part 1: step_type backfill.
-- Stamps step_type onto every existing recruitment_approval flow step template:
-- last step = 'final' (grants final approval), earlier steps = 'review'
-- (notes + mark-as-reviewed only). Steps that already carry step_type are
-- left untouched. Frozen candidate chains are NOT rewritten — the runtime
-- treats an absent step_type as "last step acts as final" for back-compat.
-- =====================================================================================

UPDATE hr_approval_flows
SET steps = (
  SELECT jsonb_agg(
    CASE
      WHEN NOT (t.elem ? 'step_type') THEN
        t.elem || jsonb_build_object(
          'step_type',
          CASE WHEN t.ord = jsonb_array_length(hr_approval_flows.steps)
               THEN 'final' ELSE 'review' END
        )
      ELSE t.elem
    END
    ORDER BY t.ord
  )
  FROM jsonb_array_elements(hr_approval_flows.steps) WITH ORDINALITY AS t(elem, ord)
)
WHERE flow_for = 'recruitment_approval'
  AND jsonb_array_length(COALESCE(steps, '[]'::jsonb)) > 0;
