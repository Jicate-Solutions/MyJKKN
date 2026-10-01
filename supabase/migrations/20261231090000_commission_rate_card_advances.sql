-- Advances against the service-charge rate card
-- Created 2026-09-21. Director, same day: "I am giving an advance of Rs 10 lakhs
-- to SMET, how can we adjust it to admissions of SMET?" — plus, on his later
-- instruction, "advances will be attributed to admission year wise".
--
-- BEFORE THIS, AN ADVANCE WAS IMPOSSIBLE. commission_rate_card_payments.group_id
-- was NOT NULL, so every rupee had to be booked against one college line of the
-- card. An advance is not for a college; it is for the agency, and it is consumed
-- as that agency's admissions come in.
--
-- THE SHAPE (his choices, each offered against alternatives):
--   * An advance carries NO college line and MUST carry an academic year. With no
--     line there is nothing else that could say which card it belongs to, so the
--     year is the thing that ties it down: a 2026-27 advance is eaten only by
--     2026-27 admissions.
--   * It is SPREAD ACROSS THE COLLEGE LINES rather than shown as one figure, so
--     each line shows how much of the advance it consumed.
--   * The spreading rule is DOWN THE CARD IN ITS PRINTED ORDER (group priority,
--     then name), filling each line's outstanding balance until the advance runs
--     out. Chosen over a proportional split because it can be checked by eye and
--     because a proportional split moves every line's figure whenever any one
--     line changes.
--   * What happens to an unused advance is decided PER AGENCY when it is recorded:
--     carry_forward (it stands against next year) or recoverable (it shows as
--     money to get back). The system records the decision; it does not make it.
--
-- WHAT IS DELIBERATELY NOT HERE: nothing carries an advance into another year by
-- itself. carry_forward records the intention; moving it is a separate decision
-- the Director has not been asked for.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. An entry may now be an advance, which has a year and no college line
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.commission_rate_card_payments
  ALTER COLUMN group_id DROP NOT NULL;

ALTER TABLE public.commission_rate_card_payments
  ADD COLUMN IF NOT EXISTS academic_year integer,
  ADD COLUMN IF NOT EXISTS advance_disposition text;

ALTER TABLE public.commission_rate_card_payments
  DROP CONSTRAINT IF EXISTS commission_rate_card_payments_entry_type_check;
ALTER TABLE public.commission_rate_card_payments
  ADD CONSTRAINT commission_rate_card_payments_entry_type_check
  CHECK (entry_type = ANY (ARRAY['payment'::text, 'recovery'::text, 'advance'::text]));

-- The shape of a row is decided by what it is. A payment belongs to a line; an
-- advance belongs to a year. Neither can pretend to be the other.
ALTER TABLE public.commission_rate_card_payments
  DROP CONSTRAINT IF EXISTS commission_rate_card_payments_shape;
ALTER TABLE public.commission_rate_card_payments
  ADD CONSTRAINT commission_rate_card_payments_shape CHECK (
    CASE entry_type
      WHEN 'advance' THEN
        group_id IS NULL
        AND academic_year IS NOT NULL
        AND advance_disposition IN ('carry_forward', 'recoverable')
      ELSE
        group_id IS NOT NULL
        AND academic_year IS NULL
        AND advance_disposition IS NULL
    END
  );

CREATE INDEX IF NOT EXISTS idx_rate_card_advances_consultant_year
  ON public.commission_rate_card_payments (consultant_id, academic_year)
  WHERE entry_type = 'advance';

COMMENT ON COLUMN public.commission_rate_card_payments.academic_year IS
  'Advances only: the intake year this advance is given against. A 2026-27 advance is consumed only by 2026-27 admissions.';
COMMENT ON COLUMN public.commission_rate_card_payments.advance_disposition IS
  'Advances only: what happens to the unused part — carry_forward (stands against next year) or recoverable (money to get back).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Earnings resolver — now also spreads the year's advances down the card
--
--    DROP first: the return type gains advance_applied. Appended LAST again, so
--    callers reading the earlier columns are untouched.
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
  excess_amount     numeric,
  is_override       boolean,
  advance_applied   numeric
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
  -- The pool this year's advances make available. Advances carry no college line,
  -- so they are matched on the card's own year, never on a group.
  advance_pool AS (
    SELECT COALESCE(sum(p.amount), 0) AS pool
      FROM public.commission_rate_card_payments p, card
     WHERE p.consultant_id = p_consultant_id
       AND p.entry_type = 'advance'
       AND p.academic_year = card.academic_year
  ),
  counts AS (
    SELECT g.id, g.name, g.priority,
           COALESCE((SELECT count(*) FROM assigned a WHERE a.group_id = g.id), 0) AS qualifying_count,
           -- Line payments only. An advance is not a payment against a line and
           -- must not be counted twice.
           COALESCE((SELECT sum(CASE WHEN p.entry_type = 'recovery' THEN -p.amount ELSE p.amount END)
                       FROM public.commission_rate_card_payments p
                      WHERE p.consultant_id = p_consultant_id
                        AND p.group_id = g.id
                        AND p.entry_type IN ('payment', 'recovery')), 0) AS paid_amount,
           EXISTS (SELECT 1 FROM public.commission_rate_card_slabs o
                    WHERE o.group_id = g.id AND o.consultant_id = p_consultant_id) AS has_override
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
           AND (CASE WHEN c.has_override
                     THEN s.consultant_id = p_consultant_id
                     ELSE s.consultant_id IS NULL END)
           AND c.qualifying_count >= s.min_count
           AND (s.max_count IS NULL OR c.qualifying_count <= s.max_count)
         ORDER BY s.min_count DESC
         LIMIT 1
      ) s ON true
  ),
  owed AS (
    SELECT e.*, GREATEST(e.earned_amount - e.paid_amount, 0) AS net_owed
      FROM earned e
  ),
  -- Spread the pool DOWN THE CARD in printed order. owed_before is everything the
  -- lines above this one had outstanding, so what is left for this line is the
  -- pool minus that — and it takes the smaller of that and its own balance.
  walked AS (
    SELECT o.*,
           COALESCE(sum(o.net_owed) OVER (ORDER BY o.priority, o.name
                     ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS owed_before
      FROM owed o
  )
  SELECT w.id, w.name, w.priority, w.qualifying_count,
         w.min_count, w.max_count, w.rate_amount,
         CASE WHEN w.rate_amount IS NULL THEN NULL ELSE w.earned_amount END,
         w.paid_amount,
         GREATEST(w.net_owed - LEAST(w.net_owed, GREATEST(ap.pool - w.owed_before, 0)), 0),
         GREATEST(w.paid_amount - w.earned_amount, 0),
         w.has_override,
         LEAST(w.net_owed, GREATEST(ap.pool - w.owed_before, 0))
    FROM walked w CROSS JOIN advance_pool ap
   ORDER BY w.priority, w.name;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_consultant_rate_card_earnings(uuid,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_consultant_rate_card_earnings(uuid,integer) TO authenticated;
