# InstaSolver as a MyJKKN module — build specification

| | |
|---|---|
| **Document** | `MYJKKN-MODULE-SPEC.md` |
| **Date** | 2026-09-30 |
| **For** | Whoever builds InstaSolver inside the MyJKKN codebase |
| **Source** | The standalone product, live in production: [`INSTASOLVER-PRD.md`](./INSTASOLVER-PRD.md) (requirements, as-built gaps, roadmap) and this repository's code |
| **Decision it implements** | PRD §0.3 **D-9** — merge the code into MyJKKN as a module, not a separate child app behind SSO, and not an iframe |

---

## 0. How to read this, and what you already have

This is not a greenfield brief. A working product exists, in production, with
667 accounts and a year of history behind its design decisions. **Porting it is
cheaper and safer than rewriting it**, and most of this document is about which
parts move unchanged, which parts MyJKKN replaces, and the order to do it in.

You have three things. Use all three:

| What | Where | Why it matters |
|---|---|---|
| **The requirements** | `INSTASOLVER-PRD.md` — 1 500 lines, current | Says *what* and *why*. §5 data model, §6 authorization matrix, §7 requirements by role, §11 acceptance, §17 known gaps |
| **The database** | `supabase/migrations/` — 46 files | The real specification. Every rule that matters is a trigger, a policy or an RPC, not application code |
| **The application** | `lib/services/`, `hooks/`, `app/(app)/`, `components/` | ~40 components and 14 service classes. Layered, typed, and already reviewed against MyJKKN conventions |

**The one sentence that governs everything below:** authorization and business
rules live in Postgres (RLS + triggers), not in the UI. The UI's role checks
are usability, not security. If MyJKKN's module system tempts you to move a
rule into application code, that is the rule this product was rebuilt to
stop breaking.

---

## 1. What the module does

Two record types, one workflow each.

**Issues** — a facility fault (electrical, plumbing, IT and CCTV, furniture,
learning-studio equipment). A reporter files it with photographs and a
location; the CAO gives it a priority and assigns it to a maintenance person
or team; maintenance works it and closes it with notes and a photograph of the
finished work; the reporter then says whether it was actually fixed.

**Requirements** — a procurement request (item, quantity, cost estimate,
needed-by). The CAO approves or rejects with a reason, and marks it fulfilled.

Everything else in the product exists to serve those two: the triage queue that
ranks what to decide next, the work queue, the workload view used before
assigning, analytics, notifications, and the audit trail that answers "who
changed this, and when".

**Why the institution wanted it:** before this, faults were reported verbally,
by WhatsApp and on paper. Nothing had an owner, a status or a history, so
nobody could answer "what happened to the report I made last week".

---

## 2. Decisions already taken — do not redesign these

Each of these was decided after the alternative was tried or explicitly
rejected. Reopening them costs time and, in three cases, repeats a failure.

| Decision | The rule | Why |
|---|---|---|
| **Who assigns** | Only CAO and Super Admin. A reporter never routes an issue to a person. | Tried in v2 (an "assignment authority" per category). It sent work to whoever was named, whether or not they were free, and the reporter had no way to know. Migration `20260901001500` removed it. |
| **No auto-assignment** | Nothing picks an assignee automatically. | The CAO's judgement is the point of triage. |
| **No second approval level** | One approval, by the CAO. No L2, no cost tier. | Asked for and declined — it would add a day to every request. |
| **Team assignment is first-class** | An issue may go to a person, a team, or both. Team work is *claimed* before it is started. | Otherwise a job sits "in progress" with nobody's name on it. |
| **Severity ≠ priority** | Severity is what the reporter observed; priority is what the institution decided. Two fields, two vocabularies, never merged. | A flickering light before an event is minor severity and urgent priority. Merging loses that. |
| **Nothing is hard-deleted** | Deactivate, reject or withdraw. Never `DELETE`. | Last year's issue still references its category and must still render. |
| **The reporter confirms the fix** | A completed issue is not closed until the reporter says it worked — or disputes it, which sends it back to the top of triage. | "Completed" used to mean "maintenance said so". |
| **Status vocabulary is single-sourced** | Every label and colour comes from one constants module; a CI check fails the build on a status literal anywhere else. | v1 inserted `'Pending'` and queried `'pending'`. The triage queue was empty for months and nobody knew. |
| **JKKN terminology is binding** | learners, Senior Learners, team members, learning studio / lab / auditorium. A CI check enforces it. | Institutional standard. |

Also settled, in the 2026-09-26 review (PRD §0.3): no email and no WhatsApp
notifications (web push, then MyJKKN's own); SLA targets by severity (Critical
4 h, High 24 h, Medium 3 days, Low 7 days) with escalation at 100 % and 200 %;
a reporter may edit or withdraw while `pending`; learners may sign in; a CAO
and a Principal may report from their own account.

---

## 3. Discovery — answer these before writing code

Two questions decide how much of the database moves untouched.

### Q-1. Does MyJKKN run on the same Supabase project, and use Supabase Auth?

| Answer | What it means |
|---|---|
| **Yes to both** | Everything in §5 and §6 ports as-is. `auth.uid()` is the same identity on both sides, so every policy, trigger and helper function keeps working. This is the cheap path — budget days, not weeks. |
| **Same project, different auth** | The policies work, but `auth.uid()` must be replaced by whatever MyJKKN puts in the JWT. Rewrite the five helper functions (§6.2) and nothing else. |
| **Different database entirely** | The RLS model cannot move. Either mint a Supabase JWT from MyJKKN's session (PRD §13.3 has the design), or reimplement authorization in MyJKKN's own layer — in which case re-read §6 as a specification of *rules*, and expect the port to take weeks. |

### Q-2. What does MyJKKN already own?

For each, decide *use MyJKKN's* or *keep the module's*:

| Concern | The module has | Prefer MyJKKN's when |
|---|---|---|
| Users | `profiles` mirror, with `myjkkn_user_id` already on it | Always — see §5.2 |
| Institutions | `institutions`, with `myjkkn_institution_id` already on it | Always |
| Roles | 5-value enum, derived from MyJKKN role keys by a batch script | Always — the script exists only because the module could not read MyJKKN live |
| Notifications | Bell (Realtime) + web push | If MyJKKN has a notification centre, route through it and keep the push sender |
| File storage | Google Shared Drive, Supabase Storage fallback | Whichever MyJKKN already uses; the seam is one service class |
| UI kit | Tailwind v4 + shadcn/ui + Radix | MyJKKN's, if it has one — budget a week for the swap |

Write the answers down before starting. Everything below branches on them.

---

## 4. Architecture

### 4.1 The shape

```
migrations  →  types/  →  lib/services/  →  hooks/  →  _components/  →  page.tsx
(rules)        (shapes)   (queries)         (cache)    (UI)             (routes)
```

Service classes take a Supabase client and run on the server *or* the client
under the caller's own JWT. There are no server actions and exactly three API
routes — file upload, the bug-reporter proxy and the push sender — each there
because it needs a server-only secret.

**Keep this shape.** It is the same layering MyJKKN uses, and it is what makes
"the database is the boundary" true rather than aspirational.

### 4.2 What the CI checks enforce

Copy these over; they are cheap and they caught real regressions
(`scripts/check-architecture.mjs`, `scripts/check-terminology.mjs`):

- no `auth.users` reads in application code — always the `profiles` mirror;
- status literals only in the status constants module;
- no hard-coded numbers in stat components (v1 shipped fake dashboard figures);
- RLS enabled on every public table;
- no self-referential RLS policy (v1's infinite recursion);
- the service-role key never imported by application code;
- JKKN terminology.

---

## 5. Data model

Fourteen tables today. In a merged database, **namespace them** — an
`instasolver` schema, or an `is_` prefix — so `issues`, `categories` and
`notifications` cannot collide with MyJKKN's own.

### 5.1 Tables to create

| Table | Holds | Notes for the merge |
|---|---|---|
| `issues` | reference_no, reporter, institution, category, severity, priority, status, title / details / location, suspected cause, suggested fix, contact + alternate phone, up to 5 photographs, assignee, team, assigned_at / by, resolution notes + photographs, completed_at, reopened_count, confirm / dispute columns | The core table. Keep every column |
| `requirements` | reference_no, requester, institution, category, status, item, specifications, quantity, cost estimate, needed-by, last-ordered, usage + delivery location, vendor, contacts, images, reviewed_by / at, review notes, fulfilled_at | |
| `categories` | kind (`issue` / `requirement`), name, sort order, active | Module-owned. MyJKKN is unlikely to have an equivalent |
| `institutions` | name, short code, active, `myjkkn_institution_id` | **Map to MyJKKN's** — see §5.2 |
| `profiles` | the user mirror: email, name, phone, institution, role, active, `myjkkn_user_id`, `myjkkn_role`, `role_source` | **Replace with MyJKKN's users** — see §5.2 |
| `maintenance_teams` | name, institution (NULL = organisation-wide), category, email | The category is what makes "assign to the team that covers this" work |
| `team_members` | (team, user), is_team_lead, email mirror | |
| `iqac_scope` | (user, institution) — which institutions a Principal may see | Replace if MyJKKN already models a principal's institutions |
| `activity_log` | entity, actor, action, from / to, note — append-only, written **only** by triggers | The audit trail. Never written by application code |
| `admin_notes` | entity, author, note, `is_internal` | Internal notes are hidden from reporters by a restrictive policy |
| `notifications` | user, type, issue, title, body, read_at | Replace with MyJKKN's if it has one |
| `push_subscriptions`, `notification_preferences` | web push per browser, and per-event opt-outs | Keep unless MyJKKN already delivers push |
| `reference_counters` | per-prefix, per-year counter, deny-all RLS | Behind `next_reference_no()` |
| `notification_failures` | notifications the fan-out could not write | Small, and the only way to know a notification was lost |

Enums: `user_role`, `issue_status` (pending, assigned, in_progress, completed,
rejected), `requirement_status` (pending, approved, rejected, fulfilled),
`severity_level` (critical / high / medium / low), `priority_level` (urgent /
high / medium / low).

Views: `profiles_directory` (the six non-sensitive columns of a person, so a
reporter can see who their issue went to without being handed everyone's phone
number) and `issue_triage_queue` (the ranked queue — see §7.4).

### 5.2 Identity: the two columns that make this a merge and not an import

`profiles.myjkkn_user_id` and `institutions.myjkkn_institution_id` already
exist and are already populated. They were added specifically so this day
would be cheap.

**In the merged system:**

1. Do **not** keep a second user table. Replace `profiles` with a view or a
   direct reference to MyJKKN's user table, keyed by `myjkkn_user_id`.
2. Everything that reads a person — `profiles_directory`, the assignee picker,
   "reported by", the notes author — goes through one place. Point that place
   at MyJKKN and the rest follows.
3. The same for institutions.
4. **Delete** `role_source`, `myjkkn_role`, `scripts/derive-roles.mjs`,
   `scripts/sync-myjkkn-profiles.mjs` and the staff-directory gate in
   `/auth/callback`. All four exist only because the module could not read
   MyJKKN's roles live. Inside MyJKKN it can.

### 5.3 Rules that must move with the tables

These are triggers today. They are not optional, and they are not UI concerns:

| Rule | Why it exists |
|---|---|
| Reference numbers `ISS-YYYY-NNNNNN` / `REQ-YYYY-NNNNNN`, generated in the database, by IST year | The number people quote. Generated client-side it would collide |
| Status transitions validated per role (§7.1) | The state machine is the product |
| Maintenance may change only status, resolution notes, resolution photographs and the claim | A column whitelist in the trigger; RLS cannot express it |
| `completed_at` set on completion, nulled on any move away | One source of truth — no `completed` boolean beside it |
| 20 submissions per person per hour | A rate limit that survives a script |
| Every status change, assignment, claim, priority change, reopen, confirm, dispute, note, role and activation change writes `activity_log` | Written by trigger, so it cannot be skipped |
| Attachment URLs must point at our own storage | Added 2026-09-26 after an audit (`SEC-5`) |
| A person may change their own name, phone, photograph and institution — nothing else | Added 2026-09-26; before it, a user could make themselves a Super Admin (`SEC-1`) |

---

## 6. Authorization

### 6.1 Roles

Five, single-valued per user.

| Role | Can | Cannot |
|---|---|---|
| **Reporter** (`end_user`) | Report issues and requirements; see only their own; confirm or dispute a fix on their own completed issue; add a note on their own item | See anyone else's records |
| **CAO** | Triage (priority, assign, reject), reassign, reopen, approve / reject / fulfil requirements, internal notes, manage maintenance teams, workload view, report from their own account | Change anybody's role; the other administration screens |
| **Maintenance** | Work issues assigned to them or their team: claim, start, complete with notes and photographs; report issues; a team lead may reassign within their own team | Assign, reopen, approve; see requirements |
| **Principal** | Read-only, limited to their institutions; analytics; report from their own account | Any write |
| **Super Admin** | Everything, as a superset | — |

**Map MyJKKN's roles to these**, replacing the batch script. The current
mapping, which has been right in production for a month:

```
super_admin  → Super Admin
system_admin → Maintenance
cao, coo     → CAO
principal    → Principal   (+ the institutions they head)
anything else → Reporter
```

### 6.2 How policies are written

Five helper functions — `current_user_role()`, `is_staff()`, `is_manager()`,
`is_admin()`, `iqac_institutions()`, plus `my_team_ids()` and
`is_team_lead_of()` — are `SECURITY DEFINER` and read `profiles` directly.
**That is what makes the policies non-recursive**: a policy on `profiles` that
queries `profiles` deadlocks the table, which is exactly how v1 locked
everybody out.

Rewrite those seven functions against MyJKKN's identity and session, and
**every policy above them keeps working unchanged**. That is the whole port, if
Q-1 answers "same project".

The full policy matrix is PRD §6.2. Two subtleties worth carrying over:

- **Internal notes** are hidden from reporters by a *restrictive* policy, which
  ANDs with every read path — including ones added later. Do not reimplement it
  as a condition inside each policy.
- **Maintenance reads are scoped** to entities RLS already shows them (added
  2026-09-26, `SEC-3`). Before that they could read every audit row and every
  person's phone number.

---

## 7. Behaviour worth porting exactly

### 7.1 Issue lifecycle

```
pending ──assign (manager, priority required)──► assigned ──start──► in_progress ──complete (notes required)──► completed
   │                                                │                      │                                        │
   └── reject (manager) ──► rejected ◄──────────────┴──────────────────────┘                                        │
                                              in_progress ◄── reopen (CAO / Super Admin, reopened_count++) ─────────┘
```

- Starting unclaimed team work **claims it in the same statement** — one round
  trip, one pair of audit entries. Otherwise an issue runs with no owner.
- Taking over a teammate's issue asks once, by name, and records yours.
- Completion requires notes; photographs of the finished work are the thing
  that lets a reporter confirm without walking to the place.

### 7.2 Requirement lifecycle

`pending → approved | rejected` (a rejection requires a reason) →
`approved → fulfilled`. Manager only.

### 7.3 Resolution feedback

On a completed issue the reporter confirms or disputes with a reason. **The
status does not change** — what changes is the CAO's attention: a dispute adds
90 to the triage score and the row surfaces at the top of the queue. Reopening
stays a manager's decision.

### 7.4 The triage queue

Ranked in the database (a view), never in the browser — pages are 25 rows, so
browser-side ordering would hide the most urgent issue on page 2. The score
weights severity, priority, age, reopen count, repeat location, being
unassigned, and a dispute. **Every row shows the factors that fired**, because
a ranked list a CAO cannot interrogate is worse than the two sort buttons it
replaced.

### 7.5 Notifications

One trigger on `activity_log` fans out: a new issue to every CAO, an assignment
to the assignee or the team's members, a status change to the reporter, plus
CAO oversight rows. **Keep the single fan-out point.** Delivery is then
whatever MyJKKN offers; the module's own delivery is Web Push, and the sender
holds no database privileges — the trigger hands it the payload and the
subscriptions.

---

## 8. Screens

Twenty-one routes today. Build them in this order — each one is usable before
the next exists.

| Route | Who | What it must do |
|---|---|---|
| `/issues/new`, `/requirements/new` | Reporter, Maintenance, Super Admin, CAO, Principal | The report form: institution, category, severity, location, title, details (≥10 characters), photographs. A checklist beside it ticks off what is still missing |
| `/issues`, `/requirements` | everyone, RLS-scoped | Server-side pagination and filtering, chip filters, remembered per person, row click opens the record, CSV export and bulk assign for staff |
| `/issues/[id]` | RLS-scoped | The record: progress bar, the next action, quick assign, notes, the timeline, the confirmation panel, photo viewer |
| `/triage` | CAO, Super Admin | The ranked queue, opening on "needs a decision"; assign or prioritise from the row |
| `/work` | Maintenance, Super Admin | Tabs with counts: assigned, in progress, to claim, completed. Held-by column. Claim / start / complete from the row |
| `/dashboard` | everyone | Role-specific figures from one RPC, and a "your next step" panel that offers the action inline |
| `/workload` | CAO, Super Admin | Per-team and per-person load, used before assigning. Idle rows hidden by default |
| `/analytics` | Principal (scoped), Super Admin | Volume over time, status mix, resolution time, reopen rate, category and institution breakdown, recurring locations |
| `/admin/*` | Super Admin (teams also CAO) | Users and roles, teams, reference data, principal scope, attachments |
| `/profile` | everyone | Their details (read-only when mirrored), and notification preferences |

Mobile matters more than desktop for maintenance: they work from a phone in a
corridor. Cards instead of tables below `md`, tap-to-call the reporter, the
location on its own line, and one-tap Claim / Start.

---

## 9. Integrations

| Integration | Keep? |
|---|---|
| **Attachments** | Google Shared Drive with a Supabase Storage fallback, behind one service and one API route. Swap the backend if MyJKKN standardises elsewhere; keep the route's checks — role, magic-byte sniff, per-hour cap, and the trigger that constrains stored URLs |
| **Web push** | Keep unless MyJKKN delivers push. The database hands payload + subscriptions to a signing route; the route holds no database identity |
| **Bug reporter** | The external JKKN platform, proxied server-side so the reporter's email comes from the session. Drop it if MyJKKN has its own feedback channel |
| **Error tracking** | Sentry, configured in one module, inert without a DSN |

---

## 10. What not to build

Asked for at some point and deliberately declined. Re-raising them costs a
meeting each:

- automatic assignment of any kind;
- a second approval level or cost-tier approval;
- routing by the reporter;
- email or WhatsApp notifications;
- editing a submission after it leaves `pending`;
- hard deletes;
- merging severity and priority into one "urgency";
- an SLA that asserts a target was *missed* before the SLA feature (PRD §18
  Phase 3) actually defines the targets.

---

## 11. Port plan

### Phase A — Discovery (½ day)
Answer §3. Write the answers into this file.

### Phase B — Schema (1–2 days)
Namespace and create the tables, enums, views and functions. Rewrite the seven
helper functions against MyJKKN's identity. Apply the policies unchanged.
`supabase/migrations/` is the source; read them in order, they are heavily
commented with the reason for each rule.

### Phase C — Identity (1 day)
Replace `profiles` and `institutions` with MyJKKN's, through the
`myjkkn_user_id` / `myjkkn_institution_id` seams. Delete the derivation script,
the sync scripts and the staff-directory gate. Map roles live.

### Phase D — Services and UI (3–5 days)
Move `lib/services/`, `hooks/`, `app/(app)/` and `components/`. If MyJKKN has
its own component library, swap the primitives (button, card, table, dialog)
and keep the feature components.

### Phase E — Notifications (1 day)
Point the fan-out at MyJKKN's notification system, or keep the bell and push.

### Phase F — Data migration and cut-over (1 day + a quiet window)
1. Freeze the standalone app (read-only).
2. Copy issues, requirements, activity log, notes, teams, categories,
   institutions, preserving **reference numbers** — they are quoted in emails
   and on paper, and must not change.
3. Remap `reported_by`, `assigned_to`, `actor_id` and `author_id` through
   `myjkkn_user_id`.
4. Reset `reference_counters` to the highest number actually in use, or the
   next report will try to reuse a number.
5. Disable the notification trigger during the load, or everyone is notified
   about last month's work.
6. Reconcile: row counts per table, and the highest reference number per year.
7. Redirect the old URLs. Keep the standalone deployment readable for a week.

---

## 12. Acceptance

The module is done when each of these passes. They are the same checks the
standalone product ships against (PRD §11):

1. A reporter files an issue with a photograph and gets a reference number; it
   appears in their list and nowhere else.
2. A CAO prioritises and assigns it; the assignee sees it in their queue, the
   reporter sees the status change, and both were notified.
3. Maintenance claims team work, starts it, completes it with notes and a
   photograph. Nobody else's queue changed.
4. The reporter confirms the fix. A dispute instead puts it at the top of
   triage with the reason visible.
5. A Principal sees exactly their institutions, and nothing else — with zero
   institutions assigned, every list is legitimately empty and says so.
6. A maintenance account cannot read another person's phone number, another
   team's audit trail, or any internal note on a requirement.
7. A reporter cannot change their own role, activation or identity columns.
8. `reference_counters` continues the sequence from the migrated data.
9. Every figure on every dashboard comes from an RPC — no number is computed in
   the browser and none is a literal.
10. The terminology and architecture checks pass in MyJKKN's CI.

---

## 13. Open questions for the builder

| # | Question | Blocks |
|---|---|---|
| M-1 | Same Supabase project, and Supabase Auth? | Phase B — everything branches here |
| M-2 | Does MyJKKN model "which institutions a principal heads"? If so, `iqac_scope` is redundant | Phase C |
| M-3 | Does MyJKKN have a notification centre worth routing through? | Phase E |
| M-4 | Its own component library — and is it Tailwind? | Phase D estimate |
| M-5 | Do learners get the module, or only staff? The standalone product currently admits staff only, and the 2026-09-26 review decided learners should be admitted | Phase C |
| M-6 | Who owns attachments after the merge — the same Shared Drive, or MyJKKN's storage? | Phase D |

Answer them in this file as you go. The next person to read it should not have
to ask twice.

---

## 14. Answers — recorded 2026-09-30 (build session, interview with the owner)

| # | Answer | Consequence in the build |
|---|---|---|
| Design | **This spec (D-9) wins**, and D-9 is approved. It supersedes the InstaSolver reading in `specs/instasolver-2026-09-14.md` for the issues / requirements desk. | The existing `/instasolver` chooser, `broken` (→ Campus Walk), `complaint` (→ grievance) and `track` pages are **kept side by side**, untouched except for one link card to the desk. |
| M-1 | **Different Supabase projects** — standalone `xbodlspdmecprphtjflt`, MyJKKN `kvizhngldtiuufknvehv` — both on Supabase Auth. | Tables are rebuilt in MyJKKN's project; `auth.uid()` is MyJKKN's `profiles.id`. Only the identity helpers were rewritten. Data import remaps users through `profiles.myjkkn_user_id` (Phase F, not yet run). |
| M-2 | A Principal sees **their own institution** — `principal` role + `profiles.institution_id` (MyJKKN's existing model). | No `iqac_scope` table; `instasolver_principal_institutions()`. |
| M-3 | **Route through MyJKKN's notifications.** | The single fan-out trigger writes `public.notifications` rows (`kind='work_item'`, `category='instasolver'`, `targeting.user_ids`). No module bell, push tables or dispatch route. |
| M-4 | **MyJKKN's own shadcn kit on Tailwind 3.4.** | Feature components rebuilt on MyJKKN primitives. |
| M-5 | **Team members, Senior Learners and learners — no parents** (parents / guests excluded). | `instasolver_can_report()`. |
| M-6 | **MyJKKN's Google Shared Drive.** | `uploadInstaSolverAttachment` in `lib/google/drive-upload.ts`, route `app/api/instasolver/attachments` (role, magic-byte sniff, 60/hour cap); trigger accepts Drive / lh3 URLs and the standalone bucket (for imported history). |
| Roles | **CAO = `cao` role; Super Admin = `is_super_admin` or `super_admin` role. Maintenance is team membership**, not a role. | `system_admin → Maintenance` from §6.1 no longer applies; a CAO / Super Admin adds people to teams at `/instasolver/admin/teams`. |
| SQL | Applied to production on 2026-09-30. | See `supabase/SQL_FILE_INDEX.md`. |

### Deliberate differences from the standalone product
- Roles are not exclusive, so the column guard is decided by the caller's relationship to the row (manager / worker on it / its reporter). Fixes standalone PRD BUG-2.
- A reopen clears the previous confirm / dispute (BUG-1); the dispute stays in the audit trail.
- `withdrawn` status added for issues and requirements — the 2026-09-26 "reporter may edit or withdraw while pending" decision.
- Priority is required to **assign**, not to reject.
- Rate-limit error is P0001 with a readable message (BUG-5).
- Disputes and new requirements also notify the CAOs.

### Not yet done
- **Phase F data migration** from the standalone app (freeze, copy with reference numbers, remap users, reset `instasolver_reference_counters`, import with `SET LOCAL instasolver.suppress_notifications = 'on'`, reconcile, redirect).
- `/admin/attachments` feed and the bug-reporter proxy were not ported (MyJKKN has its own bug reports).
- SLA targets (PRD §18 Phase 3).
