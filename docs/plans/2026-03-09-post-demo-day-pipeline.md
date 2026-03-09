# Post-Demo Day Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the three new post-Demo Day features (Track Declaration, Progression Levels, Case Studies) that route teams from Demo Day into Solve for 100 / JICATE / Solve for Industry tracks.

**Architecture:** Three new database tables (`track_declarations`, `progression_levels`, `case_studies`) follow the existing naming convention (no `ss_` prefix). Each feature gets a service → hooks → page following the established pattern of the startup-studio module. The spec's SQL uses wrong table names — this plan uses the correct real table names throughout.

**Tech Stack:** Next.js 15 App Router, Supabase (RLS), React Query, TypeScript/Zod, shadcn/ui, Tailwind CSS

---

## ⚠️ CRITICAL: Table Name Mapping

The spec document uses `ss_*` prefixed names. **Real table names are:**

| Spec Name | Real Table Name |
|-----------|----------------|
| `ss_teams` | `event_registrations` |
| `ss_team_members` | `event_team_members` |
| `ss_events` | `startup_events` |
| `ss_appathon_submissions` | `event_submissions` |
| `ss_appathon_verifications` | `appathon_verifications` |
| `ss_role_cards` | `appathon_role_cards` |
| `is_anchor` (spec) | `is_leader` (real column in `event_team_members`) |
| `results_published` (spec) | `is_results_published` (real column in `startup_events`) |

---

## Implementation Order

```
Task 1  → DB: 3 new tables + RLS + indexes (all in supabase/setup/ files)
Task 2  → Types: Add TS interfaces to types/startup-studio.ts
Task 3  → Constants: tracks.ts + progression.ts
Task 4  → Track Declaration service
Task 5  → Track Declaration hooks
Task 6  → Track Declaration page (team leader view)
Task 7  → Track Declaration admin tab (in analytics dashboard)
Task 8  → Case Study service
Task 9  → Case Study hooks
Task 10 → Case Study page (conditional on track)
Task 11 → Progression service (auto-assign + queries)
Task 12 → Progression hooks
Task 13 → Progression Level widget component
Task 14 → Auto-assign Level 1 button (on demo-day page)
Task 15 → Sidebar menu updates
```

---

### Task 1: Database — 3 New Tables, RLS, Indexes

**Files:**
- Modify: `supabase/setup/01_tables.sql` — append 3 new table definitions
- Modify: `supabase/setup/03_policies.sql` — append RLS policies for 3 new tables
- Modify: `supabase/setup/04_triggers.sql` — append updated_at trigger for track_declarations

**Step 1: Open `supabase/setup/01_tables.sql` and scroll to the end. Append this block:**

```sql
-- ============================================================
-- POST DEMO DAY PIPELINE TABLES
-- Added: 2026-03-09 — Spec: Spec-Post-Demo-Day-Pipeline.md
-- ============================================================

-- Track Declarations: Teams declare which path they want after Demo Day
-- Gap 3 from Post-Demo Day Pipeline spec
CREATE TABLE IF NOT EXISTS track_declarations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
  track TEXT NOT NULL,
  reason TEXT,  -- Optional max 300 chars, enforced at app layer
  declared_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  declared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  mentor_approved BOOLEAN DEFAULT NULL,
  mentor_notes TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (event_id, team_id),
  CHECK (track IN ('solve_for_100', 'jicate_solutions', 'solve_for_industry', 'completed'))
);

CREATE INDEX IF NOT EXISTS idx_track_declarations_event ON track_declarations(event_id);
CREATE INDEX IF NOT EXISTS idx_track_declarations_team ON track_declarations(team_id);
CREATE INDEX IF NOT EXISTS idx_track_declarations_track ON track_declarations(track);
CREATE INDEX IF NOT EXISTS idx_track_declarations_declared_by ON track_declarations(declared_by);

-- Progression Levels: Individual learner progression across the 5-stage identity ladder
-- Gap 4 from Post-Demo Day Pipeline spec
CREATE TABLE IF NOT EXISTS progression_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
  team_id UUID REFERENCES event_registrations(id) ON DELETE SET NULL,
  level INTEGER NOT NULL,
  level_name TEXT NOT NULL,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  awarded_by TEXT NOT NULL DEFAULT 'system',  -- 'system' or mentor profile_id
  UNIQUE (profile_id, event_id, level),
  CHECK (level BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_progression_levels_profile ON progression_levels(profile_id);
CREATE INDEX IF NOT EXISTS idx_progression_levels_event ON progression_levels(event_id);
CREATE INDEX IF NOT EXISTS idx_progression_levels_team ON progression_levels(team_id);
CREATE INDEX IF NOT EXISTS idx_progression_levels_level ON progression_levels(level);

-- Case Studies: Structured narratives for solve_for_industry and jicate_solutions tracks
-- Gap 5 from Post-Demo Day Pipeline spec
CREATE TABLE IF NOT EXISTS case_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
  track TEXT NOT NULL,
  problem TEXT NOT NULL,      -- Max 200 chars, enforced at app layer
  solution TEXT NOT NULL,     -- Max 200 chars, enforced at app layer
  proof TEXT NOT NULL,        -- Max 200 chars, enforced at app layer
  who_else TEXT,              -- Max 200 chars, only for solve_for_industry
  demo_url TEXT,
  app_name TEXT,              -- Denormalized from event_submissions
  app_url TEXT,               -- Denormalized from event_submissions
  score INTEGER,              -- Denormalized from appathon_verifications
  featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, team_id),
  CHECK (track IN ('solve_for_industry', 'jicate_solutions'))
);

CREATE INDEX IF NOT EXISTS idx_case_studies_event ON case_studies(event_id);
CREATE INDEX IF NOT EXISTS idx_case_studies_team ON case_studies(team_id);
CREATE INDEX IF NOT EXISTS idx_case_studies_track ON case_studies(track);
CREATE INDEX IF NOT EXISTS idx_case_studies_featured ON case_studies(featured);
```

**Step 2: Open `supabase/setup/03_policies.sql` and append this block:**

```sql
-- ============================================================
-- RLS: POST DEMO DAY PIPELINE TABLES
-- Added: 2026-03-09
-- ============================================================

ALTER TABLE track_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE progression_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_studies ENABLE ROW LEVEL SECURITY;

-- ---- track_declarations policies ----

-- SELECT: Own team members can see their declaration
CREATE POLICY "track_declarations_select_own_team"
  ON track_declarations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM event_team_members etm
      WHERE etm.registration_id = track_declarations.team_id
        AND etm.profile_id = auth.uid()
        AND etm.status = 'accepted'
    )
    OR
    EXISTS (
      SELECT 1 FROM event_registrations er
      WHERE er.id = track_declarations.team_id
        AND er.owner_id = auth.uid()
    )
  );

-- SELECT: Admin/mentor can see all rows
CREATE POLICY "track_declarations_select_admin"
  ON track_declarations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'faculty', 'hod', 'principal')
    )
  );

-- INSERT: Only team leader (owner of event_registrations) can declare
CREATE POLICY "track_declarations_insert_leader"
  ON track_declarations FOR INSERT
  WITH CHECK (
    declared_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM event_registrations er
      WHERE er.id = team_id
        AND er.owner_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM startup_events se
      WHERE se.id = event_id
        AND se.is_results_published = true
    )
  );

-- UPDATE: Team leader can change within 7-day window
CREATE POLICY "track_declarations_update_leader"
  ON track_declarations FOR UPDATE
  USING (
    declared_by = auth.uid()
    AND declared_at > NOW() - INTERVAL '7 days'
  )
  WITH CHECK (
    declared_by = auth.uid()
  );

-- UPDATE: Admin/mentor can update mentor_approved, mentor_notes, approved_by, approved_at
CREATE POLICY "track_declarations_update_admin"
  ON track_declarations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'faculty', 'hod', 'principal')
    )
  );

-- ---- progression_levels policies ----

-- SELECT: Learner can see own progression
CREATE POLICY "progression_levels_select_own"
  ON progression_levels FOR SELECT
  USING (profile_id = auth.uid());

-- SELECT: Admin/mentor can see all
CREATE POLICY "progression_levels_select_admin"
  ON progression_levels FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'faculty', 'hod', 'principal')
    )
  );

-- INSERT: Admin/super_admin only (system uses service role key via server actions)
CREATE POLICY "progression_levels_insert_admin"
  ON progression_levels FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- UPDATE: Admin/super_admin only
CREATE POLICY "progression_levels_update_admin"
  ON progression_levels FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- ---- case_studies policies ----

-- SELECT: Own team can see their case study
CREATE POLICY "case_studies_select_own_team"
  ON case_studies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM event_team_members etm
      WHERE etm.registration_id = case_studies.team_id
        AND etm.profile_id = auth.uid()
        AND etm.status = 'accepted'
    )
    OR
    EXISTS (
      SELECT 1 FROM event_registrations er
      WHERE er.id = case_studies.team_id
        AND er.owner_id = auth.uid()
    )
  );

-- SELECT: All authenticated users can see case studies when results published
CREATE POLICY "case_studies_select_public_after_publish"
  ON case_studies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM startup_events se
      WHERE se.id = case_studies.event_id
        AND se.is_results_published = true
    )
    AND auth.role() = 'authenticated'
  );

-- SELECT: Admin can see all
CREATE POLICY "case_studies_select_admin"
  ON case_studies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'faculty', 'hod', 'principal')
    )
  );

-- INSERT: Any team member (accepted) can create the case study
CREATE POLICY "case_studies_insert_team_member"
  ON case_studies FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_team_members etm
      WHERE etm.registration_id = team_id
        AND etm.profile_id = auth.uid()
        AND etm.status = 'accepted'
    )
    OR
    EXISTS (
      SELECT 1 FROM event_registrations er
      WHERE er.id = team_id
        AND er.owner_id = auth.uid()
    )
  );

-- UPDATE: Team members can edit content fields
CREATE POLICY "case_studies_update_team_member"
  ON case_studies FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM event_team_members etm
      WHERE etm.registration_id = case_studies.team_id
        AND etm.profile_id = auth.uid()
        AND etm.status = 'accepted'
    )
    OR
    EXISTS (
      SELECT 1 FROM event_registrations er
      WHERE er.id = case_studies.team_id
        AND er.owner_id = auth.uid()
    )
  );

-- UPDATE: Admin can update featured and score
CREATE POLICY "case_studies_update_admin"
  ON case_studies FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );
```

**Step 3: Open `supabase/setup/04_triggers.sql` and append:**

```sql
-- updated_at triggers for new post-demo-day tables
-- Added: 2026-03-09

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_case_studies_updated_at
  BEFORE UPDATE ON case_studies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Step 4: Apply to Supabase**

Using the Supabase MCP tool, run each SQL block to apply the schema. Or run from the Supabase Dashboard SQL editor. Verify with:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('track_declarations', 'progression_levels', 'case_studies');
-- Expected: 3 rows returned
```

**Step 5: Update `supabase/SQL_FILE_INDEX.md`** — Add entries:
```
track_declarations    | 01_tables.sql    | Team track path declaration after Demo Day
progression_levels    | 01_tables.sql    | Individual 5-stage progression tracking
case_studies          | 01_tables.sql    | Narrative case studies for industry/JICATE tracks
```

**Step 6: Commit**
```bash
git add supabase/setup/01_tables.sql supabase/setup/03_policies.sql supabase/setup/04_triggers.sql supabase/SQL_FILE_INDEX.md
git commit -m "feat(db): add track_declarations, progression_levels, case_studies tables with RLS"
```

---

### Task 2: TypeScript Types

**Files:**
- Modify: `types/startup-studio.ts` — append new interfaces

**Step 1: Open `types/startup-studio.ts`. Scroll to the end. Append:**

```typescript
// ============================================================
// POST DEMO DAY PIPELINE TYPES
// Added: 2026-03-09 — Spec: Spec-Post-Demo-Day-Pipeline.md
// ============================================================

export type TrackId = 'solve_for_100' | 'jicate_solutions' | 'solve_for_industry' | 'completed'

export interface TrackDeclaration {
  id: string
  event_id: string
  team_id: string
  track: TrackId
  reason: string | null
  declared_by: string
  declared_at: string
  mentor_approved: boolean | null
  mentor_notes: string | null
  approved_at: string | null
  approved_by: string | null
}

export interface TrackDeclarationWithTeam extends TrackDeclaration {
  team_name: string
  institution_name: string
}

export type ProgressionLevelNumber = 1 | 2 | 3 | 4 | 5

export interface ProgressionLevel {
  id: string
  profile_id: string
  event_id: string
  team_id: string | null
  level: ProgressionLevelNumber
  level_name: string
  achieved_at: string
  evidence: Record<string, unknown>
  awarded_by: string  // 'system' or mentor profile_id
}

export interface CaseStudy {
  id: string
  event_id: string
  team_id: string
  track: 'solve_for_industry' | 'jicate_solutions'
  problem: string
  solution: string
  proof: string
  who_else: string | null
  demo_url: string | null
  app_name: string | null
  app_url: string | null
  score: number | null
  featured: boolean
  created_at: string
  updated_at: string
}

// DTOs

export interface DeclareTrackDto {
  event_id: string
  team_id: string
  track: TrackId
  reason?: string
}

export interface UpdateTrackDeclarationDto {
  track: TrackId
  reason?: string
}

export interface MentorApproveTrackDto {
  mentor_approved: boolean
  mentor_notes?: string
}

export interface CreateCaseStudyDto {
  event_id: string
  team_id: string
  track: 'solve_for_industry' | 'jicate_solutions'
  problem: string
  solution: string
  proof: string
  who_else?: string
  demo_url?: string
  app_name?: string
  app_url?: string
  score?: number
}

export interface UpdateCaseStudyDto {
  problem?: string
  solution?: string
  proof?: string
  who_else?: string
  demo_url?: string
}

// Track summary for admin dashboard
export interface TrackDeclarationSummary {
  track: TrackId
  count: number
  percentage: number
}
```

**Step 2: Commit**
```bash
git add types/startup-studio.ts
git commit -m "feat(types): add TrackDeclaration, ProgressionLevel, CaseStudy types"
```

---

### Task 3: Constants — Tracks and Progression Levels

**Files:**
- Create: `lib/constants/startup-studio/tracks.ts`
- Create: `lib/constants/startup-studio/progression.ts`

**Step 1: Create `lib/constants/startup-studio/tracks.ts`:**

```typescript
import type { TrackId } from '@/types/startup-studio'

export const TRACKS = [
  {
    id: 'solve_for_100' as TrackId,
    label: 'Solve for 100',
    sublabel: 'Startup Track',
    description: 'Grow this app into a business serving 100 paying users over the next 10 months.',
    icon: 'Rocket',
    color: 'green' as const,
    benefits: [
      '₹1,00,000 NIF Startup Credits',
      'Dedicated mentor',
      '100% internal assessment marks',
      'Exclusive industry visits',
    ],
    eligibility: 'Any team. Top 5 per college get automatic entry. Others apply with a 30-day plan.',
    requiresCaseStudy: false,
  },
  {
    id: 'jicate_solutions' as TrackId,
    label: 'JICATE Solutions',
    sublabel: 'Campus Track',
    description: 'Your solution is useful for JKKN or other institutions. JICATE will partner with you to develop and deploy it.',
    icon: 'Building2',
    color: 'blue' as const,
    benefits: [
      'JICATE development support',
      'Solution deployed across JKKN campuses',
      '60/40 revenue share if sold to other institutions',
      'Portfolio credit for placements',
    ],
    eligibility: 'Any team whose solution addresses a campus or institutional problem.',
    requiresCaseStudy: true,
  },
  {
    id: 'solve_for_industry' as TrackId,
    label: 'Solve for Industry',
    sublabel: 'Industry Track',
    description: "Your solution solves a problem that businesses outside JKKN would pay for. We'll package it as a case study and find industry partners.",
    icon: 'Briefcase',
    color: 'purple' as const,
    benefits: [
      'Solution packaged as industry case study',
      'JICATE connects you with industry partners',
      'Revenue share on industry contracts',
      'Real-world portfolio for placements',
    ],
    eligibility: 'Any team whose solution has applicability outside education or campus.',
    requiresCaseStudy: true,
  },
  {
    id: 'completed' as TrackId,
    label: 'Completed',
    sublabel: 'Exit',
    description: "You're done with the Appathon. You'll receive your participation certificate.",
    icon: 'CheckCircle',
    color: 'gray' as const,
    benefits: [
      'Digital participation certificate via MyJKKN',
      'Appathon experience on your profile',
    ],
    eligibility: 'Everyone.',
    requiresCaseStudy: false,
  },
] as const

export type TrackConfig = (typeof TRACKS)[number]

export function getTrack(id: TrackId): TrackConfig | undefined {
  return TRACKS.find(t => t.id === id)
}

export function trackRequiresCaseStudy(id: TrackId): boolean {
  return TRACKS.find(t => t.id === id)?.requiresCaseStudy ?? false
}
```

**Step 2: Create `lib/constants/startup-studio/progression.ts`:**

```typescript
import type { ProgressionLevelNumber } from '@/types/startup-studio'

export const PROGRESSION_LEVELS = [
  {
    level: 1 as ProgressionLevelNumber,
    name: 'App Builder',
    test: 'Working app deployed and presented at Demo Day',
    auto_criteria: { app_live: true, presented: true },
    stage: 'Appathon',
    identity: 'I can find a problem and direct AI to build a solution.',
    color: 'blue' as const,
  },
  {
    level: 2 as ProgressionLevelNumber,
    name: 'Traction Builder',
    test: '25+ active users, at least 5 organic (not teammates or friends)',
    auto_criteria: { verified_active_users: 25 },
    stage: 'Solve for 100 — Traction Sprint (Weeks 1-4)',
    identity: 'Real people outside my circle use this and come back.',
    color: 'green' as const,
  },
  {
    level: 3 as ProgressionLevelNumber,
    name: 'Solution Architect',
    test: '100 active users and at least one automated workflow',
    auto_criteria: { verified_active_users: 100, has_automation: true },
    stage: 'Solve for 100 — Scale Phase (Months 2-5)',
    identity: 'I designed systems so it works without me doing each task.',
    color: 'yellow' as const,
  },
  {
    level: 4 as ProgressionLevelNumber,
    name: 'AI Orchestrator',
    test: 'Positive unit economics — revenue covers costs, growth engine running',
    auto_criteria: { positive_unit_economics: true },
    stage: 'Solve for 100 — Business Phase (Months 6-10)',
    identity: 'Revenue covers costs, growth engine runs without me.',
    color: 'orange' as const,
  },
  {
    level: 5 as ProgressionLevelNumber,
    name: 'AI Principal',
    test: 'Multiple ventures OR institutional impact beyond single product',
    auto_criteria: null, // Mentor-awarded only
    stage: 'NIF Incubation / Beyond',
    identity: 'I decide what value should exist and make it happen.',
    color: 'purple' as const,
  },
] as const

export type ProgressionLevelConfig = (typeof PROGRESSION_LEVELS)[number]

export function getProgressionLevel(level: ProgressionLevelNumber): ProgressionLevelConfig | undefined {
  return PROGRESSION_LEVELS.find(p => p.level === level)
}
```

**Step 3: Commit**
```bash
git add lib/constants/startup-studio/tracks.ts lib/constants/startup-studio/progression.ts
git commit -m "feat(constants): add TRACKS and PROGRESSION_LEVELS constants"
```

---

### Task 4: Track Declaration Service

**Files:**
- Create: `lib/services/startup-studio/track-declaration-service.ts`

**Step 1: Create the service file:**

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client'
import type {
  TrackDeclaration,
  TrackDeclarationWithTeam,
  DeclareTrackDto,
  UpdateTrackDeclarationDto,
  MentorApproveTrackDto,
  TrackDeclarationSummary,
} from '@/types/startup-studio'

export class TrackDeclarationService {
  // Get declaration for the current user's team in this event
  static async getMyDeclaration(
    eventId: string,
    registrationId: string
  ): Promise<TrackDeclaration | null> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await supabase
      .from('track_declarations')
      .select('*')
      .eq('event_id', eventId)
      .eq('team_id', registrationId)
      .maybeSingle()
    if (error) throw error
    return data
  }

  // Team leader declares a track
  static async declareTrack(dto: DeclareTrackDto, profileId: string): Promise<TrackDeclaration> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await supabase
      .from('track_declarations')
      .insert({
        event_id: dto.event_id,
        team_id: dto.team_id,
        track: dto.track,
        reason: dto.reason ?? null,
        declared_by: profileId,
      })
      .select('*')
      .single()
    if (error) throw error
    return data
  }

  // Team leader updates their declaration within 7-day window
  static async updateDeclaration(
    declarationId: string,
    dto: UpdateTrackDeclarationDto
  ): Promise<TrackDeclaration> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await supabase
      .from('track_declarations')
      .update({ track: dto.track, reason: dto.reason ?? null })
      .eq('id', declarationId)
      .select('*')
      .single()
    if (error) throw error
    return data
  }

  // Admin/mentor approves or rejects a declaration
  static async mentorApprove(
    declarationId: string,
    dto: MentorApproveTrackDto,
    mentorProfileId: string
  ): Promise<TrackDeclaration> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await supabase
      .from('track_declarations')
      .update({
        mentor_approved: dto.mentor_approved,
        mentor_notes: dto.mentor_notes ?? null,
        approved_at: new Date().toISOString(),
        approved_by: mentorProfileId,
      })
      .eq('id', declarationId)
      .select('*')
      .single()
    if (error) throw error
    return data
  }

  // Admin: get all declarations for an event with team info
  static async getEventDeclarations(eventId: string): Promise<TrackDeclarationWithTeam[]> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await supabase
      .from('track_declarations')
      .select(`
        *,
        event_registrations!team_id (
          team_name,
          institutions!institution_id ( name )
        )
      `)
      .eq('event_id', eventId)
      .order('declared_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(row => ({
      ...row,
      team_name: (row as any).event_registrations?.team_name ?? '',
      institution_name: (row as any).event_registrations?.institutions?.name ?? '',
    }))
  }

  // Admin: summary counts per track for an event
  static async getDeclarationSummary(eventId: string): Promise<TrackDeclarationSummary[]> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await supabase
      .from('track_declarations')
      .select('track')
      .eq('event_id', eventId)
    if (error) throw error

    const totals = (data ?? []).reduce<Record<string, number>>((acc, row) => {
      acc[row.track] = (acc[row.track] ?? 0) + 1
      return acc
    }, {})
    const total = Object.values(totals).reduce((s, c) => s + c, 0)

    return Object.entries(totals).map(([track, count]) => ({
      track: track as any,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
  }
}
```

**Step 2: Commit**
```bash
git add lib/services/startup-studio/track-declaration-service.ts
git commit -m "feat(service): add TrackDeclarationService"
```

---

### Task 5: Track Declaration Hooks

**Files:**
- Create: `hooks/startup-studio/use-track-declarations.ts`

**Step 1: Create the hooks file:**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { TrackDeclarationService } from '@/lib/services/startup-studio/track-declaration-service'
import { useAuth } from '@/hooks/use-auth'
import type { DeclareTrackDto, UpdateTrackDeclarationDto, MentorApproveTrackDto } from '@/types/startup-studio'

export function useMyDeclaration(eventId: string, registrationId: string | null | undefined) {
  return useQuery({
    queryKey: ['track-declaration', eventId, registrationId],
    queryFn: () => TrackDeclarationService.getMyDeclaration(eventId, registrationId!),
    enabled: !!eventId && !!registrationId,
  })
}

export function useEventDeclarations(eventId: string) {
  return useQuery({
    queryKey: ['event-track-declarations', eventId],
    queryFn: () => TrackDeclarationService.getEventDeclarations(eventId),
    enabled: !!eventId,
  })
}

export function useDeclarationSummary(eventId: string) {
  return useQuery({
    queryKey: ['track-declaration-summary', eventId],
    queryFn: () => TrackDeclarationService.getDeclarationSummary(eventId),
    enabled: !!eventId,
  })
}

export function useDeclareTrack(eventId: string, registrationId: string) {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: (dto: DeclareTrackDto) =>
      TrackDeclarationService.declareTrack(dto, profile!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['track-declaration', eventId, registrationId] })
      queryClient.invalidateQueries({ queryKey: ['event-track-declarations', eventId] })
      queryClient.invalidateQueries({ queryKey: ['track-declaration-summary', eventId] })
    },
    onError: (error: Error) => {
      toast.error('Failed to submit declaration', { description: error.message })
    },
  })
}

export function useUpdateTrackDeclaration(eventId: string, registrationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateTrackDeclarationDto }) =>
      TrackDeclarationService.updateDeclaration(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['track-declaration', eventId, registrationId] })
      queryClient.invalidateQueries({ queryKey: ['event-track-declarations', eventId] })
      queryClient.invalidateQueries({ queryKey: ['track-declaration-summary', eventId] })
    },
    onError: (error: Error) => {
      toast.error('Failed to update declaration', { description: error.message })
    },
  })
}

export function useMentorApproveDeclaration(eventId: string) {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: MentorApproveTrackDto }) =>
      TrackDeclarationService.mentorApprove(id, dto, profile!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-track-declarations', eventId] })
      queryClient.invalidateQueries({ queryKey: ['track-declaration-summary', eventId] })
    },
    onError: (error: Error) => {
      toast.error('Failed to update approval', { description: error.message })
    },
  })
}
```

**Step 2: Commit**
```bash
git add hooks/startup-studio/use-track-declarations.ts
git commit -m "feat(hooks): add useMyDeclaration, useDeclareTrack, useEventDeclarations hooks"
```

---

### Task 6: Track Declaration Page (Team Leader View)

**Files:**
- Create: `app/(routes)/startup-studio/events/[id]/declare/page.tsx`
- Create: `app/(routes)/startup-studio/events/[id]/declare/_components/track-card.tsx`
- Create: `app/(routes)/startup-studio/events/[id]/declare/_components/declaration-form.tsx`

**Step 1: Create `track-card.tsx`:**

```tsx
'use client'

import { Rocket, Building2, Briefcase, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TRACKS } from '@/lib/constants/startup-studio/tracks'
import type { TrackId } from '@/types/startup-studio'

const ICON_MAP = { Rocket, Building2, Briefcase, CheckCircle }
const COLOR_MAP = {
  green: 'border-green-500 bg-green-50 dark:bg-green-950',
  blue: 'border-blue-500 bg-blue-50 dark:bg-blue-950',
  purple: 'border-purple-500 bg-purple-50 dark:bg-purple-950',
  gray: 'border-gray-400 bg-gray-50 dark:bg-gray-900',
}
const SELECTED_RING = {
  green: 'ring-2 ring-green-500',
  blue: 'ring-2 ring-blue-500',
  purple: 'ring-2 ring-purple-500',
  gray: 'ring-2 ring-gray-400',
}

interface TrackCardProps {
  trackId: TrackId
  selected: boolean
  onSelect: (id: TrackId) => void
  disabled?: boolean
}

export function TrackCard({ trackId, selected, onSelect, disabled }: TrackCardProps) {
  const track = TRACKS.find(t => t.id === trackId)!
  const Icon = ICON_MAP[track.icon as keyof typeof ICON_MAP]

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(trackId)}
      className={cn(
        'w-full text-left rounded-xl border-2 p-4 transition-all',
        COLOR_MAP[track.color],
        selected && SELECTED_RING[track.color],
        disabled && 'opacity-50 cursor-not-allowed',
        !disabled && 'hover:shadow-md cursor-pointer'
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{track.label}</p>
          <p className="text-xs text-muted-foreground mb-2">{track.sublabel}</p>
          <p className="text-sm text-foreground/80">{track.description}</p>
          <ul className="mt-2 space-y-1">
            {track.benefits.map(b => (
              <li key={b} className="text-xs text-muted-foreground flex gap-1">
                <span>•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </button>
  )
}
```

**Step 2: Create `declaration-form.tsx`:**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { TrackCard } from './track-card'
import { TRACKS } from '@/lib/constants/startup-studio/tracks'
import { useDeclareTrack, useUpdateTrackDeclaration } from '@/hooks/startup-studio/use-track-declarations'
import type { TrackId, TrackDeclaration } from '@/types/startup-studio'

interface DeclarationFormProps {
  eventId: string
  registrationId: string
  teamName: string
  appathonScore: number
  existing: TrackDeclaration | null
}

export function DeclarationForm({
  eventId,
  registrationId,
  teamName,
  appathonScore,
  existing,
}: DeclarationFormProps) {
  const DRAFT_KEY = `track_declaration_draft_${eventId}_${registrationId}`

  const [selectedTrack, setSelectedTrack] = useState<TrackId | null>(
    existing?.track ?? null
  )
  const [reason, setReason] = useState(existing?.reason ?? '')

  // Restore draft from localStorage if no existing declaration
  useEffect(() => {
    if (!existing) {
      const draft = localStorage.getItem(DRAFT_KEY)
      if (draft) {
        try {
          const parsed = JSON.parse(draft)
          setSelectedTrack(parsed.track ?? null)
          setReason(parsed.reason ?? '')
        } catch {}
      }
    }
  }, [existing, DRAFT_KEY])

  // Auto-save draft
  useEffect(() => {
    if (!existing && selectedTrack) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ track: selectedTrack, reason }))
    }
  }, [selectedTrack, reason, existing, DRAFT_KEY])

  const declare = useDeclareTrack(eventId, registrationId)
  const update = useUpdateTrackDeclaration(eventId, registrationId)

  const isWithin7Days = existing
    ? new Date(existing.declared_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
    : true

  const canSubmit = !!selectedTrack
  const isPending = declare.isPending || update.isPending

  async function handleSubmit() {
    if (!selectedTrack) return

    if (existing && isWithin7Days) {
      await update.mutateAsync({
        id: existing.id,
        dto: { track: selectedTrack, reason: reason || undefined },
      })
      toast.success(`Track updated to ${TRACKS.find(t => t.id === selectedTrack)?.label}!`)
    } else if (!existing) {
      await declare.mutateAsync({
        event_id: eventId,
        team_id: registrationId,
        track: selectedTrack,
        reason: reason || undefined,
      })
      toast.success(`Welcome to ${TRACKS.find(t => t.id === selectedTrack)?.label}!`)
      localStorage.removeItem(DRAFT_KEY)
    }
  }

  const isLocked = !!existing && !isWithin7Days

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground mb-1">Team: {teamName}</p>
        <p className="text-sm text-muted-foreground">Appathon Score: {appathonScore} pts</p>
      </div>

      {isLocked && (
        <Alert>
          <AlertDescription>
            Declaration window closed. Your track is set to{' '}
            <strong>{TRACKS.find(t => t.id === existing?.track)?.label}</strong>.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {TRACKS.map(track => (
          <TrackCard
            key={track.id}
            trackId={track.id}
            selected={selectedTrack === track.id}
            onSelect={setSelectedTrack}
            disabled={isLocked || isPending}
          />
        ))}
      </div>

      {!isLocked && (
        <>
          <div className="space-y-2">
            <Label htmlFor="reason">
              Why did you choose this track?{' '}
              <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Textarea
              id="reason"
              placeholder="In 1-2 sentences, why is this the right path for your team?"
              value={reason}
              onChange={e => setReason(e.target.value.slice(0, 300))}
              maxLength={300}
              rows={3}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground text-right">{reason.length}/300</p>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isPending}
            className="w-full"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isPending
              ? 'Submitting...'
              : existing
              ? 'Update Track Choice'
              : 'Submit Declaration'}
          </Button>
        </>
      )}
    </div>
  )
}
```

**Step 3: Create `app/(routes)/startup-studio/events/[id]/declare/page.tsx`:**

```tsx
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { DeclarePage } from './_components/declare-page-client'

interface Props {
  params: { id: string }
}

export default async function TrackDeclarationPage({ params }: Props) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: event } = await supabase
    .from('startup_events')
    .select('id, name, is_results_published')
    .eq('id', params.id)
    .single()

  if (!event) notFound()

  if (!event.is_results_published) {
    return (
      <div className="container max-w-2xl py-10 text-center">
        <h1 className="text-2xl font-bold mb-2">Results Not Yet Published</h1>
        <p className="text-muted-foreground">
          Track declaration opens once Demo Day results are published.
        </p>
      </div>
    )
  }

  return (
    <div className="container max-w-2xl py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">What&apos;s Next for Your Team?</h1>
        <p className="text-muted-foreground mt-1">
          Choose the path that matches where you want to take your app.
        </p>
      </div>
      <Suspense fallback={<div>Loading...</div>}>
        <DeclarePage eventId={params.id} userId={user.id} />
      </Suspense>
    </div>
  )
}
```

**Step 4: Create `_components/declare-page-client.tsx`** (client component that fetches registration and existing declaration):

```tsx
'use client'

import { useMyRegistration } from '@/hooks/startup-studio/use-event-registrations'
import { useMyDeclaration } from '@/hooks/startup-studio/use-track-declarations'
import { useMySubmission } from '@/hooks/startup-studio/use-event-submissions'
import { DeclarationForm } from './declaration-form'
import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  eventId: string
  userId: string
}

export function DeclarePage({ eventId, userId }: Props) {
  const { data: registration, isLoading: regLoading } = useMyRegistration(eventId)
  const { data: submission, isLoading: subLoading } = useMySubmission(eventId)
  const { data: existing, isLoading: declLoading } = useMyDeclaration(
    eventId,
    registration?.id ?? null
  )

  if (regLoading || subLoading || declLoading) {
    return <Skeleton className="h-96 w-full rounded-xl" />
  }

  if (!registration) {
    return (
      <p className="text-muted-foreground text-center">
        You are not registered for this event.
      </p>
    )
  }

  // Only team leader (owner) can declare
  if (registration.owner_id !== userId) {
    return (
      <div className="text-center space-y-2">
        <p className="font-medium">Only the team leader can declare the track.</p>
        {existing && (
          <p className="text-muted-foreground text-sm">
            Your team has declared:{' '}
            <strong className="text-foreground">{existing.track.replace(/_/g, ' ')}</strong>
          </p>
        )}
      </div>
    )
  }

  return (
    <DeclarationForm
      eventId={eventId}
      registrationId={registration.id}
      teamName={registration.team_name}
      appathonScore={submission?.total_score ?? 0}
      existing={existing ?? null}
    />
  )
}
```

**Step 5: Commit**
```bash
git add app/\(routes\)/startup-studio/events/\[id\]/declare/
git commit -m "feat(page): add track declaration page for team leaders"
```

---

### Task 7: Track Declaration Admin Tab (Analytics Dashboard)

**Files:**
- Create: `app/(routes)/startup-studio/events/[id]/dashboard/_components/declarations-tab.tsx`
- Modify: `app/(routes)/startup-studio/events/[id]/dashboard/page.tsx` — add the new tab

**Step 1: Create `declarations-tab.tsx`:**

```tsx
'use client'

import { useDeclarationSummary, useEventDeclarations } from '@/hooks/startup-studio/use-track-declarations'
import { TRACKS } from '@/lib/constants/startup-studio/tracks'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { format } from 'date-fns'

interface Props {
  eventId: string
  totalTeams: number
}

export function DeclarationsTab({ eventId, totalTeams }: Props) {
  const { data: summary, isLoading: summaryLoading } = useDeclarationSummary(eventId)
  const { data: declarations, isLoading: declLoading } = useEventDeclarations(eventId)

  const declared = declarations?.length ?? 0
  const notDeclared = Math.max(0, totalTeams - declared)

  if (summaryLoading || declLoading) {
    return <Skeleton className="h-64 w-full" />
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TRACKS.map(track => {
          const s = summary?.find(s => s.track === track.id)
          return (
            <Card key={track.id}>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {track.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{s?.count ?? 0}</p>
                <p className="text-xs text-muted-foreground">{s?.percentage ?? 0}% of declared</p>
              </CardContent>
            </Card>
          )
        })}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Not Declared</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{notDeclared}</p>
            <p className="text-xs text-muted-foreground">of {totalTeams} total teams</p>
          </CardContent>
        </Card>
      </div>

      {/* Declarations table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Declarations</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Track</TableHead>
                <TableHead>Declared At</TableHead>
                <TableHead>Mentor Approved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(declarations ?? []).map(d => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.team_name}</TableCell>
                  <TableCell className="text-muted-foreground">{d.institution_name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {d.track.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(d.declared_at), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell>
                    {d.mentor_approved === null
                      ? <span className="text-muted-foreground text-sm">Pending</span>
                      : d.mentor_approved
                      ? <Badge variant="default">Approved</Badge>
                      : <Badge variant="destructive">Rejected</Badge>
                    }
                  </TableCell>
                </TableRow>
              ))}
              {(declarations ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No declarations yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
```

**Step 2: Open `app/(routes)/startup-studio/events/[id]/dashboard/page.tsx`.**

Find the tabs list (look for `TabsList` and the existing tab triggers). Add a new tab trigger after the existing ones:
```tsx
<TabsTrigger value="declarations">Declarations</TabsTrigger>
```

Then add the tab content panel (after the last `TabsContent`):
```tsx
<TabsContent value="declarations">
  <DeclarationsTab eventId={id} totalTeams={kpis?.total_teams ?? 0} />
</TabsContent>
```

Import the component at the top of the file:
```tsx
import { DeclarationsTab } from './_components/declarations-tab'
```

**Step 3: Commit**
```bash
git add app/\(routes\)/startup-studio/events/\[id\]/dashboard/_components/declarations-tab.tsx
git add app/\(routes\)/startup-studio/events/\[id\]/dashboard/page.tsx
git commit -m "feat(dashboard): add Track Declarations tab to analytics dashboard"
```

---

### Task 8: Case Study Service

**Files:**
- Create: `lib/services/startup-studio/case-study-service.ts`

**Step 1: Create the service file:**

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client'
import type { CaseStudy, CreateCaseStudyDto, UpdateCaseStudyDto } from '@/types/startup-studio'

export class CaseStudyService {
  static async getMyCaseStudy(eventId: string, registrationId: string): Promise<CaseStudy | null> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await supabase
      .from('case_studies')
      .select('*')
      .eq('event_id', eventId)
      .eq('team_id', registrationId)
      .maybeSingle()
    if (error) throw error
    return data
  }

  static async createCaseStudy(dto: CreateCaseStudyDto): Promise<CaseStudy> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await supabase
      .from('case_studies')
      .insert(dto)
      .select('*')
      .single()
    if (error) throw error
    return data
  }

  static async updateCaseStudy(caseStudyId: string, dto: UpdateCaseStudyDto): Promise<CaseStudy> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await supabase
      .from('case_studies')
      .update(dto)
      .eq('id', caseStudyId)
      .select('*')
      .single()
    if (error) throw error
    return data
  }

  // Admin: get all case studies for an event
  static async getEventCaseStudies(eventId: string): Promise<CaseStudy[]> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await supabase
      .from('case_studies')
      .select('*')
      .eq('event_id', eventId)
      .order('score', { ascending: false })
    if (error) throw error
    return data ?? []
  }

  // Admin: toggle featured flag
  static async setFeatured(caseStudyId: string, featured: boolean): Promise<void> {
    const supabase = createClientSupabaseClient()
    const { error } = await supabase
      .from('case_studies')
      .update({ featured })
      .eq('id', caseStudyId)
    if (error) throw error
  }
}
```

**Step 2: Commit**
```bash
git add lib/services/startup-studio/case-study-service.ts
git commit -m "feat(service): add CaseStudyService"
```

---

### Task 9: Case Study Hooks

**Files:**
- Create: `hooks/startup-studio/use-case-studies.ts`

**Step 1: Create the hooks file:**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CaseStudyService } from '@/lib/services/startup-studio/case-study-service'
import type { CreateCaseStudyDto, UpdateCaseStudyDto } from '@/types/startup-studio'

export function useMyCaseStudy(eventId: string, registrationId: string | null | undefined) {
  return useQuery({
    queryKey: ['case-study', eventId, registrationId],
    queryFn: () => CaseStudyService.getMyCaseStudy(eventId, registrationId!),
    enabled: !!eventId && !!registrationId,
  })
}

export function useEventCaseStudies(eventId: string) {
  return useQuery({
    queryKey: ['event-case-studies', eventId],
    queryFn: () => CaseStudyService.getEventCaseStudies(eventId),
    enabled: !!eventId,
  })
}

export function useCreateCaseStudy(eventId: string, registrationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateCaseStudyDto) => CaseStudyService.createCaseStudy(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-study', eventId, registrationId] })
      toast.success("Case study submitted! Your story is now part of the JKKN portfolio.")
    },
    onError: (error: Error) => {
      toast.error('Save failed — your content is preserved. Tap to retry.', {
        description: error.message,
      })
    },
  })
}

export function useUpdateCaseStudy(eventId: string, registrationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateCaseStudyDto }) =>
      CaseStudyService.updateCaseStudy(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-study', eventId, registrationId] })
      toast.success('Case study updated.')
    },
    onError: (error: Error) => {
      toast.error('Save failed — your content is preserved. Tap to retry.', {
        description: error.message,
      })
    },
  })
}

export function useSetCaseStudyFeatured(eventId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, featured }: { id: string; featured: boolean }) =>
      CaseStudyService.setFeatured(id, featured),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-case-studies', eventId] })
    },
    onError: (error: Error) => {
      toast.error('Failed to update featured status', { description: error.message })
    },
  })
}
```

**Step 2: Commit**
```bash
git add hooks/startup-studio/use-case-studies.ts
git commit -m "feat(hooks): add useMyCaseStudy, useCreateCaseStudy, useUpdateCaseStudy hooks"
```

---

### Task 10: Case Study Page

**Files:**
- Create: `app/(routes)/startup-studio/events/[id]/case-study/page.tsx`
- Create: `app/(routes)/startup-studio/events/[id]/case-study/_components/case-study-form.tsx`

**Step 1: Create `case-study-form.tsx`:**

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from '@/components/ui/form'
import { Badge } from '@/components/ui/badge'
import { Loader2, Save } from 'lucide-react'
import { useCreateCaseStudy, useUpdateCaseStudy, useMyCaseStudy } from '@/hooks/startup-studio/use-case-studies'
import type { CaseStudy, TrackId } from '@/types/startup-studio'

const schema = z.object({
  problem: z.string().min(10, 'At least 10 characters').max(200, 'Max 200 characters'),
  solution: z.string().min(10, 'At least 10 characters').max(200, 'Max 200 characters'),
  proof: z.string().min(10, 'At least 10 characters').max(200, 'Max 200 characters'),
  who_else: z.string().max(200, 'Max 200 characters').optional(),
  demo_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

interface Props {
  eventId: string
  registrationId: string
  track: 'solve_for_industry' | 'jicate_solutions'
  appName: string
  appUrl: string
  score: number
  existing: CaseStudy | null
}

export function CaseStudyForm({
  eventId,
  registrationId,
  track,
  appName,
  appUrl,
  score,
  existing,
}: Props) {
  const DRAFT_KEY = `case_study_draft_${eventId}_${registrationId}`
  const [draftSaved, setDraftSaved] = useState(false)
  const autoSaveRef = useRef<NodeJS.Timeout | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: existing
      ? {
          problem: existing.problem,
          solution: existing.solution,
          proof: existing.proof,
          who_else: existing.who_else ?? '',
          demo_url: existing.demo_url ?? '',
        }
      : (() => {
          const draft = localStorage.getItem(DRAFT_KEY)
          if (draft) {
            try { return JSON.parse(draft) } catch {}
          }
          return { problem: '', solution: '', proof: '', who_else: '', demo_url: '' }
        })(),
  })

  const create = useCreateCaseStudy(eventId, registrationId)
  const update = useUpdateCaseStudy(eventId, registrationId)
  const isPending = create.isPending || update.isPending

  // Auto-save draft every 10 seconds and on blur
  function saveDraft() {
    if (!existing) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form.getValues()))
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 2000)
    }
  }

  useEffect(() => {
    autoSaveRef.current = setInterval(saveDraft, 10_000)
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current)
    }
  }, [])

  async function onSubmit(values: FormValues) {
    const cleanedUrl = values.demo_url || undefined
    if (existing) {
      await update.mutateAsync({
        id: existing.id,
        dto: {
          problem: values.problem,
          solution: values.solution,
          proof: values.proof,
          who_else: values.who_else || undefined,
          demo_url: cleanedUrl,
        },
      })
    } else {
      await create.mutateAsync({
        event_id: eventId,
        team_id: registrationId,
        track,
        problem: values.problem,
        solution: values.solution,
        proof: values.proof,
        who_else: values.who_else || undefined,
        demo_url: cleanedUrl,
        app_name: appName,
        app_url: appUrl,
        score,
      })
      localStorage.removeItem(DRAFT_KEY)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">Case Study: {appName}</h2>
          <Badge variant="outline">{track.replace(/_/g, ' ')}</Badge>
          {draftSaved && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Save className="h-3 w-3" /> Draft saved
            </span>
          )}
        </div>

        <FormField
          control={form.control}
          name="problem"
          render={({ field }) => (
            <FormItem>
              <FormLabel>1. The Problem <span className="text-destructive">*</span></FormLabel>
              <FormDescription>Who has this problem and why does it matter?</FormDescription>
              <FormControl>
                <Textarea
                  {...field}
                  maxLength={200}
                  rows={3}
                  onBlur={() => { field.onBlur(); saveDraft() }}
                  disabled={isPending}
                />
              </FormControl>
              <div className="flex justify-between items-center">
                <FormMessage />
                <span className="text-xs text-muted-foreground">{field.value.length}/200</span>
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="solution"
          render={({ field }) => (
            <FormItem>
              <FormLabel>2. The Solution <span className="text-destructive">*</span></FormLabel>
              <FormDescription>What does your app do to solve it?</FormDescription>
              <FormControl>
                <Textarea
                  {...field}
                  maxLength={200}
                  rows={3}
                  onBlur={() => { field.onBlur(); saveDraft() }}
                  disabled={isPending}
                />
              </FormControl>
              <div className="flex justify-between items-center">
                <FormMessage />
                <span className="text-xs text-muted-foreground">{field.value.length}/200</span>
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="proof"
          render={({ field }) => (
            <FormItem>
              <FormLabel>3. The Proof <span className="text-destructive">*</span></FormLabel>
              <FormDescription>What happened when real people used it?</FormDescription>
              <FormControl>
                <Textarea
                  {...field}
                  maxLength={200}
                  rows={3}
                  placeholder="e.g. 15 hostel students used it daily to report maintenance issues, avg response time dropped from 3 days to 4 hours"
                  onBlur={() => { field.onBlur(); saveDraft() }}
                  disabled={isPending}
                />
              </FormControl>
              <div className="flex justify-between items-center">
                <FormMessage />
                <span className="text-xs text-muted-foreground">{field.value.length}/200</span>
              </div>
            </FormItem>
          )}
        />

        {track === 'solve_for_industry' && (
          <FormField
            control={form.control}
            name="who_else"
            render={({ field }) => (
              <FormItem>
                <FormLabel>4. Who Else Needs This? <span className="text-destructive">*</span></FormLabel>
                <FormDescription>Beyond JKKN, who would pay for this?</FormDescription>
                <FormControl>
                  <Textarea
                    {...field}
                    maxLength={200}
                    rows={3}
                    onBlur={() => { field.onBlur(); saveDraft() }}
                    disabled={isPending}
                  />
                </FormControl>
                <div className="flex justify-between items-center">
                  <FormMessage />
                  <span className="text-xs text-muted-foreground">{(field.value ?? '').length}/200</span>
                </div>
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="demo_url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>5. Screenshot / Demo URL <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
              <FormDescription>URL to a 30-second demo video or screenshot</FormDescription>
              <FormControl>
                <Input
                  {...field}
                  type="url"
                  placeholder="https://"
                  onBlur={() => { field.onBlur(); saveDraft() }}
                  disabled={isPending}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isPending ? 'Saving your case study...' : existing ? 'Update Case Study' : 'Submit Case Study'}
        </Button>
      </form>
    </Form>
  )
}
```

**Step 2: Create `app/(routes)/startup-studio/events/[id]/case-study/page.tsx`:**

```tsx
'use client'

import { notFound } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useMyRegistration } from '@/hooks/startup-studio/use-event-registrations'
import { useMySubmission } from '@/hooks/startup-studio/use-event-submissions'
import { useMyDeclaration } from '@/hooks/startup-studio/use-track-declarations'
import { useMyCaseStudy } from '@/hooks/startup-studio/use-case-studies'
import { useEvent } from '@/hooks/startup-studio/use-events'
import { CaseStudyForm } from './_components/case-study-form'
import { Skeleton } from '@/components/ui/skeleton'
import { trackRequiresCaseStudy } from '@/lib/constants/startup-studio/tracks'

interface Props {
  params: { id: string }
}

export default function CaseStudyPage({ params }: Props) {
  const { profile } = useAuth()
  const { data: event, isLoading: eventLoading } = useEvent(params.id)
  const { data: registration, isLoading: regLoading } = useMyRegistration(params.id)
  const { data: submission, isLoading: subLoading } = useMySubmission(params.id)
  const { data: declaration, isLoading: declLoading } = useMyDeclaration(
    params.id,
    registration?.id ?? null
  )
  const { data: existing, isLoading: csLoading } = useMyCaseStudy(
    params.id,
    registration?.id ?? null
  )

  const isLoading = eventLoading || regLoading || subLoading || declLoading || csLoading

  if (isLoading) return <Skeleton className="h-96 w-full max-w-2xl mx-auto mt-6" />
  if (!registration || !event) return notFound()

  if (!declaration || !trackRequiresCaseStudy(declaration.track)) {
    return (
      <div className="container max-w-2xl py-10 text-center">
        <h1 className="text-xl font-bold mb-2">Case Study Not Required</h1>
        <p className="text-muted-foreground">
          Case studies are only for teams on the JICATE Solutions or Solve for Industry tracks.
        </p>
      </div>
    )
  }

  return (
    <div className="container max-w-2xl py-6">
      <CaseStudyForm
        eventId={params.id}
        registrationId={registration.id}
        track={declaration.track as 'solve_for_industry' | 'jicate_solutions'}
        appName={submission?.app_name ?? registration.team_name}
        appUrl={submission?.live_app_url ?? ''}
        score={submission?.total_score ?? 0}
        existing={existing ?? null}
      />
    </div>
  )
}
```

**Step 3: Commit**
```bash
git add app/\(routes\)/startup-studio/events/\[id\]/case-study/
git commit -m "feat(page): add case study submission page for JICATE/Industry tracks"
```

---

### Task 11: Progression Service

**Files:**
- Create: `lib/services/startup-studio/progression-service.ts`

**Step 1: Create the service file:**

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client'
import type { ProgressionLevel } from '@/types/startup-studio'

export class ProgressionService {
  // Get all progression levels for a user across all events
  static async getMyProgressionLevels(profileId: string): Promise<ProgressionLevel[]> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await supabase
      .from('progression_levels')
      .select('*')
      .eq('profile_id', profileId)
      .order('achieved_at', { ascending: false })
    if (error) throw error
    return data ?? []
  }

  // Get the highest level for a user in a specific event
  static async getMyHighestLevelForEvent(
    profileId: string,
    eventId: string
  ): Promise<ProgressionLevel | null> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await supabase
      .from('progression_levels')
      .select('*')
      .eq('profile_id', profileId)
      .eq('event_id', eventId)
      .order('level', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data
  }

  // Admin: get all progression levels for an event (distribution)
  static async getEventProgressionLevels(eventId: string): Promise<ProgressionLevel[]> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await supabase
      .from('progression_levels')
      .select('*')
      .eq('event_id', eventId)
      .order('level', { ascending: false })
    if (error) throw error
    return data ?? []
  }

  // Admin/super_admin: manually award a level to a learner
  static async awardLevel(
    profileId: string,
    eventId: string,
    teamId: string,
    level: number,
    levelName: string,
    evidence: Record<string, unknown>,
    awardedBy: string
  ): Promise<ProgressionLevel> {
    const supabase = createClientSupabaseClient()
    const { data, error } = await supabase
      .from('progression_levels')
      .upsert(
        {
          profile_id: profileId,
          event_id: eventId,
          team_id: teamId,
          level,
          level_name: levelName,
          achieved_at: new Date().toISOString(),
          evidence,
          awarded_by: awardedBy,
        },
        { onConflict: 'profile_id,event_id,level' }
      )
      .select('*')
      .single()
    if (error) throw error
    return data
  }

  // Admin/super_admin: bulk auto-assign Level 1 after Demo Day
  // Runs the equivalent of the spec's auto-assignment SQL via individual upserts
  // Note: This is called by admin from the demo-day page after verification is complete.
  // The actual SQL for bulk assignment should be run directly in Supabase for performance.
  // This method provides the admin trigger capability.
  static async autoAssignLevel1ForEvent(eventId: string): Promise<{ assigned: number }> {
    const supabase = createClientSupabaseClient()

    // Fetch all verified team members whose team presented with a live app
    const { data: verifications, error } = await supabase
      .from('appathon_verifications')
      .select(`
        id,
        app_live,
        presented,
        event_submissions!submission_id (
          id,
          event_id,
          registration_id,
          event_registrations!registration_id (
            id,
            event_team_members!registration_id (
              profile_id,
              status
            )
          )
        )
      `)
      .eq('event_submissions.event_id', eventId)
      .eq('presented', true)
      .eq('app_live', true)
      .eq('verification_status', 'verified')

    if (error) throw error
    if (!verifications?.length) return { assigned: 0 }

    let assigned = 0

    for (const v of verifications) {
      const submission = (v as any).event_submissions
      if (!submission) continue
      const registration = submission.event_registrations
      if (!registration) continue
      const members: Array<{ profile_id: string; status: string }> =
        registration.event_team_members ?? []

      for (const member of members.filter(m => m.status === 'accepted')) {
        const { error: upsertError } = await supabase
          .from('progression_levels')
          .upsert(
            {
              profile_id: member.profile_id,
              event_id: eventId,
              team_id: registration.id,
              level: 1,
              level_name: 'App Builder',
              achieved_at: new Date().toISOString(),
              evidence: {
                verification_id: v.id,
                app_live: v.app_live,
                presented: v.presented,
              },
              awarded_by: 'system',
            },
            { onConflict: 'profile_id,event_id,level' }
          )
        if (!upsertError) assigned++
      }
    }

    return { assigned }
  }
}
```

**Step 2: Commit**
```bash
git add lib/services/startup-studio/progression-service.ts
git commit -m "feat(service): add ProgressionService with auto-assign Level 1 logic"
```

---

### Task 12: Progression Hooks

**Files:**
- Create: `hooks/startup-studio/use-progression.ts`

**Step 1: Create the hooks file:**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ProgressionService } from '@/lib/services/startup-studio/progression-service'
import { useAuth } from '@/hooks/use-auth'

export function useMyProgressionLevels() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['progression-levels', profile?.id],
    queryFn: () => ProgressionService.getMyProgressionLevels(profile!.id),
    enabled: !!profile?.id,
  })
}

export function useMyHighestLevelForEvent(eventId: string) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['progression-level', eventId, profile?.id],
    queryFn: () => ProgressionService.getMyHighestLevelForEvent(profile!.id, eventId),
    enabled: !!profile?.id && !!eventId,
  })
}

export function useEventProgressionLevels(eventId: string) {
  return useQuery({
    queryKey: ['event-progression-levels', eventId],
    queryFn: () => ProgressionService.getEventProgressionLevels(eventId),
    enabled: !!eventId,
  })
}

export function useAutoAssignLevel1(eventId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => ProgressionService.autoAssignLevel1ForEvent(eventId),
    onSuccess: ({ assigned }) => {
      queryClient.invalidateQueries({ queryKey: ['event-progression-levels', eventId] })
      toast.success(`Level 1 (App Builder) assigned to ${assigned} learners.`)
    },
    onError: (error: Error) => {
      toast.error('Auto-assignment failed', { description: error.message })
    },
  })
}
```

**Step 2: Commit**
```bash
git add hooks/startup-studio/use-progression.ts
git commit -m "feat(hooks): add useMyProgressionLevels, useAutoAssignLevel1 hooks"
```

---

### Task 13: Progression Level Widget Component

**Files:**
- Create: `components/startup-studio/progression-level-widget.tsx`

**Step 1: Create the component:**

```tsx
'use client'

import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useMyHighestLevelForEvent } from '@/hooks/startup-studio/use-progression'
import { getProgressionLevel, PROGRESSION_LEVELS } from '@/lib/constants/startup-studio/progression'
import { format } from 'date-fns'
import type { ProgressionLevelNumber } from '@/types/startup-studio'

interface Props {
  eventId: string
}

export function ProgressionLevelWidget({ eventId }: Props) {
  const { data: current, isLoading } = useMyHighestLevelForEvent(eventId)

  if (isLoading) return <Skeleton className="h-32 w-full rounded-xl" />

  if (!current) {
    return (
      <div className="rounded-xl border p-4 bg-muted/30">
        <p className="text-sm font-medium text-muted-foreground">Progression Level</p>
        <p className="text-xs text-muted-foreground mt-1">
          No level assigned yet. Levels are assigned after Demo Day verification.
        </p>
      </div>
    )
  }

  const levelConfig = getProgressionLevel(current.level as ProgressionLevelNumber)
  const progressPercent = ((current.level / 5) * 100)
  const nextLevel = current.level < 5
    ? PROGRESSION_LEVELS.find(p => p.level === current.level + 1)
    : null

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Progression Level</p>
        <span className="text-xs text-muted-foreground">Level {current.level} of 5</span>
      </div>

      <Progress value={progressPercent} className="h-2" />

      <div>
        <p className="font-semibold">{levelConfig?.name ?? current.level_name}</p>
        <p className="text-sm text-muted-foreground italic mt-0.5">
          "{levelConfig?.identity}"
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        Achieved: {format(new Date(current.achieved_at), 'dd MMM yyyy')}
      </p>

      {nextLevel && (
        <div className="text-xs text-muted-foreground border-t pt-2">
          <span className="font-medium text-foreground">Next: {nextLevel.name}</span>
          <span> — {nextLevel.test}</span>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Commit**
```bash
git add components/startup-studio/progression-level-widget.tsx
git commit -m "feat(component): add ProgressionLevelWidget for profile display"
```

---

### Task 14: Auto-Assign Level 1 Button on Demo Day Page

**Files:**
- Modify: `app/(routes)/startup-studio/events/[id]/demo-day/page.tsx`

**Step 1: Open `app/(routes)/startup-studio/events/[id]/demo-day/page.tsx`.**

Add import at top:
```tsx
import { useAutoAssignLevel1 } from '@/hooks/startup-studio/use-progression'
```

Inside the component, add the hook:
```tsx
const autoAssignLevel1 = useAutoAssignLevel1(id)
```

Find the section that shows the "Publish Results" button (look for `usePublishResults`). After that button, add:
```tsx
{event?.is_results_published && (
  <div className="border rounded-lg p-4 space-y-2">
    <h3 className="text-sm font-semibold">Progression Levels</h3>
    <p className="text-xs text-muted-foreground">
      Auto-assign Level 1 (App Builder) to all learners whose team presented with a live app.
      Safe to run multiple times — uses ON CONFLICT DO NOTHING.
    </p>
    <Button
      variant="outline"
      onClick={() => autoAssignLevel1.mutate()}
      disabled={autoAssignLevel1.isPending}
      size="sm"
    >
      {autoAssignLevel1.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
      Auto-Assign Level 1 (App Builder)
    </Button>
  </div>
)}
```

**Step 2: Commit**
```bash
git add app/\(routes\)/startup-studio/events/\[id\]/demo-day/page.tsx
git commit -m "feat(demo-day): add Auto-Assign Level 1 button after results published"
```

---

### Task 15: Sidebar Menu Updates

**Files:**
- Modify: `lib/sidebarMenuLink.ts`

**Step 1: Open `lib/sidebarMenuLink.ts`. Find the startup-studio submenus array.**

Add two new submenu items after the existing `vote` entry:

```typescript
{
  href: `/startup-studio/events/${activeId}/declare`,
  label: 'Declare Track',
  permission: 'startup_studio.events.view',
  // Shown to students (team leaders) after results published
},
{
  href: `/startup-studio/events/${activeId}/case-study`,
  label: 'Case Study',
  permission: 'startup_studio.events.view',
  // Shown conditionally — visible to teams on industry/JICATE tracks
},
```

**Note:** Both use `startup_studio.events.view` — the pages themselves gate access based on registration status and track declaration, so no new permission key is needed.

**Step 2: Commit**
```bash
git add lib/sidebarMenuLink.ts
git commit -m "feat(sidebar): add Declare Track and Case Study links to startup-studio submenu"
```

---

## Testing Checklist

After all tasks are complete, verify:

```
□ Task 1: Run SELECT on 3 new tables — all 3 exist with correct columns
□ Task 1: Verify RLS enabled: SELECT relrowsecurity FROM pg_class WHERE relname = 'track_declarations'
□ Task 3: TypeScript compiles without errors: npx tsc --noEmit
□ Task 6: Navigate to /startup-studio/events/[id]/declare — shows "Results Not Yet Published" when is_results_published=false
□ Task 6: When is_results_published=true — shows 4 track cards
□ Task 6: Team member (non-leader) sees read-only view of the declaration, not the form
□ Task 6: localStorage draft saves on track selection and restores on page reload
□ Task 7: Dashboard → Declarations tab shows summary counts and table
□ Task 9: /startup-studio/events/[id]/case-study — redirects/shows message when track is NOT jicate_solutions or solve_for_industry
□ Task 9: For solve_for_industry track — field 4 "Who Else Needs This?" is visible
□ Task 9: For jicate_solutions track — field 4 is hidden
□ Task 9: localStorage auto-saves draft every 10s
□ Task 12: ProgressionLevelWidget renders "No level" state when no data
□ Task 13: After clicking "Auto-Assign Level 1" — toast shows "assigned N learners"
□ Task 14: Declare Track and Case Study links appear in sidebar when inside an event
```

---

## Bulk Auto-Assignment SQL (Alternative — Run Directly in Supabase)

If the client-side auto-assignment in Task 11 is too slow for large events (600+ teams), run this SQL directly in the Supabase Dashboard for instant bulk assignment:

```sql
-- Auto-assign Level 1 (App Builder) after Demo Day
-- Replace 'YOUR_EVENT_ID' with the actual event UUID
INSERT INTO progression_levels (profile_id, event_id, team_id, level, level_name, achieved_at, evidence, awarded_by)
SELECT
  tm.profile_id,
  s.event_id,
  r.id,
  1,
  'App Builder',
  NOW(),
  jsonb_build_object(
    'verification_id', v.id,
    'app_live', v.app_live,
    'presented', v.presented
  ),
  'system'
FROM appathon_verifications v
JOIN event_submissions s ON s.id = v.submission_id
JOIN event_registrations r ON r.id = s.registration_id
JOIN event_team_members tm ON tm.registration_id = r.id AND tm.status = 'accepted'
WHERE s.event_id = 'YOUR_EVENT_ID'
  AND v.presented = true
  AND v.app_live = true
  AND v.verification_status = 'verified'
ON CONFLICT (profile_id, event_id, level) DO NOTHING;

-- Verify: How many learners got Level 1?
SELECT COUNT(*) FROM progression_levels
WHERE event_id = 'YOUR_EVENT_ID' AND level = 1;
```

---

*Plan created: 2026-03-09*
*Spec: docs/features/startup/Spec-Post-Demo-Day-Pipeline.md*
*Feature: Post-Demo Day Pipeline — Track Declaration + Progression Levels + Case Studies*
