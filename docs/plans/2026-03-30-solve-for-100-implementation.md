# Solve for 100 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build the Solve for 100 module inside Startup Studio that tracks 43+ teams from "has an app" to "100 paid users" with learner/mentor/admin/public views.

**Architecture:** Supabase tables (`sf100_*` prefix) → TypeScript types → `SF100Service` extending `BaseService` → React Query hooks via `apiClient` → API routes with `withAuth` → shadcn/ui pages under `/startup-studio/solve-for-100/`. Follows all existing MyJKKN patterns exactly.

**Tech Stack:** Next.js 16 (App Router), Supabase (PostgreSQL + RLS), TanStack React Query v5, shadcn/ui, Tailwind CSS, Recharts.

**Spec:** `/Users/omm/PROJECTS/MyJKKN/specs/solve-for-100-spec.md` (1,928 lines — authoritative source of truth)

---

## Phases Overview

| Phase | Tasks | Focus | Dependency |
|-------|-------|-------|-----------|
| **A** | 1-3 | Database + Types | None |
| **B** | 4-6 | Service Layer | Phase A |
| **C** | 7-11 | API Routes | Phase B |
| **D** | 12-14 | Query Keys + Hooks | Phase C |
| **E** | 15-21 | UI Pages + Components | Phase D |
| **F** | 22-24 | Sidebar + Migration + Polish | Phase E |

**Total:** 24 tasks. ~50 files created, ~5 files modified.

---

## Phase A: Database + Types

### Task 1: Database Migration — Core Tables

**Files:**
- Create: `supabase/migrations/20260331000001_sf100_solve_for_100.sql`

**Step 1: Write the migration file**

Create all 9 tables, ENUMs, indexes, and RLS policies from spec Section 5A. The full DDL is in the spec — copy it exactly. Tables:

1. `sf100_programs` — Program/cohort registry
2. `sf100_enrollments` — Team enrollments with cached metrics
3. `sf100_phase_history` — Phase transition log
4. `sf100_check_ins` — Weekly + micro check-ins
5. `sf100_paid_users` — Individual paid user records with verification
6. `sf100_customer_interviews` — Customer discovery log
7. `sf100_pivots` — Pivot tracker
8. `sf100_notifications` — Notification log
9. `sf100_roster_changes` — Team roster change requests

ENUMs: `sf100_phase`, `sf100_enrollment_status`, `sf100_check_in_type`, `sf100_payment_status`, `sf100_notification_type`, `sf100_roster_action`, `sf100_roster_status`

**RLS policies per spec Appendix A:**
- `sf100_programs`: SELECT for authenticated, INSERT/UPDATE/DELETE for service_role
- `sf100_enrollments`: SELECT for authenticated (full transparency), INSERT/UPDATE for service_role
- `sf100_check_ins`: SELECT for authenticated, INSERT for authenticated (own enrollment check in service layer)
- `sf100_paid_users`: SELECT for authenticated, INSERT/UPDATE for service_role
- All other tables: authenticated SELECT, service_role for writes

**Step 2: Push migration to Supabase**

```bash
cd /Users/omm/PROJECTS/MyJKKN
~/bin/supabase db push --project-ref <project-ref>
```

Expected: All 9 tables created, ENUMs registered, indexes built, RLS enabled.

**Step 3: Verify tables exist**

```bash
~/bin/supabase db query --project-ref <project-ref> \
  "SELECT tablename FROM pg_tables WHERE tablename LIKE 'sf100_%' ORDER BY tablename;"
```

Expected: 9 rows returned.

**Step 4: Commit**

```bash
git add supabase/migrations/20260331000001_sf100_solve_for_100.sql
git commit -m "feat(sf100): add 9 database tables for Solve for 100 module"
```

---

### Task 2: TypeScript Types

**Files:**
- Create: `types/startup-studio/sf100.ts`
- Modify: `types/startup-studio/index.ts` (add export)

**Step 1: Create the types file**

Copy the complete TypeScript types from spec Appendix D. Contains:
- 8 type unions (SF100Phase, SF100EnrollmentStatus, etc.)
- 10 entity interfaces (SF100Program, SF100Enrollment, SF100CheckIn, SF100PaidUser, SF100Notification, SF100PhaseHistory, SF100CustomerInterview, SF100Pivot, SF100RosterChange, SF100Enrollment with joined relations)
- 10 DTO interfaces (CreateProgramDto, UpdateProgramDto, CreateCheckInDto, CreatePaidUserDto, VerifyPaidUserDto, ChurnDto, CreateInterviewDto, CreatePivotDto, CreateRosterChangeDto)
- 5 response interfaces (PhaseAdvanceResult, BulkAdvanceResult, StallCheckResult, LeaderboardData, GraduationResult)

**Step 2: Add export to barrel file**

```typescript
// In types/startup-studio/index.ts — add at the end:
export * from './sf100';
```

**Step 3: Verify types compile**

```bash
cd /Users/omm/PROJECTS/MyJKKN && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No new errors from sf100.ts.

**Step 4: Commit**

```bash
git add types/startup-studio/sf100.ts types/startup-studio/index.ts
git commit -m "feat(sf100): add TypeScript types and DTOs"
```

---

### Task 3: Regenerate Supabase Types

**Step 1: Regenerate database types**

```bash
~/bin/supabase gen types typescript --project-id <project-ref> > /Users/omm/PROJECTS/MyJKKN/types/database.types.ts
```

**Step 2: Verify sf100 tables appear in generated types**

```bash
grep -c "sf100_" /Users/omm/PROJECTS/MyJKKN/types/database.types.ts
```

Expected: Multiple matches (one per table).

**Step 3: Commit**

```bash
git add types/database.types.ts
git commit -m "chore: regenerate Supabase types with sf100 tables"
```

---

## Phase B: Service Layer

### Task 4: SF100Service — Programs + Enrollments

**Files:**
- Create: `lib/services/startup-studio/sf100-service.ts`
- Modify: `lib/services/startup-studio/index.ts` (add export)

**Step 1: Create the service class**

Follow the `NifPipelineService` pattern exactly:
- `import { BaseService, type BaseListResponse } from '../base-service'`
- `import { sanitizeSearch } from '@/lib/config/pagination'`
- `import type { ... } from '@/types/startup-studio'`
- Class extends `BaseService`, all methods are `static async`
- Uses `this.supabase` (getter from BaseService), `this.validate()` for pagination

Implement these method groups (from spec Appendix B):

**Programs:**
- `createProgram(data: CreateProgramDto): Promise<SF100Program>`
- `getProgram(programId: string): Promise<SF100Program>`
- `listPrograms(filters: ProgramFilters): Promise<BaseListResponse<SF100Program>>`
- `updateProgram(programId: string, data: UpdateProgramDto): Promise<SF100Program>`

**Enrollments:**
- `enrollTeam(programId: string, registrationId: string, enrolledBy: string): Promise<SF100Enrollment>` — Must: (a) read seed data from `event_submissions`, (b) set starting phase via auto-advance logic from spec Section 8C, (c) insert phase_history, (d) return enrollment with `auto_advanced` flag
- `getEnrollment(enrollmentId: string): Promise<SF100EnrollmentDetail>` — Select with joins: `registration:event_registrations(team_name, team_code, institution_id, owner_id, institution:institutions(name), team_members:event_team_members(*), submission:event_submissions(app_name, live_app_url, paying_users_count, mrr_amount, active_users_count))`
- `getMyEnrollment(profileId: string, programId: string): Promise<SF100Enrollment | null>` — Find via profile_id → event_team_members → registration_id → sf100_enrollments
- `listEnrollments(programId: string, filters: EnrollmentFilters): Promise<BaseListResponse<SF100Enrollment>>` — Filterable by phase, status, institution_id, search
- `updateEnrollmentStatus(enrollmentId: string, status: string, reason?: string): Promise<void>`
- `withdrawEnrollment(enrollmentId: string): Promise<void>`

**Private helper:**
- `private static async recalculateMetrics(enrollmentId: string): Promise<void>` — Counts from `sf100_paid_users` WHERE `status IN ('verified','auto_verified')`, updates `cumulative_paid_users`, `active_paid_users`, `internal_paid_users`, `total_revenue` on enrollment.

**Step 2: Add export**

```typescript
// In lib/services/startup-studio/index.ts — add:
export { SF100Service } from './sf100-service';
```

**Step 3: Verify compilation**

```bash
npx tsc --noEmit --pretty 2>&1 | grep sf100
```

Expected: No errors.

**Step 4: Commit**

```bash
git add lib/services/startup-studio/sf100-service.ts lib/services/startup-studio/index.ts
git commit -m "feat(sf100): add SF100Service — programs + enrollments"
```

---

### Task 5: SF100Service — Check-ins, Paid Users, Phase Engine

**Files:**
- Modify: `lib/services/startup-studio/sf100-service.ts`

**Step 1: Add check-in methods**

- `submitCheckIn(enrollmentId, data: CreateCheckInDto, submittedBy): Promise<SF100CheckIn>` — Insert check-in, update `last_check_in_at` on enrollment, reset stall status if in warning/probation (per spec Section 11B)
- `listCheckIns(enrollmentId, filters): Promise<BaseListResponse<SF100CheckIn>>`
- `addMentorFeedback(checkInId, feedback, mentorId): Promise<void>` — Update feedback fields, create `mentor_feedback` notification

**Step 2: Add paid user methods**

- `logPaidUser(enrollmentId, data: CreatePaidUserDto, reportedBy): Promise<SF100PaidUser>` — Insert user, auto-set `status = 'auto_verified'` if `payment_gateway = 'razorpay_jicate'`, validate `amount >= program.min_transaction_amount`, after insert call `recalculateMetrics()` then `checkAutoAdvance()` then `checkMilestone()`
- `verifyPaidUser(paidUserId, status, verifiedBy, reason?): Promise<void>` — Update status, recalculate metrics, check auto-advance
- `markChurned(paidUserId, data: ChurnDto): Promise<void>` — Set `is_active = false`, `churned_at`, recalculate metrics
- `getVerificationQueue(programId, filters): Promise<BaseListResponse<SF100PaidUser>>` — WHERE `status = 'pending_verification'`

**Step 3: Add phase engine methods**

- `checkAutoAdvance(enrollmentId): Promise<PhaseAdvanceResult | null>` — Implements spec Section 8B pseudocode. Count verified external users, check internal % against program threshold, advance if criteria met.
- `bulkAutoAdvance(programId): Promise<BulkAdvanceResult>` — Iterate all active enrollments, run checkAutoAdvance each.
- `manualPhaseChange(enrollmentId, toPhase, adminId, notes?): Promise<void>` — Direct phase set with history record.
- `private static async advancePhase(enrollmentId, toPhase, triggeredBy, userId?, evidence?): Promise<void>` — Shared logic: update enrollment phase + phase_entered_at, insert phase_history, create `phase_advance` notification.

**Step 4: Add milestone + notification helpers**

- `private static async checkMilestone(enrollmentId, newCumulativeCount): Promise<void>` — Check against [1, 10, 25, 50, 100] thresholds, create milestone notification if crossed.
- `private static async createNotification(params): Promise<void>` — Insert into `sf100_notifications`.

**Step 5: Commit**

```bash
git add lib/services/startup-studio/sf100-service.ts
git commit -m "feat(sf100): add check-ins, paid users, phase engine to SF100Service"
```

---

### Task 6: SF100Service — Stall Detection, Leaderboard, Graduation, P1 Features

**Files:**
- Modify: `lib/services/startup-studio/sf100-service.ts`

**Step 1: Add stall detection**

- `runStallCheck(programId): Promise<StallCheckResult>` — Query per spec Section 11E. For each team: if days_since_checkin >= removal_days AND status != 'removed', set removed. If >= probation_days AND status != 'probation', set probation. If >= warning_days AND status != 'warning', set warning. Create appropriate notifications.

**Step 2: Add leaderboard**

- `getPublicLeaderboard(programId): Promise<LeaderboardData>` — Query per spec Section 9C. Group by phase, rank within phase by cumulative_paid_users DESC. Return only public-safe fields.
- `getPublicStats(programId): Promise<PublicStats>` — Aggregate: total_teams, total_paid_users, total_graduated, avg_days_to_first_sale.

**Step 3: Add graduation**

- `initiateGraduation(enrollmentId, adminId): Promise<GraduationResult>` — Advance to `graduated`, set `graduated_at`, create `ss_nif_candidates` record (per spec Section 12B), create `milestone_100_users` notification.

**Step 4: Add P1 features**

- `logInterview(enrollmentId, data, conductedBy): Promise<SF100CustomerInterview>` — Simple insert
- `listInterviews(enrollmentId): Promise<SF100CustomerInterview[]>`
- `logPivot(enrollmentId, data, loggedBy): Promise<SF100Pivot>` — Simple insert
- `listPivots(enrollmentId): Promise<SF100Pivot[]>`
- `requestRosterChange(enrollmentId, data, requestedBy): Promise<SF100RosterChange>`
- `reviewRosterChange(changeId, approved, reviewedBy, notes?): Promise<void>` — On approve, update `event_team_members`
- `getMyNotifications(profileId, unreadOnly): Promise<SF100Notification[]>`
- `markRead(notificationId): Promise<void>`
- `markAllRead(profileId): Promise<void>`
- `exportProgramCSV(programId): Promise<string>`
- `getPhaseFunnel(programId): Promise<{phase: string, count: number}[]>` — GROUP BY current_phase

**Step 5: Commit**

```bash
git add lib/services/startup-studio/sf100-service.ts
git commit -m "feat(sf100): add stall detection, leaderboard, graduation, P1 features"
```

---

## Phase C: API Routes

### Task 7: API Routes — Programs + Enrollments

**Files:**
- Create: `app/api/startup-studio/solve-for-100/programs/route.ts`
- Create: `app/api/startup-studio/solve-for-100/programs/[programId]/route.ts`
- Create: `app/api/startup-studio/solve-for-100/programs/[programId]/enrollments/route.ts`
- Create: `app/api/startup-studio/solve-for-100/enrollments/[enrollmentId]/route.ts`
- Create: `app/api/startup-studio/solve-for-100/enrollments/my/route.ts`
- Create: `app/api/startup-studio/solve-for-100/enrollments/[enrollmentId]/withdraw/route.ts`

**Pattern for each route:** Follow `app/api/startup-studio/nif/route.ts`:

```typescript
import { withAuth } from '@/lib/auth/with-auth';
import { SF100Service } from '@/lib/services/startup-studio';
import { paginatedResponse, createdResponse, successApiResponse, errorResponse } from '@/lib/api/response';
import { getPaginationParams, getStringParam } from '@/lib/api/params';

export const GET = withAuth(async (request, { user }) => {
  // parse params, call service, return response
}, { requiredPermission: 'read' });
```

See spec Section 6A (Programs) and 6B (Enrollments) for exact endpoints, request bodies, and response shapes.

**Step 1: Create all 6 route files following the pattern**

**Step 2: Verify compilation**

```bash
npx tsc --noEmit --pretty 2>&1 | grep "solve-for-100"
```

**Step 3: Commit**

```bash
git add app/api/startup-studio/solve-for-100/
git commit -m "feat(sf100): add API routes — programs + enrollments"
```

---

### Task 8: API Routes — Check-ins + Paid Users

**Files:**
- Create: `app/api/startup-studio/solve-for-100/enrollments/[enrollmentId]/check-ins/route.ts`
- Create: `app/api/startup-studio/solve-for-100/check-ins/[checkInId]/feedback/route.ts`
- Create: `app/api/startup-studio/solve-for-100/enrollments/[enrollmentId]/paid-users/route.ts`
- Create: `app/api/startup-studio/solve-for-100/paid-users/[paidUserId]/verify/route.ts`
- Create: `app/api/startup-studio/solve-for-100/paid-users/[paidUserId]/churn/route.ts`
- Create: `app/api/startup-studio/solve-for-100/verification-queue/route.ts`

See spec Section 6C (Check-ins) and 6D (Paid Users).

**Commit:**

```bash
git add app/api/startup-studio/solve-for-100/
git commit -m "feat(sf100): add API routes — check-ins + paid users"
```

---

### Task 9: API Routes — Leaderboard + Admin Actions

**Files:**
- Create: `app/api/startup-studio/solve-for-100/leaderboard/route.ts` — **No auth** (public endpoint, uses service_role)
- Create: `app/api/startup-studio/solve-for-100/leaderboard/stats/route.ts` — **No auth**
- Create: `app/api/startup-studio/solve-for-100/programs/[programId]/auto-advance/route.ts`
- Create: `app/api/startup-studio/solve-for-100/programs/[programId]/stall-check/route.ts`
- Create: `app/api/startup-studio/solve-for-100/programs/[programId]/export/route.ts`
- Create: `app/api/startup-studio/solve-for-100/programs/[programId]/funnel/route.ts`

See spec Section 6I (Leaderboard) and 6J (Admin Actions).

**Important:** Leaderboard routes do NOT use `withAuth`. They use `createServiceRoleClient()` directly.

**Commit:**

```bash
git add app/api/startup-studio/solve-for-100/
git commit -m "feat(sf100): add API routes — leaderboard + admin actions"
```

---

### Task 10: API Routes — P1 Features (Interviews, Pivots, Roster, Notifications)

**Files:**
- Create: `app/api/startup-studio/solve-for-100/enrollments/[enrollmentId]/interviews/route.ts`
- Create: `app/api/startup-studio/solve-for-100/enrollments/[enrollmentId]/pivots/route.ts`
- Create: `app/api/startup-studio/solve-for-100/enrollments/[enrollmentId]/roster-changes/route.ts`
- Create: `app/api/startup-studio/solve-for-100/roster-changes/pending/route.ts`
- Create: `app/api/startup-studio/solve-for-100/roster-changes/[changeId]/route.ts`
- Create: `app/api/startup-studio/solve-for-100/notifications/route.ts`
- Create: `app/api/startup-studio/solve-for-100/notifications/[notificationId]/read/route.ts`
- Create: `app/api/startup-studio/solve-for-100/notifications/mark-all-read/route.ts`

See spec Sections 6E, 6F, 6G, 6H.

**Commit:**

```bash
git add app/api/startup-studio/solve-for-100/
git commit -m "feat(sf100): add API routes — interviews, pivots, roster, notifications"
```

---

### Task 11: Build Verification Checkpoint

**Step 1: Run full build**

```bash
cd /Users/omm/PROJECTS/MyJKKN && npm run build 2>&1 | tail -20
```

Expected: Build succeeds with no sf100-related errors.

**Step 2: Count API routes created**

```bash
find app/api/startup-studio/solve-for-100 -name "route.ts" | wc -l
```

Expected: ~20 route files.

**Step 3: Commit any fixes needed**

---

## Phase D: Query Keys + Hooks

### Task 12: Query Keys

**Files:**
- Modify: `lib/query-keys.ts`

**Step 1: Add `sf100` block to `startupStudioKeys`**

Follow the `nif` pattern (around line 564). Add after the last existing block:

```typescript
sf100: {
  all: ['startup-studio', 'sf100'] as const,
  programs: {
    all: ['startup-studio', 'sf100', 'programs'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...startupStudioKeys.sf100.programs.all, 'list', filters] as const,
    detail: (id: string) =>
      [...startupStudioKeys.sf100.programs.all, 'detail', id] as const,
    funnel: (id: string) =>
      [...startupStudioKeys.sf100.programs.all, 'funnel', id] as const,
  },
  enrollments: {
    all: ['startup-studio', 'sf100', 'enrollments'] as const,
    list: (programId: string, filters?: Record<string, unknown>) =>
      [...startupStudioKeys.sf100.enrollments.all, 'list', programId, filters] as const,
    detail: (id: string) =>
      [...startupStudioKeys.sf100.enrollments.all, 'detail', id] as const,
    my: (programId: string) =>
      [...startupStudioKeys.sf100.enrollments.all, 'my', programId] as const,
  },
  checkIns: (enrollmentId: string) =>
    [...startupStudioKeys.sf100.all, 'check-ins', enrollmentId] as const,
  paidUsers: (enrollmentId: string) =>
    [...startupStudioKeys.sf100.all, 'paid-users', enrollmentId] as const,
  verificationQueue: (programId: string) =>
    [...startupStudioKeys.sf100.all, 'verification-queue', programId] as const,
  interviews: (enrollmentId: string) =>
    [...startupStudioKeys.sf100.all, 'interviews', enrollmentId] as const,
  pivots: (enrollmentId: string) =>
    [...startupStudioKeys.sf100.all, 'pivots', enrollmentId] as const,
  leaderboard: (programId: string) =>
    [...startupStudioKeys.sf100.all, 'leaderboard', programId] as const,
  publicStats: (programId: string) =>
    [...startupStudioKeys.sf100.all, 'public-stats', programId] as const,
  notifications: (profileId: string) =>
    [...startupStudioKeys.sf100.all, 'notifications', profileId] as const,
  stalledTeams: (programId: string) =>
    [...startupStudioKeys.sf100.all, 'stalled', programId] as const,
},
```

**Step 2: Commit**

```bash
git add lib/query-keys.ts
git commit -m "feat(sf100): add query keys"
```

---

### Task 13: React Query Hooks

**Files:**
- Create: `hooks/startup-studio/use-sf100.ts`
- Modify: `hooks/startup-studio/index.ts` (add export)

**Step 1: Create hooks file**

Follow `hooks/startup-studio/use-nif.ts` pattern exactly:
- `'use client'` directive
- Import from `@tanstack/react-query`, `@/lib/query-keys`, `@/lib/config/query-config`, `@/lib/api/client`
- All query hooks use `apiClient.get()`, all mutations use `apiClient.post/patch()`
- Invalidate relevant query keys on mutation success

**Query hooks (14):**
- `useSF100Programs(filters?)` — DYNAMIC_DATA
- `useSF100Program(programId)` — SEMI_STABLE_DATA
- `useSF100Enrollments(programId, filters?)` — DYNAMIC_DATA
- `useSF100Enrollment(enrollmentId)` — DYNAMIC_DATA
- `useMySF100Enrollment(programId)` — DYNAMIC_DATA
- `useSF100CheckIns(enrollmentId, filters?)` — DYNAMIC_DATA
- `useSF100PaidUsers(enrollmentId, filters?)` — DYNAMIC_DATA
- `useSF100VerificationQueue(programId)` — DYNAMIC_DATA
- `useSF100Interviews(enrollmentId)` — SEMI_STABLE_DATA
- `useSF100Pivots(enrollmentId)` — SEMI_STABLE_DATA
- `useSF100PublicLeaderboard(programId)` — DYNAMIC_DATA
- `useSF100PublicStats(programId)` — DYNAMIC_DATA
- `useSF100Notifications(profileId)` — DYNAMIC_DATA
- `useSF100PhaseFunnel(programId)` — DYNAMIC_DATA

**Mutation hooks (12):**
- `useCreateSF100Program()` → invalidate programs.all
- `useUpdateSF100Program()` → invalidate programs.all
- `useEnrollSF100Team(programId)` → invalidate enrollments.all
- `useSubmitSF100CheckIn(enrollmentId)` → invalidate checkIns + enrollment detail
- `useAddSF100MentorFeedback()` → invalidate checkIns
- `useLogSF100PaidUser(enrollmentId)` → invalidate paidUsers + enrollment detail + leaderboard
- `useVerifySF100PaidUser()` → invalidate verificationQueue + paidUsers + enrollment
- `useMarkSF100Churned()` → invalidate paidUsers + enrollment
- `useLogSF100Interview(enrollmentId)` → invalidate interviews
- `useLogSF100Pivot(enrollmentId)` → invalidate pivots
- `useRequestSF100RosterChange()` → invalidate enrollment detail
- `useGraduateSF100Team()` → invalidate enrollment + leaderboard

**Step 2: Add export**

```typescript
// In hooks/startup-studio/index.ts — add:
export * from './use-sf100';
```

**Step 3: Commit**

```bash
git add hooks/startup-studio/use-sf100.ts hooks/startup-studio/index.ts
git commit -m "feat(sf100): add React Query hooks (14 queries + 12 mutations)"
```

---

### Task 14: Build Verification Checkpoint

```bash
npm run build 2>&1 | tail -20
```

Expected: Clean build. If type errors, fix and commit.

---

## Phase E: UI Pages + Components

### Task 15: Landing Page + Team Dashboard

**Files:**
- Create: `app/(routes)/startup-studio/solve-for-100/page.tsx` — Landing/redirect based on role
- Create: `app/(routes)/startup-studio/solve-for-100/dashboard/page.tsx` — Team dashboard
- Create: `app/(routes)/startup-studio/solve-for-100/_components/sf100-paid-user-counter.tsx`
- Create: `app/(routes)/startup-studio/solve-for-100/_components/sf100-phase-indicator.tsx`
- Create: `app/(routes)/startup-studio/solve-for-100/_components/sf100-checkin-prompt.tsx`
- Create: `app/(routes)/startup-studio/solve-for-100/_components/sf100-activity-timeline.tsx`
- Create: `app/(routes)/startup-studio/solve-for-100/_components/sf100-deadline-countdown.tsx`
- Create: `app/(routes)/startup-studio/solve-for-100/_components/sf100-privilege-status.tsx`

**Landing page logic:**
- If user has enrollment → redirect to `/dashboard`
- If user is admin → redirect to `/programs`
- If user is mentor with assigned teams → redirect to `/mentor`
- Else → show "not enrolled" message

**Team Dashboard layout:** Per spec Section 7B wireframe. Components:
- `SF100PaidUserCounter` — Large circular SVG progress ring (0/100) with cumulative + active counts
- `SF100PhaseIndicator` — Vertical stepper with 6 phases, current highlighted, entry/exit criteria tooltip
- `SF100CheckInPrompt` — Yellow banner if no check-in this week, links to check-in form
- `SF100ActivityTimeline` — Chronological feed combining check-ins, paid users, interviews, pivots
- `SF100DeadlineCountdown` — Days remaining badge (red if < 30 days)
- `SF100PrivilegeStatus` — Status cards reading from privilege_members

**Use `frontend-design` skill** for the team dashboard — this is the primary learner view and must look excellent.

**Commit:**

```bash
git add app/(routes)/startup-studio/solve-for-100/
git commit -m "feat(sf100): add landing page + team dashboard with components"
```

---

### Task 16: Check-in + Paid User Forms

**Files:**
- Create: `app/(routes)/startup-studio/solve-for-100/dashboard/checkin/page.tsx`
- Create: `app/(routes)/startup-studio/solve-for-100/_components/sf100-checkin-form.tsx` — Weekly + micro tabs
- Create: `app/(routes)/startup-studio/solve-for-100/_components/sf100-paid-user-form.tsx` — Log new paid user
- Create: `app/(routes)/startup-studio/solve-for-100/_components/sf100-paid-user-list.tsx` — Table of all users with status badges

**Check-in form:** Tabs for Weekly (4 text fields + metric snapshot) and Micro (280-char text). Use Zod validation.

**Paid User form:** Fields per spec Section 6D request body. Validate amount >= min_transaction_amount. Show internal user warning if is_internal=true.

**Commit:**

```bash
git add app/(routes)/startup-studio/solve-for-100/
git commit -m "feat(sf100): add check-in form + paid user logging"
```

---

### Task 17: Team Detail Page (Transparency View)

**Files:**
- Create: `app/(routes)/startup-studio/solve-for-100/team/[enrollmentId]/page.tsx`
- Create: `app/(routes)/startup-studio/solve-for-100/team/[enrollmentId]/check-ins/page.tsx`
- Create: `app/(routes)/startup-studio/solve-for-100/team/[enrollmentId]/paid-users/page.tsx`
- Create: `app/(routes)/startup-studio/solve-for-100/team/[enrollmentId]/interviews/page.tsx`
- Create: `app/(routes)/startup-studio/solve-for-100/team/[enrollmentId]/pivots/page.tsx`
- Create: `app/(routes)/startup-studio/solve-for-100/_components/sf100-interview-form.tsx`
- Create: `app/(routes)/startup-studio/solve-for-100/_components/sf100-pivot-form.tsx`

**Team detail:** Tabs layout showing all team data. Any enrolled learner can view any team (full transparency).

**Commit:**

```bash
git add app/(routes)/startup-studio/solve-for-100/team/
git commit -m "feat(sf100): add team detail page with transparency view"
```

---

### Task 18: Admin Pages

**Files:**
- Create: `app/(routes)/startup-studio/solve-for-100/programs/page.tsx` — Program list
- Create: `app/(routes)/startup-studio/solve-for-100/programs/[programId]/page.tsx` — Program overview with funnel
- Create: `app/(routes)/startup-studio/solve-for-100/programs/[programId]/enrollments/page.tsx` — All teams table
- Create: `app/(routes)/startup-studio/solve-for-100/programs/[programId]/verification-queue/page.tsx`
- Create: `app/(routes)/startup-studio/solve-for-100/programs/[programId]/settings/page.tsx`
- Create: `app/(routes)/startup-studio/solve-for-100/_components/sf100-phase-funnel.tsx` — Horizontal bar chart (Recharts)
- Create: `app/(routes)/startup-studio/solve-for-100/_components/sf100-teams-table.tsx` — Sortable DataTable
- Create: `app/(routes)/startup-studio/solve-for-100/_components/sf100-stall-alerts.tsx`
- Create: `app/(routes)/startup-studio/solve-for-100/_components/sf100-verification-queue.tsx`

**Admin overview layout:** Per spec Section 7B wireframe. Key components:
- `SF100PhaseFunnel` — Horizontal bar chart using Recharts
- `SF100TeamsTable` — TanStack React Table with columns: team_name, college, phase, paid_users, last_check_in, stall_status, mentor
- `SF100StallAlerts` — Summary cards for warning/probation/removal counts
- `SF100VerificationQueue` — List of pending paid user verifications with approve/reject actions

**Commit:**

```bash
git add app/(routes)/startup-studio/solve-for-100/programs/
git commit -m "feat(sf100): add admin pages — program overview, teams table, verification queue"
```

---

### Task 19: Mentor Dashboard

**Files:**
- Create: `app/(routes)/startup-studio/solve-for-100/mentor/page.tsx`
- Create: `app/(routes)/startup-studio/solve-for-100/_components/sf100-mentor-team-card.tsx`
- Create: `app/(routes)/startup-studio/solve-for-100/_components/sf100-checkin-review.tsx`

**Mentor dashboard layout:** Per spec Section 7B wireframe. Card grid of assigned teams with:
- Green/yellow/red status indicator
- Phase + paid user count
- Last check-in date
- [Review Check-in] button → opens drawer with check-in content + feedback textarea

**Commit:**

```bash
git add app/(routes)/startup-studio/solve-for-100/mentor/
git commit -m "feat(sf100): add mentor dashboard"
```

---

### Task 20: Public Leaderboard

**Files:**
- Create: `app/(routes)/startup-studio/solve-for-100/leaderboard/page.tsx`
- Create: `app/(routes)/startup-studio/solve-for-100/leaderboard/layout.tsx` — Minimal layout, no sidebar
- Create: `app/(routes)/startup-studio/solve-for-100/_components/sf100-public-leaderboard.tsx`
- Create: `app/(routes)/startup-studio/solve-for-100/_components/sf100-public-stats.tsx`

**Public leaderboard layout:** Per spec Section 7B wireframe. Phase-grouped, expandable sections. No login required.

**Important:** This page should NOT use the standard authenticated layout. Use a minimal layout with JKKN branding only.

**Use `frontend-design` skill** — this is the public-facing page and must be visually impressive.

**Commit:**

```bash
git add app/(routes)/startup-studio/solve-for-100/leaderboard/
git commit -m "feat(sf100): add public leaderboard (no auth required)"
```

---

### Task 21: Build Verification Checkpoint

```bash
npm run build 2>&1 | tail -30
```

Count pages:
```bash
find app/(routes)/startup-studio/solve-for-100 -name "page.tsx" | wc -l
```

Expected: ~15 page files, clean build.

---

## Phase F: Sidebar + Migration + Polish

### Task 22: Sidebar Navigation

**Files:**
- Modify: `lib/sidebarMenuLink.ts`

**Step 1: Add Solve for 100 to Startup Studio group**

Find the Startup Studio section (around line 2257). Add between "Governance" and "Events":

```typescript
{
  href: '/startup-studio/solve-for-100',
  label: 'Solve for 100',
  active: pathname.startsWith('/startup-studio/solve-for-100'),
  icon: Target,  // from lucide-react
  submenus: pathname.startsWith('/startup-studio/solve-for-100') ? [
    { href: '/startup-studio/solve-for-100/dashboard', label: 'My Team', active: pathname.includes('/dashboard') },
    { href: '/startup-studio/solve-for-100/leaderboard', label: 'Leaderboard', active: pathname.includes('/leaderboard') },
    { href: '/startup-studio/solve-for-100/mentor', label: 'My Mentees', active: pathname.includes('/mentor') },
    { href: '/startup-studio/solve-for-100/programs', label: 'Program Admin', active: pathname.includes('/programs') },
  ] : []
},
```

**Step 2: Remove standalone `/solve-for-100` entry** from Social & Community group (~line 2185).

**Step 3: Add permission mappings** to `MENU_PERMISSIONS`:

```typescript
'/startup-studio/solve-for-100': 'startup_studio.events.view',
'/startup-studio/solve-for-100/dashboard': 'startup_studio.events.view',
'/startup-studio/solve-for-100/leaderboard': 'startup_studio.leaderboard.view',
'/startup-studio/solve-for-100/mentor': 'startup_studio.analytics.view',
'/startup-studio/solve-for-100/programs': 'startup_studio.analytics.view',
```

**Step 4: Add `Target` icon import** at top of file:

```typescript
import { Target } from 'lucide-react';
```

**Step 5: Commit**

```bash
git add lib/sidebarMenuLink.ts
git commit -m "feat(sf100): add sidebar navigation for Solve for 100"
```

---

### Task 23: Data Seed API + Initial Enrollment

**Files:**
- Create: `app/api/startup-studio/solve-for-100/programs/[programId]/seed-from-declarations/route.ts`

**Step 1: Create the seed endpoint**

POST endpoint (admin only) that:
1. Reads `track_declarations` WHERE `track = 'solve_for_100'` AND `event_id = program.source_event_id`
2. For each team: calls `SF100Service.enrollTeam()` (which handles auto-advance)
3. Returns `{ enrolled: number, skipped: number, errors: string[] }`

This is idempotent — re-running skips already-enrolled teams (UNIQUE constraint on `(program_id, registration_id)`).

**Step 2: Commit**

```bash
git add app/api/startup-studio/solve-for-100/programs/
git commit -m "feat(sf100): add seed-from-declarations API endpoint"
```

---

### Task 24: Final Build + Verification

**Step 1: Full build**

```bash
cd /Users/omm/PROJECTS/MyJKKN && npm run build 2>&1 | tail -30
```

**Step 2: Type check**

```bash
npx tsc --noEmit --pretty 2>&1 | tail -20
```

**Step 3: Count deliverables**

```bash
echo "=== Tables ===" && grep -c "CREATE TABLE" supabase/migrations/20260331000001_sf100_solve_for_100.sql
echo "=== Types ===" && wc -l types/startup-studio/sf100.ts
echo "=== Service ===" && wc -l lib/services/startup-studio/sf100-service.ts
echo "=== API Routes ===" && find app/api/startup-studio/solve-for-100 -name "route.ts" | wc -l
echo "=== Pages ===" && find app/(routes)/startup-studio/solve-for-100 -name "page.tsx" | wc -l
echo "=== Components ===" && find app/(routes)/startup-studio/solve-for-100 -name "sf100-*.tsx" | wc -l
```

Expected:
- 9 tables
- ~400 lines of types
- ~800+ lines of service
- ~20 API routes
- ~15 pages
- ~15 components

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(sf100): Solve for 100 module — complete implementation"
```

---

## File Inventory Summary

| Category | Count | Key Paths |
|----------|-------|-----------|
| Migration | 1 | `supabase/migrations/20260331000001_sf100_solve_for_100.sql` |
| Types | 1 | `types/startup-studio/sf100.ts` |
| Service | 1 | `lib/services/startup-studio/sf100-service.ts` |
| Query Keys | 1 (edit) | `lib/query-keys.ts` |
| Hooks | 1 | `hooks/startup-studio/use-sf100.ts` |
| API Routes | ~20 | `app/api/startup-studio/solve-for-100/**/*.ts` |
| Pages | ~15 | `app/(routes)/startup-studio/solve-for-100/**/*.tsx` |
| Components | ~15 | `app/(routes)/startup-studio/solve-for-100/_components/*.tsx` |
| Sidebar | 1 (edit) | `lib/sidebarMenuLink.ts` |
| Barrel exports | 2 (edit) | `types/startup-studio/index.ts`, `hooks/startup-studio/index.ts` |
| **Total** | **~58 files** | |

---

## Reference Files

| What | Path | Why |
|------|------|-----|
| Full spec (source of truth) | `specs/solve-for-100-spec.md` | All requirements, data model, edge cases |
| Service pattern | `lib/services/startup-studio/nif-pipeline-service.ts` | BaseService extension, Supabase queries |
| Hook pattern | `hooks/startup-studio/use-nif.ts` | apiClient + query keys + React Query |
| API route pattern | `app/api/startup-studio/nif/route.ts` | withAuth, response helpers |
| Page pattern | `app/(routes)/startup-studio/nif/page.tsx` | ContentLayout, breadcrumb |
| Response helpers | `lib/api/response.ts` | paginatedResponse, createdResponse |
| Auth middleware | `lib/auth/with-auth.ts` | withAuth wrapper |
| Query config | `lib/config/query-config.ts` | DYNAMIC_DATA, SEMI_STABLE_DATA |
| API client | `lib/api/client.ts` | apiClient.get/post/patch |
| Base service | `lib/services/base-service.ts` | validate(), supabase getter |
