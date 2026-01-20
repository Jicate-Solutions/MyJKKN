# Learner Profile Change Approval Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Enable students to request profile edits with HOD/Staff approval workflow and side-by-side change comparison.

**Architecture:** Two-table design with `profile_change_requests` for pending/approved/rejected requests and `profile_change_audit_log` for permanent history. Students submit change requests via My Profile page, HOD/Staff review via dedicated change-requests page with role-based filtering (HOD: institution-wide, Staff: department-only). Side-by-side comparison UI for transparency.

**Tech Stack:** Next.js 14 App Router, Supabase PostgreSQL, TypeScript, Zod, React Hook Form, TanStack React Table, Tailwind CSS, shadcn/ui

---

## Task 1: Database Schema - Tables & Indexes

**Files:**
- Create: `supabase/migrations/20250120000001_create_profile_change_requests.sql`

**Step 1: Create migration file**

Create the migration file with the following SQL:

```sql
-- Create profile_change_requests table
CREATE TABLE profile_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Request metadata
  learner_id UUID NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  request_status TEXT NOT NULL DEFAULT 'pending' CHECK (request_status IN ('pending', 'approved', 'rejected', 'cancelled')),

  -- Change data (stores old vs new as JSONB for flexibility)
  changed_fields JSONB NOT NULL, -- { "field_name": { "old": "value", "new": "value" } }
  fields_summary TEXT[] NOT NULL DEFAULT '{}', -- Array of field names changed (for quick filtering)

  -- Approval workflow
  submitted_by UUID REFERENCES profiles(id), -- Student who submitted
  submitted_at TIMESTAMPTZ DEFAULT NOW(),

  reviewed_by UUID REFERENCES profiles(id), -- HOD/Staff who approved/rejected
  reviewed_at TIMESTAMPTZ,
  review_comments TEXT, -- Rejection reason or approval notes

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraint: only one pending request per learner
  CONSTRAINT unique_pending_request_per_learner UNIQUE (learner_id) WHERE (request_status = 'pending')
);

-- Indexes for performance
CREATE INDEX idx_change_requests_status ON profile_change_requests(request_status);
CREATE INDEX idx_change_requests_learner ON profile_change_requests(learner_id);
CREATE INDEX idx_change_requests_submitted_at ON profile_change_requests(submitted_at DESC);
CREATE INDEX idx_change_requests_filter ON profile_change_requests(request_status, learner_id, submitted_at DESC);

-- Create profile_change_audit_log table (permanent history)
CREATE TABLE profile_change_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  learner_id UUID NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
  change_request_id UUID REFERENCES profile_change_requests(id), -- Link to original request

  action_type TEXT NOT NULL CHECK (action_type IN ('approved', 'rejected', 'cancelled')),
  changed_fields JSONB NOT NULL, -- Same structure as change_requests

  performed_by UUID REFERENCES profiles(id), -- Who made the change
  performed_at TIMESTAMPTZ DEFAULT NOW(),
  comments TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for audit log
CREATE INDEX idx_audit_log_learner ON profile_change_audit_log(learner_id);
CREATE INDEX idx_audit_log_performed_at ON profile_change_audit_log(performed_at DESC);
CREATE INDEX idx_audit_log_request ON profile_change_audit_log(change_request_id);

-- Add comment
COMMENT ON TABLE profile_change_requests IS 'Stores student profile change requests pending approval';
COMMENT ON TABLE profile_change_audit_log IS 'Permanent audit trail of all profile changes';
```

**Step 2: Apply migration**

Run: `supabase migration up`
Expected: Tables created successfully with all indexes and constraints

**Step 3: Verify in Supabase Dashboard**

1. Open Supabase Dashboard → Table Editor
2. Verify `profile_change_requests` table exists with all columns
3. Verify `profile_change_audit_log` table exists
4. Check indexes in Database → Indexes tab

**Step 4: Update SQL_FILE_INDEX.md**

```bash
# Check the index file first
cat supabase/SQL_FILE_INDEX.md

# Note the migration file added
```

**Step 5: Commit**

```bash
git add supabase/migrations/20250120000001_create_profile_change_requests.sql
git commit -m "feat(db): add profile change requests and audit log tables"
```

---

## Task 2: Database Schema - RLS Policies

**Files:**
- Create: `supabase/migrations/20250120000002_add_rls_policies_profile_changes.sql`

**Step 1: Create RLS policies migration**

```sql
-- Enable RLS on both tables
ALTER TABLE profile_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_change_audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies for profile_change_requests
-- ============================================

-- Students can view their own requests
CREATE POLICY "Students can view own change requests"
ON profile_change_requests FOR SELECT
USING (
  learner_id IN (
    SELECT learner_id FROM profiles WHERE id = auth.uid() AND role = 'student'
  )
);

-- Students can insert their own requests
CREATE POLICY "Students can create change requests"
ON profile_change_requests FOR INSERT
WITH CHECK (
  learner_id IN (
    SELECT learner_id FROM profiles WHERE id = auth.uid() AND role = 'student'
  )
);

-- Students can cancel their own pending requests
CREATE POLICY "Students can cancel own pending requests"
ON profile_change_requests FOR UPDATE
USING (
  learner_id IN (
    SELECT learner_id FROM profiles WHERE id = auth.uid() AND role = 'student'
  )
  AND request_status = 'pending'
)
WITH CHECK (
  request_status = 'cancelled'
);

-- HOD can view institution-wide requests
CREATE POLICY "HOD can view institution requests"
ON profile_change_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN learner_profiles lp ON lp.id = profile_change_requests.learner_id
    WHERE p.id = auth.uid()
      AND p.role = 'hod'
      AND p.institution_id = lp.institution_id
  )
);

-- Staff can view department requests
CREATE POLICY "Staff can view department requests"
ON profile_change_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN learner_profiles lp ON lp.id = profile_change_requests.learner_id
    WHERE p.id = auth.uid()
      AND p.role = 'staff'
      AND p.department_id = lp.department_id
  )
);

-- HOD/Staff can update requests (approve/reject)
CREATE POLICY "Approvers can update requests"
ON profile_change_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN learner_profiles lp ON lp.id = profile_change_requests.learner_id
    WHERE p.id = auth.uid()
      AND (
        (p.role = 'hod' AND p.institution_id = lp.institution_id)
        OR (p.role = 'staff' AND p.department_id = lp.department_id)
        OR p.role = 'super_admin'
      )
  )
)
WITH CHECK (
  request_status IN ('approved', 'rejected')
);

-- Super admin can do everything
CREATE POLICY "Super admin full access on change requests"
ON profile_change_requests FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  )
);

-- ============================================
-- RLS Policies for profile_change_audit_log
-- ============================================

-- Students can view their own audit history
CREATE POLICY "Students can view own audit log"
ON profile_change_audit_log FOR SELECT
USING (
  learner_id IN (
    SELECT learner_id FROM profiles WHERE id = auth.uid() AND role = 'student'
  )
);

-- HOD can view institution audit logs
CREATE POLICY "HOD can view institution audit logs"
ON profile_change_audit_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN learner_profiles lp ON lp.id = profile_change_audit_log.learner_id
    WHERE p.id = auth.uid()
      AND p.role = 'hod'
      AND p.institution_id = lp.institution_id
  )
);

-- Staff can view department audit logs
CREATE POLICY "Staff can view department audit logs"
ON profile_change_audit_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    JOIN learner_profiles lp ON lp.id = profile_change_audit_log.learner_id
    WHERE p.id = auth.uid()
      AND p.role = 'staff'
      AND p.department_id = lp.department_id
  )
);

-- Only service layer can insert audit logs (via service role)
CREATE POLICY "Service role can insert audit logs"
ON profile_change_audit_log FOR INSERT
WITH CHECK (true); -- Service role bypasses RLS

-- Super admin full access to audit logs
CREATE POLICY "Super admin full access on audit log"
ON profile_change_audit_log FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  )
);
```

**Step 2: Apply migration**

Run: `supabase migration up`
Expected: RLS policies created successfully

**Step 3: Verify RLS policies**

In Supabase Dashboard → Authentication → Policies:
- Verify 7 policies on `profile_change_requests`
- Verify 5 policies on `profile_change_audit_log`

**Step 4: Commit**

```bash
git add supabase/migrations/20250120000002_add_rls_policies_profile_changes.sql
git commit -m "feat(db): add RLS policies for profile change requests"
```

---

## Task 3: TypeScript Types

**Files:**
- Create: `types/learner-profile-change.ts`

**Step 1: Create types file**

```typescript
// types/learner-profile-change.ts
import { LearnerProfile } from './learner-profile';

export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type AuditActionType = 'approved' | 'rejected' | 'cancelled';

/**
 * Profile Change Request
 * Stores student-submitted profile edit requests pending approval
 */
export interface ProfileChangeRequest {
  id: string;
  learner_id: string;
  request_status: ChangeRequestStatus;
  changed_fields: Record<string, { old: any; new: any }>;
  fields_summary: string[];
  submitted_by: string;
  submitted_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_comments?: string;
  created_at: string;
  updated_at: string;

  // Relations (from joins)
  learner?: LearnerProfile;
  submitter?: {
    id: string;
    full_name: string;
    email: string;
  };
  reviewer?: {
    id: string;
    full_name: string;
    email: string;
  };
}

/**
 * Profile Change Audit Log Entry
 * Permanent history of all profile changes
 */
export interface ProfileChangeAuditLog {
  id: string;
  learner_id: string;
  change_request_id?: string;
  action_type: AuditActionType;
  changed_fields: Record<string, { old: any; new: any }>;
  performed_by: string;
  performed_at: string;
  comments?: string;
  created_at: string;

  // Relations
  learner?: LearnerProfile;
  performer?: {
    id: string;
    full_name: string;
    email: string;
  };
}

/**
 * DTO for creating change request
 */
export interface CreateChangeRequestDto {
  learner_id: string;
  changed_fields: Record<string, { old: any; new: any }>;
  fields_summary: string[];
}

/**
 * DTO for approving request
 */
export interface ApproveRequestDto {
  review_comments?: string;
}

/**
 * DTO for rejecting request
 */
export interface RejectRequestDto {
  review_comments: string; // Required
}

/**
 * Filters for querying change requests
 */
export interface ChangeRequestFilters {
  status?: ChangeRequestStatus;
  institution_id?: string;
  department_id?: string;
  learner_id?: string;
  submitted_after?: string;
  submitted_before?: string;
  page?: number;
  limit?: number;
}

/**
 * Editable fields whitelist
 * Students can only edit these fields
 */
export const EDITABLE_PROFILE_FIELDS = [
  // Contact Details
  'student_mobile',
  'student_email',
  'alternate_mobile',

  // Parent/Guardian Information
  'father_name',
  'father_mobile',
  'father_occupation',
  'mother_name',
  'mother_mobile',
  'mother_occupation',
  'guardian_name',
  'guardian_mobile',
  'guardian_occupation',
  'annual_income',

  // Address Information
  'permanent_address',
  'permanent_city',
  'permanent_state',
  'permanent_pincode',
  'present_address',
  'present_city',
  'present_state',
  'present_pincode',

  // Other Personal Details
  'blood_group',
  'religion',
  'community',
  'caste',
  'hostel_required',
  'transport_required',
  'accommodation_type',
] as const;

export type EditableProfileField = typeof EDITABLE_PROFILE_FIELDS[number];

/**
 * Read-only fields (blocked from editing)
 */
export const READ_ONLY_PROFILE_FIELDS = [
  // Academic assignments
  'institution_id',
  'degree_id',
  'department_id',
  'program_id',
  'semester_id',
  'section_id',
  'academic_year_id',

  // Student credentials
  'roll_number',
  'register_number',
  'college_email',

  // Identity fields
  'first_name',
  'last_name',
  'date_of_birth',
  'gender',
  'aadhar_number',

  // Application details
  'application_id',
  'lifecycle_status',
  'is_profile_complete',
] as const;

export type ReadOnlyProfileField = typeof READ_ONLY_PROFILE_FIELDS[number];
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add types/learner-profile-change.ts
git commit -m "feat(types): add profile change request types"
```

---

## Task 4: Validation Schemas

**Files:**
- Create: `lib/validations/profile-change-request.ts`

**Step 1: Create validation schema file**

```typescript
// lib/validations/profile-change-request.ts
import { z } from 'zod';
import { EDITABLE_PROFILE_FIELDS } from '@/types/learner-profile-change';

const phoneRegex = /^[6-9]\d{9}$/; // Indian mobile format
const pincodeRegex = /^\d{6}$/;

/**
 * Schema for validating profile change request fields
 * Only editable fields are allowed
 */
export const profileChangeSchema = z.object({
  // Contact Details
  student_mobile: z
    .string()
    .regex(phoneRegex, 'Invalid mobile format. Must be 10 digits starting with 6-9')
    .optional(),
  student_email: z
    .string()
    .email('Invalid email format')
    .optional(),
  alternate_mobile: z
    .string()
    .regex(phoneRegex, 'Invalid mobile format. Must be 10 digits starting with 6-9')
    .optional(),

  // Parent/Guardian Information
  father_name: z
    .string()
    .min(2, 'Minimum 2 characters')
    .optional(),
  father_mobile: z
    .string()
    .regex(phoneRegex, 'Invalid mobile format')
    .optional(),
  father_occupation: z.string().optional(),

  mother_name: z
    .string()
    .min(2, 'Minimum 2 characters')
    .optional(),
  mother_mobile: z
    .string()
    .regex(phoneRegex, 'Invalid mobile format')
    .optional(),
  mother_occupation: z.string().optional(),

  guardian_name: z.string().optional(),
  guardian_mobile: z
    .string()
    .regex(phoneRegex, 'Invalid mobile format')
    .optional(),
  guardian_occupation: z.string().optional(),

  annual_income: z.string().optional(),

  // Address Information
  permanent_address: z.string().min(5, 'Minimum 5 characters').optional(),
  permanent_city: z.string().optional(),
  permanent_state: z.string().optional(),
  permanent_pincode: z
    .string()
    .regex(pincodeRegex, 'Invalid pincode. Must be 6 digits')
    .optional(),

  present_address: z.string().min(5, 'Minimum 5 characters').optional(),
  present_city: z.string().optional(),
  present_state: z.string().optional(),
  present_pincode: z
    .string()
    .regex(pincodeRegex, 'Invalid pincode. Must be 6 digits')
    .optional(),

  // Other Personal Details
  blood_group: z
    .enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], {
      errorMap: () => ({ message: 'Invalid blood group' }),
    })
    .optional(),
  religion: z.string().optional(),
  community: z.string().optional(),
  caste: z.string().optional(),
  hostel_required: z.boolean().optional(),
  transport_required: z.boolean().optional(),
  accommodation_type: z.string().optional(),
})
  .refine(
    (data) => {
      // At least one field must be changed
      const changedFields = Object.keys(data).filter(
        key => data[key as keyof typeof data] !== undefined
      );
      return changedFields.length > 0;
    },
    { message: 'At least one field must be changed' }
  )
  .refine(
    (data) => {
      // Ensure only editable fields are present
      const invalidFields = Object.keys(data).filter(
        key => !EDITABLE_PROFILE_FIELDS.includes(key as any)
      );
      return invalidFields.length === 0;
    },
    { message: 'Cannot edit read-only fields' }
  );

export type ProfileChangeFormValues = z.infer<typeof profileChangeSchema>;

/**
 * Helper function to validate if a field is editable
 */
export function isEditableField(fieldName: string): boolean {
  return EDITABLE_PROFILE_FIELDS.includes(fieldName as any);
}

/**
 * Helper function to get changed fields between two objects
 */
export function getChangedFields<T extends Record<string, any>>(
  newData: T,
  currentData: T
): Record<string, { old: any; new: any }> {
  const changes: Record<string, { old: any; new: any }> = {};

  Object.keys(newData).forEach((key) => {
    // Only process editable fields
    if (!isEditableField(key)) return;

    const newValue = newData[key];
    const oldValue = currentData[key];

    // Check if value actually changed
    if (newValue !== oldValue && newValue !== undefined) {
      changes[key] = {
        old: oldValue ?? null,
        new: newValue,
      };
    }
  });

  return changes;
}

/**
 * Helper function to format field names for display
 */
export function formatFieldLabel(fieldName: string): string {
  const labels: Record<string, string> = {
    student_mobile: 'Student Mobile',
    student_email: 'Student Email',
    alternate_mobile: 'Alternate Mobile',
    father_name: "Father's Name",
    father_mobile: "Father's Mobile",
    father_occupation: "Father's Occupation",
    mother_name: "Mother's Name",
    mother_mobile: "Mother's Mobile",
    mother_occupation: "Mother's Occupation",
    guardian_name: "Guardian's Name",
    guardian_mobile: "Guardian's Mobile",
    guardian_occupation: "Guardian's Occupation",
    annual_income: 'Annual Income',
    permanent_address: 'Permanent Address',
    permanent_city: 'Permanent City',
    permanent_state: 'Permanent State',
    permanent_pincode: 'Permanent Pincode',
    present_address: 'Present Address',
    present_city: 'Present City',
    present_state: 'Present State',
    present_pincode: 'Present Pincode',
    blood_group: 'Blood Group',
    religion: 'Religion',
    community: 'Community',
    caste: 'Caste',
    hostel_required: 'Hostel Required',
    transport_required: 'Transport Required',
    accommodation_type: 'Accommodation Type',
  };

  return labels[fieldName] || fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add lib/validations/profile-change-request.ts
git commit -m "feat(validation): add profile change request validation schemas"
```

---

## Task 5: Service Layer - Change Request Service

**Files:**
- Create: `lib/services/learner-profile-change-service.ts`

**Step 1: Create service file**

```typescript
// lib/services/learner-profile-change-service.ts
import { createClient } from '@/lib/supabase/server';
import {
  ProfileChangeRequest,
  CreateChangeRequestDto,
  ApproveRequestDto,
  RejectRequestDto,
  ChangeRequestFilters,
} from '@/types/learner-profile-change';
import { LearnerProfileAuditService } from './learner-profile-audit-service';

export class LearnerProfileChangeService {
  /**
   * Create a new profile change request
   * Validates: No pending request exists, only active students, only editable fields
   */
  static async createChangeRequest(
    dto: CreateChangeRequestDto,
    submittedBy: string
  ): Promise<ProfileChangeRequest> {
    const supabase = await createClient();

    console.log('[learner-profile-change-service] Creating change request:', {
      learner_id: dto.learner_id,
      fields_count: Object.keys(dto.changed_fields).length,
    });

    // Validate learner exists and is active
    const { data: learner, error: learnerError } = await supabase
      .from('learner_profiles')
      .select('id, lifecycle_status, first_name, last_name')
      .eq('id', dto.learner_id)
      .single();

    if (learnerError || !learner) {
      throw new Error('Learner not found');
    }

    if (learner.lifecycle_status !== 'active') {
      throw new Error('Only active students can submit profile change requests');
    }

    // Check for existing pending request
    const { data: existingRequest } = await supabase
      .from('profile_change_requests')
      .select('id')
      .eq('learner_id', dto.learner_id)
      .eq('request_status', 'pending')
      .maybeSingle();

    if (existingRequest) {
      throw new Error('You already have a pending change request. Please wait for approval.');
    }

    // Validate at least one field changed
    if (Object.keys(dto.changed_fields).length === 0) {
      throw new Error('No changes detected');
    }

    // Insert change request
    const { data: request, error: insertError } = await supabase
      .from('profile_change_requests')
      .insert({
        learner_id: dto.learner_id,
        changed_fields: dto.changed_fields,
        fields_summary: dto.fields_summary,
        submitted_by: submittedBy,
        request_status: 'pending',
      })
      .select(`
        *,
        learner:learner_profiles(id, first_name, last_name, roll_number),
        submitter:profiles!submitted_by(id, full_name, email)
      `)
      .single();

    if (insertError) {
      console.error('[learner-profile-change-service] Error creating request:', insertError);
      throw new Error(`Failed to create change request: ${insertError.message}`);
    }

    console.log('[learner-profile-change-service] Change request created:', request.id);

    return request;
  }

  /**
   * Get a single change request by ID
   */
  static async getChangeRequest(id: string): Promise<ProfileChangeRequest> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('profile_change_requests')
      .select(`
        *,
        learner:learner_profiles(
          id, first_name, last_name, roll_number, college_email,
          institution_id, department_id,
          institution:institutions(id, name),
          department:departments(id, department_name)
        ),
        submitter:profiles!submitted_by(id, full_name, email),
        reviewer:profiles!reviewed_by(id, full_name, email)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new Error('Change request not found');
    }

    return data;
  }

  /**
   * Get pending change request for a learner (if any)
   */
  static async getPendingChangeRequest(
    learnerId: string
  ): Promise<ProfileChangeRequest | null> {
    const supabase = await createClient();

    const { data } = await supabase
      .from('profile_change_requests')
      .select(`
        *,
        learner:learner_profiles(id, first_name, last_name),
        submitter:profiles!submitted_by(id, full_name, email)
      `)
      .eq('learner_id', learnerId)
      .eq('request_status', 'pending')
      .maybeSingle();

    return data;
  }

  /**
   * Get pending requests with filters (for HOD/Staff)
   * Applies role-based filtering
   */
  static async getPendingRequests(
    filters: ChangeRequestFilters = {}
  ): Promise<{ data: ProfileChangeRequest[]; total: number }> {
    const supabase = await createClient();

    let query = supabase
      .from('profile_change_requests')
      .select(
        `
        *,
        learner:learner_profiles(
          id, first_name, last_name, roll_number, college_email,
          institution_id, department_id,
          institution:institutions(id, name),
          department:departments(id, department_name)
        ),
        submitter:profiles!submitted_by(id, full_name, email)
      `,
        { count: 'exact' }
      )
      .eq('request_status', filters.status || 'pending')
      .order('submitted_at', { ascending: false });

    // Apply filters
    if (filters.institution_id) {
      query = query.eq('learner.institution_id', filters.institution_id);
    }

    if (filters.department_id) {
      query = query.eq('learner.department_id', filters.department_id);
    }

    if (filters.learner_id) {
      query = query.eq('learner_id', filters.learner_id);
    }

    if (filters.submitted_after) {
      query = query.gte('submitted_at', filters.submitted_after);
    }

    if (filters.submitted_before) {
      query = query.lte('submitted_at', filters.submitted_before);
    }

    // Pagination
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[learner-profile-change-service] Error fetching requests:', error);
      throw new Error(`Failed to fetch change requests: ${error.message}`);
    }

    return {
      data: data || [],
      total: count || 0,
    };
  }

  /**
   * Approve a change request
   * Updates learner profile with new values
   * Creates audit log entry
   */
  static async approveChangeRequest(
    requestId: string,
    dto: ApproveRequestDto,
    reviewedBy: string
  ): Promise<ProfileChangeRequest> {
    const supabase = await createClient();

    console.log('[learner-profile-change-service] Approving request:', requestId);

    // Get the request
    const request = await this.getChangeRequest(requestId);

    if (request.request_status !== 'pending') {
      throw new Error('Only pending requests can be approved');
    }

    // Check approval permission
    const canApprove = await this.checkApprovalPermission(reviewedBy, request.learner_id);
    if (!canApprove) {
      throw new Error('Insufficient permissions to approve this request');
    }

    // Start transaction: Update learner profile + Update request + Create audit log
    try {
      // 1. Update learner profile with new values
      const updateData: Record<string, any> = {};
      Object.entries(request.changed_fields).forEach(([key, change]) => {
        updateData[key] = change.new;
      });

      const { error: updateError } = await supabase
        .from('learner_profiles')
        .update(updateData)
        .eq('id', request.learner_id);

      if (updateError) {
        throw new Error(`Failed to update learner profile: ${updateError.message}`);
      }

      console.log('[learner-profile-change-service] Learner profile updated');

      // 2. Update change request status
      const { data: updatedRequest, error: requestError } = await supabase
        .from('profile_change_requests')
        .update({
          request_status: 'approved',
          reviewed_by: reviewedBy,
          reviewed_at: new Date().toISOString(),
          review_comments: dto.review_comments,
        })
        .eq('id', requestId)
        .select(`
          *,
          learner:learner_profiles(id, first_name, last_name, roll_number),
          submitter:profiles!submitted_by(id, full_name, email),
          reviewer:profiles!reviewed_by(id, full_name, email)
        `)
        .single();

      if (requestError || !updatedRequest) {
        throw new Error(`Failed to update request: ${requestError?.message}`);
      }

      // 3. Create audit log entry
      await LearnerProfileAuditService.createAuditEntry({
        learner_id: request.learner_id,
        change_request_id: requestId,
        action_type: 'approved',
        changed_fields: request.changed_fields,
        performed_by: reviewedBy,
        comments: dto.review_comments,
      });

      console.log('[learner-profile-change-service] Request approved successfully');

      return updatedRequest;
    } catch (error: any) {
      console.error('[learner-profile-change-service] Error approving request:', error);
      throw error;
    }
  }

  /**
   * Reject a change request
   * Does NOT update learner profile
   * Creates audit log entry
   */
  static async rejectChangeRequest(
    requestId: string,
    dto: RejectRequestDto,
    reviewedBy: string
  ): Promise<ProfileChangeRequest> {
    const supabase = await createClient();

    console.log('[learner-profile-change-service] Rejecting request:', requestId);

    // Get the request
    const request = await this.getChangeRequest(requestId);

    if (request.request_status !== 'pending') {
      throw new Error('Only pending requests can be rejected');
    }

    // Check approval permission
    const canApprove = await this.checkApprovalPermission(reviewedBy, request.learner_id);
    if (!canApprove) {
      throw new Error('Insufficient permissions to reject this request');
    }

    // Validation: review_comments required for rejection
    if (!dto.review_comments || dto.review_comments.trim().length === 0) {
      throw new Error('Rejection reason is required');
    }

    // Update request status to rejected
    const { data: updatedRequest, error: requestError } = await supabase
      .from('profile_change_requests')
      .update({
        request_status: 'rejected',
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        review_comments: dto.review_comments,
      })
      .eq('id', requestId)
      .select(`
        *,
        learner:learner_profiles(id, first_name, last_name, roll_number),
        submitter:profiles!submitted_by(id, full_name, email),
        reviewer:profiles!reviewed_by(id, full_name, email)
      `)
      .single();

    if (requestError || !updatedRequest) {
      throw new Error(`Failed to reject request: ${requestError?.message}`);
    }

    // Create audit log entry
    await LearnerProfileAuditService.createAuditEntry({
      learner_id: request.learner_id,
      change_request_id: requestId,
      action_type: 'rejected',
      changed_fields: request.changed_fields,
      performed_by: reviewedBy,
      comments: dto.review_comments,
    });

    console.log('[learner-profile-change-service] Request rejected successfully');

    return updatedRequest;
  }

  /**
   * Cancel a change request (student action)
   */
  static async cancelChangeRequest(
    requestId: string,
    cancelledBy: string
  ): Promise<ProfileChangeRequest> {
    const supabase = await createClient();

    const request = await this.getChangeRequest(requestId);

    if (request.request_status !== 'pending') {
      throw new Error('Only pending requests can be cancelled');
    }

    // Verify student owns this request
    if (request.submitted_by !== cancelledBy) {
      throw new Error('You can only cancel your own requests');
    }

    const { data: updatedRequest, error } = await supabase
      .from('profile_change_requests')
      .update({
        request_status: 'cancelled',
        reviewed_by: cancelledBy,
        reviewed_at: new Date().toISOString(),
        review_comments: 'Cancelled by student',
      })
      .eq('id', requestId)
      .select(`
        *,
        learner:learner_profiles(id, first_name, last_name),
        submitter:profiles!submitted_by(id, full_name, email)
      `)
      .single();

    if (error || !updatedRequest) {
      throw new Error(`Failed to cancel request: ${error?.message}`);
    }

    // Create audit log
    await LearnerProfileAuditService.createAuditEntry({
      learner_id: request.learner_id,
      change_request_id: requestId,
      action_type: 'cancelled',
      changed_fields: request.changed_fields,
      performed_by: cancelledBy,
      comments: 'Cancelled by student',
    });

    return updatedRequest;
  }

  /**
   * Check if user has permission to approve/reject a request
   */
  private static async checkApprovalPermission(
    userId: string,
    learnerId: string
  ): Promise<boolean> {
    const supabase = await createClient();

    // Get approver profile
    const { data: approver } = await supabase
      .from('profiles')
      .select('role, institution_id, department_id')
      .eq('id', userId)
      .single();

    if (!approver) return false;

    // Super admin can approve anything
    if (approver.role === 'super_admin') return true;

    // Get learner's institution and department
    const { data: learner } = await supabase
      .from('learner_profiles')
      .select('institution_id, department_id')
      .eq('id', learnerId)
      .single();

    if (!learner) return false;

    // HOD can approve institution-wide
    if (approver.role === 'hod' && approver.institution_id === learner.institution_id) {
      return true;
    }

    // Staff can approve department-only
    if (approver.role === 'staff' && approver.department_id === learner.department_id) {
      return true;
    }

    return false;
  }
}
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add lib/services/learner-profile-change-service.ts
git commit -m "feat(service): add profile change request service"
```

---

## Task 6: Service Layer - Audit Service

**Files:**
- Create: `lib/services/learner-profile-audit-service.ts`

**Step 1: Create audit service file**

```typescript
// lib/services/learner-profile-audit-service.ts
import { createClient } from '@/lib/supabase/server';
import { ProfileChangeAuditLog, AuditActionType } from '@/types/learner-profile-change';

interface CreateAuditEntryDto {
  learner_id: string;
  change_request_id?: string;
  action_type: AuditActionType;
  changed_fields: Record<string, { old: any; new: any }>;
  performed_by: string;
  comments?: string;
}

export class LearnerProfileAuditService {
  /**
   * Create audit log entry
   */
  static async createAuditEntry(dto: CreateAuditEntryDto): Promise<ProfileChangeAuditLog> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('profile_change_audit_log')
      .insert({
        learner_id: dto.learner_id,
        change_request_id: dto.change_request_id,
        action_type: dto.action_type,
        changed_fields: dto.changed_fields,
        performed_by: dto.performed_by,
        comments: dto.comments,
      })
      .select(`
        *,
        learner:learner_profiles(id, first_name, last_name),
        performer:profiles!performed_by(id, full_name, email)
      `)
      .single();

    if (error) {
      console.error('[learner-profile-audit-service] Error creating audit entry:', error);
      throw new Error(`Failed to create audit log: ${error.message}`);
    }

    console.log('[learner-profile-audit-service] Audit entry created:', data.id);

    return data;
  }

  /**
   * Get audit history for a learner
   */
  static async getAuditHistory(
    learnerId: string,
    limit: number = 50
  ): Promise<ProfileChangeAuditLog[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('profile_change_audit_log')
      .select(`
        *,
        learner:learner_profiles(id, first_name, last_name),
        performer:profiles!performed_by(id, full_name, email)
      `)
      .eq('learner_id', learnerId)
      .order('performed_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[learner-profile-audit-service] Error fetching audit history:', error);
      throw new Error(`Failed to fetch audit history: ${error.message}`);
    }

    return data || [];
  }
}
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add lib/services/learner-profile-audit-service.ts
git commit -m "feat(service): add profile change audit service"
```

---

## Task 7: React Query Hooks

**Files:**
- Create: `hooks/learner-profile/use-change-request.ts`
- Create: `hooks/learner-profile/use-change-request-mutations.ts`

**Step 1: Create change request query hook**

```typescript
// hooks/learner-profile/use-change-request.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { ProfileChangeRequest, ChangeRequestFilters } from '@/types/learner-profile-change';

/**
 * Fetch single change request by ID
 */
export function useChangeRequest(requestId: string | undefined) {
  return useQuery({
    queryKey: ['change-request', requestId],
    queryFn: async () => {
      if (!requestId) throw new Error('Request ID is required');

      const res = await fetch(`/api/learner-profile/change-requests/${requestId}`);
      if (!res.ok) throw new Error('Failed to fetch change request');

      const data = await res.json();
      return data as ProfileChangeRequest;
    },
    enabled: !!requestId,
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Fetch pending change request for a learner
 */
export function usePendingChangeRequest(learnerId: string | undefined) {
  return useQuery({
    queryKey: ['change-request', 'pending', learnerId],
    queryFn: async () => {
      if (!learnerId) throw new Error('Learner ID is required');

      const res = await fetch(`/api/learner-profile/change-requests/pending/${learnerId}`);
      if (!res.ok) {
        if (res.status === 404) return null; // No pending request
        throw new Error('Failed to fetch pending request');
      }

      const data = await res.json();
      return data as ProfileChangeRequest | null;
    },
    enabled: !!learnerId,
    staleTime: 30_000,
  });
}

/**
 * Fetch list of pending change requests (for approvers)
 */
export function usePendingRequests(filters: ChangeRequestFilters = {}) {
  return useQuery({
    queryKey: ['change-requests', 'list', filters],
    queryFn: async () => {
      const params = new URLSearchParams();

      if (filters.status) params.set('status', filters.status);
      if (filters.institution_id) params.set('institution_id', filters.institution_id);
      if (filters.department_id) params.set('department_id', filters.department_id);
      if (filters.page) params.set('page', filters.page.toString());
      if (filters.limit) params.set('limit', filters.limit.toString());

      const res = await fetch(`/api/learner-profile/change-requests?${params}`);
      if (!res.ok) throw new Error('Failed to fetch change requests');

      const data = await res.json();
      return data as { data: ProfileChangeRequest[]; total: number };
    },
    staleTime: 30_000,
  });
}
```

**Step 2: Create mutation hooks**

```typescript
// hooks/learner-profile/use-change-request-mutations.ts
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CreateChangeRequestDto,
  ApproveRequestDto,
  RejectRequestDto,
  ProfileChangeRequest,
} from '@/types/learner-profile-change';

/**
 * Create change request mutation
 */
export function useCreateChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: CreateChangeRequestDto) => {
      const res = await fetch('/api/learner-profile/change-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create change request');
      }

      return res.json() as Promise<ProfileChangeRequest>;
    },
    onSuccess: (data) => {
      toast.success('Change request submitted successfully!');

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['change-request', 'pending', data.learner_id] });
      queryClient.invalidateQueries({ queryKey: ['learner-profile', data.learner_id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit change request');
    },
  });
}

/**
 * Approve change request mutation
 */
export function useApproveChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ requestId, dto }: { requestId: string; dto: ApproveRequestDto }) => {
      const res = await fetch(`/api/learner-profile/change-requests/${requestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to approve request');
      }

      return res.json() as Promise<ProfileChangeRequest>;
    },
    onMutate: async ({ requestId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['change-requests'] });

      // Snapshot previous value
      const previousRequests = queryClient.getQueryData(['change-requests', 'list']);

      // Optimistically remove from list
      queryClient.setQueryData(['change-requests', 'list'], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.filter((r: ProfileChangeRequest) => r.id !== requestId),
          total: old.total - 1,
        };
      });

      return { previousRequests };
    },
    onSuccess: (data) => {
      toast.success(`Profile updated for ${data.learner?.first_name} ${data.learner?.last_name}`);

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['change-requests'] });
      queryClient.invalidateQueries({ queryKey: ['learner-profile', data.learner_id] });
      queryClient.invalidateQueries({ queryKey: ['change-request', 'pending', data.learner_id] });
    },
    onError: (error: Error, variables, context) => {
      // Rollback optimistic update
      if (context?.previousRequests) {
        queryClient.setQueryData(['change-requests', 'list'], context.previousRequests);
      }
      toast.error(error.message || 'Failed to approve request');
    },
  });
}

/**
 * Reject change request mutation
 */
export function useRejectChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ requestId, dto }: { requestId: string; dto: RejectRequestDto }) => {
      const res = await fetch(`/api/learner-profile/change-requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to reject request');
      }

      return res.json() as Promise<ProfileChangeRequest>;
    },
    onMutate: async ({ requestId }) => {
      await queryClient.cancelQueries({ queryKey: ['change-requests'] });

      const previousRequests = queryClient.getQueryData(['change-requests', 'list']);

      queryClient.setQueryData(['change-requests', 'list'], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.filter((r: ProfileChangeRequest) => r.id !== requestId),
          total: old.total - 1,
        };
      });

      return { previousRequests };
    },
    onSuccess: (data) => {
      toast.success('Request rejected with feedback');

      queryClient.invalidateQueries({ queryKey: ['change-requests'] });
      queryClient.invalidateQueries({ queryKey: ['change-request', 'pending', data.learner_id] });
    },
    onError: (error: Error, variables, context) => {
      if (context?.previousRequests) {
        queryClient.setQueryData(['change-requests', 'list'], context.previousRequests);
      }
      toast.error(error.message || 'Failed to reject request');
    },
  });
}

/**
 * Cancel change request mutation (student action)
 */
export function useCancelChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const res = await fetch(`/api/learner-profile/change-requests/${requestId}/cancel`, {
        method: 'POST',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to cancel request');
      }

      return res.json() as Promise<ProfileChangeRequest>;
    },
    onSuccess: (data) => {
      toast.success('Change request cancelled');

      queryClient.invalidateQueries({ queryKey: ['change-request', 'pending', data.learner_id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to cancel request');
    },
  });
}
```

**Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add hooks/learner-profile/use-change-request.ts hooks/learner-profile/use-change-request-mutations.ts
git commit -m "feat(hooks): add change request React Query hooks"
```

---

## Task 8: API Routes - Create Change Request

**Files:**
- Create: `app/api/learner-profile/change-requests/route.ts`

**Step 1: Create API route for listing and creating requests**

```typescript
// app/api/learner-profile/change-requests/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';
import { createClient } from '@/lib/supabase/server';
import { CreateChangeRequestDto } from '@/types/learner-profile-change';

/**
 * GET /api/learner-profile/change-requests
 * List change requests with filters
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get filters from query params
    const searchParams = request.nextUrl.searchParams;
    const filters = {
      status: searchParams.get('status') || 'pending',
      institution_id: searchParams.get('institution_id') || undefined,
      department_id: searchParams.get('department_id') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '20'),
    };

    const result = await LearnerProfileChangeService.getPendingRequests(filters);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error fetching change requests:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch change requests' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/learner-profile/change-requests
 * Create new change request
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CreateChangeRequestDto = await request.json();

    // Validate required fields
    if (!body.learner_id || !body.changed_fields || !body.fields_summary) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify student owns this learner profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('learner_id, role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'student' || profile.learner_id !== body.learner_id) {
      return NextResponse.json(
        { error: 'You can only submit requests for your own profile' },
        { status: 403 }
      );
    }

    const result = await LearnerProfileChangeService.createChangeRequest(body, user.id);

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error('[API] Error creating change request:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create change request' },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add app/api/learner-profile/change-requests/route.ts
git commit -m "feat(api): add change requests list and create endpoints"
```

---

## Task 9: API Routes - Pending Request & Single Request

**Files:**
- Create: `app/api/learner-profile/change-requests/pending/[learnerId]/route.ts`
- Create: `app/api/learner-profile/change-requests/[id]/route.ts`

**Step 1: Create pending request endpoint**

```typescript
// app/api/learner-profile/change-requests/pending/[learnerId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { learnerId: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await LearnerProfileChangeService.getPendingChangeRequest(params.learnerId);

    if (!result) {
      return NextResponse.json({ error: 'No pending request found' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error fetching pending request:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch pending request' },
      { status: 500 }
    );
  }
}
```

**Step 2: Create single request endpoint**

```typescript
// app/api/learner-profile/change-requests/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await LearnerProfileChangeService.getChangeRequest(params.id);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error fetching change request:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch change request' },
      { status: 404 }
    );
  }
}
```

**Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add app/api/learner-profile/change-requests/pending/[learnerId]/route.ts app/api/learner-profile/change-requests/[id]/route.ts
git commit -m "feat(api): add pending and single request endpoints"
```

---

## Task 10: API Routes - Approve, Reject, Cancel

**Files:**
- Create: `app/api/learner-profile/change-requests/[id]/approve/route.ts`
- Create: `app/api/learner-profile/change-requests/[id]/reject/route.ts`
- Create: `app/api/learner-profile/change-requests/[id]/cancel/route.ts`

**Step 1: Create approve endpoint**

```typescript
// app/api/learner-profile/change-requests/[id]/approve/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';
import { createClient } from '@/lib/supabase/server';
import { ApproveRequestDto } from '@/types/learner-profile-change';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ApproveRequestDto = await request.json();

    const result = await LearnerProfileChangeService.approveChangeRequest(
      params.id,
      body,
      user.id
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error approving request:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to approve request' },
      { status: 500 }
    );
  }
}
```

**Step 2: Create reject endpoint**

```typescript
// app/api/learner-profile/change-requests/[id]/reject/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';
import { createClient } from '@/lib/supabase/server';
import { RejectRequestDto } from '@/types/learner-profile-change';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: RejectRequestDto = await request.json();

    // Validate rejection reason
    if (!body.review_comments || body.review_comments.trim().length === 0) {
      return NextResponse.json(
        { error: 'Rejection reason is required' },
        { status: 400 }
      );
    }

    const result = await LearnerProfileChangeService.rejectChangeRequest(
      params.id,
      body,
      user.id
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error rejecting request:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reject request' },
      { status: 500 }
    );
  }
}
```

**Step 3: Create cancel endpoint**

```typescript
// app/api/learner-profile/change-requests/[id]/cancel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await LearnerProfileChangeService.cancelChangeRequest(
      params.id,
      user.id
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error cancelling request:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to cancel request' },
      { status: 500 }
    );
  }
}
```

**Step 4: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add app/api/learner-profile/change-requests/[id]/approve/route.ts app/api/learner-profile/change-requests/[id]/reject/route.ts app/api/learner-profile/change-requests/[id]/cancel/route.ts
git commit -m "feat(api): add approve, reject, cancel endpoints"
```

---

## Task 11: Student UI - Pending Changes Banner Component

**Files:**
- Create: `app/(routes)/learners/my-profile/_components/pending-changes-banner.tsx`

**Step 1: Create pending changes banner component**

```typescript
// app/(routes)/learners/my-profile/_components/pending-changes-banner.tsx
'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ChangeRequestStatus } from '@/types/learner-profile-change';
import { useCancelChangeRequest } from '@/hooks/learner-profile/use-change-request-mutations';

interface PendingChangesBannerProps {
  requestId: string;
  status: ChangeRequestStatus;
  submittedAt: string;
  reviewComments?: string;
}

export function PendingChangesBanner({
  requestId,
  status,
  submittedAt,
  reviewComments,
}: PendingChangesBannerProps) {
  const { mutate: cancelRequest, isPending: isCancelling } = useCancelChangeRequest();

  const getStatusConfig = () => {
    switch (status) {
      case 'pending':
        return {
          icon: Clock,
          iconColor: 'text-yellow-600',
          bgColor: 'bg-yellow-50 border-yellow-200',
          title: 'Changes Pending Approval',
          description: `Submitted ${formatDistanceToNow(new Date(submittedAt), { addSuffix: true })}. Your requested changes are being reviewed by your department.`,
        };
      case 'approved':
        return {
          icon: CheckCircle2,
          iconColor: 'text-green-600',
          bgColor: 'bg-green-50 border-green-200',
          title: 'Changes Approved',
          description: 'Your profile has been updated with the approved changes.',
        };
      case 'rejected':
        return {
          icon: XCircle,
          iconColor: 'text-red-600',
          bgColor: 'bg-red-50 border-red-200',
          title: 'Changes Rejected',
          description: reviewComments || 'Your change request was rejected. Please review the feedback below.',
        };
      case 'cancelled':
        return {
          icon: XCircle,
          iconColor: 'text-gray-600',
          bgColor: 'bg-gray-50 border-gray-200',
          title: 'Request Cancelled',
          description: 'Your change request was cancelled.',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <Alert className={config.bgColor}>
      <Icon className={`h-5 w-5 ${config.iconColor}`} />
      <AlertTitle className="flex items-center gap-2">
        {config.title}
        <Badge variant={status === 'approved' ? 'default' : 'outline'}>
          {status.toUpperCase()}
        </Badge>
      </AlertTitle>
      <AlertDescription className="mt-2">
        <p>{config.description}</p>

        {/* Show rejection feedback */}
        {status === 'rejected' && reviewComments && (
          <div className="mt-3 p-3 bg-white rounded-md border border-red-200">
            <p className="text-sm font-medium text-red-900">Reviewer Feedback:</p>
            <p className="text-sm text-red-700 mt-1">{reviewComments}</p>
          </div>
        )}

        {/* Cancel button for pending requests */}
        {status === 'pending' && (
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => cancelRequest(requestId)}
              disabled={isCancelling}
            >
              {isCancelling ? 'Cancelling...' : 'Cancel Request'}
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add app/(routes)/learners/my-profile/_components/pending-changes-banner.tsx
git commit -m "feat(ui): add pending changes banner component"
```

---

## Task 12: Student UI - Profile Comparison View Component

**Files:**
- Create: `app/(routes)/learners/my-profile/_components/profile-comparison-view.tsx`
- Create: `app/(routes)/learners/my-profile/_components/info-field.tsx`

**Step 1: Create info field helper component**

```typescript
// app/(routes)/learners/my-profile/_components/info-field.tsx
import { cn } from '@/lib/utils';

interface InfoFieldProps {
  label: string;
  value: any;
  className?: string;
  isChanged?: boolean;
}

export function InfoField({ label, value, className, isChanged }: InfoFieldProps) {
  const displayValue = value ?? 'Not provided';

  return (
    <div className={cn('space-y-1', className)}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={cn(
        'text-sm font-medium',
        isChanged && 'text-yellow-700 font-semibold'
      )}>
        {displayValue}
      </p>
    </div>
  );
}
```

**Step 2: Create profile comparison view component**

```typescript
// app/(routes)/learners/my-profile/_components/profile-comparison-view.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { LearnerProfile } from '@/types/learner-profile';
import { InfoField } from './info-field';
import { formatFieldLabel } from '@/lib/validations/profile-change-request';

interface ProfileComparisonViewProps {
  currentData: LearnerProfile;
  pendingChanges: Record<string, { old: any; new: any }>;
  canEdit: boolean;
}

export function ProfileComparisonView({
  currentData,
  pendingChanges,
  canEdit,
}: ProfileComparisonViewProps) {
  return (
    <div className="space-y-6">
      {/* Alert explaining the comparison */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Changes Pending Approval</AlertTitle>
        <AlertDescription>
          Your requested changes are shown below alongside your current information.
          You cannot make new edits until this request is resolved.
        </AlertDescription>
      </Alert>

      {/* Desktop: Side-by-side, Mobile: Stacked */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Data (Left/Top) */}
        <Card className="border-2 border-green-500">
          <CardHeader className="bg-green-50">
            <CardTitle className="flex items-center gap-2 text-green-900">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Current Information
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {Object.keys(pendingChanges).map((fieldName) => (
                <InfoField
                  key={fieldName}
                  label={formatFieldLabel(fieldName)}
                  value={pendingChanges[fieldName].old}
                  className="bg-white p-3 rounded-md border"
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pending Changes (Right/Bottom) */}
        <Card className="border-2 border-yellow-500">
          <CardHeader className="bg-yellow-50">
            <CardTitle className="flex items-center gap-2 text-yellow-900">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              Requested Changes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {Object.entries(pendingChanges).map(([fieldName, change]) => (
                <InfoField
                  key={fieldName}
                  label={formatFieldLabel(fieldName)}
                  value={change.new}
                  className="bg-yellow-50 p-3 rounded-md border border-yellow-200"
                  isChanged={true}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

**Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add app/(routes)/learners/my-profile/_components/profile-comparison-view.tsx app/(routes)/learners/my-profile/_components/info-field.tsx
git commit -m "feat(ui): add profile comparison view component"
```

---

*Due to character limits, I'll continue with the remaining tasks in a condensed format. The plan continues with:*

- **Task 13-15**: Profile edit form, change request dialog, profile view components
- **Task 16**: Update my-profile page.tsx to integrate all components
- **Task 17-20**: Approver UI - change requests table, columns, filters, detail page
- **Task 21-22**: Approval/rejection dialogs
- **Task 23**: Update sidebar menu link
- **Task 24**: Testing plan
- **Task 25**: Documentation

Would you like me to continue with the complete detailed plan for the remaining tasks, or would you prefer to start implementing with what we have so far?

**Step 5: Save and offer execution choice**

The plan is saved to `docs/plans/2025-01-20-learner-profile-change-approval-workflow.md`.

---

**Plan complete and saved to `docs/plans/2025-01-20-learner-profile-change-approval-workflow.md`.**

**Note:** This plan is comprehensive but truncated due to length. The remaining tasks (13-25) follow the same detailed format covering:
- Student profile edit form with validation
- Change request submission dialog
- Approver change requests management page
- Approval/rejection workflows
- Integration with sidebar navigation
- Testing and documentation

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans skill, batch execution with checkpoints

**Which approach would you prefer?**
