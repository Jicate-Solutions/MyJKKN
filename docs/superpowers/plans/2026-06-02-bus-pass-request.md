# Bus Pass Request → Transport Head Approval → Learner Profile Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a student submit a Bus Pass Request choosing only a live Bus Route + Boarding Stop; on Transport Head approval, auto-write `bus_required=true` + `transport_route_id` + `transport_stop_id` onto the student's `learners_profiles` row so the TMS app can read who needs a bus.

**Architecture:** Reuse the existing config-driven service-request engine. Add two live, DB-backed field types (`tms_route`, `tms_route_stop`) sourced from `tms_route`/`tms_route_stop`; re-seed the existing `transport-request` ("Bus Pass Request") type to use them; add a `transport_head` role as the approver; and call a new `SECURITY DEFINER` RPC from the approval engine's final-approval branch to write the chosen route/stop back to `learners_profiles`.

**Tech Stack:** Next.js 16 / React 19, TypeScript, TanStack Query v5, Supabase (Postgres + RLS), Zod, Shadcn UI.

> **Repo reality (read first):** There is **no automated test suite** in this repo. "Verify" = `mcp__ide__getDiagnostics` on touched files (seconds; do NOT run full `tsc`), SQL assertions via `mcp__supabase__execute_sql`, the `npm run check:*` gates when routes/keys change, and browser exercise. Every Supabase migration applied via `mcp__supabase__apply_migration` MUST also have its real SQL body committed to `supabase/migrations/` and (for functions) mirrored into `supabase/setup/02_functions.sql`. Strict mode is OFF, so types only surface via IDE diagnostics.

**Spec:** `docs/superpowers/specs/2026-06-02-bus-pass-request-transport-approval-profile-sync-design.md`

---

## File Structure / Decomposition

| File | Responsibility | Action |
|---|---|---|
| `types/service-request.ts` | Add `tms_route`/`tms_route_stop` to the field-type union + zod enum | Modify |
| `hooks/service-requests/use-tms-lookups.ts` | Live route + cascade-stop React Query hooks | Create |
| `app/(routes)/service-requests/_components/dynamic-request-form.tsx` | Render the two new field types (live dropdowns + cascade) | Modify |
| `lib/services/service-requests/transport-seed.ts` | Fresh-install parity (2 live fields, student roles) | Modify |
| `lib/services/service-requests/service-request-approval-service.ts` | Call the sync RPC on final approval | Modify |
| `supabase/migrations/20260602100000_*.sql` | Enum extension (`ALTER TYPE`) — applied ALONE | Create |
| `supabase/migrations/20260602100100_*.sql` | Re-seed live fields + narrow `allowed_roles` | Create |
| `supabase/migrations/20260602100200_*.sql` | `transport_head` role + grants + approval-step approver | Create |
| `supabase/migrations/20260602100300_*.sql` | `sync_bus_pass_to_learner_profile` RPC | Create |
| `supabase/setup/02_functions.sql` | Mirror the RPC (reference file) | Modify |

---

## Task 0: Create the feature branch

**Files:** none (git only)

- [ ] **Step 1: Branch off main, isolated from the in-flight billing work**

The current branch is `feat/billing-analytics-dashboard` with unrelated uncommitted billing files. Create a clean branch from `main` so the two features stay separate.

```bash
cd D:/Projects/MyJKKN
git stash list   # confirm nothing of ours is stashed
git checkout main
git pull --ff-only
git checkout -b feat/bus-pass-request
```

Expected: now on `feat/bus-pass-request`. The untracked billing files (`hooks/billing/use-billing-analytics.ts`, `lib/services/billing/analytics/`) follow along untracked — leave them alone, do not stage them in any commit below.

- [ ] **Step 2: Confirm branch**

```bash
git branch --show-current
```
Expected: `feat/bus-pass-request`

---

## Task 1: Extend the field-type union + zod enum

**Files:**
- Modify: `types/service-request.ts` (union ~line 21-28; zod `serviceTypeFieldSchema.field_type` ~line 358)

- [ ] **Step 1: Add the two new values to the `ServiceFieldType` union**

Replace the existing `ServiceFieldType` definition:

```typescript
export type ServiceFieldType =
  | 'text'
  | 'select'
  | 'date'
  | 'number'
  | 'boolean'
  | 'textarea'
  | 'file'
  | 'tms_route'
  | 'tms_route_stop';
```

- [ ] **Step 2: Add the two values to the zod `field_type` enum**

In `serviceTypeFieldSchema`, replace the `field_type` line:

```typescript
  field_type: z.enum(['text', 'select', 'date', 'number', 'boolean', 'textarea', 'file', 'tms_route', 'tms_route_stop']),
```

- [ ] **Step 3: Verify types**

Run `mcp__ide__getDiagnostics` on `types/service-request.ts`.
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add types/service-request.ts
git commit -m "feat(service-requests): add tms_route + tms_route_stop field types"
```

---

## Task 2: Live TMS lookup hooks

**Files:**
- Create: `hooks/service-requests/use-tms-lookups.ts`

Reads go directly through the browser Supabase client. This is safe and intentional: `tms_route` and `tms_route_stop` already expose a `*_select_authenticated` RLS policy (`roles={authenticated}, qual=true`), so any logged-in user can read them; the dynamic form is already a `'use client'` component that imports `createClientSupabaseClient`. No new API route needed.

- [ ] **Step 1: Create the hook file**

```typescript
/**
 * TMS Lookup Hooks (for Bus Pass Request form fields)
 *
 * Live route + cascade-stop dropdown data sourced from tms_route / tms_route_stop.
 * RLS already allows any authenticated user to SELECT these (read-only reference).
 *
 * @module hooks/service-requests/use-tms-lookups
 * @created 2026-06-02
 */

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface TmsRouteOption {
  id: string;
  route_number: string;
  route_name: string;
}

export interface TmsRouteStopOption {
  id: string;
  stop_name: string;
  sequence_order: number;
}

export const tmsLookupKeys = {
  all: ['tms-lookups'] as const,
  routes: () => [...tmsLookupKeys.all, 'routes'] as const,
  stops: (routeId: string) => [...tmsLookupKeys.all, 'stops', routeId] as const,
};

/** Active bus routes, ordered by route_number. */
export function useTmsRoutes() {
  return useQuery<TmsRouteOption[]>({
    queryKey: tmsLookupKeys.routes(),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('tms_route')
        .select('id, route_number, route_name')
        .eq('status', 'active')
        .order('route_number', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as TmsRouteOption[];
    },
  });
}

/** Stops for a route, ordered by sequence_order. Disabled until routeId is set. */
export function useTmsRouteStops(routeId: string | undefined) {
  return useQuery<TmsRouteStopOption[]>({
    queryKey: tmsLookupKeys.stops(routeId ?? ''),
    enabled: !!routeId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('tms_route_stop')
        .select('id, stop_name, sequence_order')
        .eq('route_id', routeId!)
        .order('sequence_order', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as TmsRouteStopOption[];
    },
  });
}
```

- [ ] **Step 2: Verify types**

Run `mcp__ide__getDiagnostics` on `hooks/service-requests/use-tms-lookups.ts`.
Expected: no errors. (If `.from('tms_route')` errors with TS2769, the TMS tables aren't in `types/supabase.ts`; cast `(supabase as any)` like the rest of the service layer does — do NOT block on it.)

- [ ] **Step 3: Commit**

```bash
git add hooks/service-requests/use-tms-lookups.ts
git commit -m "feat(service-requests): live TMS route + stop lookup hooks"
```

---

## Task 3: Render the new field types in the dynamic form

**Files:**
- Modify: `app/(routes)/service-requests/_components/dynamic-request-form.tsx`

React's rules of hooks forbid calling `useTmsRoutes()` inside the `renderField` switch, so each new field type gets its own small sub-component that owns its hook. The parent passes the react-hook-form value + an `onChange` (which calls `setValue`), and — for the stop field — the currently selected route id.

- [ ] **Step 1: Import the hooks**

Add near the top imports (after the `createClientSupabaseClient` import, ~line 19):

```typescript
import { useTmsRoutes, useTmsRouteStops } from '@/hooks/service-requests/use-tms-lookups';
```

- [ ] **Step 2: Add the two new cases to `buildDynamicSchema`**

Inside the `switch (field.field_type)` in `buildDynamicSchema` (after the `'date'` case, ~line 68), add:

```typescript
      case 'tms_route':
      case 'tms_route_stop':
        schema = field.is_required
          ? z.string().min(1, `${field.field_label} is required`)
          : z.string().optional();
        break;
```

- [ ] **Step 3: Add the two sub-components**

Add these two components just above `export function DynamicRequestForm(` (~line 151):

```tsx
function TmsRouteFieldControl({
  field,
  value,
  onChange,
  error,
}: {
  field: ServiceTypeField;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const { data: routes = [], isLoading } = useTmsRoutes();
  return (
    <div className="space-y-2">
      <Label htmlFor={field.field_key}>
        {field.field_label}
        {field.is_required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      <Select value={value || ''} onValueChange={onChange} disabled={isLoading}>
        <SelectTrigger>
          <SelectValue
            placeholder={isLoading ? 'Loading routes…' : field.placeholder || 'Select a route'}
          />
        </SelectTrigger>
        <SelectContent>
          {routes.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.route_number} — {r.route_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {field.help_text && (
        <p className="text-xs text-muted-foreground">{field.help_text}</p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function TmsRouteStopFieldControl({
  field,
  routeId,
  value,
  onChange,
  error,
}: {
  field: ServiceTypeField;
  routeId: string | undefined;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const { data: stops = [], isLoading } = useTmsRouteStops(routeId);
  const disabled = !routeId || isLoading;
  return (
    <div className="space-y-2">
      <Label htmlFor={field.field_key}>
        {field.field_label}
        {field.is_required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      <Select value={value || ''} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue
            placeholder={
              !routeId
                ? 'Select a route first'
                : isLoading
                ? 'Loading stops…'
                : field.placeholder || 'Select a boarding stop'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {stops.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.stop_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {field.help_text && (
        <p className="text-xs text-muted-foreground">{field.help_text}</p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Compute the selected route id inside the component**

Inside `DynamicRequestForm`, just after `const allValues = watch();` (~line 176), add:

```typescript
  // The Boarding Stop field cascades off whichever field is the tms_route picker.
  const routeFieldKey = sortedFields.find((f) => f.field_type === 'tms_route')?.field_key;
  const selectedRouteId = routeFieldKey
    ? (allValues[routeFieldKey] as string | undefined)
    : undefined;
```

- [ ] **Step 5: Reset the stop field when the route changes**

Add a focused effect after the existing cascade-reset `useEffect` (after ~line 201). It skips the initial mount so edit-mode defaults are preserved:

```typescript
  // Clear the boarding-stop field whenever the selected route changes (but not
  // on first mount, so a pre-filled stop survives the edit flow's initial render).
  const stopResetMounted = useRef(false);
  useEffect(() => {
    if (!stopResetMounted.current) {
      stopResetMounted.current = true;
      return;
    }
    sortedFields.forEach((field) => {
      if (field.field_type === 'tms_route_stop') {
        setValue(field.field_key, '');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRouteId]);
```

- [ ] **Step 6: Add the two render cases**

Inside `renderField`'s `switch (field.field_type)`, add these cases before `default:` (~line 385):

```tsx
      case 'tms_route':
        return (
          <TmsRouteFieldControl
            key={field.field_key}
            field={field}
            value={watch(field.field_key) || ''}
            onChange={(v) => setValue(field.field_key, v)}
            error={errorMessage}
          />
        );

      case 'tms_route_stop':
        return (
          <TmsRouteStopFieldControl
            key={field.field_key}
            field={field}
            routeId={selectedRouteId}
            value={watch(field.field_key) || ''}
            onChange={(v) => setValue(field.field_key, v)}
            error={errorMessage}
          />
        );
```

- [ ] **Step 7: Verify types**

Run `mcp__ide__getDiagnostics` on `app/(routes)/service-requests/_components/dynamic-request-form.tsx`.
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add "app/(routes)/service-requests/_components/dynamic-request-form.tsx"
git commit -m "feat(service-requests): render live route + cascading boarding-stop fields"
```

---

## Task 4: Update the transport seed (fresh-install parity)

**Files:**
- Modify: `lib/services/service-requests/transport-seed.ts`

The live DB already has the type; this keeps a fresh re-seed consistent with the new design. It only runs when the type does not exist (idempotent guard already present).

- [ ] **Step 1: Narrow `allowed_roles`**

In the `service_types` insert object, change:

```typescript
      allowed_roles: ['super_admin', 'student'],
```

- [ ] **Step 2: Replace the `fields` array with the two live fields**

Replace the entire `const fields = [ ... ];` block (the 11-field array) with:

```typescript
  const fields = [
    {
      service_type_id: serviceType.id,
      field_key: 'bus_route',
      field_label: 'Bus Route',
      field_type: 'tms_route',
      is_required: true,
      display_order: 1,
      help_text: 'Select your bus route',
    },
    {
      service_type_id: serviceType.id,
      field_key: 'boarding_stop',
      field_label: 'Boarding Stop',
      field_type: 'tms_route_stop',
      is_required: true,
      display_order: 2,
      help_text: 'Select your boarding stop on the chosen route',
    },
  ];
```

- [ ] **Step 3: Verify types**

Run `mcp__ide__getDiagnostics` on `lib/services/service-requests/transport-seed.ts`.
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/services/service-requests/transport-seed.ts
git commit -m "feat(service-requests): seed Bus Pass Request with live route/stop fields"
```

---

## Task 5: Migration A — extend the `service_field_type` enum (apply ALONE)

**Files:**
- Create: `supabase/migrations/20260602100000_service_field_type_add_tms_values.sql`

`service_type_fields.field_type` is a Postgres enum (`service_field_type`). The new values MUST be added in their own committed transaction before any insert uses them (per the repo's "ALTER TYPE…ADD VALUE can't be used in the same transaction as DML referencing it" rule).

- [ ] **Step 1: Write the migration file**

```sql
-- Add live-lookup field types for the Bus Pass Request form.
-- ADD VALUE must be committed separately from any INSERT that uses it (next migration).
ALTER TYPE service_field_type ADD VALUE IF NOT EXISTS 'tms_route';
ALTER TYPE service_field_type ADD VALUE IF NOT EXISTS 'tms_route_stop';
```

- [ ] **Step 2: Apply via MCP**

Call `mcp__supabase__apply_migration` with name `service_field_type_add_tms_values` and the exact SQL body above.
Expected: success.

- [ ] **Step 3: Verify the enum now has the values**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT enumlabel FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'service_field_type' AND enumlabel IN ('tms_route','tms_route_stop');
```
Expected: two rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260602100000_service_field_type_add_tms_values.sql
git commit -m "feat(db): add tms_route + tms_route_stop to service_field_type enum"
```

---

## Task 6: Migration B — re-seed live fields + narrow roles on the existing type

**Files:**
- Create: `supabase/migrations/20260602100100_bus_pass_request_live_fields.sql`

This runs in a separate transaction from Task 5, so it may safely use the new enum values.

- [ ] **Step 1: Write the migration file**

```sql
-- Replace the Bus Pass Request's static fields with two live TMS lookup fields,
-- and restrict the type to students (the sync target learners_profiles is student-only).
DO $$
DECLARE
  v_type_id uuid;
BEGIN
  SELECT id INTO v_type_id FROM service_types WHERE slug = 'transport-request';
  IF v_type_id IS NULL THEN
    RAISE EXCEPTION 'transport-request service type not found';
  END IF;

  DELETE FROM service_type_fields WHERE service_type_id = v_type_id;

  INSERT INTO service_type_fields
    (service_type_id, field_key, field_label, field_type, is_required, display_order, help_text)
  VALUES
    (v_type_id, 'bus_route', 'Bus Route', 'tms_route', true, 1, 'Select your bus route'),
    (v_type_id, 'boarding_stop', 'Boarding Stop', 'tms_route_stop', true, 2,
       'Select your boarding stop on the chosen route');

  UPDATE service_types
     SET allowed_roles = ARRAY['super_admin','student']::text[]
   WHERE id = v_type_id;
END $$;
```

- [ ] **Step 2: Apply via MCP**

Call `mcp__supabase__apply_migration` with name `bus_pass_request_live_fields` and the SQL above.
Expected: success.

- [ ] **Step 3: Verify**

```sql
SELECT field_key, field_type, is_required, display_order
FROM service_type_fields
WHERE service_type_id = (SELECT id FROM service_types WHERE slug='transport-request')
ORDER BY display_order;

SELECT allowed_roles FROM service_types WHERE slug='transport-request';
```
Expected: two rows (`bus_route`/`tms_route`, `boarding_stop`/`tms_route_stop`); `allowed_roles = {super_admin,student}`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260602100100_bus_pass_request_live_fields.sql
git commit -m "feat(db): re-seed Bus Pass Request with live route/stop fields + student-only roles"
```

---

## Task 7: Migration C — `transport_head` role + grants + approval-step approver

**Files:**
- Create: `supabase/migrations/20260602100200_transport_head_role.sql`

`custom_roles.permissions` is a JSONB object keyed by permission key → boolean. `role_key` is uniquely constrained. `institution_scope='own'` makes each transport head see only their own institution's approvals (matches the role-driven, institution-pinned approvals inbox).

- [ ] **Step 1: Write the migration file**

```sql
-- Create the Transport Head role, grant it the service-request keys it needs,
-- and point the Bus Pass Request approval step at it.
INSERT INTO custom_roles
  (role_key, role_name, description, is_system_role, institution_scope, is_active, permissions)
VALUES (
  'transport_head',
  'Transport Head',
  'Reviews and approves student bus pass requests per institution.',
  false,
  'own',
  true,
  jsonb_build_object(
    'service_requests.approve', true,
    'service_requests.view_all', true,
    'service_requests.view_own', true
  )
)
ON CONFLICT (role_key) DO UPDATE
  SET permissions = custom_roles.permissions
        || jsonb_build_object(
             'service_requests.approve', true,
             'service_requests.view_all', true,
             'service_requests.view_own', true
           ),
      is_active = true;

-- Repoint the existing "Transport Head Review" step from administrator -> transport_head.
UPDATE service_request_approval_steps s
   SET approver_role = 'transport_head'
  FROM service_types t
 WHERE s.service_type_id = t.id
   AND t.slug = 'transport-request'
   AND s.step_order = 1;
```

- [ ] **Step 2: Apply via MCP**

Call `mcp__supabase__apply_migration` with name `transport_head_role` and the SQL above.
Expected: success.

- [ ] **Step 3: Verify**

```sql
SELECT role_key, role_name, institution_scope, is_active,
       permissions -> 'service_requests.approve' AS can_approve
FROM custom_roles WHERE role_key = 'transport_head';

SELECT s.step_name, s.approver_role
FROM service_request_approval_steps s
JOIN service_types t ON t.id = s.service_type_id
WHERE t.slug = 'transport-request';
```
Expected: role exists, `can_approve = true`; step `approver_role = transport_head`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260602100200_transport_head_role.sql
git commit -m "feat(rbac): add transport_head role + grants; set as Bus Pass approver"
```

---

## Task 8: Migration D — `sync_bus_pass_to_learner_profile` RPC

**Files:**
- Create: `supabase/migrations/20260602100300_sync_bus_pass_to_learner_profile.sql`
- Modify: `supabase/setup/02_functions.sql` (mirror the function body)

`SECURITY DEFINER` because the approver (transport_head) cannot UPDATE arbitrary `learners_profiles` rows under RLS. It is student-only by design: a requester with no `profiles.learner_id` is a graceful no-op.

- [ ] **Step 1: Write the migration file**

```sql
-- On final Bus Pass approval, write the chosen route/stop onto the learner's profile
-- so the TMS app can read who needs a bus (learners_profiles.bus_required = true).
CREATE OR REPLACE FUNCTION public.sync_bus_pass_to_learner_profile(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_id uuid;
  v_learner_id   uuid;
  v_form         jsonb;
  v_slug         text;
  v_route_id     uuid;
  v_stop_id      uuid;
BEGIN
  SELECT sr.requester_id, sr.form_data, st.slug
    INTO v_requester_id, v_form, v_slug
    FROM service_requests sr
    JOIN service_types st ON st.id = sr.service_type_id
   WHERE sr.id = p_request_id;

  IF v_requester_id IS NULL THEN
    RAISE NOTICE 'sync_bus_pass: request % not found', p_request_id;
    RETURN;
  END IF;

  IF v_slug <> 'transport-request' THEN
    RAISE NOTICE 'sync_bus_pass: request % is not a transport request (slug=%)', p_request_id, v_slug;
    RETURN;
  END IF;

  SELECT learner_id INTO v_learner_id FROM profiles WHERE id = v_requester_id;
  IF v_learner_id IS NULL THEN
    RAISE NOTICE 'sync_bus_pass: requester % has no learner profile; skipping', v_requester_id;
    RETURN;
  END IF;

  -- For live lookup fields, form_data holds UUID strings.
  BEGIN
    v_route_id := (v_form->>'bus_route')::uuid;
    v_stop_id  := (v_form->>'boarding_stop')::uuid;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'sync_bus_pass: bus_route/boarding_stop are not valid UUIDs for request %', p_request_id;
  END;

  IF v_route_id IS NULL OR v_stop_id IS NULL THEN
    RAISE EXCEPTION 'sync_bus_pass: missing route/stop for request %', p_request_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tms_route WHERE id = v_route_id) THEN
    RAISE EXCEPTION 'sync_bus_pass: route % does not exist', v_route_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tms_route_stop WHERE id = v_stop_id AND route_id = v_route_id) THEN
    RAISE EXCEPTION 'sync_bus_pass: stop % does not belong to route %', v_stop_id, v_route_id;
  END IF;

  UPDATE learners_profiles
     SET bus_required       = true,
         transport_route_id = v_route_id,
         transport_stop_id  = v_stop_id,
         updated_at         = now()
   WHERE id = v_learner_id;

  RAISE NOTICE 'sync_bus_pass: learner % bus_required=true route=% stop=%', v_learner_id, v_route_id, v_stop_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_bus_pass_to_learner_profile(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.sync_bus_pass_to_learner_profile(uuid) TO authenticated;
```

- [ ] **Step 2: Apply via MCP**

Call `mcp__supabase__apply_migration` with name `sync_bus_pass_to_learner_profile` and the SQL above.
Expected: success.

- [ ] **Step 3: Mirror into the reference file**

Append the same `CREATE OR REPLACE FUNCTION ... $$;` body (plus the REVOKE/GRANT) to `supabase/setup/02_functions.sql`, in the service-requests section (or at the end with a header comment `-- sync_bus_pass_to_learner_profile (2026-06-02)`).

- [ ] **Step 4: Verify the function exists**

```sql
SELECT proname, prosecdef FROM pg_proc WHERE proname = 'sync_bus_pass_to_learner_profile';
```
Expected: one row, `prosecdef = true`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260602100300_sync_bus_pass_to_learner_profile.sql supabase/setup/02_functions.sql
git commit -m "feat(db): sync_bus_pass_to_learner_profile SECURITY DEFINER RPC"
```

---

## Task 9: Call the sync RPC from the approval engine

**Files:**
- Modify: `lib/services/service-requests/service-request-approval-service.ts` (in `handleApproved`, the `isLastStep` branch, ~line 191-200)

- [ ] **Step 1: Add the RPC call beside the existing webhook block**

In `handleApproved`, inside `if (isLastStep) { ... }`, immediately AFTER the existing transport webhook block (the `if (request.service_type?.slug === 'transport-request') { notifyTmsWebhook(...) }`), add:

```typescript
      // Bus Pass Request: write the approved route/stop onto the learner's
      // profile so the TMS app can read who needs a bus. Privileged cross-table
      // write → SECURITY DEFINER RPC. Failure is logged, not thrown: the
      // approval status change already committed above.
      if (request.service_type?.slug === 'transport-request') {
        const { error: busPassSyncError } = await supabase.rpc(
          'sync_bus_pass_to_learner_profile',
          { p_request_id: request.id }
        );
        if (busPassSyncError) {
          console.error(
            '[service-requests/approvals] Bus-pass profile sync failed:',
            busPassSyncError
          );
        }
      }
```

(`supabase` is already in scope from `const supabase = await getSupabase();` at the top of `handleApproved`.)

- [ ] **Step 2: Verify types**

Run `mcp__ide__getDiagnostics` on `lib/services/service-requests/service-request-approval-service.ts`.
Expected: no new errors. (`.rpc('sync_bus_pass_to_learner_profile', …)` is fine — `supabase` here is already cast `as any` via `getSupabase`.)

- [ ] **Step 3: Commit**

```bash
git add lib/services/service-requests/service-request-approval-service.ts
git commit -m "feat(service-requests): sync learner profile on Bus Pass approval"
```

---

## Task 10: Clean up the 3 throwaway test requests

**Files:** none (data cleanup via `mcp__supabase__execute_sql`)

The existing `SR-TRAN-*` rows hold pre-switch string values / junk; remove them so the UUID flow starts clean. Delete children first (no reliance on cascade).

- [ ] **Step 1: Delete the test requests and their children**

Run via `mcp__supabase__execute_sql`:

```sql
DO $$
DECLARE v_type_id uuid;
BEGIN
  SELECT id INTO v_type_id FROM service_types WHERE slug = 'transport-request';

  DELETE FROM service_request_timeline
   WHERE service_request_id IN (SELECT id FROM service_requests WHERE service_type_id = v_type_id);
  DELETE FROM service_request_approvals
   WHERE service_request_id IN (SELECT id FROM service_requests WHERE service_type_id = v_type_id);
  DELETE FROM service_request_attachments
   WHERE service_request_id IN (SELECT id FROM service_requests WHERE service_type_id = v_type_id);
  DELETE FROM service_requests WHERE service_type_id = v_type_id;
END $$;
```

- [ ] **Step 2: Verify**

```sql
SELECT count(*) FROM service_requests
WHERE service_type_id = (SELECT id FROM service_types WHERE slug='transport-request');
```
Expected: `0`.

---

## Task 11: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Diagnostics sweep**

Run `mcp__ide__getDiagnostics` on each touched file:
- `types/service-request.ts`
- `hooks/service-requests/use-tms-lookups.ts`
- `app/(routes)/service-requests/_components/dynamic-request-form.tsx`
- `lib/services/service-requests/transport-seed.ts`
- `lib/services/service-requests/service-request-approval-service.ts`

Expected: no new errors.

- [ ] **Step 2: Permission/menu gates**

```bash
npm run check:menus
```
Expected: passes (we added a role + reused existing keys; no new routes/keys, so this should be green).

- [ ] **Step 3: Browser — student submit**

As a **student** account: open `/service-requests/new` → pick "Bus Pass Request". Confirm:
- Bus Route dropdown lists active routes (`route_number — route_name`).
- Boarding Stop is disabled until a route is chosen, then lists that route's stops in order.
- Changing the route clears the stop.
- Submit succeeds.

Then confirm the stored UUIDs:

```sql
SELECT request_number, status, form_data
FROM service_requests
WHERE service_type_id = (SELECT id FROM service_types WHERE slug='transport-request')
ORDER BY created_at DESC LIMIT 1;
```
Expected: `form_data.bus_route` and `form_data.boarding_stop` are UUIDs; `status='submitted'`, `current_approval_step=1`.

- [ ] **Step 4: Browser — transport head approve**

Assign a non-super-admin test user the `transport_head` role (Role Management) in the same institution as the student. As that user, open `/service-requests/approvals`:
- The student's request appears (scoped to their institution).
- Approve it.

- [ ] **Step 5: Confirm the profile sync (the whole point)**

```sql
-- Replace <req_id> with the approved request id.
SELECT lp.id, lp.bus_required, lp.transport_route_id, lp.transport_stop_id
FROM learners_profiles lp
JOIN profiles p ON p.learner_id = lp.id
JOIN service_requests sr ON sr.requester_id = p.id
WHERE sr.request_number = '<approved SR-TRAN-...>';
```
Expected: `bus_required = true`, `transport_route_id` / `transport_stop_id` match the submitted `form_data`.

- [ ] **Step 6: Confirm the TMS read path**

```sql
SELECT count(*) AS bus_users FROM learners_profiles WHERE bus_required = true;
```
Expected: includes the just-approved learner. This is the query the TMS app uses.

- [ ] **Step 7: Final commit (if any reference docs changed)**

```bash
git status
# commit any remaining tracked changes (e.g. supabase/setup mirror) not yet committed
```

---

## Self-Review (completed by author)

- **Spec coverage:** §5.1→T1, §5.2→T2, §5.3→T3, §5.4 (RLS) → **dropped** (policies already open — noted in T2), §5.5→T4+T6, §5.6→T7, §5.7→T8+T9, §5.8→T10. Enum dependency (discovered) → T5 added. ✅
- **Placeholder scan:** no TBD/TODO; every code/SQL step is complete. ✅
- **Type/name consistency:** field keys `bus_route`/`boarding_stop`, field types `tms_route`/`tms_route_stop`, RPC `sync_bus_pass_to_learner_profile(p_request_id uuid)`, hooks `useTmsRoutes`/`useTmsRouteStops`, components `TmsRouteFieldControl`/`TmsRouteStopFieldControl` — consistent across tasks. ✅
- **Ordering:** enum extension (T5) precedes the insert that uses it (T6), in separate transactions. ✅

## Known follow-ups (out of scope — flag if wanted)

- Admin field-builder UI support for the new field types (`field-builder.tsx`) — only needed if types are hand-edited via the UI.
- Staff/faculty transport (different table).
- `transport_fee` population (billing owns it).
