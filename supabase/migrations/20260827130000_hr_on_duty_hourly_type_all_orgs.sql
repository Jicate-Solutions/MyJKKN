-- "On Duty (Hourly)" for every HR organization.
--
-- HR created the type once, through /hr/admin/leave-types, for JKKN Main
-- Office. The Apply Short Time Off drawer's "Request For" dropdown is
-- data-driven — every active hr_leave_types row with
-- request_category='short_time_off' for the employee's org — so the other 13
-- organizations kept showing only Permission until they get their own row.
--
-- This clones the Main Office row (code ODH: hourly, approval required, paid,
-- 0 notice days, sto_limit_mode='none' — On-Duty is retrospective and uncapped
-- by policy) to every other organization. Idempotent on the
-- hr_leave_types_org_code_unique (hr_organization_id, leave_type_code)
-- constraint, so an org that later configured its own ODH is left untouched.
--
-- No balance backfill is needed: v_hr_leave_balance synthesizes an eligibility
-- row for every active type, ledger row or not.

INSERT INTO public.hr_leave_types (
  hr_organization_id,
  leave_type_code, leave_type_name, description, color_code, display_order,
  is_active, duration_type, allow_half_day, allow_hourly,
  skip_weekends, skip_holidays, requires_approval, is_paid,
  min_advance_notice_days, max_continuous_days,
  requires_documents, document_required_after_days,
  default_entitled_days, valid_from,
  allow_carry_forward, max_carry_forward_days,
  is_encashable, max_encashable_days,
  accrual_type, accrual_rate,
  applicable_gender, applicable_cadre_ids,
  request_category,
  sto_limit_mode, sto_limit_period, sto_max_requests, sto_total_minutes,
  sto_min_minutes, sto_max_minutes,
  leave_limit_period, leave_max_days_per_period
)
SELECT
  o.id,
  src.leave_type_code, src.leave_type_name, src.description, src.color_code, src.display_order,
  src.is_active, src.duration_type, src.allow_half_day, src.allow_hourly,
  src.skip_weekends, src.skip_holidays, src.requires_approval, src.is_paid,
  src.min_advance_notice_days, src.max_continuous_days,
  src.requires_documents, src.document_required_after_days,
  src.default_entitled_days, now(),
  src.allow_carry_forward, src.max_carry_forward_days,
  src.is_encashable, src.max_encashable_days,
  src.accrual_type, src.accrual_rate,
  src.applicable_gender, src.applicable_cadre_ids,
  src.request_category,
  src.sto_limit_mode, src.sto_limit_period, src.sto_max_requests, src.sto_total_minutes,
  src.sto_min_minutes, src.sto_max_minutes,
  src.leave_limit_period, src.leave_max_days_per_period
FROM public.hr_leave_types src
JOIN public.hr_organizations mo ON mo.id = src.hr_organization_id
CROSS JOIN public.hr_organizations o
WHERE mo.name = 'JKKN Main Office'
  AND src.leave_type_code = 'ODH'
  AND src.request_category = 'short_time_off'
  AND o.id <> src.hr_organization_id
ON CONFLICT ON CONSTRAINT hr_leave_types_org_code_unique DO NOTHING;
