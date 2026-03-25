# Learner Module Activity Logging - Design Document

**Date:** 2026-03-04
**Status:** Approved
**Module:** Learners

## Overview

Add comprehensive activity logging to all CRUD operations in the learner module. Extends the existing `user_activity_logs` system (currently handling login/logout) to cover enquiry management, profile updates, change requests, bulk operations, leave/onduty, and data exports.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Log scope | Write-only (mutations) | Keeps volume manageable, focused on audit-critical actions |
| Logging layer | Service layer | Centralizes logging; every code path gets coverage automatically |
| Bulk logging | Single summary per operation | Avoids log explosion; stores affected IDs in metadata |
| Resource type | Reuse `STUDENT` | Already exists; differentiate via `metadata.sub_type` |
| Approach | Direct service integration | Minimal complexity, complete coverage, uses existing infra |

## Activity Templates

New templates added to `ActivityTemplates` in `lib/utils/activity-logger.ts`:

| Template | Action Type | Sub Type | Description Pattern |
|----------|------------|----------|-------------------|
| `enquiryCreated` | `create` | `enquiry` | "{actor} created enquiry for {name}" |
| `enquiryUpdated` | `update` | `enquiry` | "{actor} updated enquiry for {name}" |
| `enquiryStatusChanged` | `update` | `enquiry` | "{actor} changed enquiry status to '{status}' ({count} records)" |
| `learnerProfileUpdated` | `update` | `profile` | "{actor} updated learner profile for {name}" |
| `learnersBulkUploaded` | `import` | `bulk_upload` | "{actor} bulk uploaded {count} learner enquiries" |
| `learnersBulkEdited` | `update` | `bulk_edit` | "{actor} bulk edited {count} learner profiles ({changes})" |
| `learnerPromoted` | `update` | `promotion` | "{actor} promoted {count} learners to {target}" |
| `learnerImageUploaded` | `upload` | `profile` | "{actor} uploaded images for {count} learners" |
| `changeRequestCreated` | `create` | `change_request` | "{student} submitted profile change request" |
| `changeRequestApproved` | `update` | `change_request` | "{actor} approved change request for {name}" |
| `changeRequestRejected` | `update` | `change_request` | "{actor} rejected change request for {name}" |
| `leaveApplied` | `create` | `leave` | "{student} applied for leave ({duration})" |
| `leaveCancelled` | `update` | `leave` | "{student} cancelled leave application" |
| `learnerDataExported` | `export` | `export` | "{actor} exported learner data in {format} format" |

## Metadata Schema

```typescript
metadata: {
  sub_type: 'enquiry' | 'profile' | 'change_request' | 'leave' | 'promotion' | 'bulk_upload' | 'bulk_edit' | 'export',
  // Individual operations
  learner_name?: string,
  learner_id?: string,
  changes?: string[],
  old_status?: string,
  new_status?: string,
  // Bulk operations
  affected_count?: number,
  affected_ids?: string[],
  operation_type?: string,
  // Exports
  export_format?: string,
  record_count?: number
}
```

## Service Files to Modify

| Service File | Methods |
|-------------|---------|
| `lib/services/learner-profile-service.ts` | `createLearnerProfile()`, `updateLearnerProfile()` |
| `lib/services/learner-profile-change-service.ts` | `createChangeRequest()`, `approveRequest()`, `rejectRequest()` |
| `lib/services/bulk-learner-upload-service.ts` | `processUpload()` |
| `lib/services/bulk-learner-edit-service.ts` | `processBulkEdit()` |

## Component-Level Logging (for operations not in services)

| Component | Operation |
|-----------|-----------|
| Enquiry bulk status update dialog | `enquiryStatusChanged` |
| Promotion forms | `learnerPromoted` |
| Leave/OnDuty hooks | `leaveApplied`, `leaveCancelled` |
| Export dialogs | `learnerDataExported` |
| Bulk image upload | `learnerImageUploaded` |

## What Does NOT Change

- No database schema changes
- No new API endpoints
- No UI changes to activity dashboard
- No new RLS policies
- No new TypeScript type definitions (reuses existing)

## Client-Side Logging Helper

Since service-layer logging uses server-side Supabase client, for client-side components (React mutations), we'll use the existing `/api/activity` POST endpoint via a lightweight helper or the `useActivityLogger()` hook.
