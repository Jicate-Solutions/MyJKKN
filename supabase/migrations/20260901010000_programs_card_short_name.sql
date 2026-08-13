-- 2026-09-01 — programs.card_short_name
--
-- WHY: the printed ID card has a narrow COURSE line. The physical cards JKKN
-- issues today read "BTECH IT"; the database only holds the full
-- "B.Tech. Information Technology", which overflows the line.
--
-- WHY NOT display_name: that column already means "the subject without the
-- degree" ("ZOOLOGY" for "B.Sc. ZOOLOGY") and is read across the app.
-- Repurposing it would silently change those screens.
--
-- NULL is the safe default: the card render falls back to the full programme
-- name whenever this is empty, so nothing breaks for the 100+ programmes that
-- are not carded yet.

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS card_short_name text;

COMMENT ON COLUMN public.programs.card_short_name IS
  'Short form for the printed ID card COURSE line (e.g. "BTECH IT"). NULL → the card falls back to program_name. Not a display name for screens — see display_name for that.';

-- Engineering's programmes, the cohort being carded first. Forms follow the
-- institution''s own physical cards. Left NULL elsewhere on purpose.
UPDATE public.programs SET card_short_name = 'BE CSE'
 WHERE program_name = 'B.E. Computer Science and Engineering' AND card_short_name IS NULL;
UPDATE public.programs SET card_short_name = 'BE EEE'
 WHERE program_name = 'B.E. Electrical and Electronics Engineering' AND card_short_name IS NULL;
UPDATE public.programs SET card_short_name = 'BE ECE'
 WHERE program_name = 'B.E. Electronics and Communication Engineering' AND card_short_name IS NULL;
UPDATE public.programs SET card_short_name = 'BE MECH'
 WHERE program_name = 'B.E. Mechanical Engineering' AND card_short_name IS NULL;
UPDATE public.programs SET card_short_name = 'BTECH IT'
 WHERE program_name = 'B.Tech. Information Technology' AND card_short_name IS NULL;
