# Counselor Management Feature — Design Doc
**Date:** 2026-02-22

---

## Goal
Add full counselor management to the Admission CRM: create counselors from existing `profiles` (role=counselor), assign them to one or more institutions via a junction table, list/edit/deactivate them, and surface an institution-scoped counselor picker on the lead creation/edit form.

---

## Database

### New table: `admission_counselor_institutions`
Junction table linking one counselor to many institutions.

```sql
CREATE TABLE admission_counselor_institutions (
  counselor_id   uuid NOT NULL REFERENCES admission_counselors(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  created_at     timestamptz DEFAULT now(),
  PRIMARY KEY (counselor_id, institution_id)
);
```

RLS: same pattern as other admission tables — `institution_id = auth_institution_id()` OR super_admin bypass.

The existing `admission_counselors.institution_id` column is retained for backward compatibility with the performance dashboard RPC but the junction table is the source of truth for routing.

---

## UI

### Counselors page (`/admission/counselors`)
Add a tab bar:
- **Performance** — existing leaderboard (zero changes)
- **Management** — new tab with counselor list + actions

**Management tab:**
- Table columns: Name, Email, Phone, Designation, Institutions (badges), Status, Actions
- "Add Counselor" button (top-right) → opens a dialog
- Row actions: Edit institutions, Deactivate/Activate

### Add / Edit Counselor dialog
Steps:
1. Search & select a user from `profiles WHERE role = 'counselor'` and `is_active = true`
   - Name + email auto-filled from profile
   - Only shows profiles not already added as a counselor
2. Multi-select institutions (checkboxes, all institutions the admin can see)
3. Designation field (editable, pre-filled from profile.designation)
4. Save:
   - INSERT into `admission_counselors` (`user_id`, `name`, `email`, `phone`, `designation`, `is_active`)
   - INSERT into `admission_counselor_institutions` for each selected institution

### Lead form counselor picker (`/admission/leads/new` + `/admission/leads/[id]`)
- New "Assign Counselor" select field
- Fetches `admission_counselors` joined via `admission_counselor_institutions` WHERE `institution_id = <lead's institution>`
- Only active counselors shown
- Optional — can be left blank and assigned later

---

## Service layer

New `CounselorManagementService` in `lib/services/admission/counselor-management-service.ts`:

| Method | Description |
|---|---|
| `listCounselors(institutionId)` | All counselors for an institution via junction table, with institution badges |
| `getEligibleProfiles(institutionId)` | `profiles WHERE role='counselor'` not already in admission_counselors |
| `addCounselor(input)` | Create counselor row + junction rows |
| `updateCounselorInstitutions(counselorId, institutionIds[])` | Replace junction rows |
| `toggleActive(counselorId, isActive)` | Flip is_active flag |
| `getCounselorsForInstitution(institutionId)` | Lightweight list for lead form dropdown |

---

## Hook layer

New `useCounselorManagement(institutionId)` hook in `hooks/admission/use-counselor-management.ts`:
- `counselors` — list query
- `eligibleProfiles` — query for add dialog
- `addCounselor` — mutation
- `updateInstitutions` — mutation
- `toggleActive` — mutation

Existing `useCounselorsList` hook (used in daily-view assign) updated to use junction table.

---

## Constraints
- Only `role = 'counselor'` profiles are eligible
- Super admin sees all institutions; institution_admin sees only their own
- Deactivating a counselor does NOT unassign them from existing leads (historical data preserved)
