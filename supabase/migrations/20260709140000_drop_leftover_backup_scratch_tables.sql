-- Migration: 2026-06-09 — Drop leftover backup + scratch tables (Phase-2 cleanup)
-- Status: APPLIED-LIVE 2026-06-09 via Management API. Destructive + irreversible.
--
-- Context:
--   The 2026-06-07 security sweep + 2026-06-09 lockdown (PR #1256) found ~70
--   RLS-disabled public tables anon could read. PR #1256 revoked anon (and, for
--   backup/scratch tables, authenticated) so they were locked to service_role.
--   This migration removes the redundant ones entirely — eliminating copies of
--   student PII at rest and clearing diagnostic-session debris from prod.
--
-- Director decision (2026-06-09 interview): "Drop scratch + dated backups" —
--   then refined to "keep the 9 recent migration-rollback backups, drop the
--   other 54" after the agent flagged that 9 of the matched tables are 1–4 day
--   old rollback snapshots for in-flight admission data remaps.
--
-- Safety verification before drop (all confirmed zero):
--   - Foreign keys referencing the drop set:        0
--   - Views depending on the drop set:              0
--   - Functions referencing the drop set:           0
--   (DROP ... IF EXISTS without CASCADE — a surprise dependency errors loudly
--   rather than silently cascading.)
--
-- EXPLICITLY PRESERVED (NOT dropped):
--   * 4 live substrate tables feeding view v_privilege_memberships_effective:
--       _resolver_privilege_lc_members, _resolver_privilege_manual,
--       _resolver_privilege_yuva_chapter_chairs, _resolver_privilege_yuva_vertical_chairs
--   * 9 recent admission-remap rollback backups (keep until remaps validated):
--       _bak_admission_historical_pivot_20260605, _bak_admission_year_quota_seats_20260605,
--       _bak_admission_years_20260605, _bak_ay_links_20260605, _bak_programs_seats_20260605,
--       _bak_learner_academic_year_remap_20260608, _bak_learner_degree_remap_20260608,
--       _bak_learner_section_remap_20260608, _bak_learner_semester_remap_20260608
--
-- DROPPED (54): 7 dated PII backups + 47 diagnostic/scratch tables.

-- ── 7 dated PII backups (redundant copies; live data untouched) ──────────────
DROP TABLE IF EXISTS public.students_backup_20251223;
DROP TABLE IF EXISTS public.learners_profiles_backup_20251223;
DROP TABLE IF EXISTS public.learners_profiles_backup_bpharm_sem8_active;
DROP TABLE IF EXISTS public.profiles_backup_bpharm_sem8_active;
DROP TABLE IF EXISTS public.profiles_deleted_guests_backup_20260414;
DROP TABLE IF EXISTS public.student_attendance_backup_20251223;
DROP TABLE IF EXISTS public.user_roles_deleted_guests_backup_20260414;

-- ── 47 diagnostic / scratch tables (left by prior migration/audit sessions) ──
DROP TABLE IF EXISTS public._active_progs;
DROP TABLE IF EXISTS public._agg_programs;
DROP TABLE IF EXISTS public._aided_edu_any;
DROP TABLE IF EXISTS public._anon_check_substrate;
DROP TABLE IF EXISTS public._audit_anon_rpc_grants_20260606;
DROP TABLE IF EXISTS public._audit_lockdown_target_20260606;
DROP TABLE IF EXISTS public._ay_full_cols;
DROP TABLE IF EXISTS public._ay_links_sample;
DROP TABLE IF EXISTS public._ay_links_schema;
DROP TABLE IF EXISTS public._ay_relations;
DROP TABLE IF EXISTS public._ay_schema;
DROP TABLE IF EXISTS public._aysq_schema;
DROP TABLE IF EXISTS public._backfill_preview;
DROP TABLE IF EXISTS public._backup_match_test;
DROP TABLE IF EXISTS public._bak_counts;
DROP TABLE IF EXISTS public._bak_quota_sample;
DROP TABLE IF EXISTS public._bak_quota_schema;
DROP TABLE IF EXISTS public._bak_sanctioned_for_missing;
DROP TABLE IF EXISTS public._bak_schema;
DROP TABLE IF EXISTS public._family_institutions;
DROP TABLE IF EXISTS public._full_rpcs;
DROP TABLE IF EXISTS public._hp_backup_search;
DROP TABLE IF EXISTS public._hp_bak_by_program;
DROP TABLE IF EXISTS public._hp_bak_check;
DROP TABLE IF EXISTS public._hp_constraints;
DROP TABLE IF EXISTS public._hp_keys;
DROP TABLE IF EXISTS public._hp_orphan_check;
DROP TABLE IF EXISTS public._hp_schema;
DROP TABLE IF EXISTS public._ih_sample;
DROP TABLE IF EXISTS public._ih_schema;
DROP TABLE IF EXISTS public._legacy_wa_phone_numbers_pre_meta_substrate;
DROP TABLE IF EXISTS public._live_rpc_def;
DROP TABLE IF EXISTS public._lockdown_auth_check;
DROP TABLE IF EXISTS public._lockdown_set_157;
DROP TABLE IF EXISTS public._missing_programs_v2;
DROP TABLE IF EXISTS public._orphan_samples;
DROP TABLE IF EXISTS public._orphans_in_bak;
DROP TABLE IF EXISTS public._p2d_recon;
DROP TABLE IF EXISTS public._restore_mapping;
DROP TABLE IF EXISTS public._sanctioned_locations;
DROP TABLE IF EXISTS public._staff_scope_lockdown_backup_20260511;
DROP TABLE IF EXISTS public._state_check;
DROP TABLE IF EXISTS public._substrate_verify;
DROP TABLE IF EXISTS public._target_in_bak;
DROP TABLE IF EXISTS public._verify_18;
DROP TABLE IF EXISTS public._verify_after_lockdown;
DROP TABLE IF EXISTS public._verify_restore;
