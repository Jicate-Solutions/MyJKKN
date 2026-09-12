-- Chase the review queue, and tell the person who owns it.
-- ---------------------------------------------------------------------------
-- WHY. `under_review` is the one stage of an idea's life that nothing chases.
-- `fn_improvement_untriaged_notify` sweeps `logged` and tells the AREA OWNER;
-- `fn_improvement_escalate_stale_approved` sweeps `approved`. Between them sits
-- a gap, and production is sitting in it: 17 ideas in `under_review`, waiting
-- 10 to 39 days, mean 24 (measured 2026-09-12). Nobody is ever told, so nobody
-- is late — the queue simply ages.
--
-- WHO. A named triager, held as a policy row rather than compiled in, so the
-- Director can hand the queue to somebody else from Role/Policy config without
-- a migration. Resolved by email so the row stays readable; a profile that goes
-- inactive or is renamed resolves to nobody and the sweep skips, loudly-by-
-- absence rather than by mailing a stranger.
--
-- WHAT THIS DOES NOT DO. It does not move, approve, assign or auto-escalate any
-- idea. It sends one notification per idea per stage. The decision stays human.

-- 1. A notice is now per idea PER STAGE ----------------------------------------
-- `uq_improvement_untriaged_notice_idea UNIQUE (idea_id)` means one notice per
-- idea FOREVER. Reusing the ledger for a second stage under that constraint
-- would silently blank the chase for any idea that had already been announced
-- at `logged` — 1 of today's 17, and systematically thereafter. The ledger is
-- per (idea, stage) from here on.
ALTER TABLE public.improvement_untriaged_notices
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'logged';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.improvement_untriaged_notices'::regclass
       AND conname  = 'improvement_untriaged_notices_stage_check'
  ) THEN
    ALTER TABLE public.improvement_untriaged_notices
      ADD CONSTRAINT improvement_untriaged_notices_stage_check
      CHECK (stage IN ('logged', 'under_review'));
  END IF;
END $$;

ALTER TABLE public.improvement_untriaged_notices
  DROP CONSTRAINT IF EXISTS uq_improvement_untriaged_notice_idea;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.improvement_untriaged_notices'::regclass
       AND conname  = 'uq_improvement_untriaged_notice_idea_stage'
  ) THEN
    ALTER TABLE public.improvement_untriaged_notices
      ADD CONSTRAINT uq_improvement_untriaged_notice_idea_stage
      UNIQUE (idea_id, stage);
  END IF;
END $$;

COMMENT ON COLUMN public.improvement_untriaged_notices.stage IS
  'Which stall this notice announced: logged (nobody opened it) or under_review '
  '(nobody decided it). One notice per idea per stage; the pre-existing rows are '
  'all logged, which is why the default backfills them correctly.';

-- 2. Two policy rows -----------------------------------------------------------
-- Same shape as improvement.triage_after_days / improvement.escalate_after_days.
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
VALUES
  ('improvement.review_stale_after_days', 'global', NULL, to_jsonb(7),
   'How many days an idea may sit in Under Review before the person who owns the '
   'triage queue is told it is waiting on them. Counted from when it entered '
   'Under Review, not from when it was filed.',
   'number', true, true),
  ('improvement.triage_owner_email', 'global', NULL, to_jsonb('director@jkkn.ac.in'::text),
   'Email of the person who owns the Improvement Board triage queue. They are told '
   'when an idea has waited in Under Review past improvement.review_stale_after_days. '
   'Change this row to hand the queue to somebody else — no code change needed. '
   'An empty value, or one matching no active profile, turns the chase off.',
   -- 'string', NOT 'text': platform_policies_data_type_check admits only
   -- number|string|boolean|array|object|enum. The reader is fn_get_policy_TEXT,
   -- which is the trap — the function name and the column value differ.
   'string', true, true)
-- The unique index is an EXPRESSION index —
-- uq_platform_policies_key_scope (policy_key, scope_type,
-- COALESCE(scope_id, '00000000-...')) — so a plain (policy_key, scope_type,
-- scope_id) target does NOT match it and would raise 42P10 at apply time.
-- Verified against the live catalogue; this is the house form used by
-- 20260710041000_copo_below_target_alerts.sql.
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- 3. The sweep now covers both stalls ------------------------------------------
-- CREATE OR REPLACE, and the RETURNS TABLE shape is deliberately UNCHANGED:
-- changing it would force a DROP, and a DROP takes the function's ACL with it
-- (grants are postgres + service_role only — never anon, never authenticated).
-- The TypeScript caller (lib/services/improvement/untriaged-sweep.ts,
-- AnnouncedUntriaged) reads exactly these six fields and needs no change; both
-- stalls flow back in one list and are counted together by the existing cron.
--
-- The body below was taken VERBATIM from the live definition via
-- pg_get_functiondef() and then added to. Stall 1 is byte-identical to what runs
-- today apart from its ledger guard and ledger write naming stage='logged'. It
-- was rebuilt this way on purpose: a hand-retyped copy of stall 1 silently lost
-- the user_notifications insert (the bell, PR #3315) and the partial-index
-- predicate on ON CONFLICT, and would have applied cleanly while breaking the
-- delivery path that already works.
CREATE OR REPLACE FUNCTION public.fn_improvement_untriaged_notify(p_limit integer DEFAULT 50)
 RETURNS TABLE(idea_id uuid, area_id uuid, area_label text, waited_days integer, recipients integer, notification_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- The RETURNS TABLE names above are also PL/pgSQL variables, and three of them —
-- idea_id, area_id and notification_id — are column names on tables this function
-- INSERTs into. That makes the INSERT column lists and the ON CONFLICT targets
-- ambiguous, and PostgreSQL raises 42702 at RUN time, not at CREATE time: the
-- function applies perfectly and then throws the first night it finds work.
--
-- Caught by executing the sweep inside a rolled-back transaction on production
-- 2026-08-10, after the migration had applied cleanly and every apply-time assert
-- had passed. An INSERT column list cannot be schema-qualified, so this directive
-- is the fix: where a bare name could mean either, the COLUMN wins. Proven in
-- production — all 10 improvement_untriaged_notices rows carry a non-NULL
-- notification_id, which is only possible if the column won there.
--
-- Safe here specifically because the output variables are only ever written to
-- (idea_id := r.iid and friends, at the bottom of the loop) and assignment targets
-- are never ambiguous. Every read of a table column in this function is already
-- alias-qualified. Nothing else in the body changes meaning.
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
  -- Added for the under_review chase (stall 2). Stall 1 is untouched.
  v_review_days integer := public.fn_get_policy_int('improvement.review_stale_after_days', 7);
  v_owner_email text    := public.fn_get_policy_text('improvement.triage_owner_email', '');
  v_triager     uuid;
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
              WHERE n.idea_id = i.id AND n.stage = 'logged'
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
    v_notif := NULL;

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

    -- ON CONFLICT DO NOTHING returns no row, so RETURNING leaves v_notif NULL when
    -- the notice already existed. Before this migration that path recorded a ledger
    -- row with a NULL notification_id and — now that delivery is the point — would
    -- also skip the junction write, leaving the owner untold about a notice that
    -- demonstrably exists. Resolve it from the deterministic key instead.
    IF v_notif IS NULL THEN
      SELECT n.id INTO v_notif
        FROM public.notifications n
       WHERE n.idempotency_key = v_key;
    END IF;

    -- THE FIX. The bell reads user_notifications; without this the notice above is
    -- invisible to the badge, the inbox and the counts. Shape taken verbatim from
    -- fn_gemba_official_lapse_notify, the sibling this sweep was modelled on.
    -- ON CONFLICT keys on user_notifications_notification_id_user_id_key, so a
    -- re-run adds nothing.
    IF v_notif IS NOT NULL THEN
      INSERT INTO public.user_notifications (notification_id, user_id)
      SELECT v_notif, s.u
        FROM unnest(v_recipients) AS s(u)
      ON CONFLICT (notification_id, user_id) DO NOTHING;
    END IF;

    INSERT INTO public.improvement_untriaged_notices
      (idea_id, area_id, waited_days, notification_id, recipient_count, stage)
    VALUES (r.iid, r.area, v_waited, v_notif, array_length(v_recipients, 1), 'logged')
    ON CONFLICT (idea_id, stage) DO NOTHING;

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

  -- ===== STALL 2: under_review — nobody has DECIDED it. Tell the triager. =====
  -- Everything above this line is the shipped sweep, unchanged except that its
  -- ledger guard and ledger write now name stage='logged'. Only this block is new.
  --
  -- The triager is resolved ONCE, by email, from a policy row, so the queue can be
  -- handed to somebody else from config without a migration. There is deliberately
  -- NO super-admin fallback here: stall 1 may fall back for notifications.created_by,
  -- which is a NOT NULL bookkeeping column, but WHO GETS TOLD is a different thing.
  -- Mailing an unrelated admin because a config row was blank is how a nudge becomes
  -- noise and gets muted. Blank or unresolvable => this stall is simply not chased,
  -- and stall 1 above is unaffected.
  IF COALESCE(v_owner_email, '') <> '' THEN
    SELECT pr.id INTO v_triager
      FROM public.profiles pr
     WHERE lower(pr.email) = lower(trim(v_owner_email))
       AND COALESCE(pr.is_active, true)
     LIMIT 1;
  END IF;

  IF v_triager IS NOT NULL THEN
    FOR r IN
      SELECT i.id AS iid, i.area_id AS area, i.title AS title,
             i.updated_at AS since, ar.label AS label
        FROM public.improvement_ideas i
        JOIN public.improvement_areas ar ON ar.id = i.area_id
       WHERE i.status = 'under_review'
         -- Counted from when it ENTERED Under Review, not when it was filed: an
         -- idea answered quickly after a long wait in Logged is not late here.
         AND i.updated_at <= now() - make_interval(days => GREATEST(1, v_review_days))
         AND NOT EXISTS (
               SELECT 1 FROM public.improvement_untriaged_notices n
                WHERE n.idea_id = i.id AND n.stage = 'under_review'
             )
       ORDER BY i.updated_at ASC
       LIMIT v_cap
    LOOP
      v_waited := GREATEST(0, EXTRACT(DAY FROM (now() - r.since))::integer);
      v_key    := 'improvement.review_stale|' || r.iid::text;
      v_notif  := NULL;

      -- Body chain audited against the live schema: r.title (NOT NULL),
      -- ar.label (NOT NULL), r.since = updated_at (NOT NULL DEFAULT now()),
      -- v_waited (computed). A NULL anywhere in a || chain makes the whole
      -- string NULL and raises 23502, which with no EXCEPTION block would end
      -- the sweep for every remaining idea.
      INSERT INTO public.notifications
        (title, body, category, kind, targeting, url, priority,
         created_by, expires_at, idempotency_key, metadata)
      VALUES (
        'Waiting on your decision — ' || COALESCE(r.label, 'improvement'),
        'The idea "' || r.title || '" (' || COALESCE(r.label, 'improvement')
          || ') has been in Under Review for ' || v_waited::text
          || CASE WHEN v_waited = 1 THEN ' day' ELSE ' days' END
          || ' and is waiting on you. Approving it, or rejecting it with a reason, '
          || 'both count as an answer to the person who wrote it. Leaving it in '
          || 'Under Review does not.',
        'improvement:triage',
        'work_item',
        jsonb_build_object('type', 'user', 'user_ids', to_jsonb(ARRAY[v_triager])),
        '/improvement-board',
        'normal',
        v_triager,
        now() + make_interval(days => GREATEST(1, v_expiry_days)),
        v_key,
        jsonb_build_object('source', 'improvement.review_stale', 'idea_id', r.iid,
                           'area_id', r.area, 'waited_days', v_waited,
                           'stage', 'under_review')
      )
      -- The predicate is REQUIRED: idx_notifications_idempotency is a PARTIAL
      -- unique index (WHERE idempotency_key IS NOT NULL). Without it Postgres
      -- raises 42P10 at run time. Same form as stall 1.
      ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
      RETURNING id INTO v_notif;

      -- ON CONFLICT DO NOTHING returns no row, so RETURNING leaves v_notif NULL
      -- when the notice already existed. Re-read it, exactly as stall 1 does.
      IF v_notif IS NULL THEN
        SELECT n.id INTO v_notif
          FROM public.notifications n
         WHERE n.idempotency_key = v_key;
      END IF;

      -- The bell reads user_notifications. Without this the notice is invisible
      -- to the badge, the inbox and the counts — the exact defect PR #3315 fixed
      -- for stall 1.
      IF v_notif IS NOT NULL THEN
        INSERT INTO public.user_notifications (notification_id, user_id)
        VALUES (v_notif, v_triager)
        ON CONFLICT (notification_id, user_id) DO NOTHING;
      END IF;

      INSERT INTO public.improvement_untriaged_notices
        (idea_id, area_id, waited_days, notification_id, recipient_count, stage)
      VALUES (r.iid, r.area, v_waited, v_notif, 1, 'under_review')
      ON CONFLICT (idea_id, stage) DO NOTHING;

      -- Timeline entry in the board's existing vocabulary, actor_id NULL: no
      -- human did this, and attributing a cron sweep to a person would put words
      -- in the mouth of somebody who did nothing.
      INSERT INTO public.improvement_idea_activity (idea_id, actor_id, action, note)
      VALUES (r.iid, NULL, 'escalated',
              'Waiting on a decision for ' || v_waited::text
              || ' days — the triage owner was notified.');

      idea_id         := r.iid;
      area_id         := r.area;
      area_label      := r.label;
      waited_days     := v_waited;
      recipients      := 1;
      notification_id := v_notif;
      RETURN NEXT;
    END LOOP;
  END IF;
END;$function$;

-- Grants restated to exactly what the function already held. CREATE OR REPLACE
-- preserves the ACL, so this is belt-and-braces — but Supabase's default
-- (ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon) makes an explicit
-- REVOKE the only way to be certain anon never holds EXECUTE. Cron-only function:
-- no human role executes it.
REVOKE EXECUTE ON FUNCTION public.fn_improvement_untriaged_notify(integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_untriaged_notify(integer) TO service_role;
