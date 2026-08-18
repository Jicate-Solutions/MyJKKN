-- ============================================================================
-- An ID card template for Nattraja Vidhyalya CBSE — seeded DARK (2026-09-04)
-- ============================================================================
-- FILE ONLY — NOT APPLIED. Director-gated, like every migration in this repo.
--
-- WHY THIS COLLEGE, AND WHY NOW
-- -----------------------------
-- Every ID card template that exists today is for JKKN College of Engineering
-- and Technology, which has photo coverage of 26%. Nattraja Vidhyalya CBSE has
-- 93% — the highest in the cluster. The photo is the identity control on a
-- printed card (a QR code proves nothing: a phone photograph of a card scans
-- identically), so a college whose learners mostly have no photo on file cannot
-- actually issue a card that controls anything. Rollout order therefore follows
-- data readiness, not flagship status. Director decision, 2026-08-14.
--
-- ONE SHARED DESIGN, NOT A NEW ONE
-- --------------------------------
-- Director decision 11: reuse the Engineering tall layout rather than design a
-- second card. The source is the live row
--   id ad0642ec-10c5-4b06-859e-7006734eb8f8
--   'Engineering Learner — Tall (2026)'  (institution 5de4fba1-…)
-- read read-only from production on 2026-08-14. Its front elements, back
-- elements, coordinates, colours, font sizes and field_mappings are copied
-- verbatim. Exactly FOUR values differ, all of them institution identity:
--
--   1. front_layout_json.background_image is DROPPED.
--      The source points at
--      id-card-assets/backgrounds/ad0642ec-…/1786624961895.png — artwork
--      carrying JKKN College of Engineering branding. Printing it on a Nattraja
--      card would put the wrong college on every card. Nattraja has no card
--      artwork yet (institutions.logo_url is empty for 29c221d1-…), so this
--      template carries none. That absence is the main reason it ships dark.
--   2/3/4. The three Engineering contact lines on the back become Nattraja's,
--      1:1 in place, read from the institutions row (phone 9994344986,
--      nattrajavidhyalya@jkkn.ac.in, nv.jkkn.ac.in). No element is added,
--      removed or moved.
--
-- THE DUPLICATE-LABEL DEFECT IS NOT COPIED
-- ----------------------------------------
-- The two live Engineering templates print every label twice: their uploaded
-- artwork already has '<STUDENT NAME>' and three 'Text here' placeholders baked
-- into the bitmap, and the template ALSO draws its own text on top. The
-- Director has ruled the live rows stay as they are until cleaned artwork
-- exists — this file does not touch them.
--
-- This template cannot inherit that defect, because it has no artwork: with
-- background_image absent there is no baked-in text for anything to duplicate.
-- All eleven front elements and all eleven back elements are therefore kept,
-- including the seven static_text labels (ROLL NO / COURSE / YEAR / VALID UPTO
-- on the front; BLOOD GROUP / DATE OF BIRTH / ADDRESS / CONTACT plus the three
-- contact lines on the back). They are the ONLY source of those labels here,
-- not a second one. When Nattraja artwork is uploaded, whichever labels the
-- artwork bakes in must be deleted from this JSON in the same change — that is
-- the moment the defect could be introduced, and it is not this moment.
--
-- BUILT DARK, ON PURPOSE
-- ----------------------
-- active = FALSE. A dark template is invisible to every print picker (see
-- lib/services/id-cards/template-picker.ts and the guard workflow
-- id-card-template-picker.yml) and is reachable only from the admin design
-- tabs, which is exactly how a template is meant to be worked on. Nothing
-- prints from this row until artwork lands, a verification print is checked by
-- eye, and someone switches it on deliberately. This file must never be the
-- thing that switches it on.
--
-- RE-RUNNABLE
-- -----------
-- Guarded on BOTH keys — the primary key and (institution_id, name) — so a
-- replay is a no-op whether the row was seeded by this file or created by hand
-- in the admin UI. The id is a UUIDv5 derived from the institution id and the
-- template name, so it is reproducible rather than arbitrary.
--
-- SCOPE. One INSERT. No table, function, policy or grant is created or altered,
-- so there is no SECURITY DEFINER surface and nothing for the anon-revoke rule
-- to re-assert. No existing template row is read for update or modified. No
-- print job is enqueued.
-- ============================================================================

DO $migration$
DECLARE
  c_template_id    CONSTANT uuid := 'ed3fb150-2f08-5284-8ad0-f3c7def6658c';
  c_institution_id CONSTANT uuid := '29c221d1-b918-4c46-9d67-857273b0b553';
  c_name           CONSTANT text := 'Nattraja Vidhyalya CBSE Learner — Tall (2026)';
  v_inserted       integer;
  v_active         boolean;
BEGIN
  -- A database without this institution (a fresh local one) gets nothing rather
  -- than a foreign-key error. Says so out loud instead of failing silently.
  IF NOT EXISTS (SELECT 1 FROM public.institutions WHERE id = c_institution_id) THEN
    RAISE NOTICE 'Nattraja Vidhyalya CBSE (%) is not on this database — ID card template not seeded.',
      c_institution_id;
    RETURN;
  END IF;

  INSERT INTO public.id_card_templates (
    id, name, institution_id, front_layout_json, back_layout_json, field_mappings, active
  )
  SELECT
    c_template_id,
    c_name,
    c_institution_id,
    $front$
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
    $front$::jsonb,
    $back$
{
  "elements": [
    { "x": 44, "y": 70, "text": "BLOOD GROUP", "color": "#6b7280", "field": "static_text", "font_size": 17 },
    { "x": 44, "y": 96, "color": "#0b7d3e", "field": "blood_group", "font_size": 36, "font_weight": 800 },
    { "x": 44, "y": 180, "text": "DATE OF BIRTH", "color": "#6b7280", "field": "static_text", "font_size": 17 },
    { "x": 44, "y": 206, "color": "#111827", "field": "date_of_birth", "width": 550, "font_size": 27, "font_weight": 700 },
    { "x": 44, "y": 290, "text": "ADDRESS", "color": "#6b7280", "field": "static_text", "font_size": 17 },
    { "x": 44, "y": 316, "color": "#111827", "field": "address", "width": 556, "font_size": 18, "font_weight": 600 },
    { "x": 44, "y": 470, "text": "CONTACT", "color": "#6b7280", "field": "static_text", "font_size": 17 },
    { "x": 44, "y": 496, "color": "#111827", "field": "contact_phone", "width": 550, "font_size": 27, "font_weight": 700 },
    { "x": 44, "y": 800, "text": "PH: 99943 44986", "color": "#111827", "field": "static_text", "font_size": 17 },
    { "x": 44, "y": 836, "text": "nattrajavidhyalya@jkkn.ac.in", "color": "#111827", "field": "static_text", "font_size": 17 },
    { "x": 44, "y": 870, "text": "nv.jkkn.ac.in", "color": "#111827", "field": "static_text", "font_size": 17 }
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
    $back$::jsonb,
    $mappings$
[
  { "db_column": "learners_profiles.roll_number", "card_field": "roll_number" }
]
    $mappings$::jsonb,
    FALSE
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.id_card_templates t
    WHERE t.id = c_template_id
       OR (t.institution_id = c_institution_id AND t.name = c_name)
  );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Non-vacuous guard: it fires if the FALSE literal above is ever edited to
  -- TRUE. Scoped to a row this run actually inserted, so a replay after the
  -- Director has legitimately switched the template on stays a clean no-op.
  IF v_inserted = 1 THEN
    SELECT active INTO v_active FROM public.id_card_templates WHERE id = c_template_id;
    IF COALESCE(v_active, TRUE) THEN
      RAISE EXCEPTION
        'ID card template % was seeded ACTIVE. This template must ship dark — no artwork exists for Nattraja Vidhyalya CBSE and no verification print has been checked.',
        c_template_id;
    END IF;
    RAISE NOTICE 'Seeded dark ID card template % for Nattraja Vidhyalya CBSE.', c_template_id;
  ELSE
    RAISE NOTICE 'ID card template for Nattraja Vidhyalya CBSE already present — nothing written.';
  END IF;
END
$migration$;
