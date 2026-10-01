-- ============================================================================
-- 20260925110000_id_card_college_front_layout.sql
--
-- All six COLLEGE learner templates — FRONT layout aligned to the school
-- cards (Matric / Nattraja, 2026-09-25 "apply for all other institutions").
-- Measured off the six artworks (638 x 1014 canvas): header + rule end at
-- y 152 (Engineering 124), LEARNER ribbon x 49–108 down to y ≈ 580, green
-- footer from y 930 (Engineering) / 937 in the QR column, PRINCIPAL
-- signature painted from y ≈ 802 on the right. Everything sits 18 px lower
-- than Nattraja so the photo clears the header rule:
--   photo    x 188, y 168, 262 x 320, centred
--   name     red, centred, 40 px bold, y 506
--   rows     FATHER / ROLL NO / COURSE / YEAR at y 592 / 642 / 692 / 742
--            label x 130 w 138 (bold; "ROLL NO" needs the wider column),
--            colon x 272, value x 288 w 330
--   QR       140 px box at x 94, y 786 (code ≈122 px, MyJKKN ID beneath,
--            block ends y 926 — above the footer on every artwork)
-- Previous college QR sat at x 36 inside the ribbon band; VALID UPTO removed
-- (learner cards carry none). father_name authored → automatic FATHER-row
-- insert is skipped. Institution blocks, back layouts and artwork untouched.
--
-- NOT covered: "Engineering Senior Learner (Facilitator)" (team-member fields).
--
-- APPLY by hand in the SQL editor (db push is broken in this repo).
-- ============================================================================

UPDATE public.id_card_templates
SET front_layout_json = front_layout_json || jsonb_build_object(
  'orientation', 'portrait',
  'elements', '[
    {"x":188,"y":168,"align":"center","field":"photo","width":262,"height":320},
    {"x":30, "y":506,"align":"center","color":"#c8102e","field":"name_line_1","width":578,"font_size":40,"font_weight":800},

    {"x":130,"y":592,"text":"FATHER","field":"static_text","width":138,"font_size":27,"font_weight":700},
    {"x":272,"y":592,"text":":","field":"static_text","font_size":27,"font_weight":700},
    {"x":288,"y":592,"field":"father_name","width":330,"font_size":27,"font_weight":400},

    {"x":130,"y":642,"text":"ROLL NO","field":"static_text","width":138,"font_size":27,"font_weight":700},
    {"x":272,"y":642,"text":":","field":"static_text","font_size":27,"font_weight":700},
    {"x":288,"y":642,"field":"roll_number","width":330,"font_size":27,"font_weight":400},

    {"x":130,"y":692,"text":"COURSE","field":"static_text","width":138,"font_size":27,"font_weight":700},
    {"x":272,"y":692,"text":":","field":"static_text","font_size":27,"font_weight":700},
    {"x":288,"y":692,"field":"course","width":330,"font_size":27,"font_weight":400},

    {"x":130,"y":742,"text":"YEAR","field":"static_text","width":138,"font_size":27,"font_weight":700},
    {"x":272,"y":742,"text":":","field":"static_text","font_size":27,"font_weight":700},
    {"x":288,"y":742,"field":"study_period","width":330,"font_size":27,"font_weight":400},

    {"x":94,"y":786,"field":"qr_code","width":140}
  ]'::jsonb),
  updated_at = now()
WHERE id IN (
  'ad0642ec-10c5-4b06-859e-7006734eb8f8',  -- Engineering Learner
  '45898dc7-c4c4-5d38-bdba-585a31916bfb',  -- Allied Health Sciences Learner
  '53e0d3ba-446c-5894-87d8-aa4d287567d1',  -- Nursing and Research Learner
  'bfde2083-26fe-5fd5-ad3a-34e3e97cb74e',  -- Arts and Science (Aided) Learner
  'fa2c6cf0-19dd-5f6c-9941-2f9ce81ef06d',  -- Arts and Science (Self) Learner
  'ff878e29-e924-572b-b602-08b0eb945e82'   -- Pharmacy Learner
);

-- Verify: six rows, 15 elements each
SELECT name, jsonb_array_length(front_layout_json->'elements') AS elements,
       (SELECT el FROM jsonb_array_elements(front_layout_json->'elements') el WHERE el->>'field' = 'qr_code') AS qr
FROM public.id_card_templates
WHERE id IN ('ad0642ec-10c5-4b06-859e-7006734eb8f8','45898dc7-c4c4-5d38-bdba-585a31916bfb',
             '53e0d3ba-446c-5894-87d8-aa4d287567d1','bfde2083-26fe-5fd5-ad3a-34e3e97cb74e',
             'fa2c6cf0-19dd-5f6c-9941-2f9ce81ef06d','ff878e29-e924-572b-b602-08b0eb945e82')
ORDER BY name;
