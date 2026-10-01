-- Per-consultant rate ladders on the service-charge rate card
-- Created 2026-09-21. Director ruling, same day: "a default rate card, and then
-- tweaks for consultants like SMET" — and a tweak is THEIR OWN LADDER on that
-- line, replacing the standard ladder for that agency only.
--
-- WHY A COLUMN AND NOT A NEW TABLE:
--   The card already splits into groups (its printed lines). A tweak that hangs
--   off a group is, by construction, "this agency, on this line of the card" —
--   it can never drift from the card, and the earnings resolver already works
--   group by group, so the override slots into exactly one place.
--   A second CARD for one agency is impossible by design: uq_commission_rate_card_year
--   allows one active card per year so that "the rate" is never ambiguous.
--   consultant_commission_structures was considered and rejected: it scopes by
--   institution / degree / programme and has no notion of entry_type, so it
--   cannot express the card's "Engineering UG ( Lateral & Transfer )" line at
--   all, and its volume_tiers jsonb is written by no code path.
--
-- SEMANTICS (the Director's choice, of three offered):
--   * consultant_id NULL  = the standard ladder for that group. Today's 21 rows.
--   * consultant_id SET   = that agency's OWN ladder for that group.
--   * If an agency has ANY slab on a group, ONLY their slabs are used for that
--     group. Their ladder REPLACES the standard one; it never merges with it and
--     never tops it up.
--   * An agency with no slab on a group falls through to the standard ladder,
--     so one override never disturbs the other ten lines or the other 186 agencies.
--
-- NOT SILENT: if an agency's own ladder has no band covering their count, the
-- resolver returns NULL (not 0) exactly as the standard card does, and the panel
-- already renders that as "Not earned" rather than a zero that looks settled.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The column, plus an audit trail — this is money config
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.commission_rate_card_slabs
  ADD COLUMN IF NOT EXISTS consultant_id uuid
    REFERENCES public.education_consultants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS note text;

COMMENT ON COLUMN public.commission_rate_card_slabs.consultant_id IS
  'NULL = the standard ladder for this group. Set = this agency''s own ladder, which replaces the standard one for this group only.';
COMMENT ON COLUMN public.commission_rate_card_slabs.note IS
  'Why this agency is off the standard card — the signed letter, the meeting, the date.';

CREATE INDEX IF NOT EXISTS idx_rate_card_slabs_group_consultant
  ON public.commission_rate_card_slabs (group_id, consultant_id, min_count);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. No two bands may overlap within one ladder
--
--    Without this, "1–25 at 30,000" and "20–40 at 35,000" can both exist and the
--    rate a learner earns depends on row order. COALESCE to a sentinel because an
--    exclusion constraint treats NULL consultant_id rows as never conflicting,
--    which would leave the STANDARD ladder unprotected — the case that matters most.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commission_rate_card_slabs_no_overlap') THEN
    ALTER TABLE public.commission_rate_card_slabs
      ADD CONSTRAINT commission_rate_card_slabs_no_overlap
      EXCLUDE USING gist (
        group_id WITH =,
        (COALESCE(consultant_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
        -- int8range so the open-ended top band ("51 and above") cannot overflow
        -- int4 the way an inclusive 2147483647 upper bound does. Half-open [ ),
        -- so max_count + 1; NULL upper bound means unbounded.
        (int8range(min_count::bigint,
                   CASE WHEN max_count IS NULL THEN NULL ELSE max_count::bigint + 1 END)) WITH &&
      );
  END IF;
END $$;

-- A band must also read forwards.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commission_rate_card_slabs_band_sane') THEN
    ALTER TABLE public.commission_rate_card_slabs
      ADD CONSTRAINT commission_rate_card_slabs_band_sane
      CHECK (min_count >= 1 AND (max_count IS NULL OR max_count >= min_count) AND amount >= 0);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Earnings resolver — unchanged for every agency on the standard card
--
--    DROP first: the return type gains is_override, so CREATE OR REPLACE would
--    fail against the live signature (same reason 20260917043800 dropped it).
--    is_override is appended LAST so existing callers reading the earlier columns
--    are unaffected.
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
  is_override       boolean
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
                      WHERE p.consultant_id = p_consultant_id AND p.group_id = g.id), 0) AS paid_amount,
           -- Does this agency have its own ladder on this line? If so it is the
           -- ONLY ladder consulted for this line.
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
  )
  SELECT e.id, e.name, e.priority, e.qualifying_count,
         e.min_count, e.max_count, e.rate_amount,
         CASE WHEN e.rate_amount IS NULL THEN NULL ELSE e.earned_amount END,
         e.paid_amount,
         GREATEST(e.earned_amount - e.paid_amount, 0),
         GREATEST(e.paid_amount - e.earned_amount, 0),
         e.has_override
    FROM earned e
   ORDER BY e.priority, e.name;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_consultant_rate_card_earnings(uuid,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_consultant_rate_card_earnings(uuid,integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Access — unchanged and deliberate.
--
--    The slabs table's existing write policy is is_super_admin() OR is_admin().
--    Setting an agency's own rate is rate config, not a payment, so it stays
--    admin-only: the 41 people who may RECORD a payment may not CHANGE a rate.
--    Nothing to add here; this note exists so the next reader does not "fix" it
--    to admission.consultants.commissions.manage.
-- ─────────────────────────────────────────────────────────────────────────────
