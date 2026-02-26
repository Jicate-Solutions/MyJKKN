-- Migration: Seed default IMS measurement units
-- Date: 2026-02-18
-- Description: Insert common measurement units into ims_units table.
-- The ims_units table was empty, which blocked item creation
-- because the Base Unit dropdown had no options.
-- ON CONFLICT DO NOTHING ensures idempotency.

INSERT INTO public.ims_units (name, abbreviation, is_base_unit) VALUES
  ('Piece', 'pcs', true),
  ('Kilogram', 'kg', true),
  ('Gram', 'g', false),
  ('Litre', 'L', true),
  ('Millilitre', 'mL', false),
  ('Meter', 'm', true),
  ('Centimeter', 'cm', false),
  ('Box', 'box', true),
  ('Pack', 'pack', true),
  ('Dozen', 'doz', false),
  ('Ream', 'ream', true),
  ('Bottle', 'btl', true),
  ('Roll', 'roll', true),
  ('Set', 'set', true),
  ('Pair', 'pair', true)
ON CONFLICT DO NOTHING;
