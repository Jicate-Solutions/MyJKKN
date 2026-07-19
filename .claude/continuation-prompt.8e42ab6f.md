TASK: Ship-and-verify lane FIRST, then the learner-notes unblock — the Director's exact words: "Both, in that order." (1) Get PR #2179 (SCF free-text carry-forward, rebased onto latest jicate/main, mergeable recomputing at brief-write) and PR #2178 (Help FAB removed from 5 public surfaces, CI green) merged BY THE DIRECTOR, fire the Vercel deploy hook via /deploy-myjkkn (merge-queue merges do NOT auto-build), run post-deploy checks, and complete MONDAY's live-verify: the first real learners with open free-text concerns hit their next same-course check-in and the dialog must render per-concern Yes/Partly/No re-asks in their own words, store answers structured + `[freetext-carry …]` markers, show the corrected "you flagged these as missing:" banner, and show the facilitator counts card only at the ≥3-learner floor — screenshot eyeball required. (2) THEN unblock the learner-notes approval queue: 1,135 AI support notes have sat unseen for 16 days behind a super-admin-only gate and ZERO notes have ever reached a learner since the gate shipped Jul 3 — ask the Director (AskUserQuestion) which role owns the queue, widen the `/admin/learner-notes` page + `fn_scf_learner_notes_pending`/review fn gates to that role, expire stale drafts (approve-review current week only), and arm a pending>3-days alert. Nothing dropped — "carry it all" (weekly false-carry sample is the trailing P2).

PROJECT: /Users/omm/PROJECTS/MyJKKN (working worktree: /Users/omm/PROJECTS/MyJKKN/.claude/worktrees/scf-filters, branch feat/scf-freetext-carryforward; repo-root branch feat/campus-living-fee-compute-engine is docs-only — never ship from it)
DATABASE: Supabase prod ref kvizhngldtiuufknvehv. Env: /Users/omm/PROJECTS/MyJKKN/.env.production.local (values carry a literal \n suffix — strip before curl; never echo secrets), /Users/omm/PROJECTS/MyJKKN/.env.local for anon. Mgmt API token: /Users/omm/.supabase/access-token (curl only).
SPEC: /Users/omm/PROJECTS/MyJKKN/specs/scf-freetext-carryforward-2026-07-19.md (the 9 Director decisions — de-facto must-read)
PROGRESS: /Users/omm/PROJECTS/MyJKKN/progress.txt (top entry = this session)

CURRENT STATE (as of brief-write time):
- PR #2179 (FTC): OPEN, rebased clean onto latest jicate/main after a CONFLICTING episode (SQL_FILE_INDEX/route-manifest append race), Director-confirmed force-update done, mergeable recomputing + CI re-running. Includes the decision-9 banner-copy fix ("you flagged these as missing: X").
- PR #2178 (Help FAB off 5 public surfaces, 7-line diff to the existing HIDDEN_PREFIXES list): OPEN, CI green.
- DB already LIVE on prod (migration 20260719090000, aborted-txn-probed then applied): scf_freetext_carry table (deny-all RLS) + 4 fns + fn_scf_carryforward_for_learner extended from the VERBATIM live prod def + job type scf.freetext_carry (interactive=false, ₹0) + 3 platform_policies rows incl. kill switch scf.freetext_carry.enabled. Only the CODE (cron route, dialog, counts card) waits on merge+deploy.
- Loop PROVEN pre-merge on 150 real texts (one text correctly split into TWO concerns; generic praise → none). ~130 classification jobs still draining on the Max lane — the FIRST deployed nightly cron run collects them; leftovers harmless. DO NOT touch them.
- Learner-notes lane still DARK: 1,135 drafts, super-admin-only, owner role UNDECIDED — deliberately deferred behind the Director's decision.
- All 8 interview decisions were RE-CONFIRMED unchanged in a second Director interview (first submission accidental); decision 9 added.

VERIFY CURRENT STATE (run BEFORE any work — read-only; if reality differs from this brief → STOP, report, do NOT execute the stale plan):
- `gh pr view 2179 --repo Jicate-Solutions/MyJKKN --json state,mergeable,baseRefName,mergeCommit` and same for 2178. If MERGED: verify baseRefName=main AND check by CONTENT — squash merges are NOT ancestors: `git -C /Users/omm/PROJECTS/MyJKKN fetch jicate main && git -C /Users/omm/PROJECTS/MyJKKN ls-tree jicate/main -r --name-only | grep -E "scf-freetext-carry|20260719090000"` proves the files landed.
- `git -C /Users/omm/PROJECTS/MyJKKN log jicate/main --oneline | head -10`
- Prod up: `curl -s -o /dev/null -w "%{http_code}" https://www.jkkn.ai/` → 200.
- Data state via Mgmt API curl (token file above): `select count(*) from scf_freetext_carry;` and `select status, count(*) from ai_jobs where job_type='scf.freetext_carry' group by status;` — expect collected rows growing / drained jobs shrinking.
- Production sweep reminder: before ANY new build plan this session (e.g. the learner-notes widening), run the mandatory sweep (`git ls-tree jicate/main -r --name-only | grep -iE "learner.notes|scf|note|approv"` + `gh pr list … --limit 30`) — plan without sweep = invalid.

WHAT NEEDS TO HAPPEN:
1. Confirm merges — the DIRECTOR merges #2179 and #2178; NEVER self-merge. If mergeable went stale again (shared-append files rot fast), re-rebase before asking.
2. Deploy via /deploy-myjkkn on a fresh explicit Director "deploy" — merge-queue does NOT fire Vercel auto-builds; the hook builds latest main (~12 min). Deploy ships CODE only; the migration is already applied.
3. Post-deploy checks: anon `curl https://www.jkkn.ai/proof/<random-token>` still dark (and no Help FAB on it once #2178 lands); first nightly scf-freetext-carry cron (22:07 UTC in vercel.json) collects the ~130 drained jobs — you may also trigger `/api/cron/scf-freetext-carry` once with CRON_SECRET from .env.production.local instead of waiting; then SQL-verify scf_freetext_carry row growth.
4. MONDAY live-verify (the wait-state — use a Monitor, not polling): a learner with an open concern hits their next same-course session → re-ask renders with per-concern Yes/Partly/No (≤3) + praise ack; answer lands structured via fn_scf_answer_freetext_carry AND as a `[freetext-carry …]` marker; banner reads "you flagged these as missing: …"; facilitator counts card renders ONLY when ≥3 distinct learners have active carries (probe the floor both sides). Screenshot + human eyeball (Visual Artifact Gate).
5. Learner-notes unblock (ONLY after lane 1 is done): AskUserQuestion to the Director — which role owns the queue? Then: widen the /admin/learner-notes page gate + fn_scf_learner_notes_pending/review SECDEF fns to that role (show SQL first, SECDEF template), expire stale drafts so approval-review covers the current week only, add a pending>3-days alert (reuse the exam-audit alert pattern).
6. [P2] Weekly false-carry spot sample: 20 items once a week of data accrues; >10% misclassified as concern → tighten the classification prompt.

CONSTRAINTS & RULES:
- Terminology gate is BLOCKING and delta-based: learners / Senior Learners / sessions / team members — no student/staff/faculty/classes literals in added quoted lines (identifier-context + generated files exempt).
- SECDEF template mandatory: `REVOKE EXECUTE … FROM anon, PUBLIC; GRANT … TO authenticated;` + self-scoping inside the fn body. Show SQL before applying; apply via Mgmt API curl.
- Never push omm-dev. Push feature branches to the `jicate` remote (origin is a dummy/wrong repo). Director merges — NEVER self-merge. Force-push needs explicit user confirmation (guard hook; user-confirmed manual-lease + `+refspec` form worked this session).
- Autosave hook commits "wip" in worktrees — `git reset --soft` to merge-base, then ONE clean commit before push.
- Dev server ONLY from a jicate/main worktree with the REAL SUPABASE_SERVICE_ROLE_KEY from .env.production.local (placeholder bounces every login).
- Full-repo tsc OOMs (vacuous green) — use a scoped tsconfig with a files list from inside the worktree.
- Config changes = platform_policies rows. Kill switch: scf.freetext_carry.enabled. Brand green #0b6d41.
- CI SKIPS TypeCheck/terminology/reachability on DRAFT PRs — self-gate locally before marking ready.
- Anonymity boundary: feedback CONTENT never reaches Senior Learners — counts only, ≥3 floor; learner's summarized words render only inside their own dialog.

KEY FILES TO READ FIRST:
- /Users/omm/PROJECTS/MyJKKN/specs/scf-freetext-carryforward-2026-07-19.md (the 9 decisions)
- /Users/omm/PROJECTS/MyJKKN/.claude/worktrees/scf-filters/supabase/migrations/20260719090000_scf_freetext_carryforward.sql (already applied — reference for fn names/grants)
- /Users/omm/PROJECTS/MyJKKN/.claude/worktrees/scf-filters/app/api/cron/scf-freetext-carry/route.ts (nightly enqueue+collect)
- /Users/omm/PROJECTS/MyJKKN/.claude/worktrees/scf-filters/app/(routes)/learners/class-feedback/_components/feedback-dialog.tsx (re-ask UI + banner fix)
- /Users/omm/PROJECTS/MyJKKN/app/api/cron/scf-learner-notes/route.ts (for the queue unblock — read off jicate/main if absent locally)
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_scf_freetext_carryforward.md

KEY DECISIONS MADE THIS SESSION (with rationale):
- 9 interview decisions, Director-locked and RE-CONFIRMED 8/8 on re-ask: problems+praise carry; person-mentions treated like any concern; checklist-persistence rule (answered-once, 30-day fade); learner + anonymous Senior-Learner counts; ≥3-learner floor; one question per concern cap 3; AI-not-ready = skip silently (never a template, never a raw quote); concern carries even off a 5/Clear rating; decision 9 = banner copy fixed to "you flagged these as missing: …". Do NOT re-open any of these.
- Verbatim-fn-def rule: fetch pg_get_functiondef IN FULL and diff — a partial-sight rebuild caused 4 silent drifts this session.
- Track-both answers (structured rows + free_text markers) so existing marker analysis never regresses.
- Learner-notes fix deliberately deferred behind the Director's owner-role decision — do not bulk-approve or widen gates before that answer. probe_verdict: healthy.

APPROACH: Sequential — lane 1 fully done before lane 2. The wait states (Director merges, Monday sessions, cron run) are Monitor/background-watch states, not polling loops. Batch independent read-only checks in one message.

QUALITY BAR (measurable): both PRs' content on main by ls-tree; deploy fingerprint changed; first cron run collects >0 items (SQL count grows); Monday re-ask screenshot eyeballed showing per-concern Yes/Partly/No + corrected banner; counts-card floor probed both sides of 3; learner-notes gate widened + alert armed ONLY after the Director names the role, with SQL shown first.

DO NOT: self-merge or deploy without a fresh Director word; re-open the 9 decided questions; show free-text CONTENT to Senior Learners (counts only, ≥3 floor); auto-approve learner notes in bulk without the Director's owner decision; enable anything for vsr sharing (vsr.sharing_enabled stays OFF); touch the ~130 draining jobs (first deployed cron collects them).

VERIFY BY (post-execution):
1. Merges: `gh pr view 2179 --json state,baseRefName` = MERGED/main + `git ls-tree jicate/main -r --name-only | grep scf-freetext-carry` non-empty (same for 2178's FAB file).
2. Deploy: /deploy-myjkkn endpoint checks pass; `curl -s https://www.jkkn.ai/ -o /dev/null -w "%{http_code}"` = 200; static-chunk fingerprint changed.
3. Cron: Mgmt API `select count(*) from scf_freetext_carry` grew after the run; ai_jobs drained-jobs collected.
4. Monday: dialog re-ask screenshot saved + eyeballed; answer row has answer/answered_at + `[freetext-carry …]` marker; counts card absent at <3 learners, present at ≥3.
5. Learner-notes: as the newly-gated role (jwt-claims rolled-back txn) fn_scf_learner_notes_pending returns rows; stale drafts expired; alert fires on a >3-day pending seed row.
