# Migration Ledger Reconciliation — MyJKKN production (`kvizhngldtiuufknvehv`)

**Date:** 2026-08-05 · **Mode:** read-only · **Scope of truth:** `jicate/main` for files, live catalog for objects
**Zero production writes were made.** Every statement in this document that changes anything is presented as text and is explicitly marked **NOT YET RUN**.

---

## Headline numbers

| Measure | Value | Note |
|---|---|---|
| Migration files on `jicate/main` (top-level `supabase/migrations/*.sql`) | **2,267** | brief's snapshot said ~1,603 — **the divergence is larger than reported** |
| Distinct version tokens across those files | **1,693** | version = token before the first underscore (the repo tool's rule) |
| Duplicate-version groups | **300** | **209** real versioned collisions + **91** spurious legacy filenames carrying no version |
| Files sitting inside a collision group | **874** (39%) | brief said ~180 groups — **also larger** |
| Ledger rows (`supabase_migrations.schema_migrations`) | **2,424** | brief said 2,347 — **larger** |
| Ledger rows whose version matches a file version | **98** | |
| Ledger rows whose `version_name.sql` matches a real filename | **94** | |
| Candidate "unapplied" files (naive set-difference) | **2,148** by version / **2,173** by filename | **CANDIDATES, NOT AN ANSWER** |
| Files object-verified in this pass | **1,127** | of 2,148 candidates — see Coverage |

> **Census authority.** The three collision figures above are the verbatim output of the repo's own guard,
> `scripts/ci/check-migration-version-collision.mjs --all`, run from a detached checkout of `jicate/main`:
> `2267 migration file(s), 300 duplicate version group(s), 874 file(s) inside one.`
> No hand-rolled 14-digit grep was used — that rule is wrong in both directions here (it cannot see the 522
> short-form `YYYYMMDD_` files, and it invents collisions between `…008a` and `…008`). The 209/91 split of the
> 300 groups into real-versus-spurious is this audit's classification, not the tool's; the tool reports the
> total only. Its header records 283/192/91 on 2026-08-01, so the real-collision count has grown by 17 in four days.

### The finding that reframes everything

The ledger is **not a degraded record of file application. It is a record of a different process entirely.**

| Ledger source (`created_by`) | Rows | How it got there |
|---|---:|---|
| `aiengineering@jkkn.ac.in` | 2,243 | Management API / Studio hand-runs, auto-assigned version, SQL stored in `statements` |
| `sroja@jkkn.ac.in` | 90 | same |
| `NULL` | 91 | the only rows written by `supabase db push` from repo files |

**Only ~91 of 2,267 migration files were ever applied through the file-driven path.** The remaining production schema was built by hand-run SQL through the Management API, each recorded under a version number that has no relationship to any filename. That is why 2,330 ledger rows match no file and 2,148 files match no ledger row — the two sets were never the same population.

**Consequence:** the naive set-difference is not merely noisy, it is close to meaningless. A 94% "unapplied" rate is an artifact of comparing two unrelated keyspaces. Object-level verification is the only valid test, which is what the rest of this document does.

**This is not a novel conclusion — the repo already knows it.** `scripts/ci/check-migration-rename-applied.mjs` states it directly in its header, and its rule is the one this audit followed:

> `supabase_migrations.schema_migrations` is NOT an index of this repo. […] Much of this repo's SQL reached production by hand through the Management API, which records nothing. So:
> **ledger HIT → applied. Definitive, trust it. ledger MISS → says NOTHING.** Roughly 96% of this repo's migrations miss.
> The load-bearing signal is therefore OBJECT EXISTENCE.

Read that asymmetry carefully, because it bounds every claim in this document: a ledger hit is proof of application; a ledger miss is proof of nothing at all. List A below is large precisely because a miss is uninformative, and list B is small and hard-won because only a live catalog probe can turn a miss into a finding.

### 🛑 Where the method has no reach at all — read this before trusting any verdict

Object existence is the load-bearing signal, and **a migration that contains no DDL creates no object to probe.** For those files the method returns *nothing* — not "applied", not "unapplied", but no verdict at all. They fall into list C, and **list C is where the danger concentrates**, because a pure `DELETE`/`UPDATE` script is simultaneously the most destructive kind of migration and the only kind this audit structurally cannot classify.

The clearest case is `20260422000002_wipe_billing_test_data.sql`, the most dangerous file found. It is eight unconditional `DELETE FROM` statements and nothing else. There is no table, column, function, policy or index whose presence or absence could tell you whether it has run. Its version is absent from the ledger, and the ledger's silence means nothing. **Both signals are blank at once**, so nobody can determine from the database whether re-running it is a no-op or the destruction of 21,000 live billing rows — except by the fact that the tables are non-empty *now*, which settles it: re-running it is destruction.

Ten of the destructive candidates are in this unreachable class. They are tabulated in list C and again under DANGEROUS TO APPLY. **Do not read their absence from list B as reassurance.**

---

## Coverage statement — read before quoting any number below

- **Verified: 1,127 files of 2,148 candidates (52%).** The remaining 1,021 candidates were **not** examined and carry **no verdict** in this document. Their absence from list B is not evidence they are applied.
- **Selection was priority-driven, not random.** The verified set is the union of: (a) all **78** candidates whose filename suggests destruction (`wipe|purge|reset|clear|revert|truncate|drop|delete|remove`), and (b) all **1,220** candidates dated on or after 2026-06-06 (last 60 days).
- **Method:** each file was parsed for the catalog objects it creates or removes (function, table, view, column, policy, index), then that specific object was queried in the live catalog — `pg_proc`, `pg_class`, `information_schema.columns`, `pg_policies` (all schemas), `pg_indexes`. A creation verifies as applied when the object is present; a removal verifies as applied when the object is absent.
- **Three defects in my own drafting were found and corrected.** The first two inflated the "unapplied" count; the third understated the danger:
  1. `pg_policies` was filtered to `schemaname='public'`, which hid all 105 **storage-schema** policies. Three files were wrongly called unapplied.
  2. Function drops were matched **by name only**. `DROP FUNCTION f(uuid,uuid)` against a live `f(uuid,integer)` is a *different overload* — the drop had in fact been applied. Signature-level checks moved two files from "unapplied" to "applied".
  3. **The `DO` block in `wipe_billing_test_data` was described as a guard that "fails loudly after deleting". It is the opposite** — the assertion fires only if the tables are *not* empty, so on the normal path it confirms the wipe, prints a success notice, and commits. Corrected in the DANGEROUS section. The error mattered: it would have led a reader to believe the damage was caught or reverted. Every destructive candidate was subsequently re-checked for the same pattern, and the pre-flight-versus-post-hoc split is now reported explicitly.
- **Known residual limits.** Object presence proves the object is live; it does **not** prove that this particular file is what created it (another migration or a hand-run may have). For the purpose of "is it safe to re-run / is it still needed", live presence is the operative fact. Dynamic SQL built with `format()` and `%1$s` templates cannot be resolved statically and lands in the PARTIAL/unverifiable buckets as parser noise, not as real absence.

---

## Verdict split across the 1,127 verified files

| List | Meaning | Count |
|---|---|---:|
| **A — APPLIED BUT UNRECORDED** | object is live in production; no ledger row | **1,022** |
| **B — GENUINELY UNAPPLIED** | object absent from production | **9** |
| **PARTIAL** | some objects present, some absent | **22** |
| **C — UNVERIFIABLE** | no catalog object to probe, or ambiguous | **74** |

The dominant outcome is **A by a factor of over 100 to 1**. Production is, in object terms, ahead of the ledger almost everywhere.

---

## List B — GENUINELY UNAPPLIED (9 files)

Every object below was probed individually and found absent. **All nine are purely additive** — they create tables, columns, functions, policies or indexes. **None is destructive.** Applying them is low-risk on that count, though each still needs its own review.

| Version | File | Object types | Evidence (live-catalog probe) |
|---|---|---|---|
| `20260606160000` | `20260606160000_fee_aware_eligibility_schema.sql` | COLUMN_ADD,INDEX | COLUMN_ADD:hostel_program_room_eligibility.quota_id=absent; COLUMN_ADD:hostel_program_mess_eligibility.quota_id=absent; INDEX:uq_room_elig_bracket=absent; INDEX:idx_room_elig_resolve=absent; INDEX:uq_mess_elig_bracket=absent |
| `20260721000000` | `20260721000000_meeting_trigger_missing_data_pr3.sql` | FUNCTION | FUNCTION:fn_college_is_missing_data_day=absent |
| `20260726121724` | `20260726121724_project_task_assignees_raci_db_constraints.sql` | INDEX | INDEX:ix_pta_one_accountable=absent; INDEX:ix_pta_unique_person=absent |
| `20260727060000` | `20260727060000_credit_pairing_and_sync_stamp.sql` | COLUMN_ADD | COLUMN_ADD:teaching_enterprise_cohorts.last_synced_at=absent |
| `20260729120000` | `20260729120000_bos_letterhead_assets.sql` | TABLE,POLICY,INDEX | TABLE:bos_letterhead_assets=absent; POLICY:public.bos_letterhead_assets.bos_letterhead_assets_select=absent; POLICY:public.bos_letterhead_assets.bos_letterhead_assets_write=absent; INDEX:uniq_bos_letterhead_assets_active=absent |
| `20260729` | `20260729_staff_plan_courses_dynamic_permission_rls.sql` | POLICY | POLICY:public.staff_plan_courses.staff_plan_courses_insert_permission=absent; POLICY:public.staff_plan_courses.staff_plan_courses_update_permission=absent; POLICY:public.staff_plan_courses.staff_plan_courses_delete_permission=absent |
| `20260801001600` | `20260801001600_procurement_quotation_not_quoted_and_specs.sql` | COLUMN_ADD | COLUMN_ADD:procurement_quotation_items.offered_spec=absent |
| `20260808210000` | `20260808210000_iqac_cac_metric_map_config.sql` | FUNCTION,TABLE,POLICY,INDEX | FUNCTION:fn_iqac_cac_metric_map_audit=absent; TABLE:iqac_cac_metric_map=absent; TABLE:iqac_cac_metric_map_audit=absent; POLICY:public.iqac_cac_metric_map.iqac_cac_metric_map_select=absent; POLICY:public.iqac_cac_metric_map.iqac_cac_metric_map_insert=absent |
| `20260811090000` | `20260811090000_card_scanner_max_lane.sql` | POLICY | POLICY:storage.objects.card_scans_service_role_only=absent |

**Notes on individual entries**

- `20260606160000_fee_aware_eligibility_schema.sql` — the *parent* tables `hostel_program_room_eligibility` and `hostel_program_mess_eligibility` do not exist either (`to_regclass` → `NULL`). An earlier migration in that chain is also unapplied; this file cannot be applied standalone.
- `20260729_staff_plan_courses_dynamic_permission_rls.sql` — the table exists and carries `staff_plan_courses_select_permission`, but the `insert`/`update`/`delete` permission policies are absent. The SELECT half of this change is live and the write half is not.
- `20260811090000_card_scanner_max_lane.sql` — `storage.objects` carries 105 policies but none matching `card_scans`.
- `20260808210000_iqac_cac_metric_map_config.sql` — neither `iqac_cac_metric_map` nor `iqac_cac_metric_map_audit` exists.

### Five files were reclassified OUT of list B after closer checks

| File | First verdict | Corrected | Why |
|---|---|---|---|
| `20260424_drop_seat_analytics_compat_shim.sql` | B | **A** | drops `get_seat_analytics(uuid, uuid)`; live has exactly one overload, `(uuid, integer)`. The shim is gone — applied. |
| `20260630220200_induction_drop_legacy_rpc_overloads.sql` | B | **A** | drops an 11-arg `fn_induction_create_program` and a 5-arg `fn_induction_preview_enroll`; live carries only the 14-arg and 8-arg forms. Applied. |
| `20250117_remove_users_table.sql` | B | **C** | drops then recreates `public.users`; the table is absent, so either the file never ran or a later change removed it. Not decidable from the catalog. |
| `20260726130000_backfill_learner_academic_year_blank_only.sql` | B | **C** | only testable objects are `_bak_*` snapshot tables, which are routinely dropped after a backfill. Absence is not evidence. |
| `20260731170000_repair_learner_semester_cross_institution_via_section.sql` | B | **C** | same `_bak_*` reasoning. |

---

## List C — UNVERIFIABLE

74 files in total. The 10 **destructive** ones matter most, because these are exactly the files where "did it already run?" is the question you most need answered and the catalog cannot answer it.

| Version | File | Why unverifiable |
|---|---|---|
| `20260421` | `20260421_delete_education_fair_leads.sql` | pure data mutation — no catalog object to probe |
| `20260422000002` | `20260422000002_wipe_billing_test_data.sql` | pure data mutation — no catalog object to probe |
| `20260422000004` | `20260422000004_clear_account_fees_revert_to_enquiry.sql` | pure data mutation — no catalog object to probe |
| `20260507100015` | `20260507100015_unwind_misallocated_bills_and_revert_account_status.sql` | pure data mutation — no catalog object to probe |
| `20260508160001` | `20260508160001_grant_admission_fees_delete_to_admission_role.sql` | pure data mutation — no catalog object to probe |
| `20260601` | `20260601_remove_transport_hostel_fee_structure_items.sql` | pure data mutation — no catalog object to probe |
| `20260602120000` | `20260602120000_bus_pass_remove_approval_step.sql` | pure data mutation — no catalog object to probe |
| `20260602180000` | `20260602180000_delete_all_transport_fee_bills.sql` | pure data mutation — no catalog object to probe |
| `20260605103000` | `20260605103000_remove_hostel_items_from_admission.sql` | pure data mutation — no catalog object to probe |
| `20260706130000` | `20260706130000_remove_recruitment_approvals_scope_policies.sql` | pure data mutation — no catalog object to probe |

The remaining 64 are pure data operations from the recent window, `_bak_`-snapshot-only files, and files whose DDL is generated through `format()` templates that cannot be resolved without executing them.

---

## PARTIAL (22 files)

Mixed evidence — some objects present, some absent. Several are **parser artifacts** rather than real partial application: entries showing `INDEX:on=absent`, `TABLE:as=absent`, or `POLICY:public.public.%1$s_select=absent` come from dynamic SQL or multi-line `CREATE INDEX ... ON` statements that the static extractor mis-tokenised. Treat this table as a review queue, not a defect list.

| Version | File | Verified | Objects reported absent |
|---|---|---|---|
| `20260602174000` | `20260602174000_drop_learners_profiles_quota_text_column.sql` | 1/2 | FUNCTION:learners_profiles_sync_shadow_fks=absent |
| `20260610` | `20260610_bos_committees.sql` | 11/13 | INDEX:uniq_bos_committees_institution_name=absent; INDEX:uniq_bos_committees_institution_code=absent |
| `20260611230000` | `20260611230000_choose_your_menu_p0_substrate.sql` | 9/11 | TABLE:mess_choose_recognition=absent; INDEX:idx_mess_choose_recognition_learner=absent |
| `20260611` | `20260611_hr_attendance_absorption.sql` | 1/2 | FUNCTION:fn_holiday_backfill_attendance=absent |
| `20260617001100` | `20260617001100_meet_contacts.sql` | 7/8 | FUNCTION:fn_meeting_contacts_touch_updated_at=absent |
| `20260618150000` | `20260618150000_bos_add_counselling_code.sql` | 1/3 | COLUMN_ADD:public.counselling_code=absent; INDEX:if=absent |
| `20260621100000` | `20260621100000_fix_fee_mismatch_2026.sql` | 1/5 | FUNCTION:_feesync_mismatch_ids_2026=absent; TABLE:_bak_feesync_bills_20260621=absent; TABLE:_bak_feesync_receipt_items_20260621=absent; TABLE:_bak_feesync_learner_20260621=absent |
| `20260623170000` | `20260623170000_reservation_stock_time_window_aware.sql` | 1/2 | FUNCTION:fn_reservation_approved_decrement_stock=absent |
| `20260629154402` | `20260629154402_cdc_rls_multirole_institution_scope.sql` | 15/16 | POLICY:public.cdc_idp_responses.cdc_idp_responses_write=absent |
| `20260630065157` | `20260630065157_bug_reports_metadata_for_ig_auto_route.sql` | 1/2 | INDEX:idx_bug_reports_metadata_ig_user_id=absent |
| `20260703000000` | `20260703000000_hostel_rooms_v2_pr1_substrate.sql` | 6/13 | TABLE:room_institution_access=absent; POLICY:public.room_institution_access.room_institution_access_select_permission=absent; POLICY:public.room_institution_access.room_institution_access_insert_permission=absent; POLICY:public.room_institution_access.room_institution_access_update_permission=absent; POLICY:public.room_institution_access.room_institution_access_delete_permission=absent |
| `20260704090100` | `20260704090100_cdc_exam_syllabus_topics.sql` | 3/8 | TABLE:cdc_exam_topic_map=absent; POLICY:public.cdc_exam_topic_map.cdc_exam_topic_map_read=absent; POLICY:public.cdc_exam_topic_map.cdc_exam_topic_map_write=absent; INDEX:idx_cdc_exam_topic_map_exam=absent; INDEX:idx_cdc_exam_topic_map_topic=absent |
| `20260710180000` | `20260710180000_bos_po_pso_regulation_scope.sql` | 3/4 | COLUMN_ADD:public.regulation_id=absent |
| `20260712190000` | `20260712190000_store_kit_entitlements.sql` | 23/25 | POLICY:public.public.%1$s_select=absent; POLICY:public.public.%1$s_write=absent |
| `20260717150000` | `20260717150000_bug_clusters_scan_loop.sql` | 3/4 | INDEX:on=absent |
| `20260719003000` | `20260719003000_bug_cluster_scan_two_tier.sql` | 1/2 | INDEX:on=absent |
| `20260719020000` | `20260719020000_bug_cluster_scan_error_fingerprints.sql` | 1/2 | INDEX:on=absent |
| `20260723090000` | `20260723090000_mba_improvement_board.sql` | 15/16 | POLICY:public.improvement_areas.improvement_areas_manage=absent |
| `20260805090000` | `20260805090000_procurement_pdf_max_lane.sql` | 1/4 | POLICY:storage.objects.procurement_quotation_pdfs_insert=absent; POLICY:storage.objects.procurement_quotation_pdfs_read=absent; POLICY:storage.objects.procurement_quotation_pdfs_delete=absent |
| `20260807100000` | `20260807100000_dept_role_assignments_on_hr_additional_roles.sql` | 6/7 | POLICY:public.hr_additional_roles.hr_add_roles_tenant_isolation=absent |
| `20260808220000` | `20260808220000_autolock_new_public_relations.sql` | 1/3 | TABLE:as=absent; TABLE:as=absent |
| `20260810160000` | `20260810160000_auto_allocate_signature_cache.sql` | 2/3 | INDEX:on=absent |

---

## 🛑 DANGEROUS TO APPLY — read this before anyone runs `supabase db push`

The danger here is **not** in list B. List B is additive and safe. The danger is in **list A**: 
migrations that have *already run* against production, whose versions are *absent from the ledger*, 
and which therefore look unapplied to `supabase db push`. It would run them **again**.

### The single most dangerous file

`supabase/migrations/20260422000002_wipe_billing_test_data.sql` — version `20260422000002`, **absent from the ledger**, and **unverifiable** by catalog probe because it contains no DDL. Its body is eight unconditional deletes with no `WHERE` clause:

```sql
DELETE FROM billing_invoice_items;
DELETE FROM billing_invoices;
DELETE FROM billing_discounts;
DELETE FROM billing_refunds;
DELETE FROM billing_receipt_items;
DELETE FROM billing_receipts;
DELETE FROM billing_student_bills;
DELETE FROM billing_categories;
```

The file then runs a `DO` block that many readers — including an earlier draft of this document — will misread as a safety guard. **It is not one.** Read the control flow:

```
line 34       BEGIN;
lines 37-60   eight unconditional DELETEs          -- the tables are now empty
lines 63-85   DO $$ ... IF (sum of counts) <> 0 THEN RAISE EXCEPTION ... END IF;
line 87       COMMIT;
```

The assertion fires only when the tables are **NOT** empty. After the deletes they *are* empty, the sum is zero, the exception never fires, `RAISE NOTICE 'Billing wipe verified: all 6 tables empty.'` prints, and **`COMMIT` executes.** The block is a wipe-*confirmation* — it verifies the destruction succeeded. On the normal path this migration deletes roughly 21,000 live billing rows and commits them **quietly, with a success notice**. There is no rollback and no loud failure. The file's own comment on line 62 (`-- Verification block — fail the migration if anything remains`) invites exactly the wrong reading.

**It was written for a dataset 30× smaller.** Its header records the pre-wipe counts captured on 2026-04-22: 376 bills, 20 receipts, 86 categories. Today the same eight unconditional statements would hit:

| Table | Pre-wipe count in the file's header (2026-04-22) | Live rows today | Would be deleted |
|---|---:|---:|---:|
| `billing_student_bills` | 376 | 11,196 | 11,196 |
| `billing_receipt_items` | 20 | 5,860 | 5,860 |
| `billing_receipts` | 20 | 3,931 | 3,931 |
| `billing_categories` | 86 | 25 | 25 |
| `billing_invoice_items` | 3 | 2 | 2 |
| `billing_invoices` | 2 | 2 | 2 |
| `billing_discounts` | 0 | 0 | 0 |
| `billing_refunds` | 0 | 0 | 0 |
| **Total** | **507** | **21,016** | **21,016** |

> These counts moved *during this audit*: `billing_receipts` read 3,926 on the first pass and 3,931 about an hour later; `billing_receipt_items` 5,855 → 5,860. Billing is actively being written to. Treat every number here as a reading, not a constant, and re-read immediately before acting.

That includes **3,926 payment receipts**. The version is not in the ledger, so a `db push` would treat it as pending. No catalog query can tell you in advance whether re-running it is a no-op or a catastrophe — the tables are non-empty *now*, which means it is a catastrophe.

Also in the same unverifiable-and-destructive class: `20260602180000_delete_all_transport_fee_bills.sql` (deletes every bill joined to a `kind='transport'` category, no date or tenant guard) and `20260422000004_clear_account_fees_revert_to_enquiry.sql`.


### Self-defending versus not — the distinction that separates the safe purges from the wipe

Not every destructive migration here is equally hazardous, and the difference is structural: **does the abort check run *before* the destruction, or *after* it?** Every one of the 78 destructive candidates was classified by locating the first `DELETE`/`TRUNCATE` and asking whether any `RAISE EXCEPTION` precedes it.

**Self-defending — a genuine pre-flight guard (safe to re-run; it fails closed).** The best example is `20260730120000_purge_bds_dental_1year_ay2025_26_billing.sql`, which asserts **18 preconditions before touching a row**:

```sql
IF v_learners <> 99  THEN RAISE EXCEPTION 'Aborting: expected 99 learners in scope, got %.', v_learners; END IF;
IF v_bills    <> 361 THEN RAISE EXCEPTION 'Aborting: expected 361 bills, got %.', v_bills; END IF;
IF v_bill_amt <> 147662500 THEN RAISE EXCEPTION 'Aborting: bill total is %, expected 147662500.', v_bill_amt; END IF;
IF v_inst <> 1 THEN RAISE EXCEPTION 'Aborting: scope spans % institutions, expected 1.', v_inst; END IF;
IF v_blockers <> 0 THEN RAISE EXCEPTION 'Aborting: % blocking reference(s) found.', v_blockers; END IF;
```

It pins exact row counts, an exact rupee total, single-institution/programme/department/semester/academic-year scope, zero non-active learners, and a closed bill/receipt subgraph. **Re-run today those counts cannot match — the rows are already gone — so it aborts before deleting anything.** This is what a destructive migration should look like.

Twelve of the 78 carry a pre-flight abort of some kind:

`20260531000013_reset_allocation_batch_rpc` · `20260616160000_tms_fee_bill_safe_delete_cleanup_linked_billing` · `20260704120000_fn_cl_admin_reset_allocation` · `20260724010000_remove_batch_allocations_rpc` · `20260724120000_fix_reset_allocation_batch_dependent_fks` · `20260730120000_purge_bds_dental_1year_ay2025_26_billing` · `20260730180000_delete_bds1y_bills_except_transport` · `20260804140000_ims_item_delete_and_duplicate_guard` · `20260807160000_purge_duplicate_cancelled_bills` · `20260807170000_purge_cancelled_hostel_upgrade_bills` · `20260807180000_purge_bds_dental_billing_years234_crri` · `20260810170000_hr_recruitment_purge_rejected_applicant`

> Caveat on that list: a `RAISE EXCEPTION` positioned before the first delete is not automatically a guard — inside a `CREATE FUNCTION` body it is part of a routine being *defined*, not a precondition being *checked*. The three billing purges were read directly and their guards are real. The others are classified positionally and were not individually read; treat them as "probably guarded, verify before relying on it".

**Not self-defending — no pre-flight check, and at least one delete with no `WHERE` clause at all:**

| File | Unconditional deletes | Pre-flight guard | Post-hoc assertion |
|---|---:|---|---|
| `20260422000002_wipe_billing_test_data.sql` | **8 of 8** | none | 1 — confirms the wipe |
| `20260612190000_reset_test_allocations.sql` | **2 of 2** | none | none |
| `20260509150000_wipe_counselor_source_seed_fanout.sql` | 1 of 1 | none | 1 — confirms the wipe |
| `20260728010000_hr_leave_applications_fresh_start_purge.sql` | 1 of 1 | none | none |

**`20260612190000_reset_test_allocations.sql` deserves separate attention.** Its version is absent from the ledger (`count = 0`), it is verified **applied**, and it ends with two unconditional statements:

```sql
DELETE FROM public.hostel_waitlist;
DELETE FROM public.hostel_allocations;
```

Its backup step is `CREATE TABLE IF NOT EXISTS public._bak_hostel_allocations_20260612 AS SELECT * FROM public.hostel_allocations`. That table **already exists**, so on a second run `IF NOT EXISTS` skips it and **the deletes proceed with no fresh snapshot**. The surviving June snapshot holds 67 rows; `hostel_allocations` holds **229** today. A re-run would destroy 229 live rows and leave a 67-row June backup as the only record.

> **Explicitly not a causal claim.** Session records note an open incident about hostel allocations being wiped. This file is a *hazard in that exact table*, not evidence of what caused that incident — `hostel_allocations` currently holds 229 rows, not zero, so the observable state does not match a fresh run of this file. It is flagged here because it is a live re-run risk in an area already known to be fragile, and because reported session notes say point-in-time recovery is off (not verified in this pass).

### 31 further destructive migrations verified APPLIED but unrecorded

Each of these has already run, is missing from the ledger, and contains a data mutation that would re-execute on a push.

| Version | File |
|---|---|
| `20260507100011` | `20260507100011_split_fee_structures_rls_for_delete_permission.sql` |
| `20260509150000` | `20260509150000_wipe_counselor_source_seed_fanout.sql` |
| `20260513160000` | `20260513160000_fix_reassign_source_leads_drop_assigned_by.sql` |
| `20260528000008` | `20260528000008_fee_structure_drop_accommodation_dimension.sql` |
| `20260529100000` | `20260529100000_drop_learners_profiles_hostel_food_type.sql` |
| `20260531000013` | `20260531000013_reset_allocation_batch_rpc.sql` |
| `20260611190000` | `20260611190000_reset_learner_hostel_categories_allocation_sync.sql` |
| `20260612190000` | `20260612190000_reset_test_allocations.sql` |
| `20260615150000` | `20260615150000_campus_living_clear_upgrade_threshold.sql` |
| `20260616050000` | `20260616050000_reset_category_upgrade_waitlist.sql` |
| `20260616060000` | `20260616060000_delete_unpaid_room_category_upgrade_bills.sql` |
| `20260616070000` | `20260616070000_clear_upgrade_waitlist_fresh_start.sql` |
| `20260616075000` | `20260616075000_delete_unpaid_mess_category_upgrade_bills.sql` |
| `20260616160000` | `20260616160000_tms_fee_bill_safe_delete_cleanup_linked_billing.sql` |
| `20260616160100` | `20260616160100_tms_delete_test_fee_structures.sql` |
| `20260617150000` | `20260617150000_reset_premium_allocations.sql` |
| `20260617160000` | `20260617160000_self_leave_reverts_category.sql` |
| `20260704120000` | `20260704120000_fn_cl_admin_reset_allocation.sql` |
| `20260720080000` | `20260720080000_sf100_stall_grace_reset.sql` |
| `20260724010000` | `20260724010000_remove_batch_allocations_rpc.sql` |
| `20260724120000` | `20260724120000_fix_reset_allocation_batch_dependent_fks.sql` |
| `20260728010000` | `20260728010000_hr_leave_applications_fresh_start_purge.sql` |
| `20260729` | `20260729_billing_delete_super_admin_only.sql` |
| `20260730120000` | `20260730120000_purge_bds_dental_1year_ay2025_26_billing.sql` |
| `20260730180000` | `20260730180000_delete_bds1y_bills_except_transport.sql` |
| `20260804140000` | `20260804140000_ims_item_delete_and_duplicate_guard.sql` |
| `20260807160000` | `20260807160000_purge_duplicate_cancelled_bills.sql` |
| `20260807170000` | `20260807170000_purge_cancelled_hostel_upgrade_bills.sql` |
| `20260807180000` | `20260807180000_purge_bds_dental_billing_years234_crri.sql` |
| `20260808100100` | `20260808100100_pde_submission_delete_cleanup.sql` |
| `20260810170000` | `20260810170000_hr_recruitment_purge_rejected_applicant.sql` |

### The rename vector — a second way an applied migration becomes "pending"

`db push` is not the only path to a destructive re-run. **Renaming a migration** produces the same outcome by a different route: the old version keeps whatever ledger status it had, the new version has none, and the file is therefore reported as pending. Nothing moved in the database — only what the repo claims about it.

This is not hypothetical, and it is **live right now**:

| | |
|---|---|
| **PR #2782** | "fix(migrations): August version collisions, where at most one file of each pair could ever be recorded" |
| **State (checked 2026-08-05)** | **OPEN**, `mergeable: CONFLICTING`, `mergeStateStatus: DIRTY`, last updated 2026-08-04 |
| **Scope** | renames **32** migrations to break August collisions |
| **Hazard** | **17 of the 32 are already applied to production** (verified 2026-08-04 by the rename guard's author) |

The worked example in `check-migration-rename-applied.mjs` is worth stating in full, because it shows the damage is a **security regression, not just churn**. `20260801002300_ims_transfer_stock_engine.sql` contains:

```sql
DROP POLICY IF EXISTS ims_stock_movements_insert ON public.ims_stock_movements;
CREATE POLICY ims_stock_movements_insert ON public.ims_stock_movements
  FOR INSERT TO authenticated WITH CHECK (true);
```

Production currently enforces `super_admin OR institution_id = the caller's own institution` on that policy — installed *later*, by `20260801002800_ims_transfer_engine_auth_hardening.sql`. Re-applying the renamed file on its own **replaces a tenant boundary with `WITH CHECK (true)`**, and also restores a `FOR ALL USING (true)` policy on `ims_supply_shipment_item_batches`, which `authenticated` holds SELECT on. In a multi-tenant cluster that is cross-institution write access.

**Cross-referenced against this audit (authoritative rename pairs from the GitHub API, not inferred):**

| Verdict for the RENAME SOURCE | Count |
|---|---:|
| **A — verified APPLIED** (renaming it makes an applied migration look pending) | **27** |
| C — unverifiable | 1 |
| not verified in this pass — no verdict | 4 |
| **Total renames in PR #2782** | **32** |

So the guard's "17 already applied" is a **floor**, not a ceiling: by live object evidence, **27 of the 32** are already in production. Every one of those 27 becomes a pending migration the moment the rename lands.

**The collision makes it worse than a plain re-run.** Both halves of the IMS story sit on *colliding* versions, so at most one file of each pair can ever be recorded and `db push` silently skips the other:

| Version | Files sharing it |
|---|---|
| `20260801002300` | `20260801002300_ims_transfer_stock_engine.sql` ← the `WITH CHECK (true)` file<br>`20260801002300_backfill_stuck_leave_onduty_approvals.sql` |
| `20260801002800` | `20260801002800_ims_transfer_engine_auth_hardening.sql` ← **the tenant boundary that fixes it**<br>`20260801002800_seed_leave_approval_flows.sql` |

The permissive engine file and the hardening migration that repairs it are **both** on shared versions. That is the worst available arrangement: the fix is exactly as skippable as the flaw, and nothing in the ledger can distinguish which member of either pair was recorded.

**Implication for this reconciliation:** the ledger backfill below is not merely bookkeeping hygiene. Recording an applied version is what stops both the push path and the rename path from re-running it. Conversely, **renaming any file whose version IS recorded makes it look unapplied and it will re-run** — so the backfill and any rename work must not be done blind to each other. PR #2782 should be reconciled against list A before it is merged, not after.

### The collision multiplier

`schema_migrations.version` is the primary key, so **at most one file per version can ever be recorded**. 874 files sit inside a duplicate-version group, so even a correct backfill leaves siblings invisible — and `db push` skips them silently while reporting success.

| Version | Files sharing it | Effect on apply |
|---|---:|---|
| `20260725` | 16 | 15 would be silently skipped |
| `20260428` | 15 | 14 would be silently skipped |
| `20260518` | 15 | 14 would be silently skipped |
| `20251015` | 14 | 13 would be silently skipped |
| `20260422` | 13 | 12 would be silently skipped |
| `20260729` | 12 | 11 would be silently skipped |
| `20260522` | 11 | 10 would be silently skipped |
| `20250121` | 9 | 8 would be silently skipped |
| `20260424` | 9 | 8 would be silently skipped |
| `20260427` | 9 | 8 would be silently skipped |
| `20260429` | 9 | 8 would be silently skipped |
| `20260512` | 9 | 8 would be silently skipped |
| `20250117` | 8 | 7 would be silently skipped |
| `20260224` | 8 | 7 would be silently skipped |
| `20250123` | 7 | 6 would be silently skipped |

### Recommendation

Do not run `supabase db push`, and do not dispatch `.github/workflows/supabase-migration-apply.yml`, against this repository in its current state. The ledger cannot be repaired into correctness by a push; the push is what the broken ledger makes dangerous. Backfill first (below), verify, and only then consider applying list B — file by file, never as a batch.

---

## Ledger backfill statements — ⚠️ NOT YET RUN

**These change no schema.** They insert bookkeeping rows into `supabase_migrations.schema_migrations` so that `supabase db push` stops treating already-applied migrations as pending. They create no table, drop no column, and touch no application data.

Scope: the **58 destructive migrations verified as already applied** — the safety-critical subset. Recording these removes 58 re-run hazards. The other ~964 files in list A can be backfilled the same way; the statement shape is identical.

`ON CONFLICT (version) DO NOTHING` is deliberate: 17 of these 58 versions are shared by other files, and the first row wins. Those lines are flagged inline — **for a flagged version, this row covers only one of the colliding files and the siblings stay invisible to the tooling.** Renaming colliding files is a separate piece of work and must not be done while any of them is open in a pull request.

```sql
-- ⚠️ NOT YET RUN — ledger bookkeeping only. Changes no schema, no application data.
-- Verify each version is still absent immediately before running; other sessions write this database.
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
  ('20250126', 'remove_auth_fkey_for_preregistration'),   -- ⚠ version shared by 7 files
  ('20250128', 'remove_dashboard_widget_system'),
  ('20260314', 'expo_remove_institution_scope'),   -- ⚠ version shared by 2 files
  ('20260417000004', 'fix_consultant_delete_policies_for_admission_staff'),   -- ⚠ version shared by 2 files
  ('20260424', 'bos_align_institutions_id_and_drop_expert_fk'),   -- ⚠ version shared by 9 files
  ('20260502000005', 'get_seat_analytics_year_param_drop_or_fallback'),   -- ⚠ version shared by 2 files
  ('20260502000011', 'drop_learners_profiles_admission_year_integer'),
  ('20260507100011', 'split_fee_structures_rls_for_delete_permission'),
  ('20260507100014', 'drop_redundant_category_column_on_learners_profiles'),
  ('20260509150000', 'wipe_counselor_source_seed_fanout'),
  ('20260512', 'drop_bos_boards'),   -- ⚠ version shared by 9 files
  ('20260513160000', 'fix_reassign_source_leads_drop_assigned_by'),   -- ⚠ version shared by 2 files
  ('20260513210000', 'simplify_call_memos_policy_drop_institution_check'),
  ('20260522110000', 'revert_strict_counselor_overrides_to_canonical'),
  ('20260526', 'fix_applications_delete_rls_role_mismatch'),   -- ⚠ version shared by 6 files
  ('20260528000008', 'fee_structure_drop_accommodation_dimension'),
  ('20260529100000', 'drop_learners_profiles_hostel_food_type'),
  ('20260531000001', 'remove_amenities_categories'),
  ('20260531000003', 'drop_hostel_blocks_amenities'),
  ('20260531000013', 'reset_allocation_batch_rpc'),
  ('20260602183000', 'drop_learners_profiles_community_text_column'),
  ('20260602185000', 'caste_fk_only_rpc_and_drop_sync_trigger'),
  ('20260602186000', 'drop_learners_profiles_caste_text_column'),
  ('20260603090000', 'drop_learners_profiles_accommodation_type_text'),
  ('20260603100001', 'drop_room_institution_access'),
  ('20260604170000', 'admission_packages_drop_hostel_year'),
  ('20260611190000', 'reset_learner_hostel_categories_allocation_sync'),   -- ⚠ version shared by 2 files
  ('20260612190000', 'reset_test_allocations'),   -- ⚠ version shared by 2 files
  ('20260615150000', 'campus_living_clear_upgrade_threshold'),
  ('20260615230000', 'audit_program_eligibility_reverts'),
  ('20260616050000', 'reset_category_upgrade_waitlist'),
  ('20260616060000', 'delete_unpaid_room_category_upgrade_bills'),
  ('20260616070000', 'clear_upgrade_waitlist_fresh_start'),
  ('20260616075000', 'delete_unpaid_mess_category_upgrade_bills'),
  ('20260616160000', 'tms_fee_bill_safe_delete_cleanup_linked_billing'),   -- ⚠ version shared by 2 files
  ('20260616160100', 'tms_delete_test_fee_structures'),
  ('20260617150000', 'reset_premium_allocations'),
  ('20260617160000', 'self_leave_reverts_category'),
  ('20260624140000', 'reservation_super_admin_delete_policy'),
  ('20260624160000', 'service_request_super_admin_delete_policy'),
  ('20260704120000', 'fn_cl_admin_reset_allocation'),   -- ⚠ version shared by 4 files
  ('20260714041700', 'drop_mission_map_superseded'),
  ('20260720080000', 'sf100_stall_grace_reset'),
  ('20260723080000', 'ai_pulse_domain_starter_autorevert'),
  ('20260723210000', 'ai_pulse_remove_domain_starter_tamil_gate'),
  ('20260724010000', 'remove_batch_allocations_rpc'),
  ('20260724120000', 'fix_reset_allocation_batch_dependent_fks'),   -- ⚠ version shared by 3 files
  ('20260728010000', 'hr_leave_applications_fresh_start_purge'),
  ('20260729', 'billing_delete_super_admin_only'),   -- ⚠ version shared by 12 files
  ('20260730120000', 'purge_bds_dental_1year_ay2025_26_billing'),   -- ⚠ version shared by 4 files
  ('20260730180000', 'delete_bds1y_bills_except_transport'),   -- ⚠ version shared by 2 files
  ('20260731102000', 'school_master_drop_management_type'),
  ('20260804140000', 'ims_item_delete_and_duplicate_guard'),   -- ⚠ version shared by 2 files
  ('20260807160000', 'purge_duplicate_cancelled_bills'),
  ('20260807170000', 'purge_cancelled_hostel_upgrade_bills'),
  ('20260807180000', 'purge_bds_dental_billing_years234_crri'),
  ('20260808100100', 'pde_submission_delete_cleanup'),
  ('20260810170000', 'hr_recruitment_purge_rejected_applicant')
ON CONFLICT (version) DO NOTHING;
```

> Re-read `SELECT version FROM supabase_migrations.schema_migrations WHERE version IN (...)` first — this document is a snapshot and nine other sessions write this database.

---

## List A — APPLIED BUT UNRECORDED (1,022 files)

Object-verified live in production, no ledger row. The 58 destructive members are tabulated below because they carry re-run risk; the remaining 964 are additive DDL (functions, tables, columns, policies, indexes) confirmed present in the live catalog.

| Version | File | Object types | Evidence |
|---|---|---|---|
| `20250126` | `20250126_remove_auth_fkey_for_preregistration.sql` | FUNCTION,INDEX | 2 objects probed, all present/removed as the file specifies |
| `20250128` | `20250128_remove_dashboard_widget_system.sql` | TABLE_DROP,FUNCTION_DROP | 6 objects probed, all present/removed as the file specifies |
| `20260314` | `20260314_expo_remove_institution_scope.sql` | POLICY | 16 objects probed, all present/removed as the file specifies |
| `20260417000004` | `20260417000004_fix_consultant_delete_policies_for_admission_staff.sql` | POLICY | 3 objects probed, all present/removed as the file specifies |
| `20260424` | `20260424_bos_align_institutions_id_and_drop_expert_fk.sql` | INDEX | 4 objects probed, all present/removed as the file specifies |
| `20260502000005` | `20260502000005_get_seat_analytics_year_param_drop_or_fallback.sql` | FUNCTION,FUNCTION_DROP | 1 objects probed, all present/removed as the file specifies |
| `20260502000011` | `20260502000011_drop_learners_profiles_admission_year_integer.sql` | COLUMN_DROP | 1 objects probed, all present/removed as the file specifies |
| `20260507100011` | `20260507100011_split_fee_structures_rls_for_delete_permission.sql` | POLICY,DATA_OP | 3 objects probed, all present/removed as the file specifies |
| `20260507100014` | `20260507100014_drop_redundant_category_column_on_learners_profiles.sql` | FUNCTION,COLUMN_DROP,FUNCTION_DROP | 2 objects probed, all present/removed as the file specifies |
| `20260509150000` | `20260509150000_wipe_counselor_source_seed_fanout.sql` | FUNCTION,DATA_OP | 1 objects probed, all present/removed as the file specifies |
| `20260512` | `20260512_drop_bos_boards.sql` | TABLE_DROP | 1 objects probed, all present/removed as the file specifies |
| `20260513160000` | `20260513160000_fix_reassign_source_leads_drop_assigned_by.sql` | FUNCTION,DATA_OP | 1 objects probed, all present/removed as the file specifies |
| `20260513210000` | `20260513210000_simplify_call_memos_policy_drop_institution_check.sql` | POLICY | 2 objects probed, all present/removed as the file specifies |
| `20260522110000` | `20260522110000_revert_strict_counselor_overrides_to_canonical.sql` | FUNCTION | 1 objects probed, all present/removed as the file specifies |
| `20260526` | `20260526_fix_applications_delete_rls_role_mismatch.sql` | POLICY | 1 objects probed, all present/removed as the file specifies |
| `20260528000008` | `20260528000008_fee_structure_drop_accommodation_dimension.sql` | FUNCTION,DATA_OP | 2 objects probed, all present/removed as the file specifies |
| `20260529100000` | `20260529100000_drop_learners_profiles_hostel_food_type.sql` | VIEW,COLUMN_DROP,DATA_OP | 2 objects probed, all present/removed as the file specifies |
| `20260531000001` | `20260531000001_remove_amenities_categories.sql` | COLUMN_DROP,TABLE_DROP | 2 objects probed, all present/removed as the file specifies |
| `20260531000003` | `20260531000003_drop_hostel_blocks_amenities.sql` | COLUMN_DROP | 1 objects probed, all present/removed as the file specifies |
| `20260531000013` | `20260531000013_reset_allocation_batch_rpc.sql` | FUNCTION,DATA_OP | 1 objects probed, all present/removed as the file specifies |
| `20260602183000` | `20260602183000_drop_learners_profiles_community_text_column.sql` | COLUMN_DROP | 1 objects probed, all present/removed as the file specifies |
| `20260602185000` | `20260602185000_caste_fk_only_rpc_and_drop_sync_trigger.sql` | FUNCTION,FUNCTION_DROP | 2 objects probed, all present/removed as the file specifies |
| `20260602186000` | `20260602186000_drop_learners_profiles_caste_text_column.sql` | COLUMN_DROP | 1 objects probed, all present/removed as the file specifies |
| `20260603090000` | `20260603090000_drop_learners_profiles_accommodation_type_text.sql` | COLUMN_DROP,FUNCTION_DROP | 2 objects probed, all present/removed as the file specifies |
| `20260603100001` | `20260603100001_drop_room_institution_access.sql` | TABLE_DROP | 1 objects probed, all present/removed as the file specifies |
| `20260604170000` | `20260604170000_admission_packages_drop_hostel_year.sql` | COLUMN_DROP | 1 objects probed, all present/removed as the file specifies |
| `20260611190000` | `20260611190000_reset_learner_hostel_categories_allocation_sync.sql` | FUNCTION,DATA_OP | 1 objects probed, all present/removed as the file specifies |
| `20260612190000` | `20260612190000_reset_test_allocations.sql` | TABLE,DATA_OP | 3 objects probed, all present/removed as the file specifies |
| `20260615150000` | `20260615150000_campus_living_clear_upgrade_threshold.sql` | TABLE,DATA_OP | 1 objects probed, all present/removed as the file specifies |
| `20260615230000` | `20260615230000_audit_program_eligibility_reverts.sql` | FUNCTION,TABLE | 2 objects probed, all present/removed as the file specifies |
| `20260616050000` | `20260616050000_reset_category_upgrade_waitlist.sql` | TABLE,DATA_OP | 2 objects probed, all present/removed as the file specifies |
| `20260616060000` | `20260616060000_delete_unpaid_room_category_upgrade_bills.sql` | TABLE,DATA_OP | 1 objects probed, all present/removed as the file specifies |
| `20260616070000` | `20260616070000_clear_upgrade_waitlist_fresh_start.sql` | TABLE,DATA_OP | 2 objects probed, all present/removed as the file specifies |
| `20260616075000` | `20260616075000_delete_unpaid_mess_category_upgrade_bills.sql` | TABLE,DATA_OP | 1 objects probed, all present/removed as the file specifies |
| `20260616160000` | `20260616160000_tms_fee_bill_safe_delete_cleanup_linked_billing.sql` | FUNCTION,DATA_OP | 1 objects probed, all present/removed as the file specifies |
| `20260616160100` | `20260616160100_tms_delete_test_fee_structures.sql` | TABLE,DATA_OP | 5 objects probed, all present/removed as the file specifies |
| `20260617150000` | `20260617150000_reset_premium_allocations.sql` | TABLE,TABLE_DROP,DATA_OP | 2 objects probed, all present/removed as the file specifies |
| `20260617160000` | `20260617160000_self_leave_reverts_category.sql` | FUNCTION,DATA_OP | 1 objects probed, all present/removed as the file specifies |
| `20260624140000` | `20260624140000_reservation_super_admin_delete_policy.sql` | POLICY | 1 objects probed, all present/removed as the file specifies |
| `20260624160000` | `20260624160000_service_request_super_admin_delete_policy.sql` | POLICY | 1 objects probed, all present/removed as the file specifies |
| `20260704120000` | `20260704120000_fn_cl_admin_reset_allocation.sql` | FUNCTION,DATA_OP | 1 objects probed, all present/removed as the file specifies |
| `20260714041700` | `20260714041700_drop_mission_map_superseded.sql` | TABLE_DROP | 1 objects probed, all present/removed as the file specifies |
| `20260720080000` | `20260720080000_sf100_stall_grace_reset.sql` | COLUMN_ADD,DATA_OP | 1 objects probed, all present/removed as the file specifies |
| `20260723080000` | `20260723080000_ai_pulse_domain_starter_autorevert.sql` | FUNCTION | 1 objects probed, all present/removed as the file specifies |
| `20260723210000` | `20260723210000_ai_pulse_remove_domain_starter_tamil_gate.sql` | FUNCTION | 1 objects probed, all present/removed as the file specifies |
| `20260724010000` | `20260724010000_remove_batch_allocations_rpc.sql` | FUNCTION,DATA_OP | 1 objects probed, all present/removed as the file specifies |
| `20260724120000` | `20260724120000_fix_reset_allocation_batch_dependent_fks.sql` | FUNCTION,DATA_OP | 1 objects probed, all present/removed as the file specifies |
| `20260728010000` | `20260728010000_hr_leave_applications_fresh_start_purge.sql` | TABLE,DATA_OP | 1 objects probed, all present/removed as the file specifies |
| `20260729` | `20260729_billing_delete_super_admin_only.sql` | FUNCTION,POLICY,DATA_OP | 4 objects probed, all present/removed as the file specifies |
| `20260730120000` | `20260730120000_purge_bds_dental_1year_ay2025_26_billing.sql` | TABLE,DATA_OP | 8 objects probed, all present/removed as the file specifies |
| `20260730180000` | `20260730180000_delete_bds1y_bills_except_transport.sql` | TABLE,DATA_OP | 9 objects probed, all present/removed as the file specifies |
| `20260731102000` | `20260731102000_school_master_drop_management_type.sql` | COLUMN_DROP | 1 objects probed, all present/removed as the file specifies |
| `20260804140000` | `20260804140000_ims_item_delete_and_duplicate_guard.sql` | FUNCTION,DATA_OP | 3 objects probed, all present/removed as the file specifies |
| `20260807160000` | `20260807160000_purge_duplicate_cancelled_bills.sql` | TABLE,DATA_OP | 1 objects probed, all present/removed as the file specifies |
| `20260807170000` | `20260807170000_purge_cancelled_hostel_upgrade_bills.sql` | TABLE,DATA_OP | 2 objects probed, all present/removed as the file specifies |
| `20260807180000` | `20260807180000_purge_bds_dental_billing_years234_crri.sql` | TABLE,DATA_OP | 8 objects probed, all present/removed as the file specifies |
| `20260808100100` | `20260808100100_pde_submission_delete_cleanup.sql` | FUNCTION,COLUMN_ADD,INDEX,DATA_OP | 4 objects probed, all present/removed as the file specifies |
| `20260810170000` | `20260810170000_hr_recruitment_purge_rejected_applicant.sql` | FUNCTION,TABLE,POLICY,INDEX,DATA_OP | 7 objects probed, all present/removed as the file specifies |

---

## Appendix — SQL and commands, verbatim

### File census (uses the repo's own version rule, not a 14-digit grep)

The repo tool is `scripts/ci/check-migration-version-collision.mjs`. Its `--all` mode reads the **checked-out** tree via `git ls-files`; this clone sits on a foreign branch carrying only 835 migration files, so running it in the repo root would have censused the wrong tree. It was therefore run from a detached checkout of `jicate/main`:

```bash
git worktree add --detach .claude/worktrees/ledger-recon jicate/main
cd .claude/worktrees/ledger-recon
node scripts/ci/check-migration-version-collision.mjs --all
# Migration version collision — AUDIT of the full repo
# 2267 migration file(s), 300 duplicate version group(s), 874 file(s) inside one.
git worktree remove .claude/worktrees/ledger-recon    # cleaned up after the run
```

The tool's own version rule — reproduced below — was also applied directly to `git ls-tree jicate/main` for the per-file joins in this document. Both routes agree on 2,267 / 300 / 874:

```js
// verbatim from scripts/ci/check-migration-version-collision.mjs
const isMigration = p =>
  p.startsWith('supabase/migrations/') && p.endsWith('.sql') &&
  !p.slice('supabase/migrations/'.length).includes('/');

function versionOf(p) {
  const b = p.slice(p.lastIndexOf('/') + 1);
  const u = b.indexOf('_');
  return u === -1 ? b.replace(/\.sql$/, '') : b.slice(0, u);
}
// sourced from: git ls-tree -r --name-only jicate/main -- supabase/migrations/
```

### Ledger census and provenance

```sql
SELECT count(*) AS ledger_rows,
       count(DISTINCT version) AS distinct_versions,
       min(version), max(version)
FROM supabase_migrations.schema_migrations;
-- 2424 | 2424 | 20250428044802 | 20260813010000

SELECT COALESCE(created_by,'(null)') AS created_by,
       count(*) AS rows,
       count(*) FILTER (WHERE statements IS NOT NULL AND array_length(statements,1) > 0) AS with_statements
FROM supabase_migrations.schema_migrations
GROUP BY 1 ORDER BY 2 DESC;
-- aiengineering@jkkn.ac.in | 2243 | 2243
-- (null)                   |   91 |   15
-- sroja@jkkn.ac.in         |   90 |   90
```

### Live catalog snapshots used for object verification

```sql
SELECT DISTINCT p.proname FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public';            -- 2213

SELECT c.relname FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p');                               -- 1482 tables

SELECT c.relname FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('v','m');                               -- 91 views/matviews

SELECT schemaname, tablename, lower(policyname) FROM pg_policies;                      -- 3749 (105 in storage)
SELECT indexname FROM pg_indexes WHERE schemaname = 'public';                          -- 5626
SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema = 'public';                                                       -- 21679
```

> `pg_policies` must be queried **without** a `schemaname='public'` filter. Filtering it hides all 105 storage-schema policies and manufactures false "unapplied" verdicts — this was a real defect in the first pass of this audit.

### Overload-level check that overturned two verdicts

```sql
SELECT p.proname, count(*) AS overloads,
       string_agg(pg_get_function_identity_arguments(p.oid), ' || ' ORDER BY p.oid) AS signatures
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_seat_analytics','fn_induction_create_program','fn_induction_preview_enroll')
GROUP BY 1;
-- get_seat_analytics            | 1 | p_institution_id uuid, p_program_start_year integer
-- fn_induction_create_program   | 1 | (14 args)
-- fn_induction_preview_enroll   | 1 | (8 args)
-- The files drop (uuid,uuid), an 11-arg form and a 5-arg form respectively — all already gone.
```

### Targeted probes behind list B

```sql
SELECT 'tbl:iqac_cac_metric_map', to_regclass('public.iqac_cac_metric_map')::text            -- NULL
UNION ALL SELECT 'tbl:bos_letterhead_assets', to_regclass('public.bos_letterhead_assets')::text -- NULL
UNION ALL SELECT 'tbl:hostel_program_room_eligibility', to_regclass('public.hostel_program_room_eligibility')::text -- NULL
UNION ALL SELECT 'fn:fn_college_is_missing_data_day',
  (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_college_is_missing_data_day')                  -- 0
UNION ALL SELECT 'col:procurement_quotation_items.offered_spec',
  (SELECT count(*)::text FROM information_schema.columns
   WHERE table_schema='public' AND table_name='procurement_quotation_items'
     AND column_name='offered_spec')                                                          -- 0
UNION ALL SELECT 'col:teaching_enterprise_cohorts.last_synced_at',
  (SELECT count(*)::text FROM information_schema.columns
   WHERE table_schema='public' AND table_name='teaching_enterprise_cohorts'
     AND column_name='last_synced_at')                                                        -- 0
UNION ALL SELECT 'pol:staff_plan_courses write perms',
  (SELECT count(*)::text FROM pg_policies WHERE schemaname='public'
     AND tablename='staff_plan_courses' AND policyname ILIKE '%_permission')                  -- 1 (SELECT only)
UNION ALL SELECT 'pol:storage card_scans',
  (SELECT count(*)::text FROM pg_policies WHERE schemaname='storage'
     AND policyname ILIKE '%card_scans%')                                                     -- 0
UNION ALL SELECT 'idx:ix_pta_one_accountable',
  (SELECT count(*)::text FROM pg_indexes WHERE schemaname='public'
     AND indexname='ix_pta_one_accountable');                                                 -- 0
```

### Blast-radius query for the billing wipe

```sql
SELECT 'billing_student_bills', count(*) FROM billing_student_bills   -- 11196
UNION ALL SELECT 'billing_receipt_items', count(*) FROM billing_receipt_items -- 5855
UNION ALL SELECT 'billing_receipts',      count(*) FROM billing_receipts      -- 3926
UNION ALL SELECT 'billing_categories',    count(*) FROM billing_categories    -- 25
UNION ALL SELECT 'billing_invoice_items', count(*) FROM billing_invoice_items -- 2
UNION ALL SELECT 'billing_invoices',      count(*) FROM billing_invoices      -- 2
UNION ALL SELECT 'billing_discounts',     count(*) FROM billing_discounts     -- 0
UNION ALL SELECT 'billing_refunds',       count(*) FROM billing_refunds;      -- 0
```

### Pre-flight-guard classification (how the self-defending split was computed)

For each destructive candidate: locate the offset of the first `DELETE FROM`/`TRUNCATE` after stripping comments, then count `RAISE EXCEPTION` occurrences before and after it. A pre-flight abort must precede the first destructive statement; anything after it can only confirm that the destruction happened.

```js
const code = sql.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
const firstDestroy = (/\b(DELETE\s+FROM|TRUNCATE)\b/i.exec(code) || {}).index ?? -1;
const raises = [...code.matchAll(/RAISE\s+EXCEPTION/gi)].map(m => m.index);
const preflight = raises.filter(i => i < firstDestroy).length;   // a real guard
const posthoc   = raises.filter(i => i > firstDestroy).length;   // confirms the wipe
// unconditional destroys: destructive statements carrying no WHERE
const stmts = [...code.matchAll(/\b(DELETE\s+FROM|TRUNCATE)[\s\S]*?;/gi)].map(m => m[0]);
const unguarded = stmts.filter(x => !/\bWHERE\b/i.test(x)).length;
```

**This is a positional heuristic, not a semantic one.** A `RAISE EXCEPTION` inside a `CREATE FUNCTION` body sits before the first delete textually but guards nothing at migration time. The three billing purges were read by hand and their guards are genuine; the rest of the twelve are positional classifications and are labelled as such in the body.

### A methodological trap worth recording

`comm` compares pre-sorted files and honours the **current locale**. Sorting with `LC_ALL=C sort` and then running `comm` without `LC_ALL=C` yields silently wrong set differences. Every set operation in this audit was cross-checked with a locale-independent `awk` hash join, and both agreed at 98 overlapping versions.

---

*Produced read-only on 2026-08-05. No production write, no `db push`, no workflow dispatch was performed. Counts drift — this database has many concurrent writers, so re-verify any specific fact immediately before acting on it.*
