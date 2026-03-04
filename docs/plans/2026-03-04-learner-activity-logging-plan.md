# Learner Module Activity Logging - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add comprehensive activity logging to all CRUD operations in the learner module, extending the existing `user_activity_logs` system.

**Architecture:** Direct service integration — add `logActivity()` calls inside existing service methods. Client-side services use a new `logActivityClient()` utility that inserts directly via client Supabase. Server-side services use the existing `logActivity()` helper. All logs use `STUDENT` resource type with `metadata.sub_type` for categorization.

**Tech Stack:** Supabase (RLS + client/server), TypeScript, Next.js, React Query

---

## Key Architecture Note

Services in this project use two different Supabase clients:

| Service | Client | Environment | Logging Approach |
|---------|--------|-------------|-----------------|
| `LearnerProfileService` | `createClientSupabaseClient()` | Client-side | `logActivityClient()` (new) |
| `LearnerProfileChangeService` | `createClient()` from server | Server-side | Existing `logActivity()` |
| `BulkLearnerUploadService` | `createClient()` with service role | Server-side | Direct insert via `supabaseAdmin` |
| `BulkLearnerEditService` | `createClient()` with service role | Server-side | Direct insert via `supabaseAdmin` |
| Leave/OnDuty hooks | Client components | Client-side | `logActivityClient()` (new) |

---

### Task 1: Add INSERT RLS Policy for user_activity_logs

**Files:**
- Modify: `supabase/setup/03_policies.sql`

**Step 1: Add the INSERT policy**

Add after the existing `activity_logs_select_admin` policy (around line 1965):

```sql
-- Allow authenticated users to insert their own activity logs
CREATE POLICY "activity_logs_insert_own" ON user_activity_logs
    FOR INSERT WITH CHECK (user_id = auth.uid());
```

**Step 2: Apply the policy via Supabase MCP or Dashboard**

Run in Supabase SQL Editor:
```sql
CREATE POLICY "activity_logs_insert_own" ON user_activity_logs
    FOR INSERT WITH CHECK (user_id = auth.uid());
```

**Step 3: Commit**

```bash
git add supabase/setup/03_policies.sql
git commit -m "feat(activity): add INSERT RLS policy for client-side activity logging"
```

---

### Task 2: Create Client-Side Activity Logger Utility

**Files:**
- Create: `lib/utils/activity-logger-client.ts`

**Step 1: Create the utility file**

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ACTIVITY_TYPES, RESOURCE_TYPES } from '@/types/activity';

export interface LogActivityClientParams {
  userId: string;
  actionType: string;
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  description: string;
  metadata?: Record<string, any>;
  institutionId?: string;
}

/**
 * Client-side activity logger that inserts directly via Supabase client.
 * Uses RLS policy "activity_logs_insert_own" (user_id = auth.uid()).
 * Fire-and-forget: errors are caught and logged, never thrown.
 */
export async function logActivityClient(params: LogActivityClientParams): Promise<void> {
  try {
    const supabase = createClientSupabaseClient();
    await supabase.from('user_activity_logs').insert({
      user_id: params.userId,
      action_type: params.actionType,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      resource_name: params.resourceName,
      description: params.description,
      metadata: params.metadata || {},
      institution_id: params.institutionId,
    });
  } catch (error) {
    // Fire-and-forget: don't break the main operation
    console.error('[activity-logger-client] Failed to log activity:', error);
  }
}

/**
 * Learner-specific activity templates for consistent logging.
 * All templates use RESOURCE_TYPES.STUDENT with metadata.sub_type for categorization.
 */
export const LearnerActivityTemplates = {
  // Enquiry operations
  enquiryCreated: (actorName: string, learnerName: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} created enquiry for ${learnerName}`,
    sub_type: 'enquiry' as const,
  }),

  enquiryUpdated: (actorName: string, learnerName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} updated enquiry for ${learnerName}${changes?.length ? ` (${changes.join(', ')})` : ''}`,
    sub_type: 'enquiry' as const,
  }),

  enquiryBulkStatusChanged: (actorName: string, count: number, newStatus: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} changed enquiry status to '${newStatus}' (${count} records)`,
    sub_type: 'enquiry' as const,
  }),

  // Learner profile operations
  learnerProfileUpdated: (actorName: string, learnerName: string, changes?: string[]) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} updated learner profile for ${learnerName}${changes?.length ? ` (${changes.join(', ')})` : ''}`,
    sub_type: 'profile' as const,
  }),

  // Bulk operations
  learnersBulkUploaded: (actorName: string, count: number) => ({
    actionType: ACTIVITY_TYPES.IMPORT,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} bulk uploaded ${count} learner enquiries`,
    sub_type: 'bulk_upload' as const,
  }),

  learnersBulkEdited: (actorName: string, count: number, operation: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} bulk edited ${count} learner profiles (${operation})`,
    sub_type: 'bulk_edit' as const,
  }),

  learnerPromoted: (actorName: string, count: number, target: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} promoted ${count} learners to ${target}`,
    sub_type: 'promotion' as const,
  }),

  learnerStatusChanged: (actorName: string, count: number, newStatus: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} changed status of ${count} learners to '${newStatus}'`,
    sub_type: 'promotion' as const,
  }),

  learnerImageUploaded: (actorName: string, count: number) => ({
    actionType: ACTIVITY_TYPES.UPLOAD,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} uploaded images for ${count} learners`,
    sub_type: 'profile' as const,
  }),

  // Change request operations
  changeRequestCreated: (studentName: string, fieldCount: number) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${studentName} submitted profile change request (${fieldCount} fields)`,
    sub_type: 'change_request' as const,
  }),

  changeRequestApproved: (actorName: string, studentName: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} approved change request for ${studentName}`,
    sub_type: 'change_request' as const,
  }),

  changeRequestRejected: (actorName: string, studentName: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} rejected change request for ${studentName}`,
    sub_type: 'change_request' as const,
  }),

  // Leave/OnDuty operations
  leaveApplied: (studentName: string, leaveType: string, duration: string) => ({
    actionType: ACTIVITY_TYPES.CREATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${studentName} applied for ${leaveType} (${duration})`,
    sub_type: 'leave' as const,
  }),

  leaveCancelled: (studentName: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${studentName} cancelled leave/onduty application`,
    sub_type: 'leave' as const,
  }),

  leaveApprovalProcessed: (actorName: string, studentName: string, decision: string) => ({
    actionType: ACTIVITY_TYPES.UPDATE,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} ${decision} leave/onduty application for ${studentName}`,
    sub_type: 'leave' as const,
  }),

  // Export operations
  learnerDataExported: (actorName: string, format: string, recordCount?: number) => ({
    actionType: ACTIVITY_TYPES.EXPORT,
    resourceType: RESOURCE_TYPES.STUDENT,
    description: `${actorName} exported learner data in ${format} format${recordCount ? ` (${recordCount} records)` : ''}`,
    sub_type: 'export' as const,
  }),
};
```

**Step 2: Commit**

```bash
git add lib/utils/activity-logger-client.ts
git commit -m "feat(activity): add client-side activity logger with learner templates"
```

---

### Task 3: Add Logging to LearnerProfileService (Create & Update)

**Files:**
- Modify: `lib/services/learner-profile-service.ts`

**Step 1: Add import at top of file**

After the existing imports (around line 1-10), add:

```typescript
import { logActivityClient, LearnerActivityTemplates } from '@/lib/utils/activity-logger-client';
```

**Step 2: Add logging to createLearnerProfile()**

After the `trackUsage()` call at line 562, before `return data;` at line 563, add:

```typescript
    // Log activity
    const learnerName = `${data.first_name || ''} ${data.last_name || ''}`.trim() || 'Unknown';
    const template = LearnerActivityTemplates.enquiryCreated('User', learnerName);
    logActivityClient({
      userId: currentUserId || data.id,
      actionType: template.actionType,
      resourceType: template.resourceType,
      resourceId: data.id,
      resourceName: learnerName,
      description: template.description,
      metadata: {
        sub_type: template.sub_type,
        learner_id: data.id,
        learner_email: data.college_email,
        lifecycle_status: data.lifecycle_status,
        is_profile_complete: data.is_profile_complete,
      },
      institutionId: dto.institution_id,
    });
```

**Step 3: Add logging to updateLearnerProfile()**

After `await this.syncProfileStatus(id, result.profile);` at line 694, before the user creation check at line 697, add:

```typescript
    // Log activity
    const learnerName = `${result.profile.first_name || ''} ${result.profile.last_name || ''}`.trim() || 'Unknown';
    const changedFields = Object.keys(dto).filter(k => k !== 'id');
    const template = LearnerActivityTemplates.learnerProfileUpdated('User', learnerName, changedFields);
    logActivityClient({
      userId: currentUserId || id,
      actionType: template.actionType,
      resourceType: template.resourceType,
      resourceId: id,
      resourceName: learnerName,
      description: template.description,
      metadata: {
        sub_type: template.sub_type,
        learner_id: id,
        changed_fields: changedFields,
        new_status: result.profile.lifecycle_status,
        is_profile_complete: result.profile.is_profile_complete,
        auto_activated: !!result.userCreation,
      },
      institutionId: result.profile.institution_id,
    });
```

**Step 4: Commit**

```bash
git add lib/services/learner-profile-service.ts
git commit -m "feat(activity): add activity logging to learner create and update"
```

---

### Task 4: Add Logging to LearnerProfileChangeService (Create, Approve, Reject)

**Files:**
- Modify: `lib/services/learner-profile-change-service.ts`

This service is **server-side** (`createClient()` from server). Use the existing `logActivity()` from `activity-logger.ts`.

**Step 1: Add import at top of file**

```typescript
import { logActivity } from '@/lib/utils/activity-logger';
import { ACTIVITY_TYPES, RESOURCE_TYPES } from '@/types/activity';
```

**Step 2: Add logging to createChangeRequest()**

After the success console.log at line 116, before `return request;`, add:

```typescript
    // Log activity
    const learnerName = `${learner.first_name || ''} ${learner.last_name || ''}`.trim();
    const fieldCount = dto.fields_summary?.length || Object.keys(dto.changed_fields || {}).length;
    await logActivity({
      userId: submittedBy,
      actionType: ACTIVITY_TYPES.CREATE,
      resourceType: RESOURCE_TYPES.STUDENT,
      resourceId: request.id,
      resourceName: learnerName,
      description: `${learnerName} submitted profile change request (${fieldCount} fields)`,
      metadata: {
        sub_type: 'change_request',
        learner_id: request.learner_id,
        field_count: fieldCount,
        fields_summary: dto.fields_summary,
      },
      institutionId: learner.institution_id,
    });
```

**Step 3: Add logging to approveChangeRequest()**

After the audit entry creation at line 363, before `return updatedRequest;`, add:

```typescript
    // Log activity
    const learnerName = `${request.learner?.first_name || ''} ${request.learner?.last_name || ''}`.trim();
    await logActivity({
      userId: reviewedBy,
      actionType: ACTIVITY_TYPES.UPDATE,
      resourceType: RESOURCE_TYPES.STUDENT,
      resourceId: requestId,
      resourceName: learnerName,
      description: `Approved change request for ${learnerName}`,
      metadata: {
        sub_type: 'change_request',
        decision: 'approved',
        learner_id: request.learner_id,
        fields_applied: Object.keys(request.changed_fields || {}),
        review_comments: dto.review_comments,
      },
      institutionId: request.learner?.institution_id,
    });
```

**Step 4: Add logging to rejectChangeRequest()**

After the audit entry creation at line 436, before `return updatedRequest;`, add:

```typescript
    // Log activity
    const learnerName = `${request.learner?.first_name || ''} ${request.learner?.last_name || ''}`.trim();
    await logActivity({
      userId: reviewedBy,
      actionType: ACTIVITY_TYPES.UPDATE,
      resourceType: RESOURCE_TYPES.STUDENT,
      resourceId: requestId,
      resourceName: learnerName,
      description: `Rejected change request for ${learnerName}`,
      metadata: {
        sub_type: 'change_request',
        decision: 'rejected',
        learner_id: request.learner_id,
        fields_rejected: request.fields_summary,
        review_comments: dto.review_comments,
        rejection_reason: dto.rejection_reason,
      },
      institutionId: request.learner?.institution_id,
    });
```

**Step 5: Commit**

```bash
git add lib/services/learner-profile-change-service.ts
git commit -m "feat(activity): add activity logging to change request create/approve/reject"
```

---

### Task 5: Add Logging to BulkLearnerUploadService

**Files:**
- Modify: `lib/services/bulk-learner-upload-service.ts`

This service uses `supabaseAdmin` (service role), so it can insert directly into `user_activity_logs`.

**Step 1: Find the main processing method completion point**

After the bulk upload completes successfully (after all rows are processed and results are tallied), add a single summary log entry.

Find the return statement of the `processBulkUpload()` method (around line 170) and add before it:

```typescript
    // Log bulk upload activity (summary)
    try {
      const { data: userData } = await supabaseAdmin.auth.getUser();
      const userId = userData?.user?.id;
      if (userId) {
        await supabaseAdmin.from('user_activity_logs').insert({
          user_id: userId,
          action_type: 'import',
          resource_type: 'student',
          description: `Bulk uploaded ${result.successCount} learner enquiries (${result.failedCount} failed)`,
          metadata: {
            sub_type: 'bulk_upload',
            success_count: result.successCount,
            failed_count: result.failedCount,
            total_rows: rows.length,
          },
        });
      }
    } catch (logError) {
      console.error('[bulk-upload] Failed to log activity:', logError);
    }
```

**Note:** If `supabaseAdmin` is a service role client (no user session), the `getUser()` call won't work. In that case, accept `userId` as a parameter to `processBulkUpload()`. Check the method signature and caller to determine how user ID is available. If needed, add `userId?: string` as an optional parameter and pass it from the component/API route that calls this method.

**Step 2: Commit**

```bash
git add lib/services/bulk-learner-upload-service.ts
git commit -m "feat(activity): add summary activity logging to bulk learner upload"
```

---

### Task 6: Add Logging to BulkLearnerEditService

**Files:**
- Modify: `lib/services/bulk-learner-edit-service.ts`

Same approach as Task 5 — uses `supabaseAdmin` service role client. Add summary log at the end.

**Step 1: Add summary log before the return statement of processBulkEdit()**

Find the return statement (around line 391) and add before it:

```typescript
    // Log bulk edit activity (summary)
    try {
      const fieldsUpdated = [...new Set(result.updated_learners.flatMap((l: any) => l.fields_updated || []))];
      await supabaseAdmin.from('user_activity_logs').insert({
        user_id: 'system', // Service role - pass userId as param if available
        action_type: 'update',
        resource_type: 'student',
        description: `Bulk edited ${result.updated_count} learner profiles (${fieldsUpdated.join(', ')})`,
        institution_id: userInstitutionId || undefined,
        metadata: {
          sub_type: 'bulk_edit',
          updated_count: result.updated_count,
          failed_count: result.failed_count,
          skipped_count: result.skipped_count,
          fields_updated: fieldsUpdated,
          total_rows: rows.length,
        },
      });
    } catch (logError) {
      console.error('[bulk-edit] Failed to log activity:', logError);
    }
```

**Note:** Similar to Task 5, if user ID is needed, add it as a parameter. Check how the caller provides user context and pass it through. The `userInstitutionId` parameter already exists, so the pattern is established for passing context down.

**Step 2: Commit**

```bash
git add lib/services/bulk-learner-edit-service.ts
git commit -m "feat(activity): add summary activity logging to bulk learner edit"
```

---

### Task 7: Add Logging to Leave/OnDuty Hooks

**Files:**
- Modify: `hooks/academic/use-leave-onduty.ts`

These are client-side React Query mutation hooks. Add logging in `onSuccess` callbacks.

**Step 1: Add import**

```typescript
import { logActivityClient, LearnerActivityTemplates } from '@/lib/utils/activity-logger-client';
```

**Step 2: Add logging to useCreateLeaveOndutyApplication() onSuccess**

In the `onSuccess` callback (around line 105-111), add after the existing toast/invalidation:

```typescript
      // Log activity
      const template = LearnerActivityTemplates.leaveApplied(
        'Student',
        data.leave_type || 'leave/onduty',
        `${data.from_date} to ${data.to_date}`
      );
      logActivityClient({
        userId: learnerId,
        actionType: template.actionType,
        resourceType: template.resourceType,
        resourceId: result?.id,
        description: template.description,
        metadata: {
          sub_type: template.sub_type,
          leave_type: data.leave_type,
          from_date: data.from_date,
          to_date: data.to_date,
        },
        institutionId: institutionId,
      });
```

**Note:** `learnerId` and `institutionId` come from the hook parameters. Check the exact variable names in the hook — they may be passed as props to the hook or available from closure. Adjust variable names accordingly.

**Step 3: Add logging to useCancelLeaveOndutyApplication() onSuccess**

In the `onSuccess` callback (around line 165-173), add:

```typescript
      // Log activity
      const template = LearnerActivityTemplates.leaveCancelled('Student');
      logActivityClient({
        userId: learnerId,
        actionType: template.actionType,
        resourceType: template.resourceType,
        resourceId: applicationId,
        description: template.description,
        metadata: { sub_type: template.sub_type },
      });
```

**Step 4: Add logging to useProcessApproval() onSuccess**

In the `onSuccess` callback (around line 344-357), add:

```typescript
      // Log activity
      const decision = data.status === 'approved' ? 'approved' : 'rejected';
      const template = LearnerActivityTemplates.leaveApprovalProcessed('Approver', 'Student', decision);
      logActivityClient({
        userId: currentUserId, // Get from auth context
        actionType: template.actionType,
        resourceType: template.resourceType,
        resourceId: data.application_id,
        description: template.description,
        metadata: {
          sub_type: template.sub_type,
          decision,
          application_id: data.application_id,
        },
      });
```

**Step 5: Commit**

```bash
git add hooks/academic/use-leave-onduty.ts
git commit -m "feat(activity): add activity logging to leave/onduty hooks"
```

---

### Task 8: Add Logging to Bulk Status Update Dialog (Enquiries)

**Files:**
- Modify: `app/(routes)/learners/enquiries/_components/bulk-status-update-dialog.tsx`

**Step 1: Add import**

```typescript
import { logActivityClient, LearnerActivityTemplates } from '@/lib/utils/activity-logger-client';
```

**Step 2: Add summary log after the bulk update loop completes**

In the `handleConfirm` function (around line 134-233), after the loop finishes and results are tallied (before the toast notifications), add:

```typescript
      // Log bulk status update activity
      const { data: userData } = await createClientSupabaseClient().auth.getUser();
      if (userData?.user?.id) {
        const template = LearnerActivityTemplates.enquiryBulkStatusChanged(
          'User',
          successCount,
          targetStatus
        );
        logActivityClient({
          userId: userData.user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          description: template.description,
          metadata: {
            sub_type: template.sub_type,
            target_status: targetStatus,
            success_count: successCount,
            failed_count: failedCount,
            affected_ids: successIds,
          },
        });
      }
```

**Note:** Check if the component already has access to user ID via a hook or prop. If so, use that instead of calling `getUser()`. Also check the exact variable names for success/failed counts and the selected status.

**Step 3: Commit**

```bash
git add app/(routes)/learners/enquiries/_components/bulk-status-update-dialog.tsx
git commit -m "feat(activity): add activity logging to enquiry bulk status update"
```

---

### Task 9: Add Logging to Promotion Forms

**Files:**
- Modify: `app/(routes)/learners/profiles/_components/semester-promotion-form.tsx`
- Modify: `app/(routes)/learners/profiles/_components/status-promotion-form.tsx`

#### Semester Promotion

**Step 1: Add import to semester-promotion-form.tsx**

```typescript
import { logActivityClient, LearnerActivityTemplates } from '@/lib/utils/activity-logger-client';
```

**Step 2: Add logging after successful promotion**

In `executePromotion()` (around line 164-199), after the mutation succeeds (in the `.then` or after `await`), add:

```typescript
      // Log promotion activity
      const { data: userData } = await createClientSupabaseClient().auth.getUser();
      if (userData?.user?.id) {
        const template = LearnerActivityTemplates.learnerPromoted(
          'User',
          selectedLearnerIds.length,
          `Semester ${semesterId}`
        );
        logActivityClient({
          userId: userData.user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          description: template.description,
          metadata: {
            sub_type: template.sub_type,
            operation_type: 'semester_promotion',
            semester_id: semesterId,
            section_id: sectionId,
            academic_year_id: academicYearId,
            learner_count: selectedLearnerIds.length,
            affected_ids: selectedLearnerIds,
          },
        });
      }
```

**Note:** Check exact variable names. The `semesterId`, `sectionId` may come from form state. User ID may already be available via a hook. Adjust accordingly.

#### Status Promotion

**Step 3: Add import to status-promotion-form.tsx**

```typescript
import { logActivityClient, LearnerActivityTemplates } from '@/lib/utils/activity-logger-client';
```

**Step 4: Add logging after successful status update**

In `executeStatusUpdate()` (around line 89-124), after the mutation succeeds, add:

```typescript
      // Log status change activity
      const { data: userData } = await createClientSupabaseClient().auth.getUser();
      if (userData?.user?.id) {
        const template = LearnerActivityTemplates.learnerStatusChanged(
          'User',
          selectedLearnerIds.length,
          newStatus
        );
        logActivityClient({
          userId: userData.user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          description: template.description,
          metadata: {
            sub_type: template.sub_type,
            operation_type: 'status_promotion',
            new_status: newStatus,
            learner_count: selectedLearnerIds.length,
            affected_ids: selectedLearnerIds,
            disables_accounts: newStatus === 'exited',
          },
        });
      }
```

**Step 5: Commit**

```bash
git add app/(routes)/learners/profiles/_components/semester-promotion-form.tsx
git add app/(routes)/learners/profiles/_components/status-promotion-form.tsx
git commit -m "feat(activity): add activity logging to learner promotion forms"
```

---

### Task 10: Add Logging to Bulk Image Upload

**Files:**
- Modify: `app/(routes)/learners/profiles/_components/bulk-upload-learner-images.tsx`

**Step 1: Add import**

```typescript
import { logActivityClient, LearnerActivityTemplates } from '@/lib/utils/activity-logger-client';
```

**Step 2: Add logging after upload completes**

In `handleUpload()` (around line 620-704), after the upload results are processed (around line 663-694), add:

```typescript
      // Log bulk image upload activity
      const { data: userData } = await createClientSupabaseClient().auth.getUser();
      if (userData?.user?.id) {
        const template = LearnerActivityTemplates.learnerImageUploaded(
          'User',
          uploadResult.successCount || selectedFiles.length
        );
        logActivityClient({
          userId: userData.user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          description: template.description,
          metadata: {
            sub_type: template.sub_type,
            success_count: uploadResult.successCount,
            failed_count: uploadResult.failedCount,
            total_files: selectedFiles.length,
          },
          institutionId: institutionId,
        });
      }
```

**Step 3: Commit**

```bash
git add app/(routes)/learners/profiles/_components/bulk-upload-learner-images.tsx
git commit -m "feat(activity): add activity logging to bulk image upload"
```

---

### Task 11: Add Logging to Export Operations

**Files:**
- Modify: `app/(routes)/learners/my-attendance/_components/export-actions.tsx`
- Modify: `app/(routes)/learners/analytics/_components/export-dashboard-dialog.tsx`

#### Attendance Export

**Step 1: Add import to export-actions.tsx**

```typescript
import { logActivityClient, LearnerActivityTemplates } from '@/lib/utils/activity-logger-client';
```

**Step 2: Add logging after PDF export**

In `handleExportPdf()` (line 25-63), after successful response (after the blob download), add:

```typescript
      // Log export activity
      const { data: userData } = await createClientSupabaseClient().auth.getUser();
      if (userData?.user?.id) {
        const template = LearnerActivityTemplates.learnerDataExported('User', 'PDF');
        logActivityClient({
          userId: userData.user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          description: template.description,
          metadata: {
            sub_type: 'export',
            export_format: 'pdf',
            export_type: 'attendance',
            learner_id: learnerId,
            semester_id: semesterId,
          },
        });
      }
```

**Step 3: Add logging after Excel export**

Same pattern in `handleExportExcel()` (line 65-103), with `export_format: 'excel'`.

#### Dashboard Export

**Step 4: Add import to export-dashboard-dialog.tsx**

```typescript
import { logActivityClient, LearnerActivityTemplates } from '@/lib/utils/activity-logger-client';
```

**Step 5: Add logging after dashboard export**

In `handleExport()` (line 71-96), after successful export, add:

```typescript
      // Log export activity
      const { data: userData } = await createClientSupabaseClient().auth.getUser();
      if (userData?.user?.id) {
        const template = LearnerActivityTemplates.learnerDataExported('User', exportFormat);
        logActivityClient({
          userId: userData.user.id,
          actionType: template.actionType,
          resourceType: template.resourceType,
          description: template.description,
          metadata: {
            sub_type: 'export',
            export_format: exportFormat,
            export_type: 'analytics_dashboard',
            selected_tabs: selectedTabs,
          },
        });
      }
```

**Step 6: Commit**

```bash
git add app/(routes)/learners/my-attendance/_components/export-actions.tsx
git add app/(routes)/learners/analytics/_components/export-dashboard-dialog.tsx
git commit -m "feat(activity): add activity logging to learner export operations"
```

---

### Task 12: Verification

**Step 1: Build check**

Run: `npm run build` or `npx next build`
Expected: No TypeScript or build errors

**Step 2: Manual verification checklist**

Test each logging point by performing the action and checking `user_activity_logs` table:

| # | Action | Expected Log Entry |
|---|--------|--------------------|
| 1 | Create new enquiry | `create` / `student` / sub_type: `enquiry` |
| 2 | Edit enquiry | `update` / `student` / sub_type: `enquiry` |
| 3 | Update learner profile | `update` / `student` / sub_type: `profile` |
| 4 | Submit change request (as student) | `create` / `student` / sub_type: `change_request` |
| 5 | Approve change request | `update` / `student` / sub_type: `change_request` / decision: `approved` |
| 6 | Reject change request | `update` / `student` / sub_type: `change_request` / decision: `rejected` |
| 7 | Bulk upload enquiries | `import` / `student` / sub_type: `bulk_upload` |
| 8 | Bulk edit profiles | `update` / `student` / sub_type: `bulk_edit` |
| 9 | Promote learners (semester) | `update` / `student` / sub_type: `promotion` |
| 10 | Change learner status | `update` / `student` / sub_type: `promotion` |
| 11 | Apply for leave | `create` / `student` / sub_type: `leave` |
| 12 | Cancel leave | `update` / `student` / sub_type: `leave` |
| 13 | Bulk upload images | `upload` / `student` / sub_type: `profile` |
| 14 | Export attendance PDF | `export` / `student` / sub_type: `export` |
| 15 | Export analytics dashboard | `export` / `student` / sub_type: `export` |

**Step 3: Verify in activity dashboard**

Navigate to `/users/activity` and confirm new learner activities appear with correct action types and can be filtered.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(learners): add comprehensive activity logging across learner module"
```

---

## Summary

| Task | Scope | Files Modified |
|------|-------|---------------|
| 1 | RLS policy | `supabase/setup/03_policies.sql` |
| 2 | Client logger utility | `lib/utils/activity-logger-client.ts` (new) |
| 3 | Create/update profiles | `lib/services/learner-profile-service.ts` |
| 4 | Change requests | `lib/services/learner-profile-change-service.ts` |
| 5 | Bulk upload | `lib/services/bulk-learner-upload-service.ts` |
| 6 | Bulk edit | `lib/services/bulk-learner-edit-service.ts` |
| 7 | Leave/OnDuty | `hooks/academic/use-leave-onduty.ts` |
| 8 | Bulk status update | `app/(routes)/learners/enquiries/_components/bulk-status-update-dialog.tsx` |
| 9 | Promotions | 2 promotion form components |
| 10 | Image upload | `app/(routes)/learners/profiles/_components/bulk-upload-learner-images.tsx` |
| 11 | Exports | 2 export components |
| 12 | Verification | Build + manual testing |

**Total files:** 1 new + 10 modified + 1 SQL policy update = **12 changes**
