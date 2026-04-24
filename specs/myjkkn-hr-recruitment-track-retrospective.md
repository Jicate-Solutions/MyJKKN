# MyJKKN HR Recruitment Track — Retrospective Spec

> **RETROSPECTIVE — written 2026-04-24 from shipped PRs + prod schema. Not a pre-build design.**
>
> This spec reverse-engineers the HR Recruitment track that was shipped across 8 PRs between 2026-04-15 and 2026-04-16 without a committed spec file in the production repo. (The assumption-thrash session referenced `specs/hr-recruitment-module-spec.md`, but that artifact was never pushed to `Jicate-Solutions/MyJKKN`.) Evidence base: merged PR bodies, `supabase/setup/01_tables.sql` diffs, production schema introspection, and service-file code inspection.

---

## 1. Status (as of 2026-04-24)

| Surface | Shipped | Live on prod | Evidence |
|---|---|---|---|
| Phase 1A — candidates + package negotiation (backend) | Yes (PR #187) | **Yes** | `hr_recruitment_candidates` = 24 rows, `hr_recruitment_candidate_packages` = 0 rows |
| Phase 1B — UI (hub, submit, my, approvals, detail) | Yes (PR #193) | Yes | 5 pages live under `/hr/recruitment/*` |
| Phase 1A follow-ups — server-side filters, alumni panel, cross-profile entry, permission keys, CTC→Monthly refactor | Yes (#198, #199, #200, #201, #209) | Yes | Code on jicate/main; 24 candidates on refactored schema |
| Phase 2 | **SKIPPED** (no PR, numbering jumps 1B → 3) | n/a | `gh pr list --search recruitment` returns zero Phase 2 PRs |
| Phase 3 — jobs + interviews + scorecards (backend) | PR #213 merged | **Partial — tables NOT applied to prod DB** | `hr_recruitment_jobs/interviews/scorecards` absent from `information_schema.tables` despite DDL being in `supabase/setup/01_tables.sql` |
| Phase 3 UI (jobs list, interview scheduler, scorecard form) | **NEVER SHIPPED** | No | No files under `app/(routes)/hr/recruitment/{jobs,interviews,scorecards}` |

**Adoption signal.** 24 candidate rows on prod is real human activity — this is not a dead module. The zero-rows-in-packages tells us candidates are being submitted but the salary-negotiation sub-flow hasn't been exercised yet (or packages have all been proposed+approved+deleted, but that's unlikely with no soft-delete).

**The live gap.** Phase 3 is half-shipped: backend code exists in the repo (services, types, hooks, 7 API routes), SQL is in `supabase/setup/01_tables.sql` at line 4342, but the DDL was never run against production. Hitting any `/api/hr/recruitment/{jobs,interviews,scorecards}/...` endpoint today would return a Postgres "relation does not exist" 500. No UI routes this backend either. See §10.

---

## 2. Timeline

All 8 PRs merged within a 40-hour window, Director-authored, straight to jicate/main.

| PR | Title | Merged (UTC) | LOC |
|---|---|---|---|
| #187 | Phase 1A — candidates + package negotiation | 2026-04-15 16:44 | +2,343 |
| #193 | Phase 1B — UI (submit + track + approvals + detail) | 2026-04-15 17:38 | +1,753 |
| #198 | `submitted_by` + `pending_for_me` list filters | 2026-04-15 18:45 | +59 |
| #199 | Alumni signals panel on candidate detail (R4.3) | 2026-04-15 18:46 | +329 |
| #200 | Cross-profile entry — staff & learner → candidate | 2026-04-15 19:26 | +116 |
| #201 | Register HR Recruitment permission keys | 2026-04-15 19:26 | +15 |
| #209 | CTC (annual) → Monthly Salary across module | 2026-04-16 07:16 | ~400 touched |
| #213 | Phase 3 foundation — jobs + interviews + scorecards (backend) | 2026-04-16 08:40 | +2,176 |

---

## 3. Phase 1A — candidates + package negotiation (PR #187)

### Schema (live on prod)

**`hr_recruitment_candidates`** — 42 columns, 24 live rows. Key columns:

- Identity: `id`, `hr_organization_id`, `institution_id`, `name`, `email`, `phone`
- Application: `cvviz_url`, `role_category`, `role_title`, `proposed_monthly_salary_band` (renamed by PR #209 from `proposed_ctc_band`), `role_specific_details jsonb`
- Flow state: `status`, `approval_chain jsonb` (snapshot-at-submit per R1.4), `current_step`, `final_approver_id`, `final_decided_at`, `rejection_reason`, `cancellation_reason`
- Flags: `is_emergency` (R3.2 fast-path), `is_internal_transfer` (R4.1), `source` (`learner_graduate` | `internal_transfer` | manual), `source_staff_id`
- Lifecycle: `expected_joining_date`, `actual_joining_date`, `submitted_by`, `submitted_at`, `created_at`, `updated_at`

**`hr_recruitment_candidate_packages`** — 14 columns, 0 live rows. Negotiation chain with `parent_package_id` self-FK (per R2.3), `proposed_monthly_salary` + `proposed_monthly_salary_breakdown jsonb`, `is_counter_offer`, `status`, `approved_by`, `approved_at`.

### Reused substrate

- `hr_approval_flows` — `flow_for='recruitment_approval'` with 7 seed rows (4 role-only + 3 band-conditional). Rather than build a parallel table (O2).
- `hr_onboarding_checklists` — cadre-specific seeds activated (O3).

### API (12 routes, all under `app/api/hr/recruitment/`)

```
candidates/route.ts                                         GET POST
candidates/[id]/route.ts                                    GET PATCH DELETE
candidates/[id]/approve/route.ts                            POST
candidates/[id]/reject/route.ts                             POST
candidates/[id]/withdraw/route.ts                           POST
candidates/[id]/status/route.ts                             POST
candidates/[id]/onboarding/start/route.ts                   POST
candidates/[id]/packages/route.ts                           GET POST
candidates/[id]/packages/[packageId]/route.ts               GET
candidates/[id]/packages/[packageId]/approve/route.ts       POST
candidates/[id]/packages/[packageId]/counter/route.ts       POST
approval-flows/route.ts                                     GET (for UI preview)
```

All use `getClient()` + `supabase.auth.getUser()` (mirrors HR Leave pattern).

### Locked design decisions (from PR #187 body)

- R1.1 Rolling candidacy — no `cycle_id`
- R1.2 One row per application — dual-role candidates get 2 rows
- R1.4 Snapshot `approval_chain jsonb` at submit-time, not live-lookup
- R2.3 Package negotiation chain via `parent_package_id` self-reference
- R3.2 Emergency bypass multi-step + 7d doc grace
- R3.3 Auto-escalate after 72h (reuses `hr_approval_flows.escalate_after_hours`)
- R4.1 Day-1 internal mobility (`is_internal_transfer` + `source_staff_id`)
- R4.2 Day-1 learner→candidate (`source='learner_graduate'`)
- Learning #8 Stricter confidentiality RLS on packages than on candidates

---

## 4. Phase 1B — UI (PR #193)

5 pages shipped under `app/(routes)/hr/recruitment/`:

| Route | Purpose |
|---|---|
| `/hr/recruitment` | 3-tile landing hub (mirrors `/hr/leave` hub) |
| `/hr/recruitment/submit` | New-candidate form; shows live `approval_chain` preview when `role_category` + salary band selected |
| `/hr/recruitment/my` | Submitter's own list w/ status filter + withdraw |
| `/hr/recruitment/approvals` | Approver inbox: "Awaiting me" / "All pending" toggle, approve+comment, reject+required-reason, emergency flag prominent |
| `/hr/recruitment/candidates/[id]` | Full profile: header + meta + approval-chain timeline + package-negotiation history + conditional Alumni panel + actions (Propose / Approve / Counter / Withdraw / Mark Joined) |

Sidebar entry added under HR. Uses skeleton loading throughout (avoids silent-failure pattern d). No new APIs or DB objects — pure UI over Phase 1A infrastructure.

---

## 5. Phase 2 — does not exist

`gh pr list --state merged --search "recruitment"` returns 8 PRs. Numbering jumps directly from "Phase 1B UI" (#193) to "Phase 3 foundation" (#213). No intermediate Phase 2 PR, branch, or commit exists on jicate/main. PR #187's body explicitly deferred the Cvviz-sunset scope to "Phase 3 and Phase 4" without mentioning a Phase 2.

Conclusion: **Phase 2 was skipped / renumbered**. The follow-up polish PRs (#198, #199, #200, #201, #209) are Phase 1A-remediation rather than a numbered Phase 2.

---

## 6. Phase 3 — jobs + interviews + scorecards (PR #213, **half-shipped**)

### What's in jicate/main (code side)

Services (`lib/services/hr/`):
- `recruitment-jobs-service.ts` — list / get / create / update / publish / close / delete (242 LOC)
- `recruitment-interviews-service.ts` — schedule / reschedule (audit-preserving: new row + `rescheduled_from_id` link) / cancel / complete / no_show (283 LOC)
- `recruitment-scorecards-service.ts` — list / get / submit. Unique `(interview_id, interviewer_id)` enforces submit-once; maps Postgres 23505 to "already submitted" (132 LOC)

Hooks appended to `hooks/hr/use-recruitment.ts`: `useJobs`, `useJob`, `useCreateJob`, `usePublishJob`, `useInterviews`, `useScheduleInterview`, `useRescheduleInterview`, `useScorecards`, `useSubmitScorecard`, etc.

API routes (7 files):
```
jobs/route.ts                                  GET POST
jobs/[id]/route.ts                             GET PATCH DELETE
jobs/[id]/publish/route.ts                     POST   # is_public=true, status='open', posted_at stamp
interviews/route.ts                            GET POST
interviews/[id]/route.ts                       GET PATCH (action=reschedule|cancel|complete|no_show)
interviews/[id]/scorecards/route.ts            GET POST
scorecards/[id]/route.ts                       GET
```

Types extended in `types/hr-recruitment.ts` (+286 LOC): `JobStatus`, `InterviewStatus`, `InterviewMode`, `ScorecardRecommendation`, all insert/update/filters/list-response shapes, label constants.

### What's missing on prod

1. **Tables don't exist on the production database.** `information_schema.tables` query returns only `hr_recruitment_candidates` and `hr_recruitment_candidate_packages`. `hr_recruitment_jobs`, `hr_recruitment_interviews`, `hr_recruitment_scorecards` absent — despite the DDL sitting at `supabase/setup/01_tables.sql:4342` since 2026-04-16. Classic "merged migration ≠ applied migration" gap (see `memory/feedback_verify_migration_actually_ran_not_just_merged.md`).
2. **No UI.** No files under `app/(routes)/hr/recruitment/{jobs,interviews,scorecards}`. The backend cannot be reached from the browser.
3. **Permission keys not registered for Phase 3.** PR #201 shipped only the 8 Phase 1A keys. RLS on Phase 3 tables references `hr.recruitment.jobs.*`, `hr.recruitment.interviews.*`, `hr.recruitment.scorecards.*` — which are not in `lib/constants/permissions.ts` (per PR #213's explicit note: "Agent A's companion PR owns the catalog" — no evidence that PR ever landed).

**Practical impact right now.** Any call to `/api/hr/recruitment/jobs` on jkkn.ai would 500 with "relation hr_recruitment_jobs does not exist". No UI exercises these endpoints, so the bug is latent, but the moment a user or a new UI surface tries to hit them, it breaks. This track is a deploy-and-it-breaks landmine waiting on the next HR sprint.

---

## 7. R4.3 — Alumni signals panel (PR #199)

Service: `lib/services/hr/alumni-signal-service.ts` (+140). Hook: `hooks/hr/use-alumni-signal.ts` (+36). Route: `app/api/hr/recruitment/candidates/[id]/alumni-signal/route.ts` (+68).

Flow: candidate email → `profiles` → `alumni_outcomes` (required for panel to render at all) → graceful try/catch lookups into `lc_members` / `lc_positions` / `lc_terms` (Learners Council), `sh_builders` (Solutions Hub contributions), `bug_reports` (count). Missing sub-tables omit rows rather than erroring.

Empty state: if no alumni match, API returns `{ data: null }` and the candidate-detail page renders nothing (no placeholder card) — avoids the "empty panel" silent-failure pattern.

Panel appears below the Meta grid on `/hr/recruitment/candidates/[id]` and is director-visible with no stricter gating than the rest of the candidate record.

---

## 8. Cross-profile entry (PR #200)

Two new cross-profile CTAs that pre-fill the submit form via URL params:

| Source | File | Button | Visibility gate |
|---|---|---|---|
| Staff detail | `app/(routes)/staff/list/[id]/page.tsx` | "Consider for New Role" | `hr.recruitment.create` or super_admin |
| Learner detail | `app/(routes)/learners/profiles/_components/learner-detail-actions.tsx` | "Consider for Hiring" | `lifecycle_status IN ('graduated','alumni')` AND `hr.recruitment.create` |

Landing URL: `/hr/recruitment/submit?source_staff_id=<id>&source=internal_transfer&name=<name>&email=<email>` (or `source=learner_graduate` for learner path). Submit page reads `useSearchParams()` on mount, shows a contextual banner, does NOT auto-submit (user still reviews + clicks). Email fallback: staff uses `institution_email` → `email`; learner uses `college_email` → `student_email`.

---

## 9. Permission keys (PR #201)

Registered in `lib/constants/permissions.ts` under a new `hr` category:

```
hr.recruitment.view                  — View Recruitment Candidates
hr.recruitment.create                — Submit Recruitment Candidates
hr.recruitment.edit                  — Edit Recruitment Candidates
hr.recruitment.delete                — Delete Recruitment Candidates
hr.recruitment.approve               — Approve Recruitment Candidates
hr.recruitment.packages.view         — View Candidate CTC Packages
hr.recruitment.packages.propose      — Propose Candidate CTC Packages
hr.recruitment.packages.approve      — Approve Candidate CTC Packages
```

Note: label text still says "CTC" despite the #209 rename — deliberately left per #209 PR body ("Permission keys keep `hr.recruitment.packages.*` — semantic, not about annual vs monthly"). Minor UX inconsistency: users see "CTC" in Role Management UI but "Monthly Salary" everywhere else.

**Missing:** `hr.recruitment.jobs.*`, `hr.recruitment.interviews.*`, `hr.recruitment.scorecards.*` — referenced by Phase 3 RLS but never registered. See §10.

Sidebar wiring (`lib/sidebarMenuLink.ts`):
```
'/hr/recruitment'           → hr.recruitment.view
'/hr/recruitment/submit'    → hr.recruitment.create
'/hr/recruitment/my'        → hr.recruitment.view
'/hr/recruitment/candidates'→ hr.recruitment.view
'/hr/recruitment/approvals' → hr.recruitment.approve
```

---

## 10. What's missing — next-step follow-ups

**P0 — Phase 3 production deploy gap.** Biggest live exposure. Two follow-ups needed:
1. Apply the Phase 3 DDL from `supabase/setup/01_tables.sql:4342+` (or matching block in `03_policies.sql`) to the production database. Ship as a one-off migration PR that runs idempotent `CREATE TABLE IF NOT EXISTS`.
2. Register Phase 3 permission keys (`hr.recruitment.jobs.*`, `.interviews.*`, `.scorecards.*`) in `lib/constants/permissions.ts`.

**P1 — Phase 3 UI.** Backend has 7 endpoints, 3 services, 10+ hooks, but zero pages. Need at minimum: `/hr/recruitment/jobs` (list/create/publish), `/hr/recruitment/jobs/[id]` (detail + publish button), `/hr/recruitment/interviews` (calendar/list), `/hr/recruitment/interviews/[id]/scorecard` (panel-member submit form). Public `/careers` page also referenced by `is_public` column but not built.

**P2 — Phase 4 items deferred by PR #187:** reservation quota tracker (SC/ST/OBC/EWS/PWD), AI resume parsing, WhatsApp candidate templates, activity log.

**Debt / polish:**
- Permission label still says "CTC" (§9). Either rename to "Monthly Salary" or accept the semantic-only naming per PR #209 rationale.
- `packages` table has 0 rows across 24 candidates — either negotiation sub-flow isn't discovered by users or director approves verbally before UI capture. Worth an adoption check.
- Original spec `specs/hr-recruitment-module-spec.md` referenced in PR #187 body is NOT in `Jicate-Solutions/MyJKKN`. This retrospective partially backfills that gap.

---

## 11. File inventory

| File | Added in | Purpose |
|---|---|---|
| `lib/services/hr/recruitment-service.ts` | #187 | Candidate lifecycle (list/get/create/update/approve/reject/withdraw) |
| `lib/services/hr/recruitment-package-service.ts` | #187 | Salary package proposal + counter-offer chain |
| `lib/services/hr/alumni-signal-service.ts` | #199 | Aggregates profiles/alumni/LC/SH/bug_reports by email |
| `lib/services/hr/recruitment-jobs-service.ts` | #213 | Phase 3 jobs CRUD + publish (backend live in repo; tables missing on prod) |
| `lib/services/hr/recruitment-interviews-service.ts` | #213 | Phase 3 interview schedule/reschedule/cancel |
| `lib/services/hr/recruitment-scorecards-service.ts` | #213 | Phase 3 scorecard submit-once enforcement |
| `hooks/hr/use-recruitment.ts` | #187, extended #213 | React Query hooks for all recruitment entities |
| `hooks/hr/use-alumni-signal.ts` | #199 | Alumni signal fetcher |
| `types/hr-recruitment.ts` | #187, extended #209/#213 | Shared TS types, label constants |
| `app/(routes)/hr/recruitment/page.tsx` | #193 | Hub landing |
| `app/(routes)/hr/recruitment/submit/page.tsx` | #193, extended #200 | Submit form + cross-profile pre-fill |
| `app/(routes)/hr/recruitment/my/page.tsx` | #193 | Submitter's own list |
| `app/(routes)/hr/recruitment/approvals/page.tsx` | #193 | Approver inbox |
| `app/(routes)/hr/recruitment/candidates/[id]/page.tsx` | #193, extended #199 | Full candidate profile + alumni panel |
| `app/api/hr/recruitment/candidates/**` | #187 | 12 Phase 1A routes |
| `app/api/hr/recruitment/candidates/[id]/alumni-signal/route.ts` | #199 | Alumni lookup API |
| `app/api/hr/recruitment/{jobs,interviews,scorecards}/**` | #213 | 7 Phase 3 routes (will 500 on prod until tables applied) |
| `lib/constants/permissions.ts` (category `hr`) | #201 | 8 Phase 1A permission keys (Phase 3 keys NOT added) |
| `lib/sidebarMenuLink.ts` | #193 | 5 recruitment entries |
| `supabase/setup/01_tables.sql` (lines 3870, 3952, 4342+) | #187, #213 | Candidate + package + jobs + interviews + scorecards DDL |
| `supabase/setup/03_policies.sql` | #187, #213 | RLS policies (with #213 adding stricter scorecard policies per Learning #8) |
| `supabase/setup/04_triggers.sql` | #187 | Trigger seeds |

---

## 12. Known issues / debt

- **CTC→Monthly Salary rename (PR #209) reveals column was initially misnamed.** Original Phase 1A shipped `proposed_ctc_band` / `proposed_ctc_amount` / `proposed_ctc_breakdown`. Within 15 hours of shipping, HR feedback forced a full rename across 9 files + DB migration + 24-row data remap. Lesson: domain validation with actual HR users before locking column names. The cross-profile pre-fill (PR #200) and the subsequent #209 rename landed on the same day — tight turnaround.
- **Permission label lag** — `hr.recruitment.packages.view` is labeled "View Candidate CTC Packages" in Role Management UI, even though the module UI everywhere else says "Monthly Salary". Rename deliberately skipped in #209.
- **Phase 3 deploy drift.** Code merged #213 on 2026-04-16, DDL in repo since same date, but production `information_schema.tables` shows tables not created. Unless a DDL batch is run, the Phase 3 backend is dead code.
- **Missing original spec.** `specs/hr-recruitment-module-spec.md` referenced by PR #187 body is not in `Jicate-Solutions/MyJKKN`. 19 assumption-thrash decisions live only in the PR body. This retrospective captures the locked decisions; the original thrash session's reasoning is lost.
- **Zero packages despite 24 candidates.** Either salary negotiation isn't happening via UI, or the sub-flow isn't discoverable. Worth a UX observation session.

---

*Retrospective authored 2026-04-24. Evidence: PRs #187, #193, #198, #199, #200, #201, #209, #213; prod schema as queried via Supabase MCP; file inspection on `jicate/main`.*
