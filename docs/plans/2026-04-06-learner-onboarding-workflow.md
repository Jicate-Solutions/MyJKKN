# Learner Onboarding Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Bridge admission enquiries to billing to learner profiles with a new `account` lifecycle status, auto-bill generation from finance fields, a `/billing/onboarding` page, and 100% payment-gated approval before learner activation.

**Architecture:** The unified `learners_profiles` table already tracks the full lifecycle (enquiry through alumni). We add a new `account` status between `approved` and `active`. When admission marks an enquiry as "account", bills are auto-generated from pre-filled finance fields. The accounts team views pending learners at `/billing/onboarding`, and marks them as approved (triggering activation) only after 100% payment.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres), React Query, TypeScript, shadcn/ui, Tailwind CSS

---

## Design Decisions (Locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Bill FK target | `learners_profiles` directly | Single source of truth; bills already join to learners_profiles |
| Payment threshold | 100% required | Simplest logic, no partial payment edge cases |
| Page location | `/billing/onboarding` | Accounts team already works in billing module |
| Bill creation | Auto-generate from finance fields | Eliminates manual bill creation bottleneck |
| New status | `account` (lifecycle_status enum) | Matches user's terminology |
| Finance entry | During enquiry stage (existing form) | Form already exists with all fee fields |

## Complete Flow

```
enquiry -> pending -> approved -> [Mark as Account] -> account -> [100% paid] -> active
                                       |                              |
                                 Auto-creates bills          Accounts team approves
                                 Validates finance           Auto-activation triggers
```

## Implementation Tasks

---

### Task 1: Add `account` to lifecycle_status enum (Database)

**Files:**
- Modify: `supabase/setup/01_tables.sql:22-39`

**Step 1: Add enum value via Supabase MCP**

Run this SQL via Supabase MCP `execute_sql`:

```sql
-- Add 'account' to lifecycle_status enum
ALTER TYPE lifecycle_status ADD VALUE IF NOT EXISTS 'account' AFTER 'approved';
```

**Step 2: Update the SQL setup file for documentation**

In `supabase/setup/01_tables.sql`, update the enum definition (lines 22-39) to include `account`:

```sql
CREATE TYPE lifecycle_status AS ENUM (
    'enquiry',      -- Initial contact/enquiry stage
    'pending',      -- Application submitted, pending review
    'approved',     -- Application approved, ready for enrollment
    'account',      -- Sent to accounts team for billing (NEW)
    'rejected',     -- Application rejected
    'waitlisted',   -- Application waitlisted
    'active',       -- Currently enrolled and active student
    'inactive',     -- Temporarily inactive (leave, suspension, etc.)
    'exited',       -- Left institution (dropout, transfer)
    'graduated',    -- Successfully completed program
    'alumni'        -- Post-graduation status
);
```

**Step 3: Commit**

```bash
git add supabase/setup/01_tables.sql
git commit -m "feat(db): add 'account' lifecycle_status for billing onboarding"
```

---

### Task 2: Update TypeScript types and status transitions

**Files:**
- Modify: `types/learner-profile.ts:15-25` (LifecycleStatus type)
- Modify: `types/learner-profile.ts:630-668` (STATUS_GROUPS, STATUS_TRANSITIONS, REQUIRED_FIELDS)

**Step 1: Add `account` to LifecycleStatus type**

In `types/learner-profile.ts` (lines 15-25), add `account` after `approved`:

```typescript
export type LifecycleStatus =
  | 'enquiry'      // Initial contact/enquiry stage
  | 'pending'      // Application submitted, pending review
  | 'approved'     // Application approved, ready for enrollment
  | 'account'      // Sent to accounts for billing
  | 'rejected'     // Application rejected
  | 'waitlisted'   // Application waitlisted
  | 'active'       // Currently enrolled and active student
  | 'inactive'     // Temporarily inactive (leave, suspension, etc.)
  | 'exited'       // Left institution (dropout, transfer)
  | 'graduated'    // Successfully completed program
  | 'alumni';      // Post-graduation status
```

**Step 2: Update STATUS_GROUPS (line 630)**

```typescript
export const STATUS_GROUPS = {
  ADMISSION_PIPELINE: ['enquiry', 'pending', 'approved', 'account', 'rejected', 'waitlisted'] as LifecycleStatus[],
  ENROLLED: ['active', 'inactive'] as LifecycleStatus[],
  COMPLETED: ['graduated', 'alumni'] as LifecycleStatus[],
  EXITED: ['exited'] as LifecycleStatus[],
} as const;
```

**Step 3: Update STATUS_TRANSITIONS (line 640)**

```typescript
export const STATUS_TRANSITIONS: Record<LifecycleStatus, LifecycleStatus[]> = {
  enquiry: ['pending', 'rejected'],
  pending: ['approved', 'rejected', 'waitlisted'],
  approved: ['account', 'active', 'rejected'],   // Added: account
  account: ['active', 'approved'],                // NEW: can activate or revert
  rejected: ['pending'],
  waitlisted: ['approved', 'pending', 'rejected'],
  active: ['inactive', 'exited', 'graduated'],
  inactive: ['active', 'exited'],
  exited: [],
  graduated: ['alumni'],
  alumni: [],
};
```

**Step 4: Update REQUIRED_FIELDS_BY_STATUS (line 657)**

```typescript
export const REQUIRED_FIELDS_BY_STATUS: Record<LifecycleStatus, string[]> = {
  enquiry: ['first_name', 'student_mobile', 'student_email'],
  pending: ['first_name', 'father_name', 'mother_name', 'date_of_birth', 'tenth_marks', 'twelfth_marks'],
  approved: ['institution_id', 'degree_id', 'department_id', 'program_id'],
  account: ['institution_id', 'degree_id', 'department_id', 'program_id', 'fee_structure_type', 'tuition_fee'],  // NEW
  rejected: [],
  waitlisted: [],
  active: ['semester_id', 'section_id', 'academic_year_id', 'college_email'],
  inactive: [],
  exited: [],
  graduated: [],
  alumni: [],
};
```

**Step 5: Commit**

```bash
git add types/learner-profile.ts
git commit -m "feat(types): add 'account' lifecycle status with transitions and required fields"
```

---

### Task 3: Add billing onboarding permissions

**Files:**
- Modify: `lib/constants/permissions.ts:447-506` (Billing Management section)
- Modify: `lib/sidebarMenuLink.ts:295-321` (Billing routes)

**Step 1: Add onboarding permissions**

In `lib/constants/permissions.ts`, add after the existing billing permissions (after line 505, before closing `]`):

```typescript
      { key: 'billing.onboarding.view', label: 'View Learner Onboarding' },
      { key: 'billing.onboarding.approve', label: 'Approve Learner Onboarding' },
```

**Step 2: Add sidebar route permissions**

In `lib/sidebarMenuLink.ts`, add after `/billing/schedule/students/[id]` line (after line 301):

```typescript
  '/billing/onboarding': 'billing.onboarding.view',
```

**Step 3: Add "Mark as Account" permission for admission team**

In `lib/constants/permissions.ts`, find the learners.admissions section and add:

```typescript
      { key: 'learners.admissions.mark_account', label: 'Mark as Account' },
```

**Step 4: Commit**

```bash
git add lib/constants/permissions.ts lib/sidebarMenuLink.ts
git commit -m "feat(permissions): add billing.onboarding and admissions.mark_account permissions"
```

---

### Task 4: Create Onboarding Service

**Files:**
- Create: `lib/services/billing/onboarding/onboarding-service.ts`

**Step 1: Create the service**

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { FEE_STRUCTURE_CONFIG, type FeeStructureType } from '@/lib/constants/fee-structure';
import type { LearnerProfile } from '@/types/learner-profile';
import type { CreateStudentBillDto } from '@/types/billing-schedule';

export interface OnboardingLearner extends LearnerProfile {
  bills?: {
    id: string;
    bill_description: string;
    final_amount: number;
    balance_amount: number;
    status: string;
  }[];
  total_fees: number;
  total_paid: number;
  total_balance: number;
  days_pending: number;
}

export interface OnboardingFilters {
  search?: string;
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  payment_status?: 'unpaid' | 'partially_paid' | 'fully_paid';
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface OnboardingListResponse {
  data: OnboardingLearner[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class OnboardingService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get all learners in 'account' status with their billing summary.
   */
  static async getOnboardingLearners(
    filters: OnboardingFilters
  ): Promise<OnboardingListResponse> {
    const page = filters.page || 1;
    const limit = filters.limit || 25;
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('learners_profiles')
      .select(
        `
        *,
        institution:institutions(id, name, counselling_code),
        degree:degrees(id, degree_name),
        department:departments(id, department_name),
        program:programs(id, program_name),
        bills:billing_student_bills(
          id, bill_description, final_amount, balance_amount, status
        )
      `,
        { count: 'exact' }
      )
      .eq('lifecycle_status', 'account');

    // Apply filters
    if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
    if (filters.degree_id) query = query.eq('degree_id', filters.degree_id);
    if (filters.department_id) query = query.eq('department_id', filters.department_id);
    if (filters.program_id) query = query.eq('program_id', filters.program_id);
    if (filters.search) {
      query = query.or(
        `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,student_email.ilike.%${filters.search}%,student_mobile.ilike.%${filters.search}%,application_id.ilike.%${filters.search}%`
      );
    }

    // Sort
    const sortBy = filters.sortBy || 'created_at';
    const sortDirection = filters.sortDirection || 'desc';
    query = query.order(sortBy, { ascending: sortDirection === 'asc' });

    // Paginate
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    // Compute billing summary per learner
    const enriched: OnboardingLearner[] = (data || []).map((learner: any) => {
      const bills = learner.bills || [];
      const totalFees = bills.reduce((sum: number, b: any) => sum + (b.final_amount || 0), 0);
      const totalBalance = bills.reduce((sum: number, b: any) => sum + (b.balance_amount || 0), 0);
      const totalPaid = totalFees - totalBalance;
      const daysPending = Math.floor(
        (Date.now() - new Date(learner.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        ...learner,
        total_fees: totalFees,
        total_paid: totalPaid,
        total_balance: totalBalance,
        days_pending: daysPending,
      };
    });

    // Client-side filter for payment status (post-query)
    let filtered = enriched;
    if (filters.payment_status === 'fully_paid') {
      filtered = enriched.filter((l) => l.total_balance === 0 && l.total_fees > 0);
    } else if (filters.payment_status === 'partially_paid') {
      filtered = enriched.filter((l) => l.total_balance > 0 && l.total_paid > 0);
    } else if (filters.payment_status === 'unpaid') {
      filtered = enriched.filter((l) => l.total_paid === 0);
    }

    return {
      data: filtered,
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Validate that a learner has complete finance fields before marking as account.
   * Returns { valid: true } or { valid: false, missing: string[] }
   */
  static validateFinanceFields(
    learner: LearnerProfile
  ): { valid: true } | { valid: false; missing: string[] } {
    const missing: string[] = [];

    if (!learner.fee_structure_type) missing.push('Fee Structure Type');
    if (!learner.tuition_fee || learner.tuition_fee <= 0) missing.push('Tuition Fee');

    // Check primary fields based on fee structure type
    if (learner.fee_structure_type) {
      const config = FEE_STRUCTURE_CONFIG[learner.fee_structure_type as FeeStructureType];
      if (config) {
        for (const field of config.primaryFields) {
          const value = (learner as any)[field.name];
          if (!value || value <= 0) {
            missing.push(field.label);
          }
        }
      }
    }

    return missing.length === 0 ? { valid: true } : { valid: false, missing };
  }

  /**
   * Auto-generate bills from a learner's finance fields.
   * Called when admission team clicks "Mark as Account".
   */
  static async createBillsFromProfile(learnerId: string): Promise<void> {
    // Fetch the learner profile
    const { data: learner, error: fetchError } = await this.supabase
      .from('learners_profiles')
      .select('*')
      .eq('id', learnerId)
      .single();

    if (fetchError || !learner) throw new Error('Learner not found');

    // Get current user
    const { data: userData } = await (this.supabase as any).auth.getUser();
    const currentUserId = userData?.user?.id;

    // Default due date: 30 days from now
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    const dueDateStr = dueDate.toISOString().split('T')[0];

    // Build bill list from finance fields
    const billsToCreate: Omit<CreateStudentBillDto, 'item_category_id'>[] = [];

    // Application Fee
    if (learner.application_fee && learner.application_fee > 0) {
      billsToCreate.push({
        student_id: learnerId,
        institution_id: learner.institution_id,
        bill_description: 'Application Fee',
        due_date: dueDateStr,
        unit_amount: learner.application_fee,
        total_amount: learner.application_fee,
        final_amount: learner.application_fee,
      });
    }

    // University Registration Fee
    if (learner.university_reg_fee && learner.university_reg_fee > 0) {
      billsToCreate.push({
        student_id: learnerId,
        institution_id: learner.institution_id,
        bill_description: 'University Registration Fee',
        due_date: dueDateStr,
        unit_amount: learner.university_reg_fee,
        total_amount: learner.university_reg_fee,
        final_amount: learner.university_reg_fee,
      });
    }

    // Tuition Fee (always present for account status)
    if (learner.tuition_fee && learner.tuition_fee > 0) {
      billsToCreate.push({
        student_id: learnerId,
        institution_id: learner.institution_id,
        bill_description: 'Tuition Fee',
        due_date: dueDateStr,
        unit_amount: learner.tuition_fee,
        total_amount: learner.tuition_fee,
        final_amount: learner.tuition_fee,
      });
    }

    // Hostel Fee
    if (learner.hostel_fee && learner.hostel_fee > 0) {
      billsToCreate.push({
        student_id: learnerId,
        institution_id: learner.institution_id,
        bill_description: 'Hostel Fee',
        due_date: dueDateStr,
        unit_amount: learner.hostel_fee,
        total_amount: learner.hostel_fee,
        final_amount: learner.hostel_fee,
      });
    }

    // Uniform Fee
    if (learner.uniform_fee && learner.uniform_fee > 0) {
      billsToCreate.push({
        student_id: learnerId,
        institution_id: learner.institution_id,
        bill_description: 'Uniform Fee',
        due_date: dueDateStr,
        unit_amount: learner.uniform_fee,
        total_amount: learner.uniform_fee,
        final_amount: learner.uniform_fee,
      });
    }

    // Hospital Training Fee
    if (learner.hospital_training_fee && learner.hospital_training_fee > 0) {
      billsToCreate.push({
        student_id: learnerId,
        institution_id: learner.institution_id,
        bill_description: 'Hospital Training Fee',
        due_date: dueDateStr,
        unit_amount: learner.hospital_training_fee,
        total_amount: learner.hospital_training_fee,
        final_amount: learner.hospital_training_fee,
      });
    }

    // Placement Fee
    if (learner.placement_fee && learner.placement_fee > 0) {
      billsToCreate.push({
        student_id: learnerId,
        institution_id: learner.institution_id,
        bill_description: 'Placement Fee',
        due_date: dueDateStr,
        unit_amount: learner.placement_fee,
        total_amount: learner.placement_fee,
        final_amount: learner.placement_fee,
      });
    }

    // Transport Fee
    if (learner.transport_fee && learner.transport_fee > 0) {
      billsToCreate.push({
        student_id: learnerId,
        institution_id: learner.institution_id,
        bill_description: 'Transport Fee',
        due_date: dueDateStr,
        unit_amount: learner.transport_fee,
        total_amount: learner.transport_fee,
        final_amount: learner.transport_fee,
      });
    }

    if (billsToCreate.length === 0) {
      throw new Error('No billable fees found on learner profile');
    }

    // Insert all bills in one batch
    // Note: item_category_id is set to a default "Onboarding Fee" category
    // This requires a billing_item_category to exist for onboarding fees
    // The accounts team can update the category after review
    const { error: insertError } = await this.supabase
      .from('billing_student_bills')
      .insert(
        billsToCreate.map((bill) => ({
          ...bill,
          balance_amount: bill.final_amount,
          tax_amount: 0,
          quantity: 1,
          status: 'unpaid',
          created_by: currentUserId,
        }))
      );

    if (insertError) throw insertError;
  }

  /**
   * Mark a learner as "account" status and auto-generate bills.
   * Called by admission team.
   */
  static async markAsAccount(learnerId: string): Promise<void> {
    // 1. Fetch learner
    const { data: learner, error: fetchError } = await this.supabase
      .from('learners_profiles')
      .select('*')
      .eq('id', learnerId)
      .single();

    if (fetchError || !learner) throw new Error('Learner not found');

    // 2. Validate current status allows transition
    if (learner.lifecycle_status !== 'approved') {
      throw new Error(`Cannot mark as account: learner is in '${learner.lifecycle_status}' status (must be 'approved')`);
    }

    // 3. Validate finance fields
    const validation = this.validateFinanceFields(learner);
    if (!validation.valid) {
      throw new Error(`Missing finance fields: ${(validation as any).missing.join(', ')}`);
    }

    // 4. Update status to 'account'
    const { error: updateError } = await this.supabase
      .from('learners_profiles')
      .update({
        lifecycle_status: 'account',
        updated_at: new Date().toISOString(),
      })
      .eq('id', learnerId);

    if (updateError) throw updateError;

    // 5. Auto-generate bills
    await this.createBillsFromProfile(learnerId);
  }

  /**
   * Mark a learner as approved (activated) after 100% payment.
   * Called by accounts team.
   */
  static async markAsApproved(learnerId: string): Promise<void> {
    // 1. Fetch learner with bills
    const { data: learner, error: fetchError } = await this.supabase
      .from('learners_profiles')
      .select(`
        *,
        bills:billing_student_bills(id, final_amount, balance_amount, status)
      `)
      .eq('id', learnerId)
      .single();

    if (fetchError || !learner) throw new Error('Learner not found');

    // 2. Validate current status
    if (learner.lifecycle_status !== 'account') {
      throw new Error(`Cannot approve: learner is in '${learner.lifecycle_status}' status (must be 'account')`);
    }

    // 3. Validate 100% payment
    const bills = (learner as any).bills || [];
    if (bills.length === 0) {
      throw new Error('No bills found for this learner');
    }

    const totalBalance = bills.reduce((sum: number, b: any) => sum + (b.balance_amount || 0), 0);
    if (totalBalance > 0) {
      throw new Error(`Cannot approve: outstanding balance of ${totalBalance}. All fees must be 100% paid.`);
    }

    // 4. Transition to 'active' status
    // Note: This bypasses the normal approved->active flow since we're going account->active
    const { error: updateError } = await this.supabase
      .from('learners_profiles')
      .update({
        lifecycle_status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', learnerId);

    if (updateError) throw updateError;
  }

  /**
   * Revert a learner from 'account' back to 'approved'.
   * Deletes any unpaid bills created during the mark-as-account flow.
   */
  static async revertToApproved(learnerId: string): Promise<void> {
    // 1. Delete unpaid bills for this learner
    const { error: deleteError } = await this.supabase
      .from('billing_student_bills')
      .delete()
      .eq('student_id', learnerId)
      .eq('status', 'unpaid');

    if (deleteError) throw deleteError;

    // 2. Revert status
    const { error: updateError } = await this.supabase
      .from('learners_profiles')
      .update({
        lifecycle_status: 'approved',
        updated_at: new Date().toISOString(),
      })
      .eq('id', learnerId);

    if (updateError) throw updateError;
  }
}
```

**Step 2: Commit**

```bash
git add lib/services/billing/onboarding/onboarding-service.ts
git commit -m "feat(billing): create OnboardingService for mark-as-account and approval flow"
```

---

### Task 5: Create React Query hooks for onboarding

**Files:**
- Create: `hooks/billing/use-onboarding.ts`

**Step 1: Create the hook file**

Follow the exact pattern from `hooks/billing/use-student-bills.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  OnboardingService,
  type OnboardingFilters,
} from '@/lib/services/billing/onboarding/onboarding-service';
import { studentBillKeys } from '@/hooks/billing/use-student-bills';
import { learnerProfileKeys } from '@/hooks/use-learner-profiles';

export const onboardingKeys = {
  all: ['billing-onboarding'] as const,
  lists: () => [...onboardingKeys.all, 'list'] as const,
  list: (filters: OnboardingFilters) => [...onboardingKeys.lists(), filters] as const,
};

export function useOnboardingLearners(filters: OnboardingFilters) {
  return useQuery({
    queryKey: onboardingKeys.list(filters),
    queryFn: () => OnboardingService.getOnboardingLearners(filters),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

export function useMarkAsAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (learnerId: string) => OnboardingService.markAsAccount(learnerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentBillKeys.lists() });
      toast.success('Learner sent to accounts for billing');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to mark as account');
    },
  });
}

export function useMarkAsApproved() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (learnerId: string) => OnboardingService.markAsApproved(learnerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentBillKeys.lists() });
      toast.success('Learner approved and activated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to approve learner');
    },
  });
}

export function useRevertToApproved() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (learnerId: string) => OnboardingService.revertToApproved(learnerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentBillKeys.lists() });
      toast.success('Learner reverted to approved status');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to revert status');
    },
  });
}
```

**Step 2: Commit**

```bash
git add hooks/billing/use-onboarding.ts
git commit -m "feat(hooks): add React Query hooks for onboarding service"
```

---

### Task 6: Update LearnerProfileService for `account` status

**Files:**
- Modify: `lib/services/learner-profile-service.ts`

**Step 1: Update the service's STATUS_TRANSITIONS map**

The service at `lib/services/learner-profile-service.ts` has its own copy of status transitions. Find and update the `STATUS_TRANSITIONS` or similar constant in the service to match the types file:

- Add `account` to `approved`'s allowed transitions: `approved: ['account', 'active', 'rejected']`
- Add new entry: `account: ['active', 'approved']`

**Step 2: Update the `checkAndAutoActivate` method (lines 77-137)**

Add a guard to SKIP auto-activation when status is `account`. The auto-activation should only trigger when transitioning directly from `approved` to `active` (the old flow) OR when the accounts team explicitly approves. Find the check for `lifecycle_status === 'approved'` and add:

```typescript
// Skip auto-activation for 'account' status - accounts team must explicitly approve
if (profile.lifecycle_status === 'account') {
  return;
}
```

**Step 3: Commit**

```bash
git add lib/services/learner-profile-service.ts
git commit -m "feat(service): support 'account' status in learner profile lifecycle"
```

---

### Task 7: Add "Mark as Account" button to enquiry detail page

**Files:**
- Modify: `app/(routes)/learners/enquiries/_components/enquiry-detail-actions.tsx`

**Step 1: Add the Mark as Account action**

Update the existing `enquiry-detail-actions.tsx` to add a "Mark as Account" dropdown item. Follow the existing pattern (uses `DropdownMenu`, `AlertDialog`, `usePermissions`):

Add these to the component:
1. Import `useMarkAsAccount` from `@/hooks/billing/use-onboarding`
2. Import `OnboardingService` for `validateFinanceFields`
3. Import `Landmark` icon from `lucide-react` (bank/finance icon)
4. Add state: `const [accountDialogOpen, setAccountDialogOpen] = useState(false)`
5. Add mutation: `const markAsAccountMutation = useMarkAsAccount()`
6. Add permission: `const hasMarkAccountPermission = !permissionsLoading && (isSuperAdmin || canAccess('learners.admissions', 'mark_account'))`
7. Add validation check before showing dialog:
   ```typescript
   const handleMarkAsAccount = () => {
     const validation = OnboardingService.validateFinanceFields(enquiry);
     if (!validation.valid) {
       toast.error(`Missing finance fields: ${validation.missing.join(', ')}. Please edit the enquiry to add finance details.`);
       return;
     }
     setAccountDialogOpen(true);
   };
   ```
8. Add dropdown item (after Edit, before Delete):
   ```tsx
   {hasMarkAccountPermission && enquiry.lifecycle_status === 'approved' && (
     <DropdownMenuItem onClick={handleMarkAsAccount}>
       <Landmark className='mr-2 h-4 w-4' />
       Mark as Account
     </DropdownMenuItem>
   )}
   ```
9. Add confirmation AlertDialog (similar to delete dialog):
   ```tsx
   <AlertDialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
     <AlertDialogContent>
       <AlertDialogHeader>
         <AlertDialogTitle>Send to Accounts Team?</AlertDialogTitle>
         <AlertDialogDescription>
           This will create bills for {enquiry.first_name} {enquiry.last_name || ''} based on their fee structure
           and send them to the accounts team for payment processing.
         </AlertDialogDescription>
       </AlertDialogHeader>
       <AlertDialogFooter>
         <AlertDialogCancel disabled={markAsAccountMutation.isPending}>Cancel</AlertDialogCancel>
         <AlertDialogAction
           onClick={async () => {
             try {
               await markAsAccountMutation.mutateAsync(enquiry.id);
               setAccountDialogOpen(false);
             } catch {}
           }}
           disabled={markAsAccountMutation.isPending}
         >
           {markAsAccountMutation.isPending ? 'Processing...' : 'Confirm'}
         </AlertDialogAction>
       </AlertDialogFooter>
     </AlertDialogContent>
   </AlertDialog>
   ```

**Step 2: Commit**

```bash
git add app/(routes)/learners/enquiries/_components/enquiry-detail-actions.tsx
git commit -m "feat(enquiry): add 'Mark as Account' action with finance validation"
```

---

### Task 8: Create `/billing/onboarding` page and components

**Files:**
- Create: `app/(routes)/billing/onboarding/page.tsx`
- Create: `app/(routes)/billing/onboarding/_components/onboarding-data-table.tsx`
- Create: `app/(routes)/billing/onboarding/_components/columns.tsx`
- Create: `app/(routes)/billing/onboarding/_components/row-actions.tsx`

**Step 1: Create the page component**

`app/(routes)/billing/onboarding/page.tsx`:

```tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { OnboardingDataTable } from './_components/onboarding-data-table';
import { PermissionGate } from '@/components/permission-gate';

export default function BillingOnboardingPage() {
  return (
    <PermissionGate module="billing.onboarding" action="view">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Learner Onboarding</h1>
          <p className="text-muted-foreground">
            Review and approve learners pending payment before enrollment
          </p>
        </div>
        <OnboardingDataTable />
      </div>
    </PermissionGate>
  );
}
```

**Step 2: Create columns definition**

`app/(routes)/billing/onboarding/_components/columns.tsx`:

Follow the pattern from `app/(routes)/billing/schedule/_components/columns.tsx`. Define columns:

```tsx
'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { formatCurrency } from '@/lib/utils';
import type { OnboardingLearner } from '@/lib/services/billing/onboarding/onboarding-service';
import { OnboardingRowActions } from './row-actions';

export const onboardingColumns: ColumnDef<OnboardingLearner>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    size: 50,
    enableSorting: false,
  },
  {
    accessorKey: 'first_name',
    header: 'Student Name',
    size: 200,
    cell: ({ row }) => {
      const learner = row.original;
      return (
        <div>
          <div className="font-medium">{learner.first_name} {learner.last_name || ''}</div>
          <div className="text-xs text-muted-foreground">{learner.application_id || ''}</div>
        </div>
      );
    },
  },
  {
    accessorKey: 'student_email',
    header: 'Contact',
    size: 200,
    cell: ({ row }) => (
      <div>
        <div className="text-sm">{row.original.student_email}</div>
        <div className="text-xs text-muted-foreground">{row.original.student_mobile}</div>
      </div>
    ),
  },
  {
    id: 'program',
    header: 'Program',
    size: 180,
    cell: ({ row }) => {
      const learner = row.original;
      return (
        <div>
          <div className="text-sm">{(learner as any).program?.program_name || '-'}</div>
          <div className="text-xs text-muted-foreground">
            {(learner as any).degree?.degree_name || ''}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'total_fees',
    header: 'Total Fees',
    size: 120,
    cell: ({ row }) => (
      <div className="font-medium">{formatCurrency(row.original.total_fees)}</div>
    ),
  },
  {
    accessorKey: 'total_paid',
    header: 'Paid',
    size: 120,
    cell: ({ row }) => (
      <div className="text-green-600">{formatCurrency(row.original.total_paid)}</div>
    ),
  },
  {
    accessorKey: 'total_balance',
    header: 'Balance',
    size: 120,
    cell: ({ row }) => {
      const balance = row.original.total_balance;
      return (
        <div className={balance > 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
          {formatCurrency(balance)}
        </div>
      );
    },
  },
  {
    id: 'payment_status',
    header: 'Payment Status',
    size: 140,
    cell: ({ row }) => {
      const { total_fees, total_paid, total_balance } = row.original;
      if (total_fees === 0) return <Badge variant="outline">No Bills</Badge>;
      if (total_balance === 0) return <Badge className="bg-green-100 text-green-800">Fully Paid</Badge>;
      if (total_paid > 0) return <Badge className="bg-yellow-100 text-yellow-800">Partial</Badge>;
      return <Badge className="bg-red-100 text-red-800">Unpaid</Badge>;
    },
  },
  {
    accessorKey: 'days_pending',
    header: 'Days Pending',
    size: 100,
    cell: ({ row }) => {
      const days = row.original.days_pending;
      return (
        <span className={days > 14 ? 'text-red-600 font-medium' : days > 7 ? 'text-yellow-600' : ''}>
          {days}d
        </span>
      );
    },
  },
  {
    id: 'actions',
    header: 'Actions',
    size: 100,
    cell: ({ row }) => <OnboardingRowActions learner={row.original} />,
  },
];
```

**Step 3: Create row actions**

`app/(routes)/billing/onboarding/_components/row-actions.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, CheckCircle, Eye, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { useMarkAsApproved, useRevertToApproved } from '@/hooks/billing/use-onboarding';
import type { OnboardingLearner } from '@/lib/services/billing/onboarding/onboarding-service';

interface OnboardingRowActionsProps {
  learner: OnboardingLearner;
}

export function OnboardingRowActions({ learner }: OnboardingRowActionsProps) {
  const router = useRouter();
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const { canAccess, isSuperAdmin, isLoading } = usePermissions();

  const approveM = useMarkAsApproved();
  const revertM = useRevertToApproved();

  const hasApprovePermission = !isLoading && (isSuperAdmin || canAccess('billing.onboarding', 'approve'));
  const isFullyPaid = learner.total_balance === 0 && learner.total_fees > 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push(`/learners/enquiries/${learner.id}`)}>
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </DropdownMenuItem>
          {hasApprovePermission && isFullyPaid && (
            <DropdownMenuItem onClick={() => setApproveDialogOpen(true)}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Mark as Approved
            </DropdownMenuItem>
          )}
          {hasApprovePermission && (
            <DropdownMenuItem
              onClick={() => setRevertDialogOpen(true)}
              className="text-orange-600"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Revert to Approved
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Approve Dialog */}
      <AlertDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve and Activate Learner?</AlertDialogTitle>
            <AlertDialogDescription>
              {learner.first_name} {learner.last_name || ''} has fully paid all fees.
              This will activate them as an enrolled student and create their user account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approveM.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await approveM.mutateAsync(learner.id);
                  setApproveDialogOpen(false);
                } catch {}
              }}
              disabled={approveM.isPending}
            >
              {approveM.isPending ? 'Approving...' : 'Approve & Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revert Dialog */}
      <AlertDialog open={revertDialogOpen} onOpenChange={setRevertDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert to Approved?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revert {learner.first_name} back to 'approved' status and delete
              any unpaid bills. Paid bills will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revertM.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await revertM.mutateAsync(learner.id);
                  setRevertDialogOpen(false);
                } catch {}
              }}
              disabled={revertM.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {revertM.isPending ? 'Reverting...' : 'Revert'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

**Step 4: Create the data table component**

`app/(routes)/billing/onboarding/_components/onboarding-data-table.tsx`:

Follow the pattern from billing schedule data table. This is a client component that:
1. Uses `useOnboardingLearners(filters)` hook
2. Renders the `DataTable` component with `onboardingColumns`
3. Includes filters: search, institution, degree, department, program, payment status
4. Uses tabs: All | Unpaid | Partially Paid | Fully Paid
5. Shows pagination

```tsx
'use client';

import { useState } from 'react';
import { useOnboardingLearners } from '@/hooks/billing/use-onboarding';
import { DataTable } from '@/components/ui/data-table';
import { onboardingColumns } from './columns';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search } from 'lucide-react';
import type { OnboardingFilters } from '@/lib/services/billing/onboarding/onboarding-service';

export function OnboardingDataTable() {
  const [filters, setFilters] = useState<OnboardingFilters>({
    page: 1,
    limit: 25,
  });

  const { data, isLoading } = useOnboardingLearners(filters);

  const updateFilter = (key: keyof OnboardingFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  return (
    <div className="space-y-4">
      {/* Filters toolbar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone..."
            className="pl-10"
            value={filters.search || ''}
            onChange={(e) => updateFilter('search', e.target.value)}
          />
        </div>
        <Tabs
          value={filters.payment_status || 'all'}
          onValueChange={(v) => updateFilter('payment_status', v === 'all' ? undefined : v)}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unpaid">Unpaid</TabsTrigger>
            <TabsTrigger value="partially_paid">Partial</TabsTrigger>
            <TabsTrigger value="fully_paid">Fully Paid</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Data table */}
      <DataTable
        columns={onboardingColumns}
        data={data?.data || []}
        isLoading={isLoading}
        pageCount={data?.metadata.totalPages || 0}
        pageIndex={(filters.page || 1) - 1}
        pageSize={filters.limit || 25}
        onPaginationChange={(pageIndex, pageSize) => {
          setFilters((prev) => ({
            ...prev,
            page: pageIndex + 1,
            limit: pageSize,
          }));
        }}
      />
    </div>
  );
}
```

**Step 5: Commit**

```bash
git add app/(routes)/billing/onboarding/
git commit -m "feat(billing): add /billing/onboarding page with data table, columns, and row actions"
```

---

### Task 9: Add `account` status badge styling

**Files:**
- Find and modify the lifecycle status badge component (used across enquiry and profile pages)

**Step 1: Find the badge component**

Search for `LifecycleStatusBadge` or similar component that maps lifecycle statuses to badge colors. It's likely in one of:
- `app/(routes)/learners/enquiries/_components/`
- `app/(routes)/learners/profiles/_components/`
- `components/ui/`

**Step 2: Add `account` variant**

Add to the status-to-color mapping:
```typescript
account: { label: 'Account', variant: 'warning', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
```

**Step 3: Commit**

```bash
git add [badge-component-file]
git commit -m "feat(ui): add 'account' badge variant to lifecycle status badges"
```

---

### Task 10: Add billing onboarding to sidebar navigation

**Files:**
- Find and modify the sidebar menu configuration for the billing module

**Step 1: Find the sidebar menu items**

The billing sidebar items are likely in:
- `app/(routes)/billing/layout.tsx` or `app/(routes)/billing/_layout-client.tsx`
- OR in a shared sidebar configuration component

**Step 2: Add onboarding link**

Add after the "Schedule" entry:
```typescript
{
  title: 'Learner Onboarding',
  href: '/billing/onboarding',
  icon: UserCheck, // from lucide-react
  permission: 'billing.onboarding.view',
}
```

**Step 3: Commit**

```bash
git add [sidebar-file]
git commit -m "feat(nav): add Learner Onboarding to billing sidebar"
```

---

### Task 11: Update enquiry list to show `account` status tab

**Files:**
- Modify: `app/(routes)/learners/enquiries/_components/enquiries-data-table.tsx` (or equivalent)

**Step 1: Find the tab configuration**

The enquiries page likely has tabs for: Enquiries, Pending, Rejected, Waitlisted.

**Step 2: Add Account tab**

Add a new tab after "Pending":
```typescript
{ value: 'account', label: 'Account', count: accountCount }
```

This filters `lifecycle_status = 'account'` to show learners waiting for billing.

**Step 3: Commit**

```bash
git add app/(routes)/learners/enquiries/_components/
git commit -m "feat(enquiry): add 'Account' tab to enquiry list showing billing-pending learners"
```

---

### Task 12: Integration Testing

**Step 1: Test the complete flow manually**

1. Create a new enquiry with finance details filled in
2. Progress through: enquiry -> pending -> approved
3. Click "Mark as Account" on the approved enquiry
4. Verify:
   - Status changed to `account`
   - Bills auto-created in `billing_student_bills`
   - Learner appears in `/billing/onboarding`
5. Record payments against the bills (use existing billing receipt flow)
6. Verify:
   - Payment status updates on onboarding page
   - "Mark as Approved" button appears when fully paid
7. Click "Mark as Approved"
8. Verify:
   - Status changed to `active`
   - Learner appears in `/learners/profiles`
   - Auto-activation triggers if profile is complete

**Step 2: Test edge cases**

- Try "Mark as Account" without finance fields -> should show validation error
- Try "Mark as Approved" with unpaid balance -> should show error
- Try "Revert to Approved" -> should delete unpaid bills, revert status
- Verify permissions: admission team can only mark as account, accounts team can only approve

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(onboarding): complete learner onboarding workflow - admission to billing to profiles"
```

---

## Task Dependency Graph

```
Task 1 (DB enum) ──────┐
                        ├── Task 4 (Service) ── Task 5 (Hooks) ──┐
Task 2 (TS types) ──────┤                                        ├── Task 7 (Mark as Account UI)
                        │                                        ├── Task 8 (Onboarding Page)
Task 3 (Permissions) ───┘                                        ├── Task 9 (Badge styling)
                                                                 ├── Task 10 (Sidebar nav)
Task 6 (Update LPS) ────────────────────────────────────────────┤
                                                                 ├── Task 11 (Enquiry tabs)
                                                                 └── Task 12 (Integration testing)
```

**Parallel groups:**
- **Wave 1** (no deps): Tasks 1, 2, 3 (can run in parallel)
- **Wave 2** (needs Wave 1): Tasks 4, 6 (can run in parallel)
- **Wave 3** (needs Wave 2): Task 5
- **Wave 4** (needs Wave 3): Tasks 7, 8, 9, 10, 11 (can run in parallel)
- **Wave 5** (needs all): Task 12

---

## Files Summary

| Action | File Path |
|--------|-----------|
| Modify | `supabase/setup/01_tables.sql` (add `account` to enum) |
| Modify | `types/learner-profile.ts` (LifecycleStatus, transitions, required fields) |
| Modify | `lib/constants/permissions.ts` (billing.onboarding.*, admissions.mark_account) |
| Modify | `lib/sidebarMenuLink.ts` (add /billing/onboarding route) |
| Create | `lib/services/billing/onboarding/onboarding-service.ts` |
| Create | `hooks/billing/use-onboarding.ts` |
| Modify | `lib/services/learner-profile-service.ts` (account transitions, skip auto-activate) |
| Modify | `app/(routes)/learners/enquiries/_components/enquiry-detail-actions.tsx` |
| Create | `app/(routes)/billing/onboarding/page.tsx` |
| Create | `app/(routes)/billing/onboarding/_components/onboarding-data-table.tsx` |
| Create | `app/(routes)/billing/onboarding/_components/columns.tsx` |
| Create | `app/(routes)/billing/onboarding/_components/row-actions.tsx` |
| Modify | Lifecycle status badge component (add `account` variant) |
| Modify | Billing sidebar navigation (add onboarding link) |
| Modify | Enquiry data table (add Account tab) |
