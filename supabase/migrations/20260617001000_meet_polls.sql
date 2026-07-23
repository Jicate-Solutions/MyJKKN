-- =============================================================================
-- Meeting Polls (Universal Booking M5) — Calendly "Meeting Polls" parity
-- Migration: meet_polls
-- Added: 2026-06-17 — a host proposes several candidate times, invitees vote,
--   the host confirms a winner (which becomes a confirmed meeting_bookings row).
-- =============================================================================
--
-- Design decisions (mirror the native scheduling engine 20260611190000):
--   * MULTI-TENANT: meeting_polls carries the host's profile id; the booking
--     created on confirm inherits the host's institution_id.
--   * PUBLIC ENTRY IS RPC-ONLY: anon invitees never touch these tables
--     directly. They read a poll via fn_get_active_poll(slug) and vote via
--     fn_cast_poll_votes(...). Both are SECURITY DEFINER and INTENTIONALLY
--     granted to anon (the audit-trail signal that the grant is deliberate,
--     not the Supabase default — see CLAUDE.md "Lock new RPCs from anon").
--   * Vote idempotency: a unique (option_id, voter_email) stops a single
--     invitee from voting twice for the same option. fn_cast_poll_votes is
--     re-runnable — it replaces a voter's prior ballot for the poll.
--
-- Writes from the admin UI go through the RLS browser client (host owns own
-- rows via host_profile_id = auth.uid()). The confirm-winner booking insert is
-- handled in lib/services/meetings/meeting-poll-service.ts with the same RLS
-- client (the host inserting their own meeting_bookings row).
-- =============================================================================

-- ── 1. meeting_polls ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meeting_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES public.institutions(id),
  -- short public reference used in the /poll/<slug> link
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  duration_min smallint NOT NULL DEFAULT 30 CHECK (duration_min BETWEEN 1 AND 1440),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  -- the winning option (set on confirm); FK added after options table exists
  winning_option_id uuid,
  -- the booking created when the host confirms a winner (audit link)
  booking_id uuid REFERENCES public.meeting_bookings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meeting_polls IS
  'Meeting Polls (Calendly parity): host proposes candidate times, invitees vote, host confirms a winner. Public read/vote via fn_get_active_poll / fn_cast_poll_votes (SECURITY DEFINER, anon-granted by intent).';

CREATE INDEX IF NOT EXISTS idx_meeting_polls_host
  ON public.meeting_polls(host_profile_id);

-- ── 2. meeting_poll_options ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meeting_poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.meeting_polls(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mpo_range_valid CHECK (end_time > start_time)
);

COMMENT ON TABLE public.meeting_poll_options IS
  'Candidate time slots for a meeting poll. order_index controls display order.';

CREATE INDEX IF NOT EXISTS idx_meeting_poll_options_poll
  ON public.meeting_poll_options(poll_id, order_index);

-- winning_option_id FK (now that meeting_poll_options exists). Idempotent guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'meeting_polls_winning_option_fk'
  ) THEN
    ALTER TABLE public.meeting_polls
      ADD CONSTRAINT meeting_polls_winning_option_fk
      FOREIGN KEY (winning_option_id)
      REFERENCES public.meeting_poll_options(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 3. meeting_poll_votes ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meeting_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.meeting_polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.meeting_poll_options(id) ON DELETE CASCADE,
  voter_name text NOT NULL,
  voter_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- one ballot per option per email (re-voting replaces via the RPC)
  CONSTRAINT uq_mpv_option_email UNIQUE (option_id, voter_email)
);

COMMENT ON TABLE public.meeting_poll_votes IS
  'Invitee votes on poll options. Unique(option_id, voter_email) prevents duplicate votes for the same option; fn_cast_poll_votes replaces a voter''s prior ballot for the whole poll.';

CREATE INDEX IF NOT EXISTS idx_meeting_poll_votes_poll
  ON public.meeting_poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_meeting_poll_votes_option
  ON public.meeting_poll_votes(option_id);

-- ── updated_at trigger (internal helper — locked from anon) ──────────────────

CREATE OR REPLACE FUNCTION public.tg_meeting_polls_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.tg_meeting_polls_set_updated_at() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS tg_meeting_polls_updated ON public.meeting_polls;
CREATE TRIGGER tg_meeting_polls_updated BEFORE UPDATE ON public.meeting_polls
  FOR EACH ROW EXECUTE FUNCTION public.tg_meeting_polls_set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Hosts manage their own polls/options/votes; super_admin/admin bypass; the
-- meetings.polls.view permission grants read across the platform. Anon NEVER
-- reads these tables directly — only via the two SECURITY DEFINER RPCs below.

ALTER TABLE public.meeting_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_poll_votes ENABLE ROW LEVEL SECURITY;

-- meeting_polls: host owns own; permission-holders read.
DROP POLICY IF EXISTS "meeting_polls_host_all" ON public.meeting_polls;
CREATE POLICY "meeting_polls_host_all" ON public.meeting_polls
FOR ALL USING (
  is_super_admin() OR is_admin() OR host_profile_id = auth.uid()
) WITH CHECK (
  is_super_admin() OR is_admin() OR host_profile_id = auth.uid()
);

DROP POLICY IF EXISTS "meeting_polls_perm_select" ON public.meeting_polls;
CREATE POLICY "meeting_polls_perm_select" ON public.meeting_polls
FOR SELECT USING (
  is_super_admin() OR is_admin() OR user_has_permission('meetings.polls.view')
);

-- meeting_poll_options: gated by the parent poll's ownership/permission.
DROP POLICY IF EXISTS "meeting_poll_options_host_all" ON public.meeting_poll_options;
CREATE POLICY "meeting_poll_options_host_all" ON public.meeting_poll_options
FOR ALL USING (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM public.meeting_polls p
    WHERE p.id = poll_id AND p.host_profile_id = auth.uid()
  )
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM public.meeting_polls p
    WHERE p.id = poll_id AND p.host_profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "meeting_poll_options_perm_select" ON public.meeting_poll_options;
CREATE POLICY "meeting_poll_options_perm_select" ON public.meeting_poll_options
FOR SELECT USING (
  is_super_admin() OR is_admin() OR user_has_permission('meetings.polls.view')
);

-- meeting_poll_votes: host of the parent poll reads + manages; permission read.
DROP POLICY IF EXISTS "meeting_poll_votes_host_all" ON public.meeting_poll_votes;
CREATE POLICY "meeting_poll_votes_host_all" ON public.meeting_poll_votes
FOR ALL USING (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM public.meeting_polls p
    WHERE p.id = poll_id AND p.host_profile_id = auth.uid()
  )
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM public.meeting_polls p
    WHERE p.id = poll_id AND p.host_profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "meeting_poll_votes_perm_select" ON public.meeting_poll_votes;
CREATE POLICY "meeting_poll_votes_perm_select" ON public.meeting_poll_votes
FOR SELECT USING (
  is_super_admin() OR is_admin() OR user_has_permission('meetings.polls.view')
);

-- ── PUBLIC RPCs (SECURITY DEFINER, INTENTIONALLY anon-granted) ───────────────
-- These are the ONLY anon entry point. They expose poll-safe fields only:
-- no host email, no voter list, no internal ids beyond what a voter needs.

-- fn_get_active_poll(slug): one OPEN poll + its options + per-option tally.
-- Returns nothing for unknown/closed slugs (the page renders not-found/closed
-- from the closed flag; an unknown slug returns zero rows).
CREATE OR REPLACE FUNCTION public.fn_get_active_poll(p_slug text)
RETURNS TABLE (
  poll_id uuid,
  title text,
  description text,
  duration_min smallint,
  status text,
  host_name text,
  option_id uuid,
  start_time timestamptz,
  end_time timestamptz,
  order_index integer,
  vote_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.title,
    p.description,
    p.duration_min,
    p.status,
    COALESCE(pr.full_name, 'JKKN Staff') AS host_name,
    o.id,
    o.start_time,
    o.end_time,
    o.order_index,
    (SELECT COUNT(*) FROM public.meeting_poll_votes v WHERE v.option_id = o.id) AS vote_count
  FROM public.meeting_polls p
  LEFT JOIN public.profiles pr ON pr.id = p.host_profile_id
  JOIN public.meeting_poll_options o ON o.poll_id = p.id
  WHERE lower(p.slug) = lower(trim(p_slug))
  ORDER BY o.order_index, o.start_time;
$$;

-- INTENTIONALLY public: the /poll/<slug> page is visited by unauthenticated
-- invitees. Exposes only poll-safe fields (no voter PII, no host email).
REVOKE EXECUTE ON FUNCTION public.fn_get_active_poll(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_get_active_poll(text) TO anon, authenticated;

-- fn_cast_poll_votes(slug, voter_name, voter_email, option_ids[]):
-- replaces the voter's prior ballot for this poll, then inserts a vote per
-- chosen option. Returns the number of votes recorded. Refuses on a closed
-- or unknown poll, or when an option does not belong to the poll.
CREATE OR REPLACE FUNCTION public.fn_cast_poll_votes(
  p_slug text,
  p_voter_name text,
  p_voter_email text,
  p_option_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poll_id uuid;
  v_status text;
  v_email text := lower(trim(p_voter_email));
  v_name text := trim(p_voter_name);
  v_valid_options uuid[];
  v_recorded integer := 0;
  v_opt uuid;
BEGIN
  IF v_email = '' OR v_name = '' THEN
    RAISE EXCEPTION 'voter name and email are required' USING ERRCODE = '22023';
  END IF;
  IF p_option_ids IS NULL OR array_length(p_option_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'at least one option must be selected' USING ERRCODE = '22023';
  END IF;

  SELECT id, status INTO v_poll_id, v_status
  FROM public.meeting_polls
  WHERE lower(slug) = lower(trim(p_slug));

  IF v_poll_id IS NULL THEN
    RAISE EXCEPTION 'poll not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'this poll is closed' USING ERRCODE = '22023';
  END IF;

  -- Keep only option ids that genuinely belong to this poll (defends against a
  -- client posting another poll's option ids).
  SELECT array_agg(o.id) INTO v_valid_options
  FROM public.meeting_poll_options o
  WHERE o.poll_id = v_poll_id AND o.id = ANY(p_option_ids);

  IF v_valid_options IS NULL OR array_length(v_valid_options, 1) IS NULL THEN
    RAISE EXCEPTION 'no valid options selected' USING ERRCODE = '22023';
  END IF;

  -- Replace this voter's prior ballot for the whole poll (idempotent re-vote).
  DELETE FROM public.meeting_poll_votes
  WHERE poll_id = v_poll_id AND voter_email = v_email;

  FOREACH v_opt IN ARRAY v_valid_options LOOP
    INSERT INTO public.meeting_poll_votes (poll_id, option_id, voter_name, voter_email)
    VALUES (v_poll_id, v_opt, v_name, v_email)
    ON CONFLICT (option_id, voter_email) DO NOTHING;
    v_recorded := v_recorded + 1;
  END LOOP;

  RETURN v_recorded;
END $$;

-- INTENTIONALLY public: unauthenticated invitees cast votes from /poll/<slug>.
-- Identity is the voter_email they supply; no auth.uid() dependency.
REVOKE EXECUTE ON FUNCTION public.fn_cast_poll_votes(text, text, text, uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cast_poll_votes(text, text, text, uuid[]) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
