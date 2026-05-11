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
} as const;

export type PolicyKey = typeof POLICY_KEYS[keyof typeof POLICY_KEYS];
