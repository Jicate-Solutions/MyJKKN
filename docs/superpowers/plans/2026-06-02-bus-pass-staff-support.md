# Bus Pass Request — Staff Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Let staff submit a Bus Pass Request (alongside learners); add a read-only auto-detected Passenger Type; mirror transport columns onto `staff`; route the on-approval sync to learner OR staff by the requester's real identity.

**Architecture:** Extends the shipped Bus Pass feature. New `passenger_type` field type (read-only, auto-detected via `useAuth`). `staff` gets `bus_required`/`transport_route_id`/`transport_stop_id` mirroring `learners_profiles`. The hardened `sync_bus_pass_to_learner_profile` RPC gains an identity branch (learner_id → learners_profiles; else staff.profile_id → staff). Eligibility widened to all staff roles.

**Tech Stack:** Next.js 16 / React 19, TanStack Query v5, Supabase (Postgres + RLS), Zod, Shadcn.

> **Repo reality:** No test suite. Verify via lint + reading (`getDiagnostics` unavailable) + SQL assertions + rolled-back-transaction RPC tests + browser. Every `apply_migration` body is also committed to `supabase/migrations/`; functions mirrored to `supabase/setup/02_functions.sql`. **DB migration tasks are applied by the controller** against production Supabase with immediate verification; **code tasks go to implementer subagents**.

**Spec:** `docs/superpowers/specs/2026-06-02-bus-pass-staff-support-design.md`
**Branch:** `feat/bus-pass-staff` (already created off `main`).

---

## Task 1 (controller, DB): `staff` transport columns

**File:** `supabase/migrations/20260602110000_staff_transport_columns.sql`

```sql
-- Mirror learners_profiles transport columns onto staff so staff bus passes sync here.
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS bus_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transport_route_id uuid REFERENCES public.tms_route(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transport_stop_id uuid REFERENCES public.tms_route_stop(id) ON DELETE SET NULL;
```

Apply via `apply_migration` (name `staff_transport_columns`). Verify:
```sql
SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='staff' AND column_name IN ('bus_required','transport_route_id','transport_stop_id');
```
Expected: 3 rows. Commit the file.

---

## Task 2 (controller, DB): extend `service_field_type` enum — apply ALONE

**File:** `supabase/migrations/20260602110100_service_field_type_add_passenger_type.sql`

```sql
ALTER TYPE service_field_type ADD VALUE IF NOT EXISTS 'passenger_type';
```

Apply alone (separate txn, before any insert uses it). Verify the label exists. Commit.

---

## Task 3 (controller, DB): add `passenger_type` field + widen `allowed_roles`

**File:** `supabase/migrations/20260602110200_bus_pass_staff_field_and_roles.sql` (separate txn from Task 2)

```sql
DO $$
DECLARE
  v_type_id uuid;
  v_roles   text[];
BEGIN
  SELECT id INTO v_type_id FROM service_types WHERE slug='transport-request';
  IF v_type_id IS NULL THEN RAISE EXCEPTION 'transport-request service type not found'; END IF;

  -- Read-only auto-detected Passenger Type, shown first.
  IF NOT EXISTS (SELECT 1 FROM service_type_fields WHERE service_type_id=v_type_id AND field_key='passenger_type') THEN
    INSERT INTO service_type_fields (service_type_id, field_key, field_label, field_type, is_required, display_order, help_text)
    VALUES (v_type_id, 'passenger_type', 'Passenger Type', 'passenger_type', false, 0, 'Detected automatically from your account');
  END IF;

  -- Eligibility: every staff role + student + super_admin (deduped).
  SELECT array_agg(DISTINCT rk) INTO v_roles
  FROM (
    SELECT role_key AS rk FROM staff WHERE role_key IS NOT NULL
    UNION SELECT 'student'
    UNION SELECT 'super_admin'
  ) t;
  UPDATE service_types SET allowed_roles = v_roles WHERE id=v_type_id;
END $$;
```

Apply. Verify the field exists at display_order 0 and `allowed_roles` includes `faculty`/`staff`/`student`. Commit.

---

## Task 4 (controller, DB): route the sync RPC by identity (learner OR staff)

**File:** `supabase/migrations/20260602110300_sync_bus_pass_staff_routing.sql` + mirror into `supabase/setup/02_functions.sql`.

Full `CREATE OR REPLACE` (keeps the hardened guards; replaces the learner-only tail with an identity branch):

```sql
CREATE OR REPLACE FUNCTION public.sync_bus_pass_to_learner_profile(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_id uuid;
  v_learner_id   uuid;
  v_staff_id     uuid;
  v_form         jsonb;
  v_slug         text;
  v_status       text;
  v_route_id     uuid;
  v_stop_id      uuid;
BEGIN
  SELECT sr.requester_id, sr.form_data, st.slug, sr.status::text
    INTO v_requester_id, v_form, v_slug, v_status
    FROM service_requests sr
    JOIN service_types st ON st.id = sr.service_type_id
   WHERE sr.id = p_request_id;

  IF v_requester_id IS NULL THEN
    RAISE NOTICE 'sync_bus_pass: request % not found', p_request_id; RETURN;
  END IF;

  IF v_slug <> 'transport-request' THEN
    RAISE NOTICE 'sync_bus_pass: request % is not a transport request (slug=%)', p_request_id, v_slug; RETURN;
  END IF;

  IF NOT (public.is_super_admin() OR public.user_has_permission('service_requests.approve')) THEN
    RAISE EXCEPTION 'sync_bus_pass: not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('approved', 'fulfilled') THEN
    RAISE EXCEPTION 'sync_bus_pass: request % is not approved (status=%)', p_request_id, v_status;
  END IF;

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

  -- Route to the correct table by the requester's REAL identity (not the form's
  -- passenger_type, which is display-only). Learner takes priority.
  SELECT learner_id INTO v_learner_id FROM profiles WHERE id = v_requester_id;
  IF v_learner_id IS NOT NULL THEN
    UPDATE learners_profiles
       SET bus_required=true, transport_route_id=v_route_id, transport_stop_id=v_stop_id, updated_at=now()
     WHERE id = v_learner_id;
    RAISE NOTICE 'sync_bus_pass: learner % set route=% stop=%', v_learner_id, v_route_id, v_stop_id;
    RETURN;
  END IF;

  SELECT id INTO v_staff_id FROM staff WHERE profile_id = v_requester_id;
  IF v_staff_id IS NOT NULL THEN
    UPDATE staff
       SET bus_required=true, transport_route_id=v_route_id, transport_stop_id=v_stop_id, updated_at=now()
     WHERE id = v_staff_id;
    RAISE NOTICE 'sync_bus_pass: staff % set route=% stop=%', v_staff_id, v_route_id, v_stop_id;
    RETURN;
  END IF;

  RAISE NOTICE 'sync_bus_pass: requester % is neither learner nor staff; skipping', v_requester_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_bus_pass_to_learner_profile(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.sync_bus_pass_to_learner_profile(uuid) TO authenticated;
```

Apply; mirror the same body into `supabase/setup/02_functions.sql` (replace the existing definition there). Commit migration + mirror.

---

## Task 5 (subagent, code): add `passenger_type` field type

**File:** `types/service-request.ts`

- Add `| 'passenger_type'` to the `ServiceFieldType` union.
- Add `'passenger_type'` to the zod `field_type` enum in `serviceTypeFieldSchema`.

Verify by reading; commit `feat(service-requests): add passenger_type field type`.

---

## Task 6 (subagent, code): render the read-only Passenger Type field

**File:** `app/(routes)/service-requests/_components/dynamic-request-form.tsx`

- Import `useAuth`: `import { useAuth } from '@/hooks/use-auth';`
- `buildDynamicSchema`: add `case 'passenger_type':` → `z.string().optional()`.
- Add a module-scope `PassengerTypeFieldControl`:

```tsx
function PassengerTypeFieldControl({
  field,
  value,
  onChange,
}: {
  field: ServiceTypeField;
  value: string;
  onChange: (v: string) => void;
}) {
  const { profile } = useAuth() as any;
  const detected = profile?.learner_id ? 'learner' : 'staff';
  useEffect(() => {
    if (value !== detected) onChange(detected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detected]);
  return (
    <div className="space-y-2">
      <Label>{field.field_label}</Label>
      <div>
        <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-sm font-medium capitalize">
          {detected === 'learner' ? 'Learner' : 'Staff'}
        </span>
      </div>
      {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
    </div>
  );
}
```

- Add the render case before `default:`:

```tsx
      case 'passenger_type':
        return (
          <PassengerTypeFieldControl
            key={field.field_key}
            field={field}
            value={(allValues[field.field_key] as string) || ''}
            onChange={(v) => setValue(field.field_key, v)}
          />
        );
```

`useEffect`, `Label`, `setValue`, `allValues` already exist in the file. Verify the badge is read-only (no input), hook only called inside the sub-component. Commit `feat(service-requests): read-only auto-detected Passenger Type field`.

---

## Task 7 (subagent, code): seed parity

**File:** `lib/services/service-requests/transport-seed.ts`

- Prepend a `passenger_type` field to the `fields` array (display_order 0; bump bus_route→1 keeps; boarding_stop→2 keeps — or set passenger_type=0, leave others):
```typescript
    {
      service_type_id: serviceType.id,
      field_key: 'passenger_type',
      field_label: 'Passenger Type',
      field_type: 'passenger_type',
      is_required: false,
      display_order: 0,
      help_text: 'Detected automatically from your account',
    },
```
- Broaden `allowed_roles` to `['super_admin','student','staff','faculty','hod','principal','office_assistant']` (representative static set for fresh installs; the live DB uses the computed full set from Task 3).

Verify; commit `feat(service-requests): seed passenger_type field + staff-inclusive roles`.

---

## Task 8 (controller): verification
- Lint the 3 touched code files (expect 0 errors).
- Rolled-back transaction tests (per `SET LOCAL request.jwt.claims` impersonation):
  - **Staff path:** insert a `fulfilled` transport request for a real staff member's `profile_id`, call RPC as super-admin → assert that `staff` row gets `bus_required=true` + route/stop. ROLLBACK.
  - **Learner path:** unchanged — re-confirm a learner request still updates `learners_profiles`. ROLLBACK.
  - **Authz:** unauthorized caller still rejected `42501`.
- Browser handoff: submit as a staff user (badge shows "Staff") → approve as transport head → confirm `staff.bus_required=true`. TMS reads `staff WHERE bus_required=true`.

## Self-review
- Spec coverage: §1→T1, §2→T2+T5+T6, §3→T4, §4→T3, §5→T7. ✅
- Ordering: enum (T2) before field insert (T3); union (T5) before form render (T6). ✅
- No placeholders; RPC name unchanged so `handleApproved` needs no edit. ✅
