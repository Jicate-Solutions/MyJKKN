# Learner Finance Section — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a permission-gated "Finance Details" tab (Tab 6) to the learner enquiry form with fee fields, conditional UI based on fee structure type, and role-based access control.

**Architecture:** New columns on `learners_profiles` table for 9 fee fields. A new `FinanceDetailsSection` form component conditionally rendered based on `learners.finance.view/edit` permissions. Detail views get a new "Finance" sidebar section. The `usePermissions()` hook's existing `canAccess(module, action)` pattern handles permission checks — format: `canAccess('learners', 'finance.view')`.

**Tech Stack:** Next.js App Router, React Hook Form + Zod, Supabase (PostgreSQL), shadcn/ui components, TypeScript

---

### Task 1: Database Migration — Add Fee Columns

**Files:**
- Create: `supabase/migrations/20260304_add_learner_finance_fields.sql`
- Modify: `supabase/setup/01_tables.sql` (after line ~423, before closing of learners_profiles section)

**Step 1: Create migration file**

```sql
-- Migration: Add finance/fee fields to learners_profiles
-- Date: 2026-03-04
-- Purpose: Store per-student fee structure data for admission finance tracking

-- Add fee columns to learners_profiles
ALTER TABLE public.learners_profiles
  ADD COLUMN IF NOT EXISTS application_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS university_reg_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fee_structure_type TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tuition_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hostel_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS dayscholar_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS uniform_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hospital_training_fee NUMERIC(15,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS placement_fee NUMERIC(15,2) DEFAULT NULL;

-- Add check constraint for fee_structure_type
ALTER TABLE public.learners_profiles
  ADD CONSTRAINT chk_fee_structure_type
  CHECK (fee_structure_type IS NULL OR fee_structure_type IN ('tuition_hostel', 'dayscholar'));

-- Add check constraints for non-negative fees
ALTER TABLE public.learners_profiles
  ADD CONSTRAINT chk_application_fee_positive CHECK (application_fee IS NULL OR application_fee >= 0),
  ADD CONSTRAINT chk_university_reg_fee_positive CHECK (university_reg_fee IS NULL OR university_reg_fee >= 0),
  ADD CONSTRAINT chk_tuition_fee_positive CHECK (tuition_fee IS NULL OR tuition_fee >= 0),
  ADD CONSTRAINT chk_hostel_fee_positive CHECK (hostel_fee IS NULL OR hostel_fee >= 0),
  ADD CONSTRAINT chk_dayscholar_fee_positive CHECK (dayscholar_fee IS NULL OR dayscholar_fee >= 0),
  ADD CONSTRAINT chk_uniform_fee_positive CHECK (uniform_fee IS NULL OR uniform_fee >= 0),
  ADD CONSTRAINT chk_hospital_training_fee_positive CHECK (hospital_training_fee IS NULL OR hospital_training_fee >= 0),
  ADD CONSTRAINT chk_placement_fee_positive CHECK (placement_fee IS NULL OR placement_fee >= 0);

-- Comment for documentation
COMMENT ON COLUMN public.learners_profiles.fee_structure_type IS 'tuition_hostel = separate tuition + hostel; dayscholar = combined dayscholar fee';
```

**Step 2: Update setup file**

Add the following columns to the `learners_profiles` table definition in `supabase/setup/01_tables.sql`, in a new comment block after the `-- Campus Life` section (around line 410) and before `-- Academic Assignment`:

```sql
    -- Finance/Fee Details (Added: 2026-03-04)
    application_fee NUMERIC(15,2) DEFAULT NULL,
    university_reg_fee NUMERIC(15,2) DEFAULT NULL,
    fee_structure_type TEXT DEFAULT NULL CHECK (fee_structure_type IN ('tuition_hostel', 'dayscholar')),
    tuition_fee NUMERIC(15,2) DEFAULT NULL,
    hostel_fee NUMERIC(15,2) DEFAULT NULL,
    dayscholar_fee NUMERIC(15,2) DEFAULT NULL,
    uniform_fee NUMERIC(15,2) DEFAULT NULL,
    hospital_training_fee NUMERIC(15,2) DEFAULT NULL,
    placement_fee NUMERIC(15,2) DEFAULT NULL,
```

**Step 3: Run migration in Supabase Dashboard SQL Editor**

Copy the migration SQL and execute it in the Supabase SQL Editor to apply the changes.

**Step 4: Verify columns exist**

Run: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'learners_profiles' AND column_name LIKE '%fee%' OR column_name = 'fee_structure_type';`

Expected: 9 rows showing the new columns.

**Step 5: Commit**

```bash
git add supabase/migrations/20260304_add_learner_finance_fields.sql supabase/setup/01_tables.sql
git commit -m "feat(learners): add finance/fee columns to learners_profiles table"
```

---

### Task 2: TypeScript Types — Extend LearnerProfile Interface

**Files:**
- Modify: `types/learner-profile.ts`

**Step 1: Add fee fields to `LearnerProfile` interface**

In `types/learner-profile.ts`, add after line 125 (after `reference_contact`) and before line 127 (`// Academic Assignment`):

```typescript
  // Finance/Fee Details (Added: 2026-03-04)
  application_fee?: number | null;
  university_reg_fee?: number | null;
  fee_structure_type?: 'tuition_hostel' | 'dayscholar' | null;
  tuition_fee?: number | null;
  hostel_fee?: number | null;
  dayscholar_fee?: number | null;
  uniform_fee?: number | null;
  hospital_training_fee?: number | null;
  placement_fee?: number | null;
```

**Step 2: Add fee fields to `UpdateLearnerProfileDto` interface**

In `types/learner-profile.ts`, add after line 401 (after `reference_contact`) and before line 403 (`// Academic Assignment`):

```typescript
  // Finance/Fee Details
  application_fee?: number | null;
  university_reg_fee?: number | null;
  fee_structure_type?: 'tuition_hostel' | 'dayscholar' | null;
  tuition_fee?: number | null;
  hostel_fee?: number | null;
  dayscholar_fee?: number | null;
  uniform_fee?: number | null;
  hospital_training_fee?: number | null;
  placement_fee?: number | null;
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

Expected: No new errors related to fee fields.

**Step 4: Commit**

```bash
git add types/learner-profile.ts
git commit -m "feat(learners): add finance fee fields to LearnerProfile types"
```

---

### Task 3: Permissions — Add Finance Permission Keys

**Files:**
- Modify: `lib/constants/permissions.ts` (lines 296-299, inside the Learners category)

**Step 1: Add finance permissions**

In `lib/constants/permissions.ts`, add after line 298 (after `learners.change-requests.reject`) and before the closing `]` of the Learners category on line 299:

```typescript
      // Learner Finance Section
      { key: 'learners.finance.view', label: 'View Finance Details (Fee Structure)' },
      { key: 'learners.finance.edit', label: 'Edit Finance Details (Fee Structure)' },
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -10`

**Step 3: Commit**

```bash
git add lib/constants/permissions.ts
git commit -m "feat(learners): add learners.finance.view/edit permission keys"
```

---

### Task 4: Zod Schema & Form Config — Add Finance Fields to Enquiry Form

**Files:**
- Modify: `app/(routes)/learners/enquiries/_components/enquiry-form.tsx`

**Step 1: Add finance fields to `enquiryFormSchema`**

In `enquiry-form.tsx`, add after line 151 (after `reference_contact`) and before the closing `});` of the schema on line 152:

```typescript
  // Finance Details
  application_fee: z.coerce.number().min(0, 'Must be non-negative').nullable().optional(),
  university_reg_fee: z.coerce.number().min(0, 'Must be non-negative').nullable().optional(),
  fee_structure_type: z.enum(['tuition_hostel', 'dayscholar']).nullable().optional(),
  tuition_fee: z.coerce.number().min(0, 'Must be non-negative').nullable().optional(),
  hostel_fee: z.coerce.number().min(0, 'Must be non-negative').nullable().optional(),
  dayscholar_fee: z.coerce.number().min(0, 'Must be non-negative').nullable().optional(),
  uniform_fee: z.coerce.number().min(0, 'Must be non-negative').nullable().optional(),
  hospital_training_fee: z.coerce.number().min(0, 'Must be non-negative').nullable().optional(),
  placement_fee: z.coerce.number().min(0, 'Must be non-negative').nullable().optional(),
```

**Step 2: Add finance tab to `ALL_TABS` array**

In `enquiry-form.tsx`, add a new entry to `ALL_TABS` (line 179, after accommodation-preferences):

```typescript
    { id: 'finance-details', label: 'Finance Details' },
```

**Step 3: Add finance fields to `fieldToTabMap`**

In `enquiry-form.tsx`, add after the accommodation fields in `fieldToTabMap` (around line 380):

```typescript
  // Finance Details
  application_fee: 'finance-details',
  university_reg_fee: 'finance-details',
  fee_structure_type: 'finance-details',
  tuition_fee: 'finance-details',
  hostel_fee: 'finance-details',
  dayscholar_fee: 'finance-details',
  uniform_fee: 'finance-details',
  hospital_training_fee: 'finance-details',
  placement_fee: 'finance-details',
```

**Step 4: Add import for FinanceDetailsSection**

Add after line 39 (after the AccommodationPreferencesSection import):

```typescript
import { FinanceDetailsSection } from './form-sections/finance-details';
```

**Step 5: Add import for usePermissions hook**

Add to the imports section (around line 12):

```typescript
import { usePermissions } from '@/hooks/use-permissions';
```

**Step 6: Add permission check inside EnquiryForm component**

Inside the `EnquiryForm` function body, after the `formTabs` computation (around line 428), add:

```typescript
  // Finance tab permission check
  const { canAccess, isSuperAdmin } = usePermissions();
  const canViewFinance = isSuperAdmin || canAccess('learners', 'finance.view');
  const canEditFinance = isSuperAdmin || canAccess('learners', 'finance.edit');

  // Filter out finance tab if user lacks permission
  const filteredFormTabs = canViewFinance
    ? formTabs
    : formTabs.filter(tab => tab.id !== 'finance-details');
```

Then replace ALL references to `formTabs` in the component with `filteredFormTabs`:
- Line ~690: `const currentTabIndex = filteredFormTabs.findIndex(...)`
- Line ~692: `const isLastTab = currentTabIndex === filteredFormTabs.length - 1`
- Line ~696: `setActiveTab(filteredFormTabs[currentTabIndex + 1].id)`
- Line ~702: `setActiveTab(filteredFormTabs[currentTabIndex - 1].id)`
- Line ~1204: `{filteredFormTabs.map((tab) => (`

**Step 7: Add finance default values to form initialization**

In the `useForm` defaultValues (around line 676, after `reference_contact`):

```typescript
          // Finance Details
          application_fee: learner?.application_fee ?? null,
          university_reg_fee: learner?.university_reg_fee ?? null,
          fee_structure_type: learner?.fee_structure_type ?? null,
          tuition_fee: learner?.tuition_fee ?? null,
          hostel_fee: learner?.hostel_fee ?? null,
          dayscholar_fee: learner?.dayscholar_fee ?? null,
          uniform_fee: learner?.uniform_fee ?? null,
          hospital_training_fee: learner?.hospital_training_fee ?? null,
          placement_fee: learner?.placement_fee ?? null,
```

**Step 8: Add finance fields to `formatFormDataForAPI`**

In the `formatFormDataForAPI` function (around line 843, after `reference_contact`):

```typescript
      // Finance Details
      application_fee: values.application_fee ?? null,
      university_reg_fee: values.university_reg_fee ?? null,
      fee_structure_type: values.fee_structure_type ?? null,
      tuition_fee: values.fee_structure_type === 'tuition_hostel' ? (values.tuition_fee ?? null) : null,
      hostel_fee: values.fee_structure_type === 'tuition_hostel' ? (values.hostel_fee ?? null) : null,
      dayscholar_fee: values.fee_structure_type === 'dayscholar' ? (values.dayscholar_fee ?? null) : null,
      uniform_fee: values.uniform_fee ?? null,
      hospital_training_fee: values.hospital_training_fee ?? null,
      placement_fee: values.placement_fee ?? null,
```

**Step 9: Add TabsContent for finance tab**

In the JSX, after the accommodation-preferences TabsContent (around line 1247):

```tsx
          {canViewFinance && (
            <TabsContent value="finance-details" className="space-y-4 mt-4">
              <Card className="p-3 sm:p-4 md:p-6">
                <FinanceDetailsSection form={form} readOnly={!canEditFinance} />
              </Card>
            </TabsContent>
          )}
```

**Step 10: Commit**

```bash
git add app/(routes)/learners/enquiries/_components/enquiry-form.tsx
git commit -m "feat(learners): add finance tab schema, permissions, and rendering to enquiry form"
```

---

### Task 5: Finance Form Section Component

**Files:**
- Create: `app/(routes)/learners/enquiries/_components/form-sections/finance-details.tsx`

**Step 1: Create the FinanceDetailsSection component**

Create the file following the exact same pattern as `accommodation-preferences.tsx`:

```tsx
// ============================================
// FINANCE DETAILS FORM SECTION
// ============================================
// Created: 2026-03-04
// Purpose: Fee structure fields with conditional rendering
// based on fee_structure_type dropdown selection
// ============================================

'use client';

import { UseFormReturn, useWatch } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useEffect } from 'react';
import { IndianRupee } from 'lucide-react';

interface FinanceDetailsProps {
  form: UseFormReturn<any>;
  readOnly?: boolean;
}

export function FinanceDetailsSection({
  form,
  readOnly = false
}: FinanceDetailsProps) {
  // Watch fee_structure_type for conditional rendering
  const feeStructureType = useWatch({
    control: form.control,
    name: 'fee_structure_type'
  });

  // Reset dependent fields when fee structure type changes
  useEffect(() => {
    if (feeStructureType === 'tuition_hostel') {
      form.setValue('dayscholar_fee', null);
    } else if (feeStructureType === 'dayscholar') {
      form.setValue('tuition_fee', null);
      form.setValue('hostel_fee', null);
    }
  }, [feeStructureType, form]);

  return (
    <div className='space-y-8'>
      <div>
        <h2 className='text-xl font-semibold mb-2'>Finance Details</h2>
        <p className='text-sm text-muted-foreground'>
          Fee structure and payment details for the learner.
        </p>
      </div>

      {/* Common Fees */}
      <div className='space-y-4'>
        <h3 className='text-sm font-semibold flex items-center gap-2'>
          <IndianRupee className='h-4 w-4' />
          Common Fees
        </h3>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <FormField
            control={form.control}
            name='application_fee'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Application Fee</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='number'
                    step='0.01'
                    min='0'
                    placeholder='Enter application fee'
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                    disabled={readOnly}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='university_reg_fee'
            render={({ field }) => (
              <FormItem>
                <FormLabel>University Registration Fee</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='number'
                    step='0.01'
                    min='0'
                    placeholder='Enter university registration fee'
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                    disabled={readOnly}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Fee Structure Type */}
      <div className='space-y-4 pt-4 border-t border-border'>
        <h3 className='text-sm font-semibold flex items-center gap-2'>
          <IndianRupee className='h-4 w-4' />
          Fee Structure
        </h3>
        <FormField
          control={form.control}
          name='fee_structure_type'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fee Structure Type</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value || ''}
                disabled={readOnly}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select fee structure type' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value='tuition_hostel'>Tuition + Hostel Fee</SelectItem>
                  <SelectItem value='dayscholar'>Day Scholar Fee</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Choose between separate tuition + hostel fees or a combined day scholar fee.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Tuition + Hostel (conditional) */}
        {feeStructureType === 'tuition_hostel' && (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
            <FormField
              control={form.control}
              name='tuition_fee'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tuition Fee</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='number'
                      step='0.01'
                      min='0'
                      placeholder='Enter tuition fee'
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                      disabled={readOnly}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='hostel_fee'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hostel Fee</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='number'
                      step='0.01'
                      min='0'
                      placeholder='Enter hostel fee'
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                      disabled={readOnly}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {/* Day Scholar Fee (conditional) */}
        {feeStructureType === 'dayscholar' && (
          <FormField
            control={form.control}
            name='dayscholar_fee'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Day Scholar Fee</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='number'
                    step='0.01'
                    min='0'
                    placeholder='Enter combined day scholar fee'
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                    disabled={readOnly}
                  />
                </FormControl>
                <FormDescription>
                  Combined tuition and hostel fee for day scholars.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>

      {/* Optional Fees */}
      <div className='space-y-4 pt-4 border-t border-border'>
        <h3 className='text-sm font-semibold flex items-center gap-2'>
          <IndianRupee className='h-4 w-4' />
          Optional Fees
        </h3>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <FormField
            control={form.control}
            name='uniform_fee'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Uniform Fee (Optional)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='number'
                    step='0.01'
                    min='0'
                    placeholder='Enter uniform fee'
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                    disabled={readOnly}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='hospital_training_fee'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Hospital Training Fee (Optional)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='number'
                    step='0.01'
                    min='0'
                    placeholder='Enter hospital training fee'
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                    disabled={readOnly}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name='placement_fee'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Placement Fee (Optional)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type='number'
                  step='0.01'
                  min='0'
                  placeholder='Enter placement fee'
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                  disabled={readOnly}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
```

**Step 2: Verify component renders without errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add app/(routes)/learners/enquiries/_components/form-sections/finance-details.tsx
git commit -m "feat(learners): create FinanceDetailsSection form component"
```

---

### Task 6: Enquiry Detail View — Add Finance Section

**Files:**
- Modify: `app/(routes)/learners/enquiries/_components/enquiry-detail.tsx`

**Step 1: Add usePermissions import**

At the top of the file, add:

```typescript
import { usePermissions } from '@/hooks/use-permissions';
import { IndianRupee } from 'lucide-react';
```

**Step 2: Add permission check inside component**

Inside the `EnquiryDetail` component (after line 34, `const [activeSection, setActiveSection] = useState('personal');`):

```typescript
  const { canAccess, isSuperAdmin } = usePermissions();
  const canViewFinance = isSuperAdmin || canAccess('learners', 'finance.view');
```

**Step 3: Add Finance to sections array**

In the `sections` array (line 36-67), add a new entry between `accommodation` and `enquiry`:

```typescript
    ...(canViewFinance ? [{
      id: 'finance',
      label: 'Finance Details',
      icon: IndianRupee
    }] : []),
```

**Step 4: Add Finance section content**

After the accommodation section (around line 755) and before the enquiry section (line 758), add:

```tsx
          {/* Finance Details Section */}
          {activeSection === 'finance' && canViewFinance && (
            <>
              <CardHeader>
                <CardTitle>Finance Details</CardTitle>
                <CardDescription>Fee structure and payment details</CardDescription>
              </CardHeader>
              <CardContent className='space-y-6'>
                <div className='space-y-4'>
                  <h3 className='text-sm font-semibold'>Common Fees</h3>
                  <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Application Fee
                      </h4>
                      <p className='text-sm'>
                        {enquiry.application_fee != null ? `₹${Number(enquiry.application_fee).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Not specified'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        University Registration Fee
                      </h4>
                      <p className='text-sm'>
                        {enquiry.university_reg_fee != null ? `₹${Number(enquiry.university_reg_fee).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Not specified'}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className='space-y-4'>
                  <h3 className='text-sm font-semibold'>Fee Structure</h3>
                  <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Fee Structure Type
                      </h4>
                      <p className='text-sm'>
                        {enquiry.fee_structure_type === 'tuition_hostel'
                          ? 'Tuition + Hostel Fee'
                          : enquiry.fee_structure_type === 'dayscholar'
                            ? 'Day Scholar Fee'
                            : 'Not specified'}
                      </p>
                    </div>
                    {enquiry.fee_structure_type === 'tuition_hostel' && (
                      <>
                        <div className='space-y-1'>
                          <h4 className='text-sm font-medium text-muted-foreground'>
                            Tuition Fee
                          </h4>
                          <p className='text-sm'>
                            {enquiry.tuition_fee != null ? `₹${Number(enquiry.tuition_fee).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Not specified'}
                          </p>
                        </div>
                        <div className='space-y-1'>
                          <h4 className='text-sm font-medium text-muted-foreground'>
                            Hostel Fee
                          </h4>
                          <p className='text-sm'>
                            {enquiry.hostel_fee != null ? `₹${Number(enquiry.hostel_fee).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Not specified'}
                          </p>
                        </div>
                      </>
                    )}
                    {enquiry.fee_structure_type === 'dayscholar' && (
                      <div className='space-y-1'>
                        <h4 className='text-sm font-medium text-muted-foreground'>
                          Day Scholar Fee
                        </h4>
                        <p className='text-sm'>
                          {enquiry.dayscholar_fee != null ? `₹${Number(enquiry.dayscholar_fee).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Not specified'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                <div className='space-y-4'>
                  <h3 className='text-sm font-semibold'>Optional Fees</h3>
                  <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Uniform Fee
                      </h4>
                      <p className='text-sm'>
                        {enquiry.uniform_fee != null ? `₹${Number(enquiry.uniform_fee).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Not applicable'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Hospital Training Fee
                      </h4>
                      <p className='text-sm'>
                        {enquiry.hospital_training_fee != null ? `₹${Number(enquiry.hospital_training_fee).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Not applicable'}
                      </p>
                    </div>
                    <div className='space-y-1'>
                      <h4 className='text-sm font-medium text-muted-foreground'>
                        Placement Fee
                      </h4>
                      <p className='text-sm'>
                        {enquiry.placement_fee != null ? `₹${Number(enquiry.placement_fee).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Not applicable'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </>
          )}
```

**Step 5: Commit**

```bash
git add app/(routes)/learners/enquiries/_components/enquiry-detail.tsx
git commit -m "feat(learners): add finance section to enquiry detail view"
```

---

### Task 7: Learner Detail View — Add Finance Section

**Files:**
- Modify: `app/(routes)/learners/profiles/_components/learner-detail.tsx`

This follows the **exact same pattern** as Task 6, since `learner-detail.tsx` mirrors `enquiry-detail.tsx`.

**Step 1: Add IndianRupee import**

The file already imports `usePermissions` and has `canAccess` + `isSuperAdmin`. Just add the icon import:

```typescript
import { IndianRupee } from 'lucide-react';
```

**Step 2: Add permission check**

Inside the component, add after the existing `canAccess` usage (the file already calls `usePermissions()`):

```typescript
  const canViewFinance = isSuperAdmin || canAccess('learners', 'finance.view');
```

**Step 3: Add Finance to sections array**

Same pattern as Task 6 — add between accommodation and admission sections using spread:

```typescript
    ...(canViewFinance ? [{
      id: 'finance',
      label: 'Finance Details',
      icon: IndianRupee
    }] : []),
```

**Step 4: Add Finance section content**

Same JSX as Task 6 but using `learner` instead of `enquiry` as the data source variable. Add between accommodation and admission sections.

**Step 5: Commit**

```bash
git add app/(routes)/learners/profiles/_components/learner-detail.tsx
git commit -m "feat(learners): add finance section to learner profile detail view"
```

---

### Task 8: Final Verification & Cleanup

**Step 1: TypeScript check**

Run: `npx tsc --noEmit --pretty`

Expected: No errors.

**Step 2: Visual verification**

1. Navigate to `/learners/enquiries/new` — verify Finance Details tab appears as Tab 6
2. Select "Tuition + Hostel Fee" — verify tuition and hostel fields appear
3. Select "Day Scholar Fee" — verify single combined field appears
4. Navigate to an existing enquiry detail page — verify Finance section in sidebar
5. Navigate to an existing learner profile detail page — verify Finance section in sidebar
6. Log in as a non-super-admin user without `learners.finance.view` permission — verify Finance tab is hidden

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(learners): complete finance section implementation with permission gating"
```

---

## Summary of All Files Changed

| # | File | Action |
|---|---|---|
| 1 | `supabase/migrations/20260304_add_learner_finance_fields.sql` | CREATE |
| 2 | `supabase/setup/01_tables.sql` | MODIFY |
| 3 | `types/learner-profile.ts` | MODIFY |
| 4 | `lib/constants/permissions.ts` | MODIFY |
| 5 | `app/(routes)/learners/enquiries/_components/enquiry-form.tsx` | MODIFY |
| 6 | `app/(routes)/learners/enquiries/_components/form-sections/finance-details.tsx` | CREATE |
| 7 | `app/(routes)/learners/enquiries/_components/enquiry-detail.tsx` | MODIFY |
| 8 | `app/(routes)/learners/profiles/_components/learner-detail.tsx` | MODIFY |
