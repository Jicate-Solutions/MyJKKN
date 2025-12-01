# Security Design: MyJKKN AI Query System

| Field | Detail |
|:------|:-------|
| **Version** | 1.0 |
| **Security Layers** | 5 |
| **Action Tiers** | 4 |

---

## 1. Security Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MULTI-LAYER SECURITY ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Layer 1: Authentication                                                     │
│  ├── Supabase JWT validation                                                │
│  ├── Session expiry check                                                   │
│  └── Account status verification                                            │
│                                                                              │
│  Layer 2: Authorization (API Route)                                         │
│  ├── Rate limiting                                                          │
│  ├── Institution access verification                                        │
│  └── User context building                                                  │
│                                                                              │
│  Layer 3: Permission Validation (MCP Server)                                │
│  ├── Tool-level permission check                                            │
│  ├── Action tier enforcement                                                │
│  └── Bulk action limits                                                     │
│                                                                              │
│  Layer 4: Data Filtering (RPC Functions)                                    │
│  ├── Role-based query filtering                                             │
│  ├── Institution scoping                                                    │
│  └── Department/section boundaries                                          │
│                                                                              │
│  Layer 5: Database Security (RLS Policies)                                  │
│  ├── Final enforcement layer                                                │
│  ├── Cannot be bypassed by application code                                 │
│  └── Audit logging                                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Layer 1: Authentication

### 2.1 Session Validation

Every request must pass through authentication:

```typescript
// middleware.ts pattern
const { data: { user }, error } = await supabase.auth.getUser();

if (error || !user) {
  return redirectToLogin();
}

// Check account is active
const { data: profile } = await supabase
  .from('profiles')
  .select('is_active, role')
  .eq('id', user.id)
  .single();

if (!profile?.is_active) {
  return redirectToLogin();
}
```

### 2.2 Token Security

- JWT tokens expire after 1 hour
- Refresh tokens rotate on use
- Tokens are HttpOnly cookies (not accessible to JavaScript)
- Secure flag enabled in production

---

## 3. Layer 2: Authorization (API Route)

### 3.1 Rate Limiting

Prevents abuse and controls API costs:

```typescript
const RATE_LIMITS = {
  queries_per_5_minutes: 30,
  max_results_display: 100,
  max_results_export: 10000,
  bulk_action_daily_limit: 500
};

async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  const { data } = await supabase.rpc('check_ai_query_rate_limit', {
    p_user_id: userId
  });

  return data as RateLimitResult;
}
```

### 3.2 Institution Access Verification

Users can only access data from institutions they have access to:

```typescript
const accessibleInstitutions = await supabase
  .from('user_institution_access')
  .select('institution_id')
  .eq('user_id', userId);

// All queries scoped to these institution IDs
```

---

## 4. Layer 3: Permission Validation (MCP Server)

### 4.1 Tool-Permission Mapping

Every MCP tool requires a specific permission:

```typescript
const TOOL_PERMISSIONS: Record<string, string> = {
  // Academic
  'get_attendance': 'academic.attendance.view',
  'get_attendance_defaulters': 'academic.attendance.view',
  'get_timetables': 'academic.timetables.view',
  'get_staff_plans': 'academic.staff_planning.view',

  // Billing
  'get_student_bills': 'billing.bills.view',
  'get_fee_defaulters': 'billing.bills.view',
  'get_invoices': 'billing.invoices.view',
  'get_receipts': 'billing.receipts.view',

  // Students
  'get_students': 'students.view',
  'get_student_details': 'students.view',

  // Staff
  'get_staff': 'staff.view',
  'get_staff_details': 'staff.view',

  // Actions
  'export_csv': '{module}.view', // Dynamic based on data source
  'send_notification': 'notifications.send',
  'send_sms': 'notifications.send',
  'bulk_notification': 'notifications.bulk',
  'create_complaint': 'complaints.create',

  // Blocked (require special handling)
  'delete_record': 'BLOCKED',
  'financial_transaction': 'BLOCKED'
};
```

### 4.2 Permission Check Implementation

```typescript
async function validateToolPermission(
  userId: string,
  toolName: string
): Promise<boolean> {
  const requiredPermission = TOOL_PERMISSIONS[toolName];

  if (requiredPermission === 'BLOCKED') {
    return false;
  }

  // Super admin bypass
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', userId)
    .single();

  if (profile?.is_super_admin) {
    return true;
  }

  // Check user's permissions
  const { data } = await supabase.rpc('ai_rpc_validate_permission', {
    p_user_id: userId,
    p_permission: requiredPermission
  });

  return data === true;
}
```

---

## 5. Layer 4: Data Filtering (RPC Functions)

### 5.1 Role-Based Access Matrix

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ROLE-BASED DATA ACCESS                              │
├─────────────┬───────────────────────────────────────────────────────────────┤
│ Role        │ Data Scope                                                    │
├─────────────┼───────────────────────────────────────────────────────────────┤
│ learner     │ Own data only (attendance, fees, grades, complaints)         │
├─────────────┼───────────────────────────────────────────────────────────────┤
│ faculty     │ Own data + students in assigned courses/sections             │
├─────────────┼───────────────────────────────────────────────────────────────┤
│ hod         │ Own data + all students/faculty in their department          │
├─────────────┼───────────────────────────────────────────────────────────────┤
│ principal   │ Own data + entire institution                                │
├─────────────┼───────────────────────────────────────────────────────────────┤
│ admin       │ All data in accessible institutions                          │
├─────────────┼───────────────────────────────────────────────────────────────┤
│ super_admin │ All data across all institutions (no restrictions)           │
└─────────────┴───────────────────────────────────────────────────────────────┘
```

### 5.2 RPC Function Pattern

Every RPC function implements role-based filtering:

```sql
CREATE OR REPLACE FUNCTION ai_rpc_[entity](
  p_user_id UUID,
  -- other parameters
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
  v_institution_ids UUID[];
  v_department_id UUID;
BEGIN
  -- Get user context
  SELECT role, department_id INTO v_user_role, v_department_id
  FROM profiles WHERE id = p_user_id;

  SELECT array_agg(institution_id) INTO v_institution_ids
  FROM user_institution_access WHERE user_id = p_user_id;

  -- Apply role-based filters
  CASE v_user_role
    WHEN 'super_admin' THEN
      -- No additional filters
      NULL;
    WHEN 'admin' THEN
      -- Filter by accessible institutions
      WHERE institution_id = ANY(v_institution_ids)
    WHEN 'hod', 'principal' THEN
      -- Filter by department
      WHERE department_id = v_department_id
        AND institution_id = ANY(v_institution_ids)
    WHEN 'faculty' THEN
      -- Filter by assigned sections/courses
      WHERE section_id IN (
        SELECT section_id FROM staff_plan_courses
        JOIN staff ON staff_plan_courses.staff_id = staff.id
        WHERE staff.profile_id = p_user_id
      )
    WHEN 'learner' THEN
      -- Only own data
      WHERE student_id = get_student_id_for_user(p_user_id)
  END;
END;
$$;
```

---

## 6. Layer 5: Database Security (RLS Policies)

### 6.1 RLS as Final Defense

Even if application code has bugs, RLS prevents unauthorized access:

```sql
-- Example: student_attendance table
ALTER TABLE student_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_attendance_access"
  ON student_attendance FOR SELECT
  USING (
    -- Super admin sees all
    (SELECT is_super_admin FROM profiles WHERE id = auth.uid())
    OR
    -- Admin sees accessible institutions
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid()
    )
    OR
    -- HOD sees their department
    (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'hod'
      AND department_id = (SELECT department_id FROM profiles WHERE id = auth.uid())
    )
    OR
    -- Student sees own attendance only
    (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'learner'
      AND student_id = (
        SELECT id FROM students
        WHERE college_email = (SELECT email FROM profiles WHERE id = auth.uid())
      )
    )
  );
```

---

## 7. Action Tier Security

### 7.1 Tier Classification

```
┌───────┬────────────────────────────┬─────────────────────┬──────────────────┐
│ Tier  │ Actions                    │ Permission Required │ Confirmation     │
├───────┼────────────────────────────┼─────────────────────┼──────────────────┤
│   1   │ export_csv                 │ [module].view       │ None (auto)      │
│       │ create_complaint           │ complaints.create   │                  │
│       │ mark_notification_read     │ notifications.view  │                  │
├───────┼────────────────────────────┼─────────────────────┼──────────────────┤
│   2   │ send_notification (<50)    │ notifications.send  │ One-click modal  │
│       │ send_sms (<50)             │ notifications.send  │                  │
│       │ send_email (<50)           │ notifications.send  │                  │
│       │ reserve_resource           │ resources.reserve   │                  │
├───────┼────────────────────────────┼─────────────────────┼──────────────────┤
│   3   │ bulk_notification (≥50)    │ notifications.bulk  │ Type "SEND TO    │
│       │ bulk_sms (≥50)             │ notifications.bulk  │ ALL" to confirm  │
│       │ bulk_email (≥50)           │ notifications.bulk  │                  │
├───────┼────────────────────────────┼─────────────────────┼──────────────────┤
│   4   │ delete_record              │ BLOCKED             │ "Contact admin"  │
│       │ financial_transaction      │ BLOCKED             │ message shown    │
│       │ modify_permissions         │ BLOCKED             │                  │
└───────┴────────────────────────────┴─────────────────────┴──────────────────┘
```

### 7.2 Tier Implementation

```typescript
async function executeAction(
  actionId: string,
  data: any,
  userContext: UserContext
): Promise<ActionResult> {
  const tier = ACTION_TIERS[actionId];

  // Tier 4: Blocked actions
  if (tier === 4) {
    return {
      success: false,
      error: 'This action requires administrator access. Please contact your admin.'
    };
  }

  // Tier 3: Bulk actions with explicit confirmation
  if (tier === 3) {
    const recipientCount = data.recipient_ids?.length || 0;

    // Enforce daily limit
    const dailyCount = await getDailyActionCount(userContext.user_id);
    if (dailyCount + recipientCount > 500) {
      return {
        success: false,
        error: `Daily bulk action limit (500) would be exceeded. You've used ${dailyCount} today.`
      };
    }
  }

  // Tier 2: Single confirmation
  // Tier 1: Auto-execute

  // Execute the action
  return await performAction(actionId, data, userContext);
}
```

---

## 8. Information Disclosure Prevention

### 8.1 Never Reveal Data Existence

When a user lacks permission, NEVER indicate whether the data exists:

```typescript
// ❌ BAD - reveals data exists
if (!hasPermission) {
  return { error: "You don't have permission to view this student's attendance" };
}

// ✅ GOOD - generic message
if (!hasPermission) {
  return { error: "This information is only available to authorized personnel." };
}
```

### 8.2 Error Message Standards

```typescript
const ERROR_MESSAGES = {
  UNAUTHORIZED: "Please log in to continue.",
  FORBIDDEN: "This information is only available to authorized personnel.",
  NOT_FOUND: "No results found for your query.",
  RATE_LIMITED: "Too many requests. Please wait a moment.",
  INVALID_QUERY: "I couldn't understand that query. Could you rephrase it?",
  SERVER_ERROR: "Something went wrong. Please try again."
};
```

---

## 9. Audit Logging

### 9.1 What Gets Logged

Every AI query is logged to `ai_query_logs`:

```sql
INSERT INTO ai_query_logs (
  user_id,
  institution_id,
  query_text,
  query_type,
  tools_called,
  response_time_ms,
  success,
  error_code,
  ip_address,
  user_agent
) VALUES (...);
```

### 9.2 Suspicious Activity Detection

Monitor for:
- Excessive queries (rate limit triggers)
- Repeated permission denials
- Unusual query patterns
- Late-night access from unusual locations

---

## 10. Security Checklist

### Pre-Launch Verification

- [ ] All RPC functions use `SECURITY DEFINER`
- [ ] All tables have RLS enabled
- [ ] Permission mapping complete for all tools
- [ ] Rate limiting tested
- [ ] Error messages don't leak information
- [ ] Audit logging working
- [ ] Super admin bypass tested
- [ ] Role-based filtering tested for all roles
- [ ] Bulk action limits enforced
- [ ] JWT validation on all routes

### Ongoing Security

- [ ] Monitor API usage for anomalies
- [ ] Review audit logs weekly
- [ ] Update permissions as features change
- [ ] Regular security testing
- [ ] Claude API key rotation schedule
