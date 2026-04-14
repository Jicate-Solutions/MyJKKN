# SPEC v2: Permissions Audit Dashboard — Non-Developer Layer

> **Status:** Draft | **Date:** 2026-04-14 | **Route:** `/users/permissions-audit`
> **Audience:** Omm (Director), Isvarya (JMD), Boobalan, Institution Admins
> **Prerequisite:** PR #146 (base dashboard) and PR #148 (sub-module filter) are merged

---

## 1. True Goal

The current dashboard answers developer questions ("what RLS policies exist on table X?"). This spec adds a **governance layer** that answers the questions a non-developer director/JMD actually asks:

- *"Who can delete student records?"*
- *"What changed this week?"*
- *"Is my data secure — in plain English?"*
- *"What does Isvarya actually see when she logs in?"*
- *"Can I print a compliance report for the NAAC audit?"*
- *"If I change this role, how many people get affected?"*

**Success = ** Omm or Isvarya opens the dashboard and answers any of the above in under 30 seconds without asking a developer.

---

## 2. Scope — 6 Features in 2 Phases

### Phase 1 (Ship First — Quick Wins)

| # | Feature | Est. Effort | Why First |
|---|---------|-------------|-----------|
| F1 | **Natural Language "Who Can Do This?" Search** | 4-6 hrs | Reuses existing AI Debugger endpoint; highest daily value |
| F3 | **Plain-English Health Cards** | 1-2 hrs | Pure UI rewrite; zero new infrastructure |

### Phase 2 (Ship After Phase 1 Validates)

| # | Feature | Est. Effort | Why Later |
|---|---------|-------------|-----------|
| F2 | **Activity Timeline (Change Log)** | 1 day | Requires new DB table `role_audit_log` + trigger |
| F4 | **"See As User" Preview** | 1 day | Security-sensitive; needs impersonation guard logic |
| F5 | **Compliance Report PDF Export** | 4-6 hrs | Extends existing Export tab |
| F6 | **Impact Preview Before Role Change** | 2-3 hrs | Requires integration with role-edit UI |

---

## 3. Feature Specifications

### F1 — Natural Language "Who Can Do This?" Search

**Location:** New 9th tab in the dashboard titled **"Ask"** (or inline banner on System Health tab).

**UI:**
```
┌─────────────────────────────────────────────────────────────┐
│ 🔍  Type what you want to know...                          │
│     Examples:                                               │
│     • Who can delete student records?                      │
│     • Can students see other students' grades?             │
│     • Who has access to billing data?                      │
│     • Which roles can create new users?                    │
└─────────────────────────────────────────────────────────────┘

[ Results appear below after typing + Enter ]

┌─────────────────────────────────────────────────────────────┐
│ Question: "Who can delete student records?"                 │
│                                                             │
│ ANSWER (plain English):                                     │
│ 11 people across 3 roles can delete student records.       │
│                                                             │
│ 🛡️  Super Admins (8)                                       │
│    • Ommsharravana S — director@jkkn.ac.in                 │
│    • Boobalan — boobalan.a@jkkn.ac.in                      │
│    [ Show all 8 ]                                          │
│                                                             │
│ 👔 Administrators (3)                                       │
│    [ Show all 3 ]                                          │
│                                                             │
│ 🎓 HODs with "users.delete" (0)                            │
│    → None currently have this permission                   │
│                                                             │
│ Technical detail: This maps to permission key              │
│ `learners.profiles.delete` + RLS policy check             │
│ on profiles table.                                         │
│                                                             │
│ [ Re-run ] [ Export List ] [ Ask Follow-up ]               │
└─────────────────────────────────────────────────────────────┘
```

**How it works:**

1. User types a natural-language question.
2. Frontend sends to existing `/api/users/permissions-audit/ai-debug` endpoint with an augmented system prompt:
   > "You are a permission system interpreter. Convert the user's plain-English question into one or more permission keys. Then query the provided role/permission data to produce a human-readable answer. Always list the actual users affected, not just role names."

3. The AI (Gemini 4) returns:
   - Interpreted permission key(s)
   - Plain-English summary
   - List of affected users (from structured data in the request)

4. UI renders the response in the format above.

**API change:** Extend `POST /api/users/permissions-audit/ai-debug` to accept:
```json
{
  "question": "Who can delete student records?",
  "mode": "who-can-do",
  "includeUsers": true
}
```

Response:
```json
{
  "interpretedPermissions": ["learners.profiles.delete", "users.delete"],
  "summary": "11 people across 3 roles...",
  "groupedUsers": [
    {
      "role": "super_admin",
      "roleDisplayName": "Super Admin",
      "users": [{ "id": "...", "name": "...", "email": "..." }]
    }
  ],
  "technicalNote": "Maps to permission key..."
}
```

**Edge cases:**
- Ambiguous question ("who's in billing?") → AI asks for clarification
- No matching permission → AI explains: "This action isn't tracked as a specific permission. It may be handled by a role like 'accounts'."
- 100+ users affected → paginate with "Show all" toggle

---

### F3 — Plain-English Health Cards

**Location:** Replaces existing stat tiles at top of **System Health tab**.

**Before (current):**
```
[ 5,646 ]    [ 271 ]        [ 54 ]             [ 19 ]
Total Users  Orphan Users   Role Mismatches   Active Roles
```

**After (proposed):**
```
┌──────────────────────────────────────────────────────────────┐
│ 🔴 271 people can't use the system                          │
│    They log in, see an empty app, and don't know why.       │
│    Reason: They have accounts but no role was assigned.     │
│    [ Show list ] [ Assign Default Role ]                    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ 🟡 54 people see a broken menu                              │
│    Their displayed role and actual permissions don't match. │
│    They click menu items that do nothing — or miss items    │
│    they need.                                               │
│    [ Show list ] [ Auto-Fix All ]                           │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ 🟢 Data is protected                                        │
│    All 418 tables require permission to read.               │
│    1,346 security rules are active.                         │
│    [ View details ]                                         │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ ⚠️  8 people have Super Admin access                        │
│    Best practice is 2–5. Consider reviewing:                │
│    • 3 haven't logged in within 14 days                     │
│    • 1 has no user_roles entry (Isvarya)                    │
│    [ Review list ]                                          │
└──────────────────────────────────────────────────────────────┘
```

**How it works:**

Pure UI rewrite of the existing `system-health-tab.tsx`. Same data from `/api/users/permissions-audit/health` — new presentation.

**Logic for severity colors:**
- 🔴 Red: orphans > 0 OR mismatches > 100
- 🟡 Yellow: mismatches 1–100
- 🟢 Green: protected tables exist AND orphans == 0
- ⚠️ Warning: super admin count > 5 OR any super admin orphan

**No API changes needed.** All data already exists in the current `/health` response.

---

### F2 — Activity Timeline (Change Log)

**Location:** New tab titled **"What Changed"** (last tab, chronological feed).

**Database:**
```sql
CREATE TABLE role_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL,  -- 'role_created', 'role_updated', 'role_deleted',
                               -- 'user_role_assigned', 'user_role_revoked',
                               -- 'permission_granted', 'permission_revoked',
                               -- 'institution_access_granted', 'institution_access_revoked'
  actor_user_id UUID REFERENCES profiles(id),
  target_user_id UUID REFERENCES profiles(id),      -- NULL if action is on a role, not user
  target_role_id UUID REFERENCES custom_roles(id),  -- NULL if action is on a user, not role
  old_value JSONB,
  new_value JSONB,
  description TEXT NOT NULL,  -- Plain-English description, generated at insert time
  affected_user_count INTEGER DEFAULT 0,  -- For role changes: how many users affected
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_role_audit_log_created_at ON role_audit_log(created_at DESC);
CREATE INDEX idx_role_audit_log_actor ON role_audit_log(actor_user_id);
```

**Triggers:** Add AFTER INSERT/UPDATE/DELETE triggers on:
- `custom_roles` (role changes)
- `user_roles` (user-role assignments)
- `user_institution_access` (cross-institution access grants)

Each trigger writes a row to `role_audit_log` with a pre-generated plain-English `description`.

**Example rows:**
```
Apr 13, 14:32 | Boobalan granted "Create Staff" permission to Faculty role. 333 users affected.
Apr 13, 10:15 | You (Omm) added Sarah Jones as Faculty at JKKN Engineering.
Apr 12, 09:44 | 12 students graduated and were removed from active roles.
Apr 11, 16:20 | Isvarya was given cross-institution access to all 9 institutions.
```

**UI:**
- Reverse-chronological list
- Filter by date range, actor, action type
- Search box
- "Today / This Week / This Month" quick filters
- Each row expandable to show old → new JSON diff for developers

**API:** `GET /api/users/permissions-audit/activity?days=7&actor=all&type=all`

**Edge case:** Retroactive — system has no history before this table is created. Start fresh from deploy date.

---

### F4 — "See As User" Preview

**Location:** Button on each user row in User Resolver tab.

**UI Flow:**

1. Click "See as [user]" on any user.
2. Confirmation modal:
   > ⚠️ **Previewing as Sarah Jones**
   > You'll see exactly what she sees. This is read-only — you cannot perform actions, send messages, or modify data while in preview mode.
   > **[ Start Preview ] [ Cancel ]**

3. New tab opens with MyJKKN at `/` with:
   - Red banner across the top: `PREVIEWING AS Sarah Jones (faculty) — [ Exit Preview ]`
   - Cookie set with preview session token
   - All API calls include `X-Preview-As: <target_user_id>` header
   - Backend middleware **rejects all mutations** when preview header is present

**Security:**
- Only super_admins can initiate preview
- Preview session token expires in 15 minutes
- All preview API calls logged to `role_audit_log` as `action_type='preview_accessed'`
- Preview tokens are signed JWTs, bound to the originating super_admin's user_id

**Middleware logic:**
```typescript
// middleware.ts additions
const previewAs = request.headers.get('x-preview-as');
if (previewAs) {
  // Verify: caller is super_admin + preview token valid + method is GET
  if (method !== 'GET') return 403;
  if (!isValidPreviewToken(token, callerUserId)) return 401;
  // Query with target user's session instead of caller's
  session.user.id = previewAs;
}
```

**Why this is safe:**
- All writes blocked at middleware
- All reads logged
- Time-boxed
- Only super_admins can initiate

---

### F5 — Compliance Report PDF Export

**Location:** New button in existing **Export** tab.

**Output:** A 3-5 page PDF titled "Access Control Compliance Report — [Month Year]"

**Sections:**

1. **Executive Summary**
   - Overall score (0-100)
   - Number of roles, users, institutions
   - Date generated

2. **Data Isolation Check**
   - ✓ / ✗ Can users in Institution A access Institution B data?
   - Sampled 10 random cross-institution queries; all blocked

3. **Principle of Least Privilege**
   - Roles ranked by permission count
   - Flag roles with > 200 granted permissions (administrator, super_admin)
   - Flag underprivileged roles (principal has fewer perms than student — needs review)

4. **Stale Accounts**
   - Users with `last_login < NOW() - 90 days`
   - Recommend deactivation

5. **Super Admin Audit**
   - List all 8 super admins with last login
   - Flag if > 5 total
   - Flag any without user_roles entry

6. **Role Change Activity** (requires F2 timeline data)
   - Changes in past 30 days
   - Unusual spikes

7. **Recommendations**
   - Auto-generated action items

**Technical:**
- Reuse existing pattern from `app/api/admin/reports/` if one exists, else use `@react-pdf/renderer`
- Endpoint: `POST /api/users/permissions-audit/compliance-report` → returns PDF blob
- Add "Generate Compliance Report" button to Export tab

---

### F6 — Impact Preview Before Role Change

**Location:** Existing Role Management page (`/users/role-management`). Intercept "Save" clicks on role edits.

**Flow:**

1. Admin edits a role (say, adds `staff.create` permission to Faculty).
2. Click "Save" → shows impact modal FIRST, not final save:

```
┌────────────────────────────────────────────────────────────┐
│ Review Changes to "Faculty" Role                           │
│                                                            │
│ 👥 333 users will be affected                              │
│                                                            │
│ ➕ They will GAIN access to:                               │
│    • Create Staff Records (staff.create)                   │
│                                                            │
│ ➖ They will LOSE access to:                               │
│    (none)                                                  │
│                                                            │
│ 🔍 Affected pages/actions:                                 │
│    • /staff → New "Create Staff" button appears            │
│    • API: POST /api/staff becomes callable                 │
│                                                            │
│ ⚠️  This is a significant change. 333 people will          │
│     instantly gain the ability to create staff records.    │
│                                                            │
│ [ Cancel ] [ I Understand — Apply Change ]                │
└────────────────────────────────────────────────────────────┘
```

**Technical:**
- Client-side diff: compare old permissions JSONB vs new
- For each changed permission, lookup affected routes from `MENU_PERMISSIONS` map
- Count users with this role from `user_roles` table
- Show modal before submitting the actual PUT to role-update API

**Edge case:** If permissions matrix is bulk-edited (many changes at once), show summary: "20 permissions added, 3 removed, 333 users affected."

---

## 4. Technical Architecture

### Files to Create

| Phase | File | Purpose |
|-------|------|---------|
| F1 | `app/(routes)/users/permissions-audit/_components/ask-tab.tsx` | Natural language search UI |
| F1 | `app/api/users/permissions-audit/ask/route.ts` | Wrapper around ai-debug with governance-focused prompt |
| F3 | `app/(routes)/users/permissions-audit/_components/plain-health-cards.tsx` | Replaces stat tiles |
| F2 | `supabase/migrations/YYYYMMDD_role_audit_log.sql` | New audit log table + triggers |
| F2 | `app/(routes)/users/permissions-audit/_components/activity-timeline-tab.tsx` | Changelog UI |
| F2 | `app/api/users/permissions-audit/activity/route.ts` | Activity log API |
| F4 | `middleware.ts` | Extended with preview-as logic |
| F4 | `app/(routes)/users/permissions-audit/_components/see-as-user-modal.tsx` | Confirmation modal |
| F4 | `app/api/users/permissions-audit/preview-token/route.ts` | Mint preview JWT |
| F5 | `app/api/users/permissions-audit/compliance-report/route.ts` | PDF generation |
| F6 | `app/(routes)/users/role-management/_components/impact-preview-modal.tsx` | Diff + affected users modal |

### Files to Modify

| Phase | File | Change |
|-------|------|--------|
| F1, F3 | `_components/permissions-audit-client.tsx` | Add new tab for F1, replace stats section for F3 |
| F1 | `app/api/users/permissions-audit/ai-debug/route.ts` | Accept `mode` and `includeUsers` params |
| F4 | `lib/auth/session.ts` | Support preview session resolution |
| F5 | `_components/export-reports-tab.tsx` | Add "Generate Compliance Report" button |
| F6 | `app/(routes)/users/role-management/_components/edit-role-dialog.tsx` | Intercept save, show impact modal |

### Database Changes

**Only F2 needs schema changes:**
- New table: `role_audit_log`
- 3 new triggers on `custom_roles`, `user_roles`, `user_institution_access`
- 1 helper function: `log_role_change()`

### Type Changes

Add to `types/permissions-audit.ts`:
```typescript
export interface NaturalLanguageAnswer {
  interpretedPermissions: string[];
  summary: string;
  groupedUsers: { role: string; roleDisplayName: string; users: UserSummary[] }[];
  technicalNote?: string;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actionType: string;
  description: string;
  affectedUserCount: number;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
}

export interface ComplianceReport {
  score: number;
  dataIsolation: boolean;
  staleAccounts: number;
  superAdminCount: number;
  recommendations: string[];
}

export interface ImpactPreview {
  roleId: string;
  roleName: string;
  affectedUserCount: number;
  gainedPermissions: string[];
  lostPermissions: string[];
  affectedRoutes: string[];
}
```

---

## 5. Access Control (Who Can Use What)

| Feature | Super Admin | Administrator | Others |
|---------|------------|---------------|--------|
| F1 Natural Language Search | Yes (all users) | Yes (their institution only) | No |
| F3 Plain Health Cards | Yes | Yes (scoped) | No |
| F2 Activity Timeline | Yes | Yes (scoped) | No |
| F4 See As User Preview | Yes | **No** (super admin only) | No |
| F5 Compliance Report | Yes | Yes (scoped) | No |
| F6 Impact Preview | Yes | Yes (for editable roles) | No |

---

## 6. Edge Cases & Risks

| Scenario | Handling |
|----------|---------|
| F1: User asks a question the AI doesn't understand | Return "I couldn't interpret this. Try rephrasing." with 3 example questions |
| F1: Question maps to 500+ users | Paginate in the UI; cap AI response at top 50, offer "Export full list" |
| F2: Audit log grows huge (10,000+ entries) | Partition by month, archive > 1 year old |
| F2: Trigger fires during bulk operations | Batch inserts; use `INSERT ... SELECT` not per-row triggers |
| F4: Preview session leaks | 15-min expiry + all API calls logged + bound to originating user |
| F4: User opens preview in incognito and logs out | Preview token expires on next verification |
| F5: PDF generation timeout on large systems | Background job + email when ready (for systems with >10k users) |
| F6: Modal ignored ("don't show this again") | Never add that option — modal is safety-critical |

---

## 7. Non-Goals (Explicitly Out of Scope)

- **No email notifications** for role changes (separate feature)
- **No automatic role recommendations** ("Sarah should be HOD because X")
- **No rollback UI** (admin has to manually revert; not worth building rollback for v1)
- **No real-time collaborative editing** of roles
- **No approval workflows** for role changes (separate governance feature)
- **No IP/device restrictions** for super admins

---

## 8. Success Criteria

### Phase 1 (F1 + F3)

| Test | Pass Condition |
|------|---------------|
| Type "who can delete students" in Ask tab | Returns list of users grouped by role within 5 seconds |
| System Health tab loads | Shows plain-English cards, not raw numbers |
| Orphan card click | Navigates to filtered User Resolver showing orphans |
| Non-coder test | Omm's wife or a non-tech colleague can answer "who has super admin?" without help |

### Phase 2 (F2, F4, F5, F6)

| Test | Pass Condition |
|------|---------------|
| Create a new role | Appears in Activity Timeline within 2 seconds |
| Click "See as user" | New tab opens with preview banner, no mutations possible |
| Generate Compliance Report | PDF downloads with all 7 sections populated |
| Edit a role and click Save | Impact preview modal appears before final save |

---

## 9. Shipping Plan

**PR #1 (Phase 1):**
- F1 (Natural Language Search) + F3 (Plain Health Cards)
- ~1 day of work
- 3-5 files changed, no DB changes

**PR #2 (Phase 2a):**
- F2 (Activity Timeline) — standalone, needs DB migration
- ~1 day

**PR #3 (Phase 2b):**
- F4 (See As User Preview) — security-sensitive, needs careful review
- ~1 day

**PR #4 (Phase 2c):**
- F5 (Compliance Report) + F6 (Impact Preview)
- ~1 day

**Total:** ~4 days of focused work across 4 PRs.

---

## Implementation Notes

_To be filled during /writing-plans (Phase 2) and build (Phase 4)_
