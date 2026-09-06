-- Standardise staff.state and staff.district onto the lib/data/locations.ts
-- vocabulary, so the form can offer them as dropdowns.
--
-- WHY THIS RUNS BEFORE THE UI CHANGE. A fixed picker blanks any stored value it
-- does not recognise, and once the field is required the operator's only way to
-- save an unrelated edit is to pick a different value — silently destroying a
-- correct address. Cleaning the data first is what makes a required picker safe.
--
-- WHAT WAS IN THERE. 678 staff spelled "Tamil Nadu" nine different ways; the
-- District column held 50 distinct values for ~20 real districts (Namakkal alone
-- appeared eight ways), plus taluks (KUMARAPALAYAM, Gobichettipalayam,
-- sangagiri), a state (TamilNadu), and junk (qsqs, aqdqw, se).
--
-- Matching is on a normalised key — uppercased with all whitespace removed — so
-- 'Tamil Nadu', 'TAMILNADU' and 'tamil nadu' collapse to one comparison. Values
-- also carry trailing spaces ('Dharmapuri ', 'komarapalayam(TK), '), hence
-- btrim before storing.
--
-- NOTHING IS GUESSED. Two rows are corrected from evidence in their own address
-- column and are called out below; everything unmappable is set NULL and listed
-- by the report at the end, never inferred.

BEGIN;

-- Snapshot first: this is the only way back.
CREATE TABLE IF NOT EXISTS public.staff_address_backfill_20260828 AS
SELECT id, staff_id, first_name, last_name, state AS old_state, district AS old_district, address
FROM public.staff;

ALTER TABLE public.staff_address_backfill_20260828 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.staff_address_backfill_20260828 FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.staff_address_backfill_20260828 TO authenticated;

DROP POLICY IF EXISTS staff_address_backfill_select_super_admin ON public.staff_address_backfill_20260828;
CREATE POLICY staff_address_backfill_select_super_admin
  ON public.staff_address_backfill_20260828 FOR SELECT TO authenticated
  USING (public.is_super_admin());

DO $mig$
DECLARE
  v_state_fixed    integer;
  v_district_fixed integer;
  v_nulled         integer;
BEGIN
  -- An unguarded 683-row UPDATE would fire trg_sync_staff_to_profiles for every
  -- row and mirror ~10 columns into profiles, including re-enabling logins that
  -- were deliberately disabled. staff_id is untouched here, so the autonumber
  -- guard would not fire — but it is disabled anyway for symmetry with the
  -- other bulk migrations.
  ALTER TABLE public.staff DISABLE TRIGGER trg_sync_staff_to_profiles;
  ALTER TABLE public.staff DISABLE TRIGGER update_staff_updated_at;

  -- ── Unicode whitespace first ──────────────────────────────────────────────
  -- One row stored 'Tamil<U+00A0>Nadu' — a NON-BREAKING SPACE, which renders
  -- identically to a normal space and is invisible in every UI. Postgres's \s
  -- does not match it, so it survived every normalisation below and produced a
  -- second, byte-distinct 'Tamil Nadu'. Left alone it would have blanked that
  -- one person's picker and forced an operator to overwrite a correct address.
  UPDATE public.staff
  SET state    = regexp_replace(state,    '[  -​  　]+', ' ', 'g'),
      district = regexp_replace(district, '[  -​  　]+', ' ', 'g')
  WHERE state    ~ '[  -​  　]'
     OR district ~ '[  -​  　]';

  -- ── Row-specific corrections, evidence-backed ─────────────────────────────

  -- The two columns are SWAPPED on this row: state='Dharmapuri',
  -- district='Tamil Nadu'. Its address ("Pappireddipatti", a taluk of
  -- Dharmapuri district) confirms which way round it belongs.
  UPDATE public.staff
  SET state = 'Tamil Nadu', district = 'Dharmapuri'
  WHERE upper(regexp_replace(coalesce(state,''), '\s+', '', 'g'))    = 'DHARMAPURI'
    AND upper(regexp_replace(coalesce(district,''), '\s+', '', 'g')) = 'TAMILNADU';

  -- State in the district column, but the address spells the district out:
  -- "Teacher's Colony, Kumarapalayam, Namakkal District".
  UPDATE public.staff
  SET district = 'Namakkal'
  WHERE upper(regexp_replace(coalesce(district,''), '\s+', '', 'g')) = 'TAMILNADU'
    AND address ILIKE '%namakkal district%';

  -- ── State ─────────────────────────────────────────────────────────────────
  UPDATE public.staff SET state = v.canonical
  FROM (VALUES
    ('TAMILNADU',          'Tamil Nadu'),
    ('TAMINADU',           'Tamil Nadu'),   -- 'TAMINADU', 'TAMI NADU'
    ('TAMILMADU',          'Tamil Nadu'),
    ('KOMARAPALAYAM(TK),', 'Tamil Nadu'),   -- a taluk typed into the state box
    ('KARNATAKA',          'Karnataka'),
    ('KERALA',             'Kerala')
  ) AS v(key, canonical)
  WHERE upper(regexp_replace(coalesce(staff.state,''), '\s+', '', 'g')) = v.key
    AND staff.state IS DISTINCT FROM v.canonical;
  GET DIAGNOSTICS v_state_fixed = ROW_COUNT;

  -- ── District ──────────────────────────────────────────────────────────────
  -- Taluks are mapped to their parent district (Kumarapalayam -> Namakkal,
  -- Gobichettipalayam -> Erode, Sankagiri -> Salem): the taluk IS in that
  -- district, so this is a widening, not a guess.
  UPDATE public.staff SET district = v.canonical
  FROM (VALUES
    ('NAMAKKAL',        'Namakkal'),
    ('NAMMAKAL',        'Namakkal'),
    ('NAMMAKKAL',       'Namakkal'),
    ('NMAKKAL',         'Namakkal'),
    ('NAMAKKAL(DT)',    'Namakkal'),
    ('KUMARAPALAYAM',   'Namakkal'),
    ('ERODE',           'Erode'),
    ('ERODEDISTRICT',   'Erode'),
    ('GOBICHETTIPALAYAM','Erode'),
    ('SALEM',           'Salem'),
    ('SANGAGIRI',       'Salem'),
    ('TIRUPPUR',        'Tiruppur'),
    ('TIRUPUR',         'Tiruppur'),
    ('TIRPPUR',         'Tiruppur'),
    ('TRICHY',          'Tiruchirappalli'),
    ('TIRUCHIRAPALLI',  'Tiruchirappalli'),
    ('THIRUVAUR',       'Tiruvarur'),
    ('VIRUTHUNAGAR',    'Virudhunagar'),
    ('VIRUDHUNAGAR',    'Virudhunagar'),
    ('THENILGIRIS',     'Nilgiris'),
    ('NILGIRIS',        'Nilgiris'),
    ('KARUR',           'Karur'),
    ('COIMBATORE',      'Coimbatore'),
    ('MADURAI',         'Madurai'),
    ('VELLORE',         'Vellore'),
    ('THOOTHUKUDI',     'Thoothukudi'),
    ('TIRUNELVELI',     'Tirunelveli'),
    ('THANJAVUR',       'Thanjavur'),
    ('DHARMAPURI',      'Dharmapuri'),
    ('DINDIGUL',        'Dindigul'),
    ('CUDDALORE',       'Cuddalore'),
    ('MAYILADUTHURAI',  'Mayiladuthurai'),
    ('RAMANATHAPURAM',  'Ramanathapuram'),
    ('CHAMARAJNAGAR',   'Chamarajanagar'),  -- added to locations.ts for this row
    ('KOTTAYAM',        'Kottayam')         -- ditto
  ) AS v(key, canonical)
  WHERE upper(regexp_replace(coalesce(staff.district,''), '\s+', '', 'g')) = v.key
    AND staff.district IS DISTINCT FROM v.canonical;
  GET DIAGNOSTICS v_district_fixed = ROW_COUNT;

  -- ── Unmappable -> NULL ────────────────────────────────────────────────────
  -- 'qsqs'/'aqdqw'/'se' are keyboard noise; a bare state name in the district
  -- column carries no district information. NULL is honest; a guess is not.
  UPDATE public.staff SET state = NULL
  WHERE upper(regexp_replace(coalesce(state,''), '\s+', '', 'g')) IN ('QSQS');

  UPDATE public.staff SET district = NULL
  WHERE upper(regexp_replace(coalesce(district,''), '\s+', '', 'g')) IN ('AQDQW', 'SE', 'TAMILNADU');
  GET DIAGNOSTICS v_nulled = ROW_COUNT;

  -- Trim the residue so trailing spaces can never re-fork a canonical value.
  UPDATE public.staff SET state = nullif(btrim(state), '') WHERE state IS DISTINCT FROM nullif(btrim(state), '');
  UPDATE public.staff SET district = nullif(btrim(district), '') WHERE district IS DISTINCT FROM nullif(btrim(district), '');

  ALTER TABLE public.staff ENABLE TRIGGER trg_sync_staff_to_profiles;
  ALTER TABLE public.staff ENABLE TRIGGER update_staff_updated_at;

  RAISE NOTICE 'Address standardisation: % state rows, % district rows, % districts nulled',
    v_state_fixed, v_district_fixed, v_nulled;
END
$mig$;

COMMIT;
