TASK: Watch the ₹0 loop engine through its quiet period and close it out. The flip is DONE and verified — all 6 loop generators live on the observable ai_jobs lane at ₹0, manifest twins off, first organic morning passed. What remains is discipline, not building: (1) each session opens with a "morning check" proving the previous day's runs stayed clean (loops due·ran match, nothing stuck, 0 errors, ₹0); (2) confirm the "Engine health today" strip goes GREEN once the bug.triage misroute (sibling lane) is fixed — it is currently correctly AMBER naming bug.triage's 3 errors/day; (3) after 2 quiet weeks (~29–30 July; twins went off 16 Jul), prepare the cleanup PR retiring the 30-min pager and old-runner remnants — Director go required. Director's exact choice: "Watch loops → close quiet period", and "carry everything" — the P1/P2 tail below is not dropped.

PROJECT: /Users/omm/PROJECTS/MyJKKN
DATABASE: Supabase prod ref kvizhngldtiuufknvehv. Creds: /Users/omm/PROJECTS/MyJKKN/.env.production.local (values carry a literal \n suffix — strip before curl; never echo secrets) + /Users/omm/PROJECTS/MyJKKN/.env.local (anon). Mgmt API token: /Users/omm/.supabase/access-token — SQL via curl only: curl -s -X POST https://api.supabase.com/v1/projects/kvizhngldtiuufknvehv/database/query -H "Authorization: Bearer $(cat /Users/omm/.supabase/access-token)" -H "Content-Type: application/json" -d '{"query":"<SQL>"}'
SPEC: none (work order reference: /Users/omm/PROJECTS/MyJKKN/.claude/loop-lane-workorder-20260713.md)
PROGRESS: /Users/omm/PROJECTS/MyJKKN/progress.txt

CURRENT STATE (as of brief-write time):
- ₹0 flip LIVE + E2E-proven: 6 platform_policies loops.<key>.generation_lane='jobs'; all 8 loop job types drained by claimed_by='windows' at ₹0.00; recording proven (curriculum 2-phase collect wrote real spines: CCW332 25 lessons, GE3151 24).
- Manifest twins OFF: 6 ai_routine_schedules rows disabled (maxlane:scf-generate-suggestions / scf-learner-notes / induction-generate-playbook / induction-session-effectiveness / session-feedback-escalation / curriculum-lesson-spine-generate). Rollback = re-enable those 6 rows and/or policy→'direct'.
- First organic morning PASS 07-16 (22 judge + 50 note jobs, 0 errors, ₹0). Quiet-period clock effectively started 16 Jul → cleanup earliest ~29–30 Jul.
- 4 PRs merged + deployed + live-verified: #2102 (ring-2 seam), #2152 (Engine-health strip), #2155 (13 chip deep-links), #2115 (daily super-admin drafts reminder, fired 3 consecutive days to all 12 supers).
- KNOWN AMBER: bug.triage jobs are claimed by the CHAT drain which refuses non-interactive jobs → 3 errors/day. Sibling lane (bug-triage epic owner) — flagged, not fixed here.
- 1,035 learner-note drafts waiting since 9 Jul; work-down strategy UNDECIDED. A sibling session (07-19 evening) shadow-shipped a note-safety judge (scf_note_judgements — 19/19 verdicts = needs_human for hallucinated_specifics + pii_leak) — read that state before proposing bulk approval.
- Weekly cadence (don't false-alarm): curriculum = Sundays only; induction-playbook + escalation = Mondays only (escalation 19:30 IST); induction-session-effectiveness = static Vercel cron 43 */4 (no dispatcher row — zero enqueues = no fuel, not failure). Enqueue+collect semantics: a route's "generated 0" on enqueue day is NORMAL; results are collected/recorded on the NEXT day's run.
- Known-harmless noise: 4 curriculum courses (24PCAED5, 24UGEN03, 26PCHC04, 24UZOGE01) have empty BoS syllabus → generator correctly refuses, re-enqueues as ₹0 refusals daily. Institutional data gap, not a flip bug.
- Repo-root branch: feat/campus-living-fee-compute-engine (docs-only — never ship from it). Main deploys clean; all 4 PRs on main.

VERIFY CURRENT STATE (run BEFORE any work — read-only; if reality differs from this brief → STOP, report, do NOT execute the stale plan):
- Morning-check SQL (Mgmt curl recipe above), one batch:
  - select job_type, status, count(*) from ai_jobs where created_at > now() - interval '24 hours' group by 1,2 order by 1,2;  ⚠ ai_jobs has NO created_at — use requested_at
  - select coalesce(sum(cost_inr),0) as spend, count(*) filter (where provider not in ('claude_code','groq')) as paid_calls from ai_model_usage where invoked_at > now() - interval '24 hours';
  - select count(*) as stuck from ai_jobs where status not in ('done','error','canceled','cancelled','failed','delivered') and requested_at < now() - interval '30 minutes';
  - select routine_id, enabled from ai_routine_schedules where routine_id like 'maxlane:%' order by 1; → the 6 loop twins must still be enabled=false (chat-drain / poller-heartbeat / admission-* / ai-pulse-* / overnight-* / work-pulse-analyze rows stay enabled — NOT this flip).
  - select policy_key, value from platform_policies where policy_key like 'loops.%.generation_lane' and scope_type='global'; → all 6 = "jobs".
- Prod up: curl -s -o /dev/null -w "%{http_code}" https://www.jkkn.ai/ → 200.
- If a visual is needed: persona harness as test.superadmin on /admin/loops (jkkn-ai browser-use session is DEAD — recipe: copy harness.mjs+personas.json under repo root for ESM resolution, fullPage:true, sips-crop).
- If drain looks silent: diagnose the .{runner}-lock dirs FIRST (orphaned single-flight lock, tasks show Result 0x0 while producing nothing); liveness is proven ONLY by a fresh demo.ping pending→claimed→done + ledger claude_code/₹0 — never by heartbeat or backlog. Locks are now self-healing (15m drain / 45m poller / 10m chat reclaim) but verify, don't assume.

WHAT NEEDS TO HAPPEN:
1. [P0] Quiet-period watch: run the morning check each session (cadence-aware — Sunday expects curriculum, Monday expects playbook+escalation). A quiet day = due·ran equal, 0 stuck, 0 errors (bug.triage excepted until its fix lands), ₹0, 0 paid-provider calls. Record a one-line verdict per day; any real failure → diagnose via the lock protocol before touching anything.
2. [P0] ~29–30 Jul cleanup PR (only after 14 consecutive clean days): retire the 30-min outage pager (piggybacked on the ai-tasks-sweep */15 tail, scoped to ai_job_types.schedulable=true) + old-runner remnants (the 6 disabled maxlane:* twin rows; optionally the now-dead defer branches in the 6 cron routes). Confirm exact scope + get explicit Director go BEFORE building; ship via jicate/main worktree PR; Director merges; /deploy-myjkkn after merge.
3. [P1] bug.triage misroute: coordinate with the bug-triage epic owner — the chat drain claims their non-interactive jobs and refuses them. Fix belongs on THEIR lane (drain claim filter or job-type flags). After their fix: verify 24h of 0 bug.triage errors, then eyeball the strip rendering GREEN (persona harness screenshot).
4. [P1] 1,035-draft backlog: AskUserQuestion to the Director — bulk approve vs triage vs widen approvers. First read the sibling shadow-judge state (scf_note_judgements + specs/scf-note-safety-review-loop-2026-07-19.md): all 19 judged notes were flagged needs_human, which argues AGAINST naive bulk approval.
5. [P2] Pre-filtered deep links: teach /admin/ai-models + /admin/ai-routines to accept filter params so the 13 chip anchors land on filtered rows (current landing-on-page was a deliberate scope cut). [P2] SCF confound check when measured outcomes reach ~10 (currently ~4).

CONSTRAINTS & RULES:
- Translator Pattern only: NEVER push omm-dev to main; ship via a fresh jicate/main worktree (Step 0: git fetch jicate main && git checkout -B <branch> jicate/main), push feature branches to the jicate remote, Director merges — never self-merge.
- Merge-queue merges do NOT fire Vercel auto-builds → /deploy-myjkkn after merge; deploy ships CODE not migrations.
- Any migration: show SQL first, validate in a rolled-back txn on prod, apply via Mgmt API curl on explicit Director go, then verify post-apply ROW STATE (ON CONFLICT DO NOTHING = first-applied wins; a later seed can silently no-op).
- New SECURITY DEFINER RPCs: REVOKE EXECUTE FROM anon, PUBLIC + GRANT to authenticated (service_role-only for cron-only fns); self-scope inside the body.
- Local full tsc OOMs (vacuous pass) — CI PR-scoped TypeCheck is the only type gate. Terminology gate is delta-only and flags React's `children` prop if a component-signature line enters the diff — keep signature lines out of deltas; people-terms: learner / Senior Learner / sessions.
- Secrets: Authorization: Bearer header, never secret-in-URL. Autosave hook commits "wip" in worktrees — soft-reset to merge-base, one clean commit before push. Dev server only from a jicate/main worktree with the REAL service-role key from .env.production.local.

KEY FILES TO READ FIRST:
- /Users/omm/PROJECTS/MyJKKN/progress.txt (top entry = this session; tasks 1–6 there mirror this brief)
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_loop_zero_rupee_migration.md (authoritative flip state — read 07-15→07-18 dated sections)
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/feedback_maxlane_drain_stale_lock_wedge_looks_like_dead_box.md (drain-silent diagnosis protocol)
- /Users/omm/PROJECTS/MyJKKN/.claude/scratch/windows-drain-restart-checklist.md (restart protocol if drain wedges)
- Cron routes + lane helper off jicate/main: git show jicate/main:lib/services/platform/ai-jobs-lane.ts and jicate/main:app/api/cron/curriculum-lesson-spine-generate/route.ts (defer-guard + collect pattern reference)

KEY DECISIONS MADE THIS SESSION (Director-locked — do NOT re-open):
- Twins off NOW rather than a 2-week overlap: every cron route's guard is `lane==='direct' && shouldDeferToMaxLane` → with policy='jobs' the route drives the lane itself; defer path is dead code (verified per-route). Rollback = re-enable the 6 rows and/or policy→'direct'.
- learner-notes ToS hold LIFTED — flipped to 'jobs' with the rest.
- Pager KEEP as-is (scoping to schedulable types is correct); retire only in the cleanup PR.
- Strip renders amber-unreadable on failed reads — never fake green.
- Chip links land on evidence PAGES, not pre-filtered rows (destinations lack filter params — deliberate cut, now the P2).
- Transient claude.exe ETIMEDOUT self-heals: errored job stays 'error', next cron cycle re-selects the work — no intervention unless FREQUENT. probe_verdict: healthy.

APPROACH: Sequential. Morning check first, every session, before anything else. Watch-and-coordinate weeks — build only the cleanup PR (and only after the quiet bar + Director go). Anything shipped goes via jicate/main worktree + PR + Director merge + /deploy-myjkkn. Batch independent read-only checks in one message; wait states use Monitor/background, not polling.

QUALITY BAR (measurable): each day's verdict backed by pasted SQL output, never assumption — due·ran equal per cadence, stuck=0, errors=0 (bug.triage excepted until fixed, then 0 absolute), spend=₹0.00, paid_calls=0. Strip GREEN claim requires a persona-harness screenshot with a human eyeball. Cleanup PR only after 14 consecutive clean days AND explicit Director go; post-merge proof by content (git ls-tree jicate/main), not PR state.

DO NOT:
- Re-apply the 6 flip migrations (20260713140000–190000 — applied + recorded) or redo the carrier reconciliation (done, historical).
- Touch maxlane:chat-drain / poller-heartbeat / admission-* / ai-pulse-* / overnight-* / work-pulse-analyze schedules — not part of this flip.
- Fix bug.triage routing yourself, or build in the work-signals/meetings/appraisal lanes — coordinate only.
- Re-open Director-locked decisions above; blind-redeploy on a single error (check self-heal first); treat weekly loops' zero-enqueue days or "generated 0" enqueue-day statuses as failures.
- Bulk-approve the 1,035 drafts without the Director's decision (and read the shadow-judge verdicts first).
- Use the browser-use jkkn-ai session (dead, 4 timeouts across 3 days) — persona harness only.

VERIFY BY (post-execution):
- Daily: morning-check SQL batch output pasted with the verdict line.
- After the sibling bug.triage fix: 24h ai_jobs shows 0 bug.triage errors + strip screenshot GREEN (eyeballed).
- After cleanup PR: Director merged; git ls-tree jicate/main confirms the pager tail removed; select count(*) from ai_routine_schedules where routine_id in (<6 twin ids>) → 0 (if rows deleted) or all enabled=false untouched (if kept disabled — per Director's scope choice); /deploy-myjkkn endpoint checks pass; next morning check still fully clean at ₹0.
