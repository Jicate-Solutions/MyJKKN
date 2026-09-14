# InstaSolver on MyJKKN — locked decisions (2026-09-14)

Decided by the Director by phone interview, 07:08–07:40 IST, while walking.
Supersedes the InstaSolver reading in `specs/campus-walk-2026-08-17.md` and the
`instasolver-core-module-90d` lock. Nothing here is built yet.

## Finding that reframed it
The old `instasolver.jkkn.ac.in` had THREE lanes — complaints, broken things,
purchase requirements. MyJKKN had a home for each, scattered and one wired wrong:
- complaints → `grievance_tickets`, filed via Learners Council → Issues
  (students/faculty/HOD/principal only; 204 non-teaching staff + all parents locked out)
- broken things → Campus Walk (`project_tasks` under CAMPUS-OPS), Director-only
- purchases → Procurement → Purchase Requests (3 procurement roles only; single super-admin approval)

The unapplied migration `20261103000000_instasolver_substrate.sql` would put broken
things INTO `grievance_tickets` with an `issue_type` tag, and add a separate
`requirement_requests` table with no link to Procurement. Verified 2026-09-14:
NOTHING reads `issue_type` — `app/api/b2a/grievance/dashboard/route.ts`,
`lib/services/grievance/grievance-service.ts`, and the HOD metrics SQL
(`20260722200000_hod_metrics_add_overdue_ages.sql`, `COUNT(*) FROM grievance_tickets`)
all count the whole table. Every broken fan would become a grievance in the NAAC
and UGC exports — the exact harm guardrail G1 exists to prevent.

Proof it already happens: the four tickets titled "test" carried 8
`quality_evidence_mappings` rows (NAAC 7.7.1 ×4, UGC grievance ×4), auto-written by
`20260422_grievance_evidence_emission_trigger.sql` when they were closed.

## Locked decisions
| # | Decision | Director's words / choice |
|---|---|---|
| I1 | Who can file | **Everyone with a login** — students, teaching + non-teaching staff, parents |
| I2 | Name | **InstaSolver** — the name every college already knows |
| I3 | Shape | **One button.** First tap asks: complaint / something broken / need to buy. Purchases are NOT an InstaSolver lane — "Can purchases be dealt by purchases module" → the third choice links straight into Procurement |
| I4 | Broken things | **Campus Walk's task list** (`project_tasks` under CAMPUS-OPS). "Same as existing InstaSolver. Campus walk also should feed into the same only." InstaSolver is the front door to Campus Walk's engine for all users. Complaint numbers stay clean (G1 preserved) |
| I5 | Purchases | **Any user raises → tiered approval → becomes a Procurement Purchase Request.** Tiers from the migration seed: HOD ≤ ₹10,000 · principal ₹10,001–50,000 · super-admin above. Procurement's own single-step super-admin approval sits after |
| I6 | Voting | **Only for big-ticket items.** Default threshold = the super-admin tier (> ₹50,000) until the Director sets a different amount |
| I7 | Anonymous | **Yes, with a private tracking code** — `fn_track_issue_by_token()` (already in the fixed migration) |
| I8 | Complaint about own HOD | **Routes to isvarya@jkkn.ac.in** (Isvarya Lakshmi, Joint MD, super_admin, profile 583f39e2…). Record as a `platform_policies` row, not a hardcoded email |
| I9 | Old site | **Point `instasolver.jkkn.ac.in` at MyJKKN once the button is live.** Copy open tickets across first |
| I10 | Test tickets | **Delete** GRV-20260910-0021, -0020, GRV-20260909-0019, GRV-20260810-0016 and their 8 evidence rows. Backup in `artifacts/instasolver-test-tickets-backup-2026-09-14.json` |

## Consequence for the unapplied migration — REVISE, DO NOT APPLY AS-IS
`20261103000000_instasolver_substrate.sql` must be rewritten before it touches production:
- DROP the `requirement_requests` / `requirement_categories` / `requirement_approval_thresholds`
  sections (I3/I5: purchases go to Procurement; keep the threshold TIERS as a policy seed
  for the Procurement approval chain instead)
- DROP `grievance_tickets.issue_type` and `requirement_id` (I4: broken things never enter this table)
- KEEP: `allow_anonymous` on categories, `fn_track_issue_by_token()`, the ICC RLS fix,
  the delegating-wrapper replacement for `DROP FUNCTION`
- `campus_walk_step_days` (20261103020000) is unaffected — still apply

## Build order (next session)
1. Migration rewrite per above → PR
2. InstaSolver button (sidebar, all roles) → "what kind?" chooser
3. Broken-things intake: text + optional photo from ANY login → `createWalkTask` (new route;
   the Campus Walk photo route keeps its Director-only D2 gate)
4. Complaints: open Learners Council issue-service to all roles; anonymous + tracking code;
   I8 routing policy
5. Purchases: request form for all roles → tier approval → `purchase-request-service.createPurchaseRequest`
6. Old-ticket import + subdomain redirect (I9)
