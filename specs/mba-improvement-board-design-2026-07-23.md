# MBA Teaching-Enterprise — Improvement Board + CEO Rounds Log (Build Spec)

_Generated 2026-07-23 via /myjkkn-chain. Data foundation (7 de-identified views + `mba_learner_analyst`) already LIVE (2026-07-22). This spec covers rank-2: the Improvement Board (PR 1 + 2) and CEO Rounds log (PR 3)._

## Production sweep (verified 2026-07-23)
- No `improvement_*` / `ceo_rounds` table or module exists → new build, no duplicate.
- Reuse (production patterns): LC-issues kanban UI · `bos_meetings`/`meeting_agendas`/`meeting_action_items` (0 rows) · `billing/.../user-activity-leaderboard.tsx` · Max-lane AI jobs (`bug.triage`/`bug.categorize` shape) · `admission_daily_briefings` + bug `ai-briefing-card`.
- Personas map to existing `custom_roles`: `student` (+MBA cohort) / `faculty`="Facilitator" / `ceo` / `hod`. **No missing role.** New work = permission keys only.

## Persona → access
| Persona | Role | Board access |
|---|---|---|
| Management Associate | `student` + MBA-Associate cohort | create ideas, view open ideas, own edit (pre-approval), write Rounds summary |
| Learning facilitator | `faculty` | review/score/approve, see sensitive, approve summary |
| CEO office | `ceo` | prioritise, host Rounds, see all |
| Dept staff | `hod` | receive + apply approved fixes (propose-only: only staff can mark applied) |

## Locked decisions (interviews 2026-07-22/23)
### Stipend + academics (playbook, finalised)
Exam weeks = wider auto-pause (posting+stipend). Pay starts = badge AND ≥1 adopted win; qualifying first win back-paid. Saving confirmed = system-measure AND human-confirm. Net-negative side-effect = pay follows net result. Adoption job counts via usage metric. Quiet term = pay can be ₹0. Shared saving = doer biggest share.

### Improvement Board + Rounds design
1. Ideas OPEN to whole program (cross-learning).
2. Each idea = full mini business case (problem+fix+expected-impact+evidence).
3. Priority = AI Max-lane job ranks free-text cases (impact×feasibility×fit) → facilitators+CEO adjust.
4. Rounds summary = rotating Associate writes, facilitator approves.
5. Approved-fix-ignored = auto-escalates to CEO/dept-head after a config'd number of days.
6. Rejected idea still graded (on thinking).
7. Rounds attendance tracked + participation-quality graded.
8. Live individual impact leaderboard (no-rank doctrine dropped).

### Assumption-thrash (schema-level, 2026-07-23)
| # | Question | Decision | Schema impact |
|---|----------|----------|---------------|
| 1 | Ownership multiplicity | One owner + named helpers | `author_id` + `contributors jsonb` |
| 2 | Grade vs leaderboard | One combined score | single `score` numeric; stipend uses separate verified-value fields |
| 3 | Sensitive findings | Sensitive flag → private until reviewed | `visibility` enum + RLS exception |
| 4 | Withdraw | Until approved only | `withdrawn` status; no hard delete |

### Craft decisions (Claude-decided)
- UUID PK, `created_at`/`updated_at` timestamptz UTC; `institution_id` required on ideas (multi-tenant).
- Status = **enum** state machine (Q15 justified exception): `logged→under_review→approved→applied→verified→closed`, terminals `rejected`/`withdrawn`/`not_pursued`.
- `improvement_areas` = **CRUDable master** (Q15 default yes); `institution_id` NULL = global/system area; seeded from the posting menu with `is_system=true`.
- **Propose-only** enforced by SECDEF RPC `fn_improvement_set_status` — no RLS UPDATE path lets a learner set status to `applied`/`verified`. Every RPC `REVOKE EXECUTE FROM anon, PUBLIC; GRANT authenticated` (CLAUDE.md rule).
- Escalation window = admin-editable config (default 7 days), read by the PR-2 cron.
- Attachments optional (`attachments jsonb`), reuse existing storage pattern.
- AI rank stored as a snapshot per ranking run (not live-recomputed).

## Schema implications
- **3 new tables:** `improvement_areas` (master), `improvement_ideas` (core), `improvement_idea_activity` (audit/status history + escalation trail).
- **2 new enums:** `improvement_idea_status`, `improvement_idea_visibility`.
- **1 SECDEF RPC (PR-1):** `fn_improvement_set_status(idea_id, to_status, note)` — role-checked transitions, writes activity, blocks learner→applied.
- **PR-2:** `improvement.rank_ideas` ai_job_types row (lane=max, interactive=false, output_target=job.result, anthropic sonnet, schedulable) + ranking snapshot table + escalation cron.
- **PR-3:** CEO Rounds log reusing `meeting_agendas`/`meeting_action_items`; rotating-Associate summary; participation-graded attendance.
- **Permission keys (UI PR):** `improvement.ideas.create`, `improvement.ideas.view`, `improvement.board.manage`, `ceo_rounds.log`, `ceo_rounds.summary.write` → added to `PERMISSION_CATEGORIES`, catalogued for role-management.

## CARRE lens (people-facing)
Clarity (business-case template) · Appreciation/Recognition (leaderboard + credit + VSR) · Empowerment (own your ideas) · **Respect safeguard**: leaderboard = top + your-own-rank only (no "worst" list); rejected ideas still graded. First real score later via `/carre-audit`.
