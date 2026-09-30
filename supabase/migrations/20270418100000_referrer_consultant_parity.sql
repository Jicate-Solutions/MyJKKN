-- Team-member (Internal) and learner (Student) referrers get the full consultant
-- page — Details, Commission Structure, Promises & Rates, referrals, and the
-- commission payment flow — paid off the SAME agency rate card (decision
-- 2026-09-30).
--
-- Every piece of commission machinery keys on education_consultants.id (rate-card
-- payments, advances, ladders, payment requests). Staff and learner referrers
-- were never consultant rows: their referrals are recorded on the referred
-- learner as learners_profiles.referral_type ('faculty' | 'student') +
-- referred_by_id (→ staff.id / learners_profiles.id). So:
--
--   1. education_consultants gains staff_id / learner_referrer_id, each UNIQUE —
--      one consultant row per person.
--   2. fn_ensure_referrer_consultant(type, person) returns that row, creating it
--      the first time someone opens the referrer from the directory.
--   3. fn_consultant_rate_card_earnings and fn_consultant_first_year_fee_collection
--      count, for a linked row, the learners that person referred — in addition
--      to consultant_lead_attributions (UNION, so nothing is counted twice).
--      Everything downstream (balance, advances, payment requests) follows.
--   4. fn_consultant_directory leaves linked rows out of the agency list; they
--      stay listed under Internal / Student from the learner referral, as before.
--
-- Function bodies in section 3–4 are the LIVE definitions (read from prod with
-- pg_get_functiondef on 2026-09-30) with only the marked lines added.

-- ── 1. Link columns ─────────────────────────────────────────────────────────
ALTER TABLE public.education_consultants
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS learner_referrer_id uuid REFERENCES public.learners_profiles(id) ON DELETE RESTRICT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_education_consultants_staff_id') THEN
    ALTER TABLE public.education_consultants ADD CONSTRAINT uq_education_consultants_staff_id UNIQUE (staff_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_education_consultants_learner_referrer_id') THEN
    ALTER TABLE public.education_consultants ADD CONSTRAINT uq_education_consultants_learner_referrer_id UNIQUE (learner_referrer_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_education_consultants_one_referrer_link') THEN
    ALTER TABLE public.education_consultants ADD CONSTRAINT chk_education_consultants_one_referrer_link
      CHECK (staff_id IS NULL OR learner_referrer_id IS NULL);
  END IF;
END $$;

-- ── 2. Get-or-create the consultant row for a referrer ──────────────────────
CREATE OR REPLACE FUNCTION public.fn_ensure_referrer_consultant(p_type text, p_person_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid; v_name text; v_email text; v_phone text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  -- Same gate as opening the consultant directory the referrer is listed in.
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('admission.consultants.view')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_type NOT IN ('internal', 'student') THEN RAISE EXCEPTION 'invalid_type'; END IF;
  -- Only people who actually referred someone get a consultant row.
  IF NOT EXISTS (SELECT 1 FROM public.learners_profiles
                  WHERE referral_type = CASE p_type WHEN 'internal' THEN 'faculty' ELSE 'student' END
                    AND referred_by_id = p_person_id) THEN
    RAISE EXCEPTION 'not_a_referrer';
  END IF;

  IF p_type = 'internal' THEN
    SELECT id INTO v_id FROM public.education_consultants WHERE staff_id = p_person_id;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    SELECT btrim(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')),
           COALESCE(NULLIF(btrim(institution_email), ''), NULLIF(btrim(email), '')),
           NULLIF(btrim(phone), '')
      INTO v_name, v_email, v_phone
      FROM public.staff WHERE id = p_person_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'person_not_found'; END IF;
    INSERT INTO public.education_consultants (name, email, phone, consultant_type, status, staff_id)
    VALUES (COALESCE(NULLIF(v_name, ''), 'Team member'), v_email, v_phone, 'internal', 'active', p_person_id)
    ON CONFLICT (staff_id) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN SELECT id INTO v_id FROM public.education_consultants WHERE staff_id = p_person_id; END IF;
  ELSE
    SELECT id INTO v_id FROM public.education_consultants WHERE learner_referrer_id = p_person_id;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    SELECT btrim(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')),
           NULLIF(btrim(student_email), ''), NULLIF(btrim(student_mobile), '')
      INTO v_name, v_email, v_phone
      FROM public.learners_profiles WHERE id = p_person_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'person_not_found'; END IF;
    INSERT INTO public.education_consultants (name, email, phone, consultant_type, status, learner_referrer_id)
    VALUES (COALESCE(NULLIF(v_name, ''), 'Learner'), v_email, v_phone, 'student', 'active', p_person_id)
    ON CONFLICT (learner_referrer_id) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN SELECT id INTO v_id FROM public.education_consultants WHERE learner_referrer_id = p_person_id; END IF;
  END IF;
  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_ensure_referrer_consultant(text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ensure_referrer_consultant(text, uuid) TO authenticated;

-- ── 3–4. Resolvers and directory (live bodies + marked lines) ───────────────
CREATE OR REPLACE FUNCTION public.fn_consultant_rate_card_earnings(p_consultant_id uuid, p_academic_year integer DEFAULT NULL::integer)
 RETURNS TABLE(group_id uuid, group_name text, priority integer, qualifying_count bigint, slab_min integer, slab_max integer, rate_amount numeric, total_amount numeric, paid_amount numeric, balance_amount numeric, excess_amount numeric, is_override boolean, advance_applied numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT COALESCE(a.learner_profile_id, al.learner_profile_id) AS learner_profile_id
      FROM public.consultant_lead_attributions a
      LEFT JOIN public.admission_leads al ON al.id = a.admission_id
     WHERE a.consultant_id = p_consultant_id
       AND COALESCE(a.learner_profile_id, al.learner_profile_id) IS NOT NULL
    UNION
    -- A team-member / learner referrer's consultant row (20270418100000): their
    -- referrals live on the learner (referral_type + referred_by_id), not in
    -- consultant_lead_attributions. UNION de-duplicates across the paths.
    SELECT lp.id
      FROM public.education_consultants ec
      JOIN public.learners_profiles lp
        ON lp.referral_type = 'faculty' AND lp.referred_by_id = ec.staff_id
     WHERE ec.id = p_consultant_id AND ec.staff_id IS NOT NULL
    UNION
    SELECT lp.id
      FROM public.education_consultants ec
      JOIN public.learners_profiles lp
        ON lp.referral_type = 'student' AND lp.referred_by_id = ec.learner_referrer_id
     WHERE ec.id = p_consultant_id AND ec.learner_referrer_id IS NOT NULL
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_consultant_first_year_fee_collection(p_consultant_id uuid, p_academic_year integer DEFAULT NULL::integer)
 RETURNS TABLE(institution_id uuid, institution_name text, learner_count bigint, fee_amount numeric, paid_amount numeric, balance_amount numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT COALESCE(a.learner_profile_id, al.learner_profile_id) AS learner_profile_id
      FROM public.consultant_lead_attributions a
      LEFT JOIN public.admission_leads al ON al.id = a.admission_id
     WHERE a.consultant_id = p_consultant_id
       AND COALESCE(a.learner_profile_id, al.learner_profile_id) IS NOT NULL
    UNION
    -- A team-member / learner referrer's consultant row (20270418100000): their
    -- referrals live on the learner (referral_type + referred_by_id), not in
    -- consultant_lead_attributions. UNION de-duplicates across the paths.
    SELECT lp.id
      FROM public.education_consultants ec
      JOIN public.learners_profiles lp
        ON lp.referral_type = 'faculty' AND lp.referred_by_id = ec.staff_id
     WHERE ec.id = p_consultant_id AND ec.staff_id IS NOT NULL
    UNION
    SELECT lp.id
      FROM public.education_consultants ec
      JOIN public.learners_profiles lp
        ON lp.referral_type = 'student' AND lp.referred_by_id = ec.learner_referrer_id
     WHERE ec.id = p_consultant_id AND ec.learner_referrer_id IS NOT NULL
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_consultant_directory(p_year integer DEFAULT NULL::integer, p_institution_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rows jsonb; v_years jsonb;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so gate explicitly. Same permission that
  -- opens the consultants module.
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('admission.consultants.view')) THEN
    RAISE EXCEPTION 'Not authorised to view the consultant directory';
  END IF;

  -- Every intake year that actually carries a consultant referral, newest first.
  -- Derived, never hardcoded: a new year appears here the day its first referral
  -- is recorded, with no code change.
  SELECT COALESCE(jsonb_agg(y ORDER BY y DESC), '[]'::jsonb)
    INTO v_years
  FROM (
    SELECT DISTINCT ay.year AS y
      FROM public.learners_profiles lp
      JOIN public.admission_years ay ON ay.id = lp.admission_year_id
     WHERE lp.referral_type = 'consultant' AND lp.referred_by_id IS NOT NULL
  ) s;

  SELECT COALESCE(jsonb_agg(x ORDER BY x_referrals DESC, x_name), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT
      ec.name AS x_name,
      COALESCE(r.referrals, 0) AS x_referrals,
      jsonb_build_object(
        'consultant_id',  ec.id,
        'name',           ec.name,
        'consultant_type',ec.consultant_type,
        'status',         ec.status,
        'email',          NULLIF(btrim(ec.email), ''),
        'phone',          NULLIF(btrim(ec.phone), ''),
        'contact_person', NULLIF(btrim(ec.contact_person), ''),
        -- Live, year-scoped. Not the stored lifetime column.
        'referrals',      COALESCE(r.referrals, 0),
        -- Same allow-list the payment gate uses, so the two agree.
        'enrolled',       COALESCE(r.enrolled, 0),
        'payout_ready',   (NULLIF(btrim(ec.bank_account_number), '') IS NOT NULL
                           AND NULLIF(btrim(ec.pan_number), '') IS NOT NULL)
      ) AS x
    FROM public.education_consultants ec
    LEFT JOIN (
      SELECT lp.referred_by_id AS cid,
             count(*) AS referrals,
             -- GATE 1 of fn_generate_referral_commissions, copied exactly.
             -- 'reserved' left OUT from 2026-09-12 (rule 15): a reserved seat is
             -- held, not joined, so it is not enrolled and cannot earn a
             -- referral. Keep this list in step with
             -- 20261203090000_referral_gates_hold_unmeasurable_and_drop_reserved.sql
             -- — a directory that counts people the generator refuses to pay is
             -- how an agency is told it is owed for somebody it is not.
             count(*) FILTER (WHERE lp.lifecycle_status::text
                              IN ('active','admitted','graduated')) AS enrolled
        FROM public.learners_profiles lp
        JOIN public.admission_years ay ON ay.id = lp.admission_year_id
       WHERE lp.referral_type = 'consultant'
         AND lp.referred_by_id IS NOT NULL
         AND (p_year IS NULL OR ay.year = p_year)
         AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
       GROUP BY 1
    ) r ON r.cid = ec.id
    -- Linked team-member / learner referrer rows are listed under Internal /
    -- Student from the learner referral, not as agencies (20270418100000).
    WHERE ec.staff_id IS NULL AND ec.learner_referrer_id IS NULL
  ) s;

  RETURN jsonb_build_object(
    'academic_year', p_year,          -- NULL = all years
    'generated_at',  now(),
    'years',         v_years,
    'agencies',      v_rows,
    'summary', jsonb_build_object(
      'agencies_total',    jsonb_array_length(v_rows),
      -- Agencies that actually sent someone in the selected year. The list shows
      -- every agency so a zero is visible, but THIS is the meaningful count.
      'agencies_active',   (SELECT count(*) FROM jsonb_array_elements(v_rows) e
                             WHERE (e->>'referrals')::int > 0),
      'referrals',         (SELECT COALESCE(sum((e->>'referrals')::int),0) FROM jsonb_array_elements(v_rows) e),
      'enrolled',          (SELECT COALESCE(sum((e->>'enrolled')::int),0) FROM jsonb_array_elements(v_rows) e),
      'payout_ready',      (SELECT count(*) FROM jsonb_array_elements(v_rows) e
                             WHERE (e->>'payout_ready')::boolean)
    )
  );
END;
$function$;
