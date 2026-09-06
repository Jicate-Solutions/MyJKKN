-- 20260810110000_meeting_host_handle_history.sql
--
-- Remembers every booking address a host has ever had, so an admin can rename a
-- live page without silently breaking links other people already saved.
--
-- WHY
--   app/(routes)/meetings/availability/actions.ts refuses to rename a published
--   page and tells the host: "Your page is live, so its address is locked.
--   Contact an administrator to change it."
--
--   On 2026-08-04 a sweep of app/api/admin/* and app/(routes)/admin/* found NO
--   code anywhere that updates meeting_host_pages. The message points at a
--   person who has no button. Once a page goes public its address is frozen
--   permanently — not by policy, by omission.
--
--   The lock itself is right. The comment in savePublicPage says why: "once the
--   page is public the link may already be shared". This table is what makes the
--   admin path safe to build, because it lets a rename forward instead of break.
--
-- WHAT IT IS
--   One row per RETIRED handle. The live handle stays in meeting_host_pages and
--   is never duplicated here. /meet/<old> misses meeting_host_pages, finds a row
--   here, and 308-redirects to the current address.
--
-- WHY handle IS UNIQUE ACROSS BOTH TABLES
--   A retired handle must not be claimable by somebody else while it still
--   forwards, or a stale link in an email signature would quietly deliver a
--   guest to a stranger's calendar. The unique index here plus the existing
--   meeting_host_pages_handle_key give that, and fn_meeting_handle_taken() below
--   is the single check both the host-facing and admin-facing paths call, so
--   they cannot drift apart.
--
-- IT NEVER EXPIRES A HANDLE. Rows are kept until somebody deletes them
-- deliberately. Reclaiming an address is a decision, not a timeout.

BEGIN;

CREATE TABLE IF NOT EXISTS public.meeting_host_page_handles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  handle           text NOT NULL,
  -- Who retired it and why, so the scoreboard can explain a redirect a year
  -- later without anyone reconstructing it from memory.
  retired_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason           text,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT meeting_host_page_handles_handle_check CHECK (
    handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND char_length(handle) >= 3
    AND char_length(handle) <= 50
  ),
  CONSTRAINT meeting_host_page_handles_reason_check CHECK (
    reason IS NULL OR char_length(reason) <= 300
  )
);

-- One home per retired address. Two hosts cannot both forward from the same old
-- handle, and the same handle cannot be retired twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mhph_handle
  ON public.meeting_host_page_handles (handle);

CREATE INDEX IF NOT EXISTS ix_mhph_host
  ON public.meeting_host_page_handles (host_profile_id);

COMMENT ON TABLE public.meeting_host_page_handles IS
  'Retired /meet handles. A public page''s address is admin-only to change; this keeps every old link working by forwarding it to the host''s current address.';

-- ---------------------------------------------------------------------------
-- Is this address spoken for — live OR forwarding?
--
-- Both the host-facing claim path and the admin rename path must ask the same
-- question, or one of them will hand out an address the other is still
-- forwarding. STABLE, and it only reads; the SECURITY DEFINER is so a host
-- claiming a handle can test availability without being able to read anyone
-- else's rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_meeting_handle_taken(p_handle text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (SELECT 1 FROM public.meeting_host_pages       WHERE handle = lower(p_handle))
      OR EXISTS (SELECT 1 FROM public.meeting_host_page_handles WHERE handle = lower(p_handle));
$$;

-- anon must never probe which handles exist — that would enumerate unpublished
-- and draft pages. Signed-in users only.
REVOKE ALL ON FUNCTION public.fn_meeting_handle_taken(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_meeting_handle_taken(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
--
-- Same shape as meeting_host_pages' own mhp_host_all policy: admins everywhere,
-- hosts on their own rows. The PUBLIC redirect does NOT rely on this — the
-- /meet route resolves through a service-role client, exactly as the existing
-- page does, so anon needs no grant here and gets none.
-- ---------------------------------------------------------------------------
ALTER TABLE public.meeting_host_page_handles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.meeting_host_page_handles FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meeting_host_page_handles TO authenticated;

DROP POLICY IF EXISTS mhph_admin_or_host ON public.meeting_host_page_handles;
CREATE POLICY mhph_admin_or_host
  ON public.meeting_host_page_handles
  FOR ALL
  TO authenticated
  USING (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR host_profile_id = (SELECT auth.uid())
  )
  WITH CHECK (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR host_profile_id = (SELECT auth.uid())
  );

-- Prove the lock rather than assume it. `GRANT ... TO authenticated` on a fresh
-- table can be a no-op under default privileges, and an anon-readable row here
-- would let a stranger enumerate hosts.
DO $$
DECLARE v_anon boolean;
BEGIN
  SELECT has_table_privilege('anon', 'public.meeting_host_page_handles', 'SELECT')
    INTO v_anon;
  IF v_anon THEN
    RAISE EXCEPTION 'meeting_host_page_handles is readable by anon — refusing to ship a handle enumerator.';
  END IF;
  RAISE NOTICE 'meeting_host_page_handles created; anon SELECT = %', v_anon;
END $$;

COMMIT;
