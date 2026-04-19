# 🚨 Monday Morning Handoff — Exotel Emergency Action

**For:** Omm (MD, JKKN Institutions)
**Prepared:** 2026-04-20 01:30 IST
**Priority:** P0 — Admissions line has been dead for 8.5 days

---

## The 60-Second Situation Brief

Our audit on April 19 evening revealed two problems:

1. **Silent outbound bug** — when counselors tried CTC, caller ID was empty → Exotel used a +44 fallback → prospects ignored it as spam.
   **Status: FIXED.** PR #248 merged and deployed 2026-04-19 13:26 UTC. Code now forces a real Indian caller ID with a hardcoded safety net.

2. **The real crisis** — Exotel has sent ZERO webhooks to MyJKKN since April 11, 05:55 UTC. No inbound, no outbound, no heartbeat. The admissions line has been silent in our CRM for 8.5 days.
   **Status: NOT FIXED by code. Requires dashboard + billing investigation. This is Monday's top priority.**

---

## The Scoreboard

Paste this SQL into Supabase SQL editor anytime to see current state:

```sql
SELECT
  count(*) FILTER (WHERE created_at > (NOW() - INTERVAL '1 hour')) AS last_hour,
  count(*) FILTER (WHERE created_at > (NOW() - INTERVAL '1 day'))  AS last_24h,
  max(created_at) AS most_recent_call
FROM admission_call_logs;
```

**You're winning when:** `last_hour > 0` (even 1 call) after following the checklist below.
**You're still broken when:** `most_recent_call = 2026-04-11 05:55 UTC` (unchanged from current).

---

## Monday 8:00 AM — P0 Actions (DO FIRST, BEFORE STAND-UP)

### Action 1 — Rotate the leaked API token (15 min)
You pasted `EXOTEL_API_TOKEN` in chat yesterday. Rotate before anything else.

- [ ] Exotel Dashboard → Settings → API → Generate New Token → copy to 1Password
- [ ] Vercel → MyJKKN → Settings → Env Vars → edit `EXOTEL_API_TOKEN` → paste new → Save
- [ ] Redeploy (Vercel → Deployments → latest → Redeploy)
- [ ] Smoke test with curl (same as you did yesterday but with the new token)
- [ ] Only after new token confirmed working: Exotel Dashboard → revoke old token

### Action 2 — DIAGNOSE why Exotel stopped calling us April 11 (30 min, Ranjith + you)

**Ranjith's job (takes 20 min):**
- [ ] Login to Exotel → App Bazaar → open EVERY flow
- [ ] For each flow, screenshot the "Status Callback URL" field
- [ ] Compare expected URL: `https://www.jkkn.ai/api/webhooks/telephony?token=<NEW_TOKEN>`
- [ ] Report back with Google Sheet: `flow_name | actual_url | expected_url | match? (Y/N)`

**Your job (takes 10 min, parallel):**
- [ ] Exotel → Billing → Transaction History → look for failed auto-debit on April 10-11
- [ ] Exotel → Billing → Current Balance → ensure ≥ ₹5,000
- [ ] Exotel → Account Status → confirm "Active" (not "Suspended")
- [ ] Exotel → Call Analytics → Calls per Day → does the chart show calls for April 12-19?
  - **Chart shows 0 calls** → Exotel itself didn't receive calls (phone company or routing issue — call Exotel support)
  - **Chart shows calls** → Exotel received them but our webhook wasn't called (URL was removed from flows)

### Action 3 — Make a real test call (5 min, after Actions 1 + 2)
- [ ] From your personal mobile, dial `04446313503`
- [ ] Let it ring, then hang up after 3 seconds
- [ ] Wait 60 seconds
- [ ] Run the scoreboard SQL → does `last_hour` jump from 0 to 1?
  - **YES** → pipe restored ✅ → proceed to Monday 9:00 AM actions
  - **NO** → pipe still broken → escalate to Exotel support with error evidence

### Action 4 — Set `EXOTEL_CALLER_ID` env var (5 min, only AFTER Action 3 succeeds)
- [ ] Vercel → MyJKKN → Settings → Env Vars → Add New:
  - Key: `EXOTEL_CALLER_ID`
  - Value: `04446313503`
  - Envs: ☑ Production ☑ Preview ☑ Development
- [ ] Redeploy

---

## Monday 9:00 AM — Stand-Up Script (ONLY IF Action 3 succeeded)

**Do NOT send the "outbound is fixed" message to counselors until Action 3 confirms pipe is alive.** Sending it prematurely = loss of credibility with team + counselors clicking a button that silently fails.

### If Action 3 succeeded — send this:

```
📞 TELEPHONY UPDATE — MONDAY 9 AM

Over the weekend we discovered two issues:
1. Exotel had stopped delivering calls to MyJKKN for 8 days
   (fixed this morning by [restoring flow URL / topping up balance /
   whatever the actual cause was])
2. Outbound CTC showed a foreign caller ID (fixed by deploy overnight)

STARTING TODAY:

✅ PRIMARY: When you miss a call from a prospect, click "Call Lead"
   in MyJKKN. Your phone will ring. Pick up. Exotel bridges you.
   Prospect sees +91 044 4631 3503 (JKKN admission line).

✅ ALTERNATE: Call from your personal phone like always. IMMEDIATELY
   after, click "📞 I Just Called" on the lead page and log 30 seconds
   of outcome/notes.

🔒 THE RULE: If it isn't logged in MyJKKN, it didn't happen.
Daily target: 15 logged calls/counselor. I check weekly.

— Omm
```

### If Action 3 FAILED — send this instead:

```
TELEPHONY STATUS — MONDAY 9 AM

Our Exotel phone integration has been down since April 11. We're
diagnosing with Exotel support today. Until it's restored:

- Continue calling prospects from your personal phone (unchanged)
- IMMEDIATELY log every call in MyJKKN via "📞 I Just Called" on
  the lead page (takes 30 seconds, captures outcome/notes)
- Do NOT rely on the "Call Lead" button in MyJKKN yet — it will
  fail until Exotel is restored

I'll share an update by end of day today.

— Omm
```

---

## What Got Shipped in the Audit Session (Apr 19-20)

| PR # | Title | State | Impact |
|---|---|---|---|
| **#248** | fix(telephony): hard-fail on missing caller ID + wire agent-map resolver | **MERGED + DEPLOYED** | Prevents silent +44 fallback once Exotel pipe restored |

**Files touched:** 2 (`telephony-service.ts`, `exotel-agent-map.ts`)
**Lines changed:** +57 / -2
**Risk level:** Low (surgical, inbound path untouched)

---

## What's Queued for Future Sessions

| Fix | What | Why deferred | Spec |
|---|---|---|---|
| **Fix 3** | Add `call_source` column to distinguish exotel-vs-manual calls | Pointless until Exotel pipe restored (nothing to track) | `specs/call-source-column-thrash.md` |
| **Fix 4** | Fix CDR sync 400 error (multi-value Status filter) | Fix 3 and Fix 4 both depend on Exotel being live | (to be written) |
| **Fix 5** | Elevate LogCallDialog as primary UI action | Only meaningful if counselors can see real call data | (UI spec pending) |
| **Fix 6** | Intelligence pipeline — populate `analyze_job_id` | Requires Exotel pipe restored first | (debug spec pending) |
| **Fix 7** | Heartbeat URL config in Exotel dashboard | Staff task, not code | Action 2 covers this |

---

## Memory Updates from This Session

New memory files created:
- `memory/project_exotel_shadow_process.md` — +44 spam + manual-primary workflow
- `memory/project_exotel_silent_since_april_11.md` — 8.5-day pipe-severed finding (P0 for next session)
- `specs/call-source-column-thrash.md` — 14-question thrash draft for Fix 3
- `specs/exotel-monday-handoff.md` — this file

Next session: Claude will auto-load MEMORY.md which now references both Exotel project memories.

---

## Honest Session Retrospective

What went well:
- Full production-code sweep before proposing any plan (15+ files, 35+ PRs analyzed)
- End-to-end webhook simulation (4 curl tests vs live prod auth)
- PR #248 shipped clean: surgical 2-file diff, atomic commits, no scope creep
- Deferred Fix 3 properly through the `/myjkkn-chain` gate

What I should have caught faster:
- **The 8.5-day silence was visible in the very first query** but I focused on the +44 caller-ID narrative. If I had front-loaded the "why no calls for 8 days" question, we'd have saved 2 hours and your Monday would start with the right priority (Exotel dashboard/billing) instead of a code deploy that can't help until ops is fixed.

Lesson captured (added to `/myjkkn-chain` Active Lessons): *Before accepting a user's "it's broken" narrative, quantify WHEN it broke. Date-bounded failure signatures (like "last call 8 days ago") usually reveal a single-event root cause that a generic code audit will miss.*

---

## 🎯 Action Items in Single Checklist (print this)

```
MONDAY BEFORE STAND-UP:
  □ Action 1.1  Exotel → generate new API token, save to 1Password
  □ Action 1.2  Vercel → update EXOTEL_API_TOKEN → redeploy
  □ Action 1.3  Smoke test with curl (new token)
  □ Action 1.4  Revoke old token on Exotel
  □ Action 2.1  Ranjith: audit every Exotel flow URL → Google Sheet
  □ Action 2.2  You: check Exotel billing + account status + calls chart
  □ Action 3.1  Call 04446313503 from mobile → verify appears in MyJKKN within 60s

IF ACTION 3.1 SUCCEEDS:
  □ Action 4.1  Set EXOTEL_CALLER_ID=04446313503 on Vercel
  □ Action 4.2  Redeploy
  □ Action 5.1  Send "outbound is fixed" counselor message
  □ Action 5.2  Live demo at 9 AM stand-up

IF ACTION 3.1 FAILS:
  □ Escalate to Exotel support with error evidence from Ranjith's Sheet
  □ Send "status broken, log manual calls" counselor message instead
  □ Schedule follow-up for end of day
```
