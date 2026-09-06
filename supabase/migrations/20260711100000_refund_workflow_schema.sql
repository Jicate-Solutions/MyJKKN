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
