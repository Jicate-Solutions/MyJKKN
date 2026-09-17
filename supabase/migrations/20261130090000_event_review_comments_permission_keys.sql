-- ─── Event review comments — gate on permission keys, not role names ────────
-- 2026-09-11
--
-- 20261128090000 admitted the reviewing authority by ROLE NAME:
-- get_current_user_role() / custom_roles.role_key IN ('admin', 'administrator',
-- 'event_coordinator'). That put the audience outside Role Management — a role
-- could not be given the Review Comments section, or have it taken away,
-- without a migration.
--
-- Now two keys, toggled per role in Role Management:
--
--     events.review_comments.view      see the thread, post and reply in it,
--                                      over institutions the caller can reach
--     events.review_comments.resolve   close a thread someone ELSE raised
--
-- Built in, needing no key (unchanged): super admin, the event's in-charge
-- (events.config->'incharges') and its creator (events.created_by). The person
-- who raised a thread can still always close it — that is per-row, in
-- trg_event_review_comments_guard, and untouched here.
--
-- ── Seeding: nobody who reads the thread today loses it ─────────────────────
-- Live role holders on 2026-09-11: administrator 2, event_coordinator 3. The
-- `admin` role_key does not exist in custom_roles; the one profile carrying the
-- legacy profiles.role = 'admin' text is an inactive test account. Every holder
-- of the super_admin role has profiles.is_super_admin = true, so they pass
-- is_super_admin() and need no key.
--
--     view     → administrator, event_coordinator   (today's read arm)
--     resolve  → administrator                      (today's close arm; a
--                coordinator answers a remark, they do not accept their own
--                answer)
--
-- Still NOT `events.view`: students hold it to browse the public event feed.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Every statement is idempotent.

-- ── 1. Grant the keys to the roles that hold the access today ───────────────
UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb)
                     || jsonb_build_object('events.review_comments.view', true),
       updated_at  = now()
 WHERE role_key IN ('administrator', 'event_coordinator')
   AND (permissions->>'events.review_comments.view')::boolean IS NOT TRUE;

UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb)
                     || jsonb_build_object('events.review_comments.resolve', true),
       updated_at  = now()
 WHERE role_key = 'administrator'
   AND (permissions->>'events.review_comments.resolve')::boolean IS NOT TRUE;

-- ── 2. Who may READ (and therefore write into) a thread ─────────────────────
-- Same name and signature, so the four policies on event_review_comments and
-- the card's RPC pick the new rule up with no policy change.
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
    -- Granted the section in Role Management, over an institution they can
    -- actually reach.
    OR (
      public.user_has_permission('events.review_comments.view')
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
  'May the caller see this event''s internal review thread, and post in it? Super admin, the event in-charge, the event creator, or a holder of events.review_comments.view with access to the owning institution. Deliberately does NOT admit events.view, which students hold.';

-- ── 3. Who may CLOSE a thread someone else raised ───────────────────────────
CREATE OR REPLACE FUNCTION public.fn_is_event_review_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR public.user_has_permission('events.review_comments.resolve');
$$;

REVOKE EXECUTE ON FUNCTION public.fn_is_event_review_admin() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_is_event_review_admin() TO authenticated;

COMMENT ON FUNCTION public.fn_is_event_review_admin() IS
  'True when the CALLER is a super admin or holds events.review_comments.resolve. Decides who — besides the person who raised it — may close an event review thread.';

COMMENT ON TABLE public.event_review_comments IS
  'Internal review remarks on an event from the reviewing authority, and the coordinator''s replies. Two levels only (root + replies). Readable by super admins, the event in-charge, the event creator, and holders of events.review_comments.view with institution access — never by students or participants.';

NOTIFY pgrst, 'reload schema';
