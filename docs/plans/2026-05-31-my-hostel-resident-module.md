# My Hostel — Resident Self-Service Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give hostel-resident students an own-scoped "My Hostel" area (category, fees, allocation, requests, emergency profile) that only hostelers can see, gated by a trimmed `student` role + a `user_is_hosteler()` check.

**Architecture:** Access is `hasPermission('campus_living.my_hostel.view') AND user_is_hosteler()`. `user_is_hosteler()` resolves `auth.uid() → profiles.learner_id → learners_profiles` and matches `accommodation_types.code='hostel'`. The `student` role's campus_living namespace is rewritten to a ~15-key resident bundle; new RLS "own-row" branches let residents read/write only their own rows. UI is a URL-param tabbed hub sourced from `learners_profiles` (since `hostel_allocations` is empty).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (Postgres + RLS), TanStack Query v5, Shadcn UI. Verification uses `mcp__ide__getDiagnostics`, `npm run check:menus`/`check:reachability`, RLS impersonation SQL, and browser walkthroughs (NO unit-test runner exists in this repo).

**Reference spec:** `specs/my-hostel-resident-module-spec.md`

---

## Conventions for this plan

- **No test runner exists.** Wherever a generic plan says "write/run tests," this plan substitutes: (a) `mcp__ide__getDiagnostics <file>` for TS, (b) an RLS impersonation SQL block, (c) `npm run check:*` gates, (d) a browser check. Treat those as the "tests."
- **Migrations:** apply via `mcp__supabase__apply_migration`, AND commit the identical SQL body to `supabase/migrations/<timestamp>_<name>.sql`, AND mirror functions/policies into `supabase/setup/02_functions.sql` / `03_policies.sql`. Never a `SELECT 1;` placeholder.
- **RLS impersonation harness** (reused throughout). Pick test uuids once:

```sql
-- Find one hosteler profile, one day-scholar profile, and a warden (run once, record the ids)
SELECT 'hosteler' AS kind, p.id AS profile_id
FROM profiles p JOIN learners_profiles lp ON lp.id = p.learner_id
LEFT JOIN accommodation_types at ON at.id = lp.accommodation_type_id
WHERE p.role='student' AND at.code='hostel' LIMIT 1;

SELECT 'dayscholar' AS kind, p.id AS profile_id
FROM profiles p JOIN learners_profiles lp ON lp.id = p.learner_id
LEFT JOIN accommodation_types at ON at.id = lp.accommodation_type_id
WHERE p.role='student' AND (at.code IS NULL OR at.code <> 'hostel')
  AND lp.accommodation_type NOT ILIKE 'hostel%' LIMIT 1;
```

```sql
-- Impersonation template
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<PROFILE_ID>","role":"authenticated"}';
-- <query under test>
ROLLBACK;
```

## Resident permission bundle (the 15 keys)

```
campus_living.view
campus_living.my_hostel.view            (NEW)
campus_living.allocations.view_own      (NEW)
campus_living.fees.view_own             (NEW)
campus_living.profile.view_own          (NEW)
campus_living.profile.edit_own          (NEW)
campus_living.vacate_requests.view_own
campus_living.vacate_requests.submit
campus_living.leave.view_own
campus_living.leave.request
campus_living.gate_passes.view_own
campus_living.gate_passes.create
campus_living.premium.pick_room
campus_living.premium.invite_roommate
campus_living.premium.view_dashboard
```

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `supabase/migrations/20260531090000_user_is_hosteler_fn.sql` | `user_is_hosteler()` SECURITY DEFINER fn | Create |
| `supabase/migrations/20260531090100_my_hostel_resident_rls.sql` | own-row RLS branches (leave, gate_passes, learner_hostel_profiles, allocations) | Create |
| `supabase/migrations/20260531090200_student_role_resident_bundle.sql` | rewrite `student` campus_living perms | Create |
| `supabase/setup/02_functions.sql`, `03_policies.sql` | mirror the above | Modify |
| `lib/constants/permissions.ts:1270-1487` | add 5 new keys to campus_living module | Modify |
| `hooks/campus-living/use-is-hosteler.ts` | `useIsHosteler()` client hook | Create |
| `lib/sidebarMenuLink.ts:127+,486` | MENU_PERMISSIONS gating entries | Modify |
| `app/(routes)/campus-living/nav-config.ts` | dedicated "My Hostel" tier-2 bucket | Modify |
| `lib/services/campus-living/my-hostel-service.ts` | aggregate resident reads | Create |
| `hooks/campus-living/use-my-hostel.ts` | React Query hooks for the hub | Create |
| `lib/query/query-keys.ts` | `myHostel` query keys | Modify |
| `app/(routes)/campus-living/my-hostel/page.tsx` | tabbed hub (guard + Overview + Category/Fees) | Modify |
| `app/(routes)/campus-living/my-hostel/_components/*` | tab panels | Create |
| `app/(routes)/campus-living/page.tsx` | route students → my-hostel | Modify |

---

# PHASE 1 — Access spine (gating works end-to-end)

### Task 1: `user_is_hosteler()` SECURITY DEFINER function

**Files:**
- Create: `supabase/migrations/20260531090000_user_is_hosteler_fn.sql`
- Modify: `supabase/setup/02_functions.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- user_is_hosteler(): true when the current user's learner record has
-- accommodation type = hostel. Built on get_my_learner_id() (existing).
-- Clean signal: accommodation_types.code='hostel'; fallback: dirty text.
CREATE OR REPLACE FUNCTION public.user_is_hosteler()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM learners_profiles lp
    LEFT JOIN accommodation_types at ON at.id = lp.accommodation_type_id
    WHERE lp.id = public.get_my_learner_id()
      AND (at.code = 'hostel' OR lp.accommodation_type ILIKE 'hostel%')
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_is_hosteler() TO authenticated;
```

- [ ] **Step 2: Apply via MCP**

Use `mcp__supabase__apply_migration` with name `user_is_hosteler_fn` and the SQL above.

- [ ] **Step 3: Verify it returns the right verdict per persona**

```sql
-- hosteler → true
BEGIN; SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<HOSTELER_PROFILE_ID>","role":"authenticated"}';
SELECT public.user_is_hosteler();   -- expect: t
ROLLBACK;
-- day-scholar → false
BEGIN; SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<DAYSCHOLAR_PROFILE_ID>","role":"authenticated"}';
SELECT public.user_is_hosteler();   -- expect: f
ROLLBACK;
```
Expected: `t` then `f`.

- [ ] **Step 4: Mirror into setup file**

Append the same `CREATE OR REPLACE FUNCTION public.user_is_hosteler()...` block to `supabase/setup/02_functions.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260531090000_user_is_hosteler_fn.sql supabase/setup/02_functions.sql
git commit -m "feat(campus-living): add user_is_hosteler() gate function"
```

---

### Task 2: New permission keys in the catalog

**Files:**
- Modify: `lib/constants/permissions.ts` (campus_living module, near the `allocations`/`fees`/`residents` keys, lines ~1302-1407)

- [ ] **Step 1: Add the 5 new keys**

Insert these objects alongside the existing campus_living keys (place each near its sibling group):

```ts
// near allocations.* (after campus_living.allocations.view)
{ key: 'campus_living.allocations.view_own', label: 'View Own Allocation (Resident)' },
// near fees.* (after campus_living.fees.view)
{ key: 'campus_living.fees.view_own', label: 'View Own Hostel Fees (Resident)' },
// new my_hostel group + own profile keys (place after residents.* block)
{ key: 'campus_living.my_hostel.view', label: 'View My Hostel (Resident Self-Service)' },
{ key: 'campus_living.profile.view_own', label: 'View Own Hostel Profile (Emergency/Medical)' },
{ key: 'campus_living.profile.edit_own', label: 'Edit Own Hostel Profile (Emergency/Medical)' },
```

- [ ] **Step 2: Type-check**

Run `mcp__ide__getDiagnostics` on `lib/constants/permissions.ts`. Expected: no new errors.

- [ ] **Step 3: Permission-catalog gate**

Run: `npm run check:permissions`
Expected: passes (new keys are well-formed `<module>.<resource>.<action>`).

- [ ] **Step 4: Commit**

```bash
git add lib/constants/permissions.ts
git commit -m "feat(campus-living): catalog my_hostel + view_own resident permission keys"
```

---

### Task 3: Rewrite the `student` role's campus_living permissions

**Files:**
- Create: `supabase/migrations/20260531090200_student_role_resident_bundle.sql`

> Depends on Task 4 landing in the same deploy — removing `allocations.view` from `student` is only safe once `allocations.view_own` RLS exists. Order: apply Task 4 RLS first, then this. (If using one combined deploy, fine.)

- [ ] **Step 1: Snapshot current state (for rollback evidence)**

```sql
SELECT count(*) FROM jsonb_object_keys(
  (SELECT permissions FROM custom_roles WHERE role_key='student')) k(x)
WHERE x LIKE 'campus_living%';   -- expect 144 before
```

- [ ] **Step 2: Write the migration SQL**

```sql
-- Rewrite ONLY the campus_living namespace of the student role to the
-- resident bundle. Non-campus_living perms are preserved verbatim.
UPDATE custom_roles
SET permissions = (
      SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb)
      FROM jsonb_each(permissions) AS e(k, v)
      WHERE k NOT LIKE 'campus_living%'
    ) || jsonb_build_object(
      'campus_living.view', true,
      'campus_living.my_hostel.view', true,
      'campus_living.allocations.view_own', true,
      'campus_living.fees.view_own', true,
      'campus_living.profile.view_own', true,
      'campus_living.profile.edit_own', true,
      'campus_living.vacate_requests.view_own', true,
      'campus_living.vacate_requests.submit', true,
      'campus_living.leave.view_own', true,
      'campus_living.leave.request', true,
      'campus_living.gate_passes.view_own', true,
      'campus_living.gate_passes.create', true,
      'campus_living.premium.pick_room', true,
      'campus_living.premium.invite_roommate', true,
      'campus_living.premium.view_dashboard', true
    ),
    updated_at = now()
WHERE role_key = 'student';
```

- [ ] **Step 3: Apply via MCP** (`apply_migration` name `student_role_resident_bundle`).

- [ ] **Step 4: Verify the namespace is exactly the bundle**

```sql
SELECT k AS perm FROM custom_roles, jsonb_object_keys(permissions) k
WHERE role_key='student' AND k LIKE 'campus_living%' ORDER BY k;
-- expect exactly the 15 bundle keys, no admin keys (no .create/.config/.assign)
```

- [ ] **Step 5: Mirror + commit**

Append a note to `supabase/setup/` seed if student role is seeded there; then:

```bash
git add supabase/migrations/20260531090200_student_role_resident_bundle.sql
git commit -m "feat(campus-living): scope student role to my-hostel resident bundle [campus_living ns]"
```

---

### Task 4: Own-row RLS branches

**Files:**
- Create: `supabase/migrations/20260531090100_my_hostel_resident_rls.sql`
- Modify: `supabase/setup/03_policies.sql`

FK semantics (verified): `hostel_leave_requests/.gate_passes/.allocations.learner_id → profiles` (use `auth.uid()`); `learner_hostel_profiles.learner_id → learners_profiles` (use `get_my_learner_id()`).

- [ ] **Step 1: Write the migration SQL**

> **Scope (revised):** Task 4 adds SELECT own-row branches + learner_hostel_profiles
> own read/write only. Resident own-INSERT for leave & gate passes is deferred to
> **Task 13**, where the self-constraint is designed with the action UI — residents
> and staff *both* hold `*.create`, so the resident insert path must be self-bound by
> `learner_id = auth.uid()` (a naive `create AND institution_access` branch would let a
> resident file requests for classmates). Each policy below preserves the existing admin
> branch verbatim and only appends an own-row `OR`.

```sql
-- ── hostel_leave_requests: residents READ own ────────────────────────
DROP POLICY IF EXISTS hostel_leave_requests_select_permission ON public.hostel_leave_requests;
CREATE POLICY hostel_leave_requests_select_permission ON public.hostel_leave_requests
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('campus_living.leave.view') AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))
  OR (user_has_permission('campus_living.leave.view_own') AND learner_id = auth.uid())
);

-- ── hostel_gate_passes: residents READ own ───────────────────────────
DROP POLICY IF EXISTS hostel_gate_passes_select_permission ON public.hostel_gate_passes;
CREATE POLICY hostel_gate_passes_select_permission ON public.hostel_gate_passes
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('campus_living.gate_passes.view') AND role_has_institution_access(institution_id))
  OR (user_has_permission('campus_living.gate_passes.view_own') AND learner_id = auth.uid())
);

-- ── learner_hostel_profiles: residents read + upsert OWN ──────────────
DROP POLICY IF EXISTS lhp_select_permission ON public.learner_hostel_profiles;
CREATE POLICY lhp_select_permission ON public.learner_hostel_profiles
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR EXISTS (SELECT 1 FROM learners_profiles lp
             WHERE lp.id = learner_hostel_profiles.learner_id
               AND user_has_permission('campus_living.residents.view')
               AND role_has_institution_access(lp.institution_id))
  OR (user_has_permission('campus_living.profile.view_own') AND learner_id = public.get_my_learner_id())
);

-- UPDATE needs BOTH USING (which rows) and WITH CHECK (resulting row) so a
-- resident cannot re-point their row's learner_id to someone else.
DROP POLICY IF EXISTS lhp_update_permission ON public.learner_hostel_profiles;
CREATE POLICY lhp_update_permission ON public.learner_hostel_profiles
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR EXISTS (SELECT 1 FROM learners_profiles lp
             WHERE lp.id = learner_hostel_profiles.learner_id
               AND user_has_permission('campus_living.residents.edit')
               AND role_has_institution_access(lp.institution_id))
  OR (user_has_permission('campus_living.profile.edit_own') AND learner_id = public.get_my_learner_id())
)
WITH CHECK (
  is_super_admin() OR is_admin()
  OR EXISTS (SELECT 1 FROM learners_profiles lp
             WHERE lp.id = learner_hostel_profiles.learner_id
               AND user_has_permission('campus_living.residents.edit')
               AND role_has_institution_access(lp.institution_id))
  OR (user_has_permission('campus_living.profile.edit_own') AND learner_id = public.get_my_learner_id())
);

DROP POLICY IF EXISTS lhp_insert_permission ON public.learner_hostel_profiles;
CREATE POLICY lhp_insert_permission ON public.learner_hostel_profiles
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR EXISTS (SELECT 1 FROM learners_profiles lp
             WHERE lp.id = learner_hostel_profiles.learner_id
               AND user_has_permission('campus_living.residents.edit')
               AND role_has_institution_access(lp.institution_id))
  OR (user_has_permission('campus_living.profile.edit_own') AND learner_id = public.get_my_learner_id())
);

-- ── hostel_allocations: residents READ own (table empty today) ────────
DROP POLICY IF EXISTS hostel_allocations_select_permission ON public.hostel_allocations;
CREATE POLICY hostel_allocations_select_permission ON public.hostel_allocations
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('campus_living.allocations.view') AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))
  OR (user_has_permission('campus_living.allocations.view_own') AND learner_id = auth.uid())
);
```

- [ ] **Step 2: Apply via MCP** (`apply_migration` name `my_hostel_resident_rls`).

- [ ] **Step 3: Verify own-scope (hosteler sees own, not others)**

```sql
BEGIN; SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<HOSTELER_PROFILE_ID>","role":"authenticated"}';
SELECT count(*) FROM hostel_leave_requests WHERE learner_id <> '<HOSTELER_PROFILE_ID>'; -- expect 0
SELECT count(*) FROM learner_hostel_profiles;  -- expect 0 or only own
ROLLBACK;
```
Expected: zero cross-user rows. Warden persona unaffected (re-run a warden id; counts unchanged from before).

- [ ] **Step 4: Mirror into `supabase/setup/03_policies.sql`** (replace the four policies' definitions).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260531090100_my_hostel_resident_rls.sql supabase/setup/03_policies.sql
git commit -m "feat(campus-living): add resident own-row RLS branches (leave/gate-pass/profile/allocation)"
```

---

### Task 5: `useIsHosteler()` client hook

**Files:**
- Create: `hooks/campus-living/use-is-hosteler.ts`

- [ ] **Step 1: Write the hook**

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

/**
 * True when the current user is a hostel resident (learners_profiles
 * accommodation type = hostel). Mirrors the SQL gate user_is_hosteler();
 * we call the RPC so the client and RLS agree on one definition.
 */
export function useIsHosteler(enabled = true) {
  return useQuery({
    queryKey: ['campus-living', 'is-hosteler'],
    queryFn: async (): Promise<boolean> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.rpc('user_is_hosteler');
      if (error) throw error;
      return data === true;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 2: Type-check** — `mcp__ide__getDiagnostics` on the new file. Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add hooks/campus-living/use-is-hosteler.ts
git commit -m "feat(campus-living): useIsHosteler() hook backed by user_is_hosteler() rpc"
```

---

### Task 6: Route guard on the My Hostel page

**Files:**
- Modify: `app/(routes)/campus-living/my-hostel/page.tsx` (top of component, before the existing data fetch at lines 58-86)

- [ ] **Step 1: Add the guard**

Add imports and an early gate inside `MyHostelPage` (keep existing allocation logic below it):

```tsx
import { useIsHosteler } from '@/hooks/campus-living/use-is-hosteler';
import { useAuth } from '@/hooks/use-auth';
// ...
const { hasPermission, isSuperAdmin } = useAuth();
const { data: isHosteler, isLoading: hostelerLoading } = useIsHosteler();

const allowed = isSuperAdmin || (hasPermission('campus_living.my_hostel.view') && isHosteler);

if (hostelerLoading) {
  return (
    <ContentLayout title='My Hostel'>
      <div className='flex items-center justify-center min-h-[400px]'>
        <Loader2 className='h-8 w-8 animate-spin text-primary' />
      </div>
    </ContentLayout>
  );
}

if (!allowed) {
  return (
    <ContentLayout title='My Hostel'>
      <Card><CardContent className='p-8 text-center space-y-2'>
        <AlertCircle className='h-10 w-10 mx-auto text-muted-foreground' />
        <p className='text-muted-foreground'>
          My Hostel is available only to hostel residents.
        </p>
      </CardContent></Card>
    </ContentLayout>
  );
}
```

- [ ] **Step 2: Type-check** — `mcp__ide__getDiagnostics` on the page. Expected: clean.

- [ ] **Step 3: Browser check** — log in as a hosteler → page renders; as a day-scholar (or via temporary role) → "available only to hostel residents."

- [ ] **Step 4: Commit**

```bash
git add "app/(routes)/campus-living/my-hostel/page.tsx"
git commit -m "feat(campus-living): gate My Hostel page to hostelers (perm + user_is_hosteler)"
```

---

### Task 7: Navigation — gate admin chips, add a My Hostel bucket

**Files:**
- Modify: `lib/sidebarMenuLink.ts` (MENU_PERMISSIONS object, near line 486)
- Modify: `app/(routes)/campus-living/nav-config.ts`

- [ ] **Step 1: Add MENU_PERMISSIONS entries** (so non-holders don't see chips)

After the existing `'/campus-living': 'campus_living.view',` line, add:

```ts
  // My Hostel (resident self-service)
  '/campus-living/my-hostel': 'campus_living.my_hostel.view',
  '/campus-living/my-hostel/premium': 'campus_living.premium.view_dashboard',
  '/campus-living/my-hostel/premium/pick-room': 'campus_living.premium.pick_room',
  '/campus-living/my-hostel/premium/invite-roommate': 'campus_living.premium.invite_roommate',
  // Admin Residents-bucket chips (hidden from the trimmed student role)
  '/campus-living/residents': 'campus_living.residents.view',
  '/campus-living/blocks': 'campus_living.blocks.view',
  '/campus-living/wardens': 'campus_living.wardens.view',
  '/campus-living/allocations': 'campus_living.allocations.view',
  '/campus-living/vacate-requests': 'campus_living.vacate_requests.view',
```

- [ ] **Step 2: Promote "My Hostel" to its own tier-2 bucket** in `nav-config.ts`

Move the three premium chips + My Hostel out of the admin "Residents" group into a new top-level group placed before "Residents":

```ts
{
  label: 'My Hostel',
  icon: 'Home',
  href: '/campus-living/my-hostel',
  matchPaths: ['/campus-living/my-hostel', '/campus-living/my-hostel/premium'],
  children: [
    { label: 'My Hostel', icon: 'Home', href: '/campus-living/my-hostel', matchPaths: ['/campus-living/my-hostel'] },
    { label: 'Premium Stay', icon: 'Sparkles', href: '/campus-living/my-hostel/premium', matchPaths: ['/campus-living/my-hostel/premium'] },
    { label: 'Pick Room', icon: 'BedDouble', href: '/campus-living/my-hostel/premium/pick-room', matchPaths: ['/campus-living/my-hostel/premium/pick-room'] },
    { label: 'Invite Roommate', icon: 'UserPlus', href: '/campus-living/my-hostel/premium/invite-roommate', matchPaths: ['/campus-living/my-hostel/premium/invite-roommate'] },
  ],
},
```

Then delete the `My Hostel` / `Premium Stay` / `Pick Room` / `Invite Roommate` child entries (and their two `matchPaths`) from the existing "Residents" group (lines 90-117).

- [ ] **Step 3: Regenerate route manifest + run gates**

```bash
npm run gen:routes
npm run check:menus
npm run check:reachability
```
Expected: all pass (route-manifest.generated.ts updates; reachability under 60).

- [ ] **Step 4: Browser check** — as hosteler: sidebar Campus Living shows a "My Hostel" bucket and NOT Blocks/Wardens/Allocations/Residents. As warden: unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/sidebarMenuLink.ts "app/(routes)/campus-living/nav-config.ts" lib/navigation/route-manifest.generated.ts
git commit -m "feat(campus-living): dedicated My Hostel nav bucket + gate admin chips via MENU_PERMISSIONS"
```

---

### Task 8 (P1 gate): End-to-end access verification

- [ ] **Step 1:** As a real hosteler account in the browser — Campus Living shows only the My Hostel bucket; `/campus-living/my-hostel` renders; `/campus-living/allocations` is not in nav and (if visited) shows no rows (RLS).
- [ ] **Step 2:** As a day-scholar student — Campus Living module entry hidden or My Hostel guarded ("residents only").
- [ ] **Step 3:** As warden/hostel_office — full admin nav + data unchanged.
- [ ] **Step 4:** Record results in PR description. **Phase 1 done = correct gating proven.**

---

# PHASE 2 — Read hub (Overview + My Category & Fees)

### Task 9: `MyHostelService` (aggregate resident reads)

**Files:**
- Create: `lib/services/campus-living/my-hostel-service.ts`

- [ ] **Step 1: Write the service** (static class, browser client; primary source is `learners_profiles` via the existing own-read policy)

```ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export interface MyHostelSummary {
  learnerId: string;
  accommodationType: string | null;
  hostelCategory: { id: string; name: string; type: string | null } | null;
  messCategory: { id: string; name: string } | null;
  hostelFee: number | null;
  institutionId: string | null;
}

export class MyHostelService {
  // Resolves the current learner's hostel summary. learnerId comes from
  // get_my_learner_id() on the server; here we read the own learner row
  // (RLS: students_view_own_learner_profile).
  static async getMySummary(learnerId: string): Promise<MyHostelSummary | null> {
    if (!learnerId) return null;
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('learners_profiles')
      .select(
        'id, accommodation_type, hostel_fee, institution_id, ' +
        'hostel_categories:hostel_category_id(id, name, type), ' +
        'mess_categories:mess_category_id(id, name)'
      )
      .eq('id', learnerId)
      .maybeSingle();
    if (error) { logger.error('campus-living/my-hostel', 'getMySummary', error); throw error; }
    if (!data) return null;
    const row = data as any;
    return {
      learnerId: row.id,
      accommodationType: row.accommodation_type ?? null,
      hostelCategory: row.hostel_categories ?? null,
      messCategory: row.mess_categories ?? null,
      hostelFee: row.hostel_fee ?? null,
      institutionId: row.institution_id ?? null,
    };
  }

  // Fee breakdown (additive: room+mess+amenity) for the resident's hostel
  // category in the current hostel year. VERIFIED column names:
  //   hostel_category_fees(hostel_category_id, mess_category_id,
  //     amenities_category_id, amount, frequency, is_active, hostel_year_id)
  //   hostel_years(is_current, is_active, start_date)  -- prefer is_current.
  static async getMyCategoryFees(hostelCategoryId: string) {
    if (!hostelCategoryId) return [];
    const supabase = createClientSupabaseClient();
    // Pick the current hostel year (is_current first, else most recent).
    const { data: years } = await supabase
      .from('hostel_years')
      .select('id, is_current, start_date')
      .order('is_current', { ascending: false })
      .order('start_date', { ascending: false })
      .limit(1);
    const year = years?.[0] as { id: string } | undefined;
    if (!year) return [];
    const { data, error } = await supabase
      .from('hostel_category_fees')
      .select('id, amount, frequency, mess_category_id, amenities_category_id, is_active')
      .eq('hostel_year_id', year.id)
      .eq('hostel_category_id', hostelCategoryId)
      .eq('is_active', true);
    if (error) { logger.error('campus-living/my-hostel', 'getMyCategoryFees', error); throw error; }
    return data ?? [];
  }
}
```

> Verified schema (no further investigation needed): `learners_profiles` embeds resolve via
> `hostel_categories:hostel_category_id(id,name,type)` and `mess_categories:mess_category_id(id,name)`
> (FKs confirmed). `hostel_category_fees` keys on `hostel_category_id` (NOT `category_id`).
> Identity: `useAuth()` returns ONLY `{ profile, isLoading, error }` — `profile.id` = auth.uid(),
> `profile.learner_id` = learners_profiles.id (used for the summary read; RLS policy
> `students_view_own_learner_profile` permits it). For permission checks use
> `usePermissions().can()/isSuperAdmin`, NOT useAuth.

- [ ] **Step 2: Type-check** — `mcp__ide__getDiagnostics`. Expected: clean (note: `.from('learners_profiles')` must exist in `types/supabase.ts` — it does, table is registered).

- [ ] **Step 3: Commit**

```bash
git add lib/services/campus-living/my-hostel-service.ts
git commit -m "feat(campus-living): MyHostelService for resident summary + category fees"
```

---

### Task 10: Query keys + `useMyHostel` hooks

**Files:**
- Modify: `lib/query/query-keys.ts`
- Create: `hooks/campus-living/use-my-hostel.ts`

- [ ] **Step 1: Add query keys** (follow the existing factory pattern in the file)

```ts
myHostel: {
  summary: (learnerId: string) => ['campus-living', 'my-hostel', 'summary', learnerId] as const,
  fees: (categoryId: string) => ['campus-living', 'my-hostel', 'fees', categoryId] as const,
},
```

- [ ] **Step 2: Write the hooks**

```ts
'use client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { MyHostelService } from '@/lib/services/campus-living/my-hostel-service';

// profiles.learner_id is exposed on the auth profile; fall back gracefully.
export function useMyHostelSummary() {
  const { profile } = useAuth();
  const learnerId = (profile as any)?.learner_id ?? '';
  return useQuery({
    queryKey: ['campus-living', 'my-hostel', 'summary', learnerId],
    queryFn: () => MyHostelService.getMySummary(learnerId),
    enabled: !!learnerId,
  });
}

export function useMyCategoryFees(categoryId?: string | null) {
  return useQuery({
    queryKey: ['campus-living', 'my-hostel', 'fees', categoryId ?? ''],
    queryFn: () => MyHostelService.getMyCategoryFees(categoryId!),
    enabled: !!categoryId,
  });
}
```

> Step 2a verification: confirm `profile.learner_id` is present on the object returned by `useAuth()` (read `hooks/use-auth-provider.tsx` profile select). If absent, add `learner_id` to that select, or call the `get_my_learner_id` RPC inside the service instead.

- [ ] **Step 3: Type-check** both files. Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/query/query-keys.ts hooks/campus-living/use-my-hostel.ts
git commit -m "feat(campus-living): useMyHostel hooks + query keys"
```

---

### Task 11: Tabbed hub — Overview + My Category & Fees panels

**Files:**
- Create: `app/(routes)/campus-living/my-hostel/_components/overview-tab.tsx`
- Create: `app/(routes)/campus-living/my-hostel/_components/category-fees-tab.tsx`
- Modify: `app/(routes)/campus-living/my-hostel/page.tsx`

- [ ] **Step 1: Build `overview-tab.tsx`** — reuse the existing allocation card markup currently in `page.tsx` (lines 106-162) and add a category-based summary from `useMyHostelSummary()` for when there's no allocation (the common case — table is empty). Keep `InfoTile`.

- [ ] **Step 2: Build `category-fees-tab.tsx`** — render `useMyHostelSummary()` (category name/type, mess category, `hostel_fee`) + `useMyCategoryFees(summary.hostelCategory?.id)` as a small breakdown table. Empty state: "Fee structure not published for your category yet."

- [ ] **Step 3: Convert `page.tsx` to URL-param tabs** — after the Task 6 guard, render a Shadcn `Tabs` driven by `?tab=` via `useSearchParams`/`router.replace` (per the repo's Radix-eager-render gotcha — render only the active tab's component, not all panels). Tabs: `overview` (default), `category-fees`, plus placeholders `requests`/`profile` wired in Phase 3. Keep the vacate CTA in the Requests area.

```tsx
const searchParams = useSearchParams();
const tab = searchParams.get('tab') ?? 'overview';
// <Tabs value={tab} onValueChange={(v)=>router.replace(`?tab=${v}`)}> ... render only active panel ...
```

- [ ] **Step 4: Type-check** all three files. Expected: clean.

- [ ] **Step 5: Browser check** — hosteler sees Overview (category summary) + My Category & Fees (their category + fee breakdown). Switching tabs updates `?tab=` and does not refetch all panels.

- [ ] **Step 6: Commit**

```bash
git add "app/(routes)/campus-living/my-hostel/"
git commit -m "feat(campus-living): My Hostel tabbed hub — Overview + Category & Fees"
```

---

### Task 12: Student landing redirect

**Files:**
- Modify: `app/(routes)/campus-living/page.tsx`

- [ ] **Step 1:** At the top of the dashboard component, if the user is a hosteler without `campus_living.dashboard.view`, redirect to `/campus-living/my-hostel`:

```tsx
const { hasPermission, isSuperAdmin } = useAuth();
const router = useRouter();
useEffect(() => {
  if (!isSuperAdmin && !hasPermission('campus_living.dashboard.view')) {
    router.replace('/campus-living/my-hostel');
  }
}, [isSuperAdmin, hasPermission, router]);
```

- [ ] **Step 2: Browser check** — hosteler visiting `/campus-living` lands on My Hostel; warden lands on the dashboard.

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/campus-living/page.tsx"
git commit -m "feat(campus-living): route hostelers from module root to My Hostel"
```

---

# PHASE 3 — Requests + Profile (self-service actions)

### Task 13: Requests tab (vacate + leave + gate passes, own-scoped)

**Files:**
- Create: `supabase/migrations/20260531093000_resident_request_insert_rls.sql`
- Create: `app/(routes)/campus-living/my-hostel/_components/requests-tab.tsx`
- Modify: `app/(routes)/campus-living/my-hostel/page.tsx` (wire the `requests` tab)
- Modify: `supabase/setup/03_policies.sql`

- [ ] **Step 0: Own-INSERT RLS (deferred from Task 4).** Add self-bound INSERT branches so a resident can file ONLY their own leave/gate-pass requests. The resident branch must be self-constrained by `learner_id = auth.uid()` and must NOT rely on the staff `*.create AND role_has_institution_access` branch (residents share `*.create`, so that branch would let them file for classmates). Apply to the live DB, mirror into `03_policies.sql`, verify with impersonation that a hosteler can insert a row with their own `learner_id` but is rejected inserting with a different `learner_id`.

```sql
-- hostel_leave_requests: append resident self-insert
DROP POLICY IF EXISTS hostel_leave_requests_insert_permission ON public.hostel_leave_requests;
CREATE POLICY hostel_leave_requests_insert_permission ON public.hostel_leave_requests
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('campus_living.leave.create') AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))
  OR (user_has_permission('campus_living.leave.request') AND learner_id = auth.uid())
);

-- hostel_gate_passes: append resident self-insert (self-bound, not institution-wide)
DROP POLICY IF EXISTS hostel_gate_passes_insert_permission ON public.hostel_gate_passes;
CREATE POLICY hostel_gate_passes_insert_permission ON public.hostel_gate_passes
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('campus_living.gate_passes.approve') AND role_has_institution_access(institution_id))
  OR (user_has_permission('campus_living.gate_passes.create') AND learner_id = auth.uid())
);
```

> Note: the gate-pass staff branch is re-expressed as `gate_passes.approve` (a staff-only key) so the broad institution-wide insert stays with staff while residents are self-bound via `gate_passes.create AND learner_id = auth.uid()`. Confirm which staff roles hold `gate_passes.approve` vs `.create` before applying; if staff rely on `.create` for on-behalf creation, instead keep the original staff branch and add a separate `submitted_by`/`created_by = auth.uid()`-style self-constraint. Decide during this task with the actual role grants in hand.

- [ ] **Step 1:** Build `requests-tab.tsx` with three sections:
  - **Vacate** — reuse `useMyVacateRequests(userId)` (already used in current page) + the existing "Request Vacate" CTA → `/campus-living/my-hostel/vacate-request`.
  - **Leave** — read own via the existing `use-hostel-leave` hook filtered to `learner_id = profile.id`; add a "Request Leave" CTA. (Confirm the leave hook/service exposes an own-scope list; if not, add `getMyLeaveRequests(profileId)` to `hostel-leave-service.ts` selecting `.eq('learner_id', profileId)`.)
  - **Gate Passes** — same pattern via `use-hostel-visitors`/gate-pass hook or a new `getMyGatePasses(profileId)` on the gate-pass service.

- [ ] **Step 2: Type-check.** Expected: clean.

- [ ] **Step 3: RLS verification** — as hosteler, the leave/gate-pass lists return only own rows (re-run impersonation count query from Task 4). As day-scholar, the page is already guarded.

- [ ] **Step 4: Browser check** — hosteler sees own vacate/leave/gate-pass history + can open the request forms.

- [ ] **Step 5: Commit**

```bash
git add "app/(routes)/campus-living/my-hostel/"
git commit -m "feat(campus-living): My Hostel Requests tab (vacate/leave/gate-pass, own-scoped)"
```

---

### Task 14: Profile & Emergency tab (view + edit own)

**Files:**
- Create: `app/(routes)/campus-living/my-hostel/_components/profile-tab.tsx`
- Modify: `app/(routes)/campus-living/my-hostel/page.tsx` (wire the `profile` tab)

- [ ] **Step 1:** Build `profile-tab.tsx` using `LearnerHostelProfileService.getProfile(learnerId)` (read) + `saveHostelFields(...)` (upsert) — these already exist. `learnerId` here is the **learners_profiles id** (`get_my_learner_id()` / `profile.learner_id`), NOT `profiles.id`, because `learner_hostel_profiles.learner_id → learners_profiles`. Form: emergency contact name/phone/relation, medical notes, parent phone. react-hook-form + Zod, with `if (mutation.isPending) return;` double-submit guard (repo gotcha).

- [ ] **Step 2:** Pass `updatedBy = profile.id` (auth/profiles id) to `saveHostelFields`.

- [ ] **Step 3: RLS verification** — impersonate hosteler: `SELECT`/`UPDATE` on own `learner_hostel_profiles` row succeeds; a different learner_id row is invisible/denied.

- [ ] **Step 4: Type-check + browser check** — hosteler edits + saves emergency contact; reload shows persisted values.

- [ ] **Step 5: Commit**

```bash
git add "app/(routes)/campus-living/my-hostel/"
git commit -m "feat(campus-living): My Hostel Profile & Emergency tab (own view/edit)"
```

---

# Final verification (all phases)

- [ ] `mcp__ide__getDiagnostics` clean on every touched TS/TSX file.
- [ ] `npm run check:menus` and `npm run check:reachability` pass.
- [ ] RLS impersonation matrix: hosteler (own only), day-scholar (gate fails), warden (unchanged) — all confirmed.
- [ ] Browser walkthrough as a real hosteler: nav shows only My Hostel; Overview, Category & Fees, Requests, Profile all render own data; can submit vacate/leave/gate-pass and edit emergency profile.
- [ ] PR description records the impersonation evidence + screenshots.

# Rollback

Each migration is reversible: `student_role_resident_bundle` — re-grant prior keys from the Task 3 Step 1 snapshot; RLS — `DROP POLICY ... ; CREATE POLICY` restoring the admin-only quals captured in this plan; `user_is_hosteler()` — `DROP FUNCTION`.
