# Expo Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build an Expo (Education Fair) management module under Marketing with event catalog, team assignment, daily reports with expense tracking & photo uploads, lead integration, and ROI + performance analytics dashboard.

**Architecture:** Flat sub-module under `/admission/marketing/expos/` following the existing marketing hub-and-spoke pattern. 4 database tables (expo_masters, expo_events, expo_event_team_members, expo_daily_reports) with Supabase Storage for photos. Leads flow directly into `admission_leads` with `expo_event_id` FK. Standalone expense tracking with PostgreSQL generated columns for auto-totals.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (DB + Storage + RLS), React Query, shadcn/ui, Recharts (analytics), Tanstack Table

---

## Task 1: Database Schema — Types & Enums

**Files:**
- Modify: `types/admission.ts` (append after line 526)

**Step 1: Add Expo type definitions to `types/admission.ts`**

Append the following after the closing `}` of `AdmissionAnalytics` interface (line 526):

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// EXPOS (Education Fairs & Exhibition Events)
// ═══════════════════════════════════════════════════════════════════════════

export type ExpoEventStatus = 'planned' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type ExpoFrequency = 'annual' | 'biannual' | 'quarterly' | 'one_time';
export type ExpoTeamMemberType = 'staff' | 'student' | 'external';
export type ExpoTeamMemberRole = 'team_leader' | 'counselor' | 'volunteer' | 'support';
export type TravelMode = 'bus' | 'train' | 'flight' | 'own_vehicle' | 'other';

// ─── Expo Master (Reusable Event Catalog) ─────────────────────────────────

export interface ExpoMaster {
  id: string;
  institution_id: string;
  event_name: string;
  organizer_name: string | null;
  city: string | null;
  venue_name: string | null;
  description: string | null;
  frequency: ExpoFrequency | null;
  tags: string[] | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateExpoMasterInput {
  institution_id: string;
  event_name: string;
  organizer_name?: string;
  city?: string;
  venue_name?: string;
  description?: string;
  frequency?: ExpoFrequency;
  tags?: string[];
}

export interface UpdateExpoMasterInput {
  event_name?: string;
  organizer_name?: string;
  city?: string;
  venue_name?: string;
  description?: string;
  frequency?: ExpoFrequency;
  tags?: string[];
  is_active?: boolean;
}

export interface ExpoMasterFilters {
  institution_id: string;
  search?: string;
  is_active?: boolean;
  page?: number;
  limit?: number;
}

// ─── Expo Event (Specific Instance) ───────────────────────────────────────

export interface ExpoEvent {
  id: string;
  institution_id: string;
  expo_master_id: string | null;
  expo_master?: ExpoMaster | null;
  event_name: string;
  organizer_name: string | null;
  city: string;
  venue_name: string | null;
  start_date: string;
  end_date: string;
  travel_mode: TravelMode | null;
  accommodation_details: string | null;
  team_leader_id: string | null;
  team_leader?: { id: string; first_name: string; last_name: string } | null;
  approved_by_id: string | null;
  approved_by?: { id: string; first_name: string; last_name: string } | null;
  event_status: ExpoEventStatus;
  notes: string | null;
  total_team_members: number;
  total_expenses: number;
  total_leads_collected: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined relations
  team_members?: ExpoEventTeamMember[];
  daily_reports?: ExpoDailyReport[];
}

export interface CreateExpoEventInput {
  institution_id: string;
  expo_master_id?: string;
  event_name: string;
  organizer_name?: string;
  city: string;
  venue_name?: string;
  start_date: string;
  end_date: string;
  travel_mode?: TravelMode;
  accommodation_details?: string;
  team_leader_id?: string;
  approved_by_id?: string;
  event_status?: ExpoEventStatus;
  notes?: string;
  team_members?: CreateExpoTeamMemberInput[];
}

export interface UpdateExpoEventInput {
  event_name?: string;
  organizer_name?: string;
  city?: string;
  venue_name?: string;
  start_date?: string;
  end_date?: string;
  travel_mode?: TravelMode;
  accommodation_details?: string;
  team_leader_id?: string;
  approved_by_id?: string;
  event_status?: ExpoEventStatus;
  notes?: string;
}

export interface ExpoEventFilters {
  institution_id: string;
  status?: ExpoEventStatus;
  city?: string;
  date_from?: string;
  date_to?: string;
  expo_master_id?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface ExpoEventListResponse {
  data: ExpoEvent[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ─── Team Members ─────────────────────────────────────────────────────────

export interface ExpoEventTeamMember {
  id: string;
  expo_event_id: string;
  member_type: ExpoTeamMemberType;
  staff_id: string | null;
  student_id: string | null;
  name: string;
  phone: string | null;
  role: ExpoTeamMemberRole;
  created_at: string;
}

export interface CreateExpoTeamMemberInput {
  member_type: ExpoTeamMemberType;
  staff_id?: string;
  student_id?: string;
  name: string;
  phone?: string;
  role: ExpoTeamMemberRole;
}

// ─── Daily Reports ────────────────────────────────────────────────────────

export interface ExpoDailyReport {
  id: string;
  expo_event_id: string;
  institution_id: string;
  report_date: string;
  // Expenses
  stall_fee: number;
  travel_expense: number;
  accommodation_expense: number;
  food_expense: number;
  printing_materials: number;
  miscellaneous_expense: number;
  total_expense: number; // auto-calculated
  // Engagement
  total_visitors: number;
  counselling_done: number;
  brochures_distributed: number;
  interested_students: number;
  leads_collected: number;
  // Photos (Supabase Storage URLs)
  stall_photos: string[];
  event_photos: string[];
  visitor_photos: string[];
  // Metadata
  notes: string | null;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDailyReportInput {
  expo_event_id: string;
  institution_id: string;
  report_date: string;
  stall_fee?: number;
  travel_expense?: number;
  accommodation_expense?: number;
  food_expense?: number;
  printing_materials?: number;
  miscellaneous_expense?: number;
  total_visitors?: number;
  counselling_done?: number;
  brochures_distributed?: number;
  interested_students?: number;
  leads_collected?: number;
  stall_photos?: string[];
  event_photos?: string[];
  visitor_photos?: string[];
  notes?: string;
}

export interface UpdateDailyReportInput {
  stall_fee?: number;
  travel_expense?: number;
  accommodation_expense?: number;
  food_expense?: number;
  printing_materials?: number;
  miscellaneous_expense?: number;
  total_visitors?: number;
  counselling_done?: number;
  brochures_distributed?: number;
  interested_students?: number;
  leads_collected?: number;
  stall_photos?: string[];
  event_photos?: string[];
  visitor_photos?: string[];
  notes?: string;
}

// ─── Analytics ────────────────────────────────────────────────────────────

export interface ExpoSummaryStats {
  total_expos: number;
  active_expos: number;
  total_leads: number;
  total_expenses: number;
  avg_cost_per_lead: number;
  total_visitors: number;
  conversion_rate: number; // visitors → leads %
}

export interface ExpoExpenseBreakdown {
  category: string;
  amount: number;
  percentage: number;
}

export interface ExpoLeadFunnel {
  total_visitors: number;
  counselling_done: number;
  interested_students: number;
  leads_collected: number;
}

export interface ExpoComparisonItem {
  id: string;
  event_name: string;
  city: string;
  total_leads: number;
  total_expenses: number;
  total_visitors: number;
  cost_per_lead: number;
  conversion_rate: number;
}

export interface ExpoTeamPerformanceItem {
  member_name: string;
  role: string;
  leads_attributed: number;
  days_present: number;
}

export interface ExpoDailyTrend {
  date: string;
  visitors: number;
  leads: number;
  expense: number;
  counselling: number;
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to the new types

**Step 3: Commit**

```bash
git add types/admission.ts
git commit -m "feat(expo): add TypeScript types for expo module"
```

---

## Task 2: Database Schema — SQL Tables

**Files:**
- Modify: `supabase/setup/01_tables.sql` (append expo tables)
- Modify: `supabase/SQL_FILE_INDEX.md` (update index)

**Step 1: Add expo tables to `supabase/setup/01_tables.sql`**

Append the following at the end of the file:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- EXPO MODULE (Education Fairs & Exhibitions)
-- Updated: 2026-03-13 - Initial creation
-- ═══════════════════════════════════════════════════════════════════════════

-- Expo Masters (Reusable Event Catalog)
CREATE TABLE IF NOT EXISTS expo_masters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  organizer_name TEXT,
  city TEXT,
  venue_name TEXT,
  description TEXT,
  frequency TEXT CHECK (frequency IN ('annual', 'biannual', 'quarterly', 'one_time')),
  tags TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_expo_masters_institution ON expo_masters(institution_id);
CREATE INDEX idx_expo_masters_active ON expo_masters(institution_id, is_active);

-- Expo Events (Specific Instances)
CREATE TABLE IF NOT EXISTS expo_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  expo_master_id UUID REFERENCES expo_masters(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  organizer_name TEXT,
  city TEXT NOT NULL,
  venue_name TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  travel_mode TEXT CHECK (travel_mode IN ('bus', 'train', 'flight', 'own_vehicle', 'other')),
  accommodation_details TEXT,
  team_leader_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  approved_by_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  event_status TEXT NOT NULL DEFAULT 'planned' CHECK (event_status IN ('planned', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  total_team_members INT DEFAULT 0,
  total_expenses NUMERIC(12,2) DEFAULT 0,
  total_leads_collected INT DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT expo_events_date_check CHECK (end_date >= start_date)
);

CREATE INDEX idx_expo_events_institution ON expo_events(institution_id);
CREATE INDEX idx_expo_events_status ON expo_events(institution_id, event_status);
CREATE INDEX idx_expo_events_dates ON expo_events(start_date, end_date);
CREATE INDEX idx_expo_events_master ON expo_events(expo_master_id);

-- Expo Event Team Members (Staff + Student Volunteers)
CREATE TABLE IF NOT EXISTS expo_event_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expo_event_id UUID NOT NULL REFERENCES expo_events(id) ON DELETE CASCADE,
  member_type TEXT NOT NULL CHECK (member_type IN ('staff', 'student', 'external')),
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  student_id UUID REFERENCES learners_profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'volunteer' CHECK (role IN ('team_leader', 'counselor', 'volunteer', 'support')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_expo_team_event ON expo_event_team_members(expo_event_id);
CREATE INDEX idx_expo_team_staff ON expo_event_team_members(staff_id) WHERE staff_id IS NOT NULL;

-- Expo Daily Reports (Daily Data Collection)
CREATE TABLE IF NOT EXISTS expo_daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expo_event_id UUID NOT NULL REFERENCES expo_events(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  -- Expenses
  stall_fee NUMERIC(10,2) DEFAULT 0,
  travel_expense NUMERIC(10,2) DEFAULT 0,
  accommodation_expense NUMERIC(10,2) DEFAULT 0,
  food_expense NUMERIC(10,2) DEFAULT 0,
  printing_materials NUMERIC(10,2) DEFAULT 0,
  miscellaneous_expense NUMERIC(10,2) DEFAULT 0,
  total_expense NUMERIC(12,2) GENERATED ALWAYS AS (
    COALESCE(stall_fee, 0) + COALESCE(travel_expense, 0) + COALESCE(accommodation_expense, 0) +
    COALESCE(food_expense, 0) + COALESCE(printing_materials, 0) + COALESCE(miscellaneous_expense, 0)
  ) STORED,
  -- Engagement Metrics
  total_visitors INT DEFAULT 0,
  counselling_done INT DEFAULT 0,
  brochures_distributed INT DEFAULT 0,
  interested_students INT DEFAULT 0,
  leads_collected INT DEFAULT 0,
  -- Photos (Supabase Storage URLs)
  stall_photos TEXT[] DEFAULT '{}',
  event_photos TEXT[] DEFAULT '{}',
  visitor_photos TEXT[] DEFAULT '{}',
  -- Metadata
  notes TEXT,
  submitted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(expo_event_id, report_date)
);

CREATE INDEX idx_expo_reports_event ON expo_daily_reports(expo_event_id);
CREATE INDEX idx_expo_reports_date ON expo_daily_reports(report_date);
CREATE INDEX idx_expo_reports_institution ON expo_daily_reports(institution_id);

-- Add expo_event_id to admission_leads for lead-to-expo tracking
ALTER TABLE admission_leads ADD COLUMN IF NOT EXISTS expo_event_id UUID REFERENCES expo_events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_admission_leads_expo ON admission_leads(expo_event_id) WHERE expo_event_id IS NOT NULL;

-- Enable RLS on all expo tables
ALTER TABLE expo_masters ENABLE ROW LEVEL SECURITY;
ALTER TABLE expo_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE expo_event_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE expo_daily_reports ENABLE ROW LEVEL SECURITY;
```

**Step 2: Add RLS policies to `supabase/setup/03_policies.sql`**

Append:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- EXPO MODULE RLS POLICIES
-- Updated: 2026-03-13 - Initial creation
-- ═══════════════════════════════════════════════════════════════════════════

-- expo_masters
CREATE POLICY "expo_masters_select" ON expo_masters FOR SELECT
  USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
CREATE POLICY "expo_masters_insert" ON expo_masters FOR INSERT
  WITH CHECK (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
CREATE POLICY "expo_masters_update" ON expo_masters FOR UPDATE
  USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
CREATE POLICY "expo_masters_delete" ON expo_masters FOR DELETE
  USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));

-- expo_events
CREATE POLICY "expo_events_select" ON expo_events FOR SELECT
  USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
CREATE POLICY "expo_events_insert" ON expo_events FOR INSERT
  WITH CHECK (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
CREATE POLICY "expo_events_update" ON expo_events FOR UPDATE
  USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
CREATE POLICY "expo_events_delete" ON expo_events FOR DELETE
  USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));

-- expo_event_team_members (access via event's institution)
CREATE POLICY "expo_team_select" ON expo_event_team_members FOR SELECT
  USING (expo_event_id IN (SELECT id FROM expo_events WHERE institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid())));
CREATE POLICY "expo_team_insert" ON expo_event_team_members FOR INSERT
  WITH CHECK (expo_event_id IN (SELECT id FROM expo_events WHERE institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid())));
CREATE POLICY "expo_team_update" ON expo_event_team_members FOR UPDATE
  USING (expo_event_id IN (SELECT id FROM expo_events WHERE institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid())));
CREATE POLICY "expo_team_delete" ON expo_event_team_members FOR DELETE
  USING (expo_event_id IN (SELECT id FROM expo_events WHERE institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid())));

-- expo_daily_reports
CREATE POLICY "expo_reports_select" ON expo_daily_reports FOR SELECT
  USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
CREATE POLICY "expo_reports_insert" ON expo_daily_reports FOR INSERT
  WITH CHECK (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
CREATE POLICY "expo_reports_update" ON expo_daily_reports FOR UPDATE
  USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
CREATE POLICY "expo_reports_delete" ON expo_daily_reports FOR DELETE
  USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
```

**Step 3: Add triggers to `supabase/setup/04_triggers.sql`**

Append:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- EXPO MODULE TRIGGERS
-- Updated: 2026-03-13 - Initial creation
-- ═══════════════════════════════════════════════════════════════════════════

-- Auto-update team member count on expo_events
CREATE OR REPLACE FUNCTION update_expo_team_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE expo_events SET total_team_members = (
      SELECT COUNT(*) FROM expo_event_team_members WHERE expo_event_id = OLD.expo_event_id
    ), updated_at = now() WHERE id = OLD.expo_event_id;
    RETURN OLD;
  ELSE
    UPDATE expo_events SET total_team_members = (
      SELECT COUNT(*) FROM expo_event_team_members WHERE expo_event_id = NEW.expo_event_id
    ), updated_at = now() WHERE id = NEW.expo_event_id;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_expo_team_count
  AFTER INSERT OR DELETE ON expo_event_team_members
  FOR EACH ROW EXECUTE FUNCTION update_expo_team_count();

-- Auto-update total expenses and leads on expo_events from daily reports
CREATE OR REPLACE FUNCTION update_expo_report_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_event_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_event_id := OLD.expo_event_id;
  ELSE
    v_event_id := NEW.expo_event_id;
  END IF;

  UPDATE expo_events SET
    total_expenses = COALESCE((
      SELECT SUM(total_expense) FROM expo_daily_reports WHERE expo_event_id = v_event_id
    ), 0),
    total_leads_collected = COALESCE((
      SELECT SUM(leads_collected) FROM expo_daily_reports WHERE expo_event_id = v_event_id
    ), 0),
    updated_at = now()
  WHERE id = v_event_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_expo_report_totals
  AFTER INSERT OR UPDATE OR DELETE ON expo_daily_reports
  FOR EACH ROW EXECUTE FUNCTION update_expo_report_totals();

-- Auto-update updated_at on expo tables
CREATE TRIGGER set_expo_masters_updated_at
  BEFORE UPDATE ON expo_masters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_expo_events_updated_at
  BEFORE UPDATE ON expo_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_expo_daily_reports_updated_at
  BEFORE UPDATE ON expo_daily_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Step 4: Update `supabase/SQL_FILE_INDEX.md`**

Add under the appropriate section:

```markdown
### Expo Module (Education Fairs)
- **Tables** (01_tables.sql): `expo_masters`, `expo_events`, `expo_event_team_members`, `expo_daily_reports`
- **Policies** (03_policies.sql): Institution-scoped RLS for all 4 tables
- **Triggers** (04_triggers.sql): `update_expo_team_count`, `update_expo_report_totals`, `updated_at` triggers
- **FK Addition**: `admission_leads.expo_event_id` → `expo_events(id)`
- Added: 2026-03-13
```

**Step 5: Run SQL on Supabase**

Execute the tables, policies, and triggers SQL via Supabase MCP or Dashboard SQL Editor.

**Step 6: Commit**

```bash
git add supabase/setup/01_tables.sql supabase/setup/03_policies.sql supabase/setup/04_triggers.sql supabase/SQL_FILE_INDEX.md
git commit -m "feat(expo): add database tables, RLS policies, and triggers"
```

---

## Task 3: Service Layer — ExpoService

**Files:**
- Create: `lib/services/admission/expo-service.ts`

**Step 1: Create the full ExpoService**

Create `lib/services/admission/expo-service.ts` following the singleton pattern from `consultant-service.ts`:

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ExpoMaster,
  CreateExpoMasterInput,
  UpdateExpoMasterInput,
  ExpoMasterFilters,
  ExpoEvent,
  CreateExpoEventInput,
  UpdateExpoEventInput,
  ExpoEventFilters,
  ExpoEventListResponse,
  ExpoEventTeamMember,
  CreateExpoTeamMemberInput,
  ExpoDailyReport,
  CreateDailyReportInput,
  UpdateDailyReportInput,
  ExpoSummaryStats,
  ExpoExpenseBreakdown,
  ExpoLeadFunnel,
  ExpoComparisonItem,
  ExpoDailyTrend,
} from '@/types/admission';

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  planned: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: ['planned'],
};

export class ExpoService {
  private static supabase = createClientSupabaseClient();

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPO MASTERS
  // ═══════════════════════════════════════════════════════════════════════════

  static async getExpoMasters(filters: ExpoMasterFilters) {
    const { institution_id, search, is_active, page = 1, limit = 50 } = filters;

    let query = this.supabase
      .from('expo_masters')
      .select('*', { count: 'exact' })
      .eq('institution_id', institution_id)
      .order('created_at', { ascending: false });

    if (typeof is_active === 'boolean') {
      query = query.eq('is_active', is_active);
    }
    if (search) {
      query = query.or(`event_name.ilike.%${search}%,organizer_name.ilike.%${search}%,city.ilike.%${search}%`);
    }

    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data: (data || []) as ExpoMaster[],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  static async getExpoMaster(id: string) {
    const { data, error } = await this.supabase
      .from('expo_masters')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as ExpoMaster;
  }

  static async createExpoMaster(input: CreateExpoMasterInput) {
    const { data: { user } } = await this.supabase.auth.getUser();

    const { data, error } = await this.supabase
      .from('expo_masters')
      .insert({ ...input, created_by: user?.id })
      .select()
      .single();

    if (error) throw error;
    return data as ExpoMaster;
  }

  static async updateExpoMaster(id: string, input: UpdateExpoMasterInput) {
    const { data, error } = await this.supabase
      .from('expo_masters')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as ExpoMaster;
  }

  static async deleteExpoMaster(id: string) {
    const { error } = await this.supabase
      .from('expo_masters')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPO EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  static async getExpoEvents(filters: ExpoEventFilters): Promise<ExpoEventListResponse> {
    const {
      institution_id, status, city, date_from, date_to,
      expo_master_id, search, page = 1, limit = 20,
      sort_by = 'start_date', sort_order = 'desc'
    } = filters;

    let query = this.supabase
      .from('expo_events')
      .select(`
        *,
        expo_master:expo_masters(id, event_name),
        team_leader:staff!expo_events_team_leader_id_fkey(id, first_name, last_name),
        approved_by:staff!expo_events_approved_by_id_fkey(id, first_name, last_name)
      `, { count: 'exact' })
      .eq('institution_id', institution_id);

    if (status) query = query.eq('event_status', status);
    if (city) query = query.ilike('city', `%${city}%`);
    if (date_from) query = query.gte('start_date', date_from);
    if (date_to) query = query.lte('end_date', date_to);
    if (expo_master_id) query = query.eq('expo_master_id', expo_master_id);
    if (search) {
      query = query.or(`event_name.ilike.%${search}%,city.ilike.%${search}%,organizer_name.ilike.%${search}%`);
    }

    query = query.order(sort_by, { ascending: sort_order === 'asc' });

    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data: (data || []) as ExpoEvent[],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  static async getExpoEvent(id: string) {
    const { data, error } = await this.supabase
      .from('expo_events')
      .select(`
        *,
        expo_master:expo_masters(id, event_name, organizer_name, city, venue_name),
        team_leader:staff!expo_events_team_leader_id_fkey(id, first_name, last_name, phone),
        approved_by:staff!expo_events_approved_by_id_fkey(id, first_name, last_name),
        team_members:expo_event_team_members(*),
        daily_reports:expo_daily_reports(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as ExpoEvent;
  }

  static async createExpoEvent(input: CreateExpoEventInput) {
    const { team_members, ...eventData } = input;
    const { data: { user } } = await this.supabase.auth.getUser();

    // Create event
    const { data: event, error: eventError } = await this.supabase
      .from('expo_events')
      .insert({ ...eventData, created_by: user?.id })
      .select()
      .single();

    if (eventError) throw eventError;

    // Add team members if provided
    if (team_members && team_members.length > 0) {
      const members = team_members.map(m => ({
        ...m,
        expo_event_id: event.id,
      }));

      const { error: membersError } = await this.supabase
        .from('expo_event_team_members')
        .insert(members);

      if (membersError) {
        console.error('[admission/expos] Failed to add team members:', membersError);
      }
    }

    return event as ExpoEvent;
  }

  static async updateExpoEvent(id: string, input: UpdateExpoEventInput) {
    const { data, error } = await this.supabase
      .from('expo_events')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as ExpoEvent;
  }

  static async updateEventStatus(id: string, newStatus: string) {
    // Validate status transition
    const { data: current } = await this.supabase
      .from('expo_events')
      .select('event_status')
      .eq('id', id)
      .single();

    if (current) {
      const allowed = ALLOWED_STATUS_TRANSITIONS[current.event_status] || [];
      if (!allowed.includes(newStatus)) {
        throw new Error(`Cannot transition from '${current.event_status}' to '${newStatus}'`);
      }
    }

    const { data, error } = await this.supabase
      .from('expo_events')
      .update({ event_status: newStatus })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as ExpoEvent;
  }

  static async deleteExpoEvent(id: string) {
    // Soft delete by setting status to cancelled
    return this.updateEventStatus(id, 'cancelled');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAM MEMBERS
  // ═══════════════════════════════════════════════════════════════════════════

  static async getTeamMembers(eventId: string) {
    const { data, error } = await this.supabase
      .from('expo_event_team_members')
      .select('*')
      .eq('expo_event_id', eventId)
      .order('role', { ascending: true });

    if (error) throw error;
    return (data || []) as ExpoEventTeamMember[];
  }

  static async addTeamMember(eventId: string, input: CreateExpoTeamMemberInput) {
    const { data, error } = await this.supabase
      .from('expo_event_team_members')
      .insert({ ...input, expo_event_id: eventId })
      .select()
      .single();

    if (error) throw error;
    return data as ExpoEventTeamMember;
  }

  static async removeTeamMember(memberId: string) {
    const { error } = await this.supabase
      .from('expo_event_team_members')
      .delete()
      .eq('id', memberId);

    if (error) throw error;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DAILY REPORTS
  // ═══════════════════════════════════════════════════════════════════════════

  static async getDailyReports(eventId: string) {
    const { data, error } = await this.supabase
      .from('expo_daily_reports')
      .select('*')
      .eq('expo_event_id', eventId)
      .order('report_date', { ascending: true });

    if (error) throw error;
    return (data || []) as ExpoDailyReport[];
  }

  static async getDailyReport(id: string) {
    const { data, error } = await this.supabase
      .from('expo_daily_reports')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as ExpoDailyReport;
  }

  static async createDailyReport(input: CreateDailyReportInput) {
    const { data: { user } } = await this.supabase.auth.getUser();

    const { data, error } = await this.supabase
      .from('expo_daily_reports')
      .insert({ ...input, submitted_by: user?.id })
      .select()
      .single();

    if (error) throw error;
    return data as ExpoDailyReport;
  }

  static async updateDailyReport(id: string, input: UpdateDailyReportInput) {
    const { data, error } = await this.supabase
      .from('expo_daily_reports')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as ExpoDailyReport;
  }

  static async deleteDailyReport(id: string) {
    const { error } = await this.supabase
      .from('expo_daily_reports')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════

  static async getSummaryStats(institutionId: string): Promise<ExpoSummaryStats> {
    const { data: events } = await this.supabase
      .from('expo_events')
      .select('event_status, total_expenses, total_leads_collected')
      .eq('institution_id', institutionId)
      .neq('event_status', 'cancelled');

    const { data: reports } = await this.supabase
      .from('expo_daily_reports')
      .select('total_visitors')
      .eq('institution_id', institutionId);

    const allEvents = events || [];
    const allReports = reports || [];
    const totalExpenses = allEvents.reduce((sum, e) => sum + (e.total_expenses || 0), 0);
    const totalLeads = allEvents.reduce((sum, e) => sum + (e.total_leads_collected || 0), 0);
    const totalVisitors = allReports.reduce((sum, r) => sum + (r.total_visitors || 0), 0);

    return {
      total_expos: allEvents.length,
      active_expos: allEvents.filter(e => ['confirmed', 'in_progress'].includes(e.event_status)).length,
      total_leads: totalLeads,
      total_expenses: totalExpenses,
      avg_cost_per_lead: totalLeads > 0 ? totalExpenses / totalLeads : 0,
      total_visitors: totalVisitors,
      conversion_rate: totalVisitors > 0 ? (totalLeads / totalVisitors) * 100 : 0,
    };
  }

  static async getExpenseBreakdown(institutionId: string): Promise<ExpoExpenseBreakdown[]> {
    const { data } = await this.supabase
      .from('expo_daily_reports')
      .select('stall_fee, travel_expense, accommodation_expense, food_expense, printing_materials, miscellaneous_expense')
      .eq('institution_id', institutionId);

    const reports = data || [];
    const totals = {
      'Stall Fee': 0,
      'Travel': 0,
      'Accommodation': 0,
      'Food': 0,
      'Printing Materials': 0,
      'Miscellaneous': 0,
    };

    for (const r of reports) {
      totals['Stall Fee'] += r.stall_fee || 0;
      totals['Travel'] += r.travel_expense || 0;
      totals['Accommodation'] += r.accommodation_expense || 0;
      totals['Food'] += r.food_expense || 0;
      totals['Printing Materials'] += r.printing_materials || 0;
      totals['Miscellaneous'] += r.miscellaneous_expense || 0;
    }

    const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);

    return Object.entries(totals).map(([category, amount]) => ({
      category,
      amount,
      percentage: grandTotal > 0 ? (amount / grandTotal) * 100 : 0,
    }));
  }

  static async getLeadFunnel(institutionId: string): Promise<ExpoLeadFunnel> {
    const { data } = await this.supabase
      .from('expo_daily_reports')
      .select('total_visitors, counselling_done, interested_students, leads_collected')
      .eq('institution_id', institutionId);

    const reports = data || [];
    return {
      total_visitors: reports.reduce((s, r) => s + (r.total_visitors || 0), 0),
      counselling_done: reports.reduce((s, r) => s + (r.counselling_done || 0), 0),
      interested_students: reports.reduce((s, r) => s + (r.interested_students || 0), 0),
      leads_collected: reports.reduce((s, r) => s + (r.leads_collected || 0), 0),
    };
  }

  static async getExpoComparison(institutionId: string): Promise<ExpoComparisonItem[]> {
    const { data } = await this.supabase
      .from('expo_events')
      .select(`
        id, event_name, city, total_expenses, total_leads_collected,
        daily_reports:expo_daily_reports(total_visitors)
      `)
      .eq('institution_id', institutionId)
      .in('event_status', ['completed', 'in_progress'])
      .order('start_date', { ascending: false })
      .limit(20);

    return (data || []).map(e => {
      const visitors = (e.daily_reports || []).reduce((s: number, r: any) => s + (r.total_visitors || 0), 0);
      return {
        id: e.id,
        event_name: e.event_name,
        city: e.city,
        total_leads: e.total_leads_collected || 0,
        total_expenses: e.total_expenses || 0,
        total_visitors: visitors,
        cost_per_lead: e.total_leads_collected > 0 ? (e.total_expenses || 0) / e.total_leads_collected : 0,
        conversion_rate: visitors > 0 ? ((e.total_leads_collected || 0) / visitors) * 100 : 0,
      };
    });
  }

  static async getDailyTrends(eventId: string): Promise<ExpoDailyTrend[]> {
    const { data } = await this.supabase
      .from('expo_daily_reports')
      .select('report_date, total_visitors, leads_collected, total_expense, counselling_done')
      .eq('expo_event_id', eventId)
      .order('report_date', { ascending: true });

    return (data || []).map(r => ({
      date: r.report_date,
      visitors: r.total_visitors || 0,
      leads: r.leads_collected || 0,
      expense: r.total_expense || 0,
      counselling: r.counselling_done || 0,
    }));
  }
}
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add lib/services/admission/expo-service.ts
git commit -m "feat(expo): add ExpoService with CRUD and analytics methods"
```

---

## Task 4: React Query Hooks

**Files:**
- Create: `hooks/admission/use-expos.ts`
- Modify: `hooks/admission/index.ts` (add re-exports)

**Step 1: Create `hooks/admission/use-expos.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExpoService } from '@/lib/services/admission/expo-service';
import type {
  ExpoMasterFilters,
  CreateExpoMasterInput,
  UpdateExpoMasterInput,
  ExpoEventFilters,
  CreateExpoEventInput,
  UpdateExpoEventInput,
  CreateExpoTeamMemberInput,
  CreateDailyReportInput,
  UpdateDailyReportInput,
} from '@/types/admission';

// ─── Query Keys ───────────────────────────────────────────────────────────

export const expoKeys = {
  all: ['expos'] as const,
  masters: (filters: ExpoMasterFilters) => ['expo-masters', filters] as const,
  master: (id: string) => ['expo-master', id] as const,
  events: (filters: ExpoEventFilters) => ['expo-events', filters] as const,
  event: (id: string) => ['expo-event', id] as const,
  teamMembers: (eventId: string) => ['expo-team', eventId] as const,
  dailyReports: (eventId: string) => ['expo-reports', eventId] as const,
  dailyReport: (id: string) => ['expo-report', id] as const,
  summaryStats: (institutionId: string) => ['expo-stats', institutionId] as const,
  expenseBreakdown: (institutionId: string) => ['expo-expense-breakdown', institutionId] as const,
  leadFunnel: (institutionId: string) => ['expo-lead-funnel', institutionId] as const,
  comparison: (institutionId: string) => ['expo-comparison', institutionId] as const,
  dailyTrends: (eventId: string) => ['expo-daily-trends', eventId] as const,
};

// ─── Expo Masters ─────────────────────────────────────────────────────────

export function useExpoMasters(filters: ExpoMasterFilters) {
  return useQuery({
    queryKey: expoKeys.masters(filters),
    queryFn: () => ExpoService.getExpoMasters(filters),
    enabled: !!filters.institution_id,
  });
}

export function useExpoMaster(id: string) {
  return useQuery({
    queryKey: expoKeys.master(id),
    queryFn: () => ExpoService.getExpoMaster(id),
    enabled: !!id,
  });
}

export function useCreateExpoMaster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExpoMasterInput) => ExpoService.createExpoMaster(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expo-masters'] });
      toast.success('Expo master created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateExpoMaster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateExpoMasterInput & { id: string }) =>
      ExpoService.updateExpoMaster(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expo-masters'] });
      qc.invalidateQueries({ queryKey: ['expo-master'] });
      toast.success('Expo master updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteExpoMaster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ExpoService.deleteExpoMaster(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expo-masters'] });
      toast.success('Expo master deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Expo Events ──────────────────────────────────────────────────────────

export function useExpoEvents(filters: ExpoEventFilters) {
  return useQuery({
    queryKey: expoKeys.events(filters),
    queryFn: () => ExpoService.getExpoEvents(filters),
    enabled: !!filters.institution_id,
  });
}

export function useExpoEvent(id: string) {
  return useQuery({
    queryKey: expoKeys.event(id),
    queryFn: () => ExpoService.getExpoEvent(id),
    enabled: !!id,
  });
}

export function useCreateExpoEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExpoEventInput) => ExpoService.createExpoEvent(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expo-events'] });
      qc.invalidateQueries({ queryKey: ['expo-stats'] });
      toast.success('Expo event created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateExpoEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateExpoEventInput & { id: string }) =>
      ExpoService.updateExpoEvent(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expo-events'] });
      qc.invalidateQueries({ queryKey: ['expo-event'] });
      toast.success('Expo event updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateExpoEventStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      ExpoService.updateEventStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expo-events'] });
      qc.invalidateQueries({ queryKey: ['expo-event'] });
      qc.invalidateQueries({ queryKey: ['expo-stats'] });
      toast.success('Event status updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Team Members ─────────────────────────────────────────────────────────

export function useExpoTeamMembers(eventId: string) {
  return useQuery({
    queryKey: expoKeys.teamMembers(eventId),
    queryFn: () => ExpoService.getTeamMembers(eventId),
    enabled: !!eventId,
  });
}

export function useAddExpoTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, ...input }: CreateExpoTeamMemberInput & { eventId: string }) =>
      ExpoService.addTeamMember(eventId, input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['expo-team', vars.eventId] });
      qc.invalidateQueries({ queryKey: ['expo-event'] });
      toast.success('Team member added');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useRemoveExpoTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, eventId }: { memberId: string; eventId: string }) =>
      ExpoService.removeTeamMember(memberId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['expo-team', vars.eventId] });
      qc.invalidateQueries({ queryKey: ['expo-event'] });
      toast.success('Team member removed');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Daily Reports ────────────────────────────────────────────────────────

export function useExpoDailyReports(eventId: string) {
  return useQuery({
    queryKey: expoKeys.dailyReports(eventId),
    queryFn: () => ExpoService.getDailyReports(eventId),
    enabled: !!eventId,
  });
}

export function useExpoDailyReport(id: string) {
  return useQuery({
    queryKey: expoKeys.dailyReport(id),
    queryFn: () => ExpoService.getDailyReport(id),
    enabled: !!id,
  });
}

export function useCreateDailyReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDailyReportInput) => ExpoService.createDailyReport(input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['expo-reports', vars.expo_event_id] });
      qc.invalidateQueries({ queryKey: ['expo-event'] });
      qc.invalidateQueries({ queryKey: ['expo-stats'] });
      toast.success('Daily report submitted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateDailyReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, eventId, ...input }: UpdateDailyReportInput & { id: string; eventId: string }) =>
      ExpoService.updateDailyReport(id, input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['expo-reports', vars.eventId] });
      qc.invalidateQueries({ queryKey: ['expo-report', vars.id] });
      qc.invalidateQueries({ queryKey: ['expo-event'] });
      toast.success('Daily report updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteDailyReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, eventId }: { id: string; eventId: string }) =>
      ExpoService.deleteDailyReport(id),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['expo-reports', vars.eventId] });
      qc.invalidateQueries({ queryKey: ['expo-event'] });
      qc.invalidateQueries({ queryKey: ['expo-stats'] });
      toast.success('Daily report deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Analytics ────────────────────────────────────────────────────────────

export function useExpoSummaryStats(institutionId: string) {
  return useQuery({
    queryKey: expoKeys.summaryStats(institutionId),
    queryFn: () => ExpoService.getSummaryStats(institutionId),
    enabled: !!institutionId,
  });
}

export function useExpoExpenseBreakdown(institutionId: string) {
  return useQuery({
    queryKey: expoKeys.expenseBreakdown(institutionId),
    queryFn: () => ExpoService.getExpenseBreakdown(institutionId),
    enabled: !!institutionId,
  });
}

export function useExpoLeadFunnel(institutionId: string) {
  return useQuery({
    queryKey: expoKeys.leadFunnel(institutionId),
    queryFn: () => ExpoService.getLeadFunnel(institutionId),
    enabled: !!institutionId,
  });
}

export function useExpoComparison(institutionId: string) {
  return useQuery({
    queryKey: expoKeys.comparison(institutionId),
    queryFn: () => ExpoService.getExpoComparison(institutionId),
    enabled: !!institutionId,
  });
}

export function useExpoDailyTrends(eventId: string) {
  return useQuery({
    queryKey: expoKeys.dailyTrends(eventId),
    queryFn: () => ExpoService.getDailyTrends(eventId),
    enabled: !!eventId,
  });
}
```

**Step 2: Add re-exports to `hooks/admission/index.ts`**

Add after the existing re-exports (after line 35):

```typescript
// Re-export expo hooks
export {
  expoKeys,
  useExpoMasters,
  useExpoMaster,
  useCreateExpoMaster,
  useUpdateExpoMaster,
  useDeleteExpoMaster,
  useExpoEvents,
  useExpoEvent,
  useCreateExpoEvent,
  useUpdateExpoEvent,
  useUpdateExpoEventStatus,
  useExpoTeamMembers,
  useAddExpoTeamMember,
  useRemoveExpoTeamMember,
  useExpoDailyReports,
  useExpoDailyReport,
  useCreateDailyReport,
  useUpdateDailyReport,
  useDeleteDailyReport,
  useExpoSummaryStats,
  useExpoExpenseBreakdown,
  useExpoLeadFunnel,
  useExpoComparison,
  useExpoDailyTrends,
} from './use-expos';
```

**Step 3: Commit**

```bash
git add hooks/admission/use-expos.ts hooks/admission/index.ts
git commit -m "feat(expo): add React Query hooks for expo module"
```

---

## Task 5: Photo Upload — Storage Service Extension

**Files:**
- Modify: `lib/storage/storage-service.ts` (add EXPO_PHOTOS bucket + upload method)

**Step 1: Add expo bucket constant and upload method**

Add `EXPO_PHOTOS: 'expo-photos'` to the `BUCKETS` object (after line 10).

Add the following method to the `StorageService` class:

```typescript
static async uploadExpoPhoto(
  file: File,
  institutionId: string,
  eventId: string,
  reportDate: string,
  photoType: 'stall' | 'event' | 'visitor'
): Promise<{ publicUrl: string | null; error: Error | null }> {
  try {
    await this.validateFile(file);

    const { data: { user }, error: userError } = await this.supabase.auth.getUser();
    if (userError || !user) throw new Error('Authentication required');

    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const fileName = `${photoType}_${Date.now()}.${fileExt}`;
    const filePath = `${institutionId}/${eventId}/${reportDate}/${fileName}`;

    const { error: uploadError } = await this.supabase.storage
      .from(BUCKETS.EXPO_PHOTOS)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = this.supabase.storage
      .from(BUCKETS.EXPO_PHOTOS)
      .getPublicUrl(filePath);

    return { publicUrl: urlData.publicUrl, error: null };
  } catch (error) {
    console.error('[admission/expos] Error uploading photo:', error);
    return { publicUrl: null, error: error instanceof Error ? error : new Error('Upload failed') };
  }
}

static async deleteExpoPhoto(url: string): Promise<void> {
  try {
    // Extract path from public URL
    const bucketPath = url.split(`${BUCKETS.EXPO_PHOTOS}/`)[1];
    if (bucketPath) {
      await this.supabase.storage.from(BUCKETS.EXPO_PHOTOS).remove([bucketPath]);
    }
  } catch (error) {
    console.error('[admission/expos] Error deleting photo:', error);
  }
}
```

**Step 2: Create the `expo-photos` bucket in Supabase Dashboard**

Go to Supabase Dashboard → Storage → Create Bucket:
- Name: `expo-photos`
- Public: Yes
- Max file size: 5MB
- Allowed MIME types: image/jpeg, image/png, image/gif, image/webp

**Step 3: Commit**

```bash
git add lib/storage/storage-service.ts
git commit -m "feat(expo): add expo photo upload to StorageService"
```

---

## Task 6: Sidebar Navigation & Permissions

**Files:**
- Modify: `lib/sidebarMenuLink.ts` (add Expos under Marketing menu + permission mappings)

**Step 1: Add Expos submenu items**

In `lib/sidebarMenuLink.ts`, add inside the Marketing `submenus` array (before the closing `]` at line 935):

```typescript
            {
              href: '/admission/marketing/expos',
              label: 'Expos',
              active: pathname.startsWith('/admission/marketing/expos')
            },
            {
              href: '/admission/marketing/expos/masters',
              label: 'Expo Masters',
              active: pathname === '/admission/marketing/expos/masters'
            },
            {
              href: '/admission/marketing/expos/analytics',
              label: 'Expo Analytics',
              active: pathname === '/admission/marketing/expos/analytics'
            },
```

**Step 2: Add permission mappings**

Add after line 383 in the `PAGE_PERMISSION_MAPPING`:

```typescript
  '/admission/marketing/expos': 'admission.marketing.expos.view',
  '/admission/marketing/expos/masters': 'admission.marketing.expos.view',
  '/admission/marketing/expos/new': 'admission.marketing.expos.create',
  '/admission/marketing/expos/analytics': 'admission.marketing.expos.view',
```

**Step 3: Commit**

```bash
git add lib/sidebarMenuLink.ts
git commit -m "feat(expo): add sidebar navigation and permission mappings"
```

---

## Task 7: Expo Events List Page (Main Landing)

**Files:**
- Create: `app/(routes)/admission/marketing/expos/page.tsx`
- Create: `app/(routes)/admission/marketing/expos/_components/columns.tsx`
- Create: `app/(routes)/admission/marketing/expos/_components/expos-data-table.tsx`
- Create: `app/(routes)/admission/marketing/expos/_components/row-actions.tsx`

**Step 1: Create `columns.tsx`**

Following the pattern from `publishers/_components/columns.tsx`:

```typescript
'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { MapPin, Calendar, Users, IndianRupee, UserCheck } from 'lucide-react';
import type { ExpoEvent } from '@/types/admission';
import { DataTableRowActions } from './row-actions';
import { format } from 'date-fns';

export function getStatusBadgeClass(status: string): string {
  const classes: Record<string, string> = {
    planned: 'bg-blue-100 text-blue-800',
    confirmed: 'bg-indigo-100 text-indigo-800',
    in_progress: 'bg-green-100 text-green-800',
    completed: 'bg-gray-100 text-gray-800',
    cancelled: 'bg-red-100 text-red-800',
  };
  return classes[status] || 'bg-gray-100 text-gray-800';
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    planned: 'Planned',
    confirmed: 'Confirmed',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return labels[status] || status;
}

export const columns: ColumnDef<ExpoEvent>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value: boolean) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 40,
  },
  {
    accessorKey: 'event_name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Event" />,
    cell: ({ row }) => {
      const expo = row.original;
      return (
        <div className="min-w-[180px]">
          <div className="font-medium">{expo.event_name}</div>
          {expo.organizer_name && (
            <div className="text-xs text-muted-foreground">{expo.organizer_name}</div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'city',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Location" />,
    cell: ({ row }) => {
      const expo = row.original;
      return (
        <div className="flex items-center gap-1 text-sm">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{expo.city}</span>
          {expo.venue_name && (
            <span className="text-xs text-muted-foreground">({expo.venue_name})</span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'start_date',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Dates" />,
    cell: ({ row }) => {
      const expo = row.original;
      return (
        <div className="flex items-center gap-1 text-sm">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span>
            {format(new Date(expo.start_date), 'dd MMM')} - {format(new Date(expo.end_date), 'dd MMM yyyy')}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: 'event_status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => {
      const status = row.getValue('event_status') as string;
      return <Badge className={getStatusBadgeClass(status)}>{getStatusLabel(status)}</Badge>;
    },
  },
  {
    accessorKey: 'total_team_members',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Team" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{row.getValue('total_team_members') ?? 0}</span>
      </div>
    ),
  },
  {
    accessorKey: 'total_leads_collected',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Leads" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-semibold text-green-600">{row.getValue('total_leads_collected') ?? 0}</span>
      </div>
    ),
  },
  {
    accessorKey: 'total_expenses',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Expenses" />,
    cell: ({ row }) => {
      const amount = (row.getValue('total_expenses') as number) ?? 0;
      return (
        <div className="flex items-center gap-0.5">
          <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium">{amount.toLocaleString('en-IN')}</span>
        </div>
      );
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => <DataTableRowActions row={row} />,
    enableSorting: false,
    enableHiding: false,
    size: 48,
  },
];
```

**Step 2: Create `expos-data-table.tsx`**

Following the pattern from `publishers-data-table.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { columns } from './columns';
import { useAuth } from '@/hooks/use-auth';
import { ExpoService } from '@/lib/services/admission/expo-service';
import type { ExpoEventStatus } from '@/types/admission';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'planned', label: 'Planned' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function ExposDataTable() {
  const { profile } = useAuth();
  const router = useRouter();
  const institutionId = profile?.institution_id || '';
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const handleRefresh = () => {
    setIsRefreshing(true);
    toast.success('Expos data refreshed');
    setTimeout(() => {
      setRefreshKey((k) => k + 1);
      setIsRefreshing(false);
    }, 300);
  };

  const fetchData = async (params: DataFetchParams) => {
    const result = await ExpoService.getExpoEvents({
      institution_id: institutionId,
      search: params.search || undefined,
      status: statusFilter !== 'all' ? (statusFilter as ExpoEventStatus) : undefined,
      page: params.page,
      limit: params.limit,
      sort_by: params.sort_by || 'start_date',
      sort_order: (params.sort_order as 'asc' | 'desc') || 'desc',
    });

    return {
      success: true,
      data: result.data,
      pagination: {
        page: result.metadata.page,
        limit: result.metadata.limit,
        total_pages: result.metadata.totalPages || 1,
        total_items: result.metadata.total,
      },
    };
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setRefreshKey(k => k + 1); }}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => router.push('/admission/marketing/expos/new')}>
            <Plus className="h-4 w-4 mr-1" />
            New Expo
          </Button>
        </div>
      </div>
      <DataTable
        key={refreshKey}
        fetchDataFn={fetchData as any}
        getColumns={() => columns as any}
        exportConfig={{
          entityName: 'expos',
          columnMapping: {},
          columnWidths: [],
          headers: [],
        }}
        idField="id"
        config={{
          enableUrlState: false,
          enableDateFilter: false,
          enableExport: false,
        }}
      />
    </div>
  );
}
```

**Step 3: Create `row-actions.tsx`**

Following the pattern from `publishers/_components/row-actions.tsx`:

```typescript
'use client';

import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import type { Row } from '@tanstack/react-table';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Eye, Edit, ClipboardPlus, XCircle, Loader2 } from 'lucide-react';
import type { ExpoEvent } from '@/types/admission';
import { useUpdateExpoEventStatus } from '@/hooks/admission/use-expos';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({ row }: DataTableRowActionsProps<TData>) {
  const expo = row.original as ExpoEvent;
  const router = useRouter();
  const updateStatus = useUpdateExpoEventStatus();
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const handleView = () => router.push(`/admission/marketing/expos/${expo.id}`);
  const handleEdit = () => router.push(`/admission/marketing/expos/${expo.id}/edit`);
  const handleAddReport = () => router.push(`/admission/marketing/expos/${expo.id}/report/new`);

  const handleCancel = () => {
    updateStatus.mutate(
      { id: expo.id, status: 'cancelled' },
      { onSuccess: () => setShowCancelDialog(false) }
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex h-8 w-8 p-0 data-[state=open]:bg-muted">
            <DotsHorizontalIcon className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[180px]">
          <DropdownMenuItem onSelect={handleView}>
            <Eye className="h-4 w-4 mr-2" /> View Details
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleEdit}>
            <Edit className="h-4 w-4 mr-2" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleAddReport}>
            <ClipboardPlus className="h-4 w-4 mr-2" /> Add Daily Report
          </DropdownMenuItem>
          {expo.event_status !== 'cancelled' && expo.event_status !== 'completed' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setShowCancelDialog(true)}
                className="text-red-600"
              >
                <XCircle className="h-4 w-4 mr-2" /> Cancel Event
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this expo event?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark <strong>{expo.event_name}</strong> as cancelled. You can reactivate it later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateStatus.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={updateStatus.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {updateStatus.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cancelling...</>
              ) : (
                'Yes, Cancel Event'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

**Step 4: Create `page.tsx`**

Following the pattern from `publishers/page.tsx`:

```typescript
'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { ExposDataTable } from './_components/expos-data-table';

function ExposPageContent() {
  return (
    <PermissionGuard module="admission.marketing.expos" action="view">
      <ContentLayout title="Expos">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/marketing/campaigns/monitoring">Marketing</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Expos</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <ExposDataTable />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function ExposPage() {
  return (
    <AdmissionErrorBoundary>
      <ExposPageContent />
    </AdmissionErrorBoundary>
  );
}
```

**Step 5: Commit**

```bash
git add app/(routes)/admission/marketing/expos/
git commit -m "feat(expo): add expo events list page with data table"
```

---

## Task 8: Expo Masters Page

**Files:**
- Create: `app/(routes)/admission/marketing/expos/masters/page.tsx`

**Step 1: Create masters page with inline CRUD dialog**

This page shows a table of expo masters with a dialog for create/edit. Since expo masters are simple catalog entries, use an inline modal rather than a separate page.

The page should include:
- DataTable listing all masters with columns: Event Name, Organizer, City, Venue, Frequency, Active status, Actions
- "Add Expo Master" button opening a dialog form
- Edit action opening the same dialog pre-filled
- Toggle active/inactive action
- Delete action with confirmation

Follow the same page wrapper pattern as `publishers/page.tsx` with PermissionGuard and ContentLayout.

**Step 2: Commit**

```bash
git add app/(routes)/admission/marketing/expos/masters/
git commit -m "feat(expo): add expo masters catalog page"
```

---

## Task 9: Create Expo Event Form Page

**Files:**
- Create: `app/(routes)/admission/marketing/expos/new/page.tsx`
- Create: `app/(routes)/admission/marketing/expos/_components/expo-event-form.tsx`
- Create: `app/(routes)/admission/marketing/expos/_components/team-member-picker.tsx`

**Step 1: Create `team-member-picker.tsx`**

A component that allows adding team members from 3 sources:
- Staff dropdown (from `useFacultyForDropdown`)
- Student dropdown (from `useStudentsForDropdown`)
- Free-text external entry (name + phone fields)

Shows a table of added members with role selector and remove button.

**Step 2: Create `expo-event-form.tsx`**

A reusable form component used by both create and edit pages. Sections:
1. **Expo Master Selection** — Combobox to select from masters, auto-fills organizer/city/venue
2. **Event Details** — Event name (override), organizer, city, venue
3. **Schedule** — Start date, end date (date pickers)
4. **Logistics** — Travel mode (select), accommodation details (textarea)
5. **Team** — Team leader (staff dropdown), TeamMemberPicker component
6. **Approval** — Approved by (staff dropdown), status (select), notes (textarea)

Follow the form pattern from `leads/new/page.tsx` with Card sections and validation.

**Step 3: Create `new/page.tsx`**

Wrapper page with breadcrumbs, PermissionGuard, renders ExpoEventForm in create mode.

**Step 4: Commit**

```bash
git add app/(routes)/admission/marketing/expos/new/ app/(routes)/admission/marketing/expos/_components/expo-event-form.tsx app/(routes)/admission/marketing/expos/_components/team-member-picker.tsx
git commit -m "feat(expo): add create expo event form with team picker"
```

---

## Task 10: Edit Expo Event Page

**Files:**
- Create: `app/(routes)/admission/marketing/expos/[id]/edit/page.tsx`

**Step 1: Create edit page**

Uses the same `ExpoEventForm` component from Task 9 but in edit mode:
- Fetches existing event data using `useExpoEvent(id)`
- Pre-fills the form with existing values
- Shows loading skeleton while fetching
- Uses `useUpdateExpoEvent` mutation on submit

Follow `consultants/[id]/edit/page.tsx` pattern for the page wrapper.

**Step 2: Commit**

```bash
git add app/(routes)/admission/marketing/expos/[id]/edit/
git commit -m "feat(expo): add edit expo event page"
```

---

## Task 11: Expo Event Detail Page (Tabbed)

**Files:**
- Create: `app/(routes)/admission/marketing/expos/[id]/page.tsx`

**Step 1: Create tabbed detail page**

Following the pattern from `consultants/[id]/page.tsx` with Tabs component:

**Tab 1 — Overview:**
- Event info card (name, organizer, city, venue, dates, travel, accommodation)
- Status badge with status change buttons (only valid transitions)
- Approved by display
- KPI strip: Total Team, Total Leads, Total Expenses, Cost per Lead

**Tab 2 — Team:**
- Team leader highlight card
- Team members table (name, type, phone, role)
- Add member button (opens TeamMemberPicker dialog)
- Remove member action

**Tab 3 — Daily Reports:**
- Timeline of daily reports sorted by date
- Each report card shows: date, expense summary, engagement metrics, photo thumbnails
- "Add Report" button → navigates to report/new
- Click report → expands to show full details

**Tab 4 — Analytics:**
- Event-specific metrics using `useExpoDailyTrends(id)`
- Daily visitors/leads line chart (Recharts)
- Expense accumulation chart
- Lead funnel for this specific event

Uses `useExpoEvent(id)` for data. Shows `Skeleton` loading state.

**Step 2: Commit**

```bash
git add app/(routes)/admission/marketing/expos/[id]/page.tsx
git commit -m "feat(expo): add expo event detail page with tabs"
```

---

## Task 12: Daily Report Form Page

**Files:**
- Create: `app/(routes)/admission/marketing/expos/[id]/report/new/page.tsx`
- Create: `app/(routes)/admission/marketing/expos/_components/daily-report-form.tsx`
- Create: `app/(routes)/admission/marketing/expos/_components/photo-upload-grid.tsx`

**Step 1: Create `photo-upload-grid.tsx`**

A reusable component for uploading multiple photos:
- Accept a `label` prop ("Stall Photos", "Event Photos", "Visitor Photos")
- Drag-and-drop zone or click-to-upload
- Shows thumbnails of uploaded photos with remove button
- Max 10 photos per section
- Uses `StorageService.uploadExpoPhoto()` for upload
- Returns array of public URLs to parent

**Step 2: Create `daily-report-form.tsx`**

Form with sections:
1. **Report Date** — Date picker (defaults to today, must be within event date range)
2. **Expenses** — 6 numeric input fields (stall_fee, travel, accommodation, food, printing, misc) with live-calculated total displayed prominently
3. **Engagement Metrics** — 5 numeric inputs (visitors, counselling, brochures, interested, leads)
4. **Photos** — 3 PhotoUploadGrid instances (stall, event, visitor)
5. **Notes** — Textarea

Uses `useCreateDailyReport` mutation. Validates report_date is within event date range and not duplicate.

**Step 3: Create `report/new/page.tsx`**

Wrapper page with breadcrumbs showing: Dashboard > Admission > Marketing > Expos > {Event Name} > New Report

Fetches the parent event with `useExpoEvent(id)` to show event name in breadcrumbs and validate date range.

**Step 4: Commit**

```bash
git add app/(routes)/admission/marketing/expos/[id]/report/ app/(routes)/admission/marketing/expos/_components/daily-report-form.tsx app/(routes)/admission/marketing/expos/_components/photo-upload-grid.tsx
git commit -m "feat(expo): add daily report form with photo upload"
```

---

## Task 13: Analytics Dashboard Page

**Files:**
- Create: `app/(routes)/admission/marketing/expos/analytics/page.tsx`
- Create: `app/(routes)/admission/marketing/expos/_components/expo-analytics-charts.tsx`

**Step 1: Create `expo-analytics-charts.tsx`**

Chart components using Recharts (already available in the project):

1. **ExpenseBreakdownChart** — Pie chart from `useExpoExpenseBreakdown`
2. **LeadFunnelChart** — Horizontal bar/funnel from `useExpoLeadFunnel`
3. **ExpoComparisonChart** — Bar chart comparing expos from `useExpoComparison`
4. **DailyTrendsChart** — Multi-line chart from `useExpoDailyTrends` (used on event detail page)

**Step 2: Create `analytics/page.tsx`**

Dashboard layout:
- **KPI Strip** (top): 7 summary cards from `useExpoSummaryStats`
  - Total Expos, Active Expos, Total Leads, Total Expenses, Avg Cost/Lead, Total Visitors, Conversion Rate
- **ROI Section**: ExpenseBreakdownChart (pie) + ExpoComparisonChart (bar) side by side
- **Performance Section**: LeadFunnelChart + top-performing expos table

Follow the existing dashboard patterns (KPI cards with icons, grid layout).

**Step 3: Commit**

```bash
git add app/(routes)/admission/marketing/expos/analytics/
git commit -m "feat(expo): add analytics dashboard with ROI and performance charts"
```

---

## Task 14: Final Integration & Verification

**Step 1: Verify all imports resolve**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Fix any TypeScript errors.

**Step 2: Verify dev server starts**

Run: `npm run dev`
Navigate to `/admission/marketing/expos` and verify the page loads.

**Step 3: Test navigation**

- Sidebar shows Expos, Expo Masters, Expo Analytics under Marketing
- All links navigate correctly
- Breadcrumbs show proper hierarchy

**Step 4: Run SQL on Supabase**

Execute all SQL from Task 2 (tables, policies, triggers) in Supabase SQL Editor.
Verify tables created with: `SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'expo%';`

**Step 5: Create the `expo-photos` storage bucket**

In Supabase Dashboard → Storage → Create bucket named `expo-photos` (public, 5MB limit).

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat(expo): complete expo module integration and verification"
```

---

## Summary

| Task | Description | Files | Estimated Complexity |
|------|-------------|-------|---------------------|
| 1 | TypeScript types | 1 modified | Low |
| 2 | Database schema (SQL) | 4 modified | Medium |
| 3 | ExpoService | 1 new | High |
| 4 | React Query hooks | 1 new, 1 modified | Medium |
| 5 | Storage service extension | 1 modified | Low |
| 6 | Sidebar + permissions | 1 modified | Low |
| 7 | Expo list page + DataTable | 4 new | Medium |
| 8 | Expo masters page | 1 new | Medium |
| 9 | Create event form + team picker | 3 new | High |
| 10 | Edit event page | 1 new | Low |
| 11 | Event detail page (tabbed) | 1 new | High |
| 12 | Daily report form + photo upload | 3 new | High |
| 13 | Analytics dashboard | 2 new | High |
| 14 | Integration verification | 0 new | Low |

**Total: 17 new files, 8 modified files, 14 tasks**
