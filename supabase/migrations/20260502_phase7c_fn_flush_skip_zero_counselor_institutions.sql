-- ============================================================================
-- 20260502_phase7c_fn_flush_skip_zero_counselor_institutions.sql
-- ============================================================================
--
-- Phase 7c — fixes a cap-exhaustion bug in fn_flush_queued_leads that prevented
-- the cron's queue flush from routing ANY leads for 3+ days, despite the
-- routing engine being functionally correct and Phase 7b having seeded
-- junction mappings for 40 admission_counselors.
--
-- Bug pinpointed empirically 2026-05-02 07:30 IST via Supabase MCP probes:
--
--   1. fn_flush_queued_leads() returned 0 rows when called directly,
--      despite 10,035 unassigned leads existing in 'new' funnel_stage.
--
--   2. Trace showed: function iterated 5 leads, all returned 'no_counselor'.
--      No exceptions — the candidate-CTEs simply returned empty.
--
--   3. Root cause: The FOR loop ordering `ORDER BY created_at ASC LIMIT 500`
--      ran against 10,035 unassigned leads. Of the OLDEST 500:
--        - 205 at Jicate Solutions      (0 active counselors)
--        - 194 at Arts & Sci (Self)     (0 active counselors)
--        -  99 at Dental College        (0 active counselors)
--        -   2 at College of Education  (0 active counselors)
--      = 500 / 500 = 100% at zero-counselor institutions.
--
--   4. The cap-policy assumed even distribution. Reality: stock concentrates
--      at unstaffed institutions because routable institutions clear faster.
--      The cap exhausts on impossible-to-route leads, never reaching newer
--      leads at Engineering / Nursing / Allied Health where Phase 7b had
--      added 40 routable counselors.
--
--   5. Last actual assignment in admission_leads.assigned_at was
--      2026-04-29 16:30 UTC — the cron had been firing into a black hole
--      for 65 hours (260+ runs).
--
-- Fix: add `EXISTS` filter to skip leads at institutions with zero active
-- admission_counselors. The cap can then be spent on routable leads.
--
-- Verified empirically 2026-05-02 07:50 IST after applying via Supabase MCP:
--   fn_flush_queued_leads() returns 500 rows (was 0)
--   Unassigned ratio: 65.46% → 59.06% (-6.4 pts) on first run
--   1,000 leads routed in 5 minutes (= 2 cron-equivalent runs)
--
-- Already applied to prod via Supabase MCP apply_migration on 2026-05-02 07:48 IST.
-- This file is the git-tracked record of that DDL change.
--
-- The FLOOR: ~5,297 unassigned leads remain at institutions with 0 active
-- admission_counselors (Jicate Solutions: 2,815, Arts & Sci Self: ~1,000+,
-- Dental: 588, plus smaller). This bug fix CANNOT route those — Director
-- decision required (staff those institutions, OR mark stale leads as
-- terminal). Without that, the locked metric (admission-counselors-quickwins
-- threshold <30% by 2026-08-01) will plateau around ~34%.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_flush_queued_leads()
 RETURNS TABLE(lead_id uuid, assigned_counselor_id uuid, assigned_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cap              INT;
  v_lead             RECORD;
  v_new_counselor_id UUID;
BEGIN
  v_cap := COALESCE((get_routing_config('cap_per_run')->>'max_assignments')::INT, 500);

  FOR v_lead IN
    SELECT al.id AS lead_id, al.institution_id, al.source
    FROM admission_leads al
    WHERE al.counselor_id IS NULL
      AND al.funnel_stage IN ('new','contacted','not_reachable','interested','follow_up_scheduled')
      AND al.institution_id IS NOT NULL
      -- Phase 7c fix: skip leads at institutions with 0 active admission_counselors —
      -- otherwise the LIMIT cap exhausts on unroutable leads at unstaffed institutions
      -- and the cron never reaches newer leads at staffed institutions.
      AND EXISTS (
        SELECT 1 FROM admission_counselors c
        WHERE c.institution_id = al.institution_id AND c.is_active = TRUE
      )
    ORDER BY al.created_at ASC
    LIMIT v_cap
  LOOP
    BEGIN
      WITH
      tier1_candidates AS (
        SELECT c.id, COUNT(al2.id) AS open_load
        FROM admission_counselors c
        JOIN admission_counselor_institutions ci ON ci.counselor_id = c.id
        JOIN admission_counselor_sources cs      ON cs.counselor_id = c.id
        JOIN admission_lead_sources_master slm   ON slm.id = cs.source_id
                                               AND slm.key = v_lead.source::text
        LEFT JOIN admission_leads al2 ON al2.counselor_id = c.id
          AND al2.funnel_stage NOT IN ('enrolled','confirmed','declined','withdrew','expired','lost','dormant')
        WHERE ci.institution_id = v_lead.institution_id
          AND fn_is_counselor_on_duty(c.id, CURRENT_DATE)
        GROUP BY c.id
      ),
      tier2_candidates AS (
        SELECT c.id, COUNT(al2.id) AS open_load
        FROM admission_counselors c
        JOIN admission_counselor_institutions ci ON ci.counselor_id = c.id
        LEFT JOIN admission_leads al2 ON al2.counselor_id = c.id
          AND al2.funnel_stage NOT IN ('enrolled','confirmed','declined','withdrew','expired','lost','dormant')
        WHERE ci.institution_id = v_lead.institution_id
          AND fn_is_counselor_on_duty(c.id, CURRENT_DATE)
        GROUP BY c.id
      ),
      tier3_candidates AS (
        SELECT c.id, COUNT(al2.id) AS open_load
        FROM admission_counselors c
        LEFT JOIN admission_leads al2 ON al2.counselor_id = c.id
          AND al2.funnel_stage NOT IN ('enrolled','confirmed','declined','withdrew','expired','lost','dormant')
        WHERE c.institution_id = v_lead.institution_id
          AND c.is_active = TRUE
        GROUP BY c.id
      )
      SELECT id INTO v_new_counselor_id
      FROM (
        SELECT id, open_load, 1 AS tier FROM tier1_candidates
        UNION ALL
        SELECT id, open_load, 2 AS tier FROM tier2_candidates WHERE NOT EXISTS (SELECT 1 FROM tier1_candidates)
        UNION ALL
        SELECT id, open_load, 3 AS tier FROM tier3_candidates
          WHERE NOT EXISTS (SELECT 1 FROM tier1_candidates)
            AND NOT EXISTS (SELECT 1 FROM tier2_candidates)
      ) all_tiers
      ORDER BY tier ASC, open_load ASC, RANDOM()
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_new_counselor_id := NULL;
    END;

    IF v_new_counselor_id IS NOT NULL THEN
      UPDATE admission_leads
        SET counselor_id = v_new_counselor_id, assigned_at = now()
      WHERE id = v_lead.lead_id;

      INSERT INTO admission_lead_cascade_history (
        lead_id, from_counselor_id, to_counselor_id, reason, cascaded_at, triggered_by, metadata
      ) VALUES (
        v_lead.lead_id, NULL, v_new_counselor_id, 'queue_flush', now(), NULL,
        jsonb_build_object('source', v_lead.source::text, 'institution_id', v_lead.institution_id)
      );

      lead_id               := v_lead.lead_id;
      assigned_counselor_id := v_new_counselor_id;
      assigned_at           := now();
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$function$;
