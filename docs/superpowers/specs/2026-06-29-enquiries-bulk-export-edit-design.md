# Enquiries — Super-Admin Bulk Export & Bulk Edit

**Date:** 2026-06-29
**Status:** Approved (design) → implementing
**Area:** `/learners/enquiries` (Admission Management)

## Problem

The `/learners/enquiries` page is the admission lifecycle board — it shows learners in
**every lifecycle status except `active`** (active learners live in `/learners/profiles`).
Super admins need to (a) **export all of these records** to Excel and (b) **re-import an
edited file to bulk-UPDATE** a safe subset of fields. Today the page only has a
**create-only** bulk-upload flow (`bulk-upload-enquiries.tsx` + `enquiries/import` +
`enquiries/template`); there is no export of existing records and no update path.

## Key decisions (confirmed with user)

1. **Editable scope = safe subset.** Personal, contact, parent/guardian, address, education
   marks, entrance-exam scores, and reference fields are editable. Academic placement
   (institution→section), `lifecycle_status`, `entry_type`, `scholarship_type`,
   `accommodation_type`, and `quota` are **read-only** (downstream billing/eligibility risk).
2. **Re-import is update-only.** Every row is keyed by the profile `id`. Rows with a
   blank/unknown id are reported as errors; no new records are ever created here.
3. **Export = all-except-active, ignoring tab/filters.** One predictable "export everything"
   action that mirrors the page's "Search All" semantics (`lifecycle_status != 'active'`).
4. **Super-admin only.** Buttons hidden unless `useAuth().isSuperAdmin`; the API routes also
   reject non-super-admins server-side (defense in depth).

## Architecture — reuse the existing active-learner bulk-edit subsystem

The codebase already has a complete, server-side, id-keyed **export → preview → apply**
pipeline for **active** learners. The enquiry feature is its **non-active twin** and reuses
the same service + utilities, so we are recomposing proven code rather than building new
mechanics.

Existing pieces being reused:
- `lib/services/bulk-learner-edit-service.ts` — `exportActiveForEdit`, `previewChanges`,
  `processBulkEdit` (id-keyed partial update, community/caste/accommodation/quota label→FK
  resolution, activity logging, per-row error capture). Runs on the service-role admin
  client; access is enforced in app code.
- `lib/services/learner-validation-service.ts` — `validateBulkEditExited` (requires `id`,
  validates email/mobile formats).
- `lib/utils/excel-parser.ts` — `parseExcelFile`, `mapColumns`, `sanitizeValue`.
- Reference flow: `app/api/learners/export-exited-for-edit`, `.../bulk-edit-preview`,
  `.../bulk-edit-exited`, and `app/(routes)/learners/profiles/_components/bulk-edit-exited-dialog.tsx`.

### Service change (additive, non-breaking)

Add a trailing scope/flag param to the three methods so the **active** routes keep their
exact current behavior (default), and the enquiry routes opt into the non-active scope:

- `exportActiveForEdit(..., lifecycleScope: 'active' | 'non_active' = 'active')`
  → when `non_active`: filter `.neq('lifecycle_status', 'active')` and skip the
  `is_profile_complete` filter (enquiries are inherently incomplete).
- `previewChanges(..., requireActive = true)` → eligibility flips to `exists && !isActive`;
  adds an `eligible` field to the result (active route ignores it).
- `processBulkEdit(..., requireActive = true)` → skips active rows in the non-active path and
  uses `.neq('lifecycle_status', 'active')` as the update safety guard.

Active call sites pass no new args → identical behavior, zero regression.

### New enquiry routes (super-admin only)

All three fetch the profile, then `if (!profile.is_super_admin) return 403`.

- `GET  /api/learners/enquiries/export-for-edit` → `exportActiveForEdit(..., 'non_active')`,
  builds `.xlsx` (sheet **`Enquiries`**), filename `enquiries-bulk-edit-<date>.xlsx`.
- `POST /api/learners/enquiries/bulk-edit-preview` → parse → enquiry `COLUMN_MAPPING` →
  `previewChanges(..., requireActive=false)` → diff summary.
- `POST /api/learners/enquiries/bulk-edit-apply` → parse → enquiry `COLUMN_MAPPING` →
  `validateBulkEditExited` → `processBulkEdit(..., requireActive=false)` → per-row result.

### Enquiry COLUMN_MAPPING (safe subset only)

Mapped (editable): `id` (required), first/last name, DOB, gender, religion, community, caste,
aadhar, blood_group, all parent/guardian fields, annual_income, student_mobile, college_email,
student_email, permanent address (street/taluk/district/pin/state), last_school, board_of_study,
10th & 12th marks (flattened → JSONB), medical/engineering cutoff, NEET roll/score, reference
type/name/contact.

**Not mapped (read-only, dropped if edited):** institution/degree/department/program/semester/
section/academic_year/regulation/batch (+ their IDs), admission_year, entry_type,
scholarship_type, accommodation_type, quota, counseling_*, bus_required, roll/register number,
student_photo_url, lifecycle_status. The export still emits these as **context columns** (names)
so the editor has reference, but they never map back.

### UI

- `app/(routes)/learners/enquiries/_components/bulk-edit-enquiries-dialog.tsx` — adapted from
  `bulk-edit-exited-dialog.tsx`: same export → select → **preview** → confirm/apply → results
  flow, but **no academic/institution filter card** (export is always all-except-active) and
  pointed at the enquiry routes / `Enquiries` sheet.
- `enquiries-header.tsx` — render `{isSuperAdmin && <BulkEditEnquiriesDialog onSuccess={refresh} />}`
  via `useAuth()`.

## Round-trip semantics

- Blank editable cell on a row → field left **unchanged** (partial update; service only writes
  non-empty mapped fields). This matches the active flow and avoids accidental nulling.
- Email uniqueness collisions (`23505`) and bad UUIDs (`22P02`) are caught **per row** and
  surfaced in the result report; one bad row never aborts the batch.
- `''` is normalized away by the "non-empty only" rule; `college_email` is never written as `''`.

## Files

**New**
- `app/api/learners/enquiries/export-for-edit/route.ts`
- `app/api/learners/enquiries/bulk-edit-preview/route.ts`
- `app/api/learners/enquiries/bulk-edit-apply/route.ts`
- `app/(routes)/learners/enquiries/_components/bulk-edit-enquiries-dialog.tsx`

**Edited (minimal/additive)**
- `lib/services/bulk-learner-edit-service.ts` (trailing scope params)
- `app/(routes)/learners/enquiries/_components/enquiries-header.tsx` (render gated dialog)

**Untouched (zero regression):** active-learner routes/dialog, the enquiry create flow
(`bulk-upload-enquiries.tsx`, `template/route.ts`, `import/route.ts`).

## Risks & mitigations

- **Regression to active flow** → service changes are additive trailing params with active
  defaults; active call sites unchanged.
- **Editing a sensitive field** → enforced read-only via column-mapping omission (proven trick
  from the active flow); status/academic/billing-drivers can't move.
- **Large export** → service already paginates in 1000-row batches.
- **Super-admin bypass** → server-side `is_super_admin` check on all three routes, not just the
  hidden UI.

## Verification

- `mcp__ide__getDiagnostics` clean on all touched files.
- Manual: as a super admin, Export → edit a name/mobile/marks in a couple of rows → Preview
  shows the diffs → Apply updates them; verify a blank cell leaves the value unchanged and a
  duplicate email surfaces as a per-row error. Confirm the buttons are absent for a
  non-super-admin and the routes 403.
