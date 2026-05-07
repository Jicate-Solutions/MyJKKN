-- ============================================================================
-- Counselor routing errors — observability table for fn_auto_assign_counselor_v2
-- ============================================================================
-- Purpose: surface routing failures that today vanish silently inside
--          fn_auto_assign_counselor_v2's `EXCEPTION WHEN OTHERS THEN
--          v_counselor_id := NULL` block (anti-pattern flagged in
--          feedback_silent_exception_swallow_pattern memory entry).
--
-- Scope of THIS migration: ship the table + reader fn ONLY.
--   The writer side (rewriting fn_auto_assign_counselor_v2 to INSERT named
--   exception captures into this table) is a separate follow-up PR.
--   Until that PR lands the table sits empty; the admin page surfaces an
--   empty-state explaining this.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.counselor_routing_errors (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at              timestamptz NOT NULL DEFAULT now(),
  lead_id                  uuid REFERENCES public.admission_leads(id) ON DELETE SET NULL,
  institution_id           uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  -- Which routing tier raised the error (1, 2, 3, 4, or NULL for "before tier resolution")
  tier_order               integer,
  -- Postgres SQLSTATE code (e.g. '22P02' for invalid_text_representation)
  sqlstate                 text,
  -- The exception message text (from RAISE EXCEPTION's MESSAGE / SQLERRM)
  error_message            text NOT NULL,
  -- Original NEW row context for diagnosis (institution, source, etc.)
  context                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Did the lead end up unassigned (counselor_id IS NULL) as a result?
  resulted_in_unassigned   boolean NOT NULL DEFAULT true,
  resolved_at              timestamptz,
  resolved_by              uuid REFERENCES auth.users(id),
  resolution_notes         text
);

CREATE INDEX IF NOT EXISTS idx_routing_errors_occurred_at
  ON public.counselor_routing_errors (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_routing_errors_institution
  ON public.counselor_routing_errors (institution_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_routing_errors_unresolved
  ON public.counselor_routing_errors (occurred_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_routing_errors_lead
  ON public.counselor_routing_errors (lead_id)
  WHERE lead_id IS NOT NULL;

-- RLS: super_admin + admission_global SELECT; service-role only INSERTs (the
-- routing function will write to it once Part 1 ships)
ALTER TABLE public.counselor_routing_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS routing_errors_select ON public.counselor_routing_errors;
CREATE POLICY routing_errors_select ON public.counselor_routing_errors
  FOR SELECT USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.role IN ('super_admin','admin','admission')
    )
  );

DROP POLICY IF EXISTS routing_errors_resolve ON public.counselor_routing_errors;
CREATE POLICY routing_errors_resolve ON public.counselor_routing_errors
  FOR UPDATE USING (is_super_admin()) WITH CHECK (is_super_admin());

-- A small reader fn for the admin page (last N hours, by institution if scoped)
CREATE OR REPLACE FUNCTION public.fn_routing_errors_recent(
  p_institution_id uuid DEFAULT NULL,
  p_hours integer DEFAULT 24,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid, occurred_at timestamptz, lead_id uuid, institution_id uuid,
  tier_order integer, sqlstate text, error_message text, context jsonb,
  resulted_in_unassigned boolean, resolved_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT id, occurred_at, lead_id, institution_id, tier_order, sqlstate,
         error_message, context, resulted_in_unassigned, resolved_at
    FROM public.counselor_routing_errors
   WHERE occurred_at > now() - make_interval(hours => p_hours)
     AND (p_institution_id IS NULL OR institution_id = p_institution_id)
   ORDER BY occurred_at DESC
   LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.fn_routing_errors_recent(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_routing_errors_recent(uuid, integer, integer) TO service_role;

COMMENT ON TABLE public.counselor_routing_errors IS
  'Observability surface for fn_auto_assign_counselor_v2 routing failures. Writer side ships in follow-up PR; this table is intentionally unwritten today.';
