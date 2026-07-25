# Windows Max-lane drain — restart checklist / paste-ready prompt

> Written 2026-07-15 (Mac session). The 07-15 memory claimed this file existed; it did not.
> Protocol (Director-locked): **restart → verify fresh job drains E2E → 24h watch → flip all 5 loops to ₹0.**

## Evidence at time of writing (from prod `ai_jobs`, Mac side)

| Plane | Claims as | Last claim (UTC) | Silent for |
|---|---|---|---|
| Generic ai-jobs drain | `windows` | **2026-07-13 03:02:56** | ~55 h |
| Chat drain | `Biometric-chat-<pid>-<rand>` | **2026-07-14 03:07:21** | ~31 h |

Both planes silent ⇒ the **box itself** is likely off/asleep, not just a stuck heartbeat.
(A stale `maxlane:poller-heartbeat` ALONE can lie — chat-drain freshness is the truer signal.
Here chat-drain is ALSO stale, so this is a real outage. See
`feedback_heartbeat_stale_can_be_false_poller_is_alive`.)

Queue state: **0 pending** (stale test jobs were canceled) → liveness must be probed with a
FRESH job, not backlog.

## Paste this into the Windows Claude Code session

```
The JKKN Max-lane estate on this box looks fully offline. Two independent signals from prod:

  - Generic ai-jobs drain (claims ai_jobs as claimed_by='windows'): LAST CLAIM 2026-07-13 03:02:56 UTC (~55h ago)
  - Chat drain (claims as Biometric-chat-<pid>-<rand>):             LAST CLAIM 2026-07-14 03:07:21 UTC (~31h ago)

Both planes silent at once, so this is probably the box/tasks — not a stuck heartbeat.
The ai_jobs queue is currently 0 pending (stale test jobs were canceled), so nothing is
backed up; I just need the drain claiming again.

Please:
1. Confirm the box is awake and the Max-lane estate is intact (~/jkkn-max-lane equivalent,
   manifest.mjs + engine.mjs + brains/ + poller.mjs present).
2. Check Task Scheduler for these and report each one's State + Last Run Time + Last Result:
     - ai.jkkn.maxlane.ai-jobs   (the generic drain — the one I most need back)
     - ai.jkkn.maxlane.poller    (every 2 min; writes maxlane:poller-heartbeat)
     - the chat drain task
     - the ai.jkkn.maxlane.* routine schedules
3. Look at the drain/poller logs for WHY it stopped (crash? disabled task? box slept? auth/env
   expiry? Claude CLI login expired?). Tell me the actual cause — don't just restart blindly,
   I want to know if it'll recur.
4. Restart the poller + the ai-jobs drain (+ chat drain).
5. Confirm it's alive: the heartbeat is beating again AND the drain claims a job. I'll enqueue
   a fresh test job from the Mac side the moment you say it's running.

Report back: cause + what you restarted + whether the heartbeat/chat-drain are fresh again.
```

## ✅ RESOLVED 2026-07-15 ~23:47 IST — root cause was STALE LOCK DIRS, not an outage

Windows session diagnosed + fixed. The box was awake the whole time, estate intact, every
Task Scheduler job firing on schedule (`Result 0x0`) — but **three orphaned single-flight lock
directories** wedged the runners:

| Lock dir | Orphaned by | Effect |
|---|---|---|
| `.ai-jobs-drain-lock` | 07-13 17:22 `^C` during dev | generic drain no-claimed for ~2 days |
| `.ai-query-chat-lock` | 07-14 12:07 reboot | legacy chat runner wedged |
| `.poller-lock` | 07-15 12:12 mid-run kill | ~5h dead heartbeat |

Mechanism: each runner does `mkdirSync(LOCK_DIR)` on start, `rmdir` only in `finally{}`. A hard
kill (Ctrl-C / reboot / scheduler timeout) skips `finally` → lock survives → every later tick
sees the lock and exits instantly (no claim, no log line). Symptom is indistinguishable from
"box asleep." The NEW `ai-chat-drain.mjs` was never affected (no lock dir) — its heartbeat was
fresh throughout, which is why chat-drain freshness read stale only on the LEGACY runner.

**Durable fix (not just cleared):** locks are now **self-healing** in `ai-jobs-drain.mjs`,
`poller.mjs`, `ai-query-chat.mjs` — on collision they reclaim a lock older than any real run
(15m drain / 45m poller / 10m legacy chat). A future hard-kill now costs ≤ one reclaim interval,
not an indefinite silent outage.

**E2E proof (Mac side, DB-verified — not relayed):**
- Windows seed `demo.ping 58db1947` → done, `claimed_by=windows`, ledger `claude_code / ₹0`.
- Mac-side probe `demo.ping 947a0db0` (status=pending→claimed@3s→done@9s), answer "OK — health
  check passed, ready to help.", ledger `provider=claude_code cost_inr=0 success=true` @17:46:34Z.
- Bonus: `scf.learner_notes` fired ×5 in the same window, all `claude_code / ₹0` (a real loop
  feature on Max at ₹0 — P1 evidence).

**⏱ 24h watch clock STARTED 2026-07-15 17:46 UTC (≈23:16 IST).** Flip the 5 loops after a clean
day → earliest **2026-07-16 ~23:16 IST**. The self-healing-lock fix means a re-wedge now
self-recovers, so the watch is de-risked (formality, not nail-biter).

## After the Director says "runner is back" (Mac side)

1. Enqueue a fresh probe — `attention_bar.assistant` works well (allow_rule=`authenticated`,
   lane=`max`, so any authenticated user can queue it and it exercises the GENERIC drain).
   `demo.ping` is `seat_owner` so it needs the seat-owner allowlist user (director b2bcb548…).
   Harness: `node scripts/persona-harness/enqueue-p1.mjs <email>`
2. Confirm status → `done` and the ledger row is provider=`claude_code` / cost_inr=0.
3. Only then **start the 24h watch clock**. Flip the 5 loops after a full day of clean claiming.
4. Remember the **flip-day trap**: migrations 160000/170000/180000/190000 seed 4 job types with
   `ON CONFLICT DO NOTHING`, but `20260714093000` already created carrier rows for those SAME
   names (enabled=false, prompt_template=NULL). Post-apply reconciliation per type is REQUIRED:
   `UPDATE ai_job_types SET prompt_template='{{prompt}}', tool_set='none', output_target='job.result',
    interactive=false, enabled=true WHERE job_type='<name>' AND prompt_template IS NULL;`
