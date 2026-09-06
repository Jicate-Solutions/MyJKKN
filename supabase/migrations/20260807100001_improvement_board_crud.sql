-- ============================================================================
-- Improvement Board — on-screen board (area) management
-- Created: 2026-07-28
-- ----------------------------------------------------------------------------
-- WHY
-- The 14 boards on the Improvement Board (`public.improvement_areas`) were
-- seeded by migration and had NO write path in the application at all — a
-- manager could not add a board, rename one, re-order the picker, or retire a
-- board that no longer maps to how the institution is organised. Every change
-- needed a developer + a migration. This migration gives board managers a real
-- create / rename / re-order / activate / retire surface.
--
-- DELETE vs DEACTIVATE (the load-bearing decision)
-- `improvement_areas` is referenced by EIGHT tables. Verified live on prod:
--
--   improvement_ideas.area_id                 ON DELETE NO ACTION
--   mba_area_analyst_views.area_id            ON DELETE CASCADE
--   mba_associate_postings.area_id            ON DELETE CASCADE
--   mba_data_gaps.area_id                     ON DELETE CASCADE
--   mba_dept_artifacts.area_id                ON DELETE CASCADE
--   mba_dept_artifact_versions.area_id        ON DELETE CASCADE
--   mba_rotation_cycle_departments.area_id    ON DELETE CASCADE
--   mba_rotation_slots.area_id                ON DELETE CASCADE
--
-- Seven of the eight CASCADE. A single DELETE would therefore silently destroy
-- the department playbooks, their whole version history, the analyst views, the
-- assignments and the rotation history attached to that board — with no undo
-- and no warning. On prod today 13 of the 14 boards carry exactly that kind of
-- work (39 playbook artifacts, 35 artifact versions, 26 assignments, 15 views).
--
-- So: DEACTIVATE is the default retire action (is_active = false hides the
-- board from every picker and from the non-manager SELECT policy while leaving
-- every linked row intact and reversible), and hard DELETE is refused by
-- fn_improvement_area_delete whenever ANY dependent row exists. The refusal
-- message names the counts so the screen can explain precisely what is holding
-- the board open. Hard delete is therefore only ever possible for a board that
-- was created by mistake and never used.
--
-- SYSTEM BOARDS
-- The 14 seeded boards are is_system = true. They may be renamed, re-described,
-- re-ordered and deactivated, but NEVER deleted — enforced by a RAISE in
-- fn_improvement_area_delete, not by the UI.
--
-- WHY THE BASE-TABLE POLICY CHANGES
-- The old `improvement_areas_manage` policy was FOR ALL, so a manager could
-- issue a raw PostgREST DELETE straight past the guards above and cascade the
-- work away. It is replaced by explicit INSERT + UPDATE policies and NO DELETE
-- policy at all, so deletion is only reachable through the guarded SECURITY
-- DEFINER RPC. The SELECT policy additionally gains an
-- `improvement.board.manage` branch: without it a manager who is not also an
-- administrator would deactivate a board and then be unable to SEE it again to
-- switch it back on.
--
-- SCOPE NOTE (deliberate)
-- Every one of the 14 rows has institution_id IS NULL — the boards are
-- program-wide, not per-institution, and no policy on this table filters by
-- institution today. New boards are therefore created program-wide too. This
-- migration does NOT introduce per-institution board scoping; that would be a
-- separate decision with its own picker + RLS work.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Make `key` genuinely unique for program-wide boards
-- ---------------------------------------------------------------------------
-- The existing constraint is UNIQUE (institution_id, key). In Postgres NULLs
-- compare as distinct, so with institution_id IS NULL that constraint enforces
-- NOTHING — two program-wide boards could both take key 'admissions'. `key` is
-- referenced by other code paths, so back it with a partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS improvement_areas_key_global_uniq
  ON public.improvement_areas (key)
  WHERE institution_id IS NULL;

-- ---------------------------------------------------------------------------
-- 2) RLS — read for managers, write only where it is safe
-- ---------------------------------------------------------------------------
ALTER TABLE public.improvement_areas ENABLE ROW LEVEL SECURITY;

-- SELECT: administrators and board managers see every board (including the
-- deactivated ones they need to switch back on); everyone else sees only the
-- active boards, and only if they can view the board at all.
DROP POLICY IF EXISTS improvement_areas_select ON public.improvement_areas;
CREATE POLICY improvement_areas_select ON public.improvement_areas
FOR SELECT USING (
  COALESCE(public.is_super_admin(), false)
  OR COALESCE(public.is_admin(), false)
  OR COALESCE(public.user_has_permission('improvement.board.manage'), false)
  OR (is_active AND COALESCE(public.user_has_permission('improvement.ideas.view'), false))
);

-- The old FOR ALL policy also granted DELETE, which would let a manager bypass
-- the is_system + dependent-row guards with a raw PostgREST call.
DROP POLICY IF EXISTS improvement_areas_manage ON public.improvement_areas;

DROP POLICY IF EXISTS improvement_areas_manage_insert ON public.improvement_areas;
CREATE POLICY improvement_areas_manage_insert ON public.improvement_areas
FOR INSERT WITH CHECK (
  COALESCE(public.is_super_admin(), false)
  OR COALESCE(public.is_admin(), false)
  OR COALESCE(public.user_has_permission('improvement.board.manage'), false)
);

DROP POLICY IF EXISTS improvement_areas_manage_update ON public.improvement_areas;
CREATE POLICY improvement_areas_manage_update ON public.improvement_areas
FOR UPDATE USING (
  COALESCE(public.is_super_admin(), false)
  OR COALESCE(public.is_admin(), false)
  OR COALESCE(public.user_has_permission('improvement.board.manage'), false)
) WITH CHECK (
  COALESCE(public.is_super_admin(), false)
  OR COALESCE(public.is_admin(), false)
  OR COALESCE(public.user_has_permission('improvement.board.manage'), false)
);

-- NOTE: there is deliberately NO DELETE policy. Deletion happens only through
-- fn_improvement_area_delete below, which enforces the is_system and
-- dependent-row guards.

-- ---------------------------------------------------------------------------
-- 3) Shared guard
-- ---------------------------------------------------------------------------
-- Every guard below routes through this one function so the rule cannot drift
-- between the six writers. NULL-safe: is_super_admin() returns NULL for a row
-- with a NULL flag, and `NOT NULL` is NULL, which would fall through.
CREATE OR REPLACE FUNCTION public.fn_improvement_can_manage_areas()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.is_super_admin(), false)
      OR COALESCE(public.is_admin(), false)
      OR COALESCE(public.user_has_permission('improvement.board.manage'), false);
$$;

REVOKE EXECUTE ON FUNCTION public.fn_improvement_can_manage_areas() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_can_manage_areas() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) List boards for the management screen (with dependent-row counts)
-- ---------------------------------------------------------------------------
-- The counts drive the delete-vs-deactivate explanation in the UI. They are
-- read here (SECURITY DEFINER) because a board manager has no RLS read path to
-- several of the referencing tables.
CREATE OR REPLACE FUNCTION public.fn_improvement_areas_manage_list()
RETURNS TABLE (
  id                        uuid,
  key                       text,
  label                     text,
  description               text,
  is_system                 boolean,
  is_active                 boolean,
  display_order             integer,
  created_at                timestamptz,
  updated_at                timestamptz,
  idea_count                bigint,
  artifact_count            bigint,
  artifact_version_count    bigint,
  data_gap_count            bigint,
  posting_count             bigint,
  analyst_view_count        bigint,
  rotation_slot_count       bigint,
  rotation_cycle_dept_count bigint,
  dependent_count           bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_improvement_can_manage_areas() THEN
    RAISE EXCEPTION 'You do not have permission to manage improvement boards.';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.key,
    a.label,
    a.description,
    a.is_system,
    a.is_active,
    a.display_order,
    a.created_at,
    a.updated_at,
    c.ideas,
    c.artifacts,
    c.versions,
    c.gaps,
    c.postings,
    c.views,
    c.slots,
    c.cycle_depts,
    (c.ideas + c.artifacts + c.versions + c.gaps
     + c.postings + c.views + c.slots + c.cycle_depts) AS dependent_count
  FROM public.improvement_areas a
  CROSS JOIN LATERAL (
    SELECT
      (SELECT count(*) FROM public.improvement_ideas              x WHERE x.area_id = a.id) AS ideas,
      (SELECT count(*) FROM public.mba_dept_artifacts             x WHERE x.area_id = a.id) AS artifacts,
      (SELECT count(*) FROM public.mba_dept_artifact_versions     x WHERE x.area_id = a.id) AS versions,
      (SELECT count(*) FROM public.mba_data_gaps                  x WHERE x.area_id = a.id) AS gaps,
      (SELECT count(*) FROM public.mba_associate_postings         x WHERE x.area_id = a.id) AS postings,
      (SELECT count(*) FROM public.mba_area_analyst_views         x WHERE x.area_id = a.id) AS views,
      (SELECT count(*) FROM public.mba_rotation_slots             x WHERE x.area_id = a.id) AS slots,
      (SELECT count(*) FROM public.mba_rotation_cycle_departments x WHERE x.area_id = a.id) AS cycle_depts
  ) c
  ORDER BY a.display_order, a.label;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_improvement_areas_manage_list() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_areas_manage_list() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Create a board
-- ---------------------------------------------------------------------------
-- `key` is derived from the label as a slug and is NEVER editable afterwards —
-- other code paths key off it. A caller may pass p_key to seed the slug, but
-- the value is still normalised and de-duplicated here. New boards are always
-- is_system = false, is_active = true, and land at the end of the order.
CREATE OR REPLACE FUNCTION public.fn_improvement_area_create(
  p_label       text,
  p_description text DEFAULT NULL,
  p_key         text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_label text := btrim(COALESCE(p_label, ''));
  v_key   text;
  v_base  text;
  v_n     integer := 1;
  v_id    uuid;
BEGIN
  IF NOT public.fn_improvement_can_manage_areas() THEN
    RAISE EXCEPTION 'You do not have permission to create improvement boards.';
  END IF;
  IF v_label = '' THEN
    RAISE EXCEPTION 'A board name is required.';
  END IF;
  IF length(v_label) > 120 THEN
    RAISE EXCEPTION 'A board name must be 120 characters or fewer.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.improvement_areas a
    WHERE a.institution_id IS NULL AND lower(a.label) = lower(v_label)
  ) THEN
    RAISE EXCEPTION 'A board named "%" already exists.', v_label;
  END IF;

  -- Slug: lowercase, non-alphanumerics collapsed to underscores, trimmed.
  v_key := lower(btrim(COALESCE(NULLIF(btrim(COALESCE(p_key, '')), ''), v_label)));
  v_key := regexp_replace(v_key, '[^a-z0-9]+', '_', 'g');
  v_key := btrim(v_key, '_');
  v_key := left(v_key, 40);
  IF v_key = '' THEN
    v_key := 'board';
  END IF;

  v_base := v_key;
  WHILE EXISTS (
    SELECT 1 FROM public.improvement_areas a
    WHERE a.key = v_key AND a.institution_id IS NULL
  ) LOOP
    v_n := v_n + 1;
    v_key := left(v_base, 36) || '_' || v_n::text;
  END LOOP;

  INSERT INTO public.improvement_areas (
    institution_id, key, label, description,
    is_system, is_active, display_order, created_by
  ) VALUES (
    NULL,
    v_key,
    v_label,
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    false,
    true,
    COALESCE((SELECT max(a.display_order) FROM public.improvement_areas a), 0) + 10,
    v_uid
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_improvement_area_create(text, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_area_create(text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Update a board (rename / re-describe / re-position / activate)
-- ---------------------------------------------------------------------------
-- p_label is required. p_description NULL clears the description (the edit form
-- always sends both fields, so there is no unchanged-vs-cleared ambiguity).
-- p_display_order and p_is_active are left unchanged when NULL.
-- `key` and `is_system` are intentionally NOT updatable.
CREATE OR REPLACE FUNCTION public.fn_improvement_area_update(
  p_area_id       uuid,
  p_label         text,
  p_description   text    DEFAULT NULL,
  p_display_order integer DEFAULT NULL,
  p_is_active     boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text := btrim(COALESCE(p_label, ''));
BEGIN
  IF NOT public.fn_improvement_can_manage_areas() THEN
    RAISE EXCEPTION 'You do not have permission to edit improvement boards.';
  END IF;
  IF p_area_id IS NULL THEN
    RAISE EXCEPTION 'A board is required.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.improvement_areas a WHERE a.id = p_area_id) THEN
    RAISE EXCEPTION 'That board no longer exists. Refresh and try again.';
  END IF;
  IF v_label = '' THEN
    RAISE EXCEPTION 'A board name is required.';
  END IF;
  IF length(v_label) > 120 THEN
    RAISE EXCEPTION 'A board name must be 120 characters or fewer.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.improvement_areas a
    WHERE a.id <> p_area_id
      AND a.institution_id IS NULL
      AND lower(a.label) = lower(v_label)
  ) THEN
    RAISE EXCEPTION 'A board named "%" already exists.', v_label;
  END IF;

  UPDATE public.improvement_areas a
  SET label         = v_label,
      description   = NULLIF(btrim(COALESCE(p_description, '')), ''),
      display_order = COALESCE(p_display_order, a.display_order),
      is_active     = COALESCE(p_is_active, a.is_active)
  WHERE a.id = p_area_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_improvement_area_update(uuid, text, text, integer, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_area_update(uuid, text, text, integer, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Re-order boards
-- ---------------------------------------------------------------------------
-- Takes the boards in their new display order and rewrites display_order as
-- 10, 20, 30 … so the sequence stays gap-tolerant and collision-free.
CREATE OR REPLACE FUNCTION public.fn_improvement_area_reorder(p_area_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_improvement_can_manage_areas() THEN
    RAISE EXCEPTION 'You do not have permission to re-order improvement boards.';
  END IF;
  IF p_area_ids IS NULL OR array_length(p_area_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No boards were supplied to re-order.';
  END IF;
  IF (SELECT count(*) FROM unnest(p_area_ids) AS t(id))
     <> (SELECT count(DISTINCT t.id) FROM unnest(p_area_ids) AS t(id)) THEN
    RAISE EXCEPTION 'The same board was listed twice in the new order.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_area_ids) AS t(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.improvement_areas a WHERE a.id = t.id)
  ) THEN
    RAISE EXCEPTION 'One or more boards in the new order no longer exist. Refresh and try again.';
  END IF;

  UPDATE public.improvement_areas a
  SET display_order = (t.ord * 10)::integer
  FROM unnest(p_area_ids) WITH ORDINALITY AS t(id, ord)
  WHERE a.id = t.id;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_improvement_area_reorder(uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_area_reorder(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8) Delete a board (the guarded path — see the header for why it is narrow)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_improvement_area_delete(p_area_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label       text;
  v_is_system   boolean;
  v_ideas       bigint;
  v_artifacts   bigint;
  v_versions    bigint;
  v_gaps        bigint;
  v_postings    bigint;
  v_views       bigint;
  v_slots       bigint;
  v_cycle_depts bigint;
  v_parts       text[] := ARRAY[]::text[];
BEGIN
  IF NOT public.fn_improvement_can_manage_areas() THEN
    RAISE EXCEPTION 'You do not have permission to delete improvement boards.';
  END IF;
  IF p_area_id IS NULL THEN
    RAISE EXCEPTION 'A board is required.';
  END IF;

  SELECT a.label, a.is_system INTO v_label, v_is_system
  FROM public.improvement_areas a WHERE a.id = p_area_id;

  IF v_label IS NULL THEN
    RAISE EXCEPTION 'That board no longer exists. Refresh and try again.';
  END IF;

  IF v_is_system THEN
    RAISE EXCEPTION 'The built-in board "%" cannot be deleted. Switch it off instead — deactivating hides it everywhere and can be undone.', v_label;
  END IF;

  SELECT
    (SELECT count(*) FROM public.improvement_ideas              x WHERE x.area_id = p_area_id),
    (SELECT count(*) FROM public.mba_dept_artifacts             x WHERE x.area_id = p_area_id),
    (SELECT count(*) FROM public.mba_dept_artifact_versions     x WHERE x.area_id = p_area_id),
    (SELECT count(*) FROM public.mba_data_gaps                  x WHERE x.area_id = p_area_id),
    (SELECT count(*) FROM public.mba_associate_postings         x WHERE x.area_id = p_area_id),
    (SELECT count(*) FROM public.mba_area_analyst_views         x WHERE x.area_id = p_area_id),
    (SELECT count(*) FROM public.mba_rotation_slots             x WHERE x.area_id = p_area_id),
    (SELECT count(*) FROM public.mba_rotation_cycle_departments x WHERE x.area_id = p_area_id)
  INTO v_ideas, v_artifacts, v_versions, v_gaps, v_postings, v_views, v_slots, v_cycle_depts;

  IF v_ideas       > 0 THEN v_parts := v_parts || (v_ideas       || ' improvement idea(s)'); END IF;
  IF v_artifacts   > 0 THEN v_parts := v_parts || (v_artifacts   || ' department playbook(s)'); END IF;
  IF v_versions    > 0 THEN v_parts := v_parts || (v_versions    || ' playbook version(s)'); END IF;
  IF v_gaps        > 0 THEN v_parts := v_parts || (v_gaps        || ' data gap(s)'); END IF;
  IF v_postings    > 0 THEN v_parts := v_parts || (v_postings    || ' analyst assignment(s)'); END IF;
  IF v_views       > 0 THEN v_parts := v_parts || (v_views       || ' analyst view(s)'); END IF;
  IF v_slots       > 0 THEN v_parts := v_parts || (v_slots       || ' rotation slot(s)'); END IF;
  IF v_cycle_depts > 0 THEN v_parts := v_parts || (v_cycle_depts || ' rotation cycle entr(ies)'); END IF;

  IF array_length(v_parts, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'The board "%" still has % attached to it, and deleting it would destroy that work. Switch the board off instead — deactivating hides it from every picker and can be undone.',
      v_label, array_to_string(v_parts, ', ');
  END IF;

  DELETE FROM public.improvement_areas a WHERE a.id = p_area_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_improvement_area_delete(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_area_delete(uuid) TO authenticated;
