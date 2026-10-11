-- ============================================================================
-- Migration: 20271010170000_procurement_grn_invoice_checks
-- Updated: 2026-10-09 - Invoice checks I1-I4 for goods receipts (audit trail +
--                       near-expiry setting). Spec: Draft PR #4289.
-- Updated: 2026-10-11 - Director decision 11 Oct 02:00: replacements need two people
--                       (section 15, R2). receiveReplacement saves the replacement
--                       receipt as pending; a different verifier checks it into stock.
-- Updated: 2026-10-10 - Renamed from 20261009120000_procurement_grn_invoice_checks.sql
--                       (deep-panel round 2, #4333 H1). This file CREATE OR REPLACEs
--                       fn_procurement_guard_approval, last defined on main by
--                       20271006130000_procurement_final_approval_chain.sql; the old
--                       2026 version sorted BEFORE that file, so any replay (db reset,
--                       branch / preview DB) re-applied the 2027 guard last and dropped
--                       every block added here. 20271010170000 sorts after that file,
--                       after the newest file on main (20271010090000) and after the
--                       newest production ledger row (20271010100000) when renamed.
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
--      after (admins included since E1; service role only); created_at is pinned to now() at INSERT and frozen
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
--          Replacement receipts are exempt, but only when replacement_id names a real,
--          claimed, unfulfilled replacement (9b; receiveReplacement, verifier-only).
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
--  10. Director decisions 10 Oct 2026 (afternoon):
--      E1. Self-check banned. Whoever received a delivery (procurement_grn.received_by)
--          never checks it into stock, whatever their rights — admins and super admins
--          included; only the service role is exempt. The verify guard refuses any entry
--          into a posted status by the receiver (stored or new received_by); an INSERT
--          straight into stock is refused unless it is a valid replacement receipt;
--          received_by is now frozen for admins too. Replacement arm: whoever received
--          the ORIGINAL delivery may neither claim its replacement
--          (trg_pgrnr_replacement_checks, now BEFORE INSERT OR UPDATE) nor insert the
--          replacement receipt.
--      E2. fn_ims_grn_retired_guard lets an app user cancel a 'verified' IMS receipt
--          (status -> 'cancelled' + updated_at, what cancelGRN writes) — but only one
--          holding ims.stock.grn.edit (or a super admin), the right the IMS page asks
--          for, and never an 'approved' one (its stock is already on hand). The same
--          right is needed to edit notes. GRN-260822-00002 is cancelled through the app
--          after go-live by such a person.
--      E1 red team. A replacement's line and quantity are frozen once raised
--          (trg_pgrnr_replacement_checks); the lines of a checked delivery are frozen
--          (trg_pgrni_00_posted_lock): no line added, no quantity changed, no posted
--          line re-opened, so its receiver cannot add goods nobody else checked.
--
--  11. Deep-panel round 1 (2026-10-10, PR #4296 M3): trg_ai_jobs_00_invoice_extract_guard.
--      fn_ai_enqueue stores whatever payload its caller sends, so anyone with
--      grn_create could enqueue procurement.invoice_extract directly (bypassing the
--      extract-invoice route) and point the service-role runner at another bucket or
--      path. On INSERT of that one job type the payload is pinned: storage_bucket is
--      FORCED to procurement-invoice-pdfs, storage_path must be exactly
--      <po_id>/<sha256>.pdf matching payload.po_id and payload.sha256, and the object
--      must already be stored there (its upload policy, section 6, ties the folder to
--      an order the uploader can see). Other job types are untouched.
--
--  12. Deep-panel round 2 (2026-10-10, PR #4333 comment 6098066712):
--      H1. Renumbered to 20271010170000 so it is applied after
--          20271006130000_procurement_final_approval_chain.sql (see the header).
--      H2. trg_pgrnr_replacement_checks INSERT: the delivery line is locked FOR UPDATE,
--          a new replacement starts 'pending' with no fulfilment link, and all the
--          replacements raised on a line together never exceed what that line rejected
--          (before, each one was checked alone, so a retried verifyGrn could raise N).
--      M3. trg_pgrni_delete_guard: a delivery line that is in stock, or belongs to a
--          receipt that was ever posted, cannot be deleted except by an admin — the same
--          rule and the same receiveReplacement-rollback carve-out as the header's
--          delete guard (deleting the posted line first used to unlock the header one).
--      M4. trg_pgrni_00_posted_lock reads the parent receipt FOR SHARE on INSERT and
--          UPDATE, so a line cannot be added or changed while a verifier is posting it.
--      M5. fn_procurement_grn_has_duplicate, called directly (pg_trigger_depth() = 0),
--          answers only about a SAVED receipt of a college the caller can access, and
--          uses that receipt's stored supplier, number and recording time (the
--          caller's arguments are ignored). Inside the triggers it is unchanged (global).
--      M6. trg_ai_jobs_00_invoice_extract_guard also fires on UPDATE OF payload,
--          job_type and freezes both for app users.
--      L7. Storage policies are dropped and re-created, and the bucket's settings are
--          re-stated, so a database holding an earlier draft gets these ones.
--      L9. fn_ims_grn_retired_guard also refuses app users reaching the tables through
--          a SECURITY DEFINER function (auth.role() authenticated / anon).
--      L10. invoice_number is trimmed, and a blank one stored as NULL, before the
--          charset check runs (a form sending '' got a raw 23514).

--  13. Deep-panel round 2, skeptic re-check (2026-10-11):
--      H2. A replacement row cannot be deleted except by an admin / the service role
--          (trg_pgrnr_delete_guard), so the "all replacements on a line <= its rejected
--          quantity" total cannot be emptied and raised again. A fulfilled replacement
--          stays fulfilled: its link (replacement_grn_item_id) is written once, to a line
--          of the receipt naming it, and received -> pending (receiveReplacement's
--          rollback) needs grn_verify and is refused while any receipt names it. The
--          receipt's replacement_id can no longer be cleared (rule 9b, admins excepted).
--          App roles lose TRUNCATE on the GRN and IMS receipt tables (no row trigger).
--      M5. fn_procurement_grn_has_duplicate, called directly, answers about every college
--          only for an admin or a verifier who did not receive the receipt; anyone else
--          (its receiver above all) about the colleges they can open. Only the receiver
--          (or an admin) may change a saved receipt's invoice number (rule b). In the
--          verify guard the E1 self-check now runs BEFORE D2 / I1, and an INSERT into
--          stock must carry no invoice number, so a refused INSERT no longer tells a
--          verifier whether a guessed number is held.
--      M4. verifyGrn re-reads the lines after the header is posted (from then on the
--          lines are frozen) and reopens the receipt if they differ from what was checked
--          (lib/services/procurement/grn-service.ts).
--
--  14. Deep-panel round 3 (2026-10-11, PR #4333 comment 6098066712, #4342 6101285504):
--      D-M1. trg_pgrni_00_posted_lock freezes EVERY column of a line of a checked delivery
--          (unit price, batch, expiry, manufacturing date, serials ... not only the
--          quantities), apart from the two posting marks. domain_item_id may still go
--          NULL -> a value on a line not yet in stock, but only by a verifier (or admin)
--          who did not receive the delivery — never by its receiver.
--      D-M3. The charset CHECK is added NOT VALID after the stored numbers are tidied the
--          way the trigger tidies new ones, and validated only when no row breaks it (a
--          WARNING names the count otherwise), so the apply cannot fail on old data.
--      D-L5. A line INSERT locks its receipt FOR UPDATE at once (no FOR SHARE -> FOR UPDATE
--          upgrade, which deadlocked two line inserts on one receipt with 40P01).
--      D-L6. trg_ai_jobs_00_invoice_extract_guard refuses a read for a purchase order of a
--          college the requester cannot open (super admin / admin excepted), before it
--          says whether the PDF is stored.
--      D-L7. A DO block refuses to replace fn_procurement_guard_approval unless the live
--          body is the 20271006130000 one (md5 of prosrc) or this file's own (its
--          "guard-version" marker): a hotfix to any other branch is never silently undone.
--      D-L9. The column comments name trg_pgrn_00_invoice_checks.
--      D-L10. The invoice-number tidy-up also drops invisible format characters anywhere
--          (zero-width, soft hyphen, BOM, bidi marks) and trims Unicode spaces (no-break
--          space ...); a number that still breaks the charset gets a plain message.
--      S-M2. fn_procurement_grn_has_duplicate, called directly with p_received_by, also
--          answers about the receipt's stored CONFIRMER — only for a caller who may confirm
--          it (admin, or a verifier who did not receive it) — so verify-time D4 no longer
--          reads the caller's RLS-capped view.
--      S-M5. I2 in the database: entering a posted status is refused while the receipt has
--          a line accepting goods whose expiry date is before today in IST (verify guard,
--          G8), and a replacement line is refused on the same test (line trigger). I4 is
--          NOT enforced here: the age limit is declared by the receiver on the form and is
--          kept only in the notes text, so a receiver writing straight to the API could
--          simply declare no limit. I4 stays an app-side check; the reason is recorded.
--      S-L9. The AI-job guard writes payload._dedupe = <requested_by>:<po_id>:<sha256>, so
--          the existing ai_jobs_inflight_dedupe_idx refuses a second in-flight read of the
--          same PDF by the same person (two clicks at once used to queue two reads).
--
--  15. Director decision 11 Oct 2026 02:00 — a REPLACEMENT delivery also needs TWO people:
--      R2. receiveReplacement saves the replacement receipt as PENDING (not straight into
--          stock). A different verifier — not the person who recorded it (received_by)
--          and never the original delivery's receiver — checks it into stock through the
--          normal verify path (verifyGrn). In the database:
--          * the verify guard refuses every INSERT into a posted status by an app user
--            (authenticated / anon / any signed-in uid) — the replacement carve-out is
--            gone; the service role and migrations are unaffected;
--          * the D2 no-invoice exemption moved from INSERT to verify: an UPDATE from
--            pending into any posted status may carry no invoice number when
--            replacement_id names a claimed, unfulfilled replacement of a posted receipt
--            of the same purchase order;
--          * at that verify, the original delivery's receiver is refused, and the
--            receipt must hold exactly one line, for the rejected item's order line,
--            rejecting nothing and accepting 0 < qty <= the quantity awaiting replacement
--            (its lines were editable while it was pending);
--          * a receipt naming a replacement is checked when it is RECORDED too (rule 9b,
--            fn_procurement_grn_invoice_checks): grn_verify, not the original receiver,
--            a claimed and unfulfilled replacement of a posted receipt of the same order;
--          * the fulfilment link (replacement_grn_item_id) is written by verifyGrn and
--            only to a line of the receipt naming it once that receipt is posted;
--          * trg_pgrni_00_posted_lock no longer lets anyone add a line to a posted
--            receipt (the single-line replacement carve-out is gone);
--          * while a replacement receipt is pending, only whoever recorded it (or an
--            admin) adds its line or changes its quantities (trg_pgrni_00_posted_lock);
--          * the delete guards' "invoice-less receipt I just recorded" carve-out is gone
--            (that receipt is now pending when it is rolled back); a pending replacement
--            receipt and its line can be deleted only by whoever recorded it, or an admin;
--          * app users cannot cancel a replacement receipt: a cancelled one would keep
--            its replacement claimed for good. An admin removes a wrong one instead.
--          Exactly-once is unchanged: the pending -> received claim is the mutex, one
--          receipt per replacement (unique index), the receipt's own pending -> posted
--          update is the verify mutex, and the link is written once.
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
  'I1: verifier (never received_by) who confirmed a same-supplier, same-number invoice is a different invoice. Validated by trg_pgrn_00_invoice_checks.';
COMMENT ON COLUMN public.procurement_grn.duplicate_confirmed_at IS
  'I1: when duplicate_confirmed_by confirmed. Stamped by trg_pgrn_00_invoice_checks.';
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
-- replacement it fulfils into the (pending) header it INSERTs; the verify guard exempts a
-- no-invoice receipt from D2 at verify only when this names a real, claimed, unfulfilled
-- replacement (fn_procurement_guard_approval, R2 2026-10-11). One receipt per replacement
-- (unique index). ON DELETE SET NULL: removing a replacement row never blocks on its
-- receipt.
ALTER TABLE public.procurement_grn
  ADD COLUMN IF NOT EXISTS replacement_id uuid
    REFERENCES public.procurement_grn_replacements(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.procurement_grn.replacement_id IS
  'D2: the procurement_grn_replacements row this receipt fulfils (set by receiveReplacement at INSERT, frozen after). Only a receipt carrying a valid one may be verified into stock with no invoice number (R2: replacements need two people).';

CREATE UNIQUE INDEX IF NOT EXISTS procurement_grn_replacement_id_key
  ON public.procurement_grn (replacement_id)
  WHERE replacement_id IS NOT NULL;

-- 8/D3. Invoice numbers hold only letters, digits, '-' and '/' (Director 2026-10-10),
-- with at least one letter or digit (decisions round, red team: '---' or '/' passed
-- the charset but normalised to blank, so the receipt could never be verified).
-- NULL passes (replacement receipts carry none); '' does not. The range classes are
-- exact here: on production (15.6, en_US.UTF-8) and the local check database (16) the
-- pattern matches exactly 64 code points of U+0001-U+FFFF, the 26 + 26 + 10 + 2
-- expected. Dropped and re-added so a database that took an earlier draft of this check
-- (charset only) gets this one.
--
-- D-M3 (deep-panel round 3): safe on any existing data. Production had 0 procurement_grn
-- rows on 2026-10-11 (checked), but a row saved before go-live with '' or a padded
-- number would have failed the ADD CONSTRAINT and with it the whole apply. So:
--   1. stored numbers are tidied exactly as fn_procurement_grn_invoice_checks tidies new
--      ones (invisible characters dropped, spaces trimmed, blank -> NULL). On a first
--      apply that trigger does not exist yet; on a re-apply it has tidied every write
--      already, so this matches no row;
--   2. the CHECK is added NOT VALID — it binds every new INSERT / UPDATE at once;
--   3. it is VALIDATEd only when no stored row breaks it. Otherwise a WARNING gives the
--      count and the CHECK stays NOT VALID; list the rows with
--        SELECT id, invoice_number FROM procurement_grn
--         WHERE invoice_number IS NOT NULL
--           AND invoice_number !~ '^[A-Za-z0-9/-]*[A-Za-z0-9][A-Za-z0-9/-]*$';
--      correct them, then run ALTER TABLE public.procurement_grn VALIDATE CONSTRAINT
--      procurement_grn_invoice_number_charset.
-- The tidy-up expression is fn_procurement_tidy_invoice_number, shared with the trigger.
CREATE OR REPLACE FUNCTION public.fn_procurement_tidy_invoice_number(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  -- D-L10: invisible format characters are dropped anywhere (soft hyphen, combining
  -- grapheme joiner, Arabic letter mark, Mongolian vowel separator, zero-width space /
  -- non-joiner / joiner, LRM / RLM, bidi embeddings and isolates, word joiner, invisible
  -- operators, BOM) — they cannot be seen, so dropping them changes nothing a person
  -- typed. Then spaces of every kind (ASCII whitespace, no-break space, ogham space,
  -- U+2000-200A, line / paragraph separators, narrow no-break space, medium mathematical
  -- space, ideographic space) are trimmed from both ends. Blank -> NULL. A space INSIDE a
  -- number is kept, so the charset still refuses it, with the trigger's plain message.
  SELECT nullif(
    regexp_replace(
      regexp_replace(
        coalesce(p_raw, ''),
        '[\u00ad\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff]+',
        '', 'g'),
      '^[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$',
      '', 'g'),
    '');
$$;

REVOKE EXECUTE ON FUNCTION public.fn_procurement_tidy_invoice_number(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_procurement_tidy_invoice_number(text) TO authenticated;

UPDATE public.procurement_grn
   SET invoice_number = public.fn_procurement_tidy_invoice_number(invoice_number)
 WHERE invoice_number IS DISTINCT FROM public.fn_procurement_tidy_invoice_number(invoice_number);

ALTER TABLE public.procurement_grn
  DROP CONSTRAINT IF EXISTS procurement_grn_invoice_number_charset;
ALTER TABLE public.procurement_grn
  ADD CONSTRAINT procurement_grn_invoice_number_charset
  CHECK (invoice_number IS NULL
         OR invoice_number ~ '^[A-Za-z0-9/-]*[A-Za-z0-9][A-Za-z0-9/-]*$')
  NOT VALID;

DO $$
DECLARE
  v_bad bigint;
BEGIN
  SELECT count(*) INTO v_bad
    FROM public.procurement_grn
   WHERE invoice_number IS NOT NULL
     AND invoice_number !~ '^[A-Za-z0-9/-]*[A-Za-z0-9][A-Za-z0-9/-]*$';
  IF v_bad = 0 THEN
    ALTER TABLE public.procurement_grn VALIDATE CONSTRAINT procurement_grn_invoice_number_charset;
  ELSE
    RAISE WARNING 'procurement_grn_invoice_number_charset added NOT VALID: % stored invoice number(s) hold characters other than letters, digits, ''-'' and ''/''. New writes are checked; correct those rows, then VALIDATE CONSTRAINT.', v_bad;
  END IF;
END $$;

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
--   a. received_by is the signed-in user, set at INSERT; nobody but the service role
--      may change it later (E1, 2026-10-10 afternoon: admins included). The "confirmer is not the receiver" rule below therefore compares
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
  -- L10 (deep-panel round 2): an untrimmed or blank invoice number is tidied here, for
  -- every caller, before procurement_grn_invoice_number_charset is checked (CHECK
  -- constraints run after BEFORE ROW triggers): '' and '   ' become NULL (a pending
  -- receipt with no number, which D2 still keeps out of stock) and surrounding spaces,
  -- tabs and line breaks are dropped. Rule (b) below therefore sees ' INV-1 ' and
  -- 'INV-1' as the same number.
  -- D-L10 (deep-panel round 3): the same tidy-up also drops invisible characters (a
  -- zero-width space or BOM pasted from a PDF) and trims every kind of space (a no-break
  -- space), via fn_procurement_tidy_invoice_number; what is still outside the charset is
  -- refused here in plain words instead of a raw constraint error.
  NEW.invoice_number := public.fn_procurement_tidy_invoice_number(NEW.invoice_number);
  IF NEW.invoice_number IS NOT NULL
     AND NEW.invoice_number !~ '^[A-Za-z0-9/-]*[A-Za-z0-9][A-Za-z0-9/-]*$'
     AND (TG_OP = 'INSERT' OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number) THEN
    RAISE EXCEPTION 'an invoice number may hold only letters, digits, ''-'' and ''/'' (with at least one letter or digit) — check it against the bill and type it again'
      USING ERRCODE = '23514';
  END IF;

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
    -- R2 (Director 2026-10-11): a receipt naming a replacement is that replacement's one
    -- receipt (unique index), so it is checked when it is recorded, not only when it is
    -- verified: recorded by a verifier (claiming needs grn_verify) who did not receive the
    -- original delivery, for a claimed, unfulfilled replacement raised on a posted receipt
    -- of the same purchase order. Otherwise anyone at the college could take the slot.
    IF NEW.replacement_id IS NOT NULL AND auth.uid() IS NOT NULL THEN
      IF NOT (public.is_super_admin() OR public.is_admin()
              OR public.user_has_permission('procurement.grn_verify')) THEN
        RAISE EXCEPTION 'not authorized to record a replacement — this requires the procurement.grn_verify permission'
          USING ERRCODE = '42501';
      END IF;
      IF NOT EXISTS (
           SELECT 1
             FROM public.procurement_grn_replacements r
             JOIN public.procurement_grn_items gi ON gi.id = r.grn_item_id
             JOIN public.procurement_grn pg ON pg.id = gi.grn_id
            WHERE r.id = NEW.replacement_id
              AND r.status = 'received'
              AND r.replacement_grn_item_id IS NULL
              AND pg.purchase_order_id = NEW.purchase_order_id
              AND pg.status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed')) THEN
        RAISE EXCEPTION 'this replacement is not open for receiving — refresh the delivery and try again'
          USING ERRCODE = '42501';
      END IF;
      IF EXISTS (
           SELECT 1
             FROM public.procurement_grn_replacements r
             JOIN public.procurement_grn_items gi ON gi.id = r.grn_item_id
             JOIN public.procurement_grn pg ON pg.id = gi.grn_id
            WHERE r.id = NEW.replacement_id
              AND pg.received_by IS NOT DISTINCT FROM auth.uid()) THEN
        RAISE EXCEPTION 'you received the original delivery, so someone else must receive and check its replacement'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSE
    -- E1 (Director 2026-10-10 afternoon): frozen for admins too. The self-check ban
    -- compares the checker with received_by, so nobody but the service role may move it
    -- (an admin who received a delivery could otherwise rename the receiver, then check
    -- it). No app path changes it after INSERT.
    IF NEW.received_by IS DISTINCT FROM OLD.received_by THEN
      RAISE EXCEPTION 'the person who received the goods cannot be changed after the delivery is recorded'
        USING ERRCODE = '42501';
    END IF;

    -- 9b. The replacement marker is set at INSERT only. H2 round 3 (skeptic): clearing
    --     it is refused too — trg_pgrnr_replacement_checks lets a claimed replacement be
    --     reopened only while no receipt names it, so a cleared marker would let the
    --     same rejected goods be received twice. (ON DELETE SET NULL still clears it when
    --     an admin deletes the replacement row.)
    IF NEW.replacement_id IS DISTINCT FROM OLD.replacement_id
       AND NOT (public.is_super_admin() OR public.is_admin()) THEN
      RAISE EXCEPTION 'which replacement a delivery fulfils cannot be changed after it is recorded'
        USING ERRCODE = '42501';
    END IF;

    -- R2 (Director 2026-10-11): a replacement receipt is not cancelled by app users. A
    -- cancelled one would keep its replacement claimed with no way to receive it again
    -- (the claim reopens only while no receipt names it). An admin can sort it out.
    IF OLD.replacement_id IS NOT NULL
       AND NEW.status = 'cancelled'
       AND OLD.status IS DISTINCT FROM 'cancelled'
       AND NOT (public.is_super_admin() OR public.is_admin()) THEN
      RAISE EXCEPTION 'a replacement delivery cannot be cancelled — if the goods are wrong, ask an admin to remove it so the replacement can be received again'
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
      -- M5 round 3 (skeptic): only the person who received it (or an admin) may correct
      -- the number. The duplicate check answers a non-receiver verifier about every
      -- college, so letting that verifier also re-number someone else's receipt made one
      -- account enough to probe another college's invoice numbers. No app path changes
      -- the number after the receipt is saved.
      IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
         AND NOT (public.is_super_admin() OR public.is_admin())
         AND (auth.uid() IS NULL OR OLD.received_by IS DISTINCT FROM auth.uid()) THEN
        RAISE EXCEPTION 'only the person who received this delivery can change its invoice number'
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
-- unposted repeat of it — only the repeat is. p_created_at NULL (trigger callers only,
-- see M5) = every other one counts. created_at, id and supplier_id are
-- server-owned (fn_procurement_grn_invoice_checks, rules a2 and d). SECURITY DEFINER so
-- a duplicate recorded at a college the verifier cannot see still holds the receipt.
-- Called directly (the page's RPC) it answers only a yes/no, and only to procurement
-- users (grn_create / grn_verify / super admin / admin); anyone else gets false.
-- M5 (deep-panel round 2): called directly it also answers only about a SAVED receipt
-- (p_grn_id) of a college the caller can access (role_has_institution_access, or
-- super admin / admin), and it reads that receipt's STORED supplier_id, invoice_number
-- and created_at — the caller's p_supplier_id / p_invoice_number / p_created_at are
-- ignored. Before, any grn_create user could pass any supplier and number with
-- p_created_at NULL and learn whether it exists at any college. Now asking needs a
-- saved receipt at one's own college whose supplier is pinned to its purchase order
-- (rule a2), i.e. an audited row. The MATCH itself stays global on purpose: the verify
-- guard holds a receipt on a repeat at another college, and the receipt page offers
-- "This is a different invoice" only when this answer is yes (it says the other one is
-- "recorded at a college you cannot open"), so a scoped answer would leave such a
-- receipt held with no way to confirm it. All app callers pass a saved receipt. Called
-- from inside a trigger (pg_trigger_depth() > 0 — the verify guard) it always answers:
-- the gate is for the RPC, and must never switch the guard's own check off (review round
-- 2, red team: a caller without procurement rights got "no duplicate" from the guard).
-- D4 (Director 2026-10-10): p_received_by, when given, asks a different question —
-- "did that person receive ANY other receipt from this supplier with this number?",
-- whatever its status or recording time (9d). Called directly, it may be asked about the
-- caller themself, or (S-M2, deep-panel round 3) about the receipt's STORED confirmer
-- (duplicate_confirmed_by) by a caller who may confirm it — an admin, or a verifier who did
-- not receive it, the same people who get the global hold answer. verifyGrn asks it
-- before posting, so verify-time D4 no longer rests on the caller's RLS-capped view.
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
  v_supplier uuid        := p_supplier_id;
  v_number   text        := p_invoice_number;
  v_created  timestamptz := p_created_at;
  v_inst     uuid;
  v_receiver uuid;
  v_confirmer uuid;
  v_key      text;
  v_scoped   boolean := false;
BEGIN
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR pg_trigger_depth() > 0) THEN
    -- The page's direct call.
    IF NOT (public.is_super_admin() OR public.is_admin()
            OR public.user_has_permission('procurement.grn_create')
            OR public.user_has_permission('procurement.grn_verify')) THEN
      RETURN false;
    END IF;
    -- M5: a saved receipt of a college the caller can access, judged on its stored values.
    IF p_grn_id IS NULL THEN
      RETURN false;
    END IF;
    SELECT g.supplier_id, g.invoice_number, g.created_at, g.institution_id, g.received_by,
           g.duplicate_confirmed_by
      INTO v_supplier, v_number, v_created, v_inst, v_receiver, v_confirmer
      FROM public.procurement_grn g
     WHERE g.id = p_grn_id;
    IF NOT FOUND
       OR NOT (public.is_super_admin() OR public.is_admin()
               OR public.role_has_institution_access(v_inst)) THEN
      RETURN false;
    END IF;
    -- M5 round 3 (skeptic): the answer covers every college only for someone who may
    -- confirm this receipt — an admin, or a verifier who did not receive it. Anyone
    -- else (its receiver above all, who may change its number) is answered only about
    -- the colleges they can open, which RLS already shows them. Before, the receiver
    -- re-numbered one pending receipt per guess and asked here each time.
    v_scoped := NOT (public.is_super_admin() OR public.is_admin()
                     OR (public.user_has_permission('procurement.grn_verify')
                         AND auth.uid() IS NOT NULL
                         AND v_receiver IS DISTINCT FROM auth.uid()));
    -- D4 asked about someone else: only about this receipt's stored confirmer, and only by
    -- a caller who may confirm it (S-M2). Anything else answers false, as before.
    IF p_received_by IS NOT NULL AND p_received_by IS DISTINCT FROM auth.uid()
       AND (v_scoped OR v_confirmer IS NULL OR p_received_by IS DISTINCT FROM v_confirmer) THEN
      RETURN false;
    END IF;
  END IF;
  v_key := public.fn_procurement_normalise_invoice_number(v_number);
  IF v_key IS NULL OR v_supplier IS NULL THEN
    RETURN false;
  END IF;
  -- 9d. D4 asks "did this person receive ANY other delivery with this number?": every
  -- status, any recording time — a later, never-posted or cancelled one counts too,
  -- because it can be posted or revived after the confirmation (decisions round, red
  -- team). The hold filter below is for the hold question only.
  IF p_received_by IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.procurement_grn g
       WHERE g.supplier_id = v_supplier
         AND g.id IS DISTINCT FROM p_grn_id
         AND g.received_by = p_received_by
         AND public.fn_procurement_normalise_invoice_number(g.invoice_number) = v_key
    );
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.procurement_grn g
     WHERE g.supplier_id = v_supplier
       AND g.id IS DISTINCT FROM p_grn_id
       AND public.fn_procurement_normalise_invoice_number(g.invoice_number) = v_key
       AND (NOT v_scoped OR public.role_has_institution_access(g.institution_id))
       AND (g.first_posted_at IS NOT NULL
            OR g.status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed')
            OR (g.status <> 'cancelled'
                AND (v_created IS NULL
                     OR g.created_at < v_created
                     OR (g.created_at = v_created AND g.id < p_grn_id))))
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_procurement_grn_has_duplicate(uuid, uuid, text, timestamptz, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_procurement_grn_has_duplicate(uuid, uuid, text, timestamptz, uuid) TO authenticated;

-- The verify guard, extended. Copied from the live definition (identical to
-- 20271006130000_procurement_final_approval_chain.sql apart from its closing ';',
-- re-checked with pg_get_functiondef on 2026-10-10, deep-panel round 2). That file is
-- the newest one on main that defines this function; this migration sorts after it.
--
-- EXPECTED PRE-APPLY DIFF (deep-panel round 2, L8). Diff the live
-- pg_get_functiondef('public.fn_procurement_guard_approval()'::regprocedure) against
-- this copy, comments and blank lines ignored. Exactly these hunks are expected, all
-- but the first inside the WHEN 'procurement_grn' branch; anything else means another
-- migration moved the guard — STOP and merge these hunks into that version instead:
--   G1. DECLARE: one new variable, v_inv text.
--   G2. The first status arm: was "NEW.status IN (accepted, partially_accepted,
--       replacement_requested) AND (INSERT OR OLD.status IN (draft,
--       pending_verification))"; now 'completed' is a posted status too, and
--       cancelled -> posted is guarded (INSERT into any posted status; UPDATE from
--       draft / pending_verification / cancelled into one).
--   G3. Two new ELSIF arms after it: out of a posted status, and reviving a cancelled
--       receipt — both need grn_verify.
--   G4. Early permission refusal (before D2 / I1 can answer), with
--       coalesce(v_chain, false).
--   G5. D2: no invoice number, no stock (replacement-receipt exemption, at verify only
--       since R2).
--   G6. I1: advisory lock + held-duplicate check + D4 re-check at entry into stock.
--   G7. E1: self-check ban. It sits right after G4, BEFORE G5 and G6 (skeptic re-check,
--       2026-10-11). R2 (2026-10-11 02:00): no INSERT into a posted status by an app user
--       at all; the UPDATE arm also refuses the original delivery's receiver for a
--       replacement receipt; then the replacement receipt's shape is judged (claimed,
--       unfulfilled, one line within the quantity awaiting replacement).
--   G8. I2: no accepted line already expired (IST) on entry into a posted status
--       (deep-panel round 3, S-M5). It sits after G5, before G6.
--   plus the marker comment line "guard-version: 20271010170000" (D-L7) and the closing line: pg_get_functiondef prints `$function$` and this file has
--   `$function$;` (the statement terminator) — expected, not a change.
-- The other branches, the RFQ early arm and the tail after END CASE are unchanged.
-- What each GRN hunk does:
--   * a move INTO a posted status (accepted / partially_accepted /
--     replacement_requested / completed) from draft, pending_verification or
--     cancelled needs grn_verify. 'completed' and 'cancelled' are new here: before,
--     pending -> completed and cancelled -> accepted were unguarded. An INSERT straight
--     into a posted status needs grn_verify too, 'completed' included (review round 2,
--     red team: a receiver could insert a 'completed' receipt carrying a repeated
--     number). Since R2 (2026-10-11) no app user inserts into a posted status at all —
--     receiveReplacement records a pending receipt.
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
--   * I2 (deep-panel round 3, S-M5, hunk G8): entering a posted status is refused while a
--     line accepts goods whose expiry date is before today in IST.
-- Re-check the live definition before applying: if another migration has moved it
-- since, merge these blocks into that version instead of applying this copy.
--
-- D-L7 (deep-panel round 3): the re-check is also enforced. The DO block below refuses
-- the replace unless the live body (prosrc) is exactly the 20271006130000 one (md5
-- f529b60b38c55fa451a1c50270057e00, the live value on 2026-10-11) or a version of this
-- file (it carries the "guard-version: 20271010170000" marker line). Any other body means
-- someone changed the guard since — a hotfix to the requisition, RFQ or PO branches would
-- otherwise be silently undone — and the apply stops here, before anything is replaced.
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.fn_procurement_guard_approval()');
  IF v_src IS NULL
     OR md5(v_src) = 'f529b60b38c55fa451a1c50270057e00'
     OR position('guard-version: 20271010170000' in v_src) > 0 THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'fn_procurement_guard_approval is not the version this migration was written against (md5 of its body is %). Another change moved it — merge hunks G1-G8 of 20271010170000 into the live version instead of applying this copy.', md5(v_src);
END $$;

CREATE OR REPLACE FUNCTION public.fn_procurement_guard_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
-- guard-version: 20271010170000 (procurement_grn_invoice_checks) — read by its D-L7 check.
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
      -- E1 (Director 2026-10-10 afternoon): self-check banned. Whoever received a delivery
      -- never checks it into stock — whatever their rights; admins and super admins are
      -- NOT exempt, only the service role (the early return at the top). Checked against
      -- the stored receiver too (OLD), so rewriting received_by in the same statement
      -- does not help; received_by itself is frozen for everyone (rule a, E1).
      -- M5 round 3 (skeptic): placed BEFORE D2 and I1, so a refused entry never tells the
      -- caller whether a guessed invoice number is held.
      -- R2 (Director 2026-10-11 02:00, replacements need two people): an INSERT is always
      -- by its receiver (rule a pins received_by := auth.uid()), so NO app user may insert
      -- a receipt straight into a posted status any more — replacement receipts included.
      -- receiveReplacement saves the replacement receipt as pending; a different verifier
      -- checks it into stock through this UPDATE arm. That verifier is neither the person
      -- who recorded it (received_by, the E1 test) nor whoever received the ORIGINAL
      -- delivery (the replacement arm below).
      IF NEW.status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed')
         AND (TG_OP = 'INSERT'
              OR OLD.status NOT IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed')) THEN
        IF TG_OP = 'INSERT' THEN
          IF auth.uid() IS NOT NULL OR coalesce(auth.role(), '') IN ('authenticated', 'anon') THEN
            RAISE EXCEPTION 'a delivery is always recorded as pending — someone other than the person who received it checks it into stock'
              USING ERRCODE = '42501';
          END IF;
        ELSIF auth.uid() IS NOT NULL THEN
          IF auth.uid() IS NOT DISTINCT FROM NEW.received_by
             OR auth.uid() IS NOT DISTINCT FROM OLD.received_by THEN
            RAISE EXCEPTION 'you received this delivery, so someone else must check it before it is added to stock'
              USING ERRCODE = '42501';
          END IF;
          IF NEW.replacement_id IS NOT NULL AND EXISTS (
               SELECT 1
                 FROM public.procurement_grn_replacements r
                 JOIN public.procurement_grn_items gi ON gi.id = r.grn_item_id
                 JOIN public.procurement_grn pg ON pg.id = gi.grn_id
                WHERE r.id = NEW.replacement_id
                  AND pg.received_by IS NOT DISTINCT FROM auth.uid()) THEN
            RAISE EXCEPTION 'you received the original delivery, so someone else must check its replacement into stock'
              USING ERRCODE = '42501';
          END IF;
        END IF;
      END IF;
      -- R2 (Director 2026-10-11): a replacement receipt enters stock only as what it is — the
      -- goods owed for one rejected line. While it was pending its lines were open to edit
      -- (institution-only RLS), so this is judged at the moment of entry, for every caller
      -- but the service role: the replacement is claimed ('received'), not yet fulfilled,
      -- raised on a line of a posted receipt of the same purchase order; and the receipt has
      -- exactly one line, for that line's order line, rejecting nothing and accepting more
      -- than 0 and no more than the quantity awaiting replacement.
      IF TG_OP = 'UPDATE'
         AND NEW.replacement_id IS NOT NULL
         AND NEW.status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed')
         AND OLD.status NOT IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed') THEN
        IF NOT EXISTS (
             SELECT 1
               FROM public.procurement_grn_replacements r
               JOIN public.procurement_grn_items gi ON gi.id = r.grn_item_id
               JOIN public.procurement_grn pg ON pg.id = gi.grn_id
              WHERE r.id = NEW.replacement_id
                AND r.status = 'received'
                AND r.replacement_grn_item_id IS NULL
                AND pg.id IS DISTINCT FROM NEW.id
                AND pg.purchase_order_id = NEW.purchase_order_id
                AND pg.status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed')) THEN
          RAISE EXCEPTION 'this replacement delivery no longer matches an open replacement (it was received already, or its original delivery is not in stock) — ask an admin'
            USING ERRCODE = '42501';
        END IF;
        IF (SELECT count(*) FROM public.procurement_grn_items x WHERE x.grn_id = NEW.id) <> 1
           OR NOT EXISTS (
             SELECT 1
               FROM public.procurement_grn_items x
               JOIN public.procurement_grn_replacements r ON r.id = NEW.replacement_id
               JOIN public.procurement_grn_items gi ON gi.id = r.grn_item_id
              WHERE x.grn_id = NEW.id
                AND coalesce(x.rejected_quantity, 0) = 0
                AND coalesce(x.accepted_quantity, 0) > 0
                AND x.accepted_quantity <= r.rejected_quantity
                AND x.po_item_id IS NOT DISTINCT FROM gi.po_item_id) THEN
          RAISE EXCEPTION 'a replacement delivery must have exactly one line, for the rejected item, accepting no more than the quantity awaiting replacement and rejecting nothing — ask an admin to correct it'
            USING ERRCODE = '23514';
        END IF;
      END IF;
      -- D2 (Director 2026-10-10): a receipt with no invoice number never goes into stock.
      -- Replacement receipts are exempt — but only one that names, in replacement_id, a
      -- replacement the server can check (decisions round, red team). The replacement must
      -- be claimed ('received' — receiveReplacement flips it before inserting the header),
      -- not yet fulfilled, and on a line of a posted receipt of the same purchase order;
      -- the unique index allows one receipt per replacement and rule 9b freezes the marker.
      -- R2 (Director 2026-10-11): the exemption now applies at VERIFY (the UPDATE from
      -- pending into any posted status — verifyGrn's first write is the provisional
      -- 'accepted'), never at INSERT: no app user inserts into a posted status any more.
      -- Every other entry into a posted status needs a number.
      IF NEW.status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed')
         AND (TG_OP = 'INSERT'
              OR OLD.status NOT IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed'))
         AND public.fn_procurement_normalise_invoice_number(NEW.invoice_number) IS NULL
         AND NOT (TG_OP = 'UPDATE'
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
      -- I2 (deep-panel round 3, S-M5): expired goods never go into stock. A line that
      -- accepts goods whose expiry date is before today — today in IST, the business day,
      -- never the server's UTC date — blocks the move into a posted status. The same rule as
      -- expiredLineBlocks() in lib/services/procurement/invoice-checks.ts (expiring TODAY is
      -- still usable; an all-rejected expired line is how refused goods are recorded). The
      -- lines are frozen from this moment on (trg_pgrni_00_posted_lock). A replacement
      -- receipt is INSERTed before its line exists; its line is judged by that trigger.
      IF TG_OP = 'UPDATE'
         AND NEW.status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed')
         AND OLD.status NOT IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed')
         AND EXISTS (
           SELECT 1 FROM public.procurement_grn_items gi
            WHERE gi.grn_id = NEW.id
              AND coalesce(gi.accepted_quantity, 0) > 0
              AND gi.expiry_date < (now() AT TIME ZONE 'Asia/Kolkata')::date) THEN
        RAISE EXCEPTION 'this delivery accepts goods that have already expired, so it cannot be added to stock — reject that line or correct its expiry date'
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
          IF public.fn_procurement_grn_has_duplicate(NEW.id, NEW.supplier_id, NEW.invoice_number, NEW.created_at) THEN
            IF NEW.duplicate_confirmed_by IS NULL THEN
              RAISE EXCEPTION 'this delivery''s invoice number repeats another delivery from the same supplier (already in stock, or recorded earlier) — a verifier other than the receiver must confirm it is a different invoice before it is added to stock'
                USING ERRCODE = '42501';
            END IF;
            -- 9d. D4 again at the moment of entry into stock (decisions round, red
            -- team): while the receipt is held, its confirmation counts only if the
            -- confirmer received neither this delivery nor ANY other receipt from this
            -- supplier with this number. Otherwise a confirmer could confirm first,
            -- then record / revive / post a matching receipt of their own.
            IF NEW.duplicate_confirmed_by IS NOT DISTINCT FROM NEW.received_by
               OR public.fn_procurement_grn_has_duplicate(
                    NEW.id, NEW.supplier_id, NEW.invoice_number, NEW.created_at,
                    NEW.duplicate_confirmed_by) THEN
              RAISE EXCEPTION 'the person who confirmed this repeated invoice received one of the deliveries that carry it — a third person, who received neither, must confirm it before it is added to stock'
                USING ERRCODE = '42501';
            END IF;
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
-- a line posted to stock (domain_posted_at). Draft / pending / never-posted cancelled
-- receipts are unchanged: deleting one is no different from cancelling it — except a
-- pending REPLACEMENT receipt, which only whoever recorded it may delete (R2,
-- 2026-10-11: receiveReplacement's rollback; the old carve-out for an invoice-less
-- 'completed' receipt is gone, that receipt is pending now).
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
    -- R2 (Director 2026-10-11): a pending replacement receipt holds its replacement's one
    -- receipt slot. Only the person who recorded it (receiveReplacement's rollback) may
    -- delete it; anyone else at the college could otherwise strand the claimed replacement.
    IF OLD.replacement_id IS NOT NULL
       AND auth.uid() IS NOT NULL
       AND OLD.received_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'a replacement delivery can be removed only by the person who recorded it, or an admin'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  -- R2: the carve-out for receiveReplacement's rollback of an invoice-less 'completed'
  -- receipt is gone — that receipt is now pending (never posted) when it is rolled back.
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

-- M3 (deep-panel round 2): the same rule for the LINES. The header guard reads
-- procurement_grn_items.domain_posted_at, but a line could be deleted on its own
-- (pgrni_parent_scope is FOR ALL, institution only), so a receiver deleted the posted
-- line first and then the header's "invoice-less, mine, no posted line" carve-out let
-- them delete an ever-posted replacement receipt and free its replacement_id slot.
-- Refused here unless the caller is an admin / the service role, when the line is in
-- stock (domain_posted_at) or its receipt was ever posted / is posted now. A line of a
-- pending replacement receipt is deleted only by whoever recorded it (R2, 2026-10-11 —
-- receiveReplacement's rollback). When the parent row is already gone (a cascade from a
-- header delete the header guard allowed) the line goes with it.
CREATE OR REPLACE FUNCTION public.fn_procurement_grn_item_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status   text;
  v_first    timestamptz;
  v_invoice  text;
  v_receiver uuid;
  v_rep      uuid;
BEGIN
  IF coalesce(auth.role(), '') = 'service_role'
     OR public.is_super_admin() OR public.is_admin() THEN
    RETURN OLD;
  END IF;
  SELECT g.status, g.first_posted_at, g.invoice_number, g.received_by, g.replacement_id
    INTO v_status, v_first, v_invoice, v_receiver, v_rep
    FROM public.procurement_grn g
   WHERE g.id = OLD.grn_id;
  IF NOT FOUND THEN
    RETURN OLD;
  END IF;
  IF OLD.domain_posted_at IS NULL
     AND v_first IS NULL
     AND v_status NOT IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed') THEN
    -- R2 (Director 2026-10-11): the line of a pending replacement receipt is deleted only
    -- by the person who recorded it (receiveReplacement's rollback), as its header is.
    IF v_rep IS NOT NULL
       AND auth.uid() IS NOT NULL
       AND v_receiver IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'a line of a replacement delivery can be removed only by the person who recorded it, or an admin'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  -- R2: the receiveReplacement-rollback carve-out is gone (its receipt is pending now).
  RAISE EXCEPTION 'a line of a delivery that has been checked into stock cannot be deleted — ask an admin'
    USING ERRCODE = '42501';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_procurement_grn_item_delete_guard() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_procurement_grn_item_delete_guard() TO authenticated;

DROP TRIGGER IF EXISTS trg_pgrni_delete_guard ON public.procurement_grn_items;
CREATE TRIGGER trg_pgrni_delete_guard
  BEFORE DELETE ON public.procurement_grn_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_grn_item_delete_guard();

-- ----------------------------------------------------------------------------
-- 7f. Replacement rows come only from a verified receipt (review round 2, red team)
-- ----------------------------------------------------------------------------
-- pgrnr_parent_scope is FOR ALL with an institution check only, so anyone could insert a
-- 'pending' replacement against a line of a HELD receipt and have it received into stock
-- (receiveReplacement creates an invoice-less 'completed' receipt, which the I1 check
-- cannot match). The only real writer is verifyGrn, which inserts the row while the
-- receipt is in a posted status (provisionally 'accepted'), for the line's rejected
-- quantity. (R2, 2026-10-11: receiveReplacement then records a PENDING receipt that a
-- second verifier checks in — see the verify guard.) Enforced here for every caller but the service role: a verifier (or admin),
-- a parent receipt in a posted status, a 'pending' row with no fulfilment link, and
-- 0 < rejected_quantity with every replacement on the line together <= the line's
-- rejected quantity (deep-panel round 2 H2; the line row is locked while this is judged).
CREATE OR REPLACE FUNCTION public.fn_procurement_grn_replacement_checks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status   text;
  v_rejected numeric;
  v_raised   numeric;
  v_receiver uuid;
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  -- E1 (Director 2026-10-10 afternoon), replacement arm: CLAIMING a replacement
  -- (pending -> received, receiveReplacement's mutex) is receiving it, so it needs verify
  -- rights and must not be done by whoever received the original delivery. Every other
  -- UPDATE (the fulfilment link, the rollback to pending) is unchanged.
  IF TG_OP = 'UPDATE' THEN
    -- E1 red team (afternoon): a replacement stays on the line it was raised for, for
    -- the quantity it was raised for. Otherwise the original receiver re-points it at
    -- someone else's delivery line, claims it, receives it and points it back. No app
    -- path changes either (verifyGrn inserts; receiveReplacement only flips status and
    -- the fulfilment link). The receiver is read through OLD below for the same reason.
    IF NEW.grn_item_id IS DISTINCT FROM OLD.grn_item_id
       OR NEW.rejected_quantity IS DISTINCT FROM OLD.rejected_quantity THEN
      RAISE EXCEPTION 'a replacement stays on the delivery line and quantity it was raised for — they cannot be changed'
        USING ERRCODE = '42501';
    END IF;
    -- H2 round 3 (skeptic): a fulfilled replacement stays fulfilled. Before, anyone at the
    -- college could reset a fulfilled row to pending with no link, claim it again and
    -- receive the same rejected goods a second time. The link is written once, by
    -- receiveReplacement, to the line of the receipt that names this replacement
    -- (procurement_grn.replacement_id), while the row is 'received'.
    IF OLD.replacement_grn_item_id IS NOT NULL
       AND NEW.replacement_grn_item_id IS DISTINCT FROM OLD.replacement_grn_item_id THEN
      RAISE EXCEPTION 'this replacement has already been received — its delivery cannot be changed'
        USING ERRCODE = '42501';
    END IF;
    IF OLD.replacement_grn_item_id IS NULL AND NEW.replacement_grn_item_id IS NOT NULL
       AND (NEW.status IS DISTINCT FROM 'received'
            OR NOT EXISTS (
              SELECT 1
                FROM public.procurement_grn_items gi
                JOIN public.procurement_grn g ON g.id = gi.grn_id
               WHERE gi.id = NEW.replacement_grn_item_id
                 AND g.replacement_id = NEW.id
                 -- R2 (Director 2026-10-11): fulfilled = checked into stock by a second
                 -- person. verifyGrn writes the link after the receipt is posted.
                 AND g.status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed'))) THEN
      RAISE EXCEPTION 'a replacement can only be linked to a line of the delivery recorded for it, once that delivery is checked into stock'
        USING ERRCODE = '42501';
    END IF;
    -- H2 round 3: received -> pending is receiveReplacement's rollback only. It runs
    -- after the rollback has deleted the replacement receipt and before any link was
    -- written, by a verifier. While a receipt still names this replacement (its goods
    -- may be in stock), the claim stays.
    IF OLD.status = 'received' AND NEW.status IS DISTINCT FROM 'received' THEN
      IF NOT (public.is_super_admin() OR public.is_admin()
              OR public.user_has_permission('procurement.grn_verify')) THEN
        RAISE EXCEPTION 'not authorized to reopen a replacement — this requires the procurement.grn_verify permission'
          USING ERRCODE = '42501';
      END IF;
      IF OLD.replacement_grn_item_id IS NOT NULL
         OR EXISTS (SELECT 1 FROM public.procurement_grn g WHERE g.replacement_id = OLD.id) THEN
        RAISE EXCEPTION 'this replacement has already been received — it cannot be reopened'
          USING ERRCODE = '42501';
      END IF;
    END IF;
    IF OLD.status = 'pending' AND NEW.status = 'received' THEN
      IF NOT (public.is_super_admin() OR public.is_admin()
              OR public.user_has_permission('procurement.grn_verify')) THEN
        RAISE EXCEPTION 'not authorized to receive a replacement — this requires the procurement.grn_verify permission'
          USING ERRCODE = '42501';
      END IF;
      SELECT g.received_by INTO v_receiver
        FROM public.procurement_grn_items gi
        JOIN public.procurement_grn g ON g.id = gi.grn_id
       WHERE gi.id = OLD.grn_item_id;
      IF auth.uid() IS NOT NULL AND v_receiver IS NOT DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'you received the original delivery, so someone else must receive and check its replacement'
          USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NOT (public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('procurement.grn_verify')) THEN
    RAISE EXCEPTION 'not authorized to raise a replacement — this requires the procurement.grn_verify permission'
      USING ERRCODE = '42501';
  END IF;
  -- H2 (deep-panel round 2): the line is locked first, so two replacements raised at
  -- the same moment for one line are judged one after the other.
  SELECT g.status, gi.rejected_quantity INTO v_status, v_rejected
    FROM public.procurement_grn_items gi
    JOIN public.procurement_grn g ON g.id = gi.grn_id
   WHERE gi.id = NEW.grn_item_id
     FOR UPDATE OF gi;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery line not found for this replacement'
      USING ERRCODE = '42501';
  END IF;
  IF v_status NOT IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed') THEN
    RAISE EXCEPTION 'a replacement can only be raised on a delivery that has been checked into stock'
      USING ERRCODE = '42501';
  END IF;
  -- H2: a replacement is raised as an open request. 'received' and the fulfilment link
  -- are written later by receiveReplacement, through the UPDATE arm above (claiming
  -- needs grn_verify and is barred to the original receiver); inserting a row already
  -- 'received' skipped that claim.
  IF NEW.status IS DISTINCT FROM 'pending' OR NEW.replacement_grn_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'a replacement is raised as pending, with no replacement delivery yet'
      USING ERRCODE = '42501';
  END IF;
  -- H2: every replacement raised on this line, this one included, together stays within
  -- what the line rejected. Before, each was checked alone, so a retried or doubled
  -- verifyGrn (or a direct call) could raise N of them and bring N times the rejected
  -- goods into stock. The status CHECK allows only 'pending' / 'received' today; a
  -- 'cancelled' one, should that status be added, would not count.
  SELECT coalesce(sum(r.rejected_quantity), 0) INTO v_raised
    FROM public.procurement_grn_replacements r
   WHERE r.grn_item_id = NEW.grn_item_id
     AND r.status IS DISTINCT FROM 'cancelled'
     AND r.id IS DISTINCT FROM NEW.id;
  IF NEW.rejected_quantity IS NULL OR NEW.rejected_quantity <= 0
     OR v_raised + NEW.rejected_quantity > coalesce(v_rejected, 0) THEN
    RAISE EXCEPTION 'replacements on a delivery line cannot add up to more than the quantity rejected on that line'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_procurement_grn_replacement_checks() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_procurement_grn_replacement_checks() TO authenticated;

DROP TRIGGER IF EXISTS trg_pgrnr_replacement_checks ON public.procurement_grn_replacements;
CREATE TRIGGER trg_pgrnr_replacement_checks
  BEFORE INSERT OR UPDATE ON public.procurement_grn_replacements
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_grn_replacement_checks();

-- H2 round 3 (skeptic): the total above counts the rows already raised, so deleting
-- them must not be open. pgrnr_parent_scope is FOR ALL (institution only), so anyone at
-- the college could delete a line's replacements — fulfilled ones included — and raise
-- the full rejected quantity again. No app path deletes a replacement row; only an admin
-- or the service role may. When the delivery line itself is already gone (a cascade
-- from a line delete, which trg_pgrni_delete_guard judged) the row goes with it.
CREATE OR REPLACE FUNCTION public.fn_procurement_grn_replacement_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role'
     OR public.is_super_admin() OR public.is_admin() THEN
    RETURN OLD;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.procurement_grn_items gi WHERE gi.id = OLD.grn_item_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'a replacement request cannot be deleted — ask an admin'
    USING ERRCODE = '42501';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_procurement_grn_replacement_delete_guard() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_procurement_grn_replacement_delete_guard() TO authenticated;

DROP TRIGGER IF EXISTS trg_pgrnr_delete_guard ON public.procurement_grn_replacements;
CREATE TRIGGER trg_pgrnr_delete_guard
  BEFORE DELETE ON public.procurement_grn_replacements
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_grn_replacement_delete_guard();

-- H2 round 3: TRUNCATE fires no row trigger, so it would skip every delete guard here.
-- No app path truncates these tables (PostgREST cannot); app roles lose the privilege.
REVOKE TRUNCATE ON public.procurement_grn, public.procurement_grn_items,
                   public.procurement_grn_replacements,
                   public.ims_goods_received_notes, public.ims_grn_items
  FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7g. Lines of a checked delivery are frozen (E1 red team, Director 2026-10-10 afternoon)
-- ----------------------------------------------------------------------------
-- E1 bans the receiver from checking their own delivery, but procurement_grn_items had
-- no trigger and institution-only RLS: after someone else checked a delivery, its
-- receiver could add a line to it, or re-open a checked line (clear domain_posted_at,
-- raise its quantity), and post that to stock with fn_procurement_rm_post_receipt —
-- goods no second person ever checked. Once the parent receipt is in a posted status,
-- or was ever posted (first_posted_at), this refuses for every caller but the service
-- role (admins included, as E1 says):
--   * adding a line — with no exception since R2 (2026-10-11): receiveReplacement adds the
--     replacement receipt's line while that receipt is still pending;
--   * changing accepted_quantity or rejected_quantity — or, since deep-panel round 3
--     (D-M1), ANY other column of the line (unit price, cost, batch, expiry, manufacturing
--     date, serial numbers, item name ...): what a second person checked is what stays;
--   * changing domain_item_id, except NULL -> a value on a line not yet posted (the
--     links verifyGrn and receiveReplacement write while posting) — and that only by a
--     verifier or admin who did not receive the delivery (D-M1: its receiver could link
--     an unposted line to any item and post it with fn_procurement_rm_post_receipt);
--   * changing domain_posted_at once set (NULL -> now() stays possible: the RM RPC's own
--     claim and the service's marker).
--   * I2 (round 3, S-M5): a replacement line is now judged at verify, by the verify
--     guard's G8 like every other line.
-- A line can never move to another receipt (grn_id), posted or not. Deleting a line is
-- judged by trg_pgrni_delete_guard (section 7b, deep-panel round 2 M3).
-- M4 (deep-panel round 2): the parent receipt is read with a row lock on INSERT and
-- UPDATE, before the status test. A verifier posting the header holds its row lock until
-- commit, so the line write waits and then sees the posted status (a locking read returns
-- the newest committed row), instead of passing on a 'pending' snapshot. D-L5 (round 3):
-- an INSERT takes FOR UPDATE at once — it used to take FOR SHARE and then upgrade, and two
-- line inserts on one receipt then both held the share lock, both waited for the upgrade,
-- and one was killed as a deadlock (40P01). An UPDATE keeps FOR SHARE.
CREATE OR REPLACE FUNCTION public.fn_procurement_grn_item_checks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status   text;
  v_first    timestamptz;
  v_rep      uuid;
  v_receiver uuid;
  v_found    boolean;
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.grn_id IS DISTINCT FROM OLD.grn_id THEN
    RAISE EXCEPTION 'a delivery line cannot be moved to another delivery'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- D-L5: FOR UPDATE from the start — it also serialises line inserts on this receipt,
    -- so "no line yet" below holds under concurrency.
    SELECT g.status, g.first_posted_at, g.replacement_id, g.received_by
      INTO v_status, v_first, v_rep, v_receiver
      FROM public.procurement_grn g
     WHERE g.id = NEW.grn_id
       FOR UPDATE;
    v_found := FOUND;
  ELSE
    SELECT g.status, g.first_posted_at, g.replacement_id, g.received_by
      INTO v_status, v_first, v_rep, v_receiver
      FROM public.procurement_grn g
     WHERE g.id = NEW.grn_id
       FOR SHARE;
    v_found := FOUND;
  END IF;
  -- R2 (Director 2026-10-11): while a replacement receipt is pending, only the person who
  -- recorded it (or an admin) adds its line or changes its quantities — as only they could
  -- before, when the line was written straight into stock. The verifier still fills in
  -- batch / expiry at verify time; the quantity is judged at verify (verify guard).
  IF v_found AND v_rep IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND v_receiver IS DISTINCT FROM auth.uid()
     AND NOT (public.is_super_admin() OR public.is_admin())
     AND (TG_OP = 'INSERT'
          OR NEW.accepted_quantity IS DISTINCT FROM OLD.accepted_quantity
          OR NEW.rejected_quantity IS DISTINCT FROM OLD.rejected_quantity) THEN
    RAISE EXCEPTION 'only the person who recorded this replacement delivery can add its line or change its quantities'
      USING ERRCODE = '42501';
  END IF;
  IF NOT v_found
     OR NOT (v_status IN ('accepted', 'partially_accepted', 'replacement_requested', 'completed')
             OR v_first IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  -- R2 (Director 2026-10-11): no carve-out any more. A replacement receipt gets its line
  -- while it is still pending (receiveReplacement); once anything is posted, no line is
  -- added to it, by anyone but the service role.
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'this delivery has already been checked into stock — a line cannot be added to it. Record the extra goods as a new delivery'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.accepted_quantity IS DISTINCT FROM OLD.accepted_quantity
     OR NEW.rejected_quantity IS DISTINCT FROM OLD.rejected_quantity THEN
    RAISE EXCEPTION 'this delivery has already been checked into stock — its quantities cannot be changed'
      USING ERRCODE = '42501';
  END IF;
  -- D-M1 (round 3): every other column is frozen too — price, batch, expiry, dates.
  IF (to_jsonb(NEW) - 'domain_item_id' - 'domain_posted_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'domain_item_id' - 'domain_posted_at') THEN
    RAISE EXCEPTION 'this delivery has already been checked into stock — its lines (price, batch, expiry and dates included) cannot be changed'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.domain_item_id IS DISTINCT FROM OLD.domain_item_id THEN
    IF OLD.domain_item_id IS NOT NULL OR OLD.domain_posted_at IS NOT NULL THEN
      RAISE EXCEPTION 'this delivery has already been checked into stock — the item a line is linked to cannot be changed'
        USING ERRCODE = '42501';
    END IF;
    -- D-M1: the NULL -> item link is the poster's (verifyGrn, receiveReplacement relinking
    -- the original line) — a verifier or admin who did not receive this delivery.
    IF auth.uid() IS NULL
       OR v_receiver IS NOT DISTINCT FROM auth.uid()
       OR NOT (public.is_super_admin() OR public.is_admin()
               OR public.user_has_permission('procurement.grn_verify')) THEN
      RAISE EXCEPTION 'only a verifier who did not receive this delivery can link its line to an item'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  IF OLD.domain_posted_at IS NOT NULL
     AND NEW.domain_posted_at IS DISTINCT FROM OLD.domain_posted_at THEN
    RAISE EXCEPTION 'this delivery line is already in stock — it cannot be re-opened'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_procurement_grn_item_checks() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_procurement_grn_item_checks() TO authenticated;

DROP TRIGGER IF EXISTS trg_pgrni_00_posted_lock ON public.procurement_grn_items;
CREATE TRIGGER trg_pgrni_00_posted_lock
  BEFORE INSERT OR UPDATE ON public.procurement_grn_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_grn_item_checks();

-- ----------------------------------------------------------------------------
-- 8/D1. The IMS goods-receipt flow is retired (Director 2026-10-10)
-- ----------------------------------------------------------------------------
-- All goods receipts go through procurement GRNs, which carry the invoice checks.
-- ims_goods_received_notes / ims_grn_items had no triggers and institution-only RLS, so
-- a direct API call could still create or approve an IMS receipt (and approveGRN then
-- wrote stock). For app users (authenticated / anon) this refuses: a new IMS receipt or
-- receipt line, and moving an IMS receipt into 'verified' or 'approved'; and (9a)
-- deleting a receipt or a line, editing a line, or editing any header column other
-- than a cancel and the notes. Reading and cancelling the existing receipts (6 on
-- production, latest 2026-08-22; GRN-260822-00002 is 'verified' and can now never be
-- approved) still work. Migrations and the service role are not app users and are
-- not affected.
CREATE OR REPLACE FUNCTION public.fn_ims_grn_retired_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- A BEFORE DELETE trigger that returns NULL silently skips the delete, so every
  -- pass-through returns OLD on DELETE and NEW otherwise.
  -- L9 (deep-panel round 2): an app user is recognised by the request's JWT role too,
  -- not only by current_user. A SECURITY DEFINER function runs as its owner, so a
  -- current_user test alone let any such function (none writes these tables on
  -- production today, checked 2026-10-10) create or approve IMS receipts for an app
  -- user. Migrations (no JWT) and the service role still pass.
  IF coalesce(auth.role(), '') = 'service_role'
     OR (current_user NOT IN ('authenticated', 'anon')
         AND coalesce(auth.role(), '') NOT IN ('authenticated', 'anon')) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'IMS goods receipts are retired — record the delivery in Procurement → Deliveries (/procurement/grn). Older IMS receipts can still be viewed.'
      USING ERRCODE = '42501';
  END IF;
  -- 9a (decisions round, red team): the old receipts are a kept record. The RLS
  -- policies on both tables are institution-only, so without this any signed-in user
  -- of the college (students included) could delete a receipt — its lines cascade —
  -- or rewrite a line's quantity / cost. The app never deletes either, nor edits lines.
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IMS goods receipts are retired and kept as a record — they cannot be deleted'
      USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'ims_grn_items' THEN
    RAISE EXCEPTION 'IMS goods receipts are retired and kept as a record — their lines cannot be changed'
      USING ERRCODE = '42501';
  END IF;
  -- Header UPDATE: only what the app still does — cancel (status -> 'cancelled') and
  -- notes (updated_at moves with them). Every other column, and any other status
  -- move ('verified' / 'approved' above all, or reviving a cancelled one), is refused.
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('verified', 'approved') THEN
    RAISE EXCEPTION 'IMS goods receipts are retired — they can no longer be verified or approved. Record the delivery in Procurement → Deliveries (/procurement/grn).'
      USING ERRCODE = '42501';
  END IF;
  IF (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IS DISTINCT FROM 'cancelled')
     OR (to_jsonb(NEW) - 'status' - 'notes' - 'updated_at')
        IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'notes' - 'updated_at') THEN
    RAISE EXCEPTION 'IMS goods receipts are retired and kept as a record — only cancelling one or editing its notes is still possible'
      USING ERRCODE = '42501';
  END IF;
  -- E2 red team (afternoon): the RLS update policy is institution-only, so the guard
  -- itself gates who may still cancel or annotate an old receipt — the same right the
  -- IMS page asks for (canAccess('ims.stock.grn','edit'), super admins always). An
  -- 'approved' receipt already added its stock and cancelGRN reverses none, so it is
  -- never cancelled (the page never offers that either).
  IF NEW.status = 'cancelled' AND OLD.status = 'approved' THEN
    RAISE EXCEPTION 'this IMS receipt was approved and its goods are already in stock — it cannot be cancelled'
      USING ERRCODE = '42501';
  END IF;
  IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.notes IS DISTINCT FROM OLD.notes)
     AND NOT (public.is_super_admin() OR public.user_has_permission('ims.stock.grn.edit')) THEN
    RAISE EXCEPTION 'not authorized to change an IMS goods receipt — this requires the ims.stock.grn.edit permission'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ims_grn_retired_guard() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ims_grn_retired_guard() TO authenticated;

DROP TRIGGER IF EXISTS trg_ims_grn_00_retired ON public.ims_goods_received_notes;
CREATE TRIGGER trg_ims_grn_00_retired
  BEFORE INSERT OR UPDATE OR DELETE ON public.ims_goods_received_notes
  FOR EACH ROW EXECUTE FUNCTION public.fn_ims_grn_retired_guard();

DROP TRIGGER IF EXISTS trg_ims_grn_items_00_retired ON public.ims_grn_items;
CREATE TRIGGER trg_ims_grn_items_00_retired
  BEFORE INSERT OR UPDATE OR DELETE ON public.ims_grn_items
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
-- L7 (deep-panel round 2): re-stated on conflict, so a database that took an earlier
-- draft of this bucket gets these settings.
ON CONFLICT (id) DO UPDATE
  SET public             = false,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- L7 (deep-panel round 2): each policy below is dropped and re-created, not created only
-- when missing, so an earlier draft (for example one without the <po_id>/ folder rule)
-- never survives a re-apply.

-- Upload: people who record or verify deliveries (or admins) only, and only into
-- the folder of an order they can see.
DROP POLICY IF EXISTS "procurement_invoice_pdfs_insert" ON storage.objects;
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
);

-- Read: same gate, same folder rule. NOT public, and NOT quotation_manage — supplier bills.
-- (The Max-lane runner reads with the service role, which bypasses RLS.)
DROP POLICY IF EXISTS "procurement_invoice_pdfs_read" ON storage.objects;
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
);

DROP POLICY IF EXISTS "procurement_invoice_pdfs_delete" ON storage.objects;
CREATE POLICY "procurement_invoice_pdfs_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'procurement-invoice-pdfs'
  -- Admins only (review round, 2026-10-09): the route never deletes, and a
  -- delete + re-upload at the same content-addressed key would swap the bytes.
  AND (public.is_super_admin() OR public.is_admin())
);

-- ----------------------------------------------------------------------------
-- 11. Pin what an invoice-read job may point the runner at (deep-panel M3)
-- ----------------------------------------------------------------------------
-- fn_ai_enqueue (SECURITY DEFINER) inserts the caller's payload verbatim. The only
-- fields a direct caller cannot choose are requested_by, lane and job_type. The
-- runner reads the PDF with the service role, so the payload must never be able to
-- name another bucket, or a path outside the content-addressed key the
-- extract-invoice route writes. This runs inside fn_ai_enqueue (owner rights), so it
-- does NOT test order visibility with RLS — that would be vacuous here. Visibility is
-- enforced by the route (it reads the order as the caller first) and by the bucket's
-- upload policy (section 6), which is why the stored object must exist.
-- D-L6 (deep-panel round 3): and, for an app user, the order's college must be one the
-- requester can open (role_has_institution_access, which reads the JWT user — the same
-- person fn_ai_enqueue writes into requested_by — or super admin / admin). Checked before
-- the stored-object test, so nobody learns whether another college's bill is stored.
-- S-L9 (round 3): payload._dedupe is written here as <requested_by>:<po_id>:<sha256>, so
-- the existing unique index ai_jobs_inflight_dedupe_idx (job_type, payload->>'_dedupe',
-- in-flight statuses only) refuses a second in-flight read of the same PDF by the same
-- person with 23505; the route answers that with the job already queued. Forced, never
-- taken from the caller: a chosen key could block someone else's read.
-- Updated: 2026-10-10 - deep-panel round 1, PR #4296.
-- Updated: 2026-10-11 - deep-panel round 3 (D-L6, S-L9).
CREATE OR REPLACE FUNCTION public.fn_ai_jobs_invoice_extract_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po   text := NEW.payload->>'po_id';
  v_sha  text := NEW.payload->>'sha256';
  v_path text := NEW.payload->>'storage_path';
  v_inst uuid;
BEGIN
  -- M6 (deep-panel round 2): on UPDATE the job's target is frozen for app users.
  -- Production has no UPDATE path for them today (checked 2026-10-10: ai_jobs has RLS
  -- with only a read-own SELECT policy, and no authenticated-callable function writes
  -- payload or job_type), so this is defence in depth. The stored-object test is not
  -- re-run on UPDATE: the payload it approved is the one kept.
  -- App users only, the same test as fn_ims_grn_retired_guard (L9): the service role and
  -- a JWT-less owner session (a migration or repair script) are not frozen.
  IF TG_OP = 'UPDATE' THEN
    IF (current_user IN ('authenticated', 'anon')
        OR coalesce(auth.role(), '') IN ('authenticated', 'anon'))
       AND coalesce(auth.role(), '') <> 'service_role'
       AND (NEW.payload IS DISTINCT FROM OLD.payload
            OR NEW.job_type IS DISTINCT FROM OLD.job_type) THEN
      RAISE EXCEPTION 'an invoice read job''s type and payload cannot be changed after it is queued'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.job_type IS DISTINCT FROM 'procurement.invoice_extract' THEN
    RETURN NEW;
  END IF;
  IF jsonb_typeof(NEW.payload) IS DISTINCT FROM 'object'
     OR v_po IS NULL
     OR v_po !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR v_sha IS NULL
     OR v_sha !~ '^[0-9a-f]{64}$'
     OR v_path IS DISTINCT FROM (v_po || '/' || v_sha || '.pdf') THEN
    RAISE EXCEPTION 'invoice read job payload must name <po_id>/<sha256>.pdf for its own po_id and sha256'
      USING ERRCODE = '22023';
  END IF;
  -- D-L6: the order must exist and, for an app user, belong to a college they can open.
  SELECT po.institution_id INTO v_inst
    FROM public.procurement_purchase_orders po
   WHERE po.id = v_po::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice read job names a purchase order that does not exist'
      USING ERRCODE = '22023';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' AND auth.uid() IS NOT NULL
     AND (NEW.requested_by IS DISTINCT FROM auth.uid()
          OR NOT (public.is_super_admin() OR public.is_admin()
                  OR public.role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'you cannot have an invoice read for a purchase order of a college you cannot open'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'procurement-invoice-pdfs'
          AND o.name = v_path) THEN
    RAISE EXCEPTION 'invoice read job names a PDF that is not stored'
      USING ERRCODE = '22023';
  END IF;
  -- Whatever the caller sent, the runner only ever reads this bucket.
  NEW.payload := jsonb_set(NEW.payload, '{storage_bucket}', to_jsonb('procurement-invoice-pdfs'::text), true);
  -- S-L9: one in-flight read per person + order + PDF (ai_jobs_inflight_dedupe_idx).
  NEW.payload := jsonb_set(NEW.payload, '{_dedupe}',
    to_jsonb(coalesce(NEW.requested_by::text, '') || ':' || lower(v_po) || ':' || v_sha), true);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_jobs_invoice_extract_guard() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_ai_jobs_00_invoice_extract_guard ON public.ai_jobs;
-- M6: also on UPDATE OF payload / job_type, for a row that is, or becomes, an invoice
-- read job (OLD is not available in an INSERT trigger's WHEN, so the UPDATE test on OLD
-- is a separate trigger).
CREATE TRIGGER trg_ai_jobs_00_invoice_extract_guard
  BEFORE INSERT ON public.ai_jobs
  FOR EACH ROW
  WHEN (NEW.job_type = 'procurement.invoice_extract')
  EXECUTE FUNCTION public.fn_ai_jobs_invoice_extract_guard();

DROP TRIGGER IF EXISTS trg_ai_jobs_00_invoice_extract_freeze ON public.ai_jobs;
CREATE TRIGGER trg_ai_jobs_00_invoice_extract_freeze
  BEFORE UPDATE OF payload, job_type ON public.ai_jobs
  FOR EACH ROW
  WHEN (OLD.job_type = 'procurement.invoice_extract'
        OR NEW.job_type = 'procurement.invoice_extract')
  EXECUTE FUNCTION public.fn_ai_jobs_invoice_extract_guard();
