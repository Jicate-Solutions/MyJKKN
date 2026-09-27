-- ============================================================================
-- staff.first_name / last_name -> strip leading salutations (MR/MRS/MS/MISS/DR)
-- ----------------------------------------------------------------------------
-- WHY
--   449 of 884 staff first names carried a salutation typed into the name
--   itself: DR. (150), MRS. (144), MR. (92), MISS. (53), MS. (10), and one
--   'MRS. DR. PARAMESWARI'. The title is not part of the name; it pollutes
--   sorting, exports, duplicate checks and profiles.full_name (synced from
--   staff). No last_name carried one, and none appeared mid/end of a name.
--
-- HOW
--   Extends fn_canonical_staff_name() (20260910120000_staff_name_uppercase.sql)
--   so the existing trigger trg_normalize_staff_names strips any run of leading
--   titles on every insert/update — form, bulk upload and API alike. A title
--   only matches when followed by '.' or whitespace, so names such as DRAVID or
--   MISSIYA are untouched. Leading initials ('MR. A. KUMAR' -> 'A. KUMAR') are
--   kept. If stripping would leave nothing (a name that is only 'DR.'), the
--   value is kept as-is rather than blanking a NOT NULL column.
--
--   The function stays IMMUTABLE and idempotent (f(f(x)) = f(x)) because the
--   staff_*_name_canonical CHECK constraints call it; they are re-validated at
--   the end.
--
--   Trigger order is unchanged: trg_normalize_staff_names still sorts before
--   trg_sync_staff_to_profiles, so profiles.full_name follows automatically.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_canonical_staff_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH n AS (
    SELECT regexp_replace(btrim(p_name), '\s+', ' ', 'g') AS v
  )
  SELECT CASE
           WHEN p_name IS NULL THEN NULL
           ELSE upper(coalesce(
                  nullif(btrim(regexp_replace(n.v, '^((MRS|MR|MS|MISS|DR)(\.\s*|\s+))+', '', 'i')), ''),
                  n.v))
         END
    FROM n;
$function$;

COMMENT ON FUNCTION public.fn_canonical_staff_name(text) IS
  'Canonical staff-name form: trim ends, collapse internal whitespace, strip leading salutations (MR/MRS/MS/MISS/DR followed by "." or space), uppercase. IMMUTABLE + idempotent so CHECK constraints may call it.';

-- ---------------------------------------------------------------------------
-- Backfill. Same precedent as 20260910120000: updated_at is not bumped for a
-- change no human made. trg_sync_staff_to_profiles stays enabled so
-- profiles.full_name is cleaned in the same statement.
-- ---------------------------------------------------------------------------
ALTER TABLE public.staff DISABLE TRIGGER update_staff_updated_at;

UPDATE public.staff
   SET first_name = public.fn_canonical_staff_name(first_name),
       last_name  = public.fn_canonical_staff_name(last_name)
 WHERE first_name IS DISTINCT FROM public.fn_canonical_staff_name(first_name)
    OR last_name  IS DISTINCT FROM public.fn_canonical_staff_name(last_name);

ALTER TABLE public.staff ENABLE TRIGGER update_staff_updated_at;

-- Re-validate the CHECK constraints against the new definition.
ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_first_name_canonical,
  DROP CONSTRAINT IF EXISTS staff_last_name_canonical;

ALTER TABLE public.staff
  ADD CONSTRAINT staff_first_name_canonical
    CHECK (first_name IS NULL OR first_name = public.fn_canonical_staff_name(first_name)),
  ADD CONSTRAINT staff_last_name_canonical
    CHECK (last_name IS NULL OR last_name = public.fn_canonical_staff_name(last_name));

DO $assert$
DECLARE
  v_titled int;
BEGIN
  SELECT count(*) INTO v_titled
    FROM public.staff
   WHERE first_name ~* '^(MRS|MR|MS|MISS|DR)(\.|\s)'
      OR last_name  ~* '^(MRS|MR|MS|MISS|DR)(\.|\s)';
  IF v_titled > 0 THEN
    RAISE EXCEPTION 'title strip incomplete: % staff row(s) still start with a salutation', v_titled;
  END IF;
  RAISE NOTICE 'staff name title strip: OK';
END
$assert$;
