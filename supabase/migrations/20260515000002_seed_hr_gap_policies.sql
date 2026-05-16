-- ============================================================================
-- Migration: 20260515000002_seed_hr_gap_policies
-- HR gap-closure Wave 1 (Agent α) — 20 director-tweakable HR config seeds
-- ============================================================================
-- Sourced from Workisy gap-analysis 2026-05-14. These policies surface
-- runtime-tunable knobs across the HR module so director can adjust without
-- a deploy:
--
--   • Automation rules + onboarding/offboarding workflows
--   • Probation defaults
--   • Shifts (types, paid-break)
--   • Attendance (allowed modes, multi-site, channels)
--   • Assets categorisation
--   • Payroll (components, channels, formula, reconciliation)
--   • Compliance (EPF/ESI/PT/LWF)
--   • Dashboard role grouping
--
-- All seeded as is_system=true GLOBAL rows (scope_type='global', scope_id=NULL).
-- Per-institution overrides supported via the substrate (no extra DDL needed).
--
-- TIER 0 — safe-additive INSERTs. Idempotent via ON CONFLICT DO NOTHING.
-- Safe to re-apply.
-- ============================================================================

INSERT INTO platform_policies (
  policy_key, scope_type, scope_id, value, description, data_type, enum_options, is_system
) VALUES

-- ----------------------------------------------------------------------------
-- 1. Automation rules — generic rule definitions consumed by HR triggers.
-- ----------------------------------------------------------------------------
('hr.automation_rules', 'global', NULL, '[]'::jsonb,
  'When this list is non-empty, HR automations fire on the events described in each rule (e.g., auto-mark half-day on late arrival > 60 min). Empty array = no automations active.',
  'array', NULL, true),

-- ----------------------------------------------------------------------------
-- 2. Onboarding bucket definitions — pre-joining/D-day/post-joining groupings.
-- ----------------------------------------------------------------------------
('hr.onboarding.bucket_definitions', 'global', NULL,
  '{"pre_joining":["offer_letter","document_collection","background_verify"],"d_day":["asset_handover","seat_allocation","intro_email"],"post_joining":["induction","training","feedback_d30"]}'::jsonb,
  'When a new hire is created, tasks are grouped into these buckets in the onboarding tracker. Director adjusts task names per bucket here.',
  'object', NULL, true),

-- ----------------------------------------------------------------------------
-- 3. Onboarding self-service — does the new hire complete tasks themselves?
-- ----------------------------------------------------------------------------
('hr.onboarding.self_service_enabled', 'global', NULL, 'false'::jsonb,
  'If true, new hires get their own checklist with self-mark-complete buttons. If false, HR admin marks each task complete on the hire''s behalf.',
  'boolean', NULL, true),

-- ----------------------------------------------------------------------------
-- 4. Offboarding workflow steps — exit checklist sequence.
-- ----------------------------------------------------------------------------
('hr.offboarding.workflow_steps', 'global', NULL,
  '["resignation_acknowledged","handover_initiated","asset_return","fnf_calculation","exit_interview","fnf_disbursed","relieving_letter"]'::jsonb,
  'When an exit is initiated, these steps render in order on the offboarding tracker. Director can reorder or drop steps here.',
  'array', NULL, true),

-- ----------------------------------------------------------------------------
-- 5. Probation default duration.
-- ----------------------------------------------------------------------------
('hr.probation.default_duration_months', 'global', NULL, '6'::jsonb,
  'When a new hire is created without an explicit probation end date, this many months are added to joining date. Per-role override allowed via scope_type=role.',
  'number', NULL, true),

-- ----------------------------------------------------------------------------
-- 6. Shift types — enum of allowed shift labels.
-- ----------------------------------------------------------------------------
('hr.shifts.types', 'global', NULL,
  '["general","morning","afternoon","night","split","flexible"]'::jsonb,
  'When creating a work schedule, only these shift labels appear in the dropdown. Add/remove labels here to control the picker globally.',
  'array', NULL, true),

-- ----------------------------------------------------------------------------
-- 7. Break paid by default.
-- ----------------------------------------------------------------------------
('hr.shifts.break_paid_by_default', 'global', NULL, 'true'::jsonb,
  'If true, the configured break window in a shift counts toward paid working hours. If false, break duration is deducted from worked hours.',
  'boolean', NULL, true),

-- ----------------------------------------------------------------------------
-- 8. Attendance — allowed marking modes.
-- ----------------------------------------------------------------------------
('hr.attendance.allowed_modes', 'global', NULL,
  '["manual","location","selfie","biometric"]'::jsonb,
  'When a staff member opens the attendance screen, only these modes are available. Drop "selfie" to disable face-recognition; drop "manual" to force device-verified marks only.',
  'array', NULL, true),

-- ----------------------------------------------------------------------------
-- 9. Multi-site attendance — can staff mark from any campus site?
--    DISTINCT from hr.attendance.cross_college_proxy_enabled (class-proxy only).
-- ----------------------------------------------------------------------------
('hr.attendance.allow_multi_site', 'global', NULL, 'true'::jsonb,
  'If true, a staff member assigned primarily to Campus A can still mark attendance from Campus B without being flagged. If false, marks outside the assigned site are rejected.',
  'boolean', NULL, true),

-- ----------------------------------------------------------------------------
-- 10. Attendance channels — where staff can mark from.
-- ----------------------------------------------------------------------------
('hr.attendance.channels', 'global', NULL,
  '["web","app","biometric"]'::jsonb,
  'When this list contains a channel, attendance marks from that source are accepted. Add "whatsapp" to enable WA-bot marking; add "slack" / "lens" as those integrations come online.',
  'array', NULL, true),

-- ----------------------------------------------------------------------------
-- 11. Asset category definitions.
-- ----------------------------------------------------------------------------
('hr.assets.category_definitions', 'global', NULL,
  '{"electronics":["laptop","phone","monitor","keyboard"],"furniture":["chair","desk","cabinet"],"access":["id_card","keys","parking_pass"],"software":["license","sso_account"]}'::jsonb,
  'When assigning an asset to an employee, categories and items from this map populate the picker. Director adds new categories or items here as inventory grows.',
  'object', NULL, true),

-- ----------------------------------------------------------------------------
-- 12. Payroll component definitions — earnings + deductions taxonomy.
-- ----------------------------------------------------------------------------
('hr.payroll.component_definitions', 'global', NULL,
  '[{"code":"BASIC","label":"Basic","kind":"earning","taxable":true},{"code":"HRA","label":"House Rent Allowance","kind":"earning","taxable":true},{"code":"DA","label":"Dearness Allowance","kind":"earning","taxable":true},{"code":"SPECIAL","label":"Special Allowance","kind":"earning","taxable":true},{"code":"EPF","label":"EPF Contribution","kind":"deduction","taxable":false},{"code":"ESI","label":"ESI Contribution","kind":"deduction","taxable":false},{"code":"PT","label":"Professional Tax","kind":"deduction","taxable":false},{"code":"TDS","label":"Income Tax Deducted","kind":"deduction","taxable":false}]'::jsonb,
  'When generating a payslip, these components define which earnings and deductions appear. Add a new component here to surface it on every payslip from the next run.',
  'array', NULL, true),

-- ----------------------------------------------------------------------------
-- 13. Payroll disbursement channels.
-- ----------------------------------------------------------------------------
('hr.payroll.disbursement_channels', 'global', NULL,
  '["bank_transfer","cheque","cash"]'::jsonb,
  'When marking a salary as paid, only these disbursement channels appear in the dropdown. Drop "cash" to ban cash payments globally.',
  'array', NULL, true),

-- ----------------------------------------------------------------------------
-- 14. Payroll formula — how gross / net / CTC are computed.
-- ----------------------------------------------------------------------------
('hr.payroll.formula', 'global', NULL,
  '{"gross":"BASIC + HRA + DA + SPECIAL","net":"gross - EPF - ESI - PT - TDS","ctc":"gross + employer_epf + employer_esi"}'::jsonb,
  'When the monthly payroll runs, gross / net / CTC are computed using these formulas. Component codes refer to entries in hr.payroll.component_definitions.',
  'object', NULL, true),

-- ----------------------------------------------------------------------------
-- 15. Payroll reconciliation enabled.
-- ----------------------------------------------------------------------------
('hr.payroll.reconciliation_enabled', 'global', NULL, 'true'::jsonb,
  'If true, after each payroll run the system reconciles bank-debit confirmations against expected disbursements and flags mismatches. If false, no reconciliation check fires.',
  'boolean', NULL, true),

-- ----------------------------------------------------------------------------
-- 16. EPF compliance config.
-- ----------------------------------------------------------------------------
('hr.compliance.epf', 'global', NULL,
  '{"employee_contrib_pct":12,"employer_contrib_pct":12,"wage_ceiling_inr":15000,"lop_config":{"on_loss_of_pay":"prorate"}}'::jsonb,
  'When calculating EPF, these contribution percentages and wage ceiling apply. Update once when statutory rates change; takes effect from next payroll run.',
  'object', NULL, true),

-- ----------------------------------------------------------------------------
-- 17. ESI compliance config.
-- ----------------------------------------------------------------------------
('hr.compliance.esi', 'global', NULL,
  '{"employee_contrib_pct":0.75,"employer_contrib_pct":3.25,"wage_ceiling_inr":21000,"applicable_below_ceiling_only":true}'::jsonb,
  'When calculating ESI, these contribution percentages and the gross-wage ceiling apply. Staff above the ceiling are exempt when applicable_below_ceiling_only is true.',
  'object', NULL, true),

-- ----------------------------------------------------------------------------
-- 18. Professional Tax — per-state slabs.
-- ----------------------------------------------------------------------------
('hr.compliance.pt', 'global', NULL,
  '{"TN":[{"min":0,"max":21000,"tax":0},{"min":21001,"max":30000,"tax":135},{"min":30001,"max":45000,"tax":315},{"min":45001,"max":60000,"tax":690},{"min":60001,"max":75000,"tax":1025},{"min":75001,"max":null,"tax":1250}]}'::jsonb,
  'When calculating Professional Tax, slabs for the staff member''s state apply. Key is state code (TN, KA, MH, etc.); value is an array of {min, max, tax} brackets. Update when state notifies new slabs.',
  'object', NULL, true),

-- ----------------------------------------------------------------------------
-- 19. Labour Welfare Fund — per-state contribution map.
-- ----------------------------------------------------------------------------
('hr.compliance.lwf', 'global', NULL,
  '{"TN":{"employee":10,"employer":20,"frequency":"half_yearly"}}'::jsonb,
  'When calculating LWF, contribution amounts and frequency for the staff member''s state apply. Key is state code. Update when state notifies new rates.',
  'object', NULL, true),

-- ----------------------------------------------------------------------------
-- 20. Dashboard role groups — how HR dashboard widgets cluster roles.
-- ----------------------------------------------------------------------------
('hr.dashboard.role_groups', 'global', NULL,
  '[{"label":"Faculty","role_keys":["faculty","hod","dean","principal"]},{"label":"Admin Staff","role_keys":["hr_admin","accountant","registrar","admin_officer"]},{"label":"Support","role_keys":["transport","housekeeping","security","kitchen"]}]'::jsonb,
  'When the HR dashboard renders headcount and attendance widgets, roles are grouped by this map. Add a new group or move role_keys between groups to change which staff segments appear together.',
  'array', NULL, true)

ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- Functional smoke test: each seeded key resolves via fn_get_policy_json.
DO $$
DECLARE
  v_keys TEXT[] := ARRAY[
    'hr.automation_rules',
    'hr.onboarding.bucket_definitions',
    'hr.onboarding.self_service_enabled',
    'hr.offboarding.workflow_steps',
    'hr.probation.default_duration_months',
    'hr.shifts.types',
    'hr.shifts.break_paid_by_default',
    'hr.attendance.allowed_modes',
    'hr.attendance.allow_multi_site',
    'hr.attendance.channels',
    'hr.assets.category_definitions',
    'hr.payroll.component_definitions',
    'hr.payroll.disbursement_channels',
    'hr.payroll.formula',
    'hr.payroll.reconciliation_enabled',
    'hr.compliance.epf',
    'hr.compliance.esi',
    'hr.compliance.pt',
    'hr.compliance.lwf',
    'hr.dashboard.role_groups'
  ];
  v_key TEXT;
  v_val JSONB;
BEGIN
  FOREACH v_key IN ARRAY v_keys LOOP
    v_val := fn_get_policy(v_key, NULL);
    IF v_val IS NULL THEN
      RAISE EXCEPTION 'Seed verification failed: % did not resolve via fn_get_policy', v_key;
    END IF;
  END LOOP;
  RAISE NOTICE 'HR gap-closure seeds: all 20 keys resolved successfully';
END $$;
