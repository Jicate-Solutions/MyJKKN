-- =====================================================================
-- Adoption loop — Migration D: term cadence
-- Date: 2026-09-18
-- Director rulings 2026-09-18 15:26 (R-A1, R-A4), after nine straight
-- misses on the weekly bar: some features are seasonal — timetables are
-- built at term boundaries, learners are promoted in bulk once a term — so a
-- weekly lens always reads them "dead". Every feature now has a cadence:
--   weekly (default)  judged by the weekly core-action share, as before
--   term              judged by "active this term": the share of intended
--                     people who did the core action at any point in the
--                     current term. Never dead mid-term; dead only once the
--                     term has ENDED under 5 % in every intended role. The
--                     why-not question is sent only in the last 14 days of
--                     the term (R-A4), then the card.
-- The term boundary is a config row (config-table pattern): platform policy
-- adoption.term_start_months = [6, 12] — terms start 1 June and 1 December,
-- JKKN's odd/even semesters; the Director can change it on Platform Policies.
-- Depends on migrations A–C (applied 2026-09-17). Function return shapes
-- change, so the two affected functions are dropped and recreated.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) feature_registry.cadence
-- ---------------------------------------------------------------------
ALTER TABLE public.feature_registry
  ADD COLUMN IF NOT EXISTS cadence text NOT NULL DEFAULT 'weekly';
ALTER TABLE public.feature_registry
  DROP CONSTRAINT IF EXISTS feature_registry_cadence_check;
ALTER TABLE public.feature_registry
  ADD CONSTRAINT feature_registry_cadence_check CHECK (cadence IN ('weekly', 'term'));
COMMENT ON COLUMN public.feature_registry.cadence IS
  'weekly = judged by the weekly share; term = seasonal, judged by "active this term" and only after the term ends (Director 2026-09-18).';

-- A merged change the desk chose NOT to measure (a cron job, a public form, a
-- one-person allow-list, a micro-interaction) is still recorded, with the
-- reason, so the admin page can list it as "skipped on purpose" (Director
-- 2026-09-18 via the W12 desk). Skipped = never measured, never dead, never asked.
ALTER TABLE public.feature_registry
  ADD COLUMN IF NOT EXISTS skip_reason text;
COMMENT ON COLUMN public.feature_registry.skip_reason IS
  'Set = deliberately not measured; the reason shows on /admin/adoption under "Skipped on purpose".';

-- ---------------------------------------------------------------------
-- 2) The term boundary, as a config row
-- ---------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, description,
   is_system, is_active, classification, publication_state, ui_widget, ui_category)
SELECT * FROM (VALUES
  ('adoption.term_start_months','global','[6, 12]'::jsonb,'array',
   'Months (1-12) on whose 1st a term begins, for the adoption loop''s term-judged features. Default [6, 12]: 1 June – 30 November and 1 December – 31 May. A term-judged feature is measured by "active this term" between these boundaries, never called dead mid-term, and its why-not question is sent only in the last 14 days of the term.',
   true, true, 'operational','published','text','analytics')
) v(policy_key, scope_type, value, data_type, description,
    is_system, is_active, classification, publication_state, ui_widget, ui_category)
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies p
  WHERE p.policy_key = v.policy_key AND p.scope_type = 'global');

-- ---------------------------------------------------------------------
-- 3) fn_adoption_term_window(at) — the current term's first and last day
-- ---------------------------------------------------------------------
-- ci:allow-secdef-authenticated returns two calendar dates computed from a public config row; reads nothing about any person.
CREATE OR REPLACE FUNCTION public.fn_adoption_term_window(
  p_at date DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date
)
RETURNS TABLE (term_start date, term_end date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_months integer[];
  v_raw    jsonb;
  v_start  date;
  v_next   date;
BEGIN
  BEGIN
    v_raw := public.fn_get_policy('adoption.term_start_months', NULL);
  EXCEPTION WHEN OTHERS THEN
    v_raw := NULL;
  END;
  IF v_raw IS NULL OR jsonb_typeof(v_raw) <> 'array' OR jsonb_array_length(v_raw) = 0 THEN
    v_months := ARRAY[6, 12];
  ELSE
    SELECT array_agg(DISTINCT (e)::integer ORDER BY (e)::integer) INTO v_months
    FROM jsonb_array_elements_text(v_raw) e
    WHERE e ~ '^\d+$' AND (e)::integer BETWEEN 1 AND 12;
    IF v_months IS NULL OR cardinality(v_months) = 0 THEN v_months := ARRAY[6, 12]; END IF;
  END IF;

  -- latest boundary on or before p_at (this year or last), and the one after it
  SELECT max(d) INTO v_start FROM (
    SELECT make_date(EXTRACT(YEAR FROM p_at)::int - y, m, 1) AS d
    FROM unnest(v_months) m, unnest(ARRAY[0, 1]) y
  ) c WHERE d <= p_at;
  SELECT min(d) INTO v_next FROM (
    SELECT make_date(EXTRACT(YEAR FROM p_at)::int + y, m, 1) AS d
    FROM unnest(v_months) m, unnest(ARRAY[0, 1]) y
  ) c WHERE d > v_start;

  term_start := v_start;
  term_end   := v_next - 1;
  RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_term_window(date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_term_window(date) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) fn_adoption_metrics — adds cadence, term_active, pct_term, term window
--    (return shape changes → drop and recreate; body otherwise as migration C)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_adoption_metrics(date, uuid);

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
  week_start     date,
  usage_wired    boolean,
  usage_bridged  boolean,
  usage_synced_at timestamptz,
  cadence        text,
  term_active    bigint,
  pct_term       numeric,
  term_start     date,
  term_end       date,
  skip_reason    text,
  prev_term_start  date,
  prev_term_end    date,
  prev_term_active bigint,
  pct_prev_term    numeric
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
  v_tstart date;
  v_tend   date;
  v_pstart date;   -- the last COMPLETED term: the one that decides "dead" for term features
  v_pend   date;
BEGIN
  IF v_uid IS NULL AND NOT v_admin THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF NOT v_admin THEN
    SELECT p.institution_id INTO v_scope FROM public.profiles p WHERE p.id = v_uid;
    IF v_scope IS NULL THEN
      RAISE EXCEPTION 'no institution on your profile' USING ERRCODE = '42501';
    END IF;
  END IF;
  SELECT w.term_start, w.term_end INTO v_tstart, v_tend FROM public.fn_adoption_term_window() w;
  SELECT w.term_start, w.term_end INTO v_pstart, v_pend FROM public.fn_adoption_term_window(v_tstart - 1) w;

  RETURN QUERY
  WITH f AS (
    SELECT fr.feature_key, fr.title, fr.module, fr.core_action, fr.shipped_at,
           fr.status, fr.source_pr, fr.usage_wired,
           (fr.usage_event_module IS NOT NULL) AS usage_bridged, fr.usage_synced_at,
           fr.cadence, fr.skip_reason,
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
           bool_or(fu.day >= v_week AND fu.day < v_week + 7)     AS this_week,
           bool_or(fu.day >= v_tstart AND fu.day <= v_tend)     AS this_term,
           bool_or(fu.day >= v_pstart AND fu.day <= v_pend)     AS prev_term
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
           count(*) FILTER (WHERE u.this_term)             AS term_active,
           count(*) FILTER (WHERE u.prev_term)             AS prev_term_active,
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
         public.fn_adoption_answers(f.feature_key, v_scope),
         v_week,
         f.usage_wired,
         f.usage_bridged,
         f.usage_synced_at,
         f.cadence,
         COALESCE(a.term_active, 0)::bigint,
         CASE WHEN COALESCE(a.intended_count, 0) > 0
              THEN round(a.term_active::numeric * 100 / a.intended_count, 1) ELSE 0 END,
         v_tstart,
         v_tend,
         f.skip_reason,
         v_pstart,
         v_pend,
         COALESCE(a.prev_term_active, 0)::bigint,
         CASE WHEN COALESCE(a.intended_count, 0) > 0
              THEN round(a.prev_term_active::numeric * 100 / a.intended_count, 1) ELSE 0 END
  FROM f
  LEFT JOIN agg a   ON a.feature_key = f.feature_key AND a.role = f.role
  LEFT JOIN asked k ON k.feature_key = f.feature_key
  ORDER BY f.shipped_at DESC, f.feature_key, f.role;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_metrics(date, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_metrics(date, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5) fn_adoption_register — adds p_cadence (old overload dropped so the
--    name resolves to one function)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_adoption_register(text, text, text, text[], text, integer, timestamptz, boolean, text, text, text);

-- ci:allow-secdef-authenticated the body RAISES 42501 unless is_super_admin(); only the desks / super admins label features.
CREATE OR REPLACE FUNCTION public.fn_adoption_register(
  p_feature_key    text,
  p_title          text,
  p_core_action    text,
  p_intended_roles text[] DEFAULT '{all}'::text[],
  p_module         text DEFAULT NULL,
  p_source_pr      integer DEFAULT NULL,
  p_shipped_at     timestamptz DEFAULT NULL,
  p_usage_wired    boolean DEFAULT false,
  p_event_module   text DEFAULT NULL,
  p_event_feature  text DEFAULT NULL,
  p_event_type     text DEFAULT NULL,
  p_cadence        text DEFAULT 'weekly',
  p_skip_reason    text DEFAULT NULL
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
  IF p_cadence IS NULL OR p_cadence NOT IN ('weekly', 'term') THEN
    RETURN jsonb_build_object('success', false, 'error', 'cadence must be weekly or term');
  END IF;

  INSERT INTO public.feature_registry
    (feature_key, title, module, intended_roles, core_action, shipped_at, source_pr, created_by,
     usage_wired, usage_event_module, usage_event_feature, usage_event_type, cadence, skip_reason)
  VALUES
    (p_feature_key, btrim(p_title), NULLIF(btrim(p_module), ''),
     COALESCE(p_intended_roles, '{all}'::text[]), btrim(p_core_action),
     COALESCE(p_shipped_at, now()), p_source_pr, v_uid,
     COALESCE(p_usage_wired, false) OR NULLIF(btrim(p_event_module), '') IS NOT NULL,
     NULLIF(btrim(p_event_module), ''), NULLIF(btrim(p_event_feature), ''), NULLIF(btrim(p_event_type), ''),
     p_cadence, NULLIF(btrim(p_skip_reason), ''))
  ON CONFLICT (feature_key) DO UPDATE
    SET title          = EXCLUDED.title,
        module         = COALESCE(EXCLUDED.module, public.feature_registry.module),
        intended_roles = EXCLUDED.intended_roles,
        core_action    = EXCLUDED.core_action,
        shipped_at     = COALESCE(p_shipped_at, public.feature_registry.shipped_at),
        source_pr      = COALESCE(EXCLUDED.source_pr, public.feature_registry.source_pr),
        usage_wired    = public.feature_registry.usage_wired OR EXCLUDED.usage_wired,
        usage_event_module  = COALESCE(EXCLUDED.usage_event_module,  public.feature_registry.usage_event_module),
        usage_event_feature = COALESCE(EXCLUDED.usage_event_feature, public.feature_registry.usage_event_feature),
        usage_event_type    = COALESCE(EXCLUDED.usage_event_type,    public.feature_registry.usage_event_type),
        cadence        = EXCLUDED.cadence,
        skip_reason    = EXCLUDED.skip_reason,   -- NULL clears a skip: the label is measured again
        updated_at     = now();

  RETURN jsonb_build_object('success', true, 'feature_key', p_feature_key, 'cadence', p_cadence);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_adoption_register(text, text, text, text[], text, integer, timestamptz, boolean, text, text, text, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_register(text, text, text, text[], text, integer, timestamptz, boolean, text, text, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6) fn_adoption_ask_why — a term feature is asked about only in the last
--    14 days of the term, about people with no use THIS term (R-A4).
--    Body otherwise as migration C.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_adoption_ask_why(text);

-- ci:allow-secdef-authenticated the body RAISES 42501 unless is_super_admin(); only the Adoption desk / super admins may send the why-not question.
-- p_as_of: the day to judge "last 14 days of the term" from (default: today, IST);
-- lets the rehearsal harness stand at any point of a term without a real clock change.
CREATE OR REPLACE FUNCTION public.fn_adoption_ask_why(p_feature_key text, p_as_of date DEFAULT NULL)
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
  v_tstart  date;
  v_tend    date;
  v_today   date := COALESCE(p_as_of, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_from    date;   -- "no use since" boundary: term start for term features, forever for weekly
BEGIN
  IF NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'super admin required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('fn_adoption_ask_why'));

  IF NOT COALESCE(public.fn_get_policy_bool('adoption.loop.enabled', false), false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'adoption loop is switched off (policy adoption.loop.enabled)');
  END IF;

  SELECT * INTO v_feat FROM public.feature_registry WHERE feature_key = p_feature_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'unknown feature');
  END IF;
  IF v_feat.skip_reason IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'this feature is skipped on purpose: ' || v_feat.skip_reason);
  END IF;
  IF NOT v_feat.usage_wired THEN
    RETURN jsonb_build_object('success', false, 'error', 'no usage recording for this feature yet — it cannot be judged dead');
  END IF;
  IF v_feat.usage_event_module IS NOT NULL
     AND (v_feat.usage_synced_at IS NULL OR v_feat.usage_synced_at < now() - interval '7 days') THEN
    RETURN jsonb_build_object('success', false, 'error', 'usage for this feature was last pulled from the log more than 7 days ago — pull first');
  END IF;
  IF v_feat.status = 'retired' THEN
    RETURN jsonb_build_object('success', false, 'error', 'feature is retired');
  END IF;
  IF v_feat.shipped_at > now() - interval '14 days' THEN
    RETURN jsonb_build_object('success', false, 'error', 'feature is younger than 14 days');
  END IF;

  IF v_feat.cadence = 'term' THEN
    SELECT w.term_start, w.term_end INTO v_tstart, v_tend FROM public.fn_adoption_term_window(v_today) w;
    IF v_today < v_tend - 14 THEN
      RETURN jsonb_build_object('success', false,
        'error', 'a term-judged feature is asked about only in the last 14 days of the term (term ends ' || v_tend::text || ')');
    END IF;
    v_from := v_tstart;
  ELSE
    v_from := DATE '1900-01-01';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT pr.user_id), '{}'::uuid[]) INTO v_targets
  FROM public.fn_adoption_person_roles() pr
  WHERE pr.is_super_admin = false
    AND (cardinality(v_feat.intended_roles) = 0
         OR 'all' = ANY (v_feat.intended_roles)
         OR pr.role = ANY (v_feat.intended_roles))
    AND NOT EXISTS (SELECT 1 FROM public.feature_usage fu
                    WHERE fu.user_id = pr.user_id AND fu.feature_key = p_feature_key
                      AND fu.day >= v_from)
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
REVOKE EXECUTE ON FUNCTION public.fn_adoption_ask_why(text, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_adoption_ask_why(text, date) TO authenticated, service_role;
