# CONTINUATION BRIEF — Build the AI Pulse "Domain Starter" as a SELF-IMPROVING LOOP

## TASK (P0): Build department-wise AI-Pulse starter prompts as a self-improving loop

**Director's verbatim directive (2026-07-19):** when asked champion-approve vs auto-publish, the Director pushed back — **"why cant this be part of the self improving loop??"** and chose **auto-publish**. So this is NOT a manually-gated per-dept prompt — it is a *self-improving loop*.

**Locked spec (from interview, verbatim intent):**
- **Auto-publish, no human gate** — quality comes from the LOOP, not a champion. Mirror SCF's self-improving pattern: generate → publish → MEASURE how it landed (learner usage/engagement) → refine next cycle's prompt automatically.
- **Per subject/discipline** granularity (finer than per-department).
- Learners see it **BOTH** on **My AI Pulse** (pre-filled for their subject) **AND** as a **notification** each cycle.

Goal: each AI Pulse cycle, AI-Max (₹0) generates a copy-paste starter prompt per subject/discipline, auto-publishes to learners (page + notification), then measures whether it was used/helped and improves next cycle's prompt — a self-improving per-discipline prompt loop.

## VERIFIED GROUND TRUTH (this session, 2026-07-17→19)
- **No Domain Starter feature exists in prod.** No per-dept/discipline prompts table, no AI job type, no code surface, 0 notifications sent. Designed & parked, never built.
- **`ss_prompts` table EXISTS but is EMPTY (0 rows).** Columns: `id, cycle_id, generated_prompt, user_edited_prompt, final_prompt, copied_at, created_at, updated_at`. A half-started scaffold — right shape (AI-gen → user-edit → final → copied) but keyed by **cycle_id only, NO department/discipline dimension**. DECIDE: extend ss_prompts (add discipline/dept dims + measurement cols) vs new table.
- **AI-Max ₹0 lane is live** (`ai_job_types` + `ai_jobs`, auth.uid()-gated, Windows 1-min drain). Use it for generation at ₹0. Memory: `project_ai_jobs_registry_lane`, `project_max_lane_runners`. Note: `ai_job_types` PK column is `job_type` (NOT `id`/`job_type_key`). Only AI-Pulse AI job today = `ai_pulse.anomaly_detection`.
- **SCF self-improving loop = the proven pattern to mirror.** Prod primitives (in `supabase/migrations/`, documented in `supabase/SQL_FILE_INDEX.md`): `fn_scf_ai_signal` (HAVING count>=3 floor), `fn_scf_record_suggestion` → `scf_ai_suggestions`, `fn_scf_measure_suggestion_outcomes` + `fn_scf_prior_suggestion` (baseline→outcome lift), `social_loop_playbook` (durable cross-cycle memory Read→Decide→Act→Learn).
- **AI Pulse wiring:** cycle = `ai_pulse_live_attendance.event_id`. Learner→department via `profiles.department_id` / `learners_profiles`. My AI Pulse page = `app/(routes)/ai-pulse/my-pulse/page.tsx`. ~79 active departments.

## KEY DECISIONS (rationale)
- **Auto-publish + self-improving, NOT champion-gated** — Director wants the loop to BE the quality mechanism (mirror SCF). Avoids a ~79-dept manual-approval bottleneck each cycle.
- **Per subject/discipline** — Director chose finer granularity for relevance; cost isn't a constraint (AI-Max ₹0).
- **Both page + notification** — maximize discoverability.
- **RECONCILE with the parked feedback-loop spec** — an earlier ultracode fleet produced `specs/ai-pulse/aipulse-feedback-loop-spec.md` (an AI Pulse self-improving feedback loop). This Domain Starter loop OVERLAPS it. Read that spec FIRST and reconcile — do NOT build two parallel AI-Pulse self-improving loops. There is also an even-earlier parked "Domain Starter" 4-PR spec (rode `output_target='job.result'` + collect-sweep, mirroring `scf.learner_notes`) referenced in prior history.

## PENDING (carry forward — NOT part of the Domain Starter build, but OPEN)
1. **HOD roles NOT assigned (still 0 done after 2 days).** 14 real HODs still lack the `hod` role in Role Management, incl. **hodpharmacypractice** (Dr. Venkateswaramurthy N, Pharmacy Practice — the originally-reported bug). Director chose "team does it in RM" but nothing moved; I offered to assign all 14 via one SQL (show-first + go) — **AWAITING GO**. Full list: hodaids, hodcommunityhealth, hoddentalpharmacology, hodmedicalsurgical, hodobg, hodoralmedicine, hodpeadodontics, hodpharmaceuticalanalysis, hodpharmaceutics, hodpharmachemistry, hodpharmacypractice, hodprosthodontics, hodpublichealthdentistry, hodviscom. Skip junk `hodasdasdasda`. Memory: `reference_hod_mechanism_is_hod_role_not_dept_head_field`.
2. **PR #2144 (AI Pulse tab-hiding + "My AI Pulse" tab label) MERGED but NOT DEPLOYED.** Merge commit `ebba1c811` in main; latest prod build predates it. **Deploy go pending** — fire the Vercel deploy hook (`/deploy-myjkkn`) when Director says go.
3. **AI Pulse feedback-loop spec PARKED.** `specs/ai-pulse/aipulse-feedback-loop-spec.md` (531 lines, fleet wf_561a83e8). Critic verdict `loop_closes=FALSE`: blocker = decide-handoff dead-ends; measurement is correlation-theatre; senior-learner close-back dropped; privacy floor too low. Awaiting Director build-or-park go. (Overlaps the Domain Starter loop — reconcile.)

## HOW TO BUILD (ship discipline — MyJKKN)
- Ship via worktree PR off `jicate/main` (NEVER push omm-dev). `git fetch jicate main && git worktree add .claude/worktrees/<name> -b <branch> jicate/main`.
- New RPCs: `SECURITY DEFINER` + `SET search_path=public` + `REVOKE EXECUTE FROM anon, PUBLIC` + `GRANT authenticated`. Show-SQL-first for any prod DB apply (token `~/.supabase/access-token`, UA `MyJKKN-Director-CLI/1.0`).
- PR-scoped typecheck via `tsconfig.scoped.json`. Terminology CI gate false-positives on permission-key identifier segments (e.g. `aiPulse:lab.score`) — dodge with a concat so the segment sits after a quote.
- Governance: PR-open, merge, deploy are each SEPARATE Director gos on the PUBLIC repo Jicate-Solutions/MyJKKN.
- Auto-save hook wip-commits in worktrees — soft-reset/squash before push. **NEVER `git reset --soft/hard jicate/main`** — main advances; reset to the branch FORK POINT commit instead (near-miss this session: reset --soft jicate/main staged a 201-file reversion; caught pre-push).

## FIRST STEPS (fresh session — do in order)
1. Run VERIFY CURRENT STATE (below) — reality-check before building.
2. Read `specs/ai-pulse/aipulse-feedback-loop-spec.md` + SCF loop entries in `supabase/SQL_FILE_INDEX.md` + `ss_prompts` shape. **Reconcile** the Domain Starter with the parked feedback loop — one loop, not two.
3. Scope the build (types → DB substrate w/ discipline dim + measurement → AI-Max generation cron → self-improve measure/refine → My AI Pulse surface + notification), present the PR chain, get the Director's go.

## VERIFY CURRENT STATE (run first, read-only)
```bash
cd /Users/omm/PROJECTS/MyJKKN
# 1. Is PR #2144 deployed yet? (merge=ebba1c811)
~/bin/gh pr view 2144 --repo Jicate-Solutions/MyJKKN --json state,mergeCommit --jq '{state,merge:.mergeCommit.oid[0:9]}'
vercel ls my-jkkn --scope jicate-solutions 2>/dev/null | grep Production | head -2
# 2. Did any HOD roles get assigned? (was 20/35; 14 real HODs missing)
TOKEN=$(cat ~/.supabase/access-token|tr -d ' \r\n'); Q="SELECT count(*) FILTER (WHERE EXISTS(SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id=ur.role_id WHERE ur.user_id=p.id AND cr.role_key='hod')) AS have_hod, count(*) AS total FROM profiles p WHERE p.email ILIKE 'hod%@jkkn.ac.in';"
curl -s -X POST "https://api.supabase.com/v1/projects/kvizhngldtiuufknvehv/database/query" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "User-Agent: MyJKKN-Director-CLI/1.0" -d "$(python3 -c "import json,sys;print(json.dumps({'query':sys.argv[1]}))" "$Q")"
# 3. Is ss_prompts still empty? (SELECT count(*) FROM ss_prompts)
```

**Reply `go` to execute this brief.** First action = VERIFY CURRENT STATE, then reconcile-with-feedback-loop-spec, then scope the self-improving Domain Starter build.
