-- 2026-07-30 — Harden the manage-boards surface: lock anon off the table, make the
-- built-in flag and the key genuinely immutable, and stop the delete dialog from
-- offering a delete the server will refuse.
--
-- Three review findings, one surface.
--
-- P6 — anon holds seven privileges on public.improvement_areas
-- Measured before this migration:
--   anon: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- Supabase's default privileges grant these on every new table independently of
-- PUBLIC, and the project rule requires an explicit revoke. It is not currently
-- exploitable -- RLS rejects the rows, and PostgREST exposes no TRUNCATE -- but
-- TRUNCATE is not subject to RLS at all, so the only thing standing between an anon
-- key and an empty table is that no route reaches the verb. That is not a guard.
--
-- P5 — is_system and key are immutable only by convention
-- fn_improvement_area_update never touches either column, but improvement_areas
-- carries an UPDATE policy admitting any improvement.board.manage holder, so a raw
-- PostgREST PATCH writes them directly. Flipping is_system to false defeats a
-- deliberate guard: fn_improvement_area_delete refuses to delete a built-in board,
-- and that refusal reads the column. Rewriting key silently breaks every lookup that
-- identifies a board by it. A BEFORE UPDATE trigger enforces both regardless of the
-- path taken, because the RPC is not the only way in.
--
-- P7 — the delete dialog offers a delete the server refuses
-- fn_improvement_area_delete counts NINE dependants and refuses if any is non-zero.
-- fn_improvement_areas_manage_list returns only EIGHT and sums only those eight into
-- dependent_count: current role holders in hr_additional_roles are missing. So for a
-- custom board with a role holder and nothing else attached:
--   canDelete = !is_system && dependent_count === 0   ->  true, button ENABLED
--   the dialog says "Nothing is filed against this board"
--   the server then refuses with "N assigned role holder(s)"
-- A control that is offered and then refused, above copy asserting the opposite. The
-- count is added here; the copy is corrected in the same PR.

-- ---------------------------------------------------------------------------
-- P6 — lock anon and PUBLIC off the table. authenticated holds its own direct
-- grants, so they are unaffected; the RLS policies remain the real gate.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.improvement_areas FROM anon, PUBLIC;

-- ---------------------------------------------------------------------------
-- P5 — is_system and key are immutable to everyone but a super admin, whatever
-- route the write arrives by.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_improvement_areas_guard_immutable_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(public.is_super_admin(), false) THEN
    RETURN NEW;
  END IF;

  IF NEW.is_system IS DISTINCT FROM OLD.is_system THEN
    RAISE EXCEPTION
      'Whether a board is built in is not editable. The built-in flag decides that "%" cannot be deleted, so changing it would defeat that guard.',
      OLD.label
      USING ERRCODE = '42501';
  END IF;

  IF NEW.key IS DISTINCT FROM OLD.key THEN
    RAISE EXCEPTION
      'A board key is permanent. "%" is identified by its key everywhere it is looked up, so renaming it would break those lookups silently. Change the board name instead.',
      OLD.key
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_improvement_areas_guard_immutable ON public.improvement_areas;

CREATE TRIGGER trg_improvement_areas_guard_immutable
BEFORE UPDATE ON public.improvement_areas
FOR EACH ROW
EXECUTE FUNCTION public.fn_improvement_areas_guard_immutable_columns();

-- ---------------------------------------------------------------------------
-- P7 — the manage list must count what the delete RPC counts. Adding a column to
-- RETURNS TABLE changes the signature, so this is a DROP and CREATE rather than a
-- replace -- and a DROP re-arms Supabase's default EXECUTE grant to anon, so the
-- revoke below is not optional.
--
-- Body reproduced from the live pg_get_functiondef output
-- (md5 388aeb8458c169fdd9701580f77a4f9b) with role_holder_count added. That name
-- matches fn_improvement_area_dependants in PR #2597 deliberately: two names for
-- the same count in the same file is the drift this finding is about.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_improvement_areas_manage_list();

CREATE FUNCTION public.fn_improvement_areas_manage_list()
RETURNS TABLE(
  id uuid, key text, label text, description text,
  is_system boolean, is_active boolean, display_order integer,
  created_at timestamp with time zone, updated_at timestamp with time zone,
  idea_count bigint, artifact_count bigint, artifact_version_count bigint,
  data_gap_count bigint, posting_count bigint, analyst_view_count bigint,
  rotation_slot_count bigint, rotation_cycle_dept_count bigint,
  role_holder_count bigint, dependent_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    c.holders,
    (c.ideas + c.artifacts + c.versions + c.gaps
     + c.postings + c.views + c.slots + c.cycle_depts
     + c.holders) AS dependent_count
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
      (SELECT count(*) FROM public.mba_rotation_cycle_departments x WHERE x.area_id = a.id) AS cycle_depts,
      -- Matches fn_improvement_area_delete exactly: CURRENT holders only. A retired
      -- assignment is history and must not block a delete.
      (SELECT count(*) FROM public.hr_additional_roles            x
        WHERE x.improvement_area_id = a.id AND x.is_current)                            AS holders
  ) c
  ORDER BY a.display_order, a.label;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_improvement_areas_manage_list() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_areas_manage_list() TO authenticated;
