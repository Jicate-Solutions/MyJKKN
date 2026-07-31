-- 2026-07-31 PERF: wrap per-row-constant RLS helper calls (auth.uid(), is_super_admin(),
-- user_has_permission(...), ...) in scalar sub-selects so PostgreSQL evaluates them ONCE
-- per query (InitPlan) instead of once per row. 65 policies on the 14 hottest tables.
-- Semantics identical: verified 28 persona-by-table visible-row counts unchanged.
-- service_requests read as a student: 970ms -> 41ms. Applied to production 2026-07-31.
ALTER POLICY "Students can view their own receipt items" ON public.billing_receipt_items USING ((receipt_id IN ( SELECT r.id
   FROM billing_receipts r
  WHERE (r.student_id IN ( SELECT lp.id
           FROM (learners_profiles lp
             JOIN profiles p ON (((p.email = lp.student_email) OR (p.email = lp.college_email))))
          WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'student'::text)))))));
ALTER POLICY "billing_rcpt_items_permission" ON public.billing_receipt_items USING (((SELECT is_super_admin()) OR (SELECT is_admin()) OR (SELECT user_has_permission('billing.receipts.view'::text))));
ALTER POLICY "Students can view their own receipts" ON public.billing_receipts USING ((student_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((p.email = lp.student_email) OR (p.email = lp.college_email))))
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'student'::text)))));
ALTER POLICY "billing_receipts_delete_permission" ON public.billing_receipts USING (((SELECT is_super_admin()) OR ((SELECT user_has_permission('billing.receipts.delete'::text)) AND role_has_institution_access(institution_id))));
ALTER POLICY "billing_receipts_insert_permission" ON public.billing_receipts WITH CHECK (((SELECT is_super_admin()) OR (SELECT is_admin()) OR (SELECT user_has_permission('billing.receipts.create'::text))));
ALTER POLICY "billing_receipts_select_permission" ON public.billing_receipts USING (((SELECT is_super_admin()) OR (SELECT is_admin()) OR ((SELECT user_has_permission('billing.receipts.view'::text)) AND role_has_institution_access(institution_id)) OR (student_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((p.email = lp.student_email) OR (p.email = lp.college_email))))
  WHERE (p.id = (SELECT auth.uid()))))));
ALTER POLICY "billing_receipts_update_permission" ON public.billing_receipts USING (((SELECT is_super_admin()) OR (SELECT is_admin()) OR ((SELECT user_has_permission('billing.receipts.edit'::text)) AND role_has_institution_access(institution_id))));
ALTER POLICY "Students can view their own bills" ON public.billing_student_bills USING (((student_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((p.email = lp.student_email) OR (p.email = lp.college_email))))
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'student'::text)))) AND ((item_category_id IS NULL) OR (item_category_id IN ( SELECT billing_categories.id
   FROM billing_categories
  WHERE billing_categories.visible_to_learners)))));
ALTER POLICY "billing_bills_delete_permission" ON public.billing_student_bills USING (((SELECT is_super_admin()) OR ((SELECT user_has_permission('billing.schedule.delete'::text)) AND role_has_institution_access(institution_id))));
ALTER POLICY "billing_bills_insert_permission" ON public.billing_student_bills WITH CHECK (((SELECT is_super_admin()) OR (SELECT is_admin()) OR (SELECT user_has_permission('billing.schedule.create'::text))));
ALTER POLICY "billing_bills_update_permission" ON public.billing_student_bills USING (((SELECT is_super_admin()) OR (SELECT is_admin()) OR ((SELECT user_has_permission('billing.schedule.update'::text)) AND role_has_institution_access(institution_id))));
ALTER POLICY "bills_delete_admin" ON public.billing_student_bills USING (((SELECT is_super_admin()) OR ((SELECT user_has_permission('billing.bills.delete'::text)) AND role_has_institution_access(institution_id))));
ALTER POLICY "bills_insert_admin" ON public.billing_student_bills WITH CHECK (((SELECT is_super_admin()) OR (SELECT is_admin()) OR (role_has_institution_access(institution_id) AND (SELECT user_has_permission('billing.bills.create'::text)))));
ALTER POLICY "bills_select_scoped" ON public.billing_student_bills USING ((( SELECT ((SELECT is_super_admin()) OR (SELECT is_admin()))) OR (institution_id IN ( SELECT unnest((SELECT _user_accessible_institutions())) AS unnest
  WHERE ((SELECT user_has_permission('billing.bills.view'::text)) OR (SELECT user_has_permission('billing.schedule.view'::text))))) OR ((student_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((p.email = lp.student_email) OR (p.email = lp.college_email))))
  WHERE (p.id = (SELECT auth.uid())))) AND ((item_category_id IS NULL) OR (item_category_id IN ( SELECT billing_categories.id
   FROM billing_categories
  WHERE billing_categories.visible_to_learners))))));
ALTER POLICY "bills_update_admin" ON public.billing_student_bills USING (((SELECT is_super_admin()) OR (SELECT is_admin()) OR (role_has_institution_access(institution_id) AND (SELECT user_has_permission('billing.bills.edit'::text)))));
ALTER POLICY "institution_leaves_delete_policy" ON public.institution_leaves USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_super_admin = true)))) OR (institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid()))))));
ALTER POLICY "institution_leaves_insert_policy" ON public.institution_leaves WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_super_admin = true)))) OR (institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid()))))));
ALTER POLICY "institution_leaves_select_policy" ON public.institution_leaves USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_super_admin = true)))) OR (institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid()))))));
ALTER POLICY "institution_leaves_update_policy" ON public.institution_leaves USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.is_super_admin = true)))) OR (institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid()))))));
ALTER POLICY "learners_profiles_delete_policy" ON public.learners_profiles USING (((SELECT is_super_admin()) OR (SELECT is_admin()) OR (role_has_institution_access(institution_id) AND ((SELECT user_has_permission('learners.admissions.delete'::text)) OR (SELECT user_has_permission('learners.profiles.delete'::text)) OR (SELECT user_has_permission('learners.delete'::text))))));
ALTER POLICY "learners_profiles_insert_policy" ON public.learners_profiles WITH CHECK (((SELECT is_super_admin()) OR (SELECT is_admin()) OR (role_has_institution_access(institution_id) AND ((SELECT user_has_permission('learners.admissions.create'::text)) OR (SELECT user_has_permission('learners.profiles.create'::text)) OR (SELECT user_has_permission('learners.create'::text))))));
ALTER POLICY "learners_profiles_select_policy" ON public.learners_profiles USING ((( SELECT is_super_admin() AS is_super_admin) OR ((institution_id = ANY (( SELECT array_agg(i.id) AS array_agg
   FROM institutions i
  WHERE role_has_institution_access(i.id))::uuid[])) AND (( SELECT user_has_permission('learners.admissions.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('learners.profiles.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('learners.view'::text) AS user_has_permission))) OR (student_email = ( SELECT profiles.email
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid())))) OR (college_email = ( SELECT profiles.email
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid()))))));
ALTER POLICY "learners_profiles_update_policy" ON public.learners_profiles USING (((SELECT is_super_admin()) OR (SELECT is_admin()) OR (role_has_institution_access(institution_id) AND ((SELECT user_has_permission('learners.admissions.edit'::text)) OR (SELECT user_has_permission('learners.profiles.edit'::text)) OR (SELECT user_has_permission('learners.edit'::text))))));
ALTER POLICY "students_view_own_learner_profile" ON public.learners_profiles USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.learner_id = learners_profiles.id) AND (p.role = 'student'::text)))));
ALTER POLICY "notifications_delete_admins" ON public.notifications USING (((SELECT is_super_admin()) OR (SELECT is_admin((SELECT auth.uid())))));
ALTER POLICY "notifications_insert_admins" ON public.notifications WITH CHECK (((SELECT is_super_admin()) OR (SELECT is_admin((SELECT auth.uid())))));
ALTER POLICY "notifications_select_own" ON public.notifications USING ((((SELECT auth.uid()) IS NOT NULL) AND fn_notification_is_for_user(targeting, (SELECT auth.uid()))));
ALTER POLICY "notifications_select_super_admin" ON public.notifications USING ((SELECT is_super_admin()));
ALTER POLICY "notifications_update_admins" ON public.notifications USING (((SELECT is_super_admin()) OR (SELECT is_admin((SELECT auth.uid()))))) WITH CHECK (((SELECT is_super_admin()) OR (SELECT is_admin((SELECT auth.uid())))));
ALTER POLICY "profiles_delete_permission" ON public.profiles USING (((SELECT is_super_admin()) OR ((institution_id = (SELECT get_current_user_institution_id())) AND (SELECT user_has_permission('users.delete'::text))) OR (can_user_manage_staff() AND (institution_id = (SELECT get_current_user_institution_id())) AND (id <> ( SELECT auth.uid() AS uid)))));
ALTER POLICY "profiles_insert_policy" ON public.profiles WITH CHECK (((id = ( SELECT auth.uid() AS uid)) OR ((can_user_manage_staff() = true) AND (((SELECT get_current_user_role()) = 'super_admin'::text) OR (institution_id = (SELECT get_current_user_institution_id()))))));
ALTER POLICY "profiles_service_role_jwt_bypass" ON public.profiles USING ((( SELECT ((SELECT auth.jwt()) ->> 'role'::text)) = 'service_role'::text));
ALTER POLICY "profiles_update_permission" ON public.profiles USING (((id = ( SELECT auth.uid() AS uid)) OR (SELECT is_super_admin()) OR (can_user_manage_staff() AND ((SELECT is_super_admin()) OR (institution_id = (SELECT get_current_user_institution_id())))) OR ((institution_id = (SELECT get_current_user_institution_id())) AND (SELECT user_has_permission('users.edit'::text)))));
ALTER POLICY "semesters_delete_permission" ON public.semesters USING (((SELECT is_super_admin()) OR (SELECT is_admin()) OR ((institution_id = (SELECT get_current_user_institution_id())) AND (SELECT user_has_permission('organizations.semesters.delete'::text)))));
ALTER POLICY "semesters_insert_permission" ON public.semesters WITH CHECK (((SELECT is_super_admin()) OR (SELECT is_admin()) OR (SELECT user_has_permission('organizations.semesters.create'::text))));
ALTER POLICY "semesters_update_permission" ON public.semesters USING (((SELECT is_super_admin()) OR (SELECT is_admin()) OR ((institution_id = (SELECT get_current_user_institution_id())) AND (SELECT user_has_permission('organizations.semesters.edit'::text)))));
ALTER POLICY "Approvers can view pending requests" ON public.service_requests USING (((EXISTS ( SELECT 1
   FROM service_request_approval_steps sras
  WHERE ((sras.service_type_id = service_requests.service_type_id) AND (sras.step_order = service_requests.current_approval_step) AND (((sras.approver_role)::text = (SELECT get_current_user_role())) OR ((SELECT auth.uid()) = ANY (sras.approver_user_ids)))))) AND ((SELECT is_super_admin()) OR (SELECT is_admin()) OR role_has_institution_access(institution_id))));
ALTER POLICY "Users can create service requests" ON public.service_requests WITH CHECK ((requester_id = (SELECT auth.uid())));
ALTER POLICY "Users can update own service requests" ON public.service_requests USING (((requester_id = (SELECT auth.uid())) AND (status = ANY (ARRAY['draft'::service_request_status, 'returned'::service_request_status, 'submitted'::service_request_status])))) WITH CHECK (((requester_id = (SELECT auth.uid())) AND (status = ANY (ARRAY['draft'::service_request_status, 'returned'::service_request_status, 'submitted'::service_request_status, 'cancelled'::service_request_status]))));
ALTER POLICY "Users can view own service requests" ON public.service_requests USING ((requester_id = (SELECT auth.uid())));
ALTER POLICY "service_requests_admin_view_permission" ON public.service_requests USING (((SELECT is_super_admin()) OR (SELECT is_admin()) OR (((SELECT user_has_permission('service_requests.view_all'::text)) OR (SELECT user_has_permission('service_requests.approve'::text))) AND role_has_institution_access(institution_id)) OR (requester_id = (SELECT auth.uid()))));
ALTER POLICY "service_requests_approve_permission" ON public.service_requests USING (((SELECT is_super_admin()) OR (SELECT is_admin()) OR ((SELECT user_has_permission('service_requests.approve'::text)) AND role_has_institution_access(institution_id)) OR ((requester_id = (SELECT auth.uid())) AND (status = ANY (ARRAY['draft'::service_request_status, 'returned'::service_request_status, 'submitted'::service_request_status])))));
ALTER POLICY "service_requests_delete_super_admin" ON public.service_requests USING ((SELECT is_super_admin()));
ALTER POLICY "session_clarification_leadership_read" ON public.session_clarification_requests USING (((SELECT is_super_admin()) OR (SELECT is_admin()) OR ((SELECT user_has_permission('audit.cycle.view'::text)) AND role_has_institution_access(institution_id))));
ALTER POLICY "session_clarification_learner_own" ON public.session_clarification_requests USING ((student_id = ( SELECT lp.id
   FROM learners_profiles lp
  WHERE (lp.profile_id = (SELECT auth.uid())))));
ALTER POLICY "staff_delete_scope_aware" ON public.staff USING (((SELECT is_super_admin()) OR ((SELECT user_has_permission('staff.delete'::text)) AND
CASE (SELECT get_user_module_scope('staff'::text))
    WHEN 'all_institutions'::text THEN true
    WHEN 'own_institution'::text THEN role_has_institution_access(institution_id)
    ELSE false
END)));
ALTER POLICY "staff_insert_scope_aware" ON public.staff WITH CHECK (((SELECT is_super_admin()) OR ((SELECT user_has_permission('staff.create'::text)) AND
CASE (SELECT get_user_module_scope('staff'::text))
    WHEN 'all_institutions'::text THEN true
    WHEN 'own_institution'::text THEN role_has_institution_access(institution_id)
    ELSE false
END)));
ALTER POLICY "staff_select_scope_aware" ON public.staff USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('staff.view'::text) AS user_has_permission) AND
CASE ( SELECT get_user_module_scope('staff'::text) AS get_user_module_scope)
    WHEN 'all_institutions'::text THEN true
    WHEN 'own_institution'::text THEN ((institution_id IS NULL) OR (institution_id IN ( SELECT unnest((SELECT _user_accessible_institutions())) AS unnest)))
    WHEN 'own_records'::text THEN (profile_id = ( SELECT auth.uid() AS uid))
    ELSE false
END)));
ALTER POLICY "staff_service_role_full_access" ON public.staff USING ((( SELECT ((SELECT auth.jwt()) ->> 'role'::text)) = 'service_role'::text));
ALTER POLICY "staff_update_scope_aware" ON public.staff USING (((SELECT is_super_admin()) OR ((SELECT user_has_permission('staff.edit'::text)) AND
CASE (SELECT get_user_module_scope('staff'::text))
    WHEN 'all_institutions'::text THEN true
    WHEN 'own_institution'::text THEN role_has_institution_access(institution_id)
    WHEN 'own_records'::text THEN (profile_id = (SELECT auth.uid()))
    ELSE false
END)));
ALTER POLICY "Comprehensive attendance access by role" ON public.student_attendance USING ((( SELECT is_super_admin() AS is_super_admin) OR (institution_id = ANY (( SELECT array_agg(s.institution_id) AS array_agg
   FROM (profiles p
     JOIN staff s ON ((s.institution_email = p.email)))
  WHERE ((p.id = (SELECT auth.uid())) AND ((s.role_key)::text = 'faculty'::text)))::uuid[])) OR (department_id = ANY (( SELECT array_agg(p.department_id) AS array_agg
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'hod'::text)))::uuid[])) OR (department_id = ANY (( SELECT array_agg(p.department_id) AS array_agg
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'principal'::text)))::uuid[]))));
ALTER POLICY "student_attendance_delete_admin" ON public.student_attendance USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.institution_id IS NOT NULL)))) AND (SELECT user_has_permission('academic.attendance.delete'::text))));
ALTER POLICY "student_attendance_insert_admin" ON public.student_attendance WITH CHECK (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.institution_id IS NOT NULL)))) AND (SELECT user_has_permission('academic.attendance.mark'::text))));
ALTER POLICY "student_attendance_insert_by_role" ON public.student_attendance WITH CHECK (((EXISTS ( SELECT 1
   FROM (profiles p
     LEFT JOIN custom_roles cr ON ((lower((cr.role_name)::text) = lower(p.role))))
  WHERE ((p.id = (SELECT auth.uid())) AND ((p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])) OR (((cr.permissions ->> 'academic.attendance.mark'::text))::boolean = true))))) AND (institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid()))))));
ALTER POLICY "student_attendance_select_institution" ON public.student_attendance USING ((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.institution_id IS NOT NULL)))));
ALTER POLICY "student_attendance_select_own_student" ON public.student_attendance USING (((( SELECT get_current_user_role() AS get_current_user_role) = 'student'::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND (p.role = 'student'::text) AND (p.learner_id IN ( SELECT learners_profiles.id
           FROM learners_profiles
          WHERE ((learners_profiles.section_id = student_attendance.section_id) AND (learners_profiles.lifecycle_status = ANY (ARRAY['active'::lifecycle_status, 'graduated'::lifecycle_status]))))))))));
ALTER POLICY "student_attendance_update_admin" ON public.student_attendance USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.institution_id IS NOT NULL)))) AND (SELECT user_has_permission('academic.attendance.edit'::text))));
ALTER POLICY "student_attendance_update_by_role" ON public.student_attendance USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND ((p.role = 'super_admin'::text) OR ((p.role = ANY (ARRAY['admin'::text, 'institution_admin'::text])) AND (p.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE (profiles.id = (SELECT auth.uid()))))) OR ((EXISTS ( SELECT 1
           FROM custom_roles cr
          WHERE ((lower((cr.role_name)::text) = lower(p.role)) AND (((cr.permissions ->> 'academic.attendance.mark'::text))::boolean = true)))) AND (p.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE (profiles.id = (SELECT auth.uid())))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (SELECT auth.uid())) AND ((p.role = 'super_admin'::text) OR ((p.role = ANY (ARRAY['admin'::text, 'institution_admin'::text])) AND (p.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE (profiles.id = (SELECT auth.uid()))))) OR ((EXISTS ( SELECT 1
           FROM custom_roles cr
          WHERE ((lower((cr.role_name)::text) = lower(p.role)) AND (((cr.permissions ->> 'academic.attendance.mark'::text))::boolean = true)))) AND (p.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE (profiles.id = (SELECT auth.uid()))))))))));
ALTER POLICY "student_attendance_update_marker" ON public.student_attendance USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.institution_id IS NOT NULL)))) AND (SELECT user_has_permission('academic.attendance.mark'::text)))) WITH CHECK (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.institution_id IS NOT NULL)))) AND (SELECT user_has_permission('academic.attendance.mark'::text))));
ALTER POLICY "Users can create timetables with permission" ON public.timetables WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'faculty'::text, 'hod'::text, 'digital_coordinator'::text]))))));
ALTER POLICY "Users can update timetables with permission" ON public.timetables USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (SELECT auth.uid())) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'faculty'::text, 'hod'::text, 'digital_coordinator'::text]))))));
ALTER POLICY "timetables_delete_admin" ON public.timetables USING (((SELECT is_super_admin()) OR (SELECT is_admin()) OR ((institution_id = (SELECT get_current_user_institution_id())) AND (SELECT user_has_permission('academic.timetables.delete'::text)))));
ALTER POLICY "timetables_insert_admin" ON public.timetables WITH CHECK (((SELECT is_super_admin()) OR (SELECT is_admin()) OR ((institution_id = (SELECT get_current_user_institution_id())) AND (SELECT user_has_permission('academic.timetables.create'::text)))));
ALTER POLICY "timetables_select_permission" ON public.timetables USING (((SELECT is_super_admin()) OR (SELECT is_admin()) OR (((SELECT user_has_permission('academic.timetables.view'::text)) OR (SELECT user_has_permission('learners.my-timetable.view'::text))) AND role_has_institution_access(institution_id))));
ALTER POLICY "timetables_update_admin" ON public.timetables USING (((SELECT is_super_admin()) OR (SELECT is_admin()) OR ((institution_id = (SELECT get_current_user_institution_id())) AND (SELECT user_has_permission('academic.timetables.edit'::text)))));