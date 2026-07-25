# SPEC — Referral Incentive Release, Academic Year 2025-26

**Status:** Requirements locked 2026-07-21 · Implementation not started
**Owner:** Omm (Director-facing) · **Decided via:** structured interview 2026-07-21
**Objective (stated):** *"We owe people money and haven't paid — settle the debt."*

Because the goal is **debt settlement**, the optimisation is **speed and fairness**: where a record is
ambiguous, lean toward paying rather than withholding, and do not let perfect matching hold up clear
cases. This ranking decides every trade-off below.

---

## 1. Verified current state (evidence, 2026-07-20/21)

Every line here was checked against production (`kvizhngldtiuufknvehv`), not assumed.

### 1.1 Attribution

| Fact | Value |
|---|---|
| 2025-26 admissions | **1,863** |
| 2025-26 with referral attribution | **0** — capture began 2026-02-26 |
| 2026-27 admissions | 2,138 |
| 2026-27 with `referral_type` | 853 |
| 2026-27 with `referred_by_id` | 718 |
| **Claims naming a type but no referrer** | **135** (consultant 37, faculty 37, student 61) |

All 2025-26 referral records exist **outside the system** (Director-held).

### 1.2 The referrer link is untyped

`learners_profiles.referred_by_id` has **no foreign key**. It is a polymorphic pointer resolved by
`referral_type`:

- `consultant` → `education_consultants` (28 distinct, 511 referrals, 100% resolve)
- `faculty` → `staff` (51 distinct, 161 referrals, 100% resolve)
- `student` → `learners_profiles` (29) + `profiles` (2)

Nothing in the database enforces this. **This is how the 135 unlinked rows happened**, and it will
recur unless the import validates the pointer.

### 1.3 Payment rails

| Referrer type | Rail exists? | Detail |
|---|---|---|
| **Agency (consultant)** | ✅ **Yes, complete** | `bank_account_number`, `bank_ifsc`, `pan_number`, `gst_number` on file. `consultant_payout_batches` implements prepare → review → approve → process with `payment_mode` + `bank_reference`. |
| **Staff (faculty)** | ❌ **None** | `consultant_commission_transactions.consultant_id` is a FK to `education_consultants`. A staff member cannot receive a row. |
| **Student** | ❌ None | Out of scope (§3). |

`referral_rewards` is **not** a cash table — it is a perks/redemption model (`reward_type`,
`redeemed_at`, `expires_at`) and is also keyed on `consultant_id`.

### 1.4 Rates and machinery

| Item | State |
|---|---|
| `consultant_commission_structures` (agency rates) | **0 rows** — 49 active consultants have no rate |
| `referral_reward_configs` | 0 rows |
| `consultant_commission_transactions` | 0 rows — **no payment history has ever existed** |
| `consultant_payout_batches` | 0 rows |
| Rate-entry UI | ✅ **Exists and can save** (`commission-structure-tab.tsx`, `rewards/page.tsx`) |
| `ConsultantService.calculateCommission` | ✅ **Exists** (rate, %/flat, milestones, volume tiers, caps) — **0 callers**, and reads 4 phantom columns (§2.2) |
| `ConsultantService.createCommissionTransaction` | ✅ Exists — a dumb insert, computes nothing, **no UI caller** |
| `consultant_commission_trigger_config` | 4 rows; auto-triggers `creates_commission=false` (deliberately dark), `manual`=true |
| **Screen to enter a commission transaction** | ❌ **None exists anywhere** |
| **Importer for payment history** | ❌ **None** |

> **Correction to prior record:** the earlier claim *"no function/service/button anywhere creates a
> commission transaction"* was **wrong**. Rates are **empty configuration, not a missing build.**

### 1.5 Payroll

Built but never run. 93 `hr_*` tables exist including `hr_pay_components` (**98 rows**),
`hr_incentive_schemes` (with `payout_formula`, `eligibility_criteria`, `cap_amount`).

| Table | Rows |
|---|---|
| `hr_employees` | **0** — HR module knows about none of the 844 staff |
| `hr_pay_scales` | 0 |
| `hr_attendance_records` | 0 |
| `hr_payroll_periods` / `hr_payslips` / `hr_payslip_line_items` | 0 |

Salaries are evidently run outside MyJKKN.

---

## 2. Blockers discovered

### 2.1 🔴 Enrolment status is not trustworthy — **blocks the eligibility rule**

2025-26 cohort: 1,453 `active`, **319 `graduated`**, 90 `inactive`, 1 `enquiry`.

**All 319 "graduated" are on 2-year (129) or 3-year (190) courses.** A Master's begun in 2025-26
finishes 2027; a Bachelor's 2028. **Not one could have graduated.** The flag is wrong.

Fee receipts are not a usable fallback either — only **42% of `active`** students have any 2026
receipt (607 of 1,863 overall), implausibly low for a live cohort.

**→ Resolution (D6/D29–D32):** don't rely on `lifecycle_status`. **Auto-confirm any claimed student
with recent (this-term) attendance *or* session feedback** — proof of presence — and send only the
rest to the registrar. Measured coverage: ~53% of the cohort has such a signal; the other ~47% have
none because their **college doesn't mark attendance in this system**, so absence of signal means
"unknown → registrar", never "not studying". Re-check at payment time, not just at claim time.

### 2.2 🟡 The same schema drift exists on commission *structures*

`calculateCommission` reads `rate_type`, `calculation_method`, `milestone_config`,
`max_commission_per_student` on `consultant_commission_structures` — **none exist**. It fails *soft*:
the phantom branches fall through and **every commission computes as the flat `base_rate`**, silently
ignoring percentages, milestones and caps. It currently has 0 callers, so it is harmless until wired.

### 2.3 ✅ Fixed — approve/clawback silently no-opped (PR #2219, open)

`ConsultantCommissionTransaction` was fiction: 9 of 22 fields named non-existent columns, hidden by
`(supabase as any)`. Approve sent `status_changed_at`/`status_changed_by` → PostgREST `PGRST204`,
whole request rejected. **No approval on that page has ever persisted.** Clawback broke identically
(`clawback_at`); amounts rendered `₹NaN`; `approved_by`/`approved_at` were never written; the
`lead_id` filter raised `42703`; and the insert input omitted the NOT NULLs `gross_amount`,
`net_amount`, `transaction_type`.

### 2.4 ✅ Fixed — entry date hard-locked (PR #2220, open)

Now bounded `2025-01-01 → today`, gated to super-admin / admission-global.

### 2.5 🔴 No payment history → double-pay risk

Zero rows in every payment table. Any 2025-26 payment already made by hand is recorded nowhere.

---

## 3. Decisions (locked 2026-07-21)

| # | Decision | Rationale / consequence |
|---|---|---|
| **D1** | **Goal = settle a debt.** Optimise speed + fairness over precision | Lean toward paying in ambiguity |
| **D2** | **One standard rate**, known to all at the time | We honour a promise, we don't invent a number |
| **D3** | **Rate shape = flat amount, varying by course or institution** | **No dependency on fee data** — avoids a third data blocker |
| **D4** | **Who is owed: agencies AND staff.** Students excluded (tracking only) | Staff have no rail — see D5 |
| **D5** | **Staff paid via payroll, with salary** — not as suppliers | Tax: employee incentive is pay, not a supplier bill. Finance to confirm |
| **D6** | **Eligibility = admitted 2025-26 AND still studying.** Those "admitted but not studying now" are excluded | Cannot use `lifecycle_status` (§2.1) → verify **only claimed students** against the registrar's roll |
| **D7** | **Sequencing: pay agencies NOW; staff in wave 2** when payroll is live | Agencies are 100% unblocked; making them wait months defeats D1 |
| **D8** | **Stand up MyJKKN payroll** as its own tracked project | Prerequisite for the staff wave, not a blocker on agencies |
| **D9** | **Payment history: build a minimal import screen (~1 day), then load through it** | Safe one-way door: upload → validate → exception report → approve → write |
| **D10** | **Approval = full four-stage chain** (prepare → review → approve → process) | Separation of duties on a money table with no prior records |
| **D11** | **Self-referral hard-blocked** (referrer id = learner id). Suspected **family flagged only** | Surname matching unreliable — Tamil naming often uses initials/father's name |
| **D12** | **Duplicate claims: pay neither, flag for decision** | Double payment is hard to recover |
| **D13** | **The 135 unlinked → review list, pay nothing, drop nobody** | Also settles: a generator keyed on `referred_by_id` silently loses them |
| **D14** | **Clawback: automatic, full amount, 90-day window**, stored as config | Applies to future runs |
| **D15** | **Calculator: repair + manual entry point, never auto-fires** | Auto-triggers stay `creates_commission=false` |
| **D16** | **Nothing pays out before matching + history load** | Hard gate |
| **D17** | Backdating floor `2025-01-01` | Shipped (#2220) |

### Decisions added 2026-07-22 (importer + release + enrolment interviews)

| # | Decision | Rationale / consequence |
|---|---|---|
| **D18** | **Approve promotes the CLEAN rows now; flagged / no-match stay on a to-do list** | Partial approval — a few messy rows don't hold up hundreds of good ones |
| **D19** | **Verdict overrides allowed — senior approver only, every override logged** | Real cases that don't fit the rules get through, but always with a name attached |
| **D20** | **Approving the upload only records verified CLAIMS (who is owed); paying is a separate step** | Loading a file can never move money by itself. Already-paid rows still write to the double-pay ledger |
| **D21** | **Corrections = both on-screen edit (small) AND re-upload (big)** | Convenience for typos + file-as-source-of-truth for bulk |
| **D22** | **On-screen edits = senior approver only, row re-validated + logged** | An edit to an amount is as powerful as an override (D19), so same control |
| **D23** | **Refuse any upload whose columns don't exactly match the template** | Hard stop against wrong-file uploads (last year's sheet, non-referral data) |
| **D24** | **Warn before creating anything already on record from an earlier upload** | The in-file dup check (D12) only sees one file; this dedupes ACROSS uploads |
| **D25** | **The upload auto-generates the registrar's enrolment check-list** | F1 → F3 handoff is automatic; no one compiles it by hand |
| **D26** | **Build the importer AND the payment machine in parallel** | Release machinery is shared across all years; don't serialise |
| **D27** | **First real run = a small group of agencies with complete bank details, then widen** | Rehearse the full chain incl. the actual transfer before the big run |
| **D28** | **The importer writes CANONICAL attribution** (`learners_profiles.referred_by_id` etc.), not a parallel structure | It is the bulk cousin of the 2026-27 lead-form "add referral" — same destination, so the shared release flow serves both years. **Release works for NO year yet** (ledger 0 rows ever); it is the real shared build |
| **D29** | **"Still studying" = auto-confirm anyone with recent attendance OR feedback; registrar checks only the rest** | Uses proof of presence we already have; shrinks the registrar's list to those with no digital footprint (~half) |
| **D30** | **No attendance + no feedback = UNKNOWN → registrar. NEVER auto-reject** | ~47% of the cohort has no record because their college doesn't mark attendance in the system, NOT because they left. Absence of signal ≠ not studying |
| **D31** | **Recency threshold = this term / last ~2 months** | "Currently studying" means active now, not "seen once in February" |
| **D32** | **Re-check "still studying" at the moment of payment, not just at claim time** | A student can leave between confirmation and payout; catch it before money moves |

### Decisions added 2026-07-22/23 (upload-screen interview)

| # | Decision | Rationale / consequence |
|---|---|---|
| **D33** | **Show enrolment status inline in the upload report** — green "confirmed studying" (attendance/feedback) vs amber "registrar to check" per student | One picture up front; fewer surprises at payment |
| **D34** | **Already-paid rows create a `paid` record on approve** | Populates the double-pay ledger — the main protection against paying twice. The generator then skips these learners |
| **D35** | **Upload + preview = any admission-team member; approving the SAVE = senior only** | Same separation-of-duties principle as the payout (D10) — preparer ≠ committer |
| **D36** | **Conflict (student already attributed to a DIFFERENT referrer): write-once, never overwrite; record a DISPUTE, do not adjudicate; surface to the consultant-portal contest window.** No credit rule invented | ⚠️ There is **no evidence layer** to adjudicate on: `referral_code` 0% populated, `is_verified` 98% (non-discriminating), `referral_source`='auto_sync_lead'. Attribution today is an **assertion typed into a form**, not a measured event — so any first-touch/last-touch/Shapley rule would be false precision. For 2025-26 it is **near-moot** (0 existing attributions). Real fix is upstream (a student-verifiable referral code at capture); the portal contest is the only grounded distributed check. Write to the **full attribution record** (`consultant_lead_attributions`) so verify/dispute/split are available |
| **D37** | **Old payments: owed = `amount_agreed − amount_paid`, and only when the FILE shows a higher agreed figure.** A bare past payment with no higher agreed amount is **final** | Honour what was promised in writing; never apply today's rate backwards to reopen settled deals |
| **D38** | **Blank amount on a clean row: record the referral with amount "to be set" — not payable until an amount exists.** Never auto-apply the rate to a deliberately-blank row | The referral isn't lost, but nothing pays on a blank |
| **D39** | **Messy file: warn strongly above a high mismatch share, require confirmation, then approve the good rows** (bad rows to the to-do list) | A high no-match rate usually means the wrong file/column; confirm before writing, but don't hold good rows hostage (D18) |
| **D40** | **Access to a past upload: admission admins + the uploader** | Keeps student names + payment details within the team that needs them |

---

## 4. Scope

**In scope:** agency payments for 2025-26; staff *entitlement calculation and record* (payment in
wave 2); payment-history import; claim matching + exception reporting; per-course rate table;
calculator repair; four-stage payout run.

**Out of scope:** student referrer payments; percentage-of-fee rates; fixing all 1,863 enrolment
statuses; the payroll cutover itself (tracked separately, D8); automatic commission generation.

---

## 5. Required inputs (not yet received — these gate delivery)

| Input | From | Gates |
|---|---|---|
| **Referral payment history** (already-paid list) | Director | F1 — everything |
| **2025-26 referral claims** (the filled template — carries application numbers) | Director | F1/F2 |
| **Rate table**: amount per course/institution | Director | F4, F6 |
| **Named people for the 4 approval roles** | Director/Finance | F6 |
| Registrar confirmation — **only for claimed students with no attendance/feedback signal** (D29/D30) | Registrar | F3 |
| **Bank details + PAN for the ~26 agencies missing them** (only 23 of 49 payable) | Agencies/office | F6 |
| Written Finance sign-off on staff-via-payroll treatment | Finance | F7 |

---

## 6. Feature breakdown

Dependency order. Each carries acceptance criteria; test steps live in `features.json`.

### F1 — Referral payment history importer *(first; unblocks everything)*
Upload → validate every row → **exception report** → explicit approve → write. **Match key =
`application_id`** (verified 100% unique across the 1,863; `register_number` has 6 dup groups).
**Validator PROVEN on production** 2026-07-22: all 9 verdict classes correct, zero footprint
(`fn_validate_referral_import_batch`, staging tables `referral_import_batches`/`_rows`).
- **Refuse** any file whose columns don't exactly match the template (D23).
- **Approve promotes CLEAN rows only** (D18); flagged/no-match stay on a to-do list.
- Approve **records claims** (canonical `learners_profiles.referred_by_id` — D28), does **not** create
  payments (D20); already-paid rows write to the double-pay ledger.
- **Senior-only, logged** overrides (D19) and on-screen edits with re-validation (D21/D22).
- **Dedup ACROSS uploads** — warn before re-recording a student already on record (D24).
- On approve, **auto-emit the F3 registrar check-list** (D25).
**Required columns:** referrer name + type; referrer phone/email/agency code; **student application
number**; student name; programme + institution; referral date; amount agreed; **amount already
paid + date + method + reference**. Template shipped: `docs/referral-2025-26-import-template.xlsx`.
**Accept when:** wrong-column file is refused; zero silent failures; every rejected row named in the
report; nothing writes until approved; clean rows promote, flagged/no-match held.

### F2 — Claim matching + exception report
Match each claim to the 1,863 real 2025-26 admissions on application/roll number.
**Must flag:** no match; duplicate claims on one student (D12); self-referral (D11 — block);
suspected family (D11 — flag); referrer not resolvable (D13).
**Accept when:** every claim lands in exactly one bucket — matched, or flagged with a named reason.

### F3 — Enrolment verification (attendance/feedback auto-confirm + registrar fallback)
For **claimed students only**. **Auto-confirm** any student with recent (this-term) attendance *or*
session feedback — proof of presence (D29/D31). Everyone else → registrar worklist (D30: no signal =
unknown, NEVER auto-reject). Verified against `student_attendance.attendance_data` (JSONB, per-student
`status`) and `session_feedback.student_id`. **Re-checked at payment time** (D32).
**Accept when:** a claimed student with recent attendance/feedback is auto-confirmed; a student with
no signal is sent to the registrar (not rejected); no payment approves for an unconfirmed student; the
check re-runs at payout and catches a student who left after claim time.

### F4 — Rate table (per course / institution)
Flat amounts, stored as configuration (D3). Uses the existing `consultant_commission_structures`
entry UI where possible.
**Accept when:** a rate can be set and changed without code, and the applicable rate for any claim is
traceable.

### F5 — Calculator repair
Fix `calculateCommission` against the real structures schema (§2.2). **Do not wire to auto-triggers**
(D15). Must show *"No rate set for this consultant"* rather than a wrong number.
**Accept when:** a missing rate produces a clear refusal, never a silent flat `base_rate`.

### F6 — Agency payout run
Generate transactions for approved claims → four-stage batch (D10) → mark paid with reference.
**Accept when:** each payment carries a named approver + timestamp; the same claim cannot be paid twice.

### F7 — Staff entitlement register
Calculate and record what each staff referrer is owed **now**; pay in wave 2 (D7). No bank details
stored for staff (D5).
**Accept when:** entitlements are recorded and reportable, and cannot be marked paid until payroll is live.

### F8 — Payroll stand-up *(separate project, D8)*
Migrate 844 staff into `hr_employees`, define pay scales, statutory config, parallel run.
Prerequisite for F7 payment.

---

## 7. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Already-paid list is incomplete → double payment | 🔴 High | F1 first; D16 gate; consider agency balance confirmation |
| Enrolment data wrong → wrong people refused | 🔴 High | D6 scoped verification; never rely on `lifecycle_status` |
| Staff paid outside payroll → tax exposure | 🔴 High | D5 + written Finance sign-off before any staff payment |
| `calculateCommission` wired before repair → every commission silently flat | 🟠 Med | D15; leave auto-triggers dark |
| Agencies wait behind the payroll project | 🟠 Med | D7 two-wave sequencing |
| Claims name people not in the system | 🟠 Med | F2 flags; consultant importer exists for new agency records |

---

## 8. Success criteria

1. Payment history loaded; every historical payment visible before any new amount is computed.
2. Every claim matched to a real 2025-26 admission, or flagged with a reason. **Zero silent drops.**
3. Enrolment confirmed for every claimed student before approval.
4. Every payment carries a named approver and timestamp; no claim payable twice.
5. Agencies paid in wave 1. Staff entitlements recorded, pending payroll.
6. No payment computed from a rate that isn't traceable to the Director's rate table.
