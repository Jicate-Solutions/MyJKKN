# Nattraja Vidhyalya CBSE — the 15 "stuck at admitted" learners

**Date:** 2026-08-05
**Production Supabase ref:** `kvizhngldtiuufknvehv`
**Snapshot instant:** `2026-08-05 11:16:04 UTC` (all figures below read at or near this instant)
**Mode:** READ-ONLY. Nothing in this document has been executed. Every SQL block is labelled and unrun.

---

## 🛑 STOP — read this before running anything

**All 15 learners are test fixtures, not real people.** They should not be activated. Filling
their missing fields would inject 15 fabricated learners into the live Nattraja roster and, because
activation also triggers user-account creation, would mint `@jkkn.ac.in` login accounts for people
who do not exist.

The evidence is unambiguous and threefold — every one of the 15 carries **all three** markers:

| Marker | Count | Detail |
|---|---|---|
| Sentinel UUID `c0ffee00-0000-4000-8000-…` | 15 / 15 | Hand-authored ids, sequential `…0002` → `…0016` |
| Name prefixed `[TEST]` | 15 / 15 | e.g. `[TEST] Bala Raj`, `[TEST] Priya Ramesh` |
| Email on `@example.invalid` | 15 / 15 | `.invalid` is the RFC 2606 reserved TLD guaranteed never to resolve |

They were all created on **2026-07-22**, addresses `test.rcltp.02@…` through `test.rcltp.16@…`
— the naming matches the RCLTP principal-walkthrough seed of that date.

**Recommended action: quarantine or delete these rows, do not fill them.** The deletion decision is
a data-governance call for the Director, not an engineering one, so this runbook stops at preparing
the statements. Both options are written out below — the fill option carries an explicit warning.

### Related finding, same seed

A **16th** sentinel row from the same batch is *already* `active` and is sitting in the live
Nattraja roster right now:

| id | application_id | name | roll | status | activated_at |
|---|---|---|---|---|---|
| `c0ffee00-0000-4000-8000-000000000001` | JKKN-NV-238 | `[TEST] Asha Kumar` | NV-G3A-01 | **active** | 2026-07-22 14:03:47 UTC |

Nattraja shows 226 `active` learners; **one of those 226 is fake**. This row is counted in live
rosters and dashboards today. It carries no `college_email` and no linked `profile_id`, so it never
produced a login account — but it is polluting headcount. Worth folding into the same cleanup
decision.

---

## 1. Did the ₹0 claim hold?

**Yes — but for a different reason than assumed, and the reason matters.**

Exactly 15 learners in the entire current-intake fee-gated cohort owe ₹0, and all 15 are these
Nattraja rows. Confirmed. But they owe ₹0 because **no bill has ever been raised against them**,
not because anyone paid:

```
bills_for_the_15 = 0
```

Zero rows in `billing_student_bills` for any of the 16 sentinel ids. So "₹0 outstanding" here means
"outside the billing system entirely", which is exactly what you would expect of a fixture and is
itself corroborating evidence that these are not real admissions.

**No learner among the 15 owes money.** The item is not a collections matter.

### Where "outstanding" comes from

I did not invent a formula. The platform's own promotion function
`evaluate_learner_status_after_payment` and its backing view `vw_learner_payment_progress` both
compute money owed as **`billing_student_bills.balance_amount`, excluding rows with
`status = 'superseded'`**. That is the definition used throughout both this document and the
companion collections worklist.

Bill statuses that actually exist estate-wide: `unpaid` (5,516), `paid` (4,302), `partially_paid`
(1,298), `superseded` (60), `cancelled` (20). The cohort contains no `cancelled` bills.

> ⚠️ **Incidental defect spotted, not fixed here.** The public API route
> `app/api/b2a/billing/outstanding/route.ts` filters on `.in('status', ['unpaid','partial','overdue'])`.
> The values `partial` and `overdue` **do not exist** in this database — the real value is
> `partially_paid`. That endpoint therefore silently omits every partially-paid bill. In the
> current-intake cohort alone that is ₹3.15 crore of outstanding balance invisible to any consumer
> of that API. Logged for a separate ticket; out of scope for this runbook.

---

## 2. What actually gates activation

The background brief stated that promotion runs through the payment-gated
`evaluate_learner_status_after_payment` and that completing onboarding fields activates nobody.
**For these 15 learners that is not correct, and the correction is the substance of this document.**

### 2a. The database RPC is a no-op for them — twice over

`evaluate_learner_status_after_payment(p_learner_id uuid)` cannot move these learners for two
independent reasons.

**First**, it early-returns on any status outside `account`/`reserved`. All 15 are `admitted`:

```sql
IF v_current_status::text NOT IN ('account', 'reserved') THEN
  RETURN jsonb_build_object('learner_id', p_learner_id, 'updated', false,
    'reason', 'no_op_for_status', 'current_status', v_current_status::text);
END IF;
```

**Second**, even for a learner who *is* `account`/`reserved`, this function can never produce
`active`. Its target-selection predicate excludes any status that gates login:

```sql
WHERE s.scope = 'learner' AND s.is_active = true
  AND s.fee_paid_threshold_percent IS NOT NULL
  AND s.gates_login = false                      -- ← excludes 'active'
  AND s.auto_promote_when_universal_paid = false
  AND v_paid_pct >= s.fee_paid_threshold_percent
ORDER BY s.fee_paid_threshold_percent DESC LIMIT 1
```

Only two learner statuses carry a fee threshold:

| code | threshold | gates_login | reachable by this RPC? |
|---|---|---|---|
| `admitted` | 30% | `false` | ✅ yes |
| `active` | 60% | **`true`** | ❌ **no — filtered out** |

So the payment RPC tops out at `admitted`. **Paying 100% of fees does not make a learner `active`.**

This is confirmed empirically, not just by reading the code. Every transition the RPC has ever
written is in `learners_profile_status_history`:

| to_status | reason_code | rows |
|---|---|---|
| `reserved` | `auto_universal_paid` | 1,004 |
| `enquiry` | `taxonomy_realignment_20260520` | 524 |
| `admitted` | `auto_threshold` | 116 |

**Zero rows have ever gone to `active`.** The ladder has never been climbed past `admitted` by
automation.

Separately, `trg_set_learner_activated_at` only stamps a timestamp *after* someone else sets the
status — it decides nothing:

```sql
IF NEW.lifecycle_status = 'active' AND OLD.lifecycle_status IS DISTINCT FROM 'active'
   AND NEW.activated_at IS NULL THEN NEW.activated_at := now(); END IF;
```

### 2b. The real gate lives in application code

`admitted` → `active` is performed by `checkAndAutoActivate()` in
`lib/services/learner-profile-service.ts` (production, `jicate/main`). It runs **after every profile
update saved through the app** — a team member editing and saving the learner record is what fires
it. It is not a cron, not a trigger, and not reachable by writing to the database directly.

Its predicate is exactly four fields plus an email-domain rule:

```ts
const requiredFields = ['college_email', 'academic_year_id', 'semester_id', 'section_id'];
// every field !== null && !== undefined && !== ''
isValidCollegeEmail = email.toLowerCase().endsWith('@jkkn.ac.in')
```

Both `isComplete` and `hasValidEmail` must be true. It explicitly skips `account`/`reserved`
(payment-gated, owned by the accounts team) and acts only on `approved`/`admitted`.

Note the second half: once the row is `active`, the same method calls `triggerUserCreation()`,
which provisions the login account. **Activation and account creation are one motion.**

Neither the per-learner status dropdown (`enquiry-status-update.tsx`) nor the bulk dialog
(`bulk-status-update-dialog.tsx`) offers `active` as a manual choice — the bulk list is explicitly
capped at "any pre-active stage". So this auto-activation path is the *only* route from `admitted`
to `active` in normal operation.

### 2c. Which condition each of the 15 fails

**Same three for all 15, identically:**

| Gate field | Status across all 15 | Notes |
|---|---|---|
| `college_email` | ❌ NULL | Also fails the `@jkkn.ac.in` domain rule by being absent |
| `academic_year_id` | ❌ NULL | |
| `semester_id` | ❌ NULL | |
| `section_id` | ✅ **populated** | **The briefing premise was wrong on this one** |

The premise held that these learners were missing `section_id`. They are not — all 15 have one.
What they are missing is `college_email`, `academic_year_id` and `semester_id`.

Because every one of these fields *is* in the predicate, filling all three **would** activate them —
which is precisely why it must not be done for fixture rows.

---

## 3. Per-learner table

All 15: Nattraja Vidhyalya CBSE (`29c221d1-b918-4c46-9d67-857273b0b553`), `lifecycle_status =
'admitted'`, admission year 2026-2027, **₹0 owed, zero bills raised**.

| # | learner id | application_id | name | roll | missing | section_id points at | ₹ owed |
|---|---|---|---|---|---|---|---|
| 1 | `c0ffee00-…-000000000002` | JKKN-NV-239 | [TEST] Bala Raj | NV-G3A-02 | email, acad-yr, semester | GRADE 4 · "A" | ₹0 |
| 2 | `c0ffee00-…-000000000003` | JKKN-NV-240 | [TEST] Chitra Devi | NV-G3A-03 | email, acad-yr, semester | GRADE 4 · "A" | ₹0 |
| 3 | `c0ffee00-…-000000000004` | JKKN-NV-241 | [TEST] Deepa Nair | NV-G3A-04 | email, acad-yr, semester | GRADE 4 · "A" | ₹0 |
| 4 | `c0ffee00-…-000000000005` | JKKN-NV-242 | [TEST] Elango Murugan | NV-G3B-01 | email, acad-yr, semester | GRADE 2 · "B" | ₹0 |
| 5 | `c0ffee00-…-000000000006` | JKKN-NV-243 | [TEST] Farida Banu | NV-G3B-02 | email, acad-yr, semester | GRADE 2 · "B" | ₹0 |
| 6 | `c0ffee00-…-000000000007` | JKKN-NV-244 | [TEST] Gowri Shankar | NV-G3B-03 | email, acad-yr, semester | GRADE 2 · "B" | ₹0 |
| 7 | `c0ffee00-…-000000000008` | JKKN-NV-245 | [TEST] Harish Kumar | NV-G3B-04 | email, acad-yr, semester | GRADE 2 · "B" | ₹0 |
| 8 | `c0ffee00-…-000000000009` | JKKN-NV-246 | [TEST] Indira Menon | NV-G4A-01 | email, acad-yr, semester | GRADE 4 · "A" | ₹0 |
| 9 | `c0ffee00-…-000000000010` | JKKN-NV-247 | [TEST] Jaya Prakash | NV-G4A-02 | email, acad-yr, semester | GRADE 4 · "A" | ₹0 |
| 10 | `c0ffee00-…-000000000011` | JKKN-NV-248 | [TEST] Karthik Rao | NV-G4A-03 | email, acad-yr, semester | GRADE 4 · "A" | ₹0 |
| 11 | `c0ffee00-…-000000000012` | JKKN-NV-249 | [TEST] Lakshmi Iyer | NV-G4A-04 | email, acad-yr, semester | GRADE 4 · "A" | ₹0 |
| 12 | `c0ffee00-…-000000000013` | JKKN-NV-250 | [TEST] Mani Selvam | NV-G4B-01 | email, acad-yr, semester | GRADE 2 · "B" | ₹0 |
| 13 | `c0ffee00-…-000000000014` | JKKN-NV-251 | [TEST] Nisha Fernandez | NV-G4B-02 | email, acad-yr, semester | GRADE 2 · "B" | ₹0 |
| 14 | `c0ffee00-…-000000000015` | JKKN-NV-252 | [TEST] Omar Farooq | NV-G4B-03 | email, acad-yr, semester | GRADE 2 · "B" | ₹0 |
| 15 | `c0ffee00-…-000000000016` | JKKN-NV-253 | [TEST] Priya Ramesh | NV-G4B-04 | email, acad-yr, semester | GRADE 2 · "B" | ₹0 |

Full ids are `c0ffee00-0000-4000-8000-0000000000NN` with `NN` = 02…16.

### The existing section_id values are themselves wrong

Only two distinct `section_id` values are used across all 15, and neither agrees with the roll
numbers:

- `1ce4c1f2-71e2-43b2-b71e-62e6215002cc` → **GRADE 4**, section "A"
- `87a33e48-0153-414c-aa55-3f98ca0f696e` → **GRADE 2**, section "B"

Yet the roll numbers encode Grade 3 and Grade 4 (`NV-G3A-…`, `NV-G3B-…`, `NV-G4A-…`, `NV-G4B-…`).
So the seven `NV-G3*` learners are pointed at Grade 4 and Grade 2 sections, and the four `NV-G4B-*`
learners are pointed at a Grade 2 section. Only the four `NV-G4A-*` rows happen to be internally
consistent.

**Worse, the sections their roll numbers imply do not exist.** Nattraja's section inventory:

| grade | sections present |
|---|---|
| GRADE 2 | A, A, B |
| GRADE 3 | A, A — **no B** |
| GRADE 4 | A, A — **no B** |

There is no Grade 3 "B" and no Grade 4 "B". The eight learners with `-G3B-` / `-G4B-` roll numbers
therefore have **no derivable correct section at all**. And even the `-A-` rows are ambiguous,
because Grades 3 and 4 each have *two* sections both named "A".

Per the standing instruction: **I am not guessing a section.** This is flagged, not filled.

---

## 4. SQL — ⚠️ NOT YET RUN ⚠️

Nothing below has been executed. Each block requires a human decision first.

### Values that ARE derivable

| Value | Source | Derived value |
|---|---|---|
| `academic_year_id` | `academic_years` for Nattraja — exactly one row exists | `d7023a42-b099-4219-b1c8-a7033d1af425` (2026-2027) |
| `semester_id` | `sections.semester_id` of the row already referenced | GRADE 4·A → `738ae448-6193-4120-b09b-568259ddd1a3`<br>GRADE 2·B → `4aa4ec0b-2dbb-457d-95a3-f0611cb6f326` |

> Note `learners_profiles.academic_year_id` FKs to **`academic_years`**, not `admission_years`.
> The Nattraja *admission* year id (`006e6db5-87c5-4606-991a-454f6e443e92`) is a different table and
> would fail the FK. Verified via `information_schema`.

### Values a human MUST supply

| Value | Why it cannot be derived |
|---|---|
| `college_email` | Must be a real `@jkkn.ac.in` mailbox. No naming convention is inferable — the 226 genuine active Nattraja learners have none populated either. **For fixture rows this must never be minted.** |
| `section_id` (correct one) | The implied Grade 3 "B" and Grade 4 "B" sections do not exist; the "A" sections are duplicated. A team member who knows the actual class must state it. |

---

### OPTION A — quarantine (recommended)

Moves the fixtures out of the live roster without destroying the audit trail. `inactive` is a valid
non-terminal lifecycle status and is **not** offered by the auto-activation path, so a stray edit
cannot promote them afterwards.

```sql
-- ⚠️ NOT YET RUN — Option A: quarantine the 15 fixtures + the 1 already-active fixture
-- Ref kvizhngldtiuufknvehv · prepared 2026-08-05 · requires Director approval
BEGIN;

UPDATE public.learners_profiles
   SET lifecycle_status = 'inactive',
       updated_at       = now()
 WHERE id IN (
   'c0ffee00-0000-4000-8000-000000000002','c0ffee00-0000-4000-8000-000000000003',
   'c0ffee00-0000-4000-8000-000000000004','c0ffee00-0000-4000-8000-000000000005',
   'c0ffee00-0000-4000-8000-000000000006','c0ffee00-0000-4000-8000-000000000007',
   'c0ffee00-0000-4000-8000-000000000008','c0ffee00-0000-4000-8000-000000000009',
   'c0ffee00-0000-4000-8000-000000000010','c0ffee00-0000-4000-8000-000000000011',
   'c0ffee00-0000-4000-8000-000000000012','c0ffee00-0000-4000-8000-000000000013',
   'c0ffee00-0000-4000-8000-000000000014','c0ffee00-0000-4000-8000-000000000015',
   'c0ffee00-0000-4000-8000-000000000016'
 );
-- expect: UPDATE 15

-- The 16th, currently polluting the live active roster:
UPDATE public.learners_profiles
   SET lifecycle_status = 'inactive',
       updated_at       = now()
 WHERE id = 'c0ffee00-0000-4000-8000-000000000001';
-- expect: UPDATE 1

COMMIT;
```

### OPTION B — hard delete

Only if the Director rules the fixtures should leave no trace. Check dependants first — these rows
are 2 weeks old and may be referenced by attendance, RCLTP or event tables.

```sql
-- ⚠️ NOT YET RUN — Option B, STEP 1 of 2: find dependants before deleting anything.
-- Read-only. Run this and read the output BEFORE running step 2.
SELECT c.confrelid::regclass AS referenced_table,
       c.conrelid::regclass  AS referencing_table,
       a.attname             AS referencing_column,
       c.confdeltype         AS on_delete   -- 'c'=cascade 'a'=no action 'r'=restrict 'n'=set null
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
 WHERE c.contype = 'f'
   AND c.confrelid = 'public.learners_profiles'::regclass
 ORDER BY 2;
```

```sql
-- ⚠️ NOT YET RUN — Option B, STEP 2 of 2: delete. IRREVERSIBLE.
-- Do NOT run until step 1's output has been reviewed and the cascade blast radius accepted.
BEGIN;
DELETE FROM public.learners_profiles
 WHERE id::text LIKE 'c0ffee00-0000-4000-8000-%';
-- expect: DELETE 16  (the 15 admitted + the 1 active)
COMMIT;
```

### OPTION C — data fill ⚠️ NOT RECOMMENDED

**Only valid if a human confirms these 15 are real children who genuinely attend Nattraja.**
Every marker says they are not. Running this activates them and provisions login accounts.

Two of the three values are derivable; `college_email` is not. Replace each
`<<< SUPPLY >>>` with a real mailbox, or do not run the block.

```sql
-- ⚠️ NOT YET RUN — Option C: data fill. NOT RECOMMENDED. See section 1.
-- Placeholders MUST be replaced. As written this will fail, deliberately.
BEGIN;

-- The 7 rows currently pointing at GRADE 4 · section "A"
UPDATE public.learners_profiles
   SET academic_year_id = 'd7023a42-b099-4219-b1c8-a7033d1af425',
       semester_id      = '738ae448-6193-4120-b09b-568259ddd1a3',
       college_email    = '<<< SUPPLY per learner — must end @jkkn.ac.in >>>',
       updated_at       = now()
 WHERE id IN ('c0ffee00-0000-4000-8000-000000000002','c0ffee00-0000-4000-8000-000000000003',
              'c0ffee00-0000-4000-8000-000000000004','c0ffee00-0000-4000-8000-000000000009',
              'c0ffee00-0000-4000-8000-000000000010','c0ffee00-0000-4000-8000-000000000011',
              'c0ffee00-0000-4000-8000-000000000012');

-- The 8 rows currently pointing at GRADE 2 · section "B"
UPDATE public.learners_profiles
   SET academic_year_id = 'd7023a42-b099-4219-b1c8-a7033d1af425',
       semester_id      = '4aa4ec0b-2dbb-457d-95a3-f0611cb6f326',
       college_email    = '<<< SUPPLY per learner — must end @jkkn.ac.in >>>',
       updated_at       = now()
 WHERE id IN ('c0ffee00-0000-4000-8000-000000000005','c0ffee00-0000-4000-8000-000000000006',
              'c0ffee00-0000-4000-8000-000000000007','c0ffee00-0000-4000-8000-000000000008',
              'c0ffee00-0000-4000-8000-000000000013','c0ffee00-0000-4000-8000-000000000014',
              'c0ffee00-0000-4000-8000-000000000015','c0ffee00-0000-4000-8000-000000000016');

COMMIT;
```

⚠️ **Three things to understand before ever running Option C.**

1. **`section_id` is left untouched and is probably wrong** (section 3). Filling the other fields
   pins each learner to a class they are likely not in.
2. **This SQL alone will not flip anyone to `active`.** The gate lives in TypeScript
   (`checkAndAutoActivate`), which only runs when a profile is saved through the application. After
   this UPDATE the rows still read `admitted` until a team member opens and saves each learner in
   the UI — at which point all 15 flip to `active` **and** account provisioning fires.
3. Consequently there is no way to do a "quiet" partial fill: the moment the record is saved in-app
   with all four fields present and a valid domain, activation is automatic.

---

## 5. Rollback

Capture the before-state first — this SELECT is read-only and safe to run at any time:

```sql
-- Read-only. Run BEFORE any option; keep the output.
SELECT id, lifecycle_status::text, academic_year_id, semester_id, section_id,
       college_email, is_profile_complete, activated_at, updated_at
  FROM public.learners_profiles
 WHERE id::text LIKE 'c0ffee00-0000-4000-8000-%'
 ORDER BY id;
```

**Rollback for Option A** — restores the exact prior statuses (15 `admitted`, 1 `active`):

```sql
-- ⚠️ NOT YET RUN — undo Option A
BEGIN;
UPDATE public.learners_profiles SET lifecycle_status='admitted', updated_at=now()
 WHERE id::text LIKE 'c0ffee00-0000-4000-8000-%'
   AND id <> 'c0ffee00-0000-4000-8000-000000000001';           -- 15 rows
UPDATE public.learners_profiles SET lifecycle_status='active', updated_at=now()
 WHERE id = 'c0ffee00-0000-4000-8000-000000000001';            -- 1 row
COMMIT;
```

**Rollback for Option C** — returns the three fields to NULL. Note this does **not** undo a
subsequent activation or an account that was provisioned; those need separate remediation.

```sql
-- ⚠️ NOT YET RUN — undo Option C
BEGIN;
UPDATE public.learners_profiles
   SET academic_year_id = NULL, semester_id = NULL, college_email = NULL,
       is_profile_complete = false, lifecycle_status = 'admitted', updated_at = now()
 WHERE id::text LIKE 'c0ffee00-0000-4000-8000-%'
   AND id <> 'c0ffee00-0000-4000-8000-000000000001';
COMMIT;
```

**Rollback for Option B: none.** A hard delete is irreversible and this project has **no
point-in-time recovery enabled**. Treat Option B as one-way.

---

## 6. Verification query — run after whichever option is chosen

```sql
-- Read-only. Expected result depends on the option taken:
--   Option A → 15 rows 'inactive' + 1 row 'inactive'   (16 inactive, 0 admitted, 0 active)
--   Option B → 0 rows returned
--   Option C → 15 rows still 'admitted' with the 3 fields populated, until saved in-app
SELECT lifecycle_status::text AS status,
       count(*)                                              AS learners,
       count(*) FILTER (WHERE college_email    IS NOT NULL)  AS have_email,
       count(*) FILTER (WHERE academic_year_id IS NOT NULL)  AS have_acad_year,
       count(*) FILTER (WHERE semester_id      IS NOT NULL)  AS have_semester,
       count(*) FILTER (WHERE section_id       IS NOT NULL)  AS have_section
  FROM public.learners_profiles
 WHERE id::text LIKE 'c0ffee00-0000-4000-8000-%'
 GROUP BY 1 ORDER BY 1;
```

Plus a live-roster sanity check — Nattraja's active headcount should fall from 226 to 225 under
Option A or B:

```sql
-- Read-only
SELECT count(*) AS nattraja_active_learners
  FROM public.learners_profiles
 WHERE institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'
   AND lifecycle_status::text = 'active';
-- before any change (2026-08-05): 226
```

---

## Appendix — every query used, verbatim

All executed read-only against ref `kvizhngldtiuufknvehv` on 2026-08-05.

**A1 — the activation function body**
```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosrc
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.proname = 'evaluate_learner_status_after_payment';
```

**A2 — the learner status ladder (proves `active` is filtered out by `gates_login`)**
```sql
SELECT code, label, sort_order, is_active, is_terminal, is_seat_filled,
       fee_paid_threshold_percent, gates_login, auto_promote_when_universal_paid
FROM admission_statuses WHERE scope='learner' ORDER BY sort_order NULLS LAST, code;
```

**A3 — the outstanding source of truth**
```sql
SELECT pg_get_viewdef('public.vw_learner_payment_progress'::regclass, true) AS def;
```

**A4 — every status transition ever written (proves 0 → active)**
```sql
SELECT to_status::text AS to_status, reason_code, count(*) AS n
FROM learners_profile_status_history GROUP BY 1,2 ORDER BY n DESC LIMIT 30;
```

**A5 — the activated_at trigger (proves it only stamps a timestamp)**
```sql
SELECT p.proname, p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='set_learner_activated_at';
```

**A6 — identify Nattraja**
```sql
SELECT id, name, institution_type, is_active FROM institutions
WHERE name ILIKE '%nattraja%' OR name ILIKE '%vidhyalya%' OR name ILIKE '%vidyalaya%' ORDER BY name;
```

**A7 — the 15 learners and their fields**
```sql
SELECT lp.id, lp.application_id,
       lp.first_name || COALESCE(' ' || lp.last_name,'') AS learner_name,
       lp.roll_number, lp.register_number, lp.college_email, lp.student_email,
       lp.program_id, lp.semester_id, lp.section_id, lp.department_id,
       lp.degree_id, lp.academic_year_id, lp.batch_id, lp.profile_id,
       lp.is_profile_complete, lp.activated_at, lp.created_at::date AS created
FROM learners_profiles lp
JOIN admission_years ay ON ay.id = lp.admission_year_id AND ay.is_current = true
WHERE lp.lifecycle_status::text = 'admitted'
  AND lp.institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'
ORDER BY lp.created_at;
```

**A8 — the three test markers, all Nattraja learners by status**
```sql
SELECT lp.lifecycle_status::text AS status, count(*) AS learners,
       count(*) FILTER (WHERE lp.id::text LIKE 'c0ffee00%')              AS sentinel_ids,
       count(*) FILTER (WHERE lp.first_name ILIKE '[TEST]%')             AS test_named,
       count(*) FILTER (WHERE lp.student_email ILIKE '%@example.invalid') AS invalid_email
FROM learners_profiles lp
WHERE lp.institution_id='29c221d1-b918-4c46-9d67-857273b0b553'
GROUP BY 1 ORDER BY 2 DESC;
```

**A9 — proof of zero bills (the ₹0 claim)**
```sql
SELECT count(*) AS bills_for_the_15 FROM billing_student_bills b
WHERE b.student_id::text LIKE 'c0ffee00-0000-4000-8000-%';
```

**A10 — the 16th sentinel row, already active**
```sql
SELECT id, application_id, first_name||COALESCE(' '||last_name,'') AS nm, lifecycle_status::text,
       roll_number, section_id, activated_at, profile_id, created_at
FROM learners_profiles WHERE id::text LIKE 'c0ffee00-0000-4000-8000-%'
  AND lifecycle_status::text <> 'admitted';
```

**A11 — per-learner missing fields + section resolution**
```sql
SELECT lp.application_id, lp.first_name||' '||COALESCE(lp.last_name,'') AS nm, lp.roll_number,
       (lp.college_email IS NULL)    AS missing_college_email,
       (lp.academic_year_id IS NULL) AS missing_academic_year,
       (lp.semester_id IS NULL)      AS missing_semester,
       (lp.section_id IS NULL)       AS missing_section,
       s.section_name, s.id AS section_id_val
FROM learners_profiles lp LEFT JOIN sections s ON s.id = lp.section_id
WHERE lp.id::text LIKE 'c0ffee00-0000-4000-8000-%' AND lp.lifecycle_status::text='admitted'
ORDER BY lp.roll_number;
```

**A12 — resolve the two sections actually referenced**
```sql
SELECT s.id, s.section_name, s.program_id, s.semester_id, pr.program_name
FROM sections s LEFT JOIN programs pr ON pr.id=s.program_id
WHERE s.id IN ('1ce4c1f2-71e2-43b2-b71e-62e6215002cc','87a33e48-0153-414c-aa55-3f98ca0f696e');
```

**A13 — Nattraja's grade/section inventory (proves Grade 3 "B" and Grade 4 "B" do not exist)**
```sql
SELECT pr.program_name, count(s.id) AS sections,
       string_agg(s.section_name,',' ORDER BY s.section_name) AS names
FROM programs pr LEFT JOIN sections s ON s.program_id=pr.id
WHERE pr.institution_id='29c221d1-b918-4c46-9d67-857273b0b553'
GROUP BY pr.program_name ORDER BY pr.program_name;
```

**A14 — the derivable academic year**
```sql
SELECT id, academic_year_name, is_active FROM academic_years
WHERE institution_id='29c221d1-b918-4c46-9d67-857273b0b553' ORDER BY academic_year_name DESC;
```

**A15 — FK targets for the gate fields (proves academic_year_id → academic_years)**
```sql
SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS refs
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=tc.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name
WHERE tc.table_name='learners_profiles' AND tc.constraint_type='FOREIGN KEY'
  AND kcu.column_name IN ('academic_year_id','semester_id','section_id','program_id');
```

**A16 — no login accounts exist for the fixtures**
```sql
SELECT count(*) AS auth_users_for_sentinels
FROM auth.users u WHERE u.email ILIKE '%@example.invalid';
-- result: 0
```

### Production code read (via `git show jicate/main:<path>`)

| Path | What it establishes |
|---|---|
| `lib/services/learner-profile-service.ts` L40–165 | `calculateProfileCompleteness` (the 4 fields), `isValidCollegeEmail` (@jkkn.ac.in), `checkAndAutoActivate` (the real `admitted`→`active` gate + account provisioning) |
| `app/(routes)/learners/enquiries/_components/enquiry-status-update.tsx` | `active` absent from the manual status dropdown |
| `app/(routes)/learners/enquiries/_components/bulk-status-update-dialog.tsx` | bulk options capped at "any pre-active stage" |
| `app/api/b2a/billing/outstanding/route.ts` | the `partial`/`overdue` status-filter defect noted in section 1 |

---

## Open decisions for the Director

1. **Quarantine (A) or delete (B) the 16 fixture rows?** No point-in-time recovery is enabled on
   this project, so B is one-way.
2. **The already-active fixture** (`[TEST] Asha Kumar`) is inflating Nattraja's live active
   headcount by 1 today. Same decision, or handle separately?
3. **Is the `admitted` → `active` ceiling intended?** Automation cannot cross it: every learner who
   pays in full stops at `admitted` and waits for a team member to open and save their record.
   That affects all 992 fee-gated learners, not just these 15. Worth a deliberate ruling rather
   than leaving it as an accident of the `gates_login = false` predicate.
