-- ============================================================================
-- Consultant Tier Policy — config-row substrate (Pattern B: per-module typed)
-- ============================================================================
-- Created: 2026-05-13
-- Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
-- every policy decision = config-table row + super_admin UI to write + reader fn.
-- Zero deploys, zero PRs, zero developer round-trips for future tweaks.
--
-- Purpose
-- -------
-- `lib/services/admission/consultant-service.ts:2496-2508` currently hardcodes the
-- bronze→silver→gold→platinum→diamond tier ladder for education consultants:
--   bronze   → 10  conversions → silver
--   silver   → 25  conversions → gold
--   gold     → 50  conversions → platinum
--   platinum → 100 conversions → diamond
--   diamond  → terminal (no next tier)
--
-- To make the ladder tweakable per institution without a code deploy, this
-- migration ships the SUBSTRATE: table + reader fn + (companion) admin UI.
--
-- This PR ships ONLY the substrate. The consultant-service.ts rewrite that
-- READS from this table via the reader-fn is a SEPARATE follow-up PR — the
-- table sits unused initially. Seeds mirror today's hardcoded behavior 1:1 so
-- the engine PR is a behavioral no-op on apply day.
--
-- Companion service:  lib/services/admission/consultant-tier-policy-service.ts
-- Companion admin UI: app/(routes)/admin/consultants/tier-policy/page.tsx
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Config table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consultant_tier_policy (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name         text NOT NULL,
  scope_type        text NOT NULL CHECK (scope_type IN ('global', 'institution')),
  scope_id          uuid REFERENCES public.institutions(id) ON DELETE CASCADE,
  display_order     integer NOT NULL,
  min_conversions   integer NOT NULL CHECK (min_conversions >= 0),
  max_conversions   integer CHECK (max_conversions IS NULL OR max_conversions >= min_conversions),
  next_tier         text,
  badge_color       text,
  is_active         boolean NOT NULL DEFAULT true,
  description       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid REFERENCES auth.users(id),
  CONSTRAINT consultant_tier_policy_scope_id_required CHECK (
    (scope_type = 'global' AND scope_id IS NULL) OR
    (scope_type = 'institution' AND scope_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.consultant_tier_policy IS
  'Director config: ordered tier ladder for education consultants (bronze→diamond by default). Global rows form the platform default; institution-scoped rows override per institution. Consumed by the consultant-tier-policy-service reader fn — replaces hardcoded thresholds in consultant-service.ts:2496-2508. See PR feat/consultant-portal-substrate (2026-05-13).';
COMMENT ON COLUMN public.consultant_tier_policy.tier_name IS
  'Tier identifier (bronze, silver, gold, platinum, diamond). Lowercase. References next_tier on other rows.';
COMMENT ON COLUMN public.consultant_tier_policy.scope_type IS
  'global = platform default; institution = override for a specific scope_id.';
COMMENT ON COLUMN public.consultant_tier_policy.min_conversions IS
  'Inclusive lower bound — minimum total_conversions to ENTER this tier.';
COMMENT ON COLUMN public.consultant_tier_policy.max_conversions IS
  'Inclusive upper bound — maximum total_conversions while still in this tier. NULL = open-ended (top tier).';
COMMENT ON COLUMN public.consultant_tier_policy.next_tier IS
  'tier_name of the next tier in the ladder. NULL = terminal (highest tier).';
COMMENT ON COLUMN public.consultant_tier_policy.badge_color IS
  'Hex color (e.g. #CD7F32) used by UI badges. Optional; UI falls back to a sensible default.';

-- (tier_name, scope_type, scope_id) is unique. NULL scope_id (global) collapses
-- with COALESCE so two global rows with the same tier_name are rejected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_consultant_tier_policy_name_scope
  ON public.consultant_tier_policy (
    tier_name,
    scope_type,
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- Covering index for the reader fn's WHERE filter.
CREATE INDEX IF NOT EXISTS idx_consultant_tier_policy_active
  ON public.consultant_tier_policy (scope_type, is_active);

-- ---------------------------------------------------------------------------
-- 2) RLS — any authenticated user can SELECT (UI consumers render tier
--    badges client-side); only super_admin can write.
-- ---------------------------------------------------------------------------
ALTER TABLE public.consultant_tier_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultant_tier_policy_select ON public.consultant_tier_policy;
CREATE POLICY consultant_tier_policy_select ON public.consultant_tier_policy
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS consultant_tier_policy_write ON public.consultant_tier_policy;
CREATE POLICY consultant_tier_policy_write ON public.consultant_tier_policy
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.role = 'super_admin'
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Reader fn — returns the resolved tier for a given conversion count.
--    Institution-specific override wins over global if scope_id matches.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_consultant_tier_for_conversions(
  p_conversions integer,
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  current_tier      text,
  min_conversions   integer,
  max_conversions   integer,
  next_tier         text,
  leads_to_next     integer,
  badge_color       text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH candidates AS (
    SELECT
      ctp.tier_name,
      ctp.min_conversions,
      ctp.max_conversions,
      ctp.next_tier,
      ctp.badge_color,
      ctp.scope_type,
      ctp.display_order,
      ROW_NUMBER() OVER (
        PARTITION BY ctp.tier_name
        ORDER BY CASE
          WHEN ctp.scope_type = 'institution' AND ctp.scope_id = p_institution_id THEN 0
          ELSE 1
        END
      ) AS r
    FROM public.consultant_tier_policy ctp
    WHERE ctp.is_active = true
      AND p_conversions >= ctp.min_conversions
      AND (ctp.max_conversions IS NULL OR p_conversions <= ctp.max_conversions)
      AND (
        ctp.scope_type = 'global'
        OR (ctp.scope_type = 'institution' AND ctp.scope_id = p_institution_id)
      )
  ),
  resolved AS (
    SELECT * FROM candidates WHERE r = 1
    ORDER BY display_order DESC
    LIMIT 1
  ),
  next_row AS (
    -- Find the next tier's min_conversions so we can compute leads_to_next.
    -- Prefer institution-scoped row when scope_id matches.
    SELECT
      ctp2.min_conversions AS next_min,
      ROW_NUMBER() OVER (
        ORDER BY CASE
          WHEN ctp2.scope_type = 'institution' AND ctp2.scope_id = p_institution_id THEN 0
          ELSE 1
        END
      ) AS r
    FROM public.consultant_tier_policy ctp2, resolved
    WHERE ctp2.is_active = true
      AND ctp2.tier_name = resolved.next_tier
      AND (
        ctp2.scope_type = 'global'
        OR (ctp2.scope_type = 'institution' AND ctp2.scope_id = p_institution_id)
      )
  )
  SELECT
    resolved.tier_name AS current_tier,
    resolved.min_conversions,
    resolved.max_conversions,
    resolved.next_tier,
    CASE
      WHEN resolved.next_tier IS NULL THEN NULL
      ELSE GREATEST(
        0,
        COALESCE(
          (SELECT next_min FROM next_row WHERE r = 1),
          0
        ) - p_conversions
      )
    END AS leads_to_next,
    resolved.badge_color
  FROM resolved;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_consultant_tier_for_conversions(integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_consultant_tier_for_conversions(integer, uuid) TO service_role;

COMMENT ON FUNCTION public.fn_get_consultant_tier_for_conversions(integer, uuid) IS
  'Returns the resolved tier for a consultant given total_conversions, with institution-scoped overrides winning over global rows. Consumed by consultant-tier-policy-service.getTierForConversions() in the follow-up cleanup PR that replaces hardcoded thresholds in consultant-service.ts.';

-- ---------------------------------------------------------------------------
-- 4) Seed the 5-tier global default that mirrors today's hardcoded behavior.
--    Idempotent — only seeds when no global rows exist yet.
--
--    Source of truth: lib/services/admission/consultant-service.ts:2496-2508
--      bronze   → conversions: 10,  nextTier: 'silver'
--      silver   → conversions: 25,  nextTier: 'gold'
--      gold     → conversions: 50,  nextTier: 'platinum'
--      platinum → conversions: 100, nextTier: 'diamond'
--      diamond  → conversions: 0,   nextTier: null (terminal)
--
--    Interpretation: `conversions` is the threshold to ENTER the NEXT tier
--    (so it equals next-row's min_conversions). max_conversions is one below
--    the next tier's min, inclusive band.
-- ---------------------------------------------------------------------------
INSERT INTO public.consultant_tier_policy (
  tier_name, scope_type, scope_id, display_order,
  min_conversions, max_conversions, next_tier, badge_color, is_active, description
)
SELECT * FROM (VALUES
  ('bronze',   'global', NULL::uuid, 1, 0,   9,           'silver',   '#CD7F32', true, 'Starting tier — every new consultant begins here.'),
  ('silver',   'global', NULL::uuid, 2, 10,  24,          'gold',     '#C0C0C0', true, '10+ conversions. First milestone tier.'),
  ('gold',     'global', NULL::uuid, 3, 25,  49,          'platinum', '#FFD700', true, '25+ conversions.'),
  ('platinum', 'global', NULL::uuid, 4, 50,  99,          'diamond',  '#E5E4E2', true, '50+ conversions.'),
  ('diamond',  'global', NULL::uuid, 5, 100, NULL::integer, NULL::text, '#B9F2FF', true, '100+ conversions. Top tier (open-ended).')
) AS r(tier_name, scope_type, scope_id, display_order, min_conversions, max_conversions, next_tier, badge_color, is_active, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.consultant_tier_policy
   WHERE scope_type = 'global' AND scope_id IS NULL
);
