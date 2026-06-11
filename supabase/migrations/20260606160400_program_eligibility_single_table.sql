-- Single combined program eligibility: one row = (institution, program, quota, fee band) -> room + mess.
-- Replaces the two (empty) hostel_program_{room,mess}_eligibility tables.
-- Both old tables were verified empty before this migration was applied.

CREATE TABLE IF NOT EXISTS public.hostel_program_eligibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.programs(id) ON DELETE CASCADE,   -- NULL = institution default
  quota_id   uuid REFERENCES public.quotas(id) ON DELETE CASCADE,     -- NULL = any quota
  fee_min numeric(12,2),                                              -- inclusive lower (rupees), NULL = unbounded
  fee_max numeric(12,2),                                              -- exclusive upper (rupees), NULL = unbounded
  room_category_id uuid REFERENCES public.hostel_categories(id) ON DELETE CASCADE,
  mess_category_id uuid REFERENCES public.mess_categories(id)  ON DELETE CASCADE,
  is_monthly_mess_allowed boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  CONSTRAINT chk_prog_elig_fee_range    CHECK (fee_min IS NULL OR fee_max IS NULL OR fee_min < fee_max),
  CONSTRAINT chk_prog_elig_has_category CHECK (room_category_id IS NOT NULL OR mess_category_id IS NOT NULL)
);

-- one row per band (institution, program, quota, fee_min, fee_max)
CREATE UNIQUE INDEX IF NOT EXISTS uq_prog_elig_band ON public.hostel_program_eligibility (
  institution_id,
  COALESCE(program_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(quota_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(fee_min, -1),
  COALESCE(fee_max, -1)
);
CREATE INDEX IF NOT EXISTS idx_prog_elig_resolve
  ON public.hostel_program_eligibility (institution_id, program_id, quota_id, is_active);

ALTER TABLE public.hostel_program_eligibility ENABLE ROW LEVEL SECURITY;

-- RLS policies replicated exactly from hostel_program_room_eligibility (verified 2026-06-06).
-- SELECT: open to all authenticated (USING true).
-- INSERT/UPDATE/DELETE: gated on profiles.role IN ('super_admin','admin').
CREATE POLICY hostel_program_eligibility_select
  ON public.hostel_program_eligibility
  FOR SELECT
  USING (true);

CREATE POLICY hostel_program_eligibility_insert
  ON public.hostel_program_eligibility
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1
    FROM profiles p
    WHERE (p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))
  ));

CREATE POLICY hostel_program_eligibility_update
  ON public.hostel_program_eligibility
  FOR UPDATE
  USING (EXISTS (
    SELECT 1
    FROM profiles p
    WHERE (p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))
  ));

CREATE POLICY hostel_program_eligibility_delete
  ON public.hostel_program_eligibility
  FOR DELETE
  USING (EXISTS (
    SELECT 1
    FROM profiles p
    WHERE (p.id = auth.uid()) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))
  ));

-- Repoint the two effective resolvers to the single combined table.
-- Resolver logic is UNCHANGED (specificity + tightest-band tie-break); only the
-- FROM clause is updated from the split tables to hostel_program_eligibility.

CREATE OR REPLACE FUNCTION public.fn_hostel_effective_room_categories(
  p_institution uuid, p_program uuid, p_quota uuid, p_fee numeric
) RETURNS TABLE(category_id uuid)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  WITH candidates AS (
    SELECT e.room_category_id AS cat,
           e.program_id, e.quota_id, e.fee_min, e.fee_max,
           ( (e.program_id IS NOT NULL)::int * 4
           + (e.quota_id   IS NOT NULL)::int * 2
           + ((e.fee_min IS NOT NULL OR e.fee_max IS NOT NULL))::int * 1 ) AS specificity
    FROM hostel_program_eligibility e
    WHERE e.institution_id = p_institution
      AND e.is_active
      AND e.room_category_id IS NOT NULL
      AND (e.program_id = p_program OR e.program_id IS NULL)
      AND (e.quota_id   = p_quota   OR e.quota_id   IS NULL)
      -- half-open interval [fee_min, fee_max): includes min, excludes max
      AND (e.fee_min IS NULL OR p_fee >= e.fee_min)
      AND (e.fee_max IS NULL OR p_fee <  e.fee_max)
  ),
  winner AS (
    SELECT program_id, quota_id, fee_min, fee_max
    FROM candidates
    ORDER BY specificity DESC,
             (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  )
  SELECT c.cat
  FROM candidates c JOIN winner w
    ON c.program_id IS NOT DISTINCT FROM w.program_id
   AND c.quota_id   IS NOT DISTINCT FROM w.quota_id
   AND c.fee_min    IS NOT DISTINCT FROM w.fee_min
   AND c.fee_max    IS NOT DISTINCT FROM w.fee_max;
$$;

CREATE OR REPLACE FUNCTION public.fn_hostel_effective_mess_categories(
  p_institution uuid, p_program uuid, p_quota uuid, p_fee numeric
) RETURNS TABLE(category_id uuid)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  WITH candidates AS (
    SELECT e.mess_category_id AS cat,
           e.program_id, e.quota_id, e.fee_min, e.fee_max,
           ( (e.program_id IS NOT NULL)::int * 4
           + (e.quota_id   IS NOT NULL)::int * 2
           + ((e.fee_min IS NOT NULL OR e.fee_max IS NOT NULL))::int * 1 ) AS specificity
    FROM hostel_program_eligibility e
    WHERE e.institution_id = p_institution
      AND e.is_active
      AND e.mess_category_id IS NOT NULL
      AND (e.program_id = p_program OR e.program_id IS NULL)
      AND (e.quota_id   = p_quota   OR e.quota_id   IS NULL)
      -- half-open interval [fee_min, fee_max): includes min, excludes max
      AND (e.fee_min IS NULL OR p_fee >= e.fee_min)
      AND (e.fee_max IS NULL OR p_fee <  e.fee_max)
  ),
  winner AS (
    SELECT program_id, quota_id, fee_min, fee_max
    FROM candidates
    ORDER BY specificity DESC,
             (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  )
  SELECT c.cat
  FROM candidates c JOIN winner w
    ON c.program_id IS NOT DISTINCT FROM w.program_id
   AND c.quota_id   IS NOT DISTINCT FROM w.quota_id
   AND c.fee_min    IS NOT DISTINCT FROM w.fee_min
   AND c.fee_max    IS NOT DISTINCT FROM w.fee_max;
$$;

-- Resolvers no longer reference the old tables; now safe to drop them.
DROP TABLE IF EXISTS public.hostel_program_room_eligibility CASCADE;
DROP TABLE IF EXISTS public.hostel_program_mess_eligibility CASCADE;
