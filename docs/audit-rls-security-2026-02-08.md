# MyJKKN RLS Security Audit Report

**Date:** 2026-02-08
**Environment:** Staging (project: `hhprjbgknupaplivtoib`)
**Auditor:** Automated via Supabase MCP + SQL inspection
**Scope:** All public schema tables - Row Level Security status, policies, and Supabase security advisories

---

## Executive Summary

| Metric | Count |
|--------|-------|
| Total public tables | 232 |
| Tables with RLS enabled + policies | 214 |
| Tables with RLS enabled but NO policies | 2 |
| Tables with RLS disabled | 16 |
| Security advisories (ERROR) | 53 |
| Security advisories (WARN) | 203 |
| Security advisories (INFO) | 2 |
| Total advisories | 258 |

**Overall Risk Level: MEDIUM-HIGH** -- 16 tables lack RLS entirely (including `students` which holds PII), 37 views use SECURITY DEFINER, and 40 policies use overly permissive `true` expressions.

---

## Section 1: Tables with RLS Enabled + Policies (214 tables)

These tables have RLS enabled and at least one policy defined. This is the correct state.

| Table | Policy Count | Policies |
|-------|-------------|----------|
| academic_years | 4 | Users can create/delete/update academic years with permission; academic_years_select_optimized |
| admission_ai_insights | 5 | Service role can insert insights; Users can manage/update/view institution insights |
| admission_applications | 2 | Institution staff can manage applications; Leads can view own applications |
| admission_assignment_rules | 2 | Users can manage/view institution assignment rules |
| admission_campaign_logs | 2 | System can insert campaign logs; Users can view campaign logs |
| admission_campaign_queue | 2 | Users can manage/view campaign queue |
| admission_communication_templates | 2 | Users can manage/view institution templates |
| admission_daily_briefings | 6 | Managers can view; Service role can manage; Users can update/view own briefings |
| admission_drip_execution_logs | 2 | Users can insert/view execution logs |
| admission_drip_schedule | 4 | Users can delete/insert/update/view drip schedule |
| admission_drip_sequences | 4 | Users can delete/insert/update/view drip sequences |
| admission_lead_activities | 2 | Staff can create; Users can view activities |
| admission_lead_scores | 4 | Users can manage/view lead scores |
| admission_lead_stage_history | 2 | Staff can insert; Users can view stage history |
| admission_leads | 3 | Staff/consultants can insert; Staff can update; Users can view leads |
| admission_payments | 1 | View via application access |
| admission_scoring_rules | 2 | Users can manage/view institution scoring rules |
| admission_sms_logs | 2 | Institution access; Service role |
| admission_tasks | 3 | Users can insert/update/view tasks |
| admission_whatsapp_logs | 4 | Service role full access; Users can create/update/view logs |
| admission_workflow_configs | 1 | Institution members can manage workflow configs |
| admission_workflows | 2 | Users can manage/view institution workflows |
| ai_query_logs | 3 | Super admins can view all; System can insert; Users can view own logs |
| ai_query_rate_limits | 2 | System can manage; Users can view own rate limits |
| alumni_outcomes | 1 | Allow all for authenticated |
| api_keys | 5 | Administrators can create/delete/update/view; Public can verify |
| application_documents | 2 | Staff can manage; View via application access |
| applications | 4 | Enable delete/insert/read/update for authenticated admins/users |
| batches | 4 | batches_delete/insert/select/update |
| billing_copq_incidents | 4 | billing_copq CRUD policies |
| billing_discounts | 5 | Accounts users can CRUD; Users can manage |
| billing_invoice_items | 1 | Users can manage billing invoice items |
| billing_invoices | 13 | Accounts/Admin/Faculty can CRUD; Students can view own |
| billing_item_categories | 4 | Authenticated users can CRUD |
| billing_parent_categories | 4 | Authenticated users can CRUD |
| billing_receipt_items | 1 | Users can manage billing receipt items |
| billing_receipts | 13 | Accounts/Admin/Faculty can CRUD; Students can view own |
| billing_refunds | 5 | Accounts users can CRUD; Users can manage |
| billing_student_bills | 13 | Accounts/Admin/Faculty can CRUD; Students can view own |
| billing_sub_categories | 4 | Authenticated users can CRUD |
| bug_report_message_reads | 6 | Admin/own/participant policies |
| bug_report_messages | 3 | Users can edit own/send/view messages |
| bug_report_participants | 3 | Admins can manage; Users can add/view |
| bug_reports | 4 | Admins can manage all; Users can create/update own |
| categories | 4 | Enable CRUD for authenticated admins/users |
| child_app_access_logs | 2 | Admins can view; System can create |
| child_app_auth_codes | 1 | Service role only |
| child_app_sessions | 3 | System can create/update; Users can view own |
| communication_channels | 2 | Admins can manage; Users can view |
| communication_log | 2 | Users can insert/view |
| competency_catalog | 8 | Full CRUD for authenticated |
| competency_program_mapping | 8 | Full CRUD for authenticated |
| consultant_commission_structures | 2 | Manage/View policies |
| consultant_commission_transactions | 2 | Manage/View policies |
| consultant_communications | 2 | Manage/View policies |
| consultant_documents | 2 | Manage/View policies |
| consultant_lead_attributions | 2 | Manage/View policies |
| consultant_payment_queries | 2 | Manage/View policies |
| consultant_payout_batches | 2 | Manage/View policies |
| counselor_activities | 2 | Insert/Select policies |
| counselor_daily_metrics | 1 | Select policy |
| counselor_metrics_daily | 1 | Counselors can view own metrics |
| counselor_targets | 2 | Manage/Select policies |
| course_competency_mapping | 8 | Full CRUD for authenticated |
| course_mappings | 7 | API key access; admin/institution policies |
| courses | 6 | Admin/API access policies |
| custom_roles | 3 | Authenticated users can read; super_admin can manage |
| dashboard_configurations | 4 | Users can CRUD own configurations |
| dashboard_widget_types | 1 | Authenticated users can view |
| dashboard_widgets | 4 | Users can CRUD own widgets |
| degrees | 3 | Admin/API access |
| departments | 3 | API key access; admin/select policies |
| distribution_rules | 2 | Admins can manage; Users can view |
| document_types | 2 | Admins can manage; Public can view |
| education_consultants | 2 | Users can manage/view in institution |
| employment_categories | 4 | Enhanced CRUD access |
| escalation_log | 1 | Counselors can view own |
| escalation_rules | 2 | Admins can manage; Institution can view |
| facilitator_development | 1 | Allow all for authenticated |
| facilitator_industry_immersion | 1 | Allow all for authenticated |
| funnel_alert_thresholds | 2 | Admins can manage; Users can view |
| funnel_snapshots | 4 | Institution can view; System can create/update |
| grievance_categories | 3 | Admin/public/staff select policies |
| grievance_comments | 3 | Insert/public/staff select policies |
| grievance_history | 3 | Insert/raiser/staff select policies |
| grievance_tickets | 7 | Assigned/own/raiser/staff CRUD policies |
| hostel_allocation_requests | 3 | Insert/read/update policies |
| hostel_allocations | 2 | Read/write policies |
| hostel_attendance | 2 | Read/write policies |
| hostel_beds | 2 | Read/write policies |
| hostel_complaints | 3 | Insert/read/update policies |
| hostel_fee_structure | 2 | Read/write policies |
| hostel_floors | 2 | Read/write policies |
| hostel_rooms | 2 | Read/write policies |
| hostel_wardens | 2 | Read/write policies |
| hostels | 2 | Read/write policies |
| industry_mentors | 4 | Full CRUD |
| industry_partners | 4 | Full CRUD |
| industry_projects | 4 | Full CRUD |
| institution_leaves | 4 | Full CRUD policies |
| institution_seat_config | 1 | Institution members can manage |
| institutions | 8 | API key/admin policies; institution select |
| interview_bookings | 2 | Applicants can view own; Staff can manage |
| interview_slots | 2 | Public can view available; Staff can manage |
| lateral_entry_applications | 3 | Staff can insert/update; Users can view |
| lateral_entry_documents | 2 | Staff can manage; Users can view |
| lateral_entry_eligibility_rules | 2 | Staff can manage; Users can view |
| lateral_entry_vacancies | 2 | Staff can manage; Users can view |
| lead_activity_log | 2 | Users can insert/view activity |
| lead_sources | 1 | Users can view lead sources |
| lead_stage_history | 2 | Counselors can create; Users can view |
| learner_competencies | 8 | Full CRUD for authenticated |
| learner_elective_okrs | 1 | Learners can manage own elective OKRs |
| learner_industry_engagements | 4 | Full CRUD |
| learners_profiles | 6 | CRUD policies; Students can update/view own |
| learning_path_steps | 1 | Allow all for authenticated |
| learning_paths | 1 | Allow all for authenticated |
| leave_approval_chains | 4 | Full CRUD policies |
| leave_approvals | 3 | Insert/select/update policies |
| leave_types | 4 | Full CRUD policies |
| lti_grades | 2 | Institution-based; Users see own |
| lti_launches | 2 | Institution-based; Users see own |
| lti_tools | 2 | Admins manage; Users view active |
| maturity_assessments | 4 | Admins can delete; Staff can create/update; Users can view |
| maturity_evidence | 3 | Admins can delete; Staff can add; Users can view |
| maturity_frameworks | 4 | Admins can create/update/delete; Users can view |
| maturity_progress | 4 | Admins can delete; Staff can create/update; Users can view |
| merit_lists | 2 | Published are public; Staff can manage |
| message_templates | 2 | Admins can manage; Users can view |
| migration_log | 1 | service_role_only |
| mv_student_billing_summary | 2 | Admin/Faculty can view |
| notifications | 2 | Super admins can manage; Users with permissions can view |
| nps_analytics | 2 | Staff can view; System can manage |
| nps_responses | 2 | Anyone can submit; Staff can view |
| nps_survey_schedule | 1 | Institution members can manage |
| nps_surveys | 4 | Admins can delete; Staff can create/update; Users can view |
| offer_letters | 1 | View via application access |
| okr_attachments | 3 | Uploaders can delete; Users can upload/view |
| okr_check_ins | 3 | Users can create/update/view own |
| okr_comments | 4 | Authors can delete/update; Users can create/view |
| okr_key_results | 5 | Objective owners can CRUD; Users can view |
| okr_kr_updates | 2 | Users can create/view |
| okr_milestones | 2 | System can create; Users can view |
| okr_objectives | 7 | Authorized users can create; Institution users can update; Owners can CRUD |
| okr_reactions | 3 | Users can add/remove/view |
| okr_user_status | 2 | System can manage; Users can view own |
| outcome_program_correlation | 1 | Allow all for authenticated |
| parent_activity_log | 3 | Institution staff can view; Parents can insert/view own |
| parent_communications | 3 | Institution staff can manage; Parents can update/view own |
| parent_learner_links | 2 | Institution staff can manage; Parents can view own |
| parent_otp_requests | 1 | Service role can manage |
| parent_portal_access | 1 | Allow all for authenticated |
| parent_profiles | 4 | Institution staff can manage/view; Parents can update/view own |
| parent_sessions | 1 | Select own |
| payment_transaction_items | 2 | Insert/select policies |
| payment_transactions | 3 | Insert/select/update policies |
| periods | 8 | Enhanced CRUD; admin/institution policies |
| process_audits | 2 | Admins can manage; Users can view |
| process_definitions | 2 | Admins can manage; Users can view |
| process_instances | 3 | Users can create/update/view |
| profiles | 7 | CRUD policies; service role bypass |
| programs | 4 | API key access; admin/optimized select |
| push_subscriptions | 1 | Users can manage own |
| re_engagement_campaigns | 2 | Admins can manage; Institution can view |
| referral_reward_configs | 2 | Manage/View policies |
| referral_rewards | 2 | Manage/View policies |
| registered_child_apps | 3 | Admins can view; Super admins can create/update |
| regulations | 4 | Admin CRUD; institution select |
| rejection_feedback | 1 | Staff can view |
| resource_approvals | 2 | Approvers can update/view |
| resource_attribute_definitions | 4 | Users can CRUD |
| resource_maintenance_logs | 4 | CRUD policies |
| resource_maintenance_schedules | 4 | CRUD policies |
| resource_parent_categories | 5 | Everyone can view; Users can CRUD |
| resource_reservations | 8 | Staff/users CRUD policies |
| resource_sub_categories | 4 | Users can CRUD |
| resource_usage_logs | 6 | Staff/System/Users CRUD policies |
| resources | 6 | Enhanced management/view; admin CRUD |
| scholarship_applications | 1 | View via application access |
| scholarships | 2 | Admins can manage; Public can view active |
| scoring_rules | 2 | Admins can manage; Anyone can view |
| screening_exams | 1 | View via application access |
| sections | 7 | API key access; admin CRUD; institution/optimized select |
| semesters | 3 | API key access; admin/optimized select |
| sh_* (30 tables) | 4 each | Full CRUD for authenticated (Solutions Hub tables) |
| sla_configurations | 1 | Institution members can view |
| staff | 5 | Admin CRUD; institution select; service role full access |
| staff_plan_courses | 8 | Admin/Faculty/HOD CRUD; optimized select |
| staff_plans | 9 | Admin/Faculty/HOD CRUD; optimized select |
| student_attendance | 9 | Comprehensive role-based access; admin/student CRUD |
| subcategories | 4 | Admin CRUD; all users read |
| timetables | 9 | Super Admin full access; permission-based CRUD |
| user_activity_logs | 3 | Access policy; System insert; institution select |
| user_app_favorites | 4 | Users can CRUD own favorites |
| user_institution_access | 2 | service_role full access; users view own |
| user_notifications | 3 | Super admins can manage; Users can update/view own |
| user_roles | 5 | Admins can CRUD; Users can view own |
| vac_courses | 2 | Authenticated all; select active |
| vac_enrollments | 4 | Authenticated all; own CRUD |
| vac_learner_progress | 3 | Own insert/select/update |
| vac_lessons | 2 | Authenticated all; select published |
| waste_incidents | 3 | Users can report/update/view for institution |
| webhook_logs | 1 | service_role_only |
| whatsapp_connections | 2 | Manage/select |
| whatsapp_message_logs | 5 | Admin/insert/own/update policies |
| whatsapp_settings | 2 | Manage/select |
| whatsapp_shared_access | 4 | Admin/own manage/select |
| whatsapp_templates | 2 | Manage/select |
| workflow_executions | 1 | Institution members can view |
| workflow_step_logs | 1 | View via execution access |
| workflows | 2 | Admins can manage; Institution members can view |

---

## Section 2: Tables with RLS Enabled but NO Policies (Security Hole)

When RLS is enabled but no policies exist, the default behavior is **DENY ALL** -- meaning no user (except service_role/postgres superuser) can read or write data. This effectively makes these tables inaccessible from the application.

| Table | Risk | Impact |
|-------|------|--------|
| `child_app_permissions` | Medium | Child app permission definitions may be unreadable from client |
| `user_child_app_permissions` | Medium | User-specific child app permissions may be unreadable from client |

### Remediation SQL

```sql
-- Option A: If these tables should be readable by authenticated users
-- and manageable by admins

-- child_app_permissions
CREATE POLICY "Authenticated users can view child app permissions"
  ON public.child_app_permissions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage child app permissions"
  ON public.child_app_permissions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      WHERE uia.user_id = auth.uid()
      AND uia.role IN ('super_admin', 'admin')
    )
  );

-- user_child_app_permissions
CREATE POLICY "Users can view own child app permissions"
  ON public.user_child_app_permissions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage user child app permissions"
  ON public.user_child_app_permissions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      WHERE uia.user_id = auth.uid()
      AND uia.role IN ('super_admin', 'admin')
    )
  );

-- Option B: If these tables are only accessed via service_role (server-side)
-- and the RLS-enabled-no-policy state is intentional, document this decision.
-- No SQL changes needed, but add a comment:
COMMENT ON TABLE public.child_app_permissions IS 'RLS enabled, no policies - accessed only via service_role';
COMMENT ON TABLE public.user_child_app_permissions IS 'RLS enabled, no policies - accessed only via service_role';
```

---

## Section 3: Tables with RLS Disabled (CRITICAL)

These 16 tables have RLS completely disabled, meaning **any authenticated user can read/write all data** in these tables via the Supabase client (PostgREST API).

### Critical Tables (contain user data or sensitive information)

| Table | Rows | Size | Data Sensitivity | Risk |
|-------|------|------|-----------------|------|
| **`students`** | 4 | 96 kB | **PII** (name, email, phone, DOB, gender) | **CRITICAL** |
| **`admissions`** | 0 | 40 kB | Application data | **HIGH** |
| **`admission_counselors`** | 5 | 48 kB | Staff names, emails | **HIGH** |

### OKR Module Tables (no RLS)

| Table | Rows | Size | Risk |
|-------|------|------|------|
| `okr_dependencies` | 0 | 16 kB | MEDIUM |
| `okr_tasks` | 14 | 32 kB | MEDIUM |
| `okr_risks` | 0 | 16 kB | MEDIUM |
| `okr_compliance_logs` | 20 | 64 kB | MEDIUM |
| `learner_core_okrs` | 0 | 16 kB | MEDIUM |
| `learner_okr_assignments` | 0 | 40 kB | MEDIUM |

### Other Tables (no RLS)

| Table | Rows | Size | Risk |
|-------|------|------|------|
| `learner_application_sequences_by_code` | 1 | 32 kB | LOW |
| `timetable_slot_continuity` | 0 | 16 kB | LOW |

### Backup Tables (no RLS, should be dropped or restricted)

| Table | Rows | Size | Risk |
|-------|------|------|------|
| `learners_profiles_backup_20251223` | 0 | 8 kB | **HIGH** (PII backups) |
| `learners_profiles_backup_bpharm_sem8_active` | 0 | 8 kB | **HIGH** (PII backups) |
| `profiles_backup_bpharm_sem8_active` | 0 | 8 kB | **HIGH** (PII backups) |
| `student_attendance_backup_20251223` | 0 | 8 kB | MEDIUM |
| `students_backup_20251223` | 0 | 8 kB | **HIGH** (PII backups) |

### Remediation SQL

```sql
-- ============================================================
-- CRITICAL: Enable RLS on students table
-- ============================================================
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students_select_by_institution"
  ON public.students
  FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT uia.institution_id FROM user_institution_access uia
      WHERE uia.user_id = auth.uid()
    )
  );

CREATE POLICY "students_insert_by_admin"
  ON public.students
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      WHERE uia.user_id = auth.uid()
      AND uia.institution_id = institution_id
      AND uia.role IN ('super_admin', 'admin', 'admission_head')
    )
  );

CREATE POLICY "students_update_by_admin"
  ON public.students
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      WHERE uia.user_id = auth.uid()
      AND uia.institution_id = institution_id
      AND uia.role IN ('super_admin', 'admin', 'admission_head')
    )
  );

CREATE POLICY "students_delete_by_admin"
  ON public.students
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      WHERE uia.user_id = auth.uid()
      AND uia.institution_id = institution_id
      AND uia.role IN ('super_admin', 'admin')
    )
  );

-- ============================================================
-- HIGH: Enable RLS on admissions table
-- ============================================================
ALTER TABLE public.admissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admissions_select_by_institution"
  ON public.admissions
  FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT uia.institution_id FROM user_institution_access uia
      WHERE uia.user_id = auth.uid()
    )
  );

CREATE POLICY "admissions_manage_by_admin"
  ON public.admissions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      WHERE uia.user_id = auth.uid()
      AND uia.institution_id = institution_id
      AND uia.role IN ('super_admin', 'admin', 'admission_head')
    )
  );

-- ============================================================
-- HIGH: Enable RLS on admission_counselors table
-- ============================================================
ALTER TABLE public.admission_counselors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admission_counselors_select_by_institution"
  ON public.admission_counselors
  FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT uia.institution_id FROM user_institution_access uia
      WHERE uia.user_id = auth.uid()
    )
  );

CREATE POLICY "admission_counselors_manage_by_admin"
  ON public.admission_counselors
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_institution_access uia
      WHERE uia.user_id = auth.uid()
      AND uia.institution_id = institution_id
      AND uia.role IN ('super_admin', 'admin', 'admission_head')
    )
  );

-- ============================================================
-- MEDIUM: Enable RLS on OKR module tables
-- ============================================================
ALTER TABLE public.okr_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_compliance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_core_okrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_okr_assignments ENABLE ROW LEVEL SECURITY;

-- Generic institution-scoped policy for OKR tables
-- (Adjust column name if institution_id is not present on these tables)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'okr_dependencies', 'okr_tasks', 'okr_risks', 'okr_compliance_logs',
    'learner_core_okrs', 'learner_okr_assignments'
  ])
  LOOP
    EXECUTE format(
      'CREATE POLICY "%s_select_authenticated" ON public.%I FOR SELECT TO authenticated USING (true)',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "%s_manage_authenticated" ON public.%I FOR ALL TO authenticated USING (true)',
      tbl, tbl
    );
  END LOOP;
END $$;

-- NOTE: The above OKR policies use USING (true) as a temporary measure.
-- These should be refined to institution-scoped policies once the
-- OKR table schema is confirmed to have institution_id columns.

-- ============================================================
-- LOW: Enable RLS on other tables
-- ============================================================
ALTER TABLE public.learner_application_sequences_by_code ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_slot_continuity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "learner_app_seq_select_authenticated"
  ON public.learner_application_sequences_by_code
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "timetable_slot_continuity_select_authenticated"
  ON public.timetable_slot_continuity
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- HIGH: Backup tables - DROP or restrict
-- Backup tables should NOT be accessible via the API.
-- Option A (recommended): Drop them if backups are no longer needed
-- Option B: Enable RLS with no policies (effectively blocks all access)
-- ============================================================

-- Option A: Drop backup tables (DESTRUCTIVE - confirm before running)
-- DROP TABLE IF EXISTS public.learners_profiles_backup_20251223;
-- DROP TABLE IF EXISTS public.learners_profiles_backup_bpharm_sem8_active;
-- DROP TABLE IF EXISTS public.profiles_backup_bpharm_sem8_active;
-- DROP TABLE IF EXISTS public.student_attendance_backup_20251223;
-- DROP TABLE IF EXISTS public.students_backup_20251223;

-- Option B: Enable RLS with no policies (blocks API access, keeps data)
ALTER TABLE public.learners_profiles_backup_20251223 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learners_profiles_backup_bpharm_sem8_active ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles_backup_bpharm_sem8_active ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_attendance_backup_20251223 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students_backup_20251223 ENABLE ROW LEVEL SECURITY;
-- No policies = no access via PostgREST API, which is the desired state for backups
```

---

## Section 4: Supabase Security Advisories

### ERROR Level (53 total)

#### 4.1 RLS Disabled in Public (16 occurrences)

All 16 tables listed in Section 3 above. Remediation SQL provided there.

#### 4.2 Security Definer Views (37 occurrences)

These views use `SECURITY DEFINER`, which means they execute with the permissions of the view creator (typically postgres superuser) rather than the querying user. This **bypasses RLS policies** on underlying tables.

| View Name | Risk |
|-----------|------|
| `v_consultant_performance` | HIGH - Financial/performance data |
| `billing_copq_summary` | HIGH - Financial data |
| `maturity_dashboard_summary` | MEDIUM |
| `v_funnel_drop_off` | MEDIUM |
| `v_okr_cascade` | MEDIUM |
| `v_admission_funnel` | MEDIUM - Admission data |
| `v_stuck_leads` | MEDIUM - Lead data |
| `v_pending_escalations` | MEDIUM |
| `v_okr_reaction_counts` | LOW |
| `admission_process_metrics` | MEDIUM |
| `v_consultant_lead_pipeline` | HIGH - Lead/consultant data |
| `v_pending_verifications` | MEDIUM |
| `hostel_room_availability` | LOW |
| `v_team_performance_summary` | MEDIUM |
| `vac_enrollments_with_details` | MEDIUM |
| `v_payment_summary` | HIGH - Financial data |
| `v_counselor_leaderboard` | MEDIUM |
| `semester_hierarchy_health` | LOW |
| `whatsapp_message_stats` | MEDIUM |
| `v_commission_liability` | HIGH - Financial data |
| `v_counselor_performance_trends` | MEDIUM |
| `whatsapp_active_connections` | MEDIUM |
| `lateral_entry_vacancy_summary` | LOW |
| `v_okr_comment_counts` | LOW |
| `billing_copq_yearly_totals` | HIGH - Financial data |
| `v_application_summary` | MEDIUM |
| `okr_abcd_analysis` | LOW |
| `v_team_okr_summary` | MEDIUM |
| `contact_phone_lookup` | HIGH - PII (phone numbers) |
| `semester_program_audit_view` | LOW |
| `lateral_entry_applications_view` | MEDIUM |
| `v_counselor_performance` | MEDIUM |
| `hostel_occupancy_summary` | LOW |
| `hostel_active_allocations` | LOW |
| `v_workflow_stats` | LOW |
| `v_funnel_analytics` | MEDIUM |
| `v_source_performance` | MEDIUM |

**Remediation:** Convert `SECURITY DEFINER` views to `SECURITY INVOKER` (default) so RLS policies on underlying tables are respected.

```sql
-- Template for each view (repeat for all 37 views):
-- First check the view definition:
-- SELECT definition FROM pg_views WHERE viewname = 'view_name';
-- Then recreate with SECURITY INVOKER:

-- Example for the highest-risk views:
ALTER VIEW public.v_consultant_performance SET (security_invoker = true);
ALTER VIEW public.billing_copq_summary SET (security_invoker = true);
ALTER VIEW public.v_payment_summary SET (security_invoker = true);
ALTER VIEW public.v_commission_liability SET (security_invoker = true);
ALTER VIEW public.billing_copq_yearly_totals SET (security_invoker = true);
ALTER VIEW public.contact_phone_lookup SET (security_invoker = true);
ALTER VIEW public.v_consultant_lead_pipeline SET (security_invoker = true);

-- WARNING: Changing to SECURITY INVOKER means users must have
-- appropriate RLS access to ALL underlying tables the view queries.
-- Test thoroughly before applying to production.

-- Full list (all 37 views):
ALTER VIEW public.v_consultant_performance SET (security_invoker = true);
ALTER VIEW public.billing_copq_summary SET (security_invoker = true);
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
ALTER VIEW public.billing_copq_yearly_totals SET (security_invoker = true);
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

### WARN Level (203 total)

#### 4.3 RLS Policy Always True (40 occurrences)

These policies use `USING (true)` or `WITH CHECK (true)` for non-SELECT operations, meaning any authenticated user can INSERT/UPDATE/DELETE. While some are intentional (system/service-role operations), others may be overly permissive.

**Intentional (system/service-role insert -- acceptable):**

| Table | Policy | Command | Assessment |
|-------|--------|---------|------------|
| admission_ai_insights | Service role can insert insights | INSERT | OK - system operation |
| admission_campaign_logs | System can insert campaign logs | INSERT | OK - system operation |
| ai_query_logs | System can insert query logs | INSERT | OK - system operation |
| child_app_access_logs | System can create access logs | INSERT | OK - system operation |
| child_app_sessions | System can create/update sessions | INSERT/UPDATE | OK - system operation |
| funnel_snapshots | System can create/update snapshots | INSERT/UPDATE | OK - system operation |
| grievance_history | grievance_history_insert | INSERT | OK if intentional |
| hostel_allocation_requests | hostel_requests_insert | INSERT | REVIEW - should be institution-scoped |
| hostel_complaints | hostel_complaints_insert | INSERT | REVIEW - should be institution-scoped |
| nps_analytics | System can manage analytics | ALL | REVIEW - ALL with true is broad |
| parent_otp_requests | Service role can manage OTP requests | ALL | REVIEW - ALL with true is broad |
| resource_usage_logs | System can create usage logs | INSERT | OK - system operation |
| sh_audit_logs | sh_audit_logs_insert | INSERT | OK - audit log |
| user_activity_logs | System can insert activity logs | INSERT | OK - system operation |

**Potentially problematic (should be reviewed):**

| Table | Policy | Command | Risk |
|-------|--------|---------|------|
| ai_query_rate_limits | System can manage rate limits | ALL | HIGH - any user can manage rate limits |
| competency_catalog | *_authenticated (3 policies) | DELETE/INSERT/UPDATE | HIGH - any authenticated user can CRUD |
| competency_program_mapping | all 6 non-select policies | DELETE/INSERT/UPDATE | HIGH - any authenticated user can CRUD |
| course_competency_mapping | all 6 non-select policies | DELETE/INSERT/UPDATE | HIGH - any authenticated user can CRUD |
| learner_competencies | all 6 non-select policies | DELETE/INSERT/UPDATE | HIGH - any authenticated user can CRUD |
| vac_courses | vac_courses_all_authenticated | ALL | MEDIUM - any authenticated user has full access |
| vac_lessons | vac_lessons_all_authenticated | ALL | MEDIUM - any authenticated user has full access |

#### 4.4 Function Search Path Mutable (161 occurrences)

161 functions in the public schema do not have `search_path` set. This could allow a malicious user to create objects in the public schema that shadow system functions.

**Top 20 affected functions (sorted alphabetically):**
- `ai_rpc_admission_analytics`
- `ai_rpc_admission_details`
- `ai_rpc_admission_referrers`
- `ai_rpc_admission_statistics`
- `ai_rpc_admissions`
- `ai_rpc_admissions_by_location`
- `ai_rpc_attendance`
- `ai_rpc_attendance_defaulters`
- `ai_rpc_fee_defaulters`
- `ai_rpc_hierarchy_summary`
- `ai_rpc_kpi_summary`
- `ai_rpc_learners_by_location`
- `ai_rpc_learners_comprehensive`
- `ai_rpc_student_bills`
- `ai_rpc_student_details`
- `ai_rpc_student_search`
- `ai_rpc_students`
- `ai_rpc_students_by_department`
- `ai_rpc_students_summary`
- `allocate_hostel_bed`
- ... and 141 more

**Remediation (apply to all 161 functions):**

```sql
-- Template: Set search_path for each function
-- First get the function signature:
-- SELECT proname, pg_get_function_identity_arguments(oid)
-- FROM pg_proc WHERE proname = 'function_name';

-- Then alter:
-- ALTER FUNCTION public.function_name(args) SET search_path = public;

-- Batch remediation query to generate ALTER statements:
SELECT format(
  'ALTER FUNCTION %s.%s(%s) SET search_path = public;',
  n.nspname,
  p.proname,
  pg_get_function_identity_arguments(p.oid)
)
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND NOT EXISTS (
  SELECT 1 FROM pg_options_to_table(p.proconfig)
  WHERE option_name = 'search_path'
);
-- Run this query to generate all ALTER statements, then execute them.
```

#### 4.5 Materialized View in API (1 occurrence)

| View | Risk |
|------|------|
| `activity_stats` | LOW - If it contains aggregated non-sensitive data |

**Remediation:** If this materialized view should not be accessible via the API, revoke access:

```sql
REVOKE SELECT ON public.activity_stats FROM anon, authenticated;
```

#### 4.6 Leaked Password Protection Disabled (1 occurrence)

Supabase Auth's leaked password protection feature is disabled. This feature checks new passwords against known data breach databases.

**Remediation:** Enable in Supabase Dashboard:
1. Go to Authentication > Settings > Security
2. Enable "Leaked Password Protection"
3. Or via API: Update auth config to enable `leaked_password_protection`

---

## Priority Remediation Roadmap

| Priority | Action | Tables/Entities | Effort |
|----------|--------|----------------|--------|
| **P0 - Immediate** | Enable RLS on `students` table | 1 table | 15 min |
| **P0 - Immediate** | Enable RLS on backup tables (or drop them) | 5 tables | 10 min |
| **P1 - This Week** | Enable RLS on `admissions`, `admission_counselors` | 2 tables | 15 min |
| **P1 - This Week** | Enable RLS on OKR module tables | 6 tables | 30 min |
| **P1 - This Week** | Add policies to `child_app_permissions`, `user_child_app_permissions` | 2 tables | 15 min |
| **P1 - This Week** | Enable leaked password protection | Auth config | 5 min |
| **P2 - Next Sprint** | Convert SECURITY DEFINER views to INVOKER (high-risk first) | 7 views | 2 hrs |
| **P2 - Next Sprint** | Review and tighten always-true policies | 40 policies | 2 hrs |
| **P3 - Backlog** | Convert remaining SECURITY DEFINER views | 30 views | 3 hrs |
| **P3 - Backlog** | Set search_path on all 161 functions | 161 functions | 2 hrs |
| **P3 - Backlog** | Review materialized view API access | 1 view | 15 min |
| **P3 - Backlog** | Enable RLS on remaining 2 low-risk tables | 2 tables | 10 min |

---

## Notes

- This audit covers the **staging** database only. Production (`kvizhngldtiuufknvehv`) was not modified or queried for data.
- Row counts are from staging and may differ from production.
- All remediation SQL should be tested on staging before applying to production.
- The `service_role` key bypasses RLS entirely -- ensure it is never exposed to the client.
- Some "always true" policies may be intentional for system-level operations; review with the development team before tightening.
