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
-- THE GUARD IS A CONSTRAINT, NOT A CHECK-THEN-INSERT
-- ---------------------------------------------------------------------------
-- The API refuses a first send whose words already went out, by reading the
-- event's recent messages and then inserting. That is a time-of-check /
-- time-of-use gap: two POSTs carrying the same subject and body under DIFFERENT
-- client_tokens — one organiser with two tabs, two organisers, or a compose
-- racing a resend — both read before either writes, both see no duplicate, and
-- both deliver. UNIQUE (event_id, client_token) from 20261205083000 does not
-- close it: the tokens differ precisely because the content binding was lost,
-- which is the case this whole feature exists for.
--
-- A duplicate blast produced by a race is exactly the outcome the PR promises
-- can no longer happen by accident, so the promise has to be kept where
-- concurrency is actually decided. This index makes the second writer fail with
-- 23505 instead of sending; the route turns that into the same 409 the
-- pre-check returns, and nothing has been delivered at that point because the
-- ledger row is claimed BEFORE the fanout.
--
-- WHERE resend_of IS NULL is the whole design in one clause: a DELIBERATE
-- repeat is exempt and may be sent as often as it is confirmed. Only a send
-- claiming to be new is held to being new.
--
-- The hash is length-prefixed rather than a plain concatenation so the encoding
-- is injective — subject 'ab' + body 'c' cannot collide with subject 'a' + body
-- 'bc' — mirroring composeKey() in lib/services/events/organiser-message-compose.ts,
-- which is the definition of "the same message" the browser and the API already
-- share. Every expression here is IMMUTABLE, which an index requires.
--
-- btrim NAMES ITS CHARACTERS, and that is not decoration: one-argument btrim()
-- strips SPACES ONLY, while the JavaScript .trim() that composeKey uses strips
-- tabs and newlines too. Left at the default, a re-typed message whose body
-- ended in a stray newline hashed differently from the one already stored and
-- went out as a brand new announcement — verified against a throwaway Postgres,
-- where exactly that insert was accepted before this character set was given.
-- The API trims before writing, so this is the belt to that braces; a guard
-- that only holds while the one writer behaves is not a constraint.
--
-- ⚠️ APPLY-TIME FAILURE IS INTENTIONAL AND MEANS SOMETHING: if the table
-- already holds two first-send rows with identical subject and body on one
-- event, this CREATE fails. That is a duplicate blast that already happened and
-- an operator has to look at it; it must not be indexed away by weakening the
-- constraint. (Checked read-only against production 2026-09-13: the table does
-- not exist there yet — 20261205083000 is itself unapplied — so there are no
-- rows to conflict.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_registrant_messages_first_send_content
  ON public.event_registrant_messages (
    event_id,
    md5(
      length(btrim(subject, E' \t\n\r\f\v'))::text || ':' ||
      btrim(subject, E' \t\n\r\f\v') ||
      btrim(body, E' \t\n\r\f\v')
    )
  )
  WHERE resend_of IS NULL;

COMMENT ON INDEX public.uq_event_registrant_messages_first_send_content IS
  'Two messages claiming to be NEW cannot carry the same subject and body on one event. Closes the time-of-check/time-of-use gap between the API''s duplicate read and its insert, which UNIQUE (event_id, client_token) cannot close because a racing re-type carries a different token. Partial on resend_of IS NULL so a confirmed "Send again" is never blocked.';

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

  -- The duplicate guard is only real if the index is really there. Asserted
  -- rather than assumed, because a CREATE ... IF NOT EXISTS that matched an
  -- older index of the same name would leave the promise unbacked.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'uq_event_registrant_messages_first_send_content'
      AND i.indisunique
      AND i.indpred IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'uq_event_registrant_messages_first_send_content is missing or is not a partial UNIQUE index';
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
