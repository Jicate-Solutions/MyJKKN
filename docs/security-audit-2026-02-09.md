# MyJKKN Security & Performance Audit Report

**Date:** 2026-02-09
**Database:** Staging (`hhprjbgknupaplivtoib`)
**Scope:** FST Tasks 2.1 (RLS Policy Audit) and 2.3 (Performance Advisories)
**Status:** AUDIT ONLY -- No changes made

---

## 1. Executive Summary

| Category | Count | Severity |
|----------|-------|----------|
| Tables with RLS disabled (sensitive data exposed) | **16** | CRITICAL |
| Tables with RLS enabled but NO policies (blocks all access) | **2** | HIGH |
| RLS policies that are always-true (no real restriction) | **40** | MEDIUM |
| Security definer views (bypass caller RLS) | **37** | HIGH |
| Functions with mutable search_path | **160** | MEDIUM |
| Materialized view exposed to API | **1** | LOW |
| Auth leaked password protection disabled | **1** | MEDIUM |
| Unindexed foreign keys | **198** | MEDIUM |
| Duplicate indexes (wasting storage) | **10** | LOW |
| Tables without primary key | **5** | LOW |
| Unused indexes | **803** | LOW |
| Multiple permissive policies (performance drag) | **788** | MEDIUM |
| Auth RLS InitPlan issues | **424** | MEDIUM |
| Auth DB connections cap | **1** | LOW |

**Total security lints:** 257
**Total performance lints:** 2,229

**Verdict:** The database has significant security gaps. 16 tables lack RLS entirely (including `students` and `admissions`), 2 tables have RLS enabled but zero policies (effectively locked), and 37 views use SECURITY DEFINER which bypasses the calling user's RLS permissions. These must be addressed before production use.

---

## 2. RLS Status -- All Public Tables (259 total)

### 2.1 RLS Disabled (16 tables) -- CRITICAL

These tables have **no row-level security at all**. Any authenticated user (or even anon if anon key is exposed) can read/write all data.

| Table | Contains Sensitive Data? | Priority |
|-------|------------------------|----------|
| `students` | YES -- student PII, enrollment data | P0 CRITICAL |
| `admissions` | YES -- admission records | P0 CRITICAL |
| `admission_counselors` | YES -- counselor PII | P1 HIGH |
| `learner_core_okrs` | YES -- learner OKR data | P1 HIGH |
| `learner_okr_assignments` | YES -- learner assignments | P1 HIGH |
| `okr_compliance_logs` | YES -- compliance audit trail | P1 HIGH |
| `okr_dependencies` | Moderate -- OKR linkages | P2 MEDIUM |
| `okr_risks` | Moderate -- risk assessments | P2 MEDIUM |
| `okr_tasks` | Moderate -- task assignments | P2 MEDIUM |
| `learner_application_sequences_by_code` | Low -- sequence tracking | P3 LOW |
| `timetable_slot_continuity` | Low -- scheduling data | P3 LOW |
| `learners_profiles_backup_20251223` | YES -- PII backup | P1 HIGH |
| `learners_profiles_backup_bpharm_sem8_active` | YES -- PII backup | P1 HIGH |
| `profiles_backup_bpharm_sem8_active` | YES -- PII backup | P1 HIGH |
| `student_attendance_backup_20251223` | YES -- attendance backup | P2 MEDIUM |
| `students_backup_20251223` | YES -- student PII backup | P1 HIGH |

### 2.2 RLS Enabled but NO Policies (2 tables) -- HIGH

These tables have RLS turned on but zero policies defined. This means **all access is blocked** for non-superuser roles (including authenticated users via the app).

| Table | Impact |
|-------|--------|
| `child_app_permissions` | Child app permission checks will fail silently |
| `user_child_app_permissions` | User-specific child app permissions inaccessible |

### 2.3 RLS Enabled WITH Policies (241 tables) -- OK (with caveats)

241 tables have both RLS enabled and at least one policy. However, **40 policies use always-true conditions** (see Section 3).

---

## 3. Always-True RLS Policies (40 instances)

These policies exist but provide no actual restriction -- they allow unrestricted access for the specified operation. While some are intentional (system/service-role INSERT policies), others represent security holes.

### 3.1 Intentional (System/Service Role) -- Acceptable

These are INSERT-only policies for system operations (logging, analytics). Generally acceptable if the service role is properly secured.

| Table | Policy | Operation |
|-------|--------|-----------|
| `admission_ai_insights` | Service role can insert insights | INSERT |
| `admission_campaign_logs` | System can insert campaign logs | INSERT |
| `ai_query_logs` | System can insert query logs | INSERT |
| `ai_query_rate_limits` | System can manage rate limits | ALL |
| `child_app_access_logs` | System can create access logs | INSERT |
| `child_app_sessions` | System can create sessions | INSERT |
| `child_app_sessions` | System can update sessions | UPDATE |
| `funnel_snapshots` | System can create/update snapshots | INSERT/UPDATE |
| `nps_analytics` | System can manage analytics | ALL |
| `parent_otp_requests` | Service role can manage OTP requests | ALL |
| `resource_usage_logs` | System can create usage logs | INSERT |
| `sh_audit_logs` | sh_audit_logs_insert | INSERT |
| `user_activity_logs` | System can insert activity logs | INSERT |
| `admission_sms_logs` | admission_sms_logs_service_role | ALL |

### 3.2 Problematic -- Should Be Restricted

These policies give **any authenticated user** unrestricted SELECT, UPDATE, or DELETE access with no institution scoping.

| Table | Policy | Operation | Risk |
|-------|--------|-----------|------|
| `billing_item_categories` | Users can view billing item categories | SELECT (true) | Any user sees all institutions' categories |
| `billing_parent_categories` | Users can view billing parent categories | SELECT (true) | Cross-institution data leak |
| `billing_sub_categories` | Users can view billing sub categories | SELECT (true) | Cross-institution data leak |
| `competency_catalog` | competency_catalog_select_authenticated | SELECT (true) | All competencies visible to all |
| `competency_catalog` | competency_catalog_update_authenticated | UPDATE (true) | Any user can modify any competency |
| `competency_catalog` | competency_catalog_delete_authenticated | DELETE (true) | Any user can delete any competency |
| `competency_program_mapping` | 6 policies with (true) | SELECT/UPDATE/DELETE | Full cross-institution access |
| `course_competency_mapping` | 6 policies with (true) | SELECT/UPDATE/DELETE | Full cross-institution access |
| `learner_competencies` | 6 policies with (true) | SELECT/UPDATE/DELETE | Learner data exposed cross-institution |
| `grievance_history` | grievance_history_insert | INSERT (true) | Any user can insert history entries |
| `hostel_allocation_requests` | hostel_requests_insert | INSERT (true) | Unrestricted hostel request creation |
| `hostel_complaints` | hostel_complaints_insert | INSERT (true) | Unrestricted complaint creation |
| `vac_courses` | vac_courses_all_authenticated | ALL (true) | Full unrestricted access |
| `vac_lessons` | vac_lessons_all_authenticated | ALL (true) | Full unrestricted access |

---

## 4. Security Definer Views (37 views) -- HIGH

These views run with the **creator's permissions** instead of the calling user's. This bypasses RLS for the calling user, potentially exposing data across institutions.

| View | Risk |
|------|------|
| `v_consultant_performance` | Consultant data visible regardless of caller's RLS |
| `billing_copq_summary` | Financial COPQ data exposed |
| `billing_copq_yearly_totals` | Financial data exposed |
| `maturity_dashboard_summary` | Maturity data cross-institution |
| `v_funnel_drop_off` | Admission funnel data leak |
| `v_okr_cascade` | OKR hierarchy data leak |
| `v_admission_funnel` | Admission data exposed |
| `v_stuck_leads` | Lead data exposed |
| `v_pending_escalations` | Escalation data exposed |
| `v_okr_reaction_counts` | OKR reaction data |
| `admission_process_metrics` | Admission metrics |
| `v_consultant_lead_pipeline` | Lead pipeline data |
| `v_pending_verifications` | Pending verification data |
| `hostel_room_availability` | Hostel data |
| `v_team_performance_summary` | Team performance data |
| `vac_enrollments_with_details` | Enrollment data |
| `v_payment_summary` | Payment data exposed |
| `v_counselor_leaderboard` | Counselor data |
| `semester_hierarchy_health` | Academic hierarchy |
| `whatsapp_message_stats` | Communication stats |
| `v_commission_liability` | Financial liability data |
| `v_counselor_performance_trends` | Counselor trends |
| `whatsapp_active_connections` | WhatsApp connection data |
| `lateral_entry_vacancy_summary` | Vacancy data |
| `v_okr_comment_counts` | OKR comment data |
| `v_application_summary` | Application data |
| `okr_abcd_analysis` | OKR analysis data |
| `v_team_okr_summary` | Team OKR data |
| `contact_phone_lookup` | PII -- phone numbers! |
| `semester_program_audit_view` | Academic audit data |
| `lateral_entry_applications_view` | Application data |
| `v_counselor_performance` | Counselor data |
| `hostel_occupancy_summary` | Hostel data |
| `hostel_active_allocations` | Hostel allocation data |
| `v_workflow_stats` | Workflow data |
| `v_funnel_analytics` | Funnel analytics |
| `v_source_performance` | Source performance |

**Remediation:** Convert all views to use `security_invoker = true` instead of SECURITY DEFINER.

---

## 5. Mutable Search Path Functions (160 functions) -- MEDIUM

All 160 public functions have mutable search_path, which makes them vulnerable to search_path injection attacks. An attacker could create objects in a schema that appears earlier in the search path to intercept function calls.

**Top affected function categories:**
- `ai_rpc_*` (12 functions) -- AI query functions
- `sh_*` (12 functions) -- Solution Hub functions
- `okr_*` (11 functions) -- OKR functions
- `update_*` (15 functions) -- Update trigger functions
- `get_*` (18 functions) -- Data retrieval functions
- `generate_*` (8 functions) -- ID generation functions
- Admission/billing/attendance functions (remainder)

**Remediation:** Add `SET search_path = public` to all function definitions.

---

## 6. Auth Configuration Issues

### 6.1 Leaked Password Protection (DISABLED)

Supabase Auth is NOT checking passwords against the HaveIBeenPwned database. Users can set compromised passwords.

**Remediation:** Enable leaked password protection in Supabase Dashboard > Authentication > Settings.

### 6.2 Materialized View Exposed

`public.activity_stats` is a materialized view selectable by anon and authenticated roles. If it contains aggregated sensitive data, it should be restricted.

---

## 7. Performance Issues

### 7.1 Unindexed Foreign Keys (198 total)

Foreign keys without covering indexes cause slow JOINs and cascading deletes. Here are the most impactful ones (tables with institution_id missing indexes, excluding backups and views):

| Table | Missing Index On |
|-------|-----------------|
| `admission_counselors` | institution_id |
| `admission_payments` | institution_id |
| `admission_tasks` | institution_id |
| `admission_workflows` | institution_id |
| `communication_channels` | institution_id |
| `communication_log` | institution_id |
| `counselor_daily_metrics` | institution_id |
| `counselor_targets` | institution_id |
| `distribution_rules` | institution_id |
| `escalation_log` | institution_id |
| `hostel_complaints` | institution_id |
| `hostel_fee_structure` | institution_id |
| `industry_projects` | institution_id |
| `interview_bookings` | institution_id |
| `learner_core_okrs` | institution_id |
| `offer_letters` | institution_id |
| `outcome_program_correlation` | institution_id |
| `rejection_feedback` | institution_id |
| `scholarship_applications` | institution_id |
| `scoring_rules` | institution_id |
| `screening_exams` | institution_id |
| `workflow_executions` | institution_id |

**Additional high-impact unindexed FKs (non-institution_id):**

| Table | Column | Impact |
|-------|--------|--------|
| `admission_applications` | reviewer_id, learner_profile_id | Slow application lookups |
| `hostel_allocations` | room_id, hostel_id, created_by, approved_by | Slow hostel queries |
| `hostel_complaints` | assigned_to, room_id, resolved_by, reported_by, allocation_id | Slow complaint resolution |
| `escalation_log` | acknowledged_by, resolved_by, escalated_from, rule_id | Slow escalation lookups |
| `okr_tasks` | key_result_id, objective_id, responsible_id, accountable_id | Slow OKR queries |
| `okr_kr_updates` | updated_by, key_result_id, check_in_id | Slow KR update lookups |
| `okr_milestones` | user_id, key_result_id, objective_id | Slow milestone queries |
| `learners_profiles` | updated_by, created_by | Slow profile audit queries |
| `lateral_entry_applications` | student_id, reviewed_by, admission_id | Slow lateral entry queries |
| `lti_launches` | semester_id, academic_year_id, created_by, program_id, section_id | Slow LTI queries |
| `sh_payments` | created_by, mou_id, split_model_id | Slow payment queries |

### 7.2 Duplicate Indexes (10 pairs)

Each pair wastes storage and slows writes. Drop one from each pair.

| Table | Duplicate Indexes | Keep | Drop |
|-------|-------------------|------|------|
| `admission_daily_briefings` | idx_daily_briefings_user, idx_daily_briefings_user_briefing_date | idx_daily_briefings_user_briefing_date | idx_daily_briefings_user |
| `admission_lead_scores` | idx_lead_scores_total, idx_lead_scores_total_score | idx_lead_scores_total_score | idx_lead_scores_total |
| `applications` | applications_name_key, applications_name_unique | applications_name_key | applications_name_unique |
| `billing_student_bills` | idx_billing_bills_student_id, idx_billing_student_bills_student_id | idx_billing_student_bills_student_id | idx_billing_bills_student_id |
| `degrees` | idx_degrees_institution, idx_degrees_institution_id | idx_degrees_institution_id | idx_degrees_institution |
| `departments` | departments_institution_id_idx, idx_departments_institution | departments_institution_id_idx | idx_departments_institution |
| `programs` | idx_programs_institution, programs_institution_id_idx | programs_institution_id_idx | idx_programs_institution |
| `staff` | idx_staff_auth_user, idx_staff_auth_user_id | idx_staff_auth_user_id | idx_staff_auth_user |
| `students` | idx_students_institution, idx_students_institution_id | idx_students_institution_id | idx_students_institution |
| `user_institution_access` | uk_user_institution_access_user_institution, unique_user_institution_access | unique_user_institution_access | uk_user_institution_access_user_institution |

### 7.3 Tables Without Primary Key (5 tables)

All are backup tables -- not operationally critical but poor practice.

| Table |
|-------|
| `students_backup_20251223` |
| `profiles_backup_bpharm_sem8_active` |
| `learners_profiles_backup_bpharm_sem8_active` |
| `student_attendance_backup_20251223` |
| `learners_profiles_backup_20251223` |

### 7.4 Multiple Permissive Policies (788 instances)

Many tables have overlapping permissive policies that Postgres must evaluate with OR logic. This adds overhead to every query. The worst offenders (from the competency/mapping tables) have 6-8 overlapping policies per table.

### 7.5 Unused Indexes (803 instances)

803 indexes exist but have not been used. While some may be needed for rare queries, the majority are likely dead weight. A full analysis should be done before dropping any, as usage stats reset on server restart.

### 7.6 Auth RLS InitPlan Issues (424 instances)

424 RLS policies reference `auth.uid()` or `auth.jwt()` in a way that creates InitPlan nodes in the query plan, executing the auth function call for every row instead of once per query. This significantly impacts query performance.

### 7.7 Auth DB Connections Cap

Auth server is capped at 10 connections. Increasing instance size alone will not improve Auth performance without adjusting this setting.

---

## 8. Remediation SQL

### 8.1 Enable RLS on Critical Tables (P0)

```sql
-- P0: CRITICAL -- student and admission data
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admissions ENABLE ROW LEVEL SECURITY;

-- P1: HIGH -- counselor, OKR, and backup tables with PII
ALTER TABLE public.admission_counselors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_core_okrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_okr_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_compliance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learners_profiles_backup_20251223 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learners_profiles_backup_bpharm_sem8_active ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles_backup_bpharm_sem8_active ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students_backup_20251223 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_attendance_backup_20251223 ENABLE ROW LEVEL SECURITY;

-- P2: MEDIUM
ALTER TABLE public.learner_application_sequences_by_code ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_slot_continuity ENABLE ROW LEVEL SECURITY;
```

### 8.2 Create Policies for Tables That Need Them

```sql
-- students: institution-scoped access
CREATE POLICY "students_select_institution"
  ON public.students FOR SELECT
  USING (
    institution_id IN (
      SELECT uia.institution_id FROM public.user_institution_access uia
      WHERE uia.user_id = auth.uid()
    )
  );

CREATE POLICY "students_insert_institution"
  ON public.students FOR INSERT
  WITH CHECK (
    institution_id IN (
      SELECT uia.institution_id FROM public.user_institution_access uia
      WHERE uia.user_id = auth.uid()
    )
  );

CREATE POLICY "students_update_institution"
  ON public.students FOR UPDATE
  USING (
    institution_id IN (
      SELECT uia.institution_id FROM public.user_institution_access uia
      WHERE uia.user_id = auth.uid()
    )
  );

CREATE POLICY "students_delete_institution"
  ON public.students FOR DELETE
  USING (
    institution_id IN (
      SELECT uia.institution_id FROM public.user_institution_access uia
      WHERE uia.user_id = auth.uid()
    )
  );

-- admissions: institution-scoped access
CREATE POLICY "admissions_select_institution"
  ON public.admissions FOR SELECT
  USING (
    institution_id IN (
      SELECT uia.institution_id FROM public.user_institution_access uia
      WHERE uia.user_id = auth.uid()
    )
  );

CREATE POLICY "admissions_insert_institution"
  ON public.admissions FOR INSERT
  WITH CHECK (
    institution_id IN (
      SELECT uia.institution_id FROM public.user_institution_access uia
      WHERE uia.user_id = auth.uid()
    )
  );

CREATE POLICY "admissions_update_institution"
  ON public.admissions FOR UPDATE
  USING (
    institution_id IN (
      SELECT uia.institution_id FROM public.user_institution_access uia
      WHERE uia.user_id = auth.uid()
    )
  );

-- admission_counselors: institution-scoped
CREATE POLICY "admission_counselors_select_institution"
  ON public.admission_counselors FOR SELECT
  USING (
    institution_id IN (
      SELECT uia.institution_id FROM public.user_institution_access uia
      WHERE uia.user_id = auth.uid()
    )
  );

-- OKR tables: institution-scoped
CREATE POLICY "learner_core_okrs_select_institution"
  ON public.learner_core_okrs FOR SELECT
  USING (
    institution_id IN (
      SELECT uia.institution_id FROM public.user_institution_access uia
      WHERE uia.user_id = auth.uid()
    )
  );

CREATE POLICY "learner_core_okrs_all_institution"
  ON public.learner_core_okrs FOR ALL
  USING (
    institution_id IN (
      SELECT uia.institution_id FROM public.user_institution_access uia
      WHERE uia.user_id = auth.uid()
    )
  );

-- For OKR tables without institution_id, scope via objective owner
CREATE POLICY "okr_tasks_select_via_objective"
  ON public.okr_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.okr_objectives o
      WHERE o.id = okr_tasks.objective_id
        AND o.institution_id IN (
          SELECT uia.institution_id FROM public.user_institution_access uia
          WHERE uia.user_id = auth.uid()
        )
    )
  );

CREATE POLICY "okr_risks_select_via_objective"
  ON public.okr_risks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.okr_objectives o
      WHERE o.id = okr_risks.objective_id
        AND o.institution_id IN (
          SELECT uia.institution_id FROM public.user_institution_access uia
          WHERE uia.user_id = auth.uid()
        )
    )
  );

CREATE POLICY "okr_dependencies_select_via_objective"
  ON public.okr_dependencies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.okr_objectives o
      WHERE o.id = okr_dependencies.objective_id
        AND o.institution_id IN (
          SELECT uia.institution_id FROM public.user_institution_access uia
          WHERE uia.user_id = auth.uid()
        )
    )
  );

-- Backup tables: restrict to service role only (no direct user access)
CREATE POLICY "backup_tables_service_role_only"
  ON public.learners_profiles_backup_20251223 FOR ALL
  USING (false);

CREATE POLICY "backup_tables_service_role_only"
  ON public.learners_profiles_backup_bpharm_sem8_active FOR ALL
  USING (false);

CREATE POLICY "backup_tables_service_role_only"
  ON public.profiles_backup_bpharm_sem8_active FOR ALL
  USING (false);

CREATE POLICY "backup_tables_service_role_only"
  ON public.student_attendance_backup_20251223 FOR ALL
  USING (false);

CREATE POLICY "backup_tables_service_role_only"
  ON public.students_backup_20251223 FOR ALL
  USING (false);

-- child_app_permissions: needs policies added
CREATE POLICY "child_app_permissions_select_authenticated"
  ON public.child_app_permissions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "child_app_permissions_manage_admin"
  ON public.child_app_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_institution_access uia
      WHERE uia.user_id = auth.uid()
        AND uia.role IN ('super_admin', 'admin')
    )
  );

-- user_child_app_permissions: needs policies added
CREATE POLICY "user_child_app_permissions_select_own"
  ON public.user_child_app_permissions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "user_child_app_permissions_manage_admin"
  ON public.user_child_app_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_institution_access uia
      WHERE uia.user_id = auth.uid()
        AND uia.role IN ('super_admin', 'admin')
    )
  );
```

### 8.3 Fix Security Definer Views

```sql
-- Convert all security definer views to security invoker
-- Example pattern (repeat for all 37 views):

ALTER VIEW public.v_consultant_performance SET (security_invoker = true);
ALTER VIEW public.billing_copq_summary SET (security_invoker = true);
ALTER VIEW public.billing_copq_yearly_totals SET (security_invoker = true);
ALTER VIEW public.maturity_dashboard_summary SET (security_invoker = true);
ALTER VIEW public.v_funnel_drop_off SET (security_invoker = true);
ALTER VIEW public.v_okr_cascade SET (security_invoker = true);
ALTER VIEW public.v_admission_funnel SET (security_invoker = true);
ALTER VIEW public.v_stuck_leads SET (security_invoker = true);
ALTER VIEW public.v_pending_escalations SET (security_invoker = true);
ALTER VIEW public.v_okr_reaction_counts SET (security_invoker = true);
ALTER VIEW public.admission_process_metrics SET (security_invoker = true);
ALTER VIEW public.v_consultant_lead_pipeline SET (security_invoker = true);
ALTER VIEW public.v_pending_verifications SET (security_invoker = true);
ALTER VIEW public.hostel_room_availability SET (security_invoker = true);
ALTER VIEW public.v_team_performance_summary SET (security_invoker = true);
ALTER VIEW public.vac_enrollments_with_details SET (security_invoker = true);
ALTER VIEW public.v_payment_summary SET (security_invoker = true);
ALTER VIEW public.v_counselor_leaderboard SET (security_invoker = true);
ALTER VIEW public.semester_hierarchy_health SET (security_invoker = true);
ALTER VIEW public.whatsapp_message_stats SET (security_invoker = true);
ALTER VIEW public.v_commission_liability SET (security_invoker = true);
ALTER VIEW public.v_counselor_performance_trends SET (security_invoker = true);
ALTER VIEW public.whatsapp_active_connections SET (security_invoker = true);
ALTER VIEW public.lateral_entry_vacancy_summary SET (security_invoker = true);
ALTER VIEW public.v_okr_comment_counts SET (security_invoker = true);
ALTER VIEW public.v_application_summary SET (security_invoker = true);
ALTER VIEW public.okr_abcd_analysis SET (security_invoker = true);
ALTER VIEW public.v_team_okr_summary SET (security_invoker = true);
ALTER VIEW public.contact_phone_lookup SET (security_invoker = true);
ALTER VIEW public.semester_program_audit_view SET (security_invoker = true);
ALTER VIEW public.lateral_entry_applications_view SET (security_invoker = true);
ALTER VIEW public.v_counselor_performance SET (security_invoker = true);
ALTER VIEW public.hostel_occupancy_summary SET (security_invoker = true);
ALTER VIEW public.hostel_active_allocations SET (security_invoker = true);
ALTER VIEW public.v_workflow_stats SET (security_invoker = true);
ALTER VIEW public.v_funnel_analytics SET (security_invoker = true);
ALTER VIEW public.v_source_performance SET (security_invoker = true);
```

### 8.4 Create Missing Indexes on institution_id

```sql
-- High-priority tables with institution_id but no index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_payments_institution_id
  ON public.admission_payments(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_tasks_institution_id
  ON public.admission_tasks(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_workflows_institution_id
  ON public.admission_workflows(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_communication_channels_institution_id
  ON public.communication_channels(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_communication_log_institution_id
  ON public.communication_log(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_counselor_daily_metrics_institution_id
  ON public.counselor_daily_metrics(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_counselor_targets_institution_id
  ON public.counselor_targets(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_distribution_rules_institution_id
  ON public.distribution_rules(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_escalation_log_institution_id
  ON public.escalation_log(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_complaints_institution_id
  ON public.hostel_complaints(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_fee_structure_institution_id
  ON public.hostel_fee_structure(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_industry_projects_institution_id
  ON public.industry_projects(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interview_bookings_institution_id
  ON public.interview_bookings(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_learner_core_okrs_institution_id
  ON public.learner_core_okrs(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_offer_letters_institution_id
  ON public.offer_letters(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_outcome_program_correlation_institution_id
  ON public.outcome_program_correlation(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rejection_feedback_institution_id
  ON public.rejection_feedback(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scholarship_applications_institution_id
  ON public.scholarship_applications(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scoring_rules_institution_id
  ON public.scoring_rules(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_screening_exams_institution_id
  ON public.screening_exams(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_executions_institution_id
  ON public.workflow_executions(institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_counselors_institution_id
  ON public.admission_counselors(institution_id);
```

### 8.5 Drop Duplicate Indexes

```sql
-- Drop the duplicate from each pair (keep the more descriptive name)
DROP INDEX CONCURRENTLY IF EXISTS idx_daily_briefings_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_lead_scores_total;
DROP INDEX CONCURRENTLY IF EXISTS applications_name_unique;
DROP INDEX CONCURRENTLY IF EXISTS idx_billing_bills_student_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_degrees_institution;
DROP INDEX CONCURRENTLY IF EXISTS idx_departments_institution;
DROP INDEX CONCURRENTLY IF EXISTS idx_programs_institution;
DROP INDEX CONCURRENTLY IF EXISTS idx_staff_auth_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_students_institution;
DROP INDEX CONCURRENTLY IF EXISTS uk_user_institution_access_user_institution;
```

---

## 9. Prioritized Recommendations

### P0 -- CRITICAL (Do Immediately)

1. **Enable RLS on `students` and `admissions`** -- These contain core student PII and admission data. Without RLS, any authenticated user can read/modify all records across all institutions.
2. **Add policies to `child_app_permissions` and `user_child_app_permissions`** -- These tables are currently locked out entirely due to RLS with no policies.
3. **Enable leaked password protection** -- One setting toggle in Supabase Dashboard.

### P1 -- HIGH (Do This Week)

4. **Enable RLS on all remaining 14 disabled tables** and add institution-scoped policies.
5. **Convert all 37 SECURITY DEFINER views** to `security_invoker = true` -- This is the biggest RLS bypass vector.
6. **Fix always-true policies** on competency, learner_competencies, vac_courses, and vac_lessons tables -- Add proper institution scoping.
7. **Drop backup tables or restrict them** -- Backup tables with PII should not be in the public schema. Move to a restricted schema or drop if no longer needed.

### P2 -- MEDIUM (Do This Sprint)

8. **Create missing indexes on institution_id** (22 tables) -- Every multi-tenant query is scanning full tables.
9. **Fix mutable search_path** on all 160 functions -- Add `SET search_path = public`.
10. **Consolidate duplicate permissive policies** -- Reduce from multiple overlapping policies to single, well-defined policies per table.

### P3 -- LOW (Backlog)

11. **Drop 10 duplicate indexes** -- Minor storage savings.
12. **Review and potentially drop 803 unused indexes** -- Requires production usage stats analysis first.
13. **Address 424 auth_rls_initplan issues** -- Optimize RLS policy expressions to avoid InitPlan overhead.
14. **Increase Auth DB connection limit** -- Currently capped at 10; adjust based on instance size.
15. **Clean up or archive 5 backup tables** without primary keys.

---

## 10. Supabase Advisory Links

- RLS Disabled: https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public
- RLS Enabled No Policy: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Security Definer View: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view
- Mutable Search Path: https://supabase.com/docs/guides/database/database-linter?lint=0014_function_search_path_mutable
- Unindexed Foreign Keys: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- Duplicate Index: https://supabase.com/docs/guides/database/database-linter?lint=0002_duplicate_index
- Multiple Permissive Policies: https://supabase.com/docs/guides/database/database-linter?lint=0015_multiple_permissive_policies
- Auth RLS InitPlan: https://supabase.com/docs/guides/database/database-linter?lint=0016_auth_rls_initplan

---

*Report generated by security audit on 2026-02-09. No changes were made to the database.*
