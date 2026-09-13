-- ============================================================================
-- event_registrant_messages.resend_of — a DELIBERATE second send of the same
-- announcement, recorded as its own row and linked to the one it repeats.
--
-- ⚠️ UNAPPLIED PROPOSAL. The PR that introduces this file does NOT execute it.
-- Apply with Supabase `apply_migration` (never `execute_sql` — that runs the
-- SQL but writes no supabase_migrations.schema_migrations row).
--
-- Depends on 20261205083000_event_registrant_messages.sql, which creates the
-- table. Apply that one first.
--
-- ---------------------------------------------------------------------------
-- WHY A COLUMN, AND NOT JUST "ANOTHER ROW"
-- ---------------------------------------------------------------------------
-- 20261205083000 made an ACCIDENT harmless: UNIQUE (event_id, client_token)
-- collapses a double click, and the compose token is bound to the message's
-- CONTENT so a retry of a send that looked like it failed lands on the same
-- row. Both are right and neither changes here.
--
-- What that left is a genuine half-failed send with no way forward. The
-- organiser sees an error, cannot tell whether anybody got it, and re-typing
-- the identical text is judged by invisible client state: if the content
-- binding is still held the send is silently swallowed, and if the page has
-- been reloaded since, the very same keystrokes deliver a second blast with no
-- warning at all. Unpredictable in both directions.
--
-- So the second send becomes explicit. `resend_of` is the ORGANISER'S STATED
-- INTENT, carried on the request and stored on the row:
--
--   * absent  → this is meant to be a new message. The API refuses it when an
--               earlier message on the same event carries the same subject and
--               body under a different token, and names the one it matched.
--               A re-type can no longer become a silent duplicate blast.
--   * present → the organiser has been shown the recipient count and told in
--               plain words that some people may receive this twice, and has
--               confirmed anyway. It delivers.
--
-- Storing it is what lets the history say which rows are repeats, so "we sent
-- this twice" is visible afterwards rather than inferred from two rows that
-- happen to read alike.
-- ============================================================================

ALTER TABLE public.event_registrant_messages
  ADD COLUMN IF NOT EXISTS resend_of UUID
    REFERENCES public.event_registrant_messages(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.event_registrant_messages.resend_of IS
  'Set when this row is a DELIBERATE resend of an earlier message on the same event, and holds that message''s id. NULL means the organiser meant it as a new message — and the API refuses such a send when an earlier message on the event carries identical subject and body under a different client_token, so a re-typed duplicate cannot go out unacknowledged. ON DELETE SET NULL: losing the original must never delete the record that a second send happened.';

-- A row cannot be a resend of itself. Not idempotent as a bare ADD CONSTRAINT,
-- so it is guarded on the catalogue rather than on IF NOT EXISTS (which
-- ALTER TABLE ... ADD CONSTRAINT does not support).
DO $resend_self$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.event_registrant_messages'::regclass
      AND conname  = 'chk_event_registrant_messages_resend_not_self'
  ) THEN
    ALTER TABLE public.event_registrant_messages
      ADD CONSTRAINT chk_event_registrant_messages_resend_not_self
      CHECK (resend_of IS NULL OR resend_of <> id);
  END IF;
END
$resend_self$;

-- The history read walks resends of a message; the partial index keeps it off
-- the overwhelming majority of rows, which are not resends.
CREATE INDEX IF NOT EXISTS idx_event_registrant_messages_resend_of
  ON public.event_registrant_messages (resend_of)
  WHERE resend_of IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Privileges are NOT re-stated, and that is the point
-- ---------------------------------------------------------------------------
-- ADD COLUMN inherits the table's existing ACL; it does not re-run Supabase's
-- ALTER DEFAULT PRIVILEGES the way CREATE TABLE does, so nothing here can hand
-- `authenticated` a write grant. The table must still be append-only from the
-- app's side, so assert that rather than assume it — a migration applied onto a
-- table whose grants drifted should fail here, not at the first row somebody
-- writes who should not have been able to.
DO $assert$
DECLARE
  v_priv text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'event_registrant_messages'
      AND column_name  = 'resend_of'
  ) THEN
    RAISE EXCEPTION 'event_registrant_messages.resend_of was not added';
  END IF;

  FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
    IF has_table_privilege('authenticated', 'public.event_registrant_messages', v_priv) THEN
      RAISE EXCEPTION
        'event_registrant_messages is not append-only: role authenticated still holds % on it', v_priv;
    END IF;
    IF has_table_privilege('anon', 'public.event_registrant_messages', v_priv) THEN
      RAISE EXCEPTION
        'event_registrant_messages is writable by anon: role anon still holds % on it', v_priv;
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.event_registrant_messages', 'SELECT') THEN
    RAISE EXCEPTION 'event_registrant_messages is readable by anon';
  END IF;
END
$assert$;
