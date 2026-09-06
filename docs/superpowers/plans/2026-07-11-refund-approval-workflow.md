# Refund Approval Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multi-stage bill-based refund approval workflow (Initiate → dynamic stages → Disburse) with per-institution config, Google Drive attachments, seat release at initiation, replacing the old receipt-based refund module.

**Architecture:** Purpose-built tables with a frozen `flow_snapshot` per request; all writes via three self-authorizing SECURITY DEFINER RPCs; SELECT-only RLS. UI = server-rendered list + client detail/dialog components following the existing billing page → hook → service → Supabase layering.

**Tech Stack:** Next.js 16 App Router, React Query v5, Supabase (Postgres RLS + RPCs), Shadcn UI, Google Drive uploads, jsPDF (existing receipt-pdf pattern).

**Spec:** `docs/superpowers/specs/2026-07-11-refund-approval-workflow-design.md` — read it before starting.

## Global Constraints

- **Branch:** all work on `feat/refund-approval-workflow` (main is PR-protected).
- **No test runner exists.** Verification per task = `mcp__ide__getDiagnostics` on touched files + SQL assertions via `mcp__supabase__execute_sql` + browser walkthrough at the end. Never claim tests pass.
- **Migrations:** apply via `mcp__supabase__apply_migration` AND commit the identical SQL body to `supabase/migrations/<name>.sql`; mirror objects into `supabase/setup/01_tables.sql`, `02_functions.sql`, `03_policies.sql` sections. Never leave placeholders.
- **Supabase client code:** always destructure `{ error }` and check it; use `getErrorMessage()` from `@/lib/utils`; `??` not `||` for institution ids; left joins (never `!inner`).
- **All uuids inside `flow_snapshot` jsonb are stored as STRINGS** (jsonb `?` operator matches text).
- **Permission keys do nothing until granted** — grants ship in the same migration that declares a key.
- **PaymentMode** union (existing, `types/billing-schedule.ts:13`): `'cash' | 'online' | 'bank_transfer' | 'dd' | 'cheque'`.
- Verified helper signatures: `is_super_admin()`, `user_has_permission(permission_name text)`, `role_has_institution_access(check_institution_id uuid)`, `refresh_student_billing_summary(student_uuid uuid)`, `fn_role_user_counts()`; role membership = `user_roles(user_id, role_id)` → `custom_roles(id, role_name, role_key, is_active)`.

---

### Task 1: Schema migration — tables, columns, status row, RLS

**Files:**
- Create: `supabase/migrations/20260711100000_refund_workflow_schema.sql`
- Modify: `supabase/setup/01_tables.sql` (append §BILLING REFUND WORKFLOW), `supabase/setup/03_policies.sql` (append policies)

**Interfaces:**
- Produces: tables `billing_refund_flow_configs`, `billing_refund_requests`, `billing_refund_request_bills`, `billing_refund_request_actions`; sequence `billing_refund_request_number_seq`; columns `billing_student_bills.refunded_amount/refund_status`; `admission_statuses` row `withdrawal_pending`.

- [ ] **Step 1: Create branch**

```bash
git checkout -b feat/refund-approval-workflow
```

- [ ] **Step 2: Write and apply the migration** (via `mcp__supabase__apply_migration`, name `refund_workflow_schema`, then save the same SQL to the migration file):

```sql
-- 20260711100000_refund_workflow_schema.sql
-- Refund approval workflow (spec 2026-07-11): config + request + bills + actions
-- tables, bill refund columns, withdrawal_pending learner status. Writes happen
-- ONLY via SECURITY DEFINER RPCs (see 20260711110000); RLS grants SELECT only.

CREATE TABLE IF NOT EXISTS public.billing_refund_flow_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NULL REFERENCES institutions(id),  -- NULL = global default
    name TEXT NOT NULL,
    initiator_roles UUID[] NOT NULL DEFAULT '{}',
    initiator_users UUID[] NOT NULL DEFAULT '{}',
    stages JSONB NOT NULL DEFAULT '[]',  -- [{key,name,assignee_roles:[],assignee_users:[]}]
    disburser_roles UUID[] NOT NULL DEFAULT '{}',
    disburser_users UUID[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_flow_global_active
    ON billing_refund_flow_configs ((1)) WHERE institution_id IS NULL AND is_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_flow_institution_active
    ON billing_refund_flow_configs (institution_id) WHERE institution_id IS NOT NULL AND is_active;

CREATE SEQUENCE IF NOT EXISTS billing_refund_request_number_seq;

CREATE TABLE IF NOT EXISTS public.billing_refund_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_number TEXT NOT NULL UNIQUE,
    institution_id UUID NOT NULL REFERENCES institutions(id),
    student_id UUID NOT NULL REFERENCES learners_profiles(id),
    refund_type TEXT NOT NULL CHECK (refund_type IN ('withdrawal','adjustment')),
    status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (status IN ('pending_review','pending_disbursement','disbursed','declined')),
    current_stage_index INT NOT NULL DEFAULT 0,
    flow_snapshot JSONB NOT NULL,
    total_refund_amount NUMERIC(15,2) NOT NULL,
    previous_lifecycle_status TEXT NULL,
    initiated_by UUID NOT NULL REFERENCES profiles(id),
    initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    declined_by UUID NULL REFERENCES profiles(id),
    declined_at TIMESTAMPTZ NULL,
    decline_reason TEXT NULL,
    declined_stage_name TEXT NULL,
    payment_mode TEXT NULL CHECK (payment_mode IS NULL OR payment_mode IN ('cash','online','bank_transfer','dd','cheque')),
    payment_details JSONB NULL,
    disbursed_by UUID NULL REFERENCES profiles(id),
    disbursed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refund_requests_student ON billing_refund_requests (student_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_institution_status ON billing_refund_requests (institution_id, status);

CREATE TABLE IF NOT EXISTS public.billing_refund_request_bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES billing_refund_requests(id) ON DELETE CASCADE,
    bill_id UUID NOT NULL REFERENCES billing_student_bills(id),
    paid_amount_snapshot NUMERIC(15,2) NOT NULL,
    refund_amount NUMERIC(15,2) NOT NULL,
    CONSTRAINT chk_refund_amount CHECK (refund_amount > 0 AND refund_amount <= paid_amount_snapshot),
    CONSTRAINT uq_request_bill UNIQUE (request_id, bill_id)
);
CREATE INDEX IF NOT EXISTS idx_refund_request_bills_bill ON billing_refund_request_bills (bill_id);

CREATE TABLE IF NOT EXISTS public.billing_refund_request_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES billing_refund_requests(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL CHECK (action_type IN ('initiated','approved','declined','disbursed')),
    stage_index INT NULL,
    stage_name TEXT NOT NULL,
    actor_id UUID NOT NULL REFERENCES profiles(id),
    actor_role_name TEXT NULL,
    notes TEXT NULL,
    attachments JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refund_actions_request ON billing_refund_request_actions (request_id, created_at);

ALTER TABLE billing_student_bills
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_status TEXT NULL
      CHECK (refund_status IS NULL OR refund_status IN ('partially_refunded','refunded'));

-- withdrawal_pending learner status: frees the seat (not in any seat-RPC counted
-- list), non-terminal, does not gate login. Idempotent insert.
INSERT INTO admission_statuses (scope, code, label, description, color, sort_order,
       is_active, is_terminal, is_seat_filled, gates_login, auto_promote_when_universal_paid)
SELECT 'learner', 'withdrawal_pending', 'Withdrawal Pending',
       'Refund initiated for withdrawal; seat released, awaiting refund completion',
       '#f97316', 11, true, false, false, false, false
WHERE NOT EXISTS (SELECT 1 FROM admission_statuses WHERE scope='learner' AND code='withdrawal_pending');

-- updated_at maintenance (existing billing trigger fn)
CREATE TRIGGER trigger_refund_flow_configs_updated_at BEFORE UPDATE ON billing_refund_flow_configs
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();
CREATE TRIGGER trigger_refund_requests_updated_at BEFORE UPDATE ON billing_refund_requests
    FOR EACH ROW EXECUTE FUNCTION update_billing_updated_at();

-- ===== RLS: SELECT only; ALL writes via SECURITY DEFINER RPCs =====
ALTER TABLE billing_refund_flow_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_refund_request_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_refund_request_actions ENABLE ROW LEVEL SECURITY;

-- Configs: readable by all authenticated (capability resolution); writable with configure perm.
CREATE POLICY refund_flow_configs_select ON billing_refund_flow_configs
    FOR SELECT TO authenticated USING (true);
CREATE POLICY refund_flow_configs_write ON billing_refund_flow_configs
    FOR ALL TO authenticated
    USING (is_super_admin() OR user_has_permission('billing.refunds.configure'))
    WITH CHECK (is_super_admin() OR user_has_permission('billing.refunds.configure'));

-- Requests: staff with view perm + institution access; snapshot participants; the learner.
CREATE POLICY refund_requests_select ON billing_refund_requests
    FOR SELECT TO authenticated USING (
        is_super_admin()
        OR (user_has_permission('billing.refunds.view')
            AND role_has_institution_access(billing_refund_requests.institution_id))
        OR billing_refund_requests.initiated_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(billing_refund_requests.flow_snapshot->'stages') s
            WHERE s->'assignee_users' ? auth.uid()::text
               OR EXISTS (SELECT 1 FROM user_roles ur
                          WHERE ur.user_id = auth.uid() AND s->'assignee_roles' ? ur.role_id::text))
        OR (billing_refund_requests.flow_snapshot->'disburser'->'assignee_users' ? auth.uid()::text)
        OR EXISTS (SELECT 1 FROM user_roles ur
                   WHERE ur.user_id = auth.uid()
                     AND billing_refund_requests.flow_snapshot->'disburser'->'assignee_roles' ? ur.role_id::text)
        OR EXISTS (  -- learner self-view (mirrors existing billing_refunds student policy)
            SELECT 1 FROM learners_profiles lp
            JOIN profiles p ON (p.email = lp.student_email OR p.email = lp.college_email)
            WHERE lp.id = billing_refund_requests.student_id
              AND p.id = auth.uid() AND p.role = 'student')
    );

-- Child tables inherit visibility through the parent (subquery runs under caller RLS).
CREATE POLICY refund_request_bills_select ON billing_refund_request_bills
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM billing_refund_requests r WHERE r.id = billing_refund_request_bills.request_id));
CREATE POLICY refund_request_actions_select ON billing_refund_request_actions
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM billing_refund_requests r WHERE r.id = billing_refund_request_actions.request_id));
```

- [ ] **Step 3: Verify schema**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT (SELECT count(*) FROM information_schema.tables WHERE table_name LIKE 'billing_refund_%') AS tables,
       (SELECT count(*) FROM information_schema.columns WHERE table_name='billing_student_bills' AND column_name IN ('refunded_amount','refund_status')) AS bill_cols,
       (SELECT count(*) FROM admission_statuses WHERE code='withdrawal_pending') AS status_row;
```
Expected: `tables=4` (configs/requests/bills/actions — note `billing_refunds` legacy doesn't match the `billing_refund_%` prefix), `bill_cols=2`, `status_row=1`.

- [ ] **Step 4: Mirror into setup files** — append the four CREATE TABLEs + ALTER to `supabase/setup/01_tables.sql` (new section header `-- BILLING REFUND WORKFLOW (2026-07-11)`), the policies to `03_policies.sql`, the two triggers to `04_triggers.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260711100000_refund_workflow_schema.sql supabase/setup/
git commit -m "feat(billing): refund workflow schema — configs, requests, bills, actions, withdrawal_pending status"
```

---

### Task 2: RPC migration — resolve/capabilities/initiate/act/disburse

**Files:**
- Create: `supabase/migrations/20260711105000_withdrawal_pending_enum.sql` — `learners_profiles.lifecycle_status` is a Postgres ENUM (verified live); the new status must be added to the TYPE, standalone because ALTER TYPE ADD VALUE cannot share a transaction with statements that use the value:

```sql
-- 20260711105000_withdrawal_pending_enum.sql
-- lifecycle_status is an ENUM type; withdrawal_pending must exist in the type,
-- not just in admission_statuses (which is display/behavior metadata).
ALTER TYPE lifecycle_status ADD VALUE IF NOT EXISTS 'withdrawal_pending';
```

- Create: `supabase/migrations/20260711110000_refund_workflow_rpcs.sql`
- Modify: `supabase/setup/02_functions.sql` (append)

**Interfaces (produces — exact signatures the service layer calls):**
- `fn_resolve_refund_flow_config(p_institution_id uuid) RETURNS billing_refund_flow_configs`
- `fn_my_refund_capabilities(p_institution_id uuid) RETURNS jsonb` → `{"configured":bool,"can_initiate":bool}`
- `fn_initiate_refund_request(p_student_id uuid, p_refund_type text, p_bills jsonb, p_notes text, p_attachments jsonb) RETURNS uuid` — `p_bills` = `[{"bill_id":"<uuid>","refund_amount":123.45}]`
- `fn_act_on_refund_request(p_request_id uuid, p_action text, p_notes text, p_attachments jsonb, p_reason text) RETURNS void` — `p_action` ∈ `approve|decline`
- `fn_disburse_refund_request(p_request_id uuid, p_payment_mode text, p_payment_details jsonb, p_notes text, p_attachments jsonb) RETURNS void`

- [ ] **Step 1: Write and apply the migration** (`apply_migration` name `refund_workflow_rpcs`, then save file):

```sql
-- 20260711110000_refund_workflow_rpcs.sql
-- All refund-workflow writes. SECURITY DEFINER + self-authorizing against the
-- request's FROZEN flow_snapshot (never live config — reservations drift lesson).

CREATE OR REPLACE FUNCTION public.fn_refund_assignee_match(p_roles jsonb, p_users jsonb, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(p_users ? p_user::text, false)
      OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p_user AND COALESCE(p_roles ? ur.role_id::text, false));
$$;

CREATE OR REPLACE FUNCTION public.fn_resolve_refund_flow_config(p_institution_id uuid)
RETURNS billing_refund_flow_configs LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM billing_refund_flow_configs
  WHERE is_active AND (institution_id = p_institution_id OR institution_id IS NULL)
  ORDER BY institution_id NULLS LAST LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.fn_my_refund_capabilities(p_institution_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cfg billing_refund_flow_configs; v_can boolean := false;
BEGIN
  v_cfg := fn_resolve_refund_flow_config(p_institution_id);
  IF v_cfg.id IS NULL THEN RETURN jsonb_build_object('configured', false, 'can_initiate', false); END IF;
  v_can := is_super_admin()
        OR auth.uid() = ANY(v_cfg.initiator_users)
        OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role_id = ANY(v_cfg.initiator_roles));
  RETURN jsonb_build_object('configured', true, 'can_initiate', v_can);
END; $$;

CREATE OR REPLACE FUNCTION public.fn_initiate_refund_request(
  p_student_id uuid, p_refund_type text, p_bills jsonb, p_notes text, p_attachments jsonb DEFAULT '[]'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_student learners_profiles; v_cfg billing_refund_flow_configs;
  v_bill record; v_line jsonb; v_paid numeric; v_held numeric; v_amt numeric;
  v_total numeric := 0; v_request_id uuid; v_number text; v_snapshot jsonb;
  v_actor_role text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_refund_type NOT IN ('withdrawal','adjustment') THEN RAISE EXCEPTION 'invalid_refund_type'; END IF;
  IF COALESCE(btrim(p_notes),'') = '' THEN RAISE EXCEPTION 'notes_required'; END IF;
  IF jsonb_typeof(p_bills) <> 'array' OR jsonb_array_length(p_bills) = 0 THEN RAISE EXCEPTION 'no_bills_selected'; END IF;

  SELECT * INTO v_student FROM learners_profiles WHERE id = p_student_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'student_not_found'; END IF;

  v_cfg := fn_resolve_refund_flow_config(v_student.institution_id);
  IF v_cfg.id IS NULL THEN RAISE EXCEPTION 'no_flow_configured'; END IF;
  IF jsonb_array_length(v_cfg.stages) = 0 THEN RAISE EXCEPTION 'flow_has_no_stages'; END IF;
  IF NOT (is_super_admin() OR v_user = ANY(v_cfg.initiator_users)
          OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = v_user AND ur.role_id = ANY(v_cfg.initiator_roles))) THEN
    RAISE EXCEPTION 'not_authorized_to_initiate';
  END IF;

  -- Freeze the chain. uuids as strings so jsonb ? works in RLS/gating.
  v_snapshot := jsonb_build_object(
    'config_id', v_cfg.id::text,
    'initiator', jsonb_build_object('assignee_roles', to_jsonb(v_cfg.initiator_roles::text[]), 'assignee_users', to_jsonb(v_cfg.initiator_users::text[])),
    'stages', v_cfg.stages,
    'disburser', jsonb_build_object('assignee_roles', to_jsonb(v_cfg.disburser_roles::text[]), 'assignee_users', to_jsonb(v_cfg.disburser_users::text[])));

  v_number := 'RFND-' || to_char(now(),'YYYY') || '-' || lpad(nextval('billing_refund_request_number_seq')::text, 5, '0');
  SELECT cr.role_name INTO v_actor_role FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = v_user ORDER BY ur.is_primary DESC NULLS LAST LIMIT 1;

  INSERT INTO billing_refund_requests
    (request_number, institution_id, student_id, refund_type, status, current_stage_index,
     flow_snapshot, total_refund_amount, previous_lifecycle_status, initiated_by)
  VALUES (v_number, v_student.institution_id, p_student_id, p_refund_type, 'pending_review', 0,
     v_snapshot, 0, CASE WHEN p_refund_type='withdrawal' THEN v_student.lifecycle_status::text END, v_user)
  RETURNING id INTO v_request_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_bills) LOOP
    v_amt := (v_line->>'refund_amount')::numeric;
    SELECT * INTO v_bill FROM billing_student_bills
      WHERE id = (v_line->>'bill_id')::uuid AND student_id = p_student_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'bill_not_found_for_student: %', v_line->>'bill_id'; END IF;

    SELECT COALESCE(SUM(bri.amount_paid),0) INTO v_paid FROM billing_receipt_items bri WHERE bri.bill_id = v_bill.id;
    SELECT COALESCE(SUM(rb.refund_amount),0) INTO v_held
      FROM billing_refund_request_bills rb
      JOIN billing_refund_requests r ON r.id = rb.request_id
      WHERE rb.bill_id = v_bill.id AND r.status IN ('pending_review','pending_disbursement');

    IF v_amt IS NULL OR v_amt <= 0 THEN RAISE EXCEPTION 'invalid_refund_amount'; END IF;
    IF v_amt > v_paid - v_bill.refunded_amount - v_held THEN
      RAISE EXCEPTION 'amount_exceeds_refundable: bill % headroom %', v_bill.id, v_paid - v_bill.refunded_amount - v_held;
    END IF;

    INSERT INTO billing_refund_request_bills (request_id, bill_id, paid_amount_snapshot, refund_amount)
    VALUES (v_request_id, v_bill.id, v_paid, v_amt);
    v_total := v_total + v_amt;
  END LOOP;

  UPDATE billing_refund_requests SET total_refund_amount = v_total WHERE id = v_request_id;
  INSERT INTO billing_refund_request_actions (request_id, action_type, stage_index, stage_name, actor_id, actor_role_name, notes, attachments)
  VALUES (v_request_id, 'initiated', NULL, 'Initiation', v_user, v_actor_role, p_notes, COALESCE(p_attachments,'[]'));

  IF p_refund_type = 'withdrawal' THEN
    UPDATE learners_profiles SET lifecycle_status = 'withdrawal_pending', updated_at = now()
    WHERE id = p_student_id;  -- seat freed NOW (seat RPCs count by status)
  END IF;
  RETURN v_request_id;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_act_on_refund_request(
  p_request_id uuid, p_action text, p_notes text DEFAULT NULL,
  p_attachments jsonb DEFAULT '[]', p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_req billing_refund_requests; v_stage jsonb;
  v_stage_count int; v_actor_role text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_action NOT IN ('approve','decline') THEN RAISE EXCEPTION 'invalid_action'; END IF;

  SELECT * INTO v_req FROM billing_refund_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF v_req.status <> 'pending_review' THEN RAISE EXCEPTION 'invalid_status: %', v_req.status; END IF;

  v_stage := v_req.flow_snapshot->'stages'->v_req.current_stage_index;
  v_stage_count := jsonb_array_length(v_req.flow_snapshot->'stages');
  IF NOT (is_super_admin()
          OR fn_refund_assignee_match(v_stage->'assignee_roles', v_stage->'assignee_users', v_user)) THEN
    RAISE EXCEPTION 'not_current_stage_assignee';
  END IF;

  SELECT cr.role_name INTO v_actor_role FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = v_user ORDER BY ur.is_primary DESC NULLS LAST LIMIT 1;

  IF p_action = 'approve' THEN
    IF COALESCE(btrim(p_notes),'') = '' THEN RAISE EXCEPTION 'notes_required'; END IF;
    INSERT INTO billing_refund_request_actions (request_id, action_type, stage_index, stage_name, actor_id, actor_role_name, notes, attachments)
    VALUES (p_request_id, 'approved', v_req.current_stage_index, v_stage->>'name', v_user, v_actor_role, p_notes, COALESCE(p_attachments,'[]'));
    IF v_req.current_stage_index + 1 >= v_stage_count THEN
      UPDATE billing_refund_requests SET status = 'pending_disbursement' WHERE id = p_request_id;
    ELSE
      UPDATE billing_refund_requests SET current_stage_index = current_stage_index + 1 WHERE id = p_request_id;
    END IF;
  ELSE  -- decline: terminal; withdrawal learner restored
    IF COALESCE(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'reason_required'; END IF;
    INSERT INTO billing_refund_request_actions (request_id, action_type, stage_index, stage_name, actor_id, actor_role_name, notes, attachments)
    VALUES (p_request_id, 'declined', v_req.current_stage_index, v_stage->>'name', v_user, v_actor_role,
            COALESCE(p_notes, p_reason), COALESCE(p_attachments,'[]'));
    UPDATE billing_refund_requests
      SET status='declined', declined_by=v_user, declined_at=now(),
          decline_reason=p_reason, declined_stage_name=v_stage->>'name'
      WHERE id = p_request_id;
    IF v_req.refund_type = 'withdrawal' AND v_req.previous_lifecycle_status IS NOT NULL THEN
      UPDATE learners_profiles SET lifecycle_status = v_req.previous_lifecycle_status::lifecycle_status, updated_at = now()
      WHERE id = v_req.student_id AND lifecycle_status = 'withdrawal_pending';  -- guard: don't clobber external changes
    END IF;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_disburse_refund_request(
  p_request_id uuid, p_payment_mode text, p_payment_details jsonb DEFAULT '{}',
  p_notes text DEFAULT NULL, p_attachments jsonb DEFAULT '[]'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_req billing_refund_requests; v_line record;
  v_paid numeric; v_actor_role text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_payment_mode NOT IN ('cash','online','bank_transfer','dd','cheque') THEN RAISE EXCEPTION 'invalid_payment_mode'; END IF;
  IF COALESCE(btrim(p_notes),'') = '' THEN RAISE EXCEPTION 'notes_required'; END IF;

  SELECT * INTO v_req FROM billing_refund_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF v_req.status <> 'pending_disbursement' THEN RAISE EXCEPTION 'invalid_status: %', v_req.status; END IF;
  IF NOT (is_super_admin() OR fn_refund_assignee_match(
            v_req.flow_snapshot->'disburser'->'assignee_roles',
            v_req.flow_snapshot->'disburser'->'assignee_users', v_user)) THEN
    RAISE EXCEPTION 'not_disburser';
  END IF;

  FOR v_line IN SELECT rb.*, b.id AS b_id FROM billing_refund_request_bills rb
                JOIN billing_student_bills b ON b.id = rb.bill_id
                WHERE rb.request_id = p_request_id FOR UPDATE OF b LOOP
    SELECT COALESCE(SUM(bri.amount_paid),0) INTO v_paid FROM billing_receipt_items bri WHERE bri.bill_id = v_line.bill_id;
    UPDATE billing_student_bills
      SET refunded_amount = refunded_amount + v_line.refund_amount,
          refund_status = CASE WHEN refunded_amount + v_line.refund_amount >= v_paid
                               THEN 'refunded' ELSE 'partially_refunded' END,
          updated_at = now()
      WHERE id = v_line.bill_id;
  END LOOP;

  SELECT cr.role_name INTO v_actor_role FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = v_user ORDER BY ur.is_primary DESC NULLS LAST LIMIT 1;
  INSERT INTO billing_refund_request_actions (request_id, action_type, stage_index, stage_name, actor_id, actor_role_name, notes, attachments)
  VALUES (p_request_id, 'disbursed', NULL, 'Disbursement', v_user, v_actor_role, p_notes, COALESCE(p_attachments,'[]'));

  UPDATE billing_refund_requests
    SET status='disbursed', payment_mode=p_payment_mode, payment_details=p_payment_details,
        disbursed_by=v_user, disbursed_at=now()
    WHERE id = p_request_id;

  IF v_req.refund_type = 'withdrawal' THEN
    UPDATE learners_profiles SET lifecycle_status = 'exited', updated_at = now() WHERE id = v_req.student_id;
  END IF;
  PERFORM refresh_student_billing_summary(v_req.student_id);
END; $$;

-- Default PUBLIC EXECUTE must be revoked (REVOKE from anon alone is a no-op —
-- anon inherits EXECUTE via PUBLIC; repo gotcha). Self-auth remains the primary gate.
REVOKE EXECUTE ON FUNCTION fn_refund_assignee_match(jsonb,jsonb,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_resolve_refund_flow_config(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_my_refund_capabilities(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_initiate_refund_request(uuid,text,jsonb,text,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_act_on_refund_request(uuid,text,text,jsonb,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_disburse_refund_request(uuid,text,jsonb,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_refund_assignee_match(jsonb,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_resolve_refund_flow_config(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_my_refund_capabilities(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_initiate_refund_request(uuid,text,jsonb,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_act_on_refund_request(uuid,text,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_disburse_refund_request(uuid,text,jsonb,text,jsonb) TO authenticated;
```

Additionally (setup fresh-rebuild fidelity): add `'withdrawal_pending'` to the `CREATE TYPE lifecycle_status AS ENUM (...)` list in `supabase/setup/01_tables.sql` (after `'reserved'`), matching migration 20260711105000.

- [ ] **Step 2: Verify** — `SELECT proname FROM pg_proc WHERE proname LIKE 'fn_%refund%' ORDER BY 1;` expects the 5 new functions + `fn_refund_assignee_match`. Then negative smoke test (safe on prod): `SELECT fn_act_on_refund_request('00000000-0000-0000-0000-000000000000','approve');` → expect `request_not_found` error (proves function compiles & runs).

- [ ] **Step 3: Mirror into `supabase/setup/02_functions.sql`, commit**

```bash
git add supabase/migrations/20260711110000_refund_workflow_rpcs.sql supabase/setup/02_functions.sql
git commit -m "feat(billing): refund workflow RPCs — initiate/act/disburse, snapshot-gated"
```

---

### Task 3: Permission key + grants migration

**Files:**
- Create: `supabase/migrations/20260711120000_refund_configure_permission.sql`
- Modify: `lib/constants/permissions.ts` (after line 601, inside the billing.refunds block)

- [ ] **Step 1: Add key to catalog** — in `lib/constants/permissions.ts` after `billing.refunds.process`:

```ts
      { key: 'billing.refunds.configure', label: 'Configure Refund Approval Flows' },
```

- [ ] **Step 2: Grant migration** (apply + save):

```sql
-- 20260711120000_refund_configure_permission.sql
-- Grant billing.refunds.configure to Super Administrator + billing admin roles.
-- A declared key does nothing until present in custom_roles.permissions JSONB.
UPDATE custom_roles
SET permissions = permissions || jsonb_build_object('billing.refunds.configure', true)
WHERE role_name IN ('Super Administrator', 'Administrator', 'Chief Accountant')
  AND is_active;
```
Verify: `SELECT role_name FROM custom_roles WHERE permissions ? 'billing.refunds.configure';` → expect the granted roles (adjust the IN-list to the actual role_names present; check first with `SELECT role_name FROM custom_roles WHERE is_active ORDER BY 1;`).

- [ ] **Step 3: Run `npm run check:menus`** — audit coverage must still pass (key is in the catalog). Commit:

```bash
git add lib/constants/permissions.ts supabase/migrations/20260711120000_refund_configure_permission.sql
git commit -m "feat(billing): billing.refunds.configure permission key + role grants"
```

---

### Task 4: TypeScript types, service, query keys, hooks

**Files:**
- Modify: `types/supabase.ts` — regenerate via `mcp__supabase__generate_typescript_types` (registers the 4 new tables; required or `.from()` fails typecheck)
- Create: `types/billing-refund-workflow.ts`
- Create: `lib/services/billing/refunds/refund-workflow-service.ts`
- Modify: `hooks/billing/` — Create: `hooks/billing/use-refund-workflow.ts`

**Interfaces (produces):**
- Types: `RefundFlowConfig`, `RefundFlowStage`, `RefundRequest`, `RefundRequestBill`, `RefundRequestAction`, `RefundAttachment`, `RefundRequestStatus`, `RefundType`, `InitiateRefundInput`
- Service statics: `RefundWorkflowService.getConfigs()`, `.saveConfig(cfg)`, `.deleteConfig(id)`, `.getMyCapabilities(institutionId)`, `.getEligibleBills(studentId)`, `.initiate(input)`, `.act(requestId, action, {notes, attachments, reason})`, `.disburse(requestId, {paymentMode, paymentDetails, notes, attachments})`, `.getRequest(id)`, `.getRequests(filters)`
- Hooks: `useRefundCapabilities(institutionId)`, `useEligibleRefundBills(studentId)`, `useInitiateRefund()`, `useActOnRefund()`, `useDisburseRefund()`, `useRefundRequest(id)`, `useRefundFlowConfigs()`, `useSaveRefundFlowConfig()`
- Query keys: `refundWorkflowKeys = { requests: (f) => ['refund-requests', f], request: (id) => ['refund-request', id], configs: ['refund-flow-configs'], capabilities: (inst) => ['refund-capabilities', inst], eligibleBills: (sid) => ['refund-eligible-bills', sid] }`

- [ ] **Step 1: `types/billing-refund-workflow.ts`** (complete file):

```ts
export type RefundType = 'withdrawal' | 'adjustment';
export type RefundRequestStatus = 'pending_review' | 'pending_disbursement' | 'disbursed' | 'declined';

export interface RefundAttachment {
  name: string;
  drive_file_id: string;
  drive_url: string;
  mime?: string;
  size?: number;
}

export interface RefundFlowStage {
  key: string;                 // stable uuid generated client-side on add
  name: string;
  assignee_roles: string[];    // custom_roles.id
  assignee_users: string[];    // profiles.id
}

export interface RefundFlowConfig {
  id: string;
  institution_id: string | null;   // null = global default
  name: string;
  initiator_roles: string[];
  initiator_users: string[];
  stages: RefundFlowStage[];
  disburser_roles: string[];
  disburser_users: string[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RefundRequestBill {
  id: string;
  request_id: string;
  bill_id: string;
  paid_amount_snapshot: number;
  refund_amount: number;
  bill?: { id: string; bill_description?: string; bill_amount?: number; status?: string };
}

export interface RefundRequestAction {
  id: string;
  request_id: string;
  action_type: 'initiated' | 'approved' | 'declined' | 'disbursed';
  stage_index: number | null;
  stage_name: string;
  actor_id: string;
  actor_role_name: string | null;
  notes: string | null;
  attachments: RefundAttachment[];
  created_at: string;
  actor?: { id: string; full_name: string };
}

export interface RefundRequest {
  id: string;
  request_number: string;
  institution_id: string;
  student_id: string;
  refund_type: RefundType;
  status: RefundRequestStatus;
  current_stage_index: number;
  flow_snapshot: {
    config_id: string;
    initiator: { assignee_roles: string[]; assignee_users: string[] };
    stages: RefundFlowStage[];
    disburser: { assignee_roles: string[]; assignee_users: string[] };
  };
  total_refund_amount: number;
  previous_lifecycle_status: string | null;
  initiated_by: string;
  initiated_at: string;
  declined_by: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  declined_stage_name: string | null;
  payment_mode: string | null;
  payment_details: Record<string, unknown> | null;
  disbursed_by: string | null;
  disbursed_at: string | null;
  created_at: string;
  student?: { id: string; first_name: string; last_name: string; roll_number?: string; lifecycle_status?: string };
  bills?: RefundRequestBill[];
  actions?: RefundRequestAction[];
}

export interface EligibleRefundBill {
  bill_id: string;
  bill_description: string;
  paid_amount: number;
  refunded_amount: number;
  held_amount: number;        // sum in other active requests
  refundable: number;         // paid - refunded - held
}

export interface InitiateRefundInput {
  student_id: string;
  refund_type: RefundType;
  bills: { bill_id: string; refund_amount: number }[];
  notes: string;
  attachments: RefundAttachment[];
}

export interface RefundRequestFilters {
  page?: number;
  limit?: number;
  status?: RefundRequestStatus;
  refund_type?: RefundType;
  institution_id?: string;
  search?: string;            // matches request_number
  date_from?: string;
  date_to?: string;
}
```

- [ ] **Step 2: `lib/services/billing/refunds/refund-workflow-service.ts`** (complete file — client Supabase singleton like sibling services; reads via PostgREST, writes via `.rpc`):

```ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import type {
  RefundFlowConfig, RefundRequest, RefundRequestFilters, InitiateRefundInput,
  EligibleRefundBill, RefundAttachment
} from '@/types/billing-refund-workflow';

const REQUEST_SELECT = `
  *,
  student:learners_profiles(id, first_name, last_name, roll_number, lifecycle_status),
  bills:billing_refund_request_bills(*, bill:billing_student_bills(id, bill_description, bill_amount, status)),
  actions:billing_refund_request_actions(*, actor:profiles(id, full_name))
`;

export class RefundWorkflowService {
  private static supabase = createClientSupabaseClient();

  static async getConfigs(): Promise<RefundFlowConfig[]> {
    const { data, error } = await (this.supabase as any)
      .from('billing_refund_flow_configs').select('*')
      .order('institution_id', { ascending: true, nullsFirst: true });
    if (error) throw new Error(getErrorMessage(error));
    return data ?? [];
  }

  static async saveConfig(cfg: Partial<RefundFlowConfig>): Promise<RefundFlowConfig> {
    const table = (this.supabase as any).from('billing_refund_flow_configs');
    const { data, error } = cfg.id
      ? await table.update(cfg).eq('id', cfg.id).select().single()
      : await table.insert(cfg).select().single();
    if (error) throw new Error(getErrorMessage(error));
    return data;
  }

  static async deleteConfig(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('billing_refund_flow_configs').delete().eq('id', id);
    if (error) throw new Error(getErrorMessage(error));
  }

  static async getMyCapabilities(institutionId: string): Promise<{ configured: boolean; can_initiate: boolean }> {
    const { data, error } = await (this.supabase as any)
      .rpc('fn_my_refund_capabilities', { p_institution_id: institutionId });
    if (error) throw new Error(getErrorMessage(error));
    return data ?? { configured: false, can_initiate: false };
  }

  // Eligible = unrefunded paid money > 0. Computed client-side from bills +
  // receipt items + active request holds (single round-trip each).
  static async getEligibleBills(studentId: string): Promise<EligibleRefundBill[]> {
    const { data: bills, error } = await (this.supabase as any)
      .from('billing_student_bills')
      .select('id, bill_description, refunded_amount, receipt_items:billing_receipt_items(amount_paid)')
      .eq('student_id', studentId);
    if (error) throw new Error(getErrorMessage(error));

    const billIds = (bills ?? []).map((b: any) => b.id);
    let holds: Record<string, number> = {};
    if (billIds.length > 0) {
      const { data: holdRows, error: holdErr } = await (this.supabase as any)
        .from('billing_refund_request_bills')
        .select('bill_id, refund_amount, request:billing_refund_requests(status)')
        .in('bill_id', billIds);
      if (holdErr) throw new Error(getErrorMessage(holdErr));
      for (const h of holdRows ?? []) {
        if (['pending_review', 'pending_disbursement'].includes(h.request?.status)) {
          holds[h.bill_id] = (holds[h.bill_id] ?? 0) + Number(h.refund_amount);
        }
      }
    }
    return (bills ?? [])
      .map((b: any) => {
        const paid = (b.receipt_items ?? []).reduce((s: number, i: any) => s + Number(i.amount_paid ?? 0), 0);
        const refunded = Number(b.refunded_amount ?? 0);
        const held = holds[b.id] ?? 0;
        return {
          bill_id: b.id, bill_description: b.bill_description ?? '',
          paid_amount: paid, refunded_amount: refunded, held_amount: held,
          refundable: Math.max(0, paid - refunded - held)
        };
      })
      .filter((b: EligibleRefundBill) => b.refundable > 0);
  }

  static async initiate(input: InitiateRefundInput): Promise<string> {
    const { data, error } = await (this.supabase as any).rpc('fn_initiate_refund_request', {
      p_student_id: input.student_id,
      p_refund_type: input.refund_type,
      p_bills: input.bills,
      p_notes: input.notes,
      p_attachments: input.attachments
    });
    if (error) throw new Error(getErrorMessage(error));
    return data as string;
  }

  static async act(requestId: string, action: 'approve' | 'decline',
    opts: { notes?: string; attachments?: RefundAttachment[]; reason?: string }): Promise<void> {
    const { error } = await (this.supabase as any).rpc('fn_act_on_refund_request', {
      p_request_id: requestId, p_action: action,
      p_notes: opts.notes ?? null, p_attachments: opts.attachments ?? [], p_reason: opts.reason ?? null
    });
    if (error) throw new Error(getErrorMessage(error));
  }

  static async disburse(requestId: string, opts: {
    paymentMode: string; paymentDetails: Record<string, unknown>;
    notes: string; attachments?: RefundAttachment[];
  }): Promise<void> {
    const { error } = await (this.supabase as any).rpc('fn_disburse_refund_request', {
      p_request_id: requestId, p_payment_mode: opts.paymentMode,
      p_payment_details: opts.paymentDetails, p_notes: opts.notes,
      p_attachments: opts.attachments ?? []
    });
    if (error) throw new Error(getErrorMessage(error));
  }

  static async getRequest(id: string): Promise<RefundRequest> {
    const { data, error } = await (this.supabase as any)
      .from('billing_refund_requests').select(REQUEST_SELECT).eq('id', id).single();
    if (error) throw new Error(getErrorMessage(error));
    return data;
  }

  static async getRequests(filters: RefundRequestFilters = {}) {
    let q = (this.supabase as any).from('billing_refund_requests')
      .select(REQUEST_SELECT, { count: 'exact' });
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.refund_type) q = q.eq('refund_type', filters.refund_type);
    if (filters.institution_id) q = q.eq('institution_id', filters.institution_id);
    if (filters.search) q = q.ilike('request_number', `%${filters.search}%`);
    if (filters.date_from) q = q.gte('initiated_at', filters.date_from);
    if (filters.date_to) q = q.lte('initiated_at', filters.date_to);
    const page = filters.page ?? 1, limit = filters.limit ?? 10;
    q = q.order('initiated_at', { ascending: false }).range((page - 1) * limit, page * limit - 1);
    const { data, count, error } = await q;
    if (error) throw new Error(getErrorMessage(error));
    return {
      data: (data ?? []) as RefundRequest[],
      metadata: { total: count ?? 0, page, limit, totalPages: count ? Math.ceil(count / limit) : 0 }
    };
  }
}
```

- [ ] **Step 3: `hooks/billing/use-refund-workflow.ts`** (complete file):

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { RefundWorkflowService } from '@/lib/services/billing/refunds/refund-workflow-service';
import type { InitiateRefundInput, RefundAttachment, RefundRequestFilters } from '@/types/billing-refund-workflow';

export const refundWorkflowKeys = {
  requests: (f?: RefundRequestFilters) => ['refund-requests', f ?? {}] as const,
  request: (id: string) => ['refund-request', id] as const,
  configs: ['refund-flow-configs'] as const,
  capabilities: (inst: string) => ['refund-capabilities', inst] as const,
  eligibleBills: (sid: string) => ['refund-eligible-bills', sid] as const
};

export function useRefundFlowConfigs() {
  return useQuery({ queryKey: refundWorkflowKeys.configs, queryFn: () => RefundWorkflowService.getConfigs() });
}

export function useSaveRefundFlowConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: RefundWorkflowService.saveConfig.bind(RefundWorkflowService),
    onSuccess: () => { qc.invalidateQueries({ queryKey: refundWorkflowKeys.configs }); toast.success('Flow saved'); },
    onError: (e: Error) => toast.error(e.message)
  });
}

export function useDeleteRefundFlowConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => RefundWorkflowService.deleteConfig(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: refundWorkflowKeys.configs }); toast.success('Flow deleted'); },
    onError: (e: Error) => toast.error(e.message)
  });
}

export function useRefundCapabilities(institutionId?: string) {
  return useQuery({
    queryKey: refundWorkflowKeys.capabilities(institutionId ?? ''),
    queryFn: () => RefundWorkflowService.getMyCapabilities(institutionId!),
    enabled: !!institutionId
  });
}

export function useEligibleRefundBills(studentId?: string) {
  return useQuery({
    queryKey: refundWorkflowKeys.eligibleBills(studentId ?? ''),
    queryFn: () => RefundWorkflowService.getEligibleBills(studentId!),
    enabled: !!studentId
  });
}

export function useRefundRequest(id?: string) {
  return useQuery({
    queryKey: refundWorkflowKeys.request(id ?? ''),
    queryFn: () => RefundWorkflowService.getRequest(id!),
    enabled: !!id
  });
}

function invalidateRefundData(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['refund-requests'] });
  qc.invalidateQueries({ queryKey: ['refund-request'] });
  qc.invalidateQueries({ queryKey: ['refund-eligible-bills'] });
  qc.invalidateQueries({ queryKey: ['student-bills'] });
}

export function useInitiateRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InitiateRefundInput) => RefundWorkflowService.initiate(input),
    onSuccess: () => { invalidateRefundData(qc); toast.success('Refund request initiated'); },
    onError: (e: Error) => toast.error(e.message)
  });
}

export function useActOnRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { requestId: string; action: 'approve' | 'decline'; notes?: string; attachments?: RefundAttachment[]; reason?: string }) =>
      RefundWorkflowService.act(v.requestId, v.action, v),
    onSuccess: (_d, v) => {
      invalidateRefundData(qc);
      toast.success(v.action === 'approve' ? 'Approved and forwarded' : 'Request declined');
    },
    onError: (e: Error) => toast.error(e.message)
  });
}

export function useDisburseRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { requestId: string; paymentMode: string; paymentDetails: Record<string, unknown>; notes: string; attachments?: RefundAttachment[] }) =>
      RefundWorkflowService.disburse(v.requestId, v),
    onSuccess: () => { invalidateRefundData(qc); toast.success('Refund disbursed'); },
    onError: (e: Error) => toast.error(e.message)
  });
}
```

- [ ] **Step 4: Regenerate `types/supabase.ts`** via `mcp__supabase__generate_typescript_types`; run `mcp__ide__getDiagnostics` on the three new files → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add types/ lib/services/billing/refunds/refund-workflow-service.ts hooks/billing/use-refund-workflow.ts
git commit -m "feat(billing): refund workflow types, service, hooks"
```

---

### Task 5: Drive attachment upload — lib function + API route

**Files:**
- Modify: `lib/google/drive-upload.ts` (append function; follow `uploadParentPortalAttachment` at lines 129–182)
- Create: `app/api/billing/refunds/attachments/route.ts` (follow `app/api/procurement/quotations/upload/route.ts` shape — read that file first for the auth wrapper convention)

**Interfaces:**
- Produces: `uploadRefundAttachment(opts: { institutionName: string; requestRef: string; file: File }): Promise<{ name: string; driveFileId: string; url: string }>`; `POST /api/billing/refunds/attachments` (multipart: `file`, `institutionName`, `requestRef`) → `{ name, drive_file_id, drive_url, mime, size }` — matches `RefundAttachment`.

- [ ] **Step 1: Append to `lib/google/drive-upload.ts`:**

```ts
export interface RefundAttachmentUploadOptions {
  institutionName: string;
  requestRef: string; // request_number, or 'draft-<studentId>' before initiation
  file: File;
}

/** Upload a refund supporting document to <ROOT>/Billing Refunds/<Institution>/<RequestRef>. */
export async function uploadRefundAttachment(
  opts: RefundAttachmentUploadOptions
): Promise<{ name: string; driveFileId: string; url: string }> {
  if (!isDriveConfigured()) throw new Error('Google Drive is not configured.');
  const drive = createDriveClient();
  const folderId = await ensureFolderPath(drive, ['Billing Refunds', opts.institutionName, opts.requestRef]);
  const buffer = Buffer.from(await opts.file.arrayBuffer());
  const safeName = (opts.file.name || 'file').replace(/[\r\n]/g, ' ').slice(0, 200);
  const storedName = `${Date.now()}-${safeName}`;
  const created = await drive.files.create({
    requestBody: { name: storedName, parents: [folderId] },
    media: { mimeType: opts.file.type || 'application/octet-stream', body: Readable.from(buffer) },
    fields: 'id, webViewLink',
    supportsAllDrives: true
  });
  const fileId = created.data.id;
  if (!fileId) throw new Error('Drive upload returned no file id.');
  await drive.permissions.create({
    fileId, requestBody: { role: 'reader', type: 'anyone' }, supportsAllDrives: true
  });
  return { name: opts.file.name || storedName, driveFileId: fileId,
           url: created.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view` };
}
```

- [ ] **Step 2: `app/api/billing/refunds/attachments/route.ts`** — copy the auth/formData handling shape from `app/api/procurement/quotations/upload/route.ts` (same `withAuth`/`createClient` + auth check pattern that file uses), body:

```ts
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { uploadRefundAttachment } from '@/lib/google/drive-upload';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const form = await request.formData();
  const file = form.get('file') as File | null;
  const institutionName = (form.get('institutionName') as string) || 'Unknown Institution';
  const requestRef = (form.get('requestRef') as string) || 'general';
  if (!file) return NextResponse.json({ error: 'file_required' }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'file_too_large_10mb' }, { status: 400 });

  try {
    const uploaded = await uploadRefundAttachment({ institutionName, requestRef, file });
    return NextResponse.json({
      name: uploaded.name, drive_file_id: uploaded.driveFileId, drive_url: uploaded.url,
      mime: file.type, size: file.size
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'upload_failed' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Diagnostics on both files → 0 errors. Commit**

```bash
git add lib/google/drive-upload.ts app/api/billing/refunds/attachments/route.ts
git commit -m "feat(billing): refund attachment Drive upload route"
```

---

### Task 6: Shared attachment-upload client component

**Files:**
- Create: `components/billing/refund-attachments-field.tsx`

**Interfaces:**
- Produces: `<RefundAttachmentsField value={RefundAttachment[]} onChange={(a: RefundAttachment[]) => void} institutionName={string} requestRef={string} />` — used by initiation dialog (Task 7), action panel + disburse form (Task 9).

- [ ] **Step 1: Component** (complete file):

```tsx
'use client';

import { useRef, useState } from 'react';
import { Paperclip, X, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'react-hot-toast';
import type { RefundAttachment } from '@/types/billing-refund-workflow';

interface Props {
  value: RefundAttachment[];
  onChange: (attachments: RefundAttachment[]) => void;
  institutionName: string;
  requestRef: string;
}

export function RefundAttachmentsField({ value, onChange, institutionName, requestRef }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded: RefundAttachment[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        form.append('institutionName', institutionName);
        form.append('requestRef', requestRef);
        const res = await fetch('/api/billing/refunds/attachments', { method: 'POST', body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Upload failed: ${file.name}`);
        uploaded.push(json);
      }
      onChange([...value, ...uploaded]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className='space-y-2'>
      <input ref={inputRef} type='file' multiple className='hidden'
        onChange={(e) => handleFiles(e.target.files)} />
      <Button type='button' variant='outline' size='sm' disabled={uploading}
        onClick={() => inputRef.current?.click()}>
        {uploading ? <Loader2 className='h-4 w-4 mr-2 animate-spin' /> : <Paperclip className='h-4 w-4 mr-2' />}
        {uploading ? 'Uploading…' : 'Attach files'}
      </Button>
      {value.length > 0 && (
        <ul className='space-y-1'>
          {value.map((a, i) => (
            <li key={a.drive_file_id} className='flex items-center gap-2 text-sm'>
              <FileText className='h-3.5 w-3.5 text-muted-foreground' />
              <a href={a.drive_url} target='_blank' rel='noreferrer' className='underline truncate max-w-[260px]'>{a.name}</a>
              <button type='button' onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <X className='h-3.5 w-3.5 text-muted-foreground hover:text-destructive' />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Diagnostics → 0 errors. Commit:** `git add components/billing/refund-attachments-field.tsx && git commit -m "feat(billing): shared refund attachments upload field"`

---

### Task 7: Initiation UI on the student schedule page

**Files:**
- Create: `app/(routes)/billing/schedule/students/[id]/_components/refund-initiate-dialog.tsx`
- Modify: `app/(routes)/billing/schedule/students/[id]/page.tsx` — render the dialog trigger near the page header actions; pass `studentId`, `institutionId`, `institutionName` (all available from the page's existing student query — READ the page first and reuse its data source)

**Interfaces:**
- Consumes: `useRefundCapabilities`, `useEligibleRefundBills`, `useInitiateRefund` (Task 4); `RefundAttachmentsField` (Task 6).
- Produces: `<RefundInitiateDialog studentId institutionId institutionName studentName />`.

- [ ] **Step 1: Dialog component** (complete file):

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Undo, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import { toast } from 'react-hot-toast';
import {
  useRefundCapabilities, useEligibleRefundBills, useInitiateRefund
} from '@/hooks/billing/use-refund-workflow';
import { RefundAttachmentsField } from '@/components/billing/refund-attachments-field';
import type { RefundAttachment, RefundType } from '@/types/billing-refund-workflow';

interface Props {
  studentId: string;
  institutionId: string;
  institutionName: string;
  studentName: string;
}

export function RefundInitiateDialog({ studentId, institutionId, institutionName, studentName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [refundType, setRefundType] = useState<RefundType>('adjustment');
  const [selected, setSelected] = useState<Record<string, number>>({}); // bill_id -> amount
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<RefundAttachment[]>([]);

  const { data: caps } = useRefundCapabilities(institutionId);
  const { data: bills = [], isLoading } = useEligibleRefundBills(open ? studentId : undefined);
  const initiate = useInitiateRefund();

  const total = useMemo(
    () => Object.values(selected).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0),
    [selected]
  );

  if (!caps?.configured || !caps.can_initiate) return null;

  const toggleBill = (billId: string, refundable: number, checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) next[billId] = refundable; else delete next[billId];
      return next;
    });
  };

  const handleSubmit = async () => {
    const lines = Object.entries(selected).map(([bill_id, refund_amount]) => ({ bill_id, refund_amount }));
    if (lines.length === 0) return toast.error('Select at least one bill');
    for (const l of lines) {
      const b = bills.find((x) => x.bill_id === l.bill_id);
      if (!b || l.refund_amount <= 0 || l.refund_amount > b.refundable) {
        return toast.error('Refund amount exceeds refundable for a selected bill');
      }
    }
    if (!notes.trim()) return toast.error('Notes are required');
    const requestId = await initiate.mutateAsync({
      student_id: studentId, refund_type: refundType, bills: lines, notes, attachments
    });
    setOpen(false);
    router.push(`/billing/refunds/${requestId}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline'><Undo className='h-4 w-4 mr-2' />Initiate Refund</Button>
      </DialogTrigger>
      <DialogContent className='max-w-2xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Initiate Refund — {studentName}</DialogTitle>
          <DialogDescription>Select paid bills and amounts. The request enters the approval workflow.</DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label>Refund Type *</Label>
            <RadioGroup value={refundType} onValueChange={(v) => setRefundType(v as RefundType)} className='flex gap-6'>
              <label className='flex items-center gap-2 text-sm'><RadioGroupItem value='adjustment' />Adjustment (overpayment/correction)</label>
              <label className='flex items-center gap-2 text-sm'><RadioGroupItem value='withdrawal' />Withdrawal (student leaving)</label>
            </RadioGroup>
            {refundType === 'withdrawal' && (
              <div className='flex items-start gap-2 p-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 rounded-md text-sm text-orange-700 dark:text-orange-300'>
                <AlertTriangle className='h-4 w-4 mt-0.5 shrink-0' />
                The learner will be marked <b>Withdrawal Pending</b> immediately and the seat is released.
                If the request is declined, their previous status is restored.
              </div>
            )}
          </div>

          <div className='space-y-2'>
            <Label>Paid Bills *</Label>
            {isLoading ? <p className='text-sm text-muted-foreground'>Loading bills…</p> :
             bills.length === 0 ? <p className='text-sm text-muted-foreground'>No refundable bills.</p> : (
              <div className='rounded-md border divide-y'>
                {bills.map((b) => (
                  <div key={b.bill_id} className='flex items-center gap-3 p-3'>
                    <Checkbox checked={b.bill_id in selected}
                      onCheckedChange={(c) => toggleBill(b.bill_id, b.refundable, c === true)} />
                    <div className='flex-1 min-w-0'>
                      <p className='text-sm font-medium truncate'>{b.bill_description || 'Bill'}</p>
                      <p className='text-xs text-muted-foreground'>
                        Paid ₹{b.paid_amount.toLocaleString('en-IN')} · Refundable ₹{b.refundable.toLocaleString('en-IN')}
                        {b.held_amount > 0 && ` · ₹${b.held_amount.toLocaleString('en-IN')} held in another request`}
                      </p>
                    </div>
                    {b.bill_id in selected && (
                      <Input type='number' className='w-32' min={1} max={b.refundable}
                        value={selected[b.bill_id]}
                        onChange={(e) => setSelected((p) => ({ ...p, [b.bill_id]: parseFloat(e.target.value) || 0 }))} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className='space-y-2'>
            <Label>Notes *</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder='Reason and context for this refund request' />
          </div>

          <div className='space-y-2'>
            <Label>Supporting Documents</Label>
            <RefundAttachmentsField value={attachments} onChange={setAttachments}
              institutionName={institutionName} requestRef={`draft-${studentId}`} />
          </div>

          <div className='flex items-center justify-between pt-2 border-t'>
            <p className='text-sm font-semibold'>Total refund: ₹{total.toLocaleString('en-IN')}</p>
            <div className='flex gap-2'>
              <Button variant='outline' onClick={() => setOpen(false)} disabled={initiate.isPending}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={initiate.isPending || total <= 0}>
                {initiate.isPending ? 'Submitting…' : 'Submit Request'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire into the page** — read `app/(routes)/billing/schedule/students/[id]/page.tsx`, add `<RefundInitiateDialog …/>` beside the existing header action buttons, sourcing `studentId/institutionId/institutionName/studentName` from the page's already-fetched student data (do NOT add a duplicate profile fetch).

- [ ] **Step 3: Diagnostics on both files → 0 errors. Commit:** `git commit -am "feat(billing): refund initiation dialog on student schedule page"`

---

### Task 8: Settings page — flow config list + editor

**Files:**
- Create: `app/(routes)/billing/settings/refund-approvals/page.tsx` (thin server wrapper: ContentLayout + breadcrumb + client component)
- Create: `app/(routes)/billing/settings/refund-approvals/_components/flow-configs-client.tsx` (list + editor)
- Modify: `lib/sidebarMenuLink.ts` — add `'/billing/settings/refund-approvals': 'billing.refunds.configure'` next to the other `/billing/*` entries (~line 522) and add the sidebar menu item in the billing section of the menu structure (find the billing children array in the same file / `MODULES` source and append `{ label: 'Refund Approvals', href: '/billing/settings/refund-approvals' }` following the existing entry shape)

**Interfaces:**
- Consumes: `useRefundFlowConfigs`, `useSaveRefundFlowConfig`, `useDeleteRefundFlowConfig` (Task 4); `useInstitutionsWithAccess` (existing hook) for the institution dropdown; role list via `custom_roles` select + `fn_role_user_counts()` RPC for holder counts; user picker via existing profile-search pattern (grep `MemberDirectoryPicker` or the staff-picker used in service-request approver builder and reuse it).

- [ ] **Step 1: Page + client component.** The client component renders: a table of configs (`name`, scope = institution name or "Global Default", stage count, active toggle, Edit/Delete), and an editor dialog with: name input; institution select (`null` = Global Default); three assignee sections (Initiators, Stages, Disbursers). Each stage row: name input, role multi-select (from `custom_roles` where `is_active`, labels suffixed with holder count from `fn_role_user_counts()`), user multi-select, up/down reorder + remove buttons; "Add stage" appends `{ key: crypto.randomUUID(), name: '', assignee_roles: [], assignee_users: [] }`. Save validation before mutate: ≥1 stage; every stage has a name and ≥1 role or user; initiators and disbursers each have ≥1 role or user. On save call `useSaveRefundFlowConfig().mutate(config)`. Complete implementation follows the list-first layout of `app/(routes)/hr/admin/recruitment-approval-flows` (read `flow-builder-client.tsx` + `flow-editor.tsx` there and mirror the structure with the refund fields above).

- [ ] **Step 2: Register route permission + sidebar entry** as listed in Files.

- [ ] **Step 3: Verify:** diagnostics → 0 errors; `npm run check:menus` and `npm run check:reachability` pass; browser: create a Global Default config with stages "Chief Accountant Verification" → "MD Approval", initiators = Admission Officer + Chief Accountant roles, disbursers = Accounts role; confirm the row appears and `SELECT * FROM billing_refund_flow_configs;` shows it.

- [ ] **Step 4: Commit:** `git commit -am "feat(billing): refund approval flow settings page"`

---

### Task 9: Refund Requests module — list page rebuild

**Files:**
- Create: `app/(routes)/billing/refunds/_data/get-refund-requests.ts` (server fetch, replaces `get-refunds.ts`)
- Rewrite: `app/(routes)/billing/refunds/page.tsx`
- Create: `app/(routes)/billing/refunds/_components/requests-table-server.tsx`, `requests-filters-client.tsx` (adapt the existing `refunds-filters-client.tsx` / `refunds-pagination-client.tsx` URL-param pattern — keep pagination client as-is)
- Delete (in Task 12, not here): old table/list components

**Interfaces:**
- Consumes: table `billing_refund_requests` via server `createClient` (same embed select as `REQUEST_SELECT` in Task 4 but without actions).
- Produces: `getRefundRequests(filters): Promise<{data, metadata}>` (same filter param names as `RefundRequestFilters`).

- [ ] **Step 1: `get-refund-requests.ts`** — copy the structure of the existing `_data/get-refunds.ts` (server `createClient`, count exact, range pagination) but query `billing_refund_requests` with embeds `student:learners_profiles(id, first_name, last_name, roll_number, lifecycle_status)` and filters `status / refund_type / institution_id / search→request_number ilike / date range on initiated_at`, default sort `initiated_at desc`.

- [ ] **Step 2: Rewrite `page.tsx`** — keep the ContentLayout/breadcrumb/summary-card skeleton of the current page but: cards = Total Requests (metadata.total), Pending Review, Pending Disbursement, Disbursed Amount (compute Pending counts via two extra cheap `count`-only queries in `get-refund-requests.ts`, NOT from the current page slice — the current page's "current page only" stats were a defect); status tabs as links setting `?status=`; table columns: Request #, Student, Type (withdrawal badge orange / adjustment gray), Amount, Status badge, Current Stage (from `flow_snapshot.stages[current_stage_index].name` when `pending_review`, else '—'), Initiated date, View action → `/billing/refunds/[id]`. Remove the dead Policies/Bulk buttons and the New button (initiation now lives on the student page).

- [ ] **Step 3: Verify** — diagnostics; browser: list renders, tabs filter, pagination works. **Commit:** `git commit -am "feat(billing): refund requests list page"`

---

### Task 10: Refund request detail page — timeline + stage actions + disbursement

**Files:**
- Rewrite: `app/(routes)/billing/refunds/[id]/page.tsx` (thin wrapper) + Create `_components/request-detail-client.tsx`, `_components/request-timeline.tsx`, `_components/stage-action-panel.tsx`, `_components/disburse-form.tsx`
- Delete (Task 12): `[id]/edit/page.tsx` (requests are not editable after initiation)

**Interfaces:**
- Consumes: `useRefundRequest(id)`, `useActOnRefund()`, `useDisburseRefund()`, `useAuth()` (`user.id`, `isSuperAdmin`), `RefundAttachmentsField`.
- Produces: detail route rendering per spec §5.2.

- [ ] **Step 1: `request-detail-client.tsx`** — layout: header (request number, status badge, type badge + withdrawal banner "Seat released — learner marked Withdrawal Pending; will be Exited on disbursement"); learner card (name, roll number, current lifecycle_status, link to `/billing/schedule/students/[student_id]`); bills table (description, paid snapshot, refund amount; footer total); `<RequestTimeline actions={request.actions}/>`; decline card when declined (stage, by, reason); disbursement card when disbursed (mode, details, by, at); then the action area:

```tsx
// Inside request-detail-client.tsx — deciding which action UI to show.
// Mirrors RPC gating so the UI never offers an action the RPC would reject:
// current-stage assignee (pinned user OR role holder) or super admin.
const myUserId = user?.id;
const stage = request.status === 'pending_review'
  ? request.flow_snapshot.stages[request.current_stage_index] : null;
const [roleIds, setRoleIds] = useState<string[]>([]);
useEffect(() => {           // one fetch of my role ids for assignee matching
  if (!myUserId) return;
  createClientSupabaseClient().from('user_roles').select('role_id').eq('user_id', myUserId)
    .then(({ data }) => setRoleIds((data ?? []).map((r: any) => String(r.role_id))));
}, [myUserId]);
const matches = (a?: { assignee_roles: string[]; assignee_users: string[] }) =>
  !!a && !!myUserId && (a.assignee_users.includes(myUserId) || a.assignee_roles.some((r) => roleIds.includes(r)));
const canActOnStage = isSuperAdmin || matches(stage ?? undefined);
const canDisburse = request.status === 'pending_disbursement' && (isSuperAdmin || matches(request.flow_snapshot.disburser));
```
Render `<StageActionPanel/>` when `stage && canActOnStage`, `<DisburseForm/>` when `canDisburse`.

- [ ] **Step 2: `request-timeline.tsx`** — vertical timeline over `actions` sorted by `created_at`: icon per `action_type` (initiated=Undo, approved=Check green, declined=X red, disbursed=Banknote), stage name, actor `full_name` (+ role), relative + absolute time, notes paragraph, attachment links list. Pending future stages rendered grayed from `flow_snapshot.stages.slice(current_stage_index)` when `pending_review` (plus a gray "Disbursement" tail node unless disbursed/declined).

- [ ] **Step 3: `stage-action-panel.tsx`** — card titled with the stage name: required notes textarea, `RefundAttachmentsField` (requestRef = request_number), Approve button → `useActOnRefund().mutate({requestId, action:'approve', notes, attachments})`; Decline button opens an AlertDialog requiring a reason textarea → `mutate({requestId, action:'decline', reason, notes, attachments})`. Disable buttons while pending.

- [ ] **Step 4: `disburse-form.tsx`** — payment mode Select over `['cash','online','bank_transfer','dd','cheque']`, dynamic detail inputs (reference number text input always; bank name + account fields when `bank_transfer`; cheque/DD number when those modes) collected into `payment_details` object, required notes, attachments field, Submit → `useDisburseRefund().mutate(...)`; shows the PDF export button (Task 11) so accounts can export before/after submitting.

- [ ] **Step 5: Verify** — diagnostics all files; browser end-to-end (needs Task 8 config): initiate → approve as verifier → approve as MD → disburse as accounts; between each step confirm the timeline grows and status/stage advance; decline path on a second request restores learner status (`SELECT lifecycle_status FROM learners_profiles WHERE id='…';`). **Commit:** `git commit -am "feat(billing): refund request detail — timeline, stage actions, disbursement"`

---

### Task 11: PDF export

**Files:**
- Create: `lib/utils/billing/refund-request-pdf.ts`
- Modify: `_components/request-detail-client.tsx` — "Export PDF" button in the header

**Interfaces:**
- Produces: `generateRefundRequestPdf(request: RefundRequest): void` (client-side download, jsPDF — read `lib/utils/billing/receipt-pdf.ts` first and reuse its fonts/layout helpers and export style).

- [ ] **Step 1:** Implement sections in order: title (request number + status), learner block (name, roll no, institution), request block (type, initiated by/at, total), bills table (description / paid / refund amount / total row), approval trail (one block per action: `[stage_name] action_type by actor (role) at timestamp`, notes as wrapped paragraph, attachment names + URLs as plain text), disbursement block (mode, details key/values, by, at) when disbursed. Use the same jsPDF import style, page-margin constants, and `doc.save(\`${request.request_number}.pdf\`)` convention as `receipt-pdf.ts`.
- [ ] **Step 2:** Wire button; verify in browser: exported PDF contains all stages' notes. **Commit:** `git commit -am "feat(billing): refund request PDF export"`

---

### Task 12: Schedule page refund visibility + summary totals

**Files:**
- Modify: `app/(routes)/billing/schedule/students/[id]/_components/student-bills-table.tsx` — add a "Refunded" indicator: when `bill.refund_status` is set, render a badge (`refunded` = red outline "Refunded ₹X", `partially_refunded` = orange "Partially Refunded ₹X") next to the status badge, reading `refunded_amount`
- Modify: `app/(routes)/billing/schedule/students/[id]/page.tsx` (or its summary component — locate where totals are computed) — subtract `refunded_amount` in the "net collected" figure and add a "Refunded" stat line when any bill has `refunded_amount > 0`
- Create: `app/(routes)/billing/schedule/students/[id]/_components/student-refund-history.tsx` — small card listing this student's refund requests (`request_number`, type, status, amount, link to detail), from `RefundWorkflowService.getRequests`-style query filtered by `student_id` (add `student_id?: string` to `RefundRequestFilters` and `.eq('student_id', …)` in the service — one-line addition each)

- [ ] **Step 1:** Implement the three changes. The bills-table select must include the new columns — find its data fetch and add `refunded_amount, refund_status` to the select string.
- [ ] **Step 2:** Verify in browser after a disbursed refund: badge appears, totals reduce, history card lists the request. Diagnostics → 0 errors. **Commit:** `git commit -am "feat(billing): refund state on student schedule page"`

---

### Task 13: Old module retirement

**Files:**
- Delete: `app/(routes)/billing/refunds/new/page.tsx`, `app/(routes)/billing/refunds/[id]/edit/page.tsx`, `app/(routes)/billing/refunds/_components/refund-list.tsx`, `refund-filters.tsx`, `refunds-table-server.tsx` (superseded in Task 9), `app/(routes)/billing/refunds/_data/get-refunds.ts`, `app/(routes)/billing/_actions/refund-actions.ts`, `app/api/billing/refunds/[id]/gateway-refund/route.ts`, `hooks/billing/use-billing-refunds.ts`, `lib/services/billing/refunds/billing-refund-service.ts`, `app/(routes)/billing/receipts/[id]/_components/receipt-refund-dialog.tsx`
- Modify: `app/(routes)/billing/receipts/[id]/page.tsx` (or wherever `ReceiptRefundDialog` is imported — grep `receipt-refund-dialog` and remove import + usage), `lib/sidebarMenuLink.ts` (remove `/billing/refunds/new` + `/billing/refunds/[id]/edit` route-permission entries), `app/(routes)/billing/reports/_components/refund-report-tab.tsx` (repoint to `billing_refund_requests`; add a collapsed "Legacy refunds" table reading the old `billing_refunds` rows read-only)

- [ ] **Step 1:** Grep for every import of each deleted file (`grep -rn "use-billing-refunds\|billing-refund-service\|receipt-refund-dialog\|refund-actions" app hooks lib components`) and remove usages before deleting. Delete the files.
- [ ] **Step 2:** Update the reports tab: primary table = refund requests (number, student, type, status, amount, disbursed date); legacy section = old `billing_refunds` (receipt number, amount, approval_status, date) behind a Collapsible.
- [ ] **Step 3:** Verify: diagnostics repo-wide on touched files; `npm run check:menus`, `npm run check:reachability`, `npm run gen:routes` all pass; grep confirms zero remaining references. **Commit:** `git commit -am "refactor(billing): retire legacy receipt-based refund module"`

---

### Task 14: End-to-end verification + PR

- [ ] **Step 1: Full browser walkthrough** (spec §9) with a **non-super-admin** user at each stage:
  1. Settings: pipeline configured (Task 8 Step 3 data).
  2. As Admission Officer: student schedule page → select 2 paid bills → withdrawal type → notes + 2 files → submit. Verify: request created (`pending_review`), learner `lifecycle_status='withdrawal_pending'` (SQL), **Seat Analytics filled count dropped by 1** for that program (Group Dashboard → Seat Analytics), bills show held amounts on re-open of dialog.
  3. As Chief Accountant: detail page → notes → Approve. Timeline shows stage 1 approved.
  4. As MD: Approve → status `pending_disbursement`. (On a second throwaway request: Decline with reason → learner restored to previous status, seat count restored.)
  5. As Accounts: Export PDF (verify trail complete) → payment mode `bank_transfer` + reference + notes → Submit. Verify: request `disbursed`; bills `refund_status`/`refunded_amount` set and **status unchanged** (never reopened); schedule page shows badges + history; learner `exited`; `student_billing_summary` refreshed.
  6. Permission negatives: a user outside all assignee lists sees no Initiate button and gets `not_current_stage_assignee` if calling the RPC; a plain staff user without `billing.refunds.view` cannot list requests.
- [ ] **Step 2: Gates:** `npm run check:menus`, `npm run check:reachability` green; `mcp__ide__getDiagnostics` clean on every file in `git diff --name-only main`.
- [ ] **Step 3: PR**

```bash
git push -u origin feat/refund-approval-workflow
gh pr create --title "feat(billing): multi-stage refund approval workflow" --body "Implements docs/superpowers/specs/2026-07-11-refund-approval-workflow-design.md

- Dynamic approval pipeline (frozen snapshot per request), settings page
- Bill-based initiation from student schedule page, Drive attachments
- Withdrawal seat release at initiation (withdrawal_pending), exit on disbursement
- Bills marked refunded (never reopened); legacy refund module retired

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
