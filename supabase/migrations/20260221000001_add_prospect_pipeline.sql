-- ============================================
-- Solutions Hub: Prospect Pipeline Layer
-- ============================================

-- 1. New enum: pipeline stage
DO $$ BEGIN
    CREATE TYPE sh_pipeline_stage AS ENUM (
        'lead',
        'qualified',
        'proposal',
        'negotiation',
        'won',
        'lost',
        'dormant'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. New table: sh_prospects
CREATE TABLE IF NOT EXISTS public.sh_prospects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_code TEXT NOT NULL,
    company_name TEXT NOT NULL,
    contact_person TEXT NOT NULL,
    contact_email TEXT,
    contact_phone TEXT NOT NULL,
    source_type sh_source_type NOT NULL DEFAULT 'direct',
    source_detail TEXT,
    pipeline_stage sh_pipeline_stage NOT NULL DEFAULT 'lead',
    expected_deal_size NUMERIC,
    expected_close_date DATE,
    solution_type_interest sh_solution_type,
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    next_action TEXT,
    next_action_date DATE,
    last_contact_date TIMESTAMPTZ,
    notes TEXT,
    tags TEXT[],
    converted_client_id UUID REFERENCES public.sh_clients(id) ON DELETE SET NULL,
    lost_reason TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- 3. New table: sh_prospect_activities
CREATE TABLE IF NOT EXISTS public.sh_prospect_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id UUID NOT NULL REFERENCES public.sh_prospects(id) ON DELETE CASCADE,
    activity_type sh_communication_type NOT NULL DEFAULT 'other',
    subject TEXT,
    summary TEXT NOT NULL,
    activity_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    next_action TEXT,
    next_action_date DATE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_sh_prospects_pipeline_stage ON sh_prospects(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_sh_prospects_assigned_to ON sh_prospects(assigned_to);
CREATE INDEX IF NOT EXISTS idx_sh_prospects_next_action_date ON sh_prospects(next_action_date);
CREATE INDEX IF NOT EXISTS idx_sh_prospects_is_active ON sh_prospects(is_active);
CREATE INDEX IF NOT EXISTS idx_sh_prospect_activities_prospect_id ON sh_prospect_activities(prospect_id);
CREATE INDEX IF NOT EXISTS idx_sh_prospect_activities_activity_date ON sh_prospect_activities(activity_date);

-- 5. RLS
ALTER TABLE sh_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sh_prospect_activities ENABLE ROW LEVEL SECURITY;

-- Prospects policies
DROP POLICY IF EXISTS "sh_prospects_select" ON sh_prospects;
DROP POLICY IF EXISTS "sh_prospects_insert" ON sh_prospects;
DROP POLICY IF EXISTS "sh_prospects_update" ON sh_prospects;
DROP POLICY IF EXISTS "sh_prospects_delete" ON sh_prospects;

CREATE POLICY "sh_prospects_select" ON sh_prospects
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_prospects_insert" ON sh_prospects
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_prospects_update" ON sh_prospects
    FOR UPDATE USING (
        sh_has_management_access()
    );

CREATE POLICY "sh_prospects_delete" ON sh_prospects
    FOR DELETE USING (
        sh_is_admin()
    );

-- Prospect activities policies
DROP POLICY IF EXISTS "sh_prospect_activities_select" ON sh_prospect_activities;
DROP POLICY IF EXISTS "sh_prospect_activities_insert" ON sh_prospect_activities;
DROP POLICY IF EXISTS "sh_prospect_activities_update" ON sh_prospect_activities;
DROP POLICY IF EXISTS "sh_prospect_activities_delete" ON sh_prospect_activities;

CREATE POLICY "sh_prospect_activities_select" ON sh_prospect_activities
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_prospect_activities_insert" ON sh_prospect_activities
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_prospect_activities_update" ON sh_prospect_activities
    FOR UPDATE USING (
        sh_has_management_access()
    );

CREATE POLICY "sh_prospect_activities_delete" ON sh_prospect_activities
    FOR DELETE USING (
        sh_is_admin()
    );

-- 6. Auto-update last_contact_date on prospect when activity is logged
CREATE OR REPLACE FUNCTION public.sh_update_prospect_last_contact()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE sh_prospects
    SET last_contact_date = NEW.activity_date,
        updated_at = NOW()
    WHERE id = NEW.prospect_id;

    -- Also update next_action if the activity provides one
    IF NEW.next_action IS NOT NULL THEN
        UPDATE sh_prospects
        SET next_action = NEW.next_action,
            next_action_date = NEW.next_action_date,
            updated_at = NOW()
        WHERE id = NEW.prospect_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sh_update_prospect_last_contact ON sh_prospect_activities;
CREATE TRIGGER trg_sh_update_prospect_last_contact
    AFTER INSERT ON sh_prospect_activities
    FOR EACH ROW
    EXECUTE FUNCTION sh_update_prospect_last_contact();

-- 7. Auto-create client when prospect stage changes to 'won'
CREATE OR REPLACE FUNCTION public.sh_prospect_won_to_client()
RETURNS TRIGGER AS $$
DECLARE
    new_client_id UUID;
BEGIN
    -- Only fire when pipeline_stage changes to 'won' and no client already linked
    IF NEW.pipeline_stage = 'won'
       AND (OLD.pipeline_stage IS DISTINCT FROM 'won')
       AND NEW.converted_client_id IS NULL
    THEN
        INSERT INTO sh_clients (
            name,
            contact_person,
            contact_email,
            contact_phone,
            source_type,
            partner_status,
            notes,
            tags,
            is_active,
            created_by
        ) VALUES (
            NEW.company_name,
            NEW.contact_person,
            NEW.contact_email,
            NEW.contact_phone,
            NEW.source_type,
            'standard',
            'Auto-created from prospect: ' || NEW.prospect_code,
            NEW.tags,
            true,
            NEW.created_by
        )
        RETURNING id INTO new_client_id;

        -- Link the new client back to the prospect
        NEW.converted_client_id := new_client_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sh_prospect_won_to_client ON sh_prospects;
CREATE TRIGGER trg_sh_prospect_won_to_client
    BEFORE UPDATE ON sh_prospects
    FOR EACH ROW
    EXECUTE FUNCTION sh_prospect_won_to_client();
