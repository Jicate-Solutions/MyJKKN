# Continuation Brief — MyJKKN — "Land the 2 merged PRs live + unblock the dental Instagram integration"

> Auto-loaded after /clear. Reply **"go"** to execute. Self-contained; trust this brief + live checks over recall.

## 🎯 USER P0 (verbatim from interview — OVERRIDES any inference)
- **"1, 2 and 3"** = do ALL THREE: **(1)** merge+deploy the 2 PRs and verify them live, **(2)** unblock the Meta integration for the dental depts, **(3)** check the Meta side live FIRST (before acting on #2).
- **Drops:** "Nothing — keep it all."
- Natural order: #1 (PR deploy/verify) is an independent quick win; #3→#2 is a diagnostic→action chain (look at Meta live, then decide how to unblock).

## TASK
Two threads. THREAD A (code): PRs **#2035** (Insights-tab hang fix) and **#1864** (LinkedIn cert buttons on Learn + HR) are BOTH MERGED — confirm they actually deployed to prod and work, deploying if not. THREAD B (Meta/social): the 7 dental-department Instagram accounts are stuck read-only (`business_discovery`, no token) — nothing has integrated since Jul 13, blocked by a Meta "Business Account Not Allowed to Advertise" restriction. Look at the Meta side live (as the user, via browser) to decide whether the blocker is still the ad-restriction or just a missing MyJKKN sync, then help unblock (appeal / linking).

PROJECT: /Users/omm/PROJECTS/MyJKKN
DATABASE: Supabase ref `kvizhngldtiuufknvehv` (prod). Creds at `/Users/omm/PROJECTS/MyJKKN/.env.production.local` (use PATH, never paste keys). Mgmt API token at `~/.supabase/access-token` (you CAN apply/read prod SQL with it).
SPEC: LinkedIn cert go-live spec `/Users/omm/PROJECTS/MyJKKN/specs/linkedin-certificate-golive-2026-07-06.md`.
PROGRESS: /Users/omm/PROJECTS/MyJKKN/progress.txt (SHARED across panes — do not conflate other panes' entries).

## CURRENT STATE (as of 2026-07-22 ~17:15 IST)
- **#2035 MERGED** — Insights hang fix. Two `SECURITY DEFINER` RPCs (`fn_ig_insights_summary` / `fn_fb_insights_summary`) replace RLS-per-row offset loops; routes call them. Migration `20260713203000_social_insights_summary_rpcs.sql` **already applied to prod** (RPCs live, `anon` revoked, `authenticated` granted). Validated in rolled-back txns: IG 158ms / FB 25ms (was 40,000ms+ hang), data matches UI, **leakproof** (RPC visible-set = RLS visible-set for students 14/13/7 and admin 66/9). tsc clean.
- **#1864 MERGED** — LinkedIn "Add to Profile" on Learn certs (Learn = PDE cert, already on `/verify/`) + HR staff-training certs (external `certificate_url`). No migration. tsc+eslint clean. Feature DARK until certs issue.
- **Earlier this session, LIVE:** #1851 (cert Phase 1 — unified `/verify/[number]` resolver + grade-strip + cancellation + internship link fix; migration `20260706120000` applied) merged+deployed+live-verified.
- **Meta integration (read-only DB finding):** 66 IG accounts — 31 graph-integrated (token), **35 still `business_discovery`** (read-only). **0 new integrations since Jul 13** (last IG connect Jun 27; FB 9 pages, last Jun 9). The 7 dental depts (`jkkn_periodontics, jkkn_orthodontics, jkkn_prosthodontics, jkkn_oralmedicineandradiology, jkkn_oralandmaxillofacialsurge, jkkn_paediatrics, jkkn_aec_tech`) are ALL `business_discovery` / no token, unchanged since Jun 10. Blocked by the Jul 13 "Business Account Not Allowed to Advertise" wall.
- **Branch of the main checkout:** `feat/campus-living-fee-compute-engine` (NOT mine — carries other panes' uncommitted work; my work shipped via worktree PRs). Do NOT `git add -A` here.

## VERIFY CURRENT STATE (run BEFORE any work — state may have drifted overnight)
1. `gh pr view 2035 --repo Jicate-Solutions/MyJKKN --json state` and `gh pr view 1864 ... state` — expect MERGED (already were).
2. **Is #2035's code LIVE?** (main REBASES — verify by CONTENT not SHA): `git fetch jicate main && git show jicate/main:app/api/social/instagram/insights/summary/route.ts | grep -c "fn_ig_insights_summary"` → 1 = merged code in main. Then check the live deploy SHA via Vercel API (token in `~/Library/Application Support/com.vercel.cli/auth.json`, project `prj_yH37MwPX0aAAUXNjZX1YlOHoowRM`, team `team_NKABdbcCWNZRLX7PkHx27JU5`) and confirm the route is in the currently-aliased prod deploy.
3. **Meta DB status still stuck?** Mgmt API: `select username, metrics_source, (access_token is not null) has_token from ig_accounts where username like 'jkkn_%' and username in (...the 7 dental...);` — if any flipped to `graph`+token, someone linked them; update the plan.
- **If reality differs from this brief → STOP, report, do NOT execute the stale plan.**

## WHAT NEEDS TO HAPPEN
1. **THREAD A — verify the 2 merged PRs are live + working.** If #2035's route content is in main but NOT in the live deploy → deploy via `/deploy-myjkkn` (confirm with user first — outward). Then **CFT-verify the Insights tab**: open `https://www.jkkn.ai/admission/social/insights`, confirm the stat cards + Accounts table render in **<1s** (was skeletons-forever). Optionally spot-check #1864 (dark; button code present on Learn + HR training pages).
2. **THREAD B step 1 — check Meta live (do FIRST per user).** Via the in-app browser / claude-in-chrome AS the user: open Meta Business Suite for the "JKKN All Departments" portfolio (`business_id=208146911814983`) and/or the MyJKKN Dept Accounts page `https://www.jkkn.ai/admission/social/departments`. Determine: are the dental IG↔FB-page links present on Meta now? Is the "Business Account Not Allowed to Advertise" restriction still active (check `facebook.com/accountquality`)?
3. **THREAD B step 2 — unblock.** If the ad-restriction is still up → help the user submit the **appeal / business verification** at Account Quality (draft the appeal text; user submits). If links exist on Meta but MyJKKN shows read-only → trigger MyJKKN's "Discover Accounts"/sync so the 7 flip `business_discovery`→`graph`. Goal: the 7 dental depts get a token (integrated).

## CONSTRAINTS & RULES
- **Ship via PR only (Translator Pattern)** from a fresh `jicate/main` worktree; NEVER push `omm-dev`/the main checkout to `main`. Deploy ONLY via `/deploy-myjkkn`.
- **Merging a PR, firing a deploy = outward actions** — get an explicit user go-ahead THIS session before each; a prior "yes" does not carry.
- **PROHIBITED (user-only, never do):** entering Instagram/Meta **passwords or credentials**, granting asset **permissions** ("Full access / Everything ON"), clicking final Connect/Submit on Meta, submitting the Meta appeal. You DIAGNOSE and DRAFT; the user clicks.
- **Verify a merged PR is live by CONTENT not SHA** — prod `main` rebases (merge-base can be empty); use `git cat-file -e` / `git show jicate/main:path | grep`.
- The main checkout is a SHARED dirty tree — do not commit unrelated files.
- MyJKKN = Supabase `kvizhngldtiuufknvehv`; prod repo `Jicate-Solutions/MyJKKN` (remote `jicate`). Brand: JKKN green `#0b6d41`, LinkedIn blue `#0A66C2`. Absolute paths; env by PATH not key values.

## KEY FILES TO READ FIRST
- `/Users/omm/PROJECTS/MyJKKN/specs/linkedin-certificate-golive-2026-07-06.md` — cert go-live spec (all phases done; Phase 1 live, 2/3 merged).
- `~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_linkedin_community_api_app_submitted.md` — cert + LinkedIn state of truth.
- `~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/feedback_pending_endpoint_rls_per_row_offset_loop.md` — the Insights-fix pattern + leak-test method (why #2035 exists).
- Live files: `git show jicate/main:app/api/social/instagram/insights/summary/route.ts` and `.../facebook/...` (the RPC-calling routes); RPCs live in prod DB.

## KEY DECISIONS MADE THIS SESSION (with rationale)
- **Fixed the Insights hang with scope-replicated DEFINER RPCs, not just pagination tuning** — root cause was RLS-per-row over an offset loop (service-role EXPLAIN lied at 46ms; authenticated EXPLAIN showed 1s/page). DISTINCT ON in a DEFINER that resolves visible ids once = 158ms. Proved leakproof (RPC-set = RLS-set) before shipping.
- **Did NOT spawn a parallel worktree swarm** (user asked 3×) — each "batch" collapsed to one root cause / two mirror files sharing a migration; a swarm would have diverged the RPCs and collided the migration. Built directly. If the user genuinely wants the swarm, give it work that is actually independent.
- **Learn certs = PDE certs** (share `pde_certificates` + `/verify/`) so Phase 2 was button-only; **HR training certs = external URLs** (not JKKN `/verify/`) so the button points at the pasted `certificate_url`.
- **Meta check was read-only** — did NOT run any sync or touch Meta; the "not integrated" verdict is MyJKKN-side truth (business_discovery/no token), which can lag Meta if a link was just made.

## APPROACH
Sequential. VERIFY state first → THREAD A (deploy-check + CFT-verify Insights, confirm before deploy) → THREAD B (browser-check Meta live as user → draft appeal or trigger sync). Keep all three P0s in play; they're independent enough to interleave.

## QUALITY BAR
- Insights tab loads data (not skeletons) in <1s on live prod, CFT-verified.
- #1864 confirmed in the live deploy (dark is fine).
- Clear verdict on WHY the dental depts aren't integrated (ad-restriction vs missing sync) + a concrete next action (appeal drafted OR sync triggered).

## DO NOT
- Enter Meta/Instagram credentials or grant asset permissions or submit the Meta appeal — user-only.
- Push the main checkout to `main`; `git add -A` in the shared dirty tree.
- Merge/deploy without an explicit go-ahead this session.
- Claim a cert feature "works live" from a button render — both cert tables are 0 rows (DARK).

## VERIFY BY (post-execution)
- CFT screenshot of `/admission/social/insights` showing populated stat cards + Accounts table.
- `git show jicate/main:app/api/social/instagram/insights/summary/route.ts | grep fn_ig_insights_summary` = present, AND live deploy SHA contains it.
- DB re-check: dental depts' `metrics_source` (still `business_discovery` = not yet unblocked; `graph`+token = integrated).

---
*probe_verdict: not-run (session was verification-heavy — live DB/curl/git/CFT checks at every step, minimal recall reliance). Both PRs MERGED. Meta thread blocked on a user-only Meta appeal. Ship real changes only via worktree PR + `/deploy-myjkkn`.*
