# CONTINUATION BRIEF — AI Pulse "Domain Starter": go-live (verify now, live Thursday)

## TASK (P0) — Director's verbatim choice: "Verify now, go live Thursday"
The whole self-improving per-subject prompt loop is BUILT, MERGED to main, and DARK. Execute the go-live the Director chose:
1. **Deploy** main via `/deploy-myjkkn` (safe — everything stays dark; crons no-op + the learner read returns nothing while the kill switch is off). Verify the new endpoints exist (generation route was recovered in #2199).
2. **Flip ON** `ai_pulse_policies.domain_starter_enabled=true`, then **render My AI Pulse as ONE real learner** (persona-harness, prod) in one of the 13 generated subjects (e.g. a **BPHARM** learner) → confirm the "Your AI Starter" card shows, a real prompt renders, Copy + Report + the EN/தமிழ toggle behave. English shows; Tamil stays hidden (pending review).
3. **Flip OFF** again (`domain_starter_enabled=false`). The REAL go-live is **Thursday's fresh cycle**, fully automatic: generation cron Thu 09:00 UTC → notify at session start Thu 13:25 UTC → measure Sat. Nobody else sees it before then.

## WHAT'S DONE (this session 2026-07-19→20) — all verified on prod
- 6 PRs MERGED to main, ALL DARK: **#2185** engine (substrate+pack+generation cron) — *merged early, lost 3 commits, recovered via* **#2199**; **#2197** learner card; **#2196** admin Tamil-review; **#2194** notify cron; **#2195** vercel schedule + measure route.
- Prod DB: every migration applied dark (substrate, pack, prompt_template, refinements, helper reads, **read kill-switch gate 20260720093000**). Kill switch OFF.
- **Engine PROVEN ₹0 E2E** on cycle 07-16 (`f26e2732`): 13/13 subjects generated, real subject-specific bilingual packs; course-grain (Clinical Pharmacokinetics) sharper than programme (BPHARM). Tamil all `ta_review_status='pending'`.
- The 4 surfaces were built by parallel ultracode worktree agents; each diff was verified by hand (notify uses the real 2-row `notifications`+`user_notifications` insert w/ idempotency; vercel.json valid; card calls the right RPCs).

## KEY DECISIONS (rationale)
- **Grain = HYBRID course-else-programme** — Director insisted on course/subject; course only resolves for ~4% (learner→section→`class_session_lesson`; timetable JSONB carries no subject; `programme_id` NULL on profiles but 100% on `learners_profiles`). So resolver returns BOTH, read shows finest-available → tiny-course learners fall back to programme, never blank. Auto-heals to more course-grain as timetable data grows.
- **ONE spine** — "did it help" reads the LIVE per-dept `ai_pulse_cycle_outcomes` loop; NO parallel playbook. Parked `specs/ai-pulse/aipulse-feedback-loop-spec.md` stays parked. `ss_prompts`=Solutions Hub, untouched.
- **All 4 content modes** (Director "include all 4") = build/skill/career × EN+Tamil. Auto-publish English; **Tamil generated but HELD pending native review, no deadline** (non-Latin safety) — the read strips `ta` until approved.
- **No pre-publish AI check + a learner "Report" button** (Director) = human safety valve AFTER publish.
- **Kill switch gates the READ too** — else the 13 test-generated rows leak on deploy ([[feedback_dark_feature_killswitch_must_gate_reads]]).

## LOOSE ENDS (not blocking go-live)
1. Gate migration `20260720093000_ai_pulse_domain_starter_read_killswitch_gate.sql` is APPLIED to prod but NOT in main — land it (small PR off current main).
2. `/ai-pulse/admin/starter-tamil-review` has no sidebar entry (works by URL) — wire `lib/sidebarMenuLink.ts`.
3. A Tamil-literate reviewer must approve Tamil (via that admin page) before it shows to learners.
4. 7 HOD emails have NO account (can't role-fix) — need accounts created: hodchildhealth, hodconservative, hodmaths, hodmentalhealth, hodperiodontics, hodtamil, hodtfd.

## VERIFY CURRENT STATE (run first, read-only)
```bash
cd /Users/omm/PROJECTS/MyJKKN
# 1. kill switch still OFF? (must be)
TOKEN=$(cat ~/.supabase/access-token|tr -d ' \r\n')
curl -s -X POST "https://api.supabase.com/v1/projects/kvizhngldtiuufknvehv/database/query" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "User-Agent: MyJKKN-Director-CLI/1.0" -d '{"query":"SELECT value_jsonb FROM ai_pulse_policies WHERE config_key='"'"'domain_starter_enabled'"'"';"}'
# 2. generation route on main? (recovered via #2199)
git fetch jicate main 2>&1 | tail -1; git ls-tree jicate/main -r --name-only | grep "api/cron/aipulse-domain-starter/route.ts" && echo "GEN ROUTE ON MAIN"
# 3. 13 starters recorded for cycle 07-16, Tamil pending?
curl -s -X POST "https://api.supabase.com/v1/projects/kvizhngldtiuufknvehv/database/query" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "User-Agent: MyJKKN-Director-CLI/1.0" -d '{"query":"SELECT count(*) total, count(*) FILTER (WHERE ta_review_status='"'"'pending'"'"') ta_pending FROM ai_pulse_domain_starters WHERE cycle_id='"'"'f26e2732-a519-4986-91f8-8790b0d60ab0'"'"';"}'
# 4. was it already deployed? (latest prod build)
~/bin/gh pr list --repo Jicate-Solutions/MyJKKN --state merged --limit 3 --search "aipulse-starter in:title" --json number,title,mergedAt
```

## HOW TO (ship discipline)
- Flip switch = show-SQL-first then `UPDATE ai_pulse_policies SET value_jsonb='true' WHERE config_key='domain_starter_enabled';` (token `~/.supabase/access-token`, UA `MyJKKN-Director-CLI/1.0`). Flip back with `'false'`.
- Persona-render a real learner on prod = persona-harness (memory `feedback_admin_mint_persona_render_any_real_user`), PERSONA_VP_W for mobile. The card lives on My AI Pulse (`app/(routes)/ai-pulse/my-pulse`).
- Deploy = `/deploy-myjkkn` (fires Vercel hook from latest main, verifies endpoints). A "do-not-deploy hold" doesn't survive the next deploy of anything.
- Worktrees this session: `.claude/worktrees/aipulse-domain-starter` (stale base — the orphaned #2185 branch) + `.claude/worktrees/reland` (#2199, off current main). Both can be cleaned.

**Reply `go` to execute — VERIFY CURRENT STATE first, then deploy → flip → verify-as-learner → flip off.**
