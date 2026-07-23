# Bus Pass Request — Remove Approval — Implementation Plan

> Execute subagent-driven. No test suite — verify via lint + reading + rolled-back SQL tests. DB migrations applied by controller; the service-layer code task goes to an implementer subagent.

**Goal:** Submitting a Bus Pass Request auto-finalizes (status `fulfilled`) and syncs the profile, with no Transport Head approval.

**Spec:** `docs/superpowers/specs/2026-06-02-bus-pass-no-approval-design.md`
**Branch:** `feat/bus-pass-no-approval` (created off `main`).

---

## N1 (controller, DB): remove the approval step

**File:** `supabase/migrations/20260602120000_bus_pass_remove_approval_step.sql`

```sql
-- Bus Pass Request becomes instant self-service: remove its approval step.
DELETE FROM service_request_approval_steps
WHERE service_type_id = (SELECT id FROM service_types WHERE slug = 'transport-request');
```

Apply via `apply_migration`. Verify 0 steps remain for the type. Commit.

---

## N2 (controller, DB): sync RPC self-service authz

**File:** `supabase/migrations/20260602120100_sync_bus_pass_self_service_authz.sql` + mirror into `supabase/setup/02_functions.sql`.

Full `CREATE OR REPLACE` (adds `v_type_id`/`v_has_steps`, the approver-OR-self authz, keeps slug gate + identity routing):

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
  v_type_id      uuid;
  v_has_steps    boolean;
  v_form         jsonb;
  v_slug         text;
  v_status       text;
  v_route_id     uuid;
  v_stop_id      uuid;
BEGIN
  SELECT sr.requester_id, sr.form_data, sr.service_type_id, st.slug, sr.status::text
    INTO v_requester_id, v_form, v_type_id, v_slug, v_status
    FROM service_requests sr
    JOIN service_types st ON st.id = sr.service_type_id
   WHERE sr.id = p_request_id;

  IF v_requester_id IS NULL THEN
    RAISE NOTICE 'sync_bus_pass: request % not found', p_request_id; RETURN;
  END IF;

  IF v_slug <> 'transport-request' THEN
    RAISE NOTICE 'sync_bus_pass: request % is not a transport request (slug=%)', p_request_id, v_slug; RETURN;
  END IF;

  v_has_steps := EXISTS (SELECT 1 FROM service_request_approval_steps WHERE service_type_id = v_type_id);

  -- Authorization. Approver path: a privileged approver acting on an approved/
  -- fulfilled request. Self path: the requester finalizing their OWN request for
  -- a type that has NO approval steps (instant self-service). The no-steps gate
  -- prevents a requester from bypassing approval on a review-required type, and
  -- auth.uid()=requester prevents acting on someone else's request.
  IF (public.is_super_admin() OR public.user_has_permission('service_requests.approve')) THEN
    IF v_status NOT IN ('approved', 'fulfilled') THEN
      RAISE EXCEPTION 'sync_bus_pass: request % is not approved (status=%)', p_request_id, v_status;
    END IF;
  ELSIF v_requester_id = auth.uid() AND NOT v_has_steps
        AND v_status IN ('submitted', 'approved', 'fulfilled') THEN
    NULL; -- self-service no-approval path
  ELSE
    RAISE EXCEPTION 'sync_bus_pass: not authorized' USING ERRCODE = '42501';
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

Apply; mirror into `supabase/setup/02_functions.sql` (replace current body). Commit migration + mirror.

---

## N3 (subagent, code): engine auto-finalize

**File:** `lib/services/service-requests/service-request-service.ts`

### Add a private helper (inside the class):
```typescript
  /**
   * Finalize a request that needs no approval: mark fulfilled and run any
   * post-approval side effects (transport profile sync). Used when a service
   * type has auto_fulfill_on_approval=true and zero approval steps.
   */
  private static async finalizeAutoApproval(
    requestId: string,
    serviceType: any,
    userId: string,
    fromStatus: ServiceRequestStatus
  ): Promise<void> {
    const supabase = await getSupabase();
    const now = new Date().toISOString();

    const updateData: Record<string, any> = {
      status: 'fulfilled',
      approved_at: now,
      fulfilled_at: now,
      current_approval_step: 0,
      updated_by: userId,
    };
    if (serviceType.validity_period_days) {
      const expires = new Date();
      expires.setDate(expires.getDate() + serviceType.validity_period_days);
      updateData.validity_expires_at = expires.toISOString();
    }

    await supabase.from('service_requests').update(updateData).eq('id', requestId);

    await ServiceRequestTimelineService.addStatusChange(
      requestId,
      userId,
      fromStatus,
      'fulfilled' as ServiceRequestStatus,
      'Auto-approved — no approval required'
    );

    if (serviceType.slug === 'transport-request') {
      const { error } = await supabase.rpc('sync_bus_pass_to_learner_profile', {
        p_request_id: requestId,
      });
      if (error) {
        console.error('[service-requests] Auto-approve bus-pass sync failed:', error);
      }
    }
  }
```

### In `createRequest`, replace the final `return request;` (the last line of the method, after the long NOTE comment) with:
```typescript
    const noApprovalSteps = (serviceType.approval_steps || []).length === 0;
    if (initialStatus === 'submitted' && noApprovalSteps && serviceType.auto_fulfill_on_approval) {
      await this.finalizeAutoApproval(request.id, serviceType, userId, 'submitted');
      return await this.getRequest(request.id);
    }

    return request;
```

### In `submitRequest`, after the `addStatusChange(... 'submitted', 'Request submitted for approval')` call and before `return data;`, insert:
```typescript
    const st = request.service_type;
    const noApprovalSteps = (st?.approval_steps || []).length === 0;
    if (noApprovalSteps && st?.auto_fulfill_on_approval) {
      await this.finalizeAutoApproval(id, st, userId, 'submitted');
      return await this.getRequest(id);
    }
```

Verify by reading (helper inside class; both call sites gated identically; `ServiceRequestStatus` already imported). Commit `feat(service-requests): auto-finalize submit for no-approval auto-fulfill types`.

---

## N4 (controller, code): seed — remove the approval step

**File:** `lib/services/service-requests/transport-seed.ts`

Remove the entire "Step 3: Insert approval step" block (the `supabase.from('service_request_approval_steps').insert({...})` call and its `if (stepError) { ... }` rollback handler). Leave the rest. Commit.

---

## N5 (controller): verification
- Lint `service-request-service.ts` + `transport-seed.ts` (0 errors).
- Verify N1: `SELECT count(*) FROM service_request_approval_steps WHERE service_type_id=(SELECT id FROM service_types WHERE slug='transport-request')` → 0.
- Rolled-back RPC tests (`SET LOCAL request.jwt.claims`):
  - **Self path:** insert a `submitted` transport request for a real student, call RPC AS THAT STUDENT → `learners_profiles` updated. ROLLBACK.
  - **Bypass guard:** temporarily simulate a stepped type (or use a type that has steps) and call RPC as its requester → `42501`. (If no convenient stepped transport request, assert logically; the no-steps gate is unit-evident.)
  - **Approver path:** super-admin on a fulfilled request still works.
- Browser handoff: submit as a normal learner/staff → request is `Fulfilled` immediately, profile flips, nothing in the approvals inbox.

## Self-review
- Spec coverage: §1→N1, §2→N3, §3→N2, §4→N4. ✅
- Ordering: RPC (N2) before/independent of engine (N3); both before verification. ✅
- The engine calls the RPC as the submitter → relies on N2's self path. Consistent. ✅
