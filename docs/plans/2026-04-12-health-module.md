# Health Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build a campus health intelligence system with daily tracking (steps, water, mood), health profiles, gamification, mental health screening, clinical integration, and NAAC analytics.

**Architecture:** Two sprints. Sprint 1 (web): manual step entry, mood/water/profile, PHQ-9/GAD-7, counselor dashboard, consent gate, leaderboards. Sprint 2 (Capacitor native): auto step counting from Health Connect/HealthKit, push notifications, Play Store. Client-side Supabase queries for student dashboard. Server-side API routes with `withAuth` for admin/counselor endpoints. React Query for data fetching. RLS policies enforce privacy (student sees own data only, counselor sees escalated students, leadership sees anonymized aggregates).

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL + RLS + Realtime), React Query, shadcn/ui, Recharts for analytics, Web Pedometer API for step counting.

**Spec:** `docs/SPEC-health-module.md`

---

## Phase 1: Health Profile + Physical Tracking (14 tasks)

Dependencies: None (foundation phase — must complete before Phase 2-4)

### Task 0: Consent Gate

**Files:**
- Create: `app/(routes)/health/_components/consent-gate.tsx`

**Step 1: Build consent gate component**

A full-screen modal/overlay that wraps ALL health pages. If the learner has no consent record in `health_consents`, show:
- Title: "Welcome to JKKN Health"
- Bullet list: "We collect: mood & sleep data, health profile info, screening results"
- Privacy note: "Your data is private. Only you and your assigned counselor can see individual data."
- [I Agree] button → inserts consent record → reveals the health dashboard
- [Learn More] link → expands detailed privacy explanation

Use a React context provider (`HealthConsentProvider`) that wraps the health layout. Every health page checks consent status from context — no per-page duplication.

**Step 2: Add `health_consents` table to Task 1's schema (see below)**

**Step 3: Commit**

```bash
git add "app/(routes)/health/_components/consent-gate.tsx"
git commit -m "feat(health): add DPDP consent gate for health module"
```

---

### Task 1: Database Schema — Core Health Tables

**Files:**
- Modify: `supabase/setup/01_tables.sql` (append new tables)

**Step 1: Add 3 core tables to 01_tables.sql**

```sql
-- ============================================================================
-- HEALTH MODULE TABLES
-- Updated: 2026-04-12 — Health Module Phase 1
-- ============================================================================

-- Health profile per learner (1:1 with learners_profiles)
CREATE TABLE IF NOT EXISTS health_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES institutions(id),
  blood_group text,
  allergies text[] DEFAULT '{}',
  medical_conditions text[] DEFAULT '{}',
  medications text[] DEFAULT '{}',
  vaccination_status jsonb DEFAULT '{}',
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text,
  height_cm numeric,
  weight_kg numeric,
  bmi numeric GENERATED ALWAYS AS (
    CASE WHEN height_cm > 0 AND weight_kg > 0
    THEN ROUND(weight_kg / ((height_cm / 100.0) * (height_cm / 100.0)), 1)
    ELSE NULL END
  ) STORED,
  bmi_category text GENERATED ALWAYS AS (
    CASE
      WHEN weight_kg IS NULL OR height_cm IS NULL OR height_cm = 0 THEN NULL
      WHEN weight_kg / ((height_cm / 100.0) * (height_cm / 100.0)) < 18.5 THEN 'Underweight'
      WHEN weight_kg / ((height_cm / 100.0) * (height_cm / 100.0)) < 25.0 THEN 'Normal'
      WHEN weight_kg / ((height_cm / 100.0) * (height_cm / 100.0)) < 30.0 THEN 'Overweight'
      ELSE 'Obese'
    END
  ) STORED,
  profile_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(learner_id)
);

-- Daily health log (steps, water, mood, sleep, stress)
CREATE TABLE IF NOT EXISTS health_daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  step_count integer DEFAULT 0,
  water_glasses integer DEFAULT 0,
  water_goal integer DEFAULT 8,
  mood integer CHECK (mood BETWEEN 1 AND 5),
  sleep_quality integer CHECK (sleep_quality BETWEEN 1 AND 5),
  stress_level integer CHECK (stress_level BETWEEN 1 AND 5),
  mood_note text,
  step_goal integer DEFAULT 5000,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(learner_id, log_date)
);

-- Streak and gamification tracking
CREATE TABLE IF NOT EXISTS health_streaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
  streak_type text NOT NULL CHECK (streak_type IN ('mood', 'steps', 'water')),
  current_streak integer DEFAULT 0,
  longest_streak integer DEFAULT 0,
  last_logged_date date,
  total_days_logged integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(learner_id, streak_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_health_profiles_learner ON health_profiles(learner_id);
CREATE INDEX IF NOT EXISTS idx_health_profiles_institution ON health_profiles(institution_id);
CREATE INDEX IF NOT EXISTS idx_health_daily_logs_learner_date ON health_daily_logs(learner_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_health_streaks_learner ON health_streaks(learner_id);
```

**Step 2: Apply to staging database**

Run: `Execute via Supabase MCP or Management API`
Verify: `SELECT count(*) FROM information_schema.tables WHERE table_name LIKE 'health_%'` returns 3

**Step 3: Commit**

```bash
git add supabase/setup/01_tables.sql
git commit -m "feat(health): add core health tables — profiles, daily_logs, streaks"
```

---

### Task 2: RLS Policies — Health Data Privacy

**Files:**
- Modify: `supabase/setup/03_policies.sql` (append)

**Step 1: Add RLS policies**

```sql
-- ============================================================================
-- HEALTH MODULE RLS POLICIES
-- Privacy model: student sees own data. Counselor sees escalated. Leadership sees aggregates.
-- ============================================================================

ALTER TABLE health_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_streaks ENABLE ROW LEVEL SECURITY;

-- health_profiles: student can CRUD own profile
CREATE POLICY "health_profiles_self_all" ON health_profiles
  FOR ALL TO authenticated USING (
    learner_id IN (SELECT id FROM learners_profiles WHERE id = auth.uid()
      UNION SELECT id FROM learners_profiles lp JOIN profiles p ON lp.id = p.id WHERE p.id = auth.uid())
  );

-- health_profiles: admin/counselor can read all
CREATE POLICY "health_profiles_admin_read" ON health_profiles
  FOR SELECT TO authenticated USING (
    is_super_admin()
    OR get_current_user_role() = ANY(ARRAY['super_admin','admin','administrator'])
    OR EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON ur.role_id = cr.id
               WHERE ur.user_id = auth.uid() AND cr.role_key IN ('health_counselor','health_supervisor'))
  );

-- health_daily_logs: student sees ONLY own data
CREATE POLICY "health_daily_logs_self_all" ON health_daily_logs
  FOR ALL TO authenticated USING (
    learner_id IN (SELECT id FROM learners_profiles WHERE id = auth.uid()
      UNION SELECT id FROM learners_profiles lp JOIN profiles p ON lp.id = p.id WHERE p.id = auth.uid())
  );

-- health_daily_logs: admin sees aggregates (via RPC function, not direct table)
-- No admin SELECT policy on individual mood data — aggregation only via functions

-- health_streaks: student sees own
CREATE POLICY "health_streaks_self_all" ON health_streaks
  FOR ALL TO authenticated USING (
    learner_id IN (SELECT id FROM learners_profiles WHERE id = auth.uid()
      UNION SELECT id FROM learners_profiles lp JOIN profiles p ON lp.id = p.id WHERE p.id = auth.uid())
  );
```

**Step 2: Apply to staging**
**Step 3: Verify**: `SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'health_%'` — all should show `true`
**Step 4: Commit**

```bash
git add supabase/setup/03_policies.sql
git commit -m "feat(health): add RLS policies for health tables — student-only access"
```

---

### Task 3: TypeScript Types

**Files:**
- Create: `types/health.ts`

**Step 1: Define all health module types**

```typescript
// types/health.ts
// TypeScript types for the Health Module

export interface HealthProfile {
  id: string;
  learner_id: string;
  institution_id: string | null;
  blood_group: string | null;
  allergies: string[];
  medical_conditions: string[];
  medications: string[];
  vaccination_status: Record<string, boolean>;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  bmi: number | null;
  bmi_category: string | null;
  profile_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface HealthDailyLog {
  id: string;
  learner_id: string;
  log_date: string;
  step_count: number;
  water_glasses: number;
  water_goal: number;
  mood: number | null; // 1-5 (😫😢😐😊😄)
  sleep_quality: number | null; // 1-5
  stress_level: number | null; // 1-5
  mood_note: string | null;
  step_goal: number;
  created_at: string;
  updated_at: string;
}

export interface HealthStreak {
  id: string;
  learner_id: string;
  streak_type: 'mood' | 'steps' | 'water';
  current_streak: number;
  longest_streak: number;
  last_logged_date: string | null;
  total_days_logged: number;
  created_at: string;
  updated_at: string;
}

export interface HealthDashboardData {
  profile: HealthProfile | null;
  todayLog: HealthDailyLog | null;
  streaks: HealthStreak[];
  weeklySteps: { date: string; steps: number }[];
  leaderboardRank: number | null;
  institutionName: string | null;
}

export type MoodEmoji = 1 | 2 | 3 | 4 | 5;
export const MOOD_LABELS: Record<MoodEmoji, string> = {
  1: 'Terrible',
  2: 'Bad',
  3: 'Okay',
  4: 'Good',
  5: 'Great',
};
export const MOOD_EMOJIS: Record<MoodEmoji, string> = {
  1: '😫', 2: '😢', 3: '😐', 4: '😊', 5: '😄',
};

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodGroup = typeof BLOOD_GROUPS[number];

export interface LeaderboardEntry {
  learner_id: string;
  learner_name: string;
  institution_name: string;
  total_steps: number;
  mood_streak: number;
  rank: number;
}
```

**Step 2: Commit**

```bash
git add types/health.ts
git commit -m "feat(health): add TypeScript types for health module"
```

---

### Task 4: Health Service Layer

**Files:**
- Create: `lib/services/health/health-service.ts`

**Step 1: Create the health service with CRUD + dashboard methods**

The service should have these static methods:
- `getOrCreateProfile(learnerId)` — upsert health profile
- `updateProfile(learnerId, data)` — update profile fields
- `getTodayLog(learnerId)` — get or create today's daily log
- `upsertDailyLog(learnerId, data)` — upsert mood/steps/water for today
- `getStreaks(learnerId)` — get all streaks for a learner
- `updateStreak(learnerId, streakType)` — increment streak if consecutive day
- `getWeeklySteps(learnerId)` — last 7 days of step data
- `getDashboardData(learnerId)` — composite: profile + today + streaks + weekly
- `getLeaderboard(institutionId, period)` — top N by steps this week

Pattern: Use `createClientSupabaseClient()` since this runs client-side.

**Step 2: Commit**

```bash
git add lib/services/health/health-service.ts
git commit -m "feat(health): add HealthService with CRUD + dashboard methods"
```

---

### Task 5: React Query Hooks

**Files:**
- Create: `hooks/health/use-health-dashboard.ts`
- Create: `hooks/health/use-health-profile.ts`
- Create: `hooks/health/use-health-daily-log.ts`
- Create: `hooks/health/use-health-leaderboard.ts`
- Create: `hooks/health/index.ts` (barrel export)

**Step 1: Create hooks using useQuery/useMutation pattern from marathon ops**

Key hooks:
- `useHealthDashboard(learnerId)` — `refetchInterval: 30_000` for live feel
- `useHealthProfile(learnerId)` — profile CRUD
- `useUpdateProfile()` — mutation with optimistic update
- `useMoodCheckin()` — mutation for daily mood/sleep/stress
- `useUpdateSteps()` — mutation for step count sync
- `useUpdateWater()` — mutation for water glass increment
- `useLeaderboard(institutionId)` — weekly leaderboard

**Step 2: Commit**

```bash
git add hooks/health/
git commit -m "feat(health): add React Query hooks for health module"
```

---

### Task 6: Student Dashboard Page (First Screen)

**Files:**
- Create: `app/(routes)/health/dashboard/page.tsx`

**Step 1: Build the mobile-first student dashboard**

Layout from spec section 9.1:
- Greeting header with time-of-day
- Step counter card with progress ring (% of daily goal)
- Water intake card with 8-glass visualization
- Mood streak card with "Check in now" CTA button
- Health profile summary card (blood group, BMI, last checkup)
- Institution leaderboard position
- Upcoming health camp card (Phase 3 placeholder)

Use `ContentLayout` wrapper. Mobile-first grid (1 col on mobile, 2 col on tablet).

**Step 2: Commit**

```bash
git add "app/(routes)/health/dashboard/page.tsx"
git commit -m "feat(health): add student health dashboard page"
```

---

### Task 7: Mood Check-In Component

**Files:**
- Create: `app/(routes)/health/dashboard/_components/mood-checkin.tsx`

**Step 1: Build the 3-tap mood check-in**

From spec section 4.1:
1. Row of 5 emoji buttons (😫😢😐😊😄) — tap one
2. Sleep quality slider (1-5 stars)
3. Stress level slider (1-5 blocks)
4. Optional text note
5. "Done ✓" button

On submit: calls `useMoodCheckin()` mutation → upserts today's `health_daily_logs` row → updates streak → shows success toast.

The whole interaction should take 5 seconds. No scrolling needed. Big tap targets for mobile.

**Step 2: Commit**

```bash
git add "app/(routes)/health/dashboard/_components/mood-checkin.tsx"
git commit -m "feat(health): add 3-tap mood check-in component"
```

---

### Task 8: Step Counter Integration

**Files:**
- Create: `lib/utils/pedometer.ts`
- Create: `app/(routes)/health/dashboard/_components/step-counter.tsx`

**Step 1: Create pedometer utility**

Use the Web Sensor API (`Accelerometer`) or the experimental `Pedometer` API. Fallback: manual entry.

```typescript
// lib/utils/pedometer.ts
export async function isPedometerSupported(): Promise<boolean> {
  // Check for Sensor API or navigator.permissions for 'accelerometer'
}

export async function requestPedometerPermission(): Promise<boolean> {
  // Request sensor permission
}

export function createStepCounter(onStep: (count: number) => void): {
  start: () => void;
  stop: () => void;
  getCount: () => number;
} {
  // Accelerometer-based step detection or manual fallback
}
```

**Gotcha:** Web Pedometer API has limited browser support. Must gracefully degrade to manual step entry input. Test on Android Chrome first (best support).

**Step 2: Build step counter card component**

Shows: current steps / goal, circular progress ring, "Sync Steps" button (for manual entry fallback).

**Step 3: Commit**

```bash
git add lib/utils/pedometer.ts "app/(routes)/health/dashboard/_components/step-counter.tsx"
git commit -m "feat(health): add pedometer utility + step counter component"
```

---

### Task 9: Water Intake Tracker

**Files:**
- Create: `app/(routes)/health/dashboard/_components/water-tracker.tsx`

**Step 1: Build 8-glass visual tracker**

8 glass icons in a row. Tap to fill/unfill. Each tap calls `useUpdateWater()` mutation. Animated fill effect. Shows "X/8 glasses" text.

Persist today's count in `health_daily_logs.water_glasses`. On component mount, load today's count from the dashboard hook.

**Step 2: Commit**

```bash
git add "app/(routes)/health/dashboard/_components/water-tracker.tsx"
git commit -m "feat(health): add water intake tracker component"
```

---

### Task 10: Health Profile Page

**Files:**
- Create: `app/(routes)/health/profile/page.tsx`

**Step 1: Build the health profile CRUD page**

Form fields (from spec section 12):
- Blood group (dropdown: A+, A-, B+, B-, AB+, AB-, O+, O-)
- Allergies (tag input — add/remove)
- Medical conditions (tag input)
- Current medications (tag input)
- Emergency contact: name, phone, relation (dropdown: Parent, Sibling, Spouse, Friend, Other)
- Height (cm) and Weight (kg) — auto-calculates BMI on change
- BMI display with category badge (Underweight/Normal/Overweight/Obese)
- Vaccination status (checklist: COVID-19, Hepatitis B, Tetanus, etc.)

Pre-populate blood_group from `learners_profiles.blood_group` or marathon `custom_data.blood_group` if available.

**Step 2: Commit**

```bash
git add "app/(routes)/health/profile/page.tsx"
git commit -m "feat(health): add health profile CRUD page"
```

---

### Task 11: Leaderboard Page

**Files:**
- Create: `app/(routes)/health/leaderboard/page.tsx`

**Step 1: Build the institution leaderboard**

Three tabs:
1. **Steps** — top 50 by weekly step count
2. **Mood Streak** — longest active mood check-in streaks
3. **Institution** — aggregate by institution (hostel breakdown)

Each entry: rank, name (first name + last initial), institution, stat value.
Current user highlighted. Shows "Your rank: #12 out of 847 active".

Filter by: This Week / This Month / All Time.
Filter by: All / My Institution / My Hostel.

**Step 2: Commit**

```bash
git add "app/(routes)/health/leaderboard/page.tsx"
git commit -m "feat(health): add gamification leaderboard page"
```

---

### Task 12: Sidebar Integration

**Files:**
- Modify: `lib/sidebarMenuLink.ts`

**Step 1: Add health module to sidebar**

Add a new menu group "Health" with items:
- Dashboard → `/health/dashboard` (icon: Heart)
- My Profile → `/health/profile` (icon: User)
- Leaderboard → `/health/leaderboard` (icon: Trophy)

Visible to all authenticated users (no permission restriction for Phase 1).

**Step 2: Commit**

```bash
git add lib/sidebarMenuLink.ts
git commit -m "feat(health): add Health module to sidebar navigation"
```

---

### Task 13: Custom Roles Setup

**Files:**
- Create: `supabase/migrations/20260412_health_custom_roles.sql`

**Step 1: Insert health-specific custom roles**

```sql
INSERT INTO custom_roles (role_key, role_name, permissions, is_system_role, created_by)
VALUES
  ('health_counselor', 'Health Counselor', '{"health.escalations.view": true, "health.student_data.view": true}', false, 'system'),
  ('health_screener', 'Health Screener', '{"health.screenings.create": true, "health.screenings.view": true}', false, 'system'),
  ('health_supervisor', 'Health Supervisor', '{"health.practicum.approve": true, "health.camps.manage": true, "health.analytics.view": true}', false, 'system')
ON CONFLICT (role_key) DO NOTHING;
```

**Step 2: Apply to staging + production**
**Step 3: Commit**

```bash
git add supabase/migrations/20260412_health_custom_roles.sql
git commit -m "feat(health): add custom roles — counselor, screener, supervisor"
```

---

### Task 14: Build Verification + Smoke Test

**Step 1: Run build**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeds with `/health/dashboard`, `/health/profile`, `/health/leaderboard` in the route list.

**Step 2: Verify database**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'health_%'
ORDER BY table_name;
-- Expected: health_daily_logs, health_profiles, health_streaks

SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'health_%';
-- Expected: all rows show rowsecurity = true

SELECT role_key FROM custom_roles WHERE role_key LIKE 'health_%';
-- Expected: health_counselor, health_screener, health_supervisor
```

**Step 3: Commit all remaining changes**

```bash
git add -A
git commit -m "feat(health): Phase 1 complete — health profiles, daily tracking, gamification"
```

---

## Phase 2: Mental Health + Escalation (10 tasks)

Dependencies: Phase 1 must be complete (tables, types, service patterns established)

### Task 15: Mental Health Tables

Add to `01_tables.sql`:
- `health_assessments` — PHQ-9/GAD-7 responses with auto-scored totals
- `health_escalations` — counselor alerts with status tracking (open/contacted/resolved)
- `health_peer_support` — anonymous forum posts with moderation status

### Task 16: Mental Health RLS Policies

Student sees own assessments only. Counselor sees escalated students only. No admin SELECT on individual PHQ-9 data. Aggregate functions for leadership.

### Task 17: Mental Health Types

Add to `types/health.ts`:
- `HealthAssessment` (type, questions, responses, score, severity)
- `HealthEscalation` (student_id, counselor_id, trigger_type, status, notes)
- `PeerSupportPost` (anonymous, moderated, category)
- PHQ-9/GAD-7 question constants and scoring functions

### Task 18: Assessment Service

Create `lib/services/health/health-assessment-service.ts`:
- `submitPHQ9(learnerId, responses)` — auto-score + auto-escalate if >15
- `submitGAD7(learnerId, responses)` — auto-score + auto-escalate if >10
- `getAssessmentHistory(learnerId)` — all past assessments
- `declineAssessment(learnerId, type)` — record voluntary decline

### Task 19: Escalation Service

Create `lib/services/health/health-escalation-service.ts`:
- `createEscalation(learnerId, trigger, score)` — create alert for counselor
- `getActiveEscalations(counselorId)` — counselor's active alerts
- `updateEscalationStatus(id, status, notes)` — contacted/resolved/false_positive
- `escalateToHOD(escalationId)` — 24h timeout escalation

### Task 20: Mood Check-In Page

Create `app/(routes)/health/mood/page.tsx`:
- Full-screen mood check-in experience (spec section 4.1)
- Links from dashboard "Check in now" button
- Shows streak after submission
- Weekly mood trend chart (last 7 days)

### Task 21: PHQ-9 Assessment Page

Create `app/(routes)/health/assessments/page.tsx`:
- 9-question form with 0-3 scale per question
- Progress bar (question 1 of 9)
- Auto-score on completion
- Result screen with severity explanation
- If score > 15: show counselor recommendation message
- "Decline" option always visible (voluntary)

### Task 22: GAD-7 Assessment Page

Same pattern as PHQ-9 but 7 questions with anxiety-specific scoring and thresholds.

### Task 23: Counselor Dashboard Page

Create `app/(routes)/health/counselor/page.tsx`:
- Access restricted to `health_counselor` role
- Active alerts list (spec section 9.3)
- Color-coded severity (red/yellow/green)
- Click-to-contact (tel: link to student phone)
- Resolution workflow (status update + notes)
- History view per student

### Task 24: Assessment Hooks + Build Verification

Create hooks for assessments, escalations, counselor data.
Run full build. Verify all Phase 2 pages compile.

---

## Phase 3: Clinical Integration (10 tasks)

Dependencies: Phase 1 + Phase 2

### Task 25: Clinical Tables

- `health_screenings` — BP, BMI, vision, dental findings, screener_id, supervisor_id
- `health_practicum_hours` — auto-credited from screenings, supervisor approval
- `health_camps` — scheduled health events with registration slots

### Task 26: Clinical RLS Policies

Screener can create records for any student. Student sees own records. Supervisor approves hours.

### Task 27: Clinical Types + Services

Types for screening records, practicum hours, camps.
Services with auto-credit logic: `onScreeningCreated → creditPracticumHours(screenerId, 0.5)`.

### Task 28: Screening Page (Screener View)

Create `app/(routes)/health/screenings/page.tsx`:
- Search student by name/roll/phone
- Record BP (systolic/diastolic), Height, Weight, Vision L/R
- Auto-calculate BMI
- Submit → auto-credit screener hours
- Validation: BP 60-250/40-150, Height 100-220, Weight 20-200

### Task 29: Camp Management Page

Create `app/(routes)/health/camps/page.tsx`:
- Create health camp (date, type, target institution, capacity)
- Student registration for time slots
- Day-of: attendance tracking (scan/search)
- Post-camp: summary report

### Task 30: Practicum Hours Page

Create `app/(routes)/health/practicum/page.tsx`:
- Health student sees their auto-credited hours
- Breakdown by screening type
- Supervisor approval queue
- Export to academic module (future integration point)

### Task 31-34: Hooks, Sidebar Updates, RLS Verification, Build Check

Standard pattern: create hooks, add to sidebar, verify RLS, run build.

---

## Phase 4: Analytics + Accreditation (8 tasks)

Dependencies: Phase 1 + 2 + 3 (needs data from all phases)

### Task 35: Analytics Tables

- `health_analytics_snapshots` — periodic aggregate snapshots for trend analysis

### Task 36: Admin Health Dashboard

Create `app/(routes)/health/analytics/page.tsx`:
- Spec section 9.2: 4 stat cards, institution wellness scores, stress trend chart
- PHQ-9 distribution pie chart
- Filters: institution, time period, demographic
- Anonymized data only — no individual student identifiers

### Task 37: Attendance-Health Correlation

API endpoint that joins `student_attendance` with `health_daily_logs` to detect patterns (low mood + low attendance → alert).

### Task 38: NAAC Wellness Report Generator

Create `app/(routes)/health/reports/page.tsx`:
- Auto-generate PDF/DOCX wellness report from health module data
- Maps to NAAC criterion 7.1 (Institutional Values)
- Includes: participation rates, screening coverage, mental health program stats
- SDG 3 (Good Health) mapping section

### Task 39-42: RPC Functions for Aggregates, Leaderboard Optimization, Final RLS Audit, Full Build + Ship

Standard finalization tasks: database functions for efficient aggregation, index optimization, comprehensive RLS audit, production build verification.

---

## Dependency Graph

```
Phase 1 (Tasks 1-14)
  ├── Task 1: Tables (FIRST — everything depends on this)
  ├── Task 2: RLS (depends on Task 1)
  ├── Task 3: Types (depends on Task 1)
  ├── Task 4: Service (depends on Tasks 1, 3)
  ├── Task 5: Hooks (depends on Task 4)
  ├── Tasks 6-11: Pages (depend on Task 5, can run IN PARALLEL)
  ├── Task 12: Sidebar (after at least 1 page exists)
  ├── Task 13: Custom Roles (independent, can run anytime)
  └── Task 14: Build verify (LAST in Phase 1)

Phase 2 (Tasks 15-24) → depends on Phase 1
Phase 3 (Tasks 25-34) → depends on Phase 1 + 2
Phase 4 (Tasks 35-42) → depends on Phase 1 + 2 + 3
```

## Gotchas & Risks

| Risk | Mitigation |
|------|-----------|
| Web Pedometer API not supported on student phones | Build manual step entry as equal-status alternative, not "fallback" |
| RLS on health_daily_logs needs learner_id = auth.uid() but learners use profile_id | Join through `profiles.id = auth.uid()` → `learners_profiles` to get learner_id |
| PHQ-9/GAD-7 are validated instruments — don't modify questions | Store exact standard questions as constants, not user-editable |
| BMI as generated column — can't INSERT/UPDATE directly | Only update height_cm and weight_kg, BMI auto-calculates |
| Gamification leaderboard with 4,785 learners — performance | Use materialized view or periodic snapshot, not real-time aggregate query |
| Mental health data GDPR/DPDP compliance | RLS ensures individual data isolation. No admin can query individual mood data. Aggregates only via RPC functions. |

---

## Execution Recommendation

**Parallel execution possible for Phase 1 Tasks 6-11** (pages). They all depend on Tasks 1-5 (foundation) but don't depend on each other. A swarm of 6 agents can build all 6 pages simultaneously.

**Sequential for Phase 2** (mental health requires careful escalation logic testing).

**Parallel for Phase 3** (screening, camps, practicum are independent features).

**Sequential for Phase 4** (analytics depends on all data being present).

---

*Plan produced by writing-plans skill. Spec: `docs/SPEC-health-module.md`. Ready for human gate approval.*
