-- Allied Health: 9 inactive departments could not be deleted.
-- Blockers (FK NO ACTION / RESTRICT), 1 row each per department:
--   resources.department_id            -> unused rooms/assets (0 reservations); detach, keep the resource
--   sh_solution_departments.department_id -> dormant Solution Hub links (no revenue/activity); remove
-- Scoped to inactive departments of JKKN College of Allied Health Sciences only.

UPDATE public.resources r
SET department_id = NULL
WHERE r.department_id IN (
  SELECT d.id FROM public.departments d
  JOIN public.institutions i ON i.id = d.institution_id
  WHERE i.name ILIKE '%allied health%' AND d.is_active = false
);

DELETE FROM public.sh_solution_departments sd
WHERE sd.status = 'dormant'
  AND sd.last_revenue_at IS NULL
  AND sd.department_id IN (
    SELECT d.id FROM public.departments d
    JOIN public.institutions i ON i.id = d.institution_id
    WHERE i.name ILIKE '%allied health%' AND d.is_active = false
  );
