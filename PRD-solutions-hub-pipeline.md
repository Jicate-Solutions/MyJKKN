# PRD: Solutions Hub Pipeline & Bug Fixes

**Status:** Ready for implementation
**Date:** 2026-02-20
**Author:** Generated from FST analysis of JICATE follow-up needs
**Priority:** Phase A first, then B, then C (gated)

---

## Overview

Add a prospect/lead pipeline layer to MyJKKN Solutions Hub and fix 4 remaining bugs. Solutions Hub currently handles client → solution → phase → payment lifecycle perfectly (31 tables, 26 services). But it has ZERO pre-sale tracking — no way to track prospects before they become clients.

**Goal:** A CBO (Chief Business Officer) can track every prospect from first contact through to won/lost, then seamlessly convert winners into Solutions Hub clients.

---

## Phase A: Fix Remaining Bugs (4 items — A1 was verified not a bug)

### A1. Payment Date Display — VERIFIED NOT A BUG

**Status:** No action needed. The `paid_at` field at line 697 of `solution-detail.tsx` is confirmed correct — it matches the DB column name. The initial audit misidentified this as a `paid_at` vs `payment_date` mismatch, but code inspection confirms `paid_at` is the correct field name used in both the service layer and UI.

**Skip this item and proceed to A2.**

---

### A2. Client Form Missing Fields

**File:** `/Users/omm/PROJECTS/myjkkn/components/solutions/clients/client-form.tsx`

**Current Zod schema includes:** name, industry, contact_person, contact_phone, contact_email, address, city, company_size, source_type, source_department_id, partner_status.

**Add these fields to the Zod schema (all optional):**

| Field | Zod Type | Placement |
|-------|----------|-----------|
| `state` | `z.string().optional()` | After `city` in Company Information section |
| `pincode` | `z.string().optional()` | After `state` |
| `gst_number` | `z.string().optional()` | New "Business Details" section (collapsible) |
| `pan_number` | `z.string().optional()` | In "Business Details" section |
| `website` | `z.string().url().optional().or(z.literal(''))` | In "Business Details" section |

**Implementation details:**
1. Add fields to the `clientFormSchema` zod object
2. Add corresponding form inputs in the JSX — create a new collapsible section called "Business Details" AFTER the existing "Source & Partnership" section
3. Use `<details>` or a collapsible Card so the form doesn't feel longer for basic use
4. The `clients-service.ts` already maps these fields — check `createClient()` and `updateClient()` methods accept them
5. Match the field-to-DB-column mapping in `clients-service.ts` (e.g., `industry` maps to `industry_sector`)

**Do NOT add:** logo_url (needs file upload), linkedin_url (low priority), tags (array field, defer), intent_agency_id (auto-populated from Intent Platform), notes (exists on detail page)

---

### A3. MoU Status Card Hardcoded

**File:** `/Users/omm/PROJECTS/myjkkn/app/(routes)/solutions/[id]/_components/solution-detail.tsx`

**Current code (lines 488-495):**
```tsx
<Card>
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
    <CardTitle className="text-sm font-medium">MoU</CardTitle>
    <ScrollText className="h-4 w-4 text-muted-foreground" />
  </CardHeader>
  <CardContent>
    <Badge variant="outline">Not Created</Badge>
    <Button variant="link" size="sm" className="p-0 h-auto mt-1" asChild>
      <Link href={`/solutions/${solutionId}/mou`}>Create MoU</Link>
    </Button>
  </CardContent>
</Card>
```

**Fix:**
1. Import `useMouBySolution` from `@/hooks/solutions/use-mous`
2. Add hook call: `const { data: mouData } = useMouBySolution(solutionId);`
3. Replace the hardcoded Badge with conditional rendering:
   - If `mouData`: show status badge (`mouData.status`) with appropriate variant + link to `/solutions/${solutionId}/mou`
   - If no `mouData`: show "Not Created" badge + "Create MoU" link (current behavior)
4. Status badge color mapping: draft=secondary, pending_signatures=default, active=green outline, expired=destructive, terminated=destructive

---

### A4. Training Sessions Tab Stub

**File:** `/Users/omm/PROJECTS/myjkkn/app/(routes)/solutions/[id]/_components/solution-detail.tsx`

**Current code (lines 618-635):** Static "No sessions scheduled yet" with non-functional button.

**Fix — mirror the Phases tab pattern (lines 510-614):**
1. Import `useTrainingSessionsBySolution` (check exact name in `use-training.ts`) and create session mutation
2. Add hook call to fetch training sessions for this solution
3. Replace static content with:
   - If sessions exist: render list items with session title, status badge, date, linked program
   - If empty: show "No sessions scheduled yet" with functional "Schedule Session" button
4. Add a Dialog for creating a new training session (mirror the phaseDialogOpen pattern at line 132):
   - Fields: title (text), scheduled_date (date picker), duration_minutes (number)
   - On submit: call create mutation with `solution_id: solutionId`

**Reference hooks file:** `/Users/omm/PROJECTS/myjkkn/hooks/solutions/use-training.ts`
**Reference service:** `/Users/omm/PROJECTS/myjkkn/lib/services/solutions/training-service.ts`
**Query keys exist:** `solutionsHubKeys.trainingSessions.list(filters)`, `.byProgram(programId)`

**Note:** Training sessions belong to programs, not directly to solutions. The tab should first check if a training program exists for this solution, then show its sessions. If no program exists, show "Create Training Program" first.

---

### A5. Content Deliverables Tab Stub

**File:** `/Users/omm/PROJECTS/myjkkn/app/(routes)/solutions/[id]/_components/solution-detail.tsx`

**Current code (lines 637-655):** Static "No deliverables added yet" with non-functional button.

**Fix — same pattern as A4:**
1. Import content hooks from `@/hooks/solutions/use-content`
2. Content deliverables belong to content orders, which belong to solutions
3. First check if content orders exist for this solution. If not, prompt to create one.
4. If orders exist, show deliverables with: title, status badge, content_type, assigned learner
5. Add Dialog for creating a deliverable:
   - Fields: title (text), content_type (select from enum), description (textarea)
   - On submit: call create mutation

**Reference hooks file:** `/Users/omm/PROJECTS/myjkkn/hooks/solutions/use-content.ts`
**Reference service:** `/Users/omm/PROJECTS/myjkkn/lib/services/solutions/content-service.ts`
**Query keys exist:** `solutionsHubKeys.contentOrders.bySolution(solutionId)`, `solutionsHubKeys.contentDeliverables.byOrder(orderId)`

---

### Phase A Verification

After all A1-A5 fixes:
1. Open Solutions Hub dashboard — should load without errors
2. Create a test client — should show state/pincode/gst fields in collapsible section
3. Create a test solution — navigate to detail page
4. Check MoU card — should show real status (or "Not Created" if none)
5. Check payments tab — dates should display correctly
6. For a training solution — Sessions tab should be functional
7. For a content solution — Deliverables tab should be functional

---

## Phase B: Prospect Pipeline Layer

### B1. Database Migration

**Create file:** `/Users/omm/PROJECTS/myjkkn/supabase/migrations/20260221000001_add_prospect_pipeline.sql`

**Contents:**

```sql
-- ============================================
-- Solutions Hub: Prospect Pipeline Layer
-- ============================================

-- 1. New enum: pipeline stage
DO $$ BEGIN
    CREATE TYPE sh_pipeline_stage AS ENUM (
        'lead',
        'qualified',
        'proposal',
        'negotiation',
        'won',
        'lost',
        'dormant'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. New table: sh_prospects
CREATE TABLE IF NOT EXISTS public.sh_prospects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_code TEXT NOT NULL,
    company_name TEXT NOT NULL,
    contact_person TEXT NOT NULL,
    contact_email TEXT,
    contact_phone TEXT NOT NULL,
    source_type sh_source_type NOT NULL DEFAULT 'direct',
    source_detail TEXT,
    pipeline_stage sh_pipeline_stage NOT NULL DEFAULT 'lead',
    expected_deal_size NUMERIC,
    expected_close_date DATE,
    solution_type_interest sh_solution_type,
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    next_action TEXT,
    next_action_date DATE,
    last_contact_date TIMESTAMPTZ,
    notes TEXT,
    tags TEXT[],
    converted_client_id UUID REFERENCES public.sh_clients(id) ON DELETE SET NULL,
    lost_reason TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- 3. New table: sh_prospect_activities
CREATE TABLE IF NOT EXISTS public.sh_prospect_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id UUID NOT NULL REFERENCES public.sh_prospects(id) ON DELETE CASCADE,
    activity_type sh_communication_type NOT NULL DEFAULT 'other',
    subject TEXT,
    summary TEXT NOT NULL,
    activity_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    next_action TEXT,
    next_action_date DATE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_sh_prospects_pipeline_stage ON sh_prospects(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_sh_prospects_assigned_to ON sh_prospects(assigned_to);
CREATE INDEX IF NOT EXISTS idx_sh_prospects_next_action_date ON sh_prospects(next_action_date);
CREATE INDEX IF NOT EXISTS idx_sh_prospects_is_active ON sh_prospects(is_active);
CREATE INDEX IF NOT EXISTS idx_sh_prospect_activities_prospect_id ON sh_prospect_activities(prospect_id);
CREATE INDEX IF NOT EXISTS idx_sh_prospect_activities_activity_date ON sh_prospect_activities(activity_date);

-- 5. RLS
ALTER TABLE sh_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_prospect_activities ENABLE ROW LEVEL SECURITY;

-- Prospects policies
DROP POLICY IF EXISTS "sh_prospects_select" ON sh_prospects;
DROP POLICY IF EXISTS "sh_prospects_insert" ON sh_prospects;
DROP POLICY IF EXISTS "sh_prospects_update" ON sh_prospects;
DROP POLICY IF EXISTS "sh_prospects_delete" ON sh_prospects;

CREATE POLICY "sh_prospects_select" ON sh_prospects
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_prospects_insert" ON sh_prospects
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_prospects_update" ON sh_prospects
    FOR UPDATE USING (
        sh_has_management_access()
    );

CREATE POLICY "sh_prospects_delete" ON sh_prospects
    FOR DELETE USING (
        sh_is_admin()
    );

-- Prospect activities policies
DROP POLICY IF EXISTS "sh_prospect_activities_select" ON sh_prospect_activities;
DROP POLICY IF EXISTS "sh_prospect_activities_insert" ON sh_prospect_activities;
DROP POLICY IF EXISTS "sh_prospect_activities_update" ON sh_prospect_activities;
DROP POLICY IF EXISTS "sh_prospect_activities_delete" ON sh_prospect_activities;

CREATE POLICY "sh_prospect_activities_select" ON sh_prospect_activities
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_prospect_activities_insert" ON sh_prospect_activities
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_prospect_activities_update" ON sh_prospect_activities
    FOR UPDATE USING (
        sh_has_management_access()
    );

CREATE POLICY "sh_prospect_activities_delete" ON sh_prospect_activities
    FOR DELETE USING (
        sh_is_admin()
    );

-- 6. Auto-update last_contact_date on prospect when activity is logged
CREATE OR REPLACE FUNCTION public.sh_update_prospect_last_contact()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE sh_prospects
    SET last_contact_date = NEW.activity_date,
        updated_at = NOW()
    WHERE id = NEW.prospect_id;

    -- Also update next_action if the activity provides one
    IF NEW.next_action IS NOT NULL THEN
        UPDATE sh_prospects
        SET next_action = NEW.next_action,
            next_action_date = NEW.next_action_date,
            updated_at = NOW()
        WHERE id = NEW.prospect_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sh_update_prospect_last_contact ON sh_prospect_activities;
CREATE TRIGGER trg_sh_update_prospect_last_contact
    AFTER INSERT ON sh_prospect_activities
    FOR EACH ROW
    EXECUTE FUNCTION sh_update_prospect_last_contact();

-- 7. Auto-create client when prospect stage changes to 'won'
CREATE OR REPLACE FUNCTION public.sh_prospect_won_to_client()
RETURNS TRIGGER AS $$
DECLARE
    new_client_id UUID;
BEGIN
    -- Only fire when pipeline_stage changes to 'won' and no client already linked
    IF NEW.pipeline_stage = 'won'
       AND (OLD.pipeline_stage IS DISTINCT FROM 'won')
       AND NEW.converted_client_id IS NULL
    THEN
        INSERT INTO sh_clients (
            name,
            contact_person,
            contact_email,
            contact_phone,
            source_type,
            partner_status,
            notes,
            tags,
            is_active,
            created_by
        ) VALUES (
            NEW.company_name,
            NEW.contact_person,
            NEW.contact_email,
            NEW.contact_phone,
            NEW.source_type,
            'standard',
            'Auto-created from prospect: ' || NEW.prospect_code,
            NEW.tags,
            true,
            NEW.created_by
        )
        RETURNING id INTO new_client_id;

        -- Link the new client back to the prospect
        NEW.converted_client_id := new_client_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sh_prospect_won_to_client ON sh_prospects;
CREATE TRIGGER trg_sh_prospect_won_to_client
    BEFORE UPDATE ON sh_prospects
    FOR EACH ROW
    EXECUTE FUNCTION sh_prospect_won_to_client();
```

**Apply migration:** Run `~/bin/supabase db push` from the project root, or apply via Supabase dashboard SQL editor.

---

### B2. Types

**File:** `/Users/omm/PROJECTS/myjkkn/lib/services/solutions/types.ts`

**Add these type definitions** (insert after the existing enum types section, before the BaseEntity):

```typescript
// Pipeline
export type PipelineStage = 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost' | 'dormant';

// After the interface section, add:

export interface Prospect extends BaseEntity {
  prospect_code: string;
  company_name: string;
  contact_person: string;
  contact_email?: string;
  contact_phone: string;
  source_type: SourceType;
  source_detail?: string;
  pipeline_stage: PipelineStage;
  expected_deal_size?: number;
  expected_close_date?: string;
  solution_type_interest?: SolutionType;
  assigned_to?: string;
  next_action?: string;
  next_action_date?: string;
  last_contact_date?: string;
  notes?: string;
  tags?: string[];
  converted_client_id?: string;
  lost_reason?: string;
  is_active: boolean;
  created_by?: string;
  // Joined fields (populated by service with select joins)
  assigned_user?: { id: string; full_name: string; avatar_url?: string };
  converted_client?: { id: string; name: string };
}

export interface ProspectActivity extends BaseEntity {
  prospect_id: string;
  activity_type: CommunicationType;
  subject?: string;
  summary: string;
  activity_date: string;
  next_action?: string;
  next_action_date?: string;
  created_by?: string;
  // Joined fields
  created_by_user?: { id: string; full_name: string };
}

export interface CreateProspectInput {
  company_name: string;
  contact_person: string;
  contact_email?: string;
  contact_phone: string;
  source_type?: SourceType;
  source_detail?: string;
  pipeline_stage?: PipelineStage;
  expected_deal_size?: number;
  expected_close_date?: string;
  solution_type_interest?: SolutionType;
  assigned_to?: string;
  next_action?: string;
  next_action_date?: string;
  notes?: string;
  tags?: string[];
}

export interface CreateProspectActivityInput {
  prospect_id: string;
  activity_type?: CommunicationType;
  subject?: string;
  summary: string;
  activity_date?: string;
  next_action?: string;
  next_action_date?: string;
}

export interface ProspectStats {
  total: number;
  byStage: Record<PipelineStage, number>;
  totalPipelineValue: number;
  overdueFollowUps: number;
  wonThisMonth: number;
  lostThisMonth: number;
  avgDaysInPipeline: number;
}
```

---

### B3. Service Layer

**Create file:** `/Users/omm/PROJECTS/myjkkn/lib/services/solutions/prospects-service.ts`

**Pattern:** Follow `clients-service.ts` exactly. Key methods:

```typescript
import { BaseService, BaseListResponse } from '../base-service';
import { sanitizeSearch } from '@/lib/config/pagination';
import type {
  Prospect, ProspectActivity, CreateProspectInput, CreateProspectActivityInput,
  ProspectStats, PipelineStage, SourceType, SolutionType
} from './types';

interface ProspectFilters {
  page?: number;
  limit?: number;
  search?: string;
  pipeline_stage?: PipelineStage;
  assigned_to?: string;
  source_type?: SourceType;
  solution_type_interest?: SolutionType;
  is_active?: boolean;
  overdue_only?: boolean; // next_action_date < today
}

interface UpdateProspectInput {
  company_name?: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  source_type?: SourceType;
  source_detail?: string;
  pipeline_stage?: PipelineStage;
  expected_deal_size?: number;
  expected_close_date?: string;
  solution_type_interest?: SolutionType;
  assigned_to?: string;
  next_action?: string;
  next_action_date?: string;
  notes?: string;
  tags?: string[];
  lost_reason?: string;
}

export class ProspectsService extends BaseService {

  // Prospect code generation: JKKN-PRO-YYYY-NNN
  static async generateProspectCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `JKKN-PRO-${year}-`;
    const { data } = await this.supabase
      .from('sh_prospects')
      .select('prospect_code')
      .like('prospect_code', `${prefix}%`)
      .order('prospect_code', { ascending: false })
      .limit(1);
    const lastNum = data?.[0]?.prospect_code
      ? parseInt(data[0].prospect_code.replace(prefix, ''), 10)
      : 0;
    return `${prefix}${String(lastNum + 1).padStart(3, '0')}`;
  }

  // CRUD
  static async getProspects(filters?: ProspectFilters): Promise<BaseListResponse<Prospect>>
  static async getProspectById(id: string): Promise<Prospect | null>
  static async createProspect(input: CreateProspectInput): Promise<Prospect>
  static async updateProspect(id: string, input: UpdateProspectInput): Promise<Prospect>
  static async deleteProspect(id: string): Promise<void>

  // Pipeline-specific
  static async updatePipelineStage(id: string, stage: PipelineStage, lostReason?: string): Promise<Prospect>
  // Note: won→client conversion is handled by the DB trigger. After updating stage to 'won',
  // re-fetch the prospect to get converted_client_id.

  // Activities
  static async getProspectActivities(prospectId: string): Promise<ProspectActivity[]>
  static async logActivity(input: CreateProspectActivityInput): Promise<ProspectActivity>

  // Stats
  static async getProspectStats(): Promise<ProspectStats>
  // Implementation: COUNT grouped by pipeline_stage, SUM of expected_deal_size,
  // COUNT where next_action_date < NOW() for overdue,
  // COUNT where pipeline_stage='won' AND updated_at in current month for wonThisMonth

  // Pipeline board data (optimized query for Kanban)
  static async getPipelineBoard(): Promise<Record<PipelineStage, Prospect[]>>
  // Returns prospects grouped by stage, each with assigned_user joined,
  // ordered by next_action_date ASC within each stage
}

// Singleton export
export const prospectsService = {
  generateProspectCode: ProspectsService.generateProspectCode.bind(ProspectsService),
  getProspects: ProspectsService.getProspects.bind(ProspectsService),
  getProspectById: ProspectsService.getProspectById.bind(ProspectsService),
  createProspect: ProspectsService.createProspect.bind(ProspectsService),
  updateProspect: ProspectsService.updateProspect.bind(ProspectsService),
  deleteProspect: ProspectsService.deleteProspect.bind(ProspectsService),
  updatePipelineStage: ProspectsService.updatePipelineStage.bind(ProspectsService),
  getProspectActivities: ProspectsService.getProspectActivities.bind(ProspectsService),
  logActivity: ProspectsService.logActivity.bind(ProspectsService),
  getProspectStats: ProspectsService.getProspectStats.bind(ProspectsService),
  getPipelineBoard: ProspectsService.getPipelineBoard.bind(ProspectsService),
};

export type { ProspectFilters, UpdateProspectInput };
```

**Join pattern for `assigned_user`:**
```typescript
.select(`
  *,
  assigned_user:profiles!assigned_to(id, full_name, avatar_url),
  converted_client:sh_clients!converted_client_id(id, name)
`)
```

**Register in index:**
**File:** `/Users/omm/PROJECTS/myjkkn/lib/services/solutions/index.ts`

Add:
```typescript
// Prospects & Pipeline
export { prospectsService, ProspectsService } from './prospects-service';
export type { ProspectFilters, UpdateProspectInput } from './prospects-service';
```

---

### B4. Query Keys

**File:** `/Users/omm/PROJECTS/myjkkn/lib/query-keys.ts`

Add inside `solutionsHubKeys` object (after the `products` section, before `departmentDashboard`):

```typescript
  // Prospects & Pipeline
  prospects: {
    all: ['solutions-hub', 'prospects'] as const,
    list: (filters?: FilterObject) =>
      [...solutionsHubKeys.prospects.all, 'list', filters] as const,
    detail: (id: string) =>
      [...solutionsHubKeys.prospects.all, 'detail', id] as const,
    stats: () =>
      [...solutionsHubKeys.prospects.all, 'stats'] as const,
    pipelineBoard: () =>
      [...solutionsHubKeys.prospects.all, 'pipeline-board'] as const,
    activities: (prospectId: string) =>
      [...solutionsHubKeys.prospects.all, 'activities', prospectId] as const,
    overdue: () =>
      [...solutionsHubKeys.prospects.all, 'overdue'] as const,
  },
```

---

### B5. Hooks

**Create file:** `/Users/omm/PROJECTS/myjkkn/hooks/solutions/use-prospects.ts`

```typescript
'use client';

/**
 * React Query hooks for prospect pipeline management.
 * Handles CRUD, pipeline stage changes, activity logging, and stats.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import {
  prospectsService,
  type ProspectFilters,
  type UpdateProspectInput,
} from '@/lib/services/solutions/prospects-service';
import type {
  CreateProspectInput,
  CreateProspectActivityInput,
  PipelineStage,
} from '@/lib/services/solutions/types';

// --- Query hooks ---

export function useProspects(filters?: ProspectFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.prospects.list(filters),
    queryFn: () => prospectsService.getProspects(filters),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useProspect(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.prospects.detail(id),
    queryFn: () => prospectsService.getProspectById(id),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useProspectStats() {
  return useQuery({
    queryKey: solutionsHubKeys.prospects.stats(),
    queryFn: () => prospectsService.getProspectStats(),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function usePipelineBoard() {
  return useQuery({
    queryKey: solutionsHubKeys.prospects.pipelineBoard(),
    queryFn: () => prospectsService.getPipelineBoard(),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useProspectActivities(prospectId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.prospects.activities(prospectId),
    queryFn: () => prospectsService.getProspectActivities(prospectId),
    enabled: !!prospectId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// --- Mutation hooks ---

export function useCreateProspect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProspectInput) => prospectsService.createProspect(input),
    onSuccess: (data) => {
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.prospects.detail(data.id), data);
      }
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.prospects.all });
    },
  });
}

export function useUpdateProspect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProspectInput }) =>
      prospectsService.updateProspect(id, input),
    onSuccess: (data) => {
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.prospects.detail(data.id), data);
      }
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.prospects.all });
    },
  });
}

export function useUpdatePipelineStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage, lostReason }: { id: string; stage: PipelineStage; lostReason?: string }) =>
      prospectsService.updatePipelineStage(id, stage, lostReason),
    onSuccess: (data) => {
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.prospects.detail(data.id), data);
      }
      // Invalidate board + stats + list
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.prospects.all });
      // If won, also invalidate clients (new client was auto-created)
      if (data?.converted_client_id) {
        queryClient.invalidateQueries({ queryKey: solutionsHubKeys.clients.all });
      }
    },
  });
}

export function useDeleteProspect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => prospectsService.deleteProspect(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.prospects.all });
    },
  });
}

export function useLogProspectActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProspectActivityInput) => prospectsService.logActivity(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.prospects.activities(data.prospect_id),
      });
      // Also refresh the prospect detail (last_contact_date was auto-updated by trigger)
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.prospects.all });
    },
  });
}
```

**Register in hooks index:**
**File:** `/Users/omm/PROJECTS/myjkkn/hooks/solutions/index.ts`

Add re-exports for all prospect hooks.

---

### B6. Routes & Pages

**Create these directories and page files:**

#### B6.1 Pipeline Board (Main Page)

**File:** `/Users/omm/PROJECTS/myjkkn/app/(routes)/solutions/pipeline/page.tsx`

Server component page wrapper:
- Title: "Pipeline | Solutions Hub"
- Breadcrumb: Home > Solutions Hub > Pipeline
- Heading: "Prospect Pipeline"
- Description: "Track and manage all JICATE prospects from lead to close"
- Render `<PipelineBoard />` client component

**File:** `/Users/omm/PROJECTS/myjkkn/app/(routes)/solutions/pipeline/_components/pipeline-board.tsx`

Client component — the Kanban board:
- Use `usePipelineBoard()` hook
- Render 5 active columns: Lead, Qualified, Proposal, Negotiation, Won
- Below the main board, show collapsed "Lost" and "Dormant" sections
- Each column shows count and total expected value
- Each prospect card shows:
  - Company name (bold)
  - Contact person (small)
  - Expected deal size (formatted INR)
  - Source badge (small, secondary variant)
  - Solution type interest badge (small, colored)
  - Days since last contact (red if > 7 days)
  - Next action + date (truncated, red if overdue)
  - Assigned to avatar
- Cards are clickable → navigate to `/solutions/pipeline/[id]`
- Use `@dnd-kit/core` + `@dnd-kit/sortable` for drag-to-change-stage (already installed in package.json)
- On drop to a different column → call `useUpdatePipelineStage`
- If dropped on "Lost" column → show dialog asking for `lost_reason` before confirming
- If dropped on "Won" column → show confirmation dialog: "This will create a new client. Continue?"
- Quick action button top-right: "Add Prospect" → navigate to `/solutions/pipeline/new`

**Column order (left to right):** lead → qualified → proposal → negotiation → won

**Color coding per column:**
| Stage | Header Color | Card Border |
|-------|-------------|-------------|
| lead | bg-slate-100 | border-slate-200 |
| qualified | bg-blue-50 | border-blue-200 |
| proposal | bg-amber-50 | border-amber-200 |
| negotiation | bg-purple-50 | border-purple-200 |
| won | bg-green-50 | border-green-200 |

#### B6.2 Pipeline List View

**File:** `/Users/omm/PROJECTS/myjkkn/app/(routes)/solutions/pipeline/list/page.tsx`

Table view of all prospects. Use `useProspects(filters)` with filter controls:
- Search (company name, contact person)
- Pipeline stage dropdown (all, lead, qualified, proposal, negotiation, won, lost, dormant)
- Assigned to dropdown
- Source type dropdown
- "Overdue only" toggle

Table columns: Prospect Code, Company, Contact, Stage (badge), Expected Value, Next Action, Next Action Date (red if overdue), Assigned To, Last Contact

Row click → navigate to prospect detail.

#### B6.3 New Prospect Form

**File:** `/Users/omm/PROJECTS/myjkkn/app/(routes)/solutions/pipeline/new/page.tsx`

Server component wrapper.

**File:** `/Users/omm/PROJECTS/myjkkn/app/(routes)/solutions/pipeline/new/_components/new-prospect-form.tsx`

Client component. Use `react-hook-form` + `zod`. Pattern: follow `new-client-form.tsx` exactly.

**Zod schema:**
```typescript
const prospectFormSchema = z.object({
  company_name: z.string().min(2, 'Company name is required'),
  contact_person: z.string().min(2, 'Contact person is required'),
  contact_phone: z.string().min(10, 'Valid phone number is required'),
  contact_email: z.string().email('Valid email').optional().or(z.literal('')),
  source_type: z.enum(['placement', 'alumni', 'clinical', 'referral', 'direct', 'yi', 'intent']).optional(),
  source_detail: z.string().optional(),
  solution_type_interest: z.enum(['software', 'training', 'content']).optional(),
  expected_deal_size: z.coerce.number().positive().optional().or(z.literal(0)),
  expected_close_date: z.string().optional(),
  assigned_to: z.string().optional(),
  next_action: z.string().optional(),
  next_action_date: z.string().optional(),
  notes: z.string().optional(),
});
```

**Form sections:**
1. **Prospect Information:** company_name, contact_person, contact_phone, contact_email
2. **Source:** source_type (dropdown reusing existing enum labels), source_detail (text)
3. **Pipeline:** solution_type_interest (3 cards: Software/Training/Content), expected_deal_size (number, INR), expected_close_date (date picker)
4. **Assignment & Follow-up:** assigned_to (dropdown of profiles with management access), next_action (text), next_action_date (date picker)
5. **Notes:** notes (textarea)

On submit → `useCreateProspect().mutateAsync(data)` → toast "Prospect created" → redirect to `/solutions/pipeline/[id]`

#### B6.4 Prospect Detail Page

**File:** `/Users/omm/PROJECTS/myjkkn/app/(routes)/solutions/pipeline/[id]/page.tsx`

Server component wrapper.

**File:** `/Users/omm/PROJECTS/myjkkn/app/(routes)/solutions/pipeline/[id]/_components/prospect-detail.tsx`

Client component. Use `useProspect(id)`, `useProspectActivities(id)`.

**Layout:**

**Header:**
- Back arrow to `/solutions/pipeline`
- Company name (h1)
- Prospect code (monospace)
- Pipeline stage badge (colored)
- Stage change dropdown (same as solution status change pattern)
- Edit button → `/solutions/pipeline/[id]/edit`
- "Convert to Client" button (only if stage = won AND converted_client_id is null)
- If `converted_client_id` exists → show "View Client" link to `/solutions/clients/[converted_client_id]`

**Two-column layout:**

**Left column (60%):**
- **Activity Timeline** — vertical timeline of all activities, most recent first
  - Each entry: icon (by type), type badge, subject, summary, date, created_by
  - "Log Activity" button at top opens Dialog:
    - Fields: activity_type (select: call/email/meeting/whatsapp/other), subject (text), summary (textarea), next_action (text), next_action_date (date)
    - Submit → `useLogProspectActivity()`

**Right column (40%):**
- **Prospect Info card:** contact_person, phone, email, company_name
- **Pipeline Info card:** stage, expected_deal_size, expected_close_date, solution_type_interest, source
- **Follow-up card:** next_action (bold), next_action_date (red if overdue), last_contact_date, assigned_to
- **Notes card:** free text notes, editable inline

#### B6.5 Prospect Edit Page

**File:** `/Users/omm/PROJECTS/myjkkn/app/(routes)/solutions/pipeline/[id]/edit/page.tsx`

Same form as new prospect, pre-filled with existing data. On submit → `useUpdateProspect()`.

---

### B7. Dashboard Integration

**File:** `/Users/omm/PROJECTS/myjkkn/app/(routes)/solutions/_components/solutions-dashboard.tsx`

**Changes:**

1. **Import** `useProspectStats` from `@/hooks/solutions/use-prospects`

2. **Add Pipeline Stats Card** in the Stats Cards grid (lines 90-159). Add as the FIRST card (most important), shifting others right. Change grid to `lg:grid-cols-5`.

```tsx
<Card>
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
    <CardTitle className="text-sm font-medium">Pipeline</CardTitle>
    <Target className="h-4 w-4 text-muted-foreground" />
  </CardHeader>
  <CardContent>
    {isLoadingProspects ? (
      <Skeleton className="h-8 w-20" />
    ) : (
      <>
        <div className="text-2xl font-bold">
          {prospectStats?.total || 0}
        </div>
        <p className="text-xs text-muted-foreground">
          Active prospects
        </p>
        {(prospectStats?.overdueFollowUps || 0) > 0 && (
          <p className="text-xs text-red-500 mt-1">
            {prospectStats.overdueFollowUps} overdue follow-ups
          </p>
        )}
      </>
    )}
  </CardContent>
</Card>
```

3. **Add Pipeline Module Card** in Module Cards grid (lines 161-340). Add as the FIRST card. Change grid to `lg:grid-cols-5`.

```tsx
<Card className="hover:border-orange-300 transition-colors">
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <Target className="h-5 w-5 text-orange-600" />
      Pipeline
    </CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="grid grid-cols-2 gap-4 text-sm">
      <div>
        <p className="text-muted-foreground">Active</p>
        {isLoadingProspects ? <Skeleton className="h-6 w-12" /> : (
          <p className="text-lg font-semibold">{prospectStats?.total || 0}</p>
        )}
      </div>
      <div>
        <p className="text-muted-foreground">Pipeline Value</p>
        {isLoadingProspects ? <Skeleton className="h-6 w-16" /> : (
          <p className="text-lg font-semibold">
            {formatCurrency(prospectStats?.totalPipelineValue || 0)}
          </p>
        )}
      </div>
    </div>
    <div className="flex gap-2">
      <Button variant="outline" size="sm" asChild className="flex-1">
        <Link href="/solutions/pipeline">
          Pipeline Board <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <Link href="/solutions/pipeline/new">
          <Plus className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  </CardContent>
</Card>
```

4. **Add Pipeline Quick Link** in Quick Links grid (lines 342-417):

```tsx
<Card className="hover:shadow-md transition-shadow cursor-pointer" asChild>
  <Link href="/solutions/pipeline">
    <CardHeader>
      <CardTitle className="text-sm flex items-center gap-2">
        <Target className="h-4 w-4" />
        Pipeline Board
      </CardTitle>
      <CardDescription>Prospect tracking and follow-ups</CardDescription>
    </CardHeader>
  </Link>
</Card>
```

5. **Import** `Target` and `Plus` from `lucide-react` (Target is the crosshair icon, good for pipeline/CRM).

---

### B8. Navigation

**Find the Solutions Hub sidebar navigation** (likely in a layout file or nav component under `/solutions`). Add a "Pipeline" link:

```tsx
{ label: 'Pipeline', href: '/solutions/pipeline', icon: Target }
```

Position it FIRST in the nav, before "Dashboard" or "Solutions List". The pipeline is the entry point for the CBO workflow.

Also add sub-items:
```tsx
{ label: 'Board View', href: '/solutions/pipeline' }
{ label: 'List View', href: '/solutions/pipeline/list' }
{ label: 'Add Prospect', href: '/solutions/pipeline/new' }
```

---

### B9. Shared Components

**Create directory:** `/Users/omm/PROJECTS/myjkkn/components/solutions/pipeline/`

**Components to create:**

1. **`prospect-card.tsx`** — Reusable card for Kanban board and list view
   - Props: `prospect: Prospect`, `onClick?: () => void`, `compact?: boolean`
   - Shows: company name, contact, deal size, next action, days since contact, stage badge

2. **`prospect-form.tsx`** — Reusable form for create/edit
   - Props: `initialData?: Partial<Prospect>`, `onSubmit: (data) => void`, `isLoading?: boolean`
   - Full form with zod validation (schema defined in B6.3)

3. **`pipeline-stage-badge.tsx`** — Colored badge for pipeline stage
   - Props: `stage: PipelineStage`
   - Color mapping: lead=slate, qualified=blue, proposal=amber, negotiation=purple, won=green, lost=red, dormant=gray

4. **`activity-timeline.tsx`** — Vertical timeline of prospect activities
   - Props: `activities: ProspectActivity[]`
   - Icon per type (call=Phone, email=Mail, meeting=ClipboardList, whatsapp=MessageSquare, other=StickyNote)
   - Same icon pattern as the communications tab in solution-detail.tsx

5. **`log-activity-dialog.tsx`** — Dialog for logging a new activity
   - Props: `prospectId: string`, `open: boolean`, `onOpenChange: (open: boolean) => void`
   - Uses `useLogProspectActivity()` mutation

6. **`pipeline-stats.tsx`** — Stats row for pipeline page header
   - Props: `stats: ProspectStats`
   - 4 mini-cards: Total Prospects, Pipeline Value, Won This Month, Overdue Follow-ups

7. **`convert-to-client-dialog.tsx`** — Confirmation dialog for won→client conversion
   - Shows prospect data that will become client data
   - Explains "This will create a new client automatically"
   - After confirmation → call `useUpdatePipelineStage({ id, stage: 'won' })`
   - On success → show toast with link to new client

8. **`lost-reason-dialog.tsx`** — Dialog asking for lost_reason when moving to 'lost' stage
   - Text area for reason
   - On confirm → `useUpdatePipelineStage({ id, stage: 'lost', lostReason })`

---

### Phase B Verification

After all B1-B9 are built:
1. Run `~/bin/supabase db push` — migration applies cleanly
2. Solutions Hub dashboard loads — shows Pipeline card with 0 prospects
3. Navigate to `/solutions/pipeline` — empty Kanban board renders
4. Click "Add Prospect" → fill form → submit → prospect appears in "Lead" column
5. Drag prospect from "Lead" to "Qualified" → stage updates
6. Open prospect detail → log an activity → last_contact_date auto-updates
7. Move prospect to "Won" → confirmation dialog → client auto-created → can navigate to new client
8. Move a prospect to "Lost" → lost reason dialog → prospect archived
9. Dashboard overdue count shows correctly when next_action_date passes
10. Pipeline list view filters work correctly

---

## Phase C: Enhancements (Build ONLY after Phase B adoption)

### C1. File Upload (Supabase Storage)
- Create bucket `solutions-documents` in Supabase
- Add upload component to MoU management page
- Add upload component to prospect detail (for proposals)
- Accept: PDF, DOCX, images. Max 10MB.

### C2. Follow-up Reminders
- Create `use-notifications.ts` hooks file
- On dashboard load, query prospects where `next_action_date < TODAY`
- Show alert banner: "X follow-ups are overdue"
- Optional: insert into `sh_notifications` table on a daily cron

### C3. Pipeline Analytics
- Win rate: won / (won + lost) per month
- Source breakdown: which source_type generates most wins
- Average days in pipeline: from created_at to won date
- Conversion funnel: prospects entering each stage per month
- Use `recharts` (already installed) for charts

### C4. Intent Platform Integration
- When an Intent Interview is completed, auto-create a prospect
- Map Intent fields → prospect fields
- Set source_type = 'intent'
- This is a future integration — needs Intent Platform API spec

---

## File Summary

### New files to create:

| File | Phase |
|------|-------|
| `supabase/migrations/20260221000001_add_prospect_pipeline.sql` | B |
| `lib/services/solutions/prospects-service.ts` | B |
| `hooks/solutions/use-prospects.ts` | B |
| `app/(routes)/solutions/pipeline/page.tsx` | B |
| `app/(routes)/solutions/pipeline/_components/pipeline-board.tsx` | B |
| `app/(routes)/solutions/pipeline/list/page.tsx` | B |
| `app/(routes)/solutions/pipeline/list/_components/prospect-list.tsx` | B |
| `app/(routes)/solutions/pipeline/new/page.tsx` | B |
| `app/(routes)/solutions/pipeline/new/_components/new-prospect-form.tsx` | B |
| `app/(routes)/solutions/pipeline/[id]/page.tsx` | B |
| `app/(routes)/solutions/pipeline/[id]/_components/prospect-detail.tsx` | B |
| `app/(routes)/solutions/pipeline/[id]/edit/page.tsx` | B |
| `app/(routes)/solutions/pipeline/[id]/edit/_components/edit-prospect-form.tsx` | B |
| `components/solutions/pipeline/prospect-card.tsx` | B |
| `components/solutions/pipeline/prospect-form.tsx` | B |
| `components/solutions/pipeline/pipeline-stage-badge.tsx` | B |
| `components/solutions/pipeline/activity-timeline.tsx` | B |
| `components/solutions/pipeline/log-activity-dialog.tsx` | B |
| `components/solutions/pipeline/pipeline-stats.tsx` | B |
| `components/solutions/pipeline/convert-to-client-dialog.tsx` | B |
| `components/solutions/pipeline/lost-reason-dialog.tsx` | B |

### Files to modify:

| File | Phase | What changes |
|------|-------|-------------|
| `lib/services/solutions/types.ts` | B | Add PipelineStage, Prospect, ProspectActivity, ProspectStats types |
| `lib/services/solutions/index.ts` | B | Export prospects-service |
| `lib/query-keys.ts` | B | Add prospects section to solutionsHubKeys |
| `hooks/solutions/index.ts` | B | Re-export prospect hooks |
| `app/(routes)/solutions/_components/solutions-dashboard.tsx` | B | Add pipeline stats + module card |
| `app/(routes)/solutions/[id]/_components/solution-detail.tsx` | A | Fix MoU card (A3), training tab (A4), content tab (A5), payment date (A1) |
| `components/solutions/clients/client-form.tsx` | A | Add missing fields (A2) |
| Solutions Hub navigation/layout | B | Add Pipeline nav item |

---

## Implementation Order

```
Phase A (do ALL before starting B):
  A2 → A3 → A4 → A5 → Verify all A fixes (A1 was verified not a bug, skip it)

Phase B (do in exact order):
  B1 (migration) → B2 (types) → B3 (service) → B4 (query keys) →
  B5 (hooks) → B6.3 (new prospect form) → B9.2 (shared prospect-form) →
  B9.3 (stage badge) → B9.1 (prospect card) → B6.1 (pipeline board) →
  B6.2 (pipeline list) → B6.4 (prospect detail) → B9.4-8 (remaining components) →
  B6.5 (edit page) → B7 (dashboard) → B8 (navigation) → Verify all B
```

---

*Generated from: Capture/JKKN-Solutions-Hub/FST-Solutions-Hub-Build-Plan.md*
*Project: /Users/omm/PROJECTS/myjkkn*
*All paths are absolute from project root unless prefixed with full path.*
