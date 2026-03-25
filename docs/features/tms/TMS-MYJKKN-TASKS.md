# TMS Integration - MyJKKN Implementation Tasks

> **Document Type**: Implementation Tasks for MyJKKN Codebase
> **Date**: 2026-03-15
> **Scope**: All changes needed in D:\Projects\MyJKKN to support TMS (tms.jkkn.ai) integration
> **Related**: [TMS-PRD-ANALYSIS.md](./TMS-PRD-ANALYSIS.md)

---

## Table of Contents

1. [Task 1: New B2A Endpoints for TMS](#task-1-new-b2a-endpoints-for-tms)
   - [1.1: GET /api/b2a/tms/verify-access](#11-get-apib2atmsverify-access)
   - [1.2: POST /api/b2a/tms/users/batch](#12-post-apib2atmsusersbatch)
   - [1.3: GET /api/b2a/auth/permissions](#13-get-apib2aauthpermissions)
   - [1.4: POST /api/b2a/notifications/send](#14-post-apib2anotificationssend)
   - [1.5: POST /api/b2a/billing/create-transport-bill](#15-post-apib2abillingcreate-transport-bill)
2. [Task 2: Transport Billing Category Setup](#task-2-transport-billing-category-setup)
3. [Task 3: Service Request Integration](#task-3-service-request-integration)
   - [3.1: Update Transport Service Request Approval Flow](#31-update-transport-service-request-approval-flow)
   - [3.2: Add Auto-Renewal Logic](#32-add-auto-renewal-logic)
4. [Task 4: Payment Webhook](#task-4-payment-webhook)
5. [Task 5: Permission Definitions](#task-5-permission-definitions)
   - [5.1: Add TMS Permissions to Custom Roles](#51-add-tms-permissions-to-custom-roles)
   - [5.2: Add 'tms' to Valid API Modules](#52-add-tms-to-valid-api-modules)
6. [Task 6: MyJKKN UI Changes](#task-6-myjkkn-ui-changes)
   - [6.1: Add Transport Link to Sidebar](#61-add-transport-link-to-sidebar)
   - [6.2: Transport Request Status Card on Dashboard](#62-transport-request-status-card-on-dashboard)
7. [Task 7: API Key Setup](#task-7-api-key-setup)

---

## Task 1: New B2A Endpoints for TMS

All endpoints follow the established B2A pattern visible in existing routes such as `app/api/b2a/billing/route.ts`:

1. Authenticate via `authenticateApiKey()` from `lib/api-keys/authenticate.ts`
2. Rate-limit via `checkRateLimit()` from `lib/api-keys/rate-limiter.ts`
3. Audit-log via `logApiUsage()` from `lib/api-keys/audit-logger.ts`
4. Resolve institution scope via `resolveInstitutionId()`

---

### 1.1: GET /api/b2a/tms/verify-access

**Purpose**: TMS calls this to check whether a user has paid for transport and should be granted TMS access.

**File**: `app/api/b2a/tms/verify-access/route.ts`

**Auth**: Bearer token with `requiredModule: 'tms'` (read)

#### Request

```
GET /api/b2a/tms/verify-access?user_id=<uuid>&institution_id=<uuid>
Authorization: Bearer jkkn_xxx
```

| Query Param      | Type   | Required | Description                    |
|------------------|--------|----------|--------------------------------|
| `user_id`        | string | Yes      | Profile UUID of the user       |
| `institution_id` | string | Yes*     | Institution scope (*or key-bound) |

#### TypeScript Types

```typescript
// ─── Request ────────────────────────────────────────────────────────────────

interface VerifyAccessQuery {
  user_id: string;        // UUID
  institution_id: string; // UUID
}

// ─── Response ───────────────────────────────────────────────────────────────

interface VerifyAccessResponse {
  success: true;
  data: {
    access: boolean;
    paid: boolean;
    grace_period: boolean;
    grace_expires_at: string | null;     // ISO 8601 datetime
    enrollment_data: TransportEnrollment | null;
    reason: string | null;               // present when access=false
  };
}

interface TransportEnrollment {
  service_request_id: string;
  route_id: string | null;
  boarding_point: string | null;
  drop_point: string | null;
  timing_preference: string | null;
  bus_type: string | null;
  semester: string | null;
  form_data: Record<string, unknown>;   // full form_data from service request
}
```

#### Step-by-Step Implementation

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Step 1: Authenticate — require 'tms' module read access
  const authResult = await authenticateApiKey(request, { requiredModule: 'tms' });
  if ('error' in authResult) return authResult.error;
  const { context } = authResult;

  // Step 2: Rate limit
  const rateLimitResult = checkRateLimit(context.keyId);
  if (!rateLimitResult.allowed) {
    // Return 429 with standard rate-limit headers (see billing/route.ts pattern)
  }

  // Step 3: Resolve institution
  const institutionId = resolveInstitutionId(context, request);
  const { ipAddress, userAgent } = extractRequestMeta(request);

  // Step 4: Validate required params
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  if (!userId) {
    // Return 400: { error: { code: 'MISSING_PARAM', message: 'user_id is required' } }
  }

  // Step 5: Look up transport billing — join through item_category → sub_category → parent_category
  //
  // Query: billing_student_bills
  //   JOIN billing_item_categories ON item_category_id
  //   JOIN billing_sub_categories ON sub_category_id
  //   JOIN billing_parent_categories ON parent_category_id
  //   WHERE parent_category_name ILIKE '%transport%'
  //     AND student_id = userId
  //     AND institution_id = institutionId
  //   ORDER BY created_at DESC
  //   LIMIT 1
  //
  const supabase = createServiceRoleClient();

  const { data: bill } = await supabase
    .from('billing_student_bills')
    .select(`
      id, student_id, status, balance_amount, final_amount,
      created_at, due_date,
      item_category:billing_item_categories!inner(
        id, item_category_name,
        sub_category:billing_sub_categories!inner(
          id, sub_category_name,
          parent_category:billing_parent_categories!inner(
            id, parent_category_name
          )
        )
      )
    `)
    .eq('student_id', userId)
    .eq('institution_id', institutionId)
    .ilike('item_category.sub_category.parent_category.parent_category_name', '%transport%')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Step 6: Also look up their service request for enrollment data
  const { data: serviceRequest } = await supabase
    .from('service_requests')
    .select('id, form_data, status')
    .eq('requester_id', userId)
    .eq('status', 'fulfilled')       // only approved/fulfilled requests
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  // NOTE: Filter by service_type slug 'transport-service-request' via join if needed

  // Step 7: Determine access
  const GRACE_PERIOD_DAYS = 7;

  if (!bill) {
    // No transport bill → no enrollment
    return respond({ access: false, paid: false, grace_period: false,
      grace_expires_at: null, enrollment_data: null, reason: 'no_enrollment' });
  }

  if (bill.status === 'paid' || bill.balance_amount === 0) {
    return respond({ access: true, paid: true, grace_period: false,
      grace_expires_at: null, enrollment_data: extractEnrollment(serviceRequest),
      reason: null });
  }

  // Bill exists but not fully paid — check grace period
  const createdAt = new Date(bill.created_at);
  const graceExpiry = new Date(createdAt.getTime() + GRACE_PERIOD_DAYS * 86400000);
  const now = new Date();

  if (graceExpiry > now) {
    return respond({ access: true, paid: false, grace_period: true,
      grace_expires_at: graceExpiry.toISOString(),
      enrollment_data: extractEnrollment(serviceRequest), reason: null });
  }

  // Grace period expired
  return respond({ access: false, paid: false, grace_period: false,
    grace_expires_at: null, enrollment_data: extractEnrollment(serviceRequest),
    reason: 'payment_overdue' });

  // Step 8: Audit log (always fires)
  // logApiUsage({ apiKeyId, endpoint: '/api/b2a/tms/verify-access', module: 'tms', ... })
}
```

#### Error Handling

| Condition                  | Status | Error Code       | Message                        |
|----------------------------|--------|------------------|--------------------------------|
| Missing `user_id`          | 400    | MISSING_PARAM    | `user_id is required`          |
| Missing `institution_id`   | 400    | MISSING_PARAM    | `institution_id is required`   |
| Invalid API key            | 401    | UNAUTHORIZED     | (from authenticate.ts)         |
| No TMS read access         | 403    | FORBIDDEN        | (from authenticate.ts)         |
| Rate limited               | 429    | RATE_LIMIT_EXCEEDED | (standard headers)          |
| Database error             | 500    | INTERNAL_ERROR   | `Failed to verify access`      |

#### Testing

1. **No enrollment**: Call with a `user_id` that has no transport bills. Expect `{ access: false, reason: 'no_enrollment' }`.
2. **Paid bill**: Create a transport bill with `status='paid'`, `balance_amount=0`. Expect `{ access: true, paid: true }`.
3. **Within grace**: Create an unpaid bill with `created_at` = 3 days ago. Expect `{ access: true, grace_period: true, grace_expires_at: <7 days from created_at> }`.
4. **Expired grace**: Create an unpaid bill with `created_at` = 10 days ago. Expect `{ access: false, reason: 'payment_overdue' }`.
5. **Auth failures**: Test with missing Bearer token, wrong module permissions, expired key.

---

### 1.2: POST /api/b2a/tms/users/batch

**Purpose**: Bulk fetch user profiles. Avoids per-user rate limiting during morning attendance rush when TMS needs to resolve 50+ students boarding a bus.

**File**: `app/api/b2a/tms/users/batch/route.ts`

**Auth**: Bearer token with `requiredModule: 'tms'` (read)

#### Request

```
POST /api/b2a/tms/users/batch
Authorization: Bearer jkkn_xxx
Content-Type: application/json

{
  "user_ids": ["uuid-1", "uuid-2", ...]
}
```

#### TypeScript Types

```typescript
// ─── Request ────────────────────────────────────────────────────────────────

interface BatchUsersRequest {
  user_ids: string[];  // max 100 UUIDs
}

// ─── Response ───────────────────────────────────────────────────────────────

interface BatchUsersResponse {
  success: true;
  data: {
    users: UserProfile[];
    found: number;
    not_found: string[];  // IDs that didn't match any profile
  };
}

interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  institution_id: string | null;
  department_id: string | null;
  avatar_url: string | null;
  phone_number: string | null;
  is_active: boolean;
}
```

#### Step-by-Step Implementation

```typescript
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Step 1: Authenticate — require 'tms' read
  const authResult = await authenticateApiKey(request, { requiredModule: 'tms' });
  if ('error' in authResult) return authResult.error;
  const { context } = authResult;

  // Step 2: Rate limit — counts as 1 request regardless of batch size
  const rateLimitResult = checkRateLimit(context.keyId);
  if (!rateLimitResult.allowed) { /* 429 */ }

  // Step 3: Parse and validate body
  let body: { user_ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } },
      { status: 400 }
    );
  }

  const userIds = body.user_ids;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_PARAM', message: 'user_ids must be a non-empty array' } },
      { status: 400 }
    );
  }

  if (userIds.length > 100) {
    return NextResponse.json(
      { error: { code: 'BATCH_TOO_LARGE', message: 'Maximum 100 user IDs per batch' } },
      { status: 400 }
    );
  }

  // Validate all are strings (UUIDs)
  const validIds = userIds.filter(
    (id): id is string => typeof id === 'string' && id.length > 0
  );

  // Step 4: Query profiles
  const supabase = createServiceRoleClient();

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, institution_id, department_id, avatar_url, phone_number, is_active')
    .in('id', validIds);

  if (error) {
    // 500
  }

  // Step 5: Compute not_found
  const foundIds = new Set((profiles ?? []).map((p) => p.id));
  const notFound = validIds.filter((id) => !foundIds.has(id));

  // Step 6: Audit log
  logApiUsage({
    apiKeyId: context.keyId,
    endpoint: '/api/b2a/tms/users/batch',
    module: 'tms',
    institutionId: null,
    statusCode: 200,
    responseTimeMs: Date.now() - startTime,
    ipAddress, userAgent,
  });

  // Step 7: Return
  return NextResponse.json({
    success: true,
    data: {
      users: profiles ?? [],
      found: (profiles ?? []).length,
      not_found: notFound,
    },
  }, { status: 200, headers: { /* rate-limit headers */ } });
}
```

#### Error Handling

| Condition               | Status | Error Code        | Message                              |
|-------------------------|--------|-------------------|--------------------------------------|
| Invalid JSON body       | 400    | INVALID_JSON      | `Request body must be valid JSON`    |
| Empty / missing array   | 400    | INVALID_PARAM     | `user_ids must be a non-empty array` |
| More than 100 IDs       | 400    | BATCH_TOO_LARGE   | `Maximum 100 user IDs per batch`     |
| Database error          | 500    | INTERNAL_ERROR    | `Failed to fetch user profiles`      |

#### Testing

1. **Normal batch**: Send 5 valid UUIDs where 3 exist. Expect `found: 3`, `not_found: [2 ids]`.
2. **Max batch**: Send exactly 100 IDs. Expect success.
3. **Over limit**: Send 101 IDs. Expect 400 BATCH_TOO_LARGE.
4. **Empty array**: Expect 400.
5. **Rate limit**: This should count as 1 request, not N.

---

### 1.3: GET /api/b2a/auth/permissions

**Purpose**: TMS fetches a user's TMS-specific permissions derived from their custom_role in MyJKKN.

**File**: `app/api/b2a/auth/permissions/route.ts` (new file, or extend if already exists)

**Auth**: Bearer token (no specific module required, or require 'tms' read)

#### Request

```
GET /api/b2a/auth/permissions?user_id=<uuid>
Authorization: Bearer jkkn_xxx
```

#### TypeScript Types

```typescript
// ─── Response ───────────────────────────────────────────────────────────────

interface UserPermissionsResponse {
  success: true;
  data: {
    user_id: string;
    role: string;                    // profile.role (e.g. 'admin', 'student', 'faculty')
    role_key: string | null;         // custom_roles.role_key (e.g. 'transport_manager')
    role_name: string | null;        // custom_roles.role_name (e.g. 'Transport Manager')
    tms_permissions: string[];       // all permission keys starting with 'tms.'
    all_permissions: Record<string, boolean>; // full permissions object from custom_roles
  };
}
```

#### Step-by-Step Implementation

```typescript
export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Step 1: Authenticate
  const authResult = await authenticateApiKey(request, { requiredModule: 'tms' });
  if ('error' in authResult) return authResult.error;
  const { context } = authResult;

  // Step 2: Rate limit
  const rateLimitResult = checkRateLimit(context.keyId);
  if (!rateLimitResult.allowed) { /* 429 */ }

  // Step 3: Extract user_id
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  if (!userId) { /* 400 */ }

  const supabase = createServiceRoleClient();

  // Step 4: Get user's profile role
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .single();

  if (!profile) { /* 404: User not found */ }

  // Step 5: Get user's custom role via user_roles junction table
  //
  // Schema: user_roles { user_id, role_id } → custom_roles { id, role_key, role_name, permissions }
  //
  const { data: userRole } = await supabase
    .from('user_roles')
    .select(`
      role:custom_roles(
        id, role_key, role_name, permissions
      )
    `)
    .eq('user_id', userId)
    .maybeSingle();

  const customRole = userRole?.role;
  const allPermissions: Record<string, boolean> =
    (customRole?.permissions as Record<string, boolean>) ?? {};

  // Step 6: Extract TMS-specific permissions
  const tmsPermissions = Object.entries(allPermissions)
    .filter(([key, value]) => key.startsWith('tms.') && value === true)
    .map(([key]) => key);

  // Step 7: Audit log + return
  return NextResponse.json({
    success: true,
    data: {
      user_id: userId,
      role: profile.role,
      role_key: customRole?.role_key ?? null,
      role_name: customRole?.role_name ?? null,
      tms_permissions: tmsPermissions,
      all_permissions: allPermissions,
    },
  });
}
```

#### Error Handling

| Condition             | Status | Error Code     | Message                |
|-----------------------|--------|----------------|------------------------|
| Missing `user_id`     | 400    | MISSING_PARAM  | `user_id is required`  |
| User not found        | 404    | NOT_FOUND      | `User not found`       |
| Database error        | 500    | INTERNAL_ERROR | `Failed to fetch permissions` |

#### Testing

1. **User with TMS role**: Create a user with `transport_manager` custom role. Expect all `tms.*` permissions.
2. **User without TMS role**: Regular student. Expect `tms_permissions: []`.
3. **User with partial permissions**: `transport_staff` role. Expect only assigned `tms.*` permissions.
4. **Non-existent user**: Expect 404.

---

### 1.4: POST /api/b2a/notifications/send

**Purpose**: TMS sends notifications (bus delayed, route changed, etc.) through MyJKKN's existing notification system which supports push via VAPID.

**File**: `app/api/b2a/notifications/send/route.ts`

**Auth**: Bearer token with `requiredModule: 'notifications'` (write)

#### Request

```
POST /api/b2a/notifications/send
Authorization: Bearer jkkn_xxx
Content-Type: application/json

{
  "user_ids": ["uuid-1", "uuid-2"],
  "title": "Bus Delayed - Route 5",
  "message": "Your bus on Route 5 is delayed by 15 minutes. Expected arrival: 8:15 AM.",
  "category": "transport",
  "type": "warning",
  "url": "https://tms.jkkn.ai/tracking/route-5",
  "metadata": { "route_id": "route-5", "delay_minutes": 15 }
}
```

#### TypeScript Types

```typescript
// ─── Request ────────────────────────────────────────────────────────────────

interface SendNotificationRequest {
  user_ids: string[];                      // target user profile IDs (max 500)
  title: string;                           // notification title (max 200 chars)
  message: string;                         // notification body (max 1000 chars)
  category: 'transport';                   // always 'transport' for TMS
  type: 'info' | 'warning' | 'success' | 'error';
  url?: string | null;                     // deep link URL
  metadata?: Record<string, unknown>;      // arbitrary metadata
}

// ─── Response ───────────────────────────────────────────────────────────────

interface SendNotificationResponse {
  success: true;
  data: {
    notification_id: string;               // notifications table ID
    targeted: number;                      // number of user_ids in targeting
    push_sent: number;                     // push notifications delivered
    push_failed: number;                   // push notifications failed
  };
}
```

#### Step-by-Step Implementation

```typescript
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Step 1: Authenticate — require 'notifications' WRITE access
  const authResult = await authenticateApiKey(request, {
    requiredModule: 'notifications',
    requireWrite: true,
  });
  if ('error' in authResult) return authResult.error;
  const { context } = authResult;

  // Step 2: Rate limit
  const rateLimitResult = checkRateLimit(context.keyId);
  if (!rateLimitResult.allowed) { /* 429 */ }

  // Step 3: Parse and validate body
  const body = await request.json() as SendNotificationRequest;

  // Validate required fields
  if (!body.user_ids?.length) { /* 400: user_ids required */ }
  if (body.user_ids.length > 500) { /* 400: max 500 recipients */ }
  if (!body.title?.trim()) { /* 400: title required */ }
  if (!body.message?.trim()) { /* 400: message required */ }
  if (body.title.length > 200) { /* 400: title too long */ }
  if (body.message.length > 1000) { /* 400: message too long */ }

  const validTypes = ['info', 'warning', 'success', 'error'];
  if (!validTypes.includes(body.type)) { /* 400: invalid type */ }

  const supabase = createServiceRoleClient();

  // Step 4: Create notification record
  //
  // The notifications table uses a `targeting` JSONB column and
  // `created_by` is a foreign key to profiles. For B2A usage,
  // use a system/service account UUID or the API key owner.
  //
  // Existing schema from types/supabase.ts:
  //   notifications: { title, body, category, targeting (Json), created_by,
  //                    priority, icon, url, metadata, expires_at }
  //
  const { data: notification, error: insertError } = await supabase
    .from('notifications')
    .insert({
      title: body.title,
      body: body.message,
      category: body.category ?? 'transport',
      targeting: { user_ids: body.user_ids },
      priority: body.type === 'error' ? 'high' : body.type === 'warning' ? 'medium' : 'low',
      url: body.url ?? null,
      metadata: {
        ...(body.metadata ?? {}),
        source: 'tms',
        type: body.type,
      },
      created_by: context.keyId, // or a designated system account UUID
    })
    .select('id')
    .single();

  if (insertError || !notification) {
    // 500: Failed to create notification
  }

  // Step 5: Send push notifications via existing VAPID system
  //
  // Reference: lib/services/notification/notification-service.ts
  // Reference: hooks/use-push-notifications.ts
  // Reference: app/api/notifications/send/route.ts
  //
  // Call the existing push notification service for each user
  // who has a registered push subscription.
  //
  let pushSent = 0;
  let pushFailed = 0;

  // Query push_subscriptions for all target user_ids
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('*')
    .in('user_id', body.user_ids);

  // For each subscription, send web push notification
  // (reuse existing logic from app/api/notifications/send/route.ts)
  //
  // Implementation note: Import and call the existing push delivery function
  // rather than reimplementing VAPID signing here.

  // Step 6: Audit log + return
  return NextResponse.json({
    success: true,
    data: {
      notification_id: notification.id,
      targeted: body.user_ids.length,
      push_sent: pushSent,
      push_failed: pushFailed,
    },
  });
}
```

#### Error Handling

| Condition                | Status | Error Code        | Message                              |
|--------------------------|--------|-------------------|--------------------------------------|
| Missing user_ids         | 400    | INVALID_PARAM     | `user_ids is required`               |
| Too many recipients      | 400    | BATCH_TOO_LARGE   | `Maximum 500 recipients per request` |
| Missing title            | 400    | INVALID_PARAM     | `title is required`                  |
| Title too long           | 400    | INVALID_PARAM     | `title must be 200 characters or less` |
| Message too long         | 400    | INVALID_PARAM     | `message must be 1000 characters or less` |
| Invalid type             | 400    | INVALID_PARAM     | `type must be info, warning, success, or error` |
| No write access          | 403    | FORBIDDEN         | (from authenticate.ts)               |
| Insert failed            | 500    | INTERNAL_ERROR    | `Failed to create notification`      |

#### Testing

1. **Single user notification**: Send to 1 user. Verify notification row created with correct `targeting`, `category='transport'`.
2. **Bulk notification**: Send to 50 users. Verify single notification row with `targeting.user_ids` containing all 50.
3. **Push delivery**: Verify push subscriptions are queried and VAPID push attempted for subscribed users.
4. **Write permission required**: Test with read-only key. Expect 403.
5. **Validation**: Test with empty title, over-limit message, invalid type.

---

### 1.5: POST /api/b2a/billing/create-transport-bill

**Purpose**: Programmatically create a transport bill when a service request is approved. Called by the approval flow (Task 3.1) or directly by TMS.

**File**: `app/api/b2a/billing/create-transport-bill/route.ts`

**Auth**: Bearer token with `requiredModule: 'billing'` (write)

#### Request

```
POST /api/b2a/billing/create-transport-bill
Authorization: Bearer jkkn_xxx
Content-Type: application/json

{
  "student_id": "uuid",
  "institution_id": "uuid",
  "item_category_id": "uuid",
  "amount": 15000,
  "due_date": "2026-04-15",
  "description": "Regular Bus - Semester 6 Fee",
  "service_request_id": "uuid"
}
```

#### TypeScript Types

```typescript
// ─── Request ────────────────────────────────────────────────────────────────

interface CreateTransportBillRequest {
  student_id: string;            // profile UUID
  institution_id: string;        // institution UUID
  item_category_id: string;      // billing_item_categories UUID (transport item)
  amount: number;                // bill amount in base currency unit
  due_date: string;              // YYYY-MM-DD
  description?: string;          // bill description
  service_request_id?: string;   // linked service request for traceability
}

// ─── Response ───────────────────────────────────────────────────────────────

interface CreateTransportBillResponse {
  success: true;
  data: {
    bill_id: string;
    bill_status: string;         // 'unpaid'
    amount: number;
    balance_amount: number;      // same as amount (unpaid)
    due_date: string;
    student_id: string;
  };
}
```

#### Step-by-Step Implementation

```typescript
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Step 1: Authenticate — require 'billing' WRITE access
  const authResult = await authenticateApiKey(request, {
    requiredModule: 'billing',
    requireWrite: true,
  });
  if ('error' in authResult) return authResult.error;
  const { context } = authResult;

  // Step 2: Rate limit
  const rateLimitResult = checkRateLimit(context.keyId);
  if (!rateLimitResult.allowed) { /* 429 */ }

  // Step 3: Parse and validate
  const body = await request.json() as CreateTransportBillRequest;

  if (!body.student_id) { /* 400: student_id required */ }
  if (!body.institution_id) { /* 400: institution_id required */ }
  if (!body.item_category_id) { /* 400: item_category_id required */ }
  if (typeof body.amount !== 'number' || body.amount <= 0) { /* 400: amount must be positive */ }
  if (!body.due_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.due_date)) {
    /* 400: due_date must be YYYY-MM-DD */
  }

  const supabase = createServiceRoleClient();

  // Step 4: Verify the item_category_id exists and belongs to a transport parent category
  const { data: itemCategory, error: catError } = await supabase
    .from('billing_item_categories')
    .select(`
      id, item_category_name, amount,
      sub_category:billing_sub_categories!inner(
        parent_category:billing_parent_categories!inner(
          parent_category_name
        )
      )
    `)
    .eq('id', body.item_category_id)
    .eq('institution_id', body.institution_id)
    .single();

  if (catError || !itemCategory) {
    return NextResponse.json(
      { error: { code: 'INVALID_CATEGORY', message: 'Item category not found or not in this institution' } },
      { status: 400 }
    );
  }

  // Validate it's a transport category
  const parentName = (itemCategory as any).sub_category?.parent_category?.parent_category_name ?? '';
  if (!parentName.toLowerCase().includes('transport')) {
    return NextResponse.json(
      { error: { code: 'INVALID_CATEGORY', message: 'Item category is not a transport category' } },
      { status: 400 }
    );
  }

  // Step 5: Check for duplicate — student should not have an active (unpaid/partial) transport bill
  const { data: existingBill } = await supabase
    .from('billing_student_bills')
    .select('id, status')
    .eq('student_id', body.student_id)
    .eq('item_category_id', body.item_category_id)
    .in('status', ['unpaid', 'partial'])
    .maybeSingle();

  if (existingBill) {
    return NextResponse.json(
      { error: {
        code: 'DUPLICATE_BILL',
        message: 'Student already has an active transport bill',
        existing_bill_id: existingBill.id,
      } },
      { status: 409 }
    );
  }

  // Step 6: Create the bill
  //
  // billing_student_bills schema:
  //   student_id, institution_id, item_category_id, unit_amount, quantity,
  //   total_amount, tax_amount, final_amount, balance_amount, status,
  //   due_date, bill_description, remarks
  //
  const { data: bill, error: insertError } = await supabase
    .from('billing_student_bills')
    .insert({
      student_id: body.student_id,
      institution_id: body.institution_id,
      item_category_id: body.item_category_id,
      unit_amount: body.amount,
      quantity: 1,
      total_amount: body.amount,
      tax_amount: 0,
      final_amount: body.amount,
      balance_amount: body.amount,
      status: 'unpaid',
      due_date: body.due_date,
      bill_description: body.description ?? 'Transport Service Fee',
      remarks: body.service_request_id
        ? `Auto-created from service request ${body.service_request_id}`
        : 'Created via TMS API',
    })
    .select('id, status, final_amount, balance_amount, due_date, student_id')
    .single();

  if (insertError || !bill) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to create transport bill' } },
      { status: 500 }
    );
  }

  // Step 7: Audit log
  logApiUsage({
    apiKeyId: context.keyId,
    endpoint: '/api/b2a/billing/create-transport-bill',
    module: 'billing',
    institutionId: body.institution_id,
    statusCode: 201,
    responseTimeMs: Date.now() - startTime,
    ipAddress, userAgent,
  });

  // Step 8: Return
  return NextResponse.json({
    success: true,
    data: {
      bill_id: bill.id,
      bill_status: bill.status,
      amount: bill.final_amount,
      balance_amount: bill.balance_amount,
      due_date: bill.due_date,
      student_id: bill.student_id,
    },
  }, { status: 201 });
}
```

#### Error Handling

| Condition                     | Status | Error Code        | Message                                        |
|-------------------------------|--------|-------------------|------------------------------------------------|
| Missing required fields       | 400    | MISSING_PARAM     | `{field} is required`                          |
| Invalid amount                | 400    | INVALID_PARAM     | `amount must be a positive number`             |
| Invalid date format           | 400    | INVALID_DATE      | `due_date must be YYYY-MM-DD`                  |
| Category not found            | 400    | INVALID_CATEGORY  | `Item category not found or not in this institution` |
| Non-transport category        | 400    | INVALID_CATEGORY  | `Item category is not a transport category`    |
| Duplicate active bill         | 409    | DUPLICATE_BILL    | `Student already has an active transport bill`  |
| No billing write access       | 403    | FORBIDDEN         | (from authenticate.ts)                         |
| Insert failure                | 500    | INTERNAL_ERROR    | `Failed to create transport bill`              |

#### Testing

1. **Happy path**: Create bill with valid transport item_category_id. Verify row in `billing_student_bills`.
2. **Duplicate guard**: Create same bill twice. Second should return 409 with `existing_bill_id`.
3. **Non-transport category**: Use a tuition item_category_id. Expect 400.
4. **Invalid category**: Use a non-existent UUID. Expect 400.
5. **Amount validation**: Send amount=0 or negative. Expect 400.
6. **Write permission**: Use a read-only key. Expect 403.

---

## Task 2: Transport Billing Category Setup

**Type**: Admin data setup (not code)

**Purpose**: The billing module uses a 3-tier category hierarchy. Transport billing items must be created before the API can create bills.

### Required Category Hierarchy

```
billing_parent_categories
└── "Transportation Services" (is_active: true)
    │
    billing_sub_categories
    ├── "Bus Transport" (is_active: true)
    │   │
    │   billing_item_categories
    │   ├── "Regular Bus - Semester Fee"  (frequency: 'semester', amount: <configurable>)
    │   ├── "AC Bus - Semester Fee"       (frequency: 'semester', amount: <configurable>)
    │   └── "Ad-hoc Trip Fare"            (frequency: 'one-time', amount: <configurable>)
    │
    └── "Special Transport" (is_active: true)
        │
        billing_item_categories
        └── "Event Transport Fee"         (frequency: 'one-time', amount: <configurable>)
```

### Setup Instructions for Admin

1. Navigate to **Billing > Settings > Categories** in MyJKKN admin panel.
2. Create parent category "Transportation Services".
3. Under it, create sub-category "Bus Transport".
4. Under "Bus Transport", create item categories with appropriate amounts per institution.
5. Note down the `item_category_id` UUIDs for each item. These will be configured in TMS as `MYJKKN_TRANSPORT_ITEM_CATEGORY_IDS`.

### SQL Reference (for verification only, do NOT create new SQL files)

```sql
-- Verify categories exist:
SELECT
  pc.parent_category_name,
  sc.sub_category_name,
  ic.item_category_name,
  ic.id as item_category_id,
  ic.amount,
  ic.frequency
FROM billing_item_categories ic
JOIN billing_sub_categories sc ON ic.sub_category_id = sc.id
JOIN billing_parent_categories pc ON sc.parent_category_id = pc.id
WHERE pc.parent_category_name ILIKE '%transport%';
```

---

## Task 3: Service Request Integration

### 3.1: Update Transport Service Request Approval Flow

**Purpose**: When a transport service request is approved (final step), auto-create a transport bill and send a notification.

**Files to Modify**:
- `lib/services/service-requests/service-request-approval-service.ts` (primary)
- `lib/services/service-requests/transport-webhook.ts` (already exists, extend payload)

#### Current Flow (Reference)

The existing approval flow in `ServiceRequestApprovalService.processApproval()` (line 36) already:
1. Validates the request and step
2. Processes approve/reject/return actions
3. Calls `notifyTmsWebhook()` on transport request approval

The `notifyTmsWebhook()` in `transport-webhook.ts` already sends an HMAC-signed POST to `TMS_WEBHOOK_URL`.

#### Changes Needed

**In `service-request-approval-service.ts`** — after the final approval step completes and request status is set to `fulfilled`:

```typescript
// After request.status = 'fulfilled' for transport requests:

// 1. Extract transport details from form_data
const formData = request.form_data as Record<string, unknown>;
const transportDetails = {
  route_id: formData.route_id as string | null,
  boarding_point: formData.pickup_location as string | null,
  drop_point: formData.drop_location as string | null,
  bus_type: formData.bus_type as string | null,
  timing_preference: formData.timing_preference as string | null,
};

// 2. Auto-create transport bill
//    Call the internal billing creation function (not the B2A endpoint).
//    Reuse the same logic as /api/b2a/billing/create-transport-bill
//    but invoked server-side.
try {
  await createTransportBillInternal({
    student_id: request.requester_id,
    institution_id: request.institution_id,
    item_category_id: resolveTransportItemCategory(formData),
    amount: resolveTransportAmount(formData),
    due_date: calculateDueDate(14), // 14 days from approval
    description: `Transport Fee - ${transportDetails.bus_type ?? 'Regular Bus'}`,
    service_request_id: request.id,
  });
} catch (billError) {
  // Log error but DON'T fail the approval
  console.error('[service-requests/approval] Failed to auto-create transport bill:', billError);
  // TODO: Send admin notification about failed auto-billing
}

// 3. Send notification to student
await sendTransportApprovalNotification(request.requester_id, {
  route: transportDetails.route_id,
  boarding_point: transportDetails.boarding_point,
  bus_type: transportDetails.bus_type,
});
```

**New helper file**: `lib/services/service-requests/transport-billing-helper.ts`

```typescript
/**
 * Internal helper to create a transport bill from the approval flow.
 * Shares validation logic with the B2A endpoint but runs server-side
 * without HTTP overhead.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';

interface CreateTransportBillParams {
  student_id: string;
  institution_id: string;
  item_category_id: string;
  amount: number;
  due_date: string;
  description: string;
  service_request_id: string;
}

export async function createTransportBillInternal(
  params: CreateTransportBillParams
): Promise<{ bill_id: string }> {
  const supabase = createServiceRoleClient();

  // Check for existing active transport bill
  const { data: existing } = await supabase
    .from('billing_student_bills')
    .select('id')
    .eq('student_id', params.student_id)
    .eq('item_category_id', params.item_category_id)
    .in('status', ['unpaid', 'partial'])
    .maybeSingle();

  if (existing) {
    throw new Error(`Student already has active transport bill: ${existing.id}`);
  }

  const { data: bill, error } = await supabase
    .from('billing_student_bills')
    .insert({
      student_id: params.student_id,
      institution_id: params.institution_id,
      item_category_id: params.item_category_id,
      unit_amount: params.amount,
      quantity: 1,
      total_amount: params.amount,
      tax_amount: 0,
      final_amount: params.amount,
      balance_amount: params.amount,
      status: 'unpaid',
      due_date: params.due_date,
      bill_description: params.description,
      remarks: `Auto-created from service request ${params.service_request_id}`,
    })
    .select('id')
    .single();

  if (error || !bill) {
    throw new Error(`Failed to create bill: ${error?.message ?? 'unknown'}`);
  }

  return { bill_id: bill.id };
}

/**
 * Resolve the billing item_category_id from the service request form_data.
 * Maps bus_type to the correct billing item category.
 */
export function resolveTransportItemCategory(
  formData: Record<string, unknown>
): string {
  const busType = (formData.bus_type as string)?.toLowerCase() ?? 'regular';

  // These IDs should come from environment variables or a config table
  // set up during Task 2 (billing category setup).
  const categoryMap: Record<string, string> = {
    'regular': process.env.TRANSPORT_REGULAR_BUS_CATEGORY_ID ?? '',
    'ac': process.env.TRANSPORT_AC_BUS_CATEGORY_ID ?? '',
    'adhoc': process.env.TRANSPORT_ADHOC_CATEGORY_ID ?? '',
  };

  const categoryId = categoryMap[busType] || categoryMap['regular'];
  if (!categoryId) {
    throw new Error(`No transport billing category configured for bus type: ${busType}`);
  }

  return categoryId;
}

/**
 * Resolve the transport fee amount from form_data.
 * Falls back to the item_category's default amount.
 */
export function resolveTransportAmount(
  formData: Record<string, unknown>
): number {
  // If the form includes a quoted amount, use it
  if (typeof formData.quoted_amount === 'number' && formData.quoted_amount > 0) {
    return formData.quoted_amount;
  }

  // Otherwise, the amount will be resolved from the item_category's
  // default amount during bill creation
  throw new Error('No amount specified in form_data. Set quoted_amount or configure default.');
}

/**
 * Calculate due date N days from today.
 */
export function calculateDueDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}
```

#### Environment Variables Needed

Add to `.env.local`:

```env
# Transport billing category IDs (from Task 2 setup)
TRANSPORT_REGULAR_BUS_CATEGORY_ID=<uuid-from-billing-categories>
TRANSPORT_AC_BUS_CATEGORY_ID=<uuid-from-billing-categories>
TRANSPORT_ADHOC_CATEGORY_ID=<uuid-from-billing-categories>
```

#### Testing

1. **Approval creates bill**: Submit a transport service request, approve through all steps. Verify a `billing_student_bills` row is created.
2. **Bill failure doesn't block approval**: Set an invalid category ID. Approval should succeed but bill creation should log an error.
3. **No duplicate bills**: Approve same student's transport request twice. Second should skip bill creation (existing bill).
4. **Webhook still fires**: Verify `notifyTmsWebhook()` is still called alongside the new billing logic.

---

### 3.2: Add Auto-Renewal Logic

**Purpose**: Automatically create renewal service requests for students with active transport enrollments before semester boundaries.

**Implementation**: Supabase Edge Function (recommended) or a Next.js cron API route.

**File**: `supabase/functions/transport-renewal/index.ts` (Edge Function) OR `app/api/cron/transport-renewal/route.ts` (Vercel Cron)

#### Option A: Next.js Cron Route (Recommended for Vercel deployment)

**File**: `app/api/cron/transport-renewal/route.ts`

**Trigger**: Vercel Cron, configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/transport-renewal",
      "schedule": "0 6 * * *"
    }
  ]
}
```

#### TypeScript Types

```typescript
interface RenewalCandidate {
  service_request_id: string;
  requester_id: string;
  institution_id: string;
  form_data: Record<string, unknown>;
  semester_end_date: string;
}
```

#### Step-by-Step Logic

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Step 1: Verify cron secret (prevent unauthorized triggers)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const RENEWAL_WINDOW_DAYS = 14; // Start renewal process 14 days before semester end

  // Step 2: Find active transport service requests expiring within the window
  //
  // Query: service_requests
  //   WHERE service_type slug = 'transport-service-request'
  //     AND status = 'fulfilled'
  //     AND form_data->>'semester_end_date' between now() and now() + 14 days
  //     AND NOT EXISTS (renewal already created for next semester)
  //
  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + RENEWAL_WINDOW_DAYS);

  const { data: candidates, error } = await supabase
    .from('service_requests')
    .select(`
      id, requester_id, institution_id, form_data,
      service_type:service_types!inner(slug)
    `)
    .eq('status', 'fulfilled')
    .eq('service_type.slug', 'transport-service-request')
    .lte('form_data->>semester_end_date', windowEnd.toISOString().split('T')[0])
    .gte('form_data->>semester_end_date', new Date().toISOString().split('T')[0]);

  if (error || !candidates?.length) {
    return NextResponse.json({ processed: 0, message: 'No renewal candidates found' });
  }

  let created = 0;
  let notified = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    // Step 3: Check if renewal request already exists
    const { data: existing } = await supabase
      .from('service_requests')
      .select('id')
      .eq('requester_id', candidate.requester_id)
      .eq('form_data->>renewal_of', candidate.id)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    // Step 4: Create draft renewal service request
    const formData = candidate.form_data as Record<string, unknown>;
    const { data: renewal, error: createError } = await supabase
      .from('service_requests')
      .insert({
        requester_id: candidate.requester_id,
        institution_id: candidate.institution_id,
        service_type_id: /* resolve from service_types where slug = 'transport-service-request' */,
        status: 'draft',
        form_data: {
          ...formData,
          renewal_of: candidate.id,
          auto_renewal: true,
          previous_semester: formData.semester,
          // Carry forward route, boarding point, bus type
        },
      })
      .select('id')
      .single();

    if (createError) {
      console.error('[transport-renewal] Failed to create renewal:', createError);
      continue;
    }

    created++;

    // Step 5: Notify student about renewal opportunity
    await supabase.from('notifications').insert({
      title: 'Transport Service Renewal',
      body: `Your transport service expires soon. A renewal request has been drafted. Confirm or opt out within 7 days.`,
      category: 'transport',
      targeting: { user_ids: [candidate.requester_id] },
      url: `/service-requests/${renewal.id}`,
      metadata: { type: 'renewal_reminder', renewal_id: renewal.id },
      created_by: /* system account UUID */,
    });

    notified++;
  }

  // Step 6: Schedule auto-submit job for drafts older than 7 days
  //   (Run in a separate daily cron or as part of this one)
  //   If draft renewal request created_at + 7 days < now() AND status still 'draft':
  //     → Update status to 'submitted'
  //     → Log: "Auto-submitted renewal for {requester_id}"

  return NextResponse.json({
    processed: candidates.length,
    created,
    notified,
    skipped,
  });
}
```

#### Environment Variables

```env
CRON_SECRET=<random-secret-for-cron-auth>
```

#### Testing

1. **Renewal detection**: Create a fulfilled transport request with `semester_end_date` 10 days from now. Run cron. Expect draft renewal created.
2. **No duplicates**: Run cron twice. Second run should skip (renewal already exists).
3. **Notification sent**: Verify notification row in `notifications` table.
4. **Auto-submit**: After 7 days, verify draft auto-advances to `submitted`.
5. **Outside window**: Transport request expiring in 30 days should NOT generate a renewal.

---

## Task 4: Payment Webhook

### 4.1: POST Webhook on Transport Bill Payment

**Purpose**: When a transport bill is paid in MyJKKN, immediately notify TMS so it can update the student's access status without waiting for the next `verify-access` poll.

**Files to Modify**: Extend the existing billing payment confirmation logic.

**Approach**: Add a post-payment hook that checks if the paid bill belongs to a transport category and, if so, sends a webhook to TMS.

#### New File: `lib/services/billing/transport-payment-webhook.ts`

```typescript
/**
 * Sends a webhook to TMS when a transport-category bill is fully paid.
 * Fire-and-forget — never blocks the payment confirmation flow.
 *
 * @module services/billing/transport-payment-webhook
 */

import { createServiceRoleClient } from '@/lib/supabase/server';

interface TransportPaymentPayload {
  event: 'transport_bill.paid';
  timestamp: string;
  user_id: string;
  bill_id: string;
  status: 'paid';
  paid_at: string;
  amount: number;
  institution_id: string;
}

/**
 * Check if a bill belongs to a transport parent category,
 * and if so, POST a webhook to TMS.
 */
export async function notifyTmsPayment(billId: string): Promise<void> {
  const tmsWebhookUrl = process.env.TMS_WEBHOOK_URL;
  if (!tmsWebhookUrl) return;

  try {
    const supabase = createServiceRoleClient();

    // Step 1: Fetch bill with category chain
    const { data: bill } = await supabase
      .from('billing_student_bills')
      .select(`
        id, student_id, institution_id, final_amount, status, payment_date,
        item_category:billing_item_categories(
          sub_category:billing_sub_categories(
            parent_category:billing_parent_categories(
              parent_category_name
            )
          )
        )
      `)
      .eq('id', billId)
      .single();

    if (!bill) return;

    // Step 2: Check if transport category
    const parentName =
      (bill.item_category as any)?.sub_category?.parent_category?.parent_category_name ?? '';

    if (!parentName.toLowerCase().includes('transport')) return;

    // Step 3: Build and send webhook
    const payload: TransportPaymentPayload = {
      event: 'transport_bill.paid',
      timestamp: new Date().toISOString(),
      user_id: bill.student_id,
      bill_id: bill.id,
      status: 'paid',
      paid_at: bill.payment_date ?? new Date().toISOString(),
      amount: bill.final_amount,
      institution_id: bill.institution_id,
    };

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    // HMAC signature (reuse pattern from transport-webhook.ts)
    const webhookSecret = process.env.TMS_WEBHOOK_SECRET;
    if (webhookSecret) {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw', encoder.encode(webhookSecret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
      headers['X-Webhook-Signature'] = `sha256=${Array.from(new Uint8Array(sig))
        .map(b => b.toString(16).padStart(2, '0')).join('')}`;
    }

    // Fire-and-forget to TMS payment webhook endpoint
    const response = await fetch(
      `${tmsWebhookUrl}/api/webhooks/payment-confirmed`,
      { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) }
    );

    // Log delivery attempt
    await supabase.from('webhook_logs').insert({
      event_type: 'transport_bill.paid',
      table_name: 'billing_student_bills',
      record_id: billId,
      payload,
      http_status: response.status,
      error_message: response.ok ? null : `HTTP ${response.status}`,
    });

  } catch (error) {
    console.error('[billing/transport-payment-webhook] Delivery error:', error);
  }
}
```

#### Integration Point

Find the payment confirmation handler in the billing module (likely in the receipt creation or payment processing service). Add a fire-and-forget call after a bill's status is updated to `'paid'`:

```typescript
// After bill status updated to 'paid':
import { notifyTmsPayment } from '@/lib/services/billing/transport-payment-webhook';

// Fire-and-forget — don't await, don't block payment
void notifyTmsPayment(billId);
```

#### Environment Variables (Already Defined)

```env
TMS_WEBHOOK_URL=https://tms.jkkn.ai    # base URL, endpoint path appended in code
TMS_WEBHOOK_SECRET=<shared-hmac-secret>
```

#### Testing

1. **Transport bill paid**: Pay a transport bill. Verify webhook fires to `tms.jkkn.ai/api/webhooks/payment-confirmed`.
2. **Non-transport bill**: Pay a tuition bill. Verify no webhook fires.
3. **Webhook logged**: Check `webhook_logs` table for the delivery record.
4. **Failure resilience**: Block the webhook URL. Verify payment still completes; error is logged.
5. **HMAC signature**: Verify `X-Webhook-Signature` header is present and correct.

---

## Task 5: Permission Definitions

### 5.1: Add TMS Permissions to Custom Roles

**Type**: Database data + admin UI action

#### TMS Permission Keys

```json
{
  "tms.routes.manage": true,
  "tms.vehicles.manage": true,
  "tms.drivers.manage": true,
  "tms.schedules.manage": true,
  "tms.bookings.view_all": true,
  "tms.attendance.manage": true,
  "tms.grievances.manage": true,
  "tms.reports.view": true,
  "tms.settings.manage": true
}
```

#### New Custom Roles to Create

**Role 1: `transport_manager`**

| Field         | Value                                                    |
|---------------|----------------------------------------------------------|
| role_key      | `transport_manager`                                      |
| role_name     | `Transport Manager`                                      |
| description   | `Full access to Transport Management System`             |
| is_system_role| `true`                                                   |
| permissions   | All 9 `tms.*` permissions set to `true`                  |

**Role 2: `transport_staff`**

| Field         | Value                                                    |
|---------------|----------------------------------------------------------|
| role_key      | `transport_staff`                                        |
| role_name     | `Transport Staff`                                        |
| description   | `Limited TMS access: attendance, bookings, grievances`   |
| is_system_role| `true`                                                   |
| permissions   | Only these set to `true`:                                |

```json
{
  "tms.attendance.manage": true,
  "tms.bookings.view_all": true,
  "tms.grievances.manage": true
}
```

#### SQL to Insert (run via Supabase Dashboard or MCP)

```sql
-- transport_manager role
INSERT INTO custom_roles (role_key, role_name, description, is_system_role, permissions)
VALUES (
  'transport_manager',
  'Transport Manager',
  'Full access to Transport Management System',
  true,
  '{
    "tms.routes.manage": true,
    "tms.vehicles.manage": true,
    "tms.drivers.manage": true,
    "tms.schedules.manage": true,
    "tms.bookings.view_all": true,
    "tms.attendance.manage": true,
    "tms.grievances.manage": true,
    "tms.reports.view": true,
    "tms.settings.manage": true
  }'::jsonb
)
ON CONFLICT (role_key) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  updated_at = now();

-- transport_staff role
INSERT INTO custom_roles (role_key, role_name, description, is_system_role, permissions)
VALUES (
  'transport_staff',
  'Transport Staff',
  'Limited TMS access: attendance, bookings, grievances',
  true,
  '{
    "tms.attendance.manage": true,
    "tms.bookings.view_all": true,
    "tms.grievances.manage": true
  }'::jsonb
)
ON CONFLICT (role_key) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  updated_at = now();
```

#### Testing

1. Query `custom_roles` to verify both roles exist with correct permissions.
2. Assign `transport_manager` to a user via `user_roles` table.
3. Call `GET /api/b2a/auth/permissions?user_id=<that user>`. Verify all 9 `tms.*` permissions returned.
4. Assign `transport_staff` to another user. Verify only 3 `tms.*` permissions returned.

---

### 5.2: Add 'tms' to Valid API Modules

**File**: `lib/api-keys/authenticate.ts`

**Change**: Add `'tms'` to the `VALID_MODULES` array (line 9-18).

#### Before

```typescript
export const VALID_MODULES = [
  'academic',
  'admission', 'attendance', 'billing', 'grievance', 'okr',
  'learners', 'staff', 'organizations', 'campus-living', 'solutions',
  'learners-council', 'competency', 'learning-paths', 'alumni',
  'facilitator', 'industry', 'parent-portal', 'social-media',
  'vac', 'maturity-assessment', 'process-excellence', 'notifications',
  'resource-management', 'bug-reports', 'stakeholder-nps', 'audit-trail',
  'morning-brief',
] as const;
```

#### After

```typescript
export const VALID_MODULES = [
  'academic',
  'admission', 'attendance', 'billing', 'grievance', 'okr',
  'learners', 'staff', 'organizations', 'campus-living', 'solutions',
  'learners-council', 'competency', 'learning-paths', 'alumni',
  'facilitator', 'industry', 'parent-portal', 'social-media',
  'vac', 'maturity-assessment', 'process-excellence', 'notifications',
  'resource-management', 'bug-reports', 'stakeholder-nps', 'audit-trail',
  'morning-brief', 'tms',
] as const;
```

#### Testing

1. Create an API key with `permissions: { read: ['tms'], write: [] }`.
2. Call `GET /api/b2a/tms/verify-access` with that key. Should authenticate successfully.
3. Call `POST /api/b2a/billing/create-transport-bill` with that key. Should get 403 (no billing write).

---

## Task 6: MyJKKN UI Changes

### 6.1: Add Transport Link to Sidebar

**File**: `lib/sidebarMenuLink.ts`

**Change**: Add a "Transport" menu item that links to `tms.jkkn.ai`.

#### Implementation

Add a new entry to the appropriate section in the sidebar menu configuration. The sidebar uses `MenuItem` objects with `href`, `label`, `icon`, and permission-based visibility.

```typescript
// Add to the menu items array, after existing module links:
{
  href: 'https://tms.jkkn.ai',
  label: 'Transport',
  icon: Bus,  // from lucide-react
  // External link — opens in same tab (or new tab based on preference)
}
```

**Import needed**: Add `Bus` to the lucide-react imports at the top of the file.

#### Visibility Condition

The transport link should be visible when:
1. User has **any** `tms.*` permission in their custom role, OR
2. User has an **active transport enrollment** (fulfilled transport service request)

Add to the permission-filtering logic:

```typescript
// In the filtering function that determines menu visibility:
const hasTmsAccess = (permissions: Record<string, boolean>) =>
  Object.keys(permissions).some(key => key.startsWith('tms.') && permissions[key]);

// Or check for active enrollment via a separate flag passed from the layout
```

#### Testing

1. **Admin with TMS role**: Log in as transport_manager. Verify "Transport" link appears in sidebar.
2. **Student with enrollment**: Log in as student with active transport request. Verify link appears.
3. **User without TMS access**: Log in as a regular faculty member. Verify link does NOT appear.
4. **Link behavior**: Click the link. Verify navigation to `tms.jkkn.ai`.

---

### 6.2: Transport Request Status Card on Dashboard

**Purpose**: Show students their transport enrollment status directly on the MyJKKN dashboard.

**File**: New component `app/(routes)/dashboard/_components/transport-status-card.tsx`

#### Component States

| State                    | Visual                                         | Action                        |
|--------------------------|------------------------------------------------|-------------------------------|
| No transport service     | Muted card with bus icon                       | CTA button "Request Transport" linking to `/service-requests/new?type=transport-service-request` |
| Request pending          | Progress stepper (submitted → review → approved) | Show current step name + estimated wait |
| Route assigned, payment due | Alert card with amount + grace period countdown | "Pay Now" button linking to billing, grace countdown timer |
| Active                   | Green success card with route info              | "Open TMS" button linking to `tms.jkkn.ai` |

#### TypeScript Types

```typescript
interface TransportStatusData {
  state: 'none' | 'pending' | 'payment_due' | 'active';
  service_request?: {
    id: string;
    status: string;
    current_step: string;
    submitted_at: string;
  };
  billing?: {
    bill_id: string;
    amount: number;
    balance_amount: number;
    due_date: string;
    grace_expires_at: string | null;
  };
  enrollment?: {
    route_name: string | null;
    boarding_point: string | null;
    bus_type: string | null;
  };
}
```

#### Data Fetching

Create a React Query hook: `hooks/transport/use-transport-status.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export function useTransportStatus(userId: string | undefined) {
  return useQuery({
    queryKey: ['transport-status', userId],
    queryFn: async (): Promise<TransportStatusData> => {
      if (!userId) return { state: 'none' };

      const supabase = createClientSupabaseClient();

      // 1. Check for active/pending transport service requests
      const { data: serviceRequest } = await supabase
        .from('service_requests')
        .select(`
          id, status, form_data, created_at,
          service_type:service_types!inner(slug)
        `)
        .eq('requester_id', userId)
        .eq('service_type.slug', 'transport-service-request')
        .in('status', ['submitted', 'in_review', 'fulfilled'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!serviceRequest) return { state: 'none' };

      if (['submitted', 'in_review'].includes(serviceRequest.status)) {
        return {
          state: 'pending',
          service_request: {
            id: serviceRequest.id,
            status: serviceRequest.status,
            current_step: serviceRequest.status === 'submitted' ? 'Submitted' : 'Under Review',
            submitted_at: serviceRequest.created_at,
          },
        };
      }

      // 2. If fulfilled, check billing status
      // (query transport bills for this user)
      // ...determine if paid or payment_due

      return { state: 'active', /* ... */ };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

#### Component Skeleton

```tsx
// app/(routes)/dashboard/_components/transport-status-card.tsx

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bus, ArrowRight, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { useTransportStatus } from '@/hooks/transport/use-transport-status';
import Link from 'next/link';

interface Props {
  userId: string;
}

export function TransportStatusCard({ userId }: Props) {
  const { data, isLoading } = useTransportStatus(userId);

  if (isLoading) return <TransportCardSkeleton />;
  if (!data) return null;

  switch (data.state) {
    case 'none':
      return (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-muted-foreground">
              <Bus className="h-5 w-5" /> Transport Service
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              No transport service active. Request bus transport for your daily commute.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/service-requests/new?type=transport-service-request">
                Request Transport <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      );

    case 'pending':
      return (
        <Card className="border-blue-200 bg-blue-50/50">
          {/* Progress stepper UI */}
        </Card>
      );

    case 'payment_due':
      return (
        <Card className="border-amber-200 bg-amber-50/50">
          {/* Amount + Pay Now + grace countdown */}
        </Card>
      );

    case 'active':
      return (
        <Card className="border-green-200 bg-green-50/50">
          {/* Route info + Open TMS button */}
        </Card>
      );
  }
}
```

#### Integration into Dashboard

Find the student dashboard page and add the `TransportStatusCard`:

```tsx
// In the student dashboard component:
import { TransportStatusCard } from './_components/transport-status-card';

// Inside the dashboard grid:
<TransportStatusCard userId={user.id} />
```

#### Testing

1. **No enrollment**: Log in as student with no transport activity. See "Request Transport" CTA.
2. **Pending request**: Submit a transport request but don't approve it. See progress stepper.
3. **Payment due**: Approve request (creates bill). See amount and pay button.
4. **Active**: Pay the bill. See green card with "Open TMS" button.
5. **Responsiveness**: Test on mobile viewport.

---

## Task 7: API Key Setup

### 7.1: Create TMS API Key

**Type**: Admin action (not code)

**Purpose**: Create a dedicated API key that TMS will use to authenticate with MyJKKN's B2A endpoints.

#### Key Configuration

| Field          | Value                                                            |
|----------------|------------------------------------------------------------------|
| Name           | `TMS Application`                                                |
| Permissions    | `{ "read": ["tms", "billing", "notifications", "learners", "organizations"], "write": ["billing", "notifications"] }` |
| Institution    | Bind to specific institution (or `null` for multi-institution)   |
| Expires        | `null` (no expiration, revoke manually if compromised)           |

#### Creation Steps

1. Navigate to **Admin > API Keys** in MyJKKN (or use the Supabase SQL editor).
2. Generate a random key in the format `jkkn_<64-char-hex>`.
3. SHA-256 hash the key and store the hash in the `api_keys` table.
4. Record the **unhashed** key securely. It cannot be recovered after creation.
5. Share the key with the TMS deployment team for their `.env` configuration.

#### SQL Reference

```sql
-- Verify the key was created correctly:
SELECT id, name, is_active, permissions, expires_at, last_used_at
FROM api_keys
WHERE name = 'TMS Application';

-- Expected permissions:
-- {
--   "read": ["tms", "billing", "notifications", "learners", "organizations"],
--   "write": ["billing", "notifications"]
-- }
```

#### TMS Environment Variable

The TMS application will configure:

```env
MYJKKN_API_KEY=jkkn_<the-unhashed-key>
MYJKKN_API_BASE_URL=https://myjkkn.jkkn.ai/api/b2a
```

#### Testing

1. Use the key to call `GET /api/b2a/tms/verify-access`. Should succeed (tms read).
2. Use the key to call `POST /api/b2a/billing/create-transport-bill`. Should succeed (billing write).
3. Use the key to call `POST /api/b2a/notifications/send`. Should succeed (notifications write).
4. Use the key to call a module not in permissions (e.g., `GET /api/b2a/okr/stats`). Should get 403.

---

## Dependency Order

Tasks should be implemented in this order due to dependencies:

```
Task 5.2 (Add 'tms' to VALID_MODULES)
  └── Task 1.1 (verify-access endpoint)
  └── Task 1.2 (batch users endpoint)
  └── Task 1.3 (permissions endpoint)
  └── Task 1.4 (notifications/send endpoint)
  └── Task 1.5 (create-transport-bill endpoint)

Task 2 (Billing category setup) — data, no code dependency
  └── Task 3.1 (Approval flow integration) — needs category IDs from Task 2
  └── Task 1.5 (create-transport-bill) — needs categories to validate against

Task 5.1 (Custom roles) — data, no code dependency
  └── Task 1.3 (permissions endpoint) — returns TMS permissions from roles

Task 4 (Payment webhook) — can be done independently
Task 6.1 (Sidebar link) — can be done independently
Task 6.2 (Dashboard card) — can be done independently
Task 3.2 (Auto-renewal) — can be done last, lowest priority

Task 7 (API key setup) — do last, after all endpoints are deployed
```

### Suggested Sprint Plan

| Sprint   | Tasks                                | Estimated Effort |
|----------|--------------------------------------|------------------|
| Sprint 1 | 5.2, 1.1, 1.2, 1.3, 5.1             | 2-3 days         |
| Sprint 2 | 1.4, 1.5, 2 (admin setup)            | 2-3 days         |
| Sprint 3 | 3.1, 4, 6.1                          | 2-3 days         |
| Sprint 4 | 6.2, 3.2, 7 (key setup + E2E test)   | 2-3 days         |

---

## Environment Variables Summary

Add these to `.env.local` (and Vercel/deployment env):

```env
# Transport billing category IDs (from Task 2)
TRANSPORT_REGULAR_BUS_CATEGORY_ID=
TRANSPORT_AC_BUS_CATEGORY_ID=
TRANSPORT_ADHOC_CATEGORY_ID=

# TMS webhook (may already exist from transport-webhook.ts)
TMS_WEBHOOK_URL=https://tms.jkkn.ai
TMS_WEBHOOK_SECRET=<shared-hmac-secret>

# Cron authentication (for Task 3.2)
CRON_SECRET=<random-secret>
```

---

## Files Created / Modified Summary

### New Files

| File                                                          | Task  |
|---------------------------------------------------------------|-------|
| `app/api/b2a/tms/verify-access/route.ts`                     | 1.1   |
| `app/api/b2a/tms/users/batch/route.ts`                       | 1.2   |
| `app/api/b2a/auth/permissions/route.ts`                       | 1.3   |
| `app/api/b2a/notifications/send/route.ts`                     | 1.4   |
| `app/api/b2a/billing/create-transport-bill/route.ts`          | 1.5   |
| `lib/services/service-requests/transport-billing-helper.ts`   | 3.1   |
| `lib/services/billing/transport-payment-webhook.ts`           | 4.1   |
| `app/api/cron/transport-renewal/route.ts`                     | 3.2   |
| `app/(routes)/dashboard/_components/transport-status-card.tsx` | 6.2   |
| `hooks/transport/use-transport-status.ts`                     | 6.2   |

### Modified Files

| File                                                              | Task  | Change                                      |
|-------------------------------------------------------------------|-------|---------------------------------------------|
| `lib/api-keys/authenticate.ts`                                    | 5.2   | Add `'tms'` to VALID_MODULES                |
| `lib/sidebarMenuLink.ts`                                          | 6.1   | Add Transport menu item with Bus icon       |
| `lib/services/service-requests/service-request-approval-service.ts` | 3.1 | Add auto-billing on transport approval      |
| Billing payment handler (locate exact file)                        | 4.1   | Add `void notifyTmsPayment(billId)` call    |
| Student dashboard page                                             | 6.2   | Add `<TransportStatusCard />`               |

### Data Changes (Admin / SQL)

| Change                              | Task |
|--------------------------------------|------|
| Create transport billing categories  | 2    |
| Insert `transport_manager` role      | 5.1  |
| Insert `transport_staff` role        | 5.1  |
| Create TMS API key                   | 7    |
