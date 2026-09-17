-- =====================================================================
-- Adoption loop — Migration C: the three numbers, names by rule, why-not,
-- proposals and the register/decide pair
-- Date: 2026-09-16
-- Spec: specs/2026-09-16-adoption-loop.md (rulings 1, 2, 6, 7, 8; build steps 3, 4, 6)
--
-- Depends at RUNTIME (not at apply) on the blocking feedback gate, PR #3829
-- (notifications.requires_answer / answer_options, table notification_answers,
-- fn_notification_answer). Every function here is plpgsql, so it CREATEs
-- cleanly in either merge order; fn_adoption_ask_why answers
-- {success:false, error:"feedback gate not applied yet"} until #3829 lands,
-- and fn_adoption_answers reads {} instead of failing.
--
-- Weeks and days are Indian calendar (Asia/Kolkata), Monday-start.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) fn_adoption_person_roles() — every active person with every role key
--    they hold (profiles.role ∪ user_roles→custom_roles.role_key).
--    Internal helper; not granted to authenticated.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_adoption_person_roles()
RETURNS TABLE (user_id uuid, role text, institution_id uuid, is_super_admin boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.role, p.institution_id, COALESCE(p.is_super_admin, false)
  FROM public.profiles p
  WHERE p.is_active = true AND p.role IS NOT NULL
  UNION
  SELECT p.id, cr.role_key::text, p.institution_id, COALESCE(p.is_super_admin, false)
  FROM public.user_roles ur
  JOIN public.custom_roles cr ON cr.id = ur.role_id AND cr.is_active = true
  JOIN public.profiles p ON p.id = ur.user_id AND p.is_active = true
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_person_roles() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_person_roles() TO service_role;

-- ---------------------------------------------------------------------
-- 0b) fn_adoption_is_principal_of(institution) — ruling 7's test.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_adoption_is_principal_of(p_institution_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_institution_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.institution_id = p_institution_id
      AND (
        p.role = 'principal'
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          JOIN public.custom_roles cr ON cr.id = ur.role_id
          WHERE ur.user_id = p.id AND cr.role_key = 'principal' AND cr.is_active = true
        )
      )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_is_principal_of(uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_is_principal_of(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 0c) fn_adoption_answers(feature) — option → count from the why-not
--     question (notification_answers, PR #3829). {} when not applied yet.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_adoption_answers(p_feature_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
BEGIN
  BEGIN
    SELECT COALESCE(jsonb_object_agg(a.answer, a.cnt), '{}'::jsonb) INTO v_out
    FROM (
      SELECT na.answer, count(*) AS cnt
      FROM public.notification_answers na
      JOIN public.notifications n ON n.id = na.notification_id
      WHERE n.metadata ->> 'kind' = 'adoption_why'
        AND n.metadata ->> 'feature_key' = p_feature_key
      GROUP BY na.answer
    ) a;
  EXCEPTION
    WHEN undefined_table OR undefined_column THEN
      v_out := '{}'::jsonb;
  END;
  RETURN COALESCE(v_out, '{}'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_answers(text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_answers(text) TO service_role;

-- ---------------------------------------------------------------------
-- 1) fn_adoption_metrics(week_start, institution) — ruling 1 (a) and (b),
--    per feature × intended role. Totals only, never names.
--    Scope: super admins / admins see all (or one institution on request);
--    everyone else is confined to their own institution's totals.
-- ---------------------------------------------------------------------
-- ci:allow-secdef-authenticated returns COUNTS only (no names, no ids); the body confines a non-admin caller to their own institution_id from profiles, so a signed-in person can never read another college's numbers.
CREATE OR REPLACE FUNCTION public.fn_adoption_metrics(
  p_week_start     date DEFAULT NULL,
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  feature_key    text,
  title          text,
  module         text,
  core_action    text,
  shipped_at     timestamptz,
  status         text,
  source_pr      integer,
  role           text,
  intended_count bigint,
  weekly_active  bigint,
  ever_active    bigint,
  pct_weekly     numeric,
  pct_ever       numeric,
  asked_count    bigint,
  answers        jsonb,
  week_start     date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_admin boolean := COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false);
  v_scope uuid := p_institution_id;
  v_week  date := COALESCE(p_week_start,
                    date_trunc('week', (now() AT TIME ZONE 'Asia/Kolkata')::date)::date);
BEGIN
  IF v_uid IS NULL AND NOT v_admin THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;

  -- A non-admin caller only ever sees their own institution's totals.
  IF NOT v_admin THEN
    SELECT p.institution_id INTO v_scope FROM public.profiles p WHERE p.id = v_uid;
    IF v_scope IS NULL THEN
      RAISE EXCEPTION 'no institution on your profile' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  WITH f AS (
    SELECT fr.feature_key, fr.title, fr.module, fr.core_action, fr.shipped_at,
           fr.status, fr.source_pr,
           CASE WHEN cardinality(fr.intended_roles) = 0 THEN 'all' ELSE r.role END AS role
    FROM public.feature_registry fr
    LEFT JOIN LATERAL unnest(fr.intended_roles) AS r(role) ON true
    WHERE fr.feature_key <> 'app.login'
  ),
  people AS (
    SELECT pr.user_id, pr.role, pr.institution_id
    FROM public.fn_adoption_person_roles() pr
    WHERE (v_scope IS NULL OR pr.institution_id = v_scope)
  ),
  intended AS (
    SELECT DISTINCT f.feature_key, f.role, p.user_id
    FROM f
    JOIN people p ON (f.role = 'all' OR p.role = f.role)
  ),
  used AS (
    SELECT fu.user_id, fu.feature_key,
           bool_or(fu.day >= v_week AND fu.day < v_week + 7) AS this_week
    FROM public.feature_usage fu
    GROUP BY fu.user_id, fu.feature_key
  ),
  asked AS (
    SELECT aa.feature_key, count(*) AS asked_count
    FROM public.adoption_asks aa
    WHERE aa.user_id IN (SELECT DISTINCT p.user_id FROM people p)
    GROUP BY aa.feature_key
  ),
  agg AS (
    SELECT i.feature_key, i.role,
           count(*)                                        AS intended_count,
           count(*) FILTER (WHERE u.this_week)             AS weekly_active,
           count(*) FILTER (WHERE u.user_id IS NOT NULL)   AS ever_active
    FROM intended i
    LEFT JOIN used u ON u.user_id = i.user_id AND u.feature_key = i.feature_key
    GROUP BY i.feature_key, i.role
  )
  SELECT f.feature_key, f.title, f.module, f.core_action, f.shipped_at, f.status, f.source_pr,
         f.role,
         COALESCE(a.intended_count, 0)::bigint,
         COALESCE(a.weekly_active, 0)::bigint,
         COALESCE(a.ever_active, 0)::bigint,
         CASE WHEN COALESCE(a.intended_count, 0) > 0
              THEN round(a.weekly_active::numeric * 100 / a.intended_count, 1) ELSE 0 END,
         CASE WHEN COALESCE(a.intended_count, 0) > 0
              THEN round(a.ever_active::numeric * 100 / a.intended_count, 1) ELSE 0 END,
         COALESCE(k.asked_count, 0)::bigint,
         public.fn_adoption_answers(f.feature_key),
         v_week
  FROM f
  LEFT JOIN agg a   ON a.feature_key = f.feature_key AND a.role = f.role
  LEFT JOIN asked k ON k.feature_key = f.feature_key
  ORDER BY f.shipped_at DESC, f.feature_key, f.role;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_metrics(date, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_metrics(date, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) fn_adoption_logins_daily(days, institution) — ruling 1 (c): the one
--    app-wide line. Distinct people who signed in, per IST day.
-- ---------------------------------------------------------------------
-- ci:allow-secdef-authenticated returns daily COUNTS only; a non-admin caller is confined to their own institution_id by the body.
CREATE OR REPLACE FUNCTION public.fn_adoption_logins_daily(
  p_days           integer DEFAULT 30,
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (day date, logins bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_admin boolean := COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false);
  v_scope uuid := p_institution_id;
  v_from  date := (now() AT TIME ZONE 'Asia/Kolkata')::date - GREATEST(COALESCE(p_days, 30), 1) + 1;
BEGIN
  IF v_uid IS NULL AND NOT v_admin THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF NOT v_admin THEN
    SELECT p.institution_id INTO v_scope FROM public.profiles p WHERE p.id = v_uid;
  END IF;

  RETURN QUERY
  SELECT fu.day, count(DISTINCT fu.user_id)::bigint
  FROM public.feature_usage fu
  WHERE fu.feature_key = 'app.login'
    AND fu.day >= v_from
    AND (v_scope IS NULL OR fu.institution_id = v_scope)
  GROUP BY fu.day
  ORDER BY fu.day;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_logins_daily(integer, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_logins_daily(integer, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3) fn_adoption_people(feature, institution) — ruling 7: NAMES. Only a
--    super admin, or the principal of THAT institution. Everyone else is
--    refused (42501), never silently emptied.
-- ---------------------------------------------------------------------
-- ci:allow-secdef-authenticated the body RAISES 42501 unless the caller is a super admin or the principal of exactly the institution asked for (fn_adoption_is_principal_of); a principal cannot name another college's people.
CREATE OR REPLACE FUNCTION public.fn_adoption_people(
  p_feature_key    text,
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  user_id     uuid,
  full_name   text,
  email       text,
  role        text,
  institution_id uuid,
  ever_used   boolean,
  last_day    date,
  total_count bigint,
  asked_at    timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_sa boolean := COALESCE(is_super_admin(), false);
  v_roles text[];
BEGIN
  IF NOT v_is_sa THEN
    IF p_institution_id IS NULL OR NOT public.fn_adoption_is_principal_of(p_institution_id) THEN
      RAISE EXCEPTION 'Names are visible to super admins and to the principal of that institution only'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT fr.intended_roles INTO v_roles FROM public.feature_registry fr WHERE fr.feature_key = p_feature_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown feature %', p_feature_key USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  WITH people AS (
    SELECT DISTINCT pr.user_id, pr.institution_id
    FROM public.fn_adoption_person_roles() pr
    WHERE (p_institution_id IS NULL OR pr.institution_id = p_institution_id)
      AND (cardinality(v_roles) = 0 OR 'all' = ANY (v_roles) OR pr.role = ANY (v_roles))
  ),
  used AS (
    SELECT fu.user_id, max(fu.day) AS last_day, sum(fu.count)::bigint AS total_count
    FROM public.feature_usage fu
    WHERE fu.feature_key = p_feature_key
    GROUP BY fu.user_id
  )
  SELECT p.id, p.full_name, p.email, p.role, p.institution_id,
         (u.user_id IS NOT NULL) AS ever_used,
         u.last_day,
         COALESCE(u.total_count, 0)::bigint,
         aa.asked_at
  FROM people pp
  JOIN public.profiles p ON p.id = pp.user_id
  LEFT JOIN used u ON u.user_id = pp.user_id
  LEFT JOIN public.adoption_asks aa ON aa.user_id = pp.user_id AND aa.feature_key = p_feature_key
  ORDER BY (u.user_id IS NOT NULL) DESC, u.last_day DESC NULLS LAST, p.full_name;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_people(text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_people(text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) fn_adoption_ask_why(feature) — rulings 2 and 6. One must-answer
--    notification (feedback gate, PR #3829) to every intended person with
--    ZERO usage of a feature at least 14 days old; never twice per feature,
--    never within 7 days of any other adoption question to that person.
--    Super admins are never asked (the gate exempts them anyway).
-- ---------------------------------------------------------------------
-- ci:allow-secdef-authenticated the body RAISES 42501 unless is_super_admin(); only the Adoption desk / super admins may send the why-not question.
CREATE OR REPLACE FUNCTION public.fn_adoption_ask_why(p_feature_key text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_feat    public.feature_registry%ROWTYPE;
  v_nid     uuid;
  v_n       integer := 0;
  v_targets uuid[] := '{}'::uuid[];
  v_options jsonb := '["Did not know it exists","Tried it, too hard","Do not need it","Use something else"]'::jsonb;
BEGIN
  IF NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'super admin required' USING ERRCODE = '42501';
  END IF;

  -- One send at a time: two simultaneous calls for different features could
  -- both read "not asked in 7 days" before either inserts. The lock lasts for
  -- this transaction only.
  PERFORM pg_advisory_xact_lock(hashtext('fn_adoption_ask_why'));

  SELECT * INTO v_feat FROM public.feature_registry WHERE feature_key = p_feature_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'unknown feature');
  END IF;
  IF v_feat.status = 'retired' THEN
    RETURN jsonb_build_object('success', false, 'error', 'feature is retired');
  END IF;
  IF v_feat.shipped_at > now() - interval '14 days' THEN
    RETURN jsonb_build_object('success', false, 'error', 'feature is younger than 14 days');
  END IF;

  -- Who gets the question: intended, active, not a super admin, never used it,
  -- never asked about THIS feature, not asked about anything in the last 7 days.
  -- (Held in an array, not a temp table: pooled connections and SECURITY
  -- DEFINER make temp objects a trap.)
  SELECT COALESCE(array_agg(DISTINCT pr.user_id), '{}'::uuid[]) INTO v_targets
  FROM public.fn_adoption_person_roles() pr
  WHERE pr.is_super_admin = false
    AND (cardinality(v_feat.intended_roles) = 0
         OR 'all' = ANY (v_feat.intended_roles)
         OR pr.role = ANY (v_feat.intended_roles))
    AND NOT EXISTS (SELECT 1 FROM public.feature_usage fu
                    WHERE fu.user_id = pr.user_id AND fu.feature_key = p_feature_key)
    AND NOT EXISTS (SELECT 1 FROM public.adoption_asks aa
                    WHERE aa.user_id = pr.user_id AND aa.feature_key = p_feature_key)
    AND NOT EXISTS (SELECT 1 FROM public.adoption_asks aa
                    WHERE aa.user_id = pr.user_id AND aa.asked_at > now() - interval '7 days');

  v_n := cardinality(v_targets);
  IF v_n = 0 THEN
    RETURN jsonb_build_object('success', true, 'asked', 0, 'notification_id', NULL);
  END IF;

  BEGIN
    INSERT INTO public.notifications
      (title, body, url, created_by, targeting, priority, category, metadata,
       requires_acknowledgment, requires_answer, answer_options, expires_at)
    VALUES
      ('Have you used ' || v_feat.title || '?',
       'MyJKKN added "' || v_feat.title || '" so you can ' || v_feat.core_action ||
       '. You have not used it yet. One tap tells us why, so we can make it simpler, show how it works, or retire it.',
       '/',
       v_uid,
       jsonb_build_object('type', 'adoption_why', 'feature_key', p_feature_key),
       'normal',
       'adoption',
       jsonb_build_object('kind', 'adoption_why', 'feature_key', p_feature_key, 'source', 'adoption_loop'),
       false,
       true,
       v_options,
       now() + interval '30 days')
    RETURNING id INTO v_nid;
  EXCEPTION
    WHEN undefined_column THEN
      RETURN jsonb_build_object('success', false,
        'error', 'feedback gate not applied yet (PR #3829: notifications.requires_answer)');
  END;

  INSERT INTO public.user_notifications (user_id, notification_id)
  SELECT t, v_nid FROM unnest(v_targets) AS t;

  INSERT INTO public.adoption_asks (user_id, feature_key, notification_id, asked_at)
  SELECT t, p_feature_key, v_nid, now() FROM unnest(v_targets) AS t;

  RETURN jsonb_build_object('success', true, 'asked', v_n, 'notification_id', v_nid);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_ask_why(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_ask_why(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5) fn_adoption_register(...) — ruling 5: the ship desk's label, upserted.
-- ---------------------------------------------------------------------
-- ci:allow-secdef-authenticated the body RAISES 42501 unless is_super_admin(); only the desks / super admins label features.
CREATE OR REPLACE FUNCTION public.fn_adoption_register(
  p_feature_key    text,
  p_title          text,
  p_core_action    text,
  p_intended_roles text[] DEFAULT '{all}'::text[],
  p_module         text DEFAULT NULL,
  p_source_pr      integer DEFAULT NULL,
  p_shipped_at     timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'super admin required' USING ERRCODE = '42501';
  END IF;
  IF p_feature_key IS NULL OR p_feature_key !~ '^[a-z0-9_]+(\.[a-z0-9_]+)*$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'feature_key must look like module.action');
  END IF;
  IF COALESCE(btrim(p_title), '') = '' OR COALESCE(btrim(p_core_action), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'title and core_action are required');
  END IF;

  INSERT INTO public.feature_registry
    (feature_key, title, module, intended_roles, core_action, shipped_at, source_pr, created_by)
  VALUES
    (p_feature_key, btrim(p_title), NULLIF(btrim(p_module), ''),
     COALESCE(p_intended_roles, '{all}'::text[]), btrim(p_core_action),
     COALESCE(p_shipped_at, now()), p_source_pr, v_uid)
  ON CONFLICT (feature_key) DO UPDATE
    SET title          = EXCLUDED.title,
        module         = COALESCE(EXCLUDED.module, public.feature_registry.module),
        intended_roles = EXCLUDED.intended_roles,
        core_action    = EXCLUDED.core_action,
        shipped_at     = COALESCE(p_shipped_at, public.feature_registry.shipped_at),
        source_pr      = COALESCE(EXCLUDED.source_pr, public.feature_registry.source_pr),
        updated_at     = now();

  RETURN jsonb_build_object('success', true, 'feature_key', p_feature_key);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_register(text, text, text, text[], text, integer, timestamptz) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_register(text, text, text, text[], text, integer, timestamptz) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6) fn_adoption_propose / fn_adoption_decide — ruling 8. The desk proposes
--    (one open card per feature); only a decision changes the feature.
-- ---------------------------------------------------------------------
-- ci:allow-secdef-authenticated the body RAISES 42501 unless is_super_admin().
CREATE OR REPLACE FUNCTION public.fn_adoption_propose(
  p_feature_key    text,
  p_option         text,
  p_recommendation text DEFAULT NULL,
  p_reasons        jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'super admin required' USING ERRCODE = '42501';
  END IF;
  IF p_option IS NULL OR p_option NOT IN ('simplify', 'retrain', 'retire') THEN
    RETURN jsonb_build_object('success', false, 'error', 'option must be simplify, retrain or retire');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.feature_registry WHERE feature_key = p_feature_key) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unknown feature');
  END IF;
  IF EXISTS (SELECT 1 FROM public.adoption_proposals
             WHERE feature_key = p_feature_key AND status = 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'a card for this feature is already waiting');
  END IF;

  INSERT INTO public.adoption_proposals
    (feature_key, proposed_option, recommendation, reasons, created_by)
  VALUES
    (p_feature_key, p_option, NULLIF(btrim(p_recommendation), ''),
     COALESCE(p_reasons, '{}'::jsonb), v_uid)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'proposal_id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_propose(text, text, text, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_propose(text, text, text, jsonb) TO authenticated, service_role;

-- ci:allow-secdef-authenticated the body RAISES 42501 unless the caller is BOTH a super admin AND the named owner of the feature-adoption loop (loop_registry.owner_email — the Director; reassignable on /admin/loops). Ruling 8: the decision is his, not any super admin's.
CREATE OR REPLACE FUNCTION public.fn_adoption_decide(p_proposal_id uuid, p_option text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_key    text;
  v_status text;
  v_owner  text;
  v_email  text;
BEGIN
  IF NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'super admin required' USING ERRCODE = '42501';
  END IF;
  SELECT lr.owner_email INTO v_owner FROM public.loop_registry lr WHERE lr.loop_key = 'feature-adoption';
  SELECT p.email INTO v_email FROM public.profiles p WHERE p.id = v_uid;
  IF v_owner IS NULL OR v_email IS NULL OR lower(v_email) <> lower(v_owner) THEN
    RAISE EXCEPTION 'Only the owner of the feature-adoption loop (%) decides a card', COALESCE(v_owner, 'unset')
      USING ERRCODE = '42501';
  END IF;
  IF p_option IS NULL OR p_option NOT IN ('simplify', 'retrain', 'retire', 'keep') THEN
    RETURN jsonb_build_object('success', false, 'error', 'option must be simplify, retrain, retire or keep');
  END IF;

  UPDATE public.adoption_proposals
  SET status = 'decided', decided_option = p_option, decided_by = v_uid,
      decided_at = now(), updated_at = now()
  WHERE id = p_proposal_id AND status = 'pending'
  RETURNING feature_key INTO v_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'no waiting card with that id');
  END IF;

  -- Option → registry status ('retire' is the decision, 'retired' the state).
  v_status := CASE p_option WHEN 'keep' THEN 'live' WHEN 'retire' THEN 'retired' ELSE p_option END;
  IF p_option <> 'keep' THEN
    UPDATE public.feature_registry
    SET status = v_status, updated_at = now()
    WHERE feature_key = v_key;
  END IF;

  RETURN jsonb_build_object('success', true, 'feature_key', v_key, 'status', v_status);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_decide(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_decide(uuid, text) TO authenticated, service_role;
