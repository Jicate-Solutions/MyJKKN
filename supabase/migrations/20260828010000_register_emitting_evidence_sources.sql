-- ============================================================================
-- quality_evidence_source_registry — register the five sources that were
-- already emitting evidence while remaining unlisted
-- Created: 2026-08-13
-- ============================================================================
-- FILE ONLY — not applied. Director-gated per CLAUDE.md.
--
-- Adds five rows to public.quality_evidence_source_registry and seeds their
-- fix_route / fix_hint / owner_role. Creates no object, drops nothing, adds no
-- function — so no SECURITY DEFINER clause and no anon-revoke clause applies to
-- this file. The table already carries RLS and an explicit anon posture from
-- 20260423_unification_crud_retrofit.sql; neither is touched here, and inserting
-- a config row cannot widen either. No role gains or loses any access.
--
-- Carries no BEGIN;/COMMIT; of its own, so a BEGIN .. ROLLBACK rehearsal stays
-- a rehearsal.
--
-- ----------------------------------------------------------------------------
-- THE GAP THIS CLOSES
-- ----------------------------------------------------------------------------
-- quality_evidence_mappings joins the registry on source_table, NOT on
-- source_kind (source_kind is a logical singular that never matches a physical
-- table name). Five source_tables are emitting evidence into the mappings today
-- and have no registry row at all, so every screen that reads the registry to
-- describe where a number came from shows those five as nothing:
--
--   learners_profiles              11,396 rows   NIRF OI_ESCS, OI_GD, OI_RD, TLR_SS
--   obe_course_attainment_rollup       92 rows   NAAC 7.3.d, NBA T1_CO
--   mess_menu_recommendations          48 rows   NAAC 7.3.f
--   scf_ai_suggestions                  5 rows   NAAC 7.3.f
--   induction_programs                  2 rows   NAAC 6.3.1, 6.3.2
--
-- An assessor asking "where did this figure come from?" got no answer for any
-- of them. Registering them makes the source nameable; seeding fix_route makes
-- the gap fixable.
--
-- ----------------------------------------------------------------------------
-- FOUR OF THE FIVE ARE MACHINE-DERIVED — THE ROUTE POINTS ONE STEP UPSTREAM
-- ----------------------------------------------------------------------------
-- Director decision, 2026-08-13: every one of the five gets a destination, and
-- for the four that no human types directly, the destination is the screen
-- where the RAW data a person DOES type is entered — never the read-only page
-- that displays the derived result. A link to a page that cannot be edited is
-- the same dead end as no link, dressed up as help.
--
--   obe_course_attainment_rollup  no human write path at all
--                                 (RLS on that table: "WRITES: none (RPC-only)")
--                                 → /academic/internal-marks, where the CIA
--                                   marks the rollup is computed from are typed.
--   mess_menu_recommendations     generated from ratings + waste, then reviewed
--                                 → /campus-living/mess/menu, where the menu the
--                                   recommendation is about is authored.
--   scf_ai_suggestions            written by a language model from class feedback
--                                 → /learners/class-feedback, where the feedback
--                                   the model reads is submitted.
--   induction_programs            the programme row is typed, but the evidence
--                                 only exists once the induction is created
--                                 → /events/induction.
--
-- Every route below was checked against the route tree on jicate/main at
-- 905a37d4 (2026-08-13) and resolves to a real app/(routes)/<path>/page.tsx.
-- None contains a dynamic [segment]: the person reading a gap has no id to
-- substitute. Assertion (b) in section 3 enforces both properties table-wide.
--
-- ----------------------------------------------------------------------------
-- ONE OF THE FIVE IS AI-WRITTEN AND SAYS SO IN ITS OWN DESCRIPTION
-- ----------------------------------------------------------------------------
-- Director decision, 2026-08-13: AI-written evidence counts, but the registry
-- must state plainly that it is AI-written. scf_ai_suggestions is the only
-- source in this registry whose rows are drafted by a model with NO human
-- approval step, so its description opens with "AI-WRITTEN —" and names the
-- contrast with mess_menu_recommendations, which is also machine-generated but
-- does carry a recorded human verdict. Both facts were read from the source
-- migrations, not assumed:
--
--   scf_ai_suggestions (20260625120000) has `model`, `suggestion jsonb`, and a
--   NULLABLE `human_verdict` constrained to tried_helped / tried_no_change /
--   not_tried. That is a retrospective "did this help?" note, not a gate — a row
--   is evidence the moment it is written, whether or not anyone ever reads it.
--
--   mess_menu_recommendations (20260727000000) has
--   status DEFAULT 'proposed' CHECK (proposed|accepted|rejected|edited),
--   reviewed_by, reviewed_at, review_note — a Chairperson verdict.
--
-- ----------------------------------------------------------------------------
-- owner_role IS A ROUTING HINT AND NOTHING READS IT FOR ACCESS
-- ----------------------------------------------------------------------------
-- It is NOT a permission, NOT a grant, and NOT consulted by any RLS policy or
-- SECURITY DEFINER function. It answers "who would normally keep this up to
-- date" so a gap can name a desk instead of naming nobody. Access continues to
-- come from custom_roles.permissions via user_has_permission(), unchanged.
--
--   learners_profiles            registrar
--     Director decision, 2026-08-13. Taken as given, not re-derived here.
--
--   obe_course_attainment_rollup hod
--     The rollup is course-grain and has no human write path, so the desk is
--     the one accountable for the courses and for chasing whoever types the
--     CIA marks. The `faculty` role_key was rejected as owner: it names ~850 people
--     rather than a desk, and every other course- or department-grain academic
--     source already in this registry (bos_meeting, sh_publication, ip_filing,
--     learner_exit_outcome) is owned by hod.
--
--   mess_menu_recommendations    chief_warden
--     Evidenced, not chosen: 20260726073531 grants chief_warden
--     campus_living.mess.menu.manage and names it "the intended loop operator",
--     and this table's own RLS (mmr_select) reads that same permission.
--
--   scf_ai_suggestions           scf_note_reviewer
--     Evidenced: 20260726095711 creates this role (institution_scope 'all') to
--     review AI-drafted learner notes across all colleges. It is the desk that
--     owns the SCF surface.
--
--   induction_programs           induction_coordinator
--     Evidenced: 20260630010000 creates and appoints this role (scope 'own')
--     as the per-college owner of induction.
--
-- All five role_keys are seeded by migrations already on jicate/main. Section 4
-- REPORTS (does not fail on) any owner_role with no matching custom_roles row,
-- because which roles are seeded varies per database and a missing hint must
-- never block a migration that changes no access.
--
-- IDEMPOTENT: five INSERT .. WHERE NOT EXISTS (never ON CONFLICT, per the
-- registry seeding rule this repo states in its own section headers) and one
-- UPDATE that rewrites the same values. Re-running changes nothing.
-- ============================================================================

-- ============================================================================
-- SECTIONS 0-3 ARE ONE STATEMENT — ON PURPOSE
-- ============================================================================
-- Every precondition, every write and every assertion in this file lives inside
-- a SINGLE DO block. Written as separate top-level statements they do not
-- protect each other at all, and this was established by execution rather than
-- argued: under a non-transactional runner — `psql -f` at DEFAULT settings (no
-- ON_ERROR_STOP), and the Management API hand-apply path this repo actually
-- uses — a RAISE EXCEPTION prints as an error and the runner simply moves to the
-- next statement. Measured on a fixture seeded with a crossed pair: the section
-- 0b refusal fired, and four INSERTs and the UPDATE ran anyway and AUTOCOMMITTED,
-- surviving the section 3 abort. The apply ended loud, red and correct-looking
-- with the database half-registered.
--
-- A DO block is ONE statement to the server, so it is atomic on its own without
-- any BEGIN;/COMMIT; of ours (which would defeat the BEGIN .. ROLLBACK rehearsal
-- this repo depends on before any apply). Consequences, all intended:
--
--   * a precondition RAISE provably prevents every write below it;
--   * a section 3 assertion failure ROLLS BACK the inserts and the update,
--     rather than leaving four of five sources registered;
--   * the five INSERTs and the UPDATE land together or not at all.
--
-- Section 4 stays a separate block: it only reads and only RAISEs NOTICE.
-- ============================================================================
DO $do$
DECLARE
  v_crossed      text;
  v_missing      text;
  v_bad_route    text;
  v_half_seeded  text;
  v_no_owner     text;
  v_new_routed   int;
  v_routed       int;
  v_total        int;
BEGIN

  -- --------------------------------------------------------------------------
  -- 0. PRECONDITION — the substrate this file writes into exists
  -- --------------------------------------------------------------------------
  IF to_regclass('public.quality_evidence_source_registry') IS NULL THEN
    RAISE EXCEPTION 'quality_evidence_source_registry does not exist — apply 20260423_unification_crud_retrofit.sql first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'quality_evidence_source_registry'
       AND column_name  = 'fix_route'
  ) THEN
    RAISE EXCEPTION 'quality_evidence_source_registry has no fix_route column — apply 20260809100700_evidence_source_registry_fix_routes.sql first';
  END IF;

  -- --------------------------------------------------------------------------
  -- 0b. PRECONDITION — THE FIVE PAIRS MUST BE ABSENT OR ALREADY PAIRED AS
  --     INTENDED. Refuses rather than half-writes, and because this runs inside
  --     the same statement as the writes, the refusal is real.
  --
  -- source_kind is the PRIMARY KEY and source_table carries its own UNIQUE
  -- constraint, so a (kind, table) pair can be CROSSED: a row can hold one of
  -- our source_kinds against a different source_table, or one of our
  -- source_tables against a different source_kind. Either way section 1's
  -- INSERT is correctly skipped by its guard — but a section 2 UPDATE joined on
  -- source_kind alone would then reach a row this file never inserted and
  -- rewrite its fix_route / fix_hint / owner_role. Measured on a fixture: a row
  -- keyed 'induction_program' -> 'induction_programme_records' had its route
  -- rewritten to /events/induction and KEPT it after the section 3 abort.
  --
  -- Section 2's UPDATE is now also constrained on BOTH keys, so it cannot reach
  -- such a row even if this guard were removed. The two defences are
  -- deliberate: this one names the problem, that one makes it unreachable.
  --
  -- This is a precondition on THIS DATABASE, not a claim about production. As
  -- of 2026-08-13 none of the five source_kind values exists in the registry at
  -- all, so on production today this guard is a no-op.
  -- --------------------------------------------------------------------------
  SELECT string_agg(
           format('want (%s -> %s) but the registry already holds (%s -> %s)',
                  want.k, want.t, r.source_kind, r.source_table),
           '; ' ORDER BY want.k)
    INTO v_crossed
    FROM (VALUES
      ('learner_profile',          'learners_profiles'),
      ('obe_course_attainment',    'obe_course_attainment_rollup'),
      ('mess_menu_recommendation', 'mess_menu_recommendations'),
      ('scf_ai_suggestion',        'scf_ai_suggestions'),
      ('induction_program',        'induction_programs')
    ) AS want(k, t)
    JOIN public.quality_evidence_source_registry r
      ON (r.source_kind  = want.k AND r.source_table IS DISTINCT FROM want.t)
      OR (r.source_table = want.t AND r.source_kind  IS DISTINCT FROM want.k);

  IF v_crossed IS NOT NULL THEN
    RAISE EXCEPTION
      'refusing to apply: a source_kind or source_table this file registers is already held by a DIFFERENT pairing, so seeding would overwrite an unrelated source''s destination — %. Resolve the collision first; nothing has been written.',
      v_crossed;
  END IF;

-- ----------------------------------------------------------------------------
-- 1. REGISTER THE FIVE — CONFIG, seeded WHERE NOT EXISTS (never ON CONFLICT,
--    per registry seeding rule). One statement per source.
--
--    source_kind is the PRIMARY KEY and source_table carries its own UNIQUE
--    constraint, so each guard tests BOTH keys — a guard on source_kind alone
--    would let a duplicate source_table through to raise 23505.
--
--    All five source_kind values were checked against the 24 live kinds on
--    2026-08-13 and none collides. is_system = true matches every one of those
--    24: it marks the row a seeded default the UI protects from deletion.
-- ----------------------------------------------------------------------------

-- 1a. learners_profiles — human-entered throughout.
INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT 'learner_profile', 'learners_profiles',
       'Learner Profiles',
       'Learner master records. Emits NIRF OI_ESCS, OI_GD, OI_RD and TLR_SS from '
       'the Gender, Home State and Community Category fields a person types on the '
       'learner profile. Human-entered throughout — nothing here is derived or '
       'AI-written, so a wrong figure is corrected on the profile itself.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind = 'learner_profile' OR source_table = 'learners_profiles'
);

-- 1b. obe_course_attainment_rollup — derived, no human write path.
INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT 'obe_course_attainment', 'obe_course_attainment_rollup',
       'Course Attainment Rollup (CO)',
       'MACHINE-DERIVED — course-grain CO attainment computed by RPC from submitted '
       'internal marks. The table has no human write path at all (its RLS grants '
       'SELECT only; writes are RPC-only), so a figure here cannot be edited where '
       'it is displayed. Emits NAAC 7.3.d and NBA T1_CO. To change a number, correct '
       'the CIA marks upstream and re-submit the round.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind = 'obe_course_attainment' OR source_table = 'obe_course_attainment_rollup'
);

-- 1c. mess_menu_recommendations — machine-generated, then humanly reviewed.
INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT 'mess_menu_recommendation', 'mess_menu_recommendations',
       'Mess Menu Recommendations',
       'MACHINE-GENERATED, THEN HUMAN-REVIEWED — weekly menu recommendations derived '
       'from meal ratings and plate waste, each carrying a recorded Chairperson '
       'verdict (status proposed / accepted / rejected / edited, with reviewed_by, '
       'reviewed_at and review_note) before it is acted on. Emits NAAC 7.3.f. The '
       'recommendation is only as good as the menu it was computed against, so a '
       'gap is fixed by completing the menu, not by editing the recommendation.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind = 'mess_menu_recommendation' OR source_table = 'mess_menu_recommendations'
);

-- 1d. scf_ai_suggestions — AI-written, NO human approval step.
--     Director decision 2026-08-13: this counts as evidence, and the registry
--     must say plainly that it is AI-written. Hence the leading marker.
INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT 'scf_ai_suggestion', 'scf_ai_suggestions',
       'AI-Written Class Feedback Suggestions',
       'AI-WRITTEN — every row in this source is drafted by a language model (the '
       'model that wrote it is recorded on the row) and NO PERSON APPROVES IT before '
       'it becomes evidence. This is the only AI-written source in this registry with '
       'no human review step. Its optional human verdict field is a retrospective '
       '"I tried this — it helped / no change / not tried" note, not an approval gate: '
       'a suggestion counts whether or not anyone ever reads it. Contrast '
       'mess_menu_recommendations, which is also machine-generated but carries a '
       'recorded Chairperson verdict before it is acted on. Treat any figure sourced '
       'here as an AI draft and say so in any narrative that cites it. Emits NAAC 7.3.f.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind = 'scf_ai_suggestion' OR source_table = 'scf_ai_suggestions'
);

-- 1e. induction_programs — human-entered per college.
INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT 'induction_program', 'induction_programs',
       'Induction Programmes',
       'The induction programme each college runs for its incoming learners, with its '
       'Name, Start Date and End Date. Emits NAAC 6.3.1 and 6.3.2. Human-entered: a '
       'college with no induction on record contributes nothing to either metric, '
       'which reads identically to a college that never ran one.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind = 'induction_program' OR source_table = 'induction_programs'
);

-- ----------------------------------------------------------------------------
-- 2. ROUTE THEM — one UPDATE .. FROM (VALUES ..) so the whole decision reads as
--    one table, matching 20260809100700 section 2.
--
--    MATCHED ON BOTH KEYS. Joining on source_kind alone would let this UPDATE
--    reach a row keyed to one of these source_kinds but pointing at a DIFFERENT
--    source_table, and silently rewrite that unrelated source's destination.
--    Carrying source_table in the VALUES list and requiring both to match means
--    the statement can only ever touch the row section 1 means it to. Section 0b
--    refuses such a database outright; this makes the write unreachable even if
--    that guard were removed.
-- ----------------------------------------------------------------------------
UPDATE public.quality_evidence_source_registry r
   SET fix_route  = s.fix_route,
       fix_hint   = s.fix_hint,
       owner_role = s.owner_role,
       updated_at = now()
  FROM (VALUES
    ('learner_profile', 'learners_profiles',
     '/learners/profiles',
     'Open a learner and fill Gender, Home State and Community Category. Filter the list to Profile: incomplete to see who is outstanding.',
     'registrar'),

    ('obe_course_attainment', 'obe_course_attainment_rollup',
     '/academic/internal-marks',
     'Enter each learner''s CIA marks for the course and submit the round so it reaches the attainment rollup. Filter to Status: draft to see marks that were typed and never submitted.',
     'hod'),

    ('mess_menu_recommendation', 'mess_menu_recommendations',
     '/campus-living/mess/menu',
     'Open the Menu Editor for the tier and fill each day''s Breakfast, Lunch, Tea and Dinner items. Filter to Status: draft to see the weeks no caterer has been given.',
     'chief_warden'),

    ('scf_ai_suggestion', 'scf_ai_suggestions',
     '/learners/class-feedback',
     'Submit the post-class checklist and the ''did I understand?'' rating within the 48-hour window — a course needs at least 3 responses before any suggestion can be written. Filter to Sessions: present-pending to see the classes still awaiting feedback.',
     'scf_note_reviewer'),

    ('induction_program', 'induction_programs',
     '/events/induction',
     'Create this college''s induction and fill its Name, Start Date and End Date. Filter to Status: draft to see the colleges whose induction never went live.',
     'induction_coordinator')
  ) AS s(source_kind, source_table, fix_route, fix_hint, owner_role)
 WHERE r.source_kind  = s.source_kind
   AND r.source_table = s.source_table;

-- ----------------------------------------------------------------------------
-- 3. ASSERTIONS — fail the apply rather than ship a half-registered source.
--    Every check here RAISEs an EXCEPTION. A guard whose miss path is a NOTICE
--    reads as success in Studio, which is the same as having no guard.
--
--    These run inside the same statement as the writes above, so a failure here
--    ROLLS THEM BACK. Previously they could only report a half-written database
--    after the fact.
-- ----------------------------------------------------------------------------
  -- (a) all five sources are present, keyed on the column the mappings
  --     actually join on (source_table), not on the logical source_kind.
  SELECT string_agg(want.t, ', ') INTO v_missing
    FROM (VALUES
      ('learners_profiles'),
      ('obe_course_attainment_rollup'),
      ('mess_menu_recommendations'),
      ('scf_ai_suggestions'),
      ('induction_programs')
    ) AS want(t)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.quality_evidence_source_registry r
      WHERE r.source_table = want.t
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'expected all five emitting sources registered — still absent: %', v_missing;
  END IF;

  -- (b) no route may be relative, and none may carry a dynamic segment: the
  --     person reading a gap has no id to substitute. Table-wide on purpose.
  SELECT source_kind INTO v_bad_route
    FROM public.quality_evidence_source_registry
   WHERE fix_route IS NOT NULL
     AND (left(fix_route, 1) <> '/' OR fix_route LIKE '%[%')
   LIMIT 1;
  IF v_bad_route IS NOT NULL THEN
    RAISE EXCEPTION 'fix_route on % is not an absolute static path', v_bad_route;
  END IF;

  -- (c) a route with no hint is a button with no instruction. Table-wide.
  SELECT source_kind INTO v_half_seeded
    FROM public.quality_evidence_source_registry
   WHERE (fix_route IS NOT NULL) <> (fix_hint IS NOT NULL)
   LIMIT 1;
  IF v_half_seeded IS NOT NULL THEN
    RAISE EXCEPTION 'source % has a fix_route without a fix_hint, or the reverse', v_half_seeded;
  END IF;

  -- (d) Director decision 2026-08-13: EVERY one of the five carries an owner
  --     AND a route. Scoped to the five so this fails by name if any part of
  --     section 2 is stripped out, rather than passing on the other 24.
  SELECT string_agg(r.source_table, ', ') INTO v_no_owner
    FROM public.quality_evidence_source_registry r
   WHERE r.source_table IN ('learners_profiles', 'obe_course_attainment_rollup',
                            'mess_menu_recommendations', 'scf_ai_suggestions',
                            'induction_programs')
     AND (r.owner_role IS NULL OR r.fix_route IS NULL OR r.fix_hint IS NULL);
  IF v_no_owner IS NOT NULL THEN
    RAISE EXCEPTION 'every newly registered source must carry a route, a hint and an owner — incomplete: %', v_no_owner;
  END IF;

  -- (e) the five are routed, and the seed reached them. Counting the five
  --     directly (not the table total) keeps this non-vacuous.
  SELECT count(*) INTO v_new_routed
    FROM public.quality_evidence_source_registry
   WHERE source_table IN ('learners_profiles', 'obe_course_attainment_rollup',
                          'mess_menu_recommendations', 'scf_ai_suggestions',
                          'induction_programs')
     AND fix_route IS NOT NULL;
  IF v_new_routed < 5 THEN
    RAISE EXCEPTION 'expected 5 newly routed sources, found % — a source_kind in the section 2 seed no longer matches the row section 1 inserted', v_new_routed;
  END IF;

  -- (f) the registry as a whole did not go backwards. 21 were routed before
  --     this file (20260809100700), 5 are added here.
  SELECT count(*) FILTER (WHERE fix_route IS NOT NULL), count(*)
    INTO v_routed, v_total
    FROM public.quality_evidence_source_registry;
  IF v_routed < 26 THEN
    RAISE EXCEPTION 'expected at least 26 routed sources after this file, found % of % — an earlier seed no longer matches its registry row', v_routed, v_total;
  END IF;

  RAISE NOTICE 'quality_evidence_source_registry: % of % sources now carry a destination (5 newly emitting sources registered)',
    v_routed, v_total;
END
$do$;

-- ----------------------------------------------------------------------------
-- 4. ADVISORY — report, never fail.
-- An owner_role naming a role that is not seeded on THIS database is a stale
-- hint, not a fault. Failing here would block a migration that grants nothing
-- and changes no access. This is a deliberate, documented exception to the
-- rule in section 3 that every guard must RAISE EXCEPTION.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_unknown text;
BEGIN
  IF to_regclass('public.custom_roles') IS NULL THEN
    RAISE NOTICE 'custom_roles absent — owner_role hints not cross-checked';
    RETURN;
  END IF;

  SELECT string_agg(DISTINCT r.owner_role, ', ') INTO v_unknown
    FROM public.quality_evidence_source_registry r
   WHERE r.owner_role IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.custom_roles c WHERE c.role_key = r.owner_role
     );

  IF v_unknown IS NOT NULL THEN
    RAISE NOTICE 'owner_role hints with no custom_roles row on this database: % — routing hint only, no access affected', v_unknown;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Verification (run AFTER apply; expects 5 rows, all fully seeded)
-- ----------------------------------------------------------------------------
-- SELECT source_kind, source_table, owner_role, fix_route
-- FROM   public.quality_evidence_source_registry
-- WHERE  source_table IN ('learners_profiles', 'obe_course_attainment_rollup',
--                         'mess_menu_recommendations', 'scf_ai_suggestions',
--                         'induction_programs')
-- ORDER  BY source_table;
--
-- -- every emitting source_table now has a registry row (expects 0 rows):
-- SELECT DISTINCT m.source_table
-- FROM   public.quality_evidence_mappings m
-- LEFT   JOIN public.quality_evidence_source_registry r ON r.source_table = m.source_table
-- WHERE  r.source_table IS NULL;
