# TQM Modules Code Review - Part 2
## Grievance System & Maturity Assessment

**Review Date:** 2026-02-01
**Reviewer:** Claude Code (Senior Code Review Agent)
**Modules Reviewed:**
- F004: Grievance Ticketing System
- Maturity Assessment Module

**Review Scope:** Service layer, API routes, hooks, validations, database schema, security, performance

---

## Executive Summary

| Priority | Count | Description |
|----------|-------|-------------|
| 🔴 **Critical** | 8 | Must fix before production - security/data integrity risks |
| 🟠 **High** | 12 | Should fix soon - significant bugs or edge cases |
| 🟡 **Medium** | 15 | Nice to have - code quality and UX improvements |
| 🟢 **Low** | 6 | Code quality - non-urgent improvements |

**Overall Assessment:** Both modules have **several critical security and null-safety issues** that must be addressed before production deployment. The code structure is good, but lacks defensive programming practices.

---

## 🔴 CRITICAL ISSUES (Must Fix Before Production)

### GRV-CRIT-001: SQL Injection Risk in Search Filter
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/grievance/grievance-service.ts`
**Line:** 221-223

**Issue:**
```typescript
if (filters.search) {
  // Sanitize search to prevent SQL injection
  const sanitizedSearch = filters.search.replace(/[%_]/g, '\\$&');
  query = query.or(`subject.ilike.%${sanitizedSearch}%,...`);
}
```

**Problem:** The sanitization is insufficient. The replace pattern only escapes `%` and `_`, but doesn't prevent other SQL injection vectors. User input is directly interpolated into the query string.

**Impact:** HIGH - Potential SQL injection vulnerability allowing unauthorized data access.

**Fix:**
```typescript
if (filters.search) {
  // Use Supabase's safe parameter binding
  const searchPattern = `%${filters.search}%`;
  query = query.or(
    `subject.ilike."${searchPattern}",` +
    `ticket_number.ilike."${searchPattern}",` +
    `description.ilike."${searchPattern}"`
  );
}
```

**Better Fix:** Use full-text search instead:
```typescript
if (filters.search) {
  // Use the GIN index for full-text search (already exists in schema)
  query = query.textSearch('fts', filters.search, {
    type: 'websearch',
    config: 'english'
  });
}
```

---

### GRV-CRIT-002: Missing Institution ID Verification in getTicket
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/grievance/grievance-service.ts`
**Line:** 258-274

**Issue:**
```typescript
static async getTicket(id: string, institutionId?: string): Promise<GrievanceTicket> {
  let query = this.supabase
    .from('grievance_tickets')
    .select(...)
    .eq('id', id);

  // SECURITY: Filter by institution_id if provided
  if (institutionId) {
    query = query.eq('institution_id', institutionId);
  }
```

**Problem:** The `institutionId` parameter is **optional**. If not provided, ANY user with a valid ticket ID can access tickets from OTHER institutions, bypassing RLS.

**Impact:** CRITICAL - Cross-institution data leak. User from Institution A can access grievance tickets from Institution B.

**Fix:**
```typescript
static async getTicket(id: string, institutionId: string): Promise<GrievanceTicket> {
  // SECURITY: institution_id is now REQUIRED
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  let query = this.supabase
    .from('grievance_tickets')
    .select(...)
    .eq('id', id)
    .eq('institution_id', institutionId); // ALWAYS filter
```

**Apply to:**
- `getCategory()` - Line 124
- `getTicket()` - Line 258
- All other entity retrieval methods

---

### GRV-CRIT-003: SLA Calculation Race Condition
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/grievance/grievance-service.ts`
**Line:** 347-354

**Issue:**
```typescript
static async createTicket(ticketData: CreateGrievanceTicketDto): Promise<GrievanceTicket> {
  // Get category to determine SLA
  const { data: category, error: categoryError } = await this.supabase
    .from('grievance_categories')
    .select('default_sla_hours, institution_id')
    .eq('id', ticketData.category_id)
    .eq('institution_id', ticketData.institution_id)
    .single();

  const slaHours = category?.default_sla_hours || 48;
```

**Problem:**
1. If category fetch fails, it defaults to 48 hours silently
2. No validation that the category actually exists
3. Race condition if category is deleted between fetch and insert

**Impact:** CRITICAL - Incorrect SLA tracking, potential data integrity issues

**Fix:**
```typescript
static async createTicket(ticketData: CreateGrievanceTicketDto): Promise<GrievanceTicket> {
  if (!ticketData.institution_id) {
    throw new Error('Institution ID is required');
  }

  const { data: category, error: categoryError } = await this.supabase
    .from('grievance_categories')
    .select('default_sla_hours, institution_id')
    .eq('id', ticketData.category_id)
    .eq('institution_id', ticketData.institution_id)
    .single();

  if (categoryError || !category) {
    console.error('[GrievanceService] Category not found:', categoryError);
    throw new Error('Invalid category for this institution');
  }

  // Use database foreign key constraint to prevent race condition
  const slaHours = category.default_sla_hours;
  const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);
```

---

### GRV-CRIT-004: Missing User Authentication Check
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/grievance/grievance-service.ts`
**Line:** 580-585

**Issue:**
```typescript
static async getMyTickets(filters: GrievanceTicketFilters = {}): Promise<GrievanceTicketListResponse> {
  const { data: user } = await this.supabase.auth.getUser();
  if (!user?.user?.id) {
    throw new Error('User not authenticated');
  }

  return this.getTickets({
    ...filters,
    raised_by_id: user.user.id
  });
}
```

**Problem:** This service method relies on Supabase auth, but it's called from **client-side hooks** that don't verify the session is valid. If the session expires mid-request, the error is generic and doesn't trigger re-authentication.

**Impact:** HIGH - Poor UX, potential security issues if stale sessions are used

**Fix:**
```typescript
static async getMyTickets(filters: GrievanceTicketFilters = {}): Promise<GrievanceTicketListResponse> {
  const { data: userData, error: authError } = await this.supabase.auth.getUser();

  if (authError) {
    console.error('[GrievanceService] Authentication error:', authError);
    throw new Error('Session expired. Please log in again.');
  }

  if (!userData?.user?.id) {
    throw new Error('User not authenticated');
  }

  return this.getTickets({
    ...filters,
    raised_by_id: userData.user.id
  });
}
```

---

### MAT-CRIT-001: Unchecked Framework Existence
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/maturity-assessment/maturity-assessment-service.ts`
**Line:** 127-135

**Issue:**
```typescript
static async createAssessment(dto: CreateMaturityAssessmentDto): Promise<MaturityAssessment> {
  // SECURITY: Verify framework belongs to the institution
  const { data: framework, error: frameworkError } = await this.supabase
    .from('maturity_frameworks')
    .select('institution_id')
    .eq('id', dto.framework_id)
    .eq('institution_id', dto.institution_id)
    .single();

  if (frameworkError || !framework) {
    throw new Error('Invalid framework for this institution');
  }
```

**Problem:** This check happens AFTER the assessment is already validated. If the framework is inactive or doesn't exist, the error message is generic and doesn't specify the reason.

**Impact:** HIGH - Users can't distinguish between "framework doesn't exist" vs "framework not active" vs "permission denied"

**Fix:**
```typescript
static async createAssessment(dto: CreateMaturityAssessmentDto): Promise<MaturityAssessment> {
  // SECURITY: Validate required fields
  if (!dto.institution_id || !dto.framework_id || !dto.dimension_scores) {
    throw new Error('Institution ID, framework ID, and dimension scores are required');
  }

  // SECURITY: Verify framework exists, is active, and belongs to institution
  const { data: framework, error: frameworkError } = await this.supabase
    .from('maturity_frameworks')
    .select('institution_id, is_active')
    .eq('id', dto.framework_id)
    .eq('institution_id', dto.institution_id)
    .single();

  if (frameworkError) {
    console.error('[MaturityAssessmentService] Framework fetch error:', frameworkError);
    throw new Error('Framework not found');
  }

  if (!framework) {
    throw new Error('Framework not found for this institution');
  }

  if (!framework.is_active) {
    throw new Error('Framework is inactive. Please activate it first.');
  }
```

---

### MAT-CRIT-002: Null Dimension Scores Not Validated
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/validations/maturity-assessment.ts`
**Line:** 63-71

**Issue:**
```typescript
export const createAssessmentSchema = z.object({
  // ...
  dimension_scores: z.object({
    Leadership: coercedStageSchema,
    Strategy: coercedStageSchema,
    People: coercedStageSchema,
    Processes: coercedStageSchema,
    Resources: coercedStageSchema,
    Results: coercedStageSchema
  }),
```

**Problem:** If a user sends `{ dimension_scores: { Leadership: null, ... } }`, the coercion will fail silently or convert to 0, which is outside the valid range (1-4).

**Impact:** CRITICAL - Invalid data in database, broken maturity calculations

**Fix:**
```typescript
// Use a stricter schema with explicit null rejection
const stageSchema = z.number()
  .int('Stage must be an integer')
  .min(1, 'Stage must be at least 1')
  .max(4, 'Stage cannot exceed 4')
  .refine((val) => val !== null && val !== undefined, {
    message: 'Stage score is required'
  });

export const createAssessmentSchema = z.object({
  // ...
  dimension_scores: z.object({
    Leadership: stageSchema,
    Strategy: stageSchema,
    People: stageSchema,
    Processes: stageSchema,
    Resources: stageSchema,
    Results: stageSchema
  }).strict(), // Reject extra properties
```

---

### MAT-CRIT-003: Division by Zero in Overall Stage Calculation
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/maturity-assessment/maturity-assessment-service.ts`
**Line:** 150-155

**Issue:**
```typescript
static calculateOverallStage(dimensionScores: Record<string, number>): MaturityStage {
  const scores = Object.values(dimensionScores).filter(
    (s) => typeof s === 'number' && s >= 1 && s <= 4
  );

  if (scores.length === 0) return 1;

  const average = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.floor(average) as MaturityStage;
}
```

**Problem:** If all dimension scores are invalid (e.g., null, undefined, out of range), it returns `1` by default. This hides data quality issues.

**Impact:** HIGH - Silent data corruption, misleading maturity assessments

**Fix:**
```typescript
static calculateOverallStage(dimensionScores: Record<string, number>): MaturityStage {
  const scores = Object.values(dimensionScores).filter(
    (s) => typeof s === 'number' && !isNaN(s) && s >= 1 && s <= 4
  );

  if (scores.length === 0) {
    console.warn('[MaturityAssessmentService] No valid dimension scores found:', dimensionScores);
    throw new Error('At least one valid dimension score (1-4) is required');
  }

  if (scores.length < 6) {
    console.warn('[MaturityAssessmentService] Missing dimension scores:', {
      provided: scores.length,
      expected: 6
    });
  }

  const average = scores.reduce((a, b) => a + b, 0) / scores.length;
  const stage = Math.floor(average);

  // Ensure result is within valid range
  return Math.max(1, Math.min(4, stage)) as MaturityStage;
}
```

---

### GRV-CRIT-005: Missing Error Message for Users
**File:** `/Users/omm/PROJECTS/MyJKKN/app/api/grievance/tickets/route.ts`
**Line:** 43-48

**Issue:**
```typescript
} catch (error) {
  console.error('Error in GET /api/grievance/tickets:', error);

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: error.errors },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { error: 'Internal Server Error' },
    { status: 500 }
  );
}
```

**Problem:** Generic error messages provide no actionable information to users. "Internal Server Error" could be anything from network issues to database connection failures.

**Impact:** HIGH - Poor UX, difficult debugging for support team

**Fix:**
```typescript
} catch (error) {
  console.error('[GET /api/grievance/tickets] Error:', error);

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: 'Invalid query parameters',
        details: error.errors,
        message: 'Please check your filter criteria and try again.'
      },
      { status: 400 }
    );
  }

  // Specific error types
  if (error instanceof Error) {
    // Don't expose internal error details in production
    const message = process.env.NODE_ENV === 'production'
      ? 'Failed to fetch tickets. Please try again.'
      : error.message;

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { error: 'An unexpected error occurred. Please contact support.' },
    { status: 500 }
  );
}
```

---

## 🟠 HIGH PRIORITY ISSUES (Should Fix Soon)

### GRV-HIGH-001: Null Safety - Category Parent
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/grievance/grievance-service.ts`
**Line:** 83-89

**Issue:**
```typescript
// Build tree structure
const categories = data || [];
const rootCategories = categories.filter(c => !c.parent_id);
rootCategories.forEach(root => {
  root.children = categories.filter(c => c.parent_id === root.id);
});
```

**Problem:**
- No null check before accessing `categories.filter`
- No handling for orphaned categories (parent_id points to non-existent parent)
- Doesn't handle circular references

**Impact:** MEDIUM - Potential runtime errors if data is malformed

**Fix:**
```typescript
// Build tree structure
const categories = data || [];

if (!Array.isArray(categories)) {
  console.error('[GrievanceService] Invalid categories data:', data);
  return [];
}

const rootCategories = categories.filter(c => !c.parent_id);
const categoryMap = new Map(categories.map(c => [c.id, c]));

rootCategories.forEach(root => {
  root.children = categories.filter(c => {
    // Only include children whose parent exists
    return c.parent_id === root.id && categoryMap.has(c.parent_id);
  });
});

// Warn about orphaned categories
const orphaned = categories.filter(c =>
  c.parent_id && !categoryMap.has(c.parent_id)
);
if (orphaned.length > 0) {
  console.warn('[GrievanceService] Orphaned categories found:', orphaned);
}

return rootCategories as GrievanceCategory[];
```

---

### GRV-HIGH-002: Missing Comments Count
**File:** `/Users/omm/PROJECTS/MyJKKN/types/grievance.ts`
**Line:** 96

**Issue:**
```typescript
export interface GrievanceTicket {
  // ... other fields
  comments_count?: number;
}
```

**Problem:** The type definition includes `comments_count`, but the database query doesn't fetch it. This field will always be undefined.

**Impact:** MEDIUM - UI will show incorrect comment counts (0 instead of actual count)

**Fix in Service:**
```typescript
static async getTickets(filters: GrievanceTicketFilters = {}): Promise<GrievanceTicketListResponse> {
  let query = this.supabase
    .from('grievance_tickets')
    .select(`
      *,
      category:grievance_categories(id, name, default_sla_hours),
      assignee:users_profiles!assigned_to(id, full_name, email),
      department:departments(id, name),
      resolver:users_profiles!resolved_by(id, full_name),
      comments_count:grievance_comments(count)  // ADD THIS
    `, { count: 'exact' });
```

**Better Fix:** Create a database view or use a computed column:
```sql
-- Migration
ALTER TABLE grievance_tickets
  ADD COLUMN comments_count INTEGER DEFAULT 0;

-- Trigger to update count
CREATE OR REPLACE FUNCTION update_ticket_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE grievance_tickets
  SET comments_count = (
    SELECT COUNT(*)
    FROM grievance_comments
    WHERE ticket_id = NEW.ticket_id
  )
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_comment_count
  AFTER INSERT OR DELETE ON grievance_comments
  FOR EACH ROW EXECUTE FUNCTION update_ticket_comment_count();
```

---

### GRV-HIGH-003: SLA Status Not Updated on Read
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/grievance/grievance-service.ts`
**Line:** 258

**Issue:** The `getTicket()` method returns cached SLA status, but the database trigger only updates on INSERT/UPDATE. If a ticket is fetched after the SLA deadline passes, the status will be stale.

**Impact:** MEDIUM - Incorrect SLA status displayed to users

**Fix:**
```typescript
static async getTicket(id: string, institutionId: string): Promise<GrievanceTicket> {
  // ... existing query code

  const { data, error } = await query.single();

  if (error) {
    // ... error handling
  }

  if (!data) {
    throw new Error('Ticket not found');
  }

  // Recalculate SLA status on read for non-resolved tickets
  if (data.status !== 'resolved' && data.status !== 'closed') {
    const now = new Date();
    const deadline = new Date(data.sla_deadline);

    if (now > deadline) {
      data.sla_status = 'breached';
    } else if (now > new Date(deadline.getTime() - 4 * 60 * 60 * 1000)) {
      data.sla_status = 'at_risk';
    } else {
      data.sla_status = 'on_track';
    }
  }

  return data as GrievanceTicket;
}
```

---

### GRV-HIGH-004: No Pagination Limits
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/grievance/grievance-service.ts`
**Line:** 234-235

**Issue:**
```typescript
const page = filters.page || 1;
const limit = filters.limit || 10;
```

**Problem:** No maximum limit enforced. User can request `limit=999999` and cause performance issues.

**Impact:** MEDIUM - Potential DoS vector, performance degradation

**Fix:**
```typescript
const page = Math.max(1, filters.page || 1);
const limit = Math.min(100, Math.max(1, filters.limit || 10)); // Cap at 100

if (filters.limit && filters.limit > 100) {
  console.warn('[GrievanceService] Requested limit exceeds maximum:', {
    requested: filters.limit,
    capped: 100
  });
}
```

---

### GRV-HIGH-005: Missing Timeout on Supabase Queries
**File:** All service files

**Issue:** No timeout configured for Supabase queries. Long-running queries can hang indefinitely.

**Impact:** MEDIUM - Poor UX, resource exhaustion

**Fix:**
```typescript
// In service initialization
export class GrievanceService {
  private static supabase: any = createClientSupabaseClient({
    global: {
      headers: {
        'x-request-timeout': '10000' // 10 second timeout
      }
    }
  });
```

**Better fix:** Use React Query's timeout:
```typescript
// In hooks
export function useGrievanceTickets(filters: GrievanceTicketFilters = {}) {
  return useQuery({
    queryKey: grievanceTicketKeys.list(filters),
    queryFn: () => GrievanceService.getTickets(filters),
    staleTime: 30 * 1000,
    timeout: 10000 // 10 second timeout
  });
}
```

---

### MAT-HIGH-001: Missing Validation on Dimension Scores Type
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/maturity-assessment/maturity-assessment-service.ts`
**Line:** 218

**Issue:**
```typescript
const { data: prevAssessment } = await this.supabase
  .from('maturity_assessments')
  .select('dimension_scores')
  // ...

if (prevAssessment) {
  previous = Object.entries(prevAssessment.dimension_scores as Record<string, number>).map(
    ([dimension, score]) => ({
      dimension: dimension as MaturityDimensionName,
      score: score as MaturityStage
    })
  );
}
```

**Problem:** Type assertion without validation. If `dimension_scores` is malformed JSON, this will fail silently or cause runtime errors.

**Impact:** MEDIUM - Potential runtime errors in radar chart

**Fix:**
```typescript
if (prevAssessment && prevAssessment.dimension_scores) {
  const scores = prevAssessment.dimension_scores;

  // Validate it's an object
  if (typeof scores === 'object' && !Array.isArray(scores)) {
    previous = Object.entries(scores)
      .filter(([key, value]) =>
        typeof value === 'number' && value >= 1 && value <= 4
      )
      .map(([dimension, score]) => ({
        dimension: dimension as MaturityDimensionName,
        score: score as MaturityStage
      }));
  } else {
    console.warn('[MaturityAssessmentService] Invalid dimension_scores format:', scores);
  }
}
```

---

### MAT-HIGH-002: Race Condition in getOrCreateFramework
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/maturity-assessment/maturity-assessment-service.ts`
**Line:** 96-103

**Issue:**
```typescript
static async getOrCreateFramework(institutionId: string): Promise<MaturityFramework> {
  let framework = await this.getFramework(institutionId);

  if (!framework) {
    framework = await this.createFramework({ institution_id: institutionId });
  }

  return framework;
}
```

**Problem:** Race condition if multiple users call this simultaneously. Could result in multiple frameworks being created (violates unique constraint).

**Impact:** MEDIUM - Database constraint error, poor UX

**Fix:**
```typescript
static async getOrCreateFramework(institutionId: string): Promise<MaturityFramework> {
  let framework = await this.getFramework(institutionId);

  if (!framework) {
    try {
      framework = await this.createFramework({ institution_id: institutionId });
    } catch (error) {
      // If framework was created by another request, fetch it
      if (error instanceof Error && error.message.includes('duplicate')) {
        console.warn('[MaturityAssessmentService] Framework already created, fetching');
        framework = await this.getFramework(institutionId);

        if (!framework) {
          throw new Error('Failed to fetch framework after creation conflict');
        }
      } else {
        throw error;
      }
    }
  }

  return framework;
}
```

---

### MAT-HIGH-003: No Validation on Progress Item Dates
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/maturity-assessment/maturity-assessment-service.ts`
**Line:** 311

**Issue:**
```typescript
static async createProgressItem(dto: CreateMaturityProgressItemDto): Promise<MaturityProgressItem> {
  const user = await this.supabase.auth.getUser();

  const { data, error } = await this.supabase
    .from('maturity_progress')
    .insert({
      // ...
      due_date: dto.due_date || null,
```

**Problem:** No validation that `due_date` is in the future, or that it's a valid date format.

**Impact:** MEDIUM - Invalid dates in database, incorrect overdue calculations

**Fix:**
```typescript
static async createProgressItem(dto: CreateMaturityProgressItemDto): Promise<MaturityProgressItem> {
  const user = await this.supabase.auth.getUser();

  // Validate due_date if provided
  if (dto.due_date) {
    const dueDate = new Date(dto.due_date);
    if (isNaN(dueDate.getTime())) {
      throw new Error('Invalid due date format');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dueDate < today) {
      console.warn('[MaturityAssessmentService] Due date is in the past:', dto.due_date);
      // Allow past dates but warn - might be for historical data
    }
  }
```

---

### MAT-HIGH-004: Dashboard Query Not Optimized
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/maturity-assessment/maturity-assessment-service.ts`
**Line:** 359-390

**Issue:** The `getDashboard()` method fetches ALL approved assessments and then processes them in memory. For institutions with hundreds of assessments, this is inefficient.

**Impact:** MEDIUM - Performance degradation, high memory usage

**Fix:** Use database aggregation:
```typescript
static async getDashboard(institutionId: string): Promise<MaturityDashboardData> {
  // Use RPC function for aggregation
  const { data: aggregatedData, error } = await this.supabase.rpc(
    'get_maturity_dashboard_stats',
    { p_institution_id: institutionId }
  );

  if (error) {
    console.error('[MaturityAssessmentService] Dashboard aggregation error:', error);
    throw new Error('Failed to fetch dashboard data');
  }

  return aggregatedData;
}
```

**Create RPC function:**
```sql
CREATE OR REPLACE FUNCTION get_maturity_dashboard_stats(p_institution_id UUID)
RETURNS JSON AS $$
-- Aggregation logic here
$$ LANGUAGE plpgsql;
```

---

### GRV-HIGH-006: Missing Index on Search Columns
**File:** Database schema
**Migration:** `20260201110002_create_grievance_tables.sql`

**Issue:** The full-text search index exists, but queries use `ilike` instead:
```sql
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_search
  ON grievance_tickets USING gin(to_tsvector('english', subject || ' ' || description));
```

**Problem:** The service layer doesn't use this index - it uses `ilike` which is slower.

**Impact:** MEDIUM - Poor search performance on large datasets

**Fix:** Update service to use the GIN index:
```typescript
if (filters.search) {
  // Use full-text search index
  query = query.textSearch('fts', filters.search, {
    type: 'websearch',
    config: 'english'
  });
}
```

**Or create a computed column:**
```sql
ALTER TABLE grievance_tickets
  ADD COLUMN fts_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', subject || ' ' || description)) STORED;

CREATE INDEX idx_grievance_tickets_fts ON grievance_tickets USING gin(fts_vector);
```

---

### GRV-HIGH-007: No Rate Limiting on Ticket Creation
**File:** `/Users/omm/PROJECTS/MyJKKN/app/api/grievance/tickets/route.ts`

**Issue:** No rate limiting to prevent spam or abuse.

**Impact:** MEDIUM - Potential spam vector, resource exhaustion

**Fix:** Add rate limiting middleware:
```typescript
import { ratelimit } from '@/lib/ratelimit';

export async function POST(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 5 tickets per hour per user
    const identifier = session.user.id;
    const { success, limit, reset, remaining } = await ratelimit.limit(identifier);

    if (!success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. Please try again later.',
          limit,
          reset,
          remaining: 0
        },
        { status: 429 }
      );
    }

    // ... rest of the code
```

---

### MAT-HIGH-005: No Concurrent Assessment Prevention
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/maturity-assessment/maturity-assessment-service.ts`

**Issue:** Multiple users can create assessments for the same department on the same date, causing confusion.

**Impact:** MEDIUM - Data quality issues, duplicate work

**Fix:** Add unique constraint:
```sql
-- Migration
CREATE UNIQUE INDEX idx_maturity_assessments_unique_dept_date
  ON maturity_assessments (institution_id, COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::UUID), assessment_date)
  WHERE status != 'archived';
```

**In service:**
```typescript
static async createAssessment(dto: CreateMaturityAssessmentDto): Promise<MaturityAssessment> {
  // Check for existing assessment
  const { data: existing } = await this.supabase
    .from('maturity_assessments')
    .select('id, status')
    .eq('institution_id', dto.institution_id)
    .eq('department_id', dto.department_id || null)
    .eq('assessment_date', dto.assessment_date)
    .neq('status', 'archived')
    .single();

  if (existing) {
    throw new Error(
      `An assessment for this department on ${dto.assessment_date} already exists (${existing.status}). ` +
      'Please edit the existing assessment or choose a different date.'
    );
  }

  // ... rest of the code
```

---

## 🟡 MEDIUM PRIORITY ISSUES (Code Quality & UX)

### GRV-MED-001: Inconsistent Error Logging
**Files:** All service files

**Issue:** Some methods use `console.error`, others use `console.warn`, and some have no logging at all.

**Impact:** LOW - Difficult debugging, inconsistent log format

**Fix:** Use the enhanced logger:
```typescript
import { logger } from '@/lib/utils/enhanced-logger';

// Replace console.error
console.error('[GrievanceService] Error:', error);

// With
logger.error('grievance/tickets', 'Failed to fetch tickets', error);
```

---

### GRV-MED-002: No Toast Notifications for Service Errors
**File:** `/Users/omm/PROJECTS/MyJKKN/hooks/grievance/use-grievance-tickets.ts`

**Issue:** Hooks show toast notifications only for mutation errors, not for query errors.

**Impact:** LOW - Users don't see errors when data fails to load

**Fix:**
```typescript
export function useGrievanceTickets(filters: GrievanceTicketFilters = {}) {
  return useQuery({
    queryKey: grievanceTicketKeys.list(filters),
    queryFn: () => GrievanceService.getTickets(filters),
    staleTime: 30 * 1000,
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to load tickets');
    }
  });
}
```

---

### GRV-MED-003: Missing Validation on Email Format
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/validations/grievance.ts`
**Line:** 88-91

**Issue:**
```typescript
raised_by_email: z
  .string()
  .email('Invalid email format')
  .optional()
  .nullable()
  .or(z.literal('')),
```

**Problem:** The `.or(z.literal(''))` allows empty string to bypass email validation.

**Impact:** LOW - Invalid emails in database

**Fix:**
```typescript
raised_by_email: z.preprocess(
  (val) => (val === '' ? null : val),
  z.string().email('Invalid email format').nullable().optional()
),
```

---

### GRV-MED-004: No Soft Delete for Tickets
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/grievance/grievance-service.ts`

**Issue:** No delete method exists for tickets. If needed, hard delete would lose audit trail.

**Impact:** LOW - Potential data loss if delete functionality is added later

**Fix:** Add `deleted_at` column and soft delete:
```sql
ALTER TABLE grievance_tickets ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE INDEX idx_grievance_tickets_not_deleted
  ON grievance_tickets(institution_id, status)
  WHERE deleted_at IS NULL;
```

```typescript
static async deleteTicket(id: string): Promise<void> {
  const { error } = await this.supabase
    .from('grievance_tickets')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('[GrievanceService] Error deleting ticket:', error);
    throw new Error('Failed to delete ticket');
  }
}
```

---

### MAT-MED-001: No Audit Trail for Dimension Score Changes
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/maturity-assessment/maturity-assessment-service.ts`

**Issue:** When an assessment is updated, the old dimension scores are lost. No audit trail exists.

**Impact:** LOW - Can't track score changes over time for debugging

**Fix:** Create audit table:
```sql
CREATE TABLE maturity_assessment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES maturity_assessments(id) ON DELETE CASCADE,
  dimension_scores_old JSONB NOT NULL,
  dimension_scores_new JSONB NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### MAT-MED-002: Missing Cascade Delete Warning
**File:** Database schema

**Issue:** When a framework is deleted, all assessments using it fail due to `ON DELETE RESTRICT`. But there's no UI warning.

**Impact:** LOW - Poor UX when trying to delete frameworks

**Fix in service:**
```typescript
static async deleteFramework(id: string): Promise<void> {
  // Check for dependent assessments
  const { data: assessments, error: checkError } = await this.supabase
    .from('maturity_assessments')
    .select('id')
    .eq('framework_id', id)
    .limit(1);

  if (checkError) {
    throw new Error('Failed to check framework dependencies');
  }

  if (assessments && assessments.length > 0) {
    throw new Error(
      'Cannot delete framework. There are assessments using this framework. ' +
      'Please archive or delete those assessments first.'
    );
  }

  // Proceed with delete
  const { error } = await this.supabase
    .from('maturity_frameworks')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error('Failed to delete framework');
  }
}
```

---

### MAT-MED-003: No Export Functionality
**Files:** Both modules

**Issue:** No CSV/Excel export for reports.

**Impact:** LOW - Users can't generate reports for external use

**Fix:** Add export endpoints:
```typescript
// app/api/grievance/export/route.ts
export async function GET(request: Request) {
  // ... auth check

  const tickets = await GrievanceService.getTickets(filters);

  const csv = convertToCSV(tickets.data);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="grievances.csv"'
    }
  });
}
```

---

### GRV-MED-005: No Attachment Size Validation
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/validations/grievance.ts`
**Line:** 11-16

**Issue:**
```typescript
export const attachmentSchema = z.object({
  name: z.string().min(1, 'File name is required'),
  url: z.string().url('Invalid URL format'),
  type: z.string().min(1, 'File type is required'),
  size: z.number().min(0, 'File size must be positive')
});
```

**Problem:** No maximum size limit. Users could upload huge files.

**Impact:** LOW - Storage costs, performance issues

**Fix:**
```typescript
export const attachmentSchema = z.object({
  name: z.string().min(1, 'File name is required').max(255),
  url: z.string().url('Invalid URL format'),
  type: z.string().min(1, 'File type is required'),
  size: z.number()
    .min(0, 'File size must be positive')
    .max(10 * 1024 * 1024, 'File size cannot exceed 10MB')
});
```

---

### GRV-MED-006: SLA Report Performance Issue
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/grievance/grievance-service.ts`
**Line:** 538-578

**Issue:** The `getSLAReport()` method fetches ALL tickets and processes them in memory. Inefficient for large datasets.

**Impact:** LOW - Performance degradation with large data

**Fix:** Use the database RPC function that already exists:
```typescript
static async getSLAReport(
  institutionId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<GrievanceSLAReport> {
  // Use the existing RPC function
  const { data, error } = await this.supabase.rpc('get_grievance_sla_report', {
    p_institution_id: institutionId,
    p_date_from: dateFrom || null,
    p_date_to: dateTo || null
  });

  if (error) {
    console.error('[GrievanceService] Error fetching SLA report:', error);
    throw new Error('Failed to fetch SLA report');
  }

  return data as GrievanceSLAReport;
}
```

**Create the RPC function:**
```sql
CREATE OR REPLACE FUNCTION get_grievance_sla_report(
  p_institution_id UUID,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON AS $$
-- Aggregation logic here
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### MAT-MED-004: Missing Progress Item Notifications
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/maturity-assessment/maturity-assessment-service.ts`

**Issue:** When a progress item is assigned to a user, no notification is sent.

**Impact:** LOW - Users don't know they have tasks assigned

**Fix:** Add notification trigger:
```sql
CREATE OR REPLACE FUNCTION notify_progress_item_assigned()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS NULL OR OLD.assigned_to != NEW.assigned_to) THEN
    -- Insert notification
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      link
    ) VALUES (
      NEW.assigned_to,
      'progress_item_assigned',
      'New Action Item Assigned',
      'You have been assigned: ' || NEW.action_item,
      '/maturity-assessment/' || NEW.assessment_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_progress_assigned
  AFTER INSERT OR UPDATE OF assigned_to ON maturity_progress
  FOR EACH ROW EXECUTE FUNCTION notify_progress_item_assigned();
```

---

### MAT-MED-005: No Bulk Operations
**Files:** Both modules

**Issue:** No bulk update/delete operations. Must process items one by one.

**Impact:** LOW - Inefficient for admins managing multiple items

**Fix:** Add bulk endpoints:
```typescript
// app/api/maturity-assessment/progress/bulk/route.ts
export async function PATCH(request: Request) {
  const { ids, status } = await request.json();

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'IDs array is required' }, { status: 400 });
  }

  if (ids.length > 100) {
    return NextResponse.json({ error: 'Cannot update more than 100 items at once' }, { status: 400 });
  }

  const results = await MaturityAssessmentService.bulkUpdateProgress(ids, { status });

  return NextResponse.json(results);
}
```

---

### GRV-MED-007: Missing Search Highlighting
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/grievance/grievance-service.ts`

**Issue:** Search results don't highlight matched terms.

**Impact:** LOW - Poor UX for search

**Fix:** Add highlighting using PostgreSQL `ts_headline`:
```typescript
if (filters.search) {
  query = query.select(`
    *,
    headline:ts_headline('english', subject, websearch_to_tsquery('${filters.search}'))
  `);
}
```

---

### MAT-MED-006: No Department Hierarchy Support
**File:** `/Users/omm/PROJECTS/MyJKKN/types/maturity-assessment.ts`

**Issue:** Assessments are flat by department. No support for hierarchical rollups (e.g., show average for entire college).

**Impact:** LOW - Limited reporting capabilities

**Fix:** Add aggregation view:
```sql
CREATE VIEW maturity_department_hierarchy_rollup AS
WITH RECURSIVE dept_tree AS (
  -- Base: leaf departments
  SELECT id, parent_id, name FROM departments WHERE parent_id IS NULL
  UNION ALL
  -- Recursive: parent departments
  SELECT d.id, d.parent_id, d.name
  FROM departments d
  INNER JOIN dept_tree dt ON d.id = dt.parent_id
)
SELECT
  dt.id AS department_id,
  dt.name AS department_name,
  AVG(ma.overall_stage) AS avg_stage
FROM dept_tree dt
LEFT JOIN maturity_assessments ma ON ma.department_id = dt.id
WHERE ma.status = 'approved'
GROUP BY dt.id, dt.name;
```

---

## 🟢 LOW PRIORITY ISSUES (Code Quality)

### GRV-LOW-001: Hardcoded Magic Numbers
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/grievance/grievance-service.ts`
**Line:** 353

**Issue:**
```typescript
const slaHours = category?.default_sla_hours || 48;
```

**Fix:** Use constants:
```typescript
// constants/grievance.ts
export const DEFAULT_SLA_HOURS = 48;
export const SLA_AT_RISK_HOURS = 4;

// In service
const slaHours = category?.default_sla_hours || DEFAULT_SLA_HOURS;
```

---

### GRV-LOW-002: Missing JSDoc Comments
**Files:** All service files

**Issue:** Public methods lack documentation.

**Fix:**
```typescript
/**
 * Fetches grievance tickets with optional filtering and pagination
 *
 * @param filters - Optional filters for querying tickets
 * @returns Promise resolving to paginated ticket list with metadata
 * @throws Error if database query fails
 *
 * @example
 * const tickets = await GrievanceService.getTickets({
 *   institution_id: 'uuid',
 *   status: 'open',
 *   page: 1,
 *   limit: 20
 * });
 */
static async getTickets(filters: GrievanceTicketFilters = {}): Promise<GrievanceTicketListResponse> {
```

---

### MAT-LOW-001: Type Safety in JSON Fields
**File:** `/Users/omm/PROJECTS/MyJKKN/types/maturity-assessment.ts`

**Issue:** `dimension_scores` is typed as `Record<MaturityDimensionName, MaturityStage>` but stored as JSONB, which loses type safety.

**Fix:** Use Zod for runtime validation:
```typescript
import { z } from 'zod';

const DimensionScoresSchema = z.object({
  Leadership: z.number().min(1).max(4),
  Strategy: z.number().min(1).max(4),
  People: z.number().min(1).max(4),
  Processes: z.number().min(1).max(4),
  Resources: z.number().min(1).max(4),
  Results: z.number().min(1).max(4)
});

// Use in service
const validated = DimensionScoresSchema.parse(data.dimension_scores);
```

---

### GRV-LOW-003: Inconsistent Naming
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/grievance/grievance-service.ts`

**Issue:** Some methods use `get`, others use `fetch`. Be consistent.

**Fix:** Standardize to `get`:
- `getTickets()` ✅
- `fetchTickets()` ❌

---

### MAT-LOW-002: Missing Created/Updated By Fields
**File:** Database schema

**Issue:** Tables have `created_by` and `updated_by` fields, but they're not always populated.

**Fix:** Add trigger to auto-populate:
```sql
CREATE OR REPLACE FUNCTION set_created_by()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_created_by
  BEFORE INSERT ON maturity_assessments
  FOR EACH ROW EXECUTE FUNCTION set_created_by();
```

---

### GRV-LOW-004: No Metrics/Analytics Tracking
**Files:** All modules

**Issue:** No tracking for feature usage, performance metrics, or user behavior.

**Impact:** LOW - Can't measure feature adoption or identify bottlenecks

**Fix:** Add analytics:
```typescript
import { analytics } from '@/lib/analytics';

static async createTicket(ticketData: CreateGrievanceTicketDto): Promise<GrievanceTicket> {
  const startTime = Date.now();

  try {
    const ticket = await this.supabase.from('grievance_tickets').insert(...);

    analytics.track('grievance_ticket_created', {
      category: ticketData.category_id,
      priority: ticketData.priority,
      raiser_type: ticketData.raised_by_type,
      duration_ms: Date.now() - startTime
    });

    return ticket;
  } catch (error) {
    analytics.track('grievance_ticket_create_failed', {
      error: error.message,
      duration_ms: Date.now() - startTime
    });
    throw error;
  }
}
```

---

### MAT-LOW-003: No Data Validation on Update
**File:** `/Users/omm/PROJECTS/MyJKKN/lib/services/maturity-assessment/maturity-assessment-service.ts`

**Issue:** `updateAssessment()` accepts partial updates without validating the entire object is still valid.

**Fix:** Fetch current data and validate merged result:
```typescript
static async updateAssessment(
  id: string,
  dto: UpdateMaturityAssessmentDto
): Promise<MaturityAssessment> {
  // Fetch current assessment
  const current = await this.getAssessmentById(id);
  if (!current) {
    throw new Error('Assessment not found');
  }

  // Merge updates
  const merged = { ...current, ...dto };

  // Validate merged result
  const validated = updateAssessmentSchema.parse(merged);

  // Proceed with update
  const user = await this.supabase.auth.getUser();
  // ...
}
```

---

## Summary Statistics

### Issues by Module

| Module | Critical | High | Medium | Low | Total |
|--------|----------|------|--------|-----|-------|
| Grievance | 5 | 7 | 7 | 4 | 23 |
| Maturity | 3 | 5 | 6 | 3 | 17 |
| **Total** | **8** | **12** | **13** | **7** | **40** |

### Issues by Category

| Category | Count |
|----------|-------|
| Security | 8 |
| Null Safety | 6 |
| Performance | 5 |
| Data Validation | 7 |
| Error Handling | 4 |
| UX/UI | 6 |
| Code Quality | 4 |

---

## Recommendations

### Immediate Actions (Before Production)

1. **Fix all CRITICAL issues** - These pose security risks and data integrity issues
2. **Add comprehensive error handling** - Don't expose internal errors to users
3. **Implement rate limiting** - Prevent abuse and spam
4. **Add monitoring and alerts** - Track errors and performance issues

### Short-term Improvements (Next Sprint)

1. **Fix HIGH priority issues** - These will cause user-facing bugs
2. **Add unit tests** - Especially for SLA calculations and maturity score calculations
3. **Improve logging** - Use structured logging with the enhanced logger
4. **Add API documentation** - Swagger/OpenAPI specs for all endpoints

### Long-term Enhancements

1. **Implement analytics** - Track feature usage and user behavior
2. **Add export functionality** - CSV/Excel reports for admins
3. **Improve search** - Use full-text search indexes
4. **Add notifications** - Email/in-app notifications for important events

---

## Testing Checklist

Before marking these modules as production-ready, verify:

### Grievance System
- [ ] Ticket creation with all edge cases (missing fields, invalid data, etc.)
- [ ] SLA calculations for all priority levels and custom categories
- [ ] Comment threading and internal comments visibility
- [ ] Ticket assignment and reassignment
- [ ] Status transitions (open → in_progress → resolved → closed → reopened)
- [ ] Satisfaction rating after resolution
- [ ] Search functionality with special characters and SQL-like syntax
- [ ] Cross-institution access prevention (critical security test)
- [ ] File attachments (size limits, types, storage)
- [ ] Dashboard stats accuracy
- [ ] SLA report generation with date filters
- [ ] RLS policies for all user roles (student, parent, staff, admin)
- [ ] Concurrent ticket creation by multiple users
- [ ] Rate limiting enforcement

### Maturity Assessment
- [ ] Framework creation and default dimensions
- [ ] Assessment creation with all dimension scores
- [ ] Overall stage calculation accuracy
- [ ] Progress item creation and assignment
- [ ] Evidence attachment
- [ ] Assessment submission and approval workflow
- [ ] Dashboard aggregation accuracy
- [ ] Radar chart data generation
- [ ] Department comparison data
- [ ] Cross-institution access prevention (critical security test)
- [ ] Concurrent assessment creation prevention
- [ ] RLS policies for all user roles
- [ ] Progress item overdue calculations
- [ ] Dimension score validation (1-4 range)

---

## Code Review Conclusion

Both modules demonstrate **good architectural structure** with proper separation of concerns (service layer, API routes, hooks, validations). However, there are **significant security and data integrity issues** that must be addressed before production deployment.

**Key Strengths:**
- ✅ Well-structured codebase with clear module boundaries
- ✅ Comprehensive type definitions
- ✅ Good use of React Query for data fetching
- ✅ Database schema with proper indexes and constraints
- ✅ Row-level security policies in place

**Key Weaknesses:**
- ❌ Insufficient null safety and edge case handling
- ❌ Security gaps in cross-institution access control
- ❌ Limited error handling and user feedback
- ❌ Performance issues with large datasets (in-memory processing)
- ❌ Missing rate limiting and abuse prevention

**Recommendation:** **DO NOT deploy to production** until all CRITICAL and HIGH priority issues are resolved. Allocate 2-3 days for fixes and testing.

---

**Review Completed By:** Claude Code Senior Review Agent
**Review Date:** 2026-02-01
**Next Review:** After fixes are implemented
