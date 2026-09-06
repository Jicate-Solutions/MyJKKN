-- ============================================================================
-- Mess menu vocabulary → mess_categories (classic | premium)
-- ============================================================================
-- Date: 2026-06-12. Director decision (supersedes the D2 lock of 2026-05-25).
--
-- D2 aliased the mess menus onto the hostel ROOM-tier ladder
-- (CLASSIC→'standard', PREMIUM→'premium', PREMIUM++→'premium_plus'). But the
-- canonical mess vocabulary — the mess_categories table the team actually
-- manages (created 2026-05-28, AFTER D2) — is Classic | Premium × boys/girls.
-- The alias produced: a phantom 'premium_plus' menu tier with ZERO menus, a
-- 'Classic' plan that never appears in the menu system, and resident menu
-- resolution keyed on ROOM tier instead of the mess plan they pay for
-- (live mismatch: all 3 current residents are standard-room + Premium-mess).
--
-- This migration re-keys the DATA. Code lands in the same PR: menus +
-- Choose Your Menu now speak 'classic' | 'premium', and My Meals resolves
-- from learners_profiles.mess_category_id. Room tiers (hostel_tier_policy:
-- standard/premium/premium_plus) are untouched and keep room perks
-- (housekeeping quotas, premium stay, fee uplift).
--
-- No DDL — value updates only. fn_mess_menu_week filters tier_key as plain
-- text (validates gender only), so no function change is needed.
-- Idempotent: WHERE clauses make every statement a no-op on re-run.
-- ============================================================================

-- 1. Menu cells: 'standard' → 'classic' (28 rows at authoring; 'premium' stays).
UPDATE public.mess_menus SET tier_key = 'classic' WHERE tier_key = 'standard';

-- 2. Choose Your Menu substrate tables (0 rows at authoring — correctness
--    insurance in case rows appear between authoring and application).
UPDATE public.mess_meal_choices        SET tier_key = 'classic' WHERE tier_key = 'standard';
UPDATE public.mess_meal_alternatives   SET tier_key = 'classic' WHERE tier_key = 'standard';
UPDATE public.mess_special_day_proposals SET tier_key = 'classic' WHERE tier_key = 'standard';

-- 3. Choose Your Menu tier-list config rows (feature is dark + never edited,
--    so overwriting the seeded values is safe).
UPDATE public.platform_policies
SET value = '["premium"]'::jsonb, updated_at = now()
WHERE policy_key = 'mess.choose.personalization.enabled_tiers'
  AND scope_type = 'global' AND scope_id IS NULL;

UPDATE public.platform_policies
SET value = '["classic","premium"]'::jsonb, updated_at = now()
WHERE policy_key = 'mess.choose.voting.enabled_tiers'
  AND scope_type = 'global' AND scope_id IS NULL;
