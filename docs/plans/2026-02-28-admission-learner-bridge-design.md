# Admission → Learner Bridge: Design Document

**Date**: 2026-02-28
**Status**: Approved
**Author**: Claude Sonnet 4.6 + team

---

## 1. Problem Statement

The admission module tracks leads through a funnel (new → qualified → application → enrolled). The learners module manages student profiles starting from an enquiry form. These two modules currently have no automated bridge — staff must manually re-enter all student data when an admitted applicant becomes a learner, duplicating effort and introducing data-entry errors.

The `admission_leads.learner_profile_id` FK to `learners_profiles` exists in the DB schema but has never been used by any service.

---

## 2. Goal

Allow admissions staff to click a single **"Convert to Learner Enquiry"** button on the application detail page. This:

1. Creates a `learners_profiles` draft record pre-filled with all available data from the admission lead
2. Sets `admission_leads.learner_profile_id` to the created profile ID (preventing double-conversion)
3. Redirects staff directly to `/learners/enquiries/[id]/edit` to complete the missing fields
4. After completion, the enquiry follows the existing learner status flow: `enquiry → pending → approved → active`

---

## 3. Scope of Changes

### A. Normalize `admission_leads` to `first_name` + `last_name`

The admission module currently stores a single `full_name` TEXT column. The learners module uses `first_name` + `last_name` separately. To eliminate the split-at-bridge hack and unify both modules, `admission_leads` will be migrated to use `first_name` + `last_name`.

**DB migration:**
```sql
-- Add new columns
ALTER TABLE admission_leads
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name  TEXT;

-- Backfill from existing full_name
UPDATE admission_leads
  SET first_name = SPLIT_PART(COALESCE(full_name, ''), ' ', 1),
      last_name  = NULLIF(TRIM(SUBSTRING(COALESCE(full_name, '')
                    FROM POSITION(' ' IN COALESCE(full_name, '')))), '');

-- Keep full_name as a generated column for backward compatibility
-- (any legacy code referencing full_name still works)
ALTER TABLE admission_leads
  DROP COLUMN IF EXISTS full_name;

ALTER TABLE admission_leads
  ADD COLUMN full_name TEXT GENERATED ALWAYS AS (
    first_name || COALESCE(' ' || NULLIF(TRIM(last_name), ''), '')
  ) STORED;
```

**Codebase files to update:**

| File | Change |
|------|--------|
| `types/admission.ts` | Replace `full_name: string` with `first_name: string; last_name: string \| null` on `AdmissionLead` |
| `lib/services/admission/lead-service.ts` | Search now uses `first_name.ilike` + `last_name.ilike` OR still works via `full_name` generated col |
| `lib/services/admission/application-service.ts` | Select/display updates |
| `lib/services/admission/data-quality-service.ts` | Profiling field list update |
| `lib/services/admission/counselor-daily-view-service.ts` | Name display |
| `lib/services/admission/admission-ai-service.ts` | Prompt uses `first_name + last_name` |
| `app/(routes)/admission/leads/new/page.tsx` | Form: replace `full_name` with `first_name` + `last_name` inputs |
| `app/(routes)/admission/leads/[id]/page.tsx` | Display: `${lead.first_name} ${lead.last_name}` |
| `app/(routes)/admission/applications/_components/columns.tsx` | Applicant column display |
| All other admission components showing `lead.full_name` | Update to `lead.first_name + ' ' + lead.last_name` or use generated col |

---

### B. Bridge API Route

**New file:** `app/api/admission/bridge/convert/route.ts`

```
POST /api/admission/bridge/convert
Body: { leadId: string, institutionId: string }
Auth: Required (createClient().auth.getUser())
DB:   createServiceRoleClient() for both reads and writes
```

**Steps (server-side):**
1. Authenticate user → 401 if unauthenticated
2. Parse & validate body → 400 if missing fields
3. Fetch `admission_lead` by `leadId` + `institution_id` → 404 if not found
4. Guard: if `lead.learner_profile_id` is already set → 409 Conflict `{ error: 'Already converted', profileId: lead.learner_profile_id }`
5. Map lead fields → `learners_profiles` insert shape (see field map below)
6. INSERT `learners_profiles` → get `profileId`
7. UPDATE `admission_leads SET learner_profile_id = profileId WHERE id = leadId`
8. If step 7 fails → DELETE the profile created in step 6 (compensating rollback)
9. Return `{ profileId }`

---

### C. Field Mapping

| `admission_leads` | → | `learners_profiles` | Transform |
|---|---|---|---|
| `first_name` | → | `first_name` | direct |
| `last_name` | → | `last_name` | direct |
| `phone` | → | `student_mobile` | direct |
| `email` | → | `student_email` | direct (empty string if null) |
| `date_of_birth` | → | `date_of_birth` | direct |
| `gender` | → | `gender` | direct |
| `institution_id` | → | `institution_id` | direct |
| `degree_id` | → | `degree_id` | direct |
| `department_id` | → | `department_id` | direct |
| `program_id` | → | `program_id` | direct |
| `state` | → | `permanent_address_state` | direct |
| `district` | → | `permanent_address_district` | direct |
| `pincode` | → | `permanent_address_pin_code` | direct |
| `address_line1` | → | `permanent_address_street` | direct |
| `parent_name` | → | `father_name` | best-effort |
| `parent_phone` | → | `father_mobile` | best-effort |

**Hardcoded safe defaults for required fields:**

| Field | Default | Notes |
|-------|---------|-------|
| `lifecycle_status` | `'enquiry'` | Always draft |
| `accommodation_type` | `'DAY SCHOLAR'` | Safe default, staff changes if needed |
| `entry_type` | `'FIRST YEAR'` | Safe default |
| `last_school` | `''` | Required col — staff fills |
| `board_of_study` | `''` | Required col — staff fills |
| `tenth_marks` | `'{}'` | Required JSONB — staff fills |
| `twelfth_marks` | `'{}'` | Required JSONB — staff fills |
| `religion` | `''` | Required col — staff fills |
| `community` | `''` | Required col — staff fills |
| `mother_name` | `''` | Required col — staff fills |
| `mother_mobile` | `''` | Required col — staff fills |

---

### D. Application Detail Page UI

**File:** `app/(routes)/admission/applications/[id]/page.tsx`

- **If `lead.learner_profile_id` is null**: Show "Convert to Learner Enquiry" button (purple, Sparkles icon)
  - On click: POST to `/api/admission/bridge/convert`, show loading state
  - On success: redirect to `/learners/enquiries/[profileId]/edit`
  - On error: show error toast with message
- **If `lead.learner_profile_id` is set**: Button replaced with "View Learner Profile" link → `/learners/profiles/[learner_profile_id]`

---

## 4. Error Handling

| Scenario | Response | UI Behaviour |
|----------|----------|--------------|
| Not authenticated | 401 | Redirect to login |
| Missing leadId/institutionId | 400 | Toast error |
| Lead not found | 404 | Toast: "Application not found" |
| Already converted | 409 | Toast: "Already converted" + redirect to existing profile |
| DB insert fails | 500 | Toast: specific error message |
| DB update (set FK) fails | 500 | Profile cleaned up, toast: "Conversion failed — please try again" |

---

## 5. What Is NOT Changed

- Learner enquiry form itself — no changes required, it already supports draft/pre-fill
- Learner profile status machine — unchanged, same `enquiry → pending → approved → active` flow
- The `admission_applications` legacy table — not touched (remains unused)
- Existing admission funnel stages — no new stages added
- The learners module does NOT gain any back-reference to the admission module

---

## 6. Implementation Order

1. **DB migration** — add `first_name`/`last_name` to `admission_leads`, backfill, replace `full_name` with generated column
2. **TypeScript types** — update `AdmissionLead` interface
3. **Admission services** — update all service files to use `first_name`/`last_name`
4. **Admission UI** — update leads create form, lead detail, applications columns, and all name display
5. **Bridge API route** — `app/api/admission/bridge/convert/route.ts`
6. **Application detail page** — add Convert / View Learner Profile button

---

## 7. Files Created / Modified

### New Files
- `app/api/admission/bridge/convert/route.ts`
- `supabase/migrations/YYYYMMDD_admission_leads_first_last_name.sql`

### Modified Files
- `types/admission.ts`
- `lib/services/admission/lead-service.ts`
- `lib/services/admission/application-service.ts`
- `lib/services/admission/data-quality-service.ts`
- `lib/services/admission/counselor-daily-view-service.ts`
- `lib/services/admission/admission-ai-service.ts`
- `lib/services/admission/ai-insights-service.ts` (route.ts buildLeadStats)
- `app/(routes)/admission/leads/new/page.tsx`
- `app/(routes)/admission/leads/[id]/page.tsx`
- `app/(routes)/admission/applications/[id]/page.tsx`
- `app/(routes)/admission/applications/_components/columns.tsx`
- All other admission components displaying `lead.full_name`
