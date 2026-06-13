# Bus Pass Request → Transport Head Approval → Learner Profile Sync

**Date:** 2026-06-02
**Status:** Design approved (awaiting implementation-plan confirmation)
**Author:** Boobalan (with Claude)

---

## 1. Problem / Goal

Students need a way to request a college bus. The institution needs to know **who requires a bus** (and on which route/stop) so the TMS application can plan and operate routes.

We already added the destination columns to `learners_profiles` (`bus_required`, `transport_route_id`, `transport_stop_id`, `transport_fee`) and built the TMS tables (`tms_route`, `tms_route_stop`, `tms_route_possible_stop`). We also already have a generic, config-driven **service-request engine** and a live **"Bus Pass Request"** service type (`slug = transport-request`).

**Goal:** A student submits a Bus Pass Request choosing **only Bus Route + Boarding Stop** (sourced live from the TMS tables) → the request goes to **Transport Head Review** → on approval the system writes `bus_required = true`, `transport_route_id`, `transport_stop_id` onto the student's `learners_profiles` row → the TMS app reads `learners_profiles WHERE bus_required = true` from the same Supabase database.

## 2. What already exists (do not rebuild)

Generic service-request engine:

| Table | Role |
|---|---|
| `service_types` | Configurable request templates (slug, `allowed_roles`, `approval_workflow_type`, `auto_fulfill_on_approval`, `validity_period_days`, scope) |
| `service_type_fields` | Per-type dynamic form fields (`field_type`: text/select/date/number/boolean/textarea/file; `field_options` JSON) |
| `service_request_approval_steps` | Ordered approval steps (`approver_role` **or** `approver_user_ids[]`) |
| `service_requests` | Submitted requests; `form_data` JSONB keyed by `field_key`; `status`, `current_approval_step` |
| `service_request_approvals` | Action log |
| `service_request_timeline` | Timeline entries |

- **Engine:** `ServiceRequestApprovalService.processApproval()` → `handleApproved()` advances/completes the workflow. On final approval, with `auto_fulfill_on_approval = true`, status goes straight to `fulfilled`. There is already a `slug === 'transport-request'` special-case that fires `notifyTmsWebhook()` (an external HMAC webhook).
- **Form:** `DynamicRequestForm` renders fields by `field_type`. It already supports a **static** cascade via a `||` convention in `field_options` values.
- **Approvals inbox:** purely role-driven — `getPendingApprovalsForUser(profile.role, …)` matches `profiles.role` to a step's `approver_role`; non-cross-institutional users are auto-scoped to their own `institution_id`. The approvals page/route has **no** `PermissionGuard`.
- **Link:** `profiles.learner_id → learners_profiles.id`.

Current state of the `transport-request` type (live, `is_system_default = true`, name "Bus Pass Request"): **7 fields** (`bus_route`, `boarding_stop`, `pass_type`, `pass_validity`, `service_start_date`, `contact_number`, `special_requirements`), **1 step** ("Transport Head Review", `approver_role = administrator`), **3 throwaway test requests**.

## 3. Core problems this design fixes

1. **Route/Stop fields store static slug strings**, not real `tms_route.id` / `tms_route_stop.id` UUIDs — so there is no clean way to write UUIDs into `learners_profiles` on approval. **Fix:** live, DB-backed lookup fields storing real UUIDs.
2. **No write-back to `learners_profiles` on approval** (only the external webhook). **Fix:** a `SECURITY DEFINER` RPC invoked from the approval engine.
3. **Approver is the generic `administrator` role.** **Fix:** a dedicated `transport_head` role.

## 4. Decisions (locked)

1. **Route/Stop source = live from TMS tables**, storing real UUIDs, route→stop cascade.
2. **Approver = new `transport_head` role**, granted per institution via Role Management.
3. **On approval, write Route + Stop only** — `bus_required = true`, `transport_route_id`, `transport_stop_id`. **No** `transport_fee` copy (billing owns fee).
4. **TMS integration = same DB.** TMS reads `learners_profiles WHERE bus_required = true`. The external webhook is no longer required (left in place, no-ops when `TMS_WEBHOOK_URL` unset).
5. **Form fields = Route + Stop only** (drop the other 5).
6. **`allowed_roles` narrowed to `student` (+ `super_admin` for testing).** The sync target (`learners_profiles`) is student-only; staff/faculty transport is out of scope.

## 5. Design — layer by layer

### 5.1 Field-type extension — `types/service-request.ts`
- Extend `ServiceFieldType` union with `'tms_route'` and `'tms_route_stop'`.
- Extend the zod `field_type` enum in `serviceTypeFieldSchema` to match.
- No other type changes (form_data still stores a string UUID per key).

### 5.2 TMS lookup hook — `hooks/service-requests/use-tms-lookups.ts` (new)
- `useTmsRoutes()` → active `tms_route` rows (`id`, `route_number`, `route_name`), ordered by `route_number`.
- `useTmsRouteStops(routeId)` → `tms_route_stop` rows for a route (`id`, `stop_name`, `sequence_order`), ordered by `sequence_order`; disabled/empty when `routeId` is falsy.
- React Query keys added to `lib/query/query-keys.ts`. Client Supabase reads (RLS-gated).

### 5.3 Dynamic form — `app/(routes)/service-requests/_components/dynamic-request-form.tsx`
- `buildDynamicSchema`: `tms_route` and `tms_route_stop` → required UUID string (or optional when `is_required` false).
- `renderField`: two new cases.
  - `tms_route`: Select populated by `useTmsRoutes()`, option label `"{route_number} — {route_name}"`, value = `route.id`.
  - `tms_route_stop`: Select populated by `useTmsRouteStops(selectedRouteId)`, **disabled until a route is chosen**, value = `stop.id`. `selectedRouteId` = current value of the sibling `tms_route` field.
- Cascade reset: when the `tms_route` value changes, clear the `tms_route_stop` field (extend the existing mount-aware reset effect to also watch `tms_route` fields, not only static-`||` selects).

### 5.4 RLS read access — migration
- Ensure authenticated users can `SELECT` active `tms_route` and their `tms_route_stop` rows (so students see options). Verify existing TMS policies first; add `auth.uid() IS NOT NULL` SELECT policies only if missing. (Pattern: "lookup-table read gated behind manage-perm → silent empty UIs".)

### 5.5 Re-seed the type's fields — migration + update `lib/services/service-requests/transport-seed.ts`
- Replace the 7 fields with **2 required fields**:
  - `bus_route` — label "Bus Route", `field_type = tms_route`, `is_required = true`, `display_order = 1`.
  - `boarding_stop` — label "Boarding Stop", `field_type = tms_route_stop`, `is_required = true`, `display_order = 2`.
- Update `transport-seed.ts` so a fresh seed matches (idempotent guard already present).
- Narrow `service_types.allowed_roles` for this type to `['super_admin','student']`.

### 5.6 `transport_head` role + RBAC — migration
- Insert `transport_head` into `custom_roles` (institution-scoped, not `scope='all'`).
- Grant it the service-request keys it needs for menu/detail visibility and approval: `service_requests.approve`, `service_requests.view_all` (and `service_requests.view_own` if the menu/detail requires it) via `permissions = permissions || jsonb_build_object(...)`. (Pattern: "reserved perm keys still need role grants".)
- Update the approval step: `approver_role` `administrator → transport_head`.
- Transport heads are then assigned to the role per institution through Role Management (operational step, not code).

### 5.7 On-approval side-effect — RPC + `service-request-approval-service.ts`
- New `SECURITY DEFINER` RPC `sync_bus_pass_to_learner_profile(p_request_id uuid)`:
  1. Load the request (`requester_id`, `form_data`, `service_type` slug).
  2. Resolve `requester_id → profiles.learner_id`. If null (non-student), **no-op** with a notice (`RAISE NOTICE`) and return — graceful for any non-student requester.
  3. Read `form_data->>'bus_route'` and `form_data->>'boarding_stop'`; validate both are UUIDs that exist in `tms_route` / `tms_route_stop` (and the stop belongs to the route). On mismatch, raise a clear exception (won't happen for new UUID-based submissions; protects against stale string data).
  4. `UPDATE learners_profiles SET bus_required = true, transport_route_id = <route>, transport_stop_id = <stop>, updated_at = now() WHERE id = <learner_id>`.
- `SECURITY DEFINER` because the approver acts under RLS and cannot UPDATE arbitrary learner rows.
- Call it from `handleApproved()` in the `isLastStep` branch, gated on `request.service_type?.slug === 'transport-request'`, right beside the existing webhook call. Errors are logged but do not block the approval (the status change already committed); failures surface in logs/timeline.
- **Idempotency / re-request:** because `max_active_requests = 1` and `auto_fulfill_on_approval = true`, a learner changing routes later just submits again; the RPC overwrites route/stop. Natural and safe.

### 5.8 Cleanup
- Cancel/delete the 3 existing test requests (`SR-TRAN-*`) so the switch to UUID-valued fields is clean (they hold old string values / junk).

## 6. End-to-end flow

```
Student → /service-requests/new → "Bus Pass Request"
  → DynamicRequestForm: Bus Route (live) → Boarding Stop (live cascade)
  → form_data = { bus_route: <tms_route.id>, boarding_stop: <tms_route_stop.id> }
  → service_requests: status=submitted, current_approval_step=1
Transport Head (role=transport_head) → /service-requests/approvals → Approve
  → processApproval → handleApproved (last step) → status=fulfilled
      → sync_bus_pass_to_learner_profile(request_id)   [SECURITY DEFINER]
          → learners_profiles: bus_required=true, transport_route_id, transport_stop_id
TMS app → SELECT ... FROM learners_profiles WHERE bus_required = true
```

## 7. Files touched (anticipated)

- `types/service-request.ts` — field-type union + zod enum.
- `hooks/service-requests/use-tms-lookups.ts` — **new**.
- `lib/query/query-keys.ts` — TMS lookup keys.
- `app/(routes)/service-requests/_components/dynamic-request-form.tsx` — render + schema + cascade.
- `lib/services/service-requests/service-request-approval-service.ts` — RPC call in `handleApproved`.
- `lib/services/service-requests/transport-seed.ts` — fields + allowed_roles.
- `supabase/migrations/` — (a) TMS read RLS (if needed), (b) re-seed fields + allowed_roles, (c) `transport_head` role + grants + approval-step approver, (d) `sync_bus_pass_to_learner_profile` RPC. Mirror into `supabase/setup/` reference files.
- `app/(routes)/service-requests/_components/field-builder.tsx` — **optional**, only if admins must pick the new field types in the type-builder UI (the type is seeded, so deferred unless requested).

## 8. Out of scope

- Staff/faculty transport (no `learners_profiles` row) — separate table + follow-up.
- Copying `tms_route.fare` → `learners_profiles.transport_fee` (billing owns this).
- In-app "bus-required learners" report (TMS reads the DB directly).
- External TMS webhook changes (left as-is; harmless when unconfigured).

## 9. Verification (no automated test suite in this repo)

- `mcp__ide__getDiagnostics` clean on every touched file.
- Browser, **student** account: submit a Bus Pass Request; confirm Route dropdown is live, Stop cascades and is disabled until a route is picked; confirm `form_data` holds real UUIDs.
- Browser, **transport_head** (non-super-admin): confirm the request appears in the Approvals inbox scoped to their institution; approve it.
- SQL: confirm the student's `learners_profiles` row now has `bus_required = true` + correct `transport_route_id` / `transport_stop_id`.
- SQL: `SELECT ... WHERE bus_required = true` returns the student (TMS read path).
- `npm run check:menus` if permission keys/menus changed.

## 10. Key risks / notes

- **Stale data:** any request submitted before the field-type switch keeps old string values; the RPC validates UUIDs and raises (not silently wrong). Mitigated by cleaning the 3 test rows.
- **RLS:** verify `tms_route` / `tms_route_stop` are readable by students before shipping the form, or the dropdowns render empty.
- **Permission grants:** `transport_head` must hold the service-request keys or the sidebar entry/detail view won't show (inbox query itself is role-based and works regardless).
- **`types/supabase.ts`:** no new tables added, so no regeneration needed; the new RPC may be referenced via `.rpc()` (untyped cast acceptable, consistent with existing service code).
