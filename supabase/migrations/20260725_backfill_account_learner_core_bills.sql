-- One-time backfill: generate the missing core academic bills for learners
-- sitting in lifecycle_status='account' with no bill for a fee item they owe.
--
-- WHY: between 2026-06-21 (when the Campus Living academic branch was removed)
-- and 2026-07-25 (when the paired hosteller skip in
-- admission_account_transition_with_bills was retired), hostellers promoted to
-- 'account' had their fee_items resolved correctly but NO bills inserted — the
-- two code paths each assumed the other owned the academic portion. The failure
-- was silent: every admission screen showed a complete fee structure.
--
-- POPULATION AT TIME OF WRITING: 53 bills across 17 learners, Rs 27,36,500.
-- All 17 are hostellers (Pharmacy 13, Nursing 2, Engineering 2). All 49
-- day-scholar 'account' learners were already fully covered, as were all
-- 'reserved' and 'admitted' learners — the gap is confined to this cohort.
-- All 17 resolve cleanly against the CURRENT fee structure with zero drift
-- between their stored fee_items and admission_resolve_fee_items_for_lead, so
-- this bills from the stored snapshot without needing a re-resolve.
--
-- SCOPE: core academic only. hostel / mess / transport kinds are deliberately
-- excluded — Campus Living owns hostel+mess, TMS owns transport. Billing them
-- here would double-bill, because the Campus Living dedup keys on
-- hostel_year_id and cannot see a NULL-stamped bill written from this path.
--
-- IDEMPOTENT: the NOT EXISTS guard is per learner+category, so re-running is a
-- no-op. It does NOT use the all-or-nothing "learner has zero bills" guard that
-- the RPC uses, because a learner may be partially billed.
--
-- academic_year_id is set explicitly (rather than relying on
-- trg_billing_bill_default_academic_year) so the intent is auditable, using the
-- same same-institution guard as that trigger. All 17 have a matching year;
-- 0 are cross-institution.

INSERT INTO public.billing_student_bills (
    student_id, institution_id, academic_year_id, item_category_id,
    bill_description, due_date, quantity,
    unit_amount, total_amount, tax_amount, final_amount,
    balance_amount, status, fee_source, remarks
)
SELECT
    lp.id,
    lp.institution_id,
    ay.id,
    bc.id,
    bc.category_name,
    (CURRENT_DATE + INTERVAL '30 days')::date,
    1,
    (item->>'amount')::numeric,
    (item->>'amount')::numeric,
    0,
    (item->>'amount')::numeric,
    (item->>'amount')::numeric,
    'unpaid',
    'academic',
    'Backfill 2026-07-25 — core academic bill missed by the hosteller skip in admission_account_transition_with_bills'
FROM public.learners_profiles lp
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(lp.fee_items, '[]'::jsonb)) AS item
JOIN public.billing_categories bc
       ON bc.id = NULLIF(item->>'category_id', '')::uuid
LEFT JOIN public.academic_years ay
       ON ay.id = lp.academic_year_id
      AND ay.institution_id = lp.institution_id
WHERE lp.lifecycle_status = 'account'
  AND bc.kind NOT IN ('hostel', 'mess', 'transport')
  AND (item->>'amount')::numeric > 0
  AND NOT EXISTS (
        SELECT 1
          FROM public.billing_student_bills b
         WHERE b.student_id = lp.id
           AND b.item_category_id = bc.id
           AND b.superseded_by_bill_id IS NULL
           AND COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
      );
