# AUDIT — test-pattern accounts holding real roles, and `academic_years.is_active` set on 38 rows

**Date of every live number below: 2026-08-06, ~13:42 IST.**
**Production project ref `kvizhngldtiuufknvehv`. Read-only: every finding came from `SELECT`. Nothing was changed.**

Roughly nine Claude panes write to this database concurrently. Counts drift within hours — re-derive before acting, do not trust a number in this file that is more than a day old.

Two independent audits. Section A is access control. Section B is the academic calendar. Both end in a recommendation, and **neither was executed**.

---

## Section A — test-pattern accounts checked for real roles

### A.1 What was swept

Every row in `profiles` whose `email` or `full_name` matches a test pattern: `test.*@`, any email containing `test`, any name containing `test`, plus keyboard-mash junk (`hodasdasdasda@`). **48 accounts** out of 7,234 total `profiles` rows.

For each: assigned `role_key`s via `user_roles` → `custom_roles`, the legacy `profiles.role` value, `institution_id`, the role's `institution_scope`, and last sign-in from `auth.users`.

The number 38 quoted in the brief was not reproduced. The correct population today is **48**.

### A.2 The finding that governs every recommendation: revoking takes TWO layers

**Deleting a `user_roles` row does NOT clear `profiles.role`.** No trigger fires on `DELETE`, and the legacy field keeps whatever value it held. This is not a theoretical concern — the two helpers that gate the most policies read the legacy field and never look at `user_roles` at all:

| Helper | What it actually reads | RLS policies gated by it |
|---|---|---|
| `is_super_admin()` | `profiles.is_super_admin` only | **1,539** |
| `is_admin()` | `profiles.is_super_admin` **OR** `profiles.role IN ('admin','super_admin','administrator')` | **1,295** |
| `sh_is_leadership()` | `profiles.role IN ('cbo','ceo','cao','coo','principal','system_admin')` only | **0** |

Verified definitions, live, today. Two consequences:

1. **`sh_is_leadership()` is not the lever the brief assumed.** Zero RLS policies reference it; exactly one other function does (`sh_has_management_access`). An account that trips it is not thereby powerful.
2. **`profiles.role` is load-bearing on 1,295 policies** through `is_admin()`. An account stripped of its `user_roles` row but left with `role = 'admin'` is still an administrator everywhere `is_admin()` is checked.

**Therefore: any account recommended for stripping needs both layers cleared — the `user_roles` row AND `profiles.role` — or it stays powerful in the legacy path.**

### A.3 A profile with no `auth.users` row is armed, not inert

`profiles` has **no foreign key to `auth.users`** (confirmed: zero FK constraints reference it). 1,233 of 7,234 `profiles` rows have no matching `auth.users` row.

Those are not dead. `app/auth/callback/route.ts` matches an incoming Google identity to a profile **by email**, then calls `migrate_pre_registered_profile_to_auth`. That RPC's `INSERT` carries `role`, `institution_id`, and `is_active` onto the new auth id, and re-inserts every `user_roles` row from a snapshot.

So a role sitting on an auth-less profile transfers to whoever first signs in with that address.

One mitigating detail, worth knowing precisely: the RPC's column list **omits `is_super_admin`**, so that flag alone does not survive a claim. And `is_active === false` blocks login at the callback (`app/auth/callback/route.ts:484` signs the session out and redirects to `/unauthorized?reason=inactive`), and the RPC preserves `is_active` via `COALESCE(v_old.is_active, true)`.

### A.4 Findings ranked by real risk

Risk is graded on blast radius, not on the role name. `institution_scope` and the size of the institution both matter — JKKN Testing Institution holds 36 `profiles` rows and 7 learners; JKKN College of Arts and Science (Self) holds 1,696 and 1,544.

#### SEVERE — 1 account

| Account | Role held | Legacy `profiles.role` | Institution | Last sign-in |
|---|---|---|---|---|
| `test.superadmin@jkkn.ac.in` | `super_admin` (scope `all`) | `super_admin` | *(none)* | 2026-08-04 12:24 |

`profiles.is_super_admin = true`. This is the single account that satisfies `is_super_admin()` — the first check in **1,539** RLS policies — and `is_admin()`'s **1,295** as well. Active, password set, signed in two days ago. It bypasses multi-tenancy entirely: no `institution_id`, no scoping.

#### HIGH — 2 accounts, both on live institutions, both holding an `all`-scope executive role

| Account | Role held | Perms granted | Holders of that role | Institution | Last sign-in |
|---|---|---|---|---|---|
| `test.managing_director@jkkn.ac.in` | `managing_director` (scope `all`) | 743 | **2 — one of them is this account** | JKKN Dental College and Hospital (799 profiles) | 2026-08-06 06:41 |
| `testfacilitator@jkkn.ac.in` ("test facilitator") | `ceo` (scope `all`) | 741 | **2 — one of them is this account** | Nattraja Vidhyalya CBSE (283 profiles) | 2026-07-15 09:30 |

These are the two heaviest roles on the platform by permission count, both cluster-wide, and in each case **half the holders are a test account**. `testfacilitator` has no password — it authenticates through Google SSO on a `jkkn.ac.in` address, which means the account is only as protected as that mailbox. Its legacy `profiles.role = 'ceo'` also trips `sh_is_leadership()`, though as established that gates nothing.

#### MEDIUM — `all`-scope roles on live data

| Account | Role held | Scope | Last sign-in |
|---|---|---|---|
| `test.accounts@jkkn.ac.in` | `accounts` (121 perms) | `all` | 2026-08-02 02:22 |
| `test.admission@jkkn.ac.in` | `admission` (261 perms) | `all` | 2026-07-12 08:56 |
| `test.admission_staff@jkkn.ac.in` | `admission_staff` (170 perms) | `all` | 2026-04-25 08:16 |
| `test.faculty@jkkn.ac.in` | `staff_counselor` (68 perms) | `all` | 2026-08-05 09:22 |
| `test.health_sup@jkkn.ac.in` | `health_supervisor` (38 perms) | `all` | 2026-06-23 09:19 |
| `test.health_coun@jkkn.ac.in` | `health_counselor` (72 perms) | `all` | 2026-06-15 20:42 |

Cross-institution reach by design of the role. `accounts` at `all` scope reaches billing across every college.

#### MEDIUM — `own`-scope roles sitting on large live institutions

| Account | Role held | Institution | Profiles there | Last sign-in |
|---|---|---|---|---|
| `testuser@jkkn.ac.in` ("Test  User") | `hod` (335 perms) | JKKN College of Arts and Science (Self) | 1,696 | 2026-05-18 10:48 |
| `testhod@jkkn.ac.in` ("test hod") | `hod` | Nattraja Vidhyalya CBSE | 283 | 2026-08-02 03:17 |
| `testhod1@jkkn.ac.in` ("TEST HOD") | `hod` | Nattraja Vidhyalya CBSE | 283 | never (no `auth.users` row — claimable, see A.3) |
| `testing@jkkn.ac.in` ("dsfsdf sdfsd") | `staff` | JKKN College of Arts and Science (Self) | 1,696 | never (auth row exists) |
| `teststaff@jkkn.ac.in` ("Roja") | `faculty` | JKKN Dental College and Hospital | 799 | never (no `auth.users` row) |

⚠️ `teststaff@jkkn.ac.in` carries a plausible human name. **Confirm with a person before touching it** — it may be a real team member on an unfortunate address, not a test fixture.

#### LOW — the two the brief flagged, both confirmed, both correctly graded low

| Account | Role held | Legacy `profiles.role` | Institution |
|---|---|---|---|
| `test.principal@jkkn.ac.in` ("Test Principal") | `principal` (scope `own`, 305 perms) | `principal` | JKKN Testing Institution |
| `hodasdasdasda@jkkn.ac.in` ("Hod JKKN") | `principal` (scope `own`) | `principal` | JKKN Testing Institution |

Both confirmed exactly as described. Both are scoped `own` to JKKN Testing Institution — 36 profiles, 7 learners, no real cohort. That is why they rank below the `hod` rows above, which sit on institutions 20-50× larger.

Two refinements the brief did not have:

- `hodasdasdasda@jkkn.ac.in` has **no `auth.users` row**. It cannot log in today. Per A.3 it is claimable by anyone who signs in with that address — armed, not inert.
- `test.principal@jkkn.ac.in` is fully live: password set, last sign-in 2026-07-13.

#### LOW — no role assigned, but a legacy `profiles.role` that still reads as power

This is the two-layer problem in its observable form. Zero `user_roles` rows; the legacy field alone decides.

| Account | `user_roles` | Legacy `profiles.role` | Effect | `is_active` |
|---|---|---|---|---|
| `test.admin2@jkkn.local` | *(none)* | `admin` | **satisfies `is_admin()` → 1,295 policies** | false |
| `testing85@gmail.com` | *(none)* | `admission` | legacy checks read `admission` | false |
| `test.handover_receiver@jkkn.ac.in` | *(none)* | `accountant_assistant` | legacy checks read the role | true, signed in 2026-08-06 06:47 |

`test.admin2@jkkn.local` is the sharpest illustration in the whole dataset: **no role is assigned to it, and it is still an administrator** as far as 1,295 policies are concerned. Practical risk is low today — `is_active = false` blocks login, there is no `auth.users` row, and `.local` is not a routable mail domain — but the mechanism is exactly the one that will bite a real account.

#### Already remediated — worth recording as the model

`testprincipal@jkkn.ac.in` ("test principal", JKKN College of Arts and Science (Self)) now shows **`user_roles` empty AND `profiles.role = 'staff'`**. This is the account the previous session stripped, and **both layers were cleared**. It is the correct shape. Reproduce it.

#### Remainder — no action proposed

The other ~24 accounts hold `student`, `driver`, `faculty`, `event_coordinator`, `coe`, `digital_coordinator`, `health_screener` or nothing, all scoped `own`, mostly at JKKN Testing Institution, or are inactive fixtures (`claude-test-…@test.local`, `fresh-admin-…@test.local`, `test-superadmin@jkkn.local` — which despite its name has `is_super_admin = false` and legacy role `faculty`). `trgsmoke.institution@nolog.jkkn.local` has `is_login_disabled = true`.

Note `test.mba_associate@jkkn.ac.in` holds only `student` — consistent with the known nightly cohort sync that revokes `mba_associate` from non-members.

### A.5 Recommendation (not executed)

Ordered. Every step below is a proposal for a human to approve.

1. **`test.superadmin@jkkn.ac.in`** — decide whether a live super-admin test identity is wanted at all. If it is retained, it should be the only one and it should be reviewed on a schedule. If not, three fields have to move together: delete the `user_roles` row, set `profiles.role` to something inert, **and set `profiles.is_super_admin = false`** — that third one is the only field `is_super_admin()` reads, and neither of the first two touches it.
2. **`test.managing_director@jkkn.ac.in` and `testfacilitator@jkkn.ac.in`** — strip both layers. These are the highest-value roles on the platform and each is 50% held by a test account. `testfacilitator` additionally needs its Google identity considered, since it has no password.
3. **The six `all`-scope MEDIUM accounts** — decide per account whether cross-institution reach is still needed for role testing. Where it is, prefer narrowing `institution_scope` on a dedicated fixture over leaving `all`.
4. **`testuser@`, `testhod@`, `testhod1@`, `testing@`** — move off the large live institutions or strip. `testhod1@` has no auth row and is claimable; stripping it closes that.
5. **`teststaff@jkkn.ac.in`** — verify with a person first. Do not strip on the strength of the address.
6. **The three legacy-only rows** — clear `profiles.role`. There is nothing else to delete; the legacy field *is* the grant.
7. **`test.principal@` and `hodasdasdasda@`** — low urgency, but cheap. Both layers, as always.

**For every one of these: clear `user_roles` AND `profiles.role`. Clearing one leaves the account powerful through the other.**

Two structural fixes worth considering separately, both outside this audit's scope: a trigger that reconciles `profiles.role` when the last `user_roles` row is deleted, and a periodic report of accounts whose `profiles.role` has no backing `user_roles` row.

---

## Section B — `academic_years.is_active` is true on 38 of 42 rows

### B.1 Confirmed live, and materially worse than reported

The brief said 2024-25 and 2026-27 are both flagged active. Both are — but the real shape is:

| Measure | Value (2026-08-06) |
|---|---|
| `academic_years` rows total | 42 |
| Rows with `is_active = true` | **38** |
| Rows with `is_active = false` | 4 |
| Institutions holding at least one active year | 12 |
| Active rows whose date range brackets today | **12 — exactly one per institution** |
| Active rows starting in the future | 6 |
| Active rows that already ended | 20 |

The four inactive rows are all junk at JKKN Dental College and Hospital ("2025-2026 Additional 1 / 3 / 4", "2026-2027 Additional 2"). **Every genuine year row in the database is active.**

Naming note: the rows are `2024-2025` and `2026-2027`, not `2024-25` / `2026-27`.

Per institution:

| Institution | Active years | Names |
|---|---|---|
| JKKN College of Pharmacy | **10** | 2021-2022 → 2030-2031 |
| JKKN Dental College and Hospital | **7** | 2022-2023 → 2028-2029 |
| Arts and Science (Self) / (Aided), Allied Health, Engineering, Nursing | 3 each | 2024-2025, 2025-2026, 2026-2027 |
| JKKN Testing Institution | 2 | 2025-2026, 2026-2027 |
| Nattraja Vidhyalya CBSE, College of Education, Matric Higher Secondary, Jicate Solutions | 1 each | 2026-2027 |

### B.2 Why it is in this state

Three causes, all structural:

1. **`is_active` has `DEFAULT true`.** Every year created is born active.
2. **Nothing enforces uniqueness.** `academic_years` carries seven indexes; the only unique ones are the primary key and `(institution_id, academic_year_name)`. There is **no partial unique index** on `(institution_id) WHERE is_active`. Nothing prevents N.
3. **Nobody deactivates.** Every one of the 42 rows carries `updated_at = 2026-07-28 14:15 IST` — a single bulk update touched the whole table at once, and no row has been individually retired since.

### B.3 Reader inventory, with the failure mode per caller

**Database side:** 43 functions reference `academic_years`, 21 of them filter on `is_active`; 1 view; 5 RLS policies; 18 tables hold a foreign key to it.
**Code side:** 64 files under `app/`, `lib/`, `hooks/`, `components/` reference it.

The classification that matters is what each does when the filter returns many rows.

#### Class 1 — `.limit(1)` / `LIMIT 1` on `ORDER BY start_date DESC`: silently picks one, order-dependent. **The dangerous case.**

| Reader | Location |
|---|---|
| `fn_auto_allocate_classic` | DB function — campus living bed allocation |
| `fn_cl_admin_allocate_bed` | DB function — campus living |
| `fn_self_request_room` | DB function — campus living |
| `_cl_apply_upgrade_fee_bill`, `_cl_execute_first_booking`, `_cl_upgrade_category_only` | DB functions — campus living fees |
| **`app/api/admission/bridge/convert/route.ts:134-141`** | writes `learners_profiles.academic_year_id` |
| `lib/services/academic/faculty-attendance-service.ts:748-754` | fallback path only (bracketing tried first) |

These do not throw. They return the **latest-starting active year**, which is not the current one wherever a future year exists:

| Institution | Correct (brackets today) | What `ORDER BY start_date DESC LIMIT 1` returns | Wrong by |
|---|---|---|---|
| **JKKN College of Pharmacy** | 2026-2027 | **2030-2031** | 4 years |
| **JKKN Dental College and Hospital** | 2026-2027 | **2028-2029** | 2 years |
| The other 10 institutions | 2026-2027 | 2026-2027 | correct — **by luck** |

The ten correct ones are correct only because their latest active year happens to be the current one. That luck expires the moment anyone pre-creates a future year for them, which is precisely what Pharmacy and Dental did.

Sorting by `academic_year_name` is no better: the column is `TEXT`, so `'2030-2031' > '2026-2027'`. It returns the same wrong answers. (The comment in `hooks/use-academic-years.ts` also warns of names with trailing spaces — that is **no longer true today**: 0 rows have leading or trailing whitespace. The text-sort hazard it warns about is still entirely real.)

#### Class 2 — `.maybeSingle()` without an institution filter: throws PGRST116, and the error is reported as the wrong cause

**`app/api/learners/enquiries/import/route.ts:771-776`** looks up the year by name and `is_active` with **no `institution_id` filter**, then `.maybeSingle()`. `academic_year_name` is unique only per `(institution_id, academic_year_name)`, so:

| Name a user would type | Active rows matching | Result |
|---|---|---|
| `2026-2027` | **12** | PGRST116 |
| `2025-2026` | 8 | PGRST116 |
| `2024-2025` | 7 | PGRST116 |

The handler is `if (ayError || !academicYear)` → it pushes the message **`Academic Year "…" not found`**. So the bulk enquiry import **fails for every year name that exists at more than one institution, and blames the wrong thing.** This is live and user-visible, and it is the highest-value single fix in Section B.

#### Class 3 — date-bracketing, institution-scoped: correct today, fragile by construction

| Reader | Note |
|---|---|
| `hooks/use-academic-years.ts` → `useCurrentAcademicYear` | The hardened exemplar. Brackets today, `.limit(1)`, falls back to most-recently-started. Its doc comment already names this exact bug. |
| `app/api/student-form/[token]/course-options/route.ts:260-267` | Brackets today, institution-scoped, `.maybeSingle()` — its comment asserts "exactly one row for every institution" |
| `lib/services/academic/faculty-attendance-service.ts:735-743` | Brackets today first |
| `fn_kit_resolve_entitlements` | Orders bracketing rows first, deliberately; comments explain the duplicate-grant risk |

These are right **because exactly 12 active rows bracket today, one per institution**. The `course-options` route uses `.maybeSingle()` on that assumption — it is one overlapping bracketing row away from PGRST116. The assumption holds today and is not guaranteed by any constraint.

#### Class 4 — returns an array, handled correctly

`useAcademicYears`, `academic-year-service.getByInstitution`, the attendance and billing filter panels, `app/(routes)/academic/years/_data/get-academic-years.ts`. These render a picker; many rows is the intended behaviour. **They are not broken — but with 38 active rows the Pharmacy picker now lists 10 years, of which 9 are wrong for today.** That is a usability problem, not a correctness one.

#### Class 5 — no institution filter at all, no ordering

**`ai_rpc_user_context`** — `FROM academic_years ay WHERE ay.is_active = true LIMIT 1`, no institution predicate, no `ORDER BY`. It returns an **arbitrary** active year from **any** institution as every user's `current_academic_year_id`. 38 candidate rows. Worst DB-side reader in the sweep, and it can hand one college's year to another college's user.

#### Class 6 — used as a filter, not a picker

`fn_teaching_cohort_sync` joins `ay.is_active` as a predicate on existing `lp.academic_year_id` values. With 38 of 42 rows active this filter is close to a no-op, so cohort membership widens rather than breaks.

### B.4 Damage already on the ledger

Three `learners_profiles` rows are pinned to a **future** academic year:

| Institution | Pinned to | Profile created (IST) |
|---|---|---|
| JKKN Dental College and Hospital | 2028-2029 | **2026-08-06 12:01 — about 90 minutes before this audit** |
| JKKN College of Pharmacy | 2030-2031 | 2026-08-01 15:30 |
| JKKN Dental College and Hospital | 2027-2028 | 2026-07-27 11:14 |

The first two match **exactly** what `ORDER BY start_date DESC LIMIT 1` returns for their institution today (2028-2029 at Dental, 2030-2031 at Pharmacy). The third is also a future-year pin but predates the current picker result for Dental, so its origin is not established here.

**This is ongoing, not historical.** One of the three was written today.

And it propagates. `fn_billing_bill_default_academic_year` (trigger on `billing_student_bills`) copies `learners_profiles.academic_year_id` onto any new bill whose own `academic_year_id` is `NULL`. The chain is:

`bridge/convert` picks the latest-starting active year → writes it to `learners_profiles.academic_year_id` → the trigger stamps it onto every subsequent bill for that learner → those bills are invisible to any reader filtered on the current year.

### B.5 The trap: do NOT simply deactivate the extra years

**288 `billing_student_bills` rows point at a future active year — ₹9.54 crore in total — and they are deliberate, not corrupt.**

| Year | Bills | Distinct learners | Due date | Status | Amount |
|---|---|---|---|---|---|
| 2027-2028 | 110 | 110 | 2028-05-31 | unpaid | ₹3,54,67,500 |
| 2028-2029 | 88 | 88 | 2029-05-31 | unpaid | ₹2,86,55,000 |
| 2029-2030 | 60 | 60 | 2030-05-31 | unpaid | ₹2,05,25,000 |
| 2030-2031 | 30 | 30 | 2031-05-31 | unpaid | ₹1,07,95,000 |

All at JKKN College of Pharmacy, all created 2026-06-12 — the same day those year rows were created — one bill per learner, `fee_source = 'academic'`, each due date matching its year. The 110 / 88 / 60 / 30 taper across consecutive years is a forward fee schedule for a multi-year programme, not an accident.

**So the obvious remedy is wrong for Pharmacy.** Deactivating 2027-2028 through 2030-2031 there would hide ₹9.54 crore of scheduled receivables from every reader that filters on `is_active`.

The correct reading of the whole situation: **`is_active` is being used as "this row is usable" when the readers treat it as "this is the current year".** Those are different questions and one boolean cannot answer both.

By contrast, Dental's two future years (2027-2028, 2028-2029) carry **zero** bills and one `learners_profiles` row each — the mis-pinned ones from B.4.

### B.6 Recommendation (not executed)

**Which year to deactivate: none of them, yet.** Deactivating rows treats the symptom and, at Pharmacy, destroys legitimate data. The fix that survives is to stop asking `is_active` a question it cannot answer.

Ordered by value per unit of risk:

1. **Fix `app/api/learners/enquiries/import/route.ts:771-776`** — add `.eq('institution_id', …)`. Smallest diff, live user-visible bug, no data change. Also worth surfacing the real error instead of collapsing every failure to "not found".
2. **Fix `app/api/admission/bridge/convert/route.ts:134-141`** — switch from `ORDER BY start_date DESC LIMIT 1` to date-bracketing with that as fallback, matching `useCurrentAcademicYear`. This is the writer that is producing wrong pins today, and it feeds the billing trigger.
3. **Fix `ai_rpc_user_context`** — add the institution predicate and date-bracketing. Currently returns an arbitrary year from an arbitrary institution.
4. **Fix the campus-living pickers** (`fn_auto_allocate_classic`, `fn_cl_admin_allocate_bed`, `fn_self_request_room`, the three `_cl_*` fee functions) to bracket by date. These are correct today at 10 of 12 institutions purely by luck.
5. **Repair the 3 mis-pinned `learners_profiles` rows** — only after step 2, or they will simply recur. Check for downstream bills stamped from them before and after.
6. **Then, and only then, consider the data.** Two separable questions, and they should be decided separately:
   - Should the 20 already-ended active years be retired? Low risk once the readers bracket by date, since no reader would select them anyway.
   - Should Pharmacy's and Dental's future years stay active? **Pharmacy's must, or ₹9.54 crore of scheduled bills disappears from `is_active`-filtered readers.** The real answer is probably a second column that means "current" — leaving `is_active` to mean "usable" — rather than overloading the one boolean.
7. **Add the constraint that makes recurrence impossible** — but only after step 6 decides what the invariant actually is. A partial unique index on `(institution_id) WHERE is_active` cannot be added today: 8 institutions would violate it immediately, and at Pharmacy enforcing it would require deactivating the years those 288 bills depend on.

**What breaks if someone deactivates a year right now, before steps 1-5:** every Class 4 picker loses it from its dropdown; every Class 1 caller silently shifts to a different year with no error; the 288 Pharmacy bills (₹9.54 cr) stop matching `is_active` filters in billing reads; and the Class 3 date-bracketing readers are unaffected. The Class 1 shift is the one nobody would notice.

---

## Provenance

Both audits are read-only. No row was written, no migration was authored, no configuration was changed. Every count carries the 2026-08-06 date-stamp above and should be re-derived before any action is taken on it.
