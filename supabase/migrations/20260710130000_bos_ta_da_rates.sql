-- Per-council / per-member-type TA & honorarium rate settings.
--
-- Until now every auto-generated claim used the flat SOP constants in
-- lib/utils/bos/ta-da-rates.ts (external ₹1,500 / internal ₹1,000 honorarium,
-- ₹5/km TA). Each council (Curriculum Development Cell, Academic Council, …)
-- actually pays different amounts, and within a council the amount differs by
-- member type — so rates become configurable rows.
--
-- Keying: (institutions_id, committee_name, member_type).
--   • committee_name (not committee_id): rates apply to a council KIND across
--     every composition's copy of that committee (~40 'Curriculum Development
--     Cell' rows share one rate set). Claim generation resolves the meeting's
--     committee and matches its name case-insensitively (ILIKE, no wildcards).
--   • member_type: the BosMemberType enum value stored on bos_members
--     (chairman, internal_member, subject_expert, …). TEXT with NO CHECK
--     constraint — allowed values are governed by BOS_MEMBER_TYPE_LABELS in
--     types/bos.ts (enum-drift guardrail, same rationale as bos_meetings.council
--     removal in 20260710120000).
--
-- Fallback: a member type with no active row keeps the legacy SOP constants,
-- so institutions that never open the settings dialog see no behavior change.
CREATE TABLE IF NOT EXISTS public.bos_ta_da_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  committee_name text NOT NULL,
  member_type text NOT NULL,
  honorarium_amount numeric(10,2) NOT NULL DEFAULT 0,
  ta_per_km numeric(10,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Plain-column uniqueness (not lower(name)) so PostgREST upsert can target
  -- it via onConflict. Names come from the committee dropdown, so casing is
  -- consistent in practice; lookups are case-insensitive regardless.
  CONSTRAINT uniq_bos_ta_da_rates_scope UNIQUE (institutions_id, committee_name, member_type)
);

CREATE INDEX IF NOT EXISTS idx_bos_ta_da_rates_institution
  ON public.bos_ta_da_rates (institutions_id);

COMMENT ON TABLE public.bos_ta_da_rates IS
  'Per-council (committee_name) and per-member-type TA/honorarium rates for auto-generated BoS meeting claims. Missing rows fall back to the flat SOP constants in lib/utils/bos/ta-da-rates.ts.';

ALTER TABLE public.bos_ta_da_rates ENABLE ROW LEVEL SECURITY;

-- Reads follow the committees pattern; writes are super-admin only (the API
-- route also enforces this and writes via service-role — rates are money SOP,
-- same lockdown posture as /bos/taxonomy and /bos/sop).
CREATE POLICY "bos_ta_da_rates_select" ON public.bos_ta_da_rates FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-compositions.view')
      AND role_has_institution_access(institutions_id))
);
CREATE POLICY "bos_ta_da_rates_insert" ON public.bos_ta_da_rates FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
);
CREATE POLICY "bos_ta_da_rates_update" ON public.bos_ta_da_rates FOR UPDATE USING (
  is_super_admin() OR is_admin()
);
CREATE POLICY "bos_ta_da_rates_delete" ON public.bos_ta_da_rates FOR DELETE USING (
  is_super_admin() OR is_admin()
);

CREATE TRIGGER update_bos_ta_da_rates_updated_at
  BEFORE UPDATE ON public.bos_ta_da_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
