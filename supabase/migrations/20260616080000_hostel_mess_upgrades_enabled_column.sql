-- Per-category "allow upgrades" flag. Default false = opt-in: after deploy no learner
-- sees upgrade options until an admin enables it per category (clean slate on top of the
-- 2026-06-16 upgrade-waitlist reset). Gate basis is the learner's CURRENT category.
ALTER TABLE public.hostel_categories
  ADD COLUMN IF NOT EXISTS upgrades_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.mess_categories
  ADD COLUMN IF NOT EXISTS upgrades_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hostel_categories.upgrades_enabled IS
  'When true, residents currently in this room category see/can use self-service upgrade options on My Hostel. Default false (opt-in). First-booking is unaffected.';
COMMENT ON COLUMN public.mess_categories.upgrades_enabled IS
  'When true, residents currently in this mess category see/can use mess upgrade options on My Hostel. Default false (opt-in).';
