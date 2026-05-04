TASK: Browser-verify the 4 user-facing PRs (#518 category filter, #520 RLS lockdown, #512/#513 click-through) shipped this session against authed Director on production https://www.jkkn.ai. Drive Director's normal Chrome (port 9222), NOT CFT on 9226 (CFT only holds localhost cookies). Capture screenshots, log a one-line entry per verified PR in progress.txt, then descend the P1/P2 task list.
PROJECT: /Users/omm/PROJECTS/MyJKKN
DATABASE: kvizhngldtiuufknvehv (production, .env.local at /Users/omm/PROJECTS/MyJKKN/.env.local)
SPEC: (none specific — `specs/chat-bypass-workflow-gravity.md` referenced only if events work resumes)
PROGRESS: /Users/omm/PROJECTS/MyJKKN/progress.txt

CURRENT STATE (as of brief-write time):
- Branch (canonical pane state): `feat/sentry-leverage-lane2` (concurrent-session-set; my work all on remote branches and merged)
- Prod deployment `my-jkkn-jyp1q3ebq` Ready, 6m duration — all 4 user-facing PRs included.
- 6 bugs closed across 5 PRs: #517 closed (superseded by #520), #518 merged, #519 merged, #520 merged, #512 + #513 merged.
- Open PRs from concurrent sessions: #528 (counselor taxonomy Phase 1), #529 (menu-permissions baseline cleanup) — not mine.
- pm2 myjkkn-dev running on 3104; MyJKKN-verify second clone exists at /Users/omm/PROJECTS/MyJKKN-verify on 3105.
- 3 new memory entries this session: feedback_concurrent_session_race_atomic_commit, reference_verify_tree_pattern, feedback_security_incident_apply_to_prod_first.
- Empirical receipts on prod: RLS lockdown verified (11,150 rows → 2 for non-super_admin); 5 RLS policies live; `fn_notification_is_for_user` live; `?category=dashboard:approval` parses correctly; HTTP probes 200/307 across all 5 endpoints.

## VERIFY CURRENT STATE
- `~/.claude/scripts/myjkkn-up.sh status` — one-line dev-runtime sanity (pm2 + 3104 + CFT 9226).
- `cd /Users/omm/PROJECTS/MyJKKN && vercel ls my-jkkn --scope jicate-solutions | head -3` — confirm latest prod still Ready (chain `cd` per CLAUDE.md cwd-aware-CLI rule).
- `curl -s -o /dev/null -w "%{http_code}\n" https://www.jkkn.ai/`, `https://www.jkkn.ai/admin/notifications`, `https://www.jkkn.ai/admin/notifications?category=dashboard:approval`, `https://www.jkkn.ai/auth/login`, `https://www.jkkn.ai/events/propose` — quick prod HTTP probes (expect 200/307).
- `gh pr list --repo Jicate-Solutions/MyJKKN --author @me --state open` — confirm 0 of my own in-flight PRs.
- `git --git-dir=/Users/omm/PROJECTS/MyJKKN/.git log -3 --oneline jicate/main` — confirm jicate/main carries the 4 merged PRs.
- If any check fails or differs from expected → STOP and report drift; do NOT execute downstream tasks.

## NEXT TASKS
1. [P0] Browser-verify the 4 merged PRs against authed Director session on prod (~10–15 min). Use Director's normal Chrome on port 9222 (NOT CFT 9226 — CFT only has localhost cookies; jkkn.ai prod auth lives in the daily Chrome). Sequence: `https://www.jkkn.ai/admin/notifications?category=dashboard:approval` → confirm only `dashboard:approval` items render (Bug A+#518 working post-deploy) → confirm NO Sunday Wrap cards on the Approval queue (Bug C+A working) → confirm Director still sees firehose count at top stats (governance preserved by RLS super_admin policy) → click any queue card with `action_config.url` set → confirm landing on the entity page (#512/#513 working). Save 2–3 screenshots; write a one-line entry per verified PR into `/Users/omm/PROJECTS/MyJKKN/progress.txt`.
2. [P1] Find the actual sunday-wrap card rendering component on `/admin/notifications` (~30 min). PR #512 patched `notification-card.tsx` but this surface uses a different component — Sunday Wrap cards still render as `<div>`, not `<a>`. Run `grep -rn "Sunday Wrap\|sunday-wrap\|doctrines:sunday" "/Users/omm/PROJECTS/MyJKKN/app/(routes)/admin/notifications" "/Users/omm/PROJECTS/MyJKKN/components"`. Apply the same `cardHref = action_config.url ?? <fallback>` pattern. Atomic commit-after-Edit per memory `feedback_concurrent_session_race_atomic_commit.md`.
3. [P1] Deeper local-auth.sh fix (~20 min). PR #519's hash-fragment encoding helps the bare path, but Supabase still strict-matches `?next=<path>` because `redirect_to#next=...` includes the fragment in allow-list match. Two paths: (a) drop next-encoding entirely (let dev-login default to `/`), or (b) localStorage handoff before redirect. Direct admin-API workaround remains the reliable fallback — stays as documented escape hatch.
4. [P2] Review concurrent-session PRs #528 (counselor taxonomy Phase 1) + #529 (menu-permissions baseline cleanup) read-only. Confirm zero file overlap with the queue/notifications work just landed. Decide whether to take ownership or leave for whichever concurrent session opened them.

CONSTRAINTS & RULES:
- Per `feedback_concurrent_session_race_atomic_commit.md` — atomic commit-after-Edit mandatory on shared MyJKKN working tree; concurrent sessions still active.
- Per `reference_verify_tree_pattern.md` — `/Users/omm/PROJECTS/MyJKKN-verify` (port 3105) is the race-free integration-test surface; auth-flow is allow-listed for `localhost:3104` only — to verify on 3105 cleanly, stop pm2 myjkkn-dev briefly OR add 3105 to Supabase allow-list.
- Per `feedback_security_incident_apply_to_prod_first.md` — RLS / auth fixes apply to prod via Supabase MCP first; source PR follows for git parity.
- Per CLAUDE.md global rule #2 — never mark "done" without browser-test (this session's P0 is the test).
- Per CLAUDE.md global rule #15 — production verification = `git show jicate/main:file` OR `curl https://www.jkkn.ai/`. NEVER from /tmp, local worktrees, or memory.
- Per CLAUDE.md project rule #1 — three-remote routing: canonical fork is `jicate` (Jicate-Solutions/MyJKKN). NEVER push to `origin`.
- Per `feedback_vercel_cli_cwd_resolution.md` — chain `cd target && vercel <cmd>` in single Bash call (harness resets cwd between calls).
- Per `feedback_browser_tabs_persist_no_autoclose.md` — never call `tabs_close_mcp` without explicit user instruction.
- DO NOT use `git worktree` (CLAUDE.md prohibits — use second clone /Users/omm/PROJECTS/MyJKKN-verify pattern instead).
- DO NOT auto-trigger any push notifications, Telegram, WhatsApp, or Google Chat.

KEY FILES TO READ FIRST:
- `/Users/omm/PROJECTS/MyJKKN/.claude/sessions/6e94bf35.md` — full session body with PR numbers, empirical evidence, lessons, and verbatim Director carry-forwards.
- `/Users/omm/PROJECTS/MyJKKN/progress.txt` — one-line pointer index for cross-pane awareness.
- `/Users/omm/.claude/dev-ports.json` — port ledger (3104 dev, 9226 CFT, 3105 verify); read BEFORE probing ports.
- `/Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/MEMORY.md` — top 3 entries are this session's; the concurrent-session-race rule is highest leverage.
- `/Users/omm/PROJECTS/MyJKKN/CLAUDE.md` — project rules incl. three-remote routing, Vercel env-add gotchas, Supabase pgcrypto trap.
- `/Users/omm/.claude/CLAUDE.md` — 23 global rules + Co-Pilot Behavior; rules #2 (browser-test required), #11 (verify edits), #15 (prod = live source), #22 (stay in scope), #23 (simplest first) all relevant.

## KEY DECISIONS
- Closed PR #517 as superseded by PR #520 because #520 carries everything #517 has plus the `fn_notification_is_for_user` helper that replaces #517's verbose OR-clause. Single PR landed cleaner than double-merge.
- Applied Bug C (RLS lockdown) to prod via Supabase MCP IMMEDIATELY rather than wait for PR review. Director directive: leak doesn't wait for review. Source-PR (#520) followed for git parity. Captured as memory rule.
- Set up MyJKKN-verify second clone at `/Users/omm/PROJECTS/MyJKKN-verify` (port 3105, pm2 name `myjkkn-verify`) for race-free integration testing. Concurrent sessions block in-place verification on canonical tree. Captured as reference memory.
- Hash-fragment encoding for `next-path` in local-auth.sh + companion dev-login reader. Imperfect (Supabase still strict-matches in some paths) but good for the bare path. Documented as deferred follow-up.
- pm2 supervision for `myjkkn-dev` (vs nohup or systemd) because pm2's restart + log + status surface integrates with the new `myjkkn-up.sh` diagnostic.
- Did NOT browser-verify PRs against prod from THIS pane because Chrome-for-Testing on 9226 only holds localhost cookies; jkkn.ai prod auth lives in Director's daily Chrome which CDP can't drive. Manual eyeball-verify on prod is Director-side via port 9222 — explicit follow-up shipped to next session as P0.

APPROACH:
- Phase 1 (5 min): VERIFY CURRENT STATE — runtime sanity, prod still Ready, no drift.
- Phase 2 (10–15 min): Director-side prod browser-verify (P0). Drive port 9222 (Director's daily Chrome). Capture screenshots. Log one-line entry per PR in progress.txt.
- Phase 3 (rest of session): Pick from P1/P2 by priority. P1 sunday-wrap component fix likely highest leverage (drops a remaining click-target gap).

QUALITY BAR:
- Browser-verify produces a screenshot path + 1-paragraph note in `/Users/omm/PROJECTS/MyJKKN/progress.txt` for each verified PR.
- Any new fix follows atomic commit-after-Edit (mandatory per memory `feedback_concurrent_session_race_atomic_commit.md`) — never leave an uncommitted Edit on the canonical tree while another concurrent session can switch branches.
- Sunday-wrap fix (if shipped) re-runs the click-target test against prod after deploy and writes verification to progress.txt.

DO NOT:
- DO NOT skip the browser-verify P0 — that was Director's verbatim ask at /cnext.
- DO NOT touch source files until prod verification establishes ground truth — verify FIRST, modify SECOND.
- DO NOT spawn parallel source-touching agents on the canonical `/Users/omm/PROJECTS/MyJKKN` tree without atomic-commit-after-Edit (per memory rule).
- DO NOT use `git worktree` (CLAUDE.md global prohibits — use the MyJKKN-verify clone pattern instead).
- DO NOT auto-trigger any push notifications, Telegram, WhatsApp, or Google Chat replies on Director's behalf.
- DO NOT run browser automation through CFT 9226 against prod jkkn.ai — CFT only holds localhost cookies; use Director's daily Chrome (port 9222) for any prod-authed click-test.

VERIFY BY (post-execution):
- Each verified PR has a one-line entry in `/Users/omm/PROJECTS/MyJKKN/progress.txt` with screenshot path.
- If sunday-wrap card fix lands, re-run the click-target test against prod after deploy and append result to progress.txt.
