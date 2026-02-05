# TQM Security Fixes Checklist

**Date Created:** 2026-02-05
**Status:** 🔴 IN PROGRESS
**Based On:** TQM-COMPREHENSIVE-SECURITY-AUDIT-2026-02-05.md

---

## ✅ COMPLETED FIXES

### Previous Security Review (2026-02-01)
- [x] SQL injection prevention via `sanitizeSearch()` - ALL MODULES
- [x] Cross-institution access control - ALL MODULES
- [x] Race condition fix in Process Excellence `advanceStage()`
- [x] OTP rate limiting (3 per 5 min, 15-min lockout)
- [x] OTP verification rate limiting (5 attempts, 30-min lockout)
- [x] Parent Portal session management with httpOnly cookies
- [x] CSRF token generation and validation utilities

---

## 🔴 PRIORITY 1: CRITICAL (Fix within 1 week)

### MA-01: Maturity Assessment Approval Authorization
**File:** `/app/api/maturity-assessment/assessments/[id]/approve/route.ts`
**Status:** ❌ NOT FIXED
**Risk:** Any user can approve own assessments, bypassing review process

**Required Changes:**
```typescript
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { session } = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ✅ ADD: Get user role
  const { data: user } = await supabase
    .from('profiles')
    .select('role, institution_id')
    .eq('id', session.user.id)
    .single();

  // ✅ ADD: Verify user has approval permissions
  if (!['super_admin', 'admin', 'hod'].includes(user.role)) {
    return NextResponse.json(
      { error: 'Only administrators can approve assessments' },
      { status: 403 }
    );
  }

  // ✅ ADD: Verify user is not the assessor (no self-approval)
  const assessment = await MaturityAssessmentService.getAssessmentById(params.id);
  if (assessment.assessor_id === session.user.id) {
    return NextResponse.json(
      { error: 'Cannot approve own assessment' },
      { status: 403 }
    );
  }

  // ✅ ADD: Verify same institution
  if (user.institution_id !== assessment.institution_id) {
    return NextResponse.json(
      { error: 'Cannot approve assessments from different institution' },
      { status: 403 }
    );
  }

  // Now safe to approve
  const updated = await MaturityAssessmentService.updateAssessment(params.id, {
    status: 'approved',
    approved_by: session.user.id,
    approved_at: new Date().toISOString()
  });

  return NextResponse.json(updated);
}
```

**Testing:**
1. Create assessment as user A
2. Attempt to approve as user A → Should fail with 403
3. Attempt to approve as user B (learner role) → Should fail with 403
4. Attempt to approve as admin from different institution → Should fail with 403
5. Approve as admin from same institution → Should succeed with 200

---

### COPQ-01: Cost Field Validation
**Files:**
- `/supabase/migrations/[new]_add_copq_cost_constraints.sql`
- `/lib/services/billing/copq/billing-copq-service.ts`
- `/lib/validations/billing-copq.ts`

**Status:** ❌ NOT FIXED
**Risk:** Negative costs, integer overflow, financial report manipulation

**Required Changes:**

**1. Database Constraints:**
```sql
-- supabase/migrations/20260206000001_add_copq_cost_constraints.sql

-- Add cost validation constraints
ALTER TABLE billing_copq_incidents
ADD CONSTRAINT copq_cost_positive CHECK (cost >= 0),
ADD CONSTRAINT copq_cost_reasonable CHECK (cost <= 10000000); -- $10M max

-- Update existing invalid data first
UPDATE billing_copq_incidents SET cost = 0 WHERE cost < 0;
UPDATE billing_copq_incidents SET cost = 10000000 WHERE cost > 10000000;
```

**2. Zod Validation Schema:**
```typescript
// lib/validations/billing-copq.ts

export const createCOPQIncidentSchema = z.object({
  institution_id: z.string().uuid(),
  category: z.enum(['prevention', 'appraisal', 'internal_failure', 'external_failure']),
  description: z.string().min(10).max(500),
  cost: z.number()
    .min(0, 'Cost cannot be negative')
    .max(10000000, 'Cost exceeds maximum allowed value ($10,000,000)')
    .multipleOf(0.01, 'Cost must have at most 2 decimal places')
    .finite('Cost must be a finite number'),
  // ... rest of schema
});
```

**3. Service Layer Validation:**
```typescript
// lib/services/billing/copq/billing-copq-service.ts

static async createIncident(data: CreateCOPQIncidentDto): Promise<BillingCOPQIncident> {
  // ✅ ADD: Validate cost constraints
  if (data.cost < 0) {
    throw new Error('Cost cannot be negative');
  }

  if (data.cost > 10000000) {
    throw new Error('Cost exceeds maximum allowed value ($10,000,000)');
  }

  if (!Number.isFinite(data.cost)) {
    throw new Error('Cost must be a finite number');
  }

  // ✅ ADD: Validate decimal precision
  const costStr = data.cost.toFixed(2);
  if (parseFloat(costStr) !== data.cost) {
    data.cost = parseFloat(costStr); // Round to 2 decimals
  }

  const { data: incident, error } = await this.supabase
    .from('billing_copq_incidents')
    .insert(data)
    .select()
    .single();

  if (error) {
    console.error('[billing/copq] Error creating incident:', error);
    throw new Error('Failed to create COPQ incident');
  }

  return incident as BillingCOPQIncident;
}
```

**Testing:**
1. Attempt to create incident with cost = -1000 → Should fail with error
2. Attempt to create incident with cost = 99999999999 → Should fail with error
3. Create incident with cost = 1234.567 → Should round to 1234.57
4. Create incident with cost = 5000.00 → Should succeed
5. Verify database constraint by direct SQL: `INSERT INTO billing_copq_incidents (cost) VALUES (-100)` → Should fail

---

### PP-02: Parent-Learner Link Ownership Verification
**File:** `/lib/services/parent-portal/parent-portal-service.ts`
**Status:** ❌ NOT FIXED
**Risk:** Parent can link to any learner, access unauthorized student data

**Required Changes:**
```typescript
// lib/services/parent-portal/parent-portal-service.ts

static async linkLearner(input: LinkLearnerDto, authenticatedParentId?: string): Promise<ParentLearnerLink> {
  const supabase: any = createClientSupabaseClient();

  // ✅ ADD: Verify authenticated parent owns the parent_id
  if (authenticatedParentId && input.parent_id !== authenticatedParentId) {
    throw new Error('Cannot link learner to different parent account');
  }

  // ✅ ADD: Verify parent exists and get institution
  const { data: parent, error: parentError } = await supabase
    .from('parent_profiles')
    .select('institution_id, id')
    .eq('id', input.parent_id)
    .single();

  if (parentError || !parent) {
    console.error('[parent-portal] Parent not found:', { parentId: input.parent_id });
    throw new Error('Parent profile not found');
  }

  // ✅ ADD: Verify learner exists and get institution
  const { data: learner, error: learnerError } = await supabase
    .from('learners_profiles')
    .select('institution_id, id')
    .eq('id', input.learner_id)
    .single();

  if (learnerError || !learner) {
    console.error('[parent-portal] Learner not found:', { learnerId: input.learner_id });
    throw new Error('Learner not found');
  }

  // ✅ ADD: Verify parent and learner are in same institution
  if (parent.institution_id !== learner.institution_id) {
    console.error('[parent-portal] Cross-institution link attempt:', {
      parentInstitution: parent.institution_id,
      learnerInstitution: learner.institution_id
    });
    throw new Error('Parent and learner must belong to the same institution');
  }

  // ✅ ADD: Check for duplicate link
  const { data: existing } = await supabase
    .from('parent_learner_links')
    .select('id')
    .eq('parent_id', input.parent_id)
    .eq('learner_id', input.learner_id)
    .single();

  if (existing) {
    throw new Error('This learner is already linked to your account');
  }

  // Now safe to create link
  const { data, error } = await supabase
    .from('parent_learner_links')
    .insert(input)
    .select()
    .single();

  if (error) {
    console.error('[parent-portal] Error linking learner:', error);
    throw new Error('Failed to link learner');
  }

  return data as ParentLearnerLink;
}
```

**API Route Update:**
```typescript
// app/api/parent-portal/learners/link/route.ts

export async function POST(request: Request) {
  const { session } = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ✅ ADD: Get authenticated parent_id from session
  const { data: parentProfile } = await supabase
    .from('parent_profiles')
    .select('id')
    .eq('user_id', session.user.id)
    .single();

  if (!parentProfile) {
    return NextResponse.json({ error: 'Parent profile not found' }, { status: 404 });
  }

  const body = await request.json();
  const validated = linkLearnerSchema.parse(body);

  // ✅ PASS: authenticated parent ID for verification
  const link = await ParentPortalService.linkLearner(validated, parentProfile.id);

  return NextResponse.json(link, { status: 201 });
}
```

**Testing:**
1. Login as parent A
2. Attempt to link learner with parent_id = parent B → Should fail with 403
3. Attempt to link learner from different institution → Should fail with error
4. Link learner from same institution → Should succeed
5. Attempt to link same learner again → Should fail with error

---

## 🟡 PRIORITY 2: HIGH (Fix within 2 weeks)

### GT-01: Ticket Assignee Permission Validation
**File:** `/lib/services/grievance/grievance-service.ts`
**Status:** ❌ NOT FIXED

**Required Changes:**
```typescript
static async updateTicket(id: string, updateData: UpdateGrievanceTicketDto): Promise<GrievanceTicket> {
  // ✅ ADD: Validate assignee has proper role if assignment is being changed
  if (updateData.assigned_to) {
    const { data: assignee } = await this.supabase
      .from('profiles')
      .select('role, institution_id')
      .eq('id', updateData.assigned_to)
      .single();

    if (!assignee) {
      throw new Error('Assignee not found');
    }

    if (!['super_admin', 'admin', 'staff', 'faculty', 'hod'].includes(assignee.role)) {
      throw new Error('Assignee must have staff-level permissions');
    }

    // Verify assignee is from same institution as ticket
    const ticket = await this.getTicket(id);
    if (assignee.institution_id !== ticket.institution_id) {
      throw new Error('Cannot assign to user from different institution');
    }
  }

  const { data, error } = await this.supabase
    .from('grievance_tickets')
    .update(updateData)
    .eq('id', id)
    .select(`
      *,
      category:grievance_categories(id, name),
      assignee:profiles!grievance_tickets_assigned_to_fkey(id, full_name, email)
    `)
    .single();

  if (error) {
    console.error('[GrievanceService] Error updating ticket:', error);
    throw new Error('Failed to update ticket');
  }

  return data as GrievanceTicket;
}
```

---

### PP-01: Remove OTP from Development API Response
**File:** `/supabase/migrations/20260201100003_add_otp_rate_limiting.sql`
**Status:** ❌ NOT FIXED

**Required Changes:**
```sql
-- Update function to NEVER return OTP in API response
CREATE OR REPLACE FUNCTION send_parent_otp(
  p_phone TEXT,
  p_institution_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_otp TEXT;
  v_expires_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- ... (rate limiting logic stays the same) ...

  v_otp := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
  v_expires_at := v_now + INTERVAL '10 minutes';

  INSERT INTO parent_otp_verifications (phone, otp, institution_id, expires_at, attempt_count, last_attempt_at)
  VALUES (p_phone, v_otp, p_institution_id, v_expires_at, 1, v_now)
  ON CONFLICT (phone, institution_id)
  DO UPDATE SET
    otp = v_otp,
    expires_at = v_expires_at,
    verified = FALSE,
    verified_at = NULL,
    attempt_count = parent_otp_verifications.attempt_count + 1,
    last_attempt_at = v_now,
    updated_at = v_now;

  -- ✅ CHANGE: Never return OTP in response
  -- For testing, query database directly or use admin panel
  RETURN jsonb_build_object(
    'success', TRUE,
    'expires_at', v_expires_at
    -- ❌ REMOVED: 'otp' field
  );
END;
$$;
```

**Alternative:** Create admin endpoint for testing OTP retrieval (protected by super_admin role).

---

### MA-02: Server-Side Maturity Score Calculation
**File:** `/lib/services/maturity-assessment/maturity-assessment-service.ts`
**Status:** ❌ NOT FIXED

**Required Changes:**
```typescript
static async submitAssessment(
  id: string,
  responses: AssessmentResponse[]
): Promise<MaturityAssessment> {
  // ✅ ADD: Recalculate score server-side
  const scores = responses
    .filter(r => r.score !== null && r.score !== undefined)
    .map(r => r.score);

  if (scores.length === 0) {
    throw new Error('Assessment must have at least one scored response');
  }

  // Calculate average maturity score
  const maturity_score = scores.reduce((a, b) => a + b, 0) / scores.length;

  // ✅ ADD: Validate score is within expected range (0-5 for typical maturity models)
  if (maturity_score < 0 || maturity_score > 5) {
    throw new Error(`Invalid maturity score calculated: ${maturity_score}`);
  }

  // Round to 2 decimal places
  const rounded_score = Math.round(maturity_score * 100) / 100;

  const { data, error } = await this.supabase
    .from('maturity_assessments')
    .update({
      responses,
      maturity_score: rounded_score,  // ✅ Use server-calculated score
      status: 'submitted',
      submitted_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[MaturityAssessmentService] Error submitting assessment:', error);
    throw new Error('Failed to submit assessment');
  }

  return data as MaturityAssessment;
}
```

**Client-Side Change:**
```typescript
// app/(routes)/maturity-assessment/[id]/page.tsx

// ❌ REMOVE: Client-side score calculation and submission
const handleSubmit = async () => {
  // Just send responses, server will calculate score
  await MaturityAssessmentService.submitAssessment(assessmentId, responses);
};
```

---

### COPQ-02: Arithmetic Overflow Protection
**File:** `/lib/services/billing/copq/billing-copq-service.ts`
**Status:** ❌ NOT FIXED

**Required Changes:**
```typescript
static async getCOPQReport(filters: COPQReportFilters): Promise<COPQReport> {
  // Fetch incidents...
  const { data: incidents } = await this.supabase
    .from('billing_copq_incidents')
    .select('*')
    .eq('institution_id', filters.institution_id);

  // ✅ ADD: Safe aggregation with overflow protection
  let totalCost = 0;
  const categoryCosts: Record<string, number> = {
    prevention: 0,
    appraisal: 0,
    internal_failure: 0,
    external_failure: 0
  };

  for (const incident of incidents || []) {
    const cost = parseFloat(incident.cost);

    // ✅ Validate individual cost
    if (!Number.isFinite(cost) || cost < 0 || cost > 10000000) {
      console.error('[billing/copq] Invalid cost in incident:', incident.id);
      continue; // Skip invalid cost
    }

    // ✅ Check for overflow before adding
    if (totalCost + cost > Number.MAX_SAFE_INTEGER) {
      throw new Error('COPQ total cost exceeds maximum safe integer value');
    }

    totalCost += cost;
    categoryCosts[incident.category] = (categoryCosts[incident.category] || 0) + cost;
  }

  // ✅ Round to 2 decimal places
  totalCost = Math.round(totalCost * 100) / 100;
  Object.keys(categoryCosts).forEach(key => {
    categoryCosts[key] = Math.round(categoryCosts[key] * 100) / 100;
  });

  return {
    total_cost: totalCost,
    category_breakdown: categoryCosts,
    incidents: incidents || [],
    // ...
  };
}
```

---

## 🟢 PRIORITY 3: MEDIUM (Fix within 1 month)

### NPS-01: Add reCAPTCHA to Public Survey Submissions
- [ ] Install `react-google-recaptcha` package
- [ ] Add reCAPTCHA widget to survey submission form
- [ ] Validate reCAPTCHA token server-side before accepting response
- [ ] Add rate limiting (max 5 responses per IP per survey)

### OKR-01: Validate Check-In Timestamp Ordering
- [ ] Add validation in `OKRCheckInService.createCheckIn()`
- [ ] Prevent future-dated check-ins
- [ ] Prevent check-ins more than 30 days in the past
- [ ] Enforce monotonic ordering (new check-in must be after previous)

### CSRF-GLOBAL: Enforce CSRF on All State-Changing APIs
- [ ] Add CSRF validation to middleware for POST/PUT/PATCH/DELETE
- [ ] Ensure CSRF token included in all API client requests
- [ ] Add CSRF token to all form submissions
- [ ] Test CSRF protection on all TQM endpoints

### RATE-LIMIT: Implement Global Rate Limiting
- [ ] Set up Upstash Redis or alternative rate limiting service
- [ ] Implement rate limiting middleware (10 req/min per IP)
- [ ] Add stricter limits for sensitive endpoints (OTP, submissions)
- [ ] Add rate limit headers to responses (X-RateLimit-Remaining, etc.)

---

## 🔵 PRIORITY 4: LOW (Fix within 2 months)

### PE-01: Process Stage Completion Validation
- [ ] Verify all required stages completed before process completion
- [ ] Add validation in `ProcessExcellenceService.completeProcess()`
- [ ] Return list of missing required stages in error message

### GT-02: Comment Ownership Verification
- [ ] Add ownership check in `GrievanceService.updateComment()`
- [ ] Add ownership check in `GrievanceService.deleteComment()`
- [ ] Only allow comment author or admin to modify/delete

### OKR-03: API Request Signing for Auto-Track
- [ ] Implement HMAC-SHA256 signature verification
- [ ] Add API key management for external services
- [ ] Validate signature on all auto-track requests
- [ ] Add timestamp validation to prevent replay attacks

### COPQ-04: PII Redaction in Financial Reports
- [ ] Remove student/staff names from COPQ exports
- [ ] Use entity IDs instead of names in reports
- [ ] Add "anonymized" flag to report endpoints
- [ ] Implement GDPR-compliant data export format

---

## 📊 Progress Tracking

**Overall Status:**
- ✅ Completed: 7 items (Previous review fixes)
- ❌ Critical (P1): 3 items - **0% complete**
- 🟡 High (P2): 4 items - **0% complete**
- 🟢 Medium (P3): 4 items - **0% complete**
- 🔵 Low (P4): 4 items - **0% complete**

**Total Outstanding:** 15 items
**Estimated Effort:** 70 hours (~2 weeks with 2 developers)

---

## Testing Requirements

### After Each Fix
1. ✅ Unit test added for validation logic
2. ✅ Integration test for API endpoint
3. ✅ Manual penetration testing
4. ✅ Code review by security specialist
5. ✅ Update this checklist with status

### Before Production Deploy
1. [ ] All P1 (CRITICAL) items completed
2. [ ] All P2 (HIGH) items completed
3. [ ] CSRF enforcement active
4. [ ] Rate limiting active
5. [ ] Full penetration testing suite run
6. [ ] Security sign-off from senior engineer

---

## Sign-Off

**Date Completed:** _________________
**Completed By:** _________________
**Verified By:** _________________
**Approved for Production:** ☐ YES  ☐ NO

**Notes:**
___________________________________________
___________________________________________
___________________________________________
