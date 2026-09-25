-- ============================================================================
-- 20260925100000_id_card_nattraja_front_layout.sql
--
-- Nattraja Vidhyalya (CBSE) — FRONT layout aligned to the Matric Hr. Sec.
-- School card (2026-09-25, "refer matriculation id card"). The two artworks
-- share one geometry (LEARNER ribbon x 0–80, photo zone, green footer from
-- y ≈ 940), so the element set is the Matric one verbatim:
--   photo    x 188, y 150, 262 x 320, centred (Matric photo, 18 px lower per in-charge)
--   name     red, centred, 40 px bold, y 488
--   rows     FATHER / ADM.NO / CLASS / YEAR at y 574 / 624 / 674 / 724 (Matric + 18)
--            label x 152 (bold), colon x 272, value x 288
--   QR       140 px box at x 94, y 778 (code ≈122 px, MyJKKN ID beneath, ends y 918)
-- Previous Nattraja QR sat at x 36 — inside the ribbon band — and the
-- MyJKKN ID line was clipped on the card's left edge.
-- VALID UPTO removed (learner cards carry none).
--
-- APPLY by hand in the SQL editor (db push is broken in this repo).
-- ============================================================================

UPDATE public.id_card_templates
SET front_layout_json = front_layout_json || jsonb_build_object(
  'orientation', 'portrait',
  'elements', '[
    {"x":188,"y":150,"align":"center","field":"photo","width":262,"height":320},
    {"x":30, "y":488,"align":"center","color":"#c8102e","field":"name_line_1","width":578,"font_size":40,"font_weight":800},

    {"x":152,"y":574,"text":"FATHER","field":"static_text","width":115,"font_size":27,"font_weight":700},
    {"x":272,"y":574,"text":":","field":"static_text","font_size":27,"font_weight":700},
    {"x":288,"y":574,"field":"father_name","width":320,"font_size":27,"font_weight":400},

    {"x":152,"y":624,"text":"ADM.NO","field":"static_text","width":115,"font_size":27,"font_weight":700},
    {"x":272,"y":624,"text":":","field":"static_text","font_size":27,"font_weight":700},
    {"x":288,"y":624,"field":"roll_number","width":320,"font_size":27,"font_weight":400},

    {"x":152,"y":674,"text":"CLASS","field":"static_text","width":115,"font_size":27,"font_weight":700},
    {"x":272,"y":674,"text":":","field":"static_text","font_size":27,"font_weight":700},
    {"x":288,"y":674,"field":"course","width":320,"font_size":27,"font_weight":400},

    {"x":152,"y":724,"text":"YEAR","field":"static_text","width":115,"font_size":27,"font_weight":700},
    {"x":272,"y":724,"text":":","field":"static_text","font_size":27,"font_weight":700},
    {"x":288,"y":724,"field":"study_period","width":320,"font_size":27,"font_weight":400},

    {"x":94,"y":778,"field":"qr_code","width":140}
  ]'::jsonb),
  updated_at = now()
WHERE id = 'ed3fb150-2f08-5284-8ad0-f3c7def6658c'; -- Nattraja Vidhyalya CBSE Learner — Tall (2026)

-- Verify: expect 15 elements
SELECT name, jsonb_array_length(front_layout_json->'elements') AS elements
FROM public.id_card_templates
WHERE id = 'ed3fb150-2f08-5284-8ad0-f3c7def6658c'; -- Nattraja Vidhyalya CBSE Learner — Tall (2026)
