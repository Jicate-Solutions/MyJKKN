-- ============================================================================
-- Migration: 2026052811000_hostel_fees_policy_harmonization
-- PR α — Hostel Fee Architecture
-- ============================================================================
-- Date: 2026-05-28
-- Director: 5 interview rounds locking 31 architectural decisions for the
-- Fractional Occupancy Fee Model + Admission Packages + Eligibility Matrix
-- + AC Architecture. See ~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/
-- for full reasoning trail.
--
-- This is a platform_policies-only migration. No tables, no UI, no service
-- code. 30 new policy rows across 6 ui_category groupings + 2 supersedes.
--
-- Supersedes 2 morning-locked policies invalidated by pro-rata-rest-of-year
-- model:
--   - hostel.tier.late_joiner_minimum_months (replaced by
--     fractional_occupancy.upgrader_pricing_formula = pro-rata diff)
--   - mess.fee.late_joiner_minimum_months (replaced by mess.billing.refund_mode
--     = none + mess.billing.default_cadence = upfront_hostel_year)
--
-- DEFERRED to PR α₂ (after PR #1112 merges):
--   - hostel.room.ac_refund_mode value change to 'none'
--   - hostel.room.ac_late_joiner_minimum_months drop / supersede
--   - hostel_billable_amenities row updates (substrate not yet in main)
--
-- Idempotent. Safe to re-apply.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Section A: Supersede 2 morning-locked policies
-- ----------------------------------------------------------------------------
-- platform_policies has no superseded_at/superseded_by columns. Pattern:
-- set is_active=false + amend description with supersede pointer.

UPDATE platform_policies
SET is_active = false,
    description = COALESCE(description, '') ||
      ' [SUPERSEDED 2026-05-28 by fractional_occupancy.upgrader_pricing_formula = ' ||
      '"premium_pro_rata_minus_classic_pro_rata". Late-joiner minimum-months replaced ' ||
      'by pro-rata-rest-of-year model with no refunds.]',
    updated_at = now()
WHERE policy_key = 'hostel.tier.late_joiner_minimum_months'
  AND scope_type = 'global'
  AND scope_id IS NULL
  AND is_active = true;

UPDATE platform_policies
SET is_active = false,
    description = COALESCE(description, '') ||
      ' [SUPERSEDED 2026-05-28 by mess.billing.default_cadence = "upfront_hostel_year" ' ||
      'and mess.billing.refund_mode = "none". Late-joiner minimum-months no longer applies ' ||
      'under upfront/no-refund mess model.]',
    updated_at = now()
WHERE policy_key = 'mess.fee.late_joiner_minimum_months'
  AND scope_type = 'global'
  AND scope_id IS NULL
  AND is_active = true;

-- ----------------------------------------------------------------------------
-- Section B: Insert 30 new platform_policies rows
-- ----------------------------------------------------------------------------
-- All rows are global, is_system=true (architectural locks; not freely tweakable),
-- classification='major' (architectural decisions, change cascades to billing).
-- Idempotent via unique-key DO NOTHING.

INSERT INTO platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   is_system, is_active, classification, publication_state, ui_category)
VALUES

-- =========================================================================
-- ui_category: "Hostel Fees — Fractional Occupancy" (10 rows)
-- =========================================================================
('fractional_occupancy.trigger_model', 'global', NULL,
  '"opt_in_only"'::jsonb,
  'Fractional pricing kicks in only when learner explicitly opts into Premium Stay. Classic stays at flat per-bed price regardless of occupancy.',
  'string', true, true, 'major', 'published',
  'Hostel Fees — Fractional Occupancy'),

('fractional_occupancy.payment_timing', 'global', NULL,
  '"upfront_hostel_year"'::jsonb,
  'Full year''s fractional-occupancy fee is collected at allocation time, anchored to hostel year (June–May per hostel.year.start_month).',
  'string', true, true, 'major', 'published',
  'Hostel Fees — Fractional Occupancy'),

('fractional_occupancy.refund_mode', 'global', NULL,
  '"none"'::jsonb,
  'No refunds on exit from Premium Stay. Paid is paid.',
  'string', true, true, 'major', 'published',
  'Hostel Fees — Fractional Occupancy'),

('fractional_occupancy.multiplier_cap', 'global', NULL,
  'null'::jsonb,
  'No cap on fractional multiplier. Sole occupant of a 6-bed room pays 6× the per-bed base rate.',
  'object', true, true, 'major', 'published',
  'Hostel Fees — Fractional Occupancy'),

('fractional_occupancy.mid_year_vacancy_rebalance', 'global', NULL,
  'false'::jsonb,
  'When occupancy drops mid-year (e.g., roommate exits), existing residents'' fees do NOT change. Their upfront payment is locked.',
  'boolean', true, true, 'major', 'published',
  'Hostel Fees — Fractional Occupancy'),

('fractional_occupancy.vacancy_notification_scope', 'global', NULL,
  '"hostel_cluster_gender_matched"'::jsonb,
  'Vacancy invitations broadcast within same hostel cluster (e.g., Boys Hostel A/B/C treated as one pool), gender-matched.',
  'string', true, true, 'major', 'published',
  'Hostel Fees — Fractional Occupancy'),

('fractional_occupancy.upgrader_pricing_formula', 'global', NULL,
  '"premium_pro_rata_minus_classic_pro_rata"'::jsonb,
  'Mid-year upgrader pays only the differential: (Premium pro-rata for remaining months) minus (Classic pro-rata for remaining months).',
  'string', true, true, 'major', 'published',
  'Hostel Fees — Fractional Occupancy'),

('fractional_occupancy.empty_vacancy_drop_pct', 'global', NULL,
  '20'::jsonb,
  'Percentage by which the upgrade-differential price auto-drops every interval if no taker is found. Encourages mid-year uptake of unsold Premium seats.',
  'number', true, true, 'major', 'published',
  'Hostel Fees — Fractional Occupancy'),

('fractional_occupancy.empty_vacancy_drop_interval_days', 'global', NULL,
  '60'::jsonb,
  'Days between successive auto-drops of the empty-vacancy upgrade-differential.',
  'number', true, true, 'major', 'published',
  'Hostel Fees — Fractional Occupancy'),

('fractional_occupancy.sole_by_no_fault_treatment', 'global', NULL,
  '"same_as_voluntary"'::jsonb,
  'No special pricing for learners who become sole occupant involuntarily (roommate exits). Their locked upfront payment stands; no rebill, no refund.',
  'string', true, true, 'major', 'published',
  'Hostel Fees — Fractional Occupancy'),

-- =========================================================================
-- ui_category: "Hostel Fees — Mess" (3 rows)
-- =========================================================================
('mess.billing.default_cadence', 'global', NULL,
  '"upfront_hostel_year"'::jsonb,
  'Default mess fee timing: collected upfront for the full hostel year (June–May) at allocation.',
  'string', true, true, 'major', 'published',
  'Hostel Fees — Mess'),

('mess.billing.monthly_eligibility_authority', 'global', NULL,
  '"program_flag"'::jsonb,
  'Per-program flag determines whether monthly mess billing is allowed. Default: upfront. Program admins can flip the flag for programs where monthly is operationally required.',
  'string', true, true, 'major', 'published',
  'Hostel Fees — Mess'),

('mess.billing.refund_mode', 'global', NULL,
  '"none"'::jsonb,
  'No refund on mess fees for unused months or early exit.',
  'string', true, true, 'major', 'published',
  'Hostel Fees — Mess'),

-- =========================================================================
-- ui_category: "Admission Packages" (4 rows)
-- =========================================================================
('admission.packages.ownership.price', 'global', NULL,
  '"admission_module"'::jsonb,
  'Admission module owns the package total price (the single number quoted to applicants). Campus Living provides cost-component inputs but does not set the customer-facing price.',
  'string', true, true, 'major', 'published',
  'Admission Packages'),

('admission.packages.ownership.contents', 'global', NULL,
  '"campus_living_module"'::jsonb,
  'Campus Living module owns the bundled categories inside a package (which room tier, which mess option, which amenities). Admission cannot edit contents directly.',
  'string', true, true, 'major', 'published',
  'Admission Packages'),

('admission.packages.room_floor', 'global', NULL,
  '"classic"'::jsonb,
  'Every admission package''s room component is Classic. Premium is never bundled into an admission package — it must be opted into separately by the learner.',
  'string', true, true, 'major', 'published',
  'Admission Packages'),

('admission.packages.mess_choice_decoupled', 'global', NULL,
  'true'::jsonb,
  'Learner picks mess option separately at admission (within program-eligible categories) rather than mess being pre-bundled in the package.',
  'boolean', true, true, 'major', 'published',
  'Admission Packages'),

-- =========================================================================
-- ui_category: "Premium Upgrade" (5 rows)
-- =========================================================================
('premium.upgrade.trigger', 'global', NULL,
  '"opt_in_only"'::jsonb,
  'Premium upgrade is always learner-initiated — at admission OR mid-year when a vacancy invitation arrives. Never auto-assigned.',
  'string', true, true, 'major', 'published',
  'Premium Upgrade'),

('premium.upgrade.full_at_admission_handling', 'global', NULL,
  '"pay_upfront_with_provisional_classic_and_pending_entitlement"'::jsonb,
  'If Premium is full at admission and learner wants Premium: pay full Premium upfront, get a Classic room provisionally, retain top-priority pending entitlement for the next Premium vacancy.',
  'string', true, true, 'major', 'published',
  'Premium Upgrade'),

('premium.upgrade.pending_entitlement.fulfillment_price', 'global', NULL,
  '"zero_differential_free"'::jsonb,
  'When pending Premium entitlement is fulfilled (vacancy materializes), no extra cost — they already paid Premium at admission.',
  'string', true, true, 'major', 'published',
  'Premium Upgrade'),

('premium.upgrade.pending_entitlement.priority_ordering', 'global', NULL,
  '"admission_package_value_descending"'::jsonb,
  'Multiple learners with pending Premium entitlements: higher-value admission package gets the next vacancy first.',
  'string', true, true, 'major', 'published',
  'Premium Upgrade'),

('premium.upgrade.pending_entitlement.unfulfilled_at_year_end', 'global', NULL,
  '"institutional_surplus_no_refund"'::jsonb,
  'If no Premium vacancy materializes by hostel-year end, the differential becomes institutional surplus. No refund to learner.',
  'string', true, true, 'major', 'published',
  'Premium Upgrade'),

-- =========================================================================
-- ui_category: "Eligibility" (4 rows)
-- =========================================================================
('eligibility.granularity', 'global', NULL,
  '"per_program"'::jsonb,
  'Eligibility (which room categories, which mess options) is configured per academic program. Different programs (BDS vs B.Pharm vs B.E.) can have different allowed sets.',
  'string', true, true, 'major', 'published',
  'Eligibility'),

('eligibility.mid_year_expansion', 'global', NULL,
  '"immediate"'::jsonb,
  'When a program''s eligibility is expanded mid-year (new room category becomes allowed), the change takes effect immediately. Learners in that program can use the vacancy invitation flow to access newly-eligible categories.',
  'string', true, true, 'major', 'published',
  'Eligibility'),

('eligibility.mid_year_restriction', 'global', NULL,
  '"forward_only_grandfathered"'::jsonb,
  'When a program''s eligibility is restricted mid-year (a category becomes disallowed), existing residents are grandfathered for the current hostel year. The restriction applies only to new allocations.',
  'string', true, true, 'major', 'published',
  'Eligibility'),

('eligibility.multi_program_resolution', 'global', NULL,
  '"most_permissive_union"'::jsonb,
  'Dual-degree or multi-program learners get the union of all eligible categories across their enrolled programs (most-permissive resolution).',
  'string', true, true, 'major', 'published',
  'Eligibility'),

-- =========================================================================
-- ui_category: "AC Architecture" (4 rows)
-- =========================================================================
('ac.architecture_model', 'global', NULL,
  '"separate_billable_amenity_orthogonal_to_category"'::jsonb,
  'AC is modelled as a separate billable amenity. AC and room category (Classic/Premium) are independent axes — a Classic room can have AC, a Premium room can be non-AC.',
  'string', true, true, 'major', 'published',
  'AC Architecture'),

('ac.pricing_granularity', 'global', NULL,
  '"per_room"'::jsonb,
  'Each AC-equipped room has its own AC base cost (tonnage × per-hour cost × hours/day × days/year). Not a flat campus-wide AC fee.',
  'string', true, true, 'major', 'published',
  'AC Architecture'),

('ac.opt_out_allowed', 'global', NULL,
  'false'::jsonb,
  'If you live in an AC-equipped room, you pay the AC charge. No opt-out within the room. (To avoid AC charges, request allocation to a non-AC room.)',
  'boolean', true, true, 'major', 'published',
  'AC Architecture'),

('ac.refund_mode', 'global', NULL,
  '"none"'::jsonb,
  'No refund on AC charges — same upfront + no-refund discipline as room and mess fees.',
  'string', true, true, 'major', 'published',
  'AC Architecture')

ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

COMMIT;
