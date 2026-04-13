# Privilege Monthly Renewal & Committee Approval — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add monthly renewal gate to the Exceptions & Privileges module — privileges must be explicitly approved by a committee each month, informed by the learner's progress report. Auto-pauses on the 1st if not approved by the 27th.

**Architecture:** Extends the existing V1 privilege module with 2 new DB tables (`privilege_renewals`, `privilege_group_reviewers`), 1 altered table (`privilege_members` + `renewal_status` column), new service methods, hooks, and 3 new/modified pages. The attendance integration adds a `renewal_status` check alongside the existing `status` check.

**Tech Stack:** Next.js 16, TypeScript, Supabase (staging: `hhprjbgknupaplivtoib`), React Query, shadcn/ui, react-hot-toast, lucide-react.

**Spec:** `specs/privilege-monthly-renewal-spec.md`

---

## Phase 1: Database + Types (Foundation)

### Task 1: Create migration for renewal tables

**Files:**
- Create: `supabase/migrations/20260330000001_privilege_monthly_renewal.sql`

**Step 1: Write migration SQL**

```sql
-- Migration: Privilege Monthly Renewal & Committee Approval
-- Date: 2026-03-30

-- 1. New table: privilege_renewals (one record per member per month)
CREATE TABLE IF NOT EXISTS privilege_renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES privilege_members(id) ON DELETE CASCADE,
  month DATE NOT NULL, -- first of month, e.g. 2026-04-01
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'auto_paused')),
  report_id UUID REFERENCES privilege_progress_reports(id),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id, month)
);

-- 2. New table: privilege_group_reviewers (committee per group)
CREATE TABLE IF NOT EXISTS privilege_group_reviewers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES privilege_groups(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES profiles(id),
  added_by UUID NOT NULL REFERENCES profiles(id),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, reviewer_id)
);

-- 3. Alter privilege_members: add renewal_status column
ALTER TABLE privilege_members ADD COLUMN IF NOT EXISTS
  renewal_status TEXT NOT NULL DEFAULT 'active'
  CHECK (renewal_status IN ('active', 'paused', 'pending_report', 'pending_review'));

-- RLS
ALTER TABLE privilege_renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE privilege_group_reviewers ENABLE ROW LEVEL SECURITY;

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON privilege_renewals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON privilege_group_reviewers TO authenticated;
GRANT SELECT ON privilege_renewals TO anon;
GRANT SELECT ON privilege_group_reviewers TO anon;

-- RLS policies for privilege_renewals (join through members → groups for institution)
CREATE POLICY pr_sel ON privilege_renewals FOR SELECT USING (
  EXISTS (SELECT 1 FROM privilege_members pm
    JOIN privilege_groups pg ON pg.id = pm.group_id
    JOIN profiles p ON p.id = auth.uid()
    WHERE pm.id = privilege_renewals.member_id
    AND (p.role = 'super_admin' OR p.institution_id = pg.institution_id))
);
CREATE POLICY pr_learner_sel ON privilege_renewals FOR SELECT USING (
  EXISTS (SELECT 1 FROM privilege_members pm
    WHERE pm.id = privilege_renewals.member_id AND pm.learner_id = auth.uid())
);
CREATE POLICY pr_ins ON privilege_renewals FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin'))
);
CREATE POLICY pr_upd ON privilege_renewals FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin'))
);

-- RLS for privilege_group_reviewers
CREATE POLICY pgr_sel ON privilege_group_reviewers FOR SELECT USING (
  EXISTS (SELECT 1 FROM privilege_groups pg
    JOIN profiles p ON p.id = auth.uid()
    WHERE pg.id = privilege_group_reviewers.group_id
    AND (p.role = 'super_admin' OR p.institution_id = pg.institution_id))
);
CREATE POLICY pgr_ins ON privilege_group_reviewers FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin'))
);
CREATE POLICY pgr_del ON privilege_group_reviewers FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pr_member ON privilege_renewals(member_id);
CREATE INDEX IF NOT EXISTS idx_pr_month ON privilege_renewals(month);
CREATE INDEX IF NOT EXISTS idx_pr_status ON privilege_renewals(status);
CREATE INDEX IF NOT EXISTS idx_pgr_group ON privilege_group_reviewers(group_id);
CREATE INDEX IF NOT EXISTS idx_pgr_reviewer ON privilege_group_reviewers(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_pm_renewal_status ON privilege_members(renewal_status);
```

**Step 2: Push migration to staging via Management API**

```bash
ACCESS_TOKEN=$(cat ~/.supabase/access-token)
# Execute each statement via curl (split CREATE TABLE and ALTER TABLE into separate calls)
```

**Step 3: Verify**

```bash
# Confirm tables exist
curl -s -X POST "https://api.supabase.com/v1/projects/hhprjbgknupaplivtoib/database/query" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" -H "User-Agent: supabase-cli/2.75.0" \
  -d '{"query": "SELECT tablename FROM pg_tables WHERE tablename IN ('\''privilege_renewals'\'', '\''privilege_group_reviewers'\'') ORDER BY tablename"}'
# Expected: 2 tables
```

---

### Task 2: Add TypeScript types

**Files:**
- Modify: `types/privileges.ts`

**Step 1: Add renewal types after existing interfaces**

```typescript
// ============================================================
// Renewal & Committee Types (V1.1)
// ============================================================

export type RenewalStatus = 'active' | 'paused' | 'pending_report' | 'pending_review';
export type RenewalDecision = 'pending' | 'approved' | 'denied' | 'auto_paused';

export interface PrivilegeRenewal {
  id: string;
  member_id: string;
  month: string; // ISO date, first of month
  status: RenewalDecision;
  report_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  // Relations
  reviewer?: { id: string; full_name: string };
  report?: PrivilegeProgressReport;
  member?: PrivilegeMember;
}

export interface PrivilegeGroupReviewer {
  id: string;
  group_id: string;
  reviewer_id: string;
  added_by: string;
  added_at: string;
  // Relations
  reviewer?: { id: string; full_name: string; email: string };
}

export interface RenewalDashboardData {
  total_members: number;
  approved: number;
  pending_report: number;
  pending_review: number;
  paused: number;
  denied: number;
}

export interface SubmitProgressReportDto {
  member_id: string;
  app_url?: string;
  github_url?: string;
  description: string; // required, min 10 chars
  screenshot_url?: string;
}

export interface ReviewRenewalDto {
  renewal_id: string;
  decision: 'approved' | 'denied';
  notes?: string;
  reviewed_by: string;
}
```

**Step 2: Update PrivilegeMember interface to include renewal_status**

Add `renewal_status: RenewalStatus;` to the existing `PrivilegeMember` interface.

**Step 3: Verify** — `npx tsc --noEmit` passes for types file.

---

## Phase 2: Service Layer

### Task 3: Add renewal service methods to PrivilegeService

**Files:**
- Modify: `lib/services/academic/privilege-service.ts`

Add these methods to the existing `PrivilegeService` class:

**Reviewer Management:**
- `getGroupReviewers(groupId: string)` → `PrivilegeGroupReviewer[]`
- `addGroupReviewer(groupId: string, reviewerId: string, addedBy: string)` → reviewer
- `removeGroupReviewer(groupId: string, reviewerId: string)` → void

**Progress Report (replace V1.1 placeholder):**
- `submitProgressReport(dto: SubmitProgressReportDto)` → report
  - Creates `privilege_progress_reports` record
  - Updates `privilege_members.renewal_status` to `'pending_review'`
  - Creates/updates `privilege_renewals` record for current month with `report_id`

**Renewal Review:**
- `getRenewalsForMonth(groupId: string, month: string)` → renewals with member + report data
- `reviewRenewal(dto: ReviewRenewalDto)` → updated renewal
  - If approved: set renewal.status = 'approved', member.renewal_status = 'active'
  - If denied: set renewal.status = 'denied', member.renewal_status = 'paused'
- `getRenewalHistory(memberId: string)` → all renewals for a member (timeline)

**Renewal Dashboard:**
- `getRenewalDashboard(groupId: string, month: string)` → `RenewalDashboardData`

**Auto-Pause (called by cron/edge function):**
- `autoPauseExpiredRenewals(month: string)` → { paused_count: number }
  - Finds members with no approved renewal for the given month
  - Sets their `renewal_status` to 'paused'
  - Creates `privilege_renewals` record with status = 'auto_paused'

**Modify existing:**
- `getActivePrivilegesForLearner()` — add `.eq('renewal_status', 'active')` to the query
- `getActivePrivilegesForLearners()` — same filter addition

---

### Task 4: Add React Query hooks

**Files:**
- Modify: `hooks/academic/use-privileges.ts`

Add to QUERY_KEYS:
```typescript
reviewers: (groupId: string) => [...QUERY_KEYS.all, 'reviewers', groupId] as const,
renewals: (groupId: string, month: string) => [...QUERY_KEYS.all, 'renewals', groupId, month] as const,
renewalHistory: (memberId: string) => [...QUERY_KEYS.all, 'renewal-history', memberId] as const,
renewalDashboard: (groupId: string, month: string) => [...QUERY_KEYS.all, 'renewal-dashboard', groupId, month] as const,
```

Add hooks:
- `useGroupReviewers(groupId)` — query
- `useAddGroupReviewer(groupId)` — mutation
- `useRemoveGroupReviewer(groupId)` — mutation
- `useSubmitProgressReport()` — mutation, invalidates learnerPrivileges + renewals
- `useRenewalsForMonth(groupId, month)` — query
- `useReviewRenewal(groupId, month)` — mutation, invalidates renewals + members
- `useRenewalHistory(memberId)` — query
- `useRenewalDashboard(groupId, month)` — query

---

## Phase 3: UI Pages

### Task 5: Replace report placeholder with actual form

**Files:**
- Rewrite: `app/(routes)/academic/privileges/my/report/page.tsx`

Build the **monthly progress report form** with fields:
- App URL (text input, optional)
- GitHub URL (text input, optional)
- What I built this month (textarea, required, min 10 chars)
- Screenshot (file upload to Supabase storage, optional)
- Submit button → calls `useSubmitProgressReport()`

Show current month's renewal status at top:
- "Active" → green badge
- "Renewal Due — submit your report" → amber badge with form
- "Pending Review — report submitted" → blue badge, form disabled
- "Paused" → red badge, "Contact your committee for re-approval"

### Task 6: Add committee management to group detail page

**Files:**
- Modify: `app/(routes)/academic/privileges/[id]/page.tsx`

Add a **"Committee"** tab to the existing 3-tab layout (Members / Privileges / Reviews → Members / Privileges / Reviews / Committee):
- Shows list of assigned reviewers with name, email, remove button
- "Add Reviewer" dialog: search users by name/email, add button
- Uses `useGroupReviewers()`, `useAddGroupReviewer()`, `useRemoveGroupReviewer()`

### Task 7: Create renewal review page

**Files:**
- Create: `app/(routes)/academic/privileges/[id]/renewals/page.tsx`

**Committee Review Dashboard** for a specific group:
- Header: Group name, current month, deadline (27th)
- Stats cards: Total members, Approved, Pending Report, Pending Review, Paused
- Member list table:
  - Name, Roll Number, Report Status (submitted/not), Renewal Status
  - For each member with report submitted: "View Report" button, "Approve" / "Deny" buttons
  - For members without report: "Report not submitted" (approve button disabled per spec R4)
  - Notes input per member
- Uses `useRenewalsForMonth()`, `useReviewRenewal()`

### Task 8: Update learner privilege badge with renewal status

**Files:**
- Modify: `app/(routes)/academic/privileges/my/page.tsx`
- Modify: `app/(routes)/dashboard/_components/widgets/student/privilege-badge-widget.tsx`

Update the badge to show 4 states:
- "Active" (green) — approved for this month
- "Renewal Due" (amber) — need to submit report
- "Pending Review" (blue) — report submitted, waiting
- "Paused" (red) — not approved

---

## Phase 4: Integration

### Task 9: Update attendance auto-OD check

**Files:**
- Modify: `app/(routes)/academic/attendance/mark/page.tsx`

In the `loadPrivilegedStudents` effect (around line 797), update the check to also verify `renewal_status`:

Current: checks `privilege_members.status = 'active'`
New: checks `privilege_members.status = 'active' AND privilege_members.renewal_status = 'active'`

This is handled in the service layer (Task 3) by adding `.eq('renewal_status', 'active')` to `getActivePrivilegesForLearners()`. **No UI change needed** — the service already returns only active privileges; adding the filter means paused members won't be returned.

### Task 10: Add sidebar link for renewal review

**Files:**
- Modify: `lib/sidebarMenuLink.ts`

Add permission mapping:
```typescript
'/academic/privileges/[id]/renewals': 'academic.privileges.review',
```

No new sidebar menu item needed — the renewal page is accessed from the group detail page via a "Review Renewals" button.

---

## Phase 5: Verification

### Task 11: Push migration to staging + build verify

**Step 1:** Push migration to staging via Management API
**Step 2:** Run `npm run build` — must pass
**Step 3:** Verify on Vercel after auto-deploy

### Task 12: End-to-end test flow

1. Create a privilege group with committee members
2. Add a learner as member → renewal_status = 'active'
3. Learner submits progress report → renewal_status = 'pending_review'
4. Committee approves → renewal_status = 'active', renewal record created
5. Next month: if no approval by 27th → auto-pause on 1st
6. Attendance page: paused learner no longer shows auto-OD

---

## File Inventory

| Category | Files | Action |
|----------|-------|--------|
| Migration | 1 | Create |
| Types | 1 | Modify (add ~50 lines) |
| Service | 1 | Modify (add ~200 lines, 9 new methods) |
| Hooks | 1 | Modify (add ~150 lines, 8 new hooks) |
| Pages | 3 | 1 rewrite, 1 modify, 1 create |
| Widgets | 1 | Modify (badge states) |
| Sidebar | 1 | Modify (1 permission) |
| **Total** | **9 files** | 1 new + 8 modified |

## Agent Parallelization

| Wave | Tasks | Can Parallelize? |
|------|-------|-------------------|
| Wave 1 | T1 (migration) + T2 (types) | Yes — independent |
| Wave 2 | T3 (service) + T4 (hooks) | Sequential — hooks import service |
| Wave 3 | T5 + T6 + T7 + T8 | Yes — all pages independent |
| Wave 4 | T9 (attendance) + T10 (sidebar) | Yes — independent |
| Wave 5 | T11 + T12 (verify) | Sequential |

---

*Plan generated: 2026-03-30*
*Spec: specs/privilege-monthly-renewal-spec.md*
