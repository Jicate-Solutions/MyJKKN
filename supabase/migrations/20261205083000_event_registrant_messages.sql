-- ============================================================================
-- event_registrant_messages — the ledger behind "Message registrants", the
-- first surface in the Events module that can actually send a registrant
-- anything.
--
-- ⚠️ UNAPPLIED PROPOSAL. The PR that introduces this file does NOT execute it.
-- The "Messages" tab renders a plain error until it is applied. Apply with
-- Supabase `apply_migration` (never `execute_sql` — that runs the SQL but
-- writes no supabase_migrations.schema_migrations row, which is how most of
-- this repo's migrations ended up with no ledger entry).
--
-- ---------------------------------------------------------------------------
-- WHY A TABLE AT ALL — the notification already exists
-- ---------------------------------------------------------------------------
-- Delivery itself is NOT invented here. It goes through the canonical fanout
-- (lib/services/_shared/notifications/notify.ts → notifications +
-- user_notifications), exactly as app/api/events/notify/route.ts does, with
-- the same legacy `type = 'events'` envelope so the existing read path
-- (EventsNotificationService.getUnread / useEventsUnreadNotifications) picks
-- these up with no change.
--
-- What the notifications table cannot answer is the ORGANISER's question:
-- "have I already told them, when, and how many did it reach?" Answering it
-- from `notifications` would mean scanning JSON metadata for an event id, and
-- would still not record the audience that was RESOLVED at send time (how many
-- registrants had no account and therefore heard nothing). That number is the
-- point — it is what makes the blast radius honest — so it is stored.
--
-- ---------------------------------------------------------------------------
-- GRAIN, and why client_token is UNIQUE
-- ---------------------------------------------------------------------------
-- One row per SEND. `client_token` is minted by the compose form, so a double
-- click, a double submit, or a retried request all carry the same token and
-- the UNIQUE constraint collapses them into one row — the second request
-- reads the first row back and returns its counts instead of sending again.
--
-- A deliberate second message (organisers do send two) simply carries a new
-- token, so this blocks accidents without blocking intent.
--
-- Belt and braces: the fanout is ALSO called with an idempotency key derived
-- from this row's id, so even a retry that gets past the token (a row whose
-- first fanout attempt failed, delivered_count = 0) cannot deliver twice.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_registrant_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,

  subject           TEXT NOT NULL,
  body              TEXT NOT NULL,

  -- Resolved at send time, never recomputed. audience_total is every
  -- registration in scope; recipient_count is the subset that had an account
  -- to deliver to; delivered_count is what the fanout actually wrote.
  audience_total    INTEGER NOT NULL DEFAULT 0,
  recipient_count   INTEGER NOT NULL DEFAULT 0,
  delivered_count   INTEGER NOT NULL DEFAULT 0,

  -- The notifications row this send produced. NULL means the fanout never
  -- completed — the row is then a FAILED attempt, and the API is allowed to
  -- retry it under the same idempotency key.
  notification_id   UUID,

  sent_by           UUID REFERENCES public.profiles(id),
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  client_token      UUID NOT NULL,

  CONSTRAINT uq_event_registrant_messages_token UNIQUE (event_id, client_token)
);

COMMENT ON TABLE public.event_registrant_messages IS
  'One row per manual message an organiser sent to an event''s registrants. The message itself is delivered through the canonical notification fanout; this table exists so the organiser can see what was already said, by whom, and how far it reached — and so a second click cannot silently repeat it.';
COMMENT ON COLUMN public.event_registrant_messages.audience_total IS
  'Registrations in scope at send time (status registered/confirmed/checked_in), including those with no MyJKKN account. Always >= recipient_count.';
COMMENT ON COLUMN public.event_registrant_messages.recipient_count IS
  'Distinct profiles the message was addressed to. External registrants with no profile_id are counted in audience_total but not here — they were not reachable in-app.';
COMMENT ON COLUMN public.event_registrant_messages.delivered_count IS
  'user_notifications rows the fanout reported writing. 0 with notification_id NULL means the attempt failed and may be retried under the same client_token.';
COMMENT ON COLUMN public.event_registrant_messages.client_token IS
  'Idempotency key minted by the compose form. UNIQUE per event, so a double click or a retried POST collapses onto the first row rather than sending a second message.';

CREATE INDEX IF NOT EXISTS idx_event_registrant_messages_event
  ON public.event_registrant_messages (event_id, sent_at DESC);

-- ---------------------------------------------------------------------------
-- Authority — who may message an event's registrants
-- ---------------------------------------------------------------------------
-- Same shape, same four branches and the same reasoning as
-- fn_can_manage_event_feedback (20260909210000 / 20260909220000): super admin,
-- admin, the appointed in-charge, or the event's creator. Deliberately NOT
-- `events.view` — that key is held by learners and faculty, and this function
-- decides who may send every registrant a message.
--
-- It is a separate function rather than a reuse of the feedback gate because
-- the two authorities are allowed to diverge later (editing a questionnaire
-- and blasting an audience are different acts), and because a function named
-- for feedback silently deciding who may send messages is exactly the kind of
-- misdirection that survives review and then surprises someone.
CREATE OR REPLACE FUNCTION public.fn_can_manage_event_messages(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR public.is_admin()
    OR public.fn_is_event_incharge(p_event_id)
    OR EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = p_event_id
        AND e.created_by = auth.uid()
    );
$$;

COMMENT ON FUNCTION public.fn_can_manage_event_messages(uuid) IS
  'Authority to send an event''s registrants a message and to read the log of what was already sent. Super admin, admin, the event in-charge (events.config->incharges), or the event''s creator — nothing else. Mirrors fn_can_manage_event_feedback; deliberately rejects events.view.';

-- Lock the function from anon. Postgres grants EXECUTE to PUBLIC by default and
-- Supabase's ALTER DEFAULT PRIVILEGES grants anon on top, so a new SECURITY
-- DEFINER function is callable by an unauthenticated client unless this is
-- stated. Every branch resolves through auth.uid(), which is NULL for anon, so
-- the body already fails closed — but an unauthenticated caller should not
-- reach the body at all.
REVOKE EXECUTE ON FUNCTION public.fn_can_manage_event_messages(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_manage_event_messages(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- READ-ONLY for `authenticated`, and only for people who may manage the event.
-- There is no INSERT/UPDATE/DELETE grant and no such policy: every write comes
-- from the API route under the service-role client, after it has checked the
-- gate above and resolved the audience itself. A client that could write here
-- directly could claim a send that never happened, or claim a recipient count
-- that was never resolved — and this table's only job is to be believed.
REVOKE ALL ON public.event_registrant_messages FROM anon, PUBLIC;
GRANT SELECT ON public.event_registrant_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.event_registrant_messages TO service_role;

ALTER TABLE public.event_registrant_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_registrant_messages_select ON public.event_registrant_messages;
CREATE POLICY event_registrant_messages_select ON public.event_registrant_messages
  FOR SELECT
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR public.fn_can_manage_event_messages(event_id)
  );
