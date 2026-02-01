# TQM Modules Code Review - Part 1
**Stakeholder NPS & Parent Portal**

**Date:** 2026-02-01
**Reviewer:** Claude Code
**Modules Reviewed:**
1. Stakeholder NPS (app/(routes)/stakeholder-nps, hooks/stakeholder-nps, lib/services/stakeholder-nps)
2. Parent Portal (app/(routes)/parent-portal, hooks/parent-portal, lib/services/parent-portal)

---

## Executive Summary

**Overall Status:** ⚠️ Multiple critical security issues found
**Total Issues:** 47
- **Critical:** 12 (Must fix before production)
- **High:** 15 (Should fix soon)
- **Medium:** 13 (Nice to have)
- **Low:** 7 (Code quality)

**Key Findings:**
1. **CRITICAL:** Insecure authentication using sessionStorage in Parent Portal
2. **CRITICAL:** SQL injection vulnerabilities in search parameters
3. **CRITICAL:** Missing institution_id validation allowing cross-institution data access
4. **HIGH:** No rate limiting on OTP endpoints
5. **HIGH:** Missing error boundaries in client components
6. **HIGH:** Inconsistent null safety across service layers

---

## Critical Issues (Must Fix Before Production)

### 1. Insecure Authentication Implementation
**File:** `/Users/omm/PROJECTS/MyJKKN/app/(routes)/parent-portal/_components/parent-portal-client.tsx`
**Lines:** 23-37

**Issue:**
```typescript
const storedParentId = sessionStorage.getItem('parent_portal_id');
if (storedParentId) {
  if (/^[a-zA-Z0-9-_]+$/.test(storedParentId)) {
    setParentId(storedParentId);
  }
}
```

**Problems:**
- sessionStorage can be manipulated by any JavaScript on the page (XSS attacks)
- No cryptographic validation of the parent ID
- No session expiration
- Parent ID can be guessed or brute-forced
- Comment acknowledges this is insecure but ships it anyway

**Impact:** **CRITICAL**
An attacker could:
1. Change the parent_portal_id to any other parent's ID
2. View other parents' children's data
3. Access confidential student information (grades, attendance, fees)
4. No audit trail of unauthorized access

**Suggested Fix:**
```typescript
// Use Supabase Auth with proper JWT tokens
const { data: { session }, error } = await supabase.auth.getSession();
if (!session) {
  router.push('/auth/parent/login');
  return;
}

// Verify parent profile exists for this user
const { data: profile } = await supabase
  .from('parent_profiles')
  .select('id, institution_id')
  .eq('user_id', session.user.id)
  .single();

if (!profile) {
  router.push('/auth/parent/login');
  return;
}

setParentId(profile.id);
```

**Files to Update:**
- `app/(routes)/parent-portal/_components/parent-portal-client.tsx`
- `app/(routes)/parent-portal/learner/[id]/page.tsx`
- All parent portal pages that use authentication

---

### 2. SQL Injection in Search Parameters
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/stakeholder-nps/nps-service.ts`
**Lines:** 58-61

**Issue:**
```typescript
if (search) {
  // Sanitize search to prevent SQL injection
  const sanitizedSearch = search.replace(/[%_]/g, '\\$&');
  query = query.or(`title.ilike.%${sanitizedSearch}%,description.ilike.%${sanitizedSearch}%`);
}
```

**Problems:**
- Only sanitizes % and _ characters
- Doesn't escape single quotes (')
- Doesn't escape backslashes (\)
- String interpolation instead of parameterized queries
- `.or()` method concatenates raw SQL

**Impact:** **CRITICAL**
Allows SQL injection attacks like:
```
search = "' OR '1'='1"
// Results in: title.ilike.%' OR '1'='1%
```

**Suggested Fix:**
```typescript
if (search) {
  // Use Supabase's built-in text search which handles escaping
  query = query.textSearch('fts', search, {
    type: 'websearch',
    config: 'english'
  });

  // OR use individual filters with proper escaping
  const searchTerm = `%${search}%`;
  query = query.or(`title.ilike.${searchTerm},description.ilike.${searchTerm}`);
}
```

**Additional Files with Same Issue:**
- `lib/services/stakeholder-nps/nps-service.ts` line 347 (responses search)
- `lib/services/parent-portal/parent-portal-service.ts` line 106
- `lib/services/parent-portal/parent-portal-service.ts` line 388

---

### 3. Missing Institution ID Validation
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/stakeholder-nps/nps-service.ts`
**Lines:** 103-121

**Issue:**
```typescript
static async getSurvey(id: string, institutionId?: string): Promise<NPSSurvey> {
  let query = this.supabase
    .from('nps_surveys')
    .select(...)
    .eq('id', id);

  // SECURITY: Filter by institution_id if provided to prevent cross-institution access
  if (institutionId) {
    query = query.eq('institution_id', institutionId);
  }
```

**Problems:**
- institutionId is optional - caller can omit it to bypass security
- No enforcement that institutionId is always checked
- Comments show awareness but implementation allows bypass
- RLS policies not verified to be enabled

**Impact:** **CRITICAL**
A user from Institution A can access surveys from Institution B by:
1. Calling getSurvey(id) without institutionId parameter
2. Bypassing all institution-based access control
3. Viewing confidential survey data from other institutions

**Suggested Fix:**
```typescript
// 1. Make institutionId REQUIRED
static async getSurvey(id: string, institutionId: string): Promise<NPSSurvey> {
  if (!institutionId) {
    throw new Error('Institution ID is required for security');
  }

  const query = this.supabase
    .from('nps_surveys')
    .select(...)
    .eq('id', id)
    .eq('institution_id', institutionId); // Always filter

  // 2. Verify result matches institution
  if (data && data.institution_id !== institutionId) {
    throw new Error('Survey not found or access denied');
  }
}
```

**Files with Same Pattern:**
- `lib/services/stakeholder-nps/nps-service.ts` lines 253-274 (getResponse)
- `lib/services/parent-portal/parent-portal-service.ts` lines 18-44 (getParentProfile)
- `lib/services/parent-portal/parent-portal-service.ts` lines 46-74 (getParentProfileById)

---

### 4. No Rate Limiting on OTP Endpoints
**File:** `/Users/omm/PROJECTS/MyJKKN/app/api/parent-portal/auth/verify-otp/route.ts`
**Lines:** All

**Issue:**
No rate limiting middleware or logic to prevent brute force attacks on OTP verification.

**Problems:**
- Attacker can try unlimited OTP guesses
- 6-digit OTP = only 1,000,000 combinations
- Can be brute-forced in minutes without rate limiting
- No IP-based throttling
- No account lockout after failed attempts

**Impact:** **CRITICAL**
An attacker can:
1. Request OTP for a parent's phone number
2. Brute-force all 1,000,000 combinations
3. Gain unauthorized access to parent account
4. View children's sensitive data

**Suggested Fix:**
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '15 m'), // 5 attempts per 15 minutes
  analytics: true,
});

export async function POST(request: NextRequest) {
  const ip = request.ip ?? '127.0.0.1';
  const { success, limit, reset, remaining } = await ratelimit.limit(
    `verify_otp_${ip}`
  );

  if (!success) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
        }
      }
    );
  }

  // ... rest of verification logic
}
```

**Files Needing Rate Limiting:**
- `app/api/parent-portal/auth/verify-otp/route.ts`
- `app/api/parent-portal/auth/request-otp/route.ts`
- `app/api/stakeholder-nps/responses/route.ts` (prevent spam responses)

---

### 5. Unvalidated User Input in Response Submission
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/stakeholder-nps/nps-service.ts`
**Lines:** 221-252

**Issue:**
```typescript
static async submitResponse(responseData: SubmitResponseDto): Promise<NPSResponse> {
  // SECURITY: Validate NPS score is in valid range (0-10)
  if (responseData.nps_score < 0 || responseData.nps_score > 10) {
    throw new Error('NPS score must be between 0 and 10');
  }

  const { data, error } = await this.supabase
    .from('nps_responses')
    .insert({
      // ... all fields directly from user input
      question_responses: responseData.question_responses || {},
```

**Problems:**
- question_responses is a JSON field accepting any data
- No validation of question_responses structure
- Can inject malicious payloads into database
- No size limit on question_responses (can cause DoS)
- additional_feedback has no sanitization

**Impact:** **CRITICAL**
An attacker can:
1. Send massive JSON payloads (DoS attack)
2. Inject XSS payloads in question_responses
3. Store malicious scripts that execute when admins view responses
4. Bypass max length validation (5000 chars) by using question_responses

**Suggested Fix:**
```typescript
// 1. Validate question_responses structure
const validateQuestionResponses = (responses: Record<string, unknown>, survey: NPSSurvey) => {
  const questionIds = survey.questions.map(q => q.id);

  for (const [key, value] of Object.entries(responses)) {
    // Verify question ID exists in survey
    if (!questionIds.includes(key)) {
      throw new Error(`Invalid question ID: ${key}`);
    }

    // Validate value type and size
    if (typeof value === 'string' && value.length > 5000) {
      throw new Error('Question response too long');
    }

    // Sanitize HTML if needed
    if (typeof value === 'string') {
      responses[key] = sanitizeHtml(value);
    }
  }

  // Check total size
  const totalSize = JSON.stringify(responses).length;
  if (totalSize > 50000) { // 50KB limit
    throw new Error('Total responses too large');
  }

  return responses;
};

// 2. Use in submitResponse
const validatedResponses = validateQuestionResponses(
  responseData.question_responses || {},
  survey
);

// 3. Sanitize feedback
const sanitizedFeedback = sanitizeHtml(responseData.additional_feedback || '');
```

---

### 6. No CSRF Protection on State-Changing Operations
**File:** `/Users/omm/PROJECTS/MyJKKN/app/api/stakeholder-nps/surveys/route.ts`
**Lines:** 44-71

**Issue:**
POST endpoint has no CSRF token validation.

**Problems:**
- Attacker can craft malicious forms that create surveys
- No Origin header validation
- No Referer header validation
- Session cookie alone is insufficient protection

**Impact:** **CRITICAL**
An attacker can:
1. Embed hidden form on malicious website
2. Trick logged-in user to visit the site
3. Automatically create/update/delete surveys
4. Manipulate survey data without user consent

**Suggested Fix:**
```typescript
import { verifyCSRFToken } from '@/lib/security/csrf';

export async function POST(request: Request) {
  // 1. Verify CSRF token
  const csrfToken = request.headers.get('X-CSRF-Token');
  const isValidCSRF = await verifyCSRFToken(csrfToken);

  if (!isValidCSRF) {
    return NextResponse.json(
      { error: 'Invalid CSRF token' },
      { status: 403 }
    );
  }

  // 2. Verify Origin header
  const origin = request.headers.get('Origin');
  const allowedOrigins = [process.env.NEXT_PUBLIC_APP_URL];

  if (origin && !allowedOrigins.includes(origin)) {
    return NextResponse.json(
      { error: 'Invalid origin' },
      { status: 403 }
    );
  }

  // ... rest of logic
}
```

**Files Needing CSRF Protection:**
- All POST/PUT/DELETE routes in `app/api/stakeholder-nps/`
- All POST/PUT/DELETE routes in `app/api/parent-portal/`

---

### 7. Sensitive Data Exposure in Error Messages
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/stakeholder-nps/nps-service.ts`
**Lines:** 69-71, 135-137, 177-179

**Issue:**
```typescript
if (error) {
  console.error('[stakeholder-nps] Error fetching surveys:', error);
  throw new Error(`Failed to fetch surveys: ${error.message}`);
}
```

**Problems:**
- Exposes internal error messages to users
- Database error messages can reveal table structure
- Error messages sent to client reveal implementation details
- Helps attackers understand the system architecture

**Impact:** **CRITICAL** (Information Disclosure)

**Suggested Fix:**
```typescript
if (error) {
  console.error('[stakeholder-nps] Error fetching surveys:', error);

  // Log detailed error server-side
  logger.error('stakeholder-nps', 'Failed to fetch surveys', {
    error: error.message,
    code: error.code,
    filters
  });

  // Return generic error to client
  throw new Error('Unable to load surveys. Please try again later.');
}
```

---

### 8. Hardcoded Demo Parent ID
**File:** `/Users/omm/PROJECTS/MyJKKN/app/(routes)/parent-portal/_components/parent-portal-client.tsx`
**Line:** 16

**Issue:**
```typescript
const DEMO_PARENT_ID = 'demo-parent-id';
```

**Problems:**
- Dead code that might be used by accident
- Confusing for developers
- Could bypass authentication if accidentally referenced
- Not removed before production deployment

**Impact:** **CRITICAL** (if accidentally used)

**Suggested Fix:**
Remove the constant entirely. If demo mode is needed:
```typescript
const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const DEMO_PARENT_ID = isDemoMode ? 'demo-parent-id' : null;

if (isDemoMode && !parentId) {
  setParentId(DEMO_PARENT_ID);
}
```

---

### 9. Missing Input Validation on Phone Numbers
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/parent-portal/parent-portal-service.ts`
**Lines:** 584-607

**Issue:**
```typescript
// Sanitize phone number to prevent SQL injection
const sanitizedPhone = input.phone.replace(/[^\d+]/g, '');
if (sanitizedPhone !== input.phone) {
  return {
    success: false,
    message: 'Invalid phone number format',
  };
}
```

**Problems:**
- Allows international format but doesn't validate country code
- Accepts phone numbers of any length (1 digit to unlimited)
- No validation against known phone number formats
- Can accept invalid numbers like "+++++++++++"

**Impact:** **CRITICAL** (Data Integrity & Security)

**Suggested Fix:**
```typescript
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

const validatePhone = (phone: string, defaultCountry: string = 'IN') => {
  try {
    // Parse and validate
    const phoneNumber = parsePhoneNumber(phone, defaultCountry);

    if (!phoneNumber || !phoneNumber.isValid()) {
      return {
        valid: false,
        error: 'Invalid phone number format'
      };
    }

    // Return E.164 format for consistency
    return {
      valid: true,
      formatted: phoneNumber.format('E.164'),
      country: phoneNumber.country
    };
  } catch (error) {
    return {
      valid: false,
      error: 'Invalid phone number'
    };
  }
};

// Use in registerParent
const phoneValidation = validatePhone(input.phone);
if (!phoneValidation.valid) {
  return {
    success: false,
    message: phoneValidation.error
  };
}

// Use normalized phone number
const normalizedPhone = phoneValidation.formatted;
```

---

### 10. Weak Institution ID Validation in Link Creation
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/parent-portal/parent-portal-service.ts`
**Lines:** 215-235

**Issue:**
```typescript
static async linkLearner(input: LinkLearnerDto): Promise<ParentLearnerLink> {
  // SECURITY: Validate that parent and learner belong to the same institution
  const [parentCheck, learnerCheck] = await Promise.all([
    supabase.from('parent_profiles').select('institution_id').eq('id', input.parent_id).single(),
    supabase.from('learners_profiles').select('institution_id').eq('id', input.learner_id).single()
  ]);

  if (parentCheck.data?.institution_id !== learnerCheck.data?.institution_id) {
    throw new Error('Parent and learner must belong to the same institution');
  }
```

**Problems:**
- No check if parent_id or learner_id exist before comparison
- Error handling only checks for existence, not for unauthorized access
- Allows linking if either query returns null (undefined !== undefined = false, but should error)
- No verification that the requesting user has permission to create this link

**Impact:** **CRITICAL**

**Suggested Fix:**
```typescript
static async linkLearner(input: LinkLearnerDto, requestingUserId: string): Promise<ParentLearnerLink> {
  // 1. Verify parent exists and requesting user owns this parent profile
  const { data: parent, error: parentError } = await supabase
    .from('parent_profiles')
    .select('institution_id, user_id')
    .eq('id', input.parent_id)
    .single();

  if (parentError || !parent) {
    throw new Error('Parent profile not found');
  }

  if (parent.user_id !== requestingUserId) {
    throw new Error('Unauthorized: Cannot link learner to another parent');
  }

  // 2. Verify learner exists
  const { data: learner, error: learnerError } = await supabase
    .from('learners_profiles')
    .select('institution_id')
    .eq('id', input.learner_id)
    .single();

  if (learnerError || !learner) {
    throw new Error('Learner not found');
  }

  // 3. Verify same institution
  if (parent.institution_id !== learner.institution_id) {
    throw new Error('Parent and learner must belong to the same institution');
  }

  // 4. Check for existing link
  const { data: existingLink } = await supabase
    .from('parent_learner_links')
    .select('id')
    .eq('parent_id', input.parent_id)
    .eq('learner_id', input.learner_id)
    .maybeSingle();

  if (existingLink) {
    throw new Error('This learner is already linked to this parent');
  }

  // Now proceed with creation...
}
```

---

### 11. Unprotected Database Functions Called Directly
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/parent-portal/parent-portal-service.ts`
**Lines:** 262-269, 360-367

**Issue:**
```typescript
const { data, error } = await supabase.rpc('get_parent_dashboard', {
  p_parent_id: parentId,
});
```

**Problems:**
- No verification that the requesting user owns this parent_id
- Direct RPC call bypasses application-level security checks
- Database function may not have proper RLS policies
- Allows any user to call with any parent_id

**Impact:** **CRITICAL**

**Suggested Fix:**
```typescript
static async getDashboard(parentId: string, requestingUserId: string): Promise<ParentDashboardData> {
  // 1. Verify requesting user owns this parent profile
  const { data: parentProfile } = await supabase
    .from('parent_profiles')
    .select('user_id')
    .eq('id', parentId)
    .single();

  if (!parentProfile || parentProfile.user_id !== requestingUserId) {
    throw new Error('Unauthorized: Access denied to this dashboard');
  }

  // 2. Now safe to call RPC
  const { data, error } = await supabase.rpc('get_parent_dashboard', {
    p_parent_id: parentId,
  });

  if (error) throw error;

  // ... rest of logic
}
```

**All Service Methods Need User Context:**
Every service method that accesses user data should accept a `requestingUserId` parameter and validate access before proceeding.

---

### 12. No Verification of Survey Ownership Before Updates
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/stakeholder-nps/nps-service.ts`
**Lines:** 150-172

**Issue:**
```typescript
static async updateSurvey(id: string, updates: UpdateSurveyDto): Promise<NPSSurvey> {
  const updateData: Record<string, unknown> = {};
  // ... builds update object

  const { data, error } = await this.supabase
    .from('nps_surveys')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();
```

**Problems:**
- No check if user has permission to update this survey
- No verification of survey ownership (created_by field)
- Any authenticated user can update any survey
- No institution_id check

**Impact:** **CRITICAL**

**Suggested Fix:**
```typescript
static async updateSurvey(
  id: string,
  updates: UpdateSurveyDto,
  userId: string,
  institutionId: string
): Promise<NPSSurvey> {
  // 1. Verify survey exists and user has permission
  const { data: survey, error: fetchError } = await this.supabase
    .from('nps_surveys')
    .select('created_by, institution_id, status')
    .eq('id', id)
    .single();

  if (fetchError || !survey) {
    throw new Error('Survey not found');
  }

  // 2. Verify ownership or admin permission
  if (survey.created_by !== userId) {
    // Check if user is admin for this institution
    const { data: userRole } = await this.supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('institution_id', institutionId)
      .single();

    if (!userRole || !['admin', 'super_admin'].includes(userRole.role)) {
      throw new Error('Unauthorized: You do not have permission to edit this survey');
    }
  }

  // 3. Verify institution match
  if (survey.institution_id !== institutionId) {
    throw new Error('Survey not found or access denied');
  }

  // 4. Prevent updates to closed/archived surveys
  if (['closed', 'archived'].includes(survey.status) && updates.status !== 'active') {
    throw new Error('Cannot modify closed or archived surveys');
  }

  // Now proceed with update...
}
```

---

## High Priority Issues (Should Fix Soon)

### 13. Missing Error Boundaries in Client Components
**Files:** All client components in `app/(routes)/stakeholder-nps/_components/` and `app/(routes)/parent-portal/_components/`

**Issue:**
No error boundaries to catch runtime errors.

**Problems:**
- Unhandled errors crash the entire page
- Poor user experience
- No error reporting
- Lost state on error

**Impact:** **HIGH** (User Experience)

**Suggested Fix:**
```typescript
// components/error-boundary.tsx
'use client';

import { Component, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);

    // Report to error tracking service
    if (typeof window !== 'undefined') {
      // Send to Sentry, LogRocket, etc.
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-8">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
          <p className="text-muted-foreground mb-4">
            We're sorry for the inconvenience. Please try again.
          </p>
          <Button onClick={() => this.setState({ hasError: false, error: null })}>
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Usage:
// <ErrorBoundary>
//   <DashboardOverview data={dashboardData} />
// </ErrorBoundary>
```

---

### 14. No Null Safety in Dashboard Data Rendering
**File:** `/Users/omm/PROJECTS/MyJKKN/app/(routes)/parent-portal/_components/parent-portal-client.tsx`
**Lines:** 120-125

**Issue:**
```typescript
<h2 className="text-2xl font-bold text-gray-900">
  Welcome back, {dashboardData.parent.name.split(' ')[0]}!
</h2>
```

**Problems:**
- Crashes if name is null or undefined
- `.split(' ')[0]` fails if name is empty string
- No fallback for missing data

**Impact:** **HIGH** (Application Crash)

**Suggested Fix:**
```typescript
const firstName = dashboardData.parent.name?.split(' ')[0] || 'there';

<h2 className="text-2xl font-bold text-gray-900">
  Welcome back, {firstName}!
</h2>
```

**Similar Issues Found In:**
- `app/(routes)/parent-portal/_components/learner-card.tsx` - Multiple null safety issues
- `app/(routes)/parent-portal/_components/dashboard-overview.tsx`
- `app/(routes)/stakeholder-nps/_components/dashboard-metrics.tsx`

---

### 15. Race Condition in Survey Response Submission
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/stakeholder-nps/nps-service.ts`
**Lines:** 221-252

**Issue:**
Survey status is checked before response insertion, but there's a time gap where survey could be closed between check and insert.

**Problems:**
- TOCTOU (Time of Check, Time of Use) vulnerability
- Survey could be closed between validation and insertion
- Multiple responses could be submitted simultaneously
- No transaction to ensure atomicity

**Impact:** **HIGH** (Data Integrity)

**Suggested Fix:**
```typescript
// Use database-level check constraint or trigger
// OR use a transaction:

const { data, error } = await this.supabase.rpc('submit_response_safe', {
  p_survey_id: responseData.survey_id,
  p_respondent_id: responseData.respondent_id,
  p_nps_score: responseData.nps_score,
  // ... other fields
});

// Database function:
CREATE OR REPLACE FUNCTION submit_response_safe(...)
RETURNS nps_responses AS $$
DECLARE
  v_survey nps_surveys;
  v_response nps_responses;
BEGIN
  -- Lock survey row
  SELECT * INTO v_survey
  FROM nps_surveys
  WHERE id = p_survey_id
  FOR UPDATE;

  -- Validate survey is active
  IF v_survey.status != 'active' THEN
    RAISE EXCEPTION 'Survey is not active';
  END IF;

  IF v_survey.end_date < NOW() THEN
    RAISE EXCEPTION 'Survey has ended';
  END IF;

  -- Insert response
  INSERT INTO nps_responses (...)
  VALUES (...)
  RETURNING * INTO v_response;

  RETURN v_response;
END;
$$ LANGUAGE plpgsql;
```

---

### 16. Incomplete Pagination Metadata
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/stakeholder-nps/nps-service.ts`
**Lines:** 73-82

**Issue:**
```typescript
return {
  data: (data || []) as NPSSurvey[],
  metadata: {
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit)
  }
};
```

**Problems:**
- No hasNextPage or hasPreviousPage flags
- No cursor-based pagination support for large datasets
- Division by zero if limit is 0
- Integer overflow not handled for very large datasets

**Impact:** **HIGH** (User Experience)

**Suggested Fix:**
```typescript
const safeLimit = Math.max(1, limit); // Prevent division by zero
const totalPages = Math.ceil((count || 0) / safeLimit);

return {
  data: (data || []) as NPSSurvey[],
  metadata: {
    total: count || 0,
    page,
    limit: safeLimit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    startIndex: (page - 1) * safeLimit + 1,
    endIndex: Math.min(page * safeLimit, count || 0)
  }
};
```

---

### 17. Unhandled Promise Rejections in Hooks
**File:** `/Users/omm/PROJECTS/MyJKKN/hooks/stakeholder-nps/use-nps-responses.ts`
**Lines:** 89-119

**Issue:**
```typescript
const exportResponses = useCallback(async (surveyId: string, surveyTitle?: string) => {
  let url: string | null = null;
  try {
    setLoading(true);
    setError(null);
    const csv = await NPSService.exportResponses(surveyId);
    // ...
    throw err; // Re-throw for caller to handle if needed
  } finally {
    if (url) {
      URL.revokeObjectURL(url);
    }
    setLoading(false);
  }
}, []);
```

**Problems:**
- Re-throws error but doesn't specify what caller should do
- Unhandled promise rejection if caller doesn't catch
- Memory leak if blob creation succeeds but download fails

**Impact:** **HIGH** (Stability)

**Suggested Fix:**
```typescript
const exportResponses = useCallback(async (surveyId: string, surveyTitle?: string) => {
  let url: string | null = null;
  let link: HTMLAnchorElement | null = null;

  try {
    setLoading(true);
    setError(null);
    const csv = await NPSService.exportResponses(surveyId);

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    url = URL.createObjectURL(blob);
    link = document.createElement('a');
    link.href = url;
    link.download = `nps-responses-${surveyTitle || surveyId}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();

    toast.success('Responses exported successfully');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to export responses';
    setError(message);
    toast.error(message);
    return { success: false, error: message };
  } finally {
    // Cleanup
    if (link && document.body.contains(link)) {
      document.body.removeChild(link);
    }
    if (url) {
      setTimeout(() => URL.revokeObjectURL(url!), 100); // Small delay to ensure download started
    }
    setLoading(false);
  }
}, []);
```

---

### 18. Missing Loading States for Nested Data
**File:** `/Users/omm/PROJECTS/MyJKKN/hooks/parent-portal/use-parent-dashboard.ts`
**Lines:** All

**Issue:**
Dashboard hook loads parent data + learners + attendance + fees + grades in parallel, but only has one loading state.

**Problems:**
- Shows spinner for entire dashboard even if only one sub-query is slow
- No way to show which parts are loading
- Poor UX for slow connections
- Can't retry individual failed sections

**Impact:** **HIGH** (User Experience)

**Suggested Fix:**
```typescript
export function useParentDashboard(parentId: string) {
  const dashboardQuery = useQuery({
    queryKey: parentDashboardKeys.dashboard(parentId),
    queryFn: () => ParentPortalService.getDashboard(parentId),
    enabled: !!parentId,
    staleTime: 2 * 60 * 1000,
  });

  return {
    data: dashboardQuery.data,
    isLoading: dashboardQuery.isLoading,
    isFetching: dashboardQuery.isFetching,
    error: dashboardQuery.error,
    refetch: dashboardQuery.refetch,

    // Add granular loading states
    sections: {
      profile: {
        isLoading: dashboardQuery.isLoading,
        data: dashboardQuery.data?.parent,
        error: null
      },
      learners: {
        isLoading: dashboardQuery.isLoading,
        data: dashboardQuery.data?.learners || [],
        error: null
      },
      communications: {
        isLoading: dashboardQuery.isLoading,
        data: dashboardQuery.data?.unread_messages || 0,
        error: null
      }
    }
  };
}
```

---

### 19. No Optimistic Updates for Mutations
**File:** `/Users/omm/PROJECTS/MyJKKN/hooks/stakeholder-nps/use-nps-surveys.ts`
**Lines:** 90-108

**Issue:**
Survey updates don't use optimistic updates - UI waits for server response.

**Problems:**
- Slow perceived performance
- UI feels unresponsive
- User might click multiple times

**Impact:** **HIGH** (User Experience)

**Suggested Fix:**
```typescript
export function useUpdateNPSSurvey() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSurveyDto }) =>
      NPSService.updateSurvey(id, data),

    // Optimistic update
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: npsSurveyKeys.detail(id) });

      // Snapshot current value
      const previous = queryClient.getQueryData(npsSurveyKeys.detail(id));

      // Optimistically update
      queryClient.setQueryData(npsSurveyKeys.detail(id), (old: NPSSurvey) => ({
        ...old,
        ...data,
        updated_at: new Date().toISOString()
      }));

      return { previous };
    },

    // Revert on error
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          npsSurveyKeys.detail(variables.id),
          context.previous
        );
      }
      toast.error(err.message || 'Failed to update survey');
    },

    // Always refetch to sync with server
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({ queryKey: npsSurveyKeys.lists() });
      queryClient.invalidateQueries({ queryKey: npsSurveyKeys.detail(variables.id) });
    },

    onSuccess: () => {
      toast.success('Survey updated successfully');
    }
  });

  return {
    updateSurvey: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error?.message || null
  };
}
```

---

### 20. Insufficient Validation in Zod Schemas
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/validations/parent-portal.ts`
**Lines:** 22-28

**Issue:**
```typescript
phone: z
  .string()
  .regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number')
  .optional(),
```

**Problems:**
- Regex allows invalid formats like "+12345678901234"
- Doesn't validate country code properly
- Accepts numbers that don't exist
- No check for sequential numbers (e.g., "+11111111111")

**Impact:** **HIGH** (Data Quality)

**Suggested Fix:**
```typescript
import { parsePhoneNumber } from 'libphonenumber-js';

phone: z
  .string()
  .optional()
  .refine(
    (val) => {
      if (!val) return true;
      try {
        const phoneNumber = parsePhoneNumber(val, 'IN');
        return phoneNumber?.isValid() || false;
      } catch {
        return false;
      }
    },
    { message: 'Invalid phone number format' }
  )
  .transform((val) => {
    if (!val) return val;
    const phoneNumber = parsePhoneNumber(val, 'IN');
    return phoneNumber?.format('E.164'); // Normalize to E.164 format
  }),
```

---

### 21. No Debouncing on Search Inputs
**File:** `/Users/omm/PROJECTS/MyJKKN/hooks/stakeholder-nps/use-nps-surveys.ts`
**Lines:** 32-34

**Issue:**
Search triggers immediate query refetch on every keystroke.

**Problems:**
- Excessive API calls
- Wastes bandwidth
- Puts unnecessary load on database
- Poor performance on slow connections

**Impact:** **HIGH** (Performance)

**Suggested Fix:**
```typescript
import { useMemo } from 'react';
import { useDebounce } from '@/hooks/use-debounce';

export function useNPSSurveys(initialFilters: SurveyFilters = {}) {
  const [filters, setFilters] = useState<SurveyFilters>(initialFilters);

  // Debounce search term
  const debouncedSearch = useDebounce(filters.search, 300);

  // Use debounced value for query
  const queryFilters = useMemo(() => ({
    ...filters,
    search: debouncedSearch
  }), [filters, debouncedSearch]);

  const query = useQuery({
    queryKey: npsSurveyKeys.list(queryFilters),
    queryFn: () => NPSService.getSurveys(queryFilters),
    staleTime: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData
  });

  // ... rest
}

// hooks/use-debounce.ts
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
```

---

### 22. Missing Index Hints in Complex Queries
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/stakeholder-nps/nps-service.ts`
**Lines:** 40-67

**Issue:**
Complex joins without index hints may result in full table scans.

**Impact:** **HIGH** (Performance)

**Suggested Fix:**
1. Add database indexes:
```sql
-- nps_surveys indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nps_surveys_institution_type_status
ON nps_surveys(institution_id, stakeholder_type, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nps_surveys_dates
ON nps_surveys(start_date, end_date)
WHERE status = 'active';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nps_surveys_search
ON nps_surveys USING gin(to_tsvector('english', title || ' ' || COALESCE(description, '')));

-- nps_responses indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nps_responses_survey_category
ON nps_responses(survey_id, nps_category);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nps_responses_submitted_at
ON nps_responses(submitted_at DESC);
```

2. Use `.explain()` in development to verify index usage:
```typescript
if (process.env.NODE_ENV === 'development') {
  const explanation = await query.explain();
  console.log('[Query Plan]', explanation);
}
```

---

### 23. No Retry Logic for Failed Requests
**File:** All hooks in `/Users/omm/PROJECTS/MyJKKN/hooks/stakeholder-nps/` and `/Users/omm/PROJECTS/MyJKKN/hooks/parent-portal/`

**Issue:**
Network failures result in immediate error, no retry.

**Impact:** **HIGH** (Reliability)

**Suggested Fix:**
```typescript
export function useNPSSurveys(initialFilters: SurveyFilters = {}) {
  const [filters, setFilters] = useState<SurveyFilters>(initialFilters);

  const query = useQuery({
    queryKey: npsSurveyKeys.list(filters),
    queryFn: () => NPSService.getSurveys(filters),
    staleTime: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData,

    // Add retry logic
    retry: (failureCount, error) => {
      // Don't retry on 4xx errors (client errors)
      if (error instanceof Error && error.message.includes('40')) {
        return false;
      }
      // Retry up to 3 times for network errors
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });

  // ... rest
}
```

---

### 24. Memory Leak in Export Function
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/stakeholder-nps/nps-service.ts`
**Lines:** 467-499

**Issue:**
CSV export builds entire result set in memory before returning.

**Problems:**
- Large exports (10k+ responses) can crash browser
- No streaming support
- No pagination for exports
- Can cause OOM errors

**Impact:** **HIGH** (Stability)

**Suggested Fix:**
```typescript
/**
 * Export survey responses with pagination support
 */
static async *exportResponsesStream(surveyId: string, batchSize: number = 1000) {
  let page = 1;
  let hasMore = true;

  // Yield headers first
  const headers = [
    'ID',
    'NPS Score',
    'Category',
    'Feedback',
    'Respondent Type',
    'Email',
    'Name',
    'Department',
    'Submitted At'
  ];
  yield headers.join(',') + '\n';

  while (hasMore) {
    const { data: responses, error } = await this.supabase
      .from('nps_responses')
      .select(`
        id,
        nps_score,
        nps_category,
        additional_feedback,
        respondent_type,
        respondent_email,
        respondent_name,
        submitted_at,
        department:departments(department_name)
      `)
      .eq('survey_id', surveyId)
      .order('submitted_at', { ascending: false })
      .range((page - 1) * batchSize, page * batchSize - 1);

    if (error) throw error;

    if (!responses || responses.length === 0) {
      hasMore = false;
      break;
    }

    // Yield batch of rows
    const rows = responses.map(r => [
      r.id,
      r.nps_score,
      r.nps_category,
      `"${(r.additional_feedback || '').replace(/"/g, '""')}"`,
      r.respondent_type,
      r.respondent_email || '',
      r.respondent_name || '',
      (r.department as any)?.department_name || '',
      r.submitted_at
    ].join(','));

    yield rows.join('\n') + '\n';

    if (responses.length < batchSize) {
      hasMore = false;
    }

    page++;
  }
}

// Usage in hook:
const exportResponses = useCallback(async (surveyId: string, surveyTitle?: string) => {
  try {
    setLoading(true);

    const chunks: string[] = [];

    for await (const chunk of NPSService.exportResponsesStream(surveyId)) {
      chunks.push(chunk);
    }

    const csv = chunks.join('');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    // ... download logic
  } catch (err) {
    // error handling
  } finally {
    setLoading(false);
  }
}, []);
```

---

### 25. Insecure Direct Object Reference in API Routes
**File:** `/Users/omm/PROJECTS/MyJKKN/app/api/parent-portal/learners/route.ts`
**Lines:** 13-45

**Issue:**
```typescript
const parentId = searchParams.get('parent_id');

if (!parentId) {
  return NextResponse.json({ error: 'parent_id is required' }, { status: 400 });
}

const { data, error } = await supabase
  .from('parent_learner_links')
  .select(...)
  .eq('parent_id', parentId)
```

**Problems:**
- No verification that requesting user owns this parent_id
- Any user can query any parent's learners by changing parent_id
- IDOR vulnerability

**Impact:** **HIGH** (Security)

**Suggested Fix:**
```typescript
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 1. Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get parent profile for this user
    const { data: parentProfile, error: profileError } = await supabase
      .from('parent_profiles')
      .select('id, institution_id')
      .eq('user_id', user.id)
      .single();

    if (profileError || !parentProfile) {
      return NextResponse.json({ error: 'Parent profile not found' }, { status: 404 });
    }

    // 3. Fetch learners for THIS parent only
    const { data, error } = await supabase
      .from('parent_learner_links')
      .select(...)
      .eq('parent_id', parentProfile.id) // Use verified parent ID
      .order('is_primary', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('[parent-portal/learners] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch linked learners' },
      { status: 500 }
    );
  }
}
```

---

### 26. No Input Sanitization for HTML Content
**File:** `/Users/omm/PROJECTS/MyJKKN/app/(routes)/stakeholder-nps/respond/page.tsx`
**Lines:** 175-185

**Issue:**
User-provided feedback is displayed without sanitization.

**Problems:**
- XSS vulnerability if feedback contains malicious scripts
- Can inject HTML/JavaScript
- Affects admin dashboard when viewing responses

**Impact:** **HIGH** (Security - XSS)

**Suggested Fix:**
```typescript
import DOMPurify from 'isomorphic-dompurify';

// When displaying user content:
<CardDescription>
  {DOMPurify.sanitize(survey.description || '')}
</CardDescription>

// Or use a safe text-only display:
<CardDescription>
  {survey.description?.substring(0, 500)}
</CardDescription>
```

---

### 27. No Validation of File Attachments
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/parent-portal/parent-portal-service.ts`
**Lines:** 401-414

**Issue:**
Communication attachments accept any file type and size.

**Problems:**
- No file type validation
- No file size limits
- No malware scanning
- Can upload executable files

**Impact:** **HIGH** (Security)

**Suggested Fix:**
```typescript
const attachmentSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().url(),
  type: z.string().refine((type) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    return allowedTypes.includes(type);
  }, { message: 'File type not allowed' }),
  size: z.number().min(0).max(10 * 1024 * 1024), // 10MB max
});

// Validate in service:
export const createCommunicationSchema = z.object({
  // ... other fields
  attachments: z.array(attachmentSchema)
    .max(5, 'Maximum 5 attachments allowed')
    .default([]),
});
```

---

## Medium Priority Issues (Nice to Have)

### 28. Inconsistent Error Messages
**Files:** Multiple service files

**Issue:**
Error messages are inconsistent across the codebase.

**Examples:**
- "Failed to fetch surveys" vs "Unable to load surveys"
- "Survey not found" vs "Survey not found or access denied"
- Technical errors exposed vs generic messages

**Impact:** **MEDIUM** (User Experience)

**Suggested Fix:**
Create a centralized error message system:

```typescript
// lib/errors/error-messages.ts
export const ErrorMessages = {
  UNAUTHORIZED: 'You are not authorized to perform this action',
  NOT_FOUND: (resource: string) => `${resource} not found`,
  VALIDATION_FAILED: 'Please check your input and try again',
  SERVER_ERROR: 'Something went wrong. Please try again later',
  NETWORK_ERROR: 'Unable to connect. Please check your internet connection',

  // Module-specific
  NPS: {
    SURVEY_NOT_FOUND: 'Survey not found or no longer available',
    SURVEY_CLOSED: 'This survey is no longer accepting responses',
    INVALID_SCORE: 'Please select a score between 0 and 10',
    ALREADY_RESPONDED: 'You have already responded to this survey'
  },

  PARENT_PORTAL: {
    INVALID_OTP: 'Invalid or expired OTP',
    LEARNER_NOT_FOUND: 'Learner not found with the provided enrollment number',
    ALREADY_LINKED: 'This learner is already linked to your account'
  }
} as const;

// Usage:
throw new Error(ErrorMessages.NPS.SURVEY_NOT_FOUND);
```

---

### 29. No Loading Skeletons
**Files:** All pages in `app/(routes)/stakeholder-nps/` and `app/(routes)/parent-portal/`

**Issue:**
Loading states show spinners instead of skeleton screens.

**Impact:** **MEDIUM** (User Experience)

**Suggested Fix:**
```typescript
// components/skeletons/dashboard-skeleton.tsx
export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 bg-gray-200 rounded w-1/4 animate-pulse" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-gray-200 rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// Usage:
if (isLoading) {
  return <DashboardSkeleton />;
}
```

---

### 30. Hardcoded Strings Should Be Localized
**Files:** All UI components

**Issue:**
All user-facing strings are hardcoded in English.

**Impact:** **MEDIUM** (Internationalization)

**Suggested Fix:**
```typescript
// Use next-intl or react-i18next
import { useTranslations } from 'next-intl';

export function ParentPortalClient() {
  const t = useTranslations('ParentPortal');

  return (
    <h2>{t('welcome', { name: firstName })}</h2>
  );
}

// messages/en.json
{
  "ParentPortal": {
    "welcome": "Welcome back, {name}!",
    "yourChildren": "Your Children",
    "noLearners": "No learners linked yet"
  }
}
```

---

### 31. Missing Analytics/Tracking
**Files:** All pages

**Issue:**
No analytics or user behavior tracking.

**Impact:** **MEDIUM** (Product Insights)

**Suggested Fix:**
```typescript
// lib/analytics.ts
export const trackEvent = (event: string, properties?: Record<string, any>) => {
  if (typeof window === 'undefined') return;

  // Google Analytics
  window.gtag?.('event', event, properties);

  // PostHog
  window.posthog?.capture(event, properties);

  // Custom analytics
  fetch('/api/analytics', {
    method: 'POST',
    body: JSON.stringify({ event, properties, timestamp: Date.now() })
  }).catch(() => {}); // Silent fail
};

// Usage in components:
useEffect(() => {
  trackEvent('page_view', {
    page: 'parent_portal_dashboard',
    parent_id: parentId
  });
}, [parentId]);

// Track user interactions:
const handleViewLearnerDetails = (learnerId: string) => {
  trackEvent('view_learner_details', { learner_id: learnerId });
  router.push(`/parent-portal/learner/${learnerId}`);
};
```

---

### 32. No Confirmation Dialogs for Destructive Actions
**Files:** Survey management components

**Issue:**
Deleting surveys has no confirmation dialog.

**Impact:** **MEDIUM** (User Experience)

**Suggested Fix:**
```typescript
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
const [surveyToDelete, setSurveyToDelete] = useState<string | null>(null);

const handleDeleteClick = (id: string) => {
  setSurveyToDelete(id);
  setDeleteDialogOpen(true);
};

const handleConfirmDelete = async () => {
  if (surveyToDelete) {
    await deleteSurvey(surveyToDelete);
    setDeleteDialogOpen(false);
    setSurveyToDelete(null);
  }
};

return (
  <>
    <Button variant="destructive" onClick={() => handleDeleteClick(survey.id)}>
      Delete
    </Button>

    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the survey and all associated responses.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
);
```

---

### 33. No Breadcrumb Navigation
**Files:** All nested pages

**Issue:**
Users can't easily navigate back to parent pages.

**Impact:** **MEDIUM** (User Experience)

**Suggested Fix:**
```typescript
// components/breadcrumb.tsx
import { ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center space-x-2 text-sm text-muted-foreground mb-4">
      <Link href="/" className="hover:text-foreground">
        <Home className="h-4 w-4" />
      </Link>
      {items.map((item, index) => (
        <div key={index} className="flex items-center space-x-2">
          <ChevronRight className="h-4 w-4" />
          {item.href ? (
            <Link href={item.href} className="hover:text-foreground">
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}

// Usage:
<Breadcrumb items={[
  { label: 'Parent Portal', href: '/parent-portal' },
  { label: learner.name }
]} />
```

---

### 34. Accessibility Issues
**Files:** Multiple UI components

**Issues:**
- Missing ARIA labels
- Poor keyboard navigation
- No focus indicators
- Missing alt text on images

**Impact:** **MEDIUM** (Accessibility)

**Suggested Fixes:**
```typescript
// 1. Add ARIA labels
<button aria-label="Close survey prompt" onClick={onClose}>
  <X className="h-4 w-4" />
</button>

// 2. Add keyboard navigation
const handleKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    handleClick();
  }
};

<div
  role="button"
  tabIndex={0}
  onKeyDown={handleKeyDown}
  onClick={handleClick}
>
  Clickable div
</div>

// 3. Add focus indicators
className="focus:ring-2 focus:ring-primary focus:outline-none"

// 4. Add alt text
<img src={learner.photo_url} alt={`${learner.name}'s profile picture`} />

// 5. Use semantic HTML
<main> instead of <div className="main">
<nav> for navigation
<article> for content blocks
```

---

### 35. No Empty State Components
**Files:** List views

**Issue:**
Empty states show generic messages instead of helpful CTAs.

**Impact:** **MEDIUM** (User Experience)

**Suggested Fix:**
```typescript
// components/empty-state.tsx
import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-gray-100 p-4 mb-4">
        <Icon className="h-8 w-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 mb-6 max-w-sm">{description}</p>
      {action && (
        <Button onClick={action.onClick}>{action.label}</Button>
      )}
    </div>
  );
}

// Usage:
{surveys.length === 0 && (
  <EmptyState
    icon={FileQuestion}
    title="No surveys yet"
    description="Create your first NPS survey to start collecting feedback from stakeholders."
    action={{
      label: "Create Survey",
      onClick: () => router.push('/stakeholder-nps/surveys/new')
    }}
  />
)}
```

---

### 36. Inconsistent Date Formatting
**Files:** Multiple components

**Issue:**
Dates formatted differently across the app.

**Impact:** **MEDIUM** (Consistency)

**Suggested Fix:**
```typescript
// lib/utils/date.ts
import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from 'date-fns';

export const formatDate = (date: string | Date, formatStr: string = 'PPP'): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, formatStr);
};

export const formatDateTime = (date: string | Date): string => {
  return formatDate(date, 'PPP p');
};

export const formatRelativeTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseISO(date) : date;

  if (isToday(d)) {
    return `Today at ${format(d, 'p')}`;
  }

  if (isYesterday(d)) {
    return `Yesterday at ${format(d, 'p')}`;
  }

  return formatDistanceToNow(d, { addSuffix: true });
};

// Usage:
<time dateTime={survey.created_at}>
  {formatRelativeTime(survey.created_at)}
</time>
```

---

### 37. No Caching Strategy for Static Data
**Files:** Service layers

**Issue:**
Departments, programs, and other reference data fetched on every request.

**Impact:** **MEDIUM** (Performance)

**Suggested Fix:**
```typescript
// lib/cache/reference-data.ts
import { unstable_cache } from 'next/cache';

export const getCachedDepartments = unstable_cache(
  async (institutionId: string) => {
    const { data } = await supabase
      .from('departments')
      .select('*')
      .eq('institution_id', institutionId);
    return data || [];
  },
  ['departments'],
  {
    revalidate: 3600, // 1 hour
    tags: ['departments']
  }
);

// Invalidate cache when data changes:
import { revalidateTag } from 'next/cache';

await supabase.from('departments').insert(newDepartment);
revalidateTag('departments');
```

---

### 38. No Progress Indicators for Long Operations
**Files:** Export functions, bulk operations

**Issue:**
No progress feedback for operations that take >5 seconds.

**Impact:** **MEDIUM** (User Experience)

**Suggested Fix:**
```typescript
import { Progress } from '@/components/ui/progress';

const [exportProgress, setExportProgress] = useState(0);

const exportResponses = async (surveyId: string) => {
  setExportProgress(0);

  const totalBatches = Math.ceil(totalResponses / 1000);
  let processedBatches = 0;

  for await (const chunk of NPSService.exportResponsesStream(surveyId)) {
    // ... process chunk
    processedBatches++;
    setExportProgress((processedBatches / totalBatches) * 100);
  }
};

return (
  <Dialog open={exporting}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Exporting Responses</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <Progress value={exportProgress} />
        <p className="text-sm text-muted-foreground">
          {exportProgress.toFixed(0)}% complete
        </p>
      </div>
    </DialogContent>
  </Dialog>
);
```

---

### 39. No Bulk Operations Support
**Files:** Survey and response management

**Issue:**
Can't perform actions on multiple items at once.

**Impact:** **MEDIUM** (User Experience)

**Suggested Fix:**
```typescript
const [selectedSurveys, setSelectedSurveys] = useState<string[]>([]);

const handleSelectAll = () => {
  if (selectedSurveys.length === surveys.length) {
    setSelectedSurveys([]);
  } else {
    setSelectedSurveys(surveys.map(s => s.id));
  }
};

const handleBulkArchive = async () => {
  await Promise.all(
    selectedSurveys.map(id => archiveSurvey(id))
  );
  setSelectedSurveys([]);
};

return (
  <>
    {selectedSurveys.length > 0 && (
      <div className="bg-blue-50 border-b p-4 flex justify-between items-center">
        <span>{selectedSurveys.length} selected</span>
        <div className="space-x-2">
          <Button onClick={handleBulkArchive}>Archive</Button>
          <Button variant="outline" onClick={() => setSelectedSurveys([])}>
            Clear
          </Button>
        </div>
      </div>
    )}

    <Checkbox
      checked={selectedSurveys.length === surveys.length}
      onCheckedChange={handleSelectAll}
    />
  </>
);
```

---

### 40. Inconsistent Component Structure
**Files:** Components in `_components` folders

**Issue:**
Some components are client components, some are server components without clear pattern.

**Impact:** **MEDIUM** (Maintainability)

**Suggested Fix:**
Establish clear guidelines:
```
_components/
├── client/          # 'use client' components
│   ├── survey-form.tsx
│   └── nps-score-input.tsx
├── server/          # Server components (default)
│   ├── survey-list.tsx
│   └── stats-card.tsx
└── shared/          # Can be used in both
    └── badge.tsx
```

---

## Low Priority Issues (Code Quality)

### 41. Console.log Statements
**Files:** Multiple service files

**Issue:**
console.error and console.log statements should use the logging service.

**Impact:** **LOW** (Code Quality)

**Suggested Fix:**
```typescript
import { logger } from '@/lib/utils/enhanced-logger';

// Replace:
console.error('[stakeholder-nps] Error fetching surveys:', error);

// With:
logger.error('stakeholder-nps', 'Failed to fetch surveys', error);
```

---

### 42. Magic Numbers
**Files:** Multiple files

**Issue:**
Hardcoded numbers without explanation.

**Examples:**
```typescript
staleTime: 5 * 60 * 1000  // What is this?
limit: 10                  // Why 10?
```

**Impact:** **LOW** (Readability)

**Suggested Fix:**
```typescript
// constants/query-config.ts
export const QUERY_STALE_TIME = {
  SHORT: 1 * 60 * 1000,    // 1 minute
  MEDIUM: 5 * 60 * 1000,   // 5 minutes
  LONG: 15 * 60 * 1000,    // 15 minutes
} as const;

export const PAGINATION = {
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
  EXPORT_BATCH_SIZE: 1000,
} as const;

// Usage:
staleTime: QUERY_STALE_TIME.MEDIUM
limit: PAGINATION.DEFAULT_LIMIT
```

---

### 43. Commented Out Code
**Files:** Not found in the files reviewed, but check for this

**Issue:**
Commented code should be removed (use git history instead).

**Impact:** **LOW** (Code Quality)

**Suggested Fix:**
Remove all commented code blocks.

---

### 44. Inconsistent Naming Conventions
**Files:** Multiple

**Issue:**
- Some use `get` prefix, others don't
- Inconsistent use of `fetch` vs `get` vs `load`

**Examples:**
```typescript
getParentProfile
fetchSurveys
loadDashboard
```

**Impact:** **LOW** (Consistency)

**Suggested Fix:**
Establish conventions:
- **get**: Fetches single item by ID
- **list**: Fetches multiple items with filters
- **create**: Creates new item
- **update**: Updates existing item
- **delete**: Removes item

```typescript
// Good:
getSurvey(id)
listSurveys(filters)
createSurvey(data)
updateSurvey(id, data)
deleteSurvey(id)
```

---

### 45. Missing JSDoc Comments
**Files:** All service methods

**Issue:**
Public API methods lack documentation.

**Impact:** **LOW** (Developer Experience)

**Suggested Fix:**
```typescript
/**
 * Fetches a single NPS survey by ID with optional institution filtering.
 *
 * @param id - The UUID of the survey to fetch
 * @param institutionId - Optional institution ID for access control
 * @returns Promise resolving to the survey with related data
 * @throws {Error} If survey not found or access denied
 *
 * @example
 * ```typescript
 * const survey = await NPSService.getSurvey('uuid', 'inst-id');
 * console.log(survey.title);
 * ```
 */
static async getSurvey(id: string, institutionId?: string): Promise<NPSSurvey> {
  // ...
}
```

---

### 46. Duplicate Type Definitions
**Files:** Type files

**Issue:**
Some types are duplicated across modules.

**Impact:** **LOW** (Maintainability)

**Suggested Fix:**
```typescript
// types/common.ts
export interface PaginationMetadata {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ListResponse<T> {
  data: T[];
  metadata: PaginationMetadata;
}

// Usage:
export interface SurveyListResponse extends ListResponse<NPSSurvey> {}
export interface ResponseListResponse extends ListResponse<NPSResponse> {}
```

---

### 47. No TypeScript Strict Mode
**File:** `tsconfig.json`

**Issue:**
Check if strict mode is enabled.

**Impact:** **LOW** (Type Safety)

**Suggested Fix:**
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

---

## Summary of Recommendations

### Immediate Actions (Critical - Must Fix Before Production)
1. ✅ Replace sessionStorage authentication with proper JWT/session-based auth
2. ✅ Fix all SQL injection vulnerabilities in search parameters
3. ✅ Make institution_id validation mandatory, not optional
4. ✅ Add rate limiting to OTP endpoints
5. ✅ Validate and sanitize all user inputs (question_responses, feedback)
6. ✅ Add CSRF protection to all state-changing endpoints
7. ✅ Sanitize error messages to prevent information disclosure
8. ✅ Add authorization checks to all service methods
9. ✅ Fix phone number validation
10. ✅ Add ownership verification before updates/deletes
11. ✅ Implement proper RPC authorization
12. ✅ Fix IDOR vulnerabilities in API routes

### High Priority (Fix Within 1-2 Sprints)
- Add error boundaries
- Implement null safety across all components
- Add retry logic and debouncing
- Fix race conditions
- Add optimistic updates
- Improve pagination
- Add input sanitization for XSS prevention
- Validate file attachments
- Add loading states and skeletons
- Implement proper indexes for performance

### Medium Priority (Nice to Have)
- Improve error messages
- Add breadcrumbs and navigation aids
- Implement internationalization
- Add analytics tracking
- Improve accessibility
- Add empty states and confirmations
- Optimize caching strategies

### Low Priority (Code Quality)
- Remove console.logs, use logger
- Extract magic numbers to constants
- Add JSDoc comments
- Standardize naming conventions
- Enable strict TypeScript

---

## Testing Checklist

Before deploying to production, verify:

- [ ] All authentication uses proper session management (no sessionStorage)
- [ ] All database queries use parameterized queries (no string interpolation)
- [ ] All service methods validate institution_id
- [ ] Rate limiting is active on OTP endpoints
- [ ] All user inputs are validated and sanitized
- [ ] CSRF tokens are required for state changes
- [ ] Error messages don't expose sensitive information
- [ ] File uploads are validated (type, size, content)
- [ ] All API routes check user authorization
- [ ] RLS policies are enabled on all tables
- [ ] Database indexes are created for common queries
- [ ] Error boundaries catch and log all errors
- [ ] Loading states provide feedback to users
- [ ] Accessibility standards are met (WCAG 2.1 AA)

---

## Files Requiring Immediate Attention

**CRITICAL:**
1. `/Users/omm/PROJECTS/MyJKKN/app/(routes)/parent-portal/_components/parent-portal-client.tsx`
2. `/Users/omm/PROJECTS/MyJKKN/lib/services/stakeholder-nps/nps-service.ts`
3. `/Users/omm/PROJECTS/MyJKKN/lib/services/parent-portal/parent-portal-service.ts`
4. `/Users/omm/PROJECTS/MyJKKN/app/api/parent-portal/auth/verify-otp/route.ts`
5. `/Users/omm/PROJECTS/MyJKKN/app/api/parent-portal/auth/request-otp/route.ts`
6. `/Users/omm/PROJECTS/MyJKKN/app/api/stakeholder-nps/surveys/route.ts`
7. `/Users/omm/PROJECTS/MyJKKN/app/api/parent-portal/learners/route.ts`

**HIGH PRIORITY:**
1. All hooks in `/Users/omm/PROJECTS/MyJKKN/hooks/stakeholder-nps/`
2. All hooks in `/Users/omm/PROJECTS/MyJKKN/hooks/parent-portal/`
3. All components in `app/(routes)/parent-portal/_components/`
4. All API routes in `app/api/parent-portal/`

---

**End of Review**
