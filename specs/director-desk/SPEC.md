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

### Performance guarantee

`user_has_permission` is `STABLE` and folded into a once-per-statement InitPlan across
hundreds of RLS policies. The handover check is appended as the **fourth and last** gate,
reached only after super-admin, multi-role and legacy-role checks have all returned false.

**A user who holds a page by role never touches the handover table.** Only a user who
would otherwise be *denied* pays one indexed lookup. Cost on the normal path: zero.

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
| **1. Access control** | `roles.%`, `users.permissions%`, `director.handover.%` | — |
| **2. Salary & staff files** | `hr.payroll.%`, `hr.employees.%`, `hr.documents.%`, `hr.performance_reviews.%`, `hr.promotion.case.%`, `hr.counseling.%`, `hr.grievance.%`, `hr.memos.%`, `hr.recruitment.packages.%`, `hr.leave.encashment.%`, `staff.create/edit/delete/status_update` | routine `hr.leave.apply/approve/view`, `hr.attendance.%`, `hr.dashboard.%`, `hr.policies.%` |
| **3. Exam marks & results** | `academic.internal-marks.%` **and** `academic.internal_marks.%` (both spellings), `academic.course-grades.%`, `academic.exam_eligibility.%`, `lti.grade_sync.%` | `academic.attendance.mark` — that is *marking attendance*, a verb collision, not exam marks |
| **4. Money movement** | every `billing.%` / `admission_fees%` that is **not** read-only, plus `campus_living.deposits.refund`, `campus_living.fees.refund`, `ims.sales.refund`, `dashboard.queue.approve.waiver` | `billing.%.view/read/export`, `billing.analytics.%`, `billing.coverage.%` — reports were explicitly kept handable |

**Walls 1–3 block reads too** (seeing every staff member's file or every learner's marks is
itself the sensitive act). **Wall 4 blocks writes only**, per decision: reports are fine,
moving actual money is not.

### Judgment calls made, flagged for correction

- `hr.leave.approve` (routine staff leave) is **handable**. Approving a colleague's leave
  reads as ordinary delegated work, not a "salary and HR file". Say the word to lock it.
- `roles.view` is **blocked** along with the rest of `roles.%`. Read-only, but no delegated
  job needs the full role matrix, and a whole-prefix wall is simpler to reason about.
- Wall 1 blocks `director.handover.%` — **this is load-bearing, not tidiness.** Without it,
  handing over the handover power would let the receiver mint grants, defeating decision #5.

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
IST) AND `revoked_at IS NULL` AND the receiver's profile is still active.

Every transition is written to `director_handover_audit`, which has **no UPDATE or DELETE
policy for anyone**. With a master key in play, the audit trail is the safety net, so it is
append-only by construction.

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

---

## Build order

`PR 1` is the floor; nothing else can start without it.

| PR | Scope | Migrations allocated |
|---|---|---|
| **1 — spine** | tables, walls, `user_has_permission` extension, client RPC, lifecycle RPCs | `20260811100000`, `20260811100100`, `20260811100200` |
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
