# Admission Fees — End-to-End Smoke Runbook

**Date:** 2026-05-05
**Spec:** [`../specs/2026-05-05-admission-fee-structure-automation-design.md`](../specs/2026-05-05-admission-fee-structure-automation-design.md)
**Plans 1-6:** [`../plans/2026-05-05-admission-fees-roadmap.md`](../plans/2026-05-05-admission-fees-roadmap.md)

This runbook walks the full feature end-to-end: configure structures → flip the institution flag → create a net-new enquiry → move to account → trigger a fee-change event → approve it. Manual checklist with SQL verification queries between steps. Pass criteria at the bottom.

## Prerequisites

- One test institution with `use_fee_structures = false` (default state) — call it INST_A.
- Admin user with `super_admin` role.
- A second institution (INST_B) at default flag-off state — used to verify isolation.

---

## Phase 1 — Configure & flip flag

1. As admin, visit `/admission/settings/lookups/quotas`. Confirm 8 canonical seeds.
2. Visit `/admission/settings/lookups/community-categories`. Confirm 9 seeds.
3. Visit `/admission/settings/lookups/accommodation-types`. Pick INST_A. Confirm 4 starter rows (hostel, dayscholar, pg, not_applicable).
4. Visit `/admission/settings/lookups/data-quality`. Note count of pending DQR rows; map any obvious aliases to canonical IDs.
5. Visit `/admission/settings/fees-structure`. Drill INST_A → some degree → department → programme → quota=Government → community=OC → accommodation=Hostel → year 2026-27. Click "+ New Fee Structure".
6. Add 3 line items: Tuition (₹50,000), Hostel Fee (₹30,000), Library Fee (₹2,000). Save.
7. Visit `/admission/settings/general`. Pick INST_A. Toggle "Use Fee Structures" ON. Soft-warn dialog appears if no structures configured for that combo — accept and proceed if so (your structure from Step 6 should make the soft-warn skip).

**Verify:**
```sql
SELECT use_fee_structures
  FROM admission_settings_per_institution
 WHERE institution_id = '<INST_A_id>';
-- Expected: true.

SELECT count(*) FROM admission_fee_structures WHERE institution_id = '<INST_A_id>';
-- Expected: ≥ 1.

SELECT count(*) FROM admission_fee_structure_items
 WHERE fee_structure_id IN (SELECT id FROM admission_fee_structures WHERE institution_id = '<INST_A_id>');
-- Expected: ≥ 3.
```

---

## Phase 2 — Net-new enquiry (matrix-driven)

8. Create a new enquiry in INST_A with the dims matching the structure (B.Tech CSE / Government / OC / Hostel / 2026-27). Course Selection + Accommodation tabs filled in.
9. Open the Finance tab. Expected:
   - Structure rows auto-populated (3 read-only rows: Tuition, Hostel Fee, Library Fee)
   - Resolved Total = ₹82,000
   - No manual repeater
   - No "Adjustments" section visible until learner is saved (create mode)
10. Final-submit. Pre-submit dialog opens (read-only summary). Confirm. Lead saved.

**Verify:**
```sql
SELECT legacy_fee_mode, jsonb_array_length(fee_items)
  FROM learners_profiles
 WHERE id = '<new_lead_id>';
-- Expected: legacy_fee_mode=false, fee_items count = 3.

SELECT (item->>'category_name')::text AS name, (item->>'amount')::numeric AS amount
  FROM learners_profiles, jsonb_array_elements(fee_items) AS item
 WHERE id = '<new_lead_id>';
-- Expected: 3 rows summing to 82,000.
```

---

## Phase 2.5 — Add adjustments (after lead exists)

11. Re-open the saved enquiry. Navigate to Finance tab.
12. Adjustments section now visible. Click "+ Add Adjustment".
13. Add: reason_code=`scholarship_merit`, billing_category=Tuition Fee, delta_amount=-5000. Save.
14. Resolved Total panel updates to ₹77,000.

**Verify:**
```sql
SELECT count(*) FROM admission_fee_adjustments
 WHERE learner_id = '<new_lead_id>' AND status = 'active';
-- Expected: 1.

SELECT (item->>'category_name')::text AS name, (item->>'amount')::numeric AS amount
  FROM learners_profiles, jsonb_array_elements(fee_items) AS item
 WHERE id = '<new_lead_id>';
-- Expected: Tuition row now 45,000 (50,000 + (-5,000)); other 2 unchanged.
```

---

## Phase 3 — Status='account' transition

15. From admission/leads, find the new lead. Move funnel_stage to a late-funnel state (`documents_verified`, `offer_accepted`, `token_paid`, `enrolled`, or `confirmed`).
16. Click "Move to Account". Dialog opens with fee summary (top panel) + documents checklist (bottom panel).
17. Tick all required docs (PAN, Aadhaar, parent_id, agreement_form). Pick received_via for each. Confirm.

**Verify:**
```sql
SELECT lifecycle_status FROM learners_profiles WHERE id = '<new_lead_id>';
-- Expected: 'account'.

SELECT count(*) FROM billing_student_bills WHERE student_id = '<new_lead_id>';
-- Expected: 3 (one per fee_items entry).

SELECT count(*) FROM learner_admission_documents WHERE learner_id = '<new_lead_id>';
-- Expected: 4 (one per required doc).
```

---

## Phase 4 — Fee-change reconciliation

18. Configure a SECOND fee structure for INST_A with a different programme (e.g. B.Tech ECE) — Tuition ₹52,000, Hostel ₹30,000, Library ₹2,500, Lab Fee ₹5,000 (introduces a new category).
19. Update the test lead's `program_id` to that B.Tech ECE programme.

**Verify the trigger fires:**
```sql
SELECT id, status, trigger_field, requested_at
  FROM admission_fee_change_events
 WHERE learner_id = '<new_lead_id>'
 ORDER BY requested_at DESC LIMIT 1;
-- Expected: 1 row, status='pending_review', trigger_field='program_id'.

SELECT count(*) FROM admission_fee_change_event_lines WHERE event_id = '<event_id>';
-- Expected: ≥ 4 (3 from old + 4 from new merged by category).
```

20. Visit `/billing/onboarding`. Notification bell shows badge "1". Click. Side panel shows the event. Click event.
21. Per-event review modal: pick decisions per line:
    - Tuition (50,000 → 52,000, paid 0): `apply_supplemental` (delta = +2,000)
    - Hostel Fee (30,000 → 30,000, paid 0): `do_nothing` (no delta)
    - Library Fee (2,000 → 2,500, paid 0): `apply_supplemental` (delta = +500)
    - Lab Fee (— → 5,000, paid 0, NEW): `apply_supplemental`
22. Click Approve.

**Verify:**
```sql
SELECT status, decided_at FROM admission_fee_change_events WHERE id = '<event_id>';
-- Expected: 'approved', decided_at populated.

SELECT status, COUNT(*) FROM billing_student_bills
 WHERE student_id = '<new_lead_id>' GROUP BY status;
-- Expected: 3 'unpaid' (original) + 3 NEW 'unpaid' (supplementals for tuition+library+lab).

SELECT bill_description, final_amount FROM billing_student_bills
 WHERE student_id = '<new_lead_id>' AND remarks LIKE 'Supplemental%';
-- Expected: 3 supplemental bills (₹2,000, ₹500, ₹5,000).
```

---

## Phase 5 — Activation gate

23. Try to activate the lead before payments are made. Expected: error toast "Cannot activate: a pending fee-change event must be resolved first" — NO, this gate already cleared in Phase 4.
24. Try to activate without paying any bills. Expected: error toast "Cannot approve learner: 6 bill(s) totalling ₹89,500 still unpaid" (or similar — checks `balance_amount = 0`).
25. (Optional) Manually mark all bills as paid via SQL or receipts. Then activate.

**Verify:**
```sql
SELECT lifecycle_status FROM learners_profiles WHERE id = '<new_lead_id>';
-- Expected after Step 25: 'active'.
```

---

## Phase 6 — Legacy adoption

26. Pick a flag-on institution lead with `legacy_fee_mode=true` (a row that was admitted before the flag flip).
   ```sql
   SELECT id FROM learners_profiles
    WHERE institution_id = '<INST_A_id>'
      AND legacy_fee_mode = true
      AND lifecycle_status IN ('admitted','pending','approved')
    LIMIT 1;
   ```
27. Visit its Finance tab. Banner shows: "Legacy fees: this lead uses manual fee entry. Migrate to fee structure".
28. Click "Migrate to fee structure". Preview shows old vs structure-derived. Confirm.

**Verify:**
```sql
SELECT legacy_fee_mode, jsonb_array_length(fee_items)
  FROM learners_profiles WHERE id = '<adopted_lead_id>';
-- Expected: legacy_fee_mode=false, fee_items populated.
```

---

## Phase 7 — Activity log audit

29. Query the activity log:

```sql
SELECT action_type, COUNT(*)
  FROM user_activity_logs
 WHERE created_at > now() - interval '1 hour'
   AND (
        action_type LIKE 'fee_%'
     OR action_type LIKE 'enquiry.fee_%'
     OR action_type = 'lifecycle.account_transition'
     OR action_type = 'documents.received'
     OR action_type LIKE 'bill.%'
     OR action_type LIKE 'student_credit_balance.%'
     OR action_type LIKE 'fee_change_event.%'
     OR action_type LIKE 'fee_adjustment.%'
   )
 GROUP BY 1
 ORDER BY 1;
```

Expected entries (from this smoke):
| Action | Phase | Count |
|---|---|---|
| `fee_adjustment.added` | 2.5 | 1 |
| `enquiry.fee_resolved` | 2 | 1 |
| `lifecycle.account_transition` | 3 | 1 |
| `documents.received` | 3 | 4 |
| `bill.auto_generated` | 3 | 1 |
| `fee_change_event.approved` | 4 | 1 |
| `bill.superseded` | 4 | 0 (no reallocate decisions chosen) |
| `student_credit_balance.created` | 4 | 0 (no credit decisions chosen) |
| `enquiry.legacy_fee_adopted` | 6 | 1 |

---

## Phase 8 — INST_B isolation check

30. Create an enquiry in INST_B (flag-off institution). Navigate to Finance tab.
31. Expected:
    - **No** structure-driven panel
    - Legacy fee fields visible (`tuition_fee`, `hostel_fee`, etc.) since the new lead defaults to `legacy_fee_mode=true` (institution flag is off, so the BEFORE INSERT trigger keeps the default true)
    - **No** "Migrate to fee structure" banner (Plan 6 Task 2 gates the banner on the institution flag)

**Verify:**
```sql
SELECT legacy_fee_mode FROM learners_profiles WHERE id = '<inst_b_lead_id>';
-- Expected: true (BEFORE INSERT trigger left default unchanged because flag is off).
```

---

## Pass criteria

All SQL verifications match expected. Notification bell badge updates within 30s. Pre-submit dialog gates submission. Status-change dialog gates Confirm until docs ticked. Activation blocks while pending event exists. Banner does NOT appear in flag-off institution. Lead in flag-off institution defaults to `legacy_fee_mode=true`.

If ANY step fails, file a bug with:
- Phase + step number
- Expected vs actual SQL output
- UI screenshot if relevant
- Recent commits that may have caused regression (compare against the Plan 1-6 commit list in the roadmap retrospective)

---

## Cleanup (optional)

After smoke completion, restore INST_A to a clean state:
```sql
UPDATE admission_settings_per_institution SET use_fee_structures = false WHERE institution_id = '<INST_A_id>';
DELETE FROM admission_fee_change_events WHERE learner_id = '<new_lead_id>';
DELETE FROM admission_fee_adjustments WHERE learner_id = '<new_lead_id>';
DELETE FROM billing_student_bills WHERE student_id IN ('<new_lead_id>','<adopted_lead_id>');
DELETE FROM learner_admission_documents WHERE learner_id = '<new_lead_id>';
DELETE FROM learners_profiles WHERE id IN ('<new_lead_id>','<adopted_lead_id>','<inst_b_lead_id>');
```

(Don't delete fee_structures or lookup-table rows — those are reusable for future smokes.)
