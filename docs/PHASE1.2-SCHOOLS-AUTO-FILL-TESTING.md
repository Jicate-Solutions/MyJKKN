# Phase 1.2: Schools Auto-Fill Implementation & Testing

## Overview
This document covers the K-12 school student auto-fill feature (Phase 1.2) that uses entity_type='school' to automatically assign virtual degree/department records.

## Architecture

### Service Layer: SchoolDefaultsService
Located: `lib/services/school-defaults-service.ts`

**Constants:**
- `VIRTUAL_DEGREE_NAME`: 'K-12 Program'
- `VIRTUAL_DEGREE_CODE`: 'K12'
- `VIRTUAL_DEPARTMENT_NAME`: 'Academic'
- `VIRTUAL_DEPARTMENT_CODE`: 'ACAD'

**Methods:**
1. **getOrCreateSchoolDegree(institutionId)** → VirtualRecord | null
   - Finds existing K-12 Program degree by code
   - Creates if missing (idempotent)
   - Returns {id, name, code, institution_id}

2. **getOrCreateSchoolDepartment(degreeId)** → VirtualRecord | null
   - Finds existing Academic department under degree
   - Creates if missing (idempotent)
   - Returns {id, name, code, institution_id}

3. **getSchoolDefaults(institutionId)** → SchoolDefaults | null
   - Main entry point: ensures both virtual records exist
   - Returns {degree_id, department_id, degree_name, department_name}
   - Called on form load to pre-populate IDs

4. **enforceSchoolDefaults(institutionId, entityType, formData)** → Record<string, any>
   - Service-layer enforcement preventing manual override
   - Only acts if entityType === 'school'
   - Returns formData with overridden degree_id/department_id
   - Called by LearnerProfileService.createLearnerProfile

### Integration Points

#### 1. Form Layer (course-selection.tsx)
**Location:** `app/(routes)/learners/enquiries/_components/form-sections/course-selection.tsx`

**Already Implemented:**
- Lines 77-82: Detect if selected institution is a school
- Lines 369-379: Green info banner for schools
- Lines 382-432: Hide Degree selector for schools
- Lines 462-511: Hide Department selector for schools

**Flow:**
1. User selects institution
2. Form fetches institutions and checks entity_type
3. If school: hide degree/department fields, show info banner
4. If college: show degree/department selectors

#### 2. Form Validation
**Enquiry Form Schema:** `app/(routes)/learners/enquiries/_components/enquiry-form.tsx`
- Lines 164-165: Updated to make degree_id/department_id nullable/optional

**Create Learner Schema:** `lib/validations/learner-create-schema.ts`
- Lines 59-60: Updated to make degree_id/department_id nullable/optional

**Rationale:** Schools don't require user input for these fields; service layer enforces defaults.

#### 3. Service Layer (LearnerProfileService)
**Location:** `lib/services/learner-profile-service.ts`

**createLearnerProfile() Method:**
1. Fetch institution to get entity_type
2. Call SchoolDefaultsService.enforceSchoolDefaults()
3. Use enforced DTO (with auto-filled degree/department) for insert
4. Continue with normal profile creation flow

**Code (lines 559-611):**
```typescript
// Fetch institution entity_type
const { data: institution } = await supabase
  .from('institutions')
  .select('id, entity_type')
  .eq('id', dto.institution_id)
  .single();

// Enforce school defaults (auto-fill degree/department for schools)
const enforcedDto = await SchoolDefaultsService.enforceSchoolDefaults(
  dto.institution_id,
  institution?.entity_type,
  dto as Record<string, any>
);

// Use enforcedDto for insert instead of dto
```

## Testing Scenarios

### Scenario 1: Create learner for COLLEGE (control)
**Step 1:** Navigate to /learners/profiles/create
**Step 2:** Fill basic details tab
**Step 3:** Go to "Course Selection" tab
**Step 4:** Select any college institution
**Expected:** Degree and Department fields appear and are required
**Step 5:** Fill degree → department → program → semester → section
**Step 6:** Fill remaining tabs and submit
**Expected:** Learner created with selected degree_id/department_id

### Scenario 2: Create learner for SCHOOL (new functionality)
**Step 1:** Navigate to /learners/profiles/create
**Step 2:** Fill basic details tab
**Step 3:** Go to "Course Selection" tab
**Step 4:** Select a school institution (entity_type='school')
**Expected:** Green banner appears: "School admission — Degree and department are automatically assigned for school students."
**Expected:** Degree and Department fields are HIDDEN
**Step 5:** Only Program, Semester, Section are visible/required
**Step 6:** Fill remaining tabs and submit
**Expected:** 
  - Learner created successfully
  - degree_id set to K-12 Program (auto-created if needed)
  - department_id set to Academic (auto-created if needed)
  - Roll number assigned correctly

### Scenario 3: Virtual record idempotency
**Step 1:** Create first school learner (see Scenario 2)
**Expected:** K-12 Program degree and Academic department created
**Step 2:** Create second school learner at same school
**Expected:**
  - No new virtual records created (reuse existing)
  - Learner linked to same degree/department as first
  - No database errors

### Scenario 4: CAS school learner (multi-institution siblings)
**Step 1:** Navigate to /learners/profiles/create as CAS faculty
**Step 2:** Course Selection tab
**Step 3:** Select a CAS school (one of the sibling institutions)
**Expected:** Green banner appears, fields hidden
**Step 4:** Fill and submit
**Expected:** Learner created with auto-filled defaults specific to selected school

### Scenario 5: Edit learner (school → maintain enforcement)
**Step 1:** Create learner for school (Scenario 2)
**Step 2:** Navigate to /learners/enquiries/{id}/edit
**Step 3:** Go to Course Selection tab
**Expected:** 
  - Green banner still shows
  - Degree/Department fields still hidden
  - Existing values visible in form data (but not editable)
**Step 4:** Save and close
**Expected:** No changes to degree_id/department_id

## Database Checks

### Verify virtual records created:
```sql
-- Check degrees table for K-12 Program
SELECT id, degree_name, degree_code, institution_id 
FROM degrees 
WHERE degree_code = 'K12' 
ORDER BY created_at DESC 
LIMIT 5;

-- Check departments table for Academic
SELECT id, department_name, department_code, degree_id 
FROM departments 
WHERE department_code = 'ACAD' 
ORDER BY created_at DESC 
LIMIT 5;
```

### Verify learner records:
```sql
-- Check learners created at schools have auto-filled IDs
SELECT 
  id, 
  first_name, 
  institution_id, 
  degree_id, 
  department_id,
  lifecycle_status
FROM learners_profiles lp
WHERE institution_id IN (
  SELECT id FROM institutions WHERE entity_type = 'school'
)
ORDER BY created_at DESC 
LIMIT 10;

-- Verify all school learners have the K-12 Program degree
SELECT COUNT(*) as total_school_learners,
       COUNT(CASE WHEN degree_id = (
         SELECT id FROM degrees WHERE degree_code = 'K12' LIMIT 1
       ) THEN 1 END) as with_k12_degree
FROM learners_profiles lp
WHERE institution_id IN (
  SELECT id FROM institutions WHERE entity_type = 'school'
);
```

## Implementation Checklist

### Code Changes ✅
- [x] Created SchoolDefaultsService (lib/services/school-defaults-service.ts)
- [x] Integrated into LearnerProfileService.createLearnerProfile
- [x] Updated enquiry form schema to make degree_id/department_id optional
- [x] Updated create learner schema to match
- [x] Form UI already has conditional rendering for schools

### Files Modified
1. `lib/services/school-defaults-service.ts` — NEW
2. `lib/services/learner-profile-service.ts` — ADD import, update createLearnerProfile
3. `app/(routes)/learners/enquiries/_components/enquiry-form.tsx` — UPDATE schema
4. `lib/validations/learner-create-schema.ts` — UPDATE schema
5. `app/(routes)/learners/enquiries/_components/form-sections/course-selection.tsx` — NO CHANGES (already has logic)

### Commits
1. ✅ SchoolDefaultsService creation
2. ✅ LearnerProfileService integration
3. ✅ Form schema updates

## Known Limitations

1. **No bulk update for schools:** If degree/department IDs are manually changed in database, there's no bulk sync. Manual fix via scripts needed.

2. **Optional dept constraint:** Department field is now optional in form validation. College submissions must still have degree/department, but validation is relaxed. Service enforcement only applies to schools.

3. **CAS institution expansion:** For CAS colleges with multiple siblings, SchoolDefaultsService doesn't expand institution_ids. The service-role-bypass for multi-institution access should be added if needed.

## Deferred Tasks (Phase 1.3+)

1. Update LearnerProfileService.updateLearnerProfile to enforce defaults
2. Add batch auto-fill for existing learners at schools (data migration)
3. Add admin UI to view/manage virtual degree/department records
4. Implement CAS-aware virtual record sharing (multiple schools → single set)

## Rollback Plan

If issues occur:

1. **Keep virtual records:** Don't delete K-12 Program degree/Academic departments
2. **Stop enforcing:** Comment out enforceSchoolDefaults call in createLearnerProfile
3. **Make fields required again:** Revert schema changes in enquiry-form.tsx and create-learner-schema.ts
4. **Show fields in form:** Uncomment Degree/Department fields in course-selection.tsx

## Notes

- Service enforcement at createLearnerProfile prevents manual override
- Virtual records are created on-demand (first learner at each school triggers creation)
- Idempotent design ensures no duplicate records
- Form hiding + schema + service layer = triple defense against inconsistency
