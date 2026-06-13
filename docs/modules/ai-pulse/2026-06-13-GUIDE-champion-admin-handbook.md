# AI Pulse — Champion & Admin Handbook

**Audience:** AI Pulse Champions, co-Champions, module admins, HODs, faculty scorers.
**Last updated:** 2026-06-13 (post CARE retrofit, PR #1356 + #1364).
**In-app copy:** the same instructions live at **/ai-pulse/admin/guide** inside MyJKKN.

---

## What AI Pulse is

A weekly institutional AI-literacy rhythm: every Thursday evening all colleges join one
live briefing on a featured AI tool, teams practice with it during the week on a stated
challenge, publish proof publicly, and faculty pick the best work each Monday. The
platform measures **engaged attendance** (not just presence) and turns the best work
into recognition and accreditation evidence.

## The weekly rhythm

| When | What happens | Who acts |
|---|---|---|
| **Daily, ~6:53 AM** | The system creates next Thursday's cycle automatically (an empty shell) | Nobody — automatic |
| **Friday, ~8:07 AM** | Teams are auto-drawn for the upcoming cycle ("everyone gets a turn" queue) | Nobody — automatic |
| **Before Thursday** | The Champion fills in the cycle (see checklist below) | **Champion** |
| **Thursday 6:40 PM** | Join button unlocks on the live page (15 min before start — policy-set) | Learners |
| **Thursday 6:55–7:30 PM** | Live session. Status flips to "live" automatically by the clock | Champion hosts; learners engage |
| **7:30–8:30 PM** | Quiz live window (60 minutes after session end) | Learners |
| **Until Saturday 7:30 PM** | Quiz async make-up window (48 hours, harder pass mark) | Learners who missed |
| **Saturday night / Sunday ~6:53 AM** | Every learner who passed all gates gets an automatic acknowledgment notification | Nobody — automatic |
| **Monday** | Offline Lab: faculty score submissions and pick Top-2 Gold per department | **Faculty scorers** |
| **After Lab** | Gold winners appear on every learner's My Pulse; Top-2 publish to department Instagram within 24h | Teams |

## The Champion's pre-Thursday checklist

All on **AI Pulse → Champion · Cycles → (this week's cycle)**:

1. **Featured tool** — pick from the 9-tool catalog (Lovable, Cursor, GitHub Copilot,
   Gemini, ChatGPT, Sora, n8n, Perplexity, Claude).
2. **Briefing topic** — one line for what the session covers.
3. **This week's challenge** — what teams must build and submit. Shown to every learner
   on My Pulse and judged by faculty on Monday. *Without it, Gold has no stated brief.*
4. **Meeting link** — paste the **Microsoft Teams** link (Teams preferred: 1000-participant
   capacity). Without it, the Join button still records attendance but opens nothing.
5. **Quiz** — author it at **Champion · Cycles → Quiz** (the ✨ AI-suggest button drafts
   questions from the topic). **If you forget, the week honestly reports 0% engaged** —
   that is by design, a Director decision (2026-06-12).
6. **You said, we changed** — read last week's anonymous learner feedback (bottom of the
   cycle page) and answer the main theme in one line. It shows on every learner's My Pulse.

## How a learner earns "engaged" (the 4-AND gate)

A learner counts as engaged only if **all four** pass:

1. **Joined on time** — pressed Join within the late threshold (policy, default 10 min).
2. **Polls** — responded to the required number. *Until the polls feature ships, no polls
   exist, so this gate auto-passes and says so on screen.*
3. **Stayed to the end** — the page heartbeats while open; a 5-minute tolerance absorbs
   timing. Learners must keep the live page open in a visible tab.
4. **Passed the quiz** — pass mark is policy-set (default 40% live window, 60% async).

The learner watches these four lights turn green live on their session page. The
**engaged-attendance rate** built from this gate is the Phase-2 pilot metric (≥70%).
Note: cycle #1 (2026-06-11) recorded no data because the capture path wasn't wired —
it does not count toward the verdict.

## Roles at a glance

- **Champion / co-Champion** — owns the checklist above, hosts Thursday, answers feedback.
- **Class Incharge** — marks per-team attendance, handles absence escalations.
- **Faculty scorers** (need `aiPulse:lab.score`) — Monday Lab: score each team, pick
  Top-2 Gold per department at **AI Pulse → Lab**.
- **HOD / Principal** — department compliance heatmap at **AI Pulse → Dept**.
- **Admins** — policies (session times, thresholds, doors-open window) at
  **Admin · Policies**; anomaly review at **Champion · Anomalies**.

## Things that work automatically (don't do these by hand)

- Cycle creation, team draws, status changes (draft → live → post-event follow the clock),
  engagement acknowledgments, the daily Director digest, anomaly scans, and (when the
  Director enables it) the PDE capability bridge.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Cycle not showing on My Pulse | Cycle missing `start_date` (only hand-made cycles) | Recreate via cron/console, or set start_date |
| Zero engagement despite attendance | Quiz never authored, or learners used a bare Meet link instead of the live page | Author quiz; share the **My Pulse → Open Live Session** path, never the raw meeting URL |
| Lab console empty on Monday | Teams are drawn Friday for the *upcoming* cycle | Expected for a cycle that had no draw before it |
| Join button locked | Before doors-open (6:40 PM) or after session end | Expected — policy `join_doors_open_minutes` |
| Learner says quiz won't open | Outside both windows (60 min live / 48 h async) | Expected; windows are policy-set |

## Where the numbers go

Engaged-attendance feeds the Director's daily digest and the dept heatmap; faculty Gold
picks feed NAAC evidence exports and (once enabled) the PDE Agency Index. Only
faculty-picked Gold carries score weight — self-reported metrics never do.
