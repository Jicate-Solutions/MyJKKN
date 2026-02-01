# Institution Access Control Security Fix - Status Report
**Date:** 2026-02-01
**Priority:** CRITICAL - Data Leak Vulnerability
**Status:** IN PROGRESS (Part 1 Complete)

---

## ⚠️ SECURITY ISSUE IDENTIFIED

**Vulnerability:** Cross-Institution Data Access
**Impact:** CRITICAL - Users can access data from other institutions by manipulating `institution_id` parameters
**Risk:** Data breach, privacy violation, compliance failure (GDPR, data protection laws)

---

## ✅ COMPLETED WORK (Part 1)

### 1. Type Definitions - Make `institution_id` REQUIRED

All filter interfaces now enforce `institution_id` as a required field:

| File | Interfaces Updated |
|------|-------------------|
| `types/stakeholder-nps.ts` | `SurveyFilters`, `AnalyticsFilters` |
| `types/parent-portal.ts` | `ParentProfileFilters`, `CommunicationFilters` |
| `types/grievance.ts` | `GrievanceCategoryFilters`, `GrievanceTicketFilters` |
| `types/maturity-assessment.ts` | `MaturityAssessmentFilters` |
| `types/billing-copq.ts` | `COPQFilters` |
| `types/process-excellence.ts` | All 4 filter interfaces |
| `types/okr.ts` | `OKRObjectiveFilters`, `OKRTeamFilters` |

**Before:**
```typescript
export interface SurveyFilters {
  institution_id?: string; // VULNERABLE - optional
}
```

**After:**
```typescript
export interface SurveyFilters {
  institution_id: string; // REQUIRED for security
}
```

### 2. Service Layer - Add Validation Helpers

Added `validateInstitutionAccess()` method to ALL service classes:

| Service | File |
|---------|------|
| NPSService | `lib/services/stakeholder-nps/nps-service.ts` |
| ParentPortalService | `lib/services/parent-portal/parent-portal-service.ts` |
| GrievanceService | `lib/services/grievance/grievance-service.ts` |
| MaturityAssessmentService | `lib/services/maturity-assessment/maturity-assessment-service.ts` |
| BillingCOPQService | `lib/services/billing/copq/billing-copq-service.ts` |
| ProcessExcellenceService | `lib/services/process-excellence/process-excellence-service.ts` |
| OKRKeyResultService | `lib/services/okr/okr-key-result-service.ts` |

**Validation Logic:**
```typescript
private static async validateInstitutionAccess(
  institutionId: string
): Promise<void> {
  // 1. Check institution_id is provided
  if (!institutionId || institutionId.trim() === '') {
    throw new Error('Institution ID is required');
  }

  // 2. Get current authenticated user
  const { data: { user }, error: authError } = await this.supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Authentication required');
  }

  // 3. Verify user has access to this institution
  const { data: access, error } = await this.supabase
    .from('user_institution_access')
    .select('institution_id')
    .eq('user_id', user.id)
    .eq('institution_id', institutionId)
    .single();

  // 4. Reject unauthorized access
  if (error || !access) {
    console.error('[module] Access denied:', { userId: user.id, institutionId });
    throw new Error('Access denied: Institution not accessible to user');
  }
}
```

---

## 🔄 IN PROGRESS (Part 2)

### Tasks Remaining:

#### Task #3: Enforce `institution_id` in Service Methods
- [ ] Update ALL service methods to call `validateInstitutionAccess()` before queries
- [ ] Remove optional chaining on `institution_id` (e.g., `filters?.institution_id`)
- [ ] Make `institution_id` a required parameter (not optional)

**Files to Update:** All 7 service files listed above

**Example Pattern:**
```typescript
// Before
static async getSurveys(filters: SurveyFilters = {}): Promise<SurveyListResponse> {
  let query = this.supabase.from('nps_surveys').select('*');

  if (filters.institution_id) { // VULNERABLE - optional check
    query = query.eq('institution_id', filters.institution_id);
  }
}

// After
static async getSurveys(filters: SurveyFilters): Promise<SurveyListResponse> {
  // SECURITY: Validate access first
  await this.validateInstitutionAccess(filters.institution_id);

  // SECURITY: Always filter by institution_id
  let query = this.supabase
    .from('nps_surveys')
    .select('*')
    .eq('institution_id', filters.institution_id); // REQUIRED - no optional check
}
```

#### Task #4: Add Institution Access Check to API Routes
- [ ] Add middleware to ALL API routes (~50 files)
- [ ] Validate user's institution access in every route handler
- [ ] Return 403 Forbidden if access denied

**Directories:**
- `app/api/stakeholder-nps/**/*.ts`
- `app/api/parent-portal/**/*.ts`
- `app/api/grievance/**/*.ts`
- `app/api/maturity-assessment/**/*.ts`
- `app/api/billing/copq/**/*.ts`
- `app/api/process-excellence/**/*.ts`

**Middleware Pattern:**
```typescript
export async function GET(request: Request) {
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get requested institution_id
  const { searchParams } = new URL(request.url);
  const institutionId = searchParams.get('institution_id');

  if (!institutionId) {
    return NextResponse.json(
      { error: 'institution_id is required' },
      { status: 400 }
    );
  }

  // SECURITY: Verify user has access to this institution
  const { data: access } = await supabase
    .from('user_institution_access')
    .select('institution_id')
    .eq('user_id', user.id)
    .eq('institution_id', institutionId)
    .single();

  if (!access) {
    return NextResponse.json(
      { error: 'Access denied: Institution not accessible' },
      { status: 403 }
    );
  }

  // Proceed with request
  // ...
}
```

#### Task #5: Update React Hooks to Pass `institution_id`
- [ ] Update ALL React hooks to always pass `institution_id`
- [ ] Use `useUserInstitutionAccess` hook to get institution_id
- [ ] Remove conditional rendering based on optional `institution_id`

**Directories:**
- `hooks/stakeholder-nps/`
- `hooks/parent-portal/`
- `hooks/grievance/`
- `hooks/maturity-assessment/`
- `hooks/billing/`
- `hooks/process-excellence/`
- `hooks/okr/`

**Pattern:**
```typescript
// Before
export function useSurveys(filters?: SurveyFilters) {
  return useQuery({
    queryKey: ['surveys', filters],
    queryFn: () => NPSService.getSurveys(filters || {}) // VULNERABLE
  });
}

// After
export function useSurveys(filters: SurveyFilters) {
  const { currentInstitution } = useUserInstitutionAccess();

  return useQuery({
    queryKey: ['surveys', filters],
    queryFn: () => NPSService.getSurveys({
      ...filters,
      institution_id: currentInstitution!.id // REQUIRED
    }),
    enabled: !!currentInstitution
  });
}
```

#### Task #6: Testing & Verification
- [ ] TypeScript compilation passes
- [ ] API routes reject unauthorized institution access (test with 403 responses)
- [ ] Services throw errors for invalid institution access
- [ ] Hooks properly pass institution_id
- [ ] Cross-institution data access is blocked
- [ ] End-to-end testing with multiple institutions

---

## 🔴 BREAKING CHANGES

**These changes will intentionally break existing code:**

1. **TypeScript Compilation Errors**
   - Any code not passing `institution_id` will fail to compile
   - This is INTENTIONAL - forces developers to fix security holes

2. **Runtime Errors**
   - Service methods will throw errors if called without `institution_id`
   - API routes will return 400/403 errors if `institution_id` missing or invalid

3. **Hook Signatures Changed**
   - Hooks now require `institution_id` in filters
   - Components must use `useUserInstitutionAccess` hook

---

## 📊 CURRENT BUILD STATUS

**Status:** ❌ FAILING (Expected)

**Known TypeScript Errors:**
- `app/(routes)/grievance/_data/get-tickets.ts`: Missing `institution_id` in default filters
- Multiple components: Missing `institution_id` in hook calls
- API routes: Missing institution access validation

**These errors are EXPECTED and will be fixed in Part 2.**

---

## 🎯 NEXT STEPS

1. **Immediate:** Fix TypeScript compilation errors by updating service method calls
2. **Priority:** Add middleware to all API routes
3. **Follow-up:** Update React hooks and components
4. **Final:** Comprehensive security testing

---

## 📝 COMMIT HISTORY

| Commit | Description |
|--------|-------------|
| `c0124315` | Part 1: Type definitions + Service validation helpers |
| (pending) | Part 2: Enforce in service methods + API middleware |
| (pending) | Part 3: Update hooks and components |
| (pending) | Part 4: Testing and verification |

---

## ⚠️ IMPORTANT NOTES

1. **DO NOT deploy until Part 2 is complete** - Current state has security helpers but not enforcing them everywhere
2. **DO NOT revert these changes** - TypeScript errors are intentional, guiding developers to fix security issues
3. **DO pass `institution_id` in ALL service calls** - No exceptions
4. **DO test with multiple institutions** - Verify cross-institution access is blocked

---

**Last Updated:** 2026-02-01 22:56 IST
**Next Review:** After Part 2 completion
