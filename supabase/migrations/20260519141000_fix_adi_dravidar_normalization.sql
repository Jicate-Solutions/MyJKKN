-- ============================================================================
-- Fix the Adi Dravida normalization regex from the prior migration.
-- ============================================================================
-- Created: 2026-05-19
--
-- The previous migration (20260519140000_normalize_community_caste.sql) used
-- the character class `[AR]?` to match the trailing "AR" in ADI DRAVIDAR.
-- That was a bug: `[AR]?` is a CHARACTER CLASS that matches ONE char (A, R,
-- or empty) — it can't match the TWO chars "AR" in sequence.
--
-- Result: 115 rows with the exact value "ADI DRAVIDAR" were left untouched
-- while the related variants ADIDRAVIDAR, ADHIDRAVIDAR, AADHIDRAVIDAR, ADI
-- THIRAVIDAR DID normalize via their dedicated branches.
--
-- This migration consolidates the remaining cluster into "Adi Dravida" using
-- the correct `(AR?|R)` group form. Same canonical target as the prior
-- migration; just catching the rows the buggy regex missed.
-- ============================================================================

UPDATE public.learners_profiles
SET caste = 'Adi Dravida'
WHERE caste IS NOT NULL
  AND upper(trim(caste)) ~ '^ADI[\s\-]*DRAVID(AR?|R)$';
