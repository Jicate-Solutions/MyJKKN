-- Migration: 2026-06-06 00:45 IST (19:15 UTC 2026-06-05)
-- Purpose:
--   Platform-wide follow-up to PR #1225 (YoY RPCs lockdown). The 2026-06-05
--   three-layer security sweep found that the anon EXECUTE-grant pattern
--   extends far beyond the 11 YoY RPCs. This migration locks down 155
--   additional names (159 signatures with overloads) in the developer-intent
--   API surface that were still callable by `anon`.
--
-- Root cause (recap from PR #1225):
--   Supabase's default schema setup includes
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public
--       GRANT ALL ON FUNCTIONS TO anon, authenticated
--   This grants `anon` directly on every new public function — separate
--   from PUBLIC. The standard migration template's `REVOKE ALL FROM PUBLIC`
--   does NOT undo the direct `anon` grant. Explicit `REVOKE FROM anon` is
--   required on every SECURITY DEFINER RPC.
--
-- Audit summary (2026-06-06 ~00:30 IST):
--   - 879 total public functions exist
--   - 808 (92%) have anon EXECUTE grant
--   - 247 are trigger functions (PostgREST-indispatchable — harmless)
--   - 561 non-trigger functions have anon EXECUTE grant
--   - 449 of those are SECURITY DEFINER (bypass RLS when called)
--
-- This migration's lockdown set = intersection of:
--   (a) names in the developer-intent set (`GRANT EXECUTE TO authenticated`
--       statements across 142 migration files, 201 distinct names), AND
--   (b) names currently anon-grantable per pg_proc.proacl, AND
--   (c) names returning non-trigger types (PostgREST-dispatchable)
--
-- Excluded from lockdown (intentional-public OR pending Director review):
--   - fn_get_policy, fn_get_policy_bool, fn_get_policy_int, fn_get_policy_text
--     (cross-cutting config-table lookup — see standing rule
--     `docs/architecture/config-table-pattern.md`. Deferred until per-route
--     audit confirms no anon caller breaks. Phase 2 scope.)
--   - fn_get_policy_clinical_reasoning (already-merged migration
--     `20260522_fn_get_policy_clinical_reasoning.sql` explicitly grants anon)
--   - All names in `20260530120500_grant_anon_community_caste_reads.sql`
--     (community/caste reads — intentionally public for unauthenticated
--     admission landing-page surveys)
--   - The 11 YoY RPCs already locked via PR #1225 / commit 09de188f1
--
-- Call-site verification (single-pass codebase grep across app/ + lib/ +
-- components/ + hooks/):
--   - 98 of 155 RPCs: zero frontend callers (backend/dev/cron-only)
--   - 57 of 155 RPCs: called only from authenticated routes
--   - 2 of 155 RPCs (`increment_campaign_link_clicks`, `capture_gate_entry_lead`)
--     in routes initially flagged as "potentially-public" — manually
--     verified:
--       * `increment_campaign_link_clicks` called from `app/c/[token]/route.ts`
--         which uses `createServiceRoleClient` (not anon)
--       * `capture_gate_entry_lead` called from
--         `lib/services/admission/lead-service.ts` from authenticated kiosk
--         (gate_security role per RPC permission boundary
--         `admission.gate_entry.create`)
--
-- Pre-lockdown empirical breach evidence (anon-curl probes 2026-06-06 ~00:20):
--   - 27 RPCs returned HTTP 200 with data on empty-body probe
--   - 3 RPCs returned HTTP 500 (function callable, internal error on empty body)
--   - 2 RPCs returned HTTP 400 (function callable, parameter validation
--     error — anon can reach)
--   - The remaining 123 returned HTTP 404 (function exists but no overload
--     matches empty body — empirically unreachable from empty-body probe but
--     still anon-grantable per pg_proc, so likely callable with right params)
--
-- Post-lockdown expected behavior:
--   - anon POST /rest/v1/rpc/<any-listed-name> → HTTP 401
--     `permission denied for function <name>`
--   - authenticated calls unaffected (GRANT TO authenticated preserved)
--   - service_role calls unaffected (bypasses GRANT checks)
--
-- Defense-in-depth: this lockdown closes the EXECUTE-grant layer only.
-- SECURITY DEFINER functions with weak internal auth checks still need
-- per-function review (Phase 2 scope, Director-approved).
--
-- ⚠️ Platform standing rule going forward:
--   Every new public RPC migration MUST include
--     REVOKE EXECUTE ON FUNCTION <name>(...) FROM anon, PUBLIC;
--     GRANT EXECUTE ON FUNCTION <name>(...) TO authenticated;
--   The `REVOKE FROM PUBLIC + GRANT TO authenticated` pattern alone is
--   insufficient — see `feedback_supabase_anon_execute_default_grant.md`
--   and updated `CLAUDE.md` SQL File Management Rules section.
--
-- Idempotent: REVOKE + GRANT are both no-ops if state is already correct.
-- Dynamically enumerates pg_proc so any future overload of these names
-- automatically inherits the lockdown if this migration is re-run.

DO $$
DECLARE
  rec record;
  fn_sig text;
  cnt int := 0;
  target_names text[] := ARRAY[
    'add_auth_code_to_bucket',
    'add_module_to_session',
    'admission_account_transition_with_bills',
    'admission_adopt_structure_for_lead',
    'admission_approve_fee_change_event',
    'admission_bulk_upsert_fee_structure',
    'admission_resolve_fee_items_for_lead',
    '_admission_stream_label',
    'ai_rpc_admission_analytics',
    'ai_rpc_admission_details',
    'ai_rpc_admission_referrers',
    'ai_rpc_admissions',
    'ai_rpc_admissions_by_location',
    'ai_rpc_admission_statistics',
    'ai_rpc_hierarchy_summary',
    'ai_rpc_kpi_summary',
    'ai_rpc_student_search',
    'approve_reservation',
    'assign_counselor_role',
    'audit_execute_discovery_query',
    'audit_validate_discovery_sql',
    'bulk_round_robin_assign',
    'bulk_route_unassigned_leads',
    '_campaign_link_institution_id',
    '_campaign_link_is_global',
    'capture_gate_entry_lead',
    'check_email_available',
    'cleanup_orphaned_sessions',
    'close_user_session',
    'compute_composite_band',
    'compute_daily_engagement_metrics',
    'compute_learner_risk_assessment',
    'compute_renormalized_composite',
    'compute_student_engagement_scores',
    'create_preregistered_profile',
    'evaluate_learner_status_after_payment',
    '_expo_event_institution_id',
    'fi_is_coinventor',
    'fi_is_initiative_owner_or_authority',
    'fn_accounts_metrics',
    'fn_admission_source_coverage_daily',
    'fn_advance_payroll_period',
    'fn_aicte_annual_export',
    'fn_aqs_admission_leads_unassigned_count',
    'fn_aqs_attendance_faculty_compliance_today',
    'fn_aqs_attendance_unmarked_periods_today',
    'fn_aqs_billing_overdue_invoices',
    'fn_aqs_counselor_pending_leads',
    'fn_backdate_payroll_period',
    'fn_check_role_demotion_impact',
    'fn_compute_input_attrition_pipeline',
    'fn_compute_input_peer_benchmark',
    'fn_compute_input_projected_intake',
    'fn_compute_input_sanctioned_gap',
    'fn_compute_input_sfr',
    'fn_compute_input_specialization_gap',
    'fn_compute_input_workload',
    'fn_compute_recruitment_signal',
    'fn_expire_stale_callbacks',
    'fn_faculty_metrics',
    'fn_generate_hr_command_center_brief_items',
    'fn_geography_analytics',
    'fn_get_admin_nav_overrides',
    'fn_get_body_specific_computation',
    'fn_get_consultant_commission_trigger',
    'fn_get_consultant_portal_access',
    'fn_get_consultant_tier_for_conversions',
    'fn_get_counselor_tier_policy',
    'fn_get_curfew',
    'fn_get_whatsapp_daily_limit',
    'fn_group_dashboard_overview',
    'fn_group_dashboard_overview',
    'fn_hod_metrics',
    'fn_hostel_premium_evaluate',
    'fn_institution_comparison',
    'fn_internship_cascade_preview',
    'fn_internship_evaluate_policy',
    'fn_internship_get_active_policy_keys',
    'fn_is_hr_admin',
    'fn_match_lead_by_identity_hash',
    'fn_naac_5_2_1_export',
    'fn_premium_confirm_invite',
    'fn_premium_create_invite',
    'fn_premium_decline_invite',
    'fn_premium_reserve_bed',
    'fn_prepare_payroll_period',
    'fn_reject_payroll_period',
    'fn_routing_errors_recent',
    'fn_seat_analytics_daily_pivot',
    'fn_source_analytics',
    'fn_student_metrics',
    'get_admission_counselor_performance_aggregate',
    'get_admission_dashboard_summary_aggregate',
    'get_admission_funnel_summary_aggregate',
    'get_approved_leave_for_attendance',
    'get_billing_analytics_aging',
    'get_billing_analytics_by_category',
    'get_billing_analytics_by_institution',
    'get_billing_analytics_overview',
    'get_billing_collection_trend',
    'get_billing_today_collections',
    'get_billing_user_activity',
    'get_campaign_funnel',
    'get_campaigns_compare',
    'get_campaigns_overview_stats',
    'get_campaign_time_series',
    'get_counselor_daily_view',
    'get_counselor_role_keys_for_users',
    'get_counselors_holding_source_leads',
    'get_digest_recipients',
    '_get_historical_admitted_by_day',
    'get_institution_for_exophone',
    'get_learner_checklist',
    'get_learners_missing_profiles',
    'get_my_learner_id',
    'get_retention_days',
    'get_seat_analytics',
    'get_staffing_threshold',
    'get_team_activity_day',
    'get_team_activity_trend',
    'get_user_ids_by_role_key',
    'get_user_organizational_context',
    'ims_log_supply_event',
    'ims_validate_bundle_has_components',
    'increment_campaign_link_clicks',
    'is_bos_chairman_of',
    'is_bos_chairman_of_board',
    'is_bos_member_of',
    'is_bos_member_of_board',
    'is_bos_principal_user',
    'is_reservation_approver',
    'mark_checklist_item',
    'migrate_pre_registered_profile_to_auth',
    'mirror_staff_role_to_user_roles',
    '_pick_counselor_for_source',
    'reassign_source_leads_between_counselors',
    'reconcile_campaign_link_counters',
    'reject_reservation',
    'sh_has_management_access',
    'sh_is_admin',
    'sh_is_leadership',
    'sync_bus_pass_to_learner_profile',
    'upsert_user_app_session',
    '_user_assigned_source_enums',
    '_user_can_view_lead_for_call',
    '_user_can_view_lead_source',
    'user_has_all_institution_access',
    'user_has_institution_access',
    'user_has_permission',
    'user_has_permission',
    '_user_in_admission_lead_allowlist',
    'user_is_hosteler',
    '_user_is_strict_counselor',
    'validate_and_use_auth_code',
    '_yoy_program_category'
  ];
BEGIN
  FOR rec IN
    SELECT proname, pg_get_function_identity_arguments(oid) AS args
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = ANY(target_names)
  LOOP
    fn_sig := format('public.%I(%s)', rec.proname, rec.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', fn_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn_sig);
    cnt := cnt + 1;
  END LOOP;
  RAISE NOTICE 'Locked down % function signatures across % distinct names (REVOKE EXECUTE FROM anon, PUBLIC; GRANT EXECUTE TO authenticated)', cnt, array_length(target_names, 1);
END $$;
