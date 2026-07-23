# Design — Learner Create Form (Learners Management page)

**Date**: 2026-05-22
**Author**: Boobalan (with Claude)
**Status**: Approved (pending spec review)
**Related modules**: Learners, Admission Enquiries (shared form), RLS (`learners_profiles`)

---

## Problem

The Learners Management page (`/learners/profiles`) currently has only two paths for creating learners:

1. **Bulk Upload** via `BulkUploadProfilesDialogEnhanced` — strict 28-required-field validation, 35 optional fields, name-to-FK resolution, transaction-style batch insert through `BulkLearnerUploadService`.
2. **Edit** of an existing learner at `/learners/profiles/[id]/edit`, via `EnquiryForm`.

There is no per-record manual create path. Admin staff currently have to fall back to bulk upload (single-row XLSX) when they want to onboard one learner — clumsy UX.

## Goal

Add a single-learner manual create flow that:

- Is reached from a "Create Learner" button on `/learners/profiles`
- Produces an **active, onboarded learner** (lifecycle parity with bulk upload, **not** an admission enquiry)
- Enforces the **same required-field set** as bulk upload (28 fields)
- **Reuses** the existing `EnquiryForm` component — zero changes to the form's internals
- Hides the Finance section on create; fee resolution happens post-create via the service's existing `FeeResolutionService` integration
- Navigates to `/learners/profiles/{id}` (Profile detail) on success

## Non-goals

- No changes to `EnquiryForm`'s create-mode behavior for the admission enquiry flow (route `/learners/enquiries/...`) — that pathway continues to default `lifecycle_status='enquiry'`.
- No new DB migrations, no new RPC, no new API route, no new service method. Every backend surface already exists and is exercised by the edit page today.
- No bulk-upload-style name-to-FK resolution UX. Single-record create uses the form's existing FK dropdowns (better UX for one-at-a-time entry).
- No "Save Draft" button on this form (would create partial enquiry-status records — out of scope).

---

## Decisions

| Aspect | Decision | Rationale |
|---|---|---|
| Intent | Create active onboarded learner (`lifecycle_status='active'` via service auto-activation) | Matches bulk-upload semantics; user explicitly chose this in brainstorm |
| Required-field validation | Strict — all 28 bulk-upload required fields | User chose "Strict, matches bulk upload exactly" |
| Visible form sections | 5 of 6: Basic Details, Academic Info, Course Selection, Contact Details, Accommodation. Finance hidden. | Bulk upload doesn't include Finance columns; fee resolution runs post-save |
| Implementation approach | Wrapper page reusing `EnquiryForm`'s existing extension points (`visibleTabs`, `hideDraft`, `onSubmit`, `submitLabel`) | Zero changes to a 2000-line shared form; lowest drift risk; smallest diff |
| Route URL | `/learners/profiles/create` | Static segment beside `[id]/edit`; matches recommendation from codebase exploration |
| Entry button placement | On `/learners/profiles` page, beside "Bulk Upload Profiles" | User requested it "in this page" (Learners Management) |
| Permission key | `learners.create` (already exists in `lib/constants/permissions.ts:250`) | No new key; no catalog drift |
| Post-create navigation | `router.push('/learners/profiles/' + newId)` | Profile detail page — consistent with edit-page success flow |
| Lifecycle on create | Service inserts with `lifecycle_status='enquiry'` (its default), then auto-activates to `'active'` because the strict schema guarantees `is_profile_complete=true` + valid `college_email` | Reuses the service's existing auto-activation logic at `learner-profile-service.ts:81-160` |

---

## Architecture

```
app/(routes)/learners/profiles/
├── page.tsx                                ← MODIFY: add "Create Learner" button beside Bulk Upload
├── [id]/edit/page.tsx                      ← UNCHANGED
└── create/                                 ← NEW DIRECTORY
    ├── page.tsx                            ← NEW: route + PermissionGuard + page chrome
    └── _components/
        └── learner-create-form.tsx        ← NEW: wrapper around <EnquiryForm/>

app/(routes)/learners/enquiries/_components/
└── enquiry-form.tsx                        ← UNCHANGED — consumed as a library

lib/validations/
└── learner-create-schema.ts                ← NEW: strict 28-required-field Zod schema
```

**Principle**: Every behavioural divergence from the enquiry-create flow lives in the wrapper (`learner-create-form.tsx`) and the strict schema (`learner-create-schema.ts`). `EnquiryForm` itself is not modified.

---

## Components

### `app/(routes)/learners/profiles/create/page.tsx`

A small client component (~40 lines):

- Wrap content in `<PermissionGuard permission="learners.create" />` (mirrors existing learner pages).
- Render page chrome: back-link to `/learners/profiles`, page title "Create Learner".
- Mount `<LearnerCreateForm />`.

```tsx
'use client';
export default function CreateLearnerPage() {
  return (
    <PermissionGuard permission="learners.create" fallback={<UnauthorizedNotice/>}>
      <PageHeader title="Create Learner" backHref="/learners/profiles" />
      <LearnerCreateForm />
    </PermissionGuard>
  );
}
```

### `learner-create-form.tsx`

The wrapper component (~150 lines). Responsibilities:

1. Manage success/error state and navigation via `useRouter()`.
2. Call `useCreateLearnerProfile()` for the mutation (the existing React Query hook at `hooks/use-learner-profiles.ts:125`).
3. Define `handleStrictSubmit(formData)` — applies `createLearnerSchema` parsing before delegating to the service.
4. Render `<EnquiryForm/>` with create-flow-tuned props:

```tsx
<EnquiryForm
  learner={undefined}                              // signals create mode in the form
  visibleTabs={[
    'basic',
    'academic',
    'course-selection',
    'contact',
    'accommodation',
  ]}                                               // Finance excluded
  hideDraft={true}                                 // suppress "Save Draft" button
  submitLabel="Create Learner"
  onSubmit={handleStrictSubmit}                    // custom strict submit handler
  onSuccess={(learner) =>
    router.push(`/learners/profiles/${learner.id}`)
  }
/>
```

`handleStrictSubmit(formData)`:

1. `createLearnerSchema.safeParse(formData)`
   - On failure: surface errors using the same toast-grouping / tab-jump / field-focus UX the form already implements. Two acceptable mechanisms — pick the smaller-surface one during the implementation plan:
     - **(a)** Throw a typed error and let the form's existing `onInvalid` path handle display.
     - **(b)** Replicate the small `groupFieldsByTab` toast call inside the wrapper.
   - On success: continue.
2. `await useCreateLearnerProfile().mutateAsync(payload)` — payload is `formData` minus internal-only keys (draft flags, `savedEnquiryId`, etc.).
3. On resolved mutation: `onSuccess` callback fires, navigating to `/learners/profiles/{id}`.

**Double-submit guard** (per `feedback_react_query_disabled_prop_alone_isnt_enough.md`):

```tsx
const handleStrictSubmit = async (data) => {
  if (mutation.isPending) return;
  ...
};
```

### `learner-create-schema.ts`

Strict Zod schema, derived from `bulk-upload-validation.ts:42-173`. Required fields:

```
first_name, last_name, date_of_birth, gender, religion, community, caste,
father_name, father_mobile, mother_name, mother_mobile,
institution_id, degree_id, department_id, program_id,
semester_id, section_id, academic_year_id,
student_mobile, college_email (must end with @jkkn.ac.in),
permanent_address_street, permanent_address_taluk, permanent_address_district,
permanent_address_pin_code, permanent_address_state,
entry_type, scholarship_type, accommodation_type
```

Conditional rule (mirrors bulk-upload):
- When `accommodation_type === 'HOSTEL'`, also require `hostel_type` and `food_type`.

Other refinements:
- `student_mobile`, `father_mobile`, `mother_mobile` → `.regex(/^[0-9]{10}$/)`.
- `permanent_address_pin_code` → `.regex(/^[0-9]{6}$/)`.
- `college_email` → `.email().endsWith('@jkkn.ac.in')`.
- FK fields (`institution_id`, etc.) → `.uuid()`.
- All optional fields from bulk upload's 35-optional-field set → typed but `.optional()` so they pass through unchanged when present.

**DB NOT NULL columns that are bulk-upload-OPTIONAL** — `last_school` and `board_of_study` are `NOT NULL` at the DB column level but marked OPTIONAL by bulk upload (which submits `''` for absent values, consistent with `feedback_learners_profiles_community_not_null.md`). The wrapper's `handleStrictSubmit` will apply the same `'' default` coercion before calling the service, so any optional-but-DB-NOT-NULL field absent in form data is sent as an empty string. This list is small (likely just `last_school`, `board_of_study`); the plan phase will enumerate it explicitly by diffing the DB schema's `NOT NULL` set against the strict-required-field set.

### `page.tsx` (Learners Management) — modification

Add a "Create Learner" button beside the existing "Bulk Upload Profiles" button at `app/(routes)/learners/profiles/page.tsx:210`. The same `<PermissionGuard permission="learners.create">` wraps it so users without rights don't see it.

```tsx
<PermissionGuard permission="learners.create">
  <Button asChild>
    <Link href="/learners/profiles/create">
      <UserPlus className="mr-2 h-4 w-4" />
      Create Learner
    </Link>
  </Button>
</PermissionGuard>
```

---

## Data flow

```
1. User clicks "Create Learner" on /learners/profiles
2. router.push → /learners/profiles/create
3. <PermissionGuard> verifies learners.create → renders <LearnerCreateForm/>
4. <LearnerCreateForm/> mounts <EnquiryForm/> with the create-tuned props
5. User fills the 5 visible sections
6. User clicks "Create Learner" button
7. EnquiryForm's internal draft-schema parse runs (permissive — passes for any non-empty data)
8. Form invokes our onSubmit → handleStrictSubmit(data)
9. handleStrictSubmit runs createLearnerSchema.safeParse(data)
   ├─ FAIL: errors surfaced via tab-grouped toast; first invalid tab opens; first invalid field focused
   └─ PASS: continue
10. handleStrictSubmit calls mutation.mutateAsync(payload)
    → LearnerProfileService.createLearnerProfile(dto)
        - INSERT into learners_profiles (RLS enforces learners.create + institution-access)
        - lifecycle_status defaults to 'enquiry'
        - calculateProfileCompleteness() → is_profile_complete=true (4 academic fields present)
        - Auto-activation: 'enquiry' + complete + valid college_email → 'active'
        - Activity log via LearnerActivityTemplates.enquiryCreated()
        - POST /api/learners/complete-onboarding → user account created
11. React Query onSuccess: invalidate learnerProfileKeys.lists() + analytics
12. Wrapper's onSuccess: router.push(/learners/profiles/{id})
13. Profile detail page renders the newly active learner
```

No new RPC, no new service method, no new API route, no new DB migration.

---

## Error handling & UX

| Scenario | Behaviour |
|---|---|
| User lacks `learners.create` | `<PermissionGuard>` renders `<UnauthorizedNotice/>`; entry button hidden on Learners Management |
| Missing required fields | Strict-schema parse fails; toast lists errors grouped by tab; first invalid tab opens; first invalid field focuses (form's existing UX from `enquiry-form.tsx:1277-1331`) |
| College email not `@jkkn.ac.in` | Schema refinement fails inline (Contact Details tab) |
| Mobile not 10 digits | Schema regex fails inline; per-field error in the relevant tab |
| Pin code not 6 digits | Schema regex fails inline (Contact Details tab) |
| `accommodation_type='HOSTEL'` but `hostel_type` empty | Conditional refinement fails (Accommodation tab) |
| Duplicate college_email | Service catches PostgrestError; wrapper surfaces via `getErrorMessage()` (per `feedback_supabase_plain_error_not_error_instance.md`); toast: "A learner with this college email already exists." |
| RLS denies insert (no institution access) | Service throws; toast: "You don't have access to create learners in the selected institution." |
| Network failure | `withRetry()` (per `feedback_supabase_econnreset_use_withretry.md`) attempts a single retry; on hard failure, button re-enables and toast surfaces error |
| Double-click submit | `disabled={mutation.isPending}` on the button + early-return guard at top of `handleStrictSubmit` (per `feedback_react_query_disabled_prop_alone_isnt_enough.md`) |

---

## Permission & RLS

- **Permission key**: `learners.create` (already declared at `lib/constants/permissions.ts:250`). No new key required.
- **Role grants**: This key is held by `admission`, `admission_staff`, `administrator`, `super_admin`, and similar. Plan-phase verification: query `custom_roles.permissions` to confirm at least one operational role holds it. If gaps exist, add a `jsonb_build_object()` migration per `feedback_reserved_perm_keys_need_role_grants.md`.
- **RLS on `learners_profiles` INSERT**: existing policies gate INSERT by permission + institution-access (`role_has_institution_access(institution_id)`). The service uses the user-bound browser client (`createClientSupabaseClient()`), so RLS is enforced naturally. No service-role bypass.

---

## Testing approach

| Layer | What | How |
|---|---|---|
| Unit | `createLearnerSchema` accepts all 28 required fields when present; rejects when one is missing | Vitest + `safeParse()` on fixtures |
| Unit | Conditional: `accommodation_type='HOSTEL'` requires `hostel_type` + `food_type` | Vitest table-driven tests |
| Unit | Format refinements: mobile (10 digits), pin (6 digits), college_email domain | Vitest |
| Integration | `LearnerCreateForm` → service → DB roundtrip in a Supabase branch (RLS impersonation per `reference_rls_impersonation_via_jwt_claims.md`) | `mcp__supabase__execute_sql` with `SET LOCAL jwt.claims` |
| E2E (manual) | Real flow in dev — fill form, submit, verify learner appears in `/learners/profiles/{id}` with `lifecycle_status='active'`, `is_profile_complete=true`, and a profiles row | Browser + Supabase studio |
| Permission negative | Log in as a role without `learners.create`; confirm button hidden + direct URL access shows `<UnauthorizedNotice/>` | Manual |
| Bulk-upload parity | Create via new form with sample data; create same data (different email) via bulk upload; diff resulting rows column-by-column | Manual |

---

## Risks & open questions (to resolve during plan phase)

1. **Form `onSubmit` contract**: Need to confirm whether `EnquiryForm`'s custom `onSubmit` runs before or after its internal draft-schema parse. If after, our strict parse is redundant. If before, we are the only validator. Resolved by re-reading `enquiry-form.tsx:1341-1567` (`commitSubmit`) during planning.
2. **`formatFormDataForAPI()` reusability**: This helper currently lives inside `EnquiryForm` as a closure (`enquiry-form.tsx:1007-1179`). If not exported, plan-phase will either export it (one-line change) or duplicate a small subset (uppercase normalisation + location ID→name conversion). Export preferred.
3. **35 optional fields parity**: Plan-phase will diff the bulk-upload optional-field list against `EnquiryForm`'s rendered fields and confirm every optional field has a matching form input. (Initial inspection suggests full coverage; the diff is to verify.)
4. **Role grant audit**: Confirm at least one operational role holds `learners.create` before shipping; otherwise add a permission grant migration.

---

## Out of scope (deferred)

- "Save Draft" support on the create form (would re-introduce enquiry-status partial records).
- Bulk-upload-style name-to-FK resolution UX on the single-record form.
- Skipping `is_profile_complete` requirement (would land learner in `'enquiry'` rather than `'active'`).
- Mobile-optimised layout adjustments for the create form (inherit `EnquiryForm`'s responsive behaviour as-is).
- "Continue editing after create" CTA on the success page.

---

## File-touch summary

| File | Action | Estimated size |
|---|---|---|
| `app/(routes)/learners/profiles/page.tsx` | Modify (add Create Learner button) | +~10 lines |
| `app/(routes)/learners/profiles/create/page.tsx` | New | ~40 lines |
| `app/(routes)/learners/profiles/create/_components/learner-create-form.tsx` | New | ~150 lines |
| `lib/validations/learner-create-schema.ts` | New | ~80 lines |
| `app/(routes)/learners/enquiries/_components/enquiry-form.tsx` | (Possibly) export `formatFormDataForAPI` | +~1 line (export) — TBD during planning |

Total estimated diff: ~280 lines added, 1 line modified. No deletions. No DB migrations.
