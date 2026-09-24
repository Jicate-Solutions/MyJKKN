-- ============================================================================
-- 20260924120000_id_card_matric_front_layout.sql
--
-- JKKN Matric Hr. Sec. School — FRONT layout matching the approved sample
-- (2026-09-24). Coordinates are canvas px on the 638 x 1014 portrait card,
-- measured off the sample:
--   photo box     x 209–431, y 166–437  (222 x 271 incl. frame)
--   name          red, centred, cap-height 27 px → 40 px bold, y 470
--   rows          FATHER / ADM.NO / CLASS / YEAR at y 556 / 606 / 656 / 706
--                 label x 152 (bold), colon column x 272, value x 288 (regular)
--   QR            140 px box at x 94, y 760 (code ≈122 px, MyJKKN ID line
--                 beneath, block ends y 900 above the green footer); the
--                 sample's 72 px code scanned unreliably, enlarged 2026-09-24
--   PRINCIPAL + signature, header, LEARNER ribbon: painted in the artwork.
--
-- Pair this with the blank artwork (no photo placeholder) uploaded on the
-- Card design tab. VALID UPTO is not present; the renderer adds nothing.
-- father_name is authored here, so the automatic FATHER-row insert is skipped.
--
-- APPLY by hand in the SQL editor (db push is broken in this repo).
-- ============================================================================

UPDATE public.id_card_templates
SET front_layout_json = front_layout_json || jsonb_build_object(
  'orientation', 'portrait',
  'elements', '[
    {"x":209,"y":166,"align":"center","field":"photo","width":222,"height":271},
    {"x":30, "y":470,"align":"center","color":"#c8102e","field":"name_line_1","width":578,"font_size":40,"font_weight":800},

    {"x":152,"y":556,"text":"FATHER","field":"static_text","width":115,"font_size":27,"font_weight":700},
    {"x":272,"y":556,"text":":","field":"static_text","font_size":27,"font_weight":700},
    {"x":288,"y":556,"field":"father_name","width":320,"font_size":27,"font_weight":400},

    {"x":152,"y":606,"text":"ADM.NO","field":"static_text","width":115,"font_size":27,"font_weight":700},
    {"x":272,"y":606,"text":":","field":"static_text","font_size":27,"font_weight":700},
    {"x":288,"y":606,"field":"roll_number","width":320,"font_size":27,"font_weight":400},

    {"x":152,"y":656,"text":"CLASS","field":"static_text","width":115,"font_size":27,"font_weight":700},
    {"x":272,"y":656,"text":":","field":"static_text","font_size":27,"font_weight":700},
    {"x":288,"y":656,"field":"course","width":320,"font_size":27,"font_weight":400},

    {"x":152,"y":706,"text":"YEAR","field":"static_text","width":115,"font_size":27,"font_weight":700},
    {"x":272,"y":706,"text":":","field":"static_text","font_size":27,"font_weight":700},
    {"x":288,"y":706,"field":"study_period","width":320,"font_size":27,"font_weight":400},

    {"x":94,"y":760,"field":"qr_code","width":140}
  ]'::jsonb),
  updated_at = now()
WHERE name = 'JKKN Matric Higher Secondary School Learner — Tall (2026)';

-- Verify
SELECT name, jsonb_array_length(front_layout_json->'elements') AS elements,
       front_layout_json->>'background_image' AS artwork
FROM public.id_card_templates
WHERE name = 'JKKN Matric Higher Secondary School Learner — Tall (2026)';
