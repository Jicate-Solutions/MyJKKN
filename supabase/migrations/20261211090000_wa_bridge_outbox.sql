-- ============================================================================
-- wa_bridge_outbox / wa_bridge_inbound / wa_bridge_status — the MyJKKN side of
-- the on-campus WhatsApp bridge.
--
-- ⚠️ UNAPPLIED PROPOSAL. The PR that introduces this file does NOT execute it.
-- Every /api/whatsapp-bridge/* route returns a plain database error until it is
-- applied. Apply with the Supabase `apply_migration` tool (never `execute_sql`
-- — that runs the SQL but writes no supabase_migrations.schema_migrations row,
-- which is how most of this repo's migrations ended up with no ledger entry).
--
-- ---------------------------------------------------------------------------
-- WHY A QUEUE AT ALL — Vercel cannot reach the bridge
-- ---------------------------------------------------------------------------
-- The bridge is a Go process on a Windows machine on the campus LAN, behind
-- NAT. There is no inbound route to it: MyJKKN cannot POST a message to the
-- bridge the way it POSTs to the Railway BYOW service. So the direction is
-- inverted — the bridge POLLs us, takes work, does it, and posts the result
-- back. That polling needs somewhere to poll, and this is it.
--
-- ---------------------------------------------------------------------------
-- WHY A CLAIM RPC AND NOT A PLAIN SELECT-THEN-UPDATE
-- ---------------------------------------------------------------------------
-- The bridge retries, restarts, and may briefly run twice (a Windows service
-- restart that overlaps its own shutdown). Two overlapping polls that both did
-- `SELECT ... WHERE status='pending'` and then `UPDATE ... SET status='sending'`
-- would BOTH receive the same rows in the window between the select and the
-- update, and a learner's parent would get the same message twice. The claim is
-- therefore a single UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)
-- RETURNING — one statement, so there is no window; SKIP LOCKED so the second
-- poller steps over the rows the first has locked instead of blocking on them.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Outbox — work the bridge is waiting to be given
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_bridge_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  to_phone        TEXT NOT NULL,
  body            TEXT,
  type            TEXT NOT NULL DEFAULT 'text',
  media_url       TEXT,

  -- pending  → waiting to be claimed by a poll
  -- sending  → claimed by a poll, outcome not yet acknowledged
  -- sent     → the bridge acknowledged delivery to WhatsApp
  -- failed   → the bridge acknowledged failure and the row is out of attempts
  status          TEXT NOT NULL DEFAULT 'pending',

  attempts        INTEGER NOT NULL DEFAULT 0,
  wa_message_id   TEXT,
  error           TEXT,

  lead_id         UUID,
  institution_id  UUID,
  created_by      UUID,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The rows this table points at. Bare UUIDs with no FK would let a deleted
  -- lead, institution or member of staff leave an id here that resolves to
  -- nothing — and a message queued against a lead that no longer exists is a
  -- message nobody can explain. ON DELETE SET NULL everywhere: the MESSAGE
  -- record is the thing worth keeping, and losing its link is survivable where
  -- losing the row (CASCADE) or blocking the delete (RESTRICT) is not.
  CONSTRAINT wa_bridge_outbox_lead_fk
    FOREIGN KEY (lead_id) REFERENCES public.admission_leads(id) ON DELETE SET NULL,
  CONSTRAINT wa_bridge_outbox_institution_fk
    FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE SET NULL,
  CONSTRAINT wa_bridge_outbox_created_by_fk
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,

  CONSTRAINT wa_bridge_outbox_status_chk
    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),

  -- EXACTLY 'text' and 'media', and getting this list right is a contract, not
  -- a preference. The sender lane writes type='media' for every image, document
  -- and audio send; a constraint listing image/document/video/audio instead
  -- would reject 'media' and fail 100% of media sends at the INSERT, before any
  -- of this queue's machinery ever ran. The bridge takes a URL and lets
  -- WhatsApp decide how to render it, so four names would be four names for one
  -- behaviour.
  CONSTRAINT wa_bridge_outbox_type_chk
    CHECK (type IN ('text', 'media')),

  -- Canonical E.164, DIGITS ONLY — no '+', no separators, no '@s.whatsapp.net'.
  -- Enforced in the column rather than only in TypeScript because this table has
  -- more than one writer, and a number the bridge cannot dial would otherwise be
  -- claimed, fail three times and land in `failed`, where it reads as "WhatsApp
  -- refused it" instead of "we wrote a bad number".
  CONSTRAINT wa_bridge_outbox_to_phone_chk
    CHECK (to_phone ~ '^[1-9][0-9]{7,14}$'),

  -- Binds the payload to the type. Without this a row with type='text' and
  -- body NULL is claimable: the bridge is handed a text message with nothing in
  -- it, and the failure surfaces on a Windows box rather than at the INSERT that
  -- caused it. A media row must carry a URL; its body is the optional caption.
  CONSTRAINT wa_bridge_outbox_payload_chk
    CHECK (
      (type = 'text'
        AND body IS NOT NULL AND btrim(body) <> ''
        AND media_url IS NULL)
      OR
      (type = 'media'
        AND media_url IS NOT NULL AND btrim(media_url) <> '')
    ),

  -- 4096 CHARACTERS, which is what WhatsApp itself counts. char_length() counts
  -- characters; octet_length() would count bytes, and a byte cap refuses a Tamil
  -- message at roughly a third of the length it refuses an English one, because
  -- a Tamil character is three bytes in UTF-8. JKKN's families write in Tamil.
  CONSTRAINT wa_bridge_outbox_body_len_chk
    CHECK (body IS NULL OR char_length(body) <= 4096)
);

COMMENT ON TABLE public.wa_bridge_outbox IS
  'Work queue the on-campus WhatsApp bridge polls. One row per message MyJKKN wants sent. The bridge claims rows (status pending → sending) and posts the outcome back; nothing in MyJKKN ever calls the bridge directly, because it sits behind campus NAT.';
COMMENT ON COLUMN public.wa_bridge_outbox.status IS
  'pending = unclaimed. sending = claimed by a poll, outcome unknown. sent = the bridge confirmed WhatsApp accepted it. failed = the bridge reported failure and attempts is exhausted. A failure with attempts still under the cap returns to pending rather than staying failed.';
COMMENT ON COLUMN public.wa_bridge_outbox.attempts IS
  'Acknowledged attempts, incremented by the ack, not by the claim. A row claimed by a poll that then died is left in sending and is NOT counted — see the stale-claim note on fn_wa_bridge_claim_pending.';
COMMENT ON COLUMN public.wa_bridge_outbox.institution_id IS
  'The institution this message belongs to, used by RLS. NULL means platform-wide and is readable ONLY by a super admin or an admin — the SELECT policy requires institution_id IS NOT NULL before it consults role_has_institution_access(), because that function returns TRUE for a NULL argument and would otherwise show every platform-wide message to everyone holding admission.settings.whatsapp.view. The bridge does not read through RLS at all.';

-- The pending poll is the only hot query: status = 'pending' ORDER BY created_at.
CREATE INDEX IF NOT EXISTS idx_wa_bridge_outbox_status_created
  ON public.wa_bridge_outbox (status, created_at);

-- ---------------------------------------------------------------------------
-- 2. Inbound — what the bridge heard
-- ---------------------------------------------------------------------------
-- A SEPARATE table rather than wa_personal_message_logs. That table is keyed to
-- a wa_personal_connections row (department_id, connection_id, both NOT NULL in
-- practice for every reader of it), and the bridge has no connection row and no
-- department — it is one campus device, not a department's BYOW session.
-- Writing bridge traffic into it would either need invented department ids or
-- NULLs that the existing inbox UI does not expect.
CREATE TABLE IF NOT EXISTS public.wa_bridge_inbound (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The bridge's own WhatsApp message id. UNIQUE, and it is the whole reason
  -- this table can be retried into: the bridge re-posts anything it is not sure
  -- we received, so a duplicate must collapse onto the first row instead of
  -- creating a second record of one message a person sent once.
  wa_message_id   TEXT NOT NULL,

  from_phone      TEXT NOT NULL,
  sender_name     TEXT,
  body            TEXT,
  type            TEXT NOT NULL DEFAULT 'text',
  is_group        BOOLEAN NOT NULL DEFAULT false,

  -- Resolved at write time by matching from_phone against admission_leads.
  -- NULL means EITHER the number belongs to nobody we know OR it belongs to
  -- more than one person — match_status is what tells those apart.
  lead_id         UUID,

  -- ⚠️ SIBLINGS SHARE A PARENT'S PHONE AT JKKN. Two admission leads carrying one
  -- number is ordinary data, and picking one of them would file a parent's reply
  -- against the wrong child's admission record with nothing anywhere recording
  -- that a guess was made. So more than one candidate attaches to NONE of them:
  --   matched    -> exactly one lead carries this number; lead_id is set
  --   unmatched  -> no lead carries it; the message is kept anyway
  --   ambiguous  -> several do; lead_id is NULL and a person decides
  match_status          TEXT    NOT NULL DEFAULT 'unmatched',
  match_candidate_count INTEGER NOT NULL DEFAULT 0,

  received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_wa_bridge_inbound_wa_message_id UNIQUE (wa_message_id),

  CONSTRAINT wa_bridge_inbound_lead_fk
    FOREIGN KEY (lead_id) REFERENCES public.admission_leads(id) ON DELETE SET NULL,

  CONSTRAINT wa_bridge_inbound_match_status_chk
    CHECK (match_status IN ('matched', 'unmatched', 'ambiguous')),
  CONSTRAINT wa_bridge_inbound_candidates_chk
    CHECK (match_candidate_count >= 0),

  -- One-directional on purpose. An ambiguous message must NEVER carry a lead —
  -- that is the whole point of the state. The reverse ('matched' implies a
  -- lead_id) is deliberately NOT asserted, because ON DELETE SET NULL above can
  -- legitimately empty lead_id later, and a two-way CHECK would then block the
  -- deletion of any lead that had ever replied.
  CONSTRAINT wa_bridge_inbound_ambiguous_has_no_lead_chk
    CHECK (match_status <> 'ambiguous' OR lead_id IS NULL)
);

COMMENT ON TABLE public.wa_bridge_inbound IS
  'Messages the on-campus WhatsApp bridge received, one row per WhatsApp message. Separate from wa_personal_message_logs because the bridge has no wa_personal_connections row and no department. UNIQUE on wa_message_id so the bridge''s retries cannot double-record one message.';

CREATE INDEX IF NOT EXISTS idx_wa_bridge_inbound_lead
  ON public.wa_bridge_inbound (lead_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_bridge_inbound_received
  ON public.wa_bridge_inbound (received_at DESC);

-- The human-resolution queue: everything a person still has to file. Partial,
-- because in steady state nearly every row is 'matched' and none of those
-- belong in this list.
CREATE INDEX IF NOT EXISTS idx_wa_bridge_inbound_needs_attention
  ON public.wa_bridge_inbound (match_status, received_at DESC)
  WHERE match_status <> 'matched';

COMMENT ON COLUMN public.wa_bridge_inbound.match_status IS
  'matched = exactly one admission lead carries this number. unmatched = none does. ambiguous = several do (siblings sharing a parent''s phone is normal at JKKN) and the message was deliberately attached to NONE of them, for a person to file. The two non-matched states need different actions, which is why they are not one "unresolved".';
COMMENT ON COLUMN public.wa_bridge_inbound.match_candidate_count IS
  'How many admission leads carry this number. 0 or 1 for matched/unmatched; more than 1 for ambiguous. Recorded so the person resolving it knows how many records they are choosing between before opening anything.';

-- ---------------------------------------------------------------------------
-- 3. Heartbeat — is the bridge alive, and is it still logged in
-- ---------------------------------------------------------------------------
-- ONE row, enforced by the primary key rather than by convention: the id is a
-- fixed literal and a CHECK refuses any other value, so a second bridge cannot
-- quietly append a second row that half the readers then miss. If a second
-- campus device is ever added this table has to change shape, which is the
-- correct amount of friction for that decision.
CREATE TABLE IF NOT EXISTS public.wa_bridge_status (
  id                TEXT PRIMARY KEY DEFAULT 'bridge',
  connected         BOOLEAN NOT NULL DEFAULT false,
  logged_in         BOOLEAN NOT NULL DEFAULT false,
  phone_number      TEXT,
  version           TEXT,
  last_heartbeat_at TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT wa_bridge_status_singleton_chk CHECK (id = 'bridge')
);

COMMENT ON TABLE public.wa_bridge_status IS
  'Single-row heartbeat for the on-campus WhatsApp bridge. connected = the process is running and talking to us; logged_in = its WhatsApp session is still authenticated. The two differ, and the difference is the whole value: a bridge that is running but logged out looks healthy from the outside while sending nothing.';

-- ---------------------------------------------------------------------------
-- 4. Claim RPC — the atomic pending poll
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because it is the only writer of the pending → sending
-- transition and must be able to make it regardless of the caller's RLS. It is
-- granted to service_role ONLY — never to authenticated. A signed-in user who
-- could call this would be able to take a message out of the queue and leave it
-- stuck in `sending` forever, which is a silent non-delivery, not an error
-- anybody sees.
--
-- ⚠️ STALE CLAIMS ARE NOT RECOVERED HERE, ON PURPOSE. A row the bridge claimed
-- and then never acknowledged (process killed mid-send) stays in `sending`
-- forever. A timeout sweep would fix that, and would ALSO re-send a message the
-- bridge had in fact already delivered but died before acking — a duplicate
-- message to a parent. Choosing which of those two is worse is a decision for
-- the Director, not a default, so this file leaves the row stuck and visible in
-- the status endpoint rather than guessing.
CREATE OR REPLACE FUNCTION public.fn_wa_bridge_claim_pending(p_limit integer)
RETURNS TABLE (
  id         uuid,
  to_phone   text,
  body       text,
  type       text,
  media_url  text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
BEGIN
  -- ONE statement. The sub-select locks the rows it picked and the enclosing
  -- UPDATE flips them in the same statement, so there is no window in which a
  -- second concurrent call can see them as pending. SKIP LOCKED makes that
  -- second call step over them and take the next batch instead of blocking.
  RETURN QUERY
  UPDATE public.wa_bridge_outbox o
     SET status     = 'sending',
         updated_at = now()
   WHERE o.id IN (
           SELECT c.id
             FROM public.wa_bridge_outbox c
            WHERE c.status = 'pending'
            ORDER BY c.created_at
            LIMIT v_limit
            FOR UPDATE SKIP LOCKED
         )
  RETURNING o.id, o.to_phone, o.body, o.type, o.media_url;
END;
$$;

COMMENT ON FUNCTION public.fn_wa_bridge_claim_pending(integer) IS
  'Claims up to p_limit pending outbox rows for the on-campus bridge and returns them, flipping them to sending in the same statement. FOR UPDATE SKIP LOCKED so two overlapping polls cannot claim the same row. service_role only — this is bridge machinery, not a user action.';

REVOKE EXECUTE ON FUNCTION public.fn_wa_bridge_claim_pending(integer) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_wa_bridge_claim_pending(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Ack RPC — record the outcome, and decide whether to retry
-- ---------------------------------------------------------------------------
-- The retry decision is made HERE and not in TypeScript, because it depends on
-- the row's current attempts and must be read-and-written atomically. Two acks
-- racing (the bridge retried its own ack) would otherwise both read attempts=1
-- and both write attempts=2.
--
-- Only a row currently in `sending` is acted on. That is what makes a repeated
-- ack harmless: the second one matches nothing, returns no row, and the API
-- reports "already acknowledged" instead of incrementing attempts twice.
CREATE OR REPLACE FUNCTION public.fn_wa_bridge_ack(
  p_id            uuid,
  p_status        text,
  p_wa_message_id text DEFAULT NULL,
  p_error         text DEFAULT NULL,
  p_max_attempts  integer DEFAULT 3
)
RETURNS TABLE (
  id       uuid,
  status   text,
  attempts integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('sent', 'failed') THEN
    RAISE EXCEPTION 'fn_wa_bridge_ack: status must be sent or failed, got %', p_status;
  END IF;

  RETURN QUERY
  UPDATE public.wa_bridge_outbox o
     SET attempts      = o.attempts + 1,
         -- The cap is compared against the POST-increment count, so
         -- p_max_attempts = 3 means the message is attempted three times and
         -- then abandoned — not four.
         status        = CASE
                           WHEN p_status = 'sent' THEN 'sent'
                           WHEN o.attempts + 1 >= p_max_attempts THEN 'failed'
                           ELSE 'pending'
                         END,
         wa_message_id = COALESCE(p_wa_message_id, o.wa_message_id),
         -- A successful send clears the error left by an earlier attempt, so
         -- the row does not read as failed-and-sent at the same time.
         error         = CASE WHEN p_status = 'sent' THEN NULL ELSE p_error END,
         sent_at       = CASE WHEN p_status = 'sent' THEN now() ELSE o.sent_at END,
         updated_at    = now()
   WHERE o.id = p_id
     AND o.status = 'sending'
  RETURNING o.id, o.status, o.attempts;
END;
$$;

COMMENT ON FUNCTION public.fn_wa_bridge_ack(uuid, text, text, text, integer) IS
  'Records the bridge''s outcome for one claimed outbox row. Acts only on a row still in `sending`, so a retried ack matches nothing and returns no row instead of double-counting the attempt. A failure below the attempt cap returns the row to pending; at the cap it stays failed. service_role only.';

REVOKE EXECUTE ON FUNCTION public.fn_wa_bridge_ack(uuid, text, text, text, integer) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_wa_bridge_ack(uuid, text, text, text, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Grants — every write is service_role, every read is RLS
-- ---------------------------------------------------------------------------
-- ⚠️ `authenticated` MUST be named in the REVOKE, not just anon and PUBLIC.
-- Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES
-- TO anon, authenticated, service_role`, so the moment CREATE TABLE runs,
-- `authenticated` holds its OWN direct INSERT/UPDATE/DELETE grant, independent
-- of PUBLIC, that survives a revoke naming only anon and PUBLIC. Leaving it in
-- place would let any signed-in user insert a row into the outbox — which is to
-- say, send a WhatsApp message from the college's number to any phone they
-- like. (Repo rule; memory feedback_authenticated_holds_a_direct_table_grant_too.)
REVOKE ALL ON public.wa_bridge_outbox  FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.wa_bridge_inbound FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.wa_bridge_status  FROM anon, authenticated, PUBLIC;

GRANT SELECT ON public.wa_bridge_outbox  TO authenticated;
GRANT SELECT ON public.wa_bridge_inbound TO authenticated;
GRANT SELECT ON public.wa_bridge_status  TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.wa_bridge_outbox  TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.wa_bridge_inbound TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.wa_bridge_status  TO service_role;

-- Assert the result rather than trusting the statements above: a grant that did
-- not take is invisible until someone writes a row they should not have been
-- able to write. This fails the migration loudly instead.
DO $assert$
DECLARE
  v_tbl  text;
  v_priv text;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY[
    'public.wa_bridge_outbox', 'public.wa_bridge_inbound', 'public.wa_bridge_status'
  ] LOOP
    FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
      IF has_table_privilege('authenticated', v_tbl, v_priv) THEN
        RAISE EXCEPTION '% is writable by authenticated: % still held', v_tbl, v_priv;
      END IF;
      IF has_table_privilege('anon', v_tbl, v_priv) THEN
        RAISE EXCEPTION '% is writable by anon: % still held', v_tbl, v_priv;
      END IF;
    END LOOP;

    IF has_table_privilege('anon', v_tbl, 'SELECT') THEN
      RAISE EXCEPTION '% is readable by anon', v_tbl;
    END IF;

    -- The grants that MUST be present, so a copy-paste that revoked too much
    -- fails here rather than at the first poll that silently returns nothing.
    IF NOT has_table_privilege('authenticated', v_tbl, 'SELECT') THEN
      RAISE EXCEPTION '% is unreadable by authenticated — the bridge status screen would show nothing', v_tbl;
    END IF;
    IF NOT has_table_privilege('service_role', v_tbl, 'INSERT') THEN
      RAISE EXCEPTION '% cannot be written by service_role — the bridge could never queue or record anything', v_tbl;
    END IF;
  END LOOP;

  -- The claim and ack RPCs are bridge machinery. A signed-in user holding
  -- EXECUTE on either could strand a message in `sending` (never delivered, no
  -- error anywhere) or forge a delivery receipt.
  IF has_function_privilege('authenticated', 'public.fn_wa_bridge_claim_pending(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_wa_bridge_claim_pending is executable by authenticated';
  END IF;
  IF has_function_privilege('anon', 'public.fn_wa_bridge_claim_pending(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_wa_bridge_claim_pending is executable by anon';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_wa_bridge_ack(uuid, text, text, text, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_wa_bridge_ack is executable by authenticated';
  END IF;
  IF has_function_privilege('anon', 'public.fn_wa_bridge_ack(uuid, text, text, text, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_wa_bridge_ack is executable by anon';
  END IF;
END
$assert$;

-- Assert the SHAPE as well as the grants. A constraint that did not take is
-- invisible until the row it should have refused is already in the table and
-- has already been handed to the bridge.
DO $shape$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'wa_bridge_outbox_lead_fk',
    'wa_bridge_outbox_institution_fk',
    'wa_bridge_outbox_created_by_fk',
    'wa_bridge_outbox_type_chk',
    'wa_bridge_outbox_to_phone_chk',
    'wa_bridge_outbox_payload_chk',
    'wa_bridge_outbox_body_len_chk'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.wa_bridge_outbox'::regclass AND conname = v_name
    ) THEN
      RAISE EXCEPTION 'wa_bridge_outbox is missing constraint %', v_name;
    END IF;
  END LOOP;

  FOREACH v_name IN ARRAY ARRAY[
    'wa_bridge_inbound_lead_fk',
    'wa_bridge_inbound_match_status_chk',
    'wa_bridge_inbound_ambiguous_has_no_lead_chk'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.wa_bridge_inbound'::regclass AND conname = v_name
    ) THEN
      RAISE EXCEPTION 'wa_bridge_inbound is missing constraint %', v_name;
    END IF;
  END LOOP;

  -- The type list is a contract with the sender lane, which writes 'media'. The
  -- loop above only proves a constraint of that NAME exists; one listing the
  -- wrong values would pass it and still fail every media send, so the values
  -- themselves are read back.
  IF NOT (
    pg_get_constraintdef(
      (SELECT oid FROM pg_constraint
        WHERE conrelid = 'public.wa_bridge_outbox'::regclass
          AND conname = 'wa_bridge_outbox_type_chk')
    ) LIKE '%media%'
  ) THEN
    RAISE EXCEPTION 'wa_bridge_outbox_type_chk does not accept media — every media send would fail';
  END IF;
END
$shape$;

-- ---------------------------------------------------------------------------
-- 7. RLS — who may LOOK at the queue
-- ---------------------------------------------------------------------------
-- Read-only for `authenticated`, under the standard repo pattern. The bridge
-- does not appear here at all: it authenticates with a shared secret at the API
-- route and the route uses the service-role client, which bypasses RLS by
-- design. RLS here governs the MyJKKN staff screens only.
--
-- The permission key is the existing `admission.settings.whatsapp.view` rather
-- than a new one. These rows carry message bodies sent to and received from
-- prospective learners and their parents, which is exactly the material that
-- key already governs on the WhatsApp settings screens.
--
-- The staff-facing /api/whatsapp-bridge/status route checks that same key
-- ITSELF before reading anything. RLS filters rows; it does not answer
-- questions, and a denied user handed zero rows would be shown "the bridge is
-- dead and the queue is empty" — a confident false statement about the world.
ALTER TABLE public.wa_bridge_outbox  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_bridge_inbound ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_bridge_status  ENABLE ROW LEVEL SECURITY;

-- ⚠️ `institution_id IS NOT NULL` IS LOAD-BEARING, AND IT IS NOT A TIDY-UP.
-- public.role_has_institution_access(uuid) opens with:
--
--     IF check_institution_id IS NULL THEN RETURN true; END IF;
--
-- — verified against the live definition (migration
-- 20261201110000_counselling_code_blank_sibling_guard.sql). So a policy written
-- as `user_has_permission(...) AND role_has_institution_access(institution_id)`
-- makes every NULL-institution row readable by EVERY holder of that permission,
-- at every college. The column's own COMMENT claimed the opposite — "readable
-- only by a super admin or an admin" — so the intended rule shipped as prose
-- while the code did the reverse of it, which is the worst of both: a reviewer
-- reads the comment and agrees.
--
-- A NULL institution is a platform-wide message. Platform-wide is exactly what
-- an ordinary college user should NOT see, so the NULL case is excluded from
-- the permission branch and left to the super-admin/admin branches above it.
DROP POLICY IF EXISTS wa_bridge_outbox_select ON public.wa_bridge_outbox;
CREATE POLICY wa_bridge_outbox_select ON public.wa_bridge_outbox
  FOR SELECT
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR (
      institution_id IS NOT NULL
      AND public.user_has_permission('admission.settings.whatsapp.view')
      AND public.role_has_institution_access(institution_id)
    )
  );

-- wa_bridge_inbound has no institution_id: an inbound message arrives from a
-- phone number, and until it is matched to a lead there is no institution to
-- attribute it to. Scoping it by the matched lead's institution would hide
-- every UNMATCHED message from everyone, which is the opposite of useful — an
-- unmatched message is the one most likely to be someone nobody has answered.
DROP POLICY IF EXISTS wa_bridge_inbound_select ON public.wa_bridge_inbound;
CREATE POLICY wa_bridge_inbound_select ON public.wa_bridge_inbound
  FOR SELECT
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR public.user_has_permission('admission.settings.whatsapp.view')
  );

DROP POLICY IF EXISTS wa_bridge_status_select ON public.wa_bridge_status;
CREATE POLICY wa_bridge_status_select ON public.wa_bridge_status
  FOR SELECT
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR public.user_has_permission('admission.settings.whatsapp.view')
  );
