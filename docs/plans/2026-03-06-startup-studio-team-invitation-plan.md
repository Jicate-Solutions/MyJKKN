# Startup Studio — Team Invitation & Smart Member Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the email-based instant team member assignment with an invitation/acceptance workflow, auto-generate institution-wise team codes, and add a hierarchical learner-profile search for adding members.

**Architecture:** Approach B — extend `event_team_members` with a `status` column (`pending` / `accepted` / `declined`) and add `learner_id` for validated student linking. Add `team_code` to `event_registrations` with a Postgres function to generate it. New `StudentSearchService` queries `learners_profiles` with cascading filters. My Team page becomes the hub for both sending invitations (team leader) and responding to them (team members).

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (Postgres), React Query v5, react-hook-form + Zod, shadcn/ui (Dialog, Select, Table, Badge), lucide-react, Tailwind CSS.

---

## Phase 1: Database Migration

### Task 1: Extend Tables + Add DB Function

**Files:**
- Modify: `supabase/setup/01_tables.sql` (append to startup studio section)
- Modify: `supabase/setup/02_functions.sql` (append new function)

**Step 1: Apply the migration via Supabase MCP**

Run the following SQL exactly (split into two calls if needed):

```sql
-- =====================================================
-- STARTUP STUDIO: Team Invitation & Smart Member Search
-- Updated: 2026-03-06
-- =====================================================

-- 1. Add team_code to event_registrations
ALTER TABLE event_registrations
  ADD COLUMN IF NOT EXISTS team_code TEXT;

-- Make team_code unique per event (not globally unique)
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_registrations_team_code
  ON event_registrations(event_id, team_code)
  WHERE team_code IS NOT NULL;

-- 2. Extend event_team_members for invitation workflow
ALTER TABLE event_team_members
  ADD COLUMN IF NOT EXISTS learner_id UUID REFERENCES learners_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('pending', 'accepted', 'declined', 'removed')),
  ADD COLUMN IF NOT EXISTS is_leader BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

-- 3. Index for fast pending-invitation lookups by profile
CREATE INDEX IF NOT EXISTS idx_event_team_members_profile_status
  ON event_team_members(profile_id, status)
  WHERE profile_id IS NOT NULL;

-- 4. Index for invitation lookups by registration
CREATE INDEX IF NOT EXISTS idx_event_team_members_registration_status
  ON event_team_members(registration_id, status);
```

**Step 2: Add the generate_team_code function**

```sql
-- =====================================================
-- FUNCTION: generate_team_code
-- Generates a unique team code like "JKKN-001" per event per institution
-- =====================================================
CREATE OR REPLACE FUNCTION generate_team_code(p_event_id UUID, p_institution_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_inst_prefix TEXT;
  v_seq         INT;
  v_code        TEXT;
BEGIN
  -- Use counselling_code if available, else first 4 chars of institution name
  SELECT UPPER(COALESCE(
    NULLIF(TRIM(counselling_code), ''),
    SUBSTRING(name FROM 1 FOR 4)
  ))
  INTO v_inst_prefix
  FROM institutions
  WHERE id = p_institution_id;

  IF v_inst_prefix IS NULL THEN
    v_inst_prefix := 'TEAM';
  END IF;

  -- Count existing registrations for this institution+event to derive sequence
  SELECT COUNT(*) + 1
  INTO v_seq
  FROM event_registrations
  WHERE event_id = p_event_id
    AND institution_id = p_institution_id;

  v_code := v_inst_prefix || '-' || LPAD(v_seq::TEXT, 3, '0');
  RETURN v_code;
END;
$$;
```

**Step 3: Update `supabase/setup/01_tables.sql`**

Find the comment `-- END OF TABLE DEFINITIONS` (near the bottom). Just above it, append:

```sql
-- Updated: 2026-03-06 - Team invitation workflow
-- event_registrations: added team_code TEXT (institution-wise auto-generated)
-- event_team_members:  added learner_id UUID, status TEXT, is_leader BOOLEAN, responded_at TIMESTAMPTZ
```

**Step 4: Update `supabase/setup/02_functions.sql`**

Append the `generate_team_code` function block (from Step 2) before the final comment `-- END OF FUNCTIONS`.

**Step 5: Commit**

```bash
git add supabase/setup/01_tables.sql supabase/setup/02_functions.sql
git commit -m "feat(startup-studio): extend team members for invitation workflow + team_code"
```

---

## Phase 2: TypeScript Types

### Task 2: Update Type Definitions

**Files:**
- Modify: `types/startup-studio.ts`

**Step 1: Add new types — replace/extend existing `EventTeamMember`, `CreateTeamMemberDto`, and add new types**

Find the existing `EventTeamMember` interface (line 72) and replace it:

```typescript
// Before (remove this):
export interface EventTeamMember {
  id: string;
  registration_id: string;
  profile_id: string | null;
  email: string;
  full_name: string | null;
  student_id: string | null;
  has_laptop: boolean;
  added_at: string;
  profile?: any;
}
```

```typescript
// After (replace with):
export type TeamMemberStatus = 'pending' | 'accepted' | 'declined' | 'removed';

export interface EventTeamMember {
  id: string;
  registration_id: string;
  profile_id: string | null;
  learner_id: string | null;
  email: string;
  full_name: string | null;
  student_id: string | null;
  has_laptop: boolean;
  is_leader: boolean;
  status: TeamMemberStatus;
  added_at: string;
  responded_at: string | null;
  profile?: any;
  learner?: any;
}
```

Find `EventRegistration` interface (line 48) and add `team_code` field after `team_name`:

```typescript
// Add this line after team_name:
  team_code: string | null;
```

Find `CreateTeamMemberDto` interface (line 225) and replace it:

```typescript
// Before:
export interface CreateTeamMemberDto {
  email: string;
  full_name?: string;
  student_id?: string;
  has_laptop?: boolean;
}

// After:
export interface CreateTeamMemberDto {
  learner_id: string;          // learners_profiles.id
  profile_id?: string | null;  // profiles.id (resolved from learner_id)
  email: string;
  full_name?: string;
  student_id?: string;         // roll_number from learners_profiles
  has_laptop?: boolean;
}
```

Append these new types at the end of the file (before the last line):

```typescript
// -- Student Search --

export interface StudentSearchFilters {
  event_id: string;
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  search?: string; // name or roll_number
}

export interface StudentSearchResult {
  learner_id: string;
  profile_id: string | null;
  first_name: string;
  last_name: string | null;
  student_email: string;
  roll_number: string | null;
  institution_name: string | null;
  institution_id: string | null;
  degree_name: string | null;
  department_name: string | null;
  program_name: string | null;
  semester_name: string | null;
}

// -- Pending Invitation View --

export interface PendingInvitation {
  member_id: string;          // event_team_members.id
  registration_id: string;
  team_name: string;
  team_code: string | null;
  event_id: string;
  event_name: string;
  invited_at: string;
  invited_by_name: string | null;
}
```

**Step 2: Commit**

```bash
git add types/startup-studio.ts
git commit -m "feat(startup-studio): update types for invitation workflow and student search"
```

---

## Phase 3: Service Layer

### Task 3: New StudentSearchService

**Files:**
- Create: `lib/services/startup-studio/student-search-service.ts`

**Step 1: Create the file with this exact content**

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { StudentSearchFilters, StudentSearchResult } from '@/types/startup-studio';

export class StudentSearchService {
  private static get supabase(): any {
    return createClientSupabaseClient();
  }

  /**
   * Search learners_profiles with cascading hierarchy filters.
   * Returns students with their auth profile_id resolved via profiles.learner_id.
   * Two-step: (1) fetch matching learners, (2) resolve profile_ids.
   */
  static async searchStudents(filters: StudentSearchFilters): Promise<StudentSearchResult[]> {
    // Step 1: Build learners query with hierarchy filters
    let query = this.supabase
      .from('learners_profiles')
      .select(`
        id,
        first_name,
        last_name,
        student_email,
        roll_number,
        institution_id,
        degree_id,
        department_id,
        program_id,
        semester_id,
        institution:institutions(id, name),
        degree:degrees(id, degree_name),
        department:departments(id, department_name),
        program:programs(id, program_name),
        semester:semesters(id, semester_name)
      `)
      .eq('lifecycle_status', 'active')
      .order('first_name', { ascending: true })
      .limit(100);

    if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
    if (filters.degree_id)      query = query.eq('degree_id', filters.degree_id);
    if (filters.department_id)  query = query.eq('department_id', filters.department_id);
    if (filters.program_id)     query = query.eq('program_id', filters.program_id);
    if (filters.semester_id)    query = query.eq('semester_id', filters.semester_id);

    if (filters.search) {
      const s = `%${filters.search}%`;
      query = query.or(`first_name.ilike.${s},last_name.ilike.${s},roll_number.ilike.${s}`);
    }

    const { data: learners, error } = await query;
    if (error) {
      console.error('[startup/student-search] searchStudents failed:', error);
      throw error;
    }
    if (!learners || learners.length === 0) return [];

    // Step 2: Resolve auth profile_ids for these learners
    const learnerIds = learners.map((l: any) => l.id);
    const { data: profileLinks } = await this.supabase
      .from('profiles')
      .select('id, learner_id')
      .in('learner_id', learnerIds);

    const profileMap: Record<string, string> = {};
    (profileLinks || []).forEach((p: any) => {
      if (p.learner_id) profileMap[p.learner_id] = p.id;
    });

    // Step 3: Exclude students already accepted in a team for this event
    const excludedProfileIds = await this.getAlreadyTeamedProfileIds(filters.event_id);

    return learners
      .filter((l: any) => {
        const pid = profileMap[l.id];
        return !pid || !excludedProfileIds.has(pid);
      })
      .map((l: any) => ({
        learner_id: l.id,
        profile_id: profileMap[l.id] || null,
        first_name: l.first_name,
        last_name: l.last_name,
        student_email: l.student_email,
        roll_number: l.roll_number,
        institution_id: l.institution_id,
        institution_name: l.institution?.name || null,
        degree_name: l.degree?.degree_name || null,
        department_name: l.department?.department_name || null,
        program_name: l.program?.program_name || null,
        semester_name: l.semester?.semester_name || null,
      })) as StudentSearchResult[];
  }

  /**
   * Returns a Set of profile_ids that are already accepted members
   * (or owners) of any team for the given event.
   */
  private static async getAlreadyTeamedProfileIds(eventId: string): Promise<Set<string>> {
    const result = new Set<string>();

    // Accepted members
    const { data: accepted } = await this.supabase
      .from('event_team_members')
      .select('profile_id, registration:event_registrations!inner(event_id)')
      .eq('event_registrations.event_id', eventId)
      .eq('status', 'accepted')
      .not('profile_id', 'is', null);

    (accepted || []).forEach((m: any) => {
      if (m.profile_id) result.add(m.profile_id);
    });

    // Team owners
    const { data: owners } = await this.supabase
      .from('event_registrations')
      .select('owner_id')
      .eq('event_id', eventId);

    (owners || []).forEach((r: any) => result.add(r.owner_id));

    return result;
  }

  /**
   * Load cascading dropdown options for the search filters.
   * Each level filters based on the level above.
   */
  static async getFilterOptions(filters: {
    institution_id?: string;
    degree_id?: string;
    department_id?: string;
    program_id?: string;
  }) {
    const [institutions, degrees, departments, programs, semesters] = await Promise.all([
      // Institutions — always load all
      this.supabase
        .from('institutions')
        .select('id, name')
        .eq('is_active', true)
        .order('name'),

      // Degrees — filter by institution if set
      filters.institution_id
        ? this.supabase
            .from('degrees')
            .select('id, degree_name')
            .eq('institution_id', filters.institution_id)
            .eq('is_active', true)
            .order('degree_order')
        : { data: [] },

      // Departments — filter by institution + degree if set
      filters.institution_id && filters.degree_id
        ? this.supabase
            .from('departments')
            .select('id, department_name')
            .eq('institution_id', filters.institution_id)
            .eq('degree_id', filters.degree_id)
            .eq('is_active', true)
            .order('department_order')
        : { data: [] },

      // Programs — filter by dept if set
      filters.department_id
        ? this.supabase
            .from('programs')
            .select('id, program_name')
            .eq('department_id', filters.department_id)
            .eq('is_active', true)
            .order('program_name')
        : { data: [] },

      // Semesters — filter by program if set
      filters.program_id
        ? this.supabase
            .from('semesters')
            .select('id, semester_name, semester_code')
            .eq('program_id', filters.program_id)
            .eq('is_active', true)
            .order('semester_name')
        : { data: [] },
    ]);

    return {
      institutions: (institutions.data || []) as Array<{ id: string; name: string }>,
      degrees: (degrees.data || []) as Array<{ id: string; degree_name: string }>,
      departments: (departments.data || []) as Array<{ id: string; department_name: string }>,
      programs: (programs.data || []) as Array<{ id: string; program_name: string }>,
      semesters: (semesters.data || []) as Array<{ id: string; semester_name: string; semester_code: string }>,
    };
  }
}
```

**Step 2: Commit**

```bash
git add lib/services/startup-studio/student-search-service.ts
git commit -m "feat(startup-studio): add StudentSearchService with cascading hierarchy filters"
```

---

### Task 4: Update EventRegistrationService

**Files:**
- Modify: `lib/services/startup-studio/event-registration-service.ts`

**Step 1: Replace `validateRegistration` to check one-team rule for leader**

Find the existing `validateRegistration` method (lines 18–68) and replace the member-email duplicate check (lines 51–65) with a leader one-team check. The new method:

```typescript
static async validateRegistration(eventId: string, userId: string): Promise<ValidationResult> {
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

  // Check if leader already has a team for this event (as owner)
  const { data: existingOwner } = await this.supabase
    .from('event_registrations')
    .select('id, team_name')
    .eq('event_id', eventId)
    .eq('owner_id', userId)
    .maybeSingle();

  if (existingOwner) {
    return { valid: false, error: `You already registered team "${existingOwner.team_name}" for this event` };
  }

  // Check if user is already an accepted member of another team for this event
  const { data: existingMember } = await this.supabase
    .from('event_team_members')
    .select('id, registration:event_registrations!inner(event_id, team_name)')
    .eq('profile_id', userId)
    .eq('status', 'accepted')
    .maybeSingle();

  if (existingMember && (existingMember as any).registration?.event_id === eventId) {
    return { valid: false, error: `You are already a member of another team for this event` };
  }

  return { valid: true };
}
```

**Step 2: Replace `registerTeam` to generate team_code and auto-add leader as member**

Find `registerTeam` (lines 70–136) and replace entirely:

```typescript
static async registerTeam(dto: CreateRegistrationDto, userId: string): Promise<EventRegistration> {
  const validation = await this.validateRegistration(dto.event_id, userId);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const { data: profile } = await this.supabase
    .from('profiles')
    .select('institution_id, is_super_admin, role, email, full_name, learner_id')
    .eq('id', userId)
    .single();

  let institutionId = profile?.institution_id || dto.institution_id;
  if (!institutionId) {
    const isSuperAdmin = profile?.is_super_admin || ['super_admin', 'admin', 'administrator'].includes(profile?.role);
    if (isSuperAdmin) {
      const { data: firstInst } = await this.supabase
        .from('institutions')
        .select('id')
        .limit(1)
        .single();
      institutionId = firstInst?.id;
    }
    if (!institutionId) {
      throw new Error('Your profile is not linked to an institution');
    }
  }

  // Generate institution-wise team code via DB function
  const { data: codeResult, error: codeError } = await this.supabase
    .rpc('generate_team_code', { p_event_id: dto.event_id, p_institution_id: institutionId });

  if (codeError) {
    console.error('[startup/registration] generate_team_code failed:', codeError);
  }

  const { data: registration, error: regError } = await this.supabase
    .from('event_registrations')
    .insert({
      event_id: dto.event_id,
      team_name: dto.team_name,
      team_code: codeResult || null,
      problem_idea: dto.problem_idea,
      owner_id: userId,
      institution_id: institutionId,
    })
    .select()
    .single();

  if (regError) {
    console.error('[startup/registration] registerTeam insert failed:', regError);
    throw regError;
  }

  // Auto-add team leader as accepted member with is_leader=true
  const leaderMember: any = {
    registration_id: registration.id,
    profile_id: userId,
    learner_id: profile?.learner_id || null,
    email: profile?.email || '',
    full_name: profile?.full_name || null,
    has_laptop: false,
    status: 'accepted',
    is_leader: true,
  };

  const { error: leaderError } = await this.supabase
    .from('event_team_members')
    .insert(leaderMember);

  if (leaderError) {
    console.error('[startup/registration] auto-add leader failed:', leaderError);
  }

  return registration as unknown as EventRegistration;
}
```

**Step 3: Add `inviteMember` method — replace the old `addMember`**

Find `addMember` (lines 242–260) and replace with these two methods:

```typescript
/**
 * Team leader invites a student (by learner_id) to the team.
 * Creates a 'pending' entry in event_team_members.
 * The invitee must accept via respondToInvitation().
 */
static async inviteMember(
  registrationId: string,
  eventId: string,
  student: { learner_id: string; profile_id: string | null; email: string; full_name?: string; roll_number?: string },
  invitedByProfileId: string
): Promise<EventTeamMember> {
  // Validate team size limit
  const { data: reg } = await this.supabase
    .from('event_registrations')
    .select('id, event:startup_events(config), team_members:event_team_members(id, status)')
    .eq('id', registrationId)
    .single();

  const maxSize: number = (reg as any)?.event?.config?.team_max_size || 5;
  const acceptedCount = ((reg as any)?.team_members || []).filter(
    (m: any) => m.status === 'accepted' || m.status === 'pending'
  ).length;
  if (acceptedCount >= maxSize) {
    throw new Error(`Team is full (max ${maxSize} members including leader)`);
  }

  // Validate invitee is not already in another team for this event
  if (student.profile_id) {
    const { data: existingOwner } = await this.supabase
      .from('event_registrations')
      .select('id, team_name')
      .eq('event_id', eventId)
      .eq('owner_id', student.profile_id)
      .maybeSingle();

    if (existingOwner) {
      throw new Error(`This student is already a team leader for "${(existingOwner as any).team_name}"`);
    }

    const { data: existingMember } = await this.supabase
      .from('event_team_members')
      .select('id, status, registration:event_registrations!inner(event_id)')
      .eq('profile_id', student.profile_id)
      .in('status', ['pending', 'accepted'])
      .maybeSingle();

    if (existingMember && (existingMember as any).registration?.event_id === eventId) {
      const memberStatus = (existingMember as any).status;
      throw new Error(
        memberStatus === 'accepted'
          ? 'This student is already in another team for this event'
          : 'This student already has a pending invitation for this event'
      );
    }
  }

  // Check not already invited to THIS team
  const { data: alreadyInvited } = await this.supabase
    .from('event_team_members')
    .select('id, status')
    .eq('registration_id', registrationId)
    .eq('learner_id', student.learner_id)
    .maybeSingle();

  if (alreadyInvited) {
    throw new Error('This student has already been invited to your team');
  }

  const { data, error } = await this.supabase
    .from('event_team_members')
    .insert({
      registration_id: registrationId,
      profile_id: student.profile_id,
      learner_id: student.learner_id,
      email: student.email,
      full_name: student.full_name || null,
      student_id: student.roll_number || null,
      has_laptop: false,
      status: 'pending',
      is_leader: false,
    })
    .select()
    .single();

  if (error) {
    console.error('[startup/registration] inviteMember failed:', error);
    throw error;
  }
  return data as unknown as EventTeamMember;
}

/**
 * Invitee accepts or declines a team invitation.
 * On accept: validates one-team rule, sets status='accepted'.
 * On decline: sets status='declined'.
 */
static async respondToInvitation(
  memberId: string,
  profileId: string,
  accept: boolean
): Promise<void> {
  // Verify this invitation belongs to this profile
  const { data: member, error: fetchError } = await this.supabase
    .from('event_team_members')
    .select('id, status, profile_id, registration:event_registrations!inner(event_id, team_name)')
    .eq('id', memberId)
    .single();

  if (fetchError || !member) {
    throw new Error('Invitation not found');
  }
  if ((member as any).profile_id !== profileId) {
    throw new Error('This invitation does not belong to you');
  }
  if ((member as any).status !== 'pending') {
    throw new Error('This invitation has already been responded to');
  }

  if (accept) {
    // One-team rule: make sure invitee hasn't joined another team since the invite was sent
    const eventId = (member as any).registration?.event_id;
    const { data: alreadyOwner } = await this.supabase
      .from('event_registrations')
      .select('id')
      .eq('event_id', eventId)
      .eq('owner_id', profileId)
      .maybeSingle();

    if (alreadyOwner) {
      throw new Error('You are already a team leader for this event');
    }

    const { data: alreadyMember } = await this.supabase
      .from('event_team_members')
      .select('id, registration:event_registrations!inner(event_id)')
      .eq('profile_id', profileId)
      .eq('status', 'accepted')
      .neq('id', memberId)
      .maybeSingle();

    if (alreadyMember && (alreadyMember as any).registration?.event_id === eventId) {
      throw new Error('You are already part of another team for this event');
    }
  }

  const { error: updateError } = await this.supabase
    .from('event_team_members')
    .update({
      status: accept ? 'accepted' : 'declined',
      responded_at: new Date().toISOString(),
    })
    .eq('id', memberId);

  if (updateError) {
    console.error('[startup/registration] respondToInvitation failed:', updateError);
    throw updateError;
  }
}

/**
 * Returns all pending invitations for a given profile across all events.
 */
static async getMyPendingInvitations(profileId: string): Promise<import('@/types/startup-studio').PendingInvitation[]> {
  const { data, error } = await this.supabase
    .from('event_team_members')
    .select(`
      id,
      added_at,
      registration:event_registrations!inner(
        id,
        team_name,
        team_code,
        event_id,
        owner:profiles!event_registrations_owner_id_fkey(full_name),
        event:startup_events!inner(id, name)
      )
    `)
    .eq('profile_id', profileId)
    .eq('status', 'pending')
    .order('added_at', { ascending: false });

  if (error) {
    console.error('[startup/registration] getMyPendingInvitations failed:', error);
    throw error;
  }

  return ((data || []) as any[]).map((m) => ({
    member_id: m.id,
    registration_id: m.registration?.id,
    team_name: m.registration?.team_name,
    team_code: m.registration?.team_code,
    event_id: m.registration?.event?.id,
    event_name: m.registration?.event?.name,
    invited_at: m.added_at,
    invited_by_name: m.registration?.owner?.full_name || null,
  }));
}
```

**Step 4: Update `getMyRegistration` to include new fields**

Find `getMyRegistration` (lines 210–240) and update the select for `team_members`:

```typescript
// Change this line:
team_members:event_team_members(id, email, full_name, student_id, has_laptop, profile_id)

// To:
team_members:event_team_members(id, email, full_name, student_id, has_laptop, profile_id, learner_id, status, is_leader, responded_at)
```

Also add `team_code` to the registration select at the `*`:

The `*` wildcard already covers it — no change needed.

**Step 5: Remove old `addMember` method** (it has been replaced by `inviteMember` above)

Delete the old `addMember` method block (lines 242–260 in the original file).

**Step 6: Commit**

```bash
git add lib/services/startup-studio/event-registration-service.ts
git commit -m "feat(startup-studio): invitation workflow — inviteMember, respondToInvitation, getMyPendingInvitations"
```

---

## Phase 4: React Query Hooks

### Task 5: Update Hooks

**Files:**
- Modify: `hooks/startup-studio/use-event-registrations.ts`

**Step 1: Add new imports at top**

Add to existing imports:
```typescript
import { StudentSearchService } from '@/lib/services/startup-studio/student-search-service';
import type { StudentSearchFilters, CreateTeamMemberDto } from '@/types/startup-studio';
```

**Step 2: Remove `useAddTeamMember` hook (replaced by `useInviteMember`)**

Delete the entire `useAddTeamMember` function.

**Step 3: Add new hooks at end of file**

```typescript
export function useStudentSearch(filters: StudentSearchFilters & { enabled?: boolean }) {
  const { enabled = true, ...searchFilters } = filters;
  return useQuery({
    queryKey: ['student-search', searchFilters],
    queryFn: () => StudentSearchService.searchStudents(searchFilters),
    enabled: enabled && !!searchFilters.event_id && !!searchFilters.institution_id,
    staleTime: 30 * 1000,
    retry: 1,
  });
}

export function useStudentSearchFilterOptions(filters: {
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
}) {
  return useQuery({
    queryKey: ['student-search-filter-options', filters],
    queryFn: () => StudentSearchService.getFilterOptions(filters),
    staleTime: 60 * 1000,
    retry: 1,
  });
}

export function useInviteTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      registrationId,
      eventId,
      student,
      invitedByProfileId,
    }: {
      registrationId: string;
      eventId: string;
      student: Parameters<typeof EventRegistrationService.inviteMember>[2];
      invitedByProfileId: string;
    }) => EventRegistrationService.inviteMember(registrationId, eventId, student, invitedByProfileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-registration'] });
      queryClient.invalidateQueries({ queryKey: ['student-search'] });
      toast.success('Invitation sent!');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to send invitation'),
  });
}

export function useRespondToInvitation() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: ({ memberId, accept }: { memberId: string; accept: boolean }) => {
      if (!profile?.id) throw new Error('Not authenticated');
      return EventRegistrationService.respondToInvitation(memberId, profile.id, accept);
    },
    onSuccess: (_, { accept }) => {
      queryClient.invalidateQueries({ queryKey: ['my-pending-invitations'] });
      queryClient.invalidateQueries({ queryKey: ['my-registration'] });
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      toast.success(accept ? 'You joined the team!' : 'Invitation declined');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to respond to invitation'),
  });
}

export function useMyPendingInvitations() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['my-pending-invitations', profile?.id],
    queryFn: () => {
      if (!profile?.id) return [];
      return EventRegistrationService.getMyPendingInvitations(profile.id);
    },
    enabled: !!profile?.id,
    staleTime: 15 * 1000,
    retry: 2,
  });
}
```

**Step 4: Commit**

```bash
git add hooks/startup-studio/use-event-registrations.ts
git commit -m "feat(startup-studio): add invitation hooks — useInviteMember, useRespondToInvitation, useMyPendingInvitations"
```

---

## Phase 5: UI Components

### Task 6: Simplify Registration Form

**Files:**
- Modify: `app/(routes)/startup-studio/events/[id]/register/_components/registration-form.tsx`

**Step 1: Rewrite the entire file**

The form now only collects `team_name` and `problem_idea`. Members are added from My Team page after registration.

```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useRegisterTeam } from '@/hooks/startup-studio/use-event-registrations';
import { useAuth } from '@/hooks/use-auth';
import { Loader2, Users } from 'lucide-react';
import type { StartupEvent } from '@/types/startup-studio';

const registrationSchema = z.object({
  team_name: z.string().min(2, 'Team name must be at least 2 characters'),
  problem_idea: z.string().min(20, 'Problem idea must be at least 20 characters'),
  institution_id: z.string().optional(),
});

type FormValues = z.infer<typeof registrationSchema>;

function useInstitutions() {
  return useQuery({
    queryKey: ['institutions-list'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.from('institutions').select('id, name').order('name');
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
    staleTime: 60 * 1000,
  });
}

export function RegistrationForm({ event }: { event: StartupEvent }) {
  const { profile } = useAuth();
  const registerTeam = useRegisterTeam();
  const isSuperAdmin =
    (profile as any)?.is_super_admin ||
    ['super_admin', 'admin', 'administrator'].includes(profile?.role || '');
  const needsInstitutionPicker = isSuperAdmin && !profile?.institution_id;
  const { data: institutions = [] } = useInstitutions();

  const form = useForm<FormValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { team_name: '', problem_idea: '', institution_id: '' },
  });

  const onSubmit = (values: FormValues) => {
    registerTeam.mutate({
      event_id: event.id,
      team_name: values.team_name,
      problem_idea: values.problem_idea,
      institution_id: values.institution_id || undefined,
      members: [], // members added after registration via My Team page
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Team Details</CardTitle>
            <CardDescription>
              Register your team. After registering, you can invite teammates from your My Team page.
            </CardDescription>
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
                      rows={4}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {needsInstitutionPicker && (
              <FormField
                control={form.control}
                name="institution_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select institution" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {institutions.map((inst) => (
                          <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Users className="h-5 w-5 shrink-0" />
              <p className="text-sm">
                After registering, invite up to <strong>{(event.config?.team_max_size || 5) - 1}</strong> teammates
                from the <strong>My Team</strong> page using the student search.
              </p>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" className="w-full" disabled={registerTeam.isPending}>
          {registerTeam.isPending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Registering...</>
          ) : (
            'Register Team & Get Team Code'
          )}
        </Button>
      </form>
    </Form>
  );
}
```

**Step 2: Commit**

```bash
git add app/(routes)/startup-studio/events/[id]/register/_components/registration-form.tsx
git commit -m "feat(startup-studio): simplify registration form — members added post-registration"
```

---

### Task 7: New StudentSearchDialog Component

**Files:**
- Create: `app/(routes)/startup-studio/events/[id]/my-team/_components/student-search-dialog.tsx`

**Step 1: Create the file**

```tsx
'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, UserPlus, Building2, GraduationCap } from 'lucide-react';
import { useStudentSearch, useStudentSearchFilterOptions, useInviteTeamMember } from '@/hooks/startup-studio/use-event-registrations';
import { useAuth } from '@/hooks/use-auth';
import type { StudentSearchResult } from '@/types/startup-studio';

interface StudentSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registrationId: string;
  eventId: string;
  defaultInstitutionId?: string; // pre-fill leader's institution
}

export function StudentSearchDialog({
  open,
  onOpenChange,
  registrationId,
  eventId,
  defaultInstitutionId,
}: StudentSearchDialogProps) {
  const { profile } = useAuth();
  const inviteMember = useInviteTeamMember();

  const [institutionId, setInstitutionId] = useState(defaultInstitutionId || '');
  const [degreeId, setDegreeId]           = useState('');
  const [departmentId, setDepartmentId]   = useState('');
  const [programId, setProgramId]         = useState('');
  const [semesterId, setSemesterId]       = useState('');
  const [search, setSearch]               = useState('');
  const [invitingId, setInvitingId]       = useState<string | null>(null);

  const { data: options, isLoading: optionsLoading } = useStudentSearchFilterOptions({
    institution_id: institutionId || undefined,
    degree_id: degreeId || undefined,
    department_id: departmentId || undefined,
    program_id: programId || undefined,
  });

  const { data: students = [], isLoading: studentsLoading } = useStudentSearch({
    event_id: eventId,
    institution_id: institutionId || undefined,
    degree_id: degreeId || undefined,
    department_id: departmentId || undefined,
    program_id: programId || undefined,
    semester_id: semesterId || undefined,
    search: search || undefined,
    enabled: open && !!institutionId,
  });

  const handleInvite = async (student: StudentSearchResult) => {
    if (!profile?.id) return;
    setInvitingId(student.learner_id);
    try {
      await inviteMember.mutateAsync({
        registrationId,
        eventId,
        student: {
          learner_id: student.learner_id,
          profile_id: student.profile_id,
          email: student.student_email,
          full_name: `${student.first_name} ${student.last_name || ''}`.trim(),
          roll_number: student.roll_number || undefined,
        },
        invitedByProfileId: profile.id,
      });
    } finally {
      setInvitingId(null);
    }
  };

  const resetFilters = () => {
    setDegreeId('');
    setDepartmentId('');
    setProgramId('');
    setSemesterId('');
    setSearch('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            Search for students by institution, degree, department, program, and semester.
            Members will receive a pending invitation they must accept to join your team.
          </DialogDescription>
        </DialogHeader>

        {/* Cascading Filters */}
        <div className="grid gap-3 grid-cols-2 shrink-0">
          {/* Institution */}
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Institution</label>
            <Select
              value={institutionId}
              onValueChange={(v) => { setInstitutionId(v); resetFilters(); }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select institution" />
              </SelectTrigger>
              <SelectContent>
                {(options?.institutions || []).map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Degree */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Degree</label>
            <Select
              value={degreeId}
              onValueChange={(v) => { setDegreeId(v); setDepartmentId(''); setProgramId(''); setSemesterId(''); }}
              disabled={!institutionId || !options?.degrees?.length}
            >
              <SelectTrigger>
                <SelectValue placeholder="All degrees" />
              </SelectTrigger>
              <SelectContent>
                {(options?.degrees || []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.degree_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Department */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Department</label>
            <Select
              value={departmentId}
              onValueChange={(v) => { setDepartmentId(v); setProgramId(''); setSemesterId(''); }}
              disabled={!degreeId || !options?.departments?.length}
            >
              <SelectTrigger>
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                {(options?.departments || []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.department_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Program */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Program</label>
            <Select
              value={programId}
              onValueChange={(v) => { setProgramId(v); setSemesterId(''); }}
              disabled={!departmentId || !options?.programs?.length}
            >
              <SelectTrigger>
                <SelectValue placeholder="All programs" />
              </SelectTrigger>
              <SelectContent>
                {(options?.programs || []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Semester */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Semester</label>
            <Select
              value={semesterId}
              onValueChange={setSemesterId}
              disabled={!programId || !options?.semesters?.length}
            >
              <SelectTrigger>
                <SelectValue placeholder="All semesters" />
              </SelectTrigger>
              <SelectContent>
                {(options?.semesters || []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.semester_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Name/roll search */}
        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name or roll number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-[200px]">
          {!institutionId && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              <Building2 className="h-4 w-4 mr-2" /> Select an institution to search students
            </div>
          )}
          {institutionId && studentsLoading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {institutionId && !studentsLoading && students.length === 0 && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              <GraduationCap className="h-4 w-4 mr-2" /> No students found matching your filters
            </div>
          )}
          {students.map((student) => (
            <div
              key={student.learner_id}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {student.first_name} {student.last_name}
                </p>
                <p className="text-xs text-muted-foreground truncate">{student.student_email}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {student.roll_number && (
                    <Badge variant="outline" className="text-xs">{student.roll_number}</Badge>
                  )}
                  {student.institution_name && institution_name_differs(student.institution_name, institutionId, options) && (
                    <Badge variant="secondary" className="text-xs">{student.institution_name}</Badge>
                  )}
                  {student.program_name && (
                    <span className="text-xs text-muted-foreground">{student.program_name}</span>
                  )}
                  {student.semester_name && (
                    <span className="text-xs text-muted-foreground">• {student.semester_name}</span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="ml-3 shrink-0"
                disabled={invitingId === student.learner_id || inviteMember.isPending}
                onClick={() => handleInvite(student)}
              >
                {invitingId === student.learner_id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <><UserPlus className="h-4 w-4 mr-1" /> Invite</>
                )}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper: shows institution badge only if it differs from selected filter
function institution_name_differs(
  name: string,
  selectedInstitutionId: string,
  options: ReturnType<typeof useStudentSearchFilterOptions>['data']
): boolean {
  const selectedInst = (options?.institutions || []).find((i) => i.id === selectedInstitutionId);
  return !selectedInst || selectedInst.name !== name;
}
```

**Step 2: Commit**

```bash
git add app/(routes)/startup-studio/events/[id]/my-team/_components/student-search-dialog.tsx
git commit -m "feat(startup-studio): add StudentSearchDialog with cascading institution/degree/dept/program/semester filters"
```

---

### Task 8: Rewrite My Team Page

**Files:**
- Modify: `app/(routes)/startup-studio/events/[id]/my-team/page.tsx`

**Step 1: Rewrite the file completely**

```tsx
'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useEvent } from '@/hooks/startup-studio/use-events';
import {
  useMyRegistration,
  useRemoveTeamMember,
  useRespondToInvitation,
  useMyPendingInvitations,
} from '@/hooks/startup-studio/use-event-registrations';
import { useAuth } from '@/hooks/use-auth';
import { StudentSearchDialog } from './_components/student-search-dialog';
import {
  CheckCircle2, Clock, Laptop, MapPin, User, Users, Loader2,
  UserPlus, XCircle, Hash, Bell, Shield,
} from 'lucide-react';
import type { EventTeamMember, PendingInvitation } from '@/types/startup-studio';

export default function MyTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile } = useAuth();
  const { data: event } = useEvent(id);
  const { data: registration, isLoading } = useMyRegistration(id);
  const { data: pendingInvitations = [] } = useMyPendingInvitations();
  const removeMember = useRemoveTeamMember();
  const respondToInvitation = useRespondToInvitation();
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);

  const isLeader = registration?.owner_id === profile?.id;
  const acceptedMembers = (registration?.team_members || []).filter(
    (m: EventTeamMember) => m.status === 'accepted'
  );
  const pendingOutgoing = (registration?.team_members || []).filter(
    (m: EventTeamMember) => m.status === 'pending'
  );
  const declinedMembers = (registration?.team_members || []).filter(
    (m: EventTeamMember) => m.status === 'declined'
  );

  // Pending invitations to THIS user for OTHER events (or this event if they haven't registered)
  const myInvitationsForThisEvent = pendingInvitations.filter(
    (inv: PendingInvitation) => inv.event_id === id
  );

  if (isLoading) {
    return (
      <ContentLayout title="My Team">
        <PageBreadcrumb items={[
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
          { label: 'My Team' },
        ]} />
        <Card className="max-w-5xl mx-auto mt-8">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-12 w-12 text-muted-foreground mx-auto animate-spin" />
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  // Not registered — show pending invitations if any
  if (!registration) {
    return (
      <ContentLayout title="My Team">
        <PageBreadcrumb items={[
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
          { label: 'My Team' },
        ]} />
        <div className="max-w-5xl mt-4 space-y-6">
          {myInvitationsForThisEvent.length > 0 && (
            <PendingInvitationsCard
              invitations={myInvitationsForThisEvent}
              onRespond={(memberId, accept) =>
                respondToInvitation.mutate({ memberId, accept })
              }
              isPending={respondToInvitation.isPending}
            />
          )}
          <Card>
            <CardContent className="pt-6 text-center space-y-3">
              <p className="text-muted-foreground">
                You haven&apos;t registered a team for this event yet.
              </p>
              {myInvitationsForThisEvent.length === 0 && (
                <Link href={`/startup-studio/events/${id}/register`}>
                  <Button>Register a Team</Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  const buildDayVenue = registration.venue_allocations?.find((v: any) => v.day_type === 'build_day');
  const demoDayVenue  = registration.venue_allocations?.find((v: any) => v.day_type === 'demo_day');

  return (
    <ContentLayout title="My Team">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
        { label: 'My Team' },
      ]} />

      <div className="space-y-6 mt-4 max-w-5xl py-4">

        {/* Team Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-xl">{registration.team_name}</CardTitle>
                {registration.team_code && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-mono text-muted-foreground font-medium">
                      {registration.team_code}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isLeader && (
                  <Badge variant="outline" className="gap-1">
                    <Shield className="h-3 w-3" /> Team Leader
                  </Badge>
                )}
                <Badge variant={registration.checked_in ? 'default' : 'secondary'}>
                  {registration.checked_in ? 'Checked In' : registration.status}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
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
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Team Members ({acceptedMembers.length})
                </CardTitle>
                <CardDescription>
                  {pendingOutgoing.length > 0
                    ? `${pendingOutgoing.length} pending invitation${pendingOutgoing.length > 1 ? 's' : ''}`
                    : 'All accepted members'}
                </CardDescription>
              </div>
              {isLeader && event?.status === 'registration_open' && (
                <Button
                  size="sm"
                  onClick={() => setSearchDialogOpen(true)}
                >
                  <UserPlus className="h-4 w-4 mr-1" /> Invite Member
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {acceptedMembers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No accepted members yet. Invite your teammates!
              </p>
            )}
            {acceptedMembers.map((member: EventTeamMember) => (
              <MemberRow
                key={member.id}
                member={member}
                isLeader={isLeader}
                canRemove={isLeader && !member.is_leader}
                onRemove={() => removeMember.mutate(member.id)}
                isRemoving={removeMember.isPending}
              />
            ))}

            {/* Pending outgoing invitations */}
            {isLeader && pendingOutgoing.length > 0 && (
              <div className="pt-4 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                  Pending Invitations
                </p>
                {pendingOutgoing.map((member: EventTeamMember) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 border rounded-lg border-dashed bg-muted/30"
                  >
                    <div>
                      <p className="text-sm font-medium">{member.full_name || member.email}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs gap-1">
                        <Clock className="h-3 w-3" /> Pending
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMember.mutate(member.id)}
                        disabled={removeMember.isPending}
                      >
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Declined (visible to leader only) */}
            {isLeader && declinedMembers.length > 0 && (
              <div className="pt-3">
                <p className="text-xs text-muted-foreground">
                  {declinedMembers.length} invitation{declinedMembers.length > 1 ? 's' : ''} declined
                </p>
              </div>
            )}
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
                  {buildDayVenue.venue_assignment?.resource?.name ||
                    buildDayVenue.venue_assignment?.manual_name || 'Venue assigned'}
                  {buildDayVenue.venue_assignment?.manual_building &&
                    ` - ${buildDayVenue.venue_assignment.manual_building}`}
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
                  {demoDayVenue.venue_assignment?.resource?.name ||
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

        {event && ['build_day', 'demo_day'].includes(event.status) && (
          <Link href={`/startup-studio/events/${id}/submit`}>
            <Button className="w-full" size="lg">Submit Your Project</Button>
          </Link>
        )}
      </div>

      <StudentSearchDialog
        open={searchDialogOpen}
        onOpenChange={setSearchDialogOpen}
        registrationId={registration.id}
        eventId={id}
        defaultInstitutionId={registration.institution_id}
      />
    </ContentLayout>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MemberRow({
  member,
  isLeader,
  canRemove,
  onRemove,
  isRemoving,
}: {
  member: EventTeamMember;
  isLeader: boolean;
  canRemove: boolean;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        <User className="h-4 w-4 text-muted-foreground shrink-0" />
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium">{member.full_name || member.email}</p>
            {member.is_leader && (
              <Badge variant="outline" className="text-xs py-0 px-1.5">Leader</Badge>
            )}
          </div>
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
        {canRemove && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={isRemoving}
          >
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>
    </div>
  );
}

function PendingInvitationsCard({
  invitations,
  onRespond,
  isPending,
}: {
  invitations: PendingInvitation[];
  onRespond: (memberId: string, accept: boolean) => void;
  isPending: boolean;
}) {
  return (
    <Card className="border-blue-200 dark:border-blue-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4" />
          Team Invitations ({invitations.length})
        </CardTitle>
        <CardDescription>
          You have been invited to join a team. Accept to join or decline to pass.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {invitations.map((inv) => (
          <div key={inv.member_id} className="flex items-center justify-between p-3 border rounded-lg bg-blue-50/50 dark:bg-blue-950/20">
            <div>
              <p className="text-sm font-medium">{inv.team_name}</p>
              <p className="text-xs text-muted-foreground">
                {inv.event_name}
                {inv.team_code && <span className="ml-2 font-mono">#{inv.team_code}</span>}
              </p>
              {inv.invited_by_name && (
                <p className="text-xs text-muted-foreground">Invited by {inv.invited_by_name}</p>
              )}
            </div>
            <div className="flex items-center gap-2 ml-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRespond(inv.member_id, false)}
                disabled={isPending}
              >
                Decline
              </Button>
              <Button
                size="sm"
                onClick={() => onRespond(inv.member_id, true)}
                disabled={isPending}
              >
                Accept
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

**Step 2: Commit**

```bash
git add app/(routes)/startup-studio/events/[id]/my-team/page.tsx
git commit -m "feat(startup-studio): rewrite My Team page with invitation management, team code display, and member status"
```

---

## Phase 6: Update SQL Index File

### Task 9: Update SQL_FILE_INDEX.md

**Files:**
- Modify: `supabase/SQL_FILE_INDEX.md`

**Step 1: Find the startup studio section and add the new column documentation**

Search for `event_registrations` or `startup studio` in the index and add a note:

```markdown
### event_registrations
- Columns: id, event_id, team_name, **team_code** (NEW 2026-03-06), problem_idea, owner_id,
  institution_id, lovable_verified, checked_in, status, created_at, updated_at

### event_team_members
- Columns: id, registration_id, profile_id, **learner_id** (NEW), email, full_name, student_id,
  has_laptop, **status** (NEW: pending/accepted/declined/removed), **is_leader** (NEW),
  added_at, **responded_at** (NEW)
```

**Step 2: Commit**

```bash
git add supabase/SQL_FILE_INDEX.md
git commit -m "docs: update SQL_FILE_INDEX for team invitation workflow changes"
```

---

## Verification Checklist

After all tasks are complete, manually verify these flows in the browser:

### Flow 1: Team Registration
- [ ] Register page loads and shows only team name + problem idea (no members section)
- [ ] Submitting creates a registration and redirects to My Team page
- [ ] My Team page shows the team code (e.g., `JKKN-001`) prominently
- [ ] Team leader appears as an accepted member with "Leader" badge

### Flow 2: Invite Member
- [ ] "Invite Member" button visible to team leader only when `status = registration_open`
- [ ] Student Search Dialog opens with institution pre-filled to leader's institution
- [ ] Selecting Institution → Degree cascades correctly (Degree dropdown enables)
- [ ] Selecting Degree → Department cascades correctly
- [ ] Selecting Department → Program → Semester cascades
- [ ] Student list appears with name, roll number, program, semester
- [ ] Clicking "Invite" creates a pending invitation (appears in Pending section)

### Flow 3: Accept/Decline Invitation
- [ ] Login as an invited student → My Team page shows "Team Invitations" card
- [ ] Accept → student appears in Accepted Members list
- [ ] Decline → invitation disappears

### Flow 4: One-Team Rule
- [ ] Accepting an invitation when already in a team → error toast shown
- [ ] Trying to register a second team → error toast shown
- [ ] Already-teamed students do not appear in search results

### Flow 5: Cross-Institution
- [ ] Team leader from Institution A can select Institution B in the search dialog
- [ ] Students from Institution B appear correctly
- [ ] Their institution badge is shown in search results
