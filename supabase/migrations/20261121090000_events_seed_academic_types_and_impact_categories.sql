-- ============================================================================
-- The academic event-type catalogue and the outcome/impact taxonomy, filled in.
--
-- 20261118093000 created public.event_academic_types and
-- public.event_impact_categories and deliberately left BOTH EMPTY, with this
-- comment on each:
--
--     'EMPTY ON PURPOSE — awaits Director confirmation against the JKKN IQAC
--      SOP, which is not in this repository. Do not seed it from a guess:
--      whatever lands here becomes the institution's referenced catalogue and
--      will be cited in accreditation evidence.'
--
-- That was the right call and this file is its answer, not an override. The
-- source arrived on 2026-09-05: the Director supplied MyJKKN_Event_Management_
-- Workflow.pdf ("Proposed Institutional Event Management Workflow"). Both lists
-- below are transcribed from it, in its own order and its own words:
--   * step 3, Event Type   -> event_academic_types   (20 rows)
--   * step 11, Outcome & Impact -> event_impact_categories (10 rows)
--
-- ⚠️ THE LIST IS TWENTY, NOT SEVENTEEN. Earlier working notes in this repo —
--    including a build plan and a continuation brief — said "the 17 academic
--    event types". That was a miscount of the same sentence, propagated. The
--    The PDF names, in its own order: Seminar, Workshop, Conference, FDP,
--    Awareness Programme, Inauguration, Competition, Outreach, Community
--    Engagement, Training, Guest Lecture, Expert Talk, Orientation, Student
--    Development, Cultural, Sports, Exhibition, Industrial Visit, Field Visit
--    and Other. Twenty.
--
-- WHAT IS NOT DECIDED HERE. The source is titled "Proposed", and the table's
--   own comment asks for Director CONFIRMATION. So this migration ships FILE
--   ONLY / NOT APPLIED. Applying it is the act that turns a proposal into the
--   institution's referenced catalogue; that act is the Director's, not this
--   file's. Nothing below is invented — every label is transcribed — but
--   "transcribed faithfully" and "confirmed" are different things.
--
-- SCOPE. institution_id IS NULL on every row, which the parent migration
--   defines as "available to every college". The Director's ruling of
--   2026-09-05 was to build for all eight colleges and switch on for JKKN
--   College of Arts and Science first; a cluster-wide catalogue with per-college
--   activation is exactly that shape, and it avoids eight near-identical copies
--   drifting apart. A college that needs its own extra type adds a row scoped to
--   itself — the unique index already allows that.
--
-- NOT events.event_type. That column carries nine OPERATIONAL values (marathon,
--   induction, convocation …) which route an event to its console. This
--   catalogue answers "what kind of academic activity was this" for the report
--   and for accreditation evidence. The parent migration says so at line 17 and
--   this file does not touch that column.
--
-- IDEMPOTENT. ON CONFLICT DO NOTHING against uq_event_academic_types_scope_code
--   and uq_event_impact_categories_scope_code, both of which key on
--   COALESCE(institution_id, '00000000-…'::uuid) + lower(code). Re-running
--   changes nothing and re-stamps nothing.
--
-- display_order is the PDF's own order, spaced by 10 so a later insertion does
--   not require renumbering.
-- ============================================================================

-- ── 1. Academic event types — PDF step 3, in the PDF's order ────────────────
INSERT INTO public.event_academic_types (institution_id, code, label, description, display_order)
VALUES
  (NULL, 'seminar',             'Seminar',             NULL, 10),
  (NULL, 'workshop',            'Workshop',            NULL, 20),
  (NULL, 'conference',          'Conference',          NULL, 30),
  (NULL, 'fdp',                 'FDP',                 'Faculty Development Programme', 40),
  (NULL, 'awareness_programme', 'Awareness Programme', NULL, 50),
  (NULL, 'inauguration',        'Inauguration',        NULL, 60),
  (NULL, 'competition',         'Competition',         NULL, 70),
  (NULL, 'outreach',            'Outreach',            NULL, 80),
  (NULL, 'community_engagement','Community Engagement',NULL, 90),
  (NULL, 'training',            'Training',            NULL, 100),
  (NULL, 'guest_lecture',       'Guest Lecture',       NULL, 110),
  (NULL, 'expert_talk',         'Expert Talk',         NULL, 120),
  (NULL, 'orientation',         'Orientation',         NULL, 130),
  (NULL, 'student_development', 'Student Development', NULL, 140),
  (NULL, 'cultural',            'Cultural',            NULL, 150),
  (NULL, 'sports',              'Sports',              NULL, 160),
  (NULL, 'exhibition',          'Exhibition',          NULL, 170),
  (NULL, 'industrial_visit',    'Industrial Visit',    NULL, 180),
  (NULL, 'field_visit',         'Field Visit',         NULL, 190),
  (NULL, 'other',               'Other',               'Use only when no other type fits; the event report should then say what it was.', 900)
ON CONFLICT DO NOTHING;

-- ── 2. Outcome / impact categories — PDF step 11, in the PDF's order ────────
-- The PDF's wording: "Select relevant outcome/impact categories and add a short
-- narrative, e.g. knowledge, skills, communication, employability, awareness,
-- research, digital literacy, leadership, teamwork, community/environmental
-- awareness." Ten, transcribed as written. `awareness` and
-- `community_environmental_awareness` are BOTH in that list and are NOT
-- duplicates — the first is the event's own subject awareness, the second is
-- specifically community and environmental. They are kept distinct because the
-- source keeps them distinct.
INSERT INTO public.event_impact_categories (institution_id, code, label, description, display_order)
VALUES
  (NULL, 'knowledge',                          'Knowledge',                          NULL, 10),
  (NULL, 'skills',                             'Skills',                             NULL, 20),
  (NULL, 'communication',                      'Communication',                      NULL, 30),
  (NULL, 'employability',                      'Employability',                      NULL, 40),
  (NULL, 'awareness',                          'Awareness',                          NULL, 50),
  (NULL, 'research',                           'Research',                           NULL, 60),
  (NULL, 'digital_literacy',                   'Digital Literacy',                   NULL, 70),
  (NULL, 'leadership',                         'Leadership',                         NULL, 80),
  (NULL, 'teamwork',                           'Teamwork',                           NULL, 90),
  (NULL, 'community_environmental_awareness',  'Community / Environmental Awareness', NULL, 100)
ON CONFLICT DO NOTHING;

-- ── 3. Assert, loudly, rather than trusting the inserts ─────────────────────
-- A seed that silently lands 19 of 20 rows is worse than one that fails: the
-- missing type is only noticed when a coordinator cannot find it in a dropdown
-- months later. Both counts are checked against the cluster-wide scope only,
-- so a college's own extra rows never mask a shortfall here.
DO $$
DECLARE
  v_types      integer;
  v_categories integer;
BEGIN
  SELECT count(*) INTO v_types
    FROM public.event_academic_types
   WHERE institution_id IS NULL;

  SELECT count(*) INTO v_categories
    FROM public.event_impact_categories
   WHERE institution_id IS NULL;

  IF v_types < 20 THEN
    RAISE EXCEPTION
      'Academic event types: expected at least 20 cluster-wide rows after seeding, found %. The catalogue is incomplete and nothing has been committed.',
      v_types;
  END IF;

  IF v_categories < 10 THEN
    RAISE EXCEPTION
      'Impact categories: expected at least 10 cluster-wide rows after seeding, found %. The taxonomy is incomplete and nothing has been committed.',
      v_categories;
  END IF;

  RAISE NOTICE 'Seeded catalogue: % academic event types, % impact categories (cluster-wide).',
    v_types, v_categories;
END $$;
