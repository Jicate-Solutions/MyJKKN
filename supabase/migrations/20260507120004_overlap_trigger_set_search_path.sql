-- ============================================================================
-- 20260507120004 — Lock search_path on _fee_structure_community_no_overlap
-- ============================================================================
-- Follow-up to 20260507120001. The Supabase advisor flagged the overlap-
-- prevention trigger function for `function_search_path_mutable` — a
-- malicious schema on the user's search_path could shadow the table names
-- the function references and subvert its checks.
--
-- Fix: pin search_path to (public, pg_temp). Function body is byte-for-byte
-- identical to the original; only the SET clause is added.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._fee_structure_community_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_self public.admission_fee_structures%ROWTYPE;
BEGIN
    SELECT * INTO v_self
      FROM public.admission_fee_structures
     WHERE id = NEW.fee_structure_id;

    IF v_self.status = 'archived' THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.admission_fee_structure_communities j
          JOIN public.admission_fee_structures fs ON fs.id = j.fee_structure_id
         WHERE j.community_category_id = NEW.community_category_id
           AND j.fee_structure_id <> NEW.fee_structure_id
           AND fs.institution_id        = v_self.institution_id
           AND fs.degree_id             = v_self.degree_id
           AND fs.department_id         = v_self.department_id
           AND fs.programme_id          = v_self.programme_id
           AND fs.quota_id              = v_self.quota_id
           AND fs.accommodation_type_id = v_self.accommodation_type_id
           AND fs.admission_year_id     = v_self.admission_year_id
           AND fs.status <> 'archived'
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23505',
            MESSAGE = 'Another active fee structure already covers community '
                   || NEW.community_category_id::text
                   || ' for this 7-dim combination. Archive the existing structure first.';
    END IF;

    RETURN NEW;
END;
$$;
