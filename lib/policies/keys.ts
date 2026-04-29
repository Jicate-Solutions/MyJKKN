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
  // HR Attendance (Sprint 5 — Section 17a Round 1-4 decisions)
  HR_ATT_HOLIDAY_BACKFILL_LOOKBACK_DAYS: 'hr.attendance.holiday_backfill_lookback_days',
  HR_ATT_AUDIT_RETENTION_YEARS: 'hr.attendance.audit_retention_years',
  HR_ATT_GEOFENCE_MODE: 'hr.attendance.geofence_mode',
  HR_ATT_GEOFENCE_RADIUS_M: 'hr.attendance.geofence_radius_m',
  HR_ATT_AUTO_APPROVE_THRESHOLD_MINUTES: 'hr.attendance.auto_approve_threshold_minutes',
  HR_ATT_SELF_HEAL_STEP2_CHANNELS: 'hr.attendance.self_heal_step2_channels',
  HR_ATT_SELF_HEAL_WINDOW_HOURS: 'hr.attendance.self_heal_window_hours',
  HR_ATT_CLASS_PROXY_DAY_CALC_DEFAULT: 'hr.attendance.class_proxy_day_calc_default',
  HR_ATT_CROSS_COLLEGE_PROXY_ENABLED: 'hr.attendance.cross_college_proxy_enabled',
  HR_ATT_TEAM_VIEW_PRIVACY_MODE: 'hr.attendance.team_view_privacy_mode',
  HR_ATT_MONTHLY_LETTER_MODE: 'hr.attendance.monthly_letter_mode',
  HR_ATT_LATE_ARRIVAL_ACTION: 'hr.attendance.late_arrival_action',
  HR_ATT_BIOMETRIC_PRIORITY_OVER_SELF_MARK: 'hr.attendance.biometric_priority_over_self_mark',
  HR_ATT_MULTI_DAY_PATTERN_DETECTION: 'hr.attendance.multi_day_pattern_detection',

  // Cross-cutting
  SUPER_ADMIN_DIGEST_FANOUT_ROLE_KEYS: 'super_admin.digest.fanout_role_keys',
  HR_DASHBOARD_DAILY_BRIEF_FANOUT_PERMISSION: 'hr.dashboard.daily_brief.fanout_via_permission_key',

  // Bug Triage Agent (2026-04-29) — autonomous bug repro+fix
  // Spec: specs/bug-triage-agent/PLAN.md, operator ref: specs/bug-triage-agent/POLICY-KEYS.md
  BUG_TRIAGE_IS_ENABLED: 'bug_triage_agent.is_enabled',
  BUG_TRIAGE_ALLOWLIST_TAGS: 'bug_triage_agent.allowlist_tags',
  BUG_TRIAGE_CONFIDENCE_MIN: 'bug_triage_agent.confidence_min',
  BUG_TRIAGE_TIMEOUT_SECONDS: 'bug_triage_agent.timeout_seconds',
  BUG_TRIAGE_CRON_SCHEDULE: 'bug_triage_agent.cron_schedule',
  BUG_TRIAGE_SUBMIT_URL_REGEX: 'bug_triage_agent.submit_url_regex',
  BUG_TRIAGE_LOCK_STALE_SECS: 'bug_triage_agent.lock_stale_secs',
} as const;

export type PolicyKey = typeof POLICY_KEYS[keyof typeof POLICY_KEYS];
