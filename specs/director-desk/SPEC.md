# Director's Desk — hand over any page, and the handover IS the permission

**Locked:** 2026-08-04, Director interview (12 decisions)
**Problem it solves:** you assign someone a job, and they cannot open the page it lives on,
because the page is gated on a role they do not hold. Today the only fix is a trip to Role
Management, which widens access for *everyone* holding that role.

---

## The one idea

A handover row **is** a permission grant. No role edit, no second step.

This works because every permission decision on the platform funnels through exactly two
places, and both are taught to read the handover table:

| Layer | Chokepoint | Guards |
|---|---|---|
| Database | `user_has_permission(text)` — **4,093 call sites, 595 migrations** | every RLS policy |
| Client | `get_user_roles_with_details` → merge in `hooks/use-permissions.ts` | every page gate |

Change those two, and a handover unlocks all four layers of any page at once
(page gate · RLS · RPC · API route — see `feedback_widening_a_permission_is_four_layers`).

### Performance guarantee — true of the database half only

`user_has_permission` is `STABLE` and folded into a once-per-statement InitPlan across
hundreds of RLS policies. The handover check is appended as the **fourth and last** gate,
reached only after super-admin, multi-role and legacy-role checks have all returned false.

**On the database side, a user who holds a page by role never touches the handover table.**
Only a user who would otherwise be *denied* pays one indexed lookup — and that lookup uses
`permission_keys @> ARRAY[key]` so the GIN index can actually serve it (`= ANY(...)` cannot
use a GIN index at all).

**The client side is not free, and the earlier version of this document was wrong to imply it
was.** `fn_my_handover_permissions()` runs once per permissions load for **every**
non-super-admin, whether or not they hold any handover. Two mitigations, both deliberate:

- it sits inside the existing `['permissions', …]` React Query entry, so it is one call per
  5-minute `staleTime` window per user, not one per page;
- it is raced against a **2-second timeout** and falls back to the role-derived map. Awaiting
  it unbounded meant one hanging PostgREST call could pin `isLoading` and stall every page
  gate on the platform.

### Revoke closes the data immediately; the page shell can lag up to 5 minutes

Honest statement of the client cache window. On revoke (or done, or due date, or the receiver
going inactive) **the data closes at once** — every RLS policy re-asks the database on the next
query. The merged keys, however, live in the client permission cache for its `staleTime`, so
for up to 5 minutes the receiver may still see the page *shell* open. It renders over rows that
return nothing. The failure mode is a confusing empty page, not a leak. PR 3 should invalidate
`['permissions']` on the receiver's own accept/decline/done actions; a Director-side revoke
cannot reach into another person's browser and is bounded by the window.

---

## The twelve locked decisions

| # | Decision | Value |
|---|---|---|
| 1 | What the receiver can do | **Chosen per handover**: `watch` · `update` · `full` |
| 2 | Can the Director hand over doors he cannot open himself | **Yes — master key** (bounded by #3) |
| 3 | Hard walls the master key cannot cross | **4 walls** — see below |
| 4 | When access ends | **Done OR due date, whichever first** |
| 5 | Can the receiver pass it on | **No — stops with them** (tree is exactly 2 deep) |
| 6 | Who may hand over | `director` role + super admin only |
| 7 | Receiver leaves / changes job | **Access cut immediately + item returns to Director's desk** as `orphaned` |
| 8 | Does the receiver get a say | **Accept or decline**, Director sees the answer |
| 9 | Chase engine on day one | **Live immediately** (Director override of silent-first recommendation) |
| 10 | Chase cadence | **Every day until done** |
| 11 | Missed deadline | **Explain within 24h**, else a meeting is auto-booked |
| 12 | What stops being green | past deadline · quiet 7d · never accepted · owner gone |

### Decision 9 — recorded override

The recommendation was a one-week silent run (compute-and-show, send nothing) — the house
pattern used by PR #2789. The Director chose live-from-night-one after being shown that
the first run is also the first test. Proceeding as instructed.

**Engineering mitigation (not a policy softening):** a volume fuse. If a single run resolves
more than `HANDOVER_CHASE_MAX_RECIPIENTS` (default 50) recipients, the run **halts and
notifies the Director instead of sending**. A correct run over real handovers cannot reach
50; only a recipient-resolution bug can. This converts a mass-mail incident into an alert.

---

## The four hard walls

Enforced in `fn_handover_key_is_blocked(text)` — a function in a migration, **deliberately
not a config row**. The house rule is "every policy decision = a config row", but a wall
that bounds the Director cannot be editable by the Director. Changing a wall requires a
migration, which requires a PR, which requires review. That is the point.

| Wall | Blocked | Still handable |
|---|---|---|
| **1. Access control** | the whole `roles`, `users`, `settings`, `permissions` and `director.handover` namespaces (prefix key **and** everything beneath it), plus anything named `%user_roles%`, `%.role(s).assign/grant` or `%impersonat%` | — |
| **1a. Sentinels** (see below) | `super_admin`, `view_dashboard`, `view_profile` — MENU_PERMISSIONS values that are *markers*, not keys | — |
| **1b. Keys that authorise a role write** (see below) | `organizations.leadership%`, `admission.counselors.create`, `staff.create` — derived from the SQL, not from their names | — |
| **2. Salary & team-member files** | `hr.payroll`, `hr.employees`, `hr.documents`, `hr.performance_reviews`, `hr.promotion.case`, `hr.counseling`, `hr.grievance`, `hr.memos`, `hr.recruitment.packages`, `hr.leave.encashment` (each: prefix key **and** everything beneath it), `staff.create/edit/delete/status_update` | routine `hr.leave.apply/approve/view`, `hr.attendance.%`, `hr.dashboard.%`, `hr.policies.%` |
| **3. Exam marks & results** | `academic.internal-marks` **and** `academic.internal_marks` (both spellings), `academic.course-grades`, `academic.exam_eligibility`, `lti.grade_sync` (each: prefix key **and** everything beneath it) | `academic.attendance.mark` — that is *marking attendance*, a verb collision, not exam marks |
| **4. Money movement** | every `billing%` / `admission_fees%` that is **not** read-only, **plus 13 keys found by label sweep** (see below) | `billing.%.view/read/export`, `billing.analytics.%`, `billing.coverage.%`, `admission_fees.%.view/read/export` — reports were explicitly kept handable |

**Walls 1–3 block reads too** (seeing every team member's file or every learner's marks is
itself the sensitive act). **Wall 4 blocks writes only**, per decision: reports are fine,
moving actual money is not.

### Wall 4 — why a prefix wall could never have been enough

The first version of this wall listed four keys, found by eye. A mechanical sweep of all
1,393 keys in `lib/constants/permissions.ts` on 2026-08-05 — reading the **label**, not the
key prefix — found **13**. Nine were handable, including:

| Key | Label |
|---|---|
| `campus_living.fees.waive` | Waive Fee |
| `campus_living.maintenance.approve_payment` | Approve Vendor Payment |
| `campus_living.mess.caterers.pay` | Process Caterer Payment |
| `campus_living.mess.billing.reconcile` | Reconcile Mess Billing |
| `learners.finance.edit` | Edit Finance Details (Fee Structure) |
| `campus_living.fees.config` | Configure Fee Structure |
| `ims.stock.adjust` | Adjust Stock (Write-off, Correction) |
| `campus_living.parent_portal.pay_fee` | Parent Portal — Pay Fee |
| `procurement.grn_create` | Goods Receipt Notes — creates a payable |

**The lesson generalises past money.** Every one of these is named after its *module*
(`campus_living`, `ims`, `learners`, `procurement`) while the money-ness lives only in the
label. A wall keyed on names cannot see what a permission *does* — the identical failure as
wall 1b, where `organizations.leadership.manage` reads like an org-chart page and in fact
rewrites `user_roles` and `profiles.role`.

Sweep method, repeatable: match labels on
`pay|payment|payout|disburse|refund|waive|reconcile|settle|collect|write-off|adjust|invoice|receipt|charge|fee`
and exclude read-shaped labels (`view|read|export|report|analytics|dashboard|list|history|audit`).

**This remains a denylist that defaults open.** Any key a future PR adds is handable unless
someone classifies it. The structural fix is an allowlist; that is a Director decision and is
not taken here.

**Every wall is written `p_key = 'prefix' OR p_key LIKE 'prefix.%'`.** A bare `LIKE 'prefix.%'`
does not match the prefix key itself, and `roles`, `users`, `billing` and `hr.payroll` all
exist in this key space as whole keys — a prefix-only wall let the *widest* version of each
walled thing straight through.

### Wall 1a — sentinels: MENU_PERMISSIONS values that are not permissions

Three values in `MENU_PERMISSIONS` are not keys anybody holds; they are markers that
`lib/navigation/permission-filter.ts` reads structurally.

`super_admin` gates **fourteen routes** — `/admin/ai-models` (AI provider selection and spend
caps), `/admin/loops`, `/admin/learner-notes`, `/admin/page-metadata`, `/admin/proof-disputes`,
`/ai-query/admin`, `/admin/id-cards/policy`, and seven `/internships/policy/*` pages. The
filter ended in a bare `return !!permissions[permission]`, and a handover ORs its keys into
exactly that map — so **one handover of the ID-card printing policy page opened all fourteen.**

`view_dashboard` and `view_profile` are the mirror image: always true for everyone. Handing one
over grants nothing, which is the silent-no-op this spec forbids elsewhere.

Walled in SQL **and** refused by the filter. Two layers, because the wall and the filter deploy
on different schedules (merging does not apply migrations here) and a value meaning "bypass"
must be refused by the code that would act on it, not only by the code that hands it out.
`isSentinelPermission()` in `lib/navigation/permission-filter.ts` is the single list; the
classification test asserts SQL and client agree about it.

### Wall 1b — keys that authorise a role write, derived from the SQL

Wall 1 is keyed on the **name** of a permission, and a name does not tell you what a key does.
`organizations.leadership.manage` is named after its module. What it authorises is
`fn_set_college_leadership`, which DELETEs the sitting Principal's `user_roles` row and INSERTs
the caller's with `is_primary = true`, firing `sync_primary_role_trigger`, which writes
`profiles.role = 'principal'`. **On day 8 the handover expires; the `user_roles` row and
`profiles.role` do not.** Measured end to end on Postgres 16: after every handover was revoked
the receiver still held the role and the real Principal had zero rows left. Decision 4 broken at
the root, by a key that crossed every name-shaped wall.

So this wall is not written from names. `__tests__/director-desk/role-write-sweep.test.ts` reads
every function definition in `supabase/`, keeps the `SECURITY DEFINER` ones whose body writes
`user_roles` / `custom_roles` / `profiles.role` / `profiles.is_super_admin` /
`user_institution_access`, resolves the `user_has_permission('…')` keys that authorise them
(following one level of `can-manage` helper), and **fails if any of those keys is handable**.

The result is the maintained artifact **`specs/director-desk/role-writing-functions.json`**.
The 2026-08-05 sweep found three authorising keys:

| Key | Function | What it grants |
|---|---|---|
| `organizations.leadership.manage` | `fn_set_college_leadership` | `principal` / `vice_principal`, permanently |
| `admission.counselors.create` | `assign_counselor_role` | `counselor` — `institution_scope='all'`, so a **cluster-wide** role |
| `staff.create` | `mirror_staff_role_to_user_roles` | any role the team-member record names (already walled by wall 2) |

Every other role-writing function is a trigger or is gated on a `role_key` (e.g.
`fn_induction_can_manage_coordinators` requires `role_key = 'induction_lead'`), and a handover
cannot grant a `role_key`, so none of them is reachable this way.

**Limits, stated so a pass is not mistaken for a proof:** the sweep reads the repo, not
production, so a function created by hand through the Management API is invisible to it
(`feedback_ci_guard_cannot_see_hand_run_sql`), and it resolves helpers three levels deep.

### The second half: nobody installs themselves

Walling the key closes the *handover* route into `fn_set_college_leadership`. It does not close
the other half, which was always open and has nothing to do with handovers: that function never
checked whether the person being installed is the person doing the installing.

`20260811100300_no_self_authority_placement.sql` adds `trg_no_self_authority_placement` on
`user_roles` — a write that grants an authority role (`principal`, `vice_principal`,
`counselor`, `super_admin`, `admin`, `administrator`, `director`) to `auth.uid()` themselves is
refused. A trigger rather than an edit to `fn_set_college_leadership` for three reasons:
reproducing ~270 lines of another lane's function to add one guard is the silent-drift-revert
failure `20260811100100`'s own header warns about; the invariant is broken by **three** write
paths, not one; and a later `CREATE OR REPLACE` by another lane can silently drop an in-function
guard but cannot drop a trigger.

**What it deliberately breaks:** a non-super-admin holding `organizations.leadership.manage` (or
`staff.create`) can no longer name *themselves* Principal, Vice Principal or Counselor. Somebody
else has to. **What it does not touch:** `auth.uid() IS NULL` writes (every server route, AI
routine, migration and provisioning job), super admins, any role outside that list, and re-saving
a grant the person already holds.

### The denylist defaults OPEN — and has two tripwires

`fn_handover_key_is_blocked` ends in `ELSE false`: a permission key invented by a future PR is
**handable unless someone walls it**. That default is deliberate (an allowlist would break the
feature every time a module ships), so it is backed by tests rather than by hope:

- `specs/director-desk/handover-key-classification.json` records the **union** of every key in
  `lib/constants/permissions.ts` and every distinct value in `MENU_PERMISSIONS` as **walled** or
  **handable** — today 109 walled, 1,240 handable, of which **20 are `menuOnly`**: they gate a
  route but Role Management cannot enumerate them.
- `__tests__/director-desk/handover-key-classification.test.ts` fails if any key is missing from
  that file, if any key changed side, if a new `menuOnly` value appears, if a client sentinel is
  not walled in SQL, or if a hard-coded list of must-never-be-delegated keys stops being walled.
  It evaluates the **real** `CASE` expression parsed out of the migration, not a TypeScript
  restatement of it.
- `__tests__/director-desk/role-write-sweep.test.ts` is the second tripwire — see wall 1b.
- Regenerate deliberately with
  `UPDATE_HANDOVER_CLASSIFICATION=1 UPDATE_ROLE_WRITE_SWEEP=1 npx vitest run __tests__/director-desk`,
  then read the diff.

> **The union is the fix, and it is worth saying why.** The first version of this gate iterated
> `PERMISSION_CATEGORIES` alone and reported "105 walled / 1,224 handable, zero disagreements".
> That cross-check was internally sound and pointed at the wrong set: a handover stores the
> **MENU_PERMISSIONS value** of the route the Director was standing on, and twenty of those
> values are absent from `permissions.ts`. All twenty were unclassified and handable by default,
> including the `super_admin` sentinel. A green gate over the wrong universe is worse than no
> gate, because it is quoted as evidence.

### Judgment calls made, flagged for correction

- `hr.leave.approve` (routine leave) is **handable**. Approving a colleague's leave
  reads as ordinary delegated work, not a "salary and HR file". Say the word to lock it.
- `roles.view` is **blocked** along with the rest of `roles.%`. Read-only, but no delegated
  job needs the full role matrix, and a whole-prefix wall is simpler to reason about.
- The whole `users.%` and `settings.%` namespaces are blocked. A receiver handed a
  user-management page can assign themselves a role, and **that role outlives the handover** —
  which defeats decision #4 entirely. This is the one wall whose breach is not time-boxed.
- Wall 1 blocks `director.handover.%` — **this is load-bearing, not tidiness.** Without it,
  handing over the handover power would let the receiver mint grants, defeating decision #5.

---

### Nothing here is a boolean oracle — and "we never granted it" is not a defence

`fn_handover_grants_key(uuid, text)` is `SECURITY DEFINER`, takes a caller-supplied uuid, and
never compares it to `auth.uid()`. Its first revision revoked `anon, PUBLIC` and carried a nine-line
comment asserting it therefore had no `authenticated` grant. **That comment was false.** Supabase
ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated`, a
**direct** grant on every new function, independent of `PUBLIC` and unaffected by revoking it.
*Omitting a grant is not denying one.*

Measured on Postgres 16 with Supabase's default privileges in place: any signed-in learner could
`POST /rest/v1/rpc/fn_handover_grants_key` with `{"p_user_id":"<any profile uuid>","p_key":"<any key>"}`
and read back true/false — 7,231 uuids × 1,329 keys, a complete map of who holds what. The repo's
own gate was green over it: `scripts/ci/check-secdef-anon-revoke.mjs` inspects `anon` and nothing
else. The same shape was measured here before, on PR #2730 / `fn_soi_inactivity_core`.

Fixed with an explicit `REVOKE … FROM authenticated` plus an **apply-time assert** on
`has_function_privilege` — a revoke that failed to take would otherwise leave the oracle open and
say nothing. Its only real caller is `user_has_permission()`, itself `SECURITY DEFINER`, which
runs it as the owner and needs no grant at all.

The rest of the spine was audited for the same class and is clean: `fn_can_hand_over()` and
`fn_my_handover_permissions()` take no identity argument, and `respond` / `progress` / `complete` /
`revoke` all scope their `WHERE` clause to `auth.uid()` rather than trusting the handover id.
`fn_handover_key_is_blocked` and `fn_handover_key_allowed_at_level` are pure functions of a key
string and disclose only the wall policy, which is in a public repo. `fn_dh_touch_updated_at()`
returns `trigger`, a type PostgREST refuses to expose, so it is not RPC-reachable.

## Multi-tenant scoping (CLAUDE.md #8)

A handover never crosses a college.

| Where | Rule |
|---|---|
| Create | granter and grantee must share an `institution_id`. Super admin is the only exemption. |
| The row | records the **granter's** institution (a super admin with no institution of their own falls back to the grantee's). |
| Check time (`fn_handover_grants_key`, RLS path) | the grant only counts while the grantee still belongs to that institution. Transfer colleges and the handover stops granting. |
| Page gates (`fn_my_handover_permissions`) | the identical predicate, so the gate and the data never disagree. |
| Visibility (`dh_select`, `dha_select`) | admins see only their own institution's handovers, via the house helper `role_has_institution_access(institution_id)`. The grantee/granter branches name a specific `auth.uid()` and need no institution test. |

The grant path uses **strict institution equality**, not `role_has_institution_access` — that
helper answers "may the *caller* see this institution", returns true for any institution when
the caller holds a role scoped `all`, and is evaluated for `auth.uid()`. None of those is the
question a grant needs answered.

---

## Lifecycle

```
Director hands over  →  pending   (receiver CAN already open it — needed to judge the job)
receiver accepts     →  accepted
receiver declines    →  declined  (access ends immediately, back on Director's desk)
work finished        →  done      (access ends)
due date passes      →  expired   (access ends)
Director takes back  →  revoked   (access ends)
receiver leaves      →  orphaned  (access ends, back on Director's desk — decision #7)
```

**Access is live iff** `status IN ('pending','accepted')` AND `now() <= due_date` (end of day
IST) AND `revoked_at IS NULL` AND the receiver's profile is still active AND the receiver is
still in the handover's institution.

### `expired` and `orphaned` are labels nothing writes yet

PR 1 accepts both values in the CHECK constraint and **never writes either**. Nothing in this
PR sets `expired`, and nothing sets `orphaned`. That is not a gap in access control — access
already ends on the due date and on the receiver going inactive, because the live-access
predicate above tests `due_date` and `is_active` directly rather than trusting the label. What
is missing is only the *relabelling*, so until PR 5 lands, a dead handover still reads
`pending`/`accepted` on the Director's desk while granting nothing. **PR 5 (chase engine) owns
writing both.**

### The audit trail

Every transition is appended to `director_handover_audit`. It is append-only by construction,
on four counts:

- no `UPDATE` and no `DELETE` policy exists for any role, and RLS default-denies what it does
  not name;
- `UPDATE`, `DELETE` and `TRUNCATE` are **revoked from `service_role`** — the key every server
  route and AI routine in this repo holds. An "append-only" table a service key can empty is
  not append-only;
- `INSERT`/`UPDATE`/`DELETE` are revoked from `authenticated`: every write goes through a
  SECURITY DEFINER RPC, which needs no caller-side table grant;
- both foreign keys are `ON DELETE RESTRICT`, and so are the two profile references on
  `director_handovers`.

**Consequence, stated plainly:** deleting a profile that has handovers now **fails**. Under the
original `ON DELETE CASCADE` it succeeded and silently destroyed that person's handovers *and*
their audit rows — erasing the trail for the exact case the trail exists to survive. Closing or
reassigning their handovers first is the intended workflow.

---

## Access levels (decision #1)

Defined once, in `fn_handover_key_allowed_at_level(key, level)`.

| Level | Gets | Intended for |
|---|---|---|
| `watch` | `.view` · `.read` · `.export` | "keep an eye on this and tell me" |
| `update` | the above **plus** `.edit` · `.update` · `.submit` · `.mark` · `.mark_*` · `.respond` · `.acknowledge` | "move it along, don't restructure it" |
| `full` | every key named on the handover (walls still apply) | "run it" |

`update` deliberately **excludes `.create`, `.delete` and `.manage`** — the instruction was
"move things along … but cannot delete or create", and `.manage` in this key space
habitually implies delete as well as edit.

Enforced at **grant time and again at check time**, never by trusting the UI. The predicate
is a shared function rather than a duplicated `WHERE` clause because the RLS path and the
page-gate path must not drift: if they disagreed, the receiver would get a page that opens
onto no data, or a button that 403s.

**Grant time rejects by name.** `fn_director_handover_create` now refuses any key the chosen
level does not cover, listing the offending keys. Without that check the flagship case failed
silently: `access_level` defaults to `update`, `update` excludes `.manage`, so handing over
`accreditation.naac.narrative.manage` — the exact key this feature was built for — was
accepted, stored, reported as created, and granted **nothing**, with no error anywhere. Hand
that key over at `full`.

---

## Build order

`PR 1` is the floor; nothing else can start without it.

| PR | Scope | Migrations allocated |
|---|---|---|
| **1 — spine** | tables, walls, `user_has_permission` extension, client RPC, lifecycle RPCs, self-placement guard | `20260811100000`, `20260811100100`, `20260811100200`, `20260811100300` |
| 2 — hand-over button | Director-only capture control, works on any route | `20260811110000` |
| 3 — `/my-desk` | receiver side: accept/decline, update, mark done | `20260811120000` |
| 4 — Director's desk | red/green master view, 4 red rules | `20260811130000` |
| 5 — chase engine | daily nudge, explain-in-24h, volume fuse, rule activation | `20260811140000` |

Versions are pre-allocated because parallel lanes in this repo have collided on
"next timestamp" before (`feedback_parallel_fanout_must_allocate_migration_versions`).

## Verification gate (per CLAUDE.md #2, #14)

Green CI is not done. Before any PR here is called finished:
1. persona-test as a user holding **only** the handover — never as super admin, who
   bypasses every guard and proves nothing;
2. confirm a **negative control**: an unrelated user with the same role is still denied;
3. confirm access actually **ends** on done / due date / revoke / leaver.
