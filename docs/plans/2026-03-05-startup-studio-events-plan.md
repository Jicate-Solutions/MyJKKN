# Startup Studio Events Module — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build a generic event platform (Startup Studio) into MyJKKN supporting hackathons, competitions, and buildathons across 6 JKKN colleges — shipping for JKKN Appathon 2.0 (March 8-9, 2026).

**Architecture:** Static service classes with `createClientSupabaseClient()`, React Query hooks for data fetching/mutations, Zod-validated forms with react-hook-form, role-filtered sidebar navigation. Deadline enforcement in service layer (not RLS). Scoring in TypeScript (not DB triggers).

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (Postgres + RLS), React Query v5, react-hook-form + Zod, shadcn/ui, Tailwind CSS, lucide-react icons.

---

## Phase 1: Database Foundation + TypeScript Types

### Task 1: Add Startup Studio Tables to SQL

**Files:**
- Modify: `supabase/setup/01_tables.sql` (append before line 1861 "END OF TABLE DEFINITIONS")

**Step 1: Add all 11 startup studio tables**

Insert the following SQL block before the `-- END OF TABLE DEFINITIONS` comment at line 1861:

```sql
-- =====================================================
-- SECTION: STARTUP STUDIO MODULE
-- Created: 2026-03-05 - Startup Studio events platform
-- Purpose: Generic event platform for hackathons, competitions, buildathons
-- =====================================================

-- Startup Events (generic, reusable across future events)
CREATE TABLE IF NOT EXISTS public.startup_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    host_institution_id UUID REFERENCES institutions(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','registration_open','registration_closed','build_day','demo_day','closed')),
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    demo_date TIMESTAMPTZ,
    registration_deadline TIMESTAMPTZ,
    submission_deadline TIMESTAMPTZ,
    metrics_deadline TIMESTAMPTZ,
    is_results_published BOOLEAN DEFAULT false,
    config JSONB DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event Registrations (team registrations)
CREATE TABLE IF NOT EXISTS public.event_registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
    team_name TEXT NOT NULL,
    problem_idea TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES profiles(id),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    lovable_verified BOOLEAN DEFAULT false,
    lovable_verified_at TIMESTAMPTZ,
    lovable_verified_by UUID REFERENCES profiles(id),
    checked_in BOOLEAN DEFAULT false,
    checked_in_at TIMESTAMPTZ,
    checked_in_by UUID REFERENCES profiles(id),
    status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','checked_in','disqualified')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(event_id, owner_id)
);

-- Event Team Members (instant add, no confirmation)
CREATE TABLE IF NOT EXISTS public.event_team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_id UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES profiles(id),
    email TEXT NOT NULL,
    full_name TEXT,
    student_id TEXT,
    has_laptop BOOLEAN DEFAULT false,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(registration_id, email)
);

-- Event Venue Assignments (link events to rooms/labs)
CREATE TABLE IF NOT EXISTS public.event_venue_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
    resource_id UUID REFERENCES resources(id),
    manual_name TEXT,
    manual_building TEXT,
    manual_room TEXT,
    capacity_override INT,
    day_type TEXT NOT NULL CHECK (day_type IN ('build_day','demo_day')),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event Team Venue Allocations (team-to-venue mapping)
CREATE TABLE IF NOT EXISTS public.event_team_venue_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
    registration_id UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
    venue_assignment_id UUID NOT NULL REFERENCES event_venue_assignments(id) ON DELETE CASCADE,
    day_type TEXT NOT NULL CHECK (day_type IN ('build_day','demo_day')),
    allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    allocated_by UUID REFERENCES profiles(id),
    UNIQUE(event_id, registration_id, day_type)
);

-- Event Staff Assignments (mentors/judges at venues)
CREATE TABLE IF NOT EXISTS public.event_staff_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
    venue_assignment_id UUID NOT NULL REFERENCES event_venue_assignments(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff(id),
    role TEXT NOT NULL CHECK (role IN ('mentor','lead_mentor','judge','panel_chair','evaluator')),
    day_type TEXT NOT NULL CHECK (day_type IN ('build_day','demo_day')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(event_id, staff_id, venue_assignment_id, day_type)
);

-- Event Demo Slots (presentation schedule)
CREATE TABLE IF NOT EXISTS public.event_demo_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
    venue_assignment_id UUID NOT NULL REFERENCES event_venue_assignments(id) ON DELETE CASCADE,
    registration_id UUID REFERENCES event_registrations(id),
    start_time TIMESTAMPTZ,
    duration_minutes INT DEFAULT 5,
    room_label TEXT,
    slot_order INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event Submissions (two-phase deadline)
CREATE TABLE IF NOT EXISTS public.event_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
    registration_id UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
    UNIQUE(event_id, registration_id),

    -- Phase 1 fields: locked at submission_deadline
    app_name TEXT,
    github_url TEXT,
    live_app_url TEXT,
    description TEXT,
    category TEXT,

    -- Phase 2 fields: locked at metrics_deadline
    mrr_amount DECIMAL(10,2) DEFAULT 0,
    paying_users_count INT DEFAULT 0,
    user_count INT DEFAULT 0,
    proof_urls TEXT[] DEFAULT '{}',

    -- Verification (batch - only Level 4/5 teams)
    mrr_verified BOOLEAN DEFAULT false,
    mrr_verified_at TIMESTAMPTZ,
    mrr_verified_by UUID REFERENCES profiles(id),
    mrr_rejected_reason TEXT,

    -- Denormalized scoring
    tier_level INT DEFAULT 0,
    tier_points INT DEFAULT 0,
    mrr_bonus_points INT DEFAULT 0,
    total_score INT DEFAULT 0,

    submitted_at TIMESTAMPTZ,
    submitted_by UUID REFERENCES profiles(id),
    metrics_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event Checklists (multi-role)
CREATE TABLE IF NOT EXISTS public.event_checklists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN ('pre_event','on_day','post_event')),
    target_role TEXT NOT NULL CHECK (target_role IN ('admin','mentor','team')),
    order_index INT DEFAULT 0
);

-- Event Checklist Items
CREATE TABLE IF NOT EXISTS public.event_checklist_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    checklist_id UUID NOT NULL REFERENCES event_checklists(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    order_index INT DEFAULT 0,
    is_required BOOLEAN DEFAULT false
);

-- Event Checklist Completions
CREATE TABLE IF NOT EXISTS public.event_checklist_completions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    checklist_item_id UUID NOT NULL REFERENCES event_checklist_items(id) ON DELETE CASCADE,
    completed_by UUID NOT NULL REFERENCES profiles(id),
    registration_id UUID REFERENCES event_registrations(id),
    staff_assignment_id UUID REFERENCES event_staff_assignments(id),
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for Startup Studio
CREATE INDEX idx_startup_events_status ON startup_events(status);
CREATE INDEX idx_event_registrations_event ON event_registrations(event_id);
CREATE INDEX idx_event_registrations_owner ON event_registrations(owner_id);
CREATE INDEX idx_event_team_members_registration ON event_team_members(registration_id);
CREATE INDEX idx_event_team_members_email ON event_team_members(email);
CREATE INDEX idx_event_venue_assignments_event ON event_venue_assignments(event_id);
CREATE INDEX idx_event_submissions_event ON event_submissions(event_id);
CREATE INDEX idx_event_submissions_score ON event_submissions(event_id, total_score DESC, mrr_amount DESC);
CREATE INDEX idx_event_staff_assignments_event ON event_staff_assignments(event_id);
CREATE INDEX idx_event_demo_slots_event ON event_demo_slots(event_id);

-- Enable RLS on all startup studio tables
ALTER TABLE startup_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_venue_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_team_venue_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_demo_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_checklist_completions ENABLE ROW LEVEL SECURITY;
```

**Step 2: Run the SQL in Supabase Dashboard**

Go to Supabase Dashboard → SQL Editor → paste and run the startup studio section only.

**Step 3: Verify tables created**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'startup%' OR table_name LIKE 'event_%'
ORDER BY table_name;
```

Expected: 11 tables returned.

**Step 4: Commit**

```bash
git add supabase/setup/01_tables.sql
git commit -m "feat(startup-studio): add 11 database tables for events module"
```

---

### Task 2: Add RLS Policies

**Files:**
- Modify: `supabase/setup/03_policies.sql` (append at end)

**Step 1: Add RLS policies for all startup studio tables**

Append to end of `03_policies.sql`:

```sql
-- =====================================================
-- STARTUP STUDIO MODULE - RLS POLICIES
-- Created: 2026-03-05
-- =====================================================

-- startup_events: visible to all authenticated users
CREATE POLICY "startup_events_select_all" ON startup_events
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "startup_events_insert_admin" ON startup_events
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

CREATE POLICY "startup_events_update_admin" ON startup_events
    FOR UPDATE TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

-- event_registrations: owner can CRUD own, admin can read all
CREATE POLICY "event_registrations_select" ON event_registrations
    FOR SELECT TO authenticated USING (
        owner_id = auth.uid()
        OR EXISTS (SELECT 1 FROM event_team_members WHERE registration_id = event_registrations.id AND profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator', 'staff')))
    );

CREATE POLICY "event_registrations_insert" ON event_registrations
    FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY "event_registrations_update" ON event_registrations
    FOR UPDATE TO authenticated USING (
        owner_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

-- event_team_members: owner of registration can manage
CREATE POLICY "event_team_members_select" ON event_team_members
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM event_registrations WHERE id = event_team_members.registration_id AND (
            owner_id = auth.uid()
            OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator', 'staff')))
        ))
    );

CREATE POLICY "event_team_members_insert" ON event_team_members
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM event_registrations WHERE id = event_team_members.registration_id AND owner_id = auth.uid())
    );

CREATE POLICY "event_team_members_delete" ON event_team_members
    FOR DELETE TO authenticated USING (
        EXISTS (SELECT 1 FROM event_registrations WHERE id = event_team_members.registration_id AND owner_id = auth.uid())
    );

-- event_venue_assignments: admin manage, all authenticated read
CREATE POLICY "event_venue_assignments_select" ON event_venue_assignments
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "event_venue_assignments_admin" ON event_venue_assignments
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

-- event_team_venue_allocations: admin manage, team owner + staff read
CREATE POLICY "event_team_venue_allocations_select" ON event_team_venue_allocations
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "event_team_venue_allocations_admin" ON event_team_venue_allocations
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

-- event_staff_assignments: admin manage, staff read own
CREATE POLICY "event_staff_assignments_select" ON event_staff_assignments
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "event_staff_assignments_admin" ON event_staff_assignments
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

-- event_demo_slots: all read, admin manage
CREATE POLICY "event_demo_slots_select" ON event_demo_slots
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "event_demo_slots_admin" ON event_demo_slots
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

-- event_submissions: owner CRUD, admin + staff read
CREATE POLICY "event_submissions_select" ON event_submissions
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM event_registrations WHERE id = event_submissions.registration_id AND owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator', 'staff')))
    );

CREATE POLICY "event_submissions_insert" ON event_submissions
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM event_registrations WHERE id = event_submissions.registration_id AND owner_id = auth.uid())
    );

CREATE POLICY "event_submissions_update" ON event_submissions
    FOR UPDATE TO authenticated USING (
        EXISTS (SELECT 1 FROM event_registrations WHERE id = event_submissions.registration_id AND owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

-- event_checklists + items: all read, admin manage
CREATE POLICY "event_checklists_select" ON event_checklists
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "event_checklists_admin" ON event_checklists
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

CREATE POLICY "event_checklist_items_select" ON event_checklist_items
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "event_checklist_items_admin" ON event_checklist_items
    FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role IN ('admin', 'administrator')))
    );

-- event_checklist_completions: own completions
CREATE POLICY "event_checklist_completions_select" ON event_checklist_completions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "event_checklist_completions_insert" ON event_checklist_completions
    FOR INSERT TO authenticated WITH CHECK (completed_by = auth.uid());
```

**Step 2: Run policies in Supabase Dashboard**

**Step 3: Commit**

```bash
git add supabase/setup/03_policies.sql
git commit -m "feat(startup-studio): add RLS policies for all 11 tables"
```

---

### Task 3: Create TypeScript Types

**Files:**
- Create: `types/startup-studio.ts`

**Step 1: Write the types file**

```typescript
// types/startup-studio.ts
// Startup Studio Module Types

// ── Enums ──────────────────────────────────────────

export type EventStatus = 'draft' | 'registration_open' | 'registration_closed' | 'build_day' | 'demo_day' | 'closed';
export type RegistrationStatus = 'registered' | 'checked_in' | 'disqualified';
export type StaffRole = 'mentor' | 'lead_mentor' | 'judge' | 'panel_chair' | 'evaluator';
export type DayType = 'build_day' | 'demo_day';
export type ChecklistPhase = 'pre_event' | 'on_day' | 'post_event';
export type ChecklistTargetRole = 'admin' | 'mentor' | 'team';

// ── Config (stored in startup_events.config JSONB) ──

export interface EventConfig {
  team_max_size: number;
  categories: string[];
  tools: string[];
  scoring_type: string;
  tier_points: Record<number, number>; // { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 }
  mrr_bonus_brackets: Array<{ min: number; max: number | null; points: number }>;
}

// ── Core Entities ──────────────────────────────────

export interface StartupEvent {
  id: string;
  name: string;
  description: string | null;
  host_institution_id: string | null;
  status: EventStatus;
  start_date: string | null;
  end_date: string | null;
  demo_date: string | null;
  registration_deadline: string | null;
  submission_deadline: string | null;
  metrics_deadline: string | null;
  is_results_published: boolean;
  config: EventConfig;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  host_institution?: any;
  creator?: any;
}

export interface EventRegistration {
  id: string;
  event_id: string;
  team_name: string;
  problem_idea: string;
  owner_id: string;
  institution_id: string;
  lovable_verified: boolean;
  lovable_verified_at: string | null;
  lovable_verified_by: string | null;
  checked_in: boolean;
  checked_in_at: string | null;
  checked_in_by: string | null;
  status: RegistrationStatus;
  created_at: string;
  updated_at: string;
  // Relations
  owner?: any;
  institution?: any;
  team_members?: EventTeamMember[];
  venue_allocation?: EventTeamVenueAllocation;
  submission?: EventSubmission;
}

export interface EventTeamMember {
  id: string;
  registration_id: string;
  profile_id: string | null;
  email: string;
  full_name: string | null;
  student_id: string | null;
  has_laptop: boolean;
  added_at: string;
  // Relations
  profile?: any;
}

export interface EventVenueAssignment {
  id: string;
  event_id: string;
  resource_id: string | null;
  manual_name: string | null;
  manual_building: string | null;
  manual_room: string | null;
  capacity_override: number | null;
  day_type: DayType;
  institution_id: string;
  created_at: string;
  // Relations
  resource?: any;
  institution?: any;
  staff_assignments?: EventStaffAssignment[];
  team_allocations?: EventTeamVenueAllocation[];
}

export interface EventTeamVenueAllocation {
  id: string;
  event_id: string;
  registration_id: string;
  venue_assignment_id: string;
  day_type: DayType;
  allocated_at: string;
  allocated_by: string | null;
  // Relations
  venue_assignment?: EventVenueAssignment;
  registration?: EventRegistration;
}

export interface EventStaffAssignment {
  id: string;
  event_id: string;
  venue_assignment_id: string;
  staff_id: string;
  role: StaffRole;
  day_type: DayType;
  created_at: string;
  // Relations
  staff?: any;
  venue_assignment?: EventVenueAssignment;
}

export interface EventDemoSlot {
  id: string;
  event_id: string;
  venue_assignment_id: string;
  registration_id: string | null;
  start_time: string | null;
  duration_minutes: number;
  room_label: string | null;
  slot_order: number | null;
  created_at: string;
  // Relations
  registration?: EventRegistration;
  venue_assignment?: EventVenueAssignment;
}

export interface EventSubmission {
  id: string;
  event_id: string;
  registration_id: string;
  // Phase 1
  app_name: string | null;
  github_url: string | null;
  live_app_url: string | null;
  description: string | null;
  category: string | null;
  // Phase 2
  mrr_amount: number;
  paying_users_count: number;
  user_count: number;
  proof_urls: string[];
  // Verification
  mrr_verified: boolean;
  mrr_verified_at: string | null;
  mrr_verified_by: string | null;
  mrr_rejected_reason: string | null;
  // Scoring
  tier_level: number;
  tier_points: number;
  mrr_bonus_points: number;
  total_score: number;
  // Timestamps
  submitted_at: string | null;
  submitted_by: string | null;
  metrics_updated_at: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  registration?: EventRegistration;
}

export interface EventChecklist {
  id: string;
  event_id: string;
  title: string;
  phase: ChecklistPhase;
  target_role: ChecklistTargetRole;
  order_index: number;
  items?: EventChecklistItem[];
}

export interface EventChecklistItem {
  id: string;
  checklist_id: string;
  title: string;
  description: string | null;
  order_index: number;
  is_required: boolean;
  completion?: EventChecklistCompletion;
}

export interface EventChecklistCompletion {
  id: string;
  checklist_item_id: string;
  completed_by: string;
  registration_id: string | null;
  staff_assignment_id: string | null;
  completed_at: string;
}

// ── DTOs ───────────────────────────────────────────

export interface CreateEventDto {
  name: string;
  description?: string;
  host_institution_id?: string;
  start_date?: string;
  end_date?: string;
  demo_date?: string;
  registration_deadline?: string;
  submission_deadline?: string;
  metrics_deadline?: string;
  config?: Partial<EventConfig>;
}

export interface UpdateEventDto extends Partial<CreateEventDto> {
  status?: EventStatus;
  is_results_published?: boolean;
}

export interface CreateRegistrationDto {
  event_id: string;
  team_name: string;
  problem_idea: string;
  members: CreateTeamMemberDto[];
}

export interface CreateTeamMemberDto {
  email: string;
  full_name?: string;
  student_id?: string;
  has_laptop?: boolean;
}

export interface CreateVenueDto {
  event_id: string;
  day_type: DayType;
  institution_id: string;
  resource_id?: string;
  manual_name?: string;
  manual_building?: string;
  manual_room?: string;
  capacity_override?: number;
}

export interface SubmitProjectDto {
  event_id: string;
  registration_id: string;
  app_name: string;
  github_url: string;
  live_app_url?: string;
  description?: string;
  category?: string;
}

export interface UpdateMetricsDto {
  mrr_amount?: number;
  paying_users_count?: number;
  user_count?: number;
  proof_urls?: string[];
}

// ── Scoring ────────────────────────────────────────

export interface ScoringResult {
  tier_level: number;
  tier_points: number;
  mrr_bonus_points: number;
  total_score: number;
}

// ── Filters ────────────────────────────────────────

export interface EventFilters {
  status?: EventStatus;
  search?: string;
  host_institution_id?: string;
}

export interface RegistrationFilters {
  event_id: string;
  status?: RegistrationStatus;
  search?: string;
  institution_id?: string;
  checked_in?: boolean;
  lovable_verified?: boolean;
}

// ── Validation Result ──────────────────────────────

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ── Leaderboard Entry ──────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  team_name: string;
  app_name: string | null;
  category: string | null;
  institution_name: string | null;
  tier_level: number;
  tier_points: number;
  mrr_amount: number;
  mrr_bonus_points: number;
  total_score: number;
  paying_users_count: number;
  user_count: number;
  registration_id: string;
  submission_id: string;
}
```

**Step 2: Commit**

```bash
git add types/startup-studio.ts
git commit -m "feat(startup-studio): add TypeScript types for all entities and DTOs"
```

---

### Task 4: Update SQL_FILE_INDEX.md

**Files:**
- Modify: `supabase/SQL_FILE_INDEX.md`

**Step 1: Add Startup Studio row to the tables section**

Add this row to the tables table (after Service Requests row):

```markdown
| **Startup Studio** | **startup_events, event_registrations, event_team_members, event_venue_assignments, event_team_venue_allocations, event_staff_assignments, event_demo_slots, event_submissions, event_checklists, event_checklist_items, event_checklist_completions** | **11** | **NEW - Generic event platform for hackathons/competitions** |
```

Update the total count from 72 to 83.

**Step 2: Commit**

```bash
git add supabase/SQL_FILE_INDEX.md
git commit -m "docs(startup-studio): update SQL_FILE_INDEX with 11 new tables"
```

---

## Phase 2: Event Service + Event List & Detail Pages

### Task 5: Create Event Service

**Files:**
- Create: `lib/services/startup-studio/event-service.ts`

**Step 1: Write the service**

```typescript
// lib/services/startup-studio/event-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  StartupEvent,
  CreateEventDto,
  UpdateEventDto,
  EventFilters,
  EventStatus,
} from '@/types/startup-studio';

export class EventService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  static async getEvents(filters?: EventFilters): Promise<StartupEvent[]> {
    let query = this.supabase
      .from('startup_events')
      .select(`
        *,
        host_institution:institutions(id, name),
        creator:profiles!startup_events_created_by_fkey(id, full_name, email)
      `)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.search) {
      query = query.ilike('name', `%${filters.search}%`);
    }
    if (filters?.host_institution_id) {
      query = query.eq('host_institution_id', filters.host_institution_id);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[startup/events] getEvents failed:', error);
      throw error;
    }
    return (data || []) as unknown as StartupEvent[];
  }

  static async getEvent(id: string): Promise<StartupEvent | null> {
    const { data, error } = await this.supabase
      .from('startup_events')
      .select(`
        *,
        host_institution:institutions(id, name),
        creator:profiles!startup_events_created_by_fkey(id, full_name, email)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[startup/events] getEvent failed:', error);
      throw error;
    }
    return data as unknown as StartupEvent;
  }

  static async createEvent(dto: CreateEventDto, userId: string): Promise<StartupEvent> {
    const defaultConfig = {
      team_max_size: 5,
      categories: [],
      tools: [],
      scoring_type: 'tiered',
      tier_points: { 0: 0, 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 },
      mrr_bonus_brackets: [
        { min: 1, max: 99, points: 5 },
        { min: 100, max: 499, points: 10 },
        { min: 500, max: 999, points: 15 },
        { min: 1000, max: null, points: 20 },
      ],
    };

    const { data, error } = await this.supabase
      .from('startup_events')
      .insert({
        name: dto.name,
        description: dto.description || null,
        host_institution_id: dto.host_institution_id || null,
        start_date: dto.start_date || null,
        end_date: dto.end_date || null,
        demo_date: dto.demo_date || null,
        registration_deadline: dto.registration_deadline || null,
        submission_deadline: dto.submission_deadline || null,
        metrics_deadline: dto.metrics_deadline || null,
        config: { ...defaultConfig, ...(dto.config || {}) },
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('[startup/events] createEvent failed:', error);
      throw error;
    }
    return data as unknown as StartupEvent;
  }

  static async updateEvent(id: string, dto: UpdateEventDto): Promise<StartupEvent> {
    const { data, error } = await this.supabase
      .from('startup_events')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[startup/events] updateEvent failed:', error);
      throw error;
    }
    return data as unknown as StartupEvent;
  }

  static async updateStatus(id: string, status: EventStatus): Promise<StartupEvent> {
    return this.updateEvent(id, { status });
  }

  static async getEventStats(eventId: string) {
    const { data: registrations, error } = await this.supabase
      .from('event_registrations')
      .select(`
        id,
        status,
        checked_in,
        lovable_verified,
        institution_id,
        team_members:event_team_members(id, has_laptop)
      `)
      .eq('event_id', eventId);

    if (error) {
      console.error('[startup/events] getEventStats failed:', error);
      throw error;
    }

    const teams = registrations || [];
    const allMembers = teams.flatMap((t: any) => t.team_members || []);

    return {
      total_teams: teams.length,
      checked_in_teams: teams.filter((t: any) => t.checked_in).length,
      lovable_verified_teams: teams.filter((t: any) => t.lovable_verified).length,
      total_members: allMembers.length,
      members_with_laptops: allMembers.filter((m: any) => m.has_laptop).length,
      institutions: [...new Set(teams.map((t: any) => t.institution_id))].length,
    };
  }
}
```

**Step 2: Commit**

```bash
git add lib/services/startup-studio/event-service.ts
git commit -m "feat(startup-studio): add EventService with CRUD and stats"
```

---

### Task 6: Create Event Query Hooks

**Files:**
- Create: `hooks/startup-studio/use-events.ts`

**Step 1: Write the hooks**

```typescript
// hooks/startup-studio/use-events.ts

import { useQuery } from '@tanstack/react-query';
import { EventService } from '@/lib/services/startup-studio/event-service';
import type { EventFilters } from '@/types/startup-studio';

export function useEvents(filters?: EventFilters) {
  return useQuery({
    queryKey: ['startup-events', filters],
    queryFn: () => EventService.getEvents(filters),
    staleTime: 30 * 1000,
    retry: 3,
  });
}

export function useEvent(id: string | undefined) {
  return useQuery({
    queryKey: ['startup-event', id],
    queryFn: () => {
      if (!id) return null;
      return EventService.getEvent(id);
    },
    enabled: !!id,
    staleTime: 30 * 1000,
    retry: 3,
  });
}

export function useEventStats(eventId: string | undefined) {
  return useQuery({
    queryKey: ['startup-event-stats', eventId],
    queryFn: () => {
      if (!eventId) return null;
      return EventService.getEventStats(eventId);
    },
    enabled: !!eventId,
    staleTime: 15 * 1000,
    retry: 3,
  });
}
```

**Step 2: Commit**

```bash
git add hooks/startup-studio/use-events.ts
git commit -m "feat(startup-studio): add React Query hooks for events"
```

---

### Task 7: Create Events List Page

**Files:**
- Create: `app/(routes)/startup-studio/events/page.tsx`
- Create: `app/(routes)/startup-studio/events/_components/event-card.tsx`
- Create: `app/(routes)/startup-studio/events/_components/event-status-badge.tsx`

**Step 1: Create event status badge component**

```typescript
// app/(routes)/startup-studio/events/_components/event-status-badge.tsx
'use client';

import { Badge } from '@/components/ui/badge';
import type { EventStatus } from '@/types/startup-studio';

const statusConfig: Record<EventStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  registration_open: { label: 'Registration Open', variant: 'default' },
  registration_closed: { label: 'Registration Closed', variant: 'outline' },
  build_day: { label: 'Build Day', variant: 'default' },
  demo_day: { label: 'Demo Day', variant: 'default' },
  closed: { label: 'Closed', variant: 'secondary' },
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const config = statusConfig[status] || { label: status, variant: 'secondary' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
```

**Step 2: Create event card component**

```typescript
// app/(routes)/startup-studio/events/_components/event-card.tsx
'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Users } from 'lucide-react';
import { EventStatusBadge } from './event-status-badge';
import type { StartupEvent } from '@/types/startup-studio';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'TBD';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function EventCard({ event }: { event: StartupEvent }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg">{event.name}</CardTitle>
          <EventStatusBadge status={event.status} />
        </div>
        {event.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>{formatDate(event.start_date)}</span>
          </div>
          {event.host_institution && (
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>{event.host_institution.name}</span>
            </div>
          )}
        </div>
        {event.registration_deadline && (
          <p className="text-xs text-muted-foreground">
            Registration deadline: {formatDate(event.registration_deadline)}
          </p>
        )}
        <Link href={`/startup-studio/events/${event.id}`}>
          <Button variant="outline" size="sm" className="w-full mt-2">
            View Event
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
```

**Step 3: Create the events list page**

```typescript
// app/(routes)/startup-studio/events/page.tsx
'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useEvents } from '@/hooks/startup-studio/use-events';
import { EventCard } from './_components/event-card';
import { Loader2 } from 'lucide-react';

export default function StartupStudioEventsPage() {
  const { data: events, isLoading, error } = useEvents();

  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio' },
        { label: 'Events' },
      ]} />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Events</h1>
          <p className="text-sm text-muted-foreground">
            Hackathons, competitions, and buildathons across JKKN colleges
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-destructive">
            Failed to load events. Please try again.
          </div>
        )}

        {events && events.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No events found.
          </div>
        )}

        {events && events.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
```

**Step 4: Commit**

```bash
git add app/(routes)/startup-studio/
git commit -m "feat(startup-studio): add events list page with event cards"
```

---

### Task 8: Create Event Detail Page

**Files:**
- Create: `app/(routes)/startup-studio/events/[id]/page.tsx`
- Create: `app/(routes)/startup-studio/events/[id]/_components/event-detail-header.tsx`

**Step 1: Create event detail header component**

```typescript
// app/(routes)/startup-studio/events/[id]/_components/event-detail-header.tsx
'use client';

import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, MapPin, Users } from 'lucide-react';
import { EventStatusBadge } from '../../_components/event-status-badge';
import type { StartupEvent } from '@/types/startup-studio';

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return 'TBD';
  return new Date(dateStr).toLocaleString('en-IN', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

interface EventDetailHeaderProps {
  event: StartupEvent;
  stats?: {
    total_teams: number;
    total_members: number;
    members_with_laptops: number;
    institutions: number;
  } | null;
}

export function EventDetailHeader({ event, stats }: EventDetailHeaderProps) {
  const config = event.config;
  const isRegistrationOpen = event.status === 'registration_open' &&
    event.registration_deadline &&
    new Date(event.registration_deadline) > new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{event.name}</h1>
          {event.description && (
            <p className="text-muted-foreground mt-1">{event.description}</p>
          )}
        </div>
        <EventStatusBadge status={event.status} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="font-medium">Build Day</p>
            <p className="text-muted-foreground">{formatDateTime(event.start_date)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="font-medium">Demo Day</p>
            <p className="text-muted-foreground">{formatDateTime(event.demo_date)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="font-medium">Registration Deadline</p>
            <p className="text-muted-foreground">{formatDateTime(event.registration_deadline)}</p>
          </div>
        </div>
        {stats && (
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium">{stats.total_teams} Teams</p>
              <p className="text-muted-foreground">{stats.total_members} members across {stats.institutions} colleges</p>
            </div>
          </div>
        )}
      </div>

      {config?.categories && config.categories.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Categories</p>
          <div className="flex flex-wrap gap-1">
            {config.categories.map((cat: string) => (
              <Badge key={cat} variant="outline" className="text-xs">{cat}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Create the event detail page**

```typescript
// app/(routes)/startup-studio/events/[id]/page.tsx
'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useEvent, useEventStats } from '@/hooks/startup-studio/use-events';
import { useAuth } from '@/hooks/use-auth';
import { EventDetailHeader } from './_components/event-detail-header';
import { Loader2 } from 'lucide-react';

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: event, isLoading } = useEvent(id);
  const { data: stats } = useEventStats(id);
  const { profile } = useAuth();

  if (isLoading) {
    return (
      <ContentLayout title="Event">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </ContentLayout>
    );
  }

  if (!event) {
    return (
      <ContentLayout title="Event">
        <div className="text-center py-20 text-muted-foreground">
          Event not found.
        </div>
      </ContentLayout>
    );
  }

  const isRegistrationOpen = event.status === 'registration_open' &&
    event.registration_deadline &&
    new Date(event.registration_deadline) > new Date();

  const isAdmin = profile?.is_super_admin || profile?.role === 'admin' || profile?.role === 'administrator';

  return (
    <ContentLayout title={event.name}>
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event.name },
      ]} />

      <div className="space-y-6 mt-4">
        <Card>
          <CardContent className="p-6">
            <EventDetailHeader event={event} stats={stats} />
          </CardContent>
        </Card>

        {/* Student actions */}
        {isRegistrationOpen && (
          <Card>
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Register Your Team</h2>
                <p className="text-sm text-muted-foreground">
                  Team size: up to {event.config?.team_max_size || 5} members
                </p>
              </div>
              <Link href={`/startup-studio/events/${id}/register`}>
                <Button>Register Now</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Admin quick links */}
        {isAdmin && (
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4">Admin Panel</h2>
              <div className="flex flex-wrap gap-2">
                <Link href={`/startup-studio/events/${id}/registrations`}>
                  <Button variant="outline" size="sm">Registrations</Button>
                </Link>
                <Link href={`/startup-studio/events/${id}/venues`}>
                  <Button variant="outline" size="sm">Venues & Mentors</Button>
                </Link>
                <Link href={`/startup-studio/events/${id}/demo-day`}>
                  <Button variant="outline" size="sm">Demo Day</Button>
                </Link>
                <Link href={`/startup-studio/events/${id}/leaderboard`}>
                  <Button variant="outline" size="sm">Leaderboard</Button>
                </Link>
                <Link href={`/startup-studio/events/${id}/checklists`}>
                  <Button variant="outline" size="sm">Checklists</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
```

**Step 3: Commit**

```bash
git add app/(routes)/startup-studio/
git commit -m "feat(startup-studio): add event detail page with stats and admin links"
```

---

## Phase 3: Team Registration + My Team

### Task 9: Create Registration Service

**Files:**
- Create: `lib/services/startup-studio/event-registration-service.ts`

**Step 1: Write the registration service**

```typescript
// lib/services/startup-studio/event-registration-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  EventRegistration,
  CreateRegistrationDto,
  CreateTeamMemberDto,
  EventTeamMember,
  RegistrationFilters,
  ValidationResult,
} from '@/types/startup-studio';

export class EventRegistrationService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  static async validateRegistration(eventId: string, userId: string, members: CreateTeamMemberDto[]): Promise<ValidationResult> {
    // 1. Check event exists and registration is open
    const { data: event, error: eventError } = await this.supabase
      .from('startup_events')
      .select('id, status, registration_deadline, config')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return { valid: false, error: 'Event not found' };
    }
    if (event.status !== 'registration_open') {
      return { valid: false, error: 'Registration is not open for this event' };
    }
    if (event.registration_deadline && new Date(event.registration_deadline) < new Date()) {
      return { valid: false, error: 'Registration deadline has passed' };
    }

    // 2. Check team size
    const maxSize = event.config?.team_max_size || 5;
    if (members.length > maxSize) {
      return { valid: false, error: `Maximum ${maxSize} team members allowed` };
    }

    // 3. Check leader hasn't already registered
    const { data: existing } = await this.supabase
      .from('event_registrations')
      .select('id, team_name')
      .eq('event_id', eventId)
      .eq('owner_id', userId)
      .maybeSingle();

    if (existing) {
      return { valid: false, error: `You already registered team "${existing.team_name}" for this event` };
    }

    // 4. Check members aren't on other teams
    const memberEmails = members.map(m => m.email);
    if (memberEmails.length > 0) {
      const { data: existingMembers } = await this.supabase
        .from('event_team_members')
        .select('email, registration:event_registrations!inner(event_id)')
        .in('email', memberEmails);

      const conflicting = (existingMembers || []).filter(
        (m: any) => m.registration?.event_id === eventId
      );
      if (conflicting.length > 0) {
        const emails = conflicting.map((m: any) => m.email).join(', ');
        return { valid: false, error: `Some members are already registered with another team: ${emails}` };
      }
    }

    return { valid: true };
  }

  static async registerTeam(dto: CreateRegistrationDto, userId: string): Promise<EventRegistration> {
    // Validate first
    const validation = await this.validateRegistration(dto.event_id, userId, dto.members);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Get user profile for institution_id
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', userId)
      .single();

    if (!profile?.institution_id) {
      throw new Error('Your profile is not linked to an institution');
    }

    // Insert registration
    const { data: registration, error: regError } = await this.supabase
      .from('event_registrations')
      .insert({
        event_id: dto.event_id,
        team_name: dto.team_name,
        problem_idea: dto.problem_idea,
        owner_id: userId,
        institution_id: profile.institution_id,
      })
      .select()
      .single();

    if (regError) {
      console.error('[startup/registration] registerTeam insert failed:', regError);
      throw regError;
    }

    // Insert team members
    if (dto.members.length > 0) {
      const membersToInsert = dto.members.map(m => ({
        registration_id: registration.id,
        email: m.email,
        full_name: m.full_name || null,
        student_id: m.student_id || null,
        has_laptop: m.has_laptop || false,
      }));

      const { error: membersError } = await this.supabase
        .from('event_team_members')
        .insert(membersToInsert);

      if (membersError) {
        console.error('[startup/registration] insertMembers failed:', membersError);
        // Don't throw - registration succeeded, members can be added later
      }
    }

    return registration as unknown as EventRegistration;
  }

  static async getRegistrations(filters: RegistrationFilters): Promise<EventRegistration[]> {
    let query = this.supabase
      .from('event_registrations')
      .select(`
        *,
        owner:profiles!event_registrations_owner_id_fkey(id, full_name, email, avatar_url),
        institution:institutions(id, name),
        team_members:event_team_members(id, email, full_name, student_id, has_laptop, profile_id)
      `)
      .eq('event_id', filters.event_id)
      .order('created_at', { ascending: true });

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.checked_in !== undefined) query = query.eq('checked_in', filters.checked_in);
    if (filters.lovable_verified !== undefined) query = query.eq('lovable_verified', filters.lovable_verified);
    if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
    if (filters.search) {
      query = query.or(`team_name.ilike.%${filters.search}%,problem_idea.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[startup/registration] getRegistrations failed:', error);
      throw error;
    }
    return (data || []) as unknown as EventRegistration[];
  }

  static async getMyRegistration(eventId: string, userId: string): Promise<EventRegistration | null> {
    const { data, error } = await this.supabase
      .from('event_registrations')
      .select(`
        *,
        owner:profiles!event_registrations_owner_id_fkey(id, full_name, email),
        institution:institutions(id, name),
        team_members:event_team_members(id, email, full_name, student_id, has_laptop, profile_id),
        venue_allocations:event_team_venue_allocations(
          id, day_type,
          venue_assignment:event_venue_assignments(
            id, manual_name, manual_building, manual_room, day_type, capacity_override,
            resource:resources(id, resource_name, location),
            staff_assignments:event_staff_assignments(
              id, role,
              staff:staff(id, first_name, last_name, email)
            )
          )
        ),
        submission:event_submissions(*)
      `)
      .eq('event_id', eventId)
      .eq('owner_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[startup/registration] getMyRegistration failed:', error);
      throw error;
    }
    return data as unknown as EventRegistration | null;
  }

  static async addMember(registrationId: string, member: CreateTeamMemberDto): Promise<EventTeamMember> {
    const { data, error } = await this.supabase
      .from('event_team_members')
      .insert({
        registration_id: registrationId,
        email: member.email,
        full_name: member.full_name || null,
        student_id: member.student_id || null,
        has_laptop: member.has_laptop || false,
      })
      .select()
      .single();

    if (error) {
      console.error('[startup/registration] addMember failed:', error);
      throw error;
    }
    return data as unknown as EventTeamMember;
  }

  static async removeMember(memberId: string): Promise<void> {
    const { error } = await this.supabase
      .from('event_team_members')
      .delete()
      .eq('id', memberId);

    if (error) {
      console.error('[startup/registration] removeMember failed:', error);
      throw error;
    }
  }

  static async toggleCheckIn(registrationId: string, userId: string, checked_in: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('event_registrations')
      .update({
        checked_in,
        checked_in_at: checked_in ? new Date().toISOString() : null,
        checked_in_by: checked_in ? userId : null,
        status: checked_in ? 'checked_in' : 'registered',
        updated_at: new Date().toISOString(),
      })
      .eq('id', registrationId);

    if (error) {
      console.error('[startup/registration] toggleCheckIn failed:', error);
      throw error;
    }
  }

  static async toggleLovableVerified(registrationId: string, userId: string, verified: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('event_registrations')
      .update({
        lovable_verified: verified,
        lovable_verified_at: verified ? new Date().toISOString() : null,
        lovable_verified_by: verified ? userId : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', registrationId);

    if (error) {
      console.error('[startup/registration] toggleLovableVerified failed:', error);
      throw error;
    }
  }

  static async lookupMemberByEmail(email: string): Promise<{ profile_id: string; full_name: string; student_id?: string } | null> {
    const { data } = await this.supabase
      .from('profiles')
      .select('id, full_name, learner_id')
      .eq('email', email)
      .maybeSingle();

    if (!data) return null;
    return {
      profile_id: data.id,
      full_name: data.full_name || '',
      student_id: data.learner_id || undefined,
    };
  }
}
```

**Step 2: Commit**

```bash
git add lib/services/startup-studio/event-registration-service.ts
git commit -m "feat(startup-studio): add EventRegistrationService with validation, CRUD, check-in"
```

---

### Task 10: Create Registration Hooks

**Files:**
- Create: `hooks/startup-studio/use-event-registrations.ts`

**Step 1: Write the hooks**

```typescript
// hooks/startup-studio/use-event-registrations.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { EventRegistrationService } from '@/lib/services/startup-studio/event-registration-service';
import { useAuth } from '@/hooks/use-auth';
import type { CreateRegistrationDto, CreateTeamMemberDto, RegistrationFilters } from '@/types/startup-studio';

export function useEventRegistrations(filters: RegistrationFilters) {
  return useQuery({
    queryKey: ['event-registrations', filters],
    queryFn: () => EventRegistrationService.getRegistrations(filters),
    staleTime: 15 * 1000,
    retry: 3,
  });
}

export function useMyRegistration(eventId: string | undefined) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['my-registration', eventId, profile?.id],
    queryFn: () => {
      if (!eventId || !profile?.id) return null;
      return EventRegistrationService.getMyRegistration(eventId, profile.id);
    },
    enabled: !!eventId && !!profile?.id,
    staleTime: 15 * 1000,
    retry: 3,
  });
}

export function useRegisterTeam() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: (dto: CreateRegistrationDto) => {
      if (!profile?.id) throw new Error('Not authenticated');
      return EventRegistrationService.registerTeam(dto, profile.id);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      queryClient.invalidateQueries({ queryKey: ['my-registration'] });
      queryClient.invalidateQueries({ queryKey: ['startup-event-stats'] });
      toast.success('Team registered successfully!');
      router.push(`/startup-studio/events/${data.event_id}/my-team`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to register team');
    },
  });
}

export function useToggleCheckIn() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: ({ registrationId, checked_in }: { registrationId: string; checked_in: boolean }) => {
      if (!profile?.id) throw new Error('Not authenticated');
      return EventRegistrationService.toggleCheckIn(registrationId, profile.id, checked_in);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      queryClient.invalidateQueries({ queryKey: ['startup-event-stats'] });
      toast.success('Check-in updated');
    },
    onError: () => toast.error('Failed to update check-in'),
  });
}

export function useToggleLovableVerified() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: ({ registrationId, verified }: { registrationId: string; verified: boolean }) => {
      if (!profile?.id) throw new Error('Not authenticated');
      return EventRegistrationService.toggleLovableVerified(registrationId, profile.id, verified);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      toast.success('Lovable verification updated');
    },
    onError: () => toast.error('Failed to update verification'),
  });
}

export function useAddTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ registrationId, member }: { registrationId: string; member: CreateTeamMemberDto }) => {
      return EventRegistrationService.addMember(registrationId, member);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-registration'] });
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      toast.success('Member added');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to add member'),
  });
}

export function useRemoveTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => EventRegistrationService.removeMember(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-registration'] });
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      toast.success('Member removed');
    },
    onError: () => toast.error('Failed to remove member'),
  });
}
```

**Step 2: Commit**

```bash
git add hooks/startup-studio/use-event-registrations.ts
git commit -m "feat(startup-studio): add registration hooks with mutations and validation"
```

---

### Task 11: Create Team Registration Form Page

**Files:**
- Create: `app/(routes)/startup-studio/events/[id]/register/page.tsx`
- Create: `app/(routes)/startup-studio/events/[id]/register/_components/registration-form.tsx`

**Step 1: Create the registration form component**

```typescript
// app/(routes)/startup-studio/events/[id]/register/_components/registration-form.tsx
'use client';

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { useRegisterTeam } from '@/hooks/startup-studio/use-event-registrations';
import { useAuth } from '@/hooks/use-auth';
import { Plus, Trash2, Laptop, Loader2 } from 'lucide-react';
import type { StartupEvent } from '@/types/startup-studio';

const memberSchema = z.object({
  email: z.string().email('Valid email required'),
  full_name: z.string().optional(),
  student_id: z.string().optional(),
  has_laptop: z.boolean().default(false),
});

const registrationSchema = z.object({
  team_name: z.string().min(2, 'Team name must be at least 2 characters'),
  problem_idea: z.string().min(20, 'Problem idea must be at least 20 characters'),
  members: z.array(memberSchema).min(1, 'Add at least one team member'),
});

type FormValues = z.infer<typeof registrationSchema>;

interface RegistrationFormProps {
  event: StartupEvent;
}

export function RegistrationForm({ event }: RegistrationFormProps) {
  const { profile } = useAuth();
  const registerTeam = useRegisterTeam();
  const maxSize = event.config?.team_max_size || 5;

  const form = useForm<FormValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      team_name: '',
      problem_idea: '',
      members: [
        {
          email: profile?.email || '',
          full_name: profile?.full_name || '',
          student_id: '',
          has_laptop: false,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'members',
  });

  const onSubmit = (values: FormValues) => {
    registerTeam.mutate({
      event_id: event.id,
      team_name: values.team_name,
      problem_idea: values.problem_idea,
      members: values.members,
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Team Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="team_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Team Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Enter your team name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="problem_idea"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Problem / Idea</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="What problem will your team solve? (minimum 20 characters)"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Team Members ({fields.length}/{maxSize})</CardTitle>
              {fields.length < maxSize && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ email: '', full_name: '', student_id: '', has_laptop: false })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Member
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Member {index + 1} {index === 0 && '(You - Team Leader)'}
                  </span>
                  {index > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name={`members.${index}.email`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" placeholder="email@example.com" readOnly={index === 0} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`members.${index}.full_name`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Full name" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`members.${index}.student_id`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Student ID</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. 22CS101" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name={`members.${index}.has_laptop`}
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="!mt-0 flex items-center gap-1">
                        <Laptop className="h-4 w-4" /> Has Laptop
                      </FormLabel>
                    </FormItem>
                  )}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={registerTeam.isPending}
        >
          {registerTeam.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Registering...</>
          ) : (
            'Register Team'
          )}
        </Button>
      </form>
    </Form>
  );
}
```

**Step 2: Create the register page**

```typescript
// app/(routes)/startup-studio/events/[id]/register/page.tsx
'use client';

import { use } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { RegistrationForm } from './_components/registration-form';
import { Loader2 } from 'lucide-react';

export default function RegisterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: event, isLoading } = useEvent(id);

  if (isLoading) {
    return (
      <ContentLayout title="Register">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </ContentLayout>
    );
  }

  if (!event) {
    return (
      <ContentLayout title="Register">
        <div className="text-center py-20 text-muted-foreground">Event not found.</div>
      </ContentLayout>
    );
  }

  const isOpen = event.status === 'registration_open' &&
    event.registration_deadline &&
    new Date(event.registration_deadline) > new Date();

  if (!isOpen) {
    return (
      <ContentLayout title="Register">
        <div className="text-center py-20 text-muted-foreground">
          Registration is closed for this event.
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Register — ${event.name}`}>
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event.name, href: `/startup-studio/events/${id}` },
        { label: 'Register' },
      ]} />

      <div className="space-y-6 mt-4 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold py-1">Register Your Team</h1>
          <p className="text-sm text-muted-foreground">
            Team size: 1-{event.config?.team_max_size || 5} members. At least one member must have a laptop.
          </p>
        </div>
        <RegistrationForm event={event} />
      </div>
    </ContentLayout>
  );
}
```

**Step 3: Commit**

```bash
git add app/(routes)/startup-studio/events/[id]/register/
git commit -m "feat(startup-studio): add team registration page with validation"
```

---

### Task 12: Create My Team Page

**Files:**
- Create: `app/(routes)/startup-studio/events/[id]/my-team/page.tsx`

**Step 1: Write the my-team page**

```typescript
// app/(routes)/startup-studio/events/[id]/my-team/page.tsx
'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useMyRegistration } from '@/hooks/startup-studio/use-event-registrations';
import { CheckCircle2, Clock, Laptop, MapPin, User, Users, Loader2 } from 'lucide-react';

export default function MyTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: event } = useEvent(id);
  const { data: registration, isLoading } = useMyRegistration(id);

  if (isLoading) {
    return (
      <ContentLayout title="My Team">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </ContentLayout>
    );
  }

  if (!registration) {
    return (
      <ContentLayout title="My Team">
        <PageBreadcrumb items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
          { label: 'My Team' },
        ]} />
        <div className="text-center py-20 space-y-4">
          <p className="text-muted-foreground">You haven&apos;t registered a team for this event yet.</p>
          <Link href={`/startup-studio/events/${id}/register`}>
            <Button>Register Now</Button>
          </Link>
        </div>
      </ContentLayout>
    );
  }

  const buildDayVenue = (registration as any).venue_allocations?.find((v: any) => v.day_type === 'build_day');
  const demoDayVenue = (registration as any).venue_allocations?.find((v: any) => v.day_type === 'demo_day');

  return (
    <ContentLayout title="My Team">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
        { label: 'My Team' },
      ]} />

      <div className="space-y-6 mt-4 max-w-3xl">
        {/* Team Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{registration.team_name}</CardTitle>
              <Badge variant={registration.checked_in ? 'default' : 'secondary'}>
                {registration.checked_in ? 'Checked In' : registration.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{registration.problem_idea}</p>
            {registration.lovable_verified && (
              <div className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" /> Lovable Verified
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Members */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Team Members ({registration.team_members?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {registration.team_members?.map((member: any) => (
                <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{member.full_name || member.email}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.student_id && (
                      <Badge variant="outline" className="text-xs">{member.student_id}</Badge>
                    )}
                    {member.has_laptop && (
                      <Badge variant="secondary" className="text-xs">
                        <Laptop className="h-3 w-3 mr-1" /> Laptop
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Venue Assignments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" /> Venue Assignments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {buildDayVenue ? (
              <div className="p-3 border rounded-lg">
                <p className="text-sm font-medium">Build Day</p>
                <p className="text-sm text-muted-foreground">
                  {buildDayVenue.venue_assignment?.resource?.resource_name ||
                   buildDayVenue.venue_assignment?.manual_name || 'Venue assigned'}
                  {buildDayVenue.venue_assignment?.manual_building &&
                    ` — ${buildDayVenue.venue_assignment.manual_building}`}
                  {buildDayVenue.venue_assignment?.manual_room &&
                    `, Room ${buildDayVenue.venue_assignment.manual_room}`}
                </p>
              </div>
            ) : (
              <div className="p-3 border rounded-lg border-dashed">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-4 w-4" /> Build Day venue coming soon
                </p>
              </div>
            )}
            {demoDayVenue ? (
              <div className="p-3 border rounded-lg">
                <p className="text-sm font-medium">Demo Day</p>
                <p className="text-sm text-muted-foreground">
                  {demoDayVenue.venue_assignment?.resource?.resource_name ||
                   demoDayVenue.venue_assignment?.manual_name || 'Venue assigned'}
                </p>
              </div>
            ) : (
              <div className="p-3 border rounded-lg border-dashed">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-4 w-4" /> Demo Day venue coming soon
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Submit link */}
        {event && ['build_day', 'demo_day'].includes(event.status) && (
          <Link href={`/startup-studio/events/${id}/submit`}>
            <Button className="w-full" size="lg">Submit Your Project</Button>
          </Link>
        )}
      </div>
    </ContentLayout>
  );
}
```

**Step 2: Commit**

```bash
git add app/(routes)/startup-studio/events/[id]/my-team/
git commit -m "feat(startup-studio): add My Team page with venue and member display"
```

---

## Phase 4: Admin Registrations Page

### Task 13: Create Admin Registrations Page

**Files:**
- Create: `app/(routes)/startup-studio/events/[id]/registrations/page.tsx`
- Create: `app/(routes)/startup-studio/events/[id]/registrations/_components/registrations-table.tsx`

**Step 1: Create registrations table component**

```typescript
// app/(routes)/startup-studio/events/[id]/registrations/_components/registrations-table.tsx
'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  useEventRegistrations,
  useToggleCheckIn,
  useToggleLovableVerified,
} from '@/hooks/startup-studio/use-event-registrations';
import { CheckCircle2, Laptop, Search, Users, Loader2 } from 'lucide-react';
import type { EventRegistration } from '@/types/startup-studio';

interface RegistrationsTableProps {
  eventId: string;
}

export function RegistrationsTable({ eventId }: RegistrationsTableProps) {
  const [search, setSearch] = useState('');
  const { data: registrations, isLoading } = useEventRegistrations({ event_id: eventId, search });
  const toggleCheckIn = useToggleCheckIn();
  const toggleLovable = useToggleLovableVerified();

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const teams = registrations || [];
  const totalMembers = teams.reduce((sum, t) => sum + (t.team_members?.length || 0), 0);
  const totalLaptops = teams.reduce((sum, t) =>
    sum + (t.team_members?.filter((m: any) => m.has_laptop).length || 0), 0);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold">{teams.length}</p>
          <p className="text-xs text-muted-foreground">Teams</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold">{totalMembers}</p>
          <p className="text-xs text-muted-foreground">Members</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold">{totalLaptops}</p>
          <p className="text-xs text-muted-foreground">Laptops</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold">{teams.filter(t => t.checked_in).length}</p>
          <p className="text-xs text-muted-foreground">Checked In</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search teams..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Leader</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>College</TableHead>
              <TableHead className="text-center">Lovable</TableHead>
              <TableHead className="text-center">Check-in</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((reg, index) => (
              <TableRow key={reg.id}>
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{reg.team_name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{reg.problem_idea}</p>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{reg.owner?.full_name || reg.owner?.email}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-sm">
                    <Users className="h-3 w-3" /> {reg.team_members?.length || 0}
                    <Laptop className="h-3 w-3 ml-2" />
                    {reg.team_members?.filter((m: any) => m.has_laptop).length || 0}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{reg.institution?.name || '-'}</TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={reg.lovable_verified}
                    onCheckedChange={(checked) => {
                      toggleLovable.mutate({
                        registrationId: reg.id,
                        verified: !!checked,
                      });
                    }}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={reg.checked_in}
                    onCheckedChange={(checked) => {
                      toggleCheckIn.mutate({
                        registrationId: reg.id,
                        checked_in: !!checked,
                      });
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
            {teams.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No registrations found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

**Step 2: Create the admin registrations page**

```typescript
// app/(routes)/startup-studio/events/[id]/registrations/page.tsx
'use client';

import { use } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { RegistrationsTable } from './_components/registrations-table';
import { Loader2 } from 'lucide-react';

export default function AdminRegistrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: event, isLoading } = useEvent(id);

  if (isLoading) {
    return (
      <ContentLayout title="Registrations">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </ContentLayout>
    );
  }

  if (!event) {
    return (
      <ContentLayout title="Registrations">
        <div className="text-center py-20 text-muted-foreground">Event not found.</div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Registrations — ${event.name}`}>
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event.name, href: `/startup-studio/events/${id}` },
        { label: 'Registrations' },
      ]} />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Registrations</h1>
          <p className="text-sm text-muted-foreground">
            Manage team registrations, check-in, and Lovable verification
          </p>
        </div>
        <RegistrationsTable eventId={id} />
      </div>
    </ContentLayout>
  );
}
```

**Step 3: Commit**

```bash
git add app/(routes)/startup-studio/events/[id]/registrations/
git commit -m "feat(startup-studio): add admin registrations page with check-in and Lovable toggle"
```

---

## Phase 5-8: Remaining Phases (Abbreviated)

> Phases 5-8 follow identical patterns. Below are the service + page summaries with key code. Each phase uses the same conventions established in Phases 1-4.

### Task 14: Venue Service + Venues Admin Page (Phase 5)

**Files:**
- Create: `lib/services/startup-studio/event-venue-service.ts`
- Create: `hooks/startup-studio/use-event-venues.ts`
- Create: `app/(routes)/startup-studio/events/[id]/venues/page.tsx`
- Create: `app/(routes)/startup-studio/events/[id]/venues/_components/venues-panel.tsx`

Key service methods:
- `addVenue(dto: CreateVenueDto)` — insert into `event_venue_assignments`
- `removeVenue(venueId: string)` — delete from `event_venue_assignments`
- `assignStaff(venueId, staffId, role, dayType)` — insert into `event_staff_assignments`
- `autoAllocateTeams(eventId, dayType)` — match teams to venues by `institution_id`, respecting `capacity_override`
- `manualAllocate(eventId, registrationId, venueAssignmentId, dayType)` — insert into `event_team_venue_allocations`
- `getUnallocatedTeams(eventId, dayType)` — teams without a venue for given day type

Auto-allocate algorithm:
```typescript
static async autoAllocateTeams(eventId: string, dayType: DayType, userId: string) {
  // 1. Get all venues for this event + day_type, grouped by institution_id
  // 2. Get all unallocated registrations for this event + day_type
  // 3. For each registration, find a venue matching institution_id with remaining capacity
  // 4. Insert event_team_venue_allocations
  // 5. Return { allocated: number, unallocated: number }
}
```

Venues page has two tabs: "Build Day" and "Demo Day". Each tab shows venue cards with assigned staff and allocated teams.

---

### Task 15: Submission Service + Submit Page (Phase 6)

**Files:**
- Create: `lib/services/startup-studio/event-submission-service.ts`
- Create: `hooks/startup-studio/use-event-submissions.ts`
- Create: `app/(routes)/startup-studio/events/[id]/submit/page.tsx`
- Create: `app/(routes)/startup-studio/events/[id]/my-assignment/page.tsx`

Key service methods:
- `createSubmission(dto: SubmitProjectDto, userId)` — validates `now() < submission_deadline`, inserts `event_submissions`
- `updateSubmission(submissionId, dto)` — validates deadline, updates phase 1 fields
- `updateMetrics(submissionId, dto: UpdateMetricsDto)` — validates `now() < metrics_deadline`, updates phase 2 fields, calls `calculateScore()`
- `calculateScore(metrics, config)` — tier logic + MRR bonus (see design doc scoring section)

Scoring logic:
```typescript
static calculateScore(submission: { mrr_amount: number; paying_users_count: number; user_count: number; live_app_url: string | null }, config: EventConfig): ScoringResult {
  let tier_level = 0;
  if (submission.live_app_url) tier_level = 1;
  if (submission.user_count >= 5) tier_level = 2;
  if (submission.user_count >= 10) tier_level = 3;
  if (submission.mrr_amount > 0) tier_level = 4;
  if (submission.mrr_amount >= 100 || submission.paying_users_count >= 5) tier_level = 5;

  const tier_points = config.tier_points?.[tier_level] ?? tier_level * 10;

  let mrr_bonus_points = 0;
  if (tier_level >= 4) {
    const bracket = config.mrr_bonus_brackets?.find(
      b => submission.mrr_amount >= b.min && (b.max === null || submission.mrr_amount <= b.max)
    );
    mrr_bonus_points = bracket?.points ?? 0;
  }

  return { tier_level, tier_points, mrr_bonus_points, total_score: tier_points + mrr_bonus_points };
}
```

Submit page shows two sections:
1. **Project Details** (phase 1) — app name, GitHub URL, live URL, description, category dropdown
2. **Metrics** (phase 2) — MRR amount, paying users, user count, proof URLs

Each section shows a lock icon + disabled state after its respective deadline.

My Assignment page (for mentors): shows venue info, list of assigned teams with their problem ideas.

---

### Task 16: Leaderboard Service + Leaderboard + Demo Day Pages (Phase 7)

**Files:**
- Create: `lib/services/startup-studio/event-leaderboard-service.ts`
- Create: `hooks/startup-studio/use-event-leaderboard.ts`
- Create: `app/(routes)/startup-studio/events/[id]/leaderboard/page.tsx`
- Create: `app/(routes)/startup-studio/events/[id]/leaderboard/_components/leaderboard-table.tsx`
- Create: `app/(routes)/startup-studio/events/[id]/leaderboard/_components/mrr-verification-queue.tsx`
- Create: `app/(routes)/startup-studio/events/[id]/demo-day/page.tsx`

Key service methods:
- `getLeaderboard(eventId)` — joins `event_submissions` + `event_registrations`, orders by `total_score DESC, mrr_amount DESC, submitted_at ASC`
- `publishResults(eventId)` — sets `startup_events.is_results_published = true`
- `getMrrVerificationQueue(eventId)` — submissions where `tier_level >= 4 AND mrr_verified = false`, sorted by `mrr_amount DESC`
- `verifyMrr(submissionId, userId)` — sets `mrr_verified = true`
- `rejectMrr(submissionId, reason, userId)` — sets `mrr_verified = false, mrr_rejected_reason`

Leaderboard page:
- Admin always sees live rankings
- Students see "Results coming soon" until `is_results_published = true`
- Top 3 get gold/silver/bronze styling
- Filter by category dropdown
- "Publish Results" button (admin only)
- MRR Verification Queue tab (admin only)

Demo Day page:
- "Generate Slots" button: set start time, duration, room name, count
- Table of slots with dropdown to assign teams
- Each slot shows: order, time, room, team name (or "Unassigned")

---

### Task 17: Checklist Service + Checklists Page (Phase 8)

**Files:**
- Create: `lib/services/startup-studio/event-checklist-service.ts`
- Create: `app/(routes)/startup-studio/events/[id]/checklists/page.tsx`

Key service methods:
- `seedChecklists(eventId, checklists[])` — batch insert checklists + items
- `getChecklists(eventId, targetRole?)` — returns checklists with items and completion status
- `completeItem(checklistItemId, userId, registrationId?, staffAssignmentId?)` — insert completion

Checklists page: Grouped by phase (Pre-Event, On Day, Post-Event) with checkboxes. Each role sees only their checklists.

---

### Task 18: Update Sidebar Navigation (Phase 8)

**Files:**
- Modify: `lib/sidebarMenuLink.ts`

Add a new "Startup Studio" group with `Rocket` icon before the System Management group. Menu items:
- Events (all roles): `/startup-studio/events`

Add these permission keys to `MENU_PERMISSIONS`:
```typescript
'/startup-studio/events': 'startup_studio.events.view',
```

---

### Task 19: Seed Appathon 2.0 Event Data

**Files:**
- Run via Supabase SQL Editor (not committed)

```sql
INSERT INTO startup_events (id, name, description, status, start_date, end_date, demo_date,
  registration_deadline, submission_deadline, metrics_deadline, config, created_by)
VALUES (
  '572a5836-58a6-4f98-a3f4-92b862dd8080',
  'She Builds — JKKN Appathon 2.0',
  'Women''s Day Special Hackathon. Build a real product with real users and revenue in 24 hours.',
  'registration_open',
  '2026-03-08T09:00:00+05:30',
  '2026-03-08T17:00:00+05:30',
  '2026-03-09T09:00:00+05:30',
  '2026-03-06T23:59:00+05:30',
  '2026-03-08T18:00:00+05:30',
  '2026-03-09T09:00:00+05:30',
  '{
    "team_max_size": 5,
    "categories": ["Education", "Healthcare", "Agriculture", "Sustainability", "Finance", "Social Impact", "Productivity", "Entertainment", "Other"],
    "tools": ["Lovable", "Anthropic API"],
    "scoring_type": "tiered",
    "tier_points": {"0": 0, "1": 10, "2": 20, "3": 30, "4": 40, "5": 50},
    "mrr_bonus_brackets": [
      {"min": 1, "max": 99, "points": 5},
      {"min": 100, "max": 499, "points": 10},
      {"min": 500, "max": 999, "points": 15},
      {"min": 1000, "max": null, "points": 20}
    ]
  }'::jsonb,
  NULL
);
```

---

## Verification Checklist

After each phase, verify:

- [ ] **Phase 1:** Run `SELECT count(*) FROM startup_events` — should return at least 1
- [ ] **Phase 2:** Navigate to `/startup-studio/events` — should show Appathon 2.0 card
- [ ] **Phase 3:** Click "Register Now" — form loads, submit creates team, redirects to My Team
- [ ] **Phase 4:** Navigate to `/startup-studio/events/[id]/registrations` — shows all teams with toggles
- [ ] **Phase 5:** Add a manual venue, assign staff, auto-allocate teams — verify allocations
- [ ] **Phase 6:** Submit a project, update metrics — verify scoring calculated
- [ ] **Phase 7:** Leaderboard shows ranked teams, Publish Results makes visible to students
- [ ] **Phase 8:** Sidebar shows "Startup Studio" group, checklists work per role

---

## File Summary

| Phase | New Files | Modified Files |
|-------|-----------|----------------|
| 1 | `types/startup-studio.ts` | `supabase/setup/01_tables.sql`, `03_policies.sql`, `SQL_FILE_INDEX.md` |
| 2 | `lib/services/startup-studio/event-service.ts`, `hooks/startup-studio/use-events.ts`, 3 page/component files | — |
| 3 | `lib/services/startup-studio/event-registration-service.ts`, `hooks/startup-studio/use-event-registrations.ts`, 3 page/component files | — |
| 4 | 2 page/component files | — |
| 5 | `lib/services/startup-studio/event-venue-service.ts`, `hooks/startup-studio/use-event-venues.ts`, 3 page/component files | — |
| 6 | `lib/services/startup-studio/event-submission-service.ts`, `hooks/startup-studio/use-event-submissions.ts`, 2 page files | — |
| 7 | `lib/services/startup-studio/event-leaderboard-service.ts`, `hooks/startup-studio/use-event-leaderboard.ts`, 4 page/component files | — |
| 8 | `lib/services/startup-studio/event-checklist-service.ts`, 1 page file | `lib/sidebarMenuLink.ts` |
| **Total** | **~30 new files** | **4 modified files** |
