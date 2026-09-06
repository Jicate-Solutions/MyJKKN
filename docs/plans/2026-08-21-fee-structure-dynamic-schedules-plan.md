# Fee Structure — Per-Item Due Dates, Split Thresholds & Status Rules

**Date:** 2026-08-21 · **Status:** IMPLEMENTED (P0–P6), NOT BROWSER-TESTED · **Owner:** Billing + Admission

> **Shipped 2026-08-21.** Four migrations applied to production; every default
> reproduces the previous behaviour, and production currently has **zero**
> schedules configured, so nothing has changed for any live learner yet.
> See §8 for what was verified and what was not.

---

## 1. What exists today (verified against the live database, 2026-08-21)

### 1.1 The four-hop flow

```
Enquiry form  →  learners_profiles (lifecycle_status='enquiry')
      ↓  approve
admission_account_transition_with_bills(...)          [SECURITY DEFINER RPC]
      ├─ admission_resolve_fee_items_for_lead()  → writes learners_profiles.fee_items JSONB
      └─ INSERT billing_student_bills            → one bill per fee item, due = now() + 30 days
      ↓  receipt recorded
update_bill_status()  → writes bills.status + balance_amount
      ↓  AFTER UPDATE OF status, balance_amount
trg_evaluate_status_after_bill_paid → evaluate_learner_status_after_payment(learner)
      ↓
learners_profiles.lifecycle_status: account → reserved → admitted   (active is MANUAL)
```

### 1.2 Fee structure config (`admission_fee_structures`, 236 rows / `..._items`, 946 rows)

Structure is matrix-keyed on 8 dimensions (institution, degree, department, programme,
quota, community, accommodation, admission_year) plus optional gender / package_type /
hostel_category / mess_category.

`admission_fee_structure_items` today holds **only**:
`billing_category_id, amount, is_optional, sort_order, applies_to, applies_year_of_study`.

There is **no due date and no schedule anywhere in the fee structure module.**

### 1.3 Where the due date actually comes from — two hardcoded places

| Path | File | Code |
|---|---|---|
| SQL (admission → account) | `admission_account_transition_with_bills` | `v_due_date := (now() + interval '30 days')::date;` |
| TypeScript (billing bulk generate) | `lib/services/billing/onboarding/onboarding-service.ts:411` | `dueDate.setDate(dueDate.getDate() + 30)` |

Both are literal. This is the "static due date" in the brief.

### 1.4 The threshold ladder — global, per-learner, not per item

`admission_statuses` (scope='learner') carries the ladder:

| code | sort | threshold % | basis | gates_login | auto_promote_when_universal_paid |
|---|---|---|---|---|---|
| account | 5 | — | due_to_date | false | false |
| reserved | 6 | — | due_to_date | false | **true** |
| admitted | 7 | **30.00** | due_to_date | false | false |
| active | 10 | 60.00 | due_to_date | **true** (⇒ excluded from auto-promotion) | false |

`evaluate_learner_status_after_payment(learner)` runs two stages:

* **Stage A → `reserved`** — every existing `application_fee` + `university_fee` bill has at
  least a partial payment (or is a settled zero-amount bill).
* **Stage B → `admitted`** — `paid_pct >= 30`, where `paid_pct` comes from
  `vw_learner_payment_progress` and, since migration `20260821040000`, means
  **paid ÷ billed across ALL non-application bills whose `due_date <= CURRENT_DATE`**.
  Three bases are selectable per status: `billed_to_date`, `due_to_date` (default),
  `due_to_date_current_year`.
* The function is **promotion-only** — it never demotes. That is what makes the nightly
  sweep and the manual re-evaluate tool safe.

So the percentage is measured over the learner's **whole bill book**, pooled. It has no
notion of "30% of Tuition specifically".

### 1.5 The instalment mechanism already exists — and is dormant

Migration `20260825013000_billing_instalment_plans.sql` is **applied live** (the file header
still says "FILE ONLY / NOT APPLIED"; that is stale). Confirmed present:

* `billing_instalment_plans` — **0 rows**
* `billing_instalment_plan_lines` — **0 rows**
* `billing_instalment_split_for_learner(learner, category, amount, anchor)` — the single split engine
* `billing_get_instalment_split(...)` — guarded wrapper for the TS path
* `expandBillsWithInstalmentPlans()` in `lib/services/billing/instalments/instalment-plan-service.ts`

Both generation paths already call the engine. Grain is **programme × billing category ×
academic year**. Lines already carry `share_percent XOR fixed_amount` and
`due_date XOR due_offset_days`, and the **last line absorbs rounding** so instalments sum
exactly to the yearly amount.

Permission keys `billing.instalment_plans.view` / `.manage` exist in
`lib/constants/permissions.ts` but are **granted to zero roles**, and there is **no UI**.

> **This is roughly 60% of the requested mechanism, already built and wired into both
> generation paths.** The plan below reuses it rather than building a second engine.

---

## 2. The five gaps between today and the brief

| # | Gap | Severity |
|---|---|---|
| **G1** | Due date is hardcoded `+30 days` in two places | Core ask |
| **G2** | Split config grain is programme × category × AY — the brief wants **per fee-structure item**, inside the fee structure module | Core ask |
| **G3** | `once_per_learner = true` on the exact categories to be split — **hard blocker** | 🔴 Blocker |
| **G4** | Thresholds are a single global `paid_pct`; the brief wants **per-item** rules that name a target status | Core ask |
| **G5** | `learners_profiles.fee_items` carries no `fee_structure_item_id`, so bill generation cannot find an item's schedule | Enabler |

### G3 in detail — the blocker

`billing_categories.once_per_learner` is `true` on precisely the categories in the brief:

| Category | kind | once_per_learner | fee-structure items using it |
|---|---|---|---|
| **1 Year Tuition Fee** | tuition | ✅ true | 192 |
| **Application Fee** | application_fee | ✅ true | 227 |
| **University Fee** | university_fee | ✅ true | 225 |
| **Uniform Fee** | other | ✅ true | 3 |

Two independent guards refuse a split today:

1. `billing_instalment_split_for_learner` returns zero rows for any `once_per_learner`
   category — "the stricter rule wins".
2. `billing_enforce_once_per_learner` (trigger on `billing_student_bills`) raises `BL001`
   on the *second* instalment row, mid-batch.

**Do not disable `once_per_learner`.** It is the guard that stops the duplicate-tuition-bill
class of defect (842 duplicate tuition bills per AY were found once already). Instead the
trigger must learn that N bills sharing one **instalment group** are ONE logical bill.

---

## 3. Proposed design

### 3.1 Schema — three additive changes

#### (a) `admission_fee_structure_items` — per-item scheduling opt-in

```sql
ALTER TABLE public.admission_fee_structure_items
  ADD COLUMN schedule_mode   text NOT NULL DEFAULT 'single'
      CHECK (schedule_mode IN ('single','split')),
  ADD COLUMN due_anchor      text NOT NULL DEFAULT 'generation_date'
      CHECK (due_anchor IN ('generation_date','academic_year_start','fixed_date')),
  ADD COLUMN due_offset_days integer CHECK (due_offset_days >= 0),
  ADD COLUMN due_date        date;
```

* `schedule_mode='single'` (the default for all 946 existing rows) = today's behaviour.
* `due_offset_days` / `due_date` cover the **single-instalment dynamic due date** (G1) —
  an item can get a real due date without being split at all.
* A `NULL` offset falls back to the structure default (below), which falls back to 30.

#### (b) `admission_fee_structure_item_schedules` — NEW, the split lines

```sql
CREATE TABLE public.admission_fee_structure_item_schedules (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_structure_item_id   uuid NOT NULL
      REFERENCES public.admission_fee_structure_items(id) ON DELETE CASCADE,
  sequence_no             integer NOT NULL CHECK (sequence_no >= 1),

  -- size: exactly one
  share_percent           numeric(7,4) CHECK (share_percent > 0 AND share_percent <= 100),
  fixed_amount            numeric(12,2) CHECK (fixed_amount > 0),

  -- date: exactly one
  due_offset_days         integer CHECK (due_offset_days >= 0),
  due_date                date,

  -- G4: the status rule
  promotes_to_status_code text,          -- FK to admission_statuses(code) where scope='learner'

  label                   text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_afsis_amount_one CHECK ((share_percent IS NULL) <> (fixed_amount IS NULL)),
  CONSTRAINT chk_afsis_due_one    CHECK ((due_offset_days IS NULL) <> (due_date IS NULL)),
  CONSTRAINT uq_afsis_item_seq    UNIQUE (fee_structure_item_id, sequence_no)
);
```

Deliberately **mirrors `billing_instalment_plan_lines` column-for-column** so the split
arithmetic (last line absorbs rounding) is literally the same code path.

Authoring guard (deferred constraint trigger): for a `split` item whose lines all use
percentages, `share_percent` must sum to exactly 100.

#### (c) `billing_student_bills` — instalment identity

```sql
ALTER TABLE public.billing_student_bills
  ADD COLUMN instalment_group_id   uuid,
  ADD COLUMN instalment_no         smallint,
  ADD COLUMN instalment_count      smallint,
  ADD COLUMN fee_structure_item_id uuid
      REFERENCES public.admission_fee_structure_items(id) ON DELETE SET NULL;

CREATE INDEX ix_bills_instalment_group
  ON public.billing_student_bills (instalment_group_id, instalment_no)
  WHERE instalment_group_id IS NOT NULL;
```

This replaces today's practice of encoding `— Instalment 1/3` into `bill_description`,
which is unqueryable.

Structure-level default (recommended, one column):

```sql
ALTER TABLE public.admission_fee_structures
  ADD COLUMN default_due_offset_days integer NOT NULL DEFAULT 30
      CHECK (default_due_offset_days >= 0);
```

### 3.2 The `once_per_learner` fix (G3)

Rewrite `billing_enforce_once_per_learner` so its duplicate probe **ignores siblings of the
same instalment group**:

```sql
  SELECT b.id INTO v_existing_id
  FROM public.billing_student_bills b
  WHERE b.student_id       = NEW.student_id
    AND b.item_category_id = NEW.item_category_id
    AND b.status NOT IN ('cancelled','superseded')
    AND b.id IS DISTINCT FROM NEW.id
    -- NEW: a split of ONE fee is one logical bill, not N duplicates.
    AND (NEW.instalment_group_id IS NULL
         OR b.instalment_group_id IS DISTINCT FROM NEW.instalment_group_id)
  LIMIT 1;
```

Guarantees preserved: a *second independent* tuition bill (different group, or no group at
all) is still rejected. What changes is only that 3 rows of one group may coexist.

Correspondingly, `billing_instalment_split_for_learner` drops its blanket
"`once_per_learner` ⇒ refuse" branch **only** when the split comes from a fee-structure item
schedule (an explicit, deliberate configuration), keeping the refusal for the legacy
programme-grain plans, which have no group identity.

### 3.3 Split engine — one engine, two config sources

Extend the existing `billing_instalment_split_for_learner` with an optional
`p_fee_structure_item_id` and a precedence rule:

1. **Fee-structure item schedule** (new, `schedule_mode='split'`) — wins.
2. **`billing_instalment_plans`** grain — fallback (still 0 rows; untouched).
3. Neither → zero rows → caller emits the single bill, byte for byte as today.

Return columns gain `promotes_to_status_code` and `matched_source` (`'item_schedule'` |
`'plan'`).

> The codebase deliberately established "two generation paths, one engine, so a learner's
> schedule can never differ by path". That invariant is preserved.

### 3.4 Bill generation — both paths

**SQL** (`admission_account_transition_with_bills`) and **TS**
(`onboarding-service.createBillsFromProfile` + `expandBillsWithInstalmentPlans`) change the
same way:

* due date for a `single` item = `due_date` ?? anchor + `due_offset_days`
  ?? structure `default_due_offset_days` ?? **30** (unchanged default ⇒ zero behaviour
  change for the 236 existing structures until someone configures one).
* `split` items loop the engine rows, stamping `instalment_group_id` (one
  `gen_random_uuid()` per item), `instalment_no`, `instalment_count`,
  `fee_structure_item_id`.
* **Bug fix carried in the same change:** the SQL RPC currently does **not** write
  `academic_year_id` on the bills it inserts (the TS path does). `pct_due_current_year`
  joins `academic_years` on that column, so RPC-generated bills silently drop out of the
  `due_to_date_current_year` basis. Add it.

### 3.5 Fee-item snapshot (G5)

`admission_resolve_fee_items_for_lead` gains two keys per element:

```json
{ "category_id": "...", "category_name": "1 Year Tuition Fee", "amount": 65000.00,
  "source": "structure",
  "fee_structure_id": "…",
  "fee_structure_item_id": "…" }
```

Purely additive — every existing reader keys on `category_id` / `amount` / `source`.
For pre-existing snapshots that lack it, the engine falls back to resolving
(learner's matched structure × category), so nothing is stranded.

### 3.6 Status rules (G4) — item-scoped, layered over the global ladder

Extend `evaluate_learner_status_after_payment` with a **Stage A0**, ahead of the existing
Stage A/B, which never runs unless item rules exist:

```
for each admission_statuses row S (scope='learner', is_active, gates_login=false),
    ordered by sort_order DESC:
  collect every bill of this learner whose fee_structure_item_id → schedule line
      names promotes_to_status_code = S.code
  if that set is non-empty AND every bill in it is settled
      (status='paid' OR balance_amount = 0):
    → promote to S, reason_code 'auto_item_rule',
      metadata { rule: 'fee_structure_item_schedule', satisfied_bills: [...] }
    → stop
```

Then Stage A and Stage B run exactly as today, so:

* Structures with **no** schedule rules behave **identically** to today (368 reserved +
  48 admitted + 4,945 active learners unaffected).
* A structure with rules gets item-precise promotion; if no rule fires, the global
  30% / universal-paid ladder still applies as a floor.
* `gates_login = true` (i.e. `active`) stays excluded from automatic promotion unless
  explicitly decided otherwise — see D3.
* **Promotion-only is preserved.** A rule can never demote; a target whose `sort_order` is
  not above the current status is skipped.

### 3.7 Date-driven re-evaluation — register the nightly sweep

`app/api/cron/billing/learner-status-sweep/route.ts` exists and calls
`fn_sweep_learner_status_promotions` (present live), but is **not registered in
`vercel.json`**. Its own header says the file is "at exactly 100 cron entries" —
**that comment is stale: `vercel.json` currently has 55 crons.**

Once due dates are spread across the year, the due-basis denominator changes *when a date
arrives*, with no payment event to fire a trigger. Register the sweep (nightly), with
**both** the `Authorization: Bearer` header and `?secret=` query forms honoured — Vercel
does not interpolate `${CRON_SECRET}` into a cron path.

---

## 4. UI

### 4.1 Fee structure form — `_components/fees-structure-form.tsx` (1,981 lines)

Each fee item row gains a **"Schedule"** control. Collapsed by default; the row keeps
today's exact look until someone opens it.

```
┌─ 1 Year Tuition Fee ─────────── one-time ─── ₹65,000 ──[Every year ▾]──[⚙ Schedule]─┐
│  ○ Single payment      Due: [ 30 ] days after admission   ( or [ fixed date ] )     │
│  ● Split into instalments                                                           │
│   ┌────┬──────────┬─────────────┬──────────────────────┬────────────────────────┐   │
│   │ #  │ Share %  │  Amount     │ Due                  │ On payment → status    │   │
│   ├────┼──────────┼─────────────┼──────────────────────┼────────────────────────┤   │
│   │ 1  │   30 %   │  ₹19,500    │ +15 days             │ Reserved            ▾  │   │
│   │ 2  │   30 %   │  ₹19,500    │ 2026-09-30           │ Admitted            ▾  │   │
│   │ 3  │   40 %   │  ₹26,000 ⓘ  │ 2026-12-31           │ — none —            ▾  │   │
│   └────┴──────────┴─────────────┴──────────────────────┴────────────────────────┘   │
│   Total 100 % · ₹65,000 ✓        ⓘ last instalment absorbs rounding                  │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

* Live total badge, red until percentages sum to 100.
* Amount column is a computed preview using `computeInstalmentAmounts()` — the documented
  TS reference mirror of the SQL engine, already in the repo.
* Status dropdown sourced from `admission_statuses` (scope='learner', is_active,
  sort_order above the current), not hardcoded.
* ⚠️ The form already uses `form.watch('items')` at line 468. React Compiler chokes on
  `watch()` over a field array — the new nested schedule array **must** use `useWatch`.

### 4.2 Everywhere else

| Surface | Change |
|---|---|
| `fee-structure-service.ts` `upsertItems()` | replace-schedule-lines child write |
| `/api/admission/fees-structure/{template,import,export}` | schedule columns in the xlsx — **derive column letters from the header array**, never hardcode |
| Fee structure detail / clone dialog | clone must copy schedule lines |
| `billing/student-bills`, onboarding, parent portal | show `Instalment n/N` from the new columns instead of parsing `bill_description` |
| Learner onboarding drawer | show the schedule and which rule promotes to what |

---

## 5. Work breakdown

| Phase | Scope | Files |
|---|---|---|
| **P0** | Register the nightly sweep in `vercel.json`; correct the stale 100-cron comment. Independently shippable. | `vercel.json`, cron route header |
| **P1** | Migration A — schema (3.1 a/b/c + structure default), RLS, `types/supabase.ts`, permission keys + role grants, `supabase/setup/` mirror | 1 migration, `permissions.ts`, `types/` |
| **P2** | Migration B — `billing_enforce_once_per_learner` instalment-group fix; split engine extension; `admission_resolve_fee_items_for_lead` + `fee_structure_item_id`; `admission_account_transition_with_bills` (due date + `academic_year_id` + group stamping) | 1 migration |
| **P3** | TS generation path parity: `onboarding-service.ts`, `instalment-plan-service.ts` | 2 services |
| **P4** | Migration C — `evaluate_learner_status_after_payment` Stage A0 item rules; history `reason_code='auto_item_rule'` | 1 migration |
| **P5** | UI: fee structure form schedule editor + service + hooks + types | ~6 files |
| **P6** | Import/export/template + clone + bill-display surfaces | ~5 files |

~~P7 retro-scheduling~~ — dropped per decision D4. Existing bills are never re-split.

Phases P0–P4 change **zero behaviour** until a schedule is configured — every default
reproduces today's output byte for byte. That is the safety property to hold onto.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| Loosening `once_per_learner` re-opens duplicate tuition bills | Group-scoped exemption only; a bill with `instalment_group_id IS NULL` is still rejected. Rehearse in `BEGIN…ROLLBACK` against production data. |
| 19,139 existing bills are single and unscheduled | Nothing retro-splits, ever (D4). Schedules apply only to bills generated after the change. |
| Two config systems (item schedule vs instalment plan) drift | Documented precedence, single engine, `matched_source` in the return so the origin is always visible. |
| `paid_pct` denominator moves as due dates arrive | Promotion-only function + nightly sweep (P0). Never demotes. |
| Rounding | Reuse the existing last-line-absorbs rule; do not re-derive. |
| Permission keys declared but ungranted → silent empty page | Grant in the same migration; verify with `(permissions->>'key')::boolean IS TRUE`, never `? 'key'`. |
| `applies_to` / `applies_year_of_study` interaction | A schedule belongs to the item, so year applicability is already filtered upstream in the resolve RPC. No change needed — but must be regression-checked. |

---

## 7. Decisions — SETTLED 2026-08-21

* **D1 — Rule grain: per schedule line.** A split line optionally names one target status;
  the rule fires when *that instalment's bill* is settled. No multi-item rule table. If a
  cross-item condition ("Application AND University paid → Reserved") is ever needed, it is
  expressible today by putting the same `promotes_to_status_code` on a line of each item —
  Stage A0 already requires **every** bill naming a status to be settled before promoting.
* **D2 — Legacy `billing_instalment_plans`: kept as a dormant fallback.** Item schedule wins;
  the plan grain still resolves when no item schedule exists. Nothing is dropped.
* **D3 — `active` stays manual.** Item rules may target `reserved` and `admitted` only.
  Enforced in the engine by the existing `gates_login = false` filter, and in the UI by
  excluding `gates_login = true` statuses from the dropdown. Granting a portal login remains
  a human decision.
* **D4 — Existing bills are left alone.** New schedules apply only to bills generated from
  the change onward. **P7 is dropped from this plan**; no retro-split ships. Raise it as a
  separate proposal if the Accounts team asks for it.

---

## 8. What shipped, and what was verified — 2026-08-21

### 8.1 Migrations applied to production

| File | Contents |
|---|---|
| `20260821180000_fee_structure_item_schedules.sql` | Schema: structure `default_due_offset_days`; item `schedule_mode` / `due_anchor` / `due_offset_days` / `due_date`; new `admission_fee_structure_item_schedules` + RLS; bill `instalment_group_id` / `instalment_no` / `instalment_count` / `fee_structure_item_id`; both validators |
| `20260821190000_fee_schedule_generation_engine.sql` | Item-level `promotes_to_status_code`; **group-aware `billing_enforce_once_per_learner`**; extracted `admission_match_fee_structure_for_learner`; split engine rebuilt with the item-schedule source; wrapper; `fee_items` gains the ids; account-transition RPC rebuilt |
| `20260821200000_fee_item_status_rules.sql` | `evaluate_learner_status_after_payment` gains **Stage A0** |
| `20260821210000_bulk_upsert_preserve_item_schedules.sql` | Bulk upsert snapshots + restores per-category config across its wholesale item DELETE |

### 8.2 Verified by rolled-back probes against production data

* `30/30/40` on ₹65,000 → `19,500 / 19,500 / 26,000`, summing **exactly**.
* Three instalments inserted into a **`once_per_learner`** category — the blocker
  is gone — while a rogue duplicate (no group) and a bill from a **different**
  group are both still rejected. The exemption is group-scoped, not category-wide.
* Full ladder off individual instalments: `account → reserved` on instalment 1,
  `→ admitted` on instalment 2, **no demotion** with instalment 3 unpaid;
  history rows carry `reason_code = 'auto_item_rule'`.
* End-to-end generation on one learner, three items:

  ```
  1 Year Tuition Fee                 due 2026-09-20  (= today + 30, UNCHANGED)
  Application Fee                    due 2026-12-25  (fixed date)
  University Fee — Instalment 1/3    due 2026-09-05  ₹3,000
  University Fee — Instalment 2/3    due 2026-11-19  ₹3,000
  University Fee — Instalment 3/3    due 2027-02-17  ₹4,000
  ```
  All five carried `academic_year_id` and `fee_structure_item_id`.
* Bulk-upsert snapshot/restore round-trip is **byte-identical**, including
  `applies_to` (the pre-existing loss).
* Authoring guards all fire: percentages ≠ 100, sequence gaps, a typo'd status
  code, targeting `active`, and a partial instalment triplet.
* `npx vitest run __tests__/billing __tests__/admission` → **64 passed**.
* ESLint on every touched file: identical to the pre-change baseline
  (1 pre-existing error + 1 pre-existing warning in `fees-structure-form.tsx`,
  both on lines this work did not author).
* Security: `anon` cannot read the schedule table, cannot execute the engine,
  and cannot execute the promotion RPC.

### 8.3 NOT verified — do this before configuring a real structure

* **No browser testing.** The schedule editor has never been rendered. Exercise
  it as a non-super-admin holding `admission_fees.manage`.
* **`admission_account_transition_with_bills` was never invoked end to end.** It
  gates on `auth.uid()`, which a SQL probe does not have. Its bill-generation
  loop was replayed verbatim (§8.2) and its body applied cleanly, but the real
  RPC has not run. **Onboard one test learner and check the generated bills
  before configuring any live structure.**
* **`admission_bulk_upsert_fee_structure` was never invoked end to end**, for the
  same reason. Its snapshot/restore logic was replayed verbatim.
* The nightly sweep is registered but has not yet fired.

### 8.4 Deliberately out of scope

* **Schedule columns in the bulk xlsx.** The sheet is one row per structure with
  one column per category; a 30/30/40 schedule with dates and status targets has
  no honest flat representation short of inventing a mini-DSL for accounts staff
  to hand-edit. Schedules are authored in the UI. The bulk sheet keeps working
  for amounts, and migration `…210000` is what stops it destroying schedules it
  cannot see.
* **Retro-scheduling existing bills** — decision D4.
* **A dedicated instalment badge on bill lists.** Generation writes
  `— Instalment 1/3` into `bill_description`, so every existing surface already
  reads correctly; the new columns exist for querying and for the promotion
  engine. Switching the surfaces to render from the columns is cosmetic.

### 8.5 Known trap, mitigated not eliminated

Cloning a structure whose schedule uses **absolute** dates carries the previous
year's dates into the new one. The clone lands as `draft` and a draft never
resolves for fee items, so nothing generates silently — and the schedule editor
now shows an amber "check dates" badge on any past-dated line. It is still worth
knowing before the first clone-to-next-year.
