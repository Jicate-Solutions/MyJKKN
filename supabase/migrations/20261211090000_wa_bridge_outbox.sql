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

  CONSTRAINT wa_bridge_outbox_status_chk
    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  CONSTRAINT wa_bridge_outbox_type_chk
    CHECK (type IN ('text', 'image', 'document', 'video', 'audio'))
);

COMMENT ON TABLE public.wa_bridge_outbox IS
  'Work queue the on-campus WhatsApp bridge polls. One row per message MyJKKN wants sent. The bridge claims rows (status pending → sending) and posts the outcome back; nothing in MyJKKN ever calls the bridge directly, because it sits behind campus NAT.';
COMMENT ON COLUMN public.wa_bridge_outbox.status IS
  'pending = unclaimed. sending = claimed by a poll, outcome unknown. sent = the bridge confirmed WhatsApp accepted it. failed = the bridge reported failure and attempts is exhausted. A failure with attempts still under the cap returns to pending rather than staying failed.';
COMMENT ON COLUMN public.wa_bridge_outbox.attempts IS
  'Acknowledged attempts, incremented by the ack, not by the claim. A row claimed by a poll that then died is left in sending and is NOT counted — see the stale-claim note on fn_wa_bridge_claim_pending.';
COMMENT ON COLUMN public.wa_bridge_outbox.institution_id IS
  'The institution this message belongs to, used by RLS (role_has_institution_access). NULL means platform-wide and is readable only by a super admin or an admin — the bridge itself does not read through RLS at all.';

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
  -- NULL means the number belongs to nobody we know — kept, not discarded,
  -- because an unmatched inbound message is still someone trying to reach us.
  lead_id         UUID,

  received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_wa_bridge_inbound_wa_message_id UNIQUE (wa_message_id)
);

COMMENT ON TABLE public.wa_bridge_inbound IS
  'Messages the on-campus WhatsApp bridge received, one row per WhatsApp message. Separate from wa_personal_message_logs because the bridge has no wa_personal_connections row and no department. UNIQUE on wa_message_id so the bridge''s retries cannot double-record one message.';

CREATE INDEX IF NOT EXISTS idx_wa_bridge_inbound_lead
  ON public.wa_bridge_inbound (lead_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_bridge_inbound_received
  ON public.wa_bridge_inbound (received_at DESC);

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
ALTER TABLE public.wa_bridge_outbox  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_bridge_inbound ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_bridge_status  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_bridge_outbox_select ON public.wa_bridge_outbox;
CREATE POLICY wa_bridge_outbox_select ON public.wa_bridge_outbox
  FOR SELECT
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR (
      public.user_has_permission('admission.settings.whatsapp.view')
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
