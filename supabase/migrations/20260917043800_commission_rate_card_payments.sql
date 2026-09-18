-- Consultant commission payments against the service-charge rate card
-- Created 2026-09-16. Builds on 20260917043700_commission_rate_card.
--
-- Paid / Balance / Excess, per institution line of the card:
--   * Payments are recorded as LUMP SUMS per consultant per card group
--     ("Paid 1,05,000 for Nursing 2026-27"), not per student. The card prices a
--     COUNT (slabs), not individual students, so a lump sum is what is actually
--     owed and paid (decision 2026-09-16).
--   * net paid  = payments - recoveries
--   * balance   = earned - net paid, when positive  (still to pay)
--   * excess    = net paid - earned, when positive  (to recover)
--   Excess therefore appears automatically when a paid-for student leaves
--   Account/Admitted/Active (e.g. goes to Rejected), and also when that drop
--   pulls the count into a lower slab. Recording a 'recovery' clears it.
--
-- NOTE: this replaces fn_consultant_rate_card_earnings with a wider return type.
-- Do not re-run section 5 of 20260916090000 after this file; it would fail on
-- the changed signature.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Payments ledger
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commission_rate_card_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id  uuid NOT NULL REFERENCES public.education_consultants(id) ON DELETE CASCADE,
  -- RESTRICT: a card group with money recorded against it must not disappear.
  group_id       uuid NOT NULL REFERENCES public.commission_rate_card_groups(id) ON DELETE RESTRICT,
  entry_type     text NOT NULL DEFAULT 'payment' CHECK (entry_type IN ('payment', 'recovery')),
  amount         numeric NOT NULL CHECK (amount > 0),   -- always positive; entry_type gives the sign
  paid_on        date NOT NULL DEFAULT CURRENT_DATE,
  payment_mode   text,
  reference      text,
  notes          text,
  created_by     uuid REFERENCES public.profiles(id),
  updated_by     uuid REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_card_payments_consultant
  ON public.commission_rate_card_payments (consultant_id, group_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS — read like the card; recording money needs the manage permission.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.commission_rate_card_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commission_rate_card_payments FROM anon, PUBLIC;  -- agency money; anon gets nothing

DROP POLICY IF EXISTS commission_rate_card_payments_read ON public.commission_rate_card_payments;
CREATE POLICY commission_rate_card_payments_read ON public.commission_rate_card_payments
  FOR SELECT USING (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT user_has_permission('admission.consultants.commissions.view')));

DROP POLICY IF EXISTS commission_rate_card_payments_write ON public.commission_rate_card_payments;
CREATE POLICY commission_rate_card_payments_write ON public.commission_rate_card_payments
  FOR ALL
  USING ((SELECT is_super_admin()) OR (SELECT is_admin())
         OR (SELECT user_has_permission('admission.consultants.commissions.manage')))
  WITH CHECK ((SELECT is_super_admin()) OR (SELECT is_admin())
         OR (SELECT user_has_permission('admission.consultants.commissions.manage')));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Resolver, now with paid / balance / excess per group
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_consultant_rate_card_earnings(uuid, integer);

CREATE FUNCTION public.fn_consultant_rate_card_earnings(
  p_consultant_id uuid,
  p_academic_year integer DEFAULT NULL)   -- NULL = the newest active card
RETURNS TABLE (
  group_id          uuid,
  group_name        text,
  priority          integer,
  qualifying_count  bigint,
  slab_min          integer,
  slab_max          integer,
  rate_amount       numeric,
  total_amount      numeric,
  paid_amount       numeric,
  balance_amount    numeric,
  excess_amount     numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH card AS (
    SELECT c.id, c.academic_year
      FROM public.commission_rate_cards c
     WHERE c.is_active
       AND (p_academic_year IS NULL OR c.academic_year = p_academic_year)
       -- SECURITY DEFINER bypasses RLS and this takes any consultant id, so the
       -- caller is gated here: without the gate every signed-in user could read
       -- every agency's money. No card row = empty result, not an error.
       AND (auth.role() = 'service_role'
            OR (SELECT is_super_admin()) OR (SELECT is_admin())
            OR (SELECT user_has_permission('admission.consultants.commissions.view')))
     ORDER BY c.academic_year DESC
     LIMIT 1
  ),
  -- Every referral of this consultant, collapsed to the learner it resolves to.
  -- COALESCE across both attribution paths: roughly half of all attributions are
  -- written with admission_id NULL and the learner hanging off the attribution's
  -- own learner_profile_id, so reading either path alone silently loses rows.
  referred AS (
    SELECT DISTINCT COALESCE(a.learner_profile_id, al.learner_profile_id) AS learner_profile_id
      FROM public.consultant_lead_attributions a
      LEFT JOIN public.admission_leads al ON al.id = a.admission_id
     WHERE a.consultant_id = p_consultant_id
       AND COALESCE(a.learner_profile_id, al.learner_profile_id) IS NOT NULL
  ),
  -- Narrowed to the card's intake year and to the three statuses that earn:
  -- account / admitted / active.
  qualifying AS (
    SELECT lp.id, lp.institution_id, lp.degree_id, lp.program_id,
           upper(btrim(COALESCE(lp.entry_type, ''))) AS entry_type
      FROM referred r
      JOIN public.learners_profiles lp ON lp.id = r.learner_profile_id
      JOIN public.admission_years ay   ON ay.id = lp.admission_year_id
      CROSS JOIN card
     WHERE ay.year = card.academic_year
       AND lp.lifecycle_status IN ('account', 'admitted', 'active')
  ),
  -- First matching group by priority, so each admission is counted exactly once.
  assigned AS (
    SELECT q.id,
           (SELECT g.id
              FROM public.commission_rate_card_groups g, card
             WHERE g.card_id = card.id
               AND (cardinality(g.institution_ids) = 0 OR q.institution_id = ANY (g.institution_ids))
               AND (cardinality(g.degree_ids)      = 0 OR q.degree_id      = ANY (g.degree_ids))
               AND (cardinality(g.program_ids)     = 0 OR q.program_id     = ANY (g.program_ids))
               AND (cardinality(g.entry_types)     = 0 OR q.entry_type     = ANY (SELECT upper(btrim(e)) FROM unnest(g.entry_types) e))
             ORDER BY g.priority, g.name
             LIMIT 1) AS group_id
      FROM qualifying q
  ),
  counts AS (
    SELECT g.id, g.name, g.priority,
           COALESCE((SELECT count(*) FROM assigned a WHERE a.group_id = g.id), 0) AS qualifying_count,
           COALESCE((SELECT sum(CASE WHEN p.entry_type = 'recovery' THEN -p.amount ELSE p.amount END)
                       FROM public.commission_rate_card_payments p
                      WHERE p.consultant_id = p_consultant_id AND p.group_id = g.id), 0) AS paid_amount
      FROM public.commission_rate_card_groups g, card
     WHERE g.card_id = card.id
  ),
  earned AS (
    SELECT c.*, s.min_count, s.max_count, s.amount AS rate_amount,
           COALESCE(c.qualifying_count * s.amount, 0) AS earned_amount
      FROM counts c
      -- The reached slab applies to the whole count (decision 2026-09-16), so this
      -- is one lookup on the final count, not a progressive sum over the bands.
      LEFT JOIN LATERAL (
        SELECT s.min_count, s.max_count, s.amount
          FROM public.commission_rate_card_slabs s
         WHERE s.group_id = c.id
           AND c.qualifying_count >= s.min_count
           AND (s.max_count IS NULL OR c.qualifying_count <= s.max_count)
         ORDER BY s.min_count DESC
         LIMIT 1
      ) s ON true
  )
  SELECT e.id, e.name, e.priority, e.qualifying_count,
         e.min_count, e.max_count, e.rate_amount,
         CASE WHEN e.rate_amount IS NULL THEN NULL ELSE e.earned_amount END,
         e.paid_amount,
         GREATEST(e.earned_amount - e.paid_amount, 0),
         GREATEST(e.paid_amount - e.earned_amount, 0)
    FROM earned e
   ORDER BY e.priority, e.name;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_consultant_rate_card_earnings(uuid,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_consultant_rate_card_earnings(uuid,integer) TO authenticated;
