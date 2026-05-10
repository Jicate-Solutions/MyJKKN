-- ============================================================================
-- 20260507120001 — Fee structure ↔ community junction (multi-community support)
-- ============================================================================
-- Replaces the single-FK community_category_id on admission_fee_structures
-- with a junction table so one fee structure can apply to N communities
-- ("multiple community have the same fees structure" — operator request).
--
-- Migration shape:
--   1. Create admission_fee_structure_communities (PK = (structure, community))
--   2. Backfill: every existing structure gets a single junction row that
--      preserves its current community_category_id.
--   3. Drop the legacy 8-dim UNIQUE constraint and the community_category_id
--      column itself — junction is now the canonical mapping.
--   4. Add an overlap-prevention trigger so two non-archived structures with
--      the same 7-dim signature cannot both claim the same community.
--   5. RLS policies that mirror admission_fee_structures (read = read parent,
--      write = manage parent).
--
-- The lead-resolution RPC is updated separately in 20260507120002.
-- ============================================================================

-- 1. Junction table -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admission_fee_structure_communities (
    fee_structure_id      uuid NOT NULL
                          REFERENCES public.admission_fee_structures(id)
                          ON DELETE CASCADE,
    community_category_id uuid NOT NULL
                          REFERENCES public.community_categories(id),
    created_at            timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (fee_structure_id, community_category_id)
);

CREATE INDEX IF NOT EXISTS ix_fee_structure_communities_community
    ON public.admission_fee_structure_communities (community_category_id);

CREATE INDEX IF NOT EXISTS ix_fee_structure_communities_structure
    ON public.admission_fee_structure_communities (fee_structure_id);

-- 2. Backfill from legacy column ---------------------------------------------
-- Idempotent: re-running this migration locally won't double-insert.
INSERT INTO public.admission_fee_structure_communities (fee_structure_id, community_category_id)
SELECT id, community_category_id
  FROM public.admission_fee_structures
 WHERE community_category_id IS NOT NULL
ON CONFLICT (fee_structure_id, community_category_id) DO NOTHING;

-- 3. Drop legacy unique constraint and column --------------------------------
-- The 8-dim UNIQUE was named with a Postgres-generated suffix. We discover it
-- and drop dynamically so the migration is portable across environments where
-- the constraint may or may not have been renamed.
DO $$
DECLARE
    v_constraint_name text;
BEGIN
    SELECT conname INTO v_constraint_name
      FROM pg_constraint
     WHERE conrelid = 'public.admission_fee_structures'::regclass
       AND contype = 'u'
       AND pg_get_constraintdef(oid) ILIKE '%community_category_id%';

    IF v_constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.admission_fee_structures DROP CONSTRAINT %I', v_constraint_name);
    END IF;
END $$;

ALTER TABLE public.admission_fee_structures
    DROP COLUMN IF EXISTS community_category_id;

-- 4. Overlap-prevention trigger ----------------------------------------------
-- Without the legacy 8-dim UNIQUE, nothing prevents two non-archived structures
-- with the same 7 dims from both claiming the same community. This trigger
-- restores that invariant on the junction side.
CREATE OR REPLACE FUNCTION public._fee_structure_community_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_self public.admission_fee_structures%ROWTYPE;
BEGIN
    SELECT * INTO v_self
      FROM public.admission_fee_structures
     WHERE id = NEW.fee_structure_id;

    -- Archived structures never participate in overlap checks (they're
    -- historical and shouldn't conflict with new actives).
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

DROP TRIGGER IF EXISTS trg_fee_structure_community_no_overlap
    ON public.admission_fee_structure_communities;
CREATE TRIGGER trg_fee_structure_community_no_overlap
    BEFORE INSERT OR UPDATE ON public.admission_fee_structure_communities
    FOR EACH ROW
    EXECUTE FUNCTION public._fee_structure_community_no_overlap();

-- 5. RLS — mirror parent's read/manage gates ---------------------------------
ALTER TABLE public.admission_fee_structure_communities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fee_structure_communities_read ON public.admission_fee_structure_communities;
CREATE POLICY fee_structure_communities_read
    ON public.admission_fee_structure_communities FOR SELECT
    USING (
      public.user_has_permission('admission_fees.read')
      AND EXISTS (
        SELECT 1 FROM public.admission_fee_structures fs
         WHERE fs.id = fee_structure_id
           AND public.role_has_institution_access(fs.institution_id)
      )
    );

DROP POLICY IF EXISTS fee_structure_communities_write ON public.admission_fee_structure_communities;
CREATE POLICY fee_structure_communities_write
    ON public.admission_fee_structure_communities FOR ALL
    USING (
      public.user_has_permission('admission_fees.manage')
      AND EXISTS (
        SELECT 1 FROM public.admission_fee_structures fs
         WHERE fs.id = fee_structure_id
           AND public.role_has_institution_access(fs.institution_id)
      )
    )
    WITH CHECK (
      public.user_has_permission('admission_fees.manage')
      AND EXISTS (
        SELECT 1 FROM public.admission_fee_structures fs
         WHERE fs.id = fee_structure_id
           AND public.role_has_institution_access(fs.institution_id)
      )
    );

-- ============================================================================
-- Notes for downstream code:
--   * Service layer must read fees-structure → communities via this junction.
--   * The lead-resolution RPC is updated in 20260507120002 to match a lead's
--     community_category_id against this junction (EXISTS).
--   * The trigger uses ERRCODE 23505 so the service layer can surface a
--     consistent "already exists" error to the operator.
-- ============================================================================
