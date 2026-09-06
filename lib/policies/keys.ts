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
  // /admission/settings/telephony-policies — no deploy needed.
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
  // /admission/counselors/voice-memos. Director-tweakable via /admission/settings/voice-memo-monitor.
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

  // T4.2 deduction-engine knobs (Director-locked spec 2026-05-15).
  // Seeded as global rows by 20260626000000_hr_pay_components_and_payslip_line_items.sql.
  // Editable via /hr/admin/policies/payroll-* UIs (ships in a later T-sprint).
  // Consumer: lib/services/hr/payroll/deduction-engine.ts.
  //
  // tds_slabs: { regime, fiscal_year, slabs:[{upto_inr,rate_pct}], rebate_87a_*, surcharge_thresholds, cess_pct }
  HR_PAYROLL_TDS_SLABS: 'hr.payroll.tds_slabs',
  // pf_rate: { employee_pct, employer_pct, ceiling_inr, applies_above_ceiling }
  HR_PAYROLL_PF_RATE: 'hr.payroll.pf_rate',
  // esi_rate: { employee_pct, employer_pct, ceiling_inr, applies_above_ceiling }
  HR_PAYROLL_ESI_RATE: 'hr.payroll.esi_rate',
  // professional_tax: { state, slabs_monthly:[{upto_inr,amount_inr}], frequency }
  HR_PAYROLL_PROFESSIONAL_TAX: 'hr.payroll.professional_tax',
  // standard_deduction: { amount_inr, applies_to_regime, applies_to_old_regime_amount_inr, section }
  HR_PAYROLL_STANDARD_DEDUCTION: 'hr.payroll.standard_deduction',

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

  // Nav landing pages (super-admin-tunable redirect targets for module roots).
  // Consumed by app/(routes)/admin/page.tsx + /admin/lti/page.tsx + /pde/admin/page.tsx
  // + /pde/learn/page.tsx + the 4 sweep hubs added 2026-06-02
  // (/pde/learn/cases, /pde/admin/rubrics, /pde/admin/accreditation-evidence,
  // /pde/admin/transcript).
  // Editable via /admin/landing-pages — zero-deploy redirect retargeting.
  NAV_ADMIN_DEFAULT_LANDING: 'nav.admin.default_landing',
  NAV_ADMIN_LTI_DEFAULT_LANDING: 'nav.admin.lti.default_landing',
  NAV_ADMIN_PDE_DEFAULT_LANDING: 'nav.admin.pde.default_landing',
  NAV_CAMPUS_WALK_SCOREBOARD_DEFAULT_LANDING: 'nav.campus_walk.scoreboard.default_landing',
  NAV_ADMIN_PDE_RUBRICS_DEFAULT_LANDING: 'nav.admin.pde.rubrics.default_landing',
  NAV_ADMIN_PDE_ACCREDITATION_EVIDENCE_DEFAULT_LANDING: 'nav.admin.pde.accreditation_evidence.default_landing',
  NAV_ADMIN_PDE_TRANSCRIPT_DEFAULT_LANDING: 'nav.admin.pde.transcript.default_landing',
  NAV_LEARN_PDE_DEFAULT_LANDING: 'nav.learn.pde.default_landing',
  NAV_LEARN_PDE_CASES_DEFAULT_LANDING: 'nav.learn.pde.cases.default_landing',
  // PDE Module Extraction (2026-06-09): top-level /pde landing.
  // Consumed by app/(routes)/pde/page.tsx — the new unified PDE module hub.
  NAV_PDE_DEFAULT_LANDING: 'nav.pde.default_landing',

  // HR Recruitment approvals — the platform_policies-driven viewer-scoping +
  // role-match toggles (enforce_scoping / scope_rules / enforce_role_match /
  // override_roles) were REMOVED 2026-07-06. Step-approver enforcement is now
  // ALWAYS ON and driven by the approval-flow chain itself
  // (/hr/admin/recruitment-approval-flows). Policy rows deleted by migration
  // 20260706130000_remove_recruitment_approvals_scope_policies.sql.

  // -- Forms (W3-M9 follow-up — workflow engine + notifications) -------------
  // Object: per-event notification templates rendered by the form-submission
  // workflow engine. Keys = event name; values = { in_app_title, in_app_body,
  // whatsapp_body } string templates. Supports placeholders:
  //   {form_title}, {submitter_name}, {step_label}, {actor_name},
  //   {reason}, {submission_url}
  // Consumed by lib/services/hr/form-submission-notifications.ts.
  // Director can edit copy live via /admin/policies/platform-policies UI.
  HR_FORMS_NOTIFICATION_TEMPLATES: 'hr.forms.notification_templates',

  // T8.6 Multi-role Dashboard Refinements (2026-05-15) ------------------------
  // Maps role_key -> ordered array of widget IDs to render on /dashboard.
  // The "_default" entry is the fallback used when a user's primary role has
  // no explicit mapping (keeps surface non-empty for new/unknown roles).
  // Consumed by lib/services/dashboard/widget-config-service.ts; edited via
  // /admin/dashboard/widget-config (Director-only). No deploy needed.
  DASHBOARD_ROLE_WIDGETS: 'dashboard.role_widgets',

  // PDE Rubrics — Social & Leadership Trust (Phase 8) -------------------------
  // 4 rubrics defining the durable-value category AI cannot replicate: working
  // with humans, leading peers, holding committee positions, organizing
  // communities. Each row is a JSONB object with evidence_required, min_*
  // thresholds, validator_role, deliverables, and scoring_band.
  // Seeded by 20260518_pde_social_leadership_rubrics.sql (scope=global).
  // Editable via /pde/admin/rubrics/social-leadership (Director-only).
  // Consumer (future): demonstration-evaluator services will read these via
  // fn_get_policy to validate Phase-8 submissions. No deploy needed to retune.
  PDE_RUBRICS_SOCIAL_LEADERSHIP_PEER_MENTOR: 'pde.rubrics.social_leadership.peer_mentor',
  PDE_RUBRICS_SOCIAL_LEADERSHIP_TEAM_PROJECT_LEAD: 'pde.rubrics.social_leadership.team_project_lead',
  PDE_RUBRICS_SOCIAL_LEADERSHIP_COMMITTEE_ROLE: 'pde.rubrics.social_leadership.committee_role',
  PDE_RUBRICS_SOCIAL_LEADERSHIP_COMMUNITY_ORGANIZER: 'pde.rubrics.social_leadership.community_organizer',
  // PDE Rubrics — Cultural & Civic Literacy (Phase 9, NEP 2020-aligned)
  // 4 rubric rows that define how JKKN students earn the cultural & civic
  // literacy slice of their PDE score. Seeded by
  // supabase/migrations/20260518_pde_cultural_civic_rubrics.sql.
  // Edited via /pde/admin/rubrics/cultural-civic (Director-only).
  // Reflects NEP 2020 §4.6-4.7 (IKS + mother-tongue), §4.23 (fundamental
  // duties / constitutional values), §11.8 (community-service credit).
  // JKKN-Tamil-Nadu rooted: Tamil is the primary approved language; local-
  // community contexts include panchayat collaboration + self-help-group
  // engagement; tradition domains include classical (Bharatanatyam /
  // Carnatic / Tamil literature) and folk forms.
  PDE_RUBRICS_CULTURAL_CIVIC_INDIAN_LANGUAGE_PROFICIENCY: 'pde.rubrics.cultural_civic.indian_language_proficiency',
  PDE_RUBRICS_CULTURAL_CIVIC_LOCAL_COMMUNITY_PROJECT: 'pde.rubrics.cultural_civic.local_community_project',
  PDE_RUBRICS_CULTURAL_CIVIC_TRADITION_ATTUNEMENT: 'pde.rubrics.cultural_civic.tradition_attunement',
  PDE_RUBRICS_CULTURAL_CIVIC_CIVIC_ENGAGEMENT: 'pde.rubrics.cultural_civic.civic_engagement',
  // PDE Rubrics — Embodied Practice (Phase 7) -------------------------------
  // Per-discipline rubric for hands-on skill demonstrations across JKKN
  // colleges. Each value is an object with shape:
  //   { discipline, rubric: [{skill, evidence_required, validator_role,
  //     scoring_band:[min,max], passing_threshold}],
  //     min_demonstrations_per_year, validity_period_months }
  // Edited via /pde/admin/rubrics/embodied (super-admin). Consumed by PDE
  // demonstration gate logic at runtime — no deploy required to retune.
  PDE_RUBRICS_EMBODIED_MEDICAL: 'pde.rubrics.embodied.medical',
  PDE_RUBRICS_EMBODIED_PHARMACY: 'pde.rubrics.embodied.pharmacy',
  PDE_RUBRICS_EMBODIED_NURSING: 'pde.rubrics.embodied.nursing',
  PDE_RUBRICS_EMBODIED_DENTAL: 'pde.rubrics.embodied.dental',
  PDE_RUBRICS_EMBODIED_ENGINEERING: 'pde.rubrics.embodied.engineering',

  // Campus Living — Fractional Occupancy (PR ζ / θ, 2026-05-28) -------------
  // An unfilled Premium upgrade-vacancy's differential price auto-drops by
  // FRACTIONAL_OCCUPANCY_EMPTY_VACANCY_DROP_PCT every
  // FRACTIONAL_OCCUPANCY_EMPTY_VACANCY_DROP_INTERVAL_DAYS days until taken or
  // the hostel year ends (decision 8). Seeded global rows: 20 / 60.
  // Consumed by lib/services/campus-living/vacancy-price-drop-service.ts
  // (server-only — runs in the vacancy-price-drops cron, never client).
  FRACTIONAL_OCCUPANCY_EMPTY_VACANCY_DROP_PCT: 'fractional_occupancy.empty_vacancy_drop_pct',
  FRACTIONAL_OCCUPANCY_EMPTY_VACANCY_DROP_INTERVAL_DAYS: 'fractional_occupancy.empty_vacancy_drop_interval_days',

  // Hostel Fees — Settle Then Bill (Director 2026-08-09) ---------------------
  // Don't bill at move-in: let the room fill for WINDOW_DAYS (restarting on
  // each new joiner, capped at OUTER_LIMIT_DAYS from first open, and short-
  // circuited the moment the room is full), then bill everyone at the
  // occupancy that exists at that moment. Seeded global rows by
  // supabase/migrations/20260815060000_hostel_settle_then_bill.sql:
  // false / 5 / 20 / 5.
  // HOSTEL_SETTLE_BILL_ENABLED is the MASTER SWITCH — while false the whole
  // mechanism is inert (no window opens, nothing is billed, nothing credited).
  HOSTEL_SETTLE_BILL_ENABLED: 'hostel.settle_bill.enabled',
  HOSTEL_SETTLE_BILL_WINDOW_DAYS: 'hostel.settle_bill.window_days',
  HOSTEL_SETTLE_BILL_OUTER_LIMIT_DAYS: 'hostel.settle_bill.outer_limit_days',
  HOSTEL_SETTLE_BILL_BILL_DUE_DAYS: 'hostel.settle_bill.bill_due_days',
  // Hours every current resident has to agree to a room buyout before the
  // request lapses. A sole occupant never waits.
  // supabase/migrations/20260819032000_hostel_room_buyout.sql seeds 48.
  HOSTEL_SETTLE_BILL_BUYOUT_CONSENT_HOURS: 'hostel.settle_bill.buyout_consent_hours',

  // Empty-bed intimation — tell a resident her room is under-filled and what it
  // is costing her, so she can invite someone before the settle window closes.
  // Seeded by supabase/migrations/20260815060001_empty_bed_intimation.sql:
  // false / 2 / <template>. ENABLED is its own master switch, separate from
  // HOSTEL_SETTLE_BILL_ENABLED — notices can be armed first, since they move no
  // money, and that is the intended order.
  HOSTEL_EMPTY_BED_NOTICE_ENABLED: 'hostel.empty_bed_notice.enabled',
  HOSTEL_EMPTY_BED_NOTICE_REMINDER_INTERVAL_DAYS:
    'hostel.empty_bed_notice.reminder_interval_days',
  HOSTEL_EMPTY_BED_NOTICE_MESSAGE_TEMPLATE: 'hostel.empty_bed_notice.message_template',

  // Bed Economics — scalar tunables (Bed Economics PR A, 2026-06-07) ---------
  // Seeded as global system rows by
  // supabase/migrations/20260607120000_bed_economics_substrate.sql (§3) and read
  // at runtime by the fn_bed_econ_* RPCs (denominator / mess toggle / sellable
  // filter / stoplight targets / stale-vacancy window / housekeeping unit cost).
  // EDIT surface = the super-admin settings panel on the bed-economics dashboard
  // page (PR B, gear → sheet); storage stays in platform_policies (the single
  // locked registry). Spec: specs/bed-economics-dashboard-spec-2026-06-07.md §7.1.
  // Constant strings here MUST match the policy_key values seeded in the migration.
  BED_ECON_DENOMINATOR: 'bed_econ.denominator',
  BED_ECON_INCLUDE_MESS_IN_REVENUE: 'bed_econ.include_mess_in_revenue',
  BED_ECON_SELLABLE_ROOM_PURPOSES: 'bed_econ.sellable_room_purposes',
  BED_ECON_OCCUPANCY_TARGET_PCT: 'bed_econ.occupancy_target_pct',
  BED_ECON_COLLECTION_TARGET_PCT: 'bed_econ.collection_target_pct',
  BED_ECON_STALE_VACANCY_DAYS: 'bed_econ.stale_vacancy_days',
  BED_ECON_HOUSEKEEPING_COST_PER_ROOM_MONTH: 'bed_econ.housekeeping_cost_per_room_month',

  // Social Governance (Director's-View consequences surface, 2026-06-18) -------
  // The thresholds and flags behind /admission/social/governance. Each value is
  // read via fn_get_policy and turned into a plain-English consequence computed
  // against the live metrics tables. The platform_policies rows for these keys
  // are seeded by a sibling agent's migration; until then the policy readers
  // fail-soft to documented code defaults (see app/api/social/governance/route.ts).
  // Constant strings here MUST match the policy_key values that migration seeds.
  // Edited via /admission/social/admin/policies (super-admin).
  SOCIAL_DORMANCY_THRESHOLD_DAYS: 'social.dormancy_threshold_days',
  SOCIAL_COMPLIANCE_MIN_FOLLOWERS: 'social.compliance.min_followers',
  SOCIAL_COMPLIANCE_MIN_POSTS: 'social.compliance.min_posts',
  SOCIAL_FOLLOWBACK_RATIO_THRESHOLD: 'social.followback_ratio_threshold',
  SOCIAL_REALTIME_ENABLED: 'social.realtime_enabled',

  // Post-class feedback → attendance confirmation ("show the split").
  // gate_mode: off | visibility (show completion, non-blocking) | hard.
  // window_hours: grace window after class within which feedback is due; also
  // splits present-pending into within-window vs overdue on the dashboard.
  // Seeded as global system rows in platform_policies; edited via admin policy UI.
  SESSION_FEEDBACK_GATE_MODE: 'session_feedback.gate_mode',
  SESSION_FEEDBACK_WINDOW_HOURS: 'session_feedback.window_hours',
  // Faculty-engagement adoption (2026-07-04). When TRUE, the DERIVED, non-destructive
  // "effective attendance %" (present-but-no-feedback lowers a learner's attendance %)
  // is computed for eligibility surfaces. Default FALSE (dark). Compliance sign-off
  // required before enabling — exam-eligibility regulatory surface (spec R2). Never
  // mutates attendance_data. Seeded by 20260731020000_scf_hard_gate_enforcement_and_coupling.sql.
  SESSION_FEEDBACK_ATTENDANCE_COUPLING_ENABLED: 'session_feedback.attendance_coupling_enabled',
  // Forward-only rollout (2026-07-05). Sessions before this IST date are grandfathered:
  // never marked incomplete/overdue and excluded from confirmed-attendance eligibility.
  // Resolved by fn_scf_faculty_completion (and, in Build 2, fn_scf_effective_attendance).
  // Seeded by 20260705_scf_enforcement_start_date_forward_only.sql. Default '2026-07-05'.
  SESSION_FEEDBACK_ENFORCEMENT_START_DATE: 'session_feedback.enforcement_start_date',

  // Exam attendance eligibility (2026-07-26). Previously a hardcoded constant pair
  // duplicated in FOUR places (exam-audit compute, the learner's running-score card,
  // the consolidation advisory panel, and the Senior Learner guide prose) whose only
  // stated authority was the comment "// university norm". Director confirmed the
  // rule and approved consolidating it onto one row.
  //
  // It is a THREE-band rule, not a pass/fail gate:
  //   pct >= attendance_pct              -> eligible
  //   condonation_floor_pct <= pct < attendance_pct -> needs condonation
  //   pct <  condonation_floor_pct       -> at risk of ineligibility
  //
  // Scope-aware: seeded global, but fn_get_policy resolves institution rows first,
  // so a college whose affiliating university sets a different norm gets its own row
  // without a code change. Seeded by
  // 20260726193000_exam_eligibility_thresholds_policy.sql. Defaults 75 / 65.
  //
  // NOT the same as the similarly-valued keys elsewhere — do not conflate with
  // internal_marks_insight_config.attendance_threshold ("counts as regular" for the
  // insight engine), cdc.min_attendance_pct_for_internship_certificate,
  // internship.policy.attendance_fail_below_pct, or vac.completion_attendance_threshold.
  EXAM_ELIGIBILITY_ATTENDANCE_PCT: 'academic.exam_eligibility.attendance_pct',
  EXAM_ELIGIBILITY_CONDONATION_FLOOR_PCT: 'academic.exam_eligibility.condonation_floor_pct',
} as const;

export type PolicyKey = typeof POLICY_KEYS[keyof typeof POLICY_KEYS];
