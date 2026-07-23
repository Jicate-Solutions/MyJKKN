TASK: Next session runs TWO parallel streams simultaneously. Stream A (Mac Claude alone): check that DRAFT PRs #762, #763, #764 (Phase 1 substrate for Evolis→MyJKKN ID-card integration) are still merge-clean after 2+ months of `jicate/main` drift since they were opened 2026-05-10, then walk Director through migration approval and merge in order. Stream B (Mac Claude composes → Director shuttles to Windows Claude on JKKN AI-Max box): produce paste-ready command blocks starting with Python 3.8+ check and `pip install Evolis-SDK`, iterate through printer discovery test, test-card send, ~50 LOC `evolis_bridge.py` polling script, `nssm` Windows Service registration, `AGENT_PRINT_TOKEN` env var setup (Windows AND Vercel), and E2E test with a real MyJKKN print job. Both streams progress at the same time — Mac Claude context-switches between them; Stream B's early blocks can run while Stream A checks merge-cleanness.

PROJECT: /Users/omm/PROJECTS/MyJKKN
DATABASE: Supabase project ref `kvizhngldtiuufknvehv` (production; MyJKKN is prod-only, no staging DB); creds in /Users/omm/PROJECTS/MyJKKN/.env.local (anon key only — service_role deliberately unset locally so RLS-bypass writes fail loudly). Migrations apply via `mcp__supabase__apply_migration` (Supabase MCP has full read+write access — show SQL first).
SPEC: no dedicated spec file for Evolis bridge — design lives in memory /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_evolis_python_bridge_locked.md; Phase 1 substrate PRs #762/#763/#764 each embed their own design.
PROGRESS: /Users/omm/PROJECTS/MyJKKN/progress.txt (top entry is 2026-07-22 pane 5d42c851 — this session's end)

CURRENT STATE (as of brief-write time):
- Evolis Primacy 2 → MyJKKN integration: DESIGN LOCKED, install NOT started. Bridge language = **Python** (Evolis-SDK 9.4.1 on PyPI, released Jun 30 2026, official Evolis publisher, ≥ Python 3.8). Bridge host = **existing Windows AI-Max box at JKKN office** (same LAN as printer, always-on, Claude Code with Max subscription already installed — same box that handles Windows Max-lane drain jobs). Direct mode only (paid Evolis Premium Suite rejected).
- Phase 1 substrate: 3 DRAFT PRs pending merge since 2026-05-10 — **#762** (DB: `students.photo_url` col + `id_card_templates` + `id_card_print_jobs` tables + `student-photos` storage bucket + `fn_get_id_card_policy` reader + 11 `platform_policies` seeds + 10 RLS policies; fix-up commit `90a7d255c` corrected `students.profile_id` (nonexistent) → `students.college_email`), **#763** (admin UI: /admin/id-cards/policy + /template + /print-queue; carries unrelated BUG-003898 commit `21bee0e8e`), **#764** (API: 7 endpoints incl. policy GET/PATCH, jobs POST/GET, pickup, result, render stub + typecheck-fix `59a5a6cdc`; needs `AGENT_PRINT_TOKEN` env var set in Vercel before bridge can connect).
- Migrations NOT applied to prod.
- This checkout branch: `feat/campus-living-fee-compute-engine` (NOT next session's work — dirty M/?? files from prior panes; DO NOT commit those).
- Last commit HEAD: `9371f46d0` (this session's progress.txt update, docs-only).

VERIFY CURRENT STATE (run BEFORE any work — state may have drifted):
- `git -C /Users/omm/PROJECTS/MyJKKN log -1 --oneline` — confirm HEAD is 9371f46d0 (or a later commit if another pane pushed)
- `gh pr view 762 --repo Jicate-Solutions/MyJKKN --json state,isDraft,mergeable,mergeStateStatus`
- `gh pr view 763 --repo Jicate-Solutions/MyJKKN --json state,isDraft,mergeable,mergeStateStatus`
- `gh pr view 764 --repo Jicate-Solutions/MyJKKN --json state,isDraft,mergeable,mergeStateStatus`
- Expect state=OPEN, isDraft=true. **If any is MERGED or CLOSED → STOP; the plan changes.** Reality-check against memory file `project_evolis_python_bridge_locked.md`.
- `git status --short` will show the pre-existing M/?? tree from prior panes — IGNORE those, do NOT `git add` them.

WHAT NEEDS TO HAPPEN:

**STREAM A (Mac Claude only — PR merge-cleanness check + merge):**
1. `git fetch jicate main` then for each PR run `git merge-tree $(git merge-base jicate/main <pr-branch>) jicate/main <pr-branch>` to detect conflicts without touching working tree.
2. For each PR classify as **MERGEABLE** (no conflicts), **CONFLICTS** (list files), or **STALE-CODEBASE-ASSUMPTIONS** — verify: (a) PR #757's `SettingsPanel` / `LookupTable` / `CascadeStepList` components still exist at expected `components/` paths (#763 imports them); (b) `platform_policies` seed row format still matches current schema (#762 inserts 11 rows); (c) `students.college_email` column still exists per fix-up `90a7d255c` (#762 depends on it as the profile-join predicate).
3. If all clean → present TIER-1 migration plain-English to Director covering exactly what #762 changes (new column `students.photo_url`, new tables `id_card_templates` + `id_card_print_jobs`, storage bucket `student-photos`, reader fn `fn_get_id_card_policy`, 11 `platform_policies` seeds, 10 RLS policies) → wait for Director approval → apply via `mcp__supabase__apply_migration` → merge order: **762 (DB first) → 764 (API) → 763 (UI)**. Director clicks merge (never self-merge).
4. If dirty → propose rebase plan; do not force-push (push-guard blocks --force).

**STREAM B (Mac Claude composes → Director pastes to Windows Claude → Windows Claude executes → Director pastes result back):**
1. First paste block for Windows Claude — label as `### Paste this to Windows Claude:` in a fenced code block, end with `report back: <specific items>`:
   - Check Python 3.8+ (install if missing via `winget install Python.Python.3.11`)
   - `pip install Evolis-SDK`
   - `python -c "import evolis_sdk; print(evolis_sdk.__version__)"` and `pip show Evolis-SDK`
   - Report back: Python version, SDK version, LICENSE text/file location.
2. Iterate subsequent blocks based on Windows Claude's reports: printer discovery test → send test PNG via SDK → verify physical card ejects → write `evolis_bridge.py` (~50 LOC polling `/api/id-cards/jobs?status=pending` every 5s, uses Ethernet path since both USB+Ethernet plugged in, rate-limit ~1 card/15s = 240/hour under Primacy 2's 280/hour max, hybrid auto-retry-once-then-alert-registrar with human-readable messages like "Ribbon empty — replace and click Retry", priority-jump + batch grouping for admission-week 5+ concurrent bulk-printer scenario) → register as Windows Service via `nssm` → set `AGENT_PRINT_TOKEN` env var on Windows AND in Vercel → E2E test with a real MyJKKN print job from admin UI.

CONSTRAINTS & RULES:
- **Two-Claude paste-shuttle format:** every Windows Claude block must be a single fenced code block labelled `### Paste this to Windows Claude:` and end with an explicit `report back: <items>` so Director knows exactly what to copy back.
- **Route to WINDOWS AI-Max Claude — NOT Linux Server Claude (172.20.15.150).** Linux Server Claude is scoped to PMS/monorepo only per 2026-06-08 correction. Do NOT compose these prompts for Linux.
- **DO NOT run Windows Claude commands from this Mac session** — coordination is via Director paste-shuttle, not direct RPC/SSH.
- **TIER-1 migration protocol:** before applying #762 to prod, show Director plain-English summary of every change; wait for approval; then `mcp__supabase__apply_migration`; then verify via `mcp__supabase__list_tables` and `mcp__supabase__execute_sql`.
- **MyJKKN prod-only rule:** no staging DB; .env.local is production; service_role deliberately unset locally.
- **Rate-limit bridge to ~1 card/15s** (240/hour) — safely under Primacy 2 max 280/hour — for the admission-week 5+ concurrent bulk-printer scenario.
- **git commit hygiene:** explicit pathspec `git commit -m "..." -- <files>` to defeat auto-save hook scope-breach; push by SHA `git push jicate <sha>:refs/heads/<branch>`. Prior-pane dirty tree files (M/??) are NOT this session's — leave them.
- **Auto-merge is prohibited** — Director must click merge on every PR (rules).
- **Visual proof gate:** opt-in via `visual-proof-required` label; not required for these DB/API/UI PRs unless labelled.
- **JKKN terminology gate** catches "staff"/"faculty" mismatches in prose AND commit bodies — pre-swap.
- **Third-party form submissions require per-request permission each time** — DO NOT submit the Evolis SDK access form on Director's behalf even if prior session drafted persuasive text.
- **Non-negotiable production-code sweep** before any new build plan gets proposed: `git ls-tree jicate/main -r --name-only | grep -iE "(id.card|evolis|primacy|photo.url|template|print.queue)"` + `gh pr list --repo Jicate-Solutions/MyJKKN --state all --limit 30 --search "id card in:title"` + `git worktree list` (per project CLAUDE.md).
- **Local dev server / browser test:** if you need to CFT-verify the admin UI, run from a `jicate/main` worktree (not this omm-dev checkout — 720+ commits diverged, MISSING merged production features) using real `SUPABASE_SERVICE_ROLE_KEY` from `.env.production.local` (not the empty placeholder in `.env.local`).

KEY FILES TO READ FIRST:
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_evolis_python_bridge_locked.md — full decision context (language lock, host lock, install commands, license gotcha, "what NOT to redo" list)
- /Users/omm/PROJECTS/MyJKKN/progress.txt (top entry, session 5d42c851) — decomposition of Stream A + Stream B tasks with sub-steps
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_claude_code_web_remote_control_cft.md — paste-ready-prompt coordination pattern (adapt for Windows AI-Max instead of Linux Server; heed the 2026-06-08 scope correction)
- /Users/omm/PROJECTS/MyJKKN/CLAUDE.md — production-code-sweep-first rule, SQL file management, Supabase MCP workflow
- /Users/omm/.claude/CLAUDE.md — global rules incl. rule #2 (never mark done without testing), rule #10 (show proof), rule #22 (stay in scope), rule #23 (simplest first)

KEY DECISIONS MADE THIS SESSION (with rationale — do NOT relitigate):
- **Python (not Java) for bridge language.** Evolis SDK 3 supports C/C++, C#, Python, Java, Swift — Node.js NOT supported so MyJKKN's TypeScript stack can't be reused. Python fits team's mental model (dict/list/JSON ≈ TS, `pip install` ≈ `npm install`, ~50 LOC vs ~150 in Java, matches JKKN's broader Python AI portfolio). Locked after explicit side-by-side comparison — was NOT the anchored default, had to be re-justified.
- **Existing Windows AI-Max box (not a new Raspberry Pi) as bridge host.** Director revealed the box already exists on JKKN office LAN, always-on, Claude Code + Max already installed. Zero new hardware/cost/setup. Original Pi recommendation solved for "assume nothing exists" — the reveal eliminated that assumption.
- **Direct mode only (SDK-only), NOT Supervised mode with paid Evolis Premium Suite.** Director rejected the paid add-on as unnecessary for single-station deployment.
- **Do NOT submit the Evolis SDK access form on Director's behalf.** Third-party business-identifying form is exactly the class of action requiring per-request permission per rules. Draft persuasive text for Director to paste and submit.
- **Phase 0 (cardPresso/ID-ALL CSV export button on /admin/students) DEFERRED.** Director prioritized Phase 1 substrate merge + Phase 1.5 bridge install over the ~2-3 hour manual stopgap. Available as fallback if bridge takes multiple sessions.

APPROACH: Two-stream parallel execution.
- **Stream A** (Mac Claude solo): PR merge-cleanness check → migration plain-English approval → apply → merge 762→764→763. Fully within this Claude session.
- **Stream B** (Mac Claude ↔ Windows Claude via Director paste-shuttle): compose paste block → wait for Director to paste back Windows Claude's output → compose next block → iterate until bridge is green. Each block ~30 sec paste hop.
- Both streams progress independently — Stream B's Python check + `pip install` can run in Director's browser tab while Stream A does the merge-tree checks locally.

QUALITY BAR:
- **Stream A "done"** = all 3 PRs merged into `main`, migration applied to prod (verified via Supabase MCP `execute_sql` post-apply row-state check + `list_tables` showing `id_card_templates` + `id_card_print_jobs`), MyJKKN admin UI reachable at /admin/id-cards/policy / /template / /print-queue on jkkn.ai (CFT-verified against a jicate/main worktree, not omm-dev checkout).
- **Stream B "done"** = `evolis_bridge.py` running as Windows Service on the JKKN AI-Max box, Director sends a real print job from admin UI → physical card ejects from Primacy 2 within ~15 seconds → print-queue badge flips grey → yellow → green within 20 seconds.

DO NOT:
- DO NOT commit the pre-existing dirty tree on `feat/campus-living-fee-compute-engine` — those M/?? files belong to OTHER panes, not this session.
- DO NOT try to execute Claude Code commands ON the Windows AI-Max box from this Mac session — coordination is Director paste-shuttle only.
- DO NOT re-propose Raspberry Pi or Evolis Premium Suite — both decisively rejected.
- DO NOT re-litigate Python-vs-Java — locked in memory.
- DO NOT route this bridge work to the Linux Server Claude at 172.20.15.150 — that machine is scoped for PMS/monorepo only.
- DO NOT auto-merge any PR — Director must click merge (rules).
- DO NOT submit the Evolis SDK access form on Director's behalf — draft text, Director submits.
- DO NOT propose bare `/compact`; always specify what to keep/drop.
- DO NOT skip the TIER-1 plain-English migration explanation before applying #762 to prod.

VERIFY BY (post-execution):
- Stream A: `mcp__supabase__list_tables` includes `id_card_templates` + `id_card_print_jobs`; `execute_sql "SELECT count(*) FROM platform_policies WHERE policy_key LIKE 'id_card.%'"` returns 11; browser CFT (via jicate/main worktree, PORT=3104 with real service-role key) verifies /admin/id-cards/policy renders; production URL https://www.jkkn.ai/admin/id-cards/policy verified live after Vercel deploy.
- Stream B: `pip show Evolis-SDK` reports 9.4.1 on Windows box; `nssm status EvolisBridge` returns SERVICE_RUNNING; send test print from admin UI → observe physical card eject → print-queue badge flips through pending→printing→printed within 20 seconds.
