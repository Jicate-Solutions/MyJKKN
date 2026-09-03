-- Staff ID standardisation — the backfill.
--
-- Renumbers all 752 ACTIVE staff onto the scheme established by
-- 20260828120000_staff_id_standardisation_primitives.sql, in seniority order
-- within each institution x teaching bucket. The 116 inactive staff end blank,
-- with their old code preserved in legacy_staff_id.
--
-- WHY THE STATEMENT ORDER MATTERS. staff_staff_id_key is a plain UNIQUE INDEX,
-- not a deferrable constraint, so Postgres checks it per row WITHIN a
-- statement. A rewrite where a new code lands on a value another row still
-- holds fails mid-statement even though the final set is unique. So every
-- existing code is vacated first — leavers to NULL, actives to a unique
-- ~TMP~ value — leaving the column with no real code in it before assignment.
--
-- TRIGGERS ARE DISABLED for the rewrite:
--   trg_sync_staff_to_profiles  fires on EVERY staff update and mirrors ~10
--                               columns into profiles. It does not mirror
--                               staff_id, so this loses nothing — but leaving
--                               it on would silently rewrite 868 logins,
--                               including re-enabling deliberately disabled
--                               ones.
--   trg_staff_autonumber        our own permanence guard; it would reject this
--                               migration's rewrites.
--   update_staff_updated_at     avoids stamping all 868 rows as just-modified.
-- The whole body is one DO block, so any RAISE rolls the transaction back and
-- restores all three (DDL is transactional in Postgres).

BEGIN;

-- ── Crosswalk ────────────────────────────────────────────────────────────────
-- Permanent, not temporary: 681 people's codes change here, and this is both
-- the only route back and the artefact HR circulates to tell staff what their
-- new ID is. Deliberately no FK to staff — deleting a staff row must not erase
-- the record of what their code used to be.

CREATE TABLE IF NOT EXISTS public.staff_id_crosswalk (
  staff_uuid       uuid PRIMARY KEY,
  full_name        text,
  institution_name text,
  is_teaching      boolean,
  is_active        boolean,
  old_staff_id     text,
  new_staff_id     text,
  migrated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.staff_id_crosswalk IS
  'Old -> new staff ID mapping from the 2026-08-28 standardisation. Read via v_staff_id_crosswalk.';

ALTER TABLE public.staff_id_crosswalk ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staff_id_crosswalk FROM anon;
GRANT SELECT ON public.staff_id_crosswalk TO authenticated;

DROP POLICY IF EXISTS staff_id_crosswalk_select_super_admin ON public.staff_id_crosswalk;
CREATE POLICY staff_id_crosswalk_select_super_admin
  ON public.staff_id_crosswalk FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- ── The rewrite ──────────────────────────────────────────────────────────────

DO $mig$
DECLARE
  v_active   integer;
  v_assigned integer;
BEGIN
  ALTER TABLE public.staff DISABLE TRIGGER trg_sync_staff_to_profiles;
  ALTER TABLE public.staff DISABLE TRIGGER trg_staff_autonumber;
  ALTER TABLE public.staff DISABLE TRIGGER update_staff_updated_at;

  -- 1. Preserve every code that exists today, active and inactive alike.
  UPDATE public.staff
  SET legacy_staff_id = staff_id
  WHERE staff_id IS NOT NULL
    AND legacy_staff_id IS NULL;

  -- 2. Leavers go blank, freeing any code they were squatting on.
  UPDATE public.staff SET staff_id = NULL
  WHERE NOT coalesce(is_active, false) AND staff_id IS NOT NULL;

  -- 3. Park every active row on a value that cannot collide with anything.
  UPDATE public.staff SET staff_id = '~TMP~' || id::text
  WHERE coalesce(is_active, false);

  -- 4. Assign the real codes, seniority first within each bucket. created_at
  --    then id break ties so the result is deterministic and re-runnable.
  WITH ranked AS (
    SELECT s.id,
           (CASE WHEN ec.is_teaching THEN i.staff_code_prefix
                 ELSE 'NOT' || i.staff_code_prefix END)
           || lpad(
                row_number() OVER (
                  PARTITION BY s.institution_id, ec.is_teaching
                  ORDER BY s.date_of_joining, s.created_at NULLS LAST, s.id
                )::text, 3, '0') AS new_code
    FROM public.staff s
    JOIN public.employment_categories ec ON ec.id = s.category_id
    JOIN public.institutions          i  ON i.id  = s.institution_id
    WHERE coalesce(s.is_active, false)
  )
  UPDATE public.staff s
  SET staff_id = r.new_code
  FROM ranked r
  WHERE r.id = s.id;

  -- Nothing may survive on a placeholder; if the join above missed a row it
  -- would keep ~TMP~ forever, which is worse than failing here.
  SELECT count(*) INTO v_active   FROM public.staff WHERE coalesce(is_active,false);
  SELECT count(*) INTO v_assigned FROM public.staff
   WHERE coalesce(is_active,false) AND staff_id IS NOT NULL AND staff_id NOT LIKE '~TMP~%';

  IF v_active <> v_assigned THEN
    RAISE EXCEPTION 'Staff ID backfill incomplete: % active staff but only % assigned a code.',
      v_active, v_assigned USING ERRCODE = 'P0001';
  END IF;

  -- 5. Record what changed, for everyone.
  INSERT INTO public.staff_id_crosswalk
    (staff_uuid, full_name, institution_name, is_teaching, is_active, old_staff_id, new_staff_id)
  SELECT s.id,
         btrim(coalesce(s.first_name,'') || ' ' || coalesce(s.last_name,'')),
         i.name, ec.is_teaching, coalesce(s.is_active,false),
         s.legacy_staff_id, s.staff_id
  FROM public.staff s
  JOIN public.institutions          i  ON i.id  = s.institution_id
  JOIN public.employment_categories ec ON ec.id = s.category_id
  ON CONFLICT (staff_uuid) DO UPDATE
    SET old_staff_id = EXCLUDED.old_staff_id,
        new_staff_id = EXCLUDED.new_staff_id,
        migrated_at  = now();

  -- 6. Point each counter at the next free number. Numbering is dense from 1,
  --    so count + 1 is the next code — the first new hire continues the
  --    sequence instead of restarting at 001.
  INSERT INTO public.staff_id_counters (institution_id, is_teaching, next_seq)
  SELECT s.institution_id, ec.is_teaching, count(*) + 1
  FROM public.staff s
  JOIN public.employment_categories ec ON ec.id = s.category_id
  WHERE coalesce(s.is_active, false)
  GROUP BY 1, 2
  ON CONFLICT (institution_id, is_teaching) DO UPDATE
    SET next_seq = EXCLUDED.next_seq, updated_at = now();

  ALTER TABLE public.staff ENABLE TRIGGER trg_sync_staff_to_profiles;
  ALTER TABLE public.staff ENABLE TRIGGER trg_staff_autonumber;
  ALTER TABLE public.staff ENABLE TRIGGER update_staff_updated_at;
END
$mig$;

-- ── Crosswalk view for HR ────────────────────────────────────────────────────
-- security_invoker so it inherits the underlying table's policy rather than
-- handing every reader the whole staff list.

CREATE OR REPLACE VIEW public.v_staff_id_crosswalk
WITH (security_invoker = true) AS
SELECT full_name,
       institution_name,
       CASE WHEN is_teaching THEN 'Teaching' ELSE 'Non-teaching' END AS staff_type,
       CASE WHEN is_active   THEN 'Active'   ELSE 'Inactive'     END AS status,
       old_staff_id,
       new_staff_id,
       migrated_at
FROM public.staff_id_crosswalk;

COMMENT ON VIEW public.v_staff_id_crosswalk IS
  'Readable old -> new staff ID mapping for HR to export and circulate.';

-- Explicit, even though the view is security_invoker and the table beneath it is
-- locked: a view does NOT inherit the underlying table's RLS, so if anyone ever
-- drops the security_invoker option this becomes an anon-readable dump of every
-- staff member's name, institution and old/new ID.
REVOKE ALL ON TABLE public.v_staff_id_crosswalk FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.v_staff_id_crosswalk TO authenticated;

COMMIT;
