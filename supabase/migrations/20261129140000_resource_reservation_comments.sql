-- ─── Reservation comments — the approver's note, the booker's reply ─────────
-- 2026-09-11
--
-- THE REQUIREMENT. An approver looking at a pending room booking needs to tell
-- the person who raised it WHY it is still pending — "the hall needs the
-- principal's sign-off first", "you have not attached the event order" — and
-- that person has to be able to read it and answer. Today the only channel is
-- resource_approvals.comments, which is a single field written once at the
-- moment of approval or rejection and rendered in the Activity Timeline. It
-- cannot carry a conversation and it cannot be used while the request is still
-- pending, which is exactly when the booker needs to hear something.
--
-- ── The audience is the OPPOSITE of the event review thread ────────────────
-- event_review_comments (20261128090000) is an internal channel deliberately
-- hidden from the people being talked about. This one exists to reach them.
-- Readers here are:
--
--     the BOOKER        resource_reservations.user_id
--     any APPROVER      is_reservation_approver(), the SECURITY DEFINER helper
--                       20260602000002 already added to break the
--                       resource_reservations ↔ resource_approvals RLS
--                       recursion — reused rather than re-derived, so the
--                       thread and the approvals queue can never disagree
--                       about who an approver is
--     admin-class staff super_admin / admin / accounts with access to the
--                       resource's institution, matching
--                       resource_reservations_select_staff_scoped
--
-- NOT "anyone in the institution", which is what reservations_select_institution
-- grants on the reservation row itself. That policy lets every profile in a
-- college read every booking in it, students included. A booking being visible
-- is not the same as its correspondence being visible.
--
-- ── Who closes a thread ─────────────────────────────────────────────────────
-- Whoever raised it, or an admin. The booker replying "done, attached" is the
-- CLAIM that the blocker is cleared; the approver who raised it is the one who
-- accepts that claim. Same rule as the event thread, and for the same reason.
-- Column-level rules like that are not expressible in RLS, so a BEFORE UPDATE
-- trigger enforces them.
--
-- No BEGIN/COMMIT: this file reaches prod through the exec_sql RPC, a PL/pgSQL
-- function, inside which explicit transaction control is illegal. The apply
-- script sends it in the numbered sections below so a failure names its
-- section, and every statement is idempotent, so a partial apply is repaired by
-- re-running.

-- ── 1. The table ────────────────────────────────────────────────────────────
-- Deliberately the same column shape as event_review_comments so the shared
-- client helpers (lib/services/shared/comment-threads.ts) and the shared panel
-- can read both without a translation layer. The FK constraints are NAMED
-- because PostgREST disambiguates two FKs to `profiles` by constraint name.
CREATE TABLE IF NOT EXISTS public.resource_reservation_comments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL
                   REFERENCES public.resource_reservations(id) ON DELETE CASCADE,
  -- NULL = a root comment that opens a thread. Set = a reply on that thread.
  parent_id      uuid
                   REFERENCES public.resource_reservation_comments(id) ON DELETE CASCADE,
  -- Pinned to auth.uid() by the INSERT policy, so a comment cannot be planted
  -- under somebody else's name. CASCADE rather than RESTRICT for the same
  -- reason as the event thread: a RESTRICT here becomes one more foreign key
  -- standing between an administrator and a profile they are removing.
  author_id      uuid NOT NULL DEFAULT auth.uid()
                   CONSTRAINT resource_reservation_comments_author_id_fkey
                   REFERENCES public.profiles(id) ON DELETE CASCADE,
  body           text NOT NULL
                   CONSTRAINT resource_reservation_comments_body_length
                   CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  -- Resolution lives on the ROOT only; a reply is never "resolved" by itself.
  is_resolved    boolean NOT NULL DEFAULT false,
  resolved_by    uuid
                   CONSTRAINT resource_reservation_comments_resolved_by_fkey
                   REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_reservation_comments_reply_not_resolvable CHECK (
    parent_id IS NULL
    OR (is_resolved = false AND resolved_by IS NULL AND resolved_at IS NULL)
  )
);

COMMENT ON TABLE public.resource_reservation_comments IS
  'Conversation on a resource booking between its approvers and the person who raised it. Readable by the booker, any approver on the request, and admin-class staff with access to the resource''s institution — NOT by everyone in the institution, which is what the reservation row itself allows.';

COMMENT ON COLUMN public.resource_reservation_comments.parent_id IS
  'NULL for the comment that opens a thread; otherwise the root comment being replied to. Enforced one level deep by trg_reservation_comments_flat.';

COMMENT ON COLUMN public.resource_reservation_comments.is_resolved IS
  'Root comments only. Set by the person who raised the thread, or an admin — not by the person who answered it. resolved_by/resolved_at are stamped server-side in trg_reservation_comments_guard.';

-- The card's query is "every comment on this reservation, oldest first".
CREATE INDEX IF NOT EXISTS idx_reservation_comments_reservation
  ON public.resource_reservation_comments (reservation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_reservation_comments_parent
  ON public.resource_reservation_comments (parent_id);

-- ── 2. Who may READ (and therefore write into) a thread ─────────────────────
-- SECURITY DEFINER, like is_reservation_approver() and for the same reason:
-- reading resource_reservations from inside a policy on a table that
-- resource_reservations' own policies do not reference is safe today, but the
-- definer context also means the booker check cannot be defeated by a future
-- narrowing of the reservation SELECT policies. The function answers only about
-- the caller.
CREATE OR REPLACE FUNCTION public.fn_can_read_reservation_comments(p_reservation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- The person who raised the booking. They are the audience.
    EXISTS (
      SELECT 1 FROM public.resource_reservations rr
      WHERE rr.id = p_reservation_id
        AND rr.user_id = (SELECT auth.uid())
    )
    -- Anyone on the approval chain for this request.
    OR public.is_reservation_approver(p_reservation_id)
    -- Admin-class staff, scoped to the resource's institution. Mirrors
    -- resource_reservations_select_staff_scoped so the thread is visible to
    -- exactly the staff who can already open the request from the queue.
    OR (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role = ANY (ARRAY['super_admin', 'admin', 'accounts'])
      )
      AND EXISTS (
        SELECT 1
          FROM public.resource_reservations rr
          JOIN public.resources r ON r.id = rr.resource_id
         WHERE rr.id = p_reservation_id
           AND public.role_has_institution_access(r.institution_id)
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_can_read_reservation_comments(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_can_read_reservation_comments(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_can_read_reservation_comments(uuid) IS
  'May the caller see this reservation''s comment thread, and post in it? The booker, any approver on the request (via is_reservation_approver), or super_admin/admin/accounts with access to the resource''s institution. Deliberately narrower than reservations_select_institution, which lets every profile in a college read every booking in it.';

-- ── 3. Who may CLOSE a thread ───────────────────────────────────────────────
-- A self-oracle about the caller, used by the trigger in section 4 and by the
-- card, so the "Mark resolved" button appears exactly when the write would be
-- allowed. Thread authorship is checked separately, per row — this answers only
-- the admin half.
CREATE OR REPLACE FUNCTION public.fn_is_reservation_comment_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR EXISTS (
         SELECT 1 FROM public.profiles p
         WHERE p.id = (SELECT auth.uid())
           AND p.role = ANY (ARRAY['super_admin', 'admin'])
       );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_is_reservation_comment_admin() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_is_reservation_comment_admin() TO authenticated;

COMMENT ON FUNCTION public.fn_is_reservation_comment_admin() IS
  'True when the CALLER is a super admin or admin. Used to decide who — besides the person who raised it — may close a reservation comment thread. ''accounts'' is absent on purpose: that role reads the queue, it does not adjudicate a blocker it did not raise.';

-- ── 4. Shape and column guards ──────────────────────────────────────────────
-- Two triggers, because RLS gates a ROW and three of these rules are per-COLUMN:
-- who may edit the text, who may flip the resolution, and who may move a
-- comment onto another reservation (nobody).
CREATE OR REPLACE FUNCTION public.fn_reservation_comment_flat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    -- A reply must hang off a ROOT comment on the SAME reservation. Without the
    -- reservation test a reply could be filed onto a thread the author cannot
    -- read, smuggling text past the read gate of the booking it lands under.
    IF NOT EXISTS (
      SELECT 1 FROM public.resource_reservation_comments c
      WHERE c.id = NEW.parent_id
        AND c.parent_id IS NULL
        AND c.reservation_id = NEW.reservation_id
    ) THEN
      RAISE EXCEPTION
        'A reply must point at a top-level comment on the same reservation'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reservation_comment_flat() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_reservation_comments_flat ON public.resource_reservation_comments;
CREATE TRIGGER trg_reservation_comments_flat
  BEFORE INSERT ON public.resource_reservation_comments
  FOR EACH ROW EXECUTE FUNCTION public.fn_reservation_comment_flat();

CREATE OR REPLACE FUNCTION public.fn_guard_reservation_comment()
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
  -- move it onto another booking and past that booking's read gate.
  IF NEW.reservation_id IS DISTINCT FROM OLD.reservation_id
     OR NEW.parent_id   IS DISTINCT FROM OLD.parent_id
     OR NEW.author_id   IS DISTINCT FROM OLD.author_id
  THEN
    RAISE EXCEPTION
      'The reservation, thread or author of a comment cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  -- Editing the words is the author's alone. An admin passes the UPDATE policy
  -- so they can close a thread; that must not become a licence to rewrite what
  -- somebody else said.
  IF NEW.body IS DISTINCT FROM OLD.body AND OLD.author_id <> v_uid THEN
    RAISE EXCEPTION
      'Only the person who wrote a comment may edit it'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.is_resolved IS DISTINCT FROM OLD.is_resolved THEN
    IF NOT (OLD.author_id = v_uid OR public.fn_is_reservation_comment_admin()) THEN
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

REVOKE EXECUTE ON FUNCTION public.fn_guard_reservation_comment() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_reservation_comments_guard ON public.resource_reservation_comments;
CREATE TRIGGER trg_reservation_comments_guard
  BEFORE UPDATE ON public.resource_reservation_comments
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_reservation_comment();

-- ── 5. Row level security ───────────────────────────────────────────────────
ALTER TABLE public.resource_reservation_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reservation_comments_read ON public.resource_reservation_comments;
CREATE POLICY reservation_comments_read ON public.resource_reservation_comments
  FOR SELECT TO authenticated
  USING (public.fn_can_read_reservation_comments(reservation_id));

-- Post or reply: you must be in the conversation, and you must sign your own
-- name to it.
DROP POLICY IF EXISTS reservation_comments_insert ON public.resource_reservation_comments;
CREATE POLICY reservation_comments_insert ON public.resource_reservation_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.fn_can_read_reservation_comments(reservation_id)
    AND author_id = (SELECT auth.uid())
  );

-- The row gate is deliberately loose (author OR admin) because the COLUMN rules
-- are the real ones and they live in trg_reservation_comments_guard. Anyone
-- reaching an UPDATE they are not entitled to gets 42501 from the trigger with
-- a sentence explaining which rule they hit, rather than a silent 0-row no-op.
DROP POLICY IF EXISTS reservation_comments_update ON public.resource_reservation_comments;
CREATE POLICY reservation_comments_update ON public.resource_reservation_comments
  FOR UPDATE TO authenticated
  USING (
    public.fn_can_read_reservation_comments(reservation_id)
    AND (
      author_id = (SELECT auth.uid())
      OR public.fn_is_reservation_comment_admin()
    )
  )
  WITH CHECK (public.fn_can_read_reservation_comments(reservation_id));

-- Deleting an approver's note is not a booker's remedy for it — replying is.
-- Only the author, or a super admin cleaning up.
DROP POLICY IF EXISTS reservation_comments_delete ON public.resource_reservation_comments;
CREATE POLICY reservation_comments_delete ON public.resource_reservation_comments
  FOR DELETE TO authenticated
  USING (
    public.fn_can_read_reservation_comments(reservation_id)
    AND (
      author_id = (SELECT auth.uid())
      OR public.is_super_admin()
    )
  );

-- ── 6. Grants + schema reload ───────────────────────────────────────────────
-- anon is never granted: this table has no public surface, and the policies
-- above are TO authenticated, so an anon reader would be refused anyway.
-- Revoking makes that the table's own property rather than a property of the
-- policies that happen to sit on it today.
REVOKE ALL ON public.resource_reservation_comments FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_reservation_comments TO authenticated;

NOTIFY pgrst, 'reload schema';
