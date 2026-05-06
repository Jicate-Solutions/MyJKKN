-- ============================================================================
-- 20260507100009 — Create admission_year_quota_seats
-- ============================================================================
-- Per-quota seat allocations for each admission-year cohort. One row per
-- (admission_year_id, quota_id) combination. The aggregate sum across rows
-- is the per-cohort total (also stored denormalized on admission_years.
-- sanctioned_intake for backward compat with the existing seat-config flow).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admission_year_quota_seats (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admission_year_id uuid NOT NULL REFERENCES public.admission_years(id) ON DELETE CASCADE,
    quota_id          uuid NOT NULL REFERENCES public.quotas(id),
    sanctioned_intake integer NOT NULL DEFAULT 0 CHECK (sanctioned_intake >= 0),
    notes             text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE (admission_year_id, quota_id)
);

CREATE INDEX IF NOT EXISTS ix_admission_year_quota_seats_year
    ON public.admission_year_quota_seats (admission_year_id);

CREATE INDEX IF NOT EXISTS ix_admission_year_quota_seats_quota
    ON public.admission_year_quota_seats (quota_id);

DROP TRIGGER IF EXISTS trg_admission_year_quota_seats_touch ON public.admission_year_quota_seats;
CREATE TRIGGER trg_admission_year_quota_seats_touch
    BEFORE UPDATE ON public.admission_year_quota_seats
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- RLS — read scoped to institution access via parent admission_year;
-- write requires admission.settings.seats.edit or admission.settings.manage
ALTER TABLE public.admission_year_quota_seats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admission_year_quota_seats_read ON public.admission_year_quota_seats;
CREATE POLICY admission_year_quota_seats_read
    ON public.admission_year_quota_seats FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.admission_years ay
         WHERE ay.id = admission_year_quota_seats.admission_year_id
           AND public.role_has_institution_access(ay.institution_id)
      )
    );

DROP POLICY IF EXISTS admission_year_quota_seats_write ON public.admission_year_quota_seats;
CREATE POLICY admission_year_quota_seats_write
    ON public.admission_year_quota_seats FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.admission_years ay
         WHERE ay.id = admission_year_quota_seats.admission_year_id
           AND (
             public.user_has_permission('admission.settings.seats.edit')
             OR public.user_has_permission('admission.settings.manage')
           )
           AND public.role_has_institution_access(ay.institution_id)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.admission_years ay
         WHERE ay.id = admission_year_quota_seats.admission_year_id
           AND (
             public.user_has_permission('admission.settings.seats.edit')
             OR public.user_has_permission('admission.settings.manage')
           )
           AND public.role_has_institution_access(ay.institution_id)
      )
    );
