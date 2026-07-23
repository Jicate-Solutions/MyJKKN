# Bus Pass Request — Remove Approval (Instant Self-Service)

**Date:** 2026-06-02
**Status:** Design approved (proceeding to plan + implementation)
**Builds on:** Bus Pass Request (PR #1211) + staff support (merged `c9d07721e`).

## Goal
Submitting a Bus Pass Request immediately applies it — `status='fulfilled'` and the learner/staff profile synced — with **no Transport Head review step**.

## Decisions (locked)
1. No approval step on `transport-request`; submit auto-finalizes + syncs.
2. Engine gate: a type with `auto_fulfill_on_approval=true` AND **zero** approval steps auto-finalizes on submit. (Targets `transport-request` only today; `audit_finding` has `auto_fulfill_on_approval=false`, so it's untouched.)
3. Sync RPC gains a self-service authorization path so the submitter can trigger their own sync when the type has no approval steps.

## Design

### 1. Remove the approval step (migration)
`DELETE FROM service_request_approval_steps` for the `transport-request` type. The `transport_head` role stays (now unused; removing it could orphan assigned users — out of scope).

### 2. Engine auto-finalize (`lib/services/service-requests/service-request-service.ts`)
Add a private helper `finalizeAutoApproval(requestId, serviceType, userId, fromStatus)`:
- `UPDATE service_requests SET status='fulfilled', approved_at=now, fulfilled_at=now, current_approval_step=0, validity_expires_at=<if validity_period_days>, updated_by=userId`.
- Timeline `addStatusChange(... fromStatus -> 'fulfilled', 'Auto-approved — no approval required')`.
- If `serviceType.slug==='transport-request'` → `supabase.rpc('sync_bus_pass_to_learner_profile', { p_request_id })`, log on error (don't throw).

Call it when `auto_fulfill_on_approval===true && approval_steps.length===0`:
- `createRequest`: after insert + initial timeline, when `initialStatus==='submitted'`; return `getRequest(id)` so the caller sees `fulfilled`.
- `submitRequest`: after the update to `submitted`, same gate (uses `request.service_type.approval_steps`).

### 3. Sync RPC self-service authz (`sync_bus_pass_to_learner_profile`, CREATE OR REPLACE + mirror)
Capture `service_type_id` in the initial SELECT; compute `v_has_steps = EXISTS(SELECT 1 FROM service_request_approval_steps WHERE service_type_id=v_type_id)`. Replace the single authz check with:
- **Approver path:** `is_super_admin() OR user_has_permission('service_requests.approve')` → still requires `status IN ('approved','fulfilled')`.
- **Self path (new):** `v_requester_id = auth.uid()` AND `NOT v_has_steps` AND `v_status IN ('submitted','approved','fulfilled')` → allowed.
- else → `RAISE EXCEPTION 'sync_bus_pass: not authorized' USING ERRCODE='42501'`.

The rest (slug gate, route/stop validation, learner/staff identity routing) is unchanged. The self path is gated on the type having no steps, so it cannot bypass approval on a review-required type; and it's the caller's own request (`auth.uid()=requester_id`), so it's not an IDOR.

### 4. Seed + mirror
`transport-seed.ts`: remove the `service_request_approval_steps` insert (fresh installs get no step). Mirror the RPC into `supabase/setup/02_functions.sql`.

## Consequence (by design)
Any eligible learner/staff instantly sets their own `bus_required`/route/stop with no review; re-submitting changes it. `max_active_requests=1` doesn't block re-submission because `fulfilled` isn't in the active-status set.

## Out of scope
- Removing the `transport_head` role/grants (leave; unused).
- Approval for any other type.

## Verification
Rolled-back transaction tests:
- **Self path:** a student submitting their OWN transport request (no steps), calling the RPC as that student → `learners_profiles` updated.
- **Bypass guard:** the same student calling the RPC on a request whose type HAS steps → `42501`.
- **Approver/staff paths:** still work.
Plus lint touched files; browser: submit as a normal user → request shows `Fulfilled` immediately and profile flips, no approvals inbox entry.
