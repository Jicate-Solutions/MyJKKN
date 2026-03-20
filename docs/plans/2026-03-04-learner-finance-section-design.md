# Learner Finance Section Tab — Design Document

**Date:** 2026-03-04
**Module:** Learners (Enquiries + Profiles)
**Status:** Approved

## Overview

Add a permission-gated "Finance Details" tab (Tab 6) to the shared `EnquiryForm` component used by both enquiries and learner profiles. This tab captures per-student fee structure data at admission time.

## Requirements

1. **Common fees** (application fee, university registration fee) shown for all learners
2. **Fee structure type** dropdown: "Tuition + Hostel Fee" or "Day Scholar Fee"
   - Tuition + Hostel: separate fields for tuition and hostel fees
   - Day Scholar: single combined fee field
3. **Optional fees**: uniform, hospital training, placement — always visible within the tab
4. **Entire Finance tab is permission-gated**: super admin has full access, custom roles need `learners.finance.view` / `learners.finance.edit`
5. **Per-student manual entry** — no auto-population from program defaults

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Data storage | Columns on `learners_profiles` | Simplest approach — fee data travels with the profile, no joins needed |
| Permission scope | Entire tab gated | Clean UX — either you see all finance data or none |
| Fee data model | Per-student manual entry | Flexible — different students may have different structures |
| Detail view placement | New sidebar section #7 | Prominent, consistent with form tab placement |

## Database Schema

Migration: `supabase/migrations/20260304_add_learner_finance_fields.sql`

```sql
ALTER TABLE learners_profiles
  ADD COLUMN application_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN university_reg_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN fee_structure_type TEXT DEFAULT NULL
    CHECK (fee_structure_type IN ('tuition_hostel', 'dayscholar')),
  ADD COLUMN tuition_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN hostel_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN dayscholar_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN uniform_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN hospital_training_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN placement_fee NUMERIC(15,2) DEFAULT NULL;
```

All columns nullable — finance section is optional and permission-gated.

## Permissions

New permission keys added to `lib/constants/permissions.ts`:

```
learners.finance.view   → Can see Finance tab in form + detail view
learners.finance.edit   → Can modify fee field values
```

Access matrix:

| Role | Tab Visible | Can Edit |
|---|---|---|
| Super admin | Yes | Yes |
| Custom role with `learners.finance.view` + `learners.finance.edit` | Yes | Yes |
| Custom role with `learners.finance.view` only | Yes | No (read-only) |
| Custom role without finance permissions | No | No |
| Student (self-service) | No | No |

## Form UI (Tab 6)

New component: `app/(routes)/learners/enquiries/_components/form-sections/finance-details.tsx`

Layout:
- **Common Fees row**: Application Fee | University Registration Fee
- **Fee Structure Type**: dropdown/select — "Tuition + Hostel Fee" or "Day Scholar Fee"
- **Conditional fields**:
  - If `tuition_hostel`: Tuition Fee | Hostel Fee (2-column)
  - If `dayscholar`: Day Scholar Fee (full-width)
- **Optional Fees row**: Uniform Fee | Hospital Training Fee
- **Optional Fees row**: Placement Fee

All currency fields use `NUMERIC(15,2)` — displayed as number inputs with proper formatting.

## Detail View

Add "Finance" as section #7 in sidebar nav for both:
- `enquiries/_components/enquiry-detail.tsx`
- `profiles/_components/learner-detail.tsx`

Positioned between "Accommodation" (#5) and "Admission Details" (#6 → now #8).

Permission-gated: only rendered if user has `learners.finance.view` or is super admin.

## Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260304_add_learner_finance_fields.sql` | CREATE | Database migration |
| `supabase/setup/01_tables.sql` | MODIFY | Add columns to table definition |
| `types/learner.ts` | MODIFY | Extend LearnerProfile interface |
| `enquiries/_components/form-sections/finance-details.tsx` | CREATE | New form tab component |
| `enquiries/_components/enquiry-form.tsx` | MODIFY | Add 6th tab, update zod schema |
| `enquiries/_components/enquiry-detail.tsx` | MODIFY | Add Finance detail section |
| `profiles/_components/learner-detail.tsx` | MODIFY | Add Finance detail section |
| `lib/constants/permissions.ts` | MODIFY | Add finance permission keys |

## Validation Rules (Zod)

- All fee fields are optional (`.nullable().optional()`)
- `fee_structure_type` must be `'tuition_hostel'` or `'dayscholar'` when provided
- When `fee_structure_type = 'tuition_hostel'`: `tuition_fee` and `hostel_fee` should be filled
- When `fee_structure_type = 'dayscholar'`: `dayscholar_fee` should be filled
- Fee amounts must be non-negative when provided
