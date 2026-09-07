# Migration duplicate-version backlog — 349 versions, 632 files that can never own a ledger row

**Read-only census. Measured on `jicate/main` at commit `1dacf18d` on 2026-09-03.
Nothing in this document has been applied, renamed, or backfilled. The cleanup it
describes is an open Director decision, not a plan.**

---

## The one-sentence version

`supabase_migrations.schema_migrations` keys on `version` alone — that column is
the PRIMARY KEY — so when two migration files share a version token, one of them
records as applied and **the other never runs, with no error anywhere a person
would see**; 349 versions on `main` are shared this way, and 632 files sit on the
losing side of one.

## Why nobody notices

`supabase db push` is the only thing that applies migrations here. It reads the
version from the filename — the token before the **first underscore**, not the
leading 14 digits — and writes one row per version. When it meets a second file
carrying a version already in the ledger it does not error. It treats the version
as already applied and **skips the file**. The apply job goes green. The ledger
reports success. The objects in the skipped file are never created.

There is nothing to find afterwards. There is only a missing object, discovered
weeks later, against a migration everybody can see merged on `main`.

## The receipt this document was written for

Version `20260504` is carried by two files on `main` right now:

| File | Fate |
|---|---|
| `20260504_ai_pulse_rls_hardening.sql` | one of these two owns the ledger row |
| `20260504_instasolver_substrate.sql` | the other was silently skipped |

The InstaSolver substrate was believed applied for months. It was not. It was the
second file at `20260504`, and the ledger had no way to say so. That is not a
special case — it is one of 349, picked out only because somebody eventually went
looking for a table that should have existed.

Two more, already on record in this repository:

- **`20260808110000`** — four files, authored by four different pull requests that
  had each independently computed "one tick after the newest version on `main`".
  Recorded in the header of `scripts/ci/check-migration-version-collision.mjs`.
- **`20260816040000`** — carried by both
  `20260816040000_notification_expiry_director_categories.sql` and
  `20260816040000_fix_bds_deluxe_rule_semester_four_year.sql`. Both happened to be
  hand-applied, so nothing broke. That time.

## The measured backlog

Top-level `supabase/migrations/*.sql` only — `supabase db push` never reads nested
directories, so `supabase/migrations/admission/*` is not counted.

| | Count |
|---|---|
| Migration files | **2,767** |
| Duplicate groups reported by `--all` | **355**, holding **995** files |
| — of those, **real duplicate versions** | **349**, holding **981** files |
| — — 14-digit version tokens | 261 groups, 580 files |
| — — 8-digit `YYYYMMDD` tokens | 88 groups, 401 files |
| — of those, non-date grouping artefact | 6 groups, 14 files |
| **Files that can never own a ledger row** | **632** |
| Worst single version (`20260725`) | 16 files — 15 of them skipped |

Regenerate all of it, live, from any checkout:

```bash
node scripts/ci/check-migration-version-collision.mjs --all
```

The full per-version listing is in the [appendix](#appendix--every-duplicated-version-and-the-files-sharing-it) below.

### The backlog is growing, not stable

Counted at `134d1caf` (2026-08-01) and again at `1dacf18d` (2026-09-03):

| | 2026-08-01 | 2026-09-03 | Δ |
|---|---|---|---|
| Migration files | 2,177 | 2,767 | +590 |
| Duplicate groups | 283 | 355 | +72 |
| Files inside one | 830 | 995 | +165 |

### A correction to the previous count

`scripts/ci/check-migration-version-collision.mjs` used to describe 91 of its
reported groups as spurious, on the grounds that "8-digit date prefixes like
`20260725_*`" were "not collisions". That was wrong, and it contradicted a
paragraph three lines above it in the same header, which correctly called the
sixteen-file `20260725` group the largest collision in the repository.

Both guards key on the token before the first underscore **because that is what
the Supabase CLI keys the ledger on**. `20260725` is a version. Two files carrying
it collide exactly as two files carrying a 14-digit token do. Only tokens that are
not dates at all — `fix_*`, `rls_*`, `scf_*`, `induction_*`, `optimize_*`, `pde_*`,
6 groups and 14 files — are a grouping artefact. The header has been corrected in
this pull request; the real figure is **349 duplicate versions, not 192**.

## What is guarded today, and what is not

Three CI jobs live in `.github/workflows/migration-version-collision.yml`:

| Job | Question it answers | Network |
|---|---|---|
| `audit` | Does this PR add a version already held on the base branch? | none — fails closed |
| `cross-pr` | Does another **open** PR claim the same version? | GitHub API — fails **open** |
| `guard-tests` | Does the guard's own logic still work? | none — added by this PR |

`guard-tests` is new here, and it closes a real hole. The cross-PR guard's 20
regression cases had existed in `__tests__/ci/check-migration-version-cross-pr.test.ts`
since it shipped and **were never executed by CI**. Verified at `1dacf18d`:
`grep -rn check-migration-version-cross-pr.test .github/` returned nothing. This
repository has no blanket vitest run — every workflow that runs vitest names its
files by exact path — so a test file nobody names is dead code. That matters more
for this guard than for most, because `cross-pr` **fails open**: a guard that
skips on every run looks, from the checks UI, exactly like a guard that keeps
passing. Its tests assert the wording of the skip path for precisely that reason,
and nothing was running them.

The `paths:` filter also gained the workflow file and the test file, so a pull
request that deletes the `cross-pr` job or its tests now triggers the workflow
instead of slipping through untriggered.

### Four things these guards still cannot see

1. **A version that is free in the repository but already in the ledger.** Both
   guards compare repository files against repository files. The ledger holds
   versions with no corresponding file — `supabase/SQL_FILE_INDEX.md` records
   `20260810150000` as free among repository files yet already recorded in
   `schema_migrations` as `create_leadership_booking_pages`. A new migration that
   picks such a version is silently skipped and **no guard in this repository can
   tell you**. Closing it requires a ledger read from CI; that is not attempted
   here.
2. **The 349 groups already on `main`.** Both guards are baseline-aware on
   purpose: they flag only what a PR newly introduces. Every existing group passes
   in silence, by design — see the baseline note in the guard header for why a
   full-repo check would fail every pull request from its first run and be
   reverted the same day.
3. **Whether a red check actually stops anything.** `GET
   /repos/Jicate-Solutions/MyJKKN/branches/main/protection` returned **404 Branch
   not protected** on 2026-09-03. No status check on this repository is required.
   Every guard here — these three and all their siblings — is advisory: it can go
   red and the pull request can still merge. Making any of them blocking is a
   repository-settings change and a Director decision, not something a pull
   request can do.
4. **Whether the SQL is correct.** These are filename guards. They say nothing
   about ordering, safety, or whether a migration does what it claims.

## The open question: do NOT mass-fix this

The obvious repair — renumber the 632 losing files, or backfill the ledger so
every file has a row — **is not attempted in this pull request and should not be
attempted casually.** It is a Director decision. Here is what it would actually
touch.

Naive text counts across top-level migrations (`grep -oiE`; includes matches
inside comments and strings, so treat these as an upper bound on statements and a
sound signal on files):

| Statement | In all 2,767 files | In the 995 duplicate-group files |
|---|---|---|
| `DROP TABLE` | 199 stmts / 80 files | **59 stmts / 32 files** |
| `DELETE FROM` | 417 stmts / 218 files | **164 stmts / 93 files** |
| `DROP COLUMN` | 115 stmts / 45 files | **52 stmts / 13 files** |
| `TRUNCATE` | 26 stmts / 17 files | **10 stmts / 7 files** |

Three specific reasons this is dangerous, all of them already demonstrated on this
database:

- **Renumbering makes a skipped file eligible to run for the first time.** That is
  the point of renumbering — and it means 632 files, carrying the destructive
  statements above, become pending against a production database whose real shape
  no longer matches what they were written for.
- **Backfilling the ledger is a one-way door.** A version marked applied is
  indistinguishable, forever, from one that actually ran; the ledger stores a
  version string and no proof. This was already decided once, on 2026-08-13, for
  the seven hand-applied accreditation migrations — see
  [`2026-08-12-MIGRATION-ledger-drift-unrecorded-applied-versions.md`](./2026-08-12-MIGRATION-ledger-drift-unrecorded-applied-versions.md).
  The reasoning applies here with 632 files instead of seven.
- **Replay order and wall-clock order disagree on this database.** A file sorting
  earlier than something already live can still be applied after it, and
  `CREATE OR REPLACE` / `ALTER POLICY` replace an object wholesale. That is how a
  correct-looking replay silently reverts a later change. The `⚠️ ORDERING` notes
  in `supabase/SQL_FILE_INDEX.md` mark where this is known to bite.

**A blanket `supabase db push` against production must never be reached for as a
way to resolve any of this.**

If a cleanup is ever authorised, the only shape that looks survivable is: one file
at a time, newest-first, each one rehearsed inside `BEGIN … ROLLBACK`, each one
verified by **catalog** read (`pg_proc`, `pg_policies`,
`information_schema.columns`) rather than by ledger, and each one recorded in
`supabase/SQL_FILE_INDEX.md` with its apply receipt. At 632 files that is a
programme, not a task.

## What this document does NOT establish

Stated plainly, because the gap matters:

- **How many of the 2,767 files are absent from the ledger.** This census is
  computed entirely from the git tree. Answering it requires reading
  `supabase_migrations.schema_migrations` on production. No database was read for
  this document and none was written. A figure of roughly 2,400 absent files was
  quoted to this work as prior context; **it is unverified here** and must not be
  cited from this document.
- **Which file in each group won its ledger row.** The ledger stores a version and
  nothing else — not a filename, not a hash. For every one of the 349 groups,
  which file ran and which was skipped is **not recoverable from the ledger at
  all**. It can only be established per-object, by asking the catalog whether the
  things that file creates exist.
- **Whether any given skipped file matters.** Some will be no-ops by now,
  superseded by later migrations. Some will be `20260504_instasolver_substrate.sql`.
  Distinguishing them is per-file catalog work.

## Related

- `scripts/ci/check-migration-version-collision.mjs` — the git-only guard; `--all` regenerates the census below
- `scripts/ci/check-migration-version-cross-pr.sh` — the sibling-PR guard, and the one that fails open
- `.github/workflows/migration-version-collision.yml` — all three jobs
- [`2026-08-12-MIGRATION-ledger-drift-unrecorded-applied-versions.md`](./2026-08-12-MIGRATION-ledger-drift-unrecorded-applied-versions.md) — the other half of the ledger's unreliability: files that ARE live but have no row
- `supabase/SQL_FILE_INDEX.md` — apply receipts and `⚠️ ORDERING` notes; currently a more truthful record of this database than the ledger is

---

# Appendix — every duplicated version, and the files sharing it

355 groups, 995 files, ordered by group size then version. Every group below loses
all but one of its files on a ledger-driven apply; **which** one survives is not
recorded anywhere. Generated from `jicate/main` at `1dacf18d`; regenerate with
`node scripts/ci/check-migration-version-collision.mjs --all`.

### `20260725` — 16 files (8-digit date, 15 skipped on apply)

- `20260725_account_transition_bill_hostellers_core_fees.sql`
- `20260725_admission_years_is_current_flag.sql`
- `20260725_allocation_cohort_active_learners_only.sql`
- `20260725_auto_allocate_preview_gender_scope.sql`
- `20260725_backfill_account_learner_core_bills.sql`
- `20260725_billing_bills_backfill_academic_year.sql`
- `20260725_billing_bills_default_academic_year_trigger.sql`
- `20260725_billing_coverage_accommodation_transport_filters.sql`
- `20260725_billing_coverage_gender_filter.sql`
- `20260725_billing_coverage_permissions.sql`
- `20260725_billing_coverage_rpcs.sql`
- `20260725_billing_coverage_semester_section_column.sql`
- `20260725_billing_coverage_sorting.sql`
- `20260725_bos_board_senders_smtp_creds.sql`
- `20260725_bos_syllabus_pharmacy_model.sql`
- `20260725_learners_backfill_missing_academic_year.sql`

### `20260428` — 15 files (8-digit date, 14 skipped on apply)

- `20260428_add_dial_whom_number_to_call_logs.sql`
- `20260428_expand_counselor_roles_attribution_backfill.sql`
- `20260428_expo_rls_dynamic_permissions.sql`
- `20260428_expo_rls_recursion_hotfix.sql`
- `20260428_fn_geography_analytics.sql`
- `20260428_fn_group_dashboard_overview.sql`
- `20260428_fn_institution_comparison.sql`
- `20260428_fn_seat_analytics_daily_pivot.sql`
- `20260428_fn_seat_analytics_daily_pivot_full_name.sql`
- `20260428_fn_source_analytics.sql`
- `20260428_hr_command_center_brief_digest.sql`
- `20260428_phase7_counselor_seeds_and_source_alignment.sql`
- `20260428_phase8_duty_log_implementation.sql`
- `20260428_phase8a_rules_engine_consumption.sql`
- `20260428_routing_engine_v2_phase3.sql`

### `20260518` — 15 files (8-digit date, 14 skipped on apply)

- `20260518_add_display_department_to_bos_members.sql`
- `20260518_bos_email_template_left_align.sql`
- `20260518_bos_email_template_signoff.sql`
- `20260518_bos_email_template_tight_padding.sql`
- `20260518_cdc_substrate_01_masters_enums_roles_policies.sql`
- `20260518_cdc_substrate_02_domain_tables_rls.sql`
- `20260518_cdc_substrate_03_internship_extensions_triggers_storage.sql`
- `20260518_pde_cluster_a_scoring_integrity_policies.sql`
- `20260518_pde_cluster_b_visibility_transparency_policies.sql`
- `20260518_pde_cluster_c_rollout_compliance_policies.sql`
- `20260518_pde_cluster_d_quests_supply_policies.sql`
- `20260518_pde_cultural_civic_rubrics.sql`
- `20260518_pde_demonstrations_table.sql`
- `20260518_pde_embodied_practice_rubrics.sql`
- `20260518_pde_social_leadership_rubrics.sql`

### `20251015` — 14 files (8-digit date, 13 skipped on apply)

- `20251015_add_staff_fields_to_profile_sync.sql`
- `20251015_add_student_indexes_for_hod_queries.sql`
- `20251015_backfill_staff_profile_ids.sql`
- `20251015_cleanup_duplicate_staff_triggers.sql`
- `20251015_fix_duplicate_email_constraint.sql`
- `20251015_fix_preregistered_profile_access.sql`
- `20251015_fix_staff_profile_sync.sql`
- `20251015_fix_staff_status_sync_trigger.sql`
- `20251015_fix_staff_trigger_on_conflict.sql`
- `20251015_fix_staff_trigger_preserve_oauth_state.sql`
- `20251015_fix_staff_trigger_timing.sql`
- `20251015_rollback_broken_policies.sql`
- `20251015_store_profile_id_in_staff.sql`
- `20251015_sync_staff_deletion_and_status.sql`

### `20260422` — 13 files (8-digit date, 12 skipped on apply)

- `20260422_approval_chain_engine.sql`
- `20260422_audit_parameter_catalog_seed.sql`
- `20260422_audit_workflow_rls.sql`
- `20260422_audit_workflow_seeds_and_triggers.sql`
- `20260422_audit_workflow_substrate.sql`
- `20260422_grievance_evidence_emission_trigger.sql`
- `20260422_grievance_module_a6a_seeds.sql`
- `20260422_hostel_residents_master.sql`
- `20260422_hostel_vacate_storage_bucket.sql`
- `20260422_hostel_vacate_workflow.sql`
- `20260422_privilege_groups_dynamic_source.sql`
- `20260422_privilege_source_registry_and_resolvers.sql`
- `20260422_privilege_source_types_is_system_and_rls.sql`

### `20260729` — 12 files (8-digit date, 11 skipped on apply)

- `20260729_billing_coverage_hierarchy_filters.sql`
- `20260729_billing_coverage_learner_bills.sql`
- `20260729_billing_delete_super_admin_only.sql`
- `20260729_billing_receipt_void.sql`
- `20260729_bos_member_types_faculty.sql`
- `20260729_bos_members_backfill_sort_order.sql`
- `20260729_bos_renumber_member_order.sql`
- `20260729_hostel_to_dayscholar_vacated_learners.sql`
- `20260729_razorpay_rotate_webhook_secret.sql`
- `20260729_receipt_cancellation_approval.sql`
- `20260729_receipt_cancellation_super_admin_only.sql`
- `20260729_staff_plan_courses_dynamic_permission_rls.sql`

### `20260522` — 11 files (8-digit date, 10 skipped on apply)

- `20260522_bulk_semesters_jkkn_college_of_education.sql`
- `20260522_clinical_case_seed_oral_lichen_planus.sql`
- `20260522_clinical_reasoning_policies_seed.sql`
- `20260522_clinical_reasoning_seeds.sql`
- `20260522_fn_get_policy_clinical_reasoning.sql`
- `20260522_learners_profiles_fk_set_null.sql`
- `20260522_pde_assessment_questions_clinical_q_types.sql`
- `20260522_pde_assessments_clinical_case_extensions.sql`
- `20260522_pde_submissions_versioning_and_audit.sql`
- `20260522_platform_policies_typed_widget_metadata.sql`
- `20260522_vac_lessons_case_scenario.sql`

### `20250121` — 9 files (8-digit date, 8 skipped on apply)

- `20250121_add_profile_id_to_staff.sql`
- `20250121_fix_academic_year_duplicates.sql`
- `20250121_fix_attendance_details_section_code.sql`
- `20250121_fix_attendance_details_type_mismatch.sql`
- `20250121_fix_attendance_report_duplicates.sql`
- `20250121_fix_attendance_report_function.sql`
- `20250121_fix_attendance_simplified.sql`
- `20250121_fix_faculty_attendance_report_ambiguous.sql`
- `20250121_fix_student_name_fetching.sql`

### `20260424` — 9 files (8-digit date, 8 skipped on apply)

- `20260424_backfill_admission_call_logs_counselor_id.sql`
- `20260424_backfill_admission_year_id_active_graduated.sql`
- `20260424_bos_align_institutions_id_and_drop_expert_fk.sql`
- `20260424_bos_compositions_constituted_by_to_text.sql`
- `20260424_drop_seat_analytics_compat_shim.sql`
- `20260424_fix_seat_analytics_admission_years.sql`
- `20260424_learner_hostel_profiles_table.sql`
- `20260424_seat_analytics_compat_shim.sql`
- `20260424_seed_approval_chain_rules_hostel_leave.sql`

### `20260427` — 9 files (8-digit date, 8 skipped on apply)

- `20260427_add_assign_counselor_role_rpc.sql`
- `20260427_admission_counselors_audit_log.sql`
- `20260427_backfill_counselor_id_via_lead_assignment.sql`
- `20260427_counselor_routing_db_foundation.sql`
- `20260427_counselor_taxonomy_phase1.sql`
- `20260427_fix_get_user_accessible_institutions_role_scope_all.sql`
- `20260427_reassign_admission_counselors_to_correct_categories.sql`
- `20260427_resync_counselor_identity_after_reverter.sql`
- `20260427_role_demotion_safeguards.sql`

### `20260429` — 9 files (8-digit date, 8 skipped on apply)

- `20260429_admin_landing_page_policies.sql`
- `20260429_admin_nav_overrides_seeds.sql`
- `20260429_consume_counselor_routing_config.sql`
- `20260429_counselor_routing_config.sql`
- `20260429_drop_alsc_referrer_fk.sql`
- `20260429_notification_recipient_policies.sql`
- `20260429_retention_policies.sql`
- `20260429_staffing_alert_thresholds.sql`
- `20260429_whatsapp_send_limits.sql`

### `20260512` — 9 files (8-digit date, 8 skipped on apply)

- `20260512_add_bos_member_types.sql`
- `20260512_bos_ta_da_expert_id_nullable.sql`
- `20260512_create_bos_po_pso_mapping.sql`
- `20260512_drop_bos_boards.sql`
- `20260512_fix_bos_board_programmes_null_institutions.sql`
- `20260512_fix_bos_members_rls.sql`
- `20260512_fix_bos_taxonomy_rls.sql`
- `20260512_grant_bos_compositions_dotformat_to_roles.sql`
- `20260512_grant_bos_taxonomy_edit_to_roles.sql`

### `20250117` — 8 files (8-digit date, 7 skipped on apply)

- `20250117_add_auth_to_applications.sql`
- `20250117_add_critical_foreign_keys.sql`
- `20250117_add_foreign_keys.sql`
- `20250117_add_foreign_keys_fixed.sql`
- `20250117_child_app_auth_codes.sql`
- `20250117_child_app_auth_tables.sql`
- `20250117_remove_users_table.sql`
- `20250117_test_single_foreign_key.sql`

### `20260224` — 8 files (8-digit date, 7 skipped on apply)

- `20260224_add_gst_fields_to_ims.sql`
- `20260224_add_items_returned_to_ims_sales.sql`
- `20260224_add_receipt_pdf_url_to_ims_sales.sql`
- `20260224_create_ims_receipts_bucket.sql`
- `20260224_create_ims_sale_number_counters.sql`
- `20260224_create_ims_shifts_table.sql`
- `20260224_create_store_admin_system_role.sql`
- `20260224_fix_ims_stores_jkkn_institution.sql`

### `20250123` — 7 files (8-digit date, 6 skipped on apply)

- `20250123_child_app_optimization.sql`
- `20250123_child_app_rls_policies.sql`
- `20250123_cleanup_old_child_app_safe.sql`
- `20250123_cleanup_old_child_app_tables.sql`
- `20250123_fix_function_return.sql`
- `20250123_fix_function_security.sql`
- `20250123_standardize_geography_fields.sql`

### `20250126` — 7 files (8-digit date, 6 skipped on apply)

- `20250126_add_driver_to_user_role_enum.sql`
- `20250126_fix_orphaned_auth_users.sql`
- `20250126_fix_orphaned_driver_users.sql`
- `20250126_fix_rls_policy_recursion.sql`
- `20250126_oauth_only_user_system.sql`
- `20250126_remove_auth_fkey_for_preregistration.sql`
- `20250126_update_oauth_system_uuid.sql`

### `20250903` — 7 files (8-digit date, 6 skipped on apply)

- `20250903_add_academic_year_to_attendance_details.sql`
- `20250903_fix_attendance_details_student_names.sql`
- `20250903_fix_attendance_report_uuid_handling.sql`
- `20250903_fix_attendance_student_details.sql`
- `20250903_fix_course_code_lookup_fallback.sql`
- `20250903_fix_department_degree_display.sql`
- `20250903_fix_faculty_attendance_reports_access.sql`

### `20260119` — 7 files (8-digit date, 6 skipped on apply)

- `20260119_add_mv_unique_index.sql`
- `20260119_create_engagement_analytics_schema.sql`
- `20260119_create_engagement_functions.sql`
- `20260119_create_engagement_jobs.sql`
- `20260119_fix_compute_student_engagement_scores_email_join.sql`
- `20260119_fix_compute_student_engagement_scores_role.sql`
- `20260119_fix_get_user_organizational_context_email_join.sql`

### `20250125` — 6 files (8-digit date, 5 skipped on apply)

- `20250125_add_driver_users.sql`
- `20250125_final_faculty_info_fix.sql`
- `20250125_fix_faculty_info_retrieval.sql`
- `20250125_fix_student_profile_institutions.sql`
- `20250125_sync_student_email_with_profiles.sql`
- `20250125_validate_student_email_changes.sql`

### `20260421` — 6 files (8-digit date, 5 skipped on apply)

- `20260421_admission_years.sql`
- `20260421_delete_education_fair_leads.sql`
- `20260421_fix_admission_seat_config_rls.sql`
- `20260421_fix_ims_store_admin_rls.sql`
- `20260421_lc_restructure_v4.sql`
- `20260421_leave_onduty_v2.sql`

### `20260423` — 6 files (8-digit date, 5 skipped on apply)

- `20260423_audit_discovery_rpc.sql`
- `20260423_grievance_business_day_sla_functions.sql`
- `20260423_hostel_vacate_otp_columns.sql`
- `20260423_learners_profiles_admission_year_id_shadow_fk.sql`
- `20260423_sync_counselor_profile_role_and_admission_counselors.sql`
- `20260423_unification_crud_retrofit.sql`

### `20260526` — 6 files (8-digit date, 5 skipped on apply)

- `20260526_add_created_by_fk_to_billing_tables.sql`
- `20260526_add_deleted_at_to_degrees.sql`
- `20260526_add_school_entity_type.sql`
- `20260526_create_school_defaults_audit_logs.sql`
- `20260526_fix_applications_delete_rls_role_mismatch.sql`
- `20260526_fix_receipt_creation_fees_confirmed_and_overpayment.sql`

### `20250127` — 5 files (8-digit date, 4 skipped on apply)

- `20250127_add_learner_id_to_profiles.sql`
- `20250127_create_profile_creation_function.sql`
- `20250127_fix_driver_oauth_login.sql`
- `20250127_fix_profiles_rls_for_preregistration.sql`
- `20250127_improve_driver_oauth_trigger.sql`

### `20251227` — 5 files (8-digit date, 4 skipped on apply)

- `20251227_add_custom_roles_system_fields.sql`
- `20251227_add_student_rls_policies_learners_profiles.sql`
- `20251227_auto_create_profile_on_approval.sql`
- `20251227_create_student_role_function.sql`
- `20251227_link_profiles_to_learners.sql`

### `20260411` — 5 files (8-digit date, 4 skipped on apply)

- `20260411_add_leave_onduty_sub_categories.sql`
- `20260411_add_onduty_sponsor_and_jkkn_categories.sql`
- `20260411_fix_admission_leads_rls_profile_role_fallback.sql`
- `20260411_fix_expo_rls_admission_profile_role.sql`
- `20260411_fix_stage_history_rls_performance.sql`

### `20260519` — 5 files (8-digit date, 4 skipped on apply)

- `20260519_backfill_display_department_in_bos_members.sql`
- `20260519_bos_email_template_body_wording.sql`
- `20260519_pde_capabilities_versioning.sql`
- `20260519_pde_quest_risk_tier_column.sql`
- `20260519_pde_reciprocal_credits.sql`

### `20260818` — 5 files (8-digit date, 4 skipped on apply)

- `20260818_backfill_hostel_mess_and_fix_education_tuition.sql`
- `20260818_delete_superseded_hostel_65k_bills.sql`
- `20260818_fix_fee_mismatch_rpc_move_allocations_and_see_hostel_mess.sql`
- `20260818_purge_superseded_bills_ay2026.sql`
- `20260818_split_hostel_mess_bills_ay2026.sql`

### `20250905` — 4 files (8-digit date, 3 skipped on apply)

- `20250905_add_attendance_monitoring_functions.sql`
- `20250905_add_attendance_staff_validation.sql`
- `20250905_check_attendance_data_consistency.sql`
- `20250905_rollback_attendance_staff_validation.sql`

### `20251009` — 4 files (8-digit date, 3 skipped on apply)

- `20251009_add_accounts_role_billing_policies.sql`
- `20251009_fix_billing_access_type.sql`
- `20251009_fix_grant_institution_access_overload.sql`
- `20251009_fix_receipt_number_race_condition.sql`

### `20260226` — 4 files (8-digit date, 3 skipped on apply)

- `20260226_add_ims_grn_indent_number_rpcs.sql`
- `20260226_add_upi_qr_to_ims_sales.sql`
- `20260226_backfill_ims_orphaned_records.sql`
- `20260226_fix_ims_rls_policies.sql`

### `20260502` — 4 files (8-digit date, 3 skipped on apply)

- `20260502_create_ai_pulse_events_extension.sql`
- `20260502_event_proposal_immediate_push.sql`
- `20260502_phase7b_backfill_junctions_for_renamed_admission_counselors.sql`
- `20260502_phase7c_fn_flush_skip_zero_counselor_institutions.sql`

### `20260509` — 4 files (8-digit date, 3 skipped on apply)

- `20260509_internship_module_lop_immunity_v2.sql`
- `20260509_internship_module_reader_fn_v2.sql`
- `20260509_internship_module_seeds_v4.sql`
- `20260509_internship_module_substrate_v3.sql`

### `20260510` — 4 files (8-digit date, 3 skipped on apply)

- `20260510_create_bos_boards.sql`
- `20260510_internship_module_audit_blocker_fixes.sql`
- `20260510_internship_module_seed_missing_policy_keys.sql`
- `20260510_rewrite_fn_group_dashboard_overview_to_leads_only.sql`

### `20260521` — 4 files (8-digit date, 3 skipped on apply)

- `20260521_add_board_type_to_bos_compositions_meetings.sql`
- `20260521_bos_ta_da_sop_redesign.sql`
- `20260521_role_has_institution_access_cas_aware.sql`
- `20260521_sync_bos_members_from_expert.sql`

### `20260610` — 4 files (8-digit date, 3 skipped on apply)

- `20260610_add_attendance_mode_and_class_incharge.sql`
- `20260610_bos_committees.sql`
- `20260610_create_daily_session_attendance.sql`
- `20260610_hr_governance_part3_seeds.sql`

### `20260618` — 4 files (8-digit date, 3 skipped on apply)

- `20260618_create_parent_portal_announcements.sql`
- `20260618_create_parent_portal_auth_tables.sql`
- `20260618_create_parent_portal_features.sql`
- `20260618_hr_promotion_workflow.sql`

### `20260620` — 4 files (8-digit date, 3 skipped on apply)

- `20260620_grant_parent_portal_manage.sql`
- `20260620_hr_memos.sql`
- `20260620_pp_attachments.sql`
- `20260620_pp_parent_user_data.sql`

### `20260703` — 4 files (8-digit date, 3 skipped on apply)

- `20260703_billing_bills_select_policy_hoist_scope.sql`
- `20260703_grant_lookup_view_keys_to_billing_roles.sql`
- `20260703_students_read_bill_academic_years.sql`
- `20260703_students_read_own_receipt_items_and_refunds.sql`

### `20260704120000` — 4 files (14-digit, 3 skipped on apply)

- `20260704120000_fn_cl_admin_reset_allocation.sql`
- `20260704120000_live_poll_engine_phase_c_training.sql`
- `20260704120000_revoke_student_learner_profile_direct_edit.sql`
- `20260704120000_social_monthly_cadence.sql`

### `20260705120000` — 4 files (14-digit, 3 skipped on apply)

- `20260705120000_carre_audit_v2.sql`
- `20260705120000_internal_marks_insight_config.sql`
- `20260705120000_scf_enforcement_start_date_forward_only.sql`
- `20260705120000_schools_network_scoreboard.sql`

### `20260706120000` — 4 files (14-digit, 3 skipped on apply)

- `20260706120000_carre_module_auto_signals.sql`
- `20260706120000_pde_certificates_cancellation.sql`
- `20260706120000_recruitment_flow_step_types_backfill.sql`
- `20260706120000_social_engagement_read_rpcs.sql`

### `20260706150000` — 4 files (14-digit, 3 skipped on apply)

- `20260706150000_event_registrations_honor_sf100_perms.sql`
- `20260706150000_induction_mentor_training.sql`
- `20260706150000_social_engagement_nudges.sql`
- `20260706150000_social_engagement_owner_brief.sql`

### `20260710120000` — 4 files (14-digit, 3 skipped on apply)

- `20260710120000_bos_meetings_committee.sql`
- `20260710120000_fix_sibling_pgcrypto_search_path.sql`
- `20260710120000_induction_mentorship_academic_year_lifecycle.sql`
- `20260710120000_scf_permission_switches.sql`

### `20260714` — 4 files (8-digit date, 3 skipped on apply)

- `20260714_audit_gate3_parameter_results.sql`
- `20260714_audit_gate3_verdict_unchecked.sql`
- `20260714_audit_parameter_default_severity.sql`
- `20260714_exam_ia_audit_verdicts_snapshot.sql`

### `20260723140000` — 4 files (14-digit, 3 skipped on apply)

- `20260723140000_attendance_roster_section_authoritative.sql`
- `20260723140000_improvement_ranking_and_escalation.sql`
- `20260723140000_rcltp_answer_key_leak_fix.sql`
- `20260723140000_safety_judge_model_floor.sql`

### `20260730120000` — 4 files (14-digit, 3 skipped on apply)

- `20260730120000_ims_pos_checkout_engine.sql`
- `20260730120000_induction_event_coordinators.sql`
- `20260730120000_lock_anon_policy_and_people_readers.sql`
- `20260730120000_purge_bds_dental_1year_ay2025_26_billing.sql`

### `20260731050000` — 4 files (14-digit, 3 skipped on apply)

- `20260731050000_cohort_core_sf100_backfill.sql`
- `20260731050000_curriculum_poll_phase1_followup_fixes.sql`
- `20260731050000_fp_item_flag_threshold.sql`
- `20260731050000_gemba_corrections_posting_self_and_revoke.sql`

### `20260807` — 4 files (8-digit date, 3 skipped on apply)

- `20260807_bos_syllabus_bds_dental_model.sql`
- `20260807_boys_hostel_deluxe_room_rules.sql`
- `20260807_hostel_room_delete_rpc.sql`
- `20260807_purge_floor0_test_allocations.sql`

### `20260808120000` — 4 files (14-digit, 3 skipped on apply)

- `20260808120000_billing_coverage_target_academic_year.sql`
- `20260808120000_bos_syllabus_ahs_model.sql`
- `20260808120000_fn_attendance_fresher_readiness.sql`
- `20260808120000_repair_learner_semester_via_ordinal.sql`

### `20250104` — 3 files (8-digit date, 2 skipped on apply)

- `20250104_fix_attendance_report_consistency.sql`
- `20250104_fix_attendance_timetable_mismatch.sql`
- `20250104_fix_attendance_timetable_mismatch_corrected.sql`

### `20250119` — 3 files (8-digit date, 2 skipped on apply)

- `20250119_add_learner_application_id_generation.sql`
- `20250119_fix_learner_application_id_generation.sql`
- `20250119_move_incomplete_active_to_pending.sql`

### `20250130` — 3 files (8-digit date, 2 skipped on apply)

- `20250130_add_missing_resource_fields.sql`
- `20250130_create_resource_storage_bucket.sql`
- `20250130_update_resources_table.sql`

### `20251210` — 3 files (8-digit date, 2 skipped on apply)

- `20251210_add_missing_fk_indexes.sql`
- `20251210_fix_security_and_performance_issues.sql`
- `20251210_optimize_rls_policies.sql`

### `20251229` — 3 files (8-digit date, 2 skipped on apply)

- `20251229_fix_student_learners_view_permission.sql`
- `20251229_student_attendance_only_permission.sql`
- `20251229_student_attendance_view.sql`

### `20260227` — 3 files (8-digit date, 2 skipped on apply)

- `20260227_add_assigned_store_id_to_profiles.sql`
- `20260227_add_company_name_batch_to_ims.sql`
- `20260227_add_missing_ims_items_columns.sql`

### `20260415` — 3 files (8-digit date, 2 skipped on apply)

- `20260415_add_admission_leads_twelfth_group.sql`
- `20260415_consolidate_billing_categories.sql`
- `20260415_fix_expo_lead_count_denormalized.sql`

### `20260422000001` — 3 files (14-digit, 2 skipped on apply)

- `20260422000001_grant_learner_read_to_billing_roles.sql`
- `20260422000001_patch_privilege_resolvers_for_yuva_separation.sql`
- `20260422000001_seed_hostel_leave_types_expansion.sql`

### `20260506` — 3 files (8-digit date, 2 skipped on apply)

- `20260506_create_bos_course_syllabi_table.sql`
- `20260506_create_bos_regulation_taxonomies_table.sql`
- `20260506_fix_hod_role_and_user_roles_backfill.sql`

### `20260511` — 3 files (8-digit date, 2 skipped on apply)

- `20260511_create_bos_programme_outcomes.sql`
- `20260511_rename_bos_syllabi_permissions_to_syllabus.sql`
- `20260511_staff_module_scope_lockdown.sql`

### `20260514` — 3 files (8-digit date, 2 skipped on apply)

- `20260514_bos_board_scope_rls.sql`
- `20260514_extend_ims_stores_schema.sql`
- `20260514_port_ims_schema_from_roja_ims.sql`

### `20260515` — 3 files (8-digit date, 2 skipped on apply)

- `20260515_bos_external_experts_add_startup_category.sql`
- `20260515_bos_members_add_startup_type.sql`
- `20260515_ensure_hod_compositions_perms.sql`

### `20260516` — 3 files (8-digit date, 2 skipped on apply)

- `20260516_bos_email_templates.sql`
- `20260516_bos_members_no_duplicates.sql`
- `20260516_normalize_bos_perm_key_format_drift.sql`

### `20260519120000` — 3 files (14-digit, 2 skipped on apply)

- `20260519120000_add_batch_tracking_columns_to_ims_stock_batches.sql`
- `20260519120000_hostel_incidents_add_resource_id.sql`
- `20260519120000_normalize_parent_occupations.sql`

### `20260520` — 3 files (8-digit date, 2 skipped on apply)

- `20260520_add_opening_quantity_to_ims_stock_summary.sql`
- `20260520_pde_bridge_audit.sql`
- `20260520_pde_demonstrations_course_linkage.sql`

### `20260601` — 3 files (8-digit date, 2 skipped on apply)

- `20260601_admission_bulk_upsert_fee_structure.sql`
- `20260601_hr_policy_substrate_extensions.sql`
- `20260601_remove_transport_hostel_fee_structure_items.sql`

### `20260609120000` — 3 files (14-digit, 2 skipped on apply)

- `20260609120000_add_academic_year_name_to_v_learner_hostelites.sql`
- `20260609120000_auto_allocate_fail_open_physical_rooms_institution_order.sql`
- `20260609120000_cdc_export_rpc_staff_gate.sql`

### `20260610100000` — 3 files (14-digit, 2 skipped on apply)

- `20260610100000_accommodation_types_global.sql`
- `20260610100000_batch_mess_categories.sql`
- `20260610100000_social_dept_accounts_registry.sql`

### `20260610160000` — 3 files (14-digit, 2 skipped on apply)

- `20260610160000_candidates_semester_name.sql`
- `20260610160000_ig_accounts_metrics_source.sql`
- `20260610160000_sync_lead_referral_to_learner_profile.sql`

### `20260611` — 3 files (8-digit date, 2 skipped on apply)

- `20260611_ai_pulse_live_attendance_and_champion.sql`
- `20260611_bos_member_types.sql`
- `20260611_hr_attendance_absorption.sql`

### `20260611200000` — 3 files (14-digit, 2 skipped on apply)

- `20260611200000_ai_pulse_rotation_queue.sql`
- `20260611200000_meeting_routing_log_native_link.sql`
- `20260611200000_mess_menu_shared_read_by_tier_gender.sql`

### `20260611230000` — 3 files (14-digit, 2 skipped on apply)

- `20260611230000_ai_pulse_pde_bridge_policies.sql`
- `20260611230000_choose_your_menu_p0_substrate.sql`
- `20260611230000_pde_bos_clo_connector.sql`

### `20260619` — 3 files (8-digit date, 2 skipped on apply)

- `20260619_fix_student_attendance_write_rls_staff_faculty.sql`
- `20260619_hr_training_sessions.sql`
- `20260619_pp_accounts_per_student.sql`

### `20260627` — 3 files (8-digit date, 2 skipped on apply)

- `20260627_bos_regulation_taxonomies_board_scope.sql`
- `20260627_bos_taxonomy_sop_superadmin_only.sql`
- `20260627_hr_job_applications.sql`

### `20260629120000` — 3 files (14-digit, 2 skipped on apply)

- `20260629120000_induction_session_venue_resource.sql`
- `20260629120000_induction_unbatched_learner_sees_all_sessions.sql`
- `20260629120000_person_availability_brain.sql`

### `20260630120000` — 3 files (14-digit, 2 skipped on apply)

- `20260630120000_merge_duplicate_staff_prabhakaran_m.sql`
- `20260630120000_scf_facilitator_feedback_coverage.sql`
- `20260630120000_schools_network_substrate.sql`

### `20260704090000` — 3 files (14-digit, 2 skipped on apply)

- `20260704090000_cdc_govt_jobs_readiness_content_and_columns.sql`
- `20260704090000_live_poll_engine_phase_a_foundation.sql`
- `20260704090000_schools_network_feeder_roster_and_level.sql`

### `20260706130000` — 3 files (14-digit, 2 skipped on apply)

- `20260706130000_induction_volunteer_mark_attendance.sql`
- `20260706130000_remove_recruitment_approvals_scope_policies.sql`
- `20260706130000_social_engagement_review_fixes.sql`

### `20260710070000` — 3 files (14-digit, 2 skipped on apply)

- `20260710070000_facilitator_coverage_institution_param.sql`
- `20260710070000_pde_bridge_weight_multiplier_and_backfill.sql`
- `20260710070000_rollup_iqac_meeting_and_audit_loops.sql`

### `20260715` — 3 files (8-digit date, 2 skipped on apply)

- `20260715_audit_gate4_adaptations.sql`
- `20260715_audit_standing_board.sql`
- `20260715_audit_standing_institution_audit.sql`

### `20260722130000` — 3 files (14-digit, 2 skipped on apply)

- `20260722130000_events_tournament_role_read_rls.sql`
- `20260722130000_hr_leave_types_request_category.sql`
- `20260722130000_rcltp_school_dashboard_rpc.sql`

### `20260722210000` — 3 files (14-digit, 2 skipped on apply)

- `20260722210000_ai_pulse_switchable_cycles.sql`
- `20260722210000_hr_lta_select_scope_and_coverage_parity.sql`
- `20260722210000_pde_assignable_sections_fn.sql`

### `20260723060000` — 3 files (14-digit, 2 skipped on apply)

- `20260723060000_ai_pulse_starter_control_cohort.sql`
- `20260723060000_pde_due_soon_reminders_fn.sql`
- `20260723060000_rcltp_remedial_plan_draft_loop.sql`

### `20260723090000` — 3 files (14-digit, 2 skipped on apply)

- `20260723090000_ai_pulse_prompt_graduation.sql`
- `20260723090000_mba_improvement_board.sql`
- `20260723090000_referral_import_enrich_and_promote.sql`

### `20260724120000` — 3 files (14-digit, 2 skipped on apply)

- `20260724120000_ai_pulse_leaderboard.sql`
- `20260724120000_bos_governing_body.sql`
- `20260724120000_fix_reset_allocation_batch_dependent_fks.sql`

### `20260726120000` — 3 files (14-digit, 2 skipped on apply)

- `20260726120000_ai_pulse_reach_weighted_publish.sql`
- `20260726120000_ai_pulse_staff_leaderboard.sql`
- `20260726120000_usage_beacon_kill_switch.sql`

### `20260727` — 3 files (8-digit date, 2 skipped on apply)

- `20260727_bos_syllabus_nursing_inc.sql`
- `20260727_programs_seed_freshers_trigger.sql`
- `20260727_seed_freshers_semester_and_section.sql`

### `20260727060000` — 3 files (14-digit, 2 skipped on apply)

- `20260727060000_close_external_participant_public_policies.sql`
- `20260727060000_credit_pairing_and_sync_stamp.sql`
- `20260727060000_exam_eligibility_manage_permission.sql`

### `20260728000000` — 3 files (14-digit, 2 skipped on apply)

- `20260728000000_hr_sto_default_limits_all_orgs.sql`
- `20260728000000_meeting_trigger_booking_link.sql`
- `20260728000000_mess_menu_loop_generator.sql`

### `20260730130000` — 3 files (14-digit, 2 skipped on apply)

- `20260730130000_fix_recruitment_comment_null_guard.sql`
- `20260730130000_ims_pos_anon_lockdown.sql`
- `20260730130000_induction_coordinator_retrofit_sessions.sql`

### `20260730140000` — 3 files (14-digit, 2 skipped on apply)

- `20260730140000_ims_expiry_controls.sql`
- `20260730140000_induction_coordinator_retrofit_event_batch1.sql`
- `20260730140000_restore_bds_dental_1year_ay2025_26_billing.sql`

### `20260730160000` — 3 files (14-digit, 2 skipped on apply)

- `20260730160000_fix_mv_learner_attendance_summary_key_and_grain.sql`
- `20260730160000_ims_gateway_payments.sql`
- `20260730160000_repair_cross_institution_learner_semester_academic_year.sql`

### `20260731040000` — 3 files (14-digit, 2 skipped on apply)

- `20260731040000_cohort_core_spine.sql`
- `20260731040000_curriculum_aware_class_poll_phase1.sql`
- `20260731040000_fp_item_flags.sql`

### `20260731090000` — 3 files (14-digit, 2 skipped on apply)

- `20260731090000_cdc_training_demote_to_cohort_core.sql`
- `20260731090000_hr_staff_without_payer_rpc.sql`
- `20260731090000_ims_gateway_payments_order_id.sql`

### `20260731100000` — 3 files (14-digit, 2 skipped on apply)

- `20260731100000_repair_learner_section_cross_institution.sql`
- `20260731100000_school_master_last_school.sql`
- `20260731100000_spm_hardening_audit.sql`

### `20260731160000` — 3 files (14-digit, 2 skipped on apply)

- `20260731160000_ims_items_write_requires_permission.sql`
- `20260731160000_mba_analyst_views_privacy_hardening.sql`
- `20260731160000_mba_data_gap_ranking.sql`

### `20260801100000` — 3 files (14-digit, 2 skipped on apply)

- `20260801100000_billing_receipts_bulk_create_permission.sql`
- `20260801100000_event_form_registration_fee.sql`
- `20260801100000_scf_session_resources.sql`

### `20260801120000` — 3 files (14-digit, 2 skipped on apply)

- `20260801120000_billing_insert_policies_institution_scope.sql`
- `20260801120000_curriculum_lesson_rpcs_taxonomy_params.sql`
- `20260801120000_event_form_fee_enabled_toggle.sql`

### `20260801140000` — 3 files (14-digit, 2 skipped on apply)

- `20260801140000_billing_schedule_bulk_create_permission.sql`
- `20260801140000_curriculum_readiness_missing_taxonomy.sql`
- `20260801140000_event_registration_uploads.sql`

### `20260803030000` — 3 files (14-digit, 2 skipped on apply)

- `20260803030000_ai_pulse_my_topics_wrapper.sql`
- `20260803030000_mba_data_gap_stalled.sql`
- `20260803030000_prompt_graduation_mechanism.sql`

### `20260804090000` — 3 files (14-digit, 2 skipped on apply)

- `20260804090000_hr_staff_payroll_directory_rpc.sql`
- `20260804090000_ims_store_items.sql`
- `20260804090000_payment_audit_logs.sql`

### `20260806120000` — 3 files (14-digit, 2 skipped on apply)

- `20260806120000_learners_profiles_add_tamil_names.sql`
- `20260806120000_mba_dept_artifacts.sql`
- `20260806120000_staff_biometric_identity.sql`

### `20260807120000` — 3 files (14-digit, 2 skipped on apply)

- `20260807120000_campus_living_upgrade_fee_discount.sql`
- `20260807120000_role_holder_edge_cases.sql`
- `20260807120000_voice_transcribe_openai_fallback.sql`

### `20260808220000` — 3 files (14-digit, 2 skipped on apply)

- `20260808220000_autolock_new_public_relations.sql`
- `20260808220000_cohort_programme_scoped_permission_keys.sql`
- `20260808220000_fp_facilitator_may_record_attempt.sql`

### `20260810120000` — 3 files (14-digit, 2 skipped on apply)

- `20260810120000_backfill_leadership_schedules_and_types.sql`
- `20260810120000_hr_academic_years.sql`
- `20260810120000_revoke_learner_side_hostel_vacate_requests.sql`

### `20260810140000` — 3 files (14-digit, 2 skipped on apply)

- `20260810140000_gemba_official_lapse_notice.sql`
- `20260810140000_generate_hr_leave_balances_bulk.sql`
- `20260810140000_hostel_eligibility_admission_year_fee_anchor.sql`

### `20260810150000` — 3 files (14-digit, 2 skipped on apply)

- `20260810150000_auto_allocate_hostel_type_scope.sql`
- `20260810150000_create_leadership_booking_pages.sql`
- `20260810150000_seed_non_teaching_recruitment_flows_all_orgs.sql`

### `20260827130000` — 3 files (14-digit, 2 skipped on apply)

- `20260827130000_billing_receipts_gateway_payment_ref_unique.sql`
- `20260827130000_housekeeping_premium_room_and_allocation_required.sql`
- `20260827130000_hr_on_duty_hourly_type_all_orgs.sql`

### `20260901010000` — 3 files (14-digit, 2 skipped on apply)

- `20260901010000_billing_bill_cancellations.sql`
- `20260901010000_induction_peer_mentor_year2_and_contact_search.sql`
- `20260901010000_programs_card_short_name.sql`

### `optimize` — 3 files (unversioned legacy token, 2 skipped on apply)

- `optimize_attendance_visiting_teacher_rls_perf.sql`
- `optimize_courses_select_rls_statement_timeout.sql`
- `optimize_staff_select_rls_dashboard_perf.sql`

### `pde` — 3 files (unversioned legacy token, 2 skipped on apply)

- `pde_answer_key_lock_base_table_rls.sql`
- `pde_answer_key_secdef_rpcs.sql`
- `pde_case_assignment.sql`

### `20250118` — 2 files (8-digit date, 1 skipped on apply)

- `20250118_migrate_to_learners_profiles.sql`
- `20250118_restore_tables_with_sync_triggers.sql`

### `20250120` — 2 files (8-digit date, 1 skipped on apply)

- `20250120_add_payment_gateway_tables.sql`
- `20250120_convert_learner_fields_to_uppercase.sql`

### `20250930000008` — 2 files (14-digit, 1 skipped on apply)

- `20250930000008_create_audit_trail_table.sql`
- `20250930000008_fix_booking_type_enum.sql`

### `20251007` — 2 files (8-digit date, 1 skipped on apply)

- `20251007_add_staff_profile_sync_trigger.sql`
- `20251007_fix_faculty_student_access_without_department.sql`

### `20260107` — 2 files (8-digit date, 1 skipped on apply)

- `20260107_fix_ai_query_system.sql`
- `20260107_fix_student_billing_access.sql`

### `20260203000001` — 2 files (14-digit, 1 skipped on apply)

- `20260203000001_create_saml_tables.sql`
- `20260203000001_solutions_hub_roles.sql`

### `20260218` — 2 files (8-digit date, 1 skipped on apply)

- `20260218_create_ims_stores_table.sql`
- `20260218_seed_default_ims_units.sql`

### `20260221` — 2 files (8-digit date, 1 skipped on apply)

- `20260221_add_store_id_to_ims_tables.sql`
- `20260221_create_ims_upi_qr_payments.sql`

### `20260228` — 2 files (8-digit date, 1 skipped on apply)

- `20260228_admission_leads_split_name.sql`
- `20260228_whatsapp_template_attachments.sql`

### `20260302` — 2 files (8-digit date, 1 skipped on apply)

- `20260302_fix_store_admin_base_permissions.sql`
- `20260302_seed_store_admin_test_user.sql`

### `20260304` — 2 files (8-digit date, 1 skipped on apply)

- `20260304_add_learner_finance_fields.sql`
- `20260304_fix_attendance_consolidation_rls.sql`

### `20260306` — 2 files (8-digit date, 1 skipped on apply)

- `20260306_create_bos_tables.sql`
- `20260306_mcp_user_bound_api_keys.sql`

### `20260313` — 2 files (8-digit date, 1 skipped on apply)

- `20260313_add_transport_fee_field.sql`
- `20260313_restructure_fee_structure_types.sql`

### `20260314` — 2 files (8-digit date, 1 skipped on apply)

- `20260314_expo_remove_institution_scope.sql`
- `20260314_learners_profiles_admission_role_policy.sql`

### `20260330000001` — 2 files (14-digit, 1 skipped on apply)

- `20260330000001_privilege_monthly_renewal.sql`
- `20260330000001_wp_pulse_entries.sql`

### `20260331` — 2 files (8-digit date, 1 skipped on apply)

- `20260331_add_wa_opt_in_to_admission_leads.sql`
- `20260331_expo_wa_message_queue.sql`

### `20260402` — 2 files (8-digit date, 1 skipped on apply)

- `20260402_vac_case_module.sql`
- `20260402_wa_personal_auto_trigger.sql`

### `20260404` — 2 files (8-digit date, 1 skipped on apply)

- `20260404_add_user_page_favorites.sql`
- `20260404_fix_admission_leads_duplicate_rls_policies.sql`

### `20260417000001` — 2 files (14-digit, 1 skipped on apply)

- `20260417000001_compliance_unification_substrate.sql`
- `20260417000001_events_phase_1a_extend_events_and_categories.sql`

### `20260417000002` — 2 files (14-digit, 1 skipped on apply)

- `20260417000002_anti_ragging_evidence_fanout.sql`
- `20260417000002_events_phase_1a_alter_resource_reservations.sql`

### `20260417000003` — 2 files (14-digit, 1 skipped on apply)

- `20260417000003_compliance_unification_catalog_expansion.sql`
- `20260417000003_events_phase_1a_new_tables.sql`

### `20260417000004` — 2 files (14-digit, 1 skipped on apply)

- `20260417000004_events_phase_1a_triggers.sql`
- `20260417000004_fix_consultant_delete_policies_for_admission_staff.sql`

### `20260420000001` — 2 files (14-digit, 1 skipped on apply)

- `20260420000001_morning_brief_add_role.sql`
- `20260420000001_nif_coordinator_role_and_audit.sql`

### `20260421000001` — 2 files (14-digit, 1 skipped on apply)

- `20260421000001_grant_hod_academic_leave_onduty_manage.sql`
- `20260421000001_persona_design_pr2_ten_roles.sql`

### `20260421000002` — 2 files (14-digit, 1 skipped on apply)

- `20260421000002_fix_leave_onduty_flows_rls_own_institution_scoping.sql`
- `20260421000002_persona_design_pr4_rls_retrofit.sql`

### `20260421000003` — 2 files (14-digit, 1 skipped on apply)

- `20260421000003_fix_sh_clients_rls_director_access.sql`
- `20260421000003_grant_hod_service_requests_full_access.sql`

### `20260421000004` — 2 files (14-digit, 1 skipped on apply)

- `20260421000004_hostel_blocks_multi_college.sql`
- `20260421000004_scope_service_requests_rls_to_own_institution.sql`

### `20260421000005` — 2 files (14-digit, 1 skipped on apply)

- `20260421000005_fix_sh_clients_rls_leadership_access.sql`
- `20260421000005_hostel_leave_types_crudable.sql`

### `20260422000002` — 2 files (14-digit, 1 skipped on apply)

- `20260422000002_service_request_multi_approver_support.sql`
- `20260422000002_wipe_billing_test_data.sql`

### `20260422000003` — 2 files (14-digit, 1 skipped on apply)

- `20260422000003_fix_sync_staff_trigger_auth_access.sql`
- `20260422000003_restore_3tier_billing_categories.sql`

### `20260422000004` — 2 files (14-digit, 1 skipped on apply)

- `20260422000004_clear_account_fees_revert_to_enquiry.sql`
- `20260422000004_mirror_staff_role_to_user_roles_rpc.sql`

### `20260430` — 2 files (8-digit date, 1 skipped on apply)

- `20260430_assign_counselor_role_accept_role_key.sql`
- `20260430_counselor_taxonomy_phase3_rename_and_expo.sql`

### `20260502000005` — 2 files (14-digit, 1 skipped on apply)

- `20260502000005_create_jicate_booking_meeting_types.sql`
- `20260502000005_get_seat_analytics_year_param_drop_or_fallback.sql`

### `20260502000006` — 2 files (14-digit, 1 skipped on apply)

- `20260502000006_create_jicate_booking_mirror.sql`
- `20260502000006_get_seat_analytics_include_account_status.sql`

### `20260503180000` — 2 files (14-digit, 1 skipped on apply)

- `20260503180000_dedup_education_fair_bulk_import.sql`
- `20260503180000_telephony_pipeline_errors.sql`

### `20260504` — 2 files (8-digit date, 1 skipped on apply)

- `20260504_ai_pulse_rls_hardening.sql`
- `20260504_instasolver_substrate.sql`

### `20260507` — 2 files (8-digit date, 1 skipped on apply)

- `20260507_ai_pulse_a1_2_virtual_venue_fix.sql`
- `20260507_ai_pulse_director_digest_extension.sql`

### `20260508` — 2 files (8-digit date, 1 skipped on apply)

- `20260508_bug_widen_attachment_mime_types.sql`
- `20260508_create_bos_taxonomy_master.sql`

### `20260509120000` — 2 files (14-digit, 1 skipped on apply)

- `20260509120000_admission_sources_master_cleanup_and_extensions.sql`
- `20260509120000_voice_memo_pipeline.sql`

### `20260511000001` — 2 files (14-digit, 1 skipped on apply)

- `20260511000001_lead_active_stage_policy_substrate.sql`
- `20260511000001_staff_scope_align_with_design.sql`

### `20260511000002` — 2 files (14-digit, 1 skipped on apply)

- `20260511000002_consume_lead_active_stage_policy.sql`
- `20260511000002_hr_admin_super_admin_staff_perms.sql`

### `20260512000001` — 2 files (14-digit, 1 skipped on apply)

- `20260512000001_ai_model_config_substrate.sql`
- `20260512000001_bos_meetings_add_hybrid_type.sql`

### `20260513` — 2 files (8-digit date, 1 skipped on apply)

- `20260513_grant_administrator_full_staff_access.sql`
- `20260513_grant_learner_onboarding_permissions.sql`

### `20260513120000` — 2 files (14-digit, 1 skipped on apply)

- `20260513120000_campaigns_migrate_rls_and_rpcs_to_marketing_namespace.sql`
- `20260513120000_voice_memo_monitor_policies.sql`

### `20260513140000` — 2 files (14-digit, 1 skipped on apply)

- `20260513140000_admission_forms_namespace_and_role_seeds.sql`
- `20260513140000_admission_leads_visibility_lockdown.sql`

### `20260513160000` — 2 files (14-digit, 1 skipped on apply)

- `20260513160000_fix_reassign_source_leads_drop_assigned_by.sql`
- `20260513160000_form_builder_full_access_extend_submissions_and_abandon_log.sql`

### `20260513170000` — 2 files (14-digit, 1 skipped on apply)

- `20260513170000_fix_bulk_routing_ambiguity_and_assigned_by.sql`
- `20260513170000_lead_source_add_youtube_ads_enum.sql`

### `20260513180000` — 2 files (14-digit, 1 skipped on apply)

- `20260513180000_bulk_routing_variable_conflict_directive.sql`
- `20260513180000_campaigns_global_create_for_all_institution_roles.sql`

### `20260514120000` — 2 files (14-digit, 1 skipped on apply)

- `20260514120000_fix_fn_principal_metrics_enum_and_pending_approvals_count.sql`
- `20260514120000_team_activity_rpcs.sql`

### `20260516120000` — 2 files (14-digit, 1 skipped on apply)

- `20260516120000_seed_recruitment_role_enforcement_policies.sql`
- `20260516120000_team_activity_rpcs_fix_permission_gate.sql`

### `20260516130000` — 2 files (14-digit, 1 skipped on apply)

- `20260516130000_create_fee_backfill_status_view.sql`
- `20260516130000_fn_backfill_empty_recruitment_chains.sql`

### `20260519000000` — 2 files (14-digit, 1 skipped on apply)

- `20260519000000_pde_coordinator_onboarding_log.sql`
- `20260519000000_t4_3_pr3_fix_rls_recursion.sql`

### `20260519140000` — 2 files (14-digit, 1 skipped on apply)

- `20260519140000_hostel_premium_invites_and_reserve_rpcs.sql`
- `20260519140000_normalize_community_caste.sql`

### `20260520000000` — 2 files (14-digit, 1 skipped on apply)

- `20260520000000_bos_meetings_minutes_content.sql`
- `20260520000000_hostel_community_posts.sql`

### `20260520140000` — 2 files (14-digit, 1 skipped on apply)

- `20260520140000_admission_dashboard_lifecycle_counts.sql`
- `20260520140000_hr_approval_flows_hr_admin_rls.sql`

### `20260520150000` — 2 files (14-digit, 1 skipped on apply)

- `20260520150000_account_transition_allow_enquiry_statuses.sql`
- `20260520150000_grant_admission_documents_manage_to_admission_officer.sql`

### `20260525100000` — 2 files (14-digit, 1 skipped on apply)

- `20260525100000_fix_fee_dimension_change_trigger_three_bugs.sql`
- `20260525100000_hr_recruitment_need_signal_rpc.sql`

### `20260529` — 2 files (8-digit date, 1 skipped on apply)

- `20260529_add_degree_semester_names_to_v_learner_hostelites.sql`
- `20260529_extend_v_learner_hostelites_cascade.sql`

### `20260529000004` — 2 files (14-digit, 1 skipped on apply)

- `20260529000004_learners_profiles_add_hostel_mess_category_fk.sql`
- `20260529000004_mess_categories_unique_name_type.sql`

### `20260602` — 2 files (8-digit date, 1 skipped on apply)

- `20260602_hr_institution_substrate_seeds.sql`
- `20260602_internship_rls_canonicalize.sql`

### `20260602000001` — 2 files (14-digit, 1 skipped on apply)

- `20260602000001_fix_resource_reservations_approver_visibility.sql`
- `20260602000001_ss_foundations_substrate.sql`

### `20260602000002` — 2 files (14-digit, 1 skipped on apply)

- `20260602000002_fix_rls_recursion_approver_select_policy.sql`
- `20260602000002_ssf_write_policies.sql`

### `20260602100000` — 2 files (14-digit, 1 skipped on apply)

- `20260602100000_billing_analytics_institution_pending_students.sql`
- `20260602100000_service_field_type_add_tms_values.sql`

### `20260602190000` — 2 files (14-digit, 1 skipped on apply)

- `20260602190000_accommodation_fk_ai_rpcs_and_fee_backfill_view.sql`
- `20260602190000_admission_historical_pivot.sql`

### `20260607120000` — 2 files (14-digit, 1 skipped on apply)

- `20260607120000_auto_allocate_rules_driven_cohort.sql`
- `20260607120000_bed_economics_substrate.sql`

### `20260608` — 2 files (8-digit date, 1 skipped on apply)

- `20260608_add_school_principal_and_school_facilitator_roles.sql`
- `20260608_hr_governance_part1_seeds.sql`

### `20260608120000` — 2 files (14-digit, 1 skipped on apply)

- `20260608120000_auto_allocate_candidates_and_bill_gate.sql`
- `20260608120000_fix_learner_cross_institution_degree_id.sql`

### `20260609130000` — 2 files (14-digit, 1 skipped on apply)

- `20260609130000_auto_allocate_candidates_name_fallback.sql`
- `20260609130000_campus_living_get_hostelite_bills.sql`

### `20260609150000` — 2 files (14-digit, 1 skipped on apply)

- `20260609150000_fee_structure_readd_accommodation_dimension.sql`
- `20260609150000_staff_institution_email_nullable.sql`

### `20260610130000` — 2 files (14-digit, 1 skipped on apply)

- `20260610130000_bulk_upsert_fee_structure_accommodation.sql`
- `20260610130000_pin_reserved_cohorts.sql`

### `20260610190000` — 2 files (14-digit, 1 skipped on apply)

- `20260610190000_alloc_sync_room_category.sql`
- `20260610190000_housekeeping_slot_booking.sql`

### `20260611170000` — 2 files (14-digit, 1 skipped on apply)

- `20260611170000_housekeeping_rls_catalog_keys.sql`
- `20260611170000_meeting_routing_substrate.sql`

### `20260611190000` — 2 files (14-digit, 1 skipped on apply)

- `20260611190000_native_scheduling_engine.sql`
- `20260611190000_reset_learner_hostel_categories_allocation_sync.sql`

### `20260612090000` — 2 files (14-digit, 1 skipped on apply)

- `20260612090000_mess_categories_menu_tier_key.sql`
- `20260612090000_universal_booking_substrate.sql`

### `20260612130000` — 2 files (14-digit, 1 skipped on apply)

- `20260612130000_hostel_fee_category_gender_default_and_billing_trigger.sql`
- `20260612130000_upgrade_dedicated_billing_categories.sql`

### `20260612180000` — 2 files (14-digit, 1 skipped on apply)

- `20260612180000_care_audit_framework.sql`
- `20260612180000_hostel_program_eligibility_hostel_type_both.sql`

### `20260612190000` — 2 files (14-digit, 1 skipped on apply)

- `20260612190000_pde_validation_sla_policy.sql`
- `20260612190000_reset_test_allocations.sql`

### `20260613` — 2 files (8-digit date, 1 skipped on apply)

- `20260613_coe_course_sync_bridge.sql`
- `20260613_hr_forms_substrate.sql`

### `20260615120000` — 2 files (14-digit, 1 skipped on apply)

- `20260615120000_health_wellness_programs_substrate.sql`
- `20260615120000_hostel_program_eligibility_multi_quota.sql`

### `20260615130000` — 2 files (14-digit, 1 skipped on apply)

- `20260615130000_health_program_impact_v2.sql`
- `20260615130000_hostel_eligibility_both_gender_translation.sql`

### `20260615140000` — 2 files (14-digit, 1 skipped on apply)

- `20260615140000_campus_living_upgrade_options_include_auto_categories.sql`
- `20260615140000_health_program_section_leaderboard.sql`

### `20260615170000` — 2 files (14-digit, 1 skipped on apply)

- `20260615170000_campus_living_auto_allocate_candidates_strict.sql`
- `20260615170000_pde_faculty_review_rpcs.sql`

### `20260616000000` — 2 files (14-digit, 1 skipped on apply)

- `20260616000000_campus_living_premium_ac_room_move_inventory.sql`
- `20260616000000_lock_privilege_resolver_views_and_fns_from_anon.sql`

### `20260616090000` — 2 files (14-digit, 1 skipped on apply)

- `20260616090000_gate_upgrade_actions_on_upgrades_enabled.sql`
- `20260616090000_pcf_escalation_lift.sql`

### `20260616120000` — 2 files (14-digit, 1 skipped on apply)

- `20260616120000_ai_pulse_interventions.sql`
- `20260616120000_health_program_form_responses.sql`

### `20260616160000` — 2 files (14-digit, 1 skipped on apply)

- `20260616160000_hostel_waitlist_from_category_anchor.sql`
- `20260616160000_tms_fee_bill_safe_delete_cleanup_linked_billing.sql`

### `20260617` — 2 files (8-digit date, 1 skipped on apply)

- `20260617_hr_performance_review_cycles.sql`
- `20260617_migrate_pre_registered_user_roles_on_conflict.sql`

### `20260617100000` — 2 files (14-digit, 1 skipped on apply)

- `20260617100000_admin_category_upgrade_rpcs.sql`
- `20260617100000_session_feedback_faculty_completion.sql`

### `20260618150000` — 2 files (14-digit, 1 skipped on apply)

- `20260618150000_billing_daily_activity_rpc.sql`
- `20260618150000_bos_add_counselling_code.sql`

### `20260619100000` — 2 files (14-digit, 1 skipped on apply)

- `20260619100000_backfill_missing_hostel_beds.sql`
- `20260619100000_meet_booking_engine.sql`

### `20260619150000` — 2 files (14-digit, 1 skipped on apply)

- `20260619150000_auto_allocate_cohort_institution_program_semester_filters.sql`
- `20260619150000_fix_reservation_approval_sequential_level_drift.sql`

### `20260619160000` — 2 files (14-digit, 1 skipped on apply)

- `20260619160000_transfer_enquiry_remap_admission_year.sql`
- `20260619160000_transport_collectables_bill_descriptions.sql`

### `20260623120000` — 2 files (14-digit, 1 skipped on apply)

- `20260623120000_calendar_events_meetings_sources.sql`
- `20260623120000_reservations_institution_scope_select_policy.sql`

### `20260623190000` — 2 files (14-digit, 1 skipped on apply)

- `20260623190000_reservation_slot_lock_pending_aware.sql`
- `20260623190000_scf_admin_dashboard_rpcs.sql`

### `20260625` — 2 files (8-digit date, 1 skipped on apply)

- `20260625_bos_syllabus_assessment_structure.sql`
- `20260625_dashboard_role_widget_config.sql`

### `20260625120000` — 2 files (14-digit, 1 skipped on apply)

- `20260625120000_hr_recruitment_jobs_autofill_org.sql`
- `20260625120000_scf_self_improving_loop.sql`

### `20260627000000` — 2 files (14-digit, 1 skipped on apply)

- `20260627000000_backfill_vacated_allocation_check_out_date.sql`
- `20260627000000_seed_hr_onboarding_checklists_per_role_category.sql`

### `20260628000000` — 2 files (14-digit, 1 skipped on apply)

- `20260628000000_fn_hostel_unallocated_candidates.sql`
- `20260628000000_t4_3_payroll_periods_approvals_payslips.sql`

### `20260629140000` — 2 files (14-digit, 1 skipped on apply)

- `20260629140000_induction_my_session_feedback.sql`
- `20260629140000_induction_resource_person_search_rpcs.sql`

### `20260630000000` — 2 files (14-digit, 1 skipped on apply)

- `20260630000000_hostel_curfew_policies.sql`
- `20260630000000_mess_menu_pr1_schema_extensions.sql`

### `20260630210000` — 2 files (14-digit, 1 skipped on apply)

- `20260630210000_induction_session_polls_tables.sql`
- `20260630210000_scf_learner_notes.sql`

### `20260630220000` — 2 files (14-digit, 1 skipped on apply)

- `20260630220000_induction_program_target_columns.sql`
- `20260630220000_induction_session_catalog.sql`

### `20260703130000` — 2 files (14-digit, 1 skipped on apply)

- `20260703130000_hr_job_applications_promotion_bridge.sql`
- `20260703130000_schools_network_feeder_momentum.sql`

### `20260703170000` — 2 files (14-digit, 1 skipped on apply)

- `20260703170000_schools_network_feeder_name_canon.sql`
- `20260703170000_voice_memo_transient_failures.sql`

### `20260704110000` — 2 files (14-digit, 1 skipped on apply)

- `20260704110000_ai_batch_jobs_reserve_hardening.sql`
- `20260704110000_live_poll_engine_phase_b_class_session.sql`

### `20260705000000` — 2 files (14-digit, 1 skipped on apply)

- `20260705000000_billing_apportionment_substrate.sql`
- `20260705000000_meta_subscription_audit_table.sql`

### `20260705130000` — 2 files (14-digit, 1 skipped on apply)

- `20260705130000_scf_outage_days.sql`
- `20260705130000_schools_network_visit_worklist.sql`

### `20260705140000` — 2 files (14-digit, 1 skipped on apply)

- `20260705140000_carre_coverage.sql`
- `20260705140000_schools_network_feeder_split.sql`

### `20260706` — 2 files (8-digit date, 1 skipped on apply)

- `20260706_bos_committees_per_composition.sql`
- `20260706_cross_institution_teaching.sql`

### `20260706090000` — 2 files (14-digit, 1 skipped on apply)

- `20260706090000_induction_poll_export_add_college_email.sql`
- `20260706090000_schools_network_facilitators_as_coordinators.sql`

### `20260709030000` — 2 files (14-digit, 1 skipped on apply)

- `20260709030000_induction_referral_anti_self_guard.sql`
- `20260709030000_naac_catalog_binary_framework_sync.sql`

### `20260710130000` — 2 files (14-digit, 1 skipped on apply)

- `20260710130000_bos_ta_da_rates.sql`
- `20260710130000_induction_monthly_mentor_checkins.sql`

### `20260710150000` — 2 files (14-digit, 1 skipped on apply)

- `20260710150000_bos_member_type_catalog_names.sql`
- `20260710150000_fix_induction_mentor_captured_count.sql`

### `20260710160000` — 2 files (14-digit, 1 skipped on apply)

- `20260710160000_induction_mentor_helpfulness_feedback.sql`
- `20260710160000_scf_three_zone_retry_fairness.sql`

### `20260711100000` — 2 files (14-digit, 1 skipped on apply)

- `20260711100000_ai_cap_enforcement_fn.sql`
- `20260711100000_refund_workflow_schema.sql`

### `20260712070000` — 2 files (14-digit, 1 skipped on apply)

- `20260712070000_create_sh_solution_repos.sql`
- `20260712070000_reference_external_api.sql`

### `20260713140000` — 2 files (14-digit, 1 skipped on apply)

- `20260713140000_loop_zero_rupee_foundation.sql`
- `20260713140000_sf100_participant_write_rls.sql`

### `20260713150000` — 2 files (14-digit, 1 skipped on apply)

- `20260713150000_activate_sf100_privilege_source.sql`
- `20260713150000_loop_zero_rupee_scf_generate.sql`

### `20260714120000` — 2 files (14-digit, 1 skipped on apply)

- `20260714120000_event_registration_form_builder.sql`
- `20260714120000_refund_flow_config_save_swap_rpc.sql`

### `20260714160000` — 2 files (14-digit, 1 skipped on apply)

- `20260714160000_hostel_attendance_block_scoped_rls.sql`
- `20260714160000_lc_executive_gates_and_cross_institution.sql`

### `20260715070000` — 2 files (14-digit, 1 skipped on apply)

- `20260715070000_sf100_investor_notes_meeting_requests.sql`
- `20260715070000_verified_skills_record.sql`

### `20260716` — 2 files (8-digit date, 1 skipped on apply)

- `20260716_fn_update_recruitment_step_comment.sql`
- `20260716_hr_head_full_access_and_approval_override.sql`

### `20260716000000` — 2 files (14-digit, 1 skipped on apply)

- `20260716000000_meeting_bookings_venue_reservation_pr2.sql`
- `20260716000000_meeting_trigger_attendance_pr1a.sql`

### `20260717000000` — 2 files (14-digit, 1 skipped on apply)

- `20260717000000_meeting_trigger_explanation_pr1b.sql`
- `20260717000000_meeting_venue_sync_trigger_pr3.sql`

### `20260721000000` — 2 files (14-digit, 1 skipped on apply)

- `20260721000000_events_promote_pr1_sponsors.sql`
- `20260721000000_meeting_trigger_missing_data_pr3.sql`

### `20260721120000` — 2 files (14-digit, 1 skipped on apply)

- `20260721120000_fn_attendance_dashboard_section_stats.sql`
- `20260721120000_hr_leave_types_split.sql`

### `20260722000000` — 2 files (14-digit, 1 skipped on apply)

- `20260722000000_events_promote_pr2_budget.sql`
- `20260722000000_meeting_trigger_gap_refinements.sql`

### `20260722090000` — 2 files (14-digit, 1 skipped on apply)

- `20260722090000_bridge_sh_notifications_to_main_pipeline.sql`
- `20260722090000_referral_import_2025_26.sql`

### `20260722100000` — 2 files (14-digit, 1 skipped on apply)

- `20260722100000_ai_pulse_domain_starter_read_gate_and_ambiguity_fix.sql`
- `20260722100000_hr_leave_balance_analytics_rpc.sql`

### `20260722120000` — 2 files (14-digit, 1 skipped on apply)

- `20260722120000_fix_hr_leave_types_select_transitive_rls.sql`
- `20260722120000_referral_rate_config_and_generator.sql`

### `20260722150000` — 2 files (14-digit, 1 skipped on apply)

- `20260722150000_hr_comp_off_credits_ledger.sql`
- `20260722150000_referral_payout_batch_engine.sql`

### `20260722160000` — 2 files (14-digit, 1 skipped on apply)

- `20260722160000_att_reconcile_v2_multisignal_engine.sql`
- `20260722160000_hr_comp_off_balance_and_consumption.sql`

### `20260722200000` — 2 files (14-digit, 1 skipped on apply)

- `20260722200000_generate_hr_leave_balances_respect_assignments.sql`
- `20260722200000_hod_metrics_add_overdue_ages.sql`

### `20260723000000` — 2 files (14-digit, 1 skipped on apply)

- `20260723000000_events_promote_pr3_committees_tasks.sql`
- `20260723000000_hostel_room_condition_photos.sql`

### `20260723120000` — 2 files (14-digit, 1 skipped on apply)

- `20260723120000_attendance_dashboard_section_stats_hierarchy_filters.sql`
- `20260723120000_drop_bos_experts_category_check.sql`

### `20260723150000` — 2 files (14-digit, 1 skipped on apply)

- `20260723150000_ceo_rounds_log.sql`
- `20260723150000_rcltp_question_review_fixes.sql`

### `20260724000000` — 2 files (14-digit, 1 skipped on apply)

- `20260724000000_batch_room_category_breakdown_add_floors.sql`
- `20260724000000_events_promote_pr4_volunteers_incidents.sql`

### `20260724090000` — 2 files (14-digit, 1 skipped on apply)

- `20260724090000_accountant_report_rpcs.sql`
- `20260724090000_compliance_tracker.sql`

### `20260725080000` — 2 files (14-digit, 1 skipped on apply)

- `20260725080000_rcltp_batch_approve_and_spotcheck.sql`
- `20260725080000_register_bug_fixer_jobs_for_model_governance.sql`

### `20260725100000` — 2 files (14-digit, 1 skipped on apply)

- `20260725100000_hr_recruitment_package_salary_optional.sql`
- `20260725100000_mba_faculty_role.sql`

### `20260725123000` — 2 files (14-digit, 1 skipped on apply)

- `20260725123000_carre_calibration_mirror.sql`
- `20260725123000_carre_recognition_pipe_wiring.sql`

### `20260726110000` — 2 files (14-digit, 1 skipped on apply)

- `20260726110000_ai_pulse_graduation_usage_quality_floor.sql`
- `20260726110000_events_naac_evidence_emitter.sql`

### `20260726130000` — 2 files (14-digit, 1 skipped on apply)

- `20260726130000_backfill_learner_academic_year_blank_only.sql`
- `20260726130000_hr_evidence_snapshots.sql`

### `20260726180000` — 2 files (14-digit, 1 skipped on apply)

- `20260726180000_mba_typea_analyst_views.sql`
- `20260726180000_revoke_anon_on_unprotected_backup_tables.sql`

### `20260726181500` — 2 files (14-digit, 1 skipped on apply)

- `20260726181500_accreditation_committee_ai_assistant.sql`
- `20260726181500_stakeholder_course_feedback_surveys.sql`

### `20260726190000` — 2 files (14-digit, 1 skipped on apply)

- `20260726190000_backfill_subdivided_toplevel_roster.sql`
- `20260726190000_fn_ai_queue_health.sql`

### `20260726193000` — 2 files (14-digit, 1 skipped on apply)

- `20260726193000_accreditation_narrative_autorefresh_reopen.sql`
- `20260726193000_exam_eligibility_thresholds_policy.sql`

### `20260726210000` — 2 files (14-digit, 1 skipped on apply)

- `20260726210000_fix_null_unsafe_secdef_guards.sql`
- `20260726210000_revoke_anon_on_four_new_public_tables.sql`

### `20260727010000` — 2 files (14-digit, 1 skipped on apply)

- `20260727010000_ai_job_run_on_mac_lane.sql`
- `20260727010000_teaching_enterprise_cohorts.sql`

### `20260727120000` — 2 files (14-digit, 1 skipped on apply)

- `20260727120000_ai_pulse_staff_facilitation_signal.sql`
- `20260727120000_billing_category_once_per_learner.sql`

### `20260730013000` — 2 files (14-digit, 1 skipped on apply)

- `20260730013000_accreditation_narrative_capout_notice.sql`
- `20260730013000_clarification_asks_attribution_hardening.sql`

### `20260730100000` — 2 files (14-digit, 1 skipped on apply)

- `20260730100000_hr_additional_roles_never_block_a_staff_delete.sql`
- `20260730100000_induction_day_attendance.sql`

### `20260730110000` — 2 files (14-digit, 1 skipped on apply)

- `20260730110000_cac_measured_metrics_rpc.sql`
- `20260730110000_induction_day_program_feedback.sql`

### `20260730180000` — 2 files (14-digit, 1 skipped on apply)

- `20260730180000_delete_bds1y_bills_except_transport.sql`
- `20260730180000_secdef_caller_identity_guards_notifications_ai.sql`

### `20260731080000` — 2 files (14-digit, 1 skipped on apply)

- `20260731080000_curriculum_ai_lesson_spine_phase2.sql`
- `20260731080000_foundations_demote_to_cohort_core.sql`

### `20260731103000` — 2 files (14-digit, 1 skipped on apply)

- `20260731103000_ims_gateway_finalize_sale.sql`
- `20260731103000_postal_codes_master.sql`

### `20260731130000` — 2 files (14-digit, 1 skipped on apply)

- `20260731130000_ims_item_change_requests.sql`
- `20260731130000_model_switch_autocompare_substrate.sql`

### `20260731150000` — 2 files (14-digit, 1 skipped on apply)

- `20260731150000_event_multi_registration_forms.sql`
- `20260731150000_mba_data_gaps.sql`

### `20260731170000` — 2 files (14-digit, 1 skipped on apply)

- `20260731170000_mba_data_gap_parked_status.sql`
- `20260731170000_repair_learner_semester_cross_institution_via_section.sql`

### `20260731180000` — 2 files (14-digit, 1 skipped on apply)

- `20260731180000_ai_pulse_starter_events_select_policy.sql`
- `20260731180000_platform_policies_cohort_scope.sql`

### `20260731210000` — 2 files (14-digit, 1 skipped on apply)

- `20260731210000_classroom_practice_reveal_cadence_and_sealed_comments.sql`
- `20260731210000_lock_repair_backups_and_hod_leaderboard.sql`

### `20260801001000` — 2 files (14-digit, 1 skipped on apply)

- `20260801001000_procurement_store_admin_role_split.sql`
- `20260801001000_tournament_incharge_access.sql`

### `20260801001100` — 2 files (14-digit, 1 skipped on apply)

- `20260801001100_procurement_grn_awaiting_invoice_status.sql`
- `20260801001100_tournament_incharge_privilege_guard.sql`

### `20260801001200` — 2 files (14-digit, 1 skipped on apply)

- `20260801001200_event_volunteers_member_link.sql`
- `20260801001200_procurement_rfq_review.sql`

### `20260801001300` — 2 files (14-digit, 1 skipped on apply)

- `20260801001300_procurement_grn_missing_quantity.sql`
- `20260801001300_tournament_role_access_helpers.sql`

### `20260801001400` — 2 files (14-digit, 1 skipped on apply)

- `20260801001400_procurement_perf_indexes.sql`
- `20260801001400_tournament_student_browse_and_grant_narrowing.sql`

### `20260801001500` — 2 files (14-digit, 1 skipped on apply)

- `20260801001500_capgap_routine_schedule.sql`
- `20260801001500_procurement_po_formats.sql`

### `20260801001600` — 2 files (14-digit, 1 skipped on apply)

- `20260801001600_procurement_quotation_not_quoted_and_specs.sql`
- `20260801001600_procurement_rls_role_has_institution_access.sql`

### `20260801002100` — 2 files (14-digit, 1 skipped on apply)

- `20260801002100_hr_employees_view_align_with_staff_view.sql`
- `20260801002100_ims_department_consumption_attribution.sql`

### `20260801002200` — 2 files (14-digit, 1 skipped on apply)

- `20260801002200_fix_leave_onduty_cross_tenant_read_leak.sql`
- `20260801002200_ims_warehouse_per_institution.sql`

### `20260801002300` — 2 files (14-digit, 1 skipped on apply)

- `20260801002300_backfill_stuck_leave_onduty_approvals.sql`
- `20260801002300_ims_transfer_stock_engine.sql`

### `20260801002400` — 2 files (14-digit, 1 skipped on apply)

- `20260801002400_fn_my_hr_context.sql`
- `20260801002400_ims_intra_institution_scope.sql`

### `20260801002500` — 2 files (14-digit, 1 skipped on apply)

- `20260801002500_fix_event_member_ids_learner_row_id_to_auth_uid.sql`
- `20260801002500_ims_push_transfer.sql`

### `20260801002600` — 2 files (14-digit, 1 skipped on apply)

- `20260801002600_hr_leave_rls_permission_retrofit.sql`
- `20260801002600_ims_items_distributable_by_default.sql`

### `20260801002700` — 2 files (14-digit, 1 skipped on apply)

- `20260801002700_grant_employee_self_service_keys.sql`
- `20260801002700_ims_indent_number_global_counter.sql`

### `20260801002800` — 2 files (14-digit, 1 skipped on apply)

- `20260801002800_ims_transfer_engine_auth_hardening.sql`
- `20260801002800_seed_leave_approval_flows.sql`

### `20260801002900` — 2 files (14-digit, 1 skipped on apply)

- `20260801002900_hr_approval_flows_leave_read.sql`
- `20260801002900_ims_receipt_batch_remainder.sql`

### `20260801110000` — 2 files (14-digit, 1 skipped on apply)

- `20260801110000_billing_receipts_add_combined_payment_mode.sql`
- `20260801110000_curriculum_lesson_taxonomy_columns.sql`

### `20260801130000` — 2 files (14-digit, 1 skipped on apply)

- `20260801130000_coe_role_bos_courses_scheme_grants.sql`
- `20260801130000_curriculum_lesson_drafts_rpc_taxonomy.sql`

### `20260801160000` — 2 files (14-digit, 1 skipped on apply)

- `20260801160000_event_form_image_display_field.sql`
- `20260801160000_maxlane_regen_zero_lane_schedule.sql`

### `20260803020000` — 2 files (14-digit, 1 skipped on apply)

- `20260803020000_fn_ai_claim_honor_max_inflight.sql`
- `20260803020000_mba_data_gap_measurement.sql`

### `20260803040000` — 2 files (14-digit, 1 skipped on apply)

- `20260803040000_ai_pulse_prompt_report_autohide.sql`
- `20260803040000_mba_gap_area_hit_rate_managers_only.sql`

### `20260803050000` — 2 files (14-digit, 1 skipped on apply)

- `20260803050000_ai_pulse_submit_resolves_topic_fallback.sql`
- `20260803050000_data_gap_loop_routine_schedules.sql`

### `20260804060000` — 2 files (14-digit, 1 skipped on apply)

- `20260804060000_mba_data_gap_v2_foundations.sql`
- `20260804060000_prompt_edit_creates_challenger.sql`

### `20260804100000` — 2 files (14-digit, 1 skipped on apply)

- `20260804100000_attendance_dashboard_first_year_filter.sql`
- `20260804100000_calendar_meeting_bookings_source.sql`

### `20260804120000` — 2 files (14-digit, 1 skipped on apply)

- `20260804120000_ai_pulse_champion_review_queue.sql`
- `20260804120000_ims_item_code_autogen.sql`

### `20260804140000` — 2 files (14-digit, 1 skipped on apply)

- `20260804140000_ai_pulse_library_hide_deduped.sql`
- `20260804140000_ims_item_delete_and_duplicate_guard.sql`

### `20260805130000` — 2 files (14-digit, 1 skipped on apply)

- `20260805130000_ai_pulse_hide_admins_from_staff_board.sql`
- `20260805130000_calendar_coe_calendar_permission.sql`

### `20260806` — 2 files (8-digit date, 1 skipped on apply)

- `20260806_events_creator_owned_edit.sql`
- `20260806_events_delete_permission_gate.sql`

### `20260806130000` — 2 files (14-digit, 1 skipped on apply)

- `20260806130000_drop_orphaned_attendance_tables.sql`
- `20260806130000_fix_ai_rpc_send_notification_columns.sql`

### `20260807100000` — 2 files (14-digit, 1 skipped on apply)

- `20260807100000_dept_role_assignments_on_hr_additional_roles.sql`
- `20260807100000_learners_profiles_add_abc_emis_umis.sql`

### `20260807140000` — 2 files (14-digit, 1 skipped on apply)

- `20260807140000_campus_living_curated_upgrade_ladder.sql`
- `20260807140000_meeting_bookings_institution_and_cancelled_visibility.sql`

### `20260807150000` — 2 files (14-digit, 1 skipped on apply)

- `20260807150000_campus_living_category_room_source.sql`
- `20260807150000_secdef_caller_identity_lock_sweep.sql`

### `20260807160000` — 2 files (14-digit, 1 skipped on apply)

- `20260807160000_campus_living_admin_honours_curated_ladder.sql`
- `20260807160000_purge_duplicate_cancelled_bills.sql`

### `20260807170000` — 2 files (14-digit, 1 skipped on apply)

- `20260807170000_campus_living_upgrade_skip_room_eligibility.sql`
- `20260807170000_purge_cancelled_hostel_upgrade_bills.sql`

### `20260807180000` — 2 files (14-digit, 1 skipped on apply)

- `20260807180000_campus_living_self_room_change.sql`
- `20260807180000_purge_bds_dental_billing_years234_crri.sql`

### `20260808100000` — 2 files (14-digit, 1 skipped on apply)

- `20260808100000_snapshot_learner_scope_repair_20260808.sql`
- `20260808100000_vac_lessons_enrolled_learner_select.sql`

### `20260808130000` — 2 files (14-digit, 1 skipped on apply)

- `20260808130000_null_unresolvable_learner_semester.sql`
- `20260808130000_soi_batches_on_cohort_spine.sql`

### `20260808140000` — 2 files (14-digit, 1 skipped on apply)

- `20260808140000_repair_learner_semester_section_programme_residue.sql`
- `20260808140000_soi_access_gate_and_roster_privacy.sql`

### `20260808150000` — 2 files (14-digit, 1 skipped on apply)

- `20260808150000_extend_learner_scope_guard_programme.sql`
- `20260808150000_soi_inactivity_dry_run.sql`

### `20260808190000` — 2 files (14-digit, 1 skipped on apply)

- `20260808190000_preserve_user_notifications_on_profile_migration.sql`
- `20260808190000_revoke_anon_on_thirtyone_reporting_views.sql`

### `20260808200000` — 2 files (14-digit, 1 skipped on apply)

- `20260808200000_cac_attendance_rollup.sql`
- `20260808200000_soi_review_permission_coherence.sql`

### `20260809090000` — 2 files (14-digit, 1 skipped on apply)

- `20260809090000_fp_unlink_test_accounts_from_learners.sql`
- `20260809090000_meeting_types_purpose_group.sql`

### `20260810160000` — 2 files (14-digit, 1 skipped on apply)

- `20260810160000_auto_allocate_signature_cache.sql`
- `20260810160000_scf_escalation_report_unattributed.sql`

### `20260810170000` — 2 files (14-digit, 1 skipped on apply)

- `20260810170000_hr_recruitment_purge_rejected_applicant.sql`
- `20260810170000_learner_academic_year_active_guard.sql`

### `20260811090000` — 2 files (14-digit, 1 skipped on apply)

- `20260811090000_card_scanner_max_lane.sql`
- `20260811090000_hr_academic_years_drop_legacy.sql`

### `20260811100000` — 2 files (14-digit, 1 skipped on apply)

- `20260811100000_billing_coverage_total_paid.sql`
- `20260811100000_director_handovers_spine.sql`

### `20260811140000` — 2 files (14-digit, 1 skipped on apply)

- `20260811140000_director_handover_chase.sql`
- `20260811140000_fix_learner_status_auto_promotion.sql`

### `20260811150000` — 2 files (14-digit, 1 skipped on apply)

- `20260811150000_hostel_room_categories_deterministic_priority.sql`
- `20260811150000_sync_learner_status_mirror_induction_allowlist.sql`

### `20260811160000` — 2 files (14-digit, 1 skipped on apply)

- `20260811160000_backfill_stranded_learner_statuses.sql`
- `20260811160000_reset_feeband_nonconforming_allocations.sql`

### `20260813020000` — 2 files (14-digit, 1 skipped on apply)

- `20260813020000_handover_null_institution_is_no_match.sql`
- `20260813020000_revoke_anon_recruitment_purge_rpcs.sql`

### `20260813120000` — 2 files (14-digit, 1 skipped on apply)

- `20260813120000_fn_admitted_source_breakdown.sql`
- `20260813120000_hr_leave_approver_candidates_role_filter.sql`

### `20260814020000` — 2 files (14-digit, 1 skipped on apply)

- `20260814020000_restore_user_has_permission_execute_grant.sql`
- `20260814020000_upgrade_frees_old_bed.sql`

### `20260815070000` — 2 files (14-digit, 1 skipped on apply)

- `20260815070000_auto_allocate_candidates_roll_number.sql`
- `20260815070000_settle_window_trigger_and_scope.sql`

### `20260816040000` — 2 files (14-digit, 1 skipped on apply)

- `20260816040000_fix_bds_deluxe_rule_semester_four_year.sql`
- `20260816040000_notification_expiry_director_categories.sql`

### `20260818010000` — 2 files (14-digit, 1 skipped on apply)

- `20260818010000_course_review_corrections.sql`
- `20260818010000_referral_link_referrer_rpc.sql`

### `20260819010000` — 2 files (14-digit, 1 skipped on apply)

- `20260819010000_course_package_save_rpc.sql`
- `20260819010000_fn_resolve_person_admission_year_column.sql`

### `20260819120000` — 2 files (14-digit, 1 skipped on apply)

- `20260819120000_course_application_decisions.sql`
- `20260819120000_fee_structure_package_type.sql`

### `20260820120000` — 2 files (14-digit, 1 skipped on apply)

- `20260820120000_handover_why_not_working.sql`
- `20260820120000_hostel_self_service_gender_fallback.sql`

### `20260820160000` — 2 files (14-digit, 1 skipped on apply)

- `20260820160000_hr_leave_approval_queue.sql`
- `20260820160000_standardise_gender_male_female_other.sql`

### `20260821140000` — 2 files (14-digit, 1 skipped on apply)

- `20260821140000_induction_merge_pharmacy_drafts_into_live.sql`
- `20260821140000_withdraw_own_pending_comp_off_claim.sql`

### `20260821220000` — 2 files (14-digit, 1 skipped on apply)

- `20260821220000_account_transition_preview_and_bill_guard.sql`
- `20260821220000_hr_staff_salary_directory_rpc.sql`

### `20260822100000` — 2 files (14-digit, 1 skipped on apply)

- `20260822100000_projects_solutions_client_bridge.sql`
- `20260822100000_single_bill_generation_and_due_date_sync.sql`

### `20260822120000` — 2 files (14-digit, 1 skipped on apply)

- `20260822120000_hr_academic_years_jun1_may31.sql`
- `20260822120000_onboarding_progress_next_instalment.sql`

### `20260824200000` — 2 files (14-digit, 1 skipped on apply)

- `20260824200000_hr_on_duty_leave_uncapped.sql`
- `20260824200000_hr_seed_june2026_cl_opening_balance_pharmacy.sql`

### `20260824220000` — 2 files (14-digit, 1 skipped on apply)

- `20260824220000_hr_leave_type_delete_guarded.sql`
- `20260824220000_hr_seed_june2026_cl_opening_balance_arts_self.sql`

### `20260825010000` — 2 files (14-digit, 1 skipped on apply)

- `20260825010000_bos_coordinator_role.sql`
- `20260825010000_move_daily_weekly_crons_to_dispatcher.sql`

### `20260825120000` — 2 files (14-digit, 1 skipped on apply)

- `20260825120000_housekeeping_entitlement_by_room_category.sql`
- `20260825120000_restrict_receipt_cancel_request_to_chief_accountant.sql`

### `20260826010000` — 2 files (14-digit, 1 skipped on apply)

- `20260826010000_events_read_honours_institution_scope.sql`
- `20260826010000_induction_attendance_learner_institution.sql`

### `20260826020000` — 2 files (14-digit, 1 skipped on apply)

- `20260826020000_events_read_scope_is_permission_specific.sql`
- `20260826020000_induction_guest_speakers.sql`

### `20260827010000` — 2 files (14-digit, 1 skipped on apply)

- `20260827010000_person_conflicts_exclude_session.sql`
- `20260827010000_soi_capacity_no_silent_default.sql`

### `20260827020000` — 2 files (14-digit, 1 skipped on apply)

- `20260827020000_induction_recompute_completion_honours_speaker.sql`
- `20260827020000_revoke_anon_execute_six_secdef.sql`

### `20260827100000` — 2 files (14-digit, 1 skipped on apply)

- `20260827100000_housekeeping_booking_assignment.sql`
- `20260827100000_hr_leave_approval_queue_decided_rows.sql`

### `20260827110000` — 2 files (14-digit, 1 skipped on apply)

- `20260827110000_housekeeping_board_all_dates_floor.sql`
- `20260827110000_jkkn_id_associate_kind_and_auto_issue.sql`

### `20260827120000` — 2 files (14-digit, 1 skipped on apply)

- `20260827120000_housekeeping_board_all_institutions.sql`
- `20260827120000_jkkn_directory_rpc.sql`

### `20260827150000` — 2 files (14-digit, 1 skipped on apply)

- `20260827150000_hr_odh_requires_documents.sql`
- `20260827150000_jkkn_stats_and_manual_issue.sql`

### `20260827160000` — 2 files (14-digit, 1 skipped on apply)

- `20260827160000_hr_comp_off_claim_documents.sql`
- `20260827160000_jkkn_id_of_lookup.sql`

### `20260901120000` — 2 files (14-digit, 1 skipped on apply)

- `20260901120000_hr_salary_epf_esi_values.sql`
- `20260901120000_meetings_calendar_connect_lock.sql`

### `20260902140000` — 2 files (14-digit, 1 skipped on apply)

- `20260902140000_hr_calendar_holidays_drive_attendance.sql`
- `20260902140000_v_learner_hostelites_add_contact_numbers.sql`

### `20260922000000` — 2 files (14-digit, 1 skipped on apply)

- `20260922000000_induction_speakers_read_via_definer.sql`
- `20260922000000_revoke_anon_induction_assert_live.sql`

### `20260925000000` — 2 files (14-digit, 1 skipped on apply)

- `20260925000000_attendance_report_settings.sql`
- `20260925000000_revoke_anon_hr_attendance_leave.sql`

### `fix` — 2 files (unversioned legacy token, 1 skipped on apply)

- `fix_attendance_faculty_assignments.sql`
- `fix_bug_report_participants_rls.sql`

### `induction` — 2 files (unversioned legacy token, 1 skipped on apply)

- `induction_feedback_trigger_lock_anon.sql`
- `induction_multipath_completion_option2.sql`

### `rls` — 2 files (unversioned legacy token, 1 skipped on apply)

- `rls_initplan_wrap_hot_tables.sql`
- `rls_initplan_wrap_sweep.sql`

### `scf` — 2 files (unversioned legacy token, 1 skipped on apply)

- `scf_confirmation_status_setbased_align.sql`
- `scf_pending_for_learner_prefilter.sql`

