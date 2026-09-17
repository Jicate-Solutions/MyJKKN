-- Consultant service-charge rate card — "Service Charges 2026-27"
-- Created 2026-09-16.
--
-- WHY A NEW TABLE (not consultant_commission_structures):
--   The signed rate card is ONE table that every agency is paid against — the same
--   slabs for all 187 consultants. consultant_commission_structures has
--   consultant_id NOT NULL, so expressing "the standard card" there means 187 x 12
--   duplicated rows and a 187-row rewrite every time a rupee figure is corrected.
--   It also cannot express the card's actual shape: a rupee amount that steps with
--   the COUNT of admissions (its volume_tiers jsonb is never written by any code
--   path, and its only writable money fields are a 0-100 percentage or a single
--   flat amount). referral_rate_config is closer but is flat-per-programme with no
--   count dimension. So: a small purpose-built card, groups, slabs.
--
-- SHAPE (as issued, and as confirmed with the Director 2026-09-16):
--   * Count that selects the slab = admissions in the card's academic year whose
--     learner lifecycle_status is one of account / admitted / active. Nothing else
--     counts — not enquiry_submitted, not reserved, not rejected.
--   * The count is PER GROUP (per college), never pooled across colleges.
--   * The reached slab applies to the WHOLE count, not progressively. 12 Arts &
--     Science admissions = 12 x 6000, not 10 x 5000 + 2 x 6000.
--
-- Engineering "Lateral & Transfer" needed no new column: learners_profiles.entry_type
-- is already populated with 'LATERAL ENTRY' (950 rows) and 'COLLEGE TRANSFER' (4).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The card
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commission_rate_cards (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  academic_year  integer NOT NULL,          -- 2026 = the "2026-27" intake
  notes          text,
  effective_from date,
  effective_to   date,
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
-- Only one card can be live for a year; otherwise "the rate" is ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_rate_card_year
  ON public.commission_rate_cards (academic_year) WHERE is_active;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Groups — one row per line of the printed card ("Arts & Science",
--    "Engineering UG ( Regular )", …).
--
--    Matching is FIRST MATCH BY priority, not most-specific-wins. An admission is
--    counted in exactly one group, and which one is readable straight off the
--    table instead of being inferred from a scoring rule. Empty array = "any".
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commission_rate_card_groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id         uuid NOT NULL REFERENCES public.commission_rate_cards(id) ON DELETE CASCADE,
  name            text NOT NULL,
  priority        integer NOT NULL DEFAULT 0,   -- lower = tested first
  institution_ids uuid[] NOT NULL DEFAULT '{}',
  degree_ids      uuid[] NOT NULL DEFAULT '{}',
  program_ids     uuid[] NOT NULL DEFAULT '{}',
  entry_types     text[] NOT NULL DEFAULT '{}', -- matched case-insensitively
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_card_groups_card
  ON public.commission_rate_card_groups (card_id, priority);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Slabs — "1 to 10 -> 5000". max_count NULL = "& above".
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commission_rate_card_slabs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES public.commission_rate_card_groups(id) ON DELETE CASCADE,
  min_count  integer NOT NULL CHECK (min_count >= 1),
  max_count  integer CHECK (max_count IS NULL OR max_count >= min_count),
  amount     numeric NOT NULL CHECK (amount >= 0),   -- gross rupees PER admission
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_card_slabs_group
  ON public.commission_rate_card_slabs (group_id, min_count);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS — read follows the page permission so a user never sees the tab and then
--    gets denied its data. Writing rates is money config, so admin-only.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.commission_rate_cards       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rate_card_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rate_card_slabs  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['commission_rate_cards','commission_rate_card_groups','commission_rate_card_slabs']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON public.%I', t, t);
    EXECUTE format($p$CREATE POLICY %I_read ON public.%I FOR SELECT USING (
      (SELECT is_super_admin()) OR (SELECT is_admin())
      OR (SELECT user_has_permission('admission.consultants.commissions.view')))$p$, t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format($p$CREATE POLICY %I_write ON public.%I FOR ALL
      USING ((SELECT is_super_admin()) OR (SELECT is_admin()))
      WITH CHECK ((SELECT is_super_admin()) OR (SELECT is_admin()))$p$, t, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Earnings resolver — the card applied to one consultant's real referrals.
--
--    Returns one row per group, ALWAYS (groups with no qualifying admission come
--    back with count 0 and amount NULL) so the UI can render the full printed card
--    rather than only the lines that happen to have earned something.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_consultant_rate_card_earnings(
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
  total_amount      numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH card AS (
    SELECT c.id, c.academic_year
      FROM public.commission_rate_cards c
     WHERE c.is_active
       AND (p_academic_year IS NULL OR c.academic_year = p_academic_year)
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
           COALESCE((SELECT count(*) FROM assigned a WHERE a.group_id = g.id), 0) AS qualifying_count
      FROM public.commission_rate_card_groups g, card
     WHERE g.card_id = card.id
  )
  SELECT c.id, c.name, c.priority, c.qualifying_count,
         s.min_count, s.max_count, s.amount,
         CASE WHEN s.amount IS NULL THEN NULL ELSE c.qualifying_count * s.amount END
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
   ORDER BY c.priority, c.name;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_consultant_rate_card_earnings(uuid,integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_consultant_rate_card_earnings(uuid,integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Seed — "Service Charges 2026-27", exactly as issued.
--    Institution/programme ids are resolved by name so the seed is re-runnable
--    and readable; a name that does not resolve leaves an empty matcher rather
--    than silently matching everything, which the guard below catches.
-- ─────────────────────────────────────────────────────────────────────────────
DO $seed$
DECLARE
  v_card uuid;
  v_grp  uuid;
  cas_self  uuid; cas_aided uuid; cet uuid; pharm uuid;
  nursing uuid; ahs uuid; dental uuid; edu uuid;
  cet_ug uuid; cet_pg uuid;
  p_bpharm uuid[]; p_pharmd uuid[]; p_pbpharmd uuid[];
BEGIN
  SELECT id INTO cas_self  FROM institutions WHERE name = 'JKKN College of Arts and Science (Self)';
  SELECT id INTO cas_aided FROM institutions WHERE name = 'JKKN College of Arts and Science (Aided)';
  SELECT id INTO cet       FROM institutions WHERE name = 'JKKN College of Engineering and Technology';
  SELECT id INTO pharm     FROM institutions WHERE name = 'JKKN College of Pharmacy';
  SELECT id INTO nursing   FROM institutions WHERE name = 'JKKN College of Nursing and Research';
  SELECT id INTO ahs       FROM institutions WHERE name = 'JKKN College of Allied Health Sciences';
  SELECT id INTO dental    FROM institutions WHERE name = 'JKKN Dental College and Hospital';
  SELECT id INTO edu       FROM institutions WHERE name = 'JKKN College of Education';

  SELECT id INTO cet_ug FROM degrees WHERE institution_id = cet AND degree_name = 'Undergraduate';
  SELECT id INTO cet_pg FROM degrees WHERE institution_id = cet AND degree_name = 'Postgraduate';

  SELECT array_agg(id) INTO p_bpharm   FROM programs WHERE institution_id = pharm
    AND (program_name ILIKE 'BPHARM%' OR program_name ILIKE 'B.PHARM%' OR program_name ILIKE 'MPHARM%' OR program_name ILIKE 'M.PHARM%');
  SELECT array_agg(id) INTO p_pharmd   FROM programs WHERE institution_id = pharm AND program_name = 'PHARMD';
  SELECT array_agg(id) INTO p_pbpharmd FROM programs WHERE institution_id = pharm AND program_name = 'PHARM D PB';

  IF cas_self IS NULL OR cet IS NULL OR pharm IS NULL OR nursing IS NULL
     OR ahs IS NULL OR dental IS NULL OR edu IS NULL OR cet_ug IS NULL OR cet_pg IS NULL
     OR p_bpharm IS NULL OR p_pharmd IS NULL OR p_pbpharmd IS NULL THEN
    RAISE EXCEPTION 'Rate card seed aborted: a college/degree/programme name did not resolve';
  END IF;

  -- Seed once. Payments (20260916120000) reference these groups, so the card is
  -- never deleted and rebuilt: that would either cascade-lose payment history or
  -- be blocked by the FK. Correct a rate with an UPDATE on its slab instead.
  IF EXISTS (SELECT 1 FROM public.commission_rate_cards WHERE academic_year = 2026 AND name = 'Service Charges 2026-27') THEN
    RAISE NOTICE 'Service Charges 2026-27 already seeded; leaving it untouched';
    RETURN;
  END IF;

  INSERT INTO public.commission_rate_cards (name, academic_year, notes, effective_from, effective_to)
  VALUES ('Service Charges 2026-27', 2026,
          'Standard agency service charge, 2026-27 intake. Counted on admissions whose learner status is Account, Admitted or Active. The slab reached applies to the whole count; counts are per college, never pooled.',
          '2026-04-01', '2027-03-31')
  RETURNING id INTO v_card;

  -- Arts & Science — both the Self and Aided campuses.
  INSERT INTO public.commission_rate_card_groups (card_id, name, priority, institution_ids)
  VALUES (v_card, 'Arts & Science', 10, ARRAY[cas_self, cas_aided]) RETURNING id INTO v_grp;
  INSERT INTO public.commission_rate_card_slabs (group_id, min_count, max_count, amount) VALUES
    (v_grp,   1,   10,  5000),
    (v_grp,  11,   30,  6000),
    (v_grp,  31,  100,  7000),
    (v_grp, 101, NULL, 10000);

  -- Engineering UG, lateral/transfer FIRST: it is the narrower read of the same
  -- UG programmes, so it has to be tested before the regular group or every
  -- lateral admission would fall into "Regular".
  INSERT INTO public.commission_rate_card_groups (card_id, name, priority, institution_ids, degree_ids, entry_types, notes)
  VALUES (v_card, 'Engineering UG ( Lateral & Transfer )', 20, ARRAY[cet], ARRAY[cet_ug],
          ARRAY['LATERAL ENTRY','COLLEGE TRANSFER'],
          'Matched on learners_profiles.entry_type. Card ends at 30; confirmed no slab beyond 30 is needed.') RETURNING id INTO v_grp;
  INSERT INTO public.commission_rate_card_slabs (group_id, min_count, max_count, amount) VALUES
    (v_grp,  1, 15, 20000),
    (v_grp, 16, 30, 25000);

  -- Engineering UG ( Regular ) — everything else on a CET undergraduate programme.
  -- The card prints "25 to 40" directly after "11 to 25". Confirmed 2026-09-16:
  -- 25 admissions pay 30000, so the third slab starts at 26.
  INSERT INTO public.commission_rate_card_groups (card_id, name, priority, institution_ids, degree_ids, notes)
  VALUES (v_card, 'Engineering UG ( Regular )', 30, ARRAY[cet], ARRAY[cet_ug],
          'Card prints the third slab as "25 to 40"; confirmed 25 admissions pay 30000, so it is stored as 26-40.') RETURNING id INTO v_grp;
  INSERT INTO public.commission_rate_card_slabs (group_id, min_count, max_count, amount) VALUES
    (v_grp,  1,   10, 25000),
    (v_grp, 11,   25, 30000),
    (v_grp, 26,   40, 35000),
    (v_grp, 41,   50, 40000),
    (v_grp, 51, NULL, 45000);

  -- Engineering PG ( ME & MBA )
  INSERT INTO public.commission_rate_card_groups (card_id, name, priority, institution_ids, degree_ids)
  VALUES (v_card, 'Engineering PG ( ME & MBA )', 40, ARRAY[cet], ARRAY[cet_pg]) RETURNING id INTO v_grp;
  INSERT INTO public.commission_rate_card_slabs (group_id, min_count, max_count, amount) VALUES
    (v_grp,  1,    5, 18000),
    (v_grp,  6,   15, 20000),
    (v_grp, 16, NULL, 25000);

  -- Pharmacy — three separate lines, so programme-scoped. Pharm.D and PB Pharm.D
  -- are tested before the B.Pharm/M.Pharm line purely for readability; the three
  -- programme sets are disjoint, so the order changes nothing.
  INSERT INTO public.commission_rate_card_groups (card_id, name, priority, institution_ids, program_ids)
  VALUES (v_card, 'Pharmacy ( Pharm.D )', 50, ARRAY[pharm], p_pharmd) RETURNING id INTO v_grp;
  INSERT INTO public.commission_rate_card_slabs (group_id, min_count, max_count, amount)
  VALUES (v_grp, 1, NULL, 25000);

  INSERT INTO public.commission_rate_card_groups (card_id, name, priority, institution_ids, program_ids)
  VALUES (v_card, 'Pharmacy ( PB Pharm.D )', 60, ARRAY[pharm], p_pbpharmd) RETURNING id INTO v_grp;
  INSERT INTO public.commission_rate_card_slabs (group_id, min_count, max_count, amount)
  VALUES (v_grp, 1, NULL, 20000);

  INSERT INTO public.commission_rate_card_groups (card_id, name, priority, institution_ids, program_ids)
  VALUES (v_card, 'Pharmacy ( B.Pharm & M.Pharm )', 70, ARRAY[pharm], p_bpharm) RETURNING id INTO v_grp;
  INSERT INTO public.commission_rate_card_slabs (group_id, min_count, max_count, amount)
  VALUES (v_grp, 1, NULL, 20000);

  -- Whole-college lines.
  INSERT INTO public.commission_rate_card_groups (card_id, name, priority, institution_ids)
  VALUES (v_card, 'Nursing ( B.Sc, M.Sc & PBB.Sc )', 80, ARRAY[nursing]) RETURNING id INTO v_grp;
  INSERT INTO public.commission_rate_card_slabs (group_id, min_count, max_count, amount)
  VALUES (v_grp, 1, NULL, 15000);

  INSERT INTO public.commission_rate_card_groups (card_id, name, priority, institution_ids)
  VALUES (v_card, 'Allied Health Science', 90, ARRAY[ahs]) RETURNING id INTO v_grp;
  INSERT INTO public.commission_rate_card_slabs (group_id, min_count, max_count, amount)
  VALUES (v_grp, 1, NULL, 25000);

  INSERT INTO public.commission_rate_card_groups (card_id, name, priority, institution_ids)
  VALUES (v_card, 'Dental', 100, ARRAY[dental]) RETURNING id INTO v_grp;
  INSERT INTO public.commission_rate_card_slabs (group_id, min_count, max_count, amount)
  VALUES (v_grp, 1, NULL, 30000);

  INSERT INTO public.commission_rate_card_groups (card_id, name, priority, institution_ids)
  VALUES (v_card, 'B.Ed', 110, ARRAY[edu]) RETURNING id INTO v_grp;
  INSERT INTO public.commission_rate_card_slabs (group_id, min_count, max_count, amount)
  VALUES (v_grp, 1, NULL, 5000);
END $seed$;
