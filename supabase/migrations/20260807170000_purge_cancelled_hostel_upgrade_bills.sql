-- Purge the 167 cancelled "Hostel Upgrade Fee" bills (Rs 12,52,500).
--
-- WHAT THESE ARE
-- Hostel category-upgrade offers that were made, priced, and then lapsed. When an
-- offer expires or is declined, the accompanying bill is cancelled. They are NOT
-- duplicates and NOT import errors — each one is the record of a real offer. This
-- purge is a deliberate business decision to drop that history, taken 2026-07-29
-- after the trade-off was reviewed.
--
-- Split: JKKN Dental College and Hospital 164 (Rs 12,30,000), JKKN College of
-- Pharmacy 3 (Rs 22,500). 95 learners.
--
-- SAFETY (verified 2026-07-29, immediately before applying)
--   * 0 billing_receipt_items, 0 payment_transaction_items, 0 apportionments,
--     0 discounts, 0 refund requests, 0 credit balances, 0 tms_fee_bill,
--     0 mess_student_billing, 0 superseded_by references, 0 payment_transactions.
--   * 0 refunded_amount / refund_status / payment_date on any of them.
--   * All 167 linked hostel_waitlist rows are TERMINAL: 160 'expired', 7 'declined',
--     none allocated, none holding a room/bed, none with an unexpired offer or hold.
--     So no in-flight upgrade offer is disturbed by this.
--
-- THE ONE MUTATION THIS CAUSES
-- hostel_waitlist.upgrade_bill_id is ON DELETE SET NULL, so 167 waitlist rows lose
-- their bill link. The rows themselves survive; only the "what was this learner
-- quoted for the upgrade" pointer goes. That is silent — no error, no row count.
-- Because of that, the (waitlist_id -> bill_id) pairs are snapshotted separately
-- below, so the operation is FULLY reversible rather than half-reversible.
--
-- TO RESTORE:
--   INSERT INTO billing_student_bills
--   SELECT * FROM _bak_billing_cancelled_hostel_upgrade_20260729;
--
--   UPDATE hostel_waitlist w SET upgrade_bill_id = l.upgrade_bill_id
--   FROM _bak_hostel_waitlist_upgrade_links_20260729 l WHERE l.waitlist_id = w.id;
--
-- Precedent: 20260807160000_purge_duplicate_cancelled_bills.sql removed the 316
-- import-rerun duplicates. This is a separate, differently-motivated purge — those
-- were phantom rows, these are real events being retired.

-- ---------------------------------------------------------------------------
-- 1. Snapshot the bills. Creating the table is also the re-run guard: a second
--    run fails on "already exists" instead of silently deleting more.
-- ---------------------------------------------------------------------------
CREATE TABLE public._bak_billing_cancelled_hostel_upgrade_20260729 AS
SELECT b.*
FROM public.billing_student_bills b
JOIN public.billing_categories c ON c.id = b.item_category_id
WHERE b.status = 'cancelled'
  AND c.category_name = 'Hostel Upgrade Fee';

ALTER TABLE public._bak_billing_cancelled_hostel_upgrade_20260729
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._bak_billing_cancelled_hostel_upgrade_20260729
  FROM anon, authenticated;

COMMENT ON TABLE public._bak_billing_cancelled_hostel_upgrade_20260729 IS
  'Snapshot of the 167 cancelled Hostel Upgrade Fee bills, taken immediately before '
  'they were hard-deleted on 2026-07-29. Pairs with '
  '_bak_hostel_waitlist_upgrade_links_20260729 for a full restore.';

-- ---------------------------------------------------------------------------
-- 2. Snapshot the hostel_waitlist links that ON DELETE SET NULL will erase.
--    Without this the delete is only half-reversible.
-- ---------------------------------------------------------------------------
CREATE TABLE public._bak_hostel_waitlist_upgrade_links_20260729 AS
SELECT w.id AS waitlist_id,
       w.upgrade_bill_id,
       w.learner_id,
       w.institution_id,
       w.status::text AS waitlist_status,
       w.entry_kind
FROM public.hostel_waitlist w
JOIN public._bak_billing_cancelled_hostel_upgrade_20260729 b ON b.id = w.upgrade_bill_id;

ALTER TABLE public._bak_hostel_waitlist_upgrade_links_20260729
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._bak_hostel_waitlist_upgrade_links_20260729
  FROM anon, authenticated;

COMMENT ON TABLE public._bak_hostel_waitlist_upgrade_links_20260729 IS
  'hostel_waitlist.upgrade_bill_id values severed by ON DELETE SET NULL when the '
  '167 cancelled Hostel Upgrade Fee bills were purged on 2026-07-29.';

-- ---------------------------------------------------------------------------
-- 3. Guards. Any deviation aborts the whole migration, DDL included.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count        int;
  v_value        numeric;
  v_deps         int;
  v_links        int;
  v_nonterminal  int;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(final_amount), 0)
    INTO v_count, v_value
  FROM public._bak_billing_cancelled_hostel_upgrade_20260729;

  IF v_count <> 167 THEN
    RAISE EXCEPTION
      'Aborting purge: expected 167 cancelled Hostel Upgrade Fee bills, matched %. '
      'Re-run the analysis before deleting anything.', v_count;
  END IF;

  -- Every hard dependency must be zero. The CASCADE ones would destroy money
  -- records silently; the NO ACTION ones would abort anyway — fail early with a
  -- readable message instead.
  SELECT
      (SELECT COUNT(*) FROM public.billing_receipt_items        x JOIN public._bak_billing_cancelled_hostel_upgrade_20260729 b ON b.id = x.bill_id)
    + (SELECT COUNT(*) FROM public.payment_transaction_items    x JOIN public._bak_billing_cancelled_hostel_upgrade_20260729 b ON b.id = x.bill_id)
    + (SELECT COUNT(*) FROM public.billing_bill_apportionments  x JOIN public._bak_billing_cancelled_hostel_upgrade_20260729 b ON b.id = x.bill_id)
    + (SELECT COUNT(*) FROM public.billing_discounts            x JOIN public._bak_billing_cancelled_hostel_upgrade_20260729 b ON b.id = x.bill_id)
    + (SELECT COUNT(*) FROM public.billing_refund_request_bills x JOIN public._bak_billing_cancelled_hostel_upgrade_20260729 b ON b.id = x.bill_id)
    + (SELECT COUNT(*) FROM public.student_credit_balances      x JOIN public._bak_billing_cancelled_hostel_upgrade_20260729 b ON b.id = x.consumed_against_bill_id)
    + (SELECT COUNT(*) FROM public.tms_fee_bill                 x JOIN public._bak_billing_cancelled_hostel_upgrade_20260729 b ON b.id = x.billing_student_bill_id)
    + (SELECT COUNT(*) FROM public.mess_student_billing         x JOIN public._bak_billing_cancelled_hostel_upgrade_20260729 b ON b.id = x.linked_bill_id)
    + (SELECT COUNT(*) FROM public.billing_student_bills        x JOIN public._bak_billing_cancelled_hostel_upgrade_20260729 b ON b.id = x.superseded_by_bill_id)
    + (SELECT COUNT(*) FROM public.payment_transactions         x WHERE EXISTS (
         SELECT 1 FROM public._bak_billing_cancelled_hostel_upgrade_20260729 b WHERE b.id = ANY(x.bill_ids)))
    INTO v_deps;

  IF v_deps <> 0 THEN
    RAISE EXCEPTION
      'Aborting purge: % dependent row(s) reference these bills. Expected 0.', v_deps;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public._bak_billing_cancelled_hostel_upgrade_20260729
    WHERE COALESCE(refunded_amount, 0) <> 0
       OR refund_status IS NOT NULL
       OR payment_date IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'Aborting purge: at least one target bill carries a payment or refund signal.';
  END IF;

  -- The waitlist link snapshot must cover every link that exists right now,
  -- otherwise the restore path is incomplete.
  SELECT COUNT(*) INTO v_links
  FROM public.hostel_waitlist w
  JOIN public._bak_billing_cancelled_hostel_upgrade_20260729 b ON b.id = w.upgrade_bill_id;

  IF v_links <> (SELECT COUNT(*) FROM public._bak_hostel_waitlist_upgrade_links_20260729) THEN
    RAISE EXCEPTION
      'Aborting purge: waitlist link snapshot is incomplete (% live vs % snapshotted).',
      v_links,
      (SELECT COUNT(*) FROM public._bak_hostel_waitlist_upgrade_links_20260729);
  END IF;

  -- Refuse to sever a link on an offer that is still in play.
  SELECT COUNT(*) INTO v_nonterminal
  FROM public.hostel_waitlist w
  JOIN public._bak_billing_cancelled_hostel_upgrade_20260729 b ON b.id = w.upgrade_bill_id
  WHERE w.status::text NOT IN ('expired', 'declined')
     OR w.allocated_allocation_id IS NOT NULL
     OR w.held_room_id IS NOT NULL
     OR w.held_bed_id IS NOT NULL
     OR w.hold_expires_at  > now()
     OR w.offer_expires_at > now();

  IF v_nonterminal <> 0 THEN
    RAISE EXCEPTION
      'Aborting purge: % waitlist row(s) are still live (allocated, holding a bed, '
      'or with an unexpired offer). Purging would sever an in-flight upgrade.',
      v_nonterminal;
  END IF;

  RAISE NOTICE
    'Guards passed: purging % cancelled Hostel Upgrade Fee bills worth %, severing % waitlist links.',
    v_count, v_value, v_links;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Delete. hostel_waitlist.upgrade_bill_id nulls out via ON DELETE SET NULL.
-- ---------------------------------------------------------------------------
DELETE FROM public.billing_student_bills b
USING public._bak_billing_cancelled_hostel_upgrade_20260729 s
WHERE b.id = s.id;

-- ---------------------------------------------------------------------------
-- 5. Verify before committing.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_remaining  int;
  v_backed_up  int;
  v_links      int;
  v_nulled     int;
  v_cancelled  int;
BEGIN
  SELECT COUNT(*) INTO v_backed_up
  FROM public._bak_billing_cancelled_hostel_upgrade_20260729;

  SELECT COUNT(*) INTO v_remaining
  FROM public.billing_student_bills b
  JOIN public._bak_billing_cancelled_hostel_upgrade_20260729 s ON s.id = b.id;

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'Purge incomplete: % target bill(s) still present.', v_remaining;
  END IF;

  IF v_backed_up <> 167 THEN
    RAISE EXCEPTION 'Backup table holds % rows, expected 167.', v_backed_up;
  END IF;

  -- Every snapshotted waitlist row must still exist and must now be NULL.
  SELECT COUNT(*) INTO v_links
  FROM public._bak_hostel_waitlist_upgrade_links_20260729 l
  JOIN public.hostel_waitlist w ON w.id = l.waitlist_id;

  IF v_links <> v_backed_up THEN
    RAISE EXCEPTION
      'Waitlist rows went missing: % of % snapshotted rows survive. SET NULL should '
      'never delete a row.', v_links, v_backed_up;
  END IF;

  SELECT COUNT(*) INTO v_nulled
  FROM public._bak_hostel_waitlist_upgrade_links_20260729 l
  JOIN public.hostel_waitlist w ON w.id = l.waitlist_id
  WHERE w.upgrade_bill_id IS NULL;

  IF v_nulled <> v_links THEN
    RAISE EXCEPTION
      'Expected all % waitlist links nulled, but % still hold a bill id.',
      v_links, v_links - v_nulled;
  END IF;

  -- No dangling pointer may remain anywhere.
  IF EXISTS (
    SELECT 1 FROM public.hostel_waitlist w
    WHERE w.upgrade_bill_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.billing_student_bills b WHERE b.id = w.upgrade_bill_id)
  ) THEN
    RAISE EXCEPTION 'Orphaned hostel_waitlist.upgrade_bill_id detected after purge.';
  END IF;

  SELECT COUNT(*) INTO v_cancelled
  FROM public.billing_student_bills WHERE status = 'cancelled';

  -- 187 cancelled before this migration, minus 167 = 20 retained.
  IF v_cancelled <> 20 THEN
    RAISE WARNING
      'Cancelled bills now number % (expected 20). Not fatal — bills may have been '
      'cancelled by normal activity since 2026-07-29 — but worth a look.', v_cancelled;
  END IF;

  RAISE NOTICE
    'Purge complete: 167 Hostel Upgrade Fee bills removed, % waitlist links severed '
    '(snapshotted), % cancelled bills retained.', v_nulled, v_cancelled;
END $$;
