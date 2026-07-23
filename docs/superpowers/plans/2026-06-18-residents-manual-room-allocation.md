# Residents Manual Room Allocation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin/warden allocate a room to an individual learner directly from the Residents › Learners table, with current room/mess shown and a live per-bed occupancy panel.

**Architecture:** New inline `AllocateRoomDialog` launched from the Learners row Actions menu. Reads use the existing block/room/bed + eligibility hooks plus a new occupancy RPC; the write goes through a new SECURITY DEFINER RPC that inserts an **active** allocation and occupies the bed atomically (the plain `allocate()` insert is broken — it omits the NOT NULL `tier_id`/`academic_year_id`). Already-allocated learners route to the merged `TransferDialog` instead.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query v5, Supabase (Postgres + RLS + SECURITY DEFINER RPCs), Shadcn UI, TypeScript.

## Global Constraints

- **Permission gate:** `is_super_admin() OR user_has_permission('campus_living.upgrades.manage')` everywhere (UI + both RPCs). NEVER gate on `campus_living.residents.edit` or `campus_living.allocations.*` — both are mass-granted to 64 roles (students/parents/drivers) and are useless as gates.
- **Learner key bridge:** the Residents view id is `learners_profiles.id`; `hostel_allocations.learner_id` is `profiles.id`. Bridge: `profiles.learner_id = learners_profiles.id`. The occupancy RPC resolves occupant names through the same bridge.
- **Migration workflow:** apply via `mcp__supabase__apply_migration`, commit the real SQL to `supabase/migrations/`, then mirror into `supabase/setup/05_views.sql` (views) / `02_functions.sql` (functions). Never leave a `SELECT 1;` placeholder.
- **No test runner exists.** "Verify" = rolled-back SQL `DO`/`SELECT` probes for DB, `mcp__ide__getDiagnostics` for TS, browser exercise for behavior. Do not claim "tests pass".
- **Supabase mutations:** always destructure `{ error }` and surface via `getErrorMessage()`; errors are plain objects, not `Error` instances.
- **Allocation status decision:** manual allocation is created **`active`** and the bed is occupied immediately (no warden approval step).
- Commit after each task. Branch: `feat/campus-living-residents-manual-allocation` (already created).

---

### Task 1: Migration A — surface current room/bed number on `v_learner_hostelites`

**Files:**
- Create: `supabase/migrations/20260618100000_view_learner_hostelites_room_bed_number.sql`
- Modify: `supabase/setup/05_views.sql` (replace the `v_learner_hostelites` block)
- Modify: `types/campus-living.ts:194-213` (add two fields to `LearnerHostelite`)
- Modify: `types/supabase.ts` (add `current_room_number`, `current_bed_number` to the `v_learner_hostelites` Row type)

**Interfaces:**
- Produces: view columns `current_room_number text | null`, `current_bed_number text | null`; `LearnerHostelite.current_room_number?`, `.current_bed_number?`.

- [ ] **Step 1: Apply the migration** (recreates the view; the only change vs current is the two `LEFT JOIN`s + two selected columns)

```sql
CREATE OR REPLACE VIEW public.v_learner_hostelites AS
 SELECT lp.id, lp.first_name, lp.last_name, lp.roll_number, lp.student_email, lp.college_email,
    lp.gender, lp.institution_id, acc.code AS accommodation_type, lp.hostel_fee, lp.dayscholar_fee,
    lp.father_name, lp.mother_name, lp.admission_year_id, lp.degree_id, lp.department_id,
    lp.program_id, lp.semester_id, lp.section_id, lp.academic_year_id, pr.program_name,
    ay.year AS program_start_year,
    (ay.year::numeric + pr.program_duration_yrs)::integer AS program_end_year,
    CASE
        WHEN lp.admission_year_id IS NOT NULL AND ay.year IS NOT NULL THEN GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - ay.year + 1, pr.program_duration_yrs::integer + 1))
        WHEN lp.batch_id IS NOT NULL AND b.start_date IS NOT NULL THEN GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM b.start_date)::integer + 1, EXTRACT(year FROM b.end_date)::integer - EXTRACT(year FROM b.start_date)::integer + 1))
        WHEN lp.enquiry_date IS NOT NULL THEN GREATEST(1, EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM lp.enquiry_date)::integer + 1)
        ELSE NULL::integer
    END AS year_of_study,
    ha.block_id AS current_block_id, ha.room_id AS current_room_id, ha.bed_id AS current_bed_id,
    ha.id AS current_allocation_id, hb.name AS current_block_name, hb.code AS current_block_code,
    hr.room_number AS current_room_number,   -- NEW
    hbd.bed_number  AS current_bed_number,    -- NEW
    CASE
        WHEN lp.admission_year_id IS NOT NULL AND ay.year IS NOT NULL THEN 'admission_year'::text
        WHEN lp.batch_id IS NOT NULL AND b.start_date IS NOT NULL THEN 'batch'::text
        WHEN lp.enquiry_date IS NOT NULL THEN 'enquiry'::text
        ELSE NULL::text
    END AS year_source,
    dg.degree_name, sm.semester_name, lp.lifecycle_status, acy.academic_year_name,
    lp.hostel_category_id, hc.name AS hostel_category_name, hc.type AS hostel_category_type,
    lp.mess_category_id, mc.name AS mess_category_name
   FROM learners_profiles lp
     LEFT JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id
     LEFT JOIN admission_years ay ON ay.id = lp.admission_year_id
     LEFT JOIN batches b ON b.id = lp.batch_id
     LEFT JOIN programs pr ON pr.id = lp.program_id
     LEFT JOIN profiles palloc ON palloc.learner_id = lp.id
     LEFT JOIN hostel_allocations ha ON ha.learner_id = palloc.id AND ha.status = 'active'::allocation_status_enum
     LEFT JOIN hostel_blocks hb ON hb.id = ha.block_id
     LEFT JOIN hostel_rooms hr ON hr.id = ha.room_id      -- NEW
     LEFT JOIN hostel_beds  hbd ON hbd.id = ha.bed_id      -- NEW
     LEFT JOIN degrees dg ON dg.id = lp.degree_id
     LEFT JOIN semesters sm ON sm.id = lp.semester_id
     LEFT JOIN academic_years acy ON acy.id = lp.academic_year_id
     LEFT JOIN hostel_categories hc ON hc.id = lp.hostel_category_id
     LEFT JOIN mess_categories mc ON mc.id = lp.mess_category_id
  WHERE acc.code = 'hostel'::text AND lp.lifecycle_status::text = 'active'::text;
```

- [ ] **Step 2: Verify the new columns return data**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT roll_number, current_block_code, current_room_number, current_bed_number, mess_category_name
FROM v_learner_hostelites
WHERE current_allocation_id IS NOT NULL
LIMIT 5;
```
Expected: rows where allocated learners show a non-null `current_room_number`/`current_bed_number`.

- [ ] **Step 3: Mirror into `supabase/setup/05_views.sql`** — replace the existing `v_learner_hostelites` definition with the SQL from Step 1 (find the `CREATE OR REPLACE VIEW public.v_learner_hostelites` block; if absent, append it).

- [ ] **Step 4: Add the TS fields.** In `types/campus-living.ts`, in the `LearnerHostelite` interface right after `current_bed_id?: string | null;`:

```ts
  current_room_number?: string | null;
  current_bed_number?: string | null;
```

In `types/supabase.ts`, locate the `v_learner_hostelites` `Row:` object and add `current_room_number: string | null` and `current_bed_number: string | null`.

- [ ] **Step 5: Verify TS** — `mcp__ide__getDiagnostics` on `types/campus-living.ts`. Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260618100000_view_learner_hostelites_room_bed_number.sql supabase/setup/05_views.sql types/campus-living.ts types/supabase.ts
git commit -m "feat(campus-living): surface current_room_number/current_bed_number on v_learner_hostelites"
```

---

### Task 2: Migration B — `fn_cl_room_bed_occupancy(p_room_id)` occupancy read

**Files:**
- Create: `supabase/migrations/20260618100100_fn_cl_room_bed_occupancy.sql`
- Modify: `supabase/setup/02_functions.sql` (append the function)

**Interfaces:**
- Produces RPC `fn_cl_room_bed_occupancy(p_room_id uuid)` → rows `{ bed_id uuid, bed_number text, is_occupied boolean, occupant_profile_id uuid, occupant_name text, occupant_roll text }`. Occupancy derived from **active + pending_approval** allocations (the true source of truth), not `hostel_beds.status`.

- [ ] **Step 1: Apply the migration**

```sql
CREATE OR REPLACE FUNCTION public.fn_cl_room_bed_occupancy(p_room_id uuid)
RETURNS TABLE(bed_id uuid, bed_number text, is_occupied boolean,
              occupant_profile_id uuid, occupant_name text, occupant_roll text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (is_super_admin() OR user_has_permission('campus_living.upgrades.manage')) THEN
    RAISE EXCEPTION 'Not authorized to view room occupancy' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT b.id,
         b.bed_number::text,
         (a.id IS NOT NULL) AS is_occupied,
         a.learner_id AS occupant_profile_id,
         NULLIF(btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')), '') AS occupant_name,
         lp.roll_number AS occupant_roll
  FROM hostel_beds b
  LEFT JOIN hostel_allocations a
         ON a.bed_id = b.id AND a.status IN ('active','pending_approval') AND a.check_out_date IS NULL
  LEFT JOIN profiles p ON p.id = a.learner_id
  LEFT JOIN learners_profiles lp ON lp.id = p.learner_id
  WHERE b.room_id = p_room_id
  ORDER BY b.bed_number;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_room_bed_occupancy(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.fn_cl_room_bed_occupancy(uuid) TO authenticated;
```

- [ ] **Step 2: Verify against a known room** — pick a room id from an allocated learner (`SELECT current_room_id FROM v_learner_hostelites WHERE current_room_id IS NOT NULL LIMIT 1`), then:
```sql
SELECT * FROM fn_cl_room_bed_occupancy('<room_id>');
```
Expected: one row per bed; occupied beds show `is_occupied=true` + occupant name/roll matching `hostel_allocations` for that room.

- [ ] **Step 3: Mirror into `supabase/setup/02_functions.sql`** (append the full function + grants from Step 1).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260618100100_fn_cl_room_bed_occupancy.sql supabase/setup/02_functions.sql
git commit -m "feat(campus-living): fn_cl_room_bed_occupancy — per-bed occupancy + occupant name/roll"
```

---

### Task 3: Migration C — `fn_cl_admin_allocate_bed(...)` atomic allocate + occupy

**Files:**
- Create: `supabase/migrations/20260618100200_fn_cl_admin_allocate_bed.sql`
- Modify: `supabase/setup/02_functions.sql` (append the function)

**Interfaces:**
- Produces RPC `fn_cl_admin_allocate_bed(p_learner_profile_id uuid, p_room_id uuid, p_bed_id uuid, p_mess_category_id uuid DEFAULT NULL)` → `jsonb { success, allocation_id, room_id, bed_id, block_id }`. Inserts an **active** allocation (resolves `tier_id`, `academic_year_id`, `profiles.id`) and sets the bed `occupied`. Fresh-only; fails closed if the learner already has an active/pending allocation or the bed is taken.

- [ ] **Step 1: Apply the migration**

```sql
CREATE OR REPLACE FUNCTION public.fn_cl_admin_allocate_bed(
  p_learner_profile_id uuid,
  p_room_id uuid,
  p_bed_id uuid,
  p_mess_category_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_room       hostel_rooms%ROWTYPE;
  v_bed        hostel_beds%ROWTYPE;
  v_profile    uuid;
  v_inst       uuid;
  v_sem        uuid;
  v_ay         uuid;
  v_tier       uuid;
  v_block      uuid;
  v_mapped     boolean;
  v_accessible boolean;
  v_alloc_id   uuid;
BEGIN
  IF NOT (is_super_admin() OR user_has_permission('campus_living.upgrades.manage')) THEN
    RAISE EXCEPTION 'Not authorized to allocate hostel rooms' USING ERRCODE = '42501';
  END IF;

  -- learners_profiles → institution / semester / academic year (mirror auto-allocate fallback)
  SELECT lp.institution_id, lp.semester_id,
         COALESCE(lp.academic_year_id,
           (SELECT id FROM academic_years
             WHERE institution_id = lp.institution_id AND is_active
             ORDER BY start_date DESC LIMIT 1))
    INTO v_inst, v_sem, v_ay
  FROM learners_profiles lp WHERE lp.id = p_learner_profile_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'Learner % not found', p_learner_profile_id USING ERRCODE = 'P0002'; END IF;
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year resolved for this learner' USING ERRCODE = 'P0001'; END IF;

  -- bridge to the profiles.id key hostel_allocations uses
  SELECT id INTO v_profile FROM profiles WHERE learner_id = p_learner_profile_id LIMIT 1;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'No profile bridges learner %', p_learner_profile_id USING ERRCODE = 'P0002'; END IF;

  -- fresh-only
  IF EXISTS (SELECT 1 FROM hostel_allocations a
             WHERE a.learner_id = v_profile AND a.status IN ('active','pending_approval') AND a.check_out_date IS NULL) THEN
    RAISE EXCEPTION 'Learner already has an active allocation — use Change room/bed instead' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_room FROM hostel_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room % not found', p_room_id USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_bed FROM hostel_beds WHERE id = p_bed_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bed % not found', p_bed_id USING ERRCODE = 'P0002'; END IF;
  IF v_bed.room_id <> p_room_id THEN RAISE EXCEPTION 'Bed does not belong to the selected room' USING ERRCODE = 'P0001'; END IF;
  v_block := v_room.block_id;

  -- institution access (mirror fn_cl_admin_transfer_allocation)
  SELECT EXISTS (SELECT 1 FROM hostel_block_institutions WHERE block_id = v_block) INTO v_mapped;
  IF v_mapped THEN
    SELECT EXISTS (
      SELECT 1 FROM hostel_block_institutions hbi
      WHERE hbi.block_id = v_block
        AND hbi.institution_id IN (SELECT institution_id FROM get_user_accessible_institutions(auth.uid()))
    ) INTO v_accessible;
    IF NOT v_accessible THEN RAISE EXCEPTION 'No access to the target block''s institution' USING ERRCODE = '42501'; END IF;
  END IF;

  -- bed must be free (dedup on allocation existence, matching auto-allocate)
  IF EXISTS (SELECT 1 FROM hostel_allocations a
             WHERE a.bed_id = p_bed_id AND a.status IN ('active','pending_approval') AND a.check_out_date IS NULL) THEN
    RAISE EXCEPTION 'The selected bed is already occupied' USING ERRCODE = '23505';
  END IF;

  -- standard tier policy (mirror auto-allocate)
  SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND institution_id IS NULL AND is_active LIMIT 1;
  IF v_tier IS NULL THEN SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND is_active LIMIT 1; END IF;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy found' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
    allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by
  ) VALUES (
    v_inst, v_profile, v_block, p_room_id, p_bed_id, v_ay, v_sem,
    'fresh', CURRENT_DATE, 'active', '', '', '',
    v_tier, auth.uid()
  ) RETURNING id INTO v_alloc_id;

  -- occupy the bed (immediate-active per design decision)
  UPDATE hostel_beds SET status='occupied', current_occupant_id=v_profile, updated_at=now() WHERE id = p_bed_id;

  -- room category is synced by trg_allocation_sync_learner_categories; honor an explicit mess pick
  IF p_mess_category_id IS NOT NULL THEN
    UPDATE learners_profiles SET mess_category_id = p_mess_category_id, updated_at = now() WHERE id = p_learner_profile_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'allocation_id', v_alloc_id,
                            'room_id', p_room_id, 'bed_id', p_bed_id, 'block_id', v_block);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_admin_allocate_bed(uuid,uuid,uuid,uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.fn_cl_admin_allocate_bed(uuid,uuid,uuid,uuid) TO authenticated;
```

- [ ] **Step 2: Verify with a rolled-back probe** (proves insert + bed-occupy without persisting). Pick an unallocated hostelite learners_profiles.id and a free bed/room:
```sql
DO $$
DECLARE r jsonb; v_lp uuid; v_room uuid; v_bed uuid;
BEGIN
  SELECT lp.id INTO v_lp FROM learners_profiles lp
    JOIN accommodation_types acc ON acc.id=lp.accommodation_type_id AND acc.code='hostel'
    JOIN profiles p ON p.learner_id=lp.id
   WHERE lp.lifecycle_status='active'
     AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
   LIMIT 1;
  SELECT b.room_id, b.id INTO v_room, v_bed FROM hostel_beds b
   WHERE NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))
   LIMIT 1;
  r := fn_cl_admin_allocate_bed(v_lp, v_room, v_bed, NULL);
  RAISE NOTICE 'result=%', r;
  RAISE NOTICE 'bed now=%', (SELECT status FROM hostel_beds WHERE id=v_bed);
  RAISE EXCEPTION 'rollback probe';   -- undo
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'rolled back: %', SQLERRM;
END $$;
```
Expected notices: `result={"success":true,...}`, `bed now=occupied`, then rollback. (Run as a user with the permission — if the MCP role lacks it, temporarily assert the gate logic separately.)

- [ ] **Step 3: Mirror into `supabase/setup/02_functions.sql`** (append the full function + grants).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260618100200_fn_cl_admin_allocate_bed.sql supabase/setup/02_functions.sql
git commit -m "feat(campus-living): fn_cl_admin_allocate_bed — atomic active allocation + bed occupy"
```

---

### Task 4: Service methods + React Query hooks

**Files:**
- Modify: `lib/services/campus-living/hostel-allocation-service.ts` (add two static methods)
- Modify: `hooks/campus-living/use-hostel-allocations.ts` (add two hooks)
- Modify: `types/campus-living.ts` (add `RoomBedOccupancy` type)

**Interfaces:**
- Consumes: RPCs from Tasks 2 & 3.
- Produces:
  - `RoomBedOccupancy = { bed_id: string; bed_number: string | null; is_occupied: boolean; occupant_profile_id: string | null; occupant_name: string | null; occupant_roll: string | null }`
  - `HostelAllocationService.getRoomBedOccupancy(roomId: string): Promise<RoomBedOccupancy[]>`
  - `HostelAllocationService.adminAllocateBed(args: { learnerProfileId: string; roomId: string; bedId: string; messCategoryId?: string | null }): Promise<{ success: boolean; allocation_id: string }>`
  - `useRoomBedOccupancy(roomId: string)` query hook
  - `useAllocateBedAdmin()` mutation hook (invalidates `hostel-allocations` + `hostel-beds`)

- [ ] **Step 1: Add the type** to `types/campus-living.ts`:

```ts
export interface RoomBedOccupancy {
  bed_id: string;
  bed_number: string | null;
  is_occupied: boolean;
  occupant_profile_id: string | null;
  occupant_name: string | null;
  occupant_roll: string | null;
}
```

- [ ] **Step 2: Add the service methods** to `hostel-allocation-service.ts` (inside the class, after `allocate`):

```ts
  static async getRoomBedOccupancy(roomId: string): Promise<RoomBedOccupancy[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_cl_room_bed_occupancy', { p_room_id: roomId });
    if (error) {
      logger.error('campus-living/allocations', 'Failed to load room occupancy', error);
      throw error;
    }
    return (data ?? []) as RoomBedOccupancy[];
  }

  static async adminAllocateBed(args: {
    learnerProfileId: string; roomId: string; bedId: string; messCategoryId?: string | null;
  }): Promise<{ success: boolean; allocation_id: string }> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase.rpc('fn_cl_admin_allocate_bed', {
      p_learner_profile_id: args.learnerProfileId,
      p_room_id: args.roomId,
      p_bed_id: args.bedId,
      p_mess_category_id: args.messCategoryId ?? null,
    });
    if (error) {
      logger.error('campus-living/allocations', 'Failed to allocate bed', error);
      throw error;
    }
    return data as { success: boolean; allocation_id: string };
  }
```
Add `RoomBedOccupancy` to the existing `@/types/campus-living` import at the top of the file. (`createClientSupabaseClient` and `logger` are already imported.)

- [ ] **Step 3: Add the hooks** to `use-hostel-allocations.ts`:

```ts
export function useRoomBedOccupancy(roomId: string) {
  return useQuery({
    queryKey: ['campus-living', 'room-bed-occupancy', roomId],
    queryFn: () => HostelAllocationService.getRoomBedOccupancy(roomId),
    enabled: !!roomId,
  });
}

export function useAllocateBedAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { learnerProfileId: string; roomId: string; bedId: string; messCategoryId?: string | null }) =>
      HostelAllocationService.adminAllocateBed(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelAllocationKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelBedKeys.all });
      queryClient.invalidateQueries({ queryKey: ['campus-living', 'room-bed-occupancy'] });
      toast.success('Room allocated');
    },
    onError: (error: unknown) => {
      toast.error(`Failed to allocate room: ${getErrorMessage(error)}`);
    },
  });
}
```
Ensure imports at the top of the file include `useQuery`, `hostelBedKeys` (from `@/hooks/campus-living/use-hostel-beds` or wherever bed keys live — match the existing import the file/codebase uses; if `hostelBedKeys` isn't already imported, import it), and `getErrorMessage` from `@/lib/utils`. (`useMutation`, `useQueryClient`, `toast`, `hostelAllocationKeys`, `HostelAllocationService` are already imported.)

- [ ] **Step 4: Verify TS** — `mcp__ide__getDiagnostics` on the 3 modified files. Expected: no new errors. (Note: `supabase.rpc('fn_cl_...')` may show a union-type complaint if the generated types lag — acceptable given `typescript.ignoreBuildErrors`; cast args `as never` only if diagnostics flag it.)

- [ ] **Step 5: Commit**

```bash
git add lib/services/campus-living/hostel-allocation-service.ts hooks/campus-living/use-hostel-allocations.ts types/campus-living.ts
git commit -m "feat(campus-living): service + hooks for room occupancy and admin allocate-bed"
```

---

### Task 5: `AllocateRoomDialog` component

**Files:**
- Create: `app/(routes)/campus-living/residents/_components/allocate-room-dialog.tsx`

**Interfaces:**
- Consumes: `useRoomBedOccupancy`, `useAllocateBedAdmin` (Task 4); existing `useHostelBlocks`, `useRoomsByBlock`, `useBedsByRoom`, `useActiveMessCategories`, `useEffectiveRoomCategories`, `useEffectiveMessCategories`.
- Produces: `<AllocateRoomDialog learner={LearnerHostelite | null} onClose={() => void} onSuccess={() => void} />` (open = `!!learner`).

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, BedDouble, Info } from 'lucide-react';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';
import { useRoomsByBlock } from '@/hooks/campus-living/use-hostel-rooms';
import { useActiveMessCategories } from '@/hooks/campus-living/use-mess-categories';
import {
  useEffectiveRoomCategories, useEffectiveMessCategories,
} from '@/hooks/campus-living/use-allocation-eligibility';
import { useRoomBedOccupancy, useAllocateBedAdmin } from '@/hooks/campus-living/use-hostel-allocations';
import type { LearnerHostelite } from '@/types/campus-living';

interface Props {
  learner: LearnerHostelite | null;
  onClose: () => void;
  onSuccess: () => void;
}

function learnerName(l: LearnerHostelite): string {
  return [l.first_name, l.last_name].filter(Boolean).join(' ') || '(unnamed)';
}

export function AllocateRoomDialog({ learner, onClose, onSuccess }: Props) {
  const open = !!learner;
  const { profile } = useAuth();
  const [blockId, setBlockId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [bedId, setBedId] = useState('');
  const [messId, setMessId] = useState('');

  // Reset selections whenever a new learner opens the dialog.
  useEffect(() => {
    if (learner) { setBlockId(''); setRoomId(''); setBedId(''); setMessId(learner.mess_category_id ?? ''); }
  }, [learner]);

  const { data: blocksResult } = useHostelBlocks(profile?.institution_id ?? '');
  const blocks = blocksResult?.data ?? [];
  const { data: rooms } = useRoomsByBlock(blockId);
  const { data: occupancy, isLoading: occLoading } = useRoomBedOccupancy(roomId);
  const { messCategories } = useActiveMessCategories();
  const { data: eligibleRoomCats } = useEffectiveRoomCategories(learner?.id ?? null);
  const { data: eligibleMessCats } = useEffectiveMessCategories(learner?.id ?? null);
  const allocateMut = useAllocateBedAdmin();

  const roomFilterActive = (eligibleRoomCats?.length ?? 0) > 0;
  const messFilterActive = (eligibleMessCats?.length ?? 0) > 0;
  const visibleRooms = roomFilterActive
    ? (rooms ?? []).filter((r) => r.category_id && eligibleRoomCats!.includes(r.category_id))
    : rooms ?? [];
  const visibleMess = messFilterActive
    ? messCategories.filter((m) => eligibleMessCats!.includes(m.id))
    : messCategories;

  const freeCount = useMemo(
    () => (occupancy ?? []).filter((b) => !b.is_occupied).length,
    [occupancy],
  );

  async function handleAllocate() {
    if (!learner || !roomId || !bedId) return;
    try {
      await allocateMut.mutateAsync({
        learnerProfileId: learner.id,
        roomId, bedId,
        messCategoryId: messId || null,
      });
      onSuccess();
    } catch {
      /* toast surfaced by the hook */
    }
  }

  if (!learner) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !allocateMut.isPending) onClose(); }}>
      <DialogContent className="max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Allocate room — {learnerName(learner)}</DialogTitle>
          <DialogDescription>
            {learner.roll_number ?? '—'} · pick a block, room and free bed.
          </DialogDescription>
        </DialogHeader>

        {/* Current state context */}
        <div className="rounded-md border bg-muted/30 p-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Current room</div>
            <div>{learner.current_room_id
              ? `${learner.current_block_code ?? learner.current_block_name ?? ''} · ${learner.current_room_number ?? '—'}`
              : <Badge variant="outline">Unassigned</Badge>}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Mess category</div>
            <div>{learner.mess_category_name ?? '—'}</div>
          </div>
        </div>

        {/* Pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Block</Label>
            <Select value={blockId} onValueChange={(v) => { setBlockId(v); setRoomId(''); setBedId(''); }}>
              <SelectTrigger><SelectValue placeholder="Select block" /></SelectTrigger>
              <SelectContent>
                {blocks.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} ({b.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Room</Label>
            <Select value={roomId} onValueChange={(v) => { setRoomId(v); setBedId(''); }} disabled={!blockId}>
              <SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger>
              <SelectContent>
                {visibleRooms.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.room_number} (cap {r.capacity})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {blockId && roomFilterActive && (
              <p className="text-[11px] text-muted-foreground">Eligible rooms for this program.</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Mess</Label>
            <Select value={messId} onValueChange={setMessId}>
              <SelectTrigger><SelectValue placeholder="No mess" /></SelectTrigger>
              <SelectContent>
                {visibleMess.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Occupancy panel — the "who's already allocated" view */}
        {roomId && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <BedDouble className="h-4 w-4" /> Beds in this room
              </div>
              <span className="text-xs text-muted-foreground">
                {occLoading ? 'Loading…' : `${freeCount} of ${occupancy?.length ?? 0} free`}
              </span>
            </div>
            <div className="space-y-1">
              {(occupancy ?? []).map((b) => (
                <label key={b.bed_id}
                  className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${
                    b.is_occupied ? 'opacity-60 cursor-not-allowed' :
                    bedId === b.bed_id ? 'border-primary bg-primary/5 cursor-pointer' : 'cursor-pointer hover:bg-muted/50'
                  }`}>
                  <span className="flex items-center gap-2">
                    <input type="radio" name="bed" disabled={b.is_occupied}
                      checked={bedId === b.bed_id} onChange={() => setBedId(b.bed_id)} />
                    Bed {b.bed_number ?? '—'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {b.is_occupied
                      ? `${b.occupant_name ?? 'Occupied'}${b.occupant_roll ? ` · ${b.occupant_roll}` : ''}`
                      : 'Free'}
                  </span>
                </label>
              ))}
              {!occLoading && (occupancy?.length ?? 0) === 0 && (
                <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Info className="h-3 w-3" /> No beds configured in this room.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={allocateMut.isPending}>Cancel</Button>
          <Button onClick={handleAllocate} disabled={!roomId || !bedId || allocateMut.isPending}>
            {allocateMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Allocate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

> Note: verify the `useHostelBlocks`/`useRoomsByBlock` return shapes match the field accesses (`blocksResult.data`, `r.room_number`, `r.capacity`, `r.category_id`) against the existing `/allocations/new/page.tsx` usage — they're copied from there. Adjust `messCategories`/`m.name` if `useActiveMessCategories` returns a different shape (it returns `{ messCategories }` there).

- [ ] **Step 2: Verify TS** — `mcp__ide__getDiagnostics` on the new file. Expected: no errors (resolve any shape mismatches flagged).

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/campus-living/residents/_components/allocate-room-dialog.tsx"
git commit -m "feat(campus-living): AllocateRoomDialog with live per-bed occupancy panel"
```

---

### Task 6: Wire columns + row action + dialogs into the Learners tab

**Files:**
- Modify: `app/(routes)/campus-living/residents/_components/learners-columns.tsx`
- Modify: `app/(routes)/campus-living/residents/_components/learners-tab.tsx`

**Interfaces:**
- Consumes: `AllocateRoomDialog` (Task 5), existing `TransferDialog`, `LearnerColumnHandlers`.
- Produces: new columns Current Room + Mess Category; row-action `onAllocate` / `onChangeRoom`; right-pinned actions.

- [ ] **Step 1: Extend `LearnerColumnHandlers` and columns** in `learners-columns.tsx`.

Add to the `LearnerColumnHandlers` interface:
```ts
  canAllocate: boolean;
  onAllocate: (learner: LearnerHostelite) => void;
  onChangeRoom: (learner: LearnerHostelite) => void;
```

Add two columns (place after `blockCol`, before `roomCategoryCol`):
```tsx
  const currentRoomCol: ColumnDef<LearnerHostelite> = {
    id: 'current_room',
    header: 'Current Room',
    cell: ({ row }) => {
      const r = row.original.current_room_number;
      if (!r) return <span className="text-sm text-muted-foreground">—</span>;
      const bed = row.original.current_bed_number;
      return <span className="text-sm">{r}{bed ? ` · Bed ${bed}` : ''}</span>;
    },
    enableSorting: false,
    size: 130,
  };

  const messCategoryCol: ColumnDef<LearnerHostelite> = {
    id: 'mess_category',
    accessorFn: (r) => r.mess_category_name,
    header: 'Mess Category',
    cell: ({ row }) =>
      row.original.mess_category_name
        ? <span className="text-sm">{row.original.mess_category_name}</span>
        : <span className="text-sm text-muted-foreground">—</span>,
    enableSorting: false,
    size: 140,
  };
```

In the `actionsCol` dropdown, after the View item, add the allocate/transfer item:
```tsx
            {h.canAllocate && (
              row.original.current_allocation_id ? (
                <DropdownMenuItem onClick={() => h.onChangeRoom(row.original)}>
                  <ArrowRightLeft className="mr-2 h-4 w-4" /> Change room / bed
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => h.onAllocate(row.original)}>
                  <BedDouble className="mr-2 h-4 w-4" /> Allocate room
                </DropdownMenuItem>
              )
            )}
```
Add `ArrowRightLeft, BedDouble` to the `lucide-react` import. Add `currentRoomCol, messCategoryCol` into the returned array (after `blockCol`, before `roomCategoryCol`).

- [ ] **Step 2: Wire state in `learners-tab.tsx`.**

Add permission flag + state + handlers + dialogs. Specifically:
```tsx
  // alongside the existing canEdit:
  const canAllocate = isSuperAdmin || !!permissions?.['campus_living.upgrades.manage'];
  // new state:
  const [allocateTarget, setAllocateTarget] = useState<LearnerHostelite | null>(null);
  const [transferTarget, setTransferTarget] = useState<LearnerHostelite | null>(null);
  const [refetchKey, setRefetchKey] = useState(0);
```
Extend the `getLearnerColumns({...})` call with:
```tsx
      canAllocate,
      onAllocate: (l) => setAllocateTarget(l),
      onChangeRoom: (l) => setTransferTarget(l),
```
and add `canAllocate` to that `useMemo` dependency array.

Wrap the `<DataTable>` in the pin class and pass `refetchKey`:
```tsx
      <div className="pinned-actions-col">
        <DataTable
          fetchDataFn={fetchData}
          getColumns={() => columns}
          idField='id'
          refetchKey={refetchKey}
          exportConfig={{ entityName: 'hostel-learner-residents', columnMapping: {}, columnWidths: [], headers: [] }}
          config={{ enableUrlState: true, enableDateFilter: false, enableExport: true, enableRowSelection: false }}
        />
      </div>
```
Add the two dialogs near the other drawers:
```tsx
      <AllocateRoomDialog
        learner={allocateTarget}
        onClose={() => setAllocateTarget(null)}
        onSuccess={() => { setAllocateTarget(null); setRefetchKey((k) => k + 1); }}
      />
      {transferTarget && (
        <TransferDialog
          allocationId={transferTarget.current_allocation_id!}
          currentBlockId={transferTarget.current_block_id}
          currentRoomId={transferTarget.current_room_id}
          currentBedId={transferTarget.current_bed_id}
          current={{
            learnerName: [transferTarget.first_name, transferTarget.last_name].filter(Boolean).join(' ') || null,
            blockName: transferTarget.current_block_name ?? null,
            roomNumber: transferTarget.current_room_number ?? null,
            bedNumber: transferTarget.current_bed_number ?? null,
            roomCategory: transferTarget.hostel_category_name ?? null,
          }}
          open={!!transferTarget}
          onOpenChange={(o) => { if (!o) setTransferTarget(null); }}
          onSuccess={() => { setTransferTarget(null); setRefetchKey((k) => k + 1); }}
        />
      )}
```
Add imports: `AllocateRoomDialog` from `./allocate-room-dialog`, `TransferDialog` from `../../allocations/_components/transfer-dialog`.

- [ ] **Step 3: Verify TS** — `mcp__ide__getDiagnostics` on both files. Expected: no errors. (Confirm `TransferDialog`'s prop names against `allocations/_components/transfer-dialog.tsx` — `current.{learnerName,blockName,roomNumber,bedNumber,roomCategory}`.)

- [ ] **Step 4: Commit**

```bash
git add "app/(routes)/campus-living/residents/_components/learners-columns.tsx" "app/(routes)/campus-living/residents/_components/learners-tab.tsx"
git commit -m "feat(campus-living): Residents Learners — current room/mess cols + Allocate/Change-room actions"
```

---

### Task 7: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Browser smoke as super-admin.** `npm run dev`, open `/campus-living/residents` (Learners tab):
  - Allocated learner shows Current Room + Bed + Mess; unallocated shows "—".
  - Actions menu: unallocated → "Allocate room"; allocated → "Change room / bed".
  - "Allocate room" opens the dialog; picking a block→room shows the occupancy panel with free count + occupant names on taken beds; occupied beds not selectable.
  - Allocate a free bed → toast success, dialog closes, the learner's Current Room column updates (refetchKey bump), occupied bed now shows them on re-open.
  - Already-allocated learner → "Change room / bed" opens the transfer dialog and moves correctly.
  - Actions column stays pinned right while scrolling horizontally.

- [ ] **Step 2: Permission check.** Confirm a non-hostel-admin role (e.g. faculty) does NOT see "Allocate room"/"Change room/bed" (only View/Edit/Remove), and that calling `fn_cl_admin_allocate_bed` as such a role raises `42501`.

- [ ] **Step 3: Data consistency probe.** After a real allocation, confirm bed + allocation agree:
```sql
SELECT a.status, b.status AS bed_status, b.current_occupant_id = a.learner_id AS occupant_matches
FROM hostel_allocations a JOIN hostel_beds b ON b.id = a.bed_id
WHERE a.id = '<new_allocation_id>';
```
Expected: `active`, `occupied`, `occupant_matches=true`.

- [ ] **Step 4: Final diagnostics sweep** — `mcp__ide__getDiagnostics` on every touched TS file; no new errors.

---

## Self-Review notes
- **Spec coverage:** current room+mess cols (Task 6), allocate action (Tasks 5/6), occupancy panel (Tasks 2/5), fresh-only + transfer routing (Task 6 conditional), 3 migrations (Tasks 1–3), permission gate `upgrades.manage` (all RPCs + UI), pinned actions (Task 6). All covered.
- **Status decision:** active + occupy bed, implemented in Task 3 and verified in Task 7 Step 3.
- **No placeholders:** all SQL and TSX are complete; the two "verify shape" notes point at concrete existing files to diff against, not unspecified work.
