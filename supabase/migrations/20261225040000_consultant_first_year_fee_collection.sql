-- Consultant commission tab: 1st-year fee collection of the counted learners
-- Created 2026-09-19. Read-only resolver, no tables.
--
-- Per institution, for the learners the rate card counts for a consultant
-- (same set as fn_consultant_rate_card_earnings' qualifying_count), how much of
-- their FIRST-YEAR fees has been collected and how much is still owed.
--
--   * First year = bills whose academic year is the learner's admission year
--     (academic_years.academic_year_name = admission_years.admission_year_name,
--     e.g. both '2026-2027'). academic_years rows are per institution, so the
--     match is by name, not id.
--   * Only fee_source 'academic' — tuition, university and application fees.
--     Transport (billed as ad_hoc) and hostel are services, not course fees.
--   * Cancelled and superseded bills are dropped.
--   * balance = balance_amount (0 once paid; final_amount for legacy NULLs);
--     paid = final_amount - balance.
--
-- Bills RLS is scoped to the viewer's own institution, while a consultant's
-- learners span institutions — hence SECURITY DEFINER, gated exactly like
-- fn_consultant_rate_card_earnings.

-- ── 1. Resolver ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_consultant_first_year_fee_collection(
  p_consultant_id uuid,
  p_academic_year integer DEFAULT NULL)   -- NULL = the newest active card
RETURNS TABLE (
  institution_id    uuid,
  institution_name  text,
  learner_count     bigint,
  fee_amount        numeric,
  paid_amount       numeric,
  balance_amount    numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH card AS (
    SELECT c.id, c.academic_year
      FROM public.commission_rate_cards c
     WHERE c.is_active
       AND (p_academic_year IS NULL OR c.academic_year = p_academic_year)
       AND (auth.role() = 'service_role'
            OR (SELECT is_super_admin()) OR (SELECT is_admin())
            OR (SELECT user_has_permission('admission.consultants.commissions.view')))
     ORDER BY c.academic_year DESC
     LIMIT 1
  ),
  -- Same learner set as fn_consultant_rate_card_earnings, so the counts here
  -- add up to the "Learners" figure on the Commission Earned card.
  referred AS (
    SELECT DISTINCT COALESCE(a.learner_profile_id, al.learner_profile_id) AS learner_profile_id
      FROM public.consultant_lead_attributions a
      LEFT JOIN public.admission_leads al ON al.id = a.admission_id
     WHERE a.consultant_id = p_consultant_id
       AND COALESCE(a.learner_profile_id, al.learner_profile_id) IS NOT NULL
  ),
  qualifying AS (
    SELECT lp.id, lp.institution_id, lp.degree_id, lp.program_id,
           upper(btrim(COALESCE(lp.entry_type, ''))) AS entry_type,
           ay.admission_year_name
      FROM referred r
      JOIN public.learners_profiles lp ON lp.id = r.learner_profile_id
      JOIN public.admission_years ay   ON ay.id = lp.admission_year_id
      CROSS JOIN card
     WHERE ay.year = card.academic_year
       AND lp.lifecycle_status IN ('account', 'admitted', 'active')
  ),
  -- Only learners that land in a card group are counted by the earnings card.
  counted AS (
    SELECT q.*
      FROM qualifying q
     WHERE EXISTS (
       SELECT 1
         FROM public.commission_rate_card_groups g, card
        WHERE g.card_id = card.id
          AND (cardinality(g.institution_ids) = 0 OR q.institution_id = ANY (g.institution_ids))
          AND (cardinality(g.degree_ids)      = 0 OR q.degree_id      = ANY (g.degree_ids))
          AND (cardinality(g.program_ids)     = 0 OR q.program_id     = ANY (g.program_ids))
          AND (cardinality(g.entry_types)     = 0 OR q.entry_type     = ANY (SELECT upper(btrim(e)) FROM unnest(g.entry_types) e)))
  ),
  fees AS (
    SELECT q.id AS learner_id,
           COALESCE(sum(b.final_amount), 0) AS fee_amount,
           COALESCE(sum(CASE WHEN b.status = 'paid' THEN 0
                             ELSE COALESCE(b.balance_amount, b.final_amount) END), 0) AS balance_amount
      FROM counted q
      LEFT JOIN public.billing_student_bills b
             ON b.student_id = q.id
            AND b.fee_source = 'academic'
            AND b.status NOT IN ('cancelled', 'superseded')
            AND EXISTS (SELECT 1 FROM public.academic_years ayr
                         WHERE ayr.id = b.academic_year_id
                           AND ayr.academic_year_name = q.admission_year_name)
     GROUP BY q.id
  )
  SELECT q.institution_id,
         i.name::text,
         count(*),
         sum(f.fee_amount),
         sum(f.fee_amount - f.balance_amount),
         sum(f.balance_amount)
    FROM counted q
    JOIN fees f ON f.learner_id = q.id
    LEFT JOIN public.institutions i ON i.id = q.institution_id
   GROUP BY q.institution_id, i.name
   ORDER BY i.name;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_consultant_first_year_fee_collection(uuid,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_consultant_first_year_fee_collection(uuid,integer) TO authenticated;
