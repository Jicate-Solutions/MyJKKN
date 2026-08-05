-- ============================================================================
-- Gemba — tell the posted associates when official lapses
-- File: 20260802030000_gemba_official_lapse_notice.sql
-- Date: 2026-07-31
--
-- WHY THIS EXISTS
--   20260731043000_gemba_observation_record.sql built the whole of D4: a matching
--   recorded visit stamps mba_dept_artifacts.official_until, and every read of the
--   column already treats a past timestamp as "not official any more". The expiry
--   is built and it is enforced.
--
--   What is missing is the TELLING. official_until slides past in the background,
--   the document silently stops being official, and nobody hears. The people who
--   would act on it — the associates posted to that department — find out only if
--   they happen to open the page and read a date. That is the whole of this change:
--   the transition already happens, this makes it audible.
--
-- WHAT IT ADDS
--   1. gemba_official_lapse_notices — the dedupe ledger. One row per (artifact,
--      the exact official_until that passed). That composite is the idempotency
--      key, not a boolean flag on the artifact: a department that is visited again
--      gets a NEW official_until, so a SECOND lapse months later is a genuinely
--      different event and must be tellable. A flag would have to be cleared by
--      fn_gemba_observation_record, which would mean editing a function this
--      change has no business editing.
--   2. fn_gemba_official_lapse_notify(limit) — finds lapsed-and-unannounced
--      artifacts and notifies the actively-posted associates for that department.
--
-- IDEMPOTENCY IS THE POINT, NOT A STYLE NOTE
--   public.notifications holds 229,592 rows on this project today. A sweep that
--   re-announces the same lapse every night is not untidy, it is harm — it buries
--   the bell and trains people to ignore it. There are therefore TWO independent
--   guards, either of which alone would be sufficient:
--     * the ledger's UNIQUE (artifact_id, lapsed_at), checked before the insert;
--     * notifications.idempotency_key, which carries a UNIQUE partial index
--       (idx_notifications_idempotency), so even a crash between "notify" and
--       "record in the ledger" cannot produce a second bell item.
--   Every notice also carries expires_at, so a lapse nobody attends to ages out of
--   the bell instead of accumulating forever (lib/attention-bar/layers/layer-0.ts
--   drops a notification whose expires_at has passed).
--
--   Neither guard names an object this file does not itself create. The ledger's
--   UNIQUE is declared below; idx_notifications_idempotency is verified live. The
--   per-person fan-out into user_notifications deliberately does NOT name the
--   out-of-band constraint that happens to exist on that table — see the comment
--   at that INSERT for why a name no migration in this repository creates is not
--   a guarantee this function is allowed to depend on.
--
-- WHO IS TOLD — the posted associates, and nobody else
--   mba_associate_postings WHERE is_active AND area_id = the artifact's area_id.
--   29 active postings across all 14 departments today. This is deliberately NOT
--   broadcast to board managers, officers or admins: a lapse is a department's own
--   business and the associates are the people who can actually go and look. The
--   recipient set is exactly the posting rule the spec states — the posting's own
--   is_active — with no second liveness filter layered on top, because
--   profiles.is_active is DERIVED from a learner lifecycle field and using it here
--   would silently drop a legitimately-posted associate for an unrelated reason.
--
-- WHEN NOBODY IS POSTED
--   No notice is sent and NO ledger row is written, so the artifact stays eligible.
--   The moment somebody is posted to that department they are told the playbook is
--   stale. Writing a ledger row for an empty recipient set would mark the lapse
--   "handled" when in fact it was announced to no one.
--
-- SECURITY — cron-only, service_role only
--   fn_gemba_official_lapse_notify reads every department's postings and WRITES
--   notification rows to other people. It takes no caller-supplied identity, makes
--   no authorisation decision on behalf of a signed-in user, and has no meaning
--   outside the nightly sweep. It is therefore revoked from anon, authenticated
--   and PUBLIC and granted to service_role alone — the same shape as its closest
--   sibling, fn_accreditation_narrative_capout_pending (verified live 2026-07-31:
--   anon=false, authenticated=false, service_role=true). Supabase default-grants
--   anon EXECUTE on every new function separately from PUBLIC, so both revokes are
--   present and both are load-bearing.
--
-- NOT APPLIED. This file is Director-gated. It was rehearsed on production inside
-- a single Mgmt-API BEGIN … ROLLBACK batch (behaviour proven, then rolled back and
-- residue verified zero in a separate call) and carries no COMMIT of its own, so
-- that rehearsal stays a genuine dry run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The dedupe ledger.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gemba_official_lapse_notices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id     uuid NOT NULL REFERENCES public.mba_dept_artifacts(id) ON DELETE CASCADE,
  area_id         uuid NOT NULL REFERENCES public.improvement_areas(id)  ON DELETE CASCADE,
  -- The exact official_until value that passed. Half of the idempotency key, and
  -- the reason a later re-official can lapse and be announced again.
  lapsed_at       timestamptz NOT NULL,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  recipient_count integer NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  notified_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_gemba_lapse_notice_artifact_lapse UNIQUE (artifact_id, lapsed_at)
);

CREATE INDEX IF NOT EXISTS idx_gemba_lapse_notices_area
  ON public.gemba_official_lapse_notices (area_id, notified_at DESC);

COMMENT ON TABLE public.gemba_official_lapse_notices IS
  'One row per lapse ANNOUNCED. UNIQUE (artifact_id, lapsed_at) is the idempotency key: a re-visited department gets a fresh official_until, so its next lapse is a different event and is announced again. A lapse with no actively-posted associate gets NO row, so it is announced the moment somebody is posted.';

COMMENT ON COLUMN public.gemba_official_lapse_notices.lapsed_at IS
  'The mba_dept_artifacts.official_until value that had passed when the notice went out. Not the time the notice was sent — that is notified_at.';

-- Supabase default-grants the public anon key ALL on every new table.
REVOKE ALL ON TABLE public.gemba_official_lapse_notices FROM anon, PUBLIC;
GRANT  SELECT ON TABLE public.gemba_official_lapse_notices TO authenticated;

ALTER TABLE public.gemba_official_lapse_notices ENABLE ROW LEVEL SECURITY;

-- Same attachment test as gemba_observations_read: you hold a current role on this
-- board, or you are posted to it, or you are an officer/admin. No INSERT/UPDATE/
-- DELETE policy exists — the only writer is the SECURITY DEFINER function below.
DROP POLICY IF EXISTS gemba_official_lapse_notices_read ON public.gemba_official_lapse_notices;
CREATE POLICY gemba_official_lapse_notices_read ON public.gemba_official_lapse_notices
FOR SELECT TO authenticated USING (
  COALESCE(public.is_super_admin(), false)
  OR COALESCE(public.is_admin(), false)
  OR COALESCE(public.user_has_permission('improvement.area_role.assign'), false)
  OR COALESCE(public.user_has_permission('improvement.board.manage'), false)
  OR EXISTS (
    SELECT 1 FROM public.hr_additional_roles h
     WHERE h.improvement_area_id = gemba_official_lapse_notices.area_id
       AND h.is_current
       AND h.staff_id IN (SELECT s.id FROM public.staff s WHERE s.profile_id = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.mba_associate_postings p
     WHERE p.area_id = gemba_official_lapse_notices.area_id
       AND p.associate_user_id = auth.uid()
       AND p.is_active
  )
);

-- ----------------------------------------------------------------------------
-- 2. How long a lapse notice stays in the bell. A config row, not a constant —
--    the number appears exactly once in this file, as the reader's fallback.
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   is_system, is_active, classification, publication_state)
VALUES
  ('improvement.gemba_lapse_notice_expiry_days', 'global', NULL, '30'::jsonb,
   'How long the "official status has lapsed" bell item stays visible before it ages out. The lapse itself does not expire — only the reminder does, so an unattended playbook does not quietly occupy the bell forever.',
   'number', true, true, 'operational', 'published')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. The sweep.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_gemba_official_lapse_notify(
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  artifact_id     uuid,
  area_id         uuid,
  area_label      text,
  artifact_type   text,
  lapsed_at       timestamptz,
  recipients      integer,
  notification_id uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_expiry_days integer := public.fn_get_policy_int('improvement.gemba_lapse_notice_expiry_days', 30);
  v_cap         integer := GREATEST(1, LEAST(200, COALESCE(p_limit, 50)));
  r             record;
  v_recipients  uuid[];
  v_author      uuid;
  v_key         text;
  v_notif       uuid;
  v_type_label  text;
BEGIN
  FOR r IN
    SELECT a.id            AS aid,
           a.area_id       AS area,
           a.artifact_type AS atype,
           a.official_at   AS since,
           a.official_until AS until,
           a.official_by   AS by_uid,
           ar.label        AS label
      FROM public.mba_dept_artifacts a
      JOIN public.improvement_areas ar ON ar.id = a.area_id
     WHERE a.official_until IS NOT NULL
       AND a.official_until <= now()
       -- Guard 1: this exact lapse has already been announced.
       AND NOT EXISTS (
             SELECT 1 FROM public.gemba_official_lapse_notices l
              WHERE l.artifact_id = a.id
                AND l.lapsed_at   = a.official_until
           )
     ORDER BY a.official_until ASC
     LIMIT v_cap
  LOOP
    -- The people posted to this department right now. Targeted, never broadcast.
    -- Capped at 50: the notifications pipeline does not fan out beyond that.
    SELECT array_agg(u) INTO v_recipients
      FROM (
        SELECT DISTINCT p.associate_user_id AS u
          FROM public.mba_associate_postings p
          JOIN public.profiles pr ON pr.id = p.associate_user_id
         WHERE p.area_id = r.area
           AND p.is_active
         LIMIT 50
      ) s;

    -- Nobody posted → announce nothing and record nothing, so this lapse is still
    -- eligible the day somebody is posted.
    IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN
      CONTINUE;
    END IF;

    -- notifications.created_by is NOT NULL and references profiles. The natural
    -- author is whoever's visit made this official; fall back to a stable super
    -- admin, then to a recipient, so the notice can never fail to have an author.
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

    v_type_label := CASE r.atype
                      WHEN 'sop'        THEN 'SOP'
                      WHEN 'organogram' THEN 'organogram'
                      WHEN 'workflow'   THEN 'workflow'
                      ELSE r.atype
                    END;

    -- Guard 2, independent of the ledger: one deterministic key per (artifact,
    -- lapse), enforced by idx_notifications_idempotency.
    v_key := 'gemba.official_lapse|' || r.aid::text || '|'
             || to_char(r.until AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS"Z"');

    INSERT INTO public.notifications
      (title, body, category, kind, targeting, url, priority,
       created_by, expires_at, idempotency_key, metadata)
    VALUES (
      'Official status has lapsed — ' || COALESCE(r.label, 'department') || ' · ' || v_type_label,
      -- notifications.body is NOT NULL, and NULL anywhere in a || chain makes the
      -- WHOLE string NULL — so one nullable input does not spoil one message, it
      -- raises 23502 and, with no EXCEPTION block, ends the sweep for everyone.
      -- Every input to this chain audited against the live schema 2026-08-01:
      --   v_type_label  <- mba_dept_artifacts.artifact_type   NOT NULL (CASE ELSE passes it through)
      --   r.label       <- improvement_areas.label            NOT NULL (COALESCE anyway)
      --   r.until       <- official_until                     nullable in schema, but
      --                    the loop's WHERE requires IS NOT NULL, so not null here
      --   r.since       <- official_at                        NULLABLE, and nothing guards it
      -- official_at is therefore the one real hole. Both of today's writers set
      -- official_at and official_until together and a repo sweep found no third
      -- writer — but "unreachable given every current writer" is not a promise the
      -- next writer is bound by, and the blast radius is the entire nightly run.
      -- COALESCE degrades one sentence instead.
      'The ' || v_type_label || ' for ' || COALESCE(r.label, 'this department')
        || ' was made official on '
        || COALESCE(to_char(r.since, 'DD Mon YYYY'), 'a date that was never recorded')
        || ' and that ran out on ' || to_char(r.until, 'DD Mon YYYY')
        || '. Until someone visits the department again and records that the document still '
        || 'describes what actually happens, it is a proposal — not an official document.',
      'improvement:gemba',
      -- work_item, not announcement: this is a cron-emitted operational nudge, and
      -- kind='work_item' is what keeps it out of the human-authored broadcast
      -- outbox (lib/services/notification/sent-service.ts filters on exactly this).
      'work_item',
      jsonb_build_object('type', 'user', 'user_ids', to_jsonb(v_recipients)),
      '/improvement-board/analytics',
      'normal',
      v_author,
      now() + make_interval(days => GREATEST(1, v_expiry_days)),
      v_key,
      jsonb_build_object(
        'source',        'gemba.official_lapse',
        'artifact_id',   r.aid,
        'area_id',       r.area,
        'artifact_type', r.atype,
        'lapsed_at',     r.until
      )
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_notif;

    -- Lost the race (or a prior run crashed after notifying): reuse that row
    -- rather than sending a second bell item.
    IF v_notif IS NULL THEN
      SELECT n.id INTO v_notif
        FROM public.notifications n
       WHERE n.idempotency_key = v_key
       LIMIT 1;
    END IF;

    IF v_notif IS NULL THEN
      CONTINUE;  -- the insert genuinely produced nothing; leave the lapse eligible
    END IF;

    -- Dedupe the per-person fan-out WITHOUT resting on a constraint NAME.
    --
    -- The live database does carry UNIQUE (notification_id, user_id) here —
    -- verified against production 2026-08-01: pg_constraint conname
    -- 'user_notifications_notification_id_user_id_key', contype 'u'. But NO
    -- migration in this repository creates it. It exists out-of-band, so the name
    -- is not something this file can promise: a rename, or a database rebuilt
    -- from migrations alone, turns `ON CONFLICT ON CONSTRAINT <name>` into a
    -- 42704 at run time — and with no EXCEPTION block that error does not skip a
    -- row, it kills the whole sweep for everyone. Two name-free guards instead:
    --   * NOT EXISTS — self-owned. Holds even if no unique index existed at all.
    --   * bare ON CONFLICT DO NOTHING — with no conflict target, DO NOTHING
    --     arbitrates against EVERY unique index on the table, so it still
    --     dedupes; it closes the window between the NOT EXISTS and the insert
    --     when two sweeps race. This is also what every other writer to
    --     user_notifications in this repository uses.
    -- A bare COLUMN target — ON CONFLICT (notification_id, user_id) — is the one
    -- form that cannot be used: notification_id is an OUT parameter of this
    -- function, so plpgsql reads the reference as ambiguous (42702). That is why
    -- the constraint name was reached for in the first place.
    INSERT INTO public.user_notifications (notification_id, user_id)
    SELECT v_notif, s.u
      FROM unnest(v_recipients) AS s(u)
     WHERE NOT EXISTS (
             SELECT 1 FROM public.user_notifications un
              WHERE un.notification_id = v_notif
                AND un.user_id         = s.u
           )
    ON CONFLICT DO NOTHING;

    INSERT INTO public.gemba_official_lapse_notices
      (artifact_id, area_id, lapsed_at, notification_id, recipient_count)
    VALUES (r.aid, r.area, r.until, v_notif, array_length(v_recipients, 1))
    ON CONFLICT ON CONSTRAINT uq_gemba_lapse_notice_artifact_lapse DO NOTHING;

    artifact_id     := r.aid;
    area_id         := r.area;
    area_label      := r.label;
    artifact_type   := r.atype;
    lapsed_at       := r.until;
    recipients      := array_length(v_recipients, 1);
    notification_id := v_notif;
    RETURN NEXT;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.fn_gemba_official_lapse_notify(integer) IS
  'Nightly sweep: for every department playbook whose official_until has passed and whose lapse has not already been announced, tell the associates actively posted to that department. Targeted, never broadcast. Idempotent twice over — the gemba_official_lapse_notices ledger and notifications.idempotency_key — so a second run in the same night adds nothing. Announces a lapse; changes no artifact and makes nothing official.';

-- ----------------------------------------------------------------------------
-- 4. ACLs. Cron-only (see the SECURITY note in the header): revoked from anon,
--    authenticated and PUBLIC, granted to service_role alone.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_gemba_official_lapse_notify(integer)
  FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_gemba_official_lapse_notify(integer)
  TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Apply-time asserts — fail loudly here rather than let the notice quietly
--    not exist, which is the exact failure this migration is fixing.
-- ----------------------------------------------------------------------------
DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'gemba_official_lapse_notices' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS is not enabled on gemba_official_lapse_notices';
  END IF;

  IF has_table_privilege('anon', 'public.gemba_official_lapse_notices', 'SELECT')
     OR has_table_privilege('anon', 'public.gemba_official_lapse_notices', 'INSERT') THEN
    RAISE EXCEPTION 'anon can reach gemba_official_lapse_notices — the anon lock failed';
  END IF;

  IF has_function_privilege('anon', 'public.fn_gemba_official_lapse_notify(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_gemba_official_lapse_notify(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_gemba_official_lapse_notify is reachable outside cron — the lockdown failed';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.fn_gemba_official_lapse_notify(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot EXECUTE fn_gemba_official_lapse_notify — the sweep would never run';
  END IF;

  IF public.fn_get_policy_int('improvement.gemba_lapse_notice_expiry_days', -1) < 1 THEN
    RAISE EXCEPTION 'policy improvement.gemba_lapse_notice_expiry_days is missing or < 1';
  END IF;
END $assert$;

NOTIFY pgrst, 'reload schema';
