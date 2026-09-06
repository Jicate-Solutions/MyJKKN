-- Staff ID standardisation — primitives (column, counters, generator, trigger).
--
-- WHY THIS EXISTS. staff_id was typed by hand, and the staff create form has no
-- Staff ID input at all — so every staff member created through the UI got
-- none. 187 of 868 rows (182 of them active) were blank, and the gap grew with
-- every hire. The 681 that had a code used 38 different prefixes across 14
-- institutions, with numbers from 1 to 20021169440 and junk values like
-- 'SADADASDASDASDADAS' and 'RAGUL444'.
--
-- NOTE the premise this corrects: staff_id was ALREADY globally unique
-- (staff_staff_id_key) with zero exact duplicates. A unique index permits
-- unlimited NULLs, so the blank rows coexisted and rendered identically in the
-- UI — which is what "many staff share an ID" looked like on screen. The
-- problem was absent and malformed IDs, never duplicates.
--
-- THE SCHEME (confirmed with the user 2026-08-28):
--   teaching      <PREFIX><NNN>       e.g. DCH001
--   non-teaching  NOT<PREFIX><NNN>    e.g. NOTDCH001
-- numbered per institution x teaching bucket, ordered by seniority, issued to
-- ACTIVE staff only, and PERMANENT once issued — no override for anyone,
-- including super admins.
--
-- The teaching split reads employment_categories.is_teaching (populated for
-- 868/868). staff.role_type and staff.employment_type are constant for every
-- row in the table and cannot discriminate anything.

BEGIN;

-- ── 1. Institution prefix ────────────────────────────────────────────────────
-- institutions has no code column of any kind; counselling_code and iqac_code
-- are unrelated external identifiers. This is a new, dedicated field.

ALTER TABLE public.institutions
  ADD COLUMN IF NOT EXISTS staff_code_prefix text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.institutions'::regclass
      AND conname  = 'institutions_staff_code_prefix_chk'
  ) THEN
    ALTER TABLE public.institutions
      ADD CONSTRAINT institutions_staff_code_prefix_chk
      CHECK (staff_code_prefix ~ '^[A-Z]{2,8}$');
  END IF;
END $$;

-- Load-bearing: two institutions sharing a prefix would interleave into a
-- single number line and hand the same code to two different people.
CREATE UNIQUE INDEX IF NOT EXISTS institutions_staff_code_prefix_uq
  ON public.institutions (staff_code_prefix)
  WHERE staff_code_prefix IS NOT NULL;

COMMENT ON COLUMN public.institutions.staff_code_prefix IS
  'Institution code used to generate staff IDs (DCH -> DCH001 teaching, NOTDCH001 non-teaching). '
  'Changing it does NOT rewrite codes already issued — those are permanent — so a later edit only '
  'affects staff created afterwards.';

-- Seeded by id, not name: names get edited, ids do not. Codes come from the
-- dominant existing prefix per institution, except the four that had no
-- consistent code at all (JMO, AATS, JIC, JTI).
UPDATE public.institutions i
SET staff_code_prefix = v.code
FROM (VALUES
  ('e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid, 'DCH'),   -- Dental College and Hospital
  ('5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334'::uuid, 'COP'),   -- College of Pharmacy
  ('5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'CET'),   -- Engineering and Technology
  ('b0b8a724-7c65-4f07-8047-2a38e8100ad5'::uuid, 'CAS'),   -- Arts and Science (Self)
  ('a33138b6-4eea-4675-941f-1071bf88b127'::uuid, 'AATS'),  -- Arts and Science (Aided); 13 dept prefixes today
  ('9c1554e8-12a2-4b76-a9d6-8242bb05eba1'::uuid, 'AHS'),   -- Allied Health Sciences
  ('70e54e51-9b98-4e07-9534-a85310609bfd'::uuid, 'CNR'),   -- Nursing and Research
  ('e04b8a7f-1445-4ef1-92e9-bde3d32b1f44'::uuid, 'MHS'),   -- Matric Higher Secondary School
  ('29c221d1-b918-4c46-9d67-857273b0b553'::uuid, 'NV'),    -- Nattraja Vidhyalya CBSE
  ('9380358f-7020-4c23-89c3-e9538b47cf33'::uuid, 'COE'),   -- College of Education
  ('479eac7f-3e5b-479e-bd91-dee9e0186b9b'::uuid, 'JIC'),   -- Jicate Solutions
  ('b962527f-97ce-4238-89ce-7b532d7c2bc6'::uuid, 'JMO'),   -- Main Office (mixed NOT/SG/COE today)
  ('183847c5-be1b-4903-86eb-bbc20c213071'::uuid, 'JTI'),   -- Testing Institution
  ('550fc158-b059-448a-b61f-f4179752989b'::uuid, 'NIF')    -- Nattraja Incubation Forum
) AS v(id, code)
WHERE i.id = v.id
  AND i.staff_code_prefix IS DISTINCT FROM v.code;

-- ── 2. Legacy code retention ─────────────────────────────────────────────────
-- 681 people's codes change in the backfill. Without this column their old code
-- becomes unfindable, and every historical export, printed record and legacy
-- import sheet that quotes it turns into a dead end.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS legacy_staff_id text;

CREATE INDEX IF NOT EXISTS idx_staff_legacy_staff_id
  ON public.staff (legacy_staff_id)
  WHERE legacy_staff_id IS NOT NULL;

COMMENT ON COLUMN public.staff.legacy_staff_id IS
  'The hand-entered staff_id this person held before the 2026-08-28 standardisation. '
  'Searchable so an old code still finds the right person. Never written by the app.';

-- ── 3. Counter table ─────────────────────────────────────────────────────────
-- One row per (institution, teaching bucket). Claiming a number is a single
-- atomic upsert, so concurrent inserts cannot collide — no MAX()+1 race and no
-- retry-on-collision loop of the kind resource codes needed.

CREATE TABLE IF NOT EXISTS public.staff_id_counters (
  institution_id uuid        NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  is_teaching    boolean     NOT NULL,
  next_seq       integer     NOT NULL DEFAULT 1 CHECK (next_seq > 0),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (institution_id, is_teaching)
);

COMMENT ON TABLE public.staff_id_counters IS
  'Next sequence number per institution x teaching bucket for staff ID generation. '
  'Written only by fn_next_staff_code (SECURITY DEFINER); there is no policy granting '
  'any user a direct write.';

ALTER TABLE public.staff_id_counters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staff_id_counters FROM anon;
GRANT SELECT ON public.staff_id_counters TO authenticated;

DROP POLICY IF EXISTS staff_id_counters_select_super_admin ON public.staff_id_counters;
CREATE POLICY staff_id_counters_select_super_admin
  ON public.staff_id_counters FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- ── 4. Generator ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_next_staff_code(
  p_institution_id uuid,
  p_is_teaching    boolean
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prefix text;
  v_full   text;
  v_seq    integer;
  v_code   text;
  v_guard  integer := 0;
BEGIN
  IF p_institution_id IS NULL THEN
    RAISE EXCEPTION 'Cannot issue a staff ID: this staff member has no institution.'
      USING ERRCODE = 'P0001';
  END IF;

  -- NULL here means the employment category did not resolve, so we cannot tell
  -- teaching from non-teaching. Refusing beats guessing: a wrong bucket is a
  -- wrong permanent code.
  IF p_is_teaching IS NULL THEN
    RAISE EXCEPTION 'Cannot issue a staff ID: this staff member has no employment category, so teaching / non-teaching is unknown.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT i.staff_code_prefix INTO v_prefix
  FROM public.institutions i WHERE i.id = p_institution_id;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Cannot issue a staff ID: institution % has no staff_code_prefix configured.', p_institution_id
      USING ERRCODE = 'P0001';
  END IF;

  v_full := CASE WHEN p_is_teaching THEN v_prefix ELSE 'NOT' || v_prefix END;

  LOOP
    v_guard := v_guard + 1;
    IF v_guard > 5000 THEN
      RAISE EXCEPTION 'Could not find a free staff ID for prefix % after 5000 attempts.', v_full
        USING ERRCODE = 'P0001';
    END IF;

    -- Atomic claim. On the INSERT path next_seq lands at 2 so this returns 1;
    -- on the UPDATE path it returns the freshly incremented value minus one.
    INSERT INTO public.staff_id_counters AS c (institution_id, is_teaching, next_seq)
    VALUES (p_institution_id, p_is_teaching, 2)
    ON CONFLICT (institution_id, is_teaching)
      DO UPDATE SET next_seq = c.next_seq + 1, updated_at = now()
    RETURNING c.next_seq - 1 INTO v_seq;

    -- Zero-padded to three digits; past 999 it simply widens to four rather
    -- than truncating. The largest bucket today is 120.
    v_code := v_full || lpad(v_seq::text, 3, '0');

    -- A legacy code may still be squatting on this value, so confirm it is
    -- genuinely free before handing it out.
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.staff_id = v_code);
  END LOOP;

  RETURN v_code;
END;
$$;

COMMENT ON FUNCTION public.fn_next_staff_code(uuid, boolean) IS
  'Claims and returns the next staff ID for an institution x teaching bucket. '
  'SECURITY DEFINER because staff_id_counters grants no direct writes.';

-- ── 5. Trigger: generate on creation, freeze forever after ───────────────────

CREATE OR REPLACE FUNCTION public.fn_staff_autonumber()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_teaching boolean;
BEGIN
  -- The edit form defaults this field to `staff?.staff_id || ''`, so a staff
  -- member with no code submits '' against a NULL OLD value. Without this
  -- normalisation the permanence guard below reads that as a manual edit and
  -- rejects every edit of an ID-less staff member.
  NEW.staff_id := nullif(btrim(coalesce(NEW.staff_id, '')), '');

  IF TG_OP = 'INSERT' THEN
    -- Active staff only. Anything the caller supplied is discarded: creation
    -- is never manual.
    IF coalesce(NEW.is_active, false) THEN
      SELECT ec.is_teaching INTO v_is_teaching
      FROM public.employment_categories ec WHERE ec.id = NEW.category_id;

      NEW.staff_id := public.fn_next_staff_code(NEW.institution_id, v_is_teaching);
    ELSE
      NEW.staff_id := NULL;
    END IF;

    RETURN NEW;
  END IF;

  -- UPDATE. One guard covers every manual path: changing a code, clearing a
  -- code, and setting a code on a row that has none. There is deliberately no
  -- super-admin escape hatch — correcting a wrong code requires a migration.
  IF NEW.staff_id IS DISTINCT FROM OLD.staff_id THEN
    RAISE EXCEPTION 'Staff ID is system-generated and permanent; it cannot be set or changed manually.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Rejoin path. Only reaches staff who never held a code — deactivation does
  -- NOT clear one, so a returning staff member keeps the code they had.
  IF coalesce(NEW.is_active, false)
     AND NOT coalesce(OLD.is_active, false)
     AND NEW.staff_id IS NULL THEN
    SELECT ec.is_teaching INTO v_is_teaching
    FROM public.employment_categories ec WHERE ec.id = NEW.category_id;

    NEW.staff_id := public.fn_next_staff_code(NEW.institution_id, v_is_teaching);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_autonumber ON public.staff;
CREATE TRIGGER trg_staff_autonumber
  BEFORE INSERT OR UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.fn_staff_autonumber();

COMMENT ON FUNCTION public.fn_staff_autonumber() IS
  'Issues a staff ID on creation (active staff only) and freezes it thereafter. '
  'Bulk backfills must DISABLE TRIGGER trg_staff_autonumber — the permanence guard '
  'blocks any rewrite, including their own.';

-- ── 6. Lock both SECURITY DEFINER functions away from the REST API ───────────
-- Without this, PostgREST publishes them at /rest/v1/rpc/<name> and Supabase's
-- default grants make them callable by anon. fn_next_staff_code CLAIMS a number
-- on every call, so an anonymous caller could burn the sequence and tear
-- permanent gaps in the numbering.
--
-- REVOKE FROM PUBLIC alone is not enough: Supabase grants EXECUTE directly to
-- the anon and authenticated roles, and those survive a PUBLIC revoke.
--
-- Neither needs a grant back. fn_next_staff_code is only ever called from inside
-- fn_staff_autonumber, which is SECURITY DEFINER and therefore runs as the
-- owner; and Postgres checks EXECUTE on a trigger function when the trigger is
-- CREATEd, not when it fires — so the trigger keeps working with no grantee.
REVOKE ALL ON FUNCTION public.fn_next_staff_code(uuid, boolean) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.fn_staff_autonumber() FROM anon, authenticated, PUBLIC;

COMMIT;
