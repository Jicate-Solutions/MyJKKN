-- SOLUTION DEPARTMENT TRACKER
-- Created: 2026-02-09
-- Purpose: Track 44 designated JKKN Solution Departments performance,
--          revenue, targets, and lifecycle status management
-- =====================================================

-- =====================================================
-- TABLE 1: sh_solution_types (replaces fixed enum with CRUD)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.sh_solution_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT DEFAULT 'box',
    color TEXT DEFAULT '#6366f1',
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.sh_solution_types IS 'CRUD-managed solution types replacing fixed sh_solution_type enum';

-- =====================================================
-- TABLE 2: sh_solution_departments
-- =====================================================
CREATE TABLE IF NOT EXISTS public.sh_solution_departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending_approval', 'active', 'at_risk', 'dormant')),
    activated_at TIMESTAMPTZ DEFAULT now(),
    dormant_at TIMESTAMPTZ,
    last_revenue_at TIMESTAMPTZ,
    nominated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    capabilities TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_solution_department UNIQUE (department_id)
);

COMMENT ON TABLE public.sh_solution_departments IS 'Tracks which departments are activated as solution departments (44 designated)';

-- =====================================================
-- TABLE 3: sh_department_status_history
-- =====================================================
CREATE TABLE IF NOT EXISTS public.sh_department_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_department_id UUID NOT NULL REFERENCES public.sh_solution_departments(id) ON DELETE CASCADE,
    previous_status TEXT,
    new_status TEXT NOT NULL CHECK (new_status IN ('pending_approval', 'active', 'at_risk', 'dormant')),
    reason TEXT,
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.sh_department_status_history IS 'Audit trail of all department status transitions';

-- =====================================================
-- TABLE 4: sh_department_targets
-- =====================================================
CREATE TABLE IF NOT EXISTS public.sh_department_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_department_id UUID NOT NULL REFERENCES public.sh_solution_departments(id) ON DELETE CASCADE,
    quarter TEXT NOT NULL,
    target_revenue NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    set_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_dept_quarter_target UNIQUE (solution_department_id, quarter)
);

COMMENT ON TABLE public.sh_department_targets IS 'Quarterly revenue targets set by HODs';

-- =====================================================
-- MODIFY: sh_solutions - Add solution_type_id FK
-- =====================================================
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sh_solutions' AND column_name = 'solution_type_id'
    ) THEN
        ALTER TABLE public.sh_solutions
        ADD COLUMN solution_type_id UUID REFERENCES public.sh_solution_types(id) ON DELETE SET NULL;
    END IF;
END $$;

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_sh_solution_departments_status ON public.sh_solution_departments(status);
CREATE INDEX IF NOT EXISTS idx_sh_solution_departments_institution ON public.sh_solution_departments(institution_id);
CREATE INDEX IF NOT EXISTS idx_sh_solution_departments_department ON public.sh_solution_departments(department_id);
CREATE INDEX IF NOT EXISTS idx_sh_solution_departments_last_revenue ON public.sh_solution_departments(last_revenue_at);
CREATE INDEX IF NOT EXISTS idx_sh_dept_status_history_dept ON public.sh_department_status_history(solution_department_id);
CREATE INDEX IF NOT EXISTS idx_sh_dept_status_history_date ON public.sh_department_status_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sh_department_targets_dept ON public.sh_department_targets(solution_department_id);
CREATE INDEX IF NOT EXISTS idx_sh_department_targets_quarter ON public.sh_department_targets(quarter);
CREATE INDEX IF NOT EXISTS idx_sh_solution_types_slug ON public.sh_solution_types(slug);
CREATE INDEX IF NOT EXISTS idx_sh_solution_types_active ON public.sh_solution_types(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sh_solutions_type_id ON public.sh_solutions(solution_type_id);

-- =====================================================
-- SEED: 3 Default Solution Types
-- =====================================================
INSERT INTO public.sh_solution_types (name, slug, description, icon, color, is_default, is_active)
VALUES
    ('Software Development', 'software', 'Custom software solutions, web apps, mobile apps', 'code-2', '#3b82f6', true, true),
    ('Training & Workshops', 'training', 'Professional training, bootcamps, certification courses', 'graduation-cap', '#10b981', true, true),
    ('Content Production', 'content', 'Digital content, media production, publications', 'file-text', '#f59e0b', true, true)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- SEED: 44 Solution Departments
-- =====================================================

-- CET: JKKN College of Engineering and Technology (6 departments)
INSERT INTO public.sh_solution_departments (department_id, institution_id, status, activated_at)
VALUES
    ('f88b1171-1753-46b3-b3fb-961ef54feb36', '5de4fba1-4564-41ed-8c73-5d948b74b843', 'active', now()),
    ('4f774da1-39a4-43a9-b7f3-12c62a51bae4', '5de4fba1-4564-41ed-8c73-5d948b74b843', 'active', now()),
    ('57047edf-b70b-4785-b68a-52b8880cad2a', '5de4fba1-4564-41ed-8c73-5d948b74b843', 'active', now()),
    ('5b71a795-f244-4a35-9ad4-a8b8a78139ab', '5de4fba1-4564-41ed-8c73-5d948b74b843', 'active', now()),
    ('e73d1763-7479-4771-9c9e-cdea547d0205', '5de4fba1-4564-41ed-8c73-5d948b74b843', 'active', now()),
    ('4884e33b-9288-4725-93b7-fb841e331d4e', '5de4fba1-4564-41ed-8c73-5d948b74b843', 'active', now())
ON CONFLICT (department_id) DO NOTHING;

-- CAS-SF: JKKN College of Arts and Science - Self Finance (9 departments)
INSERT INTO public.sh_solution_departments (department_id, institution_id, status, activated_at)
VALUES
    ('9179ef1e-a01e-44a3-a5c8-03a4ccdcf079', 'b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'active', now()),
    ('a3700d88-bda2-4e30-8bc4-dfa947986470', 'b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'active', now()),
    ('a0f0e9ff-8fea-44ed-93be-23c606a85475', 'b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'active', now()),
    ('45605294-8226-4944-b970-0326bc65df83', 'b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'active', now()),
    ('05109a9d-ff0e-4e3a-8e5c-16940f1ef00d', 'b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'active', now()),
    ('fad6282e-f72f-4199-a01d-c25341f01bea', 'b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'active', now()),
    ('b60a8199-34a9-470b-990b-b30d07db232c', 'b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'active', now()),
    ('2195b440-5cdf-4b5a-9bfd-8a76be9ac367', 'b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'active', now()),
    ('ebb85d6a-2cc3-4c22-8c16-4843e17aaef9', 'b0b8a724-7c65-4f07-8047-2a38e8100ad5', 'active', now())
ON CONFLICT (department_id) DO NOTHING;

-- DCH: JKKN Dental College and Hospital (9 departments)
INSERT INTO public.sh_solution_departments (department_id, institution_id, status, activated_at)
VALUES
    ('f2fb68f4-7765-47fc-b856-c453f4a27261', 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5', 'active', now()),
    ('cb3d2671-bf60-4518-a2cc-fe3fff747968', 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5', 'active', now()),
    ('53253a91-6159-4931-9322-a8be521022b9', 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5', 'active', now()),
    ('e6dfe63c-ab07-4756-ade8-6de81d032eac', 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5', 'active', now()),
    ('4b6eed8c-8294-449a-881a-b50f5a6d278f', 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5', 'active', now()),
    ('bbc99b4d-cae6-4f83-ba19-168743547480', 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5', 'active', now()),
    ('0094aef3-9c0e-48e3-b855-ddf6f9f0c810', 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5', 'active', now()),
    ('7992dfd9-4854-47e3-b175-21b421af0a4e', 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5', 'active', now()),
    ('31070646-e6ca-478a-9398-bd50b63dfa5a', 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5', 'active', now())
ON CONFLICT (department_id) DO NOTHING;

-- COP: JKKN College of Pharmacy (6 departments)
INSERT INTO public.sh_solution_departments (department_id, institution_id, status, activated_at)
VALUES
    ('d1d2c95d-64be-4bed-99a1-715096e045b1', '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334', 'active', now()),
    ('f0d45e02-bfa4-4d26-b51a-68722271bbcb', '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334', 'active', now()),
    ('5236fee2-f805-48ea-8264-875b49276247', '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334', 'active', now()),
    ('ceb54889-300b-4004-8d03-205ec74bd0f0', '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334', 'active', now()),
    ('fec9c2f1-48da-4129-a7e9-eb5ac5046544', '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334', 'active', now()),
    ('d9bb2196-8a8e-4bd3-9126-421d6d5fb302', '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334', 'active', now())
ON CONFLICT (department_id) DO NOTHING;

-- CNR: JKKN College of Nursing and Research (5 departments)
INSERT INTO public.sh_solution_departments (department_id, institution_id, status, activated_at)
VALUES
    ('10e9a2c3-db64-41c7-b62b-acaee4d89767', '70e54e51-9b98-4e07-9534-a85310609bfd', 'active', now()),
    ('83f64238-3c45-41e3-b97e-f0921e56caac', '70e54e51-9b98-4e07-9534-a85310609bfd', 'active', now()),
    ('a90b9372-6e7a-4772-bd6d-0c528a66fd40', '70e54e51-9b98-4e07-9534-a85310609bfd', 'active', now()),
    ('5d1cce4e-b66a-4e62-81c2-ef592ae4a577', '70e54e51-9b98-4e07-9534-a85310609bfd', 'active', now()),
    ('2b12b2e8-ff71-465c-8eb1-f175f17fb7e6', '70e54e51-9b98-4e07-9534-a85310609bfd', 'active', now())
ON CONFLICT (department_id) DO NOTHING;

-- AHS: JKKN College of Allied Health Sciences (9 departments)
INSERT INTO public.sh_solution_departments (department_id, institution_id, status, activated_at)
VALUES
    ('25569baf-d4f1-4b63-86ca-a7fe93d6d41c', '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'active', now()),
    ('15004676-14cb-40ed-ab7d-54c959a267d8', '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'active', now()),
    ('de80454e-baa8-4e1c-b84c-398d55e922e3', '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'active', now()),
    ('8513756f-1c21-49cd-a6d6-f5db7a688a2f', '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'active', now()),
    ('af3cde18-f686-4caa-b092-a5954ca9f44d', '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'active', now()),
    ('5239a5fd-ca84-4532-ad7e-02fc887eb437', '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'active', now()),
    ('3aab3487-6626-4b51-a973-e7168c431083', '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'active', now()),
    ('61a669cf-53fe-4c90-b4ad-dcf9afb95e1d', '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'active', now()),
    ('fe1a8e47-79d7-4b6a-a519-6a26b25aeb67', '9c1554e8-12a2-4b76-a9d6-8242bb05eba1', 'active', now())
ON CONFLICT (department_id) DO NOTHING;

-- =====================================================
-- SEED: Initial status history for all 44 departments
-- =====================================================
INSERT INTO public.sh_department_status_history (solution_department_id, previous_status, new_status, reason, changed_at)
SELECT
    sd.id,
    NULL,
    'active',
    'Initial activation - designated as Solution Department',
    now()
FROM public.sh_solution_departments sd;

-- =====================================================
-- LINK: Map existing solution types to sh_solution_types
-- =====================================================
UPDATE public.sh_solutions s
SET solution_type_id = st.id
FROM public.sh_solution_types st
WHERE s.solution_type::text = st.slug
  AND s.solution_type_id IS NULL;

-- =====================================================
-- RLS POLICIES
-- =====================================================
ALTER TABLE public.sh_solution_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_department_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_solution_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_department_targets ENABLE ROW LEVEL SECURITY;

-- sh_solution_departments: Read for authenticated users
CREATE POLICY "sh_solution_departments_select" ON public.sh_solution_departments
    FOR SELECT TO authenticated USING (true);

-- sh_solution_departments: Insert/Update for service role and admins
CREATE POLICY "sh_solution_departments_insert" ON public.sh_solution_departments
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "sh_solution_departments_update" ON public.sh_solution_departments
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- sh_department_status_history: Read for all authenticated
CREATE POLICY "sh_dept_status_history_select" ON public.sh_department_status_history
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "sh_dept_status_history_insert" ON public.sh_department_status_history
    FOR INSERT TO authenticated WITH CHECK (true);

-- sh_solution_types: Read for all authenticated
CREATE POLICY "sh_solution_types_select" ON public.sh_solution_types
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "sh_solution_types_insert" ON public.sh_solution_types
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "sh_solution_types_update" ON public.sh_solution_types
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- sh_department_targets: Read for all authenticated
CREATE POLICY "sh_dept_targets_select" ON public.sh_department_targets
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "sh_dept_targets_insert" ON public.sh_department_targets
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "sh_dept_targets_update" ON public.sh_department_targets
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- =====================================================
-- FUNCTION: Calculate department revenue for a period
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_department_revenue(
    p_department_id UUID,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total NUMERIC;
BEGIN
    SELECT COALESCE(SUM(p.amount), 0)
    INTO v_total
    FROM public.sh_payments p
    JOIN public.sh_solutions s ON s.id = p.solution_id
    WHERE s.lead_department_id = p_department_id
      AND p.status = 'received'
      AND (p_start_date IS NULL OR p.payment_date >= p_start_date)
      AND (p_end_date IS NULL OR p.payment_date <= p_end_date);

    RETURN v_total;
END;
$$;

-- =====================================================
-- FUNCTION: Update department status based on revenue
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_department_statuses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_dept RECORD;
    v_new_status TEXT;
    v_months_since_revenue NUMERIC;
BEGIN
    FOR v_dept IN
        SELECT sd.id, sd.status, sd.last_revenue_at, sd.department_id
        FROM public.sh_solution_departments sd
        WHERE sd.status NOT IN ('pending_approval')
    LOOP
        -- Calculate months since last revenue
        IF v_dept.last_revenue_at IS NOT NULL THEN
            v_months_since_revenue := EXTRACT(EPOCH FROM (now() - v_dept.last_revenue_at)) / (30 * 24 * 3600);
        ELSE
            -- Never had revenue, use activated_at as baseline
            SELECT EXTRACT(EPOCH FROM (now() - sd.activated_at)) / (30 * 24 * 3600)
            INTO v_months_since_revenue
            FROM public.sh_solution_departments sd
            WHERE sd.id = v_dept.id;
        END IF;

        -- Determine new status
        IF v_months_since_revenue >= 3 THEN
            v_new_status := 'dormant';
        ELSIF v_months_since_revenue >= 1 THEN
            v_new_status := 'at_risk';
        ELSE
            v_new_status := 'active';
        END IF;

        -- Update if status changed
        IF v_new_status != v_dept.status THEN
            UPDATE public.sh_solution_departments
            SET status = v_new_status,
                dormant_at = CASE WHEN v_new_status = 'dormant' THEN now() ELSE dormant_at END,
                updated_at = now()
            WHERE id = v_dept.id;

            -- Record status history
            INSERT INTO public.sh_department_status_history
                (solution_department_id, previous_status, new_status, reason, changed_at)
            VALUES
                (v_dept.id, v_dept.status, v_new_status,
                 CASE
                    WHEN v_new_status = 'dormant' THEN 'Auto-dormant: ' || ROUND(v_months_since_revenue, 1) || ' months without revenue'
                    WHEN v_new_status = 'at_risk' THEN 'At risk: ' || ROUND(v_months_since_revenue, 1) || ' months without revenue'
                    WHEN v_new_status = 'active' THEN 'Reactivated: Revenue received'
                 END,
                 now());
        END IF;
    END LOOP;
END;
$$;

-- =====================================================
-- TRIGGER: Auto-update department status on payment
-- =====================================================
CREATE OR REPLACE FUNCTION public.on_payment_received_update_dept()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_dept_id UUID;
    v_solution_dept_id UUID;
    v_old_status TEXT;
BEGIN
    -- Only process received payments
    IF NEW.status = 'received' THEN
        -- Get the lead department of the solution
        SELECT s.lead_department_id INTO v_dept_id
        FROM public.sh_solutions s
        WHERE s.id = NEW.solution_id;

        IF v_dept_id IS NOT NULL THEN
            -- Get the solution department record
            SELECT sd.id, sd.status INTO v_solution_dept_id, v_old_status
            FROM public.sh_solution_departments sd
            WHERE sd.department_id = v_dept_id;

            IF v_solution_dept_id IS NOT NULL THEN
                -- Update last_revenue_at and auto-reactivate if dormant/at_risk
                UPDATE public.sh_solution_departments
                SET last_revenue_at = now(),
                    status = 'active',
                    updated_at = now()
                WHERE id = v_solution_dept_id;

                -- Record status change if it changed
                IF v_old_status != 'active' THEN
                    INSERT INTO public.sh_department_status_history
                        (solution_department_id, previous_status, new_status, reason, changed_at)
                    VALUES
                        (v_solution_dept_id, v_old_status, 'active',
                         'Auto-reactivated: Payment received',
                         now());
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Create trigger on sh_payments
DROP TRIGGER IF EXISTS trg_payment_update_dept_status ON public.sh_payments;
CREATE TRIGGER trg_payment_update_dept_status
    AFTER INSERT OR UPDATE ON public.sh_payments
    FOR EACH ROW
    EXECUTE FUNCTION public.on_payment_received_update_dept();

-- =====================================================
-- updated_at triggers
-- =====================================================
CREATE OR REPLACE TRIGGER set_updated_at_sh_solution_departments
    BEFORE UPDATE ON public.sh_solution_departments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_sh_solution_types
    BEFORE UPDATE ON public.sh_solution_types
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_sh_department_targets
    BEFORE UPDATE ON public.sh_department_targets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
