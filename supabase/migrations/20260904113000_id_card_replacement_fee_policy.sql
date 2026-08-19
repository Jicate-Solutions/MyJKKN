-- ============================================================================
-- Migration: 20260904113000_id_card_replacement_fee_policy
-- Who may hold an ID card, and what a replacement costs — as config, not code.
-- ============================================================================
-- 🛑 FILE ONLY — NOT APPLIED. Director-gated. Do not run this against
-- production as part of merging the pull request that adds it.
--
-- WHY THESE ROWS EXIST
--   POST /api/id-cards/jobs now refuses two things it used to wave through:
--     1. a person who has LEFT (a learner whose lifecycle status is no longer
--        card-worthy, or a team member whose record is inactive);
--     2. a REPLACEMENT card — the person's 2nd and later card — unless a
--        replacement fee has been configured and the caller accepted it.
--   Per the standing config-table rule (docs/architecture/config-table-pattern.md)
--   every one of those tunables is a platform_policies row read at runtime.
--
-- 🛑 THE FEE AMOUNT IS DELIBERATELY UNSET.
--   `id_card.replacement.fee_amount` is seeded as JSON null, NOT as a number.
--   The price is a Director decision that has not been made, and this migration
--   does not make it. Until a super admin sets it, the endpoint REFUSES every
--   replacement card and says exactly that. It never falls back to zero and it
--   never invents a figure. Seeding JSON null (not SQL NULL) satisfies the
--   `value JSONB NOT NULL` column, exactly as `id_card.station.endpoint_url`
--   already does on this table.
--
-- APPLYING THIS FILE DOES NOT TURN THE GUARDS ON.
--   The guards ship with the same defaults in code, so they are live the moment
--   the application deploys. These rows exist so the defaults can be RETUNED
--   without a deploy — and so the fee can be set at all.
--
-- MEASURED READ-ONLY AGAINST PRODUCTION 2026-08-14 (nothing written):
--   • 1,298 learner-linked profiles are graduated / inactive / exited — every
--     one of them can be sent to the printer today and cannot after this.
--   • 117 profiles resolve to a team-member record with is_active = false.
--   • 340 profiles resolve to neither a learner nor a team-member record
--     (administrative / service accounts). They stay printable on purpose: the
--     guard refuses people who can be SHOWN to have left.
--   • 0 profiles carry a learner_id with no learners_profiles row, so failing
--     closed on that case refuses nobody who is printable today.
--   • id_card_print_jobs holds 10 rows, all 'printed', over 5 people — and 4 of
--     those 5 already have more than one. The replacement rule is not
--     hypothetical; it bites on the next reprint.
--
-- No BEGIN/COMMIT in this file, so a reviewer's BEGIN .. ROLLBACK rehearsal
-- against production actually rolls back. Idempotent; safe to re-apply.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Eligibility — which learners may hold a card
-- ----------------------------------------------------------------------------
-- The default is NOT invented here. It is the union of the three cohort choices
-- the batch-print screen already offers (STATUS_CHOICES in
-- components/admin/id-cards/id-card-batch-print.tsx, Director-locked
-- 2026-07-25), whose own comment records the rule as "card-worthy statuses only
-- — enquiries, rejected and exited learners are never offered". This row moves
-- that browser-side rule to where a direct POST cannot skip it.
--
-- data_type must be one of ('number','string','boolean','array','object','enum')
-- per platform_policies_data_type_check.
INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, description, data_type, enum_options, is_system, is_active
) VALUES
  (
    'id_card.eligibility.learner_statuses', 'global', NULL,
    '["active","admitted","account","reserved"]'::jsonb,
    'Lifecycle statuses an ID card may be printed for. A learner outside this list is refused with a reason — this covers both people who have LEFT (graduated, exited, inactive, withdrawal_pending) and people not yet on the rolls (enquiry, rejected, waitlisted, approved). Mirrors the batch-print screen''s card-worthy cohort choices.',
    'array', NULL, FALSE, TRUE
  )
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Replacement cards — first free, later ones chargeable
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, description, data_type, enum_options, is_system, is_active
) VALUES
  (
    'id_card.replacement.free_card_count', 'global', NULL,
    to_jsonb(1),
    'How many ID cards a person receives at no charge before the replacement fee applies. 1 = the first card is free and every card after it is a chargeable replacement.',
    'number', NULL, FALSE, TRUE
  ),
  (
    'id_card.replacement.fee_amount', 'global', NULL,
    'null'::jsonb,
    'Fee charged for a replacement ID card. DELIBERATELY UNSET — the amount is a Director decision that has not been made. While this is null the print endpoint REFUSES every replacement card and names this key in the refusal; it never prints a free replacement and never assumes a figure. Set a number here to switch replacements on.',
    'number', NULL, FALSE, TRUE
  ),
  (
    'id_card.replacement.fee_currency', 'global', NULL,
    to_jsonb('INR'::TEXT),
    'Currency the replacement fee is quoted in. INR is this platform''s currency everywhere money is displayed.',
    'string', NULL, FALSE, TRUE
  )
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. No function is created, replaced or altered by this file
-- ----------------------------------------------------------------------------
-- Deliberate. The guards read these rows through the ordinary
-- `platform_policies` SELECT policy (auth.uid() IS NOT NULL), the same way
-- app/api/id-cards/policy/route.ts already reads the table, so there is no new
-- SECURITY DEFINER surface to lock down and `fn_get_id_card_policy` keeps its
-- current signature and ACL untouched. It also means the guards behave
-- correctly on a database where this file has never been applied: no rows found
-- → the code defaults apply → an unset fee still refuses every replacement.
