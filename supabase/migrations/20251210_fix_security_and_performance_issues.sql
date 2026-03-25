-- Migration: Fix Security and Performance Issues
-- Date: 2025-12-10
-- Purpose: Address Supabase advisor warnings for security and performance

-- ============================================
-- PART 1: Add Missing Foreign Key Indexes
-- ============================================

-- Index for student_attendance.degree_id (fk_student_attendance_degree)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_attendance_degree_id
ON public.student_attendance(degree_id);

-- Index for timetables.created_from_template_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_timetables_created_from_template_id
ON public.timetables(created_from_template_id);

-- ============================================
-- PART 2: Fix Security Definer Views
-- Convert to Security Invoker where appropriate
-- ============================================

-- Note: SECURITY DEFINER views bypass RLS. Converting to SECURITY INVOKER
-- makes them respect the calling user's permissions.

-- 2.1 Fix bug_reporters_leaderboard view
DROP VIEW IF EXISTS public.bug_reporters_leaderboard;
CREATE VIEW public.bug_reporters_leaderboard
WITH (security_invoker = true)
AS
SELECT
    p.id as user_id,
    p.full_name,
    p.avatar_url,
    COUNT(DISTINCT br.id) as total_reports,
    COUNT(DISTINCT CASE WHEN br.status = 'closed' AND br.resolution = 'fixed' THEN br.id END) as fixed_bugs,
    COUNT(DISTINCT CASE WHEN br.priority = 'critical' THEN br.id END) as critical_bugs,
    COUNT(DISTINCT CASE WHEN br.priority = 'high' THEN br.id END) as high_priority_bugs,
    SUM(
        CASE
            WHEN br.priority = 'critical' THEN 50
            WHEN br.priority = 'high' THEN 30
            WHEN br.priority = 'medium' THEN 15
            WHEN br.priority = 'low' THEN 5
            ELSE 0
        END
    ) as total_points
FROM public.profiles p
LEFT JOIN public.bug_reports br ON br.reported_by = p.id
WHERE br.id IS NOT NULL
GROUP BY p.id, p.full_name, p.avatar_url
ORDER BY total_points DESC;

-- 2.2 Fix bug_reports_with_details view
DROP VIEW IF EXISTS public.bug_reports_with_details;
CREATE VIEW public.bug_reports_with_details
WITH (security_invoker = true)
AS
SELECT
    br.*,
    reporter.full_name as reporter_name,
    reporter.avatar_url as reporter_avatar,
    assignee.full_name as assignee_name,
    assignee.avatar_url as assignee_avatar
FROM public.bug_reports br
LEFT JOIN public.profiles reporter ON br.reported_by = reporter.id
LEFT JOIN public.profiles assignee ON br.assigned_to = assignee.id;

-- 2.3 Fix semester_program_audit_view
DROP VIEW IF EXISTS public.semester_program_audit_view;
CREATE VIEW public.semester_program_audit_view
WITH (security_invoker = true)
AS
SELECT
    s.id as student_id,
    s.full_name as student_name,
    s.roll_number,
    sec.name as section_name,
    sem.name as semester_name,
    sem.program_id as semester_program_id,
    sec.program_id as section_program_id,
    CASE
        WHEN sem.program_id = sec.program_id THEN 'CONSISTENT'
        ELSE 'INCONSISTENT'
    END as consistency_status
FROM public.students s
JOIN public.sections sec ON s.section_id = sec.id
JOIN public.semesters sem ON s.semester_id = sem.id;

-- 2.4 Fix semester_hierarchy_health view
DROP VIEW IF EXISTS public.semester_hierarchy_health;
CREATE VIEW public.semester_hierarchy_health
WITH (security_invoker = true)
AS
SELECT
    i.id as institution_id,
    i.name as institution_name,
    COUNT(DISTINCT p.id) as total_programs,
    COUNT(DISTINCT sem.id) as total_semesters,
    COUNT(DISTINCT sec.id) as total_sections,
    COUNT(DISTINCT s.id) as total_students
FROM public.institutions i
LEFT JOIN public.programs p ON p.institution_id = i.id
LEFT JOIN public.semesters sem ON sem.program_id = p.id
LEFT JOIN public.sections sec ON sec.semester_id = sem.id
LEFT JOIN public.students s ON s.section_id = sec.id
GROUP BY i.id, i.name;

-- 2.5 Fix billing_deletion_dependencies view
DROP VIEW IF EXISTS public.billing_deletion_dependencies;
CREATE VIEW public.billing_deletion_dependencies
WITH (security_invoker = true)
AS
SELECT
    b.id as bill_id,
    b.student_id,
    COUNT(DISTINCT ri.id) as receipt_items_count,
    COUNT(DISTINCT r.id) as refunds_count
FROM public.billing_student_bills b
LEFT JOIN public.billing_receipt_items ri ON ri.bill_id = b.id
LEFT JOIN public.billing_refunds r ON r.receipt_id IN (SELECT receipt_id FROM public.billing_receipt_items WHERE bill_id = b.id)
GROUP BY b.id, b.student_id;

-- Note: v_bill_details, auto_generated_invoices, and bill_invoice_relationships
-- may have complex dependencies. We'll recreate them with security_invoker.

-- 2.6 Fix v_bill_details view (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'v_bill_details' AND schemaname = 'public') THEN
        DROP VIEW IF EXISTS public.v_bill_details;
        CREATE VIEW public.v_bill_details
        WITH (security_invoker = true)
        AS
        SELECT
            b.*,
            s.full_name as student_name,
            s.roll_number,
            i.name as institution_name
        FROM public.billing_student_bills b
        JOIN public.students s ON b.student_id = s.id
        JOIN public.institutions i ON b.institution_id = i.id;
    END IF;
END $$;

-- 2.7 Fix auto_generated_invoices view (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'auto_generated_invoices' AND schemaname = 'public') THEN
        DROP VIEW IF EXISTS public.auto_generated_invoices;
        CREATE VIEW public.auto_generated_invoices
        WITH (security_invoker = true)
        AS
        SELECT
            bi.*,
            s.full_name as student_name,
            s.roll_number
        FROM public.billing_invoices bi
        JOIN public.students s ON bi.student_id = s.id
        WHERE bi.generation_type = 'auto';
    END IF;
END $$;

-- 2.8 Fix bill_invoice_relationships view (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'bill_invoice_relationships' AND schemaname = 'public') THEN
        DROP VIEW IF EXISTS public.bill_invoice_relationships;
        CREATE VIEW public.bill_invoice_relationships
        WITH (security_invoker = true)
        AS
        SELECT
            b.id as bill_id,
            b.student_id,
            bi.id as invoice_id,
            bi.invoice_number,
            bii.amount as invoice_item_amount
        FROM public.billing_student_bills b
        LEFT JOIN public.billing_invoice_items bii ON bii.bill_id = b.id
        LEFT JOIN public.billing_invoices bi ON bii.invoice_id = bi.id;
    END IF;
END $$;

-- ============================================
-- PART 3: Optimize Critical RLS Policies
-- Wrap auth.uid() in (SELECT ...) for better performance
-- ============================================

-- 3.1 Optimize billing_receipts policies
DROP POLICY IF EXISTS "Students can view their own billing receipts" ON public.billing_receipts;
CREATE POLICY "Students can view their own billing receipts" ON public.billing_receipts
FOR SELECT USING (
    student_id IN (
        SELECT id FROM public.students
        WHERE profile_id = (SELECT auth.uid())
    )
);

DROP POLICY IF EXISTS "Faculty users can delete institution billing receipts" ON public.billing_receipts;
CREATE POLICY "Faculty users can delete institution billing receipts" ON public.billing_receipts
FOR DELETE USING (
    institution_id IN (
        SELECT institution_id FROM public.profiles
        WHERE id = (SELECT auth.uid())
    )
);

DROP POLICY IF EXISTS "Faculty users can insert institution billing receipts" ON public.billing_receipts;
CREATE POLICY "Faculty users can insert institution billing receipts" ON public.billing_receipts
FOR INSERT WITH CHECK (
    institution_id IN (
        SELECT institution_id FROM public.profiles
        WHERE id = (SELECT auth.uid())
    )
);

DROP POLICY IF EXISTS "Faculty users can update institution billing receipts" ON public.billing_receipts;
CREATE POLICY "Faculty users can update institution billing receipts" ON public.billing_receipts
FOR UPDATE USING (
    institution_id IN (
        SELECT institution_id FROM public.profiles
        WHERE id = (SELECT auth.uid())
    )
);

-- 3.2 Optimize billing_student_bills policies
DROP POLICY IF EXISTS "Faculty users can update institution billing student bills" ON public.billing_student_bills;
CREATE POLICY "Faculty users can update institution billing student bills" ON public.billing_student_bills
FOR UPDATE USING (
    institution_id IN (
        SELECT institution_id FROM public.profiles
        WHERE id = (SELECT auth.uid())
    )
);

DROP POLICY IF EXISTS "Faculty users can delete institution billing student bills" ON public.billing_student_bills;
CREATE POLICY "Faculty users can delete institution billing student bills" ON public.billing_student_bills
FOR DELETE USING (
    institution_id IN (
        SELECT institution_id FROM public.profiles
        WHERE id = (SELECT auth.uid())
    )
);

-- 3.3 Optimize departments policies
DROP POLICY IF EXISTS "departments_admin_all" ON public.departments;
CREATE POLICY "departments_admin_all" ON public.departments
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin')
    )
);

DROP POLICY IF EXISTS "departments_faculty_own_institution" ON public.departments;
CREATE POLICY "departments_faculty_own_institution" ON public.departments
FOR SELECT USING (
    institution_id IN (
        SELECT institution_id FROM public.profiles
        WHERE id = (SELECT auth.uid())
    )
);

-- 3.4 Optimize api_keys policies
DROP POLICY IF EXISTS "Administrators can view all API keys" ON public.api_keys;
CREATE POLICY "Administrators can view all API keys" ON public.api_keys
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin')
    )
);

DROP POLICY IF EXISTS "Administrators can create API keys" ON public.api_keys;
CREATE POLICY "Administrators can create API keys" ON public.api_keys
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin')
    )
);

DROP POLICY IF EXISTS "Administrators can update API keys" ON public.api_keys;
CREATE POLICY "Administrators can update API keys" ON public.api_keys
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin')
    )
);

DROP POLICY IF EXISTS "Administrators can delete API keys" ON public.api_keys;
CREATE POLICY "Administrators can delete API keys" ON public.api_keys
FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin')
    )
);

-- 3.5 Optimize academic_years policies
DROP POLICY IF EXISTS "Enhanced academic years access" ON public.academic_years;
CREATE POLICY "Enhanced academic years access" ON public.academic_years
FOR SELECT USING (
    institution_id IN (
        SELECT institution_id FROM public.profiles
        WHERE id = (SELECT auth.uid())
    )
    OR EXISTS (
        SELECT 1 FROM public.user_institution_access
        WHERE user_id = (SELECT auth.uid())
        AND public.academic_years.institution_id = institution_id
    )
);

DROP POLICY IF EXISTS "Users can create academic years with permission" ON public.academic_years;
CREATE POLICY "Users can create academic years with permission" ON public.academic_years
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin', 'faculty')
    )
);

DROP POLICY IF EXISTS "Users can update academic years with permission" ON public.academic_years;
CREATE POLICY "Users can update academic years with permission" ON public.academic_years
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin', 'faculty')
    )
);

DROP POLICY IF EXISTS "Users can delete academic years with permission" ON public.academic_years;
CREATE POLICY "Users can delete academic years with permission" ON public.academic_years
FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin')
    )
);

-- 3.6 Optimize degrees policies
DROP POLICY IF EXISTS "degrees_admin_all" ON public.degrees;
CREATE POLICY "degrees_admin_all" ON public.degrees
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin')
    )
);

DROP POLICY IF EXISTS "Users can view accessible degrees" ON public.degrees;
CREATE POLICY "Users can view accessible degrees" ON public.degrees
FOR SELECT USING (
    institution_id IN (
        SELECT institution_id FROM public.profiles
        WHERE id = (SELECT auth.uid())
    )
);

-- 3.7 Optimize programs policies
DROP POLICY IF EXISTS "programs_admin_all" ON public.programs;
CREATE POLICY "programs_admin_all" ON public.programs
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin')
    )
);

DROP POLICY IF EXISTS "Users can view accessible programs" ON public.programs;
CREATE POLICY "Users can view accessible programs" ON public.programs
FOR SELECT USING (
    institution_id IN (
        SELECT institution_id FROM public.profiles
        WHERE id = (SELECT auth.uid())
    )
);

-- 3.8 Optimize semesters policies
DROP POLICY IF EXISTS "semesters_admin_all" ON public.semesters;
CREATE POLICY "semesters_admin_all" ON public.semesters
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin')
    )
);

-- 3.9 Optimize sections policies
DROP POLICY IF EXISTS "sections_admin_all" ON public.sections;
CREATE POLICY "sections_admin_all" ON public.sections
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin')
    )
);

-- 3.10 Optimize courses policies
DROP POLICY IF EXISTS "courses_admin_all" ON public.courses;
CREATE POLICY "courses_admin_all" ON public.courses
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin')
    )
);

-- 3.11 Optimize course_mappings policies
DROP POLICY IF EXISTS "course_mappings_admin_all" ON public.course_mappings;
CREATE POLICY "course_mappings_admin_all" ON public.course_mappings
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin')
    )
);

-- 3.12 Optimize timetables policies
DROP POLICY IF EXISTS "Enhanced timetables access" ON public.timetables;
CREATE POLICY "Enhanced timetables access" ON public.timetables
FOR SELECT USING (
    institution_id IN (
        SELECT institution_id FROM public.profiles
        WHERE id = (SELECT auth.uid())
    )
    OR EXISTS (
        SELECT 1 FROM public.user_institution_access
        WHERE user_id = (SELECT auth.uid())
        AND public.timetables.institution_id = institution_id
    )
);

DROP POLICY IF EXISTS "Users can create timetables with permission" ON public.timetables;
CREATE POLICY "Users can create timetables with permission" ON public.timetables
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin', 'faculty')
    )
);

DROP POLICY IF EXISTS "Users can update timetables with permission" ON public.timetables;
CREATE POLICY "Users can update timetables with permission" ON public.timetables
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin', 'faculty')
    )
);

DROP POLICY IF EXISTS "Users can delete timetables with permission" ON public.timetables;
CREATE POLICY "Users can delete timetables with permission" ON public.timetables
FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin')
    )
);

-- 3.13 Optimize periods policies
DROP POLICY IF EXISTS "Enhanced periods view access" ON public.periods;
CREATE POLICY "Enhanced periods view access" ON public.periods
FOR SELECT USING (
    institution_id IN (
        SELECT institution_id FROM public.profiles
        WHERE id = (SELECT auth.uid())
    )
    OR EXISTS (
        SELECT 1 FROM public.user_institution_access
        WHERE user_id = (SELECT auth.uid())
        AND public.periods.institution_id = institution_id
    )
);

DROP POLICY IF EXISTS "Enhanced periods create access" ON public.periods;
CREATE POLICY "Enhanced periods create access" ON public.periods
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin', 'faculty')
    )
);

DROP POLICY IF EXISTS "Enhanced periods update access" ON public.periods;
CREATE POLICY "Enhanced periods update access" ON public.periods
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin', 'faculty')
    )
);

DROP POLICY IF EXISTS "Enhanced periods delete access" ON public.periods;
CREATE POLICY "Enhanced periods delete access" ON public.periods
FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin')
    )
);

-- 3.14 Optimize student_attendance policies
DROP POLICY IF EXISTS "Enhanced attendance custom role access" ON public.student_attendance;
CREATE POLICY "Enhanced attendance custom role access" ON public.student_attendance
FOR SELECT USING (
    institution_id IN (
        SELECT institution_id FROM public.profiles
        WHERE id = (SELECT auth.uid())
    )
);

DROP POLICY IF EXISTS "Comprehensive attendance access by role" ON public.student_attendance;
CREATE POLICY "Comprehensive attendance access by role" ON public.student_attendance
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin', 'faculty')
    )
);

-- 3.15 Optimize user_roles policies
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles
FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;
CREATE POLICY "Admins can view all user roles" ON public.user_roles
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin')
    )
);

DROP POLICY IF EXISTS "Admins can insert user roles" ON public.user_roles;
CREATE POLICY "Admins can insert user roles" ON public.user_roles
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin')
    )
);

DROP POLICY IF EXISTS "Admins can update user roles" ON public.user_roles;
CREATE POLICY "Admins can update user roles" ON public.user_roles
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin')
    )
);

DROP POLICY IF EXISTS "Admins can delete user roles" ON public.user_roles;
CREATE POLICY "Admins can delete user roles" ON public.user_roles
FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
        AND role IN ('super_admin', 'admin')
    )
);

-- ============================================
-- PART 4: Fix Critical Function Search Paths
-- Only fixing the most commonly used functions
-- ============================================

-- 4.1 Fix handle_updated_at function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 4.2 Fix update_modified_column function
CREATE OR REPLACE FUNCTION public.update_modified_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 4.3 Fix user_has_permission function
CREATE OR REPLACE FUNCTION public.user_has_permission(
    p_user_id uuid,
    p_permission text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_permission boolean := false;
BEGIN
    -- Check if user has the permission through their role or custom role
    SELECT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_user_id
        AND (
            p.role = 'super_admin'
            OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.custom_roles cr ON ur.custom_role_id = cr.id
                WHERE ur.user_id = p_user_id
                AND cr.permissions ? p_permission
            )
        )
    ) INTO v_has_permission;

    RETURN v_has_permission;
END;
$$;

-- 4.4 Fix user_has_institution_access function
CREATE OR REPLACE FUNCTION public.user_has_institution_access(
    p_user_id uuid,
    p_institution_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_access boolean := false;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_user_id
        AND (
            role = 'super_admin'
            OR institution_id = p_institution_id
        )
    ) OR EXISTS (
        SELECT 1 FROM public.user_institution_access
        WHERE user_id = p_user_id
        AND institution_id = p_institution_id
    ) INTO v_has_access;

    RETURN v_has_access;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.handle_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_modified_column() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_institution_access(uuid, uuid) TO authenticated;

-- ============================================
-- VERIFICATION
-- ============================================
-- After applying this migration, run the Supabase advisor again
-- to verify the issues have been resolved.
