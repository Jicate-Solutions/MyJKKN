# Supabase SQL File Index

## ⚠️ IMPORTANT: SINGLE SOURCE OF TRUTH

**This is the ONLY place to track all SQL files. DO NOT create duplicate SQL files.**

## 📝 Recent Changes

- **2026-04-29** — Wave B.1 — Notification Generator Policy: substrate + 8-row backfill + SR approval refactor (3 of 3 migrations)
  - Migration 1: `notification_generator_config_schema_v1`. Applied via Supabase MCP. Verified on prod: 2 tables created, 9 cols each, RLS enabled, 3 functions live (1 STABLE/DEFINER lookup + 2 trigger fns).
  - Migration 2: `notification_generator_config_backfill_v1`. Applied via Supabase MCP. 8 generator rows seeded with EXACT current hardcoded values: `overdue_invoice`, `stale_lead_rescue`, `pending_leave_approval`, `unmarked_attendance`, `recruitment_approval`, `sr_approval`, `unresolved_bug`, `unresolved_grievance`. ON CONFLICT DO NOTHING for idempotency. Audit trigger fired 8 INSERT rows on backfill (verified). All `is_active = true`.
  - Migration 3: `sr_approval_generator_config_driven_v1`. Applied via Supabase MCP. `fn_generate_service_request_approval_items` rewritten to read all constants via `fn_get_generator_config('sr_approval', fallback)` — statuses, age window, batch limit, priority threshold, TTL, exclude_super_admin gate, role-fallback toggle, returned-routes-to-requester toggle. Hardcoded fallback inside the fn matches the backfilled row bit-identical. PL/pgSQL variables in `LIMIT` + `make_interval()` keep the cursor query static (no EXECUTE format).
  - `01_tables.sql`: appended `notification_generator_config` (per-generator policy rows, JSONB `config`) + `notification_generator_config_audit` (INSERT/UPDATE/DELETE log with old/new JSONB).
  - `02_functions.sql`: appended `fn_notif_gen_cfg_set_updated_at` (touch trigger), `fn_log_notif_gen_cfg_change` (audit trigger, SECURITY DEFINER), `fn_get_generator_config(name, fallback)` (single source-of-truth lookup, STABLE + SECURITY DEFINER, returns hardcoded fallback when row missing/inactive). Replaced `fn_generate_service_request_approval_items` body with config-driven version. EXECUTE granted to `authenticated, service_role`.
  - `03_policies.sql`: appended 5 policies (4 on config table + 1 on audit table). RLS reuses `attention_bar.rules.manage` permission per spec §5 (no new permission key).
  - `04_triggers.sql`: appended 2 triggers (BEFORE UPDATE for updated_at, AFTER INSERT/UPDATE/DELETE for audit).
  - JSONB shape varies per generator (no per-key constraints). E.g., `unmarked_attendance` has `batch_limit_outer`/`batch_limit_inner` instead of single `batch_limit`; `unresolved_grievance` has `trigger_conditions` array (sla_deadline, escalation_level, is_emergency). Each generator's caller passes its hardcoded baseline as `p_fallback` so missing/inactive row = day-1 baseline.
  - **Behavior preservation verified live on prod 2026-04-29**: 4 qualifying SRs match predicate. 2 routable (SR-BONA explicit principal approver, SR-TRAN-MM0AJ requester via returned-routes-to-requester) → 2 emissions in notifications table from cron earlier today (matches OLD fn output bit-identical). 2 skip cases (SR-AUDI no approver_user_ids + no approver_role; SR-TRAN-MMVPJSYD role='administrator' resolves to 0 active users) → both also skipped by NEW fn (same logic). Re-run of NEW fn returned 0 (idempotent skip on existing notifications).
  - Wave B.1 SHIPS COMPLETE. Waves B.2 (parallel-agent fan-out for the other 6 generators), B.3 (Tab 8 admin UI in `/system/attention-bar`), B.4 (Layer 1 STATIC_DEFAULTS) are later.
  - Spec authored at `specs/notification-generator-policy/SPEC.md` (lost via concurrent-session race per memory `feedback_concurrent_session_race_atomic_commit.md`; continuation prompt `.claude/continuation-prompt.5a44f1da.md` carries the executable contract used to ship this work).

- **2026-04-29** — Phase 1.5a — `platform_policies` substrate (canonical runtime-config table)
  - Migration: `20260429000002_platform_policies_substrate.sql`. Applied via Supabase MCP. Verified on prod: 16 system seeds, 5 verification probes pass, fn_recompute_attendance_on_holiday_change body now reads from `fn_get_policy_int`.
  - `01_tables.sql`: appended `platform_policies` (key/scope/value JSONB, unique on key+scope+scope_id sentinel, 4 scope types).
  - `02_functions.sql`: appended `fn_get_policy(p_key, p_scope_id)` resolver (priority: user > institution > role > global) plus type-safe sugar `fn_get_policy_int/text/bool`. EXECUTE revoked from `PUBLIC, anon`; granted to `authenticated, service_role` (defense-in-depth — global policies would otherwise leak via `/rest/v1/rpc/`).
  - `03_policies.sql`: appended RLS — SELECT for any authenticated user, INSERT/UPDATE/DELETE for `is_super_admin() OR is_admin()`.
  - 16 seeds inserted (14 HR Sprint 5 from Section 17a Round 1-4 + 2 cross-cutting): holiday_backfill_lookback_days(90), audit_retention_years(7), geofence_mode(audit_only), geofence_radius_m(200), auto_approve_threshold_minutes(0), self_heal_step2_channels(["in_app"]), self_heal_window_hours(24), class_proxy_day_calc_default(HALF_DAY), cross_college_proxy_enabled(true), team_view_privacy_mode(full), monthly_letter_mode(on_demand), late_arrival_action(track_only), biometric_priority_over_self_mark(true), multi_day_pattern_detection(false), super_admin.digest.fanout_role_keys(10 roles), hr.dashboard.daily_brief.fanout_via_permission_key(hr.dashboard.view).
  - PR #590 hardcode retirement: `fn_recompute_attendance_on_holiday_change` 90-day window now reads `fn_get_policy_int('hr.attendance.holiday_backfill_lookback_days', 90, v_inst_id)`. `fn_purge_attendance_audit_log` falls back to policy default when `hr_organizations.audit_retention_years` is NULL (per-org column still wins when set).
  - TS helpers: `lib/policies/keys.ts` (POLICY_KEYS constants — single source of truth) + `lib/policies/get-policy.ts` (`getPolicy/Int/String/Bool/Array`). New keys must be added here AND seeded in DB.
  - Phase 1.5b (admin UI at `/system/policies`) ships in a separate PR. Subsequent phases READ via `fn_get_policy*` and never hardcode.

- **2026-04-28** — Attention Bar Phase 4a — 5 SECURITY DEFINER state-query functions for Layer 2 rules engine
  - Migration: `attention_bar_state_query_functions_v1.sql`. Applied via Supabase Management API. Verified: 5 functions created + 5 registry rows seeded.
  - `02_functions.sql`: 5 new functions appended — `fn_aqs_counselor_pending_leads`, `fn_aqs_attendance_unmarked_periods_today`, `fn_aqs_billing_overdue_invoices`, `fn_aqs_admission_leads_unassigned_count`, `fn_aqs_attendance_faculty_compliance_today`. All `SECURITY DEFINER SET search_path = public, pg_catalog`.
  - Registry seeds inserted into `quick_action_state_queries` for all 5 query_keys: `counselor.pending_leads` (30/min), `attendance.unmarked_periods_today` (30/min), `billing.overdue_invoices` (30/min), `admission.leads.unassigned_count` (60/min), `attendance.faculty_compliance_today` (30/min).
  - Schema discoveries verified against prod DB: `student_attendance` has no `marked_by` column (compliance is section-level); `timetables.selected_days` is JSONB array of uppercase day names; `staff_plan_courses` has no `section_id`; `billing_invoices` has no status column (use `billing_student_bills`).
  - Test verification: fn4 returned 14,253 unassigned leads (oldest 61 days); fn2 returned 83 sections unmarked today. All 5 functions confirmed STABLE + prosecdef=true in pg_proc.
  - Missing indexes flagged (not added — separate PR): `student_attendance(section_id, attendance_date, institution_id)`, `billing_student_bills(due_date, status, institution_id)`.

- **2026-04-28** — Attention Bar Phase 1 — DB foundation for the 5-layer resolver system
  - Spec: `specs/attention-bar-5-layer-system.md` (PR #542); architecture validated via interactive mockup at `/tmp/quick-action-interactive.html`.
  - Migration applied via Supabase MCP: `attention_bar_phase_1_tables`. Verified: 7 tables · 15 RLS policies · 11 config rows seeded.
  - `01_tables.sql`: appended 7 new tables — `quick_action_rules` (Layer 2 rules), `quick_action_state_queries` (registry of named state queries), `quick_action_taps` (Layer 3 behavioral data, 90-day retention), `quick_action_user_consent` (DPDPA opt-in state, default false), `quick_action_ai_cache` (Layer 4 LLM cache, 1-hour TTL), `quick_action_audit` (universal audit, 30-day retention), `quick_action_config` (system-wide config). All idempotent (`IF NOT EXISTS` + `ON CONFLICT DO NOTHING`).
  - `03_policies.sql`: appended RLS policies for all 7 tables. Standard pattern `(is_super_admin OR is_admin) OR (user_has_permission AND institution_access)`. Self-read/write policies for taps/consent/audit gated by `user_id = auth.uid()`.
  - 5 new permission keys added to `lib/constants/permissions.ts`: `attention_bar.{rules.view, rules.manage, audit.view, config.manage, test_sandbox.use}`.
  - Default config seeded (kill-switches per layer + DPDPA thresholds + AI budget caps): `layer_N.enabled = true`, `layer_3.min_impressions = 30`, `layer_3.confidence_threshold = 0.7`, `layer_4.daily_budget_usd = 5`, `layer_4.per_user_daily_calls = 50`, `layer_4.cache_ttl_minutes = 60`.
  - FK convention follows existing project standard: all `user_id`/`created_by` references point at `public.profiles(id)`, not `auth.users(id)`. Cascade-delete on user removal for all per-user data tables (taps, consent, audit).
  - Phase 1 of 7-PR decomposition. Phase 2 (pill component) needs PR #541 dashboard glass merged first to inherit Tier-D visual aesthetic. Phases 3-7 build on this DB foundation incrementally.

- **2026-04-27** — Admission CRM: lead dedup multi-source — Stage 4 (verification + RPC bugfix)
  - New migration `fix_capture_admission_lead_dedupe_reactivation_history` applied via Supabase MCP. Removed the explicit `INSERT INTO admission_lead_stage_history` from the reactivation branch of `capture_admission_lead`. Pre-existing trigger `trigger_log_lead_stage_change` AFTER UPDATE on `admission_leads` already auto-logs the lost->new transition; the explicit insert was producing a duplicate row. Caught by Stage 4 scenario verification — the bug was harmless (extra audit row, no data loss) but worth removing to keep stage_history clean. CREATE-path explicit INSERT (null->new) stays — the trigger only fires on UPDATE.
  - **End-to-end scenarios verified live**: (S1) create new lead, (S2) merge across phone-format normalization (`+919000099999` ≡ `90000-99999`), (S3) force lost stage manually, (S4) re-capture while lost → reactivated=true with funnel_stage flipped to 'new'. Final state: 1 lead, 3 captures (website/walk_in/referral), `previous_stage='lost'` preserved. Post-fix verification: stage_history rows = 3 (was 4 before fix).
  - **Reactivation context** preserved via `LeadService.logRecaptureActivity` writing to `admission_lead_activities` instead of `admission_lead_stage_history` — clean separation of "stage change" vs "narrative note".
  - `02_functions.sql` synced to match.
  - Stage 4 complete. Final visual click-through deferred to user; all DB+RPC paths verified.

- **2026-04-27** — Admission CRM: lead dedup multi-source — Stage 3 (Sources Captured panel)
  - No DB or SQL-file changes; pure UI delivery on top of Stage 1+2 plumbing.
  - New `hooks/admission/use-source-captures.ts` — TanStack Query hook with 30s staleTime, calls `LeadService.getSourceCaptures(leadId)`.
  - New `app/(routes)/admission/leads/[id]/_components/sources-captured-card.tsx` — vertical timeline card. Reuses existing `SourceBadge` colour system. Each row shows source chip + relative & absolute timestamps + optional `source_detail`, plus a UTM chip when set. Oldest capture marked with primary-coloured dot + "First touch" badge.
  - `app/(routes)/admission/leads/[id]/page.tsx`: import + place panel between "Personal Information" and "Academic Details" cards inside the Details tab. 2-line edit.
  - **Behavioural effect**: every lead detail page now shows the full source-capture timeline. For all 7,775 backfilled leads at least one row appears (their original source). New captures from any of the 7 entry points start appending in real time.
  - **Verification**: targeted `tsc -p stage3-tsconfig.json` (with full project paths) confirmed only pre-existing baseline errors in unrelated files (PWA prompt, sidebar duplicates, missing `@/types/database.types`, fuse namespace, etc.) — Stage 3 files compile clean.

- **2026-04-27** — Admission CRM: lead dedup multi-source — Stage 2 (service layer + atomic RPC)
  - New migration applied via Supabase MCP: `add_capture_admission_lead_rpc` + bugfix `fix_capture_admission_lead_skip_generated_full_name` (smoke test caught the `full_name` GENERATED column trap that PR #534 hit 3 days ago — same pattern, fixed with explicit column list).
  - `02_functions.sql`: new `public.capture_admission_lead(p_lead jsonb, p_capture jsonb)` SECURITY DEFINER + `SET search_path=public`. Internal authorization (super_admin OR admin OR `admission.leads.create`); service-role callers (auth.uid() IS NULL) bypass since they auth upstream via X-API-Key. Atomicity: `SELECT ... FOR UPDATE` on phone-normalized last-10-digits closes the race window that allowed 845 prod duplicates to accumulate. Reactivates lost/dormant leads on re-capture. Returns `{lead_id, capture_id, action: created|merged, reactivated}`.
  - **Live smoke-test verified**: `+919000000000` and `900-000-0000` correctly merged onto same `lead_id` despite different formats; `website` then `walk_in` both appear in `admission_lead_source_captures` ordered by capture time. Test data deleted post-verify.
  - `lib/services/admission/lead-service.ts` refactored: `createLead()` is now a thin backward-compat wrapper around new `captureLead(leadData, captureMeta?, user?, supabaseOverride?)`. Side effects (counselor auto-assign, expo lead-count++, follow-up scheduling, WhatsApp `lead_created` dispatch, counselor notification) extracted into private `runCreateSideEffects()` and gated to `action='created'` only — they no longer double-fire on re-captures. New `logRecaptureActivity()` adds a soft `note` activity on `'merged'` so counselors see the re-touch. New `getSourceCaptures(leadId)` for the Stage 3 detail-page panel.
  - `types/admission.ts`: 4 new types — `LeadSourceCapture`, `CaptureMetaInput`, `CaptureAction`, `CaptureLeadResult`.
  - **Behavioral effect of Stage 2**: All 7 lead-creation entry points (webhook, inbound, refer, public form, expo rapid, expo bulk, manual `/leads/new`) **immediately benefit** without code changes — the wrapper makes them auto-absorb duplicates as new source-captures. The 409 "Duplicate lead" path is gone; counselors filling the manual form for an existing phone now end up on the existing lead's detail page with their new source touch recorded, instead of seeing an error toast. Stage 2b (optional UX polish: explicit `captureLead()` calls in entry points to enable utm_* tracking, raw_payload audit, "merged" toast messaging) deferred to user direction.
  - Typecheck: lead-service.ts and admission.ts compile clean. Pre-existing `.next/dev/types/validator.ts` errors are unrelated build artefacts.

- **2026-04-27** — Admission CRM: lead deduplication with multi-source history (Stage 1 of 4)
  - New migration applied via Supabase MCP: `add_admission_lead_source_captures`
  - `01_tables.sql`: new table `admission_lead_source_captures` (16 cols, 5 indexes, RLS enabled). Append-only audit table — one row per source-channel capture event for a lead. Replaces "reject duplicate phone" semantic with "absorb as additional source capture" so a single lead can be captured by website + walk_in + edu_fair... and the detail page renders the full source timeline.
  - `01_tables.sql`: closed long-standing gap on legacy `admission_leads.duplicate_of` — added missing FK (`REFERENCES admission_leads(id) ON DELETE SET NULL`) and CHECK (`duplicate_of IS NULL OR duplicate_of <> id`). Verified pre-migration: 0 orphans, 0 self-refs.
  - `03_policies.sql`: 4 RLS policies on the captures table mirroring `admission_leads` shape (super_admin / admin / `admission.leads.{view,create,edit,delete}` + `role_has_institution_access`). SELECT additionally allows the assigned counselor branch via EXISTS subquery so counselors see captures for their assigned leads.
  - **Backfill**: 7,775 capture rows inserted (1:1 with existing leads), preserving original `source`, `source_detail`, `expo_event_id`, `captured_by`, `stall_id`, and `created_at` on each lead. Idempotent guard via `WHERE NOT EXISTS`. Source distribution: education_fair 6,735 / inbound_call 619 / referral 212 / walk_in 150 / website 56 / other 2 / social_media 1.
  - **Live-DB drift surfaced during MCP-first verification**: the partial unique index `uq_admission_leads_active_phone` documented in older migration files does NOT exist in production — only the non-unique `idx_admission_leads_phone`. This explains how 845 duplicate phones accumulated (~44% of distinct phones) despite the application-level 409 guard. Stage 2 (`captureLead()` service) will own dedup at the application layer with a transactional `SELECT ... FOR UPDATE` to close the race window.
  - **Decisions locked**: dedup key = `(institution_id, normalized_phone)` exact match (Decision A1); source history shape = dedicated table (B1); on-duplicate semantics = auto-absorb as new capture (C1); skip backfill of the 845 existing duplicate phones in this PR (D1) — leave for the existing `/data-quality/deduplication` page once its merge button is wired up (Stage 4 follow-up D3).
  - Stage 2/3/4 (service layer + UI panel + verification) pending user confirmation.

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

### Views (8 total)

| View Name                   | Location           | Module      |
| --------------------------- | ------------------ | ----------- |
| auto_generated_invoices     | setup/05_views.sql | Billing     |
| bill_invoice_relationships  | setup/05_views.sql | Billing     |
| v_bill_details              | setup/05_views.sql | Billing     |
| bug_reporters_leaderboard   | setup/05_views.sql | Bug Reports |
| bug_reports_with_details    | setup/05_views.sql | Bug Reports |
| semester_hierarchy_health   | setup/05_views.sql | Academic    |
| semester_program_audit_view | setup/05_views.sql | Academic    |
| hr_leave_types (compat)     | setup/05_views.sql | HR          |

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
