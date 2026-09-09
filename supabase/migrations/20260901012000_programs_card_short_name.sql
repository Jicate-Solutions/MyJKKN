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

-- NO seed values. The Director supplies the exact wording per programme, and a
-- guessed abbreviation would print on real plastic. Every row stays NULL until
-- then, which is the safe state: the card falls back to the full programme
-- name, exactly as it does today.
