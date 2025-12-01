# Database Schema: MyJKKN AI Query System

| Field | Detail |
|:------|:-------|
| **Version** | 1.0 |
| **RPC Functions** | 60+ |
| **New Tables** | 2 |

---

## 1. New Tables

### 1.1 ai_query_logs

Tracks all AI query interactions for analytics and debugging.

```sql
CREATE TABLE IF NOT EXISTS public.ai_query_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  institution_id UUID REFERENCES institutions(id),
  query_text TEXT NOT NULL,
  query_type TEXT, -- 'attendance', 'billing', 'students', etc.
  tools_called JSONB DEFAULT '[]'::jsonb,
  response_summary TEXT,
  response_time_ms INTEGER,
  success BOOLEAN DEFAULT true,
  error_code TEXT,
  error_message TEXT,
  feedback_rating INTEGER CHECK (feedback_rating BETWEEN 1 AND 5),
  feedback_text TEXT,
  session_id TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_ai_query_logs_user_id ON ai_query_logs(user_id);
CREATE INDEX idx_ai_query_logs_institution_id ON ai_query_logs(institution_id);
CREATE INDEX idx_ai_query_logs_created_at ON ai_query_logs(created_at DESC);
CREATE INDEX idx_ai_query_logs_query_type ON ai_query_logs(query_type);

-- RLS Policy
ALTER TABLE ai_query_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own query logs"
  ON ai_query_logs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all query logs"
  ON ai_query_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );
```

### 1.2 ai_query_rate_limits

Tracks rate limiting per user.

```sql
CREATE TABLE IF NOT EXISTS public.ai_query_rate_limits (
  user_id UUID PRIMARY KEY REFERENCES profiles(id),
  query_count INTEGER DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT now(),
  daily_action_count INTEGER DEFAULT 0,
  daily_action_reset TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Function to check and update rate limit
CREATE OR REPLACE FUNCTION check_ai_query_rate_limit(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_record ai_query_rate_limits%ROWTYPE;
  v_limit INTEGER := 30;
  v_window_minutes INTEGER := 5;
BEGIN
  -- Get or create rate limit record
  INSERT INTO ai_query_rate_limits (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_record FROM ai_query_rate_limits WHERE user_id = p_user_id;

  -- Reset window if expired
  IF v_record.window_start < now() - (v_window_minutes || ' minutes')::interval THEN
    UPDATE ai_query_rate_limits
    SET query_count = 1, window_start = now(), updated_at = now()
    WHERE user_id = p_user_id;
    RETURN jsonb_build_object('allowed', true, 'remaining', v_limit - 1);
  END IF;

  -- Check limit
  IF v_record.query_count >= v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'retry_after', EXTRACT(EPOCH FROM (v_record.window_start + (v_window_minutes || ' minutes')::interval - now()))
    );
  END IF;

  -- Increment count
  UPDATE ai_query_rate_limits
  SET query_count = query_count + 1, updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('allowed', true, 'remaining', v_limit - v_record.query_count - 1);
END;
$$;
```

---

## 2. RPC Functions - Core Pattern

All AI RPC functions follow this pattern:

```sql
CREATE OR REPLACE FUNCTION ai_rpc_[entity](
  p_user_id UUID,
  -- Entity-specific parameters
  p_filters JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role TEXT;
  v_institution_ids UUID[];
  v_department_id UUID;
  v_result JSONB;
BEGIN
  -- 1. Get user context
  SELECT role, department_id INTO v_user_role, v_department_id
  FROM profiles WHERE id = p_user_id;

  SELECT array_agg(institution_id) INTO v_institution_ids
  FROM user_institution_access WHERE user_id = p_user_id;

  -- 2. Build query with role-based filtering
  -- 3. Execute and return JSONB result

  RETURN v_result;
END;
$$;
```

---

## 3. Academic Module RPC Functions

### 3.1 ai_rpc_attendance

```sql
CREATE OR REPLACE FUNCTION ai_rpc_attendance(
  p_user_id UUID,
  p_student_id UUID DEFAULT NULL,
  p_section_id UUID DEFAULT NULL,
  p_department_id UUID DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_threshold NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
  v_institution_ids UUID[];
  v_user_department_id UUID;
  v_result JSONB;
BEGIN
  -- Get user context
  SELECT role, department_id INTO v_user_role, v_user_department_id
  FROM profiles WHERE id = p_user_id;

  SELECT array_agg(institution_id) INTO v_institution_ids
  FROM user_institution_access WHERE user_id = p_user_id;

  -- Build filtered query based on role
  WITH filtered_attendance AS (
    SELECT
      sa.id,
      sa.student_id,
      s.first_name || ' ' || COALESCE(s.last_name, '') as student_name,
      s.roll_number,
      sa.attendance_date,
      sa.total_periods,
      sa.present_periods,
      ROUND((sa.present_periods::NUMERIC / NULLIF(sa.total_periods, 0)) * 100, 2) as percentage,
      d.department_name,
      sec.section_name
    FROM student_attendance sa
    JOIN students s ON sa.student_id = s.id
    LEFT JOIN departments d ON sa.department_id = d.id
    LEFT JOIN sections sec ON sa.section_id = sec.id
    WHERE
      -- Institution filter
      sa.institution_id = ANY(v_institution_ids)
      -- Role-based filtering
      AND (
        v_user_role = 'super_admin'
        OR (v_user_role = 'admin')
        OR (v_user_role IN ('hod', 'principal') AND sa.department_id = v_user_department_id)
        OR (v_user_role = 'faculty' AND sa.section_id IN (
          SELECT DISTINCT section_id FROM staff_plan_courses spc
          JOIN staff st ON spc.staff_id = st.id
          WHERE st.profile_id = p_user_id
        ))
        OR (v_user_role = 'learner' AND sa.student_id = (
          SELECT id FROM students WHERE college_email = (
            SELECT email FROM profiles WHERE id = p_user_id
          )
        ))
      )
      -- Optional filters
      AND (p_student_id IS NULL OR sa.student_id = p_student_id)
      AND (p_section_id IS NULL OR sa.section_id = p_section_id)
      AND (p_department_id IS NULL OR sa.department_id = p_department_id)
      AND (p_date_from IS NULL OR sa.attendance_date >= p_date_from)
      AND (p_date_to IS NULL OR sa.attendance_date <= p_date_to)
    ORDER BY sa.attendance_date DESC
    LIMIT 100
  )
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(to_jsonb(fa)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', (SELECT COUNT(*) FROM filtered_attendance),
      'returned_count', (SELECT COUNT(*) FROM filtered_attendance),
      'filters_applied', jsonb_build_object(
        'student_id', p_student_id,
        'section_id', p_section_id,
        'department_id', p_department_id,
        'date_from', p_date_from,
        'date_to', p_date_to,
        'threshold', p_threshold
      )
    ),
    'actions_available', jsonb_build_array(
      jsonb_build_object('id', 'export_csv', 'label', 'Export CSV', 'tier', 1),
      jsonb_build_object('id', 'send_sms', 'label', 'Send Warning SMS', 'tier', 2)
    )
  ) INTO v_result
  FROM filtered_attendance fa;

  RETURN v_result;
END;
$$;
```

### 3.2 ai_rpc_attendance_defaulters

```sql
CREATE OR REPLACE FUNCTION ai_rpc_attendance_defaulters(
  p_user_id UUID,
  p_department_id UUID DEFAULT NULL,
  p_threshold NUMERIC DEFAULT 75,
  p_semester TEXT DEFAULT 'current'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
  v_institution_ids UUID[];
  v_user_department_id UUID;
  v_result JSONB;
BEGIN
  -- Get user context
  SELECT role, department_id INTO v_user_role, v_user_department_id
  FROM profiles WHERE id = p_user_id;

  SELECT array_agg(institution_id) INTO v_institution_ids
  FROM user_institution_access WHERE user_id = p_user_id;

  WITH attendance_summary AS (
    SELECT
      s.id as student_id,
      s.first_name || ' ' || COALESCE(s.last_name, '') as student_name,
      s.roll_number,
      s.student_mobile,
      d.department_name,
      sec.section_name,
      SUM(sa.present_periods) as total_present,
      SUM(sa.total_periods) as total_periods,
      ROUND((SUM(sa.present_periods)::NUMERIC / NULLIF(SUM(sa.total_periods), 0)) * 100, 2) as percentage
    FROM students s
    JOIN student_attendance sa ON s.id = sa.student_id
    LEFT JOIN departments d ON s.department_id = d.id
    LEFT JOIN sections sec ON s.section_id = sec.id
    WHERE
      s.institution_id = ANY(v_institution_ids)
      AND s.status = 'active'
      AND (
        v_user_role = 'super_admin'
        OR (v_user_role = 'admin')
        OR (v_user_role IN ('hod', 'principal') AND s.department_id = v_user_department_id)
        OR (v_user_role = 'faculty' AND s.section_id IN (
          SELECT DISTINCT section_id FROM staff_plan_courses spc
          JOIN staff st ON spc.staff_id = st.id
          WHERE st.profile_id = p_user_id
        ))
      )
      AND (p_department_id IS NULL OR s.department_id = p_department_id)
    GROUP BY s.id, s.first_name, s.last_name, s.roll_number, s.student_mobile,
             d.department_name, sec.section_name
    HAVING ROUND((SUM(sa.present_periods)::NUMERIC / NULLIF(SUM(sa.total_periods), 0)) * 100, 2) < p_threshold
    ORDER BY percentage ASC
    LIMIT 100
  )
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(to_jsonb(a)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', (SELECT COUNT(*) FROM attendance_summary),
      'threshold_applied', p_threshold
    ),
    'actions_available', jsonb_build_array(
      jsonb_build_object('id', 'export_csv', 'label', 'Export CSV', 'tier', 1),
      jsonb_build_object('id', 'send_sms', 'label', 'Send Warning SMS', 'tier', 2),
      jsonb_build_object('id', 'send_email', 'label', 'Email Parents', 'tier', 2)
    )
  ) INTO v_result
  FROM attendance_summary a;

  RETURN v_result;
END;
$$;
```

---

## 4. Billing Module RPC Functions

### 4.1 ai_rpc_fee_defaulters

```sql
CREATE OR REPLACE FUNCTION ai_rpc_fee_defaulters(
  p_user_id UUID,
  p_department_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT 'unpaid',
  p_min_amount NUMERIC DEFAULT NULL,
  p_due_before DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
  v_institution_ids UUID[];
  v_result JSONB;
BEGIN
  -- Get user context
  SELECT role INTO v_user_role FROM profiles WHERE id = p_user_id;

  SELECT array_agg(institution_id) INTO v_institution_ids
  FROM user_institution_access WHERE user_id = p_user_id;

  WITH fee_defaulters AS (
    SELECT
      s.id as student_id,
      s.first_name || ' ' || COALESCE(s.last_name, '') as student_name,
      s.roll_number,
      s.student_mobile,
      d.department_name,
      SUM(bsb.balance_amount) as total_pending,
      COUNT(bsb.id) as pending_bills,
      MIN(bsb.due_date) as earliest_due_date
    FROM billing_student_bills bsb
    JOIN students s ON bsb.student_id = s.id
    LEFT JOIN departments d ON s.department_id = d.id
    WHERE
      bsb.institution_id = ANY(v_institution_ids)
      AND bsb.status = p_status
      AND bsb.balance_amount > 0
      AND (
        v_user_role IN ('super_admin', 'admin')
        OR (v_user_role IN ('hod', 'principal') AND s.department_id = (
          SELECT department_id FROM profiles WHERE id = p_user_id
        ))
      )
      AND (p_department_id IS NULL OR s.department_id = p_department_id)
      AND (p_min_amount IS NULL OR bsb.balance_amount >= p_min_amount)
      AND (p_due_before IS NULL OR bsb.due_date <= p_due_before)
    GROUP BY s.id, s.first_name, s.last_name, s.roll_number, s.student_mobile, d.department_name
    ORDER BY total_pending DESC
    LIMIT 100
  )
  SELECT jsonb_build_object(
    'success', true,
    'data', COALESCE(jsonb_agg(to_jsonb(fd)), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'total_count', (SELECT COUNT(*) FROM fee_defaulters),
      'total_pending_amount', (SELECT SUM(total_pending) FROM fee_defaulters)
    ),
    'actions_available', jsonb_build_array(
      jsonb_build_object('id', 'export_csv', 'label', 'Export CSV', 'tier', 1),
      jsonb_build_object('id', 'send_sms', 'label', 'Send Payment Reminder', 'tier', 2)
    )
  ) INTO v_result
  FROM fee_defaulters fd;

  RETURN v_result;
END;
$$;
```

---

## 5. User Context RPC Function

```sql
CREATE OR REPLACE FUNCTION ai_rpc_user_context(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'user_id', p.id,
    'email', p.email,
    'full_name', p.full_name,
    'role', p.role,
    'is_super_admin', COALESCE(p.is_super_admin, false),
    'institution_id', p.institution_id,
    'department_id', p.department_id,
    'department_name', d.department_name,
    'institution_name', i.name,
    'permissions', COALESCE((
      SELECT jsonb_agg(DISTINCT perm)
      FROM (
        SELECT jsonb_array_elements_text(cr.permissions::jsonb) as perm
        FROM user_roles ur
        JOIN custom_roles cr ON ur.role_id = cr.id
        WHERE ur.user_id = p_user_id
      ) perms
    ), '[]'::jsonb),
    'accessible_institutions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', uia.institution_id,
        'name', inst.name,
        'access_type', uia.access_type
      )), '[]'::jsonb)
      FROM user_institution_access uia
      JOIN institutions inst ON uia.institution_id = inst.id
      WHERE uia.user_id = p_user_id
    )
  ) INTO v_result
  FROM profiles p
  LEFT JOIN departments d ON p.department_id = d.id
  LEFT JOIN institutions i ON p.institution_id = i.id
  WHERE p.id = p_user_id;

  RETURN v_result;
END;
$$;
```

---

## 6. Permission Validation RPC Function

```sql
CREATE OR REPLACE FUNCTION ai_rpc_validate_permission(
  p_user_id UUID,
  p_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_super_admin BOOLEAN;
  v_has_permission BOOLEAN;
BEGIN
  -- Check if super admin
  SELECT COALESCE(is_super_admin, false) INTO v_is_super_admin
  FROM profiles WHERE id = p_user_id;

  IF v_is_super_admin THEN
    RETURN true;
  END IF;

  -- Check user's roles for the permission
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN custom_roles cr ON ur.role_id = cr.id
    WHERE ur.user_id = p_user_id
    AND cr.permissions::jsonb ? p_permission
  ) INTO v_has_permission;

  RETURN v_has_permission;
END;
$$;
```

---

## 7. Export Data RPC Function

```sql
CREATE OR REPLACE FUNCTION ai_rpc_export_data(
  p_user_id UUID,
  p_data JSONB,
  p_format TEXT DEFAULT 'csv',
  p_filename TEXT DEFAULT 'export'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Log export action
  INSERT INTO ai_query_logs (
    user_id, query_text, query_type, tools_called, success
  ) VALUES (
    p_user_id,
    'Export data: ' || p_filename,
    'export',
    jsonb_build_array('export_csv'),
    true
  );

  -- Return data for client-side export
  RETURN jsonb_build_object(
    'success', true,
    'export_ready', true,
    'data', p_data,
    'format', p_format,
    'filename', p_filename || '_' || to_char(now(), 'YYYYMMDD_HH24MI'),
    'row_count', jsonb_array_length(p_data)
  );
END;
$$;
```

---

## 8. Grant Permissions

```sql
-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION ai_rpc_attendance TO authenticated;
GRANT EXECUTE ON FUNCTION ai_rpc_attendance_defaulters TO authenticated;
GRANT EXECUTE ON FUNCTION ai_rpc_fee_defaulters TO authenticated;
GRANT EXECUTE ON FUNCTION ai_rpc_user_context TO authenticated;
GRANT EXECUTE ON FUNCTION ai_rpc_validate_permission TO authenticated;
GRANT EXECUTE ON FUNCTION ai_rpc_export_data TO authenticated;
GRANT EXECUTE ON FUNCTION check_ai_query_rate_limit TO authenticated;

-- Grant table access
GRANT SELECT, INSERT ON ai_query_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ai_query_rate_limits TO authenticated;
```

---

## 9. Additional RPC Functions Required

The following RPC functions need to be created following the same pattern:

### Academic
- `ai_rpc_timetables`
- `ai_rpc_timetable_slots`
- `ai_rpc_periods`
- `ai_rpc_staff_plans`
- `ai_rpc_courses`
- `ai_rpc_academic_years`

### Billing
- `ai_rpc_student_bills`
- `ai_rpc_bills_summary`
- `ai_rpc_invoices`
- `ai_rpc_receipts`
- `ai_rpc_discounts`
- `ai_rpc_refunds`
- `ai_rpc_billing_categories`
- `ai_rpc_payment_transactions`

### Students
- `ai_rpc_students`
- `ai_rpc_student_details`
- `ai_rpc_students_by_status`
- `ai_rpc_students_by_section`
- `ai_rpc_onboarding_status`
- `ai_rpc_promotion_candidates`

### Staff
- `ai_rpc_staff`
- `ai_rpc_staff_details`
- `ai_rpc_staff_by_department`
- `ai_rpc_employment_categories`
- `ai_rpc_faculty_assignments`

### (Continue for all modules...)
