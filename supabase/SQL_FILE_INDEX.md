# Supabase SQL File Index

## ⚠️ IMPORTANT: SINGLE SOURCE OF TRUTH

**This is the ONLY place to track all SQL files. DO NOT create duplicate SQL files.**

## 📝 Recent Changes

- **2026-07-26** — **RACI invariants enforced at the DB on `project_task_assignees`** (`20260726121724_project_task_assignees_raci_db_constraints.sql`; **NOT YET APPLIED — apply to PROD via Management API after merge**; deploys ship code, not migrations). Backs the two RACI invariants that `TaskAssignmentService.assign()` (`lib/services/projects/task-service.ts`) previously enforced ONLY in app code via a non-concurrency-safe delete-then-insert. **TIER-1 ADDITIVE / DROPS-NOTHING.** Verified via Management API before authoring: table has **0 rows** (no existing violations). Adds **one** new index — `ix_pta_one_accountable`, a **partial UNIQUE index on `(task_id) WHERE role='accountable'`** — the real gap (there was no DB guard against two Accountables on one task; a race could leave two). The "one RACI role per person per task" invariant is **already** enforced by the pre-existing `uq_project_task_assignees UNIQUE (task_id, staff_id)`, so the spec's `ix_pta_unique_person` is created ONLY by a guarded `DO` block on environments lacking any unique on `(task_id, staff_id)` — on prod it is a **documented no-op** (no redundant duplicate index; dry-run confirmed 0 created). No CHECK added: `project_task_assignees_role_check` **already** restricts `role` (to `owner`/`collaborator`/`responsible`/`accountable`/`consulted`/`informed` — legacy owner/collaborator kept for back-compat, per `20260719120000`). Idempotent (`IF NOT EXISTS` + guarded create). Validated with a `BEGIN…ROLLBACK` dry-run on the live schema: index count 4→5 in-txn, guarded block correctly skipped, nothing persisted. The app's delete-then-insert stays as friendly UX; the DB is defense-in-depth (a racing concurrent assign now raises 23505 instead of corrupting state).

- **2026-07-25** — **Billing reports: accommodation filter + cohort institution-scope fix** (`20260725160000_billing_reports_accommodation_filter.sql`; **ALREADY APPLIED TO PROD** 2026-07-25 ~14:15 IST via Management API). **⚠️ NOT ADDITIVE — THIS DROPS AND RECREATES ALL SEVEN FUNCTIONS FROM `20260725103000`.** The DROPs are mandatory, not incidental: adding a parameter CHANGES each signature, and `CREATE OR REPLACE` with a changed arg list creates a **second overload** rather than replacing. Since every parameter has a DEFAULT, PostgREST could not then disambiguate and every RPC call would fail with **"function is not unique" (42725)**. Post-apply verified **exactly 7 such functions exist, not 14**, and 0 anon EXECUTE grants. Adds `p_accommodation_codes text[]` to the cohort helper and all six RPCs — a **multi-select** over `accommodation_types.code` (`hostel` 990 / `dayscholar` 5,470 / `pg` 0 / `not_applicable` 1). **NULL `accommodation_type_id` is EXCLUDED whenever any code is ticked** (501 learners): "not recorded" is deliberately NOT "not applicable", a **deliberate asymmetry** with the scheme filter's `other` bucket which DOES sweep up NULL `scholarship_type` — do not harmonise them. Verified by invariant rather than absolute count (the DB gains rows mid-session): `unfiltered − all_four = 501`, stable across rehearsal and post-apply. **ALSO FIXES** a whole-branch-review finding: `billing_report_student_cohort` **no longer takes or filters `p_institution_ids`**. Each RPC already scopes its own FACT table (`b`/`r`/`inv.institution_id = ANY(v_inst)`), which is authoritative; filtering the LEARNER's institution as well **DROPPED rows outright** wherever a learner's profile institution differed from their bill's. Scope re-traced post-apply across all six (discounts confines via `bill_id`→bills, refunds via `receipt_id`→receipts — neither ever depended on the cohort) plus a live impersonation test: 1 distinct institution, 0 leaked rows. **New cohort signature: `(uuid, uuid, uuid, uuid, uuid, text[], text[])`** — the previous `(uuid[], uuid, uuid, uuid, uuid, uuid, text[])` NO LONGER EXISTS. The helper remains deliberately `LANGUAGE sql` with **no `SET search_path`** and **not SECURITY DEFINER** so PostgreSQL still inlines it; `get_advisors` flags this as `function_search_path_mutable` and that advisory is **wrong for this function**. ACL: REVOKE anon+PUBLIC / GRANT authenticated+service_role on all 7. `NOTIFY pgrst`.

- **2026-07-25** — **/billing/reports hierarchy + student-category filter RPCs** (`20260725103000_billing_reports_filter_rpcs.sql`; **ALREADY APPLIED TO PROD** 2026-07-25 ~11:55 IST via Management API, after a BEGIN…ROLLBACK rehearsal of the dashboard aggregate under an impersonated `billing.reports.view` holder). **TIER-1 ADDITIVE / DROPS-NOTHING, 7 new functions, no schema change.** ⚠️ **SUPERSEDED by `20260725160000` (2026-07-25), which DROPPED and recreated all seven of these functions with an added `p_accommodation_codes text[]` and removed `p_institution_ids` from the cohort helper. The signatures described below NO LONGER EXIST — see that entry.** Gives `/billing/reports` (all six tabs) the Schedule-Management filter set — institution, academic year, degree, department, program, semester, section, billing category — plus a **multi-select** government-scheme filter (First Graduate / PMSS / 7.5% Scholarship / **Others**). The academic hierarchy lives ONLY on `learners_profiles`, so every billing table reaches it via `student_id`; `billing_report_student_cohort(uuid[],uuid,uuid,uuid,uuid,uuid,text[])` resolves that cohort once and each RPC JOINs it. That helper is deliberately `LANGUAGE sql` with **NO `SET search_path` and NOT SECURITY DEFINER** — PostgreSQL only inlines a set-returning SQL function when `proconfig IS NULL` and `prosecdef` is false; verified post-apply. (Also verified: a **sub-SELECT argument** defeats inlining because each param is referenced twice in the body — pass literals/plpgsql vars, never `(SELECT …)`.) Cohort counts verified on prod: FG 1,449 / PMSS 435 (three more than `scholarship_type` alone — `quotas.code='pmss'` catches them) / 7.5% 204 / Others 4,873, all four = 6,961 = every learner, 0 double-counted; `COALESCE` guards are load-bearing since `scholarship_type` is NULL for 65. Six report RPCs — `get_billing_reports_{outstanding,collection,invoices,discounts,refunds,dashboard}` — all SECURITY DEFINER, gated on `user_has_permission('billing.reports.view')` (42501) and scoped by `get_user_accessible_institutions(auth.uid())` hoisted once into `v_inst` (never a DEFINER fn in a WHERE clause — see the 2026-07-10 SCF entry). `billing_discounts` routes via `bill_id`, `billing_refunds` via `receipt_id` (neither has `institution_id`); category/academic-year reach receipts and invoices through an **EXISTS semi-join**, NOT a join, so a receipt allocated across several bills stays ONE row and totals are not multiplied. All five list RPCs paginate server-side with `COUNT(*) OVER()` as `total_count` and **unique ORDER BY tiebreakers** — added after review found 999 receipts sharing one `receipt_date` and 9 dates exceeding a page, which made OFFSET paging non-deterministic (rows could appear twice or vanish while `total_count` looked correct). `get_billing_reports_dashboard` returns one jsonb filling `BillingDashboardMetrics` exactly (10 keys, shape-complete in the zero-scope branch too), replacing ~15 client round-trips. ACL: **REVOKE EXECUTE FROM anon, PUBLIC / GRANT TO authenticated, service_role** — verified 0 anon grants on all 7 post-apply. `NOTIFY pgrst`. Spec: `docs/superpowers/specs/2026-07-25-billing-reports-filters-design.md`; plan: `docs/superpowers/plans/2026-07-25-billing-reports-filters.md`. Frontend (service/hooks/filter panel/pagination) lands separately.
- **2026-07-25** — **AI NAAC narrative drafter — DARK substrate** (`20260725071500_accreditation_naac_narrative_drafter.sql`; **NOT yet applied — Director applies after a BEGIN…ROLLBACK rehearsal**; validated in one this session: `new_fns=4 anon_exec=0 job_enabled=f rls=t/t`, then rolled back — prod untouched). **TIER-1 ADDITIVE / IDEMPOTENT / DROPS-NOTHING.** Grounded, human-verified per-metric NAAC narrative drafting on the ₹0 Max lane. NEW tables: `accreditation_metric_owners` (institution×body×metric → owner Senior Learner, RLS via `accreditation.naac.narrative.view/manage`) and `accreditation_metric_narratives` (the AI draft + `grounding_verdict` + `ungrounded_tokens` + citations + the `ai_drafted→owner_okayed→principal_approved→director_submitted` workflow with a `revision_requested` loop; owner_user_id NULLABLE = IQAC/admin queue; UNIQUE(institution,body,metric,period); RLS SELECT = owner OR `narrative.view`+institution scope OR admin). 4 SECURITY DEFINER fns, **all REVOKE EXECUTE FROM anon, PUBLIC**: `fn_accreditation_resolve_metric_owner` (→authenticated,service_role; never-orphan fallback owner→committee chair→NULL), `fn_accreditation_narrative_awaiting` + `fn_accreditation_record_narrative_draft` (→**service_role only**; cron work-list + idempotent upsert that never clobbers human-touched rows), `fn_accreditation_narrative_transition` (→authenticated; the approval state-machine + the **ungrounded-can-never-advance fraud gate**). NEW `ai_job_types` row `accreditation.naac_narrative_draft` (lane='max', **enabled=false = DARK**; go-live = flip enabled, no deploy; ON CONFLICT never re-touches `enabled`). Functions stay migration-authoritative (pointer only in `02_functions.sql`, mirroring the scf-note-judge precedent). Anti-hallucination gate is a pure TS validator (`lib/services/accreditation/grounding-validator.ts`, 10 unit tests) that rejects any number/date/course-code not traceable to the metric's `quality_evidence_mappings` rows. Cron `app/api/cron/accreditation-naac-narrative-draft` (nightly, Bearer-only). Spec `specs/accreditation-narrative-drafter-plan-2026-07-25.md`.
- **2026-07-25** — **RCLTP review queue: most-needed-first priority + weekly enforced spot-check** (`20260725080000_rcltp_batch_approve_and_spotcheck.sql`; **NOT yet applied — Director gates the apply. Rehearsed in a BEGIN…ROLLBACK txn 13/13, prod verified untouched afterwards**). **TIER-1 ADDITIVE / IDEMPOTENT / DROPS-NOTHING.** Serves locked decisions #5 and #7 of `specs/senior-learner-ai-offload-decisions-2026-07-25.md`. Adds (a) `fn_rcltp_passage_review_priority(uuid)` — one row per visible passage with `draft_count` / `ai_agreed_count` / `attention_count` / `at_risk_count` / `next_scheduled_at` plus a server-computed `priority_rank`, so the ordering rule lives in exactly one place and the console never re-implements the comparator; the at-risk rule is copied **verbatim** from `fn_rcltp_at_risk_learners` (latest result per learner, `overall_band='emergent'` OR score regression) rather than defining a second, divergent notion of at-risk. (b) `rcltp_review_spotchecks` table (unique on `reviewer_id, week_start, question_id`) with RLS **SELECT-only** — deliberately NO insert/update/delete policy, so a reviewer cannot self-sample a friendlier set or quietly stamp their own row via PostgREST; all mutation goes through the RPCs. (c) `fn_rcltp_spotcheck_week()` — self-healing weekly sampler (first call in a week draws, later calls return the same rows; no scheduler that can silently stop), drawing from AI-drafted questions **that reviewer personally approved** in the preceding 7 days. (d) `fn_rcltp_spotcheck_resolve(uuid,text,text)` — scoped to the caller's own PENDING row, so no cross-reviewer resolve and no silent re-stamp. Sample size is a `platform_policies` row `rcltp.review.spotcheck_weekly_sample` (=3) read via `fn_get_policy_int`, per the config-table rule; inserted with `WHERE NOT EXISTS` because the table's uniqueness is an **expression** index (`policy_key, scope_type, COALESCE(scope_id,'000…')`) that a bare `ON CONFLICT` column list does not match. All three functions **REVOKE EXECUTE FROM anon, PUBLIC** (verified `has_function_privilege('anon',…)=false` on each). Boundary-proven by impersonation, not by reading the policy: a real learner is refused both read RPCs, a second reviewer is refused another's item, a double-resolve is refused. **Note:** `rcltp_assessments.scheduled_start` is NULL on all 56 prod rows, so the `next_scheduled_at` dimension is inert today and ranking is driven by `at_risk_count`; it becomes live the moment assessment scheduling is used, with no code change.

- **2026-07-24** — **ID Card bridge heartbeat** (`20260724045622_id_card_agent_status.sql`; **NOT yet applied — orchestrator applies with a BEGIN…ROLLBACK rehearsal first**). **TIER-1 ADDITIVE / IDEMPOTENT / DROPS-NOTHING, no functions.** New singleton table `id_card_agent_status` (`id SMALLINT PK DEFAULT 1 CHECK (id = 1)`, `last_poll_at` + `updated_at` timestamptz) recording the last time the on-prem print bridge polled `GET /api/id-cards/jobs` with a valid agent token. Route updates it fire-and-forget via the service-role client with every error swallowed (at most `console.warn`) — so deploy order between app code and this migration never matters. RLS: SELECT for `is_super_admin() OR is_admin() OR user_has_permission('id_cards.jobs.view')` (mirrors `id_card_print_jobs_admin_view` — exactly the queue viewers), plus a `service_role` ALL policy for the writer. Seeds row `id=1` `ON CONFLICT DO NOTHING` so the route's `UPDATE … WHERE id=1` always has a target. Read by the print-queue UI chip: last poll ≤120 s → green "Print bridge online"; older → red "Print bridge silent since <relative time>"; row missing/error → neutral "Bridge status unknown" (refreshes every 30 s via the browser client). Mirrored into `setup/01_tables.sql` + `setup/03_policies.sql` with dated comments.

- **2026-07-23** — **ID Card substrate v2 — universal profiles anchor** (`20260723061500_id_card_profiles_anchor.sql`; **ALREADY APPLIED TO PROD** 2026-07-23 ~06:50 IST via Management API after BEGIN…ROLLBACK rehearsal 12/12; post-apply verify 12/12). Director decision: ID cards for EVERYONE (learners + Senior Learners + team members), anchored on `profiles` (universal person table, `profiles.id == auth.users.id`). `id_card_print_jobs.student_id` (FK learners_profiles) **DROPPED** → `profile_id` (FK profiles, ON DELETE CASCADE) — clean swap, table was empty. Self-view RLS collapses to `profile_id = auth.uid()` + `id_cards.my-cards.view` (old belt+suspenders learner policy dropped; storage self-view now keyed by `<profile_id>/` path). `my-cards.view` seeded to `faculty`/`hod`/`principal`/`staff` roles (verified present). `id_card.photo_fallback` → 3-element array adding `staff.profile_picture`. Verified pre-change: 0 of 4,180 ACTIVE learners lack profiles; 842/844 team members linked; the 1,089 unlinked learner rows are pre-enrollment pipeline (reserved/enquiry/rejected). Print timing = at/after account activation; inactive people stay printable (registrar judgment) — Director interview 2026-07-23.

- **2026-07-23** — **ID Card substrate (Phase 1A) — rewritten for learners_profiles + dynamic permissions** (`20260507150000_id_card_substrate.sql`; **ALREADY APPLIED TO PROD** 2026-07-23 ~06:06 IST via Management API after a BEGIN…ROLLBACK rehearsal passed 18/18 structural checks). **TIER-1 ADDITIVE.** Original 2026-05-07 draft targeted `public.students` — a table renamed to `learners_profiles` before the PR opened, so it never applied; rewrite points every FK/RLS join at `learners_profiles`, drops the redundant `photo_url` column-add (canonical `learners_profiles.student_photo_url` already exists). Adds `id_card_templates` + `id_card_print_jobs` tables, `student-photos` private storage bucket (5MB, png/jpeg), `fn_get_id_card_policy(uuid)` reader (SECURITY DEFINER, **REVOKE anon+PUBLIC**, institution>global scope precedence), 11 `platform_policies` seeds (`id_card.%`, data_type per current CHECK vocabulary: string/number/boolean/array), 14 RLS policies all via `user_has_permission('id_cards.*')` + `is_super_admin()/is_admin()` (zero hardcoded role names). Learner self-view = belt+suspenders (`profiles.learner_id` UUID link OR `college_email` match). Seeds 7 `id_cards.*` permission keys to registrar + admission (admin set) and `student` (`my-cards.view`) — note prod role_keys are `admission`/`student`; `admission_admin`/`learner` do not exist.

- **2026-07-12** — **Reference external API: per-catalog opt-in + service-role read fns** (`20260712070000_reference_external_api.sql`; **ALREADY APPLIED TO PROD** ~07:00 IST after BEGIN…ROLLBACK validation: directory=27, active-only rows, switched-off catalog raises CATALOG_NOT_AVAILABLE, 0 anon/authenticated grants). **TIER-1 ADDITIVE.** `reference_catalogs.api_enabled BOOLEAN DEFAULT false` + `fn_reference_api_catalogs()` / `fn_reference_api_rows(text,text,int,int)` — SECURITY DEFINER, **GRANT service_role ONLY** (REVOKE anon+authenticated+PUBLIC); active-entries-only; projection excludes created_by/updated_by; unknown and switched-off catalogs indistinguishable (both 404). Seeded 27 safe vocabulary catalogs ON per Director interview (read-only, per-catalog opt-in, hide-inactive); explicitly OFF: school_master, mess_caterers, custom_roles, privilege_*, okr sources, payroll, committees, billing_categories. Consumed by app/api/reference/catalogs[/[catalog]] routes (Bearer api_keys auth).

- **2026-07-12** — **Reference engine v2: select/fk fields + full catalog sweep** (`20260712000100_reference_engine_select_fk.sql` + `20260712000200_reference_catalog_sweep.sql`; **BOTH ALREADY APPLIED TO PROD** 2026-07-12 ~00:05 IST via Management API after a BEGIN…ROLLBACK validation batch: fk options, fk write via castes→community_categories, enum write via billing kind, new-catalog browse — all passed). **TIER-1 ADDITIVE.** Engine: `fn_reference_catalog_upsert` v2 extends the field allowlist to enum + uuid columns (cast types from pg_catalog, never the client); NEW `fn_reference_catalog_fk_options(text,text)` serves fk dropdown options with the target table resolved from the REGISTRY field config (#1926 discipline); both REVOKE anon+PUBLIC. Sweep: 39 new catalogs from a 1,242-table classification (14 generic / 17 readonly / 8 linked; conservative promotion — generic only when every required column is coverable) + 5 graduations to generic now that dropdowns exist (castes fk, billing_categories kind-enum + frequency CHECK-vocabulary select, bos_member_types institutions fk, hr_attendance_status_types, internship_site_types). Registry now 81 catalogs. UI PR pending (select/fk dialog + hub index rail).

- **2026-07-11** — **Reference / Masters hub registry** (`20260711221500_reference_masters_registry.sql`; **ALREADY APPLIED TO PROD** 2026-07-11 ~22:20 IST via the Management API — validated first in a full BEGIN…ROLLBACK batch with 6 impersonated tests: cards/browse/insert/update+stamp/readonly-write-blocked/student-denied, all passed). **TIER-1 IDEMPOTENT / ADDITIVE / DROPS-NOTHING.** New `reference_catalogs` registry table (config-table pattern) + 3 SECURITY DEFINER RPCs — `fn_reference_catalog_cards()` (hub cards + live counts in one call), `fn_reference_catalog_rows(text,text,int,int)` (generic browse, projection allowlisted per registry row), `fn_reference_catalog_upsert(text,uuid,jsonb)` (generic add/edit, fields allowlisted per registry row; NO delete by design — is_active deactivation only). Client passes catalog_key ONLY, never a table name (binds to stored catalog row per #1926 lesson). Permission gates INSIDE each RPC: `is_super_admin() OR is_admin() OR user_has_permission(per-catalog view/manage permission)`; new keys `reference.catalogs.view` / `reference.catalogs.manage`. ACL: **REVOKE EXECUTE FROM anon, PUBLIC / GRANT TO authenticated, service_role** (verified 0 anon grants post-apply). Seeded 42 catalogs across 10 groups (generic/linked/readonly modes), guarded by NOT EXISTS on catalog_key (identity), not ON CONFLICT on a mutable column. UI: `/reference` hub + `/reference/[catalog]` generic browser (PR pending).

- **2026-07-10** — **Feeder visit-nudges: ALL assigned schools** (`20260710120500_feeder_nudge_all_assigned.sql`; **ALREADY APPLIED TO PROD** 2026-07-10 via the Management API — this migration RECORDS production so the repo is not amnesiac). **TIER-1 IDEMPOTENT / ADDITIVE / DROPS-NOTHING.** Director decision: the daily nudge (route `app/api/schools-network/visit-nudges/cron/route.ts`, 04:13 UTC) goes to **ALL assigned schools**, not only slipping/overdue ones — `fn_schools_network_nudge_candidates(integer)` rewritten to drop the `nudge_eligible` filter and instead classify each candidate (`slipping_and_overdue` / `slipping` / new **`assigned`**) so the route keeps message/priority differentiation. Safety rails unchanged: skips done schools and those inside the `p_realert_days` window (`last_nudged_at`). Release mechanism: `last_nudged_at=NULL` on all 74 `school_visit_assignments` → first full run 2026-07-10 ~09:43 IST delivered **74/74** (74 `notifications` + 74 `user_notifications` fanout rows to 46 coordinators, every row stamped). ACL re-asserted: **REVOKE EXECUTE FROM anon, PUBLIC / GRANT TO authenticated, service_role**. Known follow-up (route code, needs deploy — not in this record): `bodyFor()` predates the `assigned` reason and falls through to the "no visit in 60+ days" text for those schools.

- **2026-07-10** — **SCF leadership permission gates** (`20260731110000_scf_leadership_permission_gates.sql`; **ALREADY APPLIED TO PROD** 2026-07-09/10 via the Management API — this migration RECORDS production so the repo is not amnesiac). **TIER-1 IDEMPOTENT / ADDITIVE / DROPS-NOTHING.** 13 SCF leadership read-functions (15 signatures) re-gated off a hardcoded `profiles.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator'])` list — which **ignored `user_roles`, `custom_roles` and every permission toggle, so Role Management could not grant these panels at all** (a CEO holding `academic.attendance.dashboard.view` was still refused) — onto `user_has_permission()` with **two NEW keys**: `academic.session_feedback.leadership.view` (11 college-level panels) and `academic.session_feedback.learner_detail.view` (learner trajectory + struggling notes; **narrower — HoDs excluded by design**). Tenant scope now uses `role_has_institution_access()` (honours Institution Scope + per-user grants). **PERF:** a SECURITY DEFINER fn in a `WHERE` clause runs **once per row** — that turned a 54ms HoD query into **55,847ms** and broke the panel for 64 HoDs; allowed institutions are hoisted once into `v_insts uuid[]` and filtered with `= ANY(v_insts)`. `fn_scf_escalation_followups` **10,529ms -> 233ms** and `fn_scf_admin_faculty_summary` **5,253ms -> 202ms** by hoisting two correlated `staff` sub-queries into `MATERIALIZED` CTEs (`staff` is indexed on `email` but **not** `lower(email)`); both proven **row-identical via `EXCEPT ALL` both ways**. **NEW 3-arg overloads** `fn_scf_admin_trend(date,date,uuid)` / `fn_scf_loop_activity(date,date,uuid)` added **beside** the 2-arg ones (third arg has **no default**, so `fn(from,to)` stays unambiguous and deployed code keeps working; nothing dropped) + `NOTIFY pgrst`. All 15 signatures **REVOKE EXECUTE FROM anon, PUBLIC** / **GRANT TO authenticated**. Verified by impersonation on prod: ceo + executive_admin_officer DENIED→ALLOWED (6 colleges); administrator/hod/principal keep access, correctly scoped; faculty/student stay DENIED; **89 existing users, 0 regressions**. Keys registered in `lib/constants/permissions.ts` (PR #1930) so they appear in Role Management. **NOT included (deliberate):** `fn_scf_verdict_contradictions` / `fn_scf_verdict_track_record` (same defect, different page) and the **6 write/authorization functions** (`fn_curriculum_lesson_upsert`, `fn_live_poll_can_manage`, `fn_scf_open_pulse`, `fn_scf_set_verdict`, `_fn_curriculum_class_ctx`, `_fn_live_poll_ensure_class_anchor`) — re-gating a **write** on a **view** permission would let anyone who can read a dashboard edit lesson plans; they need their own write keys.

- **2026-07-10** — **Induction: fresher-reported mentor helpfulness + honesty cross-check** (`20260710160000_induction_mentor_helpfulness_feedback.sql`; **ALREADY APPLIED TO PROD** 2026-07-10 via the Management API — this migration RECORDS production; PR #1929). **TIER-1 IDEMPOTENT / ADDITIVE / DROPS-NOTHING.** Measures whether the Senior Peer Mentor programme helps first-years by asking the freshers themselves: NEW table `induction_mentor_month_feedback` (one 1-5 rating + optional comment per fresher per monthly check-in session, `UNIQUE(session_id, learner_id)`, `volunteer_id` snapshotted at rating time so reassignment doesn't rewrite history; RLS admin-only, real access via DEFINER RPCs — same posture as day/program feedback). 3 RPCs, all **REVOKE EXECUTE FROM anon, PUBLIC / GRANT TO authenticated**: `fn_induction_my_mentor_checkins` (fresher, self-scoping — empty until a mentor group assignment exists AND a check-in has come due), `fn_induction_submit_mentor_month_feedback` (fresher upsert; validates rating 1-5, session kind `mentor_checkin`, due-date passed, enrollment, current mentor assignment; institution bound to the EVENT not a caller param), `fn_induction_mentor_helpfulness_crosscheck` (admin/coordinator-only 3-way gate — the QUIET honesty check: per mentor per month, avg fresher rating vs whether the mentor actually marked that session's attendance; **flagged = avg ≥4 with NO recorded mentor activity** — polite ratings of absent mentors surfaced, not trusted; deliberately NOT visible to freshers so it can't be gamed). Feature is naturally dark until the 15 Aug 2026 monthly check-in beats — correct, not a bug. UI: fresher card on `/learners/my-induction`, cross-check panel on the Senior Peer Mentors console.

- **2026-07-06** — **Cohort Core** **Phase 7 M3–M7 — THE MOAT (self-improving loop)** (PLAN.md Phase 7 · M1/M3–M7; **NOT yet applied to prod** — PR-staged in `feat/cohort-moat-m3-m7`; **CERTIFIED by a sandboxed 2-cycle sim** run in a rolled-back transaction against prod). **4 migrations, all TIER-1 ADDITIVE/IDEMPOTENT/DROPS-NOTHING.** **(1) `20260731092000_cohort_blended_score.sql` (M7.1):** the measurement heart. `fn_cohort_blended_score(kind,member_type,member_ref)` (SECURITY DEFINER, **REVOKE anon/PUBLIC/authenticated** — trigger-only, direct grant would leak any enrollment's revenue cross-tenant) — a VERSIONED (`sf100.v1`) equal-weight estimator over {success-rate=active_paid_users/paid_user_target, verified-revenue=total_revenue/(target×min_txn), speed=target-hit?1−elapsed_frac:0}, each clamped [0,1], applied to BOTH baseline (SF100 `seed_*` cols, t=0) AND outcome (final aggregates); returns `{blended_baseline,blended_outcome,lift,components,inputs,estimator_version}`; non-sf100 kinds → `{scored:false, lift:null}`. `o_hit` is DATA-driven (`active_paid_users≥target`), independent of the sf100_enrollments.status enum. Upgrades `fn_capture_cohort_outcome` (trigger fn, in 04_triggers) to CALL it and MERGE the envelope into `outcome_snapshot` — best-effort (estimator error→unscored; whole capture wrapped so it can never roll back the close). **(2) `20260731093000_cohort_experiments.sql` (M7.2 · M6 confound-killer):** `experiment_arm ∈ {control,treatment}` on `cohort_memberships.config` (jsonb, no schema change); NEW table `public.cohort_experiments` (one row/cohort: n_treatment/n_control, treatment_mean_lift, control_mean_lift, **causal_lift = treatment_mean−control_mean** [act on THIS], **naive_lift** [confounded, contrast-only], n_scored, estimator_version, institution_id NOT NULL; UNIQUE(cohort_id)); `fn_assign_experiment_arms_for_cohort` (**SECURITY INVOKER**, deterministic 50/50 via hashtextextended, idempotent) + `fn_compute_cohort_experiment` (**SECURITY INVOKER**, upserts the row, causal_lift NULL unless both arms present). **(3) `20260731094000_cohort_feedforward.sql` (M7.3 · M3/M5/M7):** NEW table `public.cohort_adjustment_proposals` (based_on_cohort_id, target_scope='program', target_id→sf100_programs, causal_lift, decision adopt/revert/inconclusive, proposed_changes jsonb, status pending/approved/rejected/applied, reviewed/applied audit cols, institution_id NOT NULL; **partial unique** one pending proposal/cohort; updated_at trigger). `fn_propose_cohort_adjustments` (**SECURITY INVOKER**; **M5 gate** = only a CLOSED cohort with a non-NULL causal_lift; emits a PENDING proposal promoting `config.experiment.treatment_params` when causal_lift ≥ `fn_cohort_min_actionable_lift()`=0.02, else revert/inconclusive; NEVER mutates the program). `fn_apply_cohort_adjustment_proposal` (**SECURITY DEFINER** — must UPDATE sf100_programs even without a direct program grant; **internal authority gate bound to the PROPOSAL's own institution_id**, `auth.uid() IS NULL`=trusted service context [anon revoked]; **M7 gate** = hard-requires status='approved'; whitelists paid_user_target_delta/hard_deadline_shift_days/min_transaction_amount_delta; marks 'applied'). **(4) `20260731095000_cohort_alumni_mentor.sql` (M7.4 flywheel):** `v_cohort_alumni_mentor_pool` (**security_invoker** VIEW over graduated memberships → eligible mentors; enrol via `CohortService.createMembership(member_type=staff, role=mentor)`, NOT a new DEFINER RPC). **All new fns REVOKE EXECUTE FROM anon, PUBLIC.** **CERTIFICATION (7.5):** a seeded 2-cycle sim (2 control + 2 treatment teams, known deltas) proved control_lift=0.400, treatment_lift=0.833, **causal_lift=0.433 < naive_lift=0.617** (control removed 0.183 of regression-to-mean), decision=adopt, **M7 blocked an un-approved apply**, program target 5→6 (loop closed — cycle N+1 faces the adjusted target), alumni pool=4, **M5 blocked an open-cohort proposer**, arms split 50/50 — then ROLLED BACK (prod untouched, verified). Mirrored into `setup/{01_tables,03_policies,04_triggers,05_views}.sql`; the 7 fns stay migration-authoritative with a pointer in `02_functions.sql`. Reuses the 4 existing `cohort.*` permission keys. TS: services `lib/services/cohort-core/{experiment-service,feedforward-service,alumni-mentor-service}.ts`; hooks `hooks/cohort-core/useMoat.ts` (local `moatKeys`); types appended to `lib/types/cohort-core.ts`. Admin approval UI = documented follow-up. Plan: `docs/cohort-core/PLAN.md`.

- **2026-07-05** — **Cohort Core** M2 **outcome-capture-at-close** (PLAN.md Phase 7 · THE MOAT · **NOT yet applied to prod** — PR-staged in `feat/cohort-moat-m2-outcome-capture`). Migration `20260731091000_cohort_outcome_capture.sql` — **ADDITIVE, IDEMPOTENT, DROPS-NOTHING, NO BACKFILL** (TIER-1). NEW table `public.cohort_outcomes` (`id`, `cohort_id`→cohorts ON DELETE CASCADE, `membership_id`→cohort_memberships **ON DELETE SET NULL** [a LINK, not identity — the baseline survives a membership delete and can never be re-captured], `member_ref` [denormalized identity], `member_type` CHECK team/student/learner/staff, `kind` CHECK sf100/foundations/cdc/trainer, `captured_at`, `outcome_snapshot jsonb`, `source` CHECK trigger/service/backfill/manual, `institution_id` **NOT NULL**→institutions, `created_at`) + 4 indexes + **partial unique** `uidx_cohort_outcomes_membership (membership_id) WHERE membership_id IS NOT NULL` (one baseline per membership — a membership closes exactly once). **Capture mechanism = a DATABASE TRIGGER, not a service call** (PLAN M2: a baseline can't be reconstructed later, so it must be captured no matter which code path performs the close): `fn_capture_cohort_outcome()` (SECURITY DEFINER, `SET search_path=public`, **REVOKE EXECUTE FROM anon, PUBLIC** — invoked only by its trigger, no GRANT needed) + `AFTER UPDATE OF status ON cohort_memberships` trigger `trg_cohort_capture_outcome` with a `WHEN (NEW.status IN ('graduated','removed') AND OLD.status IS DISTINCT FROM NEW.status)` prefilter. Fires only on the transition INTO a terminal status FROM a non-terminal one (3 in-fn guards); snapshots `from/to_status` + role + joined_at + membership config; copies `institution_id`+`kind` from the parent cohort (SKIPS with a `RAISE NOTICE` — never writes a NULL-institution row — if the cohort is tenant-less, closing the `role_has_institution_access(NULL)=TRUE` leak); `ON CONFLICT (membership_id) … DO NOTHING` = idempotent per membership. **RLS** canonical dynamic-permission: SELECT→`cohort.view`+`role_has_institution_access(institution_id)`; INSERT→`cohort.manage`+scope (manual/service capture; the DEFINER trigger bypasses RLS); UPDATE/DELETE **admin-only** (a captured baseline is a tamper-resistant moat record, mirroring `cohort_status_events`). **NO backfill** — already-terminal memberships closed pre-trigger legitimately have no baseline; a `RAISE NOTICE` records the deliberate no-op. `NOTIFY pgrst`. Mirrored into `setup/{01_tables,03_policies,04_triggers}.sql`. Reuses the 4 existing `cohort.*` permission keys (no new key). Read/write service `lib/services/cohort-core/outcome-service.ts` (`CohortOutcomeService` — getOutcomes/getOutcome/getOutcomesByCohort/getOutcomeByMembership + `recordOutcome` manual escape-hatch, RLS-denial→clean 403); hooks `hooks/cohort-core/useCohortOutcomes.ts` (local `cohortOutcomeKeys`). Plan: `docs/cohort-core/PLAN.md`.

- **2026-07-06** — **Cohort Core** **CDC Training demote to extension** (PLAN.md **Phase 4** · kind='cdc'; **NOT yet applied to prod** — PR-staged in `feat/cohort-cdc-demote`). Migration `20260731090000_cdc_training_demote_to_cohort_core.sql` — **ADDITIVE, IDEMPOTENT, DROPS-NOTHING** (TIER-1). Registers the CDC Training container into the canonical cohort spine as an **additive MIRROR** (`public.cohorts` kind='cdc', mapped 1:1 via `cohorts.config->>'cdc_training_programme_id'`) and demotes `cdc_training_enrollments` to a per-learner **extension** via ONE nullable link column `cdc_training_enrollments.cohort_membership_id uuid` → `cohort_memberships(id)` **ON DELETE SET NULL** (a LINK, not identity — never cascade-delete the live extension row that owns attendance/certificate/semester-schedule). **Greenfield** (verified prod: `cdc_training_enrollments`=0 rows, `cdc_training_programmes`=1 row) → **NO backfill** (a `RAISE NOTICE` records the empty state instead of the SF100-style populate/abort); the spine is minted **forward** by the service on first enrol. **L3 race guard:** partial unique index `uq_cohorts_cdc_training_programme ON public.cohorts((config->>'cdc_training_programme_id')) WHERE kind='cdc'`. **3 idempotency guards:** `ADD COLUMN IF NOT EXISTS`; FK guarded on `pg_constraint` inside a `DO` block (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`); indexes `IF NOT EXISTS`. `NOTIFY pgrst`. Mirrored as a guarded ALTER (`DO`/`pg_constraint`) + the two indexes into `setup/01_tables.sql` (CDC DDL is migration-only, like SF100). **member identity = `member_type='learner'`, `member_ref = learner_id`** — the enrollment FK is `learner_id → learners_profiles(id)`, so 'learner' is the exact real identity (the shared `cohort_memberships.member_type` CHECK allows `team/student/learner/staff` but **not** 'trainee', so no shared-constraint change). **Repoint (code, no migration):** `lib/services/cdc/training-service.ts::addEnrollment` gains a **best-effort spine twin** (`try/catch`, log-and-continue — the extension roster stays authoritative): lazy-mint helper `ensureCdcCohortMirror` (institution_id copied FROM the programme container so `role_has_institution_access(NULL)` can never leak; **skips the mirror when the programme's institution_id is NULL** since `cohorts.institution_id` is NOT NULL; L3 = re-select on lookup error, re-select the winner on INSERT 23505), upserts a `cohort_memberships` row (**L4 status fold** `foldCdcMembershipStatus`: enrolled→enrolled, in_progress→active, completed→graduated, dropped→removed — never hardcoded), back-links the enrollment, appends a `cohort_status_events` audit row. **L5 clean wraps:** `app/api/cdc/training/{route,[id]/route,[id]/enrollments/route}.ts` now map RLS denial (42501)→**403**, FK miss (23503)→**400**, dup (23505)→**409** instead of a masked 500. `types/cdc/training.ts` adds the nullable `cohort_membership_id`. **No self-serve carve-out policy** (03_policies untouched): CDC enrolment is **staff-driven** (an admin enrols a learner; `member_ref = learner_id ≠ auth.uid()`, and the programme has no self-join mode field), so — unlike Foundations — there is no `member_ref=auth.uid()` self-insert path; the best-effort twin rides the existing `cohort_memberships_insert_permission` policy (`cohort.create` + institution access). Plan: `docs/cohort-core/PLAN.md`.

- **2026-07-06** — **Cohort Core** **Foundations demote to cohort core** (PLAN.md **Phase 3** · **D5** completion · **D9** identity; **NOT yet applied to prod** — PR-staged in `feat/cohort-foundations`). Migration `20260731080000_foundations_demote_to_cohort_core.sql` — **ADDITIVE, IDEMPOTENT, DROPS-NOTHING** (TIER-1 shape, effectively additive-only: `ss_foundations_cohorts` + `ss_foundations_enrollments` are BOTH **0 rows**). Folds Startup-Studio Foundations onto the shared spine: `public.cohorts` (kind='foundations') is the canonical SPINE container for roster+lifecycle and `public.cohort_memberships` (member_type='student', **member_ref = student's profiles.id**) its roster; `ss_foundations_enrollments` is demoted to a per-student **extension** via ONE nullable link column `cohort_membership_id uuid` → `cohort_memberships(id)` **ON DELETE SET NULL** (a LINK, not identity), FK guarded on `pg_constraint`, reverse index `idx_ssf_enroll_cohort_membership`. **Empty-table simplification vs SF100:** NO backfill (…050000-style), NO populate `UPDATE`, NO abort self-check — replaced by a `RAISE NOTICE`; future rows link FORWARD at enroll-time in the service. **`ss_foundations_cohorts` is NOT dropped or re-keyed** (gotcha #2 — largest blast radius): `ss_foundations_worksheets.cohort_id` + `ss_foundations_responses.cohort_id` FK it and the listWorksheets override mechanism keys off it, so it stays the authoritative DOMAIN container while the service mints a `cohorts` MIRROR per ss cohort (mapped via `config->>'ss_foundations_cohort_id'`, `institution_id` copied — closes the `role_has_institution_access(NULL)` tenant hole; `enrollment_mode`/`lead_mentor_id` go to `cohorts.config` — lead_mentor_id is an `ss_mentors(id)`, NOT `owner_id`). **D9 CHECK** `ss_foundations_enrollments_student_required` = `CHECK (student_id IS NOT NULL)` (guarded on `pg_constraint`; the real member_ref==student_id equality is service-enforced — member_ref is polymorphic). **Self-enrol RLS carve-out (gotcha #1):** new permissive INSERT policy `cohort_memberships_foundations_self_insert` on `cohort_memberships` (`member_type='student' AND member_ref=(select auth.uid()) AND status IN (invited/enrolled/active) AND parent cohort kind='foundations'`) — the self-enrol POST runs AS THE STUDENT (never service-role) and would 403 the membership half without it; graduation stays mentor-gated. `NOTIFY pgrst`. Mirrored as a guarded ALTER into `setup/01_tables.sql` and the carve-out policy into `setup/03_policies.sql`. **Code (no migration):** `lib/services/startup-studio/foundations-service.ts` — additive spine twin: `ensureFoundationsCohortMirror`, `createCohort` mints the mirror, `enroll` gets a **D9 profile-resolve guard (clean 400)** + best-effort membership upsert + back-link + 'enrolled' event, `withdraw` best-effort membership→'removed', new `signOffGraduation` (**D5** — asserts global completion ≥ threshold, marks enrollment `completed`, best-effort membership→'graduated' + event, notifies). Routes: facilitator-add + self-enrol wrap the D9 400; new `POST …/foundations/enrollments/[id]/complete` (gated `startup_studio.foundations.review`). Container reads (`listCohorts`/`getCohort`) + `getMyEnrollments` + roster (`listEnrollments`) stay on `ss_foundations_*` (authoritative; UI signatures unchanged). Plan: `docs/cohort-core/PLAN.md`.
- **2026-07-06** — **Cohort Core** SF100 roster **profile-required** guard (PLAN.md decision **D9** · **NOT yet applied to prod** — PR-staged in `feat/sf100-full-migration`, added to **PR #1814**). Migration `20260731070000_sf100_roster_profile_required.sql` — **ADDITIVE, IDEMPOTENT, DROPS-NOTHING**. Adds ONE CHECK constraint `sf100_roster_changes_identity_required` = `CHECK (profile_id IS NOT NULL OR learner_id IS NOT NULL)` so every roster member resolves to a real MyJKKN identity (`profiles` or `learners_profiles`) — **no free-text-only members** (email/full_name stay a display cache). Idempotency: Postgres has no `ADD CONSTRAINT IF NOT EXISTS` → guarded on `pg_constraint` inside a `DO` block. Safe: `sf100_roster_changes` has **0 rows** today. `NOTIFY pgrst`. **Constraint made safe by fixing the sole write path FIRST** (research found `SF100Service.requestRosterChange` was designed to insert email-only rows with both identity links NULL — the live `'remove'` and external-`'add'` cases): `lib/services/startup-studio/sf100-service.ts::requestRosterChange` now RESOLVES identity in priority order (explicit DTO `profile_id`/`learner_id` → the matching `event_team_members` row's `profile_id`/`learner_id` → a directory lookup by email against `profiles.email` then `learners_profiles.student_email`/`college_email`) and REJECTS (throws `.status=400`) when nothing resolves; the API route `app/api/startup-studio/solve-for-100/enrollments/[enrollmentId]/roster-changes/route.ts` now wraps the call and surfaces that as a clean **400** (not a masked 500). No signature changes. Mirrored as a guarded ALTER (`DO`/`pg_constraint`) into `setup/01_tables.sql` (SF100 DDL is migration-only, like CDC). Generic cohort-engine picker/validation (`cohort-service` member-add + directory picker UI) remains **Phase 6**. Plan: `docs/cohort-core/PLAN.md`.
- **2026-07-05** — **Cohort Core** SF100 **demote to extension** (PLAN.md Phase 2.3 · FULL MIGRATION; **NOT yet applied to prod** — PR-staged in `feat/sf100-full-migration`, HELD for Director sign-off). Migration `20260731060000_sf100_demote_to_extension.sql` — **NON-DESTRUCTIVE, IDEMPOTENT, DROPS-NOTHING** (TIER-1). Makes `public.cohorts`/`public.cohort_memberships` the **canonical** SF100 spine and demotes `sf100_enrollments` to an SF100 per-team **extension** via ONE nullable link column `sf100_enrollments.cohort_membership_id uuid` → `cohort_memberships(id)` **ON DELETE SET NULL** (a LINK, not identity — deleting a membership must never cascade-delete the live extension row). **Link-column, NOT a re-key:** all 10 SF100 extension tables keep FK-ing to `sf100_enrollments.id` unchanged; cohort-core is reached in one hop (enrollment → cohort_membership_id → membership → cohort). **3 idempotency guards** (each DDL form needs its own): `ADD COLUMN IF NOT EXISTS`; FK guarded on `pg_constraint` inside a `DO` block (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`); index `IF NOT EXISTS`; the populate `UPDATE` uses `IS DISTINCT FROM m.id` (2nd apply matches 0 rows). **Populate** joins the membership through its parent cohort (`kind='sf100'` AND `member_type='team'` AND `member_ref = e.id`) — scoping by kind+type (+ the backfill's `UNIQUE(cohort_id,member_type,member_ref)`) guarantees exactly one deterministic match per enrollment. Self-check `DO` block **RAISE NOTICE (not EXCEPTION)** on any still-NULL rows (a backfill-skipped NULL-institution program legitimately stays NULL → must not abort). **NOT NULL DEFERRED** (column populated by the UPDATE + skipped programs stay NULL); **DROPs DEFERRED** (sf100_programs/enrollments kept, `program_id` FK intact as a bridge). `NOTIFY pgrst`. Mirrored as a guarded ALTER into `setup/01_tables.sql` (SF100 DDL is migration-only, like CDC, so folded as ALTER not a column list). **Repoint (code, no migration):** `lib/services/startup-studio/sf100-service.ts` (roster reads resolve the cohort → cohort_memberships and join `sf100_enrollments` by `member_ref`, with a **legacy `program_id` fallback** so code is safe to deploy before the migration is applied; program config fields `max_internal_user_pct`/`stall_*_days`/`source_event_id` read from `cohorts.config` with fallback to the still-live `sf100_programs` columns; `enrollTeam` write-side twin mirrors a `cohort_memberships` row + sets the link), `pipeline-service.ts`, `app/api/startup-studio/solve-for-100/{leaderboard,leaderboard/stats,programs/[programId]/seed-from-declarations}/route.ts`. Plan: `docs/cohort-core/PLAN.md`.
- **2026-07-05** — **Cohort Core** SF100 backfill (PLAN.md Phase 2.2; decision D3; **NOT yet applied to prod** — PR-staged in `feat/cohort-core`, HELD for Director sign-off — first phase touching LIVE SF100 data). Migration `20260731050000_cohort_core_sf100_backfill.sql` — **COPY-ONLY, NON-DESTRUCTIVE, IDEMPOTENT** (TIER-1 data backfill). Copies the 1 live SF100 program → `public.cohorts` (kind='sf100') and its 18 team enrollments → `public.cohort_memberships` (member_type='team', member_ref = the enrollment's own id). **No cutover** — runs NO UPDATE/DELETE on any `sf100_*` table; `sf100_*` remain the live source of truth (D3 = keep old as backup; SF100 services/hooks NOT repointed here — that is Phase 2.3). **Status remaps:** program `enrollment_open`→`enrolling` (rest pass through); enrollment `warning`/`probation`→`active`, `withdrawn`→`removed` (the ORIGINAL sf100 status is preserved in `config.sf100_status` so the folded stall-state + withdrawn-vs-removed distinction survive). **DATE→timestamptz** cast at IST boundaries (opens_at = start-of-day IST; closes_at/hard_deadline = end-of-day IST, deadline-inclusive). All SF100-only fields (metrics, seed_*, phase, stall config, started/completed_at) stashed in JSONB `config`; source `created_at`/`updated_at` copied (true history, not `now()`). **Idempotency:** cohorts has no natural unique key → `WHERE NOT EXISTS … config->>'sf100_program_id' = p.id` guard; memberships → `ON CONFLICT (cohort_id,member_type,member_ref) DO NOTHING`. Writes a D2 `config.rules` block (`defaultRuleConfigForKind('sf100')` = full lifecycle: inactivity 7/14, escalation 3bd, grace 30d). Self-check `DO` block RAISEs if any in-tenant program/enrollment stays unmapped. `NOTIFY pgrst`. **Reversible:** delete only the inserted `cohorts`/`cohort_memberships` rows (config-tagged). **Engine additions (no migration):** `lib/types/cohort-core.ts` (`CohortRuleConfig`, `CohortCloseStatus`, `TransferMembershipDto`, `CloseCohortDto`); `lib/services/cohort-core/lifecycle.ts` (`defaultRuleConfigForKind`, `isRuleEnabled`, `membershipCloseStatus`, `isTerminalMembershipStatus`); `cohort-service.ts` (`transferMembership` D8, `closeCohort` D7); `hooks/cohort-core/index.ts` (`useTransferMembership`, `useCloseCohort`). Plan: `docs/cohort-core/PLAN.md`.
- **2026-07-05** — **Cohort Core** shared cohort spine (PLAN.md Phase 1; **NOT yet applied to prod** — PR-staged in `feat/cohort-core`). Migration `20260731040000_cohort_core_spine.sql` (additive + idempotent): **3 tables** — `cohorts` (container: `kind` CHECK sf100/foundations/cdc/trainer, `institution_id` **NOT NULL** → `public.institutions(id)`, `status` CHECK draft→enrolling→active→completed→archived, `config jsonb`, archive/owner/created_by cols), `cohort_memberships` (`member_type` CHECK team/student/learner/staff, `member_ref`, `status` CHECK invited→enrolled→active→graduated|removed|paused, UNIQUE(cohort_id,member_type,member_ref)), `cohort_status_events` (append-only audit powering nudge→pause / escalate-after-3-business-days / 30-day grace). **6 indexes**, **updated_at triggers** on cohorts + cohort_memberships (reuse `public.update_updated_at_column()`; events append-only). **RLS** canonical dynamic-permission on all 3 (`is_super_admin() OR is_admin()` first, then `user_has_permission('cohort.<verb>')` + `role_has_institution_access`, SECDEF calls wrapped `(select fn(...))` for InitPlan caching; memberships/events scope through parent cohort via EXISTS; DELETE gated on `cohort.manage`; events UPDATE/DELETE admin-only). No new RPCs (spine is client-service driven). `NOTIFY pgrst`. Mirrored into `setup/{01_tables,03_policies,04_triggers}.sql`. New permission category **Cohort Core** (`cohort.view/create/edit/manage`) in `lib/constants/permissions.ts`. Types `lib/types/cohort-core.ts`; service `lib/services/cohort-core/{cohort-service,lifecycle}.ts`; hooks `hooks/cohort-core/index.ts`; query-keys `cohortKeys`. Plan: `docs/cohort-core/PLAN.md`.
- **2026-07-04** — CDC **Government-Job-Readiness track** (TNPSC/RRB/banking/SSC/TN-Police) — additive + idempotent, **NOT yet applied to prod** (draft PR pending Director review). CDC's canonical DDL lives entirely in `supabase/migrations/*` (zero `cdc_*` tables in `supabase/setup/*`), so these 3 dated migrations are the canonical source; not folded into `setup/01_tables.sql` (would orphan FKs). (1) `20260704090000_cdc_govt_jobs_readiness_content_and_columns.sql` — `ALTER TABLE cdc_training_types ADD COLUMN IF NOT EXISTS exam_family text NULL` (config-key tag; NULL=not a govt-exam type, all existing rows unchanged); `ALTER TABLE cdc_training_programmes ADD COLUMN IF NOT EXISTS shared_syllabus_pct numeric NULL` + `domain_topics text NULL` (Option A labels, purely descriptive); seeds **7 govt-exam `cdc_training_types` rows** across 5 exam_family tags (tnpsc/rrb/banking/ssc/police) `ON CONFLICT (config_key) DO NOTHING`; seeds **5 starter government-scholarship `cdc_external_opportunities` rows** (`category='scholarship'`, deadlines/URLs are placeholders pending CDC verification). (2) `20260704090100_cdc_exam_syllabus_topics.sql` — **NEW config-master `cdc_exam_syllabus_topics`** (`config_key UNIQUE, display_name, description, is_shared boolean, is_system, is_active, sort_order, …` — shape mirrors `cdc_offer_types` + one flag) and **NEW light junction `cdc_exam_topic_map`** (`exam_training_type_id → cdc_training_types ON DELETE CASCADE`, `topic_id → cdc_exam_syllabus_topics ON DELETE CASCADE`, `sort_order`, UNIQUE(exam_training_type_id, topic_id)); `_touch_updated_at` triggers; seeds 14 topics (8 shared / 6 domain) + a data-driven topic↔exam map (shared topics → every govt-exam type; domain topics → selected exams). RLS on both: authenticated read (`auth.uid() IS NOT NULL`), write `is_cdc_head_or_super()` — mirrors the CDC master pattern; platform-global (no institution_id). **No 60/40 hardcoded** — the shared/domain split is derived at read time from `is_shared`. (3) `20260704090200_cdc_govt_readiness_permission_backfill.sql` — backfills new `cdc.govt_readiness.view` key onto `cdc_head` + `cdc_coordinator` (`permissions || jsonb_build_object(...)`, the "declare key without grant → empty UI" gotcha). Registered `cdc_exam_syllabus_topics` in `ALLOWED_MASTER_TABLES` + `CdcMasterTable`. Admin master page `/cdc/admin/exam-syllabus-topics`; cohort-overlap view + hub `/cdc/govt-readiness`; sidebar entry; career-guidance prompt/signal enrichment. Spec: `specs/cdc-govt-jobs-readiness-2026-07-04.md`.
- **2026-07-04** — Department Instagram **Monthly Cadence** engine (ships DARK). Migration `20260704120000_social_monthly_cadence.sql` (additive + idempotent, NOT yet applied to prod — pending Director review). **Rides the LIVE Projects/RACI substrate** (OKR was absorbed into Projects, locked 2026-05-31 — the legacy `okr_objectives` table does NOT exist in prod, so there is NO `ALTER TYPE okr_cycle_type` and NO `okr_objectives` insert/FK): (1) NEW ledger table `social_monthly_cadence` — one row per (account_id, cadence_month) holding the objective→baseline→feedback→action→re-measure→close state machine; reach columns are SNAPSHOTS from `ig_monthly_audit` (never re-aggregated), feedback snapshot from `feedback_events`; **`project_id` is REQUIRED → `projects(id)`** (the unified-OKR objective is a real `projects` row, `is_okr=true`, `project_type='okr_objective'`, `owner_staff_id`=the dept HOD); UNIQUE(account_id, cadence_month) + 5 indexes + updated_at trigger; (2) canonical dynamic-permission RLS (`is_super_admin() OR is_admin() OR (user_has_permission('social.departments.view'/'.manage') AND role_has_institution_access(institution_id))`), anon revoked; (3) 4 SECURITY DEFINER RPCs — `fn_ig_monthly_reach(uuid,date)` (STABLE reader over ig_monthly_audit), `fn_social_cadence_open(uuid,text,date)` (snapshots baseline + creates a real `projects` row + a `key_result` `project_task` with the HOD assigned RACI **Accountable** via `project_task_assignees.role`, resolving HOD via `staff.profile_id = departments.head_of_department_id`; idempotent per account+month), `fn_social_cadence_record_action(uuid,text,jsonb)`, `fn_social_cadence_close(uuid,text)` (re-measure + metrics_source guard→`unmeasurable`; **teeth**: sets the linked `projects.rag_status` green/amber/red vs the win threshold so the DORMANT `project_at_risk` auto-accountability rule would summon the HOD) — all self-gate (DEFINER bypasses RLS) and end `REVOKE anon,PUBLIC; GRANT authenticated`; (4) seeds 4 `social.cadence.*` policy rows into `platform_policies` (**`social.cadence.enabled=false`** ships DARK, `clock_mode='calendar_month'`, `period_days=30`, `win_delta_pct=10`); (5) merges `social.departments.view`+`.manage` into the scope='own' HOD role (Director-locked owner). Mirrored into `setup/{01_tables,02_functions,03_policies}.sql`. New cron `/api/cron/social-monthly-cadence` (`0 7 1 * *`, after the audit) STAGES elapsed open cycles to `awaiting_close` AND sets the linked project RAG (the same teeth). UI: monthly section on `/admission/social/loop` (`_components/cadence-card.tsx`); the objective auto-appears on the LIVE `/projects` surface as an `is_okr` project (the dead `/okr/department` surface — which reads the dropped `okr_objectives` — is NOT used). Auto-meeting rules stay DORMANT. Spec: `specs/dept-ig-monthly-cadence-2026-07-04.md`. **Deep-review hardening (PR #1781, 2026-07-04):** `project_id` FK is now **`ON DELETE RESTRICT`** (was CASCADE — preserve ledger history) + an idempotent constraint-converge; NEW BEFORE-UPDATE trigger `trg_social_monthly_cadence_project_immutable` makes `project_id` immutable post-insert (blocks raw-PostgREST repointing of the teeth); NEW helper `fn_social_caller_owns_dept(uuid)` (5th DEFINER fn) — all 3 writer RPCs now add a **department-ownership** gate so a scope='own' HOD cannot act on another dept's account; `fn_social_cadence_open` now **self-gates DARK** via `fn_get_policy_bool('social.cadence.enabled')` AND validates any supplied `p_project_id` is an `is_okr` project **in the account's institution** (cross-tenant write fix); `fn_social_cadence_close` + the cron now **re-assert `projects.institution_id = cadence.institution_id`** on every RAG write (DEFINER/service-role tenant guard), the metrics_source guard treats ANY graph⇄business_discovery/NULL mismatch as `unmeasurable` (was only the downgrade), the close UPDATE carries a TOCTOU `status NOT IN ('closed','unmeasurable')` predicate, and the cron skips the project-RAG write when 0 cadence rows staged. **Round-3 hardening (PR #1781, closes both round-2 HIGHs at the root):** the ledger is now **RPC-WRITE-ONLY** — `authenticated` holds **SELECT only** (`REVOKE INSERT,UPDATE,DELETE`; the INSERT/UPDATE RLS policies are dropped), so a raw PostgREST write can no longer bypass the DEFINER guards to point `project_id` at a victim project; `fn_social_cadence_open` **no longer accepts a caller-supplied `project_id`** (the old 4-arg overload is dropped) — open **always** auto-creates its own `is_okr` objective, removing the cross-tenant vector entirely; `fn_social_cadence_close` now **self-gates DARK** too (not just open); the SELECT policy adds **`fn_social_caller_owns_dept(department_id)`** so a scope='own' HOD reads only its own dept's rows; open is **atomic** (advisory xact-lock + `INSERT … ON CONFLICT (account_id,cadence_month) DO NOTHING` + re-select, no raw unique_violation), derives `cadence_month` from **UTC**; `fn_social_caller_owns_dept` is restricted to **`departments.head_of_department_id` only** (dropped the any-active-staff branch); the HOD→staff resolution adds **`s.institution_id = v_institution_id`** (no cross-tenant owner); an **`unmeasurable`** close now **RESETS** the project RAG to green/0% (undoes any cron-fabricated green/red); and `percent_complete` is written on **both** the cron and `close` (never one without the other).

- **2026-07-03** — SCF learner-notes **approval queue**. Migration `20260703091300_scf_learner_notes_approval.sql`: (A) `scf_learner_notes` gains `status text NOT NULL DEFAULT 'approved' CHECK (status IN ('draft','approved','rejected'))` (default 'approved' so pre-queue rows already seen by students stay visible), `approved_by uuid REFERENCES auth.users(id)`, `approved_at timestamptz`, + index `ix_scf_learner_notes_status`; (B) `fn_scf_my_struggling_note` — CREATE OR REPLACE adding `AND n.status='approved'` (learners only ever see approved notes; this RPC is the ONLY student read surface — the table is RLS-enabled with no policies, deny-all direct access); (C) `fn_scf_struggling_notes_sent` — CREATE OR REPLACE adding `AND n.status='approved'` ("sent" = learner-visible; drafts no longer counted); (D) NEW `fn_scf_learner_notes_pending()` RETURNS SETOF scf_learner_notes — `is_super_admin()` gate, status='draft' ordered by week_of DESC/created_at ASC (full rows incl. note text — the review is real); (E) NEW `fn_scf_learner_notes_review(p_ids uuid[], p_action text)` RETURNS jsonb — `is_super_admin()` gate, p_action IN ('approve','reject'), bulk UPDATE `WHERE id = ANY(p_ids) AND status='draft'` setting status + approved_by=auth.uid() + approved_at=now(), returns `{ok, action, updated_count}`. All fns SECURITY DEFINER + SET search_path=public + `REVOKE FROM anon, PUBLIC; GRANT TO authenticated`. Cron `app/api/cron/scf-learner-notes` now writes `status:'draft'`; super-admin UI at `/admin/learner-notes`.

- **2026-06-30** — Schools Network module **DB substrate** (Agent A of the 4-stream parallel build). Migration `20260630120000_schools_network_substrate.sql` (additive + idempotent, applied to prod project `kvizhngldtiuufknvehv`). Adds: **5 enum types** (`school_ownership`, `school_status`, `school_owner_role`, `school_contribution_kind`, `program_partner_status`); **3 master tables** seeded (`school_session_types`×5, `program_partner_types`×4, `school_contact_roles`×4); **7 core entity tables** (`program_partners`, `schools`, `school_contacts`, `school_jkkn_owners`, `school_sessions`, `school_contributions`, `program_partner_grants`); **3 helper fns** (`user_owns_school`, `user_leads_partner_for_school`, `is_school_portal_user_for`); **11 service RPCs** (`fn_schools_list`, `fn_school_detail`, `fn_school_session_record`, `fn_school_contribution_record`, `fn_school_assign_owner`, `fn_school_revoke_owner`, `fn_program_partner_rollup`, `fn_schools_silence_candidates`, `fn_schools_recompute_status` [STUB pending Director thresholds], `fn_school_portal_self`, `fn_school_portal_submit_update`); **30 RLS policies** (canonical `is_super_admin() OR is_admin() OR (user_has_permission('schools_network.X') AND school-scope helper)`); **2 system roles** (`outreach_coordinator` scope='own', `program_lead` scope='own'). All RPCs follow the post-2026-06-06 rule: `REVOKE EXECUTE FROM anon, PUBLIC; GRANT TO authenticated`. Anon also locked out of every new table. NOTIFY pgrst, 'reload schema'. Spec: `/tmp/schools-network-spec.md`.

- **2026-06-28** — SCF Self-Improving Loop hardening. Migration `20260628010000_scf_loop_hardening.sql`: (A) `ADD COLUMN IF NOT EXISTS section_id uuid` on `scf_ai_suggestions`; (B) `fn_scf_record_suggestion` — DROP+CREATE with new trailing `p_section_id uuid DEFAULT NULL`, ON CONFLICT idempotent upsert on unique index `idx_scf_ai_suggestions_dedupe` (grain: institution_id+course_code+COALESCE(faculty_email,'')+window_from+window_to+domain); (C) `fn_scf_measure_suggestion_outcomes` — carry institution_id/section_id into candidates CTE, fix NULL-faculty lane predicate, add cross-tenant guard, recompute baseline inside fn with >=3-floor estimator; (D) `fn_scf_prior_suggestion` — DROP+CREATE adding `outcome_responses int` + `input_responses int` to RETURNS TABLE; (E) NEW `fn_scf_set_verdict(uuid,text)` write path for `human_verdict` (faculty self-verdict + leadership/admin gate); (F) `fn_scf_ai_signal` — add `HAVING count(*) >= 3` floor. All SECURITY DEFINER + REVOKE anon/PUBLIC + GRANT authenticated.

- **2026-06-23** — Social Governance control-plane **config substrate** (applied to prod 2026-06-18 with PR #1494; indexed here with the nav-wiring follow-up). Migration `20260712000000_social_governance_config_substrate.sql` is additive-only + idempotent (seeds rows + `ADD COLUMN IF NOT EXISTS`, no drops). It (1) seeds **7 `social.*` rows** into the canonical `platform_policies` store (read at runtime via `fn_get_policy_*`, never raw SELECT): `social.dormancy_threshold_days`(60), `social.compliance_min_followers`(150), `social.compliance_min_posts`(12), `social.followback_ratio_threshold`("0.7"), `social.realtime_enabled`(false), `social.digest_top_n`(5), `social.digest_categories` — all `is_system=true` GLOBAL so the super-admin policy editor renders them (label from `description`, editor from `data_type`); and (2) extends `social_dept_accounts` (from `20260610100000_social_dept_accounts_registry`) with **3 columns**: `lifecycle_status` (TEXT NOT NULL DEFAULT 'provisional' + idempotent CHECK), `accountable_owner_id` (UUID), `posting_cadence_days` (INT). Drives `/admission/social/governance` (director's-view) + `/admission/social/admin/policies` (super-admin editor).
- **2026-06-23** — Choose Your Menu **Mode C (special-day / festival picker)** RPCs. Migration `20260623001000_mess_choose_mode_c_special_day_rpcs.sql` adds 5 SECURITY DEFINER functions on the existing `mess_special_day_proposals` substrate (no new tables): `fn_mess_special_day_can_propose()` (role gate), `fn_mess_special_day_propose(date,meal,tier,gender,uuid[],text)` (proposer-role-gated create, re-checks master + `special_day.enabled` at call time), `fn_mess_special_day_approve(uuid)` (ADMIN/menu.publish — sets status, marks the matching `mess_menus` cell `is_special_day` + appends festival dishes, and confers `proposal_approved` recognition on every resident who upvoted a dish via Mode B `mess_dish_votes`; idempotent per learner+proposal), `fn_mess_special_day_reject(uuid)`, and `fn_mess_special_day_list(text,bool)` (admin queue + resident "coming up"). All `REVOKE EXECUTE FROM anon, PUBLIC; GRANT TO authenticated`. Ships dark (`mess.choose.master_enabled=false`).

- **2026-06-22** — Choose Your Menu **Mode B (menu voting / wishlist)** RPCs. Migration `20260622234500_mess_choose_mode_b_vote_rpcs.sql` adds 4 SECURITY DEFINER functions on the existing P0 substrate (`mess_dish_votes` table + `campus_living_recognition` stream — no new tables): `fn_mess_choose_cast_vote(uuid,int)` + `fn_mess_choose_clear_vote(uuid)` (resident thumbs ±1, master+voting-tier re-checked at call time), `fn_mess_choose_votable_dishes(text,int)` (library + live tally + caller's own vote, searchable), and `fn_mess_choose_recognize_voted_dish(uuid,date)` (ADMIN/menu.publish return-arc — confers `vote_landed` recognition on every upvoter, but ONLY if the dish is verifiably on a `mess_menus` cell that week; idempotent per learner+item+week). All `REVOKE EXECUTE FROM anon, PUBLIC; GRANT TO authenticated`. Ships dark (`mess.choose.master_enabled=false`).

- **2026-07-10** — Fixed pgcrypto search_path bug in 4 SECURITY DEFINER fns (5 instances incl. both `generate_api_key` overloads): `ALTER FUNCTION ... SET search_path = public, extensions` on `create_api_key`, `generate_api_key()`, `generate_api_key(integer)`, `create_staff_auth_profile`, `bulk_sync_applications_to_auth_server` — they call pgcrypto primitives in the `extensions` schema and were failing at runtime with 42883. Migration `20260710120000_fix_sibling_pgcrypto_search_path.sql` (idempotent; body unchanged).

- **2026-05-02** — IMS permission-system audit: full RLS resolution (Part 2 — bugs #1, #2, #3, #5, #6, #7, #8, #9, #10)
  - Continuation of the morning's granular-overrides session (Part 1 below). The `rls-fixer` agent in team `ims-permission-resolve` resolved the remaining 10 RLS/scope bugs flagged by the `scope-reviewer` and `rls-reviewer` audits. All listed open follow-ups from Part 1 are now closed except the deferred UI-layer concerns.
  - **`03_policies.sql` edit #3 (helper-call corrections)**: the `pg_temp.ims_apply_*` helpers in the main IMS RLS block assume every table has an `institution_id` column. Several tables don't — re-running the file on a fresh DB would have crashed or generated globally-permissive policies that regress live state. Replaced helper calls for 7 tables (lines ~5575, 5587-5590, 5595-5597, 5610-5612) with explicit pointers to hand-written DO blocks below + corrected ones for `ims_suppliers` (BUG #5: was global, now inst-scoped) and `ims_unit_conversions` (BUG #9: was global, now child-scoped via `ims_items.institution_id`).
  - **`03_policies.sql` edit #4 (hand-written blocks for non-conforming tables)**: ~290 lines added between line 5638 (end of main IMS RLS) and the existing granular-overrides block. Three new DO blocks:
    - **`ims_item_categories` (BUG #2, HIGH)**: live policies were globally readable/writable (`user_has_permission('ims.view')` with no scoping). Replaced with store-scoped variants via `EXISTS-join on ims_stores.institution_id`. Closes cross-store data exposure.
    - **`ims_supply_shipments` + `ims_supply_shipment_items` (BUG #1 HIGH cross-tenant write + BUG #3 HIGH helper drift)**: table has NO `institution_id` (only `source_store_id`, `destination_institution_id`, `destination_store_id`). Generic helper would crash. Hand-written block creates SELECT/INSERT/UPDATE/DELETE matching live DB shape AND narrows base UPDATE/DELETE to source-side-only via `ims.transfers.dispatch`. Destination-side updates flow through the existing additive `_update_receive` policy gated on `ims.transfers.receive`. Same fix applied to the child shipment_items table.
    - **`ims_*_number_counters` (BUG #6, MED)**: 4 counter tables (`ims_grn_number_counters`, `ims_indent_number_counters`, `ims_sale_number_counters`, `ims_batch_number_counters`) carry only `store_id`. Helper would crash on missing `institution_id`. Hand-written block iterates over 4 tables × 4 verbs in a single loop, scoping via `EXISTS-join on ims_stores`.
  - **`03_policies.sql` edit #5 (granular overrides extended)**: the existing 2026-05-02 morning block was extended with 3 more dead-key bindings (BUGs #7, #8 from rls-reviewer):
    - `ims.inventory.create` → additive INSERT on `ims_items`
    - `ims.inventory.delete` → additive DELETE on `ims_items`
    - `ims.stock.grn.receive` → additive UPDATE on `ims_goods_received_notes` when status transitions to `received`/`verified`
  - **`03_policies.sql` edit #6 (design-intent comments)**: BUG #10 `ims.financial.write_admin_only` annotated as intentional (service-role / DEFINER-only writes; do NOT add to PERMISSION_CATEGORIES). BUG #7 scope-reviewer (`ims_activity_log.ims.view` INSERT gating) documented as deferred TODO with rationale (requires UI-layer permission key addition). BUG #5/#9 rationale captured in inline comments.
  - **`03_policies.sql` edit #7 (bulk_import non-enforceability)**: comment block added explaining `ims.inventory.bulk_import` cannot be enforced at the RLS layer (no per-row signal distinguishing a single insert from a bulk import). Bulk-import gating must remain in service-layer code (see `lib/services/ims/items-service.ts` and the bulk-import API route).
  - **Production migrations applied** (via `mcp__supabase__apply_migration`): 4 named migrations:
    - `ims_rls_resolve_remaining_2026_05_02_item_categories`
    - `ims_rls_resolve_remaining_2026_05_02_supply_shipments_narrow`
    - `ims_rls_resolve_remaining_2026_05_02_shipment_items_narrow`
    - `ims_rls_resolve_remaining_2026_05_02_inventory_grn_dead_keys`
    Verified via `pg_policies`: all `ims_supply_shipments` UPDATE/DELETE quals now reference only `source_store_id` (no `destination_institution_id`); `ims_item_categories` policies all join `ims_stores`; new `ims_items_insert_create`, `ims_items_delete_specific`, and `ims_goods_received_notes_update_receive` policies live alongside the helper-generated baselines.
  - **Live policies for `ims_suppliers`, `ims_unit_conversions`, and the 4 counter tables were already correct** (these were never regressed in production — only the source file would have regressed on re-apply). No live DB change needed for those; the fix is purely source-file hardening.
  - **Per-bug status (final)**:
    - BUG #1 [HIGH] cross-tenant write on `ims_supply_shipments` — **FIXED** (UPDATE/DELETE narrowed to source-side; destination-side covered by `_update_receive`)
    - BUG #2 [HIGH] `ims_item_categories` global scope — **FIXED** (store-scoped via `ims_stores` EXISTS-join)
    - BUG #3 [HIGH] `ims_supply_shipments` helper drift (would crash on re-apply) — **FIXED** (hand-written block replaces helper call; child table same)
    - BUG #5 [MED] `ims_suppliers` would regress on re-apply — **FIXED** (changed `ims_apply_global_policies` → `ims_apply_inst_policies`)
    - BUG #6 [MED] counter tables would crash on re-apply — **FIXED** (hand-written loop block)
    - BUG #7 [MED] rls-reviewer — `ims.inventory.create/.delete` dead — **FIXED** (additive policies wired)
    - BUG #7 [LOW] scope-reviewer — `ims_activity_log` INSERT key — **DEFERRED** (TODO comment; requires new permission key in `lib/constants/permissions.ts`)
    - BUG #8 [MED] `ims.stock.grn.receive` dead — **FIXED** (additive policy with status-transition WITH CHECK)
    - BUG #9 [MED] `ims_unit_conversions` would regress on re-apply — **FIXED** (changed to child-scoped via `ims_items.institution_id`)
    - BUG #10 [MED] `ims.financial.write_admin_only` undocumented — **DOCUMENTED** (design-intent comment added)
    - `ims.inventory.bulk_import` (rls-reviewer note) — **DOCUMENTED** (cannot be enforced at RLS layer; service-layer concern)
  - **Open follow-ups (deferred to other agents)**:
    - **HIGH (UI layer)**: ui-reviewer's 24 HIGH-severity findings — `app/(routes)/ims/**` pages still don't enforce `canAccess()` per-page or `Can*` per-action. Owned by `ui-fixer` (Task #2).
    - **LOW**: add `ims.audit.write` key to `lib/constants/permissions.ts` and migrate the `ims_activity_log_insert` policy to gate on it (BUG #7 scope-reviewer). Trivial follow-up but cross-cuts UI agent's territory.

- **2026-05-02 (morning)** — IMS permission-system audit: granular RLS overrides + setup-script FK fixes (Part 1)
  - Driven by 4-agent `ims-permission-audit` team review (50 bugs surfaced across RLS/UI/scope/dashboard layers).
  - **`03_policies.sql` edit #1 (FK column typos)**: lines 5607, 5611. Helper invocations for child tables `ims_indent_request_items` and `ims_supply_shipment_items` declared FK columns `indent_request_id` and `supply_shipment_id` — but live DB has `indent_id` and `shipment_id`. Re-running the script would have crashed on `column does not exist`. Verified via `information_schema.columns` before patching.
  - **`03_policies.sql` edit #2 (granular permission overrides)**: appended new ~110-line block between the main IMS RLS DO-block (line 5618) and the IMS Activity Log section. Wires 5 previously-dead permission keys at the DB layer:
    - `ims.indents.create` → INSERT on `ims_indent_requests`
    - `ims.indents.delete` → DELETE on `ims_indent_requests`
    - `ims.indents.approve` → UPDATE on `ims_indent_requests` when status moves to `approved`/`rejected`
    - `ims.sales.refund` → UPDATE on `ims_sales` when status='cancelled'
    - `ims.transfers.receive` → UPDATE on `ims_supply_shipments` & `ims_supply_shipment_items` when status moves to `received`/`received_with_variance`
  - **Strategy: additive (soft-wire), not replacement**. Postgres ORs multiple permissive policies for the same verb — these new policies grant access alongside the existing helper-generated `_insert`/`_update`/`_delete`. Existing roles keyed on `ims.indents.edit` / `ims.sales.create` / `ims.transfers.dispatch` keep their authority.
  - **Production migration applied** (via `mcp__supabase__apply_migration`): `ims_granular_permission_overrides_2026_05_02`. 6 new policies live: `ims_indent_requests_{insert_create, delete_specific, update_approve}`, `ims_sales_update_refund`, `ims_supply_shipments_update_receive`, `ims_supply_shipment_items_update_receive`.
  - **Status-transition gating**: WITH CHECK clauses on the new UPDATE policies constrain `NEW.status` to the specific transitions each verb represents — so a user with only `ims.indents.approve` can flip status to approved/rejected but cannot edit other fields under that policy (general edits still require `ims.indents.edit`). Catalog verbs now match DB-enforced verbs.

- **2026-04-28** — IMS production-readiness: RLS canonicalization + schema drift sweep + Phase F audit trail
  - **Phase A (RLS hardening)**: drop-and-recreate RLS for all 25 ims_* tables to canonical pattern `is_super_admin() OR is_admin(auth.uid()) OR (user_has_permission(<key>) AND role_has_institution_access(institution_id))`. Closed 5 live security holes (USING(true) on `ims_supply_shipments`, `ims_supply_shipment_items`, `ims_stock_batches`, `ims_stock_summary`, `ims_batch_number_counters`). Replaced the legacy `get_current_user_role()` raw-string pattern on 23 tables. Pre-flight: added `custom_roles.{institution_scope, is_active, institution_id}` columns + applied `role_has_institution_access(uuid)` from `02_functions.sql:6674` (was missing in prod) + UPDATE custom_roles SET institution_scope='all' WHERE role_key IN ('super_admin', 'counselor'). 100 canonical policies live, 0 holes remaining.
  - **Phase A0.5 (in-flight)**: `ims_stores` got `is_central_supply_store BOOLEAN NOT NULL DEFAULT FALSE` + `requires_local_approval BOOLEAN NOT NULL DEFAULT FALSE`. Fixed `getStores()` 42703 error blocking the store picker.
  - **Phase A5b (schema-types drift)**: `ims_items` got 5 spec-defined-but-DB-missing columns (`is_distributable`, `is_bundle`, `brand`, `variant_attributes`, `image_url`); `types/ims/supply-transfers.ts` got 5 logistics fields (`vehicle_no`, `courier_name`, `driver_name`, `driver_contact`, `expected_arrival`) that existed in DB but were missing in types — pages were silently dropping the data on round-trip.
  - **Phase F (end-to-end audit trail)**: closed gap where IMS service layer was computing user-id + timestamps for every transition (e.g., `indent-service.ts:240` setting `approved_at`) but DB was silently dropping them because columns didn't exist. Added 8 audit columns: `ims_indent_requests.{requested_at, approved_at, rejected_at, rejected_by, local_approved_at}` + `ims_goods_received_notes.{received_at, verified_at, approved_at}`. Backfilled `requested_at = created_at` and `received_at = created_at` for existing rows so historical entries don't render as NULL. Created **`ims_activity_log`** table (8 columns: institution_id, entity_type CHECK enum, entity_id, action CHECK enum, actor_id, notes, metadata jsonb, created_at) with 3 indexes + RLS (SELECT + INSERT only — append-only by design, no UPDATE/DELETE policies). 5 service files integrated to log every state transition: indent (raised/approved/rejected), GRN (received/verified/approved), supply-transfer (dispatched/received), stock-adjustment (adjusted), sales (raised). Reject + adjustment now require notes (`throw new Error` on empty); approve allows optional comment. New types/ims/activity-log.ts + hooks/ims/use-ims-activity-log.ts + components/ims/activity-feed.tsx mounted on indent/GRN/transfer detail pages. End-to-end smoke verified.
  - **`01_tables.sql` edits (this session)**: appended single block at end of file containing the Phase A0.5/A5b ALTERs, the Phase F audit-column ALTERs (with `to_regclass` guards so the block no-ops cleanly until base IMS tables land in source), and the `ims_activity_log` CREATE TABLE + indexes + ENABLE RLS. The 25 base ims_* tables are NOT yet in this file — they exist only in production from the original IMS deploy and remain a follow-up backfill task.
  - **`03_policies.sql` edits**: appended new RLS section for `ims_activity_log` after the existing IMS canonical RLS block. Same pattern, same helper functions, but only SELECT + INSERT (append-only).
  - **`02_functions.sql`**: no edits this session — `role_has_institution_access` was already there (line 6674), the bug was that it had never been applied to production. Applied via mcp during Phase A0 pre-flight.
  - **Production migrations applied** (via `mcp__supabase__apply_migration`): 7 named migrations covering schema fixes, RLS canonicalization, audit columns, and activity log creation. All idempotent (`IF NOT EXISTS` / `DROP POLICY IF EXISTS`). Plan file: `~/.claude/plans/ps-c-users-admin-documents-github-myjkkn-radiant-dijkstra.md`.
  - **Open follow-ups**: full backfill of the 25 base ims_* tables into `01_tables.sql` (high-volume mechanical work, separate task); service-layer interface standardization (3 services return flat arrays vs others' `{data, metadata}` wrapper — defer to tech-debt PR); structured-error-logging pattern across 18 IMS services (only `store-service.ts` and `role-service.ts` upgraded so far this session). hr_leave_applications schema (referenced in `02_functions.sql` and `05_views.sql` but defined nowhere) is a separate pre-existing gap.

- **2026-04-28** — Dashboard v2 staging-sync: backfill spec-asserted columns + drop HLA clause from SLA matview
  - Symptom: `/dashboard` on `ims-on-main` threw a wall of `<DashboardErrorBoundary>` blocks. Started as PGRST202 (5 RPCs/views missing in staging because MCP had been pointing at the wrong Supabase project — `kvizhngldtiuufknvehv` instead of `hhprjbgknupaplivtoib`). After re-pointing the MCP and applying the 4 deployable objects verbatim from `02_functions.sql`/`05_views.sql`, errors shifted to `42703 column does not exist` for `un.acknowledged_at`, `first_touch_at`, plus PGRST202 for `fn_dashboard_streak`/`fn_dashboard_activity_feed` which were never deployed.
  - Root cause (two layers): (a) staging schema ~5–10 days stale on dashboard-v2 changes; (b) **source SQL itself** was missing `CREATE TABLE`/`ALTER TABLE` DDL for 7 of the 9 columns the dashboard-v2 functions reference. Specs (`specs/myjkkn-dashboard-v2-spec.md §3.1`) describe these columns; functions in `02_functions.sql` use them; nobody ever authored the ALTER blocks. So a fresh DB clone from `setup/` would re-break.
  - **`01_tables.sql` edits**: added new ALTER blocks alongside the existing dashboard-v2 section (~line 4205), backfilling `notifications.{action_type, action_config, acknowledgment_deadline_hours, requires_acknowledgment}` and `user_notifications.{acknowledged_at, escalated_at, escalation_level}`. `requires_acknowledgment NOT NULL DEFAULT FALSE` and `escalation_level NOT NULL DEFAULT 0` are safe on existing rows because the DEFAULT backfills atomically. Added `idx_user_notifications_unack` partial index for the hot `acknowledged_at IS NULL` predicate hit by every queue read.
  - **`05_views.sql` edits**: removed the `NOT EXISTS hr_leave_applications` clause from `v_dashboard_sla_daily` (lines ~773–778). Inline comment marks the spot for reinstatement once `hr_leave_applications` is authored. Behavior change: counselors on approved leave will now appear in SLA leaderboard rankings if they have `first_touch_at` data — minor (internal leaderboard).
  - **No edits to `02_functions.sql`**: `fn_dashboard_streak` (:8521) and `fn_dashboard_activity_feed` (:8680) already exist in source verbatim; they just weren't deployed to staging. Both applied this session.
  - **Staging migrations applied** (8 in total via `mcp__supabase__apply_migration`): `dashboard_v2_admission_leads_first_touch_at`, `dashboard_v2_notifications_action_columns`, `dashboard_v2_user_notifications_ack_columns`, `dashboard_v2_v_sla_daily_no_hla` (drop+recreate combined to avoid REFRESH window), `dashboard_v2_fn_dashboard_streak`, `dashboard_v2_fn_dashboard_activity_feed`, plus the earlier `dashboard_config` table and the 4 verbatim object deploys (metrics/morning_brief/queue_list/conversion_monthly). Final `NOTIFY pgrst, 'reload schema'`.
  - Verification: 7 dashboard objects exist in `pg_proc`/`pg_matviews`; 9 new columns confirmed via `information_schema.columns` with correct types (`requires_acknowledgment is_nullable='NO' default 'false'`, `action_config jsonb default '{}'::jsonb`, etc.); `notifications_superseded_by_fkey` self-FK exists; both matviews queryable (0 rows is steady-state — `first_touch_at` was just added so no leads have it set yet).
  - **Open follow-up (separate ticket)**: author or remove `hr_leave_applications` references in source. Currently referenced 4 times across `02_functions.sql` + `05_views.sql` but defined nowhere. Until resolved, `fn_check_employee_on_leave`-style functions in HR module will fail at call time. Suggested: `bd create "Author hr_leave_applications schema or strip references" -t bug -p 2`.
  - Plan file: `~/.claude/plans/ps-c-users-admin-documents-github-myjkkn-radiant-dijkstra.md`.

- **2026-04-28** — `02_functions.sql`: append `NOTIFY pgrst, 'reload schema'` trailer to fix recurring PGRST202 schema-cache misses
  - Symptom: dashboard threw `PGRST202: Could not find the function public.fn_dashboard_metrics(p_department_id, p_institution_id)` despite the function existing in `pg_proc` (verified via Supabase MCP — single active v3 signature, granted to authenticated, returned the documented `no_caller_profile` JSON branch when called with NULL/NULL).
  - Root cause: PostgREST in-memory schema cache was stale after a prior `02_functions.sql` deployment. The setup file had no cache-reload trailer (unlike all 11 migrations under `supabase/migrations/` which do — e.g. `20260427_role_demotion_safeguards.sql`, `20260424_bos_align_institutions_id_and_drop_expert_fk.sql`, `admission/014_whatsapp_auto_responder.sql`).
  - Fix: 9-line trailer at EOF — single global NOTIFY covers every function in the file. Reload is global, so any sibling cache-miss is also resolved simultaneously.
  - One-shot remediation issued via Supabase MCP `NOTIFY pgrst, 'reload schema'`; verified with `SELECT public.fn_dashboard_metrics(NULL, NULL)` returning the documented early-exit JSONB (no PGRST202).
  - Related prior incident: `docs/bugs/academic-staff-planning-bugs-2026-04-18.md` — same root cause class on `get_consolidated_staff_plans`; was never structurally resolved (fallback path shipped instead). This trailer closes the recurrence vector for `02_functions.sql`.
  - **Hot-patch caveat**: if a contributor manually ALTERs/CREATEs a single function (not via full setup re-run), they must issue `NOTIFY pgrst, 'reload schema'` themselves — the trailer only fires on full-file deploys.
  - **Follow-up (separate PR)**: mirror the trailer into `03_policies.sql`, `04_triggers.sql`, `05_views.sql` — RLS / trigger / view changes can also stale the cache. Not in this change.

- **2026-04-28** — IMS module wired into role-based access (permissions catalog + canonical RLS)
  - `lib/constants/permissions.ts`: new `IMS` PERMISSION_CATEGORIES block (~28 keys, taxonomy `B+`). Module-level granularity matching Admission CRM precedent + critical action keys for financial/audit separation: `ims.indents.approve`, `ims.stock.adjust`, `ims.sales.refund`, `ims.stock.grn.receive`, `ims.transfers.{dispatch,receive}`. Gateway key `ims.view` gates parent /ims tree. Auto-discovered by Permissions Audit Dashboard via the `lowercase + space→underscore` derivation rule in `lib/permissions-audit/module-mappings.ts:61`.
  - `lib/sidebarMenuLink.ts`: 31 new `MENU_PERMISSIONS` route mappings for every page under `app/(routes)/ims/**` — dashboard, financial, indents (parent + new + pending + [id]), inventory (items + categories), reports (5 sub-pages share `ims.reports.view`), sales (POS + history + receipt + [id]), settings (stores/suppliers/units/unit-conversions), stock (parent + adjustments + batches + department + GRN lifecycle), transfers (parent + [id]).
  - `hooks/ims/use-ims-store-context.ts`: tightened `isStoreAdmin` predicate. Replaced coarse `Object.keys(permissions).some(k => k.startsWith('ims'))` (which incorrectly let any IMS user — e.g. POS cashier — into the store-picker UI) with explicit `permissions['ims.settings.stores.manage'] === true`. Picker is now reserved for users who can actually manage stores; cashiers fall back to `assigned_store_id` auto-resolve or Gate C dead-end.
  - `03_policies.sql`: appended IMS RLS section (~230 lines). Replaces legacy raw-role pattern with canonical `is_super_admin() OR is_admin(auth.uid()) OR (user_has_permission('key') AND role_has_institution_access(institution_id))`. **Closes 2 known security holes** flagged in `docs/modules/ims/2026-04-27-MODULE-supabase-database-schema.md §8`: `ims_supply_shipments` and `ims_supply_shipment_items` previously used `USING (true)` (any authenticated user could read every institution's transfers). Now requires `ims.transfers.view` + institution access. Coverage: 25 ims_* tables (13 institution-scoped root + 4 counters + 4 global ref + 4 child via parent-EXISTS).
  - **Why pg_temp helpers**: 25 tables × 4 policies = 100 near-identical DDL statements. Section uses three pg_temp PL/pgSQL helpers (institution-scoped, global ref, child FK-scoped) compressing the 100 statements to one template + per-table call. Helpers self-drop at session end (no permanent schema pollution); per-table permission keys passed as args remain explicit and greppable.
  - **Database-state safe**: entire RLS section wrapped in `to_regclass('public.ims_stores') IS NULL → RAISE NOTICE; RETURN`. Verified against connected staging (hhprjbgknupaplivtoib) — IMS migrations not yet applied there, so the section no-ops with the NOTICE on first run; will auto-apply when IMS DDL lands. Helper `pg_temp` functions only define if guard passes.
  - **Files NOT touched**: `01_tables.sql` (IMS tables defined elsewhere — schema doc references prod migration), `02_functions.sql` (synthetic key `ims.financial.write_admin_only` is intentionally never granted to any role — only `is_super_admin()`/`is_admin()` clauses can mutate financial transactions; mirrors how triggers run as DEFINER side-effects of sales/grn posting).
  - **FK assumption** in child-table block: parent FKs use convention `<parent_singular>_id` (`grn_id`, `indent_request_id`, `supply_shipment_id`, `sale_id`). Verify against `information_schema.columns` before applying in production if the IMS schema doc deviates.
  - Reversibility: each DROP POLICY IF EXISTS + recreate is idempotent. To roll back, replace the policies with the legacy `USING (institution_id = ... OR get_current_user_role() = 'super_admin')` pattern via the same helpers.

- **2026-04-23** — `learners_profiles.admission_year_id` shadow FK (PR-1 of 4-PR plan to wire admission_years into learners profiles)
  - New migration `supabase/migrations/learners_profiles_admission_year_id_shadow_fk.sql`
  - `01_tables.sql`: reconciled phantom `admission_year INTEGER` (column existed in prod but not in canonical source — was added directly via Supabase MCP earlier without explicit migration). Added new `admission_year_id UUID REFERENCES admission_years(id) ON DELETE SET NULL` shadow column.
  - `02_functions.sql`: new `validate_learner_admission_year_scope()` SECURITY DEFINER trigger function — rejects FK rows whose `institution_id` or `program_id` does not match the learner. Closes the cross-institution attach vector PG FK alone cannot enforce.
  - `04_triggers.sql`: new `trg_validate_learner_admission_year_scope` BEFORE INSERT/UPDATE OF (admission_year_id, institution_id, program_id).
  - **Scoped backfill**: 133 `lifecycle_status='admitted'` rows auto-filled with the latest active cohort for their (institution, program). 4,054 `active` rows + 440 `graduated` + others left NULL — director will edit manually via admitted-status UI on their schedule. Backfill is idempotent (`WHERE admission_year_id IS NULL`).
  - **Strategy**: shadow-column, not destructive replace. Legacy `admission_year INTEGER` kept in place for ≥1 release because 6 B2A endpoints (`/api/api-management/learners/*`, `/api/b2a/learners/*`, MCP tool) expose it as integer; breaking those mid-release would page external consumers. Both columns stay in sync — converter (PR-2) writes both.
  - `lib/types/database.ts`: targeted edit (3 occurrences in learners_profiles Row/Insert/Update) instead of full regenerate.
  - `types/learner-profile.ts`: added `admission_year_id?: string | null` and optional joined `admission_year_obj`.
  - Reversibility: column is nullable; trigger DROP recovers prior insert semantics; backfill skips already-filled rows.

- **2026-04-22** — Staff role mirror RPC (HOD still hit `user_roles` RLS even after PR #326)
  - New migration `supabase/migrations/20260422000004_mirror_staff_role_to_user_roles_rpc.sql`
  - New function `public.mirror_staff_role_to_user_roles(p_profile_id uuid, p_role_key text)` — SECURITY DEFINER, pinned search_path. Verifies caller has `staff.create` AND target is a real `staff.profile_id` row with matching `role_key` before upserting `user_roles`. `GRANT EXECUTE` to `authenticated`.
  - Root cause of remaining failure: `staff_insert_permission` RLS allows HOD to INSERT staff directly (they have `staff.create` + `role_has_institution_access`). So `/api/staff` fallback was never triggered, and the client-side `UserRolesService.assignRoles()` call (after successful direct insert) still hit `user_roles_insert_permission` which requires `roles.create`.
  - Fix: browser now calls the RPC instead of `user_roles.insert()`. Authorization is enforced inside the function (caller must have `staff.create` AND target must be a staff-linked profile with matching `role_key` — no drive-by role assignment possible).
  - Backfill: 2 orphan staff profiles from earlier HOD attempts had missing `user_roles` rows; backfilled via one-shot INSERT scoped to the last 2 hours (verified recovery for both).
  - Followup to PR #326 which fixed only the trigger half.

- **2026-04-22** — Staff INSERT fails 42501 "permission denied for table users" for HOD/non-super-admin staff.create
  - New migration `supabase/migrations/20260422000003_fix_sync_staff_trigger_auth_access.sql`
  - `02_functions.sql`: `sync_staff_to_profiles()` trigger function switched from SECURITY INVOKER (default) to SECURITY DEFINER with `SET search_path = public`. Body was also updated to mirror the live version that had drifted from source (profile_id-first lookup + auth-linked-first tiebreaker on email collisions).
  - Root cause: the trigger's email-fallback branch orders by `EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)` to prefer auth-linked profiles on duplicate emails. `auth.users` grants SELECT only to `postgres` — not to `service_role`/`authenticated`/`anon` — so with SECURITY INVOKER every insert failed unless the caller was the superuser. `POST /api/staff` uses `supabaseAdmin` (service_role) and still tripped it because the trigger ran as the invoker.
  - Fix: DEFINER makes the function execute as its owner (`postgres`), which has the grant. `search_path` is pinned to close the classic definer hijack vector. No behaviour change for callers.
  - Reported by director 2026-04-22 ~15:35 IST when HOD test user hit "Failed to create staff record" with server-side `code: 42501, message: 'permission denied for table users'`.

- **2026-04-22** — Service Requests: multi-approver per step (OR logic)
  - New migration `supabase/migrations/20260422000002_service_request_multi_approver_support.sql`
  - `01_tables.sql`: adds `approver_user_ids UUID[] NOT NULL DEFAULT '{}'` column to `service_request_approval_steps` + GIN index `idx_sr_approval_steps_approver_user_ids`.
  - `03_policies.sql`: extends "Approvers can view pending requests" to also match users listed in `approver_user_ids` (not just those whose role matches `approver_role`). Also picks up the institution-scope guard previously only in the migration file.
  - Semantics: empty array = legacy role-based matching; populated = approval restricted to listed users, first to act wins. `approver_role` stays populated (set to first selected user's role) so legacy inbox queries keep working.
  - Use case: service-type author wants to pick 2–5 specific users per step (e.g. "HOD Priya OR HOD Rahul OR Principal") instead of "any user with HOD role".

- **2026-04-22** — Hostel leave types seed expansion (+9 defaults) + fix bug in #287 migration
  - New migration `supabase/migrations/20260422000001_seed_hostel_leave_types_expansion.sql` (~90 lines, atomic BEGIN/COMMIT)
  - Seeds 9 new system defaults × 11 institutions = 99 rows: festival, family_function, bereavement, clinical_rotation, industrial_visit, internship, training, sports_cultural, convocation. All is_system=true so UI blocks delete (admins can deactivate via is_active toggle instead).
  - ON CONFLICT (institution_id, leave_type_code) DO NOTHING → re-run safe.
  - Applied to production via Supabase management API on 2026-04-22 ~10:15 IST. Verification count: 99 new rows confirmed (11 per code × 9 codes).
  - FIX to `supabase/migrations/20260421000005_hostel_leave_types_crudable.sql` (the original migration from PR #287): two UPDATE statements had invalid references to the UPDATE target `req` — one from a JOIN ON clause, one from a GROUP BY subquery. PG rejects both patterns. Rewritten: (1) moved `req.leave_type_code` condition from JOIN ON to WHERE; (2) replaced the `IN (SELECT ... GROUP BY)` subquery with a scalar `SELECT ... ORDER BY ... LIMIT 1` correlated subquery. Migration is now atomic-clean; applied successfully to prod during the apply flow.
  - Trigger: director feedback 2026-04-21 ~15:20 IST — "Leave types have to be increased, max days for each leave is not fixed." The CRUDable table (from #287) made this a data seed, not a DDL change.
  - Principle reference: `~/.claude/skills/myjkkn-chain/SKILL.md` Q1 — Value-list check (added 2026-04-21). This seed is the first test of the principle under fire — adding rows to an already-CRUDable master table instead of another enum migration.

- **2026-04-21** — BUG-003146 Expo per-stall accountability, operations, lead attribution
  - New migration `supabase/migrations/20260421200000_bug_003146_expo_event_stalls.sql` (~120 lines, atomic BEGIN/COMMIT)
  - New table `expo_event_stalls` (expo_event_id FK CASCADE, institution_id FK RESTRICT, stall_name, assigned_staff_id → profiles(id) SET NULL, total_expenses numeric, photos text[], promotional_materials jsonb, notes, created_by, created_at, updated_at). 3 indexes (expo_event_id, institution_id, assigned_staff_id partial).
  - `assigned_staff_id` references `profiles(id)` (matches existing `expo_event_team_members.staff_id` pattern) NOT `staff(id)`.
  - Adds nullable `admission_leads.stall_id` FK (SET NULL on stall delete) + partial index. Preserves all existing/non-expo leads.
  - 4 RLS policies using modern pattern: `is_super_admin() OR is_admin() OR (user_has_permission('admission.marketing.expos.{view,create,edit,delete}') AND role_has_institution_access(institution_id))`.
  - Reuses existing perm keys — no permission catalogue changes needed.
  - `updated_at` trigger via new `touch_expo_event_stalls_updated_at()` function.
  - DB migration must be applied manually post-merge (Supabase MCP is read-only).

- **2026-04-21** — Hostel leave types: enum → CRUDable master table (chain Q1 principle, director feedback "can leave types + duration be CRUDable")
  - New migration `supabase/migrations/20260421000005_hostel_leave_types_crudable.sql` (~320 lines, atomic BEGIN/COMMIT)
  - PHASE 1: New `public.hostel_leave_types` institution-scoped master table (code, name, description, color, default_max_duration_days, parent_consent/chief_warden/attachment flags, advance_notice_hours, sort_order, is_system, is_active). Unique (institution_id, leave_type_code), check color_code is hex, check durations are positive.
  - PHASE 2: Seed 7 defaults × every institution with `is_system=true` (home_visit, weekend, vacation, emergency, medical, academic, night_out). ON CONFLICT DO NOTHING = re-run safe.
  - PHASE 3: Add nullable `leave_type_id UUID FK` to `hostel_leave_type_config` + `hostel_leave_requests`. Backfill from existing enum via JOIN on (institution_id, leave_type_code). Enum column KEPT during transition — drop in future cleanup PR.
  - PHASE 4: 4 CRUD RLS policies on `hostel_leave_types` using new perms `campus_living.leave_types.{view,create,edit,delete}`. Delete policy includes `AND NOT is_system` so defaults cannot be deleted.
  - Frontend (PR-3b): replaces the 88-LOC ghost page at `/campus-living/settings/leave-types` with real CRUD consuming the shared `<CrudDataTable>` + `<CrudRowActions>` from PR-3a (#286).
  - Principle reference: `~/.claude/skills/myjkkn-chain/SKILL.md` Q1 — Value-list check (added 2026-04-21). Value lists masquerading as enums are the failure mode.

- **2026-04-21** — Hostel blocks ↔ multi-college junction (warden feedback follow-up to PR-4)
  - New migration `supabase/migrations/20260421000004_hostel_blocks_multi_college.sql` (~330 lines, atomic BEGIN/COMMIT)
  - PHASE 1: New `hostel_block_institutions` M2M (block_id, institution_id, is_primary, learner_year_groups[], floors_assigned[]) with partial unique index on is_primary=true.
  - PHASE 2: Backfill junction from existing `hostel_blocks.institution_id` (INSERT…ON CONFLICT DO NOTHING).
  - PHASE 3: `ALTER hostel_blocks.institution_id DROP NOT NULL` (DO block pre-checks is_nullable).
  - PHASE 4: New helper `role_has_hostel_block_scope(block_id, institution_id)` — super_admin ∪ user_block_access grant ∪ primary institution ∪ ANY junction institution.
  - PHASE 5: 4 CRUD RLS policies on `hostel_block_institutions` using new helper.
  - PHASE 6: Swap 4 CRUD policies on `hostel_blocks` from `role_has_institution_access` → `role_has_hostel_block_scope`. `hostel_rooms`/`beds`/`allocations` deliberately out of scope (next PR after junction data populated via xlsx loader — avoids lockout window).
  - Trigger: warden finding 2026-04-21 12:35 IST — 3 girls' blocks are shared across all 8 colleges, floors separate year-groups. 1-block = 1-college assumption in PR-4 was wrong.

- **2026-04-21** — Persona Design PR-4: Campus Living RLS retrofit + role permission wiring (the big one)
  - New migration `supabase/migrations/20260421000002_persona_design_pr4_rls_retrofit.sql` (~450 lines, atomic BEGIN/COMMIT)
  - PHASE 1: Drops 46 legacy `_institution_isolation` policies (FOR ALL + hardcoded 'super_admin' string — CLAUDE.md anti-pattern).
  - PHASE 2: Creates ~184 new policies (46 tables × 4 = SELECT/INSERT/UPDATE/DELETE) using the standardized pattern: `is_super_admin() OR is_admin() OR (user_has_permission(key) AND role_has_*_access(...))`.
    - 13 institution-only tables: +role_has_institution_access(institution_id)
    - 18 block-scoped tables (have block_id): +role_has_block_access(block_id)
    - 11 block-conceptual tables (no block_id column): app-layer filters block narrowing; RLS uses institution-only
    - 7 mess contract-scoped tables (have caterer_id): +role_has_contract_access(caterer_id, 'caterer')
  - PHASE 3: UPDATEs each of the 10 new roles' permissions jsonb with their scaffolding (warden gets 51 keys, chief_warden 84, accreditation_officer 23, etc.)
  - Atomic cutover — RLS and role perms land together (partial = all-super_admin-only lockout, avoided via BEGIN/COMMIT).
  - Depends on: #275 (PR-1 scope helpers), #276 (PR-2 10 roles), #277 (PR-3 permission keys)

- **2026-04-21** — Persona Design PR-3: +127 permission keys in PERMISSION_CATEGORIES (TypeScript-only, no DB migration)
  - `lib/constants/permissions.ts`: replaced 1-key Campus Living stub with 121 granular keys. Submodules: blocks, rooms, beds, allocations, wardens, gate_passes, visitors, leave, attendance, maintenance, housekeeping, laundry, safety (incl. anti_ragging), health, fees, deposits, mess (caterers/menu/meals/billing/feedback/waste), alerts, pulse, wellness, community, analytics, reports (NAAC/NIRF/AICTE/anti-ragging quarterly), parent_portal.
  - Also added 6 `users.*.access` keys for PR-1's scope-extension junction tables: `users.block_access.{view,manage}`, `users.relationship.{view,manage}`, `users.contract_access.{view,manage}`.
  - Catalog-sync verified: every MENU_PERMISSIONS campus_living.* key now has a PERMISSION_CATEGORIES home (was: 29 drift warnings; now: 0).
  - No DB changes — roles still have empty permissions jsonb. PR-4 bulk-updates each role's permissions to wire the new keys alongside RLS retrofit on 48 hostel_*/mess_* tables.

- **2026-04-21** — Persona Design PR-2: 10 new roles for Campus Living + external actors
  - New migration `supabase/migrations/20260421000001_persona_design_pr2_ten_roles.sql`
  - Roles seeded: warden, chief_warden, gate_security, housekeeping_staff, parent, mess_caterer, maintenance_vendor, hostel_office, anti_ragging_member, accreditation_officer
  - All have `permissions='{}'` (empty) and `module_scopes='{}'` — intentional. PR-3 adds catalog keys to `PERMISSION_CATEGORIES`; PR-4 retrofits RLS on 48 hostel_*/mess_* tables AND bulk-updates each role's permissions jsonb to grant its scaffolding.
  - `accreditation_officer` is the only scope=`all` role (cross-institution evidence pull for NAAC/NIRF/UGC). Nine others are scope=`own`. External actors (parent, mess_caterer, maintenance_vendor) use scope=`own` + row-level checks via PR-1 junction tables (user_block_access, user_learner_relationship, user_contract_access).
  - Idempotent via `ON CONFLICT (role_key) DO NOTHING`.
  - Depends on PR-1 (#275 merged 2026-04-21) for scope helpers.

- **2026-04-21** — Persona Design PR-1: scope-extension helpers (block/relationship/contract scopes)
  - `01_tables.sql`: new junction tables `user_block_access`, `user_learner_relationship`, `user_contract_access`. Each has `revoked_at` for soft-delete + audit trail. `user_contract_access.contract_id` is polymorphic (caterer/maintenance_vendor/laundry_vendor/amc).
  - `02_functions.sql`: 3 new SECURITY DEFINER helpers — `role_has_block_access(uuid)`, `role_has_relationship_access(uuid)`, `role_has_contract_access(uuid, text DEFAULT NULL)`. All mirror `role_has_institution_access()` pattern: super_admin bypass, NULL target = system-wide, otherwise consult junction table.
  - `03_policies.sql`: RLS on the 3 junction tables. Standard contract: super_admin/admin full CRUD; users see own grants; delegated via `users.block_access|relationship|contract_access.{view,manage}` permission keys (added in PR-3).
  - Context: MyJKKN's `institution_scope` supports only 'all'|'own'. Campus Living needs block-level (warden), relationship (parent), and contract (caterer/vendor) scopes. This PR is PR-1 of 4 — INERT infrastructure until PR-2 (roles), PR-3 (permission keys), PR-4 (RLS retrofit on 48 hostel_*/mess_* tables).
  - See: `docs/persona-design/scope-extension-pr1.md`

- **2026-04-18** — Seat Configuration page invisible to admission role with scope='all' (programs returned 0 rows)
  - `03_policies.sql`: rewrote SELECT/INSERT/UPDATE/DELETE policies on `programs`, `degrees`, `departments` to use `role_has_institution_access(institution_id)` instead of hardcoded `institution_id = get_current_user_institution_id()`. Added `admission.settings.seats.view` / `admission.settings.seats.manage` as acceptable SELECT permissions for programs/degrees/departments so seat config works without granting Organization module perms.
  - `03_policies.sql`: rewrote `intake_history` policies — previously required a `user_institution_access` row (locked out super admins who didn't have one). Now uses the standard contract `is_super_admin() OR is_admin() OR (role_has_institution_access(...) AND user_has_permission('admission.settings.seats.*'))`.
  - Root cause: the legacy own-institution equality check in RLS ignored `institution_scope='all'` on the admission role.

- **2026-04-15** — `get_user_roles_with_details` now returns scope columns (fixes "Employment Information section not hiding for own_records users")
  - `02_functions.sql`: added `institution_scope text` and `module_scopes jsonb` to the function's RETURNS TABLE. Required DROP+CREATE because Postgres can't ALTER return shape. Without these, client-side `usePermissions().getModuleScope()` always read undefined and fell back to defaults.
  - Migration: `user_roles_details_include_scopes`. No client code change required — existing `(r as any).module_scopes` reads now resolve.

- **2026-04-15** — `user_roles` RLS aligned to permission contract; staff edit no longer fails on no-op role resync
  - `03_policies.sql`: dropped 4 hardcoded `profiles.role IN ('super_admin','admin')` policies on `user_roles`. Added 4 contract policies keyed on `roles.{create,edit,delete}`. Self-view policies preserved.
  - `lib/services/staff/staff-service.ts`: `updateStaff` now skips `assignRoles` when `data.role_key === currentStaff.role_key` (avoided unnecessary DELETE+INSERT cycle that surfaced as a 42501 RLS error for callers without `roles.create`). Pre-fetch select extended to include `role_key`.
  - Migration: `user_roles_align_to_permission_contract`.

- **2026-04-15** — Per-module access scope (Option A) for custom roles
  - `01_tables.sql`: `custom_roles.module_scopes JSONB DEFAULT '{}'` (per-module scope override of `institution_scope`).
  - `02_functions.sql`: `get_user_module_scope(module_key)` returns most-permissive scope across user's roles; `role_has_module_access(module_key, institution_id, owner_email)` combines that with row-level checks.
  - `03_policies.sql`: staff SELECT/UPDATE/DELETE policies switched to `role_has_module_access('staff', institution_id, institution_email)`. INSERT stays institution-only ('own_records' doesn't apply to creation). Self-view via `institution_email = auth.email()` preserved.
  - Migration: `add_module_scopes_to_custom_roles` + `staff_rls_use_module_scope`. UI: new "Module Access Scope" section in Role Management edit dialog.

- **2026-04-15** — Staff module RLS aligned to permission contract (Tier C audit fix)
  - `02_functions.sql`: mirrored `role_has_institution_access(check_institution_id uuid)` back into source (was DB-only drift). SECURITY DEFINER, STABLE.
  - `03_policies.sql`: rewrote 4 `staff` policies + `employment_categories`, `custom_roles`, and `staff_plans` insert/update/delete policies to the standard contract `is_super_admin() OR is_admin() OR (user_has_permission(...) AND role_has_institution_access(institution_id))`. Dropped legacy hardcoded-role policies (incl. `staff_select_event_coordinator`, "Admins can manage staff_plans...", duplicate `custom_roles` SELECT policies). Preserved staff service-role bypass and email-based self-view/self-edit.
  - Migration: `staff_module_rls_align_to_permission_contract`. Pre-flight verified zero real-user impact.

- **2026-04-14** — Staff onboarding: dynamic role_key + conditional department scope
  - `01_tables.sql`: `staff.role_key` (FK → custom_roles), `staff.department_id` nullable, `employment_categories.is_teaching`, unique constraint on `category_name`
  - `02_functions.sql`: `sync_staff_to_profiles()` uses `NEW.role_key` instead of hardcoded `'faculty'`; UPDATE branch now resyncs role. New `validate_staff_department_scope()` enforces teaching→dept required, non-teaching→dept null.
  - `04_triggers.sql`: added `trg_validate_staff_department_scope` BEFORE INSERT/UPDATE on staff.
  - Seed: 12 new `employment_categories` rows (Facilitator + 11 non-teaching).

## 📁 Directory Structure

```
supabase/
├── setup/              # Initial setup files (RUN IN ORDER)
│   ├── 00_master_setup.sql    # Extensions, types, helper functions
│   ├── 01_tables.sql           # ALL table definitions
│   ├── 02_functions.sql        # Custom functions and procedures
│   ├── 03_policies.sql         # RLS policies for all tables
│   ├── 04_triggers.sql         # Database triggers
│   ├── 05_views.sql            # Database views
│   └── 06_seed_data.sql        # Optional seed data
├── migrations/         # Version-controlled migrations (DO NOT EDIT OLD FILES)
├── tables/            # Individual table references (READ-ONLY)
├── functions/         # Individual function references (READ-ONLY)
├── policies/          # Individual policy references (READ-ONLY)
├── triggers/          # Individual trigger references (READ-ONLY)
└── views/            # Individual view references (READ-ONLY)
```

## 🔴 STRICT RULES

### Rule 1: NEVER Create Duplicate Files

- ❌ DO NOT create new files for existing objects
- ✅ UPDATE existing files with proper comments

### Rule 2: File Update Protocol

When updating any SQL file:

```sql
-- Updated: 2025-01-16 by [reason]
-- Previous version backed up as comments below
-- [Your changes here]
```

### Rule 3: Single Location Policy

- Tables: ONLY in `setup/01_tables.sql`
- Functions: ONLY in `setup/02_functions.sql`
- Policies: ONLY in `setup/03_policies.sql`
- Triggers: ONLY in `setup/04_triggers.sql`
- Views: ONLY in `setup/05_views.sql`

## 📊 Current Database Objects

### Tables (101 total in database - Updated 2026-04-07 — added 18 Events/Marathon tables)

| Module          | Tables                                                                                                                                                                                                                  | Count | Status                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------- |
| Academic        | academic_years, degrees, departments, programs, semesters, sections, courses, course_mappings, regulations, batches                                                                                                     | 10    | ✅                          |
| Billing         | billing_student_bills, billing_receipts, billing_invoices, billing_invoice_items, billing_receipt_items, billing_discounts, billing_refunds, billing_categories (flat; 2026-04-15 consolidation — replaced parent/sub/item hierarchy) | 8     | ✅                          |
| Learners (Unified) | learners_profiles, intake_history | 2 | ✅ Complete - Single source of truth for enquiry→alumni lifecycle + capacity analytics |
| Students (Active Tables) | students | 1 | ✅ Live table with sync triggers → learners_profiles |
| Staff           | staff, staff_plans, staff_plan_courses                                                                                                                                                                                  | 3     | ✅                          |
| Admissions (Active Tables) | admissions | 1 | ✅ Live table with sync triggers → learners_profiles |
| Attendance      | periods, student_attendance                                                                                                                                                                                             | 2     | ✅                          |
| Timetable       | timetables, timetable_slot_continuity                                                                                                                                                                                   | 2     | ⚠️ Missing continuity table |
| Resources       | resources, resource_reservations, resource_approvals, resource_usage_logs, resource_parent_categories, resource_sub_categories, resource_attribute_definitions                                                          | 7     | ✅                          |
| Bug Reports     | bug_reports (+ module_name generated col 2026-03-23), bug_report_messages, bug_report_participants, bug_report_email_logs                                                                                               | 4     | ✅ Updated 2026-03-23 — added module_name GENERATED ALWAYS AS column + idx_bug_reports_module_name index |
| Notifications   | notifications, user_notifications, push_subscriptions                                                                                                                                                                   | 3     | ✅                          |
| API             | api_keys                                                                                                                                                                                                                | 1     | ✅                          |
| User Management | profiles, users, user_institution_access, custom_roles                                                                                                                                                                  | 4     | ✅                          |
| Dashboard       | dashboard_configurations, dashboard_widgets, dashboard_widget_types                                                                                                                                                     | 3     | ✅                          |
| Dashboard System | user_dashboard_preferences, dashboard_widgets                                                                                                                                                           | 2     | ✅ Personalized role-based widgets |
| **Engagement Analytics** | **user_sessions, daily_engagement_metrics, student_engagement_scores, mv_engagement_overview (materialized view)** | **4** | **✅ Complete - Advanced student engagement tracking** |
| **Lifecycle Analytics** | **usage_events, module_usage_daily, institution_health_scores, feature_usage_summary, usage_events_archive, mv_lifecycle_dashboard (materialized view)** | **6** | **✅ NEW - Cross-institution usage tracking and health scoring** |
| Child App Auth  | ~~child_app_analytics, child_app_auth_codes_bucket, child_app_unified_sessions~~ (REMOVED 2025-01-20)                                                                                                     | 0     | ❌ Dropped - moved to auth server                          |
| LTI Integration | lti_tools, lti_launches, lti_grades                                                                                                                                                                                         | 3     | ✅ Complete - MATLAB integration |
| **Service Requests** | **service_types (+ scope_level, institution_ids, degree_ids, department_ids, program_ids), service_type_fields, service_request_approval_steps, service_requests, service_request_approvals, service_request_timeline, service_request_attachments** | **7** | **✅ Updated 2026-03-19 - Added scope columns for institution/degree/department/program-level service types** |
| **Startup Studio** | **startup_events, event_registrations, event_team_members, event_venue_assignments, event_team_venue_allocations, event_staff_assignments, event_demo_slots, event_submissions, event_checklists, event_checklist_items, event_checklist_completions, event_team_attendance, appathon_role_cards, appathon_peer_tags, appathon_verifications** | **15** | **NEW - Generic event platform for hackathons/competitions** |
| **Post-Demo Day Pipeline** | **track_declarations, progression_levels, case_studies** | **3** | **NEW 2026-03-09 — Post-demo-day team path declaration, learner identity progression (5 levels), and case study narratives** |
| **Marketing**   | **marketing_leads_database** | **1** | **✅ NEW 2026-03-17 — Bulk-uploaded lead data for admission marketing campaigns** |
| **Events (Core)** | **events, event_categories, event_external_participants, events_registrations, event_payment_transactions** | **5** | **NEW 2026-04-07 — Base event platform shared by all event types (marathon, cultural fest, seminar, etc.)** |
| **Events (Marathon Extension)** | **marathon_sponsors, marathon_sponsor_deliverables, marathon_sponsor_activity_log, marathon_committees, marathon_tasks, marathon_budget_items, marathon_checkpoints, marathon_checkpoint_scans, marathon_results, marathon_incidents, marathon_volunteer_checkins, marathon_race_tracks, marathon_race_track_points** | **13** | **NEW 2026-04-07 — Marathon-specific tables: sponsor CRM, committees, budget, checkpoints, GPS live tracking, results** |
| Other           | applications (with parent auth + LTI), categories, subcategories, employment_categories, user_activity_logs, activity_stats, institution_departments, migration_log                                                           | 8     | ✅ Updated with auth + LTI  |

### Functions (244 total - Updated 2026-02-09)

| Category              | Location               | Count | Purpose                         |
| --------------------- | ---------------------- | ----- | ------------------------------- |
| Authentication & User | setup/02_functions.sql | 15    | User management, profiles, auth |
| Institution Access    | setup/02_functions.sql | 10    | Institution access control      |
| Billing               | setup/02_functions.sql | 20    | Billing calculations, invoices  |
| Attendance            | setup/02_functions.sql | 5     | Attendance statistics           |
| **Facilitator Attendance** | **setup/02_functions.sql** | **1** | **get_facilitator_attendance_stats() — periods marked per facilitator for live dashboard** |
| Timetable             | setup/02_functions.sql | 10    | Timetable management            |
| Academic              | setup/02_functions.sql | 15    | Academic hierarchy, validations |
| Staff                 | setup/02_functions.sql | 5     | Staff management                |
| Admission             | setup/02_functions.sql | 5     | Application ID generation, combined analytics |
| Bug Reports           | setup/02_functions.sql | 4     | Bug tracking                    |
| Resources             | setup/02_functions.sql | 6     | Resource management             |
| Notifications         | setup/02_functions.sql | 1     | User notifications              |
| API Keys              | setup/02_functions.sql | 4     | API key management              |
| **Service Requests**  | setup/02_functions.sql | **2** | **generate_service_request_number(), count_active_service_requests()** |
| Activity Logging      | setup/02_functions.sql | 2     | Log cleanup, stats              |
| **Engagement Analytics** | **Migrations**         | **6** | **Session management, metrics computation, engagement scoring** |
| Utilities             | setup/02_functions.sql | 10+   | Helper functions                |
| Dashboard             | setup/02_functions.sql | 2     | Dashboard reporting             |
| Permissions           | setup/02_functions.sql | 6     | Role and permission checks      |
| Child App Auth        | ~~setup/02_functions.sql~~ | 0     | ~~Session cleanup~~ (REMOVED 2025-01-20) |

### RLS Policies (250+ total)

| Location              | Count | Coverage          |
| --------------------- | ----- | ----------------- |
| setup/03_policies.sql | 250+  | 53 tables (94.6%) |

### Triggers (74 total - Updated 2025-01-18)

| Category              | Location              | Count | Purpose                      |
| --------------------- | --------------------- | ----- | ---------------------------- |
| Timestamp Updates     | setup/04_triggers.sql | 35    | Auto-update updated_at       |
| Business Logic        | setup/04_triggers.sql | 20    | Auto-populate, validations   |
| Billing               | setup/04_triggers.sql | 10    | Status updates, calculations |
| **Learner Sync (NEW)** | **Migrations** | **2** | **Bidirectional sync: admissions/students ↔ learners_profiles** |
| Attendance Validation | setup/04_triggers.sql | 1     | Staff assignment validation  |
| Other                 | setup/04_triggers.sql | 6     | Various business rules       |

### Views (10 total)

| View Name                       | Location           | Module      |
| ------------------------------- | ------------------ | ----------- |
| auto_generated_invoices         | setup/05_views.sql | Billing     |
| bill_invoice_relationships      | setup/05_views.sql | Billing     |
| v_bill_details                  | setup/05_views.sql | Billing     |
| bug_reporters_leaderboard       | setup/05_views.sql | Bug Reports |
| bug_reports_with_details        | setup/05_views.sql | Bug Reports |
| semester_hierarchy_health       | setup/05_views.sql | Academic    |
| semester_program_audit_view     | setup/05_views.sql | Academic    |
| hr_leave_types (compat)         | setup/05_views.sql | HR          |
| ims_department_stock_summary    | setup/05_views.sql | IMS         |
| ims_department_item_movements   | setup/05_views.sql | IMS         |

### Storage Buckets (7 total)

| Bucket              | Purpose                | Size Limit |
| ------------------- | ---------------------- | ---------- |
| applications        | Application documents  | 50MB       |
| avatars             | User profile pictures  | None       |
| bug-reports         | Bug report screenshots | 10MB       |
| institution-logos   | Institution branding   | None       |
| resource-management | Resource images        | 10MB       |
| staff-images        | Staff photos           | None       |
| student-photos      | Student photos         | None       |

### Indexes (382 total)

| Type         | Count | Purpose                      |
| ------------ | ----- | ---------------------------- |
| Primary Keys | 56    | Table primary keys           |
| Unique       | 95    | Unique constraints           |
| Foreign Key  | 0     | ⚠️ No FK constraints defined |
| Performance  | 231   | Query optimization           |

### Custom Types

| Type Name            | Location                  | Values                                                               |
| -------------------- | ------------------------- | -------------------------------------------------------------------- |
| user_role            | setup/00_master_setup.sql | super_admin, admin, institution_admin, staff, student, parent, guest |
| attendance_status    | setup/00_master_setup.sql | present, absent, late, excused, holiday                              |
| bill_status          | setup/00_master_setup.sql | pending, partial, paid, overdue, cancelled                           |
| academic_year_status | setup/00_master_setup.sql | upcoming, active, completed                                          |
| lifecycle_status     | setup/01_tables.sql       | enquiry, pending, approved, rejected, waitlisted, active, inactive, exited, graduated, alumni |
| student_status       | setup/01_tables.sql       | active, inactive, graduated, dropped, suspended (LEGACY - for backward compatibility) |

## 🚀 Setup Instructions

### For New Clone/Setup:

```bash
# Run in Supabase SQL Editor in this exact order:
1. Run supabase/setup/00_master_setup.sql
2. Run supabase/setup/01_tables.sql
3. Run supabase/setup/02_functions.sql (when created)
4. Run supabase/setup/03_policies.sql (when created)
5. Run supabase/setup/04_triggers.sql (when created)
6. Run supabase/setup/05_views.sql (when created)
7. Run supabase/setup/06_seed_data.sql (optional)
```

### For Updates:

```bash
# NEVER create new files. Update existing files:
1. Open the appropriate file based on object type
2. Add update comments with date and reason
3. Make your changes
4. Update this index file
5. Test in development first
```

## 📝 Change Log

### 2026-03-09: Post-Demo Day Pipeline — 3 New Tables

- **Files Updated**:
  - `supabase/setup/01_tables.sql` — Added `track_declarations`, `progression_levels`, `case_studies` tables with indexes
  - `supabase/setup/03_policies.sql` — Added RLS (ENABLE + 13 policies across 3 tables)
  - `supabase/setup/04_triggers.sql` — Added `update_case_studies_updated_at` trigger

  **Purpose**: Track team path declarations after Demo Day, individual learner identity-ladder progression (5 levels), and structured case study narratives for `solve_for_industry` / `jicate_solutions` tracks.

**track_declarations** — New table:
- `event_id` → `startup_events(id)`, `team_id` → `event_registrations(id)`
- `track TEXT` — `'solve_for_100'` | `'jicate_solutions'` | `'solve_for_industry'` | `'completed'`
- `declared_by` → `profiles(id)`, `declared_at TIMESTAMPTZ`
- `mentor_approved BOOLEAN`, `mentor_notes TEXT`, `approved_at`, `approved_by`
- UNIQUE on `(event_id, team_id)`

**progression_levels** — New table:
- `profile_id` → `profiles(id)`, `event_id` → `startup_events(id)`, `team_id` → `event_registrations(id)`
- `level INTEGER` (1–5), `level_name TEXT`, `achieved_at TIMESTAMPTZ`
- `evidence JSONB`, `awarded_by TEXT` (default `'system'`)
- UNIQUE on `(profile_id, event_id, level)`

**case_studies** — New table:
- `event_id` → `startup_events(id)`, `team_id` → `event_registrations(id)`
- `track TEXT` — `'solve_for_industry'` | `'jicate_solutions'`
- `problem TEXT`, `solution TEXT`, `proof TEXT`, `who_else TEXT`
- `demo_url TEXT`, `app_name TEXT`, `app_url TEXT`
- `score INTEGER`, `featured BOOLEAN` (default `false`)
- UNIQUE on `(event_id, team_id)`; `updated_at` auto-managed by trigger

---

### 2026-03-06: Facilitator Attendance Report — RPC Function

- **Files Updated**:
  - `supabase/setup/02_functions.sql` — Added `get_facilitator_attendance_stats()` RPC function
  - `supabase/setup/03_policies.sql` — Added `GRANT EXECUTE` for `authenticated` role

  **Purpose**: Aggregates `student_attendance.marked_by` counts per staff member to power the live facilitator attendance dashboard at `/attendance/consolidation/facilitators`. Returns summary totals, per-facilitator detail with weekly trend and daily heatmap data, and department-level breakdown — all as a single JSONB response.

  **Function signature**: `get_facilitator_attendance_stats(p_institution_id UUID, p_date_from DATE, p_date_to DATE, p_department_id UUID DEFAULT NULL, p_program_id UUID DEFAULT NULL, p_semester_id UUID DEFAULT NULL, p_facilitator_id UUID DEFAULT NULL) → JSONB`

---

### 2026-03-08: Demo Day Evaluation — appathon_verifications Table

- **Files Updated**:
  - `supabase/setup/01_tables.sql` — Added `appathon_verifications` table with 4 indexes
  - `supabase/setup/03_policies.sql` — Added RLS (ENABLE + 3 policies: SELECT, INSERT, UPDATE)

  **Purpose**: Core evaluation table for Demo Day. One row per evaluator per team. Evaluators verify team claims (live URL, user counts, revenue) during presentations and record tier scores (T1–T4) + revenue bonus. Calculated scores are server-recomputed and not trusted from client. Admission restricted to staff assigned as judge/panel_chair/evaluator for `demo_day` day_type.

**appathon_verifications** — New table:
- `submission_id` → `event_submissions(id)`
- `evaluator_id` → `profiles(id)`
- `venue_id` → `event_venue_assignments(id)`
- `presented BOOLEAN`, `presentation_slot INT`
- `app_live BOOLEAN`
- `claimed_users`, `claimed_active_users`, `claimed_revenue` — copied at freeze time
- `verified_users`, `verified_active_users`, `verified_revenue` — evaluator-confirmed
- `verified_tier INT`, `revenue_bonus INT`, `total_score INT` — server-computed
- `verification_status TEXT` — `'pending'` | `'verified'` | `'flagged'` | `'disqualified'`
- `flag_reason TEXT`, `notes TEXT`
- UNIQUE constraint on `(submission_id, evaluator_id)`

---

### 2026-03-07: Startup Studio — Per-Venue Team Attendance

- **Files Updated**:
  - `supabase/setup/01_tables.sql` — Added `event_team_attendance` table with 3 indexes and RLS enabled
  - `supabase/setup/03_policies.sql` — Added 4 RLS policies for `event_team_attendance`
  - `supabase/migrations/20260307000000_add_event_team_attendance.sql` — Applied migration ✅

  **Purpose**: Track per-team attendance for each day type (build_day / demo_day) at a given venue. Enforces a unique attendance record per `(event_id, registration_id, day_type)`. Insert/update restricted to admins or staff assigned to that venue; delete restricted to super admins.

**event_team_attendance** — New table:
- `event_id` → `startup_events.id`
- `registration_id` → `event_registrations.id`
- `venue_assignment_id` → `event_venue_assignments.id`
- `day_type TEXT` — `'build_day'` or `'demo_day'`
- `status TEXT` — `'present'` | `'absent'` | `'late'` (default `'present'`)
- `marked_by` → `profiles.id`
- `marked_at TIMESTAMPTZ`
- `notes TEXT`
- UNIQUE constraint on `(event_id, registration_id, day_type)`

---

### 2026-03-06: Startup Studio — Team Invitation Workflow

- **Files Updated**:
  - `supabase/setup/01_tables.sql` — Added `team_code` to `event_registrations`; added `learner_id`, `status`, `is_leader`, `responded_at` to `event_team_members`
  - `supabase/setup/02_functions.sql` — Added `generate_team_code()` function
  - `supabase/migrations/20260306000000_add_team_invitation_workflow.sql` — Applied migration ✅

  **Purpose**: Enable structured team-based participation in startup studio events. Teams are identified by an auto-generated institution-prefixed code; members can be invited by the team leader and must accept or decline before the event.

#### Updated 2026-03-06 — Team Invitation Workflow

**event_registrations** — Added column:
- `team_code TEXT` — Institution-wise auto-generated team code (e.g., `JKKN-001`). Generated via `generate_team_code()` DB function at registration time. Unique per `(event_id, institution_id)` combination.

**event_team_members** — Added columns:
- `learner_id UUID` → `learners_profiles.id` — Links member to verified learner profile for validated invitations
- `status TEXT` — Member workflow status: `pending` (invited, awaiting response) | `accepted` (confirmed member) | `declined` (rejected) | `removed` (removed by leader). Default: `accepted` (for backward compat with pre-invitation rows)
- `is_leader BOOLEAN` — Marks the team leader (auto-set to `true` for team owner at registration). Default: `false`
- `responded_at TIMESTAMPTZ` — When the invitee accepted or declined

**New DB function:**
- `generate_team_code(p_event_id UUID, p_institution_id UUID) → TEXT` — Generates sequential team codes using `institutions.counselling_code` as prefix. Defined in `supabase/setup/02_functions.sql`

---

### 2026-02-06: Lifecycle Analytics System

- **Files Updated**:
  - `setup/01_tables.sql` - Added 5 tables: usage_events, module_usage_daily, institution_health_scores, feature_usage_summary, usage_events_archive
  - `setup/02_functions.sql` - Added 7 functions: compute_module_usage_daily, refresh_lifecycle_dashboard_view, compute_institution_health_scores, backfill_usage_events, archive_old_usage_events, ensure_usage_events_partitions, compute_feature_usage_summary
  - `setup/03_policies.sql` - Added 12 RLS policies for all lifecycle analytics tables
  - `setup/05_views.sql` - Added mv_lifecycle_dashboard materialized view

  **Purpose**: Cross-institution lifecycle analytics dashboard with module-level usage tracking, health scoring, and report generation

  **Tables Created**:
  - `usage_events` - Raw event tracking (page visits, CRUD actions, exports)
  - `module_usage_daily` - Pre-aggregated daily rollup by institution/module
  - `institution_health_scores` - Composite health scores (Phase 2)
  - `feature_usage_summary` - Sub-feature level aggregation (Phase 3)
  - `usage_events_archive` - Archive for old events (Phase 3)

  **Views Created**:
  - `mv_lifecycle_dashboard` - Materialized view refreshed every 5 min for dashboard

  **Functions Created**:
  - `compute_module_usage_daily(target_date)` - Daily rollup from usage_events
  - `refresh_lifecycle_dashboard_view()` - MV refresh (every 5 min via pg_cron)
  - `compute_institution_health_scores(target_date)` - Health score calculation
  - `backfill_usage_events()` - One-time backfill from user_sessions
  - `archive_old_usage_events(months_to_keep)` - Monthly maintenance
  - `ensure_usage_events_partitions()` - Auto-create monthly partitions (Phase 3)
  - `compute_feature_usage_summary(target_date)` - Feature-level daily aggregation (Phase 3)

  **Application Layer (Phase 1)**:
  - Types: `types/usage-analytics.ts`
  - Service: `lib/services/analytics/usage-tracking-service.ts`
  - Service: `lib/services/analytics/lifecycle-dashboard-service.ts`
  - Middleware: `lib/middleware/usage-tracking-middleware.ts`
  - Middleware: `lib/middleware/url-module-mapper.ts`
  - Hooks: `hooks/analytics/use-lifecycle-dashboard.ts`, `use-module-breakdown.ts`
  - API: `app/api/analytics/usage/dashboard|modules|events|trends/route.ts`
  - UI: `app/(routes)/admin/lifecycle/page.tsx` + 6 components
  - Sidebar: Added "Lifecycle Analytics" to Administration group

  **Application Layer (Phase 2)**:
  - Service: `lib/services/analytics/health-score-service.ts`
  - Service: `lib/services/analytics/usage-report-service.ts`
  - Hooks: `hooks/analytics/use-health-scores.ts`, `use-institution-comparison.ts`, `use-lifecycle-reports.ts`
  - API: `app/api/analytics/usage/health-scores/route.ts`, `health-scores/[id]/route.ts`, `comparison/route.ts`, `reports/generate/route.ts`
  - UI: `institution-comparison-tab.tsx`, `reports-tab.tsx` (added to lifecycle dashboard)

  **Application Layer (Phase 3)**:
  - Live health score in KPI card with progress bar + color coding
  - Dormant institution alerts in Overview tab
  - Archive strategy: `ensure_usage_events_partitions()` + `compute_feature_usage_summary()`

### 2026-01-30: Personalized Dashboard System

- **Migration**: `migrations/20260130140000_create_dashboard_tables.sql` ✅ **APPLIED**

  **Purpose**: Personalized role-based dashboard system with customizable widget visibility per user

  **Tables Created**:
  - `user_dashboard_preferences` - Widget visibility preferences per user/role
    - Fields: user_id, role, widget_id, is_visible, created_at, updated_at
    - Composite primary key: (user_id, role, widget_id)
    - Indexes: user_role index, widget_id index
  - `dashboard_widgets` - Registry of available widgets per role
    - Fields: widget_id, role, title, description, category, default_visible, display_order
    - Composite primary key: (widget_id, role)
    - Indexes: role index, category index

  **Features**:
  - ✅ Role-based widget registry (student, faculty, leadership, admin)
  - ✅ Per-user widget visibility preferences
  - ✅ Customizable dashboard settings dialog
  - ✅ Widget grouping by category (Academic, Finance, Community, etc.)
  - ✅ Reset to defaults functionality
  - ✅ Optimistic UI updates
  - ✅ Mobile-responsive design

  **Application Layer**:
  - Service: `lib/services/dashboard/dashboard-preferences-service.ts`
  - Hooks: `hooks/dashboard/use-dashboard-preferences.ts`
  - Components:
    - `app/(routes)/dashboard/_components/dashboard-settings-dialog.tsx`
    - `app/(routes)/dashboard/_components/widget-visibility-settings.tsx`
    - `app/(routes)/dashboard/_components/widget-registry.ts`

  **Remaining Work**: Phases 2-6 (additional widgets, drag-and-drop, analytics, performance)

### 2025-01-19: Advanced Engagement Analytics System ⭐ NEW

- **Files Created**:
  - `migrations/20260119_create_engagement_analytics_schema.sql` ✅ **APPLIED**
  - `migrations/20260119_create_engagement_functions.sql` ✅ **APPLIED**
  - `migrations/20260119_create_engagement_jobs.sql` ⏳ **PENDING** (requires pg_cron extension)

- **Purpose**: Transform basic login/logout activity tracking into comprehensive student engagement analytics with role-based tracking, organizational hierarchy analytics, and at-risk student identification.

- **Architecture**: Hybrid Event Capture + Materialized Views
  - Real-time session tracking with organizational context
  - Pre-computed daily metrics via background jobs
  - Materialized view for fast dashboard queries (15-min refresh)
  - Hierarchical drill-down: Institution → Department → Program → Semester → Section → Student

- **Database Changes**:
  - **Tables Created (4)**:
    - `user_sessions` - Detailed session tracking with organizational context
      - Fields: session_id, user_id, login_at, logout_at, duration_seconds, device_type
      - Organizational context: institution_id → section_id hierarchy
      - Activity tracking: modules_accessed[], actions_count
      - 7 performance indexes
    - `daily_engagement_metrics` - Pre-aggregated daily metrics by hierarchy and role
      - Metrics: total_logins, unique_users, avg_session_duration, modules_per_user
      - 4 composite indexes for fast queries
    - `student_engagement_scores` - Individual student engagement tracking
      - Metrics: logins_7d/30d, avg_session_duration, total_time_spent, modules_accessed
      - Comparative: percentile_rank, section averages
      - Risk indicators: engagement_level (high/medium/low/at_risk), risk_factors[]
      - 6 indexes including partial index on is_at_risk
    - `mv_engagement_overview` - Materialized view for fast dashboard summaries
  - **Functions Created (6)**:
    - `close_user_session()` - Session closure and duration calculation
    - `add_module_to_session()` - Track module access
    - `get_user_organizational_context()` - Hierarchy context detection
    - `compute_daily_engagement_metrics()` - Daily metric aggregation
    - `compute_student_engagement_scores()` - Engagement scoring and risk identification
    - `cleanup_orphaned_sessions()` - Auto-close stale sessions
  - **Background Jobs (3)** - Using pg_cron:
    - Daily at 2 AM: Compute daily metrics
    - Daily at 3 AM: Compute student engagement scores
    - Every 15 minutes: Refresh materialized view
  - **RLS Policies (3)**:
    - Hierarchical access control based on user role
    - Students can view own sessions
    - Admins see institution/department scoped data

- **Application Layer Changes**:
  - **Service Layer (2 files)**:
    - `lib/services/analytics/session-tracking-service.ts` - Session management
    - `lib/services/analytics/engagement-service.ts` - Analytics business logic with hierarchical access control
  - **API Endpoints (4 files)**:
    - `app/api/analytics/engagement/route.ts` - Main metrics endpoint
    - `app/api/analytics/engagement/at-risk/route.ts` - At-risk students
    - `app/api/analytics/engagement/student/[id]/route.ts` - Student detail
    - `app/api/analytics/engagement/sections/compare/route.ts` - Section comparison
  - **React Hooks (4 files)**:
    - `hooks/analytics/use-engagement-metrics.ts` - Dashboard metrics (15-min refetch)
    - `hooks/analytics/use-at-risk-students.ts` - At-risk students (5-min refetch)
    - `hooks/analytics/use-student-engagement.ts` - Student detail
    - `hooks/analytics/use-section-comparison.ts` - Section comparison
  - **UI Components (7 files)**:
    - `components/analytics/engagement-filters.tsx` - Hierarchical filters
    - `components/analytics/student-engagement-table.tsx` - Full-featured data table
    - `components/analytics/at-risk-modal.tsx` - At-risk students modal
    - `components/analytics/student-detail-modal.tsx` - Student drill-down (3 tabs)
    - `components/analytics/section-comparison-table.tsx` - Section comparison
    - `components/analytics/charts/login-trend-chart.tsx` - Trend visualization
    - `components/analytics/charts/engagement-distribution-chart.tsx` - Distribution chart
  - **Types (1 file)**:
    - `types/analytics.ts` - 30+ interfaces for complete type safety
  - **Modified Files (2)**:
    - `app/auth/callback/route.ts` - Enhanced with session creation
    - `app/api/auth/logout/route.ts` - Enhanced with session closure
    - `app/(routes)/users/activity/page.tsx` - Added Engagement Analytics tab

- **Key Features**:
  - ✅ Automatic session tracking on login/logout
  - ✅ Device detection (mobile/tablet/desktop)
  - ✅ Module access tracking (academic, billing, etc.)
  - ✅ Engagement level calculation (high/medium/low/at_risk)
  - ✅ Percentile ranking within section
  - ✅ At-risk student identification with risk factors:
    - no_login_7d - No login in 7 days
    - inactive_7d - Inactive for 7+ days
    - below_20_percentile - Bottom 20% performance
    - low_session_duration - Below section average
    - limited_module_access - Using <3 modules
  - ✅ Section comparison with engagement scoring
  - ✅ Trend charts (30-day login activity)
  - ✅ Distribution charts (engagement levels)
  - ✅ Hierarchical access control (Faculty → HOD → Principal → Super Admin)
  - ✅ Export to CSV functionality

- **Dashboard Integration**:
  - Tabbed interface: "Activity Logs" + "Engagement Analytics"
  - Overview cards: Active Students (7d), At-Risk Count, Avg Session Duration, Avg Logins/Week
  - Interactive charts: Login Trend, Engagement Distribution
  - Section comparison (when semester selected)
  - Student engagement table with sorting/filtering/pagination
  - Click-through modals for at-risk students and student details

- **Access Control**:
  - Faculty: See only sections they teach
  - HOD: See department-level data
  - Principal: See institution-level data
  - Super Admin: Global access across all institutions

- **Performance Optimizations**:
  - 17 indexes across 4 tables
  - Materialized view for fast queries
  - React Query caching (15-min stale time for metrics)
  - Pagination (50 items per page)
  - Lazy loading for charts and modals

- **Completion Status**: 95% Complete
  - ✅ Phase 1: Database schema (100%)
  - ✅ Phase 2: Session tracking integration (100%)
  - ✅ Phase 3: Database functions (100%)
  - ✅ Phase 4: Service layer (100%)
  - ✅ Phase 5: API endpoints (100%)
  - ✅ Phase 6: React hooks (100%)
  - ✅ Phase 7: TypeScript types (100%)
  - ✅ Phase 8: UI components (100%)
  - ✅ Phase 9: Dashboard integration (100%)
  - ⏳ Phase 10: pg_cron job scheduling (pending extension verification)

- **Ready for Use**:
  - All components functional and integrated
  - Session tracking starts on next login
  - Manually run database functions to compute initial metrics:
    ```sql
    SELECT compute_daily_engagement_metrics(CURRENT_DATE - INTERVAL '1 day');
    SELECT compute_student_engagement_scores(CURRENT_DATE);
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_engagement_overview;
    ```
  - Schedule pg_cron jobs when ready (migration file available)

- **Impact**:
  - Complete visibility into student engagement patterns
  - Early identification of at-risk students for intervention
  - Data-driven insights for improving student success
  - Section-level performance comparison for faculty
  - Comprehensive audit trail of system usage
  - Foundation for predictive analytics and ML models

- **Documentation Updated**:
  - `supabase/SQL_FILE_INDEX.md` - Added new tables and functions
  - `IMPLEMENTATION_STATUS.md` - Comprehensive tracking document
  - All code includes JSDoc comments and type annotations

### 2025-01-18: Unified Learners Profiles (Phase 1 Complete)

- **Files**:
  - `setup/01_tables.sql` - Added learners_profiles table and lifecycle_status ENUM
  - `migrations/20250118_migrate_to_learners_profiles.sql` - Data migration script

  **Purpose**: Unify admissions and students tables into single learners_profiles table with complete lifecycle tracking

  **Changes**:
  - ✅ Created `lifecycle_status` ENUM with 10 values (enquiry → pending → approved → rejected → waitlisted → active → inactive → exited → graduated → alumni)
  - ✅ Created `learners_profiles` table with:
    - 100+ fields combining all data from admissions + students
    - Migration lineage fields (original_admission_id, original_student_id, migrated_at, migration_source)
    - Unified lifecycle_status replacing dual status enums
    - Support for regulation_id and batch_id
  - ✅ Created 21 performance indexes for learners_profiles
  - ✅ Marked admissions and students tables as LEGACY (will become VIEWs in Phase 2)
  - ⏳ Migration script ready to execute (migrates 3,506 records: 535 admissions + 2,971 students)

  **Migration Strategy**:
  - Scenario A: Merged records (admission + student) - uses student data as primary source
  - Scenario B: Admission-only records (pending/approved applications)
  - Scenario C: Student-only records (orphaned or direct-created students)
  - Zero data loss verification with rollback capability

  **Impact**:
  - Single source of truth for all learner data from enquiry to alumni
  - Eliminates data duplication (60+ duplicate fields)
  - Expected 33% faster queries with optimized indexes
  - Complete audit trail with original IDs preserved
  - Enables comprehensive lifecycle analytics

  **Phase 2 Status:** ✅ **COMPLETE - REVISED APPROACH** (2025-01-18)
  - ❌ **Original Plan:** VIEWs for backward compatibility - **FAILED** (PostgREST can't detect FK relationships on VIEWs)
  - ✅ **Revised Plan:** Keep original tables + sync triggers
  - ✅ Restored admissions and students tables from legacy backups
  - ✅ Created bidirectional sync triggers:
    - `trg_sync_admission_to_learners` - admissions → learners_profiles
    - `trg_sync_student_to_learners` - students → learners_profiles
  - ✅ Verified PostgREST joins work correctly (institution, degree, department, program)
  - ✅ All existing frontend code works without changes
  - ✅ Data stays synchronized automatically via triggers

  **Phase 3 Status:** ✅ **COMPLETE** (2025-01-18)
  - ✅ Created comprehensive TypeScript types (types/learner-profile.ts - 500+ lines)
    - LifecycleStatus type with 10 values
    - Complete LearnerProfile interface (100+ fields)
    - Validation schemas with Zod
    - Status transition rules and required fields map
    - Dashboard analytics interfaces
  - ✅ Created LearnerProfileService (lib/services/learner-profile-service.ts - 550+ lines)
    - Complete CRUD operations with joins
    - Lifecycle status management with validation
    - Enrollment workflow (approved → active)
    - Analytics & dashboard methods
    - Bulk operations and utilities
  - ✅ Created React Query hooks (hooks/use-learner-profiles.ts - 300+ lines)
    - 16 query hooks (get, list, analytics, filtered lists)
    - 7 mutation hooks with optimistic updates
    - Common use case hooks (useEnquiries, useActiveStudents, etc.)
    - Prefetch utilities for performance

  **Implementation Status:**
  - **Phase 1:** ✅ Complete - Database foundation (2,973 records migrated)
  - **Phase 2:** ✅ Complete - Backward compatibility (VIEWs working)
  - **Phase 3:** ✅ Complete - Service layer ready for use
  - **Phase 4-5:** ⏳ Pending - Route migration and cleanup (optional gradual rollout)

  **Ready for Development:**
  - New code can now use learners_profiles table directly
  - Old code continues working via VIEWs (zero breaking changes)
  - Gradual migration can proceed module-by-module
  - Feature flags can control rollout pace

### 2025-11-28: Combined Enrollment Analytics Function

- **File**: `migrations/combined_enrollment_analytics.sql` ✅ **APPLIED**

  **Purpose**: Created database function for combined admissions + students analytics dashboard

  **Changes**:
  - Added `get_combined_enrollment_analytics()` function
    - Returns combined statistics from both `admissions` and `students` tables
    - Supports filtering by institution, date range, degree, department, program
    - Calculates: combinedTotal, totalAdmissions, totalStudents, pending, approved, rejected, waitlisted, enrolled, onboarded, directStudents, pendingProfile, conversionRate, onboardingRate, avgProcessingDays
  - Added 3 performance indexes:
    - `idx_admissions_analytics_combined` - Composite index on (institution_id, status, created_at)
    - `idx_students_onboarded_status` - Partial index for active students
    - `idx_students_direct_enrolled` - Partial index for direct students (no admission_id)

  **Impact**:
  - Dashboard shows combined view of admissions pipeline + student onboarding
  - Onboarded count now tracks students with `status = 'active'`
  - Direct students (added without admission) are now visible in analytics

### 2026-01-12: LTI 1.3 Integration for MATLAB

- **Files**:
  - `migrations/20260112100000_create_lti_tables.sql` ✅ **APPLIED**
  - `migrations/20260112100001_add_lti_fields_to_applications.sql` ✅ **APPLIED**

  **Purpose**: Enable LTI 1.3 (Learning Tools Interoperability) integration with MathWorks MATLAB suite (Grader, Online, Academy)

  **Changes**:
  - **Created 3 new tables**:
    - `lti_tools` - Registry of LTI 1.3 tools with configurations
    - `lti_launches` - Tracks every tool launch with academic context
    - `lti_grades` - Stores grade passback from MATLAB to MyJKKN
  - **Created 17 indexes** for performance:
    - 2 on lti_tools (active status, tool type)
    - 8 on lti_launches (user, learner, institution, context, resource, created, tool, nonce)
    - 7 on lti_grades (user, learner, institution, resource, launch, unsynced, received)
    - 1 composite on learners_profiles (roster queries)
  - **Created 6 RLS policies** for multi-tenant security
  - **Created 2 database functions**:
    - `get_lti_roster()` - Returns active students for Names & Roles service
    - `get_lti_launch_stats()` - Analytics for launch tracking
  - **Created 1 trigger function**:
    - `populate_lti_grade_fields()` - Auto-calculates score percentage and idempotency key
  - **Updated applications table**:
    - Added `lti_tool_id` column (foreign key to lti_tools)
    - Created index `idx_applications_lti_tool`

  **LTI 1.3 Features Supported**:
  - ✅ JWT-based authentication with RS256 signing
  - ✅ Single Sign-On (SSO) - no separate login for MATLAB
  - ✅ Grade passback (Assignment & Grade Services)
  - ✅ Roster sync (Names & Roles Service)
  - ✅ Context claims (program, semester, section)
  - ✅ Multi-tenancy with institution isolation
  - ✅ Learner lifecycle integration (only 'active' students can launch)
  - ✅ Security: JWT nonce, idempotency keys, rate limiting ready

  **Integration Architecture**:
  - Student clicks MATLAB Grader in Application Hub
  - MyJKKN generates LTI 1.3 JWT with user/academic context
  - MATLAB validates JWT and creates session (no separate login)
  - Student completes assignment in MATLAB
  - MATLAB passes grade back to MyJKKN automatically
  - Grade appears in student's grades view

  **Next Steps (Phase 1)**:
  - Register 3 MATLAB applications in Application Hub
  - Implement simple link integration (MATLAB Online, MATLAB Academy)
  - Phase 2: LTI core implementation (JWT generation, launch flow)
  - Phase 3: MathWorks registration & end-to-end testing
  - Phase 4: Grade passback implementation
  - Phase 5: Roster sync implementation
  - Phase 6: Analytics & monitoring

  **Files Updated**:
  - `types/lti.ts` - Complete TypeScript types for LTI integration
  - `supabase/SQL_FILE_INDEX.md` - Documentation updated

### 2025-01-20

- **Child App Authentication Cleanup**
  - Dropped 3 child app tables (child_app_analytics, child_app_auth_codes_bucket, child_app_unified_sessions)
  - Dropped 1 function (cleanup_expired_child_app_sessions)
  - Total cleanup: 440 rows, ~1.8 MB of data
  - Reason: Authentication flow moved to separate auth server (auth.jkkn.ai)
  - Migration: 20250120_cleanup_child_app_tables.sql
  - Preserved: applications and profiles tables (data synced to auth server)
  - Updated table comments to reflect new architecture

### 2025-01-17

- **Complete Database Analysis Performed**
- Created setup/02_functions.sql with 237 functions
- Created setup/03_policies.sql with 250+ RLS policies
- Created setup/04_triggers.sql with 71 triggers
- Created setup/05_views.sql with 7 views
- Generated comprehensive DATABASE_ANALYSIS_REPORT.md
- Identified critical issues (no foreign keys)
- Updated index with complete database structure
- **Parent Authentication Integration with Applications Module**
  - Added authentication fields to applications table in setup/01_tables.sql
  - Created migration file 20250117_add_auth_to_applications.sql
  - Updated TypeScript types to support authentication
  - Integrated authentication settings into application form UI
  - Applications can now optionally use MyJKKN authentication instead of separate login

### 2025-01-16

- Created organized structure
- Consolidated all existing SQL into proper files
- Established single source of truth policy

## ⚠️ Common Mistakes to Avoid

1. **Creating files like:**

   - ❌ `admission_module_schema.sql`
   - ❌ `organization_module_setup.sql`
   - ❌ `staff_module_setup.sql`
   - ❌ `billing_module_complete.sql`

2. **Instead, update:**
   - ✅ `setup/01_tables.sql` for any table changes
   - ✅ `setup/02_functions.sql` for function changes
   - ✅ This index file when changes are made

## 🔍 Quick Search

### Find billing-related objects:

- Tables: student_bills, billing_receipts in `setup/01_tables.sql`
- Functions: (to be added in `setup/02_functions.sql`)

### Find attendance-related objects:

- Tables: daily_attendance in `setup/01_tables.sql`
- Functions: (to be added in `setup/02_functions.sql`)

### Find user/auth-related objects:

- Tables: profiles in `setup/01_tables.sql`
- Functions: auth.\* functions in `setup/00_master_setup.sql`

## 📝 Recent Migrations

### 2026-02-03: SAML Identity Provider Tables

- **File**: `migrations/20260203000001_create_saml_tables.sql`
- **Tables Added**:
  - `saml_service_providers`: Registry of trusted SAML SPs (e.g., MathWorks)
  - `saml_sessions`: Track active SSO sessions for Single Logout
- **Functions**: `cleanup_expired_saml_sessions()` - Remove expired sessions
- **Purpose**: Enable SAML SSO with MathWorks and other external systems

### 2026-02-02: Apply Advanced Analytics Columns to Database ✅ APPLIED

- **File**: `migrations/20260202_add_advanced_analytics_columns.sql` ✅ **APPLIED**

  **Purpose**: Apply the advanced analytics schema changes that were added to `01_tables.sql` but never executed on the actual database

  **Problem Solved**:
  - Runtime errors: "column learners_profiles.first_graduate does not exist"
  - Runtime errors: "column learners_profiles.school_type does not exist"
  - Runtime errors: "column programs.sanctioned_intake does not exist"
  - Schema file and actual database were out of sync

  **Changes Applied**:
  1. **programs table** (3 new columns):
     - `sanctioned_intake INTEGER DEFAULT 0` - Government approved intake capacity
     - `actual_intake INTEGER DEFAULT 0` - Actual students admitted
     - `academic_year_id UUID` - Reference to academic year

  2. **learners_profiles table** (6 new columns):
     - `school_type TEXT` - Type of previous school (government/aided/private/cbse/icse/state_board)
     - `school_district TEXT` - District of previous school
     - `school_taluk TEXT` - Taluk of previous school
     - `medium_of_instruction TEXT` - Medium in previous school (english/tamil/both)
     - `location_type TEXT` - Student residence classification (urban/semi_urban/rural)
     - `first_graduate BOOLEAN DEFAULT false` - First generation graduate in family

  3. **intake_history table** (NEW):
     - Tracks historical intake data for 3-year stability index
     - Foreign keys to institutions, programs, academic_years
     - Unique constraint on (program_id, academic_year_id)

  4. **Indexes Created** (8 new):
     - 3 for intake_history (program, year, institution)
     - 4 for learners_profiles analytics fields
     - 1 for programs academic_year_id

  **Verification**:
  ```sql
  -- Verified all columns created successfully:
  - programs: sanctioned_intake, actual_intake, academic_year_id ✅
  - learners_profiles: school_type, school_district, school_taluk,
                       medium_of_instruction, location_type, first_graduate ✅
  - intake_history: table created with 10 columns ✅
  ```

  **Impact**:
  - ✅ All advanced analytics features will work correctly
  - ✅ No more runtime column errors
  - ✅ Intake & Capacity analytics functional
  - ✅ Geography analytics functional
  - ✅ Trends analytics functional
  - ✅ School Feeders analytics functional
  - ✅ Fully backward compatible (all columns nullable/have defaults)

  **Status**: ✅ **COMPLETE - MIGRATION APPLIED SUCCESSFULLY** (2026-02-02 via Supabase MCP)

### 2025-12-29: Enhanced Program and Semester Fields

- **File**: `migrations/add_program_semester_enhanced_fields.sql` ✅ **APPLIED**

  **Purpose**: Add enhanced metadata fields to programs and semesters tables for better UI control and academic structure management

  **Programs Table Changes** (6 new fields):
  - `program_type` VARCHAR(10) - Program level: UG, PG, Ph.D (nullable)
  - `display_name` TEXT - Alternative display name (nullable)
  - `program_order` INTEGER - Sort order for UI display (default: 0)
  - `program_duration_yrs` NUMERIC(3,1) - Duration in years (nullable, must be > 0)
  - `pattern_type` VARCHAR(10) - Academic pattern: Year/Semester (nullable)
  - `is_part_time` BOOLEAN - Part-time program flag (default: false)

  **Semesters Table Changes** (4 new fields):
  - `semester_order` INTEGER - Chronological order (default: 1)
  - `initial_semester` BOOLEAN - First/entry semester flag (default: false)
  - `terminal_semester` BOOLEAN - Final/exit semester flag (default: false)
  - `semester_group` VARCHAR(50) - Grouping label (nullable)

  **Indexes Created**:
  - `idx_programs_type_order` - Programs filtered by type and order (partial)
  - `idx_programs_pattern_type` - Programs filtered by pattern type (partial)
  - `idx_semesters_order` - Semesters ordered by program
  - `idx_semesters_initial` - Initial semesters by program (partial)
  - `idx_semesters_terminal` - Terminal semesters by program (partial)
  - `idx_semesters_group` - Semesters filtered by group (partial)

  **Impact**:
  - ✅ All new fields are optional/nullable (backward compatible)
  - ✅ TypeScript types updated in `types/organizations.ts`
  - ✅ API endpoints automatically support new fields via spread operator
  - ✅ Enhanced filtering and sorting capabilities
  - ✅ Better UI/UX control for program and semester displays
  - ✅ Supports year-based and semester-based academic patterns

  **Files Updated**:
  - `setup/01_tables.sql` - Updated table definitions with new columns
  - `types/organizations.ts` - Added new fields to interfaces and DTOs
  - `migrations/add_program_semester_enhanced_fields.sql` - Migration file

### 2025-11-28: Add Academic Year to Admissions Table

- **File**: `migrations/add_academic_year_to_admissions.sql` ✅ **APPLIED**

  **Purpose**: Move Academic Year field from Learner Onboarding to Admission page

  **Changes**:
  - Added `academic_year_id` column (UUID) to `admissions` table
  - Added foreign key reference to `academic_years` table
  - Created index `idx_admissions_academic_year_id` for performance

  **Workflow Change**:
  - **Before**: Academic Year was entered during Learner Onboarding (after admission approval)
  - **After**: Academic Year is captured during Admission process and automatically copied to Student record

  **Impact**:
  - ✅ Academic Year field now available on Admission form (Course Selection tab)
  - ✅ Students created from approved admissions inherit `academic_year_id`
  - ✅ Reduces onboarding steps if academic year was set during admission
  - ✅ Backward compatible - existing admissions have NULL academic_year_id

### 2025-02-07: Bug Report Display ID Race Condition Fix 🚨 CRITICAL

- **File**: `migrations/20250207_fix_bug_report_display_id_race_condition.sql` ✅ **APPLIED**

  **Problem Solved**:
  - Fixed race condition causing "Unable to generate report ID" errors
  - Eliminated ~87% failure rate during concurrent bug submissions
  - Gap of 2,062 between actual reports (306) and max ID (2368) proved the issue

  **Solution**:
  - Replaced `SELECT MAX()+1` pattern with PostgreSQL SEQUENCE
  - Created `bug_reports_display_id_seq` starting at 2369
  - Updated `generate_bug_display_id()` to use atomic `nextval()` operation
  - Recreated triggers to use new function

  **Impact**:
  - ✅ Zero race conditions (atomic database operations)
  - ✅ Perfect concurrency handling (unlimited simultaneous users)
  - ✅ No more user-facing errors
  - ✅ Consecutive IDs with no gaps (except deletions)

  **Testing**:
  - Verified 10 consecutive unique IDs generated successfully
  - Confirmed trigger functioning correctly
  - Sequence properly configured and indexed

  **Files Updated**:
  - `setup/02_functions.sql` - Updated function to use SEQUENCE
  - `migrations/20250207_fix_bug_report_display_id_race_condition.sql` - Migration file

### 2025-01-16: Leave Permissions Migration to Academic Format

- **File**: `migrations/update_leave_permissions_to_academic_format.sql` ✅ **APPLIED**

  **Purpose**: Fix permission key mismatch preventing HOD and other users from accessing Leave Management module

  **Problem**:
  - Sidebar menu requires `academic.leaves.view` permission
  - Permission constants defined as `leave.view`
  - Database roles had old `leave.*` permission keys
  - Mismatch prevented menu from showing even when permissions were granted

  **Solution**:
  - Created transformation function to migrate all leave permission keys
  - Updated 3 roles: admission, hod, student
  - Transformed basic permissions: `leave.view` → `academic.leaves.view`, etc.
  - Consolidated settings permissions: `leave.types.*`, `leave.workflows.*`, `leave.settings.*` → `academic.leaves.manage`
  - Migrated approval permissions: `leave.approve.*` → `academic.leaves.approve.*`
  - Migrated report permissions: `leave.reports.*` → `academic.leaves.reports.*`
  - Migrated analytics permissions: `leave.analytics.*` → `academic.leaves.analytics.*`

  **Impact**:
  - ✅ HOD role now has 15 academic.leaves.* permissions
  - ✅ All old `leave.*` keys removed from database
  - ✅ Menu visibility now works correctly for granted permissions
  - ✅ Zero breaking changes (only key format changed)
  - ✅ Backward compatible with existing permission checks

  **Files Updated**:
  - `lib/constants/permissions.ts` - Updated permission definitions
  - `migrations/update_leave_permissions_to_academic_format.sql` - Database migration
  - `custom_roles` table - Updated permissions JSONB for 3 roles

### 2025-01-30: Resource Management - Missing Fields Implementation

- **File**: `migrations/20250130_add_missing_resource_fields.sql` ✅ **APPLIED**

  - Added structured vendor address fields:
    - `vendor_address_line1`, `vendor_address_line2`
    - `vendor_city`, `vendor_state`, `vendor_zip`
    - `vendor_contract_details`, `vendor_support_contact`
  - Added lifecycle management fields:
    - `depreciation_rate` (%, 0-100)
    - `current_value` (current estimated value)
    - `disposal_date` (planned retirement date)
  - Created indexes for disposal_date and vendor_city
  - Dropped old `vendor_address` column (replaced with structured fields)

### 2025-01-30: Resource Management Module Update

- **File**: `migrations/20250130_update_resources_table.sql` ✅ **APPLIED**

  - Added missing columns to `resources` table:
    - `caretaker_user_ids TEXT[]` - Array of staff IDs
    - `name`, `subcategory_id`, location fields, vendor fields
    - `booking_config`, `approval_config`, `reminder_config` JSONB
    - `image_urls`, `tags`, `access_roles` arrays
    - Usage tracking fields
  - Created indexes for better performance

- **File**: `migrations/20250130_create_resource_storage_bucket.sql` ✅ **APPLIED**
  - Created `resource-images` storage bucket
  - Set up RLS policies for image upload/access
  - Configured 5MB file size limit
  - Allowed image MIME types only

### 2025-01-27: Fix Sync Missing Profiles - Add learner_id to profiles

- **File**: `migrations/20250127_add_learner_id_to_profiles.sql` ✅ **APPLIED**

  **Purpose**: Fix "Sync Missing Profiles" functionality by adding bidirectional link between profiles and learners_profiles tables

  **Problem Solved**:
  - Profiles were created but not linked to learners (missing `learner_id`)
  - Students couldn't see their own profiles (filter by `learner_id` failed)
  - Sync function reported same missing profiles repeatedly
  - RLS policies failing (relied on non-existent `learner_id`)
  - Missing `department_id` in profile creation logic

  **Changes**:
  - Added `learner_id UUID` column to `profiles` table with foreign key to `learners_profiles(id)`
  - Added `department_id UUID` column to `profiles` table with foreign key to `departments(id)`
  - Created 3 indexes:
    - `idx_profiles_learner_id` - Fast lookup by learner
    - `idx_profiles_learner_id_unique` - Prevent duplicate profiles per learner (unique constraint)
    - `idx_profiles_department_id` - Department-level queries
  - Backfilled existing profiles:
    - Matched by `LOWER(email)` for case-insensitive comparison
    - Set `learner_id` for active/inactive/exited students
    - Set `department_id` from learners_profiles

  **Code Changes**:
  - Updated `app/api/learners/create-missing-profiles/route.ts`:
    - Added `learner_id: learner.id` to profile creation
    - Added `department_id: learner.department_id` to profile creation
    - Fixed phone field: `learner.mobile` → `learner.student_mobile`
  - Updated `app/api/learners/complete-onboarding/route.ts`:
    - Added `learner_id: learner.id` to profile creation
  - Updated `supabase/setup/01_tables.sql`:
    - Added `learner_id UUID` and `department_id UUID` columns to profiles table definition
  - Updated `types/auth.ts`:
    - Added `learner_id: string | null` to Profile interface

  **Impact**:
  - ✅ Profiles now properly linked to learners
  - ✅ Students can see their own profiles
  - ✅ Sync function works correctly
  - ✅ RLS policies function properly
  - ✅ Fast joins between profiles ↔ learners_profiles
  - ✅ Referential integrity maintained
  - ✅ Department-level filtering enabled

  **Files Updated**:
  - `supabase/migrations/20250127_add_learner_id_to_profiles.sql` (NEW)
  - `supabase/setup/01_tables.sql` (Updated profiles table)
  - `app/api/learners/create-missing-profiles/route.ts` (Added learner_id, department_id, fixed phone field)
  - `app/api/learners/complete-onboarding/route.ts` (Added learner_id)
  - `types/auth.ts` (Added learner_id to Profile interface)
  - `docs/fixes/2025-01/2025-01-27-FIX-sync-missing-profiles.md` (NEW - Documentation)

### 2025-01-27: Sync Profile Data from Learners (Role, Institution, Department)

- **Migration**: `fix_duplicate_learner_ids` + `sync_existing_profile_data_from_learners` + `add_unique_constraint_learner_id` ✅ **APPLIED**

  **Purpose**: Ensure profiles stay in sync with learner data (role, institution_id, department_id)

  **Problem Solved**:
  - Students showing with wrong role ('guest', 'faculty' instead of 'student')
  - Profiles had wrong institution_id (not matching learner's institution)
  - Profiles had wrong department_id (not matching learner's department)
  - Duplicate profiles with same learner_id (2 cases found and fixed)

  **Changes Applied**:
  1. **Fixed duplicate learner_ids**:
     - Found 2 profiles with duplicate learner_id values
     - Cleared learner_id from profiles with mismatched emails
     - Re-backfilled with correct email matching

  2. **Created sync function** - `sync_profile_data_from_learners()`:
     ```sql
     CREATE OR REPLACE FUNCTION sync_profile_data_from_learners()
     RETURNS INTEGER
     -- Updates role, institution_id, department_id from learners to profiles
     -- Returns count of profiles updated
     ```

  3. **One-time data sync**:
     - Fixed 3 profiles with wrong role (faculty→student, guest→student)
     - Fixed 2 profiles with wrong institution_id
     - Fixed 2 profiles with wrong department_id

  4. **Added unique constraint**:
     - `idx_profiles_learner_id_unique` - Prevents duplicate profiles per learner

  **Function Details**:
  - **Name**: `sync_profile_data_from_learners()`
  - **Returns**: INTEGER (count of profiles updated)
  - **Security**: SECURITY DEFINER
  - **Permissions**: Granted to authenticated and service_role
  - **Called by**: Sync Missing Profiles API + can be called manually

  **Profiles Fixed**:
  | Email | Issue | Status |
  |-------|-------|--------|
  | vijayabharathyrpcse2022@jkkn.ac.in | Role: faculty → student | ✅ |
  | jeevananthame24uba@jkkn.ac.in | Role: guest → student | ✅ |
  | keerthana23ucsai@jkkn.ac.in | Role: guest → student | ✅ |
  | roshinia25uen@jkkn.ac.in | Institution & Department synced | ✅ |
  | soundharyan25uen@jkkn.ac.in | Institution & Department synced | ✅ |

  **Code Changes**:
  - Updated `app/api/learners/create-missing-profiles/route.ts`:
    - Added call to `sync_profile_data_from_learners()` before creating new profiles
    - Ensures existing profiles stay in sync on every sync operation

  **Impact**:
  - ✅ All profiles with learner_id now have correct role='student' (100%)
  - ✅ All profiles with learner_id have correct institution_id (100%)
  - ✅ All profiles with learner_id have correct department_id (100%)
  - ✅ No duplicate learner_ids (unique constraint enforced)
  - ✅ Automatic sync on every "Sync Missing Profiles" button click
  - ✅ Students get correct role-based permissions
  - ✅ Accurate analytics and reporting by institution/department

  **Verification**:
  ```sql
  -- Test the function
  SELECT sync_profile_data_from_learners(); -- Returns: 0 (all synced)

  -- Verify no issues
  SELECT COUNT(*) FROM profiles p
  INNER JOIN learners_profiles lp ON p.learner_id = lp.id
  WHERE p.role != 'student'
     OR p.institution_id IS DISTINCT FROM lp.institution_id
     OR p.department_id IS DISTINCT FROM lp.department_id;
  -- Returns: 0 (all correct)
  ```

  **Files Updated**:
  - `app/api/learners/create-missing-profiles/route.ts` (Added sync call)
  - Database: Created function `sync_profile_data_from_learners()`
  - Database: Applied 3 migrations (fix duplicates, sync data, add unique constraint)
  - `docs/fixes/2025-01/2025-01-27-FIX-sync-profile-data-from-learners.md` (NEW - Documentation)

---

### **2026-01-28: Learner-Profile Sync Enhancement**

**Issue**: College email updates in `learners_profiles` didn't sync to `profiles` table, roles stuck as 'guest', no mismatch detection.

**Solution**: Three-layer fix for comprehensive synchronization:

1. **Enhanced Service Layer** (`lib/services/learner-profile-service.ts`):
   - Smart profile lookup (by email, then learner_id fallback)
   - Syncs ALL fields: email, role, is_active, learner_id, institution_id, department_id
   - Comprehensive logging for debugging

2. **Database Triggers** (AUTO-SYNC):
   - `trg_sync_learner_email_to_profile`: Auto-syncs college_email changes
   - `trg_sync_learner_status_to_profile`: Auto-syncs lifecycle_status to is_active
   - Handles orphaned profile linking

3. **Diagnostic & Repair Tools**:
   - `scripts/debug-learner-profile-sync.ts`: Detect mismatches
   - `scripts/repair-learner-profile-sync.ts`: Auto-fix issues
   - `scripts/LEARNER_PROFILE_SYNC_GUIDE.md`: Complete usage guide

**Database Changes**:
```sql
-- New Functions (02_functions.sql)
CREATE FUNCTION sync_learner_email_to_profile() -- Syncs email, role, org data
CREATE FUNCTION sync_learner_status_to_profile() -- Syncs is_active status

-- New Triggers (04_triggers.sql)
CREATE TRIGGER trg_sync_learner_email_to_profile -- On INSERT/UPDATE college_email
CREATE TRIGGER trg_sync_learner_status_to_profile -- On UPDATE lifecycle_status
```

**Results**:
- ✅ Email changes automatically sync to profiles table
- ✅ User roles correctly set to 'student'
- ✅ Orphaned profiles automatically linked
- ✅ is_active status always matches lifecycle_status
- ✅ Comprehensive logging and diagnostics
- ✅ Automatic repair tools available

**Usage**:
```bash
# Detect issues
npx tsx scripts/debug-learner-profile-sync.ts

# Fix issues (dry run first)
npx tsx scripts/repair-learner-profile-sync.ts --dry-run
npx tsx scripts/repair-learner-profile-sync.ts
```

**Files Updated**:
- `lib/services/learner-profile-service.ts` (Enhanced syncProfileStatus function)
- `supabase/setup/02_functions.sql` (Added 2 sync functions)
- `supabase/setup/04_triggers.sql` (Added 2 triggers, total: 75)
- `scripts/debug-learner-profile-sync.ts` (NEW - Diagnostic tool)
- `scripts/repair-learner-profile-sync.ts` (NEW - Repair tool)
- `scripts/LEARNER_PROFILE_SYNC_GUIDE.md` (NEW - Complete guide)
- `docs/fixes/2026-01/2026-01-28-FIX-learner-profile-sync-issues.md` (NEW - Root cause analysis)

---

### **2025-01-31: Advanced Learner Analytics Schema Update**

**Purpose**: Add database support for 4 new analytics categories: Intake & Capacity, Geography, Trends, and School Feeders

**Database Changes**:

1. **learners_profiles table** (5 new columns):
   - `school_type TEXT` - Classification: government, aided, private, cbse, icse, state_board
   - `school_district TEXT` - School's district location
   - `school_taluk TEXT` - School's taluk location
   - `medium_of_instruction TEXT` - english, tamil, both
   - `location_type TEXT` - urban, semi_urban, rural (auto-classified)

2. **programs table** (3 new columns):
   - `sanctioned_intake INTEGER` - Approved intake capacity (default: 0)
   - `actual_intake INTEGER` - Current admitted students (default: 0)
   - `academic_year_id UUID` - Link to academic year

3. **intake_history table** (NEW):
   - Tracks historical intake data for 3-year stability index calculations
   - Columns: institution_id, program_id, academic_year_id, sanctioned_intake, actual_intake, waitlist_count, dropout_count
   - Unique constraint on (program_id, academic_year_id)
   - 3 indexes for analytics queries (program, year, institution)

4. **Indexes Created** (4 new):
   - `idx_learners_profiles_school_type` - Filter by school type
   - `idx_learners_profiles_location_type` - Filter by location classification
   - `idx_learners_profiles_medium_instruction` - Filter by medium
   - `idx_programs_academic_year` - Program capacity by year

5. **RLS Policies** (4 new for intake_history):
   - SELECT, INSERT, UPDATE policies based on user_institution_access
   - DELETE policy restricted to admin access_type

**Analytics Enabled**:
- ✅ Intake & Capacity Analytics (seat utilization, over-intake alerts, waitlist conversion, 3-year stability)
- ✅ Geography Analytics (district/taluk contribution, hostel ratios - data already 100% available)
- ✅ Trend Analytics (gender ratio, category mix, first-generation, income distribution)
- ✅ School Feeder Analytics (feeder institution tracking, school type classification)

**Impact**:
- All new fields are optional (backward compatible)
- Existing 3,506 learner profiles need data migration for analytics fields
- Data migration scripts to populate school_type, location_type automatically
- Intake history seeding script to backfill last 3 years

**Next Steps**:
- Create TypeScript types for analytics interfaces
- Implement advanced analytics service layer
- Build API routes and React Query hooks
- Create UI components for 4 new analytics tabs
- Run data migration scripts

**Files Updated**:
- `supabase/setup/01_tables.sql` - Added columns, table, indexes
- `supabase/setup/03_policies.sql` - Added RLS policies for intake_history
- `supabase/SQL_FILE_INDEX.md` - Updated table count, added changelog

---

### 2026-03-13: Expo Module (Education Fairs & Exhibitions)

### Expo Module (Education Fairs)
- **Tables** (01_tables.sql): `expo_masters`, `expo_events`, `expo_event_team_members`, `expo_daily_reports`
- **Policies** (03_policies.sql): Institution-scoped RLS for all 4 tables
- **Triggers** (04_triggers.sql): `update_expo_team_count`, `update_expo_report_totals`, `updated_at` triggers
- **FK Addition**: `admission_leads.expo_event_id` → `expo_events(id)`
- Added: 2026-03-13

---

### 2026-03-16: BYOW WhatsApp Personal Messaging

- **Tables** (01_tables.sql): `wa_personal_connections`, `wa_personal_message_logs`
- **Policies** (03_policies.sql): Department-scoped RLS (via profiles.department_id) with super_admin/is_super_admin bypass and admission custom role access for both tables (7 policies total)
- **Triggers** (04_triggers.sql): `wa_personal_connections_updated_at`, `wa_personal_message_logs_updated_at`
- **Indexes**: 2 on connections (department, status), 5 on message_logs (department, connection, lead, sent_at DESC, status)
- **Purpose**: BYOW (Bring Your Own WhatsApp) personal messaging for admission module — tracks QR-based WhatsApp connections per department and logs all messages sent
- **Key columns**: `department_id` (FK to departments), `client_id` (Railway multi-client routing)
- Added: 2026-03-16
- Updated: 2026-03-18 — Changed from institution_id to department_id scoping, added client_id column

---

### 2026-03-17: Marketing Leads Database

- **Tables** (01_tables.sql): `marketing_leads_database`
- **Policies** (03_policies.sql): Institution-scoped RLS with super_admin bypass and admission role access (4 policies: select, insert, update, delete)
- **Indexes**: 5 (institution, batch, district, mobile_number, created_at DESC)
- **Purpose**: Bulk-uploaded lead data for admission marketing campaigns — stores student contact info from CSV/Excel uploads with batch tracking

| 2026-03-17 | Added `marketing_leads_database` table for bulk lead uploads in marketing module |

---

**Remember: ONE file per object type, NO duplicates, ALWAYS update existing files!**

---

### 2026-03-19: Sarvam Galatta Event Registrations

- **Tables** (01_tables.sql): `sarvam_galatta_registrations`
- **Policies** (03_policies.sql): 4 policies — `sgr_select_own`, `sgr_insert_own`, `sgr_update_own`, `sgr_all_super_admin`
- **Indexes**: 5 (event_id, learner_id, registration_id, snap_institution_id, submitted_at DESC)
- **Purpose**: Specialized 1:1 extension of `event_registrations` for Sarvam Galatta event — stores project URLs (project, GitHub, Supabase), API keys (Gemini required, Maps optional), and a snapshot of the student's learner profile hierarchy at registration time
- **Key columns**: `registration_id` (UNIQUE FK to event_registrations), `learner_id`, `snap_*` columns (profile snapshot), `gemini_api_key` (NOT NULL), `last_edited_at` (edit tracking)
- **Event record**: `startup_events.id = ad357482-7087-4390-ac75-ad4c13838d4f` (config.registration_type = 'sarvam_galatta')

| 2026-03-19 | Added `sarvam_galatta_registrations` table + RLS for Sarvam Galatta startup event registration |

### Admission Form Builder (2026-04-08)
- Tables: `admission_form_templates`, `admission_forms`, `admission_form_sections`, `admission_form_fields`, `admission_form_submissions`, `admission_form_events`
- Location: `supabase/setup/01_tables.sql` (appended)
- Purpose: Dynamic public admission form builder with submissions flowing to leads

### Meeting Routing Substrate (2026-06-11)
- Tables: `meeting_routing_config` (repo-sync of live table), `meeting_routing_log` (round-robin pick audit + visitor answers per routed booking)
- Column: `jicate_booking_meeting_types.host_profile_id` (links per-counselor Cal.com EventTypes to MyJKKN profiles)
- Location: `supabase/migrations/20260611170000_meeting_routing_substrate.sql` (applied live via exec_sql 2026-06-11)
- Purpose: Public routed-booking form at /book/[slug] — MyJKKN-side round-robin (least_loaded on admission_counselors.current_leads) over a headless Cal.com. Writes via service-role only; staff read via RLS.

### Native Scheduling Engine — Phase N1 (2026-06-11)
- Tables: `meeting_host_schedules`, `meeting_schedule_windows`, `meeting_schedule_overrides`, `meeting_types`, `meeting_bookings`
- Location: `supabase/migrations/20260611190000_native_scheduling_engine.sql` (applied live via exec_sql 2026-06-11)
- Purpose: In-house scheduling engine replacing Cal.com (jicate-booking). Times stored as minutes-since-midnight in schedule TZ; gist EXCLUSION constraint `mb_no_double_booking` makes double-booking impossible for confirmed rows (verified live: overlap → 23P01; cancelled rows don't block). Multi-tenant via institution_id. Requires btree_gist extension.

### Meeting Routing Log — native linkage (2026-06-11)
- Column: `meeting_routing_log.meeting_type_id` (uuid → meeting_types)
- Location: `supabase/migrations/20260611200000_meeting_routing_log_native_link.sql` (applied live)
- Purpose: Phase N2 — routed bookings reference native meeting_types; cal_booking_uid column now stores native uids for new rows.

### Universal Booking Substrate — U1 (2026-06-12)
- Tables: `meeting_host_pages` (public page config: handle UNIQUE + reserved-word CHECK, is_public opt-in, auto_hidden), `meeting_host_google_connections` (per-host Google link, pgp-encrypted refresh token, status active/broken/revoked)
- Functions: `fn_set_google_cal_token`, `fn_get_google_cal_token`, `fn_clear_google_cal_token` — SECURITY DEFINER, `search_path = public, extensions` (pgcrypto), service_role-ONLY execute (cal-vault pattern)
- Columns: `meeting_types.location_mode` (in_person/phone/online; admission-counseling set to phone) + `location_text`; `meeting_bookings.video_url`, `google_event_id`, `attendee_profile_id`, `rescheduled_at`, `reschedule_count`, `previous_start_time`
- Data: `meetings.view` granted to all staff-type roles (exclusion-list: learner/external/vendor/deprecated roles)
- Location: `supabase/migrations/20260612090000_universal_booking_substrate.sql` (NOT yet applied — ships dark; apply at merge)
- Purpose: Universal Booking module substrate — anyone books Senior Learners/staff. Spec: specs/universal-booking-module-2026-06-12.md (20 decisions). Public exposure requires opt-in + active Google connection (D20).

### PDE <-> BoS Outcome Connector (2026-06-11)
- Columns: `pde_demonstrations.bos_syllabus_id` (uuid → bos_course_syllabi, version-pinned at submission), `pde_demonstrations.vac_course_id` (uuid → vac_courses, course-level VAC lane), `pde_demonstrations.clo_refs` (jsonb, learner-proposed CLO numbers), `pde_demonstrations.clo_refs_confirmed` (jsonb, validator-confirmed — attainment reads this only)
- Policy rows: `pde.obe.po_weight_map` ({"H":1.0,"M":0.5,"L":0.25}), `pde.obe.clo_tag_cap` (2)
- Location: `supabase/migrations/20260611230000_pde_bos_clo_connector.sql` (applied live via Management API 2026-06-11)
- Purpose: Link PDE demonstrations to the curriculum outcome they evidence (BoS CLOs for autonomous colleges, VAC courses for all); CLO/PO attainment computed from validated evidence. Spec: specs/pde-bos-outcome-connector-2026-06-11.md

### PDE Curriculum Read RPCs (2026-06-11)
- Functions: `fn_pde_list_approved_syllabi()`, `fn_pde_get_syllabus_outcomes(uuid[])`, `fn_pde_list_vac_courses()` — all SECURITY DEFINER, REVOKE anon/PUBLIC + GRANT authenticated
- Location: `supabase/migrations/20260611233000_pde_curriculum_read_rpcs.sql` (applied live via Management API 2026-06-11)
- Purpose: Scoped curriculum reads for the PDE connector. Live-discovered gap: bos_course_syllabi RLS requires BoS board membership and vac_courses RLS requires user_institution_access — learners/non-BoS validators can't read either. RPCs expose picker-minimal columns, own-institution scoped (admins also pass on outcomes fn).

### VAC Content Migration + Universal Picker (2026-06-12)
- Data: staging→prod content copy — vac_courses 1→93 (dark), vac_lessons 1→2,717, vac_course_programmes 0→85; via `scripts/vac-migrate-staging-content.sh` (psql pooler, Director-authorized interview decisions in specs/vac-staging-fk-mapping-audit-2026-06-11.md §8)
- Function: `fn_pde_list_vac_courses()` — now own-institution OR universal (institution_id IS NULL)
- Index: `vac_courses_code_key` UNIQUE(code) — staging parity + double-run guard
- Location: `supabase/migrations/20260612084500_vac_universal_picker_and_code_unique.sql` (applied live 2026-06-12)

### PDE Validation SLA Policy (2026-06-12)
- Policy row: `pde.scoring.validation_sla_days` = 7 (global, number, system, tunable without deploy)
- Location: `supabase/migrations/20260612190000_pde_validation_sla_policy.sql` (applied live via Management API 2026-06-12)
- Purpose: Connector PR 2 — bounds time-to-first-acknowledgment for PDE demonstrations (aging badge + latency/coverage KPIs on /pde/admin/demonstrations). CARE audit corrective move A (A3 scored 1).

### Family Moments Engine (2026-06-12)
- Tables: `family_moments_campaigns` (occasion per institution) + `family_moments` (tokenized card per child per campaign) + storage bucket `family-moments` (public read, permission-gated write)
- Location: `supabase/migrations/20260711000000_family_moments_engine.sql`
- RLS: NO anon policies by design — public gift page reads server-side via service role keyed on unguessable token. Teacher writes via `moments.submissions.create`; dashboards via `moments.campaigns.view`.
- Seed: `scripts/moments/seed-fathers-day.ts` (2 campaigns + 456 pre-seeded auto-cards, NV CBSE + Matric HSS)

### CARE Audit Framework v1.0 (2026-06-12)
- Data: 20 system rows in `audit_parameter_catalog` — codes `CARE-C1`…`CARE-E5`, parameter_group 1–4 = pillar C/A/R/E, framework_mapping `{"care":"C1"}` (existing body→criterion shape), evidence_required from the framework doc
- Tables: `care_audit_scores` (cycle_id → audit_cycles CASCADE, scorer_role owner/participant, score 0–4 CHECK, UNIQUE(cycle,code,scorer)), `care_scorer_invites` (token UNIQUE default gen_random_bytes(24) hex, accepted_by claims, 14-day expiry)
- Functions: `fn_care_create_audit`, `fn_care_list_audits`, `fn_care_get_audit`, `fn_care_upsert_score`, `fn_care_create_invite`, `fn_care_get_invite_context`, `fn_care_submit_participant_scores`, `fn_care_is_cycle_owner` — all SECURITY DEFINER, REVOKE anon/PUBLIC + GRANT authenticated. ALL writes flow through RPCs (audit_cycles INSERT RLS needs audit.cycle.manage but any staff opens a CARE audit; learner second-scorer passes via token, not staff RLS)
- RLS: both tables SELECT-only direct policies (leadership + own rows); no direct write policies
- Location: `supabase/migrations/20260612180000_care_audit_framework.sql` (applied live via Management API 2026-06-12)
- Purpose: Digitize the JKKN CARE Audit Framework v1.0 inside /audit — 20-item 0–4 scoring, two-scorer blind variance, pillar/index/gap-rule math, corrective moves as findings. Spec: specs/care-audit-module-spec-2026-06-12.md

### AI Pulse Department Interventions (2026-06-16)
- Table: `ai_pulse_interventions` (id, dept_id, institution_id, cycle_id, tier, requested_by, note, created_at) — append-only audit of HOD heatmap "Intervene" actions. Index `(dept_id, created_at DESC)` for the latest-per-dept "last intervened" grid hint.
- RLS: standardized pattern — SELECT is_super_admin/is_admin OR `aiPulse:dept.heatmap`; INSERT (authenticated) is_super_admin/is_admin OR `aiPulse:dept.intervene`. No UPDATE/DELETE. REVOKE anon/PUBLIC + GRANT SELECT,INSERT authenticated + NOTIFY pgrst reload.
- Location: `supabase/migrations/20260616120000_ai_pulse_interventions.sql` (NOT yet applied — apply via exec_sql/Management API at merge; the write + grid hint degrade to no-op until applied)
- Purpose: SOP last-mile fix #19 — give HOD interventions a durable record so the heatmap can show "last intervened" and governance has a trail (was notification-only).

### AI Pulse Live Polls (2026-06-17)
- Tables: `ai_pulse_polls` (id, cycle_id→startup_events, question, options jsonb [{id,label}], is_open, issued_at, closed_at, created_by, institution_id, created_at/updated_at — index `(cycle_id, issued_at)`) + `ai_pulse_poll_responses` (id, poll_id→ai_pulse_polls, profile_id, option_id, responded_at, UNIQUE(poll_id, profile_id)). Backs the live-session polls gate: polls_responded = COUNT(DISTINCT poll_id) per learner; gate passes iff ≥ min(3, polls_issued).
- Column note: cycle FK is `cycle_id` (NOT event_id) to match the pre-existing `live-session-service.getLiveSession` read (`.eq('cycle_id', …)`).
- RLS: polls SELECT = is_super_admin/is_admin OR `aiPulse:view.self`; polls INSERT/UPDATE = admin bypass OR `ai_pulse_champion` role (Champion + Co-Champion only, EXISTS user_roles→custom_roles, mirrors rotation-service.escalateAbsence). responses SELECT = own OR champion/admin; responses INSERT = own (profile_id = auth.uid()). REVOKE anon/PUBLIC + GRANT (polls SELECT,INSERT,UPDATE / responses SELECT,INSERT) authenticated + NOTIFY pgrst reload.
- Location: `supabase/migrations/20260617123300_ai_pulse_polls.sql` (NOT yet applied — supervisor applies via exec_sql/Management API before deploy; the Champion authoring control + real polls gate degrade to no-op/auto-pass until applied)
- Purpose: Give live polls real storage + a Champion authoring surface so polls_issued is no longer always 0 (the gate was auto-passing by construction). Director-approved spec 2026-06-17.

### PDE Faculty Review RPCs (2026-06-15)
- Functions: `fn_pde_review_queue(p_category text, p_status text)` (STABLE, enriched institution-scoped read of `pde_demonstrations` joined to `profiles` for the learner name; hides draft/withdrawn; mirrors the SELECT-RLS reviewer roles) and `fn_pde_validate_demonstration(p_demonstration_id uuid, p_decision text, p_raw_score numeric, p_notes text)` (VOLATILE, the only faculty write path — faculty RLS is SELECT-only; re-checks same-institution reviewer, enforces submitted/under_review → validated|rejected, appends validator id + note, sets raw_score on validate). Both SECURITY DEFINER, REVOKE anon/PUBLIC + GRANT authenticated.
- RLS: no table changes; reuses existing `pde_demonstrations` policies (learner own, faculty SELECT same-inst, super_admin all). Weighted scoring stays downstream (scoring engine writes weighted_score/passed).
- Location: `supabase/migrations/20260615170000_pde_faculty_review_rpcs.sql` (applied live via Management API 2026-06-15)
- Purpose: Back the rebuilt faculty Demonstration Reviews page (Option A — durable-value taxonomy). Resolves friction X1 (faculty surface now speaks the 7 durable-value categories learners submit under, not the legacy capability vocabulary). Decision doc: docs/modules/pde/2026-06-14-DECISION-pde-category-taxonomy-split.md

### Lock Privilege-Resolver Views + DDL Functions from anon (2026-06-16)
- Views locked (revoke anon+PUBLIC, keep authenticated+service_role): `v_privilege_memberships_effective` (8 client call sites) + 4 children `_resolver_privilege_{lc_members,manual,yuva_chapter_chairs,yuva_vertical_chairs}` — all `security_invoker=false`, so authenticated reads via the parent only.
- Functions locked (revoke anon+authenticated+PUBLIC, keep service_role; 0 app callers, DDL-executing, no internal guard): `privilege_source_register(...)`, `privilege_source_unregister(text)`, `_privilege_rebuild_effective_view()`.
- Durable fix: `REVOKE ALL ... FROM anon, PUBLIC` baked INTO `privilege_source_register` (after each `CREATE OR REPLACE VIEW _resolver_privilege_<kind>`) and `_privilege_rebuild_effective_view` (after the parent-view rebuild, both branches) — so every future source_kind is born locked. The original `20260422_privilege_source_registry_and_resolvers.sql` created these bare, inheriting Supabase's default anon grant; PR #1256's one-time revoke didn't survive view recreation.
- Location: `supabase/migrations/20260616000000_lock_privilege_resolver_views_and_fns_from_anon.sql` (applied live via Management API 2026-06-16; verified anon REST → HTTP 401 on views + RPC).
- Reference: reference_myjkkn_live_anon_exposure_2026_06_07, feedback_supabase_anon_execute_default_grant, CLAUDE.md "Lock new RPCs from anon".

### Anon EXECUTE Function Sweep — 383→34 (2026-06-16)
- Closes the 2026-06-07 sweep's last open item: ~383 non-ai_rpc SECURITY DEFINER functions were anon-executable (Postgres default PUBLIC EXECUTE grant + Supabase anon default grant). Now 34 remain anon-exec, all intentional: 29 RLS-gatekeeper functions (referenced in RLS policy expressions — anon must keep them or queries error) + 5 fn_get_policy* config readers (documented intentional-public).
- Phase 3a: 126 trigger functions → revoke anon+PUBLIC (trigger EXECUTE isn't checked when fired by a trigger; direct RPC errors anyway).
- Phase 3b Bucket A (7, service_role only): exec_sql_safe (arbitrary SQL — was anon-callable RCE), create_user_profile (arbitrary-role profile creation), get_rls_policies, get_tables_with_rls, ensure_usage_events_partitions, sync_user_role_enum, hr_policy_restore. Unguarded + dangerous → must NOT be granted to authenticated (would expose as direct PostgREST RPC to any logged-in user).
- Phase 3b Bucket B (213): revoke anon+PUBLIC, GRANT authenticated. Verified every caller is an authenticated session client or a service_role server route; none reached from a public/anon-browser page.
- Location: `supabase/migrations/20260616001000_lock_anon_execute_function_sweep.sql` (applied live via Management API 2026-06-16; verified anon REST → HTTP 401 on exec_sql_safe/create_user_profile/business fns; fn_get_policy* still anon-reachable).
- Follow-up (separate): add internal is_super_admin/permission guards to unguarded functions now authenticated-callable via direct REST (e.g. hr_policy_diff/history).

### Meeting Agenda Engine — PR1 generic agenda core (2026-06-21)
- Tables: `meeting_agendas` (id, booking_id→meeting_bookings ON DELETE CASCADE UNIQUE, host_profile_id→profiles [denormalized for flat host RLS], status draft|live|closed, ai_used, generated_at, created_at/updated_at) + `meeting_agenda_items` (id, agenda_id→meeting_agendas ON DELETE CASCADE, source manual|past_action|approval|kpi|project|ai_narrative [PR1 writes manual], title [1–300], body, link_ref, visibility all|host_only|private [PR1 writes all], order_index, created_at/updated_at; index (agenda_id, order_index)).
- RLS: SELECT-only for authenticated, mirroring meeting_bookings.mb_host_select — `is_super_admin() OR is_admin() OR host_profile_id = auth.uid()` (header) and an EXISTS-on-header host check (items). DELIBERATELY NO INSERT/UPDATE/DELETE policy: all writes flow through host-verified service-role server actions (app/(routes)/meetings/[uid]/agenda-actions.ts → MeetingAgendaService). REVOKE ALL FROM anon, PUBLIC + GRANT SELECT authenticated + NOTIFY pgrst reload.
- Scope: PR1 = MANUAL agenda surface on the booking detail page only (add/edit/reorder/delete). The wider source/visibility enums + status/ai_used/generated_at are the generic-core fields the later PRs populate (PR2 loop / PR3 adapters+per-viewer+delegate / PR4 AI narrative). Fresh core beside BoS (bos_agenda_items) — converge BoS later (spec §5).
- Location: `supabase/migrations/20260713000000_meeting_agenda_core_pr1.sql` (NOT yet applied at PR-open — additive new tables; apply via Management API at/after merge; the agenda card degrades to "No agenda yet" / write actions error until applied).
- Spec: specs/meeting-agenda-engine-2026-06-21.md. Service: lib/services/meetings/meeting-agenda-service.ts. UI: app/(routes)/meetings/[uid]/_components/agenda-section.tsx.

### Meeting Agenda Engine — PR2 action-item loop (2026-06-22)
- Table: `meeting_action_items` (id, booking_id→meeting_bookings ON DELETE CASCADE [source meeting], host_profile_id→profiles [denormalized for flat host RLS], decision_text, action_text [1–500], owner_label [PR2 free-text owner], owner_profile_id→profiles ON DELETE SET NULL [reserved for PR3 internal-owner resolution; PR2 leaves null], due_date, status open|done, created_at/updated_at; indexes (booking_id) + (host_profile_id, status); trigger meeting_action_items_set_updated_at → shared set_updated_at()).
- RLS: SELECT-only for authenticated, mirroring meeting_agendas — `is_super_admin() OR is_admin() OR host_profile_id = auth.uid()`. DELIBERATELY NO INSERT/UPDATE/DELETE policy: all writes flow through host-verified service-role server actions (app/(routes)/meetings/[uid]/action-item-actions.ts → MeetingActionItemService). REVOKE ALL FROM anon, PUBLIC + GRANT SELECT authenticated + NOTIFY pgrst reload.
- Scope: PR2 = after-meeting capture (decisions + action items, owner/due, mark done) + the PastActions adapter (MeetingActionItemService.listOpenCarryOver) surfacing OPEN items from a host's prior bookings with the same attendee_email onto the next meeting (the loop). PR3 generalizes matching to multi-attendee/roles + resolves owner_profile_id + adds per-viewer 'private' scoping.
- Location: `supabase/migrations/20260714000000_meeting_action_items_pr2.sql` (additive new table; apply via Management API at/after merge; the cards degrade to empty / write actions error until applied).
- Spec: specs/meeting-agenda-engine-2026-06-21.md §3–4. Service: lib/services/meetings/meeting-action-item-service.ts. UI: action-items-section.tsx (capture) + carried-over-section.tsx (loop).

### Social Loop Engine — playbook/memory table (2026-06-24)
- Table: `social_loop_playbook` (id, account_id→ig_accounts ON DELETE CASCADE, cycle_no INT, week_start DATE default now()::date, read_summary JSONB [READ snapshot at close], decide JSONB [{formatInstruction, barToBeat, nextInstruction, domainHypothesis}], learning TEXT [the one human change], created_by→profiles ON DELETE SET NULL, created_at/updated_at; UNIQUE (account_id, cycle_no); index idx_social_loop_playbook_account (account_id, cycle_no DESC)). One row per closed cycle per IG account = the department innovation loop's durable memory (Read→Decide→Act→Learn).
- RLS: dynamic-permission — SELECT=`is_super_admin() OR is_admin() OR user_has_permission('social.view')`, INSERT/UPDATE=`...OR user_has_permission('social.manage')`. anon hardened: REVOKE ALL FROM anon, PUBLIC + GRANT SELECT, INSERT, UPDATE TO authenticated. Writes gated to social.manage / admins.
- Location: `supabase/migrations/20260624031500_social_loop_playbook.sql` (idempotent; additive new table; apply via Management API at/after merge). Also mirrored into setup/01_tables.sql + setup/03_policies.sql.

### AI Model Config Adoption — seed 16 hardcoded Claude features (2026-07-02)
- Seed-only migration (no DDL, no new functions/RPCs): INSERT ... ON CONFLICT (feature_key) DO NOTHING for 16 new `ai_model_config` rows covering every hardcoded Anthropic call site (scf.generate_suggestions, scf.learner_notes, session_feedback.escalation, session_feedback.suggest_improvement, feedback.classify, induction.generate_playbook, induction.session_effectiveness, cdc.career_guidance → claude-sonnet-4-6; ai_query.natural_language, work_pulse.analyze → claude-sonnet-4-20250514; work_pulse.translate, attention_bar.assistant → claude-haiku-4-5-20251001; rcltp.question_generation → claude-sonnet-4-6 [EKSAQ-gated scaffold, no live call — forward-default]; admission.ai_service → claude-sonnet-4-5; admission.agentic_query, admission.ai_response → claude-3-5-haiku-20241022).
- Cutover invariant: every row = the model the code hardcodes today (verified per-file against jicate/main 2026-07-02) — applying this changes zero behavior; PR 2-4 wire the call sites through lib/services/platform/ai-clients/chat.ts afterwards.
- Drift fix: guarded UPDATE of `admission.ai_insights` from openai/gpt-4o-mini (aspirational 2026-05-12 seed, never adopted) to anthropic/claude-sonnet-4-5 (what app/api/admission/insights/generate/route.ts actually hardcodes). WHERE pins the old values so a deliberate UI change can't be clobbered.
- Location: `supabase/migrations/20260702120000_ai_model_config_adoption_seed.sql` (idempotent; apply via Management API at/after merge; until applied, getModelForFeature falls back to matching hardcoded entries in ai-model-config-service.ts FALLBACKS — same models, zero behavior change).
- Spec: specs/ai-model-config-adoption-2026-07-02.md. Substrate: 20260512000001_ai_model_config_substrate.sql. Wrapper: lib/services/platform/ai-clients/chat.ts.

### Max Lane request queue — "Run on Max" for AI routines (2026-07-03)
- New table `max_lane_requests` (id uuid pk, routine_id text, status pending|claimed|done|error, requested_by→auth.users, requested_at/claimed_at/completed_at, result_note) — a queue of on-demand "Run on Max" requests. RLS-enabled with **NO policies** (RPC-only); `REVOKE ALL FROM anon, authenticated`. Indexes: (status), (routine_id, requested_at DESC).
- 4 SECURITY DEFINER RPCs (all `SET search_path = public`): `fn_max_lane_request_run(text)→jsonb` (super_admin only, dedupes one live request per routine, returns {ok,request_id} or {ok:false,error:'already queued'}) + `fn_max_lane_requests_list()→setof` (super_admin only, last 20) — both `REVOKE anon,PUBLIC; GRANT authenticated`. `fn_max_lane_claim_pending()→setof` (atomic claim of ≤5 pending via `FOR UPDATE SKIP LOCKED`, plus stale-claim recovery flipping >60-min 'claimed' rows to 'error') + `fn_max_lane_complete(uuid,text,text)` — both service-role-restricted BY GRANT (`REVOKE anon,authenticated,PUBLIC; GRANT service_role`, mirroring `fn_ai_routine_claim_due`) AND by a runtime `request.jwt.claims->>'role'='service_role'` check.
- Context: the Director's Mac runs 3 routines on the Claude Max subscription (the "Max lane"); the /api/cron/* jobs are the fallback. Vercel can't reach the Mac, so the /admin/ai-routines UI inserts a request row (via fn_max_lane_request_run); a Mac-side service-role poller (built separately) claims + completes it. Registry entries flagged `maxLane:true`: scf-generate-suggestions, session-feedback-escalation, induction-generate-playbook.
- Location: `supabase/migrations/20260703083900_max_lane_requests.sql` (additive new table + fns; apply via Management API at/after merge — until applied, the "Run on Max" button + GET status return 404/500 and the UI simply shows no status). API: app/api/admin/ai-routines/max-run/route.ts. UI: app/(routes)/admin/ai-routines/_components/max-lane.tsx.

| `migrations/20260703093000_schools_network_feeders_rpc.sql` | Schools Network feeder-discovery RPC (read-through over learners_profiles + marketing_leads_database) | 2026-07-03 |

### Faculty-engagement adoption + hard-gate enforcement (DARK, compliance-gated) — 2026-07-04
- File: `supabase/migrations/20260731020000_scf_hard_gate_enforcement_and_coupling.sql` (NOT applied at PR-open — apply via Management API at/after merge, AND only after Director + legal/compliance review of the exam-eligibility coupling; spec risk R2).
- Spec: `specs/faculty-engagement-adoption-2026-07-04.md` (Director decisions LOCKED — max enforcement, informed of R1–R3).
- NON-DESTRUCTIVE INVARIANT: nothing here mutates `student_attendance.attendance_data`. Confirmation + effective-% are DERIVED, recomputable reads.
- `fn_scf_faculty_completion(date,date)` — DROP+recreate to ADD `start_time`/`end_time` (PR-A current-period spotlight) + `gate_mode` (resolved per session institution via `fn_get_policy_text`) + derived `session_status` (PR-C). `session_status='incomplete'` ONLY when `gate_mode='hard'` AND pending>0 AND within window → INERT until the config flip (dark). REVOKE anon,PUBLIC / GRANT authenticated.
- `fn_scf_notify_session_pending(date,uuid,text)` — PR-B faculty-triggered per-session nudge; reuses the `fn_scf_nudge_pending_learners` two-write (`notifications` + `user_notifications`) delivery path, assigned-faculty OR super-admin OR **same-tenant** admin (`is_admin() AND role_has_institution_access(session.institution_id)` — no cross-tenant nudge), identity-scoped, atomically idempotent per learner/session/day (`idempotency_key` includes `timetable_id`; `ON CONFLICT ... WHERE idempotency_key IS NOT NULL DO NOTHING`). `SET statement_timeout='20s'`. REVOKE anon,PUBLIC / GRANT authenticated.
- `fn_scf_set_gate_mode(text,uuid)` — PR-C super-admin BREAK-GLASS kill-switch; upserts the `session_feedback.gate_mode` platform_policies row (global or per-institution) via UPDATE-then-INSERT-if-absent (NOT `ON CONFLICT`, so the kill-switch cannot throw on index-inference; matches the coupling-flag seed pattern). Revert to `visibility`/`off` halts enforcement in one call, no deploy. super_admin ONLY. REVOKE anon,PUBLIC / GRANT authenticated.
- `fn_scf_effective_attendance(date,date,uuid,uuid,uuid,uuid)` — PR-D DERIVED "effective attendance %": per learner official % vs confirmed-only effective % (present-but-no-feedback lowers it). Read-only over `student_attendance` + `session_feedback`; NEVER writes `attendance_data`. Authz mirrors `fn_scf_confirmation_rollup` (no `is_admin()` scope bypass). Counts only — no feedback content. REVOKE anon,PUBLIC / GRANT authenticated.
- Seed: `session_feedback.attendance_coupling_enabled` global row, DEFAULT **FALSE** (dark). Gates the effective-% in `AttendanceConsolidationService.getEffectiveAttendanceCoupling`; while OFF nothing is computed and the official % is untouched. `session_feedback.gate_mode` default STAYS `visibility` (unchanged).
- Round-2 (deep-review) hardening — 2026-07-04 (no signature/shape change): (1) nudge tenant-scoped (above); (2) completion window anchored to IST (`attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata'`) not server-UTC; (3) full session identity everywhere — `timetable_id` added to `fn_scf_effective_attendance`'s `DISTINCT ON` dedup key AND every `session_feedback` confirmation match (effective_attendance, faculty_completion, nudge) so two classes sharing a period slot on one day don't collapse/false-confirm; (4) `fn_scf_faculty_completion` gets `SET statement_timeout='20s'`; (5) faculty reward card counts (page) base numerator+denominator on answered sessions only (empty sessions no longer dilute/inflate); (6) nudge button/toast surface skipped-no-profile learners. Still fully DARK.
- Round-3 (deep-review) hardening — 2026-07-04: **SHAPE CHANGE** — NEW `fn_guard_gate_mode_super_admin_only()` (trigger fn, REVOKE anon,PUBLIC) + BEFORE INSERT/UPDATE trigger `trg_guard_gate_mode_super_admin_only` on `platform_policies`. Closes the arming/reverting **authz asymmetry**: `platform_policies` RLS is `is_super_admin() OR is_admin()`, so a tenant admin could set `session_feedback.gate_mode='hard'` and ARM enforcement while the break-glass revert is super-admin-only. Trigger rejects any AUTHENTICATED non-super-admin write to the `gate_mode` row (SQLSTATE 42501, checks NEW + OLD `policy_key` so the row can't be renamed-hijacked), scoped STRICTLY to that `policy_key`; service-role/migrations (`auth.uid() IS NULL`) and super-admins (incl. the break-glass RPC) pass unaffected. Also: (a) nudge `idempotency_key` day-part now IST (`(now() AT TIME ZONE 'Asia/Kolkata')::date`) not `CURRENT_DATE` (no double-nudge across IST midnight); (b) `fn_scf_faculty_completion` `ORDER BY` sorts on parsed time-of-day (`NULLIF(pv->>'start_time','')::time NULLS LAST`) not raw text. Page/component LOWs: reward card "at or above 3.5" copy, `goodSessions` gated on `responses>0`, honest notify toast (no stale `roster.length` fraction), Live Pulse `nowMin` re-ticks every 30s + `activeNow` handles midnight-crossing classes. Still fully DARK.
- Round-4 (deep-review) hardening — 2026-07-04 (no signature/shape change; migration still NOT applied): **(1) `::time` crash fix (round-3 regression)** — new helper `fn_scf_to_time_or_null(text)` (IMMUTABLE, REVOKE anon,PUBLIC / GRANT authenticated) parses mixed 24h/12h blob times, returns NULL (regex fast-reject + `EXCEPTION WHEN others` backstop) for unparseable/out-of-range values (`'TBD'`, `'24:70'`); `fn_scf_faculty_completion` `ORDER BY` now calls it instead of the bare `NULLIF(...)::time` that aborted the whole query on a non-time slot value. **(2) UUID cast guards** — every `(st->>'student_id')::uuid` in `fn_scf_faculty_completion` (confirmed_count EXISTS) and `fn_scf_notify_session_pending` (new validated `present_students` CTE) now wrapped in a CASE with the same UUID-shape regex as `fn_scf_effective_attendance`, so a malformed blob id becomes NULL (learner stays pending / un-nudged) instead of raising 22P02 and failing the view/nudge. **(3) coupling-flag arming guard (compliance)** — `fn_guard_gate_mode_super_admin_only()` extended to also guard `session_feedback.attendance_coupling_enabled` (checks NEW + OLD `policy_key` for BOTH keys); the exam-eligibility coupling flag is now super-admin-arm-only, symmetric with `gate_mode`. **(4)** `fn_scf_effective_attendance` re-checks `session_feedback.attendance_coupling_enabled` via `fn_get_policy_bool(...,p_institution_id)` and `RETURN`s zero rows when OFF (defense-in-depth; can't be bypassed by a direct RPC call). **(5)** `fn_scf_set_gate_mode` INSERT wrapped in `EXCEPTION WHEN unique_violation` → retry UPDATE (race-safe break-glass; still no `ON CONFLICT`). Page/component LOW: Live Pulse spotlight candidate selection filters `present_count>0` so a present-0 active class falls back to `nextUp` instead of suppressing the spotlight. Still fully DARK.
- Consumers: `lib/services/session-feedback-service.ts` (`notifySessionPending`), `lib/services/academic/attendance-consolidation-service.ts` (`getEffectiveAttendanceCoupling`), `hooks/use-session-feedback.ts` (`useNotifySessionPending`), `app/(routes)/academic/session-feedback/faculty/page.tsx` (status badge + reward card + notify), `app/(routes)/academic/session-feedback/_components/live-pulse-control.tsx` (current-period spotlight), `types/session-feedback.ts`, `lib/policies/keys.ts`.

### Foundation & Competitive-Exam Programme — shared exam spine (2026-07-05)
- New table `public.exam_definitions` — neutral shared exam entity referenced by BOTH CDC govt-readiness (level=college, linked via `cdc_training_type_id → cdc_training_types`) and the Foundation programme (level=school: NEET/JEE/CUET). Columns: id, config_key (unique), display_name, exam_family, level CHECK(school|college), cdc_training_type_id (nullable, ON DELETE SET NULL), is_active, sort_order, audit. RLS: read=`auth.uid() IS NOT NULL`; write=`is_super_admin() OR is_cdc_head_or_super()` (foundation_admin gate added when those roles land). Reuses `_touch_updated_at()`.
- Seeds 4 school exams (neet_ug, jee_main, jee_advanced, cuet_ug) + backfills 7 college exams from `cdc_training_types WHERE exam_family IS NOT NULL`. ADDITIVE — modifies NO cdc_* table (reads only). Idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING). Reversible: `DROP TABLE public.exam_definitions`.
- Location: `supabase/migrations/20260705223000_exam_definitions_shared_spine.sql`. APPLIED to prod via Management API 2026-07-05 (verified: 7 college + 4 school rows; CDC intact 7/14/68). Stage 1 of 4 in the shared-spine merge (Foundation PR-A).
- Spec: `specs/nv-foundation-programme-TECH-SPEC-2026-07-05.md` §11 (safe merge plan).

### Foundation programme — student identity core (PR-B1) — 2026-07-06
- New tables `fp_students` (minors; school_id mutable=history-follows-student, profile_id/parent_profile_id links, learner_profile_id funnel handoff, parental_consent_at OPTIONAL), `fp_cohorts` (school + exam_definition_id + term + resource_person), `fp_enrollments` (student↔cohort, unique).
- 4 recursion-safe SECURITY DEFINER helpers (REVOKE anon,PUBLIC / GRANT authenticated): `fn_fp_manages_school`, `fn_fp_manages_cohort_school`, `fn_fp_teaches_student`, `fn_fp_is_own_or_guardian`.
- RLS on fp_students = minors' PII: **super-admin only (NO is_admin cross-tenant bypass)** + child/parent self (profile_id/parent_profile_id) + school mgmt (school_jkkn_owners) + teacher (cohort resource_person). Verified: impersonated non-super user sees 0 rows, no recursion.
- Consent is an OPTIONAL admin toggle: `platform_policies` row `foundation.require_parental_consent` = false (default OFF); app reads via `fn_get_policy_bool`. NOT a hard gate.
- Location: `supabase/migrations/20260706063000_fp_students_cohorts_enrollments.sql`. APPLIED to prod via Management API 2026-07-06 (verified). PR-B1 of the Foundation build.
- Permission keys to add in code: `foundation.students.manage`, `foundation.cohorts.view`, `foundation.cohorts.manage` (lib/constants/permissions.ts). Spec: `specs/nv-foundation-programme-TECH-SPEC-2026-07-05.md`.

### Foundation programme — item bank + assessments + shared topic map (PR-B2a) — 2026-07-06
- New tables: `exam_topic_map` (generalized exam→topic junction keyed to `exam_definitions`, additive companion to legacy `cdc_exam_topic_map` which stays on `cdc_training_types` until Stage-2/PR-C), `fp_items` (item bank, tagged exam+topic+difficulty, `source` = licensed|authored for hybrid sourcing; staff-only, holds answers), `fp_assessments` (diagnostic|practice|mock), `fp_assessment_items` (ordered junction).
- Seeds 4 school subject-topics into the SHARED `cdc_exam_syllabus_topics` (sch_physics/chemistry/biology/mathematics; Physics+Chem is_shared across NEET+JEE) + 9 `exam_topic_map` rows (NEET→P/C/B, JEE Main+Adv→P/C/M). Realizes Decision #1 (shared taxonomy) additively.
- RLS: content tables, permission-gated (`foundation.items.*`, `foundation.assessments.*`); `exam_topic_map` read any-authed. NO student PII here.
- Verified: 4 tables, 18 total topics (14 govt + 4 school), legacy `cdc_exam_topic_map` UNCHANGED (68 rows). Applied to prod via Management API 2026-07-06.
- Location: `supabase/migrations/20260706064000_fp_item_bank_assessments.sql`. Permission keys to add in code: `foundation.items.view/manage`, `foundation.assessments.view/manage`.

### Foundation programme — performance + diagnostic engine (PR-B2b) — 2026-07-06
- New PII tables: `fp_attempts` (student attempt at an assessment), `fp_responses` (per-item response + time_ms behavioural signal), `fp_student_weakness` (rolling per-topic mastery = the diagnostic MOAT; unique student+exam+topic), `fp_baselines` (movement-vs-baseline snapshot), `fp_revision_plans` (generated plan jsonb).
- 4 unified recursion-safe SECURITY DEFINER helpers (REVOKE anon,PUBLIC / GRANT authenticated): `fn_fp_can_view_student`, `fn_fp_can_manage_student`, `fn_fp_can_view_attempt`, `fn_fp_can_manage_attempt`.
- RLS (all 5 tables): read = `fn_fp_can_view_student/attempt` (super-admin only + student/guardian + teacher + school mgmt; NO is_admin cross-tenant bypass); write = manage helpers. Verified: impersonated non-super user sees 0 weakness + 0 attempts, no recursion.
- Direct student writes route through a future record-attempt RPC (SECURITY DEFINER); table writes gated to managers.
- Location: `supabase/migrations/20260706065000_fp_performance_diagnostic.sql`. Applied to prod via Management API 2026-07-06 (verified). Completes the Foundation DB layer (PR-A + PR-B1 + PR-B2a + PR-B2b).

### Foundation — unify college mappings into shared exam_topic_map (PR-C, DB step) — 2026-07-06
- Backfills the 68 college exam→topic mappings from legacy `cdc_exam_topic_map` into the shared `exam_topic_map` (via `exam_definitions.cdc_training_type_id`), making `exam_topic_map` the single unified junction (77 rows = 68 college + 9 school).
- ADDITIVE: does NOT modify `cdc_exam_topic_map` (still 68, CDC reads it unchanged). PARITY PROVEN: 0 CDC mappings unmirrored.
- Location: `supabase/migrations/20260706070000_exam_topic_map_backfill_college.sql`. Applied via Management API 2026-07-06 (verified).
- REMAINING (separate CODE PR, browser-verified): switch the 5 CDC consumers (`cdc/admin/exam-syllabus-topics`, `cdc/admin/exam-topic-map`, `cdc/govt-readiness`, `api/admin/cdc/exam-topic-map`, `lib/services/admin/cdc-admin-service.ts`, `types/admin/cdc.ts`) to read `exam_topic_map`; verify govt-readiness page + syllabus-overlap % identical; then DROP `cdc_exam_topic_map`. THIS is the one true live-CDC touch — do NOT ship without browser verification.

### Foundation programme — core RPCs (PR-B build) — 2026-07-06
- 4 SECURITY DEFINER RPCs (SET search_path=public; REVOKE anon,PUBLIC / GRANT authenticated): fn_fp_record_attempt(assessment,student,responses jsonb) [authz can_manage OR own/guardian + consent-flag gate + per-item scoring 0..1], fn_fp_recompute_weakness(student,exam) [upsert per-topic mastery], fn_fp_generate_revision_plan(student,exam) [weakest-5 + recommended items], fn_fp_student_progress(student,exam) [read, mastery vs latest baseline].
- Location: supabase/migrations/20260706071000_fp_rpcs.sql. Applied to prod via Management API 2026-07-06 (verified: 4 fns, all anon=false). Answer/chosen jsonb compare contract documented in-file (object-with-'correct' unwrap else IS NOT DISTINCT FROM).
- App/UI: app/(routes)/foundation/* (hub + faculty console + student diagnostic), lib/services/foundation/foundation-service.ts, hooks/foundation/use-foundation.ts. Permission keys added to lib/constants/permissions.ts ('Foundation Programme' category); sidebar entry + MENU_PERMISSIONS in lib/sidebarMenuLink.ts. Permissions must be assigned to a role via Role Management before the module is reachable.

### SCF weld — dedupe NULL-institution suggestions + NULL-proof dedupe index — 2026-07-08
- `scf_ai_suggestions`: deleted 206 exact duplicates (MR3691, NULL institution — the dedupe index left `institution_id` un-COALESCEd and btree UNIQUE treats NULLs as distinct, so the record-upsert INSERTed on every batch re-drain); backfilled `institution_id` where the course maps to exactly one institution in `session_feedback`; rebuilt `idx_scf_ai_suggestions_dedupe` with `NULLS NOT DISTINCT` (PG 15.6) so NULL keys conflict like values. `fn_scf_record_suggestion` unchanged (ON CONFLICT infers the rebuilt index).
- Location: `supabase/migrations/20260708013000_scf_dedupe_nullproof_index.sql`. Applied to prod via Management API 2026-07-08 (verified: 215→9 rows, 0 NULL institutions; measurer then produced first-ever outcomes: 383835 +0.36, MR3691 +0.18).

### SCF two-sided 48h feedback window (submission close + generator maturity) — 2026-07-09
- Director decision 2026-07-08 23:34–23:43: learner feedback CLOSES `session_feedback.window_hours` (48) after the class day; the AI note generator coaches ONLY on sessions whose window has closed, citing contributing session dates. BOTH sides read the ONE existing `platform_policies` lever `session_feedback.window_hours` via `fn_get_policy_int` (same lever as the completion/attendance fns — NO new config key). D2 gate unmoved: `fn_scf_effective_attendance` only ever counted within-window confirmations.
- Submission side: `fn_scf_submit_feedback` rejects past-window with an explicit message (never silent); `fn_scf_pending_for_learner` stops listing expired sessions; `fn_scf_nudge_pending_learners` only nudges open-window sessions (+ closing-window copy); `fn_scf_notify_session_pending` refuses the faculty poke once closed.
- Generator side: `fn_scf_candidate_windows` + `fn_scf_ai_signal` filter to closed-window sessions; `fn_scf_ai_signal` RETURNS gains `session_dates date[]` (DROP+CREATE, grants re-asserted: REVOKE anon/PUBLIC, GRANT service_role). Generators (Vercel cron + Max-lane runner) stamp `suggestion.contributing_dates`.
- Location: `supabase/migrations/20260709000100_scf_two_sided_48h_window.sql`. Pre-merge validation 2026-07-09: full migration dry-run in rolled-back txn on prod + JWT-claims behavioral tests (old submit rejected w/ message; fresh accepted; candidates 446→430; pending drops expired). Apply to prod AFTER the code PR deploys.

### CO/PO Attainment Loop spine — COE connector + OBE direct side (NBA loop, accreditation-loop PR-4, DARK) — 2026-07-09
- Feasibility recon (read-only vs COE prod + MyJKKN prod): COE marks grain = per-student × course × session (CIA components in `cia_marks_detailed_view`, declared results in `final_marks_detailed_view`); `marks_entry.question_wise_marks` exists but is 0/27,282 filled; NO assessment→CO or question→CO tagging anywhere in COE → true CO-tagged attainment IMPOSSIBLE today. CO sources: `bos_course_syllabi.course_learning_outcomes` (877/898 latest rows filled, only the 2 A&S colleges have BoS rows); CO→PO matrix EXISTS as `bos_course_syllabi.po_mappings` jsonb (835 rows) but `obe_program_outcomes` is empty and CO-grain attainment is blocked, so PO attainment out of scope. All 13 `obe_*` tables exist in prod at 0 rows.
- Config: 8 `platform_policies` rows `copo_attainment.*` — master_enabled=false (DARK); **threshold_pct is PER-COLLEGE** (Director 2026-07-09: 'Let each college choose'): global row = FALLBACK 60, institution-scoped override rows (scope_type='institution') win via the canonical `fn_get_policy` resolver — the backfill fn resolves target_percentage per institution and the cron resolves the meeting-threshold per course's institution (`threshold_pct_used` + `metadata.threshold_source` audit it per row); direct_weight=0.8 + indirect_weight=0.2 **RATIFIED by Director 2026-07-09** (indirect side remains OFF until poll data matures); target_level=2 + level bands 70/60/50 remain DEFAULTS awaiting ratification.
- `obe_course_attainment_rollup` — NEW course-grain rollup (one row per institution × course_code × COE session, UNIQUE on those three NOT NULL cols — `obe_co_attainment` can't hold the honest proxy: `co_id` NOT NULL + nullable-col unique index). `grain` CHECK ('course_proxy'|'co_tagged') + metadata `co_tagged:false` make the proxy machine-readable; RLS SELECT = accreditation.view + institution scope (admin bypass); writes RPC-only.
- `fn_copo_backfill_course_outcomes()` — idempotent BoS-CLO → `obe_course_outcomes` copy (ON CONFLICT (course_id, co_code) DO NOTHING; joined course_code AND institutions_id→institution_id tenant guard; newest-modified syllabus wins across dual-regulation is_latest rows; target_percentage read from config at runtime).
- `fn_copo_record_course_attainment(jsonb)` — upserts rollup rows computed by the cron (aggregation happens in TS — Postgres can't reach the COE project); owns level banding from config bands + trend delta vs the prior session (`prior_rollup_id`/`prev_attainment_pct`/`delta_pct`).
- `fn_copo_emit_attainment_evidence()` — no-ops unless master_enabled=true; upserts `quality_evidence_mappings` NAAC 7.3.d + NBA T1_CO per rollup row, loop_key `copo_attainment`, metadata `{loop_key, loop_name, grain, co_tagged, outcome{...}, delta_summary, measured_at}`, period_label 'AY YYYY-YY' June cutoff (inlined — no dependency on unmerged PR #1899's `fn_accreditation_ay_label`); never clobbers is_auto=false. All 3 fns SECURITY DEFINER, REVOKE anon/authenticated/PUBLIC, GRANT service_role ONLY (SCF loop-RPC pattern).
- Seeds: NAAC 7.3.d metric row (idempotent; identical text to sibling PR #1899 — either merge order safe) + NBA T1_CO (already in prod; repo parity). `ai_routine_schedules` row `copo-attainment` (weekly Sun 03:41 IST → 03:30 dispatcher slot). Cron route: `app/api/cron/copo-attainment/route.ts` (COE READ-ONLY); registry: `lib/ai-routines/misc-ai.ts`.
- BLOCKER for full CO-tagged attainment (documented, not faked): Academic Office must author assessment→CO maps; COE has no structure to hold them. `obe_assessment_co_marks`/`obe_learner_co_marks` are the ready substrate.
- Location: `supabase/migrations/20260709031000_copo_attainment_spine.sql`. Pre-merge validation 2026-07-09: full migration dry-run in rolled-back txn on prod + fn executions with real counts (see PR body). Apply to prod AFTER the code PR deploys.
### CDC Placement-Outcome loop — phase-1 MEASURE side + NAAC 8.2.1 emitter (gates ①③, DARK) — 2026-07-09
- NIRF GO (~20-25%) is placement/progression — the one NIRF lever JKKN can move. This ships MEASURE + evidence intake only; act/feed-forward (gates ②④) pend a named CDC owner (Director decision). NOT labeled self-improving anywhere.
- Config rows (platform_policies): `cdc_placement_loop.master_enabled=false` (DARK gate — route + fn both check), `cdc_placement_loop.min_cohort_size=10` (labeling threshold — cohorts below it are COMPUTED but flagged `small_cohort:true` in metrics + evidence metadata; Director decision 2026-07-09 'Compute, but label small group'). Both flagged Director-reviewable.
- New table `cdc_placement_outcome_cycles`: one row per (institution, program, passing-out AY) cohort per measure run — metrics jsonb (placement/higher-ed/progression rates, denominator_basis 'batch_roster'|'outcome_reported', median accepted package from cdc_placements), baseline jsonb (prior cohort, same estimator), delta_summary improved/no_change/worse/n-a (±2.0pp deadband on progression rate). UNIQUE (institution, program, cohort_ay_end, measure_window 'YYYY-MM' IST); change-only history (identical re-measures write nothing). RLS: read = is_super_admin OR is_admin OR is_cdc_staff; NO write policies (service-role only, cdc_placement_snapshots posture); REVOKE anon.
- Fns (SECURITY DEFINER, SET search_path=public, REVOKE anon/authenticated/PUBLIC, GRANT service_role): `fn_cdc_placement_cohort_metrics(inst,prog,ay_end)` (per-cohort metrics; numerator = alumni_outcomes with best-outcome-per-learner dedupe, June AY cutoff; denominator = GREATEST(batch-roster, outcome-reported) — batch_id only 46% filled on graduated learners, basis recorded) + `fn_cdc_placement_outcome_measure()` (run: enumerate cohorts from alumni_outcomes, small-cohort labeling (never skips), baseline delta, cycle upsert, NAAC '8.2.1' evidence upsert into quality_evidence_mappings ON CONFLICT(source_table,source_id,body_code,metric_code) DO UPDATE WHERE is_auto).
- Data reality at build (prod read-only, 2026-07-09): cdc_placements = 0 rows, alumni_outcomes = 0 rows, graduated learners = 1,004 (program/institution 100%, batch_id 46%). Machinery built dark; alumni_outcomes chosen as source (convergence point of both CDC→alumni bridges + only source with higher_studies, which 8.2.1 needs).
- Cadence: ai_routine_schedules row 'cdc-placement-outcomes' (Sun 03:15 IST — dispatcher has no monthly granularity; month-window idempotency makes it effectively monthly). Cron route: `app/api/cron/cdc-placement-outcomes/route.ts` (CRON_SECRET). Registry: appended to `lib/ai-routines/misc-ai.ts`.
- Location: `supabase/migrations/20260709032000_cdc_placement_outcome_measure.sql`. ROLLBACK-validated on prod 2026-07-09 (see PR). Apply to prod AFTER the code PR merges.
### Accreditation — NAAC catalog Binary-framework sync: Attribute 9+10 seeds, 8.1.1 fix, legacy crosswalk (catalog debt, PR-3) — 2026-07-09
- Framework: NAAC Reforms 2024 Binary Accreditation (deck pp.41-63). April seed covered Attributes 1–8 in depth (one starter row each for 9/10); this migration completes the ten-attribute catalog.
- Seeds `sh_accreditation_metrics`: Attribute 9 'Research & Innovation Outcomes' 9.1–9.7 (grants w/ Univ >10L / Auto >5L / Affiliated >50K non-govt threshold, publications-per-teacher, h-index+citations (Affil NA), PhDs/guide, JRF-SRF (Univ-only), IPR+OERs (Affil NA), consultancy+MDP/EDP/FDP (Affil NA)) + Attribute 10 'Sustainability & Green Initiatives' 10.1–10.4 (community %, water/waste, net-zero, green audits — checklists). College-type applicability in notes; numeric deck point-splits NOT digitized (deck not in-repo — not fabricated). Idempotent ON CONFLICT (metric_type, metric_code).
- 8.1.1 mislabel FIX (Path A — grep + prod junction both show ZERO ('NAAC','8.1.1') emitters/rows): renamed in place to 'Student enrolment vs sanctioned intake (fresh admissions)' (Binary 8.1 = enrolment), calculation_method → intake_history actual/sanctioned, old name recorded in notes; pass-% re-homed as new `8.2.2` (deck numbers it 8.2 — collides with Graduate Progression's 8.2, a NAAC deck source bug).
- New table `accreditation_metric_crosswalk` (legacy_code → current_code, college_type-aware, NO FK — text codes only; UNIQUE NULLS NOT DISTINCT so NULL current_code/college_type rows stay idempotent on re-run, PG 15.6). RLS: SELECT authenticated / manage admins (accreditation_certificate_kinds pattern). 8 seed rows: 6.5.1/2/3 → 7.3.d/e/f (IQAC relocated; 7.3.d/e/f are seeded by sibling PR #1899 — informational, no collision), 5.1.3 + 7.2.1 → NULL (Binary home TBD, Director/IQAC decision pending), affiliated shifts 1.4→5.4, 1.6→5.5, 1.7→5.3.
- Induction rows 5.1.3 / 7.2.1 marked LEGACY via notes-only append (codes NOT re-keyed; `fn_induction_emit_naac_evidence` + existing junction rows untouched). Starter rows 9.1.1 / 10.1.1 cross-referenced to canonical 9.2 / 10.4 in notes.
- Location: `supabase/migrations/20260709030000_naac_catalog_binary_framework_sync.sql`. Pre-merge validation 2026-07-09: full migration dry-run TWICE in a rolled-back txn on prod — NAAC 28→40 rows (Attr9 +7, Attr10 +4, Attr8 3→4), crosswalk 8 rows (stable across double-run), legacy note appended exactly once, RLS on + 2 policies. NOT yet applied to prod.
### Learner support notes — actionable + measurable (Director, 2026-07-09 02:32)
- The struggling-learner note was personalised in TARGETING but generic in CONTENT (generator fed only course + 3 ratings). Widened: `fn_scf_downward_trend_all` (DROP+CREATE) now also returns `unmet_items` (recurring un-ticked checklist LABELS across the 3 sliding classes, ≥2 of 3), and `faculty_name` (via staff.institution_email, is_active — NEVER staff.email). Fill-rates on live candidates: 366 candidates, 84% with items, 92% with name.
- `scf_learner_notes` + `reached_out`/`reached_out_at`; `fn_scf_my_struggling_note` (DROP+CREATE) + id/reached_out; NEW `fn_scf_learner_note_reached_out(note_id, bool)` — learner-own one-tap follow-up (the note's outcome signal). NEW `fn_induction_my_mentor()` — mentee-side senior-peer-mentor lookup (⚠️ dark until first-year profile linkage: 0/425 group mentees have profiles today).
- All fns SECDEF + anon/PUBLIC revoked; trend fn service_role-only, others authenticated.
- Location: `supabase/migrations/20260709003000_scf_learner_notes_actionable.sql`. Validated 2026-07-09 in rolled-back prod txn (incl. reached-out tap as the real note owner). Generators (cron `scf-learner-notes` + Mac runner `learner-notes.mjs`) updated in lockstep to cite items/dates/facilitator. Apply AFTER the code PR deploys.

### NAAC catalog — re-key 4 mis-keyed rows to Binary codes (config-only) — 2026-07-09
- Re-keys four April-seed `sh_accreditation_metrics` rows (metric_type='NAAC') whose codes don't match the Binary Accreditation Framework 2024 (names verified against the seed before re-keying): `1.3.1`→`6.4.1` (cross-cutting issues → 6.4 Value Education, Attribute 6 — Director decision 2026-07-09, not 1.6/IKS; runs FIRST to free 1.3.x), `1.2.1`→`1.3.1` (flexibility content; Binary 1.2 = stakeholder feedback), `2.3.1`→`7.10.1` (faculty retention → Attribute 7 Governance, category updated), `6.2.1`→`6.5.1` (sports → Binary 6.5; cricket-exclusion note preserved in calculation_method).
- Safety: aborts if any `quality_evidence_mappings` row references a still-mis-keyed old code (0 at authoring); every UPDATE guarded on old code + exact seeded name + target-code-free (idempotent, collision-safe, never clobbers). 4 crosswalk rows inserted (ON CONFLICT DO NOTHING).
- Location: `supabase/migrations/20260709033000_naac_catalog_miskey_rekey.sql`. HARD DEPENDENCY: merge + apply AFTER PR #1903 (`20260709030000_naac_catalog_binary_framework_sync.sql` creates `accreditation_metric_crosswalk`). Validated 2026-07-09 in a rolled-back prod txn with #1903's body prepended + own body run twice (idempotence proven). Apply AFTER the PR merges. (Expect trivial append-conflicts in this index with sibling PRs #1903/#1899 — resolve by keeping both entries.)
### Induction — re-key NAAC evidence to Binary 6.3 Mentoring & wellbeing (Director decision) — 2026-07-09
- Director decision 2026-07-09: fresher induction's Binary home = Metric 6.3 (Mentoring & wellbeing), Attribute 6. Full end-to-end re-key of legacy Criterion codes: catalog ('NAAC','5.1.3')→'6.3.1' ('Fresher induction / orientation — student mentoring & wellbeing') and ('NAAC','7.2.1')→'6.3.2' ('Fresher induction as institutional mentoring practice'), both 'Attribute 6: Extended Curricular'; the 2 existing auto-emitted `quality_evidence_mappings` rows follow (abort if >2 match); `fn_induction_emit_naac_evidence` re-created with ARRAY['6.3.1','6.3.2'] (body byte-faithful from prod pg_get_functiondef, = 20260730140000 retrofit version; ACL re-asserted); the two #1903 crosswalk home-TBD rows resolve to 6.3.1/6.3.2. Companion UI relabel in scorecard-section.tsx (same PR).
- Fail-loud: post-check RAISEs if the induction rows aren't at 6.3.1/6.3.2 after the guarded UPDATEs (collision/drift ⇒ abort, never a silent half-state). Idempotent re-runs no-op throughout.
- Location: `supabase/migrations/20260709034000_induction_naac_rekey_63.sql`. HARD SEQUENCING: merge + apply AFTER #1903 (crosswalk table, LEGACY marks) and #1907 (catalog mis-key re-keys) — timestamp sorts after both. Validated 2026-07-09 in a rolled-back prod txn chained as #1903 + #1907(amended) + this ×2. Apply AFTER the PR merges + deploys. (Expect trivial append-conflicts in this index with sibling PRs #1903/#1907/#1899 — keep all entries.)
### No-mechanics leak fix — learner surfaces show the ACTION, never the diagnostic — 2026-07-09
- Director interview 07:20 ("won't they start gaming the system?"): the learner loop-closure card + My Voice receipt quoted the TEACHER's AI note verbatim incl. sample sizes/averages/trigger bands — a 3-person sample lets a learner subtract themselves; printed thresholds teach the trigger recipe.
- `fn_scf_loop_closure_for_learner` + `fn_scf_my_impact` (CREATE OR REPLACE, RETURNS unchanged): learner-facing the_change/action_detail = COALESCE(quickWin, first suggestedAdjustments title, generic line) — display-time, covers all existing notes. Staff surface (fn_scf_loop_activity) untouched.
- All FOUR teacher-note generator prompts de-numbered in the same PR (cron, Mac runner [which was still sending the RAW average — the "2.33" source], ⚡ button route, ai-tasks registry): words-only group size + band words + explicit never-state-numbers rule.
- Location: `supabase/migrations/20260709021500_scf_no_mechanics_leak.sql`. Validated rolled-back as darsiniva (the screenshot case): the_change → the quickWin action text. Apply AFTER code deploys.

### Verdict integrity — claims vs numbers (leadership-only) — 2026-07-09
- Director interview 07:00 ("what if Devi bluffed?"): contradiction → alert leadership; repeat pattern → leadership-only track record (facilitator never sees a score kept on them). Derived state only — nothing new written.
- `fn_scf_verdict_track_record(from,to)` per-facilitator (verdicts/measured/agreed/contradicted) + `fn_scf_verdict_contradictions(from,to)` row-level (verdict='tried_helped' AND measured outcome_lift<=0, k>=3 outcome-responses floor; returns suggestion id, NO row-level class numerics). Agreement semantics documented in-file (not_tried excluded; tried_no_change never flagged — honest modesty). Leadership gate mirrors fn_scf_leadership_concerns; NON-SUPER callers never receive rows keyed to their own login email (teaching hod/coordinator never sees a score kept on them); IST date anchoring; anon/PUBLIC revoked.
- UI: ScfVerdictIntegrityCard on the PRINCIPAL page only (decision: never embed on a faculty surface). Dark until a verdict has a measured outcome; today shows devi.p 1-of-1 matched.
- Location: `supabase/migrations/20260709014500_scf_verdict_integrity.sql`. Validated rolled-back as the Director (track: devi 1/1/1/0; contradictions: 0). Apply AFTER code deploys.

### SCF generator maturity — policy lookup hoisted per-institution (PERF, live 500 fix) — 2026-07-09
- `20260709000100_scf_two_sided_48h_window.sql` placed `fn_get_policy_int('session_feedback.window_hours', 48, f.institution_id)` inside the ROW-LEVEL `WHERE` of `fn_scf_candidate_windows` + `fn_scf_ai_signal`. `f.institution_id` is correlated, so the planner cannot hoist it → the policy fn ran ~23,000×/run (23,232 rows in the 7-day window; only **6** distinct institutions and exactly **one** global policy row — every call returned the same constant). `scf-generate-suggestions` has returned `HTTP 500 · canceling statement due to statement timeout` on every run since that migration landed.
- Fix: resolve `{institution_id → window_hours}` ONCE in a **MATERIALIZED** CTE, then single-row `CROSS JOIN` + map lookup. `MATERIALIZED` is load-bearing — a plain CTE is INLINED in PG12+ and gets rescanned per row (a first attempt without it only moved 35.4s → 32.5s). NULL institutions use a `'_null'` text key rather than a sentinel UUID that could collide with a real id.
- Measured on prod in a rolled-back txn: `fn_scf_candidate_windows` **18,951ms → 167ms** (395 rows both sides; `EXCEPT` in both directions = 0); `fn_scf_ai_signal` **1,668ms → 58ms** (identical row). Per-institution override semantics preserved exactly. Signature/volatility/security unchanged; grants restated explicitly (candidate_windows = service_role only; ai_signal = authenticated + service_role — the `/api/academic/session-feedback/ai-suggest-improvement` route calls it with the caller's session).
- Do NOT raise `statement_timeout` instead: the cost is O(rows-in-window) and `session_feedback` grows ~3,300 rows/day.
- Location: `supabase/migrations/20260709090000_fix_scf_policy_lookup_per_institution.sql`. SQL-only PR (no code change) — safe to apply as soon as it merges.

### Accreditation — loop→AQAR evidence rollup, NAAC Metric 7.3 Quality Assurance System, IQAC bridge (PR 1/2) — 2026-07-09
- Framework: NAAC Reforms 2024 Binary Accreditation — Attribute 7: Governance and Administration → Metric 7.3 "Quality Assurance System", facets a–f (legacy: maps to Criterion 6.5 (IQAC) under the outgoing framework).
- Seeds 3 NAAC Metric-7.3 facet rows in `sh_accreditation_metrics` (7.3.d audits & performance assessment fed back / 7.3.e RESERVED quality-circle practice (/admin/loops Control Tower) / 7.3.f periodic stakeholder satisfaction with feedback; category 'Attribute 7: Governance' matching the existing 7.3.1 row, which is untouched; idempotent on (metric_type, metric_code)).
- `fn_accreditation_rollup_loop_evidence()` (VOLATILE SECURITY DEFINER, service_role ONLY — GRANT-level gate exactly like the SCF loop RPCs, 20260630160000): idempotently upserts one `quality_evidence_mappings` row per MEASURED loop cycle — `scf_ai_suggestions` domain=session_feedback → 7.3.f loop_key `scf_teaching` (incl. Better/Same/Worse vote counts from `scf_note_resolution_votes`), `induction_session_effectiveness` → 7.3.d `induction_session`, `scf_ai_suggestions` domain=induction → 7.3.d `induction_playbook`, `mess_menu_recommendations` → 7.3.f `mess_menu` (loop dark, 0 rows fine). ON CONFLICT (source_table, source_id, body_code, metric_code) refreshes metadata+mapped_at; never clobbers is_auto=false manual mappings. Returns per-loop jsonb counts (+ `count` total for the dispatcher summary).
- `fn_accreditation_ay_label(timestamptz)` — 'AY 2026-27' period label, June cutoff, IST.
- Seeds `ai_routine_schedules` row `accreditation-loop-evidence` (daily · 04:23 IST, minute_of_day 263) — fired via the AI-routine dispatcher, editable in /admin/ai-routines; NOT a raw vercel.json cron. Cron route: `app/api/cron/accreditation-loop-evidence/route.ts`; registry entry in `lib/ai-routines/misc-ai.ts`.
- Location: `supabase/migrations/20260709023000_accreditation_loop_evidence_rollup.sql`. Metadata contract PINNED for PR-2 (renders by loop_key): `{loop_key, loop_name, outcome{...}, delta_summary: improved|no_change|worse|n/a, measured_at}`.
### AI Pulse — close Measure + Verdict on the weekly cycle (gate 3) — 2026-07-09
- AI Pulse scored only gates ①Generate ②Act on the four-gate loop test: prod `pg_proc` had `fn_scf_*`/`fn_induction_*`/`fn_mess_*` measure+verdict fns and **zero** `fn_ai_pulse_*`. Tier 3 never emitted "goal met / goal missed", so `/admin/loops` reviewed it with eyes not outcomes.
- **The judge grades the whole FUNNEL**, not attendance: learn (live session) → apply in your domain (`event_submissions`) → AI Lab/Gold (`config.ai_pulse.gold_selections`) → publish on dept Instagram (`ig_posts`→`ig_post_metrics.reach ≥ ig_reach_threshold`). Signal definitions mirror `ai-pulse-pde-bridge-service.ts` so judge and bridge read the same reality. Grading engaged-attendance alone would have reported "≈15% engaged" and stayed silent about **853 teams producing 0 artifacts, ever**.
- NEW `ai_pulse_cycle_outcomes` (grain = cycle × dept, plus ONE lossless program row per cycle with `dept_id IS NULL`; **never SUM the two grains**). Key column `stage_reached` names where the funnel died (`no_attendance|no_engagement|no_domain_sync|no_gold|no_publication|complete`).
- NEW fns: `fn_ai_pulse_is_engaged` + `fn_ai_pulse_hhmm_minus` (IMMUTABLE SQL mirror of `isEngagedFromGates`/`isPresentAtEnd` — baseline AND outcome call it, so the estimator is identical by construction); `fn_ai_pulse_measure_cycle_outcomes` (**service_role only**); `fn_ai_pulse_set_verdict` (authenticated, hard `NOT IN` vocabulary guard: `intervened|partial|not_intervened`); `fn_ai_pulse_loop_confound_check` (falsification — if `intervened ≈ not_intervened`, the lift is RTM/drift and the loop is an echo, not a moat); `fn_ai_pulse_prior_dept_outcome` (service_role feed-forward reader for gate ④). All SECDEF fns carry an explicit `REVOKE … FROM anon` in-file.
- Baseline = **AVG of prior per-cycle ratios**, never `sum()/sum()` (the `fix_scf_measure_baseline_doublecount` bug class). RTM correction fits `regr_intercept`/`regr_slope` over the **untreated** departments; too few pairs ⇒ `insufficient_rtm_data`, `net_effect` NULL. **Never fabricates.** Idempotent in BOTH the candidate filter and the UPDATE's WHERE.
- Targets are INT PERCENTAGES (`engaged_attendance_target_pct=70`, `agency_yield_target_pct=10`). `data_type='float'` is permitted by the CHECK but **no policy row has ever used it**, so its Policies-editor render path is untested — do not be the first.
- Validated on prod in a rolled-back txn. Estimator fidelity proven by running the verbatim TS `evaluateGates` over the same 199 rows of cycle `ac1eea6c`: **TS engaged=29, SQL engaged=29** (joined=105, stayed=47, quiz_passed=20). Cold start honest: `written=34 measured=0 insufficient=34`, every row `insufficient_baseline`/`insufficient_data` with NULL lift. Anon locked on all four SECDEF fns; `authenticated` also denied on the measure fn.
- First real emission (program row, 06-18): `att=199 eng=29 teams=247 artifacts=0 → goal_missed / no_domain_sync`.
- Location: `supabase/migrations/20260709093000_ai_pulse_measure_verdict_loop.sql` + `20260709093100_ai_pulse_measure_verdict_seed.sql` (dials + `ai_routine_schedules` row, daily 10:15 IST). Apply AFTER the code PR deploys (the new cron route must exist before the dispatcher fires it).
- `migrations/20260710060000_iqac_meeting_loop_substrate.sql` — IQAC Meeting Loop substrate: `accreditation_committee_meetings` + `accreditation_committee_resolutions` (resolutions passed with owner+deadline, reviewed done/carried/dropped at the NEXT meeting; carried_count>=2 = Director escalation). RLS: view rides `accreditation.naac.committees.view`, writes need `accreditation.naac.committees.meetings.manage`. Body-agnostic via accreditation_committees. Evidence emitter (7.3.e) ships in the rollup-fn extension. (2026-07-10)

### 2026-07-10: Evidence holds — copo + placement emitters (Director edge-case interview)
- Three rulings, one shape — "computed + visible on dashboards, HELD OUT of quality_evidence_mappings": ① placement cohorts whose denominator stands on `outcome_reported` (roster empty or short — metrics gain `evidence_held='incomplete_roster'`, release action = complete the roster); ② copo rollups with uncertain institution stamp (`institution_match` NOT IN `unique_course_match|manual_assignment` — covers ambiguous CAS twins AND unmatched guesses; `manual_assignment` reserved for the upcoming re-stamp control); ③ copo small courses (`copo_attainment.min_course_size` config row, default 10).
- **DELIBERATE ASYMMETRY**: placement small cohorts stay IN evidence labeled `small_cohort` (Director explicitly kept the 2026-07-09 "compute, but label" ruling in the same interview). Only copo smallness holds.
- Self-healing: each emitter run DELETEs `is_auto=true` ledger rows whose source is now held; manually-curated rows never touched. New return keys: copo `held_uncertain_institution/held_small_course/evidence_rows_removed`; placement `cohorts_evidence_held` + per-cohort `result='measured_held_from_evidence'`.
- ⚠️ Size predicate uses `GREATEST(COALESCE(final,0), COALESCE(internal,0))` — `final_learner_count` is **0, not NULL**, before finals are declared; a bare COALESCE held all 47 courses in rolled-back validation (caught pre-apply). Same fix applied to the evidence `learner_count` display field.
- ROLLBACK-validated on prod 2026-07-10 (fn replaces + live copo run + seeded 3-learner no-roster placement cohort → measured 1/held 1/evidence 0). Applied to prod same morning: copo live run `count=92, removed=2, held_uncertain=1`; ledger 94→92.
- Location: `supabase/migrations/20260710023000_evidence_holds_copo_placement.sql`. ALREADY APPLIED to prod via Mgmt API — this file records it in the repo (both fns idempotent CREATE OR REPLACE).
- `migrations/20260710070000_rollup_iqac_meeting_and_audit_loops.sql` — rollup fn gains loop (e) `iqac_meeting` → 7.3.e (one row per MINUTED committee meeting; closure_rate + carried/dropped in metadata; supersedes the "7.3.e emits no per-row evidence" spec reservation) and loop (f) `institutional_audit` → 7.3.d (one row per CLOSED single-institution audit_cycle; findings via service_requests slug `audit_finding`; delta vs prior closed cycle; multi-institution cycles skipped — junction natural-key limitation). Base body = prod live def; loops (a)-(d) unchanged; same anti-join/isolation/is_auto patterns; rides the existing 04:23 IST dispatcher schedule. HARD DEP: apply 20260710060000 first. Validated chained + seeded 2-meeting lifecycle in one rolled-back prod txn (iqac_meeting=2, institutional_audit=1, closure_rate 0.50). (2026-07-10)

### 2026-07-10: Twin-college re-stamp control — CO/PO held rollups (Director: "Build the re-assignment control now")
- `fn_copo_restamp_rollup_institution(p_rollup_id, p_institution_id)` — user-facing SECDEF RPC releasing HELD rollups (`institution_match` = `ambiguous_first_mapped` | `unmatched_first_mapped`) into evidence by assigning the right college. Sets `institution_id`, `metadata.institution_match='manual_assignment'` (EXACT value the live emitter accepts — wire contract), `restamped_by`/`restamped_at`/`institution_match_before`. Gate INSIDE the body: `is_super_admin() OR user_has_permission('accreditation.evidence.restamp')` **plus** `role_has_institution_access(<target college>)` (never called with NULL — validated first). Candidate rule: must pick one of `metadata->'myjkkn_institution_ids'` when present; any ACTIVE college when absent. `unique_violation` → friendly `duplicate_rollup` error. anon/PUBLIC revoked; GRANT authenticated.
- `fn_copo_record_course_attainment` REPLACED with **manual re-stamp preservation**: each incoming replay row first looks for a `manual_assignment` row for the same course+session (+ same `coe_institution_code`) and, when found, redirects onto that row's college and re-merges the manual stamp keys. Without this the weekly cron clobbers the stamp back to held (same key: `metadata = EXCLUDED.metadata`) or resurrects a duplicate held row under the old guess (moved to the twin → keys no longer conflict). Same mutable-stamp-resurrection family as the crosswalk seed fixed in #1924. Stats columns still refresh every run — only the human's stamp keys persist.
- ROLLBACK-validated on prod 2026-07-10: impersonated plain student REFUSED (SQLSTATE 42501); impersonated super_admin: non-candidate college REFUSED, twin B accepted (`manual_assignment`, `restamped_by`=admin); absent-candidate-list probe assignable to any active college; replay probe → 1 row for the course (no duplicate), kept `manual_assignment` + college B, stats refreshed (75.0).
- UI: "Held CO/PO results — assign the right college" section on `/accreditation/naac` (component `copo-held-rollups-section.tsx`), visible to super admins + `accreditation.evidence.restamp` holders.
- Location: `supabase/migrations/20260710042000_copo_restamp_rpc.sql`. Orchestrator applies after review.
### 2026-07-10: CO/PO below-target course alerts to Principals (Steady alerts)
- Director decisions 2026-07-10 (verbatim): **"Principal only"**; **"Steady alerts"** — a course must be below target 2 weekly runs IN A ROW to enter the list, and leadership is messaged ONLY when the list CHANGES (a course enters or recovers).
- Why new state: `obe_course_attainment_rollup` is upserted IN PLACE every weekly run (no run history), so 2-consecutive-runs persistence lives in new `copo_below_target_state` (one row per institution × course_code, UNIQUE key all-NOT-NULL; RLS: accreditation viewers institution-scoped, writes RPC-only).
- `fn_copo_track_below_target()` (SECDEF, `search_path=public`, service_role ONLY — anon/authenticated/PUBLIC revoked, verified `has_function_privilege` anon=f auth=f service_role=t in rolled-back txn): ingests current rollups with CONFIDENT institution stamps only (`institution_match IN ('unique_course_match','manual_assignment')` — alerting a possibly-wrong Principal is worse than waiting), extends/resets streaks, returns per-institution entered/recovered changes jsonb. Idempotent within a run via `last_run_key` = `session_code@computed_at`. Courses absent from the current run or turned-uncertain are FROZEN (no increment, no false recovery). Config row `copo_attainment.alert_consecutive_runs` (global, 2) holds the "2 runs" number.
- Cron `/api/cron/copo-attainment` step 4: calls the tracker after evidence emit; per changed institution sends ONE in-app notification via the canonical `fanoutNotification` helper to that institution's active Principal(s) (`user_roles JOIN custom_roles role_key='principal'` + legacy `profiles.role='principal'` fallback, deduped; recipient lookup, not an authz gate). Body lists entered courses (code, name, attainment %, level vs target, learner-pass threshold, basis) + recovered, with the honest caveat that internal CIA figures evolve as marks land and everything is a course-level proxy. Idempotency key `copo_below_target:<institution>:<date>`. Response keys: `alerts_sent`, `institutions_notified`, `entered`, `recovered`.
- ROLLBACK-validated on prod 2026-07-10 (4 scenarios): run1 below ⇒ tracked (consec=1) NOT alerted, entered=0; run2 still below ⇒ entered=1 change (ZZTEST_A consec=2); same-run double call ⇒ incremented=0, skipped_same_run=15 (idempotent); run3 unchanged ⇒ 0 changes; run4 recovery ⇒ recovered=1, state reset. Real data at validation time: 48 confident evaluable rollups, 15 below target after probes.
- ⚠️ First LIVE run after apply seeds streaks (consec=1) for the ~13 currently-below courses with NO alert; the second weekly run alerts Principals for any still below — that ramp IS the Director's "Steady alerts" design.
- Location: `supabase/migrations/20260710041000_copo_below_target_alerts.sql`. NOT yet applied — orchestrator applies after review (code must deploy with it; either order is safe: the route 500s at step `track_below_target` if the fn is missing, and the fn no-ops state-only if the route is old).
### 2026-07-10: CDC placement no-data reminder — escalation-weeks config row
- ONE `platform_policies` row: `cdc_placement_loop.nodata_escalation_weeks` (global, `4`, number). Director decisions 2026-07-10 verbatim: weekly reminder to the named owner; "Yes — list the held cohorts"; escalation "Copy me after 4 weeks".
- Consumed by `app/api/cron/cdc-placement-outcomes/route.ts` (weekly Sun 03:15 IST via dispatcher): when `master_enabled=true` and BOTH `cdc_placements` + `alumni_outcomes` are empty, one in-app reminder fans out (shared `fanoutNotification` helper, two-write pattern) to `cdc_placement_loop.owner_id`; evidence-held cohorts (`metrics ? 'evidence_held'`) are listed; the (threshold+1)-th consecutive weekly reminder also copies the Director (profiles lookup by `director@jkkn.ac.in` at runtime, no hardcoded uuid). Consecutive count derived from notification history (`metadata->>source = 'cdc-placement-nodata-reminder'`) — no new state table. Per-IST-day idempotency keys dedupe manual same-day re-fires.
- No tables/functions; seed keyed on identity columns (`policy_key`, scope) with `ON CONFLICT DO NOTHING` — immune to the mutable-column seed-resurrection class.
- Location: `supabase/migrations/20260710040000_placement_nodata_reminder_config.sql`.

### 2026-07-10: Facilitator coverage — server-side college filter + covered-count fan-out fix
- Director live bug (~12:36 IST screenshot): Pharmacy/Allied-Health facilitators rendered under a Dental filter, plus a 266.7% coverage row. Prod-confirmed root causes: ① `fn_scf_facilitator_feedback_coverage` grouped covered counts by facilitator ONLY while taught was per (institution, facilitator) — multi-college facilitators got their GLOBAL covered count on every college row (Swathi Raman AHS row: taught 3, covered 8 → 266.7%); ② college narrowing was client-only.
- Fix: fn takes `p_institution_id uuid DEFAULT NULL` (narrowing inside caller scope, mirrors admin-trend); covered/cov_fac now grouped by (institution, facilitator) → coverage ≤ 100 by construction. OLD 2-arg fn DROPPED first (two overloads = PostgREST PGRST203 ambiguity); deployed 2-arg callers resolve via the default.
- Rolled-back impersonated validation, then APPLIED to prod 2026-07-10 ~13:0x IST: dental-filtered = 34 rows, NARMADHA excluded, Swathi once, 0 rows >100%; unfiltered live check post-apply: over100_live=0. Swathi AHS row now honest: taught 3, covered 0.
- Location: `supabase/migrations/20260710070000_facilitator_coverage_institution_param.sql`. ALREADY APPLIED via Mgmt API; file records it.
### 2026-07-10: SCF permission switches — verdict-report read key + 3 write keys (Director R2)
- 4 NEW keys seeded into custom_roles (identity-guarded UPDATEs, idempotent): `academic.session_feedback.verdict_report.view` (super_admin/administrator/principal/ceo/executive_admin_officer — NO hod), `academic.curriculum.lesson.manage` + `academic.live_poll.manage` + `academic.session_feedback.verdict.write` (each super_admin/administrator/hod/principal = today's living audience; the old arrays' institution_admin/dean/coordinator have no custom_roles row and no users).
- 9 fns re-pointed (bodies otherwise byte-identical to prod): fn_scf_verdict_contradictions + fn_scf_verdict_track_record (read gate → verdict_report.view; tenant hoisted to role_has_institution_access uuid[] so scope-all leadership sees all its colleges); fn_scf_set_verdict (leader branch → verdict.write; caller-inst==target-inst bind PRESERVED; `v_sug_inst IS NULL` hole CLOSED); fn_live_poll_can_manage class_session branch + fn_scf_open_pulse + _fn_live_poll_ensure_class_anchor (→ live_poll.manage — a WRITE question on a manage key); fn_curriculum_lesson_upsert EDIT override + fn_curriculum_lesson_ai_approve/_ai_reject (→ curriculum.lesson.manage; upsert's teaching-evidence CREATE branch untouched; system_admin kept as an explicit remnant in approve/reject — today's audiences differ per fn).
- APPLIED LIVE 2026-07-10 via Mgmt API, staged: seeds → per-identity key resolution verified (9 identities) → functions → BEFORE/AFTER impersonation matrix diff (83 baseline lines; only intended flips: ceo/eao gain the 2 verdict READS; administrator's verdict-read scope widens own→all-accessible, same as 20260731110000) → timing sweep 27 cells, worst 83ms (<3s budget).
- Location: `supabase/migrations/20260710120000_scf_permission_switches.sql`. NOTE: index tail also touched by PR #1953 — merge sequentially, keep both sections.
### 2026-07-10: SCF dashboard filter gaps + Facilitator Pulse timeout fix
- `fn_scf_struggling_notes_sent(date,date,uuid)` — NEW 3-arg overload beside the 2-arg (identical audience gate; adds `p_institution_id IS NULL OR n.institution_id = p_institution_id` — a filter, never a widening). No default on the 3rd arg (2-arg calls stay unambiguous); anon/PUBLIC revoked, authenticated granted; NOTIFY pgrst. Consumed by the "Support Notes Sent" card, whose rows carry no institution column.
- `fn_scf_facilitator_pulse(date,date)` — PERF REWRITE (same signature/output). Old body called `role_has_institution_access()` PER attendance-row inside fac_sess + a correlated `count(*)` on session_feedback per session ⇒ exceeded its own 20s statement_timeout under real authenticated sessions (admin-page Pulse card showed "canceling statement due to statement timeout"; /api/.../marks-coverage 500'd — it calls this fn). New body hoists tenant scope into `v_insts uuid[]` BEFORE the jsonb explosion and pre-aggregates witnessed/per-facilitator signals into grouped hash-joined CTEs. Measured: orig 21,660ms for a 5-DAY window vs 370ms new (row-identical, EXCEPT ALL both ways = 0); live 30-day window 239–937ms, 233 rows. Intended tightening: institution_id IS NULL attendance rows were leadership-visible via the role_has_institution_access(NULL)=TRUE quirk, now super-only (consistent with 20260731110000).
- APPLIED LIVE 2026-07-10 via Mgmt API (staged: _perftest/_origtest variants → timing + row-identity → live swap → variants dropped). ACLs verified anon=f/auth=t on all 3 signatures; faculty caller still raises 'not authorized'.
- Location: `supabase/migrations/20260710100000_scf_filters_notes_overload_pulse_perf.sql`.
### 2026-07-10: Loop registry + edges + audits — the loop tower's data spine (Director evening interview)
- The /admin/loops Loopcraft tower was hand-coded prose and the 14 loop cards a hardcoded page.tsx array; interconnections existed nowhere as data; loop-test verdicts lived in a terminal. Config-table pattern: three new tables.
- `loop_registry` (16 rows: the 14 card ids verbatim + `metaloop`/`director` stack anchors) — `gates` jsonb moves the hand-typed G·A·M·F literals into editable rows; `stack_tier`, `loop_class`, `routine_id` anchor.
- `loop_edges` (18 rows) — from→to + `what_flows` (measured_outcomes|decisions|fuel|escalations); inferred edges flagged `is_draft` (Director: draft-and-ship, refine as one-row fixes).
- `loop_audits` — verdicts written by the `/loops` CLI harness (`layer` sim|walk|full); the tower shows "last tested" per ring. First row landed same evening: scf · sim · measure-verified.
- RLS: SELECT = super/is_admin (system-wide governance config, no institution scope); NO write policies (service_role only). REVOKE ALL from anon **and authenticated** then GRANT SELECT — Supabase's default privileges give `authenticated` ALL on new tables (table twin of the anon-EXECUTE function trap); caught by rolled-back ACL assert.
- Validated in a rolled-back prod txn (seed counts 16/18, gate-shape check, ACL matrix, impersonated reads: super=16 rows / faculty=0) then APPLIED LIVE 2026-07-10 ~23:35 IST.
- Location: `supabase/migrations/20260710233000_loop_registry_edges_audits.sql`. Consumers: /admin/loops page (PR pending), `~/.claude/skills/loops` harness.
### 2026-07-10: SCF three-zone outcome language + retry fairness + unmeasurable stamp (Director interview, post moat-loop audit)
- Director decisions 1/6/7 (12:50 IST interview): ONE definition of "helped" everywhere — lift < 0 didn't help · 0–0.5 "about the same" · ≥ 0.5 helped; alerts about a PERSON need ≥5 next-session answers; notes unmeasured after 30 days get an honest "could not be measured" stamp.
- `scf_ai_suggestions.outcome_unmeasurable_at` (NEW column) — stamped by the measurer, excluded from its candidate scan; my-loop-notes card reads it as "could not be measured", not "waiting".
- `fn_scf_verdict_track_record` + `fn_scf_verdict_contradictions` (CREATE OR REPLACE, bodies = live 20260710120000 permission-switch versions): agreed now requires lift ≥ 0.5 (was > 0); contradicted requires lift < 0 (was ≤ 0 — a +0.36 "tried_helped" no longer reads as a bluff); k-floor 3→5 on BOTH fns in lockstep (deep-review consensus: card and alert list must count the same rows).
- `fn_scf_measure_suggestion_outcomes` (CREATE OR REPLACE, body = sim-verified 2026-07-10 version): candidates skip stamped rows; post-measure pass stamps 30-day-stale improvement notes. Return value unchanged (rows measured).
- TS lockstep in the same PR: three-zone bands + sample-size tiers in BOTH generator prompts (cron buildTrackRecordBlock ported the interactive route's tiered evidence logic); regen guard blocks only UNMEASURED recent notes ("wait for result or 7 days"); RETRY_SLOTS=5 of BATCH_CAP=25 reserved for measured-awaiting-retry courses; cross-peek line so the facilitator/leadership lanes never contradict unknowingly; card derives the "was" band from (after − change).
- Location: `supabase/migrations/20260710160000_scf_three_zone_retry_fairness.sql`. Validate rolled-back on prod, apply AFTER code deploys (three-zone display language should not precede the prompt bands by much, but nothing breaks either way — fns are self-contained).
### 2026-07-11: Loop governance wires — scheduled regress + watchdog (Director: "yes want them")
- `fn_loops_regress_scf()` — the SCF known-delta measure sim INSIDE a plpgsql subtransaction: seeds (ZZREGRESS1) → measure → capture lifts → sentinel RAISE rolls the seeds back; only the loop_audits verdict row persists. Verdict = measure-verified ⟺ no-change reads exactly 0.00 AND +2 reads exactly 2.00; anything else = sim-failed / sim-error (seeds still rolled back). service_role-only. Validated rolled-back on prod (verdict measure-verified, 0 sentinel residue inside the txn, audits +1) then APPLIED LIVE 2026-07-11 ~06:30 IST.
- Dispatcher rows seeded (identity-guarded): `loops-regress` (Sundays 07:53 IST) + `loop-watchdog` (daily 09:23 IST). Routes /api/cron/loops-regress + /api/cron/loop-watchdog ship in the same PR; if the dispatcher fires before that deploy, the run records "skipped: not in registry" once and self-heals.
- Wire 2/3 live in the routes: non-verified regress verdicts and watchdog findings (managed routines silent past their OWN cadence — days_of_week-derived, ~25h daily / ~7d weekly; errored last_status; disabled managed rows; FAILURE audit verdicts sim-failed/sim-error/walk-failed — honest states like unmeasurable-no-fuel excluded) fan out to super admins via fanoutNotification (idempotent per IST day + finding-set fingerprint). /admin/loops renders the same conditions RED live via the same shared helpers (card last-run line + tower tested badge).
- Location: `supabase/migrations/20260711064500_loop_regress_fn_and_wire_schedules.sql`.
### 2026-07-11: Max-lane CHAT queue — "Ask on Max" for AI Query (seat owner only)
- Director asked (8th iteration of the Max ask) for AI Query on the Max lane. Boundary held: allowlist is INDIVIDUAL user ids (`ai_model_config.config_json->'max_lane_user_ids'` on the `ai_query.natural_language` row), expected to hold ONLY the seat owner — never role-wide; a personal Claude subscription must not serve other users' product traffic. Everyone else (and every fallback) uses the API path, which now prompt-caches its static prefix.
- New table `max_lane_chat_requests` (id, requested_by→auth.users, conversation_id, message, status pending|claimed|done|error, answer, result_note, requested_at/claimed_at/completed_at). RLS-enabled with **NO policies** (RPC-only); `REVOKE ALL FROM anon, authenticated`. Indexes: (status), (requested_by, requested_at DESC).
- 5 SECURITY DEFINER RPCs (all `SET search_path = public`): `fn_max_chat_request(text,uuid)→jsonb` (allowlist-gated; refuses without insert when the `maxlane:poller-heartbeat` pulse is >5 min stale so the route can fall back instantly; up to 3 live requests per requester — Director edge-case decision: a second question queues behind the first on Max; 4000-char cap) + `fn_max_chat_status(uuid)→jsonb` + `fn_max_chat_cancel(uuid)` (requester-scoped; cancel flips pending/claimed rows to error so a late runner completion — guarded on status='claimed' — can't overwrite it) — all three `REVOKE anon,PUBLIC; GRANT authenticated`. `fn_max_chat_claim_pending()→setof` (≤3 via FOR UPDATE SKIP LOCKED; 10-min expiry for BOTH unclaimed and claimed-but-silent rows — chat is time-sensitive) + `fn_max_chat_complete(uuid,text,text,text)` — both service-role-restricted by GRANT and runtime JWT check, mirroring the fn_max_lane_* siblings.
- Consumer: app/api/ai-query/route.ts (enqueue → 2.5s long-poll → 120s unclaimed / 180s total deadlines (fallback always keeps ≥100s of the 300s function budget) → cancel + cached-API fallback). Runner: ai-query-chat.mjs on the Windows box (claims, answers via headless claude -p, records ai_model_usage provider=claude_code model=max-subscription cost 0).
- Location: `supabase/migrations/20260711113000_max_lane_chat_requests.sql` (additive; apply via Mgmt API at/after merge — until applied, the route's RPC call errors and every question just uses the API path).
### 2026-07-11: Spend-cap enforcement helper (caps become REAL)
- Director interview decision: the 'Monthly spend cap' box on /admin/ai-models was display-only; now `getModelForFeature()` enforces it — MTD spend ≥ cap on an anthropic row degrades the resolved model to `claude-haiku-4-5` (answers keep flowing, cost stops climbing); non-anthropic rows keep their model (modality mismatch) so the cap stays advisory there. Fail-open on any check error.
- `fn_ai_feature_mtd_spend(text)→numeric` — SECURITY DEFINER month-to-date `sum(cost_inr)` for one feature_key (PostgREST aggregates are disabled on this project, PGRST123). service_role ONLY (`REVOKE anon, authenticated, PUBLIC`): the resolver reads via the service-role client, and per-feature spend totals aren't for every logged-in user to enumerate.
- Location: `supabase/migrations/20260711100000_ai_cap_enforcement_fn.sql`. Consumer: `lib/services/platform/ai-model-config-service.ts` (cache-miss path, ≤60s lag). UI: /admin/ai-models over-cap rows say "auto-running on Haiku until next month".
### 2026-07-11: SCF learner-notes per-run cap → platform policy (Director: unlimited + UI-editable)
- `scf_notes.batch_cap` (NEW platform_policies row, global scope, value 10000 = effectively unlimited, ui_widget number, ui_category scf) — seeded idempotently (NOT EXISTS on identity, never on value, so Director edits are never resurrected). The Max-lane twin honors the value fully; the cloud cron clamps to its 50/run serverless ceiling (90s dispatcher window). Editable via the /admin/ai-routines cap chip — writes gated by existing platform_policies_update RLS (super_admin/admin).
- Location: `supabase/migrations/20260711013000_seed_scf_notes_batch_cap_policy.sql`. APPLIED to prod 2026-07-11 ~06:58 IST via Mgmt API (data-only seed, code-independent — row live before merge so tonight's Max-lane run can read it).
### 2026-07-11: AI ledger registration for procurement PDF extraction
- `ai_model_config` +2 rows (`procurement.quotation_extract`, `procurement.invoice_extract`) — seeded to the code's current hardcode `claude-opus-4-8` (cutover invariant: zero behavior change). Model now governed from /admin/ai-models; usage recorded to `ai_model_usage` by the companion code change (lib/procurement/*-pdf-extract.ts adopt resolveChatModel/recordChatCall primitives from ai-clients/chat).
- No DDL, no RPCs. Idempotent (ON CONFLICT (feature_key) DO NOTHING) — a Director model change from the UI is never clobbered.
- Location: `supabase/migrations/20260711060000_ai_model_config_procurement_extraction.sql`.
### 2026-07-11: SCF admin "Low sessions" second lens (individual struggling voices)
- `fn_scf_admin_college_summary` DROP+CREATE with two ADDITIVE trailing columns: `low_flag_responses` (responses rating understanding <= 2) + `low_flag_sessions` (sessions containing >= 1 such response). Reconciles the admin card's "4 low sessions" with the ~1,044 individual low ratings the Director saw — the whole-class counter (k>=3 floor, avg<3) and the per-learner lens now sit on the same card. Authz + k-floor unchanged; grants re-applied (authenticated + service_role, anon/PUBLIC revoked).
- Location: `supabase/migrations/20260711070000_scf_admin_college_summary_low_flags.sql`. APPLIED to prod 2026-07-11 ~12:35 IST via Mgmt API after BEGIN..RAISE-EXCEPTION rolled-back validation (impersonated superadmin smoke: Arts&Science 587 flags/400 sessions, Engineering 261/203). Additive-safe for the attendance-dashboard feedback tab (shares the RPC, ignores new columns).
### 2026-07-11: Resource Management joins centralized Procurement (Phase 5 reuse proof)
- `fn_procurement_rm_reconcile_new_item(institution, name, description)` + `fn_procurement_rm_post_receipt(resource, qty, value)` — two SECURITY DEFINER RPCs giving procurement a NARROW write path into `resources` (RLS there needs resources.resources.create/edit, which storekeepers deliberately lack). Gate = procurement.grn_verify + institution scope; post_receipt binds authority to the TARGET row's institution; reconcile rejects NULL institution (role_has_institution_access(NULL)=TRUE trap). REVOKE anon+PUBLIC / GRANT authenticated per template.
- Director decisions encoded: new items → ONE 'needs-setup'-tagged draft under global "Procurement Intake" holding category (qty via first receipt); top-ups never rewrite warranty/vendor/value (purchase_date/current_value set only when NULL).
- Companion code: resource-mgmt-adapter registered (registry one-liner), grn-service now materializes null-item lines via adapter.reconcileNewItem (also fixes the latent IMS new-item null-post gap), RM list needs-setup counter/filter, IMS-redirect note on the PR form.
- Location: `supabase/migrations/20260711093000_procurement_rm_adapter_rpcs.sql`.
### 2026-07-11: RM procurement adapter hardening (review response, PR #1977)
- Supersedes both RPCs above with review-driven signatures. `fn_procurement_rm_post_receipt(grn_item, resource, qty, value)` is now BOUND to a real GRN line (line must be linked to the resource, in a verified resource_mgmt GRN of the same institution, qty must equal the line's accepted qty) and claims the line exactly-once via new column `procurement_grn_items.domain_posted_at` (claim + stock increment share the fn's transaction). Kills the "grn_verify holder can inflate any resource in their institution" primitive and makes the verify loop's posts idempotent/retry-safe. `fn_procurement_rm_reconcile_new_item(institution, name, description, po_item)` gains pg_advisory_xact_lock around the holding-category get-or-create (concurrent-create dupe race) and a FOR UPDATE dedup on the PO line (split delivery reuses GRN1's draft; domain_item_id backfilled in-transaction). Old 3-arg signatures DROPPED — safe, no deployed caller existed. REVOKE anon+PUBLIC / GRANT authenticated re-applied on both new signatures.
- Location: `supabase/migrations/20260711153000_procurement_rm_adapter_hardening.sql`. APPLIED to prod 2026-07-11 ~19:20 IST via Mgmt API after BEGIN..RAISE-EXCEPTION rolled-back validation (11 quadrants incl. unbound-target REJECTED, idempotent re-post no-op, learner-persona REJECTED, cross-institution PO line REJECTED).
### 2026-07-11: RM procurement adapter hardening r2 (review round 2, PR #1977)
- `fn_procurement_rm_post_receipt` re-CREATE OR REPLACEd (same signature): purchase_date now recorded in Asia/Kolkata, not UTC session date (near-midnight IST receipts dated the previous day). New `fn_procurement_recompute_po_line_received(po_item)` — SECURITY INVOKER (deliberate: caller's own RLS must already permit the po_item UPDATE; no new privilege surface) single-statement UPDATE-with-subselect that recomputes received_quantity from verified GRN lines atomically — replaces the service-side read-then-write recompute that could interleave under concurrent verifies. anon/PUBLIC revoked on both.
- Location: `supabase/migrations/20260711163000_procurement_rm_hardening_r2.sql`. APPLIED to prod 2026-07-11 ~20:05 IST via Mgmt API after rolled-back validation (IST purchase_date, recompute=5, converges to 8 across two GRNs, pending-GRN lines excluded).
### 2026-07-11: Max-chat inbox — finished answers wait for the seat owner
- Director edge-case decision (interview r2): a Max answer that finishes after the tab/phone died must not be lost. The runner already persists answers on the queue row; this adds `delivered_at` + a drain.
- REVISED same day (deep-review consensus: stamp-on-read = at-MOST-once, the exact loss this feature prevents). `max_lane_chat_requests.delivered_at` (NEW column). `fn_max_chat_inbox()` — requester-scoped PURE READ (STABLE; idempotent under GET/prefetch/retries; status='done', unacked, last 24h, non-empty answer, ordered, LIMIT 20/page). `fn_max_chat_ack(uuid[])` — requester-scoped delivery stamp called by the CLIENT only after render (live deliveries ack the same way via the POST response's max_request_id; the route never stamps). At-least-once: a lost ack re-shows the answer next load. `fn_max_chat_mark_delivered` DROPPED (superseded). All REVOKE anon/PUBLIC, GRANT authenticated.
- Consumers: GET /api/ai-query (read-only inbox; RPC-absent → empty inbox, never an error) + PATCH /api/ai-query ({ack_ids}) + use-ai-query hook (reads on mount, renders Q&A pairs with the max_lane chip and an "answered while you were away" footer, THEN acks).
- Location: `supabase/migrations/20260711173000_max_chat_inbox.sql` (additive; apply via Mgmt API at/after merge).
### 2026-07-12: Store Kit Entitlements — PR-K1 schema + engine (ships DARK)
- Spec: `specs/store-kit-entitlements-spec-2026-07-12.md` (24 Director decisions). Per-group item kits handed over at the ONE central store; kit cost inside fees; entitled-vs-collected diff on a MATERIALIZED ledger is the core mechanism (decision 10 forces materialization).
- 6 new tables: `ims_kit_rules` (group targeting, mirrors hostel_room_eligibility_rules; central-only authoring), `ims_kit_rule_members` (hand-picked lists), `ims_kit_rule_items` (item+qty+cadence CHECK yearly|once), `ims_kit_entitlements` (person×item×anchor ledger; generated person_key/anchor_key for ON CONFLICT; year-LEVEL anchors for learners, AY/employment for staff; cost_price snapshot; billing flags), `ims_kit_collections` (handover events: proof qr|staff_verified, proxy identity, same-day void, free_replacement/defect_swap kinds), `ims_kit_collection_windows` (waves + late approval).
- 6 RPCs (all SECURITY DEFINER, gates duplicated inside, REVOKE anon/PUBLIC, GRANT authenticated): `fn_kit_resolve_entitlements` (grant/top-up/reopen engine), `fn_kit_record_collection` (atomic stock decrement on ims_stock_summary), `fn_kit_void_collection`, `fn_kit_expire_academic_year` (billing flags), `fn_kit_my_kit` (self view), `fn_kit_billing_flags` (accounts report; target-row institution scoping incl. learner-filter guard).
- Provenance pinned by BEFORE UPDATE triggers (rules.created_by; collections everything-except-void-fields). Handover RPC deliberately NOT institution-scoped (one central counter serves all colleges); reads ARE scoped. RLS: reads via ims.kits.view/handover + self; direct table writes admin-only (RPC-forced path). Permission keys ims.kits.* granted to NOBODY yet — feature dark until grn_verify rollout.
- Location: `supabase/migrations/20260712190000_store_kit_entitlements.sql`. Applied to prod via Mgmt API after rolled-back validation (see PR).
### 2026-07-12: Store Kit Entitlements — PR-K3 hardening + edge cases (ships DARK)
- Closes the #1999/#2000 review findings that merged UNDISPOSITIONED (all verified real vs live prod) + encodes edge-case decisions D25-D44. Layers on K1; feature still dark.
- Schema additions: `ims_items.kit_source` (central|college — the drain fix's item→store binding, D25/D32); `ims_kit_entitlements.granted_academic_year_id` (precise expiry scope) + CHECK `anchor_year_level BETWEEN 1 AND 6`; `ims_kit_collections.void_item_returned` (D30). New trigger `trg_kit_rule_item_guard` blocks kitting an item with no cost_price (D34) or no kit_source (D32), and a college item in a cross-college rule (D40). New RPC `fn_kit_revoke_rule_entitlements` (D33 fat-finger undo; deletes qty_collected=0 rows only).
- RPC rewrites: **record_collection** — item-bound store validation (central item⇒central store; college item⇒entitlement-institution store) kills the HIGH stock-drain; 30s duplicate block (D27); withdrawn/inactive person block via lifecycle_status/is_active (D36); free_replacement REMOVED (D41, always paid); owed-balance (qty_collected>0) skips the window gate (D42). **void_collection** — new p_item_returned arg (D30: stock restored only if returned, else booked a loss); same-day check in Asia/Kolkata not UTC. **expire_academic_year** — re-flag now clears billing_flag_cancelled_at (HIGH revenue-leak fix), and learner scope uses granted_academic_year_id not "all year-anchored rows" (MED). **resolve_entitlements** — year_level from FIRST digit group bounded 1..6 (MED, was 'Sem 3 (2024)'→32024); D43 partially-collected expired reopens on re-resolve; current-AY picked by DATE via scalar subquery (is_active is NOT a current-year flag — up to 11 active AYs per institution; a join fan-out would have broken resolve entirely — caught by rolled-back validation).
- Location: `supabase/migrations/20260712220000_store_kit_hardening.sql`. Applied to prod via Mgmt API after 13-test rolled-back validation (drain quadrants REJECTED, dup/withdrawn/free-replacement/cost-gate/cross-college REJECTED, void-loss no-restore, owed-balance-anytime, reopen-cancels + re-expire-rebills, revoke-keeps-collected). ⚠️ ROLLOUT PREREQ: every kit item needs cost_price + kit_source set (the trigger enforces it at rule-authoring; the IMS item editor has no kit_source field yet — set via SQL or add the field before rollout). Old 2-arg fn_kit_void_collection dropped.
### 2026-07-13: AI Studio — admin CRUD + self-describing run form for the ai_job_types registry (PR #2006)
- Two additive columns on `ai_job_types`: `input_schema jsonb NOT NULL DEFAULT '[]'` (field descriptors the AI Studio UI auto-draws into a run form) + `expected_seconds int` (the "expected ~Ns" progress timer; NULL = derive). `ADD COLUMN IF NOT EXISTS` — idempotent.
- Five super-admin registry RPCs (SECURITY DEFINER, internal `is_super_admin()` gate that RAISEs, REVOKE anon+PUBLIC / GRANT authenticated): `fn_ai_job_type_admin_list()`, `fn_ai_job_type_upsert(jsonb)` (validates job_type `^[a-z0-9_.]+$`, coerces lane/output_target/allow_rule to the CHECK vocab, upsert), `fn_ai_job_type_set_enabled(text,boolean)`, `fn_ai_job_type_delete(text)` (FK-safe: blocks if ai_jobs reference it), `fn_ai_job_type_last_run(text)` (requester-scoped for interactive types, global for batch). The generic run path `fn_ai_enqueue`/`fn_ai_job_status` (#1998) is REUSED unchanged.
- Companion API: `/api/admin/ai-job-types` (GET/POST) + `/api/admin/ai-job-types/[job_type]` (PATCH/DELETE), super-admin gated; `/api/ai-jobs/enqueue` + `/api/ai-jobs/status` (generic run).
- Location: `supabase/migrations/20260713000100_ai_job_types_admin_and_run.sql`. Rolled-back-validated on prod 2026-07-13 (BEGIN…ROLLBACK, clean); apply via Mgmt API at/with merge (additive, backward-compatible — old code never references it).
### 2026-07-13: AI routines run Max-only — max_only deferral flag (PR #2008)
- `ai_routine_schedules.max_only boolean NOT NULL DEFAULT false` (NEW column). Set true for every `maxlane:%` routine EXCEPT `maxlane:voice-memo-sentiment` (voice is the explicit exception) and `maxlane:poller-heartbeat`. `shouldDeferToMaxLane` gains a max-only mode: when the row has max_only=true AND enabled, it defers to the Max lane UNCONDITIONALLY (drops the API fallback), regardless of heartbeat freshness; fail-open catch preserved. Inert for the two cloud crons that don't call the guard (admission-insights-generate, work-pulse-analyze) until a defer guard is added in follow-up.
- Location: `supabase/migrations/20260713000200_ai_routine_max_only_flag.sql`. Rolled-back-validated on prod 2026-07-13; apply just before/with the #2008 code deploy (if code deploys first, the max_only select errors → fail-open to cloud, safe but Max pin inactive in that window).
### 2026-07-13: Seed 10 staff AI features into the ai_job_types registry (PR #2009)
- 10 `ai_job_types` rows (INSERT … ON CONFLICT (job_type) DO NOTHING) for the staff-facing interactive features (admission.agentic_query/ai_response/ai_service, cdc.career_guidance, session_feedback.suggest_improvement, work_pulse.translate, attention_bar.assistant, curriculum.lesson_spine_regen, ai_pulse.anomaly_detection, work_pulse.analyze). lane=max, interactive=true, output_target=inbox, with prompt_template + input_schema per feature. allow_rule=permission:cdc.view for cdc.career_guidance; others use the safe 'authenticated' fallback (documentary until each route is enqueue-converted). ai_pulse.anomaly_detection seeded with prompt_template=NULL (rule-based, not LLM-runnable). Depends on …000100 (needs the input_schema/expected_seconds columns) — apply order enforced by timestamp.
- Companion code: `app/api/work-pulse/translate/route.ts` converted to enqueue via `fn_ai_enqueue('work_pulse.translate')` + poll `fn_ai_job_status` as the working reference conversion.
- Location: `supabase/migrations/20260713000300_seed_staff_ai_job_types.sql`. Rolled-back-validated on prod 2026-07-13; apply after …000100.
### 2026-07-13: fn_loops_regress_feeder — second scheduled known-delta regress sim (feeder loop)
- Savepoint self-rollback sim (mould: 20260711064500 fn_loops_regress_scf): seeds 3 prior + 3 current sentinel-school learners ('ZZREGRESSFEEDER HSS') → asserts fn_schools_network_feeders cycle_delta = 0.00, then +2 current (5 vs 3) → exactly 2.00; impersonates a super admin via transaction-local `request.jwt.claim.sub` for the verifier's permission gate (reverted by the rollback); only persistent write = its loop_audits verdict row. REVOKE anon/authenticated/PUBLIC + GRANT service_role. Wired into LOOP_FNS in `/api/cron/loops-regress` (Sundays 07:53 IST). Location: `supabase/migrations/20260713010053_loop_regress_fn_feeder.sql`. Rolled-back-validated on prod 2026-07-13. ⚠️ Apply via Mgmt API BEFORE merging the route change — the cron sim-errors if the fn is absent.
### 2026-07-13: Exam IA Audit — CIA provenance + eligibility cross-check (Registrar's audit sheet)
- NEW key `academic.internal_marks.exam_audit.view` seeded super_admin/administrator/principal(own)/ceo/executive_admin_officer/**registrar** (scope=all — the in-person auditor). HoDs excluded.
- 3 NEW fns: `fn_exam_audit_access()` (single authority: allowed + is_super + accessible institution uuid[]; tenant hoisted once); `fn_exam_audit_attendance(uuid[],date,date)` (per student×course present/total/% from the day-one blob, institution-filtered BEFORE the jsonb explosion, course bridged via blob course_id→courses; **p_from mandatory** — unbounded scan measured 3.7s vs 1.1–2.2s windowed); `fn_my_running_attendance()` (self-scoped learner per-course running score; empty-not-error for staff). All anon/PUBLIC-revoked + authenticated-granted; 20s/15s statement_timeouts.
- Consumed by `/api/internal-marks/exam-audit` (joins COE exam_registrations + raw cia_marks provenance + programs against the attendance fn; verdicts faculty_continuous/partial/operator_bulk/missing) and `/api/internal-marks/my-running-attendance`. COE reads server-side via COE_SUPABASE_* (verified in Vercel prod 2026-07-06).
- APPLIED LIVE 2026-07-13 (staged: seed → key resolution registrar/principal=true, hod/student=false → fns → smoke+timing). Verified: CET APRIL-MAY-2026 buckets (91 reg/11 norec/60 <65%/1 band for MECH) **exactly match** an independent SQL recomputation; student API call → 403; principal cross-college → 403.
- Location: `supabase/migrations/20260713130000_exam_ia_audit.sql`.
### 2026-07-13: Exam IA Audit weekly alerts — config rows (Director: "Build the lever")
- 2 `platform_policies` rows: `exam_ia_audit.alerts_enabled` (global, true) + `exam_ia_audit.alert_lead_days` (global, 21). Consumed by `app/api/cron/exam-audit-alerts/route.ts` (weekly Mon 08:13 IST via vercel.json): for each COE college with an exam session starting within lead-days (or underway), verdicts come from the SHARED `lib/services/exam-audit/compute.ts` (the same computation the audit page renders — extracted in this change so cron and page can never drift); programs at operator-dump / missing / no-rubric fan out ONE in-app notification per college per ISO week (`fanoutNotification`, idempotency `exam_ia_audit:<coeInst>:<session>:<week>`) to Registrar(s) + that college's Principal(s) (Role-Management + legacy dual lookup, recipient-not-authz).
- No tables/functions; seeds keyed on identity ON CONFLICT DO NOTHING. APPLIED LIVE 2026-07-13; dry-run proven against prod (CAS NOV-DEC-2026 → 11 flagged, 3 recipients; lead temporarily 120→ restored 21).
- Location: `supabase/migrations/20260713210000_exam_ia_audit_alert_config.sql`.
### 2026-07-14: mission_pillars — UI-configurable mission-pillar map (Director: "make the pillar configurable in the UI")
- NEW table `public.mission_pillars` (pillar_key UNIQUE, name, anchor_quote, source_url, covering_loops text[]→loop_registry.loop_key, coverage_status covered|partial|gap|excluded, display_order, is_active, notes). RLS: SELECT any authenticated; writes gated is_super_admin()/is_admin(). REVOKE ALL FROM anon,PUBLIC + GRANT SELECT/INSERT/UPDATE/DELETE authenticated (twin-trap closed — supersedes the anon-readable `mission_map` draft on branch feat/mission-pillar-map-configurable, which also timestamp-collides with exam_ia_audit_alert_config). updated_at via fn_touch_updated_at. Seeds the current 9-pillar review state (2 covered / 3 partial / 4 gap) ON CONFLICT (pillar_key) DO NOTHING. Edited on `/admin/loops/pillars`; the /admin/loops management strip reads it for the coverage cell. Location: `supabase/migrations/20260714041600_mission_pillars_config.sql`. Rolled-back-validated GREEN 2026-07-14 (cols=12, seed=9, anon cannot read, RLS on, 0 orphan loops); APPLY pending user consent (auto-mode classifier correctly declined a teammate-relayed directive as prod-deploy authorization).
### 2026-07-14: drop mission_map (superseded orphan cleanup, paired with mission_pillars)
- `DROP TABLE IF EXISTS public.mission_map CASCADE;` — removes the live, anon-READABLE (`SELECT USING(true)`) orphan applied out-of-band from unmerged PR #2038. Verified safe: 0 code refs on main, 0 FKs referencing, 0 views; 13 rows share ONE updated_at (single seed, no edits; content matches the approved draft which remains SoT). CASCADE drops only its own trigger + policies. Rolled-back-validated 2026-07-14 (before_rows=13 → dropped→ rollback restored it). Location: `supabase/migrations/20260714041700_drop_mission_map_superseded.sql`. Destructive — APPLY pending user consent, applied together with 20260714041600.
### 2026-07-13: ai_routine_run_log — dispatcher-lane run logbook (Loop Tower EXECUTION ring)
- New table `public.ai_routine_run_log (id, routine_id, fired_at, status)` — the dispatcher's append-only run log (one row per fire), the only per-run history for the editable-dispatcher lane (ai_routine_schedules keeps only last_fired_at; the async jobs lane is already per-job in ai_jobs, #1998). RLS ON + zero policies AND explicit `REVOKE ALL FROM anon, authenticated, PUBLIC` + `GRANT ALL TO service_role` (Supabase default-privileges twin-trap). Two indexes: `(routine_id, fired_at DESC)` and `(fired_at DESC)`. `fn_ai_routine_record_fire(text,text)` extended to ALSO INSERT a run-log row, wrapped best-effort so a logging failure can never fail the dispatcher tick (the last_status UPDATE stays primary). Powers the Loop Tower ring-2 "dispatcher runs logged" chips (rendered "since 13 Jul" until data accumulates).
- Location: `supabase/migrations/20260713020000_ai_routine_run_log.sql`. Rolled-back-validated on prod 2026-07-13 (anon/auth locked out, service_role writes, fn wrote a row) THEN applied via Mgmt API (pre-authorized) — table live, code reads it via the super-admin-gated service-role page.
### 2026-07-13: Loop Adherence Alerts wire — missed mentor check-ins + quiet referral desk (daily-until-fixed)
- Additive, idempotent seed: dispatcher row `loop-adherence` (daily 09:41 IST, minute_of_day 581, managed) fires `/api/cron/loop-adherence-alerts`, plus the two escalation `loop_edges` the alerts realise (`mentor-checkins→decisions` and `referral-desk→decisions`, what_flows='escalations', NOT EXISTS-guarded; both keys verified in loop_registry). Cadence DAILY UNTIL FIXED (Director 2026-07-13). SWEEP A = active+trained mentors with ≥2 consecutive most-recent unmarked check-in beats (dark until first beat 2026-08-15); SWEEP B = any assigned_counselor_id desk owning ≥1 open source=referral lead with 7d+ zero activity (7 quiet desks live 2026-07-13).
- Location: `supabase/migrations/20260713042000_loop_adherence_alerts_wire.sql`. Rolled-back-validated on prod 2026-07-13. No DDL (additive rows only) — apply via Mgmt API before or after the code deploy (cron 401s until the dispatcher calls it; edges are display-only).
### 2026-07-15: Verified Skills Record ("My Proof") — phase 1 substrate
- 3 NEW tables: `vsr_share_tokens` (live verify-links; unguessable 24-byte URL-safe tokens; revocable; view-counted), `vsr_disputes` (learner "this is wrong" queue; open disputes BLOCK sharing), `vsr_learner_state` (proof the learner has SEEN their record — share precondition). RLS: learners SELECT own rows only (profiles.learner_id chain); admins additionally read disputes; ALL writes flow through SECDEF fns (no direct INSERT/UPDATE policies).
- 10 NEW fns: `fn_vsr_attendance_core(uuid,uuid)` (fn_my_running_attendance's computation extracted VERBATIM + parameterized; `fn_my_running_attendance` is now a thin self-scope wrapper — figures provably identical), `fn_vsr_health_core(uuid)` (college data health; unhealthy sections HIDE, never render blank), `fn_vsr_record_core(uuid)` (assembles the record JSONB: attendance + engagement counts + self-claims label; feedback CONTENT permanently excluded per #2049/#2051), `fn_vsr_my_record()` (self-scoped; stamps vsr_learner_state), `fn_vsr_my_share_panel()`, `fn_vsr_create_share_token(text)` (enforces: college dial ON + record viewed + zero open disputes), `fn_vsr_revoke_share_token(uuid)`, `fn_vsr_open_dispute(text,text)`, `fn_vsr_resolve_dispute(uuid,text,text)` (admin-gated inside), `fn_vsr_shared_record(text)` — ⚠️ the ONE deliberate anon-granted fn (documented header): token-scoped only, re-checks the college dial at view time, strips health/disputes; revocation or dial-off kills links instantly. Core fns carry NO grants (definer-chain only).
- 6 `platform_policies` rows: `vsr.sharing_enabled` (global FALSE — outward sharing OFF everywhere at launch; flip per college with an institution-scoped override), `vsr.share_token_expiry_days` (90), `vsr.health.window_days` (45), `vsr.health.min_active_days` (8), `vsr.integrity.prompt_window_days` (1), `vsr.integrity.min_prompt_checkins` (10 — engagement stamp is EARNED by prompt check-ins; naive burst-detection would have failed 76% of learners on rollout catch-up, prompt-earning passes 83.6%, calibrated on prod 2026-07-15).
- Permission: `learners.proof.view` granted to the `student` role_key (sidebar gate).
- APPLIED LIVE 2026-07-15 after a 20/20-probe BEGIN…aborted-txn dry-run on prod (BHARATH A render + IDOR + anon + revoke + dial-off + dispute-block + grants matrix). Spec: `specs/verified-learner-transcript-spec-2026-07-14.md`.
- Location: `supabase/migrations/20260715070000_verified_skills_record.sql`.

### 2026-07-16 — External AI door (₹0 Max lane for outside apps)
- 2 columns: `ai_jobs.app_id` (text, null = internal job, partial index) + `ai_job_types.external_allowed` (boolean NOT NULL DEFAULT false — the external "set menu" flag; only 3 bug.* recipes carry it).
- 2 fns: `fn_ai_enqueue_external(text,jsonb,text,text)` (SECDEF; only enabled+external_allowed recipes; wraps fn_ai_enqueue_system then stamps app_id + priority 500 in the same txn — MyJKKN's 100s always claim first; passes dedupe/in_flight through) + `fn_ai_external_result(uuid,text)` (SECDEF STABLE; returns NULL unless job_id AND app_id match — cross-app reads indistinguishable from nonexistent). Both: REVOKE anon+PUBLIC, GRANT service_role ONLY (server-side b2a route is the sole caller).
- 3 `ai_job_types` recipes seeded: `bug.summarize`, `bug.suggest_fix`, `bug.categorize` (lane max, max_inflight 2, ON CONFLICT DO UPDATE so this seed wins).
- 1 pg_cron job: `ai-external-jobs-retention` (daily 03:38) purges external rows (app_id IS NOT NULL) older than 90 days — Director-confirmed retention policy 2026-07-16.
- Columns+fns+recipes APPLIED LIVE 2026-07-16 after 7-assertion BEGIN…ROLLBACK validation on prod (unknown-task refusal, internal-task-leak refusal, null-app_id refusal, priority-500 stamp, cross-app result isolation, anon lockout, dedupe). Consumer: `app/api/b2a/ai/run` (module `ai`).
- Location: `supabase/migrations/20260716064500_ai_external_door.sql`.

### 2026-07-17 — Bug reports duplicate machinery (PR 1 of bug-triage epic)
- 1 column: `bug_reports.duplicate_of` (uuid self-FK → bug_reports.id, ON DELETE SET NULL; partial index `idx_bug_reports_duplicate_of`). Non-null iff the report is parked under a canonical bug.
- 1 CHECK widened: `bug_reports_status_check` now also allows `'duplicate'` (was new/seen/in_progress/resolved/wont_fix). ⚠️ TS-union sweep done in the same PR: types/bugs.ts BugReportStatus + all 3 statusConfig Records + zod enums + filter/export selects (per feedback_db_check_widening_needs_ts_union_sweep).
- View `bug_reports_with_details` recreated (columns APPENDED only): + `duplicate_of`, + `duplicate_of_display_id` (canonical's BUG-ID), + `duplicate_count` (reports pointing at this row).
- Behavior (API layer, no new fns): resolving/wont_fixing a canonical cascades to every report parked under it as `status='duplicate'` (resolved cascade emails each duplicate's reporter via the existing Resend service + bug_report_email_logs); reporter reopening a duplicate reopens the CANONICAL; chains flatten on write; a bug that has duplicates pointing at it cannot itself become a duplicate (cycle-proof).
- APPLIED LIVE 2026-07-17 after 4-assertion BEGIN…ROLLBACK validation on prod (view canonical-id + count, cascade shape, FK). Location: `supabase/migrations/20260717061500_bug_reports_duplicate_machinery.sql`.

### 2026-07-17 — Internal bug.triage AI job type (PR 2 of bug-triage epic)
- 1 `ai_job_types` row seeded: `bug.triage` — strict-JSON developer briefing (summary/severity/category verdict/root cause/fix steps) for one native `bug_reports` row. `tool_set='none'` (text-only; report content fenced as untrusted data), `lane='max'`, `interactive=true`, `allow_rule='seat_owner'` (generic enqueue path locked), `external_allowed=false` (not exposed through the AI Door). ON CONFLICT DO UPDATE (seed wins per feedback_on_conflict_do_nothing_first_wins_collision).
- No DDL. Enqueued ONLY via `fn_ai_enqueue_system` (service_role) from the admin-gated route `app/api/bug-reports/[id]/ai-triage`; dedupe key `bug-triage:<bug_id>`; the route copies the parsed result into `bug_reports.metadata.ai_triage`.
- APPLIED LIVE 2026-07-17 after rolled-back validation (row shape + fenced prompt + 7 input_schema keys asserted). Location: `supabase/migrations/20260717100000_seed_bug_triage_internal_job_type.sql`.

### 2026-07-17 — Bug duplicate-cluster scan + loop registration (PR 3 of bug-triage epic)
- 1 NEW table: `bug_clusters` (RLS-enabled, NO policies — SECDEF fns + service role only; identity = seed_bug_id = oldest member, UNIQUE; status proposed|confirmed|dismissed; human decisions preserved on rescan).
- 2 NEW fns: `fn_bug_cluster_scan()` (SECDEF; deterministic pg_trgm clustering of the open backlog — similarity >= 0.55 AND pair created_at within 14 days AND component size 2..40; label-propagation components; full recompute of PROPOSED rows only; gate = service-role OR super admin; `search_path = public, extensions` because similarity() lives in the extensions schema; anon/authenticated REVOKED, service_role only) + `fn_bug_cluster_list(text)` (SECDEF STABLE; Groups-tab read with member expansion; gate = service OR is_super_admin OR is_admin; anon REVOKED, authenticated+service granted).
- 1 `loop_registry` row: `bug-triage` (tier 4, loop_class intake, gates {g:on,a:on,m:off,f:off} — m/f honestly OFF until a measure ships; routine_id 'bug-cluster-scan'). Manifest: `.claude/loop-manifests/bug-triage.yaml`.
- Tuning receipt: unwindowed 0.5-threshold validation produced a 140-member 5-module mega-cluster (transitive chaining); the 14-day window + 0.55 + size cap reduced it to coherent single-incident groups (top: 32x "practical not able to enter", 27x "unable to mark attendance").
- APPLIED LIVE 2026-07-17 after rolled-back validation runs on the real backlog; first committed scan proposed 66 groups from 1,036 open bugs. Location: `supabase/migrations/20260717150000_bug_clusters_scan_loop.sql`. Consumer cron: `/api/cron/bug-cluster-scan` (vercel.json 21:19 UTC nightly).

### 2026-07-18 — Work-signals spine Phase 1.1 (deep-links) + Phase 2 (marking reconciliation)
- 2 NEW columns on `work_signal_types`: `action_route TEXT`, `action_label TEXT` (nullable). Seed the 8 registry rows so a ZERO signal in `<WorkSignalsCard>` renders as a "start here" deep-link. Routes: sessions_marked/lessons_linked → `/academic/attendance/mark`; the other 6 → `/academic/session-feedback/faculty`. Location: `supabase/migrations/work_signal_types_action_route_deeplinks.sql`.
- `fn_work_signals_for(date,date)` REPLACED (Phase 1.1): emits `action_route`/`action_label` in each signal's jsonb (no second fetch). Same migration. anon REVOKED re-asserted.
- `fn_faculty_metrics()` + `fn_compute_tes_for_user(uuid)` REPLACED (Phase 2): `marking_compliance` now credits ASSIGNED-and-marked days (a day where a session assigned to this senior learner was marked by ANYONE), not only personal `marker_id` days — so delegating senior learners aren't scored 0%. Reads `assigned_faculty` off the marked attendance row (NO timetable slot lookup → the period_id/id shape trap does not apply). Returns `marking_detail{assigned_days,personal_days,target_days}` for the "track both" tile. `fn_faculty_metrics` mirrored into `supabase/setup/02_functions.sql` (it lives there); the other two are migration-native. Location: `supabase/migrations/faculty_metrics_marking_assigned_reconciliation.sql`.
- RANKING: `marking_compliance` feeds `fn_compute_tes_for_user` → `doctrines_percentile_cache`. Re-ran `fn_precompute_percentile_cache` after apply (281 senior learners in the cluster). Population proof (trailing 30d): moved_up=55, unchanged=201, moved_down=25 (3 proxy-markers to 0), both_zero=153; avg marking 20.4→25.5 (rises, no mass collapse). Quartile spread stable (~54/20/25). Delegation archetype hodpharmacypractice: score 0→91, cluster pct → 98th/top_quartile.
- APPLIED LIVE 2026-07-18 after rolled-back-txn validation on prod (before/after proven on 3 archetypes). anon lockdown verified (`has_function_privilege('anon',...)=false`).

### 2026-07-18 — Verify group: surface metadata.verify in fn_bug_cluster_list (self-improving loop increment #1)
- `fn_bug_cluster_list(text)` REPLACED: adds one field — `'verify', bc.metadata -> 'verify'` — so the Groups tab renders the Verify-group re-check tally (fan-out of the live `bug.reverify` recipe across a cluster's members, each re-checked AS ITS REPORTER) from the existing list fetch, exactly how `fixability` is surfaced. Body otherwise verbatim from the live def (pg_get_functiondef checked 2026-07-18 — no drift). anon REVOKE re-asserted.
- No new tables/RPCs: the verify routes (`/api/bug-reports/clusters/[id]/verify` POST fan-out + GET aggregator) persist `bug_clusters.metadata.verify` and each member's `bug_reports.metadata.ai_reverify` via the service-role client after the module admin gate — the same persistence path as the per-bug re-verify.
- MOAT HONESTY: the tally is the AI re-checking its own fix (weak signal, labeled "not reporter-confirmed"); it earns no loop gate. Spec: `docs/features/2026-07-18-FEATURE-cluster-selfimproving-loop.md`.
- APPLIED LIVE 2026-07-18 after BEGIN…ROLLBACK validation on prod (verify key present in rolled-back probe, absent live before apply, present after; `has_function_privilege('anon',...)=false`). Location: `supabase/migrations/20260718160000_bug_cluster_verify_group.sql`.

### 2026-07-18 — Reporter feedback: bug_fix_feedback_requests (self-improving loop increment #2, THE KEYSTONE)
- 1 NEW table `bug_fix_feedback_requests` (RLS: reporter reads ONLY own non-pending rows — un-approved prompts are invisible; admin read; all writes via SECDEF RPCs; UNIQUE(cluster_id, reporter_user_id) = one question per reporter per fixed group; expires 14d).
- 4 NEW fns: `fn_bug_feedback_prepare(uuid,text,text)` (service-only; eligible = linked reporter AND not in a different-cause subgroup [E3]; requires a one-fix fixability verdict; idempotent) · `fn_bug_feedback_approve_send(uuid)` (service-only; called ONLY after a human clicks Send — human gate #3; enforces the global 3-open-prompts cap per reporter [E4]) · `fn_bug_feedback_ack_delivery(uuid)` (authenticated; at-least-once render ACK — never marks answered) · `fn_bug_feedback_answer(uuid,text)` (authenticated; the reporter's 👍/👎 GROUND TRUTH — written only by the reporter; re-answer allowed in-window).
- MOAT: the answer field is the measurement that will later earn loop gate m for `bug-triage` — the gate flip is NOT in this migration (only real collected answers justify it). Silence/expiry = no data (E2).
- APPLIED LIVE 2026-07-18 after a full-lifecycle BEGIN…ROLLBACK probe on prod (prepare 2 → send 2/cap 0 → impersonated reporter ack → answer not_fixed → cross-user answer DENIED → row stamps correct; grants: anon locked all 4, prepare/send service-only). Location: `supabase/migrations/20260718180000_bug_fix_feedback_requests.sql`. Spec: `docs/features/2026-07-18-FEATURE-cluster-selfimproving-loop.md`.

### 2026-07-18 — Learn: bug_fix_outcomes ledger + measured-outcome retrieval (self-improving loop increment #3)
- 1 NEW table `bug_fix_outcomes` (one row per fixed cluster: root_cause_category [= first 3 path segments of the fix's primary file — the retrieval key], root_cause, files_touched, fix_pattern, fix_pr, verify_verdict [#1 tally, WEAK signal — context only, never a retrieval key], reporter_confirmed positive|negative|none from #2's 👍/👎 ONLY, pos/neg counts; UNIQUE(cluster_id); RLS admin-read, service writes).
- 2 NEW fns: `fn_bug_fix_outcome_record(uuid)` (idempotent snapshot/refresh; called from the resolve path + from every reporter answer so late 👎s [E1] keep the ledger current; requires a fixability verdict) · `fn_bug_fix_outcomes_match(text,int)` (retrieval feed-forward for the Mac fix runner: returns ONLY measured outcomes — reporter_confirmed <> 'none' — for a category; 'none' rows are invisible = the loop never learns from unmeasured fixes [E2/moat rule]).
- 1 REPLACED fn: `fn_bug_feedback_answer(uuid,text)` — now refreshes the outcome row after each answer (failure never breaks the answer write); anon lock re-asserted.
- MOAT: loop gate f for `bug-triage` NOT flipped — only real reporter-measured outcomes + a passing 2-cycle falsification test justify it (later migration).
- APPLIED LIVE 2026-07-18 after BEGIN…ROLLBACK probe on prod proving the moat rule end-to-end: record with 0 answers → 'none' → match returns [] (unmeasured invisible) → simulated 👎 → 'negative' → match returns the measured row; grants anon+authenticated locked on record/match. Location: `supabase/migrations/20260718190000_bug_fix_outcomes.sql`.

### 2026-07-18 — SCF: block-course pending consolidation (loop-walk fix, cluster 904b8d2f)
- `fn_scf_pending_for_learner(integer)` REPLACED: feedback for ANY period of the same (course_id, attendance_date) now satisfies its sibling periods — block-scheduled courses (e.g. PROJECT WORK, 2-4 periods/day) no longer re-show "pending" after the learner submits once (live data showed reporters grinding 4 identical submissions/day). Single-period courses unchanged; NULL-course periods keep exact-period matching. anon REVOKE re-asserted.
- Origin: the self-improving loop — fixability verdict on cluster 904b8d2f traced the cause; the write runner correctly REFUSED (DB-fn = human-written migration). Fixes BUG-004641/BUG-004647.
- Validated 2026-07-18 in a rolled-back prod experiment as the real reporter (partial-submission simulated: old fn 3 pending → new fn 0; control surfaces 0→0 unchanged; grants preserved). APPLY AFTER PR MERGE. Location: `supabase/migrations/20260718200000_scf_pending_block_course_consolidation.sql`.

### 2026-07-18 — Bug loop: reporter-feedback eligibility learns the human path (walk-2 lesson)
- `fn_bug_feedback_prepare(uuid,text,text)` REPLACED: eligibility now matches spec E3 — prepare is allowed for a one-fix verdict (unchanged) OR a one-cause verdict (≤1 subgroup) with a recorded human-path fix PR (`metadata.fixability.fix.status='pr_opened'`). Previously `single_fix_feasible=false` (which only means "not machine-writable") blocked the reporters' ground-truth question entirely. Multi-cause verdicts stay refused; E3 off-cause exclusion unchanged; anon+authenticated REVOKE re-asserted (service_role only).
- Origin: walk-2 (cluster 904b8d2f) — the human-written DB fix (PR #2169) went live, but its 2 reporters could not be asked "is this fixed for you?". Location: `supabase/migrations/20260718211000_bug_feedback_humanpath_eligibility.sql`.

### 2026-07-18 — Loop Control Tower: bug-triage gate flip m+f, class intake→self_improving
- `loop_registry` row 'bug-triage' UPDATED: gates m:on (earned — real reporter 👍 on BUG-003881 auto-recorded as reporter_confirmed='positive' in bug_fix_outcomes) + f:on (earned — fix-runner retrieval provably injects the measured outcome; rolled-back falsification: row hidden → empty, other category → empty); loop_class intake→self_improving; description updated to name the measure/feed-forward mechanics + permanent human gates.
- Evidence + gate map in `docs/features/2026-07-18-FEATURE-cluster-selfimproving-loop.md`. Hand-written flip by design (nothing auto-registers in the tower). Location: `supabase/migrations/20260718220000_loop_bug_triage_gate_flip.sql`.

### 2026-07-19 — Bug cluster scan: two-tier matching (tier-2 recruits, never chains)
- `fn_bug_cluster_scan()` REPLACED: tier-1 (0.55 trigram, unchanged) still forms groups via label propagation; NEW tier-2 (≥0.45 AND same sub_module_name) ATTACHES still-ungrouped reports to existing tier-1 groups — one hop, best similarity wins, no transitivity, fills strongest-first and stops at the 40-member cap. Confirmed/dismissed decisions untouched; anon+authenticated revoke re-asserted (service_role only).
- Why not a lower edge threshold: simulated on the live pool — plain two-tier EDGES at 0.45/0.40 chain generic phrasing into 66-/155-member blobs the 40-cap discards; bugs grouped NET DROPS 263→233/195. Attach-only: 64 groups unchanged, bugs grouped 263→299 (+36), zero over-cap. Validated in a rolled-back prod run (tier2_attached=36; BUG-004955 joins BUG-004223's attendance group). Location: `supabase/migrations/20260719003000_bug_cluster_scan_two_tier.sql`.

### 2026-07-19 — Bug cluster scan: error-fingerprint signal (captured console errors form groups)
- `fn_bug_cluster_scan()` REPLACED: normalized error-type console-log entries become fingerprints; concentrated fingerprints (<3 sub-modules pool-wide) pairing same-sub-module reports inside the 14-day window join the TIER-1 edge set — identical captured errors group duplicates text similarity cannot see. Simulation-decided (spec D3): 163 concentrated fps → 14 pairs → 7 new groups, zero over-cap. Tier-2 attach + all rails unchanged; anon+authenticated revoke re-asserted.
- Spec: `docs/features/2026-07-19-FEATURE-cluster-evidence-signals.md`. Validated in a rolled-back prod run (proposed 64→71; attendance "save result null" trio + enquiry "isadmitted" pair grouped). Location: `supabase/migrations/20260719020000_bug_cluster_scan_error_fingerprints.sql`.

### 2026-07-19 — Bug clusters: SPLIT a multi-cause group into per-cause groups
- NEW `fn_bug_cluster_split(uuid,uuid)` (service_role only, anon+authenticated revoked): re-sorts a group by its fixability verdict's subgroups — the new sub-groups born CONFIRMED (S2), members re-filed under each cause's oldest report (S1, Confirm semantics: parked status, seed reactivated), unsorted members → needs-another-look child (S3), single-report causes un-parked (S5); parent dismissed with split_into audit, or REPURPOSED in place when a cause's seed IS the old canonical (seed_bug_id UNIQUE — collision found by rolled-back validation; audit as split_siblings). Refused when reporter-feedback rows exist or already split (S6). A split is final — parked members leave the nightly scan pool (S4).
- Director-interviewed decisions S1-S6 + seed-collision rule in `docs/features/2026-07-19-FEATURE-cluster-evidence-signals.md`. Validated rolled-back on the live 22-member multi-cause cluster (3 sub-groups 14+2+6, re-filing verified, idempotent second call refused). Location: `supabase/migrations/20260719040000_bug_cluster_split.sql`.

### 2026-07-19 — Bug loop: AUTO-RESOLVE policy (built DORMANT; activation is earned)
- 3 NEW `platform_policies` rows (`bug_reports.auto_resolve.enabled`=false / `required_clean_track`=10 / `suspended`={}) + NEW SECDEF fns `fn_bug_auto_resolve_status()` (gate state: enabled, earned clean count from bug_fix_outcomes, breaker state), `fn_bug_auto_resolve_scan()` (eligible groups ONLY when armed: enabled AND clean≥required AND not suspended; R1 trigger = thread fully settled + zero still-broken + ≥1 fixed; unsent questions block), `fn_bug_auto_resolve_mark(uuid)` (stamps metadata.auto_resolved) — all service_role-only, anon+authenticated revoked.
- `fn_bug_feedback_answer(uuid,text)` REPLACED: adds the R3 circuit breaker — a still-broken answer on an AUTO-resolved group flips enabled→false + records suspension (never fails the answer write); authenticated grant re-asserted (reporters call it).
- Director-interviewed R1-R4 in `docs/features/2026-07-19-FEATURE-cluster-evidence-signals.md`. Validated rolled-back on prod: dormant (armed=false at 2/10), armed-in-txn scan eligible=[] (both walk groups already resolved), negative control (still-broken on a HUMAN-resolved group does NOT trip), breaker trips exactly on the marked group with reason+cluster payload. The resolve ACTION lives app-side in the nightly cron via the extracted `lib/bug-reports/resolve-cascade` (same email/cascade/ledger path as a human resolve). Location: `supabase/migrations/20260719050000_bug_auto_resolve_policy.sql`.
### 2026-07-19: SCF free-text carry-forward — "you mentioned X — better this week?"
- 1 NEW table `scf_freetext_carry` (one row per AI-extracted item from a learner's feedback free text: kind concern|praise|none — 'none' = processed-marker; answer Yes/Partly/No/Seen + answered_at when the learner responds). RLS deny-all direct (scf_learner_notes model); REVOKE anon+authenticated.
- 4 NEW fns: `fn_scf_freetext_carry_candidates` (service_role-only worklist: substantive junk-filtered unprocessed texts, 7-day window), `fn_scf_record_freetext_carry` (service_role-only recorder: strips [ ], caps 120 chars + config max items; empty→marker), `fn_scf_answer_freetext_carry` (learner self-scoped answer), `fn_scf_freetext_carry_counts` (Senior Learner counts-only, faculty_email-scoped, >=`scf.freetext_carry.count_floor` distinct learners).
- CHANGED fn: `fn_scf_carryforward_for_learner` — original #1624 body VERBATIM (verified against live prod def) + 2 new jsonb columns (`prior_concerns` [{id,summary,source_date}] <=3 open, `prior_praise` {id,summary}|null) + INNER→LEFT join so a concerns-only row surfaces even when the checklist flag never fired (Director decision 8); `prior_session_date`/`prior_understood` now nullable on such rows.
- 1 ai_job_types row `scf.freetext_carry` (interactive=false, lane max, ₹0) + 3 `platform_policies` rows: `scf.freetext_carry.enabled` (true — kill switch), `.count_floor` (3), `.max_concerns_per_text` (3).
- Consumed by `/api/cron/scf-freetext-carry` (nightly 22:07 UTC: collect prior results → fn_scf_record_freetext_carry; enqueue tonight's candidates) and the learner feedback dialog / Senior Learner counts card.
- APPLIED LIVE 2026-07-19 after an aborted-txn dry-run on prod (grants matrix, sanitization, re-record idempotency, deny-all direct reads, IDOR, >=3 floor both sides, kill switch). Spec: `specs/scf-freetext-carryforward-2026-07-19.md` (8 Director decisions).
- Location: `supabase/migrations/20260719090000_scf_freetext_carryforward.sql`.

### 2026-07-21: PDE clinical images bucket (PMS image bridge Phase 4)
- 1 NEW storage bucket `pde-clinical-images` (public read, `image/jpeg` only, 10 MB cap): DE-IDENTIFIED clinical teaching images copied from the PMS casesheet bridge at import time. Metadata scrubbed at source (sharp re-encode + fail-closed JPEG marker assertion on the PMS box); builder enforces per-image Senior Learner confirmation for burned-in identifiers before attach (default-deny). Service-role writes only (`/api/pde/cases/import-from-pms`); paths `{casesheet_id}/{image_id}.jpg`. Design: `specs/pde-image-bridge-design-2026-07-21.md`.
- Location: `supabase/migrations/20260721140000_create_pde_clinical_images_bucket.sql`.

### 2026-07-21: PDE clinical image review audit trail
- 1 NEW table `pde_clinical_image_reviews` (audit trail for the burned-in-identifier confirmation gate on clinical teaching images): `storage_path` (stable object identity), `image_url`, `decision` CHECK confirmed_clean|withdrawn, `source` CHECK pms_import|upload|unknown, `reviewed_by` → auth.users ON DELETE RESTRICT, `reviewed_at`, `institution_id` NOT NULL → institutions, `created_at` + 3 indexes.
- **Why:** metadata stripping is mechanical and provable; the pixel check is one person's judgement and was previously unrecorded — if a patient detail ever reached a learner there was no way to trace who approved it. Withdrawals are recorded too, so a reversal leaves a trail rather than erasing one.
- RLS canonical dynamic-permission: SELECT → `is_super_admin() OR is_admin()` OR (`user_has_permission('pde.faculty.view')` AND `role_has_institution_access(institution_id)`); INSERT → same + `reviewed_by = auth.uid()` forced so a row can never be attributed to another user. **NO UPDATE/DELETE policy by design** — an editable audit trail is not an audit trail (mirrors `cohort_status_events`).
- Written by `POST /api/pde/cases/image-review`; read path is the audit itself. Companion code (no migration): `lib/services/pde/require-case-author.ts` gates the image write routes on `pde.faculty.view` (Senior Learners only — an authenticated learner could previously upload into the shared clinical-image store), and `app/api/cron/pde-image-orphans` reference-sweeps the `pde-clinical-images` bucket (cases are archived, never hard-deleted, so orphan removal is reference-based with a 48h grace window; supports `?dry_run=1`).
- Director decisions 2026-07-21: "only teaching staff" · "delete the images too" · "record who and when". Location: `supabase/migrations/20260721220000_pde_clinical_image_reviews.sql` — **NOT yet applied to prod**.

### 2026-07-21: PDE cross-tenant RLS fix (SECURITY)
- **The defect:** three PDE tables carried `USING (true)` SELECT policies *named* for admin access — `pde_sub_admin_read` (pde_submissions), `pde_events_admin_read` (pde_engagement_events), `pde_daily_admin_read` (pde_engagement_daily). RLS policies are OR'd, so each silently defeated the correct own-row policy beside it: **any authenticated user could read every learner's work in every institution.** `pde_engagement_daily` additionally carried `pde_daily_write [ALL] USING(true) WITH CHECK(true)` — any authenticated user could insert/alter/**delete** the engagement rows that feed at-risk detection (a learner could delete the evidence they were struggling). A codebase sweep found NO application writer for that table (every reference is `.select`), so nothing legitimate depended on it.
- **Exposure at fix time: 0 rows** in all three tables (PDE has no real learner participation) — a landmine, not a breach, and the cheapest possible moment to fix.
- **Tenant scoping with NO schema change:** none of these tables has `institution_id` (PDE predates the convention), but a join path already exists — `pde_submissions.assessment_id → pde_assessments.course_id → vac_courses.institution_id`, and both engagement tables carry `course_id` directly. Policies use `EXISTS` against that path, avoiding a denormalised column + backfill that could drift.
- 4 permissive policies dropped; 5 created (`pde_sub_staff_read`, `pde_events_own_read`, `pde_events_staff_read`, `pde_daily_staff_read`, `pde_daily_admin_write`). Learner self-access preserved throughout (`pde_sub_own_read`, `pde_daily_own_read` untouched; `pde_events_own_read` newly ADDED because that table's only read path had been the permissive policy).
- **Validated on prod in a rolled-back transaction:** permissive policies 4 → 0, 5 new policies present, 2 learner self-read policies intact; prod re-confirmed unchanged after ROLLBACK.
- Director decision 2026-07-21: "fix roles AND separate colleges". Location: `supabase/migrations/20260721230000_pde_rls_cross_tenant_fix.sql` — **NOT yet applied to prod.**

### 2026-07-21: Bridge sh_notifications into the main notification pipeline
- **Two defects, one root cause (schema drift).** (1) `lib/services/solutions/notifications-service.ts` inserted `type` / `link` / `read` — **none of which exist** on live `sh_notifications` (real columns: `notification_type` NOT NULL, `action_url`, `is_read`) and never supplied the NOT NULL `notification_type`, so **every Solutions Hub notification write threw**. Same drift class as #2172 (work-pulse + learn notify) and #2168. (2) Even when fixed, `sh_notifications` is read only by `/api/solutions/notifications` — no bell, no push, no WhatsApp — so its four real events (payment received, deliverable approved/revision, assignment approved, MoU expiring) reached nobody.
- **Exposure at fix time: 0 rows** in `sh_notifications` — because writing to it was structurally impossible, not because nothing fired. Cheapest possible moment to fix: before Solutions Hub adoption puts real payments and deliverables through it.
- **Why a DB trigger, not app code:** the Solutions Hub service layer extends `BaseService`, which uses the **browser (RLS-bound)** Supabase client. Live `notifications` INSERT is gated to `is_super_admin() OR is_admin()`, and `user_notifications` INSERT is super-admin only — an app-side insert would be **silently denied for exactly the team members who trigger these events**, recreating the #2172 silent-no-op class. `SECURITY DEFINER` bypasses that, and a trigger catches every current *and future* writer of `sh_notifications` for free.
- Payload shape follows the #2172 canonical helper: `body` (not `message`), `url`, `created_by` = anchor recipient, `targeting.user_ids`, `category='solutions'`, `kind='work_item'` (keeps these off the `/notifications/admin` announcement surface). Bridge is wrapped in `EXCEPTION WHEN OTHERS` so a main-pipeline failure **can never break the source write**.
- **Validated on prod in a rolled-back transaction:** one `sh_notifications` insert produced `main_rows=1`, `link_rows=1`, `body='Payment of 50,000 received…'`, `kind=work_item`, `category=solutions`, `url=/solutions/abc123`; prod re-confirmed clean after ROLLBACK (0 leftover rows, trigger/function absent).
- Location: `supabase/migrations/20260722090000_bridge_sh_notifications_to_main_pipeline.sql` — **NOT yet applied to prod.**
### 2026-07-21: PDE assessment write + browse RLS (SECURITY, APPLIED)
- **Missed by the earlier sweep** (`20260721230000`) because that pass only examined SELECT policies; these are `FOR ALL`, covering reads AND writes: `pde_assess_write` (pde_assessments), `pde_questions_write` (pde_assessment_questions) both `USING(true) WITH CHECK(true)`, and `pde_certs_write` (pde_certificates) `INSERT WITH CHECK(true)`.
- **Unlike the earlier fix these tables HOLD DATA** — 4 published clinical cases, 29 questions (28 carrying `metadata.ground_truth`). Any authenticated user, including a learner, could DELETE a published case, rewrite its questions, or mint themselves a certificate.
- **Pre-flight that changed the design:** case authoring writes via the AUTHENTICATED client (`app/api/pde/cases/route.ts` uses `createClient()`, not service-role), so an admin-only write policy would have BROKEN authoring. Writes therefore grant `created_by = auth.uid()` alongside admins.
- New: `pde_assess_read` (Senior Learners scoped by institution OR learner enrolled via `vac_enrollments` in a **published** case), `pde_assess_write` (creator+admin), `pde_questions_read` (mirrors parent assessment visibility), `pde_questions_write` (parent case's creator+admin), `pde_certs_admin_write`.
- **Validated on prod by IMPERSONATION in a rolled-back txn:** enrolled learner reads 4 cases ✅ / learner UPDATE 0 rows 🔒 / learner DELETE 0 rows 🔒 / **case creator UPDATE 1 row ✅ (authoring preserved)**. Prod confirmed still-permissive before apply; **APPLIED 2026-07-21**; post-apply sweep shows the only remaining `USING(true)` on `pde_*` are SELECT on intentionally-public tables (badges, capabilities, certificates-verification, learner_badges, messages-forum, reputation).
- Enrolment scoping verified safe: all 4 cases sit on BDS-CR-101 which has 544 enrolments, so no learner lost access.
- **KNOWN REMAINING GAP:** `metadata.ground_truth` still lives on the question row and RLS is row-level, not column-level, so an *enrolled* learner querying the table directly can still read the model answer. Companion code strips `ground_truth`+`correct_answer` from the learner attempt-page payload (the realistic path). `options[].is_correct` must stay in the payload because MCQ marking runs client-side. Fully closing needs ground_truth moved to a staff-only table and MCQ marking moved server-side — 12 files, deliberately deferred.
- Director decisions 2026-07-21: "only the person who made it (+ admins)" · "only cases on their own courses". Location: `supabase/migrations/20260721234500_pde_assessment_write_rls.sql`.
### 2026-07-22: PDE at-risk — stop a failing score being masked by inactivity (APPLIED)
- `CREATE OR REPLACE VIEW pde_at_risk_learners` appending two columns: `is_low_scoring` (`COALESCE(avg(assessment_avg_score) < 50, false)`) and `has_assessment_scores` (`count(assessment_avg_score) > 0`). `risk_level` and all 10 original columns are **unchanged** — the cron, history rollup and admin page all read them, and redefining the band mid-flight would change flag-history semantics.
- **The defect:** `risk_level` is a single-branch CASE where inactivity outranks score, so a learner absent 5 days AND averaging 20% was labelled `warning` — indistinguishable from an absent learner averaging 90%. The "Struggling / Avg score below 50%" count therefore undercounted, and triage sorted by absence rather than by who was failing.
- **Premise correction:** the change was requested on the belief that an ACTIVE learner scoring 20% is never flagged. Verified empirically against the live CASE — that learner already evaluates to `struggling`. The real defect is the masking above. Recorded so the reasoning is not lost.
- `has_assessment_scores` exists because `NULL < 50` is NULL, so a learner with no completed assessments falls to `on_track` — arguably right, but previously indistinguishable from a genuinely healthy learner.
- Companion UI: the struggling count now filters on `is_low_scoring` (matching the card's existing "Avg score below 50%" label, which the old count did not honour); a "Low score" badge renders beside the band only when the band would otherwise hide it; the score column shows "no scores yet" instead of "-" when there is no evidence.
- Dry-run in rolled-back txn (12 columns, 2 new, 5 originals intact) then **APPLIED 2026-07-21**; post-apply matrix verified: absent+failing → band=warning, is_low_scoring=true; absent+passing → band=warning, is_low_scoring=false.
- Location: `supabase/migrations/20260722000500_pde_at_risk_unmask_low_score.sql`.

### 2026-07-24: ID cards — template design assets bucket (Canva-background workflow)
- New public storage bucket `id-card-assets` (6 MB cap; PNG/JPEG/WebP only) holding card artwork designed externally (Canva) and referenced by `id_card_templates.front_layout_json.background_image`; the render engine composites learner data on top.
- Public-read is DELIBERATE: backgrounds are brand artwork with no learner data; public URLs let the render engine and admin previews fetch without signing. Writes gated on `id_cards.templates.edit` (or admin) via three `storage.objects` policies (insert/update/delete) + an explicit authenticated SELECT policy documenting read intent.
- Idempotent (`ON CONFLICT DO NOTHING` + pg_policies existence guards); additive only; no functions. Applied by orchestrator with BEGIN…ROLLBACK rehearsal.
- Location: `supabase/migrations/20260724124500_id_card_assets_bucket.sql`.

- `migrations/20260725093000_carre_compliance_work_signals.sql` — 2026-07-25 — 4 CARRE/compliance practice signals (od handled/waiting, correctives open, audits scored) in work_signal_types + fn_work_signals_for; acts-not-scores, Respect excluded; applied via Management API 2026-07-25.
- `migrations/20260725101500_carre_participant_scoring_sealed.sql` — 2026-07-25 — CARRE sealed participant lane: carre_participant_scores (RLS seal super_admin-only) + fn_carre_participant_score (learners, open CARRE cycles) + fn_carre_participant_rollup (leadership, k>=3 floor, aggregates only) + audit_cycles.participant_scoring_open. Applied via Management API 2026-07-25; 10-point rolled-back verification passed.

### CARRE Evidence RPC fix + Sealed-Lane Context (2026-07-25)
- Function REPLACED: `fn_carre_item_evidence` — academic A4 block rebuilt (single attendance scan + jsonb_each once + hash-join vs feedback sessions; was >110s timeout, now <0.5s server-side; adds median session reach). Anon lock re-asserted.
- Function NEW: `fn_carre_participant_context(uuid)` — learner-gated read path for the sealed scoring door (cycle + frozen catalog + caller's own rows only; the seal is untouched)
- Location: `supabase/migrations/20260725110000_fix_carre_evidence_academic_block.sql`, `supabase/migrations/20260725114500_carre_participant_context.sql` — **both APPLIED to prod via Mgmt API 2026-07-25** (rolled-back-validated first; 7-point lane battery passed)

### CARRE Calibration Mirror — predict-then-see (2026-07-25)
- Table: `carre_calibration_predictions` (RLS: SELECT own rows or super_admin; writes RPC-only)
- Functions NEW: `fn_carre_predict_median` (team members; frozen after k≥3 reveal; HARD data-gate: CARRE-A3 at 3+ rejected while caller's own OD approval queue > 0) · `fn_carre_calibration_mirror` (caller's predictions + k≥3 'own'-lane reveals + abs error) · `fn_carre_predict_context` (team-member mirror of the learner context RPC)
- Location: `supabase/migrations/20260725123000_carre_calibration_mirror.sql`, `supabase/migrations/20260725124500_carre_predict_context.sql` — **both APPLIED to prod via Mgmt API 2026-07-25** (rolled-back-validated; 7-point battery incl. live 29-queue A3 gate PASSED)
- `migrations/20260731140000_rcltp_question_gen_max_lane.sql` — 2026-07-25 — RCLTP Part-B question generation onto the ₹0 Max lane: repairs `rcltp.question_generation` (prompt_template `{{prompt}}` + prompt-only input_schema — both were NULL/`[]`, which fail the seat before the model runs) and registers stage 2 `rcltp.question_keycheck` for the INDEPENDENT answer-key pass that feeds ai_agreed_count. Adds config row `rcltp.question_generation.nightly_cap` (NOT EXISTS guard — platform_policies uniqueness is an expression index). Config only; no tables, functions, or policies.

### Weekly Work-Signal Suggestion Loop (2026-07-25)
- Job type: `worksignals.weekly_suggestion` seeded on `ai_job_types` (₹0 Max lane; exact twin of the lesson-spine generate job's config — prompt-only input_schema + `{{prompt}}` template)
- Table: `work_signal_suggestions` (RLS: subject-only SELECT; writes RPC-only; verdicted week never overwritten)
- Functions NEW: `fn_work_signal_suggestion_upsert` (service_role ONLY) · `fn_work_signal_suggestion_verdict` (subject-only; SCF verdict vocabulary)
- Location: `supabase/migrations/20260725140000_work_signal_weekly_suggestion.sql` — **APPLIED to prod via Mgmt API 2026-07-25** (rolled-back-validated; 6-point battery PASSED)

### CARRE Evidence Instrumentation — 4-lane fan-out (2026-07-25, all APPLIED via Mgmt API)
- **Recognition pipe** (`20260725123000_carre_recognition_pipe_wiring.sql`, PR #2371): triggers on `ai_pulse_prompt_builds` (first_prompt/gold_prompt, public) + `scf_note_resolution_votes` (voice_confirmed_better, private) → `campus_living_recognition`; 90d backfill = 6 rows; academic R-item cap-2 LIFTED (evidence line verified live)
- **Event-date requests** (`20260725150000` + `20260725151500`, PR #2369): `event_date_requests` + raise/decide RPCs + CARRE-C5 evidence line in `fn_carre_item_evidence` (replaced; anon lock re-asserted; post-replace timings campus 8ms · LC 12ms · academic 570ms, +1 row each)
- **Clarification asks** (`20260725133000_session_clarification_requests.sql`, PR #2374): ask→outcome trace (learner-only writes, self-reported outcome, leadership read via audit.cycle.view)
- **Sealed participation line** (`20260725153000_carre_participant_activity_line.sql`, PR #2373): `fn_carre_participant_activity` — cycle-level scorers/items/last-activity, k≥3 floor ON THE COUNT ITSELF
- Batteries: 10/10 (A) · 10/10 (B) · 14/14 (C) · 5/5 (D), all rolled-back; reviews: 4× minor, 0 critical

### SCF practicals — subdivided (lab) rosters reach the learner feedback path (2026-07-25)
- Function NEW: `fn_attendance_slot_students(jsonb)` — shared, pure, IMMUTABLE helper returning the effective roster for one attendance slot: top-level `students[]` when non-empty, otherwise the flattened `groups[].students[]` of a subdivided practical/lab slot. Never NULL. SQL twin of `slotStudents()` in `lib/services/academic/attendance-report-service.ts` (PR #1865).
- Functions REPLACED (Present-gate now reads BOTH shapes; anon lock re-asserted on each): `fn_scf_pending_for_learner(integer)` · `fn_scf_submit_feedback(date,uuid,text,smallint,jsonb,text,text)` · `fn_scf_confirmation_status(date,date)`
- Cast guard EXTENDED: `fn_scf_pending_for_learner` and `fn_scf_confirmation_status` cast `student_id` to uuid **unguarded**; reading group rosters widens what those casts see, so the regex-CASE guard from migration `20260722062012` is copied verbatim into both (all three functions now read identically; `fn_scf_submit_feedback`'s own guard is preserved byte-identical). Proven load-bearing, not decorative: with a synthetic malformed id injected in a rolled-back transaction, the unguarded predicate raises `22P02` on a full scan while the guarded twin returns cleanly.
- Why: all 302 subdivided periods in production (2025-11-25 → 2026-07-24) carry an EMPTY top-level `students[]`, so no practical was listed as pending or accepted for submission; theory sessions were unaffected, which masked it as a perception issue.
- Location: `supabase/migrations/20260725183000_scf_practicals_subdivided_roster.sql` — **rolled-back-validated on prod 2026-07-25 (14-point battery PASSED: bug reproduced pre-fix, submit succeeds post-fix, pending 1→2, confirmation 52→65, theory control byte-identical, anon locked on all 4, malformed-id injection survived by all three with an unguarded control proving 22P02). NOT YET APPLIED — awaiting Director approval.**
### Bug duplicate check — meaning-level dedupe for one report (2026-07-25)
- Job type: `bug.duplicate_check` seeded on `ai_job_types` (₹0 Max lane, `opus`, prompt-only `tool_set='none'` — drained by the generic runner like `bug.triage`)
- Function NEW: `fn_bug_duplicate_candidates(uuid,integer,real)` — trigram shortlist with a deliberately LOW 0.15 floor (under `fn_bug_cluster_scan`'s 0.45) so same-defect/different-wording pairs reach the AI judge; **service_role ONLY** (revoked from anon, PUBLIC *and* authenticated — it reads bug text across institutions)
- Advisory only: verdict lands in `bug_reports.metadata.ai_duplicate_check`; never sets `duplicate_of`, never resolves, never notifies
- Location: `supabase/migrations/20260802020000_bug_duplicate_check_job_and_candidates.sql` — **NOT applied to prod** (rolled-back-validated only; 7-point battery A–G PASSED, incl. the BUG-005356 acceptance test)
### Wave 2D — ops evidence emitters: BoS 1.2, CDC 7.6, procurement 3.1.1, audits 4.4.2 (2026-07-26)
- Catalog seeds (WHERE NOT EXISTS): NAAC `1.2` (stakeholder participation in the learning framework — minuted BoS meetings) + NAAC `7.6` (career development & employability). `3.1.1` and `4.4.2` already existed live.
- Honest-fit deviations from the planning brief (live-catalog survey): library POs wired to **3.1.1** ("…library…purchase bills"), NOT 3.2.1 (live 3.2.1 = digital learning-studio coverage); audit cycles wired to **4.4.2 only** (audit report; catalog notes say "Overlaps Process Excellence module"), NOT 4.4.1 (budget utilization — a cycle row carries no budget data).
- Column NEW: `procurement_purchase_orders.is_library_resource boolean NOT NULL DEFAULT false` — set via the PO detail page checkbox (updateDocumentFields patch path).
- Functions NEW (all SECURITY DEFINER, search_path=public, revoked from anon+authenticated+PUBLIC): `fn_sync_bos_meeting_evidence(uuid)` · `fn_sync_cdc_drive_evidence(uuid)` · `fn_sync_cdc_training_evidence(uuid)` · `fn_sync_procurement_po_evidence(uuid)` · `fn_sync_audit_cycle_evidence(uuid)` · trigger shims `emit_bos_meeting_evidence()` / `emit_cdc_drive_evidence()` / `emit_cdc_training_programme_evidence()` / `emit_cdc_training_enrollment_refresh()` / `emit_procurement_po_evidence()` / `emit_audit_cycle_evidence()` · shared `fn_ops_evidence_cleanup_on_delete()` (AFTER DELETE, TG_TABLE_NAME-generic).
- Registry rows (WHERE NOT EXISTS): `bos_meeting` / `cdc_drive` / `cdc_training` / `procurement_po` / `audit_cycle`.
- Qualifying states: BoS `minutes_approved` · drives `attendance_day|results_announced|closed` (anchored institutions[1]) · programmes past `planned`, not `cancelled`, institution set (live data uses 'ongoing'; enrollment counts refresh via cdc_training_enrollments trigger) · POs tagged + `approved|sent|partially_received|completed|closed` · audit cycles `closed` + `'NAAC' = ANY(frameworks)` + institution_ids[1]. All emitters: natural-key upsert, refresh-on-edit, withdraw on regression, AFTER DELETE cleanup, never clobber `is_auto=false`, EXISTS-guard on institution ids so evidence can never abort a source write.
- Backfill: idempotent, same sync fns as the triggers (expected at 2026-07-26: 13 BoS + 1 audit cycle; drives/programmes/POs 0 by state).
- Location: `supabase/migrations/20260726123000_ops_evidence_emitters_wave2d.sql` — **NOT applied to prod** (rolled-back-validated only; DB apply Director-gated). ⚠️ Tail-append race: sibling Wave PRs (#2407 etc.) also append here — union-merge conflicts expected, re-append on rebase.
### HR evidence snapshots — Wave 2A of module→evidence-spine (2026-07-26)
- `supabase/migrations/20260726130000_hr_evidence_snapshots.sql` — NEW tables `sanctioned_posts` (register: institution × AY × cadre, dept optional; explicit SELECT/INSERT/UPDATE/DELETE RLS on `hr.sanctioned_posts.*`) + `hr_naac_evidence` (one snapshot per institution × AY; SELECT for `accreditation.view`, writes RPC-only); function NEW `fn_hr_refresh_naac_evidence()` (**service_role ONLY** — revoked from anon, PUBLIC *and* authenticated) upserts snapshots + `quality_evidence_mappings` rows: NAAC **2.1** faculty-learner ratio (metric seeded WHERE NOT EXISTS), **2.2.1** cadre vs sanctioned (emitted ONLY where register rows exist), **2.2.2** PhD %, **2.2.3** avg experience + cadre levels, **7.10.1** 3-year retention; registry row `hr_snapshot` (WHERE NOT EXISTS); `ai_routine_schedules` seed `hr-naac-evidence` (daily 04:37 IST)
- Senior Learner discriminator = `employment_categories.is_teaching` + `staff.is_active` (`staff.role_type` is 'teacher' for ALL rows — unusable); cadre from free-text `staff.designation` pattern match (legacy 'Reader' = associate level); PhD from `qualifications` jsonb / `qualification_summary` regex
- **NOT applied to prod** (rolled-back-validated only; DB apply is Director-gated). Tail-append note: sibling PRs #2402/#2403/#2404/#2407 also append to this file — union-merge the tails if they conflict.
### MoU / Grants register wired into the evidence spine — C6 (2026-07-26)
- `supabase/migrations/20260726100000_institution_collaborations_evidence_register.sql` — NEW table `institution_collaborations` (kind mou/grant/industry_collaboration, explicit SELECT/INSERT/UPDATE/DELETE RLS on `accreditation.collaborations.*`); trigger fan-outs `emit_institution_collaboration_evidence` (mou/industry → NAAC 7.9, grant → NAAC 9.1) + `emit_ss_grant_evidence` (existing `ss_grants` → NAAC 9.1) + `fn_collab_evidence_cleanup_on_delete`; seeds NAAC metric 7.9 + 2 `quality_evidence_source_registry` rows (WHERE NOT EXISTS). **NOT applied to prod** (rolled-back-validated only; DB apply is Director-gated).
### Learner exit outcomes + awards home → 8.2/8.3 evidence — Wave 2C (2026-07-26)
- SURVEY DECISION: **extend, not create** — `alumni_outcomes` already IS the per-learner exit-outcome capture (outcome_type enum, org/role/year/verification fields, 4 explicit RLS policies); `health_sports_achievements` widened with `category` ('sports' default | academic | cultural | other) + `sport` made nullable (CHECK keeps it required for sports) so external academic awards have a home. `pp_achievements` considered and skipped (parent-portal comms record, no verification). NO new tables.
- Metric seed: NAAC **8.3** 'Learner awards & recognitions' (WHERE NOT EXISTS; catalog verified live — 8.3 absent, 8.2.2 is pass-percentage so exit outcomes deliberately do NOT emit there; all progression kinds → 8.2.1 with kind in metadata)
- Trigger fan-outs (canonical human-entry pattern, same as C6/anti-ragging/grievance): `emit_learner_exit_outcome_evidence` (alumni_outcomes, kinds employed/self_employed/entrepreneur/higher_studies → NAAC 8.2.1, k-anonymous metadata kind+year, withdraw on regression to seeking/unknown/etc.) + `emit_learner_achievement_evidence` (health_sports_achievements verified=true → NAAC 8.3, institution via learners_profiles, withdraw on un-verify) + `fn_learner_outcome_evidence_cleanup` (AFTER DELETE on both). All SECDEF, revoked from anon+authenticated+PUBLIC; upsert on (source_table, source_id, body_code, metric_code); never clobbers is_auto=false. 2 `quality_evidence_source_registry` rows (`learner_exit_outcome`, `learner_achievement`; WHERE NOT EXISTS). DARK cohort emitter `cdc_placement_outcome_cycles` (PR #1904) untouched — different source_table, no collision.
- Location: `supabase/migrations/20260726114500_learner_exit_outcomes_awards_evidence.sql` — **NOT applied to prod** (rolled-back-validated only; DB apply is Director-gated).
### CAC pre-meeting brief — declarative AI job row, C3 of the CAC engine (2026-07-26)
- Job type: `accreditation.cac_brief` seeded on `ai_job_types` via INSERT…WHERE NOT EXISTS (₹0 Max lane, `sonnet` family alias, prompt-only `tool_set='none'`, `output_target='job.result'`, `schedulable=true`, `interactive=false`, `allow_rule='seat_owner'`, no fallback — mirrors `ops.brief`); drafts the pre-sitting brief (loop deltas vs own baseline, below-target, carried resolutions w/ 2+-strike Director flags, evidence landed, cross-college IQAC escalations) + forbidden-agenda-rule agenda + ATR minute skeleton; ships `enabled=false` (DARK — Director flips after CAC constitution). Location: `supabase/migrations/20260726005145_cac_premeeting_brief_job.sql` — **NOT applied to prod** (rolled-back-validated 2026-07-26: count 50→51 inside txn, row asserted enabled=false + interactive=false + provider/model/lane/schema, then ROLLBACK; prod re-checked at 50 rows / 0 cac rows after).
### CAC cluster committee type + affected-colleges tag (2026-07-26)
- `supabase/migrations/20260726005202_cac_cluster_committee_type.sql` — C1: adds `cluster` to the `accreditation_committees.committee_type` CHECK (constraint found dynamically, recreated same-name); C7: `accreditation_committee_resolutions.affected_institution_ids uuid[] NOT NULL DEFAULT {}` — two-spine routing tag (a cluster/CAC resolution names the colleges it touches; their IQAC briefs pick it up). **NOT applied to prod — Director-gated; validated BEGIN..ROLLBACK only.**

### COE Pass-Percentage Mirror — Wave 3 (2026-07-26)
- Catalog: NAAC `8.2.2` ("Pass percentage in university examinations (Affiliated colleges)") verified LIVE + active on prod — migration ASSERTS it (fails loudly if missing), does NOT seed
- Table NEW: `coe_naac_evidence` — one snapshot row per MyJKKN institution × metric × COE examination session, UNIQUE natural key `(institution_id, metric_code, session_code)`; RLS: SELECT mirrors `qem_select` (`accreditation.evidence.view` + institution scope, admin bypass), EXPLICIT per-command admin INSERT/UPDATE/DELETE policies (no silent 0-row UPDATE trap); direct anon table grant REVOKEd
- NO refresh fn (deliberate): the compute is cross-DB — the COE exam project's `final_marks_summary_view` is read by the TypeScript cron `app/api/cron/coe-result-naac-snapshots/route.ts` (COE_SUPABASE_* server-only creds, 503 fail-closed), which aggregates pass % per institution × session, fans CAS out to its 2 MyJKKN institutions via `institutions.myjkkn_institution_ids[]`, and upserts `quality_evidence_mappings` (is_auto=true; is_auto=false rows pre-excluded, never clobbered)
- Deck metric 5.7 (exam↔result day counts) honestly SKIPPED: `final_marks.published_date` NULL on all 29,144 rows; `examination_sessions.result_declaration_date` is a 2026-06-05 backfill artifact (one value implies declaration 552 days post-exam)
- Registry row: `quality_evidence_source_registry` source_kind `coe_result_snapshot`; schedule seed: `ai_routine_schedules` row `coe-result-naac-snapshots` (daily 04:51 IST, minute 291)
- Location: `supabase/migrations/20260726053000_coe_result_naac_snapshots.sql` — **NOT applied to prod** (rolled-back-validated only; DB apply Director-gated)
### Teaching & Facilities NAAC evidence snapshots — Wave 2B (2026-07-26)
- Catalog seed: `NAAC / 3.4.1` ("IT infrastructure — computing devices in active use & learner:computer ratio", Attribute 3: Infrastructure, is_system) — no 3.4.x code existed; seeded WHERE NOT EXISTS following the live 3.1.1/3.2.1/5.1.1 convention
- Table NEW: `facility_teaching_naac_evidence` — one snapshot row per institution × metric × AY (metrics 5.1.1 / 3.1.1 / 3.4.1), UNIQUE natural key `(institution_id, metric_code, ay_label)`; RLS: SELECT mirrors `qem_select` (`accreditation.evidence.view` + institution scope, admin bypass), writes admin-only (refresh is service-role cron)
- Function NEW: `fn_facility_teaching_naac_snapshot_refresh()` — SECDEF **service_role ONLY** (revoked from anon, authenticated, PUBLIC); computes 5.1.1 lesson-plan/pedagogy coverage from `curriculum_lesson` (counts only, no Senior Learner identities), 3.1.1 facilities-in-daily-use from `resources`+reservations+usage logs+campus living-module counts, 3.4.1 IT device counts + learner:computer ratio from the resource registry (`IT & Digital Resources` / `Computers` categories — `ims_item_categories` has NO computing categories, IMS path honestly skipped); fans out to `quality_evidence_mappings` on the junction natural key, never clobbers `is_auto=false`
- Registry row: `quality_evidence_source_registry` source_kind `facility_teaching_snapshot`; schedule seed: `ai_routine_schedules` row `facility-teaching-naac-snapshots` (daily 04:37 IST, minute 277)
- Location: `supabase/migrations/20260726031500_facility_teaching_naac_snapshots.sql` — **NOT applied to prod** (rolled-back-validated only; DB apply Director-gated)
### Events → evidence spine emitter — Wave 1 module integration (2026-07-26)
- Registry: `quality_evidence_source_registry` row `event`/`events` (WHERE NOT EXISTS; no collision with sibling PR #2407's `institution_collaboration`/`ss_grant`)
- Catalog seeds: NAAC `6.2` (cultural clubs & festivals) + `6.6` (community-focused activities) into `sh_accreditation_metrics` (WHERE NOT EXISTS; category matches live 6.x rows)
- Functions NEW (all SECDEF, EXECUTE revoked from anon+authenticated+PUBLIC): `emit_event_naac_evidence` (AFTER INSERT/UPDATE fan-out on `events` — qualifies at status post_event/archived + non-empty `naac_criteria` + iqac_evidence_status <> rejected; one row per resolved code; refresh-on-edit; withdraws on regression/tag-removal/rejection; never clobbers is_auto=false) · `fn_event_evidence_cleanup_on_delete` (AFTER DELETE auto-row cleanup) · `fn_event_naac_resolve_codes` (raw tag → catalog code, exact else raw||'.1', unknown skipped) · `fn_event_naac_evidence_metadata` (k-anonymous aggregates only: registration/feedback counts + avg ratings, never identities)
- Backfill: one-shot idempotent INSERT..SELECT of currently-qualifying events (5 archived retro events → 10 mapping rows)
- Location: `supabase/migrations/20260726110000_events_naac_evidence_emitter.sql` — **NOT applied to prod** (rolled-back-validated 2026-07-26; 16-point battery PASSED: backfill 10/10, code resolution + unknown-code skip, regression/rejection withdrawal, delete cleanup, manual-row survival, EXECUTE lockdown ×4, k-anonymity spot-check)
### NAAC coverage tag fields — skill/IKS/value-ed/cultural (2026-07-26)
- `supabase/migrations/20260726005531_naac_coverage_tag_fields.sql` — additive booleans for live NAAC-2024 metric queries: `bos_course_syllabi.is_skill_based` (1.4), `bos_course_syllabi.is_iks` (1.6), `vac_courses.is_value_education` (6.4), all `NOT NULL DEFAULT false` + COMMENTs; `cdc_clubs.club_type` COMMENT only (column already exists free-text, no CHECK — 6.2 cultural clubs = `club_type='cultural'`, UI already offers it) — **NOT applied to prod** (BEGIN…ROLLBACK-validated 2026-07-26; DB apply is Director-gated)
### Loop Constitution — birth-gate + per-loop charter (2026-07-26)
- `loop_registry.owner_email` → NOT NULL + non-empty CHECK (`loop_registry_owner_nonempty`): an owner-less loop birth now fails at INSERT (receipt: `carre-audit` born owner-less 07-25; backfilled to Director in the same migration)
- Charter columns NEW (config, not code — one row per loop): `outcome_metric`, `baseline_window`, `intervention`, `verdict_owner`, `remeasure_window`; RECEIPTS RULE in column comments — a leg is written only when it demonstrably runs; any NULL leg = the Tower relabels the row a METER (receipt: `mess` claimed all gates on with measured 0)
- Charter seeds: scf, bug-triage, feeder, induction-session (4 chartered loops, 18 honest meters)
- Doctrine: `docs/architecture/loop-constitution.md` (same PR)
- Location: `supabase/migrations/20260726012000_loop_constitution_birth_gate_and_charter.sql` — **NOT applied to prod** (rolled-back-validated 2026-07-26: 5-assert battery PASSED incl. negative control on the assert channel; apply is Director-gated)

### 2026-07-26: fn_loops_regress_mess — third scheduled known-delta regress sim (mess loop)
- Savepoint self-rollback sim (mould: 20260711064500 fn_loops_regress_scf): borrows a REAL caterer id but scopes every join with sentinel tier_key 'ZZREGRESSMESS_TIER' on a far-past Monday → seeds 1 menu cell + exactly k=3 ratings at 3 stars + a recommendation with baseline 3.00 → asserts fn_mess_measure_menu_lift rating_lift = 0.00, resets outcome columns, raises ratings to 5 → exactly 2.00; waste leg left NULL on purpose (no tier filter on it — far-past week + NULL baseline_waste_pct keep waste_lift NULL); only persistent write = its loop_audits verdict row. REVOKE anon/authenticated/PUBLIC + GRANT service_role. Wired into LOOP_FNS in `/api/cron/loops-regress` (Sundays 07:53 IST). Location: `supabase/migrations/20260726073305_fn_loops_regress_mess.sql`. **NOT applied to any database — Director-gated apply. ⚠️ Apply via Mgmt API BEFORE the deploy that ships the route change — the cron sim-errors if the fn is absent.**

### Mess loop — measurement leg wired (2026-07-26) — `supabase/migrations/20260726073531_mess_loop_operator_access_and_verdict_hardening.sql`: fn_mess_menu_week cells now carry menu-row identity (id/institution_id/week_start_date) so the resident Rate surface can write mess_meal_ratings; chief_warden granted `campus_living.mess.menu.manage` (mmr_select board RLS); fn_mess_recommendation_set_verdict hardened with an internal is_super_admin/is_admin/menu.manage gate (anon lock re-asserted on both replaced functions). **NOT applied to prod — Director-gated.**

- 2026-07-26 — Prompt champion–challenger substrate: `supabase/migrations/20260726073915_prompt_champion_challenger_substrate.sql` — table `ai_prompt_versions` (one champion per job_type via partial unique index; admin-only SELECT, writes via RPC/service_role only) + SECDEF RPC `fn_prompt_promote_version(text,int)` (admin-asserted; retires champion, crowns challenger, copies winning prompt into `ai_job_types.prompt_template` so out-of-repo runners need no change) + version-1 champion backfill (WHERE NOT EXISTS). **NOT applied to any database — Director-gated apply.**

### Curriculum dry-out guard — empty-BoS threshold policy seed (2026-07-26)
- Policy row: `curriculum_ai.dryout_threshold` = 3 (global, number) — after this many delivered AI refusals for a course whose BoS learning pathway is empty (no units, no CLOs), the weekly lesson-spine bulk-mint cron parks it until that content changes (fingerprint compare); parked state surfaced in the cron response (`skipped_dried_out` + `dried_out[]`)
- No new function/table; WHERE NOT EXISTS identity guard (expression-index 42P10 pattern); cron falls back to in-code default 3 until applied
- Location: `supabase/migrations/20260726103000_seed_curriculum_dryout_threshold_policy.sql` — **NOT applied to prod (file-only at PR time; application Director-gated)**

### SCF note-safety loop — Phase 0: human review opens + §7.1 label split (2026-07-26)
- `supabase/migrations/20260726095711_scf_note_review_phase0.sql` — (1) `scf_learner_notes.calibration_split` NEW nullable text CHECK (calibrate|holdout), stamped server-side at verdict time (existing rows stay NULL); (2) `fn_scf_learner_notes_review` + `fn_scf_learner_notes_pending` gates widened per spec §6.3: `is_super_admin()` → `is_super_admin() OR user_has_permission('scf.notes.review')` (bodies otherwise verbatim vs live defs, pg_get_functiondef-verified; anon REVOKE re-asserted on both); (3) `custom_roles` row `scf_note_reviewer` ({"scf.notes.review": true}, institution_scope `all`, WHERE NOT EXISTS); (4) role assigned to profile `krishnaveni_a@jkkn.ac.in` (visible-NOTICE no-op if the email is absent). No auto-approve — humans decide everything; judge stays in shadow. **NOT applied to prod — Director-gated apply.**

### fn_ai_claim honors max_inflight — dormant-bug fix, multi-worker prep (2026-07-26)
- `fn_ai_claim(text,text,boolean)` CREATE OR REPLACE (body of 20260731130003 reproduced verbatim + cap gate): the claim SELECT now skips any job type at/over `ai_job_types.max_inflight`, counting in-flight as `status IN ('claimed','running')` (the `fn_ai_complete`/`fn_ai_fail` active set — NOT `pending`, which would deadlock the queue); NULL cap = unlimited; capped types are skipped, other types still claimable
- Race safety: `pg_advisory_xact_lock(hashtext('ai_jobs:claim'))` serializes claim calls (same idiom as `fn_ai_enqueue`'s atomic cap gate) so concurrent claimers can't both pass the count at cap-1; `FOR UPDATE SKIP LOCKED` kept unchanged
- Behavior UNCHANGED for today's single sequential worker (in-flight count is 0 at every claim; all registry rows have cap >= 1) and for every type with NULL cap; signature, return shape, and grants (service_role only, anon/authenticated/PUBLIC revoked) identical — out-of-repo box runners need zero changes. Prerequisite for a second Max-lane worker.
- File stamped `20260803020000` (after the latest existing migration) so it stays the LAST `fn_ai_claim` definition on any ordered rebuild — a 2026-07-26 stamp would sort before 20260731130003 and be clobbered by the cap-less body
- Location: `supabase/migrations/20260803020000_fn_ai_claim_honor_max_inflight.sql` — **NOT applied to any database — Director-gated apply**

### Usage Beacon kill switch — adoption sensor goes dark-by-default (2026-07-26)
- `supabase/migrations/20260726120000_usage_beacon_kill_switch.sql` — seeds ONE `platform_policies` row `analytics.usage_beacon.enabled` (global, boolean, `false`, ui_category `analytics`, widget `toggle`). No new table, no new function, no grant change — purely additive config.
- WHY: the usage-tracking substrate (`usage_events` + `usage_events_archive`, `module_usage_daily`, `feature_usage_summary`, `institution_health_scores`, `compute_module_usage_daily` / `compute_feature_usage_summary` / `compute_institution_health_scores` / `backfill_usage_events` / `archive_old_usage_events`, `UsageTrackingService`, `POST /api/analytics/usage/events`) has been live since 2026-02-06. Its EXPLICIT mode does write — 16 `trackUsage()` call sites across billing invoices + receipts, academic attendance + timetables, learner profiles and exports. Its PAGE-VISIT mode never did: no browser code ever called it, so every read-mostly module reads as zero adoption. This PR adds the missing client (`components/analytics/usage-beacon.tsx`, mounted once in `app/(routes)/layout.tsx`); the policy gates it because that mount enables writes for every page view by every user at once.
- Seeded with `WHERE NOT EXISTS`, NOT `ON CONFLICT` — `platform_policies` uniqueness is an expression index (42P10 pattern).
- SCOPE: the switch gates PAGE VISITS ONLY. The endpoint's explicit `{module,feature,event_type}` mode is NOT gated — those 16 pre-existing call sites keep writing regardless, since silencing working behaviour is not part of shipping the beacon.
- FAIL-SAFE: read via `fn_get_policy_bool(p_key, p_default => false)` in the route, which treats any read error as false; a missing row therefore means OFF. The route — not the client — is the authority. Rollback = flip the row to `false`.
- Location: `supabase/migrations/20260726120000_usage_beacon_kill_switch.sql` — **NOT applied to prod (file-only at PR time; application Director-gated)**
### Accreditation narrative drafter — an ungrounded draft no longer blocks re-drafting (2026-07-26)
- `fn_accreditation_narrative_awaiting(text,text,int)` CREATE OR REPLACE — body reproduced VERBATIM from the LIVE definition (`pg_get_functiondef`, 2026-07-26) plus ONE added predicate inside the existing `NOT EXISTS`: an `accreditation_metric_narratives` row stops blocking its (institution, metric, period) when it is `grounding_verdict IS DISTINCT FROM 'grounded'` **AND** `status = 'ai_drafted'` **AND** `owner_okayed_at`/`principal_approved_at`/`director_submitted_at` are all NULL
- WHY: the drafter's first live batch flagged 11 of 24 narratives `ungrounded` (all false positives of the validator, fixed in the same PR). `fn_accreditation_narrative_transition` refuses to okay an ungrounded row, and the old awaiting query excluded any pair that had ANY narrative row — so those metrics could NEVER be re-drafted, making the false positive permanent
- SAFETY: a human-progressed narrative is never re-drafted — `revision_requested` is deliberately excluded (the live transition RPC only reaches it from `owner_okayed`/`principal_approved`, so a human has acted and left a `revision_note`), and grounded rows are untouched. NULL verdict counts as not-grounded (also unapprovable), hence `IS DISTINCT FROM`
- No in-flight guard added: `fn_ai_enqueue_system` already takes `pg_advisory_xact_lock(hashtext('ai_jobs_sys:'||job_type||':'||dedupe_key))` and returns `in_flight` for a dedupe key in `('pending','claimed','running')` (verified against the live def); the cron already passes `<institution_id>:<metric_code>:<period>`
- Signature, return shape, volatility (STABLE) and grants unchanged — live ACL is `{postgres=X, service_role=X}`, so the migration re-asserts `REVOKE EXECUTE FROM anon, authenticated, PUBLIC` + `GRANT EXECUTE TO service_role` exactly as `20260725071500` established. Only caller is `app/api/cron/accreditation-naac-narrative-draft/route.ts`
- Validated on prod inside ONE `BEGIN … ROLLBACK` (Mgmt API): awaiting 31 → 44 (+13 = the 14 ungrounded pairs minus one simulated `owner_okayed`); asserted every ungrounded+untouched pair reappears AND was absent before, zero grounded pairs leak in, a simulated human-okayed ungrounded pair is NOT re-offered, ACL unchanged; 0.82 ms → 0.65 ms. Rollback confirmed — live def still has no verdict clause
- Location: `supabase/migrations/20260726131500_fn_accreditation_narrative_awaiting_redraft_ungrounded.sql` — **NOT applied to any database — Director-gated apply**
### Prompt champion–challenger GRADUATION mechanism (2026-07-26)
- Builds the judge-scoring + proposal flow the 20260726073915 substrate deferred; promotion stays HUMAN (no auto-promote path exists anywhere)
- Tables NEW: `ai_prompt_judgments` (one row per judged champion-vs-challenger pair; composite FK to `ai_prompt_versions(job_type,version)`) · `ai_prompt_graduation_proposals` (raised automatically when a challenger clears the bar; one PENDING per pair via partial unique index; policy-bar snapshot columns) — both admin-only SELECT, zero direct-write policies (RPC/service_role discipline), anon fully revoked
- Judge = ONE declarative `ai_job_types` ROW `prompt_compare.judge` (Max lane, family-alias model `sonnet`, tool_set none, output_target job.result, interactive=false, **enabled=false DARK**; `{{prompt}}` slot present — codified model_compare lesson); position-bias-controlled + conservative (tie default: falsely graduating a worse prompt is the costly error); WHERE NOT EXISTS seed
- Policy bar seeds (WHERE NOT EXISTS, expression-index 42P10 pattern): `ai_prompt_graduation.min_samples` = 10 · `ai_prompt_graduation.win_margin` = 3 — read via `fn_get_policy_int`, never constants
- Functions NEW (both SECDEF, anon+PUBLIC revoked): `fn_prompt_record_judgment(text,int,text,uuid,text)` **service_role only** (driver/cron writer: inserts judgment, keeps `ai_prompt_versions.clean_rate` = (wins+ties)/samples, raises a proposal when the bar clears; graceful skip for stale non-challenger verdicts) · `fn_prompt_graduation_decide(uuid,boolean,text)` authenticated with internal admin assert (the HUMAN act — approval calls the existing substrate RPC `fn_prompt_promote_version`, one door for every promotion)
- Admin surface: proposals + collecting tallies on `/admin/ai-models` (new card + `/api/admin/ai-models/prompt-graduation`, super_admin-gated; degrades silently until the migration is applied)
- Location: `supabase/migrations/20260803030000_prompt_graduation_mechanism.sql` (stamped after 20260803020000 so ordered rebuilds keep it last) — **NOT applied to any database — Director-gated apply** (BEGIN..ROLLBACK-validated on prod via Mgmt-API)

### Usage analytics rollup + retention — schedule the RPCs nothing ever called (2026-07-26)
- `supabase/migrations/20260726150000_usage_rollup_schedule.sql` — seeds ONE `ai_routine_schedules` row (`usage-rollup`, enabled, all 7 days, `minute_of_day` 247 = 04:07 IST). No new table, no new function, no grant change.
- WHY: `compute_module_usage_daily` / `compute_feature_usage_summary` / `compute_institution_health_scores` / `archive_old_usage_events` have existed since 2026-02-06 with **ZERO callers** — verified by repo-wide grep and against prod, where `usage_events` held 25,832 rows while `module_usage_daily`'s newest row was still 2026-02-06. Every usage read surface (`/api/analytics/usage/dashboard`, `/modules`, `/trends` via `LifecycleDashboardService`) queries the aggregate tables, NOT raw `usage_events`, so adoption dashboards served 5½-month-old numbers and `usage_events` grew unbounded (archival never ran).
- Slot 247 verified free against the 46 live schedules (clear of the 221/231 and 263/277 clusters).
- `ON CONFLICT (routine_id) DO NOTHING` is correct here — `ai_routine_schedules.routine_id` is a plain unique column, NOT an expression index, so it does not hit the 42P10 pattern that `platform_policies` does.
- Includes apply-time asserts: raises if any of the four RPCs is missing, or if the schedule row was not seeded — fails loudly at apply rather than the cron failing silently every night.
- Companion to the Usage Beacon (PR #2440, merged `f5fa4c4`): the beacon fills `usage_events`, this routine makes it readable. BACKFILL of the Feb-onward history is a separate manual trigger (`?days=180`); the nightly window is 2 days.
- Location: `supabase/migrations/20260726150000_usage_rollup_schedule.sql` — **NOT applied to prod (file-only at PR time; application Director-gated)**
### BUG-005352 — admission bridge never stamped academic_year_id on new learner profiles (2026-07-26)
- Code fix (same PR): `app/api/admission/bridge/convert/route.ts` now stamps the institution's active academic year on every new learner profile at conversion — the column trg_billing_bill_default_academic_year copies onto bills and fn_learner_current_year_academic_fee keys fee-eligibility on. NULL here was the root of hostel "not eligible" false negatives for freshers.
- Repair: `supabase/migrations/20260726130000_backfill_learner_academic_year_blank_only.sql` — blank-only backfill of `learners_profiles.academic_year_id` (44 live-pipeline learners at write time; terminal lifecycle states untouched) + blank-only stamp of **31 of 59** blank academic bills (28 deliberately excluded: 20 terminal-state owners, ~8 same-institution-guard refusals); backups in `_bak_learner_academic_year_backfill_20260726` / `_bak_billing_bill_academic_year_backfill_20260726` / `_bak_learner_hostel_mess_category_20260726` (the bill UPDATE fires the 20260612 category trigger, so owners' hostel/mess category columns are captured pre-update); idempotent. NOTE: this repair drains the admission PIPELINE — it does NOT move the current hostel-allocation queue (today's candidates all have stamped profiles); verification queries in the file header. Preview protocol: BEGIN..ROLLBACK. **NOT applied to prod — Director-gated apply, AFTER the code fix deploys** (until then new blank profiles keep appearing and counts drift).
### NAAC catalog — digitize the Binary-deck MARKS so the 900 ceiling is real (2026-07-27)
- `supabase/migrations/20260727090000_naac_binary_deck_marks_weights.sql` — writes `max_score` on every `metric_type='NAAC'` row in `sh_accreditation_metrics` from the NAAC Reforms 2024 Binary deck (pp.41-63, **Autonomous column**) and seeds the 18 deck metrics that had no catalog row at all. No new table, no new function, no RLS or grant change — rows + one column COMMENT only.
- WHY: measured on prod 2026-07-26, active NAAC rows = 51, `SUM(max_score)` = **380.00**, with **25 of 51** rows NULL or 0 — while `/accreditation/naac` promised "Score ceiling per college: 900" and a 75% (~675) target. Every percentage on that page was measured against a denominator less than half the truth. This is the deferred half of PR #1903 (`20260709030000`), which stated the deck "is not digitized in-repo … rather than fabricating point values".
- Shape: 42 guarded `UPDATE`s from a `VALUES` CTE (one line per metric so the diff is auditable metric by metric) + 9 rows set to 0 with a per-row reason + 18 `INSERT … WHERE NOT EXISTS` seeds (never `ON CONFLICT` — house pattern for this catalog) + `COMMENT ON COLUMN`.
- Attribute 2 quirk PRESERVED, not absorbed: the deck's own sub-scores exceed the attribute total (85 printed vs 50 allotted), so they are scaled 50/85 → 2.1 = 5.88, 2.2.1 = 14.71, 2.2.2 = 14.71, 2.2.3 = **14.70**. `numeric(5,2)` cannot hold the exact thirds, so the 0.01 rounding residual is absorbed on 2.2.3 and Attribute 2 sums to exactly 50.00. Documented in the file, in the row notes and on the dashboard.
- THREE distinct kinds of zero, never interchangeable (the dashboard renders each differently): **facet** rows sharing a canonical sibling's marks (1.1.2, 4.4.2, 6.3.2, 7.3.d/e/f — these hold 53 of the 148 live NAAC evidence rows, 7.3.d alone 47, so a per-catalog-row marks rollup would silently zero 36% of the platform's NAAC evidence) · **affiliated-only** 8.2.2 pass percentage, NA in the Autonomous column and deliberately **not** a facet of 8.2.1 (the deck numbers it 8.2, colliding with Graduate Progression — source-deck bug already recorded in `20260709030000`), so its 8 live COE-mirror rows never mint 8.2.1's 30 marks · **superseded** starter rows 9.1.1 / 10.1.1 (canonical homes 9.2 / 10.4 per `20260709030000`) whose evidence must earn nothing and be re-pointed · plus 3.6 / 7.4 / 9.5, which the deck gives no college marks in either column.
- OPEN DIRECTOR DECISIONS, flagged in the column COMMENT + PR + on-page, NOT settled here: live `institutions.institution_type` is autonomous (5) / self (2) / aided (1) — there is **no 'affiliated' type** — so one `max_score` column cannot express both deck columns and all 8 IQAC colleges are scored against the Autonomous ceiling. The deck's Affiliated column is also unreconciled at source: it totals **860, not 900** (a 40-mark double-count where 1.4/1.6/1.7 shift into 5.4/5.5/5.3 while the Attribute-1 marks are still printed). If per-type marks are ever stored, the two candidate homes are the unused `weightage` column (NULL on all 87 rows across all 10 bodies) and `accreditation_metric_crosswalk.college_type` (which already models the affiliated CODE shifts) — this migration uses neither.
  - ⚠️ **CORRECTED 2026-07-27 by `20260727123000` — read that entry before acting on the bullet above.** Three things in it are wrong: (i) the **860 / 40-mark double-count claim is WITHDRAWN as unsourced** — it is self-contradictory (860 against a 900 ceiling is a 40-mark *shortfall*; counting a metric twice inflates a total, it cannot deflate one) and its arithmetic does not come from the rows it cites (1.4 + 1.6 + 1.7 = 10 + 5 + 5 = **20.00**, not 40, live and in this migration's own VALUES list). No affiliated mark value exists in prod or in the repo and the source deck is not checked in, so 860 can be neither confirmed nor refuted here. (ii) **autonomous 5 / self 2 / aided 1 is the census of the 8 IQAC colleges, not of `institutions`**, which holds 14 rows — autonomous 5, aided 1, self **8**; the six extra `self` rows are two schools, two companies, the admin office and a test institution, so a per-type rule keyed on `institution_type` alone sweeps them in. `institution_type` also has no CHECK constraint. (iii) `weightage` is NULL on **107** rows now, not 87, and is **not** merely "unused" — it is writable from `/accreditation/manage/metrics` today and read by no scoring code.
  - ⚠️ The `accreditation_metric_crosswalk.college_type` rows named as a candidate home are **not usable as-is**: `current_code` `'5.4'` and `'5.3'` match **no active catalog row** (the codes are `5.4.1` / `5.3.1`; only `'5.5'` resolves), so a plain join applies 1 of the 3 affiliated shifts and drops 2 silently. Their destinations are also semantically unrelated to their sources under this migration's own Attribute-5 deck naming. Flagged in those rows' `note` by `20260727123000`; **not remapped** — resolving it needs the deck.
- Validated on prod inside ONE `BEGIN … ROLLBACK` (Mgmt API), 10 assertions all PASS: SUM = 900.00 exactly · 0 rows left NULL · row count 51 → 69 · all 10 attribute totals match the deck (75/50/50/50/150/125/100/125/100/75) · exactly 12 explained zero rows · 0 live evidence codes orphaned · 0 active NAAC codes outside the deck mapping (loud alarm against a sibling pane diluting the 900) · the dashboard figure recomputed in-DB = earned **320.29 of 900** from 17 of 57 marks-carrying metrics · 8.2.2 stays 0 while 8.2.1 earns 30 on its own rows · re-running the whole migration inside the same transaction is a no-op (idempotent). Rollback confirmed afterwards — prod still reads 51 rows / 380.00 / 25 nullish.
- Consequence stated up front: the denominator moves 380 → 900, so every coverage percentage the NAAC dashboard ever showed roughly halves. Coverage did not get worse — the ceiling became true.
- Location: `supabase/migrations/20260727090000_naac_binary_deck_marks_weights.sql` — ~~NOT applied to any database — Director-gated apply~~ → ⚠️ **APPLY STATUS STALE. This migration IS APPLIED to prod** (verified 2026-07-27 three ways: 69 active NAAC rows · `SUM(max_score)` = **900.00** exactly · all 69 rows carry the `[deck-marks 2026-07-27]` notes stamp · all 10 attribute totals match the deck · live catalog byte-identical to the test fixture). It is **not** recorded in `supabase_migrations.schema_migrations` — that table's newest row is `20260725191500`, i.e. nothing applied via the Management API since 07-25 is recorded, which is a property of that apply path, not of this file. Re-running is safe (UPDATEs idempotent, seeds `WHERE NOT EXISTS`).

### NAAC `max_score` COMMENT correction — withdraw an unsourced claim (2026-07-27)
- `supabase/migrations/20260727123000_naac_max_score_comment_correction.sql` — **documentation-only.** Replaces the `sh_accreditation_metrics.max_score` column COMMENT written by `20260727090000` and appends a warning to 3 `accreditation_metric_crosswalk` rows' `note`. **No DDL, no marks, no catalog row, no scoring, no new table or function** — therefore no REVOKE/GRANT block is required.
- WHY: `20260727090000` propagated one claim into four artifacts (its own header, the column COMMENT, this index and `/accreditation/naac`) that fails two checks available without leaving the repo. It is self-contradictory — a column totalling 860 against a 900 ceiling is a 40-mark **shortfall**, whereas a double-count inflates a total — and its arithmetic does not derive from the rows it names: 1.4 (10.00) + 1.6 (5.00) + 1.7 (5.00) = **20.00**, not 40. It is also unfalsifiable from the platform: `git ls-tree jicate/main -r` holds no PDF/xlsx/CSV of the NAAC Reforms 2024 Binary deck and **no affiliated mark value exists in any prod table**. The claim is therefore **withdrawn, deliberately not replaced with another number** — picking one would repeat the original error. Also corrected: the college-type census (5/2/1 is the 8 IQAC colleges; `institutions` is 5 autonomous / 1 aided / **8 self** across 14 rows) and the `weightage` row count (87 → 107, still NULL on every one, still writable from the admin metrics form).
- Also FLAGGED IN THE DATA, not fixed: the 3 `college_type='affiliated'` crosswalk rows seeded by `20260709030000`. Verified on prod — `1.4→5.4` and `1.7→5.3` match **0** active catalog rows (codes are `5.4.1`/`5.3.1`), only `1.6→5.5` resolves, so a plain join silently applies 1 of 3 shifts. Separately, all three destinations are semantically unrelated to their sources under `20260727090000`'s own Attribute-5 naming (5.3 Industry-academia linkage · 5.4 Continuous assessment components · 5.5 Catering to learner diversity) — e.g. `1.7` Online & blended SWAYAM/MOOC lands on Industry-academia while `5.2.1` Learning Path enrollment (SWAYAM, MOOCs) sits unused. **Either the triple or the deck naming is wrong; both are in production.** Resolving needs pp.41-63, so the codes are left untouched and the warning is appended to each row's `note` (idempotent, guarded on its own marker) where an implementer will meet it.
- Guards: aborts unless the catalog still reads 69 rows / 900.00 and 1.4+1.6+1.7 still total 20.00 (the figure the withdrawal quotes); warns if `institutions` is no longer 14 rows / 8 with `iqac_code`. Post-conditions re-assert 69 / 900.00 and require exactly 3 flagged crosswalk rows.
- Validated on prod inside ONE `BEGIN … ROLLBACK` (Mgmt API), 8 proofs all PASS: withdrawal marker present · old claim string absent · 3 crosswalk rows flagged · **mapping unchanged (`1.4->5.4, 1.6->5.5, 1.7->5.3`)** · 69 active rows · SUM 900.00 · 1.4+1.6+1.7 = 20.00 · 0 NULL `max_score`. Rollback confirmed in a **separate** call — prod still carries the original COMMENT, 0 flagged rows, 69 rows / 900.00.
- Location: `supabase/migrations/20260727123000_naac_max_score_comment_correction.sql` — **NOT applied to any database — Director-gated apply**

### Employer + alumni course feedback — the EXTERNAL half of NAAC 1.2 (2026-07-26)
- `supabase/migrations/20260726181500_stakeholder_course_feedback_surveys.sql` — the un-built second prong of NAAC 1.2. Live at write time that metric carried **13 auto evidence rows and all 13 came from `bos_meetings`** (PR #2412, the internal/minuted half); employers and alumni were never asked anything. `app/api/b2a/stakeholder-nps/route.ts` is still a hard-coded stub (`_stub_reason` "NPS survey schema not finalized") and `accreditation_survey_consents` had **0 rows** — the DPDPA consent leg existed but nothing had ever written to it.
- Tables NEW (3): `accreditation_stakeholder_surveys` (one short cycle per institution × body × audience × academic year; `audience` CHECK-narrowed to the external half of the existing `stakeholder_type` enum — `alumni | industry`; `institution_id` NOT NULL because `quality_evidence_mappings.institution_id` is NOT NULL, same contract #2412 used when it skipped institution-less rows) · `accreditation_stakeholder_invites` (the roster and the ONLY place respondent identity lives; mirrors `care_scorer_invites` — token + email + expiry; `responded_at` is both the chase view and the single-use guard) · `accreditation_stakeholder_responses` (**answers only** — no email, no name, no IP, no user-agent; `invite_id` ON DELETE SET NULL, so deleting an invite anonymises its answers permanently while the counts the evidence is built from survive). RLS on all three, `user_has_permission()` + `role_has_institution_access()` only, no hardcoded role names, explicit UPDATE policies (missing-UPDATE-policy silent-noop trap).
- **Table-level anon revoke** — the twin of the 2026-06-06 RPC lockdown. Supabase's `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon` silently hands a freshly created table 7 privileges to `anon`; measured during the rolled-back validation, these three tables inherited **21 anon grants** before the explicit `REVOKE ALL … FROM anon, PUBLIC`. Public writes reach them via the service-role route only, so anon needs nothing.
- ENUMS + fns REUSED, nothing minted: `stakeholder_type`, `survey_status`, `fn_accreditation_ay_label(timestamptz)`, `fn_ops_evidence_cleanup_on_delete()` (#2412). Consent REUSED verbatim — the public form writes `accreditation_survey_consents` on its nullable `alumni_email` slot with the existing `consent_version` `1.0-2026-04-19`; no consent schema change and no second consent UI.
- **NOT adopted:** `nps_surveys` / `nps_responses` / `nps_analytics`. Referenced by `types/supabase.ts` and nothing else (zero pages, services, hooks, APIs, fns, migrations), all three empty. Adopting them imports a live hole — all three grant SELECT/INSERT/UPDATE/DELETE/TRUNCATE to **both `anon` and `authenticated`**, and `nps_analytics`'s "System can manage analytics" policy is `FOR ALL USING(true)` with `polroles={}` (= PUBLIC, includes anon) — plus policies that hardcode `profiles.role` and a NOT NULL `nps_score` that forces an NPS 0-10 shape with `respondent_email`/`name`/`ip` on the answer row. **Pre-existing, needs its own security PR — not fixed here.**
- Functions NEW (4, all SECDEF, all `REVOKE EXECUTE … FROM anon, authenticated, PUBLIC` — trigger fire-time needs no caller EXECUTE, matching the live ACL of the #2412 fns): `fn_sync_stakeholder_survey_evidence(uuid)` · `emit_stakeholder_survey_evidence()` · `emit_stakeholder_child_evidence()` · `fn_touch_stakeholder_survey_updated_at()`.
- **Honest gating:** a cycle emits NAAC 1.2 only when `status='closed'` AND `responded_count >= 1` AND the institution exists. Draft, active, and closed-with-zero-responses emit nothing; reopening withdraws. **Shared-metric safety:** the withdraw pins `metric_code='1.2'` and `source_table`, never "all auto rows for 1.2" — a blanket withdraw would delete the 13 `bos_meetings` rows this lane is completing (the trap #2412 documented on `audit_cycles`).
- **k-anonymity:** metadata is counts + response rate + per-question means ONLY, and means are suppressed entirely (`aggregate_suppressed=true`) below **5** responses — a mean over 1-4 external respondents is that person's opinion, re-identifiable from a roster of two employers. Free text never enters metadata; it stays behind the permissioned admin view.
- Child re-sync triggers on invites + responses (INSERT OR DELETE) so `invited_count` / `responded_count` / `response_rate` / means can never outlive the rows they were counted from — without them, deleting the last response after close would leave an evidence row claiming responses that no longer exist.
- Period label is derived via `fn_accreditation_ay_label` (returns `AY 2026-27`), NOT the cycle's own `academic_year` text (`2027-2028`) — emitting the latter would put a third label format on a metric whose 13 existing rows are all `AY YYYY-YY` and break period grouping. `academic_year` is kept in metadata.
- Validated on prod inside ONE `BEGIN … ROLLBACK` batch (Mgmt-API): **40 assertions, 40 passed** — 3 tables + RLS, 0 anon table grants, 12 authenticated DML grants, 0 anon/authenticated EXECUTE on all 4 fns, registry seeded once, baseline 13 NAAC 1.2 rows all from `bos_meetings`, draft/active/closed-with-0 all emit 0, closed-with-1 emits 1 with `aggregate_suppressed=true` and `question_means={}`, free text absent from metadata, `period_label='AY 2026-27'`, closed-with-5 gives 4 means (relevance mean 3.00, rate 100.0), reopen withdraws only its own row, sibling cycle untouched, response deletes refresh then withdraw, invite delete keeps the answer with `invite_id` NULL, 0 identity columns on the answer table, consent row visible to the 8.4-export alumni filter, duplicate recipient / duplicate cycle / `audience='learner'` all rejected, cycle delete leaves no dangling evidence, and `bos_meetings` still exactly 13 at the end. Rollback verified in a SEPARATE call: 0 tables, 0 fns, 0 registry rows, NAAC 1.2 back to 13, consents back to 0, registry total back to 21.
- Location: `supabase/migrations/20260726181500_stakeholder_course_feedback_surveys.sql` — **NOT applied to any database — Director-gated apply**
### Cluster Academic Council — the cluster roster becomes data (2026-07-26)
- `supabase/migrations/20260726203000_cac_cluster_member_institutions.sql` — `accreditation_committees.member_institution_ids uuid[]` (NOT NULL DEFAULT '{}') records the standing roster of institutions a committee spans. For `committee_type='cluster'` (the CAC) that is every clustered institution — all 8 colleges AND both schools under the JKKN Institutions umbrella — because the council exists to integrate academic planning and share resources across them rather than duplicate them. `institution_id` stays NOT NULL and means FILING LOCATION only, never ownership: making it nullable was considered and rejected because every committee RLS policy scopes by it and `role_has_institution_access(NULL)` would hide the council from everyone. Per-decision reach remains separate (`accreditation_committee_resolutions.affected_institution_ids`, C7). Guard `accreditation_committees_cluster_needs_members` CHECKs that a cluster names >= 2 members (a cluster of one is not a cluster) — same birth-gate spirit as `loop_registry.owner_email`. Element-level FK on a uuid[] is not expressible; documented, write path is the committees UI. **NOT applied to prod** — validated 2026-07-26 in one BEGIN..ROLLBACK batch, 9/9 assertions passed (roster of 10 stored, filed at Main Office, both schools present, all ids resolve, empty cluster rejected, ordinary committees unaffected, live IQAC untouched); rollback confirmed clean in a separate call.
### AI Committee Assistant — agenda drafting · sitting proposal · minutes prose (2026-07-26)
- `supabase/migrations/20260726181500_accreditation_committee_ai_assistant.sql` — the missing PRODUCER + STORE for the DARK `accreditation.cac_brief` job row. Two tables, six SECDEF RPCs, three `platform_policies` rows, one `ai_routine_schedules` row, one new DARK job type, and a re-point of the existing DARK `cac_brief` row onto the proven `{{prompt}}` glue template.
- WHY: `accreditation.cac_brief` (#2402) is applied on prod and `enabled=false`, but `git grep cac_brief jicate/main` returns ONLY `SQL_FILE_INDEX.md`, its own migration, and two comments — no cron, no enqueue, no storage table. The row is inert even if the Director flips `enabled=true`. Meanwhile the meeting engine (live since 10 July) pre-fills minutes structurally but leaves the agenda typed by hand, the sitting scheduled from memory, and the minutes prose written from scratch.
- Tables: `accreditation_meeting_drafts` (grain `UNIQUE(meeting_id, draft_kind)` where kind ∈ agenda|minutes; carries `grounding_verdict` + `ungrounded_tokens` + `forbidden_number_hits` + `omitted_resolution_ids` + `source_facts` replay trail) and `accreditation_meeting_proposals` (partial `UNIQUE(committee_id) WHERE status='ai_proposed'` → at most one pending suggestion per committee). Both: RLS enabled, **SELECT-only policy, ZERO write policies** — every write goes through the RPCs.
- Grant direction (the forgery hole if reversed): cron writers `fn_accreditation_meeting_draft_awaiting` / `fn_accreditation_record_meeting_draft` / `fn_accreditation_meeting_proposal_awaiting` / `fn_accreditation_record_meeting_proposal` are **service_role ONLY**; human transitions `fn_accreditation_meeting_draft_transition` / `fn_accreditation_meeting_proposal_confirm` are `authenticated` (called with the SESSION client so `auth.uid()` is the real convener). All six `REVOKE EXECUTE ... FROM anon, PUBLIC`.
- THREE refusal gates live in `fn_accreditation_meeting_draft_transition` so no UI path can skip them: an ungrounded draft can never be okayed; an agenda whose `forbidden_number_hits` is non-empty can never be okayed (the Director's forbidden-agenda doctrine); a minutes draft whose `omitted_resolution_ids` is non-empty can never be okayed (omission is invisible to the grounding validator and would still flow into NAAC 7.3.e evidence via the nightly rollup).
- SCOPE-B CONTAINMENT: `fn_accreditation_meeting_proposal_confirm` is the ONLY path that creates a sitting, it writes `accreditation_committee_meetings` and nothing else, and it deliberately never touches the Universal Booking engine (`meeting_bookings` / `meeting_agendas` / the webhook dispatcher / calendar sync) which DOES invite real people. Verified on prod three ways: the four committee tables carry ONLY `set_updated_at BEFORE UPDATE` (no INSERT/notify trigger), the committee services + hooks contain no notification write path, and only two files in `jicate/main` reference `accreditation_committee_meetings`.
- Config rows seeded with `WHERE NOT EXISTS` (never `ON CONFLICT` — `platform_policies` carries an EXPRESSION unique index and fails 42P10): `accreditation.meeting.agenda_lead_days=3`, `accreditation.meeting.cadence_days=90`, `accreditation.meeting.proposal_enabled=false`. `is_active` (default true) and `publication_state` (default 'published') are left to their defaults, so `fn_get_policy_int/bool` read the rows back immediately.
- Dispatcher-driven (`ai_routine_schedules` row `accreditation-committee-ai-drafts`, `minute_of_day` 253 = 04:13 IST, verified collision-free) rather than an extra `vercel.json` cron. The companion registry entry in `lib/ai-routines/misc-ai.ts` is REQUIRED — `ai-routine-dispatcher` resolves `getRoutineById(routine_id)` and records "skipped: not in registry" without it.
- Ships DARK: both `accreditation.cac_brief` and the new `accreditation.meeting_minutes_polish` are `enabled=false`. `fn_ai_enqueue_system` gates on `enabled=true`, so zero jobs can be queued until the Director flips them (no deploy). The `cac_brief` UPDATE is guarded so it preserves `enabled` and cannot re-dark a row the Director already flipped live.
- Location: `supabase/migrations/20260726181500_accreditation_committee_ai_assistant.sql` — **NOT applied to prod — Director-gated apply.** BEGIN..ROLLBACK-validated on prod 2026-07-26 (17 assertion groups A–Q incl. anon-EXECUTE=0, grant direction both ways, 0 non-SELECT policies, all three refusal gates firing under an impersonated real super_admin, `meeting_bookings` 25→25 across a confirm, and no-session okay refused); prod re-checked in a SEPARATE call afterwards at 0 new tables / 0 new RPCs / 0 new policies / 1 committee / 2 meetings / 25 bookings.
### Event feedback → NAAC 7.3.f stakeholder-satisfaction evidence (2026-07-26)
- `supabase/migrations/20260726160000_event_feedback_satisfaction_naac_evidence.sql` — the largest unwired evidence mass on the platform: `event_session_feedback` (10,329) + `event_day_feedback` (2,008) + `event_program_feedback` (173) = **12,510 live rows reaching ZERO `quality_evidence_mappings`**. All of it belongs to one event whose `status='live'` and `naac_criteria='{}'`, so the per-event emitter from PR #2408 (gate: `status IN ('post_event','archived')` AND non-empty `naac_criteria`) can never reach a single row. Hence an institution × academic-year aggregate that does not depend on human per-event tagging.
- Table NEW: `event_feedback_naac_evidence` (one row per institution per AY: per-channel + combined response/respondent counts, events covered, mean ratings, satisfied share, prior-year trend). Writes are RPC-only — no INSERT/UPDATE/DELETE policies. Explicit `REVOKE ALL ... FROM anon, PUBLIC` (Supabase's default privileges hand anon ~7 privileges on every new table), `GRANT SELECT` to authenticated, RLS on with the standard `is_super_admin() OR is_admin() OR (user_has_permission('accreditation.evidence.view') AND role_has_institution_access(institution_id))` shape.
- Function NEW: `fn_event_feedback_refresh_naac_evidence()` — VOLATILE SECDEF, `search_path=public`, **REVOKEd from anon, authenticated AND PUBLIC, GRANTed to service_role only** (cron/system-only, matching the live ACL of `fn_hr_refresh_naac_evidence`). Upserts snapshots, zeroes snapshots whose source rows vanished, recomputes the year-on-year trend, withdraws its own stale auto mappings, then upserts NAAC 7.3.f rows on the junction natural key.
- **K-anonymity k=5, hardcoded** (deliberately NOT a `platform_policies` row — a floor an operator can lower to 1 is not a floor). No rating-derived statistic below k. **Complementary suppression added during audit:** the per-cell floor alone leaked — publishing the overall mean beside the surviving channel means makes a hidden channel recoverable by subtraction (session n=100 published + day n=1 hidden ⇒ that rating ≈ `total_avg*101 − session_avg*100`). The overall mean/share is now published only when the pooled residual of all below-k channels is 0 or ≥ k; `residual_n` is written into snapshot metadata so the decision is auditable. Free-text `comment` columns are never read; `learner_id` appears only inside `count(DISTINCT …)`.
- Coexists with the pre-existing 7.3.f rows from `scf_ai_suggestions` (4 live) — different `source_table`, and `fn_accreditation_rollup_loop_evidence`'s withdraw clauses are all scoped to its own source_table. Verified: those 4 rows survive a full run.
- Registry seed `event_feedback_snapshot` uses `WHERE NOT EXISTS` (registry uniqueness is an expression index — `ON CONFLICT` fails 42P10). Dispatcher seed uses `ON CONFLICT (routine_id) DO NOTHING`, which is correct because `routine_id` is the table's PRIMARY KEY.
- **Wiring defect found and fixed during audit:** the salvaged draft seeded the schedule row but never registered the routine in `lib/ai-routines/misc-ai.ts`. The dispatcher does `if (!routine || !routine.triggerPath) continue`, so it would have applied cleanly, shown in `/admin/ai-routines`, passed CI — and never once fired. `check:reachability` covers pages reachable from nav, not API cron routes, so nothing in the build gate catches this. Now guarded by `__tests__/lib/ai-routines/registry-cron-wiring.test.ts` (asserts every migration-seeded `routine_id` is registered; proven to fail when the entry is removed).
- Validated on prod via Mgmt-API `BEGIN..ROLLBACK` (rollback confirmed in a separate call: table/function/schedule absent, registry back to 21, mappings back to 194). Run: 2 snapshots, 2 mappings, byte-identical on re-run (idempotent), 0 k-anonymity violations, anon 0 table grants + no EXECUTE, authenticated no EXECUTE, service_role EXECUTE, RLS on. Withdraw path proven by simulating vanished source rows: `zeroed=1, withdrawn=1`.
- Location: `supabase/migrations/20260726160000_event_feedback_satisfaction_naac_evidence.sql` — **NOT applied to prod — Director-gated apply**
### Narrative re-draft attempt cap — stop the nightly churn (2026-07-26)
- `supabase/migrations/20260726170000_accreditation_narrative_attempt_cap.sql` — `fn_accreditation_narrative_awaiting` re-offers any pair whose narrative is ungrounded + `status='ai_drafted'` + untouched by a human. That clause is correct (such a row can never be okayed, so the metric would be stuck forever) but has **no counter**, so a pair the model genuinely cannot ground re-drafts EVERY NIGHT FOREVER. Live case: 7.3.f on institution `5736d86f`, blocked on `["0.22","2"]` — a computed value absent from its evidence. The gate is RIGHT to block it and must never be relaxed; it also will never pass.
- Column NEW: `accreditation_metric_narratives.attempt_count` (int, NOT NULL, default 0). Existing rows start at 0 = a full fresh budget, deliberately: #2462 (number-word compounds) and #2469 (self-correcting-reply parser) land at the same time, so the stuck 7.10.1 drafts should be retried against fixed code rather than capped out on attempts made against broken code.
- Policy NEW: `accreditation.narrative_max_draft_attempts` = 5, `data_type='number'`, `classification='operational'`, seeded `WHERE NOT EXISTS` (platform_policies uniqueness is an expression index — `ON CONFLICT` fails 42P10). Read via `fn_get_policy_int(key, 5)`, so the function still behaves if the row is deactivated. Config row per the house rule — contrast the k-anonymity floor in `20260726160000`, which is hardcoded on purpose (a privacy floor an operator can lower is not a floor).
- Functions REPLACED (both restated verbatim from the LIVE `pg_get_functiondef`, prod 2026-07-26, with only the cap lines added so no unrelated behaviour drifts): `fn_accreditation_record_narrative_draft` counts each AI draft (same `status='ai_drafted'` guard as every other refreshed column, so a human-touched row's counter never moves) · `fn_accreditation_narrative_awaiting` stops re-offering once the budget is spent — the row then simply blocks the pair again, which is what a grounded or human-touched row already does. No new state, no new code path.
- ACLs restated from the live shape (anon=false, authenticated=false, service_role=true for BOTH — read before writing): `REVOKE EXECUTE ... FROM anon, authenticated, PUBLIC` + `GRANT ... TO service_role`. `CREATE OR REPLACE` preserves grants, so this is anti-drift rather than a change.
- Does NOT relax the grounding gate, mark anything grounded, delete a narrative, or notify anyone. A capped-out row keeps its real ungrounded verdict and tokens and stays visible as the honest record.
- Validated on prod via Mgmt-API `BEGIN..ROLLBACK`, rollback confirmed in a separate call (column absent, policy absent, 80 narratives intact, both functions reverted). Behavioural results: cap=5 · re-offered at 0 and 4 attempts · **NOT re-offered at 5** · total offered pairs 3 → 2 once capped · recorder 2 → 3 · human-touched counter frozen at 7 with prose not overwritten.
- Location: `supabase/migrations/20260726170000_accreditation_narrative_attempt_cap.sql` — **NOT applied to prod — Director-gated apply**
### Green substrate — monthly campus meter readings + green audit cycles (NAAC Attribute 10, 2026-07-26)
- `supabase/migrations/20260803060000_sustainability_meter_readings_and_evidence.sql` — the first substrate Attribute 10 (Sustainability & Green Initiatives, 75 marks) has ever had.
- WHY: verified live on prod 2026-07-26, `SELECT count(*) FROM quality_evidence_mappings WHERE body_code='NAAC' AND metric_code LIKE '10.%'` returned **0**. Metrics 10.1 / 10.1.1 / 10.2 / 10.3 / 10.4 are seeded and active (PR #1903) but nothing in the platform could produce a single evidence row for any of them. A code sweep for `sustainab|green|energy|electricit|water|waste|carbon|solar|meter` over `jicate/main` found only mess FOOD waste (`mess_waste_log`, 0 rows), a personal hydration tracker and startup FINANCIAL runway — no utility metering, no green audit.
- Tables NEW: `sustainability_meter_readings` (the monthly register — one row per institution × calendar month × stream `electricity_kwh|water_kl|waste_kg|solar_kwh_generated`; long/tall so a new stream needs no migration; plain-column `UNIQUE (institution_id, period_month, stream)` = a safe ON CONFLICT target; explicit SELECT/INSERT/UPDATE/DELETE policies — a FOR-ALL-only or missing-UPDATE policy makes every UPDATE silently affect 0 rows) · `sustainability_naac_evidence` (snapshot, `UNIQUE (institution_id, academic_year)`, RLS enabled with a SELECT-only policy — writes are RPC-only, same posture as `hr_naac_evidence` / `obe_course_attainment_rollup`).
- "Campus" == `institution_id` (14 rows): `quality_evidence_mappings.institution_id` is NOT NULL, no campuses/buildings/premises table exists, and `institutions` is the only entity carrying a physical address and the thing `role_has_institution_access()` scopes on.
- Function NEW: `fn_sustainability_refresh_naac_evidence()` — VOLATILE SECDEF `SET search_path=public`, **REVOKE anon+authenticated+PUBLIC, GRANT service_role ONLY** (cron-only). Upserts snapshots then upserts the junction on its natural key `(source_table, source_id, body_code, metric_code)` with `DO UPDATE ... WHERE is_auto`, and withdraws its own stale auto rows **per metric_code**.
- HONEST GATES (the point of the lane — never a fabricated zero): no readings for a campus → no snapshot row → no evidence row · 10.2 needs water and/or waste for ≥ `sustainability.min_months_for_trend` distinct months · 10.3 needs enough electricity months AND a computable DIRECTION. The gate outcomes are materialised as `emit_10_2` / `emit_10_3` columns so the insert WHERE, the withdraw WHERE and the UI all read one source of truth.
- 10.3's year-on-year comparison uses **average per reported month, never raw totals** — the current AY is almost always partial (in July it holds 2 months against the prior year's 12), so a totals comparison reports a fake ≈ −86% every July. Caught by assertion A5 during BEGIN..ROLLBACK validation on prod.
- Policy seed (WHERE NOT EXISTS — `uq_platform_policies_key_scope` is an EXPRESSION index, so ON CONFLICT fails 42P10): `sustainability.min_months_for_trend` = 2, read via `fn_get_policy_int` — never an inline constant.
- Registry seed (WHERE NOT EXISTS): `quality_evidence_source_registry` row `sustainability_snapshot` → `sustainability_naac_evidence`.
- Function REPLACED (additive only): `fn_sync_audit_cycle_evidence(uuid)` — a closed cycle with `module_key='sustainability'` now ALSO emits NAAC 10.4. The existing 4.4.2 contract is unchanged. **Discriminator is `module_key`, deliberately NOT a framework value and NOT new catalog parameters**: `parameterMatchesFrameworks()` (lib/services/audit/framework-filter.ts) matches `framework_mapping` on the KEY only and ignores the value, so seeding green parameters as `{"naac":"10.4"}` would silently freeze them into the `parameter_catalog_snapshot` of EVERY future NAAC cycle; and `audit_parameter_catalog.parameter_group` is CHECK-limited to 1..5 with no environmental group. `audit_cycles.module_key` has no CHECK/FK/enum and already carries 'academic'/'campus-living'/'learners-council' in prod, so this needs ZERO vocabulary widening.
- Withdrawals in that function stay keyed per `metric_code` — `audit_cycles` already carries a FOREIGN auto mapping (NAAC 7.3.d, mapped 2026-07-10) that a blanket "delete all auto for this source" would destroy. Asserted intact (A12).
- ACL re-asserted on the replaced function to exactly the live prod values read 2026-07-26 (anon=false, authenticated=false, service_role=true) — the secdef-anon-revoke gate treats CREATE OR REPLACE as a NEW function, and Supabase's default `ALTER DEFAULT PRIVILEGES` would otherwise hand `anon` a direct EXECUTE grant.
- Schedule seed: `ai_routine_schedules` row `sustainability-naac-evidence`, all 7 days, `minute_of_day` 305 (05:05 IST — verified free; only 291 `coe-result-naac-snapshots` sits in 290–320). `ON CONFLICT (routine_id) DO NOTHING` is correct here (plain unique column, not an expression index).
- Apply-time asserts: raises if any of NAAC 10.2/10.3/10.4 is missing or inactive, if the registry/schedule/policy seed did not land, if `anon` can EXECUTE either SECDEF, or if `service_role` lost EXECUTE on `fn_sync_audit_cycle_evidence` (which would break the audit trigger).
- Entry surface: `/accreditation/manage/utility-readings` (nav-config Manage child) — one month, four boxes, the prior month and the delta beside each. A blank box records "not read", NOT zero. Permissions `accreditation.sustainability_readings.view` / `.manage`.
- Location: `supabase/migrations/20260803060000_sustainability_meter_readings_and_evidence.sql` — **NOT applied to any database.** Validated on prod inside ONE `BEGIN … ROLLBACK` batch via the Management API: 15 assertions passed, then rolled back; absence re-verified in a separate call (tables/function/schedule/policy/registry all still absent, Attribute-10 evidence still 0, `fn_sync_audit_cycle_evidence` still has no 10.4 branch).
### Exam eligibility — practicals retroactive correction + thresholds become config (2026-07-26)
- `supabase/migrations/20260726190000_backfill_subdivided_toplevel_roster.sql` — **APPLIED to prod 2026-07-26 ~21:28 IST.** Idempotent; re-running is a no-op.
- WHY: a subdivided (practical) period stores its roster in `attendance_data -> <period_uuid> -> groups[].students[]` and left the top-level `students[]` EMPTY. **35 live functions read only the top-level array**, so **16,537 records for 493 learners across 302 periods (2025-11-25 → 2026-07-24, all one course)** were invisible to exam-eligibility aggregation, the attendance dashboards and the CARRE/CRS/DHS/TES scorers.
- Fixed by BACKFILL, not by patching the 35 readers: PR #2401 already fixed the *writer*, so mirroring that same shape onto the historical periods makes every reader correct with **zero function edits** and leaves history and future identically shaped. One data write beat 35 `CREATE OR REPLACE`.
- Director ruled **FULL RETROACTIVE correction**, overriding the forward-only premise #2401 asserted *without a recorded ruling* (the Director confirmed they were never asked).
- Measured on prod read-only BEFORE applying, and reproduced independently from scratch: 4,954 learners · 487 changed · **290 up, 197 down** · best gain +2.94pp · worst drop −10.22pp · **6 GAIN exam eligibility, 2 LOSE it, 0 cross the 65% floor**. The correction is genuinely two-way — counting hidden practical sessions adds hidden absences too. The 8 band-crossers are listed in `.claude/registrar-eligibility-band-changes-2026-07-26.md`.
- Guard: ABORTS if flattening `groups[]` would yield duplicate `student_id`s (would double-count sessions). Verified 0 duplicates across all 302 before applying. Second guard aborts if any subdivided period is still empty afterwards.
- Reversible: `groups[]` is never modified, so rollback = set the mirrored periods' `students[]` back to `'[]'`. Exact manifest (302 entries / 191 day-rows) snapshotted pre-apply. Only `updated_at` on 191 rows is permanent.
- `supabase/migrations/20260726193000_exam_eligibility_thresholds_policy.sql` — **NOT applied.** Validated on prod in one `BEGIN … ROLLBACK` batch (2 rows seeded, both sanity guards passed), absence re-confirmed in a separate call.
- WHY: the 75/65 rule had **no config row anywhere** — a hardcoded constant pair duplicated in FOUR places whose only stated authority was the comment `// university norm`. Director confirmed the rule and approved consolidating it.
- Seeds `academic.exam_eligibility.attendance_pct` = 75 and `academic.exam_eligibility.condonation_floor_pct` = 65 (global, `data_type='number'`, `classification='major'`, ui_category `Exam Eligibility`). WHERE NOT EXISTS, never ON CONFLICT — `uq_platform_policies_key_scope` is an EXPRESSION index (42P10). Idempotent, and will NOT reset a value an admin has since tuned.
- Scope-aware: `fn_get_policy` resolves user > institution > role > global, so a college on a different affiliating-university norm gets its own institution row with no code change. Readers pass `institutionId` where they have one.
- Apply-time assert: both rows must exist AND the condonation floor must sit strictly BELOW the eligibility line (otherwise the condonation band is empty).
- DO NOT CONFLATE with the other 75s: `internal_marks_insight_config.attendance_threshold`, `cdc.min_attendance_pct_for_internship_certificate`, `internship.policy.attendance_fail_below_pct`, `vac.completion_attendance_threshold` — different concepts, separate rows.

### SECURITY — revoke anon on 37 unprotected leftover backup tables (2026-07-26)
- `supabase/migrations/20260726180000_revoke_anon_on_unprotected_backup_tables.sql` — **37 public-schema tables have RLS DISABLED and carry Supabase's default `anon` grants**, so PostgREST serves them to anyone holding the public anon key embedded in every page of https://www.jkkn.ai. Confirmed empirically over HTTPS, not inferred: `GET /rest/v1/_bak_hostel_allocations_20260612?select=*` with the public key returns **HTTP 200, content-range 0-0/67**. Across the 37 that is **2,702 rows of real learner data** (hostel allocations, learner fee categories, billing bills, team-member role keys, academic-year rollbacks), and `anon` holds INSERT + UPDATE + DELETE on **all 37** — publicly deletable, not merely readable.
- Cause: repair-migration leftovers (`_bak_*`, `*_rollback_*`, `_archive_*`) created with plain `CREATE TABLE AS`, which inherits the `ALTER DEFAULT PRIVILEGES` grant to anon and does NOT enable RLS. The production tables they were copied FROM are correctly protected — only the copies leak.
- Fix: `REVOKE ALL ... FROM anon, PUBLIC` on each (this is what PostgREST checks) + `ENABLE ROW LEVEL SECURITY` with no policies as defence in depth. `service_role` and the owner still reach them (RLS is bypassed for those). Verified safe: not one of the 37 is referenced by any file under `app/`, `lib/` or `components/`.
- Does NOT drop the tables (they are somebody's rollback safety net — deleting data is a separate decision) and does NOT touch the ~1,300 other tables that carry anon grants but DO have RLS enabled (not exposed; a blanket revoke would risk intentionally-public reads like the community/caste lists on the unauthenticated admission landing page).
- Apply-time assert uses `has_table_privilege(role, c.oid, ...)`, NOT the text form: the text form resolves through `search_path` and Postgres does not guarantee it evaluates after the `nspname` filter — the text form errored live during validation on `storage.s3_multipart_uploads`.
- Validated on prod via Mgmt-API `BEGIN..ROLLBACK`, rollback confirmed in a separate call (still 37 exposed after rollback = nothing was applied). Results: 0 anon-SELECTable · 0 anon-DELETEable · 37 of 46 backup-pattern tables RLS-protected · service_role retains access · `_bak_hostel_allocations_20260612` still 67 rows · `learners_profiles` unaffected.
- 9 further backup-pattern tables have RLS off but no anon grant — not exposed, deliberately left alone to keep this migration targeted.
- Location: `supabase/migrations/20260726180000_revoke_anon_on_unprotected_backup_tables.sql` — **APPLIED to prod (state re-measured 2026-07-26 later the same day; this line previously read "NOT applied — THE EXPOSURE IS LIVE").** Live catalog now returns `anon_sel_rls_off = 0` across all 1,403 public tables (21 remain RLS-off, every one of them with anon fully revoked), and all 37 named tables still exist and are locked. `supabase_migrations.schema_migrations` does NOT carry version `20260726180000` — the ledger's newest row is `20260725191500` — so the DDL reached prod out-of-band via the Management API. Trust the catalog, not the ledger.

### SECURITY — revoke anon on four tables added 2026-07-26 (2026-07-26)
- `supabase/migrations/20260726210000_revoke_anon_on_four_new_public_tables.sql` — the same omission as `20260726180000`, one layer up. Four tables created on 2026-07-26 carry Supabase's full default grant `anon=arwdDxt` (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) and nobody revoked it: `sustainability_meter_readings`, `sustainability_naac_evidence`, `accreditation_meeting_drafts`, `accreditation_meeting_proposals`. Their source migrations (`20260726181500_accreditation_committee_ai_assistant.sql`, `20260803060000_sustainability_meter_readings_and_evidence.sql`) each contain `REVOKE EXECUTE ... FROM anon` lines — but only on FUNCTIONS. Neither contains one `REVOKE ... ON TABLE ... FROM anon`.
- **Why they are not open today, and why that is not reassuring.** PostgREST answers 401 — but the body is `{"code":"42501","message":"permission denied for function user_has_permission"}`, NOT `permission denied for table ...`. Every policy on all four is `TO PUBLIC` (`pg_policy.polroles = {0}`), so it applies to anon and IS evaluated; anon already holds EXECUTE on `is_super_admin()`, `is_admin(uuid)` and `role_has_institution_access(uuid)`, and evaluation only dies at `user_has_permission(text)`. The sole thing keeping these four private is a missing EXECUTE grant on ONE helper function. Rewrite a policy without it, or grant anon EXECUTE on it, and all four open silently with no migration touching the tables.
- Fix: `REVOKE ALL ON TABLE ... FROM anon, PUBLIC` on each — the check PostgREST performs before any row-security evaluation. Adds/drops/alters **no** policy: all four already have RLS on, and the apply-time assert FAILS if that ever drifted off rather than silently re-enabling it. `authenticated` and `service_role` keep their own direct grants (the live relacl carries no PUBLIC entry at all, so the PUBLIC revoke is a no-op today and exists only against a future PUBLIC grant).
- No product behaviour change: every caller is authenticated or service-role — `lib/services/accreditation/utility-readings-service.ts`, `lib/services/accreditation/committee-meeting-service.ts`, `app/(routes)/accreditation/naac/committees/[id]/_actions/meeting-ai-actions.ts`, `app/api/cron/sustainability-naac-evidence/route.ts`.
- Apply-time assert uses `has_table_privilege(role, c.oid, ...)` (OID form — the text form resolves through `search_path` and bit `20260726180000` live during its own validation) and checks four things: all four tables present · anon holds no SELECT/INSERT/UPDATE/DELETE · `authenticated` AND `service_role` still hold SELECT (catches an overshooting revoke) · RLS still on.
- Validated on prod via Mgmt-API `BEGIN..ROLLBACK`, rollback confirmed in a SEPARATE call (all four back to `anon_sel=true`). Results: before `anon_sel/ins/upd/del = true` on all four → after all false · `authenticated` + `service_role` SELECT retained · RLS + policy counts unchanged (4/1/1/1) · relacl anon entry gone entirely · schema-wide anon-SELECTable tables `1239 → 1235 of 1403`, i.e. exactly −4 and no collateral.
- Location: `supabase/migrations/20260726210000_revoke_anon_on_four_new_public_tables.sql` — **NOT applied to prod — Director-gated apply.**
- Paired with the new CI gate `scripts/ci/check-table-anon-revoke.mjs` + `.github/workflows/table-anon-revoke.yml`, which fails any PR whose migration adds a `CREATE TABLE` without a matching explicit anon revoke. Audit mode (`--all`, never wired to CI) reports **1,020 of 1,133 historical tables uncovered** — which is exactly why the gate is PR-scoped, same as the SECURITY DEFINER sibling.

### SECURITY — close public access to external event participants (2026-07-27)
- `supabase/migrations/20260727060000_close_external_participant_public_policies.sql` — **APPLIED to prod 2026-07-27 ~05:55 IST with explicit Director approval, ahead of this file**, because it was a live personal-data exposure. The file records the change so a rebuild does not reintroduce it; re-running is a no-op.
- `event_external_participants` carried `ext_participants_public_read` (SELECT, TO public, `USING (true)`) and `ext_participants_public_insert` (INSERT, TO public). The table holds `full_name` / `email` / `phone` for people registering for events from outside the institution. Measured live: **9 rows, 9 names, 9 phone numbers, readable by anyone holding the public anon key.** Confirmed over HTTPS (`HTTP 200`), not inferred. The insert policy also let strangers write registrations.
- **NEW LEAK CLASS — RLS was ENABLED and the table was exposed anyway.** A permissive `TO public USING (true)` policy makes RLS a no-op. The 2026-07-26 sweep in `20260726180000` greps for `relrowsecurity = false` and therefore structurally cannot see this shape. 38 tables share it; this was the only one holding personal data.
- Safe to remove both: every access in the codebase uses `createServiceRoleClient()` (which bypasses RLS) — `lib/services/events/core/external-participant-service.ts` and `app/api/events/marathon/[eventId]/register/route.ts`. Neither policy served the product.
- Verified after applying: anon read **401**, anon insert **401**, public policies **0**, anon grant **false**, RLS **on**, **9 rows intact** — access closed, no data removed.
- Deliberately NOT closed (Director's call): the other 37 permissive-policy tables are aggregate internal data, chiefly `institution_health_scores` (2,086) and `feature_usage_summary` (1,324). `castes` (1,069) and `community_categories` (11) are **verified-intentional** — `app/student-form/[token]/` reads both with the browser anon client for prospective applicants who have no account; closing them would break admission intake.
### AI PROMPTS — a prompt edit creates a CHALLENGER instead of overwriting the live prompt (2026-08-04)
- `supabase/migrations/20260804060000_prompt_edit_creates_challenger.sql` — the missing WRITE side of the champion–challenger loop. Measured on prod 2026-07-27: `ai_prompt_versions` held **37 rows, ALL `status='champion'`, ZERO challengers**. The substrate (`20260726073915`) and the judge/graduation mechanism (`20260803030000`) were both in place, but nothing ever MINTED a challenger — so the judge had nothing to compare and the loop could never start. The substrate's own table comment already said "A prompt fix is a champion–challenger, not an edit", while `fn_ai_job_type_upsert` still did `prompt_template = EXCLUDED.prompt_template` and destroyed the old text. Director decision 2026-07-27.
- Changes exactly ONE function, `fn_ai_job_type_upsert`. Its body is reproduced VERBATIM from `20260713000100` apart from the prompt-routing block and the extra reply keys — verified byte-identical against the live prod definition before the change (body md5 `258bf64b6f06e050bb944b7284bd2e0b`; whole-definition md5 `babe2215d3222add0c70a9790f9c5fc9`). No drift between repo and prod. `git diff` of the live body vs the new one shows exactly TWO deleted lines (the prompt value in the INSERT, and the one-line RETURN).
- Five branches: **new job type** → prompt LIVE + version 1 `champion` (a job type must never exist without one) · **prompt unchanged** → plain upsert, no version row · **first prompt for a job type that had none** → LIVE + `champion` (nothing to challenge; a job type with no prompt cannot run at all) · **prompt changed** → `ai_job_types.prompt_template` NOT touched, new text filed as `challenger` at `max(version)+1` · **prompt cleared to empty** → live prompt KEPT and the caller told (`prompt_action='clear_ignored'`); an empty prompt cannot be judged (`ai_prompt_versions.prompt` is NOT NULL) and wiping it would break every future run with no record of what was lost.
- **Multiple challengers: every edit APPENDS a new version; an open challenger is never rewritten in place.** Replacing it would destroy the admin's earlier proposed text — the one thing this change exists to prevent — and `ai_prompt_judgments` carries an FK on `(job_type, challenger_version)`, so mutating a challenger's text would leave every verdict already recorded against it pointing at text that no longer exists, silently mixing judgments of two different prompts into one tally. The schema was built for this: only ONE champion is constrained (partial unique index); challengers are deliberately unconstrained in number.
- **Whitespace trap, caught by the dry run.** Postgres `trim()`/`btrim()` default to trimming the SPACE character ALONE — not tabs, not newlines — unlike every language's `.trim()`. The first version compared `btrim(prev) = btrim(new)` and minted a junk challenger on a re-save whose only difference was a textarea's trailing newline, i.e. the commonest no-op save there is. The comparison now passes an explicit whitespace set `E' \t\r\n\f\v'`, and normalises for the branch decision only — the stored value keeps the original `trim()` semantics verbatim.
- Promotion is NOT re-implemented: the live prompt still moves only through the existing `fn_prompt_promote_version`, the same single door `fn_prompt_graduation_decide` uses. Runners (`~/jkkn-max-lane`) are untouched — they keep reading `ai_job_types.prompt_template`, which now simply stops changing under them until a human promotes.
- Backfill (idempotent, `WHERE NOT EXISTS`, never `ON CONFLICT`): 6 job types created THROUGH the RPC after the substrate's own backfill carried a live prompt with no version row at all — `accreditation.cac_brief`, `accreditation.naac_narrative_draft`, `accreditation.meeting_minutes_polish`, `improvement.rank_data_gaps`, `prompt_compare.judge`, `ai_pulse.prompt_dedup`. The RPC also self-heals the same state on first edit (adopts the live text as version 1 champion before filing the challenger).
- Grants re-asserted exactly as `20260713000100` set them and verified live before the change: `anon=false`, `authenticated=true`, `service_role=true` (Supabase default grant, preserved by `CREATE OR REPLACE`). Nothing widened. No table, no policy, no new function.
- Validated on prod via a single Mgmt-API `BEGIN..ROLLBACK` batch — 11 scenarios incl. all five branches, multiple challengers not losing text, promotion still working end-to-end, self-heal, and the grant asserts. Residue confirmed in a SEPARATE call: function md5 back to `babe2215d3222add0c70a9790f9c5fc9`, 0 probe rows, still 37 versions / 0 challengers / 6 orphans. The file carries no `BEGIN;`/`COMMIT;` of its own, so wrapping it stays a dry run (ref `feedback_inner_commit_defeats_begin_rollback_dryrun`).
- Location: `supabase/migrations/20260804060000_prompt_edit_creates_challenger.sql` — **NOT applied to any database — Director-gated apply.**

### Archive cross-institution-pointer BoS learning pathways — 4 rows (2026-07-27)
- `supabase/migrations/20260727061500_archive_cross_institution_syllabi.sql` — **APPLIED to prod 2026-07-27 on Director go**; the file is the repo record and is idempotent (0 rows changed on re-run = NOTICE, not failure).
- Defect: a learning pathway whose `institutions_id` differs from its regulation's `institution_id`, sitting beside an institution-consistent sibling with the same `course_code` — both `is_latest = true`, so every `is_latest` consumer (incl. `lib/services/pde-bos-evidence-service.ts`, which feeds accreditation evidence) counted the course twice. 4 rows archived: `aa915688` (24UCCSP01), `59858d6c` (24UCYC08), `7b69351d` (24UGEN03 — keep-polarity REVERSED vs the other three), `f5ec6a6c` (24UVCC02).
- NOT a duplicate-regulation problem: `faa44348` (R-2024, CAS Self) and `4dc273c5` (R-2024, CAS Aided) are legitimate per-institution rows; merging them was rejected (both carry live per-college data, incl. 728 learner profiles on the Self side). Keep-rule is institution-consistency.
- FK safety pre-established: `pde_demonstrations` holds 0 references to any archived row; `f5ec6a6c` has 1 `revised_from_syllabus_id` child whose pointer survives archival. Nothing deleted.
- Later wave (same defect family, also applied 2026-07-27): `1ab045c5` (24UADC03), `2ebb7c91` (24UCCC01), `d99b7d64` (24UMBC03), `a7615434` (24UBAC12, after a content comparison confirmed the keeper is stronger), plus a RE-POINT of `56925c25` (24UTFDE14) to its own institution's regulation because it has no sibling to fall back on.
- Evidence: `.claude/bos-double-latest-finding-2026-07-26.md`, `.claude/bos-retag-research-2026-07-27.md`, `.claude/bos-24ubac12-compare-2026-07-27.md`.
### Classroom Practice L2 — one sealed micro-item per feedback submission (2026-07-29)
- `supabase/migrations/20260729184500_classroom_practice_l2_micro.sql` — **NOT applied to prod — Director-gated apply.** New sealed table `carre_micro_impressions` (RLS SELECT super-admin-only, no write policies, anon/PUBLIC revoked) + config row `classroom_practice.l2` + 3 locked RPCs: `fn_scf_micro_next_item` (picks AND records the one item riding a submission; per-(learner, senior learner) rotation, CP-C1 decided-leave relevance gate, per-learner auto-backoff), `fn_scf_micro_answer` (0-4 or skip, owner-scoped), `fn_scf_micro_health` (weekly base-feedback submissions vs micro answers — the watched alarm metric). Rollback switch = `platform_policies` `classroom_practice.l2` → `value->>'enabled'=false`, no deploy needed. Tolerates the CP-% catalog rows not existing yet (sibling migration seeds them): no rows → `{item:null}` → UI renders nothing. Battery: `.claude/battery-cp-l2.sql`. **Scope pivot 2026-07-29 (Director): the semester learner sheet is CANCELLED and this table is now the ONLY learner input for this loop** — the sibling compare (`20260729190000`, ordered after) reads k≥3 aggregates of ANSWERED rows over COMPLETED calendar windows, joined on **`teacher_email`** (there is no `teacher_profile_id`: the attendance blob's `assigned_faculty.faculty_id` is a team-member id, not `profiles.id`). Adds `sealed_comment` (Principal + Director ONLY, never the person described, one per impression, ≤2000 chars) invited every Nth answered item via `comment_invite_every_n_answers` (default 8, ≤0 disables).
### fn_update_recruitment_step_comment — NULL guard let an anonymous caller edit review comments (2026-07-30)
- `supabase/migrations/20260730130000_fix_recruitment_comment_null_guard.sql` — **NOT applied to prod — Director-gated apply, ships as its own PR.** Rolled-back-validated only; both apply-time asserts passed inside `BEGIN..ROLLBACK`, and `anon` still holds EXECUTE on prod (proof the dry run did not leak into a live apply).
- **The bug.** The guard read `IF NOT ((v_decided_by IS NOT NULL AND v_decided_by = v_uid::text) OR is_super_admin() OR user_has_permission('hr.recruitment.approve.override')) THEN RAISE`. For an unauthenticated caller `auth.uid()` is NULL, so the first term is NULL; `is_super_admin()` and `user_has_permission()` both return a proper `false`; `NULL OR false OR false` = **NULL**; `NOT NULL` = **NULL**; and plpgsql does not take an IF branch whose condition is NULL. **The RAISE was skipped and execution fell through to the UPDATE.** Measured in the definer context on prod 2026-07-30 (that is what runs inside a SECDEF body — testing as `SET ROLE anon` is NOT equivalent and merely errors on `user_has_permission`).
- The function was anon-executable, so the caller needed nothing but a candidate UUID. **7 of 19** candidates carry a decided step with `decided_by` set — the precondition — and were writable. The write was NOT executed; proving it fully would mean modifying production recruitment data.
- **Note the asymmetry:** `false OR false` is false, but `NULL OR false` is NULL. The guard failed OPEN for exactly the caller it most needed to stop, and behaved correctly for every logged-in user — which is why it went unnoticed. Same class as the SECDEF super-admin guards corrected 2026-07-26; see `feedback_secdef_guard_not_null_safe_falls_through`.
- **Fix:** two independent barriers — an early `IF v_uid IS NULL THEN RAISE ... 42501` before any row is read, and `COALESCE(..., false)` around the whole authorization expression so a NULL from any future term fails CLOSED. Plus `REVOKE EXECUTE ... FROM anon, PUBLIC` (both — the function carried no explicit `anon=X`, it inherited from PUBLIC, so revoking anon alone is a silent no-op). The rest of the body is byte-for-byte the deployed version; no behaviour change for any caller previously allowed through.
- Once applied, delete its entry from `scripts/ci/anon-exposure-functions.json` — it is the last remaining `grandfathered` row, and the sweep drops from 1 warning to 0.
### CAC measured metrics — one guarded read for the whole grid (2026-07-30)
- `supabase/migrations/20260730110000_cac_measured_metrics_rpc.sql` — **APPLIED to prod 2026-07-30 ~08:40 UTC with explicit Director approval at the session gate** ("Ready PR + apply the read-only RPC to prod DB"). Read-only: creates one function, no table, no data written. Re-running is a no-op (`CREATE OR REPLACE`).
- `fn_cac_measured_metrics()` returns `(institution_id, metric_key, value_numeric, value_label, detail)` for the ELEVEN of the CEO's 48 CAC metrics that have real per-institution substrate. Live result: **53 rows across 14 institutions**. The other 37 metrics are absent from the response deliberately — the TS catalog (`app/(routes)/accreditation/cac/_lib/cac-metric-catalog.ts`) records why each has no number, and the page renders "not captured yet", never 0.
- **Takes NO arguments, by design.** Identity and permission are derived internally; there is no parameter to forge. This is the direct lesson of the five anon leaks closed 2026-07-28/30, one of which (`fn_hostel_unallocated_candidates`) served 49 learners' names, emails, gender, programme and year to an unauthenticated caller because it trusted a caller-supplied id.
- Guard: `COALESCE(is_super_admin(), false) OR COALESCE(user_has_permission('accreditation.cac.view'), false)` — both COALESCEd, because a SECDEF predicate returning NULL falls through and GRANTS. Raises `42501` otherwise. Lock: `REVOKE EXECUTE ... FROM anon, PUBLIC` (**both** — revoking only `anon` is a silent no-op since `anon` inherits PUBLIC's `=X/postgres`), `GRANT ... TO authenticated`. `SET search_path = public`, `STABLE`.
- Proven on prod over HTTPS: anon → **401 `42501`**; authenticated without the permission (learner, Senior Learner) → **403 `42501`**; super admin → **200, 53 rows**. Anon sweep after the change unchanged: 4 relations / 64 functions / 0 unapproved / 0 escalated.
- **Attendance is a 30-DAY WINDOW, and the label says so.** `student_attendance.attendance_data` is JSONB keyed by period holding a `students` array, so an all-history rate must unnest ~1.1M elements: measured on prod at **15.7s warm / 29.1s cold** against the `authenticated` role's **8s** `statement_timeout` — it would time out on every page load. The 30-day window runs in 3.8s. All-history figures (real, and worth a nightly snapshot later, mirroring `coe_naac_evidence`): ENGG 71.15 · ALHD 77.60 · ASSF 77.72 · PHAR 79.71 · ASAI 82.78 · NURS 87.28 · DENT 87.73, both schools >92.
- Pass percentage reads `coe_naac_evidence`, whose mirror IS live (`ai_routine_schedules` row `coe-result-naac-snapshots` last fired 2026-07-29 23:15Z, `HTTP 200 · count 8`, which also proves `COE_SUPABASE_*` are set in the deployed env). Its 8 rows are 4 sessions × **one campus counted twice** — COE institution `CAS` fans out to both Arts and Science entries with identical numbers — so the RPC carries `shared_campus_note` from the row's own `fan_out` field and the page must not read it as two independent measurements.
- 🪤 **NAMING TRAP — do not "correct" this join.** Sports and cultural registrations join **`events_registrations`** (plural-plural, FK → `events`). The near-identically named **`event_registrations`** is a DIFFERENT module's table: its `event_id` is FK-constrained to **`startup_events`**, so joining it to `events` matches nothing. Verified on prod 2026-07-30: all 2,361 of its rows are orphans against `events` — zero matches, zero null event_ids. The wrong join was shipped here first and did NOT zero the displayed figure (the event count is `count(DISTINCT ev.id)` across a LEFT JOIN, so it stayed correct at 20) — it zeroed the registrations half of the tooltip, which read "20 events · 0 registrations" when the truth was 1,594, almost all of them a single marathon. It is recorded here as well as in the migration because this index is the mandatory first stop before any SQL work, so it is the likeliest place a future editor will look.
- **No `'CAC'` row is seeded into `sh_accreditation_metrics` and `BodyCode` is untouched**, deliberately: the 48-metric catalog is fixed CEO content, and filing it there would drag in weights, ceilings and a total — exactly what the Director's "measured, no grade" decision rejects.

### PDE — unblock clinical-case access for enrolled learners + clean up on submission delete (2026-08-08)
- `supabase/migrations/20260808100000_vac_lessons_enrolled_learner_select.sql` — **NOT applied to any database — Director-gated apply.** Adds a SECOND permissive SELECT policy `vac_lessons_select_enrolled_learner` on `vac_lessons` so a learner enrolled in the lesson's course can read it; the existing `vac_lessons_select` is left byte-for-byte untouched (permissive policies combine with OR, so this can only widen read access, never narrow it, and cannot revert an unseen live tightening). Measured on prod 2026-07-27: course `128a9d24-1091-4bc8-ab24-0c77380fcb74` had 545 enrolled learners and exactly ONE `user_institution_access` row, so 544 got the missing-scenario notice while the preview route looked healthy because `super_admin` short-circuits every gate. Deliberately NO `is_published` gate — `app/api/pde/cases/route.ts` hardcodes `is_published: false` and nothing in the codebase ever flips it, so gating on it would leave the defect 100% unfixed. No 42P17 recursion: traced `vac_enrollments_select` → `vac_courses_select` → `user_institution_access`/`profiles`, no path returns to `vac_lessons`. **Enrolment alone is deliberately NOT the gate** — `vac_enrollments_insert` is `WITH CHECK (user_id = auth.uid() OR super_admin)` and places no constraint on `course_id`, so any authenticated caller can forge an enrolment for any course on the platform; a bare enrolment read door would have been a cross-tenant read escalation. The policy therefore calls new SECURITY DEFINER helper `fn_vac_learner_may_read_lesson(uuid)` (anon/PUBLIC revoked, `authenticated` granted) which requires enrolment **AND** `vac_courses.institution_id = profiles.institution_id` — the `profiles.institution_id` check the broken policy was missing. SECURITY DEFINER is required because inlining the institution join would re-evaluate `vac_courses_select`, which itself demands the `user_institution_access` row these 544 learners lack. Residual by design: within one institution a learner could still forge an enrolment into another of their own college's courses — no more than institution-scoped team members already get; the root fix is constraining `course_id` in `vac_enrollments_insert`, flagged separately. Policy is `TO authenticated` — **required, not stylistic**: with no `TO` clause it applies to PUBLIC, so `anon` would evaluate the USING clause and, having just had EXECUTE revoked, every unauthenticated `SELECT` on `vac_lessons` would raise `permission denied for function` instead of returning zero rows (reproduced locally before fixing).
- `supabase/migrations/20260808100100_pde_submission_delete_cleanup.sql` — **NOT applied to any database — Director-gated apply.** Two different mechanisms because the two dependent tables differ in cardinality: `pde_engagement_events` gets a genuine `source_submission_id` FK with ON DELETE CASCADE (backfilled from `metadata->>'submission_id'`, kept current by a BEFORE INSERT/UPDATE trigger that only links to an existing attempt, so no route has to change and the FK can never reject a write that succeeds today); `pde_learner_capabilities` gets an AFTER DELETE RECOMPUTE instead, because it is a `UNIQUE(learner_id, capability_id)` best-score-wins aggregate spanning many attempts and a cascade would destroy a record other surviving attempts legitimately earned. Recompute also catches the ordering a pointer-keyed cascade misses (attempt 1 = 80%, attempt 2 = 50%: deleting attempt 1 must drop the score even though the evidence pointer names attempt 2). Never blocks a delete — the body is wrapped in an exception handler that raises a WARNING and lets the DELETE stand (conscious trade: a failed recompute leaves the stale row and reports only to the Postgres log, because making an attempt undeletable is strictly worse). Recompute takes a `FOR UPDATE` lock on the capability row first, so two concurrent deletes for the same learner serialise instead of each writing a best score that points at the other's already-deleted attempt. The engagement-event link is re-derived on every write rather than only when NULL, so an UPDATE that repoints `metadata->>'submission_id'` moves the FK with it instead of leaving a stale link that would cascade away an event naming a different submission. `source_submission_id` is strictly DERIVED — one unconditional assignment on both INSERT and UPDATE, so after the trigger it is always exactly what `metadata->>'submission_id'` resolves to and nothing else. Weaker forms leaked: setting it only when NULL left a stale link after a repoint, and clearing it only when metadata *changed* let a caller forge the FK directly alongside unsupporting metadata and have it CASCADE-delete the event when the wrong attempt was removed. Because the value is only ever a just-confirmed-existing submission id, the FK can never reject a write that succeeds today on any non-route path. The recompute is additionally **provenance-gated**: it only touches a capability row whose `demonstration_evidence` carries a `submission_id`, so a capability awarded by import or by hand is never destroyed — and the "was it a clinical case / does the pointer name the deleted attempt" skip conditions were removed, because each could skip a needed recompute (the first when the attempt's assessment row is already gone, the second in the reverse-ordering case) and the latter compared a uuid as raw text. The backfill shape-guards then casts to `uuid` (rather than comparing to `s.id::text`) so it normalises exactly as the trigger does; a pre-existing event holding an upper-case uuid would otherwise never link and never be cascade-cleaned — precisely the orphan this migration removes. Threshold mirrors `clinical_reasoning.scoring.passing_threshold_pct` read from `platform_policies` directly rather than through `fn_get_policy_clinical_reasoning`, so a missing function can never raise inside the trigger and make an attempt undeletable.
- `supabase/migrations/20260808100200_pde_question_option_ids.sql` — **NOT applied to any database — Director-gated apply.** `fn_pde_normalize_question_option_ids` plus a BEFORE INSERT/UPDATE OF options trigger and an idempotent backfill, guaranteeing every object element of `pde_assessment_questions.options` carries a non-empty `id`. A missing id broke the learner path twice: it permanently disabled the submit control (`MCQWarmupQuestion.tsx` matches on `selectedId === o.id`, which never becomes truthy) and it made the `fn_pde_mark_objective` answer-key fallback return NULL, so every answer graded wrong. Reserves ids already present BEFORE generating any (so the three rows repaired by hand on 2026-07-27 are neither renumbered nor disturbed, and a generated id can never collide), and never reads or writes option `text`, `feedback` or `is_correct`. A **duplicate** id counts as a gap too, not as "already fine" — two options sharing `opt1` break the learner path exactly as a missing id does (`selectedId === o.id` matches both and the `LIMIT 1` answer-key fallback can resolve to the wrong one); the first occurrence keeps the id and each later collision is reassigned, and the backfill predicate selects rows in either broken shape. A normaliser rather than a CHECK constraint on purpose: a constraint would turn a silent defect into a hard AI/PMS import failure.

### AI Pulse — AI-rejected prompts reach a champion, and a stalled safety check becomes visible (2026-08-05)
- `supabase/migrations/20260805100000_ai_pulse_safety_review_queue.sql` — **NOT applied to any database — Director-gated apply.** Rehearsed against prod inside `BEGIN..ROLLBACK`; a separate call re-confirmed all three functions still absent and build `a8d832e5` still `failed`. Adds three SECURITY DEFINER functions and **no schema change**: `fn_ai_pulse_champion_safety_queue(integer)` (the `safety_status='failed'` list), `fn_ai_pulse_release_prompt_build_safety(uuid)` (`failed` → `passed`), `fn_ai_pulse_prompt_safety_health()` (Director decision #10 — waiting/rejected/passed counts plus `max(safety_checked_at)`, the ONLY detector for the `*/10` safety cron silently stopping, because an empty feed is otherwise indistinguishable from nobody writing prompts). All three: `SET search_path = public`, `REVOKE EXECUTE FROM anon, PUBLIC` + `GRANT TO authenticated` in the same file, guard `COALESCE(is_super_admin() OR user_has_permission('aiPulse:anomaly.review'), false)` — the COALESCE is load-bearing, since `NOT (NULL OR NULL)` is NULL and the `IF` would fall through leaving the guard OPEN. The release gate is deliberately **narrower** than the two pre-existing decision RPCs, which also accept the Monday-Lab scoring key (named verbatim in the migration header): measured by value on prod (`permissions #>> '{key}' = 'true'`, not `?` which tests mere existence) that key is held by `faculty` 483 + `hod` 102 + `school_faculty` 1 = **586 team members**, versus **3** for `ai_pulse_champion`; the widening on the older two exists only as back-compatibility for holders already using them, and a brand-new action carries no such debt. Release **appends** `released_by`/`released_at` to `safety` (`||`, never overwrite) so the model's `reasons` and `appropriate:false` survive for audit — that record is the only evidence the checker is over-blocking. `AND safety_status = 'failed'` in the UPDATE makes it idempotent and refuses to resurrect a build rejected for any other cause; `IF NOT FOUND` then raises `P0002` so the UI can say so honestly. `safety->'reasons'` is unnested behind a `jsonb_typeof(...) = 'array'` guard because `jsonb_array_elements_text()` on an object RAISES, which would take the whole queue down over one malformed verdict; the author join is `LEFT`, never `INNER`, so a build whose `learners_profiles` row is missing stays reviewable rather than becoming invisible to the only person who can release it. `fn_ai_pulse_champion_report_queue` is deliberately left untouched — its lack of a safety/score/graduation filter is a known OPEN item the Director has not decided. Dry-run results: `anon=false public=false authenticated=true` on all three; queue returned build `a8d832e5` (score 78, 2 reasons); release flipped it to `passed` with both reasons intact; a second release raised `P0002`; a plain learner (`is_super_admin=false`, `aiPulse:anomaly.review=false`) got **42501** on all three, and an unauthenticated caller got `not authenticated`.
