-- ============================================================================
-- Improvement Board — tell the department owner when an idea is never triaged
-- File: 20260816050000_improvement_untriaged_idea_notice.sql
-- Date: 2026-08-10
--
-- WHY THIS EXISTS
--   Measured on production on 2026-08-10:
--     improvement_ideas            21 rows, filed by 18 distinct authors
--     ideas past 'logged'           0 — every one of the 18 open ideas is untouched
--     ideas withdrawn               3
--   Learners are filing. Nobody is triaging, and nothing in the product notices.
--
--   20260723140000_improvement_ranking_and_escalation.sql already built an ageing
--   sweep, but it watches 'approved' ideas whose fix is unapplied — a state no idea
--   on this project has ever reached. The one place everything is actually stuck is
--   the only place with no ageing at all: an idea sits in 'logged' indefinitely and
--   the person who filed it hears nothing, ever.
--
--   That silence is the thing to fix. Eighteen people wrote a business case and got
--   no response; whatever else the board needs, it will not get a nineteenth.
--
-- WHAT IT ADDS
--   1. improvement_untriaged_notices — the dedupe ledger. One row per idea EVER.
--   2. platform_policies 'improvement.triage_after_days' (default 3).
--   3. platform_policies 'improvement.triage_notice_expiry_days' (default 30).
--   4. fn_improvement_untriaged_notify(limit) — SERVICE-ROLE-ONLY SECDEF sweep.
--
-- WHY ONE NOTICE PER IDEA, EVER (and not a nightly nudge)
--   The lapse notice keys on (artifact_id, lapsed_at) because a re-visited document
--   gets a fresh official_until, making its next lapse a genuinely different event.
--   An idea has no equivalent: created_at never changes, so (idea_id, created_at)
--   collapses to UNIQUE (idea_id). That is the honest key rather than a fabricated
--   one. The consequence is deliberate — an owner who ignores the notice is a
--   management problem, and a board that re-nudges every night trains people to
--   filter the category, which costs more than the second reminder gains.
--
-- WHY THE OWNER AND NOT THE AUTHOR
--   The author already knows they are waiting. Telling them again tells them only
--   that they were right to feel ignored. The notice goes to whoever currently holds
--   the area role (20260807191500 / #2776 named that person) because they are the
--   only one who can change the state.
--
-- WHY NO OWNER MEANS NO ROW
--   Straight from the lapse sweep: an area with no current role holder is skipped
--   and writes nothing, so the idea stays eligible and is announced the day somebody
--   is named. Recording a notice sent to nobody would permanently silence it.
--
-- WHY NOT A NEW ACTIVITY VERB
--   improvement_idea_activity.action is free text with a documented vocabulary
--   (created|edited|status_change|commented|escalated|scored|value_verified). This
--   writes 'escalated', the existing word for "this waited too long", with the reason
--   in note. Inventing 'triage_overdue' would render as an unknown action in every
--   timeline that switches on the documented set.
--
-- WHY NO CRON ENTRY OF ITS OWN
--   vercel.json already holds exactly 100 entries — Vercel's hard cap — which is why
--   the gemba lapse sweep rides the daily improvement-rank-ideas pass. This does the
--   same, on the same board, on the same night. It is synchronous (a DB sweep, no
--   AI) and must run ONLY on the daily pass, never on the */30 collect tick: collect
--   runs 48x a day and this is exactly the flood the ledger exists to prevent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The ledger. One row per idea announced.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.improvement_untriaged_notices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id         uuid NOT NULL REFERENCES public.improvement_ideas(id) ON DELETE CASCADE,
  area_id         uuid NOT NULL REFERENCES public.improvement_areas(id) ON DELETE CASCADE,
  -- How long the idea had been sitting in 'logged' when the notice went out.
  -- Recorded, not derived, so a later change to the policy window cannot rewrite
  -- history and make an old notice look early or late.
  waited_days     integer NOT NULL CHECK (waited_days >= 0),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  recipient_count integer NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  notified_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_improvement_untriaged_notice_idea UNIQUE (idea_id)
);

CREATE INDEX IF NOT EXISTS idx_improvement_untriaged_notices_area
  ON public.improvement_untriaged_notices (area_id, notified_at DESC);

COMMENT ON TABLE public.improvement_untriaged_notices IS
  'One row per idea whose lack of triage has been announced. UNIQUE (idea_id) is the idempotency key: an idea is announced once and never again, because created_at does not move and a nightly re-nudge would train owners to filter the category. An idea in an area with no current role holder gets NO row, so it is announced the day an owner is named.';

COMMENT ON COLUMN public.improvement_untriaged_notices.waited_days IS
  'Days the idea had spent in logged when the notice was sent. Stored rather than computed so changing improvement.triage_after_days later cannot retroactively alter what this notice reported.';

-- Supabase default-grants the public anon key ALL on every new table.
REVOKE ALL ON TABLE public.improvement_untriaged_notices FROM anon, PUBLIC;
GRANT  SELECT ON TABLE public.improvement_untriaged_notices TO authenticated;

ALTER TABLE public.improvement_untriaged_notices ENABLE ROW LEVEL SECURITY;

-- Same attachment test the rest of this board uses: a current role on the area, a
-- posting to it, or officer/admin. No INSERT/UPDATE/DELETE policy exists — the only
-- writer is the SECURITY DEFINER function below.
DROP POLICY IF EXISTS improvement_untriaged_notices_read ON public.improvement_untriaged_notices;
CREATE POLICY improvement_untriaged_notices_read ON public.improvement_untriaged_notices
FOR SELECT TO authenticated USING (
  COALESCE(public.is_super_admin(), false)
  OR COALESCE(public.is_admin(), false)
  OR COALESCE(public.user_has_permission('improvement.area_role.assign'), false)
  OR COALESCE(public.user_has_permission('improvement.board.manage'), false)
  OR EXISTS (
    SELECT 1 FROM public.hr_additional_roles h
     WHERE h.improvement_area_id = improvement_untriaged_notices.area_id
       AND h.is_current
       AND h.staff_id IN (SELECT s.id FROM public.staff s WHERE s.profile_id = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.mba_associate_postings p
     WHERE p.area_id = improvement_untriaged_notices.area_id
       AND p.associate_user_id = auth.uid()
       AND p.is_active
  )
);

-- ----------------------------------------------------------------------------
-- 2. Config. Both numbers appear exactly once each, as the reader's fallback.
--    Three days, not the escalation sweep's seven: seven is how long a decision
--    may take, three is how long a person may be left with no acknowledgement.
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   is_system, is_active, classification, publication_state)
VALUES
  ('improvement.triage_after_days', 'global', NULL, '3'::jsonb,
   'How many days an improvement idea may sit in Logged before the department owner is told nobody has looked at it. Deliberately shorter than improvement.escalate_after_days: that window covers making a decision, this one covers acknowledging a person.',
   'number', true, true, 'operational', 'published'),
  ('improvement.triage_notice_expiry_days', 'global', NULL, '30'::jsonb,
   'How long the "nobody has triaged this" bell item stays visible before it ages out. The idea does not expire — only the reminder does.',
   'number', true, true, 'operational', 'published')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. The sweep.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_improvement_untriaged_notify(
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  idea_id         uuid,
  area_id         uuid,
  area_label      text,
  waited_days     integer,
  recipients      integer,
  notification_id uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
-- The RETURNS TABLE names above are also PL/pgSQL variables, and two of them —
-- idea_id and area_id — are column names on improvement_untriaged_notices. That
-- makes the INSERT's column list and its ON CONFLICT target ambiguous, and
-- PostgreSQL raises 42702 at RUN time, not at CREATE time: the function applies
-- perfectly and then throws the first night it finds an idea to announce.
--
-- Caught by executing the sweep inside a rolled-back transaction on production
-- 2026-08-10, after the migration had applied cleanly and every apply-time
-- assert had passed. An INSERT column list cannot be schema-qualified, so this
-- directive is the fix: where a bare name could mean either, the COLUMN wins.
--
-- Safe here specifically because the output variables are only ever written to
-- (idea_id := r.iid and friends, at the bottom of the loop) and assignment
-- targets are never ambiguous. Every read of a table column in this function is
-- already alias-qualified. Nothing else in the body changes meaning.
#variable_conflict use_column
DECLARE
  v_after_days  integer := public.fn_get_policy_int('improvement.triage_after_days', 3);
  v_expiry_days integer := public.fn_get_policy_int('improvement.triage_notice_expiry_days', 30);
  v_cap         integer := GREATEST(1, LEAST(200, COALESCE(p_limit, 50)));
  r             record;
  v_recipients  uuid[];
  v_author      uuid;
  v_key         text;
  v_notif       uuid;
  v_waited      integer;
BEGIN
  FOR r IN
    SELECT i.id         AS iid,
           i.area_id    AS area,
           i.title      AS title,
           i.created_at AS since,
           i.author_id  AS by_uid,
           ar.label     AS label
      FROM public.improvement_ideas i
      JOIN public.improvement_areas ar ON ar.id = i.area_id
     WHERE i.status = 'logged'
       -- area_id is nullable on improvement_ideas; the JOIN drops those rows on
       -- purpose. An idea with no area has no owner to tell, and guessing one from
       -- target_department_id would notify somebody who never accepted the role.
       AND i.created_at <= now() - make_interval(days => GREATEST(1, v_after_days))
       -- Guard 1: this idea has already been announced.
       AND NOT EXISTS (
             SELECT 1 FROM public.improvement_untriaged_notices n
              WHERE n.idea_id = i.id
           )
     ORDER BY i.created_at ASC
     LIMIT v_cap
  LOOP
    -- Whoever currently holds the role for this area. Targeted, never broadcast.
    -- Capped at 50: the notifications pipeline does not fan out beyond that.
    SELECT array_agg(u) INTO v_recipients
      FROM (
        SELECT DISTINCT s.profile_id AS u
          FROM public.hr_additional_roles h
          JOIN public.staff s ON s.id = h.staff_id
          JOIN public.profiles pr ON pr.id = s.profile_id
         WHERE h.improvement_area_id = r.area
           AND h.is_current
           AND s.profile_id IS NOT NULL
         LIMIT 50
      ) t;

    -- No current owner → announce nothing and record nothing, so this idea is
    -- still eligible the day somebody is named to the area.
    IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN
      CONTINUE;
    END IF;

    v_waited := GREATEST(0, EXTRACT(DAY FROM (now() - r.since))::integer);

    -- notifications.created_by is NOT NULL and references profiles. The natural
    -- author is whoever filed the idea; fall back to a stable super admin, then to
    -- a recipient, so the notice can never fail to have an author.
    SELECT pr.id INTO v_author FROM public.profiles pr WHERE pr.id = r.by_uid;
    IF v_author IS NULL THEN
      SELECT pr.id INTO v_author
        FROM public.profiles pr
       WHERE COALESCE(pr.is_super_admin, false)
         AND COALESCE(pr.is_active, true)
       ORDER BY pr.id
       LIMIT 1;
    END IF;
    IF v_author IS NULL THEN
      v_author := v_recipients[1];
    END IF;

    -- Guard 2, independent of the ledger: one deterministic key per idea, enforced
    -- by idx_notifications_idempotency.
    v_key := 'improvement.untriaged|' || r.iid::text;

    -- notifications.body is NOT NULL, and a NULL anywhere in a || chain makes the
    -- WHOLE string NULL — which raises 23502 and, with no EXCEPTION block, would end
    -- the sweep for every remaining idea. Every input below audited against the live
    -- schema 2026-08-10:
    --   r.title  <- improvement_ideas.title      NOT NULL
    --   r.label  <- improvement_areas.label      NOT NULL (COALESCE anyway)
    --   r.since  <- improvement_ideas.created_at NOT NULL DEFAULT now()
    --   v_waited <- computed above, never NULL
    INSERT INTO public.notifications
      (title, body, category, kind, targeting, url, priority,
       created_by, expires_at, idempotency_key, metadata)
    VALUES (
      'Nobody has looked at this idea — ' || COALESCE(r.label, 'department'),
      'An improvement idea for ' || COALESCE(r.label, 'this department')
        || ', "' || r.title || '", was filed on '
        || to_char(r.since, 'DD Mon YYYY')
        || ' and has been sitting in Logged for ' || v_waited::text
        || CASE WHEN v_waited = 1 THEN ' day' ELSE ' days' END
        || ' without anyone opening it. The person who wrote it has had no reply. '
        || 'Moving it to Under Review — or rejecting it with a reason — both count as an answer. '
        || 'Leaving it where it is does not.',
      'improvement:triage',
      -- work_item, not announcement: a cron-emitted operational nudge, and
      -- kind='work_item' is what keeps it out of the human-authored broadcast
      -- outbox (lib/services/notification/sent-service.ts filters on exactly this).
      'work_item',
      jsonb_build_object('type', 'user', 'user_ids', to_jsonb(v_recipients)),
      '/improvement-board',
      'normal',
      v_author,
      now() + make_interval(days => GREATEST(1, v_expiry_days)),
      v_key,
      jsonb_build_object(
        'source',      'improvement.untriaged',
        'idea_id',     r.iid,
        'area_id',     r.area,
        'waited_days', v_waited
      )
    )
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING id INTO v_notif;

    INSERT INTO public.improvement_untriaged_notices
      (idea_id, area_id, waited_days, notification_id, recipient_count)
    VALUES (r.iid, r.area, v_waited, v_notif, array_length(v_recipients, 1))
    ON CONFLICT (idea_id) DO NOTHING;

    -- The timeline entry, in the board's existing vocabulary. actor_id is NULL:
    -- no human did this, and attributing a cron sweep to the author or the owner
    -- would put words in the mouth of somebody who did nothing.
    INSERT INTO public.improvement_idea_activity (idea_id, actor_id, action, note)
    VALUES (r.iid, NULL, 'escalated',
            'Untriaged for ' || v_waited::text || ' days — the department owner was notified.');

    idea_id         := r.iid;
    area_id         := r.area;
    area_label      := r.label;
    waited_days     := v_waited;
    recipients      := array_length(v_recipients, 1);
    notification_id := v_notif;
    RETURN NEXT;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.fn_improvement_untriaged_notify(integer) IS
  'Daily sweep: for every improvement idea still in Logged past improvement.triage_after_days whose neglect has not already been announced, tell the current holder of that department''s area role. Targeted, never broadcast. Idempotent twice over — the improvement_untriaged_notices ledger and notifications.idempotency_key — so a second run the same night adds nothing. Announces neglect; changes no idea status.';

-- ----------------------------------------------------------------------------
-- 4. ACLs. Cron-only: revoked from anon, authenticated and PUBLIC, granted to
--    service_role alone (CLAUDE.md cron-RPC rule).
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_improvement_untriaged_notify(integer)
  FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_untriaged_notify(integer)
  TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Apply-time asserts — fail loudly here rather than let the notice quietly not
--    exist, which is the exact failure this migration is fixing.
-- ----------------------------------------------------------------------------
DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'improvement_untriaged_notices' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS is not enabled on improvement_untriaged_notices';
  END IF;

  IF has_table_privilege('anon', 'public.improvement_untriaged_notices', 'SELECT')
     OR has_table_privilege('anon', 'public.improvement_untriaged_notices', 'INSERT') THEN
    RAISE EXCEPTION 'anon can reach improvement_untriaged_notices — the anon lock failed';
  END IF;

  IF has_function_privilege('anon', 'public.fn_improvement_untriaged_notify(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_improvement_untriaged_notify(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_improvement_untriaged_notify is reachable outside cron — the lockdown failed';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.fn_improvement_untriaged_notify(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot EXECUTE fn_improvement_untriaged_notify — the sweep would never run';
  END IF;

  IF public.fn_get_policy_int('improvement.triage_after_days', -1) < 1 THEN
    RAISE EXCEPTION 'policy improvement.triage_after_days is missing or < 1';
  END IF;

  IF public.fn_get_policy_int('improvement.triage_notice_expiry_days', -1) < 1 THEN
    RAISE EXCEPTION 'policy improvement.triage_notice_expiry_days is missing or < 1';
  END IF;
END $assert$;

NOTIFY pgrst, 'reload schema';
