# Action Required Notifications Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Extend the mandatory acknowledgment system to support ACTION confirmation — users must submit a response (text/file/form/link), not just tap "I Acknowledge."

**Architecture:** Two mechanisms — Urgent Actions (screen-blocking modal with response form) and Tracked Actions (persistent dashboard cards with deadline tracking). Both reuse the existing notification pipeline, targeting, push, and escalation infrastructure.

**Tech Stack:** Next.js 16, TypeScript, Supabase (PostgreSQL), React Query, shadcn/ui, web-push

**Spec:** `docs/SPEC-action-required.md`

---

## Execution Strategy

```
Phase 1: DB Migration ──► Phase 2: Types (MUST complete first)
                                    │
                    ┌───────────────┼───────────────┐───────────────┐
                    ▼               ▼               ▼               ▼
              Phase 3:        Phase 4:        Phase 5:        Phase 6:
              API Routes      ActionGate      Dashboard       Admin Form
              (6 endpoints)   (blocking)      Widget          + Analytics
                    │               │               │               │
                    └───────────────┴───────────────┴───────────────┘
                                    │
                              Phase 7: Send API + Cron extension
                                    │
                              Phase 8: Integration wiring (layout.tsx)
                                    │
                              Phase 9: /fresh-eyes review
                                    │
                              Phase 10: PR via translator pattern
```

**CRITICAL:** Phase 2 (Types) MUST complete before Phases 3-6 start. This prevents the vocabulary mismatch disaster from PR #113 (where 4 agents invented incompatible field names).

---

## Phase 1: Database Migration (via Supabase MCP — NOT code file)

### Task 1.1: Add columns to notifications table

**Apply via:** `mcp__supabase__apply_migration`

```sql
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS action_type TEXT DEFAULT NULL
    CHECK (action_type IN ('urgent', 'tracked', NULL)),
  ADD COLUMN IF NOT EXISTS action_config JSONB DEFAULT NULL;

COMMENT ON COLUMN notifications.action_type IS 'urgent = screen-blocking response required, tracked = dashboard card with deadline';
COMMENT ON COLUMN notifications.action_config IS '{ response_type: text|file|form|link, form_items?: [...], link_url?: string, escalation_chain?: [...] }';
```

**Verify:** `SELECT column_name FROM information_schema.columns WHERE table_name='notifications' AND column_name IN ('action_type','action_config');` → 2 rows

### Task 1.2: Create action_responses table

**Apply via:** `mcp__supabase__apply_migration`

```sql
CREATE TABLE IF NOT EXISTS action_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id),
  user_id UUID NOT NULL REFERENCES profiles(id),
  response_type TEXT NOT NULL CHECK (response_type IN ('text', 'file', 'form', 'link')),
  text_response TEXT,
  file_url TEXT,
  file_name TEXT,
  file_size INTEGER,
  form_response JSONB,
  link_confirmed BOOLEAN DEFAULT FALSE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(notification_id, user_id)
);

CREATE INDEX idx_action_responses_notification ON action_responses(notification_id);
CREATE INDEX idx_action_responses_user ON action_responses(user_id);
ALTER TABLE action_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "action_responses_own" ON action_responses
  FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "action_responses_admin" ON action_responses
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
```

**Verify:** `SELECT table_name FROM information_schema.tables WHERE table_name='action_responses';` → 1 row

### Task 1.3: Create action_extension_requests table

**Apply via:** `mcp__supabase__apply_migration`

```sql
CREATE TABLE IF NOT EXISTS action_extension_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id),
  user_id UUID NOT NULL REFERENCES profiles(id),
  reason TEXT NOT NULL,
  requested_deadline TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_extension_requests_lookup ON action_extension_requests(notification_id, user_id);
ALTER TABLE action_extension_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "extension_own" ON action_extension_requests
  FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "extension_admin" ON action_extension_requests
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
```

### Task 1.4: Create get_pending_actions DB function

**Apply via:** `mcp__supabase__apply_migration`

Use the exact SQL from spec section 4.4, including the REVOKE statements:

```sql
-- [paste from spec section 4.4]

-- CRITICAL: Only service_role can execute
REVOKE EXECUTE ON FUNCTION get_pending_actions(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_pending_actions(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION get_pending_actions(UUID) FROM authenticated;
```

**Verify:** `SELECT routine_name FROM information_schema.routines WHERE routine_name='get_pending_actions';` → 1 row
**Verify ACL:** `SELECT grantee FROM information_schema.routine_privileges WHERE routine_name='get_pending_actions';` → only `postgres` and `service_role`

### Task 1.5: Reload PostgREST schema cache

```sql
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
```

---

## Phase 2: Types (MUST complete before Phases 3-6)

### Task 2.1: Add action types to types/notifications.ts

**File:** Modify `types/notifications.ts`

Add after the `VerificationQuestion` interface (around line 135):

```typescript
// ==================== ACTION REQUIRED SYSTEM ====================

export type ActionType = 'urgent' | 'tracked';
export type ResponseType = 'text' | 'file' | 'form' | 'link';

export interface FormItem {
  id: string;
  title: string;
  description?: string;
}

export interface ActionConfig {
  response_type: ResponseType;
  form_items?: FormItem[];
  link_url?: string;
  min_text_length?: number;
  max_file_size_mb?: number;
  allowed_file_types?: string[];
  escalation_chain?: string[];
}

export interface ActionResponse {
  id: string;
  notification_id: string;
  user_id: string;
  response_type: ResponseType;
  text_response?: string;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  form_response?: Record<string, boolean>; // { item_id: completed }
  link_confirmed?: boolean;
  submitted_at: string;
  created_at: string;
}

export interface ExtensionRequest {
  id: string;
  notification_id: string;
  user_id: string;
  reason: string;
  requested_deadline: string;
  status: 'pending' | 'approved' | 'denied';
  reviewed_by?: string;
  reviewed_at?: string;
  review_note?: string;
  created_at: string;
}

export interface PendingAction {
  id: string;
  notification_id: string;
  title: string;
  body: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category: string;
  action_type: ActionType;
  action_config: ActionConfig;
  acknowledgment_deadline_hours: number;
  sent_at: string;
  created_by_name: string;
  deadline_at: string;
  is_overdue: boolean;
  has_responded: boolean;
  extension_request?: {
    status: 'pending' | 'approved' | 'denied';
    requested_deadline: string;
  };
  metadata?: {
    attachments?: NotificationAttachment[];
    [key: string]: any;
  };
}
```

Also extend `CreateNotificationRequest`:

```typescript
// Add to existing CreateNotificationRequest interface:
  action_type?: ActionType;
  action_config?: ActionConfig;
```

**Verify:** `npx tsc --noEmit 2>&1 | grep "notifications.ts" | head -5` → 0 errors on this file

---

## Phase 3: API Routes (6 new endpoints)

Can run IN PARALLEL with Phases 4-6 (different files).

### Task 3.1: GET /api/notifications/pending-actions

**File:** Create `app/api/notifications/pending-actions/route.ts`

```typescript
export const dynamic = 'force-dynamic';
import { NextResponse, connection } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function GET() {
  await connection();
  // Auth via createServerSupabaseClient → getUser()
  // Call serviceClient.rpc('get_pending_actions', { p_user_id: user.id })
  // Return { actions: PendingAction[], urgent_count, tracked_count }
  // Headers: Cache-Control: private, no-store
}
```

**Pattern:** Follow `app/api/notifications/acknowledge/route.ts` GET handler — same auth + service role RPC pattern.

### Task 3.2: POST /api/notifications/submit-action

**File:** Create `app/api/notifications/submit-action/route.ts`

```typescript
// Auth required
// Validate: notification_id, response matches action_config.response_type
// For file: accept base64 or URL (already uploaded via StorageUtils)
// For form: validate all form_items have a response
// For text: validate min length
// Insert into action_responses (UNIQUE constraint prevents double submit)
// Return { success: true, submitted_at }
```

### Task 3.3: POST /api/notifications/request-extension

**File:** Create `app/api/notifications/request-extension/route.ts`

```typescript
// Auth required
// Validate: notification_id, reason (min 10 chars), requested_deadline (must be future)
// Check no approved extension already exists
// Insert into action_extension_requests
// Return { id, status: 'pending' }
```

### Task 3.4: PUT /api/admin/notifications/review-extension/[id]/route.ts

**File:** Create `app/api/admin/notifications/review-extension/[id]/route.ts`

```typescript
// Super admin only
// Accept: { status: 'approved' | 'denied', review_note?: string }
// Update action_extension_requests
// If approved: optionally update notification deadline
// Return updated record
```

### Task 3.5: GET /api/admin/notifications/[id]/responses/route.ts

**File:** Create `app/api/admin/notifications/[id]/responses/route.ts`

```typescript
// Super admin only
// Fetch all action_responses for this notification
// Join with profiles for name/email/role/institution
// Return { responses: ActionResponse[], total, responded_count, pending_count }
```

### Task 3.6: Extend POST /api/notifications/send

**File:** Modify `app/api/notifications/send/route.ts`

Add `action_type` and `action_config` to the notification insert (around line 73):

```typescript
// In the .insert() call, add:
action_type: notificationData.action_type || null,
action_config: notificationData.action_config || null,
```

Also update the push payload (around line 391) for action notifications:

```typescript
const isAction = notification.action_type != null;
// If action: prefix with "⚡ ACTION REQUIRED:" instead of "⚠️ ACTION REQUIRED:"
```

---

## Phase 4: ActionGate Component (screen-blocking)

Can run IN PARALLEL with Phases 3, 5, 6.

### Task 4.1: Create ActionGate component

**File:** Create `components/notifications/action-gate.tsx`

**Pattern:** Copy structure from `components/notifications/acknowledgment-gate.tsx` but replace the "I Acknowledge" button area with a response form.

Key differences from AcknowledgmentGate:
- Fetches from `/api/notifications/pending-actions` (not `/api/notifications/acknowledge`)
- Filters for `action_type === 'urgent'` only
- Shows response form based on `action_config.response_type`
- Has "Request Extension" secondary button
- Submit calls `POST /api/notifications/submit-action`

Response form components (inline, not separate files):
- `TextResponseForm`: Textarea + char counter + Submit
- `FileResponseForm`: File input + preview + Submit (uses existing `StorageUtils.uploadFile`)
- `FormResponseForm`: Checklist rendering from `action_config.form_items` + Submit when all checked
- `LinkResponseForm`: Link display + "I have visited this link" checkbox + Submit

### Task 4.2: Wire ActionGate into layout

**File:** Modify `app/(routes)/layout.tsx`

Add ActionGate AFTER AcknowledgmentGate (line 18):

```tsx
import { ActionGate } from '@/components/notifications/action-gate';

// In the render:
<AcknowledgmentGate>
  <ActionGate>
    <AdminPanelLayout>
      {children}
    ...
    </AdminPanelLayout>
  </ActionGate>
</AcknowledgmentGate>
```

**Logic:** AcknowledgmentGate blocks first (read confirmation). Once acknowledged, ActionGate blocks (action confirmation). This is the correct order — you must read before you can act.

---

## Phase 5: Dashboard Widget (non-blocking tracked actions)

Can run IN PARALLEL with Phases 3, 4, 6.

### Task 5.1: Create ActionItemsWidget component

**File:** Create `components/notifications/action-items-widget.tsx`

```typescript
// Fetches from /api/notifications/pending-actions
// Filters for action_type === 'tracked' only
// Shows cards with: title, sender, deadline countdown, progress bar
// Color coding: green (>50% time), yellow (25-50%), red (<25%), destructive (overdue)
// "Respond" button opens a Dialog with the response form
// Uses useQuery with refetchInterval: 60000
```

### Task 5.2: Add widget to dashboard page

**File:** Modify `app/(routes)/page.tsx`

Add ActionItemsWidget at the TOP of the dashboard (before BentoGrid), wrapped in Suspense:

```tsx
import { ActionItemsWidget } from '@/components/notifications/action-items-widget';

// In the render (around line 27, before BentoGrid section):
<Suspense fallback={<LoadingSkeleton />}>
  <ActionItemsWidget />
</Suspense>
```

---

## Phase 6: Admin Form + Analytics Extension

Can run IN PARALLEL with Phases 3, 4, 5.

### Task 6.1: Extend notification form with action fields

**File:** Modify `app/(routes)/admin/notifications/_components/notification-form.tsx`

Add to zod schema (after `acknowledgment_deadline_hours`):
```typescript
action_type: z.enum(['urgent', 'tracked']).optional(),
action_response_type: z.enum(['text', 'file', 'form', 'link']).optional(),
action_form_items: z.array(z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().optional()
})).optional(),
action_link_url: z.string().url().optional(),
```

Add UI section after "Mandatory Acknowledgment" section (around line 1108):
- Show ONLY when `category === 'Action Required'`
- Urgency toggle: Urgent / Tracked
- Response type selector: Text / File / Form / Link
- Conditional: if Form → dynamic checklist builder
- Conditional: if Link → URL input

Add to submit handler `notificationData`:
```typescript
action_type: data.action_type || undefined,
action_config: data.action_type ? {
  response_type: data.action_response_type,
  form_items: data.action_form_items,
  link_url: data.action_link_url,
} : undefined,
```

### Task 6.2: Add "Responses" tab to notification analytics

**File:** Modify `app/(routes)/admin/notifications/[id]/_components/notification-analytics.tsx`

Add a 4th tab "Responses" alongside Institution / Role / People:
- Fetches from `GET /api/admin/notifications/[id]/responses`
- Shows response cards with: user name, role, institution, response content, timestamp
- For text: truncated + expandable
- For file: download link with file name + size
- For form: checklist with green checks
- For link: "Confirmed" / "Not confirmed" badge

---

## Phase 7: Cron Extension (after Phases 3-6)

### Task 7.1: Add tracked action reminders to cron processor

**File:** Modify `app/api/cron/notification-processor/route.ts`

Add after existing escalation logic:

```typescript
// TRACKED ACTION REMINDERS
// Find tracked actions where deadline is approaching
// Send push at: 50% (halfway), 75% (3/4 done), 90% (almost due)
// Use escalation_level to prevent duplicate sends:
//   3 = 50% reminder sent
//   4 = 75% reminder sent
//   5 = 90% reminder sent
```

---

## Phase 8: Integration Wiring

### Task 8.1: Add "Action Required" to notification categories

**File:** Modify `app/(routes)/admin/notifications/_components/notification-form.tsx`

Add to `notificationCategories` array (around line 54):
```typescript
'Action Required'
```

### Task 8.2: Add category to notification center

**File:** Modify `app/(routes)/notifications/_components/notification-center.tsx`

Add to `CATEGORIES` array:
```typescript
{ key: 'Action Required', label: 'Actions', icon: Zap },
```

---

## Phase 9: Fresh-Eyes Review (MANDATORY before merge)

Run `/fresh-eyes` on all changed files. The fresh-eyes swarm will:
1. Hunt bugs, edge cases, logic errors, security issues, DX issues, UX issues
2. Fix findings in the PR branch
3. Verify build passes

**CRITICAL:** Do NOT merge until fresh-eyes passes. Lesson from PR #113.

---

## Phase 10: Ship via Translator Pattern

### Task 10.1: Create worktree and PR

```bash
git fetch jicate main
git worktree add /tmp/myjkkn-actions -b feat/action-required-notifications jicate/main
# Copy all changed files to worktree
# Commit with descriptive message
# Push and create PR
```

### Task 10.2: Deploy after merge

Use `/deploy-myjkkn` with audit-first approach:
1. Verify PR is merged
2. Check if already deployed
3. If not, fire deploy hook
4. Verify all endpoints

---

## File Inventory

### New Files (10)

| File | Phase | Agent |
|------|-------|-------|
| `app/api/notifications/pending-actions/route.ts` | 3 | A |
| `app/api/notifications/submit-action/route.ts` | 3 | A |
| `app/api/notifications/request-extension/route.ts` | 3 | A |
| `app/api/admin/notifications/review-extension/[id]/route.ts` | 3 | A |
| `app/api/admin/notifications/[id]/responses/route.ts` | 3 | A |
| `components/notifications/action-gate.tsx` | 4 | B |
| `components/notifications/action-items-widget.tsx` | 5 | C |
| (no new page files — extends existing) | | |

### Modified Files (5)

| File | Phase | Agent |
|------|-------|-------|
| `types/notifications.ts` | 2 | Lead (before agents) |
| `app/api/notifications/send/route.ts` | 3 | A |
| `app/(routes)/layout.tsx` | 8 | Lead |
| `app/(routes)/admin/notifications/_components/notification-form.tsx` | 6 | D |
| `app/(routes)/admin/notifications/[id]/_components/notification-analytics.tsx` | 6 | D |

### Files NOT Modified (existing, reused as-is)

- `components/notifications/acknowledgment-gate.tsx` — ActionGate references its patterns but doesn't import it
- `app/api/cron/notification-processor/route.ts` — Phase 7 extends this
- `app/(routes)/notifications/_components/notification-center.tsx` — Phase 8 adds category
- `app/(routes)/page.tsx` — Phase 5 adds widget

---

## Parallel Agent Assignment

| Agent | Phases | Files (non-overlapping) |
|-------|--------|------------------------|
| **Lead** | 1 (DB), 2 (types), 8 (wiring) | Migration, `types/notifications.ts`, `layout.tsx` |
| **A** | 3 | 6 new API routes + send route modification |
| **B** | 4 | `action-gate.tsx` |
| **C** | 5 | `action-items-widget.tsx` + `page.tsx` dashboard |
| **D** | 6 | `notification-form.tsx` + `notification-analytics.tsx` |
| **E** | 7 | `notification-processor/route.ts` (cron) |

**Spawn order:** Lead does Phases 1-2 first. Then spawn A, B, C, D, E in parallel.

---

## Verification Commands

After each phase:

```bash
# Type check (our files only)
npx tsc --noEmit 2>&1 | grep -E "(action-gate|action-items|pending-actions|submit-action|request-extension|review-extension|responses)" | head -10

# Build check
npm run build 2>&1 | tail -20

# Endpoint check (after deploy)
BASE="https://www.jkkn.ai"
curl -s -o /dev/null -w '%{http_code}' $BASE/api/notifications/pending-actions
curl -s -o /dev/null -w '%{http_code}' $BASE/api/notifications/submit-action
curl -s -o /dev/null -w '%{http_code}' $BASE/api/notifications/request-extension
```
