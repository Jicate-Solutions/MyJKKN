-- ─── Event review comments — the authority's note, the coordinator's reply ───
-- 2026-09-10
--
-- THE REQUIREMENT. A reviewing authority opening an event needs somewhere to
-- say "this is not finished", "you still need a hospitality committee", "there
-- are no participants registered" — and the event's coordinator needs to reply
-- underneath once they have dealt with it. The exchange is internal: it must be
-- invisible to participants and learners.
--
-- WHY A NEW TABLE RATHER THAN event_tasks. A task is work the organiser plans
-- for themselves and ticks off; a review comment is a REMARK FROM SOMEONE ELSE
-- that expects an answer. They differ in author, in audience and in lifecycle
-- (a task is done, a comment is answered then closed by whoever raised it).
-- Overloading event_tasks with an author, a reply chain and a second write
-- authority would put two unrelated rules behind one checkbox — the exact shape
-- 20261112000000 split apart when it separated event-level tasks from committee
-- prep-tasks.
--
-- ── WHO SEES IT, AND THE ONE KEY THIS MUST NOT USE ──────────────────────────
-- Readers are the authorities plus the people who answer to them:
--
--     super admin
--     admin / administrator / event_coordinator  (legacy profiles.role OR an
--                                                 active custom role of the same
--                                                 key), scoped to institutions
--                                                 they can reach
--     the event's in-charge   (events.config->'incharges')
--     the event's creator     (events.created_by)
--
-- NOT "any non-student with institution access", which is what
-- fn_can_read_event_tasks allows — that is a work list, this is a review
-- channel, and the request was explicit that only the authorities and the
-- coordinator see it.
--
-- And emphatically NOT the `events.view` permission. That key is held by
-- students so they can browse the public event feed; ORing it into this gate
-- would publish every "there are no participants" remark to the entire learner
-- body. The same trap was closed on the feedback module in
-- 20260909210000_event_feedback_manage_drops_events_view.sql.
--
-- ── WHO WRITES ──────────────────────────────────────────────────────────────
-- Anyone who can read the thread can post in it. Splitting "may comment" from
-- "may reply" would need the table to know which side of the conversation a
-- caller is on, and it already does — by who authored the root. A coordinator
-- raising their own question here is a feature, not a leak.
--
-- Closing a thread is narrower: the person who RAISED it, or an admin. The
-- coordinator's reply is the claim that the work is done; the authority who
-- asked for it is the one who accepts that claim. Column-level rules like that
-- are not expressible in RLS, so a BEFORE UPDATE trigger enforces them —
-- the same device fn_guard_event_privileged_fields uses on `events`.
--
-- No BEGIN/COMMIT: this file reaches prod through the exec_sql RPC, a PL/pgSQL
-- function, inside which explicit transaction control is illegal. The apply
-- script sends it in the numbered sections below so a failure names its
-- section, and every statement is idempotent, so a partial apply is repaired by
-- re-running.

-- ── 1. The table ────────────────────────────────────────────────────────────
-- A flat two-level shape: a root comment (parent_id IS NULL) and its replies.
-- Threads-of-threads were not asked for and would turn the card into a forum;
-- section 4's trigger keeps the depth at one.
CREATE TABLE IF NOT EXISTS public.event_review_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NOT NULL
                 REFERENCES public.events(id) ON DELETE CASCADE,
  -- NULL = a root comment that opens a thread. Set = a reply on that thread.
  parent_id    uuid
                 REFERENCES public.event_review_comments(id) ON DELETE CASCADE,
  -- Defaulted the way events.created_by is, and pinned to auth.uid() by the
  -- INSERT policy, so a comment cannot be planted under someone else's name.
  --
  -- ON DELETE CASCADE, not RESTRICT. A RESTRICT here would become one more FK
  -- standing between an administrator and a profile they are trying to remove —
  -- the trap the users screen already hits on notifications.created_by, where
  -- the auth row dies first and the delete then fails, orphaning the profile.
  -- A departed reviewer's remarks leaving with them is the lesser loss.
  author_id    uuid NOT NULL DEFAULT auth.uid()
                 CONSTRAINT event_review_comments_author_id_fkey
                 REFERENCES public.profiles(id) ON DELETE CASCADE,
  body         text NOT NULL
                 CONSTRAINT event_review_comments_body_length
                 CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  -- Resolution lives on the ROOT only; a reply is never "resolved" by itself.
  is_resolved  boolean NOT NULL DEFAULT false,
  resolved_by  uuid
                 CONSTRAINT event_review_comments_resolved_by_fkey
                 REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_review_comments_reply_not_resolvable CHECK (
    parent_id IS NULL
    OR (is_resolved = false AND resolved_by IS NULL AND resolved_at IS NULL)
  )
);

COMMENT ON TABLE public.event_review_comments IS
  'Internal review remarks on an event from the reviewing authority, and the coordinator''s replies. Two levels only (root + replies). Readable by super admins, admin/administrator/event_coordinator roles with institution access, the event in-charge and the event creator — never by students or participants.';

COMMENT ON COLUMN public.event_review_comments.parent_id IS
  'NULL for the comment that opens a thread; otherwise the root comment being replied to. Enforced one level deep by trg_event_review_comments_flat.';

COMMENT ON COLUMN public.event_review_comments.is_resolved IS
  'Root comments only. Set by the person who raised the thread, or an admin — not by the coordinator who answered it. resolved_by/resolved_at are stamped server-side in trg_event_review_comments_guard.';

-- The card's query is "every comment on this event, oldest first".
CREATE INDEX IF NOT EXISTS idx_event_review_comments_event
  ON public.event_review_comments (event_id, created_at);

CREATE INDEX IF NOT EXISTS idx_event_review_comments_parent
  ON public.event_review_comments (parent_id);

-- ── 2. Who may READ (and therefore write into) a thread ─────────────────────
-- Written as one function so the four policies below cannot drift from each
-- other, and so the UI can ask the SAME question over RPC and show the card
-- exactly when the SELECT would return rows.
--
-- The admin arm checks BOTH the legacy profiles.role text column and an active
-- custom role assignment, because Role Management is where roles are actually
-- granted here and profiles.role has not been the whole answer since the
-- custom-role migration — the hole 20261124093000 had to patch on the events
-- INSERT policy. Unlike that one it does not demand institution_scope = 'all',
-- because it is paired with an institution-access test instead.
CREATE OR REPLACE FUNCTION public.fn_can_read_event_review_comments(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Owns the platform.
    public.is_super_admin()
    -- Runs this event: appointed in-charge, or the person who created it.
    -- Neither is institution-tested — an in-charge may be borrowed from
    -- another college, and locking a creator out of their own event's review
    -- notes would be absurd.
    OR public.fn_is_event_incharge(p_event_id)
    OR EXISTS (
         SELECT 1 FROM public.events e
         WHERE e.id = p_event_id
           AND e.created_by = (SELECT auth.uid())
       )
    -- An authority, over an institution they can actually reach.
    OR (
      (
        public.get_current_user_role() = ANY (
          ARRAY['super_admin', 'admin', 'administrator', 'event_coordinator']
        )
        OR EXISTS (
             SELECT 1
               FROM public.user_roles ur
               JOIN public.custom_roles cr ON cr.id = ur.role_id
              WHERE ur.user_id = (SELECT auth.uid())
                AND cr.is_active
                AND cr.role_key = ANY (
                      ARRAY['super_admin', 'admin', 'administrator', 'event_coordinator']
                    )
           )
      )
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = p_event_id
          AND (
            public.role_has_institution_access(e.institution_id)
            OR e.institution_id IN (
                 SELECT p.institution_id
                   FROM public.profiles p
                  WHERE p.id = (SELECT auth.uid())
                    AND p.institution_id IS NOT NULL
               )
          )
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_can_read_event_review_comments(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_can_read_event_review_comments(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_can_read_event_review_comments(uuid) IS
  'May the caller see this event''s internal review thread, and post in it? Super admin, the event in-charge, the event creator, or an admin/administrator/event_coordinator (legacy role column or active custom role) with access to the owning institution. Deliberately does NOT admit the events.view permission, which students hold.';

-- ── 3. Who may CLOSE a thread ───────────────────────────────────────────────
-- A self-oracle about the caller, used both by the trigger in section 4 and by
-- the card, so the "Mark resolved" button appears exactly when the write would
-- be allowed. Thread authorship is checked separately, per row — this answers
-- only the admin half.
CREATE OR REPLACE FUNCTION public.fn_is_event_review_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR public.get_current_user_role() = ANY (
         ARRAY['super_admin', 'admin', 'administrator']
       )
    OR EXISTS (
         SELECT 1
           FROM public.user_roles ur
           JOIN public.custom_roles cr ON cr.id = ur.role_id
          WHERE ur.user_id = (SELECT auth.uid())
            AND cr.is_active
            AND cr.role_key = ANY (ARRAY['super_admin', 'admin', 'administrator'])
       );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_is_event_review_admin() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_is_event_review_admin() TO authenticated;

COMMENT ON FUNCTION public.fn_is_event_review_admin() IS
  'True when the CALLER holds an admin-class role (super_admin/admin/administrator, legacy column or active custom role). Used to decide who — besides the person who raised it — may close an event review thread. event_coordinator is absent on purpose: a coordinator answers a remark, they do not accept their own answer.';

-- ── 4. Shape and column guards ──────────────────────────────────────────────
-- Two triggers, because RLS can gate a ROW but not a COLUMN, and three of these
-- rules are per-column: who may edit the text, who may flip the resolution, and
-- who may move a comment between events (nobody).
CREATE OR REPLACE FUNCTION public.fn_event_review_comment_flat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    -- A reply must hang off a ROOT comment on the SAME event. Without the
    -- event test a reply could be filed onto a thread the author cannot read,
    -- smuggling text past the SELECT policy of the event it lands under.
    IF NOT EXISTS (
      SELECT 1 FROM public.event_review_comments c
      WHERE c.id = NEW.parent_id
        AND c.parent_id IS NULL
        AND c.event_id = NEW.event_id
    ) THEN
      RAISE EXCEPTION
        'A reply must point at a top-level review comment on the same event'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_event_review_comment_flat() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_event_review_comments_flat ON public.event_review_comments;
CREATE TRIGGER trg_event_review_comments_flat
  BEFORE INSERT ON public.event_review_comments
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_review_comment_flat();

CREATE OR REPLACE FUNCTION public.fn_guard_event_review_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();

  -- Trusted backend paths (service_role / migrations / cron) have no auth.uid().
  IF v_uid IS NULL THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- Identity columns are frozen for everybody. Re-parenting a comment would
  -- move it to another event's thread and past that event's read gate.
  IF NEW.event_id  IS DISTINCT FROM OLD.event_id
     OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
     OR NEW.author_id IS DISTINCT FROM OLD.author_id
  THEN
    RAISE EXCEPTION
      'The event, thread or author of a review comment cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  -- Editing the words is the author's alone. An admin passes the UPDATE policy
  -- so they can close a thread; that must not become a licence to rewrite what
  -- somebody else said.
  IF NEW.body IS DISTINCT FROM OLD.body AND OLD.author_id <> v_uid THEN
    RAISE EXCEPTION
      'Only the person who wrote a review comment may edit it'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.is_resolved IS DISTINCT FROM OLD.is_resolved THEN
    IF NOT (OLD.author_id = v_uid OR public.fn_is_event_review_admin()) THEN
      RAISE EXCEPTION
        'Only the person who raised this comment, or an admin, may close it'
        USING ERRCODE = '42501';
    END IF;
    -- Stamped here, never taken from the client: a caller who could name their
    -- own resolver could credit the closure to anyone.
    NEW.resolved_by := CASE WHEN NEW.is_resolved THEN v_uid ELSE NULL END;
    NEW.resolved_at := CASE WHEN NEW.is_resolved THEN now()  ELSE NULL END;
  ELSE
    -- Resolution untouched — hold the audit columns steady rather than letting
    -- an unrelated edit blank them.
    NEW.resolved_by := OLD.resolved_by;
    NEW.resolved_at := OLD.resolved_at;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_event_review_comment() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_event_review_comments_guard ON public.event_review_comments;
CREATE TRIGGER trg_event_review_comments_guard
  BEFORE UPDATE ON public.event_review_comments
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_event_review_comment();

-- ── 5. Row level security ───────────────────────────────────────────────────
ALTER TABLE public.event_review_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_review_comments_read ON public.event_review_comments;
CREATE POLICY event_review_comments_read ON public.event_review_comments
  FOR SELECT TO authenticated
  USING (public.fn_can_read_event_review_comments(event_id));

-- Post or reply: you must be in the conversation, and you must sign your own
-- name to it.
DROP POLICY IF EXISTS event_review_comments_insert ON public.event_review_comments;
CREATE POLICY event_review_comments_insert ON public.event_review_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.fn_can_read_event_review_comments(event_id)
    AND author_id = (SELECT auth.uid())
  );

-- The row gate is deliberately loose (author OR admin) because the COLUMN rules
-- are the real ones and they live in trg_event_review_comments_guard. Anyone
-- reaching an UPDATE they are not entitled to gets 42501 from the trigger with
-- a sentence explaining which rule they hit, rather than a silent 0-row no-op.
DROP POLICY IF EXISTS event_review_comments_update ON public.event_review_comments;
CREATE POLICY event_review_comments_update ON public.event_review_comments
  FOR UPDATE TO authenticated
  USING (
    public.fn_can_read_event_review_comments(event_id)
    AND (
      author_id = (SELECT auth.uid())
      OR public.fn_is_event_review_admin()
    )
  )
  WITH CHECK (public.fn_can_read_event_review_comments(event_id));

-- Deleting somebody's remark is not a coordinator's remedy for it — replying
-- is. Only the author, or a super admin cleaning up.
DROP POLICY IF EXISTS event_review_comments_delete ON public.event_review_comments;
CREATE POLICY event_review_comments_delete ON public.event_review_comments
  FOR DELETE TO authenticated
  USING (
    public.fn_can_read_event_review_comments(event_id)
    AND (
      author_id = (SELECT auth.uid())
      OR public.is_super_admin()
    )
  );

-- ── 6. Grants + schema reload ───────────────────────────────────────────────
-- anon is never granted: this table has no public surface at all, and the
-- policies above are TO authenticated, so an anon reader would be refused
-- anyway. Revoking makes that the table's own property rather than a property
-- of the policies that happen to be on it today.
REVOKE ALL ON public.event_review_comments FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_review_comments TO authenticated;

NOTIFY pgrst, 'reload schema';
