# Learner Create Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-record "Create Learner" form page at `/learners/profiles/create` that reuses the existing `EnquiryForm` and creates active onboarded learners with the same required-field set as bulk upload.

**Architecture:** A thin wrapper component renders `EnquiryForm` with its existing extension props (`visibleTabs`, `hideDraft`, `onSubmit`, `submitLabel`). A strict Zod schema (`createLearnerSchema`) enforces all 28 bulk-upload required fields. When the wrapper provides `onSubmit`, `EnquiryForm`'s `commitSubmit` early-returns after `formatFormDataForAPI` — so the wrapper receives the DB-ready payload, runs strict validation, calls `LearnerProfileService.createLearnerProfile`, and navigates. Zero changes to `EnquiryForm`. No DB migrations.

**Tech Stack:** Next.js 16 App Router, TypeScript, React Query, Zod, `react-hook-form`, Tailwind, Vitest (or Jest — verified in Task 1), Supabase (RLS-gated), `LearnerProfileService`, `useCreateLearnerProfile()`.

**Spec:** `docs/superpowers/specs/2026-05-22-learners-create-form-design.md`

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `lib/validations/learner-create-schema.ts` | Create | Strict Zod schema mirroring bulk-upload required fields + DB-NOT-NULL defaults |
| `lib/validations/__tests__/learner-create-schema.test.ts` | Create | Unit tests for the strict schema |
| `app/(routes)/learners/profiles/create/page.tsx` | Create | Route shell — `ContentLayout`, breadcrumb, header, mounts wrapper |
| `app/(routes)/learners/profiles/create/_components/learner-create-form.tsx` | Create | Wrapper component — calls service, handles strict validation, navigation |
| `app/(routes)/learners/profiles/page.tsx` | Modify | Add "Create Learner" button next to existing `<BulkUploadProfilesDialogEnhanced/>` |

Total: 4 new files, 1 modified file, ~280 lines added.

---

## Task 1: Pre-flight verification

Confirms three things in-code (no edits): the test runner, the permission key, and the form's tab IDs. Reads only — no risk of breaking anything.

**Files:**
- Read: `package.json`
- Read: `lib/constants/permissions.ts`
- Read: `app/(routes)/learners/enquiries/_components/enquiry-form.tsx` (search for `ALL_TABS`)

- [ ] **Step 1.1: Identify the test runner**

Run:
```bash
grep -E '"(test|vitest|jest)"' package.json | head -5
```

Expected: one of two outcomes —
- `"vitest": "..."` in devDependencies → **use Vitest commands** in later tasks (`npx vitest run ...`)
- `"jest": "..."` in devDependencies → **use Jest commands** (`npx jest ...`)

Record the choice. All later `Run:` blocks for tests assume **Vitest**; substitute `npx jest <path>` if Jest.

- [ ] **Step 1.2: Verify `learners.create` permission key exists**

Run:
```bash
grep -n "learners.create" lib/constants/permissions.ts
```

Expected: at least one match showing `'learners.create'` is declared.

If zero matches → **STOP. Add the key first** as a separate one-line change:
```ts
// in lib/constants/permissions.ts, in the learners-module key block
'learners.create',
```
…and grant it to operational roles (admission, admission_staff, administrator) via a Supabase migration touching `custom_roles.permissions`. (Outside this plan's scope — flag it and ask the user.)

- [ ] **Step 1.3: Capture exact tab IDs from `ALL_TABS`**

Run:
```bash
grep -n "ALL_TABS\s*=\|id:\s*'basic" app/\(routes\)/learners/enquiries/_components/enquiry-form.tsx | head -20
```

Expected: the `ALL_TABS` constant or its inline entries. Capture the exact string for each tab ID (e.g. `'basic-details'`, `'academic-information'`, `'course-selection'`, `'contact-details'`, `'accommodation-preferences'`, `'finance-details'`).

**Why this matters:** `visibleTabs` is matched by exact string ID against `ALL_TABS` (`enquiry-form.tsx:663-665`). A typo in our tab IDs silently hides every tab and renders an empty form. Record the exact 5 tab IDs we want visible (everything except `'finance-details'`) — they go into Task 3's wrapper component verbatim.

- [ ] **Step 1.4: Verify the form's early-return contract for custom `onSubmit`**

Run:
```bash
grep -n "onSubmitProp\|onSubmit: onSubmitProp" app/\(routes\)/learners/enquiries/_components/enquiry-form.tsx | head -10
```

Expected: lines around 572 (prop destructured), 1363-1368 (`if (onSubmitProp) { await onSubmitProp(data); ...; return; }`).

Confirms: when we pass `onSubmit`, the form passes `data` (already through `formatFormDataForAPI`) and returns early — we control persistence + navigation entirely.

- [ ] **Step 1.5: Commit nothing — verification only**

This task produces no code changes. Move to Task 2.

---

## Task 2: Strict Zod schema (TDD)

Build `createLearnerSchema` test-first.

**Files:**
- Create: `lib/validations/__tests__/learner-create-schema.test.ts`
- Create: `lib/validations/learner-create-schema.ts`

- [ ] **Step 2.1: Write the failing test file**

Create `lib/validations/__tests__/learner-create-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createLearnerSchema, createLearnerWithDefaults } from '../learner-create-schema';

const validInput = {
  first_name: 'AARTHI',
  last_name: 'KUMAR',
  date_of_birth: '2004-08-15',
  gender: 'FEMALE',
  religion: 'HINDU',
  community: 'BC',
  caste: 'VANNIYAR',
  father_name: 'KUMAR R',
  father_mobile: '9876543210',
  mother_name: 'LAKSHMI K',
  mother_mobile: '9876543211',
  institution_id: '00000000-0000-0000-0000-000000000001',
  degree_id: '00000000-0000-0000-0000-000000000002',
  department_id: '00000000-0000-0000-0000-000000000003',
  program_id: '00000000-0000-0000-0000-000000000004',
  semester_id: '00000000-0000-0000-0000-000000000005',
  section_id: '00000000-0000-0000-0000-000000000006',
  academic_year_id: '00000000-0000-0000-0000-000000000007',
  student_mobile: '9876543212',
  college_email: 'aarthi.k@jkkn.ac.in',
  permanent_address_street: '12 GANDHI ST',
  permanent_address_taluk: 'KOMARAPALAYAM',
  permanent_address_district: 'NAMAKKAL',
  permanent_address_pin_code: '637303',
  permanent_address_state: 'TAMIL NADU',
  entry_type: 'FIRST YEAR',
  scholarship_type: 'NOT APPLICABLE',
  accommodation_type: 'DAY SCHOLAR',
};

describe('createLearnerSchema', () => {
  it('accepts a fully-valid 28-required-field payload', () => {
    const result = createLearnerSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('rejects when first_name is missing', () => {
    const { first_name: _drop, ...rest } = validInput;
    const result = createLearnerSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'first_name')).toBe(true);
    }
  });

  it('rejects college_email not ending with @jkkn.ac.in', () => {
    const result = createLearnerSchema.safeParse({
      ...validInput,
      college_email: 'aarthi@gmail.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects mobile fields with non-10-digit values', () => {
    const result = createLearnerSchema.safeParse({
      ...validInput,
      student_mobile: '12345',
    });
    expect(result.success).toBe(false);
  });

  it('rejects 5-digit pin code', () => {
    const result = createLearnerSchema.safeParse({
      ...validInput,
      permanent_address_pin_code: '63730',
    });
    expect(result.success).toBe(false);
  });

  it('rejects FK fields that are not valid UUIDs', () => {
    const result = createLearnerSchema.safeParse({
      ...validInput,
      institution_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects accommodation_type=HOSTEL without hostel_type', () => {
    const result = createLearnerSchema.safeParse({
      ...validInput,
      accommodation_type: 'HOSTEL',
      // hostel_type intentionally missing
      // food_type intentionally missing
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.flatMap((i) => i.path);
      expect(paths).toContain('hostel_type');
    }
  });

  it('accepts accommodation_type=HOSTEL when hostel_type + food_type are present', () => {
    const result = createLearnerSchema.safeParse({
      ...validInput,
      accommodation_type: 'HOSTEL',
      hostel_type: 'AC HOSTEL',
      food_type: 'VEG',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional fields (e.g. blood_group, neet_score) when present', () => {
    const result = createLearnerSchema.safeParse({
      ...validInput,
      blood_group: 'O+',
      neet_score: '650',
    });
    expect(result.success).toBe(true);
  });

  it('createLearnerWithDefaults backfills last_school + board_of_study to empty strings when absent', () => {
    const out = createLearnerWithDefaults(validInput);
    expect(out.last_school).toBe('');
    expect(out.board_of_study).toBe('');
  });
});
```

- [ ] **Step 2.2: Run the tests — verify they fail (module does not exist)**

Run:
```bash
npx vitest run lib/validations/__tests__/learner-create-schema.test.ts
```

Expected: 10 failures (cannot resolve `../learner-create-schema`).

- [ ] **Step 2.3: Implement `createLearnerSchema`**

Create `lib/validations/learner-create-schema.ts`:

```ts
// ============================================
// CREATE LEARNER FORM — STRICT VALIDATION SCHEMA
// ============================================
// Created: 2026-05-22
// Purpose: Mirror bulk-upload's required-field set for the
// /learners/profiles/create flow. Used by LearnerCreateForm
// AFTER EnquiryForm's formatFormDataForAPI has run, so values
// are already UPPERCASE / location-name-normalised.
// Spec: docs/superpowers/specs/2026-05-22-learners-create-form-design.md
// ============================================

import { z } from 'zod';
import {
  GENDER_VALUES,
  RELIGION_VALUES,
  COMMUNITY_VALUES,
  BLOOD_GROUP_VALUES,
  ENTRY_TYPE_VALUES,
  ACCOMMODATION_VALUES,
  HOSTEL_TYPE_VALUES,
  FOOD_TYPE_VALUES,
  QUOTA_VALUES,
  SCHOLARSHIP_TYPE_VALUES,
} from '@/lib/constants/learner-dropdown-values';

// Tuple-cast helpers for z.enum — the constants are readonly string arrays.
const asTuple = <T extends string>(arr: readonly T[]) =>
  arr as unknown as [T, ...T[]];

const MOBILE_RE = /^[0-9]{10}$/;
const PIN_RE = /^[0-9]{6}$/;
const JKKN_EMAIL_RE = /@jkkn\.ac\.in$/i;

export const createLearnerSchema = z
  .object({
    // ---- Required: Basic Details (7 fields)
    first_name: z.string().trim().min(2, 'First name must be at least 2 characters'),
    last_name: z.string().trim().min(1, 'Last name is required'),
    date_of_birth: z.string().min(1, 'Date of birth is required'),
    gender: z.enum(asTuple(GENDER_VALUES), {
      errorMap: () => ({ message: 'Select a valid gender' }),
    }),
    religion: z.enum(asTuple(RELIGION_VALUES), {
      errorMap: () => ({ message: 'Select a valid religion' }),
    }),
    community: z.enum(asTuple(COMMUNITY_VALUES), {
      errorMap: () => ({ message: 'Select a valid community' }),
    }),
    caste: z.string().trim().min(1, 'Caste is required'),

    // ---- Required: Parent / Guardian (4 fields)
    father_name: z.string().trim().min(1, 'Father name is required'),
    father_mobile: z.string().regex(MOBILE_RE, 'Father mobile must be 10 digits'),
    mother_name: z.string().trim().min(1, 'Mother name is required'),
    mother_mobile: z.string().regex(MOBILE_RE, 'Mother mobile must be 10 digits'),

    // ---- Required: Course Selection / Academic FKs (7 fields)
    institution_id: z.string().uuid('Institution is required'),
    degree_id: z.string().uuid('Degree is required'),
    department_id: z.string().uuid('Department is required'),
    program_id: z.string().uuid('Program is required'),
    semester_id: z.string().uuid('Semester is required'),
    section_id: z.string().uuid('Section is required'),
    academic_year_id: z.string().uuid('Academic year is required'),

    // ---- Required: Contact (2 fields)
    student_mobile: z.string().regex(MOBILE_RE, 'Student mobile must be 10 digits'),
    college_email: z
      .string()
      .email('Enter a valid email')
      .regex(JKKN_EMAIL_RE, 'College email must end with @jkkn.ac.in'),

    // ---- Required: Address (5 fields)
    permanent_address_street: z.string().trim().min(1, 'Street is required'),
    permanent_address_taluk: z.string().trim().min(1, 'Taluk is required'),
    permanent_address_district: z.string().trim().min(1, 'District is required'),
    permanent_address_pin_code: z.string().regex(PIN_RE, 'Pin code must be 6 digits'),
    permanent_address_state: z.string().trim().min(1, 'State is required'),

    // ---- Required: Entry / Scholarship / Accommodation (3 fields)
    entry_type: z.enum(asTuple(ENTRY_TYPE_VALUES), {
      errorMap: () => ({ message: 'Select a valid entry type' }),
    }),
    scholarship_type: z.enum(asTuple(SCHOLARSHIP_TYPE_VALUES), {
      errorMap: () => ({ message: 'Select a valid scholarship type' }),
    }),
    accommodation_type: z.enum(asTuple(ACCOMMODATION_VALUES), {
      errorMap: () => ({ message: 'Select a valid accommodation type' }),
    }),

    // ---- Optional: 35 bulk-upload optional fields (passthrough)
    aadhar_number: z.string().optional(),
    blood_group: z.enum(asTuple(BLOOD_GROUP_VALUES)).optional(),
    admission_year: z.string().optional(),
    father_occupation: z.string().optional(),
    mother_occupation: z.string().optional(),
    annual_income: z.union([z.string(), z.number()]).optional(),
    regulation_id: z.string().uuid().optional(),
    batch_id: z.string().uuid().optional(),
    admission_year_id: z.string().uuid().optional(),
    student_email: z.string().email().optional().or(z.literal('')),
    hostel_type: z.enum(asTuple(HOSTEL_TYPE_VALUES)).optional(),
    food_type: z.enum(asTuple(FOOD_TYPE_VALUES)).optional(),
    last_school: z.string().optional(),
    board_of_study: z.string().optional(),
    tenth_max_marks: z.union([z.string(), z.number()]).optional(),
    tenth_obtained_marks: z.union([z.string(), z.number()]).optional(),
    tenth_percentage: z.union([z.string(), z.number()]).optional(),
    twelfth_group: z.string().optional(),
    twelfth_max_marks: z.union([z.string(), z.number()]).optional(),
    twelfth_obtained_marks: z.union([z.string(), z.number()]).optional(),
    twelfth_percentage: z.union([z.string(), z.number()]).optional(),
    medical_cutoff_marks: z.string().optional(),
    engineering_cutoff_marks: z.string().optional(),
    neet_roll_number: z.string().optional(),
    neet_score: z.string().optional(),
    counseling_applied: z.union([z.boolean(), z.string()]).optional(),
    counseling_number: z.string().optional(),
    quota: z.enum(asTuple(QUOTA_VALUES)).optional(),
    category: z.string().optional(),
    reference_type: z.string().optional(),
    reference_name: z.string().optional(),
    reference_contact: z.string().optional(),
    roll_number: z.string().optional(),
    register_number: z.string().optional(),
    student_photo_url: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Conditional: HOSTEL accommodation requires hostel_type + food_type
    if (data.accommodation_type === 'HOSTEL') {
      if (!data.hostel_type) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['hostel_type'],
          message: 'Hostel type is required when accommodation is HOSTEL',
        });
      }
      if (!data.food_type) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['food_type'],
          message: 'Food type is required when accommodation is HOSTEL',
        });
      }
    }
  });

export type CreateLearnerInput = z.infer<typeof createLearnerSchema>;

/**
 * Backfills the two DB-NOT-NULL columns that bulk upload treats as OPTIONAL
 * by submitting empty strings (per feedback_learners_profiles_community_not_null.md).
 * Call this AFTER createLearnerSchema.parse() and before handing to the service.
 */
export function createLearnerWithDefaults(
  parsed: CreateLearnerInput,
): CreateLearnerInput & { last_school: string; board_of_study: string } {
  return {
    ...parsed,
    last_school: parsed.last_school ?? '',
    board_of_study: parsed.board_of_study ?? '',
  };
}
```

- [ ] **Step 2.4: Run the tests — verify they pass**

Run:
```bash
npx vitest run lib/validations/__tests__/learner-create-schema.test.ts
```

Expected: `10 passed`.

If any test fails: read the failure, fix the schema (not the test — the test expresses the spec), re-run.

- [ ] **Step 2.5: Type-check the new module**

Run:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "lib/validations/learner-create-schema|lib/validations/__tests__/learner-create-schema" | head -20
```

Expected: no output (no TS errors in our new files). Existing project-wide TS errors unrelated to our files can be ignored at this point.

- [ ] **Step 2.6: Commit**

```bash
git add lib/validations/learner-create-schema.ts lib/validations/__tests__/learner-create-schema.test.ts
git commit -m "feat(learners/create-form): add strict Zod schema mirroring bulk upload

Enforces all 28 bulk-upload required fields, plus the
HOSTEL-requires-hostel_type/food_type conditional rule. Optional
fields pass through unchanged. createLearnerWithDefaults() backfills
last_school + board_of_study with '' (NOT NULL columns that bulk
upload treats as optional).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wrapper component — `LearnerCreateForm`

Implements `handleStrictSubmit`, calls the service, navigates on success. Renders `EnquiryForm` with create-tuned props.

**Files:**
- Create: `app/(routes)/learners/profiles/create/_components/learner-create-form.tsx`

- [ ] **Step 3.1: Create the wrapper component**

Create `app/(routes)/learners/profiles/create/_components/learner-create-form.tsx`:

```tsx
'use client';

// ============================================
// LEARNER CREATE FORM — WRAPPER COMPONENT
// ============================================
// Created: 2026-05-22
// Purpose: Wraps EnquiryForm for single-record learner creation
// flow at /learners/profiles/create. Provides strict validation
// (createLearnerSchema), custom submit handler, and post-create
// navigation to /learners/profiles/{id}.
// Spec: docs/superpowers/specs/2026-05-22-learners-create-form-design.md
// ============================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { EnquiryForm } from '../../../enquiries/_components/enquiry-form';
import { useCreateLearnerProfile } from '@/hooks/use-learner-profiles';
import {
  createLearnerSchema,
  createLearnerWithDefaults,
} from '@/lib/validations/learner-create-schema';
import { getErrorMessage } from '@/lib/utils';
import type { CreateLearnerProfileDto } from '@/types/learner-profile';

// EnquiryForm tab IDs — exact strings from ALL_TABS (verified in Task 1.3).
// Update these if Task 1.3 reveals different IDs.
const VISIBLE_TABS = [
  'basic-details',
  'academic-information',
  'course-selection',
  'contact-details',
  'accommodation-preferences',
] as const;

export function LearnerCreateForm() {
  const router = useRouter();
  const createMutation = useCreateLearnerProfile();
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Called by EnquiryForm.commitSubmit with the DB-ready payload
   * (after formatFormDataForAPI). The form early-returns after this
   * resolves, so we own:
   *  1. strict 28-field validation
   *  2. service call (createLearnerProfile)
   *  3. success/error toasts
   *  4. navigation
   */
  const handleStrictSubmit = async (data: Record<string, unknown>) => {
    if (isSubmitting || createMutation.isPending) return; // double-submit guard

    const parsed = createLearnerSchema.safeParse(data);
    if (!parsed.success) {
      const fieldErrors = parsed.error.issues
        .map((i) => `${i.path.join('.') || '(form)'}: ${i.message}`)
        .slice(0, 6); // cap to keep toast readable
      const more =
        parsed.error.issues.length > 6
          ? ` (+${parsed.error.issues.length - 6} more)`
          : '';
      toast.error(
        `Please fill all required fields:\n${fieldErrors.join('\n')}${more}`,
        { duration: 7000 },
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = createLearnerWithDefaults(parsed.data);

      const created = await createMutation.mutateAsync(
        // CreateLearnerProfileDto is structurally compatible — payload has
        // a strict subset of the DTO fields. Cast avoids surfacing every
        // DTO-internal optional field from learner-profile.ts here.
        payload as unknown as CreateLearnerProfileDto,
      );

      toast.success(
        created.is_profile_complete
          ? 'Learner created and activated.'
          : 'Learner created.',
      );
      router.push(`/learners/profiles/${created.id}`);
    } catch (err) {
      toast.error(`Could not create learner: ${getErrorMessage(err)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="p-6">
      <EnquiryForm
        // `learner` undefined → create mode in the shared form
        learner={undefined}
        // 5 tabs only; Finance hidden (matches bulk upload coverage)
        visibleTabs={[...VISIBLE_TABS]}
        // Suppress "Save Draft" — create flow is strict, single-shot
        hideDraft={true}
        submitLabel="Create Learner"
        // Custom submit — form's commitSubmit early-returns after this
        onSubmit={handleStrictSubmit}
        // onSuccess is intentionally NOT passed: when onSubmit is set,
        // EnquiryForm.commitSubmit returns early and never invokes onSuccess.
        // We handle navigation inside handleStrictSubmit above.
      />
    </Card>
  );
}
```

- [ ] **Step 3.2: Type-check the wrapper**

Run:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "learners/profiles/create" | head -20
```

Expected: no output (no TS errors in the new file).

If errors mention `CreateLearnerProfileDto` field mismatches: open `types/learner-profile.ts`, find `CreateLearnerProfileDto`, confirm all our required field names match it (`institution_id`, `program_id`, etc. — they should, since the bulk-upload service uses the same DTO).

If errors mention `getErrorMessage` not found: confirm `lib/utils.ts` exports it (it does per `feedback_supabase_plain_error_not_error_instance.md`); otherwise replace with `String(err)` as a fallback.

- [ ] **Step 3.3: Commit**

```bash
git add app/\(routes\)/learners/profiles/create/_components/learner-create-form.tsx
git commit -m "feat(learners/create-form): add wrapper component over EnquiryForm

Renders EnquiryForm with 5 visible tabs (Finance hidden), hideDraft,
custom strict-submit handler, and navigation to /learners/profiles/{id}
on success. Service call goes through useCreateLearnerProfile().

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Create-page route

The Next.js App Router page that mounts the wrapper, with breadcrumb and header.

**Files:**
- Create: `app/(routes)/learners/profiles/create/page.tsx`

- [ ] **Step 4.1: Create the page**

Create `app/(routes)/learners/profiles/create/page.tsx`:

```tsx
'use client';

// ============================================
// LEARNER CREATE PAGE
// ============================================
// Created: 2026-05-22
// Purpose: Manual single-record learner creation. Mirrors the
// /learners/profiles/[id]/edit pattern: header, breadcrumb,
// then a form component. Permission gating is enforced by RLS
// at the service layer (same as the existing edit page).
// Spec: docs/superpowers/specs/2026-05-22-learners-create-form-design.md
// ============================================

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { LearnerCreateForm } from './_components/learner-create-form';

export default function LearnerCreatePage() {
  return (
    <ContentLayout title="Create Learner">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners', href: '/learners' },
          { label: 'Profiles', href: '/learners/profiles' },
          { label: 'Create' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Create Learner Profile</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Enter learner details below. Required fields mirror the bulk-upload
            template; on successful save the learner is activated and visible
            on{' '}
            <Link
              href="/learners/profiles"
              className="underline underline-offset-2"
            >
              Learners Management
            </Link>
            .
          </p>
        </div>

        <LearnerCreateForm />
      </div>
    </ContentLayout>
  );
}
```

- [ ] **Step 4.2: Type-check**

Run:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "profiles/create/page" | head -10
```

Expected: no output.

- [ ] **Step 4.3: Commit**

```bash
git add app/\(routes\)/learners/profiles/create/page.tsx
git commit -m "feat(learners/create-form): add /learners/profiles/create route

Page shell mounts LearnerCreateForm. Permission gating relies on
RLS at the service layer (same pattern as the existing edit page).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: "Create Learner" button on Learners Management

Adds the entry-point button next to the existing Bulk Upload button, hidden for student users.

**Files:**
- Modify: `app/(routes)/learners/profiles/page.tsx`

- [ ] **Step 5.1: Modify `page.tsx` — add the button**

The existing action-button block (line 207-221, inside `{!isStudent && (...)}`) currently renders:

```tsx
<div className="flex flex-wrap gap-2">
  <CreateMissingProfilesButton />
  <BulkUploadProfilesDialogEnhanced />
  <BulkUploadLearnerImages institutionId={params.institution_id as string | undefined} />
  <BulkEditActiveDialog />

  <Button variant="outline" asChild>
    <Link href="/learners/profiles/promotion">
      <Upload className="mr-2 h-4 w-4" />
      Student Promotion
    </Link>
  </Button>
</div>
```

Edit `app/(routes)/learners/profiles/page.tsx` and replace it with:

```tsx
<div className="flex flex-wrap gap-2">
  <Button asChild>
    <Link href="/learners/profiles/create">
      <Plus className="mr-2 h-4 w-4" />
      Create Learner
    </Link>
  </Button>
  <CreateMissingProfilesButton />
  <BulkUploadProfilesDialogEnhanced />
  <BulkUploadLearnerImages institutionId={params.institution_id as string | undefined} />
  <BulkEditActiveDialog />

  <Button variant="outline" asChild>
    <Link href="/learners/profiles/promotion">
      <Upload className="mr-2 h-4 w-4" />
      Student Promotion
    </Link>
  </Button>
</div>
```

The `Plus` icon is already imported at line 14: `import { Plus, Upload } from 'lucide-react';` — no new import needed.

The button uses the default variant (primary CTA styling) to distinguish it from the outline-style bulk upload buttons.

- [ ] **Step 5.2: Type-check**

Run:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "learners/profiles/page" | head -10
```

Expected: no output.

- [ ] **Step 5.3: Commit**

```bash
git add app/\(routes\)/learners/profiles/page.tsx
git commit -m "feat(learners/profiles): add Create Learner button on management page

Primary CTA next to existing Bulk Upload buttons. Hidden for
students via the existing !isStudent gate. Routes to
/learners/profiles/create.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Manual smoke test in dev

End-to-end verification that the feature works in a real browser against real Supabase. Cannot be automated within this plan — relies on you running the dev server and using the UI.

**Files:** none modified.

- [ ] **Step 6.1: Start the dev server**

Run (in a separate terminal so you can keep working):
```bash
npx next dev --turbopack
```

Expected: `Ready in <2s` (per `feedback_dev_server_must_use_turbopack_and_skip_sentry.md`). Note the URL (usually `http://localhost:3000`).

- [ ] **Step 6.2: Open the Learners Management page**

Navigate to `http://localhost:3000/learners/profiles`.

Expected:
- Page renders with the data table.
- New "Create Learner" button visible at the top of the action-button row.
- Button has the Plus icon and primary styling.

If the button is missing: confirm you're logged in as a non-student user (the whole action block is gated by `!isStudent`).

- [ ] **Step 6.3: Click "Create Learner" and verify routing**

Click the button.

Expected:
- URL changes to `/learners/profiles/create`.
- Header reads "Create Learner Profile".
- Breadcrumb shows Home › Learners › Profiles › Create.
- Form renders with 5 tabs: Basic Details, Academic Info, Course Selection, Contact Details, Accommodation.
- **No Finance tab.**
- Submit button reads "Create Learner".
- **No "Save Draft" button.**

- [ ] **Step 6.4: Submit an empty form — verify strict-validation toast**

Without filling anything, click "Create Learner".

Expected: toast appears with grouped error lines (e.g. "first_name: First name must be at least 2 characters", etc.). No navigation happens. No DB row created.

- [ ] **Step 6.5: Fill the form with a complete dataset and submit**

Fill all 5 tabs with a test record:
- Basic Details: first_name=TEST, last_name=USER, date_of_birth=2004-01-01, gender=FEMALE, religion=HINDU, community=BC, caste=TEST CASTE, father_name=TEST FATHER, father_mobile=9876543210, mother_name=TEST MOTHER, mother_mobile=9876543211
- Course Selection: pick valid institution / degree / department / program / semester / section / academic year from the dropdowns
- Contact: student_mobile=9876543212, college_email=test.create@jkkn.ac.in (use a unique address)
- Accommodation: street=12 TEST ST, taluk=TEST TALUK, district=NAMAKKAL, pincode=637303, state=TAMIL NADU
- Entry: FIRST YEAR, scholarship=NOT APPLICABLE, accommodation=DAY SCHOLAR

Click "Create Learner".

Expected:
- Brief loading state on the button.
- Success toast: "Learner created and activated." (because all 4 onboarding fields are present → service auto-activates).
- URL changes to `/learners/profiles/{new-uuid}`.
- Profile detail page renders the new learner.

- [ ] **Step 6.6: Verify in Supabase**

In Supabase Studio (or via `mcp__supabase__execute_sql`):

```sql
select id, first_name, last_name, college_email, lifecycle_status,
       is_profile_complete, institution_id, program_id, created_by, created_at
from learners_profiles
where college_email = 'test.create@jkkn.ac.in'
order by created_at desc
limit 1;
```

Expected:
- One row.
- `lifecycle_status` = `'active'`.
- `is_profile_complete` = `true`.
- `created_by` matches your logged-in user id.

Also confirm a `profiles` row was created:

```sql
select id, role, learner_id, is_active
from profiles
where id in (select id from auth.users where email = 'test.create@jkkn.ac.in');
```

Expected: one row with `role='student'`, `learner_id` matching the learner above, `is_active=true`.

- [ ] **Step 6.7: Verify the new learner appears on the Active tab of Learners Management**

Navigate back to `/learners/profiles`. The new learner should appear in the Active list (search by college email if needed).

- [ ] **Step 6.8: Duplicate-email test**

Click "Create Learner" again. Fill identical values (same `college_email` as Step 6.5). Submit.

Expected: error toast surfacing the duplicate-email constraint violation. No new row. No navigation.

- [ ] **Step 6.9: HOSTEL conditional rule test**

Click "Create Learner". Fill all required fields BUT set `accommodation_type = HOSTEL` and leave `hostel_type` empty. Submit.

Expected: validation toast naming `hostel_type` and `food_type` as missing.

Fill `hostel_type=AC HOSTEL` and `food_type=VEG` and resubmit — should succeed (with a different unique college email).

- [ ] **Step 6.10: Clean up test rows**

Delete the test learners created in Steps 6.5 and 6.9 from Supabase Studio:

```sql
delete from learners_profiles
where college_email in ('test.create@jkkn.ac.in', '<email from step 6.9>');
```

Be careful with the WHERE clause — never delete production rows.

---

## Task 7: Final feature commit (if anything left uncommitted)

After all per-task commits, this is a safety net.

**Files:** none expected.

- [ ] **Step 7.1: Verify working tree is clean**

Run:
```bash
git status --short
```

Expected: empty output (everything committed).

If anything is uncommitted: review with `git diff`, then commit it under the same feature scope.

- [ ] **Step 7.2: Verify commit log**

Run:
```bash
git log --oneline -10
```

Expected (in reverse chronological order): your Task 5 commit, Task 4 commit, Task 3 commit, Task 2 commit, the spec commit from earlier (`6e4015093`).

- [ ] **Step 7.3: (Optional) Push to remote**

Ask the user before pushing — pushing to a shared branch is hard to reverse. If they approve:

```bash
git push
```

Otherwise, leave it local until they push themselves.

---

## Self-Review Checklist

**1. Spec coverage:**
- Strict 28-required-field validation → Task 2 ✓
- Hide Finance section → Task 3 (`VISIBLE_TABS` omits `'finance-details'`) ✓
- Wrapper component using existing extension points → Task 3 ✓
- Route `/learners/profiles/create` → Task 4 ✓
- Entry button on Learners Management → Task 5 ✓
- Navigate to `/learners/profiles/{id}` post-create → Task 3 (`router.push` inside `handleStrictSubmit`) ✓
- HOSTEL conditional → Task 2 (`superRefine`) + Task 6.9 (smoke test) ✓
- `last_school`/`board_of_study` `''` default → Task 2 (`createLearnerWithDefaults`) ✓
- Double-submit guard → Task 3 (early-return + `isSubmitting`/`isPending` checks) ✓
- Duplicate-email surface via `getErrorMessage` → Task 3 (catch block) + Task 6.8 ✓
- Lifecycle auto-activation → Task 6.6 (verification step) ✓
- `learners.create` permission key audit → Task 1.2 ✓

**Gap:** Spec mentioned a `<PermissionGuard>` wrap, but the existing edit page does NOT use one (it relies on RLS at the service layer). For consistency with the edit page pattern, the plan does NOT wrap the create page in `<PermissionGuard>` — the same RLS-at-service enforcement applies. The button on the management page is gated by `!isStudent` (same as bulk upload), so non-students see it; non-admission roles get an RLS denial toast on submit. If you want explicit page-level gating, add a `<PermissionGuard permission="learners.create">` in Task 4 wrapping the form section — but it's a deliberate deviation from the existing edit-page pattern.

**2. Placeholder scan:** No "TBD", "TODO", "fill in details", or "similar to Task N" patterns found. Step 6.5 says "<email from step 6.9>" — that's a literal value the executor fills at the moment, not a plan placeholder.

**3. Type consistency:**
- `createLearnerSchema` exports both the schema and `createLearnerWithDefaults` ✓ — Task 3 imports both ✓
- `useCreateLearnerProfile().mutateAsync` accepts `CreateLearnerProfileDto` (confirmed at `hooks/use-learner-profiles.ts:128`) ✓ — Task 3 casts the payload to it ✓
- Tab IDs in Task 3 (`VISIBLE_TABS`) MUST match Task 1.3 findings — if Task 1.3 reveals different IDs, Task 3 must be revised before running.

---

## Execution Choice

After this plan is approved, two execution paths are available:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration. Best when you want to keep your context window clean and verify each step independently.

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review. Best when you want to keep going in this thread.
