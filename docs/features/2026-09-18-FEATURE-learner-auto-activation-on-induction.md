# Activate a learner automatically when induction completes

**Status:** SPEC + migration shipped as a file. Backfill HELD for the Director's number.
**Date:** 2026-09-18
**Director ruling (2026-09-18 14:30):** learner activation becomes AUTOMATIC when induction completes.
**Module:** Learners — Lifecycle · Events — Induction

---

## 1. Why

304 learners sit at `lifecycle_status = 'admitted'` on production and were never moved to
`active`. 155 of them have already finished their induction. `admitted` is a
pre-onboarding status: it restricts the sidebar to four entries, which is what the
eleven "only three dashboard options" reporters were looking at — ten of the eleven
were induction-only learners. Nothing moved them on, because moving them on was an
admin action somebody had to remember to take.

All counts below were read live, read-only, from production (`kvizhngldtiuufknvehv`)
on 2026-09-18. No write was made against production by this work.

---

## 2. The "induction completed" signal — found, not guessed

There is **no induction "enrolment" table with a `completed` status**. The Director's
phrase maps onto one column:

> `public.induction_completion.outcome_complete` — `BOOLEAN NOT NULL DEFAULT false`,
> with `completed_at TIMESTAMPTZ` stamped beside it.

Defined in `supabase/migrations/20260627160000_induction_phase0_foundation.sql:109`.
One row per `(event_id, learner_id)` — `CONSTRAINT induction_completion_event_learner_uniq UNIQUE (event_id, learner_id)`.

**Two writers reach that column, and only two:**

| Writer | Where | How it writes |
|---|---|---|
| `fn_induction_recompute_completion(uuid)` | `supabase/migrations/20261018000000_induction_completion_basis_and_mentoring_track.sql:184` | `INSERT … ON CONFLICT (event_id, learner_id) DO UPDATE SET outcome_complete = …`. Authoritative — it can move a learner either way. Called by the coordinator/admin recompute and by the attendance writers `fn_induction_mark_attendance` / `fn_induction_mark_day_attendance`. |
| `fn_induction_completion_on_feedback()` | same file, line 317 | `AFTER INSERT` / `AFTER UPDATE` statement triggers on `event_session_feedback`. Carries its **own** copy of the denominator and does not call the recompute. |

Because both land on the same column of the same table, a **row-level trigger on
`induction_completion`** catches both and cannot be bypassed by a third writer added
later. That is the whole reason this is a trigger and not a service-layer hook — the
same argument the attendance rule already made for `student_attendance`.

`induction_completion` has **no trigger on it today** (checked across
`supabase/setup/04_triggers.sql` and every migration). This adds the first one.

**Deliberately NOT the signal:** `mentoring_complete` / `mentoring_completed_at`, added
by the same 2026-10-18 migration, track a year-long mentoring relationship judged on
its own bar. Induction completion is `outcome_complete`. A learner is not held out of
activation for a year.

---

## 3. What activation does today

### 3.1 The manual action (the one being automated)

`app/(routes)/learners/profiles/_components/row-actions.tsx` → row menu → status change →
`useUpdateLearnerProfile()` → `LearnerProfileService.updateLearnerProfile()` →
`PATCH learners_profiles SET lifecycle_status = 'active'`.

Permission gate in the UI (`row-actions.tsx:81`):

```ts
const canEdit = isSuperAdmin || isAdmissionGlobalUser || canAccess('learners', 'edit');
```

Underneath, the write is an ordinary authenticated `UPDATE` subject to
`learners_profiles` RLS. There is no dedicated `learners.activate` permission key.

### 3.2 Columns that change, and every trigger that fires

Writing `lifecycle_status = 'active'` changes three columns and wakes four triggers:

| Column | Written by |
|---|---|
| `lifecycle_status` | the caller |
| `activated_at` | `trg_set_learner_activated_at` (BEFORE UPDATE OF lifecycle_status) → `set_learner_activated_at()`. Stamps `now()` **only when `activated_at IS NULL`** — never overwritten. |
| `updated_at` | the caller |

| Trigger | Timing | Effect |
|---|---|---|
| `trg_set_learner_activated_at` | BEFORE UPDATE OF `lifecycle_status` | stamps `activated_at` once — the canonical seat-fill date for analytics |
| `trg_sync_learner_status_to_profile` | AFTER UPDATE OF `lifecycle_status` | sets `profiles.is_active`. **No change here:** `admitted` is already in that function's allow-list alongside `active`, so `is_active` is already `true`. Nobody is logged in or out by this feature. |
| `trg_jkkn_auto_issue_learner` | AFTER … `WHEN NEW.lifecycle_status IN ('reserved','account','admitted','active','graduated','alumni')` | JKKN number issuance. Already fired at `admitted`; fail-soft by design. |
| `trg_validate_learner_semester_year_scope` | BEFORE UPDATE (**all columns**) | re-validates that `degree_id` / `department_id` / `semester_id` / `academic_year_id` belong to the learner's institution. It runs on **every** update, including one that touches none of them — so a learner whose existing rows are already cross-institution-inconsistent would `RAISE` here. See §6, decision 10. |

### 3.3 The three activation routes that already exist

**The brief's claim that "there is no automatic admitted→active step anywhere" is not
quite right, and the correction matters.**

| Route | Function | Reason code | Rows on production |
|---|---|---|---|
| Payment ladder | `evaluate_learner_status_after_payment` | `auto_universal_paid`, `auto_threshold`, `auto_item_rule` | 1,045 + 266 — produces `reserved` and `admitted`, never `active` |
| Onboarding | `fn_activate_learner_from_onboarding` | `onboarding_activation` | 165 |
| First attendance | `fn_activate_learner_on_first_present` | `first_present_attendance` | **0** |

`fn_activate_learner_on_first_present` (migration `20260821030000_attendance_activates_learner.sql`,
Director ruling 2026-08-11) does exactly the shape of thing this spec asks for, for a
different signal. **It is live on production and switched OFF.** Proof: its config row
`learners.activate_on_first_present.enabled` is present with `value = false`,
`is_system = true`, `ui_category = 'Learners — Lifecycle'` and its description verbatim
from that file — so that migration was applied. Zero `first_present_attendance` rows in
`learners_profile_status_history` confirm it has never fired.

So: an automatic route exists, has never run, and the reason it was switched off
(provisional learners were not on the marking roster) is not this feature's reason. This
feature is **modelled on it line for line** — same config-row gate, same allowlist
discipline, same audit table, same `SECURITY DEFINER` justification — rather than
inventing a parallel mechanism.

---

## 4. The rule

> When a learner's `induction_completion.outcome_complete` becomes `true`, set that
> learner's `lifecycle_status` to `'active'` **if and only if it is currently
> `'admitted'`**.

Implemented as `fn_activate_learner_on_induction_complete()`, a `SECURITY DEFINER`
trigger function, fired by:

```sql
AFTER INSERT OR UPDATE OF outcome_complete ON public.induction_completion
FOR EACH ROW
WHEN (NEW.outcome_complete IS TRUE)
```

Gated by the config row `learners.auto_activate_on_induction` (boolean, **default
`true`** — the Director's ruling is that this becomes automatic), read at runtime
through the existing `fn_get_policy_bool` accessor. No new accessor is written.

Every activation writes one `learners_profile_status_history` row with
`reason_code = 'induction_completed'` and metadata naming the induction event and the
completion row that caused it.

---

## 5. Counts read live from production (2026-09-18)

**Learner lifecycle census — 7,582 learners:**

| Status | n | | Status | n |
|---|---|---|---|---|
| active | 5,164 | | rejected | 94 |
| graduated | 1,105 | | enquiry | 43 |
| enquiry_submitted | 399 | | exited | 20 |
| **admitted** | **304** | | withdrawal_pending | 5 |
| inactive | 245 | | approved | 4 |
| reserved | 112 | | waitlisted / alumni / pending | 0 |
| account | 87 | | | |

**Admitted learners by institution (304):**

| Institution | admitted | of those, induction complete |
|---|---|---|
| JKKN College of Engineering and Technology | 119 | **86** |
| JKKN College of Pharmacy | 101 | **53** |
| JKKN College of Nursing and Research | 45 | **10** |
| JKKN Dental College and Hospital | 16 | 0 |
| Nattraja Vidhyalya CBSE | 15 | 0 |
| JKKN College of Allied Health Sciences | 7 | **6** |
| JKKN College of Education | 1 | 0 |
| **Total** | **304** | **155** |

**The 673 learners whose induction is already complete, by current status — this is the
blast radius the `admitted`-only allowlist is protecting:**

| Current status | n | What the rule does |
|---|---|---|
| active | 470 | nothing — already active |
| **admitted** | **155** | **activate** |
| inactive | 24 | nothing — see decision 5 |
| rejected | 12 | nothing — see decision 4 |
| reserved | 9 | nothing — see decision 6 |
| account | 3 | nothing — see decision 6 |

The allowlist is doing real work: 48 learners with a complete induction are deliberately
left where they are.

**Unverified from the brief:** the "26bp" batch (95 in the batch, 61 admitted, 44 of
those complete) could not be reproduced. No batch, event or admission year on production
carries "26bp" in its name; the 155 activatable learners sit in exactly two batch values —
`NULL` and one batch named `2025-2029`. The per-institution totals above are the numbers
to use.

---

## 6. Edge cases — one decision each

**1. Fees pending → do NOT gate on it.**
`learners_profiles.fees_confirmed` is `false`/`NULL` on **all 7,582 rows on production** —
zero rows have it true, including all 5,164 already-active learners. Gating on it would
activate nobody, forever, silently. The real money ladder lives in `admission_statuses` /
`evaluate_learner_status_after_payment`, and reaching `admitted` already means the ~30%
threshold was cleared. **Consequence stated plainly:** activating on induction bypasses
the notional 60% manual gate, exactly as the attendance rule's header documented for its
own case. That is the Director's ruling, recorded here rather than discovered later.

**2. Documents pending → do NOT gate on it.**
151 of the 155 have `is_profile_complete = true`; 4 do not. The My Induction profile
nudge (`app/(routes)/learners/my-induction/_components/profile-nudge.tsx`) already chases
those four. Blocking them would leave them in the four-entry sidebar with no route out,
which is the problem this feature exists to fix.

**3. Learners already `active` → no-op, no audit row.**
470 of the 673. The status predicate is repeated **inside** the `UPDATE`, not only in the
selecting CTE, so under READ COMMITTED the row re-check after the lock makes a concurrent
activation lose the race cleanly instead of writing a second history row. `activated_at`
is never overwritten (`set_learner_activated_at` only writes when `NULL`). Re-running the
recompute every day for a year produces exactly one activation and one history row.

**4. Rejected / withdrawn → never activated.**
12 learners with a complete induction are `rejected`; 5 rows platform-wide sit at
`withdrawal_pending`. The guard is an **allowlist of exactly one status**, not a blocklist —
a blocklist fails open the day a sixteenth enum label is added.

**5. `inactive` learners → never reactivated.**
24 learners with a complete induction are `inactive` — a deliberate suspension or leave
somebody entered by hand. Auto-reactivating them would silently undo an admin action. Out
of scope; if the Director wants them reviewed it is a separate worklist, not a trigger.

**6. `reserved` / `account` → not activated by this rule.**
9 + 3 learners. The ruling names `admitted`. The attendance rule (switched off) names
`reserved` **and** `admitted`; keeping this one narrower means this feature does not
quietly introduce the wider fee-gate bypass through a side door. If the Director wants
`reserved` included, it is one word in the allowlist and a new migration — not a config
toggle, because widening who gets activated should be reviewable.

**7. Two rows for one learner → cannot arise, and the write is guarded anyway.**
`induction_completion` is `UNIQUE (event_id, learner_id)`. Measured on production: 673
complete rows belong to 673 distinct learners — **zero** learners have two complete rows.
Zero learners in the admitted set have two `profiles` rows. If a learner ever completes a
second induction event, the second trigger firing finds them already `active` and no-ops
(decision 3).

**8. A learner with no login profile → activate anyway.**
2 of the 155 have no `profiles` row (153 do). Activation is a fact about the learner
record; `auto_link_profile_to_approved_learner` attaches the login when it appears. Making
activation wait for a login would make the record depend on the order two unrelated
things happened to occur in.

**9. Learners who completed induction BEFORE this ships → backfill recommended, HELD.**
See §7.

**10. A learner whose existing academic FKs are cross-institution → fail soft, never
block.**
`trg_validate_learner_semester_year_scope` fires `BEFORE UPDATE` on **all** columns, so it
re-validates FK scope on an update that touches none of them. On a learner whose rows are
already inconsistent it raises — and a raise inside an `AFTER` row trigger would abort the
whole induction recompute transaction, so one bad learner record would stop induction
completion being recorded for an entire event. The activation is therefore wrapped in an
exception handler that turns the failure into a `WARNING` and lets the recompute proceed,
mirroring `trg_jkkn_auto_issue_learner`'s documented "fail-soft by design: an issuance
failure warns, never blocks".

**11. The policy switched off → nothing happens at all.**
One `fn_get_policy_bool` lookup per completion write and no other cost. The switch is read
first, before any other work.

---

## 7. The backlog of 155 — a held backfill, not a migration

155 admitted learners already have `outcome_complete = true` and would never be picked up
by a forward-only trigger.

**Recommendation: backfill them.** They finished the thing; the only reason they are still
on a four-entry sidebar is that nobody pressed a button.

**It ships as `supabase/manual/2026-09-18_backfill_learner_activation_from_induction.sql`,
NOT as a migration**, so `supabase db push` and the ship wave cannot apply it. It is run
by hand, once, **only on the Director's number**. The file opens with a `SELECT` that
prints the per-institution counts as they stand at the moment of running (they drift), and
the `UPDATE` is commented out behind a `BEGIN` so a rehearsal rolls back.

Per institution, as measured 2026-09-18: Engineering 86 · Pharmacy 53 · Nursing 10 ·
Allied Health Sciences 6 — **155 total**. Backfill rows carry
`reason_code = 'induction_completed_backfill'` so they are distinguishable from live
activations forever.

---

## 8. What changes on the learner's dashboard

An `admitted` learner is inside `INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES`
(`lib/constants/induction-access.ts`), which `proxy.ts` and `lib/sidebarMenuLink.ts`
both read. They see exactly four entries and nothing else loads:

- `/learners/my-induction`
- `/learners/my-profile`
- `/service-requests` (rewritten to `/service-requests/my-requests`)
- `/ai-pulse`

Anything else redirects to `/learners/my-induction`. That is the "only three dashboard
options" complaint, measured.

On `active`, the learner leaves that list and the full learner sidebar renders — timetable,
attendance, fees, results, campus living, everything their role already grants.

`profiles.is_active` does **not** change: `sync_learner_status_to_profile` already treats
`admitted` as login-eligible. No session is invalidated; the next page load simply shows
more.

---

## 9. Who is notified

**Nobody, by default.** The trigger writes no notification, no email, no push. The only
trace is the `learners_profile_status_history` row (`reason_code = 'induction_completed'`).

Rationale: a learner who has just finished induction and sees their menu grow does not need
to be told twice, and 155 simultaneous messages at backfill time would be noise. If the
Director wants an announcement it is a separate, separately-gated piece of work.

---

## 10. Config — the policy row

Per `docs/architecture/config-table-pattern.md`, every policy decision is a row.

| Field | Value |
|---|---|
| `policy_key` | `learners.auto_activate_on_induction` |
| `scope_type` | `global` (institution scope works for free — `fn_get_policy` resolves user > institution > role > global, so a per-college override is a row, not a code change) |
| `value` | `true` |
| `data_type` | `boolean` |
| `is_system` | `true` |
| `classification` | `major` |
| `ui_category` | `Learners — Lifecycle` (same bucket as the attendance switch) |

Accessor: the existing `fn_get_policy_bool(text, boolean, uuid)`. Nothing new is written.

**Default is `true`, unlike the attendance switch's `false`.** The attendance rule shipped
off because its precondition (provisional learners on the marking roster) was not live.
This rule has no such precondition: the signal already exists, already fires, and 155
learners are already waiting behind it.

---

## 11. Files

| File | What |
|---|---|
| `supabase/migrations/20260918170000_learner_auto_activate_on_induction.sql` | config row + function + trigger |
| `supabase/manual/2026-09-18_backfill_learner_activation_from_induction.sql` | the held backfill — **not auto-applied** |
| `supabase/setup/02_functions.sql` | mirror of the function |
| `supabase/setup/04_triggers.sql` | mirror of the trigger |
| `supabase/SQL_FILE_INDEX.md` | index entry |
| `__tests__/lib/induction/auto-activation-on-induction.test.ts` | structural guard |

---

## 12. What is NOT done here

- The migration is a **file**. It is not applied to production by this PR.
- The backfill is **held** for the Director's number.
- No UI is added. The config row is editable through the existing platform-policies admin screen.
- No notification of any kind.
- `reserved`, `account` and `inactive` learners are untouched.
