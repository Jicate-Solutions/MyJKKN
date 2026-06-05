-- Retire the learners_profiles.accommodation_type TEXT column (FK-only:
-- accommodation_type_id → accommodation_types). Every reader/writer now uses the
-- FK; the only remaining references were the shadow-FK trigger + its function,
-- which only existed to derive this text→FK and are now dead weight. Dropping
-- the trigger, function, and column in one transaction means no insert can land
-- in a window where the NOT-NULL text column is unfilled.
--
-- Pre-drop verification (2026-06-03): nonblank_text_missing_fk=0, has_fk=5189,
-- blank_both=482 (blank text → null FK, semantically equivalent). FK-only
-- hosteler set == old text-or-FK set (896 = 896). No views/RPCs referenced the
-- column after migrations 20260602188000/189000/190000.

DROP TRIGGER IF EXISTS trg_learners_profiles_sync_shadow_fks ON public.learners_profiles;
DROP FUNCTION IF EXISTS public.learners_profiles_sync_shadow_fks();
ALTER TABLE public.learners_profiles DROP COLUMN IF EXISTS accommodation_type;
