-- Pipeline ↔ Client Improvements (from FST Analysis)
-- Adds: reopen_date, existing_client_id, solution_types_interest columns
-- Updates: sh_prospect_won_to_client trigger (enriched notes + repeat business)

-- 1. Add reopen_date for dormant/lost re-engagement
ALTER TABLE public.sh_prospects ADD COLUMN IF NOT EXISTS reopen_date DATE;
COMMENT ON COLUMN public.sh_prospects.reopen_date IS 'Date to revisit dormant/lost prospects for re-engagement';
CREATE INDEX IF NOT EXISTS idx_sh_prospects_reopen ON public.sh_prospects(reopen_date) WHERE reopen_date IS NOT NULL AND pipeline_stage IN ('dormant', 'lost');

-- 2. Add existing_client_id for repeat business
ALTER TABLE public.sh_prospects ADD COLUMN IF NOT EXISTS existing_client_id UUID REFERENCES public.sh_clients(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.sh_prospects.existing_client_id IS 'Links prospect to existing client for repeat business opportunities';

-- 3. Add solution_types_interest array (multi-select)
ALTER TABLE public.sh_prospects ADD COLUMN IF NOT EXISTS solution_types_interest TEXT[] DEFAULT '{}';
-- Migrate existing single-value data to array
UPDATE public.sh_prospects SET solution_types_interest = ARRAY[solution_type_interest] WHERE solution_type_interest IS NOT NULL AND (solution_types_interest IS NULL OR solution_types_interest = '{}');

-- 4. Updated trigger: enriched notes + repeat business support
CREATE OR REPLACE FUNCTION public.sh_prospect_won_to_client()
RETURNS TRIGGER AS $$
DECLARE
    new_client_id UUID;
    prospect_notes TEXT;
BEGIN
    IF NEW.pipeline_stage = 'won'
       AND (OLD.pipeline_stage IS DISTINCT FROM 'won')
       AND NEW.converted_client_id IS NULL
    THEN
        -- Check if this is repeat business (existing client)
        IF NEW.existing_client_id IS NOT NULL THEN
            NEW.converted_client_id := NEW.existing_client_id;
        ELSE
            -- Build enriched notes for new client
            prospect_notes := 'Auto-created from prospect: ' || NEW.prospect_code;
            IF NEW.expected_deal_size IS NOT NULL THEN
                prospect_notes := prospect_notes || E'\nExpected deal size: ₹' || NEW.expected_deal_size::TEXT;
            END IF;
            IF NEW.solution_type_interest IS NOT NULL THEN
                prospect_notes := prospect_notes || E'\nSolution interest: ' || NEW.solution_type_interest;
            END IF;
            IF NEW.notes IS NOT NULL THEN
                prospect_notes := prospect_notes || E'\n\nProspect notes:\n' || NEW.notes;
            END IF;

            INSERT INTO sh_clients (
                name, contact_person, contact_email, contact_phone,
                source_type, partner_status, notes, tags, is_active, created_by
            ) VALUES (
                NEW.company_name, NEW.contact_person, NEW.contact_email, NEW.contact_phone,
                NEW.source_type, 'standard', prospect_notes, NEW.tags, true, NEW.created_by
            )
            RETURNING id INTO new_client_id;

            NEW.converted_client_id := new_client_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
