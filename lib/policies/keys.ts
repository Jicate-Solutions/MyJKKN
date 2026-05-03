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
} as const;

export type PolicyKey = typeof POLICY_KEYS[keyof typeof POLICY_KEYS];
