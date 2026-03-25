-- Enable RLS on both tables
ALTER TABLE profile_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_change_audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies for profile_change_requests
-- ============================================

-- Students can view their own requests
CREATE POLICY "Students can view own change requests"
ON profile_change_requests FOR SELECT
USING (
  learner_id IN (
    SELECT learner_id FROM profiles WHERE id = auth.uid() AND role = 'student'
  )
);

-- Students can insert their own requests
CREATE POLICY "Students can create change requests"
ON profile_change_requests FOR INSERT
WITH CHECK (
  learner_id IN (
    SELECT learner_id FROM profiles WHERE id = auth.uid() AND role = 'student'
  )
);

-- Students can cancel their own pending requests
CREATE POLICY "Students can cancel own pending requests"
ON profile_change_requests FOR UPDATE
USING (
  learner_id IN (
    SELECT learner_id FROM profiles WHERE id = auth.uid() AND role = 'student'
  )
  AND request_status = 'pending'
)
WITH CHECK (
  request_status = 'cancelled'
);

-- HOD can view institution-wide requests (supports multi-role via user_roles)
-- Updated: 2026-02-09 - Added multi-role support for HOD users assigned via user_roles table
CREATE POLICY "HOD can view institution requests"
ON profile_change_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN learners_profiles lp ON lp.id = profile_change_requests.learner_id
    WHERE p.id = auth.uid()
      AND p.institution_id = lp.institution_id
      AND (
        p.role = 'hod'
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN custom_roles cr ON cr.id = ur.role_id
          WHERE ur.user_id = p.id AND cr.role_key = 'hod'
        )
      )
  )
);

-- Staff can view department requests
CREATE POLICY "Staff can view department requests"
ON profile_change_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN learners_profiles lp ON lp.id = profile_change_requests.learner_id
    WHERE p.id = auth.uid()
      AND p.role = 'staff'
      AND p.department_id = lp.department_id
  )
);

-- HOD/Staff can update requests (approve/reject) - supports multi-role via user_roles
-- Updated: 2026-02-09 - Added multi-role support for HOD/Staff users assigned via user_roles table
CREATE POLICY "Approvers can update requests"
ON profile_change_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN learners_profiles lp ON lp.id = profile_change_requests.learner_id
    WHERE p.id = auth.uid()
      AND (
        -- Super admin
        p.role = 'super_admin'
        -- HOD (legacy or multi-role) with institution match
        OR (
          p.institution_id = lp.institution_id
          AND (
            p.role = 'hod'
            OR EXISTS (
              SELECT 1 FROM user_roles ur
              JOIN custom_roles cr ON cr.id = ur.role_id
              WHERE ur.user_id = p.id AND cr.role_key = 'hod'
            )
          )
        )
        -- Staff (legacy or multi-role) with department match
        OR (
          p.department_id = lp.department_id
          AND (
            p.role = 'staff'
            OR EXISTS (
              SELECT 1 FROM user_roles ur
              JOIN custom_roles cr ON cr.id = ur.role_id
              WHERE ur.user_id = p.id AND cr.role_key = 'staff'
            )
          )
        )
      )
  )
)
WITH CHECK (
  request_status IN ('approved', 'rejected')
);

-- Super admin can do everything
CREATE POLICY "Super admin full access on change requests"
ON profile_change_requests FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  )
);

-- ============================================
-- RLS Policies for profile_change_audit_log
-- ============================================

-- Students can view their own audit history
CREATE POLICY "Students can view own audit log"
ON profile_change_audit_log FOR SELECT
USING (
  learner_id IN (
    SELECT learner_id FROM profiles WHERE id = auth.uid() AND role = 'student'
  )
);

-- HOD can view institution audit logs (supports multi-role via user_roles)
-- Updated: 2026-02-09 - Added multi-role support for HOD users assigned via user_roles table
CREATE POLICY "HOD can view institution audit logs"
ON profile_change_audit_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN learners_profiles lp ON lp.id = profile_change_audit_log.learner_id
    WHERE p.id = auth.uid()
      AND p.institution_id = lp.institution_id
      AND (
        p.role = 'hod'
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN custom_roles cr ON cr.id = ur.role_id
          WHERE ur.user_id = p.id AND cr.role_key = 'hod'
        )
      )
  )
);

-- Staff can view department audit logs
CREATE POLICY "Staff can view department audit logs"
ON profile_change_audit_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN learners_profiles lp ON lp.id = profile_change_audit_log.learner_id
    WHERE p.id = auth.uid()
      AND p.role = 'staff'
      AND p.department_id = lp.department_id
  )
);

-- Only service layer can insert audit logs (via service role)
CREATE POLICY "Service role can insert audit logs"
ON profile_change_audit_log FOR INSERT
WITH CHECK (true); -- Service role bypasses RLS

-- Super admin full access to audit logs
CREATE POLICY "Super admin full access on audit log"
ON profile_change_audit_log FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  )
);
