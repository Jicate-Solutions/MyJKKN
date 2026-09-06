# Phase 1.3: Update Learner Edit Flow with School Defaults Enforcement

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Prevent manual override of degree/department when editing school learners. Enforce automatic defaults consistently across both create and edit flows.

**Architecture:** Mirror the Phase 1.2 `createLearnerProfile` enforcement pattern into `updateLearnerProfile`. Fetch institution entity_type, call `SchoolDefaultsService.enforceSchoolDefaults()`, use enforcedDto for database update.

**Tech Stack:** TypeScript, Supabase, Zod validation, SchoolDefaultsService (existing)

---

## Task 1: Add Enforcement Call to updateLearnerProfile

**Files:**
- Modify: `lib/services/learner-profile-service.ts:638-805` (updateLearnerProfile method)

**Step 1: Locate the updateLearnerProfile method**

The method starts at line 638. Currently:
1. Validates college_email uniqueness (lines 648-715)
2. Updates learner profile with provided DTO (lines 717-727)
3. Calculates profile completeness (line 735)
4. Checks auto-activation (line 758)

**Step 2: Add institution fetch before initial update**

After email validation (line 715) and before the update query (line 717), add:

```typescript
// Fetch institution entity_type to determine if school defaults should be enforced
const institutionId = dto.institution_id || (await supabase
  .from('learners_profiles')
  .select('institution_id')
  .eq('id', id)
  .single()
  .then(r => r.data?.institution_id));

let institution = null;
if (institutionId) {
  const { data: inst } = await supabase
    .from('institutions')
    .select('id, entity_type')
    .eq('id', institutionId)
    .single();
  institution = inst;
}
```

**Step 3: Add school defaults enforcement**

Import SchoolDefaultsService if not already imported at top of file:

```typescript
import SchoolDefaultsService from './school-defaults-service';
```

After institution fetch (before line 717), add enforcement:

```typescript
// Enforce school defaults (prevent manual override for schools)
const enforcedDto = await SchoolDefaultsService.enforceSchoolDefaults(
  institutionId,
  institution?.entity_type,
  dto as Record<string, any>
);
```

**Step 4: Use enforcedDto instead of dto in update**

Change line 721 from:
```typescript
.update({
  ...dto,
  updated_at: new Date().toISOString(),
  updated_by: currentUserId,
})
```

To:
```typescript
.update({
  ...enforcedDto,
  updated_at: new Date().toISOString(),
  updated_by: currentUserId,
})
```

**Step 5: Verify the update compiles**

Run: `npm run typecheck`

Expected: No TypeScript errors

**Step 6: Commit**

```bash
git add lib/services/learner-profile-service.ts
git commit -m "feat: enforce school defaults in updateLearnerProfile to prevent override on edit"
```

---

## Task 2: Add Test Cases for Edit Enforcement

**Files:**
- Create: `__tests__/lib/services/learner-profile-service.test.ts` (or append if exists)
- Modify: `lib/services/learner-profile-service.ts` (add comment with test scenarios)

**Step 1: Document test scenarios in code**

Add comment block above updateLearnerProfile method (before line 634):

```typescript
/**
 * Update learner profile
 * Updated: 2026-05-26 - Added school defaults enforcement to prevent override on edit
 * 
 * Test scenarios:
 * 1. Edit college learner: degree_id/department_id can be changed freely
 * 2. Edit school learner: degree_id/department_id are reset to school defaults
 * 3. Edit school learner (no degree_id in DTO): degree_id set to school default
 * 4. Edit school learner changing institution to college: degree_id now required/editable
 * 5. Edit college learner changing institution to school: degree_id reset to school default
 */
```

**Step 2: Write test skeleton (optional for now)**

If running tests locally, add test file:

```typescript
// __tests__/lib/services/learner-profile-service.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import LearnerProfileService from '@/lib/services/learner-profile-service';

describe('LearnerProfileService.updateLearnerProfile', () => {
  describe('School defaults enforcement', () => {
    it('should prevent override of degree_id for school learners', async () => {
      // TODO: Mock supabase client with school learner
      // TODO: Call updateLearnerProfile with different degree_id
      // TODO: Assert degree_id was reset to school default
    });

    it('should allow degree_id change for college learners', async () => {
      // TODO: Mock supabase client with college learner
      // TODO: Call updateLearnerProfile with different degree_id
      // TODO: Assert degree_id was updated as provided
    });

    it('should enforce defaults when institution changes to school', async () => {
      // TODO: Mock learner currently at college, changing to school
      // TODO: Assert degree_id reset to school default
    });
  });
});
```

**Step 3: Run type check**

Run: `npm run typecheck`

Expected: No errors

**Step 4: Commit**

```bash
git add __tests__/lib/services/learner-profile-service.test.ts
git commit -m "test: add test scenarios for school defaults enforcement in edit flow"
```

---

## Task 3: Update Documentation

**Files:**
- Modify: `docs/PHASE1.2-SCHOOLS-AUTO-FILL-TESTING.md`

**Step 1: Add edit flow scenario**

In the "Testing Scenarios" section, add after Scenario 5:

```markdown
### Scenario 6: Edit learner (school → maintain enforcement on edit)
**Step 1:** Create learner for school (Scenario 2)
**Step 2:** Navigate to /learners/enquiries/{id}/edit
**Step 3:** Go to Course Selection tab
**Step 4:** Attempt to change Degree to a different value (or leave blank)
**Step 5:** Go to other tabs, make a minor change (e.g., update phone number)
**Step 6:** Save and close
**Expected:** 
  - Degree/Department fields still hidden (UI enforcement)
  - On re-load, degree_id/department_id are unchanged (service enforcement)
  - No error on save
```

**Step 2: Update deferred tasks section**

Change line that says "Update LearnerProfileService.updateLearnerProfile to enforce defaults" to:

```markdown
- [x] Update LearnerProfileService.updateLearnerProfile to enforce defaults (Phase 1.3)
```

**Step 3: Commit**

```bash
git add docs/PHASE1.2-SCHOOLS-AUTO-FILL-TESTING.md
git commit -m "docs: add edit flow enforcement to Phase 1.2 testing guide"
```

---

## Task 4: Verify End-to-End

**Files:**
- Run locally against dev server

**Step 1: Build the app**

Run: `npm run build`

Expected: No build errors

**Step 2: Start dev server**

Run: `npm run dev`

Expected: Server running on port 3000/3001 without errors

**Step 3: Manual verification (optional)**

If you have authenticated access:
- Create school learner (Phase 1.2)
- Navigate to edit page
- Attempt to change degree/department (verify hidden or reset)
- Save and verify no errors in console

**Step 4: Commit verification**

Run: `git log --oneline -5`

Expected: Show 3 new commits from tasks 1-3

---

## Success Criteria

- [x] SchoolDefaultsService.enforceSchoolDefaults() called in updateLearnerProfile
- [x] enforcedDto used in database update (not original dto)
- [x] TypeScript type checking passes
- [x] Build succeeds
- [x] No runtime errors when updating school learners
- [x] Documentation updated with edit scenario
- [x] Commits created with clear messages

## Files Changed

1. `lib/services/learner-profile-service.ts` – Add institution fetch + enforcement call
2. `__tests__/lib/services/learner-profile-service.test.ts` – Add test scenarios
3. `docs/PHASE1.2-SCHOOLS-AUTO-FILL-TESTING.md` – Add edit scenario + mark as complete

## Rollback

If issues occur:
1. Remove enforcement call (lines added in Task 1, Step 2-3)
2. Revert dto to use original (not enforcedDto) in update query
3. Revert documentation changes
4. Commit as: `fix: revert school defaults enforcement in edit flow`

## Notes

- The enforcement pattern is identical to createLearnerProfile (Phase 1.2)
- Both flows now have triple defense: UI hiding + validation + service enforcement
- Edit flow completes Phase 1.2 deferred task #1
- Phase 1.4 can then focus on bulk/batch updates
