-- ============================================================================
-- Counselor Tier Policy — config-row substrate (Pattern B: per-module typed)
-- ============================================================================
-- Created: 2026-05-06
-- Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
-- every policy decision = config-table row + super_admin UI to write + reader fn.
--
-- Purpose
-- -------
-- `fn_auto_assign_counselor_v2` currently runs hardcoded SQL tier-1 → tier-2 → tier-3
-- fallback logic. To make tier ordering tweakable without a code deploy, this migration
-- ships the SUBSTRATE: table + reader fn + (companion) admin UI.
--
-- This PR ships ONLY the substrate. The SQL function rewrite that READS from this
-- table is a SEPARATE follow-up PR — table sits unused initially (same pattern as
-- admission_assignment_rules and counselor_routing_config when they first landed).
--
-- Companion service: lib/services/admission/tier-policy-service.ts
-- Companion admin UI: app/(routes)/admin/counselors/tier-policy/page.tsx
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Config table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.counselor_tier_policy (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type               text NOT NULL CHECK (scope_type IN ('global', 'institution')),
  institution_id           uuid REFERENCES public.institutions(id) ON DELETE CASCADE,
  tier_order               integer NOT NULL CHECK (tier_order BETWEEN 1 AND 4),
  -- Tier definition: which counselor pool to consider at this tier
  tier_strategy            text NOT NULL CHECK (tier_strategy IN (
    'institution_and_source',
    'institution_only',
    'institution_legacy_fk',
    'cross_institution_fallback'
  )),
  on_duty_required         boolean NOT NULL DEFAULT true,
  is_active                boolean NOT NULL DEFAULT true,
  description              text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid REFERENCES auth.users(id),
  updated_by               uuid REFERENCES auth.users(id),
  CONSTRAINT scope_id_required CHECK (
    (scope_type = 'global' AND institution_id IS NULL) OR
    (scope_type = 'institution' AND institution_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.counselor_tier_policy IS
  'Director config: ordered tier list driving fn_auto_assign_counselor_v2 fallback chain. One row per (scope, tier_order). Global rows form the platform default; institution-scoped rows override per institution. See PR feat/counselor-tier-policy-substrate (2026-05-06).';
COMMENT ON COLUMN public.counselor_tier_policy.scope_type IS
  'global = platform default; institution = override for a specific institution_id.';
COMMENT ON COLUMN public.counselor_tier_policy.tier_order IS
  '1-based position in the tier fallback chain. tier_order=1 is tried first by fn_auto_assign_counselor_v2.';
COMMENT ON COLUMN public.counselor_tier_policy.tier_strategy IS
  'institution_and_source = both institution AND lead source via junction tables. institution_only = institution junction only. institution_legacy_fk = legacy counselors.institution_id FK. cross_institution_fallback = rules-gated cross-institution overflow.';
COMMENT ON COLUMN public.counselor_tier_policy.on_duty_required IS
  'When true, only on-duty counselors qualify at this tier. Tier 3 (legacy FK) seeds with FALSE for legacy parity.';

-- (scope_type, institution_id, tier_order) is unique. NULL institution_id (global)
-- collapses with COALESCE so two global rows at the same tier_order are rejected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tier_policy_scope_order
  ON public.counselor_tier_policy (scope_type, COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid), tier_order);

-- Helpful covering index for the reader fn's WHERE filter.
CREATE INDEX IF NOT EXISTS idx_tier_policy_active_lookup
  ON public.counselor_tier_policy (is_active, scope_type, institution_id, tier_order);

-- ---------------------------------------------------------------------------
-- 2) RLS — super_admin + admission_global SELECT/INSERT/UPDATE; everyone else read-only
-- ---------------------------------------------------------------------------
ALTER TABLE public.counselor_tier_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS counselor_tier_policy_select ON public.counselor_tier_policy;
CREATE POLICY counselor_tier_policy_select ON public.counselor_tier_policy
  FOR SELECT USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','admin','admission')
    )
  );

DROP POLICY IF EXISTS counselor_tier_policy_write ON public.counselor_tier_policy;
CREATE POLICY counselor_tier_policy_write ON public.counselor_tier_policy
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ---------------------------------------------------------------------------
-- 3) Reader fn — returns the active tier list for a given institution
--    Institution-specific overrides win; otherwise fall back to global.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_counselor_tier_policy(p_institution_id uuid DEFAULT NULL)
RETURNS TABLE (tier_order integer, tier_strategy text, on_duty_required boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH ranked AS (
    SELECT
      ctp.tier_order,
      ctp.tier_strategy,
      ctp.on_duty_required,
      ctp.scope_type,
      ROW_NUMBER() OVER (
        PARTITION BY ctp.tier_order
        ORDER BY CASE
          WHEN ctp.scope_type = 'institution' AND ctp.institution_id = p_institution_id THEN 0
          ELSE 1
        END
      ) AS r
    FROM public.counselor_tier_policy ctp
    WHERE ctp.is_active = true
      AND (
        ctp.scope_type = 'global'
        OR (ctp.scope_type = 'institution' AND ctp.institution_id = p_institution_id)
      )
  )
  SELECT ranked.tier_order, ranked.tier_strategy, ranked.on_duty_required
    FROM ranked
   WHERE ranked.r = 1
   ORDER BY ranked.tier_order;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_counselor_tier_policy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_counselor_tier_policy(uuid) TO service_role;

COMMENT ON FUNCTION public.fn_get_counselor_tier_policy(uuid) IS
  'Returns the active tier list for an institution, with institution-scoped overrides winning over global rows. Consumed by fn_auto_assign_counselor_v2 in the follow-up cleanup PR.';

-- ---------------------------------------------------------------------------
-- 4) Seed the 4-tier global default that mirrors today's hardcoded behavior
--    Idempotent — only seeds when no global rows exist yet.
-- ---------------------------------------------------------------------------
INSERT INTO public.counselor_tier_policy (scope_type, institution_id, tier_order, tier_strategy, on_duty_required, description, is_active)
SELECT * FROM (VALUES
  ('global', NULL::uuid, 1, 'institution_and_source',     true,  'Counselors mapped to both institution AND lead source via junction tables (highest specificity)', true),
  ('global', NULL::uuid, 2, 'institution_only',           true,  'Counselors mapped to institution via junction table (medium specificity)',                       true),
  ('global', NULL::uuid, 3, 'institution_legacy_fk',      false, 'Legacy counselors.institution_id FK fallback (no on-duty filter for legacy parity)',              true),
  ('global', NULL::uuid, 4, 'cross_institution_fallback', true,  'Cross-institution overflow (rules-gated; was Tier 4 in the SQL function)',                        false)
) AS r(scope_type, institution_id, tier_order, tier_strategy, on_duty_required, description, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.counselor_tier_policy
   WHERE scope_type = 'global' AND institution_id IS NULL
);
