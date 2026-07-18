TASK: Revive the AI runners (user P0, verbatim: "Revive the AI runners first") — diagnose and restore BOTH silent ai_jobs drain planes on the Windows box (batch drain + interactive chat drain, silent since ~06:40 IST 2026-07-17) and fix the Mac button-poller "fetch failed" loop. The AI briefing button (#2137, live) depends on this. Only after runners are proven alive: deploy #2140 (cluster scan + Groups tab) WHEN the Director gives a fresh explicit "deploy" — it is currently under an explicit hold.

PROJECT: /Users/omm/PROJECTS/MyJKKN
DATABASE: Supabase prod ref kvizhngldtiuufknvehv. Creds via env files only: /Users/omm/PROJECTS/MyJKKN/.env.production.local (real service-role key; values may carry a literal \n suffix — strip before curl) and /Users/omm/PROJECTS/MyJKKN/.env.local (service key EMPTY). Mgmt API token: /Users/omm/.supabase/access-token
SPEC: none; epic tracked in progress.txt + memory
PROGRESS: /Users/omm/PROJECTS/MyJKKN/progress.txt

CURRENT STATE (as of brief-write time, 2026-07-17 evening):
- Bug-triage epic shipped as 3 PRs in one day: #2136 duplicate machinery (MERGED+DEPLOYED+browser-verified), #2137 AI briefing card on ₹0 Max lane (MERGED+DEPLOYED+E2E-proven on BUG-005009: HTTP 200 in 145s, briefing persisted to metadata.ai_triage), #2140 nightly cluster scan + Groups tab + loop registration (MERGED but NOT DEPLOYED — Director's explicit hold: "but do not deploy").
- DB already live regardless of deploy: bug_reports.duplicate_of + widened status CHECK; bug.triage ai_job_type; bug_clusters + fn_bug_cluster_scan/fn_bug_cluster_list (first scan: 66 groups from 1,036 open bugs); loop_registry row 'bug-triage' (class intake, m/f gates OFF).
- INFRA (the P0): (1) BOTH ai_jobs drain planes silent ~10h — last claim by "Biometric-chat-4868-6cooi2" (interactive chat drain) at 01:10 UTC; batch drain (claimed_by "windows") also silent; a bug.triage job sat pending 120s+ unclaimed. (2) Mac button-poller /Users/omm/jkkn-max-lane/poller.mjs (launchd ai.jkkn.maxlane.poller, every 2 min) logged "[maxlane/poller] fetch failed" 121 times; it reads env from /Users/omm/PROJECTS/MyJKKN/.env.production.local. This is a SEPARATE plane from the ai_jobs drain. (3) A hand-cranked drain pass on this Mac (fn_ai_claim('max','mac-manual-verify-0717', true) → claude -p → fn_ai_complete) proved the pipeline works — the runners are the only broken piece. (4) Live fn_ai_claim has a 3rd param p_interactive boolean DEFAULT false; interactive job types (bug.triage, ai_query.chat) are ONLY claimable with p_interactive=true; repo migration 20260712183000 is STALE vs live.
- KNOWN PRIOR INCIDENT (2026-07-15): identical symptoms were an ORPHANED single-flight lock dir on the Windows box, NOT a dead box — tasks fired with Result 0x0 while every tick saw the lock and returned instantly. Full protocol in the memory file below.

VERIFY CURRENT STATE (run BEFORE any work — state may have drifted):
1. Last claim per plane via Mgmt API (read-only):
   curl -s -X POST "https://api.supabase.com/v1/projects/kvizhngldtiuufknvehv/database/query" -H "Authorization: Bearer $(cat /Users/omm/.supabase/access-token)" -H "Content-Type: application/json" -d '{"query":"SELECT CASE WHEN claimed_by ILIKE '\''%chat%'\'' THEN '\''interactive-chat'\'' WHEN claimed_by ILIKE '\''windows%'\'' THEN '\''batch'\'' ELSE '\''other'\'' END AS plane, max(claimed_at) AS last_claim, count(*) FILTER (WHERE status='\''pending'\'') AS pending FROM ai_jobs GROUP BY 1 ORDER BY 2 DESC NULLS LAST"}'
   → If last_claim is RECENT (minutes), the Windows drain revived on its own; the P0 collapses to the Mac poller + the held deploy.
2. tail -50 /Users/omm/jkkn-max-lane/logs/poller.log — still "fetch failed", or recovered?
3. gh pr view 2140 --repo Jicate-Solutions/MyJKKN --json state,mergedAt  AND  vercel ls (vercel writes to STDERR — capture 2>&1) — is prod build newer than the #2140 merge (i.e. did someone already deploy)?
- If reality differs from this brief → STOP, report to the Director, do NOT execute the stale plan.

WHAT NEEDS TO HAPPEN (in order):
1. [P0] Windows drain diagnosis — DB-side only (the box is REMOTE; this Mac session CANNOT restart it). Gather signals: last claims per plane (above), pending backlog by job_type, maxlane heartbeat vs chat-drain freshness (heartbeat alone LIES — see memory). Then surface findings to the Director with the stale-lock-vs-dead-box checklist: box awake? Task Scheduler jobs firing with Result 0x0 but zero log output = orphaned lock-dir signature; look for .ai-jobs-drain-lock / .poller-lock / .ai-query-chat-lock dirs + mtimes BEFORE restarting; durable fix = staleness-based reclaim (15m drain / 45m poller / 10m chat — per-runner, not global).
2. [P0] Mac poller fix — LOCAL, fixable now. Reproduce the fetch by hand with the exact env poller.mjs reads (check for stale creds and the literal \n suffix on .env.production.local values); fix, then launchctl kickstart ai.jkkn.maxlane.poller and watch one clean cycle in the log.
3. [P0] Prove revival: enqueue one fresh demo.ping (status='pending') and watch pending→claimed→done by a REAL runner (not hand-cranked), ledger row provider=claude_code cost_inr=0. For an interactive-type probe (bug.triage) remember claims need p_interactive=true.
4. [P1] Deploy #2140 ONLY on a fresh explicit "deploy" from the Director (/deploy-myjkkn), then live-verify the Groups tab on /admin/bug-reports and confirm ONE cluster group with the Director.
5. [P1] Superseded-but-open backlog: HR Recruitment Need Signal engine (TS + service + hooks) — archived brief /Users/omm/PROJECTS/MyJKKN/.claude/continuation-prompt.ce3e05e7.superseded-20260717.md.
6. [P2] Bug-triage m-gate measure (dup-confirmation rate + backlog shrink → flip loop to self_improving); repoint overnight-bugfix at biggest confirmed clusters (Mac-side script, not repo); ai-triage route 504 improvement (reuse completed job for same dedupe key instead of enqueuing fresh).

CONSTRAINTS & RULES:
- NEVER push omm-dev to main (diverged 720+ commits). Ship only via worktrees off jicate/main (/ship-myjkkn Translator Pattern).
- Deploy only via /deploy-myjkkn hook AFTER Director approval. The Director explicitly HELD the #2140 deploy — do not fire the hook without a fresh "deploy" instruction.
- DB changes: validate BEGIN..ROLLBACK on prod first, show SQL before applying; every new RPC must REVOKE EXECUTE FROM anon, PUBLIC.
- Auto-save hook creates "wip" commits in worktrees — git reset --soft before push.
- Full local tsc OOMs — use parse gate + CI TypeCheck (PR-scoped).
- Local dev/browser testing only from a jicate/main worktree, never the omm-dev checkout.

KEY FILES TO READ FIRST:
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/feedback_maxlane_drain_stale_lock_wedge_looks_like_dead_box.md — the prior identical incident + full diagnosis protocol; central to the P0.
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/feedback_heartbeat_stale_can_be_false_poller_is_alive.md — plane isolation; stale heartbeat is not proof of death; chat-drain freshness is truer.
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/feedback_live_db_defs_differ_from_repo_migration_files.md — pg_get_functiondef before touching claim/complete/enqueue; repo migrations stale.
- /Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_bug_triage_epic.md — full epic state incl. infra findings section.
- /Users/omm/jkkn-max-lane/poller.mjs + /Users/omm/jkkn-max-lane/logs/poller.log — the Mac plane to fix.
- /Users/omm/PROJECTS/MyJKKN/progress.txt — top session block "Bug-triage epic: 3 PRs shipped in one day" + its Next Session tasks.

KEY DECISIONS MADE THIS SESSION (with rationale):
- Deterministic pg_trgm clustering over AI clustering for the nightly scan — must work runner-independent while the Max lane is down. 14-day pair window + 0.55 threshold + 2..40 size cap because unwindowed validation produced a 140-member transitive mega-cluster.
- Hand-cranked one Mac drain pass (same seat, ₹0) to complete PR-2 E2E verification rather than wait for the Windows box.
- Registered the bug-triage loop as class 'intake' with m/f gates OFF (not self_improving) per moat-loop honesty discipline.
- Director explicitly chose "Revive the AI runners first" as next P0, over deploying #2140 or the HR work.
- probe_verdict: healthy-but-pivoted — the prior brief (HR engine) was superseded mid-session; task preserved as P1, archived at /Users/omm/PROJECTS/MyJKKN/.claude/continuation-prompt.ce3e05e7.superseded-20260717.md.

APPROACH: Sequential. (1) Read-only DB-side diagnosis of both drain planes; (2) fix the Mac poller locally; (3) surface Windows-box findings to the Director with the lock-dir checklist and WAIT for the Director to act on the box; (4) prove revival with a real-runner claim; (5) await Director word before the #2140 deploy; (6) then backlog.

QUALITY BAR: A fresh demo.ping (or bug.triage with p_interactive=true) enqueued and taken pending→claimed→done by a REAL runner at ₹0 (ledger provider=claude_code, cost_inr=0) proves revival. Mac poller log shows a successful cycle with no "fetch failed". #2140 deployed only after an explicit go, with the Groups tab verified live and one group confirmed with the Director.

DO NOT:
- DO NOT fire the deploy hook for #2140 without a fresh explicit "deploy" from the Director (they said "but do not deploy" on 2026-07-17 evening).
- DO NOT restart/modify anything on the Windows box remotely — surface findings; the box is the Director's to touch.
- DO NOT re-run auto-triage on reopened bugs; DO NOT auto-merge any MyJKKN PR (permanent rule).
- DO NOT trust repo migration files for live fn signatures — pg_get_functiondef on live prod first (fn_ai_claim already proven drifted).
- DO NOT trust the maxlane heartbeat alone as a liveness/death signal — cross-check chat-drain freshness and actual ai_jobs claims per plane.

VERIFY BY (post-execution):
- Mgmt API query (from VERIFY step 1) shows last_claim within minutes for BOTH planes and pending backlog draining toward 0.
- Ledger check: newest ai usage ledger row provider=claude_code, cost_inr=0 from the probe job.
- tail -20 /Users/omm/jkkn-max-lane/logs/poller.log → successful cycle lines, zero new "fetch failed".
- After a Director-approved deploy: vercel ls shows a Ready build newer than #2140's mergedAt; /admin/bug-reports Groups tab renders the 66-group scan live in the browser.
