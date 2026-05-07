-- ============================================================================
-- 20260507100015 — Unwind 269 misallocated student bills + revert lifecycle
-- ============================================================================
-- Background (verified 2026-05-07 via diagnostic queries):
--   On 2026-04-28 and 2026-05-04, three super_admin users (ranjith@,
--   boobalan.a@, viswanathan.s@) bulk-created 270 billing_student_bills rows
--   for 60 learners in active admission years. Bills used legacy fee_items
--   templates ("Application Fee", "1 Year Tuition Fee", etc.) — NOT the
--   matrix-driven admission_fee_structures system (which has 0 adjustments
--   and only 1 structure defined).
--
--   The user's intent is that bills should only auto-generate when a learner
--   transitions admitted → account, gated by a defined fee structure. Until
--   that workflow ships, all 'account' learners in active years should be
--   reverted to 'admitted' so they appear on the Enquiries page.
--
-- Action:
--   1. Snapshot every targeted bill + every status transition to
--      data_quality_review (review_status='ignored' = archived for record).
--   2. Delete 269 bills (excluding bill 5206c054-... with a settled
--      ₹500 receipt for learner ANGELINA B).
--   3. Revert ALL 203 active-year 'account' learners → 'admitted', except
--      ANGELINA B who keeps 'account' because of her settled receipt.
--
-- FK safety check (verified pre-migration):
--   - billing_discounts CASCADE: 0 rows on target bills
--   - billing_receipt_items CASCADE: 1 row → excluded from delete
--   - payment_transaction_items CASCADE: 0 rows
--   - student_credit_balances NO ACTION: 0 rows
--   - billing_student_bills.superseded_by_bill_id NO ACTION: 0 chains
--
-- NOTE: the auto-generation trigger the user wants (admitted→account =>
-- generate bills from matched fee structure) is a SEPARATE design task;
-- this migration only unwinds the bad state.
-- ============================================================================

-- ───────────────────── Step 1a: Snapshot bills to audit trail ─────────────────────

INSERT INTO public.data_quality_review (
    table_name, column_name, observed_value, occurrence_count, review_status, review_notes
)
SELECT
    'billing_student_bills',
    'unwind_2026_05_07',
    bsb.id::text,
    1,
    'ignored',
    json_build_object(
        'student_id', bsb.student_id,
        'institution_id', bsb.institution_id,
        'item_category_id', bsb.item_category_id,
        'bill_description', bsb.bill_description,
        'due_date', bsb.due_date,
        'unit_amount', bsb.unit_amount,
        'total_amount', bsb.total_amount,
        'final_amount', bsb.final_amount,
        'status', bsb.status,
        'created_by', bsb.created_by,
        'created_at', bsb.created_at,
        'reason', 'Misallocated bill from 2026-04-28 / 2026-05-04 bulk op'
    )::text
  FROM public.billing_student_bills bsb
  JOIN public.learners_profiles lp ON lp.id = bsb.student_id
  JOIN public.admission_years ay   ON ay.id = lp.admission_year_id
 WHERE ay.is_active = true
   AND bsb.id NOT IN (
       SELECT bill_id FROM public.billing_receipt_items WHERE bill_id IS NOT NULL
   )
ON CONFLICT (table_name, column_name, observed_value) DO UPDATE
   SET review_notes = EXCLUDED.review_notes,
       updated_at   = now();

-- ───────────────────── Step 1b: Snapshot lifecycle transitions ─────────────────────

INSERT INTO public.data_quality_review (
    table_name, column_name, observed_value, occurrence_count, review_status, review_notes
)
SELECT
    'learners_profiles',
    'lifecycle_revert_2026_05_07',
    lp.id::text,
    1,
    'ignored',
    json_build_object(
        'previous_status', 'account',
        'new_status', 'admitted',
        'admission_year_id', lp.admission_year_id,
        'institution_id', lp.institution_id,
        'name', lp.first_name || ' ' || COALESCE(lp.last_name, ''),
        'reason', 'Bills unwound (no settled receipts); reverting to admitted'
    )::text
  FROM public.learners_profiles lp
  JOIN public.admission_years ay ON ay.id = lp.admission_year_id
 WHERE ay.is_active = true
   AND lp.lifecycle_status::text = 'account'
   AND lp.id <> 'a3d36abb-e6df-4b84-b93a-d79f7439ae7a'::uuid
ON CONFLICT (table_name, column_name, observed_value) DO UPDATE
   SET review_notes = EXCLUDED.review_notes,
       updated_at   = now();

-- ───────────────────── Step 2: Delete the 269 bills ─────────────────────

DELETE FROM public.billing_student_bills bsb
 USING public.learners_profiles lp,
       public.admission_years ay
 WHERE bsb.student_id = lp.id
   AND lp.admission_year_id = ay.id
   AND ay.is_active = true
   AND bsb.id NOT IN (
       SELECT bill_id FROM public.billing_receipt_items WHERE bill_id IS NOT NULL
   );

-- ───────────────────── Step 3: Revert lifecycle for 203 learners ─────────────────────

UPDATE public.learners_profiles lp
   SET lifecycle_status = 'admitted'::lifecycle_status
  FROM public.admission_years ay
 WHERE ay.id = lp.admission_year_id
   AND ay.is_active = true
   AND lp.lifecycle_status::text = 'account'
   AND lp.id <> 'a3d36abb-e6df-4b84-b93a-d79f7439ae7a'::uuid;
