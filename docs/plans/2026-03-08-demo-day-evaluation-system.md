# Demo Day Evaluation System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Demo Day evaluation/verification flow into MyJKKN so evaluators can verify team claims during presentations, the leaderboard auto-ranks by verified scores, and admins can freeze metrics, review flagged teams, and publish results — all within the existing startup-studio module.

**Architecture:** New `appathon_verifications` table stores one record per evaluator per team (evaluator-verified user/revenue numbers + calculated score). The self-reported scoring system (`event_submissions.total_score`, T0-T5) is **preserved unchanged** — it's the team's side. The verified scoring (T1-T4 + revenue bonus) is a parallel system in `appathon_verifications`. Leaderboard has 3 states: preliminary (self-reported), in-progress (frozen), published (verified). Admin controls for freeze/publish live in the enhanced `/demo-day` page. Evaluators use a new `/evaluate` page.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS), React Query v5, React Hook Form + Zod, shadcn/ui, TypeScript, Sonner toasts

---

## Table Name Mapping (Spec → Actual)

> The spec uses `ss_*` names. All code must use actual table names.

| Spec Reference | Actual Table Name |
|---|---|
| `ss_events` | `startup_events` |
| `ss_teams` | `event_registrations` |
| `ss_team_members` | `event_team_members` |
| `ss_appathon_submissions` | `event_submissions` |
| `ss_event_venues` | `event_venue_assignments` |
| `ss_venue_staff` | `event_staff_assignments` |
| `appathon_verifications` | `appathon_verifications` ← **new table, same name** |

> **Important:** `event_staff_assignments.staff_id` links to the `staff` table, which then has `staff.profile_id → profiles.id`. Evaluator auth uses `staff.profile_id = auth.uid()`, not `event_staff_assignments.staff_id = auth.uid()`.

---

## Scoring System (Two Parallel Systems — DO NOT Merge)

| | Self-Reported (team) | Verified (evaluator) |
|---|---|---|
| **Table** | `event_submissions` | `appathon_verifications` |
| **Tiers** | T0-T5 (unchanged) | T1-T4 only |
| **Tier logic** | live URL, user_count, mrr_amount | active users threshold |
| **Revenue** | Part of tier (T4/T5) | Separate bonus (+5 or +10) |
| **Used by** | Submit page, prelim leaderboard | Evaluate page, final leaderboard |

**Verified Tier Logic:**
```
verified_active_users >= 25  → Tier 4 → 50 pts
verified_active_users >= 10  → Tier 3 → 40 pts
verified_users >= 5          → Tier 2 → 25 pts
app_live = true              → Tier 1 → 10 pts
otherwise                    → Tier 0 →  0 pts

revenue_bonus:
  verified_revenue >= 100 → +10 pts
  verified_revenue >= 1   →  +5 pts
  otherwise               →   0 pts

total_score = tier_points + revenue_bonus
```

---

## Build Priority

| Priority | Tasks | Why |
|----------|-------|-----|
| **P0** | 1, 2, 3, 6, 7, 8, 9 | Foundation + evaluator page + admin freeze — needed at 9:15 AM |
| **P1** | 4, 5, 10, 11, 12 | Leaderboard states + metric locking + navigation |
| **P2** | 13, 14 | CSV export + role card status |
| **P3** | (not in this plan) | Offline support, presentation timer, realtime |

**Minimum viable Demo Day = P0 tasks only (1, 2, 3, 6, 7, 8, 9)**

---

## Task 1: Add `active_users_count` to `event_submissions`

**Files:**
- Modify: `supabase/setup/01_tables.sql`
- Modify: `types/startup-studio.ts`
- Modify: `lib/services/startup-studio/event-submission-service.ts`

**Why:** Spec distinguishes "total users signed up" (for Tier 2) from "active users" (for Tier 3/4). Current schema only has `user_count`. The evaluation form needs both fields from the team's submission.

**Step 1: Add column to 01_tables.sql**

In `supabase/setup/01_tables.sql`, find the `event_submissions` table. Add after `user_count INT DEFAULT 0,`:

```sql
    active_users_count INT DEFAULT 0,         -- Active users (separate from total signups; added 2026-03-08)
```

**Step 2: Apply migration via Supabase MCP**

```sql
ALTER TABLE event_submissions ADD COLUMN IF NOT EXISTS active_users_count INT DEFAULT 0;
```

**Step 3: Update TypeScript type in `types/startup-studio.ts`**

Find `EventSubmission` interface, add:
```typescript
  active_users_count: number
```

Find `UpdateMetricsDto`, add:
```typescript
  active_users_count: number
```

**Step 4: Update `event-submission-service.ts` updateMetrics method**

Find the `updateMetrics` method. Add `active_users_count` to the update payload and re-calculate score (existing score calc won't use it — that's fine, it's for the evaluator side).

```typescript
// In updateMetrics, add to the update object:
active_users_count: dto.active_users_count ?? 0,
```

**Step 5: Add Active Users field to the metrics form in submit page**

In `app/(routes)/startup-studio/events/[id]/submit/_components/metrics-section.tsx` (or wherever the metrics form lives), add an "Active Users" number input after "Total Users":

```tsx
<div className="space-y-1">
  <Label htmlFor="active_users_count">Active Users</Label>
  <Input
    id="active_users_count"
    type="number"
    min={0}
    placeholder="0"
    {...form.register('active_users_count', { valueAsNumber: true })}
  />
  <p className="text-xs text-muted-foreground">
    Users who have performed at least one action in your app (not just signed up)
  </p>
</div>
```

**Step 6: Commit**

```bash
git add supabase/setup/01_tables.sql types/startup-studio.ts lib/services/startup-studio/event-submission-service.ts
git commit -m "feat(demo-day): add active_users_count field to event_submissions"
```

---

## Task 2: Add `metrics_frozen_at` and `results_published_at` Columns

**Files:**
- Modify: `supabase/setup/01_tables.sql`
- Modify: `types/startup-studio.ts`

**Why:** Admin needs to freeze metrics at 9:15 AM (preventing team updates). We need a timestamp for when this happened, and when results were published. These go directly on `startup_events` as columns (not in the JSONB config, for easier querying).

**Step 1: Add columns to `startup_events` in 01_tables.sql**

After the `is_results_published BOOLEAN` line, add:

```sql
    metrics_frozen_at TIMESTAMPTZ,          -- When admin froze team metrics (added 2026-03-08)
    results_published_at TIMESTAMPTZ,       -- When results were published (added 2026-03-08)
```

**Step 2: Apply migration**

```sql
ALTER TABLE startup_events ADD COLUMN IF NOT EXISTS metrics_frozen_at TIMESTAMPTZ;
ALTER TABLE startup_events ADD COLUMN IF NOT EXISTS results_published_at TIMESTAMPTZ;
```

**Step 3: Update `StartupEvent` type in `types/startup-studio.ts`**

```typescript
export interface StartupEvent {
  // ... existing fields ...
  metrics_frozen_at: string | null      // ADD — ISO timestamp when frozen
  results_published_at: string | null   // ADD — ISO timestamp when published
}
```

**Step 4: Commit**

```bash
git commit -m "feat(demo-day): add metrics_frozen_at and results_published_at to startup_events"
```

---

## Task 3: Create `appathon_verifications` Table + RLS

**Files:**
- Modify: `supabase/setup/01_tables.sql`
- Modify: `supabase/setup/03_policies.sql`
- Modify: `supabase/SQL_FILE_INDEX.md`

**Why:** Core table for the evaluation system. One row per evaluator per team. Stores both team's claimed values (copied at freeze time) and evaluator's verified values, plus auto-calculated score.

**Step 1: Add table to 01_tables.sql**

Add at the END of the startup-studio tables section in `01_tables.sql`:

```sql
-- ─── Appathon Verifications (Demo Day Evaluation System) ──────────────────
-- Added: 2026-03-08 - One row per evaluator per team. Evaluators verify
-- team claims (live URL, user counts, revenue) during Demo Day presentations.
-- Scoring: T1-T4 user-based tiers + revenue bonus (separate from self-reported T0-T5).
CREATE TABLE IF NOT EXISTS public.appathon_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Core relationships
    submission_id UUID NOT NULL REFERENCES event_submissions(id) ON DELETE CASCADE,
    evaluator_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    venue_id      UUID NOT NULL REFERENCES event_venue_assignments(id) ON DELETE CASCADE,

    -- Team presence
    presented          BOOLEAN DEFAULT false,   -- Did the team actually present?
    presentation_slot  INT,                     -- Order number in the venue (from event_demo_slots)

    -- App verification
    app_live BOOLEAN DEFAULT false,             -- Does the live URL load and work?

    -- Claimed values (copied from event_submissions at freeze time)
    claimed_users        INT           DEFAULT 0,  -- From event_submissions.user_count
    claimed_active_users INT           DEFAULT 0,  -- From event_submissions.active_users_count
    claimed_revenue      NUMERIC(10,2) DEFAULT 0,  -- From event_submissions.mrr_amount

    -- Verified values (evaluator-confirmed after checking proof)
    verified_users        INT           DEFAULT 0,
    verified_active_users INT           DEFAULT 0,
    verified_revenue      NUMERIC(10,2) DEFAULT 0,

    -- Calculated scores (server-recomputed on every save, do not trust client)
    verified_tier  INT DEFAULT 0,   -- 0-4 (spec tier level)
    revenue_bonus  INT DEFAULT 0,   -- 0, 5, or 10 (bonus points)
    total_score    INT DEFAULT 0,   -- verified tier points + revenue_bonus

    -- Verification outcome
    verification_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (verification_status IN ('pending', 'verified', 'flagged', 'disqualified')),
    flag_reason TEXT,               -- Required when flagged or disqualified
    notes TEXT,                     -- Evaluator's free-text observations

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One verification per evaluator per team
    UNIQUE(submission_id, evaluator_id)
);

CREATE INDEX IF NOT EXISTS idx_appathon_verifications_submission
    ON appathon_verifications(submission_id);
CREATE INDEX IF NOT EXISTS idx_appathon_verifications_evaluator
    ON appathon_verifications(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_appathon_verifications_venue
    ON appathon_verifications(venue_id);
CREATE INDEX IF NOT EXISTS idx_appathon_verifications_status
    ON appathon_verifications(verification_status);
```

**Step 2: Apply via Supabase MCP** — run the CREATE TABLE statement above.

**Step 3: Add RLS policies to 03_policies.sql**

```sql
-- ─── RLS: appathon_verifications ──────────────────────────────────────────
-- Added: 2026-03-08
ALTER TABLE appathon_verifications ENABLE ROW LEVEL SECURITY;

-- Evaluators see their own; admins see all
CREATE POLICY "appathon_verifications_select"
    ON appathon_verifications FOR SELECT
    USING (
        evaluator_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('admin', 'super_admin', 'administrator')
        )
    );

-- Evaluators can create their own verifications
-- (must be assigned to venue where team is presenting)
CREATE POLICY "appathon_verifications_insert"
    ON appathon_verifications FOR INSERT
    WITH CHECK (
        evaluator_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM event_staff_assignments esa
            JOIN staff s ON s.id = esa.staff_id
            WHERE esa.venue_assignment_id = appathon_verifications.venue_id
            AND s.profile_id = auth.uid()
            AND esa.role IN ('judge', 'panel_chair', 'evaluator')
            AND esa.day_type = 'demo_day'
        )
    );

-- Evaluators update their own; admins update any
CREATE POLICY "appathon_verifications_update"
    ON appathon_verifications FOR UPDATE
    USING (
        evaluator_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('admin', 'super_admin', 'administrator')
        )
    );
```

**Step 4: Apply RLS policies via Supabase MCP.**

**Step 5: Update `supabase/SQL_FILE_INDEX.md`**

Add `appathon_verifications` to the tables section with: "Demo Day evaluation records — one per evaluator per team. Parallel scoring system (T1-T4 + revenue bonus) separate from self-reported scores."

**Step 6: Commit**

```bash
git commit -m "feat(demo-day): create appathon_verifications table with RLS policies"
```

---

## Task 4: Create Database Views

**Files:**
- Modify: `supabase/setup/05_views.sql`

**Why:** `appathon_leaderboard` view provides a unified query for the leaderboard (merges submission data with verification data). `evaluator_progress` view lets admins see which evaluators have completed how many verifications.

**Step 1: Add `appathon_leaderboard` view to 05_views.sql**

```sql
-- ─── View: appathon_leaderboard ───────────────────────────────────────────
-- Added: 2026-03-08 - Unified leaderboard using verified scores when available.
-- Pre-publish: COALESCE falls back to self-reported. Post-publish: verified data dominates.
CREATE OR REPLACE VIEW appathon_leaderboard AS
SELECT
    es.id AS submission_id,
    er.id AS team_id,
    er.team_name,
    er.institution_id,
    es.app_name,
    es.live_app_url,
    es.category,
    -- Verified tier (from evaluation) OR self-reported tier as fallback
    COALESCE(av.verified_tier, es.tier_level)          AS verified_tier,
    CASE COALESCE(av.verified_tier, es.tier_level)
        WHEN 4 THEN 50
        WHEN 3 THEN 40
        WHEN 2 THEN 25
        WHEN 1 THEN 10
        ELSE 0
    END                                                 AS tier_points,
    COALESCE(av.revenue_bonus, es.mrr_bonus_points)    AS revenue_bonus,
    COALESCE(av.total_score, es.total_score)           AS total_score,
    COALESCE(av.verified_users, es.user_count)         AS verified_users,
    COALESCE(av.verified_active_users, es.active_users_count) AS verified_active_users,
    COALESCE(av.verified_revenue, es.mrr_amount)       AS verified_revenue,
    av.verification_status,
    av.presented,
    av.evaluator_id,
    eva.manual_name                                     AS venue_name,
    -- College rank (within institution)
    RANK() OVER (
        PARTITION BY er.institution_id
        ORDER BY
            COALESCE(av.total_score, es.total_score) DESC,
            COALESCE(av.verified_active_users, es.active_users_count) DESC,
            COALESCE(av.verified_revenue, es.mrr_amount) DESC
    ) AS college_rank,
    -- Overall rank (across all institutions)
    RANK() OVER (
        ORDER BY
            COALESCE(av.total_score, es.total_score) DESC,
            COALESCE(av.verified_active_users, es.active_users_count) DESC,
            COALESCE(av.verified_revenue, es.mrr_amount) DESC
    ) AS overall_rank
FROM event_submissions es
JOIN event_registrations er ON es.registration_id = er.id
LEFT JOIN appathon_verifications av ON av.submission_id = es.id
LEFT JOIN event_venue_assignments eva ON av.venue_id = eva.id
WHERE es.submitted_at IS NOT NULL;
```

**Step 2: Add `evaluator_progress` view**

```sql
-- ─── View: evaluator_progress ─────────────────────────────────────────────
-- Added: 2026-03-08 - Tracks how many teams each evaluator has verified per venue.
CREATE OR REPLACE VIEW evaluator_progress AS
SELECT
    esa.staff_id,
    s.profile_id                                AS evaluator_profile_id,
    p.full_name                                 AS evaluator_name,
    esa.venue_assignment_id                     AS venue_id,
    eva.manual_name                             AS venue_name,
    esa.event_id,
    COUNT(DISTINCT etva.registration_id)        AS total_teams,
    COUNT(DISTINCT av.submission_id)            AS verified_count,
    COUNT(DISTINCT etva.registration_id)
        - COUNT(DISTINCT av.submission_id)      AS remaining
FROM event_staff_assignments esa
JOIN staff s ON esa.staff_id = s.id
JOIN profiles p ON s.profile_id = p.id
JOIN event_venue_assignments eva ON esa.venue_assignment_id = eva.id
JOIN event_team_venue_allocations etva
    ON etva.venue_assignment_id = esa.venue_assignment_id
    AND etva.day_type = 'demo_day'
LEFT JOIN event_submissions es ON es.registration_id = etva.registration_id
LEFT JOIN appathon_verifications av
    ON av.submission_id = es.id
    AND av.evaluator_id = s.profile_id
    AND av.verification_status IN ('verified', 'flagged', 'disqualified')
WHERE eva.day_type = 'demo_day'
  AND esa.role IN ('judge', 'panel_chair', 'evaluator')
  AND esa.day_type = 'demo_day'
GROUP BY esa.staff_id, s.profile_id, p.full_name, esa.venue_assignment_id, eva.manual_name, esa.event_id;
```

**Step 3: Apply both views via Supabase MCP.**

**Step 4: Commit**

```bash
git commit -m "feat(demo-day): add appathon_leaderboard and evaluator_progress views"
```

---

## Task 5: Add Verification TypeScript Types

**Files:**
- Modify: `types/startup-studio.ts`

**Step 1: Add all new types to `types/startup-studio.ts`**

Add this block after the existing `LeaderboardEntry` type:

```typescript
// ─── Demo Day Verification Types (added 2026-03-08) ──────────────────────

export type VerificationStatus = 'pending' | 'verified' | 'flagged' | 'disqualified'

export interface AppathonVerification {
  id: string
  submission_id: string
  evaluator_id: string
  venue_id: string
  presented: boolean
  presentation_slot: number | null
  app_live: boolean
  claimed_users: number
  claimed_active_users: number
  claimed_revenue: number
  verified_users: number
  verified_active_users: number
  verified_revenue: number
  verified_tier: number
  revenue_bonus: number
  total_score: number
  verification_status: VerificationStatus
  flag_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // Joined fields (present when queried with select)
  evaluator?: { full_name: string }
  venue?: { manual_name: string }
}

export interface CreateVerificationDto {
  submission_id: string
  venue_id: string
  presented: boolean
  app_live: boolean
  verified_users: number
  verified_active_users: number
  verified_revenue: number
  verification_status: VerificationStatus
  flag_reason?: string
  notes?: string
}

export interface UpdateVerificationDto extends Partial<CreateVerificationDto> {}

export interface VerificationScore {
  tier: number          // 0–4
  tier_points: number   // 0, 10, 25, 40, or 50
  revenue_bonus: number // 0, 5, or 10
  total_score: number
}

// Data shape returned by the appathon_leaderboard view
export interface VerifiedLeaderboardEntry {
  submission_id: string
  team_id: string
  team_name: string
  institution_id: string
  app_name: string | null
  live_app_url: string | null
  category: string | null
  verified_tier: number
  tier_points: number
  revenue_bonus: number
  total_score: number
  verified_users: number
  verified_active_users: number
  verified_revenue: number
  verification_status: VerificationStatus | null
  presented: boolean | null
  evaluator_id: string | null
  venue_name: string | null
  college_rank: number
  overall_rank: number
}

// A single team card shown to the evaluator
export interface EvaluatorTeamCard {
  registration_id: string
  team_name: string
  institution_name: string
  demo_slot: number | null
  venue_id: string            // venue_assignment_id for the team's demo venue
  submission: {
    id: string
    app_name: string | null
    live_app_url: string | null
    github_url: string | null
    user_count: number
    active_users_count: number
    mrr_amount: number
    proof_urls: string[]
  } | null
  verification: AppathonVerification | null
}

// Admin view of evaluator progress
export interface EvaluatorProgress {
  staff_id: string
  evaluator_profile_id: string
  evaluator_name: string
  venue_id: string
  venue_name: string
  event_id: string
  total_teams: number
  verified_count: number
  remaining: number
}
```

**Step 2: Commit**

```bash
git commit -m "feat(demo-day): add verification TypeScript types"
```

---

## Task 6: Create `AppathonVerificationService`

**Files:**
- Create: `lib/services/startup-studio/appathon-verification-service.ts`

**Step 1: Create the file**

```typescript
// lib/services/startup-studio/appathon-verification-service.ts
import { createClientSupabaseClient } from '@/lib/supabase/client'
import type {
  AppathonVerification,
  CreateVerificationDto,
  UpdateVerificationDto,
  EvaluatorTeamCard,
  EvaluatorProgress,
  VerificationScore,
  VerifiedLeaderboardEntry,
} from '@/types/startup-studio'

export class AppathonVerificationService {
  // ─── Score Calculation (matches DB logic — call server-side too) ──────────
  static calculateScore(params: {
    app_live: boolean
    verified_users: number
    verified_active_users: number
    verified_revenue: number
  }): VerificationScore {
    const { app_live, verified_users, verified_active_users, verified_revenue } = params

    // Tier: highest achieved (not cumulative). Active users take priority.
    let tier = 0
    if (verified_active_users >= 25) tier = 4
    else if (verified_active_users >= 10) tier = 3
    else if (verified_users >= 5) tier = 2
    else if (app_live) tier = 1

    const tierPointsMap: Record<number, number> = { 0: 0, 1: 10, 2: 25, 3: 40, 4: 50 }
    const tier_points = tierPointsMap[tier] ?? 0

    // Revenue bonus (separate from tier — any verified revenue counts)
    let revenue_bonus = 0
    if (verified_revenue >= 100) revenue_bonus = 10
    else if (verified_revenue >= 1) revenue_bonus = 5

    return { tier, tier_points, revenue_bonus, total_score: tier_points + revenue_bonus }
  }

  // ─── Evaluator: Get Teams Queue ──────────────────────────────────────────
  /**
   * Returns all teams in the evaluator's demo day venue, with their verification status.
   * Sorted by demo slot order (presentation order).
   */
  static async getEvaluatorTeams(
    eventId: string,
    evaluatorProfileId: string
  ): Promise<EvaluatorTeamCard[]> {
    const supabase = createClientSupabaseClient()

    // 1. Find evaluator's venue assignments for this event (demo day, judge roles)
    const { data: staffAssignments, error: staffErr } = await supabase
      .from('event_staff_assignments')
      .select('venue_assignment_id, staff!inner(profile_id)')
      .eq('event_id', eventId)
      .eq('day_type', 'demo_day')
      .in('role', ['judge', 'panel_chair', 'evaluator'])
      .eq('staff.profile_id', evaluatorProfileId)

    if (staffErr) throw staffErr
    if (!staffAssignments?.length) return []

    const venueIds = staffAssignments.map(sa => sa.venue_assignment_id)

    // 2. Get teams allocated to those venues for demo day
    const { data: allocations, error: allocErr } = await supabase
      .from('event_team_venue_allocations')
      .select(`
        registration_id,
        venue_assignment_id,
        event_registrations!inner(
          id,
          team_name,
          institution_id,
          institutions!inner(name),
          event_submissions(
            id, app_name, live_app_url, github_url,
            user_count, active_users_count, mrr_amount, proof_urls
          )
        )
      `)
      .in('venue_assignment_id', venueIds)
      .eq('day_type', 'demo_day')

    if (allocErr) throw allocErr

    // 3. Get this evaluator's existing verifications
    const submissionIds = (allocations ?? [])
      .flatMap(a => {
        const reg = a.event_registrations as any
        return (reg?.event_submissions ?? []).map((s: any) => s.id)
      })
      .filter(Boolean)

    const { data: verifications } = await supabase
      .from('appathon_verifications')
      .select('*')
      .in('submission_id', submissionIds)
      .eq('evaluator_id', evaluatorProfileId)

    const verificationMap = new Map(
      (verifications ?? []).map(v => [v.submission_id, v])
    )

    // 4. Get demo slots (for presentation order)
    const { data: demoSlots } = await supabase
      .from('event_demo_slots')
      .select('registration_id, slot_order')
      .eq('event_id', eventId)
      .in('venue_assignment_id', venueIds)

    const slotMap = new Map(
      (demoSlots ?? []).map(s => [s.registration_id, s.slot_order])
    )

    // 5. Build EvaluatorTeamCard[]
    return (allocations ?? [])
      .map(a => {
        const reg = a.event_registrations as any
        const submission = reg?.event_submissions?.[0] ?? null
        return {
          registration_id: a.registration_id,
          team_name: reg?.team_name ?? '',
          institution_name: reg?.institutions?.name ?? '',
          demo_slot: slotMap.get(a.registration_id) ?? null,
          venue_id: a.venue_assignment_id,
          submission: submission
            ? {
                id: submission.id,
                app_name: submission.app_name,
                live_app_url: submission.live_app_url,
                github_url: submission.github_url,
                user_count: submission.user_count ?? 0,
                active_users_count: submission.active_users_count ?? 0,
                mrr_amount: Number(submission.mrr_amount ?? 0),
                proof_urls: submission.proof_urls ?? [],
              }
            : null,
          verification: submission
            ? (verificationMap.get(submission.id) ?? null)
            : null,
        } satisfies EvaluatorTeamCard
      })
      .sort((a, b) => (a.demo_slot ?? 999) - (b.demo_slot ?? 999))
  }

  // ─── Evaluator: Upsert Verification ──────────────────────────────────────
  /**
   * Create or update a verification. Server recomputes score to prevent tampering.
   * Uses upsert on (submission_id, evaluator_id) unique constraint.
   */
  static async upsertVerification(
    dto: CreateVerificationDto,
    evaluatorProfileId: string
  ): Promise<AppathonVerification> {
    const supabase = createClientSupabaseClient()

    // Server-side score recomputation (do not trust client-sent scores)
    const score = AppathonVerificationService.calculateScore({
      app_live: dto.app_live,
      verified_users: dto.verified_users,
      verified_active_users: dto.verified_active_users,
      verified_revenue: dto.verified_revenue,
    })

    // Copy claimed values from submission at upsert time
    const { data: sub } = await supabase
      .from('event_submissions')
      .select('user_count, active_users_count, mrr_amount')
      .eq('id', dto.submission_id)
      .single()

    const payload = {
      submission_id: dto.submission_id,
      evaluator_id: evaluatorProfileId,
      venue_id: dto.venue_id,
      presented: dto.presented,
      app_live: dto.app_live,
      claimed_users: sub?.user_count ?? 0,
      claimed_active_users: sub?.active_users_count ?? 0,
      claimed_revenue: Number(sub?.mrr_amount ?? 0),
      verified_users: dto.verified_users,
      verified_active_users: dto.verified_active_users,
      verified_revenue: dto.verified_revenue,
      verified_tier: score.tier,
      revenue_bonus: score.revenue_bonus,
      total_score: score.total_score,
      verification_status: dto.verification_status,
      flag_reason: dto.flag_reason ?? null,
      notes: dto.notes ?? null,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('appathon_verifications')
      .upsert(payload, { onConflict: 'submission_id,evaluator_id' })
      .select()
      .single()

    if (error) throw error
    return data as AppathonVerification
  }

  // ─── Admin: Update Verification ───────────────────────────────────────────
  static async adminUpdateVerification(
    verificationId: string,
    dto: UpdateVerificationDto
  ): Promise<AppathonVerification> {
    const supabase = createClientSupabaseClient()

    // Recompute score if numeric fields changed
    let scoreUpdate: Partial<AppathonVerification> = {}
    if (
      dto.verified_users !== undefined ||
      dto.verified_active_users !== undefined ||
      dto.verified_revenue !== undefined ||
      dto.app_live !== undefined
    ) {
      const { data: current } = await supabase
        .from('appathon_verifications')
        .select('app_live, verified_users, verified_active_users, verified_revenue')
        .eq('id', verificationId)
        .single()

      if (current) {
        const score = AppathonVerificationService.calculateScore({
          app_live: dto.app_live ?? current.app_live,
          verified_users: dto.verified_users ?? current.verified_users,
          verified_active_users: dto.verified_active_users ?? current.verified_active_users,
          verified_revenue: Number(dto.verified_revenue ?? current.verified_revenue),
        })
        scoreUpdate = {
          verified_tier: score.tier,
          revenue_bonus: score.revenue_bonus,
          total_score: score.total_score,
        } as any
      }
    }

    const { data, error } = await supabase
      .from('appathon_verifications')
      .update({ ...dto, ...scoreUpdate, updated_at: new Date().toISOString() })
      .eq('id', verificationId)
      .select()
      .single()

    if (error) throw error
    return data as AppathonVerification
  }

  // ─── Admin: Get Flagged Teams ─────────────────────────────────────────────
  static async getFlaggedVerifications(eventId: string): Promise<AppathonVerification[]> {
    const supabase = createClientSupabaseClient()

    const { data, error } = await supabase
      .from('appathon_verifications')
      .select(`
        *,
        event_submissions!inner(
          id, app_name, event_id,
          event_registrations!inner(team_name)
        ),
        profiles!evaluator_id(full_name)
      `)
      .eq('event_submissions.event_id', eventId)
      .in('verification_status', ['flagged', 'disqualified'])
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []) as AppathonVerification[]
  }

  // ─── Admin: Verified Leaderboard ─────────────────────────────────────────
  static async getVerifiedLeaderboard(eventId: string): Promise<VerifiedLeaderboardEntry[]> {
    const supabase = createClientSupabaseClient()

    const { data, error } = await supabase
      .from('appathon_leaderboard')
      .select(`*, event_registrations!inner(event_id)`)
      .eq('event_registrations.event_id', eventId)
      .order('overall_rank', { ascending: true })

    if (error) throw error
    return (data ?? []) as VerifiedLeaderboardEntry[]
  }

  // ─── Admin: Evaluator Progress ────────────────────────────────────────────
  static async getEvaluatorProgress(eventId: string): Promise<EvaluatorProgress[]> {
    const supabase = createClientSupabaseClient()

    const { data, error } = await supabase
      .from('evaluator_progress')
      .select('*')
      .eq('event_id', eventId)

    if (error) throw error
    return (data ?? []) as EvaluatorProgress[]
  }

  // ─── Admin: Freeze Metrics ────────────────────────────────────────────────
  static async freezeMetrics(eventId: string): Promise<void> {
    const supabase = createClientSupabaseClient()
    const { error } = await supabase
      .from('startup_events')
      .update({ metrics_frozen_at: new Date().toISOString() })
      .eq('id', eventId)
    if (error) throw error
  }

  // ─── Admin: Publish Results ───────────────────────────────────────────────
  static async publishResults(eventId: string): Promise<void> {
    const supabase = createClientSupabaseClient()
    const { error } = await supabase
      .from('startup_events')
      .update({
        is_results_published: true,
        results_published_at: new Date().toISOString(),
      })
      .eq('id', eventId)
    if (error) throw error
  }
}
```

**Step 2: Commit**

```bash
git commit -m "feat(demo-day): create AppathonVerificationService with score calculation, upsert, admin controls"
```

---

## Task 7: Create React Query Hooks

**Files:**
- Create: `hooks/startup-studio/use-appathon-verifications.ts`

**Step 1: Create the hooks file**

```typescript
// hooks/startup-studio/use-appathon-verifications.ts
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AppathonVerificationService } from '@/lib/services/startup-studio/appathon-verification-service'
import type { CreateVerificationDto, UpdateVerificationDto } from '@/types/startup-studio'

// ─── Query Keys ─────────────────────────────────────────────────────────────
export const verificationKeys = {
  evaluatorTeams: (eventId: string, profileId: string) =>
    ['evaluator-teams', eventId, profileId] as const,
  flaggedVerifications: (eventId: string) =>
    ['flagged-verifications', eventId] as const,
  evaluatorProgress: (eventId: string) =>
    ['evaluator-progress', eventId] as const,
  verifiedLeaderboard: (eventId: string) =>
    ['verified-leaderboard', eventId] as const,
}

// ─── Evaluator Hooks ─────────────────────────────────────────────────────────

/** Get all teams in evaluator's demo day venue with verification status */
export function useEvaluatorTeams(eventId: string, profileId: string) {
  return useQuery({
    queryKey: verificationKeys.evaluatorTeams(eventId, profileId),
    queryFn: () => AppathonVerificationService.getEvaluatorTeams(eventId, profileId),
    staleTime: 30_000,
    enabled: !!eventId && !!profileId,
  })
}

/** Submit or update a verification (upsert) */
export function useUpsertVerification(eventId: string, profileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateVerificationDto) =>
      AppathonVerificationService.upsertVerification(dto, profileId),
    onSuccess: () => {
      toast.success('Verification saved')
      qc.invalidateQueries({ queryKey: verificationKeys.evaluatorTeams(eventId, profileId) })
      qc.invalidateQueries({ queryKey: verificationKeys.evaluatorProgress(eventId) })
      qc.invalidateQueries({ queryKey: verificationKeys.verifiedLeaderboard(eventId) })
    },
    onError: (error: any) => {
      toast.error('Failed to save verification')
      console.error('[demo-day] verification save error:', error)
    },
  })
}

// ─── Admin Hooks ─────────────────────────────────────────────────────────────

/** Admin: flagged and disqualified verifications for review */
export function useFlaggedVerifications(eventId: string) {
  return useQuery({
    queryKey: verificationKeys.flaggedVerifications(eventId),
    queryFn: () => AppathonVerificationService.getFlaggedVerifications(eventId),
    staleTime: 15_000,
    enabled: !!eventId,
  })
}

/** Admin: override a flagged verification */
export function useAdminUpdateVerification(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateVerificationDto }) =>
      AppathonVerificationService.adminUpdateVerification(id, dto),
    onSuccess: () => {
      toast.success('Verification updated')
      qc.invalidateQueries({ queryKey: verificationKeys.flaggedVerifications(eventId) })
      qc.invalidateQueries({ queryKey: verificationKeys.verifiedLeaderboard(eventId) })
    },
    onError: () => toast.error('Failed to update verification'),
  })
}

/** Evaluator progress per venue (for admin view) */
export function useEvaluatorProgress(eventId: string) {
  return useQuery({
    queryKey: verificationKeys.evaluatorProgress(eventId),
    queryFn: () => AppathonVerificationService.getEvaluatorProgress(eventId),
    staleTime: 15_000,
    enabled: !!eventId,
  })
}

/** Verified leaderboard from appathon_leaderboard view */
export function useVerifiedLeaderboard(eventId: string) {
  return useQuery({
    queryKey: verificationKeys.verifiedLeaderboard(eventId),
    queryFn: () => AppathonVerificationService.getVerifiedLeaderboard(eventId),
    staleTime: 15_000,
    enabled: !!eventId,
  })
}

/** Admin: freeze team metrics */
export function useFreezeMetrics(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => AppathonVerificationService.freezeMetrics(eventId),
    onSuccess: () => {
      toast.success('Metrics frozen. Teams can no longer update their submissions.')
      qc.invalidateQueries({ queryKey: ['startup-event', eventId] })
      qc.invalidateQueries({ queryKey: ['startup-events'] })
    },
    onError: () => toast.error('Failed to freeze metrics'),
  })
}

/** Admin: publish results (makes leaderboard public) */
export function usePublishVerifiedResults(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => AppathonVerificationService.publishResults(eventId),
    onSuccess: () => {
      toast.success('Results published! The leaderboard is now visible to all.')
      qc.invalidateQueries({ queryKey: ['startup-event', eventId] })
      qc.invalidateQueries({ queryKey: ['startup-events'] })
      qc.invalidateQueries({ queryKey: verificationKeys.verifiedLeaderboard(eventId) })
    },
    onError: () => toast.error('Failed to publish results'),
  })
}
```

**Step 2: Commit**

```bash
git commit -m "feat(demo-day): add React Query hooks for verifications, freeze, and publish"
```

---

## Task 8: Build the Evaluator Page (`/evaluate`)

**Files:**
- Create: `app/(routes)/startup-studio/events/[id]/evaluate/page.tsx`
- Create: `app/(routes)/startup-studio/events/[id]/evaluate/_components/verification-card.tsx`
- Create: `app/(routes)/startup-studio/events/[id]/evaluate/_components/evaluator-progress-bar.tsx`

**Why:** This is the core evaluator workspace. Evaluators open this page on their phone/tablet during presentations. They see their venue's teams in slot order, tap each team, see their claims, enter verified numbers, and submit.

**Step 1: Create `evaluator-progress-bar.tsx`**

```tsx
// app/(routes)/startup-studio/events/[id]/evaluate/_components/evaluator-progress-bar.tsx
'use client'

import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'

interface EvaluatorProgressBarProps {
  total: number
  verified: number
  flagged: number
}

export function EvaluatorProgressBar({ total, verified, flagged }: EvaluatorProgressBarProps) {
  const completed = verified + flagged
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {completed} of {total} teams evaluated
        </span>
        <div className="flex gap-2">
          <Badge className="bg-green-500">{verified} verified</Badge>
          {flagged > 0 && (
            <Badge variant="outline" className="text-amber-600 border-amber-400">
              {flagged} flagged
            </Badge>
          )}
        </div>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  )
}
```

**Step 2: Create `verification-card.tsx`**

This is the main evaluation form component. Key behaviors:
- Left column: team's self-reported claims (read-only)
- Right column: evaluator enters verified numbers
- Score auto-calculates live as evaluator types
- Flag/Disqualify require entering a reason before confirming

```tsx
// app/(routes)/startup-studio/events/[id]/evaluate/_components/verification-card.tsx
'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, CheckCircle2, Flag, XCircle, RotateCcw } from 'lucide-react'
import { AppathonVerificationService } from '@/lib/services/startup-studio/appathon-verification-service'
import type { EvaluatorTeamCard, VerificationScore, VerificationStatus } from '@/types/startup-studio'

const schema = z.object({
  presented: z.boolean(),
  app_live: z.boolean(),
  verified_users: z.coerce.number().min(0),
  verified_active_users: z.coerce.number().min(0),
  verified_revenue: z.coerce.number().min(0),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const TIER_LABELS: Record<number, string> = {
  0: 'Level 0 — No Points',
  1: 'Level 1 — App Live (10 pts)',
  2: 'Level 2 — 5+ Users (25 pts)',
  3: 'Level 3 — 10+ Active Users (40 pts)',
  4: 'Level 4 — 25+ Active Users (50 pts)',
}

interface VerificationCardProps {
  team: EvaluatorTeamCard
  onVerify: (
    status: VerificationStatus,
    data: FormData,
    flagReason?: string
  ) => Promise<void>
  isSubmitting: boolean
}

export function VerificationCard({ team, onVerify, isSubmitting }: VerificationCardProps) {
  const [score, setScore] = useState<VerificationScore>({
    tier: 0, tier_points: 0, revenue_bonus: 0, total_score: 0,
  })
  const [pendingAction, setPendingAction] = useState<VerificationStatus | null>(null)
  const [flagReason, setFlagReason] = useState('')

  const existing = team.verification
  const sub = team.submission

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      presented: existing?.presented ?? true,
      app_live: existing?.app_live ?? false,
      verified_users: existing?.verified_users ?? 0,
      verified_active_users: existing?.verified_active_users ?? 0,
      verified_revenue: existing?.verified_revenue ?? 0,
      notes: existing?.notes ?? '',
    },
  })

  const watched = form.watch()

  // Live score preview
  useEffect(() => {
    setScore(AppathonVerificationService.calculateScore({
      app_live: watched.app_live,
      verified_users: Number(watched.verified_users ?? 0),
      verified_active_users: Number(watched.verified_active_users ?? 0),
      verified_revenue: Number(watched.verified_revenue ?? 0),
    }))
  }, [watched.app_live, watched.verified_users, watched.verified_active_users, watched.verified_revenue])

  const handleAction = async (status: VerificationStatus) => {
    const needsReason = status === 'flagged' || status === 'disqualified'
    if (needsReason && !pendingAction) {
      setPendingAction(status)
      return
    }
    const data = form.getValues()
    await onVerify(status, data, needsReason ? flagReason : undefined)
    setPendingAction(null)
    setFlagReason('')
  }

  const statusColor = {
    verified: 'border-green-500 bg-green-50 dark:bg-green-950/20',
    flagged: 'border-amber-500 bg-amber-50 dark:bg-amber-950/20',
    disqualified: 'border-red-500 bg-red-50 dark:bg-red-950/20',
    pending: '',
  }[existing?.verification_status ?? 'pending']

  return (
    <Card className={statusColor}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base leading-tight">
              {team.demo_slot != null ? `Slot ${team.demo_slot}: ` : ''}{team.team_name}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{team.institution_name}</p>
          </div>
          {existing?.verification_status && existing.verification_status !== 'pending' && (
            <Badge
              className={
                existing.verification_status === 'verified'
                  ? 'bg-green-500 shrink-0'
                  : existing.verification_status === 'flagged'
                  ? 'text-amber-600 border-amber-400 shrink-0'
                  : 'text-red-600 border-red-400 shrink-0'
              }
              variant={existing.verification_status === 'verified' ? 'default' : 'outline'}
            >
              {existing.verification_status}
            </Badge>
          )}
        </div>

        {/* External links */}
        {sub && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {sub.live_app_url && (
              <a href={sub.live_app_url} target="_blank" rel="noopener noreferrer">
                <Badge variant="outline" className="cursor-pointer hover:bg-muted gap-1 text-xs">
                  <ExternalLink className="h-3 w-3" /> Live App
                </Badge>
              </a>
            )}
            {sub.github_url && (
              <a href={sub.github_url} target="_blank" rel="noopener noreferrer">
                <Badge variant="outline" className="cursor-pointer hover:bg-muted gap-1 text-xs">
                  <ExternalLink className="h-3 w-3" /> GitHub
                </Badge>
              </a>
            )}
            {(sub.proof_urls ?? []).map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <Badge variant="outline" className="cursor-pointer hover:bg-muted gap-1 text-xs">
                  <ExternalLink className="h-3 w-3" /> Proof {i + 1}
                </Badge>
              </a>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Presented checkbox */}
        <div className="flex items-center gap-2">
          <Checkbox
            id={`presented-${team.registration_id}`}
            checked={form.watch('presented')}
            onCheckedChange={v => form.setValue('presented', !!v)}
          />
          <Label htmlFor={`presented-${team.registration_id}`} className="text-sm">
            Team was present and presented
          </Label>
        </div>

        {/* App live checkbox */}
        <div className="flex items-center gap-2">
          <Checkbox
            id={`app_live-${team.registration_id}`}
            checked={form.watch('app_live')}
            onCheckedChange={v => form.setValue('app_live', !!v)}
          />
          <Label htmlFor={`app_live-${team.registration_id}`} className="text-sm">
            App is live and working
          </Label>
        </div>

        {/* Claims vs Verified table */}
        <div className="rounded-md border overflow-hidden text-sm">
          <div className="grid grid-cols-2 bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <span>Team Claims</span>
            <span>You Verify</span>
          </div>
          <div className="divide-y">
            {/* Total users */}
            <div className="grid grid-cols-2 items-center px-3 py-2 gap-3">
              <span className="text-muted-foreground">
                Total Users: <span className="font-mono text-foreground">{sub?.user_count ?? 0}</span>
              </span>
              <Input
                type="number" min={0} placeholder="0"
                className="h-7 text-sm"
                {...form.register('verified_users')}
              />
            </div>
            {/* Active users */}
            <div className="grid grid-cols-2 items-center px-3 py-2 gap-3">
              <span className="text-muted-foreground">
                Active Users: <span className="font-mono text-foreground">{sub?.active_users_count ?? 0}</span>
              </span>
              <Input
                type="number" min={0} placeholder="0"
                className="h-7 text-sm"
                {...form.register('verified_active_users')}
              />
            </div>
            {/* Revenue */}
            <div className="grid grid-cols-2 items-center px-3 py-2 gap-3">
              <span className="text-muted-foreground">
                Revenue: <span className="font-mono text-foreground">₹{sub?.mrr_amount ?? 0}</span>
              </span>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                <Input
                  type="number" min={0} placeholder="0"
                  className="h-7 text-sm pl-5"
                  {...form.register('verified_revenue')}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Score preview */}
        <div className="rounded-md bg-muted p-3 text-sm space-y-0.5">
          <div className="font-medium">{TIER_LABELS[score.tier]}</div>
          {score.revenue_bonus > 0 && (
            <div className="text-green-600 text-xs">+ Revenue Bonus: +{score.revenue_bonus} pts</div>
          )}
          <div className="text-lg font-bold tabular-nums">
            Total: {score.total_score} pts
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
          <Textarea
            placeholder="Any observations..."
            className="text-sm h-14 resize-none"
            {...form.register('notes')}
          />
        </div>

        {/* Flag/DQ reason (shown when pending action) */}
        {pendingAction && (
          <div className="space-y-1">
            <Label className="text-xs text-amber-700 font-medium">
              {pendingAction === 'disqualified'
                ? 'Disqualification reason (required)'
                : 'Flag reason (required)'}
            </Label>
            <Textarea
              placeholder="Describe the issue clearly..."
              className="text-sm h-16 resize-none border-amber-500 focus-visible:ring-amber-400"
              value={flagReason}
              onChange={e => setFlagReason(e.target.value)}
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="flex-1 bg-green-600 hover:bg-green-700 gap-1.5 min-w-[100px]"
            onClick={() => handleAction('verified')}
            disabled={isSubmitting}
          >
            <CheckCircle2 className="h-4 w-4" />
            {existing?.verification_status === 'verified' ? 'Update' : 'Verify'}
          </Button>

          {(!pendingAction || pendingAction === 'flagged') && (
            <Button
              type="button"
              variant="outline"
              className="flex-1 text-amber-600 border-amber-400 hover:bg-amber-50 gap-1.5 min-w-[100px]"
              onClick={() => handleAction('flagged')}
              disabled={isSubmitting || (pendingAction === 'flagged' && !flagReason.trim())}
            >
              <Flag className="h-4 w-4" />
              {pendingAction === 'flagged' ? 'Confirm Flag' : 'Flag'}
            </Button>
          )}

          {(!pendingAction || pendingAction === 'disqualified') && (
            <Button
              type="button"
              variant="outline"
              className="flex-1 text-red-600 border-red-400 hover:bg-red-50 gap-1.5 min-w-[100px]"
              onClick={() => handleAction('disqualified')}
              disabled={isSubmitting || (pendingAction === 'disqualified' && !flagReason.trim())}
            >
              <XCircle className="h-4 w-4" />
              {pendingAction === 'disqualified' ? 'Confirm DQ' : 'DQ'}
            </Button>
          )}

          {pendingAction && (
            <Button
              type="button"
              variant="ghost"
              className="w-full text-xs"
              onClick={() => { setPendingAction(null); setFlagReason('') }}
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

**Step 3: Create `evaluate/page.tsx`**

```tsx
// app/(routes)/startup-studio/events/[id]/evaluate/page.tsx
'use client'

import { useState } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/hooks/useAuth'
import { useEvent } from '@/hooks/startup-studio/use-events'
import {
  useEvaluatorTeams,
  useUpsertVerification,
} from '@/hooks/startup-studio/use-appathon-verifications'
import { VerificationCard } from './_components/verification-card'
import { EvaluatorProgressBar } from './_components/evaluator-progress-bar'
import type { EvaluatorTeamCard, VerificationStatus } from '@/types/startup-studio'

type TabValue = 'pending' | 'verified' | 'flagged' | 'all'

export default function EvaluatePage({ params }: { params: { id: string } }) {
  const { profile } = useAuth()
  const { data: event, isLoading: eventLoading } = useEvent(params.id)
  const { data: teams = [], isLoading: teamsLoading } = useEvaluatorTeams(
    params.id,
    profile?.id ?? ''
  )
  const { mutateAsync: upsertVerification, isPending } = useUpsertVerification(
    params.id,
    profile?.id ?? ''
  )
  const [tab, setTab] = useState<TabValue>('pending')

  if (eventLoading) {
    return (
      <div className="flex justify-center items-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!event) return notFound()

  // Block evaluation until metrics are frozen
  if (!event.metrics_frozen_at) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-4 pt-12">
        <Lock className="h-12 w-12 text-muted-foreground mx-auto" />
        <h2 className="text-lg font-semibold">Evaluation Not Open Yet</h2>
        <p className="text-sm text-muted-foreground">
          The admin must freeze team metrics before evaluation can begin.
          Please wait for the 9:15 AM signal.
        </p>
        <Link href={`/startup-studio/events/${params.id}`}>
          <Button variant="outline" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back to Event
          </Button>
        </Link>
      </div>
    )
  }

  const pendingTeams = teams.filter(
    t => !t.verification || t.verification.verification_status === 'pending'
  )
  const verifiedTeams = teams.filter(t => t.verification?.verification_status === 'verified')
  const flaggedTeams = teams.filter(
    t =>
      t.verification?.verification_status === 'flagged' ||
      t.verification?.verification_status === 'disqualified'
  )

  const handleVerify = async (
    team: EvaluatorTeamCard,
    status: VerificationStatus,
    data: any,
    flagReason?: string
  ) => {
    if (!team.submission || !profile) return
    await upsertVerification({
      submission_id: team.submission.id,
      venue_id: team.venue_id,
      presented: data.presented,
      app_live: data.app_live,
      verified_users: Number(data.verified_users ?? 0),
      verified_active_users: Number(data.verified_active_users ?? 0),
      verified_revenue: Number(data.verified_revenue ?? 0),
      verification_status: status,
      flag_reason: flagReason,
      notes: data.notes,
    })
  }

  const tabTeams: Record<TabValue, EvaluatorTeamCard[]> = {
    pending: pendingTeams,
    verified: verifiedTeams,
    flagged: flaggedTeams,
    all: teams,
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 p-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/startup-studio/events/${params.id}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-lg font-bold">Demo Day Evaluation</h1>
          <p className="text-xs text-muted-foreground">{event.name}</p>
        </div>
      </div>

      {teams.length === 0 && !teamsLoading && (
        <Alert>
          <AlertDescription>
            No teams assigned to your venue for Demo Day, or you are not assigned as a judge/evaluator for this event.
          </AlertDescription>
        </Alert>
      )}

      {teams.length > 0 && (
        <>
          <EvaluatorProgressBar
            total={teams.length}
            verified={verifiedTeams.length}
            flagged={flaggedTeams.length}
          />

          <Tabs value={tab} onValueChange={v => setTab(v as TabValue)}>
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="pending">Pending ({pendingTeams.length})</TabsTrigger>
              <TabsTrigger value="verified">Done ({verifiedTeams.length})</TabsTrigger>
              <TabsTrigger
                value="flagged"
                className={flaggedTeams.length > 0 ? 'text-amber-600' : ''}
              >
                Flagged ({flaggedTeams.length})
              </TabsTrigger>
              <TabsTrigger value="all">All ({teams.length})</TabsTrigger>
            </TabsList>

            {(['pending', 'verified', 'flagged', 'all'] as TabValue[]).map(tabKey => (
              <TabsContent key={tabKey} value={tabKey} className="space-y-3 mt-3">
                {teamsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : tabTeams[tabKey].length === 0 ? (
                  <div className="text-center py-10 text-sm text-muted-foreground">
                    No teams in this category
                  </div>
                ) : (
                  tabTeams[tabKey].map(team => (
                    <VerificationCard
                      key={team.registration_id}
                      team={team}
                      onVerify={(status, data, flagReason) =>
                        handleVerify(team, status, data, flagReason)
                      }
                      isSubmitting={isPending}
                    />
                  ))
                )}
              </TabsContent>
            ))}
          </Tabs>
        </>
      )}
    </div>
  )
}
```

**Step 4: Commit**

```bash
git commit -m "feat(demo-day): add evaluator /evaluate page with verification cards and progress tracking"
```

---

## Task 9: Enhance Demo Day Admin Page with Freeze Controls

**Files:**
- Modify: `app/(routes)/startup-studio/events/[id]/demo-day/page.tsx`

**Why:** The current demo-day page only handles slot scheduling. It needs three new sections: (1) Demo Day Controls (freeze + publish), (2) Evaluator Progress, (3) Flagged Teams Review.

**Step 1: Add new imports to `demo-day/page.tsx`**

```tsx
import {
  useFreezeMetrics,
  usePublishVerifiedResults,
  useFlaggedVerifications,
  useAdminUpdateVerification,
  useEvaluatorProgress,
} from '@/hooks/startup-studio/use-appathon-verifications'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Lock, Unlock, Eye, Flag, Download, Settings } from 'lucide-react'
```

**Step 2: Initialize new hooks inside the page component**

```tsx
const freezeMetrics = useFreezeMetrics(params.id)
const publishResults = usePublishVerifiedResults(params.id)
const flaggedVerifications = useFlaggedVerifications(params.id)
const adminUpdate = useAdminUpdateVerification(params.id)
const evaluatorProgress = useEvaluatorProgress(params.id)
```

**Step 3: Add "Demo Day Controls" card BEFORE the slot generation form**

This section should show at the very top of the page, above the existing slot management UI:

```tsx
{/* ── Demo Day Controls ── */}
<Card>
  <CardHeader className="pb-3">
    <CardTitle className="flex items-center gap-2 text-base">
      <Settings className="h-4 w-4" />
      Demo Day Controls
    </CardTitle>
  </CardHeader>
  <CardContent className="space-y-3">
    {/* Freeze Metrics */}
    <div className="flex items-center justify-between p-3 rounded-lg border">
      <div>
        <p className="text-sm font-medium">Freeze Metrics</p>
        <p className="text-xs text-muted-foreground">
          {event.metrics_frozen_at
            ? `Frozen at ${new Date(event.metrics_frozen_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
            : 'Prevents teams from updating metrics. Use at 9:15 AM.'}
        </p>
      </div>
      {event.metrics_frozen_at ? (
        <Badge className="bg-green-500 gap-1">
          <Lock className="h-3 w-3" /> Frozen
        </Badge>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="destructive"
              className="gap-1.5"
              disabled={freezeMetrics.isPending}
            >
              <Lock className="h-3.5 w-3.5" />
              Freeze Metrics
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Freeze Team Metrics?</AlertDialogTitle>
              <AlertDialogDescription>
                This prevents ALL teams from updating their user counts and revenue.
                This should only be done at 9:15 AM when presentations begin.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive"
                onClick={() => freezeMetrics.mutate()}
              >
                Freeze Now
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>

    {/* Publish Results */}
    <div className="flex items-center justify-between p-3 rounded-lg border">
      <div>
        <p className="text-sm font-medium">Publish Results</p>
        <p className="text-xs text-muted-foreground">
          {event.is_results_published
            ? `Published at ${event.results_published_at
                ? new Date(event.results_published_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                : '—'}`
            : 'Makes the verified leaderboard visible to all participants.'}
        </p>
      </div>
      {event.is_results_published ? (
        <Badge className="bg-blue-500 gap-1">
          <Eye className="h-3 w-3" /> Published
        </Badge>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={publishResults.isPending || !event.metrics_frozen_at}
            >
              <Eye className="h-3.5 w-3.5" />
              Publish Results
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Publish Results?</AlertDialogTitle>
              <AlertDialogDescription>
                The verified leaderboard will become visible to all participants.
                Make sure all teams have been verified or flagged before publishing.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => publishResults.mutate()}>
                Publish Now
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>

    {/* CSV Export */}
    <div className="flex items-center justify-between p-3 rounded-lg border">
      <div>
        <p className="text-sm font-medium">Export Results</p>
        <p className="text-xs text-muted-foreground">Download all verification data as CSV</p>
      </div>
      <Button size="sm" variant="outline" className="gap-1.5" asChild>
        <a href={`/api/startup-studio/events/${params.id}/export/verifications`} download>
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </a>
      </Button>
    </div>
  </CardContent>
</Card>
```

**Step 4: Add "Evaluator Progress" card AFTER the controls card**

```tsx
{/* ── Evaluator Progress ── */}
{(evaluatorProgress.data?.length ?? 0) > 0 && (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-base">Evaluator Progress</CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      {evaluatorProgress.data!.map(ep => (
        <div key={ep.staff_id} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <div>
              <span className="font-medium">{ep.evaluator_name}</span>
              <span className="text-muted-foreground text-xs ml-2">{ep.venue_name}</span>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {ep.verified_count}/{ep.total_teams}
            </span>
          </div>
          <Progress
            value={ep.total_teams > 0 ? (ep.verified_count / ep.total_teams) * 100 : 0}
            className="h-1.5"
          />
        </div>
      ))}
    </CardContent>
  </Card>
)}
```

**Step 5: Add "Flagged Teams" card AFTER evaluator progress**

```tsx
{/* ── Flagged Teams Review ── */}
{(flaggedVerifications.data?.length ?? 0) > 0 && (
  <Card className="border-amber-400">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base text-amber-700">
        <Flag className="h-4 w-4" />
        Flagged Teams ({flaggedVerifications.data!.length})
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      {flaggedVerifications.data!.map(v => {
        const sub = (v as any).event_submissions
        const reg = sub?.event_registrations
        const evaluator = (v as any).profiles
        return (
          <div key={v.id} className="border rounded-lg p-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-sm">{reg?.team_name ?? '—'}</p>
                <p className="text-xs text-muted-foreground">
                  Flagged by: {evaluator?.full_name ?? '—'}
                </p>
                <p className="text-xs text-red-600 mt-1">
                  Reason: {v.flag_reason}
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  v.verification_status === 'disqualified'
                    ? 'text-red-600 border-red-400'
                    : 'text-amber-600 border-amber-400'
                }
              >
                {v.verification_status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
              <span>
                Claimed: {v.claimed_users} users, {v.claimed_active_users} active, ₹{v.claimed_revenue}
              </span>
              <span>
                Verified: {v.verified_users} users, {v.verified_active_users} active, ₹{v.verified_revenue}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-green-600 border-green-400 hover:bg-green-50 text-xs"
                onClick={() =>
                  adminUpdate.mutate({
                    id: v.id,
                    dto: { verification_status: 'verified' },
                  })
                }
                disabled={adminUpdate.isPending}
              >
                Accept as Verified
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-red-600 border-red-400 hover:bg-red-50 text-xs"
                onClick={() =>
                  adminUpdate.mutate({
                    id: v.id,
                    dto: { verification_status: 'disqualified' },
                  })
                }
                disabled={adminUpdate.isPending}
              >
                Disqualify
              </Button>
            </div>
          </div>
        )
      })}
    </CardContent>
  </Card>
)}
```

**Step 6: Commit**

```bash
git commit -m "feat(demo-day): add freeze controls, evaluator progress, flagged team review to admin page"
```

---

## Task 10: Leaderboard Three-State Display

**Files:**
- Modify: `app/(routes)/startup-studio/events/[id]/leaderboard/page.tsx`
- Modify: `app/(routes)/startup-studio/events/[id]/leaderboard/_components/leaderboard-table.tsx`

**Why:** Leaderboard must show different content based on event state: preliminary (self-reported), in-progress (frozen, verification ongoing), or published (verified scores, DQ badges, college ranks).

**Step 1: Update `leaderboard/page.tsx` to derive state and show banners**

In the page component, derive three state flags:

```tsx
const isFrozen = !!event?.metrics_frozen_at
const isPublished = !!event?.is_results_published
```

Add state-based banner ABOVE the leaderboard table:

```tsx
{/* State banner */}
{!isPublished && !isFrozen && (
  <Alert>
    <Info className="h-4 w-4" />
    <AlertDescription className="text-sm">
      <strong>Preliminary</strong> — Based on team-reported metrics.
      Final rankings will be shown after evaluator verification.
    </AlertDescription>
  </Alert>
)}
{!isPublished && isFrozen && (
  <Alert className="border-amber-400 bg-amber-50 dark:bg-amber-950/20">
    <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
    <AlertDescription className="text-amber-700 text-sm">
      <strong>Verification in progress...</strong> Results will be published
      after all teams are verified. Check back at 2:00 PM.
    </AlertDescription>
  </Alert>
)}
```

**Step 2: Pass `isPublished` and `isFrozen` down to `LeaderboardTable`**

Update `LeaderboardTable` props:
```tsx
interface LeaderboardTableProps {
  eventId: string
  isAdmin: boolean
  isPublished: boolean  // ADD
  isFrozen: boolean     // ADD
}
```

**Step 3: In `leaderboard-table.tsx`, update tier badge display when published**

When `isPublished`, use the spec's 4-tier labels instead of the current T0-T5 labels:

```tsx
const VERIFIED_TIER_LABELS: Record<number, { label: string; className: string }> = {
  0: { label: 'No Points', className: 'text-muted-foreground' },
  1: { label: 'Lv 1 — Live', className: 'text-blue-600 bg-blue-50' },
  2: { label: 'Lv 2 — 5+ Users', className: 'text-purple-600 bg-purple-50' },
  3: { label: 'Lv 3 — 10+ Active', className: 'text-orange-600 bg-orange-50' },
  4: { label: 'Lv 4 — 25+ Active', className: 'text-green-700 bg-green-50' },
}
```

**Step 4: Add DQ badge for disqualified teams when published**

```tsx
// In the team name cell
{isPublished && entry.verification_status === 'disqualified' && (
  <Badge variant="destructive" className="text-xs">DQ</Badge>
)}
```

**Step 5: Add "College Rank" column when published (admin only)**

Show `#college_rank` in a new column when `isPublished && isAdmin`.

**Step 6: Commit**

```bash
git commit -m "feat(demo-day): three-state leaderboard (preliminary/in-progress/published) with DQ badges"
```

---

## Task 11: Block Metric Updates When Frozen

**Files:**
- Modify: `lib/services/startup-studio/event-submission-service.ts`
- Modify: `app/(routes)/startup-studio/events/[id]/submit/page.tsx` (or metrics section component)

**Why:** After admin freezes metrics, teams must not be able to update `user_count`, `active_users_count`, or `mrr_amount`. Must be enforced in the service (not just UI).

**Step 1: Add freeze check to `updateMetrics` in `event-submission-service.ts`**

At the start of the `updateMetrics` method, fetch the event and check:

```typescript
// Check if metrics are frozen (added 2026-03-08)
const { data: eventData } = await supabase
  .from('startup_events')
  .select('metrics_frozen_at')
  .eq('id', eventId)
  .single()

if (eventData?.metrics_frozen_at) {
  throw new Error('Metrics have been frozen for Demo Day evaluation. No further updates are allowed.')
}
```

**Step 2: Show frozen state in submit page UI**

In the submit page (or MetricsSection component), when `event.metrics_frozen_at` is set, show a locked alert and disable all metric inputs:

```tsx
{event.metrics_frozen_at && (
  <Alert className="border-amber-400 bg-amber-50 dark:bg-amber-950/20">
    <Lock className="h-4 w-4 text-amber-600" />
    <AlertDescription className="text-amber-700 text-sm">
      Metrics are locked for Demo Day evaluation. If you need a correction, contact the organizer.
    </AlertDescription>
  </Alert>
)}
```

Pass `disabled={!!event.metrics_frozen_at}` to all metric input fields.

**Step 3: Commit**

```bash
git commit -m "feat(demo-day): block metric updates after metrics are frozen"
```

---

## Task 12: Add Evaluate Link to Event Navigation

**Files:**
- Modify: `lib/sidebarMenuLink.ts` (or wherever event sub-navigation is configured)
- Modify: `app/(routes)/startup-studio/events/[id]/page.tsx` (admin panel section)

**Step 1: Find and update the sidebar/event navigation**

Search for where the demo-day, leaderboard, and other event sub-page links are defined. Add:

```typescript
{
  label: 'Evaluate',
  href: `/startup-studio/events/${id}/evaluate`,
  icon: ClipboardCheck,  // from lucide-react
  roles: ['judge', 'panel_chair', 'evaluator', 'admin', 'super_admin', 'administrator'],
}
```

**Step 2: Add Evaluate link in event detail page admin panel**

In `app/(routes)/startup-studio/events/[id]/page.tsx`, in the admin quick-links section, add a link to `/evaluate` that's visible to judges and evaluators (not just admins):

```tsx
{/* Show to evaluators (judges/panel_chairs/evaluators) */}
{isEvaluator && (
  <AdminLink href={`/startup-studio/events/${params.id}/evaluate`} label="Evaluate" icon={ClipboardCheck} />
)}
```

Where `isEvaluator` checks: user has a `event_staff_assignments` row with role in `['judge', 'panel_chair', 'evaluator']` for this event.

**Step 3: Commit**

```bash
git commit -m "feat(demo-day): add evaluate route to event navigation for judges and evaluators"
```

---

## Task 13: CSV Export API Route

**Files:**
- Create: `app/api/startup-studio/events/[id]/export/verifications/route.ts`

**Step 1: Create the route handler**

```typescript
// app/api/startup-studio/events/[id]/export/verifications/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerSupabaseClient()

  // Auth check — admin only
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!['admin', 'super_admin', 'administrator'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch verification data with joined info
  const { data, error } = await supabase
    .from('appathon_verifications')
    .select(`
      *,
      event_submissions!inner(
        event_id, app_name, live_app_url,
        event_registrations!inner(
          team_name,
          institutions!inner(name)
        )
      ),
      profiles!evaluator_id(full_name)
    `)
    .eq('event_submissions.event_id', params.id)
    .order('total_score', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const headers = [
    'Team Name', 'App Name', 'College', 'Live URL',
    'Claimed Users', 'Verified Users',
    'Claimed Active', 'Verified Active',
    'Claimed Revenue (₹)', 'Verified Revenue (₹)',
    'Tier Level', 'Revenue Bonus', 'Total Score',
    'Status', 'Flag Reason', 'Notes', 'Evaluator',
  ]

  const escapeCell = (val: unknown) =>
    `"${String(val ?? '').replace(/"/g, '""')}"`

  const rows = (data ?? []).map(v => {
    const sub = (v as any).event_submissions
    const reg = sub?.event_registrations
    return [
      reg?.team_name,
      sub?.app_name,
      reg?.institutions?.name,
      sub?.live_app_url,
      v.claimed_users,
      v.verified_users,
      v.claimed_active_users,
      v.verified_active_users,
      v.claimed_revenue,
      v.verified_revenue,
      v.verified_tier,
      v.revenue_bonus,
      v.total_score,
      v.verification_status,
      v.flag_reason,
      v.notes,
      (v as any).profiles?.full_name,
    ].map(escapeCell)
  })

  const csv = [headers.map(escapeCell), ...rows]
    .map(row => row.join(','))
    .join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="demo-day-verifications-${params.id}.csv"`,
    },
  })
}
```

**Step 2: Commit**

```bash
git commit -m "feat(demo-day): add CSV export API route for verification results"
```

---

## Task 14: Role Card Status on My Team Page

**Files:**
- Modify: `app/(routes)/startup-studio/events/[id]/my-team/page.tsx`

**Why:** Spec says My Team page should show role card completion status per member, with a CTA to fill role cards.

**Step 1: Import role card hooks in my-team page**

The `useMyRoleCard` and `useTeamRoleCards` hooks already exist in `hooks/startup-studio/use-role-cards.ts`. The my-team page needs the team's submission ID to query role cards.

**Step 2: Add Role Card Status card to my-team page**

After the team members section, add:

```tsx
{/* Role Card Completion Status */}
{teamSubmission && (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <Star className="h-4 w-4" />
        Team Role Cards
        <Badge variant="secondary" className="ml-auto text-xs">
          {roleCards?.length ?? 0}/{acceptedMembers.length} completed
        </Badge>
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      <Progress
        value={acceptedMembers.length > 0
          ? ((roleCards?.length ?? 0) / acceptedMembers.length) * 100
          : 0
        }
        className="h-1.5"
      />

      <div className="space-y-1.5">
        {acceptedMembers.map(member => {
          const hasCard = roleCards?.some(rc => rc.profile_id === member.profile_id)
          return (
            <div key={member.id} className="flex items-center justify-between text-sm">
              <span className="text-sm">
                {member.full_name}
                {member.profile_id === profile?.id && (
                  <span className="text-xs text-muted-foreground ml-1">(you)</span>
                )}
              </span>
              {hasCard ? (
                <Badge className="bg-green-500 gap-1 text-xs">
                  <CheckCircle2 className="h-3 w-3" /> Done
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Clock className="h-3 w-3" /> Pending
                </Badge>
              )}
            </div>
          )
        })}
      </div>

      {!myRoleCard && (
        <p className="text-xs text-muted-foreground bg-muted rounded p-2">
          Help us build the JKKN Skill Bank! Fill in your Role Card — it takes 1 minute.
        </p>
      )}

      <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
        <Link href={`/startup-studio/events/${params.id}/submit`}>
          <Star className="h-3.5 w-3.5" />
          {myRoleCard ? 'View Role Card' : 'Fill My Role Card'}
        </Link>
      </Button>
    </CardContent>
  </Card>
)}
```

**Step 3: Add `useMyRoleCard` and `useTeamRoleCards` calls** (they need `submissionId` from `teamSubmission?.id`).

**Step 4: Commit**

```bash
git commit -m "feat(demo-day): add role card completion status section to my-team page"
```

---

## What NOT to Build (per spec)

- ❌ No audience voting
- ❌ No subjective scoring (sliders, 1-10 scales)
- ❌ No multi-evaluator averaging — one evaluator per team is the design
- ❌ No separate evaluator app — everything in MyJKKN
- ❌ No print scorecards
- ❌ No edit after publish (warn admin if they try)
- ❌ No evaluator reassignment UI — use existing Venues page
- ❌ Do NOT change the existing T0-T5 self-reported scoring on `event_submissions`
- ❌ No offline support (P3 — phone timer works fine for now)
- ❌ No presentation timer page (P3)

---

## Important Implementation Notes

### RLS: Staff Profile Lookup
`event_staff_assignments.staff_id` → `staff.id` → `staff.profile_id` → `profiles.id`
The RLS policy uses `staff.profile_id = auth.uid()`, not `staff_id = auth.uid()`.

### Score Calculation Must Run Server-Side
The `AppathonVerificationService.upsertVerification` method always recomputes score using `calculateScore()` before inserting/updating. Never trust `verified_tier`, `revenue_bonus`, or `total_score` values from the client request.

### The Leaderboard View JOIN Issue
The `appathon_leaderboard` view joins to `event_registrations` but doesn't directly expose `event_id`. To filter by event, join `event_registrations!inner(event_id)` in the query.

### Metrics Frozen State in `useEvent`
Ensure `useEvent` select string includes `metrics_frozen_at, results_published_at` in its Supabase query. These fields are used by both the submit page (to lock inputs) and the leaderboard page (for state banners).

---

*Plan created: 2026-03-08*
*Feature: Demo Day Evaluation System (Appathon 2.0)*
*Spec: docs/features/startup/Spec-Demo-Day-Evaluation.md*
