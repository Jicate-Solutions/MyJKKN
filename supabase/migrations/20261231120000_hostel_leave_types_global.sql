-- Hostel leave types become ONE common list for every institution.
--
-- Before: institution_id NOT NULL + UNIQUE (institution_id, leave_type_code).
-- The 16 seeded types were copied into each of the 11 institutions (176 rows),
-- every copy identical. A new type had to be created once per institution.
--
-- After: one row per leave_type_code, no institution_id. The survivor for each
-- code is its oldest row; every FK (gate passes, leave requests, per-college
-- config) is repointed to it before the duplicates are deleted.
--
-- RLS keeps the same permission keys and the same holders; only the
-- role_has_institution_access(institution_id) term is gone, since a common row
-- belongs to no institution.

CREATE TEMP TABLE _hlt_map AS
WITH ranked AS (
  SELECT id, leave_type_code,
         first_value(id) OVER (PARTITION BY leave_type_code ORDER BY created_at, id) AS keep_id
  FROM public.hostel_leave_types
)
SELECT id AS old_id, keep_id FROM ranked WHERE id <> keep_id;

UPDATE public.hostel_gate_passes g SET leave_type_id = m.keep_id
FROM _hlt_map m WHERE g.leave_type_id = m.old_id;

UPDATE public.hostel_leave_requests r SET leave_type_id = m.keep_id
FROM _hlt_map m WHERE r.leave_type_id = m.old_id;

UPDATE public.hostel_leave_type_config c SET leave_type_id = m.keep_id
FROM _hlt_map m WHERE c.leave_type_id = m.old_id;

DELETE FROM public.hostel_leave_types t USING _hlt_map m WHERE t.id = m.old_id;
DROP TABLE _hlt_map;

-- Policies reference institution_id, so they go before the column.
DROP POLICY IF EXISTS hostel_leave_types_select_permission ON public.hostel_leave_types;
DROP POLICY IF EXISTS hostel_leave_types_insert_permission ON public.hostel_leave_types;
DROP POLICY IF EXISTS hostel_leave_types_update_permission ON public.hostel_leave_types;
DROP POLICY IF EXISTS hostel_leave_types_delete_permission ON public.hostel_leave_types;

ALTER TABLE public.hostel_leave_types
  DROP CONSTRAINT IF EXISTS uq_hostel_leave_type_code_per_institution;
DROP INDEX IF EXISTS public.hostel_leave_types_institution_idx;
ALTER TABLE public.hostel_leave_types DROP COLUMN institution_id;

ALTER TABLE public.hostel_leave_types
  ADD CONSTRAINT uq_hostel_leave_type_code UNIQUE (leave_type_code);

ALTER TABLE public.hostel_leave_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY hostel_leave_types_select_permission ON public.hostel_leave_types
  FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT user_has_permission('campus_living.leave_types.view'))
  );

CREATE POLICY hostel_leave_types_insert_permission ON public.hostel_leave_types
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT user_has_permission('campus_living.leave_types.create'))
  );

CREATE POLICY hostel_leave_types_update_permission ON public.hostel_leave_types
  FOR UPDATE TO authenticated
  USING (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT user_has_permission('campus_living.leave_types.edit'))
  )
  WITH CHECK (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT user_has_permission('campus_living.leave_types.edit'))
  );

CREATE POLICY hostel_leave_types_delete_permission ON public.hostel_leave_types
  FOR DELETE TO authenticated
  USING (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR ((SELECT user_has_permission('campus_living.leave_types.delete')) AND NOT is_system)
  );
