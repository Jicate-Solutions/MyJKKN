-- Phase 4 of the Freshers-semester removal (2026-08-05).
-- Without this the removal is cosmetic: programs_seed_freshers is an AFTER INSERT
-- trigger on programs that recreates a Freshers semester (semester_order = 0) plus
-- a section 'A' for every new program, so the placeholder rows would come straight
-- back on the next program insert.
--
-- Reverses 20260727_programs_seed_freshers_trigger.sql and the trigger half of
-- 20260727_seed_freshers_semester_and_section.sql. First-year admissions now go
-- directly to the program's first real term, which Phase 2 made deterministic by
-- flagging initial_semester on the 28 programs that had ambiguous ordering.
DROP TRIGGER IF EXISTS programs_seed_freshers ON public.programs;
DROP FUNCTION IF EXISTS public.seed_freshers_semester_for_program();
