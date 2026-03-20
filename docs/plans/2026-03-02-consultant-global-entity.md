# Consultant Global Entity — Remove Institution Requirement
**Date**: 2026-03-02
**Status**: Approved
**Goal**: Consultants are global/common entities visible and usable by all institutions, with no institution selection required at creation, edit, or import time.

---

## Architecture Decision

`education_consultants` is already a global table (no institution_id column). The `consultant_institutions` junction table (status, tier, contract dates) is KEPT for future per-institution linking — but it is NOT required at creation time and NOT shown in create/edit/import flows.

**Before**: Create consultant → must select institution(s) → junction rows created
**After**: Create consultant → global profile saved → no junction rows created at this stage

The `consultant_institutions` table stays in the DB as-is (no DROP). Commission tracking, tier, and status can still be linked later via the consultant detail page's existing "Assigned Institutions" section.

---

## Task 1 — Fix RLS Policies on education_consultants

**Files:**
- Modify: `supabase/setup/03_policies.sql` (add comment + updated policy text)
- Execute SQL via Supabase MCP

**Context:**
The current SELECT policy on `education_consultants` checks `EXISTS (consultant_institutions WHERE institution_id = auth_institution_id()) OR is_super_admin`. This means **consultants without a junction row are invisible to non-super-admin users**, which completely breaks the global model.

**Changes:**
Replace the restrictive SELECT policy with: any authenticated user can SELECT any consultant.

```sql
-- Drop old policies
DROP POLICY IF EXISTS "Consultants select policy" ON education_consultants;
DROP POLICY IF EXISTS "edu_consultants_select" ON education_consultants;
DROP POLICY IF EXISTS "consultants_select_policy" ON education_consultants;
-- (also try all common naming patterns)

-- New policy: all authenticated users can read all consultants
CREATE POLICY "consultants_global_select"
  ON education_consultants FOR SELECT
  USING (auth.role() = 'authenticated');

-- UPDATE / DELETE: require user is in same institution OR super admin
-- (keep existing or replace as needed — query current names first)
```

**Step 1**: Query current policy names for education_consultants
**Step 2**: Drop SELECT policy, create new one
**Step 3**: Verify by querying `pg_policies`
**Step 4**: Update `supabase/setup/03_policies.sql` to reflect new policy

---

## Task 2 — Update Types: Make institution_ids Optional

**Files:**
- Modify: `types/education-consultants.ts`

**Current state (line ~150):**
```typescript
export interface CreateConsultantInput {
  institution_ids: string[]; // ← required
  status?: ConsultantStatus;
  tier?: ConsultantTier;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  // ...
}
```

**Changes:**
```typescript
export interface CreateConsultantInput {
  institution_ids?: string[]; // ← optional, ignored on creation
  // status/tier/contract fields — remove or mark as deprecated
  // (they live on consultant_institutions, not on global consultant)
  // ...
}
```

Also update `ConsultantFilters`:
```typescript
export interface ConsultantFilters {
  institution_id?: string; // Keep as optional — used for filtering by super admin
  // ...
}
```

---

## Task 3 — Update Consultant Service

**Files:**
- Modify: `lib/services/admission/consultant-service.ts`

**Changes to `createConsultant()`:**
- Remove the `if (!institution_ids || institution_ids.length === 0) throw new Error(...)` guard
- Remove step 2 (junction table insert — no longer needed at creation)
- Keep step 1 (global consultant insert into `education_consultants`)
- `institution_ids` is accepted but ignored

**Changes to `getConsultants()`:**
- Use LEFT JOIN always (remove the `!inner` conditional)
- When no `institution_id` filter: query only `education_consultants` without joining junction at all (cleaner)
- When `institution_id` filter is provided: still JOIN for filtering (super admin use case)
- Remove status/tier junction filters if institution_id is not provided

**No changes needed:**
- `updateConsultant()` — already global
- `deleteConsultant()` — already global
- `getConsultantById()` — already fetches junction data separately (keep for detail page)

---

## Task 4 — Update Create Page

**Files:**
- Modify: `app/(routes)/admission/consultants/new/page.tsx`

**Remove:**
- `chosenInstitutionIds` state (line 61)
- `toggleInstitution()` function (lines 66-70)
- `targetInstitutionIds` resolution logic (lines 74-77)
- The institution checkbox grid section in the render (lines ~259-285)
- Institution validation check on submit (lines 156-159)
- `institution_ids` from form default values (line 82)
- `institution_ids: targetInstitutionIds` from the payload (line 165)
- `institutions` from the `useUserInstitutionAccess()` destructuring (if only used for institution picker)

**Keep:**
- `useUserInstitutionAccess` import if used elsewhere on the page

**Form submit change:**
- Remove institution-related payload fields
- Just call `ConsultantService.createConsultant(payload)` with global fields only

---

## Task 5 — Update Edit Page

**Files:**
- Modify: `app/(routes)/admission/consultants/[id]/edit/page.tsx`

**Remove:**
- The read-only institution display block (lines 356-368):
  ```tsx
  {consultant && (
    <div className="flex items-center gap-2 ...">
      Institution: ... (cannot be changed after creation)
    </div>
  )}
  ```
- `institutions` from `useUserInstitutionAccess()` destructuring if only used for that display
- Remove `Building2` import if only used there

**Keep everything else** — the edit form updates global consultant fields, which is already correct.

---

## Task 6 — Update Details Page

**Files:**
- Modify: `app/(routes)/admission/consultants/[id]/page.tsx`

**Remove / Hide:**
- The "Assigned Institutions" tab entirely (currently shows junction table data)
- The institutions count badge in the header (lines ~246-277)
- Any tab that renders `consultant.institutions[]` array

**Keep:**
- All other tabs (Profile, Financial, Performance, etc.)
- Commission tracking section if it doesn't depend on junction display

**Note:** Do NOT remove from service — the junction data may still be useful for commission calculations. Just don't show the "Assigned Institutions" tab in the UI.

---

## Task 7 — Update Bulk Import

**Files:**
- Modify: `app/api/admission/consultants/import/route.ts`
- Modify: `app/(routes)/admission/consultants/_components/import-dialog.tsx`

**Route changes:**
- Remove institution resolution logic (lines ~86-97)
- Remove `formInstitutionId` reading from form data
- Remove the `!institutionId` check that returns 400
- Remove Step 2 (junction table insert — lines ~341-360)
- Remove `is_super_admin` from profile select (no longer needed)
- Keep: auth, profile fetch (just for `full_name`), file parsing, row validation, Step 1 insert

**Dialog changes:**
- Remove institution picker UI entirely (lines ~417-434)
- Remove `useUserInstitutionAccess` import and hook usage
- Remove `institutions`, `selectedInstitutionId`, `showInstitutionPicker`, `targetInstitutionId`, `effectiveInstitutionId` state/variables
- Remove `Label`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` imports (if only used for institution picker)
- Remove `institution_id` from formData append
- Remove `setTargetInstitutionId('')` from reset handler

---

## Files Changed Summary

| File | Change |
|------|--------|
| `supabase/setup/03_policies.sql` | Replace restrictive SELECT with `auth.role() = 'authenticated'` |
| `types/education-consultants.ts` | `institution_ids?: string[]` (optional) |
| `lib/services/admission/consultant-service.ts` | Remove junction requirement in createConsultant, simplify getConsultants |
| `app/(routes)/admission/consultants/new/page.tsx` | Remove institution picker + validation |
| `app/(routes)/admission/consultants/[id]/edit/page.tsx` | Remove institution read-only display |
| `app/(routes)/admission/consultants/[id]/page.tsx` | Remove "Assigned Institutions" tab |
| `app/api/admission/consultants/import/route.ts` | Remove institution resolution + junction step 2 |
| `app/(routes)/admission/consultants/_components/import-dialog.tsx` | Remove institution picker UI |

## Files NOT Changed

- `consultant_institutions` table — kept as-is
- `lib/utils/mappings/consultant-excel-mappings.ts` — no change
- Commission service, payout service — no change
- `app/(routes)/admission/consultants/page.tsx` — list page, minimal change (remove institution_id from default filters if needed)
