/**
 * Single source of truth for policy keys.
 *
 * When code calls fn_get_policy via Supabase RPC, use these constants.
 * New keys must be added here AND seeded as a system row in platform_policies
 * (migration 20260429000002_platform_policies_substrate.sql or successor).
 *
 * Phase 1.5a (2026-04-29): canonical runtime-config substrate.
 */
export const POLICY_KEYS = {
  // HR Attendance — Sprint 5 keys absorbed into hr.attendance.* nested namespace
  // by Wave 3 M7 (2026-05-15). Old HR_ATT_* constant names kept as aliases;
  // their values now point at the new namespaced keys. Sprint 5 service code
  // that imports HR_ATT_* continues to work unchanged — fn_get_policy resolves
  // the new key on the same renamed platform_policies row.
  // Spec: specs/hr-policy-jsonb-structures-2026-05-15.md §"Sprint 5 HR_ATT_* absorption"
  // Migration: supabase/migrations/20260611_hr_attendance_absorption.sql
  HR_ATT_HOLIDAY_BACKFILL_LOOKBACK_DAYS: 'hr.attendance.holiday_handling.backfill_lookback_days',
  HR_ATT_AUDIT_RETENTION_YEARS: 'hr.attendance.audit.retention_years',
  HR_ATT_GEOFENCE_MODE: 'hr.attendance.geofence.mode',
  HR_ATT_GEOFENCE_RADIUS_M: 'hr.attendance.geofence.radius_m',
  HR_ATT_AUTO_APPROVE_THRESHOLD_MINUTES: 'hr.attendance.auto_approve.threshold_minutes',
  HR_ATT_SELF_HEAL_STEP2_CHANNELS: 'hr.attendance.self_heal.step2_channels',
  HR_ATT_SELF_HEAL_WINDOW_HOURS: 'hr.attendance.self_heal.window_hours',
  HR_ATT_CLASS_PROXY_DAY_CALC_DEFAULT: 'hr.attendance.class_proxy.day_calc_default',
  HR_ATT_CROSS_COLLEGE_PROXY_ENABLED: 'hr.attendance.class_proxy.cross_college_enabled',
  HR_ATT_TEAM_VIEW_PRIVACY_MODE: 'hr.attendance.team_view.privacy_mode',
  HR_ATT_MONTHLY_LETTER_MODE: 'hr.attendance.monthly_letter.mode',
  HR_ATT_LATE_ARRIVAL_ACTION: 'hr.attendance.late_arrival.action',
  HR_ATT_BIOMETRIC_PRIORITY_OVER_SELF_MARK: 'hr.attendance.biometric.priority_over_self_mark',
  HR_ATT_MULTI_DAY_PATTERN_DETECTION: 'hr.attendance.pattern_detection.multi_day',

  // Cross-cutting
  SUPER_ADMIN_DIGEST_FANOUT_ROLE_KEYS: 'super_admin.digest.fanout_role_keys',
  HR_DASHBOARD_DAILY_BRIEF_FANOUT_PERMISSION: 'hr.dashboard.daily_brief.fanout_via_permission_key',

  // Attention Bar (Phase 5+, Director-tunable)
  // When true, Layer 1 emits BOTH the role-specific entry AND the catch-all as
  // two distinct hits — so the split bar renders by default on every page even
  // when no Layer 2 rule has been configured. Default false → unchanged behaviour.
  ATTENTION_BAR_L1_RETURN_SECONDARY: 'attention_bar.layer1.return_secondary',

  // Dashboard leaderboards — min-volume thresholds for inclusion
  // (matview HAVING clauses read these; refresh-time snapshot)
  // Default 5 hot leads first-touched today / 10 leads in 30d.
  DASHBOARD_LEADERBOARD_SLA_MIN_LEADS: 'dashboard.leaderboard.sla_min_leads',
  DASHBOARD_LEADERBOARD_CONVERSION_MIN_LEADS: 'dashboard.leaderboard.conversion_min_leads',

  // Telephony — ExoVoiceAnalyze submission tasks + categories.
  // Object policy: { tasks: string[], categories: string[] }.
  // Consumed by lib/services/telephony/call-pipeline-service.ts (server-only,
  // pipeline runs in API routes / cron, never client). Director can edit via
  // /admin/telephony-policies — no deploy needed.
  TELEPHONY_EXOVOICE_CONFIG: 'telephony.exovoice.config',

  // Telephony — CDR sync windowing (object: {default_lookback_days, chunk_max_days})
  // Consumed by lib/services/telephony/inbound-call-sync-service.ts at sync start.
  // Defaults: 7-day first-sync lookback, 30-day chunks (Exotel max is 31).
  // Director-tweakable via platform_policies admin UI — no deploy needed.
  TELEPHONY_CDR_SYNC_CONFIG: 'telephony.cdr_sync.config',

  // BYOW WhatsApp (Bring Your Own WhatsApp via Railway whatsapp-web.js service).
  // Spec: /Users/omm/PROJECTS/MyJKKN/specs/byow-whatsapp-revival.md (v4, 2026-05-03)
  // Consumed by app/api/cron/whatsapp-byow-health/route.ts and the parent server
  // component of /admission/settings/whatsapp-numbers (UI gate).
  WA_BYOW_IS_ENABLED: 'wa_byow.is_enabled',
  WA_BYOW_HEALTH_FAILURE_THRESHOLD: 'wa_byow.health_failure_threshold',
  WA_BYOW_HEALTH_PROBE_TIMEOUT_SECONDS: 'wa_byow.health_probe_timeout_seconds',
  WA_BYOW_ALERT_CHANNELS: 'wa_byow.alert_channels',
  WA_BYOW_HEALTH_LOG_RETENTION_DAYS: 'wa_byow.health_log_retention_days',
  WA_BYOW_TENANCY_SPLIT_THRESHOLD_CONNECTIONS: 'wa_byow.tenancy_split_threshold_connections',
  WA_BYOW_CONNECTOR_ROLE_REQUIRED: 'wa_byow.connector_role_required',

  // BYOW Spec 3 — Reliability infra + Senior Learner UI (verdict 2026-08-03).
  // Consumed by: connection-pulse cron, header connection badge, dashboard card,
  // bypass-detector cron, secret rotation UI.
  WA_BYOW_DISCONNECT_NOTIFY_ROLES: 'wa_byow.disconnect_notify_roles',
  WA_BYOW_CONNECTION_STALE_THRESHOLD_HOURS: 'wa_byow.connection_stale_threshold_hours',
  WA_BYOW_CONNECTION_FORCE_DISCONNECT_AFTER_HOURS: 'wa_byow.connection_force_disconnect_after_hours',
  WA_BYOW_INBOUND_ATTRIBUTION_CASCADE: 'wa_byow.inbound_attribution_cascade',
  WA_BYOW_WEBHOOK_SECRET_ROTATION_DAYS: 'wa_byow.webhook_secret_rotation_days',

  // BYOW Spec 3 Phase 2 — Synthetic audit cron (Task 17). DISABLED by default.
  // When true, hourly cron sends a synthetic msg via each ready connection so
  // we can detect silent inbound-webhook drops. Director flips after dry-run.
  // Consumed by app/api/cron/whatsapp-byow-synthetic-audit/route.ts.
  WA_BYOW_SYNTHETIC_AUDIT_ENABLED: 'wa_byow.synthetic_audit_enabled',

  // Voice Memo Monitor (2026-05-10) — runtime-tunable thresholds for
  // /admission/counselors/voice-memos. Director-tweakable via /admin/voice-memo-monitor.
  VOICE_MEMO_MONITOR_WINDOW_HOURS: 'voice_memo_monitor.window_hours',
  VOICE_MEMO_MONITOR_STUCK_THRESHOLD_MINUTES: 'voice_memo_monitor.stuck_threshold_minutes',
  VOICE_MEMO_MONITOR_FAILURE_RATE_RED_PCT: 'voice_memo_monitor.failure_rate_red_pct',
  VOICE_MEMO_MONITOR_FAILURE_RATE_AMBER_PCT: 'voice_memo_monitor.failure_rate_amber_pct',
  VOICE_MEMO_MONITOR_RECENT_ROWS_LIMIT: 'voice_memo_monitor.recent_rows_limit',
  VOICE_MEMO_MONITOR_REFRESH_INTERVAL_SECONDS: 'voice_memo_monitor.refresh_interval_seconds',
  VOICE_MEMO_MONITOR_COST_ALERT_DAILY_INR: 'voice_memo_monitor.cost_alert_daily_inr',
  VOICE_MEMO_MONITOR_DIRECTOR_DIGEST_CATEGORIES: 'voice_memo_monitor.director_digest_categories',

  // HR gap-closure Wave 1 (Workisy gap-analysis 2026-05-14) —
  // 20 director-tweakable HR config rows. All seeded as is_system=true
  // global defaults in migration 20260515000002_seed_hr_gap_policies.sql.
  // Per-institution override allowed (scope_type='institution', scope_id=<inst>).
  // Director edits via the HR admin policy UI (Agent β cluster, /admin/hr-policies/*).

  // -- Automation rules --------------------------------------------------------
  // Array of rule definitions consumed by HR triggers. Empty = no automations.
  // Consumer: lib/services/hr/automation-engine.ts (Agent γ ships consumer).
  HR_AUTOMATION_RULES: 'hr.automation_rules',

  // -- Onboarding -------------------------------------------------------------
  // Object: { pre_joining: string[], d_day: string[], post_joining: string[] }
  // Consumer: app/(routes)/hr/onboarding/* (Agent β ships UI).
  HR_ONBOARDING_BUCKET_DEFINITIONS: 'hr.onboarding.bucket_definitions',
  // Boolean. true = new hires self-mark tasks complete; false = HR admin marks.
  HR_ONBOARDING_SELF_SERVICE_ENABLED: 'hr.onboarding.self_service_enabled',

  // -- Offboarding ------------------------------------------------------------
  // Array of step codes rendered in order on the exit checklist.
  HR_OFFBOARDING_WORKFLOW_STEPS: 'hr.offboarding.workflow_steps',

  // -- Probation --------------------------------------------------------------
  // Integer months added to joining date when no explicit probation end set.
  HR_PROBATION_DEFAULT_DURATION_MONTHS: 'hr.probation.default_duration_months',

  // -- Shifts -----------------------------------------------------------------
  // Array of shift labels available in the work-schedule picker.
  HR_SHIFTS_TYPES: 'hr.shifts.types',
  // Boolean. true = configured break window counts as paid working hours.
  HR_SHIFTS_BREAK_PAID_BY_DEFAULT: 'hr.shifts.break_paid_by_default',

  // -- Attendance (new — distinct from HR_ATT_* attendance-engine keys) ------
  // Array of marking modes shown on attendance screen (manual/location/selfie/biometric).
  HR_ATTENDANCE_ALLOWED_MODES: 'hr.attendance.allowed_modes',
  // Boolean. true = staff can mark from any campus site without flag.
  // DISTINCT from HR_ATT_CROSS_COLLEGE_PROXY_ENABLED (that one is class-proxy only).
  HR_ATTENDANCE_ALLOW_MULTI_SITE: 'hr.attendance.allow_multi_site',
  // Array of channels accepted for attendance marking (web/app/biometric/whatsapp/slack/lens).
  HR_ATTENDANCE_CHANNELS: 'hr.attendance.channels',

  // -- Assets -----------------------------------------------------------------
  // Object mapping category -> string[] of items, e.g.
  // { electronics: ["laptop", "phone"], furniture: ["chair"] }.
  HR_ASSETS_CATEGORY_DEFINITIONS: 'hr.assets.category_definitions',

  // -- Payroll ----------------------------------------------------------------
  // Array of component definitions { code, label, kind: "earning"|"deduction", taxable }.
  // Consumer: lib/services/hr/payroll/payslip-generator.ts (Agent δ ships consumer).
  HR_PAYROLL_COMPONENT_DEFINITIONS: 'hr.payroll.component_definitions',
  // Array of disbursement channels (bank_transfer/cheque/cash).
  HR_PAYROLL_DISBURSEMENT_CHANNELS: 'hr.payroll.disbursement_channels',
  // Object: { gross: string, net: string, ctc: string } — formula expressions
  // referencing component codes from HR_PAYROLL_COMPONENT_DEFINITIONS.
  HR_PAYROLL_FORMULA: 'hr.payroll.formula',
  // Boolean. true = post-run bank-debit reconciliation fires.
  HR_PAYROLL_RECONCILIATION_ENABLED: 'hr.payroll.reconciliation_enabled',

  // -- Compliance -------------------------------------------------------------
  // Object: { employee_contrib_pct, employer_contrib_pct, wage_ceiling_inr, lop_config }.
  HR_COMPLIANCE_EPF: 'hr.compliance.epf',
  // Object: { employee_contrib_pct, employer_contrib_pct, wage_ceiling_inr, applicable_below_ceiling_only }.
  HR_COMPLIANCE_ESI: 'hr.compliance.esi',
  // Object: per-state-code -> array of { min, max, tax } slab brackets.
  HR_COMPLIANCE_PT: 'hr.compliance.pt',
  // Object: per-state-code -> { employee, employer, frequency }.
  HR_COMPLIANCE_LWF: 'hr.compliance.lwf',

  // -- Dashboard --------------------------------------------------------------
  // Array of { label, role_keys: string[] } — how HR dashboard widgets cluster roles.
  HR_DASHBOARD_ROLE_GROUPS: 'hr.dashboard.role_groups',

  // Nav landing pages (super-admin-tunable redirect targets for /admin module roots).
  // Consumed by app/(routes)/admin/page.tsx, /admin/lti/page.tsx, /admin/pde/page.tsx.
  // Editable via /admin/landing-pages — zero-deploy redirect retargeting.
  NAV_ADMIN_DEFAULT_LANDING: 'nav.admin.default_landing',
  NAV_ADMIN_LTI_DEFAULT_LANDING: 'nav.admin.lti.default_landing',
  NAV_ADMIN_PDE_DEFAULT_LANDING: 'nav.admin.pde.default_landing',

  // HR Recruitment approvals — viewer-scope enforcement.
  // Consumed by lib/services/hr/recruitment-service.ts (resolveViewerScope).
  // Master toggle (boolean) + per-role scope_rules (JSONB object).
  // Editable via /admin/hr/recruitment-approvals-scope (super-admin UI).
  HR_RECRUITMENT_APPROVALS_ENFORCE_SCOPING: 'hr.recruitment.approvals.enforce_scoping',
  HR_RECRUITMENT_APPROVALS_SCOPE_RULES: 'hr.recruitment.approvals.scope_rules',

  // -- Forms (W3-M9 follow-up — workflow engine + notifications) -------------
  // Object: per-event notification templates rendered by the form-submission
  // workflow engine. Keys = event name; values = { in_app_title, in_app_body,
  // whatsapp_body } string templates. Supports placeholders:
  //   {form_title}, {submitter_name}, {step_label}, {actor_name},
  //   {reason}, {submission_url}
  // Consumed by lib/services/hr/form-submission-notifications.ts.
  // Director can edit copy live via /admin/policies/platform-policies UI.
  HR_FORMS_NOTIFICATION_TEMPLATES: 'hr.forms.notification_templates',
} as const;

export type PolicyKey = typeof POLICY_KEYS[keyof typeof POLICY_KEYS];
