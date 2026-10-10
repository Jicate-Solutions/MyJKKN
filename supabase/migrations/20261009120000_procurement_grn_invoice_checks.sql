-- ============================================================================
-- Migration: 20261009120000_procurement_grn_invoice_checks
-- Updated: 2026-10-09 - Invoice checks I1-I4 for goods receipts (audit trail +
--                       near-expiry setting). Spec: Draft PR #4289.
-- ============================================================================
-- The invoice checks themselves run APP-SIDE and deterministically
-- (lib/services/procurement/invoice-checks.ts, applied by the GRN form and by
-- ProcurementGrnService.createGrnAgainstPO). The model only reads the PDF. This
-- migration adds only what those checks need to RECORD, plus the one server-side
-- rule the Director asked to be enforced below the app:
--
--   1. procurement_grn.duplicate_confirmed_by / _at  (I1 - who confirmed that a
--      repeated invoice number is genuinely a different invoice, and when)
--   2. procurement_grn.late_invoice_reason           (I4 - why an invoice older than
--      the receiver's limit was accepted)
--   3. platform_policies 'procurement.invoice.near_expiry_days' = 30  (I2 window,
--      one global value, changeable without new code)
--   4. trg_pgrn_00_invoice_checks - a duplicate confirmation is valid only when it is
--      made by the signed-in user themself, that user holds verify rights
--      (super admin / admin / procurement.grn_verify, the same test
--      fn_procurement_guard_approval applies to verifying), and that user is NOT
--      the GRN's received_by. The time is stamped here, never trusted from the
--      client. received_by is pinned to the signed-in user at INSERT and frozen
--      after (admins excepted); created_at is pinned to now() at INSERT and frozen
--      after; supplier_id is always the purchase order's supplier and, with
--      purchase_order_id, frozen after INSERT (admins excepted); invoice_number is
--      frozen once the receipt leaves pending, and changing it while pending voids
--      the confirmation. Institution scope is already enforced by the
--      pgrn_institution_scope RLS policy on the INSERT/UPDATE itself.
--
--   5. I1 HELD SAVE (Director 2026-10-09): a receipt whose invoice number repeats
--      another non-cancelled one from the same supplier that is already POSTED
--      (accepted / partially_accepted / replacement_requested / completed) or was
--      recorded EARLIER is saved, but cannot be VERIFIED (moved into any posted
--      status, 'completed' included) until that confirmation exists. Recording
--      order only decides which of two never-posted receipts is the original.
--      Enforced by extending the existing verify guard,
--      fn_procurement_guard_approval (procurement_grn branch), via
--      fn_procurement_grn_has_duplicate. "Held" is derived live, not stored: a
--      later cancellation of the other receipt releases the hold by itself —
--      cancelling an already-verified receipt needs grn_verify, and so does
--      reviving a cancelled one (cancelled -> any status); a revived receipt is
--      re-judged by the same rule before it can be posted.
--   6. Private bucket procurement-invoice-pdfs for the invoice PDFs the Max-lane
--      runner reads. Read/upload for GRN rights only (grn_create / grn_verify,
--      super admin, admin) AND only under a <po_id>/ folder of a purchase order
--      the caller can see (RLS) - quotation-only managers cannot read it. Delete is
--      admins only. Mirrors the procurement-quotation-pdfs bucket (20260805090000).
--
--   7. Review round 2 (red team) — closing the remaining ways around the I1 hold:
--      a. procurement_grn.first_posted_at, stamped by the server the first time a receipt
--         enters a posted status and never cleared. A receipt that was EVER posted counts
--         for the hold forever (cancelled included) and its invoice number + supplier
--         stay frozen, so cancelling or reopening the original no longer lifts the hold
--         on its repeat.
--      b. trg_pgrn_delete_guard: a receipt that was ever posted, or has a line posted to
--         stock, cannot be deleted except by an admin (a deleted original took the hold
--         with it). The one app delete — receiveReplacement's rollback of the
--         invoice-less receipt it just created, before any stock moved — still works.
--      c. INSERT straight into 'completed' now needs grn_verify like every other posted
--         status (a receiver could insert a 'completed' receipt with a repeated number).
--      d. The I1 check takes a transaction-scoped advisory lock on supplier + normalised
--         number, so two receipts posted at the same moment cannot both pass unseen.
--      e. fn_procurement_grn_has_duplicate answers the trigger for every caller; its
--         permission gate applies only to the page's direct RPC call.
--      f. trg_pgrnr_replacement_checks: a replacement row can be raised only by a
--         verifier, only on a line of a receipt already posted, and for no more than
--         that line rejected — a held receipt cannot reach stock through a forged
--         replacement.
--      g. The invoice-number normaliser also folds compatibility forms (NFKC) and strips
--         invisible characters (zero-width, soft hyphen, bidi and other format marks),
--         from one explicit code-point list shared with the TS normaliser.
--
--   8. Director decisions 10 Oct 2026:
--      D1. The IMS goods-receipt flow (/ims/stock/grn) is retired: every delivery is
--          recorded as a procurement GRN. trg_ims_grn_00_retired refuses a NEW
--          ims_goods_received_notes / ims_grn_items row and any move of an IMS receipt
--          into 'verified' or 'approved' for app users (authenticated / anon). Reads,
--          and cancelling an old receipt, still work. Migrations and the service role
--          are not affected.
--      D2. A receipt with no invoice number cannot be added to stock: the verify guard
--          refuses an UPDATE into a posted status (and an INSERT into any posted status
--          other than 'completed') when the normalised invoice number is empty.
--          Replacement receipts are exempt: they are the one kind of receipt INSERTed
--          straight into 'completed' (receiveReplacement; verifier-only since 7c).
--      D3. procurement_grn_invoice_number_charset: a saved invoice number holds only
--          A-Z, a-z, 0-9, '-' and '/' (NULL allowed, for replacement receipts). The
--          normaliser stays, as defence in depth.
--      D4. Third-person rule: whoever confirms a repeated invoice must not have
--          received EITHER delivery — the held one, or any other receipt it matches
--          (fn_procurement_grn_has_duplicate with p_received_by).
--
--   9. Decisions round — red team (2026-10-10):
--      a. D1: the retired IMS receipts are a kept record. App users can no longer DELETE
--         an IMS receipt or its lines, nor edit a line (institution-only RLS let any
--         signed-in user of the college, students included, do either). Header edits
--         stay limited to what the app does: cancel, notes.
--      b. D2: the "replacement" exemption is tied to a server-checkable marker,
--         procurement_grn.replacement_id, not to the INSERT-into-'completed' shape. It
--         must name a replacement row that is 'received', not yet fulfilled, on a line
--         of a posted receipt of the same purchase order; one receipt per replacement;
--         frozen after INSERT.
--      c. D3: a saved invoice number needs at least one letter or digit ('---' and
--         '/' normalised to blank and could never be verified).
--      d. D4: the third-person question ("did the confirmer receive another delivery
--         with this number?") counts EVERY such receipt — later, unposted and cancelled
--         ones too — and is asked again at the moment of entry into stock, not only when
--         the confirmation is written. Reviving a cancelled receipt voids its
--         confirmation.
--
-- I1 is deliberately NOT a unique index: the Director chose "confirm and allow" for
-- honest resends, which a unique constraint would forbid.
--
-- Idempotent. Safe to re-apply. NOT applied by the PR that adds it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1-2. Audit-trail columns
-- ----------------------------------------------------------------------------
ALTER TABLE public.procurement_grn
  ADD COLUMN IF NOT EXISTS duplicate_confirmed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS duplicate_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS late_invoice_reason text;

COMMENT ON COLUMN public.procurement_grn.duplicate_confirmed_by IS
  'I1: verifier (never received_by) who confirmed a same-supplier, same-number invoice is a different invoice. Validated by trg_pgrn_invoice_checks.';
COMMENT ON COLUMN public.procurement_grn.duplicate_confirmed_at IS
  'I1: when duplicate_confirmed_by confirmed. Stamped by trg_pgrn_invoice_checks.';
COMMENT ON COLUMN public.procurement_grn.late_invoice_reason IS
  'I4: typed reason for accepting an invoice older than the receiver''s max_invoice_age_days.';

-- 7a. Ever posted (review round 2, red team). Server-owned: set by
-- fn_procurement_grn_invoice_checks the first time the receipt is in a posted status,
-- never changed by a client after. Read by fn_procurement_grn_has_duplicate and the
-- delete guard.
ALTER TABLE public.procurement_grn
  ADD COLUMN IF NOT EXISTS first_posted_at timestamptz;

COMMENT ON COLUMN public.procurement_grn.first_posted_at IS
  'I1: when this receipt first entered a posted status (accepted / partially_accepted / replacement_requested / completed). Server-stamped by trg_pgrn_00_invoice_checks, never cleared. An ever-posted receipt counts for the duplicate-invoice hold forever, cancelled included.';

-- Backfill receipts already posted (this runs before the stamping trigger is created on
-- a first apply; on a re-apply the trigger stamps now() instead, which is also non-null).
UPDATE public.procurement_grn
   SET first_posted_at = coalesce(verified_at, updated_at, created_at, now())
 WHERE first_posted_at IS NULL
   AND status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed');

-- 9b. Replacement marker (decisions round, red team). receiveReplacement writes the
-- replacement it fulfils into the header it INSERTs; the verify guard exempts a
-- no-invoice receipt from D2 only when this names a real, claimed, unfulfilled
-- replacement (fn_procurement_guard_approval). One receipt per replacement (unique
-- index). ON DELETE SET NULL: removing a replacement row never blocks on its receipt;
-- the marker is only read at INSERT.
ALTER TABLE public.procurement_grn
  ADD COLUMN IF NOT EXISTS replacement_id uuid
    REFERENCES public.procurement_grn_replacements(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.procurement_grn.replacement_id IS
  'D2: the procurement_grn_replacements row this receipt fulfils (set by receiveReplacement at INSERT, frozen after). Only a receipt carrying a valid one may enter stock with no invoice number.';

CREATE UNIQUE INDEX IF NOT EXISTS procurement_grn_replacement_id_key
  ON public.procurement_grn (replacement_id)
  WHERE replacement_id IS NOT NULL;

-- 8/D3. Invoice numbers hold only letters, digits, '-' and '/' (Director 2026-10-10),
-- with at least one letter or digit (decisions round, red team: '---' or '/' passed
-- the charset but normalised to blank, so the receipt could never be verified).
-- NULL passes (replacement receipts carry none); '' does not. The range classes are
-- exact here: on production (15.6, en_US.UTF-8) and the local check database (16) the
-- pattern matches exactly 64 code points of U+0001-U+FFFF, the 26 + 26 + 10 + 2
-- expected. Production had 0 procurement_grn rows when this was written; if rows exist
-- when it is applied, run
--   SELECT id, invoice_number FROM procurement_grn
--    WHERE invoice_number IS NOT NULL
--      AND invoice_number !~ '^[A-Za-z0-9/-]*[A-Za-z0-9][A-Za-z0-9/-]*$';
-- first — the ADD CONSTRAINT fails loudly on any such row. Dropped and re-added so a
-- database that took an earlier draft of this check (charset only) gets this one.
ALTER TABLE public.procurement_grn
  DROP CONSTRAINT IF EXISTS procurement_grn_invoice_number_charset;
ALTER TABLE public.procurement_grn
  ADD CONSTRAINT procurement_grn_invoice_number_charset
  CHECK (invoice_number IS NULL
         OR invoice_number ~ '^[A-Za-z0-9/-]*[A-Za-z0-9][A-Za-z0-9/-]*$');

-- ----------------------------------------------------------------------------
-- 3. Near-expiry window (I2) - substrate shape of 20260429000002 / ...000011
-- ----------------------------------------------------------------------------
INSERT INTO platform_policies (
  policy_key,
  scope_type,
  scope_id,
  value,
  description,
  data_type,
  enum_options,
  is_system
)
SELECT
  'procurement.invoice.near_expiry_days',
  'global',
  NULL,
  '30'::jsonb,
  'Days before expiry at which a received goods line is WARNED as near-expiry on the Record delivery form (invoice check I2). Already-expired lines are blocked regardless. Read by components/procurement/grn-form.tsx; in-code default 30. Director decision 2026-10-09.',
  'number',
  NULL,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM platform_policies
  WHERE policy_key = 'procurement.invoice.near_expiry_days'
    AND scope_type = 'global'
    AND scope_id IS NULL
);

-- ----------------------------------------------------------------------------
-- 4. Who may confirm a duplicate invoice (I1), enforced in the database
-- ----------------------------------------------------------------------------
-- SECURITY INVOKER, like fn_procurement_guard_approval: it reads nothing of its
-- own; the permission helpers it calls are SECURITY DEFINER already.
--
-- Column rules only (status-transition rules live in fn_procurement_guard_approval):
--   a. received_by is the signed-in user, set at INSERT; only an admin may change it
--      later. The "confirmer is not the receiver" rule below therefore compares
--      against a value the client cannot choose (review round, 2026-10-09).
--   a2. Every column the I1 hold rule reads is server-owned (review round 2):
--      created_at = now() at INSERT and never changes after (it orders "earlier");
--      supplier_id = the purchase order's supplier, looked up here under the
--      caller's RLS, and purchase_order_id / supplier_id are frozen after INSERT
--      (admins excepted, and an admin change re-pins supplier_id from the order).
--      id is client-choosable at INSERT and frozen after; it only breaks an exact
--      created_at tie, i.e. two receipts written in one transaction, and one of
--      them is held either way. status and duplicate_confirmed_by are judged
--      below / by the guard. updated_at, verified_*, invoice_date and notes are
--      not read by the hold rule; invoice_number is rule (b).
--   b. invoice_number / supplier_id are frozen once the receipt is no longer draft /
--      pending_verification; while pending, changing either VOIDS any duplicate
--      confirmation, so a confirmation always belongs to one number + supplier.
--   c. Who may confirm a duplicate (the original rule).
--   d. first_posted_at (review round 2, red team) is the server's: NULL at INSERT, kept
--      from OLD on UPDATE, and stamped now() whenever the row is in a posted status
--      without one. This runs for EVERY caller, the service role included, before
--      anything else, so no client value ever survives. Rule (b) also freezes the
--      invoice number + supplier of an ever-posted receipt, so a posted -> pending
--      round trip cannot reopen them.
--
-- ORDERING IS LOAD-BEARING: this trigger is named trg_pgrn_00_invoice_checks so it
-- fires BEFORE trg_pgrn_guard_approval (Postgres fires same-timing triggers in name
-- order). The guard's I1 check must see the confirmation AFTER rule (b) voided it,
-- and the created_at / supplier_id pinned by rule (a2), never the client's values.
-- A later migration that renames either trigger must keep this one sorting first.
CREATE OR REPLACE FUNCTION public.fn_procurement_grn_invoice_checks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_po_supplier uuid;
BEGIN
  -- d. Ever posted: server-owned for everyone, decided first (no early return above it).
  IF TG_OP = 'INSERT' THEN
    NEW.first_posted_at := NULL;
  ELSE
    NEW.first_posted_at := OLD.first_posted_at;
  END IF;
  IF NEW.status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed') THEN
    NEW.first_posted_at := coalesce(NEW.first_posted_at, now());
  END IF;

  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- a2. Recording time is the server's, never the client's: the hold rule's
  --     "recorded earlier" ordering reads it.
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
  ELSE
    NEW.created_at := OLD.created_at;
    -- id is the hold rule's tie-break: it never changes once recorded.
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'a delivery record''s id cannot be changed'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- a2. The supplier is the order's supplier — the hold is matched on it, so a
  --     receiver cannot dodge a match by naming some other supplier.
  IF TG_OP = 'UPDATE'
     AND (NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
          OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id)
     AND NOT (public.is_super_admin() OR public.is_admin()) THEN
    RAISE EXCEPTION 'the purchase order and supplier of a delivery cannot be changed after it is recorded'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT'
     OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
     OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
    SELECT po.supplier_id INTO v_po_supplier
      FROM public.procurement_purchase_orders po
     WHERE po.id = NEW.purchase_order_id;
    IF v_po_supplier IS NULL THEN
      RAISE EXCEPTION 'purchase order not found for this delivery'
        USING ERRCODE = '42501';
    END IF;
    NEW.supplier_id := v_po_supplier;
  END IF;

  -- a. The receiver is whoever is signed in when the receipt is recorded.
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.received_by := auth.uid();
    END IF;
  ELSE
    IF NEW.received_by IS DISTINCT FROM OLD.received_by
       AND NOT (public.is_super_admin() OR public.is_admin()) THEN
      RAISE EXCEPTION 'the person who received the goods cannot be changed after the delivery is recorded'
        USING ERRCODE = '42501';
    END IF;

    -- 9b. The replacement marker is set at INSERT only (clearing it is harmless: it is
    --     read only at INSERT, and ON DELETE SET NULL clears it).
    IF NEW.replacement_id IS NOT NULL
       AND NEW.replacement_id IS DISTINCT FROM OLD.replacement_id
       AND NOT (public.is_super_admin() OR public.is_admin()) THEN
      RAISE EXCEPTION 'which replacement a delivery fulfils cannot be changed after it is recorded'
        USING ERRCODE = '42501';
    END IF;

    -- 9d. Reviving a cancelled receipt voids its duplicate confirmation (decisions
    --     round, red team): a confirmation given while the receipt was live must not
    --     survive a cancel / post-the-other / revive round trip. A fresh one is needed.
    IF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM 'cancelled' THEN
      NEW.duplicate_confirmed_by := NULL;
      NEW.duplicate_confirmed_at := NULL;
    END IF;

    -- b. A confirmation is tied to one invoice number + supplier.
    IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
       OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
      IF OLD.status NOT IN ('draft', 'pending_verification')
         OR OLD.first_posted_at IS NOT NULL THEN
        RAISE EXCEPTION 'the invoice number and supplier of a delivery cannot be changed once it is verified or cancelled'
          USING ERRCODE = '42501';
      END IF;
      NEW.duplicate_confirmed_by := NULL;
      NEW.duplicate_confirmed_at := NULL;
      RETURN NEW;
    END IF;
  END IF;

  -- No confirmation: nothing to judge. Clearing one is always allowed (stricter).
  IF NEW.duplicate_confirmed_by IS NULL THEN
    NEW.duplicate_confirmed_at := NULL;
    RETURN NEW;
  END IF;

  -- An unchanged confirmation on an unchanged receipt keeps its original stamp.
  IF TG_OP = 'UPDATE'
     AND NEW.duplicate_confirmed_by IS NOT DISTINCT FROM OLD.duplicate_confirmed_by
     AND NEW.received_by IS NOT DISTINCT FROM OLD.received_by THEN
    NEW.duplicate_confirmed_at := OLD.duplicate_confirmed_at;
    RETURN NEW;
  END IF;

  IF NEW.duplicate_confirmed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'a duplicate invoice can only be confirmed by the signed-in verifier themself'
      USING ERRCODE = '42501';
  END IF;

  -- Checked against the stored receiver too (OLD), never only the value sent now.
  IF NEW.duplicate_confirmed_by IS NOT DISTINCT FROM NEW.received_by
     OR (TG_OP = 'UPDATE' AND NEW.duplicate_confirmed_by IS NOT DISTINCT FROM OLD.received_by) THEN
    RAISE EXCEPTION 'the person who received the goods cannot confirm a duplicate invoice — the verifier must'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('procurement.grn_verify')) THEN
    RAISE EXCEPTION 'not authorized to confirm a duplicate invoice — this requires the procurement.grn_verify permission'
      USING ERRCODE = '42501';
  END IF;

  -- D4 (Director 2026-10-10), third-person rule: nor may anyone who received the OTHER
  -- delivery this one repeats. Asked through the SECURITY DEFINER duplicate check, so a
  -- matching receipt at a college the confirmer cannot see still counts. Checked after
  -- the permission test, so only a verifier learns anything from the refusal.
  IF public.fn_procurement_grn_has_duplicate(
       NEW.id, NEW.supplier_id, NEW.invoice_number, NEW.created_at, NEW.duplicate_confirmed_by) THEN
    RAISE EXCEPTION 'you received the other delivery that carries this invoice number — a third person, who received neither, must confirm it'
      USING ERRCODE = '42501';
  END IF;

  NEW.duplicate_confirmed_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_procurement_grn_invoice_checks() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_procurement_grn_invoice_checks() TO authenticated;

-- Old name dropped too (an earlier draft of this migration used it).
DROP TRIGGER IF EXISTS trg_pgrn_invoice_checks ON public.procurement_grn;
DROP TRIGGER IF EXISTS trg_pgrn_00_invoice_checks ON public.procurement_grn;
CREATE TRIGGER trg_pgrn_00_invoice_checks
  BEFORE INSERT OR UPDATE ON public.procurement_grn
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_grn_invoice_checks();

-- ----------------------------------------------------------------------------
-- 5. I1 held save - verify is refused while a detected duplicate is unconfirmed
-- ----------------------------------------------------------------------------
-- Same normalisation as normaliseInvoiceNumber() in
-- lib/services/procurement/invoice-checks.ts: compatibility-folded (NFKC — full-width
-- letters, digits and dashes become their plain forms), case-folded, and every space,
-- dash and INVISIBLE character removed (review round 2, red team: a zero-width space or
-- soft hyphen hidden in a number made a repeat look new while it showed identically on
-- screen). Visible punctuation such as '/' is kept. Empty -> NULL, which never matches.
--
-- The strip set is an explicit code-point list, identical to INVOICE_NUMBER_STRIP in the
-- TS file, because Postgres's [[:space:]] / [[:alnum:]] follow the C library and match no
-- JS class. Uses ARE \u / \U escapes, so the pattern contains no raw special characters:
-- C0 controls + space, hyphen-minus, DEL + C1 controls + no-break space, soft hyphen,
-- combining grapheme joiner, Arabic letter mark, Hangul fillers, Khmer inherent vowels,
-- Mongolian selectors, U+2000-2015 (spaces, zero-widths, bidi marks, dashes),
-- U+2028-202F (separators, bidi embeddings, narrow no-break space), U+205F-2064 (word
-- joiner, invisible operators), U+2066-206F (bidi isolates, deprecated format), minus
-- sign, ideographic space, Hangul filler, variation selectors, BOM, half-width Hangul
-- filler, interlinear annotation marks, tag characters.
CREATE OR REPLACE FUNCTION public.fn_procurement_normalise_invoice_number(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT nullif(
    regexp_replace(
      lower(normalize(coalesce(p_raw, ''), NFKC)),
      '[\u0001-\u0020\u002d\u007f-\u00a0\u00ad\u034f\u061c\u115f\u1160\u1680\u17b4\u17b5\u180b-\u180f\u2000-\u2015\u2028-\u202f\u205f-\u2064\u2066-\u206f\u2212\u3000\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff9-\ufffb\U000e0000-\U000e007f]+',
      '', 'g'),
    '');
$$;

REVOKE EXECUTE ON FUNCTION public.fn_procurement_normalise_invoice_number(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_procurement_normalise_invoice_number(text) TO authenticated;

-- Does another receipt from this supplier carry the same normalised invoice number AND
-- is it either EVER POSTED (now in accepted / partially_accepted / replacement_requested /
-- completed, or first_posted_at set — cancelled included, review round 2 red team: a
-- verifier who received the repeat could otherwise cancel or reopen the stocked original
-- to lift the hold) or a non-cancelled one recorded EARLIER than this one (created_at,
-- then id as the tie-break)? A posted one always counts, whenever it was recorded —
-- so cancelling the original, posting the repeat, then reviving the original holds
-- the original (review round 2). Recording order only decides which of two
-- never-posted receipts is the original: the original is never held by a later,
-- unposted repeat of it — only the repeat is. p_created_at NULL = a receipt not
-- saved yet: every other one counts. created_at, id and supplier_id are
-- server-owned (fn_procurement_grn_invoice_checks, rules a2 and d). SECURITY DEFINER so
-- a duplicate recorded at a college the verifier cannot see still holds the receipt.
-- Called directly (the page's RPC) it answers only a yes/no, and only to procurement
-- users (grn_create / grn_verify / super admin / admin); anyone else gets false. Called
-- from inside a trigger (pg_trigger_depth() > 0 — the verify guard) it always answers:
-- the gate is for the RPC, and must never switch the guard's own check off (review round
-- 2, red team: a caller without procurement rights got "no duplicate" from the guard).
-- D4 (Director 2026-10-10): p_received_by, when given, asks a different question —
-- "did that person receive ANY other receipt from this supplier with this number?",
-- whatever its status or recording time (9d). Called directly, it may only be asked
-- about the caller themself.
-- The 4-argument form is dropped first: with a defaulted 5th argument both would match
-- the 4-named-argument call and PostgREST would refuse it as ambiguous.
DROP FUNCTION IF EXISTS public.fn_procurement_grn_has_duplicate(uuid, uuid, text, timestamptz);
CREATE OR REPLACE FUNCTION public.fn_procurement_grn_has_duplicate(
  p_grn_id uuid,
  p_supplier_id uuid,
  p_invoice_number text,
  p_created_at timestamptz DEFAULT NULL,
  p_received_by uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := public.fn_procurement_normalise_invoice_number(p_invoice_number);
BEGIN
  IF v_key IS NULL OR p_supplier_id IS NULL THEN
    RETURN false;
  END IF;
  IF NOT (coalesce(auth.role(), '') = 'service_role'
          OR pg_trigger_depth() > 0
          OR public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('procurement.grn_create')
          OR public.user_has_permission('procurement.grn_verify')) THEN
    RETURN false;
  END IF;
  IF p_received_by IS NOT NULL
     AND p_received_by IS DISTINCT FROM auth.uid()
     AND NOT (coalesce(auth.role(), '') = 'service_role' OR pg_trigger_depth() > 0) THEN
    RETURN false;
  END IF;
  -- 9d. D4 asks "did this person receive ANY other delivery with this number?": every
  -- status, any recording time — a later, never-posted or cancelled one counts too,
  -- because it can be posted or revived after the confirmation (decisions round, red
  -- team). The hold filter below is for the hold question only.
  IF p_received_by IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.procurement_grn g
       WHERE g.supplier_id = p_supplier_id
         AND g.id IS DISTINCT FROM p_grn_id
         AND g.received_by = p_received_by
         AND public.fn_procurement_normalise_invoice_number(g.invoice_number) = v_key
    );
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.procurement_grn g
     WHERE g.supplier_id = p_supplier_id
       AND g.id IS DISTINCT FROM p_grn_id
       AND public.fn_procurement_normalise_invoice_number(g.invoice_number) = v_key
       AND (g.first_posted_at IS NOT NULL
            OR g.status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed')
            OR (g.status <> 'cancelled'
                AND (p_created_at IS NULL
                     OR g.created_at < p_created_at
                     OR (g.created_at = p_created_at AND g.id < p_grn_id))))
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_procurement_grn_has_duplicate(uuid, uuid, text, timestamptz, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_procurement_grn_has_duplicate(uuid, uuid, text, timestamptz, uuid) TO authenticated;

-- The verify guard, extended. Copied from the live definition (identical to
-- 20271006130000_procurement_final_approval_chain.sql, checked 2026-10-09); the
-- ONLY changes are in the procurement_grn branch:
--   * a move INTO a posted status (accepted / partially_accepted /
--     replacement_requested / completed) from draft, pending_verification or
--     cancelled needs grn_verify. 'completed' and 'cancelled' are new here: before,
--     pending -> completed and cancelled -> accepted were unguarded. An INSERT straight
--     into a posted status needs grn_verify too, 'completed' included (review round 2,
--     red team: a receiver could insert a 'completed' receipt carrying a repeated
--     number). The one app path that inserts 'completed' is receiveReplacement, whose
--     Receive button is shown only to verifiers.
--   * any status change OUT of a posted status (including to cancelled) needs
--     grn_verify — a receiver with grn_create only can no longer cancel an earlier
--     accepted receipt to lift a hold.
--   * reviving a cancelled receipt (cancelled -> any status) needs grn_verify
--     (review round 2). cancelled -> a posted status is the first arm; cancelled ->
--     draft / pending_verification is the third. A revived pending receipt is
--     judged by the same I1 rule below when it is verified.
--   * I1: any entry into a posted status (INSERT or UPDATE) is refused while
--     another same-number receipt that was ever posted, or was recorded earlier,
--     exists and nobody has confirmed it. A replacement receipt carries no invoice
--     number, so it never matches. The check first takes a transaction-scoped advisory
--     lock on supplier + normalised number (review round 2, red team): two receipts
--     entering stock at the same moment are serialised, and the second one's check
--     (a new statement under READ COMMITTED) sees the first once it commits.
-- Re-check the live definition before applying: if another migration has moved it
-- since, merge these blocks into that version instead of applying this copy.
CREATE OR REPLACE FUNCTION public.fn_procurement_guard_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key   text;
  v_what  text;
  v_inv   text;
  v_chain boolean := current_setting('procurement.chain_ok', true) = 'on';
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'procurement_rfqs'
     AND (NEW.status = 'awarded'
          OR (TG_OP = 'UPDATE' AND OLD.status = 'pending_award_approval')) THEN
    IF NOT v_chain AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'not authorized to approve or send back a vendor award — only its final approvers can'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  CASE TG_TABLE_NAME
    WHEN 'procurement_purchase_requests' THEN
      IF NEW.status IN ('approved', 'rejected', 'returned') THEN
        IF TG_OP = 'UPDATE' AND NEW.category_id IS NOT NULL
           AND public.procurement_request_has_chain(NEW.id) THEN
          IF NOT v_chain THEN
            RAISE EXCEPTION 'this request follows its category''s approval steps — use Approve / Send back on the request'
              USING ERRCODE = '42501';
          END IF;
        ELSE
          v_key  := 'procurement.request_approve';
          v_what := 'approve, reject or send back a purchase requisition';
        END IF;
      END IF;
      IF NEW.status = 'returned' THEN
        IF nullif(trim(coalesce(NEW.returned_reason, '')), '') IS NULL THEN
          RAISE EXCEPTION 'say what the requester must change before sending it back'
            USING ERRCODE = '23502';
        END IF;
        NEW.returned_by  := coalesce(NEW.returned_by, auth.uid());
        NEW.returned_at  := now();
        NEW.return_count := coalesce(OLD.return_count, 0) + 1;
      END IF;
      IF NEW.status = 'approved' THEN
        NEW.approved_by := coalesce(NEW.approved_by, auth.uid());
        NEW.approved_at := coalesce(NEW.approved_at, now());
        IF NEW.approved_by IS NULL THEN
          RAISE EXCEPTION 'an approved request must record who approved it'
            USING ERRCODE = '23502';
        END IF;
        IF NOT v_chain AND NEW.requested_by IS NOT DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
          RAISE EXCEPTION 'you cannot approve your own request — another approver must sign it off'
            USING ERRCODE = '42501';
        END IF;
      END IF;
    WHEN 'procurement_rfqs' THEN
      IF NEW.status IN ('approved', 'rejected') THEN
        v_key  := 'procurement.rfq_approve';
        v_what := 'approve or reject an RFQ';
      END IF;
    WHEN 'procurement_purchase_orders' THEN
      IF NEW.status IN ('approved', 'rejected') THEN
        v_key  := 'procurement.po_approve';
        v_what := 'approve or reject a purchase order';
      END IF;
    WHEN 'procurement_grn' THEN
      IF (TG_OP = 'INSERT'
          AND NEW.status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed'))
         OR (TG_OP = 'UPDATE'
             AND NEW.status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed')
             AND OLD.status IN ('draft', 'pending_verification', 'cancelled')) THEN
        v_key  := 'procurement.grn_verify';
        v_what := 'verify a goods receipt note';
      ELSIF TG_OP = 'UPDATE'
            AND OLD.status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed') THEN
        -- Added 2026-10-09 (review round): undoing or re-stating a verified receipt.
        v_key  := 'procurement.grn_verify';
        v_what := 'change the status of a verified goods receipt note';
      ELSIF TG_OP = 'UPDATE' AND OLD.status = 'cancelled' THEN
        -- Added 2026-10-09 (review round 2): reviving a cancelled receipt.
        v_key  := 'procurement.grn_verify';
        v_what := 'restore a cancelled goods receipt note';
      END IF;
      -- Added 2026-10-09 (invoice check I1, held save): a receipt whose invoice
      -- number repeats another from the same supplier that is already posted, or
      -- was recorded earlier, cannot be verified until a verifier other than the
      -- receiver has confirmed it is a different invoice. This runs on EVERY entry
      -- into a posted status from a non-posted one, cancelled included, so a
      -- revived receipt is re-judged. Who may confirm is checked by fn_procurement_grn_invoice_checks,
      -- which fires first (trg_pgrn_00_invoice_checks) and voids a confirmation
      -- whose invoice number or supplier changed.
      -- Review round 2 (red team): the permission refusal comes BEFORE the I1 check, so
      -- a caller without the right to post never learns from the I1 message whether
      -- this supplier's invoice number is already recorded somewhere.
      -- (v_chain is NULL, not false, when the setting was never set: coalesce it.)
      IF v_key IS NOT NULL AND NOT coalesce(v_chain, false)
         AND NOT (is_super_admin() OR is_admin() OR user_has_permission(v_key)) THEN
        RAISE EXCEPTION 'not authorized to % — this requires the % permission', v_what, v_key
          USING ERRCODE = '42501';
      END IF;
      -- D2 (Director 2026-10-10): a receipt with no invoice number never goes into stock.
      -- Replacement receipts are exempt — but only one that names, in replacement_id, a
      -- replacement the server can check (decisions round, red team: the exemption used
      -- to be the INSERT-into-'completed' shape alone, so a verifier could insert any
      -- invoice-less receipt straight into stock). The replacement must be claimed
      -- ('received' — receiveReplacement flips it before inserting the header), not yet
      -- fulfilled, and on a line of a posted receipt of the same purchase order; the
      -- unique index allows one receipt per replacement and rule 9b freezes the marker.
      -- Every other entry into a posted status, the verify UPDATE above all, needs a
      -- number.
      IF NEW.status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed')
         AND (TG_OP = 'INSERT'
              OR OLD.status NOT IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed'))
         AND public.fn_procurement_normalise_invoice_number(NEW.invoice_number) IS NULL
         AND NOT (TG_OP = 'INSERT' AND NEW.status = 'completed'
                  AND NEW.replacement_id IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                      FROM public.procurement_grn_replacements r
                      JOIN public.procurement_grn_items gi ON gi.id = r.grn_item_id
                      JOIN public.procurement_grn pg ON pg.id = gi.grn_id
                     WHERE r.id = NEW.replacement_id
                       AND r.status = 'received'
                       AND r.replacement_grn_item_id IS NULL
                       AND pg.id IS DISTINCT FROM NEW.id
                       AND pg.purchase_order_id = NEW.purchase_order_id
                       AND pg.status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed'))) THEN
        RAISE EXCEPTION 'this delivery has no invoice number, so it cannot be added to stock — cancel it and record the delivery again with the invoice number from the bill'
          USING ERRCODE = '23514';
      END IF;
      IF NEW.status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed')
         AND (TG_OP = 'INSERT'
              OR OLD.status NOT IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed')) THEN
        v_inv := public.fn_procurement_normalise_invoice_number(NEW.invoice_number);
        IF v_inv IS NOT NULL AND NEW.supplier_id IS NOT NULL THEN
          -- Review round 2 (red team): serialise every entry into stock for this
          -- supplier + number, so two at once cannot both pass unseen. Held to commit.
          PERFORM pg_advisory_xact_lock(
            hashtextextended('procurement_grn_i1:' || NEW.supplier_id::text || ':' || v_inv, 0));
          IF NEW.duplicate_confirmed_by IS NULL THEN
            IF public.fn_procurement_grn_has_duplicate(NEW.id, NEW.supplier_id, NEW.invoice_number, NEW.created_at) THEN
              RAISE EXCEPTION 'this delivery''s invoice number repeats another delivery from the same supplier (already in stock, or recorded earlier) — a verifier other than the receiver must confirm it is a different invoice before it is added to stock'
                USING ERRCODE = '42501';
            END IF;
          -- 9d. D4 again at the moment of entry into stock (decisions round, red team):
          -- the confirmation is honoured only while its confirmer received neither this
          -- delivery nor ANY other receipt from this supplier with this number — so a
          -- confirmer cannot pre-confirm, then record / revive / post a matching receipt
          -- of their own.
          ELSIF NEW.duplicate_confirmed_by IS NOT DISTINCT FROM NEW.received_by
                OR public.fn_procurement_grn_has_duplicate(
                     NEW.id, NEW.supplier_id, NEW.invoice_number, NEW.created_at,
                     NEW.duplicate_confirmed_by) THEN
            RAISE EXCEPTION 'the person who confirmed this repeated invoice received one of the deliveries that carry it — a third person, who received neither, must confirm it before it is added to stock'
              USING ERRCODE = '42501';
          END IF;
        END IF;
      END IF;
  END CASE;
  IF v_key IS NULL OR v_chain THEN
    RETURN NEW;
  END IF;
  IF is_super_admin() OR is_admin() OR user_has_permission(v_key) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'not authorized to % — this requires the % permission', v_what, v_key
    USING ERRCODE = '42501';
END;
$function$;

-- ----------------------------------------------------------------------------
-- 7b. A receipt that reached stock cannot be deleted (review round 2, red team)
-- ----------------------------------------------------------------------------
-- pgrn_institution_scope is FOR ALL, so before this anyone with institution access could
-- DELETE a posted original (its lines cascade away); its repeat then had nothing to match
-- and went into stock with no hold. Refused here unless the caller is an admin / the
-- service role, when the receipt was ever posted (first_posted_at), is posted now, or has
-- a line posted to stock (domain_posted_at). One carve-out keeps receiveReplacement's
-- rollback working: the invoice-less receipt the signed-in user just recorded, with no
-- line in stock (the rollback deletes its line first, and only when nothing posted). An
-- invoice-less receipt never takes part in the I1 hold. Draft / pending / never-posted
-- cancelled receipts are unchanged: deleting one is no different from cancelling it.
CREATE OR REPLACE FUNCTION public.fn_procurement_grn_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_line_posted boolean;
BEGIN
  IF coalesce(auth.role(), '') = 'service_role'
     OR public.is_super_admin() OR public.is_admin() THEN
    RETURN OLD;
  END IF;
  v_line_posted := EXISTS (
    SELECT 1 FROM public.procurement_grn_items gi
     WHERE gi.grn_id = OLD.id AND gi.domain_posted_at IS NOT NULL);
  IF NOT (v_line_posted
          OR OLD.first_posted_at IS NOT NULL
          OR OLD.status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed')) THEN
    RETURN OLD;
  END IF;
  IF public.fn_procurement_normalise_invoice_number(OLD.invoice_number) IS NULL
     AND OLD.received_by IS NOT DISTINCT FROM auth.uid()
     AND NOT v_line_posted THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'a delivery that has been checked into stock cannot be deleted — ask an admin'
    USING ERRCODE = '42501';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_procurement_grn_delete_guard() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_procurement_grn_delete_guard() TO authenticated;

DROP TRIGGER IF EXISTS trg_pgrn_delete_guard ON public.procurement_grn;
CREATE TRIGGER trg_pgrn_delete_guard
  BEFORE DELETE ON public.procurement_grn
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_grn_delete_guard();

-- ----------------------------------------------------------------------------
-- 7f. Replacement rows come only from a verified receipt (review round 2, red team)
-- ----------------------------------------------------------------------------
-- pgrnr_parent_scope is FOR ALL with an institution check only, so anyone could insert a
-- 'pending' replacement against a line of a HELD receipt and have it received into stock
-- (receiveReplacement creates an invoice-less 'completed' receipt, which the I1 check
-- cannot match). The only real writer is verifyGrn, which inserts the row while the
-- receipt is in a posted status (provisionally 'accepted'), for the line's rejected
-- quantity. Enforced here for every caller but the service role: a verifier (or admin),
-- a parent receipt in a posted status, and 0 < rejected_quantity <= the line's.
CREATE OR REPLACE FUNCTION public.fn_procurement_grn_replacement_checks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status   text;
  v_rejected numeric;
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NOT (public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('procurement.grn_verify')) THEN
    RAISE EXCEPTION 'not authorized to raise a replacement — this requires the procurement.grn_verify permission'
      USING ERRCODE = '42501';
  END IF;
  SELECT g.status, gi.rejected_quantity INTO v_status, v_rejected
    FROM public.procurement_grn_items gi
    JOIN public.procurement_grn g ON g.id = gi.grn_id
   WHERE gi.id = NEW.grn_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery line not found for this replacement'
      USING ERRCODE = '42501';
  END IF;
  IF v_status NOT IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed') THEN
    RAISE EXCEPTION 'a replacement can only be raised on a delivery that has been checked into stock'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.rejected_quantity IS NULL OR NEW.rejected_quantity <= 0
     OR NEW.rejected_quantity > coalesce(v_rejected, 0) THEN
    RAISE EXCEPTION 'a replacement cannot be for more than the quantity rejected on that line'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_procurement_grn_replacement_checks() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_procurement_grn_replacement_checks() TO authenticated;

DROP TRIGGER IF EXISTS trg_pgrnr_replacement_checks ON public.procurement_grn_replacements;
CREATE TRIGGER trg_pgrnr_replacement_checks
  BEFORE INSERT ON public.procurement_grn_replacements
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_grn_replacement_checks();

-- ----------------------------------------------------------------------------
-- 8/D1. The IMS goods-receipt flow is retired (Director 2026-10-10)
-- ----------------------------------------------------------------------------
-- All goods receipts go through procurement GRNs, which carry the invoice checks.
-- ims_goods_received_notes / ims_grn_items had no triggers and institution-only RLS, so
-- a direct API call could still create or approve an IMS receipt (and approveGRN then
-- wrote stock). For app users (authenticated / anon) this refuses: a new IMS receipt or
-- receipt line, and moving an IMS receipt into 'verified' or 'approved'. Reading,
-- cancelling and other edits of the existing receipts (6 on production, latest
-- 2026-08-22; GRN-260822-00002 is 'verified' and can now never be approved) are
-- unchanged. Migrations and the service role are not app users and are not affected.
CREATE OR REPLACE FUNCTION public.fn_ims_grn_retired_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon')
     OR coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'IMS goods receipts are retired — record the delivery in Procurement → Deliveries (/procurement/grn). Older IMS receipts can still be viewed.'
      USING ERRCODE = '42501';
  END IF;
  -- UPDATE fires only on ims_goods_received_notes (ims_grn_items has no status column;
  -- its trigger is INSERT-only), so NEW.status is read only here.
  IF TG_TABLE_NAME = 'ims_goods_received_notes' THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('verified', 'approved') THEN
      RAISE EXCEPTION 'IMS goods receipts are retired — they can no longer be verified or approved. Record the delivery in Procurement → Deliveries (/procurement/grn).'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ims_grn_retired_guard() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ims_grn_retired_guard() TO authenticated;

DROP TRIGGER IF EXISTS trg_ims_grn_00_retired ON public.ims_goods_received_notes;
CREATE TRIGGER trg_ims_grn_00_retired
  BEFORE INSERT OR UPDATE ON public.ims_goods_received_notes
  FOR EACH ROW EXECUTE FUNCTION public.fn_ims_grn_retired_guard();

DROP TRIGGER IF EXISTS trg_ims_grn_items_00_retired ON public.ims_grn_items;
CREATE TRIGGER trg_ims_grn_items_00_retired
  BEFORE INSERT ON public.ims_grn_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_ims_grn_retired_guard();

-- ----------------------------------------------------------------------------
-- 6. Private bucket for the supplier invoice PDFs (mirrors 20260805090000)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'procurement-invoice-pdfs',
  'procurement-invoice-pdfs',
  false,
  15728640, -- 15 MB — matches the extract-invoice route limit
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Upload: people who record or verify deliveries (or admins) only, and only into
-- the folder of an order they can see.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'procurement_invoice_pdfs_insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "procurement_invoice_pdfs_insert"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'procurement-invoice-pdfs'
        AND (
          public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('procurement.grn_create')
          OR public.user_has_permission('procurement.grn_verify')
        )
        -- Only under <po_id>/ of an order the caller can see (the subquery runs
        -- under the caller's RLS on procurement_purchase_orders). CASE keeps the
        -- uuid cast from ever running on a name that is not one.
        AND CASE
              WHEN (storage.foldername(objects.name))[1]
                   ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN EXISTS (
                SELECT 1 FROM public.procurement_purchase_orders po
                 WHERE po.id = ((storage.foldername(objects.name))[1])::uuid
              )
              ELSE false
            END
      )
    $policy$;
  END IF;
END $$;

-- Read: same gate, same folder rule. NOT public, and NOT quotation_manage — supplier bills.
-- (The Max-lane runner reads with the service role, which bypasses RLS.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'procurement_invoice_pdfs_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "procurement_invoice_pdfs_read"
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'procurement-invoice-pdfs'
        AND (
          public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('procurement.grn_create')
          OR public.user_has_permission('procurement.grn_verify')
        )
        -- Only under <po_id>/ of an order the caller can see (the subquery runs
        -- under the caller's RLS on procurement_purchase_orders). CASE keeps the
        -- uuid cast from ever running on a name that is not one.
        AND CASE
              WHEN (storage.foldername(objects.name))[1]
                   ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN EXISTS (
                SELECT 1 FROM public.procurement_purchase_orders po
                 WHERE po.id = ((storage.foldername(objects.name))[1])::uuid
              )
              ELSE false
            END
      )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'procurement_invoice_pdfs_delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "procurement_invoice_pdfs_delete"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'procurement-invoice-pdfs'
        -- Admins only (review round, 2026-10-09): the route never deletes, and a
        -- delete + re-upload at the same content-addressed key would swap the bytes.
        AND (public.is_super_admin() OR public.is_admin())
      )
    $policy$;
  END IF;
END $$;
