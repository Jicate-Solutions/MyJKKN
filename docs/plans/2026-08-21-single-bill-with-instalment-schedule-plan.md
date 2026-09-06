# One Bill Per Fee, With an Instalment Schedule Inside It

**Date:** 2026-08-21 · **Status:** IMPLEMENTED 2026-08-22, NOT BROWSER-TESTED ·
Supersedes the split-into-N-bills behaviour of `20260821190000`.

> **Shipped.** Three migrations applied (`20260822090000` / `100000` / `110000`) plus
> the TypeScript generation path, tests and preview UI. Verified end to end on the
> test learner: **3 bills, not 5.** The threshold view was proved byte-identical for
> all 7,281 live learners before and after. See §8.

---

## 1. The problem, exactly as observed

Three fee items produced **five bills**, because Tuition's 30/40/30 schedule became three
separate `billing_student_bills` rows:

```
Application Fee      Full amount   100%   ₹1,000    05 Sept 2026    —
University Fee       Full amount   100%   ₹5,000    05 Sept 2026    → Reserved
1 Year Tuition Fee   1 of 3         30%   ₹30,000   06 Oct 2026     → Admitted
  ↳                  2 of 3         40%   ₹40,000   20 Sept 2026    —
  ↳                  3 of 3         30%   ₹30,000   20 Sept 2026    —
                                          ─────────
                                          ₹1,06,000   → 5 bills
```

Wanted: **3 bills.** Tuition is ONE receivable of ₹100,000 that happens to be collectable in
tranches. The tranches are a payment schedule, not three debts.

That is also the better model for this codebase, because partial payment is already the norm
here — **1,735 bills are `partially_paid` today**. Paying ₹30,000 against a ₹100,000 bill is
an ordinary, well-trodden path; picking "instalment 2 of 3" at the counter is not.

---

## 2. What constrains the design

`billing_student_bills.due_date` is read by **33 database functions and 1 view**. A bill is
assumed everywhere to be *one amount with one due date*:

| Consumer | What it does with `due_date` |
|---|---|
| `vw_learner_payment_progress` | The fee-paid ladder. `paid_pct` counts a bill only when `due_date <= CURRENT_DATE` |
| `mark_overdue_bills` | `status='overdue' WHERE due_date < CURRENT_DATE` |
| `fn_late_charge_derivation` / `_accrue` / `_preview` | Accrues **10%/month, compounding**, on the **whole `balance_amount`**, from `due_date + grace` |
| `get_billing_analytics_aging`, `get_billing_reports_outstanding`, `ai_rpc_fee_defaulters`, `compute_learner_risk_assessment`, … | Aging buckets, defaulter lists, risk scores |

**The late-charge one is the landmine.** A single ₹100,000 tuition bill dated at its first
tranche would accrue a compounding fine on the *entire* ₹100,000 the moment that tranche
slipped — when only ₹30,000 was actually due.

### The measurement that makes this tractable

| Fact | Count |
|---|---|
| Penalty bills ever raised (late charges) | **0** |
| Bills currently marked `overdue` | **0** |
| Split bills in production (`instalment_group_id` set) | **0** |
| Bills partially paid | 1,735 |
| Live bills total | 19,349 |

Late charging and overdue marking are **configured but dormant** — the rate is set to 10%/month
and 3,024 bills carry a `fine_effective_date`, but not one charge has ever been issued. That is
the window in which this change is safe to make, and the reason the late-charge fix belongs
*in* this work rather than after it.

And because **zero** split bills exist, there is nothing to migrate.

---

## 3. Proposed model

```
billing_student_bills          ONE row per fee item — shape unchanged
   └─ billing_bill_instalments NEW: seq · amount · due_date · promotes_to_status_code
```

### 3.1 The new table

```sql
CREATE TABLE public.billing_bill_instalments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id                 uuid NOT NULL
    REFERENCES public.billing_student_bills(id) ON DELETE CASCADE,
  sequence_no             smallint NOT NULL CHECK (sequence_no >= 1),
  amount                  numeric(15,2) NOT NULL CHECK (amount > 0),
  due_date                date NOT NULL,
  /* Lifecycle status reaching THIS tranche promotes the learner to. */
  promotes_to_status_code text,
  /* Provenance, for audit: which schedule line produced this tranche. */
  fee_structure_item_schedule_id uuid
    REFERENCES public.admission_fee_structure_item_schedules(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_bbi_bill_seq UNIQUE (bill_id, sequence_no)
);
```

A deferred constraint trigger asserts **Σ instalment amounts = bill.final_amount**. A schedule
that does not add up to the debt is a schedule that will silently under- or over-collect.

### 3.2 Allocation: a derived waterfall, never stored

`paid_on_bill = final_amount - balance_amount` (already maintained by `update_bill_status()`).
Walk the instalments in **(due_date, sequence_no)** order; each absorbs up to its amount:

```
Tuition ₹100,000 · paid ₹70,000
  #2  ₹40,000 due 20 Sept   → ₹40,000 allocated   SETTLED
  #3  ₹30,000 due 20 Sept   → ₹30,000 allocated   SETTLED
  #1  ₹30,000 due 06 Oct    → ₹0                  OPEN
```

Nothing is stored, so nothing can drift out of sync with the receipts. Exposed as
`billing_bill_instalment_state(bill_id)` and a view for list screens.

> ⚠️ **Ordering by due date, not sequence.** Your current tuition schedule is 06 Oct / 20 Sept /
> 20 Sept — instalment 1 falls due *last*. Money always settles the oldest debt first, so the
> waterfall must follow the calendar. The consequence: "instalment 1 → Reserved" would fire only
> after ₹70,000, not ₹30,000. **Put the schedule in chronological order** and the two agree.
> The editor already flags out-of-order tranches in amber.

### 3.3 `bills.due_date` becomes the *next* unsettled tranche

Maintained by trigger as payments land: `due_date = earliest UNSETTLED instalment's due date`,
falling back to the last tranche once everything is settled.

This is what keeps all 33 consumers **correct about timing** with no edit:

* `mark_overdue_bills` flags the bill exactly when the next tranche is late.
* Aging, defaulters and risk score bucket on the next tranche.
* The learner's "My Bills" shows the date that actually matters next.

The cost is that `balance_amount` still shows the *whole* remaining debt while only part of it
is currently due — which is fine for display and wrong for one consumer only: late charges.

### 3.4 Late charges: charge the overdue tranche, not the whole balance

`fn_late_charge_derivation` switches its base from `b.balance_amount` to the **overdue amount**:

```
overdue_amount = Σ instalment.amount WHERE due_date + grace < today   −   paid_on_bill
```

For a bill with no instalments this is exactly `balance_amount`, so all 19,349 existing bills
behave identically. Zero charges have ever been raised, so there is no history to reconcile.

**This is the one place in the plan where getting it wrong costs real money**, which is why it
is in scope rather than deferred.

### 3.5 The threshold ladder

`vw_learner_payment_progress` becomes instalment-aware:

| Bill | Due-as-on-date denominator | Numerator |
|---|---|---|
| **with** instalments | Σ tranche amounts with `due_date <= today` | `min(paid_on_bill, that denominator)` |
| **without** (all 19,349 today) | `final_amount` when `due_date <= today` — unchanged | `final_amount - balance_amount` |

The `min()` is the waterfall restated: an early payment covers the earliest tranches, so paid
money never counts against a tranche that has not come due.

### 3.6 Promotion (Stage A0)

Instead of matching bills to schedule lines by `instalment_no = sequence_no`, Stage A0 reads
`billing_bill_instalments` and treats a tranche as satisfied when the waterfall covers it. Same
rule semantics, same promotion-only guarantee, one indirection fewer.

### 3.7 What the transition RPC does instead

For each fee item: insert **one** bill for the full amount, then insert its tranches. The
`instalment_group_id` splitting path is removed from generation.

The columns and the `once_per_learner` group exemption stay in place but become unreachable —
with one bill per fee, `once_per_learner` is satisfied naturally. Removing them is a separate
cleanup with no benefit; leaving them inert costs nothing.

---

## 4. What the modal will show

Three bills, tuition carrying its schedule inside one row:

```
FEE PARTICULARS      DUE / SCHEDULE                       AMOUNT
Application Fee      05 Sept 2026                         ₹1,000
University Fee       05 Sept 2026            → Reserved   ₹5,000
1 Year Tuition Fee   3 instalments · next 20 Sept 2026   ₹1,00,000
    20 Sept 2026   40%   ₹40,000
    20 Sept 2026   30%   ₹30,000
    06 Oct 2026    30%   ₹30,000   → Admitted
                                                         ─────────
                          3 bills will be generated      ₹1,06,000
```

---

## 5. Work breakdown

| Phase | Scope |
|---|---|
| **P1** | Migration: `billing_bill_instalments` + RLS (inherits the bills policy) + sum-equals-bill validator + `types/supabase.ts` |
| **P2** | `billing_bill_instalment_state()` waterfall function + a list-friendly view |
| **P3** | Generation: transition RPC emits ONE bill + tranches; TS path (`expandBillsWithInstalmentPlans`) mirrors it; preview RPC reshaped |
| **P4** | `bills.due_date` next-unsettled trigger |
| **P5** | `vw_learner_payment_progress` instalment-aware + Stage A0 reads tranches |
| **P6** | Late-charge base → overdue amount |
| **P7** | UI: modal preview, bill lists, learner "My Bills" show the schedule under one bill |

P1–P2 add only. Every behaviour change lands in P3–P6, and each is a no-op for a bill with no
tranches — which is all 19,349 of them.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| Late charge over-charging on the full balance | Fixed in P6, in the same change set. Dormant today (0 raised), so there is no back-catalogue to correct. |
| `vw_learner_payment_progress` is load-bearing for the 30% ladder, onboarding approval and campus-living gates | Rewritten so a bill with no tranches takes the identical code path; verified against live percentages before and after. |
| A moving `due_date` mutates history | It is already mutable (bulk edit writes it). The tranche rows are the immutable record; `due_date` becomes a derived convenience. |
| Waterfall vs sequence disagreement | Order by due date, and fix the out-of-order tuition schedule. Editor already warns. |
| Two generation paths drifting | Both keep consuming one engine, as now. |

---

## 7. Decisions needed

* **D1 — Allocation order.** FIFO by due date (recommended) vs strictly by sequence number.
* **D2 — `bills.due_date`.** Track the next unsettled tranche (recommended) vs pin to the first
  tranche vs pin to the last.
* **D3 — Late charges.** Fix the base to the overdue tranche now (recommended) vs leave and
  document the landmine.
* **D4 — Split machinery.** Leave `instalment_group_id` inert (recommended) vs remove it.

---

## 8. What shipped — 2026-08-22

### 8.1 Migrations

| File | Contents |
|---|---|
| `20260822090000_billing_bill_instalments.sql` | `billing_bill_instalments` + RLS; sum-equals-bill validator (deferred); proportional rescale on a bill amount edit; `billing_bill_instalment_state()` waterfall; `vw_bill_instalment_state` set-based form |
| `20260822100000_single_bill_generation_and_due_date_sync.sql` | `bbi_sync_bill_due_date()` + its two triggers; the account-transition RPC now emits **one bill + N tranches** |
| `20260822110000_instalment_aware_threshold_and_late_charge.sql` | `vw_learner_payment_progress` tranche-aware; Stage A0 reads tranches; late charges accrue on the overdue amount |

Application code: `attachInstalmentSchedules` (was `expandBillsWithInstalmentPlans`),
`onboarding-service` inserts bills then tranches, `types/supabase.ts`, preview UI
counts bills, 33 unit tests rewritten, `supabase/setup/` mirrored.

### 8.2 Verified

**Generation — the actual ask:**

```
BILLS GENERATED: 3   (was 5 under the old split model)
  Application Fee        Rs 1,000      due 2026-09-06  tranches=0
  University Fee         Rs 5,000      due 2026-09-06  tranches=0
  1 Year Tuition Fee     Rs 1,00,000   due 2026-09-21  tranches=3
```

**The waterfall**, on a schedule deliberately authored out of order:

```
After Rs 70,000 paid on the tuition bill
  seq 2  40,000  due 2026-09-21  settled=true   -> —
  seq 3  30,000  due 2026-09-21  settled=true   -> —
  seq 1  30,000  due 2026-10-06  settled=false  -> admitted
```

Money followed the calendar, not the sequence number. Status stayed `account`,
correctly — the tranche carrying the rule was not covered. Paying the rest settled
it and Stage A0 promoted to `admitted`, logging
`auto_item_rule` / `bill_instalment_schedule`.

**`due_date` tracking:** after that Rs 70,000, the bill's `due_date` advanced from
2026-09-21 to 2026-10-06 — the next unsettled tranche. This is what keeps the 33
untouched consumers right about timing.

**Threshold view — the highest-stakes change.** Recomputing the *old* formula
alongside the new one, learner by learner, at the same instant:

```
learners_compared    7281
pct_due_mismatch        0
pct_billed_mismatch     0
due_billed_mismatch     0
due_paid_mismatch       0
```

Zero mismatches. (An aggregate snapshot taken before and after showed a +Rs 1,000
difference — traced to exactly one real receipt recorded by a live user between the
two reads, not to the change.)

**Also proved:** the sum-equals-bill validator rejects tranches totalling Rs 70,000
against a Rs 1,00,000 bill; discounting that bill to Rs 90,000 rescaled 40/30/30 to
36/27/27, still summing exactly; and `vw_bill_instalment_state` agrees with
`billing_bill_instalment_state()` row for row.

64 unit tests pass. Lint clean on every touched file.

### 8.3 Not verified

* **No browser testing.** The dialog, the preview and the bill list have not been
  rendered against a real schedule.
* **`admission_account_transition_with_bills` has still never been invoked end to
  end** — it gates on `auth.uid()`, which a SQL probe lacks. Its generation loop was
  replayed verbatim (§8.2). Onboard the test learner through the UI to close this.
* The `bbi_rescale_on_bill_amount_change` trigger has not been exercised through the
  real discount/waiver UI, only directly.

### 8.4 Carried forward, deliberately

* `instalment_group_id` / `instalment_no` / `instalment_count` on
  `billing_student_bills`, and the `once_per_learner` group exemption, are now
  **unreachable** — one bill per fee satisfies `once_per_learner` naturally. Left in
  place: zero production bills ever used them, and dropping columns from a 19k-row
  table to delete harmless dead code is the worse trade.
* Late charges **under-charge by design**: one overdue total compounding from the
  earliest overdue tranche, rather than per-tranche accrual. Per-tranche is more
  precise and can follow; over-charging cannot be walked back once a fine is issued.

### 8.5 Fix your test schedule before relying on it

The tuition tranches are dated **06 Oct / 20 Sept / 20 Sept** — sequence 1 falls due
last, so the waterfall settles tranches 2 and 3 first and the rule on tranche 1 fires
last. Reorder them chronologically and sequence and calendar agree. The fee-structure
editor already flags this in amber.
