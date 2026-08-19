-- Migration: Department playbook role holders — real people, stored as real data
-- Created: 2026-07-28
-- Module: MBA Improvement-Board department playbooks (/improvement-board/analytics)
--
-- WHY: the organogram artifact stored "who holds it" as free text inside the
-- artifact's content JSON. Two consequences: (a) nothing recorded WHICH MyJKKN
-- person was meant — only a name string, so an assignment could never be joined,
-- counted or surfaced anywhere else; (b) a re-draft REPLACES content, so every
-- typed holder reverted to the AI placeholder "[Manager to complete]".
--
-- APPROACH: extend the existing public.hr_additional_roles rather than adding a
-- parallel table. That table already models exactly this shape — a person holding
-- a named role for a period (role_type / role_category / start_date / end_date /
-- is_current / assigned_by) — but was scoped only to an hr_organizations unit.
-- Improvement areas are group-wide functions (all 14 have institution_id NULL:
-- Admissions, Transport, Library, Procurement...), not colleges, so this adds a
-- second, mutually-exclusive scope column instead of forcing a false HR unit.
--
-- SAFETY: the table holds 0 rows today and no application code reads or writes it
-- (only types/supabase.ts references it). Every change below is additive or
-- scoped by the NEW improvement_area_id column, so behaviour for rows scoped to an
-- hr_organizations unit is unchanged.
-- ============================================================================

-- 1) SCOPE COLUMN ──────────────────────────────────────────────────────────
ALTER TABLE public.hr_additional_roles
  ADD COLUMN IF NOT EXISTS improvement_area_id uuid
    REFERENCES public.improvement_areas(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.hr_additional_roles.improvement_area_id IS
  'Set when this role belongs to a group-wide improvement area (department playbook organogram) rather than an hr_organizations unit. Exactly one of hr_organization_id / improvement_area_id is non-null.';

-- An improvement area is not an HR unit, so an area-scoped row has no org.
ALTER TABLE public.hr_additional_roles
  ALTER COLUMN hr_organization_id DROP NOT NULL;

-- 2) SCOPE CHECK — exactly one scope, never both ───────────────────────────
-- BOTH-AT-ONCE IS DISALLOWED on purpose. The two columns select two different
-- authorities in the RLS policy below (HR tenant isolation vs improvement-board
-- management). A row carrying both would be governed by both branches at once,
-- letting a board manager create a row that then appears inside a college's HR
-- view. Requiring exactly one keeps every row under exactly one authority.
ALTER TABLE public.hr_additional_roles
  DROP CONSTRAINT IF EXISTS hr_additional_roles_scope_check;
ALTER TABLE public.hr_additional_roles
  ADD CONSTRAINT hr_additional_roles_scope_check
  CHECK (num_nonnulls(hr_organization_id, improvement_area_id) = 1);

-- 3) SUBJECT CHECK — unchanged for HR rows, relaxed only for area rows ──────
-- Today: exactly one of staff_id / hr_employee_id. That stays byte-identical for
-- every row with improvement_area_id IS NULL (i.e. every HR row, existing and
-- future). For a playbook row the hr_employees spine is unusable (it holds 0
-- rows), and a holder may legitimately be someone with no MyJKKN team record at
-- all — recorded by name in `notes`. So an area row requires a person OR a name.
ALTER TABLE public.hr_additional_roles
  DROP CONSTRAINT IF EXISTS hr_additional_roles_subject_check;
ALTER TABLE public.hr_additional_roles
  ADD CONSTRAINT hr_additional_roles_subject_check
  CHECK (
    CASE
      WHEN improvement_area_id IS NULL THEN
        ((staff_id IS NOT NULL AND hr_employee_id IS NULL)
          OR (staff_id IS NULL AND hr_employee_id IS NOT NULL))
      ELSE
        hr_employee_id IS NULL
        AND (staff_id IS NOT NULL OR btrim(COALESCE(notes, '')) <> '')
    END
  );

-- 4) ONE CURRENT HOLDER PER (area, role) ───────────────────────────────────
-- Normalised because role_type for a playbook row comes from an editable text
-- field ("Head" vs "head "). Partial on is_current so ended assignments remain as
-- history. Read back with the SAME lower(btrim(...)) normalisation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_add_roles_area_role_current
  ON public.hr_additional_roles (improvement_area_id, lower(btrim(role_type)))
  WHERE improvement_area_id IS NOT NULL AND is_current;

CREATE INDEX IF NOT EXISTS idx_hr_add_roles_area
  ON public.hr_additional_roles (improvement_area_id)
  WHERE improvement_area_id IS NOT NULL;

-- 5) ANON LOCK ─────────────────────────────────────────────────────────────
-- Supabase default-grants the public anon key ALL on public tables; this table
-- was born with SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER for anon.
-- Revoking anon + PUBLIC does not touch the `authenticated` role's own grants, so
-- existing HR capability is preserved exactly (RLS still decides every row).
REVOKE ALL ON TABLE public.hr_additional_roles FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hr_additional_roles TO authenticated;

-- 6) RLS — extend, do not replace, the tenant rule ──────────────────────────
-- CRITICAL: the existing policy is
--   ((hr_organization_id = auth_hr_organization_id()) OR is_super_admin())
-- With a NULL hr_organization_id, `NULL = uuid` is NULL (not true), so every
-- area-scoped row would be invisible and unwritable to everyone but a super
-- admin — the feature would silently return empty. This adds a second branch.
--
-- UNCHANGED FOR HR ROWS: when improvement_area_id IS NULL the new branch is
-- false and branch 1 reduces to the original predicate (its IS NOT NULL guard is
-- redundant-true whenever the comparison could have been true). COALESCE only
-- turns a NULL super-admin result into false — and `false OR NULL` was already
-- "not true", so no row changes visibility. The area branch can only expose rows
-- carrying the brand-new column, which no existing row does.
ALTER TABLE public.hr_additional_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_add_roles_tenant_isolation ON public.hr_additional_roles;
CREATE POLICY hr_add_roles_tenant_isolation ON public.hr_additional_roles
  FOR ALL TO public
  USING (
    (hr_organization_id IS NOT NULL
      AND hr_organization_id = public.auth_hr_organization_id())
    OR (improvement_area_id IS NOT NULL
      AND (public.user_has_permission('improvement.board.manage')
        OR public.is_admin()))
    OR COALESCE(public.is_super_admin(), false)
  )
  WITH CHECK (
    (hr_organization_id IS NOT NULL
      AND hr_organization_id = public.auth_hr_organization_id())
    OR (improvement_area_id IS NOT NULL
      AND (public.user_has_permission('improvement.board.manage')
        OR public.is_admin()))
    OR COALESCE(public.is_super_admin(), false)
  );

-- 7) RPC — set one assignment (upsert, with handover history) ───────────────
-- Explicit lookup + UPDATE/INSERT rather than ON CONFLICT: the uniqueness rule is
-- a PARTIAL EXPRESSION index, which ON CONFLICT cannot infer (42P10).
-- When the holder changes, the standing row is end-dated and a new current row
-- opens — that is what start_date/end_date/is_current are for.
CREATE OR REPLACE FUNCTION public.fn_mba_dept_role_assignment_set(
  p_area_id     uuid,
  p_role_type   text,
  p_staff_id    uuid DEFAULT NULL,
  p_holder_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id       uuid;
  v_role     text;
  v_note     text;
  v_cur_id   uuid;
  v_cur_sid  uuid;
  v_cur_note text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_set: not authenticated';
  END IF;
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('improvement.board.manage')
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_set: requires improvement.board.manage';
  END IF;

  v_role := btrim(COALESCE(p_role_type, ''));
  v_note := NULLIF(btrim(COALESCE(p_holder_note, '')), '');

  IF v_role = '' THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_set: role_type is required';
  END IF;
  IF p_staff_id IS NULL AND v_note IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_set: a holder is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.improvement_areas a WHERE a.id = p_area_id) THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_set: no such improvement_area %', p_area_id;
  END IF;
  IF p_staff_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = p_staff_id) THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_set: no such team member %', p_staff_id;
  END IF;

  SELECT id, staff_id, notes INTO v_cur_id, v_cur_sid, v_cur_note
  FROM public.hr_additional_roles
  WHERE improvement_area_id = p_area_id
    AND lower(btrim(role_type)) = lower(v_role)
    AND is_current
  FOR UPDATE;

  -- Same holder already standing: refresh the label/name only.
  IF v_cur_id IS NOT NULL
     AND v_cur_sid IS NOT DISTINCT FROM p_staff_id
     AND v_cur_note IS NOT DISTINCT FROM v_note THEN
    UPDATE public.hr_additional_roles
    SET role_type = v_role, updated_at = now()
    WHERE id = v_cur_id;
    RETURN v_cur_id;
  END IF;

  -- Handover: close the standing assignment, then open a new one.
  IF v_cur_id IS NOT NULL THEN
    UPDATE public.hr_additional_roles
    SET is_current = false, end_date = CURRENT_DATE, updated_at = now()
    WHERE id = v_cur_id;
  END IF;

  INSERT INTO public.hr_additional_roles (
    improvement_area_id, hr_organization_id, role_type, role_category,
    staff_id, hr_employee_id, notes,
    start_date, end_date, is_current, assigned_by
  ) VALUES (
    p_area_id, NULL, v_role, 'Department Playbook',
    p_staff_id, NULL, v_note,
    CURRENT_DATE, NULL, true, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_role_assignment_set(uuid, text, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_role_assignment_set(uuid, text, uuid, text) TO authenticated;

-- 8) RPC — clear one assignment (end-date it; history is kept) ──────────────
CREATE OR REPLACE FUNCTION public.fn_mba_dept_role_assignment_clear(
  p_area_id   uuid,
  p_role_type text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_clear: not authenticated';
  END IF;
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('improvement.board.manage')
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignment_clear: requires improvement.board.manage';
  END IF;

  UPDATE public.hr_additional_roles
  SET is_current = false, end_date = CURRENT_DATE, updated_at = now()
  WHERE improvement_area_id = p_area_id
    AND lower(btrim(role_type)) = lower(btrim(COALESCE(p_role_type, '')))
    AND is_current;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_role_assignment_clear(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_role_assignment_clear(uuid, text) TO authenticated;

-- 9) RPC — sync the whole organogram in one call ───────────────────────────
-- p_assignments: jsonb array of {role_type, staff_id, holder_note}. Entries with
-- no holder are skipped, and any standing area assignment whose role is no longer
-- in the organogram is end-dated. One call so an approve cannot leave a
-- department half-assigned.
CREATE OR REPLACE FUNCTION public.fn_mba_dept_role_assignments_sync(
  p_area_id     uuid,
  p_assignments jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row   jsonb;
  v_role  text;
  v_note  text;
  v_sid   uuid;
  v_keep  text[] := ARRAY[]::text[];
  v_kept  integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignments_sync: not authenticated';
  END IF;
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('improvement.board.manage')
  ) THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignments_sync: requires improvement.board.manage';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.improvement_areas a WHERE a.id = p_area_id) THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignments_sync: no such improvement_area %', p_area_id;
  END IF;
  IF p_assignments IS NULL OR jsonb_typeof(p_assignments) <> 'array' THEN
    RAISE EXCEPTION 'fn_mba_dept_role_assignments_sync: p_assignments must be a jsonb array';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_assignments) LOOP
    v_role := btrim(COALESCE(v_row->>'role_type', ''));
    v_note := NULLIF(btrim(COALESCE(v_row->>'holder_note', '')), '');
    BEGIN
      v_sid := NULLIF(btrim(COALESCE(v_row->>'staff_id', '')), '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_sid := NULL;
    END;

    CONTINUE WHEN v_role = '';
    -- A team member who no longer exists cannot be linked; keep any typed name.
    IF v_sid IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = v_sid) THEN
      v_sid := NULL;
    END IF;
    -- Nobody named yet for this role — nothing to remember.
    CONTINUE WHEN v_sid IS NULL AND v_note IS NULL;
    -- A duplicated role title in the same organogram: first entry wins.
    CONTINUE WHEN lower(v_role) = ANY (v_keep);

    v_keep := v_keep || lower(v_role);
    v_kept := v_kept + 1;
    PERFORM public.fn_mba_dept_role_assignment_set(p_area_id, v_role, v_sid, v_note);
  END LOOP;

  -- End assignments for roles the organogram no longer carries (or that were
  -- cleared back to "nobody yet"). History rows are untouched.
  UPDATE public.hr_additional_roles
  SET is_current = false, end_date = CURRENT_DATE, updated_at = now()
  WHERE improvement_area_id = p_area_id
    AND is_current
    AND NOT (lower(btrim(role_type)) = ANY (v_keep));

  RETURN v_kept;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_dept_role_assignments_sync(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_dept_role_assignments_sync(uuid, jsonb) TO authenticated;
