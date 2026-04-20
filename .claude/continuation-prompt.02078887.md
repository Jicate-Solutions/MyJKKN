TASK: Omm's verbatim P0 for next session is "enitre solutions hub module" (typo of "entire"). This is genuinely ambiguous because Solutions Hub already shipped to production 5 days ago (PR #162 merged 2026-04-14, RDIF runtime fix PR #164 merged 2026-04-15) — 32 pages, 122 API routes, 31 services, 41 sh_* tables all LIVE on prod. "Entire solutions hub module" could plausibly mean any of: (a) post-ship health audit / regression sweep across all 32 pages, (b) continue Compliance Unification Program PRs A9-A15 (10/15 merged, 5 pending), (c) new scope expansion (new product/feature inside Solutions Hub), (d) a specific bug or issue Omm has noticed in the live module, or (e) something else. BEFORE doing significant work, the next session MUST ask Omm to disambiguate — use AskUserQuestion with these 5 interpretations. Do NOT assume "rebuild from scratch" — the module shipped 5 days ago.

PROJECT: /Users/omm/PROJECTS/MyJKKN
DATABASE: Supabase prod project ref kvizhngldtiuufknvehv (creds in /Users/omm/PROJECTS/MyJKKN/.env.local)
SPEC: /Users/omm/PROJECTS/MyJKKN/specs/one-jkkn-one-data/unification-program/MASTER-PLAN.md
PROGRESS: /Users/omm/PROJECTS/MyJKKN/progress.txt

CURRENT STATE (as of 2026-04-20 brief-write time):
- Solutions Hub module LIVE on production since 2026-04-14 (PR #162). RDIF runtime fix PR #164 merged 2026-04-15. 32 pages, 122 API routes, 31 services, 27 hooks, 62 components, 41 sh_* tables all live on prod Supabase. 11 DB migrations applied. sh_documents bucket + 5 new roles seeded. 27/27 button actions previously verified in browser via proper PointerEvent methodology.
- Compliance Unification Program: 10/15 PRs merged through 2026-04-17. PRs A1, A2, A2 c2, A3, A4, A5, A7, A11 confirmed merged; PR-A8 c1 (#236) was OPEN at 2026-04-17 session end. PRs A6, A8 c2, A9, A10, A12, A13, A14, A15 still pending per master plan.
- Active branch: feat/events-module. Open PR #244: academic/timetables 23-bug sweep.
- Other live workstreams: permissions-audit dashboard tabs (just shipped Role→Modules + Unified Map + Simulator), auth FK fix for super-admin gate (b3e75d890), telephony Fix 3 Monday handoff package.
- Last commit: b3e75d890 fix(auth): disambiguate profiles↔institutions FK join (unblocks super-admin gate).
- Exotel telephony: webhooks SILENT since 2026-04-11 05:55 UTC (8.5+ days zero events). PRIMARY DIAGNOSIS REQUIRED before any further telephony work — do NOT send "outbound is fixed" message until test call lands in DB.

VERIFY CURRENT STATE (run BEFORE any work — state may have drifted in 5 days; memory is point-in-time):
- `git fetch jicate && git log --oneline jicate/main -20` — see what merged after 2026-04-15
- `gh pr list --repo Jicate-Solutions/MyJKKN --state open --limit 30` — currently-open PRs (including #244 timetables, #236 PR-A8 c1 if still open)
- `gh pr list --repo Jicate-Solutions/MyJKKN --state merged --limit 20 --search "in:title solutions OR accreditation OR unification"` — Solutions Hub or Unification PRs merged in last 5 days
- `git ls-tree jicate/main app/api/solutions | wc -l` — count Solutions Hub API routes still live (expect ~122)
- `git ls-tree jicate/main app/\(routes\)/solutions -r | wc -l` — count Solutions Hub pages (expect ~106)
- `curl -sI https://www.jkkn.ai/solutions` — confirm Solutions Hub still responds
- **If reality differs from this brief → STOP, report to Omm, do NOT execute the stale plan.**

WHAT NEEDS TO HAPPEN:
1. **FIRST: Greet Omm, then ask him to disambiguate "entire solutions hub module"** via AskUserQuestion with these 5 interpretations:
   - (a) Health audit / regression sweep across all 32 pages — Solutions Hub shipped 5 days ago, verify nothing broke in production
   - (b) Continue Compliance Unification Program PRs A9-A15 (10/15 merged, 5 still pending per `specs/one-jkkn-one-data/unification-program/MASTER-PLAN.md`)
   - (c) New scope expansion — new product, new feature inside Solutions Hub
   - (d) Specific bug or issue Omm has noticed in the live module
   - (e) Something else — let Omm describe
2. Once disambiguated, run the production-code sweep MANDATED by CLAUDE.md (5+ domain keywords across `git ls-tree jicate/main` + `gh pr list`) BEFORE proposing any plan. This is non-negotiable per `feedback_preflight_must_scan_production_code.md` (caught 5 scope failures in one session 2026-04-17 when the rule was memory-only).
3. Output sweep results in the SAME response as the proposed plan.
4. Execute per scope. If (b) Unification PRs A9-A15: read `specs/one-jkkn-one-data/unification-program/MASTER-PLAN.md` for next PR in sequence (A9 NIRF dashboard or wherever the merge log left off after verifying #236 PR-A8 c1 status).

CONSTRAINTS & RULES:
- **JKKN = 8 colleges** (5 Autonomous: Dental, Pharmacy, Allied Health, Nursing, Engineering + 3 Affiliated: A&S Aided, A&S Self, Education). NOT 6. institution_type enum = `autonomous|aided|self`.
- **Cricket is BANNED** — never include in any sports list/dropdown.
- **Production-code sweep mandatory** before ANY plan: `git ls-tree jicate/main -r --name-only | grep -iE "(kw1|kw2|kw3|syn1|syn2)"` + `gh pr list` with 5+ domain keywords. Plan without sweep = invalid plan.
- **Production repo = Jicate-Solutions/MyJKKN** (jicate remote), NOT JKKN-Institutions/MyJKKN (origin).
- **Never deploy local** — always PR to Jicate-Solutions/MyJKKN, user merges, then trigger Vercel deploy hook.
- **Never merge PRs** — even with bypass perms, even on urgent timelines, create PR and STOP. User merges manually.
- **Verify production from live source** (`git show jicate/main:file` or `curl https://www.jkkn.ai/`) — NEVER from /tmp clones, local worktrees, or memory.
- **Commit after EVERY file Write** — working tree is hostile (auto-save + branch-reset cycles silently wipe untracked files; lost ~1100 LOC of Sprint 6 this way).
- **Radix UI verification protocol** (saved 2026-04-15): Use universal dispatcher (`PointerEvent('pointerdown')` + `MouseEvent('mousedown')` + `PointerEvent('pointerup')` + `MouseEvent('mouseup')` + `MouseEvent('click')`) scoped to `main`. Synthetic `.click()` does NOT trigger Radix.
- **Browser testing**: cdp.py is primary, browser-use is fallback. Use `~/.claude/scripts/chrome-launch.sh <session> <port>` then `python3 ~/.claude/scripts/cdp.py <cmd>`.
- **Compliance work is body-agnostic**: substrate covers all 10 bodies (NAAC + NIRF + NBA + QS + DCI + PCI + INC + AICTE + NCTE + UGC). NAAC is first implementation, not framework. Director-locked 2026-04-17.
- **Supabase MCP points to PRODUCTION** (kvizhngldtiuufknvehv), not staging. Every migration must be idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, `WHERE col IS NULL`).
- **Sequential is safer than parallel** for critical-path Unification work — user prefers one PR after another to avoid types-first + fresh-eyes coordination overhead.

KEY FILES TO READ FIRST:
- /Users/omm/PROJECTS/MyJKKN/CLAUDE.md — project rules including the production-code sweep mandate
- /Users/omm/PROJECTS/MyJKKN/progress.txt — full session history (this session's entry is at top)
- /Users/omm/PROJECTS/MyJKKN/specs/one-jkkn-one-data/unification-program/MASTER-PLAN.md — the active 15-PR plan (only if scope is Unification)
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/feedback_preflight_must_scan_production_code.md — the sticky rule
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/feedback_radix_synthetic_click.md — browser-test protocol
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_compliance_unification_program_active.md — Unification context
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_production_repo_change.md — Jicate-Solutions vs JKKN-Institutions

APPROACH:
1. Greet Omm. Use AskUserQuestion to show him the 5 interpretations of "entire solutions hub module" and ask him to pick one.
2. Once picked, run the production-code sweep with relevant keywords (e.g., for Solutions Hub: `solutions|sh_|client_portal|rdif|brief|workshop|sprint`). Output sweep results in the same response as your plan.
3. Propose a focused plan. Get approval. Execute.
4. If Omm picks (a) health audit: spawn parallel subagents — one per page-cluster — to click-test all 32 Solutions Hub pages using the Radix universal dispatcher protocol scoped to `main`. Aggregate findings into a single audit report with file-listing of pass/fail per page × per action.
5. If Omm picks (b) Unification: first verify whether PR #236 (PR-A8 c1) merged. If yes, next is PR-A8 c2 (committees CRUD + DCF export + surveys consent) or PR-A9 (NIRF dashboard). Read MASTER-PLAN.md for current sequence position, spec it, build it, PR it.
6. If (c)/(d)/(e): interview Omm for scope, then route to the right skill (myjkkn-module for new features, bug for specific issues).

QUALITY BAR:
- No "done" claim without browser proof or curl proof against live production.
- No plan without production-code sweep output in the same response.
- No tool calls before disambiguating the user's intent (other than reading the key files above).
- All paths absolute. All claims verified against jicate/main, not memory (memory is 3+ days old).

DO NOT:
- DO NOT assume "entire solutions hub module" means "rebuild from scratch" — it shipped 5 days ago, 32 pages live.
- DO NOT skip the production-code sweep before proposing a plan — caught 5 scope failures in one session when this rule was memory-only.
- DO NOT merge any PR — user merges, always.
- DO NOT trust memory files about module state without verifying against live `git ls-tree jicate/main`.
- DO NOT execute work on the wrong branch — current branch is feat/events-module, not main. Create a fresh worktree off jicate/main for any Unification PR.
- DO NOT touch telephony "outbound is fixed" messaging until Exotel pipe is verified delivering webhooks again (silent since Apr 11).

VERIFY BY (post-execution):
- Whatever Omm picks: prove the deliverable exists in jicate/main (or as an open PR to Jicate-Solutions/MyJKKN).
- For (a) health audit: report file listing all 32 pages × all clickable actions × pass/fail status, generated via Radix universal dispatcher in browser.
- For (b) Unification PR: PR number + URL + screenshot of Vercel build green + confirmation user-merged before any deploy hook fires.
- For (c)/(d): per-feature acceptance criteria met + browser proof on live URL.
- Update /Users/omm/PROJECTS/MyJKKN/progress.txt with what shipped + commit before ending session.
