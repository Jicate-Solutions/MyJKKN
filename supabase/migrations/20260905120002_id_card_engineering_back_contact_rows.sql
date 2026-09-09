-- ============================================================================
-- 20260905120000_id_card_engineering_back_contact_rows.sql
--
-- Engineering ID-card BACK: lay every text row on the icon rows of the back
-- artwork (measured from the uploaded PNG, 638x1014) and make the college
-- contact lines DYNAMIC — they read the Institution tab's block on the
-- template (id_card_templates.front_layout_json -> 'institution':
-- phone / email / website) instead of text typed into the layout.
--
-- Measured icon rows (canvas px; centre = the row the value is centred on):
--   blood drop   y  26- 79  centre  52     "PH:" label  y 687-704  centre 696
--   calendar     y 129-177  centre 153     envelope     y 760-804  centre 782
--   house        y 226-286  centre 256     globe        y 841-895  centre 868
--   phone        y 443-506  centre 474     widest icon right edge x = 107
--
-- Renderer rules this relies on (lib/id-cards/render-card.tsx, icon mode =
-- headings hidden + artwork present):
--   • a value snaps to the hidden heading above it and centres its whole block
--     on heading.y + 30      → heading y = icon centre − 30
--   • a value with no heading within 90px keeps its own y (top edge)
--                            → y = icon centre − 12 for a 20px line
--   • every line starts at min(heading.x) + icon_gutter = 44 + 80 = 124
--     (17px clear of the widest icon)
--
-- SCOPE. Only templates using THIS artwork (asset id in the URL). Idempotent.
-- APPLY. `supabase db push` is broken in this repo — run by hand in the SQL
-- editor, then Back side tab → "Preview with a learner".
-- ============================================================================

UPDATE public.id_card_templates
SET back_layout_json = back_layout_json
  || jsonb_build_object('icon_gutter', 80)
  || jsonb_build_object('elements', '[
    {"x":44,"y":22, "text":"BLOOD GROUP",   "color":"#6b7280","field":"static_text","font_size":17},
    {"x":44,"y":52, "color":"#0b7d3e","field":"blood_group","font_size":36,"font_weight":800},
    {"x":44,"y":123,"text":"DATE OF BIRTH", "color":"#6b7280","field":"static_text","font_size":17},
    {"x":44,"y":153,"color":"#111827","field":"date_of_birth","width":550,"font_size":27,"font_weight":700},
    {"x":44,"y":226,"text":"ADDRESS",       "color":"#6b7280","field":"static_text","font_size":17},
    {"x":44,"y":256,"color":"#111827","field":"address","width":556,"font_size":18,"font_weight":600},
    {"x":44,"y":444,"text":"CONTACT",       "color":"#6b7280","field":"static_text","font_size":17},
    {"x":44,"y":474,"color":"#111827","field":"contact_phone","width":550,"font_size":27,"font_weight":700},
    {"x":44,"y":684,"color":"#111827","field":"institution_phone",  "width":556,"font_size":20,"font_weight":700},
    {"x":44,"y":770,"color":"#111827","field":"institution_email",  "width":556,"font_size":20,"font_weight":700},
    {"x":44,"y":856,"color":"#111827","field":"institution_website","width":556,"font_size":20,"font_weight":700}
  ]'::jsonb),
  updated_at = now()
WHERE back_layout_json IS NOT NULL
  AND back_layout_json->>'background_image' LIKE '%ad0642ec-10c5-4b06-859e-7006734eb8f8%';

-- The three institution_* rows print whatever the Institution tab holds for the
-- template: Contact number(s) → institution_phone, Email → institution_email,
-- Website → institution_website (rendered as "www.engg.jkkn.ac.in" — scheme and
-- trailing slash are dropped by the renderer).
