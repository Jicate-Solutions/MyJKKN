-- 20270610090000_walkin_release_owner_and_rate_card_hold.sql
-- Added: 2026-09-27 — Director rulings on walk-in agency claims (interview, 06:25 IST).
--
-- WHY THIS EXISTS
-- ---------------
-- On 26 Sep, 352 walk-in agency claims were waiting for a person to confirm them,
-- the oldest from 12 May, and not one had ever been released. The release button
-- has worked since 17 Aug, but fn_clear_walkin_credit_for_payout accepted anyone
-- holding admission.leads.edit or admin — 138 people across 12 roles, counsellors
-- included — so the job belonged to nobody. The review screen had ONE visit ever.
--
-- Separately, the commission rate card (fn_consultant_rate_card_earnings) never
-- read the walk-in hold: it counted every account/admitted/active learner, so
-- 213 of the 2026-27 learners it billed were walk-ins the Director's own rule
-- says to hold. That was deliberately left alone until the hold had an owner
-- (turning it on first would have moved those claims from over-paid to paid by
-- nobody). It has one now.
--
-- THE RULINGS (2026-09-27)
--   1. The release owner is Isvarya Lakshmi, Joint Managing Director — ALONE.
--      Not the other super admins, not counsellors. Held in a config row so it
--      can be changed without a deploy.
--   2. Proof is the owner's call (family confirms, agency shows proof, or her own
--      judgement), with a written note on EVERY release.
--   3. A learner who has left before confirmation earns the agency nothing:
--      exited or withdrawal_pending refuse the release.
--   4. Inactive blocks the release until the learner is marked active again.
--   5. A transfer to another JKKN college still pays (nothing here keys on college).
--   6. A learner who leaves AFTER release but before payment is held again — the
--      rate card already counts only account/admitted/active learners, so an
--      exited / inactive / withdrawal_pending learner drops out of the count on
--      its own. No change needed for that rule; noted here so nobody adds one.
--
-- WHAT THIS DOES NOT DO
--   * Pays nobody. commission_rate_card_payments stays super-admin-only and empty.
--   * Does not touch the attendance-hold release (fn_clear_referral_attendance_hold);
--     the rulings were about walk-in claims only.
--   * Does not clear any existing hold.

-- ---------------------------------------------------------------------------
-- 1. The owner, as a config row.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   classification, ui_category, is_system, is_active)
SELECT
  'admission.walkin_release.owner_user_id',
  'global',
  NULL,
  to_jsonb('583f39e2-8334-4028-ba72-e4aadfdf7483'::text),
  'The ONE person allowed to release a walk-in agency claim for payment (Director ruling, 2026-09-27: Isvarya Lakshmi, Joint Managing Director). Value = that person''s profile id. Empty or missing = nobody can release, and the review screen says so.',
  'string',
  'major',
  'admission',
  false,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'admission.walkin_release.owner_user_id'
     AND scope_type = 'global' AND scope_id IS NULL
);

-- 1b. Only the Director may change who the owner is (review, 2026-10-01).
-- platform_policies is writable by every admin; without this, any admin could
-- name themselves the release owner. Same shape as fn_guard_the_director_list:
-- a signed-in caller must be on the Director list; postgres / service_role (this
-- migration, operators) pass. The value must name an existing account.
CREATE OR REPLACE FUNCTION public.fn_guard_walkin_release_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_key CONSTANT text := 'admission.walkin_release.owner_user_id';
  v_role text := auth.role();
  v_id text;
BEGIN
  IF NOT (   (TG_OP IN ('INSERT', 'UPDATE') AND NEW.policy_key = c_key)
          OR (TG_OP IN ('UPDATE', 'DELETE') AND OLD.policy_key = c_key)) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF v_role IS NOT NULL AND v_role IS DISTINCT FROM 'service_role' THEN
    IF v_role IS DISTINCT FROM 'authenticated'
       OR NOT COALESCE(public.fn_is_the_director(), false) THEN
      RAISE EXCEPTION 'Only the Director can change who releases walk-in agency claims.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  v_id := NULLIF(btrim(NEW.value #>> '{}'), '');
  IF v_id IS NOT NULL AND (
       v_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = v_id::uuid)) THEN
    RAISE EXCEPTION 'The walk-in release owner must be an existing account id, not %.', v_id
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_walkin_release_owner() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_walkin_release_owner ON public.platform_policies;
CREATE TRIGGER trg_guard_walkin_release_owner
  BEFORE INSERT OR UPDATE OR DELETE ON public.platform_policies
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_walkin_release_owner();

-- ---------------------------------------------------------------------------
-- 2. Who the owner is, for the review screen.
-- ---------------------------------------------------------------------------
-- The screen needs to know whether to show Release at all, and whose name to
-- show when it does not. Returns no one else's data.
CREATE OR REPLACE FUNCTION public.fn_walkin_release_owner()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_owner uuid; v_name text;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('admission.leads.view')) THEN
    RAISE EXCEPTION 'Not authorised to view the referral review worklist';
  END IF;

  BEGIN
    v_owner := NULLIF(btrim(fn_get_policy_text('admission.walkin_release.owner_user_id', NULL, NULL)), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_owner := NULL;
  END;

  IF v_owner IS NOT NULL THEN
    SELECT full_name INTO v_name FROM public.profiles WHERE id = v_owner;
  END IF;

  RETURN jsonb_build_object(
    'owner_name', v_name,
    'is_owner',   v_owner IS NOT NULL AND v_owner = auth.uid()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_walkin_release_owner() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_walkin_release_owner() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. The release: owner only, a note every time, never for a learner who left.
-- ---------------------------------------------------------------------------
-- Signature unchanged, so this replaces the 20260909061500 body in place.
-- ci:allow-secdef-authenticated every signed-in user may CALL it, but the body refuses anyone who is not the configured owner (admission.walkin_release.owner_user_id, Director-guarded by 1b) with reason not_owner before touching a row
CREATE OR REPLACE FUNCTION public.fn_clear_walkin_credit_for_payout(p_attribution_id uuid, p_note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row    public.consultant_lead_attributions%ROWTYPE;
  v_actor  uuid := auth.uid();
  v_owner  uuid;
  v_status text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'A release must have a named owner; no authenticated user on this call';
  END IF;

  -- Ruling 1: one named owner, from the config row. A missing or malformed row
  -- means nobody can release — never a fallback to the old wide gate.
  BEGIN
    v_owner := NULLIF(btrim(fn_get_policy_text('admission.walkin_release.owner_user_id', NULL, NULL)), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_owner := NULL;
  END;
  IF v_owner IS NULL OR v_owner <> v_actor THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_owner');
  END IF;

  SELECT * INTO v_row FROM public.consultant_lead_attributions WHERE id = p_attribution_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Write-once, like fn_link_referral_referrer: releasing an already-released credit
  -- must not quietly re-stamp who owns the decision.
  IF v_row.payout_cleared_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_cleared',
                              'cleared_at', v_row.payout_cleared_at);
  END IF;

  -- Ruling 2: every release carries what the owner checked.
  IF length(btrim(COALESCE(p_note, ''))) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'note_required');
  END IF;

  -- Rulings 3 and 4: the learner behind the credit, on either attribution path.
  SELECT lp.lifecycle_status::text INTO v_status
    FROM public.learners_profiles lp
   WHERE lp.id = COALESCE(
           v_row.learner_profile_id,
           (SELECT al.learner_profile_id FROM public.admission_leads al WHERE al.id = v_row.admission_id));

  IF v_status IN ('exited', 'withdrawal_pending') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'learner_left', 'lifecycle_status', v_status);
  END IF;
  IF v_status = 'inactive' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'learner_inactive');
  END IF;

  -- The ONLY door past trg_guard_walkin_payout_clearance (3b): this transaction-
  -- local flag is set here, around the one UPDATE, and cleared straight after.
  PERFORM set_config('app.walkin_release', 'on', true);
  UPDATE public.consultant_lead_attributions
     SET payout_cleared_at   = now(),
         payout_cleared_by   = v_actor,
         payout_cleared_note = btrim(p_note)
   WHERE id = p_attribution_id;
  PERFORM set_config('app.walkin_release', 'off', true);

  RETURN jsonb_build_object('ok', true, 'attribution_id', p_attribution_id, 'cleared_at', now());
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_clear_walkin_credit_for_payout(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_clear_walkin_credit_for_payout(uuid, text) TO authenticated;

-- 3b. Nobody marks a claim released by editing the row (review, 2026-10-01).
-- lead_attributions_update lets every admission.leads.edit holder (138 people)
-- UPDATE these rows, so they could set payout_cleared_* directly and skip the
-- owner. A signed-in or anonymous caller may now change those three columns only
-- through fn_clear_walkin_credit_for_payout, which raises the app.walkin_release
-- flag around its one UPDATE. postgres / service_role are untouched. Ordinary lead
-- edits (every other column) are unaffected.
CREATE OR REPLACE FUNCTION public.fn_guard_walkin_payout_clearance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role text := auth.role();
BEGIN
  IF v_role IN ('authenticated', 'anon')
     AND current_setting('app.walkin_release', true) IS DISTINCT FROM 'on'
     AND (
       (TG_OP = 'INSERT' AND (NEW.payout_cleared_at IS NOT NULL
                              OR NEW.payout_cleared_by IS NOT NULL
                              OR NEW.payout_cleared_note IS NOT NULL))
       OR (TG_OP = 'UPDATE' AND (NEW.payout_cleared_at   IS DISTINCT FROM OLD.payout_cleared_at
                              OR NEW.payout_cleared_by   IS DISTINCT FROM OLD.payout_cleared_by
                              OR NEW.payout_cleared_note IS DISTINCT FROM OLD.payout_cleared_note))
     ) THEN
    RAISE EXCEPTION 'A walk-in claim can only be released by its owner, through the Review Worklist.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_walkin_payout_clearance() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_walkin_payout_clearance ON public.consultant_lead_attributions;
CREATE TRIGGER trg_guard_walkin_payout_clearance
  BEFORE INSERT OR UPDATE ON public.consultant_lead_attributions
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_walkin_payout_clearance();

-- ---------------------------------------------------------------------------
-- 4. The rate card honours the hold.
-- ---------------------------------------------------------------------------
-- The held predicate, identical in all three functions below: a learner whose
-- credit to THIS agency came through a walk-in enquiry that nobody has released.
-- Held wins over any other credit the same agency has on the same learner.
--
--   NOT EXISTS (
--     SELECT 1 FROM consultant_lead_attributions h
--       JOIN admission_leads hl ON hl.id = h.admission_id
--      WHERE h.consultant_id = p_consultant_id
--        AND COALESCE(h.learner_profile_id, hl.learner_profile_id) = lp.id
--        AND hl.source::text = 'walk_in'
--        AND h.payout_cleared_at IS NULL)
--
-- 4a. Earnings — body copied from main's newest definition (20270418100000,
--     referrer parity), with the one predicate added to `qualifying`. Everything
--     else is byte-for-byte.
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
       -- Walk-in hold (Director ruling 2026-08-17, owner named 2026-09-27): a
       -- walk-in credit nobody has released is not counted until it is.
       AND NOT EXISTS (
         SELECT 1
           FROM public.consultant_lead_attributions h
           JOIN public.admission_leads hl ON hl.id = h.admission_id
          WHERE h.consultant_id = p_consultant_id
            AND COALESCE(h.learner_profile_id, hl.learner_profile_id) = lp.id
            AND hl.source::text = 'walk_in'
            AND h.payout_cleared_at IS NULL)
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

REVOKE EXECUTE ON FUNCTION public.fn_consultant_rate_card_earnings(uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_consultant_rate_card_earnings(uuid, integer) TO authenticated;

-- 4b. First-year fee collection — defined as "the same learner set as the
--     earnings card", so it takes the same predicate or its counts stop adding up
--     to the card's Learners figure. Body from 20270418100000 (referrer parity) plus the predicate.
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
       -- Walk-in hold (Director ruling 2026-08-17, owner named 2026-09-27): a
       -- walk-in credit nobody has released is not counted until it is.
       AND NOT EXISTS (
         SELECT 1
           FROM public.consultant_lead_attributions h
           JOIN public.admission_leads hl ON hl.id = h.admission_id
          WHERE h.consultant_id = p_consultant_id
            AND COALESCE(h.learner_profile_id, hl.learner_profile_id) = lp.id
            AND hl.source::text = 'walk_in'
            AND h.payout_cleared_at IS NULL)
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

REVOKE EXECUTE ON FUNCTION public.fn_consultant_first_year_fee_collection(uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_consultant_first_year_fee_collection(uuid, integer) TO authenticated;

-- 4c. How many learners the card is NOT counting yet because of the hold, so the
--     card can say so instead of the total silently shrinking.
CREATE OR REPLACE FUNCTION public.fn_consultant_rate_card_walkin_held(p_consultant_id uuid, p_academic_year integer DEFAULT NULL::integer)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH card AS (
    SELECT c.academic_year
      FROM public.commission_rate_cards c
     WHERE c.is_active
       AND (p_academic_year IS NULL OR c.academic_year = p_academic_year)
       AND (auth.role() = 'service_role'
            OR (SELECT is_super_admin()) OR (SELECT is_admin())
            OR (SELECT user_has_permission('admission.consultants.commissions.view')))
     ORDER BY c.academic_year DESC
     LIMIT 1
  )
  SELECT count(DISTINCT lp.id)
    FROM public.consultant_lead_attributions h
    JOIN public.admission_leads hl     ON hl.id = h.admission_id
    JOIN public.learners_profiles lp   ON lp.id = COALESCE(h.learner_profile_id, hl.learner_profile_id)
    JOIN public.admission_years ay     ON ay.id = lp.admission_year_id
    CROSS JOIN card
   WHERE h.consultant_id = p_consultant_id
     AND hl.source::text = 'walk_in'
     AND h.payout_cleared_at IS NULL
     AND ay.year = card.academic_year
     AND lp.lifecycle_status IN ('account', 'admitted', 'active');
$$;

REVOKE EXECUTE ON FUNCTION public.fn_consultant_rate_card_walkin_held(uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_consultant_rate_card_walkin_held(uuid, integer) TO authenticated;
