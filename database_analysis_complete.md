# Root Cause Analysis: Nattraja Academic Department Missing from School Defaults Page

## Executive Summary
Nattraja Vidhyalya CBSE has TWO K-12 Program degrees due to a batch script bug. The School Defaults page queries the first K-12 Program degree (which lacks the Academic department), while the Academic department was added to the second degree. This is why "Academic" doesn't show up in the UI even though the batch script says defaults were configured.

---

## The Problem

### What's Visible on School Defaults Page
- JKKN Matric: Shows Academic department ✓
- Nattraja Vidhyalya: Shows NO departments (displays "No departments available")

### Root Cause: Two K-12 Program Degrees
Nattraja has TWO distinct K-12 Program degrees in the database:

#### Degree #1 (Original - Created 2026-04-24)
- **ID**: `02e2925a-069d-4050-8829-deebf6fcac0c`
- **degree_id**: `NV-K12` (institution-specific code)
- **degree_name**: `K-12 Program`
- **Departments**: 5 total (NO Academic)
  - Pre-Primary
  - Primary
  - Middle
  - Secondary
  - Higher Secondary

#### Degree #2 (Batch-Created - Created 2026-05-27T04:22:47)
- **ID**: `8de8dd6d-9d3d-4bae-a068-274ea5363a8b`
- **degree_id**: `K-12` (generic code)
- **degree_name**: `K-12 Program`
- **Departments**: 1 total (ONLY Academic)
  - Academic

### Why the School Defaults Page Fails
File: `app/(routes)/organizations/school-defaults/_components/school-defaults-page.tsx`, line 83:

```typescript
const k12Degree = school.degrees?.find((d: any) => d.degree_name === 'K-12 Program');
```

This finds the **FIRST** K-12 Program degree. For Nattraja, this returns Degree #1 (the one from 2026-04-24), which has no Academic department. The Academic department in Degree #2 remains invisible.

---

## The Bug: Batch Script Logic Error

File: `scripts/batch-autofill-school-learners.ts`, lines 79-84:

```typescript
const { data: existingDegree, error: degreeCheckError } = await supabase
  .from('degrees')
  .select('id')
  .eq('degree_id', 'K-12')          // ← PROBLEM: Hard-coded value
  .eq('institution_id', school.id)
  .maybeSingle();

if (!degreeId) {  // ← If not found, creates a new degree
  // Creates new degree with degree_id='K-12'
}
```

### Why This Breaks Nattraja
1. Nattraja's existing K-12 degree has `degree_id='NV-K12'` (institution-specific code from 2026-04-24)
2. The script checks for `degree_id='K-12'` (generic code)
3. Query returns NO match → Script creates a NEW degree with `degree_id='K-12'`
4. Academic department is inserted into the NEW degree, not the existing one

### Why JKKN Works Fine
JKKN's K-12 degree has `degree_id='K-12'` (generic code), so the script finds it and adds the Academic department to the existing degree.

---

## Database State Comparison

### JKKN (Working Correctly)
```
Institution: JKKN Matric Higher Secondary School (e04b8a7f-1445-4ef1-92e9-bde3d32b1f44)
└─ Degree: K-12 Program
   ├─ degree_id: 'K-12'
   ├─ created_at: 2026-04-24T09:19:52.903914+00:00
   └─ Departments (6):
      ├─ Academic (ACAD) ← Present
      ├─ Pre-Primary (PRE-PRIMARY)
      ├─ Primary (PRIMARY)
      ├─ Middle (MIDDLE)
      ├─ Secondary (SECONDARY)
      └─ Higher Secondary (HS)
```

### Nattraja (Broken - Two Degrees)
```
Institution: Nattraja Vidhyalya CBSE (29c221d1-b918-4c46-9d67-857273b0b553)
├─ Degree #1: K-12 Program (ORIGINAL)
│  ├─ degree_id: 'NV-K12'
│  ├─ created_at: 2026-04-24T03:55:43.198162+00:00
│  └─ Departments (5):
│     ├─ Pre-Primary (PRE-PRIMARY)
│     ├─ Primary (PRIMARY)
│     ├─ Middle (MIDDLE)
│     ├─ Secondary (SECONDARY)
│     └─ Higher Secondary (HS)
│
└─ Degree #2: K-12 Program (BATCH-CREATED DUPLICATE)
   ├─ degree_id: 'K-12'
   ├─ created_at: 2026-05-27T04:22:47.244475+00:00
   └─ Departments (1):
      └─ Academic (ACAD) ← Only here, not in Degree #1
```

---

## Fix Options

### Option 1: Delete Duplicate Degree (RECOMMENDED - Safest)
```sql
-- Delete the duplicate degree and reassign learners
DELETE FROM degrees 
WHERE id = '8de8dd6d-9d3d-4bae-a068-274ea5363a8b'
AND institution_id = '29c221d1-b918-4c46-9d67-857273b0b553';

-- Then move the Academic department from the deleted degree to the original
UPDATE departments
SET degree_id = '02e2925a-069d-4050-8829-deebf6fcac0c'
WHERE id = 'b234e240-cd81-4fdd-9cc3-c5f1c161de13';

-- Or if no learners are assigned to degree #2 yet, just delete it
```

### Option 2: Merge All Departments into Degree #2
```sql
-- Move Pre-Primary, Primary, Middle, Secondary, HS from degree #1 to degree #2
UPDATE departments
SET degree_id = '8de8dd6d-9d3d-4bae-a068-274ea5363a8b'
WHERE degree_id = '02e2925a-069d-4050-8829-deebf6fcac0c';

-- Delete the empty original degree
DELETE FROM degrees 
WHERE id = '02e2925a-069d-4050-8829-deebf6fcac0c';
```

### Option 3: Fix the Batch Script
Update `scripts/batch-autofill-school-learners.ts` line 82 to check `degree_name` instead of hard-coded `degree_id`:

```typescript
// OLD (buggy):
.eq('degree_id', 'K-12')

// NEW (correct):
.ilike('degree_name', 'K-12%')
```

---

## Impact Assessment

### Current Impact
- ❌ Nattraja's Academic department is hidden from School Defaults page
- ❌ Learners assigned to degree #2 (the batch-created one) won't appear in UI queries
- ⚠️ Database inconsistency: One school has 1 degree, another has 2 with same name

### Downstream Risks
- If learners_profiles.degree_id points to degree #2, they might not be queried correctly by the UI
- Future batch runs will likely create MORE duplicate degrees unless the script is fixed
- Audit logs and reporting may show inconsistent data

---

## Recommendations

1. **IMMEDIATE**: Delete the duplicate degree (#2) and move the Academic department to degree #1
2. **VERIFY**: Check if any learners are assigned to degree #2 before deleting
3. **FIX**: Update batch script line 82 to use `degree_name` instead of hard-coded `degree_id`
4. **TEST**: Run batch script against Nattraja again to ensure it doesn't create more duplicates
5. **AUDIT**: Check for similar patterns in other institutions created with institution-specific codes (e.g., 'NV-K12')

---

## Files to Review
- `scripts/batch-autofill-school-learners.ts` - Fix the degree lookup logic
- `app/(routes)/organizations/school-defaults/_components/school-defaults-page.tsx` - Consider querying by institution_id + degree_name, or using degree_order/display_name to disambiguate
