# Procurement Category Approval Chains — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.
> Related skills: @supabase-postgres-best-practices (Task 1–3), @myjkkn-page-development (Task 4–9), @jkkn-terminologies (labels).

**Goal:** A purchase request goes, once, through the approval steps set for its category (1–N steps such as HOD → Principal → CAO → Chairperson) on a new Approval Flows page, instead of "anyone with `procurement.request_approve`".

**Architecture:** Super Admin keeps a list of purchase **categories** and, for each, an ordered list of **steps** (HOD of the request's department / a role, in the request's college or anywhere / a named person). When a request is submitted, a DB trigger **copies the steps onto the request and resolves every step to real people at that moment** — if any step has nobody, the submit fails with a message naming the step. Each step is approved through one `SECURITY DEFINER` RPC that checks "is it your turn"; the last approval flips the request to `approved`. Requests without a category keep today's rule untouched.

**Tech Stack:** Supabase Postgres (plpgsql, RLS), Next.js 15 App Router, TanStack Query, shadcn/ui, Vitest.

---

## 0. Decisions this plan implements (user, 2026-10-06)

| Decision | Value |
|---|---|
| Where the chain runs | **Once**, when the request is raised (between `submitted` and `approved`). No before/after-quotation split. |
| What decides the chain | The request's **category** only. No amount bands. |
| Category set on | The **whole request** (one category per request). |
| Steps per category | 1 to N (cap 10), set on the **Approval Flows** page. Roles vary per category; some chains end at the Chairperson. |
| HOD step | Requester picks **"For which department?"**; HOD comes from `departments.head_of_department_id` (set on `/organizations/departments/hod-assignment`). Missing HOD **blocks submit** with a clear message. |
| Post-quotation Super Admin approval (`pending_award_approval`) | **Unchanged** by this plan — not in scope. |

**Defaults chosen here (change before building if wrong):**
1. **Requester is a step's approver** (an HOD raising for own department) → that step is recorded as *skipped — requester*. If that leaves no step, one "Super Admin" step is added so nobody approves their own request (matches the live two-sign-off guard, `20271005090000`).
2. **Super Admin may approve any step on behalf** of the assigned person; the row records `on_behalf = true`.
3. **Send back / reject at any step** ends the round. Resubmitting starts a **new round from step 1** (the old round stays as history).
4. **Editing a category's steps** never changes requests already submitted (they carry their own copy).
5. **Role steps**: any one active holder can approve (e.g. 2 Managing Directors → either). `same_college = true` limits holders to the request's college (Principal); `false` = anywhere (CAO).

## 1. Facts the design rests on (verified live 2026-10-06)

- Approval #1 today: `fn_procurement_guard_approval()` (latest body `supabase/migrations/20271006100000_procurement_request_send_back.sql:29`) lets anyone with `procurement.request_approve` (only `procurement_manager`, 2 users) or a Super Admin flip `submitted → approved|rejected|returned`. Status changes are plain client UPDATEs via `ProcurementPurchaseRequestService.transition()` (`lib/services/procurement/purchase-request-service.ts`).
- Submit notifications go to every `request_approve` holder: `fn_procurement_notify_request_submitted()` (same migration, §3).
- RLS on `procurement_purchase_requests`: `ppr_institution_scope` (ALL, `role_has_institution_access`) + `ppr_requester_read`. Items mirror it. **A Principal/HOD/CAO approver without institution access cannot read the request** → new approver read policies needed.
- `app/(routes)/procurement/layout.tsx` blocks everyone without `procurement.view` → approvers need a way in.
- Roles exist: `hod` (113 holders, own scope), `principal` (12, one per college), `cao` (1), `ceo` (1), `managing_director` (2), `accounts` (9). **No Chairperson role** → use a named-person step.
- HOD data: `departments.head_of_department_id` is set only for Pharmacy (7/11 depts). 0 elsewhere. **Phase 0 data work is mandatory.**
- 29 of 44 requests are raised for another college than the requester's → HOD/Principal must resolve from the **request's** college/department, never the requester's profile.
- Leave/OD (`leave_onduty_approval_flows`) uses the same idea (category → ordered role steps) but builds approver rows lazily and strands requests (54/60 academic). This plan resolves **all** steps at submit to avoid that.
- Last applied migration: `20271006100100`. Migration version = text before the FIRST underscore; must be unique.

## 2. Data model

```
procurement_categories                 procurement_category_approval_steps
  id, name, description,                 id, category_id → categories (cascade),
  sort_order, is_active, ...             step_order 1..10, label,
                                          approver_kind 'hod'|'role'|'user',
                                          role_key, same_college, user_id
procurement_purchase_requests (+ category_id, + department_id)
procurement_request_approvals          ← the per-request copy, written ONLY by definer functions
  id, request_id, round, step_order, label, approver_kind,
  approver_ids uuid[], status waiting|pending|approved|skipped|returned|rejected|cancelled,
  acted_by, acted_at, on_behalf, remarks
```

Categories are **group-wide** (no `institution_id`), a deliberate exception to the multi-tenant rule: one chain serves every college, and the college-specific people (HOD, Principal) are resolved per request.

---

## Phase 0 — Data (no code, do first)

### Task 0: HODs, Chairperson, chains

**Step 1:** On `/organizations/departments/hod-assignment`, set the HOD for every department that will raise purchases. Verify:

```sql
SELECT i.name, count(*) depts, count(d.head_of_department_id) with_hod
FROM departments d JOIN institutions i ON i.id = d.institution_id
WHERE d.is_active GROUP BY i.name ORDER BY i.name;
```
Expected: `with_hod = depts` for every college that buys.

**Step 2:** Get from the user: the Chairperson's MyJKKN account (email), and for each category the ordered steps. Record in the PR description.

---

## Phase 1 — Database

### Task 1: Migration — tables, columns, RLS

**Files:**
- Create: `supabase/migrations/20271006110000_procurement_category_approval_chains.sql`

**Step 1: Write the tables**

```sql
-- Migration: 20271006110000_procurement_category_approval_chains
-- Purpose:   A purchase request is approved, once, by the steps set for its CATEGORY
--            (HOD → Principal → CAO → Chairperson …) instead of "anyone holding
--            procurement.request_approve". Requests with no category keep the old rule.
--            Plan: docs/plans/2026-10-06-procurement-category-approval-chains.md

-- 1. Categories (group-wide; the chain is the same for every college) -------------
CREATE TABLE IF NOT EXISTS public.procurement_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(trim(name)) > 0),
  description text,
  sort_order  int  NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_procurement_categories_name
  ON public.procurement_categories (lower(trim(name)));
CREATE TRIGGER trg_procurement_categories_updated_at
  BEFORE UPDATE ON public.procurement_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
COMMENT ON TABLE public.procurement_categories IS
  'Purchase categories. Each has an ordered approval chain (procurement_category_approval_steps).';

-- 2. The chain of each category ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procurement_category_approval_steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   uuid NOT NULL REFERENCES public.procurement_categories(id) ON DELETE CASCADE,
  step_order    int  NOT NULL CHECK (step_order BETWEEN 1 AND 10),
  label         text NOT NULL CHECK (length(trim(label)) > 0),
  approver_kind text NOT NULL CHECK (approver_kind IN ('hod', 'role', 'user')),
  role_key      text,
  same_college  boolean NOT NULL DEFAULT true,
  user_id       uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, step_order),
  CHECK ((approver_kind = 'role') = (role_key IS NOT NULL)),
  CHECK ((approver_kind = 'user') = (user_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_pcas_category ON public.procurement_category_approval_steps (category_id);

-- 3. Request: which category, which department ---------------------------------------
ALTER TABLE public.procurement_purchase_requests
  ADD COLUMN IF NOT EXISTS category_id   uuid REFERENCES public.procurement_categories(id),
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id);
CREATE INDEX IF NOT EXISTS idx_ppr_category ON public.procurement_purchase_requests (category_id);
COMMENT ON COLUMN public.procurement_purchase_requests.category_id IS
  'Decides the approval chain. NULL = legacy rule (procurement.request_approve).';
COMMENT ON COLUMN public.procurement_purchase_requests.department_id IS
  'The department the purchase is FOR — its HOD approves a hod step. Not the requester''s.';

-- 4. Per-request copy of the chain (written only by the definer functions below) ------
CREATE TABLE IF NOT EXISTS public.procurement_request_approvals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES public.procurement_purchase_requests(id) ON DELETE CASCADE,
  round         int  NOT NULL,
  step_order    int  NOT NULL,
  label         text NOT NULL,
  approver_kind text NOT NULL,
  approver_ids  uuid[] NOT NULL,
  status        text NOT NULL DEFAULT 'waiting'
                CHECK (status IN ('waiting','pending','approved','skipped','returned','rejected','cancelled')),
  acted_by      uuid REFERENCES public.profiles(id),
  acted_at      timestamptz,
  on_behalf     boolean NOT NULL DEFAULT false,
  remarks       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, round, step_order),
  CHECK (status IN ('skipped','cancelled') OR cardinality(approver_ids) > 0)
);
CREATE INDEX IF NOT EXISTS idx_pra_request ON public.procurement_request_approvals (request_id, round);
CREATE INDEX IF NOT EXISTS idx_pra_pending_approvers
  ON public.procurement_request_approvals USING gin (approver_ids) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS uq_pra_one_pending
  ON public.procurement_request_approvals (request_id) WHERE status = 'pending';
COMMENT ON TABLE public.procurement_request_approvals IS
  'Approval steps copied onto a request at submit, with the people resolved then. Never edited by clients.';
```

**Step 2: RLS** (append to the same file)

```sql
-- Helper used by policies — SECURITY DEFINER so request ↔ approvals policies never recurse.
CREATE OR REPLACE FUNCTION public.procurement_is_request_approver(p_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM procurement_request_approvals a
    WHERE a.request_id = p_request_id AND (SELECT auth.uid()) = ANY (a.approver_ids)
  );
$$;

ALTER TABLE public.procurement_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_category_approval_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_request_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY pc_read ON public.procurement_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY pc_manage ON public.procurement_categories FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY pcas_read ON public.procurement_category_approval_steps FOR SELECT TO authenticated USING (true);
-- Steps are written only through procurement_save_category_steps() (validates role keys).

CREATE POLICY pra_read ON public.procurement_request_approvals FOR SELECT TO authenticated USING (
  (SELECT auth.uid()) = ANY (approver_ids)
  OR EXISTS (SELECT 1 FROM procurement_purchase_requests r
             WHERE r.id = request_id
               AND (r.requested_by = (SELECT auth.uid()) OR role_has_institution_access(r.institution_id)))
);

-- Approvers outside the college's institution scope (CAO, Chairperson…) still read what they approve.
CREATE POLICY ppr_approver_read ON public.procurement_purchase_requests FOR SELECT TO authenticated
  USING (public.procurement_is_request_approver(id));
CREATE POLICY ppri_approver_read ON public.procurement_purchase_request_items FOR SELECT TO authenticated
  USING (public.procurement_is_request_approver(request_id));

-- 4 starter categories (steps are set on the Approval Flows page).
INSERT INTO public.procurement_categories (name, sort_order) VALUES
  ('Lab chemicals & glassware', 1), ('IT & electronics', 2),
  ('Stationery & office', 3), ('Furniture & maintenance', 4)
ON CONFLICT DO NOTHING;
```

**Step 3: Commit**

```bash
git add supabase/migrations/20271006110000_procurement_category_approval_chains.sql
git commit -m "feat(procurement): category approval chain tables and RLS"
```

### Task 2: Migration — resolve, build, act (functions + triggers)

**Files:**
- Modify: `supabase/migrations/20271006110000_procurement_category_approval_chains.sql` (append)

**Step 1: Resolver — one step → the people who can approve it**

```sql
CREATE OR REPLACE FUNCTION public.procurement_resolve_step(
  p_kind text, p_role_key text, p_same_college boolean, p_user_id uuid,
  p_institution_id uuid, p_department_id uuid
) RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(DISTINCT p.id), '{}')
  FROM profiles p
  WHERE coalesce(p.is_active, true) AND NOT coalesce(p.is_login_disabled, false)
    AND CASE p_kind
      WHEN 'user' THEN p.id = p_user_id
      WHEN 'hod'  THEN p.id = (SELECT d.head_of_department_id FROM departments d WHERE d.id = p_department_id)
      WHEN 'role' THEN
        (EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
                 WHERE ur.user_id = p.id AND cr.role_key = p_role_key AND coalesce(cr.is_active, true))
         OR p.role = p_role_key)
        AND (NOT p_same_college OR p.institution_id = p_institution_id)
      ELSE false
    END;
$$;
```

**Step 2: Build trigger — copy + resolve at submit; fail loudly if anyone is missing**

```sql
CREATE OR REPLACE FUNCTION public.fn_procurement_build_approval_chain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round   int;
  v_step    record;
  v_ids     uuid[];
  v_status  text;
  v_any     boolean := false;
  v_pending boolean := false;
  v_dept    text;
BEGIN
  -- A submitted request leaving 'submitted' some other way: close its open steps.
  IF TG_OP = 'UPDATE' AND OLD.status = 'submitted' AND NEW.status IN ('cancelled') THEN
    UPDATE procurement_request_approvals SET status = 'cancelled'
     WHERE request_id = NEW.id AND status IN ('waiting', 'pending');
    RETURN NULL;
  END IF;

  IF NEW.status <> 'submitted' OR NEW.category_id IS NULL
     OR (TG_OP = 'UPDATE' AND OLD.status NOT IN ('draft', 'returned')) THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(max(round), 0) + 1 INTO v_round
  FROM procurement_request_approvals WHERE request_id = NEW.id;

  FOR v_step IN
    SELECT * FROM procurement_category_approval_steps
    WHERE category_id = NEW.category_id ORDER BY step_order
  LOOP
    v_any := true;
    IF v_step.approver_kind = 'hod' AND NEW.department_id IS NULL THEN
      RAISE EXCEPTION 'Choose the department this request is for — step % (%) is its HOD.',
        v_step.step_order, v_step.label USING ERRCODE = '23502';
    END IF;

    v_ids := procurement_resolve_step(v_step.approver_kind, v_step.role_key, v_step.same_college,
                                      v_step.user_id, NEW.institution_id, NEW.department_id);
    IF cardinality(v_ids) = 0 THEN
      SELECT coalesce(display_name, department_name) INTO v_dept FROM departments WHERE id = NEW.department_id;
      RAISE EXCEPTION '%', CASE v_step.approver_kind
        WHEN 'hod'  THEN format('No HOD is set for %s — ask the admin to set it, then submit again.', coalesce(v_dept, 'this department'))
        WHEN 'role' THEN format('Nobody holds the "%s" role%s — step %s (%s) has no approver.',
                                v_step.role_key, CASE WHEN v_step.same_college THEN ' in this college' ELSE '' END,
                                v_step.step_order, v_step.label)
        ELSE format('The approver for step %s (%s) is inactive.', v_step.step_order, v_step.label)
      END USING ERRCODE = 'P0001';
    END IF;

    -- Nobody approves their own request.
    v_ids := array_remove(v_ids, NEW.requested_by);
    v_status := CASE WHEN cardinality(v_ids) = 0 THEN 'skipped'
                     WHEN NOT v_pending THEN 'pending' ELSE 'waiting' END;
    IF v_status = 'pending' THEN v_pending := true; END IF;

    INSERT INTO procurement_request_approvals
      (request_id, round, step_order, label, approver_kind, approver_ids, status, remarks)
    VALUES (NEW.id, v_round, v_step.step_order, v_step.label, v_step.approver_kind, v_ids, v_status,
            CASE WHEN v_status = 'skipped' THEN 'Skipped — the requester is this approver' END);
  END LOOP;

  IF NOT v_any THEN
    RAISE EXCEPTION 'No approval steps are set for this category yet — ask the Super Admin to set them.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Every step was the requester: a Super Admin signs instead.
  IF NOT v_pending THEN
    INSERT INTO procurement_request_approvals
      (request_id, round, step_order, label, approver_kind, approver_ids, status)
    SELECT NEW.id, v_round, 99, 'Super Admin', 'role', array_agg(p.id), 'pending'
    FROM profiles p
    WHERE (p.is_super_admin OR p.role = 'super_admin') AND coalesce(p.is_active, true)
      AND p.id <> NEW.requested_by;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_build_approval_chain ON public.procurement_purchase_requests;
CREATE TRIGGER trg_procurement_build_approval_chain
  AFTER INSERT OR UPDATE OF status ON public.procurement_purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_build_approval_chain();
```

**Step 3: Guard — chain requests change status only through the RPCs**

Re-create `fn_procurement_guard_approval()` from `20271006100000` **verbatim**, adding this block as the first statement inside `WHEN 'procurement_purchase_requests' THEN`:

```sql
      IF NEW.status IN ('approved', 'rejected', 'returned')
         AND NEW.category_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM procurement_request_approvals a WHERE a.request_id = NEW.id) THEN
        IF current_setting('procurement.chain_ok', true) IS DISTINCT FROM 'on' THEN
          RAISE EXCEPTION 'this request follows its category''s approval steps — use Approve / Send back on the request'
            USING ERRCODE = '42501';
        END IF;
        -- keep the existing returned/approved stamping below, but skip the permission check:
        v_key := NULL;
      ELSIF NEW.status IN ('approved', 'rejected', 'returned') THEN
        v_key  := 'procurement.request_approve';
        v_what := 'approve, reject or send back a purchase requisition';
      END IF;
```
(and delete the original `IF NEW.status IN ('approved','rejected','returned') THEN v_key := …` lines it replaces). The self-approval check stays — the RPC already refuses it, and the guard is the backstop.

**Step 4: Act RPCs**

```sql
-- Approve the current step. Optional quantity changes, as approveWithModifications did.
CREATE OR REPLACE FUNCTION public.procurement_approve_request_step(
  p_request_id uuid, p_remarks text DEFAULT NULL, p_item_changes jsonb DEFAULT '[]'::jsonb
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me    uuid := auth.uid();
  v_req   procurement_purchase_requests%ROWTYPE;
  v_step  procurement_request_approvals%ROWTYPE;
  v_next  procurement_request_approvals%ROWTYPE;
  v_mine  boolean;
  v_chg   jsonb;
  v_item  record;
  v_diff  text[] := '{}';
BEGIN
  SELECT * INTO v_req FROM procurement_purchase_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'submitted' THEN
    RAISE EXCEPTION 'This request is not waiting for approval (it is %).', coalesce(v_req.status, 'missing');
  END IF;
  SELECT * INTO v_step FROM procurement_request_approvals
   WHERE request_id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This request has no step waiting.'; END IF;

  v_mine := v_me = ANY (v_step.approver_ids);
  IF NOT v_mine AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'This step is waiting for %.', v_step.label USING ERRCODE = '42501';
  END IF;
  IF v_req.requested_by = v_me AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'You cannot approve your own request.' USING ERRCODE = '42501';
  END IF;

  FOR v_chg IN SELECT * FROM jsonb_array_elements(coalesce(p_item_changes, '[]'::jsonb)) LOOP
    IF (v_chg->>'quantity')::numeric <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than 0.'; END IF;
    SELECT id, item_name, unit_label, required_quantity INTO v_item
      FROM procurement_purchase_request_items
     WHERE id = (v_chg->>'item_id')::uuid AND request_id = p_request_id;
    IF FOUND AND v_item.required_quantity <> (v_chg->>'quantity')::numeric THEN
      UPDATE procurement_purchase_request_items
         SET original_quantity    = coalesce(original_quantity, required_quantity),
             required_quantity    = (v_chg->>'quantity')::numeric,
             quantity_modified_by = v_me, quantity_modified_at = now()
       WHERE id = v_item.id;
      v_diff := v_diff || format('%s %s%s → %s%s', v_item.item_name, v_item.required_quantity,
                                 coalesce(v_item.unit_label, ''), v_chg->>'quantity', coalesce(v_item.unit_label, ''));
    END IF;
  END LOOP;

  UPDATE procurement_request_approvals
     SET status = 'approved', acted_by = v_me, acted_at = now(), on_behalf = NOT v_mine,
         remarks = nullif(trim(coalesce(p_remarks, '')), '')
   WHERE id = v_step.id;

  IF cardinality(v_diff) > 0 THEN
    UPDATE procurement_purchase_requests
       SET notes = concat_ws(E'\n', notes, format('Qty changed by %s: %s%s', v_step.label,
                   array_to_string(v_diff, '; '), coalesce(' — ' || nullif(trim(p_remarks), ''), '')))
     WHERE id = p_request_id;
  END IF;

  SELECT * INTO v_next FROM procurement_request_approvals
   WHERE request_id = p_request_id AND round = v_step.round AND status = 'waiting'
   ORDER BY step_order LIMIT 1;
  IF FOUND THEN
    UPDATE procurement_request_approvals SET status = 'pending' WHERE id = v_next.id;
    PERFORM procurement_notify_step(p_request_id, v_next.id);
    RETURN 'next';
  END IF;

  PERFORM set_config('procurement.chain_ok', 'on', true);
  UPDATE procurement_purchase_requests
     SET status = 'approved', approved_by = v_me, approved_at = now(), rejection_reason = NULL, updated_at = now()
   WHERE id = p_request_id;
  PERFORM set_config('procurement.chain_ok', 'off', true);
  RETURN 'approved';
END;
$$;

-- Send back or reject at the current step; ends the round.
CREATE OR REPLACE FUNCTION public.procurement_decide_request_step(
  p_request_id uuid, p_decision text, p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_step procurement_request_approvals%ROWTYPE;
  v_why  text := nullif(trim(coalesce(p_reason, '')), '');
BEGIN
  IF p_decision NOT IN ('return', 'reject') THEN RAISE EXCEPTION 'Unknown decision %', p_decision; END IF;
  IF v_why IS NULL THEN RAISE EXCEPTION 'Say why.' USING ERRCODE = '23502'; END IF;
  PERFORM 1 FROM procurement_purchase_requests WHERE id = p_request_id AND status = 'submitted' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This request is not waiting for approval.'; END IF;
  SELECT * INTO v_step FROM procurement_request_approvals
   WHERE request_id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This request has no step waiting.'; END IF;
  IF NOT (v_me = ANY (v_step.approver_ids)) AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'This step is waiting for %.', v_step.label USING ERRCODE = '42501';
  END IF;

  UPDATE procurement_request_approvals
     SET status = CASE p_decision WHEN 'return' THEN 'returned' ELSE 'rejected' END,
         acted_by = v_me, acted_at = now(), on_behalf = NOT (v_me = ANY (approver_ids)), remarks = v_why
   WHERE id = v_step.id;
  UPDATE procurement_request_approvals SET status = 'cancelled'
   WHERE request_id = p_request_id AND round = v_step.round AND status = 'waiting';

  PERFORM set_config('procurement.chain_ok', 'on', true);
  IF p_decision = 'return' THEN
    UPDATE procurement_purchase_requests
       SET status = 'returned', returned_reason = v_step.label || ': ' || v_why,
           notes = concat_ws(E'\n', notes, 'Sent back by ' || v_step.label || ': ' || v_why), updated_at = now()
     WHERE id = p_request_id;
  ELSE
    UPDATE procurement_purchase_requests
       SET status = 'rejected', approved_by = v_me, approved_at = now(),
           rejection_reason = v_step.label || ': ' || v_why, updated_at = now()
     WHERE id = p_request_id;
  END IF;
  PERFORM set_config('procurement.chain_ok', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.procurement_approve_request_step(uuid, text, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.procurement_decide_request_step(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.procurement_approve_request_step(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_decide_request_step(uuid, text, text) TO authenticated;
```

**Step 5: Notifications**

- Create `procurement_notify_step(p_request_id uuid, p_step_id uuid)` (SECURITY DEFINER): copy the `notifications` + `user_notifications` INSERT from `fn_procurement_notify_request_submitted()` (`20271006100000` §3). Recipients = that step's `approver_ids`; title `'Purchase request ' || request_number || ' needs your approval (' || label || ')'`; url `'/procurement/requests/' || request_id`; idempotency key `'procurement_pr_step:' || p_step_id` (a new round has new step ids, so a resubmit notifies again).
- The **build trigger** notifies the first pending step: add before its final `RETURN NULL`:
  ```sql
  PERFORM procurement_notify_step(NEW.id, a.id)
     FROM procurement_request_approvals a
    WHERE a.request_id = NEW.id AND a.round = v_round AND a.status = 'pending';
  ```
- `fn_procurement_notify_request_submitted()`: add `IF NEW.category_id IS NOT NULL THEN RETURN NEW; END IF;` right after its first status check, so chain requests no longer message every `request_approve` holder. (Trigger order then doesn't matter.)
- `procurement_approve_request_step` already notifies the next step; on final approval and on send back / reject, notify `requested_by` the same way (key `'procurement_pr_decided:' || p_request_id || ':' || round`).

**Step 6: Settings RPCs**

```sql
-- Replace a category's whole chain in one go; validates every step.
CREATE OR REPLACE FUNCTION public.procurement_save_category_steps(p_category_id uuid, p_steps jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; i int := 0;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only a Super Admin can change approval flows.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_array_length(coalesce(p_steps, '[]')) NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'A flow needs 1 to 10 steps.';
  END IF;
  DELETE FROM procurement_category_approval_steps WHERE category_id = p_category_id;
  FOR v IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    i := i + 1;
    -- An unknown role must never mean "no restriction".
    IF v->>'approver_kind' = 'role' AND NOT EXISTS (
         SELECT 1 FROM custom_roles WHERE role_key = v->>'role_key' AND coalesce(is_active, true)) THEN
      RAISE EXCEPTION 'Step %: role "%" does not exist.', i, v->>'role_key';
    END IF;
    INSERT INTO procurement_category_approval_steps
      (category_id, step_order, label, approver_kind, role_key, same_college, user_id)
    VALUES (p_category_id, i, v->>'label', v->>'approver_kind',
            CASE WHEN v->>'approver_kind' = 'role' THEN v->>'role_key' END,
            coalesce((v->>'same_college')::boolean, true),
            CASE WHEN v->>'approver_kind' = 'user' THEN (v->>'user_id')::uuid END);
  END LOOP;
END;
$$;

-- What the requester will see before submitting: each step and who it resolves to.
CREATE OR REPLACE FUNCTION public.procurement_preview_chain(
  p_category_id uuid, p_institution_id uuid, p_department_id uuid
) RETURNS TABLE (step_order int, label text, approver_names text, ok boolean, problem text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.step_order, s.label,
         (SELECT string_agg(p.full_name, ', ') FROM profiles p WHERE p.id = ANY (r.ids)),
         cardinality(r.ids) > 0,
         CASE WHEN cardinality(r.ids) > 0 THEN NULL
              WHEN s.approver_kind = 'hod' AND p_department_id IS NULL THEN 'Choose the department'
              WHEN s.approver_kind = 'hod' THEN 'No HOD set for this department'
              ELSE 'Nobody holds this role here' END
  FROM procurement_category_approval_steps s
  CROSS JOIN LATERAL (SELECT procurement_resolve_step(s.approver_kind, s.role_key, s.same_college,
                             s.user_id, p_institution_id, p_department_id) AS ids) r
  WHERE s.category_id = p_category_id
  ORDER BY s.step_order;
$$;

-- "Waiting for me" + "have I any approval work" (layout gate).
CREATE OR REPLACE FUNCTION public.procurement_my_approvals()
RETURNS TABLE (request_id uuid, request_number text, title text, institution_name text,
               category_name text, step_label text, step_order int, steps_total int, submitted_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.request_number, r.title, i.name, c.name, a.label, a.step_order,
         (SELECT count(*)::int FROM procurement_request_approvals x WHERE x.request_id = r.id AND x.round = a.round),
         r.submitted_at
  FROM procurement_request_approvals a
  JOIN procurement_purchase_requests r ON r.id = a.request_id
  LEFT JOIN institutions i ON i.id = r.institution_id
  LEFT JOIN procurement_categories c ON c.id = r.category_id
  WHERE a.status = 'pending' AND (SELECT auth.uid()) = ANY (a.approver_ids)
  ORDER BY r.submitted_at;
$$;

CREATE OR REPLACE FUNCTION public.procurement_has_approval_work()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM procurement_request_approvals WHERE (SELECT auth.uid()) = ANY (approver_ids));
$$;
```
Grant EXECUTE on each to `authenticated`, revoke from `public, anon`.

**Step 7: Commit**

```bash
git add supabase/migrations/20271006110000_procurement_category_approval_chains.sql
git commit -m "feat(procurement): build, approve and send back category approval steps"
```

### Task 3: Prove the SQL in a rolled-back transaction, then apply

**Files:**
- Create: `supabase/tests/procurement_category_approval_chains.test.sql`

**Step 1: Write the test** — one `BEGIN … ROLLBACK` script (MCP is bound to production; nothing may persist). Pattern: run the whole migration body, create a test category with steps `[hod (Pharmacy COP-3), role principal same_college, user <CAO profile id>]`, then impersonate users with

```sql
SELECT set_config('request.jwt.claims', json_build_object('sub', '<uuid>', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
```

Cases (each `DO $$ … ASSERT … $$`):
- T1 submit without department → raises "Choose the department".
- T2 submit for a department with no HOD → raises "No HOD is set for …".
- T3 submit OK → 3 rows, step 1 `pending`, 2–3 `waiting`.
- T4 Principal approves while step 1 pending → raises "This step is waiting for HOD".
- T5 HOD approves → returns `'next'`, step 2 pending.
- T6 plain `UPDATE … SET status='approved'` as Principal → raises "use Approve / Send back".
- T7 Principal sends back → request `returned`, step 3 `cancelled`. Resubmit → round 2 with 3 fresh rows.
- T8 all approve → request `approved`, `approved_by` = last approver.
- T9 requester is the HOD → step 1 `skipped`, step 2 `pending`.
- T10 legacy request (no category) still approved by a `request_approve` holder as before.
- T11 HOD can SELECT the request + items (approver read policy); an unrelated HOD cannot.
- T12 `procurement_save_category_steps` with role `chairman_typo` → raises "does not exist".

**Step 2: Run** via the Supabase MCP `execute_sql` with the script. Expected: no assertion error; final `ROLLBACK`.

**Step 3: Apply** with `apply_migration` (name `20271006110000_procurement_category_approval_chains`). Verify:

```sql
SELECT version FROM supabase_migrations.schema_migrations WHERE version = '20271006110000';
SELECT count(*) FROM procurement_categories;   -- 4
```

**Step 4: Commit** the test file.

---

## Phase 2 — App

### Task 4: Types + pure helper (TDD)

**Files:**
- Create: `types/procurement/approval-chain.ts`; Modify: `types/procurement/index.ts` (add `export * from './approval-chain';`), `types/procurement/purchase-request.ts` (add `category_id: string | null; department_id: string | null;` to the request type)
- Create: `lib/procurement/approval-chain.ts`
- Test: `__tests__/lib/procurement/approval-chain.test.ts`

```ts
// types/procurement/approval-chain.ts
export type ApproverKind = 'hod' | 'role' | 'user';
export type ApprovalStepStatus = 'waiting' | 'pending' | 'approved' | 'skipped' | 'returned' | 'rejected' | 'cancelled';

export interface ProcurementCategory {
  id: string; name: string; description: string | null; sort_order: number; is_active: boolean;
}
export interface CategoryStep {
  id?: string; step_order: number; label: string; approver_kind: ApproverKind;
  role_key: string | null; same_college: boolean; user_id: string | null;
}
export interface RequestApproval {
  id: string; request_id: string; round: number; step_order: number; label: string;
  approver_kind: ApproverKind; approver_ids: string[]; status: ApprovalStepStatus;
  acted_by: string | null; acted_at: string | null; on_behalf: boolean; remarks: string | null;
  acted_by_profile?: { full_name: string } | null;
}
export interface ChainPreviewStep { step_order: number; label: string; approver_names: string | null; ok: boolean; problem: string | null; }
export interface MyApproval {
  request_id: string; request_number: string; title: string | null; institution_name: string | null;
  category_name: string | null; step_label: string; step_order: number; steps_total: number; submitted_at: string;
}
```

**Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { latestRound, currentStep, chainLine } from '@/lib/procurement/approval-chain';
import type { RequestApproval } from '@/types/procurement';

const row = (p: Partial<RequestApproval>): RequestApproval => ({
  id: crypto.randomUUID(), request_id: 'r', round: 1, step_order: 1, label: 'HOD', approver_kind: 'hod',
  approver_ids: ['u'], status: 'waiting', acted_by: null, acted_at: null, on_behalf: false, remarks: null, ...p,
});

describe('approval chain helpers', () => {
  const rows = [
    row({ round: 1, step_order: 1, status: 'returned' }),
    row({ round: 2, step_order: 1, status: 'approved' }),
    row({ round: 2, step_order: 2, label: 'Principal', status: 'pending' }),
    row({ round: 2, step_order: 3, label: 'CAO', status: 'waiting' }),
  ];
  it('keeps only the latest round', () => expect(latestRound(rows)).toHaveLength(3));
  it('finds the step waiting now', () => expect(currentStep(rows)?.label).toBe('Principal'));
  it('says where it is', () => expect(chainLine(rows)).toBe('Step 2 of 3 — Principal'));
  it('is empty for a legacy request', () => expect(currentStep([])).toBeNull());
});
```

**Step 2:** `npx vitest run __tests__/lib/procurement/approval-chain.test.ts` → FAIL (module missing).

**Step 3: Implement**

```ts
// lib/procurement/approval-chain.ts — reading a request's copied approval steps.
import type { RequestApproval } from '@/types/procurement';

export function latestRound(rows: RequestApproval[]): RequestApproval[] {
  const round = Math.max(0, ...rows.map((r) => r.round));
  return rows.filter((r) => r.round === round).sort((a, b) => a.step_order - b.step_order);
}
export function currentStep(rows: RequestApproval[]): RequestApproval | null {
  return latestRound(rows).find((r) => r.status === 'pending') ?? null;
}
export function chainLine(rows: RequestApproval[]): string {
  const steps = latestRound(rows);
  const now = steps.find((r) => r.status === 'pending');
  return now ? `Step ${steps.indexOf(now) + 1} of ${steps.length} — ${now.label}` : '';
}
```

**Step 4:** re-run → PASS. **Step 5:** commit.

### Task 5: Service + hooks

**Files:**
- Create: `lib/services/procurement/approval-chain-service.ts`
- Create: `hooks/procurement/use-approval-chains.ts`

Service (static methods, `createClientSupabaseClient()`, errors through `errorMessage()` from `lib/utils/supabase-error.ts` — PostgREST errors are not `Error` instances):
- `getCategories()` → `procurement_categories` ordered by `sort_order, name`, with `steps:procurement_category_approval_steps(*)`.
- `saveCategory({ id?, name, description, is_active })` → insert/update.
- `saveSteps(categoryId, steps: CategoryStep[])` → `rpc('procurement_save_category_steps', { p_category_id, p_steps })`.
- `previewChain(categoryId, institutionId, departmentId | null)` → `rpc('procurement_preview_chain', …)`.
- `getRequestApprovals(requestId)` → `procurement_request_approvals` + `acted_by_profile:profiles!acted_by(full_name)` ordered by `round, step_order`.
- `approveStep(requestId, remarks?, itemChanges: {item_id, quantity}[] = [])` → `rpc('procurement_approve_request_step', …)`.
- `decideStep(requestId, 'return' | 'reject', reason)` → `rpc('procurement_decide_request_step', …)`.
- `getMyApprovals()` → `rpc('procurement_my_approvals')`; `hasApprovalWork()` → `rpc('procurement_has_approval_work')`.

Hooks: `useProcurementCategories()` (`QUERY_CONFIG.STABLE_DATA`, key `['procurement-categories']`), `useChainPreview(categoryId, institutionId, departmentId)` (enabled when category+institution set), `useRequestApprovals(requestId)` (key `['procurement-request-approvals', id]`), `useMyApprovals()`, `useHasApprovalWork()`, mutations `useSaveCategory`, `useSaveCategorySteps`, `useApproveStep`, `useDecideStep` — on success invalidate `['procurement-request-approvals', id]`, `['procurement-purchase-request', id]` (match the key used in `hooks/procurement/use-purchase-requests.ts`), `['procurement-my-approvals']`, overview counts.

Commit.

### Task 6: Permission key + Approval Flows page

**Files:**
- No new permission key: the page is **Super Admin only** (user decision 2026-10-06 — requesters and approvers never see it).
- Modify: `lib/sidebarMenuLink.ts`: `'/procurement/approval-flows': 'super_admin', // Super admin only - procurement approval steps per category` (same marker as `/admin/ai-models`, line ~1024), `'/procurement/approvals': 'procurement.view'`
- Modify: `app/(routes)/procurement/nav-config.ts`: add `{ label: 'Approval flows', icon: 'GitBranch', href: '/procurement/approval-flows', matchPaths: ['/procurement/approval-flows'] }` (AutoTabNav hides it from others).
- Create: `app/(routes)/procurement/approval-flows/page.tsx`, `_components/category-flow-card.tsx`, `_components/step-editor.tsx`

Page (compact — one screen, per `feedback-procurement-compact-two-approvals`): a list of category cards. Each card shows the chain as chips `HOD → Principal → CAO → Chairperson`, and **Edit** opens the step editor inline:
- each step row: **Who** select — *HOD of the request's department* / *Role…* / *Person…*; for Role a role select (from `custom_roles` active, show `role_name`) + toggle *"from the request's college"* (default on; off for CAO/CEO/MD); for Person a user search (reuse an existing profile combobox, e.g. the one on `/organizations/departments/hod-assignment`); a **Label** text (defaults to the role/person name — "Chairperson").
- ↑ ↓ to reorder, ✕ to remove, **+ Add step**, **Save** → `useSaveCategorySteps`. **+ New category** at the top.
- Guard: render "Access denied" card unless `isSuperAdmin`; the nav tab is shown only to Super Admins.

Verify: `npx eslint "app/(routes)/procurement/approval-flows"` clean. Commit.

### Task 7: Request form — Category, Department, chain preview

**Files:**
- Modify: `app/(routes)/procurement/requests/new/page.tsx` (header block near the title input, ~line 222)
- Modify: `lib/services/procurement/purchase-request-service.ts` `createPurchaseRequest` (pass `category_id`, `department_id` into the insert; DTO in `types/procurement/purchase-request.ts`)

- **Category** select, required (validation next to the title check, ~line 112: `if (!categoryId) { toast.error('Choose a category'); return; }`).
- **For which department?** select — departments of `effectiveInstitution`, shown only when the category's steps include `approver_kind === 'hod'`; required then.
- Under them, the preview from `useChainPreview`: `Goes to: Dr X (HOD) → Dr Y (Principal) → Mr Z (CAO)`; a step with `ok=false` shows its `problem` in amber and **disables Submit** (the trigger would refuse anyway — this says it first).
- Submit errors from the trigger arrive as PostgREST errors → show with `errorMessage(e)`.

Verify by hand (Task 10). Commit.

### Task 8: Request page — approval panel, actions, tracker

**Files:**
- Create: `components/procurement/approval-steps-panel.tsx`
- Modify: `app/(routes)/procurement/requests/[id]/page.tsx` (`canApprove` ~113, `canDecide` ~158, send-back dialog ~593)
- Modify: `components/procurement/request-journey.tsx` (`buildSteps` s2, ~line 48)

- `ApprovalStepsPanel` (latest round, vertical list): ✓ *HOD — Dr X · 6 Oct 10:20* / ⏳ *Principal — waiting for Dr Y* / ○ *CAO*; skipped and "on behalf of" shown in grey; earlier rounds under a *History* disclosure.
- In the page: `const chain = useRequestApprovals(id)`; when `pr.category_id`:
  - `myTurn = currentStep(rows)?.approver_ids.includes(profile.id) || isSuperAdmin`
  - `canDecide = pr.status === 'submitted' && myTurn && !selfApproval`
  - Approve → `useApproveStep` with the existing quantity-change UI's `itemUpdates` mapped to `{ item_id, quantity }`; Send back → `useDecideStep(id, 'return', reason)`; Reject → `'reject'`.
  - else (legacy) keep today's `useApprovePurchaseRequest` / `useApproveWithModifications` path unchanged.
- Tracker `s2`: keep title **"Approval"**; when the journey has chain rows, note = `chainLine(rows)` while submitted, and `signed(lastApprover, at)` when done. Add the rows to `RequestJourney` (fetch in `useRequestJourney`).

Commit.

### Task 9: Approvers get in — gate + "Waiting for me"

**Files:**
- Modify: `app/(routes)/procurement/layout.tsx`
- Create: `app/(routes)/procurement/approvals/page.tsx`

- Layout: `const { data: hasWork } = useHasApprovalWork();` allow when `isSuperAdmin || canAccess('procurement','view') || hasWork`. A user who is only an approver gets no tabs (AutoTabNav hides them) — they land via the notification link or `/procurement/approvals`.
- `/procurement/approvals`: list from `useMyApprovals()` — request no., title, college, category, *"Step 2 of 4 — Principal"*, submitted date; row → `/procurement/requests/[id]`. Empty: "Nothing waiting for you."
- Add `Approvals` to the Overview staff card list in `components/procurement/overview/staff-overview.tsx` gate 1 `listHref` when the user has approval work.

Commit.

### Task 10: Verify end-to-end, then PR

**Step 1:** `npx vitest run __tests__/lib/procurement` → all pass. Scoped lint:
`npx eslint lib/procurement lib/services/procurement hooks/procurement "app/(routes)/procurement" components/procurement` → clean. (Full `tsc` OOMs here — use a scoped tsconfig as in earlier sessions.)

**Step 2:** Dev server (`npx next dev --webpack -p 3003`), with three test accounts (requester, HOD of one Pharmacy dept, Principal of Pharmacy):
1. Super Admin sets *Lab chemicals & glassware* = HOD → Principal.
2. Requester: category + department → preview shows both names → Submit.
3. HOD: notification → request → Approve. Principal: notification → Approve → request `approved`, tracker shows both sign-offs.
4. Repeat with Send back at step 2 → requester fixes → resubmit → starts at HOD again.

**Step 3:** Update memory `project-procurement-category-approvals` with what shipped. Open a PR against `main` (not stacked — stacked PRs get no CI).

---

## Out of scope / follow-ups

- Post-quotation Super Admin approval (`pending_award_approval`) — unchanged; revisit if the category chain should also cover the vendor/price.
- IMS reorder → procurement (`createFromImsReorder`, `ims_reorder_to_procurement` RPC) creates requests **without a category** → they keep the legacy rule. Add a category to the reorder flow later.
- Escalation after N days (`approval_authority_config.escalate_after_days` style) — not requested.
- Moving existing `submitted` requests onto a chain — they finish under the legacy rule.
