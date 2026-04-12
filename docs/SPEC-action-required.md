# SPEC: Action Required Notifications + Task Tracker

**Module:** Notification System Extension
**Platform:** MyJKKN (jkkn.ai)
**Status:** Ready for Implementation
**Date:** 2026-04-12
**Extends:** PRs #93-#118 (Mandatory Acknowledgment System)

---

## 1. Problem Statement

JKKN uses Google Chat to assign tasks/actions to 400+ staff and 5000+ learners. Two failure modes:
1. **People don't act** — they read messages but don't complete the action
2. **Admin forgets to follow up** — the assignment disappears into chat history

The acknowledgment system (PRs #93-#118) solved READ confirmation. This spec extends it to ACTION confirmation — proving someone DID something, not just that they SAW it.

---

## 2. Two Mechanisms

### 2.1 Urgent Actions (Screen-Blocking)

For critical, time-sensitive items that MUST happen within hours.

| Aspect | Detail |
|--------|--------|
| **Trigger** | Admin sends notification with `action_type: 'urgent'` |
| **UX** | Full-screen blocking modal (extends AcknowledgmentGate) |
| **User options** | Submit response OR Request extension |
| **Response types** | Text, File upload, Form response, Link confirmation |
| **Deadline** | 1-72 hours (default: 4 hours per JKKN SOP) |
| **Escalation** | Auto to HOD after deadline via existing cron |
| **Examples** | Submit internal marks, Approve OD request, Respond to complaint |

### 2.2 Tracked Actions (Dashboard, Non-Blocking)

For ongoing tasks with deadlines spanning days/weeks.

| Aspect | Detail |
|--------|--------|
| **Trigger** | Admin sends notification with `action_type: 'tracked'` |
| **UX** | Persistent card on user's dashboard (cannot hide) |
| **User options** | Mark subtasks complete, Submit final response |
| **Progress** | "3 of 7 items completed" with progress bar |
| **Reminders** | Push at 50%, 75%, 90% of deadline |
| **Overdue** | Card turns red, visible to user AND their HOD |
| **Examples** | Complete training module, Submit monthly report |

---

## 3. User Flows

### 3.1 Admin: Send Action Required Notification

```
Admin opens /admin/notifications/new
  → Fills title, body, targeting (existing flow)
  → Selects category: "Action Required" (NEW)
  → Chooses action urgency:
      ○ Urgent (blocks screen until submitted)
      ○ Tracked (persistent dashboard card)
  → Chooses response type:
      ○ Text response
      ○ File upload
      ○ Form (checklist of items)
      ○ Link confirmation ("I visited this link")
  → For "Form" type: adds checklist items (title + optional description)
  → Sets deadline
  → Sets escalation chain (default: HOD → Principal → Director)
  → Clicks Send
  → Push notification sent with "⚡ ACTION REQUIRED:" prefix
```

### 3.2 User: Urgent Action (Screen-Blocking)

```
User opens MyJKKN
  → ActionGate modal appears (extends AcknowledgmentGate)
  → Shows notification content (scrollable)
  → Shows deadline countdown
  → Shows response form based on type:
      - Text: textarea with min 10 chars
      - File: upload zone (PDF, DOCX, XLSX, images, max 25MB)
      - Form: checklist with checkboxes
      - Link: "I have visited the link" confirmation
  → User can either:
      A) Fill and submit response → modal disappears, recorded permanently
      B) Request extension → reason textarea + new deadline request
         → Goes to admin for approval/denial
         → If approved: deadline extended, modal dismissed temporarily
         → If denied: modal returns immediately
  → If deadline passes without response: auto-escalation to HOD
```

### 3.3 User: Tracked Action (Dashboard)

```
User opens MyJKKN dashboard
  → Sees "Action Items" section at TOP of dashboard (cannot hide)
  → Each action is a card showing:
      - Title, sender, deadline
      - Progress bar (for form/checklist type)
      - Priority badge (color-coded by time remaining)
      - "Respond" button
  → Clicking card opens response modal:
      - Text: textarea
      - File: upload zone
      - Form: checklist with progress
      - Link: confirmation button
  → After all items complete → "Submit" finalizes
  → User gets push reminders at 50%, 75%, 90% of deadline
  → Overdue cards: red border, visible to HOD on compliance dashboard
```

### 3.4 Admin: Monitor Responses

```
Admin opens /admin/notifications/[id] (existing analytics page)
  → Existing: institution breakdown, role breakdown, people tab
  → NEW: "Responses" tab showing:
      - Who submitted, when, what they submitted
      - Who requested extension (with reason)
      - Who is overdue
      - Download all responses as CSV/ZIP
  → NEW: Response cards in the people list showing response content
```

---

## 4. Database Schema

### 4.1 Extend `notifications` Table (2 new columns)

```sql
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS action_type TEXT DEFAULT NULL
    CHECK (action_type IN ('urgent', 'tracked', NULL)),
  ADD COLUMN IF NOT EXISTS action_config JSONB DEFAULT NULL;
```

**`action_config` shape:**
```json
{
  "response_type": "text" | "file" | "form" | "link",
  "form_items": [
    { "id": "uuid", "title": "Submit marks", "description": "..." }
  ],
  "link_url": "https://...",
  "min_text_length": 10,
  "max_file_size_mb": 25,
  "allowed_file_types": ["pdf", "docx", "xlsx", "jpg", "png"],
  "escalation_chain": ["hod", "principal", "super_admin"]
}
```

### 4.2 New Table: `action_responses`

```sql
CREATE TABLE IF NOT EXISTS action_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id),
  user_id UUID NOT NULL REFERENCES profiles(id),
  response_type TEXT NOT NULL CHECK (response_type IN ('text', 'file', 'form', 'link')),
  -- Text response
  text_response TEXT,
  -- File response
  file_url TEXT,
  file_name TEXT,
  file_size INTEGER,
  -- Form response (checklist)
  form_response JSONB,
  -- Link confirmation
  link_confirmed BOOLEAN DEFAULT FALSE,
  -- Metadata
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(notification_id, user_id)
);

CREATE INDEX idx_action_responses_notification ON action_responses(notification_id);
CREATE INDEX idx_action_responses_user ON action_responses(user_id);

ALTER TABLE action_responses ENABLE ROW LEVEL SECURITY;

-- Users can insert/view their own responses
CREATE POLICY "action_responses_own" ON action_responses
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Super admins can view all
CREATE POLICY "action_responses_admin" ON action_responses
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
```

### 4.3 New Table: `action_extension_requests`

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

CREATE INDEX idx_extension_requests_notification ON action_extension_requests(notification_id, user_id);

ALTER TABLE action_extension_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "extension_own" ON action_extension_requests
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "extension_admin" ON action_extension_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
```

### 4.4 DB Function: `get_pending_actions`

```sql
CREATE OR REPLACE FUNCTION get_pending_actions(p_user_id UUID)
RETURNS JSON AS $$
SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
FROM (
  SELECT 
    un.id,
    un.notification_id,
    n.title,
    n.body,
    n.priority,
    n.category,
    n.action_type,
    n.action_config,
    n.acknowledgment_deadline_hours,
    n.sent_at,
    n.metadata,
    COALESCE(p.full_name, p.email, 'System') as created_by_name,
    -- Calculate deadline
    n.sent_at + (COALESCE(n.acknowledgment_deadline_hours, 4) || ' hours')::interval as deadline_at,
    -- Check if overdue
    NOW() > n.sent_at + (COALESCE(n.acknowledgment_deadline_hours, 4) || ' hours')::interval as is_overdue,
    -- Check if response exists
    EXISTS (
      SELECT 1 FROM action_responses ar
      WHERE ar.notification_id = n.id AND ar.user_id = p_user_id
    ) as has_responded,
    -- Check if extension pending
    (
      SELECT json_build_object('status', er.status, 'requested_deadline', er.requested_deadline)
      FROM action_extension_requests er
      WHERE er.notification_id = n.id AND er.user_id = p_user_id
      ORDER BY er.created_at DESC LIMIT 1
    ) as extension_request
  FROM user_notifications un
  JOIN notifications n ON n.id = un.notification_id
  LEFT JOIN profiles p ON p.id = n.created_by
  WHERE un.user_id = p_user_id
    AND n.action_type IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM action_responses ar
      WHERE ar.notification_id = n.id AND ar.user_id = p_user_id
    )
  ORDER BY 
    CASE n.action_type WHEN 'urgent' THEN 0 ELSE 1 END,
    n.sent_at DESC
) t;
$$ LANGUAGE sql SECURITY DEFINER;

-- CRITICAL: Only service_role can execute (learned from audiences vulnerability)
REVOKE EXECUTE ON FUNCTION get_pending_actions(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_pending_actions(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION get_pending_actions(UUID) FROM authenticated;
```

---

## 5. API Endpoints

### 5.1 New Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/notifications/pending-actions` | Authenticated | Get user's pending actions (powers ActionGate + dashboard) |
| POST | `/api/notifications/submit-action` | Authenticated | Submit response to an action |
| POST | `/api/notifications/request-extension` | Authenticated | Request deadline extension |
| PUT | `/api/admin/notifications/review-extension/[id]` | Super admin | Approve/deny extension |
| GET | `/api/admin/notifications/[id]/responses` | Super admin | Get all responses for a notification |
| GET | `/api/admin/notifications/[id]/responses/export` | Super admin | Download responses as CSV/ZIP |

### 5.2 Extend Existing Endpoints

| Endpoint | Change |
|----------|--------|
| `POST /api/notifications/send` | Accept `action_type` and `action_config` in request body, save to notifications table |
| `GET /api/cron/notification-processor` | Process tracked action reminders at 50%/75%/90% of deadline |

---

## 6. UI Components

### 6.1 ActionGate (extends AcknowledgmentGate)

**File:** `components/notifications/action-gate.tsx`

Extends the existing `AcknowledgmentGate` pattern:
- Same blocking modal UX (blurred background, can't interact)
- Instead of "I Acknowledge" button → shows response form
- Response form varies by `action_config.response_type`:
  - **Text:** Textarea (min 10 chars) + Submit
  - **File:** Dropzone + file preview + Submit
  - **Form:** Checklist with checkboxes + Submit when all checked
  - **Link:** Shows link + "I have visited" confirmation + Submit
- "Request Extension" button always visible (secondary action)
- Deadline countdown (existing pattern from AcknowledgmentGate)

### 6.2 Action Items Dashboard Widget

**File:** `components/notifications/action-items-widget.tsx`

Persistent widget shown on the user's dashboard:
- Cannot be hidden or minimized
- Shows all tracked actions as cards
- Each card: title, sender, deadline countdown, progress, "Respond" button
- Color-coded: green (>50% time left), yellow (25-50%), red (<25%), black (overdue)
- Clicking "Respond" opens a dialog with the response form

### 6.3 Admin Form Extension

**File:** Modify `notification-form.tsx`

When category = "Action Required":
- Show "Action Urgency" toggle: Urgent / Tracked
- Show "Response Type" selector: Text / File / Form / Link
- If Form: show dynamic checklist builder (add/remove items)
- If Link: show URL input field
- Existing: deadline, targeting, acknowledgment all still work

### 6.4 Admin Responses Tab

**File:** Extend `notification-analytics.tsx`

New tab "Responses" alongside existing By Institution / By Role / People:
- List of submitted responses with timestamp
- For text: show truncated text, expandable
- For file: download link
- For form: show checklist completion
- For link: show confirmed/not confirmed
- Export button (CSV for text/form, ZIP for files)

---

## 7. Integration with Existing System

| Existing Component | How It's Extended |
|-------------------|-------------------|
| `notifications` table | +2 columns: `action_type`, `action_config` |
| `user_notifications` table | No changes — existing `acknowledged_at` tracks acknowledgment, new `action_responses` tracks submissions |
| `AcknowledgmentGate` | ActionGate imports and extends its modal pattern |
| `/api/notifications/send` | Accepts `action_type` + `action_config` in payload |
| `/api/cron/notification-processor` | Adds tracked action reminder logic (50/75/90%) |
| Compliance dashboard | Shows action completion rates alongside acknowledgment rates |
| Push notifications | Uses `⚡ ACTION REQUIRED:` prefix for action notifications |

---

## 8. Edge Cases

| Scenario | Handling |
|----------|----------|
| User submits response after deadline | Accept it (late but recorded), mark overdue in analytics |
| Extension approved but user still doesn't act | New deadline enforced, second extension requires Director approval |
| File upload fails mid-submit | Show retry button, keep form state, don't mark as submitted |
| Admin deletes notification while user is responding | Graceful error: "This action is no longer available" |
| User has both urgent + tracked actions | Urgent blocks screen first, tracked appears on dashboard |
| Multiple urgent actions pending | Show one at a time (like acknowledgment — sequential) |
| Form with 0 checklist items | Validation: minimum 1 item required |
| User submits empty text response | Validation: minimum 10 characters |
| User tries to submit twice | `UNIQUE(notification_id, user_id)` constraint prevents duplicates |
| Cron fires while user is submitting | Idempotent — if response exists, skip escalation for that user |
| 5000 tracked action cards on dashboard | Paginate: show 10 most urgent, "View all" link |

---

## 9. Phase Breakdown

| Phase | What | Files | Depends On |
|-------|------|-------|------------|
| **1** | DB migration (tables + functions) | Migration SQL | Nothing |
| **2** | Types + API endpoints | `types/`, `app/api/` (6 routes) | Phase 1 |
| **3** | ActionGate component | `components/notifications/` | Phase 2 |
| **4** | Dashboard widget | `components/notifications/` | Phase 2 |
| **5** | Admin form extension | `notification-form.tsx` | Phase 2 |
| **6** | Admin responses tab | `notification-analytics.tsx` | Phase 2 |
| **7** | Cron extension | `notification-processor/route.ts` | Phase 2 |
| **8** | Fresh-eyes review | All files | Phases 3-7 |

**Phases 3-6 can run in parallel** (non-overlapping files).

---

## 10. Success Criteria

| Metric | Target |
|--------|--------|
| Urgent action response rate (within deadline) | >80% (vs ~0% on Google Chat) |
| Tracked action completion rate | >60% (vs ~0% on Google Chat) |
| Admin follow-up effort | Zero (automated escalation) |
| Time to first response | <2 hours for urgent, <48 hours for tracked |
| Extension request abuse | <10% of total actions |
