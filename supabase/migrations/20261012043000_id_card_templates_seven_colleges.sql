-- ============================================================================
-- An ID card template for the seven colleges that have none (2026-10-12)
-- ============================================================================
-- FILE ONLY — **NOT YET APPLIED**. Director-gated, like every migration in this
-- repo. Nothing in this file has been run against production. The Director
-- applies it.
--
-- WHY
-- ---
-- Measured on production 2026-08-25. Nine institutions carry active learners.
-- Only TWO of them have any ID card template at all:
--
--   JKKN College of Engineering and Technology   791 active   2 templates
--   Nattraja Vidhyalya CBSE                      226 active   1 template (dark)
--
-- The other seven — 3,922 active learners, 79% of the cluster — have no card
-- design in the system, so no card can be produced for them at all. The
-- ordering is backwards on top of that: the LARGEST college by head-count
-- (Arts and Science (Self), 1,243) has no card, while the college with the
-- WORST photo coverage (Engineering, 26%) is the one with two.
--
-- This file gives each of the seven a template. It does not print anything and
-- it does not switch anything on.
--
-- THE SEVEN, as measured 2026-08-25
--   (active learners = learners_profiles.lifecycle_status = 'active';
--    photo = student_photo_url non-null AND non-empty — the empty string is a
--    real value in this column and counting it as a photo overstates coverage)
--
--   1,243  93%  JKKN College of Arts and Science (Self)
--     596  40%  JKKN College of Pharmacy
--     552   0%  JKKN Matric Higher Secondary School
--     498  65%  JKKN Dental College and Hospital
--     484  75%  JKKN College of Arts and Science (Aided)
--     277  40%  JKKN College of Nursing and Research
--     272  75%  JKKN College of Allied Health Sciences
--
-- ONE SHARED DESIGN, NOT SEVEN NEW ONES
-- -------------------------------------
-- Director decision 11: reuse the Engineering tall layout rather than draw a
-- new card per college. The source is the live row
--   id ad0642ec-10c5-4b06-859e-7006734eb8f8
--   'Engineering Learner — Tall (2026)'  (institution 5de4fba1-…)
-- read read-only from production on 2026-08-25. Every element, coordinate,
-- colour, font size and field mapping below is copied from it verbatim. This
-- is the same move the Nattraja migration made
-- (20260904010000_id_card_template_nattraja_vidhyalya.sql), and the deviations
-- from the source are the same two:
--
--   1. front_layout_json.background_image is DROPPED.
--      The source points at artwork carrying JKKN College of Engineering
--      branding. Printing it on a Pharmacy or Dental card would put the wrong
--      college on every card. None of the seven has artwork of its own
--      (institutions.logo_url is the empty string for all seven), so these
--      templates carry none. That absence is the main reason they ship dark.
--   2. The three Engineering contact lines on the back are NOT copied — see
--      the next block, which is the one real decision in this file.
--
-- THE CONTACT LINES: SIX COLLEGES GET NONE, ON PURPOSE
-- ----------------------------------------------------
-- The Engineering back carries three hard-coded static lines:
--   PH: 99659 39333, 99653 63999, 93458 55001 / engg@jkkn.ac.in /
--   www.engg.jkkn.ac.in
-- Those are Engineering's. Copying them onto six other colleges would print
-- the wrong phone number and the wrong website on thousands of cards, so the
-- correct source is each institution's own row. Read on 2026-08-25, that row
-- turns out not to hold a usable value for six of the seven:
--
--   phone    '9876543210'              — on 8 of the 14 institutions
--   email    'admin@jkkn.ac.in'        — on 9 of the 14
--   website  'https://www.jkkn.ac.in/' — on 7 of the 14
--
-- '9876543210' is the textbook placeholder Indian mobile number (the digits
-- run 9-8-7-6-5-4-3-2-1-0) and eight institutions share it byte for byte. The
-- decisive evidence that this column is not maintained is Engineering itself:
-- its institutions row says 9876543210 / admin@jkkn.ac.in / www.jkkn.ac.in/,
-- while its LIVE card prints three different real numbers, engg@jkkn.ac.in and
-- www.engg.jkkn.ac.in. Whoever built that card did not get the contacts from
-- this table, because this table does not have them.
--
-- So for the six colleges carrying that placeholder trio, the three contact
-- elements are OMITTED rather than filled. A card with no phone number on the
-- back is recoverable; a card that prints 9876543210 to 3,370 learners is a
-- reprint. The PR lists exactly which college is missing which value so the
-- Director can supply the real ones; adding them later is an edit to three
-- static strings in this JSON, not a redesign.
--
-- ONE college does have institution-specific contacts on its row, and gets
-- them, exactly as Nattraja did:
--   JKKN Matric Higher Secondary School — 9965891999 / school@jkkn.org /
--   school.jkkn.ac.in
-- These are taken VERBATIM from the institutions row and have not been
-- verified against anything else. They should be checked by eye before that
-- template is ever switched on. (Note the .org email, where the rest of the
-- cluster uses .ac.in — that is what the row says.)
--
-- MATRIC HIGHER SECONDARY SCHOOL IS A SCHOOL, AND ITS CARD SHOWS IT
-- -----------------------------------------------------------------
-- Flagged, not guessed — the shared design is used unchanged, and these are
-- the three things a reviewer must decide before that one template goes live:
--
--   a. lib/utils/school-label-adapter.ts DOES apply to this institution
--      (entity_type = 'school'), but the ID-card renderer never calls it —
--      `adaptLabel` appears nowhere under lib/id-cards/. The card's static
--      label reads 'COURSE :' and its value comes from programs.program_name,
--      which for this school is 'Standard 12'. The repo's own school
--      vocabulary maps Program → Class, so that label arguably wants to read
--      'CLASS :' here. Changing it means this college no longer shares the one
--      design, which is a Director call, not mine.
--   b. 0 of its 552 active learners carry a batch_id, so `study_period` and
--      `valid_until` both resolve empty — while the static labels 'YEAR :' and
--      'VALID UPTO' still draw, because static_text renders unconditionally
--      (lib/id-cards/render-card.tsx). Its card would print two headings with
--      nothing under them.
--   c. 0 of its 552 have a photo, and the photo is the identity control on a
--      printed card. This template is the least ready of the seven to print.
--
-- BUILT DARK, ALL SEVEN
-- ---------------------
-- active = FALSE on every row. A dark template is invisible to every print
-- picker (lib/services/id-cards/template-picker.ts and the guard workflow
-- id-card-template-picker.yml) and is reachable only from the admin design
-- tabs, which is exactly how a template is meant to be worked on. Nothing
-- prints from these rows until artwork lands, the missing contacts are
-- supplied, a verification print is checked by eye, and someone switches one
-- on deliberately. This file must never be the thing that switches one on —
-- the guard below raises if the FALSE literal is ever edited to TRUE.
--
-- RE-RUNNABLE
-- -----------
-- Each row is guarded on BOTH keys — the primary key and
-- (institution_id, name) — so a replay is a no-op whether the row was seeded
-- by this file or created by hand in the admin UI. No existing template row is
-- read for update or modified.
--
-- Each id is a UUIDv5 so the seed is reproducible rather than arbitrary:
--   uuid5(NAMESPACE_URL,
--         'https://jkkn.ac.in/id_card_templates/<institution_id>/<name>')
-- Re-derive any of them with:
--   python3 -c "import uuid;print(uuid.uuid5(uuid.NAMESPACE_URL,
--     'https://jkkn.ac.in/id_card_templates/<institution_id>/<name>'))"
--
-- SCOPE. Seven INSERTs. No table, function, policy or grant is created or
-- altered, so there is no SECURITY DEFINER surface and nothing for the
-- anon-revoke rule to re-assert. No print job is enqueued.
-- ============================================================================

DO $migration$
DECLARE
  -- The Engineering tall front, verbatim, minus background_image.
  c_front CONSTANT jsonb := $front$
{
  "elements": [
    { "x": 201, "y": 165, "field": "photo", "width": 300, "height": 380 },
    { "x": 30, "y": 560, "align": "center", "color": "#c8102e", "field": "name_line_1", "width": 578, "font_size": 32, "font_weight": 800 },
    { "x": 60, "y": 618, "text": "ROLL NO :", "align": "right", "color": "#374151", "field": "static_text", "width": 185, "font_size": 22, "font_weight": 600 },
    { "x": 258, "y": 616, "color": "#111827", "field": "roll_number", "width": 340, "font_size": 24, "font_weight": 700 },
    { "x": 60, "y": 666, "text": "COURSE :", "align": "right", "color": "#374151", "field": "static_text", "width": 185, "font_size": 22, "font_weight": 600 },
    { "x": 258, "y": 664, "color": "#111827", "field": "course", "width": 360, "font_size": 16, "font_weight": 700 },
    { "x": 60, "y": 714, "text": "YEAR :", "align": "right", "color": "#374151", "field": "static_text", "width": 185, "font_size": 22, "font_weight": 600 },
    { "x": 258, "y": 712, "color": "#111827", "field": "study_period", "width": 340, "font_size": 24, "font_weight": 700 },
    { "x": 36, "y": 778, "field": "qr_code", "width": 140 },
    { "x": 200, "y": 815, "text": "VALID UPTO", "color": "#6b7280", "field": "static_text", "font_size": 15, "font_weight": 500 },
    { "x": 200, "y": 838, "color": "#0b6d41", "field": "valid_until", "font_size": 22, "font_weight": 700 }
  ],
  "orientation": "portrait"
}
  $front$::jsonb;

  -- The Engineering tall back, verbatim, minus the three Engineering-specific
  -- contact lines. Colleges that have real contacts of their own get them
  -- appended below, in the same three positions the source used.
  c_back CONSTANT jsonb := $back$
{
  "elements": [
    { "x": 44, "y": 70, "text": "BLOOD GROUP", "color": "#6b7280", "field": "static_text", "font_size": 17 },
    { "x": 44, "y": 96, "color": "#0b7d3e", "field": "blood_group", "font_size": 36, "font_weight": 800 },
    { "x": 44, "y": 180, "text": "DATE OF BIRTH", "color": "#6b7280", "field": "static_text", "font_size": 17 },
    { "x": 44, "y": 206, "color": "#111827", "field": "date_of_birth", "width": 550, "font_size": 27, "font_weight": 700 },
    { "x": 44, "y": 290, "text": "ADDRESS", "color": "#6b7280", "field": "static_text", "font_size": 17 },
    { "x": 44, "y": 316, "color": "#111827", "field": "address", "width": 556, "font_size": 18, "font_weight": 600 },
    { "x": 44, "y": 470, "text": "CONTACT", "color": "#6b7280", "field": "static_text", "font_size": 17 },
    { "x": 44, "y": 496, "color": "#111827", "field": "contact_phone", "width": 550, "font_size": 27, "font_weight": 700 }
  ],
  "show_dob": false,
  "footer_text": "TAMIL NADU, INDIA",
  "orientation": "portrait",
  "show_address": false,
  "show_barcode": false,
  "show_contact": false,
  "show_guardian": false,
  "show_blood_group": false
}
  $back$::jsonb;

  c_mappings CONSTANT jsonb := $mappings$
[
  { "db_column": "learners_profiles.roll_number", "card_field": "roll_number" }
]
  $mappings$::jsonb;

  r            RECORD;
  v_back       jsonb;
  v_inserted   integer;
  v_active     boolean;
  v_seeded     integer := 0;
  v_present    integer := 0;
  v_absent     integer := 0;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      -- template_id (UUIDv5)                  institution_id                          name                                                             contact elements (NULL = college has no real contacts on file)
      ('fa2c6cf0-19dd-5f6c-9941-2f9ce81ef06d'::uuid, 'b0b8a724-7c65-4f07-8047-2a38e8100ad5'::uuid,
       'JKKN College of Arts and Science (Self) Learner — Tall (2026)',   NULL::jsonb),

      ('ff878e29-e924-572b-b602-08b0eb945e82'::uuid, '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334'::uuid,
       'JKKN College of Pharmacy Learner — Tall (2026)',                  NULL::jsonb),

      -- The one college whose institutions row carries contacts of its own.
      ('b504f973-2093-520c-a8fc-a521a9a92fbe'::uuid, 'e04b8a7f-1445-4ef1-92e9-bde3d32b1f44'::uuid,
       'JKKN Matric Higher Secondary School Learner — Tall (2026)',
       $contact$
[
  { "x": 44, "y": 800, "text": "PH: 99658 91999", "color": "#111827", "field": "static_text", "font_size": 17 },
  { "x": 44, "y": 836, "text": "school@jkkn.org", "color": "#111827", "field": "static_text", "font_size": 17 },
  { "x": 44, "y": 870, "text": "school.jkkn.ac.in", "color": "#111827", "field": "static_text", "font_size": 17 }
]
       $contact$::jsonb),

      ('84759bb7-0778-52e3-91f7-7e138da0dab2'::uuid, 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
       'JKKN Dental College and Hospital Learner — Tall (2026)',          NULL::jsonb),

      ('bfde2083-26fe-5fd5-ad3a-34e3e97cb74e'::uuid, 'a33138b6-4eea-4675-941f-1071bf88b127'::uuid,
       'JKKN College of Arts and Science (Aided) Learner — Tall (2026)',  NULL::jsonb),

      ('45898dc7-c4c4-5d38-bdba-585a31916bfb'::uuid, '9c1554e8-12a2-4b76-a9d6-8242bb05eba1'::uuid,
       'JKKN College of Allied Health Sciences Learner — Tall (2026)',    NULL::jsonb),

      ('53e0d3ba-446c-5894-87d8-aa4d287567d1'::uuid, '70e54e51-9b98-4e07-9534-a85310609bfd'::uuid,
       'JKKN College of Nursing and Research Learner — Tall (2026)',      NULL::jsonb)
    ) AS t(template_id, institution_id, name, contact_elements)
  LOOP
    -- A database without this institution (a fresh local one) gets nothing
    -- rather than a foreign-key error. Says so out loud instead of failing
    -- silently.
    IF NOT EXISTS (SELECT 1 FROM public.institutions WHERE id = r.institution_id) THEN
      RAISE NOTICE '% (%) is not on this database — ID card template not seeded.',
        r.name, r.institution_id;
      v_absent := v_absent + 1;
      CONTINUE;
    END IF;

    v_back := c_back;
    IF r.contact_elements IS NOT NULL THEN
      v_back := jsonb_set(
        v_back,
        '{elements}',
        (v_back -> 'elements') || r.contact_elements
      );
    END IF;

    INSERT INTO public.id_card_templates (
      id, name, institution_id, front_layout_json, back_layout_json, field_mappings, active
    )
    SELECT r.template_id, r.name, r.institution_id, c_front, v_back, c_mappings, FALSE
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.id_card_templates t
      WHERE t.id = r.template_id
         OR (t.institution_id = r.institution_id AND t.name = r.name)
    );

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted = 1 THEN
      -- Non-vacuous guard: it fires if the FALSE literal above is ever edited
      -- to TRUE. Scoped to a row this run actually inserted, so a replay after
      -- the Director has legitimately switched a template on stays a clean
      -- no-op.
      SELECT active INTO v_active
      FROM public.id_card_templates
      WHERE id = r.template_id;

      IF COALESCE(v_active, TRUE) THEN
        RAISE EXCEPTION
          'ID card template % (%) was seeded ACTIVE. These templates must ship dark — none of the seven has artwork, six have no contact details on file, and no verification print has been checked.',
          r.template_id, r.name;
      END IF;

      v_seeded := v_seeded + 1;
      RAISE NOTICE 'Seeded dark ID card template % — %.', r.template_id, r.name;
    ELSE
      v_present := v_present + 1;
      RAISE NOTICE 'ID card template for % already present — nothing written.', r.name;
    END IF;
  END LOOP;

  RAISE NOTICE 'ID card templates: % seeded dark, % already present, % institution(s) absent from this database.',
    v_seeded, v_present, v_absent;
END
$migration$;
