-- supabase/migrations/20260816010000_institution_accreditation_bodies.sql
-- ===========================================================================
-- Which awarding bodies apply to which institution — Director decisions,
-- 2026-08-06 (artifacts/awarding-body-mapping-2026-08-06.md).
--
-- RENAME-SAFE: 20260814020000 -> 20260816010000 — renumbered 2026-08-06 to
-- clear a three-way version collision. While this PR was open, two other
-- branches merged their own 20260814020000_* files to main
-- (restore_user_has_permission_execute_grant, upgrade_frees_old_bed), so
-- keeping this stamp would have put THREE files on one version.
-- Being explicit, because the usual guidance is the opposite: this file HAS
-- already run in production (applied by hand via the Management API on
-- 2026-08-06, Director-approved, verified by catalog). It is renumbered
-- rather than the other two because those are already merged to main and
-- this one is not, and because re-running this file is a genuine no-op —
-- both tables are CREATE TABLE IF NOT EXISTS, every policy is DROP POLICY
-- IF EXISTS before CREATE, the index is CREATE INDEX IF NOT EXISTS, both
-- seeds end in ON CONFLICT DO NOTHING, the CHECK-to-FK swap tests for the
-- constraint before touching it, and the file contains zero DELETE,
-- TRUNCATE or DROP TABLE statements. The hazard the rename guard exists to
-- prevent — a re-apply rolling DROP + CREATE back over live data — has no
-- statement here to act on.
--
-- ✅ APPLIED TO PRODUCTION 2026-08-06 (was FILE ONLY when first written).
-- Rehearsed in BEGIN..ROLLBACK with residue verified 0 in a separate call,
-- then applied and verified by catalog: 2 tables, 6 FKs, 0 hardcoded
-- ten-value CHECK constraints left, 15 bodies, 35 mappings, and anon
-- holding no grant on either new table.
-- Every reader of the new tables treats their absence as "not provisioned"
-- and falls back to today's behaviour, so the code half is safe to deploy
-- independently of this file.
--
-- WHAT IS BROKEN
-- ---------------------------------------------------------------------------
-- /accreditation/manage/owners shows ALL TEN awarding bodies to EVERY
-- institution. JKKN College of Engineering is asked to name an accountable
-- person for Dental Council, Pharmacy Council, Nursing Council and
-- teacher-education metrics.
--
-- That is a WRONG DENOMINATOR, not clutter. Seven of the 107 active metrics
-- (DCI 2 + INC 2 + PCI 2 + NCTE 1) can never apply to an engineering college,
-- so "0 of 107" is unreachable by construction and that college can never
-- show 100%. A target nobody can hit is a target nobody aims at.
--
-- WHY IT COULD NOT SIMPLY BE FILTERED
-- ---------------------------------------------------------------------------
-- The data to filter by does not exist. Verified live 2026-08-06:
--   * No institution-to-body mapping table exists anywhere in the schema.
--     (`bos_body_types` is Board of Studies COMMITTEE types — unrelated.)
--   * `institutions` records institution_type / category / entity_type and
--     NOTHING that records what discipline a college teaches. Discipline
--     lives only inside the institution's NAME.
--   * The 107 metrics live in `sh_accreditation_metrics`, where `metric_type`
--     IS the awarding body — there is no `body_code` column on that table.
--
-- WHY TWO TABLES AND NOT A CASE STATEMENT
-- ---------------------------------------------------------------------------
-- docs/architecture/config-table-pattern.md, locked 2026-04-29: every mapping
-- a super-admin might tweak — even once — gets a row, not a constant. Both
-- halves fail the value-list test twice over: a college may take up a new
-- body, and a new body may appear that nobody has heard of today. Five of the
-- fifteen bodies seeded below did not exist in this system this morning.
--
-- The registry also REPLACES five hardcoded CHECK constraints that each
-- enumerate the same ten codes. That is the point of §2: a new awarding body
-- must never again require a migration, and five copies of one list is four
-- opportunities for them to disagree.
--
-- WRITES NO LEARNER DATA. Creates two tables, seeds them, and swaps five
-- CHECK constraints for foreign keys. Deletes nothing.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- §0  Refuse to apply against a database that cannot hold this.
--
-- `institutions` is the FK target; `role_has_institution_access` and
-- `user_has_permission` are what the RLS policies below call. A migration
-- that half-applies against a database missing one of them leaves a table
-- with policies that raise instead of a table with policies that scope.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.institutions') IS NULL THEN
    RAISE EXCEPTION 'REFUSING TO APPLY: public.institutions is absent.';
  END IF;
  IF to_regprocedure('public.role_has_institution_access(uuid)') IS NULL THEN
    RAISE EXCEPTION 'REFUSING TO APPLY: role_has_institution_access(uuid) is absent.';
  END IF;
  IF to_regprocedure('public.user_has_permission(text)') IS NULL THEN
    RAISE EXCEPTION 'REFUSING TO APPLY: user_has_permission(text) is absent.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- §1  The awarding body registry.
--
-- `code` is the primary key rather than a surrogate uuid, deliberately: every
-- existing consumer already stores the code as text (`body_code` on five
-- tables, `metric_type` on the framework), and a uuid PK would mean rewriting
-- all of them or carrying a join nobody asked for. The code IS the identity.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accreditation_bodies (
  code        text PRIMARY KEY,
  name        text NOT NULL,
  short_name  text,
  -- Kept as a CHECK and not a table of its own: this set is closed by what a
  -- body IS, not by policy. A fourth kind would be a genuine schema question.
  kind        text NOT NULL DEFAULT 'indian_regulator'
                CHECK (kind IN ('indian_regulator', 'international_ranking', 'school_board')),
  source_url  text,
  notes       text,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.accreditation_bodies IS
  'Registry of every awarding / ranking / regulatory body JKKN answers to. Replaces five hardcoded CHECK constraints that each enumerated the same ten codes — a new body is now one INSERT, with no migration and no deploy. `code` is the PK because every consumer already stores the code as text.';

COMMENT ON COLUMN public.accreditation_bodies.is_active IS
  'false = retired. Never DELETE a body: five tables reference these codes and the evidence filed under a retired body is still a historical fact.';

-- Seed: the ten that already exist, plus the five the Director added
-- 2026-08-06. ON CONFLICT DO NOTHING so a re-run is a no-op and so a code
-- somebody has since edited by hand is not silently reverted.
INSERT INTO public.accreditation_bodies (code, name, short_name, kind, source_url, notes, sort_order)
VALUES
  ('NAAC',   'National Assessment and Accreditation Council',            'NAAC',   'indian_regulator',      'https://www.naac.gov.in/',  NULL, 10),
  ('UGC',    'University Grants Commission',                             'UGC',    'indian_regulator',      'https://www.ugc.gov.in/',   NULL, 20),
  ('NIRF',   'National Institutional Ranking Framework',                 'NIRF',   'indian_regulator',      'https://www.nirfindia.org/',NULL, 30),
  ('NBA',    'National Board of Accreditation',                          'NBA',    'indian_regulator',      'https://www.nbaind.org/',   NULL, 40),
  ('AICTE',  'All India Council for Technical Education',                'AICTE',  'indian_regulator',      'https://www.aicte-india.org/', NULL, 50),
  ('NCTE',   'National Council for Teacher Education',                   'NCTE',   'indian_regulator',      'https://ncte.gov.in/',      NULL, 60),
  ('DCI',    'Dental Council of India',                                  'DCI',    'indian_regulator',      'https://dciindia.gov.in/',  NULL, 70),
  ('PCI',    'Pharmacy Council of India',                                'PCI',    'indian_regulator',      'https://www.pci.nic.in/',   NULL, 80),
  ('INC',    'Indian Nursing Council',                                   'INC',    'indian_regulator',      'https://www.indiannursingcouncil.org/', NULL, 90),
  -- NEW 2026-08-06. None of the five has any metric defined yet; creating the
  -- body is the small half and defining what it measures is the real work,
  -- scoped separately. The UI says "no metrics defined yet" rather than
  -- rendering an empty body as a finished one.
  ('NCAHP',  'National Commission for Allied and Healthcare Professions', 'NCAHP',  'indian_regulator',      'https://ncahp.abdm.gov.in/',
   'Added 2026-08-06 for JKKN College of Allied Health Sciences. No metrics defined yet.', 100),
  ('QS',     'QS World University Rankings',                             'QS',     'international_ranking', 'https://www.topuniversities.com/', NULL, 110),
  ('THE',    'Times Higher Education',                                   'THE',    'international_ranking', 'https://www.timeshighereducation.com/',
   'Added 2026-08-06 for both Arts and Science colleges. No metrics defined yet.', 120),
  ('ABET',   'Accreditation Board for Engineering and Technology',       'ABET',   'international_ranking', 'https://www.abet.org/',
   'Added 2026-08-06 for JKKN College of Engineering and Technology, chosen over the ranking route deliberately (Director decision 5). US body. No metrics defined yet.', 130),
  ('CBSE',   'Central Board of Secondary Education',                     'CBSE',   'school_board',          'https://www.cbse.gov.in/',
   'Added 2026-08-06 for Nattraja Vidhyalya. NAAC does not accredit schools (Director decision 3). No metrics defined yet.', 140),
  ('MATRIC', 'State Matric Board',                                       'MATRIC', 'school_board',          NULL,
   'Added 2026-08-06 for JKKN Matric Higher Secondary School. ⚠️ THE EXACT OFFICIAL NAME IS STILL UNCONFIRMED — "State Matric Board" is a working label supplied by the Director, not the registered name of the board. Confirm with the Director and correct `name` before this appears on anything filed. No metrics defined yet.', 150)
ON CONFLICT (code) DO NOTHING;

-- Supabase default-grants ALL on every new table to anon AND authenticated,
-- so a bare GRANT SELECT is a silent no-op that leaves INSERT/UPDATE/DELETE
-- in place. Revoke both first, then grant back only what is wanted.
-- DELETE is never granted: a retired body is deactivated, not destroyed.
REVOKE ALL ON TABLE public.accreditation_bodies FROM anon, PUBLIC, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.accreditation_bodies TO authenticated;

ALTER TABLE public.accreditation_bodies ENABLE ROW LEVEL SECURITY;

-- Every signed-in person may READ the registry. It is a vocabulary, not a
-- record: fifteen public regulator names carry nothing to protect, and every
-- accreditation screen needs to turn a stored code into a readable label.
DROP POLICY IF EXISTS accreditation_bodies_select ON public.accreditation_bodies;
CREATE POLICY accreditation_bodies_select ON public.accreditation_bodies
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS accreditation_bodies_insert ON public.accreditation_bodies;
CREATE POLICY accreditation_bodies_insert ON public.accreditation_bodies
  FOR INSERT TO authenticated
  WITH CHECK (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR COALESCE(public.user_has_permission('accreditation.bodies.manage'), false)
  );

DROP POLICY IF EXISTS accreditation_bodies_update ON public.accreditation_bodies;
CREATE POLICY accreditation_bodies_update ON public.accreditation_bodies
  FOR UPDATE TO authenticated
  USING (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR COALESCE(public.user_has_permission('accreditation.bodies.manage'), false)
  )
  WITH CHECK (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR COALESCE(public.user_has_permission('accreditation.bodies.manage'), false)
  );

-- ---------------------------------------------------------------------------
-- §2  Retire the five hardcoded CHECK constraints in favour of the registry.
--
-- Each of these is the SAME ten-value list written out again:
--   CHECK (body_code = ANY (ARRAY['NAAC','NIRF','NBA','QS','DCI','PCI',
--                                 'INC','AICTE','NCTE','UGC']))
-- With them in place, adding NCAHP requires a migration against five tables.
-- With a foreign key, it requires an INSERT.
--
-- Every existing value is one of the ten seeded above — the CHECK guaranteed
-- that until the moment it was dropped — so each FK validates without a
-- single failing row. Guarded per table with to_regclass because this
-- repository's migration ledger has diverged from the repository and a table
-- named here may not exist in every environment.
--
-- ON DELETE RESTRICT, and DELETE is not granted on the registry anyway: a
-- body with evidence filed under it must not be deletable by accident.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  targets text[] := ARRAY[
    'quality_evidence_mappings',
    'accreditation_committees',
    'accreditation_submissions',
    'accreditation_digest_config',
    'accreditation_metric_crosswalk'
  ];
  con record;
BEGIN
  FOREACH t IN ARRAY targets LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipping %: table absent in this database', t;
      CONTINUE;
    END IF;

    -- Drop by DEFINITION, not by name. The five constraints were created
    -- inline and carry auto-generated names, and one table (whose column list
    -- changed since) could plausibly have been renumbered to `_check1`.
    -- Matching on the expression finds it whatever it is called, and matching
    -- on `body_code` alone would have found the wrong one.
    FOR con IN
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.conrelid = ('public.' || t)::regclass
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) ILIKE '%body_code%'
        AND pg_get_constraintdef(c.oid) ILIKE '%NAAC%'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, con.conname);
      RAISE NOTICE 'dropped % on %', con.conname, t;
    END LOOP;

    -- Idempotent: skip if this file already ran.
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = ('public.' || t)::regclass
        AND conname = t || '_body_code_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (body_code) '
        || 'REFERENCES public.accreditation_bodies(code) ON UPDATE CASCADE ON DELETE RESTRICT',
        t, t || '_body_code_fkey'
      );
      RAISE NOTICE 'added FK on %', t;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- §3  The mapping — which bodies apply to which institution.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institution_accreditation_bodies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  body_code      text NOT NULL REFERENCES public.accreditation_bodies(code)
                   ON UPDATE CASCADE ON DELETE RESTRICT,
  is_active      boolean NOT NULL DEFAULT true,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT institution_accreditation_bodies_unique UNIQUE (institution_id, body_code)
);

COMMENT ON TABLE public.institution_accreditation_bodies IS
  'Which awarding bodies each institution answers to. Director decisions 2026-08-06. The ABSENCE of a row means the body does not apply — a college with no rows at all is not accredited by anybody (offices, companies), which the UI states in words rather than rendering as a blank page. Standard-subject rule: a college is mapped to the body it SHOULD answer to, even before any evidence exists for it.';

COMMENT ON COLUMN public.institution_accreditation_bodies.is_active IS
  'false = the institution no longer answers to this body. Kept rather than deleted so the record of what it once answered to survives; every reader filters on is_active.';

CREATE INDEX IF NOT EXISTS institution_accreditation_bodies_inst_idx
  ON public.institution_accreditation_bodies (institution_id)
  WHERE is_active = true;

REVOKE ALL ON TABLE public.institution_accreditation_bodies FROM anon, PUBLIC, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.institution_accreditation_bodies TO authenticated;

ALTER TABLE public.institution_accreditation_bodies ENABLE ROW LEVEL SECURITY;

-- Reads are institution-scoped by the same helper every other accreditation
-- table uses, so a strictly own-scoped HOD reads their own college's mapping
-- and nobody else's.
--
-- 🔴 The consequence is load-bearing and the UI must not misread it: RLS
-- denial here returns ZERO ROWS with error = null, and zero rows also means
-- "this institution answers to nobody". The readers therefore never infer
-- "not accredited" from an empty result alone — they only say so for an
-- institution the viewer is confirmed able to read.
DROP POLICY IF EXISTS institution_accreditation_bodies_select ON public.institution_accreditation_bodies;
CREATE POLICY institution_accreditation_bodies_select ON public.institution_accreditation_bodies
  FOR SELECT TO authenticated
  USING (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR COALESCE(public.role_has_institution_access(institution_id), false)
  );

-- Writes additionally need the management key. Both halves are required: the
-- key says you may edit a mapping, the institution scope says whose.
DROP POLICY IF EXISTS institution_accreditation_bodies_insert ON public.institution_accreditation_bodies;
CREATE POLICY institution_accreditation_bodies_insert ON public.institution_accreditation_bodies
  FOR INSERT TO authenticated
  WITH CHECK (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR (
      COALESCE(public.user_has_permission('accreditation.bodies.manage'), false)
      AND COALESCE(public.role_has_institution_access(institution_id), false)
    )
  );

DROP POLICY IF EXISTS institution_accreditation_bodies_update ON public.institution_accreditation_bodies;
CREATE POLICY institution_accreditation_bodies_update ON public.institution_accreditation_bodies
  FOR UPDATE TO authenticated
  USING (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR (
      COALESCE(public.user_has_permission('accreditation.bodies.manage'), false)
      AND COALESCE(public.role_has_institution_access(institution_id), false)
    )
  )
  WITH CHECK (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR (
      COALESCE(public.user_has_permission('accreditation.bodies.manage'), false)
      AND COALESCE(public.role_has_institution_access(institution_id), false)
    )
  );

DROP POLICY IF EXISTS institution_accreditation_bodies_delete ON public.institution_accreditation_bodies;
CREATE POLICY institution_accreditation_bodies_delete ON public.institution_accreditation_bodies
  FOR DELETE TO authenticated
  USING (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.is_admin(), false)
    OR (
      COALESCE(public.user_has_permission('accreditation.bodies.manage'), false)
      AND COALESCE(public.role_has_institution_access(institution_id), false)
    )
  );

-- ---------------------------------------------------------------------------
-- §4  Seed THE MAPPING (Director decisions, 2026-08-06).
--
-- Institution ids verified live on production 2026-08-06. Resolved through a
-- join to `institutions` rather than inserted blind, so an id that no longer
-- exists writes nothing instead of raising and taking the whole file down —
-- and so applying this against a database whose institutions differ produces
-- the mapping that database can actually hold.
--
-- ⚠️ UGC IS DELIBERATELY MAPPED TO NOBODY. It exists with 2 metrics and was
-- not picked for any college. Recorded as deliberately unmapped, not
-- forgotten: UGC oversight commonly sits at university rather than college
-- level. One INSERT to change if that is wrong.
--
-- The four non-colleges (Main Office, Jicate Solutions, Nattraja Incubation
-- Forum, Testing Institution) are absent by design — they are not accredited
-- by anybody, and the owners page says so in words rather than showing them a
-- blank list or bouncing them somewhere else.
-- ---------------------------------------------------------------------------
INSERT INTO public.institution_accreditation_bodies (institution_id, body_code)
SELECT m.institution_id, m.body_code
FROM (
  VALUES
    -- JKKN College of Engineering and Technology
    ('5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'NAAC'),
    ('5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'NIRF'),
    ('5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'NBA'),
    ('5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'AICTE'),
    ('5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'ABET'),
    -- JKKN College of Pharmacy
    ('5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334'::uuid, 'NAAC'),
    ('5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334'::uuid, 'NIRF'),
    ('5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334'::uuid, 'PCI'),
    ('5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334'::uuid, 'QS'),
    -- JKKN Dental College and Hospital
    ('e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid, 'NAAC'),
    ('e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid, 'NIRF'),
    ('e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid, 'DCI'),
    ('e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid, 'QS'),
    -- JKKN College of Nursing and Research
    ('70e54e51-9b98-4e07-9534-a85310609bfd'::uuid, 'NAAC'),
    ('70e54e51-9b98-4e07-9534-a85310609bfd'::uuid, 'NIRF'),
    ('70e54e51-9b98-4e07-9534-a85310609bfd'::uuid, 'INC'),
    ('70e54e51-9b98-4e07-9534-a85310609bfd'::uuid, 'QS'),
    -- JKKN College of Allied Health Sciences
    ('9c1554e8-12a2-4b76-a9d6-8242bb05eba1'::uuid, 'NAAC'),
    ('9c1554e8-12a2-4b76-a9d6-8242bb05eba1'::uuid, 'NIRF'),
    ('9c1554e8-12a2-4b76-a9d6-8242bb05eba1'::uuid, 'NCAHP'),
    ('9c1554e8-12a2-4b76-a9d6-8242bb05eba1'::uuid, 'QS'),
    -- JKKN College of Education
    ('9380358f-7020-4c23-89c3-e9538b47cf33'::uuid, 'NAAC'),
    ('9380358f-7020-4c23-89c3-e9538b47cf33'::uuid, 'NIRF'),
    ('9380358f-7020-4c23-89c3-e9538b47cf33'::uuid, 'NCTE'),
    ('9380358f-7020-4c23-89c3-e9538b47cf33'::uuid, 'QS'),
    -- JKKN College of Arts and Science (Aided)
    ('a33138b6-4eea-4675-941f-1071bf88b127'::uuid, 'NAAC'),
    ('a33138b6-4eea-4675-941f-1071bf88b127'::uuid, 'NIRF'),
    ('a33138b6-4eea-4675-941f-1071bf88b127'::uuid, 'QS'),
    ('a33138b6-4eea-4675-941f-1071bf88b127'::uuid, 'THE'),
    -- JKKN College of Arts and Science (Self)
    ('b0b8a724-7c65-4f07-8047-2a38e8100ad5'::uuid, 'NAAC'),
    ('b0b8a724-7c65-4f07-8047-2a38e8100ad5'::uuid, 'NIRF'),
    ('b0b8a724-7c65-4f07-8047-2a38e8100ad5'::uuid, 'QS'),
    ('b0b8a724-7c65-4f07-8047-2a38e8100ad5'::uuid, 'THE'),
    -- JKKN Matric Higher Secondary School — its own board only
    ('e04b8a7f-1445-4ef1-92e9-bde3d32b1f44'::uuid, 'MATRIC'),
    -- Nattraja Vidhyalya CBSE — its own board only
    ('29c221d1-b918-4c46-9d67-857273b0b553'::uuid, 'CBSE')
) AS m(institution_id, body_code)
JOIN public.institutions i ON i.id = m.institution_id
ON CONFLICT (institution_id, body_code) DO NOTHING;

COMMIT;

-- ===========================================================================
-- NOT DONE HERE, ON PURPOSE
--
-- * `institutions.accredited_by` is LEFT COMPLETELY UNTOUCHED. It is a single
--   free-text value ('NAAC' on 8 colleges AND on JKKN Testing Institution,
--   'CBSE' on Nattraja Vidhyalya, '' on 4 others) and cannot express a college
--   answering to five bodies. It is now legacy / display-only; this mapping is
--   authoritative. Retiring the column is a separate, reviewed change.
--
-- * No evidence row is deleted. The four non-colleges and two schools hold
--   NAAC evidence across coe_naac_evidence, hr_naac_evidence,
--   facility_teaching_naac_evidence, event_feedback_naac_evidence and
--   sustainability_naac_evidence. Those rows become DORMANT, not wrong, and
--   delete-vs-dormant is a Director decision, not a side effect of a mapping.
--
-- * `sh_accreditation_metrics.metric_type` gets no FK to this registry. It is
--   the same vocabulary, and the FK would be good hygiene, but that table is
--   the framework catalog and constraining it belongs in its own reviewed
--   change rather than riding along under a scoping fix.
--
-- * `iqac_cac_metric_map_body_valid` — a SIXTH hardcoded ten-value CHECK —
--   is left alone because its table (20260808210000) is itself unapplied. It
--   should be swapped for an FK when that file is applied.
-- ===========================================================================
