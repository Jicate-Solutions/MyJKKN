# MyJKKN AI Max-Lane — Box Setup & Recovery Runbook
_Last updated: 2026-07-24. Keep this short and recovery-focused._

## What this box does
The AI-Max Windows box (folder `~/jkkn-max-lane`, i.e. `C:\Users\Admin\jkkn-max-lane`)
runs the ₹0 AI **drains** (background processes) that power MyJKKN's AI features off a
single Claude Max subscription. This doc = how it's wired + how to fix it if it breaks.

## The drains (Windows Scheduled Tasks, start at logon)
| Task name | Script | Powers |
|---|---|---|
| `ai.jkkn.maxlane.ai-chat` | `ai-chat-drain.mjs` | the live **AI Assistant** (per-user chat) |
| `ai.jkkn.maxlane.ai-jobs` | `ai-jobs-drain.mjs` | **all other AI features** (summaries, translate, grading, etc.) |
| _poller_ (separate 2-min task) | `poller.mjs` | **AI routines** ("Run on Max": scf, induction, …) |
| `ai.jkkn.maxlane.ai-query-chat` | _(legacy)_ | **RETIRED / DISABLED** — old "Ask on Max", superseded. Do not re-enable. |

## Why it stays always-on (the 2026-07-24 setup)
1. **Drains loop forever** — the 55-second self-exit was removed; `ai-jobs` also had its
   single-flight lock removed and now runs `fn_ai_requeue_stale` each loop.
2. **Task settings** (settings only; action + triggers untouched):
   `ExecutionTimeLimit = PT0S` (no timer kill), `RestartCount 3 / RestartInterval 1 min`,
   `MultipleInstances = IgnoreNew`. → one forever process; if it dies, the 1-minute repeat
   trigger relaunches it within ~1 min.
3. **Auto-login** (Sysinternals Autologon) → the box logs itself in as `Admin` after any
   reboot → the logon-triggered tasks fire → drains come back with nobody there. Reboot-proof.
4. **Windows Update** set to _never auto-reboot_ (`NoAutoRebootWithLoggedOnUsers = 1`) —
   updates install but wait for a manual restart, so nothing interrupts the drains.
5. **Cloud complement** — MyJKKN PR #2324: the `/api/cron/ai-tasks-sweep` cron (every 15 min)
   auto-requeues any job stuck >10 min (interactive chats excluded), so a job orphaned by a
   dead drain self-recovers even before the drain restarts.

## Health checks
- **Heartbeats (from anywhere with DB access):** `maxlane:chat-drain` and
  `maxlane:poller-heartbeat` rows in `ai_routine_schedules` should refresh every few seconds.
  Stale = that drain is down.
- **On the box (PowerShell):**
  - Uptime: `(Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime`
  - Drains running: `Get-Process node`
  - Claude login OK: `claude -p "say ok"` → returns `OK`
- **End-to-end:** enqueue a `demo.ping` job (`status='pending'`, `lane='max'`) → should reach
  `done` in ~8 s.

## Recovery — common problems
- **"AI Assistant is offline":** the chat drain died. It self-restarts within ~1 min; to force
  it: `Start-ScheduledTask -TaskName "ai.jkkn.maxlane.ai-chat"`. If it won't answer, check
  `claude -p "say ok"` (auth) — if it asks you to log in, re-login as `Admin`.
- **Nothing draining at all:** `Get-Process node` (are the drains running?) → restart both tasks;
  check `claude -p "say ok"`.
- **After a reboot the box sits at a LOGIN SCREEN (not the desktop):** auto-login broke. Re-run
  **Autologon** (`https://live.sysinternals.com/Autologon.exe`) as `Admin`, re-enter the password,
  click Enable. (Log in manually first so the drains come up while you fix it.)
- **Max subscription rate-limited:** the drain waits for the usage window to reset (₹0). Nothing
  to fix — it resumes automatically.

## What NOT to do
- **Don't install a Windows service by self-elevating / UAC-bypass** — it's blocked for good
  reason and buys nothing here (the tasks + auto-login already give always-on). A real service is
  fine ONLY if a human runs it from an elevated prompt, and even then it adds nothing on this box.
- **Don't undo the forever-loop / lock-free drain edits** — that re-breaks always-on.
- **Don't re-enable `ai.jkkn.maxlane.ai-query-chat`** — the live chat drain refuses to run
  alongside it, so it can block the Assistant.

## Key facts
- **Box user:** `BIOMETRIC\Admin` (local administrator). Holds the Claude Max login in
  `C:\Users\Admin\.claude\.credentials.json` (plaintext token) — this is why the drains must run
  as `Admin` (they do, via the auto-logged-in session).
- **Access:** Chrome Remote Desktop (unattended / PIN).
- **DB:** Supabase prod `kvizhngldtiuufknvehv` — heartbeats in `ai_routine_schedules`, jobs in `ai_jobs`.
- **Only unrecoverable state:** the machine powered off and left off. Everything else self-heals.
