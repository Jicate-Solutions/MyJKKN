-- ============================================================================
-- Migration: 20260710150000_bos_member_type_catalog_names.sql
-- Description: bos_members.member_type now stores the SELECTED catalog type's
--              name (bos_member_types.name), not the coarse base_type category.
--
-- Context: member types are institution-managed rows in bos_member_types
-- (e.g. "Nominated by the Governing Body", base_type 'subject_expert'). The
-- Add Member dialog used to write member_type = base_type, so the DB column
-- showed the category instead of the type the user actually picked. Per the
-- 2026-07-10 decision the column now carries the catalog name verbatim.
--
--   1. Drop the static enum CHECK — valid values are defined by the
--      bos_member_types table now, not a hardcoded list. (The live constraint
--      still had only the original 7 values; 20260512/20260706c were never
--      applied to this database.)
--   2. Chairman authorization: the three helper functions matched
--      m.member_type = 'chairman' literally. They now ALSO accept a member
--      linked (member_type_id) to a catalog type whose base_type = 'chairman',
--      and match the literal case-insensitively so a "Chairman"-named catalog
--      value keeps working even if the catalog row is later deleted
--      (member_type_id goes NULL via ON DELETE SET NULL).
--   3. Backfill: rows already linked to a catalog type get member_type
--      re-stamped to that type's name, so old and new rows read the same.
--      Rows with member_type_id NULL (pre-catalog, AC snapshots) keep their
--      legacy enum value.
-- ============================================================================

BEGIN;

-- ── 1. Drop the static CHECK; widen to fit catalog names ────────────────────
-- bos_member_types.name is VARCHAR(255); member_type was VARCHAR(30), which
-- can't hold e.g. 'Nominated by the Governing Body' (31 chars).

ALTER TABLE public.bos_members
  DROP CONSTRAINT IF EXISTS bos_members_member_type_check;

ALTER TABLE public.bos_members
  ALTER COLUMN member_type TYPE VARCHAR(255);

-- The catalog's own base_type CHECK predates 'member_secretary' (20260706c was
-- never applied here); the member-types form already offers it, so include it.
ALTER TABLE public.bos_member_types
  DROP CONSTRAINT IF EXISTS bos_member_types_base_type_check;

ALTER TABLE public.bos_member_types
  ADD CONSTRAINT bos_member_types_base_type_check
  CHECK (base_type IN (
    'principal', 'chairman', 'hod', 'facilitator', 'university_nominee',
    'subject_expert', 'internal_member', 'industry_expert', 'alumni',
    'startup', 'member_secretary'
  ));

-- ── 2. Catalog-aware chairman predicates ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_bos_chairman_of(p_composition_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM bos_members m
    JOIN bos_compositions c ON c.id = m.composition_id
    JOIN staff s ON s.id = m.staff_id
    WHERE s.profile_id = (SELECT auth.uid())
      AND m.composition_id = p_composition_id
      AND (
        lower(m.member_type) = 'chairman'
        OR EXISTS (
          SELECT 1 FROM bos_member_types t
          WHERE t.id = m.member_type_id AND t.base_type = 'chairman'
        )
      )
      AND m.is_active = true
      AND c.is_active = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_bos_chairman_of_board(p_board_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from bos_members m
    join bos_compositions c on c.id = m.composition_id
    join staff s on s.id = m.staff_id
    left join bos_composition_boards cb on cb.composition_id = c.id
    where s.profile_id = (select auth.uid())
      and (c.board_id = p_board_id or cb.board_id = p_board_id)
      and (
        lower(m.member_type) = 'chairman'
        or exists (
          select 1 from bos_member_types t
          where t.id = m.member_type_id and t.base_type = 'chairman'
        )
      )
      and m.is_active = true
      and c.is_active = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_board_chairman_for_programme(p_institutions_id uuid, p_programme_code character varying)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_staff_id     UUID;
  v_is_chairman  BOOLEAN := false;
BEGIN
  -- Resolve current auth user → staff record (added by 20250121_add_profile_id_to_staff)
  SELECT id INTO v_staff_id
  FROM public.staff
  WHERE profile_id = auth.uid()
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RETURN false;
  END IF;

  -- Is this staff member chairman in any active composition of a board that
  -- governs the target programme at the given institution?
  SELECT EXISTS (
    SELECT 1
    FROM   public.bos_members        m
    JOIN   public.bos_compositions   c  ON c.id        = m.composition_id
    JOIN   public.bos_board_programmes bp ON bp.board_id = c.board_id
    WHERE  bp.institutions_id = p_institutions_id
      AND  bp.programme_code  = p_programme_code
      AND  c.is_active        = true
      AND  m.staff_id         = v_staff_id
      AND  (
        lower(m.member_type) = 'chairman'
        OR EXISTS (
          SELECT 1 FROM public.bos_member_types t
          WHERE t.id = m.member_type_id AND t.base_type = 'chairman'
        )
      )
  ) INTO v_is_chairman;

  RETURN v_is_chairman;
END;
$function$;

-- ── 3. Backfill linked rows to the catalog name ──────────────────────────────

UPDATE public.bos_members m
SET    member_type = t.name
FROM   public.bos_member_types t
WHERE  t.id = m.member_type_id
  AND  m.member_type IS DISTINCT FROM t.name;

COMMIT;
